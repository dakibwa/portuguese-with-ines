import type { Metadata } from "next";
import { BookingFlow } from "@/components/BookingFlow";

export const metadata: Metadata = {
  title: "Your lesson · Português com a Inês",
  description: "Change or cancel your Portuguese lesson.",
  robots: { index: false, follow: false }
};

/**
 * Existing email links point here. They now open the same booking workspace,
 * which immediately keeps the token and normalises the address to /book.
 */
export default function ManageBookingPage() {
  return <BookingFlow initialView="manage" />;
}
