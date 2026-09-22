"use client";

import { Menu } from "lucide-react";

/**
 * One control, and only where it does something.
 *
 * Opens the same menu at the current scroll position. It is hidden above the
 * breakpoint, where the footer already lists every destination.
 *
 * It asks the header to open by event, since the two live in separate trees
 * with the whole page between them.
 */
export function BackToTop() {
  return (
    <button
      className="site-footer__menu"
      onClick={() => window.dispatchEvent(new CustomEvent("ines:open-menu"))}
      type="button"
    >
      <Menu aria-hidden="true" size={15} />
      Menu
    </button>
  );
}
