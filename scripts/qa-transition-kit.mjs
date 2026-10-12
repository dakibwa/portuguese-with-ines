import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

/*
 * Students Inês brings onto the site (12 October 2026): the one-click sign-in
 * link from their email, a spent link asking for a new one, and the card that
 * pays for the lessons she adds. Accounts and lessons are isolated fixtures:
 * no request reaches the Worker or Stripe.
 */
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Supply QA_BASE_URL explicitly.");
const browser = await chromium.launch({ headless: true });
const student = {
  id: "student-brought", name: "Rita Sousa", email: "rita@example.invalid", phone: "", nif: "", timezone: "Europe/Lisbon",
  role: "student", hasCard: false, cardForAllLessons: false,
};
const added = {
  reference: "PT-ADDED1", status: "confirmed", startAt: "2026-09-10T16:00:00.000Z", endAt: "2026-09-10T17:00:00.000Z",
  cancelledAt: null, location: "online", meetingUrl: null, notes: "",
  lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
  isPast: false, sameDayFeeApplies: false, sameDayFeeAutomatic: false, changeLocked: false,
  paymentStatus: "not_required", seriesId: null, addedByTeacher: true, manageToken: "qa-manage-added",
};
await mkdir("tmp/qa/transition-kit", { recursive: true });

async function open(width, path, { session = "", me = student, bookings = [added], reply = () => null } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 741 });
  const errors = [];
  const posts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-09-07T10:15:00Z"));
  if (session) await page.addInitScript((value) => localStorage.setItem("ines-student-session", value), session);
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Stripe</title>" }));
  await page.route(url => /^\/(me(?:\/|$)|auth\/|lesson-types$|availability$|bookings)/.test(url.pathname), async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    if (body) posts.push({ endpoint, body });
    const fixture = reply(endpoint, body);
    if (fixture) return route.fulfill(fixture);
    if (endpoint === "/me" && !body) return route.fulfill({ json: { student: me, bookings, series: [], sameDayFeeCents: 500, cardsAccepted: true } });
    if (endpoint === "/me/recurring-rates") return route.fulfill({ json: { rates: {} } });
    if (endpoint === "/lesson-types") return route.fulfill({ json: { lessonTypes: [], postpay: true, paymentReady: true } });
    if (endpoint === "/availability") return route.fulfill({ json: { slotsByDate: {}, horizonDays: 56 } });
    errors.push(`Unexpected fixture request: ${request.method()} ${endpoint}`);
    return route.abort();
  });
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  return { page, errors, posts };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function chooseFromMenu(page, name) {
  await page.locator("#account-menu").waitFor({ state: "attached" });
  const toggle = page.locator("#account-menu-button");
  if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.locator("#account-menu").getByRole("button", { name, exact: true }).click();
}

