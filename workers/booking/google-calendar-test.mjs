import assert from "node:assert/strict";
import {
  CALENDAR_SCOPE, CalendarProviderError, calendarConfigured, encryptCalendarToken,
  decryptCalendarToken, calendarAccessToken, ensureAppCalendar, ensureCalendarMeeting, cancelCalendarMeeting,
} from "./google-calendar.mjs";

const env = { GOOGLE_CALENDAR_CLIENT_ID: "test-client", GOOGLE_CALENDAR_CLIENT_SECRET: "test-secret", GOOGLE_CALENDAR_TOKEN_KEY: "a1".repeat(32) };
const input = { bookingId: "lesson-1", iCalUID: "lesson-1@portuguesewithines.com", requestId: "stable-request-1", summary: "Portuguese lesson", description: "Online lesson", startAt: "2026-09-20T12:00:00.000Z", endAt: "2026-09-20T13:00:00.000Z" };
const meetingUrl = "https://meet.google.com/abc-defg-hij";
const calendarId = "private-calendar@group.calendar.google.com";
function event(overrides = {}) {
  return { id: "event-1", iCalUID: input.iCalUID, status: "confirmed", summary: input.summary, description: input.description, location: "Online", visibility: "default",
    start: { dateTime: input.startAt }, end: { dateTime: input.endAt },
    extendedProperties: { private: { app: "portuguese-with-ines", bookingId: input.bookingId } },
    conferenceData: { entryPoints: [{ entryPointType: "video", uri: meetingUrl }] }, ...overrides };
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const originalFetch = globalThis.fetch;
let passed = 0;
const failures = [];
async function test(name, run) {
  try { await run(); passed += 1; }
  catch (error) { failures.push({ name, error }); }
  finally { globalThis.fetch = originalFetch; }
}
async function fixture(handler) {
  const connection = { refresh_token_encrypted: await encryptCalendarToken(env, "test-refresh"), calendar_id: calendarId, google_sub: "teacher-google-123" };
  const calls = [];
  globalThis.fetch = async (raw, options) => {
    const url = new URL(raw);
    calls.push({ url, options });
    if (url.hostname === "oauth2.googleapis.com") {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "test-refresh");
      return response({ access_token: "test-access", expires_in: 3600 });
    }
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.ok(!url.pathname.includes("/calendars/primary"));
    assert.equal(options.headers.Authorization, "Bearer test-access");
    assert.equal(options.redirect, "manual");
    return handler(url, options, calls);
  };
  return { connection, calls };
}
function rejects(code, status) {
  return (error) => error instanceof CalendarProviderError && error.causeCode === code && error.statusCode === status;
}

