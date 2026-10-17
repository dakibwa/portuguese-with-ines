import test from "node:test";
import assert from "node:assert/strict";
import { candidateStartMinutes } from "../workers/booking/availability.mjs";
import { wallTimeToUtc } from "../src/lib/wall-time.ts";
import { tryOutExpressions } from "../src/lib/expression-try-out.ts";
import { timetableBounds } from "../src/lib/timetable-bounds.ts";
import { hasStudentSide, opensSchedule } from "../src/lib/account-workspace.ts";
import {
  addSpan,
  bookingSegments,
  bookingsAffectedByHours,
  canPaintHours,
  dateBlocks,
  dateKey,
  daysOff,
  hoursFromRules,
  hoursProblem,
  lessonStarts,
  mondayOf,
  needsYou,
  gettingStarted,
  studentWorkspace,
  paintHours,
  removeSpan,
  shiftDate,
  weeklyBlocks,
  withDayChanges,
} from "../src/lib/teacher-calendar.ts";

test("timetable trims empty edges without hiding early, late or overnight lessons", () => {
  const normal = { windows: [{ start: 540, lastStart: 1110 }], lessons: [], blocks: [], step: 30, editing: false };
  assert.deepEqual(timetableBounds(normal), { start: 540, end: 1140 });
  assert.deepEqual(timetableBounds({ ...normal, lessons: [{ start: 345, end: 405 }, { start: 1350, end: 1430 }] }), { start: 300, end: 1440 });
  assert.deepEqual(timetableBounds({ ...normal, lessons: [{ start: 0, end: 45 }, { start: 1395, end: 1440 }] }), { start: 0, end: 1440 });
  assert.deepEqual(timetableBounds({ ...normal, blocks: [{ start: 450, end: 510 }, { start: 0, end: 1440 }] }), { start: 420, end: 1140 }, "timed breaks widen the range; a whole day off does not");
  assert.deepEqual(timetableBounds({ ...normal, windows: [] }), { start: 540, end: 1200 });
  assert.deepEqual(timetableBounds({ ...normal, editing: true }), { start: 480, end: 1200 }, "the weekly editor retains empty early cells to paint");
});

test("weekly-hour warnings use Porto time and only changed starts inside booked lessons", () => {
  const before = hoursFromRules([{ weekday: 1, start_minute: 600, last_start_minute: 690 }]);
  const after = { ...before, 1: [{ start: 600, lastStart: 630 }] };
  const bookings = [
    { id: "summer", status: "confirmed", starts_at: "2026-09-07T10:00:00Z", ends_at: "2026-09-07T11:00:00Z" },
    { id: "winter", status: "confirmed", starts_at: "2026-11-02T11:00:00Z", ends_at: "2026-11-02T12:00:00Z" },
    { id: "untouched", status: "confirmed", starts_at: "2026-09-07T09:00:00Z", ends_at: "2026-09-07T10:00:00Z" },
    { id: "cancelled", status: "cancelled", starts_at: "2026-09-07T10:00:00Z", ends_at: "2026-09-07T11:00:00Z" },
    { id: "past", status: "confirmed", starts_at: "2026-08-31T10:00:00Z", ends_at: "2026-08-31T11:00:00Z" },
  ];
  const now = new Date("2026-09-07T08:00:00Z");
  assert.deepEqual(bookingsAffectedByHours(bookings, before, after, 30, now).map(row => row.id), ["summer", "winter"]);
  assert.deepEqual(bookingsAffectedByHours(bookings, before, before, 30, now), []);
  assert.deepEqual(bookingsAffectedByHours(bookings, after, before, 30, now).map(row => row.id), ["summer", "winter"], "Adding hours across a booked lesson warns too");
  const overnight = [{ id: "overnight", status: "confirmed", starts_at: "2026-09-06T22:30:00Z", ends_at: "2026-09-07T00:30:00Z" }];
  const empty = hoursFromRules([]);
  assert.equal(bookingsAffectedByHours(overnight, empty, { ...empty, 1: [{ start: 0, lastStart: 30 }] }, 30, new Date("2026-09-01")).length, 1, "The Monday half of a Sunday-night lesson is included");
});

