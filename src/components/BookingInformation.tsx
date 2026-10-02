"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TermsPrivacyInformation } from "@/components/PolicyInformation";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";

const policySections = ["terms-privacy", "booking", "change-booking", "privacy"];

export function BookingInformation() {
  const [ready, setReady] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const releaseScroll = useRef<(() => void) | null>(null);
  useEffect(() => { setReady(true); }, []);

  const restorePage = useCallback(() => {
    if (dialogRef.current?.open || releaseScroll.current === null) return;
    releaseScroll.current();
    releaseScroll.current = null;
    // Keep old shared links working without leaving a stale fragment on close.
    if (policySections.includes(window.location.hash.slice(1))) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    restoreDialogFocus(returnFocus.current);
    returnFocus.current = null;
  }, []);

  const closeInformation = useCallback(() => {
    dialogRef.current?.close();
    restorePage();
  }, [restorePage]);
  const backdropHandlers = useDialogBackdrop(closeInformation);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function openInformation(trigger?: HTMLElement) {
      if (!dialog || dialog.open) return;
      returnFocus.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      releaseScroll.current = lockPageScroll();
      dialog.showModal();
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }

    function revealLinkedInformation() {
      if (policySections.includes(window.location.hash.slice(1))) openInformation();
      else if (dialog?.open) dialog.close();
    }

    function openFromLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-terms-privacy]") : null;
      if (!link || link.origin !== window.location.origin) return;
      event.preventDefault();
      // Reading the terms never navigates away, changes consent, or discards a
      // booking selection (or a private invitation fragment on another page).
      openInformation(link);
    }

    revealLinkedInformation();
    window.addEventListener("hashchange", revealLinkedInformation);
    document.addEventListener("click", openFromLink, true);
    dialog.addEventListener("close", restorePage);
    dialog.dataset.ready = "true";
    return () => {
      window.removeEventListener("hashchange", revealLinkedInformation);
      document.removeEventListener("click", openFromLink, true);
      dialog.removeEventListener("close", restorePage);
      delete dialog.dataset.ready;
      dialog.close();
      releaseScroll.current?.();
      releaseScroll.current = null;
      restoreDialogFocus(returnFocus.current);
      returnFocus.current = null;
    };
  }, [ready, restorePage]);

  if (!ready) return (
    <section className="policy-information-fallback" id="terms-privacy" aria-labelledby="terms-privacy-title">
      <h2 id="terms-privacy-title">Terms &amp; privacy</h2>
      <TermsPrivacyInformation />
    </section>
  );

  return (
    <dialog
      aria-labelledby="terms-privacy-title"
      className="policy-dialog"
      id="terms-privacy"
      ref={dialogRef}
      {...backdropHandlers}
      onKeyDown={keepDialogFocus}
      onCancel={(event) => { event.preventDefault(); closeInformation(); }}
    >
      <div className="policy-dialog__heading">
        <h2 id="terms-privacy-title">Terms &amp; privacy</h2>
        <button aria-label="Close terms & privacy" onClick={closeInformation} type="button">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="policy-dialog__content" ref={contentRef}>
        <TermsPrivacyInformation />
      </div>
    </dialog>
  );
}
