import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const failures = [];

const check = (condition, message) => {
  process.stdout.write(`  ${condition ? "ok" : "FAIL"} ${message}\n`);
  if (!condition) failures.push(message);
};

// The release already serves the export. A standalone run starts the same
// server on a free port and reads its address once the listener is ready.
let origin = process.env.QA_BASE_URL;
let server;
if (!origin) {
  server = spawn("python3", [fileURLToPath(new URL("./serve-qa.py", import.meta.url)), "0"], { stdio: ["ignore", "pipe", "ignore"] });
  process.on("exit", () => server.kill());
  const [address] = await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => { throw new Error("QA server failed to start. Build the site first."); })
  ]);
  origin = address.toString().trim();
}
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const state = () => page.evaluate(() => {
  const rect = (selector) => {
    const box = document.querySelector(selector).getBoundingClientRect();
    return {
      bottom: box.bottom,
      height: box.height,
      left: box.left,
      right: box.right,
      top: box.top,
      width: box.width
    };
  };

  const banner = document.querySelector(".akibwa-project-banner");
  const rule = getComputedStyle(banner, "::after");
  return {
    banner: rect(".akibwa-project-banner"),
    bannerDisplay: getComputedStyle(banner).display,
    bannerPosition: getComputedStyle(banner).position,
    flag: document.documentElement.getAttribute("data-akibwa-project"),
    names: [...banner.querySelectorAll(".akibwa-project-banner__name")].map((item) => item.textContent.trim()),
    nameAnimations: [...banner.querySelectorAll(".akibwa-project-banner__name")].map((item) => getComputedStyle(item).animationName),
    lede: document.querySelector(".akibwa-project-banner__lede")?.textContent.trim(),
    ledeDisplay: getComputedStyle(document.querySelector(".akibwa-project-banner__lede")).display,
    nav: [...banner.querySelectorAll(".akibwa-project-banner__nav a")].map((item) => ({
      text: item.textContent.trim(), href: item.href
    })),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ruleHeight: parseFloat(rule.height),
    ruleWidth: parseFloat(rule.width),
    siteHeader: rect(".site-header")
  };
});

try {
  process.stdout.write("\n■ standalone site\n");
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-header");
  let current = await state();
  check(current.bannerDisplay === "none", "a direct visit does not show the Akibwa masthead");
  check(current.siteHeader.top === 0, "the Portuguese header retains its normal top edge");

  process.stdout.write("\n■ portfolio entry\n");
  await page.goto(`${origin}/?from=akibwa`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('html[data-akibwa-project="true"] .akibwa-project-banner');
  current = await state();
  check(current.flag === "true", "the Akibwa entry flag activates before the page settles");
  check(current.bannerPosition === "sticky", "the portfolio masthead stays pinned while the destination scrolls");
  check(current.names.join(" / ") === "Daniel / Akibwa", `the masthead keeps both identity states [${current.names.join(" / ")}]`);
  check(current.nameAnimations.every((name) => name !== "none"), "the portfolio masthead keeps the homepage identity flick");
  check(current.lede === "Building in the age of AI.", "the masthead keeps the exact portfolio proposition");
  check(
    current.nav.map((item) => `${item.text}:${item.href}`).join(" / ") ===
      "Home:https://akibwa.com/ / Projects:https://akibwa.com/#projects / Career:https://akibwa.com/#career / Taste Library:https://akibwa.com/#taste",
    `Home and the three homepage routes remain available [${current.nav.map((item) => item.text).join(" / ")}]`
  );
  check(
    current.ruleHeight === 4 && Math.abs(current.ruleWidth - current.banner.width) <= 1,
    `the green boundary spans the complete viewport [${current.ruleWidth.toFixed(1)}×${current.ruleHeight.toFixed(1)}px]`
  );
  check(
    Math.abs(current.banner.bottom - current.siteHeader.top) <= 1,
    "the real Portuguese site begins immediately below the green boundary"
  );
  check(current.overflow <= 1, `the desktop entry has no horizontal overflow [${current.overflow}px]`);

  process.stdout.write("\n■ internal navigation\n");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Lessons", exact: true })
    .click();
  await page.waitForURL(`${origin}/lessons/`);
  current = await state();
  check(current.bannerDisplay === "block", "the masthead persists through Portuguese navigation");
  check(current.siteHeader.top === current.banner.bottom, "the destination still begins below the masthead");

  await page.evaluate(() => scrollTo(0, Math.min(600, document.documentElement.scrollHeight - innerHeight)));
  current = await state();
  check(Math.abs(current.banner.top) <= 1, "the masthead remains pinned after desktop scrolling");

  await page.evaluate(() => {
    document.querySelector('.akibwa-project-banner__nav a[href="https://akibwa.com/"]').addEventListener(
      "click",
      (event) => event.preventDefault(),
      { once: true }
    );
  });
  await page.locator('.akibwa-project-banner__nav a[href="https://akibwa.com/"]').click();
  const stored = await page.evaluate(() => sessionStorage.getItem("akibwa-project-view"));
  check(stored === null, "leaving through Home clears the tab's portfolio state");

  process.stdout.write("\n■ phone composition\n");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?from=akibwa`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('html[data-akibwa-project="true"] .akibwa-project-banner');
  current = await state();
  check(current.banner.height <= 134, `the phone masthead stays compact [${current.banner.height.toFixed(1)}px]`);
  check(
    current.nav.map((item) => item.text).join(" / ") === "Home / Projects / Career / Taste Library",
    "the phone masthead keeps the complete homepage navigation"
  );
  check(current.siteHeader.top === current.banner.bottom, "the phone site starts below the green boundary");
  check(current.overflow <= 1, `the phone entry has no horizontal overflow [${current.overflow}px]`);

  await page.evaluate(() => scrollTo(0, Math.min(500, document.documentElement.scrollHeight - innerHeight)));
  current = await state();
  check(Math.abs(current.banner.top) <= 1, "the masthead remains pinned after phone scrolling");

  process.stdout.write("\n■ short landscape composition\n");
  await page.setViewportSize({ width: 872, height: 525 });
  await page.goto(`${origin}/?from=akibwa`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('html[data-akibwa-project="true"] .akibwa-project-banner');
  current = await state();
  check(current.banner.height <= 60, `the landscape masthead stays compact [${current.banner.height.toFixed(1)}px]`);
  check(current.ledeDisplay !== "none" && current.lede === "Building in the age of AI.",
    "the landscape masthead keeps the portfolio proposition visible");
  check(current.siteHeader.top === current.banner.bottom, "the landscape site starts below the green boundary");
  check(current.overflow <= 1, `the landscape entry has no horizontal overflow [${current.overflow}px]`);

  if (process.env.PORTFOLIO_SCREENSHOT) {
    await page.screenshot({ path: process.env.PORTFOLIO_SCREENSHOT, fullPage: false });
  }
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} portfolio banner check(s) failed.`);
  process.exit(1);
}

console.log("\nPortuguese portfolio banner checks passed.");
