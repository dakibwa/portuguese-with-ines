"use client";

import {
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Plus, Trash2, Video, MapPin } from "lucide-react";
import type { AdminBooking, AvailabilityException } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import {
  WEEKDAYS,
  bookingSegments,
  canPaintHours,
  dateBlocks,
  dateKey,
  dateLabel,
  daysOff,
  lessonStarts,
  minuteLabel,
  overlapsSpan,
  paintHours,
  parseMinute,
  shiftDate,
  spanLabel,
  weeklyBlocks,
  type Span,
  type TeachingWindow,
  type WeekHours,
} from "@/lib/teacher-calendar";

type Props = {
  weekStart: string;
  hours: WeekHours;
  bookings: AdminBooking[];
  exceptions: AvailabilityException[];
  editing: boolean;
  interval: number;
  disabled: boolean;
  mobileDay: number;
  status?: ReactNode;
  onSelectDay: (index: number) => void;
  onChange: (day: number, windows: TeachingWindow[]) => void;
  onDayOff: (date: string, off: boolean) => void;
  onBlockTime: (date: string, span: Span, blocked: boolean) => void;
  onSelectBooking: (booking: AdminBooking) => void;
};

/** `paint` marks lesson starts while editing, and takes time off on dates. */
type Drag = { day: number; from: number; to: number; paint: boolean };

