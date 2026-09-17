import Link from "next/link";
import { BrandWordmark } from "@/components/BrandWordmark";
import { SiteNav } from "@/components/SiteNav";

export type SitePage = "home" | "other" | "approach" | "lessons" | "faq" | "book" | "my-lessons" | "terms" | "privacy";

type SiteHeaderProps = {
  currentPage?: SitePage;
};

/* No default page: a route that names none (reset password, the schedule) must
   not mark the brand link as the current page. */
export function SiteHeader({ currentPage = "other" }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="site-header__inner">
        <Link
          href="/"
          className="site-header__brand"
          aria-current={currentPage === "home" ? "page" : undefined}
          aria-label="Português com a Inês, home"
        >
          <BrandWordmark priority className="header-wordmark" />
        </Link>
        <SiteNav currentPage={currentPage} />
      </div>
    </header>
  );
}
