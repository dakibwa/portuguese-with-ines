import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const out = "tmp/qa/navigation";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1100 }, timezoneId: "Europe/Lisbon" });
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

// Settled means every finite animation has finished. The wordmark's hats tip
// for as long as a page is open, on the wall clock's beat, so an endless
// animation never counts.
async function settle() {
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity));
}

// The account's menu is open in a wide card's header; on a narrow one the
// student's name opens it.
async function accountAction(name) {
  const toggle = page.locator("#account-menu-button");
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
      // Where the menu folds, the name's button opens it; where it is open,
      // the places lead the header and the name lives in Your details.
      const named = [...document.querySelectorAll("#account-menu-button, .account-menu__places")].find(element => element.getClientRects().length);
      return {
        width: innerWidth, pageWidth: document.documentElement.scrollWidth,
        calendar: bounds("#lesson-calendar .calendar-panel"),
        heading: bounds("#upcoming-lessons-heading"),
        name: named.getBoundingClientRect().toJSON(),
        book: bounds(".lesson-overview__book")
      };
    });
    assert.ok(layout.pageWidth <= width + 1, `Page overflow at ${width}`);
    // One card holds the lessons and the account at every width, with booking
    // at its top right. Where the places are open they name the card, so its
    // heading is for screen readers and the name leads the header; elsewhere
    // the name's menu sits under the heading.
    if (layout.heading.width > 1) {
      aligned(layout.name.left, layout.heading.left, `The name's menu lines up under the heading at ${width}`);
      assert.ok(layout.name.top >= layout.heading.bottom - 1, `The name's menu sits under the heading at ${width}`);
    }
    assert.ok(layout.name.top >= layout.calendar.top && layout.name.left >= layout.calendar.left && layout.name.right <= layout.calendar.right,
      `The name is inside the calendar card at ${width}`);
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
  // Past lessons takes the lessons card's place, at its width.
  const history = await page.locator("#account-past-lessons").boundingBox();
  aligned(history.width, layouts[0].calendar.width, "History uses the lessons card's width");
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
  await page.getByRole("button", { name: "Change name", exact: true }).waitFor();
  assert.equal(await page.locator("#lesson-calendar, #account-past-lessons").count(), 0);
  await settle();
  await page.screenshot({ path: `${out}/profile-desktop.png`, fullPage: true });
  await accountAction("Done editing");
  await accountAction("Your lessons");
  await accountAction("Your lessons");
  await page.locator("#upcoming-lessons-heading").waitFor();
  await page.locator(".lesson-overview__book").click();
  await page.locator("#lesson-calendar .booking-bar").waitFor();
  await page.getByRole("button", { name: /^Your lessons/ }).first().click();
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
  // Before the page's script is ready the link simply follows #terms-privacy,
  // and the dialog opens from that address as the page finishes loading. These
  // checks are of the dialog opening over the page, so they wait for it, as
  // qa-flow's do: a slow CI browser reached the link first.
  await page.locator('#terms-privacy[data-ready="true"]').waitFor({ state: "attached" });
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
  await page.locator('#terms-privacy[data-ready="true"]').waitFor({ state: "attached" });
  await page.locator(".site-footer__legal").getByRole("link", { name: "Terms & privacy", exact: true }).click();
  await page.locator("#terms-privacy[open]").waitFor();
  assert.equal(await page.locator(".site-footer__legal a").count(), 1);
  assert.equal(await page.locator(".booking-information details").count(), 0);
  assert.equal(await page.getByRole("dialog", { name: "Terms & privacy", exact: true }).count(), 1);
  // The section headings are lilac eyebrows, capitalised by CSS; read the words.
  assert.equal(await page.locator(".policy-information h2").first().textContent(), "Booking");
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

  // Where a pointer can hover, the next lesson is read off the calendar: its
  // day is filled in and hovering a lesson shows its details, so there is no
  // row above the calendar to say it. The clock line names one clock at a
  // time, the next lesson's, and Porto's while a lesson there is hovered. A
  // narrow card keeps the row.
  const abroad = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Los_Angeles" });
  await abroad.addInitScript(() => localStorage.setItem("ines-student-session", "navigation-abroad"));
  const abroadLesson = (reference, location, startAt) => ({
    reference, status: "confirmed", location, notes: "", startAt, endAt: new Date(Date.parse(startAt) + 3_600_000).toISOString(),
    lessonType, isPast: false, sameDayFeeApplies: false, seriesId: null, manageToken: reference.toLowerCase()
  });
  const abroadLessons = [abroadLesson("ABROAD-ONLINE", "online", "2026-09-09T16:00:00Z"), abroadLesson("ABROAD-PORTO", "porto", "2026-09-16T09:00:00Z")];
  await abroad.route("**/me", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ student: { ...student, timezone: "America/Los_Angeles" }, bookings: abroadLessons, series: [], sameDayFeeCents: 500 })
  }));
  await abroad.route("**/me/recurring-rates", route => route.fulfill({ contentType: "application/json", body: '{"rates":{}}' }));
  const abroadPage = await abroad.newPage();
  abroadPage.on("pageerror", error => errors.push(error.message));
  await abroadPage.clock.setFixedTime(new Date("2026-09-05T12:00:00Z"));
  await abroadPage.goto(`${base}/book/`);
  await abroadPage.locator("#upcoming-lessons-heading").waitFor({ state: "attached" });
  const clockLine = abroadPage.locator("#lesson-calendar .calendar-zone");
  await clockLine.waitFor();
  const shownClock = () => clockLine.evaluate(line =>
    [...line.querySelectorAll("strong > span")].find(name => getComputedStyle(name).opacity === "1")?.textContent ?? "");
  const day = key => abroadPage.locator(`#lesson-calendar button[data-date-key="${key}"]`);
  assert.equal(await abroadPage.locator(".lesson-overview__next").isVisible(), false, "A pointer reads the next lesson off the calendar");
  assert.match(await day("2026-09-09").getAttribute("class"), /\bis-next\b/);
  assert.equal(await day("2026-09-09").evaluate(button => getComputedStyle(button).backgroundColor), "rgb(180, 58, 38)");
  assert.equal(await shownClock(), "Los Angeles time");
  // Each day says when and where without a hover: the time it runs from and
  // until, after a globe for online or a little person for in Porto.
  const spelledOut = key => day(key).evaluate(button => ({
    when: button.querySelector(".calendar-booking-times__when")?.textContent?.trim(),
    place: [...(button.querySelector(".calendar-booking-times__place")?.classList ?? [])].find(name => /^lucide-(globe|user-round)$/.test(name))
  }));
  assert.deepEqual(await spelledOut("2026-09-09"), { when: "09:00–10:00", place: "lucide-globe" });
  assert.deepEqual(await spelledOut("2026-09-16"), { when: "10:00–11:00", place: "lucide-user-round" });
  await day("2026-09-09").hover();
  const onlineTip = abroadPage.locator("#lesson-tip-2026-09-09");
  await onlineTip.waitFor({ state: "visible" });
  assert.match((await onlineTip.textContent()).replace(/\s+/g, " "), /^Next lesson ?Wednesday,? 9 September 2026, 09:00 Los Angeles time ?60 mins · Online$/);
  await day("2026-09-16").hover();
  const portoTip = abroadPage.locator("#lesson-tip-2026-09-16");
  await portoTip.waitFor({ state: "visible" });
  assert.match((await portoTip.textContent()).replace(/\s+/g, " "), /^Wednesday,? 16 September 2026, 10:00 Porto time ?60 mins · In Porto$/);
  await abroadPage.waitForFunction(() => getComputedStyle(document.querySelector(".calendar-zone__porto")).opacity === "1");
  assert.equal(await shownClock(), "Porto time");
  await abroadPage.screenshot({ path: `${out}/lesson-hover-porto-desktop.png` });
  await abroadPage.mouse.move(1, 1);
  await abroadPage.waitForFunction(() => getComputedStyle(document.querySelector(".calendar-zone__own")).opacity === "1");
  assert.equal(await shownClock(), "Los Angeles time");
  await abroadPage.setViewportSize({ width: 390, height: 844 });
  await abroadPage.locator(".lesson-overview__next").waitFor({ state: "visible" });
  await abroad.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, layouts, screenshots: out }, null, 2));
} catch (error) {
  // What the page was doing, read without waiting on a frame: a page that has
  // stopped drawing still answers script.
  const state = await Promise.race([
    page.evaluate(() => ({
      readyState: document.readyState,
      termsReady: document.querySelector("#terms-privacy")?.getAttribute("data-ready") ?? null,
      turning: (() => { try { return document.documentElement.matches(":active-view-transition"); } catch { return null; } })()
    })),
    new Promise(resolve => setTimeout(() => resolve("no answer in 5s"), 5000))
  ]).catch(reason => String(reason));
  console.error(JSON.stringify({ url: page.url(), headings: await page.locator("h1").allTextContents(), errors, state }));
  // The failure itself first: a screenshot that times out must not hide it.
  console.error(error);
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true, timeout: 10000 }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