export function WeeklyTimetable({
  weekStart,
  hours,
  bookings,
  exceptions,
  editing,
  interval,
  disabled,
  mobileDay,
  status,
  onSelectDay,
  onChange,
  onDayOff,
  onBlockTime,
  onSelectBooking,
}: Props) {
  const today = dateKey(new Date());
  const [focus, setFocus] = useState({
    day: WEEKDAYS[mobileDay].value,
    minute: 600,
  });
  const [exactDay, setExactDay] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const exactRef = useRef<HTMLDetailsElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const pointerType = useRef("");
  const segments = useMemo(
    () => bookingSegments(bookings, weekStart),
    [bookings, weekStart],
  );
  const offDays = useMemo(() => daysOff(exceptions), [exceptions]);
  // Rows stay half-hourly even when lessons can start every 15 minutes: a
  // lesson at :15 or :45 still sits at its exact time, and her week stays one
  // screen tall instead of doubling. The exact-time editor covers quarter hours.
  const step = interval === 60 ? 60 : 30;
  const allWindows = Object.values(hours)
    .flat()
    .filter(
      (window) =>
        Number.isFinite(window.start) && Number.isFinite(window.lastStart),
    );
  // 08:00–20:00, widened to fit any teaching window or lesson outside it.
  const start = Math.max(
    0,
    Math.floor(
      Math.min(
        480,
        ...allWindows.map((w) => w.start),
        ...segments.map((b) => b.start),
      ) / 60,
    ) * 60,
  );
  const end = Math.min(
    1440,
    Math.ceil(
      Math.max(
        1200,
        ...allWindows.map((w) => w.lastStart + step),
        ...segments.map((b) => b.end),
      ) / 60,
    ) * 60,
  );
  const minutes = Array.from(
    { length: Math.ceil((end - start) / step) },
    (_, index) => start + index * step,
  );
  const focusMinute = Math.max(start, Math.min(end - step, focus.minute));

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-slot-day="${focus.day}"][data-slot-minute="${focus.minute}"]`,
      )
      ?.focus();
  }, [focus, mobileDay]);

  function openExact(day: number) {
    setExactDay(day);
    if (exactRef.current) {
      exactRef.current.open = true;
      exactRef.current.scrollIntoView({ block: "nearest" });
    }
  }

  function dateOf(day: number) {
    return shiftDate(
      weekStart,
      WEEKDAYS.findIndex((entry) => entry.value === day),
    );
  }

  /** Past dates, days off and weekly blocks such as lunch are not toggled here. */
  function locked(day: number, minute: number) {
    const date = dateOf(day);
    return (
      date < today ||
      offDays.has(date) ||
      overlapsSpan(weeklyBlocks(exceptions, day), minute, minute + step)
    );
  }

  function takenOff(day: number, minute: number) {
    return overlapsSpan(
      dateBlocks(exceptions, dateOf(day)),
      minute,
      minute + step,
    );
  }

  function toggle(day: number, minute: number) {
    if (disabled) return;
    if (!editing) {
      setFocus({ day, minute });
      if (!locked(day, minute))
        onBlockTime(
          dateOf(day),
          { start: minute, end: minute + step },
          !takenOff(day, minute),
        );
      return;
    }
    if (!canPaintHours(hours[day] ?? [], interval)) return openExact(day);
    setFocus({ day, minute });
    onChange(
      day,
      paintHours(
        hours[day] ?? [],
        minute,
        minute,
        !lessonStarts(hours[day] ?? [], interval).includes(minute),
        interval,
      ),
    );
  }

  function beginDrag(
    event: PointerEvent<HTMLButtonElement>,
    day: number,
    minute: number,
  ) {
    pointerType.current = event.pointerType;
    if (event.pointerType !== "mouse" || event.button !== 0 || disabled) return;
    if (
      editing ? !canPaintHours(hours[day] ?? [], interval) : locked(day, minute)
    )
      return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setFocus({ day, minute });
    setDrag({
      day,
      from: minute,
      to: minute,
      paint: editing
        ? !lessonStarts(hours[day] ?? [], interval).includes(minute)
        : !takenOff(day, minute),
    });
  }

  function continueDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-slot-minute]");
    if (cell && Number(cell.dataset.slotDay) === drag.day)
      setDrag({ ...drag, to: Number(cell.dataset.slotMinute) });
  }

  function finishDrag() {
    if (!drag) return;
    if (editing)
      onChange(
        drag.day,
        paintHours(
          hours[drag.day] ?? [],
          drag.from,
          drag.to,
          drag.paint,
          interval,
        ),
      );
    else
      onBlockTime(
        dateOf(drag.day),
        {
          start: Math.min(drag.from, drag.to),
          end: Math.max(drag.from, drag.to) + step,
        },
        drag.paint,
      );
    setDrag(null);
  }

  function moveFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    day: number,
    minute: number,
  ) {
    const dayIndex = WEEKDAYS.findIndex((entry) => entry.value === day);
    let nextDay = dayIndex;
    let nextMinute = minute;
    if (event.key === "ArrowLeft") nextDay = Math.max(0, dayIndex - 1);
    else if (event.key === "ArrowRight") nextDay = Math.min(6, dayIndex + 1);
    else if (event.key === "ArrowUp") nextMinute -= step;
    else if (event.key === "ArrowDown") nextMinute += step;
    else if (event.key === "Home") nextMinute = start;
    else if (event.key === "End") nextMinute = end - step;
    else return;
    event.preventDefault();
    nextMinute = Math.max(start, Math.min(end - step, nextMinute));
    const weekday = WEEKDAYS[nextDay].value;
    pendingFocus.current = true;
    onSelectDay(nextDay);
    setFocus({ day: weekday, minute: nextMinute });
  }

  function updateExact(index: number, patch: Partial<TeachingWindow>) {
    onChange(
      exactDay,
      (hours[exactDay] ?? []).map((window, position) =>
        position === index ? { ...window, ...patch } : window,
      ),
    );
  }

  return (
    <>
      <div
        className={`teacher-timetable ${editing ? "teacher-timetable--editing" : ""}`}
        ref={gridRef}
      >
        <div className="teacher-week-days">
          <span className="teacher-axis-heading">Porto</span>
          {WEEKDAYS.map((day, index) => {
            const date = shiftDate(weekStart, index);
            return (
              <button
                className={`teacher-day-heading ${mobileDay === index ? "is-selected" : ""} ${!editing && date === today ? "is-today" : ""}`}
                key={day.value}
                type="button"
                aria-label={
                  editing
                    ? `${day.name}, show teaching hours`
                    : `${dateLabel(date)}, show lessons`
                }
                aria-pressed={mobileDay === index}
                onClick={() => {
                  onSelectDay(index);
                  setFocus((current) => ({ ...current, day: day.value }));
                }}
              >
                <span>{day.short}</span>
                {!editing ? (
                  <strong>{Number(date.slice(-2))}</strong>
                ) : (
                  <span className="teacher-day-full-name">
                    {day.name.slice(3)}
                  </span>
                )}
                {!editing &&
                segments.some((segment) => segment.date === date) ? (
                  <i
                    className="teacher-heading-booked-dot"
                    aria-label="Lessons booked"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {!editing ? (
          <div className="teacher-day-toggles">
            <span aria-hidden="true" />
            {WEEKDAYS.map((day, index) => {
              const date = shiftDate(weekStart, index);
              const off = offDays.has(date);
              return (
                <div
                  className="teacher-day-toggle-cell"
                  data-mobile-active={mobileDay === index}
                  key={day.value}
                >
                  <button
                    className="teacher-day-toggle"
                    type="button"
                    role="switch"
                    aria-checked={off}
                    aria-label={`Day off, ${dateLabel(date)}`}
                    disabled={date < today}
                    onClick={() => onDayOff(date, !off)}
                  >
                    <span
                      className="teacher-day-toggle__track"
                      aria-hidden="true"
                    />
                    Day off
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        <div
          className="teacher-timetable-scroll"
          aria-label={
            editing
              ? "Weekly teaching hours"
              : "Your lessons and time off this week"
          }
        >
          <div
            className="teacher-time-grid"
            style={{ "--slot-count": minutes.length } as CSSProperties}
          >
            <div className="teacher-time-axis" aria-hidden="true">
              {minutes.map((minute, index) =>
                minute % 60 === 0 ? (
                  <span
                    key={minute}
                    style={{
                      top: `calc(${index} * var(--teacher-slot-height))`,
                    }}
                  >
                    {minuteLabel(minute)}
                  </span>
                ) : null,
              )}
            </div>
            {WEEKDAYS.map((day, index) => {
              const date = shiftDate(weekStart, index);
              const off = !editing && offDays.has(date);
              const past = date < today;
              const windows = hours[day.value] ?? [];
              const starts = lessonStarts(windows, interval);
              const weekly = weeklyBlocks(exceptions, day.value);
              const blocks = editing ? [] : dateBlocks(exceptions, date);
              const daySegments = segments.filter(
                (segment) => segment.date === date,
              );
              const labels = off
                ? []
                : [
                    ...blocks.map((span) => ({
                      ...span,
                      text: `Off ${spanLabel(span)}`,
                      weekly: false,
                    })),
                    ...weekly.map((span) => ({
                      ...span,
                      text: span.note || "Blocked every week",
                      weekly: true,
                    })),
                  ].filter((span) => span.end > start && span.start < end);
              return (
                <div
                  key={day.value}
                  data-mobile-active={mobileDay === index}
                  className={`teacher-time-day ${off ? "teacher-time-day--off" : ""} ${!editing && past ? "teacher-time-day--past" : ""}`}
                >
                  {off ? (
                    <span className="teacher-off-label">
                      Day off
                      {offDays.get(date) ? ` · ${offDays.get(date)}` : ""}
                    </span>
                  ) : null}
                  {minutes.map((minute) => {
                    const cellEnd = minute + step;
                    const dragging =
                      drag?.day === day.value &&
                      minute >= Math.min(drag.from, drag.to) &&
                      minute <= Math.max(drag.from, drag.to);
                    const usual = starts.some(
                      (value) => value >= minute && value < cellEnd,
                    );
                    const inWeekly = overlapsSpan(weekly, minute, cellEnd);
                    const focusable =
                      WEEKDAYS[mobileDay].value === day.value &&
                      focusMinute === minute;
                    const pointer = {
                      tabIndex: focusable ? 0 : -1,
                      "data-slot-day": day.value,
                      "data-slot-minute": minute,
                      onPointerDown: (event: PointerEvent<HTMLButtonElement>) =>
                        beginDrag(event, day.value, minute),
                      onPointerMove: continueDrag,
                      onPointerUp: finishDrag,
                      onPointerCancel: () => setDrag(null),
                      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) =>
                        moveFocus(event, day.value, minute),
                    };
                    const hourClass = minute % 60 === 0 ? "is-hour" : "";
                    const weeklyClass = inWeekly && !off ? "is-weekly" : "";
                    if (editing) {
                      const selected = dragging ? drag.paint : usual;
                      return (
                        <button
                          key={minute}
                          type="button"
                          className={`teacher-time-slot ${selected ? "is-available" : ""} ${weeklyClass} ${hourClass}`}
                          aria-pressed={selected}
                          disabled={disabled}
                          aria-label={`${day.name} ${minuteLabel(minute)}, ${selected ? "lesson start available" : "unavailable"}`}
                          {...pointer}
                          onClick={(event) => {
                            if (
                              event.detail === 0 ||
                              pointerType.current !== "mouse" ||
                              !canPaintHours(windows, interval)
                            )
                              toggle(day.value, minute);
                          }}
                        >
                          <span>{minuteLabel(minute)}</span>
                        </button>
                      );
                    }
                    const blocked = dragging
                      ? drag.paint
                      : overlapsSpan(blocks, minute, cellEnd);
                    const labelled = labels.some(
                      (span) =>
                        Math.max(span.start, start) >= minute &&
                        Math.max(span.start, start) < cellEnd,
                    );
                    const fixed = past || off || inWeekly;
                    const reason = past
                      ? "past"
                      : off
                        ? "day off"
                        : `${weekly.find((span) => span.start < cellEnd && minute < span.end)?.note || "blocked"} every week`;
                    return (
                      <button
                        key={minute}
                        type="button"
                        className={`teacher-time-slot ${usual && !off && !blocked ? "is-available" : ""} ${blocked && !off ? "is-blocked" : ""} ${labelled ? "is-labelled" : ""} ${weeklyClass} ${hourClass}`}
                        aria-pressed={fixed ? undefined : blocked}
                        aria-disabled={fixed || undefined}
                        aria-label={
                          fixed
                            ? `${minuteLabel(minute)}, ${dateLabel(date)}, ${reason}`
                            : `Take ${minuteLabel(minute)}–${minuteLabel(cellEnd)} off, ${dateLabel(date)}${usual ? ", usual teaching time" : ""}`
                        }
                        {...pointer}
                        onClick={(event) => {
                          if (
                            event.detail === 0 ||
                            pointerType.current !== "mouse"
                          )
                            toggle(day.value, minute);
                        }}
                      >
                        <span>{minuteLabel(minute)}</span>
                      </button>
                    );
                  })}
                  {/* After the cells, so a focused cell never hides it; lessons still cover it. */}
                  {labels.map((span) => (
                    <span
                      className={`teacher-block-label ${span.weekly ? "is-weekly" : ""}`}
                      key={`${span.weekly}-${span.start}`}
                      aria-hidden="true"
                      style={{
                        top: `calc(${(Math.max(span.start, start) - start) / step} * var(--teacher-slot-height) + 3px)`,
                      }}
                    >
                      {span.text}
                    </span>
                  ))}
                  {!editing
                    ? daySegments.map(
                        (
                          { booking, start: bookingStart, end: bookingEnd },
                          position,
                        ) => (
                          <button
                            key={`${booking.id}-${position}`}
                            type="button"
                            className={`teacher-calendar-lesson ${booking.location === "porto" ? "teacher-calendar-lesson--porto" : ""}${booking.attendance_status === "no_show" ? " teacher-calendar-lesson--no-show" : ""}`}
                            style={{
                              top: `calc(${(bookingStart - start) / step} * var(--teacher-slot-height) + 2px)`,
                              height: `max(38px, calc(${(bookingEnd - bookingStart) / step} * var(--teacher-slot-height) - 4px))`,
                            }}
                            aria-label={`${booking.student_name}, ${dateLabel(date)}, ${formatSlotTime(booking.starts_at)} to ${formatSlotTime(booking.ends_at)}, ${booking.location === "porto" ? "in Porto" : "online"}${booking.attendance_status === "no_show" ? ", marked as a no-show" : ""}. View lesson`}
                            onClick={() => onSelectBooking(booking)}
                          >
                            <span className="teacher-lesson-time">
                              {formatSlotTime(booking.starts_at)}–
                              {formatSlotTime(booking.ends_at)}
                              {booking.attendance_status === "no_show" ? (
                                <em className="teacher-lesson-no-show">No-show</em>
                              ) : null}
                            </span>
                            <strong>{booking.student_name}</strong>
                            <span className="teacher-lesson-location">
                              {booking.location === "porto" ? (
                                <MapPin size={12} aria-hidden="true" />
                              ) : (
                                <Video size={12} aria-hidden="true" />
                              )}
                              {booking.location === "porto"
                                ? "In Porto"
                                : "Online"}
                            </span>
                          </button>
                        ),
                      )
                    : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="teacher-grid-footnote">
        <div className="teacher-calendar-key" aria-label="Timetable key">
          <span>
            <i className="teacher-key-starts" />
            {editing ? "Lesson starts" : "Usual hours"}
          </span>
          {!editing ? (
            <>
              <span>
                <i className="teacher-key-booked" />
                Booked
              </span>
              <span>
                <i className="teacher-key-off" />
                Time off
              </span>
            </>
          ) : null}
        </div>
        {status}
      </div>

      {editing ? (
        <details className="teacher-exact-hours" ref={exactRef}>
          <summary>Set exact hours</summary>
          <div className="teacher-form teacher-exact-hours__body">
            <label>
              <span>Day</span>
              <select
                value={exactDay}
                onChange={(event) => setExactDay(Number(event.target.value))}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="teacher-exact-windows">
              {(hours[exactDay] ?? []).map((window, index) => (
                <div className="teacher-exact-window" key={index}>
                  <label>
                    <span>First start</span>
                    <input
                      aria-label={`${WEEKDAYS.find((d) => d.value === exactDay)!.name} window ${index + 1}, first start`}
                      type="time"
                      disabled={disabled}
                      value={
                        Number.isFinite(window.start)
                          ? minuteLabel(window.start)
                          : ""
                      }
                      onChange={(event) =>
                        updateExact(index, {
                          start: parseMinute(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Last start</span>
                    <input
                      aria-label={`${WEEKDAYS.find((d) => d.value === exactDay)!.name} window ${index + 1}, last start`}
                      type={window.lastStart === 1440 ? "text" : "time"}
                      disabled={disabled}
                      value={
                        Number.isFinite(window.lastStart)
                          ? minuteLabel(window.lastStart)
                          : ""
                      }
                      onChange={(event) =>
                        updateExact(index, {
                          lastStart: parseMinute(event.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    className="teacher-icon-button"
                    aria-label={`Remove teaching window ${index + 1}`}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange(
                        exactDay,
                        (hours[exactDay] ?? []).filter(
                          (_, position) => position !== index,
                        ),
                      )
                    }
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                className="teacher-text-button"
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange(exactDay, [
                    ...(hours[exactDay] ?? []),
                    { start: 600, lastStart: 690 },
                  ])
                }
              >
                <Plus size={15} aria-hidden="true" />
                Add a time window
              </button>
            </div>
          </div>
        </details>
      ) : null}
    </>
  );
}
