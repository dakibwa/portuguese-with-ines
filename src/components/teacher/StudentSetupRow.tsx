"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, Check, Euro, KeyRound, Repeat, X } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { ComeBackEmail, firstName } from "@/components/teacher/DormantEmail";
import { EditActions, EditPencil } from "@/components/teacher/EditControls";
import { LessonForm } from "@/components/teacher/LessonForm";
import { StudentDashboard, FactRow } from "@/components/teacher/StudentDashboard";
import { StudentPrice } from "@/components/teacher/StudentPrice";
import { WhatsAppInvite } from "@/components/teacher/WhatsAppInvite";
import { setStudentDormant, updateStudentDetails, type AdminStudent } from "@/lib/admin-api";
import { dateKey, dateLabel, hasLessons, type StudentProgress } from "@/lib/teacher-calendar";
import { formatMoneyCents } from "@/lib/booking-api";
import { defaultStudentMark } from "@/lib/student-marks";

/** Their profile, or one piece of it open in its place. */
export type StudentPanel = "history" | "lessons" | "invite" | "come-back";
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
      { key: "card", done: progress.card, label: progress.card ? "Card saved" : progress.cardSaved ? "Lessons not on card" : "No card yet" },
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

type Details = { name: string; email: string; phone: string; nif: string };

/**
 * Who they are, changed together where it reads (10 November 2026, Dan: one
 * pencil by Details, not one on every line): their name, email, phone and NIF
 * as fields, each named at its left, saved by the one tick. A signed-in
 * student's email is theirs to change, so it is only read here.
 */
function DetailsEdit({ student, onSave, onClose, onBusy }: { student: AdminStudent; onSave: (details: Partial<Details>) => Promise<void>; onClose: () => void; onBusy: (busy: boolean) => void }) {
  const saved: Details = { name: student.name, email: student.email ?? "", phone: student.phone ?? "", nif: student.nif ?? "" };
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (key: keyof Details, label: string, input: { type?: "email" | "tel"; inputMode?: "email" | "tel" | "numeric"; placeholder?: string; required?: boolean; autoCapitalize?: string; autoFocus?: boolean }) => <label>
    <span>{label}</span>
    <input autoComplete="off" disabled={busy} name={key} onChange={event => setDraft({ ...draft, [key]: event.target.value })} spellCheck={false} type="text" value={draft[key]} {...input} />
  </label>;
  return <form className="teacher-details-edit" onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); onClose(); } }}
    onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const next: Details = { name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), nif: draft.nif.trim() };
      // Only what she changed is sent: the rest is as her list last read it,
      // and sending that back would undo what the student has saved since.
      const changed = (Object.keys(next) as (keyof Details)[]).filter(key => next[key] !== saved[key]);
      if (!changed.length) { onClose(); return; }
      setBusy(true); onBusy(true); setError("");
      try { await onSave(Object.fromEntries(changed.map(key => [key, next[key]]))); onClose(); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Their details couldn’t be saved."); }
      finally { setBusy(false); onBusy(false); }
    }}>
    {field("name", "Name", { required: true, autoCapitalize: "words", autoFocus: true })}
    {student.signedIn
      ? <><span>Email</span><span className="teacher-details-edit__read">{student.email || "No email"}</span></>
      : field("email", "Email", { type: "email", inputMode: "email", placeholder: "name@example.com", required: Boolean(student.email) })}
    {field("phone", "Phone", { type: "tel", inputMode: "tel" })}
    {field("nif", "NIF", { inputMode: "numeric", placeholder: "For receipts" })}
    <EditActions busy={busy} onCancel={onClose} saveLabel="Save details" />
    {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
  </form>;
}

/**
 * One student, one card: who they are, their three checks and the one thing
 * to press next (2 November 2026, Dan: "simplify and make all the student
 * management stuff more simple for Ines"). Their name opens their profile in
 * the same card: details, price and lessons, and from there the rest.
 */