await test("configuration requires a correctly sized key and the narrow Calendar scope", async () => {
  assert.equal(CALENDAR_SCOPE, "https://www.googleapis.com/auth/calendar.app.created");
  assert.equal(calendarConfigured(env), true);
  assert.equal(calendarConfigured({ ...env, GOOGLE_CALENDAR_TOKEN_KEY: "a1" }), false);
  assert.equal(calendarConfigured({ ...env, GOOGLE_CALENDAR_CLIENT_SECRET: "" }), false);
});
await test("tokens encrypt with unique nonces, round trip, and reject tampering/wrong keys", async () => {
  const encrypted = await encryptCalendarToken(env, "private-refresh");
  assert.notEqual(encrypted, await encryptCalendarToken(env, "private-refresh"));
  assert.equal(await decryptCalendarToken(env, encrypted), "private-refresh");
  assert.ok(!encrypted.includes("private-refresh"));
  await assert.rejects(decryptCalendarToken({ ...env, GOOGLE_CALENDAR_TOKEN_KEY: "b2".repeat(32) }, encrypted), rejects("calendar_reconnect_required", 401));
  const parts = encrypted.split(".");
  parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  await assert.rejects(decryptCalendarToken(env, parts.join(".")), rejects("calendar_reconnect_required", 401));
  await assert.rejects(decryptCalendarToken(env, "v1.not-valid.!"), rejects("calendar_reconnect_required", 401));
});
await test("revoked grants return only a sanitized reconnect error", async () => {
  const connection = { refresh_token_encrypted: await encryptCalendarToken(env, "secret-refresh") };
  globalThis.fetch = async () => response({ error: "invalid_grant", error_description: "SENSITIVE PROVIDER DETAILS" }, 400);
  await assert.rejects(calendarAccessToken(env, connection), (error) => rejects("calendar_reconnect_required", 401)(error) && !JSON.stringify(error).includes("SENSITIVE") && !error.message.includes("SENSITIVE"));
});
await test("provider transport/malformed responses never leak underlying details", async () => {
  const connection = { refresh_token_encrypted: await encryptCalendarToken(env, "secret-refresh") };
  globalThis.fetch = async () => { throw new Error("private token in network message"); };
  await assert.rejects(calendarAccessToken(env, connection), rejects("calendar_unavailable", 503));
  globalThis.fetch = async () => new Response("not JSON", { status: 500 });
  await assert.rejects(calendarAccessToken(env, connection), rejects("calendar_unavailable", 503));
});
await test("access token refresh is reused for the same encrypted grant", async () => {
  const { connection, calls } = await fixture(() => { throw new Error("unexpected calendar call"); });
  assert.equal(await calendarAccessToken(env, connection), "test-access");
  assert.equal(await calendarAccessToken(env, connection), "test-access");
  assert.equal(calls.length, 1);
});
await test("imports one UID copy with one conference, inherited calendar privacy and no attendees/emails", async () => {
  let imports = 0;
  const { connection } = await fixture((url, options) => {
    assert.ok(url.pathname.startsWith(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`));
    if (options.method === "GET") { assert.equal(url.searchParams.get("iCalUID"), input.iCalUID); return response({ items: [] }); }
    imports += 1;
    assert.equal(options.method, "POST");
    assert.ok(url.pathname.endsWith("/import"));
    assert.equal(url.searchParams.get("conferenceDataVersion"), "1");
    const body = JSON.parse(options.body);
    assert.equal(body.iCalUID, input.iCalUID);
    assert.equal(body.visibility, "default");
    assert.equal(body.location, "Online");
    assert.equal(body.attendees, undefined);
    assert.deepEqual(body.reminders, { useDefault: false });
    assert.deepEqual(body.extendedProperties.private, { app: "portuguese-with-ines", bookingId: input.bookingId });
    assert.deepEqual(body.conferenceData.createRequest, { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } });
    return response(event());
  });
  assert.deepEqual(await ensureCalendarMeeting(env, connection, input), { eventId: "event-1", meetingUrl, status: "ready" });
  assert.equal(imports, 1);
});
await test("lost import response recovers by UID without creating a second event", async () => {
  let reads = 0, imports = 0;
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response({ items: ++reads === 1 ? [] : [event()] });
    imports += 1;
    throw new Error("network interrupted after Google saved event");
  });
  assert.equal((await ensureCalendarMeeting(env, connection, input)).meetingUrl, meetingUrl);
  assert.equal(imports, 1);
  assert.equal(reads, 2);
});
await test("untagged and ambiguous UID matches are never modified", async () => {
  for (const items of [[event({ extendedProperties: {} })], [event(), event({ id: "event-2" })]]) {
    const { connection, calls } = await fixture(() => response({ items }));
    await assert.rejects(ensureCalendarMeeting(env, connection, input), rejects("calendar_event_conflict", 409));
    assert.equal(calls.filter((c) => c.options.method !== "GET" && c.url.hostname !== "oauth2.googleapis.com").length, 0);
  }
});
await test("stored event ID must still match UID and booking tag", async () => {
  const { connection } = await fixture(() => response(event({ iCalUID: "different-uid" })));
  await assert.rejects(ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" }), rejects("calendar_event_conflict", 409));
});
await test("reschedule patches times and preserves conference instead of requesting another", async () => {
  const moved = { ...input, eventId: "event-1", startAt: "2026-09-21T12:00:00Z", endAt: "2026-09-21T13:00:00Z" };
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response(event());
    assert.equal(options.method, "PATCH");
    assert.equal(url.searchParams.get("sendUpdates"), "none");
    const body = JSON.parse(options.body);
    assert.equal(body.conferenceData, undefined);
    assert.equal(body.attendees, undefined);
    assert.equal(body.start.dateTime, moved.startAt);
    return response(event(body));
  });
  assert.equal((await ensureCalendarMeeting(env, connection, moved)).meetingUrl, meetingUrl);
});
await test("pending conference polls are bounded and preserve event identity", async () => {
  let gets = 0;
  const pending = event({ conferenceData: { createRequest: { status: { statusCode: "pending" } } } });
  const { connection } = await fixture(() => { gets += 1; return response(pending); });
  assert.deepEqual(await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" }), { eventId: "event-1", meetingUrl: null, status: "pending", conference: "pending" });
  assert.equal(gets, 3);
});
await test("pending conference can become ready during bounded polling", async () => {
  let gets = 0;
  const { connection } = await fixture(() => response(++gets === 1 ? event({ conferenceData: { createRequest: { status: { statusCode: "pending" } } } }) : event()));
  assert.equal((await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" })).status, "ready");
  assert.equal(gets, 2);
});
await test("failed conferences and invalid URLs produce sanitized errors", async () => {
  for (const [conferenceData, code] of [
    [{ createRequest: { requestId: input.requestId, status: { statusCode: "failure" } } }, "calendar_conference_failed"],
    [{ entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com.attacker.test/abc-defg-hij" }] }, "calendar_invalid_meeting_url"],
    [{ entryPoints: [{ entryPointType: "video", uri: `${meetingUrl}?access=secret` }] }, "calendar_invalid_meeting_url"],
  ]) {
    const { connection } = await fixture(() => response(event({ conferenceData })));
    await assert.rejects(ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" }), rejects(code, 502));
  }
});
await test("missing saved event recovers exact tagged UID", async () => {
  let count = 0;
  const { connection } = await fixture(() => ++count === 1 ? response({}, 404) : response({ items: [event()] }));
  assert.equal((await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" })).status, "ready");
  assert.equal(count, 2);
});
await test("cancel performs a recoverable status patch on tagged event only", async () => {
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response(event());
    assert.equal(options.method, "PATCH");
    assert.equal(url.searchParams.get("sendUpdates"), "none");
    assert.deepEqual(JSON.parse(options.body), { status: "cancelled" });
    return response(event({ status: "cancelled" }));
  });
  await cancelCalendarMeeting(env, connection, { bookingId: input.bookingId, eventId: "event-1" });
});
await test("cancel refuses events that belong to a different booking", async () => {
  const { connection } = await fixture(() => response(event()));
  await assert.rejects(cancelCalendarMeeting(env, connection, { bookingId: "other-booking", eventId: "event-1" }), rejects("calendar_event_conflict", 409));
});
await test("a tagged cancelled event is restored without replacing its Meet room", async () => {
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response(event({ status: "cancelled" }));
    const body = JSON.parse(options.body);
    assert.equal(body.status, "confirmed");
    assert.equal(body.conferenceData, undefined);
    return response(event(body));
  });
  assert.equal((await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" })).meetingUrl, meetingUrl);
});
await test("Google auth rejection evicts cached access and reports reconnect", async () => {
  const { connection, calls } = await fixture(() => response({}, 401));
  await assert.rejects(ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" }), rejects("calendar_reconnect_required", 401));
  await calendarAccessToken(env, connection);
  assert.equal(calls.filter((c) => c.url.hostname === "oauth2.googleapis.com").length, 2);
});

await test("saved secondary calendar is reused without any provider request", async () => {
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  assert.equal(await ensureAppCalendar(env, { calendar_id: calendarId, calendar_creation_attempted_at: "2026-09-14" }), calendarId);
});
await test("first calendar creation uses the account marker and shows the lesson calendar", async () => {
  let mutations = 0;
  const { connection, calls } = await fixture((url, options) => {
    mutations += 1;
    if (options.method === "POST") {
      assert.equal(url.pathname, "/calendar/v3/calendars");
      const body = JSON.parse(options.body);
      assert.equal(body.summary, "Português com a Inês — lessons");
      assert.equal(body.timeZone, "Europe/Lisbon");
      assert.ok(body.description.includes("app=portuguese-with-ines;google_sub=teacher-google-123"));
      return response({ id: calendarId });
    }
    assert.equal(options.method, "PATCH");
    assert.equal(url.pathname, `/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`);
    assert.deepEqual(JSON.parse(options.body), { hidden: false, selected: true });
    return response({ id: calendarId, selected: true, hidden: false });
  });
  assert.equal(await ensureAppCalendar(env, { ...connection, calendar_id: null }), calendarId);
  assert.equal(mutations, 2);
  assert.ok(calls.every((call) => call.options.method !== "GET"));
});
await test("calendar display setup failure does not discard the successfully created ID", async () => {
  const { connection } = await fixture((url, options) => options.method === "POST" ? response({ id: calendarId }) : response({}, 403));
  assert.equal(await ensureAppCalendar(env, { ...connection, calendar_id: null }), calendarId);
});
await test("provider requests use Workers-compatible manual redirects and never follow them", async () => {
  const { connection } = await fixture((url, options) => {
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://untrusted.example.invalid" } });
  });
  await assert.rejects(ensureAppCalendar(env, { ...connection, calendar_id: null }), rejects("calendar_setup_uncertain", 409));
});
await test("ambiguous calendar creation is not retried automatically", async () => {
  let creates = 0;
  const { connection } = await fixture(() => { creates += 1; throw new Error("Lost successful response"); });
  await assert.rejects(ensureAppCalendar(env, { ...connection, calendar_id: null }), rejects("calendar_setup_uncertain", 409));
  await assert.rejects(ensureAppCalendar(env, { ...connection, calendar_id: null, calendar_creation_attempted_at: "2026-09-14" }), rejects("calendar_setup_uncertain", 409));
  assert.equal(creates, 1);
});
await test("missing or primary calendar IDs are rejected without sending events", async () => {
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  for (const value of [undefined, "primary", "teacher@gmail.com"]) {
    await assert.rejects(ensureCalendarMeeting(env, { calendar_id: value }, input), rejects("calendar_missing", 409));
    await assert.rejects(cancelCalendarMeeting(env, { calendar_id: value }, { bookingId: input.bookingId, eventId: "event-1" }), rejects("calendar_missing", 409));
  }
});
await test("failed conference gets a fresh request on a later attempt without another event import", async () => {
  let patches = 0;
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response(event({ conferenceData: { createRequest: { requestId: "prior-attempt", status: { statusCode: "failure" } } } }));
    assert.equal(options.method, "PATCH");
    patches += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.conferenceData.createRequest.requestId, input.requestId);
    assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
    return response(event());
  });
  assert.equal((await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" })).status, "ready");
  assert.equal(patches, 1);
});

await test("pending conference does not restart just because the caller attempt changed", async () => {
  const { connection } = await fixture((url, options) => {
    assert.equal(options.method, "GET");
    return response(event({ conferenceData: { createRequest: { requestId: "prior-attempt", status: { statusCode: "pending" } } } }));
  });
  assert.equal((await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" })).status, "pending");
});

await test("new Porto lesson imports no conference and is ready without polling", async () => {
  let imports = 0;
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response({ items: [] });
    assert.equal(options.method, "POST");
    imports += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.location, "Porto");
    assert.equal(body.visibility, "default");
    assert.equal(body.conferenceData, undefined);
    return response(event({ ...body, conferenceData: undefined }));
  });
  assert.deepEqual(await ensureCalendarMeeting(env, connection, { ...input, online: false }), { eventId: "event-1", status: "ready", meetingUrl: null });
  assert.equal(imports, 1);
});
await test("existing Porto lesson is ready without creating a conference", async () => {
  let gets = 0;
  const { connection } = await fixture((url, options) => {
    gets += 1;
    assert.equal(options.method, "GET");
    return response(event({ location: "Porto", conferenceData: undefined }));
  });
  assert.equal((await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1", online: false })).status, "ready");
  assert.equal(gets, 1);
});
await test("online to Porto clears conferencing and retains its event ID", async () => {
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response(event());
    assert.equal(options.method, "PATCH");
    assert.ok(url.pathname.endsWith("/events/event-1"));
    assert.equal(url.searchParams.get("conferenceDataVersion"), "1");
    assert.equal(url.searchParams.get("sendUpdates"), "none");
    const body = JSON.parse(options.body);
    assert.equal(body.conferenceData, null);
    assert.equal(body.location, "Porto");
    return response(event(body));
  });
  assert.deepEqual(await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1", online: false }), { eventId: "event-1", meetingUrl: null, status: "ready" });
});
await test("Porto to online adds conferencing to the same event", async () => {
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response(event({ location: "Porto", conferenceData: null }));
    assert.equal(options.method, "PATCH");
    assert.ok(url.pathname.endsWith("/events/event-1"));
    const body = JSON.parse(options.body);
    assert.equal(body.location, "Online");
    assert.equal(body.conferenceData.createRequest.requestId, input.requestId);
    return response(event());
  });
  assert.deepEqual(await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1", online: true }), { eventId: "event-1", meetingUrl, status: "ready" });
});
await test("older explicitly private lesson inherits shared-calendar read permissions", async () => {
  const { connection } = await fixture((url, options) => {
    if (options.method === "GET") return response(event({ visibility: "private" }));
    assert.equal(options.method, "PATCH");
    const body = JSON.parse(options.body);
    assert.equal(body.visibility, "default");
    assert.equal(body.conferenceData, undefined);
    return response(event(body));
  });
  assert.equal((await ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1" })).meetingUrl, meetingUrl);
});
await test("Porto sync does not claim success when provider retains conferencing", async () => {
  const { connection } = await fixture(() => response(event()));
  await assert.rejects(ensureCalendarMeeting(env, connection, { ...input, eventId: "event-1", online: false }), rejects("calendar_unavailable", 503));
});

for (const { name, error } of failures) console.error(`FAIL: ${name}\n${error.stack}`);
console.log(`${passed} Google Calendar tests passed; ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
