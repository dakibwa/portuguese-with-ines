"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarCheck, CalendarOff, Clock, Globe } from "lucide-react";
import type { AdminBooking, AvailabilityException, OnlineOnlyPeriod } from "@/lib/admin-api";
import { ALL_DAY, dateBlocks, dateKey, dateLabel, daysOff, minuteLabel, mondayOf, onlineOnlyHours, onlineOnlyLabel, parseMinute, shiftDate, spanLabel, WEEKDAYS, type Span } from "@/lib/teacher-calendar";
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
 * one or several, and the card beside the month says what she can do with
 * them. One way to choose, no modes. The card reads the same for one day as
 * for many (14 October 2026, Dan: "rather than it be different if its one or
 * two days"): `N days chosen` over a removable chip for each, and a single
 * day's own details and hours beneath. Booked lessons are never moved or
 * cancelled from here; the card names any that stay.
 *
 * Online only is the same kind of statement about days (10 November 2026,
 * Dan: "label days as online only"), so it is a quiet chip on the same card,
 * its hours edited in place beneath it, and the month tints those days.
 */
export function TimeOffCalendar({ today, exceptions, onlineOnly, bookings, bookingsLoading, bookingsError, onReloadBookings, busy, status, onChange, onOnlineOnly, onSaveDay, onOpenBooking }: {
  today: string;
  exceptions: AvailabilityException[];
  onlineOnly: OnlineOnlyPeriod[];
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  bookingsError: string;
  onReloadBookings: () => void;
  busy: boolean;
  status: ReactNode;
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
  const hoursButtonRef = useRef<HTMLButtonElement>(null);
  const reopenedHours = useRef(false);
  useLayoutEffect(() => {
    if (hoursFor || !reopenedHours.current) return;
    reopenedHours.current = false;
    hoursButtonRef.current?.focus({ preventScroll: true });
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
  const booked = bookings.filter(booking => booking.status === "confirmed" && chosen.some(date => lessonsOn([booking], date).length))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const hoursOff = one && !off.has(one) ? dateBlocks(exceptions, one) : [];
  // Days already off aren't taken again, so the button counts only the rest.
  const toTake = chosen.filter(date => !off.has(date)).length;
  const firstFocus = dates.includes(focused) && focused >= today ? focused : dates.find(date => date >= today && date.startsWith(month.slice(0, 7)));
  const unchecked = bookingsLoading || Boolean(bookingsError);
  const online = chosen.map(date => onlineOnlyLabel(onlineOn(date)));
  const allOnline = chosen.length > 0 && online.every(Boolean);
  const onlineValue = online.every(label => label === online[0]) ? online[0] : "Different hours";
  // With nothing chosen the card lists what is already off (2 November 2026):
  // consecutive days off read as one stretch, and tapping one chooses its days.
  const upcoming = useMemo(() => {
    const dates = [...new Set(exceptions
      .filter(exception => exception.kind === "blocked" && exception.weekday == null && exception.date && exception.date >= today)
      .map(exception => exception.date as string))].sort();
    const rows: { dates: string[]; detail: string; note: string }[] = [];
    for (const date of dates) {
      const last = rows.at(-1);
      if (off.has(date) && last && last.detail !== "hours" && shiftDate(last.dates.at(-1)!, 1) === date) { last.dates.push(date); continue; }
      rows.push({ dates: [date], detail: off.has(date) ? "day" : "hours", note: off.get(date) ?? "" });
    }
    return rows.map(row => ({
      ...row,
      label: row.dates.length > 1
        ? `${shortDate(row.dates[0])} – ${shortDate(row.dates.at(-1)!)}`
        : shortDate(row.dates[0]),
      detail: row.detail === "hours"
        ? `Off ${dateBlocks(exceptions, row.dates[0]).map(spanLabel).join(", ")}`
        : row.dates.length > 1 ? `${row.dates.length} days off` : "Day off",
    }));
  }, [exceptions, off, today]);

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
                  className={`teacher-month-day${dayOff ? " is-off" : ""}${onlineHours ? " is-online" : ""}${!date.startsWith(month.slice(0, 7)) ? " is-outside" : ""}`}
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
                  {onlineHours ? <Globe aria-hidden="true" className="teacher-month-online" size={11} strokeWidth={2.4} /> : null}
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
        </div>

        <div className={`teacher-timeoff-selection${chosen.length ? " has-days" : upcoming.length ? " has-upcoming" : ""}`}>
          <div className="teacher-timeoff-selection-heading">
            <h3 aria-live="polite">{chosen.length ? `${chosen.length} ${chosen.length === 1 ? "day" : "days"} chosen` : "Tap the days you want off"}</h3>
            {chosen.length ? <button className="button button--outline button--small" disabled={busy} onClick={() => setSelected(new Set())} type="button">Clear</button> : null}
          </div>
          {!chosen.length && upcoming.length ? (
            <div className="teacher-timeoff-upcoming">
              <p className="teacher-eyebrow">Coming up</p>
              <ul>
                {upcoming.slice(0, 6).map(row => (
                  <li key={row.dates[0]}>
                    <button
                      disabled={busy}
                      onClick={() => { setMonth(monthStart(row.dates[0])); setFocused(row.dates[0]); setSelected(new Set(row.dates)); }}
                      type="button"
                    >
                      <strong>{row.label}</strong>
                      <span>{[row.detail, row.note].filter((part, index, parts) => part && parts.findIndex(other => other.toLowerCase() === part.toLowerCase()) === index).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {upcoming.length > 6 ? <p className="teacher-timeoff-upcoming__more">And {upcoming.length - 6} more later on</p> : null}
            </div>
          ) : null}
          {chosen.length ? (
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
              <button className="button button--outline button--small" onClick={onReloadBookings} type="button">Try again</button>
            </div>
          ) : null}
          {chosen.length ? (
            <div className="teacher-timeoff-selection-actions">
              {toTake ? (
                <button className="button button--coral" disabled={busy || unchecked} onClick={() => onChange(chosen, true)} type="button">
                  <CalendarOff size={16} aria-hidden="true" />
                  {one ? "Take the day off" : `Take ${toTake} ${toTake === 1 ? "day" : "days"} off`}
                </button>
              ) : null}
              {one ? (
                <button className="teacher-quiet" disabled={busy || unchecked} onClick={() => setHoursFor(one)} ref={hoursButtonRef} type="button">
                  <Clock size={16} aria-hidden="true" />
                  {hoursOff.length ? "Change hours off" : "Take some hours off"}
                </button>
              ) : null}
              {chosen.some(date => off.has(date)) ? (
                <button className="teacher-quiet" disabled={busy || unchecked} onClick={() => onChange(chosen, false)} type="button">
                  <CalendarCheck size={16} aria-hidden="true" />
                  Make available
                </button>
              ) : null}
              {/* Days already online only keep their hours; the rest are labelled all day. */}
              <button
                aria-pressed={allOnline}
                className="teacher-quiet teacher-online-chip"
                disabled={busy}
                onClick={() => void onOnlineOnly(chosen, allOnline ? chosen : chosen.filter(date => !onlineOn(date).length), allOnline ? null : ALL_DAY).catch(() => {})}
                type="button"
              >
                <Globe size={16} aria-hidden="true" />
                Online only
              </button>
            </div>
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
          <span><Globe size={13} strokeWidth={2.4} aria-hidden="true" /> {value}</span>
        </EditValue>
      )}
    </div>
  );
}
