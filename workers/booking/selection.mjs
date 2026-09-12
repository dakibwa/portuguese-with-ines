import { PORTO, addDaysToKey, dateKey } from "./time.mjs";

/** Calendar weeks are Monday–Sunday in Porto, including across DST/year changes. */
export function portoWeekOf(startAt) {
  const key = dateKey(new Date(startAt), PORTO);
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return addDaysToKey(key, -((weekday + 6) % 7));
}

export function bookingSelection(body, { recurring = false, durationMinutes = 60, trial = false } = {}) {
  const values = "startAts" in body ? body.startAts : [body.startAt];
  if (!Array.isArray(values) || !values.length || (trial && values.length !== 1)) {
    return { error: trial ? "A trial is one first lesson." : "Choose at least one lesson time." };
  }
  if (values.some((value) => typeof value !== "string" || !Number.isFinite(Date.parse(value)))) {
    return { error: "Choose a valid date and time for each lesson." };
  }
  const starts = values.map((value) => new Date(value).toISOString()).sort();
  if (starts.some((start, index) => index && Date.parse(start) < Date.parse(starts[index - 1]) + durationMinutes * 60000)) {
    return { error: "Choose different times that do not overlap." };
  }
  if (recurring && starts.some((start) => portoWeekOf(start) !== portoWeekOf(starts[0]))) {
    return { error: "Choose all starting times in the same Monday–Sunday week in Porto." };
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
 */
export async function claimSelection(env, { rows, series, now }) {
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
             AND occupied.starts_at < json_extract(proposed.value, '$.ends_at')
             AND occupied.ends_at > json_extract(proposed.value, '$.starts_at')
         ) AS available
       )
     INSERT INTO bookings (${BOOKING_COLUMNS.join(", ")})
     SELECT ${BOOKING_COLUMNS.map((column) => `json_extract(value, '$.${column}')`).join(", ")}
     FROM candidates WHERE (SELECT available FROM free)`
  ).bind(JSON.stringify(rows), now.toISOString()));
  // If the whole claim lost a race, remove only this request's empty recipes
  // before committing. A SQL error rolls the entire D1 batch back.
  for (const entry of series) statements.push(env.DB.prepare(
    "DELETE FROM booking_series WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE series_id = ?)"
  ).bind(entry.id, entry.id));
  const results = await env.DB.batch(statements);
  return results[claimIndex]?.meta?.changes === rows.length;
}
