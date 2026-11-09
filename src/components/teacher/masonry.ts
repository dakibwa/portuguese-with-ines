"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Two across, cards of different heights leave no hole under the shorter one
 * (2 November 2026, Dan: no holes): with two or more columns each card spans
 * as many 2 px rows as it is tall, so the next card rises into whichever
 * column ends first, still in ranked order. One column is left alone. Cards
 * that come and go are packed again. Returns how to stop.
 */
export function packMasonry(ul: HTMLUListElement) {
  if (typeof ResizeObserver === "undefined") return () => {};
  const ROW = 2;
  const place = () => {
    const style = getComputedStyle(ul);
    const columns = style.gridTemplateColumns.split(" ").filter(Boolean).length;
    const gap = parseFloat(style.columnGap) || 0;
    const masonry = columns > 1;
    ul.classList.toggle("is-masonry", masonry);
    for (const item of Array.from(ul.children) as HTMLElement[]) {
      item.style.gridRowEnd = masonry ? `span ${Math.ceil((item.getBoundingClientRect().height + gap) / ROW)}` : "";
    }
  };
  const sizes = new ResizeObserver(() => place());
  // The cards alone are watched: a change of columns changes their widths,
  // and watching the list too would answer its own growth.
  const watch = () => { sizes.disconnect(); for (const item of Array.from(ul.children)) sizes.observe(item); };
  const children = new MutationObserver(() => { watch(); place(); });
  children.observe(ul, { childList: true });
  watch();
  place();
  return () => {
    sizes.disconnect();
    children.disconnect();
    ul.classList.remove("is-masonry");
    for (const item of Array.from(ul.children) as HTMLElement[]) item.style.gridRowEnd = "";
  };
}

/** A callback ref that packs the list it is given. */
export function useMasonry() {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((ul: HTMLUListElement | null) => {
    stop.current?.();
    stop.current = ul ? packMasonry(ul) : null;
  }, []);
}

/**
 * Packs every list matching `selector` inside `root`, including lists that
 * appear later, such as a student's past lessons arriving after their
 * upcoming ones.
 */
export function useMasonryWithin(root: RefObject<HTMLElement | null>, selector: string) {
  useEffect(() => {
    const element = root.current;
    if (!element || typeof MutationObserver === "undefined") return;
    const packed = new Map<HTMLUListElement, () => void>();
    const scan = () => {
      const lists = new Set(Array.from(element.querySelectorAll<HTMLUListElement>(selector)));
      for (const [ul, stop] of packed) if (!lists.has(ul)) { stop(); packed.delete(ul); }
      for (const ul of lists) if (!packed.has(ul)) packed.set(ul, packMasonry(ul));
    };
    // Only lists arriving or leaving matter here; each list watches its own cards.
    const lists = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches(selector) || node.querySelector(selector))))) scan();
    });
    lists.observe(element, { childList: true, subtree: true });
    scan();
    return () => { lists.disconnect(); for (const stop of packed.values()) stop(); };
  }, [root, selector]);
}
