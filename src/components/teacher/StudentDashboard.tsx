"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LessonDetails } from "@/components/teacher/LessonDetails";
import { StudentLessons, sharedFacts } from "@/components/teacher/StudentLessons";
import { useMasonryWithin } from "@/components/teacher/masonry";
import { EditValue } from "@/components/teacher/EditControls";
import { fetchBookings, fetchStudentNotes, isStudentsBooking, saveStudentPlan, type AdminBooking, type AdminStudent, type StudentNotes } from "@/lib/admin-api";import { readSession } from "@/lib/auth-api";

/**
 * One fact about a student on one row: its name in small capitals and what it
 * is beneath. What she can change is its own EditValue, a tiny pencil at its
 * end (9 November 2026, Dan); a row's own action, such as Try again, ends the
 * name's line.
 */
export function FactRow({ label, extra, action, children, wide }: {
  label: string;
  /** Beside the label, such as their level beside Plan. */
  extra?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Takes the column's whole width where rows pair up, as a plan does. */
  wide?: boolean;
}) {
  return <div className={`teacher-fact${wide ? " teacher-fact--wide" : ""}`}>
    <span className="teacher-fact__label">{label}{extra}</span>
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
  const [notesAttempt, setNotesAttempt] = useState(0);
  // The lesson open in place, one at a time. Only its id is kept, so what is
  // shown follows the lessons as they reload.
  const [selected, setSelected] = useState<{ id: string; action: "view" | "refund" } | null>(null);
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
  // Their lessons pack two across without holes where there is room.
  useMasonryWithin(root, ".teacher-history-list");

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

  useEffect(() => {
    let active = true;
    void fetchBookings(token, "1970-01-01T00:00:00.000Z").then(result => {
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
  }, [token, studentId, email, attempt]);

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
    extra={level ? <span className="teacher-notes__level">{level}</span> : null}>
    {plan !== null ? <div className="teacher-plan__edit">
      <textarea ref={planField} className="homework-notes__field" aria-label={`${student.name}’s plan`} rows={5} maxLength={4000} value={plan} disabled={busy}
        placeholder="What they’re working towards, what you’ve covered, what comes next" onChange={event => setPlan(event.target.value)} />
      {planError ? <p className="teacher-inline-error" role="alert">{planError}</p> : null}
      <div className="teacher-plan__actions">
        <button className="button button--coral button--small" type="button" disabled={busy} onClick={() => void savePlan()}>{busy ? "Saving…" : "Save plan"}</button>
        <button className="button button--outline button--small" type="button" disabled={busy} onClick={closePlan}>Cancel</button>
      </div>
    </div> : <EditValue field="plan" label={`${currentNotes.notes.plan ? "Change" : "Write"} ${student.name}’s plan`} disabled={busy} empty={!currentNotes.notes.plan} onEdit={() => setPlan(currentNotes.notes!.plan)}>
      <span className="teacher-plan__text">{currentNotes.notes.plan || "What they’re working towards"}</span>
    </EditValue>}
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
        onOpenNotes={id => { setSelected(current => current?.id === id ? null : current); setOpenNotes(id); }}
        onCloseNotes={() => { setOpenNotes(null); setNotesAttempt(value => value + 1); }}
        onBusy={setBusy}
        onRetry={() => { setHistory(null); setAttempt(value => value + 1); }}
        onOpenLesson={booking => { setNotice(""); setOpenNotes(current => current === booking.id ? null : current); setSelected({ id: booking.id, action: "view" }); }}
        onCloseLesson={() => setSelected(null)}
        onRecordRefund={booking => { setNotice(""); setOpenNotes(current => current === booking.id ? null : current); setSelected({ id: booking.id, action: "refund" }); }}
        onPaid={updated => {
          setHistory(state => state && state.bookings ? { ...state, bookings: state.bookings.map(booking => booking.id === updated.id ? { ...booking, ...updated } : booking) } : state);
          onPaidChanged?.();
        }}
      />
    </div>
  </div>;
}
