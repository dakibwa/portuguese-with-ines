import { GoogleMeetLogo } from "@/components/GoogleMeetLogo";
import type { BookingStatus } from "@/lib/booking-api";

type Props = {
  meetingUrl?: string | null;
  location: "online" | "porto";
  status: BookingStatus;
};

/** Only the Google Meet join URL belongs in a lesson's external action. */
export function meetingHref({ meetingUrl, location, status }: Props) {
  if (location !== "online" || status !== "confirmed" || !meetingUrl) return null;
  let url: URL;
  try {
    url = new URL(meetingUrl);
  } catch {
    return null;
  }
  if (
    url.origin !== "https://meet.google.com" ||
    url.username || url.password ||
    !/^\/[a-z0-9-]+\/?$/i.test(url.pathname)
  ) return null;
  return url.href;
}

/**
 * `compact` is the pill among a row's other actions (an open lesson on
 * Inês's page, 10 November 2026): `Join Meet`, as her next-lesson band says
 * it, still named in full for assistive technology.
 */
export function MeetingLink({ compact = false, ...props }: Props & { compact?: boolean }) {
  const href = meetingHref(props);
  if (!href) return null;

  return (
    <a aria-label={compact ? "Join Google Meet" : undefined} className={`meeting-link${compact ? " meeting-link--compact" : ""}`} href={href} target="_blank" rel="noopener noreferrer">
      {/* Meet's own mark rather than a generic camera (13 October 2026, Dan). */}
      <span className="meeting-link__logo"><GoogleMeetLogo /></span>
      {compact ? "Join Meet" : "Join Google Meet"}
    </a>
  );
}
