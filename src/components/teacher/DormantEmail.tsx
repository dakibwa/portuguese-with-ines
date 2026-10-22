"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { fetchDormantEmail, saveDormantEmail, sendDormantEmail, type AdminStudent, type DormantEmailWords } from "@/lib/admin-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

/** The Worker sends each student it at most once a day. */
const DAY_MS = 24 * 3_600_000;
const first = (student: AdminStudent) => student.name.trim().split(/\s+/)[0];
const names = (list: string[]) => list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] ?? "";

/**
 * Her come-back email to dormant students (22 October 2026, Dan: "you haven't
 * had a lesson in a while but here is the new website if you're interested in
 * booking a new one"). Her subject and words, kept for next time, to the
 * students she ticks: one, some or all. Each is its own request, so one that
 * can't be sent never stops the rest.
 */
export function DormantEmail({ token, students, onSent, onClose }: {
  token: string;
  /** Every dormant student, whether or not they can be sent it today. */
  students: AdminStudent[];
  /** Once a round has sent anything, so her list reads afresh. */
  onSent: () => void;
  onClose: () => void;
}) {
  const [words, setWords] = useState<DormantEmailWords | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());
  const sendable = (student: AdminStudent) => Boolean(student.email) &&
    !(student.dormantEmailedAt && now - Date.parse(student.dormantEmailedAt) < DAY_MS);
  const [chosen, setChosen] = useState(() => new Set(students.filter(sendable).map(student => student.id)));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    let current = true;
    fetchDormantEmail(token)
      .then(saved => { if (current) setWords({ subject: saved.subject, message: saved.message }); })
      .catch(caught => { if (current) setLoadError(caught instanceof Error ? caught.message : "Your email couldn’t be loaded."); });
    return () => { current = false; };
  }, [token, attempt]);

  const recipients = students.filter(student => chosen.has(student.id) && sendable(student));
  const ready = Boolean(words?.subject.trim() && words.message.trim());

  async function save() {
    if (!words || !ready || busy) return;
    setBusy("save");
    setNotice("");
    setProblems([]);
    try {
      setWords(await saveDormantEmail(token, words));
      setNotice("Saved for next time.");
    } catch (caught) {
      setProblems([caught instanceof Error ? caught.message : "Your email couldn’t be saved."]);
    } finally {
      setBusy("");
    }
  }

  async function send() {
    if (!words || !ready || busy || !recipients.length) return;
    setBusy("send");
    setNotice("");
    setProblems([]);
    const sent: string[] = [];
    const failed: string[] = [];
    try {
      // What she sends is what is kept for next time.
      const saved = await saveDormantEmail(token, words);
      setWords(saved);
      for (const [index, student] of recipients.entries()) {
        setNotice(`Sending ${index + 1} of ${recipients.length}…`);
        try {
          await sendDormantEmail(token, student.id, saved);
          sent.push(first(student));
          setChosen(current => { const next = new Set(current); next.delete(student.id); return next; });
        } catch (caught) {
          failed.push(`${student.name}: ${caught instanceof Error ? caught.message : "it couldn’t be sent."}`);
        }
      }
    } catch (caught) {
      failed.push(caught instanceof Error ? caught.message : "Your email couldn’t be saved, so nothing was sent.");
    } finally {
      setNotice(sent.length ? `Sent to ${names(sent)}.` : "");
      setProblems(failed);
      setBusy("");
      if (sent.length) onSent();
    }
  }

  const toggle = (id: string) => setChosen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <section className="teacher-dormant-email" aria-labelledby="teacher-dormant-email-title">
    <div className="teacher-dormant-email__heading">
      <h3 id="teacher-dormant-email-title">Email dormant students</h3>
      <button className="teacher-dialog-close" aria-label="Close" disabled={Boolean(busy)} onClick={onClose} type="button"><X size={20} aria-hidden="true" /></button>
    </div>
    <ul className="booking-payment-facts teacher-setup__help">
      <li>It starts “Olá” and their first name, and ends with a button to sign in and book.</li>
      <li>Each student is sent it at most once a day.</li>
    </ul>
    {loadError ? <div className="teacher-inline-error" role="alert"><p>{loadError}</p><button className="teacher-text-button" onClick={() => { setLoadError(""); setAttempt(value => value + 1); }} type="button">Try again</button></div> : null}
    {!words && !loadError ? <p role="status">Loading your email…</p> : null}
    {words ? <form className="teacher-form" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label>
        <span>Subject</span>
        <input disabled={Boolean(busy)} maxLength={150} onChange={event => setWords({ ...words, subject: event.target.value })} type="text" value={words.subject} />
      </label>
      <label>
        <span>Message</span>
        <textarea disabled={Boolean(busy)} maxLength={3000} onChange={event => setWords({ ...words, message: event.target.value })} rows={7} value={words.message} />
      </label>
      <fieldset className="teacher-dormant-email__to">
        <legend>Send to</legend>
        {students.map(student => {
          const can = sendable(student);
          const ticked = can && chosen.has(student.id);
          const why = !student.email ? "no email"
            : student.dormantEmailedAt ? `sent ${dateLabel(dateKey(new Date(student.dormantEmailedAt)), { day: "numeric", month: "short" })}` : "";
          return <button
            aria-checked={ticked}
            className={`paid-tick${ticked ? " is-checked" : ""}`}
            disabled={!can || Boolean(busy)}
            key={student.id}
            onClick={() => toggle(student.id)}
            role="checkbox"
            type="button"
          >
            <span aria-hidden="true" className="paid-tick__dab">{ticked ? <Check size={13} strokeWidth={3.4} /> : null}</span>
            {student.name}{why ? <span className="teacher-dormant-email__why"> · {why}</span> : null}
          </button>;
        })}
      </fieldset>
      <div className="teacher-dialog-actions">
        <button className="button button--lilac button--compact" disabled={!ready || Boolean(busy)} onClick={() => void save()} type="button">{busy === "save" ? "Saving…" : "Save"}</button>
        <button className="button button--coral button--compact" disabled={!ready || !recipients.length || Boolean(busy)} type="submit">
          {busy === "send" ? "Sending…" : !recipients.length ? "Send" : recipients.length === 1 ? `Send to ${first(recipients[0])}` : `Send to ${recipients.length} students`}
        </button>
      </div>
    </form> : null}
    {notice ? <p className="teacher-inline-success" role="status">{busy ? null : <Check size={15} aria-hidden="true" />}{notice}</p> : null}
    {problems.length ? <div className="teacher-inline-error" role="alert">{problems.map(text => <p key={text}>{text}</p>)}</div> : null}
  </section>;
}
