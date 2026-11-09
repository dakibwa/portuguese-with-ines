"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown, Repeat } from "lucide-react";
import { TeacherHomework } from "@/components/homework/TeacherHomework";
import { PaidTick } from "@/components/teacher/PaidTick";
import { addedByTeacher, paidByHand, setLessonPaid, type AdminBooking, type NoteHomework, type StudentNoteLesson } from "@/lib/admin-api";
import { formatBookedLessonLabel, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

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

const place = (booking: AdminBooking) => booking.location === "porto" ? "In Porto" : "Online";
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
 * day and time open the lesson, as on her week, and what she does with it
 * sits at the row's end: the Already paid tick, its notes and homework, a
 * refund to record. Those to come first, each weekly run as one row; then the
 * past and cancelled, newest first, with her notes beneath (Dan: "a homework
 * page for each student … it can build up over time").
 */
export function StudentLessons({ bookings, notes, level, error, now, token, busy, action, openNotes, onOpenNotes, onCloseNotes, onBusy, onRetry, onOpenLesson, onRecordRefund, onPaid }: {
  token: string;
  /** Add a lesson, at the end of the first heading's row. */
  action?: ReactNode;
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
  const openIndex = openNotes ? past.findIndex(booking => booking.id === openNotes) : -1;
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
    const settle = settles(booking, now);
    const note = noteFor.get(booking.id);
    const written = Boolean(note && (note.notes.trim() || note.homework !== "none"));
    const opened = Boolean(note) && openNotes === booking.id;
    const state = note ? homeworkState[note.homework] : "";
    const refund = cancelled && paidByHand(booking) && booking.payment_status !== "refunded";
    const label = day(booking);
    const facts = factList(lessonFacts(booking, now), inherited);
    const notesButton = note ? <button className="teacher-history-homework" type="button" aria-expanded={opened} data-homework-exit disabled={busy}
      onClick={() => opened ? onCloseNotes() : onOpenNotes(booking.id)}>
      {opened ? <>Close<span className="visually-hidden"> homework</span></> : written ? <>Notes<span className="visually-hidden">, {label}</span></> : <>Add notes<span className="visually-hidden"> · {label}</span></>}
    </button> : null;
    // Two lines at most, each with what it does at its end: the day and
    // time with the Already paid tick; its facts with its notes.
    return (
      <li className={`teacher-history-lesson teacher-lesson-row${cancelled || noShow ? " is-cancelled" : ""}${opened ? " is-open" : ""}`} key={booking.id}>
        <div className="teacher-lesson-row__line">
          <div className="teacher-lesson-row__what">
            {/* "Tue 5 Jan" reads the same with a year or without. The time
                shares its line on a wide row and has its own, without the
                dot, on a narrow one, so "· 18:00" never starts a line. */}
            <button className="teacher-lesson-row__when" data-homework-exit disabled={busy} onClick={() => onOpenLesson(booking)} type="button">
              <strong>{label}</strong>
              {" "}<span className="teacher-history-lesson__time"><i aria-hidden="true">· </i><span className="visually-hidden">, </span>{formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}</span>
              <span className="visually-hidden">, open lesson</span>
            </button>
            {pill ? <span className={`teacher-history-status${live ? "" : " is-muted"}`}>{pill}</span> : null}
            {note?.level && note.level !== level ? <span className="teacher-notes__level">{note.level}</span> : null}
          </div>
          {settle ? <PaidTick checked={paidByHand(booking)} disabled={Boolean(paying) || busy} onChange={paid => void markPaid(booking, paid)} />
            : refund ? <button className="button button--outline button--small" disabled={busy} onClick={() => onRecordRefund(booking)} type="button">Record refund</button> : null}
        </div>
        {facts || notesButton ? <div className="teacher-lesson-row__line">
          {facts ?? <span />}
          {notesButton ? <div className="teacher-lesson-row__side">
            {note && state ? <span className={`teacher-notes__state is-${note.homework}`}>{state}</span> : null}
            {notesButton}
          </div> : null}
        </div> : null}
        {paidError?.id === booking.id ? <p className="teacher-inline-error" role="alert">{paidError.message}</p> : null}
        {note?.notes.trim() && !opened ? <p className="teacher-notes__text">{note.notes.trim()}</p> : null}
        {booking.cancellation_message ? <p className="teacher-history-lesson__note"><span>Your message</span>{booking.cancellation_message}</p> : null}
        {booking.notes ? <p className="teacher-history-lesson__note"><span>Their note</span>{booking.notes}</p> : null}
        {opened ? <TeacherHomework key={`${booking.id}-${token}`} bookingId={booking.id} token={token} onBusy={onBusy} /> : null}
      </li>
    );
  }

  /**
   * A weekly run as one row, in the dashed tile the payment card gives a
   * run: the usual day and time, how many weeks and until when, the facts its
   * weeks share, and Show weeks at its end (9 November 2026, Dan: it "could
   * be reworked to save space"). Opening it lists each week as its own row.
   */
  function runRow(run: WeeklyRun) {
    const open = openRuns.includes(run.id);
    const slot = (booking: AdminBooking) => `${dateLabel(dateKey(new Date(booking.starts_at)), { weekday: "long" })} ${formatSlotTime(booking.starts_at)}–${formatSlotTime(booking.ends_at)} ${booking.location}`;
    // Its usual week is the slot most of its weeks keep; a week moved off it
    // is counted, and shows as itself once the run is open.
    const tally = new Map<string, number>();
    for (const lesson of run.lessons) tally.set(slot(lesson), (tally.get(slot(lesson)) ?? 0) + 1);
    const usual = [...tally].sort((a, b) => b[1] - a[1])[0][0];
    const pattern = run.lessons.find(lesson => slot(lesson) === usual)!;
    const moved = run.lessons.length - (tally.get(usual) ?? 0);
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
          <button type="button" className="teacher-history-homework teacher-history-run__toggle" aria-expanded={open} aria-controls={open ? weeksId : undefined}
            onClick={() => setOpenRuns(current => open ? current.filter(id => id !== run.id) : [...current, run.id])}>
            <ChevronDown size={15} aria-hidden="true" />{open ? "Hide weeks" : "Show weeks"}
          </button>
        </div>
        <div className="teacher-lesson-row__facts">
          <span className="teacher-history-run__span">{run.lessons.length} weeks, <span>{day(first)} to {day(last)}</span></span>
          {factList(facts)}
        </div>
        {open ? <ul className="teacher-history-list teacher-history-run__weeks" id={weeksId}>{run.lessons.map(lesson => <Fragment key={lesson.id}>{lessonRow(lesson, facts)}</Fragment>)}</ul> : null}
      </li>
    );
  }

  const head = (id: string, title: ReactNode, first: boolean) => <div className="teacher-history__head">
    <h3 className="teacher-history__legend" id={id}>{title}</h3>
    {first ? action : null}
  </div>;
  // Add a lesson stays at hand while their lessons load, or if they couldn't.
  if (error) {
    return <>
      {action ? <div className="teacher-history__head"><span />{action}</div> : null}
      <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" onClick={onRetry} type="button">Try again</button></div>
    </>;
  }
  if (bookings === null) return <div className="teacher-history__head"><p role="status">Loading lesson history…</p>{action}</div>;
  if (bookings.length === 0) return <div className="teacher-history__head"><p className="teacher-history-empty">No lessons recorded yet.</p>{action}</div>;
  const hidden = past.length - shownPast.length;
  return (
    <>
      {upcoming.length ? <section aria-labelledby="teacher-history-upcoming">
        {head("teacher-history-upcoming", <>Upcoming <span>· {upcoming.length}</span></>, true)}
        <ul className="teacher-history-list">{entries.map(entry => "run" in entry ? runRow(entry.run) : lessonRow(entry.booking))}</ul>
      </section> : null}
      {past.length ? <section aria-labelledby="teacher-history-past">
        {head("teacher-history-past", <>Past &amp; cancelled <span>· {past.length}</span></>, !upcoming.length)}
        <ul className="teacher-history-list">{shownPast.map(booking => lessonRow(booking))}</ul>
        {hidden ? <button className="teacher-history-homework teacher-history-earlier" type="button" onClick={() => setShowEarlier(true)}>
          <ChevronDown size={15} aria-hidden="true" />{hidden} earlier {hidden === 1 ? "lesson" : "lessons"}
        </button> : null}
      </section> : null}
    </>
  );
}
