"use client";

import { HOMEWORK, IN_PERSON, TUTOR_CITY } from "@/lib/tutor";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { X, ArrowLeft, Check, CheckCircle2, CircleX, UserX } from "lucide-react";
import {
  addedByTeacher,
  canPutBack,
  cancelBookingAs,
  cancelFollowingAs,
  changeLesson,
  rescheduleBookingAs,
  paidByHand,
  recordRefundByHand,
  restoreBookingAs,
  setLessonPaid,
  setNoShow,
  type AdminBooking,
  type AdminStudent,
  type KeptLesson,
} from "@/lib/admin-api";
import { formatBookedLessonLabel, formatMoneyCents, formatPriceCents, formatShortDay, formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
import { NO_SHOW_WINDOW_HOURS_AFTER, SAME_DAY_FEE_LABEL } from "@/lib/config";

// When a card is charged, in the words the student reads (CardOnFile): at the
// lesson's end while the no-show window is nothing, after it once there is one.
const CHARGED = NO_SHOW_WINDOW_HOURS_AFTER ? "after the lesson" : "at the end of the lesson";
import { dateKey, dateLabel, shownAsAdded } from "@/lib/teacher-calendar";
import { AssetMark } from "@/components/BrandMarks";
import { studentMark } from "@/lib/student-marks";
import { MeetingLink } from "@/components/MeetingLink";
import { restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { TeacherHomework } from "@/components/homework/lazy";
import { PaidTick } from "@/components/teacher/PaidTick";
import { CardApprovalLink } from "@/components/teacher/CardApprovalLink";
import { priceFor } from "@/components/teacher/StudentPrice";
import { putBackMessage } from "@/components/teacher/PutBack";
import { lessonProducts } from "@/lib/lesson-products";

const trialPrice = lessonProducts.find((product) => product.id === "trial")?.priceCents ?? 0;

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
  /** `putBack`: the lesson she has just cancelled, which can still go back as it was. */
  onChanged: (message: string, putBack?: string) => void;
  /** What it opens on: the lesson, its refund, or (from the row's pencil) its change form. */
  initialAction?: "view" | "refund" | "change";
  /**
   * A modal dialog over the page, as her timetable opens a lesson, or the same
   * details laid out in place within a student's dashboard: no scrim, no page
   * scroll lock, no focus trap, and nothing else on the page closed.
   */
  presentation?: "dialog" | "inline";
  /** Inline, whether a change is being saved, so the page around it waits. */
  onBusy?: (busy: boolean) => void;
  /** Inline, the lesson's own date, status and level summary, shown first in the header so the date and controls flow together. */
  inlineHeading?: ReactNode;
};

/** "Tue 8 Dec", as her timetable names a day. */
function shortDay(startsAt: string) {
  return formatShortDay(startsAt);
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
 * One a card has paid, or with a payment due or going through, keeps its
 * length; a free one keeps it unless the new length is free too. Ticked
 * "Already paid" never holds her back (11 November 2026, Dan: "even if it's
 * already marked as paid Ines should be able to change it").
 */
function lengthHeld(lesson: AdminBooking, cents: number) {
  if (lesson.payment_status === "paid") return "it's already paid";
  if (lesson.payment_status === "payment_due") return "it has a payment due";
  if (lesson.payment_status === "processing" || lesson.charge_started_at) return "its payment is going through";
  if (lesson.payment_status === "free" && cents > 0) return "it's free";
  return "";
}

/** Why a lesson can't take her change, as the Worker decides it, or "". Only the Worker can see another lesson in the way. */
function changeHeld(lesson: AdminBooking, length: "single" | "long" | null, cents: number) {
  if (lesson.payment_status === "processing" || lesson.charge_started_at || lesson.same_day_fee_status === "processing") return "its payment is going through";
  if (!length || lesson.lesson_type_id === length) return "";
  return lesson.lesson_type_id === "trial" ? "it's a trial lesson" : lengthHeld(lesson, cents);
}

/**
 * Why a lesson already had can't take a new length or place, as the Worker
 * decides it, or "": only one with nothing on a card can (11 November 2026).
 */
function pastHeld(lesson: AdminBooking) {
  if (lesson.payment_status === "paid") return "it's already paid";
  if (lesson.payment_status === "payment_due") return "it has a payment due";
  if (lesson.payment_status === "processing" || lesson.charge_started_at) return "its payment is going through";
  if (lesson.payment_status === "free") return "it's free";
  if (lesson.payment_status === "scheduled") return "it's on their card";
  if (lesson.payment_status === "not_required" || lesson.payment_status === "recorded") return "";
  return "its payment is going through";
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
  inlineHeading,
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
  const [action, setAction] = useState<"view" | "change" | "cancel" | "no-show" | "homework" | "refund">(
    initialAction,
  );
  // Her one Change form starts on the lesson as it stands: when, how long,
  // where. Nothing is saved until one of them differs.
  const ownLength = booking.lesson_type_id === "long" ? "long" : "single";
  const [length, setLength] = useState<"single" | "long">(ownLength);
  const [place, setPlace] = useState<"online" | "porto">(booking.location);
  const [following, setFollowing] = useState(false);
  const [date, setDate] = useState(dateKey(new Date(booking.starts_at)));
  const [time, setTime] = useState(formatSlotTime(booking.starts_at));
  const timeMoves = Boolean(date && time) && (date !== dateKey(new Date(booking.starts_at)) || time !== formatSlotTime(booking.starts_at));
  const [cancelMessage, setCancelMessage] = useState("");
  const firstName = booking.student_name.split(" ")[0];
  // Set up by her and not welcomed yet: their emails are held.
  const held = Boolean(booking.student_awaiting_welcome);
  // Added by name alone: there is no address to welcome until she gives one.
  const noEmail = !booking.student_email;
  // Either way the site emails them nothing. One who signed in from her
  // invite is no longer held and still has no address, so nothing here may
  // promise them an email.
  const awaiting = held || noEmail;
  const emailedOnce = noEmail ? (held ? "you add their email and send their welcome" : "you add their email") : "you send their welcome";
  const notEmailed = held ? "they haven’t had their welcome yet" : "they have no email yet";
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
  const toCome = booking.status === "confirmed" && now < new Date(booking.starts_at);
  const repeats = toCome && later.length > 1;
  const everyWeek = following && repeats;
  const lengthMinutes = length === "long" ? 90 : 60;
  const lengthCents = priceFor(student, lengthMinutes);
  // One already had, a record included, is corrected as one to come is
  // changed, length and place too, while nothing is on a card (11 November
  // 2026, Dan); otherwise only its time, as before.
  const past = booking.status === "confirmed" && !toCome;
  const pastReason = past ? pastHeld(booking) : "";
  const editable = toCome || (past && !pastReason);
  const lengthOffered = editable && booking.lesson_type_id !== "trial";
  const lengthChanges = lengthOffered && length !== ownLength;
  const placeChanges = editable && place !== booking.location;
  const differs = (lesson: AdminBooking) => timeMoves || (lengthChanges && lesson.lesson_type_id !== length) || (placeChanges && lesson.location !== place);
  const changeScope = (everyWeek ? later : [booking]).filter(differs);
  const changing = changeScope.filter(lesson => !changeHeld(lesson, lengthChanges ? length : null, lengthCents));
  const changeKept = changeScope.filter(lesson => changeHeld(lesson, lengthChanges ? length : null, lengthCents))
    .map(lesson => ({ startsAt: lesson.starts_at, reason: changeHeld(lesson, lengthChanges ? length : null, lengthCents) }));
  // What will happen, a dab each: the first names how many, the rest say "They".
  const changeDabs = (() => {
    if (!editable || !changing.length) return [];
    const many = everyWeek ? changing.length : 0;
    const dabs: string[] = [];
    // "3 lessons move", then "They become"; for one lesson "Moves", "Becomes".
    const lead = (verb: string, verbs: string) => many > 1
      ? dabs.length ? `They ${verb}` : `${many} lessons ${verb}`
      : many && !dabs.length ? `1 lesson ${verbs}` : verbs.charAt(0).toUpperCase() + verbs.slice(1);
    if (timeMoves) {
      dabs.push(everyWeek
        ? `${lead("move", "moves")} to ${dateLabel(date, { weekday: "long" })}s at ${time}`
        : `Moves to ${dateLabel(date, { weekday: "short", day: "numeric", month: "short" })} at ${time}`);
    }
    if (lengthChanges) dabs.push(`${lead("become", "becomes")} ${lengthMinutes} minutes, ${formatPriceCents(lengthCents)}${many > 1 ? " each" : ""}`);
    if (placeChanges) dabs.push(`${lead("move", "moves")} ${place === "online" ? "online" : `to ${TUTOR_CITY}`}`);
    // The tick is hers and a change never takes it off (11 November 2026).
    if (lengthChanges && changing.some(paidByHand)) dabs.push(changing.length > 1 ? "Any marked as paid stay marked as paid" : "Stays marked as paid");
    return dabs;
  })();
  const changeDirty = timeMoves || lengthChanges || placeChanges;
  // Its price and how it is paid, one dab: "€25 · paid by card". A
  // cancelled lesson's money matters only if some moved. A record reads as
  // any lesson she added; one kept before records carried a price is at the
  // student's price for its length now, as the Worker asks for it.
  const cents = booking.amount_cents ?? (!recorded ? null
    : booking.lesson_type_id === "trial" ? trialPrice : priceFor(student, minutes >= 90 ? 90 : 60));
  const ticked = paidByHand(booking);
  const canRecordRefund = booking.status === "cancelled" && ticked && booking.payment_status !== "refunded";
  const puttable = canPutBack(booking, now.getTime());
  const paid = ticked && booking.payment_status !== "refunded" ? "paid to you by hand" : {
    paid: "paid by card",
    refunded: "refunded",
    payment_due: "payment due",
    processing: "payment processing",
    scheduled: `charged to their card ${CHARGED}`,
    pending: "waiting for their card",
    not_required: "to pay you directly",
    recorded: "to pay you directly",
    // Its price is €0, so "Free" alone says it.
    free: "free",
  }[booking.payment_status];
  // "Already paid" is offered wherever nothing has been charged or settled by
  // card: a lesson to come not yet charging, or one she recorded. Not on a free
  // lesson, which has nothing to pay, nor on one paid, due or charging by card.
  const tickable = booking.status === "confirmed" && (ticked || (booking.payment_status === "recorded" && cents !== 0) ||
    (["scheduled", "not_required"].includes(booking.payment_status) && !booking.charge_started_at));
  const money = booking.status === "cancelled" && !ticked && !["paid", "refunded"].includes(booking.payment_status)
    ? ""
    : cents ? `${formatMoneyCents(cents)} · ${paid}` : paid.charAt(0).toUpperCase() + paid.slice(1);
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
      // pressed to replace these, it stays there. The opener is hidden while
      // these are open, so focus returns once React has shown it again.
      const panel = panelRef.current;
      panel?.focus();
      return () => {
        queueMicrotask(() => {
          const active = document.activeElement;
          if (active && active !== document.body && !panel?.contains(active)) return;
          const container = afterChangeFocusRef.current;
          // Hiding the original opener can blur it before this effect mounts.
          // Find that same lesson after React reveals its compact row again.
          const opener = changed.current ? null : Array.from(container?.querySelectorAll<HTMLElement>("[data-lesson-id]") ?? [])
            .find(element => element.dataset.lessonId === booking.id);
          const target = changed.current ? container : opener ?? (previous?.isConnected && previous !== document.body ? previous : container);
          target?.focus({ preventScroll: true });
        });
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
  }, [afterChangeFocusRef, booking.id, inline]);

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

  async function putBack() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await restoreBookingAs(token, booking.id);
      changed.current = true;
      onChanged(putBackMessage(result.emailed, firstName));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That lesson couldn’t be put back.");
    } finally {
      setBusy(false);
    }
  }

  async function perform() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "change" && !editable) {
        // A lesson had with something on a card is corrected to another time, as before.
        const moved = await rescheduleBookingAs(
          token,
          booking.id,
          portoTimeToUtc(date, time, booking.starts_at),
        );
        changed.current = true;
        onChanged(moved.emailed === false ? "Lesson moved." : "Lesson moved. The student has been emailed the new time.");
      } else if (action === "change") {
        const result = await changeLesson(token, booking.id, {
          startAt: timeMoves ? portoTimeToUtc(date, time, booking.starts_at) : undefined,
          lessonType: lengthChanges ? length : undefined,
          expectedPriceCents: lengthChanges ? lengthCents : undefined,
          location: placeChanges ? place : undefined,
          following: everyWeek,
        });
        changed.current = true;
        onChanged(`${result.changed.length === 1 ? "Lesson changed." : `${result.changed.length} lessons changed.`}${keptLine(result.kept)}${result.emailed === false ? "" : " The student has been emailed."}`);
      } else if (action === "cancel" && everyWeek) {
        const result = await cancelFollowingAs(token, booking.id, awaiting ? "" : cancelMessage);
        changed.current = true;
        onChanged(`${result.cancelled.length === 1 ? "Lesson" : `${result.cancelled.length} lessons`} cancelled.${keptLine(result.kept)}${result.emailed === false ? "" : " The student has been emailed."}`);
      } else if (action === "cancel") {
        const cancelled = await cancelBookingAs(token, booking.id, awaiting ? "" : cancelMessage);
        changed.current = true;
        // A lesson with no money moved by its cancellation can go back as it was.
        const backable = canPutBack({ ...booking, status: "cancelled", cancelled_by: "teacher" }, now.getTime());
        onChanged(cancelled.emailed === false ? "Lesson cancelled." : "Lesson cancelled. The student has been emailed.", backable ? booking.id : undefined);
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
    <p className={`lesson-calendar__status${booking.status === "cancelled" ? " lesson-calendar__status--cancelled" : shownAsAdded(booking) ? " lesson-calendar__status--added" : ""}`}>
      {booking.status === "cancelled" ? <CircleX size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
      {booking.status === "cancelled" ? "Cancelled" : shownAsAdded(booking) ? "Added by you" : "Booked"}
    </p>
  );
  const closeButton = (
    // Inline it is the quiet cross that closes anything open in place, at the
    // row's end where the notes pencil was (10 November 2026).
    <button
      className={inline ? "teacher-pencil teacher-lesson-inline__close" : "teacher-dialog-close"}
      data-homework-exit
      type="button"
      aria-label="Close lesson details"
      title={inline ? "Close" : undefined}
      disabled={busy}
      onClick={onClose}
    >
      {inline ? <X size={15} strokeWidth={2.4} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
    </button>
  );
  // Set as a student's own lesson is (10 October 2026, at Dan's request): the
  // status, who, then when in bold with its length and place beneath, and the
  // actions side by side. Inline, the lesson's own row above already says who,
  // when and any exceptional status, so only its close and call link remain.
  const dialogHead = (
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
  // What happened, recorded side by side: paid by hand, and a no-show
  // (27 October 2026, Dan). Each of these and the payment link renders in one
  // place: below the facts in the timetable modal, in the top toolbar inline.
  const recordBlock = tickable || (booking.status !== "cancelled" && (canMarkAttendance || noShowLater)) ? (
    <div className="teacher-lesson-record">
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
    </div>
  ) : null;
  const approvalBlock = !ticked && addedByTeacher(booking) && booking.status === "confirmed" &&
    (booking.payment_status === "not_required" || recorded) && !noShow && !locked && !booking.charge_started_at && Boolean(cents && cents > 0) ? (
    <CardApprovalLink booking={booking} token={token} busy={busy} onBusy={setBusy} onError={setError} quiet={inline} />
  ) : null;
  // The default actions, rendered once: in the inline header beside the date,
  // and in the timetable modal beneath what happened. Both are the quiet chip
  // at their own width (10 November 2026, Dan: one way for each thing); the
  // modal's one filled button is its call.
  const homeworkTrigger = HOMEWORK && booking.student_id ? <button className="teacher-quiet teacher-lesson-homework" type="button" disabled={busy} onClick={() => setAction("homework")}>Homework</button> : null;
  // One way to change a lesson, as a student has, and one to cancel it
  // (10 November 2026, Dan). Each starts on This lesson.
  const defaultActions = (
    <>
      <button
        aria-label="Change lesson"
        className="teacher-quiet"
        type="button"
        disabled={busy || locked}
        onClick={() => {
          setFollowing(false);
          setDate(dateKey(new Date(booking.starts_at)));
          setTime(formatSlotTime(booking.starts_at));
          setLength(ownLength);
          setPlace(booking.location);
          setAction("change");
        }}
      >
        Change
      </button>
      <button
        aria-label="Cancel lesson"
        className="teacher-quiet"
        type="button"
        disabled={busy || locked}
        onClick={() => {
          setFollowing(false);
          setAction("cancel");
        }}
      >
        Cancel
      </button>
    </>
  );
  // Inline, the row's own line: the lesson's date, then what she does with it
  // as small buttons at their own width (beside the date where there is room,
  // beneath it on a phone), its call first, and the cross that closes it at
  // the row's end.
  const inlineHead = (
    <>
      <div className="teacher-lesson-inline__head">
        {inlineHeading}
        {action === "view" && booking.status !== "cancelled" ? (
          <div className="teacher-dialog-actions">
            {/* The call leads her actions as a pill their size, never a
                block on a row of its own (10 November 2026, Dan). */}
            <MeetingLink compact meetingUrl={booking.meeting_url} location={booking.location} status={booking.status} />
            {homeworkTrigger}
            {defaultActions}
            {recordBlock}
            {approvalBlock}
          </div>
        ) : null}
        {closeButton}
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
            {inline && booking.same_day_fee_status === "scheduled" ? <li>Change fee scheduled</li>
              : inline && booking.same_day_fee_status === "processing" ? <li>Change fee processing</li> : null}
            {awaiting ? <li>{noEmail ? `No email yet: add it from their details on Students${held ? ", then send their welcome" : ""}` : "Not emailed yet: send their welcome from Students"}</li> : null}
          </ul>
          {inline ? null : recordBlock}
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
      {/* A cancelled lesson's actions, if any: put back while it can go back
          as it was, and a refund made by hand; its close is the cross. */}
      {booking.status === "cancelled" && action === "view" ? canRecordRefund || puttable ? <div className="teacher-dialog-actions">
        {puttable ? <button className="teacher-quiet" type="button" disabled={busy} onClick={() => void putBack()}>Put it back</button> : null}
        {canRecordRefund ? <button className="teacher-quiet" type="button" disabled={busy} onClick={() => setAction("refund")}>Record refund</button> : null}
      </div> : null : action === "view" ? (
        inline ? null : <div className="teacher-dialog-actions">
          {homeworkTrigger}
          {defaultActions}
          {approvalBlock}
        </div>
      ) : action === "homework" ? <div className="teacher-dialog-homework">
        {backToLesson}
        <TeacherHomework bookingId={booking.id} token={token} onBusy={setBusy} />
      </div> : (
        <div className="teacher-dialog-confirmation">
          {action === "change" ? (
            <form
              className="teacher-form teacher-change-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform();
              }}
            >
              {/* The pressed Change names the step; what will happen is a dab. */}
              {repeats ? <WeekChoice verb="Change" following={following} disabled={busy} onChange={setFollowing} /> : null}
              <label>
                <span>Date</span>
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
              {lengthOffered ? (
                // Each length with what this student pays for it, as her lesson form shows them.
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
                          name={`teacher-lesson-length-${ids}`}
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
              ) : null}
              {editable ? (
                <fieldset className="teacher-manual-choice">
                  <legend>Where</legend>
                  <div className={`segmented${place === "porto" ? " segmented--second" : ""}`}>
                    <span aria-hidden="true" className="segmented__thumb" />
                    {([["online", "Online"], ["porto", IN_PERSON]] as const).map(([value, label]) => (
                      <label className={place === value ? "is-active" : ""} key={value}>
                        <input
                          checked={place === value}
                          disabled={busy}
                          name={`teacher-lesson-place-${ids}`}
                          onChange={() => setPlace(value)}
                          type="radio"
                          value={value}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <ul className="booking-payment-facts teacher-confirm-facts">
                {past && pastReason ? <>
                  <li>Length and place stay: {pastReason}</li>
                  <li>{recorded ? "No email is sent" : awaiting ? `${firstName} isn’t emailed until ${emailedOnce}` : `${firstName} gets an email with the new time`}</li>
                </> : past ? <>
                  {changeDabs.map(dab => <li key={dab}>{dab}</li>)}
                  {changeDirty && !changing.length ? <li>Nothing to change</li> : null}
                  {changeKept.length ? <li>{keptLine(changeKept).trim().replace(/\.$/, "")}</li> : null}
                  <li>No email is sent</li>
                </> : changeDirty ? <>
                  {changeDabs.map(dab => <li key={dab}>{dab}</li>)}
                  {!changing.length ? <li>Nothing to change</li> : null}
                  {changeKept.length ? <li>{keptLine(changeKept).trim().replace(/\.$/, "")}</li> : null}
                  {changing.length ? (
                    <li>{awaiting ? `${firstName} isn’t emailed until ${emailedOnce}` : `${firstName} gets one email with the change`}</li>
                  ) : null}
                </> : null}
              </ul>
              <div className="teacher-dialog-actions">
                <button className="button button--coral" type="submit" disabled={busy || !changeDirty || (editable && !changing.length)}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
                {backToLesson}
              </div>
            </form>
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
                    ? `${firstName} isn’t emailed: ${notEmailed}`
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
                        ? "No email is sent"
                        : awaiting
                        ? `${firstName} isn’t emailed: ${notEmailed}`
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
        {inlineHead}
        {main}
      </section>
    );
  }
  return (
    <dialog
      className={`teacher-lesson-dialog teacher-lesson-dialog--lesson${action === "homework" ? " teacher-lesson-dialog--homework" : ""}`}
      ref={dialogRef}
      {...backdropHandlers}
      aria-labelledby="teacher-lesson-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {dialogHead}
      {main}
    </dialog>
  );
}
