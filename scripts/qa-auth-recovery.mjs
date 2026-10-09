import assert from "node:assert/strict";
import { chromium, firefox, webkit, expect } from "@playwright/test";

// Authentication replies are fixtures: no accounts, resets or emails are sent.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const engine = process.env.QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unknown QA_BROWSER: ${engine}`);
const browser = await browserType.launch({ headless: true });
const student = { id: "auth-recovery", name: "Auth Student", email: "auth@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "student" };
const replacementSession = "isolated-replacement-session";
const replacementStudent = { ...student, id: "replacement-student", name: "Replacement Student" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
let googleChecks = 0;
let storageChecks = 0;
let expiredSessionChecks = 0;

// A full or restricted store can refuse a write even while reads work. Keep
// the refusal reversible so the same form can demonstrate recovery.
function refuseSessionWrites(initialSession) {
  if (initialSession && !sessionStorage.getItem("isolated-storage-initialised")) {
    localStorage.setItem("ines-student-session", initialSession);
    sessionStorage.setItem("isolated-storage-initialised", "1");
  }
  const nativeSet = Storage.prototype.setItem;
  window.qaRefuseSessionWrites = true;
  Storage.prototype.setItem = function (key, value) {
    if (key === "ines-student-session" && window.qaRefuseSessionWrites) {
      throw new DOMException("Isolated storage refusal", "QuotaExceededError");
    }
    return nativeSet.call(this, key, value);
  };
}

function googleSdkFixture() {
  let callback;
  window.google = { accounts: { id: {
    initialize(options) { callback = options.callback; },
    renderButton(parent) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Continue with Google";
      button.onclick = () => callback({ credential: "isolated-google-credential" });
      parent.append(button);
    }
  } } };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(width, reply = async () => null, mockGoogle = true) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  // Exercise the website's credential handling with an isolated Google SDK.
  // A configured public client ID is needed; no Google account is contacted.
  if (mockGoogle) await page.addInitScript(googleSdkFixture);
  await page.route(url => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$)/.test(url.pathname), async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.method() === "POST") requests.push({ path, body: request.postDataJSON() });
    const answer = await reply(path, request);
    if (answer) return route.fulfill({ headers: cors, ...answer });
    if (path === "/me") return route.fulfill({ headers: cors, json: { student: request.headers().authorization === `Bearer ${replacementSession}` ? replacementStudent : student, bookings: [], series: [], sameDayFeeCents: 500 } });
    if (path === "/me/recurring-rates") return route.fulfill({ headers: cors, json: { rates: {} } });
    if (path === "/lesson-types") return route.fulfill({ headers: cors, json: { lessonTypes: [], postpay: false } });
    if (path === "/availability") return route.fulfill({ headers: cors, json: { slotsByDate: {}, horizonDays: 84 } });
    errors.push(`Unexpected authentication request: ${path}`);
    return route.abort();
  });
  return { page, context, errors, requests };
}

async function replaceSession(page) {
  await page.evaluate(token => {
    localStorage.setItem("ines-student-session", token);
    window.dispatchEvent(new StorageEvent("storage", { key: "ines-student-session", newValue: token }));
  }, replacementSession);
}

async function settleNavigation(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => new Promise(resolve => {
    const done = () => requestAnimationFrame(() => resolve(null));
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(done, { timeout: 1000 });
    else done();
  }));
  await page.waitForLoadState("networkidle");
}

