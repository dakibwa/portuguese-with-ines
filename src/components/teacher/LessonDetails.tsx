"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { X, ArrowLeft, CheckCircle2, CircleX } from "lucide-react";
import {
  addedByTeacher,
  cancelBookingAs,
  rescheduleBookingAs,
  markPaidByHand,
  setNoShow,
  type AdminBooking,
} from "@/lib/admin-api";
import { formatBookedLessonLabel, formatMoneyCents, formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
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
  const [cancelMessage, setCancelMessage] = useState("");
  const firstName = booking.student_name.split(" ")[0];
  // Set up by her and not welcomed yet: the site emails them nothing.
  const awaiting = Boolean(booking.student_awaiting_welcome);
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
  const minutes = Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000);
  // Its price and how it is paid, one dab: "€25 · paid to you by hand". A
  // cancelled lesson's money matters only if some moved.
  const paid = {
    paid: "paid",
    refunded: "refunded",
    payment_due: "payment due",
    processing: "payment processing",
    scheduled: "charged to their card after the lesson",
    pending: "waiting for their card",
    not_required: "paid to you by hand",
  }[booking.payment_status];
  const money = booking.status === "cancelled" && !["paid", "refunded"].includes(booking.payment_status)
    ? ""
    : booking.amount_cents ? `${formatMoneyCents(booking.amount_cents)} · ${paid}` : paid.charAt(0).toUpperCase() + paid.slice(1);
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
        const moved = await rescheduleBookingAs(
          token,
          booking.id,
          portoTimeToUtc(date, time, booking.starts_at),
        );
        changed.current = true;
        onChanged(moved.emailed === false ? "Lesson moved." : "Lesson moved. The student has been emailed the new time.");
      } else if (action === "cancel") {
        const cancelled = await cancelBookingAs(token, booking.id, awaiting ? "" : cancelMessage);
        changed.current = true;
        onChanged(cancelled.emailed === false ? "Lesson cancelled." : "Lesson cancelled. The student has been emailed.");
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
      {/* Set as a student's own lesson is (10 October 2026, at Dan's
          request): the status, who, then when in bold with its length and
          place beneath, and the actions side by side. */}
      <button
        className="teacher-dialog-close"
        type="button"
        aria-label="Close lesson details"
        disabled={busy}
        onClick={onClose}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <p className={`lesson-calendar__status${booking.status === "cancelled" ? " lesson-calendar__status--cancelled" : addedByTeacher(booking) ? " lesson-calendar__status--added" : ""}`}>
        {booking.status === "cancelled" ? <CircleX size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
        {booking.status === "cancelled" ? "Cancelled" : addedByTeacher(booking) ? "Added by you" : "Booked"}
      </p>
      <div className="teacher-dialog-top">
        {/* The student's own splat when they have chosen one, so Inês knows
            them at a glance (10 October 2026, at Dan's request). */}
        <AssetMark
          asset={studentMark(booking.student_mark)?.src ?? "/visuals/v2-splats/one-to-one-splat-v2.svg"}
          className="teacher-lesson-mark"
        />
        <h2 id="teacher-lesson-title">{booking.student_name}</h2>
      </div>
      <div className="teacher-lesson-when">
        {/* The date, then the time on a line of its own, rather than the
            time breaking across two (13 October 2026, Dan). */}
        <strong className="lesson-when">
          <span>{dateLabel(dateKey(new Date(booking.starts_at)), { weekday: "long", day: "numeric", month: "long" })}</span>
          <span className="visually-hidden">, </span>
          <span className="lesson-when__time">{formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}</span>
        </strong>
        {action === "view" ? (
          <MeetingLink meetingUrl={booking.meeting_url} location={booking.location} status={booking.status} />
        ) : null}
      </div>
      {/* The lesson, not the student (13 October 2026, Dan: "this page is
          more about the lesson"): its place, length, price and how it is
          paid as dabs, as her history shows a lesson. Who they are lives in
          Students. While she confirms a change these step aside. */}
      {action === "view" ? (
        <>
          <ul className="booking-payment-facts teacher-lesson-facts">
            <li>{booking.location === "porto" ? "In Porto" : "Online"}</li>
            <li>{formatBookedLessonLabel({ id: booking.lesson_type_id ?? "", name: booking.lesson_name, durationMinutes: minutes })}</li>
            {money ? <li>{money}</li> : null}
            {booking.reschedule_count > 0 ? <li>Moved {booking.reschedule_count === 1 ? "once" : `${booking.reschedule_count} times`}</li> : null}
            {awaiting ? <li>Not emailed yet: send their welcome from Students</li> : null}
          </ul>
          {addedByTeacher(booking) && booking.status !== "cancelled" && booking.payment_status === "scheduled" ? (
            // One they already paid for by hand comes off before it is charged.
            <button
              className="text-action teacher-lesson-paid"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await markPaidByHand(token, booking.id);
                  changed.current = true;
                  onChanged("Taken off their card. This lesson stays paid to you by hand.");
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "This lesson couldn’t be updated.");
                } finally {
                  setBusy(false);
                }
              }}
              type="button"
            >
              Already paid you by hand? Take it off their card
            </button>
          ) : null}
        </>
      ) : null}
      {action === "view" && booking.notes ? (
        <p className="teacher-history-lesson__note teacher-lesson-note"><span>Their note</span>{booking.notes}</p>
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
            className="button button--outline"
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
                className="text-action"
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
              <p>{awaiting ? `${firstName} isn’t emailed until you send their welcome.` : "The student will be emailed the new time."}</p>
              <div className="teacher-dialog-actions">
                <button
                  className="button button--coral"
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
              <ul className="booking-payment-facts teacher-confirm-facts">
                {action === "cancel" ? (
                  <>
                    <li>
                      {awaiting
                        ? `${firstName} isn’t emailed: they haven’t had their welcome yet`
                        : `${firstName} gets an email saying you’ve cancelled, with an update for their calendar`}
                    </li>
                    {booking.payment_status === "paid" ? (
                      <li>{firstName} is refunded in full, automatically</li>
                    ) : booking.payment_status === "scheduled" ? (
                      <li>Nothing is charged to {firstName}’s card</li>
                    ) : null}
                    <li>The lesson comes off your calendar</li>
                  </>
                ) : noShow ? (
                  <li>{firstName} is charged the lesson price as normal</li>
                ) : (
                  <li>{firstName} is charged only {SAME_DAY_FEE_LABEL}, instead of the lesson price</li>
                )}
              </ul>
              {action === "cancel" && !awaiting ? (
                <div className="teacher-form teacher-cancel-message">
                  <label htmlFor="teacher-cancel-message">
                    <span>Add a message to the email <span className="teacher-field-optional">(optional)</span></span>
                    <textarea
                      id="teacher-cancel-message"
                      rows={3}
                      maxLength={1000}
                      placeholder="Sorry, I can’t make it. Shall we find another time?"
                      disabled={busy}
                      value={cancelMessage}
                      onChange={(event) => setCancelMessage(event.target.value)}
                    />
                  </label>
                  {/* The limit shows only as she nears it. */}
                  {cancelMessage.length > 850 ? (
                    <p className="teacher-cancel-message__hint">{cancelMessage.length}/1,000</p>
                  ) : null}
                </div>
              ) : null}
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
