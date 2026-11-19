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

/**
 * A student's price for a lesson type now, as SQL, as `studentLessonType`
 * reads it: their own rate, a 90 derived from their 60, else the standard
 * price; a trial keeps its own. `type` is a lesson_types alias and `student`
 * SQL for the student's id (a column, or `?`, bound twice).
 */
export function studentTypePriceSql(type, student) {
  return `(CASE WHEN ${type}.id = 'trial' THEN ${type}.price_cents ELSE COALESCE(
      (SELECT amount_cents FROM student_recurring_rates WHERE student_id = ${student} AND duration_minutes = ${type}.duration_minutes),
      CASE WHEN ${type}.duration_minutes = 90 THEN
        (SELECT ROUND(amount_cents * 1.5) FROM student_recurring_rates WHERE student_id = ${student} AND duration_minutes = 60)
      END, ${type}.price_cents) END)`;
}

/** A new lesson may use its quote only while that effective price still holds. */
export function lessonPriceSnapshotSql() {
  return `EXISTS (SELECT 1 FROM lesson_types quoted_type WHERE quoted_type.id = ?
    AND ${studentTypePriceSql("quoted_type", "?")} = ?)`;
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

/**
 * Atomic fixed windows bound parallel guesses as well as sequential requests.
 * A window is stored as its start in epoch seconds, whatever its length, so
 * one nightly cleanup can tell an old hour from a current quarter-hour.
 */
export async function takeRateLimit(env, key, limit, seconds = 900, now = Date.now()) {
  const window = Math.floor(now / (seconds * 1000)) * seconds;
  const result = await env.DB.prepare(
    `INSERT INTO request_limits (key, window, attempts) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET window = excluded.window,
       attempts = CASE WHEN request_limits.window = excluded.window THEN attempts + 1 ELSE 1 END
     WHERE request_limits.window != excluded.window OR request_limits.attempts < ?`
  ).bind(key, window, limit).run();
  return (result?.meta?.changes ?? 0) > 0;
}
// A decision can contain several dates or two weekly recipes. Mark its first
// booking once, and keep legacy rows/recipes counting as they did before these
// markers existed. All joins use the existing request_limits primary key.
const RECENT_BOOKING_USAGE = `SELECT
  (SELECT COALESCE(SUM(COALESCE(decision.attempts, CASE WHEN b.series_id IS NULL THEN 1 ELSE 0 END)), 0)
   FROM bookings b LEFT JOIN request_limits decision ON decision.key = 'booking:' || b.id
   WHERE b.student_id = ? AND b.created_at > ?)
  + (SELECT COUNT(*) FROM booking_series s WHERE s.student_id = ? AND s.created_at > ?
     AND NOT EXISTS (SELECT 1 FROM request_limits WHERE key = 'booking-series:' || s.id)) AS acts,
  (SELECT COUNT(*) FROM bookings WHERE student_id = ? AND created_at > ?)
  + (SELECT COALESCE(SUM(reservation.attempts), 0) FROM bookings anchor
     JOIN request_limits reservation ON reservation.key = 'booking-reserved:' || anchor.id
     WHERE anchor.student_id = ? AND anchor.created_at > ?) AS lessons`;

function bookingUsageValues(studentId, now) {
  const since = new Date(now.getTime() - 3600000).toISOString();
  return [studentId, since, studentId, since, studentId, since, studentId, since];
}

export async function recentBookingUsage(env, studentId, now) {
  return env.DB.prepare(RECENT_BOOKING_USAGE).bind(...bookingUsageValues(studentId, now)).first();
}

/** Rechecked inside the write, including space reserved by another new run. */
export function bookingBudget(studentId, now, lessons = 1) {
  return {
    sql: `EXISTS (SELECT 1 FROM (${RECENT_BOOKING_USAGE}) WHERE acts < 5 AND lessons + ? <= 26)`,
    values: [...bookingUsageValues(studentId, now), lessons]
  };
}

/** Written in the same transaction as the rows they describe. */
export function prepareBookingMarkers(env, { rows = [], series = [], now, reserve = 0 }) {
  const stamp = Math.floor(now.getTime() / 1000);
  return env.DB.prepare(
    `INSERT INTO request_limits (key, window, attempts)
     SELECT 'booking:' || id, ?, CASE WHEN id = ? THEN 1 ELSE 0 END
       FROM bookings WHERE id IN (SELECT value FROM json_each(?))
     UNION ALL SELECT 'booking-series:' || id, ?, 0
       FROM booking_series WHERE id IN (SELECT value FROM json_each(?))
     UNION ALL SELECT 'booking-reserved:' || id, ?, ?
       FROM bookings WHERE id = ? AND ? > 0`
  ).bind(stamp, rows[0] ?? null, JSON.stringify(rows), stamp, JSON.stringify(series), stamp, reserve, rows[0] ?? null, reserve);
}
