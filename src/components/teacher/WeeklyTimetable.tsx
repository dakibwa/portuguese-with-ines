"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CalendarOff, CalendarPlus, Plus, Trash2, Video, Globe, UserRound } from "lucide-react";
import { addedByTeacher, type AdminBooking, type AvailabilityException } from "@/lib/admin-api";
import { meetingHref } from "@/components/MeetingLink";
import { formatSlotTime } from "@/lib/booking-api";
import { timetableBounds } from "@/lib/timetable-bounds";
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
  /** A free time chosen for a lesson arranged elsewhere: its date and minute in Porto. */
  onAddLesson?: (date: string, minute: number) => void;
  onSelectBooking: (booking: AdminBooking) => void;
};

/** The choice a free time offers, beside the time chosen. */
type SlotMenu = {
  day: number;
  minute: number;
  canTakeOff: boolean;
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
  onAddLesson,
  onSelectBooking,
}: Props) {
  const today = dateKey(new Date());
  const [focus, setFocus] = useState({
    day: WEEKDAYS[mobileDay].value,
    minute: 600,
  });
  const [exactDay, setExactDay] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [slotMenu, setSlotMenu] = useState<SlotMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // A drag across several times has already taken them off by the time its
  // click arrives, so that click is spent.
  const dragHandled = useRef(false);
  const exactRef = useRef<HTMLDetailsElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openShownDay = useRef(() => {});
  const pendingFocus = useRef(false);
  const pointerType = useRef("");
  const segments = useMemo(
    () => bookingSegments(bookings, weekStart),
    [bookings, weekStart],
  );
  const offDays = useMemo(() => daysOff(exceptions), [exceptions]);
  // Inês doesn't teach at weekends, so Saturday and Sunday stay out of her
  // week (10 October 2026, at Dan's request) unless one holds a lesson that
  // week or weekly hours of its own; Set exact hours still offers every day.
  const shown = WEEKDAYS.map((_, index) => index).filter(
    (index) =>
      index < 5 ||
      (hours[WEEKDAYS[index].value] ?? []).length > 0 ||
      (!editing &&
        segments.some((segment) => segment.date === shiftDate(weekStart, index))),
  );
  const activeDay = shown.includes(mobileDay)
    ? mobileDay
    : [...shown].reverse().find((index) => index < mobileDay) ?? shown[0];
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
  const { start, end } = timetableBounds({
    windows: allWindows,
    lessons: segments,
    blocks: editing ? [] : shown.flatMap(index => [
      ...dateBlocks(exceptions, shiftDate(weekStart, index)),
      ...weeklyBlocks(exceptions, WEEKDAYS[index].value),
    ]),
    step,
    editing,
  });
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

  /**
   * On a phone the day scrolls inside its box. It opens at her first teaching
   * hour that day or the day's first lesson, whichever is earlier, so nothing
   * of her day sits above it out of sight; a day with neither opens at her
   * usual first hour. Wide, the timetable has no scroll of its own and this
   * changes nothing.
   */
  function openDay(index: number) {
    const box = scrollRef.current;
    if (!box) return;
    const date = shiftDate(weekStart, index);
    const firsts = [
      ...(hours[WEEKDAYS[index].value] ?? []).map((window) => window.start),
      ...(editing
        ? []
        : segments
            .filter((segment) => segment.date === date)
            .map((segment) => segment.start)),
    ].filter(Number.isFinite);
    const usual = allWindows.map((window) => window.start);
    const minute = Math.min(...(firsts.length ? firsts : usual.length ? usual : [start]));
    const hour = box.querySelector<HTMLElement>(
      `[data-axis-minute="${Math.max(start, Math.floor(minute / 60) * 60)}"]`,
    );
    box.scrollTop = hour?.offsetTop ?? 0;
  }

  // Reopen the shown day when the timetable appears or the week changes, but
  // not when keyboard focus moves to another day: the focused time stays put.
  useLayoutEffect(() => {
    openShownDay.current = () => openDay(activeDay);
  });
  useLayoutEffect(() => {
    openShownDay.current();
  }, [weekStart]);

  // The arrows turn the week as the student's calendar turns its weeks: the
  // days slide in from the side the week was reached from, within the
  // timetable's own frame, while the hours beside them stay put (12 October
  // 2026, at Dan's request).
  const shownWeek = useRef(weekStart);
  useLayoutEffect(() => {
    const from = shownWeek.current;
    shownWeek.current = weekStart;
    const grid = gridRef.current;
    if (!grid || from === weekStart || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const distance = weekStart > from ? 40 : -40;
    for (const day of grid.querySelectorAll(".teacher-day-cell, .teacher-time-day")) {
      day.animate([{ opacity: 0, translate: `${distance}px 0` }, { opacity: 1, translate: "0 0" }], {
        duration: 380,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      });
    }
  }, [weekStart]);

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
      const date = dateOf(day);
      if (date < today) return;
      // A time already off reopens at once; a free one offers a choice:
      // add a lesson there, or take it off (12 October 2026, at Dan's
      // request: tapping a time used to take it off without saying so).
      if (!locked(day, minute) && takenOff(day, minute)) {
        onBlockTime(date, { start: minute, end: minute + step }, false);
        return;
      }
      setSlotMenu({ day, minute, canTakeOff: !locked(day, minute) });
      return;
    }
    if (!canPaintHours(hours[day] ?? [], interval)) return openExact(day);
    setFocus({ day, minute });
    onChange(
      day,
      paintHours(
        hours[day] ?? [],
        minute,
        minute + step - interval,
        !lessonStarts(hours[day] ?? [], interval).some(value => value >= minute && value < minute + step),
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
    dragHandled.current = false;
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
        ? !lessonStarts(hours[day] ?? [], interval).some(value => value >= minute && value < minute + step)
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
          Math.min(drag.from, drag.to),
          Math.max(drag.from, drag.to) + step - interval,
          drag.paint,
          interval,
        ),
      );
    else if (drag.from === drag.to) {
      // One time pressed and released is a click, which offers the choice.
      setDrag(null);
      return;
    } else {
      dragHandled.current = true;
      onBlockTime(
        dateOf(drag.day),
        {
          start: Math.min(drag.from, drag.to),
          end: Math.max(drag.from, drag.to) + step,
        },
        drag.paint,
      );
    }
    setDrag(null);
  }

  function closeSlotMenu(refocus: boolean) {
    if (refocus && slotMenu) {
      pendingFocus.current = true;
      setFocus({ day: slotMenu.day, minute: slotMenu.minute });
    }
    setSlotMenu(null);
  }

  /**
   * The choice sits just below its time (above it near the window's foot),
   * inside the window, and follows the time if the page or day scrolls.
   */
  function placeSlotMenu() {
    const menu = menuRef.current;
    const cell = slotMenu
      ? gridRef.current?.querySelector<HTMLElement>(
          `[data-slot-day="${slotMenu.day}"][data-slot-minute="${slotMenu.minute}"]`,
        )
      : null;
    if (!menu || !cell) return;
    const rect = cell.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  // Its first option takes focus as it opens.
  useLayoutEffect(() => {
    if (!slotMenu) return;
    placeSlotMenu();
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotMenu]);

  // It closes on a press elsewhere, Escape or a new week.
  useEffect(() => {
    if (!slotMenu) return;
    const outside = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setSlotMenu(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSlotMenu(true);
    };
    const follow = () => placeSlotMenu();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  });
  useEffect(() => setSlotMenu(null), [weekStart, editing]);

  function moveFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    day: number,
    minute: number,
  ) {
    const position = shown.indexOf(
      WEEKDAYS.findIndex((entry) => entry.value === day),
    );
    let nextPosition = position;
    let nextMinute = minute;
    if (event.key === "ArrowLeft") nextPosition = Math.max(0, position - 1);
    else if (event.key === "ArrowRight")
      nextPosition = Math.min(shown.length - 1, position + 1);
    else if (event.key === "ArrowUp") nextMinute -= step;
    else if (event.key === "ArrowDown") nextMinute += step;
    else if (event.key === "Home") nextMinute = start;
    else if (event.key === "End") nextMinute = end - step;
    else return;
    event.preventDefault();
    nextMinute = Math.max(start, Math.min(end - step, nextMinute));
    const nextDay = shown[nextPosition];
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

  function dayOffSwitch(index: number) {
    const date = shiftDate(weekStart, index);
    const off = offDays.has(date);
    return <button className="teacher-day-toggle" type="button" role="switch" aria-checked={off}
      aria-label={`Day off, ${dateLabel(date)}`} disabled={date < today} onClick={() => onDayOff(date, !off)}>
      <span className="teacher-day-toggle__track" aria-hidden="true" />Day off
    </button>;
  }

  function dayLabel(index: number) {
    const date = shiftDate(weekStart, index);
    return <>
      <span>{WEEKDAYS[index].short}</span>
      {!editing ? <strong className={date === today ? "teacher-day-today" : undefined}>
        {date === today ? <span className="visually-hidden">Today, </span> : null}{Number(date.slice(-2))}
      </strong> : <span className="teacher-day-full-name">{WEEKDAYS[index].name.slice(3)}</span>}
      {!editing && segments.some(segment => segment.date === date) ? <i className="teacher-heading-booked-dot" aria-label="Lessons booked" /> : null}
    </>;
  }

  return (
    <>
      <div
        className={`teacher-timetable ${editing ? "teacher-timetable--editing" : ""}`}
        ref={gridRef}
        style={{ "--teacher-days": shown.length, "--slot-count": minutes.length, "--slot-step": step } as CSSProperties}
      >
        <div className="teacher-week-days">
          <span className="teacher-axis-heading">Porto</span>
          {shown.map((index) => {
            const day = WEEKDAYS[index];
            const date = shiftDate(weekStart, index);
            return <div className="teacher-day-cell" key={day.value}>
              <div className="teacher-day-cell__band">
                <button className={`teacher-day-heading ${activeDay === index ? "is-selected" : ""}`}
                  type="button" aria-label={editing ? `${day.name}, show weekly hours` : `${dateLabel(date)}, show lessons`}
                  aria-pressed={activeDay === index} onClick={() => {
                    if (index !== activeDay) openDay(index);
                    onSelectDay(index);
                    setFocus(current => ({ ...current, day: day.value }));
                  }}>{dayLabel(index)}</button>
                {!editing ? dayOffSwitch(index) : null}
              </div>
            </div>;
          })}
        </div>
        {!editing ? <div className="teacher-mobile-day-band">
          <span className="teacher-axis-heading">Porto</span>
          <span className="teacher-day-heading">{dayLabel(activeDay)}</span>
          {dayOffSwitch(activeDay)}
        </div> : null}
        <div
          className="teacher-timetable-scroll"
          ref={scrollRef}
          aria-label={
            editing
              ? "Weekly hours"
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
                    data-axis-minute={minute}
                    style={{
                      top: `calc(${index} * var(--teacher-slot-height))`,
                    }}
                  >
                    {minuteLabel(minute)}
                  </span>
                ) : null,
              )}
            </div>
            {shown.map((index) => {
              const day = WEEKDAYS[index];
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
                  data-mobile-active={activeDay === index}
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
                    const startsInCell = starts.filter(
                      (value) => value >= minute && value < cellEnd,
                    );
                    const usual = startsInCell.length > 0;
                    const inWeekly = overlapsSpan(weekly, minute, cellEnd);
                    const focusable =
                      WEEKDAYS[activeDay].value === day.value &&
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
                      const mixed = !dragging && usual && interval < step && startsInCell.length < step / interval;
                      const availableTimes = dragging && selected
                        ? Array.from({ length: step / interval }, (_, index) => minuteLabel(minute + index * interval))
                        : startsInCell.map(minuteLabel);
                      return (
                        <button
                          key={minute}
                          type="button"
                          className={`teacher-time-slot ${selected ? "is-available" : ""} ${mixed ? "is-partial" : ""} ${weeklyClass} ${hourClass}`}
                          aria-pressed={mixed ? "mixed" : selected}
                          disabled={disabled}
                          aria-label={`${day.name} ${selected ? availableTimes.join(" and ") : minuteLabel(minute)}, ${selected ? "lesson start available" : "unavailable"}`}
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
                          <span>{mixed ? availableTimes.join(", ") : minuteLabel(minute)}</span>
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
                    const blockedHere = !fixed && overlapsSpan(blocks, minute, cellEnd);
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
                        aria-disabled={past || undefined}
                        aria-haspopup={past || blockedHere ? undefined : "menu"}
                        aria-label={
                          fixed
                            ? `${minuteLabel(minute)}, ${dateLabel(date)}, ${reason}`
                            : blockedHere
                              ? `${minuteLabel(minute)}–${minuteLabel(cellEnd)}, ${dateLabel(date)}, off: reopen`
                              : `${minuteLabel(minute)}–${minuteLabel(cellEnd)}, ${dateLabel(date)}${usual ? ", in your weekly hours" : ""}: add a lesson or take it off`
                        }
                        {...pointer}
                        onClick={() => {
                          if (dragHandled.current) {
                            dragHandled.current = false;
                            return;
                          }
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
                        ) => {
                          const top = `calc(${(bookingStart - start) / step} * var(--teacher-slot-height) + 2px)`;
                          const short = bookingEnd - bookingStart < 60;
                          const height = `max(var(--teacher-lesson-min-height, 38px), calc(${(bookingEnd - bookingStart) / step} * var(--teacher-slot-height) - 4px))`;
                          const meet = meetingHref({
                            meetingUrl: booking.meeting_url,
                            location: booking.location,
                            status: booking.status,
                          });
                          return (
                          <Fragment key={`${booking.id}-${position}`}>
                          <button
                            type="button"
                            className={`teacher-calendar-lesson ${booking.location === "porto" ? "teacher-calendar-lesson--porto" : ""}${short ? " teacher-calendar-lesson--short" : ""}${booking.attendance_status === "no_show" ? " teacher-calendar-lesson--no-show" : ""}${addedByTeacher(booking) ? " teacher-calendar-lesson--added" : ""}`}
                            style={{
                              top,
                              height,
                            }}
                            aria-label={`${booking.student_name}, ${dateLabel(date)}, ${formatSlotTime(booking.starts_at)} to ${formatSlotTime(booking.ends_at)}, ${booking.location === "porto" ? "in Porto" : "online"}${booking.attendance_status === "no_show" ? ", marked as a no-show" : ""}${addedByTeacher(booking) ? ", added by you" : ""}. View lesson`}
                            onClick={() => onSelectBooking(booking)}
                          >
                            <span className="teacher-lesson-time">
                              {formatSlotTime(booking.starts_at)}–
                              {formatSlotTime(booking.ends_at)}
                              {booking.attendance_status === "no_show" ? (
                                <em className="teacher-lesson-no-show">No-show</em>
                              ) : null}
                              {/* A lesson she added herself reads apart from
                                  the students' own bookings while lessons
                                  move onto the site (12 October 2026, at
                                  Dan's request); the key says "Added by you". */}
                              {addedByTeacher(booking) ? (
                                <em className="teacher-lesson-added" aria-hidden="true">Added</em>
                              ) : null}
                            </span>
                            <strong>{booking.student_name}</strong>
                            {/* Marked as on the student's calendar, a globe
                                or a person in the top right corner, with the
                                key beneath the week saying which is which
                                (10 October 2026, at Dan's request). */}
                            <span className="teacher-lesson-location">
                              {booking.location === "porto" ? (
                                <UserRound size={12} strokeWidth={2.4} aria-hidden="true" />
                              ) : (
                                <Globe size={12} strokeWidth={2.4} aria-hidden="true" />
                              )}
                              <span className="visually-hidden">
                                {booking.location === "porto"
                                  ? "In Porto"
                                  : "Online"}
                              </span>
                            </span>
                          </button>
                          {/* Over the lesson's foot rather than inside it,
                              since a link can't sit within a button: one tap
                              to the lesson's call (10 October 2026, at Dan's
                              request). */}
                          {meet ? (
                            <a
                              className={`teacher-lesson-meet${short ? " teacher-lesson-meet--short" : ""}`}
                              href={meet}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Join Google Meet with ${booking.student_name}, ${formatSlotTime(booking.starts_at)}`}
                              style={{ top: short ? `calc(${top} + (${height} - 18px) / 2)` : `calc(${top} + ${height} - 24px)` }}
                            >
                              <Video size={12} aria-hidden="true" />
                              Meet
                            </a>
                          ) : null}
                          </Fragment>
                          );
                        },
                      )
                    : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* The key reads the week; while she edits her hours, the marked
          starts and their two dabs above say it all. */}
      {!editing ? (
        <div className="teacher-grid-footnote">
          <div className="teacher-calendar-key" aria-label="Timetable key">
            <span>
              <i className="teacher-key-starts" />
              Weekly hours
            </span>
            <span>
              <i className="teacher-key-booked" />
              Booked
            </span>
            <span>
              <i className="teacher-key-added" />
              Added by you
            </span>
            <span>
              <i className="teacher-key-off" />
              Time off
            </span>
            <span>
              <Globe size={12} strokeWidth={2.4} aria-hidden="true" />
              Online
            </span>
            <span>
              <UserRound size={12} strokeWidth={2.4} aria-hidden="true" />
              In Porto
            </span>
          </div>
          {status}
        </div>
      ) : null}

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

      {slotMenu
        ? createPortal(
            <div
              aria-label={`${dateLabel(dateOf(slotMenu.day), { weekday: "long", day: "numeric", month: "long" })}, ${minuteLabel(slotMenu.minute)}`}
              className="teacher-slot-menu"
              ref={menuRef}
              role="menu"
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
                const at = items.indexOf(document.activeElement as HTMLButtonElement);
                items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
              }}
            >
              <p className="teacher-slot-menu__when" aria-hidden="true">
                {dateLabel(dateOf(slotMenu.day), { weekday: "short", day: "numeric", month: "short" })} · {minuteLabel(slotMenu.minute)}
              </p>
              {onAddLesson ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    const { day, minute } = slotMenu;
                    // The time keeps focus behind the form, which hands it back.
                    gridRef.current
                      ?.querySelector<HTMLElement>(`[data-slot-day="${day}"][data-slot-minute="${minute}"]`)
                      ?.focus({ preventScroll: true });
                    setSlotMenu(null);
                    onAddLesson(dateOf(day), minute);
                  }}
                >
                  <CalendarPlus size={17} aria-hidden="true" />
                  Add a lesson here
                </button>
              ) : null}
              {slotMenu.canTakeOff ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    const { day, minute } = slotMenu;
                    closeSlotMenu(true);
                    onBlockTime(dateOf(day), { start: minute, end: minute + step }, true);
                  }}
                >
                  <CalendarOff size={17} aria-hidden="true" />
                  Take this time off
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
