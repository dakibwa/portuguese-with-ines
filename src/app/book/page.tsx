import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { preconnect } from "react-dom";
import { BookingFlow } from "@/components/BookingFlow";
import { BOOKING_API_BASE_URL, BOOKING_TIME_ZONE } from "@/lib/config";

export const metadata: Metadata = pageMetadata({
  title: "Booking | Português com a Inês",
  description: "Book a one-to-one Portuguese lesson, online or in person.",
  path: "/book/"
});

/**
 * Ask for what the first screen needs before React exists.
 *
 * The lessons were fetched from a `useEffect`, so nothing was requested until
 * the whole bundle had downloaded, parsed and hydrated. On a phone on a slow
 * connection that was seconds of waiting before a request even started, and
 * each request takes a fraction of one. This starts them from the document —
 * in parallel with the JavaScript rather than after it — and parks them where
 * the component picks them up:
 *
 * - the lessons on offer, always;
 * - for a stored session, the account, since a signed-in student opens on
 *   their lessons;
 * - otherwise, when the page opens on the booking calendar, its free times for
 *   the lesson it will start from (the trial for a first visit, else a single
 *   lesson or the length the link named), over the same dates the calendar
 *   asks for. The calendar uses this answer only if it asks for exactly that.
 *
 * Deliberately tiny and deliberately total: if anything here throws, or a
 * fetch fails, the component simply does what it always did.
 */
const primeBooking = BOOKING_API_BASE_URL
  ? `try{(function(b,z){var h={Accept:"application/json"};` +
    `window.__inesLessonTypes=fetch(b+"/lesson-types",{headers:h}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});` +
    `var s="",r="";try{s=localStorage.getItem("ines-student-session")||"";r=localStorage.getItem("ines-returning-student")||""}catch(e){}` +
    `if(s){window.__inesMe={token:s,response:fetch(b+"/me",{headers:{Accept:"application/json",Authorization:"Bearer "+s}})};return}` +
    `var q=new URLSearchParams(location.search);` +
    `if(q.get("view")==="lessons"||["manage","token","emailToken","card"].some(function(k){return q.has(k)}))return;` +
    `var l=q.get("lesson"),t=l==="single"||l==="long"?l:r?"single":"trial";` +
    `var d=new Intl.DateTimeFormat("en-CA",{timeZone:z,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),p=d.split("-");` +
    `var u=b+"/availability?"+new URLSearchParams({lessonType:t,from:d,to:new Date(Date.UTC(+p[0],p[1]-1,+p[2]+140)).toISOString().slice(0,10)});` +
    `window.__inesAvailability={url:u,response:fetch(u,{headers:h})}` +
    `})(${JSON.stringify(BOOKING_API_BASE_URL)},${JSON.stringify(BOOKING_TIME_ZONE)})}catch(e){}`
  : "";

export default function BookPage() {
  // The API is a different origin, so the handshake is otherwise paid for
  // inside the request above rather than alongside the document.
  if (BOOKING_API_BASE_URL) preconnect(new URL(BOOKING_API_BASE_URL).origin, { crossOrigin: "anonymous" });

  return (
    <>
      {primeBooking ? <script dangerouslySetInnerHTML={{ __html: primeBooking }} /> : null}
      <BookingFlow />
    </>
  );
}
