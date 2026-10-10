import type { Metadata } from "next";
import { AssetMark } from "@/components/BrandMarks";
import { TeacherSchedule } from "@/components/TeacherSchedule";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./teacher-schedule.css";

export const metadata: Metadata = {
  title: "Schedule · Português com a Inês",
  description: "Weekly hours and bookings.",
  robots: { index: false, follow: false },
};

export default function SchedulePage() {
  return (
    <div className="teacher-page">
      <SiteHeader />
      {/* The booking page's own blue band, so Inês's side reads as the same
          place as her students' (10 October 2026, at Dan's request). */}
      <aside className="booking-intro teacher-intro">
        <h1 id="account-title">
          Your <br />
          <span className="display-second-line">schedule</span>
        </h1>
        <div className="editorial-rule" aria-hidden="true" />
        <AssetMark
          asset="/visuals/v2-splats/booking-availability-splat-v2.svg"
          className="booking-intro__time-window"
          priority
        />
      </aside>
      <main className="teacher-main" id="main-content">
        <TeacherSchedule />
      </main>
      <SiteFooter />
    </div>
  );
}
