"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { PaintKey } from "@/lib/expression-paint";
import { Painter } from "./painter";

export type PaintingStart =
  | { kind: "rest"; paint: PaintKey; wax: string[] }
  | { kind: "show"; phrase: string; id: string; paint: PaintKey };

export type ExpressionPaintingHandle = {
  /** The press: the dab lands at once, with a near-miss on `decoy` if given. */
  begin(paint: PaintKey, decoy: string | null): void;
  /** Paints the saved phrase; resolves when the brush has lifted. */
  land(phrase: string, id: string): Promise<void>;
  /** The reply failed: the new paint dries away. */
  stop(): Promise<void>;
  /** The finished painting at once. */
  show(phrase: string, id: string, paint: PaintKey, fade?: boolean): void;
  /** The waiting sheet: phrases in wax, `paint` pooled by the margin. */
  rest(paint: PaintKey, wax: string[], fade?: boolean): void;
  /** The crossed-out near-miss dries away once the reading is open. */
  fadeDecoy(): void;
  /**
   * The landed painting closes round its phrase as the reading opens: sets
   * its final size at once, so the card can measure it, and returns what
   * starts the motion there.
   */
  settle(): () => void;
};

/**
 * The painted sheet of "Pinta e descobre". Decorative throughout: the section
 * names the expression in words. The painter draws into it imperatively, so
 * React renders it once and never per frame; a painting that fails to draw
 * leaves the cream sheet and the reading beside it.
 */
export function ExpressionPainting({ start, ref }: { start: PaintingStart; ref?: Ref<ExpressionPaintingHandle> }) {
  const root = useRef<HTMLDivElement>(null);
  const painter = useRef<Painter | null>(null);
  const initial = useRef(start);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let current: Painter;
    try {
      current = new Painter(element);
    } catch {
      return;
    }
    painter.current = current;
    const first = initial.current;
    try {
      if (first.kind === "show") current.show(first.phrase, first.id, first.paint);
      else current.rest(first.paint, first.wax);
    } catch {
      // The reading carries the expression without its painting.
    }
    // Unmounting mid-stroke cancels everything and lets anything awaited carry on.
    return () => {
      current.destroy();
      if (painter.current === current) painter.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => {
    const safely = <T,>(run: (current: Painter) => T, otherwise: T) => {
      const current = painter.current;
      if (!current) return otherwise;
      try {
        return run(current);
      } catch {
        return otherwise;
      }
    };
    return {
      begin: (paint, decoy) => safely((current) => current.begin(paint, decoy), undefined),
      land: (phrase, id) => safely((current) => current.land(phrase, id).catch(() => {}), Promise.resolve()),
      stop: () => safely((current) => current.stop().catch(() => {}), Promise.resolve()),
      show: (phrase, id, paint, fade) => safely((current) => current.show(phrase, id, paint, fade), undefined),
      rest: (paint, wax, fade) => safely((current) => current.rest(paint, wax, fade), undefined),
      fadeDecoy: () => safely((current) => current.fadeDecoy(), undefined),
      settle: () => safely((current) => current.settle(), () => {}),
    };
  }, []);

  return <div aria-hidden="true" className="paint-sheet" ref={root} />;
}
