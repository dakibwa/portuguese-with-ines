"use client";

import { useEffect, useRef, useState } from "react";
import { TeacherPager } from "@/components/teacher/TeacherPager";
import { fetchAvailability, forgetAvailability, formatSlotTime, portoDateKey, portoTimeToUtc, type AvailabilityResponse } from "@/lib/booking-api";
import { dateLabel, minuteLabel, mondayOf, shiftDate, WEEKDAYS } from "@/lib/teacher-calendar";

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const shiftMonth = (month: string, amount: number) => {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
};

type Choice = { date: string; time: string; startAt?: string };

/** How far back she can record a lesson she has already had. */
const MONTHS_BACK = 12;

/**
 * A day's times already gone, every quarter hour from 07:00 until 22:00 (and
 * the one she chose, if it is outside that), for a lesson she is recording.
 * Weekly hours don't apply to what has happened.
 */
function pastTimes(day: string, today: string, chosen: string, now: number) {
  const times: string[] = [];
  for (let minute = 7 * 60; minute < 22 * 60; minute += 15) {
    const time = minuteLabel(minute);
    if (day < today) times.push(time);
    else {
      try { if (Date.parse(portoTimeToUtc(day, time)) <= now) times.push(time); } catch { /* a time the clocks skip */ }
    }
  }
  if (day < today && /^\d\d:\d\d$/.test(chosen) && !times.includes(chosen)) times.push(chosen);
  return times.sort();
}

/**
 * A date and its times: the advertised free ones from today, and every
 * quarter hour of a day already had, back a year (15 October 2026, Dan: she
 * records lessons that have happened).
 */
