"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchDormantEmail, saveDormantEmail, sendDormantEmail, type AdminStudent, type DormantEmailWords } from "@/lib/admin-api";

/** The Worker sends each student it at most once a day. */
const GAP_MS = 24 * 3_600_000;
export const firstName = (student: AdminStudent) => student.name.trim().split(/\s+/)[0];

/** Her default words, as saved, and a way to try again if they can't be read. */
function useDefaultWords(token: string) {
  const [words, setWords] = useState<DormantEmailWords | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    fetchDormantEmail(token)
      .then(saved => { if (current) setWords({ subject: saved.subject, message: saved.message }); })
      .catch(caught => { if (current) setProblem(caught instanceof Error ? caught.message : "Your email couldn’t be loaded."); });
    return () => { current = false; };
  }, [token, attempt]);
  const retry = () => { setProblem(""); setAttempt(value => value + 1); };
  return { words, setWords, problem, retry };
}

function Loading({ problem, retry }: { problem: string; retry: () => void }) {
  return problem
    ? <div className="teacher-inline-error" role="alert"><p>{problem}</p><button className="teacher-text-button" onClick={retry} type="button">Try again</button></div>
    : <p role="status">Loading your email…</p>;
}

function Fields({ words, disabled, onChange }: { words: DormantEmailWords; disabled: boolean; onChange: (words: DormantEmailWords) => void }) {
  return <>
    <label>
      <span>Subject</span>
      <input disabled={disabled} maxLength={150} onChange={event => onChange({ ...words, subject: event.target.value })} type="text" value={words.subject} />
    </label>
    <label>
      <span>Message</span>
      <textarea disabled={disabled} maxLength={3000} onChange={event => onChange({ ...words, message: event.target.value })} rows={9} value={words.message} />
    </label>
  </>;
}

/**
 * One dormant student's come-back email (22 October 2026, Dan: "can the email
 * be for each individual student but there be the default email already
 * written for each"): her default beneath "Olá" and their first name, theirs
 * to change before she sends it.
 */
export function ComeBackEmail({ token, student, onBusy, onSent }: {
  token: string;
  student: AdminStudent;
  onBusy: (busy: boolean) => void;
  onSent: (student: AdminStudent) => void;
}) {
  const { words, problem: loadProblem, retry } = useDefaultWords(token);
  const [written, setWritten] = useState<DormantEmailWords | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [now] = useState(() => Date.now());
  const sentRecently = Boolean(student.dormantEmailedAt && now - Date.parse(student.dormantEmailedAt) < GAP_MS);
  const email = written ?? (words ? { subject: words.subject, message: `Olá ${firstName(student)},\n\n${words.message}` } : null);
  const ready = Boolean(email?.subject.trim() && email.message.trim());

  async function send() {
    if (!email || !ready || busy || sentRecently) return;
    setBusy(true);
    onBusy(true);
    setProblem("");
    try {
      const { student: updated } = await sendDormantEmail(token, student.id, email);
      onSent(updated);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "It couldn’t be sent. Please try again.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  if (!email) return <Loading problem={loadProblem} retry={retry} />;
  return <form className="teacher-form teacher-come-back" onSubmit={event => { event.preventDefault(); void send(); }}>
    <Fields disabled={busy || sentRecently} onChange={setWritten} words={email} />
    {problem ? <p className="teacher-inline-error" role="alert">{problem}</p> : null}
    {sentRecently ? <p className="teacher-come-back__wait">Each student gets it at most once a day, so this can go again 24 hours after the last one.</p> : null}
    <div className="teacher-dialog-actions">
      {written ? <button className="button button--outline button--compact" disabled={busy} onClick={() => setWritten(null)} type="button">Start again</button> : null}
      <button className="button button--coral button--compact" disabled={!ready || busy || sentRecently} type="submit">
        {busy ? "Sending…" : `Send to ${firstName(student)}`}
      </button>
    </div>
  </form>;
}

/** The words every dormant student's email starts from, hers to change. */
export function DefaultComeBackEmail({ token, onSaved, onClose }: {
  token: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { words, setWords, problem: loadProblem, retry } = useDefaultWords(token);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const ready = Boolean(words?.subject.trim() && words.message.trim());

  async function save() {
    if (!words || !ready || busy) return;
    setBusy(true);
    setProblem("");
    try {
      await saveDormantEmail(token, words);
      onSaved();
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "Your email couldn’t be saved.");
      setBusy(false);
    }
  }

  return <section className="teacher-come-back-default" aria-labelledby="teacher-come-back-default-title">
    <h3 id="teacher-come-back-default-title">Default come-back email</h3>
    <button className="teacher-dialog-close" aria-label="Close" disabled={busy} onClick={onClose} type="button"><X size={20} aria-hidden="true" /></button>
    <ul className="booking-payment-facts teacher-setup__help">
      <li>Each dormant student’s email starts “Olá” and their first name, then this.</li>
      <li>You can still change anyone’s before you send it.</li>
    </ul>
    {words ? <form className="teacher-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <Fields disabled={busy} onChange={setWords} words={words} />
      {problem ? <p className="teacher-inline-error" role="alert">{problem}</p> : null}
      <div className="teacher-dialog-actions">
        <button className="button button--outline button--compact" disabled={busy} onClick={onClose} type="button">Cancel</button>
        <button className="button button--coral button--compact" disabled={!ready || busy} type="submit">{busy ? "Saving…" : "Save default"}</button>
      </div>
    </form> : <Loading problem={loadProblem} retry={retry} />}
  </section>;
}
