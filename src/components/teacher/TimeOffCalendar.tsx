"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { AdminBooking, AvailabilityException, OnlineOnlyPeriod } from "@/lib/admin-api";
import { ALL_DAY, dateBlocks, dateKey, dateLabel, daysOff, minuteLabel, mondayOf, onlineOnlyHours, onlineOnlyLabel, parseMinute, shiftDate, spanLabel, timeOffClashes, WEEKDAYS, type Span } from "@/lib/teacher-calendar";
import { MonthLabel, TeacherPager } from "@/components/teacher/TeacherPager";
import { TimeOffDayDialog } from "@/components/teacher/TimeOffDayDialog";
import { BookedLessonCard } from "@/components/teacher/BookedLessonCard";
import { EditActions, EditValue } from "@/components/teacher/EditControls";

function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function shortDate(date: string) { return dateLabel(date, { weekday: "short", day: "numeric", month: "short" }); }
function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

/** A booked lesson on a date, counting one that runs past midnight on both. */
function lessonsOn(bookings: AdminBooking[], date: string) {
  return bookings.filter(booking => booking.status === "confirmed" &&
    dateKey(new Date(booking.starts_at)) <= date && dateKey(new Date(Date.parse(booking.ends_at) - 1)) >= date);
}

/**
 * Time off as one month (13 October 2026, Dan): she taps the days she means,
 * one or several, and the choice is there at the month's foot (10 November
 * 2026, Dan: "can you literally just click 3 days then the option is there to
 * mark as online only or off?"): how many days, `Off`, `Online only`, and a
 * cross to let them go. No second card opens, and the month itself names the
 * days. Each chip is pressed when every chosen day already is that, so the
 * same press takes it back.
 *
 * Hours are the exception, so they come after: once days are off or online
 * only, `All day` stands under the chips with its pencil. `Off` is a whole
 * day, as the month draws it; a day with only some hours off shows those
 * hours and leaves the chip unpressed. Booked lessons are never moved or
 * cancelled from here; any her time off leaves standing are listed beside
 * the month as Clashes, each opening its lesson.
 */
