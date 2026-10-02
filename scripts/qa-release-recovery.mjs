import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";

// Isolated replies only: no real accounts, emails, lessons or payments.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const engine = process.env.QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unknown QA_BROWSER: ${engine}`);
const browser = await browserType.launch({ headless: true });
const output = `tmp/qa/release-recovery/${engine}`;
await mkdir(output, { recursive: true });
const unreadable = "We couldn't read the booking system's reply. Please try again.";
const student = { id: "release-fixture", name: "Ana Martins", email: "ana@example.invalid", phone: "", nif: "", timezone: "Europe/Lisbon", role: "student" };
const teacher = { ...student, id: "teacher", name: "Inês", role: "teacher" };
const types = [
  { id: "trial", name: "Trial lesson", duration_minutes: 60, price_cents: 2000 },
  { id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 },
  { id: "long", name: "Long lesson", duration_minutes: 90, price_cents: 3500 }
];
const lesson = {
  reference: "PT-FIXTURE", status: "confirmed", startAt: "2026-10-05T10:00:00Z", endAt: "2026-10-05T11:00:00Z",
  location: "online", studentName: student.name, studentEmail: student.email, studentTimezone: student.timezone,
  notes: "", rescheduleCount: 0, sameDayFeeCents: 500, paymentStatus: "scheduled",
  lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
  isPast: false, sameDayFeeApplies: false, seriesId: null, manageToken: "fixture"
};
const weekly = { id: "weekly", weekday: 1, minuteOfDay: 660, openEnded: true, occurrences: null, upcoming: 1 };
const adminLesson = {
  id: "lesson", reference: lesson.reference, status: "confirmed", starts_at: "2026-10-02T09:00:00Z", ends_at: "2026-10-02T10:00:00Z",
  lesson_name: "60 minutes", student_name: student.name, student_email: student.email, student_phone: "", location: "online", notes: "",
  payment_status: "scheduled", attendance_status: "expected", same_day_change: 0, same_day_fee_status: "not_required", reschedule_count: 0
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
let cases = 0;

async function fixture(width, reply, signed = true) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
  await context.addInitScript(({ signed }) => {
    if (signed) localStorage.setItem("ines-student-session", "isolated-release-session");
    window.google = { accounts: { id: { initialize() {}, renderButton() {} } } };
  }, { signed });
  const errors = [];
  await context.route(url => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$|bookings(?:\/|$)|series\/|admin\/)/.test(url.pathname), async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const answer = await reply(path, request);
    if (answer) return route.fulfill({ headers: cors, ...answer });
    if (request.method() === "GET") {
      const json = path === "/me" ? { student, bookings: [lesson], series: [], sameDayFeeCents: 500 }
        : path === "/me/recurring-rates" ? { rates: {} }
        : path === "/lesson-types" ? { lessonTypes: types, postpay: false, paymentReady: true }
        : path === "/availability" ? { slotsByDate: { "2026-10-06": [{ startAt: "2026-10-06T09:00:00Z", endAt: "2026-10-06T10:00:00Z" }] }, horizonDays: 84, timeZone: "Europe/Lisbon" }
        : path === "/bookings/fixture" ? { booking: lesson, isPast: false, sameDayFeeApplies: false }
        : path === "/admin/availability" ? { rules: [], exceptions: [] }
        : path === "/admin/google-calendar" ? { configured: false, connected: false, needsReconnect: false, pending: 0 }
        : null;
      if (json) return route.fulfill({ headers: cors, json });
    }
    errors.push(`Unexpected ${request.method()} ${path}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-02T10:00:00Z"));
  return { page, context, errors };
}

async function settle(state) {
  await state.page.waitForLoadState("networkidle");
  await state.page.evaluate(() => new Promise(resolve => {
    const finish = () => requestAnimationFrame(() => resolve(null));
    if (window.requestIdleCallback) window.requestIdleCallback(finish);
    else finish();
  }));
  await state.page.waitForLoadState("networkidle");
  assert.deepEqual(state.errors, []);
  assert.equal(await state.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
}

async function run(width, name, reply, probe, signed = true) {
  const state = await fixture(width, reply, signed);
  try {
    await probe(state);
    await settle(state);
    cases += 1;
    console.log(`PASS ${engine} ${width}: ${name}`);
    if (width === 390) await state.page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  } catch (error) {
    await state.page.screenshot({ path: `${output}/failure-${name}-${width}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await state.context.close(); }
}

