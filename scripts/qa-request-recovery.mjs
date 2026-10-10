import assert from "node:assert/strict";
import { chromium, firefox, webkit, expect } from "@playwright/test";

// Delayed API replies are isolated fixtures. No accounts, emails, lessons or
// payments are created, and the checks work with a local or deployed API URL.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const engine = process.env.QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unknown QA_BROWSER: ${engine}`);
const browser = await browserType.launch({ headless: true });
const sessionKey = "ines-student-session";
const oldSession = "isolated-old-session";
const newSession = "isolated-new-session";
const student = { id: "recovery-student", name: "Recovery Student", email: "recovery@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "student" };
// A wide card shows the name plain while the folded menu's copy of it stays
// hidden, so a name is checked where it is visible.
const replacementStudent = { ...student, id: "replacement-student", name: "Replacement Student", email: "replacement@example.invalid" };
const types = [
  { id: "trial", name: "Trial lesson", duration_minutes: 60, price_cents: 2000 },
  { id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 }
];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function lesson(token, day) {
  return {
    reference: `RECOVERY-${token}`, status: "confirmed", location: "online", notes: "",
    startAt: `2026-09-${day}T09:00:00Z`, endAt: `2026-09-${day}T10:00:00Z`,
    studentName: student.name, studentEmail: student.email, studentTimezone: student.timezone,
    lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
    isPast: false, sameDayFeeApplies: false, rescheduleCount: 0, sameDayFeeCents: 500,
    paymentStatus: "not_required", seriesId: null, manageToken: token
  };
}

const previousLesson = lesson("previous", "16");
const nextLesson = lesson("next", "15");

// The next lesson opens from its row on a phone, or from its day where a
// pointer reads it off the calendar.
function nextLessonOpener(page) {
  return page.locator(".lesson-overview__next-open:visible, #lesson-calendar .calendar-week button.is-next:visible").first();
}

async function fixture(width, reply = async () => null) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", timezoneId: "Europe/Lisbon" });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [], logouts = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-09-14T10:00:00Z"));
  await page.addInitScript(({ key, token }) => localStorage.setItem(key, token), { key: sessionKey, token: oldSession });
  await page.route(url => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$|bookings\/|admin\/)/.test(url.pathname), async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const answer = await reply(pathname, request);
    if (answer) return route.fulfill({ headers: cors, ...answer });
    if (pathname === "/me") {
      const replacement = request.headers().authorization === `Bearer ${newSession}`;
      return route.fulfill({ headers: cors, json: { student: replacement ? replacementStudent : student, bookings: replacement ? [] : [nextLesson], series: [], sameDayFeeCents: 500 } });
    }

    if (pathname === "/me/recurring-rates") return route.fulfill({ headers: cors, json: { rates: {} } });
    if (pathname === "/auth/logout") {
      logouts.push(request.headers().authorization);
      return route.fulfill({ headers: cors, json: { ok: true } });
    }
    if (pathname === "/lesson-types") return route.fulfill({ headers: cors, json: { lessonTypes: types, postpay: false, paymentReady: true } });
    if (pathname === "/availability") return route.fulfill({ headers: cors, json: { slotsByDate: {}, timeZone: "Europe/Lisbon", horizonDays: 84 } });
    if (pathname === "/bookings/next") return route.fulfill({ headers: cors, json: { booking: nextLesson, isPast: false, sameDayFeeApplies: false } });
    if (pathname === "/admin/availability") return route.fulfill({ headers: cors, json: { rules: [], exceptions: [] } });
    if (pathname === "/admin/bookings") return route.fulfill({ headers: cors, json: { bookings: [] } });
    if (pathname === "/admin/google-calendar") return route.fulfill({ headers: cors, json: { configured: false, connected: false, needsReconnect: false, pending: 0 } });
    errors.push(`Unexpected request: ${request.method()} ${pathname}`);
    return route.abort();
  });
  // Google's sign-in script, stubbed as the other journey checks stub it.
  // Signed out, the page shows the sign-in panel; in CI, where the build has
  // a real Google client, the real script would make waiting for a quiet
  // network wait on Google's servers too (release run 258).
  await page.route("https://accounts.google.com/gsi/client", route => route.fulfill({
    contentType: "application/javascript", body: "window.google={accounts:{id:{initialize(){},renderButton(){}}}};"
  }));
  return { page, context, errors, logouts };
}

