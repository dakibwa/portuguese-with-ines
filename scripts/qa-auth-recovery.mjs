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

try {
  for (const width of [320, 390, 1280]) {
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
        await state.page.waitForLoadState("networkidle");
        await state.page.goto(`${base}/reset-password/?token=isolated-reset-token`);
        await expect.poll(() => new URL(state.page.url()).search).toBe("");
        await state.page.locator(".auth-panel").getByLabel(/^New password/).fill("isolated-password");
        await state.page.locator(".auth-panel").getByLabel("Again, to be sure", { exact: true }).fill("different-password");
        await state.page.getByRole("button", { name: "Save my new password", exact: true }).click();
        await expect(state.page.locator(".booking-alert")).toContainText("don't match");
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
  console.log(`Authentication recovery passed in ${engine} at 320/390/1280px: stale success/failure after switching forms, Google exchanges and SDK retry (${googleChecks}/15 configured cases), reset notices, missing/expired links, mismatch prevention, retry and interrupted resets.`);
} finally { await browser.close(); }
