"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { CheckCircle2, UserPlus, X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { LessonForm } from "@/components/teacher/LessonForm";
import { addStudent, sendStudentWelcome, type AdminStudent } from "@/lib/admin-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";
import { STUDENT_MARKS } from "@/lib/student-marks";
import { dateLabel, minuteLabel } from "@/lib/teacher-calendar";
import { PriceFields, pricesFromDraft, type PriceDraft } from "@/components/teacher/StudentPrice";

/** Where the dialog opens: a new student, one of hers, or a free time on her week. */
export type StudentDialogStart =
  | { step: "new" }
  | { step: "lessons"; student: AdminStudent }
  | { step: "pick"; date: string; minute: number };

/**
 * Students and their lessons in one place (13 October 2026, Dan: "it all
 * feels integrated", no loose lessons). A new student's details lead
 * straight into their lessons; a free time on her week asks whose lesson it
 * is first. Nothing reaches someone she has just set up until she presses
 * Send welcome email.
 */
export function StudentDialog({ token, known, start, afterCloseFocusRef, onChanged, onClose }: {
  token: string;
  known: AdminStudent[];
  start: StudentDialogStart;
  /** Where focus goes after a change reloads the week. */
  afterCloseFocusRef?: RefObject<HTMLElement | null>;
  /** After a student or lesson is added, or a welcome sent. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"pick" | "details" | "lessons">(start.step === "new" ? "details" : start.step);
  const [student, setStudent] = useState<AdminStudent | null>(start.step === "lessons" ? start.student : null);
  const slot = start.step === "pick" ? { date: start.date, time: minuteLabel(start.minute) } : null;
  const [details, setDetails] = useState({ email: "", name: "", phone: "", nif: "", mark: "" });
  const [prices, setPrices] = useState<PriceDraft>({ 60: "", 90: "" });
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [welcomed, setWelcomed] = useState(false);
  const changed = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdrop = useDialogBackdrop(() => { if (!busy) onClose(); });

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

  function changedNow() {
    changed.current = true;
    onChanged();
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

  const set = (field: keyof typeof details) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDetails((current) => ({ ...current, [field]: event.target.value }));
  const title = step === "details" ? "Add a student" : step === "pick" ? "Add a lesson" : student?.name ?? "";
  const sorted = [...known].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <dialog className="teacher-lesson-dialog teacher-student-dialog" ref={dialogRef} {...backdrop} aria-labelledby="teacher-student-dialog-title" onKeyDown={keepDialogFocus} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <button className="teacher-dialog-close" aria-label="Close" type="button" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>

      {step === "lessons" && student ? (
        <div className="teacher-student-dialog__who">
          <AccountAvatar mark={student.mark} name={student.name} />
          <div>
            <h2 id="teacher-student-dialog-title">{title}</h2>
            <p>{student.email}</p>
          </div>
        </div>
      ) : (
        <h2 id="teacher-student-dialog-title">{title}</h2>
      )}
      {slot ? (
        <p className="teacher-student-dialog__when">{dateLabel(slot.date, { weekday: "long", day: "numeric", month: "long" })}, {slot.time}</p>
      ) : null}

      {step === "pick" ? (
        <div className="teacher-student-dialog__pick">
          <p className="teacher-eyebrow">Whose lesson?</p>
          {sorted.length ? (
            <ul className="teacher-student-dialog__choices">
              {sorted.map((entry) => (
                <li key={entry.id}>
                  <button onClick={() => { setStudent(entry); setStep("lessons"); }} type="button">
                    <AccountAvatar mark={entry.mark} name={entry.name} />
                    <span>{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button className="button button--lilac teacher-student-dialog__new" onClick={() => setStep("details")} type="button">
            <UserPlus size={16} aria-hidden="true" />
            Add a new student
          </button>
        </div>
      ) : null}

      {step === "details" ? (
        <>
          <ul className="booking-payment-facts teacher-student-dialog__facts">
            <li>Their details now, their lessons next</li>
            <li>Nothing is emailed until you send their welcome</li>
          </ul>
          <form
            className="teacher-form teacher-student-dialog__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const agreed = pricesFromDraft(prices, { keepEmpty: false });
              if (!agreed) {
                setError("Each price needs to be between €1 and €100.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                const result = await addStudent(token, {
                  email: details.email.trim(),
                  name: details.name.trim(),
                  phone: details.phone.trim(),
                  nif: details.nif.trim(),
                  mark: details.mark,
                  prices: agreed,
                });
                setStudent(result.student);
                setStep("lessons");
                changedNow();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "The student couldn’t be added.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              <span>Full name</span>
              <input autoComplete="off" disabled={busy} onChange={set("name")} required type="text" value={details.name} />
            </label>
            <label>
              <span>Email</span>
              <input autoComplete="off" disabled={busy} onChange={set("email")} required type="email" value={details.email} />
            </label>
            <label>
              <span>Phone <span className="teacher-field-optional">(optional)</span></span>
              <input autoComplete="off" disabled={busy} onChange={set("phone")} type="tel" value={details.phone} />
            </label>
            <label>
              <span>NIF <span className="teacher-field-optional">(optional, for receipts)</span></span>
              <input autoComplete="off" disabled={busy} inputMode="numeric" onChange={set("nif")} type="text" value={details.nif} />
            </label>
            {/* Their price from the start, so their welcome finds them on it
                with no code to type (13 October 2026, Dan). */}
            <fieldset className="teacher-student-dialog__price">
              <legend>Their price <span className="teacher-field-optional">(optional, per lesson)</span></legend>
              <PriceFields draft={prices} disabled={busy} idPrefix="teacher-student-price" onChange={setPrices} />
            </fieldset>
            <div className="teacher-student-dialog__splat">
              <span id="teacher-student-splat">Their splat <span className="teacher-field-optional">(optional)</span></span>
              <div aria-labelledby="teacher-student-splat" className="my-lessons__marks" role="group">
                {[{ id: "", label: "Their initial" }, ...STUDENT_MARKS].map((choice) => (
                  <button
                    aria-label={choice.label}
                    aria-pressed={details.mark === choice.id}
                    className="my-lessons__mark"
                    disabled={busy}
                    key={choice.id || "initial"}
                    onClick={() => setDetails((current) => ({ ...current, mark: choice.id }))}
                    type="button"
                  >
                    <AccountAvatar mark={choice.id} name={details.name.trim() || "?"} />
                  </button>
                ))}
              </div>
            </div>
            <div className="teacher-dialog-actions">
              <button className="button button--coral" disabled={busy} type="submit">{busy ? "Adding…" : "Next: their lessons"}</button>
              <button className="button button--outline" disabled={busy} onClick={start.step === "pick" ? () => setStep("pick") : onClose} type="button">
                {start.step === "pick" ? "Back" : "Cancel"}
              </button>
            </div>
          </form>
        </>
      ) : null}

      {step === "lessons" && student ? (
        <>
          {added.length ? (
            <ul className="booking-payment-facts teacher-student-dialog__added" aria-label="Added">
              {added.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          ) : null}
          <LessonForm
            idPrefix="teacher-student-lesson"
            student={student}
            token={token}
            date={slot?.date}
            time={slot?.time}
            // Coral always marks what is still to do for them: their first
            // lesson, then their welcome (13 October 2026, Dan).
            tone={student.awaitingWelcome && (added.length || student.nextLessonAt) ? "blue" : "coral"}
            onBusy={setBusy}
            onCreated={(message) => {
              setAdded((current) => [...current, message]);
              changedNow();
            }}
          />
          <div className="teacher-student-dialog__finish">
            {welcomed ? (
              <p className="teacher-inline-success" role="status"><CheckCircle2 size={18} aria-hidden="true" />Welcome sent</p>
            ) : student.awaitingWelcome && (added.length || student.nextLessonAt) ? (
              <button className="button button--coral" disabled={busy} onClick={() => void sendWelcome()} type="button">
                Send welcome email
              </button>
            ) : null}
            <button className="button button--outline" disabled={busy} onClick={onClose} type="button">
              {student.awaitingWelcome && !welcomed ? "Done, send later" : "Done"}
            </button>
          </div>
        </>
      ) : null}
      {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
    </dialog>
  );
}
