"use client";

import { useEffect, useRef, useState } from "react";
import { ExpressionCard } from "@/components/expressions/ExpressionCard";
import { ExpressionWheel, type ExpressionWheelHandle } from "@/components/expressions/ExpressionWheel";
import { AuthApiError, readSession } from "@/lib/auth-api";
import { fetchStudentExpressions, type StudentExpressions as Collection } from "@/lib/student-expressions-api";

const QUESTION = "Que expressão vais descobrir?";

export function StudentExpressions({ token }: { token: string }) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [landed, setLanded] = useState(0);
  const active = useRef(false);
  const pending = useRef(false);
  const request = useRef<string | null>(null);
  const result = useRef<HTMLDivElement>(null);
  const wheel = useRef<ExpressionWheelHandle>(null);
  const play = useRef<HTMLDivElement>(null);
  const canUpdate = () => active.current && readSession() === token;

  useEffect(() => {
    active.current = true;
    let current = true;
    // Expressions are a gift beside the lessons, never in their way: if they
    // cannot be read, the section stays away rather than raising an alarm.
    fetchStudentExpressions(token).then((value) => {
      if (current && readSession() === token) setCollection(value);
    }).catch(() => {});
    return () => { current = false; active.current = false; };
  }, [token]);

  async function pick() {
    if (pending.current) return;
    pending.current = true; setSpinning(true); setError(""); setAnnouncement("Spinning the wheel…");
    request.current ??= crypto.randomUUID();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) {
      // It turns from the press; the pick is saved while it does.
      wheel.current?.spin();
      play.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    try {
      const next = await fetchStudentExpressions(token, request.current);
      if (!canUpdate()) return;
      if (next.expression) {
        if (reducedMotion) wheel.current?.show(next.expression.expression);
        else await wheel.current?.land(next.expression.expression);
      } else {
        await wheel.current?.stop();
      }
      if (!canUpdate()) return;
      setCollection(next.expression ? next : { ...next, expression: collection?.expression ?? null }); request.current = null;
      if (next.expression) setLanded((count) => count + 1);
      setAnnouncement(next.expression ? `Your expression: ${next.expression.expression}` : "");
      if (!next.expression && next.canPick) setError("That expression is no longer available. Spin again.");
      requestAnimationFrame(() => {
        if (!canUpdate()) return;
        result.current?.focus({ preventScroll: true });
        result.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "instant" : "smooth" });
      });
    } catch (caught) {
      await wheel.current?.stop();
      if (!canUpdate()) return;
      if (caught instanceof AuthApiError && caught.status < 500 && caught.status !== 429) request.current = null;
      setError(caught instanceof Error ? caught.message : "The wheel couldn’t pick an expression. Please try again.");
      setAnnouncement("");
    } finally {
      pending.current = false;
      if (canUpdate()) setSpinning(false);
    }
  }

  // Nothing published yet, or nothing to read: leave the lesson workspace clear.
  if (!collection || !collection.hasPublished) return null;
  const expression = collection.expression;
  return (
    <section className="student-expressions" aria-labelledby="student-expressions-title">
      <div className="student-expressions__heading">
        <h2 id="student-expressions-title">Uma expressão para ti</h2>
        <p>A Portuguese expression, picked just for you.</p>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
      <div className="student-expressions__play" data-picked={expression ? "" : undefined} ref={play}>
        {collection.canPick || expression ? (
          <ExpressionWheel phrases={collection.shuffleLabels} ref={wheel} restPhrase={expression?.expression ?? QUESTION} />
        ) : null}
        <div className="student-expressions__side">
          <div className="student-expressions__actions">
            {collection.canPick ? (
              <button className="button button--coral" disabled={spinning} type="button" onClick={() => void pick()}>
                {spinning ? "Spinning…" : error ? "Try again" : expression ? "Spin again" : "Spin the wheel"}
              </button>
            ) : null}
            <p className="student-expressions__note">{collection.canPick ? "No repeats. Your picks are saved to your account." : "You’ve explored every expression. Come back when Inês adds more."}</p>
          </div>
          {error ? <p className="booking-alert" role="alert">{error}</p> : null}
          {expression ? (
            <div className="student-expressions__result" data-spinning={spinning ? "" : undefined} key={landed} ref={result} tabIndex={-1}>
              <ExpressionCard expression={expression} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
