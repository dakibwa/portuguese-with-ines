import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "tmp/qa");
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const routes = [
  { id: "home", path: "/", heading: "Portuguese Lessons" },
  { id: "approach", path: "/approach", heading: "No class." },
  { id: "lessons", path: "/lessons", heading: "Lessons, and" },
  { id: "faq", path: "/faq", heading: "Questions" },
  { id: "booking", path: "/book", heading: "Your Lessons" }
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const logs = [];
const results = [];

function colourChannels(value) {
  const colour = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(colour)) {
    return [1, 3, 5].map((index) => Number.parseInt(colour.slice(index, index + 2), 16));
  }

  const channels = colour.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Could not read colour: ${value}`);
  return channels;
}

function relativeLuminance(value) {
  const [red, green, blue] = colourChannels(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

page.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});

// Booking decisions use one lightweight local transition in every browser.
// Exercise it before the route matrix so the bundle is tested from a clean
// browser cache rather than behind ten screenshot navigations.
const localMotionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
const localMotionStart = new Date(Date.now() + 3 * 86_400_000);
localMotionStart.setUTCHours(10, 0, 0, 0);
const localMotionDate = localMotionStart.toISOString().slice(0, 10);
await localMotionPage.route("**/availability?*", (route) =>
  route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      slotsByDate: {
        [localMotionDate]: [
          { startAt: localMotionStart.toISOString(), endAt: new Date(localMotionStart.getTime() + 60 * 60_000).toISOString() }
        ]
      },
      timeZone: "Europe/Lisbon",
      minimumNoticeHours: 24,
      horizonDays: 84
    })
  })
);
await localMotionPage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
// A visitor lands ready to book: the lesson is already chosen in the bar above
// the calendar, and every choice changes in place.
const localMotionSingle = localMotionPage.getByRole("radio", { name: "Single", exact: true });
try {
  await localMotionSingle.waitFor({ state: "visible", timeout: 10_000 });
} catch (error) {
  throw new Error(`The booking bar did not open: ${await localMotionPage.locator("body").innerText()}`, { cause: error });
}
if (!(await localMotionPage.getByRole("radio", { name: "Trial", exact: true }).isChecked())) {
  throw new Error("A first booking should start from the trial lesson.");
}
await localMotionPage.evaluate(() => {
  document.documentElement.dataset.qaFallbackTransitionSeen = "false";
  const observer = new MutationObserver(() => {
    if (!document.documentElement.classList.contains("booking-transitioning")) return;
    requestAnimationFrame(() => {
      const weeks = document.querySelector(".calendar-weeks");
      const style = weeks ? getComputedStyle(weeks) : null;
      document.documentElement.dataset.qaFallbackTransitionSeen = "true";
      document.documentElement.dataset.qaFallbackAnimationName = style?.animationName ?? "";
      document.documentElement.dataset.qaFallbackAnimationDuration = style?.animationDuration ?? "";
      observer.disconnect();
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});
await localMotionSingle.check();
await localMotionPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).waitFor({ state: "attached" });
await localMotionPage.waitForFunction(() => document.documentElement.dataset.qaFallbackTransitionSeen === "true", null, { timeout: 2_000 })
  .catch(() => {});
const localBookingMotion = await localMotionPage.evaluate(() => ({
  animationDuration: document.documentElement.dataset.qaFallbackAnimationDuration,
  animationName: document.documentElement.dataset.qaFallbackAnimationName,
  seen: document.documentElement.dataset.qaFallbackTransitionSeen === "true"
}));
if (
  !localBookingMotion.seen ||
  !localBookingMotion.animationName?.includes("booking-flow-in") ||
  localBookingMotion.animationDuration === "0s"
) {
  throw new Error("Booking decisions should receive the lightweight local surface transition.");
}
await localMotionPage.locator(`#lesson-calendar [data-date-key="${localMotionDate}"]`).click();
await localMotionPage.locator("#lesson-calendar .slot-grid button").first().click();
await localMotionPage.locator(".booking-selection-stack").waitFor({ state: "visible" });

for (const viewport of [
  { id: "mobile", width: 390, height: 844 },
  { id: "desktop", width: 1280, height: 900 }
]) {
  await localMotionPage.setViewportSize({ width: viewport.width, height: viewport.height });
  const summaryStyles = await localMotionPage.evaluate(() => {
    const elements = [
      ...document.querySelectorAll(".booking-choice-summary__copy strong, .booking-choice-summary__change")
    ];
    return {
      background: getComputedStyle(document.documentElement).getPropertyValue("--lavender").trim(),
      entries: elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          colour: style.color,
          fontSize: Number.parseFloat(style.fontSize),
          label: element.textContent?.trim() ?? "",
          overflow: element.scrollWidth > element.clientWidth + 1
        };
      })
    };
  });

  if (!summaryStyles.entries.length) throw new Error("The confirmation should show the chosen lesson with its change action.");
  for (const entry of summaryStyles.entries) {
    const ratio = contrastRatio(entry.colour, summaryStyles.background);
    if (entry.fontSize < 14 || ratio < 4.5 || entry.overflow) {
      throw new Error(
        `Booking summary text should remain at least 14px and 4.5:1 without clipping at ${viewport.id}: ` +
          JSON.stringify({ ...entry, contrast: ratio })
      );
    }
  }
}
await localMotionPage.close();

// Calendar dates are Porto wall-clock keys. Formatting their month captions in
// a behind-UTC browser must not move midnight UTC back into the previous month.
const calendarZoneContext = await browser.newContext({
  timezoneId: "America/Los_Angeles",
  viewport: { width: 390, height: 844 }
});
const calendarZonePage = await calendarZoneContext.newPage();
await calendarZonePage.clock.setFixedTime(new Date("2026-09-02T12:00:00Z"));
await calendarZonePage.route("**/lesson-types", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      lessonTypes: [
        {
          id: "single-60",
          slug: "single-lesson",
          name: "Single lesson",
          description: "One hour of Portuguese practice.",
          duration_minutes: 60,
          price_cents: 2500
        }
      ],
      paymentMode: "off",
      postpay: false,
      paymentReady: true
    })
  });
});
await calendarZonePage.route("**/availability?*", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      slotsByDate: {
        "2026-09-03": [
          { startAt: "2026-09-03T16:00:00.000Z", endAt: "2026-09-03T17:00:00.000Z" }
        ]
      },
      timeZone: "Europe/Lisbon",
      minimumNoticeHours: 24,
      horizonDays: 84,
      lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
    })
  });
});
await calendarZonePage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
try {
  await calendarZonePage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).waitFor({ state: "attached", timeout: 10_000 });
} catch (error) {
  throw new Error(`The calendar fixture did not open: ${await calendarZonePage.locator("body").innerText()}`, { cause: error });
}
await calendarZonePage.locator("#booking-calendar-weeks").waitFor({ state: "visible", timeout: 10_000 });

// The calendar shows four weeks at a time; the end of September and October
// are on the next page.
const readCalendarLabels = (keys) => calendarZonePage.evaluate((dateKeys) => ({
  headings: [...document.querySelectorAll(".calendar-month")].map((element) => element.textContent?.trim()),
  spillovers: Object.fromEntries(
    dateKeys.map((key) => {
      const cell = document.querySelector(`[data-date-key="${key}"]`);
      return [
        key,
        { ariaLabel: cell?.getAttribute("aria-label"), month: cell?.querySelector("em")?.textContent?.trim().toUpperCase() }
      ];
    })
  )
}), keys);
const firstPageLabels = await readCalendarLabels(["2026-08-31"]);
await calendarZonePage.getByRole("button", { name: "Later weeks", exact: true }).click();
await calendarZonePage.locator('[data-date-key="2026-09-28"]').waitFor();
const nextPageLabels = await readCalendarLabels(["2026-09-28", "2026-09-29", "2026-09-30"]);
const calendarDateLabels = { firstPageLabels, nextPageLabels };

if (
  firstPageLabels.spillovers["2026-08-31"].month !== "AUG" ||
  firstPageLabels.spillovers["2026-08-31"].ariaLabel !== "Monday, 31 August 2026, unavailable" ||
  ["2026-09-28", "2026-09-29", "2026-09-30"].some(
    (key) => nextPageLabels.spillovers[key].month !== "SEPT"
  ) ||
  !nextPageLabels.headings.includes("October")
) {
  throw new Error(`Calendar month labels moved in America/Los_Angeles: ${JSON.stringify(calendarDateLabels)}.`);
}
await calendarZonePage.getByRole("button", { name: "Earlier weeks", exact: true }).click();
await calendarZonePage.locator('[data-date-key="2026-09-03"]').waitFor();

await calendarZonePage.locator('[data-date-key="2026-09-03"]').click();
await waitForOrientation(calendarZonePage);
const calendarDualTime = (await calendarZonePage.locator(".slot-grid button").first().innerText())
  .replace(/\s+/g, " ")
  .trim();
if (calendarDualTime !== "17:00 09:00 your time") {
  throw new Error(`Calendar dual time changed in America/Los_Angeles: ${calendarDualTime}.`);
}
await calendarZonePage.close();
await calendarZoneContext.close();

for (const route of routes) {
  for (const viewport of [
    { id: "desktop", width: 1440, height: 1000 },
    { id: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").waitFor({ timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const heading = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ").trim();
    assertIncludes(heading, route.heading, `${route.id} heading`);

    const headingCount = await page.locator("h1").count();
    if (headingCount !== 1) {
      throw new Error(`${route.id} should have exactly one h1; found ${headingCount}.`);
    }

    // The closed, inert mobile dialog has its own wordmark for when it opens.
    const wordmarkCount = await page.locator(".brand-wordmark:visible").count();
    if (wordmarkCount !== 2) {
      throw new Error(`${route.id} should use one header wordmark and one footer sign-off; found ${wordmarkCount}.`);
    }

    if ((await page.locator(".site-footer .brand-wordmark").count()) !== 1) {
      throw new Error(`${route.id} should retain the cream-on-blue footer wordmark once.`);
    }

    if (route.id === "booking") {
      const contactHref = await page.locator('#terms-privacy a[href^="https://wa.me/"]').getAttribute("href");
      if (contactHref !== "https://wa.me/351963161134") {
        throw new Error(`Booking privacy contact regressed: ${contactHref}.`);
      }
    }

    if (route.id === "home" || route.id === "booking") {
      await checkTermsDialog(page, page.locator(".site-footer__legal a"));
    }

    if (viewport.id === "desktop") {
      // A snug sign-off: the destinations and Terms & privacy share one row on
      // the right, level with the wordmark, rather than stacking beneath it.
      const footerNavigation = await page.evaluate(() => {
        const footer = document.querySelector(".site-footer")?.getBoundingClientRect();
        const navigation = document.querySelector(".site-footer__nav")?.getBoundingClientRect();
        const legal = document.querySelector(".site-footer__legal")?.getBoundingClientRect();
        return {
          footerRight: footer?.right ?? 0,
          footerHeight: footer?.height ?? 0,
          navigationCentre: navigation ? navigation.top + navigation.height / 2 : 0,
          legalCentre: legal ? legal.top + legal.height / 2 : 0,
          legalLeft: legal?.left ?? 0,
          navigationRight: navigation?.right ?? 0,
          legalRight: legal?.right ?? 0
        };
      });
      if (
        footerNavigation.footerRight - footerNavigation.legalRight > 80 ||
        Math.abs(footerNavigation.navigationCentre - footerNavigation.legalCentre) > 2 ||
        footerNavigation.legalLeft < footerNavigation.navigationRight ||
        footerNavigation.footerHeight > 120
      ) {
        throw new Error(`The desktop footer should keep its links and Terms & privacy on one snug row on the right: ${JSON.stringify(footerNavigation)}.`);
      }
    }

    if (route.id === "home") {
      const homeBookingActions = await page.locator("main").getByRole("link", { name: "Book a lesson", exact: true }).count();
      if (homeBookingActions !== 1) {
        throw new Error(`Home should present one booking action; found ${homeBookingActions}.`);
      }
      if ((await page.locator(".home-hero__links a").count()) !== 2 || (await page.locator(".home-closing").count())) {
        throw new Error("Home should keep its two supporting routes inside the introduction with no closing strip.");
      }
    }

    if (route.id === "booking" && viewport.id === "desktop") {
      const bannerArtwork = await page.evaluate(() => {
        const intro = document.querySelector(".booking-intro")?.getBoundingClientRect();
        const corner = document.querySelector(".booking-intro__time-window")?.getBoundingClientRect();
        const marks = [...document.querySelectorAll(".booking-intro__points .asset-mark")].map((mark) =>
          mark.getBoundingClientRect()
        );
        return {
          intro: intro ? { top: intro.top, right: intro.right } : null,
          corner: corner ? { top: corner.top, right: corner.right, width: corner.width } : null,
          markWidths: marks.map((mark) => mark.width)
        };
      });
      if (
        !bannerArtwork.intro ||
        !bannerArtwork.corner ||
        bannerArtwork.corner.width < 220 ||
        bannerArtwork.corner.top >= bannerArtwork.intro.top ||
        bannerArtwork.corner.right <= bannerArtwork.intro.right ||
        bannerArtwork.markWidths.length !== 3 ||
        bannerArtwork.markWidths.some((width) => width < 46)
      ) {
        throw new Error(`The booking banner should use larger reassurance marks and a cropped top-right splat: ${JSON.stringify(bannerArtwork)}.`);
      }
    }

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      throw new Error(
        `${route.id} ${viewport.id} has horizontal overflow: ${overflow.scrollWidth}px > ${overflow.clientWidth}px.`
      );
    }

    await page.screenshot({
      path: path.join(outDir, `${route.id}-${viewport.id}.png`),
      fullPage: true
    });

    results.push({
      route: route.id,
      viewport: viewport.id,
      heading,
      overflow
    });
  }
}

// Booking is the one destination whether the visitor is signed in or not. The
// account itself belongs inside that workspace, not as a second navigation
// destination that changes label after hydration.
const signedInBrowser = await chromium.launch({ headless: true });
const signedInPage = await signedInBrowser.newPage({ viewport: { width: 1440, height: 1000 } });
signedInPage.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
signedInPage.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});
await signedInPage.addInitScript(() => {
  window.localStorage.setItem("ines-student-session", "qa-session");
});
await signedInPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
const signedInBookingLinks = signedInPage.getByRole("link", { name: "Booking", exact: true });
await signedInBookingLinks.first().waitFor({ timeout: 10_000 });
if ((await signedInBookingLinks.count()) !== 2) {
  throw new Error("Signed-in header and footer navigation should both keep the single Booking destination.");
}
if (await signedInPage.getByRole("link", { name: "My lessons", exact: true }).count()) {
  throw new Error("My lessons should not appear as a second navigation destination.");
}
await signedInPage.close();
await signedInBrowser.close();

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
const expectedApproachUrl = new URL(`${base}/approach/`).href;

