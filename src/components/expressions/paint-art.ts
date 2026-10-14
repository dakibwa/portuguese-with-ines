/*
 * The painted stand-ins for "Pinta e descobre", drawn in code (13 October
 * 2026). Each function paints one piece once, onto its own canvas sized to the
 * device's pixels; the reveal then only moves and fades those canvases. The
 * pieces are written so that commissioned paintings can replace them one by
 * one (docs/expressions-paint-assets.md lists them, with sizes and colours).
 */

import { PAINTS } from "@/lib/expression-paint";

export const PAPER = "#FBF4E5";

export type Rand = () => number;

/** A small seeded generator: the same seed paints the same marks. */
export function rng(seed: number): Rand {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` moved `t` of the way to `b`, at `alpha`. */
export function mix(a: string, b: string, t: number, alpha = 1) {
  const x = rgb(a);
  const y = rgb(b);
  const c = x.map((value, index) => Math.round(value + (y[index] - value) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/** A canvas `w` by `h` CSS pixels, its backing store sized once to the device's pixels. */
export function makeCanvas(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(h * dpr));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("No 2D canvas");
  g.scale(dpr, dpr);
  return [canvas, g];
}

/**
 * A flat pool or drop of gouache seen from above: a wobbling edge and a
 * slightly darker dried rim. Matte, as gouache dries: no gloss.
 */
export function blob(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, R: Rand, colour: string, { lobes = 0.14, rim = true } = {}) {
  const harmonics: [number, number, number][] = [];
  for (let k = 2; k <= 7; k++) harmonics.push([k, (R() * 2 - 1) * lobes / (0.55 * k), R() * Math.PI * 2]);
  const n = 72;
  const swing = Array.from({ length: n + 1 }, (_, i) => harmonics.reduce((sum, [k, amp, phase]) => sum + amp * Math.sin((k * i * Math.PI * 2) / n + phase), 0));
  // Its lobes reach at most 1.4 × `lobes` beyond its radius, so a blob placed clear of a margin stays inside it.
  const scale = Math.min(1, (1.4 * lobes) / Math.max(1e-6, ...swing.map(Math.abs)));
  const path = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = 1 + swing[i] * scale;
    const x = cx + Math.cos(a) * r * m;
    const y = cy + Math.sin(a) * r * m * 0.9;
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  path.closePath();
  g.save();
  g.fillStyle = colour;
  g.fill(path);
  if (rim) {
    g.strokeStyle = mix(colour, "#000000", 0.28, 0.42);
    g.lineWidth = Math.max(0.8, r * 0.045);
    g.stroke(path);
  }
  g.restore();
}

/**
 * Where a stroke must be solid paint: from x `from` to `to`, and between y
 * `top` and `bottom` on its canvas. Its edges never come inside, and no paper
 * shows through there, so the words painted over it always sit in paint.
 */
export type Solid = { from: number; to: number; top: number; bottom: number };

type StrokeOptions = { flick?: number; dry?: boolean; shade?: string; streaks?: number; solid?: Solid };

/** `limit` pushed out of the way of `value` softly, so an edge kept clear still wobbles. */
function soft(value: number, limit: number, k = 2.5) {
  const z = (limit - value) / k;
  return limit - k * (z > 30 ? z : Math.log1p(Math.exp(z)));
}

/**
 * A gouache stroke in its forward direction: a loaded, blunt start at x=0, a
 * body with bristle streaks and darker dried edges, and a dry-brush end that
 * breaks into separate bristles from x=Lb to x=L. `dry` paints a thin,
 * half-empty brush: paper shows through in streaks along its whole length.
 * `solid` keeps the stretch under the words whole (see Solid).
 */
export function paintStroke(L: number, T: number, B: number, Lb: number, colour: string, R: Rand, dpr: number, { flick = 0, dry = false, shade = "#000000", streaks: streakStrength = 1, solid }: StrokeOptions = {}) {
  const [canvas, g] = makeCanvas(L, T, dpr);
  const cy = T / 2;
  const hw0 = B / 2;
  const tl = L - Lb;
  const phase = Array.from({ length: 8 }, () => R() * Math.PI * 2);
  const arc = (R() * 2 - 1) * B * 0.035;
  const mid = (x: number) => cy + arc * Math.sin(Math.PI * x / L) + 0.8 * Math.sin(x / 57 + phase[6]);
  const notches = Array.from({ length: 6 }, () => [R() * Lb, 6 + R() * 18, (R() * 0.03 + 0.015) * B, R() < 0.5 ? 0 : 1] as const);
  // How much of the solid stretch applies at x: all of it under the words, easing off either side.
  const ramp = Math.max(8, B * 0.12);
  const guard = (x: number) => {
    if (!solid) return 0;
    const outside = Math.max(solid.from - x, x - solid.to, 0);
    if (outside >= ramp) return 0;
    const u = outside / ramp;
    return 1 - u * u * (3 - 2 * u);
  };
  const edge = (x: number, side: number) => {
    let e = B * (0.045 * Math.sin(x / 43 + phase[side]) + 0.025 * Math.sin(x / 13 + phase[side + 2]) + 0.014 * Math.sin(x / 4.3 + phase[side + 4]));
    for (const [nx, nw, nd, s] of notches) if (s === side && Math.abs(x - nx) < nw) e += (side ? -1 : 1) * nd * (1 + Math.cos(Math.PI * (x - nx) / nw)) / 2;
    return e;
  };
  const press = (x: number) => 1 - 0.07 * clamp(x / Lb, 0, 1) + 0.03 * Math.sin(x / 70 + phase[7]);
  const cap = B * 0.3;
  const startDepth = B * (0.08 + R() * 0.1);
  const hw = (x: number) => {
    let h = hw0 * press(x);
    if (x < cap) {
      const u = (cap - x) / cap;
      h *= 0.58 + 0.42 * Math.sqrt(Math.max(0, 1 - u * u));
    }
    return h;
  };

  // The tail first: separate bristles dragging out as the brush lifts.
  const bristles = Math.round(B / 1.45);
  g.lineCap = "round";
  g.strokeStyle = colour;
  for (let j = 0; j < bristles; j++) {
    const v = ((j + 0.5) / bristles) * 2 - 1;
    const reach = tl * (0.28 + 0.72 * Math.pow(R(), 0.6)) * (1 - 0.4 * v * v);
    const width = (B / bristles) * (1.1 + R() * 0.7);
    const wobble = R() * Math.PI * 2;
    let x = Lb - 12;
    while (x < Lb + reach) {
      const segment = 2 + R() * 4;
      const progress = (x - Lb) / reach;
      const yAt = (xx: number) => {
        const p = Math.max(0, (xx - Lb) / tl);
        return mid(xx) + v * hw(Math.min(xx, Lb)) * (1 - 0.22 * p) + 0.5 * Math.sin(xx / 7 + wobble) + flick * p * p * B * 0.35;
      };
      const skip = progress > 0.3 && R() < (progress - 0.3) * 1.25;
      if (!skip) {
        g.globalAlpha = progress < 0.45 ? 1 : clamp(1 - (progress - 0.45) * 1.1, 0.25, 1);
        g.lineWidth = width * (progress < 0.55 ? 1 : clamp(1 - (progress - 0.55) * 1.3, 0.35, 1));
        g.beginPath();
        g.moveTo(x, yAt(x));
        g.lineTo(x + segment, yAt(x + segment));
        g.stroke();
      }
      x += segment;
    }
  }
  g.globalAlpha = 1;

  // The body, its blunt touchdown where the loaded brush met the paper.
  const step = 3;
  const top: [number, number][] = [];
  const bottom: [number, number][] = [];
  // Over its last stretch the body's edges ease in to the dry brush's, so where
  // the body ends the bristles carry on from it: no step at either edge.
  const run = clamp(B * 0.5, 8, Lb * 0.3);
  const envelope = 0.95;
  for (let x = startDepth; x <= Lb + 0.01; x += step) {
    const xx = Math.min(x, Lb);
    let y0 = mid(xx) - hw(xx) + edge(xx, 0);
    let y1 = mid(xx) + hw(xx) + edge(xx, 1);
    const weight = guard(xx);
    if (solid && weight) {
      y0 += (soft(y0, solid.top) - y0) * weight;
      y1 += (-soft(-y1, -solid.bottom) - y1) * weight;
    }
    const u = clamp((xx - (Lb - run)) / run, 0, 1);
    const k = u * u * (3 - 2 * u);
    if (k) {
      const inner0 = mid(xx) - hw(xx) * envelope;
      const inner1 = mid(xx) + hw(xx) * envelope;
      if (y0 < inner0) y0 += (inner0 - y0) * k;
      if (y1 > inner1) y1 += (inner1 - y1) * k;
    }
    top.push([xx, y0]);
    bottom.push([xx, y1]);
  }
  const path = new Path2D();
  path.moveTo(top[0][0], top[0][1]);
  for (const point of top) path.lineTo(point[0], point[1]);
  for (let i = bottom.length - 1; i >= 0; i--) path.lineTo(bottom[i][0], bottom[i][1]);
  const y0 = bottom[0][1];
  const y1 = top[0][1];
  // The blunt start: a rounded cap where the loaded brush met the paper,
  // furthest out at its middle, with a gentle wobble that never flattens it
  // into a straight stretch or pinches it to a point, and never reaches the
  // canvas's edge.
  const capSteps = 28;
  for (let k = 1; k < capSteps; k++) {
    const u = k / capSteps;
    const v = 1 - 2 * u;
    const round = 1 - v * v;
    const wobble = B * (0.018 * Math.sin(v * 4 + phase[5]) + 0.008 * Math.sin(v * 11 + phase[1]) + 0.027) * round;
    const x = Math.max(0.5, startDepth * (1 - Math.sqrt(round)) + wobble + 0.5);
    path.lineTo(x, y0 + (y1 - y0) * u);
  }
  path.closePath();
  g.fillStyle = colour;
  g.fill(path);

  g.save();
  g.clip(path);
  // Bristle streaks along the stroke, in uneven runs as a bristle drags more and
  // less paint. A dry brush is a thin wash: few streaks, faint, so the wax reads.
  const streaks = Math.round(B * (dry ? 0.45 : 1.4));
  for (let i = 0; i < streaks; i++) {
    const u = (R() * 2 - 1) * 0.95;
    const x0 = R() * Lb * 0.75;
    const length = Lb * (0.12 + R() * 0.55);
    const light = R() < 0.5;
    // Pale streaks would read as more wax letters through a thin wash.
    if (dry && light) continue;
    g.lineWidth = light ? 0.35 + R() * 0.55 : 0.5 + R() * 1.2;
    let x = x0;
    const end = Math.min(Lb, x0 + length * (light ? 1.4 : 1));
    while (x < end) {
      const run = 10 + R() * 50;
      const alpha = (light ? 0.03 + R() * 0.06 : (0.16 + R() * 0.22) * streakStrength) * (dry ? 0.45 : 1);
      g.strokeStyle = light ? mix(colour, PAPER, 0.18, alpha) : mix(colour, shade, 0.3, alpha);
      g.beginPath();
      for (let xx = x; xx < Math.min(end, x + run); xx += 5) {
        const y = mid(xx) + u * hw(xx) + 0.4 * Math.sin(xx / 9 + i);
        if (xx === x) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.stroke();
      x += run + R() * 6;
    }
  }
  // Paper peeking through where the brush began to run dry; all along it if dry.
  g.globalCompositeOperation = "destination-out";
  // A dry brush keeps its middle, where the wax letters are, mostly whole.
  const skips = dry ? Math.round(B * 0.5) : 3 + Math.round(R() * 4);
  for (let i = 0; i < skips; i++) {
    // Never where the words are: only past the end of the longest line.
    const x0 = dry ? R() * Lb * 0.8 : Math.max(solid ? solid.to + ramp : 0, Lb - 6 - R() * Math.min(70, Lb * 0.3));
    const u = (R() < 0.5 ? -1 : 1) * (dry ? 0.5 + R() * 0.5 : 0.55 + R() * 0.4);
    const length = dry ? 18 + R() * Lb * 0.5 : 10 + R() * 40;
    if (x0 >= Lb - 2) continue;
    g.strokeStyle = `rgba(0,0,0,${dry ? 0.55 + R() * 0.45 : 0.45 + R() * 0.45})`;
    g.lineWidth = dry ? 0.6 + R() * 1.6 : 0.5 + R() * 1.1;
    g.beginPath();
    g.moveTo(x0, mid(x0) + u * hw(x0));
    g.lineTo(Math.min(Lb + 2, x0 + length), mid(x0 + length) + u * hw(x0 + length));
    g.stroke();
  }
  g.globalCompositeOperation = "source-over";
  g.restore();

  // Darker dried edges, as gouache settles at the rim, and a few stray hairs.
  g.strokeStyle = mix(colour, shade, 0.3, dry ? 0.12 : 0.42);
  g.lineWidth = 1;
  for (const line of [top, bottom]) {
    g.beginPath();
    line.forEach((point, index) => (index ? g.lineTo(point[0], point[1]) : g.moveTo(point[0], point[1])));
    g.stroke();
  }
  g.strokeStyle = mix(colour, shade, 0.05, 0.75);
  for (let i = 0; i < (dry ? 0 : 5); i++) {
    const x0 = cap + R() * (Lb - cap) * 0.9;
    const side = R() < 0.5 ? -1 : 1;
    const length = 8 + R() * 22;
    g.lineWidth = 0.5 + R() * 0.5;
    g.beginPath();
    for (let x = x0; x <= x0 + length; x += 3) {
      const y = side < 0 ? mid(x) - hw(x) + edge(x, 0) - 0.6 - (x - x0) * 0.02 : mid(x) + hw(x) + edge(x, 1) + 0.6 + (x - x0) * 0.02;
      if (x === x0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  return canvas;
}

/** The wet front of a stroke: a rounded bead of paint whose back half melts into the stroke. Matte. */
export function paintBead(B: number, colour: string, R: Rand, dir: number, dpr: number, shade = "#000000", rim = 0.5) {
  const bw = B * 0.66;
  const bh = B * 1.1;
  const [canvas, g] = makeCanvas(bw, bh, dpr);
  if (dir < 0) {
    g.translate(bw, 0);
    g.scale(-1, 1);
  }
  const cx = bw * 0.48;
  const cy = bh / 2;
  const rx = bw * 0.5;
  const ry = bh * 0.47;
  const phase = R() * Math.PI * 2;
  const path = new Path2D();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const m = 1 + 0.035 * Math.sin(3 * a + phase) + 0.02 * Math.sin(5 * a + phase * 2);
    const x = cx + Math.cos(a) * rx * m;
    const y = cy + Math.sin(a) * ry * m;
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  path.closePath();
  g.fillStyle = colour;
  g.fill(path);
  g.strokeStyle = mix(colour, shade, 0.32, rim);
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.98, ry * 0.98, 0, -1.25, 1.25);
  g.stroke();
  // Its back melts into the stroke along a curve that follows its own round,
  // so the streaks it covers fade out in an arc, never along a straight line.
  g.globalCompositeOperation = "destination-in";
  g.translate(bw, bh / 2);
  g.scale(1, bh / bw);
  const fade = g.createRadialGradient(0, 0, bw * 0.6, 0, 0, bw * 1.02);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(-bw * 2, -bw * 2, bw * 4, bw * 4);
  return { canvas, bw, bh };
}

/**
 * One line of the phrase in `ink` (the paper's cream, or ink on a light
 * paint), with a few specks of the paint beading on it. `baseline` is where it
 * sits on the line; by default its letters are centred on it.
 */
export function paintLetters(text: string, family: string, fs: number, T: number, colour: string, R: Rand, dpr: number, ink = PAPER, baseline?: number) {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("No 2D canvas");
  probe.font = `${fs}px ${family}`;
  const metrics = probe.measureText(text);
  const inkLeft = Math.min(0, -metrics.actualBoundingBoxLeft) - 3;
  const inkRight = Math.max(metrics.width, metrics.actualBoundingBoxRight) + 3;
  const w = Math.ceil(inkRight - inkLeft);
  const [canvas, g] = makeCanvas(w, T, dpr);
  g.font = `${fs}px ${family}`;
  g.fillStyle = ink;
  g.textBaseline = "alphabetic";
  g.fillText(text, -inkLeft, baseline ?? T / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
  g.globalCompositeOperation = "source-atop";
  const specks = Math.round((w * fs) / 70);
  for (let i = 0; i < specks; i++) {
    g.fillStyle = mix(colour, colour, 0, 0.35 + R() * 0.35);
    g.beginPath();
    g.arc(R() * w, R() * T, 0.3 + R() * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  return { canvas, offset: inkLeft, w };
}

/** `room(fs)`: how wide a line of type at `fs` may be, leaving the paint its margins. */
export type PhraseMetrics = { room: (fs: number) => number; sizes: [number, number][] };
export type PhraseLine = { text: string; w: number; asc: number; desc: number };

/**
 * Lays the phrase out once, when it is known: the largest type that fits in
 * few enough lines, balanced so the strokes are of a similar length. A short
 * phrase stays on one line if a slightly smaller size holds it. Each line
 * carries how far its letters reach above and below the baseline, so the
 * paint can be sized round them. Nothing is ever cut: a phrase too long for
 * every size takes as many lines as it needs (the sheet grows to hold them).
 */
export function layoutPhrase(text: string, m: PhraseMetrics, family: string): { fs: number; lines: PhraseLine[] } {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("No 2D canvas");
  const words = text.trim().split(/\s+/);
  const measured = (size: number, line: string): PhraseLine => {
    probe.font = `${size}px ${family}`;
    const metrics = probe.measureText(line);
    return { text: line, w: metrics.width, asc: metrics.actualBoundingBoxAscent || size, desc: metrics.actualBoundingBoxDescent || 0 };
  };
  const width = (size: number, value: string) => {
    probe.font = `${size}px ${family}`;
    return probe.measureText(value).width;
  };
  const result = (size: number, lines: string[]) => ({ fs: size, lines: lines.map((line) => measured(size, line)) });
  // Balanced lines of `pieces` at `size`, each within the room; null if more than `maxLines`.
  const wrap = (size: number, pieces: string[], maxLines = Infinity) => {
    const available = m.room(size);
    const space = width(size, " ");
    const widths = pieces.map((piece) => width(size, piece));
    if (Math.max(...widths) > available) return null;
    const greedy = (limit: number) => {
      const lines: number[][] = [];
      let current: number[] = [];
      let used = 0;
      widths.forEach((pieceWidth, index) => {
        const add = current.length ? space + pieceWidth : pieceWidth;
        if (current.length && used + add > limit) {
          lines.push(current);
          current = [index];
          used = pieceWidth;
        } else {
          current.push(index);
          used += add;
        }
      });
      if (current.length) lines.push(current);
      return lines;
    };
    let lines = greedy(available);
    if (lines.length > maxLines) return null;
    if (lines.length > 1) {
      let low = available / lines.length;
      let high = available;
      for (let k = 0; k < 18; k++) {
        const middle = (low + high) / 2;
        if (greedy(middle).length > lines.length) low = middle;
        else high = middle;
      }
      lines = greedy(high);
    }
    return lines.map((indices) => indices.map((index) => pieces[index]).join(" "));
  };
  const whole = words.join(" ");
  for (const [fs, maxLines] of m.sizes) {
    const lines = wrap(fs, words, maxLines);
    if (!lines) continue;
    if (lines.length === 1) {
      // A short phrase grows a little, as long as it still fits at the larger size.
      for (let next = fs * 1.14; next > fs; next -= fs * 0.02) if (width(next, whole) <= m.room(next)) return result(next, lines);
      return result(fs, lines);
    }
    // A phrase of a few words keeps to one line if up to 15% smaller type holds it.
    if (lines.length === 2 && words.length <= 3) {
      for (let next = fs * 0.98; next >= fs * 0.85; next -= fs * 0.02) if (width(next, whole) <= m.room(next)) return result(next, [whole]);
    }
    return result(fs, lines);
  }
  // Longer than every size allows in few lines: the smallest type, in as many
  // lines as it takes. Smaller only for a word too wide for a line, and a word
  // too wide even then is broken between its letters.
  const floor = m.sizes[m.sizes.length - 1][0];
  let fs = floor;
  while (fs > floor * 0.7 && Math.max(...words.map((word) => width(fs, word))) > m.room(fs)) fs -= 1;
  const room = m.room(fs);
  const pieces = words.flatMap((word) => {
    if (width(fs, word) <= room) return [word];
    const parts = [""];
    for (const character of word) {
      if (parts[parts.length - 1] && width(fs, parts[parts.length - 1] + character) > room) parts.push("");
      parts[parts.length - 1] += character;
    }
    return parts;
  });
  return result(fs, wrap(fs, pieces) ?? pieces);
}

/**
 * How far each row of wax is set in, in a loose cascade: the first two clear
 * of the pool beside them, even once the press's dab has swollen in it, so
 * the wax still reads while the reply is on its way.
 */
const waxIndent = (index: number, fs: number) => (index === 0 ? fs * 1.35 : index === 1 ? fs * 0.95 : fs * 0.4);

/** The phrases that fit the sheet, up to three, each at the largest size that fits. */
export function waxRows(g: CanvasRenderingContext2D, w: number, m: WaxMetrics, phrases: string[], family: string) {
  const rows: { text: string; size: number }[] = [];
  for (const phrase of phrases) {
    if (rows.length === 3) break;
    const available = w - m.padL - m.padR - 6 - waxIndent(rows.length, m.waxFs) - m.waxFs * 0.3;
    for (const size of [m.waxFs, m.waxFs * 0.86, m.waxFs * 0.74]) {
      g.font = `${size}px ${family}`;
      if (g.measureText(phrase).width <= available) {
        rows.push({ text: phrase, size });
        break;
      }
    }
  }
  return rows;
}

export type WaxMetrics = { padL: number; padR: number; wide: boolean; waxFs: number };

/** How tall the wax writing stands: rows of phrases, or three lines of loops. */
export function waxHeight(rows: number, m: WaxMetrics) {
  return rows ? (rows - 1) * m.waxFs * 1.95 + m.waxFs * 1.5 : 2 * (m.wide ? 40 : 27) * 1.55 + (m.wide ? 40 : 27);
}

/**
 * The resting sheet: real phrases from her collection in dark blue, readable
 * on the cream paper. With no phrases to show, pale joined-up loops in her
 * slant instead.
 * Centred between `top` and `bottom`, which the sheet keeps at its top.
 */
export function paintWax(g: CanvasRenderingContext2D, w: number, top: number, bottom: number, m: WaxMetrics, phrases: string[], family: string, R: Rand) {
  const fs = m.waxFs;
  const pitch = fs * 1.95;
  const centre = (top + bottom) / 2;
  g.textBaseline = "alphabetic";
  const rows = waxRows(g, w, m, phrases, family);
  if (rows.length) {
    const y0 = centre - ((rows.length - 1) * pitch) / 2 + fs * 0.32;
    rows.forEach((row, index) => {
      g.font = `${row.size}px ${family}`;
      const x = m.padL + waxIndent(index, fs) + R() * fs * 0.3;
      const y = y0 + index * pitch;
      g.fillStyle = PAINTS.deep.paint;
      g.fillText(row.text, x, y);
    });
    return;
  }
  const lines = 3;
  const size = m.wide ? 40 : 27;
  const linePitch = size * 1.55;
  const first = centre - ((lines - 1) * linePitch) / 2 + size * 0.2;
  const xHeight = size * 0.32;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let row = 0; row < lines; row++) {
    const span = (w - m.padL - m.padR - 24) * (row === lines - 1 ? 0.5 + R() * 0.2 : 0.78 + R() * 0.2);
    let x = m.padL + waxIndent(row, size);
    const base = first + row * linePitch;
    while (x < m.padL + span - size * 0.8) {
      const letters = 2 + Math.floor(R() * 6);
      const points: [number, number][] = [];
      for (let letter = 0; letter < letters; letter++) {
        const kind = R();
        const tall = kind < 0.22;
        const loop = tall || kind < 0.55;
        const height = tall ? xHeight * (2.3 + R() * 0.5) : xHeight * (0.85 + R() * 0.3);
        const width = size * (tall ? 0.26 : 0.3 + R() * 0.12);
        for (let i = 0; i <= 16; i++) {
          const t = (i / 16) * Math.PI * 2;
          const yy = base - height * (1 - Math.cos(t)) / 2;
          points.push([x + (width / (Math.PI * 2)) * t - (loop ? width * 0.26 : width * 0.06) * Math.sin(t) + (base - yy) * 0.22, yy]);
        }
        x += width;
      }
      for (const [style, dx, dy, lineWidth] of [["rgba(26,49,105,0.06)", 0.5, 0.8, 1.4], ["rgba(255,255,253,0.95)", 0, 0, 1.15]] as const) {
        g.strokeStyle = style;
        g.lineWidth = lineWidth;
        g.beginPath();
        points.forEach((point, index) => (index ? g.lineTo(point[0] + dx, point[1] + dy) : g.moveTo(point[0] + dx, point[1] + dy)));
        g.stroke();
      }
      x += size * (0.35 + R() * 0.15);
    }
  }
}
