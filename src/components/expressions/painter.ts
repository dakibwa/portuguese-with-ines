import { PAINTS, hash, type PaintKey } from "@/lib/expression-paint";
import { blob, layoutPhrase, makeCanvas, paintBead, paintLetters, paintStroke, paintWax, rng, waxHeight, waxRows, type PhraseLine, type Rand, type Solid, type WaxMetrics } from "./paint-art";

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const STROKE_EASE = "cubic-bezier(0.42, 0.04, 0.24, 1)";
const SPRING_FALLBACK = "cubic-bezier(0.3, 1.25, 0.5, 1)";
/** The reading opening: the painted sheet settles round its phrase in the same time. */
export const OPEN_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Press to facts open, the whole reveal stays within this, even after a slow reply. */
const BUDGET = 3200;
/** The reading card opening beneath (or beside) the painting, after the last stroke. */
export const FACTS_OPEN = 480;
/** The brush lifting off the last line and its drops landing. */
const FLICK = 230;
/** The decoy: its dry stroke starts, then is crossed out, before anything real is painted. */
const DECOY_AT = 240;
const DECOY_STROKE = 420;
/** Long enough after the dry stroke for its words to be read, before they are crossed out. */
const STRIKE_AT = DECOY_AT + DECOY_STROKE + 260;
const STRIKE = 180;

/*
 * The room the paint leaves round the words (13 October 2026, Dan: "give it
 * space so the words fit comfortably inside so it's not ambiguous"). In ems of
 * the painted type, unless marked: every letter sits in solid paint, clear of
 * the band's edges, its blunt start and its dry-brush end.
 */
/** Above the first line's tallest letter and below the last line's deepest. */
const PAD_V = 0.42;
/** Round a line's letters where the stroke above or below takes over. */
const PAD_IN = 0.12;
/** How far one line's stroke overlaps the next, so no paper shows between them. */
const OVERLAP = 0.34;
/** The least distance from one baseline to the next. */
const LEAD = 1.28;
/** Solid paint before the first letter, after the blunt start. */
const PAD_H = 0.36;
/** Solid paint after the longest line, before the dry brush begins. */
const MARGIN_R = 0.8;
/** The share of a stroke's width that is kept solid; the rest is its wobbling edge. */
const SOLID = 0.84;
/** The blunt start, its touchdown and rounded cap, as a share of the stroke's width. */
const BLUNT = 0.34;
/** The dry-brush end at its shortest, as a share of the stroke's width. */
const TAIL = 0.34;
/** A stroke's width is about this many ems, for sizing the type before it is known. */
const BAND = 2.5;

type Metrics = WaxMetrics & {
  w: number;
  /** The sheet sits beside the facts: its right edge is the gap before them. */
  beside: boolean;
  /** Around the painted block, above and below. */
  marginV: number;
  /** Kept clear at the top of the resting sheet for the label over it. */
  labelRoom: number;
  poolX: number;
  poolSize: number;
  tempo: number;
  decoyFs: number;
  sizes: [number, number][];
  /** Where the words start: the reading's text column, or further in for large type. */
  textX: (fs: number) => number;
  room: (fs: number) => number;
};

function metricsFor(w: number, textX: number, labelRoom: number, beside: boolean): Metrics {
  const wide = w >= 500;
  const tight = w < 290;
  const padL = textX || (wide ? 64 : tight ? 40 : 44);
  const padR = wide ? 10 : 6;
  // The words start where the reading's text does, unless large type needs more room for the blunt start.
  const start = (fs: number) => Math.max(padL, 3 + fs * (BLUNT * BAND + PAD_H));
  const room = (fs: number) => w - start(fs) - padR - fs * (MARGIN_R + 0.3 + TAIL * BAND);
  const shared = { w, wide, beside, padL, padR, labelRoom, textX: start, room };
  if (wide) return { ...shared, marginV: 22, poolX: 40, poolSize: 70, sizes: [[46, 1], [40, 2], [34, 3], [30, 4]], tempo: 1.12, decoyFs: 28, waxFs: 31 };
  return {
    ...shared, marginV: tight ? 14 : 16, poolX: tight ? 26 : 30, poolSize: tight ? 50 : 56,
    sizes: tight ? [[27, 3], [24, 3], [21, 3], [18, 4]] : [[30, 3], [27, 3], [23, 3], [20, 4]], tempo: 1, decoyFs: tight ? 20 : 22, waxFs: tight ? 19 : 21,
  };
}

/** One line of the phrase and its stroke: `top` is the line's place on the sheet, `base` its baseline on the line. */
type Spec = PhraseLine & { i: number; textX: number; tl: number; x0: number; x1: number; rot: number; at: number; top: number; base: number; solid: Solid };
/** The phrase laid out, its block `blockH` tall with its lines at `at` from the block's top; `hug` is the sheet round it. */
type Plan = { fs: number; n: number; B: number; T: number; specs: Spec[]; blockH: number; hug: number; lastFlick: number };

type Art = {
  el: HTMLDivElement;
  pool: HTMLDivElement;
  group: HTMLDivElement;
  decoy: HTMLDivElement;
  strokes: HTMLDivElement;
  spatter: HTMLDivElement;
  letters: HTMLDivElement;
  dab: HTMLCanvasElement | null;
  swell: Animation | null;
  poolX: number;
  poolY: number;
};

