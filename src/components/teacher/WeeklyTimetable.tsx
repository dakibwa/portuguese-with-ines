"use client";

import { IN_PERSON } from "@/lib/tutor";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CalendarCheck, CalendarMinus, CalendarPlus, ChevronDown, Plus, Trash2, Video, Globe, UserRound } from "lucide-react";
import { addedByTeacher, type AdminBooking, type AvailabilityException, type OnlineOnlyPeriod } from "@/lib/admin-api";
import { meetingHref } from "@/components/MeetingLink";
import { formatSlotTime } from "@/lib/booking-api";
import { timetableBounds } from "@/lib/timetable-bounds";
import {
  WEEKDAYS,
  bookingSegments,
  canPaintHours,
  dateBlocks,
  dateExtraWindows,
  dateExtras,
  dateKey,
  dateLabel,
  daysOff,
  lessonStarts,
  minuteLabel,
  offersExtraHours,
  onlineOnlyHours,
  onlineOnlyLabel,
  overlapsSpan,
  paintHours,
  parseMinute,
  shiftDate,
  spanAround,
  spanLabel,
  startsLabel,
  weeklyBlocks,
  type HoursBlock,
  type HoursChoice,
  type HoursKind,
  type Span,
  type TeachingWindow,
  type WeekHours,
} from "@/lib/teacher-calendar";

type Props = {
  weekStart: string;
  hours: WeekHours;
  bookings: AdminBooking[];
  exceptions: AvailabilityException[];
  onlineOnly: OnlineOnlyPeriod[];
  editing: boolean;
  interval: number;
  disabled: boolean;
  mobileDay: number;
  dayControlHost?: HTMLElement | null;
  status?: ReactNode;
  /** Where Set exact hours waits, beside Save and View lessons at the top. */
  exactHost?: HTMLElement | null;
  onSelectDay: (index: number) => void;
  onChange: (day: number, windows: TeachingWindow[]) => void;
  onDayOff: (date: string, off: boolean) => void;
  /** Online only all day, or not. */
  onOnlineDay: (date: string, on: boolean) => void;
  /**
   * What some hours of a date are: time off, online only, extra hours, open
   * again (`kind` null) or not working. `original` is the block she pressed,
   * which they replace.
   */
  onChooseHours: (date: string, original: HoursBlock | null, kind: HoursChoice, span: Span) => void;
  /** A free time chosen for a lesson arranged elsewhere: its date and minute in Porto. */
  onAddLesson?: (date: string, minute: number) => void;
  onSelectBooking: (booking: AdminBooking) => void;
};

/**
 * The choice at the times she pressed or dragged over (11 November 2026,
 * Dan: "allow ines to drag over times to make it online only too"): add a
 * lesson there, or what those hours are, their times set exactly first.
 */
type SlotMenu = {
  day: number;
  /** The time it stands at, where focus returns. */
  minute: number;
  /** One time pressed, which can also hold a lesson; a drag cannot. */
  single: boolean;
  /** The hours it sets; null where none can be (past, a day off, a weekly block). */
  span: Span | null;
  /** The block pressed, already off, online only or extra hours. */
  original: HoursBlock | null;
};

/** While editing her hours a drag marks lesson starts (`paint`); on dates it chooses times. */
type Drag = { day: number; from: number; to: number; paint: boolean };

