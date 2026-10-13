"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, ChevronRight, Repeat, Send } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { sendStudentWelcome, type AdminStudent } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { StudentHistory } from "@/components/teacher/StudentHistory";

/**
 * Someone she still needs to bring in comes first: never signed in, or (where
 * the site takes cards) lessons she added that no card pays for yet.
 */
function needsHer(student: AdminStudent, cards: boolean) {
  return !student.signedIn || Boolean(cards && student.unpaidUpcoming && !student.cardForAllLessons);
}

/** Where they are, in one plain line. */
function statusOf(student: AdminStudent, cards: boolean) {
  const byHand = cards && student.unpaidUpcoming && !student.cardForAllLessons
    ? `${student.unpaidUpcoming === 1 ? "1 lesson" : `${student.unpaidUpcoming} lessons`} paid by hand`
    : "";
  if (!student.signedIn) return ["Not signed in yet", byHand].filter(Boolean).join(" · ");
  if (byHand) return `No card yet · ${byHand}`;
  return student.cardForAllLessons ? "All set: signed in, card saved" : "Signed in";
}

function nextLesson(at: string) {
  return `${dateLabel(dateKey(new Date(at)), { weekday: "short", day: "numeric", month: "short" })}, ${formatSlotTime(at)}`;
}

/**
 * Her students at a glance, for the move onto the site (12 October 2026,
 * Dan): who has signed in, whose lessons a card pays for, and what comes
 * next, one small card each. The schedule reads the list with the page and
 * after every lesson she adds, so the count of those still to bring in shows
 * before she opens it and an open list is never stale.
 */
export function StudentList({
  token,
  students,
  cards,
  error,
  onAddLesson,
}: {
  token: string;
  students: AdminStudent[] | null;
  /** Whether the site takes cards just now; without them nobody is asked for one. */
  cards: boolean;
  error: string;
  onAddLesson: (student: AdminStudent) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminStudent | null>(null);
  const [sending, setSending] = useState("");
  // Each answer stays on its own student's card, where she pressed.
  const [sent, setSent] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function welcome(student: AdminStudent) {
    setSending(student.id);
    try {
      const result = await sendStudentWelcome(token, student.id);
      setSent((current) => ({
        ...current,
        [student.id]: { ok: true, message: result.card ? "Sent: a link to sign in and add a card" : "Sent: a link to sign in" },
      }));
    } catch (caught) {
      setSent((current) => ({
        ...current,
        [student.id]: { ok: false, message: caught instanceof Error ? caught.message : "The link couldn’t be sent." },
      }));
    } finally {
      setSending("");
    }
  }

  const term = query.trim().toLowerCase();
  const shown = (students ?? [])
    .filter((student) => !term || student.name.toLowerCase().includes(term) || student.email.toLowerCase().includes(term))
    .sort((a, b) => Number(needsHer(b, cards)) - Number(needsHer(a, cards)) || a.name.localeCompare(b.name));
  const waiting = (students ?? []).filter((student) => needsHer(student, cards)).length;

  return (
    <section className="teacher-students" aria-labelledby="teacher-students-title">
      <header className="teacher-tool-heading">
        <h2 className="visually-hidden" id="teacher-students-title">Manage students</h2>
        <ul className="teacher-help"><li>Choose a student to see their lessons.</li>{waiting ? <li>{waiting} {waiting === 1 ? "student needs" : "students need"} help getting started.</li> : null}</ul>
      </header>
      <div className="teacher-manual-body">
        {students && students.length > 8 ? (
          <label className="teacher-students__search">
            <span className="visually-hidden">Find a student</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a student"
              type="search"
              value={query}
            />
          </label>
        ) : null}
        {error ? (
          <p className="teacher-inline-error" role="alert">
            {error}
          </p>
        ) : null}
        {!students && !error ? <p className="teacher-students__lead">Loading your students…</p> : null}
        {students && !students.length ? (
          <p className="teacher-students__lead">No students yet. Anyone you add a lesson for appears here.</p>
        ) : null}
        <ul className="teacher-students__list">
          {shown.map((student) => {
            const waitingOn = needsHer(student, cards);
            const answer = sent[student.id];
            return (
              <li className={`teacher-student${waitingOn ? " needs-her" : " is-ready"}`} key={student.id}>
                <button className="teacher-student__profile" aria-label={`View lesson history for ${student.name}`} onClick={() => setSelected(student)} type="button">
                <AccountAvatar className="teacher-student__avatar" mark={student.mark} name={student.name} />
                <span className="teacher-student__main">
                  <strong className="teacher-student__name">{student.name}</strong>
                  <span className="teacher-student__email">{student.email}</span>
                  <span className="teacher-student__status">
                    {waitingOn ? (
                      <span aria-hidden="true" className="teacher-student__dot" />
                    ) : (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    )}
                    {statusOf(student, cards)}
                  </span>
                  <span className="teacher-student__next">
                    {student.nextLessonAt ? `Next lesson ${nextLesson(student.nextLessonAt)}` : "No lessons booked"}
                    {student.weekly ? (
                      <span className="teacher-student__weekly">
                        <Repeat size={13} aria-hidden="true" />
                        Weekly
                      </span>
                    ) : null}
                  </span>
                  <span className="teacher-student__history-link">Lesson history <ChevronRight size={14} aria-hidden="true" /></span>
                </span>
                </button>
                <div className="teacher-student__action">
                  <button className="teacher-student__button" onClick={() => onAddLesson(student)} type="button">
                    <CalendarPlus size={15} aria-hidden="true" />
                    Add lesson
                    <span className="visually-hidden"> for {student.name}</span>
                  </button>
                  {/* Only someone still to bring in needs a way in sent. */}
                  {waitingOn && !answer?.ok ? (
                    <button
                      className="teacher-student__button teacher-student__button--send"
                      disabled={sending === student.id}
                      onClick={() => void welcome(student)}
                      type="button"
                    >
                      <Send size={15} aria-hidden="true" />
                      {sending === student.id ? "Sending…" : "Send sign-in link"}
                      <span className="visually-hidden"> to {student.name}</span>
                    </button>
                  ) : null}
                  {answer ? (
                    <span className={answer.ok ? "teacher-student__sent" : "teacher-student__failed"} role={answer.ok ? "status" : "alert"}>
                      {answer.message}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {selected ? <StudentHistory key={`${token}:${selected.id}`} student={selected} token={token} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
