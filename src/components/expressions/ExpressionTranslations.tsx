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
 * Students' own translations, approved by Inês, in a panel below the
 * reading's last row like its notes. Nothing is fetched until it first opens.
 */
export function ExpressionTranslations({ expressionId, id, open, viewer }: { expressionId: string; id: string; open: boolean; viewer: TranslationsViewer }) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return (
    <div className="expression-card__notes expression-translations" hidden={!open} id={id} lang="en">
      {opened ? <TranslationsBody expressionId={expressionId} viewer={viewer} /> : null}
    </div>
  );
}

function TranslationsBody({ expressionId, viewer }: { expressionId: string; viewer: TranslationsViewer }) {
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

  // Her drafts have no translations yet: students only see published expressions.
  if (unpublished) return <p>Translations appear here once this expression is published.</p>;
  return (
    <>
      {loadError ? (
        <div className="expression-translations__error" role="alert">
          <p>{loadError}</p>
          <button className="button button--outline button--compact" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      ) : !rows ? <p role="status">Loading translations…</p> : rows.length ? (
        <ul className="expression-translations__list">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="expression-translations__language">{row.language}</span>
              <p lang={LANGS[row.language.trim().toLowerCase()]}>{row.text}</p>
            </li>
          ))}
        </ul>
      ) : <p>{viewer.viewer === "teacher" ? "No translations yet." : "No translations yet. Be the first to add one."}</p>}
      {viewer.viewer === "teacher" ? (
        <p className="expression-translations__hint">
          Students can add their own translations here. <Link href="/schedule/?tab=expressions">Review them in your collection.</Link>
        </p>
      ) : <TranslationForm expressionId={expressionId} token={viewer.token} />}
    </>
  );
}

function TranslationForm({ expressionId, token }: { expressionId: string; token: string }) {
  const [language, setLanguage] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<"ready" | "sending" | "sent" | "signed-out">(token ? "ready" : "signed-out");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const ids = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!language.trim() || !text.trim()) { setError("Please add the language and your translation."); return; }
    pending.current = true;
    setState("sending");
    setError("");
    try {
      await sendTranslation(token, expressionId, { language: language.trim(), text: text.trim() });
      if (readSession() === token) setState("sent");
    } catch (caught) {
      if (caught instanceof AuthApiError && caught.status === 401) { setState("signed-out"); return; }
      setState("ready");
      setError(caught instanceof Error ? caught.message : "Your translation couldn’t be sent. Please try again.");
    } finally {
      pending.current = false;
    }
  }

  if (state === "sent") return <p className="expression-translations__thanks" role="status">Thanks! Inês will check it before it appears.</p>;
  if (state === "signed-out") {
    return <p className="expression-translations__hint">Sign in to add your own translation. <Link href="/book/?view=lessons">Sign in</Link></p>;
  }
  const left = TRANSLATION_LIMITS.text - text.length;
  return (
    <form className="expression-translations__form" onSubmit={(event) => void submit(event)}>
      <p className="expression-translations__intro">Add how you would say it in your language.</p>
      <label htmlFor={`${ids}-language`}>Language</label>
      <input autoComplete="off" id={`${ids}-language`} list={`${ids}-languages`} maxLength={TRANSLATION_LIMITS.language} required value={language} onChange={(event) => setLanguage(event.target.value)} />
      <datalist id={`${ids}-languages`}>{SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
      <label htmlFor={`${ids}-text`}>Translation</label>
      <textarea aria-describedby={`${ids}-left`} id={`${ids}-text`} maxLength={TRANSLATION_LIMITS.text} required rows={3} value={text} onChange={(event) => setText(event.target.value)} />
      <p className="expression-translations__left" id={`${ids}-left`}>{left === 1 ? "1 character left" : `${left} characters left`}</p>
      {error ? <p className="booking-alert" role="alert">{error}</p> : null}
      <button className="button button--coral button--compact" disabled={state === "sending"} type="submit">{state === "sending" ? "Sending…" : "Send to Inês"}</button>
    </form>
  );
}
