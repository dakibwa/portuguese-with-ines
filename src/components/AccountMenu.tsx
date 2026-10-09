"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type AccountSection = "upcoming" | "history" | "profile";

/**
 * The account's one menu: the student's name, beneath the heading of whichever
 * account card is showing (Your lessons, Past lessons or Your details), opening
 * the account's places and Sign out. Living in the card, it spares the page a
 * second bar above the calendar.
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
        <span className="visually-hidden">Account: </span>
        <span className="account-menu__name">{name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div className={`account-menu__panel${open ? " is-open" : ""}`} id="account-menu">
        <button aria-current={current === "upcoming" ? "true" : undefined} onClick={() => choose("upcoming")} type="button">
          Your lessons {upcomingCount ? <span>{upcomingCount}</span> : null}
        </button>
        <button aria-current={current === "history" ? "true" : undefined} onClick={() => choose("history")} type="button">
          Past lessons
        </button>
        <button aria-current={current === "profile" ? "true" : undefined} onClick={() => choose(current === "profile" ? "upcoming" : "profile")} type="button">
          {current === "profile" ? "Done editing" : "Edit details"}
        </button>
        <button
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
