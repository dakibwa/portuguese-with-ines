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
  const diary = await browser.newPage({ viewport: { width, height: 1000 } });
  await diary.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-teacher-fixture"));
  await diary.route("**/me", (route) => route.fulfill({ json: {
    student: { id: "teacher", name: "Inês", email: "teacher@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "teacher" }, bookings: [], series: [], sameDayFeeCents: 500
  } }));
  await diary.route("**/admin/availability", (route) => route.fulfill({ json: { rules: [], exceptions: [] } }));
  await diary.route("**/admin/google-calendar", (route) => route.fulfill({ json: { configured: false, connected: false, needsReconnect: false, pending: 0 } }));
  await diary.route("**/admin/bookings*", (route) => route.fulfill({ json: { bookings: [], manualPaymentReconciliation: [{ id: "isolated", reference: "REVIEW-123" }] } }));
  await diary.goto(`${base}/schedule/`, { waitUntil: "domcontentloaded" });
  await diary.getByRole("status").filter({ hasText: "REVIEW-123" }).waitFor();
  await diary.getByText(/Review these in Stripe before retrying/).waitFor();
  assert.equal(await diary.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await diary.screenshot({ path: `tmp/qa/payment-review-diary-${width}.png`, fullPage: true });
  await diary.close();
}
await browser.close();
console.log("Payment recovery UI passed at390/1440: cancelled-booking fee, no charge on open, explicit purpose, provider failure and accessible retry.");
