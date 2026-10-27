"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExpressionExamples, ExpressionExtras, ExpressionMeanings } from "@/components/expressions/ExpressionCard";
import { ExpressionPainting, type ExpressionPaintingHandle, type PaintingStart } from "@/components/expressions/ExpressionPainting";
import { FACTS_OPEN, OPEN_EASE, openDuration } from "@/components/expressions/painter";
import { AuthApiError, readSession } from "@/lib/auth-api";
import { chooseDecoy, nextPaint, paintFor, rememberPaint, type PaintKey } from "@/lib/expression-paint";
import { workerExpressions, type ExpressionSource, type StudentExpressions as Collection } from "@/lib/student-expressions-api";

/** The colour the shown expression was painted in, and the one waiting for the next. */
type Paints = { shown: PaintKey | null; next: PaintKey };

const TITLE = "Uma expressão para ti";
const EXHAUSTED = "You’ve explored every expression. Come back when Inês adds more.";
/** The facts still to come, in wax; Exemplo waits only where it will open beside them. */
const WAITING = ["Ao pé da letra", "Quer dizer", "Em inglês", "Exemplo"];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * "Uma expressão para ti": the press asks the Worker to pick and save one of
 * Inês's expressions, and the brush paints whatever it saved. A failed reply
 * keeps its request, so trying again cannot spend a second pick.
 *
 * `source` replaces the Worker: Inês's try-out paints from her own collection
 * in her browser, and `studentId` is then her account, for her colours.
 */