test("Porto wall times round-trip across DST and reject the missing spring hour", () => {
  const convert = (date, time) => wallTimeToUtc(date, time, "Europe/Lisbon");
  for (const minute of ["01:00", "01:15", "01:30", "01:45"]) {
    assert.throws(() => convert("2027-03-28", minute), /does not exist.*clocks change/);
  }
  assert.equal(convert("2027-03-28", "00:45"), "2027-03-28T00:45:00.000Z");
  assert.equal(convert("2027-03-28", "02:00"), "2027-03-28T01:00:00.000Z");
  assert.equal(convert("2027-01-15", "10:15"), "2027-01-15T10:15:00.000Z");
  assert.equal(convert("2027-07-15", "10:15"), "2027-07-15T09:15:00.000Z");
  for (const time of ["00:00", "00:45", "01:00", "01:15", "01:45", "02:00", "23:45"]) {
    const instant = new Date(convert("2027-10-31", time));
    const actual = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }).format(instant);
    assert.equal(actual, time, "fall's repeated hour must keep the entered time");
  }
  for (const [date, time] of [["2027-02-30", "10:00"], ["2027-03-28", "24:00"], ["2027-13-01", "10:00"], ["invalid", "10:00"]]) {
    assert.throws(() => convert(date, time), /valid date and time/);
  }
});

test("moving an autumn lesson preserves its occurrence of the repeated hour", () => {
  const convert = (time, original) => wallTimeToUtc("2026-10-25", time, "Europe/Lisbon", original);
  assert.equal(convert("01:30", "2026-10-25T00:30:00.000Z"), "2026-10-25T00:30:00.000Z");
  assert.equal(convert("01:30", "2026-10-25T01:30:00.000Z"), "2026-10-25T01:30:00.000Z");
  assert.equal(convert("01:45", "2026-10-25T00:30:00.000Z"), "2026-10-25T00:45:00.000Z");
  assert.equal(convert("01:45", "2026-10-25T01:30:00.000Z"), "2026-10-25T01:45:00.000Z");
  assert.equal(convert("02:00", "2026-10-25T00:30:00.000Z"), "2026-10-25T02:00:00.000Z");
  assert.throws(() => wallTimeToUtc("2027-03-28", "01:30", "Europe/Lisbon", "2027-03-21T01:30Z"), /clocks change/);
});

test("paint and erase preserve the actual bookable starts at inclusive last-start boundaries", () => {
  const original = [
    { start: 600, lastStart: 690 },
    { start: 810, lastStart: 1140 },
  ];
  const split = paintHours(original, 630, 660, false);
  assert.deepEqual(split, [
    { start: 600, lastStart: 600 },
    { start: 690, lastStart: 690 },
    { start: 810, lastStart: 1140 },
  ]);
  const added = paintHours(split, 780, 720, true);
  const actual = candidateStartMinutes({
    startRanges: added,
    duration: 90,
    interval: 30,
  });
  assert.deepEqual(
    actual,
    [
      600, 690, 720, 750, 780, 810, 840, 870, 900, 930, 960, 990, 1020, 1050,
      1080, 1110, 1140,
    ],
  );
  assert.equal(
    actual.at(-1),
    1140,
    "19:00 remains a valid start for a 90-minute lesson",
  );
  assert.deepEqual(original, [
    { start: 600, lastStart: 690 },
    { start: 810, lastStart: 1140 },
  ]);
});