async function account(page, name) {
  const toggle = page.locator("#account-menu-button");
  await page.locator("#account-menu").waitFor({ state: "attached" });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#account-menu").getByRole("button", { name, exact: true }).click();
}

try {
  for (const width of [320, 390, 1280]) {
    for (const destination of ["header", "footer"]) {
      await run(width, `navigation-${destination}`, async () => null, async state => {
        const { page } = state;
        await page.goto(`${base}/book/?view=book`);
        await expect(page.getByRole("radio", { name: "Single", exact: true })).toHaveCount(1);
        await settle(state);
        if (destination === "footer" && width < 821) {
          await page.locator(".site-footer").getByRole("button", { name: "Menu", exact: true }).click();
          await page.getByRole("dialog", { name: "Site navigation" }).getByRole("link", { name: "Booking", exact: true }).click();
        } else if (destination === "footer") await page.getByRole("navigation", { name: "Footer navigation" }).getByRole("link", { name: "Booking", exact: true }).click();
        else if (width === 1280) await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Booking", exact: true }).click();
        else {
          await page.getByRole("button", { name: "Open menu", exact: true }).click();
          await page.getByRole("dialog", { name: "Site navigation" }).getByRole("link", { name: "Booking", exact: true }).click();
        }
        await expect(page.getByRole("heading", { name: "Upcoming lessons", exact: true })).toBeVisible();
        await settle(state);
        await page.goBack();
        await expect(page).toHaveURL(/view=book/);
        await expect(page.getByRole("radio", { name: "Single", exact: true })).toHaveCount(1);
        await settle(state);
        await page.goForward();
        await expect(page.getByRole("heading", { name: "Upcoming lessons", exact: true })).toBeVisible();
      });
    }
    if (width < 821) for (const section of ["Upcoming lessons", "Edit details"]) {
      await run(width, `navigation-cta-${section === "Edit details" ? "profile" : "upcoming"}`, async () => null, async state => {
        const { page } = state;
        await page.goto(`${base}/book/?view=lessons`);
        await expect(page.getByRole("heading", { name: "Upcoming lessons", exact: true })).toBeVisible();
        if (section === "Edit details") await account(page, section);
        await settle(state);
        await page.getByRole("button", { name: "Open menu", exact: true }).click();
        await page.getByRole("link", { name: "Book a lesson", exact: true }).click();
        await expect(page).toHaveURL(/view=book/);
        await expect(page.getByRole("radio", { name: "Single", exact: true })).toHaveCount(1);
        await expect(page.getByRole("heading", { name: "Upcoming lessons", exact: true })).toHaveCount(0);
      });
    }

    for (const bad of [{}, { ok: false }]) {
      let posts = 0;
      await run(width, `forgot-${bad.ok === false ? "false" : "empty"}`, async (path, request) => path === "/auth/forgot" && request.method() === "POST"
        ? { json: ++posts === 1 ? bad : { ok: true } } : null, async ({ page }) => {
        await page.goto(`${base}/book/?view=lessons`);
        await page.getByRole("button", { name: "I’ve forgotten my password", exact: true }).click();
        await page.getByRole("textbox", { name: "Email", exact: true }).fill(student.email);
        const retry = page.getByRole("button", { name: "Email me a reset link", exact: true });
        await retry.click();
        await expect(page.getByRole("alert").filter({ hasText: unreadable })).toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: "a reset link is on its way" })).toHaveCount(0);
        await expect(retry).toBeEnabled();
        await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(student.email);
        await retry.click();
        await expect(page.getByRole("status")).toContainText("a reset link is on its way");
        assert.equal(posts, 2);
      }, false);
    }

    for (const bulk of [false, true]) {
      let posts = 0;
      await run(width, `stop-${bulk ? "bulk" : "repeat"}`, async (path, request) => {
        if (path === "/me") return { json: { student, bookings: [{ ...lesson, seriesId: "weekly" }], series: posts === 2 ? [] : [weekly] } };
        if (path === "/bookings/fixture") return { json: { booking: lesson, isPast: false, sameDayFeeApplies: false, recurring: true } };
        if (path === "/series/weekly/stop" && request.method() === "POST") return { json: ++posts === 1 ? {} : { ok: true, stopped: true, cancelled: bulk ? 1 : 0, kept: 0, refunded: 0, pendingRefunds: 0 } };
        return null;
      }, async ({ page }) => {
        await page.goto(`${base}/book/?manage=fixture`);
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Manage sequence", exact: true }).click();
        await dialog.getByRole("button", { name: bulk ? "Cancel all booked lessons" : "Stop repeating", exact: true }).click();
        const retry = dialog.getByRole("button", { name: bulk ? "Yes, cancel all" : "Yes, stop repeating", exact: true });
        await retry.click();
        await expect(dialog.getByRole("alert")).toContainText(unreadable);
        await expect(dialog.getByRole("status").filter({ hasText: "sequence has stopped" })).toHaveCount(0);
        await expect(retry).toBeEnabled();
        await retry.click();
        await expect(dialog.getByRole("status")).toContainText("sequence has stopped");
        assert.equal(posts, 2);
      });
    }

    for (const kind of ["empty", "wrong-id", "wrong-attendance"]) {
      let posts = 0;
      await run(width, `no-show-${kind}`, async (path, request) => {
        if (path === "/me") return { json: { student: teacher, bookings: [], series: [] } };
        if (path === "/admin/bookings") return { json: { bookings: [{ ...adminLesson, attendance_status: posts === 2 ? "no_show" : "expected" }] } };
        if (path === "/admin/bookings/lesson/no-show" && request.method() === "POST") {
          posts += 1;
          return { json: posts === 1 ? kind === "empty" ? {} : { booking: { ...adminLesson, id: kind === "wrong-id" ? "another" : "lesson", attendance_status: kind === "wrong-attendance" ? "expected" : "no_show" } }
            : { booking: { ...adminLesson, attendance_status: "no_show" } } };
        }
        return null;
      }, async ({ page }) => {
        await page.goto(`${base}/schedule/`);
        await page.getByRole("button", { name: /^Ana Martins,.*View lesson$/ }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Mark no-show", exact: true }).click();
        const retry = dialog.getByRole("button", { name: "Confirm no-show", exact: true });
        await retry.click();
        await expect(dialog.getByRole("alert")).toContainText(unreadable);
        await expect(retry).toBeEnabled();
        await retry.click();
        await expect(page.getByRole("status").filter({ hasText: "Marked as a no-show" })).toBeVisible();
        await expect(dialog).toHaveCount(0);
        assert.equal(posts, 2);
      });
    }

    for (const field of ["studentEmail", "notes", "sameDayFeeCents"]) {
      let posts = 0;
      await run(width, `booking-${field}`, async (path, request) => {
        if (path === "/lesson-types") return { json: { lessonTypes: types, postpay: true, paymentReady: true } };
        if (path !== "/bookings" || request.method() !== "POST") return null;
        const body = request.postDataJSON();
        const booking = { ...lesson, startAt: body.startAt, endAt: new Date(Date.parse(body.startAt) + 60 * 60000).toISOString() };
        return { json: { booking: ++posts === 1 ? { ...booking, [field]: { invalid: true } } : booking } };
      }, async ({ page }) => {
        await page.goto(`${base}/book/?view=book`);
        await page.getByRole("radio", { name: "Single", exact: true }).locator("..").click();
        await page.locator('button[data-date-key="2026-10-06"]').click();
        await page.getByRole("button", { name: "10:00", exact: true }).click();
        await page.getByRole("button", { name: "Agree to terms & privacy", exact: true }).click();
        const retry = page.locator(".booking-confirm-button");
        await retry.click();
        await expect(page.getByRole("alert").filter({ hasText: unreadable })).toBeVisible();
        await expect(page.getByRole("heading", { name: "You’re booked in.", exact: true })).toHaveCount(0);
        await expect(retry).toBeEnabled();
        await retry.click();
        await expect(page.getByRole("heading", { name: "You’re booked in.", exact: true })).toBeVisible();
        assert.equal(posts, 2);
      });
    }

    for (const payload of ["fee", "payment", "duration-price"]) {
      let reads = 0;
      await run(width, `management-${payload}`, async (path, request) => {
        if (path !== "/bookings/fixture" || request.method() !== "GET") return null;
        reads += 1;
        return { json: reads === 1 ? { booking: payload === "fee" ? { ...lesson, sameDayFeeCents: {} } : lesson, isPast: false, sameDayFeeApplies: false,
          ...(payload === "payment" ? { paymentsDue: { lesson: {}, sameDayFee: null } } : payload === "duration-price" ? { durationPrices: { 90: {} } } : {}) }
          : { booking: lesson, isPast: false, sameDayFeeApplies: false } };
      }, async state => {
        const { page } = state;
        await page.goto(`${base}/book/?manage=fixture`);
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("alert")).toContainText(unreadable);
        await expect(page.locator("body")).not.toContainText("€NaN");
        await settle(state);
        await page.reload();
        await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
        assert.equal(reads, 2);
      });
    }

    let cancels = 0;
    await run(width, "cancel-fee-flag", async (path, request) => path === "/bookings/fixture/cancel" && request.method() === "POST"
      ? { json: { booking: { ...lesson, status: "cancelled" }, sameDayFeeApplied: ++cancels === 1 ? "false" : false } } : null, async ({ page }) => {
      await page.goto(`${base}/book/?manage=fixture`);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      const retry = dialog.getByRole("button", { name: "Yes, cancel it", exact: true });
      await retry.click();
      await expect(dialog.getByRole("alert")).toContainText(unreadable);
      await expect(retry).toBeEnabled();
      await retry.click();
      await expect(dialog.getByRole("status")).toContainText("Your lesson has been cancelled");
      await expect(dialog.getByRole("status")).not.toContainText("late-change fee");
      assert.equal(cancels, 2);
    });

    let rates = 0;
    await run(width, "rate-acknowledgment", async (path, request) => path === "/me/recurring-rates" && request.method() === "POST"
      ? { json: { rates: { 60: 2000 }, saved: ++rates === 1 ? { durationMinutes: {}, cents: {} } : { durationMinutes: 60, cents: 2000 } } } : null, async ({ page }) => {
      await page.goto(`${base}/book/?view=lessons`);
      await account(page, "Edit details");
      await page.getByText("Have a code from Inês?", { exact: true }).click();
      await page.getByLabel("Your code", { exact: true }).fill("isolated-code");
      const retry = page.getByRole("button", { name: "Add code", exact: true });
      await retry.click();
      await expect(page.getByRole("alert").filter({ hasText: unreadable })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("€NaN");
      await expect(retry).toBeEnabled();
      await retry.click();
      await expect(page.getByRole("status").filter({ hasText: "Saved. Your 60-minute weekly lessons" })).toContainText("€20");
      assert.equal(rates, 2);
    });
  }
} finally { await browser.close(); }
console.log(`Release recovery passed: ${cases} cases in ${engine}.`);
