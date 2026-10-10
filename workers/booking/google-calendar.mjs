/** Dedicated lesson calendar; online lessons also receive their own Meet room. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const CALENDARS_ROOT = "https://www.googleapis.com/calendar/v3/calendars";
const APP = "portuguese-with-ines";
const TOKEN_CONTEXT = new TextEncoder().encode("portuguese-with-ines:google-calendar:v1");
const accessTokens = new Map();

const messages = {
  calendar_not_configured: "Google Calendar is not configured.",
  calendar_reconnect_required: "Reconnect Google Calendar to create lesson links.",
  calendar_unavailable: "Google Calendar is temporarily unavailable.",
  calendar_event_conflict: "The calendar event could not be safely matched to this lesson.",
  calendar_conference_failed: "Google Calendar could not create a Google Meet link.",
  calendar_invalid_meeting_url: "Google Calendar returned an invalid meeting link.",
  calendar_invalid_input: "The lesson calendar details are invalid.",
  calendar_missing: "The private lesson calendar is not connected.",
  calendar_setup_uncertain: "The private lesson calendar needs setup recovery before another creation attempt.",
};

export class CalendarProviderError extends Error {
  constructor(causeCode, statusCode) {
    super(messages[causeCode]);
    this.name = "CalendarProviderError";
    this.causeCode = causeCode;
    this.statusCode = statusCode;
  }
}

function problem(code, status = 503) {
  return new CalendarProviderError(code, status);
}

export function calendarConfigured(env) {
  return Boolean(env?.GOOGLE_CALENDAR_CLIENT_ID && env?.GOOGLE_CALENDAR_CLIENT_SECRET &&
    /^[a-f\d]{64}$/i.test(env?.GOOGLE_CALENDAR_TOKEN_KEY ?? ""));
}

async function encryptionKey(env) {
  const value = env?.GOOGLE_CALENDAR_TOKEN_KEY ?? "";
  if (!/^[a-f\d]{64}$/i.test(value)) throw problem("calendar_not_configured");
  return crypto.subtle.importKey("raw", Uint8Array.from(value.match(/../g), (v) => parseInt(v, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value) {
  if (!/^[\w-]+$/.test(value)) throw problem("calendar_reconnect_required", 401);
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (v) => v.charCodeAt(0));
}

export async function encryptCalendarToken(env, text) {
  const key = await encryptionKey(env);
  if (typeof text !== "string" || !text || text.length > 16384) throw problem("calendar_invalid_input", 400);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: TOKEN_CONTEXT }, key, new TextEncoder().encode(text));
  return `v1.${encode(iv)}.${encode(encrypted)}`;
}

export async function decryptCalendarToken(env, text) {
  const key = await encryptionKey(env);
  try {
    const [version, nonce, encrypted, extra] = String(text ?? "").split(".");
    if (version !== "v1" || !nonce || !encrypted || extra !== undefined || encrypted.length > 22000) throw new Error();
    const iv = decode(nonce);
    if (iv.length !== 12) throw new Error();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: TOKEN_CONTEXT }, key, decode(encrypted));
    return new TextDecoder("utf-8", { fatal: true }).decode(decrypted);
  } catch {
    // Neither the stored ciphertext nor cryptographic error details leave this module.
    throw problem("calendar_reconnect_required", 401);
  }
}

async function providerFetch(url, options, timeoutMs = 10000) {
  try {
    // Workers rejects redirect:"error". Manual mode plus an explicit check
    // also prevents credentials being forwarded to a redirect destination.
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    if (response.status >= 300 && response.status < 400) throw problem("calendar_unavailable");
    return response;
  } catch (error) {
    const detail = /redirect/i.test(String(error?.message)) ? "redirect" : /timeout|abort/i.test(String(error?.message)) ? "timeout" : /fetch|network/i.test(String(error?.message)) ? "network" : "other";
    console.warn("google-calendar-transport", url === "https://oauth2.googleapis.com/token" ? "token" : "calendar", detail);
    throw problem("calendar_unavailable");
  }
}

async function providerJson(response) {
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw problem("calendar_unavailable");
  }
}

export async function calendarAccessToken(env, connection) {
  if (!calendarConfigured(env)) throw problem("calendar_not_configured");
  if (!connection?.refresh_token_encrypted) throw problem("calendar_reconnect_required", 401);
  const cacheKey = `${env.GOOGLE_CALENDAR_CLIENT_ID}:${env.GOOGLE_CALENDAR_TOKEN_KEY}:${connection.refresh_token_encrypted}`;
  const cached = accessTokens.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.token;
  const refreshToken = await decryptCalendarToken(env, connection.refresh_token_encrypted);
  const response = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = await providerJson(response);
  if (!response.ok) {
    const known = ["invalid_grant", "invalid_client", "invalid_request", "unauthorized_client", "unsupported_grant_type", "server_error", "temporarily_unavailable"];
    console.warn("google-calendar-token", response.status, known.includes(body.error) ? body.error : "unknown_error");
    if (body.error === "invalid_grant") throw problem("calendar_reconnect_required", 401);
    throw problem("calendar_unavailable");
  }
  if (typeof body.access_token !== "string" || !body.access_token || body.access_token.length > 16384) throw problem("calendar_unavailable");
  const lifetime = Math.min(Number(body.expires_in) || 0, 3600);
  if (lifetime > 60) {
    if (accessTokens.size >= 32) accessTokens.delete(accessTokens.keys().next().value);
    accessTokens.set(cacheKey, { token: body.access_token, until: Date.now() + (lifetime - 60) * 1000 });
  }
  return body.access_token;
}

async function calendarRequest(accessToken, url, method = "GET", body, allowMissing = false) {
  const response = await providerFetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, method === "POST" && url === CALENDARS_ROOT ? 30000 : 10000);
  if (allowMissing && (response.status === 404 || response.status === 410)) return null;
  if (!response.ok) {
    if (response.status === 401) {
      for (const [key, value] of accessTokens) if (value.token === accessToken) accessTokens.delete(key);
      throw problem("calendar_reconnect_required", 401);
    }
    console.warn("google-calendar-http", method, response.status);
    if (response.status === 409) throw problem("calendar_event_conflict", 409);
    throw problem("calendar_unavailable");
  }
  return providerJson(response);
}

function verifyEvent(event, input) {
  if (!event || typeof event.id !== "string" || !event.id || event.iCalUID !== input.iCalUID ||
      event.extendedProperties?.private?.app !== APP ||
      event.extendedProperties?.private?.bookingId !== input.bookingId) throw problem("calendar_event_conflict", 409);
  return event;
}

function meetingResult(event) {
  if (event.conferenceData?.createRequest?.status?.statusCode === "failure") throw problem("calendar_conference_failed", 502);
  const video = event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video");
  const url = video?.uri ?? event.hangoutLink;
  if (url !== undefined && url !== null && !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url)) {
    throw problem("calendar_invalid_meeting_url", 502);
  }
  // What Google says about the room while there is no link, so a link that
  // never arrives can be told apart in the logs: no conference requested at
  // all, or one Google holds as pending.
  if (url) return { eventId: event.id, meetingUrl: url, status: "ready" };
  const conference = event.conferenceData?.createRequest?.status?.statusCode ?? (event.conferenceData ? "no-request" : "none");
  return { eventId: event.id, meetingUrl: null, status: "pending", conference };
}

async function findEvent(accessToken, root, input) {
  const query = new URLSearchParams({ iCalUID: input.iCalUID, maxResults: "2", showDeleted: "true" });
  const result = await calendarRequest(accessToken, `${root}?${query}`);
  if (!Array.isArray(result.items)) throw problem("calendar_unavailable");
  // Even a single untagged UID match is not authority to edit somebody's event.
  if (result.nextPageToken || result.items.length > 1) throw problem("calendar_event_conflict", 409);
  return result.items.length ? verifyEvent(result.items[0], input) : null;
}

function eventUrl(root, eventId) {
  return `${root}/${encodeURIComponent(eventId)}`;
}

function calendarEventsRoot(connection) {
  if (typeof connection?.calendar_id !== "string" || !/^[^\s/@]+@group\.calendar\.google\.com$/.test(connection.calendar_id)) {
    throw problem("calendar_missing", 409);
  }
  return `${CALENDARS_ROOT}/${encodeURIComponent(connection.calendar_id)}/events`;
}

/**
 * calendar.app.created cannot list calendars. The caller must atomically record a
 * first-attempt claim, and pass the claimed copy without the attempted flag only
 * to that one call. After a lost response, recover the ID rather than create again.
 */
