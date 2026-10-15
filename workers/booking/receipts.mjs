/**
 * What Inês owes a fatura-recibo for, month by month (13 October 2026, Dan:
 * "create something that makes her automation as easy as possible"). Her
 * Receipts tab and her automation read the same lines from
 * `GET /admin/receipts?month=YYYY-MM`.
 *
 * One line per amount paid or to be paid: a lesson's own price (or the no-show
 * amount that replaced it) and, separately, a late change fee. Each line has a
 * stable `id`, so an automation can remember which it has issued. `ready` is
 * true once the money is in: charged to the card, or paid to her by hand for a
 * lesson that has happened.
 */

import { realEmail } from "./no-email.mjs";

const LESSON_STATES = {
  paid: "paid",
  refunded: "refunded",
  payment_due: "due",
  scheduled: "charging",
  processing: "charging"
};

const FEE_STATES = {
  paid: "paid",
  payment_due: "due",
  scheduled: "charging",
  processing: "charging"
};

function lessonLabel(row) {
  return row.lesson_type_id === "trial" ? "Trial lesson" : `${row.duration_minutes}-minute lesson`;
}

/** Receipt lines for bookings whose lesson starts in the month, oldest first. */
export function receiptLines(rows, now = new Date()) {
  const lines = [];
  for (const row of rows) {
    const ended = Date.parse(row.ends_at) <= now.getTime();
    const base = {
      reference: row.reference,
      lessonStartsAt: row.starts_at,
      studentName: row.student_name,
      studentEmail: realEmail(row.student_email),
      nif: row.student_nif || "",
      bookingId: row.id
    };
    const noShow = row.attendance_status === "no_show";
    let state = LESSON_STATES[row.payment_status] ?? null;
    let method = "card";
    // Nothing on a card: a lesson that happened was paid to her by hand,
    // unless she recorded it as still owed to her.
    if (row.payment_status === "not_required" && row.status === "confirmed" && ended && !noShow) {
      state = "paid";
      method = "by hand";
    }
    if (row.payment_status === "owed") {
      state = "due";
      method = "by hand";
    }
    // A free lesson has nothing to issue.
    if (row.amount_cents === 0 && method === "by hand") state = null;
    // A lesson still to come only counts once its money is in.
    if (state && !ended && state !== "paid" && state !== "refunded") state = null;
    // A cancelled lesson keeps only money that moved.
    if (row.status === "cancelled" && state !== "paid" && state !== "refunded") state = null;
    if (state) {
      lines.push({
        ...base,
        id: `${row.id}:lesson`,
        kind: noShow ? "no-show" : "lesson",
        label: noShow ? "No-show" : lessonLabel(row),
        amountCents: row.charged_cents ?? row.amount_cents ?? row.price_cents ?? null,
        method,
        state,
        ready: state === "paid",
        stripePaymentIntent: method === "card" ? row.stripe_payment_intent || "" : ""
      });
    }
    const feeState = FEE_STATES[row.same_day_fee_status] ?? null;
    if (feeState && row.same_day_fee_cents) {
      lines.push({
        ...base,
        id: `${row.id}:fee`,
        kind: "late-change-fee",
        label: "Late change fee",
        amountCents: row.same_day_fee_cents,
        method: "card",
        state: feeState,
        ready: feeState === "paid",
        stripePaymentIntent: row.same_day_fee_payment_intent || ""
      });
    }
  }
  return lines.sort((a, b) => a.lessonStartsAt.localeCompare(b.lessonStartsAt) || a.id.localeCompare(b.id));
}

/** "2026-10" for a Porto month, or null. */
export function receiptMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}
