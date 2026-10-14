"use client";

import type { ReactNode } from "react";
import type { AdminBooking, AdminStudent } from "@/lib/admin-api";
import { formatBookedLessonLabel, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel, type NeedsYouItem } from "@/lib/teacher-calendar";

/** The cards shown before the rest fold under "n more". */
const SHOWN = 4;

const day = (at: string) => dateLabel(dateKey(new Date(at)), { weekday: "short", day: "numeric", month: "short" });
const range = (booking: AdminBooking) => `${formatSlotTime(booking.starts_at)}–${formatSlotTime(booking.ends_at)}`;
const place = (booking: AdminBooking) => (booking.location === "porto" ? "In Porto" : "Online");
const facts = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" · ");

/** A trial keeps its name; every other lesson reads as its length. */
function lessonLength(booking: AdminBooking) {
  return formatBookedLessonLabel({
    id: booking.lesson_type_id ?? "",
    name: booking.lesson_name,
    durationMinutes: Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000),
  });
}

/** Where a payment is looked up: its own page when the id is a real one, else the list. */
function stripeHref(intent?: string | null) {
  return intent && /^pi_[A-Za-z0-9]+$/.test(intent)
    ? `https://dashboard.stripe.com/payments/${intent}`
    : "https://dashboard.stripe.com/payments";
}

/** "was Wed 16 Sept, 09:00", only when the lesson really moved. */
function was(booking: AdminBooking) {
  const before = booking.previous_starts_at;
  if (!before || Date.parse(before) === Date.parse(booking.starts_at)) return "";
  return `was ${day(before)}, ${formatSlotTime(before)}`;
}

/**
 * What waits on her, said once, under her next lesson (Phase 2, 14 October
 * 2026): each card says what happened and when, with at most one action.
 * Every item clears itself, so nothing here is dismissed. The choosing and
 * the windows live in needsYou(); this only words and renders them.
 */
export function NeedsYou({ items, sending, onMeet, onView, onWelcome }: {
  items: NeedsYouItem[];
  /** The student whose welcome is on its way. */
  sending: string;
  onMeet: () => void;
  onView: (booking: AdminBooking) => void;
  onWelcome: (student: AdminStudent) => void;
}) {
  if (!items.length) return null;

  function card(item: NeedsYouItem) {
    let who = "";
    let detail = "";
    let action: ReactNode = null;
    const view = (booking: AdminBooking) => (
      <button className="button button--lilac button--compact" type="button" onClick={() => onView(booking)}>
        View<span className="visually-hidden"> {booking.student_name}’s lesson on {day(booking.starts_at)}</span>
      </button>
    );

    if (item.kind === "meet") {
      who = item.reconnect ? "Google Meet needs reconnecting" : "Google Meet isn’t connected";
      detail = item.reconnect ? "Until then, new lessons get no Meet link" : "Until then, online lessons get no Meet link";
      action = (
        <button className="button button--lilac button--compact" type="button" onClick={onMeet}>
          {item.reconnect ? "Reconnect" : "Connect"}<span className="visually-hidden"> Google Meet</span>
        </button>
      );
    } else if (item.kind === "payment") {
      const { review, part } = item;
      const name = review.student_name;
      who = !name ? "A payment needs checking"
        : part === "lesson" ? `${name}’s payment needs checking`
        : part === "fee" ? `${name}’s late change fee needs checking`
        : `${name}’s refund needs checking`;
      detail = facts(review.starts_at && `Lesson on ${day(review.starts_at)}, ${formatSlotTime(review.starts_at)}`, review.reference);
      action = (
        <a
          className="button button--lilac button--compact"
          href={stripeHref(part === "fee" ? review.same_day_fee_payment_intent : review.stripe_payment_intent)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Stripe<span className="visually-hidden"> for {review.reference}</span>
        </a>
      );
    } else if (item.kind === "welcome") {
      const { student } = item;
      who = `${student.name} hasn’t been emailed yet`;
      detail = `Next lesson ${day(item.at)}, ${formatSlotTime(item.at)}`;
      action = (
        <button className="button button--coral button--compact" type="button" disabled={sending === student.id} onClick={() => onWelcome(student)}>
          {sending === student.id ? "Sending…" : "Send welcome email"}
          <span className="visually-hidden"> to {student.name}</span>
        </button>
      );
    } else if (item.kind === "changed") {
      const { booking, count } = item;
      who = `${booking.student_name} changed their ${count > 1 ? "weekly lessons" : "lesson"}`;
      detail = count > 1
        ? facts(`${count} from ${day(booking.starts_at)}`, range(booking), place(booking), was(booking), item.first && "first lesson")
        : facts(day(booking.starts_at), range(booking), place(booking), was(booking), item.first && "first lesson");
      action = view(booking);
    } else if (item.kind === "cancelled") {
      const { booking, count } = item;
      who = `${booking.student_name} cancelled their ${count > 1 ? "weekly lessons" : "lesson"}`;
      // The time is already open to students again, so there is nothing to do.
      detail = count > 1
        ? facts(`${count} from ${day(booking.starts_at)}`, range(booking))
        : facts(day(booking.starts_at), range(booking), place(booking));
    } else {
      const { booking } = item;
      who = `${booking.student_name}’s first lesson`;
      detail = facts(day(booking.starts_at), range(booking), lessonLength(booking), place(booking), booking.notes?.trim() && "left a note");
      action = view(booking);
    }

    return (
      <li className="teacher-lesson-card" key={item.key}>
        <span className="teacher-lesson-card__who">
          <strong>{who}</strong>
          <span>{detail}</span>
        </span>
        {action}
      </li>
    );
  }

  const rest = items.slice(SHOWN);
  return (
    <section className="teacher-needs-you" aria-labelledby="teacher-needs-you-title">
      <p className="teacher-eyebrow" id="teacher-needs-you-title">Needs you</p>
      <ul className="teacher-lesson-cards">{items.slice(0, SHOWN).map(card)}</ul>
      {rest.length ? (
        <details className="teacher-hours-clashes-more">
          <summary>{rest.length} more</summary>
          <ul className="teacher-lesson-cards">{rest.map(card)}</ul>
        </details>
      ) : null}
    </section>
  );
}
