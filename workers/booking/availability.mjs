import {
  PORTO,
  addDaysToKey,
  dateKey,
  dayBounds,
  eachDateKey,
  parseDateKey,
  weekdayOf,
  zonedToUtc
} from "./time.mjs";

/**
 * Free slots = weekly teaching hours, plus one-off extra windows, minus blocked
 * windows, minus anything overlapping a confirmed booking, minus anything inside
 * the minimum-notice window.
 *
 * Every window is handled as minutes-from-midnight in Porto time and only
 * converted to a UTC instant at the last step, so a DST day yields the hours she
 * actually intends to teach rather than the hours arithmetic would give.
 */

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export const DEFAULT_BOOKING_HORIZON_DAYS = 56;
export const DEFAULT_MINIMUM_NOTICE_HOURS = 14;

function mergeStartRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.lastStart) {
      last.lastStart = Math.max(last.lastStart, range.lastStart);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

/**
 * One date's blocked spans as the teacher calendar sends them: whole minutes in
 * Porto time, sorted and merged. Anything malformed rejects the whole request
 * rather than being dropped, so the calendar never shows time off that was not
 * saved. A span covering the whole day is refused too — that is a day off, and
 * stored as a partial block it would outlive the next change to the day's times.
 */
export function normaliseBlockedSpans(blocks) {
  if (!Array.isArray(blocks) || blocks.length > 96) return null;
  const spans = [];
  for (const block of blocks) {
    const start = block?.startMinute;
    const end = block?.endMinute;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start) return null;
    spans.push({ start, end });
  }
  const merged = [];
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push(span);
  }
  return merged.some((span) => span.start === 0 && span.end === 1440) ? null : merged;
}

/**
 * Candidate start times (minutes from midnight, Porto) for one day.
 *
 * `startRanges` are {start, lastStart} — both are *start* times, so a lesson
 * beginning at lastStart may legitimately finish after it. `blockedSpans` are
 * real spans of time: a lesson is withheld when it would overlap one, not
 * merely when it begins inside one.
 */
export function candidateStartMinutes({ startRanges, blockedSpans = [], duration, interval }) {
  const starts = [];

  for (const range of mergeStartRanges(startRanges)) {
    for (let minute = range.start; minute <= range.lastStart; minute += interval) {
      if (blockedSpans.some((span) => overlaps(minute, minute + duration, span.start, span.end))) continue;
      starts.push(minute);
    }
  }

  return starts;
}

export async function loadSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const settings = Object.fromEntries((results ?? []).map((row) => [row.key, row.value]));

  return {
    minimumNoticeHours: Number(settings.minimum_notice_hours ?? DEFAULT_MINIMUM_NOTICE_HOURS),
    // Matches what seed.sql writes. The two disagreed for a while, which meant
    // a database missing the row behaved differently from every real one.
    bookingHorizonDays: Number(settings.booking_horizon_days ?? DEFAULT_BOOKING_HORIZON_DAYS),
    slotIntervalMinutes: Number(settings.slot_interval_minutes ?? 30),
    sameDayChangeFeeCents: Number(settings.same_day_change_fee_cents ?? 500),
    // 'off' preserves the original pay-in-person flow. 'postpay' saves a card
    // at booking and charges it only when the lesson ends. The retired
    // 'prepay' value remains readable only so a half-finished rollout fails
    // visibly rather than silently behaving as pay-in-person.
    paymentMode: ["postpay", "prepay"].includes(settings.payment_mode) ? settings.payment_mode : "off",
    teacherName: settings.teacher_name || "Inês Dias Baía",
    teacherEmail: settings.teacher_email || "",
    replyToEmail: settings.reply_to_email || ""
  };
}

export async function loadLessonType(env, id) {
  return env.DB.prepare("SELECT * FROM lesson_types WHERE id = ? AND active = 1").bind(id).first();
}

export async function listLessonTypes(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, slug, name, description, duration_minutes, price_cents FROM lesson_types WHERE active = 1 ORDER BY sort_order"
  ).all();
  return results ?? [];
}

/**
 * @param ignoreBookingId lets a reschedule offer the slot the booking already
 *        occupies, instead of the student's own lesson blocking their move.
 * @param ignoreSeriesId does the same for every future occurrence while a
 *        whole weekly sequence is being moved.
 */
