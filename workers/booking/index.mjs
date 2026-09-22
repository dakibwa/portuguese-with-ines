import { computeAvailability, isSlotBookable, listLessonTypes, loadLessonType, loadSettings, normaliseBlockedSpans } from "./availability.mjs";
import {
  OPEN_ENDED_HORIZON_WEEKS,
  SERIES_LENGTHS,
  normaliseWeeks,
  occurrenceInstants,
  outstandingFor,
  planOccurrences,
  slotOf
} from "./series.mjs";
import { buildCalendarInvite, buildCalendarSeriesInvite, calendarUid } from "./ics.mjs";
import { deliver } from "./email.mjs";
import {
  chargeSavedCard,
  checkoutSessionProblem,
  createCardSetupSession,
  createCheckoutSession,
  expireCheckoutSession,
  refundPayment,
  retrieveCheckoutSession,
  retrieveRefund,
  retrieveSetupIntent,
  setupSessionProblem,
  stripeConfigured,
  stripeMode,
  stripeProblemIsRetryable,
  stripeReady,
  verifyWebhook
} from "./stripe.mjs";
import {
  PAYMENT_CONSENT_VERSION,
  changePolicy,
  lessonTypeChangeProblem,
  planSeriesCancellation
} from "./policy.mjs";
import { verifyGoogleIdToken } from "./google.mjs";
import {
  createResetToken,
  createSession,
  hashPassword,
  normaliseEmail,
  passwordProblem,
  readResetToken,
  readSession,
  sessionVersion,
  sessionHash,
  verifyPassword
} from "./auth.mjs";
import {
  PORTO,
  addDaysToKey,
  dateKey,
  differingZonedTime,
  formatInZone,
  formatShort,
  isValidTimeZone,
  parseDateKey
} from "./time.mjs";
import { bookingReference, createManageToken, readManageToken, safeEqual } from "./tokens.mjs";
import { findRecurringCode, recurringRates, recurringLessonType, priceForMove, takeRateLimit } from "./rates.mjs";
import { nifProblem, normaliseNif } from "./nif.mjs";
import { formatEuros } from "./money.mjs";
import { bookingSelection, claimSelection } from "./selection.mjs";
import { calendarOwnsTeacherInvites, calendarConnectionStatus, startCalendarConnection, finishCalendarConnection, prepareMeeting, meetingUrl, markMeetingNotified, syncPendingMeetings } from "./meeting-service.mjs";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = String(env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const base = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };

  // Echo the origin only when it is genuinely allowed. Falling back to the
  // first configured origin sends a header that can never match the caller,
  // which the browser reports as a mismatch rather than as "not allowed" —
  // the same confusing error either way, but only one of them is honest.
  return allowed.includes(origin) ? { ...base, "Access-Control-Allow-Origin": origin } : base;
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) }
  });
}

function fail(message, status, request, env) {
  return json({ error: message }, status, request, env);
}

export function bookingPaymentProblem({ paymentRequired, stripeIsReady, paymentConsent }) {
  if (paymentRequired && !stripeIsReady) {
    return {
      status: 503,
      message: "Payment isn't available just now. Please try again in a few minutes, or message Inês."
    };
  }
  if (paymentRequired && paymentConsent !== true) {
    return {
      status: 400,
      message: "Please agree to the saved-card and after-lesson payment terms before booking."
    };
  }
  return null;
}

/**
 * The body as an object, or an empty one.
 *
 * `null`, `7`, `"hi"` and `true` are all valid JSON, so a parse that succeeded
 * was not enough — those went straight into handlers doing `body.notes` and
 * `"repeat" in body`, and a four-byte unauthenticated body turned into a 500.
 */
