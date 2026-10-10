import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";

// Every private/provider request is isolated. Public assets are real; none of
// these checks create accounts, lessons, messages, card setups or charges.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const engine = process.env.QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unknown QA_BROWSER: ${engine}`);
const browser = await browserType.launch({ headless: true });
const output = process.env.QA_OUTPUT_DIR ?? `tmp/qa/dialog-interactions/${engine}`;
await mkdir(output, { recursive: true });
const student = { id: "dialog-student", name: "Ana Martins", email: "ana@example.invalid", role: "student", nif: "", phone: "", timezone: "Europe/Lisbon" };
const lesson = { id: "lesson", reference: "PT-DIALOG", status: "confirmed", starts_at: "2026-10-05T10:00:00Z", ends_at: "2026-10-05T11:00:00Z",
  lesson_name: "60 minutes", student_name: student.name, student_email: student.email, student_phone: "", location: "online", notes: "",
  payment_status: "scheduled", attendance_status: "expected", same_day_change: 0, same_day_fee_status: "not_required", reschedule_count: 0 };
const types = [{ id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 }];
const calendarLessons = ["2026-10-05T10:00:00Z", "2026-10-05T13:00:00Z"].map((startAt, index) => ({
  reference: `DIALOG-${index}`, status: "confirmed", startAt, endAt: new Date(Date.parse(startAt) + 3600000).toISOString(),
  location: "online", studentName: student.name, studentEmail: student.email, studentTimezone: student.timezone,
  notes: "", rescheduleCount: 0, sameDayFeeCents: 500, paymentStatus: "scheduled", amountCents: 2500,
  lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
  isPast: false, sameDayFeeApplies: false, seriesId: null, manageToken: `dialog-${index}`
}));
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const apiPath = path => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$|bookings(?:\/|$)|series\/|admin\/)/.test(path);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(width, { teacher = true, current = lesson, calendarPrompt = false, reply = () => null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
  await context.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-dialog-session"));
  const errors = [], writes = [];
  let saved = { ...current };
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.hostname === "accounts.google.com") return route.fulfill({ contentType: "application/javascript", body: "window.google={accounts:{id:{initialize(){},renderButton(){}}}};" });
    if (url.hostname === "js.stripe.com") return route.fulfill({ contentType: "application/javascript", body: "window.Stripe=()=>({});" });
    if (url.hostname === "api.stripe.com") return route.abort();
    if (!apiPath(path)) {
      if (url.origin === new URL(base).origin && ["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue();
      errors.push(`Unexpected external request ${request.method()} ${url.origin}${path}`); return route.abort();
    }
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.method() === "POST") writes.push({ path, body: request.postDataJSON() });
    const answer = await reply(path, request, writes);
    if (answer) return route.fulfill({ headers: cors, ...answer });
    if (request.method() === "GET") {
      if (path === "/me") return route.fulfill({ headers: cors, json: { student: teacher ? { ...student, id: "teacher", role: "teacher" } : student, bookings: calendarPrompt ? calendarLessons : [], series: [], sameDayFeeCents: 500 } });
      if (path === "/me/recurring-rates") return route.fulfill({ headers: cors, json: { rates: {} } });
      if (path === "/lesson-types") return route.fulfill({ headers: cors, json: { lessonTypes: types, postpay: false, paymentReady: true } });
      if (path === "/availability") return route.fulfill({ headers: cors, json: { slotsByDate: { "2026-10-05": [{ startAt: lesson.starts_at, endAt: lesson.ends_at }] }, timeZone: "Europe/Lisbon", horizonDays: 84, minimumNoticeHours: 14 } });
      if (path === "/admin/availability") return route.fulfill({ headers: cors, json: { rules: [], exceptions: [], settings: { slotIntervalMinutes: 15 } } });
      if (path === "/admin/bookings") return route.fulfill({ headers: cors, json: { bookings: saved.status === "cancelled" ? [] : [saved] } });
      if (path === "/admin/google-calendar") return route.fulfill({ headers: cors, json: { configured: false, connected: false, needsReconnect: false, pending: 0 } });
    }
    if (request.method() === "POST" && path.startsWith("/admin/bookings/lesson/")) {
      const body = request.postDataJSON();
      if (path.endsWith("/reschedule")) saved = { ...saved, starts_at: body.startAt, ends_at: new Date(Date.parse(body.startAt) + 3600000).toISOString() };
      else if (path.endsWith("/cancel")) saved = { ...saved, status: "cancelled" };
      else if (path.endsWith("/no-show")) saved = { ...saved, attendance_status: body.noShow ? "no_show" : "expected" };
      else { errors.push(`Unexpected mutation ${path}`); return route.abort(); }
      return route.fulfill({ headers: cors, json: { booking: saved } });
    }
    errors.push(`Unexpected ${request.method()} ${path}`); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-02T10:00:00Z"));
  await page.goto(`${base}${teacher ? "/schedule/" : "/book/?view=lessons"}`);
  if (teacher) await expect(page.getByRole("button", { name: /^Weekly hours/ })).toBeVisible();
  else await expect(page.locator("button[data-date-key='2026-10-05']")).toBeVisible();
  return { context, page, errors, writes };
}
let cases = 0;
async function run(name, width, options, probe) {
  const state = await fixture(width, options);
  try {
    await probe(state);
    await state.page.waitForLoadState("networkidle");
    assert.deepEqual(state.errors, []);
    assert.ok(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await state.page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
    cases++; console.log(JSON.stringify({ name, width, passed: true, writes: state.writes }));
  } catch (error) {
    await state.page.screenshot({ path: `${output}/${name}-${width}-failure.png`, fullPage: true }).catch(() => {});
    console.log(JSON.stringify({ name, width, passed: false, error: String(error), errors: state.errors, writes: state.writes })); throw error;
  } finally { await state.context.close(); }
}
async function openLesson(page, attendance = false) {
  if (!attendance) await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page.getByRole("button", { name: attendance ? "Friday 2 October, show lessons" : "Monday 5 October, show lessons", exact: true }).click();
  const opener = page.getByRole("button", { name: /^Ana Martins,.*View lesson$/ });
  await opener.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  return { dialog, opener };
}
async function press(page, button) { await button.focus(); await page.keyboard.press("Enter"); }
async function saveMove(page, dialog, changeDate = false) {
  await press(page, dialog.getByRole("button", { name: "Move lesson", exact: true }));
  if (changeDate) {
    await dialog.getByLabel("New date", { exact: true }).fill("2026-10-06");
    await dialog.getByLabel("Time in Porto", { exact: true }).fill("15:45");
  }
  await press(page, dialog.getByRole("button", { name: "Save new time", exact: true }));
}
async function dragBetween(page, start, end) {
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
}
async function insidePoint(element) {
  const box = await element.boundingBox(); assert.ok(box);
  return { x: box.x + Math.min(20, box.width / 3), y: box.y + box.height / 2 };
}

try {
  for (const width of [320, 390, 1280]) {
    for (const action of ["escape", "move-same", "move-date", "cancel", "no-show", "undo-no-show"]) {
      const attendance = action.endsWith("no-show");
      const current = attendance ? { ...lesson, starts_at: "2026-10-02T08:00:00Z", ends_at: "2026-10-02T09:00:00Z", attendance_status: action === "undo-no-show" ? "no_show" : "expected" } : lesson;
      await run(`focus-${action}`, width, { current }, async state => {
        const { page } = state, { dialog, opener } = await openLesson(page, attendance);
        if (action === "escape") {
          for (let tab = 0; tab < 8; tab++) {
            await page.keyboard.press(tab % 2 ? "Shift+Tab" : "Tab");
            assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)));
          }
          await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
          await expect(opener).toBeFocused(); assert.deepEqual(state.writes, []);
        } else {
          if (action.startsWith("move")) await saveMove(page, dialog, action === "move-date");
          else if (action === "cancel") {
            await press(page, dialog.getByRole("button", { name: "Cancel lesson", exact: true }));
            await press(page, dialog.getByRole("button", { name: "Yes, cancel lesson", exact: true }));
          } else {
            await press(page, dialog.getByRole("button", { name: action === "undo-no-show" ? "Undo no-show" : "Mark no-show", exact: true }));
            await press(page, dialog.getByRole("button", { name: action === "undo-no-show" ? "Undo no-show" : "Confirm no-show", exact: true }));
          }
          await expect(dialog).toHaveCount(0); await expect(page.locator(".teacher-calendar-loading")).toHaveCount(0);
          await expect(page.locator("#teacher-week-title")).toBeFocused();
          // The week's help sits beside its heading, then Weekly hours.
          await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "How to take time off", exact: true })).toBeFocused();
          await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: /^Weekly hours/ })).toBeFocused();
          assert.equal(state.writes.length, 1);
        }
        assert.equal(await page.evaluate(() => document.body.style.overflow), "");
      });
    }
    await run("focus-reload-error", width, { reply(path, request, writes) {
      if (path === "/admin/bookings" && request.method() === "GET" && writes.length) return { status: 503, json: { error: "Isolated calendar read failure" } };
      return null;
    } }, async state => {
      const { page } = state, { dialog } = await openLesson(page);
      await saveMove(page, dialog);
      await expect(page.getByRole("alert").filter({ hasText: "Isolated calendar read failure" })).toBeVisible();
      await expect(page.locator("#teacher-week-title")).toBeFocused();
      await press(page, page.getByRole("button", { name: "Try again", exact: true }));
      await expect(page.locator("#teacher-week-title")).toBeFocused();
    });
    const started = deferred(), waiting = deferred();
    await run("focus-held-reload", width, { async reply(path, request, writes) {
      if (path === "/admin/bookings" && request.method() === "GET" && writes.length) { started.resolve(); await waiting.promise; }
      return null;
    } }, async state => {
      try {
        const { page } = state, { dialog } = await openLesson(page);
        await saveMove(page, dialog); await started.promise;
        await expect(dialog).toHaveCount(0); await expect(page.locator("#teacher-week-title")).toBeFocused();
        const week = page.getByRole("button", { name: "This week", exact: true });
        await week.focus(); waiting.resolve();
        await expect(page.locator(".teacher-calendar-loading")).toHaveCount(0);
        await expect(week).toBeFocused();
      } finally { waiting.resolve(); }
    });
    for (const kind of ["teacher", "terms", "calendar"]) await run(`backdrop-${kind}`, width, { teacher: kind === "teacher", calendarPrompt: kind === "calendar" }, async state => {
      const { page } = state;
      let dialog, content, opener;
      if (kind === "teacher") {
        ({ dialog, opener } = await openLesson(page));
        await dialog.getByRole("button", { name: "Move lesson", exact: true }).click();
        await dialog.getByLabel("New date", { exact: true }).fill("2026-10-06");
        await dialog.getByLabel("Time in Porto", { exact: true }).fill("15:45");
        content = dialog.getByText("The student will be emailed the new time.", { exact: true });
      } else if (kind === "terms") {
        opener = page.locator(".site-footer__legal a"); await opener.click();
        dialog = page.getByRole("dialog", { name: "Terms & privacy", exact: true });
        content = dialog.getByRole("heading", { name: "Terms & privacy", exact: true });
      } else {
        opener = page.locator("button[data-date-key='2026-10-05']"); await opener.click();
        dialog = page.getByRole("dialog", { name: "Your lessons", exact: true });
        content = dialog.locator("#calendar-booking-date");
      }
      await expect(dialog).toBeVisible();
      const outside = { x: 1, y: 1 }, inside = await insidePoint(content);
      await dragBetween(page, inside, outside); await expect(dialog).toBeVisible();
      if (kind === "teacher") {
        await expect(dialog.getByLabel("New date", { exact: true })).toHaveValue("2026-10-06");
        await expect(dialog.getByLabel("Time in Porto", { exact: true })).toHaveValue("15:45");
        await dragBetween(page, await insidePoint(dialog.getByLabel("Time in Porto", { exact: true })), outside);
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel("Time in Porto", { exact: true })).toHaveValue("15:45");
      }
      await dragBetween(page, outside, inside); await expect(dialog).toBeVisible();
      await page.mouse.click(outside.x, outside.y);
      if (kind === "terms") await expect(dialog).toBeHidden(); else await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused(); assert.deepEqual(state.writes, []);
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    });
    if (width < 821) await run("escape-account-under-calendar", width, { teacher: false, calendarPrompt: true }, async state => {
      const { page } = state;
      const menu = page.locator("#account-menu-button");
      await press(page, menu); await expect(menu).toHaveAttribute("aria-expanded", "true");
      const date = page.locator("button[data-date-key='2026-10-05']");
      let reached = false;
      for (let tab = 0; tab < 80; tab++) {
        await page.keyboard.press("Tab");
        if (await date.evaluate(element => element === document.activeElement)) { reached = true; break; }
      }
      assert.ok(reached, "A student can reach their date using Tab while the account menu is open");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Your lessons", exact: true });
      await expect(dialog).toBeVisible(); await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0); await expect(date).toBeFocused();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false"); await expect(menu).toBeFocused();
      assert.deepEqual(state.writes, []);
    });
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ engine, cases, completed: true }));
