"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarOff, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { AdminBooking, AvailabilityException } from "@/lib/admin-api";
import { dateBlocks, dateKey, dateLabel, daysOff, mondayOf, shiftDate, WEEKDAYS, type WeekHours } from "@/lib/teacher-calendar";

function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

/** Select dates first; applying time off never moves or cancels a booked lesson. */
export function TimeOffCalendar({ today, hours, exceptions, bookings, bookingsLoading, bookingsError, onReloadBookings, busy, status, onChange }: {
  today: string;
  hours: WeekHours;
  exceptions: AvailabilityException[];
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  bookingsError: string;
  onReloadBookings: () => void;
  busy: boolean;
  status: ReactNode;
  onChange: (dates: string[], off: boolean) => void;
}) {
  const [month, setMonth] = useState(() => monthStart(today));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState(today);
  const calendarRef = useRef<HTMLDivElement>(null);
  const off = useMemo(() => daysOff(exceptions), [exceptions]);
  const start = mondayOf(month);
  const last = shiftDate(shiftMonth(month, 1), -1);
  const end = shiftDate(mondayOf(last), 6);
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  const chosen = [...selected].filter(date => date >= today).sort();
  const booked = bookings.filter(booking => booking.status === "confirmed" && chosen.some(date =>
    dateKey(new Date(booking.starts_at)) <= date && dateKey(new Date(Date.parse(booking.ends_at) - 1)) >= date));
  const firstFocus = dates.includes(focused) && focused >= today ? focused : dates.find(date => date >= today && date.startsWith(month.slice(0, 7)));

  function moveMonth(amount: number) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setFocused(next < today ? today : next);
  }

  function selectDate(date: string) {
    setFocused(date);
    setSelected(current => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  return (
    <section className="teacher-timeoff" aria-labelledby="teacher-timeoff-title">
      <header className="teacher-tool-heading">
        <span className="teacher-eyebrow">Your availability</span>
        <h2 id="teacher-timeoff-title">Time off</h2>
        <p>Select days to take off or make available again. Available days follow your weekly hours.</p>
      </header>
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
              const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
              const dayOff = off.has(date);
              const partial = !dayOff && dateBlocks(exceptions, date).length > 0;
              const lessons = bookings.filter(booking => booking.status === "confirmed" && dateKey(new Date(booking.starts_at)) <= date && dateKey(new Date(Date.parse(booking.ends_at) - 1)) >= date).length;
              const label = dayOff ? "day off" : partial ? "some time off" : hours[weekday]?.length ? "weekly hours" : "no weekly hours";
              return (
                <button
                  aria-label={`${dateLabel(date)}, ${label}${lessons ? `, ${lessons} ${lessons === 1 ? "lesson" : "lessons"} booked` : ""}`}
                  aria-pressed={selected.has(date)}
                  aria-current={date === today ? "date" : undefined}
                  className={`teacher-month-day${dayOff ? " is-off" : ""}${partial ? " is-partial" : ""}${!date.startsWith(month.slice(0, 7)) ? " is-outside" : ""}`}
                  data-timeoff-date={date}
                  disabled={date < today || busy}
                  key={date}
                  onClick={() => selectDate(date)}
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
                  <span aria-hidden="true" className="teacher-month-state">{dayOff ? "Off" : partial ? "Part off" : date === today ? "Today" : ""}</span>
                  {lessons ? <span aria-hidden="true" className="teacher-month-booked" /> : null}
                </button>
              );
            })}
          </div>
          <div className="teacher-month-key" aria-label="Calendar key">
            <span><i className="is-selected" /> Selected</span>
            <span><i className="is-off" /> Day off</span>
            <span><i className="is-booked" /> Lesson booked</span>
          </div>
        </div>
        <div className="teacher-timeoff-selection">
          <div className="teacher-timeoff-selection-heading">
            <h3 aria-live="polite">{chosen.length ? `${chosen.length} ${chosen.length === 1 ? "day" : "days"} selected` : "Choose your days"}</h3>
            {chosen.length ? <button className="teacher-text-button" disabled={busy} onClick={() => setSelected(new Set())} type="button">Clear</button> : null}
          </div>
          {chosen.length ? <ul className="teacher-selected-days">{chosen.map(date => <li key={date}><button aria-label={`Remove ${dateLabel(date)} from selection`} disabled={busy} onClick={() => selectDate(date)} type="button">{dateLabel(date, { day: "numeric", month: "short" })}<span aria-hidden="true">×</span></button></li>)}</ul> : <p>Tap one day or several. You can keep selecting across months.</p>}
          {bookingsLoading ? <p role="status">Checking booked lessons…</p> : bookingsError ? <div className="teacher-inline-error" role="alert"><p>Booked lessons could not be checked. Please try again before changing your days.</p><button className="teacher-text-button" onClick={onReloadBookings} type="button">Try again</button></div> : booked.length ? <div className="teacher-timeoff-booked" role="status"><p>{booked.length === 1 ? "1 lesson is" : `${booked.length} lessons are`} already booked. {booked.length === 1 ? "It stays" : "They stay"} booked until you move or cancel {booked.length === 1 ? "it" : "them"}.</p><ul>{booked.map(booking => <li key={booking.id}>{booking.student_name}, {dateLabel(dateKey(new Date(booking.starts_at)), { day: "numeric", month: "short" })}</li>)}</ul></div> : null}
          <div className="teacher-timeoff-selection-actions">
            <button className="button button--coral" disabled={busy || bookingsLoading || Boolean(bookingsError) || !chosen.some(date => !off.has(date))} onClick={() => onChange(chosen, true)} type="button"><CalendarOff size={16} aria-hidden="true" />Mark {chosen.length === 1 ? "day" : "days"} off</button>
            <button className="button button--outline" disabled={busy || bookingsLoading || Boolean(bookingsError) || !chosen.some(date => off.has(date))} onClick={() => onChange(chosen, false)} type="button"><Check size={16} aria-hidden="true" />Make available</button>
          </div>
          {status}
        </div>
      </div>
    </section>
  );
}
