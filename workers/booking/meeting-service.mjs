import { CALENDAR_SCOPE, calendarConfigured, encryptCalendarToken, decryptCalendarToken, ensureAppCalendar, ensureCalendarMeeting, cancelCalendarMeeting } from "./google-calendar.mjs";
import { verifyGoogleIdToken } from "./google.mjs";
import { calendarUid } from "./ics.mjs";

const encoder = new TextEncoder();
const enabled = env => env.GOOGLE_CALENDAR_ENABLED === "1" && calendarConfigured(env);
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const hash = async value => hex(await digest(value));
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const callback = env => env.GOOGLE_CALENDAR_REDIRECT_URI;

/**
 * Lessons booked before Meet links began reaching students (10 October 2026)
 * never had theirs. Rather than all arriving at once, out of the blue, days
 * early, each of those waits until the day before its lesson; anything booked
 * since gets its link straight away, in the confirmation or just after it
 * (at Dan's request).
 */
export const MEETING_BACKLOG_BEFORE = "2026-10-10T10:00:00.000Z";
export const MEETING_BACKLOG_NOTICE_MS = 24 * 3600000;

export function meetingUrl(row) {
  if (row?.location !== "online" || row.status !== "confirmed") return null;
  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(row.meeting_url ?? "") ? row.meeting_url : null;
}

async function connection(env) {
  return env.DB.prepare(`SELECT c.* FROM google_calendar_connections c JOIN students s ON s.id = c.teacher_id
    WHERE c.id = 1 AND s.role = 'teacher'`).first();
}

export async function calendarConnectionStatus(env) {
  if (!enabled(env) || !callback(env)) return { configured: false, connected: false, email: null, needsReconnect: false, pending: 0 };
  const account = await connection(env);
  const pending = await env.DB.prepare(`SELECT COUNT(*) AS count FROM bookings
    WHERE status = 'confirmed' AND ends_at > ?
      AND (meeting_event_id IS NULL OR meeting_sequence IS NULL OR meeting_sequence != sequence OR (location = 'online' AND meeting_url IS NULL))`)
    .bind(new Date().toISOString()).first();
  return { configured: true, connected: account?.status === "active" && Boolean(account?.calendar_id), email: account?.email ?? null,
    needsReconnect: account?.status === "reconnect" || Boolean(account && !account.calendar_id), pending: pending?.count ?? 0 };
}

/** Once connected, teacher ICS copies would duplicate the directly synced events.
 * Keep the same route during a reconnect; the durable sweep catches up afterward. */
export async function calendarOwnsTeacherInvites(env) {
  if (!enabled(env)) return false;
  return Boolean((await connection(env))?.calendar_id);
}

