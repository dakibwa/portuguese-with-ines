import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Accounts, codes and prices are isolated fixtures: no request reaches the
// Worker. What the Worker does with a code (its length comes from the code, one
// rate per length, the first grant wins, eight attempts per window) is proven in
// workers/booking/integration-test.mjs. This checks what a student sees under
// Edit details, that sign-up stays free of any code field, and that a rate saved
// there prices the next weekly booking without being typed again.
const base = (process.env.QA_BASE_URL ?? "").replace(/\/$/, "");
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const out = "tmp/qa/profile-rates";
await mkdir(out, { recursive: true });

const catalogue = {
  TEST15: { duration: 60, cents: 1500 },
  MOCK19: { duration: 60, cents: 1900 },
  DEMO27: { duration: 90, cents: 2700 }
};
const types = [
  { id: "trial", slug: "trial", name: "Trial lesson", description: "", duration_minutes: 60, price_cents: 2000 },
  { id: "single", slug: "single", name: "Single lesson", description: "", duration_minutes: 60, price_cents: 2500 },
  { id: "long", slug: "long", name: "Long lesson", description: "", duration_minutes: 90, price_cents: 3500 }
];
const student = { id: "student-rates", name: "Ana Martins", email: "ana@example.invalid", phone: "", nif: "", timezone: "Europe/Lisbon", role: "student" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const addWeeks = (start, index) => new Date(Date.parse(start) + index * 7 * 86400000).toISOString();

const browser = await chromium.launch({ headless: true });

async function open(width, { session = true, ratesReadFails = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 900 }, hasTouch: width < 741, reducedMotion: "reduce", timezoneId: "Europe/Lisbon"
  });
  const state = { rates: {}, posts: [], failReads: ratesReadFails };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  if (session) await context.addInitScript(() => localStorage.setItem("ines-student-session", "isolated-rates-fixture"));
  await context.route("**/*", (route, request) => {
    // Preflights for the routes below; anything else falls through untouched.
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    return route.fallback();
  });
  await context.route("**/me", (route) => json(route, { student, bookings: [], series: [], sameDayFeeCents: 500 }));
  await context.route("**/me/recurring-rates", (route) => {
    if (route.request().method() === "GET") {
      return state.failReads ? json(route, { error: "Unavailable" }, 500) : json(route, { rates: state.rates });
    }
    // The Worker's rules, as far as the page can see them.
    const body = route.request().postDataJSON();
    state.posts.push(body);
    const entry = catalogue[String(body.code).trim().toUpperCase()];
    if (!entry) return json(route, { error: "We don't recognise that code. Check it with Inês." }, 400);
    if (state.rates[entry.duration] !== undefined && state.rates[entry.duration] !== entry.cents) {
      return json(route, { error: `You already have an agreed rate for ${entry.duration}-minute lessons. Ask Inês if it needs to change.` }, 409);
    }
    state.rates = { ...state.rates, [entry.duration]: entry.cents };
    return json(route, { rates: state.rates, saved: { durationMinutes: entry.duration, cents: entry.cents } });
  });
  await context.route("**/lesson-types", (route) => json(route, { lessonTypes: types, paymentMode: "postpay", postpay: true, paymentReady: true }));
  await context.route("**/availability?*", (route) => {
    const type = types.find((item) => item.id === new URL(route.request().url()).searchParams.get("lessonType")) ?? types[1];
    const slotsByDate = {};
    for (let index = 0; index < 56; index++) {
      const date = new Date(Date.UTC(2026, 8, 14 + index));
      if ([0, 6].includes(date.getUTCDay())) continue;
      slotsByDate[date.toISOString().slice(0, 10)] = [9, 10, 14, 16].map((hour) => ({
        startAt: new Date(Date.UTC(2026, 8, 14 + index, hour)).toISOString(),
        endAt: new Date(Date.UTC(2026, 8, 14 + index, hour, type.duration_minutes)).toISOString()
      }));
    }
    return json(route, { slotsByDate, timeZone: "Europe/Lisbon", minimumNoticeHours: 14, horizonDays: 84, lessonType: type });
  });
  await context.route("**/bookings/series/preview", (route) => {
    const body = route.request().postDataJSON();
    return json(route, { weeks: body.weeks, openEnded: body.weeks === null, bookable: Array.from({ length: body.weeks ?? 12 }, (_, i) => addWeeks(body.startAt, i)), skipped: [] });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-09-11T12:00:00Z"));
  await page.goto(`${base}/book/?view=lessons`, { waitUntil: "domcontentloaded" });
  return { context, page, state, errors };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// The student's name opens the account's menu.
async function chooseFromMenu(page, name) {
  await page.locator("#account-menu").waitFor({ state: "attached" });
  const toggle = page.locator("#account-menu-button");
  if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.locator("#account-menu").getByRole("button", { name, exact: true }).click();
}

try {
  for (const width of [1280, 820, 390]) {
    // Sign-up is not the place for a code: only some students have one, and a
    // field there would suggest most people should.
    const signedOut = await open(width, { session: false });
    await signedOut.page.getByRole("tab", { name: "Create an account", exact: true }).click();
    const signUp = signedOut.page.locator(".auth-panel__form");
    await signUp.getByLabel("Your name").waitFor();
    assert.equal(await signUp.getByLabel(/code/i).count(), 0, `Sign-up has no code field at ${width}px`);
    assert.doesNotMatch(await signUp.innerText(), /code from|promo|discount/i, `Sign-up does not mention a code at ${width}px`);
    assert.deepEqual(signedOut.errors, []);
    await signedOut.context.close();

    // Edit details: quiet until there is something to show.
    const account = await open(width);
    const { page, state } = account;
    await chooseFromMenu(page, "Edit details");
    const editor = page.locator(".my-lessons__details");
    await editor.getByRole("button", { name: "Change name", exact: true }).waitFor();
    const disclosure = editor.locator("details.my-lessons__code");
    await expect(disclosure.locator("summary")).toHaveText("Have a code from Inês?");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(editor.getByLabel("Your code")).toBeHidden();
    await expect(editor.locator(".my-lessons__rates-list")).toHaveCount(0);
    assert.doesNotMatch(await editor.innerText(), /standard price|lesson rates/i, "Nothing suggests a student should have a rate");
    assert.ok(await noOverflow(page), `Closed disclosure fits at ${width}px`);
    await editor.screenshot({ path: `${out}/closed-${width}.png` });

    // A 60 minute code, then a 90 minute one, from the same field.
    await disclosure.locator("summary").click();
    const code = editor.getByLabel("Your code");
    const add = editor.getByRole("button", { name: "Add code", exact: true });
    await expect(code).toBeVisible();
    await expect(add).toBeDisabled();
    // Like every other field here, the action appears once there is something
    // to add: beside its field whenever the row is wide enough, beneath it on
    // a phone.
    await code.fill(" test15 ");
    await expect(add).toBeEnabled();
    const [fieldRight, actionLeft, fieldBottom, actionTop] = await editor.locator("details.my-lessons__code .my-lessons__details-row").evaluate((row) => {
      const field = row.querySelector("label").getBoundingClientRect();
      const action = row.querySelector("button").getBoundingClientRect();
      return [field.right, action.left, field.bottom, action.top];
    });
    if (width >= 700) assert.ok(actionLeft >= fieldRight - 1, `Add code sits beside its field at ${width}px`);
    else assert.ok(actionTop >= fieldBottom - 1, `Add code sits under its field at ${width}px`);
    await add.click();
    await expect(editor.getByRole("status")).toHaveText("Saved. Your 60-minute weekly lessons are now €15 each.");
    const rows = editor.locator(".my-lessons__rates-list li");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("60-minute weekly lessons");
    await expect(rows.first()).toContainText("€15 each");
    await expect(code).toHaveValue("");
    await expect(code).toBeFocused();
    await expect(disclosure).toHaveAttribute("open", "");
    await code.fill("DEMO27");
    await code.press("Enter");
    await expect(editor.getByRole("status")).toHaveText("Saved. Your 90-minute weekly lessons are now €27 each.");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("90-minute weekly lessons");
    await expect(rows.nth(1)).toContainText("€27 each");
    assert.ok(await noOverflow(page), `Saved rates fit at ${width}px`);
    await editor.screenshot({ path: `${out}/saved-${width}.png` });

    // A second code for a length that already has a rate is refused, saying
    // which length, and the typed code stays so a slip can be fixed.
    const alert = page.locator(".my-lessons__details .booking-alert[role=alert]");
    await code.fill("mock19");
    await add.click();
    await expect(alert).toContainText("You already have an agreed rate for 60-minute lessons. Ask Inês if it needs to change.");
    await expect(code).toHaveValue("mock19");
    await expect(rows.first()).toContainText("€15 each");
    await code.fill("NOPE15");
    await add.click();
    await expect(alert).toContainText("We don't recognise that code. Check it with Inês.");
    await expect(rows).toHaveCount(2);
    assert.ok(await noOverflow(page), `A refused code fits at ${width}px`);
    await editor.screenshot({ path: `${out}/refused-${width}.png` });
    // No length is ever sent: the code says which one it is for.
    assert.deepEqual(state.posts, [{ code: "test15" }, { code: "DEMO27" }, { code: "mock19" }, { code: "NOPE15" }]);

    // What was saved here prices the next weekly booking, without a reload and
    // without the code being typed again at the confirmation.
    await chooseFromMenu(page, "Done editing");
    await page.getByRole("button", { name: /^Book a (new )?lesson$/ }).first().click();
    await page.getByRole("radio", { name: "Weekly", exact: true }).check();
    await page.locator('button[data-date-key="2026-09-14"]').click();
    const part = page.locator('.time-picker__parts input[value="early"]');
    if (await part.count()) await part.check();
    await page.getByRole("button", { name: "10:00", exact: true }).click();
    await page.locator("#booking-confirmation-stage").waitFor();
    await expect(page.getByText("€15 per lesson", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/your code/i)).toHaveCount(0);
    await expect(page.getByText(/Have a code|Apply and save rate/)).toHaveCount(0);
    await page.getByRole("radio", { name: /^90-minute lesson/ }).check();
    await expect(page.getByText("€27 per lesson", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/your code/i)).toHaveCount(0);
    await page.locator("#booking-confirmation-stage").screenshot({ path: `${out}/booking-${width}.png` });
    assert.ok(await noOverflow(page), `Confirmation fits at ${width}px`);

    // A booked weekly lesson retains its agreed price; changing its length
    // picks up that length's saved profile rate with no second code field.
    await page.route("**/bookings/profile-rate-lesson", (route) => route.fulfill({
      json: {
        booking: {
          reference: "PROFILE-RATE", status: "confirmed",
          startAt: "2026-09-14T09:00:00Z", endAt: "2026-09-14T10:00:00Z",
          location: "online", studentName: student.name, studentEmail: student.email,
          studentTimezone: student.timezone, notes: "", rescheduleCount: 0,
          sameDayFeeCents: 500, paymentStatus: "scheduled", amountCents: 1800,
          lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
        },
        recurring: true, durationPrices: state.rates,
        isPast: false, sameDayFeeApplies: false, changeLocked: false, refundOnCancel: false
      }, headers: cors
    }));
    await page.goto(`${base}/book/?manage=profile-rate-lesson`, { waitUntil: "domcontentloaded" });
    await page.getByRole("dialog", { name: "Manage this lesson", exact: true }).getByRole("button", { name: "Change", exact: true }).click();
    const change = page.getByRole("dialog", { name: "Choose a new date and time", exact: true });
    await expect(change.getByText("€18 per lesson · weekly rate", { exact: true })).toBeVisible();
    await change.getByRole("radio", { name: "90 minutes", exact: true }).check();
    await expect(change.getByText("€27 per lesson · weekly rate", { exact: true })).toBeVisible();
    await expect(change.getByLabel(/your code/i)).toHaveCount(0);
    await expect(change.getByText(/Have a code|Apply and save rate/)).toHaveCount(0);
    await change.screenshot({ path: `${out}/change-length-${width}.png` });
    assert.deepEqual(account.errors, []);
    await account.context.close();
  }

  // If the saved rates can't be read, say so quietly and still let a code in.
  const failing = await open(1280, { ratesReadFails: true });
  await chooseFromMenu(failing.page, "Edit details");
  const failingEditor = failing.page.locator(".my-lessons__details");
  await expect(failingEditor).toContainText("We couldn’t check your saved weekly rates just now.");
  await failingEditor.locator("details.my-lessons__code summary").click();
  await failingEditor.getByLabel("Your code").fill("TEST15");
  await failingEditor.getByRole("button", { name: "Add code", exact: true }).click();
  await expect(failingEditor.getByRole("status")).toHaveText("Saved. Your 60-minute weekly lessons are now €15 each.");
  await expect(failingEditor.locator(".my-lessons__rates-list li")).toHaveCount(1);
  await expect(failingEditor).not.toContainText("We couldn’t check your saved weekly rates just now.");
  assert.deepEqual(failing.errors, []);
  await failing.context.close();

  console.log("Profile rates passed: no code at sign-up, quiet by default, a 60 and a 90 minute code from one field, refusals, unreadable rates, and the saved rates price weekly booking and length changes with no code entry; 1280/820/390px.");
} finally {
  await browser.close();
}
