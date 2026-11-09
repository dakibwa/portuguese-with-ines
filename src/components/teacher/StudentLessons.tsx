"use client";

import { addedByTeacher, paidByHand, setLessonPaid, type AdminBooking } from "@/lib/admin-api";
import { PaidTick } from "@/components/teacher/PaidTick";
import { formatBookedLessonLabel, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { Fragment, useState } from "react";
import { ChevronDown, Repeat } from "lucide-react";

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
 * A student's lessons beneath their profile: the ones to come, then the past
 * and cancelled, reading the records from the start of time rather than the
 * visible week.
 */
export function StudentLessons({ bookings, error, now, onRetry, token, onRecordRefund, onPaid }: {
  token: string;
  /** Null until they have been read. */
  bookings: AdminBooking[] | null;
  error: string;
  now: number;
  onRetry: () => void;
  onRecordRefund: (booking: AdminBooking) => void;
  /** A past lesson ticked or unticked Already paid. */
  onPaid?: (booking: AdminBooking) => void;
}) {
  const [paying, setPaying] = useState("");
  const [paidError, setPaidError] = useState<{ id: string; message: string } | null>(null);
  const [openRuns, setOpenRuns] = useState<string[]>([]);
  const upcoming = upcomingLessons(bookings ?? [], now);
  const entries = upcomingEntries(upcoming, now);
  const past = (bookings ?? []).filter(booking => booking.status === "cancelled" || Date.parse(booking.ends_at) <= now)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  // Within half a year either way the year is plain from the month; further
  // off, say it.
  const nearby = (date: Date) => Math.abs(date.getTime() - now) < 183 * 86_400_000;
  const place = (booking: AdminBooking) => booking.location === "porto" ? "In Porto" : "Online";
  const lessonLength = (booking: AdminBooking) => formatBookedLessonLabel({ id: booking.lesson_type_id ?? "", name: booking.lesson_name, durationMinutes: Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000) });
  /*
   * A lesson she added that has been and is still open: paid in cash, she
   * ticks it here, so what they still owe reads true (2 November 2026,
   * Dan: everyone pays what is open). Ticked, it can be unticked again.
   */
  const settles = (booking: AdminBooking) => booking.status !== "cancelled" && Date.parse(booking.starts_at) <= now && addedByTeacher(booking) &&
    booking.attendance_status === "expected" && (paidByHand(booking) || (booking.payment_status === "not_required" && !booking.charge_started_at));

  /** A lesson's quiet facts: where, how long, payment, who added it, moves. */
  function lessonFacts(booking: AdminBooking) {
    const cancelled = booking.status === "cancelled";
    const changeFee = booking.same_day_fee_status === "paid" ? "Change fee paid"
      : booking.same_day_fee_status === "payment_due" ? "Change fee due"
        : booking.same_day_fee_status === "scheduled" ? "Change fee scheduled"
          : booking.same_day_fee_status === "processing" ? "Change fee processing" : "";
    // A cancelled lesson's money only matters if some moved.
    // Where the tick shows, it says how it was paid.
    const payment = settles(booking) || (cancelled && !paidByHand(booking) && !["paid", "refunded"].includes(booking.payment_status)) ? "" : paymentLabel(booking);
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
   * What every one of their lessons shares, such as `In Porto · 60 mins ·
   * Added by you`, is said once above them, and each card keeps only what is
   * its own (9 November 2026, Dan: "we don't need all the information
   * repeating").
   */
  const listed = bookings ?? [];
  const factLists = listed.map(lessonFacts);
  const shared = listed.length > 1 ? factLists[0].filter(fact => factLists.every(facts => facts.includes(fact))) : [];
  const factList = (facts: string[]) => {
    const own = facts.filter(fact => !shared.includes(fact));
    return own.length ? <ul className="booking-payment-facts teacher-history-lesson__facts">{own.map(fact => <li key={fact}>{fact}</li>)}</ul> : null;
  };

  /**
   * One card per lesson: when, then a few quiet facts. A pill only for what
   * breaks the pattern (cancelled, no-show, happening now), since the section
   * already says upcoming or past.
   */
  function lessonRow(booking: AdminBooking, id?: string) {
    const cancelled = booking.status === "cancelled";
    const noShow = booking.attendance_status === "no_show";
    const starts = new Date(booking.starts_at);
    const live = !cancelled && Date.parse(booking.starts_at) <= now && Date.parse(booking.ends_at) > now;
    const pill = cancelled
      ? booking.cancelled_by === "teacher" ? "Cancelled by you" : booking.cancelled_by === "student" ? "Cancelled by student" : "Cancelled"
      : noShow ? "No-show" : live ? "Happening now" : "";
    const settle = settles(booking);
    return (
      <li className={`teacher-history-lesson${cancelled || noShow ? " is-cancelled" : ""}`} id={id} key={booking.id}>
        <div className="teacher-history-lesson__top">
          <div className="teacher-history-lesson__when">
            <strong>
              {/* "Tue 5 Jan" reads the same with a year or without. The time
                  shares its line on a wide card and has its own, without the
                  dot, on a narrow one, so "· 18:00" never starts a line. */}
              {dateLabel(dateKey(starts), { weekday: "short", day: "numeric", month: "short", ...(nearby(starts) ? {} : { year: "numeric" }) }).replace(",", "")}
              {" "}<span className="teacher-history-lesson__time"><i aria-hidden="true">· </i><span className="visually-hidden">, </span>{formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}</span>
            </strong>
            {pill ? <span className={`teacher-history-status${live ? "" : " is-muted"}`}>{pill}</span> : null}
          </div>
        </div>
        {factList(lessonFacts(booking))}
        {settle ? <div className="teacher-history-lesson__paid">
          <PaidTick checked={paidByHand(booking)} disabled={Boolean(paying)} onChange={async (paid) => {
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
          }} />
          {paidError?.id === booking.id ? <p className="teacher-inline-error" role="alert">{paidError.message}</p> : null}
        </div> : null}
        {booking.cancellation_message ? <p className="teacher-history-lesson__note"><span>Your message</span>{booking.cancellation_message}</p> : null}
        {booking.notes ? <p className="teacher-history-lesson__note"><span>Their note</span>{booking.notes}</p> : null}
        {cancelled && paidByHand(booking) && booking.payment_status !== "refunded" ? <button className="button button--outline button--small" type="button" onClick={() => onRecordRefund(booking)}>Record refund</button> : null}
      </li>
    );
  }

  /**
   * A weekly run as one card, in the dashed tile the payment card gives a
   * run: the usual day and time, how many weeks and until when, and the
   * facts its weeks share. Opening it lists each week as its own card.
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
    const day = (booking: AdminBooking) => {
      const starts = new Date(booking.starts_at);
      return dateLabel(dateKey(starts), { weekday: "short", day: "numeric", month: "short", ...(nearby(starts) ? {} : { year: "numeric" }) }).replace(",", "");
    };
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
      <Fragment key={`run-${run.id}`}>
        <li className={`teacher-history-lesson teacher-history-run${open ? " is-open" : ""}`}>
          <div className="teacher-history-lesson__top">
            <div className="teacher-history-lesson__when">
              <strong>
                <Repeat className="teacher-history-run__mark" size={14} strokeWidth={2.4} aria-hidden="true" />
                Every {dateLabel(dateKey(new Date(pattern.starts_at)), { weekday: "long" })}
                {" "}<span className="teacher-history-lesson__time"><i aria-hidden="true">· </i><span className="visually-hidden">, </span>{formatSlotTime(pattern.starts_at)}–{formatSlotTime(pattern.ends_at)}</span>
              </strong>
            </div>
            <button type="button" className="teacher-history-homework teacher-history-run__toggle" aria-expanded={open} aria-controls={open ? weeksId : undefined}
              onClick={() => setOpenRuns(current => open ? current.filter(id => id !== run.id) : [...current, run.id])}>
              <ChevronDown size={15} aria-hidden="true" />{open ? "Hide weeks" : "Show weeks"}
            </button>
          </div>
          <p className="teacher-history-run__span">{run.lessons.length} weeks, <span>{day(first)} to {day(last)}</span></p>
          {factList(facts)}
        </li>
        {open ? run.lessons.map(lesson => <Fragment key={lesson.id}>{lessonRow(lesson, lesson === first ? weeksId : undefined)}</Fragment>) : null}
      </Fragment>
    );
  }

  if (error) {
    return <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" onClick={onRetry} type="button">Try again</button></div>;
  }
  if (bookings === null) return <p role="status">Loading lesson history…</p>;
  if (bookings.length === 0) return <p className="teacher-history-empty">No lessons recorded yet.</p>;
  return (
    <>
      {shared.length ? <div className="teacher-history-shared">
        <span id="teacher-history-shared">Every lesson</span>
        <ul className="booking-payment-facts" aria-labelledby="teacher-history-shared">{shared.map(fact => <li key={fact}>{fact}</li>)}</ul>
      </div> : null}
      {upcoming.length ? <section aria-labelledby="teacher-history-upcoming"><h3 id="teacher-history-upcoming">Upcoming <span>· {upcoming.length}</span></h3><ul className="teacher-history-list">{entries.map(entry => "run" in entry ? runRow(entry.run) : lessonRow(entry.booking))}</ul></section> : null}
      {past.length ? <section aria-labelledby="teacher-history-past"><h3 id="teacher-history-past">Past &amp; cancelled <span>· {past.length}</span></h3><ul className="teacher-history-list">{past.map(booking => lessonRow(booking))}</ul></section> : null}
    </>
  );
}
