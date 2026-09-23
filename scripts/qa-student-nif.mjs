import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Accounts and lessons are isolated fixtures: no request reaches the Worker.
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const browser = await chromium.launch({ headless: true });
const student = { id: "student-nif", name: "Ana Martins", email: "ana@example.invalid", phone: "", nif: "", timezone: "Europe/Lisbon", role: "student" };
const teacher = { ...student, id: "teacher", name: "Inês", email: "teacher@example.invalid", role: "teacher" };
const lesson = (id, name, startsAt, nif) => ({
  id, reference: `TEST-${id}`, lesson_name: "60 minutes", student_name: name, student_email: `${id}@example.invalid`,
  student_phone: "", student_nif: nif, starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 3600000).toISOString(),
  status: "confirmed", location: "online", meeting_url: null, notes: "", same_day_change: 0, same_day_fee_status: "not_required",
  reschedule_count: 0, payment_status: "scheduled", attendance_status: "expected",
});
await mkdir("tmp/qa/nif", { recursive: true });

async function open(width, path, { session = "", me = student, reply = () => null } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 741 });
  const errors = [];
  const posts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-09-07T10:15:00Z"));
  if (session) await page.addInitScript((value) => localStorage.setItem("ines-student-session", value), session);
  await page.route("**/ines-booking*/**", async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    if (body) posts.push({ endpoint, body });
    const fixture = reply(endpoint, body);
    if (fixture) return route.fulfill(fixture);
    if (endpoint === "/me") return route.fulfill({ json: { student: me, bookings: [], series: [], sameDayFeeCents: 500 } });
    if (endpoint === "/me/recurring-rates") return route.fulfill({ json: { rates: {} } });
    if (endpoint === "/lesson-types") return route.fulfill({ json: { lessonTypes: [], postpay: false } });
    if (endpoint === "/availability") return route.fulfill({ json: { slotsByDate: {}, horizonDays: 56 } });
    if (endpoint === "/admin/google-calendar") return route.fulfill({ json: { configured: false, connected: false, email: null, needsReconnect: false, pending: 0 } });
    if (endpoint === "/admin/availability") return route.fulfill({ json: { rules: [], exceptions: [], settings: { slotIntervalMinutes: 30 } } });
    errors.push(`Unexpected fixture request: ${request.method()} ${endpoint}`);
    return route.abort();
  });
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  return { page, errors, posts };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

