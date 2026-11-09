import { BOOT } from "./runtime";
export * from "../lib/config";
export const BOOKING_API_BASE_URL = BOOT.apiBase || "";
export const BOOKING_CONFIGURED = Boolean(BOOKING_API_BASE_URL);
export const STRIPE_PUBLISHABLE_KEY = BOOT.stripePublishableKey || "";
export const STRIPE_EXPECTED_MODE = BOOT.stripeMode || "test";
export const STRIPE_PUBLISHABLE_MODE = STRIPE_PUBLISHABLE_KEY.includes("_live_")
  ? "live"
  : "test";
export const STRIPE_PUBLISHABLE_READY =
  Boolean(STRIPE_PUBLISHABLE_KEY) &&
  STRIPE_PUBLISHABLE_MODE === STRIPE_EXPECTED_MODE;
export const GOOGLE_CLIENT_ID = BOOT.googleClientId || "";
