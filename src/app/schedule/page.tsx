import type { Metadata } from "next";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { BrandWordmark } from "@/components/BrandWordmark";
import { TeacherSchedule } from "@/components/TeacherSchedule";
import "./teacher-schedule.css";

export const metadata: Metadata = {
  title: "Schedule · Português com a Inês",
  description: "Weekly hours and bookings.",
  robots: { index: false, follow: false },
};

/**
 * Her page is her workspace, not a page of the site (9 November 2026, Dan:
 * "does she even need the rest of the site anymore"): one slim blue banner
 * holds her wordmark, which still leads home, and the page's name, in place
 * of the site's header, its booking band and the footer's site links. The
 * tools start in the first screen.
 */
export default function SchedulePage() {
  return (
    <div className="teacher-page">
      <header className="teacher-banner">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Link aria-label="Português com a Inês, home" className="teacher-banner__brand" href="/">
          <BrandWordmark className="header-wordmark teacher-banner__wordmark" tone="cream" />
        </Link>
        <h1 className="teacher-banner__title" id="account-title">Your schedule</h1>
        <AssetMark
          asset="/visuals/v2-splats/booking-availability-splat-v2.svg"
          className="teacher-banner__mark"
          priority
        />
      </header>
      <main className="teacher-main" id="main-content">
        <TeacherSchedule />
      </main>
    </div>
  );
}
