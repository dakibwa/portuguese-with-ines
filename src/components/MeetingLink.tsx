import { Video } from "lucide-react";
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

export function MeetingLink(props: Props) {
  const href = meetingHref(props);
  if (!href) return null;

  return (
    <a className="meeting-link" href={href} target="_blank" rel="noopener noreferrer">
      <Video size={17} aria-hidden="true" />
      Join Google Meet
    </a>
  );
}
