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
const output = `tmp/qa/management-recovery/${engine}`;
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

async function chooseAccount(page, name) {
  await page.locator("#account-menu").waitFor({ state: "attached" });
  const toggle = page.locator("#account-menu-button");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#account-menu").getByRole("button", { name, exact: true }).click();
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

async function chooseBooking(page) {
  await page.goto(`${base}/book/?view=book`);
  await page.getByRole('radio', { name: 'Single', exact: true }).check();
  await page.locator('button[data-date-key="2026-10-06"]').click();
  const early = page.locator('.time-picker__parts input[value="early"]');
  if (await early.count()) await early.check();
  await page.getByRole('button', { name: '10:00', exact: true }).click();
  const agreement=page.getByRole('button', { name: 'Agree to terms & privacy', exact: true });
  if(await agreement.count())await agreement.click();
  await expect(page.getByRole('button', {name:'Book lesson & agree to pay',exact:true})).toBeEnabled();
}
function bookingDefaults(path) {
  if(path==='/lesson-types') return { json: {lessonTypes:types,postpay:true,paymentReady:true} };
  if(path==='/availability') return {json:{slotsByDate:{'2026-10-06':[{startAt:'2026-10-06T09:00:00Z',endAt:'2026-10-06T10:00:00Z'}]},timeZone:'Europe/Lisbon',horizonDays:84}};
  return null;
}

const meet = "https://meet.google.com/abc-defg-hij";
const weekly = { id: "weekly", weekday: 1, minuteOfDay: 660, occurrences: 4, openEnded: false, upcoming: 2 };
const nextOccurrence = { ...lesson, reference: "PT-NNNNNN", manageToken: "next", startAt: "2026-10-12T10:00:00Z", endAt: "2026-10-12T11:00:00Z", meetingUrl: meet, seriesId: "weekly" };

async function moveForm(page, sequence = false) {
  await page.goto(`${base}/book/?manage=fixture`);
  const dialog = page.getByRole("dialog");
  if (sequence) {
    await dialog.getByRole("button", { name: "Manage weekly lessons", exact: true }).click();
    await dialog.getByRole("button", { name: "Move weekly time", exact: true }).click();
  } else await dialog.getByRole("button", { name: "Change", exact: true }).click();
  const date = page.locator('button[data-date-key="2026-10-06"]');
  if (!await date.isVisible()) await dialog.getByRole("button", { name: "Show all", exact: true }).click();
  await date.click();
  const early = page.locator('.time-picker__parts input[value="early"]');
  if (await early.count()) await early.check();
  await dialog.getByRole("button", { name: "10:00", exact: true }).click();
  return dialog.getByRole("button", { name: sequence ? "Move weekly time" : "Change to 10:00", exact: true });
}

function managedReply(booking, sequence = false) {
  return { json: { booking, isPast: false, sameDayFeeApplies: false, recurring: sequence } };
}

function accountReply(bookings, series = []) {
  return { json: { student, bookings, series } };
}

function savedMove(booking, body) {
  return { ...booking, startAt: body.startAt, endAt: new Date(Date.parse(body.startAt) + 60 * 60000).toISOString(), location: body.location ?? booking.location, rescheduleCount: booking.rescheduleCount + 1 };
}

async function countIs(page, count) {
  await expect(page.locator("#account-menu").getByRole("button", { name: /^Your lessons/, includeHidden: true })).toHaveText(count ? `Your lessons ${count}` : "Your lessons");
}

function stripeFixture(failInit) {
  return `
    window.qaStripeSecrets = [];
    window.Stripe = () => ({
      initEmbeddedCheckout: async ({clientSecret}) => {
        window.qaStripeSecrets.push(clientSecret);
        if (${JSON.stringify(failInit)} && window.qaStripeSecrets.length === 1) throw new Error('Payment setup interrupted.');
        return {
          mount(element) { element.innerHTML = '<p>Isolated secure payment form</p>'; },
          destroy() { document.querySelector('.booking-payment__mount')?.replaceChildren(); }
        };
      }
    });
  `;
}

let cases = 0;
try {
  for (const width of [320, 390, 1280]) {
    // A move's accepted POST already contains its saved booking. A failed
    // detail reread cannot restore the unsaved form, including kept occurrences.
    for (const mode of ["single", "sequence", "kept"]) {
      const sequence = mode !== "single", kept = mode === "kept";
      const original = { ...lesson, meetingUrl: meet, seriesId: sequence ? "weekly" : null, ...(kept ? { startAt: "2026-10-02T18:00:00Z", endAt: "2026-10-02T19:00:00Z" } : {}) };
      let current = original, next = { ...nextOccurrence }, moved = false, posts = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/me") return accountReply(sequence ? [current, next] : [current], sequence ? [weekly] : []);
        if (path === "/bookings/fixture") return moved
          ? { status: 503, json: { error: "Old lesson details are unavailable." } }
          : managedReply(current, sequence);
        if (path === "/bookings/fixture/reschedule" || path === "/series/weekly/reschedule") {
          posts += 1;
          moved = true;
          const body = request.postDataJSON();
          if (!kept) current = savedMove(current, body);
          if (sequence) next = savedMove(next, { ...body, startAt: new Date(Date.parse(body.startAt) + (kept ? 0 : 7) * 86400000).toISOString() });
          return sequence
            ? { json: { ok: true, moved: kept ? 1 : 2, kept: kept ? [original.startAt] : [], bookings: kept ? [next] : [current, next] } }
            : { json: { booking: current, sameDayFeeApplied: false } };
        }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await (await moveForm(page, sequence)).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: "All sorted", exact: true })).toBeVisible();
        await expect(dialog.locator(".lesson-manage-dialog__lesson")).toContainText(kept ? "Friday, 2 October 2026, 19:00" : "Tuesday, 6 October 2026, 10:00");
        if (kept) await expect(dialog.getByRole("status")).toContainText("stays where it is");
        await expect(page.getByText("Old lesson details are unavailable.", { exact: true })).toHaveCount(0);
        await check(state);
        assert.equal(posts, 1);
        await dialog.getByRole("button", { name: "Done", exact: true }).click();
        await check(state);
        assert.equal(posts, 1);
        cases += 1;
      } finally { await state.context.close(); }
    }

    // Inputs and navigation are stable while saving either an individual
    // lesson or its sequence; completion reflects the submitted choices.
    for (const sequence of [false, true]) {
      const started = deferred(), waiting = deferred();
      let current = { ...lesson, meetingUrl: meet, seriesId: sequence ? "weekly" : null }, posts = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/me") return accountReply([current], sequence ? [weekly] : []);
        if (path === "/bookings/fixture") return managedReply(current, sequence);
        if (path === "/bookings/fixture/reschedule" || path === "/series/weekly/reschedule") {
          posts += 1;
          started.resolve();
          await waiting.promise;
          current = savedMove(current, request.postDataJSON());
          return sequence ? { json: { ok: true, moved: 1, kept: [], bookings: [current] } } : { json: { booking: current, sameDayFeeApplied: false } };
        }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await (await moveForm(page, sequence)).click();
        await started.promise;
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("button", { name: sequence ? "Keep current schedule" : "Keep current time", exact: true })).toBeDisabled();
        await expect(dialog.getByRole("button", { name: "10:00", exact: true })).toBeDisabled();
        await expect(page.locator('button[data-date-key="2026-10-06"]')).toBeDisabled();
        for (const input of await dialog.locator("input[type=radio]").all()) await expect(input).toBeDisabled();
        for (const button of await dialog.locator(".calendar-pager button, .unified-calendar__expand").all()) await expect(button).toBeDisabled();
        waiting.resolve();
        await expect(page.getByRole("dialog").getByRole("heading", { name: "All sorted", exact: true })).toBeVisible();
        await expect(page.getByRole("dialog").locator(".lesson-manage-dialog__lesson")).toContainText("Tuesday, 6 October 2026, 10:00");
        assert.equal(posts, 1);
        await check(state);
        cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Every accepted change remains successful when the calendar GET fails.
    // Retry is accessible in the modal and after Done, and never repeats a POST.
    for (const action of ["move", "cancel", "stop", "bulk"]) {
      const sequence = action === "stop" || action === "bulk";
      let current = { ...lesson, meetingUrl: meet, seriesId: sequence ? "weekly" : null }, next = { ...nextOccurrence };
      let changed = false, recovered = false, posts = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/me") return changed && !recovered
          ? { status: 503, json: { error: "Calendar temporarily unavailable." } }
          : accountReply(sequence ? [current, next] : [current], sequence && !changed ? [weekly] : []);
        if (path === "/bookings/fixture") return managedReply(current, sequence);
        if (path === "/bookings/fixture/reschedule") {
          posts += 1; changed = true; current = savedMove(current, request.postDataJSON());
          return { json: { booking: current, sameDayFeeApplied: false } };
        }
        if (path === "/bookings/fixture/cancel") {
          posts += 1; changed = true; current = { ...current, status: "cancelled" };
          return { json: { booking: current, sameDayFeeApplied: false } };
        }
        if (path === "/series/weekly/stop") {
          posts += 1; changed = true;
          if (request.postDataJSON().cancelRemaining) { current = { ...current, status: "cancelled" }; next = { ...next, status: "cancelled" }; }
          return { json: { ok: true, stopped: true, cancelled: action === "bulk" ? 2 : 0, kept: 0, refunded: 0, pendingRefunds: 0 } };
        }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        if (action === "move") await (await moveForm(page)).click();
        else {
          await page.goto(`${base}/book/?manage=fixture`);
          const dialog = page.getByRole("dialog");
          if (action === "cancel") {
            await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
            await dialog.getByRole("button", { name: "Yes, cancel it", exact: true }).click();
          } else {
            await dialog.getByRole("button", { name: "Manage weekly lessons", exact: true }).click();
            await dialog.getByRole("button", { name: action === "bulk" ? "Cancel all booked lessons" : "Stop repeating", exact: true }).click();
            await dialog.getByRole("button", { name: action === "bulk" ? "Yes, cancel all" : "Yes, stop repeating", exact: true }).click();
          }
        }
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: "All sorted", exact: true })).toBeVisible();
        await expect(dialog.getByRole("status")).toContainText(action === "move" ? "has been changed" : action === "cancel" ? "has been cancelled" : "weekly lessons have stopped");
        const warning = page.getByRole("alert").filter({ hasText: "We couldn’t refresh your account just now." });
        await expect(warning).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
        assert.equal(posts, 1);
        await check(state);
        if (width !== 390 && action === "cancel") await page.screenshot({ path: `${output}/cancel-recovery-${width}.png`, fullPage: true });
        // Exercise both retry locations through the same UI.
        if (width !== 390) await dialog.getByRole("button", { name: "Done", exact: true }).click();
        recovered = true;
        await warning.getByRole("button", { name: "Try again", exact: true }).click();
        await expect(warning).toHaveCount(0);
        if (width === 390) await dialog.getByRole("button", { name: "Done", exact: true }).click();
        await countIs(page, action === "move" ? 1 : action === "stop" ? 2 : 0);
        await expect(page.getByText("Calendar temporarily unavailable.", { exact: true })).toHaveCount(0);
        if (action === "move") {
          await expect(page.locator('button[data-date-key="2026-10-06"]')).toHaveClass(/has-booking/);
          await expect(page.locator('button[data-date-key="2026-10-05"]')).not.toHaveClass(/has-booking/);
        } else if (action === "cancel" || action === "bulk") {
          await expect(page.locator('button[data-date-key="2026-10-05"]')).not.toHaveClass(/has-booking/);
        } else await expect(page.locator(".unified-calendar__legend")).not.toContainText("Weekly lesson");
        assert.equal(posts, 1);
        await check(state);
        cases += 1;
      } finally { await state.context.close(); }
    }

    // A manual availability reload after a conflict used to survive a length
    // change. Deliver its older success or failure after the new lookup.
    for (const status of [200, 503]) {
      const started = deferred(), waiting = deferred();
      let conflict = false, gated = false;
      const state = await fixture(width, async (path, request) => {
        if (path === "/bookings" && request.method() === "POST") {
          conflict = true;
          return { status: 409, json: { error: "That time is no longer available. Choose another time." } };
        }
        if (path === "/availability") {
          if (new URL(request.url()).searchParams.get("lessonType") === "long") return { json: { slotsByDate: { "2026-10-06": [{ startAt: "2026-10-06T12:00:00Z", endAt: "2026-10-06T13:30:00Z" }] }, timeZone: "Europe/Lisbon", horizonDays: 84 } };
          if (conflict && !gated) {
            gated = true; started.resolve(); await waiting.promise;
            if (status === 503) return { status, json: { error: "The old availability request failed." } };
          }
        }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await chooseBooking(page);
        await page.getByRole("button", { name: "Book lesson & agree to pay", exact: true }).click();
        await started.promise;
        const length = page.getByRole("radio", { name: "90-minute lesson · €35", exact: true });
        await length.check();
        await expect(page.getByRole("button", { name: "13:00", exact: true })).toBeVisible();
        const response = page.waitForResponse(r => new URL(r.url()).pathname === "/availability" && new URL(r.url()).searchParams.get("lessonType") === "single");
        waiting.resolve(); await response;
        await check(state);
        await expect(length).toBeChecked();
        await expect(page.getByRole("button", { name: "13:00", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "10:00", exact: true })).toHaveCount(0);
        await expect(page.getByText("The old availability request failed.", { exact: true })).toHaveCount(0);
        cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // SDK failures can be retried in place, using the existing held booking
    // and client secret. All SDK code is local; no provider is contacted.
    for (const failure of ["missing", "network", "initialization"]) {
      let loads = 0, posts = 0;
      const secret = "cs_test_isolated_secret_placeholder";
      const state = await fixture(width, async (path, request) => {
        if (path === "/bookings" && request.method() === "POST") { posts += 1; return { json: { booking: { ...lesson, status: "pending_payment" }, checkoutClientSecret: secret } }; }
        return bookingDefaults(path);
      });
      await state.context.route("https://js.stripe.com/**", async route => {
        loads += 1;
        if (loads === 1 && failure === "network") return route.abort();
        return route.fulfill({ contentType: "application/javascript", body: loads === 1 && failure === "missing" ? "/* Payment library unavailable */" : stripeFixture(failure === "initialization") });
      });
      try {
        const { page } = state;
        await chooseBooking(page);
        await page.getByRole("button", { name: "Book lesson & agree to pay", exact: true }).click();
        const warning = page.locator(".booking-payment").getByRole("alert");
        await expect(warning).toContainText(failure === "initialization" ? "Payment setup interrupted." : "The payment form couldn’t load.");
        await check(state);
        if (failure === "missing" && width !== 390) await page.screenshot({ path: `${output}/payment-form-retry-${width}.png`, fullPage: true });
        await warning.getByRole("button", { name: "Try again", exact: true }).click();
        await expect(page.locator(".booking-payment__mount")).toContainText("Isolated secure payment form");
        await expect(warning).toHaveCount(0);
        assert.equal(posts, 1);
        assert.equal(loads, failure === "initialization" ? 1 : 2);
        assert.deepEqual(await page.evaluate(() => window.qaStripeSecrets), failure === "initialization" ? [secret, secret] : [secret]);
        await check(state);
        cases += 1;
      } finally { await state.context.close(); }
    }

    // The original checkout return does not belong to a signed-out or
    // replacement account, including an older lookup failure and its retries.
    for (const session of ["", "replacement-session"]) {
      for (const status of [200, 503]) {
        const started = deferred(), waiting = deferred();
        let lookups = 0;
        const state = await fixture(width, async (path, request) => {
          if (path === "/bookings/fixture") {
            lookups += 1; started.resolve(); await waiting.promise;
            return status === 200 ? managedReply(lesson) : { status, json: { error: "The old checkout lookup failed." } };
          }
          if (path === "/me" && request.headers().authorization === "Bearer replacement-session") return { json: { student: { ...student, id: "replacement", name: "Replacement Student" }, bookings: [], series: [] } };
          return null;
        });
        try {
          const { page } = state;
          await page.goto(`${base}/book/?view=lessons&card=saved&manage=fixture`);
          await started.promise;
          await page.evaluate(value => {
            const key = "ines-student-session", oldValue = localStorage.getItem(key);
            if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
            window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue: value || null }));
          }, session);
          const response = page.waitForResponse("**/bookings/fixture");
          waiting.resolve(); await response;
          await check(state);
          await expect(page.locator(".booking-card-return")).toHaveCount(0);
          await expect(page.getByText("The old checkout lookup failed.", { exact: true })).toHaveCount(0);
          assert.equal(lookups, 1);
          assert.equal(await page.evaluate(() => localStorage.getItem("ines-student-session")), session || null);
          cases += 1;
        } finally { waiting.resolve(); await state.context.close(); }
      }
    }

    // The calendar and account bar receive the same refreshed lesson data.
    // Keep profile drafts when a meeting poll also discovers another booking.
    {
      let managementReads = 0, ready = false;
      const added = { ...nextOccurrence, seriesId: null, startAt: "2026-10-06T09:00:00Z", endAt: "2026-10-06T10:00:00Z" };
      const state = await fixture(width, async path => {
        if (path === "/bookings/fixture") {
          if (++managementReads >= 2) ready = true;
          return managedReply({ ...lesson, meetingUrl: ready ? meet : null });
        }
        if (path === "/me") return accountReply(ready ? [lesson, added] : [lesson]);
        return null;
      });
      try {
        const { page } = state;
        await page.goto(`${base}/book/?view=lessons`);
        await countIs(page, 1);
        await chooseAccount(page, "Edit details");
        await page.getByLabel("Your name", { exact: true }).fill("Ana draft");
        await page.getByLabel("NIF (optional)").fill("248899945");
        await chooseAccount(page, "Done editing");
        await page.locator(".lesson-overview__next-open").click();
        await expect(page.getByRole("dialog").getByRole("link", { name: "Join Google Meet", exact: true })).toBeVisible();
        await check(state);
        await page.getByRole("button", { name: "Close lesson management", exact: true }).click();
        await countIs(page, 2);
        await expect(page.locator('button[data-date-key="2026-10-06"]')).toHaveClass(/has-booking/);
        await chooseAccount(page, "Edit details");
        await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Ana draft");
        await expect(page.getByLabel("NIF (optional)")).toHaveValue("248899945");
        await check(state);
        cases += 1;
      } finally { await state.context.close(); }
    }
    console.log(`${engine} management and payment recovery passed at ${width}px.`);
  }
  console.log(`${cases} isolated management and payment recovery cases passed in ${engine}.`);
} finally { await browser.close(); }
