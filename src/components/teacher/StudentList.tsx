"use client";

import { useEffect, useState } from "react";
import { Check, Mail, UserPlus } from "lucide-react";
import { DefaultComeBackEmail } from "@/components/teacher/DormantEmail";
import { useMasonry } from "@/components/teacher/masonry";
import { NeedsYou } from "@/components/teacher/NeedsYou";
import { StudentSetupRow, type StudentRowSelection } from "@/components/teacher/StudentSetupRow";
import type { AdminBooking, AdminStudent } from "@/lib/admin-api";
import type { StudentSection, StudentWorkspaceRow, studentWorkspace } from "@/lib/teacher-calendar";

export type StudentOpenRequest = StudentRowSelection & { key: number };

type Group = StudentSection | "dormant";

/** Each group's heading and its one line of what it means. */
const GROUPS: { key: Exclude<Group, "dormant">; title: string; hint?: string }[] = [
  { key: "needs", title: "Needs you" },
  { key: "todo", title: "To do", hint: "Send each their link." },
  { key: "waiting", title: "Waiting on them", hint: "Link sent. They haven’t finished yet." },
  { key: "set", title: "All set", hint: "Signed in, card saved, nothing open." },
];

/**
 * Her students in four groups and the dormant (2 November 2026, Dan: get
 * everyone signed in, paying what is open and booking their own): what needs
 * her, her next move, theirs, and the students already all set, with how many
 * are all set above them. One student, one card, in one group.
 */
