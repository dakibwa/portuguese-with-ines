"use client";

import { useState, type ReactNode } from "react";
import { StudentSetupRow } from "@/components/teacher/StudentSetupRow";
import type { AdminBooking, AdminStudent } from "@/lib/admin-api";
import { formatBookedLessonLabel, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel, type NeedsYouItem, type StudentSetup, type StudentSetupStep } from "@/lib/teacher-calendar";

const SHOWN = 3;

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
export function NeedsYou({ items, sending, onMeet, onView, onWelcome, onStudent, onSeeAll, setup = [], token = "", onChanged }: {
  items: NeedsYouItem[];
  /** The student whose welcome is on its way. */
  sending: string;
  onMeet: () => void;
  onView: (booking: AdminBooking) => void;
  onWelcome: (student: AdminStudent, again?: boolean) => void;
  onStudent: (student: AdminStudent, editDetails?: boolean) => void;
  /** With this action it is the Timetable strip; otherwise the full tab. */
  onSeeAll?: () => void;
  setup?: StudentSetup[];
  token?: string;
  onChanged?: (student?: AdminStudent) => void;
}) {
  const [expanded, setExpanded] = useState<{ studentId: string; step: StudentSetupStep } | null>(null);
  const [busyStudent, setBusyStudent] = useState("");
  if (!items.length && onSeeAll) return null;

  function studentAction(student: AdminStudent, next: StudentSetup["next"]) {
    if (next === "email" || next === "lessons") return <button className="button button--coral button--compact" disabled={Boolean(busyStudent)} type="button" onClick={() => {
      if (!onSeeAll) setExpanded({ studentId: student.id, step: next });
      else onStudent(student, next === "email");
    }}>{next === "email" ? "Add email" : "Add a lesson"}<span className="visually-hidden"> for {student.name}</span></button>;
    const again = next !== "welcome";
    return <button className={`button button--${again ? "lilac" : "coral"} button--compact`} type="button" disabled={Boolean(sending) || Boolean(busyStudent) || !student.email} onClick={() => onWelcome(student, again)}>
      {sending === student.id ? "Sending…" : again ? "Send the link again" : "Send welcome email"}<span className="visually-hidden"> to {student.name}</span>
    </button>;
  }

  function card(item: NeedsYouItem) {
    let who = "";
    let detail: ReactNode = "";
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
      // A reference is read and quoted whole, so it never breaks at its hyphen.
      const when = Number.isFinite(Date.parse(review.starts_at ?? "")) ? `Lesson on ${day(review.starts_at!)}, ${formatSlotTime(review.starts_at!)}` : "";
      detail = <>{when}{when ? " · " : ""}<span className="teacher-needs-you__keep">{review.reference}</span></>;
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
    } else if (item.kind === "email") {
      who = `${item.student.name} needs an email address`;
      detail = "Their welcome waits for their email";
      action = studentAction(item.student, "email");
    } else if (item.kind === "lessons") {
      who = `${item.student.name} has no lessons yet`;
      detail = "Add a lesson or their weekly lessons";
      action = studentAction(item.student, "lessons");
    } else if (item.kind === "welcome") {
      const { student } = item;
      who = `${student.name} hasn’t been emailed yet`;
      detail = item.at ? `Next lesson ${day(item.at)}, ${formatSlotTime(item.at)}` : "Their details are ready for their welcome";
      action = studentAction(student, "welcome");
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
      // The time is open again; the cancelled lesson opens read-only.
      detail = count > 1
        ? facts(`${count} from ${day(booking.starts_at)}`, range(booking))
        : facts(day(booking.starts_at), range(booking), place(booking));
      action = view(booking);
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

  return (
    <div className={`teacher-needs-you${onSeeAll ? "" : " teacher-needs-you--full"}`}>
      <section aria-labelledby="teacher-needs-you-title">
        <h2 className="teacher-eyebrow" id="teacher-needs-you-title">{onSeeAll ? "Needs you" : "To do"}</h2>
        {items.length ? <ul className="teacher-lesson-cards">{(onSeeAll ? items.slice(0, SHOWN) : items).map(card)}</ul> : <p>Nothing needs you right now.</p>}
        {onSeeAll && items.length > SHOWN ? <button className="teacher-text-button" onClick={onSeeAll} type="button">See all in Needs you</button> : null}
      </section>
      {!onSeeAll && setup.length ? <section aria-labelledby="teacher-getting-started-title">
        <h2 className="teacher-eyebrow" id="teacher-getting-started-title">Getting started</h2>
        <ul className="teacher-setup-list">
          {setup.map(row => <StudentSetupRow
            key={row.student.id}
            locked={Boolean(busyStudent)}
            onBusy={busy => setBusyStudent(busy ? row.student.id : "")}
            onChanged={onChanged}
            onSelect={step => setExpanded(step ? { studentId: row.student.id, step } : null)}
            onWelcome={onWelcome}
            sending={sending}
            setup={row}
            step={expanded?.studentId === row.student.id ? expanded.step : null}
            token={token}
          />)}
        </ul>
      </section> : null}
    </div>
  );
}
