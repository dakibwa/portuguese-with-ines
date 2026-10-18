import type {
  AdminBooking,
  AdminStudent,
  AvailabilityException,
  AvailabilityRule,
  GoogleMeetConnection,
  PaymentReview,
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

/** How long a change or cancellation by a student stays in Needs you. */
export const NEEDS_YOU_RECENT_HOURS = 72;
/** How close a lesson must be for its first-lesson note to show. */
export const NEEDS_YOU_AHEAD_DAYS = 7;

/**
 * One thing waiting on Inês (Phase 2, 14 October 2026). Every kind clears
 * itself, so there is nothing stored and nothing to dismiss.
 */
export type NeedsYouItem =
  | { kind: "meet"; key: "meet"; reconnect: boolean }
  | { kind: "payment"; key: string; review: PaymentReview; part: "lesson" | "fee" | "refund" }
  | { kind: "email"; key: string; student: AdminStudent }
  | { kind: "lessons"; key: string; student: AdminStudent }
  | { kind: "welcome"; key: string; student: AdminStudent; at?: string | null }
  | { kind: "changed"; key: string; booking: AdminBooking; count: number; first: boolean }
  | { kind: "cancelled"; key: string; booking: AdminBooking; count: number }
  | { kind: "first"; key: string; booking: AdminBooking }
  /** A saved card was declined; clears once the student pays (16 October 2026: no longer emailed to her). */
  | { kind: "declined"; key: string; student: AdminStudent; payment: NonNullable<AdminStudent["cardDeclined"]>[number] }
  /** A student added a card in the last week; lists the lessons she added that it now pays for. */
  | { kind: "card"; key: string; student: AdminStudent; added: NonNullable<AdminStudent["cardAdded"]> };

/** Students she set up with no email hold this in place of one; nothing is ever shown or sent to it. */
const NO_EMAIL_YET = "no-email:";

export type StudentSetupStep = "email" | "price" | "lessons" | "welcome" | "sign-in" | "card";

export type StudentSetup = {
  student: AdminStudent;
  steps: { id: StudentSetupStep; label: string; done: boolean; lockedReason?: string }[];
  next: Exclude<StudentSetupStep, "price">;
  owner: "Yours" | "Theirs";
};

/** A past lesson counts too; her students do not need a future booking to stay set up. */
const hasLessons = (student: AdminStudent) => Boolean(student.hasLessons || student.nextLessonAt || student.upcoming || student.weekly);

/** New setup suggests the lesson before the email, without requiring one; completed steps stay editable. */
export function gettingStarted(students: AdminStudent[], cardsAccepted = true): StudentSetup[] {
  return students.flatMap((student) => {
    const email = Boolean(student.email && !student.email.startsWith(NO_EMAIL_YET));
    const steps: StudentSetup["steps"] = [
      { id: "price", label: "Price", done: true },
      { id: "lessons", label: "Lessons", done: hasLessons(student) },
      { id: "email", label: "Email", done: email },
      { id: "welcome", label: "Welcome", done: email && !student.awaitingWelcome },
      { id: "sign-in", label: "Sign in", done: Boolean(student.signedIn) },
      // A student whose every length is free has no card to add (16 October 2026).
      ...(cardsAccepted && !(student.prices?.[60] === 0 && student.prices?.[90] === 0)
        ? [{ id: "card" as const, label: "Card", done: Boolean(student.hasCard) }] : []),
    ];
    // Lessons are optional (16 October 2026, Inês): a student with none yet
    // can still be given an email and welcomed, to book their own. Lessons
    // lead while she is still setting them up, and once welcomed an empty
    // Lessons step is theirs to fill, so it holds nothing open.
    const welcomed = steps.find((step) => step.id === "welcome")!.done;
    const index = steps.findIndex((step) => !step.done && !(welcomed && step.id === "lessons"));
    if (index < 0) return [];
    const next = steps[index].id as StudentSetup["next"];
    const blocking = steps.findIndex((step) => !step.done && step.id !== "lessons");
    const prerequisite: Record<StudentSetupStep, string> = {
      price: "Set a price first.",
      lessons: "Add a lesson first.",
      email: "Add an email first.",
      welcome: "Send the welcome email first.",
      "sign-in": "Waiting for the student to sign in.",
      card: "Waiting for the student to add a card.",
    };
    for (let later = blocking + 1; blocking >= 0 && later < steps.length; later++) {
      if (!steps[later].done && steps[later].id !== "lessons") steps[later].lockedReason = prerequisite[steps[blocking].id];
    }
    return [{ student, steps, next, owner: next === "sign-in" || next === "card" ? "Theirs" as const : "Yours" as const }];
  });
}

export type StudentWorkspaceRow = {
  student: AdminStudent;
  setup?: StudentSetup;
  items: NeedsYouItem[];
};

/** One student once: her operational work first, then setup and the students already ready. */
export function studentWorkspace(students: AdminStudent[], items: NeedsYouItem[], cardsAccepted: boolean, bookings: AdminBooking[]): {
  rows: StudentWorkspaceRow[];
  general: NeedsYouItem[];
  attentionCount: number;
} {
  const setup = new Map(gettingStarted(students, cardsAccepted).map(row => [row.student.id, row]));
  const rows: StudentWorkspaceRow[] = students.map(student => ({ student, setup: setup.get(student.id), items: [] }));
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
    // These are the row's setup steps, rather than duplicate task cards.
    if (item.kind === "email" || item.kind === "lessons" || item.kind === "welcome") continue;
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
    if (row.setup?.owner === "Yours") return 2;
    if (row.items.some(item => item.kind === "first" || item.kind === "card")) return 3;
    return row.setup ? 4 : 5;
  };
  const latestChange = (row: StudentWorkspaceRow) => Math.max(0, ...row.items.map(item =>
    item.kind === "changed" ? stamp(item.booking.student_changed_at, 0) : item.kind === "cancelled" ? stamp(item.booking.cancelled_at, 0) : 0));
  const nextLesson = (row: StudentWorkspaceRow) => Math.min(stamp(row.student.nextLessonAt), ...row.items.map(item =>
    item.kind === "first" ? stamp(item.booking.starts_at) : Infinity));
  rows.sort((a, b) => priority(a) - priority(b)
    || (priority(a) === 1 ? latestChange(b) - latestChange(a) : 0)
    || nextLesson(a) - nextLesson(b)
    || a.student.name.localeCompare(b.student.name)
    || a.student.id.localeCompare(b.student.id));

  return {
    rows,
    general,
    attentionCount: general.length + rows.filter(row => row.items.length || row.setup?.owner === "Yours" || row.student.homeworkToReview?.length).length,
  };
}

