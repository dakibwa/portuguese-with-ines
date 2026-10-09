import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "This page could not be found | Português com a Inês"
};

/**
 * A missing address keeps the site around it: the shared header and footer,
 * with the one sentence written on the paper between them. The header's
 * navigation is the way on, so the page adds no action of its own.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="not-found-page" id="main-content">
        <h1>This page could not be found.</h1>
      </main>
      <SiteFooter />
    </>
  );
}