try {
  for (const width of [1280, 390]) {
    // The link in Inês's email signs the student in, leaves the address bar,
    // and opens Your lessons with one quiet ask for a card.
    const linked = await open(width, "/book/?signin=qa-good-link", {
      reply: (endpoint) => {
        if (endpoint === "/auth/email-link/confirm") return { json: { student, session: "qa-link-session" } };
        if (endpoint === "/me/card") return { json: { checkoutUrl: "https://checkout.stripe.com/c/pay/qa" } };
        return null;
      },
    });
    const prompt = linked.page.locator(".card-prompt");
    await expect(prompt.getByRole("heading", { name: "Pay by card" })).toBeVisible({ timeout: 15000 });
    await expect(prompt).toContainText("Add your card once. Each lesson is paid after it ends.");
    assert.ok(!linked.page.url().includes("signin="), "the link is spent from the address bar");
    assert.equal(await linked.page.evaluate(() => localStorage.getItem("ines-student-session")), "qa-link-session");
    assert.deepEqual(linked.posts.filter((post) => post.endpoint === "/auth/email-link/confirm").map((post) => post.body), [{ token: "qa-good-link" }]);
    await expect(linked.page.getByRole("heading", { name: "Your account" })).toHaveCount(0);
    assert.ok(await noOverflow(linked.page), `no sideways scroll at ${width}px`);
    await linked.page.screenshot({ path: `tmp/qa/transition-kit/prompt-${width}.png`, fullPage: false });

    await prompt.getByRole("button", { name: "Add card" }).click();
    await expect(prompt.locator(".booking-payment-facts")).toContainText("Paid after each lesson");
    await linked.page.screenshot({ path: `tmp/qa/transition-kit/terms-${width}.png`, fullPage: false });
    await prompt.getByRole("button", { name: "Agree & add card" }).click();
    await linked.page.waitForURL(/checkout\.stripe\.com/);
    assert.deepEqual(linked.posts.find((post) => post.endpoint === "/me/card")?.body, { consent: true });
    assert.deepEqual(linked.errors, []);
    await linked.page.close();

    // A spent link says so and opens on asking for a new one.
    const spent = await open(width, "/book/?signin=qa-spent-link", {
      reply: (endpoint) => {
        if (endpoint === "/auth/email-link/confirm") {
          return { status: 400, json: { error: "That sign-in link has already been used. Ask for a new one below." } };
        }
        if (endpoint === "/auth/email-link") return { json: { ok: true } };
        return null;
      },
    });
    await expect(spent.page.locator(".auth-panel [role=alert]")).toContainText("already been used", { timeout: 15000 });
    await expect(spent.page.getByRole("heading", { name: "Sign in by email" })).toBeVisible();
    await spent.page.locator(".auth-panel__form").getByLabel("Email").fill("rita@example.invalid");
    await spent.page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(spent.page.locator(".auth-panel [role=status]")).toContainText("a link is on its way");
    assert.deepEqual(spent.posts.find((post) => post.endpoint === "/auth/email-link")?.body, { email: "rita@example.invalid" });
    await spent.page.getByRole("button", { name: "Back to signing in" }).click();
    await expect(spent.page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    await expect(spent.page.getByRole("button", { name: "I’ve forgotten my password" })).toBeVisible();
    assert.ok(await noOverflow(spent.page), `no sideways scroll at ${width}px`);
    assert.deepEqual(spent.errors, []);
    await spent.page.close();

    // Back from Stripe: a short thank-you, no ask, and the card in Your details.
    const saved = await open(width, "/book/?view=lessons&card=added", {
      session: "qa-link-session",
      me: { ...student, hasCard: true, cardForAllLessons: true },
      bookings: [{ ...added, paymentStatus: "scheduled" }],
    });
    await expect(saved.page.locator(".card-added")).toContainText("Card saved", { timeout: 15000 });
    await expect(saved.page.locator(".card-prompt")).toHaveCount(0);
    assert.ok(!saved.page.url().includes("card="), "the return marker leaves the address bar");
    await chooseFromMenu(saved.page, "Edit details");
    const cardRow = saved.page.locator('.my-lessons__fact[data-field="card"]');
    await expect(cardRow).toContainText("Saved");
    await cardRow.getByRole("button", { name: /Change/ }).click();
    await expect(cardRow.getByRole("button", { name: "Agree & change card" })).toBeVisible();
    // The row eases open to its new height; it ends whole, nothing clipped.
    await saved.page.waitForTimeout(700);
    await cardRow.scrollIntoViewIfNeeded();
    assert.ok(await cardRow.evaluate((row) => row.scrollHeight <= row.clientHeight + 1), "the open row shows all of its terms");
    await saved.page.screenshot({ path: `tmp/qa/transition-kit/details-${width}.png`, fullPage: false });
    assert.ok(await noOverflow(saved.page), `no sideways scroll at ${width}px`);
    assert.deepEqual(saved.errors, []);
    await saved.page.close();
  }
  console.log("Transition kit: sign-in links, the card prompt and the card row pass at desktop and phone widths.");
} finally {
  await browser.close();
}
