"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarCheck, CalendarOff, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { AdminBooking, AvailabilityException } from "@/lib/admin-api";
import { dateBlocks, dateKey, dateLabel, daysOff, mondayOf, shiftDate, spanLabel, WEEKDAYS, type Span } from "@/lib/teacher-calendar";
import { TimeOffDayDialog } from "@/components/teacher/TimeOffDayDialog";
import { BookedLessonCard } from "@/components/teacher/BookedLessonCard";

function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}
const shortDay = (date: string) => dateLabel(date, { weekday: "short", day: "numeric", month: "short" });

/** A booked lesson on a date, counting one that runs past midnight on both. */
function lessonsOn(bookings: AdminBooking[], date: string) {
  return bookings.filter(booking => booking.status === "confirmed" &&
    dateKey(new Date(booking.starts_at)) <= date && dateKey(new Date(Date.parse(booking.ends_at) - 1)) >= date);
}

/**
 * Time off as one month (13 October 2026, Dan): she taps the days she means,
 * one or several, and the card beside the month says what she can do with
 * them. One way to choose, no modes. Booked lessons are never moved or
 * cancelled from here; the card names any that stay.
 */
export function TimeOffCalendar({ today, exceptions, bookings, bookingsLoading, bookingsError, onReloadBookings, busy, status, onChange, onSaveDay, onOpenBooking }: {
  today: string;
  exceptions: AvailabilityException[];
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  bookingsError: string;
  onReloadBookings: () => void;
  busy: boolean;
  status: ReactNode;
  onChange: (dates: string[], off: boolean) => void;
  onSaveDay: (date: string, change: { dayOff: boolean; blocks?: Span[] }) => Promise<void>;
  /** Opens a booked lesson so she can move or cancel it. */
  onOpenBooking: (booking: AdminBooking) => void;
}) {
  const [month, setMonth] = useState(() => monthStart(today));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState(today);
  const [hoursFor, setHoursFor] = useState<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const hoursButtonRef = useRef<HTMLButtonElement>(null);
  const reopenedHours = useRef(false);
  useLayoutEffect(() => {
    if (hoursFor || !reopenedHours.current) return;
    reopenedHours.current = false;
    hoursButtonRef.current?.focus({ preventScroll: true });
  }, [hoursFor]);
  const off = useMemo(() => daysOff(exceptions), [exceptions]);
  const start = mondayOf(month);
  const last = shiftDate(shiftMonth(month, 1), -1);
  const end = shiftDate(mondayOf(last), 6);
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  const chosen = [...selected].filter(date => date >= today).sort();
  const one = chosen.length === 1 ? chosen[0] : null;
  const booked = bookings.filter(booking => booking.status === "confirmed" && chosen.some(date => lessonsOn([booking], date).length))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const hoursOff = one && !off.has(one) ? dateBlocks(exceptions, one) : [];
  const firstFocus = dates.includes(focused) && focused >= today ? focused : dates.find(date => date >= today && date.startsWith(month.slice(0, 7)));
  const unchecked = bookingsLoading || Boolean(bookingsError);

  function moveMonth(amount: number) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setFocused(next < today ? today : next);
  }

  function toggle(date: string) {
    setFocused(date);
    setSelected(current => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  return (
    <section className="teacher-timeoff" aria-labelledby="teacher-timeoff-title">
      <h2 className="visually-hidden" id="teacher-timeoff-title">Time off</h2>
      <div className="teacher-timeoff-layout">
        <div className="teacher-month">
          <div className="teacher-month-heading">
            <h3 id="teacher-timeoff-month" aria-live="polite">{dateLabel(month, { month: "long", year: "numeric" })}</h3>
            <div className="teacher-month-navigation">
              <button className="teacher-icon-button" aria-label="Previous month" disabled={month <= monthStart(today)} onClick={() => moveMonth(-1)} type="button"><ChevronLeft size={19} aria-hidden="true" /></button>
              <button className="teacher-text-button" onClick={() => { setMonth(monthStart(today)); setFocused(today); }} type="button">This month</button>
              <button className="teacher-icon-button" aria-label="Next month" onClick={() => moveMonth(1)} type="button"><ChevronRight size={19} aria-hidden="true" /></button>
            </div>
          </div>
          <div className="teacher-month-grid" aria-labelledby="teacher-timeoff-month" ref={calendarRef}>
            {WEEKDAYS.map(day => <span aria-hidden="true" className="teacher-month-weekday" key={day.value}>{day.short}</span>)}
            {dates.map(date => {
              const dayOff = off.has(date);
              const lessons = lessonsOn(bookings, date).length;
              return (
                <button
                  aria-label={`${dateLabel(date)}${dayOff ? ", day off" : ""}${lessons ? `, ${lessons} ${lessons === 1 ? "lesson" : "lessons"} booked` : ""}`}
                  aria-pressed={selected.has(date)}
                  aria-current={date === today ? "date" : undefined}
                  className={`teacher-month-day${dayOff ? " is-off" : ""}${!date.startsWith(month.slice(0, 7)) ? " is-outside" : ""}`}
                  data-timeoff-date={date}
                  disabled={date < today || busy}
                  key={date}
                  onClick={() => toggle(date)}
                  onKeyDown={event => {
                    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : null;
                    if (step === null) return;
                    event.preventDefault();
                    const next = shiftDate(date, step);
                    if (next < today) return;
                    setFocused(next);
                    if (!dates.includes(next)) setMonth(monthStart(next));
                    requestAnimationFrame(() => calendarRef.current?.querySelector<HTMLButtonElement>(`[data-timeoff-date="${next}"]`)?.focus({ preventScroll: true }));
                  }}
                  tabIndex={date === firstFocus ? 0 : -1}
                  type="button"
                >
                  <span className="teacher-month-date">{Number(date.slice(-2))}</span>
                  <span aria-hidden="true" className="teacher-month-state">{dayOff ? "Off" : date === today ? "Today" : ""}</span>
                  {lessons ? <span aria-hidden="true" className="teacher-month-booked" /> : null}
                </button>
              );
            })}
          </div>
          <div className="teacher-month-key" aria-label="Calendar key">
            <span><i className="is-selected" /> Chosen</span>
            <span><i className="is-off" /> Day off</span>
            <span><i className="is-booked" /> Lesson booked</span>
          </div>
        </div>

        <div className={`teacher-timeoff-selection${chosen.length ? " has-days" : ""}`}>
          <div className="teacher-timeoff-selection-heading">
            <h3 aria-live="polite">{one ? shortDay(one) : chosen.length ? `${chosen.length} days chosen` : "Tap the days you want off"}</h3>
            {chosen.length ? <button className="teacher-text-button" disabled={busy} onClick={() => setSelected(new Set())} type="button">Clear</button> : null}
          </div>
          {chosen.length > 1 ? (
            <ul className="teacher-selected-days">
              {chosen.map(date => <li key={date}><button aria-label={`Remove ${dateLabel(date)}`} disabled={busy} onClick={() => toggle(date)} type="button">{dateLabel(date, { day: "numeric", month: "short" })}<span aria-hidden="true">×</span></button></li>)}
            </ul>
          ) : null}
          {(one && off.has(one)) || hoursOff.length || (chosen.length && bookingsLoading) ? (
            <ul className="booking-payment-facts teacher-timeoff-facts">
              {one && off.has(one) ? <li>A day off</li> : null}
              {hoursOff.length ? <li>Off {hoursOff.map(spanLabel).join(", ")}</li> : null}
              {chosen.length && bookingsLoading ? <li role="status">Checking booked lessons…</li> : null}
            </ul>
          ) : null}
          {!bookingsLoading && !bookingsError && booked.length ? (
            <div className="teacher-timeoff-lessons">
              <p className="teacher-eyebrow">Already booked</p>
              <ul className="teacher-lesson-cards">
                {booked.map(booking => <BookedLessonCard booking={booking} disabled={busy} key={booking.id} onOpen={onOpenBooking} />)}
              </ul>
            </div>
          ) : null}
          {bookingsError && chosen.length ? (
            <div className="teacher-inline-error" role="alert">
              <p>Booked lessons couldn’t be checked.</p>
              <button className="teacher-text-button" onClick={onReloadBookings} type="button">Try again</button>
            </div>
          ) : null}
          {chosen.length ? (
            <div className="teacher-timeoff-selection-actions">
              {chosen.some(date => !off.has(date)) ? (
                <button className="button button--coral" disabled={busy || unchecked} onClick={() => onChange(chosen, true)} type="button">
                  <CalendarOff size={16} aria-hidden="true" />
                  {one ? "Take the day off" : `Take ${chosen.length} days off`}
                </button>
              ) : null}
              {one ? (
                <button className="button button--outline" disabled={busy || unchecked} onClick={() => setHoursFor(one)} ref={hoursButtonRef} type="button">
                  <Clock size={16} aria-hidden="true" />
                  {hoursOff.length ? "Change hours off" : "Take some hours off"}
                </button>
              ) : null}
              {chosen.some(date => off.has(date)) ? (
                <button className="button button--outline" disabled={busy || unchecked} onClick={() => onChange(chosen, false)} type="button">
                  <CalendarCheck size={16} aria-hidden="true" />
                  Make available
                </button>
              ) : null}
            </div>
          ) : null}
          {status}
        </div>
      </div>
      {hoursFor ? (
        <TimeOffDayDialog
          key={hoursFor}
          date={hoursFor}
          exceptions={exceptions}
          bookings={bookings}
          onSave={onSaveDay}
          onClose={() => { reopenedHours.current = true; setHoursFor(null); }}
        />
      ) : null}
    </section>
  );
}
