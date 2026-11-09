// Draws the draft logo files into ../logo/ (working name Chapeau, 9 Nov 2026; the name is not picked).
// Usage, from the repository root:
//   npm install --no-save opentype.js@1.3.4
//   put Brygada 1918 SemiBold (brygada-600.ttf) and Commissioner SemiBold (commissioner-600.ttf),
//   static TTFs from Google Fonts, in docs/platform/brand/draft/tools/fonts/ (not committed)
//   NAME=vowel node docs/platform/brand/draft/tools/gen-logos.mjs
// NAME sets the wordmark and the seal's words; it defaults to the working name.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "logo");
const FONTS = process.env.FONTS || path.join(here, "fonts");
const NAME = (process.env.NAME || "chapeau").toLowerCase();
const SERIF = opentype.loadSync(path.join(FONTS, "brygada-600.ttf"));
const SANS = opentype.loadSync(path.join(FONTS, "commissioner-600.ttf"));

// The draft palette (tokens.json): tile = pen green, marker = highlighter yellow.
export const C = { tile: "#0E6B4C", onTile: "#FFFFFF", marker: "#FFE45C", ink: "#142019", paper: "#F5F7F4", inkNight: "#EAF0EC" };
// The hat: 64 x 43, a thin rising stroke and a thick falling one, like a pen-drawn circumflex.
const HAT = "M1 38 L30 1.6 Q32 -0.6 34 1.6 L63 36 L51 43 L32 17 L8 43 Z";
const f = (n) => +n.toFixed(2);

function textPath(font, text, size, track = 0) {
  const gs = font.stringToGlyphs(text);
  let x = 0;
  const p = new opentype.Path();
  gs.forEach((g, i) => {
    p.extend(g.getPath(x, 0, size));
    const kern = i < gs.length - 1 ? (font.getKerningValue(g, gs[i + 1]) * size) / font.unitsPerEm : 0;
    x += (g.advanceWidth * size) / font.unitsPerEm + kern + track * size;
  });
  return { d: p.toPathData(2), bb: p.getBoundingBox(), xh: (font.tables.os2.sxHeight * size) / font.unitsPerEm };
}

const E1000 = textPath(SERIF, "e", 1000);

// The ê with its hat tipped back, centred at cx on a 512 grid. The favicon uses heavier settings.
function markParts({ eSize, base, hw, gap, tilt, dx, cx = 256 }) {
  const k = eSize / 1000;
  const w = (E1000.bb.x2 - E1000.bb.x1) * k;
  const tx = cx - (E1000.bb.x1 * k + w / 2);
  const top = base + E1000.bb.y1 * k;
  const s = hw / 64, hh = 43 * s, hx = cx - hw / 2 + dx, hy = top - gap - hh;
  return {
    e: (fill) => `<path transform="translate(${f(tx)} ${base}) scale(${k})" d="${E1000.d}" fill="${fill}"/>`,
    hat: (fill) => `<path transform="translate(${f(hx)} ${f(hy)}) rotate(${tilt} ${f(8 * s)} ${f(hh)}) scale(${f(s)})" d="${HAT}" fill="${fill}"/>`,
  };
}

const MASTER = { eSize: 456, base: 446, hw: 214, gap: 30, tilt: -16, dx: 14 };
const FAV = { eSize: 540, base: 470, hw: 252, gap: 20, tilt: -14, dx: 10 };
const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>\n`;
const tile = (fill, rx = 112) => `<rect width="512" height="512" rx="${rx}" fill="${fill}"/>`;
const m = markParts(MASTER);
const fv = markParts(FAV);

const files = {};
files["icon.svg"] = svg("0 0 512 512", tile(C.tile) + m.e(C.onTile) + m.hat(C.marker));
files["favicon.svg"] = svg("0 0 512 512", tile(C.tile, 120) + fv.e(C.onTile) + fv.hat(C.marker));
files["mark.svg"] = svg("0 0 512 512", m.e(C.ink) + m.hat(C.tile));
files["mark-night.svg"] = svg("0 0 512 512", m.e(C.inkNight) + m.hat(C.marker));

// The wordmark: the name in lowercase, Brygada 1918 SemiBold at -0.01em, outlined.
const W = textPath(SERIF, NAME, 100, -0.01);
const wvb = `${f(W.bb.x1)} ${f(W.bb.y1)} ${f(W.bb.x2 - W.bb.x1)} ${f(W.bb.y2 - W.bb.y1)}`;
files["wordmark.svg"] = svg(wvb, `<path d="${W.d}" fill="${C.ink}"/>`);
files["wordmark-night.svg"] = svg(wvb, `<path d="${W.d}" fill="${C.inkNight}"/>`);

// The lockup: the tile, then the name, its x-height centred on the tile, a quarter of the tile apart.
function lockup(nameFill) {
  const T = 512, k = (T * 0.86) / 100, gap = T * 0.25;
  const baseline = T / 2 + (W.xh * k) / 2, x0 = T + gap - W.bb.x1 * k;
  const width = T + gap + (W.bb.x2 - W.bb.x1) * k;
  const top = Math.min(0, baseline + W.bb.y1 * k), bottom = Math.max(T, baseline + W.bb.y2 * k);
  return svg(
    `0 ${f(top)} ${f(width)} ${f(bottom - top)}`,
    tile(C.tile) + m.e(C.onTile) + m.hat(C.marker) + `<path transform="translate(${f(x0)} ${f(baseline)}) scale(${k})" d="${W.d}" fill="${nameFill}"/>`,
  );
}
files["lockup.svg"] = lockup(C.ink);
files["lockup-night.svg"] = lockup(C.inkNight);

// The seal: a printer's mark, the ring words in Commissioner SemiBold outlined along a circle.
function seal() {
  const R = 196, size = 46, track = 0.16;
  const text = `${NAME.toUpperCase()} · SITES FOR LANGUAGE TUTORS · `;
  const gs = SANS.stringToGlyphs(text);
  const adv = gs.map((g) => (g.advanceWidth * size) / SANS.unitsPerEm + track * size);
  const scale = (2 * Math.PI * R) / adv.reduce((a, b) => a + b, 0);
  let acc = 0, out = "";
  gs.forEach((g, i) => {
    const w = adv[i] * scale, mid = acc + w / 2;
    acc += w;
    const th = -Math.PI / 2 + mid / R, x = 256 + R * Math.cos(th), y = 256 + R * Math.sin(th);
    const p = g.getPath(-((g.advanceWidth * size) / SANS.unitsPerEm) / 2, size * 0.36, size);
    if (p.commands.length) out += `<path transform="translate(${f(x)} ${f(y)}) rotate(${f((th * 180) / Math.PI + 90)})" d="${p.toPathData(2)}"/>`;
  });
  const inner = markParts({ eSize: 236, base: 336, hw: 116, gap: 16, tilt: -16, dx: 8 });
  return svg(
    "0 0 512 512",
    `<circle cx="256" cy="256" r="256" fill="${C.tile}"/><circle cx="256" cy="256" r="150" fill="none" stroke="${C.onTile}" stroke-opacity=".35" stroke-width="3"/><g fill="${C.onTile}">${out}</g>` +
      inner.e(C.onTile) + inner.hat(C.marker),
  );
}
files["seal.svg"] = seal();

for (const [n, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n), s);
console.log(Object.keys(files).join("\n"));
