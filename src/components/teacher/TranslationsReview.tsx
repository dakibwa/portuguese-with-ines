"use client";

import { useEffect, useRef, useState } from "react";
import { fetchTranslationsToReview, reviewTranslation, type AdminTranslation, type TranslationStatus } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";

const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Students' translations waiting for Inês. Nothing a student writes is shown
 * until she approves it; each action reloads the list rather than guessing.
 */
export function TranslationsReview({ token, initialPending }: { token: string; initialPending: number }) {
  const [status, setStatus] = useState<TranslationStatus>("pending");
  const [rows, setRows] = useState<AdminTranslation[] | null>(null);
  const [pendingCount, setPendingCount] = useState(initialPending);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    let current = true;
    setRows(null);
    fetchTranslationsToReview(token, status).then((data) => {
      if (!current || readSession() !== token) return;
      setRows(data.translations);
      setPendingCount(data.pendingCount);
    }).catch((caught) => {
      if (current && readSession() === token) setError(caught instanceof Error ? caught.message : "The translations couldn’t be loaded.");
    });
    return () => { current = false; };
  }, [token, status, attempt]);

  async function act(row: AdminTranslation, action: "approve" | "reject" | "delete") {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await reviewTranslation(token, row.id, action);
      if (readSession() !== token) return;
      setNotice(action === "approve" ? "Approved. Everyone reading it can now see this translation." : action === "reject" ? "Rejected. It won’t be shown." : "Translation deleted.");
      setAttempt((value) => value + 1);
    } catch (caught) {
      if (readSession() === token) setError(caught instanceof Error ? caught.message : "That didn’t work. Please try again.");
    } finally { pending.current = false; setBusy(false); }
  }

  return (
    <section className="teacher-translations" aria-labelledby="teacher-translations-title">
      <div className="teacher-translations__head">
        <h2 id="teacher-translations-title">
          Translations to check
          {pendingCount ? <span className="teacher-translations__count" aria-label={`${pendingCount} waiting`}>{pendingCount}</span> : null}
        </h2>
        <div className="teacher-form teacher-translations__filter"><label><span>Show</span>
          <select value={status} onChange={(event) => { setError(""); setNotice(""); setStatus(event.target.value as TranslationStatus); }}>
            <option value="pending">Waiting for you</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label></div>
      </div>
      <p className="teacher-expressions__hint">Students add their own translations of an expression. Only the ones you approve are shown, and never with their name.</p>
      {notice ? <p className="teacher-inline-success" role="status">{notice}</p> : null}
      {error ? <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" disabled={busy} onClick={() => { setError(""); setAttempt((value) => value + 1); }} type="button">Reload</button></div> : null}
      {!rows && !error ? <p role="status">Loading translations…</p> : null}
      {rows && !rows.length ? <p>{status === "pending" ? "Nothing to check just now." : status === "approved" ? "No approved translations yet." : "No rejected translations."}</p> : null}
      {rows?.length ? (
        <ul className="teacher-translations__list">
          {rows.map((row) => (
            <li className="teacher-translation" data-translation-id={row.id} key={row.id}>
              <p className="teacher-translation__expression" lang="pt-PT">{row.expression}</p>
              <p className="teacher-translation__text"><span className="teacher-translation__language">{row.language}</span>{row.text}</p>
              <p className="teacher-translation__meta">From {row.studentFirstName}, {dateLabel(row.createdAt)}</p>
              <div className="teacher-expression__actions">
                {row.status !== "approved" ? <button className="button button--lilac button--compact" type="button" disabled={busy} onClick={() => void act(row, "approve")}>Approve<span className="visually-hidden"> {row.language} translation of {row.expression}</span></button> : null}
                {row.status === "pending" ? <button className="button button--outline button--compact" type="button" disabled={busy} onClick={() => void act(row, "reject")}>Reject<span className="visually-hidden"> {row.language} translation of {row.expression}</span></button> : null}
                {row.status !== "pending" ? <button className="button button--outline button--compact" type="button" disabled={busy} onClick={() => void act(row, "delete")}>Delete<span className="visually-hidden"> {row.language} translation of {row.expression}</span></button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