test("precise windows are preserved and use the same range merge semantics as the Worker", () => {
  const precise = [
    { start: 615, lastStart: 700 },
    { start: 680, lastStart: 760 },
  ];
  assert.equal(canPaintHours(precise, 30), false);
  assert.strictEqual(paintHours(precise, 600, 690, false), precise);
  assert.deepEqual(
    lessonStarts(precise),
    candidateStartMinutes({ startRanges: precise, duration: 60, interval: 30 }),
  );
  const week = hoursFromRules([
    { id: 1, weekday: 1, start_minute: 615, last_start_minute: 700, active: 1 },
    { id: 2, weekday: 2, start_minute: 600, last_start_minute: 690, active: 0 },
  ]);
  assert.deepEqual(week[1], [{ start: 615, lastStart: 700 }]);
  assert.deepEqual(week[2], []);
  assert.equal(hoursProblem(week), null);
  assert.match(
    hoursProblem({ ...week, 1: [{ start: Number.NaN, lastStart: 700 }] }),
    /Monday/,
  );
  assert.match(
    hoursProblem({ ...week, 2: [{ start: 900, lastStart: 800 }] }),
    /Tuesday/,
  );
});

test("whole-day editing does not turn partial blocks, extras or recurring exceptions into days off", () => {
  const base = { date: "2026-09-21", note: "", weekday: null };
  const exceptions = [
    { ...base, id: 1, kind: "blocked", start_minute: null, end_minute: null },
    {
      ...base,
      id: 2,
      date: "2026-09-22",
      kind: "blocked",
      start_minute: 600,
      end_minute: 660,
    },
    {
      ...base,
      id: 3,
      date: "2026-09-23",
      kind: "extra",
      start_minute: 600,
      end_minute: 660,
    },
    {
      ...base,
      id: 4,
      date: "2026-09-24",
      kind: "blocked",
      weekday: 4,
      start_minute: null,
      end_minute: null,
    },
    {
      ...base,
      id: 5,
      date: "2026-09-25",
      kind: "blocked",
      start_minute: 0,
      end_minute: 1440,
    },
  ];
  assert.deepEqual(
    [...daysOff(exceptions).keys()],
    ["2026-09-21", "2026-09-25"],
  );
  assert.deepEqual(dateBlocks(exceptions, "2026-09-22"), [
    { start: 600, end: 660 },
  ]);
  assert.deepEqual(
    dateBlocks(exceptions, "2026-09-21"),
    [],
    "a day off is not an hour block",
  );
  assert.deepEqual(weeklyBlocks(exceptions, 4), [
    { start: 0, end: 1440, note: "" },
  ]);
});

test("taking time off and giving it back merges and splits spans without rounding precise times", () => {
  let spans = addSpan([], { start: 840, end: 870 });
  spans = addSpan(spans, { start: 870, end: 900 });
  assert.deepEqual(
    spans,
    [{ start: 840, end: 900 }],
    "two half hours become one hour",
  );
  spans = addSpan(spans, { start: 615, end: 640 });
  assert.deepEqual(removeSpan(spans, { start: 870, end: 900 }), [
    { start: 615, end: 640 },
    { start: 840, end: 870 },
  ]);
  assert.deepEqual(
    removeSpan(spans, { start: 600, end: 630 }),
    [
      { start: 630, end: 640 },
      { start: 840, end: 900 },
    ],
    "cutting across a precise block keeps the part outside the cut",
  );
  assert.deepEqual(removeSpan(spans, { start: 0, end: 1440 }), []);
});

