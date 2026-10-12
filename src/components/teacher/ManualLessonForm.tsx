"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { CheckCircle2, Globe, Plus, UserRound, X } from "lucide-react";
import { createBookingFor } from "@/lib/admin-api";
import { portoTimeToUtc } from "@/lib/booking-api";
import { SITE_BASE_PATH } from "@/lib/paths";
import { dateLabel, minuteLabel } from "@/lib/teacher-calendar";
import { restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";

const empty = {
  email: "",
  name: "",
  lessonType: "single",
  date: "",
  time: "17:00",
  location: "online" as "online" | "porto",
};

const ADDED = "Lesson added. The student has been emailed the details.";

/**
 * A lesson arranged elsewhere: the student, the lesson, where, and when. The
 * same form serves the section beneath the week and the dialog a free time
 * opens with its date and time already in place.
 */
function LessonForm({
  token,
  date = "",
  time = "17:00",
  idPrefix,
  onCreated,
  onBusy,
}: {
  token: string;
  date?: string;
  time?: string;
  idPrefix: string;
  onCreated: (message: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const initial = { ...empty, date, time };
  const [lesson, setLesson] = useState(initial);
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
            await createBookingFor(token, {
              email: lesson.email.trim(),
              name: lesson.name.trim(),
              lessonType: lesson.lessonType,
              startAt: portoTimeToUtc(lesson.date, lesson.time),
              location: lesson.location,
              notes: "",
            });
            setLesson(initial);
            onCreated(ADDED);
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
            disabled={busy}
            value={lesson.email}
            onChange={(e) => setLesson({ ...lesson, email: e.target.value })}
          />
        </label>
        <label>
          <span>Student&rsquo;s name</span>
          <input
            type="text"
            disabled={busy}
            value={lesson.name}
            onChange={(e) => setLesson({ ...lesson, name: e.target.value })}
          />
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
                  onChange={() => setLesson({ ...lesson, lessonType: value })}
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
        <label>
          <span>Date</span>
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
            {busy ? "Adding…" : "Add lesson and email student"}
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
  onCreated,
}: {
  token: string;
  onCreated: () => void;
}) {
  const [status, setStatus] = useState("");
  return (
    <details className="teacher-manual">
      <summary>
        <span>
          <span className="teacher-eyebrow">
            For a booking arranged elsewhere
          </span>
          <span className="teacher-manual-title">
            Add a lesson for a student
          </span>
        </span>
        <Plus size={22} aria-hidden="true" />
      </summary>
      <div className="teacher-manual-body">
        <p>
          Students can book through{" "}
          <a href={`${SITE_BASE_PATH}/book/?view=book`}>the booking page</a>.
          Use this if you&rsquo;ve already arranged a lesson another way. You
          can also choose a free time on your week.
        </p>
        <LessonForm
          idPrefix="teacher-manual"
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
  date,
  minute,
  afterAddFocusRef,
  onClose,
  onCreated,
}: {
  token: string;
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