export async function ensureAppCalendar(env, connection) {
  if (connection?.calendar_id) {
    calendarEventsRoot(connection);
    return connection.calendar_id;
  }
  if (connection?.calendar_creation_attempted_at) throw problem("calendar_setup_uncertain", 409);
  if (typeof connection?.google_sub !== "string" || !/^[\w-]{1,255}$/.test(connection.google_sub)) throw problem("calendar_invalid_input", 400);
  let token;
  try { token = await calendarAccessToken(env, connection); }
  catch (error) { error.calendarCreationNotStarted = true; throw error; }
  let created;
  try {
    created = await calendarRequest(token, CALENDARS_ROOT, "POST", {
      summary: "Português com a Inês — lessons",
      description: `Lessons managed by Português com a Inês. app=${APP};google_sub=${connection.google_sub}`,
      timeZone: "Europe/Lisbon",
    });
    calendarEventsRoot({ calendar_id: created.id });
  } catch {
    // No list access with this scope. A lost creation result needs manual recovery.
    throw problem("calendar_setup_uncertain", 409);
  }
  try {
    await calendarRequest(token, `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(created.id)}`, "PATCH", { selected: true, hidden: false });
  } catch {
    // Never discard a successfully created calendar ID because display setup failed.
  }
  return created.id;
}

