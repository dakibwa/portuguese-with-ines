"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AdminBooking } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel, shiftDate } from "@/lib/teacher-calendar";
import { restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";

/** A holiday is taken in one go; anything longer is several. */
export const TIME_OFF_MAX_DAYS = 92;

export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to && dates.length < TIME_OFF_MAX_DAYS; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

function shortDate(date: string) {
  return dateLabel(date, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Time off for a holiday, from one date to another, in one go rather than a
 * day at a time across several weeks (12 October 2026, at Dan's request).
 * Lessons already booked in that time are named, and stay booked: she moves
 * or cancels them herself, so nothing a student booked disappears unasked.
 * When every day chosen is already off, the same dialog reopens them.
 */
export function TimeOffDialog({
  today,
  bookings,
  isDayOff,
  onClose,
  onConfirm,
}: {
  today: string;
  bookings: AdminBooking[];
  isDayOff: (date: string) => boolean;
  onClose: () => void;
  onConfirm: (from: string, to: string, off: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const backdropHandlers = useDialogBackdrop(onClose);

  useLayoutEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      dialog?.close();
      releaseScroll();
      restoreDialogFocus(previous);
    };
  }, []);

  const valid = Boolean(from && to) && from >= today && to >= from;
  const dates = valid ? datesBetween(from, to) : [];
  const tooLong = valid && shiftDate(from, TIME_OFF_MAX_DAYS - 1) < to;
  const reopen = dates.length > 0 && dates.every(isDayOff);
  const booked = valid
    ? bookings
        .filter((booking) => {
          if (booking.status !== "confirmed") return false;
          const day = dateKey(new Date(booking.starts_at));
          return day >= from && day <= to;
        })
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    : [];

  return (
    <dialog
      className="teacher-lesson-dialog teacher-timeoff-dialog"
      ref={dialogRef}
      {...backdropHandlers}
      aria-labelledby="teacher-timeoff-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button className="teacher-dialog-close" type="button" aria-label="Close" onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
      <h2 id="teacher-timeoff-title">Take time off</h2>
      <p className="teacher-timeoff-lead">
        Students can&rsquo;t book any of these days. Lessons already booked stay
        until you move or cancel them.
      </p>
      <form
        className="teacher-form teacher-timeoff-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || tooLong) return;
          onConfirm(from, to, !reopen);
        }}
      >
        <label>
          <span>From</span>
          <input
            type="date"
            required
            min={today}
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              if (event.target.value && (!to || to < event.target.value)) setTo(event.target.value);
            }}
          />
        </label>
        <label>
          <span>Until (and including)</span>
          <input
            type="date"
            required
            min={from || today}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <p className="teacher-timeoff-summary" aria-live="polite">
          {!valid
            ? "Choose the first and last day."
            : tooLong
              ? `That’s more than ${TIME_OFF_MAX_DAYS} days. Take it in two parts.`
              : dates.length === 1
                ? `${dateLabel(from)}, 1 day.`
                : `${shortDate(from)} to ${shortDate(to)}, ${dates.length} days.`}
        </p>
        {booked.length && !reopen && !tooLong ? (
          <div className="teacher-timeoff-booked" role="status">
            <p>
              {booked.length === 1 ? "1 lesson is" : `${booked.length} lessons are`} booked in that
              time. {booked.length === 1 ? "It stays" : "They stay"} booked:
            </p>
            <ul>
              {booked.map((booking) => (
                <li key={booking.id}>
                  {booking.student_name}, {shortDate(dateKey(new Date(booking.starts_at)))},{" "}
                  {formatSlotTime(booking.starts_at)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="teacher-timeoff-actions">
          <button className="button button--coral" type="submit" disabled={!valid || tooLong}>
            {reopen ? (dates.length === 1 ? "Reopen this day" : "Reopen these days") : dates.length === 1 ? "Take this day off" : "Take these days off"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
