/**
 * The paints a student's expression can be painted in (13 October 2026, at
 * Dan's request that each painting be a different colour on top; lavender
 * joined them the same day). The four dark paints carry cream lettering, and
 * lavender carries ink, each at AA or better: deep blue 9.3:1, blue 6.5:1,
 * coral 5.4:1 and lavender ink 6.6:1 with #FBF4E5, lavender 5.4:1 with #1A3169
 * (cream on lavender would be 2.1:1).
 */
export const PAINT_KEYS = ["deep", "blue", "coral", "lavender-ink", "lavender"] as const;
export type PaintKey = (typeof PAINT_KEYS)[number];

export type Paint = {
  paint: string;
  /** The lettering the phrase shows in through the paint. */
  letters: string;
  /** What the paint's streaks and dried edges darken towards. */
  shade: string;
  /** How strongly its streaks darken: a light paint shows them more. */
  streaks: number;
  /** The two colours its drops, dabs and accents are mixed with. */
  companion: string;
  accent: string;
  /** The near-miss: the thin wash it is brushed in, and the strike that crosses it out. */
  decoy: string;
  strike: string;
  /** The strike's weight, as a share of the near-miss's band: a light paint strikes broader. */
  strikeWeight: number;
};

const CREAM = "#FBF4E5";
const INK = "#1A3169";
const LAVENDER_WASH = "#908ACC";

export const PAINTS: Record<PaintKey, Paint> = {
  deep: { paint: "#203E82", letters: CREAM, shade: "#000000", streaks: 1, companion: "#AAA4E6", accent: "#EF5D3C", decoy: LAVENDER_WASH, strike: "#203E82", strikeWeight: 0.17 },
  blue: { paint: "#2C54AA", letters: CREAM, shade: "#000000", streaks: 1, companion: "#AAA4E6", accent: "#203E82", decoy: LAVENDER_WASH, strike: "#2C54AA", strikeWeight: 0.17 },
  coral: { paint: "#B43A26", letters: CREAM, shade: "#000000", streaks: 1, companion: "#EF5D3C", accent: "#AAA4E6", decoy: LAVENDER_WASH, strike: "#B43A26", strikeWeight: 0.17 },
  "lavender-ink": { paint: "#554F91", letters: CREAM, shade: "#000000", streaks: 1, companion: "#AAA4E6", accent: "#EF5D3C", decoy: "#E2735A", strike: "#554F91", strikeWeight: 0.19 },
  // Light lavender strikes broadly across a deep blue wash, so the crossing-out reads as boldly as the others.
  lavender: { paint: "#AAA4E6", letters: INK, shade: "#554F91", streaks: 0.55, companion: "#554F91", accent: "#EF5D3C", decoy: "#203E82", strike: "#AAA4E6", strikeWeight: 0.25 },
};

/**
 * Paints too alike to follow one another: the two blues and the two
 * lavenders differ, but the next painting would not read as a new colour.
 */
const FAMILY: Record<PaintKey, "blue" | "coral" | "lavender"> = { deep: "blue", blue: "blue", coral: "coral", "lavender-ink": "lavender", lavender: "lavender" };

const STORE = "ines-expression-paint";
/** Enough to remember every recent painting without the entry growing for ever. */
const REMEMBERED = 60;

/**
 * `byId` is keyed by student and expression ("student:expression"), so two
 * students on one device keep their own colours. Entries from before it was
 * keyed by student (the expression id alone) are still read as a fallback,
 * and age out as new paintings are remembered.
 */
type Memory = { last: PaintKey | null; byId: Record<string, PaintKey> };

const keyFor = (student: string, id: string) => `${student}:${id}`;

const isPaint = (value: unknown): value is PaintKey => typeof value === "string" && (PAINT_KEYS as readonly string[]).includes(value);

/** FNV-1a over code points: the same string always gives the same number. */
export function hash(value: string) {
  let h = 2166136261;
  for (const character of value) {
    h ^= character.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Browser storage is a convenience on this device: it can be missing, full or
// blocked, and the painting must still render without it.
function read(): Memory {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORE) ?? "null");
    if (!value || typeof value !== "object") return { last: null, byId: {} };
    const record = value as { last?: unknown; byId?: unknown };
    const byId: Record<string, PaintKey> = {};
    if (record.byId && typeof record.byId === "object") {
      for (const [id, paint] of Object.entries(record.byId as Record<string, unknown>)) if (isPaint(paint)) byId[id] = paint;
    }
    return { last: isPaint(record.last) ? record.last : null, byId };
  } catch {
    return { last: null, byId: {} };
  }
}

function write(memory: Memory) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(memory));
  } catch {
    // Nothing to do: the next painting simply may not know the last colour.
  }
}

/** What this student's expression was painted in here, or a colour its id always gives. */
export function paintFor(student: string, id: string): PaintKey {
  const { byId } = read();
  return byId[keyFor(student, id)] ?? byId[id] ?? PAINT_KEYS[hash(id) % PAINT_KEYS.length];
}

/**
 * The paint for the next painting: never the last one used on this device,
 * nor any colour in `avoid`, nor one of the same family as either.
 */
export function nextPaint(avoid: (PaintKey | null | undefined)[] = []): PaintKey {
  const last = read().last;
  const skip = [last, ...avoid].filter((paint): paint is PaintKey => Boolean(paint));
  const families = new Set(skip.map((paint) => FAMILY[paint]));
  const choices = PAINT_KEYS.filter((paint) => !families.has(FAMILY[paint]));
  const from = choices.length ? choices : PAINT_KEYS.filter((paint) => !skip.includes(paint));
  return from[Math.floor(Math.random() * from.length)];
}

/** Remembers the colour a student's expression was painted in, as the last one used here. */
export function rememberPaint(student: string, id: string, paint: PaintKey) {
  const memory = read();
  const key = keyFor(student, id);
  delete memory.byId[key];
  memory.byId[key] = paint;
  const ids = Object.keys(memory.byId);
  for (const old of ids.slice(0, Math.max(0, ids.length - REMEMBERED))) delete memory.byId[old];
  write({ last: paint, byId: memory.byId });
}

/**
 * About one press in three, the first word or two of an unseen phrase, for the
 * brush to start and cross out before it paints the real one. Only from a pool
 * large enough that it is unlikely to be the phrase about to be painted.
 */
export function chooseDecoy(labels: string[], current?: string | null): string | null {
  if (labels.length < 4 || Math.random() >= 1 / 3) return null;
  const opening = (phrase: string) => {
    const words = phrase.trim().split(/\s+/);
    const two = words.slice(0, 2).join(" ");
    return two.length > 14 ? words[0] : two;
  };
  const avoid = current ? opening(current).toLocaleLowerCase("pt-PT") : "";
  const options = labels.map(opening).filter((fragment) => fragment.length >= 3 && fragment.toLocaleLowerCase("pt-PT") !== avoid);
  return options.length ? options[Math.floor(Math.random() * options.length)] : null;
}