/** Caller serializes attempts per booking and stores eventId even when still pending. */
export async function ensureCalendarMeeting(env, connection, input) {
  if (!input || !input.bookingId || !input.iCalUID || !input.requestId ||
      typeof input.summary !== "string" || typeof input.description !== "string" ||
      (input.online !== undefined && typeof input.online !== "boolean") ||
      !Number.isFinite(Date.parse(input.startAt)) || !Number.isFinite(Date.parse(input.endAt)) ||
      Date.parse(input.endAt) <= Date.parse(input.startAt)) throw problem("calendar_invalid_input", 400);
  const root = calendarEventsRoot(connection);
  const online = input.online !== false;
  const accessToken = await calendarAccessToken(env, connection);
  let event = input.eventId ? await calendarRequest(accessToken, eventUrl(root, input.eventId), "GET", undefined, true) : null;
  if (event) verifyEvent(event, input);
  else event = await findEvent(accessToken, root, input);
  const details = {
    summary: input.summary,
    description: input.description,
    location: online ? "Online" : "Porto",
    // The calendar remains private unless Inês shares it. Inherit those read permissions.
    visibility: "default",
    start: { dateTime: input.startAt },
    end: { dateTime: input.endAt },
  };
  if (!event) {
    try {
      event = await calendarRequest(accessToken, `${root}/import?conferenceDataVersion=1`, "POST", {
        ...details,
        iCalUID: input.iCalUID,
        reminders: { useDefault: false },
        extendedProperties: { private: { app: APP, bookingId: input.bookingId } },
        ...(online ? { conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
      });
    } catch (error) {
      if (error.causeCode !== "calendar_unavailable" && error.causeCode !== "calendar_event_conflict") throw error;
      // A lost response can still mean the import succeeded. Never blindly import twice.
      event = await findEvent(accessToken, root, input);
      if (!event) throw error;
    }
    verifyEvent(event, input);
  } else {
    const failed = online && event.conferenceData?.createRequest?.status?.statusCode === "failure";
    const hasConference = Boolean(event.hangoutLink || (event.conferenceData && Object.keys(event.conferenceData).length));
    const createConference = online && (!hasConference || failed);
    const clearConference = !online && hasConference;
    if (failed && event.conferenceData.createRequest.requestId === input.requestId) throw problem("calendar_conference_failed", 502);
    if (createConference || clearConference || event.status === "cancelled" || Date.parse(event.start?.dateTime) !== Date.parse(input.startAt) ||
        Date.parse(event.end?.dateTime) !== Date.parse(input.endAt) ||
        event.summary !== input.summary || event.description !== input.description ||
        event.location !== details.location || (event.visibility && event.visibility !== "default")) {
      // Reschedules retain the room. Format changes add/remove it on the same event.
      event = await calendarRequest(accessToken, `${eventUrl(root, event.id)}?conferenceDataVersion=1&sendUpdates=none`, "PATCH", {
        ...details,
        ...(event.status === "cancelled" ? { status: "confirmed" } : {}),
        ...(createConference ? { conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
        ...(clearConference ? { conferenceData: null } : {}),
      });
      verifyEvent(event, input);
    }
  }
  if (event.status === "cancelled") throw problem("calendar_event_conflict", 409);
  if (!online) {
    if (event.hangoutLink || (event.conferenceData && Object.keys(event.conferenceData).length)) throw problem("calendar_unavailable");
    return { eventId: event.id, meetingUrl: null, status: "ready" };
  }
  let result = meetingResult(event);
  // Most links appear immediately. Bound polling; the caller schedules later retries.
  for (let attempt = 0; result.status === "pending" && attempt < 2; attempt += 1) {
    event = await calendarRequest(accessToken, eventUrl(root, event.id));
    verifyEvent(event, input);
    if (event.status === "cancelled") throw problem("calendar_event_conflict", 409);
    result = meetingResult(event);
  }
  return result;
}

/** Soft-cancel only the app's tagged event; never deletes a calendar or unrelated event. */
export async function cancelCalendarMeeting(env, connection, { bookingId, eventId }) {
  if (!bookingId || !eventId) throw problem("calendar_invalid_input", 400);
  const root = calendarEventsRoot(connection);
  const token = await calendarAccessToken(env, connection);
  const event = await calendarRequest(token, eventUrl(root, eventId), "GET", undefined, true);
  if (!event) return;
  if (event.id !== eventId || event.extendedProperties?.private?.app !== APP ||
      event.extendedProperties?.private?.bookingId !== bookingId) throw problem("calendar_event_conflict", 409);
  if (event.status === "cancelled") return;
  const cancelled = await calendarRequest(token, `${eventUrl(root, eventId)}?conferenceDataVersion=1&sendUpdates=none`, "PATCH", { status: "cancelled" });
  if (cancelled.id !== eventId || cancelled.status !== "cancelled") throw problem("calendar_unavailable");
}