test("a saving change shows exactly what the Worker will store for that date", () => {
  const exceptions = [
    {
      id: 1,
      date: "2026-10-01",
      weekday: null,
      kind: "blocked",
      note: "Holiday",
      start_minute: null,
      end_minute: null,
    },
    {
      id: 2,
      date: "2026-10-01",
      weekday: null,
      kind: "blocked",
      note: "",
      start_minute: 600,
      end_minute: 660,
    },
    {
      id: 3,
      date: "2026-10-01",
      weekday: null,
      kind: "extra",
      note: "",
      start_minute: 1200,
      end_minute: 1200,
    },
    {
      id: 4,
      date: null,
      weekday: 4,
      kind: "blocked",
      note: "Lunch",
      start_minute: 750,
      end_minute: 810,
    },
  ];
  const reopened = withDayChanges(
    exceptions,
    new Map([["2026-10-01", { dayOff: false }]]),
  );
  assert.deepEqual(
    reopened.map((row) => row.id),
    [2, 3, 4],
    "reopening a day keeps its blocked hours",
  );
  const moved = withDayChanges(
    exceptions,
    new Map([["2026-10-01", { blocks: [{ start: 840, end: 900 }] }]]),
  );
  assert.equal(
    daysOff(moved).get("2026-10-01"),
    "Holiday",
    "the day off and its note stay",
  );
  assert.deepEqual(dateBlocks(moved, "2026-10-01"), [{ start: 840, end: 900 }]);
  assert.ok(
    moved.some((row) => row.id === 3) && moved.some((row) => row.id === 4),
    "extra hours and lunch are untouched",
  );
  const again = withDayChanges(
    exceptions,
    new Map([["2026-10-01", { dayOff: true }]]),
  );
  assert.equal(again, exceptions, "an existing day off is not duplicated");
  assert.ok(
    daysOff(
      withDayChanges([], new Map([["2026-10-02", { dayOff: true }]])),
    ).has("2026-10-02"),
  );
});

test("week navigation is independent of local timezone, DST and year boundaries", () => {
  assert.equal(dateKey(new Date("2026-09-07T23:30:00Z")), "2026-09-08");
  assert.equal(dateKey(new Date("2026-12-07T23:30:00Z")), "2026-12-07");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  assert.equal(shiftDate("2026-12-28", 7), "2027-01-04");
  assert.equal(
    shiftDate("2026-10-19", 7),
    "2026-10-26",
    "the autumn clock change does not skip a day",
  );
});

test("lessons crossing midnight or the autumn clock change stay visible in Porto dates", () => {
  const overnight = {
    id: "overnight",
    starts_at: "2026-09-06T22:30:00Z",
    ends_at: "2026-09-06T23:30:00Z",
  };
  const segments = bookingSegments([overnight], "2026-09-07");
  assert.equal(segments.length, 1);
  assert.deepEqual(
    { date: segments[0].date, start: segments[0].start, end: segments[0].end },
    { date: "2026-09-07", start: 0, end: 30 },
  );
  const repeatedHour = {
    id: "dst",
    starts_at: "2026-10-25T00:30:00Z",
    ends_at: "2026-10-25T01:30:00Z",
  };
  const [segment] = bookingSegments([repeatedHour], "2026-10-19");
  assert.equal(segment.date, "2026-10-25");
  assert.ok(segment.end > segment.start);
});

