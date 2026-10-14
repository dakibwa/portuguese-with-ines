/**
 * iCalendar generation.
 *
 * This is the whole mechanism behind "it auto-updates for Inês". Rather than
 * holding OAuth access to her Google Calendar — a sensitive scope with a 2-6
 * week verification queue, and 7-day token expiry until it clears — the Worker
 * emails her a real calendar invitation per booking. Gmail adds those to her
 * calendar on arrival, and updates and cancellations land on the same event.
 *
 * Three things make an update land on the existing event rather than creating a
 * duplicate, and all three are easy to get wrong:
 *   - UID is stable for the life of the booking.
 *   - SEQUENCE increases on every change. Clients ignore an update that does not.
 *   - METHOD is REQUEST for a booking or change, CANCEL for a cancellation.
 */

import { isNoEmailYet } from "./no-email.mjs";

const CRLF = "\r\n";

/** RFC 5545 text escaping: backslash first, or it double-escapes the others. */
function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets per RFC 5545. Folding must count UTF-8 bytes, not
 * characters, or a name with an accent — "Inês", every time — can split a
 * multi-byte sequence and corrupt the line.
 */
function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const segments = [];
  let offset = 0;
  let limit = 75;

  while (offset < bytes.length) {
    let take = Math.min(limit, bytes.length - offset);
    // Never cut mid-codepoint: continuation bytes are 10xxxxxx.
    while (take > 1 && (bytes[offset + take] & 0xc0) === 0x80) take -= 1;

    segments.push(decoder.decode(bytes.subarray(offset, offset + take)));
    offset += take;
    limit = 74; // continuation lines carry a leading space
  }

  return segments.join(`${CRLF} `);
}

function icsTimestamp(date) {
  return `${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

/**
 * @param {object} options
 * @param {"REQUEST"|"CANCEL"} options.method
 */
/**
 * One VEVENT. Split out so a run of weekly lessons can be carried by a single
 * calendar file without any of them losing its own identity: each keeps the UID
 * of its own booking, so changing week six later still matches the event
 * already in her calendar and updates it rather than adding a second one.
 */
/**
 * A parameter value, which is not a text value.
 *
 * RFC 5545 3.3.11 escaping — backslash, semicolon, comma, newline — is right
 * for SUMMARY and DESCRIPTION and wrong for `CN=`, where a semicolon starts the
 * next parameter and a colon ends the parameter list. Escaping a name with
 * text rules there let a student's own name forge calendar properties or cut
 * the address off the ATTENDEE line. Section 3.1 says to quote instead.
 */
function escapeParam(value) {
  const clean = String(value ?? "").replace(/[\r\n"]/g, " ");
  return /[;:,]/.test(clean) ? `"${clean}"` : clean;
}

function veventLines({
  method,
  uid,
  sequence,
  summary,
  description,
  location,
  startsAt,
  endsAt,
  organiserName,
  organiserEmail,
  attendees = [],
  url = "",
  now
}) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${icsTimestamp(now)}`,
    `DTSTART:${icsTimestamp(new Date(startsAt))}`,
    `DTEND:${icsTimestamp(new Date(endsAt))}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(location)}`,
    `ORGANIZER;CN=${escapeParam(organiserName)}:mailto:${organiserEmail}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE"
  ];

  if (url) lines.push(`URL:${escapeText(url)}`);

  for (const attendee of attendees.filter((entry) => !isNoEmailYet(entry.email))) {
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${
        method === "CANCEL" ? "DECLINED" : "ACCEPTED"
      };CN=${escapeParam(attendee.name)}:mailto:${attendee.email}`
    );
  }

  // A reminder is only meaningful on a live event.
  if (method !== "CANCEL") {
    lines.push(
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(summary)}`,
      "END:VALARM"
    );
  }

  lines.push("END:VEVENT");
  return lines;
}

function wrapCalendar(method, eventLines) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Portugues com a Ines//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...eventLines,
    "END:VCALENDAR"
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

export function buildCalendarInvite(event) {
  return wrapCalendar(event.method, veventLines({ ...event, now: new Date() }));
}

/**
 * Every lesson in a weekly run, in one file. A student who books twelve weeks
 * should not receive twelve emails, and Inês should not have to accept twelve
 * invitations — but each lesson still has to reach her calendar as its own
 * entry, because that is the whole point of booking the time.
 */
export function buildCalendarSeriesInvite({ method, events }) {
  const now = new Date();
  const body = events.flatMap((event) => veventLines({ ...event, method, now }));
  return wrapCalendar(method, body);
}

/** Stable for the life of the booking, so updates match the original event. */
export function calendarUid(bookingId, domain = "portuguesewithines.com") {
  return `booking-${bookingId}@${domain}`;
}
