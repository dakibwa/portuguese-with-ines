// Imported straight from the record, not through @/lib/tutor: the calendar
// tests load this file in plain Node, which knows no "@/" paths.
import tutor from "../../tutors/ines/tutor.json" with { type: "json" };

import type {
  AdminBooking,
  AdminStudent,
  AvailabilityException,
  AvailabilityRule,
  GoogleMeetConnection,
  OnlineOnlyPeriod,
  PaymentReview,
} from "./admin-api";

const TUTOR_TIME_ZONE = tutor.place.timeZone;

export const WEEKDAYS = [
  { value: 1, name: "Monday", short: "Mon" },
  { value: 2, name: "Tuesday", short: "Tue" },
  { value: 3, name: "Wednesday", short: "Wed" },
  { value: 4, name: "Thursday", short: "Thu" },
  { value: 5, name: "Friday", short: "Fri" },
  { value: 6, name: "Saturday", short: "Sat" },
  { value: 0, name: "Sunday", short: "Sun" },
];

export type TeachingWindow = { start: number; lastStart: number };
export type WeekHours = Record<number, TeachingWindow[]>;

export function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TUTOR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDate(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(key: string) {
  const day = new Date(`${key}T12:00:00Z`).getUTCDay();
  return shiftDate(key, -((day + 6) % 7));
}

export function dateLabel(
  key: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  },
) {
  return new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}

