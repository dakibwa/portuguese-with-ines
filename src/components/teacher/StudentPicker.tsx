"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { NewStudentForm } from "@/components/teacher/NewStudentForm";
import type { AdminStudent } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";
import { dateLabel, minuteLabel } from "@/lib/teacher-calendar";

import { defaultStudentMark } from "@/lib/student-marks";

export type StudentPickerStart = { step: "new" } | { step: "pick"; date: string; minute: number };

/** Choose or create the student; all later work opens in their own row. */
export function StudentPicker({ token, known, start, onSelect, onClose }: {
  token: string;
  known: AdminStudent[];
  start: StudentPickerStart;
  onSelect: (student: AdminStudent, slot?: { date: string; time: string }, next?: "lessons" | "welcome") => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(start.step === "new");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = useRef(false);
  const backdrop = useDialogBackdrop(() => { if (!busy) onClose(); });
  const slot = start.step === "pick" ? { date: start.date, time: minuteLabel(start.minute) } : undefined;
  useLayoutEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    const unlock = lockPageScroll();
    return () => {
      element?.close();
      unlock();
      if (!selected.current) restoreDialogFocus(previous);
    };
  }, []);
  const choose = (student: AdminStudent, next?: "lessons" | "welcome") => {
    if (readSession() !== token) return;
    selected.current = true;
    onSelect(student, slot, next);
  };
  return <dialog className="teacher-lesson-dialog teacher-profile" ref={dialog} {...backdrop} aria-labelledby="teacher-student-picker-title" onKeyDown={keepDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button className="teacher-dialog-close" aria-label="Close" disabled={busy} onClick={onClose} type="button"><X size={20} aria-hidden="true" /></button>
    <h2 id="teacher-student-picker-title">{adding ? "Add a student" : "Add a lesson"}</h2>
    {adding ? <NewStudentForm token={token} onBusy={setBusy} onAdded={choose} offerNoLessons={start.step === "new"} cancelLabel={start.step === "pick" ? "Back" : "Cancel"} onCancel={start.step === "pick" ? () => setAdding(false) : onClose} /> : <>
      {slot ? <p className="teacher-profile__when lesson-when"><span>{dateLabel(slot.date, { weekday: "long", day: "numeric", month: "long" })}</span><span className="lesson-when__time">{slot.time}</span></p> : null}
      <div className="teacher-profile__pick">
        <p className="teacher-eyebrow">Whose lesson?</p>
        {known.length ? <ul className="teacher-profile__choices">
          {[...known].sort((a, b) => a.name.localeCompare(b.name, "pt")).map(student => <li key={student.id}><button onClick={() => choose(student)} type="button"><AccountAvatar mark={student.mark || defaultStudentMark(student.id)} name={student.name} /><span>{student.name}</span></button></li>)}
        </ul> : <p>No students yet. Add them first, then their lesson.</p>}
        <button className="button button--lilac teacher-profile__new" onClick={() => setAdding(true)} type="button"><UserPlus size={16} aria-hidden="true" />Add a new student</button>
      </div>
    </>}
  </dialog>;
}
