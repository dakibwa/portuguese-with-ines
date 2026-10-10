import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { calendarConnectionStatus, calendarOwnsTeacherInvites, startCalendarConnection, finishCalendarConnection, prepareMeeting, meetingUrl, syncPendingMeetings, markMeetingNotified } from "./meeting-service.mjs";
import worker from "./index.mjs";
import { createSession, sessionHash } from "./auth.mjs";
import { CALENDAR_SCOPE, encryptCalendarToken, decryptCalendarToken } from "./google-calendar.mjs";

const NativeDate = Date;
let clock = NativeDate.parse("2026-09-14T10:00:00.000Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("./seed.sql", import.meta.url), "utf8"));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      first() { return db.prepare(sql).get(...args) ?? null; },
      all() { return { results: db.prepare(sql).all(...args) }; },
      run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    };
    return statement;
  },
  async batch(statements) {
    db.exec("BEGIN");
    try { const result = statements.map(statement => statement.run()); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  },
};
const env = {
  DB, GOOGLE_CALENDAR_ENABLED: "1", GOOGLE_CALENDAR_CLIENT_ID: "isolated-calendar-client",
  GOOGLE_CALENDAR_CLIENT_SECRET: "isolated-calendar-secret", GOOGLE_CALENDAR_TOKEN_KEY: "ab".repeat(32),
  GOOGLE_CALENDAR_REDIRECT_URI: "https://api.example.invalid/google-calendar/callback",
};
const iso = offset => new Date(clock + offset).toISOString();
const link = "https://meet.google.com/abc-defg-hij";
let requests = [], events = new Map(), mode = "ready", duringImport = null, tokenError = false, oauthProfile = {}, oauthScope = CALENDAR_SCOPE, calendarCreationFailure = false, duringCodeExchange = null;
const warnings = [];
console.warn = (...args) => warnings.push(args);
const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "meeting-test-key" };
async function idToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const value = `${encode({ alg: "RS256", kid: jwk.kid })}.${encode({ iss: "https://accounts.google.com", aud: env.GOOGLE_CALENDAR_CLIENT_ID, sub: "ines-google", email: "ines@example.invalid", email_verified: true, exp: Date.now() / 1000 + 3600, ...oauthProfile })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(value));
  return `${value}.${Buffer.from(signature).toString("base64url")}`;
}
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const method = options.method ?? "GET";
  requests.push({ url: url.href, method, body: options.body });
  if (url.href === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
  if (url.href === "https://oauth2.googleapis.com/token") {
    const body = new URLSearchParams(options.body);
    if (tokenError) return Response.json({ error: "invalid_grant" }, { status: 400 });
    if (body.get("grant_type") === "authorization_code") { await duringCodeExchange?.(); return Response.json({ refresh_token: "isolated-refresh-only", id_token: await idToken(), scope: oauthScope }); }
    assert.equal(body.get("grant_type"), "refresh_token");
    return Response.json({ access_token: "isolated-access-only", expires_in: 0 });
  }
  assert.equal(url.origin, "https://www.googleapis.com", "No external network is permitted");
  if (url.pathname === "/calendar/v3/calendars" && method === "POST") {
    if (calendarCreationFailure) throw new Error("Isolated lost calendar create response");
    return Response.json({ id: "app-calendar@group.calendar.google.com" });
  }
  if (url.pathname.startsWith("/calendar/v3/users/me/calendarList/") && method === "PATCH") {
    assert.deepEqual(JSON.parse(options.body), { selected: true, hidden: false });
    return Response.json({ id: "app-calendar@group.calendar.google.com" });
  }
  assert.match(url.pathname, /^\/calendar\/v3\/calendars\/[^/]+\/events(?:\/[^/]+)?$/);
  if (mode === "unavailable") return Response.json({ error: "isolated outage" }, { status: 503 });
  const suffix = url.pathname.split("/events")[1];
  if (!suffix && method === "GET") return Response.json({ items: [...events.values()].filter(event => event.iCalUID === url.searchParams.get("iCalUID")) });
  if (suffix === "/import" && method === "POST") {
    await duringImport?.();
    const body = JSON.parse(options.body);
    const event = { ...body, id: `event-${events.size + 1}`, status: "confirmed", ...(mode === "pending" || !body.conferenceData ? {} : { hangoutLink: link }) };
    events.set(event.id, event);
    return Response.json(event);
  }
  const id = decodeURIComponent(suffix.slice(1));
  const event = events.get(id);
  if (!event) return Response.json({}, { status: 404 });
  if (method === "PATCH") {
    const patch = JSON.parse(options.body);
    Object.assign(event, patch);
    if (patch.conferenceData === null) delete event.hangoutLink;
  }
  if (mode === "ready" && event.conferenceData) event.hangoutLink = link;
  return Response.json(event);
};

function row(id) { return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id); }
function teacher() { return db.prepare("SELECT * FROM students WHERE id='teacher'").get(); }
function addBooking(id, overrides = {}) {
  db.prepare(`INSERT INTO bookings (id, reference, lesson_type_id, student_id, student_name, student_email, student_phone,
    student_timezone, location, notes, starts_at, ends_at, status, sequence, created_at, updated_at, payment_status)
    VALUES (?, ?, 'single', 'student', 'Ana', 'ana@example.invalid', '', 'Europe/Lisbon', 'online', '', ?, ?, 'confirmed', 0, ?, ?, 'scheduled')`)
    .run(id, id, iso(86400000), iso(90000000), iso(-180000), iso(0));
  for (const [key, value] of Object.entries(overrides)) {
    assert.match(key, /^[a-z_]+$/);
    db.prepare(`UPDATE bookings SET ${key} = ? WHERE id = ?`).run(value, id);
  }
  return row(id);
}
async function reset() {
  db.exec("DELETE FROM bookings; DELETE FROM google_calendar_connections; DELETE FROM google_calendar_oauth_states; DELETE FROM revoked_sessions; DELETE FROM students;");
  for (const id of ["teacher", "student", "other-teacher"]) db.prepare("INSERT INTO students (id, email, name, password_hash, role, google_sub, created_at) VALUES (?, ?, ?, '', ?, ?, ?)")
    .run(id, id === "teacher" ? "ines@example.invalid" : `${id}@example.invalid`, id, id === "student" ? "student" : "teacher", id === "teacher" ? "ines-google" : null, iso(0));
  requests = []; events = new Map(); mode = "ready"; duringImport = null; tokenError = false; oauthProfile = {}; oauthScope = CALENDAR_SCOPE; calendarCreationFailure = false; duringCodeExchange = null; warnings.length = 0;
  await connectFixture();
}
async function connectFixture() {
  db.prepare("INSERT INTO google_calendar_connections (id, teacher_id, google_sub, email, refresh_token_encrypted, status, updated_at) VALUES (1, 'teacher', 'ines-google', 'ines@example.invalid', ?, 'active', ?)")
    .run(await encryptCalendarToken(env, "fixture-refresh"), iso(0));
  db.prepare("UPDATE google_calendar_connections SET calendar_id = 'app-calendar@group.calendar.google.com' WHERE id=1").run();
}
async function begin() {
  const auth = new URL(await startCalendarConnection(env, teacher(), "isolated-session-hash"));
  const callback = new URL(env.GOOGLE_CALENDAR_REDIRECT_URI);
  callback.searchParams.set("state", auth.searchParams.get("state"));
  callback.searchParams.set("code", "isolated-code");
  return { auth, callback };
}
let passed = 0;
async function test(name, body) {
  await reset();
  try { await body(); passed++; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}

try {
  await test("disabled integration never reads provider or exposes connection", async () => {
    const input = addBooking("disabled");
    assert.equal(await prepareMeeting({ ...env, GOOGLE_CALENDAR_ENABLED: "0" }, input), input);
    assert.deepEqual(await calendarConnectionStatus({ ...env, GOOGLE_CALENDAR_ENABLED: "0" }), { configured: false, connected: false, email: null, needsReconnect: false, pending: 0 });
    assert.equal(requests.length, 0);
  });
  await test("future confirmed lessons sync while only online lessons receive a Meet room", async () => {
    for (const [id, overrides] of [["pending", { status: "pending_payment" }], ["cancelled", { status: "cancelled" }], ["past", { starts_at: iso(-7200000), ends_at: iso(-3600000) }]]) await prepareMeeting(env, addBooking(id, overrides));
    assert.equal(requests.length, 0);
    const porto = await prepareMeeting(env, addBooking("porto", { location: "porto" }));
    assert.ok(porto.meeting_event_id);
    assert.equal(porto.meeting_url, null);
    assert.equal(porto.meeting_sequence, 0);
    const inPersonEvent = events.get(porto.meeting_event_id);
    assert.equal(inPersonEvent.location, "Porto");
    assert.equal(inPersonEvent.visibility, "default", "Shared calendar readers can see lesson details");
    assert.equal(inPersonEvent.conferenceData, undefined);
    assert.equal(inPersonEvent.hangoutLink, undefined);
    const portoRequests = requests.length;
    await prepareMeeting(env, porto);
    assert.equal(requests.length, portoRequests, "Unchanged Porto event is not repeatedly synced");
    const result = await prepareMeeting(env, addBooking("online"));
    assert.equal(meetingUrl(result), link);
    assert.equal(result.meeting_sequence, 0);
    assert.equal(result.meeting_claim_id, null);
    assert.equal(result.meeting_retry_at, null);
    const count = requests.length;
    await prepareMeeting(env, result);
    assert.equal(requests.length, count, "An unchanged ready room is not recreated");
    for (const invalid of [{ location: "porto" }, { status: "cancelled" }, { status: "pending_payment" }, { meeting_url: "https://meet.google.com.evil.invalid/abc-defg-hij" }]) assert.equal(meetingUrl({ ...result, ...invalid }), null);
  });
  await test("concurrent provisioning takes one claim and creates one event", async () => {
    const input = addBooking("concurrent");
    let second;
    duringImport = async () => { duringImport = null; second = await prepareMeeting(env, row(input.id)); };
    const result = await prepareMeeting(env, input);
    assert.equal(meetingUrl(result), link);
    assert.equal(second.meeting_url, null);
    assert.equal(requests.filter(request => request.method === "POST" && request.url.includes("/events/import")).length, 1);
  });
  await test("temporary failures schedule retry without failing the booking", async () => {
    mode = "unavailable";
    const result = await prepareMeeting(env, addBooking("retry"));
    assert.equal(result.status, "confirmed");
    assert.equal(result.meeting_attempts, 1);
    assert.equal(result.meeting_retry_at, iso(60000));
    const count = requests.length;
    await prepareMeeting(env, result);
    assert.equal(requests.length, count, "Retry delay is respected");
    clock += 61000; mode = "ready";
    assert.equal(meetingUrl(await prepareMeeting(env, row("retry"))), link);
    assert.equal(row("retry").meeting_attempts, 0);
  });
  await test("pending conference retains provider identity and is polled later", async () => {
    mode = "pending";
    const result = await prepareMeeting(env, addBooking("pending-room"));
    assert.ok(result.meeting_event_id);
    assert.equal(result.meeting_url, null);
    clock += 61000; mode = "ready";
    assert.equal(meetingUrl(await prepareMeeting(env, row(result.id))), link);
    assert.equal(events.size, 1);
  });
  await test("lessons booked before links reached students hear the day before; new bookings at once", async () => {
    // The test clock runs before the real cutoff, so this run draws its own.
    const backlogBefore = iso(-3600000);
    const before = iso(-2 * 3600000);
    const far = await prepareMeeting(env, addBooking("backlog-far", { created_at: before, starts_at: iso(3 * 86400000), ends_at: iso(3 * 86400000 + 3600000) }));
    const near = await prepareMeeting(env, addBooking("backlog-near", { created_at: before, starts_at: iso(20 * 3600000), ends_at: iso(21 * 3600000) }));
    const fresh = await prepareMeeting(env, addBooking("fresh-far", { starts_at: iso(3 * 86400000 + 60000), ends_at: iso(3 * 86400000 + 3660000) }));
    for (const ready of [far, near, fresh]) assert.equal(meetingUrl(ready), link);
    const sent = [];
    await syncPendingMeetings(env, async booking => { sent.push(booking.id); return true; }, { backlogBefore });
    assert.ok(sent.includes(near.id), "An older booking within a day of its lesson hears now");
    assert.ok(sent.includes(fresh.id), "A booking made since hears straight away, however far off");
    assert.ok(!sent.includes(far.id), "An older booking days away waits");
    assert.equal(row(far.id).meeting_notified_at, null);
    clock += 2 * 86400000 + 60000;
    sent.length = 0;
    await syncPendingMeetings(env, async booking => { sent.push(booking.id); return true; }, { backlogBefore });
    assert.deepEqual(sent.filter(id => id === far.id), [far.id], "It hears the day before, once");
    assert.ok(row(far.id).meeting_notified_at);
  });
  await test("online and Porto cancellations soft-cancel the existing event", async () => {
    for (const location of ["online", "porto"]) {
      const ready = await prepareMeeting(env, addBooking(`cancel-${location}`, { location }));
      db.prepare("UPDATE bookings SET status='cancelled', sequence=sequence+1 WHERE id=?").run(ready.id);
      await syncPendingMeetings(env, async () => { throw new Error("Cancelled lesson must not be emailed"); });
      const changed = row(ready.id);
      assert.equal(meetingUrl(changed), null);
      assert.equal(events.get(ready.meeting_event_id).status, "cancelled");
      assert.equal(changed.meeting_sequence, 1);
    }
  });
  await test("online to Porto to online updates one event and adds/removes only the Meet room", async () => {
    const ready = await prepareMeeting(env, addBooking("format-switch"));
    const eventId = ready.meeting_event_id;
    const originalConferenceRequest = events.get(eventId).conferenceData.createRequest.requestId;
    assert.equal(meetingUrl(ready), link);
    await markMeetingNotified(env, ready);
    assert.ok(row(ready.id).meeting_notified_at);
    db.prepare("UPDATE bookings SET location='porto', sequence=1 WHERE id=?").run(ready.id);
    await syncPendingMeetings(env, async () => { throw new Error("Porto lesson must not receive Meet email"); });
    const porto = row(ready.id);
    assert.equal(porto.meeting_sequence, 1);
    assert.equal(porto.meeting_event_id, eventId);
    assert.equal(porto.meeting_url, null);
    assert.equal(porto.meeting_notified_at, null, "Removing the room clears the old notification marker");
    assert.equal(events.get(eventId).status, "confirmed");
    assert.equal(events.get(eventId).location, "Porto");
    assert.equal(events.get(eventId).hangoutLink, undefined);
    db.prepare("UPDATE bookings SET location='online', sequence=2 WHERE id=?").run(ready.id);
    const online = await prepareMeeting(env, row(ready.id));
    assert.equal(online.meeting_event_id, eventId);
    assert.equal(online.meeting_sequence, 2);
    assert.equal(meetingUrl(online), link);
    assert.equal(events.get(eventId).location, "Online");
    const recreatedConferenceRequest = events.get(eventId).conferenceData.createRequest.requestId;
    assert.notEqual(recreatedConferenceRequest, originalConferenceRequest, "Returning online requests a fresh conference after removal");
    assert.equal(events.size, 1);
    assert.equal(online.meeting_notified_at, null);
    let sends = 0;
    await syncPendingMeetings(env, async booking => { sends++; assert.equal(meetingUrl(booking), link); return true; });
    assert.equal(sends, 1, "A newly created room can send its ready notification after returning online");
    assert.ok(row(ready.id).meeting_notified_at);
    db.prepare("UPDATE bookings SET starts_at=?, ends_at=?, sequence=3 WHERE id=?").run(iso(172800000), iso(176400000), ready.id);
    const moved = await prepareMeeting(env, row(ready.id));
    assert.equal(moved.meeting_sequence, 3);
    assert.equal(moved.meeting_event_id, eventId);
    assert.equal(meetingUrl(moved), link);
    assert.equal(events.get(eventId).conferenceData.createRequest.requestId, recreatedConferenceRequest, "A reschedule keeps the existing room");
    assert.ok(moved.meeting_notified_at, "An unchanged room keeps its notification marker");
  });
  await test("background sweep backfills Porto lessons without generating Meet notifications", async () => {
    addBooking("porto-backfill", { location: "porto" });
    await syncPendingMeetings(env, async () => { throw new Error("An in-person lesson has no Meet notification"); });
    const porto = row("porto-backfill");
    assert.ok(porto.meeting_event_id);
    assert.equal(porto.meeting_sequence, porto.sequence);
    assert.equal(porto.meeting_url, null);
    assert.equal(events.get(porto.meeting_event_id).location, "Porto");
  });
  await test("connection status counts unsynced online and Porto lessons, including stale updates", async () => {
    addBooking("status-online");
    addBooking("status-porto", { location: "porto" });
    addBooking("status-stale", { location: "porto", meeting_event_id: "stale-event", meeting_sequence: 0, sequence: 1 });
    addBooking("status-room-pending", { meeting_event_id: "pending-event", meeting_sequence: 0, meeting_url: null });
    addBooking("status-synced-porto", { location: "porto", meeting_event_id: "synced-porto", meeting_sequence: 0 });
    addBooking("status-synced-online", { meeting_event_id: "synced-online", meeting_sequence: 0, meeting_url: link });
    addBooking("status-completed", { ends_at: iso(-1) });
    addBooking("status-cancelled", { status: "cancelled" });
    addBooking("status-payment-pending", { status: "pending_payment" });
    assert.equal((await calendarConnectionStatus(env)).pending, 4);
  });
  await test("teacher invitations stay on the direct calendar route during reconnect", async () => {
    assert.equal(await calendarOwnsTeacherInvites(env), true);
    assert.equal(await calendarOwnsTeacherInvites({ ...env, GOOGLE_CALENDAR_ENABLED: "0" }), false);
    db.prepare("UPDATE google_calendar_connections SET status='reconnect' WHERE id=1").run();
    assert.equal(await calendarOwnsTeacherInvites(env), true, "Reconnect must not reintroduce duplicate ICS invitations");
    db.prepare("UPDATE google_calendar_connections SET calendar_id=NULL WHERE id=1").run();
    assert.equal(await calendarOwnsTeacherInvites(env), false);
    db.exec("DELETE FROM google_calendar_connections");
    assert.equal(await calendarOwnsTeacherInvites(env), false);
    await connectFixture();
    db.prepare("UPDATE students SET role='student' WHERE id='teacher'").run();
    assert.equal(await calendarOwnsTeacherInvites(env), false);
  });
  await test("cancellation during provider work hides link and reconciles same event", async () => {
    const input = addBooking("race-cancel");
    duringImport = async () => { duringImport = null; db.prepare("UPDATE bookings SET status='cancelled', sequence=1 WHERE id=?").run(input.id); };
    const result = await prepareMeeting(env, input);
    assert.equal(meetingUrl(result), null);
    assert.ok(result.meeting_event_id, "Provider identity survives the cancellation race");
    await syncPendingMeetings(env, async () => { throw new Error("Cancelled lesson must not be emailed"); });
    assert.equal(events.get(result.meeting_event_id).status, "cancelled");
  });
  await test("invalid grant asks teacher to reconnect and role loss disables access", async () => {
    tokenError = true;
    await prepareMeeting(env, addBooking("revoked-provider"));
    const status = await calendarConnectionStatus(env);
    assert.equal(status.needsReconnect, true);
    assert.equal(status.connected, false);
    const count = requests.length;
    await prepareMeeting(env, row("revoked-provider"));
    assert.equal(requests.length, count);
    db.prepare("UPDATE students SET role='student' WHERE id='teacher'").run();
    const hidden = await calendarConnectionStatus(env);
    assert.equal(hidden.email, null);
    assert.equal(hidden.connected, false);
  });
  await test("ready notices retry failures, dedupe successful sends and exclude cancelled", async () => {
    const ready = await prepareMeeting(env, addBooking("notify"));
    let sends = 0;
    await syncPendingMeetings(env, async () => { sends++; return false; });
    assert.equal(row(ready.id).meeting_notified_at, null);
    await syncPendingMeetings(env, async () => { sends++; return true; });
    assert.ok(row(ready.id).meeting_notified_at);
    await syncPendingMeetings(env, async () => { sends++; return true; });
    assert.equal(sends, 2);
    const included = await prepareMeeting(env, addBooking("confirmation-included"));
    await markMeetingNotified(env, included);
    await syncPendingMeetings(env, async () => { throw new Error("Already-included link must not be resent"); });
  });
  await test("first OAuth setup creates one visible app calendar and reconnect reuses it", async () => {
    db.exec("DELETE FROM google_calendar_connections");
    let { callback } = await begin();
    assert.equal(await finishCalendarConnection(env, callback), "connected");
    assert.equal(db.prepare("SELECT calendar_id FROM google_calendar_connections").get().calendar_id, "app-calendar@group.calendar.google.com");
    const displayRequest = requests.find(request => request.url.includes("/users/me/calendarList/"));
    assert.ok(displayRequest);
    assert.deepEqual(JSON.parse(displayRequest.body), { selected: true, hidden: false });
    ({ callback } = await begin());
    assert.equal(await finishCalendarConnection(env, callback), "connected");
    assert.equal(requests.filter(request => request.url === "https://www.googleapis.com/calendar/v3/calendars" && request.method === "POST").length, 1);
  });
  await test("ambiguous calendar creation is not blindly repeated on reconnect", async () => {
    db.exec("DELETE FROM google_calendar_connections");
    calendarCreationFailure = true;
    let { callback } = await begin();
    assert.equal(await finishCalendarConnection(env, callback), "error");
    const account = db.prepare("SELECT * FROM google_calendar_connections").get();
    assert.equal(account.calendar_id, null);
    assert.ok(account.calendar_creation_attempted_at);
    calendarCreationFailure = false;
    ({ callback } = await begin());
    assert.equal(await finishCalendarConnection(env, callback), "error");
    assert.equal(requests.filter(request => request.url === "https://www.googleapis.com/calendar/v3/calendars" && request.method === "POST").length, 1);
  });
  await test("a confirmed setup recovery resumes from the saved grant once without OAuth", async () => {
    db.exec("UPDATE google_calendar_connections SET calendar_id=NULL, calendar_creation_attempted_at=NULL");
    await syncPendingMeetings(env, async () => true);
    assert.equal(db.prepare("SELECT calendar_id FROM google_calendar_connections").get().calendar_id, "app-calendar@group.calendar.google.com");
    await syncPendingMeetings(env, async () => true);
    assert.equal(requests.filter(request => request.url === "https://www.googleapis.com/calendar/v3/calendars" && request.method === "POST").length, 1);
    assert.ok(!requests.some(request => String(request.body).includes("authorization_code")));
  });
  await test("token failure before calendar creation leaves setup retryable", async () => {
    db.exec("UPDATE google_calendar_connections SET calendar_id=NULL, calendar_creation_attempted_at=NULL");
    tokenError = true;
    await syncPendingMeetings(env, async () => true);
    assert.equal(db.prepare("SELECT calendar_creation_attempted_at FROM google_calendar_connections").get().calendar_creation_attempted_at, null);
    assert.ok(!requests.some(request => request.url === "https://www.googleapis.com/calendar/v3/calendars"));
    tokenError = false;
    await syncPendingMeetings(env, async () => true);
    assert.equal(db.prepare("SELECT calendar_id FROM google_calendar_connections").get().calendar_id, "app-calendar@group.calendar.google.com");
  });
  await test("the background sweep never repeats uncertain calendar creation", async () => {
    db.exec("UPDATE google_calendar_connections SET calendar_id=NULL, calendar_creation_attempted_at=NULL");
    calendarCreationFailure = true;
    await syncPendingMeetings(env, async () => true);
    calendarCreationFailure = false;
    await syncPendingMeetings(env, async () => true);
    assert.equal(requests.filter(request => request.url === "https://www.googleapis.com/calendar/v3/calendars" && request.method === "POST").length, 1);
    assert.equal(db.prepare("SELECT calendar_id FROM google_calendar_connections").get().calendar_id, null);
  });
  await test("revocation during code exchange cannot finish connecting", async () => {
    const { callback } = await begin();
    duringCodeExchange = async () => { db.prepare("UPDATE students SET session_version=session_version+1 WHERE id='teacher'").run(); };
    assert.equal(await finishCalendarConnection(env, callback), "error");
    assert.equal(await decryptCalendarToken(env, db.prepare("SELECT refresh_token_encrypted FROM google_calendar_connections").get().refresh_token_encrypted), "fixture-refresh");
  });
  await test("concurrent ready sweeps claim a notification before sending", async () => {
    await prepareMeeting(env, addBooking("notify-concurrent"));
    let sends = 0;
    await syncPendingMeetings(env, async () => {
      sends++;
      await syncPendingMeetings(env, async () => { sends++; return true; });
      return true;
    });
    assert.equal(sends, 1, "Overlapping cron sweeps must not send the same ready email twice");
  });
  await test("notification leases expire and thrown sends release their lease", async () => {
    const ready = await prepareMeeting(env, addBooking("notification-lease"));
    db.prepare("UPDATE bookings SET meeting_notification_claim_until=? WHERE id=?").run(iso(60000), ready.id);
    let sends = 0;
    await syncPendingMeetings(env, async () => { sends++; return true; });
    assert.equal(sends, 0);
    clock += 61000;
    await assert.rejects(syncPendingMeetings(env, async () => { throw new Error("Isolated email outage"); }), /Isolated email outage/);
    assert.equal(row(ready.id).meeting_notification_claim_until, null);
    assert.equal(row(ready.id).meeting_notified_at, null);
    await syncPendingMeetings(env, async () => { sends++; return true; });
    assert.equal(sends, 1);
  });
  await test("OAuth state and PKCE verifier are random, encrypted, expiring and session-bound", async () => {
    const { auth } = await begin();
    assert.equal(auth.origin, "https://accounts.google.com");
    assert.equal(auth.pathname, "/o/oauth2/v2/auth");
    assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    assert.equal(CALENDAR_SCOPE, "https://www.googleapis.com/auth/calendar.app.created");
    assert.equal(auth.searchParams.get("scope"), `openid email ${CALENDAR_SCOPE}`);
    const stored = db.prepare("SELECT * FROM google_calendar_oauth_states").get();
    assert.equal(stored.state_hash, Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(auth.searchParams.get("state")))).toString("hex"));
    assert.equal(stored.session_hash, "isolated-session-hash");
    assert.equal(stored.expires_at, iso(600000));
    const verifier = await decryptCalendarToken(env, stored.verifier_encrypted);
    assert.notEqual(stored.verifier_encrypted, verifier);
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    assert.equal(auth.searchParams.get("code_challenge"), challenge);
    const next = await begin();
    assert.notEqual(next.auth.searchParams.get("state"), auth.searchParams.get("state"));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM google_calendar_oauth_states").get().count, 1);
  });
  await test("OAuth connects matching verified identity once, preserving teacher ownership", async () => {
    const { callback } = await begin();
    assert.equal(await finishCalendarConnection(env, callback), "connected");
    const account = db.prepare("SELECT * FROM google_calendar_connections").get();
    assert.equal(account.teacher_id, "teacher");
    assert.equal(await decryptCalendarToken(env, account.refresh_token_encrypted), "isolated-refresh-only");
    assert.equal(await finishCalendarConnection(env, callback), "error");
  });
  await test("OAuth rejects expiry, revocation, role/session changes and wrong Google identity", async () => {
    for (const mutate of [
      () => db.prepare("UPDATE google_calendar_oauth_states SET expires_at=?").run(iso(-1)),
      () => db.prepare("INSERT INTO revoked_sessions (token_hash, expires_at) VALUES ('isolated-session-hash', ?)").run(iso(600000)),
      () => db.prepare("UPDATE students SET session_version=session_version+1 WHERE id='teacher'").run(),
      () => db.prepare("UPDATE students SET role='student' WHERE id='teacher'").run(),
    ]) {
      await reset(); const { callback } = await begin(); mutate();
      const count = requests.length;
      assert.equal(await finishCalendarConnection(env, callback), "error");
      assert.equal(requests.length, count, "Invalid local state never exchanges an OAuth code");
    }
    await reset(); const { callback } = await begin(); oauthProfile = { sub: "someone-else", email: "other@example.invalid" };
    assert.equal(await finishCalendarConnection(env, callback), "error");
    assert.equal(db.prepare("SELECT email FROM google_calendar_connections").get().email, "ines@example.invalid");
  });
  await test("OAuth cancellation consumes state and missing calendar scope is rejected", async () => {
    let { callback } = await begin(); callback.searchParams.set("error", "access_denied");
    assert.equal(await finishCalendarConnection(env, callback), "cancelled");
    assert.equal(await finishCalendarConnection(env, callback), "error");
    ({ callback } = await begin()); oauthScope = "openid email";
    assert.equal(await finishCalendarConnection(env, callback), "error");
    await assert.rejects(startCalendarConnection(env, db.prepare("SELECT * FROM students WHERE id='other-teacher'").get(), "other-session"), /another teacher/);
  });
  await test("status endpoint is protected and only signed-in teachers may start OAuth", async () => {
    const runtime = { ...env, BOOKING_TOKEN_SECRET: "isolated-signing-only", ADMIN_TOKEN: "isolated-admin-only", ALLOWED_ORIGIN: "https://site.example.invalid", SITE_URL: "https://site.example.invalid" };
    const studentSession = await createSession("student", runtime.BOOKING_TOKEN_SECRET);
    const teacherSession = await createSession("teacher", runtime.BOOKING_TOKEN_SECRET);
    async function call(path, token, method = "GET") {
      return worker.fetch(new Request(`https://api.example.invalid${path}`, {
        method, headers: { Origin: runtime.ALLOWED_ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(method === "POST" ? { body: "{}" } : {}),
      }), runtime, { waitUntil() {} });
    }
    for (const token of [null, studentSession, "invalid-session"]) {
      assert.equal((await call("/admin/google-calendar", token)).status, 401);
      assert.equal((await call("/admin/google-calendar/connect", token, "POST")).status, 401);
    }
    assert.equal((await call("/admin/google-calendar/connect", runtime.ADMIN_TOKEN, "POST")).status, 403);
    const status = await call("/admin/google-calendar", teacherSession);
    assert.equal(status.status, 200);
    const data = await status.json();
    assert.deepEqual(Object.keys(data).sort(), ["configured", "connected", "email", "needsReconnect", "pending"].sort(), "Status never exposes encrypted credentials or OAuth state");
    assert.equal(data.connected, true);
    const connected = await call("/admin/google-calendar/connect", teacherSession, "POST");
    assert.equal(connected.status, 200);
    assert.equal(new URL((await connected.json()).url).origin, "https://accounts.google.com");
    db.prepare("INSERT INTO revoked_sessions (token_hash, expires_at) VALUES (?, ?)").run(await sessionHash(teacherSession), Date.now() + 3600000);
    assert.equal((await call("/admin/google-calendar", teacherSession)).status, 401);
    assert.equal((await call("/admin/google-calendar/connect", teacherSession, "POST")).status, 401);
  });
  console.log(`${passed} meeting service integration tests passed (SQLite, isolated Google/notifications).`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Date = NativeDate;
  console.warn = originalWarn;
  db.close();
}
