"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { X, MapPin, Video, Clock, Mail, ArrowLeft, ReceiptText } from "lucide-react";
import {
  cancelBookingAs,
  rescheduleBookingAs,
  setNoShow,
  type AdminBooking,
} from "@/lib/admin-api";
import { formatBookedLessonLabel, formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
import { NO_SHOW_WINDOW_HOURS_AFTER, SAME_DAY_FEE_LABEL } from "@/lib/config";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { AssetMark } from "@/components/BrandMarks";
import { studentMark } from "@/lib/student-marks";
import { MeetingLink } from "@/components/MeetingLink";
import { restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";

type Props = {
  booking: AdminBooking;
  token: string;
  now: Date;
  afterChangeFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onChanged: (message: string) => void;
};

export function LessonDetails({
  booking,
  token,
  now,
  afterChangeFocusRef,
  onClose,
  onChanged,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const changed = useRef(false);
  const [action, setAction] = useState<"view" | "move" | "cancel" | "no-show">(
    "view",
  );
  const [date, setDate] = useState(dateKey(new Date(booking.starts_at)));
  const [time, setTime] = useState(formatSlotTime(booking.starts_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noShowCloses = new Date(new Date(booking.ends_at).getTime() + NO_SHOW_WINDOW_HOURS_AFTER * 3_600_000);
  const canMarkAttendance =
    booking.payment_status === "scheduled" &&
    now >= new Date(booking.starts_at) &&
    now < noShowCloses;
  const noShow = booking.attendance_status === "no_show";
  // Before the lesson the no-show control is shown but closed, so she knows
  // where it will be; after it ends the lesson has been charged as normal.
  const noShowLater =
    booking.payment_status === "scheduled" &&
    booking.status === "confirmed" &&
    now < new Date(booking.starts_at);
  const locked =
    booking.payment_status === "processing" ||
    booking.same_day_fee_status === "processing";
  const backdropHandlers = useDialogBackdrop(() => { if (!busy) onClose(); });

  useLayoutEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      releaseScroll();
      // Successful actions reload the timetable, removing its opener. Keep
      // keyboard position at the stable week heading throughout that reload.
      restoreDialogFocus(changed.current ? afterChangeFocusRef.current : previous);
    };
  }, [afterChangeFocusRef]);

  const backToLesson = (
    <button
      className="button button--outline"
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
  );

  async function perform() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "move") {
        await rescheduleBookingAs(
          token,
          booking.id,
          portoTimeToUtc(date, time, booking.starts_at),
        );
        changed.current = true;
        onChanged("Lesson moved. The student has been emailed the new time.");
      } else if (action === "cancel") {
        await cancelBookingAs(token, booking.id);
        changed.current = true;
        onChanged("Lesson cancelled. The student has been emailed.");
      } else if (action === "no-show") {
        await setNoShow(token, booking.id, !noShow);
        changed.current = true;
        onChanged(
          noShow
            ? "No-show removed. The lesson price will be charged as normal."
            : `Marked as a no-show. Only ${SAME_DAY_FEE_LABEL} will be charged, instead of the lesson price.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This lesson couldn’t be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      className="teacher-lesson-dialog"
      ref={dialogRef}
      {...backdropHandlers}
      aria-labelledby="teacher-lesson-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="teacher-dialog-top">
        {/* The student's own splat when they have chosen one, so Inês knows
            them at a glance (10 October 2026, at Dan's request). */}
        <AssetMark
          asset={studentMark(booking.student_mark)?.src ?? "/visuals/v2-splats/one-to-one-splat-v2.svg"}
          className="teacher-lesson-mark"
        />
        <div className="teacher-dialog-heading">
          {/* The length and short date, as the student's own lesson rows
              read: `60 mins · Thu 8 Oct`, while a trial keeps its name. */}
          <span className="teacher-eyebrow">
            {formatBookedLessonLabel({
              id: booking.lesson_type_id ?? "",
              name: booking.lesson_name,
              durationMinutes: Math.round(
                (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) /
                  60_000,
              ),
            })}{" "}
            ·{" "}
            {dateLabel(dateKey(new Date(booking.starts_at)), {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </span>
          <h2 id="teacher-lesson-title">{booking.student_name}</h2>
        </div>
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
            className="button button--blue"
            type="button"
            disabled={locked}
            onClick={() => setAction("move")}
          >
            Move lesson
          </button>
          <button
            className="button button--outline teacher-button--danger"
            type="button"
            disabled={locked}
            onClick={() => setAction("cancel")}
          >
            Cancel lesson
          </button>
          {canMarkAttendance || noShowLater ? (
            <div className="teacher-no-show">
              <button
                aria-describedby={noShowLater ? "teacher-no-show-hint" : undefined}
                className="button button--outline"
                type="button"
                disabled={!canMarkAttendance}
                onClick={() => setAction("no-show")}
              >
                {noShow ? "Undo no-show" : "Mark no-show"}
              </button>
              {noShowLater ? (
                <p className="teacher-no-show__hint" id="teacher-no-show-hint">
                  Available {formatSlotTime(booking.starts_at)}–{formatSlotTime(noShowCloses.toISOString())}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="teacher-dialog-confirmation">
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
              <div className="teacher-dialog-actions">
                <button
                  className="button button--blue"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Moving…" : "Save new time"}
                </button>
                {backToLesson}
              </div>
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
                    ? "The lesson price will be charged as normal."
                    : `Only ${SAME_DAY_FEE_LABEL} will be charged, instead of the lesson price.`}
              </p>
              <div className="teacher-dialog-actions">
                <button
                  className={`button ${action === "no-show" && noShow ? "button--blue" : "button--coral"}`}
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
                {backToLesson}
              </div>
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
