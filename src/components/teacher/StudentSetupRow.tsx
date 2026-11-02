"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, Check, Euro, KeyRound, Repeat, UserRound, X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { ComeBackEmail, firstName } from "@/components/teacher/DormantEmail";
import { LessonForm } from "@/components/teacher/LessonForm";
import { StudentDetailsForm } from "@/components/teacher/StudentDetailsForm";
import { StudentHistory } from "@/components/teacher/StudentHistory";
import { StudentPrice } from "@/components/teacher/StudentPrice";
import { WhatsAppInvite } from "@/components/teacher/WhatsAppInvite";
import { setStudentDormant, type AdminStudent } from "@/lib/admin-api";
import { dateKey, dateLabel, hasLessons, type StudentProgress } from "@/lib/teacher-calendar";
import { formatMoneyCents, formatPriceCents } from "@/lib/booking-api";
import { defaultStudentMark } from "@/lib/student-marks";

/** Their profile, or one piece of it open in its place. */
export type StudentPanel = "history" | "details" | "price" | "lessons" | "invite" | "come-back";
export type StudentRowSelection = { studentId: string; panel: StudentPanel; date?: string; time?: string; homeworkId?: string; homeworkRequestKey?: number };

const shortDate = (at: string) => dateLabel(dateKey(new Date(at)), { day: "numeric", month: "short" });

/**
 * The three checks that say how far they have got (2 November 2026, Dan:
 * "get everyone logged in, pay for previous lessons and able to book their
 * own lessons"), each done or still to do, said in a word or two.
 */
function ProgressChecks({ progress }: { progress: StudentProgress }) {
  const checks: { key: string; done: boolean; label: string; owed?: boolean }[] = [
    { key: "in", done: progress.signedIn, label: progress.signedIn ? "Signed in" : progress.invitedAt ? `Link sent ${shortDate(progress.invitedAt)}` : "Not signed in" },
    ...(progress.card === null ? [] : [
      { key: "card", done: progress.card, label: progress.card ? "Card saved" : "No card yet" },
      { key: "paid", done: !progress.openLessons, owed: Boolean(progress.openLessons),
        label: progress.openLessons ? `${formatMoneyCents(progress.openCents)} open` : "Paid up" },
    ]),
  ];
  return <ul className="teacher-student__checks">
    {checks.map(check => <li className={check.done ? "is-done" : check.owed ? "is-owed" : ""} key={check.key}>
      <i aria-hidden="true">{check.done ? <Check size={11} strokeWidth={3} /> : null}</i>
      <span>{check.label}{check.owed ? <span className="visually-hidden"> in {progress.openLessons === 1 ? "1 lesson" : `${progress.openLessons} lessons`} not marked paid</span> : null}</span>
    </li>)}
  </ul>;
}

/**
 * One student, one card: who they are, their three checks and the one thing
 * to press next (2 November 2026, Dan: "simplify and make all the student
 * management stuff more simple for Ines"). Their name opens their profile in
 * the same card: details, price and lessons, and from there the rest.
 */
