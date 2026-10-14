"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { CalendarPlus, CheckCircle2, Send, UserPlus, X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { LessonForm } from "@/components/teacher/LessonForm";
import { NewStudentForm } from "@/components/teacher/NewStudentForm";
import { StudentDetailsForm } from "@/components/teacher/StudentDetailsForm";
import { StudentLessons, upcomingLessons } from "@/components/teacher/StudentLessons";
import { StudentPrice } from "@/components/teacher/StudentPrice";
import { needsHer } from "@/components/teacher/StudentList";
import { fetchBookings, sendStudentWelcome, type AdminBooking, type AdminStudent } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";
import { dateLabel, minuteLabel } from "@/lib/teacher-calendar";

/** Where the profile opens: one of her students, a new one, or a free time on her week. */
export type StudentProfileStart =
  | { step: "profile"; student: AdminStudent; editDetails?: boolean; addLesson?: boolean }
  | { step: "new" }
  | { step: "pick"; date: string; minute: number };

/**
 * One student, everything about them in one place (14 October 2026, Dan:
 * "the add a lesson button and click the card should be the same"). Their
 * card, its Add a lesson button, Add a student and a free time on her week
 * all land here. Their details open in place from Edit details, their price
 * is changed where it is shown, lessons are added without leaving, and their
 * welcome is sent from here once they have an email. Nothing reaches someone
 * she has just set up until she presses Send welcome email.
 */