export function StudentList({ token, students, workspace, error, sending, request, onAddStudent, onStudentsChanged, onWelcome, onMeet, onView, onRetry }: {
  token: string;
  students: AdminStudent[] | null;
  workspace: ReturnType<typeof studentWorkspace>;
  error: string;
  sending: string;
  request: StudentOpenRequest | null;
  onAddStudent: () => void;
  onStudentsChanged: (student?: AdminStudent) => void;
  /** Resolves true once their email has gone. */
  onWelcome: (student: AdminStudent, again?: boolean) => Promise<boolean> | void;
  onMeet: () => void;
  onView: (booking: AdminBooking) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const needsList = useMasonry();
  const todoList = useMasonry();
  const waitingList = useMasonry();
  const setList = useMasonry();
  const dormantList = useMasonry();
  const [expanded, setExpanded] = useState<StudentRowSelection | null>(null);
  const [busyStudent, setBusyStudent] = useState("");
  const [editingDefault, setEditingDefault] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  // Any come-back email open and untouched follows a default she saves.
  const [defaultVersion, setDefaultVersion] = useState(0);
  // The card she opened stays where it was until she opens another, so
  // ticking a lesson paid or sending their link never moves it out from
  // under her; it joins its new group with her next card.
  const [pinned, setPinned] = useState<{ studentId: string; group: Group; index: number } | null>(null);
  useEffect(() => {
    if (!request) return;
    setQuery("");
    setExpanded(request);
  }, [request]);
  const term = query.trim().toLowerCase();
  const matches = ({ student }: StudentWorkspaceRow) => !term || student.name.toLowerCase().includes(term) || student.email.toLowerCase().includes(term);
  const grouped: Record<Group, StudentWorkspaceRow[]> = { ...workspace.sections, dormant: workspace.dormant };
  const groupOf = (studentId: string) => (Object.keys(grouped) as Group[]).find(group => grouped[group].some(row => row.student.id === studentId));
  const openId = expanded?.studentId ?? "";
  useEffect(() => {
    if (!openId) return;
    const group = groupOf(openId);
    setPinned(current => !group ? null : current?.studentId === openId ? current
      : { studentId: openId, group, index: grouped[group].findIndex(row => row.student.id === openId) });
    // Only a newly opened card is pinned, where it was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  const movedFrom = pinned ? groupOf(pinned.studentId) : undefined;
  const held = pinned && movedFrom && movedFrom !== pinned.group ? grouped[movedFrom].find(row => row.student.id === pinned.studentId) : undefined;
  const shown = Object.fromEntries((Object.keys(grouped) as Group[]).map(group => {
    let rows = grouped[group];
    if (held && group === movedFrom) rows = rows.filter(row => row !== held);
    if (held && group === pinned?.group) rows = [...rows.slice(0, pinned.index), held, ...rows.slice(pinned.index)];
    return [group, rows.filter(matches)];
  })) as Record<Group, StudentWorkspaceRow[]>;
  const anyShown = Object.values(shown).some(rows => rows.length);
  // Everyone dormant counts, even one whose card is up top for now.
  const dormantCount = (students ?? []).filter(student => student.dormant).length;
  const noticeProps = {
    sending, onMeet, onView, onWelcome,
    onStudent: (student: AdminStudent, editDetails?: boolean) => {
      if (!busyStudent) setExpanded({ studentId: student.id, panel: editDetails ? "details" : "lessons" });
    },
  };

  const row = ({ student, progress, items }: StudentWorkspaceRow) => {
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
      progress={progress}
      step={selected?.panel ?? null}
      date={selected?.date}
      time={selected?.time}
      homeworkId={selected?.homeworkId}
      homeworkRequestKey={selected?.homeworkRequestKey}
      comeBackDefaultVersion={defaultVersion}
      token={token}
    />;
  };
  const { done, total } = workspace.allSet;

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
    {students?.length && total ? <div className="teacher-students__progress">
      <p><strong>{done} of {total}</strong> {total === 1 ? "student is" : "students are"} all set</p>
      <span className="teacher-students__meter" aria-hidden="true"><i style={{ width: `${Math.round(done / total * 100)}%` }} /></span>
    </div> : null}
    <NeedsYou {...noticeProps} heading="Check first" items={workspace.general} />
    {error ? <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" onClick={onRetry} type="button">Try again</button></div> : null}
    {!students && !error ? <p role="status">Loading your students…</p> : null}
    {students && !students.length ? <p>No students yet. Press Add a student to set up your first.</p> : students && !anyShown ? <p role="status">No students match “{query.trim()}”.</p> : null}
    {GROUPS.map(({ key, title, hint }) => shown[key].length ? <section className="teacher-student-group" aria-labelledby={`teacher-group-${key}`} key={key}>
      <div className="teacher-student-group__bar">
        <h3 className="teacher-eyebrow" id={`teacher-group-${key}`}>{title} · {shown[key].length}</h3>
        {hint ? <p>{hint}</p> : null}
      </div>
      <ul className="teacher-setup-list teacher-students__unified" ref={key === "needs" ? needsList : key === "todo" ? todoList : key === "waiting" ? waitingList : setList}>{shown[key].map(row)}</ul>
    </section> : null)}
    {dormantCount ? <section className="teacher-dormant" aria-labelledby="teacher-dormant-title">
      <div className="teacher-dormant__bar">
        <h3 className="teacher-eyebrow" id="teacher-dormant-title">Dormant · {dormantCount}</h3>
        {!editingDefault ? <button className="button button--lilac button--compact" disabled={Boolean(busyStudent)} onClick={() => { setDefaultSaved(false); setEditingDefault(true); }} type="button">
          <Mail size={15} aria-hidden="true" />Default come-back email
        </button> : null}
      </div>
      {editingDefault ? <DefaultComeBackEmail token={token} onSaved={() => { setEditingDefault(false); setDefaultSaved(true); setDefaultVersion(value => value + 1); }} onClose={() => setEditingDefault(false)} /> : null}
      {defaultSaved ? <p className="teacher-inline-success" role="status"><Check size={15} aria-hidden="true" />Saved. Each come-back email now starts from it.</p> : null}
      {shown.dormant.length ? <ul className="teacher-setup-list teacher-students__unified" ref={dormantList}>{shown.dormant.map(row)}</ul> : null}
    </section> : null}
  </section>;
}