export function StudentSetupRow({ student, progress, token, step: requestedStep, date, time, homeworkId, homeworkRequestKey, comeBackDefaultVersion, sending, locked, attention, notice, onNotice, onSelect, onHomework, onChanged, onWelcome, onBusy }: {
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
  /**
   * What was just done, said at the card's foot. The list owns it because an
   * open card is shown apart from the board and returns to its lane, as a new
   * card, when it closes.
   */
  notice: string;
  onNotice: (message: string) => void;
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
  const [marking, setMarking] = useState(false);
  const setNotice = onNotice;
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
  // Details and Price each open where they read, from the one pencil by their name.
  const [editing, setEditing] = useState<{ details: boolean; price: boolean }>({ details: false, price: false });
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
  // Closing moves the card to its lane as a new one, so this one's own
  // closing effect never runs: its pending refresh goes as it leaves.
  const latestChanged = useRef(onChanged);
  useEffect(() => { latestChanged.current = onChanged; });
  useEffect(() => () => {
    if (!linkMade.current) return;
    linkMade.current = false;
    latestChanged.current?.();
  }, []);
  useEffect(() => {
    if (step || disabled || !returnFocus.current) return;
    const target = returnFocus.current.isConnected ? returnFocus.current : nameControl.current;
    target?.focus({ preventScroll: true });
    returnFocus.current = null;
  }, [step, disabled]);

  useEffect(() => {
    if (!step || !body.current) return;
    const field = step === "lessons" ? body.current.querySelector<HTMLButtonElement>('.teacher-lesson-picker [data-lesson-date][tabindex="0"]') : null;
    (field ?? body.current).focus({ preventScroll: true });
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
  // Saved or cancelled, focus goes back to the pencil that opened it.
  const wasEditing = useRef(editing);
  useEffect(() => {
    for (const section of ["details", "price"] as const) {
      if (wasEditing.current[section] && !editing[section]) row.current?.querySelector<HTMLElement>(`[data-edit="${section}"]`)?.focus({ preventScroll: true });
    }
    wasEditing.current = editing;
  }, [editing]);

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
    setMarking(true);
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const { student: updated } = await setStudentDormant(token, student.id, dormant);
      onChanged?.(updated);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "That couldn’t be saved. Please try again.");
    } finally {
      setMarking(false);
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
  const heading = step === "lessons" ? "Add a lesson"
    : step === "invite" ? `Send ${first} their link` : step === "come-back" ? `Come-back email to ${first}` : "";
  const comeBackSent = student.dormantEmailedAt ? shortDate(student.dormantEmailedAt) : "";
  const help: string[] = step === "invite" ? ["Signs them in once, within 14 days."]
    : step === "lessons" ? [
      ...(!hasLessons(student) ? ["No lessons added yet."] : []),
      student.awaitingWelcome ? "Lesson emails wait for the welcome email."
        : student.email ? "Lessons to come email the student." : "No email yet, so nothing is emailed.",
    ] : step === "come-back" ? ["Ends with a button to sign in and book.", comeBackSent ? `Last sent ${comeBackSent}.` : "Not sent yet."] : [];
  async function saveDetails(details: Partial<Details>) {
    setNotice(""); setProblem("");
    const { student: updated } = await updateStudentDetails(token, student.id, details);
    onChanged?.(updated);
    setNotice("Their details are saved.");
  }
  const tool = (panel: StudentPanel, label: string, Icon: typeof Euro) => <button
    aria-controls={paneId}
    className="button button--outline button--small"
    disabled={disabled}
    onClick={() => open(panel)}
    type="button"
  ><Icon size={14} aria-hidden="true" />{label}<span className="visually-hidden"> for {student.name}</span></button>;

  // What she does with an open student sits in the card's top row, beside
  // their name and how far they have got (9 November 2026, Dan), and wraps on
  // a phone: the one next step, Add a lesson, then the rarer ones.
  const actions = <div className="teacher-student__actions">
    {nextButton}
    {tool("lessons", "Add a lesson", CalendarPlus)}
    {/* Someone all set has no next step; a fresh way in for a lost link. */}
    {!next ? tool("invite", "Sign-in link", KeyRound) : null}
    {student.dormant || !student.nextLessonAt
      ? <button className="button button--outline button--small" disabled={disabled} onClick={() => void markDormant(!student.dormant)} type="button">
        {marking ? "Saving…" : student.dormant ? "Mark as active" : "Mark as dormant"}
      </button> : null}
  </div>;

  return <li ref={row} data-student-id={student.id} className={`teacher-setup teacher-setup--inline teacher-student teacher-student--inline${step ? " is-open" : ""}`}>
    <div className="teacher-setup__header" ref={header} data-homework-exit>
      {/* Opening and closing their card is the name's button; the name is
          changed with their other details, from the pencil by Details. */}
      <div className="teacher-setup__who">
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
      </div>
      {/* Open, how far they have got and what she can do sit in this one row
          (9 November 2026, Dan: "more consolidate and simple"): their checks
          beside their name, her actions, then close. The checks keep the top
          bar while one of her panels is open too (10 November 2026, Dan:
          "could the little bits not appear in the top bar"). */}
      {step ? <div className="teacher-student__bar">
        {student.dormant ? null : <ProgressChecks progress={progress} />}
        {profile ? actions : null}
      </div> : null}
      {step ? <div className="teacher-setup__action teacher-setup__close">
        <button className="teacher-dialog-close" aria-label="Close" aria-controls={paneId} disabled={disabled} onClick={close} type="button"><X size={20} aria-hidden="true" /></button>
      </div> : student.weekly ? <div className="teacher-setup__action">
        {/* Their weekly run, in the card's top right corner (27 October 2026, Dan). */}
        <span className="teacher-student__weekly"><Repeat size={12} strokeWidth={2.4} aria-hidden="true" />Weekly</span>
      </div> : null}
    </div>
    {/* Closed, their checks and the one next step sit beneath their name. A
        dormant student's checks wait until they come back. */}
    {!step && (!student.dormant || nextButton) ? <div className="teacher-student__progress">
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
        {/* Everything about them, each thing once (9 November 2026, Dan: "a
            simple dashboard for all things for that student"). */}
        {problem ? <p className="teacher-inline-error" role="alert">{problem}</p> : null}
        <StudentDashboard
          key={`${student.id}-${token}`}
          student={student}
          token={token}
          homeworkId={homeworkId}
          homeworkRequestKey={homeworkRequestKey}
          onBusy={setBusy}
          onPaidChanged={() => onChanged?.()}
          facts={<>
            {/* One pencil by each name (10 November 2026, Dan); what is not
                yet known is left out, and its field waits under the pencil. */}
            <FactRow label="Details"
              edit={editing.details ? null : <EditPencil disabled={disabled} field="details" label={`Change details for ${student.name}`} onEdit={() => setEditing(now => ({ ...now, details: true }))} />}>
              {editing.details ? <DetailsEdit
                onBusy={setBusy}
                onClose={() => setEditing(now => ({ ...now, details: false }))}
                onSave={saveDetails}
                student={student}
              /> : <>
                <span className={`teacher-fact__line${student.email ? "" : " teacher-fact__empty"}`}>{student.email || "No email yet"}</span>
                {student.phone ? <span className="teacher-fact__line">{student.phone}</span> : null}
                {student.nif ? <span className="teacher-fact__line">NIF {student.nif}</span> : null}
              </>}
            </FactRow>
            <FactRow label="Price" labelId={`${paneId}-price-label`}
              edit={editing.price ? null : <EditPencil disabled={disabled} field="price" label={`Change price for ${student.name}`} onEdit={() => setEditing(now => ({ ...now, price: true }))} />}>
              <StudentPrice
                editing={editing.price}
                idPrefix={`${paneId}-price`}
                labelledBy={`${paneId}-price-label`}
                onBusy={setBusy}
                onChanged={updated => onChanged?.(updated)}
                onClose={() => setEditing(now => ({ ...now, price: false }))}
                student={student}
                token={token}
              />
            </FactRow>
            {student.dormant && comeBackSent ? <FactRow label="Come-back email"><span>Sent {comeBackSent}</span></FactRow> : null}
          </>}
        />
      </> : step === "come-back" ? <ComeBackEmail
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

