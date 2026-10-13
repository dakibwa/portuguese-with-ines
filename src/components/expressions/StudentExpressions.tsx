"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ExpressionExamples, ExpressionExtras, ExpressionMeanings } from "@/components/expressions/ExpressionCard";
import { ExpressionPainting, type ExpressionPaintingHandle, type PaintingStart } from "@/components/expressions/ExpressionPainting";
import { FACTS_OPEN } from "@/components/expressions/painter";
import { AuthApiError, readSession } from "@/lib/auth-api";
import { chooseDecoy, nextPaint, paintFor, rememberPaint, type PaintKey } from "@/lib/expression-paint";
import { fetchStudentExpressions, type StudentExpressions as Collection } from "@/lib/student-expressions-api";

/** The colour the shown expression was painted in, and the one waiting for the next. */
type Paints = { shown: PaintKey | null; next: PaintKey };

const WAITING = ["Ao pé da letra", "Quer dizer", "Em inglês"];
const OPEN_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * "Uma expressão para ti": the press asks the Worker to pick and save one of
 * Inês's expressions, and the brush paints whatever it saved. A failed reply
 * keeps its request, so trying again cannot spend a second pick.
 */
export function StudentExpressions({ token }: { token: string }) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [paints, setPaints] = useState<Paints | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [revealed, setRevealed] = useState(0);
  /** Painting another: the last reading has faded and folded away under the sheet. */
  const [folded, setFolded] = useState(false);
  const active = useRef(false);
  const pending = useRef(false);
  /** The draw in flight, and the paint it is painted in, kept for a retry. */
  const request = useRef<{ id: string; paint: PaintKey } | null>(null);
  const painting = useRef<ExpressionPaintingHandle>(null);
  const card = useRef<HTMLDivElement>(null);
  const result = useRef<HTMLElement>(null);
  /** The card's height just before its reading folded away, came back or was replaced. */
  const before = useRef<number | null>(null);
  const settle = useRef(0);
  const fold = useRef(0);
  const canUpdate = () => active.current && readSession() === token;

  useEffect(() => {
    active.current = true;
    let current = true;
    // Expressions are a gift beside the lessons, never in their way: if they
    // cannot be read, the section stays away rather than raising an alarm.
    fetchStudentExpressions(token).then((value) => {
      if (!current || readSession() !== token) return;
      const shown = value.expression ? paintFor(value.expression.id) : null;
      setPaints({ shown, next: nextPaint([shown]) });
      setCollection(value);
    }).catch(() => {});
    return () => {
      current = false;
      active.current = false;
      window.clearTimeout(settle.current);
      window.clearTimeout(fold.current);
    };
  }, [token]);

  // The card grows or shrinks from its last height, never jumping: the reading
  // folding away, coming back after a failed reply, or opening new.
  useLayoutEffect(() => {
    const from = before.current;
    before.current = null;
    const element = card.current;
    if (from === null || !element || reducedMotion()) return;
    const to = element.getBoundingClientRect().height;
    if (Math.abs(to - from) >= 1) element.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: folded ? 380 : FACTS_OPEN, easing: OPEN_EASE });
  }, [folded, revealed]);

  // The new reading takes the focus as its facts follow the paint; the
  // crossed-out near-miss dries away as they do.
  useLayoutEffect(() => {
    if (!revealed) return;
    result.current?.focus({ preventScroll: true });
    const still = reducedMotion();
    painting.current?.fadeDecoy();
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (active.current) card.current?.scrollIntoView({ block: "nearest", behavior: still ? "instant" : "smooth" });
    }, still ? 0 : FACTS_OPEN);
  }, [revealed]);

  async function pick() {
    if (pending.current || !collection || !paints) return;
    pending.current = true;
    const previous = collection.expression;
    request.current ??= { id: crypto.randomUUID(), paint: paints.next };
    const { id: requestId, paint } = request.current;
    const still = reducedMotion();
    setBusy(true);
    setError("");
    setAnnouncement("Painting your expression…");
    const measure = () => { before.current = card.current?.getBoundingClientRect().height ?? null; };
    if (!still) {
      // It starts from the press; the pick is saved while the paint pools.
      painting.current?.begin(paint, chooseDecoy(collection.shuffleLabels, previous?.expression));
      card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      // The last reading fades, then folds away, so the new one opens fresh.
      if (previous) {
        fold.current = window.setTimeout(() => {
          if (!canUpdate() || !pending.current) return;
          measure();
          setFolded(true);
        }, 230);
      }
    }
    const unfold = () => {
      window.clearTimeout(fold.current);
      measure();
      setFolded(false);
    };
    // A failed reply puts back what was there: the last painting, or the waiting sheet.
    const putBack = () => {
      if (still) return;
      if (previous) painting.current?.show(previous.expression, previous.id, paints.shown ?? paintFor(previous.id), true);
      else painting.current?.rest(paints.next, collection.shuffleLabels, true);
    };
    try {
      const next = await fetchStudentExpressions(token, requestId);
      if (!canUpdate()) return;
      const picked = next.expression;
      if (picked) {
        if (still) painting.current?.show(picked.expression, picked.id, paint);
        else await painting.current?.land(picked.expression, picked.id);
        if (!canUpdate()) return;
        rememberPaint(picked.id, paint);
        request.current = null;
        unfold();
        setPaints({ shown: paint, next: nextPaint([paint]) });
        setCollection(next);
        setRevealed((count) => count + 1);
        setAnnouncement(`Your expression: ${picked.expression}`);
      } else {
        await painting.current?.stop();
        if (!canUpdate()) return;
        request.current = null;
        unfold();
        putBack();
        setCollection({ ...next, expression: previous });
        setAnnouncement("");
        if (next.canPick) setError("That expression is no longer available. Please try again.");
      }
    } catch (caught) {
      await painting.current?.stop();
      if (!canUpdate()) return;
      unfold();
      putBack();
      // Only a refusal ends the draw; a lost or failed reply is retried as the same draw.
      if (caught instanceof AuthApiError && caught.status < 500 && caught.status !== 429) request.current = null;
      setError(caught instanceof Error ? caught.message : "We couldn’t paint an expression. Please try again.");
      setAnnouncement("");
    } finally {
      pending.current = false;
      if (canUpdate()) setBusy(false);
    }
  }

  // Nothing published yet, or nothing to read: leave the lesson workspace clear.
  if (!collection || !collection.hasPublished || !paints) return null;
  const expression = collection.expression;
  const start: PaintingStart = expression
    ? { kind: "show", phrase: expression.expression, id: expression.id, paint: paints.shown ?? paints.next }
    : { kind: "rest", paint: paints.next, wax: collection.shuffleLabels };
  return (
    <section className="student-expressions" aria-labelledby="student-expressions-title">
      <div className="student-expressions__layout">
        <div className="student-expressions__heading">
          <h2 id="student-expressions-title">Uma expressão para ti</h2>
          <p>A Portuguese expression, picked just for you.</p>
        </div>
        <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
        {collection.canPick || expression ? (
          <div
            className="expression-reading"
            data-busy={busy ? "" : undefined}
            data-folded={folded ? "" : undefined}
            data-paint={expression ? (paints.shown ?? paints.next) : paints.next}
            data-state={expression ? "read" : "waiting"}
            ref={card}
          >
            <ExpressionPainting ref={painting} start={start} />
            {expression ? (
              <article className="expression-card expression-reading__text" key={expression.id} lang="pt-PT" ref={result} tabIndex={-1}>
                <h3 className="visually-hidden">{expression.expression}</h3>
                <ExpressionMeanings item={expression} />
                <ExpressionExamples item={expression} />
                <ExpressionExtras image item={expression} />
              </article>
            ) : (
              <div aria-hidden="true" className="expression-reading__waiting">
                {WAITING.map((label) => <p key={label}><span className="expression-card__label">{label}</span><span className="expression-reading__wax" /></p>)}
              </div>
            )}
          </div>
        ) : null}
        <div className="student-expressions__actions">
          {collection.canPick ? (
            <button className="button button--coral" disabled={busy} type="button" onClick={() => void pick()}>
              {busy ? "Painting…" : error ? "Try again" : expression ? "Paint another" : "Paint it"}
            </button>
          ) : null}
          {error ? <p className="booking-alert" role="alert">{error}</p> : (
            <p className="student-expressions__note">{collection.canPick ? "No repeats. Your picks are saved to your account." : "You’ve explored every expression. Come back when Inês adds more."}</p>
          )}
        </div>
      </div>
    </section>
  );
}
