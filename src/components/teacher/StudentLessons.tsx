"use client";

import { addedByTeacher, paidByHand, setLessonPaid, type AdminBooking } from "@/lib/admin-api";
import { PaidTick } from "@/components/teacher/PaidTick";
import { formatBookedLessonLabel, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { TeacherHomework } from "@/components/homework/TeacherHomework";

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

/**
 * A student's lessons beneath their profile: the ones to come, then the past
 * and cancelled, reading the records from the start of time rather than the
 * visible week.
 */
export function StudentLessons({ bookings, error, now, onRetry, token, requestedHomeworkId, onRecordRefund, onPaid }: {
  token: string;
  requestedHomeworkId?: string;
  /** Null until they have been read. */
  bookings: AdminBooking[] | null;
  error: string;
  now: number;
  onRetry: () => void;
  onRecordRefund: (booking: AdminBooking) => void;
  /** A past lesson ticked or unticked Already paid. */
  onPaid?: (booking: AdminBooking) => void;
}) {
  const [homeworkId, setHomeworkId] = useState<string | null>(null);
  const [homeworkBusy, setHomeworkBusy] = useState(false);
  const [paying, setPaying] = useState("");
  const [paidError, setPaidError] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => { if (requestedHomeworkId) setHomeworkId(requestedHomeworkId); }, [requestedHomeworkId]);
  const upcoming = upcomingLessons(bookings ?? [], now);
  const past = (bookings ?? []).filter(booking => booking.status === "cancelled" || Date.parse(booking.ends_at) <= now)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  // Within half a year either way the year is plain from the month; further
  // off, say it.
  const nearby = (date: Date) => Math.abs(date.getTime() - now) < 183 * 86_400_000;

  /**
   * One card per lesson: when, then a few quiet facts. A pill only for what
   * breaks the pattern (cancelled, no-show, happening now), since the section
   * already says upcoming or past.
   */
  function lessonRow(booking: AdminBooking) {
    const cancelled = booking.status === "cancelled";
    const noShow = booking.attendance_status === "no_show";
    const starts = new Date(booking.starts_at);
    const live = !cancelled && Date.parse(booking.starts_at) <= now && Date.parse(booking.ends_at) > now;
    const pill = cancelled
      ? booking.cancelled_by === "teacher" ? "Cancelled by you" : booking.cancelled_by === "student" ? "Cancelled by student" : "Cancelled"
      : noShow ? "No-show" : live ? "Happening now" : "";
    const changeFee = booking.same_day_fee_status === "paid" ? "Change fee paid"
      : booking.same_day_fee_status === "payment_due" ? "Change fee due"
        : booking.same_day_fee_status === "scheduled" ? "Change fee scheduled"
          : booking.same_day_fee_status === "processing" ? "Change fee processing" : "";
    /*
     * A lesson she added that has been and is still open: paid in cash, she
     * ticks it here, so what they still owe reads true (2 November 2026,
     * Dan: everyone pays what is open). Ticked, it can be unticked again.
     */
    const settle = !cancelled && Date.parse(booking.starts_at) <= now && addedByTeacher(booking) && booking.attendance_status === "expected" &&
      (paidByHand(booking) || (booking.payment_status === "not_required" && !booking.charge_started_at));
    // A cancelled lesson's money only matters if some moved.
    // Where the tick shows, it says how it was paid.
    const payment = settle || (cancelled && !paidByHand(booking) && !["paid", "refunded"].includes(booking.payment_status)) ? "" : paymentLabel(booking);
    const facts = [
      formatBookedLessonLabel({ id: booking.lesson_type_id ?? "", name: booking.lesson_name, durationMinutes: Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000) }),
      payment,
      addedByTeacher(booking) ? "Added by you" : "",
      booking.reschedule_count > 0 ? `Moved ${booking.reschedule_count === 1 ? "once" : `${booking.reschedule_count} times`}` : "",
      changeFee,
    ].filter(Boolean);
    return (
      <li className={`teacher-history-lesson${cancelled || noShow ? " is-cancelled" : ""}`} key={booking.id}>
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
          {booking.student_id && !cancelled ? <button type="button" data-homework-exit className="teacher-history-homework" disabled={homeworkBusy}
            aria-expanded={homeworkId === booking.id} onClick={() => setHomeworkId(homeworkId === booking.id ? null : booking.id)}>
            <BookOpen size={15} aria-hidden="true" />{homeworkId === booking.id ? "Close homework" : "Homework"}
          </button> : null}
        </div>
        <ul className="booking-payment-facts teacher-history-lesson__facts">
          <li>{booking.location === "porto" ? "In Porto" : "Online"}</li>
          {facts.map(fact => <li key={fact}>{fact}</li>)}
        </ul>
        {settle ? <div className="teacher-history-lesson__paid">
          <PaidTick checked={paidByHand(booking)} disabled={Boolean(paying) || homeworkBusy} onChange={async (paid) => {
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
        {cancelled && paidByHand(booking) && booking.payment_status !== "refunded" ? <button className="button button--outline button--small" type="button" disabled={homeworkBusy} onClick={() => onRecordRefund(booking)}>Record refund</button> : null}
        {homeworkId === booking.id ? <TeacherHomework key={`${booking.id}-${token}`} bookingId={booking.id} token={token} onBusy={setHomeworkBusy} /> : null}
      </li>
    );
  }

  if (error) {
    return <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" onClick={onRetry} type="button">Try again</button></div>;
  }
  if (bookings === null) return <p role="status">Loading lesson history…</p>;
  if (bookings.length === 0) return <p className="teacher-history-empty">No lessons recorded yet.</p>;
  return (
    <>
      {upcoming.length ? <section aria-labelledby="teacher-history-upcoming"><h3 id="teacher-history-upcoming">Upcoming <span>· {upcoming.length}</span></h3><ul className="teacher-history-list">{upcoming.map(lessonRow)}</ul></section> : null}
      {past.length ? <section aria-labelledby="teacher-history-past"><h3 id="teacher-history-past">Past &amp; cancelled <span>· {past.length}</span></h3><ul className="teacher-history-list">{past.map(lessonRow)}</ul></section> : null}
    </>
  );
}
