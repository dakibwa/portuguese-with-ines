"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/BrandWordmark";
import { AssetMark } from "@/components/BrandMarks";
import { CONTACT_WHATSAPP_URL } from "@/lib/config";
import type { SitePage } from "@/components/SiteHeader";

type NavItem = { href: string; id: SitePage; label: string; note: string; mark: string };

// On a phone the menu says what each page is for, beside its own mark.
const navigation: NavItem[] = [
  { href: "/approach", id: "approach", label: "Approach", note: "How the lessons work", mark: "/visuals/v2-splats/conversation-splat-generated-v2.webp" },
  { href: "/lessons", id: "lessons", label: "Lessons", note: "Prices and lesson lengths", mark: "/visuals/v2-splats/lesson-format-splat-v2.svg" },
  { href: "/faq", id: "faq", label: "FAQ", note: "Questions before booking", mark: "/visuals/v2-splats/faq-answers-splat-v2.svg" },
  { href: "/book", id: "book", label: "Booking", note: "Book or manage your lessons", mark: "/visuals/v2-splats/booking-availability-splat-v2.svg" }
];

export function SiteNav({ currentPage }: { currentPage: SitePage }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => { setReady(true); }, []);

  const positionMenu = useCallback(() => {
    const header = toggleRef.current?.closest(".site-header")?.getBoundingClientRect();
    // Match a visible header exactly; a footer opener uses the viewport top.
    setMenuTop(header && header.bottom > 0 ? header.top : 0);
  }, []);

  // Navigating away must close the panel, or it stays open over the new page.
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      setOpen(false);
      previousPathname.current = pathname;
    }
  }, [pathname]);

  // The footer's Menu button asks for this menu without either component
  // needing to know about the other.
  useEffect(() => {
    function onRequest() {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      positionMenu();
      setOpen(true);
    }

    window.addEventListener("ines:open-menu", onRequest);
    return () => window.removeEventListener("ines:open-menu", onRequest);
  }, [positionMenu]);

  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const background = [...document.querySelectorAll<HTMLElement>("main, .site-footer, .akibwa-project-banner, .site-header")]
      .filter((element) => !element.inert);
    background.forEach((element) => { element.inert = true; });
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));

    const desktop = window.matchMedia("(min-width: 821px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("resize", positionMenu);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
      } else if (event.key === "Tab") {
        const controls = [...menuRef.current?.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a[href]") ?? []];
        const current = controls.indexOf(document.activeElement as HTMLButtonElement | HTMLAnchorElement);
        const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length;
        event.preventDefault();
        controls[next]?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      background.forEach((element) => { element.inert = false; });
      cancelAnimationFrame(focusFrame);
      desktop.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("resize", positionMenu);
    };
  }, [open, positionMenu]);

  return (
    <>
      <nav className="site-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <Link
            aria-current={currentPage === item.id ? "page" : undefined}
            className="site-nav__link"
            href={item.href}
            key={item.id}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        aria-controls="site-nav-mobile"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className={`nav-toggle${open ? " is-open" : ""}`}
        disabled={!ready}
        onClick={() => {
          if (!open) {
            openerRef.current = toggleRef.current;
            positionMenu();
          } else requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
          setOpen((value) => !value);
        }}
        ref={toggleRef}
        type="button"
      >
        <span aria-hidden="true">
          <span className="nav-toggle__line" />
          <span className="nav-toggle__line" />
          <span className="nav-toggle__line" />
        </span>
      </button>

      {/* inert, not just hidden: a closed panel must be unreachable by tab and
          invisible to a screen reader, and hiding it visually does neither.
          The portal also keeps the dialog above the optional portfolio banner. */}
      {ready ? createPortal(<div
        className={`nav-mobile${open ? " is-open" : ""}`}
        style={{ top: menuTop }}
        id="site-nav-mobile"
        ref={menuRef}
        inert={!open || undefined}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Site navigation"
      >
        <div className="nav-mobile__inner">
          <div className="site-header__inner nav-mobile__heading">
            <div className="site-header__brand">
              <BrandWordmark className="header-wordmark" />
            </div>
            <button
              aria-label="Close menu"
              className="nav-mobile__close"
              ref={closeRef}
              onClick={() => {
                setOpen(false);
                requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
              }}
              type="button"
            >
              <X aria-hidden="true" size={26} strokeWidth={1.8} />
            </button>
          </div>
          <div className="nav-mobile__links">
            {navigation.map((item) => (
              <Link
                aria-current={currentPage === item.id ? "page" : undefined}
                aria-describedby={`nav-mobile-note-${item.id}`}
                aria-label={item.label}
                className="nav-mobile__link"
                href={item.href}
                key={item.id}
                onClick={() => setOpen(false)}
              >
                <AssetMark asset={item.mark} className="nav-mobile__mark" />
                <span className="nav-mobile__text">
                  <span className="nav-mobile__label">{item.label}</span>
                  <span className="nav-mobile__note" id={`nav-mobile-note-${item.id}`}>{item.note}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="nav-mobile__cta">
            <p>One to one, online or in Porto.</p>
            <div className="nav-mobile__cta-actions">
              <Link className="button button--coral button--compact" href="/book/?view=book" onClick={() => setOpen(false)}>
                Book a lesson
              </Link>
              <a className="button button--outline-light button--compact" href={CONTACT_WHATSAPP_URL} rel="noreferrer" target="_blank">
                Message on WhatsApp
              </a>
            </div>
          </div>
          <AssetMark asset="/visuals/generated-splats/open-centre-lavender-splat.webp" className="nav-mobile__splat" />
        </div>
      </div>, document.body) : null}
    </>
  );
}
