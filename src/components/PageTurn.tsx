"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

// Home and the four destinations, in the order the header lists them.
const row = ["/", "/approach/", "/lessons/", "/faq/", "/book/"];
let shown: string | null = null;
let previous: string | null = null;

// A page turn the browser skips, because the visitor moved on before it
// finished, rejects its `ready` promise with "Transition was skipped". Nothing
// is lost: the next page simply arrives without the turn. React's view
// transitions leave that rejection unhandled, which would report a harmless
// skip as a page error, so it is let pass here and nothing else is.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    if (reason instanceof DOMException && reason.name === "AbortError" && reason.message.includes("Transition was skipped")) {
      event.preventDefault();
    }
  });
}

function inViewTransition() {
  try {
    return document.documentElement.matches(":active-view-transition");
  } catch {
    return false;
  }
}

// The wordmark's hats dance on a four-second bar (globals.css). Their beat is
// the wall clock's: the hats' place in the bar comes from the time of day, so
// a page turn, or a full page load, never restarts the dance.
function keepWordmarkHatsOnTheBeat() {
  if (typeof CSSAnimation === "undefined" || !("getAnimations" in document)) return;
  for (const animation of document.getAnimations()) {
    if (!(animation instanceof CSSAnimation) || !animation.animationName.startsWith("wordmark-hat-idle")) continue;
    const period = Number(animation.effect?.getTiming().duration);
    if (!period) continue;
    animation.currentTime = Date.now() % period;
    animation.play();
  }
}

/**
 * Steers the page turn (globals.css) as each page commits, which is inside
 * the view transition and before the browser builds its animation.
 *
 * Direction: the pages sit in a row along the header, so one further along
 * arrives from the right and an earlier one from the left, whether reached by
 * a link or the back button. Anything off that row settles in place, as every
 * page does on a phone. Repeated runs for one page keep the direction found.
 *
 * Back and forward: React commits a navigation from the browser's own buttons
 * at once, so it has no view transition. The new page still focuses in the
 * way a turned page does, under a header that stays put. Browsers without
 * view transitions use the plain dissolve instead, and reduced motion neither.
 *
 * The header wordmark's hats keep the wall clock's beat on every page (above).
 */
export function PageTurn() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const page = pathname.endsWith("/") ? pathname : `${pathname}/`;
    const arrived = page !== shown && shown !== null;
    if (page !== shown) {
      previous = shown;
      shown = page;
    }
    const from = previous === null ? -1 : row.indexOf(previous);
    const to = row.indexOf(page);
    document.documentElement.dataset.pageTurn =
      from < 0 || to < 0 || from === to ? "settle" : to > from ? "forward" : "back";
    keepWordmarkHatsOnTheBeat();

    if (!arrived || !("startViewTransition" in document) || inViewTransition()) return;
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const blur = window.matchMedia("(max-width: 820px)").matches ? "3px" : "10px";
    for (const part of document.querySelectorAll<HTMLElement>(".route-fade > main, .route-fade > .site-footer")) {
      part.animate(
        [
          { opacity: 0, filter: `blur(${blur})`, translate: "0 20px" },
          { opacity: 1, filter: "blur(0)", translate: "0 0" }
        ],
        { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    }
  }, [pathname]);

  return null;
}
