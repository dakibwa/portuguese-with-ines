/**
 * Stripe: Checkout Sessions and webhook verification.
 *
 * Stripe is used rather than Square because Square does not onboard sellers in
 * Portugal. Card setup is the only supported method because later lesson and
 * policy charges need a reusable off-session payment method.
 *
 * Only the REST API is used, no SDK: the official library is unnecessarily
 * heavy for the small set of calls this Worker makes.
 */

const API = "https://api.stripe.com/v1";
const API_VERSION = "2026-08-26.dahlia";
const INTEGRATION_IDENTIFIER = "portugues-com-a-ines-qjmrbzva";

function stripeHeaders(env, { contentType = false, idempotencyKey = "" } = {}) {
  return {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Stripe-Version": API_VERSION,
    ...(contentType ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
  };
}

const encoder = new TextEncoder();

/** Stripe's API is form-encoded, including nested keys like line_items[0][price_data][currency]. */
function formEncode(values, prefix = "") {
  const parts = [];

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;

    if (typeof value === "object") {
      parts.push(formEncode(value, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.filter(Boolean).join("&");
}

async function stripeRequest(env, path, body, { idempotencyKey = "" } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: stripeHeaders(env, { contentType: true, idempotencyKey }),
    body: formEncode(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `Stripe returned ${response.status}`);
    error.stripeStatus = response.status;
    error.stripeType = payload?.error?.type ?? "";
    throw error;
  }
  return payload;
}

/**
 * A timeout or Stripe server response is not proof that money did not move.
 * Retrying the same idempotency key is safe; opening a second payment path is
 * not. Ordinary 4xx responses are definitive and can use hosted recovery.
 */
export function stripeProblemIsRetryable(error) {
  const status = Number(error?.stripeStatus ?? 0);
  return error?.stripeType === "idempotency_error" || status === 0 || status === 409 || status === 429 || status >= 500;
}

async function stripeGet(env, path) {
  const response = await fetch(`${API}${path}`, {
    headers: stripeHeaders(env)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Stripe returned ${response.status}`);
  }
  return payload;
}

/** The payment intent behind a finished checkout — where the saved card lives. */
export function retrievePaymentIntent(env, paymentIntentId) {
  return stripeGet(env, `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
}

export function retrieveSetupIntent(env, setupIntentId) {
  return stripeGet(env, `/setup_intents/${encodeURIComponent(setupIntentId)}`);
}

export function retrieveCheckoutSession(env, sessionId) {
  return stripeGet(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

/** Stripe only expires an open session; one that completed first stays completed. */
export function expireCheckoutSession(env, sessionId) {
  return stripeRequest(env, `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
}

export function retrieveRefund(env, refundId) {
  return stripeGet(env, `/refunds/${encodeURIComponent(refundId)}`);
}

/**
 * Charge a saved card with nobody present — how a weekly lesson pays for
 * itself after its scheduled end. `off_session` tells Stripe to use the exemption
 * the student consented to at their first checkout; a decline throws, and the
 * caller emails a pay-now link instead of pretending it can't happen.
 */
export async function chargeSavedCard(
  env,
  { bookingId, purpose = "lesson", customer, paymentMethod, amountCents, description, metadata }
) {
  const intent = await stripeRequest(env, "/payment_intents", {
    amount: amountCents,
    currency: "eur",
    customer,
    payment_method: paymentMethod,
    payment_method_types: { 0: "card" },
    off_session: "true",
    confirm: "true",
    // This Worker has nobody present to complete 3DS. Ask Stripe to turn that
    // state into a failed attempt, then send the student through Checkout
    // rather than recording an unauthenticated PaymentIntent as paid.
    error_on_requires_action: "true",
    description,
    ...(metadata ? { metadata } : {})
  }, { idempotencyKey: `ines:charge:${bookingId}:${purpose}` });

  // `confirm=true` can still answer with a non-terminal PaymentIntent. Money
  // only moved when Stripe says `succeeded`; every other state follows the
  // ordinary payment-due recovery path.
  if (intent?.status !== "succeeded") {
    throw new Error(`Stripe payment did not succeed (${intent?.status ?? "unknown status"})`);
  }

  return intent;
}

/**
 * Checkout in setup mode authenticates and saves a card without taking money.
 * The later PaymentIntent is the actual lesson charge.
 */
export function createCardSetupSession(
  env,
  { booking, customer = null, customerEmail = "", successUrl, cancelUrl, seriesId = null, selectionCount = null, skippedStartAts = [] }
) {
  const skipped = JSON.stringify(skippedStartAts);
  return stripeRequest(
    env,
    "/checkout/sessions",
    {
      integration_identifier: INTEGRATION_IDENTIFIER,
      mode: "setup",
      currency: "eur",
      payment_method_types: { 0: "card" },
      client_reference_id: booking.id,
      ...(customer ? { customer } : { customer_creation: "always", customer_email: customerEmail }),
      setup_intent_data: {
        metadata: {
          booking_reference: booking.reference,
          ...(seriesId ? { series_id: seriesId } : {})
        }
      },
      ...uiModeFields(env, { successUrl, cancelUrl, forceHosted: false }),
      // Keep retry parameters identical. The database's 35-minute hold is
      // authoritative even though Stripe's default session lasts longer.
      metadata: {
        purpose: "card_setup",
        booking_reference: booking.reference,
        ...(selectionCount ? { selection_count: selectionCount } : {}),
        ...(seriesId ? { series_id: seriesId } : {}),
        ...(skippedStartAts.length && skipped.length <= 480 ? { skipped } : {})
      }
    },
    { idempotencyKey: `ines:setup:${booking.id}` }
  );
}

/**
 * Hosted vs embedded is env-driven (`STRIPE_UI_MODE=embedded`): embedded keeps
 * the student on the site — Stripe's payment form mounts inside the booking
 * page and the session answers with a client_secret instead of a redirect URL.
 * The webhook flow is identical either way. `forceHosted` is for sessions that
 * travel by email (a pay-now link after a declined charge), where only a URL
 * makes sense.
 */
function uiModeFields(env, { successUrl, cancelUrl, forceHosted }) {
  if (env.STRIPE_UI_MODE === "embedded" && !forceHosted) {
    // Stripe API 2026-08-26.dahlia renamed the create-session value from
    // `embedded` to `embedded_page`. Stripe.js still mounts the returned
    // client secret with initEmbeddedCheckout; this is only the REST value.
    return { ui_mode: "embedded_page", return_url: successUrl };
  }
  return { success_url: successUrl, cancel_url: cancelUrl };
}

/**
 * A Checkout Session for one lesson. `client_reference_id` carries the booking
 * id back on the webhook — the opaque id only, never a name, email or NIF,
 * because Stripe's own guidance warns that payment links turn up in unexpected
 * places. With `saveCard`, the session also creates
 * a Stripe Customer and keeps the card for later off-session charges — Stripe
 * shows its own consent wording on the form — which is how the first lesson of
 * a weekly run lets the rest charge themselves. `seriesId` rides in metadata so
 * the webhook confirms the whole run off this one payment.
 */
export function createCheckoutSession(
  env,
  {
    booking,
    lessonType,
    successUrl,
    cancelUrl,
    customerEmail,
    customer = null,
    saveCard = false,
    seriesId = null,
    forceHosted = false,
    checkoutPurpose = "initial",
    amountCents = null,
    productName = "",
    productDescription = "",
    skippedStartAts = [],
    recoveryGeneration = ""
  }
) {
  // The webhook rebuilds the run's confirmation email, and the "these weeks
  // were not free" note only survives to it through here. Metadata values cap
  // at 500 characters; a run that skips more than fits just drops the note.
  const skipped = JSON.stringify(skippedStartAts);
  return stripeRequest(env, "/checkout/sessions", {
    integration_identifier: INTEGRATION_IDENTIFIER,
    mode: "payment",
    payment_method_types: { 0: "card" },
    // Agreed lesson and policy amounts are in euros. Do not inherit the
    // Dashboard's optional currency-conversion offer and extra FX fee.
    adaptive_pricing: { enabled: false },
    client_reference_id: booking.id,
    ...(customer ? { customer } : { customer_email: customerEmail }),
    ...(saveCard ? { customer_creation: "always" } : {}),
    ...(saveCard
      ? {
          payment_intent_data: {
            setup_future_usage: "off_session"
          }
        }
      : {}),
    ...uiModeFields(env, { successUrl, cancelUrl, forceHosted }),
    // Stripe's default expiry keeps request parameters stable on retries.
    // A recovery session may only be replaced after Stripe reports expired.
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amountCents ?? lessonType.price_cents,
          product_data: {
            name: productName || lessonType.name,
            description:
              productDescription || `Portuguese lesson with Inês · ${lessonType.duration_minutes} minutes`
          }
        }
      }
    },
    metadata: {
      booking_reference: booking.reference,
      lesson_type: lessonType.id,
      purpose: checkoutPurpose,
      ...(seriesId ? { series_id: seriesId } : {}),
      ...(skippedStartAts.length && skipped.length <= 480 ? { skipped } : {})
    }
  }, { idempotencyKey: `ines:checkout:${booking.id}:${checkoutPurpose}${recoveryGeneration ? `:${recoveryGeneration}` : ""}` });
}

/**
 * Refund a payment, wholly or partly.
 *
 * `amountCents` allows a bounded refund when a lesson's policy calls for one;
 * omitting it refunds whatever remains refundable on that PaymentIntent.
 */
export function refundPayment(env, { bookingId, paymentIntent, amountCents }) {
  return stripeRequest(env, "/refunds", {
    payment_intent: paymentIntent,
    ...(amountCents ? { amount: amountCents } : {})
  }, { idempotencyKey: `ines:refund:${bookingId}` });
}

/**
 * Refuse to confirm a lesson from a merely authentic Stripe event: it must be
 * the exact Checkout Session created for this booking, for the exact EUR total,
 * and Stripe must say the money is paid. An authentic event for another product
 * in the same account is not authority to change this booking.
 */
export function checkoutSessionProblem(session, booking) {
  if (session?.payment_status !== "paid") return "payment is not paid";
  if (session?.mode !== "payment") return "session is not a one-time payment";
  if (String(session?.currency ?? "").toLowerCase() !== "eur") return "currency does not match";
  if (!Number.isSafeInteger(session?.amount_total) || session.amount_total !== booking?.amount_cents) {
    return "amount does not match";
  }
  if (!session?.id || session.id !== booking?.stripe_session_id) return "session does not match";
  if (!session?.payment_intent || typeof session.payment_intent !== "string") return "payment intent is missing";
  return "";
}

/** The setup webhook can only confirm the exact card-setup hold it belongs to. */
export function setupSessionProblem(session, booking) {
  if (session?.mode !== "setup") return "session is not a card setup";
  if (session?.status !== "complete") return "card setup is not complete";
  if (!session?.id || session.id !== booking?.stripe_session_id) return "session does not match";
  if (!session?.setup_intent || typeof session.setup_intent !== "string") return "setup intent is missing";
  if (!session?.customer || typeof session.customer !== "string") return "customer is missing";
  return "";
}

/**
 * Verifies the `Stripe-Signature` header.
 *
 * Without this anyone who finds the endpoint could mark bookings as paid, so it
 * is checked before the payload is trusted for anything at all. The timestamp
 * tolerance is what stops a captured request being replayed later.
 */
export async function verifyWebhook(payload, header, secret, toleranceSeconds = 300) {
  const pairs = String(header ?? "")
    .split(",")
    .map((piece) => {
      const separator = piece.indexOf("=");
      return separator < 0 ? null : [piece.slice(0, separator).trim(), piece.slice(separator + 1).trim()];
    })
    .filter(Boolean);

  const timestamp = Number(pairs.find(([name]) => name === "t")?.[1]);
  const provided = pairs.filter(([name, value]) => name === "v1" && value).map(([, value]) => value);
  if (!timestamp || provided.length === 0 || !secret) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return provided.some((candidate) => {
    if (candidate.length !== expected.length) return false;

    let mismatch = 0;
    for (let index = 0; index < expected.length; index += 1) {
      mismatch |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
    }
    return mismatch === 0;
  });
}

/** True when a live Stripe key is configured. Test keys work identically. */
export function stripeConfigured(env) {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function isTestMode(env) {
  return /^(?:sk|rk)_test_/.test(String(env.STRIPE_SECRET_KEY ?? ""));
}

export function stripeMode(env) {
  const key = String(env.STRIPE_SECRET_KEY ?? "");
  if (/^(?:sk|rk)_test_/.test(key)) return "test";
  if (/^(?:sk|rk)_live_/.test(key)) return "live";
  return stripeConfigured(env) ? "unknown" : "not-configured";
}

/**
 * A present key is not necessarily a safe key. Production spent a day with
 * sandbox secrets installed under the production names; without this check a
 * single D1 setting change would have opened a test checkout on the live site.
 */
export function stripeReady(env) {
  if (!stripeConfigured(env)) return false;
  const mode = stripeMode(env);
  const expected = String(env.STRIPE_EXPECTED_MODE ?? "").trim();
  return (mode === "test" || mode === "live") && (!expected || mode === expected);
}
