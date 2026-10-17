/**
 * Writes every transactional email template, in each of its variants, as HTML
 * with realistic sample data, plus a manifest naming the template, the variant
 * and the old emails (the forty numbered previews) each one covers.
 *
 *   node scripts/render-email-previews-v2.mjs [outDir]
 *
 * Nothing is sent: it renders through the same templates and layout as the
 * Worker. Old 31 (her card-declined email) and 35 (her card-added email) have
 * no file: both are now cards in her Needs you.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderEmail } from "../workers/booking/email.mjs";
import * as t from "../workers/booking/email-templates.mjs";

const outDir = path.resolve(process.argv[2] ?? "/workspace/hw-share/emails-v2/html");

const site = "https://portuguesewithines.com";
const manageUrl = `${site}/book/?manage=sample-token`;
const lessonsUrl = `${site}/book/?view=lessons`;
const meet = "https://meet.google.com/abc-defg-hij";
const policy = { notice: "14 hours", fee: "€5" };
const ana = { first: "Ana" };
const anaForInes = { name: "Ana Silva", email: "ana.silva@example.com", phone: "+351 912 345 678", nif: "123456789", notes: "I'd like to practise speaking." };
const lesson = { lesson: "60-minute lesson", lessonName: "60-minute lesson", place: "Online", reference: "PT-PW5AGC" };
const studentWhen = { when: "Tuesday, 8 September 2026 at 10:00, Porto time", shortWhen: "Tue 8 Sept, 10:00" };
const inesWhen = { when: "Tuesday, 8 September 2026 at 10:00, Porto time", shortWhen: "Tue 8 Sept, 10:00",
  heroNote: { label: "Ana’s time", value: "Tue 8 Sept, 05:00 · New York time" } };
const welcomeLink = { url: `${site}/book/?signin=sample`, card: true, neverIn: true };
const weeks = ["3", "10", "17", "24"].map((day, index) => ({
  short: `Thu ${day} Sept, 17:30`, long: `Thursday ${day} September 2026 at 17:30`,
  meetingUrl: index === 0 ? meet : "", online: true, place: "Online"
}));
const weekly = (extra = {}) => ({
  oneOff: false, fixed: false, twoTimes: false, count: weeks.length, skippedNote: "",
  repeats: { label: "Repeats", value: "Every week, until you stop it" }, occurrences: weeks, lastShort: "Thu 24 Sept, 17:30", ...extra
});
const weeklyWhen = { when: "Thursday, 3 September 2026 at 17:30, Porto time", shortWhen: "Thu 3 Sept, 17:30" };

const welcomeRows = [
  { label: "Your price · 60 minutes", value: "€25 a lesson" },
  { label: "Your price · 90 minutes", value: "€35 a lesson" },
  { label: "Lesson · Online", value: "Tuesday 20 October 2026, 15:00 · Porto time\n60 minutes · €25" },
  { label: "Weekly · Online", value: "Every Thursday, 11:00 · Porto time\nFrom 22 October 2026, until you stop it\n60 minutes · €25 a lesson" }
];

const previews = [
  ["student-booked", "student-books-one-lesson", [1], t.studentBooked({ ...ana, ...lesson, ...studentWhen, ...policy, meetingUrl: meet, byInes: false,
    price: t.priceValue({ terms: "card", amount: "€25" }), policy: "card", manageUrl })],
  ["student-booked", "free-lesson", [1], t.studentBooked({ ...ana, ...lesson, ...studentWhen, ...policy, byInes: false, price: "Free", policy: "free", manageUrl })],
  ["student-booked", "ines-booked-it", [2], t.studentBooked({ ...ana, ...lesson, ...studentWhen, ...policy, meetingUrl: meet, byInes: true,
    price: t.priceValue({ terms: "asUsual", amount: "€25" }), policy: "unpaid", manageUrl })],
  ["student-booked", "ines-booked-it-with-welcome", [2, 32], t.studentBooked({ ...ana, ...lesson, ...studentWhen, ...policy, byInes: true, welcome: welcomeLink,
    price: t.priceValue({ terms: "untilCard", amount: "€25" }), policy: "unpaid", manageUrl })],
  ["student-booked", "weekly", [5], t.studentBooked({ ...ana, ...lesson, ...weeklyWhen, ...policy, byInes: false, lessonsUrl,
    price: t.priceValue({ terms: "card", amount: "€25", run: true }), policy: "card", run: weekly() })],
  ["student-booked", "weekly-ines-set-up", [6], t.studentBooked({ ...ana, ...lesson, ...weeklyWhen, ...policy, byInes: true, lessonsUrl,
    welcome: { ...welcomeLink, card: false }, price: t.priceValue({ terms: "asUsual", amount: "€25", run: true }), policy: "unpaid",
    run: weekly({ slot: { weekday: "Thursday", time: "17:30" } }) })],

  ["teacher-booked", "student-booked", [3], t.lessonBookedTeacher({ ...lesson, ...inesWhen, student: anaForInes, byInes: false, meetingUrl: meet, paidAmount: "" })],
  ["teacher-booked", "student-booked-and-paid", [3], t.lessonBookedTeacher({ ...lesson, ...inesWhen, student: anaForInes, byInes: false, paidAmount: "€25" })],
  ["teacher-booked", "you-added", [4], t.lessonBookedTeacher({ ...lesson, ...inesWhen, student: { ...anaForInes, notes: "" }, byInes: true, welcome: welcomeLink })],
  ["teacher-booked", "you-added-not-emailed", [4], t.lessonBookedTeacher({ ...lesson, ...inesWhen, heroNote: "", student: { ...anaForInes, email: "No email yet", nif: "" },
    byInes: true, held: true, noEmailYet: true })],
  ["teacher-booked", "weekly", [7], t.lessonBookedTeacher({ ...lesson, ...weeklyWhen, student: anaForInes, byInes: false,
    run: weekly({ repeats: { label: "Repeats", value: "Every week, until stopped" }, occurrences: weeks.map((week) => ({ ...week, meetingUrl: "" })) }) })],
  ["teacher-booked", "you-added-weekly", [8], t.lessonBookedTeacher({ ...lesson, ...weeklyWhen, student: { ...anaForInes, notes: "" }, byInes: true, held: true,
    run: weekly({ repeats: { label: "Repeats", value: "Every week, until stopped" }, skippedNote: "One lesson time was unavailable and was left out: Thu 1 Oct." }) })],
  ["teacher-booked", "weekly-extended", [17], t.lessonBookedTeacher({ ...lesson, ...weeklyWhen, student: { ...anaForInes, notes: "" }, byInes: false, extended: true,
    run: weekly({ repeats: { label: "Repeats", value: "Every week, until stopped" } }) })],

  ["lesson-reminder", "with-meet-link", [9], t.lessonReminder({ ...ana, ...lesson, ...studentWhen, meetingUrl: meet, manageUrl, cutoff: "Mon 7 Sept, 20:00", policy: "card", fee: "€5" })],
  ["lesson-reminder", "link-coming", [9], t.lessonReminder({ ...ana, ...lesson, ...studentWhen, meetComing: true, manageUrl, cutoff: "Mon 7 Sept, 20:00", policy: "paid" })],
  ["lesson-reminder", "in-porto-free", [9], t.lessonReminder({ ...ana, ...lesson, place: "In Porto", ...studentWhen, manageUrl, cutoff: "Mon 7 Sept, 20:00", policy: "free" })],
  ["lesson-reminder", "meeting-link", [10], t.lessonReminder({ ...ana, ...lesson, ...studentWhen, linkOnly: true, meetingUrl: meet, manageUrl })],

  ["student-moved", "student-moved-late", [11], t.studentMoved({ ...ana, ...lesson, ...studentWhen, ...policy, byInes: false, meetingUrl: meet,
    price: t.priceValue({ terms: "card", amount: "€25" }), policy: "late", manageUrl,
    lateNote: "This change was made less than 14 hours before the lesson, so the €5 fee is charged automatically to your saved card." })],
  ["student-moved", "length-changed", [11], t.studentMoved({ ...ana, ...lesson, lesson: "90-minute lesson", lessonName: "90-minute lesson", ...studentWhen, ...policy,
    byInes: false, lengthChanged: true, minutes: 90, price: t.priceValue({ terms: "card", amount: "€35" }), policy: "card", manageUrl })],
  ["student-moved", "ines-moved-it", [12], t.studentMoved({ ...ana, ...lesson, ...studentWhen, ...policy, byInes: true,
    price: t.priceValue({ terms: "asUsual", amount: "€25" }), policy: "unpaid", manageUrl })],
  ["student-moved", "weekly", [15], t.studentMoved({ ...ana, ...lesson, ...weeklyWhen, ...policy, byInes: false, lessonsUrl,
    price: t.priceValue({ terms: "card", amount: "€25", run: true }), policy: "card", run: weekly() })],

  ["teacher-moved", "student-moved", [13], t.lessonMovedTeacher({ ...lesson, ...inesWhen, ...policy, student: anaForInes, byInes: false,
    previousWhen: "Monday, 7 September 2026 at 10:00" })],
  ["teacher-moved", "student-moved-late", [13], t.lessonMovedTeacher({ ...lesson, ...inesWhen, ...policy, student: anaForInes, byInes: false, late: true,
    previousWhen: "Monday, 7 September 2026 at 10:00", lateNote: "This was changed less than 14 hours before the lesson, so the €5 fee is charged automatically to the student's saved card." })],
  ["teacher-moved", "you-moved", [14], t.lessonMovedTeacher({ ...lesson, ...inesWhen, ...policy, student: { ...anaForInes, notes: "" }, byInes: true,
    previousWhen: "Monday, 7 September 2026 at 10:00" })],
  ["teacher-moved", "weekly", [16], t.lessonMovedTeacher({ ...lesson, ...weeklyWhen, student: { ...anaForInes, notes: "" }, byInes: false,
    run: weekly({ repeats: { label: "Repeats", value: "Every week, until stopped" } }) })],

  ["student-cancelled", "student-cancelled", [18], t.studentCancelled({ ...ana, ...lesson, ...studentWhen, byInes: false, note: "The lesson price will not be charged." })],
  ["student-cancelled", "ines-cancelled-with-message", [19], t.studentCancelled({ ...ana, ...lesson, ...studentWhen, byInes: true,
    message: "Olá Ana,\nI’m unwell this week, sorry! Shall we find another time?\nInês",
    note: "Refunded in full: your €25 is on its way back to your card and usually shows within a few days." })],
  ["student-cancelled", "weekly", [22], t.studentCancelled({ ...ana, run: { count: "3 lessons", zone: "Porto time",
    dates: "Thursday 10 September 2026 at 17:30\nThursday 17 September 2026 at 17:30\nThursday 24 September 2026 at 17:30" } })],

  ["teacher-cancelled", "student-cancelled-late", [20], t.lessonCancelledTeacher({ ...lesson, ...inesWhen, ...policy, student: anaForInes, byInes: false, late: true,
    longWhen: "Tuesday, 8 September 2026 at 10:00", note: "This was cancelled less than 14 hours before the lesson, so the €5 fee applies." })],
  ["teacher-cancelled", "you-cancelled", [21], t.lessonCancelledTeacher({ ...lesson, ...inesWhen, ...policy, student: { ...anaForInes, notes: "" }, byInes: true,
    longWhen: "Tuesday, 8 September 2026 at 10:00", message: "Olá Ana,\nI’m unwell this week, sorry!", note: "€25 was refunded automatically — nothing to sort out." })],
  ["teacher-cancelled", "weekly", [23], t.lessonCancelledTeacher({ student: { name: "Ana Silva", email: "ana.silva@example.com", nif: "" },
    run: { count: "3 lessons", dates: "Thursday 10 September 2026 at 17:30\nThursday 17 September 2026 at 17:30\nThursday 24 September 2026 at 17:30" } })],

  ...[["lesson", 24, "€25"], ["no-show", 25, "€5"], ["fee", 27, "€5"]].map(([item, old, amount]) => ["payment-receipt", item === "fee" ? "late-change-fee" : item, [old],
    t.paymentReceipt({ ...ana, ...lesson, item, amount, shortWhen: "Tue 13 Oct, 17:00", nif: "123456789", noticeHours: 14 })]),
  ...[["lesson", 26, "€25"], ["fee", 28, "€5"]].map(([item, old, amount]) => ["teacher-payment-received", item === "fee" ? "same-day-fee" : item, [old],
    t.paymentReceivedTeacher({ studentName: "Ana Silva", item, amount, lessonName: "60-minute lesson", longWhen: "Tuesday, 13 October 2026 at 17:00",
      shortWhen: "Tue 13 Oct, 17:00", reference: "PT-D8PUSL", nif: "123456789", noticeHours: 14 })]),
  ...[["lesson", 29, "€25"], ["fee", 30, "€5"]].map(([item, old, amount]) => ["payment-failed", item === "fee" ? "late-change-fee" : item, [old],
    t.paymentFailed({ ...ana, ...lesson, item, amount, shortWhen: "Sat 5 Sept, 16:00", payUrl: manageUrl })]),

  ["welcome", "add-card", [32], t.welcome({ ...ana, welcome: welcomeLink, book: false, card: true, free: false, rows: welcomeRows })],
  ["welcome", "book-next", [33], t.welcome({ ...ana, welcome: { ...welcomeLink, card: false }, book: true, card: false, free: false, rows: welcomeRows.slice(0, 2) })],
  ["welcome", "lessons", [34], t.welcome({ ...ana, welcome: { ...welcomeLink, card: false }, book: false, card: false, free: true,
    rows: [{ label: "Your price · 60 minutes", value: "Free" }, { label: "Lesson · Online", value: "Tuesday 20 October 2026, 15:00 · Porto time\n60 minutes · Free" }] })],

  ["sign-in-link", "default", [36], t.signInLink({ ...ana, url: `${site}/book/?signin=sample` })],
  ["password-reset", "default", [37], t.passwordReset({ ...ana, url: `${site}/reset-password/?token=sample` })],
  ["email-change-confirm", "default", [38], t.emailChangeConfirm({ ...ana, email: "ana.new@example.com", url: `${lessonsUrl}&emailToken=sample` })],
  ["email-change-notice", "default", [39], t.emailChangeNotice({ ...ana, email: "ana.new@example.com" })],
  ["homework-submitted", "default", [40], t.homeworkSubmitted({ name: "Ana Silva", title: "Past tense: a weekend in Porto",
    when: "Monday, 7 September 2026 at 12:00, Porto time", url: `${site}/schedule/?homework=sample` })]
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const manifest = previews.map(([template, variant, coversOld, { subject, content }], index) => {
  const file = `${String(index + 1).padStart(2, "0")}-${template}--${variant}.html`;
  const { html, text } = renderEmail(content);
  writeFileSync(path.join(outDir, file), html);
  writeFileSync(path.join(outDir, file.replace(/\.html$/, ".txt")), `Subject: ${subject}\n\n${text}\n`);
  return { file, template, variant, subject, coversOld };
});
writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const covered = new Set(manifest.flatMap((entry) => entry.coversOld));
const missing = Array.from({ length: 40 }, (_, i) => i + 1).filter((n) => !covered.has(n) && n !== 31 && n !== 35);
if (missing.length) throw new Error(`Old emails with no preview: ${missing.join(", ")}`);
console.log(`Wrote ${manifest.length} previews of ${new Set(manifest.map((entry) => entry.template)).size} templates to ${outDir}`);
