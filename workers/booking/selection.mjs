import { PORTO, addDaysToKey, dateKey } from "./time.mjs";

export const MAX_SINGLE_SELECTIONS = 8;

/** Calendar weeks are Monday–Sunday in Porto, including across DST/year changes. */
export function portoWeekOf(startAt) {
  const key = dateKey(new Date(startAt), PORTO);
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return addDaysToKey(key, -((weekday + 6) % 7));
}

export function bookingSelection(body, { recurring = false, durationMinutes = 60, trial = false } = {}) {
  const values = "startAts" in body ? body.startAts : [body.startAt];
  const limit = trial ? 1 : recurring ? 2 : MAX_SINGLE_SELECTIONS;
  if (!Array.isArray(values) || !values.length || values.length > limit) {
    return { error: trial ? "A trial is one first lesson." : recurring
      ? "Choose one or two weekly times." : `Choose between one and ${limit} lessons.` };
  }
  if (values.some((value) => typeof value !== "string" || !Number.isFinite(Date.parse(value)))) {
    return { error: "Choose a valid date and time for each lesson." };
  }
  const starts = values.map((value) => new Date(value).toISOString()).sort();
  if (starts.some((start, index) => index && Date.parse(start) < Date.parse(starts[index - 1]) + durationMinutes * 60000)) {
    return { error: "Choose different times that do not overlap." };
  }
  if (recurring && starts.some((start) => portoWeekOf(start) !== portoWeekOf(starts[0]))) {
    return { error: "Choose both starting times in the same Monday–Sunday week in Porto." };
  }
  return { starts };
}

const BOOKING_COLUMNS = [
  "id", "reference", "lesson_type_id", "student_id", "student_name", "student_email", "student_phone",
  "student_timezone", "location", "notes", "starts_at", "ends_at", "status", "sequence", "created_at",
  "updated_at", "payment_status", "amount_cents", "hold_expires_at", "series_id", "payment_consent_at",
  "payment_consent_version"
];
const SERIES_COLUMNS = [
  "id", "student_id", "lesson_type_id", "location", "notes", "weekday", "minute_of_day", "occurrences",
  "status", "filled_to", "automatic_payment", "payment_consent_at", "payment_consent_version", "created_at", "updated_at"
];

/**
 * One transaction claims every planned occurrence or none of them. The free
 * check is materialized before INSERT, so the second candidate does not see
 * the first candidate as a competing booking. A concurrent claimant is checked
 * inside the write, rather than trusted from the earlier availability preview.
 * Existing tables and per-lesson payment/management semantics stay the owners.
 *
 * Each candidate is checked across its lesson plus `bufferMinutes` either side,
 * which keeps that much free time between it and every other lesson. Only the
 * booking columns are inserted, so the guard span never reaches the table.
 */
export async function claimSelection(env, { rows, series, now, bufferMinutes = 0 }) {
  const gapMs = bufferMinutes * 60000;
  const candidates = rows.map((row) => ({
    ...row,
    guard_start: new Date(Date.parse(row.starts_at) - gapMs).toISOString(),
    guard_end: new Date(Date.parse(row.ends_at) + gapMs).toISOString()
  }));
  const statements = series.map((entry) => env.DB.prepare(
    `INSERT INTO booking_series (${SERIES_COLUMNS.join(", ")}) VALUES (${SERIES_COLUMNS.map(() => "?").join(", ")})`
  ).bind(...SERIES_COLUMNS.map((column) => entry[column] ?? null)));
  const claimIndex = statements.length;
  statements.push(env.DB.prepare(
    `WITH candidates AS MATERIALIZED (SELECT value FROM json_each(?1)),
       free AS MATERIALIZED (
         SELECT NOT EXISTS (
           SELECT 1 FROM bookings occupied, candidates proposed
           WHERE (occupied.status = 'confirmed' OR (occupied.status = 'pending_payment' AND occupied.hold_expires_at > ?2))
             AND occupied.starts_at < json_extract(proposed.value, '$.guard_end')
             AND occupied.ends_at > json_extract(proposed.value, '$.guard_start')
         ) AS available
       )
     INSERT INTO bookings (${BOOKING_COLUMNS.join(", ")})
     SELECT ${BOOKING_COLUMNS.map((column) => `json_extract(value, '$.${column}')`).join(", ")}
     FROM candidates WHERE (SELECT available FROM free)`
  ).bind(JSON.stringify(candidates), now.toISOString()));
  // If the whole claim lost a race, remove only this request's empty recipes
  // before committing. A SQL error rolls the entire D1 batch back.
  for (const entry of series) statements.push(env.DB.prepare(
    "DELETE FROM booking_series WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE series_id = ?)"
  ).bind(entry.id, entry.id));
  const results = await env.DB.batch(statements);
  return results[claimIndex]?.meta?.changes === rows.length;
}