// On a phone every link is behind the toggle — the header's are, and the
// footer no longer repeats them. Opening the menu is now part of the journey
// rather than a detail of it.
await page.locator(".nav-toggle").click();
await page.waitForTimeout(400);
await page.locator("#site-nav-mobile a", { hasText: "Approach" }).first().click();
await page.waitForURL(expectedApproachUrl, { timeout: 10_000 });
const mobileNavigation = await page.evaluate(() => ({
  overlayCount: document.querySelectorAll(".route-transition-wash").length,
  animationDuration: getComputedStyle(document.querySelector(".route-fade")).animationDuration,
  animationName: getComputedStyle(document.querySelector(".route-fade")).animationName,
  transform: getComputedStyle(document.querySelector(".route-fade")).transform,
  url: window.location.href
}));

if (mobileNavigation.url !== expectedApproachUrl) {
  throw new Error(
    `Mobile route navigation changed destination: expected ${expectedApproachUrl}, received ${mobileNavigation.url}.`
  );
}

if (mobileNavigation.overlayCount !== 0 || mobileNavigation.transform !== "none") {
  throw new Error("Mobile route navigation should use opacity only, with no overlay or transform.");
}

if (
  !mobileNavigation.animationName.includes("route-fade-in") ||
  mobileNavigation.animationDuration === "0s"
) {
  throw new Error("Mobile route navigation should dissolve the destination without delaying the click.");
}

const reducedMotionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await reducedMotionPage.emulateMedia({ reducedMotion: "reduce" });
await reducedMotionPage.goto(`${base}/faq/`, { waitUntil: "domcontentloaded" });
await reducedMotionPage.locator("h1").waitFor({ timeout: 10_000 });
const reducedRouteMotion = await reducedMotionPage.evaluate(() => {
  const style = getComputedStyle(document.querySelector(".route-fade"));
  return { animationDuration: style.animationDuration, animationName: style.animationName };
});
if (reducedRouteMotion.animationName !== "none" && reducedRouteMotion.animationDuration !== "0s") {
  throw new Error("Reduced-motion users should not receive a route transition.");
}
await reducedMotionPage.close();

await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${base}/faq`, { waitUntil: "domcontentloaded" });
const firstFaq = page.locator(".faq-row").first();
if (!(await firstFaq.evaluate((element) => element.hasAttribute("open")))) {
  throw new Error("The first booking question should be open by default.");
}
await firstFaq.locator("summary").click();
if (await firstFaq.evaluate((element) => element.hasAttribute("open"))) {
  throw new Error("The FAQ disclosure did not close.");
}
// The index shows one section at a time, in place, without scrolling the page.
if ((await page.locator(".faq-group:not([hidden])").count()) !== 1) {
  throw new Error("The FAQ should show one section at a time.");
}
// Before hydration the index is plain anchors; switching in place needs the page ready.
await page.locator('.faq-index[data-ready="true"]').waitFor();
const faqScrollBefore = await page.evaluate(() => window.scrollY);
// Dispatched directly: Playwright's own scroll-into-view before a click is not
// the page moving, and on a slower runner it scrolled this link to centre.
await page.locator(".faq-index").getByRole("link", { name: /Payment/ }).dispatchEvent("click");
await page.locator("#faq-payment:not([hidden])").waitFor();
const faqAfterSwitch = await page.evaluate(() => ({
  scrollY: window.scrollY,
  viewport: [window.innerWidth, window.innerHeight],
  headingTop: Math.round(document.getElementById("faq-payment-title")?.getBoundingClientRect().top ?? -1),
  indexBottom: Math.round(document.querySelector(".faq-index")?.getBoundingClientRect().bottom ?? -1),
  hash: window.location.hash,
  visible: [...document.querySelectorAll(".faq-group:not([hidden])")].map((group) => group.id),
  current: document.querySelector(".faq-index a[aria-current='true']")?.getAttribute("href")
}));
if (
  // No jump to the section; a couple of pixels of settling is not a jump.
  Math.abs(faqAfterSwitch.scrollY - faqScrollBefore) > 8 ||
  faqAfterSwitch.hash !== "#faq-payment" ||
  JSON.stringify(faqAfterSwitch.visible) !== JSON.stringify(["faq-payment"]) ||
  faqAfterSwitch.current !== "#faq-payment"
) {
  throw new Error(`Choosing a FAQ section should replace the one shown, in place: ${JSON.stringify({ faqScrollBefore, ...faqAfterSwitch })}.`);
}
await page.goto(`${base}/faq/#faq-rescheduling`, { waitUntil: "domcontentloaded" });
await page.locator("#faq-rescheduling:not([hidden])").waitFor({ timeout: 10_000 });
if ((await page.locator(".faq-group:not([hidden])").count()) !== 1) {
  throw new Error("A link to a FAQ section should open that section alone.");
}

await page.goto(`${base}/book`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".booking-provider", { timeout: 10_000 });
const bookingCalendar = (await page.locator(".booking-steps").count()) > 0;
const bookingPlaceholder = (await page.locator(".booking-placeholder").count()) > 0;

// The booking UI is served by this site against the ines-booking Worker. With
// no API configured the page must degrade to the placeholder rather than to a
// broken calendar, so both outcomes are legitimate — but nothing else is.
if (!bookingCalendar && !bookingPlaceholder) {
  throw new Error("The booking page rendered neither the calendar nor the setup placeholder.");
}

if (bookingCalendar) {
  // Anyone signed out lands ready to book: the lesson choices sit above the
  // calendar, already filled in, with no fork or setup screen first.
  try {
    await page.locator("#lesson-calendar .booking-bar").waitFor({ timeout: 10_000 });
  } catch {
    const alert = await page.locator(".booking-alert").innerText().catch(() => "");
    throw new Error(
      `The booking flow rendered no lesson choices. This is usually the booking API refusing the origin ${base} ` +
        `via CORS, or being unreachable.${alert ? ` The page said: ${alert.replace(/\s+/g, " ").trim()}` : ""}`
    );
  }

  const bookingText = (await page.locator(".booking-composition").innerText()).toLowerCase();
  assertIncludes(bookingText, "book a lesson", "booking bar heading");
  assertIncludes(bookingText, "trial", "trial lesson choice");
  assertIncludes(bookingText, "single", "one-off booking choice");
  assertIncludes(bookingText, "weekly", "weekly booking choice");
  assertIncludes(bookingText, "already booked?", "sign-in route for booked students");
  assertIncludes(bookingText, "porto time", "booking timezone note");
  if (bookingText.includes("booked lessons and free times share the same calendar")) {
    throw new Error("The unified calendar still repeats its own purpose above the booking controls.");
  }
  if ((await page.locator(".unified-booking__head .booking-step-heading").count()) !== 0) {
    throw new Error("The unified calendar still has a redundant visible heading.");
  }

  // The mobile menu replaces the inline nav below 820px; both must work.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const toggle = page.locator(".nav-toggle");
  if (!(await toggle.isVisible())) throw new Error("The mobile menu toggle is missing below 820px.");
  if (await page.locator(".site-nav").isVisible()) throw new Error("The inline nav is still shown below 820px.");
  await toggle.click();
  await page.waitForTimeout(400);
  if ((await toggle.getAttribute("aria-expanded")) !== "true") throw new Error("The mobile menu did not open.");
  const lockedOverflow = await page.evaluate(() => ({
    body: getComputedStyle(document.body).overflow,
    html: getComputedStyle(document.documentElement).overflow
  }));
  if (lockedOverflow.body !== "hidden" || lockedOverflow.html !== "hidden") {
    throw new Error(`The mobile menu should lock both scroll roots: ${JSON.stringify(lockedOverflow)}.`);
  }
  if ((await page.locator("#site-nav-mobile .nav-mobile__link").count()) !== 4) {
    throw new Error("The mobile menu should contain the four primary destinations once each.");
  }
  await page.getByRole("button", { name: "Close menu", exact: true }).click();
  await page.waitForTimeout(250);
  const restoredOverflow = await page.evaluate(() => ({
    body: getComputedStyle(document.body).overflow,
    html: getComputedStyle(document.documentElement).overflow
  }));
  if (restoredOverflow.body === "hidden" || restoredOverflow.html === "hidden") {
    throw new Error(`The mobile menu did not restore page scrolling: ${JSON.stringify(restoredOverflow)}.`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

// The signed-in account controls live directly on the booking page rather than
// behind another disclosure. Mock only private account calls so this can cover
// the real UI without using a student's session or changing a real repeating series.
let repeatStopped = false;
const stopRepeatPayloads = [];
let qaManagedStart;
let qaManagedLessonType = { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
let qaManagedLocation = "online";
const qaReschedulePayloads = [];
const accountRequestMethods = [];
const formatQaTime = (value) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
}).format(value);
const qaStart = new Date(Date.now() + 7 * 86_400_000);
qaStart.setUTCHours(17, 0, 0, 0);
qaManagedStart = qaStart;
const qaEnd = new Date(qaStart.getTime() + 60 * 60_000);
const qaSecondStart = new Date(qaStart.getTime() + 2 * 60 * 60_000);
const qaSecondEnd = new Date(qaSecondStart.getTime() + 60 * 60_000);
const qaFreeStart = new Date(qaStart.getTime() + 24 * 60 * 60_000);
const qaFreeDate = qaFreeStart.toISOString().slice(0, 10);
const qaFreeSlots = Array.from({ length: 5 }, (_, index) => {
  const start = new Date(qaFreeStart.getTime() + index * 30 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
});
const qaPastStart = new Date(Date.now() - 7 * 24 * 60 * 60_000);
qaPastStart.setUTCHours(15, 0, 0, 0);
const qaPastEnd = new Date(qaPastStart.getTime() + 60 * 60_000);
const qaLaterStart = new Date(Date.now() + 84 * 24 * 60 * 60_000);
qaLaterStart.setUTCHours(17, 0, 0, 0);
const qaLaterEnd = new Date(qaLaterStart.getTime() + 60 * 60_000);
const qaLaterDate = qaLaterStart.toISOString().slice(0, 10);
const qaLaterOneOffStart = new Date(qaLaterStart.getTime() + 2 * 24 * 60 * 60_000);
const qaLaterOneOffEnd = new Date(qaLaterOneOffStart.getTime() + 90 * 60_000);
const qaExtraSeriesBookings = Array.from({ length: 8 }, (_, index) => {
  const start = new Date(qaLaterStart.getTime() + (index + 1) * 7 * 24 * 60 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    reference: `INES-LATER-${index + 2}`,
    status: "confirmed",
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    location: "online",
    notes: "",
    lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
    isPast: false,
    sameDayFeeApplies: false,
    seriesId: "series-qa",
    manageToken: `manage-later-${index + 2}`
  };
});
let qaCreatedBookings = [];
let qaCreatedSeries = [];
let previewHasClash = false;
const accountBrowser = await chromium.launch({ headless: true });
const accountPage = await accountBrowser.newPage({ viewport: { width: 1440, height: 1000 } });
accountPage.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));
accountPage.on("console", (message) => {
  if (message.type() === "error") logs.push(`console:${message.text()}`);
});
await accountPage.addInitScript(() => {
  window.localStorage.setItem("ines-student-session", "qa-session");
});
let qaPostpay = false;
await accountPage.route("**/lesson-types", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      lessonTypes: [
        {
          id: "trial",
          slug: "trial-lesson",
          name: "Trial lesson",
          description: "A first lesson with Inês.",
          duration_minutes: 60,
          price_cents: 2000
        },
        {
          id: "single-60",
          slug: "single-lesson",
          name: "Single lesson",
          description: "One hour of Portuguese practice.",
          duration_minutes: 60,
          price_cents: 2500
        },
        {
          id: "longer-90",
          slug: "longer-lesson",
          name: "Longer lesson",
          description: "Ninety minutes when you want more time.",
          duration_minutes: 90,
          price_cents: 3500
        }
      ],
      paymentMode: qaPostpay ? "postpay" : "off",
      postpay: qaPostpay,
      paymentReady: true
    })
  });
});
await accountPage.route("**/availability?*", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      slotsByDate: {
        [qaFreeDate]: qaFreeSlots
      },
      timeZone: "Europe/Lisbon",
      minimumNoticeHours: 24,
      horizonDays: 84,
      lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
    })
  });
});
await accountPage.route("**/bookings/series/preview", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
    return;
  }
  const planned = Array.from({ length: 4 }, (_, index) =>
    new Date(qaFreeStart.getTime() + index * 7 * 24 * 60 * 60_000).toISOString()
  );
  const bookable = previewHasClash ? planned.slice(0, 3) : planned;
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      weeks: 4,
      openEnded: false,
      bookable,
      skipped: previewHasClash ? [planned[3]] : []
    })
  });
});
await accountPage.route("**/bookings", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
    return;
  }

  const payload = route.request().postDataJSON();
  const isRecurring = payload.repeat === 4;
  const starts = Array.from({ length: isRecurring ? 4 : 1 }, (_, index) =>
    new Date(qaFreeStart.getTime() + index * 7 * 24 * 60 * 60_000)
  );
  const seriesId = isRecurring ? "series-created-qa" : null;
  qaCreatedBookings = starts.map((start, index) => ({
    reference: isRecurring ? `INES-CREATED-R${index + 1}` : "INES-CREATED-ONE",
    status: "confirmed",
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
    location: payload.location,
    notes: "",
    lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
    isPast: false,
    sameDayFeeApplies: false,
    seriesId,
    manageToken: isRecurring ? `manage-created-r${index + 1}` : "manage-created-one"
  }));
  qaCreatedSeries = isRecurring
    ? [{ id: seriesId, weekday: starts[0].getUTCDay(), minuteOfDay: 1020, occurrences: 4, openEnded: false, upcoming: 4 }]
    : [];

  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        ...qaCreatedBookings[0],
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon"
      },
      manageUrl: `/book/?manage=${qaCreatedBookings[0].manageToken}`,
      manageToken: qaCreatedBookings[0].manageToken,
      ...(isRecurring
        ? {
            series: {
              id: seriesId,
              weeks: 4,
              openEnded: false,
              booked: starts.map((start) => start.toISOString()),
              skipped: []
            }
          }
        : {})
    })
  });
});
await accountPage.route("**/me/recurring-rates", (route) => route.fulfill({
  status: 200, contentType: "application/json", body: JSON.stringify({ rates: {} })
}));
await accountPage.route("**/me", async (route) => {
  accountRequestMethods.push(route.request().method());
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      }
    });
    return;
  }
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      student: {
        id: "student-qa",
        email: "student@example.com",
        name: "Ana Martins",
        phone: "",
        timezone: "Europe/Lisbon",
        role: "student"
      },
      bookings: [
        {
          reference: "INES-QA01",
          status: "confirmed",
          startAt: qaStart.toISOString(),
          endAt: qaEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: "series-qa",
          manageToken: "manage-qa"
        },
        {
          reference: "INES-QA02",
          status: "confirmed",
          startAt: qaSecondStart.toISOString(),
          endAt: qaSecondEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: null,
          manageToken: "manage-qa-2"
        },
        {
          reference: "INES-OLD1",
          status: "cancelled",
          startAt: qaPastStart.toISOString(),
          endAt: qaPastEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: true,
          sameDayFeeApplies: false,
          seriesId: null,
          manageToken: "manage-old"
        },
        {
          reference: "INES-LATER",
          status: "confirmed",
          startAt: qaLaterStart.toISOString(),
          endAt: qaLaterEnd.toISOString(),
          location: "online",
          notes: "",
          lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: "series-qa",
          manageToken: "manage-later"
        },
        {
          reference: "INES-LATER-ONE-OFF",
          status: "confirmed",
          startAt: qaLaterOneOffStart.toISOString(),
          endAt: qaLaterOneOffEnd.toISOString(),
          location: "porto",
          notes: "",
          lessonType: { id: "longer-90", name: "Longer lesson", durationMinutes: 90, priceCents: 3500 },
          isPast: false,
          sameDayFeeApplies: false,
          seriesId: null,
          manageToken: "manage-later-one-off"
        },
        ...qaExtraSeriesBookings,
        ...qaCreatedBookings
      ],
      series: [
        ...(repeatStopped
          ? []
          : [
            {
              id: "series-qa",
              weekday: 1,
              minuteOfDay: 1080,
              occurrences: null,
              openEnded: true,
              upcoming: 10
            }
          ]),
        ...qaCreatedSeries
      ],
      sameDayFeeCents: 500
    })
  });
});
await accountPage.route("**/bookings/manage-qa", async (route) => {
  const managedEnd = new Date(qaManagedStart.getTime() + qaManagedLessonType.durationMinutes * 60_000);
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: "INES-QA01",
        status: "confirmed",
        startAt: qaManagedStart.toISOString(),
        endAt: managedEnd.toISOString(),
        location: qaManagedLocation,
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 0,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: qaManagedLessonType
      },
      isPast: false,
      sameDayFeeApplies: false,
      changeLocked: false,
      refundOnCancel: false
    })
  });
});
await accountPage.route("**/bookings/manage-qa/reschedule", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      }
    });
    return;
  }

  const payload = route.request().postDataJSON();
  qaReschedulePayloads.push(payload);
  qaManagedStart = new Date(payload.startAt);
  qaManagedLessonType = payload.lessonType === "longer-90"
    ? { id: "longer-90", name: "Longer lesson", durationMinutes: 90, priceCents: 3500 }
    : { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
  qaManagedLocation = payload.location === "porto" ? "porto" : "online";
  const managedEnd = new Date(qaManagedStart.getTime() + qaManagedLessonType.durationMinutes * 60_000);
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: "INES-QA01",
        status: "confirmed",
        startAt: qaManagedStart.toISOString(),
        endAt: managedEnd.toISOString(),
        location: qaManagedLocation,
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 1,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: qaManagedLessonType
      },
      sameDayFeeApplied: false
    })
  });
});
await accountPage.route("**/bookings/manage-later", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: "INES-LATER",
        status: "confirmed",
        startAt: qaLaterStart.toISOString(),
        endAt: qaLaterEnd.toISOString(),
        location: "online",
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 0,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 }
      },
      isPast: false,
      sameDayFeeApplies: false,
      changeLocked: false,
      refundOnCancel: false
    })
  });
});
await accountPage.route("**/bookings/manage-later-*", async (route) => {
  const token = route.request().url().split("/").at(-1) ?? "";
  const booking = qaExtraSeriesBookings.find((entry) => entry.manageToken === token);
  if (!booking) {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Booking not found." }) });
    return;
  }
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      booking: {
        reference: booking.reference,
        status: booking.status,
        startAt: booking.startAt,
        endAt: booking.endAt,
        location: booking.location,
        studentName: "Ana Martins",
        studentEmail: "student@example.com",
        studentTimezone: "Europe/Lisbon",
        notes: "",
        rescheduleCount: 0,
        sameDayFeeCents: 500,
        paymentStatus: "not_required",
        amountCents: null,
        lessonType: booking.lessonType
      },
      isPast: false,
      sameDayFeeApplies: false,
      changeLocked: false,
      refundOnCancel: false
    })
  });
});
await accountPage.route("**/series/series-qa/stop", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      }
    });
    return;
  }
  const payload = JSON.parse(route.request().postData() || "{}");
  stopRepeatPayloads.push(payload);
  repeatStopped = true;
  await route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      ok: true,
      stopped: true,
      cancelled: payload.cancelRemaining ? 4 : 0,
      kept: 0,
      refunded: payload.cancelRemaining ? 1 : 0
    })
  });
});

