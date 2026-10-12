"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, Repeat, Send, Users } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { sendStudentWelcome, type AdminStudent } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

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
    <details className="teacher-students">
      <summary>
        <span>
          <span className="teacher-eyebrow">Who&rsquo;s on the site</span>
          <span className="teacher-manual-title">
            Your students
            {students ? <span className="teacher-students__count"> · {students.length}</span> : null}
            {waiting ? <span className="teacher-students__waiting"> · {waiting} to bring in</span> : null}
          </span>
        </span>
        <Users size={22} aria-hidden="true" />
      </summary>
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
                <AccountAvatar className="teacher-student__avatar" mark={student.mark} name={student.name} />
                <div className="teacher-student__main">
                  <strong className="teacher-student__name">{student.name}</strong>
                  <span className="teacher-student__email">{student.email}</span>
                  <p className="teacher-student__status">
                    {waitingOn ? (
                      <span aria-hidden="true" className="teacher-student__dot" />
                    ) : (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    )}
                    {statusOf(student, cards)}
                  </p>
                  <p className="teacher-student__next">
                    {student.nextLessonAt ? `Next lesson ${nextLesson(student.nextLessonAt)}` : "No lessons booked"}
                    {student.weekly ? (
                      <span className="teacher-student__weekly">
                        <Repeat size={13} aria-hidden="true" />
                        Weekly
                      </span>
                    ) : null}
                  </p>
                </div>
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
    </details>
  );
}
