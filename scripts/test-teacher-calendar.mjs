import test from "node:test";
import assert from "node:assert/strict";
import { candidateStartMinutes } from "../workers/booking/availability.mjs";
import {
  addSpan,
  bookingSegments,
  canPaintHours,
  dateBlocks,
  dateKey,
  daysOff,
  hoursFromRules,
  hoursProblem,
  lessonStarts,
  mondayOf,
  paintHours,
  removeSpan,
  shiftDate,
  weeklyBlocks,
  withDayChanges,
} from "../src/lib/teacher-calendar.ts";

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
