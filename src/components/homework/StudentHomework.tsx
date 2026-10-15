"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { readSession } from "@/lib/auth-api";
import { fetchHomework, fetchHomeworkSheet, saveHomeworkAnswers, type HomeworkProgress, type HomeworkSummary, type StudentHomeworkData } from "@/lib/homework-api";
import { HomeworkWorksheet } from "./HomeworkWorksheet";

export function StudentHomework({ leaveGuard }: { leaveGuard: RefObject<(() => Promise<boolean>) | null> }) {
  const [token] = useState(() => readSession());
  const [list, setList] = useState<HomeworkSummary[] | null>(null);
  const [selected, setSelected] = useState<StudentHomeworkData | null>(null);
  const [draft, setDraft] = useState<HomeworkProgress | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const unsaved = useRef(false);
  const dirty = Boolean(selected && draft && JSON.stringify(draft.answers) !== JSON.stringify(selected.progress.answers));
  // Account navigation waits for a save; a failed save keeps the answers visible.
  useEffect(() => {
    leaveGuard.current = async () => !busy && (!dirty || await save());
    return () => { leaveGuard.current = null; };
  });

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void fetchHomework(token, controller.signal).then(result => {
      if (active.current && readSession() === token) setList(result);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { active.current = false; controller.abort(); };
  }, [token, attempt]);
  useEffect(() => {
    unsaved.current = dirty;
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (unsaved.current) event.preventDefault(); };
    // Next's header links do not unload the document. Save before following one.
    const followLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href);
      if (!/^https?:$/.test(destination.protocol) || (destination.pathname === location.pathname && destination.search === location.search && destination.hash)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void leaveGuard.current?.().then(allowed => { if (allowed) window.location.assign(destination.href); });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty, leaveGuard]);

  async function open(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await fetchHomeworkSheet(token, id);
      if (!active.current || readSession() !== token) return;
      setSelected(result); setDraft(result.progress);
    } catch (error) { if (active.current) setError((error as Error).message); }
    finally { if (active.current) setBusy(false); }
  }
  async function save(completed = Boolean(draft?.completedAt)) {
    if (!selected || !draft || busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const progress = await saveHomeworkAnswers(token, selected.bookingId, draft, completed);
      if (!active.current || readSession() !== token) return false;
      unsaved.current = false;
      setDraft(progress); setSelected({ ...selected, progress });
      setList(current => current?.map(item => item.bookingId === selected.bookingId ? { ...item, started: true, completedAt: progress.completedAt } : item) ?? null);
      setNotice(completed ? "Marked complete. Inês can see your answers." : "Answers saved.");
      return true;
    } catch (error) { if (active.current) setError((error as Error).message); return false; }
    finally { if (active.current) setBusy(false); }
  }

  return <div className="student-homework">
    {selected && draft ? <>
      <div className="homework-toolbar">
        <button type="button" className="text-action" disabled={busy} onClick={async () => {
          if (dirty && !await save()) return;
          setSelected(null); setDraft(null); setError(""); setNotice("");
        }}><ArrowLeft size={17} aria-hidden="true" />All homework</button>
        {draft.completedAt ? <span className="homework-status"><CheckCircle2 size={17} aria-hidden="true" />Completed</span> : <span>{dirty ? "Unsaved answers" : draft.updatedAt ? "Saved" : "Ready to start"}</span>}
      </div>
      {error ? <p className="homework-error" role="alert">{error}</p> : null}
      <HomeworkWorksheet {...selected} answers={draft.answers} disabled={busy} onAnswer={(id, answer) => setDraft({ ...draft, answers: { ...draft.answers, [id]: answer } })} />
      <div className="homework-save">
        <p role="status">{notice || "Save your answers before leaving. You can also complete the sheet on paper."}</p>
        <button type="button" className="button button--outline" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save answers"}</button>
        <button type="button" className={`button ${draft.completedAt ? "button--lilac" : "button--coral"}`} disabled={busy} onClick={() => void save(!draft.completedAt)}>{draft.completedAt ? "Keep practising" : "Mark complete"}</button>
      </div>
    </> : <>
      {error ? <div className="homework-error" role="alert"><p>{error}</p><button className="text-action" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button></div> : null}
      {!list && !error ? <p role="status">Loading homework…</p> : null}
      {list?.length === 0 ? <p>When Inês shares homework, it will appear here with its lesson.</p> : null}
      <ul className="homework-list">{list?.map(item => <li key={item.bookingId}>
        <button type="button" onClick={() => void open(item.bookingId)} disabled={busy}>
          <span><small>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Lisbon" }).format(new Date(item.lessonAt))} · {item.minutes} min</small><strong>{item.title}</strong></span>
          <span className="homework-list__state">{item.completedAt ? "Completed" : item.started ? "Continue" : "Start"}<ArrowRight size={18} aria-hidden="true" /></span>
        </button>
      </li>)}</ul>
    </>}
  </div>;
}
