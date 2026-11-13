"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LessonDetails } from "@/components/teacher/LessonDetails";
import { StudentLessons, sharedFacts } from "@/components/teacher/StudentLessons";
import { EditActions, EditPencil } from "@/components/teacher/EditControls";
import { fetchBookings, fetchStudentNotes, isStudentsBooking, onBookingsReloaded, saveStudentPlan, type AdminBooking, type AdminStudent, type StudentNotes } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";

/**
 * One thing about a student: its name in small capitals and what it is
 * beneath. What she can change has one pencil, beside its name, that opens
 * everything under it as fields where they stand (10 November 2026, Dan:
 * "the amount of pencils here is kind of ugly can we just have it by each
 * thing like price / details / plan?"). A row's own action, such as Try
 * again, ends the name's line.
 */
export function FactRow({ label, labelId, edit, extra, action, children, wide }: {
  label: string;
  /** For a control that names itself by the row. */
  labelId?: string;
  /** The one pencil for everything under this name; left out while it is open. */
  edit?: ReactNode;
  /** After the name, such as their level beside Plan. */
  extra?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Takes the column's whole width where rows pair up, as a plan does. */
  wide?: boolean;
}) {
  return <div className={`teacher-fact${wide ? " teacher-fact--wide" : ""}`}>
    <div className="teacher-fact__head"><span className="teacher-fact__label" id={labelId}>{label}</span>{edit}{extra}</div>
    <div className="teacher-fact__value">{children}</div>
    {action ? <div className="teacher-fact__action">{action}</div> : null}
  </div>;
}

type History = { token: string; studentId: string; email: string; bookings: AdminBooking[] | null; error: string };
type Notes = { token: string; studentId: string; notes: StudentNotes | null; error: string };

/**
 * Everything about one student in one place (9 November 2026, Dan: "a simple
 * dashboard for all things for that student, a lesson plan, area, home work
 * … payments"): who they are, what they pay, what every lesson of theirs
 * shares and her plan for them in one column; their lessons beside it, each
 * a row she marks paid, opens in place, or writes notes and homework on. Each
 * thing is said once. What she does with the student (add a lesson, a sign-in
 * link) is in their card's top row, not here.
 */