export function StudentSetupRow({ student, progress, token, step: requestedStep, date, time, homeworkId, homeworkRequestKey, comeBackDefaultVersion, sending, locked, attention, onSelect, onHomework, onChanged, onWelcome, onBusy }: {
  student: AdminStudent;
  progress: StudentProgress;
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
  /** Lesson changes or payment notes belong to this student's one card. */
  attention?: ReactNode;
  onSelect: (step: StudentPanel | null) => void;
  onHomework?: (bookingId: string) => void;
  onChanged?: (student?: AdminStudent) => void;
  /** Resolves true once their email has gone. */
  onWelcome: (student: AdminStudent, again?: boolean) => Promise<boolean> | void;
  onBusy?: (busy: boolean) => void;
}) {
  const first = firstName(student);
  // A come-back email is only for someone still dormant, with an address.
  const step = requestedStep === "come-back" && !(student.dormant && student.email) ? null : requestedStep;
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
  const open = (panel: StudentPanel | null) => { setNotice(""); setProblem(""); onSelect(panel); };
  const close = () => {
    returnFocus.current = row.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]') ?? nameControl.current;
    onSelect(null);
  };
  // A link made in the open card moves it to Waiting on them once she closes
  // it, never while she is still sending it.
  const linkMade = useRef(false);
  useEffect(() => {
    if (step === "invite" || !linkMade.current) return;
    linkMade.current = false;
    onChanged?.();
  }, [step, onChanged]);
  useEffect(() => {
    if (step || disabled || !returnFocus.current) return;
    const target = returnFocus.current.isConnected ? returnFocus.current : nameControl.current;
    target?.focus({ preventScroll: true });
    returnFocus.current = null;
  }, [step, disabled]);

  useEffect(() => {
    if (!step || !body.current) return;
    const input = step === "details" ? body.current.querySelector<HTMLInputElement>('input[type="text"]')
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
    // Reveal the name and checks, rather than aligning a tall editor's bottom.
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

  /*
   * The one thing to press next. Hers to do is coral; a link already out
   * that they have yet to open is a quieter Send again; someone all set has
   * nothing to press. A dormant student is asked back: by their come-back
   * email, or on WhatsApp without an address.
   */
  const comeBack = student.dormant && Boolean(student.email);
  const next: { panel: StudentPanel; label: string; tone: "coral" | "lilac" } | null = student.dormant
    ? { panel: comeBack ? "come-back" : "invite", label: comeBack ? "Come-back email" : "Invite back", tone: "lilac" }
    : progress.stage === "waiting" ? { panel: "invite", label: "Send again", tone: "lilac" }
    : progress.next === "invite" ? { panel: "invite", label: "Invite", tone: "coral" }
    : progress.next === "pay" ? { panel: "invite", label: "Ask to pay", tone: "coral" }
    : progress.next === "card" ? { panel: "invite", label: "Ask for card", tone: "coral" } : null;
  const nextButton = next && (!step || step === "history") ? <button
    aria-controls={paneId}
    aria-expanded={false}
    className={`button button--${next.tone} button--compact teacher-student__next`}
    disabled={disabled}
    onClick={() => open(next.panel)}
    type="button"
  >{next.label}<span className="visually-hidden"> for {student.name}</span></button> : null;

  const profile = step === "history";
  const prices = ([60, 90] as const).filter(minutes => student.prices?.[minutes] !== undefined)
    .map(minutes => `${minutes} mins · ${formatPriceCents(student.prices![minutes]!)}`);
  const heading = step === "details" ? "Their details" : step === "price" ? "Their price" : step === "lessons" ? "Add a lesson"
    : step === "invite" ? `Send ${first} their link` : step === "come-back" ? `Come-back email to ${first}` : "";
  const comeBackSent = student.dormantEmailedAt ? shortDate(student.dormantEmailedAt) : "";
  const help: string[] = step === "invite" ? ["Signs them in once, within 14 days."]
    : step === "price" ? [Object.keys(student.ownPrices ?? student.prices ?? {}).length ? "Custom lesson price set." : "Standard lesson price applies."]
    : step === "lessons" ? [
      ...(!hasLessons(student) ? ["No lessons added yet."] : []),
      student.awaitingWelcome ? "Lesson emails wait for the welcome email." : "Lessons to come email the student.",
    ] : step === "come-back" ? ["Ends with a button to sign in and book.", comeBackSent ? `Last sent ${comeBackSent}.` : "Not sent yet."] : [];
  // A piece of the profile goes back to the profile once it is done.
  const backToProfile = (message: string) => { setNotice(message); onSelect("history"); };

  const tool = (panel: StudentPanel, label: string, Icon: typeof Euro) => <button
    aria-controls={paneId}
    className="button button--outline button--small"
    disabled={disabled}
    onClick={() => open(panel)}
    type="button"
  ><Icon size={14} aria-hidden="true" />{label}<span className="visually-hidden"> for {student.name}</span></button>;

  return <li ref={row} className={`teacher-setup teacher-setup--inline teacher-student teacher-student--inline${step ? " is-open" : ""}`}>
    <div className="teacher-setup__header" ref={header} data-homework-exit>
      <button
        className="teacher-setup__profile"
        aria-controls={paneId}
        aria-expanded={profile}
        aria-label={`Open ${student.name}’s profile`}
        ref={nameControl}
        disabled={disabled}
        onClick={() => open(profile ? null : "history")}
        type="button"
      ><AccountAvatar mark={student.mark || defaultStudentMark(student.id)} name={student.name} /><span className="teacher-setup__identity"><strong>{student.name}</strong>{student.dormant ? <span className="teacher-student__label">Dormant</span> : null}</span></button>
      {step ? <div className="teacher-setup__action teacher-setup__close">
        <button className="teacher-dialog-close" aria-label="Close" aria-controls={paneId} disabled={disabled} onClick={close} type="button"><X size={20} aria-hidden="true" /></button>
      </div> : student.weekly ? <div className="teacher-setup__action">
        {/* Their weekly run, in the card's top right corner (27 October 2026, Dan). */}
        <span className="teacher-student__weekly"><Repeat size={12} strokeWidth={2.4} aria-hidden="true" />Weekly</span>
      </div> : null}
    </div>
    {/* A dormant student's checks wait until they come back. */}
    {!student.dormant || nextButton ? <div className="teacher-student__progress">
      {student.dormant ? null : <ProgressChecks progress={progress} />}
      {nextButton}
    </div> : null}
    {attention ? <div className="teacher-setup__attention">{attention}</div> : null}
    {student.homeworkToReview?.length ? <div className="teacher-homework-return">
      <button type="button" data-homework-exit disabled={disabled} onClick={() => onHomework?.(student.homeworkToReview![0].bookingId)}>
        Homework to review
        <span className="teacher-homework-return__count" aria-label={`${student.homeworkToReview.length} waiting`}>{student.homeworkToReview.length}</span>
      </button>
    </div> : null}
    {step ? <div className="teacher-setup__body" id={paneId} aria-label={`${student.name}’s profile`} role="region" ref={body} tabIndex={-1}>
      {heading ? <div className="teacher-setup__body-heading">
        <h3 id={`${paneId}-heading`}>{heading}</h3>
        {help.length ? <ul className="booking-payment-facts teacher-setup__help">{help.map(text => <li key={text}>{text}</li>)}</ul> : null}
      </div> : null}
      {profile ? <>
        {/* Who they are and what they pay, then everything she can change,
            then their lessons (2 November 2026, Dan: "she can easily see a
            profile for each of her students"). */}
        <div className="teacher-student__about">
          <ul className="booking-payment-facts">
            {student.email ? <li>{student.email}</li> : <li>No email</li>}
            {student.phone ? <li>{student.phone}</li> : null}
            {student.nif ? <li>NIF {student.nif}</li> : null}
            {prices.length ? prices.map(price => <li key={price}>{price}</li>) : <li>Standard price</li>}
            {student.dormant && comeBackSent ? <li>Come-back email sent {comeBackSent}</li> : null}
          </ul>
          <div className="teacher-student__tools">
            {tool("lessons", "Add a lesson", CalendarPlus)}
            {tool("details", "Edit details", UserRound)}
            {tool("price", "Change price", Euro)}
            {/* Someone all set has no next step; a fresh way in for a lost link. */}
            {!next ? tool("invite", "Sign-in link", KeyRound) : null}
            {student.dormant || !student.nextLessonAt
              ? <button className="button button--outline button--small" disabled={disabled} onClick={() => void markDormant(!student.dormant)} type="button">
                {busy ? "Saving…" : student.dormant ? "Mark as active" : "Mark as dormant"}
              </button> : null}
          </div>
        </div>
        {problem ? <p className="teacher-inline-error" role="alert">{problem}</p> : null}
        <div className="teacher-student__history"><StudentHistory key={`${student.id}-${token}-${homeworkRequestKey ?? 0}`} student={student} token={token} homeworkId={homeworkId} onPaidChanged={() => onChanged?.()} /></div>
      </> : step === "details" ? <StudentDetailsForm
        key={`${student.id}-details`}
        onBusy={setBusy}
        onSaved={updated => { onChanged?.(updated); backToProfile("Their details are saved."); }}
        onCancel={() => open("history")}
        student={student}
        token={token}
      /> : step === "price" ? <StudentPrice
        key={`${student.id}-price`}
        idPrefix={`${paneId}-price`}
        labelledBy={`${paneId}-heading`}
        onBusy={setBusy}
        onCancel={() => open("history")}
        onChanged={updated => onChanged?.(updated)}
        startEditing
        student={student}
        token={token}
      /> : step === "come-back" ? <ComeBackEmail
        key={`${student.id}-come-back`}
        defaultVersion={comeBackDefaultVersion}
        onBusy={setBusy}
        onRefresh={() => onChanged?.()}
        onSent={updated => { setNotice(`Sent to ${first}.`); onChanged?.(updated); close(); }}
        student={student}
        token={token}
      /> : step === "invite" ? <WhatsAppInvite
        key={`${student.id}-invite`}
        onBusy={setBusy}
        onEmail={student.email ? () => void Promise.resolve(onWelcome(student, !student.awaitingWelcome)).then(sent => {
          // Sent, the card closes and says so; if not, the reason shows at the top of the page and this stays open.
          if (!sent) return;
          close();
          setNotice(`Email sent to ${first}.`);
        }) : undefined}
        onLink={() => { linkMade.current = true; }}
        progress={progress}
        sending={sending}
        student={student}
        token={token}
      /> : <LessonForm
        key={`${student.id}-${date ?? ""}-${time ?? ""}`}
        date={date}
        time={time}
        idPrefix={`${paneId}-lesson`}
        onBusy={setBusy}
        onCreated={message => { setNotice(message); close(); onChanged?.({ ...student, hasLessons: true }); }}
        onRefresh={() => onChanged?.()}
        student={student}
        token={token}
      />}
    </div> : null}
    {notice ? <p className="teacher-inline-success teacher-setup__notice" role="status">{notice}</p> : null}
  </li>;
}