export async function computeAvailability(
  env,
  { fromKey, toKey, lessonType, now, ignoreBookingId = null, ignoreSeriesId = null, ignoreHorizon = false }
) {
  const settings = await loadSettings(env);
  const duration = Number(lessonType.duration_minutes);
  const interval = settings.slotIntervalMinutes;

  const todayKey = dateKey(now, PORTO);
  /*
   * The horizon stops a stranger reaching in and taking a slot months out. A
   * student holding their own standing weekly time is the case it is meant to
   * allow, not the one it is meant to stop — and with a 30-day horizon a
   * twelve-week booking would silently become a four-week one. So a series is
   * checked against her actual teaching hours without it.
   */
  const horizonKey = addDaysToKey(todayKey, settings.bookingHorizonDays);
  const start = fromKey < todayKey ? todayKey : fromKey;
  const end = !ignoreHorizon && toKey > horizonKey ? horizonKey : toKey;
  if (!parseDateKey(start) || !parseDateKey(end) || start > end) return { slots: [], settings };

  const earliest = new Date(now.getTime() + settings.minimumNoticeHours * 3600000);

  const windowStart = dayBounds(start).start.toISOString();
  const windowEnd = dayBounds(end).end.toISOString();

  const [rules, exceptions, booked] = await Promise.all([
    env.DB.prepare("SELECT weekday, start_minute, last_start_minute FROM availability_rules WHERE active = 1").all(),
    // One-off overrides in range, plus every recurring weekly block.
    env.DB.prepare(
      `SELECT date, weekday, kind, start_minute, end_minute FROM availability_exceptions
       WHERE (date BETWEEN ? AND ?) OR weekday IS NOT NULL`
    )
      .bind(start, end)
      .all(),
    // A slot is busy when it is confirmed, and also while it is held for a
    // checkout that has not been abandoned yet — otherwise two students could
    // pay for the same time. An expired hold stops counting automatically.
    env.DB.prepare(
      `SELECT id, series_id, starts_at, ends_at FROM bookings
       WHERE ends_at > ? AND starts_at < ?
         AND (status = 'confirmed' OR (status = 'pending_payment' AND hold_expires_at > ?))`
    )
      .bind(windowStart, windowEnd, now.toISOString())
      .all()
  ]);

  const rulesByWeekday = new Map();
  for (const rule of rules.results ?? []) {
    const list = rulesByWeekday.get(rule.weekday) ?? [];
    list.push({ start: rule.start_minute, lastStart: rule.last_start_minute });
    rulesByWeekday.set(rule.weekday, list);
  }

  const exceptionsByDate = new Map();
  const recurringByWeekday = new Map();

  for (const exception of exceptions.results ?? []) {
    if (exception.weekday !== null && exception.weekday !== undefined) {
      const list = recurringByWeekday.get(exception.weekday) ?? [];
      list.push(exception);
      recurringByWeekday.set(exception.weekday, list);
      continue;
    }

    const list = exceptionsByDate.get(exception.date) ?? [];
    list.push(exception);
    exceptionsByDate.set(exception.date, list);
  }

  const busy = (booked.results ?? [])
    .filter((row) => (!ignoreBookingId || row.id !== ignoreBookingId) && (!ignoreSeriesId || row.series_id !== ignoreSeriesId))
    .map((row) => ({ start: new Date(row.starts_at).getTime(), end: new Date(row.ends_at).getTime() }));

  const slotsByDate = {};

  for (const key of eachDateKey(start, end)) {
    const dayExceptions = [
      ...(recurringByWeekday.get(weekdayOf(key)) ?? []),
      ...(exceptionsByDate.get(key) ?? [])
    ];

    // Bookable *start* ranges: first start .. last start. The last start is a
    // start time, not a finishing time, so "last lesson at 19:00" holds for a
    // 90-minute lesson exactly as it does for a 60-minute one.
    const startRanges = mergeStartRanges([
      ...(rulesByWeekday.get(weekdayOf(key)) ?? []),
      ...dayExceptions
        .filter((exception) => exception.kind === "extra")
        .map((exception) => ({ start: exception.start_minute ?? 0, lastStart: exception.end_minute ?? 1440 }))
    ]);

    // Blocked exceptions are real spans of time, not start ranges: a lesson is
    // withheld when it would *overlap* one, not merely when it starts inside it.
    // A blocked row with no window means the whole day is off.
    const blockedSpans = dayExceptions
      .filter((exception) => exception.kind === "blocked")
      .map((exception) => ({ start: exception.start_minute ?? 0, end: exception.end_minute ?? 1440 }));

    const { year, month, day } = parseDateKey(key);
    const daySlots = [];

    for (const minute of candidateStartMinutes({ startRanges, blockedSpans, duration, interval })) {
      const slotStart = zonedToUtc(year, month, day, minute, PORTO);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      if (slotStart < earliest) continue;
      if (busy.some((entry) => overlaps(slotStart.getTime(), slotEnd.getTime(), entry.start, entry.end))) continue;

      daySlots.push({ startAt: slotStart.toISOString(), endAt: slotEnd.toISOString() });
    }

    if (daySlots.length) slotsByDate[key] = daySlots;
  }

  return { slotsByDate, settings };
}

/**
 * Authoritative re-check at write time. Availability shown to a student is a
 * snapshot; this is what actually decides, and it closes the window where two
 * people pick the same slot seconds apart.
 */
export async function isSlotBookable(
  env,
  { startAt, lessonType, now, ignoreBookingId = null, ignoreSeriesId = null, ignoreHorizon = false }
) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "That time could not be understood." };

  const key = dateKey(start, PORTO);
  const { slotsByDate } = await computeAvailability(env, {
    fromKey: key,
    toKey: key,
    lessonType,
    now,
    ignoreBookingId,
    ignoreSeriesId,
    ignoreHorizon
  });

  const match = (slotsByDate?.[key] ?? []).some((slot) => slot.startAt === start.toISOString());
  if (match) return { ok: true, endAt: new Date(start.getTime() + lessonType.duration_minutes * 60000) };

  /*
   * Say which of these it was. One message covered all of them, so a student
   * trying to book tomorrow morning inside the notice window was told the slot
   * had "just been taken" — which is not true, and sends them off to pick
   * another time that will refuse them for the same reason.
   */
  const settings = await loadSettings(env);
  const noticeCutoff = new Date(now.getTime() + settings.minimumNoticeHours * 3600000);
  if (start < noticeCutoff) {
    const hours = settings.minimumNoticeHours;
    return {
      ok: false,
      reason: `That's too soon. Inês needs at least ${hours} hour${hours === 1 ? "" : "s"}' notice. Please choose a later time.`
    };
  }

  const horizonKey = addDaysToKey(dateKey(now, PORTO), settings.bookingHorizonDays);
  if (!ignoreHorizon && key > horizonKey) {
    return { ok: false, reason: "That's further ahead than booking is open. Please choose an earlier date." };
  }

  return { ok: false, reason: "That time has just been taken or is no longer available. Please choose another." };
}
