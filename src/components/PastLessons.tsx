"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, CircleX, Send } from "lucide-react";
import { readSession, type MyBooking } from "@/lib/auth-api";
import { clockDiffersFromPorto, dateKeyIn, formatBookedLessonLabel, formatShortDay, formatSlotTime, formatTimeIn } from "@/lib/booking-api";
import { BOOKING_TIME_ZONE } from "@/lib/config";
import type { HomeworkSummary } from "@/lib/homework-api";
import { HOMEWORK, IN_PERSON, LANGUAGE_CODE, TUTOR_NAME } from "@/lib/tutor";

/** The latest few, then the rest on request, so a long history stays short. */
const SHOWN = 6;

type Row = {
  key: string;
  at: string;
  /** Newest first: when it ended, or when it was cancelled. */
  order: number;
  location: "online" | "porto";
  length: string;
  cancelled: boolean;
  homework?: HomeworkSummary;
  /** A cancelled lesson still to come whose time can be booked again. */
  bookAgain?: MyBooking;
};

function historyTime(booking: MyBooking) {
  return Date.parse(booking.status === "cancelled" && booking.cancelledAt ? booking.cancelledAt : booking.endAt);
}

/** "Tue 3 Nov", with the year once it is not this one. */
function day(at: string, zone: string, now: number) {
  // The year is the start of the zone's date key, from a formatter already built.
  const year = dateKeyIn(new Date(at), zone).slice(0, 4);
  return `${formatShortDay(at, zone)}${year === dateKeyIn(new Date(now), zone).slice(0, 4) ? "" : ` ${year}`}`;
}

function homeworkState(item: HomeworkSummary) {
  return item.returnedAt ? "returned" : item.submittedAt ? "sent" : item.started ? "started" : "new";
}

/**
 * Their lessons that have happened, beneath the calendar of those to come:
 * one schedule, with each lesson's homework at the end of its own row (9
 * November 2026, Dan: "even the idea of a student having your lessons, past
 * lessons, homework, can that all be consolidated? … into a super simple
 * scheduling system for them to view of their own"). Two lines a lesson:
 * when, and its homework or Cancelled at the line's end; then how long and
 * where.
 */
