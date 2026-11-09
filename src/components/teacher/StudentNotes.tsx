"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, NotebookPen, PenLine } from "lucide-react";
import { TeacherHomework } from "@/components/homework/TeacherHomework";
import { useMasonryWithin } from "@/components/teacher/masonry";
import { fetchStudentNotes, saveStudentPlan, type AdminStudent, type NoteHomework, type StudentNoteLesson, type StudentNotes as Notes } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

const homeworkState: Record<NoteHomework, string> = { none: "", draft: "Draft", published: "With them", review: "To review", done: "Done" };
const lessonDate = (at: string) => dateLabel(dateKey(new Date(at)), { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

/**
 * One page per student for what they are learning (9 November 2026, Dan:
 * "a homework page for each student and lesson structure … Ines can input
 * notes about each lesson … it can build up over time"): her plan for them on
 * top, then each lesson that has been, newest first, with her notes and its
 * homework. Opening one is the homework editor that used to sit on every
 * lesson card.
 */
export function StudentNotes({ student, token, homeworkId }: { student: AdminStudent; token: string; homeworkId?: string }) {
  const [notes, setNotes] = useState<Notes | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | null>(homeworkId ?? null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [planError, setPlanError] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Notes run long or short; they pack like the lessons, with no holes.
  useMasonryWithin(root, ".teacher-notes__list");
  const studentId = student.id;

  useEffect(() => {
    let active = true;
    void fetchStudentNotes(token, studentId).then(result => {
      if (active && readSession() === token) { setNotes(result); setError(""); }
    }).catch(caught => {
      if (active && readSession() === token) setError(caught instanceof Error ? caught.message : "Their notes couldn’t be loaded.");
    });
    return () => { active = false; };
  }, [token, studentId, attempt]);
  useEffect(() => { if (homeworkId) setOpen(homeworkId); }, [homeworkId]);

  if (!notes) return <div className="teacher-notes" ref={root}>{error ? <>
    <p className="teacher-inline-error" role="alert">{error}</p>
    <button className="button button--outline button--small" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button>
  </> : <p role="status">Loading their notes…</p>}</div>;

  const written = notes.lessons.filter(lesson => lesson.notes.trim() || lesson.homework !== "none");
  // The lesson most likely to need notes now: the latest one with none.
  const next = notes.lessons[0] && !written.includes(notes.lessons[0]) ? notes.lessons[0] : null;
  const earlier = notes.lessons.filter(lesson => lesson !== next && !written.includes(lesson));
  const level = written.find(lesson => lesson.level)?.level ?? null;
  const close = () => { setOpen(null); setAttempt(value => value + 1); };

  async function savePlan() {
    if (plan === null || !notes) return;
    setBusy(true); setPlanError("");
    try { setNotes(await saveStudentPlan(token, studentId, plan.trim(), notes.planUpdatedAt)); setPlan(null); }
    catch (caught) { setPlanError(caught instanceof Error ? caught.message : "The plan couldn’t be saved."); }
    finally { setBusy(false); }
  }

  // Nothing said twice (9 November 2026, Dan: "we don't need all the
  // information repeating"): the date opens the lesson, a level shows only
  // where it differs from theirs now, and homework is one dab once there is any.
  const card = (lesson: StudentNoteLesson) => {
    const state = homeworkState[lesson.homework];
    const opened = open === lesson.bookingId;
    return <li className={`teacher-history-lesson teacher-notes__lesson${opened ? " is-open" : ""}`} key={lesson.bookingId}>
      <div className="teacher-notes__top">
        <button type="button" className="teacher-notes__when" data-homework-exit disabled={busy} aria-expanded={opened}
          onClick={() => opened ? close() : setOpen(lesson.bookingId)}>
          {lessonDate(lesson.lessonAt)}<span className="visually-hidden">{lesson.notes.trim() ? ", open notes and homework" : ", add notes"}</span>
        </button>
        {lesson.level && lesson.level !== level ? <span className="teacher-notes__level">{lesson.level}</span> : null}
        {state ? <span className={`teacher-notes__state is-${lesson.homework}`}>{state}</span> : null}
        {opened ? <button type="button" className="teacher-history-homework" aria-expanded="true" data-homework-exit disabled={busy} onClick={close}>Close<span className="visually-hidden"> homework</span></button> : null}
      </div>
      {lesson.notes.trim() ? <p className="teacher-notes__text">{lesson.notes.trim()}</p> : null}
      {opened ? <TeacherHomework key={`${lesson.bookingId}-${token}`} bookingId={lesson.bookingId} token={token} onBusy={setBusy} /> : null}
    </li>;
  };

  return <div className="teacher-notes" ref={root}>
    <section className="teacher-notes__plan" aria-labelledby={`${studentId}-plan`}>
      <div className="teacher-notes__plan-head">
        <h4 id={`${studentId}-plan`}>Plan</h4>
        {level ? <span className="teacher-notes__level">{level}</span> : null}
        {plan === null ? <button className="teacher-history-homework" type="button" disabled={busy} onClick={() => setPlan(notes.plan)}>
          <PenLine size={15} aria-hidden="true" />{notes.plan ? "Edit plan" : "Write a plan"}
        </button> : null}
      </div>
      {plan !== null ? <>
        <textarea className="homework-notes__field teacher-notes__plan-field" aria-labelledby={`${studentId}-plan`} rows={5} maxLength={4000} value={plan}
          placeholder="What they’re working towards, what you’ve covered, what comes next" onChange={event => setPlan(event.target.value)} />
        {planError ? <p className="teacher-inline-error" role="alert">{planError}</p> : null}
        <div className="teacher-notes__plan-actions">
          <button className="button button--coral button--small" type="button" disabled={busy} onClick={() => void savePlan()}>{busy ? "Saving…" : "Save plan"}</button>
          <button className="button button--outline button--small" type="button" disabled={busy} onClick={() => { setPlan(null); setPlanError(""); }}>Cancel</button>
        </div>
      </> : notes.plan ? <p className="teacher-notes__plan-text">{notes.plan}</p> : null}
    </section>
    {next && open !== next.bookingId ? <button className="button button--coral teacher-notes__next" type="button" disabled={busy} onClick={() => setOpen(next.bookingId)}>
      <NotebookPen size={17} aria-hidden="true" />Add notes · {lessonDate(next.lessonAt)}
    </button> : null}
    {written.length || (next && open === next.bookingId) ? <ul className="teacher-history-list teacher-notes__list">
      {next && open === next.bookingId ? card(next) : null}
      {written.map(card)}
    </ul> : <p className="teacher-history-empty">No notes yet.</p>}
    {earlier.length ? <div className="teacher-notes__earlier">
      <button className="teacher-history-homework teacher-history-run__toggle" type="button" aria-expanded={showEmpty} onClick={() => setShowEmpty(value => !value)}>
        {earlier.length} earlier {earlier.length === 1 ? "lesson" : "lessons"} without notes<ChevronDown size={15} aria-hidden="true" />
      </button>
      {showEmpty ? <ul className="teacher-history-list teacher-notes__list">{earlier.map(card)}</ul> : null}
    </div> : null}
  </div>;
}
