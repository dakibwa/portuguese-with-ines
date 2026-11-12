import type { Metadata } from "next";
import "../workspace.css";
// Homework's code waits until it opens, but its styles load here, ahead of
// hers as they always have: a few of its rules and hers tie, and hers win.
import "../homework.css";
import { SiteHeader } from "@/components/SiteHeader";
import { TeacherSchedule } from "@/components/TeacherSchedule";
import "./teacher-schedule.css";

export const metadata: Metadata = {
  title: "Schedule · Português com a Inês",
  description: "Weekly hours and bookings.",
  robots: { index: false, follow: false },
};

/**
 * Her page is her workspace, not a page of the site (9 November 2026, Dan:
 * "does she even need the rest of the site anymore"): an account's one bar
 * (SiteHeader) holds her wordmark, which still leads home, and the page's
 * name, with no menu and no footer of site links. The tools start in the
 * first screen.
 */
export default function SchedulePage() {
  return (
    <div className="teacher-page">
      <SiteHeader bar={{ title: "Your schedule", mark: "/visuals/v2-splats/booking-availability-splat-v2.svg", menu: false }} />
      <main className="teacher-main" id="main-content">
        <TeacherSchedule />
      </main>
    </div>
  );
}
