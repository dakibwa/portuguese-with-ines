/**
 * The code catalogue is a private Worker binding, never a shipped asset.
 *
 * A code is listed for one lesson length, so the length is optional. Booking
 * is pricing a length it already knows and passes it, and the code has to be
 * for that length. The profile has no length to give and takes it from the
 * code. A code the catalogue lists for two lengths is refused rather than
 * guessed at, since a wrong guess would save the wrong price.
 */
export function findRecurringCode(catalogue, input, duration) {
  if (typeof input !== "string" || input.length > 40) return null;
  const anyLength = duration === undefined || duration === null;
  if (!anyLength && ![60, 90].includes(duration)) return null;
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{4}\d{2}$/.test(code)) return null;
  let entries;
  try { entries = JSON.parse(catalogue || "[]"); } catch { return null; }
  if (!Array.isArray(entries)) return null;
  const matches = entries.filter((entry) => entry?.code === code && (anyLength || entry.duration === duration));
  const match = matches[0];
  if (!match || matches.some((entry) => entry.duration !== match.duration)) return null;
  if (![60, 90].includes(match.duration) || !Number.isInteger(match.cents) || match.cents < 100 || match.cents > 10000) return null;
  return { duration: match.duration, cents: match.cents };
}

/**
 * A student's own price for each lesson length, from a code they added or set
 * by Inês (13 October 2026, Dan: "Inês should be able to set students custom
 * prices"). It prices every lesson of theirs at that length, one-off or
 * weekly; the trial keeps its own price.
 */
export async function studentRates(env, studentId) {
  const { results } = await env.DB.prepare(
    "SELECT duration_minutes, amount_cents FROM student_recurring_rates WHERE student_id = ?"
  ).bind(studentId).all();
  return withDerived(Object.fromEntries((results ?? []).map((row) => [row.duration_minutes, row.amount_cents])));
}

/**
 * By definition a student's 90-minute lesson is 1.5 times their own
 * 60-minute price (13 October 2026, Dan), unless a 90-minute price of its
 * own was set or redeemed, which always wins.
 */
export function withDerived(rates) {
  if (rates[60] === undefined || rates[90] !== undefined) return rates;
  return { ...rates, 90: Math.round(rates[60] * 1.5) };
}

export async function studentLessonType(env, studentId, lessonType) {
  if (lessonType.id === "trial" || !studentId) return lessonType;
  const rates = await studentRates(env, studentId);
  return { ...lessonType, price_cents: rates[lessonType.duration_minutes] ?? lessonType.price_cents };
}

/** A new lesson may use its quote only while that effective price still holds. */
export function lessonPriceSnapshotSql() {
  return `EXISTS (SELECT 1 FROM lesson_types quoted_type WHERE quoted_type.id = ?
    AND (CASE WHEN quoted_type.id = 'trial' THEN quoted_type.price_cents ELSE COALESCE(
      (SELECT amount_cents FROM student_recurring_rates WHERE student_id = ? AND duration_minutes = quoted_type.duration_minutes),
      CASE WHEN quoted_type.duration_minutes = 90 THEN
        (SELECT ROUND(amount_cents * 1.5) FROM student_recurring_rates WHERE student_id = ? AND duration_minutes = 60)
      END, quoted_type.price_cents) END) = ?)`;
}

export function lessonPriceSnapshot(studentId, lessonType) {
  return [lessonType.id, studentId, studentId, lessonType.price_cents];
}

/** A move of the same duration preserves the price already agreed for that row. */
export async function priceForMove(env, row, lessonType) {
  if (row.lesson_type_id === lessonType.id) return row.amount_cents ?? lessonType.price_cents;
  return (await studentLessonType(env, row.student_id, lessonType)).price_cents;
}

/**
 * Inês's price for one length: whole euro cents in the same bounds as a code's,
 * or 0, which makes that length free (16 October 2026, Dan). A code is never
 * free; only she can make a lesson cost nothing.
 */
export function teacherRate(value) {
  if (value === null || value === "") return null;
  return Number.isInteger(value) && (value === 0 || (value >= 100 && value <= 10000)) ? value : undefined;
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
