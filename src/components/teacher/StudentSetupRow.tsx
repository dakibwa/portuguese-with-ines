"use client";

import { useEffect, useRef, useState } from "react";
import { AccountAvatar } from "@/components/AccountMenu";
import { LessonForm } from "@/components/teacher/LessonForm";
import { StudentDetailsForm } from "@/components/teacher/StudentDetailsForm";
import { StudentPrice } from "@/components/teacher/StudentPrice";
import type { AdminStudent } from "@/lib/admin-api";
import type { StudentSetup, StudentSetupStep } from "@/lib/teacher-calendar";

/** Her setup stays together: each dab opens its work beneath the same row. */
export function StudentSetupRow({ setup, token, step, sending, locked, onSelect, onChanged, onWelcome, onBusy }: {
  setup: StudentSetup;
  token: string;
  step: StudentSetupStep | null;
  sending: string;
  locked?: boolean;
  onSelect: (step: StudentSetupStep | null) => void;
  onChanged?: (student?: AdminStudent) => void;
  onWelcome: (student: AdminStudent, again?: boolean) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const { student, steps, next, owner } = setup;
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => { setBusyState(value); onBusy?.(value); };
  const [notice, setNotice] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const paneId = `teacher-setup-${student.id}`;
  const disabled = busy || locked || sending === student.id;
  const close = () => onSelect(null);

  useEffect(() => {
    if (!step || !body.current) return;
    const input = step === "email" ? body.current.querySelector<HTMLInputElement>('input[type="email"]:not([disabled])')
      : step === "price" ? body.current.querySelector<HTMLInputElement>('input[type="text"]')
      : step === "lessons" ? body.current.querySelector<HTMLButtonElement>('.teacher-lesson-picker [data-lesson-date][tabindex="0"]') : null;
    (input ?? body.current).focus({ preventScroll: true });
    body.current.scrollIntoView({ block: "nearest" });
  }, [step]);

  const primaryLabel = next === "email" ? "Add email" : next === "lessons" ? "Add a lesson" : next === "welcome" ? "Send welcome email" : "Send the link again";
  const send = (again: boolean) => onWelcome(student, again);
  const sendButton = (again: boolean) => <button
    className={`button button--${again ? "lilac" : "coral"} button--compact`}
    disabled={Boolean(sending) || busy || !student.email}
    onClick={() => send(again)}
    type="button"
  >{sending === student.id ? "Sending…" : again ? "Send the link again" : "Send welcome email"}<span className="visually-hidden"> to {student.name}</span></button>;

  return <li className={`teacher-setup teacher-setup--inline${step ? " is-open" : ""}`}>
    <button
      className="teacher-setup__profile"
      aria-controls={paneId}
      aria-expanded={step === "email"}
      aria-label={`Edit ${student.name}’s details`}
      disabled={disabled}
      onClick={() => onSelect(step === "email" ? null : "email")}
      type="button"
    ><AccountAvatar mark={student.mark} name={student.name} /><strong>{student.name}</strong></button>
    <ol className="teacher-setup__steps">
      {steps.map(entry => <li className={entry.done ? "is-done" : ""} key={entry.id} aria-current={entry.id === next ? "step" : undefined}>
        <button
          aria-controls={paneId}
          aria-expanded={step === entry.id}
          aria-label={`${entry.label} for ${student.name}`}
          aria-describedby={`${paneId}-${entry.id}-status`}
          disabled={disabled}
          onClick={() => { setNotice(""); onSelect(step === entry.id ? null : entry.id); }}
          type="button"
        ><i aria-hidden="true" /><span>{entry.label}<span className="visually-hidden" id={`${paneId}-${entry.id}-status`}>{entry.done ? ": done" : ": waiting"}</span></span></button>
      </li>)}
    </ol>
    <div className="teacher-setup__action"><span>{owner}</span><button
      className={`button button--${owner === "Yours" ? "coral" : "lilac"} button--compact`}
      disabled={disabled || ((next === "welcome" || next === "sign-in" || next === "card") && Boolean(sending))}
      onClick={() => {
        if (next === "welcome" || next === "sign-in" || next === "card") send(next !== "welcome");
        else onSelect(next);
      }}
      type="button"
    >{sending === student.id ? "Sending…" : primaryLabel}<span className="visually-hidden"> for {student.name}</span></button></div>
    {step ? <div className="teacher-setup__body" id={paneId} aria-label={`${student.name}’s setup`} role="region" ref={body} tabIndex={-1}>
      <div className="teacher-setup__body-heading">
        <h3 id={`${paneId}-heading`}>{step === "email" ? "Their details" : step === "price" ? "Their price" : step === "lessons" ? "Add a lesson" : step === "welcome" ? "Welcome email" : step === "sign-in" ? "Sign in" : "Saved card"}</h3>
        <button className="teacher-text-button" disabled={disabled} onClick={close} type="button">Close setup</button>
      </div>
      {step === "email" ? <StudentDetailsForm
        key={`${student.id}-details`}
        onBusy={setBusy}
        onCancel={close}
        onSaved={updated => { setNotice("Their details are saved."); onChanged?.(updated); close(); }}
        student={student}
        token={token}
      /> : step === "price" ? <>
        <p className="teacher-profile__note">The standard price applies until you set their own.</p>
        <StudentPrice
          key={`${student.id}-price`}
          idPrefix={`${paneId}-price`}
          labelledBy={`${paneId}-heading`}
          onBusy={setBusy}
          onCancel={close}
          onChanged={updated => onChanged?.(updated)}
          startEditing
          student={student}
          token={token}
        />
      </> : step === "lessons" ? <>
        <p className="teacher-profile__note">{student.awaitingWelcome ? "Their lessons stay quiet until you send their welcome." : "A lesson added here emails the student."}</p>
        <LessonForm
          idPrefix={`${paneId}-lesson`}
          onBusy={setBusy}
          onCancel={close}
          onCreated={message => { setNotice(message); close(); onChanged?.(); }}
          student={student}
          token={token}
        />
      </> : <>
        <p className="teacher-profile__note">{step === "welcome"
          ? student.awaitingWelcome ? "Their welcome includes their prices and the lessons you have added. Send it when you are ready." : "Their welcome has been sent. You can send them a fresh sign-in link."
          : step === "sign-in" ? "They sign in from the email link themselves. You can send them a fresh link."
          : "They add their own card from their account. You can send them a fresh link to sign in."}</p>
        {student.email ? <p className="teacher-setup__email">{student.email}</p> : <p className="teacher-profile__note">Add their email before you send a welcome.</p>}
        <div className="teacher-dialog-actions">
          {student.email ? sendButton(step !== "welcome" || !student.awaitingWelcome) : <button className="button button--coral button--compact" onClick={() => onSelect("email")} type="button">Add email</button>}
          <button className="button button--outline button--compact" disabled={disabled} onClick={close} type="button">Done</button>
        </div>
      </>}
    </div> : null}
    {notice ? <p className="teacher-inline-success teacher-setup__notice" role="status">{notice}</p> : null}
  </li>;
}
