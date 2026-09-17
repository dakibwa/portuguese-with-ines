export const LESSON_PRICE_CENTS = Number(
  process.env.NEXT_PUBLIC_LESSON_PRICE_CENTS ?? process.env.LESSON_PRICE_CENTS ?? 2500
);
export const LESSON_CURRENCY = process.env.LESSON_CURRENCY ?? "eur";
export const LESSON_DURATION_MINUTES = Number(process.env.NEXT_PUBLIC_LESSON_DURATION_MINUTES ?? 60);
export const SAME_DAY_RESCHEDULE_FEE_CENTS = Number(
  process.env.NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS ?? 500
);

/** Her teaching timezone. Every advertised time on the site is Porto time. */
export const BOOKING_TIME_ZONE = "Europe/Lisbon";

/** Used only while the API response is absent or from an older Worker. */
export const BOOKING_HORIZON_DAYS_FALLBACK = 56;

function normalizePublicHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";

    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * The booking API is the `ines-booking` Cloudflare Worker in `workers/booking/`.
 *
 * Square was removed in August 2026: Square does not onboard sellers in
 * Portugal, so the account the site pointed at could never have been hers. The
 * site now owns booking end to end rather than embedding a third party.
 */
export const BOOKING_API_BASE_URL = normalizePublicHttpUrl(process.env.NEXT_PUBLIC_BOOKING_API_BASE_URL ?? "");
export const BOOKING_CONFIGURED = Boolean(BOOKING_API_BASE_URL);

/**
 * Stripe's publishable key — public by design, it only identifies the account;
 * every sensitive operation needs the secret key, which lives in the Worker.
 * If an embedded card-setup session is active and this key is absent or in the
 * wrong mode, booking fails visibly before the student submits.
 */
export const STRIPE_PUBLISHABLE_KEY = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
export const STRIPE_EXPECTED_MODE = (process.env.NEXT_PUBLIC_STRIPE_EXPECTED_MODE ?? "").trim();
export const STRIPE_PUBLISHABLE_MODE = STRIPE_PUBLISHABLE_KEY.startsWith("pk_live_")
  ? "live"
  : STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_")
    ? "test"
    : "";
export const STRIPE_PUBLISHABLE_READY = Boolean(
  STRIPE_PUBLISHABLE_MODE && (!STRIPE_EXPECTED_MODE || STRIPE_PUBLISHABLE_MODE === STRIPE_EXPECTED_MODE)
);

/**
 * Google Sign-In client id. Public by design — it identifies the app, it is not
 * a secret, and the Worker still verifies every token against it.
 */
export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();

export const CONTACT_WHATSAPP_NUMBER = "+351 963 161 134";
export const CONTACT_WHATSAPP_URL = "https://wa.me/351963161134";
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

/**
 * Whole euros print bare ("€25"); anything else keeps its cents ("€22.50").
 * Rounding to whole euros showed a €22.50 private rate as "€23" on the button
 * that asks the student to agree to the price.
 */
export function formatMoney(cents = LESSON_PRICE_CENTS, currency = LESSON_CURRENCY) {
  const fraction = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction
  }).format(cents / 100);
}

/** The same-day change fee, which is also what a no-show costs. */
export const SAME_DAY_FEE_LABEL = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);

/**
 * Plain minutes, always. Rendering hours split the site against itself: the
 * lessons page said "60 minutes" while the booking card beside it said "1 hour"
 * for the same lesson, and "1 hour 30 minutes" was long enough to wrap its own
 * column on a phone. One unit compares at a glance and never wraps.
 */
export function formatLessonDuration(minutes = LESSON_DURATION_MINUTES) {
  return `${minutes} minutes`;
}
