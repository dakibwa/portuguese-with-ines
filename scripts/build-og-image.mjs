/**
 * Render the link preview using the same lettering, colours and paper grain
 * as the site. The flower runs past the top and right edges of the card.
 * Run `npm run build:og-image` and update the image version in page-metadata.ts
 * when the artwork changes. An optional argument overrides the output path.
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const WIDTH = 1200;
const HEIGHT = 630;
const output = path.resolve(root, process.argv[2] ?? "public/og.png");

const asDataUri = (file, mime) =>
  `data:${mime};base64,${readFileSync(path.join(root, "public", file)).toString("base64")}`;

const grain = asDataUri("visuals/paper-grain.svg", "image/svg+xml");
const wordmark = asDataUri("visuals/wordmark-cream.webp", "image/webp");
const flower = asDataUri("visuals/generated-splats/open-centre-lavender-splat.webp", "image/webp");

// The site's own two colours, so a change to either token reaches the card.
const stylesheet = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const token = (name) => {
  const found = stylesheet.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, "i"));
  if (!found) throw new Error(`--${name} is not a six-digit hex colour in src/app/globals.css`);
  return found[1];
};
const blue = token("blue-deep");
const paper = token("paper");

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  /* A blue band, as the home hero and the footer are drawn. */
  .card {
    position: relative;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background-color: ${blue};
    background-image: url("${grain}");
  }
  /*
   * The flower's open centre is at 44.7% 48.6% of its square artwork. It is
   * seated 116px in from the right edge and 106px down, and the flower turns
   * about it, so the centre stays whole while the petals above it and to its
   * right run off the card. At 880px the artwork is scaled down, never up.
   */
  .flower {
    position: absolute;
    left: 691px;
    top: -322px;
    width: 880px;
    height: 880px;
    transform-origin: 44.7% 48.6%;
    transform: rotate(16deg);
  }
  /* --paper behind the wordmark's alpha mask, as .brand-wordmark--cream. */
  .wordmark {
    position: absolute;
    left: 94px;
    top: 244px;
    width: 760px;
    height: 236px;
    background: ${paper};
    -webkit-mask: url("${wordmark}") no-repeat center / contain;
    mask: url("${wordmark}") no-repeat center / contain;
  }
</style></head>
<body>
  <div class="card">
    <img class="flower" src="${flower}" alt="">
    <div class="wordmark" role="img" aria-label="Português com a Inês"></div>
  </div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
// One device pixel to each card pixel: the wordmark's mask and the grain's
// tile land on the card as they are, with nothing to scale back down.
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
// The grain and the mask are CSS images, which `load` does not wait to decode.
await page.evaluate(
  (sources) =>
    Promise.all(
      sources.map((source) => {
        const image = new Image();
        image.src = source;
        return image.decode();
      })
    ),
  [grain, wordmark, flower]
);
const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
await browser.close();

// Lossless, so every pixel keeps the colour the browser painted.
await sharp(buffer).png({ compressionLevel: 9 }).toFile(output);

console.log(`${path.relative(root, output)} written at ${WIDTH}x${HEIGHT}`);
