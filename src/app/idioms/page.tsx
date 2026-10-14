import type { Metadata } from "next";
import { IdiomsExperience } from "@/components/expressions/IdiomsExperience";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./idioms.css";

export const metadata: Metadata = {
  title: "Pinta e descobre · Português com a Inês",
  description: "Paint and discover Portuguese expressions with Inês.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/idioms/" },
};

export default function IdiomsPage() {
  return (
    <div className="idioms-page">
      <SiteHeader />
      <main className="idioms-main" id="main-content">
        <h1 className="visually-hidden" lang="pt-PT">Pinta e descobre</h1>
        <IdiomsExperience />
      </main>
      <SiteFooter />
    </div>
  );
}
