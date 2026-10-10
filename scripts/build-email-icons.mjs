/**
 * Renders the small images the transactional emails use beside their facts:
 * the confirm step's splat dab in four colours and turns, and the Google Meet
 * mark for a lesson's call.
 *
 * PNGs at 2x for the same reason as the banner (scripts/build-email-banner.mjs):
 * the site draws the dab as a CSS mask and the Meet mark as inline SVG, neither
 * of which email clients will render reliably. Re-run with
 * `npm run build:email-icons` after changing the dab or the brand colours. The
 * output is committed, because the emails reference it by absolute URL from the
 * live site.
 */

import { chromium } from "playwright";
import path from "node:path";

const root = process.cwd();
const out = (name) => path.join(root, "public", "email", name);

// The confirm step's payment dab (globals.css, --payment-dab).
const DAB =
  "M269 184c7.478 8.42 7.768 18.218 7.195 28.954C275.431 220.962 271.9 227.64 266 233a443 443 0 0 1-5.125 4c-6.43 5.051-8.478 8.967-10.25 16.875-1.782 7.614-4.93 13.575-11.437 18.125-6.639 3.667-13.932 3.546-21.188 2-3.062-1.625-3.062-1.625-6-4l-1.645-1.328c-4.029-3.602-6.361-7.39-8.855-12.172-3.637-6.948-8.545-11.995-14.309-17.262-5.077-4.722-7.73-8.614-8.629-15.675.644-5.239 2.181-9.452 6.107-13.124 4.939-3.733 9.812-6.127 15.581-8.314 8.051-3.217 14.746-6.974 21.75-12.125 12.942-9.323 32.845-18.774 47-6";

// Colour and turn on different beats, as the confirm step's list does.
const DABS = [
  { name: "dab-blue.png", fill: "#2c54aa", turn: 0 },
  { name: "dab-lavender.png", fill: "#aaa4e6", turn: 60 },
  { name: "dab-coral.png", fill: "#ef5d3c", turn: 180 },
  { name: "dab-ink.png", fill: "#554f91", turn: 330 }
];

// Google Meet's own mark (TeacherMeetConnection.tsx).
const MEET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.5 72">
  <path fill="#00832d" d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02-2-16.64-11.69 6.44z"/>
  <path fill="#0066da" d="M0 51.5V66c0 3.315 2.685 6 6 6h14.5l3-10.96-3-9.54-9.95-3z"/>
  <path fill="#e94235" d="M20.5 0L0 20.5l10.55 3 9.95-3 2.95-9.41z"/>
  <path fill="#2684fc" d="M20.5 20.5H0v31h20.5z"/>
  <path fill="#00ac47" d="M82.6 8.68L69.5 19.42v33.66l13.16 10.79c1.97 1.54 4.85.135 4.85-2.37V11c0-2.535-2.945-3.925-4.91-2.32zM49.5 36v15.5h-29V72h43c3.315 0 6-2.685 6-6V53.08z"/>
  <path fill="#ffba00" d="M63.5 0h-43v20.5h29V36l20-16.57V6c0-3.315-2.685-6-6-6z"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });

async function render(svg, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><style>*{margin:0}body{width:${width}px;height:${height}px;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`
  );
  await page.screenshot({ path: out(file), omitBackground: true });
}

for (const { name, fill, turn } of DABS) {
  await render(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="176.6 175.5 101.8 101.8"><path fill="${fill}" transform="rotate(${turn} 227.5 226.4)" d="${DAB}"/></svg>`,
    14,
    14,
    name
  );
}
await render(MEET, 20, 16, "google-meet.png");

await browser.close();
console.log("Wrote public/email/dab-*.png and google-meet.png");