try {
  for (const width of [1280, 390]) {
    // Sign-up: optional, last, explained in two words, and a refused NIF says why.
    let attempts = 0;
    const signUp = await open(width, "/book/?view=lessons", {
      reply: (endpoint) => {
        if (endpoint !== "/auth/register") return null;
        if (++attempts === 1) return { status: 400, json: { error: "That NIF isn't valid. Check the digits, or leave it blank." } };
        return { status: 201, json: { student: { ...student, nif: "123456789" }, session: "qa-nif-session" } };
      },
    });
    await signUp.page.getByRole("tab", { name: "Create an account", exact: true }).click();
    const form = signUp.page.locator(".auth-panel__form");
    const fields = await form.locator("label > span").allInnerTexts();
    assert.match(fields.at(-1).replace(/\s+/g, " "), /^NIF \(optional\)$/i, `NIF should be the last, optional field: ${fields}`);
    await form.getByLabel("First name").fill("Ana");
    await form.getByLabel("Email").fill("ana@example.invalid");
    await form.getByLabel("Password").fill("a-long-password");
    const nif = form.getByLabel("NIF (optional)");
    await expect(nif).toHaveAttribute("inputmode", "numeric");
    await expect(form).toContainText("Added to your receipts.");
    await nif.fill(" 123456788 ");
    await form.getByRole("button", { name: "Create my account", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("That NIF isn't valid");
    assert.ok(await noOverflow(signUp.page));
    await signUp.page.locator(".auth-panel").screenshot({ path: `tmp/qa/nif/sign-up-${width}.png` });
    await nif.fill("PT 123 456 789");
    await form.getByRole("button", { name: "Create my account", exact: true }).click();
    await expect.poll(() => attempts).toBe(2);
    assert.deepEqual(signUp.posts.filter((post) => post.endpoint === "/auth/register").map((post) => post.body.nif), ["123456788", "PT 123 456 789"]);
    assert.deepEqual(signUp.errors, []);
    await signUp.page.close();

    // Edit details: save, clear, and a refused NIF leaves the saved one alone.
    let saved = "";
    const details = await open(width, "/book/?view=lessons", {
      session: "qa-nif-session",
      me: { ...student, nif: "" },
      reply: (endpoint, body) => {
        if (endpoint !== "/me" || !body) return null;
        if (body.nif === "12345") return { status: 400, json: { error: "A NIF has 9 digits. Check it, or leave it blank." } };
        saved = body.nif.replace(/\D/g, "");
        return { json: { student: { ...student, nif: saved } } };
      },
    });
    // The menu is inline on desktop; phones open it from its toggle. The
    // workspace loads the account twice on arrival; type after both land.
    await details.page.locator("#account-menu").waitFor({ state: "attached" });
    await details.page.waitForLoadState("networkidle");
    const toggle = details.page.locator(".my-lessons__menu-toggle");
    if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await details.page.locator("#account-menu").getByRole("button", { name: "Edit details", exact: true }).click();
    const editor = details.page.locator(".my-lessons__details");
    const field = editor.getByLabel("NIF (optional)");
    const save = editor.getByRole("button", { name: "Save NIF", exact: true });
    await expect(save).toBeDisabled();
    // A late second account load can still reset the field after typing, so
    // type again until the edit sticks.
    await expect(async () => {
      await field.fill("123 456 789");
      await expect(save).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await save.click();
    await expect(editor).toContainText("Saved. Your receipts will show this NIF.");
    await expect(field).toHaveValue("123456789");
    await expect(save).toBeDisabled();
    assert.ok(await noOverflow(details.page));
    await editor.screenshot({ path: `tmp/qa/nif/details-${width}.png` });
    await field.fill("12345");
    await save.click();
    await expect(details.page.locator(".booking-alert[role=alert]")).toContainText("A NIF has 9 digits");
    assert.equal(saved, "123456789");
    await field.fill("");
    await save.click();
    await expect(editor).toContainText("Saved. Your receipts won't show a NIF.");
    assert.deepEqual(details.posts.filter((post) => post.endpoint === "/me").map((post) => post.body), [{ nif: "123 456 789" }, { nif: "12345" }, { nif: "" }]);
    assert.deepEqual(details.errors, []);
    await details.page.close();

    // Inês, and the receipt automation reading her schedule, see the NIF or that there is none.
    const schedule = await open(width, "/schedule/", {
      session: "qa-nif-teacher",
      me: teacher,
      reply: (endpoint) => endpoint === "/admin/bookings"
        ? { json: { bookings: [lesson("with-nif", "Beatriz", "2026-09-07T13:00:00Z", "123456789"), lesson("without-nif", "Carla", "2026-09-07T15:00:00Z", "")] } }
        : null,
    });
    await schedule.page.getByRole("heading", { name: "7 Sept – 13 Sept 2026" }).waitFor();
    await schedule.page.getByRole("button", { name: /^Beatriz, .*View lesson$/ }).click();
    const dialog = schedule.page.locator(".teacher-lesson-facts");
    await expect(dialog).toContainText("NIF 123456789");
    await schedule.page.getByRole("button", { name: "Close lesson details" }).click();
    await schedule.page.getByRole("button", { name: /^Carla, .*View lesson$/ }).click();
    await expect(dialog).toContainText("without-nif@example.invalid");
    await expect(dialog).toContainText("NIF not given (consumidor final)");
    assert.deepEqual(schedule.errors, []);
    await schedule.page.close();
  }
  console.log("Student NIF passed: optional sign-up field, refused typo, edit/clear in details and Inês's lesson view; desktop/mobile.");
} finally {
  await browser.close();
}