export function StudentExpressions({ studentId, token, source, fullPage = false }: { studentId: string; token: string; source?: ExpressionSource; fullPage?: boolean }) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [paints, setPaints] = useState<Paints | null>(null);
  /**
   * The paint being painted, from the press until the reading opens (or the
   * reply fails); `still` when motion is reduced, and nothing is painted until
   * the reading is replaced at once.
   */
  const [busy, setBusy] = useState<{ paint: PaintKey; still: boolean } | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [revealed, setRevealed] = useState(0);
  /** Counts the changes the card's height follows smoothly. */
  const [resized, setResized] = useState(0);
  /** The sheet could not be painted: the reading shows the expression as its title. */
  const [unpainted, setUnpainted] = useState(false);
  const active = useRef(false);
  const pending = useRef(false);
  /** The draw in flight, and the paint it is painted in, kept for a retry. */
  const request = useRef<{ id: string; paint: PaintKey } | null>(null);
  const painting = useRef<ExpressionPaintingHandle>(null);
  const section = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const result = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  /** The card's height just before its reading was replaced, or its painting put back. */
  const before = useRef<number | null>(null);
  /** A new painting has landed: the sheet closes round it as its reading opens. */
  const settling = useRef(false);
  /** A failed press: the button takes the focus back once it can be pressed again. */
  const refocus = useRef(false);
  const settle = useRef(0);
  const canUpdate = () => active.current && readSession() === token;

  useEffect(() => {
    active.current = true;
    let current = true;
    setCollection(null);
    setPaints(null);
    setLoadError("");
    // Expressions are a gift beside the lessons, never in their way: if they
    // cannot be read, the section stays away rather than raising an alarm.
    (source ?? workerExpressions(token)).load().then((value) => {
      if (!current || readSession() !== token) return;
      const shown = value.expression ? paintFor(studentId, value.expression.id) : null;
      setPaints({ shown, next: nextPaint([shown]) });
      setCollection(value);
    }).catch((caught) => {
      if (current && readSession() === token && fullPage) setLoadError(caught instanceof Error ? caught.message : "Expressions couldn’t be loaded.");
    });
    return () => {
      current = false;
      active.current = false;
      window.clearTimeout(settle.current);
    };
  }, [studentId, token, source, fullPage, loadAttempt]);

  // The card grows or shrinks from its last height, never jumping: a new
  // reading opening as the painted sheet closes round its phrase in the same
  // motion, or the last painting put back after a failed reply.
  useLayoutEffect(() => {
    const from = before.current;
    before.current = null;
    const element = card.current;
    const closeSheet = settling.current ? painting.current?.settle() : undefined;
    settling.current = false;
    if (from === null || !element || reducedMotion()) {
      closeSheet?.();
      return;
    }
    const to = element.getBoundingClientRect().height;
    const duration = openDuration(Math.abs(to - from));
    closeSheet?.(duration);
    if (Math.abs(to - from) >= 1) element.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing: OPEN_EASE });
  }, [resized]);

  // The new reading takes the focus as its facts follow the paint.
  useLayoutEffect(() => {
    if (!revealed) return;
    result.current?.focus({ preventScroll: true });
    const still = reducedMotion();
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (active.current) card.current?.scrollIntoView({ block: "nearest", behavior: still ? "instant" : "smooth" });
    }, still ? 0 : FACTS_OPEN);
  }, [revealed]);

  // After a failed press the reading comes back from under the paint; if the
  // focus was lost with it, it returns to the button.
  useEffect(() => {
    if (busy || !refocus.current) return;
    refocus.current = false;
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused === section.current) button.current?.focus({ preventScroll: true });
  }, [busy]);

  async function pick() {
    if (pending.current || !collection || !paints) return;
    pending.current = true;
    const previous = collection.expression;
    request.current ??= { id: crypto.randomUUID(), paint: paints.next };
    const { id: requestId, paint } = request.current;
    const still = reducedMotion();
    // "Paint another" sits in the reading, which is out of reach while it
    // paints: the focus waits on the section, never dropped to the page.
    if (result.current?.contains(document.activeElement)) section.current?.focus({ preventScroll: true });
    setBusy({ paint, still });
    setError("");
    setAnnouncement("Painting your expression…");
    const measure = () => { before.current = card.current?.getBoundingClientRect().height ?? null; };
    if (!still) {
      // It starts from the press; the pick is saved while the paint pools.
      // The last reading waits in wax where it is, so nothing below moves until the new one opens.
      painting.current?.begin(paint, chooseDecoy(collection.shuffleLabels, previous?.expression));
      card.current?.querySelector(".paint-sheet")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    // A failed reply puts back what was there: the last painting, or the
    // waiting sheet with the freshest phrases in its wax.
    const putBack = (labels = collection.shuffleLabels) => {
      if (still) return;
      measure();
      setResized((count) => count + 1);
      if (previous) painting.current?.show(previous.expression, previous.id, paints.shown ?? paintFor(studentId, previous.id), true);
      else painting.current?.rest(paints.next, labels, true);
    };
    try {
      const next = await (source ?? workerExpressions(token)).pick(requestId);
      if (!canUpdate()) return;
      const picked = next.expression;
      if (picked) {
        // Remembered as soon as it is saved, so a reload mid-painting shows it in this paint.
        rememberPaint(studentId, picked.id, paint);
        if (still) painting.current?.show(picked.expression, picked.id, paint);
        else await painting.current?.land(picked.expression, picked.id);
        if (!canUpdate()) return;
        request.current = null;
        measure();
        settling.current = true;
        setResized((count) => count + 1);
        setPaints({ shown: paint, next: nextPaint([paint]) });
        setCollection(next);
        setRevealed((count) => count + 1);
        setAnnouncement(`Your expression: ${picked.expression}`);
      } else {
        await painting.current?.stop();
        if (!canUpdate()) return;
        request.current = null;
        refocus.current = true;
        putBack(next.shuffleLabels);
        setCollection({ ...next, expression: previous });
        setAnnouncement("");
        if (next.canPick) setError("That expression is no longer available. Please try again.");
      }
    } catch (caught) {
      await painting.current?.stop();
      if (!canUpdate()) return;
      refocus.current = true;
      putBack();
      // Only a refusal ends the draw; a lost or failed reply is retried as the same draw.
      if (caught instanceof AuthApiError && caught.status < 500 && caught.status !== 429) request.current = null;
      setError(caught instanceof Error ? caught.message : "We couldn’t paint an expression. Please try again.");
      setAnnouncement("");
    } finally {
      pending.current = false;
      if (canUpdate()) setBusy(null);
    }
  }

  // Nothing published yet, or nothing to read: leave the lesson workspace clear.
  if (!collection || !paints) return fullPage ? loadError ? (
    <div className="idioms-state" role="alert">
      <p>{loadError}</p>
      <button className="button button--outline button--compact" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Try again</button>
    </div>
  ) : <p className="idioms-state" role="status">Loading expressions…</p> : null;
  if (!collection.hasPublished) return fullPage ? <p className="idioms-state" role="status">Expressions aren’t available yet.</p> : null;
  const expression = collection.expression;
  const start: PaintingStart = expression
    ? { kind: "show", phrase: expression.expression, id: expression.id, paint: paints.shown ?? paints.next }
    : { kind: "rest", paint: paints.next, wax: collection.shuffleLabels };
  // Beside the reading's themes once painted; with the label on the waiting sheet before.
  const actions = (
    <div className="expression-reading__actions" lang="en">
      {collection.canPick ? (
        <button className="button button--coral button--compact expression-reading__go" disabled={Boolean(busy)} ref={button} type="button" onClick={() => void pick()}>
          <span>{busy ? "Painting…" : error ? "Try again" : expression ? "Paint another" : "Paint it"}</span>
          {/* In the reading's last row the button keeps the width of its longest label, so the row never reflows as it changes. */}
          {expression ? <span aria-hidden="true" className="expression-reading__go-sizer">Paint another</span> : null}
        </button>
      ) : <p className="expression-reading__note">{EXHAUSTED}</p>}
      {error ? <p className="booking-alert" role="alert">{error}</p> : null}
    </div>
  );
  return (
    <section className={`student-expressions${fullPage ? " student-expressions--page" : ""}`} aria-labelledby="student-expressions-title" ref={section} tabIndex={-1}>
      <h2 className="visually-hidden" id="student-expressions-title" lang="pt-PT">{TITLE}</h2>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
      {collection.canPick || expression ? (
        <div
          className="expression-reading"
          data-busy={busy && !busy.still ? "" : undefined}
          /* The card takes the new paint as it lands: its labels and dabs while it paints, then the reading. With reduced motion it keeps the paint it shows until the new reading replaces it. */
          data-paint={busy && !busy.still ? busy.paint : expression ? (paints.shown ?? paints.next) : paints.next}
          data-state={expression ? "read" : "waiting"}
          data-unpainted={unpainted ? "" : undefined}
          ref={card}
        >
          <ExpressionPainting ref={painting} start={start} onUnavailable={() => setUnpainted(true)} />
          {expression ? (
            // While another is painted, the last reading waits in wax where it stands, out of reach.
            <article className="expression-card expression-reading__text" inert={Boolean(busy)} key={expression.id} lang="pt-PT" ref={result} tabIndex={-1}>
              <h3 className="expression-reading__title">{expression.expression}</h3>
              <ExpressionMeanings item={expression} />
              <ExpressionExamples item={expression} />
              <ExpressionExtras action={actions} image item={expression} />
            </article>
          ) : (
            <>
              {/* At rest the sheet invites; the hidden heading says the same to assistive technology. */}
              <p aria-hidden="true" className="expression-reading__label" lang="pt-PT">{TITLE}</p>
              <div aria-hidden="true" className="expression-reading__waiting">
                {WAITING.map((label) => <p key={label}><span className="expression-card__label">{label}</span><span className="expression-reading__wax" /></p>)}
              </div>
              {actions}
            </>
          )}
        </div>
      ) : <p className="expression-reading__note">{EXHAUSTED}</p>}
      {!fullPage ? <p className="expression-page-link"><Link className="button button--outline button--small" href="/idioms/">Open full page</Link></p> : null}
    </section>
  );
}
