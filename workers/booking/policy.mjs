/**
 * The change policy, in one place.
 *
 * Since 21 September 2026 one 14-hour rule covers booking, moving and
 * cancelling: a student may book, move or cancel for free while the lesson is
 * at least `minimumNoticeHours` (14) elapsed hours away. Inside that window a
 * move or cancellation costs EUR 5, charged to the saved card. Elapsed hours
 * need no time zone, so the rule reads the same wherever the student is.
 *
 * Earlier bookings agreed to "free until the lesson's Porto calendar day". Dan
 * decided those are never charged more than they agreed: they pay the fee only
 * when both rules would charge. The card itself is still charged the lesson
 * price after the lesson (1 September 2026), once its no-show window below has
 * closed; only an older lesson that was already paid keeps the prepaid
 * lock/refund behaviour, inside the same window.
 */

import { DEFAULT_MINIMUM_NOTICE_HOURS } from "./availability.mjs";
import { dateKey, PORTO } from "./time.mjs";

/** The wording a booking made under the 14-hour rule consents to. */
export const PAYMENT_CONSENT_VERSION = "2026-09-21-fourteen-hours-v1";

/**
 * The wording a card saved from the student's own account consents to: every
 * lesson, including those Inês adds for them, charged after it ends, on the
 * same change and no-show terms (12 October 2026).
 */
export const STUDENT_CARD_CONSENT_VERSION = "2026-10-12-card-on-file-v1";

/**
 * Marks a lesson Inês has been paid for by hand (`payment_consent_version`):
 * never charged, never moved onto a card, never repriced, and in Receipts as
 * paid by hand. On a lesson to come it sits on `not_required`; on one she
 * recorded after it happened, on `recorded` (16 October 2026, "Already paid").
 */
export const PAID_BY_HAND_MARK = "paid-by-hand";

/**
 * How long after a lesson's scheduled end Inês can still record or undo a
 * no-show (Dan, 23 September 2026). A no-show turns the lesson price into the
 * EUR 5 fee, so the lesson's own charge waits until this has closed.
 */
export const NO_SHOW_WINDOW_HOURS = 6;

/** Wording that promised free changes until the lesson's Porto calendar day. */
const LESSON_DAY_CONSENT_VERSIONS = new Set(["2026-09-01-after-lesson-v1"]);

/** True when moving or cancelling now falls inside the fee window. */
export function isLateChange(row, now = new Date(), noticeHours = DEFAULT_MINIMUM_NOTICE_HOURS) {
  const start = new Date(row.starts_at);
  const late = start.getTime() - now.getTime() < noticeHours * 3600000;
  if (!LESSON_DAY_CONSENT_VERSIONS.has(row.payment_consent_version)) return late;
  return late && dateKey(now, PORTO) === dateKey(start, PORTO);
}

export function changePolicy(row, now = new Date(), noticeHours = DEFAULT_MINIMUM_NOTICE_HOURS) {
  const paid = row.payment_status === "paid";
  const scheduled = row.payment_status === "scheduled" || row.payment_status === "processing";
  // A free lesson has nothing to take a fee from and no card behind it
  // (16 October 2026): it can change as late as any other, with no fee.
  const free = row.payment_status === "free";
  const late = isLateChange(row, now, noticeHours);

  return {
    paid,
    scheduled,
    late,
    // A saved-card lesson can still move or cancel inside the window: that
    // action is what triggers the EUR 5 charge. Older already-paid lessons
    // retain their lock instead. Inês herself never consults this policy.
    feeApplies: !paid && !free && late,
    locked: paid && late,
    // Only money actually taken comes back.
    refundOnCancel: paid && !late
  };
}

/**
 * Split a recurring run for the destructive bulk action. Bulk cancellation
 * never applies the EUR 5 fee behind the scenes: an occurrence inside the fee
 * window stays booked and every later occurrence can go.
 */
export function planSeriesCancellation(rows, now = new Date(), noticeHours = DEFAULT_MINIMUM_NOTICE_HOURS) {
  const cancellable = [];
  const kept = [];

  for (const row of rows) {
    const policy = changePolicy(row, now, noticeHours);
    if (policy.late) kept.push(row);
    else cancellable.push({ row, refund: policy.refundOnCancel });
  }

  return { cancellable, kept };
}

/**
 * A duration change is also a price change. Legacy pay-in-person bookings and
 * future recurring lessons that have not charged yet can change safely. A paid
 * lesson would need a partial refund or a second charge, while a payment-due
 * lesson may already have a hosted Checkout Session for the old amount; neither
 * should be rewritten silently by the reschedule endpoint.
 */
export function lessonTypeChangeProblem(row, currentLessonType, nextLessonType) {
  if (currentLessonType.id === nextLessonType.id) return "";
  if (currentLessonType.id === "trial" || nextLessonType.id === "trial") {
    return "A trial lesson can't be changed into another lesson length. Choose a new date and time, or cancel it and book another lesson.";
  }

  // Paid to Inês by hand for this length: another length is hers to arrange.
  if (row.payment_consent_version === PAID_BY_HAND_MARK) {
    return "This lesson is already paid. To change its length, reply to your confirmation email and Inês will help.";
  }
  if (row.payment_status === "not_required" || row.payment_status === "scheduled") return "";
  // Allowed only onto another free length; the caller knows the new price.
  if (row.payment_status === "free") return "";
  if (row.payment_status === "paid") {
    return "This lesson is already paid. To change its length, cancel it for a refund and book the other length.";
  }
  if (row.payment_status === "payment_due") {
    return "This lesson already has a payment due. Pay or cancel it before choosing another lesson length.";
  }
  return "This lesson's length can't be changed while its payment is being processed.";
}

/** A future saved-card charge follows the newly chosen lesson price. */
export function amountAfterLessonTypeChange(row, nextLessonType) {
  return ["scheduled", "processing"].includes(row.payment_status)
    ? nextLessonType.price_cents
    : (row.amount_cents ?? null);
}
