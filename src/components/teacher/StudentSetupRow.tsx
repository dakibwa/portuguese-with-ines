"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Clock3 } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { LessonForm } from "@/components/teacher/LessonForm";
import { StudentDetailsForm } from "@/components/teacher/StudentDetailsForm";
import { StudentPrice } from "@/components/teacher/StudentPrice";
import type { AdminStudent } from "@/lib/admin-api";
import type { StudentSetup, StudentSetupStep } from "@/lib/teacher-calendar";

/** Her setup stays together: each dab opens its work beneath the same row. */
export function StudentSetupRow({ setup, token, step, sending, locked, attention, onOpenProfile, onSelect, onChanged, onWelcome, onBusy }: {
  setup: StudentSetup;
  token: string;
  step: StudentSetupStep | null;
  sending: string;
  locked?: boolean;
  /** Lesson changes or payment notes belong to this student's one row. */
  attention?: ReactNode;
  onOpenProfile?: () => void;
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
  const waitingOnStudent = next === "sign-in" || next === "card";
  const status = next === "email" ? "Email needed" : next === "lessons" ? "No lessons yet" : next === "welcome" ? "Welcome ready" : next === "sign-in" ? "Waiting for sign-in" : "Waiting for card";

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
      aria-controls={onOpenProfile ? undefined : paneId}
      aria-expanded={onOpenProfile ? undefined : step === "email"}
      aria-label={onOpenProfile ? `Open ${student.name}’s profile` : `Edit ${student.name}’s details`}
      disabled={disabled}
      onClick={() => onOpenProfile ? onOpenProfile() : onSelect(step === "email" ? null : "email")}
      type="button"
    ><AccountAvatar mark={student.mark} name={student.name} /><span className="teacher-setup__identity"><strong>{student.name}</strong><span className="teacher-setup__status">{status}</span></span></button>
    <ol className="teacher-setup__steps">
      {steps.map(entry => <li className={entry.done ? "is-done" : entry.id === next ? waitingOnStudent ? "is-waiting" : "is-next" : ""} key={entry.id} aria-current={entry.id === next ? "step" : undefined}>
        <button
          aria-controls={paneId}
          aria-expanded={step === entry.id}
          aria-label={`${entry.label} for ${student.name}`}
          aria-describedby={`${paneId}-${entry.id}-status`}
          disabled={disabled}
          onClick={() => { setNotice(""); onSelect(step === entry.id ? null : entry.id); }}
          type="button"
        ><i aria-hidden="true">{entry.done ? <Check size={12} strokeWidth={3} /> : entry.id === next && waitingOnStudent ? <Clock3 size={12} strokeWidth={2} /> : null}</i><span>{entry.label}<span className="visually-hidden" id={`${paneId}-${entry.id}-status`}>{entry.done ? ": done" : entry.id === next && waitingOnStudent ? ": waiting for the student" : ": waiting"}</span></span></button>
      </li>)}
    </ol>
    {!step ? <div className="teacher-setup__action"><button
      className={`button button--${owner === "Yours" ? "coral" : "lilac"} button--compact`}
      disabled={disabled || ((next === "welcome" || next === "sign-in" || next === "card") && Boolean(sending))}
      onClick={() => {
        if (next === "welcome" || next === "sign-in" || next === "card") send(next !== "welcome");
        else onSelect(next);
      }}
      type="button"
    >{sending === student.id ? "Sending…" : primaryLabel}<span className="visually-hidden"> for {student.name}</span></button></div> : null}
    {attention ? <div className="teacher-setup__attention">{attention}</div> : null}
    {step ? <div className="teacher-setup__body" id={paneId} aria-label={`${student.name}’s setup`} role="region" ref={body} tabIndex={-1}>
      <div className="teacher-setup__body-heading">
        <h3 id={`${paneId}-heading`}>{step === "email" ? "Their details" : step === "price" ? "Their price" : step === "lessons" ? "Add a lesson" : step === "welcome" ? "Welcome email" : step === "sign-in" ? "Sign in" : "Saved card"}</h3>
        <button className="teacher-text-button" disabled={disabled} onClick={close} type="button">Close</button>
      </div>
      {step === "email" ? <StudentDetailsForm
        key={`${student.id}-details`}
        onBusy={setBusy}
        onSaved={updated => { setNotice("Their details are saved."); onChanged?.(updated); close(); }}
        student={student}
        token={token}
      /> : step === "price" ? <>
        <ul className="booking-payment-facts teacher-setup__help"><li>{Object.keys(student.ownPrices ?? student.prices ?? {}).length ? "Custom lesson price set." : "Standard lesson price applies."}</li></ul>
        <StudentPrice
          key={`${student.id}-price`}
          idPrefix={`${paneId}-price`}
          labelledBy={`${paneId}-heading`}
          onBusy={setBusy}
          showCancel={false}
          onChanged={updated => onChanged?.(updated)}
          startEditing
          student={student}
          token={token}
        />
      </> : step === "lessons" ? <>
        <ul className="booking-payment-facts teacher-setup__help">
          {!steps.find(entry => entry.id === "lessons")?.done ? <li>No lessons added yet.</li> : null}
          <li>{student.awaitingWelcome ? "Lesson emails wait for the welcome email." : "Adding a lesson emails the student."}</li>
        </ul>
        <LessonForm
          idPrefix={`${paneId}-lesson`}
          onBusy={setBusy}
          onCreated={message => { setNotice(message); close(); onChanged?.(); }}
          student={student}
          token={token}
        />
      </> : <>
        <ul className="booking-payment-facts teacher-setup__help">
          <li>{step === "welcome"
            ? student.awaitingWelcome ? "Welcome email not sent yet." : student.signedIn ? "Sign-in is set up." : "Student hasn’t signed in yet."
            : step === "sign-in"
              ? student.signedIn ? "Sign-in is set up." : "Student hasn’t signed in yet."
              : student.hasCard ? "Student has saved a card." : "Student hasn’t added a card yet."}</li>
          {!student.email ? <li>Email address needed.</li> : step === "card" && !student.hasCard && !student.signedIn ? <li>Student needs to sign in first.</li> : null}
        </ul>
        {student.email ? <p className="teacher-setup__email">{student.email}</p> : null}
        <div className="teacher-dialog-actions">
          {student.email ? sendButton(step !== "welcome" || !student.awaitingWelcome) : <button className="button button--coral button--compact" onClick={() => onSelect("email")} type="button">Add email</button>}
        </div>
      </>}
    </div> : null}
    {notice ? <p className="teacher-inline-success teacher-setup__notice" role="status">{notice}</p> : null}
  </li>;
}
