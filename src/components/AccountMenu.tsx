"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { studentMark } from "@/lib/student-marks";

export type AccountSection = "upcoming" | "history" | "homework" | "profile";

/**
 * The account's one menu, in the heading of whichever account card is showing
 * (Your lessons, Past lessons or Your details), sparing the page a second bar
 * above the calendar. Where the card is wide, its places sit open at the top
 * left as one sliding control, without the name: the name, and Sign out, live
 * in Your details (10 October 2026, at Dan's request). Where it is narrow, a
 * button with the student's splat, or their initial, and their name opens the
 * places as a dropdown with Sign out beneath them. The same buttons serve
 * both, so either way there is one menu.
 */
/**
 * The student's splat when they have chosen one, otherwise their initial in a
 * blue circle: the same mark in the menu button and in Your details.
 */
export function AccountAvatar({ className = "", mark, name }: { className?: string; mark?: string; name: string }) {
  const splat = studentMark(mark);
  // The first character as written, whole even outside the Basic Latin.
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
  if (splat) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" aria-hidden="true" className={`account-avatar account-avatar--splat ${className}`} src={splat.src} />;
  }
  return initial ? <span aria-hidden="true" className={`account-avatar ${className}`}>{initial}</span> : null;
}

/**
 * The splat a student chose, signed large in the bottom right corner of their
 * account's cards (10 October 2026, at Dan's request). Nothing until they
 * choose one: the initial stays in the menu alone.
 */
export function AccountSignature({ mark }: { mark?: string }) {
  const splat = studentMark(mark);
  // A splat chosen while the card shows lands in its corner; moving between
  // cards it is simply there.
  const [first] = useState(mark);
  const landing = mark !== first;
  return splat ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" aria-hidden="true" className={`account-signature${landing ? " is-landing" : ""}`} key={splat.src} src={splat.src} />
  ) : null;
}

/**
 * Where the places' thumb last rested. Your lessons, Past lessons and Your
 * details are separate cards, each with its own menu, so a new card's thumb
 * starts where the last one stood and glides to its own place, and the card's
 * contents slide in from the side it was reached from (11 October 2026, at
 * Dan's request: the slider did not slide between pages).
 */
let lastPlace: number | null = null;

export function AccountMenu({
  current,
  folded = false,
  mark,
  name,
  onSelect,
  onSignOut,
  upcomingCount = 0
}: {
  /** The card showing; none while booking, when the bar stands for the account. */
  current: AccountSection | null;
  /** The name's menu at every width, never the open places. */
  folded?: boolean;
  mark?: string;
  name: string;
  onSelect: (section: AccountSection) => void;
  onSignOut: () => void;
  upcomingCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented ||
        document.querySelector('dialog:modal, [role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      setOpen(false);
      document.getElementById("account-menu-button")?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(section: AccountSection) {
    setOpen(false);
    onSelect(section);
  }

  const place = current === "upcoming" ? 0 : current === "history" ? 1 : current === "homework" ? 2 : current === "profile" ? 3 : "none";
  const numericPlace = typeof place === "number" ? place : null;
  const [shownPlace, setShownPlace] = useState<number | "none">(() => lastPlace ?? place);

  useLayoutEffect(() => {
    const from = lastPlace;
    lastPlace = numericPlace;
    if (numericPlace === null || from === null || from === numericPlace) {
      setShownPlace(numericPlace ?? "none");
      return;
    }
    const card = menuRef.current?.closest<HTMLElement>(".account-card, .calendar-panel");
    if (card) {
      card.dataset.accountSlide = numericPlace > from ? "forward" : "back";
      window.setTimeout(() => { delete card.dataset.accountSlide; }, 480);
    }
    // Two frames: the thumb is painted where it was before it moves.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShownPlace(numericPlace));
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [numericPlace]);

  return (
    <div className={`account-menu${folded ? " account-menu--folded" : ""}`} ref={menuRef}>
      <button
        aria-controls="account-menu"
        aria-expanded={open}
        className="account-menu__toggle"
        id="account-menu-button"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <AccountAvatar className="account-menu__avatar" mark={mark} name={name} />
        <span className="visually-hidden">Account: </span>
        <span className="account-menu__name">{name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div className={`account-menu__panel${open ? " is-open" : ""}`} id="account-menu">
        {/* Open in the header, the places are one sliding control, like the
            booking bar's; the thumb rests on the card that is showing. */}
        <div className={`account-menu__places account-menu__places--at-${shownPlace}`}>
          <span aria-hidden="true" className="account-menu__thumb" />
          <button aria-current={current === "upcoming" ? "true" : undefined} onClick={() => choose("upcoming")} type="button">
            Your lessons {upcomingCount ? <span>{upcomingCount}</span> : null}
          </button>
          <button aria-current={current === "history" ? "true" : undefined} onClick={() => choose("history")} type="button">
            Past lessons
          </button>
          <button aria-current={current === "homework" ? "true" : undefined} onClick={() => choose("homework")} type="button">
            Homework
          </button>
          <button aria-current={current === "profile" ? "true" : undefined} onClick={() => choose(current === "profile" ? "upcoming" : "profile")} type="button">
            {current === "profile" ? "Done editing" : "Edit details"}
          </button>
        </div>
        <button
          className="account-menu__sign-out"
          onClick={() => {
            setOpen(false);
            onSignOut();
          }}
          type="button"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
