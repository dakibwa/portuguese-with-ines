"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthApiError, readSession } from "@/lib/auth-api";
import { fetchTranslations, sendTranslation, TRANSLATION_LIMITS, type ExpressionTranslation } from "@/lib/expression-translations-api";

/** Who is reading: a student can add their own; Inês, trying it out, is pointed to her review. */
export type TranslationsViewer = { token: string; viewer: "student" | "teacher" };

const SUGGESTIONS = ["English", "Spanish", "French", "German", "Italian", "Dutch", "Polish", "Ukrainian", "Chinese", "Japanese"];
/** The `lang` of a translation, only when its language is plainly one of these. */
const LANGS: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it", dutch: "nl",
  polish: "pl", ukrainian: "uk", chinese: "zh", japanese: "ja", portuguese: "pt",
};

/**
 * "Noutras línguas": the expression as students say it in their own
 * languages, approved by Inês, one of the reading's own facts. A student can
 * add theirs; it waits for her before anyone sees it.
 */
export function ExpressionTranslations({ expressionId, viewer }: { expressionId: string; viewer: TranslationsViewer }) {
  const [rows, setRows] = useState<ExpressionTranslation[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [unpublished, setUnpublished] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLoadError("");
    fetchTranslations(expressionId).then((value) => { if (current) setRows(value); }).catch((caught) => {
      if (!current) return;
      if (caught instanceof AuthApiError && caught.status === 404) setUnpublished(true);
      else setLoadError(caught instanceof Error ? caught.message : "The translations couldn’t be loaded.");
    });
    return () => { current = false; };
  }, [expressionId, attempt]);

  return (
    <div className="expression-translations" lang="en">
      <h4 className="expression-card__label" lang="pt-PT">Noutras línguas</h4>
      {/* Her drafts have none yet: students only see published expressions. */}
      {unpublished ? <p>Students’ own versions appear here once this expression is published.</p> : loadError ? (
        <div className="expression-translations__error" role="alert">
          <p>{loadError}</p>
          <button className="button button--outline button--compact" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      ) : !rows ? <p role="status">Loading…</p> : rows.length ? (
        <ul className="expression-translations__list">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="expression-translations__language">{row.language}</span>
              <p lang={LANGS[row.language.trim().toLowerCase()]}><span className="expression-card__value">{row.text}</span></p>
            </li>
          ))}
        </ul>
      ) : <p>{viewer.viewer === "teacher" ? "None yet." : "Do you say it another way in your language?"}</p>}
      {unpublished ? null : viewer.viewer === "teacher" ? (
        <p className="expression-translations__hint">
          Students can add their own here. <Link href="/schedule/?tab=expressions">Review them in your collection.</Link>
        </p>
      ) : <AddVersion expressionId={expressionId} token={viewer.token} />}
    </div>
  );
}

/** A quiet "Add yours" opens the student's small form in place. */
function AddVersion({ expressionId, token }: { expressionId: string; token: string }) {
  const [open, setOpen] = useState(false);
  const form = useId();
  return (
    <>
      <button aria-controls={form} aria-expanded={open} className="expression-card__toggle expression-translations__add" type="button" onClick={() => setOpen((value) => !value)}>
        Add yours
      </button>
      <div className="expression-translations__adding" hidden={!open} id={form}>
        <TranslationForm expressionId={expressionId} token={token} />
      </div>
    </>
  );
}

function TranslationForm({ expressionId, token }: { expressionId: string; token: string }) {
  const [language, setLanguage] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<"ready" | "sending" | "sent">("ready");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const ids = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!language.trim() || !text.trim()) { setError("Please add the language and your version."); return; }
    pending.current = true;
    setState("sending");
    setError("");
    try {
      await sendTranslation(token, expressionId, { language: language.trim(), text: text.trim() });
      if (readSession() === token) setState("sent");
    } catch (caught) {
      // A lapsed session is forgotten by the API helper, and the page then asks
      // them to sign in again, with a word about adding translations.
      if (caught instanceof AuthApiError && caught.status === 401) { setState("ready"); return; }
      setState("ready");
      setError(caught instanceof Error ? caught.message : "Yours couldn’t be sent. Please try again.");
    } finally {
      pending.current = false;
    }
  }

  if (state === "sent") return <p className="expression-translations__thanks" role="status">Thanks! Inês will check it before it appears.</p>;
  const left = TRANSLATION_LIMITS.text - text.length;
  return (
    <form className="expression-translations__form" onSubmit={(event) => void submit(event)}>
      <label htmlFor={`${ids}-language`}>Language</label>
      <input autoComplete="off" id={`${ids}-language`} list={`${ids}-languages`} maxLength={TRANSLATION_LIMITS.language} required value={language} onChange={(event) => setLanguage(event.target.value)} />
      <datalist id={`${ids}-languages`}>{SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
      <label htmlFor={`${ids}-text`}>How you say it</label>
      <textarea aria-describedby={`${ids}-left`} id={`${ids}-text`} maxLength={TRANSLATION_LIMITS.text} required rows={3} value={text} onChange={(event) => setText(event.target.value)} />
      <p className="expression-translations__left" id={`${ids}-left`}>{left === 1 ? "1 character left" : `${left} characters left`}</p>
      {error ? <p className="booking-alert" role="alert">{error}</p> : null}
      <button className="button button--coral button--compact" disabled={state === "sending"} type="submit">{state === "sending" ? "Sending…" : "Send to Inês"}</button>
    </form>
  );
}
