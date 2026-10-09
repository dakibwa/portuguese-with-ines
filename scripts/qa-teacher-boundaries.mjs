import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";

// Isolated teacher workflows. Every API mutation and Google/Stripe request is
// intercepted. This suite never creates real lessons, accounts, emails or payments.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const engine = process.env.QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unknown QA_BROWSER: ${engine}`);
const browser = await browserType.launch({ headless: true });
const output = process.env.QA_OUTPUT_DIR ?? `tmp/qa/teacher-boundaries/${engine}`;
await mkdir(output, { recursive: true });
const student = { id: "teacher", name: "Inês", email: "ines@example.invalid", role: "teacher", nif: "", phone: "", timezone: "Europe/Lisbon" };
const booking = { id: "lesson", reference: "PT-ACDEFG", status: "confirmed", starts_at: "2026-10-05T10:00:00Z", ends_at: "2026-10-05T11:00:00Z", lesson_name: "60 minutes", student_name: "Ana Martins", student_email: "ana@example.invalid", student_phone: "", location: "online", notes: "", payment_status: "scheduled", attendance_status: "expected", same_day_change: 0, same_day_fee_status: "not_required", reschedule_count: 0 };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const apiPath = path => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$|bookings(?:\/|$)|series\/|admin\/)/.test(path);

