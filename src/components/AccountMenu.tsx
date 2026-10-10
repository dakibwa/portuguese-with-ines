"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { studentMark } from "@/lib/student-marks";

export type AccountSection = "upcoming" | "history" | "profile";

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
  // eslint-disable-next-line @next/next/no-img-element
  return splat ? <img alt="" aria-hidden="true" className="account-signature" src={splat.src} /> : null;
}

export function AccountMenu({
  current,
  mark,
  name,
  onSelect,
  onSignOut,
  upcomingCount = 0
}: {
  /** The card showing; none while booking, when the bar stands for the account. */
  current: AccountSection | null;
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

  const place = current === "upcoming" ? 0 : current === "history" ? 1 : current === "profile" ? 2 : "none";

  return (
    <div className="account-menu" ref={menuRef}>
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
        <div className={`account-menu__places account-menu__places--at-${place}`}>
          <span aria-hidden="true" className="account-menu__thumb" />
          <button aria-current={current === "upcoming" ? "true" : undefined} onClick={() => choose("upcoming")} type="button">
            Your lessons {upcomingCount ? <span>{upcomingCount}</span> : null}
          </button>
          <button aria-current={current === "history" ? "true" : undefined} onClick={() => choose("history")} type="button">
            Past lessons
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