try {
  for (const width of [320, 390, 1280]) {
    // A successful exchange is not a signed-in browser until its bearer has
    // actually been saved. Account creation still happened on the server, so
    // its retry must offer sign-in rather than creating a second account.
    for (const action of ["signin", "register", "google"]) {
      const session = `isolated-storage-${action}`;
      const state = await fixture(width, async path => /^\/auth\/(login|register|google)$/.test(path)
        ? { json: { student, session } } : null);
      await state.page.addInitScript(refuseSessionWrites);
      try {
        await state.page.goto(`${base}/book/?view=lessons`);
        const panel = state.page.locator(".auth-panel");
        await expect(panel).toBeVisible();
        if (action === "google") {
          if (!await panel.locator(".google-signin").count()) continue;
          await panel.getByRole("button", { name: "Continue with Google", exact: true }).click();
        } else {
          if (action === "register") {
            await panel.getByRole("tab", { name: "Create an account", exact: true }).click();
            // Only someone signing in has a password to forget.
            await expect(panel.getByRole("button", { name: /forgotten my password/ })).toHaveCount(0);
            await panel.getByLabel("Your name", { exact: true }).fill(student.name);
          }
          await panel.getByLabel("Email", { exact: true }).fill(student.email);
          await panel.getByLabel(/^Password/).fill("isolated-password");
          await panel.getByRole("button", { name: action === "register" ? "Create my account" : "Sign in", exact: true }).click();
        }
        await expect(panel.getByRole("alert")).toContainText("couldn’t save your sign-in");
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), null);
        await expect(state.page.locator(".my-lessons__account-name")).toHaveCount(0);
        await state.page.evaluate(() => { window.qaRefuseSessionWrites = false; });
        if (action === "register") {
          await panel.getByRole("alert").getByRole("button", { name: "Sign in", exact: true }).click();
          await expect(panel.getByLabel("Email", { exact: true })).toHaveValue(student.email);
        }
        await panel.getByRole("button", { name: action === "google" ? "Continue with Google" : "Sign in", exact: true }).click();
        await expect(state.page.locator(".my-lessons__account-name")).toContainText(student.name);
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), session);
        assert.deepEqual(state.errors, []);
        storageChecks += 1;
      } finally { await state.context.close(); }
    }

    // Email confirmation also consumes its link before renewing the session.
    // If storage refuses that renewal, the changed address remains truthful
    // and signing in with it recovers without replaying the confirmation.
    {
      const renewed = "isolated-email-storage-renewal", previous = "isolated-email-storage-old";
      const verified = { ...student, email: "verified@example.invalid" };
      let changed = false, confirmations = 0;
      const state = await fixture(width, async (path, request) => {
        if (path === "/me/email/confirm") {
          changed = true; confirmations += 1;
          return { json: { student: verified, session: renewed } };
        }
        if (path === "/me" && changed) return request.headers().authorization === `Bearer ${renewed}`
          ? { json: { student: verified, bookings: [], series: [], sameDayFeeCents: 500 } }
          : { status: 401, json: { error: "The old session was renewed." } };
        if (path === "/auth/login") return { json: { student: verified, session: renewed } };
        return null;
      });
      await state.page.addInitScript(refuseSessionWrites, previous);
      try {
        await state.page.goto(`${base}/book/?view=lessons&emailToken=isolated-email-proof`);
        await expect(state.page.getByRole("alert").filter({ hasText: "Your email was changed" })).toContainText("sign in with your new email");
        assert.equal(confirmations, 1);
        assert.equal(new URL(state.page.url()).searchParams.has("emailToken"), false);
        await settleNavigation(state.page);
        await state.page.reload();
        const panel = state.page.locator(".auth-panel");
        await expect(panel).toBeVisible();
        await state.page.evaluate(() => { window.qaRefuseSessionWrites = false; });
        await panel.getByLabel("Email", { exact: true }).fill(verified.email);
        await panel.getByLabel("Password", { exact: true }).fill("isolated-password");
        await panel.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(state.page.locator(".my-lessons__account-name")).toContainText(student.name);
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), renewed);
        assert.equal(confirmations, 1);
        assert.deepEqual(state.errors, []);
        storageChecks += 1;
      } finally { await state.context.close(); }
    }

    // Reset consumes its link and changes the password even if saving the new
    // session fails. Report that completed change without claiming sign-in or
    // offering a second submission of the already used reset token.
    {
      const state = await fixture(width, async path => path === "/auth/reset"
        ? { json: { student, session: "isolated-unsaved-reset-session" } } : null);
      await state.page.addInitScript(refuseSessionWrites);
      try {
        await state.page.goto(`${base}/reset-password/?token=isolated-reset-token`);
        await state.page.locator(".auth-panel").getByLabel(/^New password/).fill("isolated-password");
        await state.page.locator(".auth-panel").getByLabel("Again, to be sure", { exact: true }).fill("isolated-password");
        await state.page.getByRole("button", { name: "Save my new password", exact: true }).click();
        await expect(state.page.getByRole("status")).toContainText("Your password has been changed");
        await expect(state.page.getByRole("status")).not.toContainText("You’re signed in");
        await expect(state.page.getByRole("status")).toContainText("couldn’t save your sign-in");
        await expect(state.page.getByRole("button", { name: "Save my new password", exact: true })).toHaveCount(0);
        assert.equal(state.requests.length, 1);
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), null);
        assert.deepEqual(state.errors, []);
        storageChecks += 1;
      } finally { await state.context.close(); }
    }

    for (const destination of ["/book/?view=lessons", "/my-lessons/"]) {
      const state = await fixture(width, async path => path === "/me"
        ? { status: 401, json: { error: "The current session expired." } } : null);
      await state.page.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-expired-session"));
      try {
        await state.page.goto(`${base}${destination}`);
        await expect(state.page.locator(".auth-panel")).toBeVisible();
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), null);
        await expect(state.page.locator("#lesson-calendar")).toHaveCount(0);
        assert.deepEqual(state.requests, []);
        assert.deepEqual(state.errors, []);
        expiredSessionChecks += 1;
      } finally { await state.context.close(); }
    }

    if (process.env.QA_AUTH_STORAGE_ONLY === "1") continue;

    for (const { status, action } of [200, 503].flatMap(status =>
      ["register", "replacement", "navigate"].map(action => ({ status, action })))) {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/auth/login") return null;
        started.resolve(); await waiting.promise;
        return status === 200
          ? { json: { student, session: "isolated-stale-auth-session" } }
          : { status, json: { error: "The old sign-in request failed." } };
      });
      try {
        await state.page.goto(`${base}/book/?view=lessons`);
        const panel = state.page.locator(".auth-panel");
        await panel.getByLabel("Email", { exact: true }).fill(student.email);
        await panel.getByLabel("Password", { exact: true }).fill("isolated-password");
        await panel.getByRole("button", { name: "Sign in", exact: true }).click();
        await started.promise;
        if (action === "register") {
          await panel.getByRole("tab", { name: "Create an account", exact: true }).click();
          await expect(panel.getByRole("button", { name: "Create my account", exact: true })).toBeEnabled();
        } else if (action === "replacement") {
          await replaceSession(state.page);
          await expect(state.page.getByText(replacementStudent.name, { exact: true })).toBeVisible();
        } else {
          await state.page.locator(".site-header__brand").click();
          await expect.poll(() => new URL(state.page.url()).pathname).toBe("/");
        }
        const response = state.page.waitForResponse("**/auth/login");
        waiting.resolve(); await response;
        await state.page.waitForLoadState("networkidle");
        if (action === "register") {
          await expect(panel.getByRole("tab", { name: "Create an account", exact: true })).toHaveAttribute("aria-selected", "true");
          await expect(panel.getByRole("alert")).toHaveCount(0);
        } else if (action === "replacement") await expect(state.page.getByText(replacementStudent.name, { exact: true })).toBeVisible();
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), action === "replacement" ? replacementSession : null);
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Google's delayed credential exchange must not replace a newer sign-in
    // or complete after the visitor leaves its form for password recovery.
    for (const action of ["success", "forgot-success", "forgot-failure", "replacement"]) {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/auth/google") return null;
        started.resolve(); await waiting.promise;
        return action === "forgot-failure"
          ? { status: 503, json: { error: "An old Google sign-in failed." } }
          : { json: { student, session: "isolated-google-session" } };
      });
      try {
        await state.page.goto(`${base}/book/?view=lessons`);
        const panel = state.page.locator(".auth-panel");
        await expect(panel).toBeVisible();
        if (!await panel.locator(".google-signin").count()) continue;
        googleChecks += 1;
        await panel.getByRole("button", { name: "Continue with Google", exact: true }).click();
        await started.promise;
        if (action === "replacement") {
          await replaceSession(state.page);
          await expect(state.page.getByText(replacementStudent.name, { exact: true })).toBeVisible();
        } else if (action !== "success") await panel.getByRole("button", { name: /forgotten my password/ }).click();
        const response = state.page.waitForResponse("**/auth/google");
        waiting.resolve(); await response;
        await state.page.waitForLoadState("networkidle");
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), action === "replacement" ? replacementSession : action === "success" ? "isolated-google-session" : null);
        if (action === "replacement") await expect(state.page.getByText(replacementStudent.name, { exact: true })).toBeVisible();
        else if (action === "success") await expect(state.page.getByText(student.name, { exact: true })).toBeVisible();
        else {
          await expect(panel.getByRole("heading", { name: "Forgotten password", exact: true })).toBeVisible();
          await expect(panel.getByRole("alert")).toHaveCount(0);
        }
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // A failed SDK script must be retryable on the next account form rather
    // than leaving every later Google button waiting for an event already lost.
    {
      let scripts = 0;
      const state = await fixture(width, async path => path === "/auth/google"
        ? { json: { student, session: "isolated-google-retry-session" } } : null, false);
      await state.page.route("https://accounts.google.com/gsi/client", route => {
        scripts += 1;
        return scripts === 1
          ? route.fulfill({ status: 503, body: "Isolated Google SDK outage" })
          : route.fulfill({ contentType: "application/javascript", body: `(${googleSdkFixture.toString()})();` });
      });
      try {
        await state.page.goto(`${base}/book/?view=lessons`);
        const panel = state.page.locator(".auth-panel");
        await expect(panel).toBeVisible();
        if (await panel.locator(".google-signin").count()) {
          googleChecks += 1;
          await expect.poll(() => scripts).toBe(1);
          await state.page.waitForLoadState("networkidle");
          await expect(panel.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
          await panel.getByRole("tab", { name: "Create an account", exact: true }).click();
          await panel.getByRole("button", { name: "Continue with Google", exact: true }).click();
          await expect(state.page.getByText(student.name, { exact: true })).toBeVisible();
          assert.equal(scripts, 2);
          assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), "isolated-google-retry-session");
        }
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // Saving a reset still changes the password, but must preserve a newer
    // account session and stop automatic sign-in when its page was left.
    for (const action of ["replacement", "navigate"]) {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/auth/reset") return null;
        started.resolve(); await waiting.promise;
        return { json: { student, session: "isolated-late-reset-session" } };
      });
      try {
        await state.page.goto(`${base}/reset-password/?token=isolated-reset-token`);
        await state.page.locator(".auth-panel").getByLabel(/^New password/).fill("isolated-password");
        await state.page.locator(".auth-panel").getByLabel("Again, to be sure", { exact: true }).fill("isolated-password");
        await state.page.getByRole("button", { name: "Save my new password", exact: true }).click();
        await started.promise;
        if (action === "replacement") await replaceSession(state.page);
        else {
          await state.page.locator(".site-header__brand").click();
          await expect.poll(() => new URL(state.page.url()).pathname).toBe("/");
        }
        const response = state.page.waitForResponse("**/auth/reset");
        waiting.resolve(); await response;
        await state.page.waitForLoadState("networkidle");
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), action === "replacement" ? replacementSession : null);
        if (action === "replacement") {
          await expect(state.page.getByRole("status")).toContainText("Your password has been changed");
          await expect(state.page.getByRole("status")).not.toContainText("You’re signed in");
        }
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Reset success remains readable after returning to sign-in. Switching
    // away before a failed request returns must not poison the sign-in form.
    for (const delayed of [false, true]) {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/auth/forgot") return null;
        started.resolve();
        if (delayed) await waiting.promise;
        return delayed ? { status: 503, json: { error: "An old reset request failed." } } : { json: { ok: true } };
      });
      try {
        await state.page.goto(`${base}/book/?view=lessons`);
        const panel = state.page.locator(".auth-panel");
        await panel.getByRole("button", { name: /forgotten my password/ }).click();
        await panel.getByLabel("Email", { exact: true }).fill(student.email);
        await panel.getByRole("button", { name: "Email me a reset link", exact: true }).click();
        await started.promise;
        if (!delayed) await expect(panel.getByRole("status")).toContainText("a reset link is on its way");
        await panel.getByRole("button", { name: "Back to signing in", exact: true }).click();
        if (delayed) {
          const response = state.page.waitForResponse("**/auth/forgot");
          waiting.resolve(); await response;
          await state.page.waitForLoadState("networkidle");
          await expect(panel.getByRole("alert")).toHaveCount(0);
        } else await expect(panel.getByRole("status")).toContainText("a reset link is on its way");
        await expect(panel.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Reset links discard their token from the address bar, validate matching
    // passwords locally, and preserve a usable retry after a server refusal.
    {
      let reject = true;
      const state = await fixture(width, async path => path === "/auth/reset"
        ? reject ? { status: 400, json: { error: "That link has expired. Please request a new one." } }
          : { json: { student, session: "isolated-reset-session" } } : null);
      try {
        await state.page.goto(`${base}/reset-password/`);
        await expect(state.page.getByRole("button", { name: "Save my new password", exact: true })).toBeDisabled();
        await expect(state.page.locator(".booking-alert")).toContainText("link from your reset email");
        // Complete this document's prefetches before another full navigation;
        // WebKit reports their cancellation as errors on the next document.
        await settleNavigation(state.page);
        await state.page.goto(`${base}/reset-password/?token=isolated-reset-token`);
        await expect.poll(() => new URL(state.page.url()).search).toBe("");
        await state.page.locator(".auth-panel").getByLabel(/^New password/).fill("isolated-password");
        await state.page.locator(".auth-panel").getByLabel("Again, to be sure", { exact: true }).fill("different-password");
        await state.page.getByRole("button", { name: "Save my new password", exact: true }).click();
        await expect(state.page.locator(".booking-alert")).toContainText("don’t match");
        assert.equal(state.requests.length, 0);
        await state.page.locator(".auth-panel").getByLabel("Again, to be sure", { exact: true }).fill("isolated-password");
        await state.page.getByRole("button", { name: "Save my new password", exact: true }).click();
        await expect(state.page.locator(".booking-alert")).toContainText("link has expired");
        reject = false;
        await state.page.getByRole("button", { name: "Save my new password", exact: true }).click();
        await expect(state.page.getByRole("status")).toContainText("Your password has been changed");
        assert.equal(await state.page.evaluate(() => localStorage.getItem("ines-student-session")), "isolated-reset-session");
        assert.deepEqual(state.requests.map(({ body }) => body), Array(2).fill({ token: "isolated-reset-token", password: "isolated-password" }));
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }
  }
  console.log(process.env.QA_AUTH_STORAGE_ONLY === "1"
    ? `Authentication storage recovery passed in ${engine} at 320/390/1280px: ${storageChecks}/15 configured storage cases and ${expiredSessionChecks}/6 expired-session destinations, including password/Google sign-in, completed registration/reset/email change and valid recovery.`
    : `Authentication recovery passed in ${engine} at 320/390/1280px: stale success/failure after switching forms, Google exchanges and SDK retry (${googleChecks}/15 configured cases), storage refusals and recovery (${storageChecks}/15 configured cases), expired-session destinations (${expiredSessionChecks}/6), reset notices, missing/expired links, mismatch prevention, retry and interrupted resets.`);
} finally { await browser.close(); }
