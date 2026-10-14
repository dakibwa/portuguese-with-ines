"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, ChevronRight, Send, UserPlus } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { sendStudentWelcome, type AdminStudent } from "@/lib/admin-api";
import { formatMoneyCents, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { StudentHistory } from "@/components/teacher/StudentHistory";

/**
 * Someone she still needs to bring in comes first: never signed in, or (where
 * the site takes cards) lessons she added that no card pays for yet.
 */
export function needsHer(student: AdminStudent, cards: boolean) {
  return !student.signedIn || Boolean(cards && student.unpaidUpcoming && !student.cardForAllLessons);
}

/** Where they are, in one plain line. */
function statusOf(student: AdminStudent, cards: boolean) {
  const byHand = cards && student.unpaidUpcoming && !student.cardForAllLessons
    ? `${student.unpaidUpcoming === 1 ? "1 lesson" : `${student.unpaidUpcoming} lessons`} paid by hand`
    : "";
  if (!student.email) return "Set up, no email yet";
  if (student.awaitingWelcome) return "Set up, not emailed yet";
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
 * after every lesson she adds, so an open list is never stale.
 */
/**
 * Her own price for them, when she has set one, read as every length choice
 * reads: "Their price: 60 mins · €20".
 */
function theirPrice(student: AdminStudent) {
  const own = ([60, 90] as const).filter((minutes) => student.prices?.[minutes] !== undefined);
  if (!own.length) return "";
  return `Their price: ${own.map((minutes) => `${minutes} mins · ${formatMoneyCents(student.prices![minutes]!)}`).join(", ")}`;
}

export function StudentList({
  token,
  students,
  cards,
  error,
  onAddStudent,
  onAddLesson,
  onStudentsChanged,
}: {
  token: string;
  students: AdminStudent[] | null;
  /** Whether the site takes cards just now; without them nobody is asked for one. */
  cards: boolean;
  error: string;
  onAddStudent: () => void;
  onAddLesson: (student: AdminStudent) => void;
  /** After a student is added or welcomed, so her list reads afresh. */
  onStudentsChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminStudent | null>(null);
  const [sending, setSending] = useState("");
  // Each answer stays on its own student's card, where she pressed.
  const [sent, setSent] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function welcome(student: AdminStudent) {
    setSending(student.id);
    try {
      await sendStudentWelcome(token, student.id);
      setSent((current) => ({
        ...current,
        // One email for everyone: their lessons and the way in (13 October 2026, Dan).
        [student.id]: { ok: true, message: "Welcome sent" },
      }));
      if (student.awaitingWelcome) onStudentsChanged();
    } catch (caught) {
      setSent((current) => ({
        ...current,
        [student.id]: { ok: false, message: caught instanceof Error ? caught.message : "The welcome couldn’t be sent." },
      }));
    } finally {
      setSending("");
    }
  }

  const term = query.trim().toLowerCase();
  const shown = (students ?? [])
    .filter((student) => !term || student.name.toLowerCase().includes(term) || student.email.toLowerCase().includes(term))
    .sort((a, b) => Number(needsHer(b, cards)) - Number(needsHer(a, cards)) || a.name.localeCompare(b.name));

  return (
    <section className="teacher-students" aria-labelledby="teacher-students-title">
      <h2 className="visually-hidden" id="teacher-students-title">Students</h2>
      <div className="teacher-students__bar">
        <button className="button button--coral" onClick={onAddStudent} type="button">
          <UserPlus size={16} aria-hidden="true" />
          Add a student
        </button>
      </div>
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
          <p className="teacher-students__lead">No students yet.</p>
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
                    <span className="teacher-student__email">{student.email || "No email yet"}</span>
                  </span>
                  <ChevronRight className="teacher-student__open" size={18} aria-hidden="true" />
                </button>
                {/* Where they are, as dabs rather than lines of text (13 October 2026, Dan). */}
                <ul className={`booking-payment-facts teacher-student__facts${waitingOn ? " needs-her" : ""}`}>
                  <li className="teacher-student__status">{statusOf(student, cards)}</li>
                  <li>{student.nextLessonAt ? `Next lesson ${nextLesson(student.nextLessonAt)}` : "No lessons yet"}</li>
                  {student.weekly ? <li>Weekly lessons</li> : null}
                  {theirPrice(student) ? <li>{theirPrice(student)}</li> : null}
                </ul>
                <div className="teacher-student__action">
                  <button className="button button--blue button--compact" onClick={() => onAddLesson(student)} type="button">
                    <CalendarPlus size={15} aria-hidden="true" />
                    Add lesson
                    <span className="visually-hidden"> for {student.name}</span>
                  </button>
                  {/* Only someone still to bring in needs a way in sent, and only to an address. */}
                  {waitingOn && student.email && !answer?.ok ? (
                    <button
                      className="button button--coral button--compact"
                      disabled={sending === student.id}
                      onClick={() => void welcome(student)}
                      type="button"
                    >
                      <Send size={15} aria-hidden="true" />
                      {sending === student.id ? "Sending…" : "Send welcome email"}
                      <span className="visually-hidden"> to {student.name}</span>
                    </button>
                  ) : null}
                  {answer ? (
                    <span className={answer.ok ? "teacher-student__sent" : "teacher-student__failed"} role={answer.ok ? "status" : "alert"}>
                      {answer.ok ? <CheckCircle2 size={15} aria-hidden="true" /> : null}
                      {answer.message}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {selected ? (
        <StudentHistory
          key={`${token}:${selected.id}`}
          student={selected}
          token={token}
          onChanged={(updated) => { setSelected(updated); onStudentsChanged(); }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}
