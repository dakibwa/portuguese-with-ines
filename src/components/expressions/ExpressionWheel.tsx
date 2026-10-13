"use client";

import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { publicAssetUrl } from "@/lib/paths";

/** Ten splats round the wheel, one on each arm. */
const SPLATS = 10;
const STEP = 360 / SPLATS;
/** Degrees a millisecond at full speed: quick, but each splat still reads as one. */
const TOP_SPEED = 0.36;
const SPIN_UP = 420;
/** However quickly the pick comes back, the wheel turns this long first, */
const LEAST_SPIN = 700;
/** and then slows over at least this far, so the last few phrases are read. */
const LEAST_TRAVEL = 300;
/** How long the slowing tail is: the higher, the longer it creeps. */
const SLOWING = 2.2;
/** It rolls a touch past and settles back, as the site's springs give and settle. */
const OVERRUN = STEP * 0.1;
const SETTLE = 380;
const ERROR_STOP = 700;
const SPRING = "cubic-bezier(0.3, 1.25, 0.5, 1)";

/** Deep blue most, coral twice, cream and pale lavender between: no two neighbours match. */
const TONES = ["deep", "coral", "cream", "deep", "pale", "deep", "coral", "cream", "deep", "pale"] as const;

/**
 * Where the landing's droplets fly, round the chosen splat: an angle (0 is
 * straight up, clockwise) and how far, in splat widths.
 */
const SPLASH = [[-62, 0.6], [-22, 0.5], [18, 0.56], [64, 0.62], [118, 0.52], [-128, 0.5]] as const;

const art = (name: string) => publicAssetUrl(`/visuals/expression-wheel/${name}.webp`);

export type ExpressionWheelHandle = {
  /** Starts turning at once, while the pick is still on its way. */
  spin(): void;
  /** Slows onto a splat carrying this phrase, then splashes it. */
  land(phrase: string): Promise<void>;
  /** Slows to a stop (the pick failed) and puts `restPhrase` back on top. */
  stop(): Promise<void>;
  /** Without motion: puts this phrase on the top splat. */
  show(phrase: string): void;
};

type Turn =
  | { kind: "spin"; start: number; from: number }
  | { kind: "slow"; start: number; from: number; distance: number; duration: number; rest: number; done: () => void };

const wrap = (index: number) => ((index % SPLATS) + SPLATS) % SPLATS;
const topAt = (angle: number) => wrap(Math.round(-angle / STEP));

/** How many steps splat `index` is from the top, either way. */
function stepsFromTop(index: number, angle: number) {
  return ((((index * STEP + angle) % 360) + 540) % 360 - 180) / STEP;
}

/** The top splat swells so its phrase reads large; the rest stay small. */
const lens = (steps: number) => 0.68 + 0.62 * Math.exp(-(steps * steps) / 0.45);

/** Phrases round the wheel, `rest` on the top splat. */
function fill(phrases: string[], rest: string, top: number, keep?: string[]) {
  return Array.from({ length: SPLATS }, (_, index) => {
    if (index === top) return rest;
    if (keep && Math.min(wrap(index - top), wrap(top - index)) <= 2) return keep[index];
    return phrases.length ? phrases[(wrap(index - top) - 1) % phrases.length] : "";
  });
}

/**
 * A painted wheel of phrases (13 October 2026, at Dan's request for a wheel
 * that lands on the student's expression, each phrase on its own splat, in the
 * style of the site). A phrase rides each of the ten splats on the lavender
 * wheel's arms, the one at the top swelling so it reads large, and the
 * wordmark's chapéu marks the top and hops as each one passes under it. On
 * landing the chosen splat blooms and droplets splash out round it. The
 * paintings are in `public/visuals/expression-wheel/`.
 *
 * The pick is the Worker's: the wheel only ever slows onto what has already
 * been saved, so stopping it early can never lose or change a pick. It is
 * decorative throughout; the section announces the result in words.
 */