export function minuteLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function parseMinute(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return Number.NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function hoursFromRules(rules: AvailabilityRule[]): WeekHours {
  const week = Object.fromEntries(
    WEEKDAYS.map((day) => [day.value, []]),
  ) as WeekHours;
  for (const rule of rules) {
    if (rule.active === 0) continue;
    week[rule.weekday].push({
      start: rule.start_minute,
      lastStart: rule.last_start_minute,
    });
  }
  for (const windows of Object.values(week))
    windows.sort((a, b) => a.start - b.start);
  return week;
}

export function serialiseHours(week: WeekHours) {
  return JSON.stringify(
    WEEKDAYS.map((day) =>
      [...(week[day.value] ?? [])].sort((a, b) => a.start - b.start),
    ),
  );
}

export function hoursProblem(week: WeekHours) {
  if (Object.values(week).flat().length > 100)
    return "Please use no more than 100 teaching windows in a week.";
  for (const day of WEEKDAYS) {
    for (const window of week[day.value] ?? []) {
      if (
        !Number.isInteger(window.start) ||
        !Number.isInteger(window.lastStart) ||
        window.start < 0 ||
        window.start > 1439 ||
        window.lastStart > 1440 ||
        window.lastStart < window.start
      ) {
        return `Check ${day.name}’s hours: the last start must be at or after the first.`;
      }
    }
  }
  return null;
}

/** Each teaching window retains the same first-start-anchored grid as the Worker. */
export function lessonStarts(windows: TeachingWindow[], interval = 30) {
  if (!Number.isFinite(interval) || interval < 1) return [];
  const starts = new Set<number>();
  for (const window of windows) {
    if (!Number.isFinite(window.start) || !Number.isFinite(window.lastStart)) continue;
    for (let minute = window.start; minute <= window.lastStart; minute += interval) starts.add(minute);
  }
  return [...starts].sort((a, b) => a - b);
}

/** Booked lessons touched by a changed weekly start time still stay booked. */
export function bookingsAffectedByHours(bookings: AdminBooking[], before: WeekHours, after: WeekHours, interval: number, now: Date) {
  const changes = new Map(WEEKDAYS.map(({ value }) => {
    const saved = new Set(lessonStarts(before[value] ?? [], interval));
    const draft = new Set(lessonStarts(after[value] ?? [], interval));
    return [value, [...new Set([...saved, ...draft])].filter(minute => saved.has(minute) !== draft.has(minute))];
  }));
  return bookings.filter(booking => {
    if (booking.status !== "confirmed" || Date.parse(booking.ends_at) <= now.getTime()) return false;
    const weeks = new Set([mondayOf(dateKey(new Date(booking.starts_at))), mondayOf(dateKey(new Date(Date.parse(booking.ends_at) - 1)))]);
    return [...weeks].some(week => bookingSegments([booking], week).some(segment => {
      const weekday = new Date(`${segment.date}T12:00:00Z`).getUTCDay();
      return changes.get(weekday)?.some(minute => minute >= segment.start && minute < segment.end);
    }));
  }).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function canPaintHours(windows: TeachingWindow[], interval: number) {
  return (
    [15, 30, 60].includes(interval) &&
    windows.every(
      (window) =>
        window.start % interval === 0 &&
        window.lastStart % interval === 0 &&
        window.lastStart < 1440,
    )
  );
}

/** Editing one day never rounds or rewrites another day's existing windows. */
export function paintHours(
  windows: TeachingWindow[],
  from: number,
  to: number,
  available: boolean,
  interval = 30,
): TeachingWindow[] {
  if (!canPaintHours(windows, interval)) return windows;
  const starts = new Set(lessonStarts(windows, interval));
  for (
    let minute = Math.max(0, Math.min(from, to));
    minute <= Math.min(1440 - interval, Math.max(from, to));
    minute += interval
  ) {
    if (available) starts.add(minute);
    else starts.delete(minute);
  }
  const result: TeachingWindow[] = [];
  for (const minute of [...starts].sort((a, b) => a - b)) {
    const last = result.at(-1);
    if (last && last.lastStart + interval === minute) last.lastStart = minute;
    else result.push({ start: minute, lastStart: minute });
  }
  return result;
}

export function isWholeDayOff(exception: AvailabilityException) {
  return (
    exception.kind === "blocked" &&
    exception.weekday == null &&
    (exception.start_minute == null || exception.start_minute === 0) &&
    (exception.end_minute == null || exception.end_minute === 1440)
  );
}

/** Each date taken wholly off, with its note ("Holiday"). */
export function daysOff(exceptions: AvailabilityException[]) {
  const days = new Map<string, string>();
  for (const { date, note } of exceptions.filter(isWholeDayOff))
    if (date)
      days.set(date, [days.get(date), note].filter(Boolean).join(" · "));
  return days;
}

/** A stretch of time in Porto minutes from midnight; `end` is exclusive. */
export type Span = { start: number; end: number };
export type WeeklyBlock = Span & { note: string };

/** Sorted and merged, as the Worker stores them. */
export function mergeSpans(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

export function addSpan(spans: Span[], span: Span) {
  return mergeSpans([...spans, span]);
}

/** Cutting out a stretch keeps whatever precise times lie either side of it. */
export function removeSpan(spans: Span[], cut: Span) {
  return spans.flatMap((span) =>
    cut.end <= span.start || cut.start >= span.end
      ? [span]
      : [
          ...(span.start < cut.start
            ? [{ start: span.start, end: cut.start }]
            : []),
          ...(cut.end < span.end ? [{ start: cut.end, end: span.end }] : []),
        ],
  );
}

/**
 * Extra hours are lesson starts, a step of her booking interval apart from
 * each block's first. Taking a stretch out of them takes the starts inside it
 * and leaves every other start where it was. Cut as plain time, a stretch at
 * minutes off that grid left hours beginning at the cut, and the Worker,
 * which keeps a block as its first and last start, stepped new starts from
 * there: off her grid, and one later than any she had offered.
 */
export function removeStarts(spans: Span[], cut: Span, interval: number) {
  return spans.flatMap((span) => {
    if (cut.end <= span.start || cut.start >= span.end) return [span];
    const kept: Span[] = [];
    for (let start = span.start; start < span.end; start += interval) {
      if (start >= cut.start && start < cut.end) continue;
      const before = kept.at(-1);
      if (before && before.end === start) before.end = Math.min(1440, start + interval);
      else kept.push({ start, end: Math.min(1440, start + interval) });
    }
    return kept;
  });
}

export function overlapsSpan(spans: Span[], start: number, end: number) {
  return spans.some((span) => span.start < end && start < span.end);
}

export function spanLabel(span: Span) {
  return `${minuteLabel(span.start)}–${minuteLabel(span.end)}`;
}

/** One date's blocked hours, not counting a whole day off. */
export function dateBlocks(
  exceptions: AvailabilityException[],
  date: string,
): Span[] {
  return mergeSpans(
    exceptions
      .filter(
        (exception) =>
          exception.kind === "blocked" &&
          exception.weekday == null &&
          exception.date === date &&
          !isWholeDayOff(exception),
      )
      .map((exception) => ({
        start: exception.start_minute ?? 0,
        end: exception.end_minute ?? 1440,
      })),
  );
}

/**
 * Extra hours on one date (11 November 2026, Dan: "can Ines also have the
 * option to add in working hours too against her normal weekly hours"):
 * times a lesson can start, exactly as her weekly hours are. On the Timetable
 * they are a span of times; the Worker keeps their first start and their
 * last, the last booking-interval step before the span ends, so 15:00–17:00
 * at 30 minutes starts 15:00 to 16:30.
 */
export function lastStartIn(span: Span, interval: number) {
  return span.start + Math.max(0, Math.ceil((span.end - span.start) / interval) - 1) * interval;
}

/** The times extra hours cover: from their first start to their last start's end. */
export function extraSpan(span: Span, interval: number): Span {
  return { start: span.start, end: Math.min(1440, lastStartIn(span, interval) + interval) };
}

/** `15:00–16:30`, or `15:00` alone: when lessons can start within `span`. */
export function startsLabel(span: Span, interval: number) {
  const last = lastStartIn(span, interval);
  return last > span.start ? `${minuteLabel(span.start)}–${minuteLabel(last)}` : minuteLabel(span.start);
}

/**
 * One date's own extra hours as the Worker keeps them, first and last start;
 * no times means the whole day, as availability reads it. Weekly extra rows
 * are not hers to change here, so they are left out.
 */
export function dateExtraWindows(exceptions: AvailabilityException[], date: string): TeachingWindow[] {
  return exceptions
    .filter((exception) => exception.kind === "extra" && exception.weekday == null && exception.date === date)
    .map((exception) => ({ start: exception.start_minute ?? 0, lastStart: exception.end_minute ?? 1440 }))
    .sort((a, b) => a.start - b.start);
}

/** The same as the times they cover on the Timetable, merged. */
export function dateExtras(exceptions: AvailabilityException[], date: string, interval: number): Span[] {
  return mergeSpans(dateExtraWindows(exceptions, date).map((window) => ({ start: window.start, end: Math.min(1440, window.lastStart + interval) })));
}

/**
 * Whether the choice offers `Extra hours` for `span`: only where they would
 * let a lesson start where none could yet, some start in it (each interval
 * step from its start) outside every window of starts she already has that
 * day, weekly or extra. Times inside her hours gain nothing. Never for the
 * whole day, which the Worker refuses as it refuses a whole day of time off:
 * pressed on a day online only from end to end, the choice opens on all of it.
 */
export function offersExtraHours(windows: TeachingWindow[], span: Span, interval: number) {
  if (!(interval >= 1) || (span.start <= 0 && span.end >= 1440)) return false;
  for (let minute = span.start; minute < span.end; minute += interval)
    if (!windows.some((window) => window.start <= minute && minute <= window.lastStart)) return true;
  return false;
}

/** Time blocked every week on this weekday, such as lunch. */
export function weeklyBlocks(
  exceptions: AvailabilityException[],
  weekday: number,
): WeeklyBlock[] {
  return exceptions
    .filter(
      (exception) =>
        exception.kind === "blocked" && exception.weekday === weekday,
    )
    .map((exception) => ({
      start: exception.start_minute ?? 0,
      end: exception.end_minute ?? 1440,
      note: exception.note,
    }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Online only (10 November 2026, Dan: Inês can "label days as online only").
 * She labels days; the Worker stores periods, each a run of dates with one
 * daily window, and replaces the whole list on each save.
 */
export const ALL_DAY: Span = { start: 0, end: 1440 };
/** Beyond this the Worker refuses the list, as the first editor did. */
export const MAX_ONLINE_ONLY_PERIODS = 100;

/** One date's online-only hours, merged; empty when either place can be booked. */
export function onlineOnlyHours(periods: OnlineOnlyPeriod[], date: string): Span[] {
  return mergeSpans(periods
    .filter((period) => period.fromDate <= date && date <= period.toDate)
    .map((period) => ({ start: period.startMinute, end: period.endMinute })));
}

/** `All day`, `12:00–16:00`, or nothing when the date isn't online only. */
export function onlineOnlyLabel(hours: Span[]) {
  if (hours.length === 1 && hours[0].start === 0 && hours[0].end === 1440) return "All day";
  return hours.map(spanLabel).join(", ");
}

/**
 * Labels `dates` online only for `hours` each day, or takes the label off
 * them when `hours` is null. Other dates keep theirs: a period the dates
 * fall inside splits around them, each part keeping its hours, and the first
 * part its id. Neighbouring dates with the same hours become one period;
 * periods wholly before `today` are dropped. Throws past the Worker's limit.
 */
export function labelOnlineOnly(
  periods: OnlineOnlyPeriod[],
  dates: string[],
  hours: Span | null,
  today: string,
  newId: () => string = () => crypto.randomUUID(),
): OnlineOnlyPeriod[] {
  const chosen = [...new Set(dates)].sort();
  const pieces: OnlineOnlyPeriod[] = [];
  for (const period of periods) {
    if (period.toDate < today) continue;
    let from = period.fromDate;
    let id = period.id;
    const take = (toDate: string) => {
      if (from <= toDate) { pieces.push({ ...period, id: id || newId(), fromDate: from, toDate }); id = ""; }
    };
    for (const date of chosen.filter((date) => period.fromDate <= date && date <= period.toDate)) {
      take(shiftDate(date, -1));
      from = shiftDate(date, 1);
    }
    take(period.toDate);
  }
  if (hours) {
    for (const date of chosen) {
      const last = pieces.at(-1);
      if (last && !last.id && shiftDate(last.toDate, 1) === date) last.toDate = date;
      else pieces.push({ id: "", fromDate: date, toDate: date, startMinute: hours.start, endMinute: hours.end });
    }
  }
  const merged: OnlineOnlyPeriod[] = [];
  for (const period of pieces.sort((a, b) =>
    a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.fromDate.localeCompare(b.fromDate))) {
    const last = merged.at(-1);
    if (last && last.startMinute === period.startMinute && last.endMinute === period.endMinute && shiftDate(last.toDate, 1) >= period.fromDate) {
      if (period.toDate > last.toDate) last.toDate = period.toDate;
      if (!last.id) last.id = period.id;
    } else merged.push({ ...period });
  }
  const result = merged
    .map((period) => ({ ...period, id: period.id || newId() }))
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.startMinute - b.startMinute);
  if (result.length > MAX_ONLINE_ONLY_PERIODS)
    throw new Error(`Online only can cover at most ${MAX_ONLINE_ONLY_PERIODS} separate runs of days.`);
  return result;
}

/**
 * One date's online-only hours set to exactly `spans` (11 November 2026, Dan:
 * "when setting exact hours she can set online only times too"); every other
 * date keeps its own. Empty `spans` takes the label off the date.
 */
export function setOnlineOnlyHours(
  periods: OnlineOnlyPeriod[],
  date: string,
  spans: Span[],
  today: string,
  newId: () => string = () => crypto.randomUUID(),
): OnlineOnlyPeriod[] {
  const [first, ...rest] = mergeSpans(spans);
  const result = labelOnlineOnly(periods, [date], first ?? null, today, newId);
  if (!rest.length) return result;
  const all = [...result, ...rest.map((span) => ({ id: newId(), fromDate: date, toDate: date, startMinute: span.start, endMinute: span.end }))]
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.startMinute - b.startMinute);
  if (all.length > MAX_ONLINE_ONLY_PERIODS)
    throw new Error(`Online only can cover at most ${MAX_ONLINE_ONLY_PERIODS} separate runs of days.`);
  return all;
}

/** The first of `spans` that touches `start`–`end`. */
export function spanAround(spans: Span[], start: number, end: number) {
  return spans.find((span) => span.start < end && start < span.end) ?? null;
}

export type HoursKind = "off" | "online" | "extra";

/**
 * Some hours of a date that are already a kind. `online` marks extra hours
 * with online-only hours at exactly the same times: one block, which opens
 * on `Extra hours`.
 */
export type HoursBlock = { kind: HoursKind; span: Span; online?: boolean };

/** A kind; `null` opens the times again (`Open again`); `"not working"` takes their extra hours away. */
export type HoursChoice = HoursKind | null | "not working";

/**
 * One date's hours off, online-only hours and extra hours after she chooses
 * what `span` is, from the times on her Timetable. `original` is the block
 * she pressed, which a kind replaces; opening again or not working takes only
 * `span`, so she can shorten a block. Time off is never online only or extra
 * hours: making hours one takes them out of the others. Online only labels
 * time that can be booked, so it and extra hours never replace each other,
 * and extra hours online only at the same times keep the label as they move
 * and lose it when they go.
 */
export function chooseHours(
  current: { off: Span[]; online: Span[]; extra: Span[] },
  original: HoursBlock | null,
  kind: HoursChoice,
  span: Span,
  /** Her booking interval, so extra hours lose whole starts (`removeStarts`). */
  interval?: number,
) {
  let { off, online, extra } = current;
  const was = (of: HoursKind) => original?.kind === of || (of === "online" && Boolean(original?.online));
  const withoutExtra = (cut: Span) => interval ? removeStarts(extra, cut, interval) : removeSpan(extra, cut);
  // A kind chosen replaces the block pressed; opening again and not working take only the times set.
  if (original && kind && kind !== "not working") {
    if (was("off")) off = removeSpan(off, original.span);
    if (was("online") && (kind !== "extra" || original.online)) online = removeSpan(online, original.span);
    if (was("extra") && kind !== "online") extra = withoutExtra(original.span);
  }
  if (kind === "off") {
    off = addSpan(off, span);
    online = removeSpan(online, span);
    extra = withoutExtra(span);
  } else if (kind === "online") {
    online = addSpan(online, span);
    off = removeSpan(off, span);
  } else if (kind === "extra") {
    extra = addSpan(extra, span);
    off = removeSpan(off, span);
    if (original?.online) online = addSpan(online, span);
  } else if (kind === "not working") {
    extra = withoutExtra(span);
    if (original?.online) online = removeSpan(online, span);
  } else {
    off = removeSpan(off, span);
    online = removeSpan(online, span);
  }
  return { off: mergeSpans(off), online: mergeSpans(online), extra: mergeSpans(extra) };
}

/** `Tue 8 Sept`, as the week's notes name a date. */
export function shortDateLabel(date: string) {
  return dateLabel(date, { weekday: "short", day: "numeric", month: "short" });
}

export type TimeAheadRow = { dates: string[]; label: string; detail: string };

/**
 * What she has set from `from` on (2 November 2026): days off, hours off,
 * extra hours and online-only stretches. Consecutive whole days off read as
 * one stretch, as does each online-only period; a day off lists no extra
 * hours, since it has none to give. Rows are in date order.
 */
export function timeAhead(exceptions: AvailabilityException[], onlineOnly: OnlineOnlyPeriod[], from: string, interval: number): TimeAheadRow[] {
  const off = daysOff(exceptions);
  const ahead = (kind: AvailabilityException["kind"]) => [...new Set(exceptions
    .filter((exception) => exception.kind === kind && exception.weekday == null && exception.date && exception.date >= from)
    .map((exception) => exception.date as string))].sort();
  const blocked = ahead("blocked");
  const rows: { dates: string[]; hours: boolean; note: string }[] = [];
  for (const date of blocked) {
    const last = rows.at(-1);
    if (off.has(date) && last && !last.hours && shiftDate(last.dates.at(-1)!, 1) === date) { last.dates.push(date); continue; }
    rows.push({ dates: [date], hours: !off.has(date), note: off.get(date) ?? "" });
  }
  const stretch = (dates: string[]) => dates.length > 1 ? `${shortDateLabel(dates[0])} – ${shortDateLabel(dates.at(-1)!)}` : shortDateLabel(dates[0]);
  return [
    ...rows.map((row) => ({
      dates: row.dates,
      label: stretch(row.dates),
      detail: [row.hours
        ? `Off ${dateBlocks(exceptions, row.dates[0]).map(spanLabel).join(", ")}`
        : row.dates.length > 1 ? `${row.dates.length} days off` : "Day off", row.note]
        .filter((part, index, parts) => part && parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(" · "),
    })),
    ...ahead("extra").filter((date) => !off.has(date)).map((date) => ({
      dates: [date],
      label: shortDateLabel(date),
      detail: `Extra ${dateExtras(exceptions, date, interval).map(spanLabel).join(", ")}`,
    })),
    ...onlineOnly.filter((period) => period.toDate >= from).map((period) => {
      const dates: string[] = [];
      for (let date = period.fromDate < from ? from : period.fromDate; date <= period.toDate; date = shiftDate(date, 1)) dates.push(date);
      const hours = onlineOnlyLabel([{ start: period.startMinute, end: period.endMinute }]);
      return { dates, label: stretch(dates), detail: `${dates.length > 1 ? `${dates.length} days online only` : "Online only"}${hours === "All day" ? "" : `, ${hours}`}` };
    }),
  ].sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
}

function localMinute(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TUTOR_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return (
    Number(parts.find((p) => p.type === "hour")!.value) * 60 +
    Number(parts.find((p) => p.type === "minute")!.value)
  );
}

/**
 * The calendar's view of the Worker's rows while a date's change is still
 * saving, with the same rules the Worker applies: a day off, the hours
 * blocked within it and its extra hours (kept as the starts they give) are
 * replaced independently, weekly rows never.
 */
export function withDayChanges(
  exceptions: AvailabilityException[],
  changes: Map<string, { dayOff?: boolean; blocks?: Span[]; extra?: Span[] }>,
  interval: number,
) {
  let rows = exceptions;
  for (const [date, change] of changes) {
    const oneOff = (row: AvailabilityException) =>
      row.date === date && row.weekday == null && row.kind === "blocked";
    const dayOffRow = (row: AvailabilityException) =>
      oneOff(row) && isWholeDayOff(row);
    if (change.dayOff === false) rows = rows.filter((row) => !dayOffRow(row));
    if (change.dayOff && !rows.some(dayOffRow))
      rows = [...rows, oneOffRow(date, null, null)];
    if (change.blocks)
      rows = [
        ...rows.filter((row) => !oneOff(row) || isWholeDayOff(row)),
        ...change.blocks.map((span) => oneOffRow(date, span.start, span.end)),
      ];
    if (change.extra)
      rows = [
        ...rows.filter((row) => !(row.date === date && row.weekday == null && row.kind === "extra")),
        ...change.extra.map((span) => oneOffRow(date, span.start, lastStartIn(span, interval), "extra")),
      ];
  }
  return rows;
}

function oneOffRow(
  date: string,
  start: number | null,
  end: number | null,
  kind: AvailabilityException["kind"] = "blocked",
): AvailabilityException {
  return {
    id: 0,
    date,
    weekday: null,
    kind,
    note: "",
    start_minute: start,
    end_minute: end,
  };
}

export type BookingSegment = {
  booking: AdminBooking;
  date: string;
  start: number;
  end: number;
};

export function bookingSegments(
  bookings: AdminBooking[],
  weekStart: string,
): BookingSegment[] {
  const endOfWeek = shiftDate(weekStart, 6);
  return bookings.flatMap((booking) => {
    const startDay = dateKey(new Date(booking.starts_at));
    const endDay = dateKey(new Date(booking.ends_at));
    const result: BookingSegment[] = [];
    for (
      let day = startDay < weekStart ? weekStart : startDay;
      day <= endDay && day <= endOfWeek;
      day = shiftDate(day, 1)
    ) {
      const start = day === startDay ? localMinute(booking.starts_at) : 0;
      const end = day === endDay ? localMinute(booking.ends_at) : 1440;
      // A lesson crossing the repeated autumn hour must remain visible.
      if (end > start || day === startDay)
        result.push({
          booking,
          date: day,
          start,
          end:
            end > start
              ? end
              : Math.min(
                  1440,
                  start +
                    (Date.parse(booking.ends_at) -
                      Date.parse(booking.starts_at)) /
                      60000,
                ),
        });
    }
    return result;
  });
}

/**
 * A lesson to come that her time off or an online-only label has left
 * standing (10 November 2026, Dan: "display the clashes somewhere suitable
 * in a clean simple way"): booked on a day off, inside hours off, or in
 * person inside online-only hours. Nothing moves or cancels it but her.
 */
export type TimeOffClash = { booking: AdminBooking; reason: "day off" | "hours off" | "online only" };

export function timeOffClashes(
  bookings: AdminBooking[],
  exceptions: AvailabilityException[],
  onlineOnly: OnlineOnlyPeriod[],
  now: Date,
): TimeOffClash[] {
  const off = daysOff(exceptions);
  const clashes: TimeOffClash[] = [];
  for (const booking of bookings) {
    if (booking.status !== "confirmed" || Date.parse(booking.starts_at) <= now.getTime()) continue;
    const segments = bookingSegments([booking], mondayOf(dateKey(new Date(booking.starts_at))));
    const reason = segments.some(({ date }) => off.has(date)) ? "day off"
      : segments.some(({ date, start, end }) => overlapsSpan(dateBlocks(exceptions, date), start, end)) ? "hours off"
      : booking.location !== "online" && segments.some(({ date, start, end }) => overlapsSpan(onlineOnlyHours(onlineOnly, date), start, end)) ? "online only"
      : null;
    if (reason) clashes.push({ booking, reason });
  }
  return clashes.sort((a, b) => Date.parse(a.booking.starts_at) - Date.parse(b.booking.starts_at));
}

/** How long a change or cancellation by a student stays in Needs you. */
export const NEEDS_YOU_RECENT_HOURS = 72;
/** How close a lesson must be for its first-lesson note to show. */
export const NEEDS_YOU_AHEAD_DAYS = 7;

/**
 * One thing waiting on Inês (Phase 2, 14 October 2026). Every kind clears
 * itself. The four that only tell her something (11 November 2026, Dan) can
 * also be dismissed: their `dismiss` names what happened and when, so a
 * second change to the same lesson is a new notice. Work still to do never
 * has one.
 */
export type NeedsYouItem =
  | { kind: "meet"; key: "meet"; reconnect: boolean }
  | { kind: "payment"; key: string; review: PaymentReview; part: "lesson" | "fee" | "refund" }
  | { kind: "lessons"; key: string; student: AdminStudent }
  | { kind: "welcome"; key: string; student: AdminStudent; at?: string | null }
  | { kind: "changed"; key: string; dismiss: string; booking: AdminBooking; count: number; first: boolean }
  | { kind: "cancelled"; key: string; dismiss: string; booking: AdminBooking; count: number }
  | { kind: "first"; key: string; dismiss: string; booking: AdminBooking }
  /** A saved card was declined; clears once the student pays (16 October 2026: no longer emailed to her). */
  | { kind: "declined"; key: string; student: AdminStudent; payment: NonNullable<AdminStudent["cardDeclined"]>[number] }
  /** A student added a card in the last week; lists the lessons she added that it now pays for. */
  | { kind: "card"; key: string; dismiss: string; student: AdminStudent; added: NonNullable<AdminStudent["cardAdded"]> };

/** Students she set up with no email hold this in place of one; nothing is ever shown or sent to it. */
const NO_EMAIL_YET = "no-email:";

/** A past lesson counts too; her students do not need a future booking to stay set up. */
export const hasLessons = (student: AdminStudent) => Boolean(student.hasLessons || student.nextLessonAt || student.upcoming || student.weekly);

/** Every length free: nothing to pay, so no card to ask for. */
export const paysNothing = (student: AdminStudent) => student.prices?.[60] === 0 && student.prices?.[90] === 0;

/** Whose move it is: hers, theirs (a link is out), or nobody's. */
export type StudentStage = "todo" | "waiting" | "set";
/** What her one button does: sign them in, ask for their card, or ask for what is still open. */
export type StudentNext = "invite" | "card" | "pay";

/**
 * How far a student has got with the website (2 November 2026, Dan: "get
 * everyone logged in, pay for previous lessons and able to book their own
 * lessons"). Three checks, not six steps: signed in, a card with her lessons
 * to come on it, and nothing still open. Price, lessons and email are never
 * steps; a card and what is open only count where cards are taken and they
 * pay something.
 */
export type StudentProgress = {
  signedIn: boolean;
  /** A card saved with every lesson of hers to come on it. Null when there is no card to ask for. */
  card: boolean | null;
  /** A card saved, whether or not her lessons are on it yet. */
  cardSaved: boolean;
  /** Lessons she added that have begun and no card or tick has settled. */
  openLessons: number;
  openCents: number;
  /** Their newest way in still unspent. */
  invitedAt: string | null;
  stage: StudentStage;
  next: StudentNext | null;
};

export function studentProgress(student: AdminStudent, cardsAccepted: boolean): StudentProgress {
  const cardAsked = cardsAccepted && !paysNothing(student);
  const signedIn = Boolean(student.signedIn);
  // All set is "fully set up on the website just paying for their own
  // lessons" (11 November 2026, Dan): a card saved, and every lesson to come
  // that she added on it. Someone who books and pays for their own, with
  // nothing of hers waiting, is there already (9 November 2026, Dan: "don't
  // have a button for ask for card if they are already paying? like roman").
  // Having agreed to the card for her lessons is not enough by itself: one
  // still off the card keeps them out of All set until it is on it.
  const cardSaved = Boolean(student.hasCard || student.cardForAllLessons);
  const card = cardAsked ? cardSaved && !student.unpaidUpcoming : null;
  const openLessons = cardAsked ? student.unpaidPast ?? 0 : 0;
  const openCents = openLessons ? student.unpaidPastCents ?? 0 : 0;
  const invitedAt = student.invitedAt ?? null;
  const next: StudentNext | null = !signedIn ? "invite" : openLessons ? "pay" : card === false ? "card" : null;
  // A link they have yet to open leaves the next move theirs.
  const stage: StudentStage = !next ? "set" : invitedAt ? "waiting" : "todo";
  return { signedIn, card, cardSaved, openLessons, openCents, invitedAt, stage, next };
}

export type StudentWorkspaceRow = {
  student: AdminStudent;
  progress: StudentProgress;
  items: NeedsYouItem[];
};

export type StudentSection = "needs" | StudentStage;

/**
 * One student once, in the first group that fits: something of theirs needs
 * her, then her move, theirs, and the students already all set. Dormant
 * students (22 October 2026, Dan) rest apart, by name, unless something of
 * theirs needs her.
 */
export function studentWorkspace(students: AdminStudent[], items: NeedsYouItem[], cardsAccepted: boolean, bookings: AdminBooking[]): {
  sections: Record<StudentSection, StudentWorkspaceRow[]>;
  dormant: StudentWorkspaceRow[];
  general: NeedsYouItem[];
  attentionCount: number;
  /** Active students all set, of all active students. */
  allSet: { done: number; total: number };
} {
  const rows: StudentWorkspaceRow[] = students.map(student => ({ student, progress: studentProgress(student, cardsAccepted), items: [] }));
  const byId = new Map(rows.map(row => [row.student.id, row]));
  const byBooking = new Map(bookings.map(booking => [booking.id, booking]));
  const byEmail = new Map<string, StudentWorkspaceRow | null>();
  const realEmail = (value: string) => {
    const email = value.trim().toLowerCase();
    return email && !email.startsWith(NO_EMAIL_YET) ? email : "";
  };
  for (const row of rows) {
    const email = realEmail(row.student.email);
    // An ambiguous address never guesses which student owns a payment or lesson.
    if (email) byEmail.set(email, byEmail.has(email) ? null : row);
  }

  const general: NeedsYouItem[] = [];
  for (const item of items) {
    // A missing lesson or welcome is the card's own next step, never a task card.
    if (item.kind === "lessons" || item.kind === "welcome") continue;
    const booking = item.kind === "payment" ? byBooking.get(item.review.id) : "booking" in item ? item.booking : undefined;
    const row = "student" in item ? byId.get(item.student.id)
      : booking && (booking.student_id ? byId.get(booking.student_id) : byEmail.get(realEmail(booking.student_email)));
    if (row) row.items.push(item);
    else general.push(item);
  }

  const stamp = (value?: string | null, fallback = Infinity) => {
    const time = Date.parse(value ?? "");
    return Number.isFinite(time) ? time : fallback;
  };
  const priority = (row: StudentWorkspaceRow) => {
    if (row.items.some(item => item.kind === "payment" || item.kind === "declined")) return 0;
    if (row.items.some(item => item.kind === "changed" || item.kind === "cancelled")) return 1;
    if (row.student.homeworkToReview?.length) return 1.5;
    return row.items.length ? 3 : 4;
  };
  const latestChange = (row: StudentWorkspaceRow) => Math.max(0, ...row.items.map(item =>
    item.kind === "changed" ? stamp(item.booking.student_changed_at, 0) : item.kind === "cancelled" ? stamp(item.booking.cancelled_at, 0) : 0));
  const nextLesson = (row: StudentWorkspaceRow) => Math.min(stamp(row.student.nextLessonAt), ...row.items.map(item =>
    item.kind === "first" ? stamp(item.booking.starts_at) : Infinity));
  // Within a group, the student whose lesson comes soonest first, then by name.
  rows.sort((a, b) => priority(a) - priority(b)
    || (priority(a) === 1 ? latestChange(b) - latestChange(a) : 0)
    || nextLesson(a) - nextLesson(b)
    || a.student.name.localeCompare(b.student.name)
    || a.student.id.localeCompare(b.student.id));

  const needsHer = (row: StudentWorkspaceRow) => Boolean(row.items.length || row.student.homeworkToReview?.length);
  const sections: Record<StudentSection, StudentWorkspaceRow[]> = { needs: [], todo: [], waiting: [], set: [] };
  const dormant: StudentWorkspaceRow[] = [];
  for (const row of rows) {
    if (needsHer(row)) sections.needs.push(row);
    else if (row.student.dormant) dormant.push(row);
    else sections[row.progress.stage].push(row);
  }
  const active = rows.filter(row => !row.student.dormant);
  return {
    sections,
    dormant: dormant.sort((a, b) => a.student.name.localeCompare(b.student.name) || a.student.id.localeCompare(b.student.id)),
    general,
    // Only what needs her: an invite still to send is a group of its own, not a badge.
    attentionCount: general.length + sections.needs.length,
    allSet: { done: active.filter(row => row.progress.stage === "set").length, total: active.length },
  };
}

/**
 * What waits on her, from reads the page already makes: Google Meet first,
 * then payments in the Worker's order, then the newest student changes.
 * Undated setup tasks and first lessons follow by next lesson, then name.
 * A lesson appears once. `lessons` are her confirmed lessons from yesterday
 * on; `cancellations` the cancelled rows, which the timetable drops.
 */
export function needsYou({ now, meet, payments, students, lessons, cancellations, dismissed }: {
  now: Date;
  meet: GoogleMeetConnection | null;
  payments: PaymentReview[];
  students: AdminStudent[];
  lessons: AdminBooking[];
  cancellations: AdminBooking[];
  /** Dismiss keys she has dismissed, on any of her devices. */
  dismissed?: ReadonlySet<string>;
}): NeedsYouItem[] {
  const at = now.getTime();
  const recent = (stamp?: string | null) => {
    const time = Date.parse(stamp ?? "");
    return Number.isFinite(time) && at - time < NEEDS_YOU_RECENT_HOURS * 3_600_000;
  };
  const ahead = (start?: string | null) => {
    const time = Date.parse(start ?? "");
    return Number.isFinite(time) && time > at;
  };
  const soon = (start?: string | null) =>
    ahead(start) && Date.parse(start!) - at <= NEEDS_YOU_AHEAD_DAYS * 86_400_000;
  const real = (booking: AdminBooking) => !String(booking.student_email ?? "").startsWith(NO_EMAIL_YET);
  // A weekly run is one card: its lessons together, the earliest speaking for them.
  const grouped = (rows: AdminBooking[], keyOf: (row: AdminBooking) => string) => {
    const groups = new Map<string, AdminBooking[]>();
    for (const row of [...rows].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))) {
      const key = keyOf(row);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()];
  };

  const first: NeedsYouItem[] = [];
  if (meet?.configured && (meet.needsReconnect || !meet.connected))
    first.push({ kind: "meet", key: "meet", reconnect: Boolean(meet.needsReconnect) });
  for (const review of payments) {
    const part = review.payment_status === "processing" ? "lesson" : review.same_day_fee_status === "processing" ? "fee" : "refund";
    first.push({ kind: "payment", key: `payment:${review.id}`, review, part });
  }
  for (const student of students) {
    for (const payment of student.cardDeclined ?? [])
      first.push({ kind: "declined", key: `declined:${payment.bookingId}:${payment.part}`, student, payment });
  }

  const timed: { time: number; changed: number; item: NeedsYouItem }[] = [];
  for (const student of students) {
    const email = student.email ?? "";
    const time = Date.parse(student.nextLessonAt ?? "") || Infinity;
    // No email is not a to-do (2 November 2026, Dan); a welcome is, once there is one.
    if (email && !email.startsWith(NO_EMAIL_YET) && student.awaitingWelcome)
      timed.push({ time, changed: 0, item: { kind: "welcome", key: `welcome:${student.id}`, student, at: student.nextLessonAt } });
    if (!hasLessons(student))
      timed.push({ time, changed: 0, item: { kind: "lessons", key: `lessons:${student.id}`, student } });
    if (student.cardAdded && student.hasCard)
      timed.push({ time, changed: Date.parse(student.cardAdded.at) || 0, item: { kind: "card", key: `card:${student.id}`, dismiss: `card:${student.id}:${Date.parse(student.cardAdded.at) || 0}`, student, added: student.cardAdded } });
  }

  const confirmed = lessons.filter((row) => row.status === "confirmed" && real(row));
  const changedRows = confirmed.filter((row) => row.student_changed_at && recent(row.student_changed_at) && ahead(row.starts_at));
  const shown = new Set<string>();
  for (const group of grouped(changedRows, (row) => row.series_id ? `${row.series_id}|${row.student_changed_at}` : row.id)) {
    const [booking] = group;
    for (const row of group) shown.add(row.id);
    timed.push({ time: Date.parse(booking.starts_at), changed: Date.parse(booking.student_changed_at!), item: { kind: "changed", key: `changed:${booking.id}`, dismiss: `changed:${booking.series_id ?? booking.id}:${Date.parse(booking.student_changed_at!)}`, booking, count: group.length, first: Boolean(booking.first_lesson && !booking.added_by_teacher) } });
  }
  // Booked again since (10 November 2026): their confirmed lesson at that start settles it.
  const bookedAgain = (row: AdminBooking) => lessons.some((other) => other.status === "confirmed" &&
    (other.student_id ?? other.student_email) === (row.student_id ?? row.student_email) && Date.parse(other.starts_at) === Date.parse(row.starts_at));
  const recentCancelled = cancellations.filter((row) => row.cancelled_by === "student" && real(row) && recent(row.cancelled_at));
  const cancelledRows = recentCancelled.filter((row) => ahead(row.starts_at) && !bookedAgain(row));
  for (const group of grouped(cancelledRows, (row) => row.series_id || row.id)) {
    const [booking] = group;
    // What she dismisses is the run's notice, as of its latest cancellation:
    // named for the next lesson still ahead, it changed as each week's time
    // passed, and a notice she had dismissed came back.
    const run = booking.series_id || booking.id;
    const latest = Math.max(...recentCancelled.filter(row => (row.series_id || row.id) === run).map(row => Date.parse(row.cancelled_at!)));
    timed.push({ time: Date.parse(booking.starts_at), changed: latest, item: { kind: "cancelled", key: `cancelled:${booking.id}`, dismiss: `cancelled:${run}:${latest}`, booking, count: group.length } });
  }
  for (const booking of confirmed) {
    if (booking.first_lesson && !booking.added_by_teacher && soon(booking.starts_at) && !shown.has(booking.id))
      timed.push({ time: Date.parse(booking.starts_at), changed: 0, item: { kind: "first", key: `first:${booking.id}`, dismiss: `first:${booking.id}:${Date.parse(booking.starts_at)}`, booking } });
  }

  const name = (item: NeedsYouItem) => "student" in item ? item.student.name : "booking" in item ? item.booking.student_name : "";
  return [...first, ...timed.sort((a, b) => b.changed - a.changed || a.time - b.time || name(a.item).localeCompare(name(b.item))).map((entry) => entry.item)]
    .filter((item) => !("dismiss" in item && dismissed?.has(item.dismiss)));
}
