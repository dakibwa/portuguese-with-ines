"use client";

import { Globe, UserRound } from "lucide-react";
import { addedByTeacher, type AdminBooking } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { meetingHref } from "@/components/MeetingLink";
import { GoogleMeetLogo } from "@/components/GoogleMeetLogo";
import { dateKey, dateLabel, shiftDate } from "@/lib/teacher-calendar";

/**
 * Her next lesson, or the one happening now, at the top of her schedule with
 * its call one press away (12 October 2026, at Dan's request: joining the
 * next call was the thing she did most, and it meant finding it on the week).
 * Nothing shows when nothing is booked ahead.
 */
export function NextLesson({
  bookings,
  now,
  onOpen,
}: {
  bookings: AdminBooking[];
  now: Date;
  onOpen: (booking: AdminBooking) => void;
}) {
  const ahead = bookings
    .filter((booking) => booking.status === "confirmed" && Date.parse(booking.ends_at) > now.getTime())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = ahead[0];
  if (!next) return null;
  const live = Date.parse(next.starts_at) <= now.getTime();
  const today = dateKey(now);
  const day = dateKey(new Date(next.starts_at));
  const when =
    day === today
      ? "Today"
      : day === shiftDate(today, 1)
        ? "Tomorrow"
        : dateLabel(day, { weekday: "long", day: "numeric", month: "long" });
  const laterToday = day === today ? ahead.slice(1).filter((booking) => dateKey(new Date(booking.starts_at)) === today).length : 0;
  const meet = meetingHref({ meetingUrl: next.meeting_url, location: next.location, status: next.status });
  const porto = next.location === "porto";

  return (
    <section className={`teacher-next${live ? " is-live" : ""}`} aria-labelledby="teacher-next-title">
      <div className="teacher-next__text">
        <p className="teacher-eyebrow" id="teacher-next-title">
          {live ? "Happening now" : "Next lesson"}
          {laterToday ? <span className="teacher-next__more"> · {laterToday} more today</span> : null}
        </p>
        <button className="teacher-next__lesson" type="button" onClick={() => onOpen(next)}>
          <strong>{next.student_name}</strong>
          <span>
            {when}, {formatSlotTime(next.starts_at)}–{formatSlotTime(next.ends_at)}
          </span>
          <span className="teacher-next__place">
            {porto ? (
              <UserRound size={14} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <Globe size={14} strokeWidth={2.4} aria-hidden="true" />
            )}
            {porto ? "In Porto" : "Online"}
          </span>
          {addedByTeacher(next) ? <span className="teacher-next__added">Added by you</span> : null}
        </button>
      </div>
      {meet ? (
        <a
          className="teacher-next__join"
          href={meet}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Join Google Meet with ${next.student_name}`}
        >
          <span className="teacher-next__logo">
            <GoogleMeetLogo />
          </span>
          Join Meet
        </a>
      ) : !porto ? (
        <span className="teacher-next__waiting">Meet link on its way</span>
      ) : null}
    </section>
  );
}
