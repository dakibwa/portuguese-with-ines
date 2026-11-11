"use client";

import { X } from "lucide-react";
import { IN_PERSON } from "@/lib/tutor";
import { Fragment, type MouseEvent, type ReactNode } from "react";
import type { AdminBooking, AdminStudent } from "@/lib/admin-api";
import { formatBookedLessonLabel, formatMoneyCents, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel, type NeedsYouItem } from "@/lib/teacher-calendar";

const SHOWN = 3;

const day = (at: string) => dateLabel(dateKey(new Date(at)), { weekday: "short", day: "numeric", month: "short" });
const range = (booking: AdminBooking) => `${formatSlotTime(booking.starts_at)}–${formatSlotTime(booking.ends_at)}`;
const place = (booking: AdminBooking) => (booking.location === "porto" ? IN_PERSON : "Online");
/** Each fact whole; a line breaks only after a dot, never inside a fact or before its dot. */
const facts = (...parts: (ReactNode | false | undefined)[]) => parts.filter(Boolean).map((part, index) =>
  <Fragment key={index}>{index ? "\u00a0· " : ""}<span className="teacher-needs-you__keep">{part}</span></Fragment>);

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
 * 2026): each card says what happened and when, and has an action only when
 * there is something for her to do; one that only tells her something says it
 * all and has just a cross (11 November 2026, Dan: "I don't even think the
 * button for view is needed is it? the details are in it?"). The action and
 * cross end the first line, and inside a student's own card the name is not
 * said again. The choosing and the windows live in needsYou(); this only
 * words and renders them.
 */
export function NeedsYou({ items, sending, onMeet, onWelcome, onStudent, onDismiss, onSeeAll, embedded = false, heading = "Needs you" }: {
  items: NeedsYouItem[];
  /** The student whose welcome is on its way. */
  sending: string;
  onMeet: () => void;
  onWelcome: (student: AdminStudent, again?: boolean) => void;
  onStudent: (student: AdminStudent) => void;
  onDismiss: (key: string) => void;
  /** The Timetable shows only the first few notices. */
  onSeeAll?: () => void;
  embedded?: boolean;
  heading?: string;
}) {
  if (!items.length) return null;

  function studentAction(student: AdminStudent, next: "lessons" | "welcome") {
    if (next === "lessons") return <button className="button button--coral button--compact" type="button" onClick={() => onStudent(student)}>
      Add a lesson<span className="visually-hidden"> for {student.name}</span></button>;
    return <button className="button button--coral button--compact" type="button" disabled={Boolean(sending) || !student.email} onClick={() => onWelcome(student)}>
      {sending === student.id ? "Sending…" : "Send welcome email"}<span className="visually-hidden"> to {student.name}</span>
    </button>;
  }

  /** Gone at once; focus moves to the next notice, else the one before, else the card. */
  function dismiss(key: string, event: MouseEvent<HTMLButtonElement>) {
    const notice = event.currentTarget.closest("li");
    const list = notice?.parentElement;
    const at = list ? Array.prototype.indexOf.call(list.children, notice) : -1;
    const card = notice?.closest<HTMLElement>("[data-student-id]")?.dataset.studentId;
    onDismiss(key);
    requestAnimationFrame(() => {
      const near = list?.isConnected ? (list.children[at] ?? list.children[at - 1]) : null;
      const home = card
        ? Array.from(document.querySelectorAll<HTMLElement>("[data-student-id]")).find(entry => entry.dataset.studentId === card)?.querySelector<HTMLElement>(".teacher-setup__profile")
        : document.getElementById("teacher-week-title");
      (near?.querySelector<HTMLElement>("button, a") ?? home)?.focus({ preventScroll: true });
    });
  }

  function card(item: NeedsYouItem) {
    // Said whole for a screen reader; inside their card the name is already above.
    let full = "";
    let who = "";
    let detail: ReactNode = "";
    let action: ReactNode = null;
    // A first lesson's note is said in the notice, so nothing needs opening.
    let note = "";

    if (item.kind === "meet") {
      who = full = item.reconnect ? "Google Meet needs reconnecting" : "Google Meet isn’t connected";
      detail = item.reconnect ? "Until then, new lessons get no Meet link" : "Until then, online lessons get no Meet link";
      action = (
        <button className="teacher-quiet" type="button" onClick={onMeet}>
          {item.reconnect ? "Reconnect" : "Connect"}<span className="visually-hidden"> Google Meet</span>
        </button>
      );
    } else if (item.kind === "payment") {
      const { review, part } = item;
      const name = review.student_name;
      const what = part === "lesson" ? "payment" : part === "fee" ? "late change fee" : "refund";
      full = name ? `${name}’s ${what} needs checking` : "A payment needs checking";
      who = embedded ? `${what[0].toUpperCase()}${what.slice(1)} needs checking` : full;
      // A reference is read and quoted whole, so it never breaks at its hyphen.
      detail = facts(Number.isFinite(Date.parse(review.starts_at ?? "")) && `Lesson on ${day(review.starts_at!)}, ${formatSlotTime(review.starts_at!)}`, review.reference);
      action = (
        <a
          className="teacher-quiet"
          href={stripeHref(part === "fee" ? review.same_day_fee_payment_intent : review.stripe_payment_intent)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Stripe<span className="visually-hidden"> for {review.reference}</span>
        </a>
      );
    } else if (item.kind === "declined") {
      // Was an email to her until 16 October 2026; the student has their secure payment link.
      const { student, payment } = item;
      const what = payment.part === "fee" ? "late change fee" : payment.part === "no-show" ? "no-show fee" : "lesson payment";
      full = `${student.name}’s card didn’t go through`;
      who = embedded ? "Card didn’t go through" : full;
      detail = facts(
        payment.amountCents != null && `${formatMoneyCents(payment.amountCents)} ${what}`,
        Number.isFinite(Date.parse(payment.startsAt)) && `lesson on ${day(payment.startsAt)}, ${formatSlotTime(payment.startsAt)}`,
        "they’ve been sent a payment link",
        payment.reference,
      );
      action = <button className="teacher-quiet" type="button" onClick={() => onStudent(student)}>
        Open<span className="visually-hidden"> {student.name}</span>
      </button>;
    } else if (item.kind === "card") {
      // Never charge twice (12 October 2026): a lesson already paid by hand comes off the card from its details.
      const { student, added } = item;
      const count = added.lessons.length;
      full = `${student.name} added a card`;
      who = embedded ? "Added a card" : full;
      detail = count
        ? `${count} ${count === 1 ? "lesson" : "lessons"} you added ${count === 1 ? "is" : "are"} now charged after each one. Paid by hand? Open it and tick “Already paid”`
        : "Lessons you add are now charged to it after each one";
      // Only lessons she may have been paid for by hand give her something to do.
      action = count ? <button className="teacher-quiet" type="button" onClick={() => onStudent(student)}>
        See lessons<span className="visually-hidden"> for {student.name}</span>
      </button> : null;
    } else if (item.kind === "lessons") {
      who = full = `${item.student.name} has no lessons yet`;
      detail = "Add a lesson or their weekly lessons";
      action = studentAction(item.student, "lessons");
    } else if (item.kind === "welcome") {
      const { student } = item;
      who = full = `${student.name} hasn’t been emailed yet`;
      detail = item.at ? `Next lesson ${day(item.at)}, ${formatSlotTime(item.at)}` : "Their details are ready for their welcome";
      action = studentAction(student, "welcome");
    } else if (item.kind === "changed") {
      const { booking, count } = item;
      full = `${booking.student_name} changed their ${count > 1 ? "weekly lessons" : "lesson"}`;
      who = embedded ? `Changed their ${count > 1 ? "weekly lessons" : "lesson"}` : full;
      detail = count > 1
        ? facts(`${count} from ${day(booking.starts_at)}`, range(booking), place(booking), was(booking), item.first && "first lesson")
        : facts(day(booking.starts_at), range(booking), place(booking), was(booking), item.first && "first lesson");
    } else if (item.kind === "cancelled") {
      const { booking, count } = item;
      full = `${booking.student_name} cancelled their ${count > 1 ? "weekly lessons" : "lesson"}`;
      who = embedded ? `Cancelled their ${count > 1 ? "weekly lessons" : "lesson"}` : full;
      // The time is open again; the notice says all there is to know.
      detail = count > 1
        ? facts(`${count} from ${day(booking.starts_at)}`, range(booking))
        : facts(day(booking.starts_at), range(booking), place(booking));
    } else {
      const { booking } = item;
      full = `${booking.student_name}’s first lesson`;
      who = embedded ? "First lesson" : full;
      detail = facts(day(booking.starts_at), range(booking), lessonLength(booking), place(booking));
      note = booking.notes?.trim() ?? "";
    }

    const dismissKey = "dismiss" in item ? item.dismiss : "";
    return (
      <li className="teacher-lesson-card teacher-notice" key={item.key}>
        {/* First, so they float at the end of the first line and the words
            flow round them: the facts take the full width once past them. */}
        {action || dismissKey ? <span className="teacher-notice__actions">
          {action}
          {dismissKey ? <button className="teacher-icon-button teacher-notice__dismiss" type="button" aria-label={`Dismiss: ${full}`} title="Dismiss" onClick={event => dismiss(dismissKey, event)}>
            <X size={15} aria-hidden="true" />
          </button> : null}
        </span> : null}
        <strong className="teacher-notice__title">{who}</strong>
        <span className="teacher-notice__facts">{detail}</span>
        {note ? <span className="teacher-notice__note"><span>Their note</span> {note}</span> : null}
      </li>
    );
  }

  if (embedded) return <ul className="teacher-lesson-cards teacher-student-notices">{items.map(card)}</ul>;

  return <div className="teacher-needs-you">
    <section aria-label={heading}>
      <h2 className="teacher-eyebrow">{heading}</h2>
      <ul className="teacher-lesson-cards">{(onSeeAll ? items.slice(0, SHOWN) : items).map(card)}</ul>
      {onSeeAll && items.length > SHOWN ? <button className="teacher-quiet teacher-needs-you__all" onClick={onSeeAll} type="button">See all in Students</button> : null}
    </section>
  </div>;
}