export function LessonDatePicker({ token, lessonType, date, time, startAt = "", idPrefix, disabled, refresh = 0, onChange }: {
  token: string;
  lessonType: string;
  date: string;
  time: string;
  startAt?: string;
  idPrefix: string;
  disabled: boolean;
  refresh?: number;
  onChange: (choice: Choice) => void;
}) {
  const [now] = useState(() => Date.now());
  const today = portoDateKey(new Date(now));
  const currentMonth = monthStart(today);
  const earliestMonth = shiftMonth(currentMonth, -MONTHS_BACK);
  const [chosenMonth, setMonth] = useState(() => monthStart(date || today));
  const month = chosenMonth < earliestMonth ? earliestMonth : chosenMonth;
  const [focused, setFocused] = useState(date || today);
  const [retry, setRetry] = useState(0);
  const [reply, setReply] = useState<{ key: string; slots: AvailabilityResponse["slotsByDate"]; error: boolean } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const firstRead = useRef(true);
  const monthId = `${idPrefix}-month`;
  const requestKey = `${token}|${lessonType}|${month}|${refresh}|${retry}`;
  // A month wholly past has no free times to ask for.
  const pastMonth = month < currentMonth;
  const current = pastMonth ? { slots: {}, error: false } : reply?.key === requestKey ? reply : null;
  const loading = !current;
  const slots: AvailabilityResponse["slotsByDate"] = current?.slots ?? {};
  const dayInView = Boolean(date && date.startsWith(month.slice(0, 7)));
  const selectedTimes = dayInView ? slots[date] ?? [] : [];
  const gone = dayInView && date <= today ? pastTimes(date, today, time, now) : [];
  const last = shiftDate(shiftMonth(month, 1), -1);
  const end = shiftDate(mondayOf(last), 6);
  const start = mondayOf(month);
  const earliest = mondayOf(earliestMonth);
  const firstColumn = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7 + 1;
  const dates: string[] = [];
  for (let key = start; key <= end; key = shiftDate(key, 1)) dates.push(key);
  const focusDate = dates.includes(focused) ? focused : dates[0];

  useEffect(() => {
    if (pastMonth) return;
    const controller = new AbortController();
    if (firstRead.current) { forgetAvailability(); firstRead.current = false; }
    fetchAvailability(lessonType, month, shiftDate(shiftMonth(month, 1), -1), controller.signal, { session: token, teacher: true })
      .then(data => {
        if (!controller.signal.aborted) setReply({ key: requestKey, slots: data.slotsByDate, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setReply({ key: requestKey, slots: {}, error: true });
      });
    return () => controller.abort();
  }, [token, lessonType, month, requestKey, pastMonth]);

  function moveMonth(amount: number) {
    const next = shiftMonth(month, amount);
    if (disabled || next < earliestMonth) return;
    setMonth(next);
    setFocused(next.slice(0, 7) === today.slice(0, 7) ? today : next);
  }

  return <fieldset className="teacher-manual-choice teacher-lesson-picker">
    <legend>Choose a date and time</legend>
    <div className="teacher-lesson-picker__layout">
      <div className="teacher-month">
        <div className="teacher-month-heading">
          <h3 id={monthId} ref={heading} tabIndex={-1} aria-live="polite">{dateLabel(month, { month: "long", year: "numeric" })}</h3>
          <TeacherPager
            away={month !== currentMonth}
            headingRef={heading}
            nextDisabled={disabled}
            onCurrent={() => { if (!disabled) { setMonth(currentMonth); setFocused(today); } }}
            onNext={() => moveMonth(1)}
            onPrevious={() => moveMonth(-1)}
            previousDisabled={disabled || month === earliestMonth}
            unit="month"
          />
        </div>
        <div className="teacher-month-grid" aria-labelledby={monthId} ref={calendar}>
          {WEEKDAYS.map(day => <span className="teacher-month-weekday" aria-hidden="true" key={day.value}>{day.short}</span>)}
          {dates.map(key => <button
            aria-current={key === today ? "date" : undefined}
            aria-label={dateLabel(key)}
            aria-pressed={date === key}
            className={`teacher-month-day${!key.startsWith(month.slice(0, 7)) ? " is-outside" : ""}${key < today ? " is-past" : ""}`}
            data-lesson-date={key}
            disabled={disabled}
            key={key}
            style={key === start ? { gridColumnStart: firstColumn } : undefined}
            onClick={() => {
              setFocused(key);
              if (!key.startsWith(month.slice(0, 7))) setMonth(monthStart(key));
              onChange({ date: key, time: "" });
            }}
            onKeyDown={event => {
              const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : null;
              if (step === null) return;
              event.preventDefault();
              const candidate = shiftDate(key, step);
              const next = candidate < earliest ? earliest : candidate;
              setFocused(next);
              if (!dates.includes(next)) setMonth(monthStart(next));
              requestAnimationFrame(() => calendar.current?.querySelector<HTMLButtonElement>(`[data-lesson-date="${next}"]`)?.focus({ preventScroll: true }));
            }}
            tabIndex={key === focusDate ? 0 : -1}
            type="button"
          ><span className="teacher-month-date">{Number(key.slice(-2))}</span>{slots[key]?.length ? <span className="teacher-month-booked" aria-hidden="true" /> : null}</button>)}
        </div>
        <p className="teacher-lesson-picker__key"><i aria-hidden="true" />Times available · Porto time</p>
      </div>
      <div className="teacher-lesson-picker__times" aria-live="polite">
        <h4>{dayInView ? dateLabel(date, { weekday: "short", day: "numeric", month: "short" }) : "Choose a day"}</h4>
        {loading ? <p role="status">Checking available times…</p> : current?.error ? <div className="teacher-inline-error" role="alert">
          <p>Available times couldn’t be checked.</p>
          <button className="button button--outline button--small" disabled={disabled} onClick={() => { forgetAvailability(); setRetry(value => value + 1); }} type="button">Try again</button>
        </div> : dayInView ? selectedTimes.length || gone.length ? <div className="teacher-lesson-picker__slots" aria-label={gone.length ? "Times in Porto" : "Available times in Porto"}>
          {/* Gone: any quarter hour, for a lesson she is recording. */}
          {gone.map(value => <button
            aria-label={`${value} Porto time, already past`}
            aria-pressed={!startAt && time === value}
            className="teacher-lesson-picker__slot is-past"
            disabled={disabled}
            key={value}
            onClick={() => onChange({ date, time: value })}
            type="button"
          >{value}</button>)}
          {selectedTimes.map(slot => <button
            aria-label={`${formatSlotTime(slot.startAt)} Porto time`}
            aria-pressed={startAt ? slot.startAt === startAt : time === formatSlotTime(slot.startAt)}
            className="teacher-lesson-picker__slot"
            disabled={disabled}
            key={slot.startAt}
            onClick={() => onChange({ date: portoDateKey(new Date(slot.startAt)), time: formatSlotTime(slot.startAt), startAt: slot.startAt })}
            type="button"
          >{formatSlotTime(slot.startAt)}</button>)}
        </div> : <p>No available times. Choose another day.</p> : <p>Its free times show here.</p>}
        {date && time ? <p className="teacher-lesson-picker__chosen">Chosen: <strong>{dateLabel(date, { day: "numeric", month: "short" })}, {time}</strong> · Porto time</p> : null}
      </div>
    </div>
  </fieldset>;
}