test("her try-out paints every expression, drafts included, before any comes again, and never one twice in a row", async () => {
  const rows = ["a", "b", "c"].map((id, index) => ({ id, expression: `Expressão ${id}`, published: index === 1 ? 1 : 0 }));
  let seed = 7;
  const source = tryOutExpressions("ines", rows, () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
  const atRest = await source.load();
  assert.deepEqual([atRest.expression, atRest.canPick, atRest.shuffleLabels.length], [null, true, 3]);
  const painted = [];
  for (let press = 0; press < 30; press++) painted.push((await source.pick(`press-${press}`)).expression.id);
  for (let round = 0; round < 30; round += 3) assert.deepEqual(painted.slice(round, round + 3).sort(), ["a", "b", "c"]);
  assert.ok(painted.every((id, index) => id !== painted[index - 1]), painted.join(""));
  assert.equal((await source.pick("press-29")).expression.id, painted[29], "the same press paints the same one");
});

test("Needs you lists only what waits on her, once each, and empties on its own", () => {
  const now = new Date("2026-09-07T10:00:00Z");
  const ago = (hours) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  const row = (id, starts, extra = {}) => ({
    id, status: "confirmed", student_name: "Sam Known", student_email: "sam@example.invalid",
    starts_at: `${starts}T10:00:00Z`, ends_at: `${starts}T11:00:00Z`, reschedule_count: 0, ...extra,
  });
  const meet = { configured: true, connected: true, email: null, needsReconnect: true, pending: 0 };
  const student = (id, extra) => ({ id, name: id, email: `${id}@example.invalid`, awaitingWelcome: true, ...extra });
  const lessons = [
    row("changed-recent", "2026-09-10", { student_changed_at: "2026-09-06T12:00:00Z", previous_starts_at: "2026-09-09T10:00:00Z" }),
    row("changed-old", "2026-09-10", { student_changed_at: "2026-09-04T09:00:00Z" }),
    row("moved-by-her", "2026-09-10", { reschedule_count: 1 }),
    row("changed-started", "2026-09-07", { starts_at: "2026-09-07T09:30:00Z", ends_at: "2026-09-07T10:30:00Z", student_changed_at: ago(1) }),
    row("w1", "2026-09-11", { series_id: "s1", student_changed_at: ago(5) }),
    row("w2", "2026-09-18", { series_id: "s1", student_changed_at: ago(5) }),
    row("first-soon", "2026-09-08", { first_lesson: 1 }),
    row("first-far", "2026-09-20", { first_lesson: 1 }),
    row("first-added", "2026-09-08", { first_lesson: 1, added_by_teacher: 1 }),
    // A first lesson the student changes shows once, as changed.
    row("first-changed", "2026-09-15", { first_lesson: 1, student_changed_at: ago(2) }),
    // A lesson she added is never read as the student's first, moved or not.
    row("added-changed", "2026-09-15", { first_lesson: 1, added_by_teacher: 1, student_changed_at: ago(2) }),
    // Set up with no email yet, so nothing is listed or sent about them.
    row("no-email", "2026-09-09", { first_lesson: 1, student_email: "no-email:abc" }),
  ];
  const cancellations = [
    row("c1", "2026-09-12", { status: "cancelled", cancelled_by: "student", cancelled_at: ago(2) }),
    row("c-teacher", "2026-09-12", { status: "cancelled", cancelled_by: "teacher", cancelled_at: ago(2) }),
    // A refunded run stamps each lesson separately: still one card.
    row("r1", "2026-09-16", { status: "cancelled", cancelled_by: "student", series_id: "s2", cancelled_at: ago(10) }),
    row("r2", "2026-09-23", { status: "cancelled", cancelled_by: "student", series_id: "s2", cancelled_at: ago(9) }),
    row("c-old", "2026-09-13", { status: "cancelled", cancelled_by: "student", cancelled_at: ago(73) }),
  ];
  const students = [
    student("Ana", { nextLessonAt: "2026-09-09T10:00:00Z" }),
    student("Kai", { nextLessonAt: "2026-09-20T10:00:00Z" }),
    student("Bea", { email: "", nextLessonAt: "2026-09-08T10:00:00Z" }),
    student("Cal", { email: "no-email:xyz", nextLessonAt: "2026-09-08T10:00:00Z" }),
    student("Dot", { awaitingWelcome: false, nextLessonAt: "2026-09-08T10:00:00Z" }),
  ];
  const items = needsYou({ now, meet, payments: [{ id: "p1", reference: "REVIEW-1", payment_status: "processing" }], students, lessons, cancellations });
  assert.deepEqual(new Set(items.map(item => item.key)), new Set([
    "meet", "payment:p1", "first:first-soon", "welcome:Ana", "welcome:Kai", "email:Bea", "email:Cal", "changed:changed-recent", "changed:w1", "cancelled:c1", "changed:first-changed", "changed:added-changed", "cancelled:r1",
  ]));
  const changes = items.filter(item => item.kind === "changed");
  assert.equal(changes[0].key, "changed:first-changed", "newest student changes lead older ones");
  const by = (key) => items.find((item) => item.key === key);
  assert.equal(by("meet").reconnect, true);
  assert.equal(by("payment:p1").part, "lesson");
  assert.equal(by("changed:w1").count, 2);
  assert.equal(by("cancelled:r1").count, 2);
  assert.equal(by("changed:first-changed").first, true);
  assert.equal(by("changed:added-changed").first, false);

  // Resolved, started or out of time: nothing waits, and nothing is stored to dismiss.
  assert.deepEqual(needsYou({ now, meet: { ...meet, configured: false }, payments: [], students: [], lessons: [], cancellations: [] }), []);
  assert.deepEqual(needsYou({ now, meet: { ...meet, needsReconnect: false }, payments: [], students: [], lessons: [], cancellations: [] }), []);
  // Each clears on its own: after three days, or once the lesson has begun.
  const alone = (at, rows) => needsYou({ now: new Date(at), meet: null, payments: [], students: [], lessons: rows, cancellations: [] }).map((item) => item.key);
  assert.deepEqual(alone("2026-09-09T11:00:00Z", [lessons[0]]), ["changed:changed-recent"]);
  assert.deepEqual(alone("2026-09-09T13:00:00Z", [lessons[0]]), []);
  const today = row("today", "2026-09-07", { starts_at: "2026-09-07T12:00:00Z", ends_at: "2026-09-07T13:00:00Z", student_changed_at: "2026-09-07T09:00:00Z" });
  assert.deepEqual(alone("2026-09-07T10:00:00Z", [today]), ["changed:today"]);
  assert.deepEqual(alone("2026-09-07T12:30:00Z", [today]), []);
});


test("a declined card and a card just added are Needs you cards on the student's row, not emails to Inês", () => {
  const now = new Date("2026-09-08T10:00:00Z");
  const base = { email: "x@example.invalid", signedIn: true, hasLessons: true, awaitingWelcome: false };
  const students = [
    { ...base, id: "ana", name: "Ana", hasCard: true,
      cardDeclined: [{ bookingId: "b1", reference: "PT-ONE", startsAt: "2026-09-05T15:00:00Z", amountCents: 1500, part: "lesson" },
        { bookingId: "b1", reference: "PT-ONE", startsAt: "2026-09-05T15:00:00Z", amountCents: 500, part: "fee" }] },
    { ...base, id: "kai", name: "Kai", hasCard: true, cardAdded: { at: "2026-09-07T09:00:00Z", lessons: [{ bookingId: "b2", startsAt: "2026-09-10T10:00:00Z" }] } },
    // A card since removed says nothing, and a student who has paid has nothing to chase.
    { ...base, id: "dot", name: "Dot", hasCard: false, cardAdded: { at: "2026-09-07T09:00:00Z", lessons: [] }, cardDeclined: [] },
  ];
  const items = needsYou({ now, meet: null, payments: [], students, lessons: [], cancellations: [] });
  assert.deepEqual(items.map((item) => item.key), ["declined:b1:lesson", "declined:b1:fee", "card:kai"], "money first, as payments are");
  const workspace = studentWorkspace(students, items, true, []);
  assert.equal(workspace.general.length, 0);
  assert.deepEqual(workspace.rows.map((row) => [row.student.id, row.items.length]), [["ana", 2], ["kai", 1], ["dot", 0]]);
});

test("setup suggests lessons before email and student steps without requiring them, while completed steps stay editable", () => {
  const student = (id, extra) => ({ id, name: id, email: `${id}@example.invalid`, signedIn: false, hasCard: false, hasLessons: true, awaitingWelcome: true, ...extra });
  const students = [
    student("email", { email: "" }),
    student("lessons", { hasLessons: false }),
    student("welcome", { nextLessonAt: null }),
    student("far", { nextLessonAt: "2027-01-01T10:00:00Z" }),
    student("sign-in", { awaitingWelcome: false }),
    student("card", { awaitingWelcome: false, signedIn: true }),
    student("self-booked", { awaitingWelcome: undefined, signedIn: true, hasCard: true }),
    student("past", { awaitingWelcome: false, signedIn: true, hasCard: true, nextLessonAt: null }),
  ];
  const setup = gettingStarted(students);
  assert.deepEqual(setup.map(row => [row.student.id, row.next, row.owner]), [
    ["email", "email", "Yours"], ["lessons", "lessons", "Yours"], ["welcome", "welcome", "Yours"], ["far", "welcome", "Yours"],
    ["sign-in", "sign-in", "Theirs"], ["card", "card", "Theirs"],
  ]);
  assert.deepEqual(setup[0].steps.map(step => step.id), ["price", "lessons", "email", "welcome", "sign-in", "card"]);
  assert.deepEqual(setup.map(row => row.steps.map(step => step.done)), [
    [true, true, false, false, false, false], [true, false, true, false, false, false],
    [true, true, true, false, false, false], [true, true, true, false, false, false],
    [true, true, true, true, false, false], [true, true, true, true, true, false],
  ]);
  const by = (row, id) => row.steps.find(step => step.id === id);
  const nameOnly = gettingStarted([student("name-only", { email: "", hasLessons: false })])[0];
  assert.equal(nameOnly.next, "lessons", "standard prices are ready, so the first lesson is suggested before the email");
  assert.equal(by(nameOnly, "lessons").lockedReason, undefined);
  // A lesson is never required (16 October 2026, Inês): the email is open, and only it holds the welcome.
  assert.equal(by(nameOnly, "email").lockedReason, undefined);
  assert.ok(nameOnly.steps.filter(step => ["welcome", "sign-in", "card"].includes(step.id)).every(step => step.lockedReason === "Add an email first."));
  assert.equal(by(setup[1], "welcome").lockedReason, undefined, "a student with an email and no lessons can be welcomed");
  assert.equal(by(setup[1], "sign-in").lockedReason, "Send the welcome email first.");
  assert.ok(by(setup[0], "welcome").lockedReason);
  assert.ok(by(setup[2], "sign-in").lockedReason);
  assert.ok(by(setup[4], "card").lockedReason);
  // Once welcomed, booking is theirs: no lessons holds nothing open.
  const welcomedNoLessons = gettingStarted([student("welcomed", { hasLessons: false, awaitingWelcome: false })])[0];
  assert.equal(welcomedNoLessons.next, "sign-in");
  assert.deepEqual(gettingStarted([student("legacy", { hasLessons: false, awaitingWelcome: undefined, signedIn: true, hasCard: true })]), [], "signed in with a card and no lessons is a student, not setup");
  const tasks = needsYou({ now: new Date("2026-10-14T10:00:00Z"), meet: null, payments: [], students, lessons: [], cancellations: [] });
  assert.deepEqual(new Set(tasks.map(item => item.key)), new Set(["welcome:far", "email:email", "lessons:lessons", "welcome:lessons", "welcome:welcome"]));
  assert.ok(tasks.every(item => setup.some(row => row.student.id === item.student.id && row.owner === "Yours")), "the tab count excludes waiting on them");
  assert.deepEqual(gettingStarted([student("cards-off", { awaitingWelcome: false, signedIn: true })], false), [], "cards switched off do not hold setup open");
  assert.deepEqual(gettingStarted([student("free", { awaitingWelcome: false, signedIn: true, prices: { 60: 0, 90: 0 } })]), [], "a student free at every length has no card to add");

  const ready = (id, extra = {}) => student(id, { awaitingWelcome: false, signedIn: true, hasCard: true, ...extra });
  const workspaceStudents = [
    ready("regular", { name: "Alex" }),
    student("waiting", { awaitingWelcome: false }),
    ready("first"),
    student("setup-later", { email: "", nextLessonAt: "2026-10-20T10:00:00Z" }),
    student("setup-soon", { email: "", nextLessonAt: "2026-10-15T10:00:00Z" }),
    ready("changed-old"),
    ready("changed-new"),
    ready("payment", { name: "Same Name" }),
    ready("same-name", { name: "Same Name" }),
  ];
  const booking = (id, studentId, email, extra = {}) => ({ id, student_id: studentId, student_email: email, starts_at: "2026-10-16T10:00:00Z", ...extra });
  const paymentBooking = booking("pay-one", "payment", "same-name@example.invalid");
  const paymentBookingTwo = booking("pay-two", "payment", "");
  const operational = [
    { kind: "payment", key: "payment:pay-one", review: { id: "pay-one", student_name: "Same Name" }, part: "lesson" },
    { kind: "payment", key: "payment:pay-two", review: { id: "pay-two" }, part: "fee" },
    { kind: "changed", key: "changed:old", booking: booking("old", "changed-old", "", { student_changed_at: "2026-10-13T10:00:00Z" }), count: 1 },
    { kind: "first", key: "first:first", booking: booking("first", "first", "") },
    { kind: "meet", key: "meet", reconnect: true },
    { kind: "cancelled", key: "cancelled:new", booking: booking("new", null, " CHANGED-NEW@EXAMPLE.INVALID ", { cancelled_at: "2026-10-14T10:00:00Z" }), count: 1 },
    { kind: "payment", key: "payment:unmatched", review: { id: "unmatched", student_name: "Same Name" }, part: "refund" },
  ];
  const setupTasks = needsYou({ now: new Date("2026-10-14T10:00:00Z"), meet: null, payments: [], students: workspaceStudents, lessons: [], cancellations: [] });
  const workspace = studentWorkspace(workspaceStudents, [...setupTasks, ...operational], true, [paymentBooking, paymentBookingTwo]);
  assert.deepEqual(workspace.rows.map(row => row.student.id), ["payment", "changed-new", "changed-old", "setup-soon", "setup-later", "first", "waiting", "regular", "same-name"]);
  assert.equal(new Set(workspace.rows.map(row => row.student.id)).size, workspaceStudents.length, "each student has one row");
  assert.deepEqual(workspace.rows.find(row => row.student.id === "payment").items.map(item => item.key), ["payment:pay-one", "payment:pay-two"], "student identity wins over a mismatched email");
  assert.ok(workspace.rows.every(row => row.items.every(item => !["email", "lessons", "welcome"].includes(item.kind))), "setup actions are not repeated as task cards");
  assert.deepEqual(workspace.general.map(item => item.key), ["meet", "payment:unmatched"], "an unresolved payment never guesses by name");
  const unknownOwner = studentWorkspace(workspaceStudents, [{ kind: "payment", key: "payment:unknown-owner", review: { id: "unknown-owner" }, part: "lesson" }], true,
    [booking("unknown-owner", "another-account", "payment@example.invalid")]);
  assert.deepEqual(unknownOwner.general.map(item => item.key), ["payment:unknown-owner"], "a booking with an explicit unknown owner never falls back to someone else's email");
  assert.equal(workspace.attentionCount, 8, "count each actionable student once, plus general warnings; waiting on the student does not count");
  assert.equal(workspace.rows.find(row => row.student.id === "regular").setup, undefined, "a past confirmed lesson and standard prices remain complete");
  assert.equal(studentWorkspace([ready("cards-off", { hasCard: false })], [], false, []).attentionCount, 0);
});

test("a teacher who is also a student opens Your lessons only when asked; every other teacher opens the schedule", () => {
  const teacher = { role: "teacher", alsoStudent: false };
  const dual = { role: "teacher", alsoStudent: true };
  assert.equal(opensSchedule(teacher, true), true);
  assert.equal(opensSchedule(dual, true), false, "/book/?view=lessons stays on their lessons");
  assert.equal(opensSchedule(dual, false), true, "booking and a plain /book/ still go to the schedule");
  assert.equal(opensSchedule({ role: "student" }, false), false);
  assert.equal(opensSchedule(null, false), false);
  assert.deepEqual([teacher, dual, { role: "student" }].map(hasStudentSide), [false, true, true]);
});
