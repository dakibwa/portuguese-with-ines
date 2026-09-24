import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const out = "tmp/qa/navigation";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1100 } });
const student = { id: "navigation-preview", name: "Ana Martins", email: "preview@example.invalid", phone: "", timezone: "Europe/Lisbon", role: "student" };
const lessonType = { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
let bookings = Array.from({ length: 12 }, (_, index) => ({
  reference: `PREVIEW-${index}`, status: "cancelled", location: "online", notes: "",
  startAt: new Date(Date.UTC(2026, 8, 4 - index, 16)).toISOString(),
  endAt: new Date(Date.UTC(2026, 8, 4 - index, 17)).toISOString(),
  lessonType, isPast: true, sameDayFeeApplies: false, seriesId: null, manageToken: `preview-${index}`
}));
bookings[0].status = "confirmed";
bookings[1] = { ...bookings[1], isPast: false, startAt: "2026-11-05T16:00:00Z", endAt: "2026-11-05T17:00:00Z", cancelledAt: "2026-09-03T18:00:00Z" };
bookings[2] = { ...bookings[2], isPast: false, startAt: "2026-09-07T16:00:00Z", endAt: "2026-09-07T17:00:00Z", cancelledAt: "2026-09-05T09:00:00Z" };
const expectedHistory = [2, 0, 1, ...Array.from({ length: 9 }, (_, index) => index + 3)].map(index => `Reference PREVIEW-${index}`);
await context.addInitScript(() => localStorage.setItem("ines-student-session", "navigation-fixture"));
let accountLoads = 0;
await context.route("**/me", route => {
  if (route.request().method() === "GET") accountLoads += 1;
  return route.fulfill({
    contentType: "application/json", body: JSON.stringify({ student, bookings, series: [], sameDayFeeCents: 500 })
  });
});
await context.route("**/me/recurring-rates", route => route.fulfill({ contentType: "application/json", body: '{"rates":{}}' }));
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.clock.setFixedTime(new Date("2026-09-05T12:00:00Z"));

async function settle() {
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
}

async function accountAction(name) {
  const toggle = page.locator(".my-lessons__menu-toggle");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#account-menu").getByRole("button", { name, exact: true }).click();
}

function aligned(a, b, message) { assert.ok(Math.abs(a - b) <= 2, `${message}: ${a} / ${b}`); }

async function openMenuWithStationaryHeader(label) {
  const toggle = page.getByRole("button", { name: "Open menu", exact: true });
  await toggle.scrollIntoViewIfNeeded();
  await settle();
  const beforeLogo = await page.locator(".site-header .header-wordmark").boundingBox();
  const beforeToggle = await toggle.boundingBox();
  await toggle.click();
  const menu = page.getByRole("dialog", { name: "Site navigation" });
  await menu.waitFor();
  // Check during opening as well as after the links' entrance transition.
  for (const stage of ["opening", "open"]) {
    const logo = await menu.getByRole("img", { name: "Português com a Inês", exact: true }).boundingBox();
    const close = await menu.getByRole("button", { name: "Close menu", exact: true }).boundingBox();
    for (const edge of ["x", "y", "width", "height"]) {
      aligned(beforeLogo[edge], logo[edge], `${label} ${stage} logo ${edge}`);
      aligned(beforeToggle[edge], close[edge], `${label} ${stage} control ${edge}`);
    }
    if (stage === "opening") await settle();
  }
}

try {
  await page.goto(`${base}/book/`);
  await page.locator("#upcoming-lessons-heading").waitFor();
  // The account panel opens with the account the page has just loaded.
  await page.locator("#account-menu-button").waitFor({ state: "attached" });
  await page.waitForLoadState("networkidle");
  assert.equal(accountLoads, 1, "Arriving signed in should load the account once");
  const layouts = [];
  for (const width of [1920, 1440, 1280, 1101, 1100, 900, 821, 820, 390, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1100 });
    await settle();
    const layout = await page.evaluate(() => {
      const bounds = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        width: innerWidth, pageWidth: document.documentElement.scrollWidth,
        account: bounds(".unified-account-controls"),
        calendar: bounds("#lesson-calendar .calendar-panel"),
        book: bounds(".lesson-overview__book"),
        introLabels: [...document.querySelectorAll(".booking-intro__points li")]
          .filter(item => item.getClientRects().length)
          .map(item => {
            const label = item.lastElementChild;
            const range = document.createRange();
            range.selectNodeContents(label);
            return { text: label.textContent, box: label.getBoundingClientRect().toJSON(), ink: range.getBoundingClientRect().toJSON() };
          })
      };
    });
    assert.ok(layout.pageWidth <= width + 1, `Page overflow at ${width}`);
    for (const label of layout.introLabels) {
      assert.ok(label.ink.left >= label.box.left - 1 && label.ink.right <= label.box.right + 1,
        `Booking label overflows its column at ${width}: ${label.text}`);
    }
    // One calendar holds the lessons: it shares the account bar's edges at
    // every width, with booking at its own top right.
    aligned(layout.account.left, layout.calendar.left, "Account and calendar left edges");
    aligned(layout.account.right, layout.calendar.right, "Account and visible calendar right edges");
    assert.ok(layout.calendar.top > layout.account.bottom, "The calendar follows the account bar");
    assert.ok(layout.book.top < layout.calendar.top + 120 && layout.book.right <= layout.calendar.right + 1,
      `Book a lesson sits at the calendar's top right at ${width}`);
    layouts.push(layout);
    if ([1920, 390].includes(width)) await page.screenshot({ path: `${out}/upcoming-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1920, height: 1100 });
  await accountAction("Past lessons");
  await accountAction("Past lessons");
  await page.locator("#account-past-lessons").waitFor();
  assert.equal(await page.locator("#lesson-calendar").count(), 0, "History must not retain the future calendar");
  const history = await page.locator("#account-past-lessons").boundingBox();
  const bar = await page.locator(".unified-account-controls").boundingBox();
  aligned(history.width, bar.width, "History uses the account width");
  await settle();
  await page.screenshot({ path: `${out}/history-desktop.png`, fullPage: true });
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1100 });
    assert.deepEqual(await page.locator("#account-past-lessons .history-lesson-card__reference").allTextContents(), expectedHistory,
      "History uses the latest completion or cancellation, not future cancelled lesson dates");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 1920, height: 1100 });
  await accountAction("Edit details");
  await page.getByLabel("Your name", { exact: true }).waitFor();
  assert.equal(await page.locator("#lesson-calendar, #account-past-lessons").count(), 0);
  await settle();
  await page.screenshot({ path: `${out}/profile-desktop.png`, fullPage: true });
  await accountAction("Done editing");
  await accountAction("View lessons");
  await accountAction("View lessons");
  await page.locator("#upcoming-lessons-heading").waitFor();
  await page.locator(".lesson-overview__book").click();
  await page.locator("#lesson-calendar .booking-bar").waitFor();
  await page.getByRole("button", { name: "Your lessons", exact: true }).click();
  await page.locator("#upcoming-lessons-heading").waitFor();
  assert.equal(await page.locator(".booking-bar").count(), 0);

  // A signed-in student is never offered the trial, even with nothing booked
  // yet: first-time booking links open on a single lesson instead.
  bookings = bookings.map(booking => ({ ...booking, status: "cancelled" }));
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: "Book a lesson", exact: true }).click();
  await page.getByRole("radio", { name: "Single", exact: true }).waitFor({ state: "attached" });
  assert.equal(await page.getByRole("radio", { name: "Trial", exact: true }).count(), 0, "A signed-in student is not offered the trial");
  assert.equal(await page.locator("#upcoming-lessons-heading").count(), 0);
  await page.goto(`${base}/approach/`);
  await page.getByRole("link", { name: "Book a trial lesson", exact: true }).click();
  await page.getByRole("radio", { name: "Online", exact: true }).waitFor();
  assert.ok(page.url().includes("lesson=trial"));
  assert.equal(await page.getByRole("radio", { name: "Single", exact: true }).isChecked(), true, "A trial link opens on a single lesson when signed in");
  assert.equal(await page.getByRole("radio", { name: "Trial", exact: true }).count(), 0);

  bookings = [{ ...bookings[0], status: "confirmed", isPast: false, startAt: "2026-09-14T16:00:00Z", endAt: "2026-09-14T17:00:00Z" }];
  await page.goto(`${base}/book/?lesson=trial`);
  await page.getByRole("radio", { name: "Single", exact: true }).waitFor({ state: "attached" });
  await page.getByRole("radio", { name: "Trial", exact: true }).waitFor({ state: "detached" });
  assert.equal(await page.getByRole("radio", { name: "Single", exact: true }).isChecked(), true, "Returning students get eligible ordinary choices");

  bookings = Array.from({ length: 8 }, (_, index) => ({
    ...bookings[0], reference: `UPCOMING-${index}`, manageToken: `upcoming-preview-${index}`,
    startAt: new Date(Date.UTC(2026, 8, 7 + index, 16)).toISOString(),
    endAt: new Date(Date.UTC(2026, 8, 7 + index, 17)).toISOString()
  }));
  await page.goto(`${base}/book/`);
  await page.locator("#upcoming-lessons-heading").waitFor();
  await settle();
  // Every booked day is marked on the calendar and the nearest one leads.
  assert.equal(await page.locator("#lesson-calendar .calendar-week button.has-booking").count(), 8);
  assert.match(await page.locator(".lesson-overview__next").innerText(), /Monday, 7 September 2026/);
  await page.screenshot({ path: `${out}/upcoming-long-desktop.png`, fullPage: true });

  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/`);
    await openMenuWithStationaryHeader(`${width}px header`);
    await page.keyboard.press("Escape");
    await settle();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/faq/`);
  await page.locator(".site-footer__menu").scrollIntoViewIfNeeded();
  await settle();
  const before = await page.evaluate(() => scrollY);
  await page.locator(".site-footer__menu").click();
  const menu = page.getByRole("dialog", { name: "Site navigation" });
  await menu.waitFor();
  await menu.getByRole("img", { name: "Português com a Inês", exact: true }).waitFor();
  await settle();
  aligned(before, await page.evaluate(() => scrollY), "Footer menu preserves page position");
  // Four destinations, each with its note, then the two common actions.
  assert.equal(await menu.locator(".nav-mobile__link").count(), 4);
  assert.deepEqual(
    (await menu.locator(".nav-mobile__cta a").allTextContents()).map((text) => text.trim()),
    ["Book a lesson", "Message on WhatsApp"]
  );
  // From Close back to the home link, then round to the last action and on.
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Português com a Inês, home");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Message on WhatsApp");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Português com a Inês, home");
  await page.screenshot({ path: `${out}/menu-mobile.png` });
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await settle();
  aligned(before, await page.evaluate(() => scrollY), "Closing menu preserves page position");
  assert.ok(await page.evaluate(() => document.activeElement.classList.contains("site-footer__menu")));
  assert.equal(await page.locator("main").getAttribute("inert"), null);
  const faqUrl = page.url();
  await page.locator(".site-footer__legal").getByRole("link", { name: "Terms & privacy", exact: true }).click();
  await page.locator("#terms-privacy[open]").waitFor();
  assert.equal(page.url(), faqUrl, "Footer terms open over the current page");
  await page.getByRole("button", { name: "Close terms & privacy", exact: true }).click();
  await page.getByRole("heading", { name: "Questions before booking?", exact: true }).waitFor();
  assert.equal(await page.locator("main").getAttribute("inert"), null);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const motion = await menu.evaluate(element => ({ transform: getComputedStyle(element).transform, duration: getComputedStyle(element).transitionDuration }));
  assert.equal(motion.transform, "none");
  assert.equal(motion.duration, "0s");
  await page.setViewportSize({ width: 1100, height: 900 });
  await menu.waitFor({ state: "hidden" });
  // CSS hides the menu before React's resize handler releases the scroll lock.
  await page.waitForFunction(() =>
    getComputedStyle(document.body).overflow !== "hidden" &&
    getComputedStyle(document.documentElement).overflow !== "hidden"
  );

  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto(`${base}/faq/?from=akibwa`);
  await openMenuWithStationaryHeader("Portfolio header");
  await page.screenshot({ path: `${out}/menu-with-portfolio-mobile.png` });
  await menu.getByRole("link", { name: "Booking", exact: true }).click();
  await page.locator("#booking-title").waitFor();
  const bookingUrl = page.url();
  await page.locator(".site-footer__legal").getByRole("link", { name: "Terms & privacy", exact: true }).click();
  await page.locator("#terms-privacy[open]").waitFor();
  assert.equal(await page.locator(".site-footer__legal a").count(), 1);
  assert.equal(await page.locator(".booking-information details").count(), 0);
  assert.equal(await page.getByRole("dialog", { name: "Terms & privacy", exact: true }).count(), 1);
  assert.equal(await page.locator(".policy-information h2").first().innerText(), "Booking");
  assert.equal(page.url(), bookingUrl);
  assert.equal(await page.locator('#terms-privacy a[href^="https://wa.me/"]').getAttribute("href"), "https://wa.me/351963161134");
  assert.ok(await page.locator("#terms-privacy .policy-information").isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole("button", { name: "Close terms & privacy", exact: true }).click();
  assert.equal(await page.locator("#terms-privacy").getAttribute("open"), null);
  await page.locator(".site-footer__legal").getByRole("link", { name: "Terms & privacy", exact: true }).click();
  await page.locator("#terms-privacy[open]").waitFor();

  // Old policy links open the same combined dialog inside booking.
  for (const [oldPath, section] of [["booking-terms/", "booking"], ["privacy/", "privacy"], ["terms/#privacy", "privacy"], ["terms/", "terms-privacy"], ["book/#booking", "booking"], ["book/#change-booking", "change-booking"]]) {
    await page.goto(`${base}/${oldPath}`);
    await page.waitForURL(`**/book/#${section}`);
    await page.locator("#terms-privacy[open]").waitFor();
  }

  const legacy = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await legacy.goto(`${base}/my-lessons/`);
  await legacy.getByRole("heading", { name: "Your account", exact: true }).waitFor();
  assert.ok(legacy.url().includes("/book/?view=lessons"));
  await legacy.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, layouts, screenshots: out }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ url: page.url(), headings: await page.locator("h1").allTextContents(), errors }));
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
