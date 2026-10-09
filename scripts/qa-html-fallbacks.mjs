import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";

// Public HTML and isolated GET fixtures only. No booking, account or provider
// mutations: the fallback keeps navigation, FAQs and legal information usable.
const base = (process.env.QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const engine = process.env.QA_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) throw new Error(`Unknown QA_BROWSER: ${engine}`);
const browser = await browserType.launch({ headless: true });
const out = "tmp/qa/html-fallbacks";
await mkdir(out, { recursive: true });
// /404.html is the document the host serves for any missing address.
const pages = ["/", "/approach/", "/lessons/", "/faq/", "/book/", "/404.html"];
const errors = [], writes = [];

try {
  for (const width of [320, 390, 820, 1440]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 950 }, reducedMotion: "reduce" });
    await context.route("**/*", route => {
      if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
        writes.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      for (const path of pages) {
        const response = await page.goto(`${base}${path}`);
        assert.equal(response.status(), 200);
        const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
        for (const name of ["Approach", "Lessons", "FAQ", "Booking"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeHidden();
        await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
        const pageWidth = await page.locator("html").evaluate(element => element.scrollWidth);
        assert.ok(pageWidth <= width + 1, `HTML fallback overflows at ${width}px on ${path}`);
        if (path === "/book/") {
          await expect(page.locator(".policy-information-fallback")).toBeVisible();
          await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toHaveCount(1);
        } else await expect(page.locator(".policy-information-fallback")).toBeHidden();
        if (path === "/404.html") {
          await expect(page.getByRole("heading", { level: 1, name: "This page could not be found.", exact: true })).toBeVisible();
          await expect(page.getByRole("contentinfo")).toBeVisible();
        }
      }

      await page.goto(`${base}/faq/#faq-payment`);
      await expect(page.locator(".faq-group:visible")).toHaveCount(7);
      for (const section of await page.locator(".faq-group").all()) {
        const firstQuestion = section.locator("details").first();
        const summary = firstQuestion.locator("summary");
        await summary.focus();
        if (await firstQuestion.getAttribute("open") !== null) await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await expect(firstQuestion).toHaveAttribute("open", "");
        await expect(firstQuestion.locator(".faq-row__answer")).toBeVisible();
      }
      await page.locator(".faq-index").getByRole("link", { name: /Changing a lesson/ }).click();
      assert.equal(new URL(page.url()).hash, "#faq-rescheduling");
      await expect(page.locator("#faq-rescheduling")).toBeInViewport();

      await page.locator(".site-footer__legal a").click();
      await expect(page.locator(".policy-information-fallback > h2")).toBeInViewport();
      for (const [path, hash] of [["/privacy/", "privacy"], ["/booking-terms/", "booking"], ["/terms/", "terms-privacy"]]) {
        await page.goto(`${base}${path}`);
        await page.getByRole("link", { name: "Read the booking and privacy information" }).click();
        assert.equal(new URL(page.url()).hash, `#${hash}`);
        await expect(page.locator(`#${hash}`)).toBeInViewport();
      }
      if (engine === "chromium" && [390, 1440].includes(width)) {
        await page.screenshot({ path: `${out}/terms-${width}.png`, fullPage: true });
        await page.goto(`${base}/`);
        await page.screenshot({ path: `${out}/home-${width}.png`, fullPage: true });
      }
    } finally { await context.close(); }
  }

  // Hydration still enhances the same documents: one FAQ category and a
  // modal disclosure, with no exposed fallback or duplicate policy IDs.
  const context = await browser.newContext({ viewport: { width: 390, height: 950 } });
  await context.route(url => /^\/(lesson-types|availability)$/.test(url.pathname), route => route.fulfill({ json: new URL(route.request().url()).pathname === "/lesson-types" ? { lessonTypes: [], postpay: false } : { slotsByDate: {}, horizonDays: 84 } }));
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/faq/#faq-payment`);
    await expect(page.locator(".faq-index")).toHaveAttribute("data-ready", "true");
    await expect(page.locator(".faq-group:visible")).toHaveCount(1);
    await expect(page.locator("#faq-payment")).toBeVisible();
    await expect(page.locator(".policy-information-fallback")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.goto(`${base}/book/#privacy`);
    const dialog = page.getByRole("dialog", { name: "Terms & privacy", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#terms-privacy, #privacy")).toHaveCount(2);
    await page.getByRole("button", { name: "Close terms & privacy", exact: true }).click();
    await expect(dialog).toBeHidden();
    assert.equal(new URL(page.url()).hash, "");
    await expect(page.locator(".policy-information-fallback")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  } finally { await context.close(); }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(`HTML fallbacks passed in ${engine} at 320/390/820/1440px: five public pages and the missing-page document, navigation, all FAQ categories, terms/privacy and legacy links; hydrated FAQ and modal behavior preserved.`);
} finally { await browser.close(); }
