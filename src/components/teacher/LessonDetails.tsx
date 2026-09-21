"use client";

import { useEffect, useRef, useState } from "react";
import { X, MapPin, Video, Clock, Mail, ArrowLeft, ReceiptText } from "lucide-react";
import {
  cancelBookingAs,
  rescheduleBookingAs,
  setNoShow,
  type AdminBooking,
} from "@/lib/admin-api";
import { formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
import { SAME_DAY_FEE_LABEL } from "@/lib/config";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { MeetingLink } from "@/components/MeetingLink";

type Props = {
  booking: AdminBooking;
  token: string;
  now: Date;
  onClose: () => void;
  onChanged: (message: string) => void;
};

export function LessonDetails({
  booking,
  token,
  now,
  onClose,
  onChanged,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"view" | "move" | "cancel" | "no-show">(
    "view",
  );
  const [date, setDate] = useState(dateKey(new Date(booking.starts_at)));
  const [time, setTime] = useState(formatSlotTime(booking.starts_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canMarkAttendance =
    booking.payment_status === "scheduled" &&
    now >= new Date(booking.starts_at) &&
    now < new Date(booking.ends_at);
  const noShow = booking.attendance_status === "no_show";
  const locked =
    booking.payment_status === "processing" ||
    booking.same_day_fee_status === "processing";

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  async function perform() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "move") {
        await rescheduleBookingAs(
          token,
          booking.id,
          portoTimeToUtc(date, time),
        );
        onChanged("Lesson moved. The student has been emailed the new time.");
      } else if (action === "cancel") {
        await cancelBookingAs(token, booking.id);
        onChanged("Lesson cancelled. The student has been emailed.");
      } else if (action === "no-show") {
        await setNoShow(token, booking.id, !noShow);
        onChanged(
          noShow
            ? "No-show removed. The normal lesson price will be charged when it ends."
            : `Marked as a no-show. Only ${SAME_DAY_FEE_LABEL} will be charged when the lesson ends.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This lesson could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      className="teacher-lesson-dialog"
      ref={dialogRef}
      aria-labelledby="teacher-lesson-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          !busy &&
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          onClose();
      }}
    >
      <div className="teacher-dialog-top">
        <span className="teacher-eyebrow">{booking.lesson_name}</span>
        <button
          className="teacher-icon-button"
          type="button"
          aria-label="Close lesson details"
          disabled={busy}
          onClick={onClose}
        >
          <X size={21} aria-hidden="true" />
        </button>
      </div>
      <h2 id="teacher-lesson-title">{booking.student_name}</h2>
      <p className="teacher-dialog-date">
        {dateLabel(dateKey(new Date(booking.starts_at)), {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      <div className="teacher-lesson-facts">
        <span>
          <Clock size={16} aria-hidden="true" />
          {formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}{" "}
          · Porto time
        </span>
        <span>
          {booking.location === "porto" ? (
            <MapPin size={16} aria-hidden="true" />
          ) : (
            <Video size={16} aria-hidden="true" />
          )}
          {booking.location === "porto" ? "In Porto" : "Online"}
        </span>
        <a href={`mailto:${booking.student_email}`}>
          <Mail size={16} aria-hidden="true" />
          {booking.student_email}
        </a>
        {/* Her receipt automation reads this, so absence is stated too. */}
        <span>
          <ReceiptText size={16} aria-hidden="true" />
          {booking.student_nif ? `NIF ${booking.student_nif}` : "NIF not given (consumidor final)"}
        </span>
      </div>
      <MeetingLink meetingUrl={booking.meeting_url} location={booking.location} status={booking.status} />
      {booking.notes ? (
        <p className="teacher-lesson-note">{booking.notes}</p>
      ) : null}
      {noShow ? (
        <p className="teacher-inline-notice">No-show · {SAME_DAY_FEE_LABEL} after this lesson</p>
      ) : null}
      {booking.same_day_fee_status === "paid" ? (
        <p className="teacher-inline-notice">{SAME_DAY_FEE_LABEL} late change fee paid</p>
      ) : booking.same_day_change ? (
        <p className="teacher-inline-notice">{SAME_DAY_FEE_LABEL} late change fee due</p>
      ) : null}
      {booking.payment_status === "payment_due" ? (
        <p className="teacher-inline-notice">
          The lesson payment is still due.
        </p>
      ) : null}
      {locked ? (
        <p className="teacher-inline-notice">
          A payment is being processed. Try making changes once it finishes.
        </p>
      ) : null}
      {action === "view" ? (
        <div className="teacher-dialog-actions">
          <button
            className="button button--coral"
            type="button"
            disabled={locked}
            onClick={() => setAction("move")}
          >
            Move lesson
          </button>
          <button
            className="teacher-text-button teacher-destructive"
            type="button"
            disabled={locked}
            onClick={() => setAction("cancel")}
          >
            Cancel lesson
          </button>
          {canMarkAttendance ? (
            <button
              className="teacher-text-button"
              type="button"
              onClick={() => setAction("no-show")}
            >
              {noShow ? "Undo no-show" : "Mark no-show"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="teacher-dialog-confirmation">
          <button
            className="teacher-text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setAction("view");
              setError("");
            }}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to lesson
          </button>
          {action === "move" ? (
            <form
              className="teacher-form teacher-move-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform();
              }}
            >
              <label>
                <span>New date</span>
                <input
                  type="date"
                  required
                  disabled={busy}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                <span>Time in Porto</span>
                <input
                  type="time"
                  required
                  disabled={busy}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
              <p>The student will be emailed the new time.</p>
              <button
                className="button button--coral"
                type="submit"
                disabled={busy}
              >
                {busy ? "Moving…" : "Save new time"}
              </button>
            </form>
          ) : (
            <>
              <h3>
                {action === "cancel"
                  ? "Cancel this lesson?"
                  : noShow
                    ? "Remove the no-show?"
                    : "Mark as a no-show?"}
              </h3>
              <p>
                {action === "cancel"
                  ? "The lesson will be removed from the calendar and the student will be emailed."
                  : noShow
                    ? "The normal lesson price will be charged when the lesson ends."
                    : `Only ${SAME_DAY_FEE_LABEL} will be charged when this lesson ends, instead of the full lesson price.`}
              </p>
              <button
                className="button button--coral"
                type="button"
                disabled={busy}
                onClick={() => void perform()}
              >
                {busy
                  ? "Saving…"
                  : action === "cancel"
                    ? "Yes, cancel lesson"
                    : noShow
                      ? "Undo no-show"
                      : "Confirm no-show"}
              </button>
            </>
          )}
        </div>
      )}
      {error ? (
        <p className="teacher-inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </dialog>
  );
}
