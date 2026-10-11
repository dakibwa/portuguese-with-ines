"use client";

import { ChevronRight } from "lucide-react";
import { buildBookingWeeks, shortMonth } from "@/lib/booking-api";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Your lessons, drawn before the account arrives (11 October 2026, at Dan's
 * request: the page should not feel like it is loading). Everything that does
 * not depend on the student is already known: the places, Book, this month
 * and its four weeks with today marked. It stands in exactly the card's
 * place, so when the lessons arrive only they appear. Meanwhile a splat turns
 * in the corner where the student's own splat sits, and the days shimmer.
 */
export function LessonsLoading({ todayKey }: { todayKey: string }) {
  const weeks = buildBookingWeeks(todayKey, 21).slice(0, 4);
  const [year, month] = todayKey.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return (
    <div className="unified-calendar-shell">
    <div className="unified-calendar unified-calendar--overview">
    <div aria-busy="true" className="calendar-panel unified-calendar__grid lessons-loading">
      <p className="visually-hidden" role="status">Loading your lessons…</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" aria-hidden="true" className="lessons-loading__splat" src="/visuals/v2-splats/one-to-one-splat-v2.svg" />
      <div aria-hidden="true" className="lesson-overview">
        <div className="lesson-overview__header">
          <div className="lesson-overview__heading">
            <div className="lessons-loading__places">
              <span className="is-current">Your lessons</span>
              <span>Past lessons</span>
              <span>Edit details</span>
            </div>
            <span className="lessons-loading__name" />
          </div>
          <span className="button button--coral button--compact lesson-overview__book">
            Book<span className="lesson-overview__book-more"> a lesson</span> <ChevronRight size={16} aria-hidden="true" />
          </span>
        </div>
        {/* On a phone the next lesson has its own row: the splat turns where
            its mark will be. */}
        <div className="lessons-loading__next">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="lessons-loading__mark" src="/visuals/v2-splats/one-to-one-splat-v2.svg" />
          <span className="lessons-loading__lines"><span /><span /></span>
        </div>
      </div>
      <div aria-hidden="true" className="unified-calendar__toolbar">
        <div className="unified-calendar__heading">
          <div className="unified-calendar__title">
            <p className="unified-calendar__month">{monthLabel}</p>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="calendar-weekdays">
        <span className="calendar-weekdays__corner" />
        {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div aria-hidden="true" className="calendar-weeks">
        {weeks.map((week, row) => (
          <div className="calendar-week" key={week.key}>
            <span className={`calendar-week__month${row > 0 && weeks[row - 1].cells[0].month === week.cells[0].month ? " is-repeat" : ""}`}>
              {shortMonth(week.cells[0].month, week.cells[0].key)}
            </span>
            {week.cells.map((cell, column) => (
              <span
                className={`lessons-loading__day${cell.key < todayKey ? " is-past" : ""}${cell.isToday ? " is-today" : ""}`}
                key={cell.key}
                style={{ animationDelay: `${(row + column) * 70}ms` }}
              >
                {cell.day}
                {cell.isToday ? <small>Today</small> : null}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
    </div>
    </div>
  );
}
