import type { Metadata } from "next";
import { PolicyRedirect } from "@/components/PolicyRedirect";

export const metadata: Metadata = {
  title: "Terms & privacy | Português com a Inês",
  alternates: { canonical: "/book/" },
  robots: { index: false, follow: true }
};

export default function TermsPrivacyPage() {
  return <PolicyRedirect />;
}
