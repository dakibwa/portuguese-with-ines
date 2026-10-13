"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Globe, UserRound, X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { addedByTeacher, fetchBookings, type AdminBooking, type AdminStudent } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { formatBookedLessonLabel, formatSlotTime } from "@/lib/booking-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

function paymentLabel(booking: AdminBooking) {
  switch (booking.payment_status) {
    case "paid": return "Paid";
    case "refunded": return "Refunded";
    case "payment_due": return "Payment due";
    case "processing": return "Payment processing";
    case "scheduled": return "Payment scheduled";
    case "pending": return "Payment pending";
    case "not_required": return addedByTeacher(booking) && booking.status !== "cancelled" ? "Payment arranged directly" : "No lesson charge";
    default: return "";
  }
}

/** Reads the existing teacher records, including dates before the visible week. */
export function StudentHistory({ student, token, onClose }: {
  student: AdminStudent;
  token: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());
  const backdrop = useDialogBackdrop(onClose);

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      releaseScroll();
      restoreDialogFocus(previous);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchBookings(token, "1970-01-01T00:00:00.000Z").then(result => {
      if (!active || readSession() !== token) return;
      // The account ID survives an email change. Only older unlinked bookings
      // fall back to their email; names alone must never match another student.
      setBookings(result.bookings.filter(booking =>
        (booking.status === "confirmed" || booking.status === "cancelled") &&
        (booking.student_id
          ? booking.student_id === student.id
          : booking.student_email.trim().toLowerCase() === student.email.trim().toLowerCase())
      ));
    }).catch(caught => {
      if (active && readSession() === token)
        setError(caught instanceof Error ? caught.message : "Lesson history couldn’t be loaded.");
    });
    return () => { active = false; };
  }, [token, student.id, student.email, attempt]);

  const upcoming = (bookings ?? []).filter(booking => booking.status === "confirmed" && Date.parse(booking.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = (bookings ?? []).filter(booking => booking.status === "cancelled" || Date.parse(booking.ends_at) <= now)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  const thisYear = new Date(now).getFullYear();

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
    // A cancelled lesson's money only matters if some moved.
    const payment = cancelled && !["paid", "refunded"].includes(booking.payment_status) ? "" : paymentLabel(booking);
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
          <strong>
            {dateLabel(dateKey(starts), { weekday: "short", day: "numeric", month: "short", ...(starts.getFullYear() === thisYear ? {} : { year: "numeric" }) })}
            <span> · {formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}</span>
          </strong>
          {pill ? <span className={`teacher-history-status${live ? "" : " is-muted"}`}>{pill}</span> : null}
        </div>
        <p className="teacher-history-lesson__facts">
          <span>{booking.location === "porto" ? <UserRound size={13} aria-hidden="true" /> : <Globe size={13} aria-hidden="true" />}{booking.location === "porto" ? "In Porto" : "Online"}</span>
          {facts.map(fact => <span key={fact}>{fact}</span>)}
        </p>
        {booking.cancellation_message ? <p className="teacher-history-lesson__note"><span>Your message</span>{booking.cancellation_message}</p> : null}
        {booking.notes ? <p className="teacher-history-lesson__note"><span>Their note</span>{booking.notes}</p> : null}
      </li>
    );
  }

  return (
    <dialog className="teacher-lesson-dialog teacher-history-dialog" ref={dialogRef} {...backdrop} aria-labelledby="teacher-history-name" aria-describedby="teacher-history-label" onKeyDown={keepDialogFocus} onCancel={event => { event.preventDefault(); onClose(); }}>
      <button className="teacher-dialog-close" aria-label="Close student history" onClick={onClose} type="button"><X size={20} aria-hidden="true" /></button>
      <header className="teacher-history-heading">
        <AccountAvatar mark={student.mark} name={student.name} />
        <div><p id="teacher-history-label">Lesson history</p><h2 id="teacher-history-name">{student.name}</h2><p className="teacher-history-email">{student.email}</p></div>
      </header>
      {error ? <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="teacher-text-button" onClick={() => { setError(""); setBookings(null); setAttempt(value => value + 1); }} type="button">Try again</button></div>
        : bookings === null ? <p role="status">Loading lesson history…</p>
          : bookings.length === 0 ? <p className="teacher-history-empty">No lessons recorded yet.</p>
            : <>
              {upcoming.length ? <section aria-labelledby="teacher-history-upcoming"><h3 id="teacher-history-upcoming">Upcoming <span>· {upcoming.length}</span></h3><ul className="teacher-history-list">{upcoming.map(lessonRow)}</ul></section> : null}
              {past.length ? <section aria-labelledby="teacher-history-past"><h3 id="teacher-history-past">Past &amp; cancelled <span>· {past.length}</span></h3><ul className="teacher-history-list">{past.map(lessonRow)}</ul></section> : null}
            </>}
    </dialog>
  );
}
