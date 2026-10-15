"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Send } from "lucide-react";
import { readSession } from "@/lib/auth-api";
import { fetchHomework, fetchHomeworkSheet, saveHomeworkAnswers, type HomeworkProgress, type HomeworkSummary, type StudentHomeworkData } from "@/lib/homework-api";
import { HomeworkSplat } from "./HomeworkArt";
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
  const [view, setView] = useState<"online" | "print">("online");
  const active = useRef(true);
  const unsaved = useRef(false);
  const dirty = Boolean(selected && draft && JSON.stringify(draft.answers) !== JSON.stringify(selected.progress.answers));
  const submission = draft?.submission;
  const awaitingReview = Boolean(submission && !submission.returnedAt);
  const answered = Object.values(draft?.answers ?? {}).filter(answer => answer.trim()).length;
  const changedSinceSubmission = Boolean(draft && submission && Object.entries(draft.answers).some(([id, answer]) => answer !== (submission.answers[id] ?? "")));
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
  async function save(submit = false) {
    if (!selected || !draft || busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const progress = await saveHomeworkAnswers(token, selected.bookingId, draft, submit);
      if (!active.current || readSession() !== token) return false;
      unsaved.current = false;
      setDraft(progress); setSelected({ ...selected, progress });
      setList(current => current?.map(item => item.bookingId === selected.bookingId ? { ...item, started: true, completedAt: progress.completedAt,
        submittedAt: progress.submission?.submittedAt ?? null, returnedAt: progress.submission?.returnedAt ?? null } : item) ?? null);
      setNotice(submit ? "Sent to Inês. Your feedback appears here after she approves it." : "Answers saved.");
      return true;
    } catch (error) { if (active.current) setError((error as Error).message); return false; }
    finally { if (active.current) setBusy(false); }
  }

  return <div className="student-homework">
    {selected && draft ? <>
      <div className="homework-toolbar">
        <button type="button" className="homework-back" disabled={busy} onClick={async () => {
          if (dirty && !await save()) return;
          setSelected(null); setDraft(null); setError(""); setNotice(""); setView("online");
        }}><ArrowLeft size={16} aria-hidden="true" />All homework</button>
        {submission ? <span className={`homework-status homework-status--${awaitingReview ? "sent" : "returned"}`}>
          {awaitingReview ? <Send size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}{awaitingReview ? "Sent to Inês" : "Feedback from Inês"}
        </span> : <span className="homework-status homework-status--quiet">{dirty ? "Unsaved answers" : draft.updatedAt ? "Saved" : "Ready to start"}</span>}
      </div>
      {error ? <p className="homework-error" role="alert">{error}</p> : null}
      <HomeworkWorksheet key={selected.bookingId} {...selected} answers={draft.answers} disabled={busy || awaitingReview}
        marks={submission?.returnedAt ? submission.marks : undefined} markedAnswers={submission?.answers} onViewChange={setView}
        onAnswer={(id, answer) => setDraft({ ...draft, answers: { ...draft.answers, [id]: answer } })} />
      {view === "online" ? <div className="homework-save">
        <p role="status">{busy ? "Saving your work and preparing it for Inês…" : notice || (awaitingReview
          ? "Inês is checking your work. Your answers are saved."
          : submission?.returnedAt ? "Read Inês’s feedback under each answer. You can change your answers and send them again."
          : selected.aiMarking ? "Inês checks your answers before you see any feedback. OpenAI suggests marks for written answers, so keep personal details out."
          : "Inês checks your answers and sends you feedback here.")}</p>
        <div className="homework-save__actions">
          {awaitingReview ? <button type="button" className="button button--outline" disabled={busy} onClick={() => void open(selected.bookingId)}>Check for feedback</button> : <>
            <button type="button" className="button button--outline" disabled={busy || !dirty} onClick={() => void save()}>Save answers</button>
            <button type="button" className="button button--coral" disabled={busy || !answered || Boolean(submission && !changedSinceSubmission)} onClick={() => void save(true)}>{busy ? "Sending…" : submission ? "Send again" : "Submit to Inês"}</button>
          </>}
        </div>
      </div> : <p className="homework-help homework-help--paper">Paper answers aren’t marked automatically. To send them to Inês, type them in Do online.</p>}
    </> : <>
      {error ? <div className="homework-error" role="alert"><p>{error}</p><button className="button button--outline" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button></div> : null}
      {!list && !error ? <p className="homework-loading" role="status">Loading homework…</p> : null}
      {list?.length === 0 ? <p className="homework-empty"><HomeworkSplat seed="homework" className="homework-empty__mark" />When Inês shares homework, it will appear here with its lesson.</p> : null}
      {list?.length ? <ul className="homework-list">{list.map(item => {
        const state = item.returnedAt ? "returned" : item.submittedAt ? "sent" : item.started ? "started" : "new";
        return <li key={item.bookingId}>
          <button type="button" className={`homework-list__item homework-list__item--${state}`} onClick={() => void open(item.bookingId)} disabled={busy}>
            <HomeworkSplat seed={item.bookingId} className="homework-list__mark" />
            <span className="homework-list__text">
              <small>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Lisbon" }).format(new Date(item.lessonAt))} lesson · {item.minutes} mins</small>
              <strong lang="pt-PT">{item.title}</strong>
            </span>
            <span className="homework-list__state">
              {state === "returned" ? <CheckCircle2 size={15} aria-hidden="true" /> : state === "sent" ? <Send size={14} aria-hidden="true" /> : null}
              {state === "returned" ? "Feedback ready" : state === "sent" ? "With Inês" : state === "started" ? "Continue" : "Start"}
              {state === "new" || state === "started" ? <ArrowRight size={16} aria-hidden="true" /> : null}
            </span>
          </button>
        </li>;
      })}</ul> : null}
    </>}
  </div>;
}
