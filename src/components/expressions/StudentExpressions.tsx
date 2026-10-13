"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Shuffle } from "lucide-react";
import { ExpressionCard } from "@/components/expressions/ExpressionCard";
import { AuthApiError, readSession } from "@/lib/auth-api";
import { fetchStudentExpressions, type StudentExpressions as Collection } from "@/lib/student-expressions-api";

const SPIN_MS = 2200;

export function StudentExpressions({ token }: { token: string }) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"idle" | "loading" | "spinning">("idle");
  const [reel, setReel] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const active = useRef(false);
  const pending = useRef(false);
  const request = useRef<string | null>(null);
  const result = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const canUpdate = () => active.current && readSession() === token;

  useEffect(() => {
    active.current = true;
    let current = true;
    setError("");
    fetchStudentExpressions(token).then((value) => {
      if (current && readSession() === token) setCollection(value);
    }).catch((caught) => {
      if (current && readSession() === token) setError(caught instanceof Error ? caught.message : "Your expressions couldn’t be loaded.");
    });
    return () => { current = false; active.current = false; animation.current?.cancel(); };
  }, [token, attempt]);

  async function pick() {
    if (pending.current) return;
    pending.current = true; setPhase("loading"); setError(""); setAnnouncement("Choosing your expression…");
    request.current ??= crypto.randomUUID();
    try {
      const next = await fetchStudentExpressions(token, request.current);
      if (!canUpdate()) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (next.expression && !reducedMotion) {
        const labels = [...new Set([...(collection?.shuffleLabels ?? []), ...next.shuffleLabels, next.expression.expression])];
        const sequence = Array.from({ length: 22 }, (_, index) => labels[index % labels.length]);
        // The centre row stops on the already-reserved result. The reel never
        // chooses or saves anything; a stopped animation cannot lose a pick.
        const neighbor = labels.find((label) => label !== next.expression?.expression) ?? next.expression.expression;
        sequence[sequence.length - 1] = neighbor;
        sequence.push(next.expression.expression, neighbor);
        flushSync(() => { setReel(sequence); setPhase("spinning"); });
        track.current?.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
        const row = track.current?.firstElementChild?.getBoundingClientRect().height ?? 0;
        animation.current = track.current?.animate([
          { transform: "translateY(0)" },
          { transform: `translateY(-${(sequence.length - 3) * row}px)` },
        ], { duration: SPIN_MS, easing: "cubic-bezier(.12,.65,.18,1)", fill: "forwards" }) ?? null;
        await animation.current?.finished.catch(() => {});
        if (!canUpdate()) return;
      }
      setCollection(next.expression ? next : { ...next, expression: collection?.expression ?? null }); request.current = null;
      setAnnouncement(next.expression ? `Your expression: ${next.expression.expression}` : "");
      if (!next.expression && next.canPick) setError("That expression is no longer available. Pick another one.");
      requestAnimationFrame(() => {
        if (!canUpdate()) return;
        result.current?.focus({ preventScroll: true });
        result.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "instant" : "smooth" });
      });
    } catch (caught) {
      if (!canUpdate()) return;
      if (caught instanceof AuthApiError && caught.status < 500 && caught.status !== 429) request.current = null;
      setError(caught instanceof Error ? caught.message : "Your expression couldn’t be picked. Please try again.");
      setAnnouncement("");
    } finally {
      pending.current = false;
      if (canUpdate()) setPhase("idle");
    }
  }

  // No published teaching material yet: leave the lesson workspace clear.
  if (collection && !collection.hasPublished && !error) return null;
  return (
    <section className="student-expressions" aria-labelledby="student-expressions-title">
      <div className="student-expressions__heading">
        <div>
          <h2 id="student-expressions-title">Uma expressão para ti</h2>
          <p>A Portuguese expression, picked just for you.</p>
        </div>
        <Shuffle className="student-expressions__mark" size={38} aria-hidden="true" />
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
      {!collection && !error ? <p className="student-expressions__note" role="status">Loading your expressions…</p> : null}
      {phase === "spinning" ? (
        <div className="expression-reel" aria-hidden="true">
          <div className="expression-reel__window" />
          <div className="expression-reel__track" ref={track}>
            {reel.map((label, index) => <div className="expression-reel__row" key={index}><span lang="pt-PT">{label}</span></div>)}
          </div>
        </div>
      ) : collection?.expression ? (
        <div className="student-expressions__result" ref={result} tabIndex={-1}>
          <ExpressionCard expression={collection.expression} />
        </div>
      ) : collection?.canPick ? (
        <div className="student-expressions__ready" lang="pt-PT">Que expressão vais descobrir?</div>
      ) : null}
      {error ? <p className="booking-alert" role="alert">{error}</p> : null}
      <div className="student-expressions__actions">
        {collection?.canPick ? (
          <button className="button button--coral" disabled={phase !== "idle"} type="button" onClick={() => void pick()}>
            <Shuffle size={18} aria-hidden="true" /><span>{phase !== "idle" ? "Picking…" : error ? "Try again" : collection?.expression ? "Pick another expression" : "Pick an expression"}</span>
          </button>
        ) : !collection && error ? (
          <button className="button button--outline" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        ) : null}
        {collection ? <p className="student-expressions__note">{collection.canPick ? "No repeats. Your picks are saved to your account." : "You’ve explored every expression. Come back when Inês adds more."}</p> : null}
      </div>
    </section>
  );
}
