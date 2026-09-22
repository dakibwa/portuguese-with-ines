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
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    let lateReady = false;
    let lateReads = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-09-14T10:00:00Z"));
    await page.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-meet-fixture"));
    await page.route("**/ines-booking*/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/me") return route.fulfill({ json: { student, bookings, series: [], sameDayFeeCents: 500 } });
      if (path === "/me/recurring-rates") return route.fulfill({ json: { rates: {} } });
      if (path === "/lesson-types") return route.fulfill({ json: { lessonTypes: [{ id: "single-60", name: "Single lesson", duration_minutes: 60, price_cents: 2500 }], postpay: false } });
      if (path === "/availability") return route.fulfill({ json: { slotsByDate: {}, horizonDays: 84 } });
      if (path.startsWith("/bookings/")) {
        const booking = bookings.find(entry => entry.manageToken === path.split("/")[2]);
        if (booking.reference === "LATE") lateReads++;
        const current = booking.reference === "LATE" && lateReady ? { ...booking, meetingUrl } : booking;
        return route.fulfill({ json: { booking: current, isPast: false, sameDayFeeApplies: false } });
      }
      errors.push(`Unexpected request: ${path}`);
      return route.abort();
    });
    await page.goto(`${base}/book/`);
    // The next lesson leads the calendar, with its Meet link one tap away.
    const upcoming = page.locator(".lesson-overview__next");
    await expect(upcoming.getByRole("link", { name: "Join Google Meet", exact: true })).toHaveCount(1);
    await expect(upcoming.getByRole("link", { name: "Join Google Meet", exact: true })).toHaveAttribute("href", meetingUrl);
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
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Google Meet links: online upcoming/details, automatic late arrival, Porto, cancelled, pending and unsafe URLs passed at desktop/mobile widths.");
} finally {
  await browser.close();
}