export function StudentProfile({ token, known, cards, start, afterCloseFocusRef, onChanged, onClose }: {
  token: string;
  /** Her students, for choosing whose lesson a free time is. */
  known: AdminStudent[];
  /** Whether the site takes cards just now; without them nobody is asked for one. */
  cards: boolean;
  start: StudentProfileStart;
  /** Where focus goes after a change reloads the week. */
  afterCloseFocusRef?: RefObject<HTMLElement | null>;
  /** After a student, a lesson or a price changes, or a welcome is sent. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"pick" | "details" | "profile">(start.step === "new" ? "details" : start.step);
  const [student, setStudent] = useState<AdminStudent | null>(start.step === "profile" ? start.student : null);
  // A free time she chose leads the lesson form until something is added there.
  const [slot, setSlot] = useState(start.step === "pick" ? { date: start.date, time: minuteLabel(start.minute) } : null);
  const [editing, setEditing] = useState(start.step === "profile" && Boolean(start.editDetails));
  const [adding, setAdding] = useState(start.step === "profile" && Boolean(start.addLesson) && !start.editDetails);
  const [added, setAdded] = useState<string[]>([]);
  const [welcomed, setWelcomed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [lessonsError, setLessonsError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());
  const changed = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // A form that opens takes focus, and the button that opened it gets it back
  // when it closes, so a keyboard never loses its place.
  const editButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const addSection = useRef<HTMLElement>(null);
  const was = useRef({ editing: false, adding: false });
  const backdrop = useDialogBackdrop(() => { if (!busy) onClose(); });
  const studentId = student?.id ?? "";
  const studentEmail = student?.email ?? "";

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      releaseScroll();
      restoreDialogFocus(changed.current && afterCloseFocusRef?.current ? afterCloseFocusRef.current : previous);
    };
  }, [afterCloseFocusRef]);

  // Their lessons, read from the start of time rather than the visible week.
  // Adding one reads them again; the list stays as it was meanwhile.
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    void fetchBookings(token, "1970-01-01T00:00:00.000Z").then(result => {
      if (!active || readSession() !== token) return;
      setLessonsError("");
      setBookings(result.bookings.filter(booking => booking.status === "confirmed" || booking.status === "cancelled"));
    }).catch(caught => {
      if (active && readSession() === token)
        setLessonsError(caught instanceof Error ? caught.message : "Lesson history couldn’t be loaded.");
    });
    return () => { active = false; };
  }, [token, studentId, attempt]);

  useEffect(() => {
    if (was.current.editing && !editing) editButton.current?.focus();
    if (was.current.adding && !adding && !editing) addButton.current?.focus();
    if (!was.current.adding && adding) addSection.current?.focus();
    was.current = { editing, adding };
  }, [editing, adding]);

  function changedNow() {
    changed.current = true;
    onChanged();
  }

  function updated(next: AdminStudent) {
    setStudent(next);
    changedNow();
  }

  async function sendWelcome() {
    if (!student || busy) return;
    setBusy(true);
    setError("");
    try {
      await sendStudentWelcome(token, student.id);
      setWelcomed(true);
      setStudent({ ...student, awaitingWelcome: false });
      changedNow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The welcome couldn’t be sent.");
    } finally {
      setBusy(false);
    }
  }

  // The account ID survives an email change. Only older unlinked bookings
  // fall back to their email; names alone must never match another student.
  const mine = student && bookings
    ? bookings.filter(booking => booking.student_id
      ? booking.student_id === student.id
      : Boolean(studentEmail) && booking.student_email.trim().toLowerCase() === studentEmail.trim().toLowerCase())
    : null;
  const canWelcome = Boolean(student && studentEmail && needsHer(student, cards));
  // Coral marks the one thing still to do for them: their first lesson, then
  // their welcome (13 October 2026, Dan).
  const welcomeNext = canWelcome && Boolean(student?.awaitingWelcome) && (added.length > 0 || upcomingLessons(mine ?? [], now).length > 0);
  // While their details are open, Save details is the one coral action.
  const welcomeFirst = welcomeNext && !editing;
  const sorted = [...known].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <dialog
      className="teacher-lesson-dialog teacher-profile"
      ref={dialogRef}
      {...backdrop}
      aria-labelledby="teacher-profile-name"
      aria-describedby={step === "profile" ? "teacher-profile-label" : undefined}
      onKeyDown={keepDialogFocus}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    >
      <button className="teacher-dialog-close" aria-label="Close" disabled={busy} onClick={onClose} type="button"><X size={20} aria-hidden="true" /></button>

      {step === "pick" ? (
        <>
          <h2 id="teacher-profile-name">Add a lesson</h2>
          {/* The free time leads only while she picks whose it is; the lesson
              form then holds the same date and time in its fields. */}
          {slot ? (
            <p className="teacher-profile__when lesson-when">
              <span>{dateLabel(slot.date, { weekday: "long", day: "numeric", month: "long" })}</span>
              <span className="visually-hidden">, </span>
              <span className="lesson-when__time">{slot.time}</span>
            </p>
          ) : null}
          <div className="teacher-profile__pick">
            <p className="teacher-eyebrow">Whose lesson?</p>
            {sorted.length ? (
              <ul className="teacher-profile__choices">
                {sorted.map((entry) => (
                  <li key={entry.id}>
                    <button onClick={() => { setStudent(entry); setAdding(true); setStep("profile"); }} type="button">
                      <AccountAvatar mark={entry.mark} name={entry.name} />
                      <span>{entry.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button className="button button--lilac teacher-profile__new" onClick={() => setStep("details")} type="button">
              <UserPlus size={16} aria-hidden="true" />
              Add a new student
            </button>
          </div>
        </>
      ) : null}

      {step === "details" ? (
        <>
          <h2 id="teacher-profile-name">Add a student</h2>
          <NewStudentForm
            token={token}
            onBusy={setBusy}
            cancelLabel={start.step === "pick" ? "Back" : "Cancel"}
            onCancel={start.step === "pick" ? () => setStep("pick") : onClose}
            onAdded={(created) => {
              setAdding(true);
              setStep("profile");
              updated(created);
            }}
          />
        </>
      ) : null}

      {step === "profile" && student ? (
        <>
          {/* Who they are, and one button to bring out everything to change. */}
          <header className="teacher-profile-heading">
            <AccountAvatar mark={student.mark} name={student.name} />
            <div>
              <p id="teacher-profile-label">Student</p>
              <h2 id="teacher-profile-name">{student.name}</h2>
              {editing ? null : (
                <>
                  <p className="teacher-profile-line">{student.email || "No email yet"}</p>
                  {student.phone ? <p className="teacher-profile-line">{student.phone}</p> : null}
                  <p className="teacher-profile-line">{student.nif ? `NIF ${student.nif}` : "No NIF (consumidor final)"}</p>
                  <button className="teacher-text-button" disabled={busy} onClick={() => { setAdding(false); setEditing(true); }} ref={editButton} type="button">Edit details</button>
                </>
              )}
            </div>
          </header>
          {editing ? (
            <StudentDetailsForm
              token={token}
              student={student}
              onCancel={() => setEditing(false)}
              onSaved={(saved) => { setEditing(false); updated(saved); }}
            />
          ) : null}

          <StudentPrice token={token} student={student} onChanged={updated} />

          {adding ? (
            <section className="teacher-profile__add" aria-labelledby="teacher-profile-add" ref={addSection} tabIndex={-1}>
              <h3 id="teacher-profile-add">Add a lesson</h3>
              <LessonForm
                idPrefix="teacher-student-lesson"
                student={student}
                token={token}
                date={slot?.date}
                time={slot?.time}
                onBusy={setBusy}
                onCancel={() => setAdding(false)}
                onCreated={(message) => {
                  setAdded((current) => [...current, message]);
                  setSlot(null);
                  setAdding(false);
                  setAttempt((value) => value + 1);
                  changedNow();
                }}
              />
            </section>
          ) : (
            <div className="teacher-dialog-actions teacher-profile__actions">
              <button className={`button button--${welcomeFirst || editing ? "lilac" : "coral"}`} disabled={busy} onClick={() => { setEditing(false); setAdding(true); setError(""); }} ref={addButton} type="button">
                <CalendarPlus size={16} aria-hidden="true" />
                Add a lesson
              </button>
              {welcomed ? (
                <p className="teacher-inline-success" role="status"><CheckCircle2 size={18} aria-hidden="true" />Welcome sent</p>
              ) : canWelcome ? (
                <button className={`button button--${welcomeFirst ? "coral" : "lilac"}`} disabled={busy} onClick={() => void sendWelcome()} type="button">
                  <Send size={16} aria-hidden="true" />
                  {busy ? "Sending…" : "Send welcome email"}
                </button>
              ) : null}
            </div>
          )}
          {added.length ? (
            <div className="teacher-profile__added" role="status">
              <p className="teacher-eyebrow">Added</p>
              <ul className="booking-payment-facts">
                {added.map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </div>
          ) : null}
          {studentEmail || editing ? null : <p className="teacher-profile__note">Their welcome email waits until you add their email under Edit details.</p>}
          {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}

          <StudentLessons
            bookings={mine}
            error={lessonsError}
            now={now}
            onRetry={() => { setLessonsError(""); setBookings(null); setAttempt(value => value + 1); }}
          />
        </>
      ) : null}
    </dialog>
  );
}
