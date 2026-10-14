"use client";

import { useState } from "react";
import { Globe, UserRound } from "lucide-react";
import { AdminApiError, createBookingFor, type AdminStudent } from "@/lib/admin-api";
import { forgetAvailability, formatMoneyCents, portoTimeToUtc } from "@/lib/booking-api";
import { lessonProducts } from "@/lib/lesson-products";
import { priceFor } from "@/components/teacher/StudentPrice";
import { dateLabel } from "@/lib/teacher-calendar";
import { LessonDatePicker } from "@/components/teacher/LessonDatePicker";

type Repeat = "once" | 4 | 6 | 8 | "open";

const empty = {
  lessonType: "single",
  date: "",
  time: "17:00",
  startAt: "",
  location: "online" as "online" | "porto",
  repeat: "once" as Repeat,
};

const trialPrice = lessonProducts.find((product) => product.id === "trial")?.priceCents ?? 0;
const RUN_LENGTHS: [Repeat, string][] = [[4, "4 weeks"], [6, "6 weeks"], [8, "8 weeks"], ["open", "Until stopped"]];

/**
 * One short line for the lessons just added: when, how often, and whether the
 * student was emailed. Weeks left out (her days off) are named.
 */
function addedLine(
  date: string,
  time: string,
  repeat: Repeat,
  series: { booked: number; skipped: { key: string }[] } | undefined,
  emailed: boolean,
) {
  const when = `${dateLabel(date, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
  const often = series ? ` · weekly, ${repeat === "open" ? "until stopped" : `${series.booked} lessons`}` : "";
  const left = series?.skipped.length
    ? ` (${series.skipped.map((week) => dateLabel(week.key, { day: "numeric", month: "short" })).join(", ")} left out)`
    : "";
  return `${when}${often}${left}${emailed ? " · emailed" : ""}`;
}

/**
 * A lesson for one of her students: the lesson, where, how often and when.
 * It only ever belongs to a student she has set up (13 October 2026, Dan: no
 * loose lessons), so there is no address to type, and none is needed: a
 * student with no email yet has lessons like anyone else (14 October 2026,
 * Dan). Lessons for a student still awaiting their welcome are added quietly.
 */
export function LessonForm({
  token,
  student,
  date = "",
  time = "17:00",
  idPrefix,
  tone = "coral",
  onCreated,
  onBusy,
  onCancel,
}: {
  token: string;
  student: AdminStudent;
  date?: string;
  time?: string;
  idPrefix: string;
  /** Coral while adding a lesson is the next thing to do; blue once something else is. */
  tone?: "coral" | "blue";
  onCreated: (message: string) => void;
  onBusy?: (busy: boolean) => void;
  /** Back to where she was, without adding anything. */
  onCancel?: () => void;
}) {
  const [lesson, setLesson] = useState({ ...empty, date, time });
  const quiet = Boolean(student.awaitingWelcome);
  // A trial is one first lesson, and choosing it puts How often back to once.
  const weekly = lesson.repeat !== "once";
  const [busy, setBusyState] = useState(false);
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const [error, setError] = useState("");
  const setBusy = (value: boolean) => {
    setBusyState(value);
    onBusy?.(value);
  };
  return (
    <>
      <form
        className="teacher-form teacher-manual-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !lesson.date || !lesson.time) return;
          setBusy(true);
          setError("");
          try {
            const result = await createBookingFor(token, {
              studentId: student.id,
              lessonType: lesson.lessonType,
              startAt: lesson.startAt || portoTimeToUtc(lesson.date, lesson.time),
              location: lesson.location,
              notes: "",
              ...(weekly ? { repeat: lesson.repeat as Exclude<Repeat, "once"> } : {}),
            });
            // Ready for their next lesson: the same choices, a new date.
            forgetAvailability();
            setAvailabilityRefresh(current => current + 1);
            setLesson((current) => ({ ...current, date: "", startAt: "" }));
            onCreated(addedLine(lesson.date, lesson.time, lesson.repeat, result.series, result.emailed !== false));
          } catch (caught) {
            if (caught instanceof AdminApiError && caught.status === 409 && lesson.startAt) {
              forgetAvailability();
              setAvailabilityRefresh(current => current + 1);
              setLesson(current => ({ ...current, time: "", startAt: "" }));
            }
            setError(
              caught instanceof Error
                ? caught.message
                : "This lesson couldn’t be added.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="teacher-manual-settings">
          {/* Length and place as the booking's sliders, rather than menus to
              open (10 October 2026, at Dan's request). */}
          <fieldset className="teacher-manual-choice">
            <legend>Lesson</legend>
            <div
              className={`segmented segmented--three segmented--position-${["trial", "single", "long"].indexOf(lesson.lessonType)}`}
            >
              <span aria-hidden="true" className="segmented__thumb" />
              {/* Each length carries what this student pays for it (13 October 2026, Dan). */}
              {([["trial", "Trial", trialPrice], ["single", "60 mins", priceFor(student, 60)], ["long", "90 mins", priceFor(student, 90)]] as const).map(([value, label, cents]) => (
                <label className={lesson.lessonType === value ? "is-active" : ""} key={value}>
                  <input
                    aria-label={`${label}, ${formatMoneyCents(cents)}`}
                    checked={lesson.lessonType === value}
                    disabled={busy}
                    name={`${idPrefix}-lesson`}
                    onChange={() => setLesson({ ...lesson, lessonType: value, ...(lesson.startAt ? { time: "", startAt: "" } : {}), ...(value === "trial" ? { repeat: "once" as Repeat } : {}) })}
                    type="radio"
                    value={value}
                  />
                  {/* Named "60 mins, €20"; the dot between them is drawn,
                      and on a phone the price sits under the length. */}
                  <span>{label}</span>
                  <span className="teacher-manual-price">{formatMoneyCents(cents)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {/* Online and In Porto carry the timetable's own marks (12 October
              2026, at Dan's request). */}
          <fieldset className="teacher-manual-choice">
            <legend>Where</legend>
            <div className={`segmented segmented--${lesson.location}`}>
              <span aria-hidden="true" className="segmented__thumb" />
              {([["online", "Online"], ["porto", "In Porto"]] as const).map(([value, label]) => (
                <label className={lesson.location === value ? "is-active" : ""} key={value}>
                  <input
                    aria-label={label}
                    checked={lesson.location === value}
                    disabled={busy}
                    name={`${idPrefix}-location`}
                    onChange={() => setLesson({ ...lesson, location: value })}
                    type="radio"
                    value={value}
                  />
                  {value === "porto" ? (
                    <UserRound size={14} strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <Globe size={14} strokeWidth={2.4} aria-hidden="true" />
                  )}
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {/* A student she sees every week is set up once, as a student books a
              weekly slot (12 October 2026, Dan). A trial is one first lesson. */}
          {lesson.lessonType !== "trial" ? (
            <fieldset className="teacher-manual-choice">
              <legend>How often</legend>
              <div className={`segmented${lesson.repeat === "once" ? "" : " segmented--second"}`}>
                <span aria-hidden="true" className="segmented__thumb" />
                {([["once", "Once"], ["weekly", "Weekly"]] as const).map(([value, label]) => {
                  const active = value === "once" ? lesson.repeat === "once" : lesson.repeat !== "once";
                  return (
                    <label className={active ? "is-active" : ""} key={value}>
                      <input
                        checked={active}
                        disabled={busy}
                        name={`${idPrefix}-often`}
                        onChange={() => setLesson({ ...lesson, repeat: value === "once" ? "once" : "open" })}
                        type="radio"
                        value={value}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          {weekly ? (
            <fieldset className="teacher-manual-choice teacher-manual-choice--wide">
              <legend>For</legend>
              <div
                className={`segmented segmented--four segmented--position-${RUN_LENGTHS.findIndex(([value]) => value === lesson.repeat)}`}
              >
                <span aria-hidden="true" className="segmented__thumb" />
                {RUN_LENGTHS.map(([value, label]) => (
                  <label className={lesson.repeat === value ? "is-active" : ""} key={String(value)}>
                    <input
                      checked={lesson.repeat === value}
                      disabled={busy}
                      name={`${idPrefix}-weeks`}
                      onChange={() => setLesson({ ...lesson, repeat: value })}
                      type="radio"
                      value={String(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
        <LessonDatePicker
          date={lesson.date}
          dateCaption={weekly ? "First date" : "Date"}
          disabled={busy}
          idPrefix={`${idPrefix}-date`}
          lessonType={lesson.lessonType}
          onChange={choice => setLesson(current => ({ ...current, ...choice, startAt: choice.startAt ?? "" }))}
          refresh={availabilityRefresh}
          startAt={lesson.startAt}
          time={lesson.time}
        />
        <div className="teacher-manual-submit teacher-dialog-actions">
          <button
            className={`button button--${tone}`}
            type="submit"
            disabled={busy || !lesson.date || !lesson.time}
          >
            {busy
              ? "Adding…"
              : `${weekly ? "Add weekly lessons" : "Add lesson"}${quiet ? "" : " and email student"}`}
          </button>
          {onCancel ? (
            <button className="button button--outline" disabled={busy} onClick={onCancel} type="button">
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {error ? (
        <p className="teacher-inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
