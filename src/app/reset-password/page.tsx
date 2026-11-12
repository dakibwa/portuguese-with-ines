import type { Metadata } from "next";
import "../workspace.css";
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
      <SiteHeader bar={{ title: "New password", mark: "/visuals/v2-splats/booking-availability-splat-v2.svg" }} />
      <main className="manage-page" id="main-content">
        <ResetPassword />
      </main>
      <SiteFooter />
    </>
  );
}
