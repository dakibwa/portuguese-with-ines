/**
 * Render the link preview with the site's own lettering, colours and grain.
 * The flowers frame the wordmark from the top right and bottom left.
 *
 * Run `npm run build:og-image` and give `shareImage.url` a new `?v=` in
 * src/lib/page-metadata.ts when the artwork changes. An optional argument
 * overrides the output path. Keep the PNG in full colour so it matches the
 * site's blue. Sharp's `effort`, `quality` and `colours` enable a palette.
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
   * Rotate around the open centre of the painted flower so its coral stroke
   * can point towards the lettering while its petals cross the card edges.
   */
  .flower {
    position: absolute;
    transform-origin: 44.7% 48.6%;
  }
  .flower--top {
    left: 825px;
    top: -312px;
    width: 700px;
    height: 700px;
    transform: rotate(16deg);
  }
  .flower--bottom {
    left: -254px;
    top: 288px;
    width: 680px;
    height: 680px;
    transform: rotate(200deg);
  }
  /*
   * Use the footer's --paper mask and render the lettering at its native size.
   * Its ink is centred horizontally and sits 7px above the card's midline.
   */
  .wordmark {
    position: absolute;
    left: 220px;
    top: 190px;
    width: 760px;
    height: 236px;
    background: ${paper};
    -webkit-mask: url("${wordmark}") no-repeat 0 0 / 760px 236px;
    mask: url("${wordmark}") no-repeat 0 0 / 760px 236px;
  }
</style></head>
<body>
  <div class="card">
    <img class="flower flower--top" src="${flower}" alt="">
    <img class="flower flower--bottom" src="${flower}" alt="">
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
