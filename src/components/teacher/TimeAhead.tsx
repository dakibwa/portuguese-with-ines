"use client";

import { useMemo } from "react";
import type { AdminBooking, AvailabilityException, OnlineOnlyPeriod } from "@/lib/admin-api";
import { shiftDate, timeAhead, timeOffClashes } from "@/lib/teacher-calendar";
import { BookedLessonCard } from "@/components/teacher/BookedLessonCard";

/** Stretches shown, beyond which `And 3 more later on` stands for the rest. */
const SHOWN = 4;

/**
 * What the Time off month used to show beside it, under the week instead
 * (11 November 2026, Dan: one tab): `Clashes`, the booked lessons to come her
 * time off or online-only hours leave standing, each opening its lesson; and
 * `Coming up`, what she has set that is not on the week in view, each
 * turning the Timetable to its week. Each is left out when it is empty.
 */
export function TimeAhead({ bookings, exceptions, onlineOnly, now, today, weekStart, onOpenBooking, onGoTo }: {
  bookings: AdminBooking[];
  exceptions: AvailabilityException[];
  onlineOnly: OnlineOnlyPeriod[];
  now: Date;
  today: string;
  weekStart: string;
  onOpenBooking: (booking: AdminBooking) => void;
  onGoTo: (date: string) => void;
}) {
  const clashes = useMemo(() => timeOffClashes(bookings, exceptions, onlineOnly, now), [bookings, exceptions, onlineOnly, now]);
  const weekEnd = shiftDate(weekStart, 6);
  const ahead = useMemo(() => timeAhead(exceptions, onlineOnly, today)
    .filter(row => row.dates[0] > weekEnd || row.dates.at(-1)! < weekStart), [exceptions, onlineOnly, today, weekStart, weekEnd]);
  if (!clashes.length && !ahead.length) return null;
  return (
    <div className="teacher-ahead">
      {clashes.length ? (
        <section className="teacher-ahead__clashes" aria-labelledby="teacher-clashes-title">
          <h3 className="teacher-eyebrow" id="teacher-clashes-title">Clashes</h3>
          <ul className="teacher-lesson-cards">
            {clashes.map(({ booking, reason }) => <BookedLessonCard booking={booking} disabled={false} key={booking.id} note={reason} onOpen={onOpenBooking} />)}
          </ul>
        </section>
      ) : null}
      {ahead.length ? (
        <section className="teacher-ahead__upcoming" aria-labelledby="teacher-upcoming-title">
          <h3 className="teacher-eyebrow" id="teacher-upcoming-title">Coming up</h3>
          <ul>
            {ahead.slice(0, SHOWN).map(row => (
              <li key={`${row.dates[0]} ${row.detail}`}>
                <button aria-label={`${row.label}, ${row.detail}`} onClick={() => onGoTo(row.dates[0])} type="button">
                  <strong>{row.label}</strong>
                  <span>{row.detail}</span>
                </button>
              </li>
            ))}
          </ul>
          {ahead.length > SHOWN ? <p className="teacher-ahead__more">And {ahead.length - SHOWN} more later on</p> : null}
        </section>
      ) : null}
    </div>
  );
}
