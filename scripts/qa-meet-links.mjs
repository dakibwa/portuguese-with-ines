import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Every booking/account request is a fixture; this never creates a real room or lesson.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const browser = await chromium.launch({ headless: true });
const meetingUrl = "https://meet.google.com/abc-defg-hij";
const student = { id: "meet-preview", name: "Ana", email: "ana@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "student" };
const lessonType = { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
const cases = [
  { reference: "ONLINE", location: "online", status: "confirmed", meetingUrl },
  { reference: "PORTO", location: "porto", status: "confirmed", meetingUrl },
  { reference: "CANCELLED", location: "online", status: "cancelled", meetingUrl },
  { reference: "UNSAFE", location: "online", status: "confirmed", meetingUrl: "https://meet.google.com.example.invalid/abc-defg-hij" },
  { reference: "LATE", location: "online", status: "confirmed", meetingUrl: null },
  { reference: "PENDING", location: "online", status: "confirmed", meetingUrl: null },
];
const bookings = cases.map((entry, index) => ({
  ...entry, startAt: `2026-09-${String(15 + index).padStart(2, "0")}T14:00:00Z`,
  endAt: `2026-09-${String(15 + index).padStart(2, "0")}T15:00:00Z`,
  lessonType, isPast: false, sameDayFeeApplies: false, seriesId: null, manageToken: entry.reference,
  notes: "", studentName: student.name, studentEmail: student.email,
  studentTimezone: student.timezone, rescheduleCount: 0, sameDayFeeCents: 500,
}));
await mkdir("tmp/qa/meet", { recursive: true });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
    const errors = [];
    let lateReady = false;
    let lateReads = 0;
    let pending = bookings.find(entry => entry.reference === "PENDING"), pendingReads = 0, lateFee = false, cancelAttempts = 0;
    const oldPollStarted = deferred(), oldPollWaiting = deferred();
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-09-14T10:00:00Z"));
    await page.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-meet-fixture"));
    await page.route(url => /^\/(me(?:\/|$)|lesson-types$|availability$|bookings\/)/.test(url.pathname), async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/me/expressions") return route.fulfill({ json: { expression: null, canPick: false, hasPublished: false, shuffleLabels: [] } });
      if (path === "/me") return route.fulfill({ json: { student, bookings, series: [], sameDayFeeCents: 500 } });
      if (path === "/me/recurring-rates") return route.fulfill({ json: { rates: {} } });
      if (path === "/lesson-types") return route.fulfill({ json: { lessonTypes: [{ id: "single-60", name: "Single lesson", duration_minutes: 60, price_cents: 2500 }], postpay: false } });
      if (path === "/availability") return route.fulfill({ json: { slotsByDate: { "2026-09-18": [{ startAt: "2026-09-18T14:00:00Z", endAt: "2026-09-18T15:00:00Z" }] }, horizonDays: 84 } });
      if (path.startsWith("/bookings/")) {
        if (path === "/bookings/PENDING/reschedule") {
          const body = route.request().postDataJSON();
          assert.equal(body.expectedLateFeeCents, 0, "The move carries the accepted free-change quote");
          pending = { ...pending, startAt: body.startAt, endAt: "2026-09-18T15:00:00Z" };
          return route.fulfill({ json: { booking: pending, sameDayFeeApplied: false } });
        }
        if (path === "/bookings/PENDING/cancel") {
          const body = route.request().postDataJSON();
          assert.equal(body.expectedLateFeeCents, cancelAttempts ? 500 : 0, "Cancellation carries the fee the student just accepted");
          if (!cancelAttempts++) {
            lateFee = true;
            return route.fulfill({ status: 409, json: { error: "The change fee has changed. Please review it before confirming." } });
          }
          pending = { ...pending, status: "cancelled" };
          return route.fulfill({ json: { booking: pending, sameDayFeeApplied: true } });
        }
        const booking = bookings.find(entry => entry.manageToken === path.split("/")[2]);
        if (booking.reference === "PENDING") {
          const snapshot = pending;
          if (++pendingReads === 2) { oldPollStarted.resolve(); await oldPollWaiting.promise; }
          return route.fulfill({ json: { booking: snapshot, isPast: false, sameDayFeeApplies: lateFee } });
        }
        if (booking.reference === "LATE") lateReads++;
        const current = booking.reference === "LATE" && lateReady ? { ...booking, meetingUrl } : booking;
        return route.fulfill({ json: { booking: current, isPast: false, sameDayFeeApplies: false } });
      }
      errors.push(`Unexpected request: ${path}`);
      return route.abort();
    });
    await page.goto(`${base}/book/`);
    // On a phone the next lesson leads the calendar, with its Meet link one
    // tap away. Where a pointer can hover, the next lesson's day stands out
    // on the calendar instead and opens the lesson, whose Meet link is
    // checked below.
    const upcoming = page.locator(".lesson-overview__next");
    if (width < 700) {
      await expect(upcoming.getByRole("link", { name: "Join Google Meet", exact: true })).toHaveCount(1);
      await expect(upcoming.getByRole("link", { name: "Join Google Meet", exact: true })).toHaveAttribute("href", meetingUrl);
    } else {
      await expect(page.locator("#lesson-calendar .calendar-week button.is-next")).toHaveCount(1);
      await expect(upcoming).toBeHidden();
    }
    await page.locator(".lesson-overview").screenshot({ path: `tmp/qa/meet/upcoming-${width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`);
    for (const booking of bookings) {
      await page.goto(`${base}/book/?manage=${booking.manageToken}`);
      const dialog = page.getByRole("dialog").filter({ has: page.locator(".lesson-manage-dialog__lesson") });
      await expect(dialog).toBeVisible();
      const join = dialog.getByRole("link", { name: "Join Google Meet", exact: true });
      await expect(join).toHaveCount(booking.reference === "ONLINE" ? 1 : 0);
      if (booking.reference === "LATE") {
        const initialReads = lateReads;
        lateReady = true;
        await expect(join).toHaveAttribute("href", meetingUrl, { timeout: 15000 });
        assert.ok(lateReads > initialReads, "A missing link is refreshed without reloading the page");
      }
      if (booking.reference === "ONLINE") {
        await expect(join).toHaveAttribute("href", meetingUrl);
        await expect(join).toHaveAttribute("target", "_blank");
        await dialog.screenshot({ path: `tmp/qa/meet/details-${width}.png` });
      }
      if (booking.reference === "PENDING") {
        // Hold a missing-link poll across an accepted online move. Its older
        // booking snapshot must not put the lesson back on the original date.
        await oldPollStarted.promise;
        await dialog.getByRole("button", { name: "Change", exact: true }).click();
        const change = page.getByRole("dialog", { name: "Choose a new date and time", exact: true });
        await change.locator('button[data-date-key="2026-09-18"]').click();
        await change.getByRole("button", { name: "15:00", exact: true }).click();
        await change.getByRole("button", { name: "Change to 15:00", exact: true }).click();
        await expect(page.getByRole("dialog").locator(".lesson-manage-dialog__lesson")).toContainText("Friday, 18 September");
        const oldPollResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/bookings/PENDING");
        oldPollWaiting.resolve(); await oldPollResponse;
        await expect(page.getByRole("dialog").locator(".lesson-manage-dialog__lesson")).toContainText("Friday, 18 September");
        await page.getByRole("button", { name: "Close lesson management", exact: true }).click();
        await page.goto(`${base}/book/?manage=PENDING`);
        const currentDialog = page.getByRole("dialog");
        await currentDialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await currentDialog.getByRole("button", { name: "Yes, cancel it", exact: true }).click();
        await expect(currentDialog.getByRole("alert")).toContainText("change fee has changed");
        await expect(currentDialog.locator(".lesson-manage-dialog__decision")).toContainText("€5");
        await currentDialog.getByRole("button", { name: "Yes, cancel it", exact: true }).click();
        await expect(currentDialog.locator(".booking-outcome")).toContainText("cancelled");
        assert.equal(cancelAttempts, 2, "A changed quote needs a second confirmation");
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Google Meet links: online upcoming/details, automatic late arrival, Porto, cancelled, pending and unsafe URLs passed at desktop/mobile widths.");
} finally {
  await browser.close();
}
