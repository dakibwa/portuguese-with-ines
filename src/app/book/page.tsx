import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { preconnect } from "react-dom";
import { BookingFlow } from "@/components/BookingFlow";
import { BOOKING_API_BASE_URL } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: "Booking | Português com a Inês",
  description: "Book a one-to-one Portuguese lesson, online or in person.",
  path: "/book/"
});

/**
 * Ask for the lessons before React exists.
 *
 * The list was fetched from a `useEffect`, so nothing was requested until the
 * whole bundle had downloaded, parsed and hydrated. On a phone on a slow
 * connection that was four seconds of waiting before the request even started,
 * and the request itself takes under half of one. This starts it from the
 * document — in parallel with the JavaScript rather than after it — and parks
 * the promise where the component can pick it up.
 *
 * Deliberately tiny and deliberately total: if anything here throws, or the
 * fetch fails, the component simply does what it always did.
 */
const primeLessonTypes = BOOKING_API_BASE_URL
  ? `try{window.__inesLessonTypes=fetch(${JSON.stringify(
      `${BOOKING_API_BASE_URL}/lesson-types`
    )},{headers:{Accept:"application/json"}}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}catch(e){}`
  : "";

export default function BookPage() {
  // The API is a different origin, so the handshake is otherwise paid for
  // inside the request above rather than alongside the document.
  if (BOOKING_API_BASE_URL) preconnect(new URL(BOOKING_API_BASE_URL).origin, { crossOrigin: "anonymous" });

  return (
    <>
      {primeLessonTypes ? <script dangerouslySetInnerHTML={{ __html: primeLessonTypes }} /> : null}
      <BookingFlow />
    </>
  );
}
