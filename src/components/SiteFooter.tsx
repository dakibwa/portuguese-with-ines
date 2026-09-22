import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { BrandWordmark } from "@/components/BrandWordmark";
import { publicAssetPath } from "@/lib/paths";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <BrandWordmark tone="cream" className="footer-wordmark" />
      </div>
      <div className="site-footer__actions">
        <nav className="site-footer__nav" aria-label="Footer navigation">
          <Link href="/approach">Approach</Link>
          <Link href="/lessons">Lessons</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/book">Booking</Link>
        </nav>
        <nav className="site-footer__legal" aria-label="Terms and privacy">
          <a aria-haspopup="dialog" data-terms-privacy href={publicAssetPath("/book/#terms-privacy")}>Terms &amp; privacy</a>
        </nav>
        <div className="site-footer__contact">
          <BackToTop />
        </div>
      </div>
    </footer>
  );
}