await accountPage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
const accountPanel = accountPage.locator("#account-controls");
try {
  await accountPanel.waitFor({ state: "visible", timeout: 10_000 });
} catch {
  const pageText = (await accountPage.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 600);
  throw new Error(
    `The synthetic signed-in account did not load. /me methods: ${accountRequestMethods.join(", ") || "none"}. ` +
      `Page text: ${pageText}`
  );
}
for (const oldToggleName of ["Account", "Close", "Close account"]) {
  if (await accountPage.getByRole("button", { name: oldToggleName, exact: true }).count()) {
    throw new Error(`The obsolete ${oldToggleName} account disclosure is still present.`);
  }
}
const accountMenuButton = accountPanel.getByRole("button", { name: "Menu", exact: true });
const accountActions = accountPanel.locator("#account-menu");
await accountActions.waitFor({ state: "visible" });

async function bookQaLessonAndReturnToUpcoming({ recurring }) {
  await accountPage.locator(".lesson-overview__book").click();
  await accountPage.getByRole("radio", { name: recurring ? "Weekly" : "Single", exact: true }).check();
  await accountPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).check();
  await accountPage.getByRole("button", { name: /times free/ }).first().click();
  const recurrencePreview = recurring
    ? accountPage.waitForResponse(
        (response) =>
          response.url().includes("/bookings/series/preview") && response.request().method() === "POST"
      )
    : null;
  await accountPage.locator("#lesson-calendar .unified-calendar__availability .slot-grid button").first().click();

  if (recurring) {
    await accountPage.getByRole("heading", { name: "Confirm your recurring lessons", exact: true }).waitFor();
    await recurrencePreview;
    await accountPage.locator(".booking-repeat-choice").waitFor({ state: "detached" });
    if (await accountPage.getByText(/week clashes/i).count()) {
      throw new Error("The no-clash recurring fixture unexpectedly reported a clash.");
    }
  }

  await accountPage
    .getByRole("heading", { name: recurring ? "Confirm your recurring lessons" : "Confirm your lesson", exact: true })
    .waitFor();

  if (recurring && (await accountPage.locator(".booking-repeat-choice").count())) {
    throw new Error("A fully available recurrence should not spend confirmation space repeating an all-clear.");
  }

  await accountPage
    .getByRole("button", { name: recurring ? "Book 4 lessons & agree to pay" : "Book lesson & agree to pay", exact: true })
    .click();
  await accountPage.getByRole("heading", { name: /booked in/i }).waitFor();
  if (recurring) {
    await accountPage.getByText("4 lessons booked", { exact: false }).waitFor();
  }

  await accountPage.getByRole("button", { name: "Back to upcoming lessons", exact: true }).click();
  await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
  // The new lesson lands on the calendar itself: a one-off as a booked day, a
  // weekly run in the weekly colour on each of its dates.
  for (const week of recurring ? [0, 1] : [0]) {
    const createdDateKey = new Date(qaFreeStart.getTime() + week * 7 * 86_400_000).toISOString().slice(0, 10);
    const createdDay = accountPage.locator(`#lesson-calendar button[data-date-key="${createdDateKey}"].has-booking`);
    try {
      await createdDay.waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      throw new Error(`A completed ${recurring ? "recurring" : "one-off"} booking should appear on its calendar day, ${createdDateKey}.`);
    }
    if ((await createdDay.evaluate((day) => day.classList.contains("has-weekly-booking"))) !== recurring) {
      throw new Error(`The new ${recurring ? "weekly lessons" : "one-off lesson"} should use the ${recurring ? "weekly" : "one-off"} calendar colour.`);
    }
  }
  await accountPage.screenshot({
    path: path.join(outDir, recurring ? "booking-confirm-back-recurring-mobile.png" : "booking-confirm-back-once-mobile.png"),
    fullPage: true
  });

  qaCreatedBookings = [];
  qaCreatedSeries = [];
  await accountPage.reload({ waitUntil: "domcontentloaded" });
  await accountPanel.waitFor({ state: "visible" });
  await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
}