export function TimeOffCalendar({ today, now, exceptions, onlineOnly, bookings, bookingsLoading, bookingsError, onReloadBookings, busy, status, onChange, onOnlineOnly, onSaveDay, onOpenBooking }: {
  today: string;
  now: Date;
  exceptions: AvailabilityException[];
  onlineOnly: OnlineOnlyPeriod[];
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  bookingsError: string;
  onReloadBookings: () => void;
  busy: boolean;
  status: ReactNode;
  /** Takes `dates` off as whole days, or opens them again; hours off within a day stay. */
  onChange: (dates: string[], off: boolean) => void;
  /**
   * Labels `dates` online only for `hours` each day, or clears them when
   * `hours` is null; `said` are the days its status names. Rejects when it
   * could not be saved, having said why in `status`.
   */
  onOnlineOnly: (said: string[], dates: string[], hours: Span | null) => Promise<void>;
  onSaveDay: (date: string, change: { dayOff: boolean; blocks?: Span[] }) => Promise<void>;
  /** Opens a booked lesson so she can move or cancel it. */
  onOpenBooking: (booking: AdminBooking) => void;
}) {
  const [month, setMonth] = useState(() => monthStart(today));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState(today);
  const [hoursFor, setHoursFor] = useState<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const monthTitleRef = useRef<HTMLHeadingElement>(null);
  const choiceRef = useRef<HTMLDivElement>(null);
  const reopenedHours = useRef(false);
  // Closing the hours puts focus back on their value, or on Off once they are gone.
  useLayoutEffect(() => {
    if (hoursFor || !reopenedHours.current) return;
    reopenedHours.current = false;
    (choiceRef.current?.querySelector<HTMLElement>('[data-edit="hours-off"]') ?? choiceRef.current?.querySelector<HTMLElement>("[data-day-choice]"))?.focus({ preventScroll: true });
  }, [hoursFor]);
  const off = useMemo(() => daysOff(exceptions), [exceptions]);
  const onlineOn = (date: string) => onlineOnlyHours(onlineOnly, date);
  const start = mondayOf(month);
  const last = shiftDate(shiftMonth(month, 1), -1);
  const end = shiftDate(mondayOf(last), 6);
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  const chosen = [...selected].filter(date => date >= today).sort();
  const one = chosen.length === 1 ? chosen[0] : null;
  const hoursOff = one && !off.has(one) ? dateBlocks(exceptions, one) : [];
  // Off is a whole day, as the month draws it; some hours off are its hours beneath.
  const allOff = chosen.length > 0 && chosen.every(date => off.has(date));
  const firstFocus = dates.includes(focused) && focused >= today ? focused : dates.find(date => date >= today && date.startsWith(month.slice(0, 7)));
  const unchecked = bookingsLoading || Boolean(bookingsError);
  const online = chosen.map(date => onlineOnlyLabel(onlineOn(date)));
  const allOnline = chosen.length > 0 && online.every(Boolean);
  const onlineValue = online.every(label => label === online[0]) ? online[0] : "Different hours";
  const clashes = useMemo(() => bookingsLoading || bookingsError ? [] : timeOffClashes(bookings, exceptions, onlineOnly, now),
    [bookings, bookingsLoading, bookingsError, exceptions, onlineOnly, now]);
  // What is already set, ahead (2 November 2026): consecutive days read as
  // one stretch, and tapping one chooses its days.
  const upcoming = useMemo(() => {
    const blocked = [...new Set(exceptions
      .filter(exception => exception.kind === "blocked" && exception.weekday == null && exception.date && exception.date >= today)
      .map(exception => exception.date as string))].sort();
    const rows: { dates: string[]; detail: string; note: string }[] = [];
    for (const date of blocked) {
      const last = rows.at(-1);
      if (off.has(date) && last && last.detail !== "hours" && shiftDate(last.dates.at(-1)!, 1) === date) { last.dates.push(date); continue; }
      rows.push({ dates: [date], detail: off.has(date) ? "day" : "hours", note: off.get(date) ?? "" });
    }
    const stretch = (dates: string[]) => dates.length > 1 ? `${shortDate(dates[0])} – ${shortDate(dates.at(-1)!)}` : shortDate(dates[0]);
    return [
      ...rows.map(row => ({
        dates: row.dates,
        label: stretch(row.dates),
        detail: [row.detail === "hours"
          ? `Off ${dateBlocks(exceptions, row.dates[0]).map(spanLabel).join(", ")}`
          : row.dates.length > 1 ? `${row.dates.length} days off` : "Day off", row.note]
          .filter((part, index, parts) => part && parts.findIndex(other => other.toLowerCase() === part.toLowerCase()) === index).join(" · "),
      })),
      ...onlineOnly.filter(period => period.toDate >= today).map(period => {
        const dates: string[] = [];
        for (let date = period.fromDate < today ? today : period.fromDate; date <= period.toDate; date = shiftDate(date, 1)) dates.push(date);
        const hours = onlineOnlyLabel([{ start: period.startMinute, end: period.endMinute }]);
        return { dates, label: stretch(dates), detail: `${dates.length > 1 ? `${dates.length} days online only` : "Online only"}${hours === "All day" ? "" : `, ${hours}`}` };
      }),
    ].sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
  }, [exceptions, onlineOnly, off, today]);

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
            <h3 id="teacher-timeoff-month" aria-live="polite" ref={monthTitleRef} tabIndex={-1}><MonthLabel month={month} /></h3>
            <TeacherPager
              unit="month"
              away={month !== monthStart(today)}
              headingRef={monthTitleRef}
              onCurrent={() => { setMonth(monthStart(today)); setFocused(today); }}
              onNext={() => moveMonth(1)}
              onPrevious={() => moveMonth(-1)}
              previousDisabled={month <= monthStart(today)}
            />
          </div>
          <div className="teacher-month-grid" aria-labelledby="teacher-timeoff-month" ref={calendarRef}>
            {WEEKDAYS.map(day => <span aria-hidden="true" className="teacher-month-weekday" key={day.value}>{day.short}</span>)}
            {dates.map(date => {
              const dayOff = off.has(date);
              const lessons = lessonsOn(bookings, date).length;
              const onlineHours = onlineOnlyLabel(onlineOn(date));
              return (
                <button
                  aria-label={`${dateLabel(date)}${dayOff ? ", day off" : ""}${onlineHours ? `, online only${onlineHours === "All day" ? "" : ` ${onlineHours}`}` : ""}${lessons ? `, ${lessons} ${lessons === 1 ? "lesson" : "lessons"} booked` : ""}`}
                  aria-pressed={selected.has(date)}
                  aria-current={date === today ? "date" : undefined}
                  className={`teacher-month-day${dayOff ? " is-off" : ""}${onlineHours ? " is-online" : ""}${lessons ? " is-booked" : ""}${!date.startsWith(month.slice(0, 7)) ? " is-outside" : ""}`}
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
                  {/* Drawn marks, never an underline or a dot (10 November 2026,
                      Dan): today's date in the site's blob, a booked day in
                      its fine hatch, each named in the key beneath. */}
                  <span className={`teacher-month-date${date === today ? " today-pill" : ""}`}>{Number(date.slice(-2))}</span>
                  <span aria-hidden="true" className="teacher-month-state">{dayOff ? "Off" : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="teacher-month-key" role="group" aria-label="Calendar key">
            <span><i className="is-selected" aria-hidden="true" /> Chosen</span>
            <span><i className="is-off" aria-hidden="true" /> Day off</span>
            <span><i className="is-online" aria-hidden="true" /> Online only</span>
            <span><i className="is-booked" aria-hidden="true" /> Lesson booked</span>
          </div>
          {chosen.length ? (
            <div className="teacher-day-choices" ref={choiceRef} role="group" aria-label="Chosen days">
              <strong aria-live="polite">{chosen.length} {chosen.length === 1 ? "day" : "days"}</strong>
              {/* Each chip wears the swatch of the day it makes, as the key does. */}
              <button aria-pressed={allOff} className="teacher-quiet teacher-day-choice" data-day-choice disabled={busy || unchecked} onClick={() => onChange(chosen, !allOff)} type="button">
                <i className="teacher-swatch is-off" aria-hidden="true" />
                Off
              </button>
              {/* Days already online only keep their hours; the rest are labelled all day. */}
              <button
                aria-pressed={allOnline}
                className="teacher-quiet teacher-day-choice"
                disabled={busy}
                onClick={() => void onOnlineOnly(chosen, allOnline ? chosen : chosen.filter(date => !onlineOn(date).length), allOnline ? null : ALL_DAY).catch(() => {})}
                type="button"
              >
                <i className="teacher-swatch is-online" aria-hidden="true" />
                Online only
              </button>
              <button aria-label="Clear chosen days" className="teacher-pencil" disabled={busy} onClick={() => setSelected(new Set())} title="Clear chosen days" type="button"><X size={15} strokeWidth={2.4} aria-hidden="true" /></button>
              {/* Hours come after the choice: one day's hours off, or the chosen days' online-only hours. */}
              {(one && (off.has(one) || hoursOff.length)) || allOnline ? (
                <div className="teacher-day-hours">
                  {one && (off.has(one) || hoursOff.length) ? (
                    <EditValue disabled={busy || unchecked} field="hours-off" label="Change hours off" onEdit={() => setHoursFor(one)}>
                      <span><i className="teacher-swatch is-off" aria-hidden="true" /> {off.has(one) ? "All day" : hoursOff.map(spanLabel).join(", ")}</span>
                    </EditValue>
                  ) : null}
                  {allOnline ? (
                    <OnlineHours
                      busy={busy}
                      hours={chosen.map(onlineOn)}
                      key={chosen.join()}
                      onSave={hours => onOnlineOnly(chosen, chosen, hours)}
                      value={onlineValue}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="teacher-day-hint">Tap the days you want off, or online only</p>
          )}
          {status}
        </div>

        <div className={`teacher-timeoff-ahead${clashes.length || upcoming.length || bookingsError ? " has-rows" : ""}`}>
          {bookingsError ? (
            <div className="teacher-inline-error" role="alert">
              <p>Booked lessons couldn’t be checked.</p>
              <button className="button button--outline button--small" onClick={onReloadBookings} type="button">Try again</button>
            </div>
          ) : null}
          {clashes.length ? (
            <div className="teacher-timeoff-lessons">
              <p className="teacher-eyebrow">Clashes</p>
              <ul className="teacher-lesson-cards">
                {clashes.map(({ booking, reason }) => <BookedLessonCard booking={booking} disabled={busy} key={booking.id} note={reason} onOpen={onOpenBooking} />)}
              </ul>
            </div>
          ) : null}
          <div className="teacher-timeoff-upcoming">
            <p className="teacher-eyebrow">Coming up</p>
            {upcoming.length ? (
              <ul>
                {upcoming.slice(0, 6).map(row => (
                  <li key={`${row.dates[0]} ${row.detail}`}>
                    <button
                      disabled={busy}
                      onClick={() => { setMonth(monthStart(row.dates[0])); setFocused(row.dates[0]); setSelected(new Set(row.dates)); }}
                      type="button"
                    >
                      <strong>{row.label}</strong>
                      <span>{row.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="teacher-timeoff-upcoming__more">Nothing off ahead</p>}
            {upcoming.length > 6 ? <p className="teacher-timeoff-upcoming__more">And {upcoming.length - 6} more later on</p> : null}
          </div>
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

/**
 * The chosen days' online-only hours, edited where they stand: `All day` or
 * `Some hours` on the site's slider, the hours in the same time fields as
 * hours off, ending in the tick and cross. Enter saves, Escape cancels, and
 * focus returns to the value. It applies to every chosen day.
 */
function OnlineHours({ value, hours, busy, onSave }: {
  value: string;
  hours: Span[][];
  busy: boolean;
  onSave: (hours: Span) => Promise<void>;
}) {
  const [draft, setDraft] = useState<{ allDay: boolean; from: string; until: string } | null>(null);
  const [error, setError] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const back = useRef(false);
  useLayoutEffect(() => {
    if (draft) return;
    if (back.current) { back.current = false; wrapper.current?.querySelector<HTMLElement>("[data-edit]")?.focus(); }
  }, [draft]);
  const editing = draft !== null;
  const close = () => { back.current = true; setDraft(null); setError(""); };
  function open() {
    const usual = hours.flat().find(span => span.start !== 0 || span.end !== 1440) ?? { start: 540, end: 1020 };
    setError("");
    setDraft({ allDay: value === "All day", from: minuteLabel(usual.start), until: usual.end === 1440 ? "00:00" : minuteLabel(usual.end) });
    requestAnimationFrame(() => wrapper.current?.querySelector<HTMLInputElement>("input:checked")?.focus());
  }
  async function save() {
    if (!draft || busy) return;
    const span = draft.allDay ? ALL_DAY : { start: parseMinute(draft.from), end: draft.until === "00:00" ? 1440 : parseMinute(draft.until) };
    if (!Number.isFinite(span.start) || !Number.isFinite(span.end) || span.start >= span.end) { setError("Choose an end after the start."); return; }
    setError("");
    try { await onSave(span); close(); } catch { /* The card's status says why; the hours stay open. */ }
  }
  return (
    <div className="teacher-online-hours" ref={wrapper}>
      {editing ? (
        <form
          className="teacher-form teacher-online-hours__edit"
          noValidate
          onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); close(); } }}
          onSubmit={event => { event.preventDefault(); void save(); }}
        >
          <fieldset className="teacher-manual-choice">
            <legend className="visually-hidden">Online-only hours</legend>
            <div className={`segmented${draft.allDay ? "" : " segmented--second"}`}>
              <span aria-hidden="true" className="segmented__thumb" />
              {([[true, "All day"], [false, "Some hours"]] as const).map(([allDay, label]) => (
                <label className={draft.allDay === allDay ? "is-active" : ""} key={label}>
                  <input checked={draft.allDay === allDay} disabled={busy} name="teacher-online-hours" onChange={() => setDraft({ ...draft, allDay })} type="radio" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {draft.allDay ? null : (
            <div className="teacher-online-hours__times">
              <label><span>From</span><input aria-invalid={error ? true : undefined} disabled={busy} onChange={event => setDraft({ ...draft, from: event.target.value })} type="time" value={draft.from} /></label>
              <label><span>Until</span><input aria-invalid={error ? true : undefined} disabled={busy} onChange={event => setDraft({ ...draft, until: event.target.value })} type="time" value={draft.until} /></label>
            </div>
          )}
          <EditActions busy={busy} onCancel={close} saveLabel="Save online-only hours" />
          {error ? <p className="teacher-inline-error teacher-inline-edit__error" role="alert">{error}</p> : null}
        </form>
      ) : (
        <EditValue disabled={busy} field="online-hours" label="Change online-only hours" onEdit={open}>
          <span><i className="teacher-swatch is-online" aria-hidden="true" /> {value}</span>
        </EditValue>
      )}
    </div>
  );
}