/**
 * What waits on her, from reads the page already makes: Google Meet first,
 * then payments in the Worker's order, then the newest student changes.
 * Undated setup tasks and first lessons follow by next lesson, then name.
 * A lesson appears once. `lessons` are her confirmed lessons from yesterday
 * on; `cancellations` the cancelled rows, which the timetable drops.
 */
export function needsYou({ now, meet, payments, students, lessons, cancellations }: {
  now: Date;
  meet: GoogleMeetConnection | null;
  payments: PaymentReview[];
  students: AdminStudent[];
  lessons: AdminBooking[];
  cancellations: AdminBooking[];
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
    if (!email || email.startsWith(NO_EMAIL_YET))
      timed.push({ time, changed: 0, item: { kind: "email", key: `email:${student.id}`, student } });
    else if (student.awaitingWelcome)
      timed.push({ time, changed: 0, item: { kind: "welcome", key: `welcome:${student.id}`, student, at: student.nextLessonAt } });
    if (!hasLessons(student))
      timed.push({ time, changed: 0, item: { kind: "lessons", key: `lessons:${student.id}`, student } });
    if (student.cardAdded && student.hasCard)
      timed.push({ time, changed: Date.parse(student.cardAdded.at) || 0, item: { kind: "card", key: `card:${student.id}`, student, added: student.cardAdded } });
  }

  const confirmed = lessons.filter((row) => row.status === "confirmed" && real(row));
  const changedRows = confirmed.filter((row) => row.student_changed_at && recent(row.student_changed_at) && ahead(row.starts_at));
  const shown = new Set<string>();
  for (const group of grouped(changedRows, (row) => row.series_id ? `${row.series_id}|${row.student_changed_at}` : row.id)) {
    const [booking] = group;
    for (const row of group) shown.add(row.id);
    timed.push({ time: Date.parse(booking.starts_at), changed: Date.parse(booking.student_changed_at!), item: { kind: "changed", key: `changed:${booking.id}`, booking, count: group.length, first: Boolean(booking.first_lesson && !booking.added_by_teacher) } });
  }
  const cancelledRows = cancellations.filter((row) => row.cancelled_by === "student" && real(row) && recent(row.cancelled_at) && ahead(row.starts_at));
  for (const group of grouped(cancelledRows, (row) => row.series_id || row.id)) {
    const [booking] = group;
    timed.push({ time: Date.parse(booking.starts_at), changed: Math.max(...group.map(row => Date.parse(row.cancelled_at!))), item: { kind: "cancelled", key: `cancelled:${booking.id}`, booking, count: group.length } });
  }
  for (const booking of confirmed) {
    if (booking.first_lesson && !booking.added_by_teacher && soon(booking.starts_at) && !shown.has(booking.id))
      timed.push({ time: Date.parse(booking.starts_at), changed: 0, item: { kind: "first", key: `first:${booking.id}`, booking } });
  }

  const name = (item: NeedsYouItem) => "student" in item ? item.student.name : "booking" in item ? item.booking.student_name : "";
  return [...first, ...timed.sort((a, b) => b.changed - a.changed || a.time - b.time || name(a.item).localeCompare(name(b.item))).map((entry) => entry.item)];
}