export async function startCalendarConnection(env, teacher, sessionHash) {
  if (!enabled(env) || !callback(env)) throw new Error("Google Meet setup is not ready yet.");
  const current = await connection(env);
  if (current && current.teacher_id !== teacher.id) throw new Error("Google Meet is connected to another teacher account.");
  const state = random();
  const verifier = random();
  const now = new Date();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM google_calendar_oauth_states WHERE expires_at < ? OR teacher_id = ?").bind(now.toISOString(), teacher.id),
    env.DB.prepare(`INSERT INTO google_calendar_oauth_states
      (state_hash, teacher_id, session_version, session_hash, verifier_encrypted, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(await hash(state), teacher.id, teacher.session_version ?? 0, sessionHash, await encryptCalendarToken(env, verifier), new Date(now.getTime() + 600000).toISOString()),
  ]);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CALENDAR_CLIENT_ID, redirect_uri: callback(env),
    response_type: "code", scope: `openid email ${CALENDAR_SCOPE}`, access_type: "offline", prompt: "consent",
    login_hint: teacher.email, state, code_challenge_method: "S256", code_challenge: base64url(await digest(verifier)) }).toString();
  return url.href;
}

/** State is single-use, bound to the original teacher session and Google identity. */
export async function finishCalendarConnection(env, url) {
  if (!enabled(env) || !callback(env)) return "error";
  const state = url.searchParams.get("state") ?? "";
  if (!/^[a-f0-9]{64}$/.test(state)) return "error";
  const stored = await env.DB.prepare("DELETE FROM google_calendar_oauth_states WHERE state_hash = ? RETURNING *")
    .bind(await hash(state)).first();
  if (!stored || stored.expires_at < new Date().toISOString()) return "error";
  const teacher = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(stored.teacher_id).first();
  const revoked = await env.DB.prepare("SELECT token_hash FROM revoked_sessions WHERE token_hash = ?").bind(stored.session_hash).first();
  if (!teacher || teacher.role !== "teacher" || teacher.session_version !== stored.session_version || revoked) return "error";
  if (url.searchParams.has("error")) return "cancelled";
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) return "error";
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callback(env),
        client_id: env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
        code_verifier: await decryptCalendarToken(env, stored.verifier_encrypted) }),
    });
    if (!response.ok) return "error";
    const tokens = await response.json();
    if (!tokens.refresh_token || !String(tokens.scope ?? "").split(" ").includes(CALENDAR_SCOPE)) return "error";
    const profile = await verifyGoogleIdToken(tokens.id_token, env.GOOGLE_CALENDAR_CLIENT_ID);
    if (!profile || (teacher.google_sub ? profile.sub !== teacher.google_sub : profile.email !== teacher.email.toLowerCase())) return "error";
    const current = await connection(env);
    if (current && current.teacher_id !== teacher.id) return "error";
    const freshTeacher = await env.DB.prepare("SELECT role, session_version FROM students WHERE id = ?").bind(teacher.id).first();
    const freshlyRevoked = await env.DB.prepare("SELECT token_hash FROM revoked_sessions WHERE token_hash = ?").bind(stored.session_hash).first();
    if (freshTeacher?.role !== "teacher" || freshTeacher.session_version !== stored.session_version || freshlyRevoked) return "error";
    await env.DB.prepare(`INSERT INTO google_calendar_connections
      (id, teacher_id, google_sub, email, refresh_token_encrypted, status, updated_at) VALUES (1, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT(id) DO UPDATE SET google_sub=excluded.google_sub, email=excluded.email,
      refresh_token_encrypted=excluded.refresh_token_encrypted, status='active', updated_at=excluded.updated_at
      WHERE google_calendar_connections.teacher_id = excluded.teacher_id`)
      .bind(teacher.id, profile.sub, profile.email, await encryptCalendarToken(env, tokens.refresh_token), new Date().toISOString()).run();
    const saved = await completeCalendarSetup(env);
    return saved?.calendar_id ? "connected" : "error";
  } catch {
    // OAuth errors can contain codes, tokens or provider payloads. Never log them.
    return "error";
  }
}

/** Resume an authorized, explicitly unclaimed setup without another Google login. */
async function completeCalendarSetup(env) {
  const saved = await connection(env);
  if (!saved || saved.status !== "active" || saved.calendar_id || saved.calendar_creation_attempted_at) return saved;
  const claimed = await env.DB.prepare(`UPDATE google_calendar_connections SET calendar_creation_attempted_at = ?
    WHERE id = 1 AND teacher_id = ? AND calendar_id IS NULL AND calendar_creation_attempted_at IS NULL`)
    .bind(new Date().toISOString(), saved.teacher_id).run();
  if (!claimed?.meta?.changes) return saved;
  try {
    const calendarId = await ensureAppCalendar(env, saved);
    await env.DB.prepare("UPDATE google_calendar_connections SET calendar_id = ? WHERE id = 1 AND teacher_id = ?")
      .bind(calendarId, saved.teacher_id).run();
  } catch (error) {
    if (error?.calendarCreationNotStarted) {
      await env.DB.prepare("UPDATE google_calendar_connections SET calendar_creation_attempted_at = NULL WHERE id = 1 AND teacher_id = ? AND calendar_id IS NULL")
        .bind(saved.teacher_id).run();
    }
    // Only our fixed provider codes/statuses: never OAuth payloads or credentials.
    console.warn("google-calendar-setup", error?.causeCode ?? "unexpected_failure", Number(error?.statusCode) || 0);
  }
  return connection(env);
}

/** Calendar work is best-effort; it must never fail a confirmed lesson/payment. */
export async function prepareMeeting(env, input) {
  if (!enabled(env)) return input;
  const account = await connection(env);
  if (!account || account.status !== "active" || !account.calendar_id) return input;
  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(input.id).first();
  if (!row || row.status === "pending_payment") return row ?? input;
  const eligible = row.status === "confirmed";
  if (!eligible && !row.meeting_event_id) return row;
  if (eligible && row.ends_at <= new Date().toISOString()) return row;
  if (row.meeting_sequence === row.sequence && (!eligible || row.location === "porto" || meetingUrl(row))) return row;
  const now = new Date();
  const claim = random();
  const result = await env.DB.prepare(`UPDATE bookings SET meeting_claim_id = ?, meeting_retry_at = ?
    WHERE id = ? AND (meeting_retry_at IS NULL OR meeting_retry_at <= ?)`)
    .bind(claim, new Date(now.getTime() + 120000).toISOString(), row.id, now.toISOString()).run();
  if (!result?.meta?.changes) return row;
  try {
    if (!eligible) {
      await cancelCalendarMeeting(env, account, { bookingId: row.id, eventId: row.meeting_event_id });
      await env.DB.prepare(`UPDATE bookings SET meeting_sequence = ?, meeting_claim_id = NULL, meeting_retry_at = NULL
        WHERE id = ? AND meeting_claim_id = ? AND sequence = ?`).bind(row.sequence, row.id, claim, row.sequence).run();
    } else {
      const meeting = await ensureCalendarMeeting(env, account, {
        bookingId: row.id, iCalUID: calendarUid(row.id), eventId: row.meeting_event_id,
        // A fresh request each attempt: Google treats a repeated requestId as
        // the same request, so an event left without a room was asked for it
        // again and again under the one id and never given one. No Meet link
        // had reached any lesson since the calendar was connected.
        requestId: `pwi-${row.id}-${row.sequence}-${row.meeting_attempts ?? 0}-${now.getTime().toString(36)}`, summary: `Portuguese lesson · ${row.student_name}`,
        description: `${row.location === "online" ? "Online" : "In-person Porto"} Portuguese lesson. Booking reference: ${row.reference}. Manage lessons on https://portuguesewithines.com/schedule/`,
        online: row.location === "online",
        startAt: row.starts_at, endAt: row.ends_at,
      });
      if (meeting.status !== "ready") console.warn("google-calendar-sync", row.reference, "meeting_pending", meeting.conference ?? "unknown");
      // Persist provider identity even if the student changed/cancelled while
      // Google worked; the next sweep then reconciles the same event.
      await env.DB.prepare(`UPDATE bookings SET meeting_notified_at = CASE WHEN meeting_url IS ? THEN meeting_notified_at ELSE NULL END,
        meeting_event_id = ?, meeting_url = ?, meeting_sequence = ?,
        meeting_claim_id = NULL, meeting_retry_at = ?, meeting_attempts = 0 WHERE id = ? AND meeting_claim_id = ?`)
        .bind(meeting.meetingUrl, meeting.eventId, meeting.meetingUrl, meeting.status === "ready" ? row.sequence : null,
          meeting.status === "ready" ? null : new Date(now.getTime() + 60000).toISOString(), row.id, claim).run();
    }
  } catch (error) {
    if (error?.causeCode === "calendar_reconnect_required") {
      await env.DB.prepare("UPDATE google_calendar_connections SET status = 'reconnect' WHERE id = 1 AND refresh_token_encrypted = ?")
        .bind(account.refresh_token_encrypted).run();
    }
    const delay = Math.min(15, 2 ** Math.min(row.meeting_attempts ?? 0, 4)) * 60000;
    await env.DB.prepare(`UPDATE bookings SET meeting_claim_id = NULL, meeting_retry_at = ?, meeting_attempts = meeting_attempts + 1
      WHERE id = ? AND meeting_claim_id = ?`).bind(new Date(now.getTime() + delay).toISOString(), row.id, claim).run();
    console.warn("google-calendar-sync", row.reference, "meeting_not_ready");
  }
  return await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first() ?? row;
}

