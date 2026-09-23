/**
 * Recurring bookings — the same slot, week after week.
 *
 * The design decision worth knowing: a series does not generate lessons at read
 * time. Each occurrence is an ordinary row in `bookings`, created up front, and
 * the series is only the recipe that made them. That is what lets Inês's
 * calendar genuinely hold the time, and it means every per-lesson behaviour
 * already built keeps working without knowing series exist — the manage link,
 * the iCalendar UID and SEQUENCE, the same-day fee, moving one week because of
 * a dentist appointment. Cancelling the series is a separate act from
 * cancelling next Wednesday, and a student can do either.
 *
 * The slot is stored as a Porto weekday plus minutes-from-midnight rather than
 * a UTC time, so "Wednesdays at 17:30" stays 17:30 across a daylight-saving
 * change instead of drifting to 16:30 for half the year.
 */

import { isSlotBookable } from "./availability.mjs";
import { PORTO, addDaysToKey, dateKey, parseDateKey, zonedParts, zonedToUtc } from "./time.mjs";

/**
 * The three bounded runs offered by the booking flow.
 */
export const SERIES_LENGTHS = [4, 6, 8];

/**
 * How far ahead an open-ended series is kept booked. Far enough that a student
 * always sees a run of lessons in front of them, near enough that ending the
 * series does not mean unpicking half a year of her calendar.
 */
export const OPEN_ENDED_HORIZON_WEEKS = 12;

/** A hard ceiling on one request, whatever is asked for. */
const MAX_OCCURRENCES_PER_RUN = 16;

export function normaliseWeeks(value) {
  if (value === null || value === "open") return null;
  const weeks = Number(value);
  return SERIES_LENGTHS.includes(weeks) ? weeks : undefined;
}

/**
 * The Porto weekday and minute-of-day a given instant falls on — the two
 * numbers that define the slot for every later week.
 */
export function slotOf(startAt) {
  const start = new Date(startAt);
  const { year, month, day, hour, minute } = zonedParts(start, PORTO);
  // getUTCDay on a UTC-midnight of the Porto date gives the Porto weekday
  // without being pushed over a boundary by the offset.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { weekday, minuteOfDay: hour * 60 + minute, dateKey: dateKey(start, PORTO) };
}

/**
 * The instants a weekly slot lands on, starting from `fromKey` inclusive.
 *
 * Built from date keys rather than by adding 7×24 hours: adding hours drifts an
 * hour when the clocks change, which would quietly move every lesson in the
 * back half of a series.
 */
export function occurrenceInstants({ fromKey, minuteOfDay, count }) {
  const out = [];
  let key = fromKey;
  for (let i = 0; i < count; i += 1) {
    const parsed = parseDateKey(key);
    if (!parsed) break;
    out.push({ key, startAt: zonedToUtc(parsed.year, parsed.month, parsed.day, minuteOfDay, PORTO) });
    key = addDaysToKey(key, 7);
  }
  return out;
}

/**
 * Which of the proposed weeks can actually be booked.
 *
 * Every week is checked on its own and an unavailable one is skipped rather
 * than failing the run — a single holiday in week six should not stop someone
 * booking the other eleven. The skipped dates are returned so the student is
 * told before they commit, never after.
 */
export async function planOccurrences(env, { fromKey, minuteOfDay, count, lessonType, now, ignoreBookingId = null, ignoreHoldsOf = null }) {
  const wanted = occurrenceInstants({ fromKey, minuteOfDay, count: Math.min(count, MAX_OCCURRENCES_PER_RUN) });

  const bookable = [];
  const skipped = [];
  for (const occurrence of wanted) {
    const check = await isSlotBookable(env, {
      startAt: occurrence.startAt.toISOString(),
      lessonType,
      now,
      ignoreBookingId,
      ignoreHoldsOf,
      // A weekly slot is checked against her real teaching hours, not against
      // the 30-day counter that governs walk-up bookings. Without this a
      // twelve-week booking would quietly become a four-week one.
      ignoreHorizon: true
    });
    if (check.ok) bookable.push({ ...occurrence, endAt: check.endAt });
    else skipped.push({ key: occurrence.key, startAt: occurrence.startAt.toISOString(), reason: check.reason });
  }

  return { bookable, skipped };
}

/**
 * How many weeks a series still owes, and from which date.
 *
 * A bounded run counts what it has already created; an open-ended one is simply
 * pulled forward to the horizon. Returns null when there is nothing to do, so
 * the caller can skip the work entirely on the common path.
 */
export function outstandingFor(series, { bookedCount, now }) {
  const todayKey = dateKey(now, PORTO);
  const startKey = series.filled_to ? addDaysToKey(series.filled_to, 7) : todayKey;

  if (series.occurrences === null || series.occurrences === undefined) {
    const horizonKey = addDaysToKey(todayKey, OPEN_ENDED_HORIZON_WEEKS * 7);
    if (startKey > horizonKey) return null;
    const weeks = Math.ceil((Date.parse(horizonKey) - Date.parse(startKey)) / (7 * 86400000)) + 1;
    return { fromKey: startKey, count: Math.max(0, Math.min(weeks, MAX_OCCURRENCES_PER_RUN)) };
  }

  const remaining = series.occurrences - bookedCount;
  if (remaining <= 0) return null;
  return { fromKey: startKey, count: Math.min(remaining, MAX_OCCURRENCES_PER_RUN) };
}
