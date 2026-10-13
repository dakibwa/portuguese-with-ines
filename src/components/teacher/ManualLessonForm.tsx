"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { CheckCircle2, Globe, Plus, UserRound, X } from "lucide-react";
import { createBookingFor, type AdminStudent } from "@/lib/admin-api";
import { portoTimeToUtc } from "@/lib/booking-api";
import { dateLabel, minuteLabel } from "@/lib/teacher-calendar";
import { restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";

type Repeat = "once" | 4 | 6 | 8 | "open";

const empty = {
  email: "",
  name: "",
  lessonType: "single",
  date: "",
  time: "17:00",
  location: "online" as "online" | "porto",
  repeat: "once" as Repeat,
};

const ADDED = "Lesson added. The student has been emailed the details.";
const RUN_LENGTHS: [Repeat, string][] = [[4, "4 weeks"], [6, "6 weeks"], [8, "8 weeks"], ["open", "Until stopped"]];

function addedMessage(series?: { booked: number; skipped: { key: string }[] }) {
  if (!series) return ADDED;
  const left = series.skipped.length
    ? ` ${series.skipped.length === 1 ? "One week was" : `${series.skipped.length} weeks were`} left out (${series.skipped
        .map((week) => dateLabel(week.key, { day: "numeric", month: "short" }))
        .join(", ")}).`
    : "";
  return `Weekly lessons added: ${series.booked} booked.${left} The student has been emailed the dates.`;
}

/**
 * A lesson arranged elsewhere: the student, the lesson, where, and when. The
 * same form serves the section beneath the week and the dialog a free time
 * opens with its date and time already in place. Her students (`known`, read
 * once by the schedule) are suggested as she types either their email or
 * their name, and choosing one fills in the other (12 October 2026, Dan: as
 * easy as possible for her).
 */
function LessonForm({
  token,
  known,
  date = "",
  time = "17:00",
  student,
  idPrefix,
  onCreated,
  onBusy,
}: {
  token: string;
  known: AdminStudent[];
  date?: string;
  time?: string;
  /** Chosen from her list of students, so only the lesson is left to fill in. */
  student?: { email: string; name: string };
  idPrefix: string;
  onCreated: (message: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [lesson, setLesson] = useState({ ...empty, date, time, ...(student ? { email: student.email, name: student.name } : {}) });
  const knownStudent = known.find((entry) => entry.email.toLowerCase() === lesson.email.trim().toLowerCase());
  // A trial is one first lesson, and choosing it puts How often back to once.
  const weekly = lesson.repeat !== "once";
  const [busy, setBusyState] = useState(false);
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
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const result = await createBookingFor(token, {
              email: lesson.email.trim(),
              name: knownStudent?.name ?? lesson.name.trim(),
              lessonType: lesson.lessonType,
              startAt: portoTimeToUtc(lesson.date, lesson.time),
              location: lesson.location,
              notes: "",
              ...(weekly ? { repeat: lesson.repeat as Exclude<Repeat, "once"> } : {}),
            });
            // Ready for the next student, never the one just added.
            setLesson({ ...empty, date, time });
            onCreated(addedMessage(result.series));
          } catch (caught) {
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
        <label>
          <span>Student&rsquo;s email</span>
          <input
            type="email"
            required
            autoComplete="off"
            disabled={busy}
            list={known.length ? `${idPrefix}-emails` : undefined}
            value={lesson.email}
            onChange={(e) => setLesson({ ...lesson, email: e.target.value })}
          />
          {known.length ? (
            <datalist id={`${idPrefix}-emails`}>
              {known.map((entry) => (
                <option key={entry.id} value={entry.email}>{entry.name}</option>
              ))}
            </datalist>
          ) : null}
        </label>
        <label>
          <span>Student&rsquo;s name</span>
          <input
            type="text"
            disabled={busy}
            readOnly={Boolean(knownStudent)}
            aria-describedby={knownStudent ? `${idPrefix}-known` : undefined}
            list={known.length && !knownStudent ? `${idPrefix}-names` : undefined}
            value={knownStudent ? knownStudent.name : lesson.name}
            onChange={(e) => {
              // Choosing a name she already has brings their address with it.
              const match = known.find((entry) => entry.name.toLowerCase() === e.target.value.trim().toLowerCase());
              setLesson({ ...lesson, name: e.target.value, ...(match && !lesson.email.trim() ? { email: match.email } : {}) });
            }}
          />
          {known.length ? (
            <datalist id={`${idPrefix}-names`}>
              {known.map((entry) => (
                <option key={entry.id} value={entry.name} />
              ))}
            </datalist>
          ) : null}
          {knownStudent ? (
            <small className="teacher-manual-known" id={`${idPrefix}-known`}>Already one of your students</small>
          ) : null}
        </label>
        {/* Length and place as the booking's sliders, rather than menus to
            open (10 October 2026, at Dan's request). */}
        <fieldset className="teacher-manual-choice">
          <legend>Lesson</legend>
          <div
            className={`segmented segmented--three segmented--position-${["trial", "single", "long"].indexOf(lesson.lessonType)}`}
          >
            <span aria-hidden="true" className="segmented__thumb" />
            {([["trial", "Trial"], ["single", "60 mins"], ["long", "90 mins"]] as const).map(([value, label]) => (
              <label className={lesson.lessonType === value ? "is-active" : ""} key={value}>
                <input
                  checked={lesson.lessonType === value}
                  disabled={busy}
                  name={`${idPrefix}-lesson`}
                  onChange={() => setLesson({ ...lesson, lessonType: value, ...(value === "trial" ? { repeat: "once" as Repeat } : {}) })}
                  type="radio"
                  value={value}
                />
                {label}
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
        <label>
          <span>{weekly ? "First date" : "Date"}</span>
          <input
            type="date"
            required
            disabled={busy}
            value={lesson.date}
            onChange={(e) => setLesson({ ...lesson, date: e.target.value })}
          />
        </label>
        <label>
          <span>Time in Porto</span>
          <input
            type="time"
            required
            disabled={busy}
            value={lesson.time}
            onChange={(e) => setLesson({ ...lesson, time: e.target.value })}
          />
        </label>
        <div className="teacher-manual-submit">
          <button
            className="button button--coral"
            type="submit"
            disabled={busy}
          >
            {busy
              ? "Adding…"
              : weekly
                ? "Add weekly lessons and email student"
                : "Add lesson and email student"}
          </button>
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

export function ManualLessonForm({
  token,
  known,
  student,
  onCreated,
}: {
  token: string;
  known: AdminStudent[];
  /** From `Add lesson` on her list of students: opens the form with them in it. */
  student?: { email: string; name: string; key: number };
  onCreated: () => void;
}) {
  const [status, setStatus] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!student || !detailsRef.current) return;
    // A message about the last student never sits under the next one.
    setStatus("");
    detailsRef.current.open = true;
    detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    detailsRef.current.querySelector<HTMLInputElement>('input[type="date"]')?.focus({ preventScroll: true });
  }, [student]);
  return (
    <details className="teacher-manual" ref={detailsRef}>
      <summary>
        <span>
          <span className="teacher-manual-title">
            Add a lesson for a student
          </span>
        </span>
        <Plus size={22} aria-hidden="true" />
      </summary>
      <div className="teacher-manual-body">
        <LessonForm
          key={student?.key ?? 0}
          idPrefix="teacher-manual"
          known={known}
          student={student}
          token={token}
          onCreated={(message) => {
            setStatus(message);
            onCreated();
          }}
        />
        {status ? (
          <div className="teacher-inline-success" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            {status}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * A free time chosen on the week opens this: the same form, set as her
 * lesson dialog, with the date and time already in place (12 October 2026,
 * at Dan's request).
 */
export function AddLessonDialog({
  token,
  known,
  date,
  minute,
  afterAddFocusRef,
  onClose,
  onCreated,
}: {
  token: string;
  known: AdminStudent[];
  date: string;
  minute: number;
  afterAddFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const added = useRef(false);
  const [busy, setBusy] = useState(false);
  const backdropHandlers = useDialogBackdrop(() => { if (!busy) onClose(); });

  useLayoutEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input[type=email]")?.focus();
    return () => {
      dialog?.close();
      releaseScroll();
      // A new lesson reloads the week, which may replace the time she chose.
      restoreDialogFocus(added.current ? afterAddFocusRef.current : previous);
    };
  }, [afterAddFocusRef]);

  return (
    <dialog
      className="teacher-lesson-dialog teacher-add-dialog"
      ref={dialogRef}
      {...backdropHandlers}
      aria-labelledby="teacher-add-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        className="teacher-dialog-close"
        type="button"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <h2 id="teacher-add-title">Add a lesson</h2>
      <p className="teacher-add-when">
        <strong>
          {dateLabel(date, { weekday: "long", day: "numeric", month: "long" })}, {minuteLabel(minute)}
        </strong>
        <span>For a lesson arranged elsewhere. The student is emailed the details.</span>
      </p>
      <LessonForm
        idPrefix="teacher-add"
        known={known}
        token={token}
        date={date}
        time={minuteLabel(minute)}
        onBusy={setBusy}
        onCreated={(message) => {
          added.current = true;
          onCreated(message);
        }}
      />
    </dialog>
  );
}
