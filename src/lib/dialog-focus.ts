import type { KeyboardEvent } from "react";

export function restoreDialogFocus(previous: HTMLElement | null) {
  const modal = document.querySelector<HTMLElement>("dialog:modal") ??
    document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  if (previous?.isConnected && (!modal || modal.contains(previous))) {
    previous.focus({ preventScroll: true });
  } else if (modal) {
    modal.focus({ preventScroll: true });
    if (!modal.contains(document.activeElement)) {
      modal.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')?.focus({ preventScroll: true });
    }
  }
}

export function keepDialogFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (document.activeElement === event.currentTarget) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
