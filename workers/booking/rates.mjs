/** The code catalogue is a private Worker binding, never a shipped asset. */
export function findRecurringCode(catalogue, input, duration) {
  if (typeof input !== "string" || input.length > 40 || ![60, 90].includes(duration)) return null;
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{4}\d{2}$/.test(code)) return null;
  let entries;
  try { entries = JSON.parse(catalogue || "[]"); } catch { return null; }
  if (!Array.isArray(entries)) return null;
  const match = entries.find((entry) => entry.code === code && entry.duration === duration);
  if (!match || !Number.isInteger(match.cents) || match.cents < 100 || match.cents > 10000) return null;
  return { duration, cents: match.cents };
}

export async function recurringRates(env, studentId) {
  const { results } = await env.DB.prepare(
    "SELECT duration_minutes, amount_cents FROM student_recurring_rates WHERE student_id = ?"
  ).bind(studentId).all();
  return Object.fromEntries((results ?? []).map((row) => [row.duration_minutes, row.amount_cents]));
}

export async function recurringLessonType(env, studentId, lessonType) {
  if (lessonType.id === "trial" || !studentId) return lessonType;
  const rates = await recurringRates(env, studentId);
  return { ...lessonType, price_cents: rates[lessonType.duration_minutes] ?? lessonType.price_cents };
}

/** A move of the same duration preserves the price already agreed for that row. */
export async function priceForMove(env, row, lessonType) {
  if (row.lesson_type_id === lessonType.id) return row.amount_cents ?? lessonType.price_cents;
  const priced = row.series_id ? await recurringLessonType(env, row.student_id, lessonType) : lessonType;
  return priced.price_cents;
}

/**
 * The rate-limit key for a connecting address. IPv4 is used as it is. An IPv6
 * client is usually given a whole /64 and can rotate through it at will, so it
 * counts as that prefix; an IPv4-mapped address is the IPv4 client it carries.
 * The URL parser reads the IPv6, so every spelling of one address (compressed,
 * zero-padded, upper case, dotted tail) lands on the same key.
 */
export function rateLimitAddress(value) {
  const address = String(value ?? "").trim();
  if (!address.includes(":")) return address || "local";
  let host = "";
  try {
    if (/^[0-9a-f:.]+$/i.test(address)) host = new URL(`http://[${address}]`).hostname.slice(1, -1);
  } catch {
    // Not a valid IPv6 address after all, so it is keyed as it came.
  }
  if (!host) return address;
  const [head, tail = ""] = host.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const pieces = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right].map((piece) => parseInt(piece, 16));
  if (pieces.slice(0, 5).every((piece) => piece === 0) && pieces[5] === 0xffff) {
    return [pieces[6] >> 8, pieces[6] & 255, pieces[7] >> 8, pieces[7] & 255].join(".");
  }
  return `${pieces.slice(0, 4).map((piece) => piece.toString(16)).join(":")}::/64`;
}

/** Atomic fixed windows bound parallel guesses as well as sequential requests. */
export async function takeRateLimit(env, key, limit, seconds = 900, now = Date.now()) {
  const window = Math.floor(now / (seconds * 1000));
  const result = await env.DB.prepare(
    `INSERT INTO request_limits (key, window, attempts) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET window = excluded.window,
       attempts = CASE WHEN request_limits.window = excluded.window THEN attempts + 1 ELSE 1 END
     WHERE request_limits.window != excluded.window OR request_limits.attempts < ?`
  ).bind(key, window, limit).run();
  return (result?.meta?.changes ?? 0) > 0;
}
