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
const output = `tmp/qa/state-continuity/${engine}`;
await mkdir(output, { recursive: true });
const student = { id: "continuity", name: "Ana Martins", email: "ana@example.invalid", nif: "", phone: "", timezone: "Europe/Lisbon", role: "student" };
const types = [
  { id: "trial", name: "Trial lesson", duration_minutes: 60, price_cents: 2000 },
  { id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 }
];
const lesson = {
  reference: "CONTINUITY", status: "confirmed", startAt: "2026-10-05T10:00:00Z", endAt: "2026-10-05T11:00:00Z",
  location: "online", studentName: student.name, studentEmail: student.email, studentTimezone: student.timezone,
  notes: "", rescheduleCount: 0, sameDayFeeCents: 500, paymentStatus: "scheduled",
  lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
  isPast: false, sameDayFeeApplies: false, seriesId: null, manageToken: "fixture"
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const replyError = "We couldn’t read the booking system’s reply. Please try again.";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(width, reply = async () => null, signed = true) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
  if (signed) await context.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-continuity"));
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

async function edit(page) {
  await page.goto(`${base}/book/?view=lessons`);
  await chooseAccount(page, "Edit details");
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
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
  assert.equal(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}

try {
  for (const width of [320, 390, 1280]) {
    // A completed save records its submitted NIF without discarding a newer
    // draft. That draft remains saveable, and the next save records it.
    {
      const started = deferred(), waiting = deferred(), posts = [];
      const state = await fixture(width, async (path, request) => {
        if (path !== "/me" || request.method() !== "POST") return null;
        const body = request.postDataJSON();
        posts.push(body);
        if (posts.length === 1) { started.resolve(); await waiting.promise; }
        return { json: { student: { ...student, nif: body.nif.trim() } } };
      });
      try {
        await edit(state.page);
        const field = state.page.getByLabel("NIF (optional)"), save = state.page.getByRole("button", { name: "Save NIF", exact: true });
        await field.fill("123456789");
        await save.click();
        await started.promise;
        await field.fill("248899945");
        waiting.resolve();
        await expect(state.page.getByRole("status").filter({ hasText: "Your receipts will show this NIF." })).toBeVisible();
        await expect(field).toHaveValue("248899945");
        await expect(save).toBeEnabled();
        await save.click();
        await expect(save).toBeDisabled();
        assert.deepEqual(posts, [{ nif: "123456789" }, { nif: "248899945" }]);
        await check(state);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Both the booking workspace and editor read saved rates. Deliver an old
    // lookup success/failure after saving a code; its new price must remain in
    // the editor and the next weekly confirmation, without another reload.
    for (const delayedRead of [1, 2]) {
      for (const status of [200, 503]) {
        const started = deferred(), waiting = deferred();
        let reads = 0, savedRates = {};
        const state = await fixture(width, async (path, request) => {
          if (path === "/me/recurring-rates") {
            if (request.method() === "GET") {
              const snapshot = { ...savedRates };
              if (++reads === delayedRead) {
                started.resolve();
                await waiting.promise;
                if (status === 503) return { status, json: { error: "An old lookup failed." } };
              }
              return { json: { rates: snapshot } };
            }
            savedRates = { 60: 1500 };
            return { json: { rates: savedRates, saved: { durationMinutes: 60, cents: 1500 } } };
          }
          if (path === "/lesson-types") return { json: { lessonTypes: types, paymentMode: "postpay", postpay: true, paymentReady: true } };
          if (path === "/availability") return { json: { slotsByDate: { "2026-10-06": [{ startAt: "2026-10-06T09:00:00Z", endAt: "2026-10-06T10:00:00Z" }] }, horizonDays: 84, timeZone: "Europe/Lisbon" } };
          if (path === "/bookings/series/preview") {
            const body = request.postDataJSON();
            return { json: { weeks: body.weeks, openEnded: body.weeks === null, bookable: [body.startAt], skipped: [] } };
          }
          return null;
        });
        try {
          await edit(state.page);
          await started.promise;
          await state.page.getByText("Have a code from Inês?", { exact: true }).click();
          await state.page.getByLabel("Your code", { exact: true }).fill("TEST15");
          await state.page.getByRole("button", { name: "Add code", exact: true }).click();
          await expect(state.page.getByRole("status")).toContainText("weekly lessons are now €15");
          const response = state.page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/me/recurring-rates");
          waiting.resolve();
          await response;
          await state.page.waitForLoadState("networkidle");
          await expect(state.page.getByRole("list", { name: "Your saved weekly rates" })).toContainText("€15 each");
          await expect(state.page.getByText("We couldn’t check your saved weekly rates just now.", { exact: true })).toHaveCount(0);
          await chooseAccount(state.page, "Done editing");
          await state.page.getByRole("button", { name: /^Book a (new )?lesson$/ }).first().click();
          await state.page.getByRole("radio", { name: "Weekly", exact: true }).check();
          await state.page.locator('button[data-date-key="2026-10-06"]').click();
          const part = state.page.locator('.time-picker__parts input[value="early"]');
          if (await part.count()) await part.check();
          await state.page.getByRole("button", { name: "10:00", exact: true }).click();
          await expect(state.page.getByText("€15 per lesson", { exact: true })).toBeVisible();
          await check(state);
        } finally { waiting.resolve(); await state.context.close(); }
      }
    }

    // The student can type the other length's code before the first reply.
    // Only the submitted code clears; both saved prices then appear.
    {
      const started = deferred(), waiting = deferred(), posts = [];
      const state = await fixture(width, async (path, request) => {
        if (path !== "/me/recurring-rates" || request.method() !== "POST") return null;
        const body = request.postDataJSON();
        posts.push(body);
        if (posts.length === 1) { started.resolve(); await waiting.promise; }
        const second = body.code === "DEMO27";
        return { json: { rates: second ? { 60: 1500, 90: 2700 } : { 60: 1500 }, saved: { durationMinutes: second ? 90 : 60, cents: second ? 2700 : 1500 } } };
      });
      try {
        await edit(state.page);
        await state.page.getByText("Have a code from Inês?", { exact: true }).click();
        const field = state.page.getByLabel("Your code", { exact: true }), add = state.page.getByRole("button", { name: "Add code", exact: true });
        await field.fill("TEST15");
        await add.click();
        await started.promise;
        await field.fill("DEMO27");
        waiting.resolve();
        await expect(state.page.getByRole("status")).toContainText("weekly lessons are now €15");
        await expect(field).toHaveValue("DEMO27");
        await expect(add).toBeEnabled();
        await add.click();
        await expect(state.page.getByRole("status")).toContainText("weekly lessons are now €27");
        await expect(field).toHaveValue("");
        await expect(field).toBeFocused();
        await expect(state.page.getByRole("list", { name: "Your saved weekly rates" }).getByRole("listitem")).toHaveCount(2);
        assert.deepEqual(posts, [{ code: "TEST15" }, { code: "DEMO27" }]);
        await check(state);
        if (engine === "chromium") await state.page.locator(".my-lessons__details").screenshot({ path: `${output}/profile-${width}.png` });
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Either profile field may finish first. The older full-account snapshot
    // must not roll back the other field, in the account bar or reopened editor.
    for (const first of ["name", "nif"]) {
      const started = deferred(), waiting = deferred(), posts = [];
      let saved = { ...student };
      const state = await fixture(width, async (path, request) => {
        if (path !== "/me" || request.method() !== "POST") return null;
        const body = request.postDataJSON();
        posts.push(body);
        saved = { ...saved, ...body };
        const snapshot = { ...saved };
        if (Object.hasOwn(body, first)) { started.resolve(); await waiting.promise; }
        return { json: { student: snapshot } };
      });
      try {
        await edit(state.page);
        const controls = {
          name: { field: state.page.getByLabel("Your name", { exact: true }), save: state.page.getByRole("button", { name: "Save name", exact: true }), value: "Ana Updated" },
          nif: { field: state.page.getByLabel("NIF (optional)"), save: state.page.getByRole("button", { name: "Save NIF", exact: true }), value: "123456789" }
        };
        const second = first === "name" ? "nif" : "name";
        await controls[first].field.fill(controls[first].value);
        await controls[first].save.click();
        await started.promise;
        await controls[second].field.fill(controls[second].value);
        await controls[second].save.click();
        await expect(controls[second].save).toBeDisabled();
        waiting.resolve();
        await expect(controls[first].save).toBeDisabled();
        await expect(controls[second].save).toBeDisabled();
        await expect(state.page.locator(".my-lessons__account-name strong")).toHaveText("Ana Updated");
        assert.deepEqual(posts, [{ [first]: controls[first].value }, { [second]: controls[second].value }]);
        await chooseAccount(state.page, "Done editing");
        await chooseAccount(state.page, "Edit details");
        await expect(controls.name.field).toHaveValue("Ana Updated");
        await expect(controls.nif.field).toHaveValue("123456789");
        await check(state);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Modified clicks retain native browser navigation. Ordinary clicks still
    // select a single category, update its address and focus its heading.
    {
      const state = await fixture(width);
      try {
        await state.page.goto(`${base}/faq/`);
        await expect(state.page.locator(".faq-index")).toHaveAttribute("data-ready", "true");
        const original = state.page.url(), payment = state.page.locator(".faq-index").getByRole("link", { name: /Payment/ });
        const popupPromise = state.context.waitForEvent("page");
        await payment.click({ modifiers: ["Control"] });
        const popup = await popupPromise;
        await popup.waitForLoadState("networkidle");
        assert.equal(state.page.url(), original);
        assert.equal(new URL(popup.url()).hash, "#faq-payment");
        await expect(popup.locator("#faq-payment")).toBeVisible();
        await popup.close();
        await payment.click();
        await expect(state.page.locator("#faq-payment-title")).toBeFocused();
        await expect(state.page.locator(".faq-group:visible")).toHaveCount(1);
        assert.equal(new URL(state.page.url()).hash, "#faq-payment");
        await check(state);
      } finally { await state.context.close(); }
    }

    // A legal fragment can open terms above an emailed lesson link. Escape
    // closes just the top dialog, keeping the lesson and its token usable.
    for (const dismiss of ["escape", "close", "background-signout"]) {
      const state = await fixture(width);
      try {
        await state.page.goto(`${base}/book/?manage=fixture#privacy`);
        const policy = state.page.getByRole("dialog", { name: "Terms & privacy", exact: true });
        const management = state.page.locator(".lesson-manage-dialog");
        await expect(policy).toBeVisible();
        await expect(management.locator("h2")).toHaveText("Manage this lesson");
        if (dismiss === "background-signout") {
          // Signing out in another tab closes private lesson data even while
          // the public terms dialog stays open above it.
          await state.page.evaluate(() => {
            const key = "ines-student-session", oldValue = localStorage.getItem(key);
            localStorage.removeItem(key);
            window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue: null }));
          });
          await expect(management).toHaveCount(0);
          await expect(policy).toBeVisible();
          assert.equal(await state.page.evaluate(() => document.body.style.overflow), "hidden");
          await state.page.keyboard.press("Tab");
          assert.equal(await policy.evaluate(element => element.contains(document.activeElement)), true);
          await state.page.keyboard.press("Escape");
          await expect(policy).toBeHidden();
        } else {
          if (dismiss === "escape") await state.page.keyboard.press("Escape");
          else await policy.getByRole("button", { name: "Close terms & privacy", exact: true }).click();
          await expect(policy).toBeHidden();
          await expect(management).toBeVisible();
          assert.equal(new URL(state.page.url()).searchParams.get("manage"), "fixture");
          assert.equal(new URL(state.page.url()).hash, "");
          assert.equal(await state.page.evaluate(() => document.body.style.overflow), "hidden");
          await state.page.keyboard.press("Tab");
          assert.equal(await management.evaluate(element => element.contains(document.activeElement)), true);
          await state.page.keyboard.press("Escape");
        }
        await expect(management).toHaveCount(0);
        if (dismiss !== "background-signout") assert.equal(new URL(state.page.url()).searchParams.has("manage"), false);
        assert.equal(await state.page.evaluate(() => document.body.style.overflow), "");
        await check(state);
      } finally { await state.context.close(); }
    }

    // Gateways can return HTML or a successful response with missing/invalid
    // JSON fields. Keep the booking document and contact route usable, and
    // recover when the next reload receives a valid response.
    const malformed = [
      ["/lesson-types", { contentType: "text/html", body: "<html>Gateway unavailable</html>" }],
      ["/lesson-types", { contentType: "application/json", body: "null" }],
      ["/lesson-types", { json: {} }],
      ["/lesson-types", { json: { lessonTypes: [{ ...types[0], price_cents: "2000" }] } }],
      ["/availability", { contentType: "text/html", body: "<html>Gateway unavailable</html>" }],
      ["/availability", { json: {} }],
      ["/availability", { json: { slotsByDate: { "2026-10-05": null } } }],
      ["/availability", { json: { slotsByDate: { "2026-10-05": [{ startAt: "invalid", endAt: "invalid" }] } } }]
    ];
    for (const [endpoint, answer] of malformed) {
      let broken = true;
      const state = await fixture(width, async path => broken && path === endpoint ? answer : null, false);
      try {
        await state.page.goto(`${base}/book/`);
        await expect(state.page.locator(".booking-alert[role=status]"), `Malformed ${endpoint}: ${JSON.stringify(answer)}`).toContainText(replyError);
        await expect(state.page.getByRole("link", { name: "Message Inês instead", exact: true })).toBeVisible();
        await expect(state.page.getByRole("main")).toBeVisible();
        await check(state);
        broken = false;
        await state.page.reload();
        await state.page.waitForLoadState("networkidle");
        await expect(state.page.locator(".booking-alert[role=status]")).toHaveCount(0);
        await check(state);
      } finally { await state.context.close(); }
    }

    for (const answer of [{ contentType: "text/html", body: "<html>Gateway unavailable</html>" }, { json: {} }]) {
      // An unreadable account is a retryable failure, not an empty account or
      // an expired session. Retrying reads the real fixture's upcoming lesson.
      {
        let broken = true;
        const state = await fixture(width, async path => broken && path === "/me" ? answer : null);
        try {
          await state.page.goto(`${base}/book/?view=lessons`);
          await expect(state.page.locator("main").getByRole("alert")).toContainText("We couldn’t reach your account just now.");
          assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), "isolated-continuity");
          await check(state);
          broken = false;
          await state.page.getByRole("button", { name: "Try again", exact: true }).click();
          await expect(state.page.locator(".my-lessons__account-name strong")).toHaveText(student.name);
          await check(state);
        } finally { await state.context.close(); }
      }

      // Successful HTTP status alone cannot sign anyone in with missing user
      // data or a bogus token. Preserve their draft and allow a valid retry.
      {
        let broken = true;
        const state = await fixture(width, async path => path === "/auth/login" ?
          broken ? answer : { json: { student, session: "isolated-continuity" } } : null, false);
        try {
          await state.page.goto(`${base}/book/?view=lessons`);
          const panel = state.page.locator(".auth-panel");
          await panel.getByLabel("Email", { exact: true }).fill(student.email);
          await panel.getByLabel("Password", { exact: true }).fill("IsolatedQA123!");
          await panel.getByRole("button", { name: "Sign in", exact: true }).click();
          await expect(panel.getByRole("alert")).toContainText(replyError);
          assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), null);
          await expect(panel.getByLabel("Email", { exact: true })).toHaveValue(student.email);
          await check(state);
          broken = false;
          await panel.getByRole("button", { name: "Sign in", exact: true }).click();
          await expect(state.page.locator(".my-lessons__account-name strong")).toHaveText(student.name);
          await check(state);
        } finally { await state.context.close(); }
      }

      for (const endpoint of ["/admin/availability", "/admin/bookings"]) {
        let broken = true;
        const state = await fixture(width, async path => {
          if (path === "/me") return { json: { student: { ...student, role: "teacher" }, bookings: [], series: [], sameDayFeeCents: 500 } };
          return broken && path === endpoint ? answer : null;
        });
        try {
          await state.page.goto(`${base}/schedule/`);
          await expect(state.page.locator("main").getByRole("alert")).toContainText(replyError);
          assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), "isolated-continuity");
          await check(state);
          broken = false;
          const response = state.page.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === "GET");
          await state.page.getByRole("button", { name: "Try again", exact: true }).click();
          await response;
          await expect(state.page.locator(".teacher-workspace")).toBeVisible();
          await expect(state.page.getByText("Your week at a glance", { exact: true })).toBeVisible();
          await expect(state.page.locator("main").getByRole("alert")).toHaveCount(0);
          await check(state);
        } finally { await state.context.close(); }
      }
    }
    console.log(`State continuity passed in ${engine} at ${width}px: profile drafts, both save orders, stale rates, FAQ navigation, stacked dialogs, and malformed replies/reload recovery.`);
  }
} finally { await browser.close(); }
