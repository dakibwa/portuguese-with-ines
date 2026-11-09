// Draws the PNG icons, the maskable icon and the shared-link picture from ../logo/icon.svg and lockup.svg.
// Run gen-logos.mjs first, then, from the repository root:
//   node docs/platform/brand/draft/tools/render-pngs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const L = path.join(here, "..", "logo");
const C = { tile: "#0E6B4C", paper: "#F5F7F4", rule: "#D3DCD5", margin: "#E06A5B" };
const icon = fs.readFileSync(path.join(L, "icon.svg"), "utf8");
const lockup = fs.readFileSync(path.join(L, "lockup.svg"), "utf8");

// Full bleed for the iPhone, which rounds the icon itself.
const bleed = icon.replace('rx="112"', 'rx="0"');
// Maskable: full-bleed green, the drawing inside Android's 80% safe zone.
const inner = icon.replace(/<rect[^>]*\/>/, "").replace(/<svg[^>]*>/, "").replace("</svg>", "");
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${C.tile}"/><g transform="translate(51.2 51.2) scale(0.8)">${inner}</g></svg>\n`;
fs.writeFileSync(path.join(L, "icon-maskable.svg"), maskable);

// The shared-link picture, 1200 x 630: a ruled exercise-book page with its red margin line and the lockup.
const share = `<div style="width:1200px;height:630px;position:relative;background:${C.paper};overflow:hidden">
<div style="position:absolute;inset:0;background:repeating-linear-gradient(to bottom, transparent 0 41px, ${C.rule} 41px 43px)"></div>
<div style="position:absolute;top:0;bottom:0;left:132px;width:3px;background:${C.margin}"></div>
<div style="position:absolute;left:250px;top:50%;transform:translateY(-50%);width:700px">${lockup.replace("<svg ", '<svg width="700" ')}</div></div>`;

const browser = await chromium.launch();
async function shot(html, w, h, out, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: path.join(L, out), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}
const sized = (s, z) => s.replace("<svg ", `<svg width="${z}" height="${z}" style="display:block" `);
await shot(sized(icon, 512), 512, 512, "icon-512.png", true);
await shot(sized(icon, 192), 192, 192, "icon-192.png", true);
await shot(sized(bleed, 180), 180, 180, "apple-touch-icon.png");
await shot(sized(maskable, 512), 512, 512, "icon-maskable-512.png");
await shot(share, 1200, 630, "shared-link.png");
await browser.close();
