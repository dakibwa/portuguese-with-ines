import { BRAND } from "@/lib/tutor";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { BrandWordmark } from "@/components/BrandWordmark";
import { SiteNav } from "@/components/SiteNav";
import { BarTitle } from "@/components/BarTitle";

export type SitePage = "home" | "other" | "approach" | "lessons" | "faq" | "book" | "my-lessons" | "terms" | "privacy";

/**
 * An account's one bar (9 November 2026, Dan: Inês's "could it all be
 * consolidated into one smaller banner that has her logo", then "similarly
 * for students can the top bar merge too", "with a menu button if they care
 * to go back"): the wordmark, which still leads home, a hairline, the page's
 * name in the display hand and a splat cut off at the right edge, on blue.
 * The site's pages are behind the menu button; Inês's bar has none, since
 * her tools are the page.
 *
 * `when: "account"` is the booking page's, the same one bar for a visitor
 * booking as for a student (11 November 2026, Dan: "like in the other pages
 * where portugues com a ines is next to book a lesson in that single blue
 * thing"). It reads `bookTitle` until the page is a student's
 * (`data-booking-account`, set before the page paints), then `title`, and
 * holds a signed-out visitor's `Sign in`. That page keeps its one heading for
 * screen readers, so there the bar's name is a copy for the eye.
 */
export type AccountBar = { title: string; bookTitle?: string; mark: string; when?: "account"; menu?: boolean };

type SiteHeaderProps = {
  currentPage?: SitePage;
  bar?: AccountBar;
};

/* No default page: a route that names none (reset password, the schedule) must
   not mark the brand link as the current page. */
export function SiteHeader({ currentPage = "other", bar }: SiteHeaderProps) {
  const barClass = bar ? " is-bar" : "";
  return (
    <header className={`site-header${barClass}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="site-header__inner">
        <Link
          href="/"
          className="site-header__brand"
          aria-current={currentPage === "home" ? "page" : undefined}
          aria-label={`${BRAND}, home`}
        >
          <BrandWordmark priority className="header-wordmark" />
        </Link>
        {bar ? (bar.when === "account"
          ? <p aria-hidden="true" className="site-header__title"><BarTitle bar={bar} /></p>
          : <h1 className="site-header__title">{bar.title}</h1>) : null}
        {bar?.menu === false ? null : <SiteNav bar={bar ? { title: bar.title, bookTitle: bar.bookTitle, mark: bar.mark, when: bar.when ?? "always" } : undefined} currentPage={currentPage} />}
        {bar ? <AssetMark asset={bar.mark} className="site-header__mark" priority /> : null}
      </div>
    </header>
  );
}