export function WeeklyTimetable({
  weekStart,
  hours,
  bookings,
  exceptions,
  onlineOnly,
  editing,
  interval,
  disabled,
  mobileDay,
  dayControlHost,
  status,
  exactHost,
  onSelectDay,
  onChange,
  onDayOff,
  onOnlineDay,
  onChooseHours,
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
  // The choice's two times as she types them, from and until.
  const [times, setTimes] = useState({ from: "", until: "" });
  const [timesError, setTimesError] = useState("");
  // Extra hours is the kind in view once she arrives on it by keyboard, until
  // she moves to another kind: its dab then says when lessons can start.
  const [extraInView, setExtraInView] = useState(false);
  const startsId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  // A drag across several times has already opened its choice by the time
  // its click arrives, so that click is spent.
  const dragHandled = useRef(false);
  const [exactOpen, setExactOpen] = useState(false);
  const exactRef = useRef<HTMLDivElement>(null);
  const exactId = useId();
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
  // week (10 October 2026, at Dan's request) unless one holds a lesson or
  // extra hours that week, or weekly hours of its own; Set exact hours still
  // offers every day.
  const shown = WEEKDAYS.map((_, index) => index).filter(
    (index) =>
      index < 5 ||
      (hours[WEEKDAYS[index].value] ?? []).length > 0 ||
      (!editing &&
        (segments.some((segment) => segment.date === shiftDate(weekStart, index)) ||
          dateExtraWindows(exceptions, shiftDate(weekStart, index)).length > 0)),
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
      ...dateExtras(exceptions, shiftDate(weekStart, index), interval),
    ]),
    step,
    editing,
  });
  const onlineShown = !editing && shown.some(index => onlineOnlyHours(onlineOnly, shiftDate(weekStart, index)).length > 0);
  const shownDates = shown.map(index => shiftDate(weekStart, index));
  const minutes = Array.from(
    { length: Math.ceil((end - start) / step) },
    (_, index) => start + index * step,
  );
  const focusMinute = Math.max(start, Math.min(end - step, focus.minute));
  const menuSpan = slotMenu?.span ? chosenSpan() : null;
  const choices = slotMenu?.span ? hoursChoices({ ...slotMenu, span: slotMenu.span }) : null;
  // When lessons could start in the times as typed, said while Extra hours is the kind in view.
  const starts = choices?.extra && menuSpan ? startsLabel(menuSpan, interval) : null;
  const startsShown = Boolean(starts) && (slotMenu?.original?.kind === "extra" || extraInView);

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const cell = (minute: number) => gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-slot-day="${focus.day}"][data-slot-minute="${minute}"]`,
    );
    // Taking a block outside her usual hours off the day shortens the grid as
    // it is drawn, and the time she pressed goes with it: the nearest time
    // still drawn takes focus, which otherwise fell to the page.
    (cell(focus.minute) ?? cell(focusMinute))?.focus();
  }, [focus, focusMinute, mobileDay]);

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
        : [
            ...segments
              .filter((segment) => segment.date === date)
              .map((segment) => segment.start),
            ...dateExtraWindows(exceptions, date).map((window) => window.start),
          ]),
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
    setExactOpen(true);
    requestAnimationFrame(() => exactRef.current?.scrollIntoView({ block: "nearest" }));
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

  /** The hours off, or else extra hours, or else online only, that the time touches. */
  function hoursAt(day: number, start: number, end: number): HoursBlock | null {
    const date = dateOf(day);
    const off = spanAround(dateBlocks(exceptions, date), start, end);
    if (off) return { kind: "off", span: off };
    const online = onlineOnlyHours(onlineOnly, date);
    // Extra hours online only at the same times are one block, and open on Extra hours.
    const extra = spanAround(dateExtras(exceptions, date, interval), start, end);
    if (extra) return { kind: "extra", span: extra, online: online.some((span) => span.start === extra.start && span.end === extra.end) };
    const label = spanAround(online, start, end);
    return label ? { kind: "online", span: label } : null;
  }

  function openSlotMenu(menu: SlotMenu) {
    setTimesError("");
    setExtraInView(false);
    setTimes(menu.span ? { from: minuteLabel(menu.span.start), until: menu.span.end === 1440 ? "00:00" : minuteLabel(menu.span.end) } : { from: "", until: "" });
    setSlotMenu(menu);
  }

  function toggle(day: number, minute: number) {
    if (disabled) return;
    if (!editing) {
      setFocus({ day, minute });
      // A time gone can only have a lesson recorded in it (15 October 2026,
      // Dan); a day off or a weekly block can still hold one she arranges.
      if (locked(day, minute)) {
        if (onAddLesson) openSlotMenu({ day, minute, single: true, span: null, original: null });
        return;
      }
      // Hours already off or online only open as the whole block they are in.
      const original = hoursAt(day, minute, minute + step);
      openSlotMenu({ day, minute, single: true, span: original?.span ?? { start: minute, end: minute + step }, original });
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
      paint: editing && !lessonStarts(hours[day] ?? [], interval).some(value => value >= minute && value < minute + step),
    });
  }

  function continueDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-slot-minute]");
    const to = Number(cell?.dataset.slotMinute);
    // A move within the same cell changes nothing, so the grid is not redrawn.
    if (cell && Number(cell.dataset.slotDay) === drag.day && to !== drag.to) setDrag({ ...drag, to });
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
      // Nothing is saved until she chooses what the hours are.
      dragHandled.current = true;
      openSlotMenu({
        day: drag.day,
        minute: Math.max(drag.from, drag.to),
        single: false,
        span: { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) + step },
        original: null,
      });
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
  // The dab comes and goes by keyboard or as the times are typed, never under
  // a pointer, so the choice can keep its place beside the time.
  useLayoutEffect(() => {
    if (slotMenu) placeSlotMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startsShown]);

  /** The choice's times as minutes, or null until the end is after the start. */
  function chosenSpan(): Span | null {
    const span = { start: parseMinute(times.from), end: times.until === "00:00" ? 1440 : parseMinute(times.until) };
    return Number.isFinite(span.start) && Number.isFinite(span.end) && span.start < span.end ? span : null;
  }

  /**
   * What the choice offers for some hours: which kinds they already are,
   * whether extra hours would let a lesson start there (never inside her
   * hours, judged on the times as typed), and the ways back for what is set.
   */
  function hoursChoices(menu: SlotMenu & { span: Span }) {
    const date = dateOf(menu.day);
    const { original } = menu;
    const online = onlineOnlyHours(onlineOnly, date);
    const touches = (spans: Span[]) => overlapsSpan(spans, menu.span.start, menu.span.end);
    const live = menuSpan ?? menu.span;
    return {
      pressed: (kind: HoursKind) => original?.kind === kind || (kind === "online" && original?.kind === "extra" &&
        online.some((span) => span.start <= original.span.start && original.span.end <= span.end)),
      // Extra hours pressed can always take new times, short of the whole day.
      extra: offersExtraHours([...(hours[menu.day] ?? []), ...dateExtraWindows(exceptions, date)], live, interval) ||
        (original?.kind === "extra" && (live.start > 0 || live.end < 1440)),
      openAgain: original?.kind === "off" || original?.kind === "online" || touches(dateBlocks(exceptions, date)) || touches(online),
      notWorking: original?.kind === "extra" || touches(dateExtras(exceptions, date, interval)),
    };
  }

  /** Arriving on a kind by keyboard puts it in view; a pointer press saves at once, as always. */
  function kindInView(kind: HoursKind) {
    return (event: FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) setExtraInView(kind === "extra");
    };
  }

  function choose(kind: HoursChoice) {
    if (!slotMenu?.span) return;
    const span = chosenSpan();
    if (!span) { setTimesError("Choose an end after the start."); return; }
    const { day, original } = slotMenu;
    const already = kind !== null && kind !== "not working" && hoursChoices({ ...slotMenu, span: slotMenu.span }).pressed(kind);
    closeSlotMenu(true);
    // The kind it already is, at the same times, changes nothing.
    if (already && original?.span.start === span.start && original.span.end === span.end) return;
    onChooseHours(dateOf(day), original, kind, span);
  }

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

  /**
   * A date is open, off or online only (11 November 2026, Dan: "a selecter
   * that ticks online only like the day off button"): two switches, and
   * turning one on turns the other off. Past dates are as they were.
   */
  function daySwitches(index: number) {
    const date = shiftDate(weekStart, index);
    const off = offDays.has(date);
    const online = !off && onlineAllDay(date);
    return <span className="teacher-day-switches">
      <button className="teacher-day-toggle" type="button" role="switch" aria-checked={off}
        aria-label={`Day off, ${dateLabel(date)}`} disabled={date < today} onClick={() => onDayOff(date, !off)}>
        <span className="teacher-day-toggle__track" aria-hidden="true" />Day off
      </button>
      <button className="teacher-day-toggle teacher-day-toggle--online" type="button" role="switch" aria-checked={online}
        aria-label={`Online only, ${dateLabel(date)}`} disabled={date < today} onClick={() => onOnlineDay(date, !online)}>
        <span className="teacher-day-toggle__track" aria-hidden="true" />Online only
      </button>
    </span>;
  }

  /** A date online only all day; its hours otherwise show in its cells. */
  function onlineAllDay(date: string) {
    return !editing && onlineOnlyLabel(onlineOnlyHours(onlineOnly, date)) === "All day";
  }

  function dayLabel(index: number) {
    const date = shiftDate(weekStart, index);
    return <>
      <span>{WEEKDAYS[index].short}</span>
      {!editing ? <strong className={date === today ? "teacher-day-today" : undefined}>
        {date === today ? <span className="visually-hidden">Today, </span> : null}{Number(date.slice(-2))}
      </strong> : <span className="teacher-day-full-name">{WEEKDAYS[index].name.slice(3)}</span>}
    </>;
  }

  return (
    <>
      {!editing && dayControlHost ? createPortal(daySwitches(activeDay), dayControlHost) : null}
      {editing && exactHost ? createPortal(
        <button
          aria-controls={exactOpen ? exactId : undefined}
          aria-expanded={exactOpen}
          className="teacher-quiet teacher-exact-toggle"
          onClick={() => setExactOpen(open => !open)}
          type="button"
        >
          <ChevronDown size={15} aria-hidden="true" />Set exact hours
        </button>,
        exactHost,
      ) : null}
      {editing && exactOpen ? (
        <div className="teacher-exact-hours" id={exactId} ref={exactRef}>
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
                className="teacher-quiet"
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
        </div>
      ) : null}
      <div
        className={`teacher-timetable ${editing ? "teacher-timetable--editing" : ""}`}
        ref={gridRef}
        style={{ "--teacher-days": shown.length, "--slot-count": minutes.length, "--slot-step": step } as CSSProperties}
      >
        <div className="teacher-week-days">
          <span className="teacher-axis-heading" aria-hidden="true" />
          {shown.map((index) => {
            const day = WEEKDAYS[index];
            const date = shiftDate(weekStart, index);
            return <div className="teacher-day-cell" key={day.value}>
              <div className="teacher-day-cell__band">
                <button className={`teacher-day-heading ${activeDay === index ? "is-selected" : ""}${!editing && segments.some(segment => segment.date === date) ? " has-lessons" : ""}`}
                  type="button" aria-label={editing ? `${day.name}, show weekly hours` : `${dateLabel(date)}${onlineAllDay(date) ? ", online only" : ""}, show lessons`}
                  aria-pressed={activeDay === index} onClick={() => {
                    if (index !== activeDay) openDay(index);
                    onSelectDay(index);
                    setFocus(current => ({ ...current, day: day.value }));
                  }}>{dayLabel(index)}</button>
                {!editing ? daySwitches(index) : null}
              </div>
            </div>;
          })}
        </div>
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
              const online = editing ? [] : onlineOnlyHours(onlineOnly, date);
              // Extra hours are drawn as her weekly hours are: washed where a lesson can start.
              const extraWindows = editing ? [] : dateExtraWindows(exceptions, date);
              const extraStarts = lessonStarts(extraWindows, interval);
              const extras = editing ? [] : dateExtras(exceptions, date, interval);
              const sameAsExtra = (span: Span) => extras.some((other) => other.start === span.start && other.end === span.end);
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
                    // Extra hours online only at the same times are one block with one label.
                    ...extras.map((span) => ({
                      ...span,
                      text: `Extra hours ${spanLabel(span)}${online.some((other) => other.start === span.start && other.end === span.end) ? ", online only" : ""}`,
                      weekly: false,
                    })),
                    // A day online only all day is named as a day off is, below.
                    ...(onlineAllDay(date) ? [] : online.filter((span) => !sameAsExtra(span)).map((span) => ({
                      ...span,
                      text: `Online only ${spanLabel(span)}`,
                      weekly: false,
                    }))),
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
                  ) : onlineAllDay(date) ? (
                    <span className="teacher-off-label">Online only</span>
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
                    const blocked = overlapsSpan(blocks, minute, cellEnd);
                    // The times a drag or the open choice holds, as she sets them.
                    const chosen = dragging || (slotMenu?.span && slotMenu.day === day.value && menuSpan
                      ? overlapsSpan([menuSpan], minute, cellEnd) : false);
                    const expanded = slotMenu?.day === day.value && slotMenu.minute === minute;
                    const labelled = labels.some(
                      (span) =>
                        Math.max(span.start, start) >= minute &&
                        Math.max(span.start, start) < cellEnd,
                    );
                    const onlineHere = !off && !blocked && overlapsSpan(online, minute, cellEnd);
                    const extraHere = !off && !blocked && overlapsSpan(extras, minute, cellEnd);
                    const bookable = (usual || extraStarts.some((value) => value >= minute && value < cellEnd)) && !off && !blocked;
                    const fixed = past || off || inWeekly;
                    const blockedHere = !fixed && overlapsSpan(blocks, minute, cellEnd);
                    const reason = past
                      ? "past"
                      : off
                        ? "day off"
                        : `${weekly.find((span) => span.start < cellEnd && minute < span.end)?.note || "blocked"} every week`;
                    const kinds = offersExtraHours([...windows, ...extraWindows], { start: minute, end: cellEnd }, interval)
                      ? "time off, online only or extra hours" : "time off or online only";
                    return (
                      <button
                        key={minute}
                        type="button"
                        className={`teacher-time-slot ${bookable ? "is-available" : ""} ${onlineHere ? "is-online-only" : ""} ${blocked && !off ? "is-blocked" : ""} ${chosen ? "is-chosen" : ""} ${labelled ? "is-labelled" : ""} ${weeklyClass} ${hourClass}`}
                        aria-pressed={fixed ? undefined : blocked}
                        aria-disabled={(past && !onAddLesson) || undefined}
                        aria-expanded={fixed && !onAddLesson ? undefined : expanded}
                        aria-label={
                          fixed
                            ? `${minuteLabel(minute)}, ${dateLabel(date)}, ${reason}${past && onAddLesson ? ": add a past lesson" : ""}`
                            : blockedHere
                              ? `${minuteLabel(minute)}–${minuteLabel(cellEnd)}, ${dateLabel(date)}, off: change`
                              : extraHere
                                ? `${minuteLabel(minute)}–${minuteLabel(cellEnd)}, ${dateLabel(date)}, extra hours${onlineHere ? ", online only" : ""}: change`
                                : onlineHere
                                  ? `${minuteLabel(minute)}–${minuteLabel(cellEnd)}, ${dateLabel(date)}, online only: change`
                                  : `${minuteLabel(minute)}–${minuteLabel(cellEnd)}, ${dateLabel(date)}${usual ? ", in your weekly hours" : ""}: add a lesson, ${kinds}`
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
                      key={`${span.weekly}-${span.start}-${span.text}`}
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
                                  ? IN_PERSON
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
          <div className="teacher-calendar-key" role="group" aria-label="Timetable key">
            <span>
              <i className="teacher-key-starts" aria-hidden="true" />
              Weekly hours
            </span>
            <span>
              <i className="teacher-key-booked" aria-hidden="true" />
              Booked
            </span>
            {/* A phone's day tabs take the booked hatch where a day has lessons. */}
            {shownDates.some(date => segments.some(segment => segment.date === date)) ? (
              <span className="teacher-key-tabs">
                <i className="teacher-key-lessons" aria-hidden="true" />
                Day with lessons
              </span>
            ) : null}
            <span>
              <i className="teacher-key-added" aria-hidden="true" />
              Added by you
            </span>
            <span>
              <i className="teacher-key-off" aria-hidden="true" />
              Time off
            </span>
            {onlineShown ? (
              <span>
                <i className="teacher-key-online-only" aria-hidden="true" />
                Online only
              </span>
            ) : null}
            <span>
              <Globe size={12} strokeWidth={2.4} aria-hidden="true" />
              Online
            </span>
            <span>
              <UserRound size={12} strokeWidth={2.4} aria-hidden="true" />
              {IN_PERSON}
            </span>
          </div>
          {status}
        </div>
      ) : null}


      {slotMenu
        ? createPortal(
            <div
              aria-label={`${dateLabel(dateOf(slotMenu.day), { weekday: "long", day: "numeric", month: "long" })}${slotMenu.span ? "" : `, ${minuteLabel(slotMenu.minute)}`}`}
              className="teacher-slot-menu"
              ref={menuRef}
              role="group"
              // Tabbing on past its last choice puts it away, as a press elsewhere does.
              onBlur={(event) => {
                if (event.relatedTarget && !menuRef.current?.contains(event.relatedTarget as Node)) setSlotMenu(null);
              }}
              onKeyDown={(event) => {
                if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || (event.target as HTMLElement).tagName === "INPUT") return;
                event.preventDefault();
                const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
                const at = items.indexOf(document.activeElement as HTMLButtonElement);
                items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
              }}
            >
              <p className="teacher-slot-menu__when" aria-hidden="true">
                {dateLabel(dateOf(slotMenu.day), { weekday: "short", day: "numeric", month: "short" })}{slotMenu.span ? null : ` · ${minuteLabel(slotMenu.minute)}`}
              </p>
              {onAddLesson && slotMenu.single ? (
                <button
                  className="teacher-slot-menu__item"
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
              {choices ? (
                <div className="teacher-slot-menu__hours">
                  {/* Exactly, to the minute, as hours off always could be. */}
                  <div className="teacher-form teacher-slot-menu__times">
                    <input aria-invalid={timesError ? true : undefined} aria-label="From" onChange={(event) => { setTimesError(""); setTimes({ ...times, from: event.target.value }); }} type="time" value={times.from} />
                    <span aria-hidden="true">–</span>
                    <input aria-invalid={timesError ? true : undefined} aria-label="Until" onChange={(event) => { setTimesError(""); setTimes({ ...times, until: event.target.value }); }} type="time" value={times.until} />
                  </div>
                  {timesError ? <p className="teacher-inline-error teacher-slot-menu__error" role="alert">{timesError}</p> : null}
                  {/* What extra hours at these times give a student; also the chip's description. */}
                  {starts ? (
                    <ul className="booking-payment-facts teacher-slot-menu__starts" hidden={!startsShown} id={startsId}>
                      <li>Lessons can start {starts}</li>
                    </ul>
                  ) : null}
                  {/* Each wears the swatch of what it makes, as the key does,
                      and is pressed while the hours already are that. */}
                  <div className="teacher-slot-menu__kinds">
                    <button aria-pressed={choices.pressed("off")} className="teacher-quiet teacher-day-choice" onClick={() => choose("off")} onFocus={kindInView("off")} type="button">
                      <i className="teacher-swatch is-off" aria-hidden="true" />
                      Time off
                    </button>
                    <button aria-pressed={choices.pressed("online")} className="teacher-quiet teacher-day-choice" onClick={() => choose("online")} onFocus={kindInView("online")} type="button">
                      <i className="teacher-swatch is-online" aria-hidden="true" />
                      Online only
                    </button>
                    {choices.extra ? (
                      <button aria-describedby={starts ? startsId : undefined} aria-pressed={choices.pressed("extra")} className="teacher-quiet teacher-day-choice" onClick={() => choose("extra")} onFocus={kindInView("extra")} type="button">
                        <i className="teacher-swatch is-extra" aria-hidden="true" />
                        Extra hours
                      </button>
                    ) : null}
                  </div>
                  {choices.openAgain ? (
                    <button className="teacher-slot-menu__item" onClick={() => choose(null)} type="button">
                      <CalendarCheck size={17} aria-hidden="true" />
                      Open again
                    </button>
                  ) : null}
                  {/* Extra hours' own way back; Open again keeps its meaning. */}
                  {choices.notWorking ? (
                    <button className="teacher-slot-menu__item" onClick={() => choose("not working")} type="button">
                      <CalendarMinus size={17} aria-hidden="true" />
                      Not working
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
