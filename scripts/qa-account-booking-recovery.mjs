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
const output = `tmp/qa/account-booking-recovery/${engine}`;
await mkdir(output, { recursive: true });
const student = { id: "continuity", name: "Ana Martins", email: "ana@example.invalid", nif: "", phone: "", timezone: "Europe/Lisbon", role: "student" };
const types = [
  { id: "trial", name: "Trial lesson", duration_minutes: 60, price_cents: 2000 },
  { id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 }
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
  await context.route(url => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$|bookings(?:\/|$)|admin\/)/.test(url.pathname), async route => {
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

async function leaveForFaq(page) {
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: 'FAQ', exact: true }).first().click();
  await expect(page).toHaveURL(/\/faq\/?$/);
  await page.evaluate(() => history.replaceState(history.state, '', '/faq/?source=keep#before-you-book'));
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

let cases = 0;
try {
  for (const width of [320, 390, 1280]) {
    // Opening an editor can queue browser work for the next frame. If the
    // student already selected a field, later frame callbacks must not move
    // their focus or subsequent typing into a different field.
    for (const field of ["name", "email", "nif"]) {
      const state = await fixture(width);
      try {
        const { page } = state;
        await page.goto(`${base}/book/?view=lessons`);
        await page.locator("#account-menu").waitFor({ state: "attached" });
        await check(state);
        await page.evaluate(() => {
          const nativeFrame = window.requestAnimationFrame.bind(window);
          const nativeCancel = window.cancelAnimationFrame.bind(window);
          const frames = new Map();
          let nextId = 0, holding = true;
          window.requestAnimationFrame = callback => {
            if (!holding) return nativeFrame(callback);
            const id = --nextId; frames.set(id, callback); return id;
          };
          window.cancelAnimationFrame = id => {
            if (id < 0) frames.delete(id); else nativeCancel(id);
          };
          window.qaReleaseEditorFrames = () => {
            holding = false;
            const callbacks = [...frames.values()]; frames.clear();
            for (const callback of callbacks) callback(performance.now());
          };
        });
        await chooseAccount(page, "Edit details");
        const input = page.getByLabel(field === "name" ? "Your name" : field === "email" ? "Email address" : "NIF (optional)", { exact: true });
        const value = field === "name" ? "Ana Draft" : field === "email" ? "draft@example.invalid" : "248899945";
        await input.fill(value);
        await page.evaluate(() => window.qaReleaseEditorFrames());
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(value);
        if (field !== "name") await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(student.name);
        await check(state); cases += 1;
      } finally { await state.context.close(); }
    }
    if (process.env.QA_ACCOUNT_FOCUS_ONLY === "1") continue;

    // The current Worker rotates the session; an older Worker may omit it.
    // Neither reply owns the saved name, NIF draft, or newer email draft.
    for (const rotate of [false, true]) {
      for (const newerEmail of [false, true]) {
        const started = deferred(), waiting = deferred(), profilePosts = [];
        let confirmations = 0, serverStudent = { ...student };
        const state = await fixture(width, async (path, request) => {
          if (path === "/me/email/confirm") {
            confirmations += 1;
            const snapshot = { ...serverStudent, email: "verified@example.invalid" };
            started.resolve();
            await waiting.promise;
            serverStudent.email = snapshot.email;
            return { json: { student: snapshot, ...(rotate ? { session: "renewed-continuity" } : {}) } };
          }
          if (path === "/me") {
            if (request.method() === "POST") {
              const body = request.postDataJSON();
              profilePosts.push(body);
              Object.assign(serverStudent, body);
              return { json: { student: { ...serverStudent } } };
            }
            return { json: { student: { ...serverStudent }, bookings: [lesson], series: [] } };
          }
          return null;
        });
        try {
          const { page } = state;
          await page.goto(`${base}/book/?view=lessons&emailToken=isolated&source=email#account`);
          await started.promise;
          await chooseAccount(page, "Edit details");
          const name = page.getByLabel("Your name", { exact: true });
          const nif = page.getByLabel("NIF (optional)");
          const email = page.getByLabel("Email address", { exact: true });
          const saveName = page.getByRole("button", { name: "Save name", exact: true });
          const saveNif = page.getByRole("button", { name: "Save NIF", exact: true });
          await name.fill("Ana Saved");
          await saveName.click();
          await expect(saveName).toBeDisabled();
          await nif.fill("248899945");
          if (newerEmail) await email.fill("later@example.invalid");
          const response = page.waitForResponse("**/me/email/confirm");
          waiting.resolve();
          await response;
          await expect(page.getByRole("status").filter({ hasText: "That's your email address updated." })).toBeVisible();
          await expect(name).toHaveValue("Ana Saved");
          await expect(saveName).toBeDisabled();
          await expect(nif).toHaveValue("248899945");
          await expect(saveNif).toBeEnabled();
          await expect(email).toHaveValue(newerEmail ? "later@example.invalid" : "verified@example.invalid");
          const sendEmail = page.getByRole("button", { name: "Send confirmation link", exact: true });
          if (newerEmail) await expect(sendEmail).toBeEnabled();
          else await expect(sendEmail).toBeDisabled();
          assert.equal(await page.evaluate(() => localStorage.getItem("ines-student-session")), rotate ? "renewed-continuity" : "isolated-continuity");
          assert.equal(new URL(page.url()).search, "?view=lessons&source=email");
          assert.equal(new URL(page.url()).hash, "#account");
          assert.equal(confirmations, 1);
          await check(state);
          if (rotate && !newerEmail && width !== 390) await page.screenshot({ path: `${output}/email-renewal-${width}.png`, fullPage: true });
          await saveNif.click();
          await expect(saveNif).toBeDisabled();
          assert.deepEqual(profilePosts, [{ name: "Ana Saved" }, { nif: "248899945" }]);
          await chooseAccount(page, "Done editing");
          await chooseAccount(page, "Edit details");
          await expect(name).toHaveValue("Ana Saved");
          await expect(nif).toHaveValue("248899945");
          await expect(email).toHaveValue(newerEmail ? "later@example.invalid" : "verified@example.invalid");
          await check(state);
          await page.reload();
          await chooseAccount(page, "Edit details");
          await expect(email).toHaveValue("verified@example.invalid");
          assert.equal(confirmations, 1);
          assert.equal(await page.evaluate(() => localStorage.getItem("ines-student-session")), rotate ? "renewed-continuity" : "isolated-continuity");
          await check(state);
          cases += 1;
        } finally { waiting.resolve(); await state.context.close(); }
      }
    }

    // A successful email change still renews the session after leaving, but
    // neither its success nor its failure owns the next page's URL or feedback.
    for (const status of [200, 503]) {
      const started = deferred(), waiting = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/me/email/confirm") return null;
        started.resolve();
        await waiting.promise;
        return status === 200
          ? { json: { student: { ...student, email: "verified@example.invalid" }, session: "renewed-continuity" } }
          : { status, json: { error: "The old email request failed." } };
      });
      try {
        const { page } = state;
        await page.goto(`${base}/book/?view=lessons&emailToken=isolated&source=email#account`);
        await started.promise;
        await leaveForFaq(page);
        const before = page.url(), response = page.waitForResponse("**/me/email/confirm");
        waiting.resolve();
        await response;
        await check(state);
        assert.equal(page.url(), before);
        await expect(page.getByText("The old email request failed.", { exact: true })).toHaveCount(0);
        assert.equal(await page.evaluate(() => localStorage.getItem("ines-student-session")), status === 200 ? "renewed-continuity" : "isolated-continuity");
        cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Returning to lessons starts a reload. Save a profile field while the
    // old snapshot is waiting; it must remain saved in the reopened editor.
    for (const field of ["name", "nif"]) {
      const started = deferred(), waiting = deferred();
      let reads = 0, serverStudent = { ...student };
      const state = await fixture(width, async (path, request) => {
        if (path !== "/me") return null;
        if (request.method() === "POST") {
          Object.assign(serverStudent, request.postDataJSON());
          return { json: { student: { ...serverStudent } } };
        }
        const snapshot = { ...serverStudent };
        if (++reads === 2) { started.resolve(); await waiting.promise; }
        return { json: { student: snapshot, bookings: [lesson], series: [] } };
      });
      try {
        const { page } = state;
        await page.goto(`${base}/book/?view=book`);
        await page.getByRole("radio", { name: "Single", exact: true }).check();
        await page.getByRole("button", { name: "Your lessons", exact: true }).click();
        await started.promise;
        await chooseAccount(page, "Edit details");
        const input = page.getByLabel(field === "name" ? "Your name" : "NIF (optional)", { exact: true });
        const save = page.getByRole("button", { name: field === "name" ? "Save name" : "Save NIF", exact: true });
        const value = field === "name" ? "Ana Saved" : "248899945";
        await input.fill(value);
        await save.click();
        await expect(save).toBeDisabled();
        const response = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/me");
        waiting.resolve();
        await response;
        await check(state);
        await expect(input).toHaveValue(value);
        await expect(save).toBeDisabled();
        await chooseAccount(page, "Done editing");
        await chooseAccount(page, "Edit details");
        await expect(input).toHaveValue(value);
        await expect(save).toBeDisabled();
        await check(state);
        cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Initial booking creation shares the navigation/session guards used by
    // payment recovery. Capture a forbidden redirect without contacting Stripe.
    for (const status of [200, 503]) {
      const started = deferred(), waiting = deferred(), providerRequests = [];
      const state = await fixture(width, async (path, request) => {
        if (path === "/bookings" && request.method() === "POST") {
          started.resolve();
          await waiting.promise;
          return status === 200
            ? { json: { booking: lesson, checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_isolated" } }
            : { status, json: { error: "The old booking request failed." } };
        }
        return bookingDefaults(path);
      });
      await state.context.route("https://checkout.stripe.com/**", async route => {
        providerRequests.push(route.request().url());
        await route.fulfill({ contentType: "text/html", body: "<p>Isolated payment destination</p>" });
      });
      try {
        const { page } = state;
        await chooseBooking(page);
        await page.getByRole("button", { name: "Book lesson & agree to pay", exact: true }).click();
        await started.promise;
        await leaveForFaq(page);
        const before = page.url(), response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/bookings");
        waiting.resolve();
        await response;
        await check(state);
        assert.deepEqual(providerRequests, []);
        assert.equal(page.url(), before);
        await expect(page.getByText("The old booking request failed.", { exact: true })).toHaveCount(0);
        cases += 1;
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // An older account's finally block cannot unlock the replacement
    // account's still-pending booking, regardless of the old reply's status.
    for (const status of [200, 503]) {
      const started = [deferred(), deferred()], waiting = [deferred(), deferred()];
      let posts = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/bookings" && request.method() === "POST") {
          const index = posts++;
          started[index].resolve();
          await waiting[index].promise;
          return index === 0 && status === 503
            ? { status, json: { error: "The old booking request failed." } }
            : { json: { booking: { ...lesson, reference: index ? "PT-WWWWWW" : "PT-AAAAAA", meetingUrl: "https://meet.google.com/abc-defg-hij" }, manageToken: "fixture", manageUrl: "/book/?manage=fixture" } };
        }
        if (path === "/me" && request.headers().authorization === "Bearer replacement-session") {
          return { json: { student: { ...student, id: "replacement", name: "Replacement Student" }, bookings: [lesson], series: [] } };
        }
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await chooseBooking(page);
        const submit = page.getByRole("button", { name: "Book lesson & agree to pay", exact: true });
        await submit.click();
        await started[0].promise;
        await page.evaluate(() => {
          const key = "ines-student-session", oldValue = localStorage.getItem(key), newValue = "replacement-session";
          localStorage.setItem(key, newValue);
          window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue }));
        });
        await expect(submit).toBeEnabled();
        await submit.click();
        await started[1].promise;
        const busy = page.getByRole("button", { name: "Booking…", exact: true });
        await expect(busy).toBeDisabled();
        const oldResponse = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/bookings" && r.request().headers().authorization === "Bearer isolated-continuity");
        waiting[0].resolve();
        await oldResponse;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(busy).toBeDisabled();
        await expect(submit).toHaveCount(0);
        assert.equal(posts, 2);
        await expect(page.getByText("The old booking request failed.", { exact: true })).toHaveCount(0);
        waiting[1].resolve();
        await expect(page.locator(".booking-success__reference")).toContainText("PT-WWWWWW");
        await check(state);
        assert.equal(posts, 2);
        cases += 1;
      } finally { waiting.forEach(item => item.resolve()); await state.context.close(); }
    }

    // Booking succeeds even when its subsequent calendar refresh fails.
    // Retry reloads the account without submitting or charging again.
    {
      let created = false, recovered = false, posts = 0;
      const booked = { ...lesson, reference: "PT-KKMMMM", startAt: "2026-10-06T09:00:00Z", endAt: "2026-10-06T10:00:00Z", meetingUrl: "https://meet.google.com/abc-defg-hij" };
      const state = await fixture(width, async (path, request) => {
        if (path === "/bookings" && request.method() === "POST") {
          created = true;
          posts += 1;
          return { json: { booking: booked, manageToken: "fixture", manageUrl: "/book/?manage=fixture" } };
        }
        if (path === "/me" && created) return recovered
          ? { json: { student, bookings: [lesson, booked], series: [] } }
          : { status: 503, json: { error: "The account lookup is offline." } };
        return bookingDefaults(path);
      });
      try {
        const { page } = state;
        await chooseBooking(page);
        await page.getByRole("button", { name: "Book lesson & agree to pay", exact: true }).click();
        await expect(page.locator(".booking-success__reference")).toContainText("PT-KKMMMM");
        const warning = page.getByRole("alert").filter({ hasText: "We couldn’t refresh your account just now." });
        await expect(warning).toBeVisible();
        await check(state);
        if (width !== 390) await page.screenshot({ path: `${output}/account-refresh-retry-${width}.png`, fullPage: true });
        assert.equal(posts, 1);
        recovered = true;
        await warning.getByRole("button", { name: "Try again", exact: true }).click();
        await expect(warning).toHaveCount(0);
        await expect(page.locator(".booking-success__reference")).toContainText("PT-KKMMMM");
        await page.getByRole("button", { name: "Back to upcoming lessons", exact: true }).click();
        await expect(page.locator("#account-menu").getByRole("button", { name: /^View lessons/, includeHidden: true })).toContainText("2");
        await check(state);
        assert.equal(posts, 1);
        cases += 1;
      } finally { await state.context.close(); }
    }
    console.log(`${engine} account and booking recovery passed at ${width}px.`);
  }
  console.log(`${cases} isolated account and booking recovery cases passed in ${engine}.`);
} finally { await browser.close(); }