async function fixture(width, { rules = [], interval = 15, current = booking, reply = () => null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
  await context.addInitScript(() => { localStorage.setItem("ines-student-session", "isolated-teacher"); });
  const errors = [], writes = [];
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.hostname === "accounts.google.com") return route.fulfill({ contentType: "application/javascript", body: "window.google={accounts:{id:{initialize(){},renderButton(){}}}};" });
    if (url.hostname === "js.stripe.com") return route.fulfill({ contentType: "application/javascript", body: "window.Stripe=()=>({});" });
    if (url.hostname === "api.stripe.com") return route.abort();
    if (!apiPath(path)) {
      if (url.origin === new URL(base).origin) return route.continue();
      errors.push(`Unexpected external request ${request.method()} ${url.origin}${path}`);
      return route.abort();
    }
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.method() === "POST") writes.push({ path, body: request.postDataJSON() });
    const answer = await reply(path, request, writes);
    if (answer) return route.fulfill({ headers: cors, ...answer });
    if (request.method() === "GET") {
      if (path === "/me") return route.fulfill({ headers: cors, json: { student, bookings: [], series: [], sameDayFeeCents: 500 } });
      if (path === "/admin/availability") return route.fulfill({ headers: cors, json: { rules, exceptions: [], settings: { slotIntervalMinutes: interval } } });
      if (path === "/admin/bookings") return route.fulfill({ headers: cors, json: { bookings: current ? [current] : [] } });
      if (path === "/admin/google-calendar") return route.fulfill({ headers: cors, json: { configured: false, connected: false, needsReconnect: false, pending: 0 } });
    }
    if (request.method() === "POST" && path === "/admin/availability") return route.fulfill({ headers: cors, json: { ok: true, count: writes.at(-1).body.rules.length } });
    if (request.method() === "POST" && (path === "/admin/bookings" || path === "/admin/bookings/lesson/reschedule")) return route.fulfill({ headers: cors, json: { booking: { reference: booking.reference } } });
    errors.push(`Unexpected ${request.method()} ${path}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-02T10:00:00Z"));
  await page.goto(`${base}/schedule/`);
  await expect(page.getByRole("button", { name: /^Weekly hours/ })).toBeVisible();
  return { context, page, errors, writes };
}
let cases = 0;
async function run(name, width, options, probe) {
  const state = await fixture(width, options);
  try {
    await probe(state);
    await state.page.waitForLoadState("networkidle");
    assert.deepEqual(state.errors, []);
    const layout = await state.page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth }));
    assert.equal(layout.actual <= layout.width + 1, true, JSON.stringify(layout));
    await state.page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
    cases += 1;
    console.log(JSON.stringify({ name, width, passed: true, writes: state.writes }));
  } catch (error) {
    await state.page.screenshot({ path: `${output}/${name}-${width}-failure.png`, fullPage: true }).catch(() => {});
    console.log(JSON.stringify({ name, width, passed: false, error: String(error), errors: state.errors, writes: state.writes }));
    throw error;
  } finally { await state.context.close(); }
}
const cell = (page, day, minute) => page.locator(`[data-slot-day="${day}"][data-slot-minute="${minute}"]`);
const rule = (weekday, start, end, id = 1) => ({ id, weekday, start_minute: start, last_start_minute: end });
const untouchedRules = [rule(1, 705, 705, 80), rule(2, 607, 637, 81)];
const wire = (weekday, startMinute, lastStartMinute) => ({ weekday, startMinute, lastStartMinute });
const untouchedWire = [wire(1, 705, 705), wire(2, 607, 637)];
function sortedRules(rules) { return [...rules].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.lastStartMinute - b.lastStartMinute); }
async function hours(page) {
  await page.getByRole("button", { name: /^Weekly hours/ }).click();
  await page.getByRole("button", { name: "Monday, show weekly hours", exact: true }).click();
}
async function activate(control, method) {
  if (method === "keyboard") { await control.focus(); await control.press("Space"); }
  else await control.click();
}
async function save(state, expected, count) {
  await state.page.getByRole("button", { name: "Save weekly hours", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(count);
  await expect(state.page.getByText("Teaching hours saved. Students can now book these times.", { exact: true })).toBeVisible();
  assert.deepEqual(sortedRules(state.writes.at(-1).body.rules), sortedRules(expected));
}
async function drag(page, from, to) {
  const first = cell(page, 1, from), last = cell(page, 1, to);
  await first.scrollIntoViewIfNeeded();
  const f = await first.boundingBox(), l = await last.boundingBox();
  assert.ok(f && l);
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2, { steps: 5 });
  await page.mouse.up();
}
async function formFor(page, action, current = booking) {
  if (action === "manual") {
    await page.getByText("Add a lesson for a student", { exact: true }).click();
    const form = page.locator(".teacher-manual-form");
    await form.getByLabel("Student’s email", { exact: true }).fill("ana@example.invalid");
    await form.getByLabel("Student’s name", { exact: true }).fill("Ana Martins");
    return { form, date: form.getByLabel("Date", { exact: true }), time: form.getByLabel("Time in Porto", { exact: true }), submit: form.getByRole("button", { name: "Add lesson and email student", exact: true }) };
  }
  const fold = current.starts_at.startsWith("2026-10-25");
  for (let week = 0; week < (fold ? 3 : 1); week++) await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page.getByRole("button", { name: fold ? "Sunday 25 October, show lessons" : "Monday 5 October, show lessons", exact: true }).click();
  await page.getByRole("button", { name: /^Ana Martins,.*View lesson$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move lesson", exact: true }).click();
  const form = page.locator(".teacher-move-form");
  return { form, date: form.getByLabel("New date", { exact: true }), time: form.getByLabel("Time in Porto", { exact: true }), submit: form.getByRole("button", { name: "Save new time", exact: true }) };
}
async function success(page, action) {
  await expect(page.getByRole("status").filter({ hasText: action === "manual" ? "Lesson added." : "Lesson moved." })).toBeVisible();
}
const ordinary = [
  { name: "winter", date: "2027-01-15", time: "17:00", utc: "2027-01-15T17:00:00Z" },
  { name: "summer", date: "2027-07-15", time: "17:00", utc: "2027-07-15T16:00:00Z" },
  { name: "before-spring", date: "2027-03-28", time: "00:30", utc: "2027-03-28T00:30:00Z" },
  { name: "after-spring", date: "2027-03-28", time: "02:00", utc: "2027-03-28T01:00:00Z" }
];
try {
  for (const width of [320, 390, 1280]) {
    for (const selected of [600, 615, "full"]) {
      const method = selected === 600 ? "keyboard" : "mouse";
      const localRules = selected === "full" ? [rule(1, 600, 615)] : [rule(1, selected, selected)];
      await run(`cell-${selected}`, width, { rules: [...localRules, ...untouchedRules] }, async state => {
        const { page } = state;
        await hours(page);
        const target = cell(page, 1, 600);
        await expect(target).toHaveAttribute("aria-pressed", selected === "full" ? "true" : "mixed");
        const label = await target.getAttribute("aria-label");
        assert.ok(label.includes(selected === "full" ? "10:00 and 10:15" : selected === 600 ? "10:00" : "10:15"), label);
        if (selected !== "full") await expect(target).toHaveText(selected === 600 ? "10:00" : "10:15");
        await activate(target, method);
        await expect(target).toHaveAttribute("aria-pressed", "false");
        await save(state, untouchedWire, 1);
        await activate(target, method === "mouse" ? "keyboard" : "mouse");
        await expect(target).toHaveAttribute("aria-pressed", "true");
        await save(state, [wire(1, 600, 615), ...untouchedWire], 2);
      });
    }
    await run("multiple-partial-cells", width, { rules: [rule(1, 615, 615), rule(1, 645, 645, 2), ...untouchedRules] }, async state => {
      await hours(state.page);
      await expect(cell(state.page, 1, 600)).toHaveAttribute("aria-pressed", "mixed");
      await expect(cell(state.page, 1, 630)).toHaveAttribute("aria-pressed", "mixed");
      await activate(cell(state.page, 1, 600), "keyboard");
      await expect(cell(state.page, 1, 630)).toHaveAttribute("aria-pressed", "mixed");
      await save(state, [wire(1, 645, 645), ...untouchedWire], 1);
      await activate(cell(state.page, 1, 630), "mouse");
      await save(state, untouchedWire, 2);
    });
    await run("empty-cell", width, { rules: untouchedRules }, async state => {
      await hours(state.page);
      await expect(cell(state.page, 1, 600)).toHaveAttribute("aria-pressed", "false");
      await activate(cell(state.page, 1, 600), "keyboard");
      await save(state, [wire(1, 600, 615), ...untouchedWire], 1);
    });
    for (const backwards of [false, true]) await run(`drag-${backwards ? "up" : "down"}`, width, { rules: [rule(1, 600, 675), ...untouchedRules] }, async state => {
      await hours(state.page);
      await drag(state.page, backwards ? 630 : 600, backwards ? 600 : 630);
      await expect(cell(state.page, 1, 600)).toHaveAttribute("aria-pressed", "false");
      await expect(cell(state.page, 1, 630)).toHaveAttribute("aria-pressed", "false");
      await expect(cell(state.page, 1, 660)).toHaveAttribute("aria-pressed", "true");
      await save(state, [wire(1, 660, 675), ...untouchedWire], 1);
    });
    for (const interval of [15, 30, 60]) await run(`off-grid-${interval}`, width, { rules: [rule(1, 607, 637)], interval }, async state => {
      await hours(state.page);
      await activate(cell(state.page, 1, 600), "keyboard");
      await expect(state.page.locator(".teacher-exact-hours")).toHaveAttribute("open", "");
      await expect(state.page.getByLabel("Monday window 1, first start", { exact: true })).toHaveValue("10:07");
      await expect(state.page.getByLabel("Monday window 1, last start", { exact: true })).toHaveValue("10:37");
      await expect(state.page.getByRole("button", { name: "Save weekly hours", exact: true })).toBeDisabled();
      assert.deepEqual(state.writes, []);
    });
    for (const action of ["manual", "move"]) {
      await run(`${action}-gap-retry`, width, {}, async state => {
        const form = await formFor(state.page, action);
        await form.date.fill("2027-03-28");
        await form.time.fill("01:30");
        await form.submit.click();
        await expect(state.page.getByRole("alert").filter({ hasText: "because the clocks change" })).toBeVisible();
        await expect(form.date).toHaveValue("2027-03-28");
        await expect(form.time).toHaveValue("01:30");
        await expect(form.submit).toBeEnabled();
        assert.deepEqual(state.writes, []);
        await form.time.fill("02:30");
        await form.submit.click();
        await success(state.page, action);
        assert.equal(state.writes.length, 1);
        assert.equal(Date.parse(state.writes[0].body.startAt), Date.parse("2027-03-28T01:30:00Z"));
      });
      for (const value of ordinary) await run(`${action}-${value.name}`, width, {}, async state => {
        const form = await formFor(state.page, action);
        await form.date.fill(value.date);
        await form.time.fill(value.time);
        await form.submit.click();
        await success(state.page, action);
        assert.equal(state.writes.length, 1);
        assert.equal(Date.parse(state.writes[0].body.startAt), Date.parse(value.utc));
      });
      await run(`${action}-server-refusal-retry`, width, { reply(path, request, writes) {
        if (request.method() === "POST" && (path === "/admin/bookings" || path === "/admin/bookings/lesson/reschedule") && writes.length === 1) return { status: 503, json: { error: "Isolated save refused. Try again." } };
        return null;
      } }, async state => {
        const form = await formFor(state.page, action);
        await form.date.fill("2027-01-15");
        await form.time.fill("17:00");
        await form.submit.click();
        await expect(state.page.getByRole("alert").filter({ hasText: "Isolated save refused" })).toBeVisible();
        await expect(form.date).toHaveValue("2027-01-15");
        await expect(form.time).toHaveValue("17:00");
        await expect(form.submit).toBeEnabled();
        await form.time.fill("17:30");
        await form.submit.click();
        await success(state.page, action);
        assert.equal(state.writes.length, 2);
        assert.equal(Date.parse(state.writes[1].body.startAt), Date.parse("2027-01-15T17:30:00Z"));
      });
    }
    for (const occurrence of ["first", "second"]) for (const changed of [false, true]) {
      const current = { ...booking, starts_at: occurrence === "first" ? "2026-10-25T00:30:00Z" : "2026-10-25T01:30:00Z", ends_at: occurrence === "first" ? "2026-10-25T01:30:00Z" : "2026-10-25T02:30:00Z" };
      await run(`move-fold-${occurrence}-${changed ? "edit" : "unchanged"}`, width, { current }, async state => {
        const form = await formFor(state.page, "move", current);
        await expect(form.date).toHaveValue("2026-10-25");
        await expect(form.time).toHaveValue("01:30");
        if (changed) await form.time.fill("01:45");
        await form.submit.click();
        await success(state.page, "move");
        assert.equal(state.writes.length, 1);
        assert.equal(Date.parse(state.writes[0].body.startAt), Date.parse(current.starts_at) + (changed ? 15 * 60000 : 0));
      });
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ engine, cases, completed: true }));
