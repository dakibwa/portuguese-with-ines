// The site's own checks on the booking Worker's replies (src/lib/*-api.ts),
// with fetch stubbed: a reply that is malformed, or well formed with a bad row
// inside, must be refused as unreadable rather than shown, saved over what is
// on screen, or reported as done. One case each per shape that once crashed a
// page or invented a date. qa-selection-calendar-recovery keeps one student and
// one teacher case of each kind in the browser, to prove the alert and retry.
//
// Run with: node --test scripts/test-reply-validation.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

// The modules are the site's TypeScript, importing each other as "@/lib/…"
// and the tutor's record as JSON: resolve and transform them as Next does.
const src = new URL("../src/", import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      for (const extension of [".ts", ".tsx"]) {
        const url = new URL(`${specifier.slice(2)}${extension}`, src);
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
      }
    }
    const resolved = next(specifier, context);
    return resolved.url.endsWith(".json") ? { ...resolved, importAttributes: { type: "json" } } : resolved;
  },
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform" });
    return { format: "module", source, shortCircuit: true };
  }
});
process.env.NEXT_PUBLIC_BOOKING_API_BASE_URL = "https://booking.example.invalid";
process.removeAllListeners("warning");

const { BOOKING_REPLY_ERROR } = await import("@/lib/api-response");
const { cancelBooking, createBooking, fetchBooking, previewSeries, rescheduleBooking, rescheduleSeries } = await import("@/lib/booking-api");
const { createBookingFor, fetchBookings, fetchSchedule, saveDayOff, saveRules } = await import("@/lib/admin-api");
const { confirmEmailChange, fetchMe, requestEmailChange } = await import("@/lib/auth-api");

