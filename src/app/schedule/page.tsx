import type { Metadata } from "next";
import { AccountHero } from "@/components/AccountHero";
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
      <AccountHero
        intro="Your lessons, your hours, your time off."
        mark="/visuals/v2-splats/booking-availability-splat-v2.svg"
        title="Your schedule"
      />
      <main className="teacher-main" id="main-content">
        <TeacherSchedule />
      </main>
      <SiteFooter />
    </div>
  );
}
