"use client";

import { IN_PERSON, TUTOR_CITY } from "@/lib/tutor";
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { X, ArrowLeft, Check, CheckCircle2, CircleX, UserX } from "lucide-react";
import {
  addedByTeacher,
  cancelBookingAs,
  cancelFollowingAs,
  changeLessonLength,
  rescheduleBookingAs,
  paidByHand,
  recordRefundByHand,
  setLessonPaid,
  setNoShow,
  type AdminBooking,
  type AdminStudent,
  type KeptLesson,
} from "@/lib/admin-api";
import { formatBookedLessonLabel, formatMoneyCents, formatPriceCents, formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
import { NO_SHOW_WINDOW_HOURS_AFTER, SAME_DAY_FEE_LABEL } from "@/lib/config";

// When a card is charged, in the words the student reads (CardOnFile): at the
// lesson's end while the no-show window is nothing, after it once there is one.
const CHARGED = NO_SHOW_WINDOW_HOURS_AFTER ? "after the lesson" : "at the end of the lesson";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { AssetMark } from "@/components/BrandMarks";
import { studentMark } from "@/lib/student-marks";
import { MeetingLink } from "@/components/MeetingLink";
import { restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { TeacherHomework } from "@/components/homework/TeacherHomework";
import { PaidTick } from "@/components/teacher/PaidTick";
import { CardApprovalLink } from "@/components/teacher/CardApprovalLink";
import { priceFor } from "@/components/teacher/StudentPrice";

type Props = {
  booking: AdminBooking;
  /** The lessons of its weekly run, for changing or cancelling every week from this one. */
  weekly?: AdminBooking[];
  /** Whose lesson it is, for their price at each length. */
  student?: AdminStudent;
  token: string;
  now: Date;
  afterChangeFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onChanged: (message: string) => void;
  initialAction?: "view" | "refund";
  /**
   * A modal dialog over the page, as her timetable opens a lesson, or the same
   * details laid out in place within a student's dashboard: no scrim, no page
   * scroll lock, no focus trap, and nothing else on the page closed.
   */
  presentation?: "dialog" | "inline";
  /** Inline, whether a change is being saved, so the page around it waits. */
  onBusy?: (busy: boolean) => void;
};

/** "Tue 8 Dec", as her timetable names a day. */
function shortDay(startsAt: string) {
  return dateLabel(dateKey(new Date(startsAt)), { weekday: "short", day: "numeric", month: "short" });
}

/** "Tue 8 Dec to Tue 5 Jan" for several lessons, or the one day. */
function daySpan(lessons: Pick<AdminBooking, "starts_at">[]) {
  const first = shortDay(lessons[0].starts_at);
  return lessons.length > 1 ? `${first} to ${shortDay(lessons[lessons.length - 1].starts_at)}` : first;
}

/** Lessons that stayed as they were, grouped by why: "Tue 15 Dec stays as it is: it's already paid." */
function keptLine(kept: KeptLesson[]) {
  const reasons = [...new Set(kept.map(lesson => lesson.reason))];
  return reasons.map(reason => {
    const days = kept.filter(lesson => lesson.reason === reason);
    return ` ${days.map(lesson => shortDay(lesson.startsAt)).join(", ")} ${days.length === 1 ? "stays as it is" : "stay as they are"}: ${reason}.`;
  }).join("");
}

/**
 * Why a lesson can't take another length, as the Worker decides it, or "".
 * Paid, due or being paid lessons keep theirs; a free one keeps it unless the
 * new length is free too.
 */
function lengthHeld(lesson: AdminBooking, cents: number) {
  if (paidByHand(lesson) || lesson.payment_status === "paid") return "it's already paid";
  if (lesson.payment_status === "payment_due") return "it has a payment due";
  if (lesson.payment_status === "processing" || lesson.charge_started_at) return "its payment is going through";
  if (lesson.payment_status === "free" && cents > 0) return "it's free";
  return "";
}

/**
 * This lesson, or every week of its run from here (9 November 2026, Dan:
 * "change recurring ones from 60 to 90 and they all change and she can cancel
 * them all too"). The same slider as her lesson form's.
 */
function WeekChoice({ verb, following, disabled, onChange }: { verb: string; following: boolean; disabled: boolean; onChange: (following: boolean) => void }) {
  return (
    <fieldset className="teacher-manual-choice teacher-week-choice">
      <legend>{verb}</legend>
      <div className={`segmented${following ? " segmented--second" : ""}`}>
        <span aria-hidden="true" className="segmented__thumb" />
        {([[false, "This lesson"], [true, "Every week"]] as const).map(([value, label]) => (
          <label className={following === value ? "is-active" : ""} key={label}>
            <input
              checked={following === value}
              disabled={disabled}
              name={`teacher-week-choice-${verb}`}
              onChange={() => onChange(value)}
              type="radio"
              value={String(value)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function LessonDetails({
  booking,
  weekly,
  student,
  token,
  now,
  afterChangeFocusRef,
  onClose,
  onChanged,
  initialAction = "view",
  presentation = "dialog",
  onBusy,
}: Props) {
  const inline = presentation === "inline";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const ids = useId();
  // Inline, ids carry the instance; the timetable's dialog keeps the ones it
  // has always had.
  const noShowHintId = inline ? `teacher-no-show-hint-${ids}` : "teacher-no-show-hint";
  const cancelMessageId = inline ? `teacher-cancel-message-${ids}` : "teacher-cancel-message";
  const changed = useRef(false);
  const [action, setAction] = useState<"view" | "move" | "length" | "cancel" | "no-show" | "homework" | "refund">(
    initialAction,
  );
  // The other length: a 60-minute lesson is most likely becoming 90.
  const [length, setLength] = useState<"single" | "long">(booking.lesson_type_id === "long" ? "single" : "long");
  const [following, setFollowing] = useState(false);
  const [date, setDate] = useState(dateKey(new Date(booking.starts_at)));
  const [time, setTime] = useState(formatSlotTime(booking.starts_at));
  // Pre-filled with the current slot: nothing to save until she changes it.
  const unchanged = date === dateKey(new Date(booking.starts_at)) && time === formatSlotTime(booking.starts_at);
  const [cancelMessage, setCancelMessage] = useState("");
  const firstName = booking.student_name.split(" ")[0];
  // Set up by her and not welcomed yet: the site emails them nothing.
  const awaiting = Boolean(booking.student_awaiting_welcome);
  // Added by name alone: there is no address to welcome until she gives one.
  const noEmail = !booking.student_email;
  const recorded = booking.payment_status === "recorded";
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
  // This lesson and the weeks after it, while it has weeks after it.
  const later = booking.series_id ? (weekly ?? [])
    .filter(lesson => lesson.series_id === booking.series_id && lesson.status === "confirmed" && lesson.starts_at >= booking.starts_at)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : [];
  const toCome = booking.status === "confirmed" && !recorded && now < new Date(booking.starts_at);
  const repeats = toCome && later.length > 1;
  const everyWeek = following && repeats;
  const lengthMinutes = length === "long" ? 90 : 60;
  const lengthCents = priceFor(student, lengthMinutes);
  const lengthScope = (everyWeek ? later : [booking]).filter(lesson => lesson.lesson_type_id !== length);
  const lengthChanging = lengthScope.filter(lesson => !lengthHeld(lesson, lengthCents));
  const lengthKept = lengthScope.filter(lesson => lengthHeld(lesson, lengthCents))
    .map(lesson => ({ startsAt: lesson.starts_at, reason: lengthHeld(lesson, lengthCents) }));
  // Its price and how it is paid, one dab: "€25 · paid by card". A
  // cancelled lesson's money matters only if some moved.
  const ticked = paidByHand(booking);
  const canRecordRefund = booking.status === "cancelled" && ticked && booking.payment_status !== "refunded";
  const paid = ticked && booking.payment_status !== "refunded" ? "paid to you by hand" : {
    paid: "paid by card",
    refunded: "refunded",
    payment_due: "payment due",
    processing: "payment processing",
    scheduled: `charged to their card ${CHARGED}`,
    pending: "waiting for their card",
    not_required: "to pay you directly",
    recorded: "recorded",
    // Its price is €0, so "Free" alone says it.
    free: "free",
  }[booking.payment_status];
  // "Already paid" is offered wherever nothing has been charged or settled by
  // card: a lesson to come not yet charging, or one she recorded. Not on a free
  // lesson, which has nothing to pay, nor on one paid, due or charging by card.
  const tickable = booking.status === "confirmed" && (ticked || booking.payment_status === "recorded" ||
    (["scheduled", "not_required"].includes(booking.payment_status) && !booking.charge_started_at));
  const money = booking.status === "cancelled" && !ticked && !["paid", "refunded"].includes(booking.payment_status)
    ? ""
    : booking.amount_cents ? `${formatMoneyCents(booking.amount_cents)} · ${paid}` : paid.charAt(0).toUpperCase() + paid.slice(1);
  const backdropHandlers = useDialogBackdrop(() => { if (!busy) onClose(); });

  useLayoutEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (inline) {
      // In place: focus moves to the named details, and back to the lesson
      // that opened them (or, once something changed and the lessons
      // reloaded, to their stable container) when they close. If focus has
      // already gone elsewhere on the page, such as to another lesson that was
      // pressed to replace these, it stays there.
      const panel = panelRef.current;
      panel?.focus();
      return () => {
        const active = document.activeElement;
        if (active && active !== document.body && !panel?.contains(active)) return;
        const target = changed.current || !previous?.isConnected ? afterChangeFocusRef.current : previous;
        target?.focus({ preventScroll: true });
      };
    }
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
  }, [afterChangeFocusRef, inline]);

  // Inline, the dashboard waits while a change is being saved, and is released
  // if these details leave mid-way (a saved change closes them at once).
  const reportedBusy = useRef(false);
  useEffect(() => {
    if (!inline) return;
    reportedBusy.current = busy;
    onBusy?.(busy);
    // Only a change in busy is reported, not each new callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, inline]);
  useEffect(() => () => { if (reportedBusy.current) onBusy?.(false); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  // A step replaces the button that opened it, so focus follows to the details.
  const firstAction = useRef(true);
  useEffect(() => {
    if (firstAction.current) { firstAction.current = false; return; }
    if (inline) panelRef.current?.focus({ preventScroll: true });
  }, [action, inline]);

  const backToLesson = (
    <button
      data-homework-exit
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
      } else if (action === "length") {
        const result = await changeLessonLength(token, booking.id, length, lengthCents, everyWeek);
        changed.current = true;
        onChanged(`${result.changed.length === 1 ? "The lesson is" : `${result.changed.length} lessons are`} now ${lengthMinutes} minutes.${keptLine(result.kept)}${result.emailed === false ? "" : " The student has been emailed."}`);
      } else if (action === "cancel" && everyWeek) {
        const result = await cancelFollowingAs(token, booking.id, awaiting ? "" : cancelMessage);
        changed.current = true;
        onChanged(`${result.cancelled.length === 1 ? "Lesson" : `${result.cancelled.length} lessons`} cancelled.${keptLine(result.kept)}${result.emailed === false ? "" : " The student has been emailed."}`);
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
      } else if (action === "refund") {
        await recordRefundByHand(token, booking.id);
        changed.current = true;
        onChanged("Refund recorded. No payment or email was sent.");
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

  const status = (
    <p className={`lesson-calendar__status${booking.status === "cancelled" ? " lesson-calendar__status--cancelled" : addedByTeacher(booking) ? " lesson-calendar__status--added" : ""}`}>
      {booking.status === "cancelled" ? <CircleX size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
      {booking.status === "cancelled" ? "Cancelled" : addedByTeacher(booking) ? "Added by you" : "Booked"}
    </p>
  );
  const closeButton = (
    <button
      className={inline ? "teacher-quiet" : "teacher-dialog-close"}
      data-homework-exit
      type="button"
      aria-label="Close lesson details"
      disabled={busy}
      onClick={onClose}
    >
      {inline ? "Close" : <X size={20} aria-hidden="true" />}
    </button>
  );
  // Inline, every routine action is the one quiet text style; the dialog keeps its buttons.
  const routine = (dialogClass: string) => inline ? "teacher-quiet" : dialogClass;
  // Set as a student's own lesson is (10 October 2026, at Dan's request): the
  // status, who, then when in bold with its length and place beneath, and the
  // actions side by side. Inline, the lesson's own row above already says who,
  // when and any exceptional status, so only its close and call link remain.
  const head = inline ? (
    <>
      <div className="teacher-lesson-inline__head">
        {closeButton}
      </div>
      {action === "view" ? <MeetingLink meetingUrl={booking.meeting_url} location={booking.location} status={booking.status} /> : null}
    </>
  ) : (
    <>
      {closeButton}
      <div className="teacher-dialog-top">
        {/* The student's own splat when they have chosen one, so Inês knows
            them at a glance (10 October 2026, at Dan's request). */}
        <AssetMark
          asset={studentMark(booking.student_mark)?.src ?? "/visuals/v2-splats/one-to-one-splat-v2.svg"}
          className="teacher-lesson-mark"
        />
        <h2 id="teacher-lesson-title">{booking.student_name}</h2>
        {/* Its status beside the name rather than a row of its own
            (27 October 2026, Dan: it felt disjointed). */}
        {status}
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
    </>
  );
  const main = (
    <>
      {/* The lesson, not the student (13 October 2026, Dan: "this page is
          more about the lesson"): its place, length, price and how it is
          paid as dabs, as her history shows a lesson. Who they are lives in
          Students. While she confirms a change these step aside. */}
      {action === "view" ? (
        <>
          <ul className="booking-payment-facts teacher-lesson-facts">
            <li>{booking.location === "porto" ? IN_PERSON : "Online"}</li>
            <li>{formatBookedLessonLabel({ id: booking.lesson_type_id ?? "", name: booking.lesson_name, durationMinutes: minutes })}</li>
            {money ? <li>{money}</li> : null}
            {booking.reschedule_count > 0 ? <li>Moved {booking.reschedule_count === 1 ? "once" : `${booking.reschedule_count} times`}</li> : null}
            {awaiting ? <li>{noEmail ? "No email yet: add it from their details on Students, then send their welcome" : "Not emailed yet: send their welcome from Students"}</li> : null}
          </ul>
          {/* What happened, recorded side by side: paid by hand, and a
              no-show (27 October 2026, Dan). */}
          {tickable || (booking.status !== "cancelled" && (canMarkAttendance || noShowLater)) ? <div className="teacher-lesson-record">
          {tickable ? (
            <PaidTick
              plain={inline}
              checked={ticked}
              disabled={busy || locked}
              onChange={async (next) => {
                setBusy(true);
                setError("");
                try {
                  const { booking: updated } = await setLessonPaid(token, booking.id, next);
                  changed.current = true;
                  onChanged(next
                    ? "Marked as already paid. It won’t be charged, and it’s in Receipts as paid by hand."
                    : updated.payment_status === "scheduled"
                      ? `No longer marked paid. It’s charged to their card ${CHARGED}.`
                      : updated.payment_status === "recorded"
                        ? "No longer marked paid. It stays as a record only."
                        : updated.payment_status === "free"
                          ? "No longer marked paid. It’s free."
                          : "No longer marked paid. It’s to be paid to you directly.");
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "This lesson couldn’t be updated.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
          {booking.status !== "cancelled" && (canMarkAttendance || noShowLater) ? (
            <div className="teacher-no-show">
              {/* Short enough to sit beside Already paid on a phone; marked,
                  it reads as ticked, as that does. */}
              <button
                aria-describedby={noShowLater ? noShowHintId : undefined}
                aria-label={noShow ? "Undo no-show" : "Mark no-show"}
                className={`paid-tick ${inline ? "paid-tick--plain" : "paid-tick--action"}${noShow ? " is-checked" : ""}`}
                type="button"
                disabled={busy || !canMarkAttendance || locked}
                onClick={() => setAction("no-show")}
              >
                <span aria-hidden="true" className="paid-tick__dab">
                  {inline ? noShow ? <Check size={13} strokeWidth={3.4} /> : null : <UserX size={13} strokeWidth={2.6} />}
                </span>
                No-show
              </button>
              {noShowLater ? (
                <p className="teacher-no-show__hint" id={noShowHintId}>
                  Available {formatSlotTime(booking.starts_at)}–{formatSlotTime(noShowCloses.toISOString())}
                </p>
              ) : null}
            </div>
          ) : null}
          </div> : null}
          {!ticked && addedByTeacher(booking) && booking.status === "confirmed" &&
            booking.payment_status === "not_required" && !noShow && !locked && !booking.charge_started_at && Boolean(booking.amount_cents && booking.amount_cents > 0) ? (
            <CardApprovalLink booking={booking} token={token} busy={busy} onBusy={setBusy} onError={setError} quiet={inline} />
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
      {booking.status === "cancelled" && action === "view" ? <div className="teacher-dialog-actions">
        {canRecordRefund ? <button className={routine("button button--coral")} type="button" onClick={() => setAction("refund")}>Record refund</button> : null}
        <button className={routine("button button--outline")} type="button" onClick={onClose}>Done</button>
      </div> : action === "view" ? (
        <div className="teacher-dialog-actions">
          {booking.student_id ? <button className={routine("button button--lilac")} type="button" disabled={busy} onClick={() => setAction("homework")}>Homework</button> : null}
          <button
            className={routine("button button--coral")}
            type="button"
            disabled={busy || locked}
            onClick={() => setAction("move")}
          >
            Move lesson
          </button>
          {toCome && booking.lesson_type_id !== "trial" ? (
            <button
              className={routine("button button--outline")}
              type="button"
              disabled={busy || locked}
              onClick={() => {
                // Weekly, she most likely means every week from here.
                setFollowing(repeats);
                setAction("length");
              }}
            >
              Change length
            </button>
          ) : null}
          <button
            className={routine("button button--outline")}
            type="button"
            disabled={busy || locked}
            onClick={() => {
              setFollowing(false);
              setAction("cancel");
            }}
          >
            Cancel lesson
          </button>
        </div>
      ) : action === "homework" ? <div className="teacher-dialog-homework">
        {backToLesson}
        <TeacherHomework bookingId={booking.id} token={token} onBusy={setBusy} />
      </div> : (
        <div className="teacher-dialog-confirmation">
          {action === "length" ? (
            <form
              className="teacher-form teacher-length-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform();
              }}
            >
              <h3>Change length</h3>
              {repeats ? <WeekChoice verb="Change" following={following} disabled={busy} onChange={setFollowing} /> : null}
              {/* Each length with what this student pays for it, as her lesson form shows them. */}
              <fieldset className="teacher-manual-choice">
                <legend>Length</legend>
                <div className={`segmented${length === "long" ? " segmented--second" : ""}`}>
                  <span aria-hidden="true" className="segmented__thumb" />
                  {([["single", 60], ["long", 90]] as const).map(([value, mins]) => (
                    <label className={length === value ? "is-active" : ""} key={value}>
                      <input
                        aria-label={`${mins} mins, ${formatPriceCents(priceFor(student, mins))}`}
                        checked={length === value}
                        disabled={busy}
                        name="teacher-lesson-length"
                        onChange={() => setLength(value)}
                        type="radio"
                        value={value}
                      />
                      <span>{mins} mins</span>
                      <span className="teacher-manual-price">{formatPriceCents(priceFor(student, mins))}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <ul className="booking-payment-facts teacher-confirm-facts">
                {lengthChanging.length ? (
                  <li>
                    {lengthChanging.length === 1
                      ? `${everyWeek ? `${shortDay(lengthChanging[0].starts_at)} becomes` : "Becomes"} ${lengthMinutes} minutes at the same time, ${formatPriceCents(lengthCents)}`
                      : `${lengthChanging.length} lessons, ${daySpan(lengthChanging)}, become ${lengthMinutes} minutes at the same times, ${formatPriceCents(lengthCents)} each`}
                  </li>
                ) : (
                  <li>{lengthKept.length ? "Nothing to change" : `${everyWeek ? "These lessons are" : "This lesson is"} already ${lengthMinutes} minutes`}</li>
                )}
                {lengthKept.length ? <li>{keptLine(lengthKept).trim().replace(/\.$/, "")}</li> : null}
                {lengthChanging.length ? (
                  <li>{awaiting ? `${firstName} isn’t emailed until ${noEmail ? "you add their email and send" : "you send"} their welcome` : `${firstName} gets one email with the change`}</li>
                ) : null}
              </ul>
              <div className="teacher-dialog-actions">
                <button className="button button--coral" type="submit" disabled={busy || !lengthChanging.length}>
                  {busy ? "Saving…" : "Save length"}
                </button>
                {backToLesson}
              </div>
            </form>
          ) : action === "move" ? (
            <>
              {/* Headed as Cancel this lesson? is, with what happens as a dab. */}
              <h3>Move this lesson</h3>
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
                  <span>Time in {TUTOR_CITY}</span>
                  <input
                    type="time"
                    required
                    disabled={busy}
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </label>
                <ul className="booking-payment-facts teacher-confirm-facts">
                  <li>{recorded ? "This past lesson stays a record only; no email is sent" : awaiting ? `${firstName} isn’t emailed until ${noEmail ? "you add their email and send" : "you send"} their welcome` : `${firstName} gets an email with the new time`}</li>
                </ul>
                <div className="teacher-dialog-actions">
                  <button
                    className="button button--coral"
                    type="submit"
                    disabled={busy || unchanged}
                  >
                    {busy ? "Moving…" : "Save new time"}
                  </button>
                  {backToLesson}
                </div>
              </form>
            </>
          ) : (
            <>
              <h3>
                {action === "refund" ? "Record a refund made by hand?" : action === "cancel"
                  ? everyWeek ? "Cancel these lessons?" : "Cancel this lesson?"
                  : noShow
                    ? "Remove the no-show?"
                    : "Mark as a no-show?"}
              </h3>
              {action === "cancel" && repeats ? <WeekChoice verb="Cancel" following={following} disabled={busy} onChange={setFollowing} /> : null}
              <ul className="booking-payment-facts teacher-confirm-facts">
                {action === "cancel" && everyWeek ? <>
                  <li>{later.length} lessons, {daySpan(later)}</li>
                  <li>{awaiting
                    ? `${firstName} isn’t emailed: they haven’t had their welcome yet`
                    : `${firstName} gets one email listing them, with an update for their calendar`}</li>
                  {later.some(paidByHand) ? <li>Refund {firstName} directly for any paid to you by hand</li> : null}
                  {later.some(lesson => lesson.payment_status === "paid") ? <li>{firstName} is refunded in full, automatically</li> : null}
                  {later.some(lesson => lesson.payment_status === "scheduled") ? <li>Nothing is charged to {firstName}’s card</li> : null}
                  <li>They come off your calendar, and no more weeks are added</li>
                </> : action === "refund" ? <>
                  <li>You have already refunded {firstName} directly</li>
                  <li>Recording it sends no payment or email</li>
                </> : action === "cancel" ? (
                  <>
                    <li>
                      {recorded
                        ? "This past lesson stays a record only; no email is sent"
                        : awaiting
                        ? `${firstName} isn’t emailed: they haven’t had their welcome yet`
                        : `${firstName} gets an email saying you’ve cancelled, with an update for their calendar`}
                    </li>
                    {ticked ? (
                      <li>Refund {firstName} directly for the payment made by hand</li>
                    ) : booking.payment_status === "paid" ? (
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
              {action === "cancel" && !awaiting && !recorded ? (
                <div className="teacher-form teacher-cancel-message">
                  <label htmlFor={cancelMessageId}>
                    <span>Add a message to the email <span className="teacher-field-optional">(optional)</span></span>
                    <textarea
                      id={cancelMessageId}
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
                    : action === "refund" ? "Yes, record refund" : action === "cancel"
                      ? everyWeek ? `Yes, cancel ${later.length} lessons` : "Yes, cancel lesson"
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
    </>
  );

  if (inline) {
    return (
      <section
        aria-label={`${booking.student_name}’s lesson, ${shortDay(booking.starts_at)}, ${formatSlotTime(booking.starts_at)}–${formatSlotTime(booking.ends_at)}`}
        className="teacher-lesson-dialog teacher-lesson-dialog--inline"
        onKeyDown={event => { if (event.key === "Escape" && action === "view" && !busy) onClose(); }}
        ref={panelRef}
        tabIndex={-1}
      >
        {head}
        {main}
      </section>
    );
  }
  return (
    <dialog
      className={`teacher-lesson-dialog${action === "homework" ? " teacher-lesson-dialog--homework" : ""}`}
      ref={dialogRef}
      {...backdropHandlers}
      aria-labelledby="teacher-lesson-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {head}
      {main}
    </dialog>
  );
}
