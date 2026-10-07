"use client";

import { useLayoutEffect } from "react";

/**
 * A splat lands once, as it arrives. Those in the first screen land with the
 * page, from CSS alone. One further down would land unseen during the load, so
 * this holds it until the reader is close to reaching it.
 *
 * Deliberately one-way: a mark is only ever hidden before it has been seen,
 * and anything that goes wrong, or tidying up when the page goes, leaves it
 * showing. No JavaScript, reduced motion and print never hold anything.
 */
export function SplatArrivals() {
  useLayoutEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    if (!window.matchMedia("screen and (prefers-reduced-motion: no-preference)").matches) return;

    const held = new Set<HTMLElement>();
    const cleanups: Array<() => void> = [];

    // Removing the hold restarts the landing from the CSS.
    function land(mark: HTMLElement) {
      held.delete(mark);
      delete mark.dataset.splat;
    }

    // A splat whose picture is still downloading lands when it arrives, not as
    // an empty box beforehand.
    function landWhenDrawn(mark: HTMLElement) {
      const image = mark.querySelector("img");
      if (!image || image.complete) {
        land(mark);
        return;
      }
      const drawn = () => land(mark);
      image.addEventListener("load", drawn, { once: true });
      image.addEventListener("error", drawn, { once: true });
      cleanups.push(() => {
        image.removeEventListener("load", drawn);
        image.removeEventListener("error", drawn);
      });
    }

    // Anything above the line counts as reached, including a mark skipped past
    // in a single jump, so nothing is left hidden behind the reader. The line
    // is a margin rather than a share of the mark that must show, because a
    // corner splat cropped by its card may never show that share.
    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, order) => {
            const mark = entry.target as HTMLElement;
            observer.unobserve(mark);
            // Timed from its own arrival, rippling only with marks reached at
            // the same moment, not waiting its turn in a group already seen.
            mark.style.setProperty("--land-start", "0ms");
            mark.style.setProperty("--land-order", String(order));
            landWhenDrawn(mark);
          });
      },
      { rootMargin: "100000px 0px -8% 0px" }
    );

    for (const mark of document.querySelectorAll<HTMLElement>("main .asset-mark--lands")) {
      const { top, height } = mark.getBoundingClientRect();
      if (!height) continue;
      const belowFirstScreen = top >= window.innerHeight;
      const image = mark.querySelector("img");
      if (!belowFirstScreen && (!image || image.complete)) continue;

      held.add(mark);
      mark.dataset.splat = "held";
      if (belowFirstScreen) observer.observe(mark);
      else landWhenDrawn(mark);
    }

    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      held.forEach((mark) => land(mark));
    };
  }, []);

  return null;
}
