"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Mail, UserPlus } from "lucide-react";
import { DefaultComeBackEmail } from "@/components/teacher/DormantEmail";
import { NeedsYou } from "@/components/teacher/NeedsYou";
import { StudentSetupRow, type StudentRowSelection } from "@/components/teacher/StudentSetupRow";
import type { AdminStudent } from "@/lib/admin-api";
import type { StudentSection, StudentWorkspaceRow, studentWorkspace } from "@/lib/teacher-calendar";

export type StudentOpenRequest = StudentRowSelection & { key: number };

type Group = StudentSection | "dormant";

/** Each group's heading and its one line of what it means. */
const GROUPS: { key: Exclude<Group, "dormant">; title: string; hint?: string }[] = [
  { key: "needs", title: "Needs you" },
  { key: "todo", title: "To do", hint: "Send each their link." },
  { key: "waiting", title: "Waiting on them", hint: "Link sent. They haven’t finished yet." },
  { key: "set", title: "All set", hint: "Fully set up and paying for their own lessons." },
];

/**
 * Her students as lanes of cards, left to right, and the dormant (2 November
 * 2026, Dan: get everyone signed in, paying what is open and booking their
 * own): what needs her, her next move, theirs, and the students already all
 * set, with how many are all set above them. A lane reads how far its
 * students have got, so cards are never dragged between them. One student,
 * one card, in one lane; the one she opens is that card taken out of its lane
 * and shown once, across the whole width, above the board.
 */
export function StudentList({ token, students, workspace, error, sending, request, onAddStudent, onStudentsChanged, onWelcome, onMeet, onDismiss, onRetry }: {
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
  onDismiss: (key: string) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<StudentRowSelection | null>(null);
  const [busyStudent, setBusyStudent] = useState("");
  const [editingDefault, setEditingDefault] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  // Any come-back email open and untouched follows a default she saves.
  const [defaultVersion, setDefaultVersion] = useState(0);
  // What was just done to each student, kept here because a card that closes
  // goes back to its lane as a new one.
  const [notices, setNotices] = useState<Record<string, string>>({});
  // Whose name takes focus once their card is back in its lane.
  const focusBack = useRef("");
  const search = useRef<HTMLInputElement>(null);
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
  // The open card is shown once, above the board, wherever search is; its
  // lane still counts it, in whichever lane the student is in now.
  const openGroup = openId ? groupOf(openId) : undefined;
  const openRow = openGroup ? grouped[openGroup].find(row => row.student.id === openId) : undefined;
  const shown = Object.fromEntries((Object.keys(grouped) as Group[]).map(group =>
    [group, grouped[group].filter(row => row !== openRow && matches(row))])) as Record<Group, StudentWorkspaceRow[]>;
  const countOf = (group: Group) => shown[group].length + (openRow && openGroup === group ? 1 : 0);
  const anyShown = Boolean(openRow) || Object.values(shown).some(rows => rows.length);
  // Everyone dormant counts, even one whose card is up top for now.
  const dormantCount = (students ?? []).filter(student => student.dormant).length;
  const lanes = GROUPS.filter(({ key }) => countOf(key)).length + (dormantCount ? 1 : 0);
  // Closed, a card returns to its lane; its name is where focus lands.
  useEffect(() => {
    if (expanded || busyStudent || !focusBack.current) return;
    const id = focusBack.current;
    focusBack.current = "";
    const name = Array.from(document.querySelectorAll<HTMLElement>("[data-student-id]")).find(card => card.dataset.studentId === id)
      ?.querySelector<HTMLElement>(".teacher-setup__profile");
    // A renamed student the search no longer matches leaves focus on the search.
    (name ?? search.current)?.focus({ preventScroll: true });
  }, [expanded, busyStudent]);
  const noticeProps = {
    sending, onMeet, onWelcome, onDismiss,
    onStudent: (student: AdminStudent) => {
      if (!busyStudent) setExpanded({ studentId: student.id, panel: "lessons" });
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
      notice={notices[student.id] ?? ""}
      onNotice={message => setNotices(current => current[student.id] === message || (!message && !current[student.id]) ? current : { ...current, [student.id]: message })}
      onSelect={panel => {
        if (!panel) focusBack.current = student.id;
        setExpanded(panel ? { ...selected, studentId: student.id, panel, homeworkId: undefined } : null);
      }}
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
    {/* Open, one student is the whole screen: the board and its toolbar wait
        (search is kept) and the card's Close brings them back. All students
        said the same on a row of its own, so it went (10 November 2026). */}
    {openRow ? null : <>
      <div className="teacher-students__bar">
        <label className="teacher-students__search">
          <span className="visually-hidden">Find a student</span>
          <input data-homework-exit disabled={Boolean(busyStudent)} onChange={event => setQuery(event.target.value)} placeholder="Find a student" ref={search} type="search" value={query} />
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
    </>}
    {error ? <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" onClick={onRetry} type="button">Try again</button></div> : null}
    {!students && !error ? <p role="status">Loading your students…</p> : null}
    {students && !students.length ? <p>No students yet. Press Add a student to set up your first.</p> : students && !anyShown ? <p role="status">No students match “{query.trim()}”.</p> : null}
    {/* The open student, once, across the whole width: never squeezed into a lane. */}
    {openRow ? <>
      <ul className="teacher-students__open" aria-label="Open student">{row(openRow)}</ul>
    </> : null}
    {/* Keep the hidden board mounted so a default come-back email draft survives. */}
    {lanes ? <div className="teacher-board" hidden={Boolean(openRow)} style={{ "--lanes": lanes } as CSSProperties}>
      {GROUPS.map(({ key, title, hint }) => countOf(key) ? <section className="teacher-lane" aria-labelledby={`teacher-group-${key}`} key={key}>
        <div className="teacher-lane__bar">
          <h3 className="teacher-eyebrow" id={`teacher-group-${key}`}>{title} · {countOf(key)}</h3>
          {hint ? <p>{hint}</p> : null}
        </div>
        <ul className="teacher-lane__cards">
          {shown[key].map(row)}
        </ul>
      </section> : null)}
      {dormantCount ? <section className="teacher-lane teacher-dormant" aria-labelledby="teacher-dormant-title">
        <div className="teacher-lane__bar teacher-dormant__bar">
          <h3 className="teacher-eyebrow" id="teacher-dormant-title">Dormant · {dormantCount}</h3>
          {!editingDefault ? <button className="button button--lilac button--compact" disabled={Boolean(busyStudent)} onClick={() => { setDefaultSaved(false); setEditingDefault(true); }} type="button">
            <Mail size={15} aria-hidden="true" />Default come-back email
          </button> : null}
        </div>
        {editingDefault ? <DefaultComeBackEmail token={token} onSaved={() => { setEditingDefault(false); setDefaultSaved(true); setDefaultVersion(value => value + 1); }} onClose={() => setEditingDefault(false)} /> : null}
        {defaultSaved ? <p className="teacher-inline-success" role="status"><Check size={15} aria-hidden="true" />Saved. Each come-back email now starts from it.</p> : null}
        {countOf("dormant") ? <ul className="teacher-lane__cards">
          {shown.dormant.map(row)}
        </ul> : null}
      </section> : null}
    </div> : null}
  </section>;
}
