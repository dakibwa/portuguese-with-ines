"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LessonDetails } from "@/components/teacher/LessonDetails";
import { StudentLessons, sharedFacts } from "@/components/teacher/StudentLessons";
import { useMasonryWithin } from "@/components/teacher/masonry";
import { fetchBookings, fetchStudentNotes, saveStudentPlan, type AdminBooking, type AdminStudent, type StudentNotes } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";

/**
 * One fact about a student on one row: its name in small capitals, what it
 * is, and the one thing to do about it at the row's end (9 November 2026,
 * Dan, of the smoothed Profile: label, value and button share a row).
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
 * a row she marks paid, opens, or writes notes and homework on. Each thing is
 * said once.
 */
export function StudentDashboard({ student, token, facts, tools, addLesson, homeworkId, homeworkRequestKey, onBusy, onPaidChanged }: {
  student: AdminStudent;
  token: string;
  /** Their details and price, as rows. */
  facts: ReactNode;
  /** Her rarer tools, at the foot of the column. */
  tools?: ReactNode;
  addLesson: ReactNode;
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
  const [selected, setSelected] = useState<{ booking: AdminBooking; action: "view" | "refund" } | null>(null);
  const [notice, setNotice] = useState("");
  const [openNotes, setOpenNotes] = useState<string | null>(homeworkId ?? null);
  const [plan, setPlan] = useState<string | null>(null);
  const [planError, setPlanError] = useState("");
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => { setBusyState(value); onBusy?.(value); };
  const root = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const studentId = student.id;
  const email = student.email?.trim().toLowerCase() ?? "";
  // Their lessons pack two across without holes where there is room.
  useMasonryWithin(root, ".teacher-history-list");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (homeworkId) setOpenNotes(homeworkId); }, [homeworkId, homeworkRequestKey]);

  useEffect(() => {
    let active = true;
    void fetchBookings(token, "1970-01-01T00:00:00.000Z").then(result => {
      if (!active || readSession() !== token) return;
      // A linked account survives an email change. Only older, unlinked
      // lessons use an exact email match; names never identify a student.
      const bookings = result.bookings.filter(booking =>
        (booking.status === "confirmed" || booking.status === "cancelled") &&
        (booking.student_id
          ? booking.student_id === studentId
          : Boolean(email) && booking.student_email.trim().toLowerCase() === email));
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
  const shared = bookings ? sharedFacts(bookings, now) : [];
  const written = currentNotes?.notes?.lessons ?? [];
  // Their level now: the latest lesson that has one.
  const level = written.find(lesson => lesson.level)?.level ?? null;
  const reload = () => { setAttempt(value => value + 1); setNotesAttempt(value => value + 1); };

  async function savePlan() {
    const saved = currentNotes?.notes;
    if (plan === null || !saved) return;
    setBusy(true); setPlanError("");
    try {
      const updated = await saveStudentPlan(token, studentId, plan.trim(), saved.planUpdatedAt);
      setNotes({ token, studentId, notes: updated, error: "" });
      setPlan(null);
    } catch (caught) { setPlanError(caught instanceof Error ? caught.message : "The plan couldn’t be saved."); }
    finally { setBusy(false); }
  }

  const planRow = currentNotes?.notes ? <FactRow label="Plan" wide
    extra={level ? <span className="teacher-notes__level">{level}</span> : null}
    action={plan === null ? <button className="button button--outline button--small" type="button" disabled={busy} onClick={() => setPlan(currentNotes.notes!.plan)}>
      {currentNotes.notes.plan ? "Change" : "Write"}<span className="visually-hidden"> {student.name}’s plan</span>
    </button> : null}>
    {plan !== null ? <div className="teacher-plan__edit">
      <textarea className="homework-notes__field" aria-label={`${student.name}’s plan`} rows={5} maxLength={4000} value={plan} disabled={busy}
        placeholder="What they’re working towards, what you’ve covered, what comes next" onChange={event => setPlan(event.target.value)} />
      {planError ? <p className="teacher-inline-error" role="alert">{planError}</p> : null}
      <div className="teacher-plan__actions">
        <button className="button button--coral button--small" type="button" disabled={busy} onClick={() => void savePlan()}>{busy ? "Saving…" : "Save plan"}</button>
        <button className="button button--outline button--small" type="button" disabled={busy} onClick={() => { setPlan(null); setPlanError(""); }}>Cancel</button>
      </div>
    </div> : currentNotes.notes.plan ? <p className="teacher-plan__text">{currentNotes.notes.plan}</p>
      : <span className="teacher-fact__empty">What they’re working towards</span>}
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
      {tools ? <div className="teacher-dashboard__tools">{tools}</div> : null}
    </div>
    <div className="teacher-history" tabIndex={-1}>
      {notice ? <p className="teacher-inline-success" role="status">{notice}</p> : null}
      <StudentLessons
        token={token}
        bookings={bookings}
        notes={currentNotes?.notes?.lessons ?? null}
        level={level}
        error={current?.error ?? ""}
        now={now}
        busy={busy}
        action={addLesson}
        openNotes={openNotes}
        onOpenNotes={id => setOpenNotes(id)}
        onCloseNotes={() => { setOpenNotes(null); setNotesAttempt(value => value + 1); }}
        onBusy={setBusy}
        onRetry={() => { setHistory(null); setAttempt(value => value + 1); }}
        onOpenLesson={booking => { setNotice(""); setSelected({ booking, action: "view" }); }}
        onRecordRefund={booking => { setNotice(""); setSelected({ booking, action: "refund" }); }}
        onPaid={updated => {
          setHistory(state => state && state.bookings ? { ...state, bookings: state.bookings.map(booking => booking.id === updated.id ? { ...booking, ...updated } : booking) } : state);
          onPaidChanged?.();
        }}
      />
    </div>
    {selected ? <LessonDetails
      key={selected.booking.id}
      booking={selected.booking}
      weekly={selected.booking.series_id ? (bookings ?? []).filter(lesson => lesson.series_id === selected.booking.series_id) : undefined}
      student={student}
      token={token}
      now={new Date(now)}
      initialAction={selected.action}
      afterChangeFocusRef={root}
      onClose={() => setSelected(null)}
      onChanged={message => {
        if (readSession() !== token) return;
        setSelected(null);
        setNotice(message);
        reload();
        onPaidChanged?.();
      }}
    /> : null}
  </div>;
}
