/**
 * The paints a student's expression can be painted in (13 October 2026, at
 * Dan's request that each painting be a different colour on top). Each one
 * carries the cream lettering at AA or better: deep blue 9.3:1, blue 6.5:1,
 * coral 5.4:1 and lavender ink 6.6:1 against #FBF4E5.
 */
export const PAINT_KEYS = ["deep", "blue", "coral", "lavender"] as const;
export type PaintKey = (typeof PAINT_KEYS)[number];

/** The paint, then the two colours its drops, dabs and accents are mixed with. */
export const PAINTS: Record<PaintKey, { paint: string; companion: string; accent: string }> = {
  deep: { paint: "#203E82", companion: "#AAA4E6", accent: "#EF5D3C" },
  blue: { paint: "#2C54AA", companion: "#AAA4E6", accent: "#203E82" },
  coral: { paint: "#B43A26", companion: "#EF5D3C", accent: "#AAA4E6" },
  lavender: { paint: "#554F91", companion: "#AAA4E6", accent: "#EF5D3C" },
};

const STORE = "ines-expression-paint";
/** Enough to remember every recent painting without the entry growing for ever. */
const REMEMBERED = 60;

type Memory = { last: PaintKey | null; byId: Record<string, PaintKey> };

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

/** What this expression was painted in here, or a colour its id always gives. */
export function paintFor(id: string): PaintKey {
  return read().byId[id] ?? PAINT_KEYS[hash(id) % PAINT_KEYS.length];
}

/** The paint for the next painting: never the last one used on this device, nor any colour in `avoid`. */
export function nextPaint(avoid: (PaintKey | null | undefined)[] = []): PaintKey {
  const skip = new Set([read().last, ...avoid]);
  const choices = PAINT_KEYS.filter((paint) => !skip.has(paint));
  const from = choices.length ? choices : PAINT_KEYS.filter((paint) => paint !== read().last);
  return from[Math.floor(Math.random() * from.length)];
}

/** Remembers the colour an expression was painted in, as the last one used here. */
export function rememberPaint(id: string, paint: PaintKey) {
  const memory = read();
  delete memory.byId[id];
  memory.byId[id] = paint;
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
