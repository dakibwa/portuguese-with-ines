"use client";

import type { AdminBooking } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

/**
 * A booked lesson in her way (13 October 2026, Dan): new weekly hours that
 * leave it outside, or time off and online-only days it clashes with. Who and when, and Change,
 * which opens the lesson itself so she can move or cancel it there. Nothing
 * here changes the lesson on its own.
 */
export function BookedLessonCard({ booking, disabled, note, onOpen }: {
  booking: AdminBooking;
  disabled: boolean;
  /** Why it is in her way, in a word or two: `day off`. */
  note?: string;
  onOpen: (booking: AdminBooking) => void;
}) {
  const day = dateLabel(dateKey(new Date(booking.starts_at)), { weekday: "short", day: "numeric", month: "short" });
  return (
    <li className="teacher-lesson-card">
      <span className="teacher-lesson-card__who">
        <strong>{booking.student_name}</strong>
        <span>{day} · <span className="teacher-lesson-card__time">{formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}</span>{note ? ` · ${note}` : ""}</span>
      </span>
      <button
        className="teacher-quiet"
        type="button"
        disabled={disabled}
        aria-label={`Change lesson for ${booking.student_name} on ${day}`}
        onClick={() => onOpen(booking)}
      >
        Change
      </button>
    </li>
  );
}
