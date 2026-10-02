import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";

// All account changes and booking replies are isolated. These tests never
// create accounts, send emails, change real lessons or contact payment providers.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const engine = process.env.QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unknown QA_BROWSER: ${engine}`);
const browser = await browserType.launch({ headless: true });
const output = `tmp/qa/selection-calendar-recovery/${engine}`;
await mkdir(output, { recursive: true });
const student = { id: "continuity", name: "Ana Martins", email: "ana@example.invalid", nif: "", phone: "", timezone: "Europe/Lisbon", role: "student" };
const types = [
  { id: "trial", name: "Trial lesson", duration_minutes: 60, price_cents: 2000 },
  { id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 },
  { id: "long", name: "Long lesson", duration_minutes: 90, price_cents: 3500 }
];
const lesson = {
  reference: "PT-ACDEFG", status: "confirmed", startAt: "2026-10-05T10:00:00Z", endAt: "2026-10-05T11:00:00Z",
  location: "online", studentName: student.name, studentEmail: student.email, studentTimezone: student.timezone,
  notes: "", rescheduleCount: 0, sameDayFeeCents: 500, paymentStatus: "scheduled",
  lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
  isPast: false, sameDayFeeApplies: false, seriesId: null, manageToken: "fixture"
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(width, reply = async () => null, signed = true) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
  if (signed) await context.addInitScript(() => {
    if (!sessionStorage.getItem("isolated-account-initialised")) {
      localStorage.setItem("ines-student-session", "isolated-continuity");
      sessionStorage.setItem("isolated-account-initialised", "1");
    }
  });
  const errors = [];
  await context.route(url => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$|bookings(?:\/|$)|series\/|admin\/)/.test(url.pathname), async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const answer = await reply(path, request);
    if (answer?.abort) return route.abort();
    if (answer) return route.fulfill({ headers: cors, ...answer });
    if (request.method() === "GET") {
      if (path === "/me") return route.fulfill({ headers: cors, json: { student, bookings: [lesson], series: [], sameDayFeeCents: 500 } });
      if (path === "/me/recurring-rates") return route.fulfill({ headers: cors, json: { rates: {} } });
      if (path === "/lesson-types") return route.fulfill({ headers: cors, json: { lessonTypes: types, postpay: false, paymentReady: true } });
      if (path === "/availability") return route.fulfill({ headers: cors, json: { slotsByDate: {}, horizonDays: 84, timeZone: "Europe/Lisbon" } });
      if (path === "/bookings/fixture") return route.fulfill({ headers: cors, json: { booking: lesson, isPast: false, sameDayFeeApplies: false } });
      if (path === "/admin/availability") return route.fulfill({ headers: cors, json: { rules: [], exceptions: [] } });
      if (path === "/admin/bookings") return route.fulfill({ headers: cors, json: { bookings: [] } });
      if (path === "/admin/google-calendar") return route.fulfill({ headers: cors, json: { configured: false, connected: false, needsReconnect: false, pending: 0 } });
    }
    errors.push(`Unexpected ${request.method()} ${path}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-02T10:00:00Z"));
  return { page, context, errors };
}

async function check(state) {
  await state.page.waitForLoadState("networkidle");
  // Next schedules link prefetch during browser idle time. Settle that work
  // before a hard reload, which otherwise interrupts it in WebKit.
  await state.page.evaluate(() => new Promise(resolve => {
    const finish = () => requestAnimationFrame(() => resolve(null));
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(finish);
    else finish();
  }));
  await state.page.waitForLoadState("networkidle");
  assert.deepEqual(state.errors, []);
  const layout = await state.page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll("body *")].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).slice(-20).map(element => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 120) }))
  }));
  if (layout.scrollWidth > layout.width + 1) {
    await state.page.screenshot({ path: `${output}/overflow-${layout.width}.png`, fullPage: true });
    console.log(JSON.stringify(layout));
  }
  assert.equal(layout.scrollWidth <= layout.width + 1, true);
}

function bookingDefaults(path) {
  if(path==='/lesson-types') return { json: {lessonTypes:types,postpay:true,paymentReady:true} };
  if(path==='/availability') return {json:{slotsByDate:{'2026-10-06':[{startAt:'2026-10-06T09:00:00Z',endAt:'2026-10-06T10:00:00Z'}]},timeZone:'Europe/Lisbon',horizonDays:84}};
  return null;
}

const unreadable = "We couldn't read the booking system's reply. Please try again.";
const teacher = { ...student, id: "teacher", name: "Inês", role: "teacher" };
const rules = [{ id: 1, weekday: 1, start_minute: 600, last_start_minute: 720 }];
const adminLesson = { id: "lesson", reference: "PT-ACDEFG", status: "confirmed", starts_at: lesson.startAt, ends_at: lesson.endAt, lesson_name: "60 minutes", student_name: student.name, student_email: student.email, student_phone: "", location: "online", notes: "", payment_status: "scheduled", attendance_status: "expected", same_day_change: 0, same_day_fee_status: "not_required", reschedule_count: 0 };

function teacherDefaults(path) {
  if (path === "/me") return { json: { student: teacher, bookings: [], series: [] } };
  if (path === "/admin/availability") return { json: { rules, exceptions: [], settings: { slotIntervalMinutes: 30 } } };
  return null;
}
const slot = (page, day, minute) => page.locator(`[data-slot-day="${day}"][data-slot-minute="${minute}"]`);
async function monday(page) {
  await page.goto(`${base}/schedule/`);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page.getByRole("button", { name: "Monday 5 October, show lessons", exact: true }).click();
}
function exceptions(body) {
  return [
    ...(body.dayOff ? [{ id: 99, date: body.date, kind: "blocked", note: "", start_minute: null, end_minute: null }] : []),
    ...(body.blocks ?? []).map((block, id) => ({ id, date: body.date, kind: "blocked", note: "", start_minute: block.startMinute, end_minute: block.endMinute }))
  ];
}
function availability(starts, length, bufferMinutes = 0) {
  const slotsByDate = {};
  for (const startAt of starts) (slotsByDate[startAt.slice(0, 10)] ??= []).push({ startAt, endAt: new Date(Date.parse(startAt) + length * 60000).toISOString() });
  return { slotsByDate, timeZone: "Europe/Lisbon", horizonDays: 84, bufferMinutes };
}
const at = hour => new Date(Date.UTC(2026, 9, 6, 0, hour * 60)).toISOString();
async function choose(page, start) {
  const date = page.locator(`button[data-date-key="${start.slice(0, 10)}"]`);
  if (await date.isVisible()) await date.click();
  // On phones the chosen date's time picker replaces the calendar. Choosing
  // another time on that same date does not require clicking the hidden grid.
  else await expect(date).toHaveAttribute("aria-pressed", "true");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }).format(new Date(start));
  const part = page.locator(`.time-picker__parts input[value="${time < "14:00" ? "early" : "late"}"]`);
  if (await part.count()) await part.locator("..").click();
  await page.getByRole("button", { name: time, exact: true }).click();
}
async function startChoices(page, starts) {
  await page.goto(`${base}/book/?view=book`);
  await selectRadio(page, "Single");
  for (let index = 0; index < starts.length; index++) {
    if (index) await page.getByRole("button", { name: "Add another lesson", exact: true }).click();
    await choose(page, starts[index]);
  }
}
async function selectRadio(page, name) {
  const radio = page.getByRole("radio", { name, exact: true });
  // Radios are visually hidden inside the real segmented labels. Tap the
  // visible label. A length check can immediately replace this bar with the
  // time picker; each case verifies the resulting selection and request.
  await radio.locator("..").click();
}
async function leaveForFaq(page) {
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "FAQ", exact: true }).first().click();
  await expect(page).toHaveURL(/\/faq\/?$/);
}
async function chooseAccount(page, name) {
  await page.locator("#account-menu").waitFor({ state: "attached" });
  const toggle = page.locator("#account-menu-button");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#account-menu").getByRole("button", { name, exact: true }).click();
}
function acceptedBooking(request) {
  const body = request.postDataJSON();
  return { json: { booking: { ...lesson, startAt: body.startAt, endAt: new Date(Date.parse(body.startAt) + 90 * 60000).toISOString(), lessonType: { id: "long", name: "Long lesson", durationMinutes: 90, priceCents: 3500 } } } };
}
async function confirm(page) {
  await page.getByRole("button", { name: "Agree to terms & privacy", exact: true }).click();
  await page.locator(".booking-confirm-button").click();
  await expect(page.getByRole("heading", { name: "You’re booked in.", exact: true })).toBeVisible();
}

let cases = 0;
try {
  for (const width of [320, 390, 1280]) {
    // A failed older save cannot discard the latest complete date choice.
    for (const failure of ["server", "network", "malformed"]) {
      const started = deferred(), waiting = deferred(), writes = [];
      const state = await fixture(width, async (path, request) => {
        if (path === "/admin/exceptions/day") {
          const body = request.postDataJSON(); writes.push(body);
          if (writes.length === 1) {
            started.resolve(); await waiting.promise;
            if (failure === "network") return { abort: true };
            return failure === "malformed" ? { json: {} } : { status: 503, json: { error: "First save interrupted." } };
          }
          return { json: { ok: true, exceptions: exceptions(body) } };
        }
        return teacherDefaults(path);
      });
      try {
        const { page } = state;
        await monday(page);
        await slot(page, 1, 600).click(); await started.promise;
        await slot(page, 1, 630).click();
        if (failure === "malformed") {
          await page.getByRole("switch", { name: "Day off, Monday 5 October", exact: true }).click();
          await page.getByRole("switch", { name: "Day off, Monday 5 October", exact: true }).click();
        }
        waiting.resolve();
        await expect.poll(() => writes.length).toBe(2);
        await expect(slot(page, 1, 600)).toHaveAttribute("aria-pressed", "true");
        await expect(slot(page, 1, 630)).toHaveAttribute("aria-pressed", "true");
        assert.deepEqual(writes[1], { date: "2026-10-05", ...(failure === "malformed" ? { dayOff: false } : {}), blocks: [{ startMinute: 600, endMinute: 660 }] });
        await expect(page.locator(".teacher-save-state")).not.toHaveClass(/is-error/);
        await check(state); cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Rejected save contracts leave the saved calendar intact, without a
    // crash or false success. A new click can retry an idempotent date update.
    for (const answer of [{}, { ok: true, exceptions: "broken" }, { ok: true, exceptions: [null] }]) {
      let writes = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/admin/exceptions/day") return ++writes === 1 ? { json: answer } : { json: { ok: true, exceptions: exceptions(request.postDataJSON()) } };
        return teacherDefaults(path);
      });
      try {
        const { page } = state;
        await monday(page); await slot(page, 1, 600).click();
        await expect(page.locator(".teacher-save-state")).toContainText(unreadable);
        await expect(slot(page, 1, 600)).toHaveAttribute("aria-pressed", "false");
        await check(state);
        if (width !== 390 && Object.keys(answer).length === 0) await page.screenshot({ path: `${output}/time-off-error-${width}.png`, fullPage: true });
        await slot(page, 1, 600).click();
        await expect(page.locator(".teacher-save-state")).not.toHaveClass(/is-error/);
        await expect(slot(page, 1, 600)).toHaveAttribute("aria-pressed", "true");
        await check(state); assert.equal(writes, 2); cases += 1;
      } finally { await state.context.close(); }
    }
    for (const answer of [{}, { ok: true, count: "not-a-count" }]) {
      let writes = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/admin/availability" && request.method() === "POST") return ++writes === 1 ? { json: answer } : { json: { ok: true, count: request.postDataJSON().rules.length } };
        return teacherDefaults(path);
      });
      try {
        const { page } = state;
        await monday(page); await page.getByRole("button", { name: /^Weekly hours/ }).click();
        await page.getByRole("button", { name: "Monday, show teaching hours", exact: true }).click();
        await slot(page, 1, 600).click();
        const save = page.getByRole("button", { name: "Save teaching hours", exact: true });
        await save.click();
        await expect(page.getByRole("alert").filter({ hasText: unreadable })).toBeVisible();
        await expect(save).toBeEnabled();
        await expect(page.getByText("Teaching hours saved. Students can now book these times.", { exact: true })).toHaveCount(0);
        await save.click();
        await expect(page.getByText("Teaching hours saved. Students can now book these times.", { exact: true })).toBeVisible();
        await expect(save).toBeDisabled();
        await check(state); assert.equal(writes, 2); cases += 1;
      } finally { await state.context.close(); }
    }

    // Leaving the teacher page releases its queue before another account can
    // be signed in. An in-flight write may finish; no queued POST starts later.
    for (const session of ["", "replacement-session"]) {
      const started = deferred(), waiting = deferred(), writes = [];
      const state = await fixture(width, async (path, request) => {
        if (path === "/admin/exceptions/day") {
          const body = request.postDataJSON(); writes.push(body); started.resolve(); await waiting.promise;
          return { json: { ok: true, exceptions: exceptions(body) } };
        }
        return teacherDefaults(path);
      });
      try {
        const { page } = state;
        await monday(page); await slot(page, 1, 600).click(); await started.promise;
        await slot(page, 1, 630).click();
        await leaveForFaq(page);
        await page.evaluate(value => {
          if (value) localStorage.setItem("ines-student-session", value); else localStorage.removeItem("ines-student-session");
          window.dispatchEvent(new StorageEvent("storage", { key: "ines-student-session", newValue: value || null }));
        }, session);
        const response = page.waitForResponse("**/admin/exceptions/day");
        waiting.resolve(); await response; await check(state);
        assert.equal(writes.length, 1);
        await expect(page).toHaveURL(/\/faq\/?$/);
        assert.equal(await page.evaluate(() => localStorage.getItem("ines-student-session")), session || null);
        cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Validate the complete selection after changing length, including the
    // gap and a selected current time that sorts before saved times.
    for (const mode of ["forward", "reverse", "chain", "buffer"]) {
      const starts = mode === "buffer" ? [at(9), at(10.5)] : [at(9), at(10), ...(mode === "chain" ? [at(11)] : [])];
      const order = mode === "reverse" ? [...starts].reverse() : starts;
      const posts = [];
      const state = await fixture(width, async (path, request) => {
        if (path === "/availability") {
          const long = new URL(request.url()).searchParams.get("lessonType") === "long";
          return { json: availability([...starts, at(13)], long ? 90 : 60, long && mode === "buffer" ? 30 : 0) };
        }
        if (path === "/bookings" && request.method() === "POST") { posts.push(request.postDataJSON()); return acceptedBooking(request); }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await startChoices(page, order);
        await selectRadio(page, "90 minutes lesson · €35");
        await expect(page.locator(".booking-state-note--notice")).toContainText("too close to another chosen lesson at this length");
        await check(state); assert.equal(posts.length, 0);
        if (mode === "forward" || mode === "buffer") {
          await expect(page.locator(".booking-confirm-button")).toHaveCount(0);
          if (mode === "forward" && width !== 390) await page.screenshot({ path: `${output}/length-conflict-${width}.png`, fullPage: true });
          await page.getByRole("button", { name: "Back to your selection", exact: true }).click();
        }
        await expect(page.locator(".booking-confirm-button")).toHaveText(mode === "chain" ? "Book 2 lessons & agree to pay" : "Book lesson & agree to pay");
        await confirm(page);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].lessonType, "long");
        assert.deepEqual(posts[0].startAts ?? [posts[0].startAt], mode === "chain" ? [at(9), at(11)] : [at(9)]);
        await check(state); cases += 1;
      } finally { await state.context.close(); }
    }

    // Preserve choices while a length lookup fails, then recheck all of them
    // after retry or a legitimate verified renewal triggers a fresh lookup.
    for (const mode of ["current", "saved", "renewed"]) {
      const starts = [at(9), at(12)];
      const fresh = mode === "renewed" ? [at(15)] : mode === "current" ? [at(9), at(15)] : [at(12), at(15)];
      let reads = 0, posts = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/availability") {
          if (new URL(request.url()).searchParams.get("lessonType") !== "long") return { json: availability(starts, 60) };
          if (++reads <= (mode === "current" ? 2 : 1)) return { status: 503, json: { error: "New length temporarily unavailable." } };
          return { json: availability(fresh, 90) };
        }
        if (path === "/bookings" && request.method() === "POST") { posts += 1; return acceptedBooking(request); }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await startChoices(page, starts);
        const previous = await page.locator(".booking-chosen-lessons").textContent();
        await selectRadio(page, "90 minutes lesson · €35");
        const warning = page.getByRole("status").filter({ hasText: "New length temporarily unavailable." });
        await expect(warning).toBeVisible();
        await expect(page.locator(".booking-chosen-lessons")).toHaveText(previous);
        if (mode === "renewed") {
          await page.evaluate(() => {
            const previousSession = localStorage.getItem("ines-student-session");
            localStorage.setItem("ines-student-session", "isolated-renewed");
            window.dispatchEvent(new CustomEvent("ines:student-session-change", { detail: { previousSession, studentId: "continuity" } }));
          });
        } else {
          await warning.getByRole("button", { name: "Try again", exact: true }).click();
          if (mode === "current") {
            await expect(warning).toBeVisible();
            await expect(page.locator(".booking-chosen-lessons")).toHaveText(previous);
            await warning.getByRole("button", { name: "Try again", exact: true }).click();
          }
        }
        await expect(warning).toHaveCount(0);
        await expect(page.locator(".booking-state-note--notice")).toContainText("not free at this length");
        assert.equal(posts, 0);
        if (mode === "saved") await expect(page.locator(".booking-confirm-button")).toHaveText("Book lesson & agree to pay");
        else await expect(page.locator(".booking-confirm-button")).toHaveCount(0);
        await check(state); cases += 1;
      } finally { await state.context.close(); }
    }

    // Retry may finish while another lesson is being added or changed. It
    // updates saved durations before offering times, and Back checks the
    // restored choice against the new availability and the entire selection.
    for (const mode of ["add", "change-taken", "change-overlap", "change-other-taken"]) {
      const starts = mode === "change-overlap" ? [at(9), at(10)] : [at(9), at(12)];
      const fresh = mode === "change-other-taken" ? [at(12), at(15)] : mode === "change-taken" ? [at(9), at(10), at(15)] : [at(9), at(10), at(12), at(15)];
      let reads = 0;
      const posts = [];
      const state = await fixture(width, async (path, request) => {
        if (path === "/availability") {
          const long = new URL(request.url()).searchParams.get("lessonType") === "long";
          if (long && ++reads === 1) return { status: 503, json: { error: "New length temporarily unavailable." } };
          return { json: availability(long ? fresh : [at(9), at(10), at(12), at(15)], long ? 90 : 60) };
        }
        if (path === "/bookings" && request.method() === "POST") { posts.push(request.postDataJSON()); return acceptedBooking(request); }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await startChoices(page, starts);
        await selectRadio(page, "90 minutes lesson · €35");
        const warning = page.getByRole("status").filter({ hasText: "New length temporarily unavailable." });
        await expect(warning).toBeVisible();
        await page.getByRole("button", { name: mode === "add" ? "Add another lesson" : mode === "change-overlap" ? "Change lesson 1" : "Change lesson 2", exact: true }).click();
        await warning.getByRole("button", { name: "Try again", exact: true }).click();
        await expect(warning).toHaveCount(0);
        if (mode === "add") {
          await page.locator('button[data-date-key="2026-10-06"]').click();
          await expect(page.getByRole("button", { name: "11:00", exact: true })).toHaveCount(0);
          await choose(page, at(15));
          await expect(page.locator(".booking-confirm-button")).toHaveText("Book 3 lessons & agree to pay");
        } else {
          await page.getByRole("button", { name: "Back to your selection", exact: true }).click();
          if (mode === "change-taken") {
            await expect(page.locator(".booking-state-note--notice")).toContainText("not free at this length");
            await expect(page.locator(".booking-confirm-button")).toHaveCount(0);
            await page.getByRole("button", { name: "Back to your selection", exact: true }).click();
          } else if (mode === "change-overlap") {
            await expect(page.locator(".booking-state-note--notice")).toContainText("too close to another chosen lesson at this length");
          }
          await expect(page.locator(".booking-confirm-button")).toHaveText("Book lesson & agree to pay");
        }
        assert.equal(posts.length, 0);
        await confirm(page);
        assert.equal(posts[0].lessonType, "long");
        assert.deepEqual(posts[0].startAts ?? [posts[0].startAt], mode === "add" ? [at(9), at(12), at(15)] : [at(mode === "change-other-taken" ? 12 : 9)]);
        await check(state); cases += 1;
      } finally { await state.context.close(); }
    }

    // A submitted hold fixes all the choices shown beside its card form.
    // Test both the response delay and the mounted checkout, including repeat.
    for (const weekly of [false, true]) {
      const started = deferred(), waiting = deferred(), posts = [];
      const state = await fixture(width, async (path, request) => {
        if (path === "/bookings/series/preview") return { json: { bookable: [request.postDataJSON().startAt], skipped: [] } };
        if (path === "/bookings" && request.method() === "POST") {
          const body = request.postDataJSON(); posts.push(body); started.resolve(); await waiting.promise;
          return { json: { booking: { ...lesson, startAt: body.startAt, endAt: new Date(Date.parse(body.startAt) + 60 * 60000).toISOString(), status: "pending_payment" }, checkoutClientSecret: "cs_test_isolated_secret_placeholder" } };
        }
        return bookingDefaults(path);
      });
      await state.context.route("https://js.stripe.com/**", route => route.fulfill({ contentType: "application/javascript", body: 'window.Stripe = () => ({ initEmbeddedCheckout: async () => ({ mount(element) { element.textContent = "Isolated secure payment form"; }, destroy() {} }) });' }));
      try {
        const { page } = state;
        await startChoices(page, [at(9)]);
        if (weekly) await selectRadio(page, "Weekly");
        await page.getByRole("button", { name: "Agree to terms & privacy", exact: true }).click();
        await page.locator(".booking-confirm-button").click(); await started.promise;
        const radios = page.locator(".booking-bar--review input[type=radio]");
        for (const radio of await radios.all()) await expect(radio).toBeDisabled();
        await expect(page.getByRole("button", { name: "Change date or time", exact: true })).toBeDisabled();
        await expect(page.getByRole("radio", { name: "60 minutes lesson · €25", exact: true })).toBeChecked();
        await expect(page.getByRole("radio", { name: "Online", exact: true })).toBeChecked();
        waiting.resolve();
        await expect(page.locator(".booking-payment__mount")).toHaveText("Isolated secure payment form");
        for (const radio of await radios.all()) await expect(radio).toBeDisabled();
        await expect(page.getByRole("button", { name: "Change date or time", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: weekly ? "Add a second weekly time" : "Add another lesson", exact: true })).toHaveCount(0);
        await expect(page.locator(".booking-payment__summary")).toContainText("60 minutes lesson · €25");
        assert.equal(posts.length, 1);
        assert.equal(posts[0].lessonType, "single"); assert.equal(posts[0].location, "online");
        assert.equal(posts[0].expectedPriceCents, 2500); assert.equal(posts[0].repeat, weekly ? 4 : undefined);
        await check(state);
        if (!weekly && width !== 390) await page.screenshot({ path: `${output}/checkout-choices-${width}.png`, fullPage: true });
        cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // An unreadable address confirmation cannot corrupt the active session;
    // an unreadable send acknowledgment leaves the student's edit intact.
    for (const mode of ["pending", "session"]) {
      let writes = 0;
      const state = await fixture(width, async path => {
        if (path === "/me/email") { writes += 1; return { json: { ok: true, pending: { invalid: true } } }; }
        if (path === "/me/email/confirm") { writes += 1; return { json: { student: { ...student, email: "verified@example.invalid" }, session: { invalid: true } } }; }
        return null;
      });
      try {
        const { page } = state;
        await page.goto(`${base}/book/?view=lessons${mode === "session" ? "&emailToken=isolated" : ""}`);
        if (mode === "pending") {
          await chooseAccount(page, "Edit details");
          await page.getByLabel("Email address", { exact: true }).fill("updated@example.invalid");
          await page.getByRole("button", { name: "Send confirmation link", exact: true }).click();
          await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("updated@example.invalid");
        }
        await expect(page.getByRole("alert").filter({ hasText: unreadable })).toBeVisible();
        assert.equal(writes, 1);
        assert.equal(await page.evaluate(() => localStorage.getItem("ines-student-session")), "isolated-continuity");
        await expect(page.getByText("That's your email address updated.", { exact: true })).toHaveCount(0);
        await check(state); cases += 1;
      } finally { await state.context.close(); }
    }

    // Do not clear an arranged booking or report an emailed lesson unless
    // the server has supplied a booking acknowledgment. No automatic retry.
    {
      let writes = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/admin/bookings" && request.method() === "POST") { writes += 1; return { json: {} }; }
        return teacherDefaults(path);
      });
      try {
        const { page } = state;
        await page.goto(`${base}/schedule/`);
        await page.getByText("Add a lesson for a student", { exact: true }).click();
        const form = page.locator(".teacher-manual-form");
        await form.getByLabel("Student’s email", { exact: true }).fill("other@example.invalid");
        await form.getByLabel("Student’s name", { exact: true }).fill("New student");
        await form.getByLabel("Date", { exact: true }).fill("2026-10-06");
        await form.getByLabel("Time in Porto", { exact: true }).fill("10:00");
        await form.getByRole("button", { name: "Add lesson and email student", exact: true }).click();
        await expect(page.getByRole("alert").filter({ hasText: unreadable })).toBeVisible();
        await expect(form.getByLabel("Student’s email", { exact: true })).toHaveValue("other@example.invalid");
        await expect(form.getByLabel("Date", { exact: true })).toHaveValue("2026-10-06");
        await expect(page.getByText("Lesson added. The student has been emailed the details.", { exact: true })).toHaveCount(0);
        await check(state); assert.equal(writes, 1); cases += 1;
      } finally { await state.context.close(); }
    }

    // Mutation replies are validated before creating a confirmation or
    // replacing a managed lesson. Preserve the view; do not repeat a write.
    for (const mode of ["create-date", "create-series", "create-selection", "cancel", "move", "move-series"]) {
      let writes = 0;
      const weekly = { id: "weekly", weekday: 1, minuteOfDay: 660, occurrences: 4, openEnded: false, upcoming: 1 };
      const current = { ...lesson, ...(mode === "move-series" ? { seriesId: "weekly" } : {}) };
      const state = await fixture(width, async (path, request) => {
        if (path === "/me" && mode === "move-series") return { json: { student, bookings: [current], series: [weekly] } };
        if (path === "/bookings/fixture") return { json: { booking: current, isPast: false, sameDayFeeApplies: false, recurring: mode === "move-series" } };
        if (path === "/bookings" && request.method() === "POST") {
          writes += 1;
          return { json: {
            booking: mode === "create-date" ? { ...lesson, startAt: "not-a-date" } : lesson,
            ...(mode === "create-series" ? { series: { id: "weekly", weeks: 4, openEnded: false, booked: [lesson.startAt], skipped: [null] } } : {}),
            ...(mode === "create-selection" ? { selection: { booked: null, skipped: [], recurring: false, weeks: null, weeklyTimes: 0 } } : {})
          } };
        }
        if (path === "/bookings/fixture/cancel" || path === "/bookings/fixture/reschedule") { writes += 1; return { json: { booking: { ...lesson, lessonType: null }, sameDayFeeApplied: false } }; }
        if (path === "/series/weekly/reschedule") { writes += 1; return { json: { ok: true, moved: 1, bookings: [null], kept: [] } }; }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        if (mode.startsWith("create-")) {
          await startChoices(page, [at(9)]);
          await page.getByRole("button", { name: "Agree to terms & privacy", exact: true }).click();
          await page.locator(".booking-confirm-button").click();
          await expect(page.locator(".booking-confirm-button")).toBeEnabled();
          await expect(page.getByRole("heading", { name: "You’re booked in.", exact: true })).toHaveCount(0);
        } else {
          await page.goto(`${base}/book/?manage=fixture`);
          const dialog = page.getByRole("dialog");
          if (mode === "cancel") {
            await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
            await dialog.getByRole("button", { name: "Yes, cancel it", exact: true }).click();
          } else {
            if (mode === "move-series") {
              await dialog.getByRole("button", { name: "Manage sequence", exact: true }).click();
              await dialog.getByRole("button", { name: "Move recurrence", exact: true }).click();
            } else await dialog.getByRole("button", { name: "Change", exact: true }).click();
            await choose(page, at(9));
            await dialog.getByRole("button", { name: mode === "move-series" ? "Move recurrence" : "Change to 10:00", exact: true }).click();
          }
          await expect(dialog.locator(mode === "cancel" ? ".lesson-manage-dialog__lesson" : ".managed-lesson__current-time")).toContainText("Monday, 5 October 2026, 11:00");
          await expect(dialog.getByRole("heading", { name: "All sorted", exact: true })).toHaveCount(0);
        }
        await expect(page.getByRole("alert").filter({ hasText: unreadable })).toBeVisible();
        await check(state); assert.equal(writes, 1); cases += 1;
      } finally { await state.context.close(); }
    }

    // Bad rows inside otherwise well-formed containers used to crash a whole
    // page or invent skipped dates. Recovery retains the active account.
    for (const malformed of ["account-booking", "account-date", "account-series", "account-nif", "teacher-exception", "teacher-note", "teacher-rule", "teacher-booking", "teacher-name", "teacher-reconciliation", "managed", "preview-skipped", "preview-missing"]) {
      let recovered = false;
      const state = await fixture(width, async (path, request) => {
        if (!recovered) {
          if (path === "/me" && malformed.startsWith("account-")) return { json: { student: malformed === "account-nif" ? { ...student, nif: 123456789 } : student, bookings: malformed === "account-booking" ? [null] : malformed === "account-date" ? [{ ...lesson, startAt: "not-a-date" }] : [lesson], series: malformed === "account-series" ? [null] : [] } };
          if (path === "/admin/availability" && malformed === "teacher-exception") return { json: { rules, exceptions: [null] } };
          if (path === "/admin/availability" && malformed === "teacher-note") return { json: { rules, exceptions: [{ id: 1, date: null, kind: "blocked", weekday: 1, start_minute: 600, end_minute: 630, note: { value: "Malformed lunch label" } }] } };
          if (path === "/admin/availability" && malformed === "teacher-rule") return { json: { rules: [{ ...rules[0], weekday: 8 }], exceptions: [] } };
          if (path === "/admin/bookings" && malformed === "teacher-booking") return { json: { bookings: [{ ...adminLesson, starts_at: "not-a-date" }] } };
          if (path === "/admin/bookings" && malformed === "teacher-name") return { json: { bookings: [{ ...adminLesson, student_name: { value: "Malformed name" } }] } };
          if (path === "/admin/bookings" && malformed === "teacher-reconciliation") return { json: { bookings: [], manualPaymentReconciliation: [null] } };
          if (path === "/bookings/fixture" && malformed === "managed") return { json: { booking: { ...lesson, endAt: "not-a-date" }, isPast: false, sameDayFeeApplies: false } };
          if (path === "/bookings/series/preview") return { json: { bookable: malformed === "preview-missing" ? null : [request.postDataJSON().startAt], skipped: malformed === "preview-skipped" ? [null] : [] } };
        }
        if (path === "/bookings/series/preview") return { json: { bookable: [request.postDataJSON().startAt], skipped: [] } };
        return malformed.startsWith("teacher-") ? teacherDefaults(path) : bookingDefaults(path);
      });
      try {
        const { page } = state;
        if (malformed.startsWith("preview-")) {
          await startChoices(page, [at(9)]);
          await selectRadio(page, "Weekly");
          await expect(page.getByRole("status").filter({ hasText: "We couldn't check the later weeks just now." })).toBeVisible();
          await expect(page.getByText("Thu 1 Jan", { exact: false })).toHaveCount(0);
          recovered = true;
          await selectRadio(page, "6 weeks");
          await expect(page.getByRole("region", { name: "Recurring lesson availability", exact: true })).toHaveCount(0);
        } else {
          await page.goto(`${base}${malformed.startsWith("teacher-") ? "/schedule/" : malformed === "managed" ? "/book/?manage=fixture" : "/book/?view=lessons"}`);
          const warning = page.getByRole("alert").filter({ hasText: malformed.startsWith("account-") ? "account just now" : unreadable });
          await expect(warning).toBeVisible();
          await check(state);
          assert.equal(await page.evaluate(() => localStorage.getItem("ines-student-session")), "isolated-continuity");
          recovered = true;
          if (malformed.startsWith("teacher-")) {
            await page.getByRole("button", { name: ["teacher-booking", "teacher-name", "teacher-reconciliation"].includes(malformed) ? "Reload lessons" : "Reload schedule", exact: true }).click();
            await expect(page.getByRole("button", { name: /^Weekly hours/ })).toBeVisible();
          } else if (malformed === "managed") {
            await page.getByRole("button", { name: "Close lesson management", exact: true }).click();
            await check(state); await page.goto(`${base}/book/?manage=fixture`);
            await expect(page.getByRole("dialog").getByRole("button", { name: "Change", exact: true })).toBeVisible();
          } else {
            await warning.getByRole("button", { name: "Try again", exact: true }).click();
            await expect(page.locator("#account-menu-button")).toBeAttached();
          }
          await expect(warning).toHaveCount(0);
        }
        await check(state); cases += 1;
      } finally { await state.context.close(); }
    }
    console.log(`${engine} selection and teacher recovery passed at ${width}px.`);
  }
  console.log(`${cases} isolated selection and teacher recovery cases passed in ${engine}.`);
} finally { await browser.close(); }