export function StudentDashboard({ student, token, facts, homeworkId, homeworkRequestKey, onBusy, onPaidChanged }: {
  student: AdminStudent;
  token: string;
  /** Their details and price, as rows. */
  facts: ReactNode;
  /** Homework to review opens that lesson's notes. */
  homeworkId?: string;
  homeworkRequestKey?: number;
  onBusy?: (busy: boolean) => void;
  /** A lesson ticked paid, unticked, or changed, so their card's checks follow. */
  onPaidChanged?: () => void;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Bumped each time her lessons are read afresh, after every change she
  // makes to one and on her return to the page.
  const [lessonsRead, setLessonsRead] = useState(0);
  const [notesAttempt, setNotesAttempt] = useState(0);
  // The lesson open in place, one at a time. Only its id is kept, so what is
  // shown follows the lessons as they reload.
  const [selected, setSelected] = useState<{ id: string; action: "view" | "refund" | "change" } | null>(null);
  const [notice, setNotice] = useState("");
  const [openNotes, setOpenNotes] = useState<string | null>(homeworkId ?? null);
  const [plan, setPlan] = useState<string | null>(null);
  const [planError, setPlanError] = useState("");
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => { setBusyState(value); onBusy?.(value); };
  const root = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const studentId = student.id;
  const email = student.email?.trim().toLowerCase() ?? "";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  // A lesson's notes and its details are never open at once, so each lesson's
  // homework is on the page a single time.
  useEffect(() => {
    if (!homeworkId) return;
    setOpenNotes(homeworkId);
    setSelected(current => current?.id === homeworkId ? null : current);
  }, [homeworkId, homeworkRequestKey]);

  useEffect(() => onBookingsReloaded(() => setLessonsRead(value => value + 1)), []);
  useEffect(() => {
    let active = true;
    void fetchBookings(token, "1970-01-01T00:00:00.000Z", studentId).then(result => {
      if (!active || readSession() !== token) return;
      // A linked account survives an email change; see isStudentsBooking.
      const bookings = result.bookings.filter(booking =>
        (booking.status === "confirmed" || booking.status === "cancelled") &&
        isStudentsBooking(booking, { id: studentId, email }));
      setHistory({ token, studentId, email, bookings, error: "" });
    }).catch(caught => {
      if (!active || readSession() !== token) return;
      setHistory({ token, studentId, email, bookings: null, error: caught instanceof Error ? caught.message : "Lesson history couldn’t be loaded." });
    });
    return () => { active = false; };
    // Read again whenever her lessons are: the card stays open behind the
    // Timetable, and went on listing a lesson she had just cancelled or moved
    // there. Not on every new `student`, which a change of their details or a
    // welcome sent gives it too.
  }, [token, studentId, email, attempt, lessonsRead]);

  useEffect(() => {
    let active = true;
    void fetchStudentNotes(token, studentId).then(result => {
      if (active && readSession() === token) setNotes({ token, studentId, notes: result, error: "" });
    }).catch(caught => {
      if (active && readSession() === token) setNotes({ token, studentId, notes: null, error: caught instanceof Error ? caught.message : "Their notes couldn’t be loaded." });
    });
    return () => { active = false; };
  }, [token, studentId, notesAttempt]);

  // Hide an old student's result during the render before the next effect.
  const current = history?.token === token && history.studentId === studentId && history.email === email ? history : null;
  const currentNotes = notes?.token === token && notes.studentId === studentId ? notes : null;
  const bookings = current?.bookings ?? null;
  const selectedBooking = selected ? bookings?.find(booking => booking.id === selected.id) : undefined;
  const shared = bookings ? sharedFacts(bookings, now) : [];
  const written = currentNotes?.notes?.lessons ?? [];
  // Their level now: the latest lesson that has one.
  const level = written.find(lesson => lesson.level)?.level ?? null;
  const reload = () => { setAttempt(value => value + 1); setNotesAttempt(value => value + 1); };

  // Editing her plan puts the cursor in it; saved or cancelled, focus goes back to its pencil.
  const planField = useRef<HTMLTextAreaElement>(null);
  const planBack = useRef(false);
  const planOpen = plan !== null;
  useEffect(() => {
    const field = planField.current;
    if (planOpen && field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
  }, [planOpen]);
  useEffect(() => {
    if (planOpen || busy || !planBack.current) return;
    planBack.current = false;
    root.current?.querySelector<HTMLElement>('[data-edit="plan"]')?.focus();
  }, [planOpen, busy]);
  const closePlan = () => { planBack.current = true; setPlan(null); setPlanError(""); };

  async function savePlan() {
    const saved = currentNotes?.notes;
    if (plan === null || !saved) return;
    setBusy(true); setPlanError("");
    try {
      const updated = await saveStudentPlan(token, studentId, plan.trim(), saved.planUpdatedAt);
      setNotes({ token, studentId, notes: updated, error: "" });
      planBack.current = true;
      setPlan(null);
    } catch (caught) { setPlanError(caught instanceof Error ? caught.message : "The plan couldn’t be saved."); }
    finally { setBusy(false); }
  }

  const planRow = currentNotes?.notes ? <FactRow label="Plan" wide
    edit={plan === null ? <EditPencil field="plan" label={`${currentNotes.notes.plan ? "Change" : "Write"} ${student.name}’s plan`} disabled={busy} onEdit={() => setPlan(currentNotes.notes!.plan)} /> : null}
    extra={level ? <span className="teacher-notes__level">{level}</span> : null}>
    {plan !== null ? <form className="teacher-plan__edit" onSubmit={event => { event.preventDefault(); void savePlan(); }}
      onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); closePlan(); } }}>
      <textarea ref={planField} className="homework-notes__field" aria-label={`${student.name}’s plan`} rows={5} maxLength={4000} value={plan} disabled={busy}
        placeholder="What they’re working towards, what you’ve covered, what comes next" onChange={event => setPlan(event.target.value)} />
      <EditActions busy={busy} onCancel={closePlan} saveLabel="Save plan" />
      {planError ? <p className="teacher-inline-error" role="alert">{planError}</p> : null}
    </form> : currentNotes.notes.plan
      ? <p className="teacher-plan__text">{currentNotes.notes.plan}</p>
      : <span className="teacher-fact__line teacher-fact__empty">What they’re working towards</span>}
  </FactRow> : currentNotes?.error ? <FactRow label="Plan" wide action={<button className="button button--outline button--small" type="button" onClick={() => setNotesAttempt(value => value + 1)}>Try again</button>}>
    <span className="teacher-fact__empty" role="alert">{currentNotes.error}</span>
  </FactRow> : null;

  return <div className="teacher-dashboard" ref={root}>
    <div className="teacher-dashboard__about">
      <div className="teacher-facts">
        {facts}
        {shared.length ? <FactRow label="Every lesson">
          <ul className="booking-payment-facts teacher-fact__dabs">{shared.map(fact => <li key={fact}>{fact}</li>)}</ul>
        </FactRow> : null}
        {planRow}
      </div>
    </div>
    <div className="teacher-history" ref={historyRef} tabIndex={-1}>
      {/* The live region is always in place, so a saved change is announced when it is said. */}
      <div aria-live="polite">{notice ? <p className="teacher-inline-success">{notice}</p> : null}</div>
      <StudentLessons
        token={token}
        bookings={bookings}
        notes={currentNotes?.notes?.lessons ?? null}
        level={level}
        error={current?.error ?? ""}
        now={now}
        busy={busy}
        selectedId={selectedBooking ? selected!.id : null}
        details={selectedBooking ? heading => <LessonDetails
          key={selectedBooking.id}
          inlineHeading={heading}
          booking={selectedBooking}
          weekly={selectedBooking.series_id ? (bookings ?? []).filter(lesson => lesson.series_id === selectedBooking.series_id) : undefined}
          student={student}
          token={token}
          now={new Date(now)}
          initialAction={selected!.action}
          presentation="inline"
          afterChangeFocusRef={historyRef}
          onBusy={setBusy}
          onClose={() => setSelected(null)}
          onChanged={message => {
            if (readSession() !== token) return;
            setSelected(null);
            setNotice(message);
            reload();
            onPaidChanged?.();
          }}
        /> : null}
        openNotes={openNotes}
        onChangeLesson={booking => { setNotice(""); setOpenNotes(current => current === booking.id ? null : current); setSelected({ id: booking.id, action: "change" }); }}
        onCloseNotes={() => { setOpenNotes(null); setNotesAttempt(value => value + 1); }}
        onBusy={setBusy}
        onRetry={() => { setHistory(null); setAttempt(value => value + 1); }}
        onOpenLesson={booking => { setNotice(""); setOpenNotes(current => current === booking.id ? null : current); setSelected({ id: booking.id, action: "view" }); }}
        onCloseLesson={() => setSelected(null)}
        onRecordRefund={booking => { setNotice(""); setOpenNotes(current => current === booking.id ? null : current); setSelected({ id: booking.id, action: "refund" }); }}
        onPutBack={message => { if (readSession() !== token) return; setNotice(message); reload(); onPaidChanged?.(); }}
        onPaid={updated => {
          setHistory(state => state && state.bookings ? { ...state, bookings: state.bookings.map(booking => booking.id === updated.id ? { ...booking, ...updated } : booking) } : state);
          onPaidChanged?.();
        }}
      />
    </div>
  </div>;
}
