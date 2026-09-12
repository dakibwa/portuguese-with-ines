import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Browser choices and request boundaries use isolated fixtures; the matching
// atomic SQL, signed webhooks and email grouping run in integration-test.mjs.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const out = "tmp/qa/selection";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const types = [
  { id: "trial", slug: "trial", name: "Trial lesson", description: "", duration_minutes: 60, price_cents: 2000 },
  { id: "single", slug: "single", name: "Single lesson", description: "", duration_minutes: 60, price_cents: 2500 },
  { id: "long", slug: "long", name: "Long lesson", description: "", duration_minutes: 90, price_cents: 3500 }
];
const addWeeks = (start, index) => new Date(Date.parse(start) + index * 7 * 86400000).toISOString();
try {
  for (const width of [390, 1280]) {
    // Pin Porto time: in any other browser zone each slot also shows "your time",
    // so exact time labels would depend on the machine running the check.
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
    const student = { id: "selection-preview", name: "Preview Student", email: "preview@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "student" };
    const requests = [];
    let bookings = [], series = [], rejectNext = false;
    const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    await context.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-selection-fixture"));
    await context.route("**/me", route => json(route, { student, bookings, series, sameDayFeeCents: 500 }));
    await context.route("**/me/recurring-rates", route => json(route, { rates: { 60: 1500 } }));
    await context.route("**/lesson-types", route => json(route, { lessonTypes: types, paymentMode: "postpay", postpay: true, paymentReady: true }));
    await context.route("**/availability?*", route => {
      const url = new URL(route.request().url());
      const type = types.find(type => type.id === url.searchParams.get("lessonType")) ?? types[1];
      const slotsByDate = {};
      for (let index = 0; index < 56; index++) {
        const date = new Date(Date.UTC(2026, 8, 14 + index));
        if ([0, 6].includes(date.getUTCDay())) continue;
        const key = date.toISOString().slice(0, 10);
        slotsByDate[key] = [9, 10, 14, 16].map(hour => ({
          startAt: new Date(Date.UTC(2026, 8, 14 + index, hour)).toISOString(),
          endAt: new Date(Date.UTC(2026, 8, 14 + index, hour, type.duration_minutes)).toISOString()
        }));
      }
      return json(route, { slotsByDate, timeZone: "Europe/Lisbon", minimumNoticeHours: 12, horizonDays: 56, lessonType: type });
    });
    await context.route("**/bookings/series/preview", route => {
      const body = route.request().postDataJSON();
      return json(route, { weeks: body.weeks, openEnded: body.weeks === null, bookable: Array.from({ length: body.weeks ?? 12 }, (_, i) => addWeeks(body.startAt, i)), skipped: [] });
    });
    await context.route("**/bookings", route => {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (rejectNext) { rejectNext = false; return json(route, { error: "A selected time has just been taken. Nothing has been booked; please review your dates." }, 409); }
      const starts = body.startAts ?? [body.startAt];
      const repeating = "repeat" in body;
      const type = types.find(type => type.id === body.lessonType);
      series = repeating ? starts.map((start, index) => ({
        id: `series-${index}`, lessonTypeId: type.id, lessonType: { id: type.id, name: type.name, durationMinutes: type.duration_minutes, priceCents: body.expectedPriceCents },
        weekday: new Date(start).getUTCDay(), minuteOfDay: 600, location: body.location,
        occurrences: body.repeat, upcomingCount: body.repeat ?? 12, nextStartAt: start, filledTo: "2026-10-06", status: "active"
      })) : [];
      bookings = starts.flatMap((start, index) => Array.from({ length: repeating ? body.repeat ?? 12 : 1 }, (_, i) => ({
        reference: `PREVIEW-${index}-${i}`, status: "confirmed", startAt: addWeeks(start, i),
        endAt: new Date(Date.parse(addWeeks(start, i)) + type.duration_minutes * 60000).toISOString(),
        lessonType: { id: type.id, name: type.name, durationMinutes: type.duration_minutes, priceCents: body.expectedPriceCents },
        location: body.location, notes: "", studentName: student.name, studentEmail: student.email, studentTimezone: student.timezone,
        paymentStatus: "scheduled", amountCents: body.expectedPriceCents, isPast: false,
        seriesId: repeating ? `series-${index}` : null, manageToken: `fixture-${index}-${i}`, sameDayFeeApplies: false
      }))).sort((a, b) => a.startAt.localeCompare(b.startAt));
      return json(route, { booking: bookings[0], selection: {
        booked: bookings.map(row => row.startAt), skipped: [], recurring: repeating, weeks: body.repeat ?? null, weeklyTimes: series.length
      } }, 201);
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-09-11T12:00:00Z"));
    async function start(recurring = false) {
      await page.goto(`${base}/book/?view=book`);
      await page.getByRole("button", { name: recurring ? "Recurring lessons · choose your weekly times" : "Single lessons · choose one or more dates", exact: true }).click();
      await page.getByRole("button", { name: "Choose a date", exact: true }).click();
    }
    async function choose(date, time = "10:00") {
      await page.locator(`button[data-date-key="${date}"]`).click();
      await page.getByRole("button", { name: time, exact: true }).click();
      await page.locator("#booking-confirmation-stage").waitFor();
    }
    async function confirm(count) {
      const button = page.getByRole("button", { name: `Confirm these ${count} lessons`, exact: true });
      await button.waitFor();
      assert.equal(await button.isDisabled(), true, "Explicit consent is required for the whole selection");
      await page.getByRole("checkbox", { name: "I agree to the terms", exact: true }).check();
      assert.equal(await button.isEnabled(), true);
      await button.click();
    }
    async function checkOverflow() {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}px`);
    }
    await start();
    await choose("2026-09-14");
    await page.getByRole("button", { name: /Add another lesson/ }).click();
    await choose("2026-09-22");
    await page.getByRole("button", { name: /Add another lesson/ }).click();
    await choose("2026-09-30");
    // Remove lives inside Change; backing out of a change keeps the lesson.
    await page.getByRole("button", { name: "Change lesson 2", exact: true }).click();
    await page.getByRole("button", { name: "Back to your selection", exact: true }).click();
    assert.equal(await page.locator('.booking-chosen-lessons li').count(), 3, "Going back from Change keeps the lesson");
    await page.getByRole("button", { name: "Change lesson 2", exact: true }).click();
    await page.getByRole("button", { name: "Remove this lesson", exact: true }).click();
    assert.equal(await page.locator('.booking-chosen-lessons li').count(), 2);
    await page.getByRole("button", { name: /Add another lesson/ }).click();
    await choose("2026-09-16");
    await page.getByRole("button", { name: "Change lesson 1", exact: true }).click();
    await choose("2026-09-17");
    await checkOverflow();
    await page.locator('.booking-chosen-lessons').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/single-${width}.png` });
    rejectNext = true;
    await confirm(3);
    await page.getByRole("alert").filter({ hasText: "Nothing has been booked" }).waitFor({ timeout: 5000 }).catch(async error => {
      console.error(JSON.stringify({ requests, text: await page.locator("body").innerText(), errors }, null, 2));
      await page.screenshot({ path: `${out}/failure-${width}.png` });
      throw error;
    });
    assert.equal(await page.locator('.booking-chosen-lessons li').count(), 3, "Failure retains the entire selection");
    await page.getByRole("button", { name: "Confirm these 3 lessons", exact: true }).click();
    await page.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    assert.deepEqual(requests.at(-1).startAts.map(start => start.slice(0, 10)).sort(), ["2026-09-16", "2026-09-17", "2026-09-30"]);
    assert.equal(requests.at(-1).expectedPriceCents, 2500);
    assert.equal("repeat" in requests.at(-1), false);
    bookings = []; series = [];
    await start(true);
    await choose("2026-09-14");
    await page.getByRole("button", { name: /Add another weekly time/ }).click();
    const dates = await page.locator('button[data-date-key]').evaluateAll(nodes => nodes.map(node => node.dataset.dateKey));
    assert.deepEqual(dates, Array.from({ length: 7 }, (_, i) => `2026-09-${14 + i}`), "Only the initial Monday–Sunday week can be chosen");
    await page.locator('button[data-date-key="2026-09-14"]').click();
    assert.equal(await page.getByRole("button", { name: "10:00", exact: true }).count(), 0, "An already selected or overlapping time is unavailable");
    await page.getByRole("button", { name: "Change date", exact: true }).click();
    await choose("2026-09-15");
    await page.getByRole("button", { name: /Add another weekly time/ }).click();
    await choose("2026-09-16");
    assert.equal(await page.getByRole("button", { name: /Add another weekly time/ }).count(), 1, "Adding a third time does not impose another cap");
    await page.getByRole("link", { name: "View terms", exact: true }).click();
    await page.locator("#booking[open]").waitFor();
    assert.equal(await page.locator(".booking-information details").count(), 1);
    assert.ok(await page.getByRole("heading", { name: "Your privacy", exact: true }).isVisible());
    assert.equal(await page.getByRole("checkbox", { name: "I agree to the terms", exact: true }).isChecked(), false, "Viewing terms does not give consent");
    await page.locator("#booking > summary").click();
    await page.locator("#booking-confirmation-stage").scrollIntoViewIfNeeded();
    await checkOverflow();
    await page.locator('.booking-chosen-lessons').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/recurring-${width}.png` });
    await confirm(12);
    await page.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    assert.equal(requests.at(-1).startAts.length, 3);
    assert.equal(requests.at(-1).repeat, 4);
    assert.equal(requests.at(-1).expectedPriceCents, 1500, "The recurring private rate applies to every weekly time");
    await page.getByRole("button", { name: "Back to upcoming lessons", exact: true }).click();
    await page.locator("#account-upcoming-lessons").waitFor();
    assert.equal(await page.getByRole("button", { name: "Manage recurrence", exact: true }).count(), 3, "All weekly times remain manageable");
    bookings = []; series = [];
    await start();
    for (let i = 0; i < 10; i++) {
      if (i) await page.getByRole("button", { name: /Add another lesson/ }).click();
      await choose(`2026-09-${14 + Math.floor(i / 4)}`, ["10:00", "11:00", "15:00", "17:00"][i % 4]);
    }
    assert.equal(await page.locator('.booking-chosen-lessons li').count(), 10);
    assert.equal(await page.getByRole("button", { name: /Add another lesson/ }).count(), 1, "Single lessons have no arbitrary add limit");
    await confirm(10);
    await page.getByRole("heading", { name: "You’re booked in.", exact: true }).waitFor();
    assert.equal(requests.at(-1).startAts.length, 10);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("Multi-date booking and same-week recurrence browser checks passed at 390px and 1280px.");
} finally { await browser.close(); }