export async function markMeetingNotified(env, row) {
  if (enabled(env) && meetingUrl(row)) {
    await env.DB.prepare("UPDATE bookings SET meeting_notified_at = ? WHERE id = ? AND meeting_url = ?")
      .bind(new Date().toISOString(), row.id, row.meeting_url).run();
  }
}

export async function syncPendingMeetings(env, notifyReady, { backlogBefore = MEETING_BACKLOG_BEFORE } = {}) {
  if (!enabled(env)) return;
  const account = await completeCalendarSetup(env);
  if (!account || account.status !== "active" || !account.calendar_id) return;
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(`SELECT * FROM bookings WHERE
    ((status = 'confirmed' AND ends_at > ? AND (meeting_event_id IS NULL OR (location = 'online' AND meeting_url IS NULL) OR meeting_sequence IS NULL OR meeting_sequence != sequence))
      OR (meeting_event_id IS NOT NULL AND status = 'cancelled' AND (meeting_sequence IS NULL OR meeting_sequence != sequence)))
    AND (meeting_retry_at IS NULL OR meeting_retry_at <= ?) ORDER BY starts_at LIMIT 6`).bind(now, now).all();
  for (const row of results ?? []) await prepareMeeting(env, row);
  // Give the ordinary confirmation a chance to include a synchronously-ready
  // link. Later-created links get one dedicated email, retried on send failure.
  const { results: ready } = await env.DB.prepare(`SELECT * FROM bookings WHERE status = 'confirmed' AND location = 'online'
    AND meeting_url IS NOT NULL AND meeting_notified_at IS NULL AND ends_at > ? AND created_at < ?
    AND (created_at >= ? OR starts_at <= ?) ORDER BY starts_at LIMIT 6`)
    .bind(now, new Date(Date.now() - 120000).toISOString(), backlogBefore,
      new Date(Date.now() + MEETING_BACKLOG_NOTICE_MS).toISOString()).all();
  for (const row of ready ?? []) {
    if (!meetingUrl(row)) continue;
    const leaseUntil = new Date(Date.now() + 300000).toISOString();
    const claim = await env.DB.prepare(`UPDATE bookings SET meeting_notification_claim_until = ?
      WHERE id = ? AND status = 'confirmed' AND location = 'online' AND meeting_notified_at IS NULL
      AND (meeting_notification_claim_until IS NULL OR meeting_notification_claim_until <= ?)`)
      .bind(leaseUntil, row.id, now).run();
    if (!claim?.meta?.changes) continue;
    try {
      const latest = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
      if (meetingUrl(latest) && await notifyReady(latest)) await markMeetingNotified(env, latest);
    } finally {
      await env.DB.prepare("UPDATE bookings SET meeting_notification_claim_until = NULL WHERE id = ? AND meeting_notification_claim_until = ?")
        .bind(row.id, leaseUntil).run();
    }
  }
}