export function ExpressionWheel({ phrases, restPhrase, ref }: {
  phrases: string[];
  restPhrase: string;
  ref?: Ref<ExpressionWheelHandle>;
}) {
  const [texts, setTexts] = useState(() => fill(phrases, restPhrase, 0));
  const textsRef = useRef(texts);
  const latest = useRef({ phrases, restPhrase });
  const stage = useRef<HTMLDivElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const hat = useRef<HTMLSpanElement>(null);
  const arms = useRef<(HTMLDivElement | null)[]>([]);
  const drops = useRef<(HTMLSpanElement | null)[]>([]);
  const angle = useRef(0);
  const shown = useRef(0);
  const side = useRef(1);
  const turn = useRef<Turn | null>(null);
  const landing = useRef<{ phrase: string; done: () => void } | null>(null);
  const frame = useRef(0);

  useEffect(() => { latest.current = { phrases, restPhrase }; }, [phrases, restPhrase]);

  // Unmounting mid-turn lets whoever waits on the wheel carry on at once.
  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    if (turn.current?.kind === "slow") turn.current.done();
    landing.current?.done();
    turn.current = null;
    landing.current = null;
  }, []);

  const write = (next: string[]) => { textsRef.current = next; setTexts(next); };

  function hop(lift: number, duration: number) {
    side.current = -side.current;
    hat.current?.animate([
      { translate: "-50% 0", rotate: "0deg" },
      { translate: `-50% ${-lift}px`, rotate: `${side.current * (lift + 4)}deg` },
      { translate: "-50% 0", rotate: "0deg" },
    ], { duration, easing: SPRING });
  }

  function place(next: number, speed: number) {
    angle.current = next;
    if (wheel.current) wheel.current.style.rotate = `${next}deg`;
    stage.current?.classList.toggle("is-fast", speed > 0.2);
    arms.current.forEach((arm, index) => {
      if (!arm) return;
      const steps = stepsFromTop(index, next);
      arm.style.setProperty("--lens", lens(steps).toFixed(3));
      arm.style.zIndex = String(10 - Math.round(Math.abs(steps)));
    });
    const top = topAt(next);
    if (top !== shown.current) {
      shown.current = top;
      hop(4, 220);
    }
  }

  /** Slows from `speed` to a standstill `overrun` past `rest`, matching the speed it had. */
  function slow(now: number, from: number, speed: number, rest: number, overrun: number, done: () => void) {
    const distance = Math.max(rest + overrun - from, 0.01);
    turn.current = { kind: "slow", start: now, from, distance, duration: Math.max(SLOWING * distance / Math.max(speed, 0.01), 1), rest, done };
  }

  function splash(index: number) {
    hop(11, 560);
    // Its swell is `scale`; the bloom rides on `transform`, so the two multiply.
    arms.current[index]?.firstElementChild?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
      { duration: 640, easing: SPRING },
    );
    const width = arms.current[index]?.firstElementChild?.getBoundingClientRect().width ?? 200;
    drops.current.forEach((drop, order) => {
      const [toward, reach] = SPLASH[order];
      const radians = toward * Math.PI / 180;
      drop?.animate([
        { opacity: 0, translate: "-50% -50%", scale: "0.3" },
        { opacity: 1, translate: `calc(-50% + ${Math.sin(radians) * reach * width}px) calc(-50% - ${Math.cos(radians) * reach * width * 0.62}px)`, scale: "1" },
      ], { duration: 640, delay: order * 35, easing: SPRING, fill: "forwards" });
    });
  }

  /** The last landing's droplets dry away as the wheel turns again. */
  function clearSplash() {
    drops.current.forEach((drop) => {
      drop?.getAnimations().forEach((animation) => {
        animation.reverse();
        animation.updatePlaybackRate(2.4);
      });
    });
  }

  function tick(now: number) {
    const current = turn.current;
    if (!current) return;
    const elapsed = now - current.start;
    if (current.kind === "spin") {
      const speed = TOP_SPEED * Math.min(1, elapsed / SPIN_UP);
      const next = current.from + (elapsed < SPIN_UP ? TOP_SPEED * elapsed * elapsed / (2 * SPIN_UP) : TOP_SPEED * (elapsed - SPIN_UP / 2));
      place(next, speed);
      const wanted = landing.current;
      if (wanted && elapsed >= LEAST_SPIN) {
        // The first splat to reach the top after a good run carries the
        // phrase, and lands a little either side of dead centre, as a real
        // wheel does.
        const stop = Math.ceil((next + LEAST_TRAVEL) / STEP) * STEP;
        const index = topAt(stop);
        write(textsRef.current.map((text, position) => position === index ? wanted.phrase : text));
        landing.current = null;
        slow(now, next, speed, stop + (Math.random() - 0.5) * 0.24 * STEP, OVERRUN, () => {
          splash(index);
          window.setTimeout(wanted.done, 380);
        });
      }
    } else if (elapsed < current.duration) {
      const left = 1 - elapsed / current.duration;
      place(current.from + current.distance * (1 - left ** SLOWING), current.distance * SLOWING / current.duration * left ** (SLOWING - 1));
    } else if (elapsed < current.duration + SETTLE && current.from + current.distance > current.rest) {
      const peak = current.from + current.distance;
      place(peak + (current.rest - peak) * (0.5 - Math.cos(Math.PI * (elapsed - current.duration) / SETTLE) / 2), 0);
    } else {
      place(Math.max(current.rest, current.from), 0);
      turn.current = null;
      current.done();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }

  useImperativeHandle(ref, () => ({
    spin() {
      if (turn.current) return;
      clearSplash();
      // New phrases come round from behind; what is showing stays put.
      write(fill(latest.current.phrases, textsRef.current[shown.current], shown.current, textsRef.current));
      turn.current = { kind: "spin", start: performance.now(), from: angle.current };
      frame.current = requestAnimationFrame(tick);
    },
    land(phrase) {
      return new Promise((resolve) => {
        if (turn.current?.kind !== "spin") {
          write(textsRef.current.map((text, index) => index === shown.current ? phrase : text));
          resolve();
          return;
        }
        landing.current = { phrase, done: resolve };
      });
    },
    stop() {
      return new Promise((resolve) => {
        const current = turn.current;
        const settle = () => {
          write(textsRef.current.map((text, index) => index === shown.current ? latest.current.restPhrase : text));
          resolve();
        };
        landing.current = null;
        if (current?.kind !== "spin") {
          settle();
          return;
        }
        // A short, even stop with a splat square under the chapéu.
        const now = performance.now();
        const speed = TOP_SPEED * Math.min(1, (now - current.start) / SPIN_UP);
        slow(now, angle.current, speed, Math.ceil((angle.current + speed * ERROR_STOP / SLOWING) / STEP) * STEP, 0, settle);
      });
    },
    show(phrase) {
      write(textsRef.current.map((text, index) => index === shown.current ? phrase : text));
    },
  }));

  return (
    <div
      aria-hidden="true"
      className="expression-wheel"
      ref={stage}
      style={{ "--wheel-art": art("wheel"), "--hub-art": art("hub"), "--hat-art": art("chapeu") } as CSSProperties}
    >
      <span className="expression-wheel__hat" ref={hat} />
      <div className="expression-wheel__wheel" ref={wheel}>
        <span className="expression-wheel__body" />
        {TONES.map((tone, index) => {
          const text = texts[index];
          return (
            <div
              className="expression-wheel__arm"
              key={index}
              ref={(element) => { arms.current[index] = element; }}
              style={{ "--i": index, "--lens": lens(stepsFromTop(index, 0)).toFixed(3), zIndex: 10 - Math.round(Math.abs(stepsFromTop(index, 0))) } as CSSProperties}
            >
              <div className="expression-wheel__splat" data-tone={tone} style={{ "--splat-art": art(`phrase-splat-${String(index + 1).padStart(2, "0")}`) } as CSSProperties}>
                {text ? <span data-length={text.length > 30 ? "long" : text.length > 20 ? "mid" : undefined} lang="pt-PT">{text}</span> : null}
              </div>
            </div>
          );
        })}
        <span className="expression-wheel__hub" />
      </div>
      <div className="expression-wheel__splash">
        {SPLASH.map((_, index) => (
          <span
            className="expression-wheel__drop"
            key={index}
            ref={(element) => { drops.current[index] = element; }}
            style={{ "--drop-art": art(`drop-${index + 1}`) } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