// Each call answers with the next reply: a JSON body, `{ status, body }`, or
// "network" for a request that never arrives.
function answer(...replies) {
  globalThis.fetch = async () => {
    const reply = replies.shift();
    if (reply === "network") throw new TypeError("Failed to fetch");
    const { status = 200, body } = reply && "body" in reply ? reply : { body: reply };
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
}
const unreadable = (error) => error instanceof Error && error.message === BOOKING_REPLY_ERROR;
async function refused(call, reply) {
  answer(reply);
  await assert.rejects(call, unreadable, JSON.stringify(reply));
}
async function accepted(call, reply) {
  answer(reply);
  await call();
}

const student = { id: "continuity", name: "Ana Martins", email: "ana@example.invalid", nif: "", phone: "", timezone: "Europe/Lisbon", role: "student" };
const lesson = {
  reference: "PT-ACDEFG", status: "confirmed", startAt: "2026-10-05T10:00:00Z", endAt: "2026-10-05T11:00:00Z",
  location: "online", studentName: student.name, studentEmail: student.email, studentTimezone: student.timezone,
  notes: "", rescheduleCount: 0, sameDayFeeCents: 500, paymentStatus: "scheduled",
  lessonType: { id: "single", name: "Single lesson", durationMinutes: 60, priceCents: 2500 },
  isPast: false, sameDayFeeApplies: false, seriesId: null, manageToken: "fixture"
};
const rules = [{ id: 1, weekday: 1, start_minute: 600, last_start_minute: 720 }];
const adminLesson = { id: "lesson", reference: "PT-ACDEFG", status: "confirmed", starts_at: lesson.startAt, ends_at: lesson.endAt, lesson_name: "60 minutes",
  student_name: student.name, student_email: student.email, student_phone: "", location: "online", notes: "", payment_status: "scheduled",
  attendance_status: "expected", same_day_change: 0, same_day_fee_status: "not_required", reschedule_count: 0 };
const exception = (body) => ({ id: 1, date: body.date, kind: "blocked", note: "", start_minute: 600, end_minute: 660 });
const day = "2026-10-05";
const booking = { notes: "", lessonType: "single", startAt: lesson.startAt, location: "online", timezone: "Europe/Lisbon" };

test("an account with a bad lesson, date, weekly run or NIF is unreadable, not shown", async () => {
  const me = () => fetchMe("session");
  await accepted(me, { student, bookings: [lesson], series: [], sameDayFeeCents: 500 });
  for (const [name, reply] of Object.entries({
    "account-booking": { student, bookings: [null], series: [] },
    "account-date": { student, bookings: [{ ...lesson, startAt: "not-a-date" }], series: [] },
    "account-series": { student, bookings: [lesson], series: [null] },
    "account-nif": { student: { ...student, nif: 123456789 }, bookings: [lesson], series: [] }
  })) await assert.rejects(() => (answer(reply), me()), unreadable, name);
});

test("Inês's hours with a bad exception, label or weekday are unreadable", async () => {
  const schedule = () => fetchSchedule("teacher");
  await accepted(schedule, { rules, exceptions: [{ id: 1, date: null, kind: "blocked", weekday: 1, start_minute: 750, end_minute: 810, note: "Lunch" }] });
  await refused(schedule, { rules, exceptions: [null] }); // teacher-exception
  await refused(schedule, { rules, exceptions: [{ id: 1, date: null, kind: "blocked", weekday: 1, start_minute: 600, end_minute: 630, note: { value: "Malformed lunch label" } }] }); // teacher-note
  await refused(schedule, { rules: [{ ...rules[0], weekday: 8 }], exceptions: [] }); // teacher-rule
});

test("her lessons with a bad date, name or payment review row are unreadable", async () => {
  const bookings = () => fetchBookings("teacher");
  await accepted(bookings, { bookings: [adminLesson], manualPaymentReconciliation: [{ id: "isolated", reference: "REVIEW-123" }] });
  await refused(bookings, { bookings: [{ ...adminLesson, starts_at: "not-a-date" }] }); // teacher-booking
  await refused(bookings, { bookings: [{ ...adminLesson, student_name: { value: "Malformed name" } }] }); // teacher-name
  await refused(bookings, { bookings: [], manualPaymentReconciliation: [null] }); // teacher-reconciliation
});

test("a managed lesson that ends at no time is unreadable", async () => {
  const managed = () => fetchBooking("fixture");
  await accepted(managed, { booking: lesson, isPast: false, sameDayFeeApplies: false });
  await refused(managed, { booking: { ...lesson, endAt: "not-a-date" }, isPast: false, sameDayFeeApplies: false }); // managed
});

test("a weekly preview never invents a skipped date or books from a missing list", async () => {
  const preview = () => previewSeries("session", { lessonType: "single", startAt: lesson.startAt, weeks: 4 });
  await accepted(preview, { bookable: [lesson.startAt], skipped: [] });
  await refused(preview, { bookable: [lesson.startAt], skipped: [null] }); // preview-skipped
  await refused(preview, { bookable: null, skipped: [] }); // preview-missing
});

test("a booking, cancellation or move is only reported done with a readable acknowledgment", async () => {
  const create = () => createBooking("session", booking);
  await accepted(create, { booking: lesson, series: { id: "weekly", weeks: 4, openEnded: false, booked: [lesson.startAt], skipped: [] } });
  await refused(create, { booking: { ...lesson, startAt: "not-a-date" } }); // create-date
  await refused(create, { booking: lesson, series: { id: "weekly", weeks: 4, openEnded: false, booked: [lesson.startAt], skipped: [null] } }); // create-series
  await refused(create, { booking: lesson, selection: { booked: null, skipped: [], recurring: false, weeks: null, weeklyTimes: 0 } }); // create-selection
  const changed = { booking: { ...lesson, lessonType: null }, sameDayFeeApplied: false };
  await accepted(() => cancelBooking("fixture"), { booking: lesson, sameDayFeeApplied: false });
  await refused(() => cancelBooking("fixture"), changed); // cancel
  await accepted(() => rescheduleBooking("fixture", lesson.startAt), { booking: lesson, sameDayFeeApplied: false });
  await refused(() => rescheduleBooking("fixture", lesson.startAt), changed); // move
  const series = () => rescheduleSeries("session", "weekly", lesson.startAt);
  await accepted(series, { ok: true, moved: 1, bookings: [lesson], kept: [] });
  await refused(series, { ok: true, moved: 1, bookings: [null], kept: [] }); // move-series
  // Her own lesson for a student, too: no acknowledgment, no "emailed".
  const forStudent = () => createBookingFor("teacher", { studentId: "rui", lessonType: "single", startAt: lesson.startAt, location: "online", notes: "" });
  await accepted(forStudent, { booking: { reference: "TEST-manual" } });
  await refused(forStudent, {});
});

test("a time-off or weekly-hours save with an unreadable reply is not taken as saved", async () => {
  const off = () => saveDayOff("teacher", day, { blocks: [{ start: 600, end: 660 }] });
  await accepted(off, { ok: true, exceptions: [exception({ date: day })] });
  for (const reply of [{}, { ok: true, exceptions: "broken" }, { ok: true, exceptions: [null] }]) await refused(off, reply);
  const hours = () => saveRules("teacher", [{ weekday: 1, startMinute: 600, lastStartMinute: 600 }]);
  await accepted(hours, { ok: true, count: 1 });
  for (const reply of [{}, { ok: true, count: "not-a-count" }]) await refused(hours, reply);
});

test("an interrupted time-off save fails the same way whether refused, lost or unreadable", async () => {
  // The browser journey holds one of these behind a later save and checks the
  // later one wins; each kind must reach it as a failure, never as a success.
  const off = () => saveDayOff("teacher", day, { blocks: [{ start: 600, end: 630 }] });
  for (const reply of [{ status: 503, body: { error: "First save interrupted." } }, "network", {}]) {
    answer(reply);
    await assert.rejects(off, Error, JSON.stringify(reply));
  }
});

test("an email change or confirmation with an unreadable reply changes nothing", async () => {
  await refused(() => requestEmailChange("session", "updated@example.invalid"), { ok: true, pending: { invalid: true } });
  await refused(() => confirmEmailChange("session", "isolated"), { student: { ...student, email: "verified@example.invalid" }, session: { invalid: true } });
});
