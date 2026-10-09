"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type AccountSection = "upcoming" | "history" | "profile";

/**
 * The account's one menu, in the heading of whichever account card is showing
 * (Your lessons, Past lessons or Your details), sparing the page a second bar
 * above the calendar. Where the card is wide, its places sit open in the
 * middle of the header as one sliding control, and the student's name stands
 * plain at the left with Sign out beneath it; where it is narrow, a button
 * with their initial and name opens them as a dropdown. The same buttons serve
 * both, so either way there is one menu.
 */
export function AccountMenu({
  current,
  name,
  onSelect,
  onSignOut,
  upcomingCount = 0
}: {
  current: AccountSection;
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

  const place = current === "upcoming" ? 0 : current === "history" ? 1 : 2;
  // The first character as written, whole even outside the Basic Latin.
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";

  return (
    <div className="account-menu" ref={menuRef}>
      <span className="account-menu__label">{name}</span>
      <button
        aria-controls="account-menu"
        aria-expanded={open}
        className="account-menu__toggle"
        id="account-menu-button"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {initial ? <span aria-hidden="true" className="account-menu__avatar">{initial}</span> : null}
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
