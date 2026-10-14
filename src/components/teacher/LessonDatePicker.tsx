"use client";

import { useEffect, useRef, useState } from "react";
import { TeacherPager } from "@/components/teacher/TeacherPager";
import { fetchAvailability, forgetAvailability, formatSlotTime, portoDateKey, type AvailabilityResponse } from "@/lib/booking-api";
import { dateLabel, mondayOf, shiftDate, WEEKDAYS } from "@/lib/teacher-calendar";

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const shiftMonth = (month: string, amount: number) => {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
};

type Choice = { date: string; time: string; startAt?: string };

/** A date and its advertised free times, with her manual time still available. */
export function LessonDatePicker({ lessonType, date, time, startAt = "", dateCaption, idPrefix, disabled, refresh = 0, onChange }: {
  lessonType: string;
  date: string;
  time: string;
  startAt?: string;
  dateCaption: string;
  idPrefix: string;
  disabled: boolean;
  refresh?: number;
  onChange: (choice: Choice) => void;
}) {
  const today = portoDateKey(new Date());
  const [month, setMonth] = useState(() => monthStart(date || today));
  const [focused, setFocused] = useState(date || today);
  const [retry, setRetry] = useState(0);
  const [dateError, setDateError] = useState("");
  const [reply, setReply] = useState<{ key: string; slots: AvailabilityResponse["slotsByDate"]; error: boolean } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const firstRead = useRef(true);
  const monthId = `${idPrefix}-month`;
  const requestKey = `${lessonType}|${month}|${refresh}|${retry}`;
  const current = reply?.key === requestKey ? reply : null;
  const loading = !current;
  const slots = current?.slots ?? {};
  const dayInView = Boolean(date && date.startsWith(month.slice(0, 7)));
  const selectedTimes = dayInView ? slots[date] ?? [] : [];
  const last = shiftDate(shiftMonth(month, 1), -1);
  const end = shiftDate(mondayOf(last), 6);
  const dates: string[] = [];
  for (let key = mondayOf(month); key <= end; key = shiftDate(key, 1)) dates.push(key);
  const focusDate = dates.includes(focused) ? focused : month;

  useEffect(() => {
    const controller = new AbortController();
    if (firstRead.current) { forgetAvailability(); firstRead.current = false; }
    fetchAvailability(lessonType, month, shiftDate(shiftMonth(month, 1), -1), controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setReply({ key: requestKey, slots: data.slotsByDate, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setReply({ key: requestKey, slots: {}, error: true });
      });
    return () => controller.abort();
  }, [lessonType, month, requestKey]);

  function moveMonth(amount: number) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setFocused(next);
  }

  return <fieldset className="teacher-manual-choice teacher-lesson-picker">
    <legend>Choose a date and time</legend>
    <div className="teacher-lesson-picker__layout">
      <div className="teacher-month">
        <div className="teacher-month-heading">
          <h3 id={monthId} ref={heading} tabIndex={-1} aria-live="polite">{dateLabel(month, { month: "long", year: "numeric" })}</h3>
          <TeacherPager
            away={month !== monthStart(today)}
            headingRef={heading}
            nextDisabled={disabled}
            onCurrent={() => { if (!disabled) { setMonth(monthStart(today)); setFocused(today); } }}
            onNext={() => moveMonth(1)}
            onPrevious={() => moveMonth(-1)}
            previousDisabled={disabled}
            unit="month"
          />
        </div>
        <div className="teacher-month-grid" aria-labelledby={monthId} ref={calendar}>
          {WEEKDAYS.map(day => <span className="teacher-month-weekday" aria-hidden="true" key={day.value}>{day.short}</span>)}
          {dates.map(key => <button
            aria-current={key === today ? "date" : undefined}
            aria-label={dateLabel(key)}
            aria-pressed={date === key}
            className={`teacher-month-day${!key.startsWith(month.slice(0, 7)) ? " is-outside" : ""}`}
            data-lesson-date={key}
            disabled={disabled}
            key={key}
            onClick={() => {
              setDateError("");
              setFocused(key);
              if (!key.startsWith(month.slice(0, 7))) setMonth(monthStart(key));
              onChange({ date: key, time: "" });
            }}
            onKeyDown={event => {
              const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : null;
              if (step === null) return;
              event.preventDefault();
              const next = shiftDate(key, step);
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
          <button className="teacher-text-button" disabled={disabled} onClick={() => { forgetAvailability(); setRetry(value => value + 1); }} type="button">Try again</button>
        </div> : dayInView ? selectedTimes.length ? <div className="teacher-lesson-picker__slots" aria-label="Available times in Porto">
          {selectedTimes.map(slot => <button
            aria-label={`${formatSlotTime(slot.startAt)} Porto time`}
            aria-pressed={startAt ? slot.startAt === startAt : time === formatSlotTime(slot.startAt)}
            className="teacher-lesson-picker__slot"
            disabled={disabled}
            key={slot.startAt}
            onClick={() => { setDateError(""); onChange({ date: portoDateKey(new Date(slot.startAt)), time: formatSlotTime(slot.startAt), startAt: slot.startAt }); }}
            type="button"
          >{formatSlotTime(slot.startAt)}</button>)}
        </div> : <p>No online booking times on this day. You can enter another time below.</p> : <p>Choose a day to see its available times.</p>}
        {date && time ? <p className="teacher-lesson-picker__chosen">Chosen: <strong>{dateLabel(date, { day: "numeric", month: "short" })}, {time}</strong> · Porto time</p> : null}
      </div>
    </div>
    <details className="teacher-lesson-picker__manual">
      <summary>Enter another time</summary>
      <p className="teacher-profile__note">You can add a lesson outside online booking hours, or record one already had. Booked lessons still keep their time.</p>
      <div className="teacher-lesson-picker__fields">
        <label><span>{dateCaption}</span><input
          disabled={disabled}
          max="9999-12-31"
          onChange={event => {
            const next = event.target.value;
            if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
              setDateError("Choose a valid date with a four-digit year.");
              onChange({ date: "", time: "" });
              return;
            }
            setDateError("");
            if (next) { setMonth(monthStart(next)); setFocused(next); }
            onChange({ date: next, time });
          }}
          type="date"
          value={date}
        /></label>
        <label><span>Time in Porto</span><input disabled={disabled} onChange={event => onChange({ date, time: event.target.value })} type="time" value={time} /></label>
      </div>
      {dateError ? <p className="teacher-inline-error" role="alert">{dateError}</p> : null}
    </details>
  </fieldset>;
}
