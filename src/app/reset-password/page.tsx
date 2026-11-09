import type { Metadata } from "next";
import { AccountHero } from "@/components/AccountHero";
import { ResetPassword } from "@/components/ResetPassword";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Reset your password · Português com a Inês",
  description: "Choose a new password.",
  robots: { index: false, follow: false }
};

export default function ResetPasswordPage() {
  return (
    <>
      <SiteHeader />
      <AccountHero
        mark="/visuals/v2-splats/built-around-you-splat-v2.svg"
        title="New password"
      />
      <main className="manage-page" id="main-content">
        <ResetPassword />
      </main>
      <SiteFooter />
    </>
  );
}
