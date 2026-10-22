"use client";

import { useEffect, useState } from "react";
import { Mail, UserPlus } from "lucide-react";
import { DormantEmail } from "@/components/teacher/DormantEmail";
import { NeedsYou } from "@/components/teacher/NeedsYou";
import { StudentSetupRow, type StudentRowSelection } from "@/components/teacher/StudentSetupRow";
import type { AdminBooking, AdminStudent } from "@/lib/admin-api";
import type { StudentWorkspaceRow, studentWorkspace } from "@/lib/teacher-calendar";

export type StudentOpenRequest = StudentRowSelection & { key: number };

/** One student, one row: setup becomes their regular profile when complete. */
export function StudentList({ token, students, workspace, error, sending, request, onAddStudent, onStudentsChanged, onWelcome, onMeet, onView, onRetry }: {
  token: string;
  students: AdminStudent[] | null;
  workspace: ReturnType<typeof studentWorkspace>;
  error: string;
  sending: string;
  request: StudentOpenRequest | null;
  onAddStudent: () => void;
  onStudentsChanged: (student?: AdminStudent) => void;
  onWelcome: (student: AdminStudent, again?: boolean) => void;
  onMeet: () => void;
  onView: (booking: AdminBooking) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<StudentRowSelection | null>(null);
  const [busyStudent, setBusyStudent] = useState("");
  const [emailing, setEmailing] = useState(false);
  useEffect(() => {
    if (!request) return;
    setQuery("");
    setExpanded(request);
  }, [request]);
  const term = query.trim().toLowerCase();
  const matches = ({ student }: StudentWorkspaceRow) => !term || student.name.toLowerCase().includes(term) || student.email.toLowerCase().includes(term);
  const shown = workspace.rows.filter(matches);
  const resting = workspace.dormant.filter(matches);
  // Everyone dormant can be sent her email, even one whose row is up top for now.
  const dormant = (students ?? []).filter(student => student.dormant);
  const noticeProps = {
    sending, onMeet, onView, onWelcome,
    onStudent: (student: AdminStudent, editDetails?: boolean) => {
      if (!busyStudent) setExpanded({ studentId: student.id, panel: editDetails ? "details" : "lessons" });
    },
  };

  const row = ({ student, setup, items }: StudentWorkspaceRow) => {
    const selected = expanded?.studentId === student.id ? expanded : null;
    return <StudentSetupRow
      key={student.id}
      attention={items.length ? <NeedsYou {...noticeProps} embedded items={items} /> : null}
      locked={Boolean(busyStudent)}
      onBusy={busy => setBusyStudent(busy ? student.id : "")}
      onChanged={onStudentsChanged}
      onSelect={panel => setExpanded(panel ? { ...selected, studentId: student.id, panel, homeworkId: undefined } : null)}
      onHomework={homeworkId => setExpanded(current => ({ studentId: student.id, panel: "history", homeworkId, homeworkRequestKey: (current?.homeworkRequestKey ?? 0) + 1 }))}
      onWelcome={onWelcome}
      sending={sending}
      student={student}
      setup={setup ?? null}
      step={selected?.panel ?? null}
      date={selected?.date}
      time={selected?.time}
      homeworkId={selected?.homeworkId}
      homeworkRequestKey={selected?.homeworkRequestKey}
      token={token}
    />;
  };

  return <section className="teacher-students" aria-labelledby="teacher-students-title">
    <h2 className="visually-hidden" id="teacher-students-title">Students</h2>
    <div className="teacher-students__bar">
      <label className="teacher-students__search">
        <span className="visually-hidden">Find a student</span>
        <input data-homework-exit disabled={Boolean(busyStudent)} onChange={event => setQuery(event.target.value)} placeholder="Find a student" type="search" value={query} />
      </label>
      <button className="button button--coral" aria-label="Add a student" disabled={Boolean(busyStudent)} onClick={onAddStudent} type="button">
        <UserPlus size={16} aria-hidden="true" />
        <span className="teacher-students__add-full" aria-hidden="true">Add a student</span>
        <span className="teacher-students__add-short" aria-hidden="true">Add</span>
      </button>
    </div>
    <NeedsYou {...noticeProps} heading="Check first" items={workspace.general} />
    {error ? <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="teacher-text-button" onClick={onRetry} type="button">Try again</button></div> : null}
    {!students && !error ? <p role="status">Loading your students…</p> : null}
    {students && !students.length ? <p>No students yet.</p> : students && !shown.length && !resting.length ? <p>No students match.</p> : null}
    <ul className="teacher-setup-list teacher-students__unified">{shown.map(row)}</ul>
    {dormant.length ? <section className="teacher-dormant" aria-labelledby="teacher-dormant-title">
      <div className="teacher-dormant__bar">
        <h3 className="teacher-eyebrow" id="teacher-dormant-title">Dormant · {dormant.length}</h3>
        {!emailing ? <button className="button button--lilac button--compact" disabled={Boolean(busyStudent)} onClick={() => setEmailing(true)} type="button">
          <Mail size={15} aria-hidden="true" />Email dormant students
        </button> : null}
      </div>
      {emailing ? <DormantEmail token={token} students={dormant} onSent={() => onStudentsChanged()} onClose={() => setEmailing(false)} /> : null}
      {resting.length ? <ul className="teacher-setup-list teacher-students__unified">{resting.map(row)}</ul> : null}
    </section> : null}
  </section>;
}