export function PastLessons({ bookings, clock, onOpenHomework, onOpenLesson, zone }: {
  bookings: MyBooking[];
  clock: number;
  /** Opens a lesson's homework sheet in the card's place. */
  onOpenHomework: (bookingId: string) => void;
  /** Opens a lesson's own dialog, where it can be booked again. */
  onOpenLesson: (booking: MyBooking, trigger: HTMLElement) => void;
  /** The student's own clock; lessons in Porto keep Porto's. */
  zone: string;
}) {
  const [token] = useState(() => readSession());
  const [homework, setHomework] = useState<HomeworkSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Hidden, homework is not even asked for, and its code never loads.
    if (!token || !HOMEWORK) return;
    const controller = new AbortController();
    void import("@/lib/homework-api").then(({ fetchHomework }) => fetchHomework(token, controller.signal)).then(result => {
      if (readSession() !== token) return;
      setHomework(result); setFailed(false);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [token, attempt]);

  // The booking page redraws this whenever anything on it changes; the rows
  // change only with the lessons, the minute and the homework.
  const rows = useMemo(() => {
    const past = bookings
      .filter(booking => booking.status === "cancelled" || (booking.status === "confirmed" && Date.parse(booking.endAt) <= clock))
      .sort((a, b) => historyTime(b) - historyTime(a) || b.startAt.localeCompare(a.startAt));
    const unmatched = new Set(homework ?? []);
    const list: Row[] = past.map(booking => {
      // Homework names its lesson by when it was; a cancelled lesson has none.
      const item = booking.status === "confirmed"
        ? homework?.find(entry => unmatched.has(entry) && Date.parse(entry.lessonAt) === Date.parse(booking.startAt))
        : undefined;
      if (item) unmatched.delete(item);
      return {
        key: booking.reference,
        at: booking.startAt,
        order: historyTime(booking),
        location: booking.location,
        length: formatBookedLessonLabel(booking.lessonType),
        cancelled: booking.status === "cancelled",
        homework: item,
        bookAgain: booking.status === "cancelled" && booking.canRebook && Date.parse(booking.startAt) > clock ? booking : undefined
      };
    });
    // Homework from a lesson this account no longer lists still has a row.
    for (const item of unmatched) {
      list.push({ key: `homework-${item.bookingId}`, at: item.lessonAt, order: Date.parse(item.lessonAt), location: item.location ?? "online", length: `${item.minutes} mins homework`, cancelled: false, homework: item });
    }
    if (unmatched.size) list.sort((a, b) => b.order - a.order);
    return list;
  }, [bookings, clock, homework]);
  // Checked once for the zone, as the calendar does, not on every redraw.
  const named = useMemo(() => clockDiffersFromPorto(zone), [zone]);

  if (!rows.length && !failed) return null;
  const shown = showAll ? rows : rows.slice(0, SHOWN);
  const hidden = rows.length - shown.length;

  return <section className="past-lessons" id="account-past-lessons" aria-labelledby="past-lessons-heading">
    <h3 className="past-lessons__legend" id="past-lessons-heading">Past lessons</h3>
    {failed ? <p className="past-lessons__note" role="status">
      Your homework couldn&rsquo;t be loaded.{" "}
      <button className="past-lessons__retry" type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
    </p> : null}
    {shown.length ? <ul className="past-lessons__list">
      {shown.map(row => {
        const lessonZone = row.location === "porto" ? BOOKING_TIME_ZONE : zone;
        const state = row.homework ? homeworkState(row.homework) : null;
        return <li className={`past-lesson${row.cancelled ? " is-cancelled" : ""}`} key={row.key}>
          <div className="past-lesson__line">
            <strong className="past-lesson__when">
              <time dateTime={row.at}>{day(row.at, lessonZone, clock)}, <span>{(named ? formatTimeIn : formatSlotTime)(row.at, lessonZone)}</span></time>
            </strong>
            {row.cancelled ? <span className="past-lesson__status"><CircleX size={13} aria-hidden="true" />Cancelled</span>
              : row.homework && state ? <button
                className={`past-lesson__homework past-lesson__homework--${state}`}
                type="button"
                onClick={() => onOpenHomework(row.homework!.bookingId)}
              >
                {state === "returned" ? <CheckCircle2 size={15} aria-hidden="true" /> : state === "sent" ? <Send size={14} aria-hidden="true" /> : null}
                {state === "returned" ? "Done" : state === "sent" ? `With ${TUTOR_NAME}` : state === "started" ? "Continue" : "Start"}
                <span className="visually-hidden"> homework: {row.homework.title}</span>
                {state === "new" || state === "started" ? <ArrowRight size={15} aria-hidden="true" /> : null}
              </button> : null}
          </div>
          <div className="past-lesson__line past-lesson__facts">
            <span>{row.length} · {row.location === "porto" ? IN_PERSON : "Online"}</span>
            {row.homework ? <span className="past-lesson__title" lang={LANGUAGE_CODE}>{row.homework.title}</span> : null}
            {row.bookAgain ? <button className="teacher-quiet" type="button" onClick={(event) => onOpenLesson(row.bookAgain!, event.currentTarget)}>
              Book again<span className="visually-hidden">: {day(row.at, lessonZone, clock)}</span>
            </button> : null}
          </div>
        </li>;
      })}
    </ul> : null}
    {hidden > 0 || showAll && rows.length > SHOWN ? <button className="past-lessons__more" type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
      <ChevronDown size={15} aria-hidden="true" />{showAll ? "Fewer lessons" : `${hidden} earlier ${hidden === 1 ? "lesson" : "lessons"}`}
    </button> : null}
  </section>;
}