type Shown =
  | { kind: "none" }
  | { kind: "rest"; paint: PaintKey; wax: string[] }
  | { kind: "show"; phrase: string; id: string; paint: PaintKey };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const normal = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-PT").replace(/[^\p{L}\p{N} ]/gu, "").trim();
const DURATIONS: Record<number, number[]> = { 1: [700], 2: [560, 470], 3: [480, 420, 390], 4: [370, 330, 320, 310] };
/** Each line's stroke; a phrase of many lines shares about the time four take. */
const durationsFor = (n: number) => DURATIONS[n] ?? Array.from({ length: n }, () => Math.max(150, Math.round(1330 / n)));
const gapFor = (n: number) => (n > 4 ? 50 : n > 3 ? 70 : 90);

function div(className: string) {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

/**
 * "Pinta e descobre" (13 October 2026): Inês has written the expression in
 * wax on a cream sheet, and a gouache brush sweeps across it line by line so
 * the phrase shows through the paint in her hand. The painter owns the sheet's
 * layers. Everything is painted once onto canvases sized to the device's
 * pixels; the reveal only moves and fades them with the Web Animations API,
 * so nothing renders per frame.
 *
 * The pick is the Worker's. `begin` starts at the press, before the reply;
 * `land` paints only the phrase that came back, so nothing a student does
 * while it paints can change or lose a pick.
 *
 * The sheet grows downwards whenever a phrase needs more room, and only
 * settles round a smaller one as the reading opens beneath it (`settle`), so
 * the page never shortens under the student mid-painting.
 */
export class Painter {
  private readonly root: HTMLElement;
  private readonly wax: HTMLCanvasElement;
  private art: Art | null = null;
  private readonly anims = new Set<Animation>();
  private readonly waiters = new Set<() => void>();
  private readonly family: string;
  private readonly dpr: number;
  private readonly spring: string;
  private m: Metrics;
  private h = 0;
  private shown: Shown = { kind: "none" };
  private busy = false;
  private paint: PaintKey = "deep";
  private spinAt = 0;
  private decoy: { fragment: string; bottom: number; until: number; el: HTMLElement } | null = null;
  /** The painting just landed, still at the height it was painted in: where its block is, and the height round it. */
  private unsettled: { top: number; hug: number } | null = null;
  private dead = false;
  private fontsReady = false;
  private readonly ready: Promise<void>;
  private readonly observer: ResizeObserver | null;
  private resizeTimer = 0;

  constructor(root: HTMLElement) {
    // Without a 2D canvas nothing can be painted: the reading names the expression instead.
    if (!document.createElement("canvas").getContext("2d")) throw new Error("No 2D canvas");
    this.root = root;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.family = getComputedStyle(root).fontFamily || "cursive";
    const spring = getComputedStyle(document.documentElement).getPropertyValue("--motion-spring").trim();
    this.spring = spring && this.easingWorks(spring) ? spring : SPRING_FALLBACK;
    this.wax = document.createElement("canvas");
    this.wax.className = "paint-sheet__wax";
    root.append(this.wax);
    this.m = this.measure();
    const fonts = typeof document !== "undefined" && "fonts" in document ? document.fonts.load(`30px ${this.family}`) : Promise.resolve([]);
    this.ready = fonts.then(() => { this.fontsReady = true; }, () => { this.fontsReady = true; });
    this.observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.resized()) : null;
    this.observer?.observe(root);
  }

  private easingWorks(easing: string) {
    try {
      document.createElement("div").animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, easing }).cancel();
      return true;
    } catch {
      return false;
    }
  }

  private measure() {
    const style = getComputedStyle(this.root);
    const number = (name: string) => {
      const value = parseFloat(style.getPropertyValue(name));
      return Number.isFinite(value) ? value : 0;
    };
    const card = this.root.parentElement?.clientWidth ?? 0;
    this.m = metricsFor(Math.max(200, this.root.clientWidth), number("--paint-text-x"), number("--paint-label-room"), this.root.clientWidth < card - 40);
    return this.m;
  }

  private setHeight(h: number, animate = false) {
    const from = this.h;
    this.h = h;
    this.root.style.minHeight = "";
    this.root.style.height = `${h}px`;
    // A taller phrase lets the sheet grow downwards; nothing above it moves.
    if (animate && from && from !== h) this.play(this.root.animate([{ height: `${from}px` }, { height: `${h}px` }], { duration: 360, easing: EASE_OUT }));
  }

  private play(animation: Animation) {
    this.anims.add(animation);
    const forget = () => this.anims.delete(animation);
    animation.finished.then(forget, forget);
    return animation;
  }

  /** A pause that the unmount, or a fresh start, ends at once. */
  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timer);
        this.waiters.delete(done);
        resolve();
      };
      const timer = window.setTimeout(done, Math.max(0, ms));
      this.waiters.add(done);
    });
  }

  /** Stops everything in hand; whoever was waiting carries on. */
  private halt() {
    for (const animation of [...this.anims]) animation.cancel();
    this.anims.clear();
    for (const done of [...this.waiters]) done();
    this.busy = false;
    this.decoy = null;
    this.unsettled = null;
  }

  destroy() {
    this.dead = true;
    window.clearTimeout(this.resizeTimer);
    this.observer?.disconnect();
    this.halt();
    this.art?.el.remove();
    this.art = null;
    this.wax.remove();
  }

  /**
   * The waiting sheet is at least as tall as its wax needs, and fills the
   * height its place in the card gives it (beside the facts to come, it runs
   * as deep as they do), its wax centred in it. Returns the height it takes.
   */
  private stretch(least: number) {
    this.root.style.height = "auto";
    this.root.style.minHeight = `${least}px`;
    this.h = Math.max(least, Math.round(this.root.getBoundingClientRect().height));
    return this.h;
  }

  private resized() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (this.dead || this.busy || this.unsettled) return;
      const narrower = Math.abs(this.root.clientWidth - this.m.w) >= 2;
      const deeper = this.shown.kind === "rest" && Math.abs(this.root.getBoundingClientRect().height - this.h) >= 2;
      if (narrower || deeper) this.render(false);
    }, 140);
  }

  private newArt(): Art {
    const el = div("paint-sheet__art");
    const pool = div("paint-sheet__pool");
    const group = div("paint-sheet__group");
    pool.append(group);
    const layers = ["decoy", "strokes", "spatter", "letters"].map((name) => div(`paint-sheet__layer paint-sheet__layer--${name}`));
    el.append(pool, ...layers);
    this.root.append(el);
    const [decoy, strokes, spatter, letters] = layers;
    return { el, pool, group, decoy, strokes, spatter, letters, dab: null, swell: null, poolX: this.m.poolX, poolY: 0 };
  }

  /** The last painting dries away behind the new one. */
  private retire(art: Art | null, duration = 240) {
    if (!art) return;
    const gone = () => art.el.remove();
    try {
      const fade = art.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE_OUT, fill: "forwards" });
      fade.finished.then(gone, gone);
    } catch {
      gone();
    }
  }

  private placePool(art: Art, x: number, y: number) {
    art.poolX = x;
    art.poolY = y;
    art.pool.style.transform = `translate(${x}px, ${y}px)`;
  }

  /**
   * The pool follows the sheet as it grows, so the strokes still start from
   * it; a beat behind the sheet's foot, so the sheet's edge never cuts it.
   */
  private movePool(art: Art, y: number, delay = 0) {
    if (Math.abs(art.poolY - y) < 1) return;
    const from = art.pool.style.transform;
    this.placePool(art, art.poolX, y);
    this.play(art.pool.animate([{ transform: from }, { transform: art.pool.style.transform }], { duration: 360, delay, easing: EASE_OUT, fill: "backwards" }));
  }

  /** The flat pool of paint waiting by the margin. */
  private restPool(art: Art, paint: PaintKey, seed: number) {
    const S = this.m.poolSize;
    const colour = PAINTS[paint].paint;
    const [canvas, g] = makeCanvas(S * 1.6, S * 1.6, this.dpr);
    blob(g, S * 0.8, S * 0.8, S * 0.36, rng(seed), colour, { lobes: 0.12 });
    blob(g, S * 1.27, S * 0.5, S * 0.06, rng(seed + 1), colour, { rim: false });
    canvas.style.left = `${-S * 0.8}px`;
    canvas.style.top = `${-S * 0.8}px`;
    art.group.append(canvas);
  }

  private dabCanvas(art: Art, paint: PaintKey, R: Rand) {
    const S = this.m.poolSize;
    const [canvas, g] = makeCanvas(S * 1.8, S * 1.8, this.dpr);
    blob(g, S * 0.9, S * 0.9, S * 0.44, R, PAINTS[paint].paint, { lobes: 0.17 });
    canvas.style.left = `${-S * 0.9}px`;
    canvas.style.top = `${-S * 0.9}px`;
    art.group.append(canvas);
    art.dab = canvas;
    return canvas;
  }

  /** The resting sheet's height: its label, the wax beneath it and a margin. */
  private restHeight(phrases: string[]) {
    const g = document.createElement("canvas").getContext("2d");
    const rows = g ? waxRows(g, this.m.w, this.m, phrases, this.family).length : 3;
    const top = Math.max(this.m.labelRoom, this.m.marginV);
    return { h: Math.round(top + waxHeight(rows, this.m) + this.m.marginV * 1.5), top };
  }

  private drawWax(phrases: string[], h: number, top: number) {
    const { w } = this.m;
    const width = Math.ceil(w * this.dpr);
    const height = Math.ceil(h * this.dpr);
    if (this.wax.width !== width || this.wax.height !== height) {
      this.wax.width = width;
      this.wax.height = height;
      this.wax.style.width = `${w}px`;
      this.wax.style.height = `${h}px`;
    }
    const g = this.wax.getContext("2d");
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    paintWax(g, w, top, h - this.m.marginV * 0.5, this.m, phrases, this.family, rng(hash(phrases.join("|")) || 11));
  }

  /** The waiting sheet: phrases faintly in wax, the next paint pooled by the margin. */
  rest(paint: PaintKey, wax: string[], fade = false) {
    if (this.dead) return;
    this.halt();
    this.shown = { kind: "rest", paint, wax };
    this.paint = paint;
    this.render(fade);
  }

  /** The finished painting, at once: for a returning student or reduced motion. */
  show(phrase: string, id: string, paint: PaintKey, fade = false) {
    if (this.dead) return;
    this.halt();
    this.shown = { kind: "show", phrase, id, paint };
    this.paint = paint;
    this.render(fade);
  }

  private render(fade: boolean) {
    if (!this.fontsReady) {
      this.ready.then(() => {
        if (this.dead || this.busy) return;
        try {
          this.render(fade);
        } catch {
          // A painting that cannot be drawn leaves the cream sheet.
        }
      });
      return;
    }
    const shown = this.shown;
    if (shown.kind === "none") return;
    this.measure();
    const old = this.art;
    const art = this.newArt();
    this.art = art;
    if (fade) this.retire(old);
    else old?.el.remove();
    if (shown.kind === "rest") {
      const { h: least, top } = this.restHeight(shown.wax);
      const h = this.stretch(least);
      this.drawWax(shown.wax, h, top);
      delete this.wax.dataset.gone;
      this.placePool(art, this.m.poolX, (top + h - this.m.marginV * 0.5) / 2);
      this.restPool(art, shown.paint, hash(shown.paint) % 97);
    } else {
      this.wax.dataset.gone = "";
      const R = rng(hash(shown.id));
      const plan = this.build(shown.phrase, R);
      this.setHeight(plan.hug);
      const top = this.m.marginV;
      this.placePool(art, this.m.poolX, top + plan.blockH / 2);
      this.restPool(art, shown.paint, hash(shown.paint) % 97);
      this.dabCanvas(art, shown.paint, rng(hash(`dab${shown.id}`)));
      this.paintPlan(art, plan, top, R, shown.paint, { instant: true });
    }
    if (fade) this.play(art.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE_OUT, fill: "backwards" }));
  }

  /**
   * The press. A dab of the chosen paint lands in the pool and spreads while
   * the reply is on its way; the wax (or the last painting) dries away. With a
   * `decoy`, a thin dry brush starts an unseen phrase near the top and a quick
   * strike crosses it out: a near-miss before the real phrase.
   */
  begin(paint: PaintKey, decoy: string | null) {
    if (this.dead || this.busy) return;
    const waiting = this.shown.kind === "rest" && this.shown.paint === paint ? this.art : null;
    this.halt();
    this.busy = true;
    this.paint = paint;
    this.spinAt = performance.now();
    // From here the sheet keeps the height it has, unless a phrase needs more.
    this.setHeight(this.h || this.restHeight([]).h);
    let art = waiting;
    if (!art) {
      this.retire(this.art);
      art = this.newArt();
      this.art = art;
      this.placePool(art, this.m.poolX, this.h / 2);
    }
    this.shown = { kind: "none" };
    this.wax.dataset.gone = "";
    const S = this.m.poolSize;
    const R = rng(hash(`dab${paint}${Math.round(this.spinAt)}`));
    const dab = this.dabCanvas(art, paint, R);
    // The site's landing: soft at first, then sharp, blooming from the middle.
    this.play(dab.animate([{ opacity: 0, filter: "blur(5px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: 240, easing: EASE_OUT, fill: "both" }));
    this.play(dab.animate([{ transform: "scale(0.34) rotate(-14deg)" }, { transform: "scale(1) rotate(0deg)" }], { duration: 360, easing: this.spring, fill: "both" }));
    // Satellite drops creep out as it pools.
    for (let i = 0; i < 2; i++) {
      const r = S * (i ? 0.055 : 0.08);
      const [canvas, g] = makeCanvas(r * 3, r * 3, this.dpr);
      blob(g, r * 1.5, r * 1.5, r, R, PAINTS[paint].paint, { rim: false, lobes: 0.1 });
      const angle = (i ? -0.9 : 2.3) + (R() - 0.5) * 0.6;
      const near = S * 0.42;
      const far = S * (0.54 + R() * 0.08);
      canvas.style.left = `${-r * 1.5}px`;
      canvas.style.top = `${-r * 1.5}px`;
      art.group.append(canvas);
      const at = (d: number, scale: number) => `translate(${Math.cos(angle) * d}px, ${Math.sin(angle) * d}px) scale(${scale})`;
      this.play(canvas.animate([
        { transform: at(near, 0.2), opacity: 0 },
        { transform: at(near, 1), opacity: 1, offset: 0.35 },
        { transform: at(far, 1), opacity: 1 },
      ], { duration: 760, delay: 200, easing: "cubic-bezier(.3,.6,.3,1)", fill: "both" }));
    }
    // It swells as wet paint spreads, then holds, however long the reply takes.
    art.swell = this.play(art.group.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }], { duration: 500, delay: 360, easing: EASE_OUT, fill: "both" }));
    if (decoy && this.fontsReady) {
      try {
        this.nearMiss(art, decoy, paint);
      } catch {
        this.decoy = null;
      }
    }
  }

  private nearMiss(art: Art, fragment: string, paint: PaintKey) {
    const m = this.m;
    const R = rng(hash(`${fragment}${Math.round(this.spinAt)}`));
    const fs = m.decoyFs;
    const B = Math.round(fs * 1.5);
    const T = Math.round(B * 1.3);
    // A thin wash in a colour the real paint stands out against, so its strike reads.
    const { decoy: wash, strike: strikeColour, shade, strikeWeight } = PAINTS[paint];
    const letters = paintLetters(fragment, this.family, fs, T, wash, R, this.dpr);
    const textX = m.padL + 2;
    const textW = letters.w + letters.offset;
    const x0 = textX - 12;
    const Lb = Math.round(textX + textW + 10 - x0);
    const tl = Math.round(B * 1.7);
    const top = 9;
    const stroke = paintStroke(Lb + tl, T, B, Lb, wash, R, this.dpr, { dry: true });
    const line = div("paint-sheet__line");
    Object.assign(line.style, { top: `${top}px`, height: `${T}px`, transform: `rotate(${(R() - 0.5) * 1.6}deg)`, transformOrigin: `${x0 + Lb / 2}px 50%` });
    art.decoy.append(line);
    const body = this.slice(stroke, 0, Lb, T);
    const tail = this.slice(stroke, Lb - 8, tl + 8, T);
    tail.className = "paint-sheet__tail";
    tail.style.left = `${x0 + Lb - 8}px`;
    letters.canvas.style.left = `${textX + letters.offset - x0}px`;
    const [w1, i1] = this.wipe(line, x0, Lb, T, [body]);
    const [w2, i2] = this.wipe(line, x0, Lb, T, [letters.canvas]);
    line.append(tail);
    const options: KeyframeAnimationOptions = { duration: DECOY_STROKE, delay: DECOY_AT, easing: STROKE_EASE, fill: "both" };
    for (const [wipe, inner] of [[w1, i1], [w2, i2]]) {
      this.play(wipe.animate([{ transform: `translateX(${-(Lb + 3)}px)` }, { transform: "translateX(0px)" }], options));
      this.play(inner.animate([{ transform: `translateX(${Lb + 3}px)` }, { transform: "translateX(0px)" }], options));
    }
    this.play(tail.animate([{ transform: "scaleX(0.12)", opacity: 0 }, { transform: "scaleX(1)", opacity: 0.9 }], { duration: 220, delay: DECOY_AT + DECOY_STROKE - 40, easing: "cubic-bezier(.2,.75,.3,1)", fill: "both" }));

    // The quick strike through the middle of the letters: not this one.
    const Bs = Math.max(4, Math.round(B * strikeWeight));
    const Ts = Math.round(Bs * 3.4);
    const sx0 = textX - 10;
    const Lbs = Math.round(textW + 18);
    const tls = Math.round(Bs * 4);
    const strike = paintStroke(Lbs + tls, Ts, Bs, Lbs, strikeColour, R, this.dpr, { flick: -0.5, shade });
    const strikeLine = div("paint-sheet__line");
    Object.assign(strikeLine.style, { top: `${top + T / 2 - Ts / 2 + fs * 0.1}px`, height: `${Ts}px`, transform: `rotate(${-2 - R() * 2}deg)`, transformOrigin: `${sx0 + Lbs / 2}px 50%` });
    art.decoy.append(strikeLine);
    const [ws, is] = this.wipe(strikeLine, sx0, Lbs + tls, Ts, [strike]);
    const strikeOptions: KeyframeAnimationOptions = { duration: STRIKE, delay: STRIKE_AT, easing: "cubic-bezier(.3,.1,.2,1)", fill: "both" };
    this.play(ws.animate([{ transform: `translateX(${-(Lbs + tls + 3)}px)` }, { transform: "translateX(0px)" }], strikeOptions));
    this.play(is.animate([{ transform: `translateX(${Lbs + tls + 3}px)` }, { transform: "translateX(0px)" }], strikeOptions));
    this.decoy = { fragment, bottom: top + (T + B) / 2, until: this.spinAt + STRIKE_AT + STRIKE, el: art.decoy };
  }

  /** Once the real phrase is read, the crossed-out start dries away. */
  fadeDecoy(duration = 420) {
    const decoy = this.decoy;
    if (!decoy || this.dead) return;
    this.decoy = { ...decoy, fragment: "" };
    try {
      decoy.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE_OUT, fill: "forwards" });
    } catch {
      decoy.el.style.opacity = "0";
    }
  }

  /** A part of a painted stroke, copied onto its own canvas. */
  private slice(source: HTMLCanvasElement, from: number, width: number, T: number) {
    const [canvas, g] = makeCanvas(width, T, this.dpr);
    g.drawImage(source, from * this.dpr, 0, width * this.dpr, T * this.dpr, 0, 0, width, T);
    return canvas;
  }

  /**
   * A window that slides open with its content held still: the stroke being
   * laid down. The wipe moves and carries the window; anything riding its
   * leading edge (the wet bead) goes in the wipe beside the window, unclipped.
   */
  private wipe(line: HTMLElement, left: number, width: number, T: number, content: HTMLElement[]): [HTMLDivElement, HTMLDivElement] {
    const wipe = div("paint-sheet__wipe");
    Object.assign(wipe.style, { left: `${left}px`, width: `${width}px`, height: `${T}px` });
    const view = div("paint-sheet__window");
    const inner = div("paint-sheet__wipe-inner");
    inner.append(...content);
    view.append(inner);
    wipe.append(view);
    line.append(wipe);
    return [wipe, inner];
  }

  /**
   * The phrase, laid out round its own letters: each line's stroke is wide
   * enough to hold its letters with room to spare, the first and last with
   * generous room above and below, and the strokes overlap so the block is
   * all paint. Every body runs past the longest line before its dry brush
   * begins, and every line starts well clear of the blunt start.
   */
  private build(phrase: string, R: Rand): Plan {
    const m = this.m;
    const { fs, lines } = layoutPhrase(phrase, m, this.family);
    const n = lines.length;
    let lead = LEAD * fs;
    for (let i = 1; i < n; i++) lead = Math.max(lead, lines[i - 1].desc + lines[i].asc - fs * 0.05);
    // What must be solid round each line, measured from the first baseline.
    const need = lines.map((line, i) => ({
      lo: i * lead - line.asc - fs * (i === 0 ? PAD_V : PAD_IN),
      hi: i * lead + line.desc + fs * (i === n - 1 ? PAD_V : PAD_IN),
    }));
    const centres = need.map(({ lo, hi }) => (lo + hi) / 2);
    let S = Math.max(...need.map(({ lo, hi }) => hi - lo));
    for (let i = 1; i < n; i++) S = Math.max(S, centres[i] - centres[i - 1] + OVERLAP * fs);
    S = Math.ceil(S);
    const B = Math.round(S / SOLID);
    const T = Math.ceil(B * 1.34);
    // The painted block, from the top of the first stroke to the foot of the last.
    const reach = B * 0.54;
    const first = centres[0] - reach;
    const blockH = Math.ceil(centres[n - 1] - centres[0] + 2 * reach);
    const textX = m.textX(fs);
    const longest = Math.max(...lines.map((line) => line.w));
    const solidEnd = textX + longest + fs * MARGIN_R * 0.7;
    const specs = lines.map((line, i): Spec => {
      const x = textX + (R() - 0.5) * 3;
      const x0 = Math.max(1, x - B * BLUNT - fs * PAD_H - R() * B * 0.05);
      // Every body runs past the longest line before it starts to run dry.
      const bodyEnd = textX + longest + fs * (MARGIN_R + R() * 0.3);
      const tl = Math.max(B * 0.28, Math.min(B * (TAIL + 0.08 + R() * 0.26), m.w - m.padR - bodyEnd));
      const rot = (0.3 + R() * 0.7) * (i % 2 ? -1 : 1) * (R() < 0.5 ? 1 : -1);
      const at = centres[i] - first;
      const solid = { from: x - fs * PAD_H - x0, to: solidEnd - x0, top: T / 2 - S / 2, bottom: T / 2 + S / 2 };
      return { ...line, i, textX: x, tl, x0, x1: bodyEnd + tl, rot, at, top: 0, base: T / 2 + i * lead - centres[i], solid };
    });
    return { fs, n, B, T, specs, blockH, hug: blockH + 2 * m.marginV, lastFlick: R() < 0.5 ? -1 : 1 };
  }

  /**
   * The strokes, in reading order, each brushing its line of the phrase
   * through the paint, the block's top at `y`; then the flick off the last
   * one. Returns when, from now, the last stroke is down.
   */
  private paintPlan(art: Art, plan: Plan, y: number, R: Rand, paint: PaintKey, { instant = false, delay = 0, tempo = 1 }) {
    const { B, T } = plan;
    const { paint: colour, letters: ink, shade, streaks } = PAINTS[paint];
    const durations = durationsFor(plan.n);
    const gap = gapFor(plan.n);
    let t = delay;
    const ends: { s: Spec; bodyLeft: number; Lb: number }[] = [];
    for (const s of plan.specs) {
      s.top = y + s.at - T / 2;
      const L = s.x1 - s.x0;
      const Lb = L - s.tl;
      const last = s.i === plan.n - 1;
      const stroke = paintStroke(L, T, B, Lb, colour, R, this.dpr, { flick: last ? plan.lastFlick * 0.6 : 0, shade, streaks, solid: s.solid });
      const bodyLeft = s.x0;
      const body = this.slice(stroke, 0, Lb, T);
      const tail = this.slice(stroke, Lb - 8, s.tl + 8, T);
      const letters = paintLetters(s.text, this.family, plan.fs, T, colour, R, this.dpr, ink, s.base);
      const line = (layer: HTMLElement, under = false) => {
        const element = div("paint-sheet__line");
        Object.assign(element.style, { top: `${s.top}px`, height: `${T}px`, transform: `rotate(${s.rot}deg)`, transformOrigin: `${(s.x0 + s.x1) / 2}px 50%` });
        if (under) layer.prepend(element);
        else layer.append(element);
        return element;
      };
      const strokeLine = line(art.strokes);
      // Each line's letters go under the lines above, so its wet bead never covers their letters.
      const letterLine = line(art.letters, true);
      letters.canvas.style.left = `${s.textX + letters.offset - bodyLeft}px`;
      const [w1, i1] = this.wipe(strokeLine, bodyLeft, Lb, T, [body]);
      const [w2, i2] = this.wipe(letterLine, bodyLeft, Lb, T, [letters.canvas]);
      tail.className = "paint-sheet__tail";
      tail.style.left = `${s.x0 + Lb - 8}px`;
      strokeLine.append(tail);
      ends.push({ s, bodyLeft, Lb });
      if (instant) {
        tail.style.opacity = "1";
        continue;
      }
      // The wet bead rides on the letters' wipe, at its leading edge, so the
      // two can never part, whichever thread draws them.
      const bead = paintBead(B, colour, R, 1, this.dpr, shade);
      bead.canvas.className = "paint-sheet__bead";
      Object.assign(bead.canvas.style, { left: `${Lb - bead.bw / 2}px`, top: `${(T - bead.bh) / 2}px` });
      w2.append(bead.canvas);
      const duration = (durations[s.i] ?? 320) * tempo * this.m.tempo;
      const start = t;
      // Each stroke draws its paint from the pool, which gives a little as it does.
      if (art.dab) this.play(art.dab.animate([{ transform: "scale(1)" }, { transform: "scale(0.93) translateX(2px)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 420, delay: start, easing: "ease-out" }));
      const options: KeyframeAnimationOptions = { duration, delay: start, easing: STROKE_EASE, fill: "both" };
      for (const [wipe, inner] of [[w1, i1], [w2, i2]]) {
        this.play(wipe.animate([{ transform: `translateX(${-(Lb + 3)}px)` }, { transform: "translateX(0px)" }], options));
        this.play(inner.animate([{ transform: `translateX(${Lb + 3}px)` }, { transform: "translateX(0px)" }], options));
      }
      // It swells as the brush meets the paper, then thins a little as it lifts.
      const at = (p: number, scale: number, opacity: number): Keyframe => ({ offset: p, transform: `scale(${scale})`, opacity });
      this.play(bead.canvas.animate([at(0, 0.3, 0), at(0.02, 0.42, 1), at(0.1, 1, 1), at(0.9, 1, 1), at(1, 0.94, 1)], options));
      // The brush lifts: the bead goes, the dry bristles drag out.
      const lift = last ? { dx: 26, dy: -16 * (plan.lastFlick < 0 ? 1 : 0.4), scale: 0.28, d: 230 } : { dx: 9, dy: -3, scale: 0.5, d: 150 };
      this.play(bead.canvas.animate([
        { transform: "scale(0.94)", opacity: 1 },
        { transform: `translate(${lift.dx}px, ${lift.dy}px) scale(${lift.scale})`, opacity: 0 },
      ], { duration: lift.d, delay: start + duration, easing: EASE_OUT, fill: "forwards" }));
      this.play(tail.animate([{ transform: "scaleX(0.12)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1 }], { duration: 190, delay: start + duration - 30, easing: "cubic-bezier(.2,.75,.3,1)", fill: "both" }));
      t = start + duration + gap;
    }
    const strokesEnd = instant ? 0 : t - gap;

    // The pool feeds the strokes, and gives back what it swelled by.
    if (!instant && art.swell) {
      const swell = art.swell;
      swell.pause();
      const current = getComputedStyle(art.group).transform;
      swell.cancel();
      art.swell = null;
      this.play(art.group.animate([{ transform: current === "none" ? "scale(1)" : current }, { transform: "scale(1)" }], { duration: Math.max(300, strokesEnd - delay), delay, easing: "ease-in-out", fill: "both" }));
    }

    // The flick off the last stroke throws a few drops across the sheet.
    const lastEnd = ends[ends.length - 1];
    const fx = lastEnd.bodyLeft + lastEnd.Lb + lastEnd.s.tl * 0.6;
    const fy = lastEnd.s.top + T / 2;
    this.drops(plan, y, fx, fy, paint, R).forEach((drop, k) => {
      const [canvas, g] = makeCanvas(drop.r * 3, drop.r * 3, this.dpr);
      blob(g, drop.r * 1.5, drop.r * 1.5, drop.r, R, drop.colour, { rim: drop.r > 4, lobes: 0.12 });
      canvas.className = "paint-sheet__drop";
      const place = `translate(${drop.x - drop.r * 1.5}px, ${drop.y - drop.r * 1.5}px)`;
      canvas.style.transform = place;
      art.spatter.append(canvas);
      if (instant) {
        canvas.style.opacity = "1";
        return;
      }
      const at = strokesEnd + 30 + k * 45;
      this.play(canvas.animate([{ opacity: 0, filter: "blur(3px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: 220, delay: at, easing: EASE_OUT, fill: "both" }));
      this.play(canvas.animate([{ transform: `${place} scale(0.3) rotate(${drop.turn}deg)` }, { transform: `${place} scale(1) rotate(0deg)` }], { duration: 360, delay: at, easing: this.spring, fill: "both" }));
    });
    return strokesEnd;
  }

  /** Drops off the brush, kept within the margin round the block so they stay when the sheet settles. */
  private drops(plan: Plan, y: number, fx: number, fy: number, paint: PaintKey, R: Rand) {
    const m = this.m;
    const out: { x: number; y: number; r: number; colour: string; turn: number }[] = [];
    const big = m.wide ? 1.25 : 1;
    const up = plan.lastFlick < 0;
    const thrown = 3 + (R() < 0.5 ? 1 : 0);
    const colours = PAINTS[paint];
    // Thrown ahead of the flick in a loose fan, then two that landed further off.
    for (let k = 0, tries = 0; k < thrown && tries < 40; tries++) {
      const d = (12 + Math.pow(R(), 0.8) * 58) * big;
      const a = (up ? -0.45 : 0.25) + (R() - 0.5) * 1.6;
      const drop = { x: fx + Math.cos(a) * d, y: fy + Math.sin(a) * d, r: (1.8 + R() * 4.2 * (1 - d / (90 * big))) * big, colour: colours.paint, turn: (R() - 0.5) * 40 };
      if (out.some((o) => Math.hypot(o.x - drop.x, o.y - drop.y) < (o.r + drop.r) * 2.6)) continue;
      out.push(drop);
      k++;
    }
    const top = y + plan.B * 0.1;
    const bottom = y + plan.blockH - plan.B * 0.1;
    out.push({ x: m.w * (0.55 + R() * 0.3), y: top - 10 - R() * 6, r: 3 * big, colour: colours.paint, turn: 20 });
    out.push({ x: m.w * (0.28 + R() * 0.25), y: bottom + 8 + R() * 6, r: 2.4 * big, colour: R() < 0.6 ? colours.accent : colours.companion, turn: -20 });
    for (const drop of out) {
      // Beside the facts the sheet's edge is the middle of the card: keep clear of them.
      drop.x = clamp(drop.x, 8, m.w - (m.beside ? 26 : 8));
      drop.y = clamp(drop.y, y - m.marginV + 5, y + plan.blockH + m.marginV - 5);
    }
    return out;
  }

  /**
   * The reply is in: only now, with the phrase known, is anything that shows
   * it laid out and painted. Resolves once the brush has lifted off the last
   * line, so the reading can open (and the sheet `settle` round it).
   */
  async land(phrase: string, id: string) {
    if (this.dead) return;
    await this.ready;
    if (this.dead) return;
    const art = this.art;
    if (!this.busy || !art) {
      this.show(phrase, id, this.paint);
      return;
    }
    const m = this.m;
    const R = rng(hash(id));
    const decoy = this.decoy;
    // A decoy that is the start of the real phrase was no near-miss after all.
    if (decoy?.fragment && normal(phrase).startsWith(normal(decoy.fragment))) this.fadeDecoy(160);
    const plan = this.build(phrase, R);
    const reserve = decoy ? decoy.bottom + 6 : m.marginV;
    // Grow now if the phrase needs it; a smaller one is painted where it is and settles later.
    const h = Math.max(this.h, plan.hug, reserve + plan.blockH + m.marginV);
    const grows = h > this.h;
    if (h !== this.h) this.setHeight(h, true);
    // Out of the pool if there is room, never under the near-miss, never off the sheet.
    const y = clamp(art.poolY - plan.blockH / 2, reserve, h - m.marginV - plan.blockH);
    this.movePool(art, y + plan.blockH / 2, grows ? 140 : 0);
    const now = performance.now();
    const start = Math.max(now + 40, this.spinAt + 420, decoy ? decoy.until + 60 : 0);
    const gaps = (plan.n - 1) * gapFor(plan.n);
    const spare = this.spinAt + BUDGET - FACTS_OPEN - FLICK - start - gaps;
    const tempo = clamp(spare / (durationsFor(plan.n).reduce((sum, value) => sum + value, 0) * m.tempo), 0.62, 1);
    const strokesEnd = this.paintPlan(art, plan, y, R, this.paint, { delay: start - now, tempo });
    await this.wait(strokesEnd + FLICK);
    if (this.dead) return;
    this.busy = false;
    this.shown = { kind: "show", phrase, id, paint: this.paint };
    this.unsettled = { top: y, hug: plan.hug };
  }

  /**
   * As the reading opens, the painted sheet closes round its phrase: its foot
   * rises and the painting glides to its place, in step with the reading, so
   * the card never jumps. The final size is set at once, so the card can
   * measure where it is going; the returned function starts the motion. A
   * painting already in place, or one painted at once, stays as it is.
   */
  settle(): () => void {
    const unsettled = this.unsettled;
    const art = this.art;
    this.unsettled = null;
    if (this.dead || this.busy || !unsettled || !art) return () => {};
    const shift = unsettled.top - this.m.marginV;
    const from = this.h;
    const moves = Math.abs(shift) >= 1;
    const shrinks = Math.abs(from - unsettled.hug) >= 1;
    if (moves) art.el.style.transform = `translateY(${-shift}px)`;
    if (shrinks) this.setHeight(unsettled.hug);
    const resized = Math.abs(this.root.clientWidth - this.m.w) >= 2;
    return () => {
      if (this.dead) return;
      const options: KeyframeAnimationOptions = { duration: FACTS_OPEN, easing: OPEN_EASE };
      if (moves) this.play(art.el.animate([{ transform: "translateY(0px)" }, { transform: `translateY(${-shift}px)` }], options));
      if (shrinks) this.play(this.root.animate([{ height: `${from}px` }, { height: `${unsettled.hug}px` }], options));
      // The sheet changed width while it was painting: lay the finished painting out again.
      if (resized) this.resized();
    };
  }

  /** The reply failed: the new paint dries back to nothing, and no pick is spent. */
  async stop() {
    const art = this.art;
    if (this.dead || !this.busy || !art) {
      this.busy = false;
      return;
    }
    for (const animation of this.anims) animation.pause();
    this.retire(art, 520);
    this.art = null;
    await this.wait(300);
    this.busy = false;
    this.decoy = null;
  }
}