async function readJson(request) {
  const text = await readBody(request, 32768);
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

async function readBody(request, limit) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw Object.assign(new Error("Request too large."), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function siteUrl(env, path = "") {
  return `${String(env.SITE_URL ?? "https://portuguesewithines.com").replace(/\/+$/, "")}${path}`;
}

/** Every student action now opens inside the one booking workspace. */
function studentManageUrl(env, token) {
  return siteUrl(env, `/book/?manage=${encodeURIComponent(token)}`);
}

/*
 * Deliberately narrower than the RFC. The old pattern allowed quotes, brackets,
 * commas and semicolons in the local part — none of which Resend will send to,
 * and all of which then travelled into the iCalendar ATTENDEE line. Refusing
 * them at registration puts the error in front of the person who can fix it.
 */
function isEmail(value) {
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(
    String(value ?? "").trim()
  );
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Public shape of a booking. Never leaks another student's details. */
function publicBooking(row, lessonType, settings) {
  return {
    reference: row.reference,
    status: row.status,
    lessonType: { id: lessonType.id, name: lessonType.name, durationMinutes: lessonType.duration_minutes, priceCents: row.amount_cents ?? lessonType.price_cents },
    startAt: row.starts_at,
    endAt: row.ends_at,
    location: row.location,
    meetingUrl: meetingUrl(row),
    studentName: row.student_name,
    studentEmail: row.student_email,
    studentTimezone: row.student_timezone,
    notes: row.notes,
    rescheduleCount: row.reschedule_count,
    sameDayFeeCents: settings.sameDayChangeFeeCents,
    sameDayFeeAutomatic: row.payment_status === "scheduled" || row.payment_status === "processing",
    paymentStatus: row.payment_status,
    amountCents: row.amount_cents
  };
}

/** Description lines shared by her calendar entry and the emails. */
function lessonSummary(row, lessonType) {
  return `${lessonType.name} — ${row.student_name}`;
}

function lessonDescription(row, lessonType, manageUrl) {
  const lines = [
    `${lessonType.name} (${lessonType.duration_minutes} minutes)`,
    `Student: ${row.student_name}`,
    `Email: ${row.student_email}`
  ];
  if (row.student_phone) lines.push(`Phone: ${row.student_phone}`);
  if (row.student_timezone && row.student_timezone !== PORTO) lines.push(`Their timezone: ${row.student_timezone}`);
  if (row.notes) lines.push(`Notes: ${row.notes}`);
  if (meetingUrl(row)) lines.push(`Join Google Meet: ${meetingUrl(row)}`);
  lines.push(`Reference: ${row.reference}`);
  if (manageUrl) lines.push(`Manage: ${manageUrl}`);
  return lines.join("\n");
}

function locationLabel(row) {
  return row.location === "porto" ? "In person, Porto" : "Online";
}

export function normaliseLocation(value, fallback = "online") {
  if (value === "porto" || value === "online") return value;
  return fallback === "porto" ? "porto" : "online";
}

/**
 * Development can pause Inês's copies without silencing confirmations,
 * calendar updates, password resets, or other student mail. Her address stays
 * configured because it remains the reply-to address on student messages.
 */
function teacherNotificationsEnabled(env) {
  return env.TEACHER_NOTIFICATIONS_ENABLED !== "0";
}

/**
 * Every student-facing and teacher-facing message for one lifecycle event.
 * Kept in one place so a change to wording cannot drift between the two sides.
 */
async function notify(env, { event, row, lessonType, settings, manageUrl, previousStartsAt, previousLessonType, byTeacher = false }) {
  const notifyingSequence = row.sequence;
  const notifyingStatus = row.status;
  row = await prepareMeeting(env, row).catch(() => row);
  // A newer change owns its own notification; do not send a stale confirmation
  // after a cancellation or move that happened while Google was responding.
  if (row.sequence !== notifyingSequence || row.status !== notifyingStatus) return [];
  lessonType = { ...lessonType, price_cents: row.amount_cents ?? lessonType.price_cents };
  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const replyTo = settings.replyToEmail || teacherEmail || undefined;
  const start = new Date(row.starts_at);

  // "Porto time", in words — the site's own vocabulary. "(WEST)" was accurate
  // but jargon to a student; the your-time line below the hero and the calendar
  // attachment already carry the conversion for anyone in another zone.
  const portoTime = `${formatInZone(start, PORTO)}, Porto time`;
  const studentZone = isValidTimeZone(row.student_timezone) ? row.student_timezone : PORTO;
  // Null unless the student's clock genuinely reads differently from Porto's.
  const studentTime = differingZonedTime(start, studentZone);

  // The date and time is the one thing the reader is looking for, so it is
  // lifted out of the detail table into its own panel rather than being the
  // second row of five.
  const hero = portoTime;
  // Porto time *is* Inês's time, so this note is the student's clock on her
  // copy and their own on theirs. Labelling it "Your time" to her was wrong.
  const studentHeroNote = studentTime ? `${studentTime} — your time` : "";
  const teacherHeroNote = studentTime ? `${studentTime} — the student's time` : "";

  const baseRows = [
    { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
    { label: "Where", value: meetingUrl(row) ? "Join Google Meet" : locationLabel(row), url: meetingUrl(row) },
    { label: "Reference", value: row.reference }
  ];

  // The student's copy also says what it costs and how paying works — the
  // confirmation is the one email everyone reads, and payment shouldn't be a
  // surprise at the door. Not on a cancellation, where a price is just noise,
  // and not on Inês's copy, which would be telling her her own prices.
  // A current booking says when its saved-card charge happens; one from before
  // automatic payment keeps the old pay-in-person terms.
  const isPaid = row.payment_status === "paid";
  const wasRefunded = row.payment_status === "refunded";
  const isOnCard = row.payment_status === "scheduled" || row.payment_status === "payment_due";
  const priceValue = isPaid
    ? `${formatEuros(lessonType.price_cents)} · paid`
    : isOnCard
      ? `${formatEuros(lessonType.price_cents)} · charged to your saved card when the lesson ends`
      : `${formatEuros(lessonType.price_cents)} · pay on the day, in person`;
  const studentRows =
    event === "cancelled"
      ? baseRows
      : [...baseRows.slice(0, 2), { label: "Price", value: priceValue }, ...baseRows.slice(2)];

  const uid = calendarUid(row.id);
  const method = event === "cancelled" ? "CANCEL" : "REQUEST";
  const invite = (attendees) =>
    buildCalendarInvite({
      method,
      uid,
      sequence: row.sequence,
      summary: lessonSummary(row, lessonType),
      description: lessonDescription(row, lessonType, manageUrl),
      location: locationLabel(row),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      organiserName: settings.teacherName,
      organiserEmail: env.MAIL_SENDER_ADDRESS || "bookings@portuguesewithines.com",
      attendees,
      url: manageUrl
    });

  const automaticSameDayFee = row.payment_status === "scheduled" || row.payment_status === "processing";
  const fee = formatEuros(settings.sameDayChangeFeeCents);
  const notice = `${settings.minimumNoticeHours} hours`;
  const sameDayNotice = row.same_day_change
    ? `This change was made less than ${notice} before the lesson, so the ${fee} fee ${
        automaticSameDayFee ? "is charged automatically to your saved card" : "applies"
      }.`
    : "";

  // Subjects carry the date, not the reference: "PT-LS29CT" tells the reader
  // nothing in an inbox list, and the date is what they are scanning for.
  const shortWhen = formatShort(start, PORTO);
  const lessonTypeChanged = Boolean(previousLessonType && previousLessonType.id !== lessonType.id);

  // Older already-paid bookings lock inside the window instead of paying.
  // Current saved-card bookings stay changeable there for EUR 5.
  const paidChangeFooter = `Move or cancel free until ${notice} before the lesson. After that, it can't be changed or refunded.`;
  const savedCardChangeFooter = `Move or cancel free until ${notice} before the lesson. After that, moving or cancelling costs ${fee}. A no-show costs ${fee} instead of the lesson price.`;
  const unpaidChangeFooter = `Need to change it? Use the link above. It's free until ${notice} before the lesson; after that it costs ${fee}.`;
  const refundNote = wasRefunded
    ? `Your ${formatEuros(row.amount_cents ?? lessonType.price_cents)} is on its way back to your card — refunds usually show within a few days.`
    : "";

  const student = {
    booked: {
      subject: `Your Portuguese lesson is booked — ${shortWhen}`,
      heading: "You're booked",
      intro: `Olá ${row.student_name.split(" ")[0]}, your lesson with Inês is ${
        isPaid ? "paid and confirmed" : "confirmed"
      }. A calendar invitation is attached.`,
      callout: "",
      footer: isPaid ? paidChangeFooter : isOnCard ? savedCardChangeFooter : unpaidChangeFooter
    },
    rescheduled: byTeacher
      ? {
          // Written for someone who did not ask for this. The old copy said
          // "that's done", which reads as a confirmation of something you did
          // — a strange thing to receive when Inês moved your lesson.
          subject: `Inês has moved your lesson — now ${shortWhen}`,
          heading: "Inês has moved your lesson",
          intro: `Olá ${row.student_name.split(" ")[0]}, Inês has moved your lesson to the time below. An updated calendar invitation is attached. If the new time doesn't suit, choose another time or reply to this email.`,
          callout: "",
          footer: "No charge for a change she makes."
        }
      : lessonTypeChanged
        ? {
            subject: `Your lesson has changed — ${shortWhen}`,
            heading: "Your lesson has changed",
            intro: `Olá ${row.student_name.split(" ")[0]}, your lesson is now ${lessonType.duration_minutes} minutes at the time below. An updated calendar invitation is attached.`,
            callout: sameDayNotice,
            footer: isPaid ? paidChangeFooter : isOnCard ? savedCardChangeFooter : "You can change or cancel it again from the same link."
          }
        : {
          subject: `Your lesson has moved — ${shortWhen}`,
          heading: "Your lesson has moved",
          intro: `Olá ${row.student_name.split(" ")[0]}, your new lesson time is below. An updated calendar invitation is attached.`,
          callout: sameDayNotice,
          footer: isPaid ? paidChangeFooter : isOnCard ? savedCardChangeFooter : "You can move or cancel it again from the same link."
        },
    cancelled: byTeacher
      ? {
          subject: `Inês has cancelled your lesson on ${shortWhen}`,
          heading: "Inês has cancelled this lesson",
          intro: `Olá ${row.student_name.split(" ")[0]}, Inês has cancelled this lesson. Sorry about that — reply to arrange another time. A cancellation update for your calendar is attached.`,
          callout: refundNote,
          footer: wasRefunded ? "Refunded in full — a cancellation she makes never costs you anything." : "No charge for a cancellation she makes."
        }
      : {
          subject: `Your lesson on ${shortWhen} is cancelled`,
          heading: "Your lesson is cancelled",
          intro: `Olá ${row.student_name.split(" ")[0]}, your lesson has been cancelled and removed from your calendar.`,
          callout: wasRefunded
            ? refundNote
            : row.same_day_change
              ? sameDayNotice
              : isOnCard
                ? "The lesson price will not be charged."
                : "",
          footer: "You're welcome back any time — booking is always open on the website."
        }
  }[event];

  const teacher = {
    booked: {
      subject: `New booking — ${row.student_name}, ${shortWhen}`,
      heading: "New booking",
      // The invitation carries PARTSTAT=ACCEPTED, so there is nothing for her
      // to accept — telling her to was instructing a step that doesn't exist.
      intro: `${row.student_name} has booked a lesson. The attached invitation goes straight into your calendar.`,
      callout: isPaid
        ? `Stripe received ${formatEuros(row.amount_cents ?? lessonType.price_cents)} today. Issue the appropriate Portal das Finanças document for this payment today.`
        : ""
    },
    rescheduled: {
      subject: byTeacher
        ? `You moved ${row.student_name}'s lesson — ${shortWhen}`
        : lessonTypeChanged
          ? `Lesson changed — ${row.student_name}, ${shortWhen}`
          : `${row.same_day_change ? "Late change" : "Lesson moved"} — ${row.student_name}, ${shortWhen}`,
      heading: byTeacher
        ? "You moved this lesson"
        : lessonTypeChanged
          ? "Lesson changed"
          : row.same_day_change
            ? `Moved less than ${notice} before`
            : "Lesson moved",
      intro: byTeacher
        ? `You moved ${row.student_name}'s lesson${
            previousStartsAt ? ` from ${formatInZone(new Date(previousStartsAt), PORTO)}` : ""
          }. They have been told, and your calendar has been updated.`
        : lessonTypeChanged
          ? `${row.student_name} changed their lesson from ${previousLessonType.duration_minutes} to ${lessonType.duration_minutes} minutes${
              previousStartsAt ? ` and moved it from ${formatInZone(new Date(previousStartsAt), PORTO)}` : ""
            }. Your calendar has been updated.`
          : `${row.student_name} moved their lesson${
              previousStartsAt ? ` from ${formatInZone(new Date(previousStartsAt), PORTO)}` : ""
            }. Your calendar has been updated.`,
      callout: row.same_day_change
        ? `This was changed less than ${notice} before the lesson, so the ${fee} fee ${
            automaticSameDayFee ? "is charged automatically to the student's saved card" : "is due"
          }.`
        : ""
    },
    cancelled: {
      subject: byTeacher
        ? `You cancelled ${row.student_name}'s lesson — ${shortWhen}`
        : `${row.same_day_change ? "Late cancellation" : "Cancellation"} — ${row.student_name}, ${shortWhen}`,
      heading: byTeacher ? "You cancelled this lesson" : row.same_day_change ? `Cancelled less than ${notice} before` : "Lesson cancelled",
      intro: byTeacher
        ? `You cancelled ${row.student_name}'s lesson on ${formatInZone(start, PORTO)}. They have been told, and it is off your calendar.`
        : `${row.student_name} cancelled their lesson on ${formatInZone(start, PORTO)}. It has been removed from your calendar.`,
      callout: wasRefunded
        ? `${formatEuros(row.amount_cents ?? lessonType.price_cents)} was refunded automatically — nothing to sort out.`
        : row.same_day_change
          ? `This was cancelled less than ${notice} before the lesson, so the ${fee} fee applies.`
          : ""
    }
  }[event];

  const sends = [
    deliver(env, {
      to: row.student_email,
      subject: student.subject,
      kind: `student_${event}`,
      bookingId: row.id,
      dedupeKey: `student:${event}:${row.id}:${row.sequence}`,
      replyTo,
      calendar: { body: invite([{ name: row.student_name, email: row.student_email }]), method },
      content: {
        heading: student.heading,
        intro: student.intro,
        callout: student.callout,
        hero,
        heroNote: studentHeroNote,
        preheader: `${lessonType.name} · ${portoTime}`,
        rows: studentRows,
        action: manageUrl && event !== "cancelled" ? { label: "Change or cancel this lesson", url: manageUrl } : null,
        footer: student.footer
      }
    }).then(async result => {
      if (result.ok && !result.skipped && event !== "cancelled") await markMeetingNotified(env, row);
      return result;
    })
  ];

  if (teacherNotificationsEnabled(env) && teacherEmail) {
    // Her receipt automation reads these emails, so every copy carries the NIF.
    const nifRow = receiptNifRow(await studentNif(env, row.student_id));
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject: teacher.subject,
        kind: `teacher_${event}`,
        bookingId: row.id,
        dedupeKey: `teacher:${event}:${row.id}:${row.sequence}`,
        replyTo: row.student_email,
        calendar: await calendarOwnsTeacherInvites(env) ? null : { body: invite([{ name: settings.teacherName, email: teacherEmail }]), method },
        content: {
          heading: teacher.heading,
          intro: teacher.intro,
          callout: teacher.callout,
          hero,
          heroNote: teacherHeroNote,
          preheader: `${row.student_name} · ${lessonType.name} · ${portoTime}`,
          rows: [
            ...baseRows,
            { label: "Student", value: `${row.student_name}\n${row.student_email}${row.student_phone ? `\n${row.student_phone}` : ""}` },
            nifRow,
            ...(row.notes ? [{ label: "Notes", value: row.notes }] : [])
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

/** A link that was not ready for the confirmation gets its own short email. */
async function notifyMeetingReady(env, input) {
  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(input.id).first();
  const url = meetingUrl(row);
  if (!url || row.ends_at <= new Date().toISOString()) return false;
  const settings = await loadSettings(env);
  const result = await deliver(env, {
    to: row.student_email, subject: "Your online lesson link", kind: "student_meeting_ready",
    bookingId: row.id, dedupeKey: `student:meeting:${row.id}:${url}`,
    replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail,
    content: {
      heading: "Your online lesson link",
      intro: `Hi ${row.student_name}, here’s the Google Meet link for your lesson with Inês.`,
      hero: `${formatInZone(new Date(row.starts_at), PORTO)}, Porto time`,
      preheader: "Join your lesson from your email or booking.",
      rows: [{ label: "Reference", value: row.reference }],
      action: { label: "Join Google Meet", url },
      footer: "You can also find this link in your booking. See you soon!"
    }
  });
  return result.ok;
}

/**
 * A whole run of lessons, in one email each way.
 *
 * Twelve bookings must not mean twelve emails. The student gets one initial
 * confirmation for the run, while Inês gets one message carrying one calendar
 * file holding every occurrence, each under its own booking's UID. Automatic
 * top-ups are silent for the student because the new lessons already appear in
 * their booking workspace; Inês still needs the top-up attachment to reserve
 * the added time in her external calendar. Changing a single week later goes
 * out through the ordinary per-lesson path and matches that event by UID.
 */
export async function notifySeries(env, { rows, lessonType, settings, series, manageUrls, skipped, reason = "booked" }) {
  lessonType = { ...lessonType, price_cents: rows[0]?.amount_cents ?? lessonType.price_cents };
  if (!rows.length) return [];
  // Bound provider work inside the request. The durable minute sweep finishes
  // larger selections and emails links that were not ready for confirmation.
  const notifyingVersions = new Map(rows.map(row => [row.id, `${row.status}:${row.sequence}`]));
  rows = (await Promise.all(rows.map((row, index) => index < 6 ? prepareMeeting(env, row).catch(() => row) : row)))
    .filter(row => notifyingVersions.get(row.id) === `${row.status}:${row.sequence}`);
  if (!rows.length) return [];

  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const replyTo = settings.replyToEmail || teacherEmail || undefined;
  const first = rows[0];
  const studentZone = isValidTimeZone(first.student_timezone) ? first.student_timezone : PORTO;

  const events = rows.map((row) => ({
    uid: calendarUid(row.id),
    sequence: row.sequence,
    summary: lessonSummary(row, lessonType),
    description: lessonDescription(row, lessonType, manageUrls[row.id] ?? ""),
    location: locationLabel(row),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    organiserName: settings.teacherName,
    organiserEmail: env.MAIL_SENDER_ADDRESS || "bookings@portuguesewithines.com",
    url: manageUrls[row.id] ?? ""
  }));

  const invite = (attendee) =>
    buildCalendarSeriesInvite({
      method: "REQUEST",
      events: events.map((event) => ({ ...event, attendees: [attendee] }))
    });

  const dateLines = rows
    .map((row) => formatInZone(new Date(row.starts_at), PORTO))
    .join("\n");

  const cadence = series.occurrences ? `${rows.length} lessons` : "Every week, until you stop it";
  const multipleWeeklyTimes = (series.weeklyTimes ?? 1) > 1;
  const weeklyTimeCopy = multipleWeeklyTimes ? "both times are" : "the same time is";
  const skippedNote = skipped.length
    ? `${
        skipped.length === 1
          ? "One lesson time was not free and was left out:"
          : `${skipped.length} lesson times were not free and were left out:`
      } ${skipped.map((entry) => formatShort(new Date(entry.startAt), PORTO)).join(", ")}.`
    : "";

  const rowsForBoth = [
    { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
    { label: "Where", value: locationLabel(first) },
    { label: series.oneOff ? "Booking" : "Repeats", value: cadence },
    ...(rows.some(row => meetingUrl(row))
      ? rows.map(row => ({ label: formatShort(new Date(row.starts_at), PORTO),
          value: meetingUrl(row) ? "Join Google Meet" : (row.location === "online" ? "Online link will appear in your booking" : locationLabel(row)), url: meetingUrl(row) }))
      : [{ label: "Dates", value: dateLines }])
  ];

  // Price on the student's copy only, per lesson — Inês doesn't need her own
  // prices repeated to her. Current runs charge each lesson separately when
  // it ends; an older run keeps the pay-on-the-day terms it was booked under.
  const seriesOnCard = rows.some((row) => row.payment_status === "paid" || row.payment_status === "scheduled");
  const studentSeriesRows = [
    ...rowsForBoth.slice(0, 2),
    {
      label: "Price",
      value: seriesOnCard
        ? `${formatEuros(lessonType.price_cents)} a lesson · charged to your saved card when each lesson ends`
        : `${formatEuros(lessonType.price_cents)} a lesson · pay on the day, in person`
    },
    ...rowsForBoth.slice(2)
  ];
  const seriesFee = formatEuros(settings.sameDayChangeFeeCents);
  const seriesFooter = seriesOnCard
    ? `Move or cancel any single lesson free until ${settings.minimumNoticeHours} hours before it. After that, moving or cancelling costs ${seriesFee}. If Inês records a no-show before the lesson ends, only ${seriesFee} is charged instead of the lesson price.`
    : `Moving or cancelling a lesson is free until ${settings.minimumNoticeHours} hours before it; after that it costs ${seriesFee}.`;
  const moved = reason === "moved";

  const sends = [];

  // An open-ended run is topped up automatically, normally one lesson each
  // week. Those lessons are already visible in the unified booking calendar;
  // emailing the student on every top-up would turn one booking into a weekly
  // stream of confirmations. A move, cancellation or payment remains a real
  // lifecycle event and continues through its own notification path.
  if (reason !== "extended") {
    sends.push(
      deliver(env, {
        to: first.student_email,
        subject: moved
          ? `Your weekly Portuguese lessons have moved — from ${formatShort(new Date(first.starts_at), PORTO)}`
          : `Your ${series.oneOff ? "" : "weekly "}Portuguese lessons are booked — from ${formatShort(new Date(first.starts_at), PORTO)}`,
        kind: moved ? "student_series_moved" : "student_series_booked",
        bookingId: first.id,
        dedupeKey: moved
          ? `student:series-moved:${series.id}:${first.sequence}`
          : `student:series:${series.id}:${rows[0].id}`,
        replyTo,
        calendar: { body: invite({ name: first.student_name, email: first.student_email }), method: "REQUEST" },
        content: {
          heading: moved ? "Your weekly lessons have moved" : series.oneOff ? "Your lessons are booked" : multipleWeeklyTimes ? "Your weekly times are booked" : "Your weekly slot is booked",
          intro: moved
            ? `Olá ${first.student_name.split(" ")[0]}, your upcoming weekly lessons now use this new time. The updated dates are in the calendar attachment, and you can still manage any one lesson from your lesson calendar.`
            : series.oneOff
              ? `Olá ${first.student_name.split(" ")[0]}, your selected lessons are booked. Every date is in the calendar attachment, and you can move or cancel each lesson from your lesson calendar.`
              : series.occurrences
                ? `Olá ${first.student_name.split(" ")[0]}, ${weeklyTimeCopy} now held for you each week. Every lesson is in the calendar attachment, and you can move or cancel any one of them on your lesson calendar.`
                : `Olá ${first.student_name.split(" ")[0]}, ${weeklyTimeCopy} now held for you each week. Your current lessons are in the calendar attachment, and new weeks will appear automatically on your lesson calendar without extra confirmation emails.`,
          callout: skippedNote,
          hero: `${formatInZone(new Date(first.starts_at), PORTO)}, Porto time`,
          heroNote: differingZonedTime(new Date(first.starts_at), studentZone) ? `${differingZonedTime(new Date(first.starts_at), studentZone)} — your time` : "",
          preheader: `${lessonType.name} · ${cadence}`,
          rows: studentSeriesRows,
          action: { label: "See all your lessons", url: siteUrl(env, "/book/?view=lessons") },
          footer: seriesFooter
        }
      }).then(async result => {
        if (result.ok && !result.skipped) await Promise.all(rows.map(row => markMeetingNotified(env, row)));
        return result;
      })
    );
  }

  if (teacherNotificationsEnabled(env) && teacherEmail) {
    const nifRow = receiptNifRow(await studentNif(env, first.student_id));
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject:
          reason === "extended"
            ? `Weekly slot extended — ${first.student_name}, to ${formatShort(new Date(rows[rows.length - 1].starts_at), PORTO)}`
            : moved
              ? `Weekly slot moved — ${first.student_name}, from ${formatShort(new Date(first.starts_at), PORTO)}`
            : `${series.oneOff ? "Lesson bookings" : "Weekly booking"} — ${first.student_name}, from ${formatShort(new Date(first.starts_at), PORTO)}`,
        kind: reason === "extended" ? "teacher_series_extended" : moved ? "teacher_series_moved" : "teacher_series_booked",
        bookingId: first.id,
        dedupeKey: moved
          ? `teacher:series-moved:${series.id}:${first.sequence}`
          : `teacher:series:${series.id}:${rows[0].id}`,
        replyTo: first.student_email,
        calendar: await calendarOwnsTeacherInvites(env) ? null : { body: invite({ name: settings.teacherName, email: teacherEmail }), method: "REQUEST" },
        content: {
          heading: reason === "extended" ? "A weekly slot was extended" : moved ? "A weekly slot was moved" : series.oneOff ? "Lessons were booked" : multipleWeeklyTimes ? "Two weekly times were booked" : "A weekly slot was booked",
          intro:
            reason === "extended"
              ? `${first.student_name}'s open-ended weekly slot has been carried forward. The new lessons will appear in your calendar.`
              : moved
                ? `${first.student_name}'s upcoming weekly lessons have moved. The updated events will appear in your calendar.`
              : `${first.student_name} booked ${series.oneOff ? "these individual lessons" : multipleWeeklyTimes ? "two times each week" : "the same slot each week"}. Every lesson will appear in your calendar.`,
          callout:
            skippedNote,
          hero: `${formatInZone(new Date(first.starts_at), PORTO)}, Porto time`,
          heroNote: "",
          preheader: `${first.student_name} · ${cadence}`,
          rows: [
            ...rowsForBoth,
            { label: "Student", value: `${first.student_name}\n${first.student_email}${first.student_phone ? `\n${first.student_phone}` : ""}` },
            nifRow,
            ...(first.notes ? [{ label: "Notes", value: first.notes }] : [])
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

/**
 * Claim a time, or find out someone else already has.
 *
 * Availability is checked before this, but a check and a separate insert are
 * two statements, and between them another request can pass the same check.
 * Under load that is not theoretical: four different students were confirmed
 * into one lesson in testing. So the decision and the write are one statement,
 * and SQLite settles it — a row is written only if nothing overlapping exists,
 * and zero rows affected means somebody won the race.
 *
 * Overlap, not equality: her lessons are 60 and 90 minutes on a 30-minute grid,
 * so a 90-minute lesson at 17:00 and a 60-minute one at 17:30 collide while
 * starting at different times. A unique index on the start time would miss it.
 */
async function claimSlot(env, { columns, values, startAt, endAt, studentId = null }) {
  const placeholders = columns.map(() => "?").join(", ");
  const seriesId = values[columns.indexOf("series_id")] ?? null;
  // A pending setup reserves its slot for everyone, including its owner.
  // Ignoring one's own hold allowed two setup webhooks to confirm overlapping
  // lessons. Expired holds do not block a fresh atomic claim.
  const result = await env.DB.prepare(
    `INSERT INTO bookings (${columns.join(", ")})
     SELECT ${placeholders}
     WHERE NOT EXISTS (
       SELECT 1 FROM bookings
       WHERE (status = 'confirmed' OR (status = 'pending_payment' AND hold_expires_at > ?))
         AND starts_at < ?
         AND ends_at > ?
     ) AND (? != 'trial' OR ? IS NULL OR NOT EXISTS (
       SELECT 1 FROM bookings prior WHERE prior.student_id = ? AND prior.status != 'cancelled'
     )) AND (? IS NULL OR EXISTS (SELECT 1 FROM booking_series WHERE id = ? AND status = 'active'))`
  )
    .bind(...values, new Date().toISOString(), endAt, startAt, values[columns.indexOf("lesson_type_id")], studentId, studentId, seriesId, seriesId)
    .run();

  return (result?.meta?.changes ?? 0) > 0;
}

/**
 * A whole run cancelled, in one email each way.
 *
 * Stopping an open-ended series used to call notify() per lesson, so twelve
 * occurrences meant twenty-four requests to the mail provider in the same
 * instant — most of which its rate limit drops on the floor, silently. One
 * message carries one calendar file cancelling every occurrence, each under its
 * own booking's UID with its own incremented SEQUENCE, which is what a calendar
 * needs to remove them.
 */
async function notifySeriesCancelled(env, { rows, lessonType, settings }) {
  if (!rows.length) return [];

  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const replyTo = settings.replyToEmail || teacherEmail || undefined;
  const first = rows[0];

  const events = rows.map((row) => ({
    uid: calendarUid(row.id),
    sequence: row.sequence,
    summary: lessonSummary(row, lessonType),
    description: lessonDescription(row, lessonType, ""),
    location: locationLabel(row),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    organiserName: settings.teacherName,
    organiserEmail: env.MAIL_SENDER_ADDRESS || "bookings@portuguesewithines.com"
  }));

  const invite = (attendee) =>
    buildCalendarSeriesInvite({ method: "CANCEL", events: events.map((event) => ({ ...event, attendees: [attendee] })) });

  const dates = rows.map((row) => formatInZone(new Date(row.starts_at), PORTO)).join("\n");
  const count = `${rows.length} ${rows.length === 1 ? "lesson" : "lessons"}`;

  const sends = [
    deliver(env, {
      to: first.student_email,
      subject: `Your weekly lessons are cancelled — ${count}`,
      kind: "student_series_cancelled",
      bookingId: first.id,
      dedupeKey: `student:series-cancel:${first.id}:${rows.length}`,
      replyTo,
      calendar: { body: invite({ name: first.student_name, email: first.student_email }), method: "CANCEL" },
      content: {
        heading: "Your weekly lessons are cancelled",
        preheader: `${count} removed from your calendar.`,
        intro: `Olá ${first.student_name.split(" ")[0]}, the rest of your weekly run has been cancelled and removed from your calendar. You're welcome back any time — booking is always open on the website.`,
        callout: "",
        hero: "",
        heroNote: "",
        rows: [{ label: "Cancelled", value: dates }],
        action: null,
        footer: "Booking is always open on portuguesewithines.com."
      }
    })
  ];

  if (teacherNotificationsEnabled(env) && teacherEmail) {
    const nifRow = receiptNifRow(await studentNif(env, first.student_id));
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject: `Weekly run cancelled — ${first.student_name}, ${count}`,
        kind: "teacher_series_cancelled",
        bookingId: first.id,
        dedupeKey: `teacher:series-cancel:${first.id}:${rows.length}`,
        replyTo: first.student_email,
        calendar: await calendarOwnsTeacherInvites(env) ? null : { body: invite({ name: settings.teacherName, email: teacherEmail }), method: "CANCEL" },
        content: {
          heading: "A weekly run was cancelled",
          preheader: `${first.student_name} · ${count}`,
          intro: `${first.student_name} cancelled the rest of their weekly lessons. They are off your calendar.`,
          callout: "",
          hero: "",
          heroNote: "",
          rows: [
            { label: "Student", value: `${first.student_name}\n${first.student_email}` },
            nifRow,
            { label: "Cancelled", value: dates }
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

/** The signed-in student, or null. */
async function currentStudent(request, env) {
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return null;

  const studentId = await readSession(bearer, env.BOOKING_TOKEN_SECRET);
  if (!studentId) return null;

  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(studentId).first();
  if (!student || sessionVersion(bearer) !== (student.session_version ?? 0)) return null;
  const revoked = await env.DB.prepare("SELECT token_hash FROM revoked_sessions WHERE token_hash = ?")
    .bind(await sessionHash(bearer)).first();
  return revoked ? null : student;
}

function publicStudent(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    nif: row.nif ?? "",
    timezone: row.timezone,
    role: row.role ?? "student"
  };
}

/**
 * Throttles guessing without letting an attacker lock a real student out: the
 * window is short and keyed on recent failures only.
 */
async function tooManyFailures(env, email) {
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE email = ? AND at > ?")
    .bind(email, since)
    .first();
  return (row?.count ?? 0) >= 8;
}

async function recordFailure(env, email) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO login_attempts (email, at) VALUES (?, ?)").bind(email, now),
    env.DB.prepare("DELETE FROM login_attempts WHERE at < ?").bind(new Date(Date.now() - 86400000).toISOString())
  ]);
}

async function getBookingByToken(env, token) {
  const bookingId = await readManageToken(token, env.BOOKING_TOKEN_SECRET);
  if (!bookingId) return null;
  return env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
}

const worker = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (!env.DB) return fail("The booking database is not bound to this Worker.", 500, request, env);
      if (!env.BOOKING_TOKEN_SECRET) return fail("The booking service is not fully configured.", 500, request, env);

      if (request.method === "POST" && path !== "/stripe/webhook") {
        const origin = request.headers.get("Origin");
        const allowed = String(env.ALLOWED_ORIGIN ?? "").split(",").map((value) => value.trim());
        if (origin && !allowed.includes(origin)) return fail("This origin is not allowed.", 403, request, env);
        if (request.headers.get("Sec-Fetch-Site") === "cross-site" && !origin) return fail("Origin required.", 403, request, env);
        if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
          return fail("Send a JSON request.", 415, request, env);
        }
        if (Number(request.headers.get("Content-Length") || 0) > 32768) return fail("Request too large.", 413, request, env);
        // Cloudflare supplies this trusted edge header. It cannot be replaced
        // with an arbitrary body/email key to bypass unauthenticated limits.
        const ip = request.headers.get("CF-Connecting-IP") || "local";
        if (path.startsWith("/auth/") && !await takeRateLimit(env, `auth:${ip}`, 40)) {
          return fail("Too many attempts. Please wait 15 minutes.", 429, request, env);
        }
      }

      /*
       * `await`, not a bare return. The catch below exists to turn any handler
       * failure into a tidy JSON 500, and it never fired: returning a promise
       * from inside a try block does not route its rejection there, because the
       * function has already returned by the time it rejects.
       */
      if (request.method === "GET" && path === "/health") return await handleHealth(request, env);
      if (request.method === "GET" && path === "/google-calendar/callback") {
        const result = await finishCalendarConnection(env, url);
        return new Response(null, { status: 303, headers: {
          Location: siteUrl(env, `/schedule/?meet=${result}`), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"
        } });
      }
      if (request.method === "GET" && path === "/lesson-types") {
        // The page adapts without a rebuild when saved-card charging is enabled.
        const settings = await loadSettings(env);
        return json(
          {
            lessonTypes: await listLessonTypes(env),
            paymentMode: settings.paymentMode,
            postpay: settings.paymentMode === "postpay" && stripeReady(env),
            paymentReady: settings.paymentMode !== "postpay" || stripeReady(env)
          },
          200,
          request,
          env
        );
      }
      if (request.method === "GET" && path === "/availability") return await handleAvailability(request, env, url);

      if (request.method === "POST" && path === "/stripe/webhook") return await handleStripeWebhook(request, env, ctx);

      if (request.method === "POST" && path === "/auth/register") return await handleRegister(request, env);
      if (request.method === "POST" && path === "/auth/login") return await handleLogin(request, env);
      if (request.method === "POST" && path === "/auth/google") return await handleGoogleSignIn(request, env);
      if (request.method === "POST" && path === "/auth/forgot") return await handleForgot(request, env, ctx);
      if (request.method === "POST" && path === "/auth/reset") return await handleReset(request, env);
      if (request.method === "POST" && path === "/auth/logout") {
        const student = await currentStudent(request, env);
        if (!student) return json({ ok: true }, 200, request, env);
        const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
        await env.DB.prepare("INSERT OR IGNORE INTO revoked_sessions (token_hash, expires_at) VALUES (?, ?)")
          .bind(await sessionHash(bearer), Number(bearer.split(".")[1])).run();
        return json({ ok: true }, 200, request, env);
      }
      if (request.method === "GET" && path === "/me") return await handleMe(request, env);
      if (path === "/me/recurring-rates" && ["GET", "POST"].includes(request.method)) {
        return await handleRecurringRates(request, env);
      }
      if (request.method === "POST" && path === "/me") return await handleUpdateMe(request, env);
      if (request.method === "POST" && path === "/me/email") return await handleRequestEmailChange(request, env, ctx);
      if (request.method === "POST" && path === "/me/email/confirm") return await handleConfirmEmailChange(request, env);

      // Preview before commit: a student is told which weeks are free, and
      // which are not, before anything is booked in their name.
      if (request.method === "POST" && path === "/bookings/series/preview") {
        return await handleSeriesPreview(request, env);
      }

      if (request.method === "POST" && path === "/bookings") return await handleCreate(request, env, ctx);

      const stopSeries = path.match(/^\/series\/([^/]+)\/stop$/);
      if (stopSeries && request.method === "POST") return await handleStopSeries(request, env, ctx, stopSeries[1]);

      const rescheduleSeries = path.match(/^\/series\/([^/]+)\/reschedule$/);
      if (rescheduleSeries && request.method === "POST") {
        return await handleRescheduleSeries(request, env, ctx, rescheduleSeries[1]);
      }

      const manage = path.match(/^\/bookings\/([^/]+)$/);
      if (manage && request.method === "GET") return await handleGetBooking(request, env, manage[1]);

      const reschedule = path.match(/^\/bookings\/([^/]+)\/reschedule$/);
      if (reschedule && request.method === "POST") return await handleReschedule(request, env, ctx, reschedule[1]);

      const cancel = path.match(/^\/bookings\/([^/]+)\/cancel$/);
      if (cancel && request.method === "POST") return await handleCancel(request, env, ctx, cancel[1]);

      const payment = path.match(/^\/bookings\/([^/]+)\/payment$/);
      if (payment && request.method === "POST") return await handlePaymentRecovery(request, env, payment[1]);

      if (path.startsWith("/admin/")) return await handleAdmin(request, env, ctx, url, path);

      return fail("Not found.", 404, request, env);
    } catch (error) {
      if (error?.status === 413) return fail("Request too large.", 413, request, env);
      console.error("booking-worker", error?.stack ?? String(error));
      return fail("Something went wrong handling that request.", 500, request, env);
    }
  },

  /**
   * Nightly: pull every open-ended series forward so a student always has a run
   * of lessons in front of them and Inês's calendar is blocked that far ahead.
   *
   * Deliberately not done on a page view. Her calendar has to be right whether
   * or not anyone has opened the site, and a read path that quietly writes
   * bookings is the kind of thing that is impossible to reason about later.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(chargeDueLessons(env));
    ctx.waitUntil(chargeDueSameDayFees(env));
    ctx.waitUntil(retryPaymentRecovery(env));
    ctx.waitUntil(retryRefunds(env));
    ctx.waitUntil(resendFailedEmails(env));
    ctx.waitUntil(syncPendingMeetings(env, row => notifyMeetingReady(env, row)));

    // The account has a finite trigger allowance. One per-minute trigger owns
    // prompt money work, and only its 03:10 UTC tick runs the larger nightly
    // calendar extension query.
    const scheduledAt = new Date(event?.scheduledTime ?? Date.now());
    if (!event?.cron || (scheduledAt.getUTCHours() === 3 && scheduledAt.getUTCMinutes() === 10)) {
      ctx.waitUntil(topUpOpenSeries(env));
      ctx.waitUntil(env.DB.batch([
        env.DB.prepare("DELETE FROM request_limits WHERE window < ?").bind(Math.floor(Date.now() / 900000) - 96),
        env.DB.prepare("DELETE FROM revoked_sessions WHERE expires_at < ?").bind(Date.now())
      ]));
    }
  }
};

/**
 * Charge only after the scheduled lesson end instant. All instants are stored
 * in UTC after being resolved from Porto wall-clock time, so a 17:00–18:00
 * lesson is due at 18:00 Porto time across both winter and summer time.
 *
 * A decline is a fact of card networks, not an exception: the lesson stays
 * confirmed, the student gets a pay-now link, Inês gets a note, and the row
 * is marked 'payment_due' so it is never charged twice.
 */
export async function chargeDueLessons(env, now = new Date()) {
  const settings = await loadSettings(env);
  if (settings.paymentMode !== "postpay" || !stripeReady(env)) return;

  const nowIso = now.toISOString();
  const staleProcessing = new Date(now.getTime() - 10 * 60000).toISOString();
  const retryCutoff = new Date(now.getTime() - 23 * 3600000).toISOString();
  const unresolved = await env.DB.prepare("SELECT COUNT(*) AS count FROM bookings WHERE payment_status = 'processing' AND (charge_started_at IS NULL OR charge_started_at < ?)").bind(retryCutoff).first();
  if (unresolved?.count) console.warn("payment-manual-reconciliation-required", "lesson", unresolved.count);
  const { results } = await env.DB.prepare(
    `SELECT * FROM bookings
     WHERE status = 'confirmed' AND ends_at <= ?
       AND NOT EXISTS (SELECT 1 FROM booking_refunds WHERE booking_id = bookings.id AND status = 'pending')
       AND (payment_status = 'scheduled' OR (payment_status = 'processing' AND updated_at < ? AND charge_started_at >= ?))
     ORDER BY ends_at LIMIT 50`
  )
    .bind(nowIso, staleProcessing, retryCutoff)
    .all();

  for (const row of results ?? []) {
    try {
      // Claims the charge before reading the no-show flag. The admin route can
      // only change that flag while payment_status is still scheduled, so the
      // full-price/no-show decision cannot race the PaymentIntent.
      const claimed = await env.DB.prepare(
        `UPDATE bookings SET payment_status = 'processing', updated_at = ?, charge_started_at = COALESCE(charge_started_at, ?)
         WHERE id = ? AND status = 'confirmed' AND ends_at <= ?
           AND NOT EXISTS (SELECT 1 FROM booking_refunds WHERE booking_id = bookings.id AND status = 'pending')
           AND (payment_status = 'scheduled' OR (payment_status = 'processing' AND updated_at < ? AND charge_started_at >= ?))`
      )
        .bind(nowIso, nowIso, row.id, nowIso, staleProcessing, new Date(now.getTime() - 23 * 3600000).toISOString())
        .run();
      if ((claimed?.meta?.changes ?? 0) === 0) continue;

      const due = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(row.student_id).first();
      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
        .bind(row.lesson_type_id)
        .first();
      if (!due || !student || !lessonType) continue;

      const { noShow, amountCents: plannedAmount, purpose } = lessonChargePlan(due, lessonType, settings);
      const candidate = {
        bookingId: due.id, purpose, customer: student.stripe_customer_id,
        paymentMethod: student.stripe_payment_method, amountCents: plannedAmount,
        description: `${noShow ? "No-show fee" : lessonType.name} · ${due.reference}`,
        metadata: { booking_reference: due.reference, charge_reason: noShow ? "no_show" : "lesson" }
      };
      await env.DB.prepare("UPDATE bookings SET charge_request = COALESCE(charge_request, ?) WHERE id = ?").bind(JSON.stringify(candidate), due.id).run();
      const storedRequest = await env.DB.prepare("SELECT charge_request FROM bookings WHERE id = ?").bind(due.id).first();
      const chargeRequest = JSON.parse(storedRequest.charge_request);
      const amountCents = chargeRequest.amountCents;

      if (chargeRequest.customer && chargeRequest.paymentMethod) {
        try {
          const intent = await chargeSavedCard(env, chargeRequest);

          await env.DB.prepare(
            `UPDATE bookings SET payment_status = 'paid', stripe_payment_intent = ?, charged_cents = ?, updated_at = ?
             WHERE id = ? AND payment_status = 'processing'`
          )
            .bind(intent.id ?? null, amountCents, new Date().toISOString(), due.id)
            .run();

          await notifyLessonCharged(env, { row: due, lessonType, amountCents, noShow });
          continue;
        } catch (error) {
          console.error("auto-charge", due.reference, String(error?.message ?? error));
          if (stripeProblemIsRetryable(error)) {
            // Leave the claim in `processing`. The stale-claim sweep retries
            // the same idempotency key, so an ambiguous network result can
            // never turn into a second, hosted payment.
            continue;
          }
        }
      }

      await env.DB.prepare(
        "UPDATE bookings SET payment_status = 'payment_due', stripe_session_id = NULL, charged_cents = ?, updated_at = ? WHERE id = ?"
      )
        .bind(amountCents, new Date().toISOString(), due.id)
        .run();
      await notifyPaymentDue(env, {
        row: { ...due, stripe_session_id: null },
        lessonType,
        amountCents,
        purpose: noShow ? "no-show" : "lesson"
      });
    } catch (error) {
      console.error("charge-due", row.reference, String(error?.message ?? error));
    }
  }
}

/** Pure money decision shared with tests; the database claim happens first. */
export function lessonChargePlan(row, lessonType, settings) {
  const noShow = row.attendance_status === "no_show";
  return {
    noShow,
    amountCents: noShow ? settings.sameDayChangeFeeCents : (row.amount_cents ?? lessonType.price_cents),
    purpose: noShow ? "no-show" : "lesson"
  };
}

export function noShowProblem(row, now = new Date()) {
  if (row.status !== "confirmed") return "Only a confirmed lesson can be marked as a no-show.";
  if (row.payment_status !== "scheduled") {
    return "That lesson's payment has already started, so its attendance can no longer be changed.";
  }
  if (now < new Date(row.starts_at)) return "Wait until the lesson starts before marking a no-show.";
  if (now >= new Date(row.ends_at)) return "That lesson has ended and its payment is already being processed.";
  return "";
}

/** Attempt the one same-day action fee recorded on a booking. */
async function chargeOneSameDayFee(env, bookingId, now = new Date()) {
  const settings = await loadSettings(env);
  if (settings.paymentMode !== "postpay" || !stripeReady(env)) return "not_ready";

  const nowIso = now.toISOString();
  const staleProcessing = new Date(now.getTime() - 10 * 60000).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE bookings SET same_day_fee_status = 'processing', updated_at = ?, same_day_fee_started_at = COALESCE(same_day_fee_started_at, ?)
     WHERE id = ? AND (same_day_fee_status = 'scheduled'
       OR (same_day_fee_status = 'processing' AND updated_at < ? AND same_day_fee_started_at >= ?))`
  )
    .bind(nowIso, nowIso, bookingId, staleProcessing, new Date(now.getTime() - 23 * 3600000).toISOString())
    .run();
  if ((claimed?.meta?.changes ?? 0) === 0) return "unchanged";

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
  const student = row
    ? await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(row.student_id).first()
    : null;
  const lessonType = row
    ? await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first()
    : null;
  if (!row || !student || !lessonType) return "missing";

  const candidate = {
    bookingId: row.id, purpose: "same-day-fee", customer: student.stripe_customer_id,
    paymentMethod: student.stripe_payment_method,
    amountCents: row.same_day_fee_cents ?? settings.sameDayChangeFeeCents,
    description: `Late lesson change fee · ${row.reference}`,
    metadata: { booking_reference: row.reference, charge_reason: "same_day_change" }
  };
  await env.DB.prepare("UPDATE bookings SET same_day_fee_request = COALESCE(same_day_fee_request, ?) WHERE id = ?").bind(JSON.stringify(candidate), row.id).run();
  const storedRequest = await env.DB.prepare("SELECT same_day_fee_request FROM bookings WHERE id = ?").bind(row.id).first();
  const chargeRequest = JSON.parse(storedRequest.same_day_fee_request);
  const amountCents = chargeRequest.amountCents;
  try {
    if (!chargeRequest.customer || !chargeRequest.paymentMethod) {
      const error = new Error("No saved card");
      error.stripeStatus = 400; // This immutable request never reached Stripe.
      throw error;
    }
    const intent = await chargeSavedCard(env, chargeRequest);
    await env.DB.prepare(
      `UPDATE bookings SET same_day_fee_status = 'paid', same_day_fee_payment_intent = ?, updated_at = ?
       WHERE id = ? AND same_day_fee_status = 'processing'`
    )
      .bind(intent.id ?? null, new Date().toISOString(), row.id)
      .run();
    await notifySameDayFeeCharged(env, { row, lessonType, amountCents });
    return "paid";
  } catch (error) {
    console.error("same-day-charge", row.reference, String(error?.message ?? error));
    if (stripeProblemIsRetryable(error)) return "retrying";
    await env.DB.prepare("UPDATE bookings SET same_day_fee_status = 'payment_due', same_day_fee_session_id = NULL, updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), row.id)
      .run();
    await notifyPaymentDue(env, { row, lessonType, amountCents, purpose: "same-day-fee" });
    return "payment_due";
  }
}

export async function chargeDueSameDayFees(env, now = new Date()) {
  const staleProcessing = new Date(now.getTime() - 10 * 60000).toISOString();
  const retryCutoff = new Date(now.getTime() - 23 * 3600000).toISOString();
  const unresolved = await env.DB.prepare("SELECT COUNT(*) AS count FROM bookings WHERE same_day_fee_status = 'processing' AND (same_day_fee_started_at IS NULL OR same_day_fee_started_at < ?)").bind(retryCutoff).first();
  if (unresolved?.count) console.warn("payment-manual-reconciliation-required", "same-day-fee", unresolved.count);
  const { results } = await env.DB.prepare(
    `SELECT id FROM bookings
     WHERE same_day_fee_status = 'scheduled'
        OR (same_day_fee_status = 'processing' AND updated_at < ? AND same_day_fee_started_at >= ?)
     ORDER BY updated_at LIMIT 50`
  )
    .bind(staleProcessing, retryCutoff)
    .all();
  for (const row of results ?? []) await chargeOneSameDayFee(env, row.id, now);
}

/**
 * The student's NIF for the fiscal document, or "" for none. Read at payment
 * time, so the document carries the NIF the student had then.
 */
async function studentNif(env, studentId) {
  if (!studentId) return "";
  const student = await env.DB.prepare("SELECT nif FROM students WHERE id = ?").bind(studentId).first();
  return student?.nif ?? "";
}

/** The row beside every reminder to issue a fiscal document. */
function receiptNifRow(nif) {
  return { label: "NIF", value: nif || "Not given (consumidor final)" };
}

async function notifyLessonCharged(env, { row, lessonType, amountCents, noShow = false }) {
  const settings = await loadSettings(env);
  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const start = new Date(row.starts_at);
  const amount = formatEuros(amountCents);
  const heading = noShow ? "Your no-show fee is paid" : "Your lesson is paid";
  const nif = await studentNif(env, row.student_id);

  const sends = [
    deliver(env, {
      to: row.student_email,
      subject: `${heading} — ${formatShort(start, PORTO)}`,
      kind: "student_lesson_charged",
      bookingId: row.id,
      dedupeKey: `charged:${row.id}`,
      replyTo: settings.replyToEmail || teacherEmail || undefined,
      content: {
        heading,
        preheader: `${lessonType.name} · ${amount} charged to your saved card`,
        intro: noShow
          ? `Olá ${row.student_name.split(" ")[0]}, Inês marked this lesson as a no-show. Your saved card was charged ${amount} instead of the lesson price.`
          : `Olá ${row.student_name.split(" ")[0]}, your lesson is finished. ${amount} was charged to your saved card.`,
        callout: "",
        rows: [
          { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
          { label: "Reference", value: row.reference },
          // Lets the student check the number before Inês issues the receipt.
          ...(nif ? [{ label: "NIF", value: `${nif} · on your receipt from Inês` }] : [])
        ],
        action: null,
        footer: "Sent automatically by the booking system on portuguesewithines.com."
      }
    })
  ];

  if (teacherEmail) {
    const nifRow = receiptNifRow(nif);
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject: `Payment received — ${row.student_name}, ${formatShort(start, PORTO)}`,
        kind: "teacher_lesson_charged",
        bookingId: row.id,
        dedupeKey: `charged-teacher:${row.id}`,
        replyTo: row.student_email,
        content: {
          heading: noShow ? "A no-show fee was paid" : "A lesson was paid",
          preheader: `${row.student_name} · ${lessonType.name} · ${amount}`,
          intro: `${amount} for ${row.student_name}'s ${noShow ? "no-show" : "lesson"} was charged successfully after the scheduled end time.`,
          callout: "Issue the appropriate Portal das Finanças document for this payment today.",
          rows: [
            { label: "Lesson", value: `${lessonType.name} · ${formatInZone(start, PORTO)}` },
            { label: "Reference", value: row.reference },
            nifRow
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

async function notifySameDayFeeCharged(env, { row, lessonType, amountCents }) {
  const settings = await loadSettings(env);
  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const amount = formatEuros(amountCents);
  const nif = await studentNif(env, row.student_id);

  const sends = [
    deliver(env, {
      to: row.student_email,
      subject: `Late change fee paid — ${row.reference}`,
      kind: "student_same_day_fee_paid",
      bookingId: row.id,
      dedupeKey: `same-day-paid:${row.id}`,
      replyTo: settings.replyToEmail || teacherEmail || undefined,
      content: {
        heading: "Your late change fee is paid",
        preheader: `${lessonType.name} · ${amount}`,
        intro: `Olá ${row.student_name.split(" ")[0]}, your saved card was charged ${amount} for moving or cancelling this lesson less than ${settings.minimumNoticeHours} hours before it.`,
        callout: "You will not be charged this fee again for the same lesson.",
        rows: [
          { label: "Reference", value: row.reference },
          ...(nif ? [{ label: "NIF", value: `${nif} · on your receipt from Inês` }] : [])
        ],
        action: null,
        footer: "Sent automatically by the booking system on portuguesewithines.com."
      }
    })
  ];

  // A fee is a payment like any other, so it gets the same fiscal reminder.
  // Its subject, heading and preheader still say "same-day fee": Inês's
  // receipt automation classifies payments by those words. Change them only
  // together with that automation.
  if (teacherEmail) {
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject: `Payment received — ${row.student_name}, ${amount} same-day fee`,
        kind: "teacher_same_day_fee_paid",
        bookingId: row.id,
        dedupeKey: `same-day-paid-teacher:${row.id}`,
        replyTo: row.student_email,
        content: {
          heading: "A same-day fee was paid",
          preheader: `${row.student_name} · same-day fee · ${amount}`,
          intro: `The ${amount} fee for ${row.student_name} moving or cancelling less than ${settings.minimumNoticeHours} hours before their lesson was charged successfully.`,
          callout: "Issue the appropriate Portal das Finanças document for this payment today.",
          rows: [
            { label: "Lesson", value: `${lessonType.name} · ${formatInZone(new Date(row.starts_at), PORTO)}` },
            { label: "Reference", value: row.reference },
            receiptNifRow(nif)
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

async function recoverySession(env, { row, lessonType, amountCents, purpose }) {
  const fee = purpose === "same-day-fee";
  const column = fee ? "same_day_fee_session_id" : "stripe_session_id";
  const statusColumn = fee ? "same_day_fee_status" : "payment_status";
  const previousId = row[column] ?? null;
  if (previousId) {
    const previous = await retrieveCheckoutSession(env, previousId);
    if (previous.status === "open" && previous.url) return previous;
    // Complete/pending/unknown is never permission to create a second charge.
    if (previous.status !== "expired") throw new Error("This payment is being confirmed. Please refresh shortly.");
  }
  const student = await env.DB.prepare("SELECT stripe_customer_id FROM students WHERE id = ?").bind(row.student_id).first();
  const session = await createCheckoutSession(env, {
    booking: row, lessonType, customerEmail: row.student_email,
    customer: student?.stripe_customer_id ?? null, forceHosted: true,
    checkoutPurpose: `${purpose}-due`, amountCents,
    recoveryGeneration: previousId ?? "",
    productName: fee ? "Late lesson change fee" : purpose === "no-show" ? "Lesson no-show fee" : lessonType.name,
    productDescription: `${row.reference} · Português com a Inês`,
    successUrl: siteUrl(env, "/book/?view=lessons&paid=1"),
    cancelUrl: studentManageUrl(env, await createManageToken(row.id, env.BOOKING_TOKEN_SECRET))
  });
  if (!session.id || !session.url) throw new Error("The secure payment link is not ready. Please try again shortly.");
  await env.DB.prepare(`UPDATE bookings SET ${column} = ? WHERE id = ? AND ${statusColumn} = 'payment_due' AND ${column} IS ?`)
    .bind(session.id, row.id, previousId).run();
  const stored = await env.DB.prepare(`SELECT ${column} AS session, ${statusColumn} AS status FROM bookings WHERE id = ?`).bind(row.id).first();
  if (stored?.session !== session.id || stored?.status !== "payment_due") throw new Error("This payment changed. Please refresh shortly.");
  return session;
}

async function handlePaymentRecovery(request, env, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);
  if (!stripeReady(env) || (await loadSettings(env)).paymentMode !== "postpay") return fail("Card payments are not available yet.", 503, request, env);
  if (!await takeRateLimit(env, `recovery:${row.id}`, 8)) return fail("Please wait 15 minutes before trying again.", 429, request, env);
  const body = await readJson(request);
  if (!["lesson", "same-day-fee"].includes(body.purpose)) return fail("Choose the payment to settle.", 400, request, env);
  const fee = body.purpose === "same-day-fee";
  if ((fee ? row.same_day_fee_status : row.payment_status) !== "payment_due") return fail("This payment is not outstanding. Please refresh.", 409, request, env);
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
  try {
    const session = await recoverySession(env, { row, lessonType,
      amountCents: fee ? row.same_day_fee_cents : row.charged_cents ?? row.amount_cents,
      purpose: fee ? "same-day-fee" : row.attendance_status === "no_show" ? "no-show" : "lesson" });
    return json({ url: session.url }, 200, request, env);
  } catch {
    return fail("The secure payment link is not ready. Please refresh and try again shortly.", 503, request, env);
  }
}

async function notifyPaymentDue(env, { row, lessonType, amountCents, purpose = "lesson" }) {
  const settings = await loadSettings(env);
  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const start = new Date(row.starts_at);
  const amount = formatEuros(amountCents);
  const isSameDayFee = purpose === "same-day-fee";
  const isNoShow = purpose === "no-show";

  let payUrl = "";
  try {
    await recoverySession(env, { row, lessonType, amountCents, purpose });
    // The email opens a durable booking page, not an expiring Stripe URL.
    payUrl = studentManageUrl(env, await createManageToken(row.id, env.BOOKING_TOKEN_SECRET));
  } catch (error) {
    console.error("payment-due-link", row.reference, String(error?.message ?? error));
  }

  // Retry creation on the next scheduled sweep. Do not spend the notification's
  // dedupe key on an email which promises a secure button but has no payment link.
  if (!payUrl) return;

  await deliver(env, {
    to: row.student_email,
    subject: `${isSameDayFee ? "Late change fee" : isNoShow ? "No-show fee" : "Lesson payment"} — the card didn't go through`,
    kind: isSameDayFee ? "student_same_day_fee_due" : "student_payment_due",
    bookingId: row.id,
    dedupeKey: `payment-due:${purpose}:${row.id}`,
    replyTo: settings.replyToEmail || teacherEmail || undefined,
    content: {
      heading: "The card didn't go through",
      preheader: `${lessonType.name} · ${amount} still to pay`,
      intro: `Olá ${row.student_name.split(" ")[0]}, we couldn't charge the ${amount} ${isSameDayFee ? "late change fee" : isNoShow ? "no-show fee" : "lesson payment"} to your saved card. Please use the secure payment link below.`,
      callout: "",
      rows: [
        { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
        { label: "Price", value: amount },
        { label: "Reference", value: row.reference }
      ],
      action: payUrl ? { label: `Pay ${amount}`, url: payUrl } : null,
      footer: "Sent automatically by the booking system on portuguesewithines.com."
    }
  });

  if (teacherNotificationsEnabled(env) && teacherEmail) {
    const nifRow = receiptNifRow(await studentNif(env, row.student_id));
    await deliver(env, {
      to: teacherEmail,
      subject: `Card declined — ${row.student_name}, ${formatShort(start, PORTO)}`,
      kind: "teacher_payment_due",
      bookingId: row.id,
      dedupeKey: `payment-due-teacher:${purpose}:${row.id}`,
      replyTo: row.student_email,
      content: {
        heading: "A card didn't go through",
        preheader: `${row.student_name} · ${lessonType.name} · ${amount}`,
        intro: `${row.student_name}'s ${amount} ${isSameDayFee ? "late change fee" : isNoShow ? "no-show fee" : "lesson payment"} couldn't be charged automatically. They've been sent a secure payment link.`,
        callout: "",
        rows: [
          { label: "Student", value: `${row.student_name}\n${row.student_email}` },
          nifRow,
          { label: "Reference", value: row.reference }
        ],
        action: null,
        footer: "Sent automatically by the booking system on portuguesewithines.com."
      }
    });
  }
}

/**
 * Retry what the provider refused.
 *
 * email_log has always been described as the audit trail for a reconciliation
 * sweep, and there was no sweep — nothing in the worker ever read the table. A
 * booking would confirm, the confirmation would fail on a rate limit, and
 * neither the student nor Inês would ever learn the lesson existed.
 *
 * Only the fact of the failure is retryable, not the message: the body is not
 * stored. So this re-sends the one thing that can be rebuilt from the booking —
 * its own confirmation — and leaves anything else for a person to see.
 */
export async function retryPaymentRecovery(env) {
  const settings = await loadSettings(env);
  if (settings.paymentMode !== "postpay" || !stripeReady(env)) return;
  const { results } = await env.DB.prepare(`SELECT * FROM bookings
    WHERE (payment_status = 'payment_due' AND stripe_session_id IS NULL)
       OR (same_day_fee_status = 'payment_due' AND same_day_fee_session_id IS NULL) LIMIT 20`).all();
  for (const row of results ?? []) {
    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
    if (!lessonType) continue;
    if (row.payment_status === "payment_due" && !row.stripe_session_id) {
      await notifyPaymentDue(env, { row, lessonType, amountCents: row.charged_cents ?? row.amount_cents,
        purpose: row.attendance_status === "no_show" ? "no-show" : "lesson" });
    }
    if (row.same_day_fee_status === "payment_due" && !row.same_day_fee_session_id) {
      await notifyPaymentDue(env, { row, lessonType, amountCents: row.same_day_fee_cents, purpose: "same-day-fee" });
    }
  }
}

async function resendFailedEmails(env) {
  const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM email_log
     WHERE status = 'failed' AND booking_id IS NOT NULL AND created_at < ?
     ORDER BY created_at LIMIT 25`
  )
    .bind(cutoff)
    .all();

  if (!results?.length) return;

  const settings = await loadSettings(env);

  for (const entry of results) {
    try {
      const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(entry.booking_id).first();
      if (!row) continue;

      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
        .bind(row.lesson_type_id)
        .first();
      if (!lessonType) continue;

      const event = row.status === "cancelled" ? "cancelled" : "booked";
      const token = await createManageToken(row.id, env.BOOKING_TOKEN_SECRET);

      // deliver() clears a failed row before retrying, so this is not suppressed
      // as a duplicate the way it used to be.
      await notify(env, {
        event,
        row,
        lessonType,
        settings,
        manageUrl: studentManageUrl(env, token)
      });
    } catch (error) {
      console.error("email-resend", entry.dedupe_key, String(error?.message ?? error));
    }
  }
}

async function topUpOpenSeries(env) {
  const now = new Date();
  const { results } = await env.DB.prepare(
    "SELECT * FROM booking_series WHERE status = 'active' AND occurrences IS NULL"
  ).all();

  for (const series of results ?? []) {
    try {
      const counted = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM bookings WHERE series_id = ? AND status = 'confirmed'"
      )
        .bind(series.id)
        .first();

      const outstanding = outstandingFor(series, { bookedCount: counted?.count ?? 0, now });
      if (!outstanding || outstanding.count <= 0) continue;

      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(series.student_id).first();
      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
        .bind(series.lesson_type_id)
        .first();
      if (!student || !lessonType) continue;

      const filled = await fillSeries(env, {
        series,
        student,
        lessonType,
        fromKey: outstanding.fromKey,
        count: outstanding.count,
        now,
        // A saved-card run keeps its promise as it grows. The legacy prepaid
        // flag keeps an older automatic series from silently changing terms.
        paymentState: series.automatic_payment || series.prepaid ? "scheduled" : "none"
      });

      if (!filled.rows.length) continue;

      const settings = await loadSettings(env);
      const manageUrls = {};
      for (const row of filled.rows) {
        const token = await createManageToken(row.id, env.BOOKING_TOKEN_SECRET);
        manageUrls[row.id] = studentManageUrl(env, token);
      }

      await notifySeries(env, {
        rows: filled.rows,
        lessonType,
        settings,
        series,
        manageUrls,
        skipped: filled.skipped,
        // Not a new booking — this slot was already theirs. The student sees
        // the added lesson in the booking workspace without another email;
        // Inês still receives its external-calendar attachment.
        reason: "extended"
      });
    } catch (error) {
      // One bad series must not stop the rest being extended.
      console.error("series-topup", series.id, String(error?.message ?? error));
    }
  }
}

async function handleHealth(request, env) {
  const missing = [];
  if (!env.DB) missing.push("DB");
  if (!env.BOOKING_TOKEN_SECRET) missing.push("BOOKING_TOKEN_SECRET");
  if (!env.RESEND_API_KEY && env.EMAIL_DRY_RUN !== "1") missing.push("RESEND_API_KEY");

  let lessonTypes = 0;
  let teacherEmail = "";
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM lesson_types WHERE active = 1").first();
    lessonTypes = row?.count ?? 0;
    // Sign-up writes this column (migration 0017), so its absence is an outage.
    await env.DB.prepare("SELECT nif FROM students LIMIT 0").first();
    const settings = await loadSettings(env);
    teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  } catch {
    missing.push("schema");
  }

  if (!teacherEmail) missing.push("TEACHER_EMAIL");

  let paymentMode = "off";
  try {
    paymentMode = (await loadSettings(env)).paymentMode;
  } catch {
    // Already reported through `missing` above.
  }

  // Dormant payments are allowed to carry sandbox credentials while the live
  // account is prepared. The instant after-lesson charging is requested, both
  // secrets and the declared test/live mode become health requirements.
  if (paymentMode === "postpay") {
    if (!env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
    if (!env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
    if (stripeConfigured(env) && !stripeReady(env)) {
      missing.push(`STRIPE_MODE_EXPECTED_${String(env.STRIPE_EXPECTED_MODE ?? "configured").toUpperCase()}`);
    }
  }

  return json(
    {
      ok: missing.length === 0,
      missing,
      lessonTypes,
      emailMode: env.RESEND_API_KEY && env.EMAIL_DRY_RUN !== "1" ? "live" : "dry-run",
      teacherNotifications: teacherNotificationsEnabled(env) ? "live" : "paused",
      paymentMode,
      stripe: stripeMode(env),
      stripeReady: stripeReady(env),
      googleSignIn: env.GOOGLE_CLIENT_ID ? "configured" : "not-configured"
    },
    // A health check that always answers 200 cannot be alerted on. Nothing reads
    // the status code today — check-booking-link.mjs parses the body — so this
    // only adds a signal.
    missing.length === 0 ? 200 : 503,
    request,
    env
  );
}

/** Fire-and-forget: housekeeping must never delay or fail an availability read. */
function ctx_releaseHolds(env) {
  releaseExpiredHolds(env).catch((error) => console.error("release-holds", String(error?.message ?? error)));
}

async function handleAvailability(request, env, url) {
  const lessonTypeId = url.searchParams.get("lessonType") ?? "single";
  const lessonType = await loadLessonType(env, lessonTypeId);
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  const now = new Date();
  const fromKey = url.searchParams.get("from") || dateKey(now, PORTO);
  // Generous, because computeAvailability clamps to the booking horizon anyway.
  // A hard-coded default narrower than the horizon silently truncates the
  // answer for any caller that does not pass an explicit range.
  const toKey = url.searchParams.get("to") || addDaysToKey(fromKey, 140);
  if (!parseDateKey(fromKey) || !parseDateKey(toKey)) return fail("Invalid date range.", 400, request, env);

  // A lesson being changed may reuse the time it occupies, so moving it by half
  // an hour or changing its length at the same start is offered. A valid manage
  // link ignores its one booking; a weekly sequence is ignored only for its
  // owner's session. Anything else quietly gets the public answer.
  const ignoreBookingId = await readManageToken(url.searchParams.get("manage") ?? "", env.BOOKING_TOKEN_SECRET);
  let ignoreSeriesId = null;
  const seriesId = url.searchParams.get("series");
  if (seriesId) {
    const student = await currentStudent(request, env);
    const owned = student
      ? await env.DB.prepare("SELECT id FROM booking_series WHERE id = ? AND student_id = ? AND status = 'active'")
          .bind(seriesId, student.id)
          .first()
      : null;
    ignoreSeriesId = owned?.id ?? null;
  }

  ctx_releaseHolds(env);
  const { slotsByDate, settings } = await computeAvailability(env, { fromKey, toKey, lessonType, now, ignoreBookingId, ignoreSeriesId });

  return json(
    {
      slotsByDate: slotsByDate ?? {},
      timeZone: PORTO,
      minimumNoticeHours: settings.minimumNoticeHours,
      horizonDays: settings.bookingHorizonDays,
      lessonType: {
        id: lessonType.id,
        name: lessonType.name,
        durationMinutes: lessonType.duration_minutes,
        priceCents: lessonType.price_cents
      }
    },
    200,
    request,
    env
  );
}

async function handleCreate(request, env, ctx) {
  // Booking requires an account. Identity then comes from the signed-in
  // student rather than from whatever was typed into a form, so a person's
  // lessons stay together and /my-lessons can show all of them.
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in to book a lesson.", 401, request, env);

  const body = await readJson(request);
  const now = new Date();

  const notes = cleanText(body.notes, 1000);
  const location = normaliseLocation(body.location);
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : student.timezone;

  let lessonType = await loadLessonType(env, cleanText(body.lessonType, 40) || "single");
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  // `null` is the deliberate open-ended choice and `undefined` is "not asked
  // for", so the two must not be collapsed. Anything else unrecognised is a
  // refusal rather than a silent fallback to a one-off.
  const wantsRepeat = "repeat" in body && body.repeat !== undefined;
  const repeatWeeks = wantsRepeat ? normaliseWeeks(body.repeat) : undefined;
  if (wantsRepeat && repeatWeeks === undefined) {
    return fail(`Choose ${SERIES_LENGTHS.join(", ")} weeks, or every week.`, 400, request, env);
  }
  if (wantsRepeat && lessonType.id === "trial") return fail("A trial is one first lesson and cannot repeat.", 400, request, env);
  const selection = bookingSelection(body, { recurring: wantsRepeat, durationMinutes: lessonType.duration_minutes, trial: lessonType.id === "trial" });
  if (selection.error) return fail(selection.error, 400, request, env);
  body.startAt = selection.starts[0];
  if (wantsRepeat) lessonType = await recurringLessonType(env, student.id, lessonType);
  if (body.expectedPriceCents !== undefined && body.expectedPriceCents !== lessonType.price_cents) {
    return fail("Your lesson price has changed. Please review it before confirming.", 409, request, env);
  }

  // Backing out of the card form, reloading or closing the tab leaves this
  // student's unfinished setup holding its lessons; the new request replaces it
  // instead of being refused by the student's own hold.
  await releaseOwnCardSetups(env, ctx, student.id, now);

  // The trial is a first lesson, priced to make starting easy — not a discount
  // for people already having lessons. Anyone with a booking that wasn't
  // cancelled has started; a cancelled trial that never happened doesn't count
  // against booking another. (Dan, 28 August 2026.) An unfinished card setup
  // the student could still complete counts: it may yet become that lesson.
  if (lessonType.id === "trial") {
    const prior = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM bookings WHERE student_id = ? AND status != 'cancelled'"
    )
      .bind(student.id)
      .first();
    if ((prior?.n ?? 0) > 0) {
      return fail(
        "The trial is for your first lesson with Inês. You've already had a lesson, so choose a single lesson instead.",
        400,
        request,
        env
      );
    }
  }

  // Cheap abuse guard: a real student does not book six lessons in a minute,
  // and without this one account can fill her whole calendar.
  // Counts booking *acts*, not rows. A twelve-week series writes twelve rows
  // for one decision, so its occurrences are excluded here and the series
  // itself is counted once — otherwise booking a term locks the student out of
  // their own calendar for an hour.
  const sinceIso = new Date(now.getTime() - 3600000).toISOString();
  const recent = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM bookings WHERE student_id = ?1 AND created_at > ?2 AND series_id IS NULL)
          + (SELECT COUNT(*) FROM booking_series WHERE student_id = ?1 AND created_at > ?2) AS acts,
            (SELECT COUNT(*) FROM bookings WHERE student_id = ?1 AND created_at > ?2) AS lessons`
  )
    .bind(student.id, sinceIso)
    .first();

  /*
   * Two bounds, because one act can write twelve rows. Counting only acts let a
   * single account take sixty lessons an hour through repeats; counting only
   * rows would lock someone out of their own term booking. So: five decisions,
   * and no more than about two terms' worth of lessons, in an hour.
   */
  if ((recent?.acts ?? 0) >= 5 || (recent?.lessons ?? 0) >= 26) {
    return fail("That's several bookings in a short time. Please email Inês directly instead.", 429, request, env);
  }

  const check = await isSlotBookable(env, { startAt: body.startAt, lessonType, now });
  if (!check.ok) return fail(check.reason, 409, request, env);

  const settings = await loadSettings(env);
  if (settings.paymentMode === "prepay") {
    return fail("Online payment is being updated. Please try again shortly.", 503, request, env);
  }
  const paymentRequired = settings.paymentMode === "postpay";
  const stripeIsReady = stripeReady(env);
  const paymentProblem = bookingPaymentProblem({
    paymentRequired,
    stripeIsReady,
    paymentConsent: body.paymentConsent
  });
  if (paymentProblem?.status === 503) {
    console.error("stripe-not-ready", `expected=${env.STRIPE_EXPECTED_MODE || "unset"} actual=${stripeMode(env)}`);
  }
  if (paymentProblem) {
    return fail(paymentProblem.message, paymentProblem.status, request, env);
  }
  const postpay = paymentRequired;
  const hasSavedCard = Boolean(student.stripe_customer_id && student.stripe_payment_method);
  const needsCardSetup = postpay && !hasSavedCard;

  // A hold blocks its slots for 35 minutes with no card entered, and the hourly
  // bounds above are per account. Bound them per connection as well, so fresh
  // accounts cannot keep the calendar held.
  if (needsCardSetup) {
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    if (!await takeRateLimit(env, `hold:${ip}`, 8, 3600)) {
      return fail("That's several bookings in a short time. Please email Inês directly instead.", 429, request, env);
    }
  }

  if (selection.starts.length > 1) {
    return handleCreateSelection(request, env, ctx, {
      starts: selection.starts, student, lessonType, now, notes, location, timezone,
      wantsRepeat, repeatWeeks, settings, postpay, needsCardSetup, recentLessons: recent?.lessons ?? 0
    });
  }

  const id = crypto.randomUUID();
  const reference = bookingReference();
  const startsAt = new Date(body.startAt).toISOString();
  const timestamp = now.toISOString();
  // The database hold is authoritative: even if Stripe still shows its setup
  // form later, a late webhook cannot confirm this released slot.
  const holdExpiresAt = new Date(now.getTime() + 35 * 60000).toISOString();

  const endsAt = check.endAt.toISOString();
  const claimed = await claimSlot(env, {
    columns: [
      "id", "reference", "lesson_type_id", "student_id", "student_name", "student_email", "student_phone",
      "student_timezone", "location", "notes", "starts_at", "ends_at", "status", "sequence", "created_at",
      "updated_at", "payment_status", "amount_cents", "hold_expires_at", "payment_consent_at",
      "payment_consent_version"
    ],
    values: [
      id,
      reference,
      lessonType.id,
      student.id,
      student.name,
      student.email,
      student.phone,
      timezone,
      location,
      notes,
      startsAt,
      endsAt,
      needsCardSetup ? "pending_payment" : "confirmed",
      0,
      timestamp,
      timestamp,
      needsCardSetup ? "pending" : postpay ? "scheduled" : "not_required",
      lessonType.price_cents,
      needsCardSetup ? holdExpiresAt : null,
      postpay ? timestamp : null,
      postpay ? PAYMENT_CONSENT_VERSION : null
    ],
    startAt: startsAt,
    endAt: endsAt,
    studentId: student.id
  });

  if (!claimed) {
    return fail("That time has just been taken. Please choose another.", 409, request, env);
  }

  // Keep the account's timezone in step with the browser it was booked from.
  if (timezone !== student.timezone) {
    await env.DB.prepare("UPDATE students SET timezone = ? WHERE id = ?").bind(timezone, student.id).run();
  }

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
  const token = await createManageToken(id, env.BOOKING_TOKEN_SECRET);
  const manageUrl = studentManageUrl(env, token);

  // A first-time payer authenticates and saves a card, but no money is taken.
  // The held booking confirms only when Stripe's setup webhook proves that
  // reusable payment method exists. A repeat is handled as one hold below.
  if (needsCardSetup && !wantsRepeat) {
    try {
      const session = await createCardSetupSession(env, {
        booking: row,
        customer: student.stripe_customer_id ?? null,
        customerEmail: student.email,
        successUrl: `${studentManageUrl(env, token)}&card=saved`,
        cancelUrl: siteUrl(env, "/book/?cancelled=1")
      });

      await env.DB.prepare("UPDATE bookings SET stripe_session_id = ? WHERE id = ?").bind(session.id, id).run();

      // Hosted checkout answers with a URL to send the student to; embedded
      // answers with a client secret the page mounts Stripe's form from.
      return json(
        {
          booking: publicBooking(row, lessonType, settings),
          ...(session.url ? { checkoutUrl: session.url } : { checkoutClientSecret: session.client_secret })
        },
        201,
        request,
        env
      );
    } catch (error) {
      // Never leave a dead hold behind when checkout could not even be created.
      await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(id).run();
      console.error("stripe-setup", String(error?.message ?? error));
      return fail("We couldn't save the card just now. Please try again in a moment.", 502, request, env);
    }
  }

  // A repeat is created only once the first lesson is real, so a failure part
  // way through leaves a booked lesson rather than a series pointing at nothing.
  if (wantsRepeat) {
    const slot = slotOf(startsAt);
    const seriesId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO booking_series (id, student_id, lesson_type_id, location, notes, weekday, minute_of_day,
         occurrences, status, filled_to, automatic_payment, payment_consent_at, payment_consent_version,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        seriesId,
        student.id,
        lessonType.id,
        location,
        notes,
        slot.weekday,
        slot.minuteOfDay,
        repeatWeeks,
        slot.dateKey,
        postpay ? 1 : 0,
        postpay ? timestamp : null,
        postpay ? PAYMENT_CONSENT_VERSION : null,
        timestamp,
        timestamp
      )
      .run();

    await env.DB.prepare("UPDATE bookings SET series_id = ? WHERE id = ?").bind(seriesId, id).run();
    const series = await env.DB.prepare("SELECT * FROM booking_series WHERE id = ?").bind(seriesId).first();

    // The lesson just booked is the first occurrence, so the rest start a week on.
    const remaining = (repeatWeeks ?? OPEN_ENDED_HORIZON_WEEKS) - 1;
    const filled =
      remaining > 0
        ? await fillSeries(env, {
            series,
            student,
            lessonType,
            fromKey: addDaysToKey(slot.dateKey, 7),
            count: remaining,
            now,
            // A new card setup holds the run until Stripe confirms it. A card
            // already on file schedules every occurrence immediately.
            paymentState: needsCardSetup ? "hold" : postpay ? "scheduled" : "none",
            holdExpiresAt: needsCardSetup ? holdExpiresAt : null
          })
        : { rows: [], skipped: [] };

    const first = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
    const allRows = [first, ...filled.rows];

    const seriesPayload = {
      id: seriesId,
      weeks: repeatWeeks,
      openEnded: repeatWeeks === null,
      booked: allRows.map((occurrence) => occurrence.starts_at),
      skipped: filled.skipped.map((occurrence) => occurrence.startAt)
    };

    if (needsCardSetup) {
      try {
        const session = await createCardSetupSession(env, {
          booking: first,
          customer: student.stripe_customer_id ?? null,
          customerEmail: student.email,
          seriesId,
          successUrl: siteUrl(env, "/book/?view=lessons&card=saved"),
          cancelUrl: siteUrl(env, "/book/?cancelled=1"),
          skippedStartAts: filled.skipped.map((occurrence) => occurrence.startAt)
        });

        await env.DB.prepare("UPDATE bookings SET stripe_session_id = ? WHERE series_id = ? OR id = ?")
          .bind(session.id, seriesId, id)
          .run();

        // Emails wait for the webhook; the run is held until its card is saved.
        return json(
          {
            booking: publicBooking(first, lessonType, settings),
            manageUrl,
            manageToken: token,
            series: seriesPayload,
            ...(session.url ? { checkoutUrl: session.url } : { checkoutClientSecret: session.client_secret })
          },
          201,
          request,
          env
        );
      } catch (error) {
        // Never leave a run of dead holds behind when checkout couldn't start.
        await env.DB.prepare("DELETE FROM bookings WHERE series_id = ? OR id = ?").bind(seriesId, id).run();
        await env.DB.prepare("DELETE FROM booking_series WHERE id = ?").bind(seriesId).run();
        console.error("stripe-series-setup", String(error?.message ?? error));
        return fail("We couldn't save the card just now. Please try again in a moment.", 502, request, env);
      }
    }

    const manageUrls = {};
    for (const occurrence of allRows) {
      const occurrenceToken = await createManageToken(occurrence.id, env.BOOKING_TOKEN_SECRET);
      manageUrls[occurrence.id] = studentManageUrl(env, occurrenceToken);
    }

    ctx.waitUntil(
      notifySeries(env, { rows: allRows, lessonType, settings, series, manageUrls, skipped: filled.skipped })
    );

    return json(
      {
        booking: publicBooking(first, lessonType, settings),
        manageUrl,
        manageToken: token,
        series: seriesPayload
      },
      201,
      request,
      env
    );
  }

  ctx.waitUntil(notify(env, { event: "booked", row, lessonType, settings, manageUrl }));

  return json(
    { booking: publicBooking(row, lessonType, settings), manageUrl, manageToken: token },
    201,
    request,
    env
  );
}

/** Reserve a selection through one card setup and one combined confirmation. */
async function handleCreateSelection(request, env, ctx, {
  starts, student, lessonType, now, notes, location, timezone,
  wantsRepeat, repeatWeeks, settings, postpay, needsCardSetup, recentLessons
}) {
  const timestamp = now.toISOString();
  const holdExpiresAt = needsCardSetup ? new Date(now.getTime() + 35 * 60000).toISOString() : null;
  const series = [];
  const plannedRows = [];
  const skipped = [];
  for (const startAt of starts) {
    const check = await isSlotBookable(env, { startAt, lessonType, now });
    if (!check.ok) return fail(`${formatInZone(new Date(startAt), PORTO)}: ${check.reason} Nothing has been booked.`, 409, request, env);
    const slot = slotOf(startAt);
    const count = wantsRepeat ? repeatWeeks ?? OPEN_ENDED_HORIZON_WEEKS : 1;
    const plan = wantsRepeat
      ? await planOccurrences(env, { fromKey: slot.dateKey, minuteOfDay: slot.minuteOfDay, count, lessonType, now })
      : { bookable: [{ startAt: new Date(startAt), endAt: check.endAt }], skipped: [] };
    // Both starting lessons must still be available; only later occurrences
    // may be skipped after the preview has shown their dates.
    if (!plan.bookable.some((entry) => entry.startAt.toISOString() === startAt)) {
      return fail("A starting time has just been taken. Nothing has been booked; please choose again.", 409, request, env);
    }
    const seriesId = wantsRepeat ? crypto.randomUUID() : null;
    if (seriesId) series.push({
      id: seriesId, student_id: student.id, lesson_type_id: lessonType.id, location, notes,
      weekday: slot.weekday, minute_of_day: slot.minuteOfDay, occurrences: repeatWeeks,
      status: "active", filled_to: addDaysToKey(slot.dateKey, (count - 1) * 7),
      automatic_payment: postpay ? 1 : 0, payment_consent_at: postpay ? timestamp : null,
      payment_consent_version: postpay ? PAYMENT_CONSENT_VERSION : null, created_at: timestamp, updated_at: timestamp
    });
    skipped.push(...plan.skipped);
    for (const occurrence of plan.bookable) plannedRows.push({
      id: crypto.randomUUID(), reference: bookingReference(), lesson_type_id: lessonType.id, student_id: student.id,
      student_name: student.name, student_email: student.email, student_phone: student.phone,
      student_timezone: timezone, location, notes, starts_at: occurrence.startAt.toISOString(),
      ends_at: occurrence.endAt.toISOString(), status: needsCardSetup ? "pending_payment" : "confirmed", sequence: 0,
      created_at: timestamp, updated_at: timestamp, payment_status: needsCardSetup ? "pending" : postpay ? "scheduled" : "not_required",
      amount_cents: lessonType.price_cents, hold_expires_at: holdExpiresAt, series_id: seriesId,
      payment_consent_at: postpay ? timestamp : null, payment_consent_version: postpay ? PAYMENT_CONSENT_VERSION : null
    });
  }
  plannedRows.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (plannedRows.some((row, index) => index && row.starts_at < plannedRows[index - 1].ends_at)) {
    return fail("Those weekly times overlap on a later date. Please choose different times.", 409, request, env);
  }
  if (recentLessons + plannedRows.length > 26) {
    return fail("That's several bookings in a short time. Please wait an hour before adding more.", 429, request, env);
  }
  if (!await claimSelection(env, { rows: plannedRows, series, now })) {
    return fail("A selected time has just been taken. Nothing has been booked; please review your dates.", 409, request, env);
  }
  const ids = JSON.stringify(plannedRows.map((row) => row.id));
  const { results: rows } = await env.DB.prepare("SELECT * FROM bookings WHERE id IN (SELECT value FROM json_each(?)) ORDER BY starts_at").bind(ids).all();
  const first = rows[0];
  const token = await createManageToken(first.id, env.BOOKING_TOKEN_SECRET);
  const selection = {
    booked: rows.map((row) => row.starts_at), skipped: skipped.map((entry) => entry.startAt),
    recurring: wantsRepeat, weeks: wantsRepeat ? repeatWeeks : null, weeklyTimes: series.length
  };
  const payload = { booking: publicBooking(first, lessonType, settings), selection, manageUrl: studentManageUrl(env, token), manageToken: token };
  if (needsCardSetup) {
    try {
      const session = await createCardSetupSession(env, {
        booking: first, customer: student.stripe_customer_id ?? null, customerEmail: student.email,
        selectionCount: rows.length,
        successUrl: siteUrl(env, "/book/?view=lessons&card=saved"), cancelUrl: siteUrl(env, "/book/?cancelled=1"),
        skippedStartAts: selection.skipped
      });
      await env.DB.prepare("UPDATE bookings SET stripe_session_id = ? WHERE id IN (SELECT value FROM json_each(?)) AND status = 'pending_payment'")
        .bind(session.id, ids).run();
      return json({ ...payload, ...(session.url ? { checkoutUrl: session.url } : { checkoutClientSecret: session.client_secret }) }, 201, request, env);
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM bookings WHERE id IN (SELECT value FROM json_each(?)) AND status = 'pending_payment'").bind(ids),
        ...series.map((entry) => env.DB.prepare("DELETE FROM booking_series WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE series_id = ?)").bind(entry.id, entry.id))
      ]);
      console.error("stripe-selection-setup", String(error?.message ?? error));
      return fail("We couldn't save the card just now. Nothing has been booked; please try again in a moment.", 502, request, env);
    }
  }
  ctx.waitUntil(notifySelection(env, { rows, lessonType, settings, series, skipped }));
  return json(payload, 201, request, env);
}

async function notifySelection(env, { rows, lessonType, settings, series, skipped }) {
  const manageUrls = {};
  for (const row of rows) manageUrls[row.id] = studentManageUrl(env, await createManageToken(row.id, env.BOOKING_TOKEN_SECRET));
  return notifySeries(env, {
    rows, lessonType, settings, manageUrls, skipped,
    series: { id: rows[0].id, oneOff: !series.length, weeklyTimes: series.length,
      occurrences: series.some((entry) => entry.occurrences === null) ? null : rows.length }
  });
}

/**
 * Insert one occurrence of a series. Deliberately the same shape of row as a
 * one-off booking, carrying only `series_id` extra — everything downstream
 * treats it as an ordinary lesson, which is what makes moving or cancelling a
 * single week work without any special case.
 */
/**
 * `paymentState` is the world the occurrence is born into: 'none' for an old
 * pay-in-person run, 'hold' while its first card setup is open, and 'scheduled'
 * for a lesson that will charge the saved card after its end.
 */
async function insertOccurrence(env, { seriesId, student, lessonType, timezone, location, notes, startAt, endAt, now, paymentState = "none", holdExpiresAt = null, paymentConsentAt = null, paymentConsentVersion = null }) {
  const id = crypto.randomUUID();
  const timestamp = now.toISOString();
  const startsAt = new Date(startAt).toISOString();
  const endsAt = new Date(endAt).toISOString();

  const claimed = await claimSlot(env, {
    columns: [
      "id", "reference", "lesson_type_id", "student_id", "student_name", "student_email", "student_phone",
      "student_timezone", "location", "notes", "starts_at", "ends_at", "status", "sequence", "created_at",
      "updated_at", "payment_status", "amount_cents", "hold_expires_at", "series_id", "payment_consent_at",
      "payment_consent_version"
    ],
    values: [
      id,
      bookingReference(),
      lessonType.id,
      student.id,
      student.name,
      student.email,
      student.phone,
      timezone,
      location,
      notes,
      startsAt,
      endsAt,
      paymentState === "hold" ? "pending_payment" : "confirmed",
      0,
      timestamp,
      timestamp,
      paymentState === "hold" ? "pending" : paymentState === "scheduled" ? "scheduled" : "not_required",
      lessonType.price_cents,
      paymentState === "hold" ? holdExpiresAt : null,
      seriesId,
      paymentConsentAt,
      paymentConsentVersion
    ],
    startAt: startsAt,
    endAt: endsAt,
    studentId: student.id
  });

  // Losing the race is a skipped week, not a failed booking: the rest of the
  // run is still worth having, and the student is told which weeks were missed.
  if (!claimed) return null;

  return env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
}

/**
 * Fill a series forward, skipping any week that is not free.
 *
 * `filled_to` moves to the last week *considered*, not the last one booked, so
 * a skipped week is never reconsidered on the next top-up and the run cannot
 * stall on it forever.
 */
async function fillSeries(env, { series, student, lessonType, fromKey, count, now, paymentState = "none", holdExpiresAt = null }) {
  lessonType = await recurringLessonType(env, student.id, lessonType);
  const { bookable, skipped } = await planOccurrences(env, {
    fromKey,
    minuteOfDay: series.minute_of_day,
    count,
    lessonType,
    now
  });

  const rows = [];
  const lost = [];
  for (const occurrence of bookable) {
    const row = await insertOccurrence(env, {
      seriesId: series.id,
      student,
      lessonType,
      timezone: student.timezone,
      location: series.location,
      notes: series.notes,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      now,
      paymentState,
      holdExpiresAt,
      paymentConsentAt: series.payment_consent_at ?? null,
      paymentConsentVersion: series.payment_consent_version ?? null
    });

    if (row) rows.push(row);
    else lost.push({ key: occurrence.key, startAt: occurrence.startAt.toISOString(), reason: "Taken while booking." });

    /*
     * The bookmark moves with each occurrence, not once at the end. Advancing it
     * only after the loop meant a run that died half way left rows committed and
     * `filled_to` untouched — so the next night replanned the same weeks, found
     * its own bookings in the way, and emailed the student and Inês to say those
     * lessons had been "left out". They were in the calendar the whole time.
     */
    await env.DB.prepare("UPDATE booking_series SET filled_to = ?, updated_at = ? WHERE id = ?")
      .bind(occurrence.key, now.toISOString(), series.id)
      .run();
  }

  const allSkipped = [...skipped, ...lost];
  const considered = [...bookable.map((o) => o.key), ...skipped.map((o) => o.key)].sort();
  const lastConsidered = considered[considered.length - 1] ?? series.filled_to;
  if (lastConsidered) {
    await env.DB.prepare("UPDATE booking_series SET filled_to = ?, updated_at = ? WHERE id = ?")
      .bind(lastConsidered, now.toISOString(), series.id)
      .run();
  }

  return { rows, skipped: allSkipped };
}

/**
 * What a repeat would actually book, without booking it. Availability is
 * already public, so this preview is public too; identity is still required by
 * the create route where a lesson is actually written.
 *
 * The student sees the skipped weeks before they commit rather than after, so
 * "eight weeks" never quietly turns into seven in their inbox.
 */
async function handleSeriesPreview(request, env) {
  const body = await readJson(request);
  const weeks = normaliseWeeks(body.weeks);
  if (weeks === undefined) {
    return fail(`Choose ${SERIES_LENGTHS.join(", ")} weeks, or every week.`, 400, request, env);
  }

  const lessonType = await loadLessonType(env, cleanText(body.lessonType, 40) || "single");
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  const start = new Date(body.startAt);
  if (Number.isNaN(start.getTime())) return fail("That time could not be understood.", 400, request, env);

  const slot = slotOf(start);
  const now = new Date();
  const count = weeks ?? OPEN_ENDED_HORIZON_WEEKS;

  const { bookable, skipped } = await planOccurrences(env, {
    fromKey: slot.dateKey,
    minuteOfDay: slot.minuteOfDay,
    count,
    lessonType,
    now
  });

  return json(
    {
      weeks,
      openEnded: weeks === null,
      bookable: bookable.map((o) => o.startAt.toISOString()),
      skipped: skipped.map((o) => o.startAt)
    },
    200,
    request,
    env
  );
}

/**
 * Stop a series. The lessons already booked are left alone unless the student
 * asks for them too: someone who wants to stop repeating usually still intends
 * to come to the ones in their calendar, and silently cancelling those would be
 * the worse mistake of the two.
 */
async function handleStopSeries(request, env, ctx, seriesId) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const series = await env.DB.prepare("SELECT * FROM booking_series WHERE id = ? AND student_id = ?")
    .bind(seriesId, student.id)
    .first();
  if (!series) return fail("That repeating booking could not be found.", 404, request, env);

  const body = await readJson(request);
  const cancelRemaining = body.cancelRemaining === true;
  const now = new Date();
  let cancelled = 0;
  let kept = 0;
  let refunded = 0;
  let pendingRefunds = 0;
  let cancellationPlan = [];

  if (cancelRemaining) {
    const { results } = await env.DB.prepare(
      "SELECT * FROM bookings WHERE series_id = ? AND status = 'confirmed' AND starts_at > ? ORDER BY starts_at"
    )
      .bind(seriesId, now.toISOString())
      .all();

    // A bulk action must not become a shortcut around the 14-hour rule. Keep
    // any occurrence inside the fee window; the student can still cancel it
    // individually and pay the fee.
    const plan = planSeriesCancellation(results ?? [], now, (await loadSettings(env)).minimumNoticeHours);
    kept = plan.kept.length;
    cancellationPlan = plan.cancellable;

  }

  await env.DB.prepare("UPDATE booking_series SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?")
    .bind(now.toISOString(), now.toISOString(), seriesId)
    .run();

  if (cancelRemaining) {
    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(series.lesson_type_id)
      .first();
    const settings = await loadSettings(env);

    const cancelledRows = [];
    for (const { row, refund } of cancellationPlan) {
      if (refund) {
        if (!await claimRefund(env, row, "student")) { kept++; continue; }
        const updated = await completeRefund(env, row.id);
        if (!updated) { kept++; pendingRefunds++; continue; }
        cancelledRows.push(updated); cancelled++; refunded++;
        continue;
      }
      const wasRefunded = refund ? 1 : 0;
      const result = await env.DB.prepare(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'student',
           sequence = sequence + 1, updated_at = ?,
           payment_status = CASE WHEN ? = 1 THEN 'refunded' ELSE payment_status END
         WHERE id = ? AND status = 'confirmed' AND sequence = ? AND payment_status != 'processing'`
      )
        .bind(now.toISOString(), now.toISOString(), wasRefunded, row.id, row.sequence)
        .run();
      if (!(result?.meta?.changes > 0)) { kept++; continue; }
      cancelledRows.push(await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first());
      cancelled += 1;
    }

    // One message each way, not one per lesson: a dozen occurrences used to mean
    // two dozen simultaneous requests to the mail provider, and its rate limit
    // drops most of them without saying so.
    if (cancelledRows.length) {
      ctx.waitUntil(notifySeriesCancelled(env, { rows: cancelledRows, lessonType, settings }));
    }
  }

  return json({ ok: true, stopped: true, cancelled, kept, refunded, pendingRefunds }, 200, request, env);
}

/**
 * Move every future occurrence of an active sequence to a new weekly slot.
 *
 * The availability preview necessarily happens before the write, so the write
 * repeats the conflict check for the complete proposed run. One CTE-backed
 * UPDATE moves every row or none: a cancellation, individual move, or newly
 * claimed slot arriving during the preview cannot leave half a sequence on the
 * old schedule and half on the new one.
 */
async function handleRescheduleSeries(request, env, ctx, seriesId) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const series = await env.DB.prepare(
    "SELECT * FROM booking_series WHERE id = ? AND student_id = ? AND status = 'active'"
  )
    .bind(seriesId, student.id)
    .first();
  if (!series) return fail("That recurring lesson could not be found.", 404, request, env);

  const now = new Date();
  const nowIso = now.toISOString();
  const { results } = await env.DB.prepare(
    "SELECT * FROM bookings WHERE series_id = ? AND status = 'confirmed' AND starts_at > ? ORDER BY starts_at"
  )
    .bind(seriesId, nowIso)
    .all();
  // Moving a whole run must not become a route around the 14-hour rule: a
  // lesson inside the window stays where it is, and the rest of the run moves.
  const { minimumNoticeHours } = await loadSettings(env);
  const kept = (results ?? []).filter((row) => changePolicy(row, now, minimumNoticeHours).late);
  const rows = (results ?? []).filter((row) => !kept.includes(row));
  if (!rows.length) {
    return fail(
      kept.length
        ? `Your next lesson is less than ${minimumNoticeHours} hours away, so it stays where it is. There are no later lessons in this sequence to move yet.`
        : "There are no upcoming lessons in this sequence to move.",
      409,
      request,
      env
    );
  }

  const body = await readJson(request);
  const requestedStart = new Date(body.startAt);
  if (Number.isNaN(requestedStart.getTime())) return fail("That time could not be understood.", 400, request, env);

  const previousLessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
    .bind(series.lesson_type_id)
    .first();
  const lessonTypeId = cleanText(body.lessonType, 40) || series.lesson_type_id;
  const lessonType = await loadLessonType(env, lessonTypeId);
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);
  const location = normaliseLocation(body.location, series.location);

  const currentLessonTypes = new Map([[previousLessonType.id, previousLessonType]]);
  for (const row of rows) {
    if (!currentLessonTypes.has(row.lesson_type_id)) {
      currentLessonTypes.set(
        row.lesson_type_id,
        await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first()
      );
    }
    const currentLessonType = currentLessonTypes.get(row.lesson_type_id);
    const typeChangeProblem = lessonTypeChangeProblem(row, currentLessonType, lessonType);
    if (typeChangeProblem) return fail(typeChangeProblem, 409, request, env);
  }

  const requestedSlot = slotOf(requestedStart);
  const occurrences = occurrenceInstants({
    fromKey: requestedSlot.dateKey,
    minuteOfDay: requestedSlot.minuteOfDay,
    count: rows.length
  });
  if (occurrences.length !== rows.length) return fail("That weekly schedule could not be understood.", 400, request, env);

  const planned = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const occurrence = occurrences[index];
    const check = await isSlotBookable(env, {
      startAt: occurrence.startAt.toISOString(),
      lessonType,
      now,
      ignoreSeriesId: seriesId,
      ignoreHorizon: true
    });
    if (!check.ok) {
      return fail(
        `${formatShort(occurrence.startAt, PORTO)} is not free for the new weekly time. Choose another day or time.`,
        409,
        request,
        env
      );
    }
    // The availability check ignored the whole sequence, including a lesson
    // that is staying where it is.
    const clash = kept.find((late) => Date.parse(late.starts_at) < check.endAt.getTime() && Date.parse(late.ends_at) > occurrence.startAt.getTime());
    if (clash) {
      return fail(
        `${formatShort(occurrence.startAt, PORTO)} overlaps your lesson on ${formatShort(new Date(clash.starts_at), PORTO)}, which stays where it is. Choose another day or time.`,
        409,
        request,
        env
      );
    }
    const amountCents = await priceForMove(env, row, lessonType);
    if (row.lesson_type_id !== lessonType.id && body.expectedPriceCents !== amountCents) {
      return fail("Please reload and review the changed lesson price. If this run has different lesson lengths or rates, move those lessons individually.", 409, request, env);
    }
    planned.push({
      id: row.id,
      oldStart: row.starts_at,
      oldLessonType: row.lesson_type_id,
      oldLocation: row.location,
      startAt: occurrence.startAt.toISOString(),
      endAt: check.endAt.toISOString(),
      amountCents,
      key: occurrence.key
    });
  }

  const proposedValues = planned.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
  const proposedBindings = planned.flatMap((entry) => [
    entry.id,
    entry.oldStart,
    entry.oldLessonType,
    entry.oldLocation,
    entry.startAt,
    entry.endAt,
    entry.amountCents
  ]);
  const expectedValues = planned.map(() => "(?, ?, ?)").join(", ");
  const expectedBindings = planned.flatMap((entry) => [entry.id, entry.startAt, entry.endAt]);

  const moveBookings = env.DB.prepare(
    `WITH proposed(id, old_start, old_lesson_type, old_location, new_start, new_end, new_amount) AS (
       VALUES ${proposedValues}
     )
     UPDATE bookings
     SET lesson_type_id = ?, location = ?, previous_starts_at = starts_at,
         starts_at = (SELECT new_start FROM proposed WHERE id = bookings.id),
         ends_at = (SELECT new_end FROM proposed WHERE id = bookings.id),
         amount_cents = (SELECT new_amount FROM proposed WHERE id = bookings.id),
         sequence = sequence + 1, reschedule_count = reschedule_count + 1,
         same_day_change = 0, updated_at = ?
     WHERE series_id = ? AND status = 'confirmed' AND starts_at > ?
       AND EXISTS (
         SELECT 1 FROM proposed p
         WHERE p.id = bookings.id AND p.old_start = bookings.starts_at
           AND p.old_lesson_type = bookings.lesson_type_id AND p.old_location = bookings.location
       )
       AND (SELECT COUNT(*) FROM bookings current
            WHERE current.series_id = ? AND current.status = 'confirmed' AND current.starts_at > ?) = ?
       AND (SELECT COUNT(*) FROM bookings current
            JOIN proposed p ON p.id = current.id AND p.old_start = current.starts_at
              AND p.old_lesson_type = current.lesson_type_id AND p.old_location = current.location
            WHERE current.series_id = ? AND current.status = 'confirmed' AND current.starts_at > ?) = ?
       AND (SELECT status FROM booking_series WHERE id = ? AND student_id = ?) = 'active'
       AND NOT EXISTS (SELECT 1 FROM bookings processing WHERE processing.series_id = bookings.series_id
         AND processing.status = 'confirmed' AND processing.payment_status = 'processing')
       AND NOT EXISTS (
         SELECT 1 FROM bookings other JOIN proposed p
           ON other.starts_at < p.new_end AND other.ends_at > p.new_start
         WHERE (other.status = 'confirmed'
                OR (other.status = 'pending_payment' AND other.hold_expires_at > ?))
           AND other.id NOT IN (SELECT id FROM proposed)
       )`
  ).bind(
    ...proposedBindings,
    lessonType.id,
    location,
    nowIso,
    seriesId,
    nowIso,
    seriesId,
    nowIso,
    // Every upcoming lesson, including any staying inside the 14-hour window.
    planned.length + kept.length,
    seriesId,
    nowIso,
    planned.length,
    seriesId,
    student.id,
    nowIso
  );

  // The recipe only moves if the first statement produced every expected row.
  const updateSeries = env.DB.prepare(
    `WITH expected(id, new_start, new_end) AS (VALUES ${expectedValues})
     UPDATE booking_series
     SET lesson_type_id = ?, location = ?, weekday = ?, minute_of_day = ?, filled_to = ?, updated_at = ?
     WHERE id = ? AND student_id = ? AND status = 'active'
       AND (SELECT COUNT(*) FROM bookings b JOIN expected e
            ON e.id = b.id AND e.new_start = b.starts_at AND e.new_end = b.ends_at
            WHERE b.series_id = ? AND b.status = 'confirmed') = ?`
  ).bind(
    ...expectedBindings,
    lessonType.id,
    location,
    requestedSlot.weekday,
    requestedSlot.minuteOfDay,
    planned[planned.length - 1].key,
    nowIso,
    seriesId,
    student.id,
    seriesId,
    planned.length
  );

  const [bookingResult, seriesResult] = await env.DB.batch([moveBookings, updateSeries]);
  if (
    (bookingResult?.meta?.changes ?? 0) !== planned.length ||
    (seriesResult?.meta?.changes ?? 0) !== 1
  ) {
    return fail("That sequence or one of its times has just changed. Please reload and try again.", 409, request, env);
  }

  const placeholders = planned.map(() => "?").join(", ");
  const { results: updatedResults } = await env.DB.prepare(
    `SELECT * FROM bookings WHERE id IN (${placeholders}) ORDER BY starts_at`
  )
    .bind(...planned.map((entry) => entry.id))
    .all();
  const updatedRows = updatedResults ?? [];
  const updatedSeries = await env.DB.prepare("SELECT * FROM booking_series WHERE id = ?").bind(seriesId).first();
  const settings = await loadSettings(env);
  const manageUrls = {};
  for (const row of updatedRows) {
    const token = await createManageToken(row.id, env.BOOKING_TOKEN_SECRET);
    manageUrls[row.id] = studentManageUrl(env, token);
  }

  ctx.waitUntil(
    notifySeries(env, {
      rows: updatedRows,
      lessonType,
      settings,
      series: updatedSeries,
      manageUrls,
      skipped: [],
      reason: "moved"
    })
  );

  return json(
    {
      ok: true,
      moved: updatedRows.length,
      // Start times of lessons left where they are, inside the 14-hour window.
      kept: kept.map((row) => row.starts_at),
      bookings: updatedRows.map((row) => publicBooking(row, lessonType, settings))
    },
    200,
    request,
    env
  );
}

async function handleGetBooking(request, env, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);

  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
  const settings = await loadSettings(env);

  const policy = changePolicy(row, new Date(), settings.minimumNoticeHours);

  return json(
    {
      booking: publicBooking(row, lessonType, settings),
      isPast: new Date(row.starts_at) <= new Date(),
      // The field keeps its original name for the site; it now means "inside
      // the 14-hour window". A saved-card booking charges the fee automatically.
      sameDayFeeApplies: policy.feeApplies,
      sameDayFeeAutomatic: policy.scheduled,
      changeLocked: policy.locked,
      refundOnCancel: policy.refundOnCancel,
      recurring: Boolean(row.series_id),
      durationPrices: row.series_id && row.student_id ? await recurringRates(env, row.student_id) : {},
      paymentsDue: {
        lesson: row.payment_status === "payment_due" ? row.charged_cents ?? row.amount_cents : null,
        sameDayFee: row.same_day_fee_status === "payment_due" ? row.same_day_fee_cents : null
      }
    },
    200,
    request,
    env
  );
}

async function handleReschedule(request, env, ctx, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);
  if (row.status === "cancelled") return fail("That lesson has already been cancelled.", 409, request, env);

  const now = new Date();
  if (new Date(row.starts_at) <= now) return fail("That lesson has already started. Please email Inês.", 409, request, env);

  // Only an older already-paid lesson is locked. A current saved-card lesson
  // stays changeable and the EUR 5 fee is charged below.
  const settings = await loadSettings(env);
  const policy = changePolicy(row, now, settings.minimumNoticeHours);
  if (policy.locked) {
    return fail(
      `This lesson is less than ${settings.minimumNoticeHours} hours away, so it can't be moved. If something has happened, reply to your confirmation email and Inês will help.`,
      409,
      request,
      env
    );
  }

  const body = await readJson(request);
  const previousLessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
  const lessonTypeId = cleanText(body.lessonType, 40) || row.lesson_type_id;
  const lessonType = await loadLessonType(env, lessonTypeId);
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);
  const location = normaliseLocation(body.location, row.location);

  const sameTime = Number.isFinite(Date.parse(body.startAt)) && Date.parse(body.startAt) === Date.parse(row.starts_at) && lessonType.id === row.lesson_type_id;
  if (sameTime && location === row.location) {
    return json({ booking: publicBooking(row, lessonType, settings), sameDayFeeApplied: false }, 200, request, env);
  }

  const typeChangeProblem = lessonTypeChangeProblem(row, previousLessonType, lessonType);
  if (typeChangeProblem) return fail(typeChangeProblem, 409, request, env);

  // Switching only between online and Porto keeps the time the lesson already
  // holds, so the notice window and published hours, which judge a new time,
  // do not apply. The overlap guard in the write below still does.
  const check = sameTime
    ? { ok: true, endAt: new Date(row.ends_at) }
    : await isSlotBookable(env, { startAt: body.startAt, lessonType, now, ignoreBookingId: row.id });
  if (!check.ok) return fail(check.reason, 409, request, env);

  // The fee is for changing inside the 14-hour window, judged against the
  // lesson they are moving away from. `same_day_change` keeps its column name.
  const sameDay = policy.late ? 1 : 0;
  const startsAt = new Date(body.startAt).toISOString();
  const endsAt = check.endAt.toISOString();
  const amountCents = await priceForMove(env, row, lessonType);
  if (body.expectedPriceCents !== undefined && body.expectedPriceCents !== amountCents) {
    return fail("Please reload and review the lesson price before confirming.", 409, request, env);
  }

  // Same gap as creating a booking: the check above and this write are two
  // statements, and a lesson can be claimed between them.
  /*
   * The row must still be exactly where the handler found it. Six round trips
   * happen between reading it and writing it, and without these two extra
   * conditions both of the obvious races land: a cancel arriving in that window
   * was overwritten — the lesson moved after it was cancelled, and the calendar
   * invite brought it back — and two simultaneous moves both reported success
   * while only one of them was true.
   */
  const moved = await env.DB.prepare(
    `UPDATE bookings SET lesson_type_id = ?, location = ?, starts_at = ?, ends_at = ?, previous_starts_at = ?,
       amount_cents = ?, sequence = sequence + 1, reschedule_count = reschedule_count + 1,
       same_day_change = ?,
       same_day_fee_status = CASE
         WHEN ? = 1 AND payment_status = 'scheduled' AND same_day_fee_status = 'not_required' THEN 'scheduled'
         ELSE same_day_fee_status END,
       same_day_fee_cents = CASE
         WHEN ? = 1 AND payment_status = 'scheduled' AND same_day_fee_cents IS NULL THEN ?
         ELSE same_day_fee_cents END,
       updated_at = ?
     WHERE id = ?
       AND status = 'confirmed'
       AND starts_at = ?
       AND lesson_type_id = ?
       AND sequence = ? AND payment_status != 'processing'
       AND NOT EXISTS (
         SELECT 1 FROM bookings other
         WHERE (other.status = 'confirmed' OR (other.status = 'pending_payment' AND other.hold_expires_at > ?))
           AND other.id != bookings.id
           AND other.starts_at < ? AND other.ends_at > ?
       )`
  )
    .bind(
      lessonType.id,
      location,
      startsAt,
      endsAt,
      row.starts_at,
      amountCents,
      sameDay,
      sameDay,
      sameDay,
      settings.sameDayChangeFeeCents,
      now.toISOString(),
      row.id,
      row.starts_at,
      row.lesson_type_id,
      row.sequence,
      now.toISOString(),
      endsAt,
      startsAt
    )
    .run();

  if ((moved?.meta?.changes ?? 0) === 0) {
    // Say which it was, rather than blaming the slot for a cancellation.
    const current = await env.DB.prepare("SELECT status FROM bookings WHERE id = ?").bind(row.id).first();
    if (current?.status === "cancelled") {
      return fail("That lesson has been cancelled, so it can't be moved.", 409, request, env);
    }
    return fail("That lesson has just changed. Please reload and try again.", 409, request, env);
  }

  const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
  const manageUrl = studentManageUrl(env, token);

  if (updated.same_day_fee_status === "scheduled") {
    ctx.waitUntil(chargeOneSameDayFee(env, updated.id));
  }

  ctx.waitUntil(
    notify(env, {
      event: "rescheduled",
      row: updated,
      lessonType,
      settings,
      manageUrl,
      previousStartsAt: row.starts_at,
      previousLessonType
    })
  );

  return json(
    { booking: publicBooking(updated, lessonType, settings), sameDayFeeApplied: Boolean(sameDay) },
    200,
    request,
    env
  );
}

async function claimRefund(env, row, requestedBy) {
  if (!stripeReady(env)) return false;
  const now = new Date().toISOString();
  const request = JSON.stringify({ bookingId: row.id, paymentIntent: row.stripe_payment_intent, amountCents: row.charged_cents ?? row.amount_cents ?? undefined });
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO booking_refunds (booking_id, request, requested_by, created_at)
      SELECT id, ?, ?, ? FROM bookings WHERE id = ? AND status = 'confirmed' AND payment_status = 'paid' AND sequence = ?`)
      .bind(request, requestedBy, now, row.id, row.sequence),
    env.DB.prepare(`UPDATE bookings SET payment_status = 'processing', updated_at = ?
      WHERE id = ? AND status = 'confirmed' AND payment_status = 'paid' AND sequence = ?
        AND EXISTS (SELECT 1 FROM booking_refunds WHERE booking_id = bookings.id AND status = 'pending')`)
      .bind(now, row.id, row.sequence)
  ]);
  return (results[0]?.meta?.changes ?? 0) > 0 && (results[1]?.meta?.changes ?? 0) > 0;
}

async function completeRefund(env, bookingId, now = new Date()) {
  const operation = await env.DB.prepare("SELECT * FROM booking_refunds WHERE booking_id = ? AND status = 'pending'").bind(bookingId).first();
  if (!operation) return null;
  const cutoff = new Date(now.getTime() - 23 * 3600000).toISOString();
  // With a known refund id, retrieval is always safe. Without one, stop before
  // Stripe may forget the idempotency key; a person must reconcile the result.
  if (!operation.stripe_refund_id && operation.created_at < cutoff) return null;
  const stale = new Date(now.getTime() - 10 * 60000).toISOString();
  const claimed = await env.DB.prepare("UPDATE booking_refunds SET attempted_at = ? WHERE booking_id = ? AND status = 'pending' AND (attempted_at IS NULL OR attempted_at < ?)")
    .bind(now.toISOString(), bookingId, stale).run();
  if (!(claimed?.meta?.changes > 0)) return null;
  try {
    const refund = operation.stripe_refund_id ? await retrieveRefund(env, operation.stripe_refund_id) : await refundPayment(env, JSON.parse(operation.request));
    if (!refund.id) return null;
    if (refund.id) await env.DB.prepare("UPDATE booking_refunds SET stripe_refund_id = ? WHERE booking_id = ?").bind(refund.id, bookingId).run();
    if (refund.status !== "succeeded") return null;
    await env.DB.batch([
      env.DB.prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, sequence = sequence + 1,
        same_day_change = 0, payment_status = 'refunded', updated_at = ?
        WHERE id = ? AND status = 'confirmed' AND payment_status = 'processing'`)
        .bind(now.toISOString(), operation.requested_by, now.toISOString(), bookingId),
      env.DB.prepare(`UPDATE booking_refunds SET status = 'completed' WHERE booking_id = ?
        AND EXISTS (SELECT 1 FROM bookings WHERE id = booking_refunds.booking_id AND status = 'cancelled' AND payment_status = 'refunded')`).bind(bookingId)
    ]);
    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
    return row?.status === "cancelled" && row.payment_status === "refunded" ? row : null;
  } catch {
    console.warn("refund-reconciliation-pending", bookingId);
    return null;
  }
}

export async function retryRefunds(env, now = new Date()) {
  if (!stripeReady(env)) return;
  const cutoff = new Date(now.getTime() - 23 * 3600000).toISOString();
  const { results } = await env.DB.prepare(`SELECT booking_id FROM booking_refunds WHERE status = 'pending'
    AND (stripe_refund_id IS NOT NULL OR created_at >= ?) AND (attempted_at IS NULL OR attempted_at < ?) ORDER BY created_at LIMIT 25`)
    .bind(cutoff, new Date(now.getTime() - 10 * 60000).toISOString()).all();
  for (const operation of results ?? []) {
    const row = await completeRefund(env, operation.booking_id, now);
    if (!row) continue;
    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
    await notify(env, { event: "cancelled", row, lessonType, settings: await loadSettings(env), manageUrl: "", byTeacher: row.cancelled_by === "teacher" });
  }
}

async function handleCancel(request, env, ctx, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);
  if (row.status === "cancelled") return fail("That lesson is already cancelled.", 409, request, env);

  const now = new Date();
  if (new Date(row.starts_at) <= now) {
    return fail("That lesson has already started. Please email Inês.", 409, request, env);
  }
  const settings = await loadSettings(env);
  const policy = changePolicy(row, now, settings.minimumNoticeHours);

  if (policy.locked) {
    return fail(
      `This lesson is less than ${settings.minimumNoticeHours} hours away, so it can't be cancelled. If something has happened, reply to your confirmation email and Inês will help.`,
      409,
      request,
      env
    );
  }

  const refunded = 0;
  if (policy.refundOnCancel) {
    if (!await claimRefund(env, row, "student")) return fail("That lesson has just changed. Please reload.", 409, request, env);
    const updated = await completeRefund(env, row.id);
    if (!updated) return fail("Your cancellation request is recorded. The refund is being confirmed; the lesson stays reserved and locked until then. Please check back shortly.", 503, request, env);
    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
    ctx.waitUntil(notify(env, { event: "cancelled", row: updated, lessonType, settings, manageUrl: "" }));
    return json({ booking: publicBooking(updated, lessonType, settings), sameDayFeeApplied: false }, 200, request, env);
  }

  const sameDay = policy.feeApplies ? 1 : 0;
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();

  const cancelled = await env.DB.prepare(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'student',
       sequence = sequence + 1, same_day_change = ?, updated_at = ?,
       payment_status = CASE WHEN ? = 1 THEN 'refunded' ELSE payment_status END,
       same_day_fee_status = CASE
         WHEN ? = 1 AND payment_status = 'scheduled' AND same_day_fee_status = 'not_required' THEN 'scheduled'
         ELSE same_day_fee_status END,
       same_day_fee_cents = CASE
         WHEN ? = 1 AND payment_status = 'scheduled' AND same_day_fee_cents IS NULL THEN ?
         ELSE same_day_fee_cents END
     WHERE id = ? AND status = 'confirmed' AND sequence = ? AND payment_status != 'processing'`
  )
    .bind(
      now.toISOString(),
      sameDay,
      now.toISOString(),
      refunded,
      sameDay,
      sameDay,
      settings.sameDayChangeFeeCents,
      row.id,
      row.sequence
    )
    .run();

  if (!(cancelled?.meta?.changes > 0)) return fail("That lesson has just changed. Please reload and try again.", 409, request, env);

  const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();

  if (updated.same_day_fee_status === "scheduled") {
    ctx.waitUntil(chargeOneSameDayFee(env, updated.id));
  }

  ctx.waitUntil(notify(env, { event: "cancelled", row: updated, lessonType, settings, manageUrl: "" }));

  return json({ booking: publicBooking(updated, lessonType, settings), sameDayFeeApplied: Boolean(sameDay) }, 200, request, env);
}


// --- Stripe -----------------------------------------------------------------

/**
 * Confirms a booking once Stripe says the money arrived.
 *
 * Nothing here trusts the request until the signature verifies, and an
 * authentic event still has to match the exact session, amount and currency
 * stored for the booking. The booking update is conditional and the event id
 * is recorded only after the effect succeeds, so a crash cannot leave a failed
 * delivery permanently labelled as handled. A 200 is returned for events we
 * deliberately ignore, or Stripe keeps retrying them.
 */
async function handleStripeWebhook(request, env, ctx) {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("Not configured.", { status: 503 });
  if (!stripeReady(env)) return new Response("Stripe mode is not ready.", { status: 503 });

  const payload = await readBody(request, 262144);
  const verified = await verifyWebhook(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return new Response("Bad signature.", { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Bad payload.", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("Ignored.", { status: 200 });
  }

  if (event.livemode !== (stripeMode(env) === "live")) return new Response("Wrong payment environment.", { status: 400 });

  if (!event.id || typeof event.id !== "string") return new Response("No event id.", { status: 400 });

  const handled = await env.DB.prepare("SELECT id FROM stripe_events WHERE id = ?").bind(event.id).first();
  if (handled) return new Response("Already handled.", { status: 200 });

  const session = event.data?.object ?? {};
  const bookingId = session.client_reference_id;
  if (!bookingId) return new Response("No booking reference.", { status: 200 });

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
  if (!row) return new Response("Unknown booking.", { status: 200 });
  const student = await env.DB.prepare("SELECT stripe_customer_id FROM students WHERE id = ?").bind(row.student_id).first();
  if (student?.stripe_customer_id && session.customer !== student.stripe_customer_id) {
    return new Response("Customer does not match booking.", { status: 400 });
  }

  let response;
  const purpose = String(session.metadata?.purpose ?? "initial");

  if (purpose === "card_setup") {
    const problem = setupSessionProblem(session, row);
    if (problem) {
      console.warn("stripe-setup-rejected", row.reference, problem);
      return new Response("Session does not match booking.", { status: 400 });
    }
    if (session.metadata?.series_id && row.series_id !== session.metadata.series_id) {
      return new Response("Session does not match booking.", { status: 400 });
    }
    response = await confirmCardSetup(env, ctx, session, row);
  } else {
    const sameDayFee = purpose === "same-day-fee-due";
    const expectedAmount = sameDayFee
      ? row.same_day_fee_cents
      : (row.charged_cents ?? row.amount_cents);
    const expectedSession = sameDayFee ? row.same_day_fee_session_id : row.stripe_session_id;
    const problem = checkoutSessionProblem(session, {
      ...row,
      amount_cents: expectedAmount,
      stripe_session_id: expectedSession
    });
    if (problem === "payment is not paid") return new Response("Payment pending.", { status: 200 });
    if (problem) {
      console.warn("stripe-session-rejected", row.reference, problem);
      return new Response("Session does not match booking.", { status: 400 });
    }

    const now = new Date().toISOString();
    if (sameDayFee) {
      await env.DB.prepare(
        `UPDATE bookings SET same_day_fee_status = 'paid', same_day_fee_payment_intent = ?, updated_at = ?
         WHERE id = ? AND same_day_fee_session_id = ? AND same_day_fee_status = 'payment_due'`
      )
        .bind(session.payment_intent, now, row.id, session.id)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE bookings SET payment_status = 'paid', stripe_payment_intent = ?, charged_cents = ?, updated_at = ?
         WHERE id = ? AND stripe_session_id = ? AND payment_status = 'payment_due'`
      )
        .bind(session.payment_intent, expectedAmount, now, row.id, session.id)
        .run();
    }

    const settled = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
    const paid = sameDayFee
      ? settled?.same_day_fee_status === "paid" && settled?.same_day_fee_payment_intent === session.payment_intent
      : settled?.payment_status === "paid" && settled?.stripe_payment_intent === session.payment_intent;
    if (!paid) return new Response("Booking could not be settled.", { status: 409 });

    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(settled.lesson_type_id)
      .first();
    if (sameDayFee) {
      ctx.waitUntil(notifySameDayFeeCharged(env, { row: settled, lessonType, amountCents: expectedAmount }));
    } else {
      ctx.waitUntil(
        notifyLessonCharged(env, {
          row: settled,
          lessonType,
          amountCents: expectedAmount,
          noShow: settled.attendance_status === "no_show"
        })
      );
    }
    response = new Response("ok", { status: 200 });
  }

  if (response.status >= 400) return response;

  try {
    await env.DB.prepare("INSERT INTO stripe_events (id, type, processed_at) VALUES (?, ?, ?)")
      .bind(event.id, event.type, new Date().toISOString())
      .run();
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/UNIQUE|constraint/i.test(message)) return new Response("Already handled.", { status: 200 });
    throw error;
  }

  return response;
}

/** Confirm held lessons after Stripe has authenticated and saved a card. */
async function confirmCardSetup(env, ctx, session, row) {
  if (session.metadata?.selection_count) return confirmSelectionCardSetup(env, ctx, session, row);
  if (row.status === "confirmed" && row.payment_status !== "pending") return new Response("Already confirmed.", { status: 200 });
  if (row.status !== "pending_payment" || !row.hold_expires_at || new Date(row.hold_expires_at) <= new Date()) {
    return new Response("That booking hold has expired. Please choose a new time.", { status: 409 });
  }
  let intent;
  try {
    intent = await retrieveSetupIntent(env, session.setup_intent);
  } catch (error) {
    console.error("retrieve-setup-intent", row.reference, String(error?.message ?? error));
    return new Response("Card setup could not be verified.", { status: 502 });
  }

  const paymentMethod =
    typeof intent?.payment_method === "string" ? intent.payment_method : intent?.payment_method?.id;
  const customer = typeof intent?.customer === "string" ? intent.customer : intent?.customer?.id;
  if (intent?.status !== "succeeded" || !paymentMethod || customer !== session.customer) {
    return new Response("Card setup is not complete.", { status: 409 });
  }

  await env.DB.prepare(
    "UPDATE students SET stripe_customer_id = ?, stripe_payment_method = ? WHERE id = ?"
  )
    .bind(customer, paymentMethod, row.student_id)
    .run();

  const now = new Date().toISOString();
  const seriesId = session.metadata?.series_id;
  if (seriesId) {
    const series = await env.DB.prepare("SELECT * FROM booking_series WHERE id = ?").bind(seriesId).first();
    if (!series || series.student_id !== row.student_id) return new Response("Unknown series.", { status: 409 });

    await env.DB.prepare(
      `UPDATE bookings SET status = 'confirmed', payment_status = 'scheduled', hold_expires_at = NULL, updated_at = ?
       WHERE series_id = ? AND stripe_session_id = ? AND status = 'pending_payment' AND payment_status = 'pending' AND hold_expires_at > ?`
    )
      .bind(now, seriesId, session.id, now)
      .run();
    await env.DB.prepare("UPDATE booking_series SET automatic_payment = 1, updated_at = ? WHERE id = ?")
      .bind(now, seriesId)
      .run();

    const { results: rows } = await env.DB.prepare(
      "SELECT * FROM bookings WHERE series_id = ? AND status = 'confirmed' ORDER BY starts_at"
    )
      .bind(seriesId)
      .all();
    if (!rows?.length) return new Response("Series could not be confirmed.", { status: 409 });

    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(series.lesson_type_id)
      .first();
    const settings = await loadSettings(env);
    let skipped = [];
    try {
      skipped = JSON.parse(session.metadata.skipped ?? "[]").map((startAt) => ({ startAt }));
    } catch {
      skipped = [];
    }
    const manageUrls = {};
    for (const occurrence of rows) {
      const token = await createManageToken(occurrence.id, env.BOOKING_TOKEN_SECRET);
      manageUrls[occurrence.id] = studentManageUrl(env, token);
    }
    ctx.waitUntil(notifySeries(env, { rows, lessonType, settings, series, manageUrls, skipped }));
    return new Response("ok", { status: 200 });
  }

  await env.DB.prepare(
    `UPDATE bookings SET status = 'confirmed', payment_status = 'scheduled', hold_expires_at = NULL, updated_at = ?
     WHERE id = ? AND stripe_session_id = ? AND status = 'pending_payment' AND payment_status = 'pending' AND hold_expires_at > ?`
  )
    .bind(now, row.id, session.id, now)
    .run();
  const confirmed = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
  if (confirmed?.status !== "confirmed" || confirmed?.payment_status !== "scheduled") {
    return new Response("Booking could not be confirmed.", { status: 409 });
  }

  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
    .bind(confirmed.lesson_type_id)
    .first();
  const settings = await loadSettings(env);
  const token = await createManageToken(confirmed.id, env.BOOKING_TOKEN_SECRET);
  ctx.waitUntil(
    notify(env, {
      event: "booked",
      row: confirmed,
      lessonType,
      settings,
      manageUrl: studentManageUrl(env, token)
    })
  );
  return new Response("ok", { status: 200 });
}

/** A shared setup must confirm every held lesson together, exactly once. */
async function confirmSelectionCardSetup(env, ctx, session, anchor) {
  const expected = Number(session.metadata.selection_count);
  if (!Number.isInteger(expected) || expected < 2 || expected > 24) return new Response("Invalid selection.", { status: 400 });
  const loadRows = async () => (await env.DB.prepare(
    "SELECT * FROM bookings WHERE stripe_session_id = ? AND student_id = ? ORDER BY starts_at"
  ).bind(session.id, anchor.student_id).all()).results;
  const rows = await loadRows();
  if (rows.length !== expected || !rows.some((row) => row.id === anchor.id)) return new Response("Selection does not match checkout.", { status: 409 });
  if (rows.every((row) => row.status === "confirmed" && row.payment_status !== "pending")) return new Response("Already confirmed.", { status: 200 });
  const now = new Date().toISOString();
  if (rows.some((row) => row.status !== "pending_payment" || row.payment_status !== "pending" || !row.hold_expires_at || row.hold_expires_at <= now)) {
    return new Response("That booking hold has expired. Please choose your times again.", { status: 409 });
  }
  let intent;
  try { intent = await retrieveSetupIntent(env, session.setup_intent); }
  catch (error) {
    console.error("retrieve-selection-setup", anchor.reference, String(error?.message ?? error));
    return new Response("Card setup could not be verified.", { status: 502 });
  }
  const paymentMethod = typeof intent?.payment_method === "string" ? intent.payment_method : intent?.payment_method?.id;
  const customer = typeof intent?.customer === "string" ? intent.customer : intent?.customer?.id;
  if (intent?.status !== "succeeded" || !paymentMethod || customer !== session.customer) {
    return new Response("Card setup is not complete.", { status: 409 });
  }
  const confirmedAt = new Date().toISOString();
  const [claimed] = await env.DB.batch([
    env.DB.prepare(
      `WITH eligible AS MATERIALIZED (
         SELECT (SELECT COUNT(*) FROM bookings pending WHERE pending.stripe_session_id = ?2 AND pending.student_id = ?3) = ?4
           AND NOT EXISTS (SELECT 1 FROM bookings invalid WHERE invalid.stripe_session_id = ?2 AND invalid.student_id = ?3
             AND (invalid.status != 'pending_payment' OR invalid.payment_status != 'pending' OR invalid.hold_expires_at IS NULL OR invalid.hold_expires_at <= ?1)) AS ready
       )
       UPDATE bookings SET status = 'confirmed', payment_status = 'scheduled', hold_expires_at = NULL, updated_at = ?1
       WHERE stripe_session_id = ?2 AND student_id = ?3 AND (SELECT ready FROM eligible)`
    ).bind(confirmedAt, session.id, anchor.student_id, expected),
    env.DB.prepare(
      `UPDATE students SET stripe_customer_id = ?, stripe_payment_method = ? WHERE id = ?
       AND (SELECT COUNT(*) FROM bookings WHERE stripe_session_id = ? AND student_id = students.id AND status = 'confirmed' AND payment_status = 'scheduled') = ?`
    ).bind(customer, paymentMethod, anchor.student_id, session.id, expected)
  ]);
  // A concurrent webhook can win the transition. Only its request sends mail.
  if (claimed.meta.changes !== expected) {
    const current = await loadRows();
    return current.length === expected && current.every((row) => row.status === "confirmed" && row.payment_status !== "pending")
      ? new Response("Already confirmed.", { status: 200 })
      : new Response("The selected lessons could not be confirmed.", { status: 409 });
  }
  const confirmed = await loadRows();
  const { results: series } = await env.DB.prepare(
    "SELECT * FROM booking_series WHERE id IN (SELECT DISTINCT series_id FROM bookings WHERE stripe_session_id = ? AND student_id = ?)"
  ).bind(session.id, anchor.student_id).all();
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(anchor.lesson_type_id).first();
  const settings = await loadSettings(env);
  let skipped = [];
  try { skipped = JSON.parse(session.metadata.skipped ?? "[]").map((startAt) => ({ startAt })); } catch { /* Optional display detail. */ }
  ctx.waitUntil(notifySelection(env, { rows: confirmed, lessonType, settings, series, skipped }));
  return new Response("ok", { status: 200 });
}

/**
 * Releases slots whose checkout was abandoned.
 *
 * Called opportunistically rather than on a schedule: availability already
 * ignores an expired hold, so this is only housekeeping to stop the table
 * filling with dead rows.
 */
async function releaseExpiredHolds(env) {
  await env.DB.prepare(
    "DELETE FROM bookings WHERE status = 'pending_payment' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?"
  )
    .bind(new Date().toISOString())
    .run();

  // A saved-card run whose setup was abandoned leaves a series row with no
  // bookings once the holds above are swept; without this it lingers forever.
  await env.DB.prepare(
    `DELETE FROM booking_series WHERE id IN (
       SELECT s.id FROM booking_series s
       LEFT JOIN bookings b ON b.series_id = s.id
       WHERE b.id IS NULL
     )`
  ).run();
}

/**
 * Replace a student's own unfinished card setup before their new booking claims.
 *
 * A setup hold reserves its lessons even from their owner, so backing out of
 * Stripe's form, reloading or closing the tab left the student refused by their
 * own hold, and for 35 minutes it counted as a prior lesson against the trial.
 * A hold goes only once Stripe reports its Checkout Session expired, which it
 * does only to a session that can no longer complete: a setup the student did
 * finish keeps its hold for the webhook to confirm. A lapsed hold can never be
 * confirmed, so it simply goes.
 */
async function releaseOwnCardSetups(env, ctx, studentId, now) {
  const { results } = await env.DB.prepare(
    `SELECT id, series_id, stripe_session_id, hold_expires_at FROM bookings
     WHERE student_id = ? AND status = 'pending_payment' AND payment_status = 'pending'`
  )
    .bind(studentId)
    .all();
  const holds = results ?? [];
  if (!holds.length) return;

  const nowIso = now.toISOString();
  const released = [];
  for (const sessionId of new Set(holds.map((hold) => hold.stripe_session_id ?? ""))) {
    const group = holds.filter((hold) => (hold.stripe_session_id ?? "") === sessionId);
    if (group.every((hold) => !hold.hold_expires_at || hold.hold_expires_at <= nowIso)) {
      released.push(...group);
      // Its Stripe form may still be open; completing it would confirm nothing.
      if (sessionId) ctx.waitUntil(expireCheckoutSession(env, sessionId).catch(() => undefined));
    } else if (sessionId && await checkoutSessionExpired(env, sessionId)) {
      released.push(...group);
    }
  }
  if (!released.length) return;

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM bookings WHERE id IN (SELECT value FROM json_each(?)) AND student_id = ?
         AND status = 'pending_payment' AND payment_status = 'pending'`
    ).bind(JSON.stringify(released.map((hold) => hold.id)), studentId),
    env.DB.prepare(
      `DELETE FROM booking_series WHERE id IN (SELECT value FROM json_each(?)) AND student_id = ?
         AND NOT EXISTS (SELECT 1 FROM bookings WHERE series_id = booking_series.id)`
    ).bind(JSON.stringify([...new Set(released.map((hold) => hold.series_id).filter(Boolean))]), studentId)
  ]);
}

/** True only once Stripe reports the session expired, so it can never complete. */
async function checkoutSessionExpired(env, sessionId) {
  try {
    if ((await expireCheckoutSession(env, sessionId))?.status === "expired") return true;
  } catch {
    // Already expired, already complete, or Stripe unreachable: read which.
  }
  try {
    return (await retrieveCheckoutSession(env, sessionId))?.status === "expired";
  } catch {
    return false;
  }
}

// --- Accounts ---------------------------------------------------------------

async function handleRegister(request, env) {
  const body = await readJson(request);
  const email = normaliseEmail(body.email);
  const name = cleanText(body.name, 120);
  const phone = cleanText(body.phone, 40);
  const nif = normaliseNif(body.nif);
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : PORTO;

  if (name.length < 2) return fail("Please give your name.", 400, request, env);
  if (!isEmail(email)) return fail("Please give a valid email address.", 400, request, env);

  const problem = passwordProblem(body.password) ?? nifProblem(nif);
  if (problem) return fail(problem, 400, request, env);

  // Accounts need no email proof, so the address they come from is the only
  // brake on minting them to hold slots or to send mail.
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (!await takeRateLimit(env, `register:${ip}`, 5, 3600)) {
    return fail("Too many new accounts from this connection. Please try again in an hour.", 429, request, env);
  }

  const existing = await env.DB.prepare("SELECT id FROM students WHERE email = ?").bind(email).first();
  if (existing) {
    return fail("There is already an account with that email. Try signing in instead.", 409, request, env);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO students (id, email, name, phone, nif, timezone, password_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, email, name, phone, nif, timezone, await hashPassword(body.password), now, now)
    .run();

  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
  return json(
    { student: publicStudent(student), session: await createSession(id, env.BOOKING_TOKEN_SECRET) },
    201,
    request,
    env
  );
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  const email = normaliseEmail(body.email);

  if (!isEmail(email)) return fail("Please give a valid email address.", 400, request, env);

  if (await tooManyFailures(env, email)) {
    return fail("Too many attempts. Please wait a few minutes and try again.", 429, request, env);
  }

  const student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();

  // One message for both cases, so this cannot be used to discover which
  // addresses have accounts. The password is still verified against a dummy
  // hash when there is no account, so the reply takes the same time either way.
  const stored = student?.password_hash || "pbkdf2$6x100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const correct = await verifyPassword(String(body.password ?? ""), stored);

  if (!student || !correct) {
    await recordFailure(env, email);
    return fail("That email and password do not match.", 401, request, env);
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE students SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), student.id),
    env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email)
  ]);

  return json(
    { student: publicStudent(student), session: await createSession(student.id, env.BOOKING_TOKEN_SECRET, student.session_version ?? 0) },
    200,
    request,
    env
  );
}

/**
 * Signs in with a Google ID token, creating the account on first use.
 *
 * Matching is by verified email, so someone who registered with a password and
 * later uses Google lands on the same account and sees the same lessons, rather
 * than quietly acquiring a second one.
 */
async function handleGoogleSignIn(request, env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) return fail("Google sign-in is not configured.", 503, request, env);

  const body = await readJson(request);
  const profile = await verifyGoogleIdToken(body.credential, clientId);
  if (!profile) return fail("That Google sign-in could not be verified. Please try again.", 401, request, env);

  const now = new Date().toISOString();

  /*
   * The Google account id first, the address only as a fallback.
   *
   * Matching on email alone and then overwriting google_sub was an account
   * takeover waiting to happen: anyone who could point their own row at an
   * address someone else uses with Google would receive that person's account
   * on their next sign-in, and keep a password on it afterwards. `sub` is the
   * identifier Google actually promises is stable and unique to one account.
   * Email remains the fallback so someone who registered with a password and
   * later uses Google still lands on their own account — but only when that
   * row is not already claimed by a different Google account.
   */
  let student = await env.DB.prepare("SELECT * FROM students WHERE google_sub = ?").bind(profile.sub).first();

  if (!student) {
    const byEmail = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(profile.email).first();
    if (byEmail?.google_sub && byEmail.google_sub !== profile.sub) {
      return fail(
        "That address is already linked to a different Google account. Please sign in with your password.",
        409,
        request,
        env
      );
    }
    student = byEmail ?? null;
  }

  if (student) {
    // The address is deliberately not rewritten here. A student who changed it
    // on the site means that change to stand, and forcing it back to whatever
    // Google holds would both undo them and collide with the unique index.
    if (!student.google_sub) {
      // Registration did not prove ownership of this email. The verified
      // owner may keep the account's data, but must not inherit an attacker's
      // password or sessions. This first-link transition is atomic under two
      // concurrent Google callbacks; subsequent Google logins change neither.
      await env.DB.batch([
        env.DB.prepare(`UPDATE students SET google_sub = ?, password_hash = '', session_version = session_version + 1, last_login_at = ?
          WHERE id = ? AND google_sub IS NULL`).bind(profile.sub, now, student.id),
        env.DB.prepare("DELETE FROM password_resets WHERE student_id = ?").bind(student.id),
        env.DB.prepare("DELETE FROM email_changes WHERE student_id = ?").bind(student.id)
      ]);
    } else {
      await env.DB.prepare("UPDATE students SET last_login_at = ? WHERE id = ? AND google_sub = ?")
        .bind(now, student.id, profile.sub).run();
    }
    student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(student.id).first();
    if (student.google_sub !== profile.sub) return fail("That address is linked to another Google account.", 409, request, env);
  } else {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO students (id, email, name, phone, timezone, password_hash, google_sub, created_at, last_login_at)
       VALUES (?, ?, ?, '', ?, '', ?, ?, ?)`
    )
      .bind(
        id,
        profile.email,
        profile.name || profile.email.split("@")[0],
        isValidTimeZone(body.timezone) ? body.timezone : PORTO,
        profile.sub,
        now,
        now
      )
      .run();
    student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
  }

  return json(
    { student: publicStudent(student), session: await createSession(student.id, env.BOOKING_TOKEN_SECRET, student.session_version ?? 0) },
    200,
    request,
    env
  );
}

async function handleForgot(request, env, ctx) {
  const body = await readJson(request);
  const email = normaliseEmail(body.email);
  const student = isEmail(email)
    ? await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first()
    : null;

  // Three an hour per recipient: the per-address limit on /auth/ alone let one
  // connection send forty resets to the same inbox. Past the limit the answer
  // is unchanged, so the throttle reveals nothing either.
  if (student && await takeRateLimit(env, `forgot:${student.id}`, 3, 3600)) {
    const token = await createResetToken(student.id, env.BOOKING_TOKEN_SECRET);
    const nonce = token.split(".")[2];
    await env.DB.prepare("INSERT OR REPLACE INTO password_resets (nonce, student_id, created_at) VALUES (?, ?, ?)")
      .bind(nonce, student.id, new Date().toISOString())
      .run();

    const settings = await loadSettings(env);
    const resetUrl = siteUrl(env, `/reset-password/?token=${encodeURIComponent(token)}`);

    ctx.waitUntil(
      deliver(env, {
        to: student.email,
        subject: "Reset your password — Português com a Inês",
        kind: "password_reset",
        dedupeKey: `reset:${nonce}`,
        replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
        content: {
          heading: "Reset your password",
          preheader: "Choose a new password — the link works for one hour.",
          intro: `Olá ${student.name.split(" ")[0]}, use the button below to choose a new password. The link works for one hour, and only once.`,
          callout: "",
          rows: [],
          action: { label: "Choose a new password", url: resetUrl },
          footer: "If you didn't ask for this, you can ignore it — your password has not changed."
        }
      })
    );
  }

  // Always the same answer, whether or not the address has an account.
  return json({ ok: true }, 200, request, env);
}

async function handleReset(request, env) {
  const body = await readJson(request);
  const parsed = await readResetToken(body.token, env.BOOKING_TOKEN_SECRET);
  if (!parsed) return fail("That reset link has expired. Please request a new one.", 400, request, env);

  const problem = passwordProblem(body.password);
  if (problem) return fail(problem, 400, request, env);

  // Single use: the row is the record that this token has not been spent.
  const record = await env.DB.prepare("SELECT * FROM password_resets WHERE nonce = ? AND student_id = ?")
    .bind(parsed.nonce, parsed.studentId)
    .first();
  if (!record) return fail("That reset link has already been used. Please request a new one.", 400, request, env);

  const reset = await env.DB.batch([
    env.DB.prepare(`UPDATE students SET password_hash = ?, session_version = session_version + 1
      WHERE id = ? AND EXISTS (SELECT 1 FROM password_resets WHERE nonce = ? AND student_id = students.id)`).bind(
      await hashPassword(body.password),
      parsed.studentId,
      parsed.nonce
    ),
    env.DB.prepare("DELETE FROM password_resets WHERE student_id = ?").bind(parsed.studentId),
    env.DB.prepare("DELETE FROM login_attempts WHERE email = (SELECT email FROM students WHERE id = ?)").bind(
      parsed.studentId
    )
  ]);

  if (!(reset[0]?.meta?.changes > 0)) return fail("That reset link has already been used.", 400, request, env);

  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(parsed.studentId).first();
  return json(
    { student: publicStudent(student), session: await createSession(student.id, env.BOOKING_TOKEN_SECRET, student.session_version ?? 0) },
    200,
    request,
    env
  );
}

async function handleRecurringRates(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);
  if (request.method === "POST") {
    if (!await takeRateLimit(env, `rate:${student.id}`, 8)) {
      return fail("Too many attempts. Please wait 15 minutes before trying again.", 429, request, env);
    }
    const body = await readJson(request);
    const rate = findRecurringCode(env.PRIVATE_RECURRING_CODES, body.code, body.durationMinutes);
    if (!rate) return fail("That code isn't available for this lesson length. Check the code with Inês.", 400, request, env);
    // A first grant wins, including simultaneous redemptions. Neither a new
    // code nor removal from the catalogue silently replaces an agreed rate.
    await env.DB.prepare(
      `INSERT INTO student_recurring_rates (student_id, duration_minutes, amount_cents, redeemed_at)
       VALUES (?, ?, ?, ?) ON CONFLICT(student_id, duration_minutes) DO NOTHING`
    ).bind(student.id, rate.duration, rate.cents, new Date().toISOString()).run();
    const saved = await recurringRates(env, student.id);
    if (saved[rate.duration] !== rate.cents) {
      return fail("You already have an agreed rate for this lesson length. Ask Inês if it needs to change.", 409, request, env);
    }
  }
  return json({ rates: await recurringRates(env, student.id) }, 200, request, env);
}

async function handleMe(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const settings = await loadSettings(env);
  const { results } = await env.DB.prepare(
    `SELECT b.*, l.name AS lesson_name, l.duration_minutes, l.price_cents
     FROM bookings b JOIN lesson_types l ON l.id = b.lesson_type_id
     WHERE b.student_id = ? ORDER BY b.starts_at DESC`
  )
    .bind(student.id)
    .all();

  const now = new Date();
  const bookings = await Promise.all(
    (results ?? []).map(async (row) => ({
      reference: row.reference,
      status: row.status,
      startAt: row.starts_at,
      endAt: row.ends_at,
      cancelledAt: row.cancelled_at ?? null,
      location: row.location,
      meetingUrl: meetingUrl(row),
      notes: row.notes,
      lessonType: {
        id: row.lesson_type_id,
        name: row.lesson_name,
        durationMinutes: row.duration_minutes,
        priceCents: row.amount_cents ?? row.price_cents
      },
      isPast: new Date(row.starts_at) <= now,
      sameDayFeeApplies: changePolicy(row, now, settings.minimumNoticeHours).feeApplies,
      sameDayFeeAutomatic: row.payment_status === "scheduled" || row.payment_status === "processing",
      changeLocked: changePolicy(row, now, settings.minimumNoticeHours).locked,
      paymentStatus: row.payment_status,
      seriesId: row.series_id ?? null,
      manageToken: await createManageToken(row.id, env.BOOKING_TOKEN_SECRET)
    }))
  );

  // Only what the page needs to say "this repeats, and here is how to stop it".
  const { results: seriesRows } = await env.DB.prepare(
    `SELECT s.*, COUNT(b.id) AS upcoming
     FROM booking_series s
     LEFT JOIN bookings b
       ON b.series_id = s.id AND b.status = 'confirmed' AND b.starts_at > ?
     WHERE s.student_id = ? AND s.status = 'active'
     GROUP BY s.id`
  )
    .bind(now.toISOString(), student.id)
    .all();

  const series = (seriesRows ?? []).map((row) => ({
    id: row.id,
    weekday: row.weekday,
    minuteOfDay: row.minute_of_day,
    occurrences: row.occurrences ?? null,
    openEnded: row.occurrences === null,
    upcoming: row.upcoming ?? 0
  }));

  return json(
    { student: publicStudent(student), bookings, series, sameDayFeeCents: settings.sameDayChangeFeeCents },
    200,
    request,
    env
  );
}

/**
 * Ask to change the address you sign in with.
 *
 * Nothing moves here. The new address is only written once it has proved it
 * receives mail, because an address change that takes effect on assertion alone
 * is a way to point your account at somebody else's inbox — and, before the
 * Google matching fix that ships with this, a way to take their account.
 *
 * The answer is the same whether or not the address is already taken. Telling
 * the caller "that one exists" would turn this endpoint into a way to test
 * whether a given person has an account, which is the thing sign-in and
 * forgotten-password already go out of their way not to reveal.
 */
async function handleRequestEmailChange(request, env, ctx) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const body = await readJson(request);
  const email = normaliseEmail(body.email);
  if (!isEmail(email)) return fail("That email address doesn't look right.", 400, request, env);
  if (email === student.email) return fail("That's already your email address.", 400, request, env);

  // Each request mails an address the account has not proved it owns, so both
  // the sender and the recipient are bounded. Checked before the taken/free
  // fork so the limit says nothing about whether the address has an account.
  if (
    !await takeRateLimit(env, `email-change:${student.id}`, 3, 3600) ||
    !await takeRateLimit(env, `email-change-to:${email}`, 3, 3600)
  ) {
    return fail("That's several requests in a short time. Please try again in an hour.", 429, request, env);
  }

  const taken = await env.DB.prepare("SELECT id FROM students WHERE email = ?").bind(email).first();
  const now = new Date().toISOString();

  if (!taken) {
    const token = await createResetToken(student.id, env.BOOKING_TOKEN_SECRET);
    const nonce = token.split(".")[2];

    // One pending change per student: asking again replaces the last request
    // rather than leaving a second live link in a second inbox.
    await env.DB.prepare("DELETE FROM email_changes WHERE student_id = ?").bind(student.id).run();
    await env.DB.prepare(
      "INSERT INTO email_changes (nonce, student_id, new_email, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(nonce, student.id, email, now)
      .run();

    const settings = await loadSettings(env);
    const confirmUrl = siteUrl(env, `/book/?view=lessons&emailToken=${encodeURIComponent(token)}`);

    ctx.waitUntil(
      deliver(env, {
        to: email,
        subject: "Confirm your new email — Português com a Inês",
        kind: "email_change",
        dedupeKey: `email-change:${nonce}`,
        replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
        content: {
          heading: "Confirm this address",
          preheader: "One click, and this becomes the address you sign in with.",
          intro: `Olá ${student.name.split(" ")[0]}, confirm this address and it becomes the one you sign in with and receive lesson emails at. The link works for one hour, and only once.`,
          callout: "",
          rows: [{ label: "New address", value: email }],
          action: { label: "Confirm this address", url: confirmUrl },
          footer: "If you didn't ask for this, ignore it — nothing has changed."
        }
      })
    );

    // And a word to the address on file, which is the one that would notice a
    // change nobody asked for.
    ctx.waitUntil(
      deliver(env, {
        to: student.email,
        subject: "Someone asked to change your email — Português com a Inês",
        kind: "email_change_notice",
        dedupeKey: `email-change-notice:${nonce}`,
        replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
        content: {
          heading: "A change was requested",
          preheader: "Your address has not changed yet.",
          intro: `Olá ${student.name.split(" ")[0]}, someone signed in to your account and asked to move it to ${email}. Nothing has changed yet — it only takes effect if that address confirms.`,
          callout: "If this wasn't you, change your password now and tell Inês.",
          rows: [],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return json({ ok: true, pending: email }, 200, request, env);
}

/**
 * Apply a change the new address has proved.
 *
 * Two loose ends are tidied here rather than left for later: any live password
 * reset is dropped, because a reset link already sitting in the old mailbox
 * would otherwise stay valid for its remaining hour and let whoever holds that
 * mailbox set a password on the account; and future lessons are re-addressed,
 * because that is where her confirmations and reminders are sent. Past and
 * cancelled lessons keep the address they were actually taken under — that is
 * the record of what happened, and rewriting it would be a small lie.
 */
async function handleConfirmEmailChange(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const body = await readJson(request);
  // readResetToken returns { studentId, nonce }, not a string. Comparing the
  // object to an id was never equal, so every confirmation was refused —
  // including the right person's, with a valid link. It failed closed, so it
  // was a dead feature rather than an open door, but it was completely dead.
  const parsed = await readResetToken(body.token, env.BOOKING_TOKEN_SECRET);
  if (!parsed || parsed.studentId !== student.id) {
    return fail("That link is no longer valid. Please ask for a new one.", 400, request, env);
  }

  const nonce = parsed.nonce;
  const pending = await env.DB.prepare("SELECT * FROM email_changes WHERE nonce = ? AND student_id = ?")
    .bind(nonce, student.id)
    .first();
  if (!pending) return fail("That link has already been used. Please ask for a new one.", 400, request, env);

  const now = new Date().toISOString();

  // Between the request and the click, someone else may have taken it.
  const taken = await env.DB.prepare("SELECT id FROM students WHERE email = ? AND id != ?")
    .bind(pending.new_email, student.id)
    .first();
  if (taken) {
    await env.DB.prepare("DELETE FROM email_changes WHERE nonce = ?").bind(nonce).run();
    return fail("That address is now in use on another account.", 409, request, env);
  }

  try {
    const changed = await env.DB.batch([
      env.DB.prepare(`UPDATE students SET email = ?, google_sub = NULL, session_version = session_version + 1
        WHERE id = ? AND session_version = ? AND EXISTS (SELECT 1 FROM email_changes WHERE nonce = ? AND student_id = students.id)`)
        .bind(pending.new_email, student.id, student.session_version ?? 0, nonce),
      env.DB.prepare("DELETE FROM email_changes WHERE student_id = ?").bind(student.id),
      env.DB.prepare("DELETE FROM password_resets WHERE student_id = ?").bind(student.id)
    ]);
    if (!(changed[0]?.meta?.changes > 0)) return fail("That link has already been used. Please sign in again.", 409, request, env);
  } catch {
    await env.DB.prepare("DELETE FROM email_changes WHERE nonce = ?").bind(nonce).run();
    return fail("That address is now in use on another account.", 409, request, env);
  }

  await env.DB.prepare("DELETE FROM email_changes WHERE student_id = ?").bind(student.id).run();
  await env.DB.prepare("DELETE FROM password_resets WHERE student_id = ?").bind(student.id).run();
  await env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(student.email).run().catch(() => {});

  await env.DB.prepare(
    `UPDATE bookings SET student_email = ?, updated_at = ?
     WHERE student_id = ? AND status IN ('confirmed', 'pending_payment') AND starts_at > ?`
  )
    .bind(pending.new_email, now, student.id, now)
    .run();

  const updated = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(student.id).first();
  return json({ student: publicStudent(updated), session: await createSession(updated.id, env.BOOKING_TOKEN_SECRET, updated.session_version) }, 200, request, env);
}

async function handleUpdateMe(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const body = await readJson(request);
  const name = cleanText(body.name, 120) || student.name;
  // "in body", not falsiness: a field that was not sent must keep its value,
  // while one sent empty is a student deliberately clearing it. Sending only a
  // name used to wipe the phone number without anyone noticing.
  const phone = "phone" in body ? cleanText(body.phone, 40) : student.phone;
  const nif = "nif" in body ? normaliseNif(body.nif) : student.nif ?? "";
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : student.timezone;

  const problem = nifProblem(nif);
  if ("nif" in body && problem) return fail(problem, 400, request, env);

  await env.DB.prepare("UPDATE students SET name = ?, phone = ?, nif = ?, timezone = ? WHERE id = ?")
    .bind(name, phone, nif, timezone, student.id)
    .run();

  const updated = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(student.id).first();
  return json({ student: publicStudent(updated) }, 200, request, env);
}

/**
 * Either the shared token, or a signed-in teacher.
 *
 * The token stays as the way back in if she is ever locked out of her own
 * account; day to day she signs in as herself, which also means her actions are
 * attributable rather than anonymous.
 */
async function isAdmin(request, env) {
  const provided = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (env.ADMIN_TOKEN && safeEqual(provided, env.ADMIN_TOKEN)) return { via: "token", student: null };

  const student = await currentStudent(request, env);
  if (student?.role === "teacher") return { via: "account", student };

  return null;
}

async function handleAdmin(request, env, ctx, url, path) {
  const admin = await isAdmin(request, env);
  if (!admin) {
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    if (!await takeRateLimit(env, `admin-fail:${ip}`, 20)) {
      return fail("Too many attempts. Please wait 15 minutes.", 429, request, env);
    }
    return fail("Not authorised.", 401, request, env);
  }

  if (request.method === "GET" && path === "/admin/google-calendar") {
    return json(await calendarConnectionStatus(env), 200, request, env);
  }
  if (request.method === "POST" && path === "/admin/google-calendar/connect") {
    if (!admin.student) return fail("Sign in with your teacher account to connect Google Meet.", 403, request, env);
    if (!await takeRateLimit(env, `google-connect:${admin.student.id}`, 5)) return fail("Please wait before trying again.", 429, request, env);
    const session = request.headers.get("Authorization").replace(/^Bearer\s+/i, "");
    try {
      const authUrl = await startCalendarConnection(env, admin.student, await sessionHash(session));
      return json({ url: authUrl }, 200, request, env);
    } catch {
      return fail("Google Meet setup is not ready for this account. Please try again after setup.", 503, request, env);
    }
  }

  if (request.method === "GET" && path === "/admin/bookings") {
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const { results } = await env.DB.prepare(
      `SELECT b.*, l.name AS lesson_name, COALESCE(s.nif, '') AS student_nif FROM bookings b
       JOIN lesson_types l ON l.id = b.lesson_type_id LEFT JOIN students s ON s.id = b.student_id
       WHERE b.starts_at > ? ORDER BY b.starts_at`
    )
      .bind(from)
      .all();
    const cutoff = new Date(Date.now() - 23 * 3600000).toISOString();
    const { results: reconciliation } = await env.DB.prepare(`SELECT id, reference, payment_status, same_day_fee_status FROM bookings
      WHERE (payment_status = 'processing' AND (charge_started_at IS NULL OR charge_started_at < ?))
         OR (same_day_fee_status = 'processing' AND (same_day_fee_started_at IS NULL OR same_day_fee_started_at < ?))
         OR EXISTS (SELECT 1 FROM booking_refunds WHERE booking_id = bookings.id AND status = 'pending')`)
      .bind(cutoff, cutoff).all();
    return json({ bookings: results ?? [], manualPaymentReconciliation: reconciliation ?? [] }, 200, request, env);
  }

  if (request.method === "GET" && path === "/admin/availability") {
    const [rules, exceptions] = await Promise.all([
      env.DB.prepare("SELECT * FROM availability_rules ORDER BY weekday, start_minute").all(),
      // Weekly blocks (lunch) too: the calendar has to show every time students
      // cannot book, not only the one-off dates.
      env.DB.prepare("SELECT * FROM availability_exceptions WHERE date >= ? OR weekday IS NOT NULL ORDER BY date")
        .bind(dateKey(new Date(), PORTO))
        .all()
    ]);
    return json({ rules: rules.results ?? [], exceptions: exceptions.results ?? [], settings: await loadSettings(env) }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/availability") {
    const body = await readJson(request);
    if (!Array.isArray(body.rules)) return fail("Expected a rules array.", 400, request, env);

    const statements = [env.DB.prepare("DELETE FROM availability_rules")];
    for (const rule of body.rules.slice(0, 100)) {
      const weekday = Number(rule.weekday);
      const start = Number(rule.startMinute);
      // The latest a lesson may begin, not when she finishes.
      const lastStart = Number(rule.lastStartMinute);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
      if (!Number.isInteger(start) || !Number.isInteger(lastStart)) continue;
      if (lastStart < start || start < 0 || lastStart > 1440) continue;
      statements.push(
        env.DB.prepare(
          "INSERT INTO availability_rules (weekday, start_minute, last_start_minute, active) VALUES (?, ?, ?, 1)"
        ).bind(weekday, start, lastStart)
      );
    }

    await env.DB.batch(statements);
    return json({ ok: true, count: statements.length - 1 }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/exceptions") {
    const body = await readJson(request);
    if (body.remove) {
      await env.DB.prepare("DELETE FROM availability_exceptions WHERE id = ?").bind(Number(body.remove)).run();
      return json({ ok: true }, 200, request, env);
    }
    if (!parseDateKey(body.date)) return fail("Invalid date.", 400, request, env);
    const kind = body.kind === "extra" ? "extra" : "blocked";
    const start = body.startMinute ?? null;
    const end = body.endMinute ?? null;
    const minute = (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 1440);
    // A blocked span ends when she is free again; an extra window ends at its last start.
    if (!minute(start) || !minute(end) || (start !== null && end !== null && (kind === "blocked" ? end <= start : end < start))) {
      return fail("Invalid time range.", 400, request, env);
    }

    await env.DB.prepare(
      "INSERT INTO availability_exceptions (date, kind, start_minute, end_minute, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(body.date, kind, start, end, cleanText(body.note, 200), new Date().toISOString())
      .run();
    return json({ ok: true }, 200, request, env);
  }

  // One date's time off, from the teacher calendar. `dayOff` and `blocks` are
  // independent and each replaces only its own rows, so taking the whole day
  // off never discards the hours blocked within it. Weekly blocks and extra
  // hours are never touched here.
  if (request.method === "POST" && path === "/admin/exceptions/day") {
    const body = await readJson(request);
    if (!parseDateKey(body.date)) return fail("Invalid date.", 400, request, env);
    if (body.date < dateKey(new Date(), PORTO)) return fail("That date has already passed.", 400, request, env);
    const dayOff = typeof body.dayOff === "boolean" ? body.dayOff : undefined;
    const blocks = "blocks" in body ? normaliseBlockedSpans(body.blocks) : undefined;
    if (blocks === null) return fail("Those times could not be saved. Please reload and try again.", 400, request, env);
    if (dayOff === undefined && blocks === undefined) return fail("Nothing to change.", 400, request, env);

    const oneOff = "date = ? AND weekday IS NULL AND kind = 'blocked'";
    const wholeDay = "(start_minute IS NULL OR start_minute <= 0) AND (end_minute IS NULL OR end_minute >= 1440)";
    const created = new Date().toISOString();
    const statements = [];
    if (dayOff === false) {
      statements.push(env.DB.prepare(`DELETE FROM availability_exceptions WHERE ${oneOff} AND ${wholeDay}`).bind(body.date));
    } else if (dayOff) {
      // Idempotent, and an existing day off keeps its note ("Holiday").
      statements.push(
        env.DB.prepare(
          `INSERT INTO availability_exceptions (date, kind, start_minute, end_minute, note, created_at)
           SELECT ?, 'blocked', NULL, NULL, '', ?
           WHERE NOT EXISTS (SELECT 1 FROM availability_exceptions WHERE ${oneOff} AND ${wholeDay})`
        ).bind(body.date, created, body.date)
      );
    }
    if (blocks) {
      statements.push(env.DB.prepare(`DELETE FROM availability_exceptions WHERE ${oneOff} AND NOT (${wholeDay})`).bind(body.date));
      for (const block of blocks) {
        statements.push(
          env.DB.prepare(
            "INSERT INTO availability_exceptions (date, kind, start_minute, end_minute, note, created_at) VALUES (?, 'blocked', ?, ?, '', ?)"
          ).bind(body.date, block.start, block.end, created)
        );
      }
    }
    await env.DB.batch(statements);

    const { results } = await env.DB.prepare(
      "SELECT * FROM availability_exceptions WHERE date = ? AND weekday IS NULL ORDER BY start_minute"
    )
      .bind(body.date)
      .all();
    return json({ ok: true, exceptions: results ?? [] }, 200, request, env);
  }

  // --- Bookings on a student's behalf --------------------------------------

  if (request.method === "GET" && path === "/admin/students") {
    const { results } = await env.DB.prepare(
      "SELECT id, name, email, phone FROM students WHERE role = 'student' ORDER BY name"
    ).all();
    return json({ students: results ?? [] }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/bookings") {
    const body = await readJson(request);
    const email = normaliseEmail(body.email);
    const name = cleanText(body.name, 120);
    if (!isEmail(email)) return fail("Please give the student's email address.", 400, request, env);

    const lessonType = await loadLessonType(env, cleanText(body.lessonType, 40) || "single");
    if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

    const start = new Date(body.startAt);
    if (Number.isNaN(start.getTime())) return fail("That time could not be understood.", 400, request, env);
    const endsAt = new Date(start.getTime() + lessonType.duration_minutes * 60000);

    /*
     * Her own bookings are checked for clashes only — not against her published
     * hours or the notice window. Those exist to shape what students may choose;
     * she is the one who decides, and squeezing in a lesson outside them is a
     * normal thing for her to do. A double booking is never intended, so that
     * is still refused.
     */
    const clash = await env.DB.prepare(
      `SELECT reference FROM bookings
       WHERE (status = 'confirmed' OR (status = 'pending_payment' AND hold_expires_at > ?)) AND ends_at > ? AND starts_at < ?`
    )
      .bind(new Date().toISOString(), start.toISOString(), endsAt.toISOString())
      .first();
    if (clash) return fail(`That overlaps an existing lesson (${clash.reference}).`, 409, request, env);

    let student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();
    const now = new Date().toISOString();

    if (!student) {
      // No password: the student sets one with "forgot password" when they
      // first want to manage the lesson themselves.
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO students (id, email, name, phone, timezone, password_hash, created_at)
         VALUES (?, ?, ?, '', ?, '', ?)`
      )
        .bind(id, email, name || email.split("@")[0], PORTO, now)
        .run();
      student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
    }

    const id = crypto.randomUUID();
    const reference = bookingReference();
    const claimed = await claimSlot(env, {
      columns: ["id", "reference", "lesson_type_id", "student_id", "student_name", "student_email", "student_phone",
        "student_timezone", "location", "notes", "starts_at", "ends_at", "status", "sequence", "created_at", "updated_at"],
      values: [
        id,
        reference,
        lessonType.id,
        student.id,
        student.name,
        student.email,
        student.phone,
        student.timezone,
        body.location === "porto" ? "porto" : "online",
        cleanText(body.notes, 1000),
        start.toISOString(),
        endsAt.toISOString(),
        "confirmed", 0,
        now,
        now
      ], startAt: start.toISOString(), endAt: endsAt.toISOString()
    });
    if (!claimed) return fail("That time has just been booked. Please choose another time.", 409, request, env);

    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
    const settings = await loadSettings(env);
    const token = await createManageToken(id, env.BOOKING_TOKEN_SECRET);

    // The student is told, exactly as if they had booked it themselves.
    ctx.waitUntil(
      notify(env, {
        event: "booked",
        row,
        lessonType,
        settings,
        manageUrl: studentManageUrl(env, token)
      })
    );

    return json({ booking: publicBooking(row, lessonType, settings) }, 201, request, env);
  }

  const adminReschedule = path.match(/^\/admin\/bookings\/([^/]+)\/reschedule$/);
  if (adminReschedule && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(adminReschedule[1]).first();
    if (!row) return fail("That booking could not be found.", 404, request, env);

    const body = await readJson(request);
    const start = new Date(body.startAt);
    if (Number.isNaN(start.getTime())) return fail("That time could not be understood.", 400, request, env);

    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(row.lesson_type_id)
      .first();
    const endsAt = new Date(start.getTime() + lessonType.duration_minutes * 60000);

    const clash = await env.DB.prepare(
      `SELECT reference FROM bookings
       WHERE id != ? AND (status = 'confirmed' OR (status = 'pending_payment' AND hold_expires_at > ?)) AND ends_at > ? AND starts_at < ?`
    )
      .bind(row.id, new Date().toISOString(), start.toISOString(), endsAt.toISOString())
      .first();
    if (clash) return fail(`That overlaps an existing lesson (${clash.reference}).`, 409, request, env);

    const now = new Date();
    const moved = await env.DB.prepare(
      `UPDATE bookings SET starts_at = ?, ends_at = ?, previous_starts_at = ?, sequence = sequence + 1,
         reschedule_count = reschedule_count + 1, same_day_change = 0, updated_at = ?
       WHERE id = ? AND status = 'confirmed' AND sequence = ? AND payment_status != 'processing'
         AND NOT EXISTS (SELECT 1 FROM bookings other WHERE other.id != bookings.id
           AND (other.status = 'confirmed' OR (other.status = 'pending_payment' AND other.hold_expires_at > ?)) AND other.starts_at < ? AND other.ends_at > ?)`
    )
      .bind(start.toISOString(), endsAt.toISOString(), row.starts_at, now.toISOString(), row.id, row.sequence, now.toISOString(), endsAt.toISOString(), start.toISOString())
      .run();

    if (!(moved?.meta?.changes > 0)) return fail("That lesson or time has just changed. Please reload.", 409, request, env);

    const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
    const settings = await loadSettings(env);
    const token = await createManageToken(row.id, env.BOOKING_TOKEN_SECRET);

    ctx.waitUntil(
      notify(env, {
        event: "rescheduled",
        row: updated,
        lessonType,
        settings,
        manageUrl: studentManageUrl(env, token),
        previousStartsAt: row.starts_at,
        // She moved it, not them. Without this the student is thanked for a
        // change they did not make, and she is told they made it.
        byTeacher: true
      })
    );

    return json({ booking: publicBooking(updated, lessonType, settings) }, 200, request, env);
  }

  const adminCancel = path.match(/^\/admin\/bookings\/([^/]+)\/cancel$/);
  if (adminCancel && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(adminCancel[1]).first();
    if (!row) return fail("That booking could not be found.", 404, request, env);
    if (row.status === "cancelled") return fail("That lesson is already cancelled.", 409, request, env);

    // Her cancellation always refunds a paid lesson — inside the 14-hour window
    // included. A student loses the free change window; she never does, and
    // the money follows automatically so there is nothing to remember.
    const refunded = 0;
    if (row.payment_status === "paid" && row.stripe_payment_intent) {
      if (!await claimRefund(env, row, "teacher")) return fail("That lesson has just changed. Please reload.", 409, request, env);
      const updated = await completeRefund(env, row.id);
      if (!updated) return fail("The cancellation request is recorded. Its refund is awaiting confirmation; the lesson stays reserved and locked. Review the payment in Stripe before any further action.", 503, request, env);
      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
      const settings = await loadSettings(env);
      ctx.waitUntil(notify(env, { event: "cancelled", row: updated, lessonType, settings, manageUrl: "", byTeacher: true }));
      return json({ booking: publicBooking(updated, lessonType, settings) }, 200, request, env);
    }

    const now = new Date().toISOString();
    const cancelled = await env.DB.prepare(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'teacher',
         sequence = sequence + 1, same_day_change = 0, updated_at = ?,
         payment_status = CASE WHEN ? = 1 THEN 'refunded' ELSE payment_status END
       WHERE id = ? AND status = 'confirmed' AND sequence = ? AND payment_status != 'processing'`
    )
      .bind(now, now, refunded, row.id, row.sequence)
      .run();

    if (!(cancelled?.meta?.changes > 0)) return fail("That lesson has just changed. Please reload.", 409, request, env);

    const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(row.lesson_type_id)
      .first();
    const settings = await loadSettings(env);

    // No same-day fee when she is the one cancelling — and the emails should say
    // she did it, rather than telling the student they cancelled their own lesson.
    ctx.waitUntil(
      notify(env, { event: "cancelled", row: updated, lessonType, settings, manageUrl: "", byTeacher: true })
    );

    return json({ booking: publicBooking(updated, lessonType, settings) }, 200, request, env);
  }

  const adminNoShow = path.match(/^\/admin\/bookings\/([^/]+)\/no-show$/);
  if (adminNoShow && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(adminNoShow[1]).first();
    if (!row) return fail("That booking could not be found.", 404, request, env);

    const now = new Date();
    const timingProblem = noShowProblem(row, now);
    if (timingProblem) return fail(timingProblem, 409, request, env);

    const body = await readJson(request);
    const noShow = body.noShow !== false;
    const updatedAt = now.toISOString();
    const changed = await env.DB.prepare(
      `UPDATE bookings SET attendance_status = ?, no_show_marked_at = ?, updated_at = ?
       WHERE id = ? AND status = 'confirmed' AND payment_status = 'scheduled'`
    )
      .bind(noShow ? "no_show" : "expected", noShow ? updatedAt : null, updatedAt, row.id)
      .run();

    if ((changed?.meta?.changes ?? 0) === 0) {
      return fail("That lesson's payment has just started, so its attendance can no longer be changed.", 409, request, env);
    }

    const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
    return json({ booking: updated }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/settings") {
    const body = await readJson(request);
    const allowed = new Set([
      "minimum_notice_hours",
      "booking_horizon_days",
      "slot_interval_minutes",
      "same_day_change_fee_cents",
      "teacher_name",
      "teacher_email",
      "reply_to_email"
    ]);
    // A zero or negative slot interval makes the availability loop never end,
    // so numbers are range-checked and addresses validated before they land.
    const ranges = {
      minimum_notice_hours: [0, 336],
      booking_horizon_days: [1, 365],
      slot_interval_minutes: [5, 240],
      same_day_change_fee_cents: [0, 10000]
    };
    for (const [key, value] of Object.entries(body.settings ?? {})) {
      if (ranges[key]) {
        const number = Number(value);
        const [min, max] = ranges[key];
        if (!Number.isInteger(number) || number < min || number > max) {
          return fail(`${key} must be a whole number from ${min} to ${max}.`, 400, request, env);
        }
      }
      if ((key === "teacher_email" || key === "reply_to_email") && String(value) !== "" && !isEmail(normaliseEmail(value))) {
        return fail(`${key} must be an email address.`, 400, request, env);
      }
    }
    const statements = Object.entries(body.settings ?? {})
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) =>
        env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, String(value))
      );
    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true, updated: statements.length }, 200, request, env);
  }

  return fail("Not found.", 404, request, env);
}

export default worker;
