"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, Repeat, Send, Users } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { fetchStudents, sendStudentWelcome, type AdminStudent } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

/** Someone she still needs to bring in comes first: never signed in, or lessons not yet on a card. */
function needsHer(student: AdminStudent) {
  return !student.signedIn || Boolean(student.unpaidUpcoming && !student.cardForAllLessons);
}

/** Where they are, in one plain line. */
function statusOf(student: AdminStudent) {
  const owed = student.unpaidUpcoming && !student.cardForAllLessons
    ? `${student.unpaidUpcoming === 1 ? "1 lesson" : `${student.unpaidUpcoming} lessons`} to collect`
    : "";
  if (!student.signedIn) return ["Not signed in yet", owed].filter(Boolean).join(" · ");
  if (owed) return `No card yet · ${owed}`;
  return student.cardForAllLessons ? "All set: signed in, card saved" : "Signed in";
}

function nextLesson(at: string) {
  return `${dateLabel(dateKey(new Date(at)), { weekday: "short", day: "numeric", month: "short" })}, ${formatSlotTime(at)}`;
}

/**
 * Her students at a glance, for the move onto the site (12 October 2026,
 * Dan): who has signed in, whose lessons a card pays for, and what comes
 * next. Anyone can be sent a fresh one-click way in. Read each time it opens,
 * so it is never older than the last look.
 */
export function StudentList({ token, onAddLesson }: { token: string; onAddLesson?: (student: AdminStudent) => void }) {
  const [students, setStudents] = useState<AdminStudent[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState("");
  const [sent, setSent] = useState<Record<string, string>>({});

  async function load() {
    setError("");
    try {
      setStudents((await fetchStudents(token)).students);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your students couldn’t be loaded.");
    }
  }

  async function welcome(student: AdminStudent) {
    setSending(student.id);
    setError("");
    try {
      const result = await sendStudentWelcome(token, student.id);
      setSent((current) => ({
        ...current,
        [student.id]: result.card ? "Sent: a link to sign in and add a card" : "Sent: a link to sign in",
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The link couldn’t be sent.");
    } finally {
      setSending("");
    }
  }

  const term = query.trim().toLowerCase();
  const shown = (students ?? [])
    .filter((student) => !term || student.name.toLowerCase().includes(term) || student.email.toLowerCase().includes(term))
    .sort((a, b) => Number(needsHer(b)) - Number(needsHer(a)) || a.name.localeCompare(b.name));
  const waiting = (students ?? []).filter(needsHer).length;

  return (
    <details
      className="teacher-students"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>
        <span>
          <span className="teacher-eyebrow">Who&rsquo;s on the site</span>
          <span className="teacher-manual-title">
            Your students
            {students ? <span className="teacher-students__count"> · {students.length}</span> : null}
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
        {students && waiting ? (
          <p className="teacher-students__lead">
            {waiting === 1 ? "1 student still needs" : `${waiting} students still need`} to sign in or add a card.
          </p>
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
            const waiting = needsHer(student);
            return (
              <li className={`teacher-student${waiting ? " needs-her" : " is-ready"}`} key={student.id}>
                <AccountAvatar className="teacher-student__avatar" mark={student.mark} name={student.name} />
                <div className="teacher-student__main">
                  <strong className="teacher-student__name">{student.name}</strong>
                  <span className="teacher-student__email">{student.email}</span>
                  <p className="teacher-student__status">
                    {waiting ? (
                      <span aria-hidden="true" className="teacher-student__dot" />
                    ) : (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    )}
                    {statusOf(student)}
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
                  <button className="teacher-student__button" onClick={() => onAddLesson?.(student)} type="button">
                    <CalendarPlus size={15} aria-hidden="true" />
                    Add lesson
                    <span className="visually-hidden"> for {student.name}</span>
                  </button>
                  {/* Only someone still to bring in needs a way in sent. */}
                  {waiting ? (
                    sent[student.id] ? (
                      <span className="teacher-student__sent" role="status">
                        {sent[student.id]}
                      </span>
                    ) : (
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
                    )
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
