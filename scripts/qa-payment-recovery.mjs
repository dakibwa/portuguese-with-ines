import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

// UI-only fixture: no accounts, bookings, provider sessions or charges created.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply the site URL explicitly.");
const browser = await chromium.launch({ headless: true });
mkdirSync("tmp/qa", { recursive: true });
for (const width of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/bookings/manage-recovery", (route) => route.fulfill({ json: {
    booking: { reference: "UI-RECOVERY", status: "cancelled", startAt: "2026-09-01T09:00:00.000Z", endAt: "2026-09-01T10:00:00.000Z",
      location: "online", studentName: "Isolated Test", studentEmail: "ui@example.invalid", studentTimezone: "Europe/Lisbon", notes: "", rescheduleCount: 0,
      sameDayFeeCents: 500, paymentStatus: "not_required", lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 1500 } },
    isPast: true, sameDayFeeApplies: false, paymentsDue: { lesson: null, sameDayFee: 500 }
  } }));
  await page.route("**/bookings/manage-recovery/payment", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "The secure payment link is not ready. Please refresh and try again shortly." } });
  });
  await page.goto(`${base}/book/?manage=manage-recovery`, { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: "Pay €5 securely", exact: true });
  await button.waitFor();
  assert.equal(requests.length, 0, "Opening management must not create a payment session");
  await button.click();
  await page.getByRole("alert").filter({ hasText: "secure payment link is not ready" }).waitFor();
  assert.deepEqual(requests, [{ purpose: "same-day-fee" }]);
  assert.equal(await button.isEnabled(), true, "Provider failure must leave an accessible retry button");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `tmp/qa/payment-recovery-${width}.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await page.close();
  // The emailed link is the key to its lesson: Change opens the times, never
  // a sign-in, for a student who is not signed in on this device.
  const signedOut = await browser.newPage({ viewport: { width, height: 1000 } });
  await signedOut.route("**/bookings/manage-upcoming", (route) => route.fulfill({ json: {
    booking: { reference: "UI-UPCOMING", status: "confirmed", startAt: "2099-09-10T16:00:00.000Z", endAt: "2099-09-10T17:00:00.000Z",
      location: "online", studentName: "Isolated Test", studentEmail: "ui@example.invalid", studentTimezone: "Europe/Lisbon", notes: "", rescheduleCount: 0,
      sameDayFeeCents: 500, paymentStatus: "scheduled", lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 } },
    isPast: false, sameDayFeeApplies: false, changeLocked: false
  } }));
  await signedOut.route("**/lesson-types", (route) => route.fulfill({ json: { lessonTypes: [{ id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 }], postpay: true } }));
  await signedOut.route("**/availability?**", (route) => route.fulfill({ json: { slotsByDate: {}, horizonDays: 56 } }));
  await signedOut.goto(`${base}/book/?manage=manage-upcoming`, { waitUntil: "domcontentloaded" });
  await signedOut.getByRole("button", { name: /^Change/ }).first().click();
  await signedOut.getByRole("heading", { name: "Choose a new date and time" }).waitFor();
  assert.equal(await signedOut.locator("#booking-lessons-sign-in").count(), 0, "A manage link must not ask for an account to change its lesson");
  await signedOut.close();
  const diary = await browser.newPage({ viewport: { width, height: 1000 } });
  await diary.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-teacher-fixture"));
  await diary.route("**/me/expressions", route => route.fulfill({ json: { expression: null, canPick: false, hasPublished: false, shuffleLabels: [] } }));
  await diary.route("**/me", (route) => route.fulfill({ json: {
    student: { id: "teacher", name: "Inês", email: "teacher@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "teacher" }, bookings: [], series: [], sameDayFeeCents: 500
  } }));
  await diary.route("**/admin/availability", (route) => route.fulfill({ json: { rules: [], exceptions: [] } }));
  await diary.route("**/admin/students", (route) => route.fulfill({ json: { students: [], cardsAccepted: false } }));
  await diary.route("**/admin/google-calendar", (route) => route.fulfill({ json: { configured: true, connected: true, email: "teacher@example.invalid", needsReconnect: true, pending: 0 } }));
  await diary.route("**/admin/bookings*", (route) => route.fulfill({ json: { bookings: [], manualPaymentReconciliation: [{ id: "isolated", reference: "REVIEW-123" }] } }));
  await diary.goto(`${base}/schedule/`, { waitUntil: "domcontentloaded" });
  // What waits on her is one list under her next lesson, not a notice above every tab.
  await diary.locator(".teacher-needs-you").filter({ hasText: "REVIEW-123" }).waitFor();
  const reconnect = diary.getByRole("button", { name: "Reconnect Google Meet" });
  await reconnect.waitFor();
  assert.equal(await diary.getByRole("link", { name: "Open in Stripe for REVIEW-123" }).getAttribute("href"), "https://dashboard.stripe.com/payments", "a row with no payment id opens Stripe's payments list");
  assert.equal(await diary.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await diary.screenshot({ path: `tmp/qa/payment-review-diary-${width}.png`, fullPage: true });
  await reconnect.click();
  assert.equal(await diary.getByRole("tab", { name: "Profile", exact: true }).getAttribute("aria-selected"), "true", "Reconnect opens Google Meet in Profile");
  await diary.close();
}
await browser.close();
console.log("Payment recovery UI passed at390/1440: cancelled-booking fee, no charge on open, explicit purpose, provider failure and accessible retry, and her payment to check and Google Meet reconnect listed in Needs you.");
