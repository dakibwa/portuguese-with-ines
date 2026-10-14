"use client";

import { useState } from "react";
import { CalendarPlus, ChevronRight, UserPlus } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { NeedsYou } from "@/components/teacher/NeedsYou";
import { StudentSetupRow } from "@/components/teacher/StudentSetupRow";
import type { AdminBooking, AdminStudent } from "@/lib/admin-api";
import { formatMoneyCents, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel, type StudentSetupStep, type studentWorkspace } from "@/lib/teacher-calendar";

/** The full profile still offers a link to students who need access or payment setup. */
export function needsHer(student: AdminStudent, cards: boolean) {
  return !student.signedIn || Boolean(cards && student.unpaidUpcoming && !student.cardForAllLessons);
}

function nextLesson(at: string) {
  return `${dateLabel(dateKey(new Date(at)), { weekday: "short", day: "numeric", month: "short" })}, ${formatSlotTime(at)}`;
}

function theirPrice(student: AdminStudent) {
  const own = ([60, 90] as const).filter((minutes) => student.prices?.[minutes] !== undefined);
  if (!own.length) return "";
  return own.map((minutes) => `${minutes} mins · ${formatMoneyCents(student.prices![minutes]!)}`).join(", ");
}

/** One student, one row: setup becomes a regular student row when complete. */
export function StudentList({ token, students, workspace, error, sending, onAddStudent, onOpenStudent, onStudentsChanged, onWelcome, onMeet, onView }: {
  token: string;
  students: AdminStudent[] | null;
  workspace: ReturnType<typeof studentWorkspace>;
  error: string;
  sending: string;
  onAddStudent: () => void;
  onOpenStudent: (student: AdminStudent, addLesson?: boolean) => void;
  onStudentsChanged: () => void;
  onWelcome: (student: AdminStudent, again?: boolean) => void;
  onMeet: () => void;
  onView: (booking: AdminBooking) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<{ studentId: string; step: StudentSetupStep } | null>(null);
  const [busyStudent, setBusyStudent] = useState("");
  const term = query.trim().toLowerCase();
  const shown = workspace.rows.filter(({ student }) => !term || student.name.toLowerCase().includes(term) || student.email.toLowerCase().includes(term));
  const noticeProps = { sending, onMeet, onView, onWelcome, onStudent: onOpenStudent };

  return <section className="teacher-students" aria-labelledby="teacher-students-title">
    <h2 className="visually-hidden" id="teacher-students-title">Students</h2>
    <div className="teacher-students__bar">
      <label className="teacher-students__search">
        <span className="visually-hidden">Find a student</span>
        <input disabled={Boolean(busyStudent)} onChange={event => setQuery(event.target.value)} placeholder="Find a student" type="search" value={query} />
      </label>
      <button className="button button--coral" aria-label="Add a student" disabled={Boolean(busyStudent)} onClick={onAddStudent} type="button">
        <UserPlus size={16} aria-hidden="true" />
        <span className="teacher-students__add-full" aria-hidden="true">Add a student</span>
        <span className="teacher-students__add-short" aria-hidden="true">Add</span>
      </button>
    </div>
    <NeedsYou {...noticeProps} heading="Check first" items={workspace.general} />
    {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
    {!students && !error ? <p role="status">Loading your students…</p> : null}
    {students && !students.length ? <p>No students yet.</p> : students && !shown.length ? <p>No students match.</p> : null}
    {shown.some(row => row.setup || row.items.length) ? <p className="teacher-students__order">Needs attention first</p> : null}
    <ul className="teacher-setup-list teacher-students__unified">
      {shown.map(({ student, setup, items }) => {
        const attention = items.length ? <NeedsYou {...noticeProps} embedded items={items} /> : null;
        if (setup) return <StudentSetupRow
          key={student.id}
          attention={attention}
          onOpenProfile={() => { setExpanded(null); onOpenStudent(student); }}
          locked={Boolean(busyStudent)}
          onBusy={busy => setBusyStudent(busy ? student.id : "")}
          onChanged={onStudentsChanged}
          onSelect={step => setExpanded(step ? { studentId: student.id, step } : null)}
          onWelcome={onWelcome}
          sending={sending}
          setup={setup}
          step={expanded?.studentId === student.id ? expanded.step : null}
          token={token}
        />;
        return <li className="teacher-student teacher-student--row is-ready" key={student.id}>
          <button className="teacher-student__profile" aria-label={`Open ${student.name}’s profile`} onClick={() => onOpenStudent(student)} type="button">
            <AccountAvatar className="teacher-student__avatar" mark={student.mark} name={student.name} />
            <span className="teacher-student__main">
              <strong className="teacher-student__name">{student.name}</strong>
              <span className="teacher-student__label">Student</span>
              <span className="teacher-student__email">{student.email}</span>
            </span>
            <ChevronRight className="teacher-student__open" size={18} aria-hidden="true" />
          </button>
          <ul className="booking-payment-facts teacher-student__facts">
            <li>{student.nextLessonAt ? `Next lesson ${nextLesson(student.nextLessonAt)}` : "No upcoming lesson"}</li>
            {student.weekly ? <li>Weekly lessons</li> : null}
            {theirPrice(student) ? <li>{theirPrice(student)}</li> : null}
            {student.unpaidUpcoming ? <li>{student.unpaidUpcoming === 1 ? "1 lesson" : `${student.unpaidUpcoming} lessons`} paid by hand</li> : null}
          </ul>
          <div className="teacher-student__action">
            <button className="button button--blue button--compact" onClick={() => onOpenStudent(student, true)} type="button">
              <CalendarPlus size={15} aria-hidden="true" />Add a lesson<span className="visually-hidden"> for {student.name}</span>
            </button>
          </div>
          {attention ? <div className="teacher-student__attention">{attention}</div> : null}
        </li>;
      })}
    </ul>
  </section>;
}
