import Stripe from "stripe";
import { json, problem, readText } from "./security.mjs";
import { verifyWebhook } from "../booking/stripe.mjs";

export const STRIPE_VERSION = "2026-10-28.endive";
export function stripeClient(env) {
  const key = env.VOWEL_STRIPE_SECRET_KEY || "";
  const mode = /^(?:rk|sk)_(test|live)_/.exec(key)?.[1];
  if (!mode || mode !== env.VOWEL_STRIPE_EXPECTED_MODE)
    throw problem(
      "Card payments are not configured yet. You can keep taking payment directly.",
      503,
    );
  return new Stripe(key, {
    apiVersion: STRIPE_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1,
    timeout: 15000,
  });
}
export async function connectAccount(env, site, user) {
  const stripe = stripeClient(env);
  return stripe.v2.core.accounts.create(
    {
      contact_email: user.email,
      display_name: site.brand || site.name,
      dashboard: "full",
      identity: { country: site.place.country.toLowerCase() },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
        customer: {},
      },
      defaults: {
        currency: site.place.currency.toLowerCase(),
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
      },
      metadata: { vowel_site: site.id },
      include: [
        "configuration.merchant",
        "configuration.customer",
        "requirements",
      ],
    },
    { idempotencyKey: `vowel:account:${site.id}` },
  );
}
export async function connectStatus(env, accountId) {
  if (!accountId) return { ready: false };
  const account = await stripeClient(env).v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "requirements"],
  });
  return {
    ready:
      account.configuration?.merchant?.capabilities?.card_payments?.status ===
      "active",
    account,
  };
}
export async function connectSession(env, account) {
  const session = await stripeClient(env).accountSessions.create({
    account,
    components: {
      account_onboarding: { enabled: true },
      notification_banner: { enabled: true },
      account_management: { enabled: true },
      payments: { enabled: true },
      payouts: { enabled: true },
    },
  });
  return {
    clientSecret: session.client_secret,
    publishableKey: env.VOWEL_STRIPE_PUBLISHABLE_KEY || "",
  };
}
export async function subscriptionCheckout(env, site, user, origin) {
  if (site.billing === "exempt")
    throw problem("Your site is free. No subscription is needed.", 409);
  if (!site.publishedAt)
    throw problem("Put your site live to begin your free trial.", 409);
  const stripe = stripeClient(env);
  if (
    site.stripeSubscription &&
    !["canceled", "cancelled", "incomplete_expired"].includes(site.billing)
  )
    throw problem(
      "You already have a subscription. Open billing to manage it.",
      409,
    );
  if (!site.stripeAccount)
    throw problem(
      "Open Get paid once to set up your Stripe account, then add your Vowel payment details.",
      409,
    );
  const session = await stripe.checkout.sessions.create(
    {
      // Save the card now, start billing at the original trial end. A checkout
      // opened on day 29 must neither charge early nor restart a 30-day trial.
      mode: "setup",
      customer_account: site.stripeAccount,
      currency: "eur",
      client_reference_id: site.id,
      setup_intent_data: {
        metadata: { vowel_site: site.id },
        usage: "off_session",
      },
      custom_text: {
        submit: {
          message: `Vowel costs €25 a month. Your first payment is due ${new Date(Math.max(Date.now(), site.trialEndsAt)).toLocaleDateString("en-GB", { timeZone: "UTC" })}. You can cancel in your dashboard before then.`,
        },
      },
      metadata: { vowel_site: site.id },
      success_url: `${origin}/dashboard/?billing=returned&site=${site.id}`,
      cancel_url: `${origin}/dashboard/?tab=billing&site=${site.id}`,
      integration_identifier: "vowel-subscription-zjqrmbva",
    },
    {
      idempotencyKey: `vowel:billing:${site.id}:${Math.floor(Date.now() / 1800000)}`,
    },
  );
  // No local entitlement changes here. Only a verified webhook can do that.
  return { url: session.url };
}
export async function startSubscription(directory, site) {
  if (site.billing === "cancelled") return;
  if (site.trialEndsAt > Date.now())
    throw problem("The free trial hasn't ended yet.", 409);
  const method = directory.one(
    "SELECT * FROM billing_methods WHERE site_id=?",
    site.id,
  );
  if (!method || !site.stripeAccount)
    throw problem("Add your Vowel payment details first.", 409);
  const stripe = stripeClient(directory.env);
  let product =
    directory.env.VOWEL_STRIPE_PRODUCT_ID ||
    directory.one(
      "SELECT value FROM platform_settings WHERE key='stripe_product'",
    )?.value;
  if (!product) {
    const products = await stripe.products.list({ active: true, limit: 100 });
    let found = products.data.find(
      (value) => value.metadata?.vowel_product === "monthly-platform",
    );
    if (!found)
      found = await stripe.products.create(
        {
          name: "Vowel",
          description:
            "Your teaching site, bookings and student tools. No lesson commission.",
          metadata: { vowel_product: "monthly-platform" },
        },
        { idempotencyKey: "vowel:product:monthly-platform" },
      );
    product = found.id;
    directory.rows(
      "INSERT OR REPLACE INTO platform_settings VALUES('stripe_product',?)",
      product,
    );
  }
  // Recover an ambiguous create before retrying it, including after eviction.
  const existing = await stripe.subscriptions.list({
    customer_account: site.stripeAccount,
    status: "all",
    limit: 100,
  });
  let subscription = existing.data.find(
    (item) =>
      item.metadata?.vowel_site === site.id &&
      !["canceled", "incomplete_expired"].includes(item.status),
  );
  return directory.ctx.blockConcurrencyWhile(async () => {
    if (
      directory.getSite(site.id)?.billing === "cancelled" ||
      !directory.one(
        "SELECT site_id FROM billing_methods WHERE site_id=?",
        site.id,
      )
    )
      return;
    if (!subscription)
      subscription = await stripe.subscriptions.create(
        {
          customer_account: site.stripeAccount,
          default_payment_method: method.payment_method,
          items: [
            {
              price_data: {
                currency: "eur",
                unit_amount: 2500,
                recurring: { interval: "month" },
                product,
              },
            },
          ],
          payment_behavior: "default_incomplete",
          metadata: { vowel_site: site.id },
        },
        {
          idempotencyKey: `vowel:subscription:${site.id}:${method.consent_at}`,
        },
      );
    directory.rows(
      "UPDATE sites SET stripe_subscription=?,billing=CASE WHEN billing IN ('active','exempt') THEN billing ELSE 'pending_confirmation' END WHERE id=?",
      subscription.id,
      site.id,
    );
  });
}
export async function billingPortal(env, site, origin) {
  if (!site.stripeAccount)
    throw problem("You haven't added Vowel billing details yet.", 409);
  const session = await stripeClient(env).billingPortal.sessions.create({
    customer_account: site.stripeAccount,
    return_url: `${origin}/dashboard/?site=${site.id}&tab=billing`,
  });
  return { url: session.url };
}
export async function handlePlatformWebhook(directory, request) {
  const env = directory.env;
  let raw;
  try {
    raw = await readText(request.clone(), 1048576);
  } catch {
    return json({ error: "Event is too large." }, 413);
  }
  if (
    raw.length > 1048576 ||
    !env.VOWEL_STRIPE_WEBHOOK_SECRET ||
    !(await verifyWebhook(
      raw,
      request.headers.get("Stripe-Signature"),
      env.VOWEL_STRIPE_WEBHOOK_SECRET,
    ))
  )
    return json({ error: "Invalid webhook signature." }, 400);
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid event." }, 400);
  }
  if (
    !event.id ||
    typeof event.type !== "string" ||
    event.livemode !== (env.VOWEL_STRIPE_EXPECTED_MODE === "live")
  )
    return json({ error: "Invalid event mode." }, 400);
  if (directory.one("SELECT id FROM stripe_events WHERE id=?", event.id))
    return json({ received: true });
  try {
    const object = event.data?.object || {};
    if (event.account && !event.type.startsWith("account.")) {
      const row = directory.one(
        "SELECT id FROM sites WHERE stripe_account=?",
        event.account,
      );
      if (!row) return json({ error: "Unknown connected account." }, 400);
      const site = directory.getSite(row.id);
      const response = await env.TUTOR_STORES.getByName(site.id).paymentEvent(
        request,
        site,
      );
      if (!response.ok) return response;
    } else if (
      event.type.startsWith("v2.core.account") ||
      event.type === "account.updated"
    ) {
      const accountId = event.related_object?.id || object.id;
      const row = directory.one(
        "SELECT id FROM sites WHERE stripe_account=?",
        accountId,
      );
      if (row) {
        const status = await connectStatus(env, accountId);
        const site = directory.getSite(row.id);
        site.stripeReady = status.ready;
        if (!status.ready) site.rules.paymentMode = "manual";
        site.version++;
        directory.save(site);
      }
    } else if (
      event.type === "checkout.session.completed" &&
      object.mode === "setup"
    ) {
      const session = await stripeClient(env).checkout.sessions.retrieve(
        object.id,
      );
      const site =
        session.metadata?.vowel_site &&
        directory.getSite(session.metadata.vowel_site);
      if (
        !site ||
        session.customer_account !== site.stripeAccount ||
        session.client_reference_id !== site.id ||
        session.status !== "complete" ||
        !session.setup_intent
      )
        return json({ error: "Card setup did not match the site." }, 400);
      const setup = await stripeClient(env).setupIntents.retrieve(
        session.setup_intent,
      );
      if (
        setup.status !== "succeeded" ||
        setup.customer_account !== site.stripeAccount ||
        setup.metadata?.vowel_site !== site.id ||
        !setup.payment_method
      )
        return json({ error: "Card setup is not confirmed." }, 409);
      const cancelledAt = Number(
        directory.one(
          "SELECT value FROM platform_settings WHERE key=?",
          `billing_cancelled:${site.id}`,
        )?.value || 0,
      );
      if (!session.created || session.created * 1000 <= cancelledAt)
        return json({ received: true });
      directory.rows(
        "INSERT OR REPLACE INTO billing_methods VALUES(?,?,?)",
        site.id,
        typeof setup.payment_method === "string"
          ? setup.payment_method
          : setup.payment_method.id,
        Date.now(),
      );
      directory.rows(
        "INSERT OR REPLACE INTO platform_settings VALUES(?,?)",
        `billing_renewal_cancelled:${site.id}`,
        "0",
      );
      directory.rows(
        "UPDATE sites SET stripe_subscription=CASE WHEN billing IN ('canceled','cancelled','incomplete_expired') THEN NULL ELSE stripe_subscription END,billing='scheduled' WHERE id=?",
        site.id,
      );
      await directory.scheduleJob(
        site.id,
        "subscription_start",
        Math.max(Date.now() + 1000, site.trialEndsAt),
        true,
      );
    } else if (
      [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
      ].includes(event.type)
    ) {
      const subscriptionId = event.type.startsWith("customer.subscription.")
        ? object.id
        : object.subscription ||
          object.parent?.subscription_details?.subscription;
      if (subscriptionId) {
        const subscription =
          await stripeClient(env).subscriptions.retrieve(subscriptionId);
        const siteId = subscription.metadata?.vowel_site;
        const site = siteId && directory.getSite(siteId);
        const account =
          typeof subscription.customer_account === "string"
            ? subscription.customer_account
            : subscription.customer_account?.id;
        if (!site || !site.stripeAccount || account !== site.stripeAccount)
          return json({ error: "Subscription did not match the site." }, 400);
        const method = directory.one(
          "SELECT consent_at FROM billing_methods WHERE site_id=?",
          site.id,
        );
        if (
          (site.stripeSubscription &&
            site.stripeSubscription !== subscription.id) ||
          (!site.stripeSubscription &&
            method &&
            subscription.created < Math.floor(method.consent_at / 1000))
        )
          return json({ received: true });
        directory.rows(
          "INSERT OR REPLACE INTO platform_settings VALUES(?,?)",
          `billing_renewal_cancelled:${site.id}`,
          subscription.cancel_at_period_end ? "1" : "0",
        );
        const state =
          subscription.status === "active"
            ? "active"
            : subscription.status === "trialing"
              ? "trialing"
              : subscription.status;
        directory.rows(
          "UPDATE sites SET stripe_subscription=?,billing=? WHERE id=?",
          subscription.id,
          state,
          site.id,
        );
      }
    }
    directory.rows(
      "INSERT OR IGNORE INTO stripe_events VALUES(?,?)",
      event.id,
      Date.now(),
    );
    return json({ received: true });
  } catch {
    return json({ error: "Event processing will be retried." }, 503);
  }
}
