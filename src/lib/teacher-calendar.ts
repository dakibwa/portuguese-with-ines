import type {
  AdminBooking,
  AvailabilityException,
  AvailabilityRule,
} from "./admin-api";

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
    timeZone: "Europe/Lisbon",
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
        return `Check ${day.name}'s hours: the last start must be at or after the first.`;
      }
    }
  }
  return null;
}

/** Match the Worker's range merging before stepping, including precise times. */
export function lessonStarts(windows: TeachingWindow[], interval = 30) {
  const ranges: TeachingWindow[] = [];
  for (const window of [...windows].sort((a, b) => a.start - b.start)) {
    const last = ranges.at(-1);
    if (last && window.start <= last.lastStart)
      last.lastStart = Math.max(last.lastStart, window.lastStart);
    else ranges.push({ ...window });
  }
  return ranges.flatMap((range) => {
    if (
      !Number.isFinite(range.start) ||
      !Number.isFinite(range.lastStart) ||
      interval < 1
    )
      return [];
    return Array.from(
      {
        length: Math.max(
          0,
          Math.floor((range.lastStart - range.start) / interval) + 1,
        ),
      },
      (_, index) => range.start + index * interval,
    );
  });
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

function localMinute(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
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
 * saving, with the same rules the Worker applies: a day off and the hours
 * blocked within it are replaced independently, weekly blocks never.
 */
export function withDayChanges(
  exceptions: AvailabilityException[],
  changes: Map<string, { dayOff?: boolean; blocks?: Span[] }>,
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
  }
  return rows;
}

function oneOffRow(
  date: string,
  start: number | null,
  end: number | null,
): AvailabilityException {
  return {
    id: 0,
    date,
    weekday: null,
    kind: "blocked",
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
