"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown, Pencil, Repeat, X } from "lucide-react";
import { TeacherHomework } from "@/components/homework/TeacherHomework";
import { PaidTick } from "@/components/teacher/PaidTick";
import { addedByTeacher, paidByHand, setLessonPaid, type AdminBooking, type NoteHomework, type StudentNoteLesson } from "@/lib/admin-api";
import { formatBookedLessonLabel, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { IN_PERSON } from "@/lib/tutor";

function paymentLabel(booking: AdminBooking) {
  if (booking.payment_status === "refunded") return "Refunded";
  if (paidByHand(booking)) return "Paid by hand";
  switch (booking.payment_status) {
    case "paid": return "Paid";
    case "payment_due": return "Payment due";
    case "processing": return "Payment processing";
    case "scheduled": return "Payment scheduled";
    case "pending": return "Payment pending";
    case "recorded": return "Recorded";
    case "free": return "Free";
    case "not_required": return addedByTeacher(booking) && booking.status !== "cancelled" ? "Payment arranged directly" : "No lesson charge";
    default: return "";
  }
}

/** Lessons still to come, soonest first. */
export function upcomingLessons(bookings: AdminBooking[], now: number) {
  return bookings.filter(booking => booking.status === "confirmed" && Date.parse(booking.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** A weekly run's weeks still to come, soonest first. */
type WeeklyRun = { id: string; lessons: AdminBooking[] };

/**
 * Upcoming lessons with each weekly run's weeks gathered into one entry, at
 * its first week (9 November 2026, Dan: "just have them all as one card and
 * you can expand out"). A run with a single week left, and a lesson on now,
 * stay lessons of their own.
 */
type UpcomingEntry = { booking: AdminBooking } | { run: WeeklyRun };

export function upcomingEntries(upcoming: AdminBooking[], now: number): UpcomingEntry[] {
  const inRun = (booking: AdminBooking) => booking.series_id && Date.parse(booking.starts_at) > now ? booking.series_id : "";
  const runs = new Map<string, AdminBooking[]>();
  for (const booking of upcoming) {
    const id = inRun(booking);
    if (id) runs.set(id, [...(runs.get(id) ?? []), booking]);
  }
  const placed = new Set<string>();
  return upcoming.flatMap((booking): UpcomingEntry[] => {
    const id = inRun(booking);
    const lessons = id ? runs.get(id) ?? [] : [];
    if (lessons.length < 2) return [{ booking }];
    if (placed.has(id)) return [];
    placed.add(id);
    return [{ run: { id, lessons } }];
  });
}

/**
 * A weekly run's usual week: the slot most of its weeks keep, and how many
 * weeks sit at another time (which show as themselves once the run is open).
 */
export function usualWeek(lessons: AdminBooking[]) {
  const slot = (booking: AdminBooking) => `${dateLabel(dateKey(new Date(booking.starts_at)), { weekday: "long" })} ${formatSlotTime(booking.starts_at)}–${formatSlotTime(booking.ends_at)} ${booking.location}`;
  const tally = new Map<string, number>();
  for (const lesson of lessons) tally.set(slot(lesson), (tally.get(slot(lesson)) ?? 0) + 1);
  const usual = [...tally].sort((a, b) => b[1] - a[1])[0][0];
  return { pattern: lessons.find(lesson => slot(lesson) === usual)!, moved: lessons.length - (tally.get(usual) ?? 0) };
}

const place = (booking: AdminBooking) => booking.location === "porto" ? IN_PERSON : "Online";
const lessonLength = (booking: AdminBooking) => formatBookedLessonLabel({ id: booking.lesson_type_id ?? "", name: booking.lesson_name, durationMinutes: Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000) });

/*
 * A lesson she added that has been and is still open: paid in cash, she
 * ticks it here, so what they still owe reads true (2 November 2026,
 * Dan: everyone pays what is open). Ticked, it can be unticked again.
 */
function settles(booking: AdminBooking, now: number) {
  return booking.status !== "cancelled" && Date.parse(booking.starts_at) <= now && addedByTeacher(booking) &&
    booking.attendance_status === "expected" && (paidByHand(booking) || (booking.payment_status === "not_required" && !booking.charge_started_at));
}

/** A lesson's quiet facts: where, how long, payment, who added it, moves. */
function lessonFacts(booking: AdminBooking, now: number) {
  const cancelled = booking.status === "cancelled";
  const changeFee = booking.same_day_fee_status === "paid" ? "Change fee paid"
    : booking.same_day_fee_status === "payment_due" ? "Change fee due"
      : booking.same_day_fee_status === "scheduled" ? "Change fee scheduled"
        : booking.same_day_fee_status === "processing" ? "Change fee processing" : "";
  // A cancelled lesson's money only matters if some moved.
  // Where the tick shows, it says how it was paid.
  const payment = settles(booking, now) || (cancelled && !paidByHand(booking) && !["paid", "refunded"].includes(booking.payment_status)) ? "" : paymentLabel(booking);
  return [
    place(booking),
    lessonLength(booking),
    payment,
    addedByTeacher(booking) ? "Added by you" : "",
    booking.reschedule_count > 0 ? `Moved ${booking.reschedule_count === 1 ? "once" : `${booking.reschedule_count} times`}` : "",
    changeFee,
  ].filter(Boolean);
}

/*
 * What every one of their lessons shares, such as `In Porto · Added by you`,
 * is said once beside their details, and each lesson keeps only what is its
 * own (9 November 2026, Dan: "we don't need all the information repeating").
 * With a single lesson, its row says it all.
 */
export function sharedFacts(bookings: AdminBooking[], now: number) {
  if (bookings.length < 2) return [];
  const lists = bookings.map(booking => lessonFacts(booking, now));
  return lists[0].filter(fact => lists.every(facts => facts.includes(fact)));
}

const homeworkState: Record<NoteHomework, string> = { none: "", draft: "Draft", published: "With them", review: "To review", done: "Done" };
/** Past lessons shown before the rest fold away. */
const PAST_SHOWN = 8;

/**
 * A student's lessons on their profile, each one row (9 November 2026, Dan:
 * "the already paid could be at the side of it to save lots of space"): its
 * day and time open the lesson in place, its details spanning the row of
 * lessons until she closes them, and what she does with it
 * sits at the row's end: the Already paid tick, its notes and homework, a
 * refund to record. Those to come first, each weekly run as one row; then the
 * past and cancelled, newest first, with her notes beneath (Dan: "a homework
 * page for each student … it can build up over time").
 */
export function StudentLessons({ bookings, notes, level, error, now, token, busy, selectedId, details, openNotes, onOpenNotes, onCloseNotes, onBusy, onRetry, onOpenLesson, onCloseLesson, onRecordRefund, onPaid }: {
  token: string;
  /** The lesson whose details are open in place, and those details. */
  selectedId: string | null;
  details: ReactNode;
  /** Null until they have been read. */
  bookings: AdminBooking[] | null;
  /** Her notes and their homework per lesson had; null while they load or if they couldn't. */
  notes: StudentNoteLesson[] | null;
  /** Their level now, so a lesson shows its own only where it differs. */
  level: string | null;
  error: string;
  now: number;
  busy: boolean;
  /** The lesson whose notes and homework are open. */
  openNotes: string | null;
  onOpenNotes: (bookingId: string) => void;
  onCloseNotes: () => void;
  onBusy: (busy: boolean) => void;
  onRetry: () => void;
  onOpenLesson: (booking: AdminBooking) => void;
  onCloseLesson: () => void;
  onRecordRefund: (booking: AdminBooking) => void;
  /** A past lesson ticked or unticked Already paid. */
  onPaid?: (booking: AdminBooking) => void;
}) {
  const [paying, setPaying] = useState("");
  const [paidError, setPaidError] = useState<{ id: string; message: string } | null>(null);
  const [openRuns, setOpenRuns] = useState<string[]>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  const listed = bookings ?? [];
  const upcoming = upcomingLessons(listed, now);
  const entries = upcomingEntries(upcoming, now);
  const past = listed.filter(booking => booking.status === "cancelled" || Date.parse(booking.ends_at) <= now)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const shared = sharedFacts(listed, now);
  const noteFor = new Map((notes ?? []).map(note => [note.bookingId, note]));
  // An open lesson stays in view even when it is one of the earlier ones.
  const openIndex = Math.max(
    openNotes ? past.findIndex(booking => booking.id === openNotes) : -1,
    selectedId ? past.findIndex(booking => booking.id === selectedId) : -1,
  );
  const shownPast = showEarlier || openIndex >= PAST_SHOWN ? past : past.slice(0, PAST_SHOWN);
  // Within half a year either way the year is plain from the month; further
  // off, say it.
  const nearby = (date: Date) => Math.abs(date.getTime() - now) < 183 * 86_400_000;
  const day = (booking: AdminBooking) => {
    const starts = new Date(booking.starts_at);
    return dateLabel(dateKey(starts), { weekday: "short", day: "numeric", month: "short", ...(nearby(starts) ? {} : { year: "numeric" }) }).replace(",", "");
  };
  // A week of an open run says only what its run does not.
  const factList = (facts: string[], inherited: string[] = []) => {
    const own = facts.filter(fact => !shared.includes(fact) && !inherited.includes(fact));
    return own.length ? <ul className="booking-payment-facts teacher-history-lesson__facts">{own.map(fact => <li key={fact}>{fact}</li>)}</ul> : null;
  };

  async function markPaid(booking: AdminBooking, paid: boolean) {
    setPaying(booking.id);
    setPaidError(null);
    try {
      const { booking: updated } = await setLessonPaid(token, booking.id, paid);
      onPaid?.(updated);
    } catch (caught) {
      setPaidError({ id: booking.id, message: caught instanceof Error ? caught.message : "This lesson couldn’t be updated." });
    } finally {
      setPaying("");
    }
  }

  function lessonRow(booking: AdminBooking, inherited: string[] = []) {
    const cancelled = booking.status === "cancelled";
    const noShow = booking.attendance_status === "no_show";
    const live = !cancelled && Date.parse(booking.starts_at) <= now && Date.parse(booking.ends_at) > now;
    const pill = cancelled
      ? booking.cancelled_by === "teacher" ? "Cancelled by you" : booking.cancelled_by === "student" ? "Cancelled by student" : "Cancelled"
      : noShow ? "No-show" : live ? "Happening now" : "";
    // Open, its details carry Already paid and the refund themselves.
    const settle = settles(booking, now) && selectedId !== booking.id;
    const note = noteFor.get(booking.id);
    const written = Boolean(note && (note.notes.trim() || note.homework !== "none"));
    const opened = Boolean(note) && openNotes === booking.id;
    const selected = selectedId === booking.id;
    const detailsId = `teacher-lesson-details-${booking.id}`;
    const state = note ? homeworkState[note.homework] : "";
    const refund = cancelled && paidByHand(booking) && booking.payment_status !== "refunded" && selectedId !== booking.id;
    const label = day(booking);
    const facts = factList(lessonFacts(booking, now), inherited);
    // Notes are a small pencil (9 November 2026, Dan), named as the button
    // it replaced was: Add notes, Notes, or Close while its homework is open.
    const notesLabel = opened ? "Close homework" : written ? `Notes, ${label}` : `Add notes · ${label}`;
    // Open in place, the date row is the disclosure and its details carry
    // Homework, so the pencil would only repeat it.
    const notesButton = note && (!selected || opened) ? <button className="teacher-pencil" type="button" aria-expanded={opened} aria-label={notesLabel} data-homework-exit disabled={busy}
      title={opened ? "Close" : written ? "Notes" : "Add notes"} onClick={() => opened ? onCloseNotes() : onOpenNotes(booking.id)}>
      {opened ? <X size={14} aria-hidden="true" /> : <Pencil size={13} strokeWidth={2.4} aria-hidden="true" />}
    </button> : null;
    // One line of what she does and one of facts: the day and time, then at
    // its end the homework chip, notes pencil and the compact Already paid
    // tick, which wrap together beneath on a narrow tile. The day and time
    // button stretches over the whole tile; those controls sit above it.
    return (
      <li className={`teacher-history-lesson teacher-lesson-row${cancelled || noShow ? " is-cancelled" : ""}${opened ? " is-open" : ""}${selected ? " is-selected" : ""}`} key={booking.id}>
        <div className="teacher-lesson-row__line">
          <div className="teacher-lesson-row__what">
            {/* "Tue 5 Jan" reads the same with a year or without. The time
                shares its line on a wide row and has its own, without the
                dot, on a narrow one, so "· 18:00" never starts a line. */}
            <button className="teacher-lesson-row__when" aria-controls={selected ? detailsId : undefined} aria-expanded={selected} data-homework-exit disabled={busy} onClick={() => selected ? onCloseLesson() : onOpenLesson(booking)} type="button">
              <strong>{label}</strong>
              {" "}<span className="teacher-history-lesson__time"><i aria-hidden="true">· </i><span className="visually-hidden">, </span>{formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}</span>
              <span className="visually-hidden">, open lesson</span>
            </button>
            {pill ? <span className={`teacher-history-status${live ? "" : " is-muted"}`}>{pill}</span> : null}
            {note?.level && note.level !== level ? <span className="teacher-notes__level">{note.level}</span> : null}
          </div>
          {notesButton || settle || refund ? <div className="teacher-lesson-row__side">
            {note && state ? <span className={`teacher-notes__state is-${note.homework}`}>{state}</span> : null}
            {notesButton}
            {settle ? <PaidTick plain checked={paidByHand(booking)} disabled={Boolean(paying) || busy} onChange={paid => void markPaid(booking, paid)} />
              : refund ? <button className="teacher-quiet" data-homework-exit disabled={busy} onClick={() => onRecordRefund(booking)} type="button">Record refund</button> : null}
          </div> : null}
        </div>
        {facts}
        {paidError?.id === booking.id ? <p className="teacher-inline-error" role="alert">{paidError.message}</p> : null}
        {note?.notes.trim() && !opened ? <p className="teacher-notes__text">{note.notes.trim()}</p> : null}
        {booking.cancellation_message ? <p className="teacher-history-lesson__note"><span>Your message</span>{booking.cancellation_message}</p> : null}
        {booking.notes ? <p className="teacher-history-lesson__note"><span>Their note</span>{booking.notes}</p> : null}
        {opened ? <TeacherHomework key={`${booking.id}-${token}`} bookingId={booking.id} token={token} onBusy={onBusy} /> : null}
        {selected && details ? <div className="teacher-lesson-row__details" id={detailsId}>{details}</div> : null}
      </li>
    );
  }

  /**
   * A weekly run as one row: the usual day and time, how many weeks and until
   * when, the facts its weeks share, and Show weeks at its end (9 November
   * 2026, Dan: it "could be reworked to save space"). Opening it lists each
   * week beneath as a row of the same flat kind.
   */
  function runRow(run: WeeklyRun) {
    const open = openRuns.includes(run.id);
    const { pattern, moved } = usualWeek(run.lessons);
    const first = run.lessons[0];
    const last = run.lessons[run.lessons.length - 1];
    const payments = new Set(run.lessons.map(paymentLabel));
    const facts = [
      place(pattern),
      lessonLength(pattern),
      payments.size === 1 ? [...payments][0] : "",
      run.lessons.every(addedByTeacher) ? "Added by you" : "",
      moved ? `${moved === 1 ? "One week" : `${moved} weeks`} at another time` : "",
    ].filter(Boolean);
    const weeksId = `teacher-history-run-${run.id}`;
    return (
      <li className={`teacher-history-lesson teacher-history-run teacher-lesson-row${open ? " is-open" : ""}`} key={`run-${run.id}`}>
        <div className="teacher-lesson-row__line">
          <strong className="teacher-history-run__when">
            <Repeat className="teacher-history-run__mark" size={14} strokeWidth={2.4} aria-hidden="true" />
            Every {dateLabel(dateKey(new Date(pattern.starts_at)), { weekday: "long" })}
            {" "}<span className="teacher-history-lesson__time"><i aria-hidden="true">· </i><span className="visually-hidden">, </span>{formatSlotTime(pattern.starts_at)}–{formatSlotTime(pattern.ends_at)}</span>
          </strong>
          <span className="teacher-history-run__span">{run.lessons.length} weeks, <span>{day(first)} to {day(last)}</span></span>
          {factList(facts)}
          <button type="button" className="teacher-quiet teacher-history-run__toggle" data-homework-exit aria-expanded={open} aria-controls={open ? weeksId : undefined}
            onClick={() => {
              // Hiding its weeks hides the week whose details are open in one.
              if (open && run.lessons.some(lesson => lesson.id === selectedId)) onCloseLesson();
              setOpenRuns(current => open ? current.filter(id => id !== run.id) : [...current, run.id]);
            }}>
            <ChevronDown size={15} aria-hidden="true" />{open ? "Hide weeks" : "Show weeks"}
          </button>
        </div>
        {open ? <ul className="teacher-history-list teacher-history-run__weeks" id={weeksId}>{run.lessons.map(lesson => <Fragment key={lesson.id}>{lessonRow(lesson, facts)}</Fragment>)}</ul> : null}
      </li>
    );
  }

  // Add a lesson is in their card's top row, so a heading stands alone here.
  const head = (id: string, title: ReactNode) => <div className="teacher-history__head">
    <h3 className="teacher-history__legend" id={id}>{title}</h3>
  </div>;
  if (error) {
    return <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="teacher-quiet" onClick={onRetry} type="button">Try again</button></div>;
  }
  if (bookings === null) return <p role="status">Loading lesson history…</p>;
  if (bookings.length === 0) return <p className="teacher-history-empty">No lessons recorded yet.</p>;
  const hidden = past.length - shownPast.length;
  return (
    <>
      {upcoming.length ? <section aria-labelledby="teacher-history-upcoming">
        {head("teacher-history-upcoming", <>Upcoming <span>· {upcoming.length}</span></>)}
        <ul className="teacher-history-list">{entries.map(entry => "run" in entry ? runRow(entry.run) : lessonRow(entry.booking))}</ul>
      </section> : null}
      {past.length ? <section aria-labelledby="teacher-history-past">
        {head("teacher-history-past", <>Past &amp; cancelled <span>· {past.length}</span></>)}
        <ul className="teacher-history-list">{shownPast.map(booking => lessonRow(booking))}</ul>
        {hidden ? <button className="teacher-quiet teacher-history-earlier" type="button" onClick={() => setShowEarlier(true)}>
          <ChevronDown size={15} aria-hidden="true" />{hidden} earlier {hidden === 1 ? "lesson" : "lessons"}
        </button> : null}
      </section> : null}
    </>
  );
}