if ((await accountPanel.getByText("Ana Martins", { exact: true }).count()) !== 1) {
  throw new Error("The signed-in identity should appear once, inside the account bar.");
}
for (const duplicateIdentity of ["Signed in as", "Booking as", "Not you?"]) {
  if (await accountPage.getByText(duplicateIdentity, { exact: false }).count()) {
    throw new Error(`The booking flow still repeats the account identity as “${duplicateIdentity}”.`);
  }
}
if (await accountPage.locator(".booking-history").count()) {
  throw new Error("The old detached history disclosure is still rendered below the calendar.");
}
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
if (await accountPage.locator(".booking-bar").count()) {
  throw new Error("A returning signed-in student should open on their lessons; the booking choices wait for Book.");
}
for (const hiddenUntilViewing of [/Stop repeating/, /Cancel all booked lessons/]) {
  if (await accountPanel.getByRole("button", { name: hiddenUntilViewing }).count()) {
    throw new Error(`${hiddenUntilViewing} should appear only after one recurrence is selected.`);
  }
}
// Initial account content has its own 3px entrance animation, separate from
// booking-transitioning. Measure the settled layout, not its first frame.
await accountPage.waitForFunction(
  () => document.querySelector(".booking-stage")?.getAnimations({ subtree: true })
    .every((animation) => animation.playState !== "running"),
  null,
  { timeout: 2_000 }
);
const initialWorkflowLayout = await accountPage.evaluate(() => {
  const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
  return {
    account: bounds(".unified-account-controls"),
    accountName: bounds(".my-lessons__account-name"),
    calendar: bounds("#lesson-calendar .calendar-panel"),
    heading: bounds("#upcoming-lessons-heading"),
    book: bounds(".lesson-overview__book"),
    next: bounds(".lesson-overview__next")
  };
});
const centreOf = (box) => (box.top + box.bottom) / 2;
if (
  Object.values(initialWorkflowLayout).some((box) => !box) ||
  Math.abs(initialWorkflowLayout.account.left - initialWorkflowLayout.calendar.left) > 2 ||
  Math.abs(initialWorkflowLayout.account.right - initialWorkflowLayout.calendar.right) > 2 ||
  initialWorkflowLayout.calendar.top < initialWorkflowLayout.account.bottom ||
  initialWorkflowLayout.book.left <= initialWorkflowLayout.heading.right ||
  initialWorkflowLayout.book.right > initialWorkflowLayout.calendar.right - 12 ||
  Math.abs(centreOf(initialWorkflowLayout.book) - centreOf(initialWorkflowLayout.heading)) > 12 ||
  initialWorkflowLayout.next.top < initialWorkflowLayout.book.bottom ||
  initialWorkflowLayout.accountName.top - initialWorkflowLayout.account.top < 16
) {
  throw new Error(`The signed-in overview should put the account bar above one lessons calendar, with booking at its top right: ${JSON.stringify(initialWorkflowLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-lessons-overview-desktop.png"), fullPage: true });

const initialAccountMenu = accountPanel.locator("#account-menu");
await initialAccountMenu.waitFor({ state: "visible" });
const initialAccountActionLabels = (await initialAccountMenu.getByRole("button").allTextContents()).map((label) =>
  label.replace(/\s+/g, " ").trim()
);
if (
  initialAccountActionLabels.length !== 4 ||
  !initialAccountActionLabels[0]?.startsWith("View lessons") ||
  initialAccountActionLabels.slice(1).join(" | ") !== "Past lessons | Edit details | Sign out"
) {
  throw new Error(`The account menu should hold View lessons, Past lessons, Edit details and Sign out: ${JSON.stringify(initialAccountActionLabels)}.`);
}
if (!(await initialAccountMenu.getByRole("button", { name: /View lessons/ }).isVisible())) {
  throw new Error("View lessons should not require entering the lesson calendar first.");
}
const desktopAccountBarActions = await accountPage.evaluate(() => {
  const account = document.querySelector(".unified-account-controls")?.getBoundingClientRect();
  const actions = document.querySelector("#account-menu")?.getBoundingClientRect();
  const book = document.querySelector(".lesson-overview__book");
  return {
    account: account ? { top: account.top, right: account.right, bottom: account.bottom, left: account.left } : null,
    actions: actions ? { top: actions.top, right: actions.right, bottom: actions.bottom, left: actions.left } : null,
    bookBackground: book ? getComputedStyle(book).backgroundColor : ""
  };
});
if (
  !desktopAccountBarActions.account ||
  !desktopAccountBarActions.actions ||
  desktopAccountBarActions.actions.top < desktopAccountBarActions.account.top - 1 ||
  desktopAccountBarActions.actions.right > desktopAccountBarActions.account.right + 1 ||
  desktopAccountBarActions.actions.bottom > desktopAccountBarActions.account.bottom + 1 ||
  desktopAccountBarActions.bookBackground !== "rgb(180, 58, 38)" ||
  (await accountMenuButton.isVisible())
) {
  throw new Error(`Desktop account actions should sit directly in the bar, with the one highlighted booking action on the calendar: ${JSON.stringify(desktopAccountBarActions)}.`);
}
if (!(await initialAccountMenu.getByRole("button", { name: /Past lessons/ }).isVisible())) {
  throw new Error("Past lessons should not require entering the lesson calendar first.");
}
if (/\d/.test(await initialAccountMenu.getByRole("button", { name: /Past lessons/ }).innerText())) {
  throw new Error("Past lessons should not carry an attention-grabbing count.");
}
await initialAccountMenu.getByRole("button", { name: /Past lessons/ }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "visible" });
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("Past lessons should show its own complete view without an unrelated future calendar.");
}
await initialAccountMenu.getByRole("button", { name: /Past lessons/ }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "visible" });
await accountPanel.getByRole("button", { name: "Upcoming lessons", exact: true }).click();
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
await accountPanel.getByRole("button", { name: "Edit details", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const embeddedDetailsChrome = await accountPanel.locator(".my-lessons__details").evaluate((details) => {
  const styles = window.getComputedStyle(details);
  return {
    backgroundColor: styles.backgroundColor,
    borderBottomWidth: styles.borderBottomWidth,
    borderLeftWidth: styles.borderLeftWidth,
    borderRightWidth: styles.borderRightWidth,
    borderRadius: styles.borderRadius,
  };
});
if (
  embeddedDetailsChrome.backgroundColor !== "rgba(0, 0, 0, 0)" ||
  embeddedDetailsChrome.borderBottomWidth !== "0px" ||
  embeddedDetailsChrome.borderLeftWidth !== "0px" ||
  embeddedDetailsChrome.borderRightWidth !== "0px" ||
  embeddedDetailsChrome.borderRadius !== "0px"
) {
  throw new Error(`Embedded account fields should use the account panel instead of a nested card: ${JSON.stringify(embeddedDetailsChrome)}.`);
}
const desktopDetailRows = await accountPanel.locator(".my-lessons__details-row").evaluateAll((rows) =>
  rows.map((row) => {
    const field = row.querySelector("label")?.getBoundingClientRect();
    const action = row.querySelector("button")?.getBoundingClientRect();
    return { fieldRight: field?.right ?? Infinity, actionLeft: action?.left ?? 0 };
  })
);
if (desktopDetailRows.length !== 3 || desktopDetailRows.some((row) => row.actionLeft < row.fieldRight - 1)) {
  throw new Error(`Account field actions should sit beside their fields when they fit: ${JSON.stringify(desktopDetailRows)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-edit-desktop.png"), fullPage: true });
await accountPanel.getByRole("button", { name: "Done editing", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "detached" });

await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4) {
  throw new Error("Viewing existing lessons should always open the four-week calendar.");
}
if (await accountPage.getByRole("button", { name: "Show 8 weeks", exact: true }).count()) {
  throw new Error("The lesson overview should keep its four-week horizon instead of exposing a calendar range toggle.");
}
if (await accountPage.getByRole("button", { name: "Stop repeating", exact: true }).count()) {
  throw new Error("Sequence controls should appear only when one recurring lesson is selected.");
}
if (await accountPage.getByRole("button", { name: "Cancel all booked lessons", exact: true }).count()) {
  throw new Error("Bulk sequence cancellation should appear only when one recurring lesson is selected.");
}
const lessonsAccountMenu = accountPanel.locator("#account-menu");
if ((await lessonsAccountMenu.getByRole("button").count()) !== 4) {
  throw new Error("View lessons, Past lessons, Edit details and Sign out should live together in the account menu.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-menu-desktop.png"), fullPage: true });
const pastLessonsToggle = lessonsAccountMenu.getByRole("button", { name: /Past lessons/ });
await pastLessonsToggle.click();
await accountPanel.getByRole("heading", { name: "Past lessons", exact: true }).waitFor();
await waitForOrientation(accountPage);
const cancelledHistoryCard = accountPanel.locator("#account-past-lessons .history-lesson-card--cancelled");
if (
  (await cancelledHistoryCard.count()) !== 1 ||
  !(await cancelledHistoryCard.getByText("Cancelled", { exact: true }).isVisible()) ||
  !(await cancelledHistoryCard.getByText("60 mins · Online", { exact: true }).isVisible()) ||
  !(await cancelledHistoryCard.getByText("Reference INES-OLD1", { exact: true }).isVisible()) ||
  (await cancelledHistoryCard.locator(".lesson-calendar__mark").count()) !== 1 ||
  (await cancelledHistoryCard.getByRole("button").count()) !== 0
) {
  throw new Error("A cancelled lesson should use the same readable card anatomy as Upcoming lessons without a management action.");
}
const pastLessonPlacement = await accountPanel.evaluate((panel) => {
  const account = panel.querySelector(".unified-account-controls")?.getBoundingClientRect();
  const history = panel.querySelector("#account-past-lessons")?.getBoundingClientRect();
  return { accountBottom: account?.bottom ?? Infinity, historyTop: history?.top ?? -Infinity };
});
if (pastLessonPlacement.historyTop <= pastLessonPlacement.accountBottom + 4) {
  throw new Error(`Past lessons should live in a separate panel below the account bar: ${JSON.stringify(pastLessonPlacement)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-past-lessons-desktop.png"), fullPage: true });
await accountPanel.getByRole("button", { name: "Upcoming lessons", exact: true }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "detached" });
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });

const laterLessonsToggle = accountPanel.getByRole("button", { name: /View lessons/ });
if (!/3\s*$/.test((await laterLessonsToggle.innerText()).trim())) {
  throw new Error("The Upcoming lessons badge should count each repeating schedule once, plus each one-off lesson.");
}
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const calendarToolbarAlignment = await accountPage.evaluate(() => {
  const legend = document.querySelector("#lesson-calendar .unified-calendar__legend")?.getBoundingClientRect();
  const range = document.querySelector("#lesson-calendar .unified-calendar__range-actions")?.getBoundingClientRect();
  return {
    legendCenter: legend ? (legend.top + legend.bottom) / 2 : -Infinity,
    rangeCenter: range ? (range.top + range.bottom) / 2 : Infinity
  };
});
if (Math.abs(calendarToolbarAlignment.legendCenter - calendarToolbarAlignment.rangeCenter) > 1) {
  throw new Error(`The calendar key and range label should share one vertical centre: ${JSON.stringify(calendarToolbarAlignment)}.`);
}
// Every booked lesson lives on this calendar: a day shows its times, weekly
// lessons keep their own colour, and the next lesson leads the card.
const overviewLegend = ((await accountPage.locator("#lesson-calendar .unified-calendar__legend").textContent()) ?? "")
  .replace(/\s+/g, " ")
  .trim();
if (!overviewLegend.includes("One-off lesson") || !overviewLegend.includes("Weekly lesson") || overviewLegend.includes("Free to book")) {
  throw new Error(`The lessons calendar key should tell one-off and weekly lessons apart: ${overviewLegend}.`);
}
const qaStartDate = qaStart.toISOString().slice(0, 10);
const qaStartDay = accountPage.locator(`#lesson-calendar button[data-date-key="${qaStartDate}"]`);
const qaStartDayState = await qaStartDay.evaluate((day) => ({
  classes: day.className,
  label: day.getAttribute("aria-label") ?? "",
  times: [...day.querySelectorAll(".calendar-booking-times span")].map((time) => ({
    text: time.textContent?.trim() ?? "",
    weekly: time.classList.contains("is-weekly")
  }))
}));
if (
  !qaStartDayState.classes.includes("has-booking") ||
  qaStartDayState.classes.includes("has-weekly-booking") ||
  !qaStartDayState.label.endsWith("2 lessons, choose a lesson to open") ||
  JSON.stringify(qaStartDayState.times) !== JSON.stringify([
    { text: formatQaTime(qaStart), weekly: true },
    { text: formatQaTime(qaSecondStart), weekly: false }
  ])
) {
  throw new Error(`A day with a weekly and a one-off lesson should show both times in their own colours: ${JSON.stringify(qaStartDayState)}.`);
}
const nextLessonText = ((await accountPage.locator(".lesson-overview__next").textContent()) ?? "").replace(/\s+/g, " ").trim();
if (
  !nextLessonText.includes("Next lesson") ||
  !nextLessonText.includes(formatQaTime(qaStart)) ||
  !nextLessonText.includes("60 mins · Online · Weekly")
) {
  throw new Error(`The lessons calendar should lead with the next lesson: ${nextLessonText}.`);
}

// Four weeks at a time. Later weeks counts the booked lessons beyond them, and
// paging reaches every one.
const earlierWeeks = accountPage.getByRole("button", { name: "Earlier weeks", exact: true });
const laterWeeks = accountPage.getByRole("button", { name: /^Later weeks/ });
const calendarRangeLabel = accountPage.locator("#lesson-calendar .calendar-pager .unified-calendar__range");
const qaLaterDay = accountPage.locator(`#lesson-calendar button[data-date-key="${qaLaterDate}"]`);
if (
  !(await earlierWeeks.isDisabled()) ||
  (await laterWeeks.getAttribute("aria-label")) !== "Later weeks, 10 more lessons" ||
  ((await laterWeeks.textContent()) ?? "").trim() !== "10" ||
  (await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4 ||
  (await qaLaterDay.count())
) {
  throw new Error("The first four weeks should start this week and count the booked lessons beyond them.");
}
const firstCalendarRange = await calendarRangeLabel.textContent();
let laterPageTurns = 0;
while (!(await qaLaterDay.count())) {
  if (++laterPageTurns > 5 || (await laterWeeks.isDisabled())) {
    throw new Error(`Later weeks should reach every booked lesson; ${qaLaterDate} never appeared.`);
  }
  await laterWeeks.click();
  await waitForOrientation(accountPage);
}
if (
  (await calendarRangeLabel.textContent()) === firstCalendarRange ||
  (await accountPage.locator("#lesson-calendar .calendar-week").count()) > 4 ||
  !(await qaLaterDay.evaluate((day) => day.classList.contains("has-weekly-booking")))
) {
  throw new Error("A later page should replace the four weeks on show and mark the weekly lesson it reaches.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-later-weeks-desktop.png"), fullPage: true });
await qaLaterDay.click();
const upcomingManageDialog = accountPage.getByRole("dialog", { name: "Manage this lesson", exact: true });
try {
  await upcomingManageDialog.waitFor({ state: "visible", timeout: 10_000 });
} catch {
  const dialogText = (await accountPage.locator(".lesson-manage-dialog").innerText().catch(() => "missing dialog")).replace(/\s+/g, " ").trim();
  throw new Error(`A booked calendar day did not open its lesson. Dialog: ${dialogText}`);
}
await upcomingManageDialog.getByText("Recurring lesson", { exact: true }).waitFor();
await upcomingManageDialog.getByText("60 mins · Online", { exact: true }).waitFor();
await upcomingManageDialog.getByText("Part of a recurring sequence", { exact: true }).waitFor();
await upcomingManageDialog.getByRole("button", { name: "Change", exact: true }).waitFor();
await upcomingManageDialog.getByRole("button", { name: "Cancel", exact: true }).waitFor();
await upcomingManageDialog.getByRole("button", { name: "Manage sequence", exact: true }).waitFor();
if (await accountPage.locator("#lesson-calendar.unified-calendar--managed-overlay").count()) {
  throw new Error("Opening a lesson should not rearrange the calendar into its change layout.");
}
const managedDialogLayout = await upcomingManageDialog.evaluate((dialog) => {
  const rectangle = dialog.getBoundingClientRect();
  return {
    width: rectangle.width,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    top: rectangle.top,
    bottom: rectangle.bottom
  };
});
if (
  managedDialogLayout.width > 460 ||
  managedDialogLayout.width > managedDialogLayout.viewportWidth - 24 ||
  managedDialogLayout.top < 0 ||
  managedDialogLayout.bottom > managedDialogLayout.viewportHeight + 1
) {
  throw new Error(`Lesson management should be a small, contained overlay: ${JSON.stringify(managedDialogLayout)}.`);
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-overlay-desktop.png"), fullPage: true });
await upcomingManageDialog.getByRole("button", { name: "Close lesson management", exact: true }).click();
await upcomingManageDialog.waitFor({ state: "detached" });
try {
  await accountPage.waitForFunction(
    (dateKey) => document.activeElement?.getAttribute("data-date-key") === dateKey,
    qaLaterDate,
    { timeout: 2_000 }
  );
} catch {
  throw new Error("Closing a lesson should return focus to its calendar day.");
}
if (await accountPage.locator(".booking-workflow-context, #lesson-calendar .unified-calendar__panel").count()) {
  throw new Error("The lesson overview should not add a context or selected-day panel once a lesson closes.");
}
while (!(await earlierWeeks.isDisabled())) {
  await earlierWeeks.click();
  await waitForOrientation(accountPage);
}
if ((await calendarRangeLabel.textContent()) !== firstCalendarRange) {
  throw new Error("Earlier weeks should return to the first four weeks.");
}

const calendarHint = accountPage.getByRole("button", { name: "How your lesson calendar works", exact: true });
const calendarTip = accountPage.locator("#upcoming-lessons-tip");
if (
  ((await calendarTip.textContent()) ?? "").trim() !==
  "Choose a booked lesson to see its details, move it or cancel it. Choose any other day to book a lesson then."
) {
  throw new Error("The question mark should explain how the lessons calendar works.");
}
const tooltipNextTopBefore = await accountPage.locator(".lesson-overview__next").evaluate((row) => row.getBoundingClientRect().top);
await calendarHint.focus();
await calendarTip.waitFor({ state: "visible" });
await accountPage.waitForFunction(() => getComputedStyle(document.querySelector("#upcoming-lessons-tip")).opacity === "1");
const tooltipLayout = await accountPage.evaluate(() => {
  const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
  const tipStyles = getComputedStyle(document.querySelector("#upcoming-lessons-tip"));
  return {
    calendar: bounds("#lesson-calendar .calendar-panel"),
    tip: bounds("#upcoming-lessons-tip"),
    next: bounds(".lesson-overview__next"),
    tipStyles: { backgroundColor: tipStyles.backgroundColor, opacity: tipStyles.opacity, position: tipStyles.position }
  };
});
if (
  !tooltipLayout.calendar ||
  !tooltipLayout.tip ||
  !tooltipLayout.next ||
  tooltipLayout.tip.left < tooltipLayout.calendar.left - 1 ||
  tooltipLayout.tip.right > tooltipLayout.calendar.right + 1 ||
  Math.abs(tooltipLayout.next.top - tooltipNextTopBefore) > 1 ||
  tooltipLayout.tip.bottom <= tooltipLayout.next.top ||
  tooltipLayout.tipStyles.position !== "absolute" ||
  tooltipLayout.tipStyles.opacity !== "1" ||
  tooltipLayout.tipStyles.backgroundColor !== "rgba(26, 49, 105, 0.97)"
) {
  throw new Error(`The calendar tooltip should float over the card on its dark surface without moving anything: ${JSON.stringify({ tooltipNextTopBefore, ...tooltipLayout })}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-tooltip-desktop.png"), fullPage: true });
await accountActions.getByRole("button", { name: /View lessons/ }).focus();
await accountPage.mouse.move(1, 1);
await calendarTip.waitFor({ state: "hidden" });
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4) {
  throw new Error("The lessons calendar should show four weeks at a time.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-desktop.png"), fullPage: true });

const desktopAccountLayout = await accountPage.evaluate(() => {
  const bounds = (selector) => {
    const rectangle = document.querySelector(selector)?.getBoundingClientRect();
    return rectangle
      ? { top: rectangle.top, bottom: rectangle.bottom, left: rectangle.left, right: rectangle.right, width: rectangle.width }
      : null;
  };
  return {
    composition: bounds(".booking-composition"),
    intro: bounds(".booking-intro"),
    provider: bounds(".booking-provider"),
    panel: bounds(".unified-account-controls"),
    calendar: bounds("#lesson-calendar .calendar-panel")
  };
});
if (
  Object.values(desktopAccountLayout).some((box) => !box) ||
  Math.abs(desktopAccountLayout.panel.left - desktopAccountLayout.calendar.left) > 2 ||
  Math.abs(desktopAccountLayout.panel.right - desktopAccountLayout.calendar.right) > 2 ||
  desktopAccountLayout.intro.bottom > desktopAccountLayout.provider.top + 1 ||
  desktopAccountLayout.panel.bottom > desktopAccountLayout.calendar.top + 1
) {
  throw new Error(
    `The compact banner and signed-in desktop overview should form one aligned workspace: ${JSON.stringify(desktopAccountLayout)}.`
  );
}
if (
  Math.abs(desktopAccountLayout.intro.width - desktopAccountLayout.composition.width) > 2 ||
  Math.abs(desktopAccountLayout.provider.width - desktopAccountLayout.composition.width) > 2
) {
  throw new Error("The desktop banner and booking workspace should both use the full available width.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-desktop.png"), fullPage: true });

const desktopBookingTimes = accountPage.locator("#lesson-calendar .calendar-booking-times span");
if ((await desktopBookingTimes.count()) !== 2) {
  throw new Error("A day with two lessons should show both booked times, not a cramped count badge.");
}
// A day with more than one lesson asks which to open, and can still book another.
await qaStartDay.scrollIntoViewIfNeeded();
await qaStartDay.click();
const dayLessonsPrompt = accountPage.getByRole("dialog", { name: "Your lessons", exact: true });
await dayLessonsPrompt.waitFor();
const promptLessons = dayLessonsPrompt.locator(".calendar-booking-prompt__lesson");
const promptLessonDetails = await promptLessons.evaluateAll((buttons) =>
  buttons.map((button) => ({
    title: button.querySelector("strong")?.textContent?.trim() ?? "",
    detail: button.querySelector("small")?.textContent?.trim() ?? ""
  }))
);
// Titles lead with the Porto time; a visitor elsewhere also sees their own.
if (
  promptLessonDetails.length !== 2 ||
  !promptLessonDetails[0].title.startsWith(formatQaTime(qaStart)) ||
  promptLessonDetails[0].detail !== "60 mins · Online · Weekly" ||
  !promptLessonDetails[1].title.startsWith(formatQaTime(qaSecondStart)) ||
  promptLessonDetails[1].detail !== "60 mins · Online"
) {
  throw new Error(`A two-lesson day should list both lessons to open: ${JSON.stringify(promptLessonDetails)}.`);
}
await dayLessonsPrompt.getByRole("button", { name: "Book another lesson", exact: true }).waitFor();
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-day-lessons-desktop.png"), fullPage: false });
await promptLessons.first().click();
await dayLessonsPrompt.waitFor({ state: "detached" });
const desktopManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
const desktopManageDialog = accountPage.getByRole("dialog", { name: "Manage this lesson", exact: true });
await desktopManageDialog.waitFor({ state: "visible" });
await desktopManageDialog.locator(".lesson-calendar__status").waitFor();
await desktopManageDialog.getByText("Part of a recurring sequence", { exact: true }).waitFor();
await waitForOrientation(accountPage);
const desktopManageControls = await desktopManageDialog.evaluate((dialog) => {
  const bounds = [...dialog.querySelectorAll(".lesson-manage-dialog__actions .button")].map((button) => {
    const rectangle = button.getBoundingClientRect();
    return { left: rectangle.left, right: rectangle.right, width: rectangle.width, height: rectangle.height };
  });
  const rectangle = dialog.getBoundingClientRect();
  return {
    bounds,
    panelLeft: rectangle.left,
    panelRight: rectangle.right,
    panelWidth: rectangle.width
  };
});
if (
  desktopManageControls.bounds.length !== 2 ||
  Math.abs(desktopManageControls.bounds[0].height - desktopManageControls.bounds[1].height) > 2 ||
  desktopManageControls.bounds.some((button) => button.width >= desktopManageControls.panelWidth * 0.75) ||
  desktopManageControls.bounds[0].left < desktopManageControls.panelLeft - 1 ||
  desktopManageControls.panelRight - desktopManageControls.bounds.at(-1).right > 40
) {
  throw new Error(
    `Lesson management should use one compact, aligned control system: ${JSON.stringify(desktopManageControls)}.`
  );
}
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-desktop.png"), fullPage: true });
await desktopManageDialog.getByRole("button", { name: "Cancel", exact: true }).click();
await accountPage.getByRole("dialog", { name: "Cancel this lesson?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Keep lesson", exact: true }).click();
await desktopManageDialog.waitFor({ state: "visible" });
await desktopManageDialog.getByRole("button", { name: "Change", exact: true }).evaluate((button) => {
  button.addEventListener("click", () => {
    document.documentElement.dataset.qaDesktopChangeScrollBefore = String(window.scrollY);
  }, { capture: true, once: true });
});
await desktopManageDialog.getByRole("button", { name: "Change", exact: true }).click();
const desktopChangeDialog = accountPage.getByRole("dialog", { name: "Choose a new date and time", exact: true });
await desktopChangeDialog.waitFor({ state: "visible" });
await desktopManagePanel.getByRole("heading", { name: "Choose a new date and time", exact: true }).waitFor();
await desktopManagePanel.getByRole("radio", { name: "60 minutes", exact: true }).waitFor();
const ninetyMinuteChoice = desktopManagePanel.getByRole("radio", { name: "90 minutes", exact: true });
await ninetyMinuteChoice.waitFor();
await desktopManagePanel.getByRole("radio", { name: "Online", exact: true }).waitFor();
const currentManagedTime = desktopManagePanel.locator(".slot-grid button.is-selected");
await currentManagedTime.waitFor();
if ((await currentManagedTime.innerText()).trim() !== formatQaTime(qaManagedStart)) {
  throw new Error("The lesson's current time should appear selected when the change workflow opens.");
}
const desktopChangeLayout = await accountPage.evaluate(() => {
  const workspace = document.querySelector("#lesson-calendar")?.getBoundingClientRect();
  const calendar = document.querySelector("#lesson-calendar .unified-calendar__grid")?.getBoundingClientRect();
  const panel = document.querySelector("#lesson-calendar .unified-calendar__panel")?.getBoundingClientRect();
  const calendarElement = document.querySelector("#lesson-calendar .unified-calendar__grid");
  const panelElement = document.querySelector("#lesson-calendar .unified-calendar__panel");
  const move = document.querySelector("#lesson-calendar .unified-calendar__move");
  const current = document.querySelector("#lesson-calendar .managed-lesson__current-time");
  return {
    calendarTop: calendar?.top ?? Infinity,
    panelTop: panel?.top ?? -Infinity,
    overlay: Boolean(document.querySelector(".lesson-manage-overlay--reschedule")),
    position: document.querySelector("#lesson-calendar") ? getComputedStyle(document.querySelector("#lesson-calendar")).position : "",
    scrollBefore: Number(document.documentElement.dataset.qaDesktopChangeScrollBefore),
    scrollY: window.scrollY,
    workspaceTop: workspace?.top ?? -Infinity,
    workspaceBottom: workspace?.bottom ?? Infinity,
    viewportHeight: window.innerHeight,
    moveBorderTopWidth: move ? getComputedStyle(move).borderTopWidth : "missing",
    currentBorderBottomWidth: current ? getComputedStyle(current).borderBottomWidth : "missing",
    calendarBorderWidth: calendarElement ? getComputedStyle(calendarElement).borderTopWidth : "missing",
    panelBorderWidth: panelElement ? getComputedStyle(panelElement).borderTopWidth : "missing",
    durationSegmented: Boolean(document.querySelector("#lesson-calendar .managed-lesson__duration .segmented")),
    locationSegmented: Boolean(document.querySelector("#lesson-calendar input[name='managed-lesson-location']"))
  };
});
if (
  Math.abs(desktopChangeLayout.calendarTop - desktopChangeLayout.panelTop) > 2 ||
  !desktopChangeLayout.overlay ||
  desktopChangeLayout.position !== "fixed" ||
  Math.abs(desktopChangeLayout.scrollY - desktopChangeLayout.scrollBefore) > 1 ||
  desktopChangeLayout.workspaceTop < 8 ||
  desktopChangeLayout.workspaceBottom > desktopChangeLayout.viewportHeight - 8 ||
  desktopChangeLayout.moveBorderTopWidth !== "0px" ||
  desktopChangeLayout.currentBorderBottomWidth !== "0px" ||
  desktopChangeLayout.calendarBorderWidth !== "0px" ||
  desktopChangeLayout.panelBorderWidth !== "0px" ||
  !desktopChangeLayout.durationSegmented ||
  !desktopChangeLayout.locationSegmented
) {
  throw new Error(`Changing a lesson should stay inside the aligned calendar interface, without decorative rules and with the shared segmented control: ${JSON.stringify(desktopChangeLayout)}.`);
}
await desktopManagePanel.getByRole("button", { name: "Back", exact: true }).click();
await desktopManageDialog.waitFor({ state: "visible" });
await desktopManageDialog.getByRole("button", { name: "Change", exact: true }).click();
await desktopChangeDialog.waitFor({ state: "visible" });
await ninetyMinuteChoice.check();
await desktopManagePanel.getByRole("radio", { name: "In Porto", exact: true }).check();
// Rescheduling opens the booked week. On Sundays, tomorrow's fixture is in
// the following week, so expand the calendar through the same control a
// student uses instead of assuming both dates share the compact week.
await desktopChangeDialog.getByRole("button", { name: "Show all", exact: true }).click();
await accountPage.locator(`#lesson-calendar [data-date-key="${qaFreeDate}"]`).click();
await desktopManagePanel.locator(".slot-grid button").first().click();
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-change-workflow-desktop.png"), fullPage: false });
await desktopManagePanel.getByRole("button", { name: /^Change to / }).click();
const changedDurationDialog = accountPage.getByRole("dialog", { name: "All sorted", exact: true });
await changedDurationDialog.waitFor({ state: "visible" });
await changedDurationDialog.getByText(/now 90 mins/i).waitFor();
if (qaReschedulePayloads.at(-1)?.lessonType !== "longer-90" || qaReschedulePayloads.at(-1)?.location !== "porto") {
  throw new Error(`Changing duration and location sent the wrong choices: ${JSON.stringify(qaReschedulePayloads.at(-1))}.`);
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-change-duration-desktop.png"), fullPage: true });
await changedDurationDialog.getByRole("button", { name: "Done", exact: true }).click();
await changedDurationDialog.waitFor({ state: "detached" });
qaManagedStart = qaStart;
qaManagedLessonType = { id: "single-60", name: "Single lesson", durationMinutes: 60, priceCents: 2500 };
qaManagedLocation = "online";
if ((await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4) {
  throw new Error("Finishing lesson management should restore the four-week visual overview.");
}
await waitForOrientation(accountPage);

await accountPage.setViewportSize({ width: 390, height: 844 });
await accountPage.waitForTimeout(300);
await accountMenuButton.waitFor({ state: "visible" });
await accountActions.waitFor({ state: "hidden" });
const mobileBookingActionLayout = await accountPage.evaluate(() => {
  const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
  const action = document.querySelector(".lesson-overview__book");
  return {
    calendar: bounds("#lesson-calendar .calendar-panel"),
    heading: bounds("#upcoming-lessons-heading"),
    action: bounds(".lesson-overview__book"),
    actionBackground: action ? getComputedStyle(action).backgroundColor : ""
  };
});
if (
  !mobileBookingActionLayout.calendar ||
  !mobileBookingActionLayout.heading ||
  !mobileBookingActionLayout.action ||
  mobileBookingActionLayout.action.right > mobileBookingActionLayout.calendar.right - 8 ||
  mobileBookingActionLayout.action.left <= mobileBookingActionLayout.heading.right ||
  Math.abs(centreOf(mobileBookingActionLayout.action) - centreOf(mobileBookingActionLayout.heading)) > 12 ||
  mobileBookingActionLayout.actionBackground !== "rgb(180, 58, 38)"
) {
  throw new Error(`Booking should stay highlighted at the calendar's top right on mobile: ${JSON.stringify(mobileBookingActionLayout)}.`);
}
const mobileAccountName = await accountPanel.locator(".my-lessons__account-name strong").evaluate((name) => ({
  clientWidth: name.clientWidth,
  scrollWidth: name.scrollWidth
}));
if (mobileAccountName.scrollWidth > mobileAccountName.clientWidth + 1) {
  throw new Error("The account name should remain readable beside the compact mobile menu.");
}
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: /Past lessons/ }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "visible" });
await accountPanel.locator("#account-menu").waitFor({ state: "hidden" });
await waitForOrientation(accountPage);
const mobilePastLessonsLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth
}));
if (mobilePastLessonsLayout.scrollWidth > mobilePastLessonsLayout.clientWidth + 1) {
  throw new Error("The separate past-lessons panel overflows on a phone.");
}
await accountPanel.screenshot({ path: path.join(outDir, "booking-past-lessons-mobile.png") });
await accountPanel.getByRole("button", { name: "Upcoming lessons", exact: true }).click();
await accountPanel.locator("#account-past-lessons").waitFor({ state: "detached" });
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Edit details", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const mobileDetailsLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));
if (mobileDetailsLayout.scrollWidth > mobileDetailsLayout.clientWidth + 1) {
  throw new Error(`The embedded account editor overflows on a phone: ${JSON.stringify(mobileDetailsLayout)}.`);
}
await accountPanel.screenshot({ path: path.join(outDir, "booking-account-edit-mobile.png") });
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Done editing", exact: true }).click();
await accountPanel.locator(".my-lessons__details").waitFor({ state: "detached" });
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
await waitForOrientation(accountPage);
const mobileTooltipNextTopBefore = await accountPage.locator(".lesson-overview__next").evaluate((row) => row.getBoundingClientRect().top);
await calendarHint.focus();
await calendarTip.waitFor({ state: "visible" });
await accountPage.waitForFunction(() => getComputedStyle(document.querySelector("#upcoming-lessons-tip")).opacity === "1");
const mobileTooltipLayout = await accountPage.evaluate(() => {
  const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
  return {
    calendar: bounds("#lesson-calendar .calendar-panel"),
    tip: bounds("#upcoming-lessons-tip"),
    next: bounds(".lesson-overview__next")
  };
});
if (
  !mobileTooltipLayout.calendar ||
  !mobileTooltipLayout.tip ||
  !mobileTooltipLayout.next ||
  mobileTooltipLayout.tip.left < mobileTooltipLayout.calendar.left - 1 ||
  mobileTooltipLayout.tip.right > mobileTooltipLayout.calendar.right + 1 ||
  Math.abs(mobileTooltipLayout.next.top - mobileTooltipNextTopBefore) > 1
) {
  throw new Error(`The calendar tooltip should stay inside the card on a phone without moving anything: ${JSON.stringify({ mobileTooltipNextTopBefore, ...mobileTooltipLayout })}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-tooltip-mobile.png"), fullPage: true });
await accountMenuButton.focus();
await accountPage.mouse.move(1, 1);
await calendarTip.waitFor({ state: "hidden" });
await waitForOrientation(accountPage);
const mobileNextLessonLayout = await accountPage.locator(".lesson-overview__next").evaluate((row) => {
  const bounds = (selector) => row.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
  return {
    row: row.getBoundingClientRect().toJSON(),
    mark: bounds(".lesson-overview__next-mark"),
    copy: bounds(".lesson-overview__next-open")
  };
});
if (
  !mobileNextLessonLayout.mark ||
  !mobileNextLessonLayout.copy ||
  mobileNextLessonLayout.mark.left < mobileNextLessonLayout.row.left + 6 ||
  mobileNextLessonLayout.copy.left < mobileNextLessonLayout.mark.right - 2 ||
  mobileNextLessonLayout.copy.right > mobileNextLessonLayout.row.right - 6
) {
  throw new Error(`The next lesson should keep its mark and details inside one clean row on a phone: ${JSON.stringify(mobileNextLessonLayout)}.`);
}
const mobileLaterLessonsLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth
}));
if (mobileLaterLessonsLayout.scrollWidth > mobileLaterLessonsLayout.clientWidth + 1) {
  throw new Error(`The lessons calendar overflows on a phone: ${JSON.stringify(mobileLaterLessonsLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-upcoming-lessons-mobile.png"), fullPage: true });
await accountMenuButton.click();
await accountPanel.getByRole("button", { name: /View lessons/ }).click();
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
const mobileAccountLayout = await accountPage.evaluate(() => {
  const calendar = document.querySelector("#lesson-calendar .unified-calendar__grid");
  const calendarBounds = calendar?.getBoundingClientRect();
  const firstWeekday = calendar?.querySelector(".calendar-weekdays span:first-child")?.getBoundingClientRect();
  const lastWeekday = calendar?.querySelector(".calendar-weekdays span:last-child")?.getBoundingClientRect();
  const legend = calendar?.querySelector(".unified-calendar__legend")?.getBoundingClientRect();
  return {
    calendarLeft: calendarBounds?.left ?? 0,
    calendarRight: calendarBounds?.right ?? 0,
    firstWeekdayLeft: firstWeekday?.left ?? -Infinity,
    lastWeekdayRight: lastWeekday?.right ?? Infinity,
    legendLeft: legend?.left ?? -Infinity,
    legendRight: legend?.right ?? Infinity,
    calendarScrollLeft: calendar?.scrollLeft ?? Infinity,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  };
});
if (mobileAccountLayout.scrollWidth > mobileAccountLayout.clientWidth + 1) {
  throw new Error("The open mobile account controls cause horizontal overflow.");
}
if (
  mobileAccountLayout.firstWeekdayLeft < mobileAccountLayout.calendarLeft - 1 ||
  mobileAccountLayout.lastWeekdayRight > mobileAccountLayout.calendarRight + 1 ||
  mobileAccountLayout.legendLeft < mobileAccountLayout.calendarLeft - 1 ||
  mobileAccountLayout.legendRight > mobileAccountLayout.calendarRight + 1 ||
  mobileAccountLayout.calendarScrollLeft > 1
) {
  throw new Error(`The mobile calendar clips its first or last day: ${JSON.stringify(mobileAccountLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-account-mobile.png"), fullPage: true });

await accountPage.evaluate(() => {
  document.documentElement.dataset.qaBookingTransitionSeen = "false";
  const observer = new MutationObserver(() => {
    if (document.documentElement.classList.contains("booking-transitioning")) {
      document.documentElement.dataset.qaBookingTransitionSeen = "true";
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});

const defaultCalendarWeekCount = await accountPage.locator("#lesson-calendar .unified-calendar__grid .calendar-week").count();
if (defaultCalendarWeekCount !== 4) {
  throw new Error(`The default upcoming-lessons calendar rendered ${defaultCalendarWeekCount} rows instead of four.`);
}
if (await accountPage.getByRole("button", { name: "Show all", exact: true }).count()) {
  throw new Error("The upcoming-lessons calendar should show four weeks by default, without an expansion control.");
}
const bookingTimes = accountPage.locator("#lesson-calendar .calendar-booking-times span");
if ((await bookingTimes.count()) !== 2) {
  throw new Error("The mobile booked day should show both lesson times.");
}
await qaStartDay.click();
await dayLessonsPrompt.waitFor();
await waitForOrientation(accountPage);
const bookedDayOrientation = await dayLessonsPrompt.evaluate((dialog) => {
  const rectangle = dialog.getBoundingClientRect();
  return {
    top: rectangle.top,
    bottom: rectangle.bottom,
    left: rectangle.left,
    right: rectangle.right,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
});
if (
  bookedDayOrientation.top < 0 ||
  bookedDayOrientation.bottom > bookedDayOrientation.viewportHeight ||
  bookedDayOrientation.left < 8 ||
  bookedDayOrientation.right > bookedDayOrientation.viewportWidth - 8
) {
  throw new Error(`A day with two lessons should ask which to open within a phone's viewport: ${JSON.stringify(bookedDayOrientation)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-day-lessons-mobile.png"), fullPage: false });
const compactCalendarWeekCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__grid .calendar-week")
  .count();
if (compactCalendarWeekCount !== 4) {
  throw new Error(`Choosing a booked day should keep the four-week overview; found ${compactCalendarWeekCount}.`);
}
if (await accountPage.locator("#lesson-calendar .unified-calendar__panel").count()) {
  throw new Error("The lesson-view calendar should not add a second selected-day box on mobile.");
}
await promptLessons.first().click();
await dayLessonsPrompt.waitFor({ state: "detached" });
const bookingTransitionSeen = await accountPage.evaluate(
  () => document.documentElement.dataset.qaBookingTransitionSeen === "true"
);
if (!bookingTransitionSeen) {
  throw new Error("Booking decisions should use the short local surface transition.");
}
const mobileManagePanel = accountPage.locator("#lesson-calendar .unified-calendar__panel");
const mobileManageDialog = accountPage.getByRole("dialog", { name: "Manage this lesson", exact: true });
await mobileManageDialog.waitFor({ state: "visible" });
await mobileManageDialog.locator(".lesson-calendar__status").waitFor();
await waitForOrientation(accountPage);
const mobileManagedPlacement = await accountPage.evaluate(() => {
  const dialog = document.querySelector(".lesson-manage-dialog")?.getBoundingClientRect();
  return {
    dialogLeft: dialog?.left ?? -Infinity,
    dialogRight: dialog?.right ?? Infinity,
    dialogTop: dialog?.top ?? -Infinity,
    dialogBottom: dialog?.bottom ?? Infinity,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
});
if (
  mobileManagedPlacement.dialogLeft < 8 ||
  mobileManagedPlacement.dialogRight > mobileManagedPlacement.viewportWidth - 8 ||
  mobileManagedPlacement.dialogTop < 0 ||
  mobileManagedPlacement.dialogBottom > mobileManagedPlacement.viewportHeight + 1
) {
  throw new Error(`Mobile lesson management should remain a contained overlay: ${JSON.stringify(mobileManagedPlacement)}.`);
}
const mobileManageControls = await mobileManageDialog.evaluate((dialog) => {
  const bounds = [...dialog.querySelectorAll(".lesson-manage-dialog__actions .button")].map((button) => {
    const rectangle = button.getBoundingClientRect();
    return { left: rectangle.left, right: rectangle.right, width: rectangle.width, height: rectangle.height };
  });
  const rectangle = dialog.getBoundingClientRect();
  return { bounds, panelLeft: rectangle.left, panelRight: rectangle.right, panelWidth: rectangle.width };
});
if (
  mobileManageControls.bounds.length !== 2 ||
  Math.abs(mobileManageControls.bounds[0].height - mobileManageControls.bounds[1].height) > 2 ||
  mobileManageControls.bounds.some((button) => button.width >= mobileManageControls.panelWidth * 0.75) ||
  mobileManageControls.bounds[0].left < mobileManageControls.panelLeft - 1 ||
  mobileManageControls.panelRight - mobileManageControls.bounds.at(-1).right > 40
) {
  throw new Error(
    `Mobile lesson actions should stay compact and right-aligned: ${JSON.stringify(mobileManageControls)}.`
  );
}
await accountPage.screenshot({ path: path.join(outDir, "booking-manage-mobile.png"), fullPage: true });
await mobileManageDialog.getByRole("button", { name: "Cancel", exact: true }).click();
await accountPage.getByRole("dialog", { name: "Cancel this lesson?", exact: true }).waitFor();
await accountPage.getByRole("button", { name: "Keep lesson", exact: true }).click();
await mobileManageDialog.getByRole("button", { name: "Change", exact: true }).evaluate((button) => {
  button.addEventListener("click", () => {
    document.documentElement.dataset.qaMobileChangeScrollBefore = String(window.scrollY);
  }, { capture: true, once: true });
});
await mobileManageDialog.getByRole("button", { name: "Change", exact: true }).click();
const mobileChangeDialog = accountPage.getByRole("dialog", { name: "Choose a new date and time", exact: true });
await mobileChangeDialog.waitFor({ state: "visible" });
await mobileManagePanel.getByRole("heading", { name: "Choose a new date and time", exact: true }).waitFor();
await mobileManagePanel.getByRole("radio", { name: "60 minutes", exact: true }).waitFor();
await mobileManagePanel.getByRole("radio", { name: "90 minutes", exact: true }).waitFor();
await waitForOrientation(accountPage);
const mobileChangeLayout = await accountPage.evaluate(() => {
  const workspace = document.querySelector("#lesson-calendar")?.getBoundingClientRect();
  return {
    overlay: Boolean(document.querySelector(".lesson-manage-overlay--reschedule")),
    position: document.querySelector("#lesson-calendar") ? getComputedStyle(document.querySelector("#lesson-calendar")).position : "",
    scrollBefore: Number(document.documentElement.dataset.qaMobileChangeScrollBefore),
    scrollY: window.scrollY,
    left: workspace?.left ?? -Infinity,
    right: workspace?.right ?? Infinity,
    top: workspace?.top ?? -Infinity,
    bottom: workspace?.bottom ?? Infinity,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
});
if (
  !mobileChangeLayout.overlay ||
  mobileChangeLayout.position !== "fixed" ||
  Math.abs(mobileChangeLayout.scrollY - mobileChangeLayout.scrollBefore) > 1 ||
  mobileChangeLayout.left < 8 ||
  mobileChangeLayout.right > mobileChangeLayout.viewportWidth - 8 ||
  mobileChangeLayout.top < 8 ||
  mobileChangeLayout.bottom > mobileChangeLayout.viewportHeight - 8
) {
  throw new Error(`Mobile lesson changing should remain above the dimmed page: ${JSON.stringify(mobileChangeLayout)}.`);
}
await accountPage.screenshot({ path: path.join(outDir, "booking-change-workflow-mobile.png"), fullPage: false });
await mobileManagePanel.getByRole("button", { name: "Back", exact: true }).click();
await mobileManageDialog.waitFor({ state: "visible" });
await mobileManageDialog.getByRole("button", { name: "Close lesson management", exact: true }).click();
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
if (await accountPage.locator("#lesson-calendar .unified-calendar__panel").count()) {
  throw new Error("Closing lesson management should return to the visual calendar without a selected-day panel.");
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-overview-mobile.png"), fullPage: true });
const restoredCalendarWeekCount = await accountPage
  .locator("#lesson-calendar .unified-calendar__grid .calendar-week")
  .count();
if (restoredCalendarWeekCount !== defaultCalendarWeekCount) {
  throw new Error(
    `Returning from lesson management changed the four-week calendar to ${restoredCalendarWeekCount} rows.`
  );
}

await accountPage.locator(".lesson-overview__book").click();
// Booking opens on the same calendar, already filled in.
const bookingBar = accountPage.locator("#lesson-calendar .booking-bar");
await bookingBar.waitFor({ state: "visible" });
await accountPage.screenshot({ path: path.join(outDir, "booking-bar-mobile.png"), fullPage: true });
if (await accountPage.getByRole("radio", { name: "Trial", exact: true }).count()) {
  throw new Error("A student with any non-cancelled booking should not be offered the trial.");
}
if (await accountPage.getByText(/The trial is for a first lesson/i).count()) {
  throw new Error("Trial ineligibility should restore the valid choices without a warning banner.");
}
const kindChoiceCount = await bookingBar.locator("input[name='booking-kind']").count();
if (kindChoiceCount !== 2) throw new Error(`Expected single and weekly choices; found ${kindChoiceCount}.`);
if (!(await accountPage.getByRole("radio", { name: "Single", exact: true }).isChecked())) {
  throw new Error("A returning student should start from a single lesson.");
}
await accountPage.getByRole("radio", { name: "Weekly", exact: true }).check();
if ((await bookingBar.locator(".segmented").count()) !== 4) {
  throw new Error("Weekly booking should add its repeat to the same compact sliders as lesson management.");
}
if (await accountPage.getByText("Choose a time and we'll check every week before you book.", { exact: true }).count()) {
  throw new Error("Weekly booking should not explain a later availability check before a first date exists.");
}
await accountPage.getByRole("radio", { name: "In Porto", exact: true }).check();
if ((await accountPage.locator("input[name='booking-repeat']").count()) !== 4) {
  throw new Error("Recurring booking should offer 4, 6, 8 weeks, or an ongoing repeat.");
}
await accountPage.getByRole("radio", { name: "Ongoing", exact: true }).check();
await accountPage.getByRole("radio", { name: "4 weeks", exact: true }).check();
await accountPage.screenshot({ path: path.join(outDir, "booking-repeat-length-mobile.png"), fullPage: true });
previewHasClash = true;
await accountPage.getByRole("button", { name: /times free/ }).first().click();
await accountPage.locator("#lesson-calendar .unified-calendar__availability .slot-grid button").first().click();
await accountPage.getByRole("heading", { name: "Confirm your recurring lessons", exact: true }).waitFor();
await accountPage.getByText("One lesson time clashes", { exact: false }).waitFor();
if ((await accountPage.locator(".booking-confirmation-stage .booking-skipped li").count()) !== 1) {
  throw new Error("Recurring confirmation should list the exact clashing week before booking.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-recurring-clash-mobile.png"), fullPage: true });
previewHasClash = false;
// The confirmation keeps the same choices above the lesson, changed in place.
const reviewBar = accountPage.locator("#booking-confirmation-stage .booking-bar");
if (
  (await reviewBar.locator(".segmented").count()) !== 4 ||
  (await accountPage.locator(".booking-confirmation-stage .booking-selection-summary").count()) !== 1
) {
  throw new Error("Weekly confirmation should keep its choices in the bar above one lesson row.");
}
const sixWeekPreview = accountPage.waitForRequest(
  (request) => request.url().includes("/bookings/series/preview") && request.method() === "POST" && request.postDataJSON()?.weeks === 6
);
await reviewBar.getByRole("radio", { name: "6 weeks", exact: true }).check();
await sixWeekPreview;
await accountPage.getByRole("heading", { name: "Confirm your recurring lessons", exact: true }).waitFor();
// A single lesson at the same length keeps the chosen time.
await reviewBar.getByRole("radio", { name: "Single", exact: true }).check();
await accountPage.getByRole("heading", { name: "Confirm your lesson", exact: true }).waitFor();
await reviewBar.getByRole("radio", { name: "Online", exact: true }).check();
if ((await reviewBar.locator("input[name='booking-duration']").count()) !== 2) {
  throw new Error("One-off booking should offer 60 and 90 minutes in the compact slider.");
}
await accountPage.screenshot({ path: path.join(outDir, "booking-duration-mobile.png"), fullPage: true });
const lessonSummary = accountPage.locator("#booking-confirmation-stage .booking-selection-stack");
const lessonSummaryLayout = await lessonSummary.locator('[aria-label="Selected lesson"]').evaluate((summary) => {
  const copy = summary.querySelector(".booking-choice-summary__copy")?.getBoundingClientRect();
  const action = summary.querySelector(".booking-choice-summary__change")?.getBoundingClientRect();
  const rectangle = summary.getBoundingClientRect();
  return {
    copyRight: copy?.right ?? 0,
    actionLeft: action?.left ?? Infinity,
    actionRight: action?.right ?? 0,
    summaryRight: rectangle.right
  };
});
if (
  lessonSummaryLayout.actionLeft < lessonSummaryLayout.copyRight - 1 ||
  lessonSummaryLayout.summaryRight - lessonSummaryLayout.actionRight > 18
) {
  throw new Error(`The chosen lesson should keep its change action aligned on the right: ${JSON.stringify(lessonSummaryLayout)}.`);
}
const changeLessonTime = accountPage.getByRole("button", { name: "Change date or time", exact: true });
await changeLessonTime.click();
// On a phone a chosen day's times take the calendar's place; its date and the
// way back to the calendar head the times.
const changeDate = accountPage.getByRole("button", { name: "Change date", exact: true });
await changeDate.waitFor({ state: "visible" });
await changeDate.click();
await accountPage.locator("#lesson-calendar .calendar-week").first().waitFor({ state: "visible" });
const freeDay = accountPage.getByRole("button", { name: /5 times free/ }).first();
await freeDay.waitFor({ state: "visible" });
await freeDay.click();
await changeDate.waitFor({ state: "visible" });
const selectedDateHeadLayout = await accountPage.locator("#booking-next-step .unified-calendar__panel-head").evaluate((head) => {
  const rectangle = head.getBoundingClientRect();
  const action = head.querySelector(".unified-calendar__change-date")?.getBoundingClientRect();
  const date = head.querySelector("h3")?.getBoundingClientRect();
  return {
    actionRight: action?.right ?? 0,
    dateHeight: date?.height ?? 0,
    eyebrows: head.parentElement?.querySelectorAll(":scope > .eyebrow").length ?? -1,
    headRight: rectangle.right,
    height: rectangle.height
  };
});
if (
  selectedDateHeadLayout.height > 60 ||
  selectedDateHeadLayout.dateHeight > 32 ||
  selectedDateHeadLayout.eyebrows !== 0 ||
  selectedDateHeadLayout.headRight - selectedDateHeadLayout.actionRight > 18
) {
  throw new Error(`The chosen date should share one row with Change, with no eyebrow above: ${JSON.stringify(selectedDateHeadLayout)}.`);
}
await waitForOrientation(accountPage);
await accountPage.waitForFunction(
  () => {
    const panel = document.querySelector("#booking-next-step")?.getBoundingClientRect();
    return Boolean(panel && panel.top < window.innerHeight && panel.bottom > 0);
  },
  null,
  { timeout: 2_000 }
);
if (await accountPage.locator("#lesson-calendar .unified-calendar__grid").isVisible()) {
  throw new Error("On a phone, a chosen day's times should take the calendar's place.");
}
// A day with times either side of 14:00 shows one part at a time; each part is
// a small timetable, one row per hour, each start minute in its own column.
const timePicker = accountPage.locator("#lesson-calendar .unified-calendar__availability .time-picker");
const partInputs = timePicker.locator(".time-picker__parts input");
const partCount = await partInputs.count();
const shownTimes = [];
for (let index = 0; index < Math.max(partCount, 1); index++) {
  if (partCount) await partInputs.nth(index).check();
  shownTimes.push(...await timePicker.locator(".slot-grid").evaluate((grid, part) =>
    [...grid.querySelectorAll("button")].map((button) => {
      const box = button.getBoundingClientRect();
      const time = (button.textContent ?? "").trim().slice(0, 5);
      return { part, hour: time.slice(0, 2), minute: time.slice(3, 5), top: Math.round(box.top), left: Math.round(box.left), height: box.height };
    }), index));
}
const timesShareHourRows = shownTimes.every((a) => shownTimes.every((b) =>
  a.part !== b.part || (a.hour === b.hour) === (Math.abs(a.top - b.top) <= 1)));
const timesShareMinuteColumns = shownTimes.every((a) => shownTimes.every((b) => a.minute !== b.minute || Math.abs(a.left - b.left) <= 1));
const headingCount = await timePicker.evaluate((picker) => picker.parentElement?.querySelectorAll("h3, h4").length ?? -1);
if (
  shownTimes.length !== 5 ||
  shownTimes.some((time) => (time.hour < "14") !== (partCount < 2 ? shownTimes[0].hour < "14" : time.part === 0)) ||
  headingCount !== 0 ||
  shownTimes.some((time) => time.height < 44 || time.height > 54) ||
  !timesShareHourRows ||
  !timesShareMinuteColumns
) {
  throw new Error(`A free day's times should split at 14:00, each part a small timetable: ${JSON.stringify({ partCount, shownTimes })}.`);
}
if (partCount) await partInputs.first().check();
if (
  (await accountPage.getByText("No lesson booked on this day.", { exact: true }).count()) ||
  (await accountPage.getByText(/Free for a single lesson/i).count())
) {
  throw new Error("A free day should go straight to its available times without redundant booking-status copy.");
}
const nextStepOrientation = await accountPage.evaluate(() => {
  const panel = document.querySelector("#booking-next-step")?.getBoundingClientRect();
  return { top: panel?.top ?? Infinity, bottom: panel?.bottom ?? -Infinity, viewportHeight: window.innerHeight };
});
if (
  nextStepOrientation.top < 0 ||
  nextStepOrientation.top >= nextStepOrientation.viewportHeight ||
  nextStepOrientation.bottom <= 0
) {
  throw new Error(`Choosing a day should reveal the available times: ${JSON.stringify(nextStepOrientation)}.`);
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-calendar-free-day-mobile.png"), fullPage: true });

await changeDate.click();
await accountPage.locator("#lesson-calendar .calendar-week").first().waitFor({ state: "visible" });
if (
  (await accountPage.locator("#lesson-calendar .calendar-week").count()) !== 4 ||
  !(await accountPage.locator(`#lesson-calendar [data-date-key="${qaFreeDate}"]`).count())
) {
  throw new Error("Change date should restore the four weeks that held the chosen date.");
}
await accountPage.getByRole("button", { name: /5 times free/ }).first().click();
await changeDate.waitFor({ state: "visible" });
await waitForOrientation(accountPage);

await accountPage
  .locator("#lesson-calendar .unified-calendar__availability .slot-grid button")
  .first()
  .click();
const confirmHeading = accountPage.getByRole("heading", { name: "Confirm your lesson", exact: true });
await confirmHeading.waitFor({ state: "visible" });
await accountPage.waitForFunction(
  () => {
    const stage = document.querySelector("#booking-confirmation-stage")?.getBoundingClientRect();
    return Boolean(stage && stage.top < window.innerHeight && stage.bottom > 0);
  },
  null,
  { timeout: 2_000 }
);
const confirmOrientation = await accountPage.locator("#booking-confirmation-stage").evaluate((stage) => {
  const rectangle = stage.getBoundingClientRect();
  return { top: rectangle.top, bottom: rectangle.bottom, viewportHeight: window.innerHeight };
});
await accountMenuButton.waitFor({ state: "visible" });
await accountMenuButton.click();
const confirmationAccountMenu = accountPanel.locator("#account-menu");
await confirmationAccountMenu.getByRole("button", { name: /Past lessons/ }).waitFor();
await accountMenuButton.click();
await confirmationAccountMenu.waitFor({ state: "hidden" });
const bookingNotes = accountPage.locator(".student-details-form textarea");
await bookingNotes.click();
const bookingNotesFocus = await bookingNotes.evaluate((textarea) => {
  const style = getComputedStyle(textarea);
  return {
    borderColor: style.borderTopColor,
    borderWidth: style.borderTopWidth,
    boxShadow: style.boxShadow,
    outlineStyle: style.outlineStyle
  };
});
if (
  bookingNotesFocus.borderColor !== "rgb(32, 62, 130)" ||
  bookingNotesFocus.borderWidth !== "2px" ||
  bookingNotesFocus.boxShadow !== "none" ||
  bookingNotesFocus.outlineStyle !== "none"
) {
  throw new Error(`The booking notes textarea should use one blue focus border: ${JSON.stringify(bookingNotesFocus)}.`);
}
for (const duplicateIdentity of ["Signed in as", "Booking as", "Not you?"]) {
  if (await accountPage.getByText(duplicateIdentity, { exact: false }).count()) {
    throw new Error(`Confirmation still repeats the account identity as “${duplicateIdentity}”.`);
  }
}
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("Choosing a time should collapse the calendar before the confirmation step.");
}
if ((await accountPage.locator(".booking-bar").count()) !== 1) {
  throw new Error("The confirmation should carry the one choices bar, not a second copy.");
}
if (confirmOrientation.top >= confirmOrientation.viewportHeight || confirmOrientation.bottom <= 0) {
  throw new Error("Choosing a time did not bring the unified booking review into the mobile viewport.");
}
await waitForOrientation(accountPage);
await accountPage.screenshot({ path: path.join(outDir, "booking-confirm-mobile.png"), fullPage: true });
await accountPage.setViewportSize({ width: 1440, height: 1000 });
await accountPage.waitForTimeout(200);
await accountPage.screenshot({ path: path.join(outDir, "booking-confirm-desktop.png"), fullPage: true });
const desktopConfirmationLayout = await accountPage.locator("#booking-confirmation-stage").evaluate((stage) => {
  const summary = stage.querySelector(".booking-confirmation-summary")?.getBoundingClientRect();
  const main = stage.querySelector(".booking-confirmation-main")?.getBoundingClientRect();
  const cards = [...stage.querySelectorAll(".booking-selection-summary")].map((card) => card.getBoundingClientRect());
  return {
    cardWidths: cards.map((card) => card.width),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    sideBySide: Boolean(summary && main && main.left >= summary.right && Math.abs(main.top - summary.top) < 2)
  };
});
if (
  desktopConfirmationLayout.scrollWidth !== desktopConfirmationLayout.clientWidth ||
  desktopConfirmationLayout.cardWidths.some((width) => width < 600) ||
  !desktopConfirmationLayout.sideBySide
) {
  throw new Error(`The desktop confirmation should set the lesson beside the details without overflow: ${JSON.stringify(desktopConfirmationLayout)}.`);
}
await accountPage.setViewportSize({ width: 390, height: 844 });
const confirmationChoices = accountPage.locator(".booking-confirmation-stage .booking-selection-summary");
if ((await confirmationChoices.count()) !== 1) {
  throw new Error(`One-off confirmation should show one editable lesson row; found ${await confirmationChoices.count()}.`);
}
if (await accountPage.locator(".booking-recap").count()) {
  throw new Error("Confirmation should use the selected-choice rows themselves, not a second recap card.");
}
const selectedLessonTitle = await accountPage
  .locator('.booking-confirmation-stage [aria-label="Selected lesson"] strong')
  .innerText();
if (!selectedLessonTitle.includes("2026")) {
  throw new Error(`The selected date should remain visible in the unified review: ${selectedLessonTitle}.`);
}

if (await accountPage.locator(".booking-location-choice").count()) {
  throw new Error("Confirmation should not repeat the location selector beneath the recap.");
}
await reviewBar.getByRole("radio", { name: "In Porto", exact: true }).check();
await confirmHeading.waitFor();
if (!(await reviewBar.getByRole("radio", { name: "In Porto", exact: true }).isChecked())) {
  throw new Error("Changing location on the confirmation should apply in place.");
}
await reviewBar.getByRole("radio", { name: "Online", exact: true }).check();
if (!(await reviewBar.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).isChecked())) {
  throw new Error("The confirmation should retain the chosen length.");
}
// A longer lesson that still fits keeps the chosen time.
await reviewBar.getByRole("radio", { name: "90 minutes lesson · €35", exact: true }).check();
await accountPage.waitForFunction(() => document.querySelector(".booking-confirm-button")?.disabled === false, null, { timeout: 5_000 });
if (await accountPage.locator("#lesson-calendar").count()) {
  throw new Error("A longer lesson that still fits should keep the chosen time on the confirmation.");
}
if ((await accountPage.locator('.booking-confirmation-stage [aria-label="Selected lesson"] strong').innerText()) !== selectedLessonTitle) {
  throw new Error("Changing the length should keep the chosen date and time.");
}
await changeLessonTime.click();
await changeDate.waitFor({ state: "visible" });
await accountPage.locator("#lesson-calendar .unified-calendar__availability .slot-grid button").first().click();
await confirmHeading.waitFor();
await changeLessonTime.click();
await accountPage.getByRole("button", { name: "Your lessons", exact: true }).click();
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
await bookQaLessonAndReturnToUpcoming({ recurring: false });
await bookQaLessonAndReturnToUpcoming({ recurring: true });
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
// A weekly run is managed from any one of its lessons.
const nextLessonOpen = accountPage.locator(".lesson-overview__next-open");
const seriesLessonDialog = accountPage.getByRole("dialog", { name: "Manage this lesson", exact: true });
await nextLessonOpen.click();
await seriesLessonDialog.getByRole("button", { name: "Manage sequence", exact: true }).click();
const sequenceDialog = accountPage.locator(".lesson-manage-dialog");
await sequenceDialog.getByRole("heading", { name: "Manage recurring lesson", exact: true }).waitFor();
if (await sequenceDialog.getByText(/Choose whether to keep/i).count()) {
  throw new Error("The recurrence actions should not repeat what their button labels already explain.");
}
const moveRecurrence = sequenceDialog.getByRole("button", { name: "Move recurrence", exact: true });
const stopRepeating = sequenceDialog.getByRole("button", { name: "Stop repeating", exact: true });
const cancelAllBooked = sequenceDialog.getByRole("button", { name: "Cancel all booked lessons", exact: true });
await cancelAllBooked.waitFor();
await moveRecurrence.click();
const moveRecurrenceDialog = accountPage.getByRole("dialog", { name: "Choose a new weekly day and time", exact: true });
await moveRecurrenceDialog.waitFor({ state: "visible" });
if ((await moveRecurrenceDialog.locator(".segmented").count()) !== 2) {
  throw new Error("Moving a recurrence should retain the compact length and location sliders.");
}
await moveRecurrenceDialog.getByText(/Currently repeats from/i).waitFor();
await moveRecurrenceDialog.getByRole("button", { name: "Back", exact: true }).click();
await sequenceDialog.getByRole("heading", { name: "Manage recurring lesson", exact: true }).waitFor();
await stopRepeating.click();
if (stopRepeatPayloads.length !== 0) throw new Error("Opening the repeat confirmation called the stop endpoint.");
await sequenceDialog.getByText("Your booked lessons will stay.", { exact: false }).waitFor();
await sequenceDialog.getByRole("button", { name: "Keep repeating", exact: true }).click();
if (stopRepeatPayloads.length !== 0) throw new Error("Keeping the repeat called the stop endpoint.");

await stopRepeating.click();
await sequenceDialog.getByRole("button", { name: "Yes, stop repeating", exact: true }).click();
await sequenceDialog.getByText("This sequence has stopped. The lessons already booked stay in your calendar.", { exact: true }).waitFor();
if (stopRepeatPayloads.length !== 1 || stopRepeatPayloads[0].cancelRemaining !== false) {
  throw new Error(`Expected one confirmed stop-and-keep request; received ${JSON.stringify(stopRepeatPayloads)}.`);
}
await sequenceDialog.getByRole("button", { name: "Done", exact: true }).click();
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
// A stopped run leaves its booked dates on the calendar as ordinary lessons.
try {
  await accountPage.waitForFunction(
    () =>
      !document.querySelector("#lesson-calendar .calendar-booking-times .is-weekly, #lesson-calendar .has-weekly-booking") &&
      !(document.querySelector("#lesson-calendar .unified-calendar__legend")?.textContent ?? "").includes("Weekly lesson"),
    null,
    { timeout: 10_000 }
  );
} catch {
  throw new Error("A stopped sequence should no longer appear as weekly lessons.");
}
if (
  !(await qaStartDay.evaluate((day) => day.classList.contains("has-booking"))) ||
  ((await accountPage.locator(".lesson-overview__next").textContent()) ?? "").includes("Weekly")
) {
  throw new Error("Every retained date from a stopped sequence should stay on the calendar as its own lesson.");
}
try {
  await accountPage.waitForFunction(
    () => /12$/.test(document.querySelector("#account-menu button")?.textContent?.trim() ?? ""),
    null,
    { timeout: 10_000 }
  );
} catch {
  throw new Error("View lessons should count each retained date of a stopped sequence on its own.");
}

// Restore the synthetic active series so the separate bulk-cancellation path
// can still be exercised without creating a second mock student.
repeatStopped = false;
stopRepeatPayloads.length = 0;
await accountPage.goto(`${base}/book/`, { waitUntil: "domcontentloaded" });
await accountPanel.waitFor({ state: "visible" });
await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "visible" });
await nextLessonOpen.click();
await seriesLessonDialog.getByRole("button", { name: "Manage sequence", exact: true }).click();
await sequenceDialog.getByRole("heading", { name: "Manage recurring lesson", exact: true }).waitFor();
const restoredCancelAllBooked = sequenceDialog.getByRole("button", { name: "Cancel all booked lessons", exact: true });

await restoredCancelAllBooked.click();
if (stopRepeatPayloads.length !== 0) throw new Error("Opening the bulk cancellation confirmation called the stop endpoint.");
await sequenceDialog.getByText("Any paid lesson that can still be cancelled is refunded automatically.", { exact: false }).waitFor();
await waitForOrientation(accountPage);
await accountPage.screenshot({
  path: path.join(outDir, "booking-sequence-cancel-confirm-mobile.png"),
  fullPage: true
});
const sequenceConfirmationLayout = await accountPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  panelWidth: document.querySelector(".lesson-manage-dialog")?.getBoundingClientRect().width ?? 0,
  contentWidth: document.querySelector(".lesson-manage-dialog")?.scrollWidth ?? Infinity
}));
if (
  sequenceConfirmationLayout.scrollWidth > sequenceConfirmationLayout.clientWidth + 1 ||
  sequenceConfirmationLayout.contentWidth > sequenceConfirmationLayout.panelWidth + 1
) {
  throw new Error(`Recurring sequence cancellation should not clip or overflow: ${JSON.stringify(sequenceConfirmationLayout)}.`);
}
await sequenceDialog.getByRole("button", { name: "Keep booked lessons", exact: true }).click();
if (stopRepeatPayloads.length !== 0) throw new Error("Keeping booked lessons called the stop endpoint.");
await restoredCancelAllBooked.click();
await sequenceDialog.getByRole("button", { name: "Yes, cancel all", exact: true }).click();
await restoredCancelAllBooked.waitFor({ state: "hidden" });
if (stopRepeatPayloads.length !== 1 || stopRepeatPayloads[0].cancelRemaining !== true) {
  throw new Error(`Expected one confirmed bulk cancellation request; received ${JSON.stringify(stopRepeatPayloads)}.`);
}
await sequenceDialog.getByText("4 lessons were cancelled.", { exact: false }).waitFor();
await sequenceDialog.getByRole("button", { name: "Done", exact: true }).click();

// Reading the terms must never accept them or discard an unfinished booking.
qaPostpay = true;
await accountPage.goto(`${base}/book/?view=book`, { waitUntil: "domcontentloaded" });
await accountPage.getByRole("radio", { name: "Single", exact: true }).check();
await accountPage.getByRole("radio", { name: "60 minutes lesson · €25", exact: true }).check();
await accountPage.getByRole("button", { name: /times free/ }).first().click();
await accountPage.locator("#lesson-calendar .slot-grid button").first().click();
const agreement = accountPage.getByRole("button", { name: "Agree to terms & privacy", exact: true });
const agreementTerms = accountPage.locator(".booking-agreement__control a");
const submitBooking = accountPage.getByRole("button", { name: "Book lesson & agree to pay", exact: true });
await agreement.waitFor();
await accountPage.locator(".student-details-form textarea").fill("Keep this note while I read the terms.");
const choicesBeforeTerms = JSON.stringify(await accountPage.locator(".booking-selection-stack strong").allTextContents());
for (const width of [390, 1440, 320]) {
  await accountPage.setViewportSize({ width, height: 844 });
  if (await agreement.getAttribute("aria-pressed") !== "false" || await submitBooking.isEnabled()) {
    throw new Error("A new booking must require an explicit agreement before it can be submitted.");
  }
  await checkTermsDialog(accountPage, agreementTerms);
  if (
    await agreement.getAttribute("aria-pressed") !== "false" ||
    await submitBooking.isEnabled() ||
    await accountPage.locator(".student-details-form textarea").inputValue() !== "Keep this note while I read the terms." ||
    JSON.stringify(await accountPage.locator(".booking-selection-stack strong").allTextContents()) !== choicesBeforeTerms
  ) throw new Error("Reading the terms changed agreement, notes or booking choices.");
  await agreement.press("Space");
  if (await agreement.getAttribute("aria-pressed") !== "true" || !await submitBooking.isEnabled()) {
    throw new Error("The agreement must support keyboard selection.");
  }
  await checkTermsDialog(accountPage, agreementTerms);
  if (await agreement.getAttribute("aria-pressed") !== "true") throw new Error("Reading the terms cleared an existing agreement.");
  await agreement.press("Space");
}
await accountPage.setViewportSize({ width: 390, height: 844 });

for (const width of [1440, 390]) {
  await accountPage.setViewportSize({ width, height: 844 });
  await accountPage.goto(`${base}/book/?view=lessons`, { waitUntil: "domcontentloaded" });
  const freeDateCell = accountPage.locator(`#lesson-calendar [data-date-key="${qaFreeDate}"]`);
  await freeDateCell.waitFor();
  if (await accountPage.locator(".calendar-week").getByText("Book", { exact: true }).count()) {
    throw new Error("The overview must keep plain dates without separate Book labels.");
  }
  // A free day goes straight to booking on that day, with no question first.
  await freeDateCell.focus();
  await freeDateCell.press("Enter");
  await accountPage.locator("#upcoming-lessons-heading").waitFor({ state: "detached" });
  await accountPage.locator("#lesson-calendar .booking-bar").waitFor();
  await accountPage.locator("#lesson-calendar .slot-grid button").first().waitFor();
  if (await accountPage.getByRole("dialog", { name: "Do you want to book?", exact: true }).count()) {
    throw new Error("A free day should open its times without asking first.");
  }
  if (!await accountPage.locator("#booking-next-step .unified-calendar__panel-head h3").innerText().then((text) => text.includes(String(qaFreeStart.getUTCDate())))) {
    throw new Error("Booking from the overview lost the chosen date.");
  }
  await accountPage.locator("#lesson-calendar .slot-grid button").first().click();
  await accountPage.getByRole("heading", { name: "Confirm your lesson", exact: true }).waitFor();

  await accountPage.goto(`${base}/book/?view=lessons`, { waitUntil: "domcontentloaded" });
  // Pick a day after the available fixture: earlier empty weeks are deliberately
  // omitted once a lesson type is selected.
  const emptyDateKey = new Date(qaFreeStart.getTime() + 24 * 60 * 60_000).toISOString().slice(0, 10);
  const emptyDateButton = accountPage.locator(`#lesson-calendar .can-start-booking:not(.has-booking)[data-date-key="${emptyDateKey}"]`);
  await emptyDateButton.click();
  await accountPage.getByText("No free times on this day.", { exact: true }).waitFor();
  // Beside the times on a wide screen; behind Change date on a phone.
  if (width < 700) await accountPage.getByRole("button", { name: "Change date", exact: true }).click();
  const unavailableDate = accountPage.locator(`#lesson-calendar [data-date-key="${emptyDateKey}"]`);
  await unavailableDate.waitFor({ state: "visible" });
  if (await unavailableDate.isEnabled()) throw new Error("The actual availability check must keep a full day unavailable.");
}
await accountPage.setViewportSize({ width: 390, height: 844 });

await accountMenuButton.click();
await accountPanel.getByRole("button", { name: "Sign out", exact: true }).click();
await accountPage.locator("#lesson-calendar .booking-bar__sign-in").waitFor();
await accountPanel.waitFor({ state: "detached" });
await accountPage.close();
await accountBrowser.close();

// Old emailed links remain valid, but now land in the same booking workspace.
const legacyBrowser = await chromium.launch({ headless: true });
const legacyPage = await legacyBrowser.newPage({ viewport: { width: 390, height: 844 } });
await legacyPage.goto(`${base}/booking`, { waitUntil: "domcontentloaded" });
await legacyPage.waitForSelector("#lesson-calendar .booking-bar", { timeout: 10_000 });
await legacyPage.waitForFunction(() => window.location.pathname === "/book/", null, { timeout: 10_000 });
if (new URL(legacyPage.url()).pathname !== "/book/") {
  throw new Error(`The legacy management route did not normalise to /book/: ${legacyPage.url()}`);
}
for (const fragment of ["terms-privacy", "privacy", "booking", "change-booking"]) {
  await legacyPage.goto(`${base}/book/#${fragment}`, { waitUntil: "domcontentloaded" });
  await legacyPage.getByRole("dialog", { name: "Terms & privacy", exact: true }).waitFor();
  await legacyPage.getByRole("button", { name: "Close terms & privacy", exact: true }).click();
  await legacyPage.waitForFunction(() => !window.location.hash);
}
await legacyPage.close();
await legacyBrowser.close();

await browser.close();

const fatalLogs = logs.filter((entry) => !entry.includes("Failed to load resource"));

if (fatalLogs.length) {
  throw new Error(`Browser errors were recorded:\n${fatalLogs.join("\n")}`);
}

console.log(
  JSON.stringify(
    {
      base,
      results,
      bookingCalendar,
      bookingPlaceholder,
      unifiedBookingLinks: 2,
      accountControls: {
        desktopLayout: desktopAccountLayout,
        mobileLayout: mobileAccountLayout,
        calendarRange: {
          defaultWeekCount: defaultCalendarWeekCount,
          overviewWeekCountAfterSelection: compactCalendarWeekCount,
          lessonPromptPlacement: bookedDayOrientation,
          availableTimeCount: shownTimes.length
        },
        stopRepeatCalls: stopRepeatPayloads.length,
        stopRepeatPayloads,
        accountRequestMethods,
        signedOut: true
      },
      mobileNavigation,
      reducedRouteMotion,
      localBookingMotion,
      bookingTransitionSeen,
      externalResourceWarnings: logs.filter((entry) => entry.includes("Failed to load resource")),
      screenshots: outDir
    },
    null,
    2
  )
);

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`Missing ${label}: ${expected}`);
  }
}

async function checkTermsDialog(targetPage, opener) {
  await targetPage.locator('#terms-privacy[data-ready="true"]').waitFor({ state: "attached" });
  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  await waitForOrientation(targetPage);
  const before = await targetPage.evaluate(() => ({ url: location.href, scrollY, overflow: document.body.style.overflow }));
  await opener.press("Enter");
  const dialog = targetPage.getByRole("dialog", { name: "Terms & privacy", exact: true });
  await dialog.waitFor();
  const layout = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
      noOverflow: element.scrollWidth <= element.clientWidth,
      modal: element.matches(":modal"),
      focused: element.contains(document.activeElement)
    };
  });
  if (!layout.fits || !layout.noOverflow || !layout.modal || !layout.focused) {
    throw new Error(`Terms must open as a focused modal within the viewport: ${JSON.stringify(layout)}.`);
  }
  await dialog.getByRole("link", { name: "CNPD", exact: true }).focus();
  await targetPage.keyboard.press("Tab");
  if (!await dialog.evaluate((element) => element.contains(document.activeElement))) {
    throw new Error("Keyboard focus escaped the terms overlay.");
  }
  await targetPage.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const after = await targetPage.evaluate(() => ({ url: location.href, scrollY, overflow: document.body.style.overflow }));
  if (before.url !== after.url || Math.abs(before.scrollY - after.scrollY) > 1 || before.overflow !== after.overflow ||
      !await opener.evaluate((element) => document.activeElement === element)) {
    throw new Error(`Closing terms must restore the current page and focus: ${JSON.stringify({ before, after })}.`);
  }
  await opener.click();
  await dialog.waitFor();
  await targetPage.mouse.click(2, 2);
  await dialog.waitFor({ state: "hidden" });
}

async function waitForOrientation(targetPage) {
  await targetPage.waitForFunction(
    () =>
      !document.documentElement.classList.contains("booking-transitioning"),
    null,
    { timeout: 2_000 }
  );
  await targetPage.evaluate(
    () =>
      new Promise((resolve) => {
        let previousY = window.scrollY;
        let stableFrames = 0;
        let frames = 0;
        const check = () => {
          const currentY = window.scrollY;
          stableFrames = Math.abs(currentY - previousY) < 0.5 ? stableFrames + 1 : 0;
          previousY = currentY;
          frames += 1;
          if (stableFrames >= 4 || frames >= 120) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      })
  );
}
