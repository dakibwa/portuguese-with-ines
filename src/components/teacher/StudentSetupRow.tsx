"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, Check, Clock3, Euro, History, KeyRound, LockKeyhole, Mail, Repeat, UserRound, X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { ComeBackEmail, firstName } from "@/components/teacher/DormantEmail";
import { LessonForm } from "@/components/teacher/LessonForm";
import { StudentDetailsForm } from "@/components/teacher/StudentDetailsForm";
import { StudentHistory } from "@/components/teacher/StudentHistory";
import { StudentPrice } from "@/components/teacher/StudentPrice";
import { setStudentDormant, type AdminStudent } from "@/lib/admin-api";
import { dateKey, dateLabel, type StudentSetup, type StudentSetupStep } from "@/lib/teacher-calendar";
import { formatPriceCents } from "@/lib/booking-api";
import { defaultStudentMark } from "@/lib/student-marks";

export type StudentPanel = StudentSetupStep | "history" | "details" | "come-back";
export type StudentRowSelection = { studentId: string; panel: StudentPanel; date?: string; time?: string; homeworkId?: string; homeworkRequestKey?: number };

/** The same row holds setup, then the student’s ongoing details and lessons. */
export function StudentSetupRow({ student, setup, token, step: requestedStep, date, time, homeworkId, homeworkRequestKey, comeBackDefaultVersion, sending, locked, attention, onSelect, onHomework, onChanged, onWelcome, onBusy }: {
  student: AdminStudent;
  setup: StudentSetup | null;
  token: string;
  step: StudentPanel | null;
  date?: string;
  time?: string;
  homeworkId?: string;
  homeworkRequestKey?: number;
  /** Changes when she saves a new default come-back email. */
  comeBackDefaultVersion?: number;
  sending: string;
  locked?: boolean;
  /** Lesson changes or payment notes belong to this student's one row. */
  attention?: ReactNode;
  onSelect: (step: StudentPanel | null) => void;
  onHomework?: (bookingId: string) => void;
  onChanged?: (student?: AdminStudent) => void;
  onWelcome: (student: AdminStudent, again?: boolean) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const steps = setup?.steps ?? [];
  const next = setup?.next;
  const ready = !setup;
  // A come-back email is only for someone still dormant, with an address.
  const step = requestedStep === "come-back" && !(student.dormant && student.email) ? null
    : requestedStep === "history" || requestedStep === "details" || ready
      ? requestedStep : steps.find(entry => entry.id === requestedStep && !entry.lockedReason)?.id ?? null;
  const statusStep = step === "welcome" || step === "sign-in" || step === "card";
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => { setBusyState(value); onBusy?.(value); };
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const row = useRef<HTMLLIElement>(null);
  const height = useRef<number | null>(null);
  const motion = useRef<Animation | null>(null);
  const header = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const nameControl = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const paneId = `teacher-setup-${student.id}`;
  const disabled = busy || locked || sending === student.id;
  const close = () => {
    returnFocus.current = header.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]') ?? nameControl.current;
    onSelect(null);
  };
  useEffect(() => {
    if (step || disabled || !returnFocus.current) return;
    const target = returnFocus.current.isConnected ? returnFocus.current : nameControl.current;
    target?.focus({ preventScroll: true });
    returnFocus.current = null;
  }, [step, disabled]);
  const waitingOnStudent = next === "sign-in" || next === "card";
  // What the email she is about to send says (16 October 2026, Inês): with no
  // lesson to come it asks them to book one; a free student is asked for no card.
  const free = student.prices?.[60] === 0 && student.prices?.[90] === 0;
  const comeBackSent = student.dormantEmailedAt ? dateLabel(dateKey(new Date(student.dormantEmailedAt)), { day: "numeric", month: "short" }) : "";
  // Where it goes is the first dab, not a bare line after them (27 October 2026).
  const emailSays = student.email ? [
    `Goes to ${student.email}.`,
    student.nextLessonAt ? "Lists their lessons to come." : "No lessons yet: it asks them to book one.",
    free ? "Free lessons: no card asked." : steps.some(entry => entry.id === "card") && !student.cardForAllLessons ? "Asks them to add a card." : "",
  ].filter(Boolean) : [];
  const help: string[] = step === "price"
    ? [Object.keys(student.ownPrices ?? student.prices ?? {}).length ? "Custom lesson price set." : "Standard lesson price applies."]
    : step === "lessons" ? [
      ...(!steps.find(entry => entry.id === "lessons")?.done ? ["No lessons added yet."] : []),
      student.awaitingWelcome ? "Lesson emails wait for the welcome email." : "Lessons to come email the student.",
    ] : step === "welcome" || step === "sign-in" || step === "card" ? [
      step === "welcome"
        ? student.awaitingWelcome ? "Welcome email not sent yet." : student.signedIn ? "Sign-in is set up." : "Student hasn’t signed in yet."
        : step === "sign-in"
          ? student.signedIn ? "Sign-in is set up." : "Student hasn’t signed in yet."
          : student.hasCard ? "Student has saved a card." : "Student hasn’t added a card yet.",
      ...(!student.email ? ["Email address needed."] : step === "card" && !student.hasCard && !student.signedIn ? ["Student needs to sign in first."] : []),
      ...emailSays,
    ] : step === "come-back" ? [
      "Ends with a button to sign in and book.",
      comeBackSent ? `Last sent ${comeBackSent}.` : "Not sent yet.",
    ] : [];

  useEffect(() => {
    if (!step || !body.current) return;
    const input = step === "email" ? body.current.querySelector<HTMLInputElement>('input[type="email"]:not([disabled])')
      : step === "details" ? body.current.querySelector<HTMLInputElement>('input[type="text"]')
      : step === "price" ? body.current.querySelector<HTMLInputElement>('input[type="text"]')
      : step === "lessons" ? body.current.querySelector<HTMLButtonElement>('.teacher-lesson-picker [data-lesson-date][tabindex="0"]') : null;
    (input ?? body.current).focus({ preventScroll: true });
    if (!header.current) return;
    const bounds = header.current.getBoundingClientRect();
    const siteHeader = document.querySelector<HTMLElement>(".site-header");
    const headerPosition = siteHeader && getComputedStyle(siteHeader).position;
    const inset = siteHeader && (headerPosition === "sticky" || headerPosition === "fixed")
      ? Math.max(0, siteHeader.getBoundingClientRect().bottom) : 0;
    const top = inset + 16;
    // Reveal the name and steps, rather than aligning a tall editor's bottom.
    if (bounds.top < top || body.current.getBoundingClientRect().bottom > window.innerHeight - 16)
      window.scrollBy({ top: bounds.top - top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [step, date, time]);

  // The sheet grows around its contents; the name stays still at its top.
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const from = motion.current ? element.getBoundingClientRect().height : height.current;
    motion.current?.cancel();
    motion.current = null;
    element.style.overflow = "";
    const to = element.getBoundingClientRect().height;
    height.current = to;
    if (from === null || Math.abs(from - to) < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: Math.min(380, 220 + Math.abs(to - from) * 0.15), easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    motion.current = animation;
    element.style.overflow = "clip";
    if (step) body.current?.animate([{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, easing: "ease-out" });
    void animation.finished.then(() => {
      if (motion.current !== animation) return;
      motion.current = null;
      element.style.overflow = "";
      height.current = element.getBoundingClientRect().height;
    }).catch(() => {});
  }, [step]);
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (!motion.current) height.current = element.getBoundingClientRect().height; });
    observer.observe(element);
    return () => { observer.disconnect(); motion.current?.cancel(); };
  }, []);

  // Dormant (22 October 2026, Dan): hers to set, nothing is sent. Someone
  // with a lesson to come isn't dormant, so only the way back is offered then.
  async function markDormant(dormant: boolean) {
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const { student: updated } = await setStudentDormant(token, student.id, dormant);
      onChanged?.(updated);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "That couldn’t be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const dormantButton = student.dormant || !student.nextLessonAt
    ? <button className="button button--lilac button--small" disabled={disabled} onClick={() => void markDormant(!student.dormant)} type="button">
      {busy ? "Saving…" : student.dormant ? "Mark as active" : "Mark as dormant"}
    </button> : null;

  const send = (again: boolean) => onWelcome(student, again);
  const sendButton = (again: boolean) => <button
    className={`button button--${again ? "lilac" : "coral"} button--compact`}
    disabled={Boolean(sending) || busy || !student.email}
    onClick={() => send(again)}
    type="button"
  >{sending === student.id ? "Sending…" : again ? "Send the link again" : "Send welcome email"}<span className="visually-hidden"> to {student.name}</span></button>;

  const profilePanel = ready || step === "history" || step === "details";
  // Each with its mark above its name, as the setup steps are, so a set-up
  // student's row reads as the same kind of control (27 October 2026, Dan).
  const controls = [
    ["details", "Details", UserRound], ["price", "Price", Euro], ["lessons", "Add a lesson", CalendarPlus], ["history", "Lesson history", History],
    // A fresh way in for someone already set up, sent only by her press inside
    // it; a dormant student's come-back email carries one already.
    ...(!student.email ? [] : student.dormant ? [["come-back", "Come-back email", Mail] as const] : [["sign-in", "Sign-in link", KeyRound] as const]),
  ] as const;
  const prices = ([60, 90] as const).filter(minutes => student.prices?.[minutes] !== undefined)
    .map(minutes => `${minutes} mins · ${formatPriceCents(student.prices![minutes]!)}`).join(", ");

  return <li ref={row} className={`teacher-setup teacher-setup--inline${ready ? " teacher-student teacher-student--inline is-ready" : ""}${step ? " is-open" : ""}`}>
    <div className="teacher-setup__header" ref={header} data-homework-exit>
      <button
        className="teacher-setup__profile"
        aria-controls={paneId}
        aria-expanded={step === "history"}
        aria-label={`Open ${student.name}’s profile`}
        ref={nameControl}
        disabled={disabled}
        onClick={() => onSelect(step === "history" ? null : "history")}
        type="button"
      ><AccountAvatar mark={student.mark || defaultStudentMark(student.id)} name={student.name} /><span className="teacher-setup__identity"><strong>{student.name}</strong>{ready && student.dormant ? <span className="teacher-student__label">Dormant</span> : null}</span></button>
      {ready ? <div className="teacher-student__controls" aria-label={`${student.name}’s profile sections`}>
        {controls.map(([panel, label, Icon]) => <button aria-controls={paneId} aria-expanded={step === panel} aria-label={`${label} for ${student.name}`} disabled={disabled} key={panel} onClick={() => { setNotice(""); onSelect(step === panel ? null : panel); }} type="button"><i aria-hidden="true"><Icon size={14} strokeWidth={2.2} /></i><span>{label}</span></button>)}
      </div> : <ol className="teacher-setup__steps">
        {steps.map(entry => <li className={entry.done ? "is-done" : entry.lockedReason ? "is-locked" : entry.id === next ? waitingOnStudent ? "is-waiting" : "is-next" : ""} key={entry.id} aria-current={entry.id === next ? "step" : undefined}>
          <button
            aria-controls={paneId}
            aria-expanded={step === entry.id}
            aria-label={`${entry.label} for ${student.name}`}
            aria-describedby={`${paneId}-${entry.id}-status`}
            disabled={disabled || Boolean(entry.lockedReason)}
            title={entry.lockedReason}
            onClick={() => { setNotice(""); onSelect(step === entry.id ? null : entry.id); }}
            type="button"
          ><i aria-hidden="true">{entry.done ? <Check size={12} strokeWidth={3} /> : entry.lockedReason ? <LockKeyhole size={12} strokeWidth={2} /> : entry.id === next && waitingOnStudent ? <Clock3 size={12} strokeWidth={2} /> : null}</i><span>{entry.label}<span className="visually-hidden" id={`${paneId}-${entry.id}-status`}>{entry.done ? ": done" : entry.lockedReason ? `: ${entry.lockedReason}` : entry.id === next && waitingOnStudent ? ": waiting for the student" : ": waiting"}</span></span></button>
        </li>)}
      </ol>}
      {step ? <div className="teacher-setup__action teacher-setup__close">
        <button className="teacher-dialog-close" aria-label="Close" aria-controls={paneId} disabled={disabled} onClick={close} type="button"><X size={20} aria-hidden="true" /></button>
      </div> : ready && student.weekly ? <div className="teacher-setup__action">
        {/* Their weekly run, in the row's otherwise empty corner (27 October 2026, Dan). */}
        <span className="teacher-student__weekly"><Repeat size={12} strokeWidth={2.4} aria-hidden="true" />Weekly</span>
      </div> : null}
    </div>
    {/* Only what needs her eye: their email and next lesson are a press
        away in Details and Lesson history (27 October 2026, Dan). */}
    {ready && !step && (prices || student.unpaidUpcoming || student.dormant && student.dormantEmailedAt) ? <ul className="booking-payment-facts teacher-student__facts">
      {prices ? <li>{prices}</li> : null}
      {student.unpaidUpcoming ? <li>{student.unpaidUpcoming === 1 ? "1 lesson" : `${student.unpaidUpcoming} lessons`} to be paid by hand</li> : null}
      {student.dormant && student.dormantEmailedAt ? <li>Come-back email sent {dateLabel(dateKey(new Date(student.dormantEmailedAt)), { day: "numeric", month: "short" })}</li> : null}
    </ul> : null}
    {attention ? <div className="teacher-setup__attention">{attention}</div> : null}
    {student.homeworkToReview?.length ? <div className="teacher-homework-return">
      <button type="button" data-homework-exit disabled={disabled} onClick={() => onHomework?.(student.homeworkToReview![0].bookingId)}>
        Homework to review
        <span className="teacher-homework-return__count" aria-label={`${student.homeworkToReview.length} waiting`}>{student.homeworkToReview.length}</span>
      </button>
    </div> : null}
    {step ? <div className={`teacher-setup__body${statusStep ? " teacher-setup__body--status" : ""}`} id={paneId} aria-label={`${student.name}’s ${profilePanel ? "profile" : "setup"}`} role="region" ref={body} tabIndex={-1}>
      <div className="teacher-setup__body-heading">
        <h3 id={`${paneId}-heading`}>{step === "history" ? "Lesson history" : step === "email" || step === "details" ? "Their details" : step === "price" ? "Their price" : step === "lessons" ? "Add a lesson" : step === "welcome" ? "Welcome" : step === "sign-in" ? "Sign in" : step === "come-back" ? `Come-back email to ${firstName(student)}` : "Saved card"}</h3>
        {help.length ? <ul className="booking-payment-facts teacher-setup__help">{help.map(text => <li key={text}>{text}</li>)}</ul> : null}
      </div>
      {step === "history" ? <>
        <div className="teacher-student__contact">
          <ul className="booking-payment-facts">
            {student.email ? <li>{student.email}</li> : null}
            {student.phone ? <li>{student.phone}</li> : null}
            {student.nif ? <li>NIF {student.nif}</li> : null}
          </ul>
          <div className="teacher-student__contact-actions">
            {!ready ? <button className="button button--outline button--small" disabled={disabled} onClick={() => onSelect("details")} type="button">Edit details</button> : null}
            {dormantButton}
          </div>
        </div>
        {problem ? <p className="teacher-inline-error" role="alert">{problem}</p> : null}
        <div className="teacher-student__history"><StudentHistory key={`${student.id}-${token}-${homeworkRequestKey ?? 0}`} student={student} token={token} homeworkId={homeworkId} /></div>
      </> : step === "email" || step === "details" ? <StudentDetailsForm
        key={`${student.id}-details`}
        emailRequired={step === "email"}
        emailLockedReason={steps.find(entry => entry.id === "email")?.lockedReason}
        onBusy={setBusy}
        onSaved={updated => { setNotice("Their details are saved."); onChanged?.(updated); close(); }}
        student={student}
        token={token}
      /> : step === "price" ? <>
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
      </> : step === "come-back" ? <ComeBackEmail
        key={`${student.id}-come-back`}
        defaultVersion={comeBackDefaultVersion}
        onBusy={setBusy}
        onRefresh={() => onChanged?.()}
        onSent={updated => { setNotice(`Sent to ${firstName(student)}.`); onChanged?.(updated); close(); }}
        student={student}
        token={token}
      /> : step === "lessons" ? <>
        <LessonForm
          key={`${student.id}-${date ?? ""}-${time ?? ""}`}
          date={date}
          time={time}
          idPrefix={`${paneId}-lesson`}
          onBusy={setBusy}
          onCreated={message => { setNotice(message); close(); onChanged?.({ ...student, hasLessons: true }); }}
          onRefresh={() => onChanged?.()}
          student={student}
          token={token}
        />
      </> : <>
        <div className="teacher-dialog-actions">
          {student.email ? sendButton(step !== "welcome" || !student.awaitingWelcome) : <button className="button button--coral button--compact" onClick={() => onSelect("email")} type="button">Add email</button>}
        </div>
      </>}
    </div> : null}
    {notice ? <p className="teacher-inline-success teacher-setup__notice" role="status">{notice}</p> : null}
  </li>;
}
