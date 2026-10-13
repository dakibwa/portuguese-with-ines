"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { addStudent, type AdminStudent } from "@/lib/admin-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";
import { STUDENT_MARKS } from "@/lib/student-marks";

/**
 * Onboarding's first step (13 October 2026, Dan): Inês sets a student up with
 * their details and splat, then adds their lessons from their card, and only
 * sends their welcome when she is ready. Nothing is emailed from here.
 */
export function AddStudentDialog({ token, onAdded, onClose }: {
  token: string;
  onAdded: (student: AdminStudent) => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState({ email: "", name: "", phone: "", nif: "", mark: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdrop = useDialogBackdrop(() => { if (!busy) onClose(); });

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); releaseScroll(); restoreDialogFocus(previous); };
  }, []);

  const set = (field: keyof typeof details) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDetails((current) => ({ ...current, [field]: event.target.value }));

  return (
    <dialog className="teacher-lesson-dialog teacher-add-student" ref={dialogRef} {...backdrop} aria-labelledby="teacher-add-student-title" onKeyDown={keepDialogFocus} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <button className="teacher-dialog-close" aria-label="Close add a student" type="button" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      <h2 id="teacher-add-student-title">Add a student</h2>
      <ul className="booking-payment-facts teacher-add-student__facts">
        <li>Nothing is emailed yet</li>
        <li>Add their lessons from their card, then send their welcome</li>
      </ul>
      <form
        className="teacher-form teacher-add-student__form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const { student } = await addStudent(token, {
              email: details.email.trim(),
              name: details.name.trim(),
              phone: details.phone.trim(),
              nif: details.nif.trim(),
              mark: details.mark,
            });
            onAdded(student);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The student couldn’t be added.");
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
        <div className="teacher-add-student__splat">
          <span id="teacher-add-student-splat">Their splat <span className="teacher-field-optional">(optional)</span></span>
          <div aria-labelledby="teacher-add-student-splat" className="my-lessons__marks" role="group">
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
        {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
        <div className="teacher-dialog-actions">
          <button className="button button--coral" disabled={busy} type="submit">{busy ? "Adding…" : "Add student"}</button>
          <button className="button button--outline" disabled={busy} onClick={onClose} type="button">Cancel</button>
        </div>
      </form>
    </dialog>
  );
}