async function replaceSession(page, token) {
  await page.evaluate(({ key, value }) => {
    const previous = localStorage.getItem(key);
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    window.dispatchEvent(new StorageEvent("storage", { key, oldValue: previous, newValue: value }));
  }, { key: sessionKey, value: token });
}

async function currentSession(page) {
  return page.evaluate(key => localStorage.getItem(key), sessionKey);
}

try {
  for (const width of [320, 390, 1280]) {
    // Dismiss a loading lesson, then deliver both a success and a failure.
    // Neither reply may reopen it or leave the page's scroll lock behind.
    for (const status of [200, 503]) {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/bookings/previous") return null;
        started.resolve();
        await waiting.promise;
        return status === 200
          ? { json: { booking: previousLesson, isPast: false, sameDayFeeApplies: false } }
          : { status, json: { error: "An old lesson request failed." } };
      });
      const { page, context } = state;
      try {
        await page.goto(`${base}/book/?manage=previous`);
        await started.promise;
        await expect(page.getByRole("heading", { name: "Opening your lesson…" })).toBeVisible();
        if (width === 390) {
          await expect(page.getByRole("dialog")).toBeFocused();
          await page.keyboard.press("Escape");
        }
        else await page.getByRole("button", { name: "Close lesson management" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        assert.equal(await page.evaluate(() => document.body.style.overflow), "");
        assert.equal(new URL(page.url()).searchParams.has("manage"), false);
        const response = page.waitForResponse("**/bookings/previous");
        waiting.resolve();
        await response;
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.getByText("An old lesson request failed.")).toHaveCount(0);
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await context.close(); }
    }

    // Focus starts on the dialog itself while its content loads. Both Tab
    // directions must stay inside, including the first Shift+Tab.
    {
      const state = await fixture(width);
      try {
        await state.page.goto(`${base}/book/?manage=next`);
        const dialog = state.page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: "Manage this lesson" })).toBeVisible();
        await dialog.focus();
        await state.page.keyboard.press("Shift+Tab");
        assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
        await state.page.keyboard.press("Tab");
        await expect(dialog.getByRole("button", { name: "Close lesson management" })).toBeFocused();
        await state.page.keyboard.press("Shift+Tab");
        await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();

        // Each decision replaces the clicked control. Focus must move to
        // the new dialog content rather than falling back to the page body.
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(dialog.getByRole("heading", { name: "Cancel this lesson?" })).toBeVisible();
        await expect(dialog).toBeFocused();
        await state.page.keyboard.press("Tab");
        await expect(dialog.getByRole("button", { name: "Close lesson management" })).toBeFocused();
        await state.page.keyboard.press("Shift+Tab");
        await expect(dialog.getByRole("button", { name: "Keep lesson", exact: true })).toBeFocused();
        await dialog.getByRole("button", { name: "Keep lesson", exact: true }).click();
        await expect(dialog.getByRole("heading", { name: "Manage this lesson" })).toBeVisible();
        await expect(dialog).toBeFocused();
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // Held card setups are neither booked lessons nor completed history.
    // Their management view must explain the pending state and allow booking
    // again without offering confirmed-lesson change or sequence controls.
    {
      const held = { ...nextLesson, status: "pending_payment", paymentStatus: "pending", seriesId: "held-series" };
      const oldHold = { ...held, reference: "OLD-HOLD", startAt: "2026-09-01T09:00:00Z", endAt: "2026-09-01T10:00:00Z", isPast: true };
      const state = await fixture(width, async path => {
        if (path === "/me") return { json: { student, bookings: [held, oldHold], series: [{ id: "held-series", weekday: 2, minuteOfDay: 600, occurrences: 4, upcoming: 0 }], sameDayFeeCents: 500 } };
        if (path === "/bookings/next") return { json: { booking: held, isPast: false, sameDayFeeApplies: false } };
        return null;
      });
      try {
        await state.page.goto(`${base}/book/?manage=next`);
        const dialog = state.page.getByRole("dialog");
        await expect(dialog.getByText("Not confirmed", { exact: true })).toBeVisible();
        await expect(dialog).toContainText("Checkout has not confirmed this lesson.");
        await expect(dialog.getByText("Booked", { exact: true })).toHaveCount(0);
        await expect(dialog.getByRole("button", { name: /^(Change|Cancel|Manage weekly lessons)$/ })).toHaveCount(0);
        await expect(state.page.locator(".calendar-week button.has-booking")).toHaveCount(0);
        await dialog.getByRole("button", { name: "Book a lesson", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(state.page.getByRole("radio", { name: "Single", exact: true })).toBeChecked();
        await state.page.getByRole("button", { name: /^Your lessons/ }).first().click();
        const toggle = state.page.locator("#account-menu-button");
        if (await toggle.isVisible()) await toggle.click();
        await state.page.locator("#account-menu").getByRole("button", { name: "Past lessons", exact: true }).click();
        await expect(state.page.locator("#account-past-lessons")).toBeVisible();
        await expect(state.page.locator(".history-lesson-card")).toHaveCount(0);
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // A payment reply belongs to the management surface that requested it.
    // After sign-out or replacement it may neither redirect to the old
    // lesson's checkout nor reopen a dialog with an old provider error.
    for (const status of [200, 503]) {
      for (const replacement of [null, newSession]) {
        const waiting = deferred(), started = deferred();
        const destinations = [], payments = [];
        const state = await fixture(width, async (path, request) => {
          if (path === "/bookings/next") return { json: { booking: { ...nextLesson, paymentStatus: "payment_due" }, isPast: false, sameDayFeeApplies: false, paymentsDue: { lesson: 2500, sameDayFee: null } } };
          if (path !== "/bookings/next/payment") return null;
          payments.push(request.postDataJSON());
          started.resolve(); await waiting.promise;
          return status === 200
            ? { json: { url: "https://checkout.stripe.com/c/pay/isolated-old-lesson" } }
            : { status, json: { error: "The old payment could not be opened." } };
        });
        await state.context.route("https://checkout.stripe.com/**", route => {
          destinations.push(route.request().url());
          return route.fulfill({ contentType: "text/html", body: "<title>Isolated checkout</title>" });
        });
        try {
          await state.page.goto(`${base}/book/?manage=next`);
          await state.page.getByRole("button", { name: "Pay €25 securely", exact: true }).click();
          await started.promise;
          await replaceSession(state.page, replacement);
          await expect(state.page.getByRole("dialog")).toHaveCount(0);
          const response = state.page.waitForResponse("**/bookings/next/payment");
          waiting.resolve(); await response;
          await state.page.waitForLoadState("networkidle");
          assert.equal(new URL(state.page.url()).origin, new URL(base).origin);
          assert.deepEqual(destinations, []);
          assert.deepEqual(payments, [{ purpose: "lesson" }]);
          await expect(state.page.getByRole("dialog")).toHaveCount(0);
          assert.equal(await currentSession(state.page), replacement);
          assert.deepEqual(state.errors, []);
        } finally { waiting.resolve(); await state.context.close(); }
      }
    }

    // Leaving the page also abandons the redirect, even if the session stays.
    {
      const waiting = deferred(), started = deferred(), destinations = [];
      const state = await fixture(width, async path => {
        if (path === "/bookings/next") return { json: { booking: { ...nextLesson, paymentStatus: "payment_due" }, isPast: false, sameDayFeeApplies: false, paymentsDue: { lesson: 2500, sameDayFee: null } } };
        if (path !== "/bookings/next/payment") return null;
        started.resolve(); await waiting.promise;
        return { json: { url: "https://checkout.stripe.com/c/pay/isolated-abandoned-lesson" } };
      });
      await state.context.route("https://checkout.stripe.com/**", route => {
        destinations.push(route.request().url());
        return route.fulfill({ contentType: "text/html", body: "<title>Isolated checkout</title>" });
      });
      try {
        await state.page.goto(`${base}/`);
        await state.page.getByRole("link", { name: "Book a lesson", exact: true }).click();
        await state.page.getByRole("button", { name: /^Your lessons/ }).first().click();
        await nextLessonOpener(state.page).click();
        await state.page.getByRole("button", { name: "Pay €25 securely", exact: true }).click();
        await started.promise;
        await state.page.goBack();
        await expect.poll(() => new URL(state.page.url()).pathname).toBe("/");
        const response = state.page.waitForResponse("**/bookings/next/payment");
        waiting.resolve(); await response;
        await state.page.waitForLoadState("networkidle");
        assert.equal(new URL(state.page.url()).pathname, "/");
        assert.deepEqual(destinations, []);
        assert.equal(await currentSession(state.page), oldSession);
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Normal lesson and fee recovery still follow a valid Stripe destination.
    for (const [purpose, cents] of [["lesson", 2500], ["same-day-fee", 500]]) {
      const destination = `https://checkout.stripe.com/c/pay/isolated-current-${purpose}`;
      const payments = [];
      const state = await fixture(width, async (path, request) => {
        if (path === "/bookings/next") return { json: { booking: { ...nextLesson, status: purpose === "lesson" ? "confirmed" : "cancelled", paymentStatus: purpose === "lesson" ? "payment_due" : "scheduled" }, isPast: false, sameDayFeeApplies: false, paymentsDue: { lesson: purpose === "lesson" ? cents : null, sameDayFee: purpose === "same-day-fee" ? cents : null } } };
        if (path !== "/bookings/next/payment") return null;
        payments.push(request.postDataJSON());
        return { json: { url: destination } };
      });
      await state.context.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Isolated current checkout</title>" }));
      try {
        await state.page.goto(`${base}/book/?manage=next`);
        await state.page.getByRole("button", { name: `Pay €${cents / 100} securely`, exact: true }).click();
        await state.page.waitForURL(destination);
        assert.deepEqual(payments, [{ purpose }]);
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // A mutation may finish after another tab signs out. Its server result
    // must not reopen a private management surface on this signed-out tab.
    {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/bookings/next/cancel") return null;
        started.resolve(); await waiting.promise;
        return { json: { booking: { ...nextLesson, status: "cancelled" }, sameDayFeeApplied: false } };
      });
      try {
        await state.page.goto(`${base}/book/?manage=next`);
        const dialog = state.page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await dialog.getByRole("button", { name: "Yes, cancel it", exact: true }).click();
        await started.promise;
        await replaceSession(state.page, null);
        await expect(dialog).toHaveCount(0);
        const response = state.page.waitForResponse("**/bookings/next/cancel");
        waiting.resolve(); await response;
        await state.page.waitForLoadState("networkidle");
        await expect(dialog).toHaveCount(0);
        await expect(state.page.getByText(student.name, { exact: true })).toHaveCount(0);
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // A return flag without the returned lesson's manage token is not
    // evidence of success, even when the account has older booked lessons.
    for (const account of [null, [], [nextLesson]]) {
      const state = await fixture(width, async path => path === "/me"
        ? { json: { student, bookings: account ?? [], series: [], sameDayFeeCents: 500 } } : null);
      try {
        if (account === null) await state.page.addInitScript(key => localStorage.removeItem(key), sessionKey);
        await state.page.goto(`${base}/book/?card=saved&view=lessons`);
        await expect(state.page.locator(".booking-card-return--confirming")).toBeVisible();
        await state.page.waitForTimeout(1500);
        await expect(state.page.locator(".booking-card-return--confirmed")).toHaveCount(0);
        await expect(state.page.locator(".booking-card-return")).not.toContainText("Your confirmation email is on its way");
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // A valid checkout return stays pending until its own lesson confirms.
    // The same token is used for one lesson, weekly runs and selections.
    {
      let confirmed = false, requests = 0;
      const state = await fixture(width, async path => {
        if (path !== "/bookings/next") return null;
        requests += 1;
        return { json: { booking: { ...nextLesson, status: confirmed ? "confirmed" : "pending_payment" }, isPast: false, sameDayFeeApplies: false } };
      });
      try {
        await state.page.goto(`${base}/book/?manage=next&view=lessons&card=saved`);
        await expect(state.page.locator(".booking-card-return--confirming")).toBeVisible();
        await expect.poll(() => requests).toBeGreaterThanOrEqual(2);
        await state.page.waitForLoadState("networkidle");
        await expect(state.page.locator(".booking-card-return--confirmed")).toHaveCount(0);
        confirmed = true;
        await expect(state.page.locator(".booking-card-return--confirmed")).toContainText("You’re booked in.");
        assert.equal(new URL(state.page.url()).searchParams.has("manage"), false);
        assert.equal(new URL(state.page.url()).searchParams.has("card"), false);
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // The teacher's initialized schedule follows cross-tab sign-out too;
    // holding a stale bearer token must not keep the private workspace open.
    {
      const teacher = { ...student, id: "recovery-teacher", name: "Recovery Teacher", role: "teacher" };
      const state = await fixture(width, async path => path === "/me"
        ? { json: { student: teacher, bookings: [], series: [], sameDayFeeCents: 500 } } : null);
      try {
        await state.page.goto(`${base}/schedule/`);
        await expect(state.page.locator(".teacher-workspace")).toBeVisible();
        await replaceSession(state.page, null);
        await expect(state.page.locator(".teacher-workspace")).toHaveCount(0);
        await expect(state.page.getByText(teacher.name, { exact: true })).toHaveCount(0);
        await expect(state.page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // Open another lesson before the first response returns. Its date and
    // management actions must continue to refer to the new lesson.
    {
      const waiting = deferred();
      const state = await fixture(width, async path => {
        if (path !== "/bookings/previous") return null;
        await waiting.promise;
        return { json: { booking: previousLesson, isPast: false, sameDayFeeApplies: false } };
      });
      const { page, context } = state;
      try {
        await page.goto(`${base}/book/?manage=previous`);
        await page.getByRole("button", { name: "Close lesson management" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await nextLessonOpener(page).click();
        await expect(page.getByRole("dialog")).toContainText("Tuesday, 15 September 2026");
        const response = page.waitForResponse("**/bookings/previous");
        waiting.resolve(); await response;
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("dialog")).toContainText("Tuesday, 15 September 2026");
        await expect(page.getByRole("dialog")).not.toContainText("Wednesday, 16 September 2026");
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await context.close(); }
    }

    // An expired request sent before a new sign-in cannot forget or revoke
    // the new session. Test both account and protected booking endpoints.
    for (const endpoint of ["/me", "/me/recurring-rates"]) {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async (path, request) => {
        if (path !== endpoint || request.headers().authorization !== `Bearer ${oldSession}`) return null;
        started.resolve(); await waiting.promise;
        return { status: 401, json: { error: "The previous session expired." } };
      });
      const { page, context } = state;
      try {
        await page.goto(`${base}/book/`);
        await started.promise;
        // Sign in again only once the page itself waits on the old session's
        // read, having taken over the document's early request. Before that it
        // simply reads the new session, and this passed by luck until release
        // run 259 caught a stale refusal opening the page on booking.
        await page.waitForFunction(() => !window.__inesMe);
        await replaceSession(page, newSession);
        const response = page.waitForResponse(url => new URL(url.url()).pathname === endpoint);
        waiting.resolve(); await response;
        await page.waitForLoadState("networkidle");
        assert.equal(await currentSession(page), newSession, `${endpoint} must preserve the new session at ${width}px`);
        await expect(page.getByText(replacementStudent.name, { exact: true }).filter({ visible: true })).toBeVisible();
        assert.deepEqual(state.logouts, [], "An old refusal must never revoke the new session");
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await context.close(); }
    }

    // A signed-out tab must also drop already-loaded booking markers and
    // bearer management links, including while its booking calendar is open.
    {
      const state = await fixture(width);
      try {
        await state.page.goto(`${base}/book/?view=book`);
        // While booking, the account's own bar heads the booking bar.
        await expect(state.page.locator(".booking-bar__head .account-menu")).toBeVisible();
        await expect(state.page.locator(".calendar-week button.has-booking")).toHaveCount(1);
        await replaceSession(state.page, null);
        await expect(state.page.locator(".calendar-week button.has-booking")).toHaveCount(0);
        await expect(state.page.locator(".booking-bar__head .account-menu")).toHaveCount(0);
        await expect(state.page.getByText(student.name, { exact: true })).toHaveCount(0);
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }

    // Email confirmation rotates its session. A reply from the previous
    // account may not replace a newer sign-in with that rotated old session.
    {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async (path, request) => {
        if (path !== "/me/email/confirm") return null;
        if (request.headers().authorization !== `Bearer ${oldSession}`) return { status: 400, json: { error: "This link belongs to another account." } };
        started.resolve(); await waiting.promise;
        return { json: { student, session: "isolated-rotated-old-session" } };
      });
      try {
        await state.page.goto(`${base}/book/?view=lessons&emailToken=isolated-change-token`);
        await started.promise;
        await replaceSession(state.page, newSession);
        await expect(state.page.getByText(replacementStudent.name, { exact: true }).filter({ visible: true })).toBeVisible();
        const response = state.page.waitForResponse("**/me/email/confirm");
        waiting.resolve(); await response;
        await state.page.waitForLoadState("networkidle");
        assert.equal(await currentSession(state.page), newSession);
        await expect(state.page.getByText(replacementStudent.name, { exact: true }).filter({ visible: true })).toBeVisible();
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // Leaving the teacher workspace while a connection request is pending
    // must also prevent its late response from sending the browser to Google.
    {
      const waiting = deferred(), started = deferred();
      const teacher = { ...student, role: "teacher" };
      const state = await fixture(width, async path => {
        if (path === "/me") return { json: { student: teacher, bookings: [], series: [] } };
        if (path === "/admin/google-calendar") return { json: { configured: true, connected: false, needsReconnect: false, pending: 0 } };
        if (path !== "/admin/google-calendar/connect") return null;
        started.resolve(); await waiting.promise;
        return { json: { url: "https://accounts.google.com/o/oauth2/v2/auth?fixture=recovery" } };
      });
      await state.page.route("https://accounts.google.com/**", route => route.fulfill(
        route.request().resourceType() === "script"
          ? { contentType: "application/javascript", body: "/* Isolated Google SDK. */" }
          : { contentType: "text/html", body: "<title>Unexpected old connection</title>" }
      ));
      try {
        await state.page.goto(`${base}/schedule/`);
        await state.page.getByRole("button", { name: "Configure", exact: true }).click();
        await state.page.getByRole("button", { name: "Connect Google Meet", exact: true }).click();
        await started.promise;
        await replaceSession(state.page, null);
        await expect(state.page.locator(".teacher-workspace")).toHaveCount(0);
        const response = state.page.waitForResponse("**/admin/google-calendar/connect");
        waiting.resolve(); await response;
        await state.page.waitForLoadState("networkidle");
        assert.equal(new URL(state.page.url()).origin, new URL(base).origin);
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await state.context.close(); }
    }

    // A successful account reply arriving after sign-out cannot restore the
    // previous student's private account view, in either workspace.
    for (const path of ["/book/", "/schedule/"]) {
      const waiting = deferred(), started = deferred();
      const state = await fixture(width, async endpoint => {
        if (endpoint !== "/me") return null;
        started.resolve(); await waiting.promise;
        return { json: { student, bookings: [nextLesson], series: [], sameDayFeeCents: 500 } };
      });
      const { page, context } = state;
      try {
        await page.goto(`${base}${path}`);
        await started.promise;
        await replaceSession(page, null);
        const response = page.waitForResponse("**/me");
        waiting.resolve(); await response;
        await page.waitForLoadState("networkidle");
        await expect(page.getByText(student.name, { exact: true })).toHaveCount(0);
        await expect(page.locator("#account-menu-button")).toHaveCount(0);
        assert.equal(await currentSession(page), null);
        assert.deepEqual(state.errors, []);
      } finally { waiting.resolve(); await context.close(); }
    }

    // Refusing the actual current session still signs the browser out. It
    // needs no second logout request for a session the server already refused.
    {
      const state = await fixture(width, async path => path === "/me"
        ? { status: 401, json: { error: "The current session expired." } } : null);
      try {
        await state.page.goto(`${base}/book/`);
        await expect.poll(() => currentSession(state.page)).toBe(null);
        await state.page.waitForLoadState("networkidle");
        assert.deepEqual(state.logouts, []);
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }
  }
  console.log(`Request recovery passed in ${engine} at 320/390/1280px: dismiss/reopen, stale replies and mutations, decision focus, pending lesson/history status, payment redirects, session replacement, cross-tab sign-out and truthful card-return status.`);
} finally {
  await browser.close();
}
