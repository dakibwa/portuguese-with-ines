import type { Metadata } from "next";
import { BookingFlow } from "@/components/BookingFlow";

export const metadata: Metadata = {
  title: "My lessons · Português com a Inês",
  description: "See, change or cancel your booked Portuguese lessons.",
  robots: { index: false, follow: false }
};

/**
 * Kept for old bookmarks. Booking and lesson management now share /book; the
 * client normalises this address without a second navigation or page design.
 */
export default function MyLessonsPage() {
  return <BookingFlow initialView="lessons" />;
}
