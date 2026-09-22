import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

// Explicit opt-in: creates two labelled verification accounts, grants their
// private rates and revokes their sessions. Never books a slot or takes money.
const api = process.env.QA_RATE_API;
const base = process.env.QA_BASE_URL;
if (!api || !base || !process.env.INES_PRIVATE_RATES_FILE) throw new Error("Supply explicit API, site and private owner file.");
const catalogue = [...readFileSync(process.env.INES_PRIVATE_RATES_FILE, "utf8").matchAll(/^\| (60|90) \| €(\d+) \| ([A-Z]{4}\d{2}) \|$/gm)]
  .map(([, duration, price, code]) => ({ duration: Number(duration), cents: Number(price) * 100, code }));
const accounts = [];
async function request(path, body, session = "") {
  const response = await fetch(`${api}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Origin: "https://portuguesewithines.com", "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
for (let index = 0; index < 2; index++) {
  const response = await request("/auth/register", { name: "Launch Verification", email: `launch-check-${crypto.randomUUID()}@example.invalid`, password: crypto.randomUUID(), timezone: "Europe/Lisbon" });
  assert.equal(response.status, 201, "Verification registration failed");
  accounts.push(response.data);
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript((session) => localStorage.setItem("ines-student-session", session), accounts[0].session);
mkdirSync("tmp/qa", { recursive: true });
for (const [duration, width] of [[60, 390], [90, 1440]]) {
  const rate = catalogue.find((item) => item.duration === duration);
  const shared = await request("/me/recurring-rates", { code: rate.code, durationMinutes: duration }, accounts[1].session);
  assert.equal(shared.status, 200);
  assert.equal(shared.data.rates[duration], rate.cents);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Book a (new )?lesson$/ }).first().click();
  await page.getByRole("radio", { name: "Weekly", exact: true }).check();
  await page.getByRole("radio", { name: `${duration} minutes lesson · €${duration === 60 ? 25 : 35}`, exact: true }).check();
  await page.getByRole("button", { name: /times free/ }).first().click();
  await page.locator("#lesson-calendar .unified-calendar__availability .slot-grid button").first().click();
  await page.getByRole("heading", { name: "Confirm your recurring lessons", exact: true }).waitFor();
  await page.getByText("Have a code from Inês?", { exact: true }).click();
  await page.getByLabel(`Your code for ${duration} minute lessons`).fill(` ${rate.code.toLowerCase()} `);
  await page.getByRole("button", { name: "Apply and save rate", exact: true }).click();
  await page.getByText("Your recurring rate is saved for future lessons of this length. Existing bookings keep their agreed price.", { exact: true }).waitFor();
  await page.getByText(`€${rate.cents / 100} per recurring lesson`, { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".booking-confirm-button")?.disabled === false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `tmp/qa/recurring-rate-${duration}-${width}.png`, fullPage: true });
}
const persisted = await request("/me/recurring-rates", undefined, accounts[0].session);
assert.equal(persisted.data.rates[60], 1500);
assert.equal(persisted.data.rates[90], 2500);
for (const account of accounts) {
  const me = await request("/me", undefined, account.session);
  assert.equal(me.data.bookings.length, 0);
  assert.equal((await request("/auth/logout", {}, account.session)).status, 200);
  assert.equal((await request("/me/recurring-rates", undefined, account.session)).status, 401);
}
assert.deepEqual(errors, []);
await browser.close();
console.log("Live recurring-rate verification passed: two accounts reuse both duration codes, mobile/desktop redemption, persistence, no bookings, session revocation.");
