import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { emailLifecycle } from "./email.mjs";
import worker, { chargeDueLessons, chargeDueSameDayFees, notifyMeetingReady, notifySeries, resendFailedEmails, retryPaymentRecovery, retryRefunds, sendLessonReminders } from "./index.mjs";
import { createSession, createResetToken, createSignInToken, hashPassword, sessionHash, sessionVersion } from "./auth.mjs";
import { createManageToken, readManageToken } from "./tokens.mjs";
import { findRecurringCode, studentLessonType, priceForMove, takeRateLimit } from "./rates.mjs";
import { bookingSelection, portoWeekOf } from "./selection.mjs";
import { computeAvailability } from "./availability.mjs";

const NativeDate = Date;
let clock = NativeDate.parse("2026-09-05T10:00:00.000Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const nativeFetch = globalThis.fetch;
const charges = [];
const checkoutRequests = [];
const refunds = [];
let duringRefund = null;
let refundUnavailable = false;
let refundStatus = "succeeded";
let refundLookups = 0;
let checkoutStatus = "open";
let chargeError = null;
let googleJwk = null;
let checkoutUnavailable = false;
let decline = false;
const setupIntents = new Map();
let duringSetupRead = null;
const expiredSessions = [];
const completedSessions = new Set();
let expiryUnavailable = false;
// Only reached while a test sets RESEND_API_KEY and turns dry run off.
const sentEmails = [];
let emailUnavailable = false;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://api.resend.com/emails") {
    if (emailUnavailable) return Response.json({ message: "Isolated email outage" }, { status: 503 });
    sentEmails.push(JSON.parse(options.body));
    return Response.json({ id: `email_${sentEmails.length}` });
  }
  if (String(url).startsWith("https://api.stripe.com/v1/setup_intents/")) {
    await duringSetupRead?.();
    return Response.json(setupIntents.get(String(url).split("/").at(-1)) ?? { status: "requires_payment_method" });
  }
  if (String(url).startsWith("https://api.stripe.com/v1/refunds/")) {
    refundLookups++;
    return Response.json({ id: String(url).split("/").at(-1), status: refundStatus });
  }
  if (String(url) === "https://api.stripe.com/v1/refunds") {
    refunds.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    await duringRefund?.();
    if (refundUnavailable) return Response.json({ error: { message: "Isolated refund response loss" } }, { status: 503 });
    return Response.json({ id: `re_${refunds.length}`, status: refundStatus });
  }
  if (String(url) === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [googleJwk] });
  if (/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/[^/]+\/expire$/.test(String(url))) {
    if (checkoutUnavailable || expiryUnavailable) throw new Error("Isolated expiry outage");
    const id = String(url).split("/").at(-2);
    expiredSessions.push(id);
    // Stripe only expires an open session.
    if (completedSessions.has(id)) return Response.json({ error: { message: "Isolated session already complete", type: "invalid_request_error" } }, { status: 400 });
    return Response.json({ id, status: "expired" });
  }
  if (String(url).startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
    if (checkoutUnavailable) throw new Error("Isolated lookup outage");
    const id = String(url).split("/").at(-1);
    return Response.json({ id, status: completedSessions.has(id) ? "complete" : checkoutStatus, url: "https://checkout.stripe.com/c/pay/mock" });
  }
  if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
    checkoutRequests.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    if (checkoutUnavailable) return new Response(JSON.stringify({ error: { message: "Isolated unavailable test" } }), { status: 503 });
    return new Response(JSON.stringify({ id: new URLSearchParams(options.body).get("mode") === "setup" ? `cs_setup_${checkoutRequests.length}` : options.headers["Idempotency-Key"].endsWith(":cs_old") ? "cs_new" : "cs_recovery", url: "https://checkout.stripe.com/c/pay/mock" }));
  }
  assert.equal(String(url), "https://api.stripe.com/v1/payment_intents", "Only isolated charge mock may access network");
  const body = new URLSearchParams(options.body);
  assert.equal(body.get("payment_method_types[0]"), "card", "error_on_requires_action requires explicit card methods in the real Stripe API");
  charges.push({ amount: Number(body.get("amount")), key: options.headers["Idempotency-Key"], body: options.body });
  if (chargeError) return Response.json({ error: { message: "Isolated ambiguous payment", type: chargeError.type } }, { status: chargeError.status });
  if (decline) return new Response(JSON.stringify({ error: { message: "Isolated decline test", type: "card_error" } }), { status: 402 });
  return new Response(JSON.stringify({ id: `pi_mock_${charges.length}`, status: "succeeded" }));
};

// Real SQLite constraints and UPDATE statements; external payments/email are
// isolated. In particular these tests can interleave a write between the
// charge SELECT and its conditional claim, where unit-only tests missed races.
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("./seed.sql", import.meta.url), "utf8"));
let beforeRun = null;
const DB = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      first() { return db.prepare(sql).get(...values) ?? null; },
      all() { return { results: db.prepare(sql).all(...values) }; },
      run() {
        beforeRun?.(sql, values);
        const result = db.prepare(sql).run(...values);
        const outcome = { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        // A promise, as D1's is (the email-change confirmation chains `.catch`
        // on one), still carrying `meta` for batch() below to read directly.
        return Object.assign(Promise.resolve(outcome), outcome);
      }
    };
    return statement;
  },
  async batch(statements) {
    db.exec("BEGIN");
    try { const results = statements.map((statement) => statement.run()); db.exec("COMMIT"); return results; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
};
const env = {
  DB, BOOKING_TOKEN_SECRET: "isolated-test-signing-secret", ADMIN_TOKEN: "isolated-admin",
  ALLOWED_ORIGIN: "https://lesson.example", SITE_URL: "https://lesson.example",
  EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0",
  STRIPE_SECRET_KEY: "rk_test_mock", STRIPE_WEBHOOK_SECRET: "mock-webhook", STRIPE_EXPECTED_MODE: "test",
  PRIVATE_RECURRING_CODES: JSON.stringify([
    { code: "TEST15", duration: 60, cents: 1500 },
    { code: "DEMO27", duration: 90, cents: 2700 },
    { code: "MOCK19", duration: 60, cents: 1900 }
  ])
};
const tasks = [];
const ctx = { waitUntil(promise) { tasks.push(promise); } };
async function drain() { await Promise.all(tasks.splice(0)); }
let passed = 0;
async function test(name, fn) {
  beforeRun = null;
  try { await fn(); await drain(); passed++; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
function student(id) {
  db.prepare("INSERT INTO students (id,email,name,password_hash,created_at,stripe_customer_id,stripe_payment_method) VALUES (?,?,?,'',?,?,?)")
    .run(id, `${id}@example.invalid`, "Test Student", new Date().toISOString(), `cus_${id}`, `pm_${id}`);
}
student("alice"); student("bob"); student("outsider"); student("teacher");
db.prepare("UPDATE students SET role = 'teacher' WHERE id = 'teacher'").run();
const sessions = Object.fromEntries(await Promise.all(["alice", "bob", "outsider", "teacher"].map(async (id) => [id, await createSession(id, env.BOOKING_TOKEN_SECRET)])));
async function call(path, { user = "alice", method = "POST", body = {}, origin = "https://lesson.example", raw, token, headers = {} } = {}) {
  return worker.fetch(new Request(`https://api.example${path}`, {
    method,
    headers: { Origin: origin, ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Authorization: `Bearer ${token || sessions[user]}` } : {}), ...headers },
    ...(method === "POST" ? { body: raw ?? JSON.stringify(body) } : {})
  }), env, ctx);
}
function booking(id, { start = "2026-09-07T09:00:00.000Z", end = "2026-09-07T10:00:00.000Z", payment = "scheduled", owner = "alice", series = null, reference = id } = {}) {
  db.prepare(`INSERT INTO bookings (id,reference,lesson_type_id,student_id,student_name,student_email,student_phone,
    student_timezone,location,notes,starts_at,ends_at,status,sequence,created_at,updated_at,payment_status,amount_cents,series_id)
    VALUES (?,?,'single',?,'Test Student',?,'','Europe/Lisbon','online','',?,?,'confirmed',0,?,?,?,1500,?)`)
    .run(id, reference, owner, `${owner}@example.invalid`, start, end, new Date().toISOString(), new Date().toISOString(), payment, series);
}
async function token(id) { return createManageToken(id, env.BOOKING_TOKEN_SECRET); }
// A manage link opens only a UUID id, as every real booking has, so a lesson a
// test opens through its link gets one and keeps its name as the reference.
function linkedBooking(name, options = {}) {
  const id = crypto.randomUUID();
  booking(id, { ...options, reference: name });
  return id;
}
async function webhook(event) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`)))].map((value) => value.toString(16).padStart(2, "0")).join("");
  return call("/stripe/webhook", { user: null, raw, headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` } });
}
// One isolated Google signing key serves every sign-in here: the Worker caches
// Google's published keys, so a second key would never be fetched.
let googleKeys = null;
async function googleCredential(claims) {
  if (!googleKeys) {
    googleKeys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    googleJwk = { ...await crypto.subtle.exportKey("jwk", googleKeys.publicKey), kid: "isolated-google" };
    env.GOOGLE_CLIENT_ID = "isolated-client";
  }
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "RS256", kid: googleJwk.kid })}.${encode({ email_verified: true, hd: "example.invalid", iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, exp: Date.now() / 1000 + 3600, ...claims })}`;
  const signature = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", googleKeys.privateKey, new TextEncoder().encode(payload))).toString("base64url");
  return `${payload}.${signature}`;
}

await test("the seeded 14-hour rule filters availability and protects booking and move submissions", async () => {
  const extra = db.prepare(`INSERT INTO availability_exceptions (date,kind,start_minute,end_minute,created_at)
    VALUES ('2026-09-06','extra',30,120,?)`).run(new Date().toISOString()).lastInsertRowid;
  let createdId;
  try {
    const availability = await call("/availability?lessonType=single&from=2026-09-06&to=2026-09-06", { method: "GET", user: null });
    const body = await availability.json();
    assert.equal(body.minimumNoticeHours, 14);
    const starts = body.slotsByDate["2026-09-06"].map((slot) => slot.startAt);
    assert.ok(!starts.includes("2026-09-05T23:30:00.000Z"), "13.5 hours must be hidden");
    assert.ok(starts.includes("2026-09-06T00:00:00.000Z"), "exactly 14 hours remains available");

    const early = await call("/bookings", { body: { lessonType: "single", startAt: "2026-09-05T23:30:00Z" } });
    assert.equal(early.status, 409);
    assert.match(await early.text(), /at least 14 hours' notice/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n, 0);

    const exact = await call("/bookings", { body: { lessonType: "single", startAt: "2026-09-06T00:00:00Z" } });
    assert.equal(exact.status, 201, await exact.clone().text());
    const confirmed = await exact.json();
    createdId = db.prepare("SELECT id FROM bookings WHERE reference=?").get(confirmed.booking.reference).id;
    const move = await call(`/bookings/${confirmed.manageToken}/reschedule`, { body: { startAt: "2026-09-05T23:30:00Z" } });
    assert.equal(move.status, 409);
    assert.match(await move.text(), /at least 14 hours' notice/);
    assert.equal(db.prepare("SELECT starts_at FROM bookings WHERE id=?").get(createdId).starts_at, "2026-09-06T00:00:00.000Z");
    await drain();
  } finally {
    if (createdId) db.prepare("DELETE FROM bookings WHERE id=?").run(createdId);
    db.prepare("DELETE FROM availability_exceptions WHERE id=?").run(extra);
  }
});

await test("teacher availability offers same-day quarter hours without weakening student notice or clash checks", async () => {
  const insertException = db.prepare(`INSERT INTO availability_exceptions (date,kind,start_minute,end_minute,created_at) VALUES ('2026-09-05',?,?,?,?)`);
  const extra = insertException.run("extra", 1020, 1185, new Date().toISOString()).lastInsertRowid;
  const blocked = insertException.run("blocked", 1170, 1185, new Date().toISOString()).lastInsertRowid;
  // Porto is UTC+1 in this fixture: the existing lesson is 17:00–18:00.
  booking("teacher-picker-before", { start: "2026-09-05T16:00:00.000Z", end: "2026-09-05T17:00:00.000Z" });
  booking("teacher-picker-hold", { start: "2026-09-05T18:45:00.000Z", end: "2026-09-05T19:45:00.000Z", owner: "bob" });
  db.prepare("UPDATE bookings SET status='pending_payment', hold_expires_at=? WHERE id='teacher-picker-hold'")
    .run(new Date(Date.now() + 3600000).toISOString());
  const query = "?lessonType=single&from=2026-09-05&to=2026-09-05";
  const path = `/admin/lesson-availability${query}`;
  try {
    for (const user of [null, "alice"]) assert.equal((await call(path, { method: "GET", user })).status, 401);
    for (const credentials of [{ user: "teacher" }, { token: env.ADMIN_TOKEN }]) {
      const response = await call(path, { method: "GET", ...credentials });
      assert.equal(response.status, 200, await response.clone().text());
      const available = await response.json();
      assert.equal(available.minimumNoticeHours, 0);
      assert.equal(available.bufferMinutes, 0);
      const starts = available.slotsByDate["2026-09-05"].map(slot => slot.startAt);
      assert.ok(starts.includes("2026-09-05T17:15:00.000Z"), "18:15 today is offered to Inês");
      assert.ok(starts.includes("2026-09-05T17:00:00.000Z"), "She may start as the previous lesson ends");
      assert.ok(!starts.includes("2026-09-05T16:45:00.000Z"), "The existing lesson still blocks overlaps");
      assert.ok(!starts.includes("2026-09-05T17:45:00.000Z"), "A lesson cannot run into her time off");
      assert.ok(!starts.includes("2026-09-05T18:45:00.000Z"), "An active checkout hold stays busy");
    }
    const longer = await (await call(path.replace("single", "long"), { method: "GET", user: "teacher" })).json();
    assert.ok(!(longer.slotsByDate["2026-09-05"] ?? []).some(slot => slot.startAt === "2026-09-05T17:15:00.000Z"), "90 minutes at 18:15 would overlap time off");
    for (const user of [null, "alice", "teacher"]) {
      const publicReply = await (await call(`/availability${query}&teacher=true`, { method: "GET", user })).json();
      assert.equal(publicReply.minimumNoticeHours, 14);
      assert.equal(publicReply.bufferMinutes, 15);
      assert.deepEqual(publicReply.slotsByDate, {}, "Public bookings still require 14 hours, even for a teacher account");
    }
  } finally {
    db.prepare("DELETE FROM availability_exceptions WHERE id IN (?,?)").run(extra, blocked);
    db.prepare("DELETE FROM bookings WHERE id IN ('teacher-picker-before','teacher-picker-hold')").run();
  }
});

await test("lesson history exposes each student's cancellation time independently of lesson and update dates", async () => {
  booking("history-completed", { start: "2026-09-04T09:00:00.000Z", end: "2026-09-04T10:00:00.000Z" });
  booking("history-running", { start: new Date(Date.now() - 30 * 60_000).toISOString(), end: new Date(Date.now() + 30 * 60_000).toISOString() });
  booking("history-cancelled", { start: "2026-11-05T09:00:00.000Z", end: "2026-11-05T10:00:00.000Z" });
  booking("history-other", { owner: "bob" });
  const cancelledAt = "2026-09-03T12:00:00.000Z";
  db.prepare("UPDATE bookings SET status='cancelled', cancelled_at=? WHERE id IN ('history-cancelled','history-other')").run(cancelledAt);
  try {
    const response = await call("/me", { method: "GET" });
    assert.equal(response.status, 200);
    const { bookings } = await response.json();
    assert.equal(bookings.find(row => row.reference === "history-cancelled").cancelledAt, cancelledAt);
    assert.equal(bookings.find(row => row.reference === "history-completed").cancelledAt, null);
    assert.equal(bookings.find(row => row.reference === "history-completed").isPast, true);
    assert.equal(bookings.find(row => row.reference === "history-running").isPast, false, "a running lesson remains upcoming until it ends");
    assert.ok(!bookings.some(row => row.reference === "history-other"));
    assert.equal((await call("/me", { method: "GET", user: null })).status, 401);
  } finally {
    db.prepare("DELETE FROM bookings WHERE id IN ('history-completed','history-running','history-cancelled','history-other')").run();
  }
});

await test("exact allowlist never derives price from suffix", () => {
  assert.deepEqual(findRecurringCode(env.PRIVATE_RECURRING_CODES, "  test15  ", 60), { duration: 60, cents: 1500 });
  for (const code of ["TEST14", "TEST15extra", "AULA15", "LONGA25", "TEST 15"]) assert.equal(findRecurringCode(env.PRIVATE_RECURRING_CODES, code, 60), null);
  assert.equal(findRecurringCode(env.PRIVATE_RECURRING_CODES, "TEST15", 90), null);
});
await test("codes require authenticated account and cannot reveal catalogue", async () => {
  assert.equal((await call("/me/recurring-rates", { user: null })).status, 401);
  const response = await call("/me/recurring-rates", { method: "GET" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { rates: {} });
  // Recovery or logout after initial authentication must neither reveal the
  // owner's new prices nor add a grant or raise an existing lesson's price.
  for (const phase of ["read", "grant", "reprice"]) for (const invalidation of ["recovery", "logout"]) {
    const user = `rate-${phase}-${invalidation}`;
    await enrol(user);
    const tokenHash = await sessionHash(sessions[user]);
    const prepare = DB.prepare;
    let raced = false;
    const invalidate = () => {
      raced = true;
      if (invalidation === "recovery") db.prepare("UPDATE students SET session_version = session_version + 1 WHERE id = ?").run(user);
      else db.prepare("INSERT INTO revoked_sessions (token_hash, expires_at) VALUES (?, ?)").run(tokenHash, Math.floor(Date.now() / 1000) + 3600);
    };
    try {
      db.prepare("INSERT INTO student_recurring_rates VALUES (?, 60, 1500, ?)").run(user, new Date().toISOString());
      booking(`${user}-lesson`, { owner: user, payment: "not_required" });
      db.prepare("UPDATE bookings SET lesson_type_id = 'long', amount_cents = 2250 WHERE id = ?").run(`${user}-lesson`);
      if (phase === "read") {
        DB.prepare = (sql) => {
          const statement = prepare(sql);
          if (sql === "SELECT duration_minutes, amount_cents FROM student_recurring_rates WHERE student_id = ?") {
            const all = statement.all;
            statement.all = () => {
              DB.prepare = prepare;
              invalidate();
              db.prepare("INSERT INTO student_recurring_rates VALUES (?, 90, 2900, ?)").run(user, new Date().toISOString());
              return all();
            };
          }
          return statement;
        };
      } else {
        beforeRun = (sql) => {
          const target = phase === "grant" ? "INSERT INTO student_recurring_rates" : "UPDATE bookings SET amount_cents = COALESCE(";
          if (!sql.startsWith(target)) return;
          beforeRun = null;
          invalidate();
        };
      }
      const result = await call("/me/recurring-rates", { user, method: phase === "read" ? "GET" : "POST", body: { code: "DEMO27" } });
      assert.equal(raced, true, `${phase}: ${invalidation} interleaves`);
      assert.equal(result.status, 401, `${phase}: ${invalidation}`);
      assert.deepEqual(await result.json(), { error: "Please sign in." });
      assert.equal(db.prepare("SELECT amount_cents FROM bookings WHERE id = ?").get(`${user}-lesson`).amount_cents, 2250, "a stale request cannot reprice the lesson");
      const ninety = db.prepare("SELECT amount_cents FROM student_recurring_rates WHERE student_id = ? AND duration_minutes = 90").get(user)?.amount_cents;
      assert.equal(ninety, phase === "read" ? 2900 : phase === "grant" ? undefined : 2700, "only a grant completed before invalidation may remain");
    } finally {
      beforeRun = null;
      DB.prepare = prepare;
      db.prepare("DELETE FROM bookings WHERE student_id = ?").run(user);
      db.prepare("DELETE FROM student_recurring_rates WHERE student_id = ?").run(user);
      db.prepare("DELETE FROM students WHERE id = ?").run(user);
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash = ?").run(tokenHash);
      delete sessions[user];
    }
  }
});
await test("reusable code grants same rate to two accounts and independent durations", async () => {
  for (const user of ["alice", "bob"]) assert.equal((await call("/me/recurring-rates", { user, body: { code: "test15", durationMinutes: 60 } })).status, 200);
  assert.equal((await call("/me/recurring-rates", { body: { code: "DEMO27", durationMinutes: 90 } })).status, 200);
  assert.deepEqual(await (await call("/me/recurring-rates", { method: "GET" })).json(), { rates: { 60: 1500, 90: 2700 } });
  assert.deepEqual(await (await call("/me/recurring-rates", { user: "outsider", method: "GET" })).json(), { rates: {} });
});
await test("concurrent redemption cannot replace or stack an existing rate", async () => {
  const responses = await Promise.all(["TEST15", "MOCK19"].map((code) => call("/me/recurring-rates", { body: { code, durationMinutes: 60 } })));
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
});
await test("parallel guesses bounded to eight requests per account window", async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, () => call("/me/recurring-rates", { user: "outsider", body: { code: "NOPE15", durationMinutes: 60 } })));
  assert.equal(responses.filter((res) => res.status === 429).length, 4);
});
await test("saved rate survives catalogue removal; the trial keeps its price; 90 minutes is 1.5x their 60 unless set", async () => {
  const local = { ...env, PRIVATE_RECURRING_CODES: "[]" };
  assert.equal((await studentLessonType(local, "alice", { id: "single", duration_minutes: 60, price_cents: 2500 })).price_cents, 1500);
  assert.equal((await studentLessonType(local, "alice", { id: "trial", duration_minutes: 60, price_cents: 2000 })).price_cents, 2000);
  // Bob has only a 60-minute price, so his 90 minutes is 1.5 times it; Alice's own 90-minute price wins (below).
  assert.equal((await studentLessonType(local, "bob", { id: "long", duration_minutes: 90, price_cents: 3500 })).price_cents, 2250);
  assert.equal((await studentLessonType(local, "outsider", { id: "long", duration_minutes: 90, price_cents: 3500 })).price_cents, 3500, "no price of their own: the public one");
  assert.equal(await priceForMove(local, { lesson_type_id: "single", amount_cents: 1800, series_id: "series", student_id: "alice" }, { id: "single", duration_minutes: 60, price_cents: 2500 }), 1800);
  assert.equal(await priceForMove(local, { lesson_type_id: "single", amount_cents: 1800, series_id: "series", student_id: "alice" }, { id: "long", duration_minutes: 90, price_cents: 3500 }), 2700);
});
async function enrol(id) { student(id); sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET); }
const savedRates = async (user) => (await (await call("/me/recurring-rates", { user, method: "GET" })).json()).rates;
await test("a code names its own length, so a 60 and a 90 minute code save side by side without being told which", async () => {
  await enrol("carol");
  const ninety = await call("/me/recurring-rates", { user: "carol", body: { code: " demo27 " } });
  assert.equal(ninety.status, 200);
  assert.deepEqual(await ninety.json(), { rates: { 90: 2700 }, saved: { durationMinutes: 90, cents: 2700 } });
  // A lesson they already have at that length is on the code's price at once;
  // one already paid is not.
  booking("carol-booked", { owner: "carol", payment: "not_required", start: "2026-11-02T10:00:00.000Z", end: "2026-11-02T11:00:00.000Z" });
  booking("carol-paid", { owner: "carol", payment: "paid", start: "2026-11-09T10:00:00.000Z", end: "2026-11-09T11:00:00.000Z" });
  db.prepare("UPDATE bookings SET amount_cents = 2500 WHERE id IN ('carol-booked', 'carol-paid')").run();
  const sixty = await call("/me/recurring-rates", { user: "carol", body: { code: "TEST15" } });
  assert.equal(sixty.status, 200);
  assert.deepEqual(await sixty.json(), { rates: { 60: 1500, 90: 2700 }, saved: { durationMinutes: 60, cents: 1500 } });
  assert.deepEqual(db.prepare("SELECT amount_cents FROM bookings WHERE id IN ('carol-booked', 'carol-paid') ORDER BY starts_at").all().map((row) => row.amount_cents), [1500, 2500]);
  db.prepare("DELETE FROM bookings WHERE id IN ('carol-booked', 'carol-paid')").run();
  // Adding the same code again changes nothing and is not an error.
  const again = await call("/me/recurring-rates", { user: "carol", body: { code: "test15" } });
  assert.equal(again.status, 200);
  assert.deepEqual((await again.json()).rates, { 60: 1500, 90: 2700 });
  assert.deepEqual(await savedRates("carol"), { 60: 1500, 90: 2700 });
});
await test("a second code for a length that already has a rate is refused and names the length; the first stays", async () => {
  await enrol("dora");
  assert.equal((await call("/me/recurring-rates", { user: "dora", body: { code: "TEST15" } })).status, 200);
  const refused = await call("/me/recurring-rates", { user: "dora", body: { code: "MOCK19" } });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error, "You already have an agreed rate for 60-minute lessons. Ask Inês if it needs to change.");
  // Until a 90-minute code, her 90 minutes is 1.5 times her 60.
  assert.deepEqual(await savedRates("dora"), { 60: 1500, 90: 2250 });
  // The other length is still open to her, and its own code wins.
  assert.equal((await call("/me/recurring-rates", { user: "dora", body: { code: "DEMO27" } })).status, 200);
  assert.deepEqual(await savedRates("dora"), { 60: 1500, 90: 2700 });
});
await test("two different prices for one length racing without a named length save exactly one", async () => {
  await enrol("erin");
  const responses = await Promise.all(["TEST15", "MOCK19"].map((code) => call("/me/recurring-rates", { user: "erin", body: { code } })));
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM student_recurring_rates WHERE student_id = 'erin'").get().n, 1);
});
await test("an unknown code is refused without naming a length, and a named length still has to match", async () => {
  await enrol("finn");
  const unknown = await call("/me/recurring-rates", { user: "finn", body: { code: "NOPE15" } });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error, "We don't recognise that code. Check it with Inês.");
  // Booking names the length it is pricing, and a code for the other length isn't one it can use.
  const wrongLength = await call("/me/recurring-rates", { user: "finn", body: { code: "DEMO27", durationMinutes: 60 } });
  assert.equal(wrongLength.status, 400);
  assert.equal((await wrongLength.json()).error, "That code isn't available for this lesson length. Check the code with Inês.");
  for (const durationMinutes of [45, "60", 0, false]) {
    assert.equal((await call("/me/recurring-rates", { user: "finn", body: { code: "TEST15", durationMinutes } })).status, 400, String(durationMinutes));
  }
  const named = await call("/me/recurring-rates", { user: "finn", body: { code: "DEMO27", durationMinutes: 90 } });
  assert.equal(named.status, 200);
  assert.deepEqual(await savedRates("finn"), { 90: 2700 });
});
await test("a code the catalogue lists for two lengths is never guessed at, and odd entries are never a rate", () => {
  const twice = JSON.stringify([{ code: "BOTH20", duration: 60, cents: 2000 }, { code: "BOTH20", duration: 90, cents: 3000 }]);
  assert.equal(findRecurringCode(twice, "BOTH20"), null);
  assert.deepEqual(findRecurringCode(twice, "both20", 60), { duration: 60, cents: 2000 });
  assert.deepEqual(findRecurringCode(twice, "BOTH20", 90), { duration: 90, cents: 3000 });
  const odd = JSON.stringify([
    null,
    { code: "ODDL15", duration: 45, cents: 1500 },
    { code: "LOWX01", duration: 60, cents: 50 },
    { code: "HIGH99", duration: 90, cents: 20000 },
    { code: "FRAC15", duration: 60, cents: 1500.5 }
  ]);
  for (const code of ["ODDL15", "LOWX01", "HIGH99", "FRAC15"]) assert.equal(findRecurringCode(odd, code), null, code);
  assert.equal(findRecurringCode("not json", "TEST15"), null);
  assert.equal(findRecurringCode('{"code":"TEST15"}', "TEST15"), null);
  assert.deepEqual(findRecurringCode(env.PRIVATE_RECURRING_CODES, "TEST15", null), { duration: 60, cents: 1500 });
  assert.equal(findRecurringCode(env.PRIVATE_RECURRING_CODES, 1500), null);
});
await test("cross-site writes, unsupported content types and oversized streamed JSON fail", async () => {
  assert.equal((await call("/me", { origin: "https://attacker.example" })).status, 403);
  assert.equal((await call("/me", { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await call("/me", { raw: JSON.stringify({ name: "a".repeat(40000) }) })).status, 413);
});
await test("student cannot use teacher routes and forged manage links disclose nothing", async () => {
  assert.equal((await call("/admin/bookings", { method: "GET" })).status, 401);
  assert.equal((await call("/bookings/forged", { method: "GET" })).status, 404);
});
await test("the student's own price snapshots onto every occurrence and a one-off; tampering is refused", async () => {
  const payload = { lessonType: "single", startAt: "2026-09-08T09:00:00.000Z", repeat: 4, expectedPriceCents: 1500 };
  const result = await call("/bookings", { body: payload });
  assert.equal(result.status, 201, await result.clone().text());
  const rows = db.prepare("SELECT amount_cents FROM bookings WHERE series_id IS NOT NULL").all();
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.amount_cents === 1500));
  assert.equal((await call("/bookings", { body: { ...payload, startAt: "2026-09-08T12:00:00.000Z", expectedPriceCents: 100 } })).status, 409);
  // Their price is theirs for one-off lessons too (13 October 2026, Dan).
  assert.equal((await call("/bookings", { body: { lessonType: "single", startAt: "2026-09-08T12:00:00.000Z", expectedPriceCents: 2500 } })).status, 409);
  const one = await call("/bookings", { body: { lessonType: "single", startAt: "2026-09-08T12:00:00.000Z", expectedPriceCents: 1500 } });
  assert.equal(one.status, 201);
  assert.equal((await one.json()).booking.amountCents, 1500);
});
await test("a cancellation inside 14 hours records and charges just one separate fee under concurrent retries", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const id = linkedBooking("same-day-cancel", { start: "2026-09-05T12:00:00.000Z", end: "2026-09-05T13:00:00.000Z" });
  const path = `/bookings/${await token(id)}/cancel`;
  const unreviewed = await call(path, { body: { expectedLateFeeCents: 0 } });
  assert.equal(unreviewed.status, 409, await unreviewed.clone().text());
  assert.match(await unreviewed.text(), /review it before confirming/);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(id).status, "confirmed");
  assert.ok(!charges.some(charge => charge.key.includes(id)), "a stale free quote cannot authorize a late fee");
  const responses = await Promise.all([call(path, { body: { expectedLateFeeCents: 500 } }), call(path, { body: { expectedLateFeeCents: 500 } })]);
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
  await drain();
  await chargeDueSameDayFees(env);
  await chargeDueLessons(env, new Date("2026-09-06T10:00:00Z"));
  const row = db.prepare("SELECT * FROM bookings WHERE reference='same-day-cancel'").get();
  assert.equal(row.status, "cancelled");
  assert.equal(row.same_day_fee_status, "paid");
  assert.equal(charges.filter((charge) => charge.key.includes(id)).length, 1);
  assert.equal(charges.find((charge) => charge.key.includes(id)).amount, 500);
  const boundary = linkedBooking("notice-boundary", { start: "2026-09-06T00:00:00.000Z", end: "2026-09-06T01:00:00.000Z" });
  const originalPrepare = DB.prepare;
  const before = clock;
  DB.prepare = sql => {
    const statement = originalPrepare(sql);
    if (sql === "SELECT * FROM lesson_types WHERE id = ?") {
      const read = statement.first;
      statement.first = () => { DB.prepare = originalPrepare; clock++; return read(); };
    }
    return statement;
  };
  try {
    const response = await call(`/bookings/${await token(boundary)}/cancel`, { body: { expectedLateFeeCents: 0 } });
    assert.equal(response.status, 409, await response.clone().text());
    assert.match(await response.text(), /review it before confirming/);
    assert.equal(db.prepare("SELECT status,same_day_fee_status FROM bookings WHERE id=?").get(boundary).same_day_fee_status, "not_required");
  } finally {
    DB.prepare = originalPrepare;
    clock = before;
    db.prepare("DELETE FROM bookings WHERE id=?").run(boundary);
  }
  const changedTerms = linkedBooking("fee-setting-race", { start: "2026-09-05T12:00:00.000Z", end: "2026-09-05T13:00:00.000Z" });
  beforeRun = sql => {
    if (!sql.startsWith("UPDATE bookings SET status = 'cancelled'")) return;
    beforeRun = null;
    db.prepare("UPDATE settings SET value='750' WHERE key='same_day_change_fee_cents'").run();
    db.prepare("INSERT INTO settings(key,value) VALUES('availability_revision','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1").run();
  };
  try {
    const response = await call(`/bookings/${await token(changedTerms)}/cancel`, { body: { expectedLateFeeCents: 500 } });
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(changedTerms).status, "confirmed");
    assert.ok(!charges.some(charge => charge.key.includes(changedTerms)), "changed fee settings require a fresh review");
  } finally {
    beforeRun = null;
    db.prepare("UPDATE settings SET value='500' WHERE key='same_day_change_fee_cents'").run();
    db.prepare("DELETE FROM bookings WHERE id=?").run(changedTerms);
  }
});
await test("duplicate slot claims have one winner, and pending setup reserves its owner's slot", async () => {
  const body = { lessonType: "single", startAt: "2026-09-10T16:00:00.000Z", paymentConsent: true };
  const results = await Promise.all([call("/bookings", { body }), call("/bookings", { user: "bob", body })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  booking("pending-own", { owner: "bob", start: "2026-09-11T16:00:00.000Z", end: "2026-09-11T17:00:00.000Z", payment: "pending" });
  db.prepare("UPDATE bookings SET status='pending_payment',hold_expires_at='2026-09-05T10:35:00.000Z' WHERE id='pending-own'").run();
  assert.equal((await call("/bookings", { user: "bob", body: { ...body, startAt: "2026-09-11T16:00:00.000Z" } })).status, 409);
  assert.equal((await call("/bookings", { user: "outsider", body: { ...body, lessonType: "trial", repeat: 4 } })).status, 400);
});
await test("opening, unchanged submission and failed move never charge a fee", async () => {
  const id = linkedBooking("no-action", { start: "2026-09-05T14:00:00.000Z", end: "2026-09-05T15:00:00.000Z" });
  const path = `/bookings/${await token(id)}`;
  assert.equal((await call(path, { method: "GET" })).status, 200);
  const unchanged = await call(`${path}/reschedule`, { body: { startAt: "2026-09-05T14:00:00.000Z" } });
  assert.equal(unchanged.status, 200);
  assert.equal((await unchanged.json()).sameDayFeeApplied, false);
  for (const startAt of ["2026-09-05T14:00:00Z", "2026-09-05T14:00:00+00:00", "2026-09-05T15:00:00+01:00"]) {
    const alias = await call(`${path}/reschedule`, { body: { startAt } });
    assert.equal(alias.status, 200);
    assert.equal((await alias.json()).sameDayFeeApplied, false);
  }
  assert.equal((await call(`${path}/reschedule`, { body: { startAt: "invalid" } })).status, 409);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE reference='no-action'").get().same_day_fee_status, "not_required");
  db.prepare("UPDATE bookings SET status='cancelled' WHERE reference='no-action'").run();
});
await test("a move inside 14 hours preserves agreed price, charges once, then lesson only after its new end", async () => {
  const id = linkedBooking("same-day-move", { start: "2026-09-05T16:00:00.000Z", end: "2026-09-05T17:00:00.000Z" });
  const path = `/bookings/${await token(id)}/reschedule`;
  const unreviewed = await call(path, { body: { startAt: "2026-09-08T14:00:00.000Z", expectedLateFeeCents: 0 } });
  assert.equal(unreviewed.status, 409, await unreviewed.clone().text());
  assert.equal(db.prepare("SELECT starts_at FROM bookings WHERE id=?").get(id).starts_at, "2026-09-05T16:00:00.000Z");
  assert.ok(!charges.some(charge => charge.key.includes(id)));
  db.prepare("UPDATE bookings SET attendance_status='no_show',no_show_marked_at='2026-09-05T09:00:00.000Z' WHERE id=?").run(id);
  const result = await call(path, { body: { startAt: "2026-09-08T14:00:00.000Z", expectedLateFeeCents: 500 } });
  assert.equal(result.status, 200, await result.clone().text());
  assert.deepEqual({ ...db.prepare("SELECT attendance_status,no_show_marked_at FROM bookings WHERE id=?").get(id) },
    { attendance_status: "expected", no_show_marked_at: null }, "the new time has a new attendance decision");
  // A student's change reaches Inês's Needs you.
  assert.ok(db.prepare("SELECT student_changed_at FROM bookings WHERE id=?").get(id).student_changed_at);
  await drain();
  await chargeDueLessons(env, new Date("2026-09-05T18:00:00Z"));
  assert.equal(charges.filter((charge) => charge.key.includes(id)).length, 1);
  await chargeDueLessons(env, new Date("2026-09-08T21:00:00Z"));
  assert.deepEqual(charges.filter((charge) => charge.key.includes(id)).map((charge) => charge.amount), [500, 1500]);
});
await test("a single move or cancellation cannot overwrite a concurrent hand payment or price reduction", async () => {
  for (const operation of ["reschedule", "cancel"]) for (const transition of ["paid", "lower-price"]) {
    const id = linkedBooking(`${operation}-money-${transition}`, { start: "2026-11-25T09:00:00.000Z", end: "2026-11-25T10:00:00.000Z" });
    let changed = false;
    beforeRun = sql => {
      if (!sql.startsWith(operation === "reschedule" ? "UPDATE bookings SET lesson_type_id = ?" : "UPDATE bookings SET status = 'cancelled'")) return;
      beforeRun = null;
      changed = true;
      if (transition === "paid") db.prepare("UPDATE bookings SET payment_status='not_required',payment_consent_version='paid-by-hand' WHERE id=?").run(id);
      else db.prepare("UPDATE bookings SET amount_cents=750 WHERE id=?").run(id);
    };
    const response = await call(`/bookings/${await token(id)}/${operation}`, { body: {
      ...(operation === "reschedule" ? { startAt: "2026-11-25T17:00:00.000Z", ...(transition === "paid" ? { lessonType: "long", expectedPriceCents: 2700 } : {}) } : {}), expectedLateFeeCents: 0
    } });
    assert.equal(changed, true, await response.clone().text());
    assert.equal(response.status, 409, await response.clone().text());
    assert.deepEqual({ ...db.prepare("SELECT lesson_type_id,starts_at,amount_cents,payment_consent_version FROM bookings WHERE id=?").get(id) },
      { lesson_type_id: "single", starts_at: "2026-11-25T09:00:00.000Z", amount_cents: transition === "paid" ? 1500 : 750, payment_consent_version: transition === "paid" ? "paid-by-hand" : null });
    assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(id).status, "confirmed");
    db.prepare("DELETE FROM bookings WHERE id=?").run(id);
  }
  const id = linkedBooking("move-new-length-price-race", { start: "2026-11-25T09:00:00.000Z", end: "2026-11-25T10:00:00.000Z" });
  const own = db.prepare("SELECT * FROM student_recurring_rates WHERE student_id='alice' AND duration_minutes=90").get();
  beforeRun = sql => {
    if (!sql.startsWith("UPDATE bookings SET lesson_type_id = ?")) return;
    beforeRun = null;
    db.prepare("INSERT OR REPLACE INTO student_recurring_rates VALUES ('alice',90,0,?)").run(new Date().toISOString());
  };
  try {
    const response = await call(`/bookings/${await token(id)}/reschedule`, { body: { lessonType: "long", startAt: "2026-11-25T17:00:00.000Z", expectedPriceCents: 2700 } });
    assert.equal(response.status, 409, await response.clone().text());
    assert.deepEqual({ ...db.prepare("SELECT lesson_type_id,payment_status,amount_cents FROM bookings WHERE id=?").get(id) },
      { lesson_type_id: "single", payment_status: "scheduled", amount_cents: 1500 }, "a new length cannot restore an obsolete positive price after Inês made it free");
  } finally {
    beforeRun = null;
    db.prepare("DELETE FROM bookings WHERE id=?").run(id);
    db.prepare("DELETE FROM student_recurring_rates WHERE student_id='alice' AND duration_minutes=90").run();
    if (own) db.prepare("INSERT INTO student_recurring_rates VALUES (?,?,?,?)").run(own.student_id, own.duration_minutes, own.amount_cents, own.redeemed_at);
  }
});
await test("13.5 hours ahead on the next Porto day is late; lesson-day wording keeps its promise", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  // 00:30 Porto on Sunday, from 11:00 Porto on Saturday: another calendar day.
  const lateId = linkedBooking("next-day-late", { start: "2026-09-05T23:30:00.000Z", end: "2026-09-06T00:30:00.000Z" });
  const legacyId = linkedBooking("next-day-legacy", { start: "2026-09-06T01:00:00.000Z", end: "2026-09-06T02:00:00.000Z" });
  db.prepare("UPDATE bookings SET payment_consent_version='2026-09-01-after-lesson-v1' WHERE reference='next-day-legacy'").run();
  const opened = await (await call(`/bookings/${await token(lateId)}`, { method: "GET" })).json();
  assert.equal(opened.sameDayFeeApplies, true);
  const late = await call(`/bookings/${await token(lateId)}/cancel`);
  assert.equal(late.status, 200, await late.clone().text());
  assert.equal((await late.json()).sameDayFeeApplied, true);
  const legacy = await call(`/bookings/${await token(legacyId)}/cancel`);
  assert.equal(legacy.status, 200, await legacy.clone().text());
  assert.equal((await legacy.json()).sameDayFeeApplied, false);
  await drain();
  await chargeDueSameDayFees(env);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE reference='next-day-late'").get().same_day_fee_status, "paid");
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE reference='next-day-legacy'").get().same_day_fee_status, "not_required");
  assert.deepEqual(charges.filter((charge) => charge.key.includes(lateId) || charge.key.includes(legacyId)).map((charge) => charge.amount), [500]);
});
await test("teacher move and cancellation have no student action fee and cannot alter processing charges", async () => {
  booking("teacher-action", { start: "2026-09-05T18:00:00.000Z", end: "2026-09-05T19:00:00.000Z" });
  db.prepare("UPDATE bookings SET student_changed_at='2026-09-05T09:00:00.000Z' WHERE id='teacher-action'").run();
  const result = await call("/admin/bookings/teacher-action/reschedule", { user: "teacher", body: { startAt: "2026-09-09T12:00:00.000Z" } });
  assert.equal(result.status, 200);
  // Her own move never reads as the student's.
  assert.equal(db.prepare("SELECT student_changed_at FROM bookings WHERE id='teacher-action'").get().student_changed_at, null);
  assert.equal((await call("/admin/bookings/teacher-action/cancel", { user: "teacher" })).status, 200);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='teacher-action'").get().same_day_fee_status, "not_required");
  booking("processing", { payment: "processing" });
  assert.equal((await call("/admin/bookings/processing/cancel", { user: "teacher" })).status, 409);
  assert.equal((await call("/admin/bookings/processing/reschedule", { user: "teacher", body: { startAt: "2026-09-09T15:00:00.000Z" } })).status, 409);
  // A declined lesson she cancels is waived, and its pay page closed first.
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const declined = linkedBooking("declined-cancel", { start: "2026-09-01T09:00:00.000Z", end: "2026-09-01T10:00:00.000Z", payment: "payment_due" });
  db.prepare("UPDATE bookings SET stripe_session_id='cs_declined', same_day_fee_status='payment_due', same_day_fee_cents=500, same_day_fee_session_id='cs_declined_fee' WHERE id=?").run(declined);
  completedSessions.add("cs_declined");
  assert.equal((await call(`/admin/bookings/${declined}/cancel`, { user: "teacher" })).status, 409, "a payment that may have landed keeps the lesson");
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(declined).status, "confirmed");
  completedSessions.delete("cs_declined");
  assert.equal((await call(`/admin/bookings/${declined}/cancel`, { user: "teacher" })).status, 200);
  assert.deepEqual({ ...db.prepare("SELECT status,payment_status,same_day_fee_status FROM bookings WHERE id=?").get(declined) },
    { status: "cancelled", payment_status: "not_required", same_day_fee_status: "not_required" });
  assert.ok(expiredSessions.includes("cs_declined") && expiredSessions.includes("cs_declined_fee"));
  assert.equal((await call(`/bookings/${await token(declined)}/payment`, { body: { purpose: "lesson" } })).status, 409);
});
await test("cancel wins before selected due charge is claimed", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  booking("race-cancel", { start: "2026-01-01T10:00:00.000Z", end: "2026-01-01T11:00:00.000Z" });
  beforeRun = (sql) => { if (sql.includes("SET payment_status = 'processing'")) {
    beforeRun = null; db.prepare("UPDATE bookings SET status='cancelled' WHERE id='race-cancel'").run();
  } };
  await chargeDueLessons(env);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='race-cancel'").get().payment_status, "scheduled");
});
await test("move wins before selected due charge is claimed", async () => {
  booking("race-move", { start: "2026-01-01T12:00:00.000Z", end: "2026-01-01T13:00:00.000Z" });
  beforeRun = (sql) => { if (sql.includes("SET payment_status = 'processing'")) {
    beforeRun = null; db.prepare("UPDATE bookings SET starts_at='2099-01-01T12:00:00.000Z',ends_at='2099-01-01T13:00:00.000Z' WHERE id='race-move'").run();
  } };
  await chargeDueLessons(env);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='race-move'").get().payment_status, "scheduled");
});
await test("decline recovery-link outage retries without charging again or sending a broken link", async () => {
  booking("declined", { start: "2026-01-03T12:00:00.000Z", end: "2026-01-03T13:00:00.000Z" });
  decline = true; checkoutUnavailable = true;
  await chargeDueLessons(env);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='declined'").get().payment_status, "payment_due");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_log WHERE booking_id='declined'").get().count, 0);
  const attempts = charges.length;
  decline = false; checkoutUnavailable = false;
  // The Checkout link can succeed while the email provider is unavailable.
  const beforeFetch = globalThis.fetch;
  let mailDown = true;
  globalThis.fetch = (url, options) => String(url) === "https://api.resend.com/emails" && mailDown
    ? Promise.resolve(Response.json({ message: "Isolated mail outage" }, { status: 503 }))
    : beforeFetch(url, options);
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  try {
    await retryPaymentRecovery(env);
    assert.equal(db.prepare("SELECT status FROM email_log WHERE dedupe_key='payment-due:lesson:declined'").get().status, "failed");
    assert.equal(charges.length, attempts, "repairing the link never retries the declined charge");
    // Paid lesson and fee notices have their own owner too. Fiscal reminders
    // remain owed while ordinary teacher copies are paused.
    booking("payment-mail-retry", { start: "2026-01-04T12:00:00.000Z", end: "2026-01-04T13:00:00.000Z" });
    db.prepare("UPDATE bookings SET same_day_fee_status='scheduled',same_day_fee_cents=500 WHERE id='payment-mail-retry'").run();
    await chargeDueLessons(env);
    await chargeDueSameDayFees(env);
    const saved = db.prepare("SELECT * FROM email_log WHERE booking_id IN ('declined','payment-mail-retry')").all();
    assert.equal(saved.length, 5, "one due notice, two receipts and two fiscal reminders");
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 6 * 60000).toISOString();
    db.prepare(`UPDATE email_log SET status='pending',created_at=?,send_claim_until=?
      WHERE booking_id IN ('declined','payment-mail-retry')`).run(old, new Date(Date.now() + 60000).toISOString());
    mailDown = false;
    const sentBefore = sentEmails.length;
    const checkoutsBefore = checkoutRequests.length;
    const chargesBefore = charges.length;
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, sentBefore, "active delivery leases are left alone");
    db.prepare("UPDATE email_log SET send_claim_until=? WHERE booking_id IN ('declined','payment-mail-retry')").run(now);
    db.prepare("UPDATE bookings SET student_email='changed@example.invalid' WHERE id='declined'").run();
    db.prepare("UPDATE bookings SET payment_status='refunded',same_day_fee_cents=750 WHERE id='payment-mail-retry'").run();
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, sentBefore, "wrong recipient, payment state and captured amount cannot be replayed");
    db.prepare("UPDATE bookings SET student_email='alice@example.invalid' WHERE id='declined'").run();
    db.prepare("UPDATE bookings SET payment_status='paid',same_day_fee_cents=500 WHERE id='payment-mail-retry'").run();
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, sentBefore + 5);
    assert.equal(checkoutRequests.length, checkoutsBefore, "email recovery creates no replacement Checkout");
    assert.equal(charges.length, chargesBefore, "email recovery never charges again");
    for (const row of saved) {
      assert.ok(sentEmails.slice(sentBefore).some(email => JSON.stringify(email) === row.request_json), "the original provider body is replayed exactly");
      const recovered = db.prepare("SELECT status,request_json FROM email_log WHERE id=?").get(row.id);
      assert.deepEqual({ ...recovered }, { status: "sent", request_json: null });
    }
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, sentBefore + 5, "proven deliveries are not sent twice");

    // A Worker can stop after the charge commits but before even the first
    // notice is logged. Repair the missing first attempts independently of
    // retrying durable failed payloads, without contacting Stripe again.
    booking("payment-mail-first-attempt", { start: "2026-01-05T12:00:00.000Z", end: "2026-01-05T13:00:00.000Z" });
    db.prepare("UPDATE bookings SET same_day_fee_status='paid',same_day_fee_cents=500,same_day_fee_payment_intent='pi_fee_first_attempt' WHERE id='payment-mail-first-attempt'").run();
    const originalPrepare = DB.prepare;
    DB.prepare = sql => {
      if (sql === "SELECT nif FROM students WHERE id = ?") {
        DB.prepare = originalPrepare;
        throw new Error("Isolated interruption before the first receipt row");
      }
      return originalPrepare(sql);
    };
    try { await chargeDueLessons(env); } finally { DB.prepare = originalPrepare; }
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='payment-mail-first-attempt'").get().payment_status, "paid");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id='payment-mail-first-attempt'").get().n, 0);
    const firstAttemptsBefore = [sentEmails.length, charges.length, checkoutRequests.length];
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, firstAttemptsBefore[0] + 4, "first receipts and fiscal reminders recover for lesson and separate fee");
    assert.deepEqual([charges.length, checkoutRequests.length], firstAttemptsBefore.slice(1), "missing mail never repeats financial work");
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, firstAttemptsBefore[0] + 4);
    db.prepare("DELETE FROM email_log WHERE booking_id='payment-mail-first-attempt'").run();
    db.prepare("DELETE FROM bookings WHERE id='payment-mail-first-attempt'").run();

    booking("payment-link-before-mail", { payment: "payment_due", start: "2026-01-06T12:00:00.000Z", end: "2026-01-06T13:00:00.000Z" });
    beforeRun = (sql, values) => {
      if (!sql.startsWith("INSERT INTO email_log") || !values.includes("payment-due:lesson:payment-link-before-mail")) return;
      beforeRun = null;
      throw new Error("Isolated interruption after Checkout was saved");
    };
    await retryPaymentRecovery(env);
    assert.ok(db.prepare("SELECT stripe_session_id FROM bookings WHERE id='payment-link-before-mail'").get().stripe_session_id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id='payment-link-before-mail'").get().n, 0);
    const dueFirstAttemptsBefore = [sentEmails.length, checkoutRequests.length, charges.length];
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, dueFirstAttemptsBefore[0] + 1, "a saved Checkout cannot hide a missing first due notice");
    assert.deepEqual([checkoutRequests.length, charges.length], dueFirstAttemptsBefore.slice(1), "the existing Checkout is reused");
    await retryPaymentRecovery(env);
    assert.equal(sentEmails.length, dueFirstAttemptsBefore[0] + 1);
    db.prepare("DELETE FROM email_log WHERE booking_id='payment-link-before-mail'").run();
    db.prepare("DELETE FROM bookings WHERE id='payment-link-before-mail'").run();
  } finally {
    globalThis.fetch = beforeFetch;
    Object.assign(env, { TEACHER_NOTIFICATIONS_ENABLED: "0", TEACHER_EMAIL: undefined, EMAIL_DRY_RUN: "1" });
    delete env.RESEND_API_KEY;
    db.prepare("DELETE FROM email_log WHERE booking_id='payment-mail-retry'").run();
    db.prepare("DELETE FROM bookings WHERE id='payment-mail-retry'").run();
  }
  assert.equal(db.prepare("SELECT stripe_session_id FROM bookings WHERE id='declined'").get().stripe_session_id, "cs_recovery");
  assert.deepEqual(db.prepare("SELECT kind FROM email_log WHERE booking_id='declined'").all().map((row) => row.kind), ["student_payment_due"]);
  const { students } = await (await call("/admin/students", { method: "GET", user: "teacher" })).json();
  assert.deepEqual(students.find((row) => row.id === "alice").cardDeclined,
    [{ bookingId: "declined", reference: "declined", startsAt: "2026-01-03T12:00:00.000Z", amountCents: 1500, part: "lesson" }]);
});
await test("signed webhook validates money and customer, settles once under replay", async () => {
  const session = { id: "cs_recovery", mode: "payment", payment_status: "paid", currency: "eur", amount_total: 1500,
    client_reference_id: "declined", payment_intent: "pi_recovery", customer: "cus_alice", metadata: { purpose: "lesson-due" } };
  const event = { id: "evt_recovery", type: "checkout.session.completed", livemode: false, data: { object: session } };
  assert.equal((await webhook({ ...event, data: { object: { ...session, amount_total: 1 } } })).status, 400);
  assert.equal((await webhook({ ...event, data: { object: { ...session, customer: "cus_outsider" } } })).status, 400);
  assert.equal((await webhook({ ...event, livemode: true })).status, 400);
  assert.equal((await call("/stripe/webhook", { user: null, body: event })).status, 400);
  const responses = await Promise.all([webhook(event), webhook(event)]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM stripe_events WHERE id='evt_recovery'").get().count, 1);
  assert.equal(db.prepare("SELECT charged_cents FROM bookings WHERE id='declined'").get().charged_cents, 1500);
  const { students } = await (await call("/admin/students", { method: "GET", user: "teacher" })).json();
  assert.deepEqual(students.find((row) => row.id === "alice").cardDeclined, [], "paid, so nothing waits on her");
  for (const part of ["lesson", "same-day-fee"]) {
    const id = `customer-drift-${part}`;
    booking(id, { payment: part === "lesson" ? "payment_due" : "not_required" });
    if (part === "lesson") db.prepare("UPDATE bookings SET stripe_session_id=? WHERE id=?").run(`cs_${id}`, id);
    else db.prepare("UPDATE bookings SET same_day_fee_status='payment_due',same_day_fee_cents=500,same_day_fee_session_id=? WHERE id=?").run(`cs_${id}`, id);
    // Two initially open card setups can legitimately create two Customers;
    // the newer card does not change the owner of an older payable Checkout.
    db.prepare("UPDATE students SET stripe_customer_id='cus_new_card' WHERE id='alice'").run();
    const original = { ...session, id: `cs_${id}`, client_reference_id: id, payment_intent: `pi_${id}`,
      amount_total: part === "lesson" ? 1500 : 500, metadata: { purpose: `${part}-due` } };
    const paidEvent = { ...event, id: `evt_${id}`, data: { object: original } };
    const beforeFetch = globalThis.fetch;
    let lookupDown = true;
    globalThis.fetch = (url, options) => {
      if (String(url) !== `https://api.stripe.com/v1/checkout/sessions/cs_${id}`) return beforeFetch(url, options);
      if (lookupDown) throw new Error("Isolated ownership lookup outage");
      return Promise.resolve(Response.json(original));
    };
    try {
      assert.equal((await webhook(paidEvent)).status, 503, "an unavailable original session is retried, never guessed");
      lookupDown = false;
      assert.equal((await webhook({ ...paidEvent, data: { object: { ...original, customer: "cus_outsider" } } })).status, 400, "the provider's original Customer must match too");
      assert.equal((await webhook(paidEvent)).status, 200);
      const paid = db.prepare("SELECT payment_status,same_day_fee_status FROM bookings WHERE id=?").get(id);
      assert.equal(part === "lesson" ? paid.payment_status : paid.same_day_fee_status, "paid");
      assert.equal(db.prepare("SELECT stripe_customer_id FROM students WHERE id='alice'").get().stripe_customer_id, "cus_new_card", "settlement preserves the newer account card");
      await drain();
    } finally {
      globalThis.fetch = beforeFetch;
      db.prepare("UPDATE students SET stripe_customer_id='cus_alice' WHERE id='alice'").run();
      db.prepare("DELETE FROM email_log WHERE booking_id=?").run(id);
      db.prepare("DELETE FROM bookings WHERE id=?").run(id);
    }
  }
});
await test("expired setup cannot confirm a released slot", async () => {
  booking("expired-setup");
  db.prepare("UPDATE bookings SET status='pending_payment',payment_status='pending',hold_expires_at='2026-09-05T09:00:00.000Z',stripe_session_id='cs_expired' WHERE id='expired-setup'").run();
  const response = await webhook({ id: "evt_expired", type: "checkout.session.completed", livemode: false, data: { object: {
    id: "cs_expired", client_reference_id: "expired-setup", customer: "cus_alice", mode: "setup", status: "complete", setup_intent: "seti_expired", metadata: { purpose: "card_setup" }
  } } });
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='expired-setup'").get().status, "pending_payment");
});
await test("ambiguous processing older than 23 hours never creates another charge", async () => {
  db.prepare("UPDATE bookings SET charge_started_at='2026-09-03T10:00:00.000Z',updated_at='2026-09-03T10:00:00.000Z',ends_at='2026-09-03T10:00:00.000Z' WHERE id='processing'").run();
  const count = charges.length;
  await chargeDueLessons(env);
  assert.equal(charges.length, count);
});
await test("fifty stale ambiguous payments cannot starve fresh lesson and action-fee charges", async () => {
  for (let i = 0; i < 50; i++) {
    booking(`stale-${i}`, { payment: "processing", start: "2026-01-01T09:00:00.000Z", end: "2026-01-01T10:00:00.000Z" });
    db.prepare("UPDATE bookings SET charge_started_at='2026-01-01T10:00:00.000Z',same_day_fee_status='processing',same_day_fee_started_at='2026-01-01T10:00:00.000Z',updated_at='2026-01-01T10:00:00.000Z' WHERE id=?").run(`stale-${i}`);
  }
  booking("fresh-charge", { start: "2026-09-05T02:00:00.000Z", end: "2026-09-05T03:00:00.000Z" });
  db.prepare("UPDATE bookings SET same_day_fee_status='scheduled',same_day_fee_cents=500 WHERE id='fresh-charge'").run();
  const count = charges.length;
  await chargeDueLessons(env); await chargeDueSameDayFees(env);
  assert.equal(charges.length, count + 2);
  assert.deepEqual(charges.slice(count).map((charge) => charge.amount), [1500, 500]);
  const admin = await (await call("/admin/bookings", { method: "GET", user: "teacher" })).json();
  assert.equal(admin.manualPaymentReconciliation.length, 51);
});
await test("ambiguous retry freezes card and money; idempotency errors never open a second payment path", async () => {
  booking("ambiguous-snapshot", { start: "2026-09-05T02:00:00.000Z", end: "2026-09-05T03:00:00.000Z" });
  db.prepare("UPDATE bookings SET same_day_fee_status='scheduled',same_day_fee_cents=500 WHERE id='ambiguous-snapshot'").run();
  const before = charges.length;
  const checkouts = checkoutRequests.length;
  chargeError = { status: 503, type: "api_error" };
  await chargeDueLessons(env); await chargeDueSameDayFees(env);
  db.prepare("UPDATE students SET stripe_payment_method='pm_changed' WHERE id='alice'").run();
  db.prepare("UPDATE bookings SET amount_cents=9900,same_day_fee_cents=9900,updated_at='2026-09-05T09:00:00.000Z' WHERE id='ambiguous-snapshot'").run();
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('same_day_change_fee_cents','0')").run();
  chargeError = { status: 400, type: "idempotency_error" };
  await chargeDueLessons(env);
  db.prepare("UPDATE bookings SET updated_at='2026-09-05T09:00:00.000Z' WHERE id='ambiguous-snapshot'").run();
  await chargeDueSameDayFees(env);
  assert.equal(charges[before].body, charges[before + 2].body);
  assert.equal(charges[before + 1].body, charges[before + 3].body);
  assert.equal(checkoutRequests.length, checkouts);
  assert.deepEqual({ ...db.prepare("SELECT payment_status,same_day_fee_status FROM bookings WHERE id='ambiguous-snapshot'").get() }, { payment_status: "processing", same_day_fee_status: "processing" });
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('same_day_change_fee_cents','500')").run();
  chargeError = null;
});
await test("durable recovery only replaces a provider-expired session and remains single-path under concurrency", async () => {
  const id = linkedBooking("expired-recovery", { payment: "payment_due" });
  db.prepare("UPDATE bookings SET stripe_session_id='cs_old' WHERE reference='expired-recovery'").run();
  const path = `/bookings/${await token(id)}/payment`;
  const start = checkoutRequests.length;
  assert.equal((await call("/bookings/forged/payment", { body: { purpose: "lesson" } })).status, 404);
  checkoutUnavailable = true;
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 503);
  checkoutUnavailable = false; checkoutStatus = "complete";
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 503);
  checkoutStatus = "open";
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 200);
  assert.equal(checkoutRequests.length, start);
  checkoutStatus = "expired";
  const responses = await Promise.all([1, 2].map(() => call(path, { body: { purpose: "lesson" } })));
  assert.deepEqual(responses.map((res) => res.status), [200, 200]);
  assert.equal(db.prepare("SELECT stripe_session_id FROM bookings WHERE reference='expired-recovery'").get().stripe_session_id, "cs_new");
  assert.equal(new Set(checkoutRequests.slice(start).map((request) => request.key)).size, 1);
  assert.equal(new Set(checkoutRequests.slice(start).map((request) => request.body)).size, 1);
  assert.equal(new URLSearchParams(checkoutRequests.at(-1).body).has("expires_at"), false);
  db.prepare("UPDATE bookings SET payment_status='paid' WHERE reference='expired-recovery'").run();
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 409);
  checkoutStatus = "open";

  // Legacy zero debts are retired by either the durable link or its retry
  // sweep, without creating a Checkout Session or a false payment receipt.
  for (const via of ["link", "retry"]) {
    const zero = linkedBooking(`zero-recovery-${via}`, { payment: "payment_due" });
    db.prepare("UPDATE bookings SET charged_cents=0,same_day_fee_status='payment_due',same_day_fee_cents=0 WHERE id=?").run(zero);
    const payments = charges.length;
    const checkouts = checkoutRequests.length;
    if (via === "link") {
      for (const purpose of ["lesson", "same-day-fee"]) {
        assert.equal((await call(`/bookings/${await token(zero)}/payment`, { body: { purpose } })).status, 409);
      }
    } else {
      await retryPaymentRecovery(env);
    }
    assert.deepEqual({ ...db.prepare("SELECT payment_status,amount_cents,same_day_fee_status,stripe_session_id,same_day_fee_session_id FROM bookings WHERE id=?").get(zero) },
      { payment_status: "free", amount_cents: 0, same_day_fee_status: "not_required", stripe_session_id: null, same_day_fee_session_id: null });
    assert.equal(charges.length, payments);
    assert.equal(checkoutRequests.length, checkouts);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id=?").get(zero).n, 0);
  }
});
await test("verified Google first-link removes preregistration password and sessions while preserving account data", async () => {
  const registered = await call("/auth/register", { user: null, body: { email: "victim@example.invalid", name: "Victim", password: "attacker-known-password" } });
  assert.equal(registered.status, 201);
  const attacker = await registered.json();
  const credential = await googleCredential({ sub: "verified-victim", email: "victim@example.invalid" });
  const linked = await call("/auth/google", { user: null, body: { credential } });
  assert.equal(linked.status, 200);
  const victim = await linked.json();
  assert.equal(victim.student.id, attacker.student.id);
  assert.equal(sessionVersion(victim.session), 1);
  assert.ok(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(victim.student.id).email_verified_at, "the link proves the address");
  assert.equal((await call("/me", { method: "GET", token: attacker.session })).status, 401);
  assert.equal((await call("/auth/login", { user: null, body: { email: "victim@example.invalid", password: "attacker-known-password" } })).status, 401);
  assert.equal((await call("/me", { method: "GET", token: victim.session })).status, 200);
  const again = await (await call("/auth/google", { user: null, body: { credential } })).json();
  assert.equal(sessionVersion(again.session), 1);

  // A signed Google claim for a third-party address may name its former
  // owner. Neither an unknown nor an existing email can be claimed by it.
  const external = "external-google-owner";
  const externalCredential = await googleCredential({ sub: external, email: `${external}@example.invalid`, hd: undefined });
  const ip = { "CF-Connecting-IP": "198.51.100.109" };
  const unknown = await call("/auth/google", { user: null, headers: ip, body: { credential: externalCredential } });
  assert.equal(unknown.status, 409);
  const challenge = await unknown.json();
  assert.equal(db.prepare("SELECT id FROM students WHERE email=?").get(`${external}@example.invalid`), undefined);
  student(external);
  const bearer = await createSession(external, env.BOOKING_TOKEN_SECRET);
  const ownHeaders = { ...ip, Authorization: `Bearer ${bearer}` };
  for (const headers of [ip, ownHeaders]) {
    const refused = await call("/auth/google", { user: null, headers, body: { credential: externalCredential } });
    assert.equal(refused.status, 409);
    assert.deepEqual(await refused.json(), challenge, "the challenge reveals no account existence or verification state");
  }
  assert.equal(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(external).email_verified_at, null);
  const password = await hashPassword("external-owner-password");
  db.prepare("UPDATE students SET email_verified_at=?,password_hash=? WHERE id=?").run(new Date().toISOString(), password, external);
  db.prepare("INSERT INTO password_resets(nonce,student_id,created_at) VALUES ('external-pending-reset',?,?)").run(external, new Date().toISOString());
  const wrongAccount = await call("/auth/google", { user: "alice", headers: ip, body: { credential: externalCredential } });
  assert.equal(wrongAccount.status, 409);
  assert.deepEqual(await wrongAccount.json(), challenge);
  const owned = await call("/auth/google", { user: null, headers: ownHeaders, body: { credential: externalCredential } });
  assert.equal(owned.status, 200, await owned.clone().text());
  assert.equal((await owned.json()).student.id, external);
  const linkedOwner = db.prepare("SELECT google_sub,password_hash,session_version FROM students WHERE id=?").get(external);
  assert.deepEqual({ ...linkedOwner }, { google_sub: external, password_hash: password, session_version: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id=?").get(external).n, 1, "own linking preserves mail-based access");
  assert.equal((await call("/auth/google", { user: null, headers: ip, body: { credential: externalCredential } })).status, 200, "an already-linked external sub signs in normally");

  // Both the link write and the response retain the authenticated site's
  // original identity; a logout cannot mint a replacement session.
  const prepare = DB.prepare;
  for (const phase of ["version", "logout", "reply"]) {
    const id = `external-google-${phase}`;
    student(id);
    db.prepare("UPDATE students SET email_verified_at=? WHERE id=?").run(new Date().toISOString(), id);
    const token = await createSession(id, env.BOOKING_TOKEN_SECRET);
    const hash = await sessionHash(token);
    const credential = await googleCredential({ sub: id, email: `${id}@example.invalid`, hd: null });
    const invalidate = () => phase === "version"
      ? db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(id)
      : db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(hash, Number(token.split(".")[1]));
    if (phase === "reply") {
      DB.prepare = sql => {
        const statement = prepare(sql);
        if (sql.startsWith("SELECT * FROM students WHERE id = ? AND email = ? AND session_version = ?")) {
          const first = statement.first;
          statement.first = () => { DB.prepare = prepare; invalidate(); return first(); };
        }
        return statement;
      };
    } else {
      beforeRun = sql => {
        if (!sql.startsWith("UPDATE students SET google_sub = ?, last_login_at = ?")) return;
        beforeRun = null; invalidate();
      };
    }
    try {
      const refused = await call("/auth/google", { user: null, headers: { ...ip, Authorization: `Bearer ${token}` }, body: { credential } });
      assert.equal(refused.status, 409, await refused.clone().text());
      assert.equal((await refused.json()).session, undefined);
      assert.equal(db.prepare("SELECT google_sub FROM students WHERE id=?").get(id).google_sub, phase === "reply" ? id : null);
    } finally {
      beforeRun = null; DB.prepare = prepare;
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(hash);
      db.prepare("DELETE FROM students WHERE id=?").run(id);
    }
  }
  db.prepare("DELETE FROM password_resets WHERE student_id=?").run(external);
  db.prepare("DELETE FROM students WHERE id=?").run(external);
});
await test("logout revokes only the presented session and reset invalidates previous sessions", async () => {
  assert.equal((await call("/auth/logout", { user: "bob" })).status, 200);
  assert.equal((await call("/me/recurring-rates", { user: "bob", method: "GET" })).status, 401);
  const reset = await createResetToken("alice", env.BOOKING_TOKEN_SECRET);
  db.prepare("INSERT INTO password_resets (nonce,student_id,created_at) VALUES (?,'alice',?)").run(reset.split(".")[2], new Date().toISOString());
  db.prepare("INSERT INTO email_changes (nonce,student_id,new_email,created_at) VALUES ('reset-pending','alice','pending@example.invalid',?)").run(new Date().toISOString());
  const response = await call("/auth/reset", { user: null, body: { token: reset, password: "isolated-password-only" } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(sessionVersion(result.session), 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_changes WHERE student_id='alice'").get().n, 0, "reset retires pending address changes");
  assert.equal((await call("/me/recurring-rates", { method: "GET" })).status, 401);
  assert.equal((await call("/me/recurring-rates", { method: "GET", token: result.session })).status, 200);
  sessions.alice = result.session;
  assert.equal((await call("/auth/reset", { user: null, body: { token: reset, password: "second-isolated-password" } })).status, 400);
});

await test("account reads and profile saves refuse sessions revoked while a request is running", async () => {
  const originalPrepare = DB.prepare;
  for (const change of ["version", "logout", "profile", "email", "email-confirm-logout", "email-confirm-taken-logout", "email-confirm-failed-logout", "email-confirm-after-write-logout", "admin-details"]) {
    const id = `snapshot-${change}`;
    student(id);
    const bearer = await createSession(id, env.BOOKING_TOKEN_SECRET);
    const options = { token: bearer, headers: { "CF-Connecting-IP": "198.51.100.96" } };
    try {
      if (change === "admin-details") {
        beforeRun = sql => {
          if (!sql.startsWith("UPDATE students SET name = ?, email = ?")) return;
          beforeRun = null;
          db.prepare("UPDATE students SET email=?, session_version=session_version+1 WHERE id=?").run(`current-${id}@example.invalid`, id);
          db.prepare("INSERT INTO password_resets(nonce,student_id,created_at) VALUES ('newer-admin-reset',?,?)").run(id, new Date().toISOString());
        };
        assert.equal((await call(`/admin/students/${id}/details`, { user: "teacher", body: { name: "Stale details", email: "stale-admin@example.invalid" } })).status, 409);
        assert.equal(db.prepare("SELECT email FROM students WHERE id=?").get(id).email, `current-${id}@example.invalid`);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id=?").get(id).n, 1);
      } else if (change === "email") {
        beforeRun = sql => {
          if (!sql.startsWith("INSERT INTO email_changes")) return;
          beforeRun = null;
          db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(id);
        };
        assert.equal((await call("/me/email", { ...options, body: { email: "new-snapshot@example.invalid" } })).status, 401);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_changes WHERE student_id=?").get(id).n, 0);
      } else if (change.startsWith("email-confirm-")) {
        const confirmation = await createResetToken(id, env.BOOKING_TOKEN_SECRET);
        const nonce = confirmation.split(".")[2];
        const now = new Date().toISOString();
        const afterWrite = change === "email-confirm-after-write-logout";
        const bearerHash = await sessionHash(bearer);
        const newEmail = `${id}-new@example.invalid`;
        db.prepare("INSERT INTO email_changes(nonce,student_id,new_email,created_at) VALUES (?,?,?,?)")
          .run(nonce, id, change === "email-confirm-taken-logout" ? "bob@example.invalid" : newEmail, now);
        db.prepare("INSERT INTO password_resets(nonce,student_id,created_at) VALUES (?,?,?)").run(`${id}-reset`, id, now);
        db.prepare("INSERT INTO sign_in_links(nonce,student_id,email,expires_at,created_at) VALUES (?,?,?,?,?)")
          .run(`${id}-sign-in`, id, `${id}@example.invalid`, "2026-09-06T10:00:00.000Z", now);
        const before = { ...db.prepare("SELECT email,session_version FROM students WHERE id=?").get(id) };
        let loggedOut = false;
        DB.prepare = sql => {
          const statement = originalPrepare(sql);
          if (sql.startsWith("SELECT * FROM email_changes WHERE nonce = ?")) {
            const first = statement.first;
            statement.first = async () => {
              if (!afterWrite) {
                assert.equal((await call("/auth/logout", options)).status, 200);
                loggedOut = true;
              }
              if (change === "email-confirm-failed-logout") beforeRun = mutation => {
                if (!mutation.startsWith("UPDATE students SET email = ?")) return;
                beforeRun = null;
                throw new Error("Isolated email-change write failure");
              };
              return first();
            };
          } else if (afterWrite && sql.startsWith("SELECT * FROM students WHERE id = ? AND email = ? AND session_version = ?")) {
            const first = statement.first;
            statement.first = () => {
              // A logout authenticated before the transition can commit its
              // revocation after that transition but before this final read.
              db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(bearerHash, Number(bearer.split(".")[1]));
              loggedOut = true;
              return first();
            };
          }
          return statement;
        };
        const response = await call("/me/email/confirm", { ...options, body: { token: confirmation } });
        assert.equal(loggedOut, true, "the original session is revoked before the sensitive write, cleanup or final response");
        assert.equal(response.status, 409);
        assert.equal((await response.json()).session, undefined, "a revoked session cannot renew itself");
        assert.deepEqual({ ...db.prepare("SELECT email,session_version FROM students WHERE id=?").get(id) },
          afterWrite ? { email: newEmail, session_version: before.session_version + 1 } : before);
        for (const table of ["email_changes", "password_resets", "sign_in_links"]) {
          assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE student_id=?`).get(id).n, afterWrite ? 0 : 1, "only a winning transition clears pending access");
        }
      } else if (change === "profile") {
        beforeRun = sql => {
          if (!sql.startsWith("UPDATE students SET name = ?")) return;
          beforeRun = null;
          db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(id);
        };
        assert.equal((await call("/me", { ...options, body: { name: "Stale profile", phone: "changed" } })).status, 401);
        assert.equal(db.prepare("SELECT name FROM students WHERE id=?").get(id).name, "Test Student");
      } else {
        let changed = false;
        DB.prepare = sql => {
          const statement = originalPrepare(sql);
          if (sql.includes("WHERE b.student_id = ? ORDER BY") || sql.includes("WHERE b.student_id = ? AND EXISTS")) {
            const all = statement.all;
            statement.all = async () => {
              if (!changed) {
                changed = true;
                if (change === "logout") assert.equal((await call("/auth/logout", options)).status, 200);
                else db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(id);
                linkedBooking(`private-${change}`, { owner: id });
              }
              return all();
            };
          }
          return statement;
        };
        const response = await call("/me", { ...options, method: "GET" });
        assert.equal(response.status, 401);
        assert.equal((await response.json()).bookings, undefined, "no lesson data or management links leave the stale request");
      }
    } finally {
      DB.prepare = originalPrepare;
      beforeRun = null;
      db.prepare("DELETE FROM bookings WHERE student_id=?").run(id);
      db.prepare("DELETE FROM password_resets WHERE student_id=?").run(id);
      db.prepare("DELETE FROM email_changes WHERE student_id=?").run(id);
      db.prepare("DELETE FROM sign_in_links WHERE student_id=?").run(id);
      db.prepare("DELETE FROM students WHERE id=?").run(id);
    }
  }
});
await test("sign-in links and Google first links cannot cross an intervening account transition or clear newer links", async () => {
  for (const mode of ["address", "version"]) for (const method of ["link", "link-password", "google"]) {
    const id = `auth-snapshot-${method}-${mode}`;
    student(id);
    if (method === "link-password") db.prepare("UPDATE students SET password_hash='previous-password' WHERE id=?").run(id);
    let path, body;
    if (method === "google") {
      path = "/auth/google";
      body = { credential: await googleCredential({ sub: `sub-${id}`, email: `${id}@example.invalid` }) };
    } else {
      path = "/auth/email-link/confirm";
      const link = await createSignInToken(id, env.BOOKING_TOKEN_SECRET, 30);
      db.prepare("INSERT INTO sign_in_links(nonce,student_id,email,expires_at,created_at) VALUES (?,?,?,?,?)")
        .run(link.nonce, id, `${id}@example.invalid`, link.expiresAt, new Date().toISOString());
      body = { token: link.token };
    }
    beforeRun = sql => {
      if (!(sql.startsWith("UPDATE students SET google_sub = ?") || sql.startsWith("UPDATE students SET email_verified_at =") || sql.startsWith("UPDATE students SET password_hash = ''"))) return;
      beforeRun = null;
      db.prepare("UPDATE students SET email=?, session_version=session_version+1 WHERE id=?")
        .run(mode === "address" ? `updated-${id}@example.invalid` : `${id}@example.invalid`, id);
      db.prepare("INSERT INTO password_resets(nonce,student_id,created_at) VALUES (?,?,?)").run(`fresh-${id}`, id, new Date().toISOString());
      db.prepare("INSERT INTO email_changes(nonce,student_id,new_email,created_at) VALUES (?,?,?,?)")
        .run(`fresh-${id}`, id, `fresh-${id}@example.invalid`, new Date().toISOString());
    };
    try {
      const response = await call(path, { user: null, body, headers: { "CF-Connecting-IP": "198.51.100.97" } });
      assert.equal(response.status, 409, await response.clone().text());
      assert.equal((await response.json()).session, undefined);
      assert.equal(db.prepare("SELECT google_sub FROM students WHERE id=?").get(id).google_sub, null);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id=?").get(id).n, 1, "losing transition preserves newer reset links");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_changes WHERE student_id=?").get(id).n, 1, "losing transition preserves newer address changes");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM request_limits WHERE key LIKE 'auth-cleanup:%'").get().n, 0, "transaction markers never persist");
    } finally {
      beforeRun = null;
      db.prepare("DELETE FROM sign_in_links WHERE student_id=?").run(id);
      db.prepare("DELETE FROM password_resets WHERE student_id=?").run(id);
      db.prepare("DELETE FROM email_changes WHERE student_id=?").run(id);
      db.prepare("DELETE FROM students WHERE id=?").run(id);
    }
  }
});
await test("a password-reset request cannot issue a link after the account address changes", async () => {
  const id = "reset-address-snapshot";
  student(id);
  beforeRun = sql => {
    if (!sql.startsWith("INSERT OR REPLACE INTO password_resets")) return;
    beforeRun = null;
    db.prepare("UPDATE students SET email=?, session_version=session_version+1 WHERE id=?").run("updated-reset@example.invalid", id);
  };
  try {
    assert.equal((await call("/auth/forgot", { user: null, body: { email: `${id}@example.invalid` }, headers: { "CF-Connecting-IP": "198.51.100.98" } })).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id=?").get(id).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE recipient=?").get(`${id}@example.invalid`).n, 0);
  } finally {
    beforeRun = null;
    db.prepare("DELETE FROM students WHERE id=?").run(id);
  }
});
await test("teacher creation atomically loses to a concurrent student claim", async () => {
  beforeRun = (sql) => {
    if (sql.startsWith("INSERT INTO bookings")) {
      beforeRun = null;
      booking("student-wins-admin-race", { start: "2026-09-16T11:00:00.000Z", end: "2026-09-16T12:00:00.000Z" });
    }
  };
  const response = await call("/admin/bookings", { user: "teacher", body: { email: "alice@example.invalid", lessonType: "single", startAt: "2026-09-16T11:00:00.000Z" } });
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE starts_at='2026-09-16T11:00:00.000Z'").get().count, 1);
});
await test("expired setup holds do not block either student or teacher moves", async () => {
  booking("old-hold", { start: "2026-09-17T16:00:00.000Z", end: "2026-09-17T17:00:00.000Z", payment: "pending" });
  db.prepare("UPDATE bookings SET status='pending_payment',hold_expires_at='2026-09-05T09:00:00.000Z' WHERE id='old-hold'").run();
  const id = linkedBooking("move-past-hold", { start: "2026-09-17T12:00:00.000Z", end: "2026-09-17T13:00:00.000Z" });
  const response = await call(`/bookings/${await token(id)}/reschedule`, { body: { startAt: "2026-09-17T16:00:00.000Z" } });
  assert.equal(response.status, 200, await response.clone().text());
  db.prepare("UPDATE bookings SET status='cancelled' WHERE reference='move-past-hold'").run();
  booking("teacher-past-hold", { start: "2026-09-17T12:00:00.000Z", end: "2026-09-17T13:00:00.000Z" });
  assert.equal((await call("/admin/bookings/teacher-past-hold/reschedule", { user: "teacher", body: { startAt: "2026-09-17T16:00:00.000Z" } })).status, 200);
});
await test("paid student and teacher cancellation claim before refund; concurrent move cannot escape", async () => {
  for (const actor of ["student", "teacher"]) {
    const id = linkedBooking(`refund-${actor}`, { payment: "paid", start: "2026-09-25T12:00:00.000Z", end: "2026-09-25T13:00:00.000Z" });
    db.prepare("UPDATE bookings SET stripe_payment_intent=? WHERE id=?").run(`pi_${id}`, id);
    duringRefund = async () => {
      const moved = await call(`/admin/bookings/${id}/reschedule`, { user: "teacher", body: { startAt: "2026-09-24T11:00:00.000Z" } });
      assert.equal(moved.status, 409);
    };
    const path = actor === "teacher" ? `/admin/bookings/${id}/cancel` : `/bookings/${await token(id)}/cancel`;
    const response = await call(path, { user: actor === "teacher" ? "teacher" : "alice" });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual({ ...db.prepare("SELECT status,payment_status FROM bookings WHERE id=?").get(id) }, { status: "cancelled", payment_status: "refunded" });
    duringRefund = null;
  }
});
await test("a move winning before the refund claim prevents any refund call", async () => {
  const id = linkedBooking("refund-lost", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_lost' WHERE reference='refund-lost'").run();
  beforeRun = (sql) => {
    if (sql.startsWith("INSERT OR IGNORE INTO booking_refunds")) {
      beforeRun = null;
      db.prepare("UPDATE bookings SET sequence=sequence+1,starts_at='2026-09-09T08:00:00.000Z',ends_at='2026-09-09T09:00:00.000Z' WHERE reference='refund-lost'").run();
    }
  };
  const count = refunds.length;
  assert.equal((await call(`/bookings/${await token(id)}/cancel`)).status, 409);
  assert.equal(refunds.length, count);
});
await test("ambiguous refund stays reserved and reconciles same immutable request before cancelling", async () => {
  const id = linkedBooking("refund-ambiguous", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_ambiguous' WHERE reference='refund-ambiguous'").run();
  refundUnavailable = true;
  const count = refunds.length;
  const response = await call(`/bookings/${await token(id)}/cancel`);
  assert.equal(response.status, 503);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE reference='refund-ambiguous'").get().status, "confirmed");
  // A paid postpay lesson retains its original charge timestamp. The refund
  // lock must never be mistaken for an abandoned lesson-charge claim.
  db.prepare("UPDATE bookings SET charge_started_at='2026-09-05T09:00:00.000Z',updated_at='2026-09-05T09:00:00.000Z' WHERE reference='refund-ambiguous'").run();
  const chargeCount = charges.length;
  await chargeDueLessons(env);
  assert.equal(charges.length, chargeCount);
  assert.equal((await call(`/admin/bookings/${id}/reschedule`, { user: "teacher", body: { startAt: "2026-09-24T11:00:00.000Z" } })).status, 409);
  db.prepare("UPDATE bookings SET amount_cents=9900 WHERE reference='refund-ambiguous'").run();
  db.prepare("UPDATE booking_refunds SET attempted_at='2026-09-05T09:00:00.000Z' WHERE booking_id=?").run(id);
  refundUnavailable = false;
  await retryRefunds(env);
  assert.deepEqual(refunds[count], refunds[count + 1]);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE reference='refund-ambiguous'").get().payment_status, "refunded");
});
await test("pending provider refunds reconcile by id, never create another refund", async () => {
  const id = linkedBooking("refund-pending", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_pending' WHERE reference='refund-pending'").run();
  refundStatus = "pending";
  assert.equal((await call(`/bookings/${await token(id)}/cancel`)).status, 503);
  const count = refunds.length;
  const lookups = refundLookups;
  db.prepare("UPDATE booking_refunds SET attempted_at='2026-09-05T09:00:00.000Z' WHERE booking_id=?").run(id);
  refundStatus = "succeeded";
  await retryRefunds(env);
  assert.equal(refunds.length, count);
  assert.equal(refundLookups, lookups + 1);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE reference='refund-pending'").get().status, "cancelled");
});
await test("whole-series duration changes require the displayed rate while unchanged durations preserve mixed prices", async () => {
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('mixed-series','alice','single',1,660,?,?)").run(new Date().toISOString(), new Date().toISOString());
  booking("mixed-a", { series: "mixed-series", start: "2026-10-05T10:00:00.000Z", end: "2026-10-05T11:00:00.000Z" });
  booking("mixed-b", { series: "mixed-series", start: "2026-10-12T10:00:00.000Z", end: "2026-10-12T11:00:00.000Z" });
  db.prepare("UPDATE bookings SET amount_cents=1800 WHERE id='mixed-b'").run();
  const payload = { lessonType: "long", startAt: "2026-10-05T12:00:00.000Z" };
  assert.equal((await call("/series/mixed-series/reschedule", { body: payload })).status, 409);
  assert.equal((await call("/series/mixed-series/reschedule", { body: { ...payload, expectedPriceCents: 1 } })).status, 409);
  const sameLength = await call("/series/mixed-series/reschedule", { body: { ...payload, lessonType: "single", expectedPriceCents: 1500 } });
  assert.equal(sameLength.status, 200, await sameLength.clone().text());
  assert.deepEqual(db.prepare("SELECT amount_cents FROM bookings WHERE series_id='mixed-series' ORDER BY id").all().map((row) => row.amount_cents), [1500, 1800]);
  const own = db.prepare("SELECT * FROM student_recurring_rates WHERE student_id='alice' AND duration_minutes=90").get();
  beforeRun = sql => {
    if (!sql.startsWith("WITH proposed")) return;
    beforeRun = null;
    db.prepare("INSERT OR REPLACE INTO student_recurring_rates VALUES ('alice',90,0,?)").run(new Date().toISOString());
  };
  try {
    assert.equal((await call("/series/mixed-series/reschedule", { body: { ...payload, expectedPriceCents: 2700 } })).status, 409);
    assert.ok(db.prepare("SELECT lesson_type_id FROM bookings WHERE series_id='mixed-series'").all().every(row => row.lesson_type_id === "single"), "no occurrence changes onto an obsolete price");
    assert.equal(db.prepare("SELECT lesson_type_id FROM booking_series WHERE id='mixed-series'").get().lesson_type_id, "single", "a refused quote cannot change the future recipe");
  } finally {
    beforeRun = null;
    db.prepare("DELETE FROM student_recurring_rates WHERE student_id='alice' AND duration_minutes=90").run();
    if (own) db.prepare("INSERT INTO student_recurring_rates VALUES (?,?,?,?)").run(own.student_id, own.duration_minutes, own.amount_cents, own.redeemed_at);
  }
  const newLength = await call("/series/mixed-series/reschedule", { body: { ...payload, expectedPriceCents: 2700 } });
  assert.equal(newLength.status, 200, await newLength.clone().text());
  assert.deepEqual(db.prepare("SELECT amount_cents FROM bookings WHERE series_id='mixed-series' ORDER BY id").all().map((row) => row.amount_cents), [2700, 2700]);
  const settledSnapshot = db.prepare("SELECT id,lesson_type_id,starts_at,amount_cents FROM bookings WHERE series_id='mixed-series' ORDER BY id").all();
  beforeRun = sql => {
    if (!sql.startsWith("WITH proposed")) return;
    beforeRun = null;
    // The production Already paid action changes payment terms without
    // changing the calendar sequence. A stale move must preserve those terms.
    db.prepare("UPDATE bookings SET payment_status='not_required',payment_consent_version='paid-by-hand' WHERE id='mixed-b'").run();
  };
  assert.equal((await call("/series/mixed-series/reschedule", { body: { lessonType: "single", startAt: "2026-10-05T13:00:00.000Z", expectedPriceCents: 1500 } })).status, 409);
  assert.deepEqual(db.prepare("SELECT id,lesson_type_id,starts_at,amount_cents FROM bookings WHERE series_id='mixed-series' ORDER BY id").all(), settledSnapshot,
    "no part of a run moves or reprices after its payment terms change");

  const originalPrepare = DB.prepare;
  for (const stage of ["version", "logout", "reply"]) {
    const user = `move-identity-${stage}`;
    const run = `run-${user}`;
    student(user); sessions[user] = await createSession(user, env.BOOKING_TOKEN_SECRET);
    const hash = await sessionHash(sessions[user]);
    db.prepare("INSERT INTO booking_series(id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES (?,?,'single',1,540,?,?)")
      .run(run, user, new Date().toISOString(), new Date().toISOString());
    for (const day of ["09", "16"]) booking(`${user}-${day}`, { owner: user, series: run, start: `2026-11-${day}T09:00:00.000Z`, end: `2026-11-${day}T10:00:00.000Z` });
    const recover = () => stage === "logout"
      ? db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(hash, Number(sessions[user].split(".")[1]))
      : db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(user);
    if (stage === "reply") {
      DB.prepare = sql => {
        const statement = originalPrepare(sql);
        if (sql.startsWith("SELECT * FROM bookings WHERE id IN (")) {
          const all = statement.all;
          statement.all = () => { DB.prepare = originalPrepare; recover(); return all(); };
        }
        return statement;
      };
    } else {
      beforeRun = sql => { if (sql.startsWith("WITH proposed")) { beforeRun = null; recover(); } };
    }
    try {
      const response = await call(`/series/${run}/reschedule`, { user, body: { lessonType: "long", startAt: "2026-11-09T11:00:00.000Z", expectedPriceCents: 3500 } });
      assert.equal(response.status, 401, await response.clone().text());
      assert.equal((await response.json()).bookings, undefined, "a recovered account's fresh lesson reply stays private");
      const current = db.prepare("SELECT lesson_type_id,amount_cents FROM bookings WHERE series_id=?").all(run);
      assert.ok(current.every(row => row.lesson_type_id === (stage === "reply" ? "long" : "single") && row.amount_cents === (stage === "reply" ? 3500 : 1500)),
        "committed moves remain, but the old identity cannot add a price increase after recovery");
    } finally {
      DB.prepare = originalPrepare; beforeRun = null;
      db.prepare("DELETE FROM bookings WHERE student_id=?").run(user);
      db.prepare("DELETE FROM booking_series WHERE id=?").run(run);
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(hash);
      db.prepare("DELETE FROM students WHERE id=?").run(user);
      delete sessions[user];
    }
  }
});
await test("series cancellation locks paid occurrences before refunding and reports actual outcomes", async () => {
  const seriesId = db.prepare("SELECT id FROM booking_series LIMIT 1").get().id;
  booking("refund-series", { payment: "paid", series: seriesId, start: "2026-09-28T12:00:00.000Z", end: "2026-09-28T13:00:00.000Z" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_series' WHERE id='refund-series'").run();
  duringRefund = async () => assert.equal((await call("/admin/bookings/refund-series/reschedule", { user: "teacher", body: { startAt: "2026-09-24T11:00:00.000Z" } })).status, 409);
  const response = await call(`/series/${seriesId}/stop`, { body: { cancelRemaining: true } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).refunded, 1);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='refund-series'").get().status, "cancelled");
  duringRefund = null;
  assert.equal((await call(`/series/${seriesId}/stop`)).status, 200, "stopping an ended series remains idempotent");

  const run = "series-money-race";
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES (?,'alice','single',4,720,?,?)")
    .run(run, new Date().toISOString(), new Date().toISOString());
  booking("series-money-race-lesson", { series: run, start: "2026-11-26T12:00:00.000Z", end: "2026-11-26T13:00:00.000Z" });
  beforeRun = sql => {
    if (!sql.startsWith("UPDATE bookings SET status = 'cancelled'")) return;
    beforeRun = null;
    db.prepare("UPDATE bookings SET payment_status='paid',stripe_payment_intent='pi_series_money_race',charged_cents=1500 WHERE id='series-money-race-lesson'").run();
  };
  const countBefore = refunds.length;
  const stale = await call(`/series/${run}/stop`, { body: { cancelRemaining: true } });
  assert.equal(stale.status, 200, await stale.clone().text());
  const staleResult = await stale.json();
  assert.deepEqual([staleResult.cancelled, staleResult.kept, staleResult.refunded], [0, 1, 0]);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='series-money-race-lesson'").get().status, "confirmed", "a newly settled payment cannot be cancelled without its refund");
  assert.equal(refunds.length, countBefore);
  const refreshed = await call(`/series/${run}/stop`, { body: { cancelRemaining: true } });
  assert.equal(refreshed.status, 200, await refreshed.clone().text());
  assert.equal((await refreshed.json()).refunded, 1);
  assert.equal(refunds.length, countBefore + 1, "reviewing the settled lesson takes the refund path once");
  await drain();
  db.prepare("DELETE FROM booking_refunds WHERE booking_id='series-money-race-lesson'").run();
  db.prepare("DELETE FROM bookings WHERE series_id=?").run(run);
  db.prepare("DELETE FROM booking_series WHERE id=?").run(run);

  // Recovery or logout can win after authentication but before any one of
  // the stopping, cancellation or refund writes. Each claim checks identity.
  for (const [stage, revoked] of [["stop", false], ["stop", true], ["cancel", false], ["refund", true], ["between-refunds", false]]) {
    const user = `series-identity-${stage}-${revoked}`;
    const run = `run-${user}`;
    const lesson = `lesson-${user}`;
    student(user);
    sessions[user] = await createSession(user, env.BOOKING_TOKEN_SECRET);
    const bearerHash = await sessionHash(sessions[user]);
    const recover = () => revoked
      ? db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(bearerHash, Number(sessions[user].split(".")[1]))
      : db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(user);
    db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES (?,?,'single',1,660,?,?)")
      .run(run, user, new Date().toISOString(), new Date().toISOString());
    const payment = stage === "refund" || stage === "between-refunds" ? "paid" : "scheduled";
    booking(lesson, { owner: user, payment, series: run, start: "2026-09-28T12:00:00.000Z", end: "2026-09-28T13:00:00.000Z" });
    db.prepare("UPDATE bookings SET stripe_payment_intent=? WHERE id=?").run(`pi_${lesson}`, lesson);
    if (stage === "between-refunds") {
      booking(`${lesson}-later`, { owner: user, payment: "paid", series: run, start: "2026-09-29T12:00:00.000Z", end: "2026-09-29T13:00:00.000Z" });
      db.prepare("UPDATE bookings SET stripe_payment_intent=? WHERE id=?").run(`pi_${lesson}_later`, `${lesson}-later`);
      duringRefund = async () => { duringRefund = null; recover(); };
    } else {
      const prefix = stage === "stop" ? "UPDATE booking_series SET status = 'ended'"
        : stage === "cancel" ? "UPDATE bookings SET status = 'cancelled'" : "INSERT OR IGNORE INTO booking_refunds";
      beforeRun = (sql) => { if (sql.startsWith(prefix)) { beforeRun = null; recover(); } };
    }
    const count = refunds.length;
    try {
      assert.equal((await call(`/series/${run}/stop`, { user, body: { cancelRemaining: true } })).status, 401);
      assert.equal(db.prepare("SELECT status FROM booking_series WHERE id=?").get(run).status, stage === "stop" ? "active" : "ended");
      assert.equal(refunds.length - count, stage === "between-refunds" ? 1 : 0, "only a refund already claimed can finish after recovery");
      assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(lesson).status, stage === "between-refunds" ? "cancelled" : "confirmed");
      if (stage === "between-refunds") {
        assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(`${lesson}-later`).status, "confirmed", "the old request cannot claim the next refund");
      } else {
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_refunds WHERE booking_id=?").get(lesson).n, 0);
      }
    } finally {
      beforeRun = null; duringRefund = null;
      db.prepare("DELETE FROM booking_refunds WHERE booking_id IN (SELECT id FROM bookings WHERE student_id=?)").run(user);
      db.prepare("DELETE FROM bookings WHERE student_id=?").run(user);
      db.prepare("DELETE FROM booking_series WHERE id=?").run(run);
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(bearerHash);
      db.prepare("DELETE FROM students WHERE id=?").run(user);
      delete sessions[user];
    }
  }
});

// Multi-date booking uses the same real SQLite adapter and isolated providers.
let selectionStudent = 0;
async function selectionFixture({ savedCard = true } = {}) {
  await drain();
  db.exec("DELETE FROM booking_refunds; DELETE FROM bookings; DELETE FROM booking_series; DELETE FROM stripe_events; DELETE FROM email_log;");
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const id = `selection-${++selectionStudent}`;
  student(id); sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET);
  if (!savedCard) db.prepare("UPDATE students SET stripe_customer_id=NULL,stripe_payment_method=NULL WHERE id=?").run(id);
  duringSetupRead = null; checkoutUnavailable = false; beforeRun = null;
  return id;
}
const selectedStarts = ["2026-09-14T09:00:00.000Z", "2026-09-15T09:00:00.000Z"];
function selectionBody(extra = {}) {
  return { lessonType: "single", startAts: selectedStarts, paymentConsent: true, expectedPriceCents: 2500, ...extra };
}
function selectionEvent(user, { count, id = "evt_selection", customer = `cus_${user}` } = {}) {
  const row = db.prepare("SELECT * FROM bookings WHERE student_id=? ORDER BY starts_at").get(user);
  setupIntents.set(`seti_${user}`, { status: "succeeded", customer, payment_method: `pm_${user}` });
  return { id, type: "checkout.session.completed", livemode: false, data: { object: {
    id: row.stripe_session_id, client_reference_id: row.id, mode: "setup", status: "complete", customer,
    setup_intent: `seti_${user}`, metadata: { purpose: "card_setup", selection_count: String(count) }
  } } };
}
async function cardReturnToken(payload) {
  const sent = new URLSearchParams(checkoutRequests.at(-1).body);
  const url = new URL(sent.get("return_url") ?? sent.get("success_url"));
  assert.equal(url.origin, env.SITE_URL);
  assert.equal(url.pathname, "/book/");
  assert.equal(url.searchParams.get("card"), "saved");
  const manage = url.searchParams.get("manage");
  assert.ok(manage, "Checkout must return the lesson token so older bookings cannot confirm this setup");
  assert.equal(manage, payload.manageToken);
  const response = await call(`/bookings/${manage}`, { method: "GET", user: null });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).booking.status, "pending_payment", "the return token identifies the held lesson before the webhook");
  return manage;
}
await test("selection validates count, overlapping aliases and Porto calendar week boundaries", () => {
  assert.ok(bookingSelection({ startAts: [] }).error);
  assert.ok(bookingSelection({ startAts: Array(9).fill(selectedStarts[0]) }).error);
  assert.ok(bookingSelection({ startAts: [selectedStarts[0], "2026-09-14T10:00:00+01:00"] }).error);
  assert.ok(bookingSelection({ startAts: [selectedStarts[0], "2026-09-14T09:30:00Z"] }).error);
  assert.ok(bookingSelection({ startAts: selectedStarts }, { trial: true }).error);
  assert.ok(bookingSelection({ startAts: [selectedStarts[0], "2026-09-21T09:00:00Z"] }, { recurring: true }).error);
  assert.deepEqual(bookingSelection({ startAts: [selectedStarts[0], "2026-09-21T09:00:00Z"] }).starts.length, 2);
  assert.equal(portoWeekOf("2026-09-13T23:30:00Z"), "2026-09-14", "Porto is already Monday while UTC is Sunday");
  assert.equal(portoWeekOf("2026-12-31T10:00:00Z"), portoWeekOf("2027-01-01T10:00:00Z"));
});
await test("several single dates confirm together, retain individual prices and send one calendar message", async () => {
  const user = await selectionFixture();
  const chargedBefore = charges.length;
  captureEmail(); emailUnavailable = true;
  const teacherCopies = env.TEACHER_NOTIFICATIONS_ENABLED, teacherAddress = env.TEACHER_EMAIL;
  env.TEACHER_NOTIFICATIONS_ENABLED = "1"; env.TEACHER_EMAIL = "ines@example.invalid";
  try {
  const response = await call("/bookings", { user, body: selectionBody({ startAts: [...selectedStarts, "2026-09-22T09:00:00Z"] }) });
  assert.equal(response.status, 201, await response.clone().text());
  const result = await response.json();
  assert.equal(result.selection.booked.length, 3);
  assert.equal(result.selection.recurring, false);
  const rows = db.prepare("SELECT * FROM bookings WHERE student_id=?").all(user);
  assert.ok(rows.every((row) => row.payment_status === "scheduled" && row.amount_cents === 2500 && !row.series_id));
  assert.equal(charges.length, chargedBefore, "No payment is taken on booking");
  const availabilityInput = { fromKey: "2026-09-14", toKey: "2026-09-22", lessonType: { duration_minutes: 60 }, now: new Date() };
  const available = await computeAvailability(env, availabilityInput);
  const offeredStarts = Object.values(available.slotsByDate).flat().map((slot) => slot.startAt);
  assert.ok(rows.every((row) => !offeredStarts.includes(row.starts_at)), "Booked single lessons must not be advertised as free when their series ID is null");
  const moving = await computeAvailability(env, { ...availabilityInput, ignoreBookingId: rows[0].id });
  const movingStarts = Object.values(moving.slotsByDate).flat().map((slot) => slot.startAt);
  assert.ok(movingStarts.includes(rows[0].starts_at), "Moving one single lesson may reuse its own time");
  assert.ok(rows.slice(1).every((row) => !movingStarts.includes(row.starts_at)), "Moving a single lesson must retain all other busy times");
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE kind='student_series_booked'").get().n, 1);
  const pending = db.prepare("SELECT * FROM email_log WHERE kind IN ('student_series_booked','teacher_series_booked')").all();
  assert.equal(pending.length, 2);
  assert.ok(pending.every(row => row.status === "failed" && JSON.parse(row.lifecycle_json).length === 3));
  emailUnavailable = false;
  db.prepare("UPDATE email_log SET created_at=?").run(new Date(Date.now() - 6 * 60000).toISOString());
  // The anchor and recipe can stay unchanged while a later member supersedes
  // the saved email. Every included booking and its terms must still match.
  for (const [field, changed] of [["sequence", 7], ["amount_cents", 0], ["payment_consent_version", "paid-by-hand"], ["student_email", "other@example.invalid"]]) {
    db.prepare(`UPDATE bookings SET ${field}=? WHERE id=?`).run(changed, rows[1].id);
    await resendFailedEmails(env);
    assert.equal(sentEmails.length, 0, `${field} on a later member makes the saved email stale`);
    db.prepare(`UPDATE bookings SET ${field}=? WHERE id=?`).run(rows[1][field], rows[1].id);
  }
  beforeRun = sql => {
    if (sql.startsWith("UPDATE email_log SET status = 'pending'")) db.prepare("UPDATE bookings SET sequence=sequence+1 WHERE id=?").run(rows[1].id);
  };
  await resendFailedEmails(env);
  assert.equal(sentEmails.length, 0, "provider claims recheck all members after queue selection");
  beforeRun = null;
  db.prepare("UPDATE bookings SET sequence=? WHERE id=?").run(rows[1].sequence, rows[1].id);
  for (let index = 0; index < 25; index++) {
    db.prepare(`INSERT INTO email_log(booking_id,kind,recipient,dedupe_key,status,created_at,request_json,lifecycle_json)
      VALUES (?,'student_series_booked',?,?,'failed',?,?,?)`)
      .run(rows[0].id, rows[0].student_email, `stale-series:${index}`, new Date(Date.now()-7*60000).toISOString(), pending[0].request_json,
        JSON.stringify(emailLifecycle(rows.map(row => ({ ...row, sequence: row.sequence + 99 })))));
  }
  await resendFailedEmails(env);
  assert.equal(sentEmails.length, 2, "current consolidated messages recover despite 25 older superseded rows");
  for (const message of pending) {
    assert.deepEqual(sentEmails.find(sent => sent.to[0] === message.recipient), JSON.parse(message.request_json), "recovery keeps the exact provider payload");
    const current = db.prepare("SELECT status,request_json,lifecycle_json FROM email_log WHERE id=?").get(message.id);
    assert.equal(current.status, "sent");
    assert.equal(current.request_json, null); assert.equal(current.lifecycle_json, null);
  }
  await resendFailedEmails(env);
  assert.equal(sentEmails.length, 2, "proven deliveries never resend");
  } finally {
    beforeRun = null; emailUnavailable = false; env.TEACHER_NOTIFICATIONS_ENABLED = teacherCopies;
    if (teacherAddress === undefined) delete env.TEACHER_EMAIL; else env.TEACHER_EMAIL = teacherAddress;
    releaseEmail();
  }
});
await test("the 15 minutes after every lesson stay free for students, while Inês can still use them", async () => {
  const user = await selectionFixture();
  // Monday 5 October, Porto summer time: another student's lesson runs 11:00–12:00.
  booking("gap-anchor", { owner: "bob", start: "2026-10-05T10:00:00.000Z", end: "2026-10-05T11:00:00.000Z" });
  const available = await (await call("/availability?lessonType=single&from=2026-10-05&to=2026-10-05", { method: "GET", user: null })).json();
  assert.equal(available.bufferMinutes, 15);
  const starts = available.slotsByDate["2026-10-05"].map((slot) => slot.startAt);
  assert.ok(!starts.includes("2026-10-05T09:00:00.000Z"), "a lesson ending as another starts would leave no free time after it");
  assert.ok(!starts.includes("2026-10-05T11:00:00.000Z"), "nobody can start in the 15 minutes after a lesson");
  assert.deepEqual(starts.slice(0, 3), ["2026-10-05T11:15:00.000Z", "2026-10-05T11:30:00.000Z", "2026-10-05T11:45:00.000Z"],
    "the next start is 15 minutes after the lesson ends, then every quarter hour");

  // The write re-checks it, whatever an older page offered.
  const tooSoon = await call("/bookings", { user, body: selectionBody({ startAts: ["2026-10-05T11:00:00.000Z"] }) });
  assert.equal(tooSoon.status, 409);
  const afterGap = await call("/bookings", { user, body: selectionBody({ startAts: ["2026-10-05T11:15:00.000Z"] }) });
  assert.equal(afterGap.status, 201, await afterGap.clone().text());

  // A lesson claimed between the check and the write counts, gap included.
  beforeRun = (sql) => {
    if (sql.startsWith("INSERT INTO bookings")) {
      beforeRun = null;
      booking("gap-race", { owner: "bob", start: "2026-10-05T14:45:00.000Z", end: "2026-10-05T15:45:00.000Z" });
    }
  };
  const raced = await call("/bookings", { user, body: selectionBody({ startAts: ["2026-10-05T13:45:00.000Z"] }) });
  assert.equal(raced.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE starts_at='2026-10-05T13:45:00.000Z'").get().n, 0);

  // A student's own picks keep the same gap between them.
  const backToBack = await call("/bookings", { user, body: selectionBody({ startAts: ["2026-10-06T09:00:00.000Z", "2026-10-06T10:00:00.000Z"] }) });
  assert.equal(backToBack.status, 409);
  assert.match(await backToBack.text(), /15 minutes free after each lesson/);

  // Inês decides her own day and can still place a lesson straight after another.
  const hers = await call("/admin/bookings", { user: "teacher", body: { email: "alice@example.invalid", lessonType: "single", startAt: "2026-10-05T15:45:00.000Z" } });
  assert.equal(hers.status, 201, await hers.clone().text());

  // A lesson booked back to back before the gap existed can still switch
  // between online and Porto, but a new time must respect the gap.
  const legacyId = linkedBooking("gap-legacy", { owner: "bob", start: "2026-10-06T14:00:00.000Z", end: "2026-10-06T15:00:00.000Z" });
  booking("gap-legacy-next", { owner: "bob", start: "2026-10-06T15:00:00.000Z", end: "2026-10-06T16:00:00.000Z" });
  const legacyPath = `/bookings/${await token(legacyId)}/reschedule`;
  const switched = await call(legacyPath, { body: { startAt: "2026-10-06T14:00:00.000Z", location: "porto" } });
  assert.equal(switched.status, 200, await switched.clone().text());
  assert.equal((await call(legacyPath, { body: { startAt: "2026-10-06T16:00:00.000Z" } })).status, 409);
  const moved = await call(legacyPath, { body: { startAt: "2026-10-06T16:15:00.000Z" } });
  assert.equal(moved.status, 200, await moved.clone().text());
});
await test("two weekly starts must share a week, snapshot private rates and keep both Porto times through DST", async () => {
  const user = await selectionFixture();
  await call("/me/recurring-rates", { user, body: { code: "TEST15", durationMinutes: 60 } });
  assert.equal((await call("/bookings", { user, body: selectionBody({ repeat: 4, expectedPriceCents: 1500, startAts: [selectedStarts[0], "2026-09-21T09:00:00Z"] }) })).status, 400);
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4, expectedPriceCents: 1500, startAts: ["2026-10-19T09:00:00Z", "2026-10-20T09:00:00Z"] }) });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).selection.booked.length, 8);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 2);
  const rows = db.prepare("SELECT * FROM bookings WHERE student_id=? ORDER BY starts_at").all(user);
  assert.ok(rows.every((row) => row.amount_cents === 1500));
  assert.equal(rows[2].starts_at, "2026-10-26T10:00:00.000Z", "10:00 Porto survives the winter offset change");
  assert.equal(rows[3].starts_at, "2026-10-27T10:00:00.000Z");
});
await test("a slot taken between preview and the atomic claim leaves no partial selection or orphan series", async () => {
  const user = await selectionFixture();
  beforeRun = (sql) => {
    if (!sql.startsWith("WITH candidates")) return;
    beforeRun = null;
    booking("competitor", { owner: "bob", start: selectedStarts[1], end: "2026-09-15T10:00:00.000Z" });
  };
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4 }) });
  assert.equal(response.status, 409, await response.clone().text());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0);

  // Time off committed after the preview invalidates both a single claim and
  // the selection's all-or-none transaction, including its empty recipes.
  for (const multiple of [false, true]) {
    const user = await selectionFixture();
    beforeRun = sql => {
      if (!sql.startsWith(multiple ? "WITH candidates" : "INSERT INTO bookings")) return;
      beforeRun = null;
      db.prepare("INSERT INTO availability_exceptions(date,kind,note,created_at) VALUES ('2026-09-14','blocked','claim-timeoff-race',?)").run(new Date().toISOString());
      db.prepare("INSERT INTO settings(key,value) VALUES('availability_revision','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1").run();
    };
    const response = await call("/bookings", { user, body: selectionBody({ ...(multiple ? { repeat: 4 } : { startAts: [selectedStarts[0]] }) }) });
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 0);
    db.prepare("DELETE FROM availability_exceptions WHERE note='claim-timeoff-race'").run();
  }

  const claimClock = clock;
  const prepareBeforeNotice = DB.prepare;
  try {
    for (const multiple of [false, true]) {
      const user = await selectionFixture();
      clock = Date.parse("2026-09-06T19:00:00.000Z");
      DB.prepare = sql => {
        const statement = prepareBeforeNotice(sql);
        if (sql.startsWith(multiple ? "WITH candidates" : "INSERT INTO bookings")) {
          DB.prepare = prepareBeforeNotice;
          clock++;
        }
        return statement;
      };
      const response = await call("/bookings", { user, body: selectionBody({ startAts: multiple
        ? ["2026-09-07T09:00:00.000Z", "2026-09-08T09:00:00.000Z"] : ["2026-09-07T09:00:00.000Z"] }) });
      assert.equal(response.status, 409, await response.clone().text());
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0,
        "A preview at exactly fourteen hours cannot claim after the boundary passes");
    }
  } finally { DB.prepare = prepareBeforeNotice; clock = claimClock; }

  // Student financial claims keep the original account identity even when
  // recovery or logout lands between authentication and the final write/read.
  const originalPrepare = DB.prepare;
  for (const stage of ["slot", "selection", "recipe", "recipe-setup", "occurrence", "reply", "selection-reply", "setup"]) {
    const user = await selectionFixture({ savedCard: !stage.endsWith("setup") });
    const bearer = sessions[user];
    const hash = await sessionHash(bearer);
    const revoked = ["selection", "occurrence", "selection-reply"].includes(stage);
    const recover = () => revoked
      ? db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(hash, Number(bearer.split(".")[1]))
      : db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(user);
    const multiple = stage.startsWith("selection");
    const repeat = ["recipe", "recipe-setup", "occurrence", "selection"].includes(stage);
    const payload = multiple ? selectionBody({ ...(repeat ? { repeat: 4 } : {}) })
      : { lessonType: "single", startAt: selectedStarts[0], paymentConsent: true, ...(repeat ? { repeat: 4 } : {}) };
    if (["reply", "selection-reply", "setup"].includes(stage)) {
      DB.prepare = sql => {
        const statement = originalPrepare(sql);
        const method = multiple ? "all" : "first";
        if (sql.startsWith(multiple ? "SELECT * FROM bookings WHERE id IN" : "SELECT * FROM bookings WHERE id = ?")) {
          const read = statement[method];
          statement[method] = () => {
            DB.prepare = originalPrepare;
            recover();
            db.prepare("UPDATE bookings SET student_email='recovered-private@example.invalid' WHERE student_id=?").run(user);
            return read();
          };
        }
        return statement;
      };
    } else {
      let slots = 0;
      beforeRun = sql => {
        if (sql.startsWith("INSERT INTO bookings")) slots++;
        const atClaim = stage === "slot" ? slots === 1 : stage === "occurrence" ? slots === 2
          : stage.startsWith("recipe") ? sql.startsWith("INSERT INTO booking_series") : sql.startsWith("WITH candidates");
        if (atClaim) { beforeRun = null; recover(); }
      };
    }
    const checkoutCount = checkoutRequests.length;
    try {
      const response = await call("/bookings", { user, body: payload });
      assert.equal(response.status, 401, `${stage}: ${await response.clone().text()}`);
      const reply = await response.json();
      assert.equal(reply.manageToken, undefined);
      assert.equal(reply.booking, undefined, "a changed account cannot read freshly addressed lesson data");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0, "no new manage links are mailed from a stale account snapshot");
      const rows = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n;
      assert.equal(rows, stage === "selection-reply" ? 2 : ["recipe", "occurrence", "reply"].includes(stage) ? 1 : 0,
        "committed lessons remain, but no new lesson can claim after recovery");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, stage === "occurrence" ? 1 : 0);
      assert.equal(checkoutRequests.length, checkoutCount, "recovery before provider initiation cannot open another card setup");
    } finally {
      DB.prepare = originalPrepare; beforeRun = null;
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(hash);
    }
  }
});
await test("a shared card setup holds both runs, saves once and confirms all occurrences on a signed webhook", async () => {
  const user = await selectionFixture({ savedCard: false });
  const requestsBefore = checkoutRequests.length;
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4 }) });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal(checkoutRequests.length, requestsBefore + 1);
  const sent = new URLSearchParams(checkoutRequests.at(-1).body);
  assert.equal(sent.get("mode"), "setup");
  assert.equal(sent.get("metadata[selection_count]"), "8");
  const manage = await cardReturnToken(await response.json());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='pending_payment'").get().n, 8);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0);
  const event = selectionEvent(user, { count: 8 });
  const result = await webhook(event);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await (await call(`/bookings/${manage}`, { method: "GET", user: null })).json()).booking.status, "confirmed");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE payment_status='scheduled' AND status='confirmed'").get().n, 8);
  assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(user).stripe_payment_method, `pm_${user}`);
  await drain();
  const emails = db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n;
  assert.equal(emails, 1);
  assert.equal((await webhook(event)).status, 200);
  assert.equal((await webhook({ ...event, id: "evt_selection_duplicate" })).status, 200);
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, emails);
});
await test("one-off selection card setup confirms every date and rejects wrong session or partial expiry", async () => {
  const user = await selectionFixture({ savedCard: false });
  const response = await call("/bookings", { user, body: selectionBody() });
  assert.equal(response.status, 201);
  await cardReturnToken(await response.json());
  const event = selectionEvent(user, { count: 2 });
  const wrong = structuredClone(event); wrong.data.object.id = "cs_other";
  assert.equal((await webhook(wrong)).status, 400);
  const wrongCount = structuredClone(event); wrongCount.data.object.metadata.selection_count = "3";
  assert.equal((await webhook(wrongCount)).status, 409);
  duringSetupRead = () => db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T09:59:00.000Z' WHERE student_id=? AND starts_at=?").run(user, selectedStarts[1]);
  assert.equal((await webhook(event)).status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='confirmed'").get().n, 0);
  assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(user).stripe_payment_method, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0);
  duringSetupRead = null;
  db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T10:35:00.000Z' WHERE student_id=?").run(user);
  assert.equal((await webhook(event)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='confirmed'").get().n, 2);
});
await test("failed checkout cleans the entire held selection and both weekly recipes", async () => {
  const user = await selectionFixture({ savedCard: false });
  checkoutUnavailable = true;
  const response = await call("/bookings", { user, body: selectionBody({ repeat: 4 }) });
  assert.equal(response.status, 502, await response.clone().text());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 0);
  checkoutUnavailable = false;
});
await test("two ongoing times create 24 lessons and an abandoned checkout releases both sequences", async () => {
  const user = await selectionFixture({ savedCard: false });
  const response = await call("/bookings", { user, body: selectionBody({ repeat: null }) });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).selection.booked.length, 24);
  db.prepare("UPDATE bookings SET hold_expires_at='2026-09-05T09:00:00.000Z' WHERE student_id=?").run(user);
  await call("/availability?lessonType=single&from=2026-09-14&to=2026-09-15", { method: "GET", user: null });
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_series WHERE student_id=?").get(user).n, 0);
});

await test("Meet settings require teacher identity and keep disabled setup inert", async () => {
  assert.equal((await call("/admin/google-calendar", { method: "GET", user: "outsider" })).status, 401);
  assert.equal((await call("/admin/google-calendar/connect", { user: "outsider" })).status, 401);
  const status = await call("/admin/google-calendar", { method: "GET", user: "teacher" });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).configured, false);
  assert.equal((await call("/admin/google-calendar/connect", { user: "teacher" })).status, 503);
  assert.equal((await call("/admin/google-calendar/connect", { token: env.ADMIN_TOKEN })).status, 403);
});

await test("Meet links follow booking ownership and disappear for Porto or cancellation", async () => {
  student("meet-owner"); sessions["meet-owner"] = await createSession("meet-owner", env.BOOKING_TOKEN_SECRET);
  const id = linkedBooking("meet-owned", { owner: "meet-owner", start: "2026-10-05T09:00:00.000Z", end: "2026-10-05T10:00:00.000Z" });
  db.prepare("UPDATE bookings SET meeting_url='https://meet.google.com/abc-defg-hij' WHERE reference='meet-owned'").run();
  let mine = await call("/me", { method: "GET", user: "meet-owner" });
  assert.equal((await mine.json()).bookings[0].meetingUrl, "https://meet.google.com/abc-defg-hij");
  const other = await call("/me", { method: "GET", user: "outsider" });
  assert.ok(!(await other.json()).bookings.some(row => row.reference === "meet-owned"));
  const managed = await call(`/bookings/${await token(id)}`, { method: "GET", user: "meet-owner" });
  assert.equal((await managed.json()).booking.meetingUrl, "https://meet.google.com/abc-defg-hij");
  db.prepare("UPDATE bookings SET location='porto' WHERE reference='meet-owned'").run();
  mine = await call("/me", { method: "GET", user: "meet-owner" });
  assert.equal((await mine.json()).bookings[0].meetingUrl, null);
  db.prepare("UPDATE bookings SET location='online',status='cancelled' WHERE reference='meet-owned'").run();
  mine = await call("/me", { method: "GET", user: "meet-owner" });
  assert.equal((await mine.json()).bookings[0].meetingUrl, null);

  // A teacher's confirmation, weekly confirmation and later link notice must
  // all leave a held link undelivered until the student's welcome has gone.
  const google = { GOOGLE_CALENDAR_ENABLED: "1", GOOGLE_CALENDAR_CLIENT_ID: "isolated-calendar-client", GOOGLE_CALENDAR_CLIENT_SECRET: "isolated-calendar-secret", GOOGLE_CALENDAR_TOKEN_KEY: "ab".repeat(32) };
  Object.assign(env, google);
  captureEmail();
  try {
    db.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(id);
    db.prepare("UPDATE students SET awaiting_welcome=1 WHERE id='meet-owner'").run();
    const moved = await call(`/admin/bookings/${id}/reschedule`, { user: "teacher", body: { startAt: "2026-10-05T07:00:00.000Z" } });
    assert.equal(moved.status, 200, await moved.clone().text());
    await drain();
    assert.equal(db.prepare("SELECT meeting_notified_at FROM bookings WHERE id=?").get(id).meeting_notified_at, null);
    const seriesNotice = () => notifySeries(env, {
      rows: db.prepare("SELECT * FROM bookings WHERE id=?").all(id), lessonType: db.prepare("SELECT * FROM lesson_types WHERE id='single'").get(),
      settings: { teacherName: "Inês", teacherEmail: "", sameDayChangeFeeCents: 500, minimumNoticeHours: 14 },
      series: { id: "held-meet-series", occurrences: 4 }, manageUrls: {}, skipped: [], byTeacher: true
    });
    await seriesNotice();
    assert.equal(db.prepare("SELECT meeting_notified_at FROM bookings WHERE id=?").get(id).meeting_notified_at, null);
    assert.equal(await notifyMeetingReady(env, { id }), false, "held is not delivered");
    db.prepare("UPDATE bookings SET student_email='no-email:meet-owner' WHERE id=?").run(id);
    assert.equal(await notifyMeetingReady(env, { id }), false, "a placeholder is not delivered");
    assert.equal(sentEmails.length, 0);
    db.prepare("UPDATE bookings SET student_email='meet-owner@example.invalid' WHERE id=?").run(id);
    db.prepare("UPDATE students SET awaiting_welcome=0 WHERE id='meet-owner'").run();
    db.prepare("UPDATE bookings SET meeting_url=NULL WHERE id=?").run(id);
    emailUnavailable = true;
    await seriesNotice();
    emailUnavailable = false;
    db.prepare("UPDATE bookings SET meeting_url='https://meet.google.com/abc-defg-hij' WHERE id=?").run(id);
    await seriesNotice();
    assert.equal(db.prepare("SELECT meeting_notified_at FROM bookings WHERE id=?").get(id).meeting_notified_at, null,
      "replaying a roomless confirmation does not claim its later Meet URL was included");
    assert.equal(await notifyMeetingReady(env, { id }), true);
    assert.equal(await notifyMeetingReady(env, { id }), true, "a proven send can repair a lost notification marker");
    assert.equal(sentEmails.filter(email => email.text.includes("https://meet.google.com/abc-defg-hij")).length, 1, "the ready notice still sends the link once after the welcome");
  } finally {
    emailUnavailable = false;
    for (const key of Object.keys(google)) delete env[key];
    releaseEmail();
  }
});

await test("sign-up keeps an optional NIF, tidied, and refuses a mistyped one without creating the account", async () => {
  const signUp = (email, nif) => call("/auth/register", {
    user: null, body: { name: "Nora Fiscal", email, password: "a-long-password", ...(nif === undefined ? {} : { nif }) }
  });
  const given = await signUp("nif-given@example.invalid", "PT 123 456 789");
  assert.equal(given.status, 201, await given.clone().text());
  assert.equal((await given.json()).student.nif, "123456789");
  assert.equal(db.prepare("SELECT nif FROM students WHERE email='nif-given@example.invalid'").get().nif, "123456789");
  const typo = await signUp("nif-typo@example.invalid", "123456788");
  assert.equal(typo.status, 400);
  assert.match(await typo.text(), /isn't valid/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM students WHERE email='nif-typo@example.invalid'").get().n, 0);
  const none = await signUp("nif-none@example.invalid");
  assert.equal(none.status, 201);
  assert.equal((await none.json()).student.nif, "");
});

await test("students add, keep, change and clear their own NIF, and a typo changes nothing", async () => {
  try {
    let saved = await call("/me", { body: { nif: "123 456 789" } });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).student.nif, "123456789");
    saved = await call("/me", { body: { name: "Test Student" } });
    assert.equal((await saved.json()).student.nif, "123456789", "a field that isn't sent keeps its value");
    const typo = await call("/me", { body: { nif: "12345", name: "Renamed" } });
    assert.equal(typo.status, 400);
    assert.deepEqual({ ...db.prepare("SELECT nif, name FROM students WHERE id='alice'").get() }, { nif: "123456789", name: "Test Student" });
    assert.equal((await (await call("/me", { method: "GET" })).json()).student.nif, "123456789");
    saved = await call("/me", { body: { nif: "" } });
    assert.equal((await saved.json()).student.nif, "");
  } finally {
    db.prepare("UPDATE students SET nif='' WHERE id='alice'").run();
  }
});

await test("students choose a splat from the set, clear it, and anything else changes nothing", async () => {
  try {
    assert.equal((await (await call("/me", { method: "GET" })).json()).student.mark, "");
    let saved = await call("/me", { body: { mark: "bloom" } });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).student.mark, "bloom");
    saved = await call("/me", { body: { name: "Test Student" } });
    assert.equal((await saved.json()).student.mark, "bloom", "a field that isn't sent keeps its value");
    for (const mark of ["<svg>", "BLOOM", 3, null]) {
      const refused = await call("/me", { body: { mark, name: "Renamed" } });
      assert.equal(refused.status, 400);
    }
    assert.deepEqual({ ...db.prepare("SELECT mark, name FROM students WHERE id='alice'").get() }, { mark: "bloom", name: "Test Student" });
    saved = await call("/me", { body: { mark: "" } });
    assert.equal((await saved.json()).student.mark, "");
  } finally {
    db.prepare("UPDATE students SET mark='' WHERE id='alice'").run();
  }
});

await test("payment emails carry the NIF: Inês's reminder always, the student's own when given", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  db.prepare("UPDATE students SET nif='123456789' WHERE id='alice'").run();
  booking("receipt-nif", { start: "2026-09-04T09:00:00.000Z", end: "2026-09-04T10:00:00.000Z" });
  booking("receipt-none", { owner: "bob", start: "2026-09-04T11:00:00.000Z", end: "2026-09-04T12:00:00.000Z" });
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  sentEmails.length = 0;
  try {
    await chargeDueLessons(env, new Date("2026-09-04T18:00:00Z"));
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1" });
    delete env.TEACHER_EMAIL;
    delete env.RESEND_API_KEY;
    db.prepare("UPDATE students SET nif='' WHERE id='alice'").run();
  }
  const sent = (reference, toTeacher) => sentEmails.find((email) =>
    (email.to[0] === "ines@example.invalid") === toTeacher && email.text.includes(`Reference: ${reference}`));
  const withNif = sent("receipt-nif", true);
  assert.match(withNif.text, /Portal das Finanças/);
  assert.match(withNif.text, /^NIF: 123456789$/m);
  assert.ok(withNif.html.includes("123456789"));
  assert.match(sent("receipt-none", true).text, /^NIF: Not given \(consumidor final\)$/m);
  const studentWithNif = sent("receipt-nif", false);
  assert.match(studentWithNif.text, /^NIF: 123456789 · on your receipt from Inês$/m);
  assert.ok(studentWithNif.html.includes("123456789"));
  assert.ok(!sent("receipt-none", false).text.includes("NIF"), "no NIF, no row: the student isn't asked for one here");
});

await test("skipped weekly emails show the missing spring date without inventing a later time", async () => {
  booking("clock-skip-notice", { start: "2027-03-21T01:30:00.000Z", end: "2027-03-21T02:30:00.000Z" });
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0", TEACHER_NOTIFICATIONS_ENABLED: "1" });
  sentEmails.length = 0;
  try {
    await notifySeries(env, {
      rows: db.prepare("SELECT * FROM bookings WHERE id='clock-skip-notice'").all(),
      lessonType: db.prepare("SELECT * FROM lesson_types WHERE id='single'").get(),
      settings: { teacherName: "Inês", teacherEmail: "ines@example.invalid", sameDayChangeFeeCents: 500, minimumNoticeHours: 14 },
      series: { id: "clock-skip-series", occurrences: 4 },
      manageUrls: { "clock-skip-notice": "https://lesson.example/book/?manage=clock-skip" },
      // This is also the shape recovered from older card-setup metadata.
      skipped: [{ startAt: "2027-03-28T01:30:00.000Z" }]
    });
    assert.equal(sentEmails.length, 2);
    for (const email of sentEmails) {
      assert.match(email.text, /One lesson time was unavailable and was left out: Sun 28 Mar\./);
      // The HTML ties "Sun 28 Mar" with non-breaking spaces, so read it as spaces.
      const html = email.html.replaceAll("&nbsp;", " ");
      assert.ok(html.includes("Sun 28 Mar"));
      assert.doesNotMatch(email.text, /Sun 28 Mar, 02:30/);
      assert.ok(!html.includes("Sun 28 Mar, 02:30"));
    }
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0" });
    delete env.TEACHER_EMAIL;
    delete env.RESEND_API_KEY;
    db.prepare("DELETE FROM bookings WHERE id='clock-skip-notice'").run();
  }
});

await test("every email Inês gets about a student's lessons carries the NIF her receipt automation reads", async () => {
  db.prepare("UPDATE students SET nif='123456789' WHERE id='alice'").run();
  booking("teacher-copy-nif", { start: "2026-10-19T09:00:00.000Z", end: "2026-10-19T10:00:00.000Z" });
  booking("teacher-copy-none", { owner: "bob", start: "2026-10-19T11:00:00.000Z", end: "2026-10-19T12:00:00.000Z" });
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0", TEACHER_NOTIFICATIONS_ENABLED: "1" });
  sentEmails.length = 0;
  try {
    for (const [id, startAt] of [["teacher-copy-nif", "2026-10-20T09:00:00.000Z"], ["teacher-copy-none", "2026-10-20T11:00:00.000Z"]]) {
      const moved = await call(`/admin/bookings/${id}/reschedule`, { user: "teacher", body: { startAt } });
      assert.equal(moved.status, 200, await moved.clone().text());
    }
    const rows = db.prepare("SELECT * FROM bookings WHERE id='teacher-copy-nif'").all();
    await notifySeries(env, {
      rows, lessonType: db.prepare("SELECT * FROM lesson_types WHERE id='single'").get(),
      settings: { teacherName: "Inês", teacherEmail: "ines@example.invalid", sameDayChangeFeeCents: 500, minimumNoticeHours: 14 },
      series: { id: "series-nif", occurrences: 1 }, manageUrls: { "teacher-copy-nif": "https://lesson.example/book/?manage=x" }, skipped: []
    });
    await drain();
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0" });
    delete env.TEACHER_EMAIL;
    delete env.RESEND_API_KEY;
    db.prepare("UPDATE students SET nif='' WHERE id='alice'").run();
  }
  const toInes = sentEmails.filter((email) => email.to[0] === "ines@example.invalid");
  const moveEmail = (reference) => toInes.find((email) => email.subject.startsWith("You moved") && email.text.includes(`Reference: ${reference}`));
  assert.match(moveEmail("teacher-copy-nif").text, /^NIF: 123456789$/m);
  assert.match(moveEmail("teacher-copy-none").text, /^NIF: Not given \(consumidor final\)$/m);
  assert.match(toInes.find((email) => email.subject.startsWith("Weekly booking")).text, /^NIF: 123456789$/m);
  assert.ok(sentEmails.some((email) => email.to[0] !== "ines@example.invalid"), "students were emailed too");
  assert.ok(!sentEmails.filter((email) => email.to[0] !== "ines@example.invalid").some((email) => email.text.includes("NIF")),
    "students' booking emails don't repeat it");
});

await test("a paid late change fee reminds Inês to issue its fiscal document once, with the NIF", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  db.prepare("UPDATE students SET nif='123456789' WHERE id='alice'").run();
  const id = linkedBooking("fee-receipt", { start: "2026-09-05T15:00:00.000Z", end: "2026-09-05T16:00:00.000Z" });
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  sentEmails.length = 0;
  try {
    const cancelled = await call(`/bookings/${await token(id)}/cancel`);
    assert.equal(cancelled.status, 200, await cancelled.clone().text());
    await drain();
    await chargeDueSameDayFees(env);
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1" });
    delete env.TEACHER_EMAIL;
    delete env.RESEND_API_KEY;
    db.prepare("UPDATE students SET nif='' WHERE id='alice'").run();
  }
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE reference='fee-receipt'").get().same_day_fee_status, "paid");
  // Teacher booking copies are paused in this suite; the fiscal reminder is not.
  const reminders = sentEmails.filter((email) => email.to[0] === "ines@example.invalid" && email.subject.startsWith("Payment received"));
  assert.equal(reminders.length, 1, "one reminder per fee, even after the sweep runs again");
  assert.equal(reminders[0].subject, "Payment received — Test Student, €5 same-day fee");
  assert.match(reminders[0].text, /Portal das Finanças/);
  assert.match(reminders[0].text, /^Reference: fee-receipt$/m);
  assert.match(reminders[0].text, /^NIF: 123456789$/m);
  const receipt = sentEmails.find((email) => email.to[0] === "alice@example.invalid" && email.subject.startsWith("Late change fee paid"));
  assert.match(receipt.text, /^NIF: 123456789 · on your receipt from Inês$/m);
  assert.match(receipt.text, /less than 14 hours before it/);
});

await test("Inês's lesson list carries each student's NIF, and students cannot read it", async () => {
  db.prepare("UPDATE students SET nif='123456789' WHERE id='alice'").run();
  booking("admin-nif", { start: "2026-10-12T09:00:00.000Z", end: "2026-10-12T10:00:00.000Z" });
  booking("admin-none", { owner: "bob", start: "2026-10-12T11:00:00.000Z", end: "2026-10-12T12:00:00.000Z" });
  try {
    const listed = await call("/admin/bookings", { method: "GET", user: "teacher" });
    assert.equal(listed.status, 200);
    const { bookings } = await listed.json();
    assert.equal(bookings.find((row) => row.id === "admin-nif").student_nif, "123456789");
    assert.equal(bookings.find((row) => row.id === "admin-none").student_nif, "");
    assert.equal((await call("/admin/bookings", { method: "GET", user: "alice" })).status, 401);
  } finally {
    db.prepare("UPDATE students SET nif='' WHERE id='alice'").run();
    db.prepare("DELETE FROM bookings WHERE id IN ('admin-nif','admin-none')").run();
  }
});

if (process.env.INES_PRIVATE_RATES_FILE) {
  await test("all private owner mappings activate exactly and are independently reusable", async () => {
    const rows = [...readFileSync(process.env.INES_PRIVATE_RATES_FILE, "utf8").matchAll(/^\| (60|90) \| €(\d+) \| ([A-Z]{4}\d{2}) \|$/gm)]
      .map(([, duration, price, code]) => ({ duration: Number(duration), cents: Number(price) * 100, code }));
    assert.equal(rows.length, 22);
    assert.equal(new Set(rows.map((row) => row.code.slice(0, 4))).size, 22);
    env.PRIVATE_RECURRING_CODES = JSON.stringify(rows);
    for (const [index, rate] of rows.entries()) {
      for (const suffix of ["a", "b"]) {
        const id = `private-check-${index}-${suffix}`;
        student(id); sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET);
        const response = await call("/me/recurring-rates", { user: id, body: { code: rate.code.toLowerCase(), durationMinutes: rate.duration } });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).rates[rate.duration], rate.cents);
      }
      assert.equal(findRecurringCode(env.PRIVATE_RECURRING_CODES, rate.code, rate.duration === 60 ? 90 : 60), null);
    }
  });
}
await test("reset and email-change mail is bounded per recipient and per account, without changing the answer", async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await call("/auth/forgot", { user: null, body: { email: "outsider@example.invalid" } })).status, 200);
  }
  await drain();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id = 'outsider'").get().n, 3);
  const statuses = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    statuses.push((await call("/me/email", { user: "outsider", body: { email: `target-${attempt}@example.invalid` } })).status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
});
await test("settings reject a slot interval that would hang availability, and malformed addresses", async () => {
  const save = (settings) => call("/admin/settings", { user: null, headers: { Authorization: "Bearer isolated-admin", "CF-Connecting-IP": "198.51.100.181" }, body: { settings } });
  assert.equal((await save({ slot_interval_minutes: 0 })).status, 400);
  assert.equal((await save({ slot_interval_minutes: -30 })).status, 400);
  assert.equal((await save({ teacher_email: "not-an-address" })).status, 400);
  const original = db.prepare("SELECT * FROM settings ORDER BY key").all();
  for (const value of [null, true, false, [], [14], {}, "14"]) {
    assert.equal((await save({ minimum_notice_hours: value, same_day_change_fee_cents: value })).status, 400, JSON.stringify(value));
    assert.deepEqual(db.prepare("SELECT * FROM settings ORDER BY key").all(), original, "invalid settings never poison the notice or fee calculation");
  }
  const previousFee = db.prepare("SELECT value FROM settings WHERE key='same_day_change_fee_cents'").get().value;
  const previousNotice = db.prepare("SELECT value FROM settings WHERE key='minimum_notice_hours'").get().value;
  const savePolicy = settings => call("/admin/settings", { user: "teacher", body: { settings } });
  try {
    for (const valid of [0, 50]) {
      const notice = valid === 0 ? 0 : 14;
      assert.equal((await savePolicy({ same_day_change_fee_cents: valid, minimum_notice_hours: notice })).status, 200);
      assert.equal(db.prepare("SELECT value FROM settings WHERE key='same_day_change_fee_cents'").get().value, String(valid));
      assert.equal(db.prepare("SELECT value FROM settings WHERE key='minimum_notice_hours'").get().value, String(notice));
      const saved = db.prepare("SELECT * FROM settings ORDER BY key").all();
      for (const tooSmall of [1, 49]) {
        assert.equal((await savePolicy({ same_day_change_fee_cents: tooSmall })).status, 400, "a positive fee must be payable by EUR card");
        assert.deepEqual(db.prepare("SELECT * FROM settings ORDER BY key").all(), saved, "a rejected fee preserves the last saved value and revision");
      }
    }
    assert.equal((await savePolicy({ same_day_change_fee_cents: 500 })).status, 200);
    const promised = db.prepare("SELECT * FROM settings ORDER BY key").all();
    for (const settings of [{ same_day_change_fee_cents: 501 }, { minimum_notice_hours: 15 }]) {
      assert.equal((await savePolicy(settings)).status, 400, "configuration cannot exceed the fee or notice the student accepted");
      assert.deepEqual(db.prepare("SELECT * FROM settings ORDER BY key").all(), promised);
    }
  } finally {
    db.prepare("UPDATE settings SET value=? WHERE key='same_day_change_fee_cents'").run(previousFee);
    db.prepare("UPDATE settings SET value=? WHERE key='minimum_notice_hours'").run(previousNotice);
  }
  assert.equal((await save({ slot_interval_minutes: 30 })).status, 200);
});
await test("weekly hours refuse malformed replacements without erasing or partly saving the timetable", async () => {
  const original = db.prepare("SELECT * FROM availability_rules ORDER BY id").all();
  const valid = { weekday: 1, startMinute: 600, lastStartMinute: 1140 };
  const save = (rules, user = "teacher") => call("/admin/availability", { user, body: { rules }, headers: { "CF-Connecting-IP": "198.51.100.88" } });
  assert.equal((await save([valid], "alice")).status, 401);
  for (const rules of [
    null, [null], [valid, { ...valid, weekday: 7 }],
    [{ ...valid, startMinute: null }], [{ ...valid, weekday: "1" }],
    [{ ...valid, lastStartMinute: 599 }], [{ ...valid, lastStartMinute: 1441 }],
    Array.from({ length: 101 }, () => valid)
  ]) {
    assert.equal((await save(rules)).status, 400, JSON.stringify(rules));
    assert.deepEqual(db.prepare("SELECT * FROM availability_rules ORDER BY id").all(), original);
  }
  try {
    const saved = await save([valid]);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).count, 1);
    assert.equal((await save([])).status, 200, "an intentional empty timetable is allowed");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM availability_rules").get().n, 0);
  } finally {
    db.exec("DELETE FROM availability_rules");
    for (const row of original) db.prepare("INSERT INTO availability_rules (id,weekday,start_minute,last_start_minute,active) VALUES (?,?,?,?,?)")
      .run(row.id, row.weekday, row.start_minute, row.last_start_minute, row.active);
  }
});
await test("the teacher calendar replaces one date's time off without touching weekly blocks, extra hours or the day off", async () => {
  const at = new Date().toISOString();
  const lunch = db.prepare("INSERT INTO availability_exceptions (weekday,kind,start_minute,end_minute,note,created_at) VALUES (1,'blocked',750,810,'Lunch',?)").run(at).lastInsertRowid;
  db.prepare("INSERT INTO availability_exceptions (date,kind,start_minute,end_minute,created_at) VALUES ('2026-09-14','extra',1200,1200,?)").run(at);
  db.prepare("INSERT INTO availability_exceptions (date,kind,note,created_at) VALUES ('2026-09-14','blocked','Holiday',?)").run(at);
  const day = (body) => call("/admin/exceptions/day", { user: "teacher", body: { date: "2026-09-14", ...body } });
  const rows = () => db.prepare(`SELECT kind, start_minute AS s, end_minute AS e, note FROM availability_exceptions
    WHERE date = '2026-09-14' ORDER BY kind, start_minute`).all().map((row) => `${row.kind}:${row.s ?? ""}-${row.e ?? ""}${row.note ? `:${row.note}` : ""}`);
  const starts = async () => ((await (await call("/availability?lessonType=single&from=2026-09-14&to=2026-09-14", { method: "GET", user: null })).json())
    .slotsByDate["2026-09-14"] ?? []).map((slot) => slot.startAt.slice(11, 16));
  try {
    assert.equal((await call("/admin/exceptions/day", { user: "outsider", body: { date: "2026-09-14", blocks: [] } })).status, 401);
    for (const body of [
      { date: "2026-09-04", blocks: [] },
      {},
      { blocks: "14:00-15:00" },
      { blocks: [{ startMinute: 840, endMinute: 840 }] },
      { blocks: [{ startMinute: "840", endMinute: 900 }] },
      { blocks: [{ startMinute: 840, endMinute: 1500 }] },
      { blocks: [{ startMinute: 0, endMinute: 720 }, { startMinute: 720, endMinute: 1440 }] }
    ]) assert.equal((await day(body)).status, 400, JSON.stringify(body));
    assert.deepEqual(rows(), ["blocked:-:Holiday", "extra:1200-1200"], "a refused request writes nothing");

    const saved = await day({ blocks: [{ startMinute: 870, endMinute: 900 }, { startMinute: 840, endMinute: 870 }, { startMinute: 600, endMinute: 630 }] });
    assert.equal(saved.status, 200);
    assert.deepEqual(rows(), ["blocked:-:Holiday", "blocked:600-630", "blocked:840-900", "extra:1200-1200"]);
    assert.equal((await saved.json()).exceptions.length, 4, "returns the date's rows so the calendar can reconcile");
    assert.deepEqual(await starts(), [], "the day off still wins");

    assert.equal((await day({ dayOff: false })).status, 200);
    assert.deepEqual(rows(), ["blocked:600-630", "blocked:840-900", "extra:1200-1200"], "reopening the day keeps its blocked hours");
    const open = await starts();
    // 14:00-15:00 Porto (UTC+1) is off: a 60-minute lesson may not start at 13:30 or 14:30, but may at 15:00.
    for (const withheld of ["12:30", "13:00", "13:30"]) assert.ok(!open.includes(withheld), withheld);
    assert.ok(open.includes("14:00"), "15:00 Porto is free again");
    assert.ok(!open.includes("11:30"), "weekly lunch still applies");

    assert.equal((await day({ dayOff: true })).status, 200);
    assert.equal((await day({ dayOff: true, blocks: [{ startMinute: 600, endMinute: 630 }] })).status, 200);
    assert.deepEqual(rows(), ["blocked:-", "blocked:600-630", "extra:1200-1200"], "one day off, however often it is switched on");
    assert.equal((await day({ blocks: [] })).status, 200);
    assert.deepEqual(rows(), ["blocked:-", "extra:1200-1200"], "clearing the hours keeps the day off");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM availability_exceptions WHERE id = ?").get(lunch).n, 1);

    const schedule = await (await call("/admin/availability", { method: "GET", user: "teacher" })).json();
    assert.ok(schedule.exceptions.some((row) => row.weekday === 1 && row.note === "Lunch"), "weekly blocks reach the calendar");
    assert.equal((await call("/admin/exceptions", { user: "teacher", body: { date: "2026-09-15", startMinute: 900, endMinute: 840 } })).status, 400);
    assert.equal((await call("/admin/exceptions", { user: "teacher", body: { date: "2026-09-15", startMinute: "x" } })).status, 400);
  } finally {
    db.prepare("DELETE FROM availability_exceptions WHERE date = '2026-09-14' OR id = ?").run(lunch);
  }
});
await test("login reserves each attempt atomically and a success cannot reopen the window", async () => {
  const login = (email, password, ip) =>
    call("/auth/login", { user: null, headers: { "CF-Connecting-IP": ip }, body: { email, password } });

  // A read-then-record count let a burst of parallel guesses all pass the same
  // check. The atomic fixed-window reservation admits only eight per address.
  const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => login("burst@example.invalid", `wrong-${i}`, "203.0.113.41")));
  assert.equal(burst.filter((response) => response.status === 401).length, 8);
  assert.equal(burst.filter((response) => response.status === 429).length, 4);

  // The eighth attempt is correct, so it succeeds — and must not clear the
  // window and let the ninth guess back in.
  const ip = "203.0.113.42";
  const reg = await call("/auth/register", { user: null, headers: { "CF-Connecting-IP": ip }, body: { email: "seq@example.invalid", name: "Seq Tester", password: "the-real-password" } });
  assert.equal(reg.status, 201);
  const early = [];
  for (let attempt = 0; attempt < 7; attempt++) early.push((await login("seq@example.invalid", `wrong-${attempt}`, ip)).status);
  assert.deepEqual(early, Array(7).fill(401));
  assert.equal((await login("seq@example.invalid", "the-real-password", ip)).status, 200, "the eighth attempt, correct, is admitted");
  assert.equal((await login("seq@example.invalid", "the-real-password", ip)).status, 429, "and does not reopen the window");
});
await test("admin-token guessing is throttled before the comparison; a teacher session never is", async () => {
  const ip = "203.0.113.77";
  const guess = (bearer) => call("/admin/students", { method: "GET", user: null, headers: { Authorization: `Bearer ${bearer}`, "CF-Connecting-IP": ip } });
  const guesses = [];
  for (let attempt = 0; attempt < 20; attempt++) guesses.push((await guess(`wrong-token-${attempt}`)).status);
  assert.deepEqual(guesses, Array(20).fill(401), "twenty attempts are admitted, each a plain 401");
  assert.equal((await guess("one-more-wrong")).status, 429, "the connection is then locked out");
  // The throttle is spent before the token is compared, so even the right token
  // is refused from a locked-out connection.
  assert.equal((await guess(env.ADMIN_TOKEN)).status, 429, "the right token is refused while locked out");
  // A signed-in teacher on the very same connection is served regardless.
  assert.equal((await call("/admin/students", { method: "GET", user: "teacher", headers: { "CF-Connecting-IP": ip } })).status, 200);
  // An initially valid teacher loses authority when a reset, logout or role
  // change wins while their body, write or private response is still pending.
  const id = "admin-consistency";
  student(id);
  const originalPrepare = DB.prepare;
  const originalName = db.prepare("SELECT value FROM settings WHERE key='teacher_name'").get().value;
  const hashes = [];
  try {
    for (const phase of ["body", "write", "read"]) for (const change of ["logout", "reset", "role"]) {
      db.prepare("UPDATE students SET role='teacher' WHERE id=?").run(id);
      const version = db.prepare("SELECT session_version FROM students WHERE id=?").get(id).session_version;
      const session = await createSession(id, env.BOOKING_TOKEN_SECRET, version);
      const hash = await sessionHash(session);
      hashes.push(hash);
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(hash);
      let changed = false;
      const invalidate = () => {
        if (changed) return;
        changed = true;
        if (change === "logout") db.prepare("INSERT OR IGNORE INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(hash, Date.now() + 86400000);
        else if (change === "reset") db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(id);
        else db.prepare("UPDATE students SET role='student' WHERE id=?").run(id);
      };
      const request = new Request(`https://api.example/admin/${phase === "read" ? "students" : "settings"}`, {
        method: phase === "read" ? "GET" : "POST",
        headers: { Origin: env.ALLOWED_ORIGIN, Authorization: `Bearer ${session}`, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.182" },
        ...(phase === "read" ? {} : { body: JSON.stringify({ settings: { teacher_name: "Must not be saved" } }) })
      });
      if (phase === "body") {
        const reader = request.body.getReader.bind(request.body);
        request.body.getReader = () => { invalidate(); return reader(); };
      } else if (phase === "write") {
        beforeRun = sql => { if (sql.startsWith("INSERT INTO settings (key, value) SELECT")) { beforeRun = null; invalidate(); } };
      } else {
        DB.prepare = sql => {
          const statement = originalPrepare(sql);
          if (sql.includes("SELECT s.id, s.name, s.email")) {
            const all = statement.all;
            statement.all = () => { const result = all(); invalidate(); return result; };
          }
          return statement;
        };
      }
      const response = await worker.fetch(request, env, ctx);
      assert.equal(changed, true, `${phase}/${change} reached the authorization boundary`);
      assert.equal(response.status, 401, `${phase}/${change}: ${await response.clone().text()}`);
      assert.deepEqual(await response.json(), { error: "Please sign in again." });
      assert.equal(db.prepare("SELECT value FROM settings WHERE key='teacher_name'").get().value, originalName);
      DB.prepare = originalPrepare;
      beforeRun = null;
    }
    // A committed first lesson still gets its confirmation if logout wins
    // before the later weekly recipe. Further obligations are not created.
    db.prepare("UPDATE students SET role='teacher' WHERE id=?").run(id);
    const version = db.prepare("SELECT session_version FROM students WHERE id=?").get(id).session_version;
    const session = await createSession(id, env.BOOKING_TOKEN_SECRET, version);
    const hash = await sessionHash(session);
    hashes.push(hash);
    db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(hash);
    let accepted = false;
    DB.prepare = sql => {
      const statement = originalPrepare(sql);
      if (sql.startsWith("INSERT INTO bookings")) {
        const run = statement.run;
        statement.run = () => {
          const result = run();
          if (!accepted && result.meta.changes) {
            accepted = true;
            db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(hash, Date.now() + 86400000);
          }
          return result;
        };
      }
      return statement;
    };
    const created = await call("/admin/bookings", { token: session, headers: { "CF-Connecting-IP": "198.51.100.182" }, body: { studentId: "alice", lessonType: "single", startAt: "2026-12-25T12:00:00.000Z", repeat: 4 } });
    assert.equal(accepted, true);
    assert.equal(created.status, 401);
    await drain();
    const lesson = db.prepare("SELECT * FROM bookings WHERE student_id='alice' AND starts_at='2026-12-25T12:00:00.000Z'").get();
    assert.ok(lesson);
    assert.equal(lesson.series_id, null);
    assert.ok(db.prepare("SELECT 1 FROM email_log WHERE booking_id=? AND kind='student_booked' AND status IN ('sent','dry-run')").get(lesson.id), "the accepted first lesson is announced");
    db.prepare("DELETE FROM email_log WHERE booking_id=?").run(lesson.id);
    db.prepare("DELETE FROM bookings WHERE id=?").run(lesson.id);
  } finally {
    DB.prepare = originalPrepare;
    beforeRun = null;
    for (const hash of hashes) db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(hash);
    db.prepare("DELETE FROM students WHERE id=?").run(id);
  }
});
await test("Inês's calendar copy omits the student's manage link; the student's keeps it", async () => {
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0", TEACHER_NOTIFICATIONS_ENABLED: "1" });
  sentEmails.length = 0;
  try {
    const created = await call("/admin/bookings", { user: "teacher", body: { email: "alice@example.invalid", lessonType: "single", startAt: "2026-11-04T14:00:00.000Z" } });
    assert.equal(created.status, 201, await created.clone().text());
    await drain();
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0" });
    delete env.TEACHER_EMAIL;
    delete env.RESEND_API_KEY;
  }
  // Unfold RFC 5545 continuation lines before scanning for the token.
  const ics = (email) => Buffer.from(email.attachments[0].content, "base64").toString("utf8").replace(/\r\n /g, "");
  const teacherEmail = sentEmails.find((email) => email.to[0] === "ines@example.invalid");
  const studentEmail = sentEmails.find((email) => email.to[0] === "alice@example.invalid");
  assert.ok(teacherEmail && studentEmail, "both copies were sent");
  assert.ok(!ics(teacherEmail).includes("manage="), "Inês's calendar copy carries no per-booking manage link");
  assert.ok(ics(studentEmail).includes("manage="), "the student's own copy still does");
});
// A student who backs out of the card form keeps one unfinished setup, not a lockout.
function unsavedCardStudent(id) {
  student(id);
  db.prepare("UPDATE students SET stripe_customer_id=NULL,stripe_payment_method=NULL WHERE id=?").run(id);
  return createSession(id, env.BOOKING_TOKEN_SECRET).then((session) => { sessions[id] = session; return id; });
}
const backedOutTrial = { lessonType: "trial", startAt: "2026-11-10T10:00:00.000Z", paymentConsent: true, expectedPriceCents: 2000 };
await test("a new booking replaces the student's own unfinished card setup instead of refusing them", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  db.prepare("DELETE FROM request_limits WHERE key LIKE 'hold:%'").run();
  const user = await unsavedCardStudent("backs-out");
  const holds = () => db.prepare("SELECT id, stripe_session_id FROM bookings WHERE student_id=?").all(user);
  assert.equal((await call("/bookings", { user, body: backedOutTrial })).status, 201);
  const [abandoned] = holds();
  for (let attempt = 0; attempt < 3; attempt++) {
    const again = await call("/bookings", { user, body: backedOutTrial });
    assert.equal(again.status, 201, await again.clone().text());
  }
  assert.equal(holds().length, 1, "one unfinished setup per student");
  assert.notEqual(holds()[0].id, abandoned.id);
  assert.ok(expiredSessions.includes(abandoned.stripe_session_id), "the released Checkout Session is expired with Stripe");

  setupIntents.set("seti_backs_out", { status: "succeeded", customer: "cus_backs_out", payment_method: "pm_backs_out" });
  const late = await webhook({ id: "evt_backs_out", type: "checkout.session.completed", livemode: false, data: { object: {
    id: abandoned.stripe_session_id, client_reference_id: abandoned.id, customer: "cus_backs_out", mode: "setup",
    status: "complete", setup_intent: "seti_backs_out", metadata: { purpose: "card_setup" }
  } } });
  assert.equal(late.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=? AND status='confirmed'").get(user).n, 0);
  assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(user).stripe_payment_method, null);

  const originalPrepare = DB.prepare;
  for (const stage of ["read", "provider", "delete", "accepted"]) {
    const owner = await unsavedCardStudent(`hold-recovery-${stage}`);
    const oldId = `${owner}-old`;
    const newId = `${owner}-new`;
    const oldSession = `cs_${oldId}`;
    const newSession = `cs_${newId}`;
    const hold = (id, session) => {
      booking(id, { owner, payment: "pending", start: "2026-11-12T17:00:00.000Z", end: "2026-11-12T18:00:00.000Z" });
      db.prepare("UPDATE bookings SET status='pending_payment',hold_expires_at='2026-09-05T10:20:00.000Z',stripe_session_id=? WHERE id=?").run(session, id);
    };
    hold(oldId, oldSession);
    const recover = () => {
      db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(owner);
      hold(newId, newSession);
      if (["provider", "delete"].includes(stage)) {
        db.prepare("UPDATE bookings SET stripe_session_id=? WHERE id=?").run(`${newSession}_replacement`, oldId);
      }
    };
    if (["read", "provider"].includes(stage)) {
      DB.prepare = sql => {
        const statement = originalPrepare(sql);
        const prefix = stage === "read" ? "SELECT id, series_id, stripe_session_id, hold_expires_at FROM bookings"
          : "SELECT COUNT(*) AS n FROM bookings b WHERE b.student_id";
        if (sql.startsWith(prefix)) {
          const method = stage === "read" ? "all" : "first";
          const read = statement[method];
          statement[method] = () => { DB.prepare = originalPrepare; recover(); return read(); };
        }
        return statement;
      };
    } else {
      beforeRun = sql => {
        if (sql.startsWith("DELETE FROM bookings WHERE student_id = ? AND status = 'pending_payment'")) {
          beforeRun = null; recover();
        }
      };
    }
    try {
      assert.equal((await call("/bookings", { user: owner, body: backedOutTrial })).status, 401);
      assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(newId).status, "pending_payment", "a recovered owner's new checkout is retained");
      assert.ok(!expiredSessions.includes(newSession) && !expiredSessions.includes(`${newSession}_replacement`), "a stale request cannot expire a fresh checkout");
      assert.equal(expiredSessions.includes(oldSession), ["delete", "accepted"].includes(stage), "only expiry authorized before recovery can start");
      assert.equal(Boolean(db.prepare("SELECT id FROM bookings WHERE id=?").get(oldId)), stage !== "accepted",
        "accepted expiry finishes, but deletion never follows a changed checkout snapshot");
    } finally {
      DB.prepare = originalPrepare; beforeRun = null;
      db.prepare("DELETE FROM bookings WHERE student_id=?").run(owner);
      db.prepare("DELETE FROM students WHERE id=?").run(owner);
      delete sessions[owner];
    }
  }
});
await test("a card setup Stripe already completed keeps its hold, its trial claim and its webhook confirmation", async () => {
  const [finished] = db.prepare("SELECT id, stripe_session_id FROM bookings WHERE student_id='backs-out'").all();
  completedSessions.add(finished.stripe_session_id);
  const trial = await call("/bookings", { user: "backs-out", body: backedOutTrial });
  assert.equal(trial.status, 400);
  assert.match(await trial.text(), /first lesson/);
  assert.equal((await call("/bookings", { user: "backs-out", body: { ...backedOutTrial, lessonType: "single", expectedPriceCents: 2500 } })).status, 409);
  setupIntents.set("seti_finished", { status: "succeeded", customer: "cus_finished", payment_method: "pm_finished" });
  const confirmed = await webhook({ id: "evt_finished", type: "checkout.session.completed", livemode: false, data: { object: {
    id: finished.stripe_session_id, client_reference_id: finished.id, customer: "cus_finished", mode: "setup",
    status: "complete", setup_intent: "seti_finished", metadata: { purpose: "card_setup" }
  } } });
  assert.equal(confirmed.status, 200, await confirmed.clone().text());
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(finished.id).status, "confirmed");
});
await test("a lapsed hold always goes, and an open one only once Stripe confirms its session expired", async () => {
  db.prepare("DELETE FROM request_limits WHERE key LIKE 'hold:%'").run();
  const user = await unsavedCardStudent("stale-hold");
  for (const [id, start, expires] of [["stale-lapsed", "2026-11-13T17:00:00.000Z", "2026-09-05T09:30:00.000Z"], ["stale-open", "2026-11-13T18:00:00.000Z", "2026-09-05T10:20:00.000Z"]]) {
    booking(id, { owner: user, payment: "pending", start, end: new Date(Date.parse(start) + 3600000).toISOString() });
    db.prepare("UPDATE bookings SET status='pending_payment', hold_expires_at=?, stripe_session_id=? WHERE id=?").run(expires, `cs_${id}`, id);
  }
  const trial = { ...backedOutTrial, startAt: "2026-11-11T17:00:00.000Z" };
  expiryUnavailable = true;
  try {
    assert.equal((await call("/bookings", { user, body: trial })).status, 400, "an open setup Stripe could not expire may still become a lesson");
  } finally {
    expiryUnavailable = false;
  }
  await drain();
  assert.deepEqual(db.prepare("SELECT id FROM bookings WHERE student_id=?").all(user).map((row) => row.id), ["stale-open"]);
  const booked = await call("/bookings", { user, body: trial });
  assert.equal(booked.status, 201, await booked.clone().text());
  assert.ok(expiredSessions.includes("cs_stale-open"));
  assert.ok(!db.prepare("SELECT id FROM bookings WHERE student_id=?").all(user).some((row) => row.id.startsWith("stale-")));
});
await test("replacing an unfinished weekly setup removes its held lessons and its empty recipe", async () => {
  db.prepare("DELETE FROM request_limits WHERE key LIKE 'hold:%'").run();
  const user = await unsavedCardStudent("weekly-backs-out");
  const weekly = { lessonType: "single", startAt: "2026-11-12T17:00:00.000Z", repeat: 4, paymentConsent: true, expectedPriceCents: 2500 };
  const response = await call("/bookings", { user, body: weekly });
  assert.equal(response.status, 201);
  await cardReturnToken(await response.json());
  const [first] = db.prepare("SELECT id FROM booking_series WHERE student_id=?").all(user);
  const again = await call("/bookings", { user, body: weekly });
  assert.equal(again.status, 201, await again.clone().text());
  const series = db.prepare("SELECT id FROM booking_series WHERE student_id=?").all(user);
  assert.equal(series.length, 1);
  assert.notEqual(series[0].id, first.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=? AND series_id=?").get(user, series[0].id).n, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=?").get(user).n, 4);
});

await test("availability ignores the lesson being changed only for its manage link or its owner's session", async () => {
  booking("avail-own", { start: "2026-11-16T10:00:00.000Z", end: "2026-11-16T11:00:00.000Z" });
  const starts = async (query, user = null) => ((await (await call(`/availability?from=2026-11-16&to=2026-11-16&lessonType=${query}`, { method: "GET", user })).json())
    .slotsByDate["2026-11-16"] ?? []).map((slot) => slot.startAt.slice(11, 16));
  const manage = encodeURIComponent(await token("avail-own"));
  assert.ok(!(await starts("single")).includes("10:30"));
  assert.ok((await starts(`single&manage=${manage}`)).includes("10:30"), "half an hour later is offered");
  assert.ok((await starts(`long&manage=${manage}`)).includes("10:00"), "a longer lesson at the same start is offered");
  assert.ok(!(await starts(`long&manage=avail-own.forged`)).includes("10:00"), "a forged link gets the public answer");

  const at = new Date().toISOString();
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('avail-series','alice','single',1,720,?,?)").run(at, at);
  booking("avail-weekly", { series: "avail-series", start: "2026-11-16T12:00:00.000Z", end: "2026-11-16T13:00:00.000Z" });
  assert.ok(!(await starts("single&series=avail-series")).includes("12:30"), "no session");
  assert.ok(!(await starts("single&series=avail-series", "outsider")).includes("12:30"), "someone else's session");
  assert.ok((await starts("single&series=avail-series", "alice")).includes("12:30"), "the owner moving their sequence");
  db.prepare("UPDATE booking_series SET status='ended' WHERE id='avail-series'").run();
  assert.ok(!(await starts("single&series=avail-series", "alice")).includes("12:30"), "an ended sequence cannot be moved");
});

await test("switching only between online and Porto inside 14 hours is a late change, not a new time", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const id = linkedBooking("switch-late", { start: "2026-09-05T18:00:00.000Z", end: "2026-09-05T19:00:00.000Z" });
  const path = `/bookings/${await token(id)}/reschedule`;
  const fees = () => charges.filter((charge) => charge.key.includes(id)).map((charge) => charge.amount);
  const switched = await call(path, { body: { startAt: "2026-09-05T18:00:00.000Z", location: "porto" } });
  assert.equal(switched.status, 200, await switched.clone().text());
  const result = await switched.json();
  assert.equal(result.booking.location, "porto");
  assert.equal(result.sameDayFeeApplied, true);
  await drain();
  assert.deepEqual({ ...db.prepare("SELECT starts_at, ends_at, location, same_day_change FROM bookings WHERE reference='switch-late'").get() },
    { starts_at: "2026-09-05T18:00:00.000Z", ends_at: "2026-09-05T19:00:00.000Z", location: "porto", same_day_change: 1 });
  assert.deepEqual(fees(), [500], "one late change fee, as for any change inside the window");
  assert.equal((await call(path, { body: { startAt: "2026-09-05T18:00:00.000Z", location: "online" } })).status, 200);
  await drain();
  assert.deepEqual(fees(), [500], "the fee applies once per lesson");
  for (const body of [{ startAt: "2026-09-05T18:30:00.000Z" }, { startAt: "2026-09-05T18:00:00.000Z", lessonType: "long" }]) {
    const refused = await call(path, { body });
    assert.equal(refused.status, 409);
    assert.match(await refused.text(), /at least 14 hours' notice/);
  }
  // Inês may place a lesson outside her published hours; its student can still switch where it happens.
  const outsideId = linkedBooking("switch-outside-hours", { start: "2026-09-16T20:00:00.000Z", end: "2026-09-16T21:00:00.000Z" });
  const outside = await call(`/bookings/${await token(outsideId)}/reschedule`, { body: { startAt: "2026-09-16T20:00:00.000Z", location: "porto" } });
  assert.equal(outside.status, 200, await outside.clone().text());
});

await test("a pay-in-person lesson cancelled late says the fee applies, never that a card is charged", async () => {
  const id = linkedBooking("in-person-late", { payment: "not_required", start: "2026-09-05T19:00:00.000Z", end: "2026-09-05T20:00:00.000Z" });
  Object.assign(env, { RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  sentEmails.length = 0;
  const chargesBefore = charges.length;
  try {
    const cancelled = await call(`/bookings/${await token(id)}/cancel`);
    assert.equal(cancelled.status, 200, await cancelled.clone().text());
    const result = await cancelled.json();
    assert.equal(result.sameDayFeeApplied, true);
    assert.equal(result.booking.sameDayFeeAutomatic, false);
    await drain();
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1" });
    delete env.RESEND_API_KEY;
  }
  const email = sentEmails.find((sent) => sent.to[0] === "alice@example.invalid" && sent.subject.endsWith("is cancelled"));
  assert.match(email.text, /less than 14 hours before the lesson, so the €5 fee applies\./);
  assert.ok(!/saved card|automatically/.test(email.text));
  assert.equal(charges.length, chargesBefore);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE reference='in-person-late'").get().same_day_fee_status, "not_required");
});

await test("emails keep an agreed rate's cents instead of rounding to whole euros", async () => {
  student("cents-rate"); sessions["cents-rate"] = await createSession("cents-rate", env.BOOKING_TOKEN_SECRET);
  db.prepare("INSERT INTO student_recurring_rates (student_id, duration_minutes, amount_cents, redeemed_at) VALUES ('cents-rate', 60, 2250, ?)").run(new Date().toISOString());
  Object.assign(env, { RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  sentEmails.length = 0;
  try {
    const booked = await call("/bookings", { user: "cents-rate", body: { lessonType: "single", startAt: "2026-10-15T16:00:00.000Z", repeat: 4, paymentConsent: true, expectedPriceCents: 2250 } });
    assert.equal(booked.status, 201, await booked.clone().text());
    await drain();
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1" });
    delete env.RESEND_API_KEY;
  }
  const email = sentEmails.find((sent) => sent.to[0] === "cents-rate@example.invalid");
  assert.match(email.text, /^Price: €22\.50 a lesson · charged to your saved card after each lesson$/m);
});

await test("moving a recurrence leaves a lesson inside 14 hours where it is and moves the rest together", async () => {
  const at = new Date().toISOString();
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('keep-late','alice','single',6,1140,?,?)").run(at, at);
  for (const [id, start] of [["keep-late-1", "2026-09-05T18:00:00.000Z"], ["keep-late-2", "2026-09-12T18:00:00.000Z"], ["keep-late-3", "2026-09-19T18:00:00.000Z"]]) {
    booking(id, { series: "keep-late", start, end: new Date(Date.parse(start) + 3600000).toISOString() });
  }
  Object.assign(env, { RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  let moved;
  try {
    moved = await call("/series/keep-late/reschedule", { body: { startAt: "2026-11-17T12:00:00.000Z" } });
    await drain();
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1" });
    delete env.RESEND_API_KEY;
  }
  assert.equal(moved.status, 200, await moved.clone().text());
  // Its email names the lesson that stayed, rather than claiming they all moved.
  assert.match(sentEmails.findLast((sent) => sent.subject.startsWith("Your weekly Portuguese lessons have moved")).text, /One lesson was too close to move and stays as it was\./);
  const result = await moved.json();
  assert.equal(result.moved, 2);
  assert.deepEqual(result.kept, ["2026-09-05T18:00:00.000Z"]);
  assert.deepEqual(db.prepare("SELECT id, starts_at, sequence FROM bookings WHERE series_id='keep-late' ORDER BY id").all().map((row) => ({ ...row })), [
    { id: "keep-late-1", starts_at: "2026-09-05T18:00:00.000Z", sequence: 0 },
    { id: "keep-late-2", starts_at: "2026-11-17T12:00:00.000Z", sequence: 1 },
    { id: "keep-late-3", starts_at: "2026-11-24T12:00:00.000Z", sequence: 1 }
  ]);
  // Only the lessons that moved are the student's change; the one kept inside 14 hours is not.
  assert.deepEqual(db.prepare("SELECT id FROM bookings WHERE series_id='keep-late' AND student_changed_at IS NOT NULL ORDER BY id").all().map((row) => row.id), ["keep-late-2", "keep-late-3"]);
  assert.deepEqual({ ...db.prepare("SELECT weekday, minute_of_day FROM booking_series WHERE id='keep-late'").get() }, { weekday: 2, minute_of_day: 720 });

  // Stopping the run keeps the same lesson, and that email names it too.
  Object.assign(env, { RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  let stopped;
  try {
    stopped = await call("/series/keep-late/stop", { body: { cancelRemaining: true } });
    await drain();
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1" });
    delete env.RESEND_API_KEY;
  }
  assert.equal(stopped.status, 200, await stopped.clone().text());
  assert.deepEqual((({ cancelled, kept }) => ({ cancelled, kept }))(await stopped.json()), { cancelled: 2, kept: 1 });
  assert.match(sentEmails.findLast((sent) => sent.subject.startsWith("Your weekly lessons are cancelled")).text, /One lesson was too close to cancel and stays as it was\./);
});
await test("a moved recurrence cannot land on the lesson it leaves inside the window", async () => {
  const at = new Date().toISOString();
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('keep-clash','alice','single',6,1410,?,?)").run(at, at);
  booking("keep-clash-1", { series: "keep-clash", start: "2026-09-05T23:30:00.000Z", end: "2026-09-06T01:00:00.000Z" });
  db.prepare("UPDATE bookings SET lesson_type_id='long' WHERE id='keep-clash-1'").run();
  booking("keep-clash-2", { series: "keep-clash", start: "2026-09-12T23:30:00.000Z", end: "2026-09-13T00:30:00.000Z" });
  const extra = db.prepare("INSERT INTO availability_exceptions (date,kind,start_minute,end_minute,created_at) VALUES ('2026-09-06','extra',60,60,?)").run(at).lastInsertRowid;
  try {
    const clash = await call("/series/keep-clash/reschedule", { body: { startAt: "2026-09-06T00:00:00.000Z" } });
    assert.equal(clash.status, 409);
    assert.match(await clash.text(), /overlaps your lesson on .+, which stays where it is/);
    assert.equal(db.prepare("SELECT starts_at FROM bookings WHERE id='keep-clash-2'").get().starts_at, "2026-09-12T23:30:00.000Z");
  } finally {
    db.prepare("DELETE FROM availability_exceptions WHERE id=?").run(extra);
  }
});
await test("a time claimed while a recurrence is being moved moves none of it", async () => {
  const at = new Date().toISOString();
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('move-race','alice','single',2,900,?,?)").run(at, at);
  booking("move-race-1", { series: "move-race", start: "2026-11-17T15:00:00.000Z", end: "2026-11-17T16:00:00.000Z" });
  booking("move-race-2", { series: "move-race", start: "2026-11-24T15:00:00.000Z", end: "2026-11-24T16:00:00.000Z" });
  beforeRun = (sql) => {
    if (!sql.startsWith("WITH proposed")) return;
    beforeRun = null;
    booking("move-race-rival", { owner: "bob", start: "2026-11-30T16:00:00.000Z", end: "2026-11-30T17:00:00.000Z" });
  };
  const moved = await call("/series/move-race/reschedule", { body: { startAt: "2026-11-23T16:00:00.000Z" } });
  assert.equal(moved.status, 409, await moved.clone().text());
  assert.deepEqual(db.prepare("SELECT starts_at FROM bookings WHERE series_id='move-race' ORDER BY starts_at").all().map((row) => row.starts_at),
    ["2026-11-17T15:00:00.000Z", "2026-11-24T15:00:00.000Z"]);
});
// Registration proves nothing about an address; Inês's booking for it must not
// reach whoever registered it first.
// Its email carries a one-click sign-in link instead of a password to recover.
const signInLinkIn = (sent) => decodeURIComponent(/\/book\/\?signin=(\S+)/.exec(sent.text)?.[1] ?? "");
function captureEmail() {
  Object.assign(env, { RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  sentEmails.length = 0;
}
function releaseEmail() {
  Object.assign(env, { EMAIL_DRY_RUN: "1" });
  delete env.RESEND_API_KEY;
}

await test("teacher cancellation sends an escaped personal message to both inboxes without changing lesson notes or charging a fee", async () => {
  captureEmail();
  env.TEACHER_NOTIFICATIONS_ENABLED = "1";
  env.TEACHER_EMAIL = "ines@example.invalid";
  const message = 'Olá Alice,\nI’m sorry, I’m unwell today. Reply and we can find another time.\n<em>Obrigada</em> & até breve!';
  const chargeCount = charges.length;
  try {
    booking("cancel-message", { start: "2026-09-05T12:00:00.000Z", end: "2026-09-05T13:00:00.000Z" });
    db.prepare("UPDATE bookings SET notes='Practise conversation' WHERE id='cancel-message'").run();
    const response = await call("/admin/bookings/cancel-message/cancel", { user: "teacher", body: { message: `  ${message.replaceAll('\n', '\r\n')}  ` } });
    assert.equal(response.status, 200, await response.clone().text());
    await drain();
    assert.deepEqual({ ...db.prepare("SELECT status,cancelled_by,cancellation_message,notes,sequence,same_day_change FROM bookings WHERE id='cancel-message'").get() },
      { status: "cancelled", cancelled_by: "teacher", cancellation_message: message, notes: "Practise conversation", sequence: 1, same_day_change: 0 });
    assert.equal(charges.length, chargeCount);
    const studentEmail = sentEmails.find(sent => sent.to[0] === "alice@example.invalid");
    const teacherEmail = sentEmails.find(sent => sent.to[0] !== "alice@example.invalid");
    assert.ok(studentEmail.text.includes(`Message from Inês\n${message}`));
    assert.ok(studentEmail.html.includes("Olá Alice,<br>I’m sorry"));
    assert.ok(studentEmail.html.includes("&lt;em&gt;Obrigada&lt;/em&gt; &amp; até breve!"));
    assert.ok(!studentEmail.html.includes("<em>Obrigada</em>"));
    assert.ok(teacherEmail.text.includes(`Your message to the student\n${message}`));
    const ics = Buffer.from(studentEmail.attachments[0].content, "base64").toString();
    assert.ok(ics.includes("METHOD:CANCEL") && ics.includes("SEQUENCE:1"));
    assert.ok(!ics.includes(message), "the note is email text, not calendar markup");
  } finally {
    env.TEACHER_NOTIFICATIONS_ENABLED = "0";
    delete env.TEACHER_EMAIL;
    releaseEmail();
  }
});

await test("teacher cancellation accepts no message, blank text and the limit, but rejects invalid input before refunding", async () => {
  captureEmail();
  try {
    for (const [suffix, body, expected] of [["omitted", {}, null], ["blank", { message: " \n\t " }, null], ["limit", { message: "á".repeat(1000) }, "á".repeat(1000)]]) {
      const id = `cancel-message-${suffix}`;
      booking(id, { payment: "not_required" });
      const response = await call(`/admin/bookings/${id}/cancel`, { user: "teacher", body });
      assert.equal(response.status, 200);
      await drain();
      assert.equal(db.prepare("SELECT cancellation_message FROM bookings WHERE id=?").get(id).cancellation_message, expected);
      const email = sentEmails.find(sent => sent.text.includes(`Reference: ${id}`));
      assert.equal(email.text.includes("Message from Inês"), Boolean(expected));
      assert.equal(email.html.includes("Message from Inês"), Boolean(expected));
    }
    booking("cancel-message-invalid", { payment: "paid" });
    db.prepare("UPDATE bookings SET stripe_payment_intent='pi_invalid_message' WHERE id='cancel-message-invalid'").run();
    const refundCount = refunds.length;
    for (const message of [null, 17, {}, [], "a".repeat(1001)]) {
      assert.equal((await call("/admin/bookings/cancel-message-invalid/cancel", { user: "teacher", body: { message } })).status, 400);
    }
    assert.equal((await call("/admin/bookings/cancel-message-invalid/cancel", { body: { message: "Student cannot act as teacher" } })).status, 401);
    assert.equal(refunds.length, refundCount);
    assert.deepEqual({ ...db.prepare("SELECT status,payment_status,cancellation_message FROM bookings WHERE id='cancel-message-invalid'").get() },
      { status: "confirmed", payment_status: "paid", cancellation_message: null });
  } finally { releaseEmail(); }
});

await test("a cancellation that loses a move or payment race cannot save its message", async () => {
  for (const payment of ["scheduled", "paid"]) {
    const id = `cancel-message-race-${payment}`;
    booking(id, { payment });
    db.prepare("UPDATE bookings SET stripe_payment_intent='pi_message_race' WHERE id=?").run(id);
    beforeRun = sql => {
      if (sql.startsWith(payment === "paid" ? "INSERT OR IGNORE INTO booking_refunds" : "UPDATE bookings SET status = 'cancelled'")) {
        beforeRun = null;
        db.prepare("UPDATE bookings SET sequence=sequence+1 WHERE id=?").run(id);
      }
    };
    const refundCount = refunds.length;
    assert.equal((await call(`/admin/bookings/${id}/cancel`, { user: "teacher", body: { message: "A stale message" } })).status, 409);
    assert.equal(refunds.length, refundCount);
    assert.equal(db.prepare("SELECT cancellation_message FROM bookings WHERE id=?").get(id).cancellation_message, null);
  }
  for (const change of ["paid", "by-hand", "repriced"]) {
    const id = `cancel-payment-race-${change}`;
    booking(id);
    beforeRun = sql => {
      if (!sql.startsWith("UPDATE bookings SET status = 'cancelled'")) return;
      beforeRun = null;
      if (change === "paid") {
        db.prepare("UPDATE bookings SET payment_status='paid',stripe_payment_intent=?,charged_cents=1500,charge_started_at=?,charge_request='{}' WHERE id=?")
          .run(`pi_${id}`, new Date().toISOString(), id);
      } else if (change === "by-hand") {
        db.prepare("UPDATE bookings SET payment_status='not_required',payment_consent_version='paid-by-hand' WHERE id=?").run(id);
      } else {
        db.prepare("UPDATE bookings SET amount_cents=1200 WHERE id=?").run(id);
      }
    };
    const refundCount = refunds.length;
    const rejected = await call(`/admin/bookings/${id}/cancel`, { user: "teacher", body: { message: "A stale payment decision" } });
    assert.equal(rejected.status, 409, change);
    assert.equal(refunds.length, refundCount, "a losing cancellation sends no refund");
    assert.deepEqual({ ...db.prepare("SELECT status,sequence,cancellation_message FROM bookings WHERE id=?").get(id) },
      { status: "confirmed", sequence: 0, cancellation_message: null }, change);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id=? AND kind='student_cancelled'").get(id).n, 0);
    if (change === "paid") {
      const retry = await call(`/admin/bookings/${id}/cancel`, { user: "teacher", body: { message: "Cancel and refund this payment" } });
      assert.equal(retry.status, 200, await retry.clone().text());
      assert.equal(refunds.length, refundCount + 1, "reloading the paid lesson takes the refund path once");
      assert.deepEqual({ ...db.prepare("SELECT status,payment_status FROM bookings WHERE id=?").get(id) }, { status: "cancelled", payment_status: "refunded" });
    }
  }
});

await test("a paid teacher cancellation keeps its message through an immediate or delayed refund and email retry", async () => {
  captureEmail();
  try {
    for (const delayed of [false, true]) {
      const id = `cancel-message-refund-${delayed}`;
      const message = `Sorry, I need to cancel.\nLet’s find another time (${delayed}).`;
      booking(id, { payment: "paid", start: "2026-09-05T12:00:00.000Z", end: "2026-09-05T13:00:00.000Z" });
      db.prepare("UPDATE bookings SET stripe_payment_intent=? WHERE id=?").run(`pi_${id}`, id);
      refundStatus = delayed ? "pending" : "succeeded";
      const response = await call(`/admin/bookings/${id}/cancel`, { user: "teacher", body: { message } });
      assert.equal(response.status, delayed ? 503 : 200);
      await drain();
      if (delayed) {
        assert.equal(sentEmails.filter(sent => sent.text.includes(`Reference: ${id}`)).length, 0);
        assert.equal(db.prepare("SELECT cancellation_message FROM bookings WHERE id=?").get(id).cancellation_message, message);
        assert.equal((await call(`/admin/bookings/${id}/cancel`, { user: "teacher", body: { message: "Do not overwrite the original" } })).status, 409);
        db.prepare("UPDATE booking_refunds SET attempted_at='2026-09-05T09:00:00.000Z' WHERE booking_id=?").run(id);
        refundStatus = "succeeded";
        const refundCount = refunds.length;
        await retryRefunds(env);
        assert.equal(refunds.length, refundCount, "retrieves the pending refund rather than issuing another");
      }
      const email = sentEmails.find(sent => sent.text.includes(`Reference: ${id}`));
      assert.ok(email.text.includes(`Message from Inês\n${message}`));
      assert.ok(email.text.includes("Refunded in full"));
      assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(id).payment_status, "refunded");
      // A lost provider result keeps its exact request for a safe retry. Old
      // lifecycle and separately owned notices must not fill every queue place.
      const request = JSON.stringify(email);
      const obsolete = db.prepare(`INSERT INTO email_log (booking_id,kind,recipient,dedupe_key,status,created_at,request_json,first_attempt_at)
        VALUES (?,?,?,?,'failed','2026-09-05T08:00:00.000Z',?,'2026-09-05T08:00:00.000Z')`);
      for (let index = 0; index < 25; index++) obsolete.run(id, index % 2 ? "student_meeting_ready" : "student_cancelled", "alice@example.invalid", `obsolete:${id}:${index}`, request);
      db.prepare(`UPDATE email_log SET status='failed', created_at='2026-09-05T09:00:00.000Z',
        first_attempt_at='2026-09-05T09:00:00.000Z', request_json=?, lifecycle_json=? WHERE booking_id=? AND kind='student_cancelled' AND dedupe_key NOT LIKE 'obsolete:%'`)
        .run(request, JSON.stringify(emailLifecycle([db.prepare("SELECT * FROM bookings WHERE id=?").get(id)])), id);
      await resendFailedEmails(env);
      const retried = sentEmails.filter(sent => sent.text.includes(`Reference: ${id}`));
      assert.equal(retried.length, 2);
      assert.equal(retried[1].text, email.text);
      assert.equal(retried[1].html, email.html);
      await resendFailedEmails(env);
      assert.equal(sentEmails.filter(sent => sent.text.includes(`Reference: ${id}`)).length, 2, "successful retry is deduplicated");
      db.prepare("DELETE FROM email_log WHERE dedupe_key LIKE ?").run(`obsolete:${id}:%`);
    }
  } finally {
    refundStatus = "succeeded";
    releaseEmail();
  }
});
// The day-before reminder (14 October 2026). A window nothing else uses; every
// assertion is by reference, since earlier fixtures may sit nearby.
await test("the day-before reminder goes once per lesson version, on its own clock, never after a fresh email or for a cancelled lesson, and is never rebuilt as a confirmation", async () => {
  const N = new Date("2026-11-02T18:00:00.000Z");
  const lesson = (id, start, fields = {}) => {
    booking(id, { start, end: new Date(Date.parse(start) + 3600000).toISOString() });
    for (const [column, value] of Object.entries(fields)) db.prepare(`UPDATE bookings SET ${column} = ? WHERE id = ?`).run(value, id);
  };
  const logged = (id, key, status, at, kind = "student_lesson_reminder") =>
    db.prepare("INSERT INTO email_log (booking_id,kind,recipient,dedupe_key,status,created_at) VALUES (?,?,?,?,?,?)").run(id, kind, "alice@example.invalid", key, status, at);
  const remindersFor = (id) => sentEmails.filter((sent) => sent.subject.startsWith("Your lesson is coming up") && sent.text.split("\n").includes(`Reference: ${id}`));
  // Six a minute, so a few ticks stand in for the next few minutes.
  const sweep = async () => { for (let tick = 0; tick < 3; tick++) await sendLessonReminders(env, N); };
  const google = { GOOGLE_CALENDAR_ENABLED: "1", GOOGLE_CALENDAR_CLIENT_ID: "isolated-calendar-client", GOOGLE_CALENDAR_CLIENT_SECRET: "isolated-calendar-secret",
    GOOGLE_CALENDAR_TOKEN_KEY: "ab".repeat(32), GOOGLE_CALENDAR_REDIRECT_URI: "https://api.example.invalid/google-calendar/callback" };
  const realPrepare = DB.prepare;
  captureEmail();
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", TEACHER_NOTIFICATIONS_ENABLED: "1" });
  try {
    // With Google Meet off there is no link to promise.
    lesson("rem-nolink-off", "2026-11-03T16:00:00.000Z");
    await sweep();
    const [off, ...offMore] = remindersFor("rem-nolink-off");
    assert.equal(offMore.length, 0);
    assert.ok(off.text.includes("Olá Test, your lesson with Inês is coming up.\n"));
    assert.ok(!off.text.includes("Google Meet") && !off.text.includes("ready yet"));

    Object.assign(env, google);
    lesson("rem-meet", "2026-11-03T17:00:00.000Z", { student_timezone: "America/Los_Angeles", meeting_url: "https://meet.google.com/abc-defg-hij" });
    lesson("rem-nolink", "2026-11-03T16:30:00.000Z");
    lesson("rem-cancelled", "2026-11-03T12:00:00.000Z", { status: "cancelled" });
    lesson("rem-fresh", "2026-11-03T13:00:00.000Z", { created_at: "2026-11-02T17:00:00.000Z" });
    lesson("rem-moved", "2026-11-03T14:00:00.000Z", { sequence: 1 });
    logged("rem-moved", "student:rescheduled:rem-moved:1", "sent", "2026-11-02T08:00:00.000Z", "student_rescheduled");
    db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('rem-series','alice','single',2,870,?,?)").run(N.toISOString(), N.toISOString());
    lesson("rem-series", "2026-11-03T14:30:00.000Z", { series_id: "rem-series", sequence: 3 });
    logged("rem-series", "student:series-moved:rem-series:3", "sent", "2026-11-02T08:00:00.000Z", "student_series_moved");
    lesson("rem-retry", "2026-11-03T15:00:00.000Z", { location: "porto", sequence: 2, payment_status: "paid" });
    lesson("rem-recent", "2026-11-03T15:30:00.000Z");
    logged("rem-recent", "student:reminder:rem-recent:0", "failed", "2026-11-02T17:58:00.000Z");
    lesson("rem-race", "2026-11-03T16:15:00.000Z", { meeting_url: "https://meet.google.com/xyz-abcd-efg" });
    lesson("rem-near", "2026-11-03T07:00:00.000Z");
    lesson("rem-far", "2026-11-03T19:00:00.000Z");
    lesson("rem-noemail", "2026-11-03T12:30:00.000Z", { student_email: "no-email:rem" });

    // A real failed attempt retains its exact reminder. An interrupted send
    // with an expired lease follows the same safe provider retry path.
    emailUnavailable = true;
    await sendLessonReminders(env, N);
    emailUnavailable = false;
    db.prepare(`UPDATE email_log SET status='pending',send_claim_until='2026-09-05T09:59:00.000Z'
      WHERE dedupe_key='student:reminder:rem-retry:2'`).run();

    // A failed reminder has a booking id, but is not "booked": it retries in its own sweep.
    await resendFailedEmails(env);
    assert.equal(sentEmails.filter((sent) => /Reference: rem-(retry|race)\b/.test(sent.text)).length, 0, "never rebuilt as a confirmation");

    // Another tick reclaims the failed row first: only the one that flips it sends.
    beforeRun = (sql, values) => {
      if (sql.startsWith("UPDATE email_log SET status = 'pending'") && values[3] === "student:reminder:rem-race:0") {
        db.prepare("UPDATE email_log SET status = 'pending',send_claim_id='other',send_claim_until='2026-09-05T10:10:00.000Z' WHERE dedupe_key = ?").run(values[3]);
      }
    };
    await sweep();
    await sweep();
    beforeRun = null;

    const [meet, ...meetMore] = remindersFor("rem-meet");
    assert.equal(meetMore.length, 0, "once");
    assert.equal(meet.subject, "Your lesson is coming up — Tue 3 Nov, 09:00");
    for (const part of ["09:00 · Los Angeles time", "Join Google Meet: https://meet.google.com/abc-defg-hij", "Change or cancel this lesson: https://lesson.example/book/?manage=",
      "Free to change or cancel until Mon 2 Nov, 19:00. After that, there’s a €5 late change fee."]) {
      assert.ok(meet.text.includes(part), part);
    }
    assert.ok(meet.text.indexOf("Join Google Meet") < meet.text.indexOf("Change or cancel this lesson"), "joining is the button, changing the quiet link");
    assert.ok(meet.html.includes("text-decoration:underline\">Change or cancel this lesson</a>"));
    assert.equal(meet.attachments, undefined);
    assert.ok(db.prepare("SELECT meeting_notified_at FROM bookings WHERE id='rem-meet'").get().meeting_notified_at, "the link was delivered, so no second link email");

    const [coming, ...comingMore] = remindersFor("rem-nolink");
    assert.equal(comingMore.length, 0);
    assert.ok(coming.text.includes("Its Google Meet link isn’t ready yet; we’ll email it to you as soon as it is."));
    assert.equal(coming.text.match(/Change or cancel this lesson/g).length, 1, "the button, with no quiet link beside it");
    assert.ok(!coming.text.includes("Join Google Meet"));
    // A lesson moved since is a new version, reminded at its own time.
    db.prepare("UPDATE bookings SET sequence = 1 WHERE id = 'rem-nolink'").run();
    await sweep();
    assert.equal(remindersFor("rem-nolink").length, 2);

    const [porto, ...portoMore] = remindersFor("rem-retry");
    assert.equal(portoMore.length, 0);
    for (const part of ["Where: In Porto", "15:00 · Porto time", "Free to change or cancel until Tue 3 Nov, 01:00. After that, it can’t be changed or refunded."]) assert.ok(porto.text.includes(part), part);
    assert.equal(porto.text.match(/Change or cancel this lesson/g).length, 1);
    assert.ok(!porto.text.includes("Google Meet"));
    assert.equal(db.prepare("SELECT status FROM email_log WHERE dedupe_key='student:reminder:rem-retry:2'").get().status, "sent");

    assert.equal(remindersFor("rem-race").length, 0);
    assert.equal(db.prepare("SELECT meeting_notified_at FROM bookings WHERE id='rem-race'").get().meeting_notified_at, null, "a reminder that did not go does not mark the link sent");
    for (const id of ["rem-cancelled", "rem-fresh", "rem-moved", "rem-series", "rem-recent", "rem-near", "rem-far", "rem-noemail"]) assert.equal(remindersFor(id).length, 0, id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id = 'rem-noemail'").get().n, 0);
    assert.ok(!sentEmails.some((sent) => sent.to[0].startsWith("no-email:") || sent.to[0] === "ines@example.invalid"), "nothing to the placeholder, and no copy for Inês");

    // A lesson cancelled or moved between selecting it and sending is left alone.
    lesson("rem-gone", "2026-11-03T10:00:00.000Z");
    lesson("rem-shifted", "2026-11-03T10:30:00.000Z");
    DB.prepare = (sql) => {
      const statement = realPrepare(sql);
      if (sql === "SELECT * FROM bookings WHERE id = ?") {
        const read = statement.first;
        statement.first = () => {
          db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = 'rem-gone'").run();
          db.prepare("UPDATE bookings SET sequence = 1, starts_at = '2026-11-04T10:00:00.000Z' WHERE id = 'rem-shifted'").run();
          return read();
        };
      }
      return statement;
    };
    await sweep();
    DB.prepare = realPrepare;
    assert.equal(remindersFor("rem-gone").length + remindersFor("rem-shifted").length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id IN ('rem-gone','rem-shifted')").get().n, 0);
  } finally {
    emailUnavailable = false;
    DB.prepare = realPrepare;
    beforeRun = null;
    for (const key of Object.keys(google)) delete env[key];
    Object.assign(env, { TEACHER_NOTIFICATIONS_ENABLED: "0" });
    delete env.TEACHER_EMAIL;
    releaseEmail();
  }
});
const bookedEmailFor = (reference) => sentEmails.find((sent) => sent.subject.startsWith("Inês has booked your Portuguese lesson") && sent.text.includes(`Reference: ${reference}`));
await test("Inês booking an address someone registered first shuts that registrant out and lets the mailbox's owner in", async () => {
  const ip = { "CF-Connecting-IP": "198.51.100.61" };
  const email = "squatted@example.invalid";
  const resetLinks = () => sentEmails.filter((sent) => sent.to[0] === email && sent.subject.startsWith("Reset your password"))
    .map((sent) => decodeURIComponent(/reset-password\/\?token=(\S+)/.exec(sent.text)[1]));
  captureEmail();
  try {
    const registered = await call("/auth/register", { user: null, headers: ip, body: { email, name: "First Registrant", password: "registrant-password" } });
    assert.equal(registered.status, 201, await registered.clone().text());
    const squatter = await registered.json();
    const id = squatter.student.id;
    assert.equal(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(id).email_verified_at, null, "registering proves nothing");
    assert.equal((await call("/me/email", { token: squatter.session, body: { email: "registrant-elsewhere@example.invalid" } })).status, 200);
    assert.equal((await call("/auth/forgot", { user: null, headers: ip, body: { email } })).status, 200);
    await drain();
    const [earlierReset] = resetLinks();

    const first = await call("/admin/bookings", { user: "teacher", body: { email, lessonType: "single", startAt: "2026-12-07T10:00:00.000Z" } });
    assert.equal(first.status, 201, await first.clone().text());
    const { booking: lesson } = await first.json();
    await drain();
    assert.equal((await call("/me", { method: "GET", token: squatter.session })).status, 401, "the registrant's session is gone");
    assert.equal((await call("/auth/login", { user: null, headers: ip, body: { email, password: "registrant-password" } })).status, 401, "and so is their password");
    assert.deepEqual({ ...db.prepare("SELECT password_hash, session_version, email_verified_at FROM students WHERE id=?").get(id) },
      { password_hash: "", session_version: 1, email_verified_at: null });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_changes WHERE student_id=?").get(id).n, 0, "their pending address change went too");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id=?").get(id).n, 0);
    assert.equal((await call("/auth/reset", { user: null, headers: ip, body: { token: earlierReset, password: "an-earlier-link" } })).status, 400);
    const welcomeLink = signInLinkIn(bookedEmailFor(lesson.reference));
    assert.ok(welcomeLink, "the confirmation carries a way in");

    // The mailbox's owner chooses a new password from the link sent to it.
    assert.equal((await call("/auth/forgot", { user: null, headers: ip, body: { email } })).status, 200);
    await drain();
    const reset = await call("/auth/reset", { user: null, headers: ip, body: { token: resetLinks().at(-1), password: "the-owners-password" } });
    assert.equal(reset.status, 200, await reset.clone().text());
    const owner = await reset.json();
    assert.ok(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(id).email_verified_at, "a completed reset proves the address");
    const mine = await call("/me", { method: "GET", token: owner.session });
    assert.equal(mine.status, 200);
    assert.ok((await mine.json()).bookings.some((row) => row.reference === lesson.reference && row.manageToken));

    // Proven now, so her next booking leaves the owner's password, session and requests alone.
    assert.equal((await call("/me/email", { token: owner.session, body: { email: "owner-elsewhere@example.invalid" } })).status, 200);
    sentEmails.length = 0;
    const second = await call("/admin/bookings", { user: "teacher", body: { email, lessonType: "single", startAt: "2026-12-08T10:00:00.000Z" } });
    assert.equal(second.status, 201, await second.clone().text());
    const { booking: next } = await second.json();
    await drain();
    assert.equal((await call("/me", { method: "GET", token: owner.session })).status, 200);
    assert.equal((await call("/auth/login", { user: null, headers: ip, body: { email, password: "the-owners-password" } })).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_changes WHERE student_id=?").get(id).n, 1, "the owner's own request stays");
    assert.ok(bookedEmailFor(next.reference), "the owner is told about the next lesson too");
    // Choosing a new password retired the sign-in link in the first email.
    assert.equal((await call("/auth/email-link/confirm", { user: null, headers: ip, body: { token: welcomeLink } })).status, 400);
    // A fresh one signs the owner in, once, and leaves their password alone.
    const fresh = signInLinkIn(bookedEmailFor(next.reference));
    const signedIn = await call("/auth/email-link/confirm", { user: null, headers: ip, body: { token: fresh } });
    assert.equal(signedIn.status, 200, await signedIn.clone().text());
    assert.equal((await call("/auth/email-link/confirm", { user: null, headers: ip, body: { token: fresh } })).status, 400, "only once");
    assert.equal((await call("/auth/login", { user: null, headers: ip, body: { email, password: "the-owners-password" } })).status, 200,
      "a proven account keeps its password when a link signs it in");
  } finally {
    releaseEmail();
  }
});
await test("a Google-verified account keeps its sessions and password when Inês books for it", async () => {
  const ip = { "CF-Connecting-IP": "198.51.100.62" };
  const credential = await googleCredential({ sub: "google-booked", email: "google-booked@example.invalid", name: "Gloria Google" });
  const signedIn = await call("/auth/google", { user: null, headers: ip, body: { credential } });
  assert.equal(signedIn.status, 200, await signedIn.clone().text());
  const { student: account, session } = await signedIn.json();
  assert.ok(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(account.id).email_verified_at, "a new Google account is proven");
  // An account linked before proof was recorded is marked by its next sign-in.
  db.prepare("UPDATE students SET email_verified_at=NULL WHERE id=?").run(account.id);
  assert.equal((await call("/auth/google", { user: null, headers: ip, body: { credential } })).status, 200);
  assert.ok(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(account.id).email_verified_at, "a later sign-in proves it again");
  // A password added later, as a reset would, is protected by that proof.
  db.prepare("UPDATE students SET password_hash=? WHERE id=?").run(await hashPassword("google-then-password"), account.id);
  const before = { ...db.prepare("SELECT password_hash, session_version FROM students WHERE id=?").get(account.id) };
  captureEmail();
  try {
    const booked = await call("/admin/bookings", { user: "teacher", body: { email: "google-booked@example.invalid", lessonType: "single", startAt: "2026-12-14T10:00:00.000Z" } });
    assert.equal(booked.status, 201, await booked.clone().text());
    const { booking: lesson } = await booked.json();
    await drain();
    assert.ok(bookedEmailFor(lesson.reference), "they are told about the lesson");
  } finally {
    releaseEmail();
  }
  assert.deepEqual({ ...db.prepare("SELECT password_hash, session_version FROM students WHERE id=?").get(account.id) }, before);
  assert.equal((await call("/me", { method: "GET", token: session })).status, 200);
  assert.equal((await call("/auth/login", { user: null, headers: ip, body: { email: "google-booked@example.invalid", password: "google-then-password" } })).status, 200);
});
await test("a confirmed address change proves the new address, so Inês's booking for it changes nothing", async () => {
  const registered = await call("/auth/register", { user: null, headers: { "CF-Connecting-IP": "198.51.100.64" }, body: { email: "moving-from@example.invalid", name: "Mo Ving", password: "moving-password" } });
  assert.equal(registered.status, 201, await registered.clone().text());
  const { student: account, session } = await registered.json();
  // A lesson that has ended is still to be charged, so its receipt follows them.
  booking("moving-past", { owner: account.id, start: "2026-09-05T07:00:00.000Z", end: "2026-09-05T08:00:00.000Z" });
  captureEmail();
  try {
    assert.equal((await call("/me/email", { token: session, body: { email: "moving-to@example.invalid" } })).status, 200);
    await drain();
    const link = sentEmails.find((sent) => sent.to[0] === "moving-to@example.invalid");
    const confirmed = await call("/me/email/confirm", { token: session, body: { token: decodeURIComponent(/emailToken=(\S+)/.exec(link.text)[1]) } });
    assert.equal(confirmed.status, 200, await confirmed.clone().text());
    const moved = await confirmed.json();
    assert.ok(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(account.id).email_verified_at, "the new address proved itself");
    assert.equal(db.prepare("SELECT student_email FROM bookings WHERE id='moving-past'").get().student_email, "moving-to@example.invalid");
    const booked = await call("/admin/bookings", { user: "teacher", body: { email: "moving-to@example.invalid", lessonType: "single", startAt: "2026-12-15T10:00:00.000Z" } });
    assert.equal(booked.status, 201, await booked.clone().text());
    await drain();
    assert.ok(bookedEmailFor((await booked.json()).booking.reference), "they are told about the lesson");
    assert.equal((await call("/me", { method: "GET", token: moved.session })).status, 200);
  } finally {
    releaseEmail();
  }
});
await test("Inês's bookings never alter a password-less account she created, or a teacher's account", async () => {
  const email = "no-password@example.invalid";
  captureEmail();
  try {
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { email, name: "Nadia Nopass", lessonType: "single", startAt: "2026-12-09T10:00:00.000Z" } })).status, 404, "no loose lessons");
    assert.equal((await call("/admin/students", { user: "teacher", body: { email, name: "Nadia Nopass" } })).status, 201);
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { email, lessonType: "single", startAt: "2026-12-09T10:00:00.000Z" } })).status, 201);
    const created = db.prepare("SELECT * FROM students WHERE email=?").get(email);
    assert.equal(created.password_hash, "");
    assert.equal(created.email_verified_at, null);
    // Choosing a first password is under way when she books again.
    db.prepare("INSERT INTO password_resets (nonce, student_id, created_at) VALUES ('first-password', ?, ?)").run(created.id, new Date().toISOString());
    const session = await createSession(created.id, env.BOOKING_TOKEN_SECRET);
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { email, lessonType: "single", startAt: "2026-12-10T10:00:00.000Z" } })).status, 201);
    assert.deepEqual({ ...db.prepare("SELECT password_hash, session_version, email_verified_at FROM students WHERE id=?").get(created.id) },
      { password_hash: "", session_version: 0, email_verified_at: null });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id=?").get(created.id).n, 1, "the reset under way survives");
    assert.equal((await call("/me", { method: "GET", token: session })).status, 200);

    // Her own account, even holding a password, no recorded proof and a reset under way.
    db.prepare("UPDATE students SET password_hash='pbkdf2$kept-by-the-teacher' WHERE id='teacher'").run();
    db.prepare("INSERT INTO password_resets (nonce, student_id, created_at) VALUES ('teacher-reset', 'teacher', ?)").run(new Date().toISOString());
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { email: "teacher@example.invalid", lessonType: "single", startAt: "2026-12-11T10:00:00.000Z" } })).status, 201);
    assert.deepEqual({ ...db.prepare("SELECT password_hash, session_version FROM students WHERE id='teacher'").get() },
      { password_hash: "pbkdf2$kept-by-the-teacher", session_version: 0 });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE student_id='teacher'").get().n, 1);
    assert.equal((await call("/admin/students", { method: "GET", user: "teacher" })).status, 200, "her session still works");
    await drain();
    const confirmations = sentEmails.filter((sent) => sent.subject.startsWith("Inês has booked your Portuguese lesson"));
    // The account she made hears nothing until she sends their welcome.
    assert.equal(confirmations.filter((sent) => sent.to[0] === email).length, 0);
    assert.equal(confirmations.length, 1);
    assert.ok(!confirmations.some((sent) => sent.to[0] === "teacher@example.invalid" && signInLinkIn(sent)), "a teacher is never sent a sign-in link");
  } finally {
    releaseEmail();
    db.prepare("UPDATE students SET password_hash='' WHERE id='teacher'").run();
    db.prepare("DELETE FROM password_resets WHERE nonce='teacher-reset'").run();
  }
});
await test("an address proven between Inês's read and the transition keeps its password and sessions", async () => {
  const registered = await call("/auth/register", { user: null, headers: { "CF-Connecting-IP": "198.51.100.65" }, body: { email: "proving@example.invalid", name: "Pro Ving", password: "proving-password" } });
  assert.equal(registered.status, 201, await registered.clone().text());
  const { student: account, session } = await registered.json();
  beforeRun = (sql) => {
    if (!sql.includes("SET password_hash = ''")) return;
    beforeRun = null;
    db.prepare("UPDATE students SET email_verified_at=? WHERE id=?").run(new Date().toISOString(), account.id);
  };
  captureEmail();
  try {
    const booked = await call("/admin/bookings", { user: "teacher", body: { email: "proving@example.invalid", lessonType: "single", startAt: "2026-12-16T10:00:00.000Z" } });
    assert.equal(booked.status, 201, await booked.clone().text());
    await drain();
    assert.ok(bookedEmailFor((await booked.json()).booking.reference), "they are told about the lesson");
  } finally {
    releaseEmail();
  }
  assert.equal(db.prepare("SELECT session_version FROM students WHERE id=?").get(account.id).session_version, 0);
  assert.equal((await call("/me", { method: "GET", token: session })).status, 200);
  assert.equal((await call("/auth/login", { user: null, headers: { "CF-Connecting-IP": "198.51.100.65" }, body: { email: "proving@example.invalid", password: "proving-password" } })).status, 200);
});

await test("availability and the weekly preview ignore a student's own unfinished card setup, and nobody else's", async () => {
  const user = await unsavedCardStudent("own-hold");
  const held = "2026-11-27T17:00:00.000Z";
  booking("own-hold-lesson", { owner: user, payment: "pending", start: held, end: "2026-11-27T18:00:00.000Z" });
  db.prepare("UPDATE bookings SET status='pending_payment', hold_expires_at='2026-09-05T10:35:00.000Z' WHERE id='own-hold-lesson'").run();
  booking("own-hold-confirmed", { owner: user, start: "2026-11-27T18:30:00.000Z", end: "2026-11-27T19:30:00.000Z" });
  const bearer = (value) => (value === undefined ? {} : { Authorization: `Bearer ${value}` });
  const availability = async (value) => {
    const response = await call("/availability?lessonType=single&from=2026-11-27&to=2026-11-27", { method: "GET", user: null, headers: bearer(value) });
    assert.equal(response.status, 200, "a bearer never turns availability into a refusal");
    return response.json();
  };
  const preview = async (value) => {
    const response = await call("/bookings/series/preview", { user: null, headers: bearer(value), body: { weeks: 4, lessonType: "single", startAt: held } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const offered = (body, at = held) => (body.slotsByDate["2026-11-27"] ?? []).map((slot) => slot.startAt).includes(at);
  try {
    const anonymous = await availability();
    assert.ok(!offered(anonymous), "held for everyone who is not its owner");
    const owners = await availability(sessions[user]);
    assert.ok(offered(owners), "its owner can choose that time again");
    assert.ok(!offered(owners, "2026-11-27T19:00:00.000Z"), "while their confirmed lesson still counts");
    assert.ok(!offered(await availability(sessions.outsider)), "another student still sees it held");

    const publicPreview = await preview();
    assert.ok(publicPreview.skipped.includes(held) && !publicPreview.bookable.includes(held));
    assert.ok((await preview(sessions[user])).bookable.includes(held));
    assert.ok((await preview(sessions.outsider)).skipped.includes(held));

    // Anything short of a valid session is an anonymous request, never a 401.
    const frozenNow = Date.now;
    Date.now = () => frozenNow() - 91 * 86400000;
    const expired = await createSession(user, env.BOOKING_TOKEN_SECRET).finally(() => { Date.now = frozenNow; });
    const revoked = await createSession(user, env.BOOKING_TOKEN_SECRET);
    assert.equal((await call("/auth/logout", { token: revoked, headers: { "CF-Connecting-IP": "198.51.100.63" } })).status, 200);
    const invalid = ["", "not-a-session", `${sessions[user]}x`, expired, revoked, await createSession(user, env.BOOKING_TOKEN_SECRET, 7)];
    for (const value of invalid) {
      assert.deepEqual(await availability(value), anonymous, `availability with ${JSON.stringify(value.slice(0, 12))}`);
      assert.deepEqual(await preview(value), publicPreview, `preview with ${JSON.stringify(value.slice(0, 12))}`);
    }
  } finally {
    db.prepare("DELETE FROM bookings WHERE id IN ('own-hold-lesson','own-hold-confirmed')").run();
  }
});

await test("two addresses in one IPv6 /64 share a registration budget, which the next /64 does not touch", async () => {
  const register = (ip, n) => call("/auth/register", {
    user: null, headers: { "CF-Connecting-IP": ip }, body: { email: `six-${n}@example.invalid`, name: "Six Tester", password: "a-long-password" }
  });
  const sameNetwork = ["2001:db8:6:4::1", "2001:0DB8:0006:0004:0000:0000:0000:0002", "2001:db8:6:4:ffff:ffff:ffff:fffe", "2001:db8:6:4::a", "2001:db8:6:4:1::"];
  const statuses = [];
  for (const [n, ip] of sameNetwork.entries()) statuses.push((await register(ip, n)).status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 201]);
  assert.equal((await register("2001:db8:6:4:abcd::99", 5)).status, 429, "a sixth address in the same /64 is over the budget");
  assert.equal(db.prepare("SELECT attempts FROM request_limits WHERE key='register:2001:db8:6:4::/64'").get().attempts, 5);
  assert.equal((await register("2001:db8:6:5::1", 6)).status, 201, "the neighbouring /64 has its own");
});

await test("a session presented as a manage link opens nothing, even a row keyed by what it signs", async () => {
  const session = await createSession("bob", env.BOOKING_TOKEN_SECRET);
  const signed = session.slice(0, session.lastIndexOf("."));
  // One key signs both, so the session verifies as a manage token for its own
  // payload; only a UUID booking id may be looked up.
  assert.equal(await readManageToken(session, env.BOOKING_TOKEN_SECRET), signed);
  booking(signed, { owner: "bob", start: "2026-12-02T10:00:00.000Z", end: "2026-12-02T11:00:00.000Z" });
  try {
    for (const [suffix, method, body] of [["", "GET"], ["/reschedule", "POST", { startAt: "2026-12-02T12:00:00.000Z" }], ["/cancel", "POST", {}], ["/payment", "POST", { purpose: "lesson" }]]) {
      const viaSession = await call(`/bookings/${session}${suffix}`, { method, body, user: null });
      const viaUnknown = await call(`/bookings/${await token(crypto.randomUUID())}${suffix}`, { method, body, user: null });
      assert.equal(viaSession.status, 404, suffix || "GET");
      assert.equal(viaUnknown.status, 404);
      assert.deepEqual(await viaSession.json(), await viaUnknown.json());
    }
    assert.deepEqual({ ...db.prepare("SELECT status, starts_at FROM bookings WHERE id=?").get(signed) }, { status: "confirmed", starts_at: "2026-12-02T10:00:00.000Z" });
  } finally {
    db.prepare("DELETE FROM bookings WHERE id=?").run(signed);
  }
});
await test("Inês can record a no-show until an hour after the lesson ends, and no lesson is charged before then", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  // It is 10:00: one lesson ended 59 minutes ago, one 61 minutes ago, one 55 minutes ago.
  booking("absent-in-time", { start: "2026-09-05T08:01:00.000Z", end: "2026-09-05T09:01:00.000Z" });
  booking("absent-too-late", { start: "2026-09-05T07:59:00.000Z", end: "2026-09-05T08:59:00.000Z" });
  booking("attended-recently", { start: "2026-09-05T08:05:00.000Z", end: "2026-09-05T09:05:00.000Z" });
  const mark = (id, noShow = true) => call(`/admin/bookings/${id}/no-show`, { user: "teacher", body: { noShow } });
  const charged = (id) => charges.filter((charge) => charge.key.includes(`:${id}:`)).map((charge) => charge.amount);
  const status = (id) => db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(id).payment_status;

  const inTime = await mark("absent-in-time");
  assert.equal(inTime.status, 200, await inTime.clone().text());
  assert.equal((await mark("absent-in-time", false)).status, 200, "and it can be undone");
  assert.equal((await mark("absent-in-time")).status, 200);
  const tooLate = await mark("absent-too-late");
  assert.equal(tooLate.status, 409);
  assert.match(await tooLate.text(), /until an hour after the lesson ends/);
  assert.equal(db.prepare("SELECT attendance_status FROM bookings WHERE id='absent-too-late'").get().attendance_status, "expected");

  await chargeDueLessons(env);
  await chargeDueLessons(env, new Date("2026-09-05T10:00:59.999Z"));
  assert.deepEqual(charged("absent-in-time"), [], "nothing is attempted while the no-show can still change");
  assert.deepEqual(charged("attended-recently"), []);
  assert.deepEqual([status("absent-in-time"), status("attended-recently")], ["scheduled", "scheduled"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id IN ('absent-in-time','attended-recently')").get().n, 0, "no receipt or payment email yet");
  assert.deepEqual(charged("absent-too-late"), [1500], "an unmarked lesson whose window has closed is charged the full price");

  await chargeDueLessons(env, new Date("2026-09-05T10:01:00.000Z"));
  assert.deepEqual(charged("absent-in-time"), [500], "the no-show fee, once its window closes");
  assert.equal(status("absent-in-time"), "paid");
  assert.equal((await mark("absent-in-time", false)).status, 409, "and attendance is settled with it");
  await chargeDueLessons(env, new Date("2026-09-05T10:04:59.999Z"));
  assert.deepEqual(charged("attended-recently"), []);
  await chargeDueLessons(env, new Date("2026-09-05T10:05:00.000Z"));
  assert.deepEqual(charged("attended-recently"), [1500]);

  booking("absent-move", { start: "2026-09-05T09:05:00.000Z", end: "2026-09-05T10:05:00.000Z" });
  assert.equal((await mark("absent-move")).status, 200);
  const attendance = (id) => ({ ...db.prepare("SELECT attendance_status,no_show_marked_at FROM bookings WHERE id=?").get(id) });
  const marked = attendance("absent-move");
  const move = (id, startAt) => call(`/admin/bookings/${id}/reschedule`, { user: "teacher", body: { startAt } });
  const unchanged = await move("absent-move", "2026-09-05T09:05:00.000Z");
  assert.equal(unchanged.status, 200, await unchanged.clone().text());
  assert.deepEqual(attendance("absent-move"), marked, "saving the same time preserves attendance");
  const moved = await move("absent-move", "2027-02-10T10:00:00.000Z");
  assert.equal(moved.status, 200, await moved.clone().text());
  assert.deepEqual(attendance("absent-move"), { attendance_status: "expected", no_show_marked_at: null }, "the new lesson time starts with expected attendance");
  assert.deepEqual({ ...db.prepare("SELECT payment_status,amount_cents FROM bookings WHERE id='absent-move'").get() }, { payment_status: "scheduled", amount_cents: 1500 }, "its full price remains to be charged");

  const committed = attendance("absent-in-time");
  assert.equal((await move("absent-in-time", "2027-02-11T10:00:00.000Z")).status, 200);
  assert.deepEqual(attendance("absent-in-time"), committed, "attendance already charged keeps its payment evidence");
  assert.equal(db.prepare("SELECT charged_cents FROM bookings WHERE id='absent-in-time'").get().charged_cents, 500);

  booking("absent-move-race", { start: "2026-09-05T09:05:00.000Z", end: "2026-09-05T10:05:00.000Z" });
  beforeRun = sql => {
    if (!sql.startsWith("UPDATE bookings SET attendance_status")) return;
    beforeRun = null;
    db.prepare("UPDATE bookings SET starts_at='2027-02-12T10:00:00.000Z',ends_at='2027-02-12T11:00:00.000Z',sequence=sequence+1 WHERE id='absent-move-race'").run();
  };
  assert.equal((await mark("absent-move-race")).status, 409, "an attendance request that loses a move race is rejected");
  assert.deepEqual(attendance("absent-move-race"), { attendance_status: "expected", no_show_marked_at: null });

  booking("absent-zero", { start: "2026-09-05T08:01:00.000Z", end: "2026-09-05T09:01:00.000Z" });
  assert.equal((await mark("absent-zero")).status, 200);
  try {
    const configured = await call("/admin/settings", { user: "teacher", body: { settings: { same_day_change_fee_cents: 0 } } });
    assert.equal(configured.status, 200);
    booking("action-zero", { payment: "not_required" });
    db.prepare("UPDATE bookings SET same_day_change=1,same_day_fee_status='scheduled',same_day_fee_cents=0 WHERE id='action-zero'").run();
    const checkouts = checkoutRequests.length;
    await chargeDueLessons(env, new Date("2026-09-05T10:01:00.000Z"));
    await chargeDueSameDayFees(env);
    assert.deepEqual({ ...db.prepare("SELECT payment_status,amount_cents,charged_cents,charge_request FROM bookings WHERE id='absent-zero'").get() },
      { payment_status: "free", amount_cents: 1500, charged_cents: 0, charge_request: null }, "a zero no-show fee leaves nothing to collect, and keeps the booked price on record");
    assert.deepEqual(charged("absent-zero"), []);
    assert.deepEqual(charged("action-zero"), []);
    assert.deepEqual({ ...db.prepare("SELECT same_day_fee_status,same_day_change,same_day_fee_request FROM bookings WHERE id='action-zero'").get() },
      { same_day_fee_status: "not_required", same_day_change: 0, same_day_fee_request: null });
    assert.equal(checkoutRequests.length, checkouts);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id IN ('absent-zero','action-zero')").get().n, 0);
  } finally {
    db.prepare("INSERT OR REPLACE INTO settings VALUES ('same_day_change_fee_cents','500')").run();
  }
});
await test("signing up again with a registered address says so, whatever its case, and makes no second account", async () => {
  // Deliberate (Dan, 24 September 2026): telling a returning student to sign
  // in beats hiding whether the address is registered. See docs-booking-system.md.
  const ip = { "CF-Connecting-IP": "198.51.100.70" };
  const first = await call("/auth/register", { user: null, headers: ip, body: { email: "returning@example.invalid", name: "Rita Returning", password: "first-password" } });
  assert.equal(first.status, 201, await first.clone().text());
  const again = await call("/auth/register", { user: null, headers: ip, body: { email: "  Returning@Example.INVALID ", name: "Rita Again", password: "second-password" } });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error, "There is already an account with that email. Try signing in instead.");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM students WHERE email='returning@example.invalid'").get().n, 1);
  assert.equal((await call("/auth/login", { user: null, headers: ip, body: { email: "returning@example.invalid", password: "second-password" } })).status, 401, "the second password was never set");
  assert.equal((await call("/auth/login", { user: null, headers: ip, body: { email: "returning@example.invalid", password: "first-password" } })).status, 200);
});
await test("independent profile saves preserve each other in either completion order", async () => {
  for (const fields of [
    [{ name: "Updated name" }, { nif: "123456789" }],
    [{ nif: "123456789" }, { name: "Updated name" }],
    [{ phone: "+351 910000000" }, { timezone: "America/New_York" }],
    [{ timezone: "America/New_York" }, { phone: "+351 910000000" }]
  ]) {
    db.prepare("UPDATE students SET name='Original name', nif='', phone='', timezone='Europe/Lisbon' WHERE id='alice'").run();
    const replies = await Promise.all(fields.map(body => call("/me", { body })));
    for (const response of replies) assert.equal(response.status, 200, await response.clone().text());
    const saved = (await (await call("/me", { method: "GET" })).json()).student;
    for (const patch of fields) for (const [field, value] of Object.entries(patch)) {
      assert.equal(saved[field], value, `a concurrent save must preserve ${field}`);
    }
  }
});
await test("parallel first Google sign-ins return the same verified account without losing a callback", async () => {
  const credential = await googleCredential({ sub: "parallel-first-google", email: "parallel-google@example.invalid", name: "Parallel Google" });
  const replies = await Promise.all([0, 1].map(() => call("/auth/google", { user: null, body: { credential } })));
  for (const response of replies) assert.equal(response.status, 200, await response.clone().text());
  const students = await Promise.all(replies.map(response => response.json()));
  assert.equal(students[0].student.id, students[1].student.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM students WHERE email='parallel-google@example.invalid'").get().n, 1);
});
await test("Google sign-in recovers an account claimed after its lookup without overwriting another identity", async () => {
  const credential = await googleCredential({ sub: "google-insert-race", email: "google-insert-race@example.invalid", name: "Google Race" });
  const winner = crypto.randomUUID();
  beforeRun = (sql, values) => {
    if (!/^\s*INSERT INTO students/.test(sql) || !sql.includes("google_sub")) return;
    beforeRun = null;
    db.prepare(sql).run(winner, ...values.slice(1));
  };
  const response = await call("/auth/google", { user: null, body: { credential } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).student.id, winner);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM students WHERE email='google-insert-race@example.invalid'").get().n, 1);
});
await test("parallel sign-ups for one address create one account and offer the loser sign-in", async () => {
  const body = { email: "parallel-signup@example.invalid", name: "Parallel Student", password: "parallel-password" };
  const replies = await Promise.all([0, 1].map(() => call("/auth/register", {
    user: null, headers: { "CF-Connecting-IP": "198.51.100.71" }, body
  })));
  assert.deepEqual(replies.map(response => response.status).sort(), [201, 409]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM students WHERE email=?").get(body.email).n, 1);
});
await test("a Google creation race still applies ownership rules to the winning account", async () => {
  for (const kind of ["password", "different-google"]) {
    const id = crypto.randomUUID(), email = `google-winner-${kind}@example.invalid`;
    const password = await hashPassword("winner-password");
    const priorSession = await createSession(id, env.BOOKING_TOKEN_SECRET, 3);
    const credential = await googleCredential({ sub: `google-winner-${kind}`, email });
    beforeRun = (sql) => {
      if (!/^\s*INSERT INTO students/.test(sql) || !sql.includes("google_sub")) return;
      beforeRun = null;
      db.prepare("INSERT INTO students (id,email,name,password_hash,google_sub,session_version,created_at) VALUES (?,?,?,?,?,3,?)")
        .run(id, email, "Winning Student", password, kind === "different-google" ? "another-google-owner" : null, new Date().toISOString());
    };
    const response = await call("/auth/google", { user: null, body: { credential } });
    const saved = db.prepare("SELECT * FROM students WHERE id=?").get(id);
    if (kind === "password") {
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await response.json()).student.id, id);
      assert.equal(saved.password_hash, "");
      assert.equal(saved.session_version, 4);
      assert.equal((await call("/me", { method: "GET", user: null, headers: { Authorization: `Bearer ${priorSession}` } })).status, 401);
    } else {
      assert.equal(response.status, 409);
      assert.equal(saved.google_sub, "another-google-owner");
      assert.equal(saved.password_hash, password);
      assert.equal(saved.session_version, 3);
    }
  }
});
await test("a weekly move across spring's missing hour changes nothing and permits a valid retry", async () => {
  const now = new Date().toISOString();
  const rule = db.prepare("INSERT INTO availability_rules (weekday,start_minute,last_start_minute) VALUES (0,0,180)").run().lastInsertRowid;
  db.prepare("INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,created_at,updated_at) VALUES ('spring-move','alice','single',0,600,?,?)").run(now, now);
  for (const day of [21, 28]) booking(`spring-move-${day}`, { series: "spring-move", start: `2027-03-${day}T10:00:00.000Z`, end: `2027-03-${day}T11:00:00.000Z` });
  const rows = () => db.prepare("SELECT starts_at,ends_at,sequence FROM bookings WHERE series_id='spring-move' ORDER BY starts_at").all();
  try {
    const before = rows();
    const failed = await call("/series/spring-move/reschedule", { body: { startAt: "2027-03-21T01:30:00.000Z" } });
    assert.equal(failed.status, 409, await failed.clone().text());
    assert.match((await failed.json()).error, /clock-change day/);
    assert.deepEqual(rows(), before, "no occurrence changes when a later week names a missing time");
    const retried = await call("/series/spring-move/reschedule", { body: { startAt: "2027-03-21T02:30:00.000Z" } });
    assert.equal(retried.status, 200, await retried.clone().text());
    assert.equal((await retried.json()).moved, 2);
    assert.deepEqual(rows().map(row => row.starts_at), ["2027-03-21T02:30:00.000Z", "2027-03-28T01:30:00.000Z"]);
  } finally {
    db.prepare("DELETE FROM bookings WHERE series_id='spring-move'").run();
    db.prepare("DELETE FROM booking_series WHERE id='spring-move'").run();
    db.prepare("DELETE FROM availability_rules WHERE id=?").run(rule);
  }
});
// --- Bringing Inês's students in (12 October 2026) -------------------------
function forgetStudent(email) {
  const row = db.prepare("SELECT id FROM students WHERE email=?").get(email);
  if (!row) return;
  db.prepare("DELETE FROM bookings WHERE student_id=?").run(row.id);
  db.prepare("DELETE FROM booking_series WHERE student_id=?").run(row.id);
  db.prepare("DELETE FROM sign_in_links WHERE student_id=?").run(row.id);
  db.prepare("DELETE FROM student_recurring_rates WHERE student_id=?").run(row.id);
  db.prepare("DELETE FROM students WHERE id=?").run(row.id);
}
await test("Inês's weekly slot books outside her hours, skips her days off, and waits for the student's card", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const email = "weekly-added@example.invalid";
  const dayOff = db.prepare("INSERT INTO availability_exceptions (date,kind,start_minute,end_minute,note,created_at) VALUES ('2026-10-21','blocked',NULL,NULL,'',?)")
    .run(new Date().toISOString()).lastInsertRowid;
  captureEmail();
  try {
    const at = "2026-10-07T02:00:00.000Z"; // 03:00 in Porto, hours before she teaches
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { email, lessonType: "single", startAt: at, repeat: 5 } })).status, 400);
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { email, lessonType: "trial", startAt: at, repeat: 4 } })).status, 400);
    assert.equal((await call("/admin/bookings", { user: "alice", body: { email, lessonType: "single", startAt: at, repeat: 4 } })).status, 401);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_email=?").get(email).n, 0, "nothing is booked by a refusal");

    // Someone she already had before setting students up quietly, so the run is emailed.
    db.prepare("INSERT INTO students (id,email,name,password_hash,created_at) VALUES ('wendy',?,'Wendy Weekly','',?)").run(email, new Date().toISOString());
    const added = await call("/admin/bookings", { user: "teacher", body: { email, name: "Wendy Weekly", lessonType: "single", startAt: at, repeat: 4, location: "porto" } });
    assert.equal(added.status, 201, await added.clone().text());
    const { series } = await added.json();
    assert.equal(series.booked, 3);
    assert.deepEqual(series.skipped.map((week) => week.key), ["2026-10-21"]);
    const rows = db.prepare("SELECT * FROM bookings WHERE student_email=? ORDER BY starts_at").all(email);
    assert.deepEqual(rows.map((row) => row.starts_at), ["2026-10-07T02:00:00.000Z", "2026-10-14T02:00:00.000Z", "2026-10-28T03:00:00.000Z"],
      "the Porto time holds across the clock change");
    for (const row of rows) {
      assert.deepEqual([row.added_by_teacher, row.payment_status, row.amount_cents, row.location, row.series_id],
        [1, "not_required", 2500, "porto", rows[0].series_id]);
    }
    const recipe = db.prepare("SELECT * FROM booking_series WHERE id=?").get(rows[0].series_id);
    assert.deepEqual([recipe.added_by_teacher, recipe.automatic_payment, recipe.occurrences], [1, 0, 4]);
    await drain();
    const sent = sentEmails.filter((mail) => mail.to[0] === email);
    assert.equal(sent.length, 1, "one email for the whole run");
    assert.match(sent[0].subject, /^Inês has booked your weekly Portuguese lessons/);
    assert.match(sent[0].text, /add your card/);
    assert.ok(signInLinkIn(sent[0]), "with a way in");
  } finally {
    releaseEmail();
    db.prepare("DELETE FROM availability_exceptions WHERE id=?").run(dayOff);
    forgetStudent(email);
  }
});
await test("the nightly top-up keeps Inês's weekly slot hers, outside her hours", async () => {
  const email = "topped-up@example.invalid";
  try {
    await call("/admin/students", { user: "teacher", body: { email, name: "Tomás Top" } });
    const added = await call("/admin/bookings", { user: "teacher", body: { email, name: "Tomás Top", lessonType: "single", startAt: "2026-09-08T03:00:00.000Z", repeat: "open" } });
    assert.equal(added.status, 201, await added.clone().text());
    const { id } = db.prepare("SELECT id FROM students WHERE email=?").get(email);
    const { series_id: seriesId } = db.prepare("SELECT series_id FROM bookings WHERE student_id=? LIMIT 1").get(id);
    // Take the last week back, as if the run had only reached the week before.
    const last = db.prepare("SELECT id, starts_at FROM bookings WHERE series_id=? ORDER BY starts_at DESC LIMIT 1").get(seriesId);
    db.prepare("DELETE FROM bookings WHERE id=?").run(last.id);
    const filledTo = db.prepare("SELECT filled_to FROM booking_series WHERE id=?").get(seriesId).filled_to;
    const previous = new Date(Date.parse(`${filledTo}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
    db.prepare("UPDATE booking_series SET filled_to=? WHERE id=?").run(previous, seriesId);
    // The same tick sends the day-before reminder: 14 to 24 hours ahead of the frozen clock.
    booking("tick-reminder", { start: "2026-09-06T00:10:00.000Z", end: "2026-09-06T01:10:00.000Z" });
    db.prepare("UPDATE bookings SET created_at='2026-09-01T00:00:00.000Z' WHERE id='tick-reminder'").run();
    // Its cleanup keeps a current hourly limit and drops a day-old one.
    assert.ok(await takeRateLimit(env, "nightly-hour", 3, 3600));
    db.prepare("INSERT INTO request_limits VALUES ('nightly-stale', ?, 1)").run(Math.floor(Date.now() / 1000) - 90000);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.parse("2026-09-06T03:10:00.000Z") }, env, ctx);
    await drain();
    assert.deepEqual(db.prepare("SELECT key FROM request_limits WHERE key LIKE 'nightly-%'").all().map((row) => row.key), ["nightly-hour"]);
    assert.equal(db.prepare("SELECT status FROM email_log WHERE dedupe_key='student:reminder:tick-reminder:0'").get()?.status, "dry-run", "the minute tick sends it");
    const regrown = db.prepare("SELECT added_by_teacher, payment_status FROM bookings WHERE series_id=? AND starts_at=?").get(seriesId, last.starts_at);
    assert.deepEqual({ ...regrown }, { added_by_teacher: 1, payment_status: "not_required" }, "the week comes back as hers, at 04:00 Porto time");

    // A lower price can finish after the nightly read but before its INSERT.
    // Neither the stale lesson nor its bookmark may survive that lost claim.
    db.prepare("DELETE FROM bookings WHERE series_id=? AND starts_at=?").run(seriesId, last.starts_at);
    db.prepare("UPDATE booking_series SET filled_to=? WHERE id=?").run(previous, seriesId);
    let raced = false;
    beforeRun = (sql, values) => {
      if (!sql.startsWith("INSERT INTO bookings") || values[3] !== id) return;
      beforeRun = null; raced = true;
      db.prepare("INSERT INTO student_recurring_rates VALUES (?,60,0,?)").run(id, new Date().toISOString());
    };
    await worker.scheduled({ scheduledTime: Date.parse("2026-09-06T03:10:00.000Z") }, env, ctx);
    await drain();
    assert.equal(raced, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE series_id=? AND starts_at=?").get(seriesId, last.starts_at).n, 0);
    assert.equal(db.prepare("SELECT filled_to FROM booking_series WHERE id=?").get(seriesId).filled_to, previous, "a stale price cannot skip the week");
    await worker.scheduled({ scheduledTime: Date.parse("2026-09-06T03:10:00.000Z") }, env, ctx);
    await drain();
    const free = db.prepare("SELECT amount_cents, payment_status FROM bookings WHERE series_id=? AND starts_at=?").get(seriesId, last.starts_at);
    assert.deepEqual({ ...free }, { amount_cents: 0, payment_status: "free" }, "the next fill takes the current price");
  } finally {
    beforeRun = null;
    forgetStudent(email);
  }
});
await test("a saved card can authorise the named lesson and repeats without entering card details or charging early", async () => {
  const id = "saved-card-approval", email = `${id}@example.invalid`;
  student(id);
  db.prepare("UPDATE students SET email_verified_at=? WHERE id=?").run(new Date().toISOString(), id);
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const selected = linkedBooking("saved-card-today", { owner: id, payment: "not_required", start: "2026-09-01T17:00:00.000Z", end: "2026-09-01T18:00:00.000Z" });
  const otherPast = linkedBooking("saved-card-older", { owner: id, payment: "not_required", start: "2026-08-25T17:00:00.000Z", end: "2026-08-25T18:00:00.000Z" });
  db.prepare("UPDATE bookings SET added_by_teacher=1 WHERE student_id=?").run(id);
  const ownToken = await createSession(id, env.BOOKING_TOKEN_SECRET);
  const tokenHash = await sessionHash(ownToken);
  try {
    const added = await call("/admin/bookings", { user: "teacher", body: {
      email, name: "Saved Card Student", lessonType: "single", startAt: "2026-10-13T01:30:00.000Z", repeat: "open"
    } });
    assert.equal(added.status, 201, await added.clone().text());
    await drain();
    const preview = await (await call("/me/card/preview", { token: ownToken, body: { bookingId: selected } })).json();
    assert.ok(preview.savedCardKey);
    const body = { consent: true, bookingConsent: true, booking: preview.booking, savedCardKey: preview.savedCardKey };
    const setupCount = checkoutRequests.length, chargeCount = charges.length;
    assert.equal((await call("/me/card", { token: ownToken, body: { ...body, savedCardKey: "stale-card" } })).status, 409);
    for (const race of ["paid", "changed-card", "signed-out"]) {
      beforeRun = sql => {
        if (!sql.startsWith("UPDATE students SET card_consent_at = ?")) return;
        if (race === "paid") db.prepare("UPDATE bookings SET payment_consent_version='paid-by-hand' WHERE id=?").run(selected);
        if (race === "changed-card") db.prepare("UPDATE students SET stripe_payment_method='pm_replaced' WHERE id=?").run(id);
        if (race === "signed-out") db.prepare("INSERT INTO revoked_sessions (token_hash,expires_at) VALUES (?,?)").run(tokenHash, Date.now() + 86400000);
      };
      try { assert.equal((await call("/me/card", { token: ownToken, body })).status, 409, race); }
      finally { beforeRun = null; }
      assert.equal(db.prepare("SELECT card_consent_at FROM students WHERE id=?").get(id).card_consent_at, null);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=? AND payment_status='scheduled'").get(id).n, 0);
      db.prepare("UPDATE bookings SET payment_consent_version=NULL WHERE id=?").run(selected);
      db.prepare("UPDATE students SET stripe_payment_method=? WHERE id=?").run(`pm_${id}`, id);
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(tokenHash);
    }
    const consent = await call("/me/card", { token: ownToken, body });
    assert.equal(consent.status, 200, await consent.clone().text());
    assert.deepEqual(await consent.json(), { authorised: true });
    assert.equal(checkoutRequests.length, setupCount, "no new card form or setup session for a saved card");
    assert.equal(charges.length, chargeCount, "only the normal due-payment scheduler takes payment");
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(selected).payment_status, "scheduled");
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(otherPast).payment_status, "not_required");
    assert.equal(db.prepare("SELECT automatic_payment FROM booking_series WHERE student_id=?").get(id).automatic_payment, 1);
    assert.equal((await call("/me/card", { token: ownToken, body })).status, 409, "a repeat press cannot consent or charge twice");
  } finally { beforeRun = null; forgetStudent(email); }
});
await test("a prepared card link needs the student's approval and covers exactly one past lesson plus future repeats", async () => {
  const previousClock = clock;
  clock = NativeDate.parse("2026-10-27T18:30:00Z");
  const id = "combined-card", email = `${id}@example.invalid`;
  student(id);
  db.prepare("UPDATE students SET email_verified_at=? WHERE id=?").run(new Date().toISOString(), id);
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const selected = linkedBooking("combined-today", { owner: id, payment: "not_required", start: "2026-10-27T17:00:00.000Z", end: "2026-10-27T18:00:00.000Z" });
  const otherPast = linkedBooking("combined-older", { owner: id, payment: "not_required", start: "2026-10-20T17:00:00.000Z", end: "2026-10-20T18:00:00.000Z" });
  db.prepare("UPDATE bookings SET added_by_teacher=1 WHERE student_id=?").run(id);
  try {
    const series = await call("/admin/bookings", { user: "teacher", body: {
      email, name: "Combined Student", lessonType: "single", startAt: "2026-11-03T03:30:00.000Z", repeat: "open"
    } });
    assert.equal(series.status, 201, await series.clone().text());
    await drain();
    const emailCount = db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n;
    const stripeCount = checkoutRequests.length, chargeCount = charges.length;
    assert.equal((await call(`/admin/bookings/${selected}/card-link`)).status, 401);
    const prepared = await call(`/admin/bookings/${selected}/card-link`, { user: "teacher" });
    assert.equal(prepared.status, 200, await prepared.clone().text());
    const url = new URL((await prepared.json()).url);
    assert.equal(url.searchParams.get("cardBooking"), selected);
    assert.ok(url.searchParams.get("signin"));
    assert.equal(checkoutRequests.length, stripeCount, "creating a link does not even create a Stripe session");
    assert.equal(charges.length, chargeCount);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, emailCount, "no email sent or queued");
    assert.equal(db.prepare("SELECT card_consent_at FROM students WHERE id=?").get(id).card_consent_at, null);
    assert.equal((await call("/me/card/preview", { body: { bookingId: selected } })).status, 409, "another account cannot see the lesson");
    const login = await call("/auth/email-link/confirm", { user: null, body: { token: url.searchParams.get("signin") } });
    assert.equal(login.status, 200);
    const ownToken = (await login.json()).session;
    const preview = await call("/me/card/preview", { token: ownToken, body: { bookingId: selected } });
    assert.equal(preview.status, 200);
    const reviewed = (await preview.json()).booking;
    assert.equal(reviewed.amountCents, 1500);
    assert.equal((await call("/me/card", { token: ownToken, body: { booking: reviewed, bookingConsent: true } })).status, 400);
    assert.equal((await call("/me/card", { token: ownToken, body: { consent: true, booking: reviewed } })).status, 400);
    assert.equal((await call("/me/card", { token: ownToken, body: { consent: true, bookingConsent: true, booking: { ...reviewed, amountCents: 1 } } })).status, 409);
    assert.equal((await call("/me/card", { token: ownToken, body: { consent: true, bookingConsent: true, booking: reviewed } })).status, 200);
    const setup = new URLSearchParams(checkoutRequests.at(-1).body);
    const metadata = Object.fromEntries([...setup].filter(([key]) => key.startsWith("metadata[")).map(([key, value]) => [key.slice(9, -1), value]));
    assert.equal(setup.get("mode"), "setup");
    assert.equal(new URL(setup.get("cancel_url")).searchParams.get("cardBooking"), selected, "cancelling Stripe preserves the named lesson for retry");
    assert.equal(metadata.approved_booking_id, selected);
    assert.equal(metadata.approved_booking_amount, "1500");
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(selected).payment_status, "not_required");
    assert.equal(charges.length, chargeCount, "approval still waits for Stripe's completed card setup");
    setupIntents.set("seti_combined", { status: "succeeded", customer: `cus_${id}`, payment_method: "pm_combined" });
    const session = { id: "cs_combined", mode: "setup", status: "complete", created: Math.floor(Date.now() / 1000),
      client_reference_id: `student:${id}`, customer: `cus_${id}`, setup_intent: "seti_combined", metadata };
    const event = { id: "evt_combined", type: "checkout.session.completed", livemode: false, data: { object: session } };
    assert.equal((await webhook(event)).status, 200);
    assert.equal((await webhook(event)).status, 200);
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(selected).payment_status, "scheduled");
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(otherPast).payment_status, "not_required");
    assert.equal(db.prepare("SELECT automatic_payment FROM booking_series WHERE student_id=?").get(id).automatic_payment, 1);
    assert.equal(charges.length, chargeCount, "the webhook schedules; it does not take a payment");
    await chargeDueLessons(env, new Date("2026-10-27T18:59:59Z"));
    assert.equal(charges.filter(charge => charge.key.includes(selected)).length, 0, "the one-hour delay is preserved");
    await chargeDueLessons(env, new Date("2026-10-27T19:00:01Z"));
    await chargeDueLessons(env, new Date("2026-10-27T19:01:00Z"));
    assert.deepEqual(charges.filter(charge => charge.key.includes(selected)).map(charge => charge.amount), [1500], "exactly the authorised amount, once");

    for (const change of ["paid", "moved", "repriced", "cancelled"]) {
      const changedId = linkedBooking(`combined-${change}`, { owner: id, payment: "not_required", start: "2026-10-26T17:00:00.000Z", end: "2026-10-26T18:00:00.000Z" });
      db.prepare("UPDATE bookings SET added_by_teacher=1 WHERE id=?").run(changedId);
      const selectedChange = (await (await call("/me/card/preview", { token: ownToken, body: { bookingId: changedId } })).json()).booking;
      assert.equal((await call("/me/card", { token: ownToken, body: { consent: true, bookingConsent: true, booking: selectedChange } })).status, 200);
      const fields = new URLSearchParams(checkoutRequests.at(-1).body);
      const changedMetadata = Object.fromEntries([...fields].filter(([key]) => key.startsWith("metadata[")).map(([key, value]) => [key.slice(9, -1), value]));
      const mutation = { paid: "payment_consent_version='paid-by-hand'", moved: "starts_at='2026-10-26T16:00:00.000Z'", repriced: "amount_cents=2000", cancelled: "status='cancelled'" }[change];
      duringSetupRead = () => db.prepare(`UPDATE bookings SET ${mutation} WHERE id=?`).run(changedId);
      try {
        assert.equal((await webhook({ ...event, id: `evt_combined_${change}`, data: { object: { ...session, id: `cs_combined_${change}`, metadata: changedMetadata } } })).status, 200);
      } finally { duringSetupRead = null; }
      assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(changedId).payment_status, "not_required", `${change} while Stripe was open is never scheduled`);
    }
  } finally {
    duringSetupRead = null;
    forgetStudent(email);
    clock = previousClock;
  }
});
await test("a card saved from the account pays for the lessons Inês added from then on, and only those", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const email = "card-later@example.invalid";
  const add = (startAt, extra = {}) => call("/admin/bookings", { user: "teacher", body: { email, name: "Carla Later", lessonType: "single", startAt, ...extra } });
  // One of her students from before quiet onboarding, already emailed.
  db.prepare("INSERT INTO students (id,email,name,password_hash,created_at) VALUES ('card-later',?,'Carla Later','',?)").run(email, new Date().toISOString());
  try {
    assert.equal((await add("2026-09-01T09:00:00.000Z")).status, 201, "a lesson already had");
    assert.equal((await add("2026-10-02T02:00:00.000Z")).status, 201);
    assert.equal((await add("2026-10-03T02:00:00.000Z", { repeat: "open" })).status, 201);
    const { id } = db.prepare("SELECT id FROM students WHERE email=?").get(email);
    booking("card-later-own", { owner: id, payment: "not_required", start: "2026-10-05T02:00:00.000Z", end: "2026-10-05T03:00:00.000Z" });
    const token = await createSession(id, env.BOOKING_TOKEN_SECRET);
    const statusOf = (startAt) => db.prepare("SELECT payment_status FROM bookings WHERE student_id=? AND starts_at=?").get(id, startAt).payment_status;

    assert.equal((await call("/me/card", { token, body: { consent: true } })).status, 403, "an unproven address can't take on her lessons");
    // Signing in with the link from her email proves it.
    db.prepare("UPDATE students SET email_verified_at=? WHERE id=?").run(new Date().toISOString(), id);
    assert.equal((await call("/me/card", { token, body: {} })).status, 400, "the terms must be agreed");
    assert.equal((await call("/me/card", { user: null, body: { consent: true } })).status, 401);
    const opened = await call("/me/card", { token, body: { consent: true } });
    assert.equal(opened.status, 200, await opened.clone().text());
    assert.ok((await opened.json()).checkoutUrl);
    const sent = new URLSearchParams(checkoutRequests.at(-1).body);
    assert.deepEqual([sent.get("mode"), sent.get("client_reference_id"), sent.get("metadata[purpose]"), sent.get("customer_email")],
      ["setup", `student:${id}`, "student_card", email]);
    assert.equal(new URL(sent.get("success_url")).searchParams.get("card"), "added", "not a booking's card return");
    assert.equal(statusOf("2026-10-02T02:00:00.000Z"), "not_required", "nothing changes until Stripe has the card");

    setupIntents.set("seti_card_later", { status: "succeeded", customer: "cus_card_later", payment_method: "pm_card_later" });
    const session = { id: "cs_card_later", mode: "setup", status: "complete", client_reference_id: `student:${id}`,
      customer: "cus_card_later", setup_intent: "seti_card_later", metadata: { purpose: "student_card", student_id: id } };
    const event = { id: "evt_card_later", type: "checkout.session.completed", livemode: false, data: { object: session } };
    assert.equal((await webhook({ ...event, id: "evt_card_other", data: { object: { ...session, client_reference_id: "student:alice" } } })).status, 400);
    assert.equal((await webhook({ ...event, id: "evt_card_open", data: { object: { ...session, status: "open" } } })).status, 400);
    assert.equal(db.prepare("SELECT card_consent_at FROM students WHERE id=?").get(id).card_consent_at, null);
    Object.assign(env, { TEACHER_NOTIFICATIONS_ENABLED: "1", TEACHER_EMAIL: "ines@example.invalid" });
    try { assert.equal((await webhook(event)).status, 200); } finally { Object.assign(env, { TEACHER_NOTIFICATIONS_ENABLED: "0", TEACHER_EMAIL: undefined }); }
    assert.equal((await webhook(event)).status, 200, "a replay is harmless");
    // Inês is not emailed; her Needs you lists the lessons the card now pays for.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE kind='teacher_student_card'").get().n, 0);
    const { students: listed } = await (await call("/admin/students", { method: "GET", user: "teacher" })).json();
    const added = listed.find((row) => row.id === id).cardAdded;
    assert.ok(added?.at, JSON.stringify(added));
    assert.deepEqual(added.lessons.map((lesson) => lesson.startsAt).slice(0, 2), ["2026-10-02T02:00:00.000Z", "2026-10-03T02:00:00.000Z"]);

    const saved = db.prepare("SELECT * FROM students WHERE id=?").get(id);
    assert.deepEqual([saved.stripe_customer_id, saved.stripe_payment_method, Boolean(saved.card_consent_at)], ["cus_card_later", "pm_card_later", true]);
    assert.equal(statusOf("2026-09-01T09:00:00.000Z"), "recorded", "a lesson already had is not charged");
    assert.equal(statusOf("2026-10-05T02:00:00.000Z"), "not_required", "only lessons Inês added change");
    const future = db.prepare("SELECT * FROM bookings WHERE student_id=? AND added_by_teacher=1 AND starts_at > ?").all(id, new Date().toISOString());
    assert.ok(future.length > 2);
    for (const row of future) {
      assert.deepEqual([row.payment_status, row.amount_cents, row.payment_consent_version], ["scheduled", 2500, "2026-10-12-card-on-file-v1"]);
    }
    assert.equal(db.prepare("SELECT automatic_payment FROM booking_series WHERE student_id=?").get(id).automatic_payment, 1, "new weeks are charged too");
    const me = await (await call("/me", { method: "GET", token })).json();
    assert.deepEqual([me.student.hasCard, me.student.cardForAllLessons, me.cardsAccepted], [true, true, true]);

    // Stripe may deliver an older setup after a newer one: the newer card stays.
    const created = Math.floor(Date.now() / 1000);
    setupIntents.set("seti_card_newer", { status: "succeeded", customer: "cus_card_later", payment_method: "pm_card_newer" });
    setupIntents.set("seti_card_older", { status: "succeeded", customer: "cus_card_later", payment_method: "pm_card_older" });
    const replaced = (id, intent, at) => ({ ...event, id, data: { object: { ...session, id: `cs_${intent}`, setup_intent: intent, created: at } } });
    assert.equal((await webhook(replaced("evt_card_newer", "seti_card_newer", created + 120))).status, 200);
    assert.equal((await webhook(replaced("evt_card_older", "seti_card_older", created + 60))).status, 200);
    assert.equal(db.prepare("SELECT stripe_payment_method FROM students WHERE id=?").get(id).stripe_payment_method, "pm_card_newer");

    const later = await add("2026-10-09T02:00:00.000Z");
    assert.equal(later.status, 201);
    assert.equal(statusOf("2026-10-09T02:00:00.000Z"), "scheduled", "a lesson she adds now is on the card from the start");
    assert.equal((await add("2026-09-02T09:00:00.000Z")).status, 201);
    assert.equal(statusOf("2026-09-02T09:00:00.000Z"), "recorded", "a lesson she records after it happened is never charged");

    // One the student already paid her for comes off the card, and stays off.
    const handPaid = db.prepare("SELECT id FROM bookings WHERE student_id=? AND starts_at='2026-10-09T02:00:00.000Z'").get(id).id;
    assert.equal((await call(`/admin/bookings/${handPaid}/paid-by-hand`, { user: "alice" })).status, 401, "students can't");
    assert.equal((await call(`/admin/bookings/${handPaid}/paid-by-hand`, { user: "teacher" })).status, 200);
    assert.equal(statusOf("2026-10-09T02:00:00.000Z"), "not_required");
    assert.equal((await call(`/admin/bookings/${handPaid}/paid-by-hand`, { user: "teacher" })).status, 409, "only once");
    setupIntents.set("seti_card_again", { status: "succeeded", customer: "cus_card_later", payment_method: "pm_card_again" });
    assert.equal((await webhook({ ...event, id: "evt_card_again", data: { object: { ...session, id: "cs_again", setup_intent: "seti_card_again", created: Math.floor(Date.now() / 1000) + 600 } } })).status, 200);
    assert.equal(statusOf("2026-10-09T02:00:00.000Z"), "not_required", "a new card doesn't take it back");

    // A removal authenticated before an account transition or logout cannot
    // change the current agreement, its lessons or its weekly recipe.
    const cardBefore = { ...db.prepare("SELECT card_consent_at,card_setup_version,session_version,stripe_payment_method FROM students WHERE id=?").get(id) };
    const obligations = () => [
      db.prepare("SELECT id,payment_status,payment_consent_at,payment_consent_version FROM bookings WHERE student_id=? ORDER BY id").all(id),
      db.prepare("SELECT id,automatic_payment,payment_consent_at,payment_consent_version FROM booking_series WHERE student_id=? ORDER BY id").all(id)
    ];
    const obligationsBefore = obligations();
    const bearerHash = await sessionHash(token);
    for (const change of ["version", "logout"]) {
      let intervened = false;
      beforeRun = sql => {
        if (!sql.startsWith("UPDATE students SET card_consent_at = NULL, card_setup_version")) return;
        beforeRun = null;
        intervened = true;
        if (change === "version") db.prepare("UPDATE students SET session_version=session_version+1 WHERE id=?").run(id);
        else db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(bearerHash, Number(token.split(".")[1]));
      };
      const refused = await call("/me/card/remove", { token });
      assert.equal(intervened, true);
      assert.equal(refused.status, 401);
      assert.equal((await refused.json()).student, undefined, "the stale caller cannot read the current profile");
      assert.deepEqual({ ...db.prepare("SELECT card_consent_at,card_setup_version,session_version,stripe_payment_method FROM students WHERE id=?").get(id) },
        { ...cardBefore, session_version: cardBefore.session_version + (change === "version" ? 1 : 0) });
      assert.deepEqual(obligations(), obligationsBefore, "a losing removal cannot downgrade lessons or the weekly recipe");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM request_limits WHERE key LIKE 'card-removal:%'").get().n, 0);
      db.prepare("UPDATE students SET session_version=? WHERE id=?").run(cardBefore.session_version, id);
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(bearerHash);
    }

    // Taking the card back: her lessons still to come go back to being paid by hand.
    const removed = await call("/me/card/remove", { token, body: {} });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).student.cardForAllLessons, false);
    assert.equal(statusOf("2026-10-03T02:00:00.000Z"), "not_required");
    assert.equal(db.prepare("SELECT automatic_payment FROM booking_series WHERE student_id=?").get(id).automatic_payment, 0);
    assert.equal((await webhook(replaced("evt_card_after_removal", "seti_card_older", created + 800))).status, 200);
    assert.equal(db.prepare("SELECT card_consent_at FROM students WHERE id=?").get(id).card_consent_at, null,
      "a delayed setup cannot restore removed consent");
    assert.equal(statusOf("2026-10-03T02:00:00.000Z"), "not_required");

    // Removal while Stripe is being checked must win atomically, even with
    // no current card consent (a first setup can still be open).
    assert.equal((await call("/me/card", { token, body: { consent: true } })).status, 200);
    const pendingMetadata = new URLSearchParams(checkoutRequests.at(-1).body);
    assert.equal(pendingMetadata.get("metadata[card_setup_version]"), "1");
    assert.equal(pendingMetadata.get("metadata[session_version]"), "0");
    duringSetupRead = async () => {
      duringSetupRead = null;
      assert.equal((await call("/me/card/remove", { token })).status, 200);
    };
    try {
      assert.equal((await webhook({ ...event, id: "evt_card_removed_during_setup", data: { object: {
        ...session, metadata: { ...session.metadata, card_setup_version: "1", session_version: "0" }
      } } })).status, 200);
    } finally { duringSetupRead = null; }
    assert.equal(db.prepare("SELECT card_consent_at FROM students WHERE id=?").get(id).card_consent_at, null);
    assert.equal(statusOf("2026-10-03T02:00:00.000Z"), "not_required");

    // Saved again, so the charge below runs as it would for a card on file.
    assert.equal((await call("/me/card", { token, body: { consent: true } })).status, 200);
    assert.equal(new URLSearchParams(checkoutRequests.at(-1).body).get("metadata[card_setup_version]"), "2");
    setupIntents.set("seti_card_back", { status: "succeeded", customer: "cus_card_later", payment_method: "pm_card_back" });
    assert.equal((await webhook({ ...event, id: "evt_card_back", data: { object: { ...session, id: "cs_back", setup_intent: "seti_card_back",
      metadata: { ...session.metadata, card_setup_version: "2", session_version: "0" }, created: Math.floor(Date.now() / 1000) + 900 } } })).status, 200);

    // And it is charged after it ends, like any lesson on a card.
    const single = db.prepare("SELECT id FROM bookings WHERE student_id=? AND starts_at='2026-10-02T02:00:00.000Z'").get(id).id;
    db.prepare("UPDATE bookings SET starts_at='2026-09-04T02:00:00.000Z', ends_at='2026-09-04T03:00:00.000Z' WHERE id=?").run(single);
    await chargeDueLessons(env);
    const charge = charges.find((entry) => entry.key === `ines:charge:${single}:lesson`);
    assert.equal(charge?.amount, 2500);
    assert.match(charge.body, /customer=cus_card_later/);
    assert.match(charge.body, /payment_method=pm_card_back/);
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(single).payment_status, "paid");

    // Commit the same withdrawal as /me/card/remove between an old read and
    // its write, as the database interleaving does in production.
    const withdraw = () => {
      db.prepare("UPDATE students SET card_consent_at=NULL, card_setup_version=card_setup_version+1 WHERE id=?").run(id);
      db.prepare(`UPDATE bookings SET payment_status='not_required',payment_consent_at=NULL,payment_consent_version=NULL
        WHERE student_id=? AND added_by_teacher=1 AND status='confirmed' AND payment_status='scheduled'
          AND payment_consent_version='2026-10-12-card-on-file-v1'`).run(id);
      db.prepare(`UPDATE booking_series SET automatic_payment=0,payment_consent_at=NULL,payment_consent_version=NULL
        WHERE student_id=? AND added_by_teacher=1 AND status='active'`).run(id);
    };
    const restoreConsent = () => db.prepare("UPDATE students SET card_consent_at=? WHERE id=?").run(new Date().toISOString(), id);
    beforeRun = (sql) => {
      if (sql.startsWith("INSERT INTO bookings")) { beforeRun = null; withdraw(); }
    };
    assert.equal((await add("2026-10-06T02:00:00.000Z")).status, 409, "a stale teacher read cannot schedule a charge after withdrawal");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=? AND starts_at='2026-10-06T02:00:00.000Z'").get(id).n, 0);

    // Unticking an earlier hand payment cannot restore withdrawn consent.
    restoreConsent();
    beforeRun = (sql, values) => {
      if (sql.startsWith("UPDATE bookings SET payment_status = ?,") && values[5] === handPaid) { beforeRun = null; withdraw(); }
    };
    assert.equal((await call(`/admin/bookings/${handPaid}/paid`, { user: "teacher", body: { paid: false } })).status, 409);
    assert.equal(db.prepare("SELECT payment_consent_version FROM bookings WHERE id=?").get(handPaid).payment_consent_version, "paid-by-hand");

    // The first lesson can exist when withdrawal wins before its new weekly
    // recipe is created. That recipe and its later weeks stay off the card.
    restoreConsent();
    beforeRun = (sql) => {
      if (sql.startsWith("WITH card(authorized)")) { beforeRun = null; withdraw(); }
    };
    const stoppedCardRun = await add("2026-10-06T02:00:00.000Z", { repeat: 4 });
    assert.equal(stoppedCardRun.status, 201, await stoppedCardRun.clone().text());
    const stoppedCardSeries = (await stoppedCardRun.json()).series.id;
    assert.equal(db.prepare("SELECT automatic_payment FROM booking_series WHERE id=?").get(stoppedCardSeries).automatic_payment, 0);
    assert.ok(db.prepare("SELECT payment_status FROM bookings WHERE series_id=?").all(stoppedCardSeries).every((row) => row.payment_status === "not_required"));

    // A stale scheduled row left by an older Worker is repaired before it can
    // reach Stripe, even though Stripe still holds the saved payment method.
    const stale = db.prepare("SELECT id FROM bookings WHERE series_id=? ORDER BY starts_at LIMIT 1").get(stoppedCardSeries).id;
    db.prepare(`UPDATE bookings SET payment_status='scheduled',payment_consent_at=?,payment_consent_version='2026-10-12-card-on-file-v1',
      starts_at='2026-09-04T04:00:00.000Z',ends_at='2026-09-04T05:00:00.000Z' WHERE id=?`).run(new Date().toISOString(), stale);
    await chargeDueLessons(env);
    assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(stale).payment_status, "not_required");
    assert.ok(!charges.some((entry) => entry.key === `ines:charge:${stale}:lesson`), "withdrawn consent cannot charge a saved card");
  } finally {
    beforeRun = null;
    db.prepare("DELETE FROM bookings WHERE id='card-later-own'").run();
    forgetStudent(email);
  }
});
await test("a sign-in link signs an existing student in once, while the address is still theirs", async () => {
  const ip = { "CF-Connecting-IP": "198.51.100.71" };
  // Its own account: the clock is frozen here, so a session for an account an
  // earlier test signed out would be the very token that was revoked.
  student("linker");
  const linksTo = (address) => sentEmails.filter((mail) => mail.to[0] === address && mail.subject.startsWith("Your sign-in link")).map(signInLinkIn);
  captureEmail();
  try {
    for (const email of ["nobody@example.invalid", "teacher@example.invalid", "not an address"]) {
      assert.equal((await call("/auth/email-link", { user: null, headers: ip, body: { email } })).status, 200);
    }
    assert.equal((await call("/auth/email-link", { user: null, headers: ip, body: { email: "LINKER@example.invalid" } })).status, 200);
    await drain();
    assert.equal(sentEmails.length, 1, "only an existing student's address is sent a link");
    const [link] = linksTo("linker@example.invalid");
    const confirm = (token) => call("/auth/email-link/confirm", { user: null, headers: ip, body: { token } });
    assert.equal((await confirm(`${link.slice(0, -2)}xx`)).status, 400, "a tampered link is refused");
    const signedIn = await confirm(link);
    assert.equal(signedIn.status, 200, await signedIn.clone().text());
    const { session, student: linker } = await signedIn.json();
    assert.equal(linker.id, "linker");
    assert.equal((await call("/me", { method: "GET", token: session })).status, 200);
    assert.ok(db.prepare("SELECT email_verified_at FROM students WHERE id='linker'").get().email_verified_at, "the link proves the address");
    assert.equal((await confirm(link)).status, 400, "only once");

    // A link to an address the account no longer has does nothing.
    assert.equal((await call("/auth/email-link", { user: null, headers: ip, body: { email: "linker@example.invalid" } })).status, 200);
    await drain();
    const stale = linksTo("linker@example.invalid").at(-1);
    db.prepare("UPDATE students SET email='linker-moved@example.invalid' WHERE id='linker'").run();
    assert.equal((await confirm(stale)).status, 400);
    db.prepare("UPDATE students SET email='linker@example.invalid' WHERE id='linker'").run();

    // Three links an hour per account, with the same answer past it.
    for (let i = 0; i < 3; i++) assert.equal((await call("/auth/email-link", { user: null, headers: ip, body: { email: "linker@example.invalid" } })).status, 200);
    await drain();
    assert.equal(linksTo("linker@example.invalid").length, 3);

    // An unproven account with a password may be someone else's: the
    // mailbox's owner signs in, and the registrant's password and session go.
    const registered = await (await call("/auth/register", { user: null, headers: ip, body: { email: "linked-squat@example.invalid", name: "Early Bird", password: "early-bird-password" } })).json();
    assert.equal((await call("/auth/email-link", { user: null, headers: ip, body: { email: "linked-squat@example.invalid" } })).status, 200);
    await drain();
    assert.equal((await confirm(linksTo("linked-squat@example.invalid")[0])).status, 200);
    assert.equal((await call("/me", { method: "GET", token: registered.session })).status, 401);
    assert.equal((await call("/auth/login", { user: null, headers: ip, body: { email: "linked-squat@example.invalid", password: "early-bird-password" } })).status, 401);
  } finally {
    releaseEmail();
    forgetStudent("linker@example.invalid");
    forgetStudent("linked-squat@example.invalid");
  }
});
await test("she sets a student up and adds their lessons without emailing them, then one welcome lists them all", async () => {
  captureEmail();
  const to = (email) => sentEmails.filter((sent) => sent.to[0] === email);
  try {
    const add = (body) => call("/admin/students", { user: "teacher", body });
    assert.equal((await add({ email: "quiet@example.invalid", name: "Ana Costa", nif: "123456788" })).status, 400, "a wrong NIF is refused");
    assert.equal((await add({ email: "quiet@example.invalid", name: "Ana Costa", mark: "sparkle" })).status, 400);
    assert.equal((await call("/admin/students", { user: "alice", body: { email: "quiet@example.invalid", name: "Ana Costa" } })).status, 401);
    const created = await add({ email: "quiet@example.invalid", name: "Ana Costa", phone: "+351 912 345 678", nif: "PT 123 456 789", mark: "bloom" });
    assert.equal(created.status, 201, await created.clone().text());
    const { student } = await created.json();
    assert.deepEqual([student.awaitingWelcome, student.signedIn, student.mark, student.hasCard, student.hasLessons], [true, false, "bloom", false, false]);
    assert.deepEqual({ ...db.prepare("SELECT phone, nif FROM students WHERE id=?").get(student.id) }, { phone: "+351 912 345 678", nif: "123456789" });
    assert.equal((await add({ email: "quiet@example.invalid", name: "Again" })).status, 409);

    // Lessons, a move and a cancellation: all real for her, nothing to them.
    const one = await call("/admin/bookings", { user: "teacher", body: { email: "quiet@example.invalid", lessonType: "single", startAt: "2026-10-20T10:00:00.000Z" } });
    assert.equal(one.status, 201, await one.clone().text());
    assert.equal((await one.json()).emailed, false);
    const weekly = await call("/admin/bookings", { user: "teacher", body: { email: "quiet@example.invalid", lessonType: "single", startAt: "2026-10-22T10:00:00.000Z", repeat: 4 } });
    assert.equal(weekly.status, 201, await weekly.clone().text());
    await drain();
    const lessons = db.prepare("SELECT id FROM bookings WHERE student_id=? AND status='confirmed' ORDER BY starts_at").all(student.id);
    assert.ok(lessons.length >= 5, "the lessons exist and block the time");
    const moved = await call(`/admin/bookings/${lessons[0].id}/reschedule`, { user: "teacher", body: { startAt: "2026-10-20T14:00:00.000Z" } });
    assert.equal((await moved.json()).emailed, false);
    await drain();
    assert.equal(to("quiet@example.invalid").length, 0, "nothing reaches the student before their welcome");
    // Nor does a reminder: it would be their first email, ahead of the welcome.
    const remindAt = new Date(Date.parse(db.prepare("SELECT starts_at FROM bookings WHERE id=?").get(lessons[2].id).starts_at) - 23 * 3600000);
    await sendLessonReminders(env, remindAt);
    assert.equal(to("quiet@example.invalid").length, 0, "no reminder before the welcome");

    emailUnavailable = true;
    const failedWelcome = await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: { onlyIfWaiting: true } });
    emailUnavailable = false;
    assert.equal(failedWelcome.status, 502);
    const originalWelcome = JSON.parse(db.prepare("SELECT request_json FROM email_log WHERE kind='student_welcome' AND recipient=?").get(student.email).request_json);
    const welcomes = await Promise.all([1, 2].map(() => call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: { onlyIfWaiting: true } })));
    assert.deepEqual(welcomes.map(reply => reply.status).sort(), [200, 409], "two devices cannot send two first welcomes");
    await drain();
    const [welcome] = to("quiet@example.invalid");
    assert.equal(welcome.text, originalWelcome.text, "a retry keeps the original sign-in link and exact provider payload");
    assert.ok(welcome.subject.startsWith("Your lessons with Inês"));
    // The weekly run is one line, the lesson on its own another.
    assert.equal((welcome.text.match(/Lesson · Online/g) ?? []).length, 1, "the lesson on its own has its own line");
    assert.equal((welcome.text.match(/Weekly · Online/g) ?? []).length, 1, "a weekly run is one line, not a row of dates");
    assert.equal(db.prepare("SELECT awaiting_welcome FROM students WHERE id=?").get(student.id).awaiting_welcome, 0);
    // Needs you asks only while the welcome is owed: a second device pressing later sends nothing.
    const again = await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: { onlyIfWaiting: true } });
    assert.equal(again.status, 409);
    await drain();
    assert.equal(to("quiet@example.invalid").length, 1);
    // Once welcomed, the lesson still more than 14 hours away is reminded, once.
    await sendLessonReminders(env, remindAt);
    await sendLessonReminders(env, remindAt);
    assert.equal(to("quiet@example.invalid").filter((sent) => sent.subject.startsWith("Your lesson is coming up")).length, 1);

    // After the welcome, her changes reach them as usual.
    await call(`/admin/bookings/${lessons[1].id}/cancel`, { user: "teacher", body: {} });
    await drain();
    assert.ok(to("quiet@example.invalid").some((sent) => sent.subject.startsWith("Inês has cancelled your lesson")));
    // Only the earliest confirmed lesson reads as their first; a cancelled one never does.
    const rows = (await (await call("/admin/bookings?from=2026-01-01T00:00:00.000Z", { method: "GET", user: "teacher" })).json()).bookings.filter((row) => row.student_id === student.id);
    assert.deepEqual(rows.filter((row) => row.first_lesson).map((row) => row.id), [lessons[0].id]);
  } finally {
    emailUnavailable = false;
    releaseEmail();
    forgetStudent("quiet@example.invalid");
  }
});
await test("she welcomes a student with no lessons: they are asked to book their next one, and a free one is asked for no card", async () => {
  captureEmail();
  const welcomeOf = async (email, prices) => {
    const created = await call("/admin/students", { user: "teacher", body: { email, name: "Rita Sousa", prices } });
    assert.equal(created.status, 201, await created.clone().text());
    const { student } = await created.json();
    assert.equal(student.hasLessons, false);
    const sent = await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: { onlyIfWaiting: true } });
    assert.equal(sent.status, 200, await sent.clone().text());
    await drain();
    const emails = sentEmails.filter((entry) => entry.to[0] === email);
    assert.equal(emails.length, 1, "her press sends one welcome, and nothing else");
    return { reply: await sent.json(), email: emails[0] };
  };
  try {
    const priced = await welcomeOf("booker@example.invalid", { 60: 2500 });
    assert.equal(priced.email.subject, "Book your next lesson with Inês");
    assert.ok(priced.email.text.includes("choose a time for your next lesson"), priced.email.text);
    assert.ok(priced.email.text.includes("Choose a day and time for your next lesson."));
    assert.ok(!/Lesson · |Weekly · |And more/.test(priced.email.text), "no lesson list");
    assert.ok(priced.email.text.includes("€25 a lesson"), "their own price still shows");
    assert.equal(priced.email.text.includes("Add your card."), priced.reply.card, "a card is asked for only when one is taken");

    const free = await welcomeOf("free-booker@example.invalid", { 60: 0 });
    assert.equal(free.reply.card, false);
    assert.equal(free.email.subject, "Book your next lesson with Inês");
    assert.ok(free.email.text.includes("no card to add and nothing to pay"));
    assert.ok(!/add your card|add card/i.test(free.email.text), "no card step");
    assert.ok(free.email.text.includes("Choose a time"));
  } finally {
    releaseEmail();
    forgetStudent("booker@example.invalid");
    forgetStudent("free-booker@example.invalid");
  }
});
await test("she can set a student up from a name alone and give their email later, until they sign in", async () => {
  captureEmail();
  const to = (email) => sentEmails.filter((sent) => sent.to[0] === email);
  try {
    const add = (body) => call("/admin/students", { user: "teacher", body });
    assert.equal((await add({ email: "not-an-address", name: "Bea" })).status, 400, "a mistyped email is still refused");
    const created = await add({ name: "Bea", nif: "123456789", prices: { 60: 2000 } });
    assert.equal(created.status, 201, await created.clone().text());
    const { student } = await created.json();
    assert.deepEqual([student.email, student.awaitingWelcome, student.ownPrices, student.prices], ["", true, { 60: 2000 }, { 60: 2000, 90: 3000 }]);
    assert.equal((await add({ name: "Bea's sister" })).status, 201, "any number of them can wait for an email");
    assert.equal((await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: {} })).status, 400, "no welcome without an email");

    const details = (body) => call(`/admin/students/${student.id}/details`, { user: "teacher", body });
    assert.equal((await call(`/admin/students/${student.id}/details`, { user: "alice", body: { name: "Bea" } })).status, 401);
    assert.equal((await details({ name: "Bea", email: "alice@example.invalid" })).status, 409, "another student's email is refused");
    const filled = await details({ name: "Bea Lopes", email: "Later@Example.invalid", phone: "+351 911 111 111", nif: "123456789", mark: "pool" });
    assert.equal(filled.status, 200, await filled.clone().text());
    const now = (await filled.json()).student;
    assert.deepEqual([now.name, now.email, now.phone, now.mark], ["Bea Lopes", "later@example.invalid", "+351 911 111 111", "pool"]);
    assert.equal((await details({ name: "Bea Lopes", email: "later@example.invalid", phone: "+351 922 222 222", nif: "123456789" })).status, 200);
    assert.equal(db.prepare("SELECT mark FROM students WHERE id=?").get(student.id).mark, "pool", "ordinary details edits preserve the student's splat when it was not edited");

    // With an email, she adds their lessons and sends their welcome as usual.
    const lesson = await call("/admin/bookings", { user: "teacher", body: { email: "later@example.invalid", lessonType: "single", startAt: "2026-10-21T10:00:00.000Z" } });
    assert.equal(lesson.status, 201, await lesson.clone().text());
    await drain();
    assert.equal(to("later@example.invalid").length, 0);
    assert.equal((await details({ name: "Bea Lopes", email: "bea@example.invalid", nif: "123456789" })).status, 200, "a typo can be corrected before they sign in");
    assert.equal(db.prepare("SELECT student_email FROM bookings WHERE student_id=?").get(student.id).student_email, "bea@example.invalid", "her lessons follow the new address");
    beforeRun = sql => {
      if (!sql.startsWith("INSERT INTO sign_in_links")) return;
      beforeRun = null;
      db.prepare("UPDATE students SET email='corrected-bea@example.invalid', session_version=session_version+1 WHERE id=?").run(student.id);
      db.prepare("UPDATE bookings SET student_email='corrected-bea@example.invalid' WHERE student_id=?").run(student.id);
      db.prepare("DELETE FROM sign_in_links WHERE student_id=?").run(student.id);
    };
    assert.equal((await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: { onlyIfWaiting: true } })).status, 409);
    assert.equal(to("bea@example.invalid").length, 0, "a correction winning before the welcome claim sends nothing to the old address");
    assert.equal(db.prepare("SELECT awaiting_welcome FROM students WHERE id=?").get(student.id).awaiting_welcome, 1, "the corrected address still needs its own welcome");
    assert.equal((await details({ name: "Bea Lopes", email: "bea@example.invalid", nif: "123456789" })).status, 200);
    assert.equal((await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: {} })).status, 200);
    await drain();
    assert.equal(to("bea@example.invalid").length, 1);
    // Corrected again before they use it, the welcome sent to the old address no longer opens their account.
    const links = () => db.prepare("SELECT COUNT(*) AS n FROM sign_in_links WHERE student_id=?").get(student.id).n;
    assert.ok(links() > 0);
    assert.equal((await details({ name: "Bea Lopes", email: "beatriz@example.invalid", nif: "123456789" })).status, 200);
    assert.equal(links(), 0, "links sent to the old address are revoked");

    // Once they have signed in, the address is theirs to change.
    db.prepare("UPDATE students SET last_login_at=? WHERE id=?").run(new Date().toISOString(), student.id);
    assert.equal((await details({ name: "Bea Lopes", email: "other@example.invalid" })).status, 409);
    assert.equal((await details({ name: "Bea Lopes", email: "beatriz@example.invalid", nif: "" })).status, 200, "her other details stay hers to correct");
  } finally {
    releaseEmail();
    forgetStudent("bea@example.invalid");
    db.prepare("DELETE FROM student_recurring_rates WHERE student_id IN (SELECT id FROM students WHERE email LIKE 'no-email:%')").run();
    db.prepare("DELETE FROM students WHERE email LIKE 'no-email:%'").run();
  }
});
await test("she adds lessons for a student with no email yet: nothing leaves for the address that is not there, and the real one follows every lesson", async () => {
  captureEmail();
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", TEACHER_NOTIFICATIONS_ENABLED: "1" });
  const isolated = "Dina Dias";
  const full = "Dina Dias Marques";
  try {
    const created = await call("/admin/students", { user: "teacher", body: { name: isolated, prices: { 60: 2000 } } });
    const { student } = await created.json();
    const book = (body) => call("/admin/bookings", { user: "teacher", body: { studentId: student.id, lessonType: "single", ...body } });
    assert.equal((await book({ studentId: "nobody", startAt: "2026-10-20T16:00:00.000Z" })).status, 404, "a student she has not set up is still refused");

    // A lesson she has already had, a one-off, a weekly run and a long lesson.
    const had = await book({ startAt: "2026-08-20T09:00:00.000Z" });
    assert.equal(had.status, 201, await had.clone().text());
    const afterPastLesson = (await (await call("/admin/students", { method: "GET", user: "teacher" })).json()).students.find(entry => entry.id === student.id);
    assert.equal(afterPastLesson.hasLessons, true, "a confirmed lesson already had completes their lesson setup");
    const one = await book({ startAt: "2026-10-20T16:00:00.000Z" });
    assert.equal(one.status, 201, await one.clone().text());
    assert.equal((await one.json()).emailed, false, "she is told nothing was sent");
    const weekly = await book({ startAt: "2026-09-17T17:00:00.000Z", repeat: 4 });
    assert.equal(weekly.status, 201, await weekly.clone().text());
    assert.equal((await book({ lessonType: "long", startAt: "2026-10-28T09:00:00.000Z" })).status, 201);
    await drain();

    const rows = () => db.prepare("SELECT student_email, amount_cents FROM bookings WHERE student_id=?").all(student.id);
    assert.equal(rows().length, 7);
    assert.deepEqual([...new Set(rows().map((row) => row.student_email))], [`no-email:${student.id}`], "the stand-in is the lessons' key and goes no further");
    assert.deepEqual(rows().filter((row) => row.amount_cents !== 2000).map((row) => row.amount_cents).sort(), [3000, null], "her price, 1.5 times it for 90 minutes, and none on the one recorded");

    // Nothing is addressed to it, nothing names it, no calendar file invites it. Her own copies read "No email yet".
    const everything = sentEmails.flatMap((sent) => [sent.to.join(), sent.reply_to?.join() ?? "", sent.subject, sent.text, sent.html,
      ...(sent.attachments ?? []).map((file) => Buffer.from(file.content, "base64").toString())]).join("\n");
    assert.ok(!everything.includes("no-email:"), "the placeholder appears in nothing she or a provider receives");
    assert.deepEqual(sentEmails.filter((sent) => sent.to[0] !== "ines@example.invalid"), [], "no one else is written to");
    const hers = sentEmails.filter((sent) => sent.to[0] === "ines@example.invalid");
    // The one already had is recorded, not announced, so three.
    assert.ok(hers.length >= 3 && hers.every((sent) => sent.text.includes("No email yet") && !sent.reply_to), "she still hears of each, with no one to reply to");

    // What her screens and automation read.
    const listed = await (await call("/admin/bookings?from=2026-01-01T00:00:00.000Z", { method: "GET", user: "teacher" })).json();
    const theirs = listed.bookings.filter((entry) => entry.student_id === student.id);
    assert.equal(theirs.length, 7);
    assert.ok(theirs.every((entry) => entry.student_email === ""), "her list shows no address for them");
    // A recorded lesson has no receipt; one paid by hand, as lessons before recording were, does.
    db.prepare("UPDATE bookings SET payment_status='not_required', amount_cents=2000 WHERE student_id=? AND starts_at='2026-08-20T09:00:00.000Z'").run(student.id);
    const receipts = (await (await call("/admin/receipts?month=2026-08", { method: "GET", user: "teacher" })).json()).receipts.filter((line) => line.studentName === isolated);
    assert.deepEqual(receipts.map((line) => [line.studentEmail, line.amountCents, line.ready]), [["", 2000, true]], "a receipt line for them has no address");
    const marked = await call(`/admin/bookings/${theirs.find((entry) => entry.starts_at > "2026-10-01").id}/paid-by-hand`, { user: "teacher", body: {} });
    assert.ok(!JSON.stringify(await marked.json()).includes("no-email:"), "nor does any answer to a change");

    // Giving the real address: another account's is refused and moves nothing.
    const details = (body) => call(`/admin/students/${student.id}/details`, { user: "teacher", body: { name: isolated, ...body } });
    assert.equal((await details({ email: "alice@example.invalid" })).status, 409);
    assert.deepEqual([...new Set(rows().map((row) => row.student_email))], [`no-email:${student.id}`]);
    sentEmails.length = 0;
    // She added "Dina" by first name and completes her now: name and phone reach every lesson too.
    assert.equal((await details({ name: full, phone: "+351 911 222 333", email: "Dina@Example.invalid" })).status, 200);
    assert.deepEqual([...new Set(rows().map((row) => row.student_email))], ["dina@example.invalid"], "every lesson, past ones too, carries the real address");
    assert.deepEqual(db.prepare("SELECT DISTINCT student_name, student_phone FROM bookings WHERE student_id=?").all(student.id).map((row) => [row.student_name, row.student_phone]),
      [[full, "+351 911 222 333"]], "and her name and phone");
    await drain();
    assert.deepEqual(sentEmails, [], "giving the address sends nothing; she sends the welcome herself");
    const now = (await (await call("/admin/students", { method: "GET", user: "teacher" })).json()).students.find((entry) => entry.id === student.id);
    assert.deepEqual([now.email, now.awaitingWelcome], ["dina@example.invalid", true]);
    const fatura = (await (await call("/admin/receipts?month=2026-08", { method: "GET", user: "teacher" })).json()).receipts.find((line) => line.studentName === full);
    assert.equal(fatura.studentEmail, "dina@example.invalid", "a receipt reads her full name and real address");

    // Her price changes after the lessons, and they live in another clock: the welcome follows both.
    db.prepare("UPDATE students SET timezone='America/Los_Angeles' WHERE id=?").run(student.id);
    assert.equal((await call(`/admin/students/${student.id}/prices`, { user: "teacher", body: { prices: { 60: 2400 } } })).status, 200);
    // A lesson added from a stale read while the address was saved still holds the stand-in: the welcome mends it.
    db.prepare("UPDATE bookings SET student_email=? WHERE id=(SELECT id FROM bookings WHERE student_id=? ORDER BY starts_at DESC LIMIT 1)").run(`no-email:${student.id}`, student.id);
    assert.equal((await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: {} })).status, 200);
    assert.deepEqual([...new Set(rows().map((row) => row.student_email))], ["dina@example.invalid"]);
    await drain();
    const [welcome] = sentEmails.filter((sent) => sent.to[0] === "dina@example.invalid");
    const lines = welcome.text.split("\n");
    for (const line of [
      "Your price · 60 minutes: €24 a lesson",
      "Your price · 90 minutes: €36 a lesson",
      "Weekly · Online: Every Thursday, 10:00 · Los Angeles time",
      "From 17 September 2026 until 8 October 2026",
      "60 minutes · €24 a lesson",
      "Lesson · Online: Tuesday 20 October 2026, 09:00 · Los Angeles time",
      "60 minutes · €24",
      "Lesson · Online: Wednesday 28 October 2026, 02:00 · Los Angeles time",
      "90 minutes · €36"
    ]) assert.ok(lines.includes(line), `${line}\n${welcome.text}`);
    assert.equal(welcome.text.match(/Weekly/g).length, 1, "the run is one line, not four");
    assert.ok(!welcome.text.includes("20 August"), "a lesson that has happened is not in it");
  } finally {
    Object.assign(env, { TEACHER_NOTIFICATIONS_ENABLED: "0" });
    delete env.TEACHER_EMAIL;
    releaseEmail();
    forgetStudent("dina@example.invalid");
    db.prepare("DELETE FROM student_recurring_rates WHERE student_id IN (SELECT id FROM students WHERE name IN (?, ?))").run(isolated, full);
    db.prepare("DELETE FROM students WHERE name IN (?, ?)").run(isolated, full);
  }
});
await test("her price for a student prices their lessons, and only lessons nothing is settled on follow a change", async () => {
  try {
    const add = (body) => call("/admin/students", { user: "teacher", body });
    assert.equal((await add({ email: "priced@example.invalid", name: "Rita", prices: { 60: 50 } })).status, 400);
    const created = await add({ email: "priced@example.invalid", name: "Rita", prices: { 60: 2000 } });
    assert.equal(created.status, 201, await created.clone().text());
    const { student } = await created.json();
    assert.deepEqual([student.prices, student.ownPrices], [{ 60: 2000, 90: 3000 }, { 60: 2000 }], "90 minutes is 1.5 times her 60-minute price");
    const book = (body) => call("/admin/bookings", { user: "teacher", body: { email: "priced@example.invalid", ...body } });
    for (const lessonType of ["single", "long", "trial"]) {
      assert.equal((await book({ lessonType, startAt: "2026-10-26T10:00:00.000Z", expectedPriceCents: 1 })).status, 409, "the teacher reviews the actual student or trial price before adding a lesson");
    }
    assert.equal((await book({ lessonType: "single", startAt: "2026-10-26T10:00:00.000Z", expectedPriceCents: 2000 })).status, 201);
    assert.equal((await book({ lessonType: "single", startAt: "2026-10-27T10:00:00.000Z", repeat: 4 })).status, 201);
    assert.equal((await book({ lessonType: "long", startAt: "2026-10-28T10:00:00.000Z", expectedPriceCents: 3000 })).status, 201);
    await drain();
    const amounts = () => db.prepare("SELECT amount_cents FROM bookings b JOIN lesson_types l ON l.id = b.lesson_type_id WHERE student_id=? AND l.duration_minutes=60 ORDER BY starts_at").all(student.id).map((row) => row.amount_cents);
    const long = () => db.prepare("SELECT amount_cents FROM bookings WHERE student_id=? AND lesson_type_id='long'").get(student.id).amount_cents;
    const count = amounts().length;
    assert.ok(count >= 4);
    assert.deepEqual(amounts(), Array(count).fill(2000), "one-off or weekly, her price is theirs");
    const rest = (cents) => Array(count - 3).fill(cents);
    assert.equal(long(), 3000, "their 90-minute lesson is 1.5 times their 60-minute price");
    captureEmail();
    try {
      assert.equal((await call(`/admin/students/${student.id}/welcome`, { user: "teacher", body: {} })).status, 200);
      await drain();
      const welcome = sentEmails.find((sent) => sent.to[0] === "priced@example.invalid");
      assert.ok(welcome.text.includes("€20 a lesson"), "their welcome says they are on her price");
    } finally {
      releaseEmail();
    }

    // One agreed at checkout, one paid, one she marked paid by hand.
    const ids = db.prepare("SELECT id FROM bookings WHERE student_id=? AND lesson_type_id='single' ORDER BY starts_at").all(student.id).map((row) => row.id);
    db.prepare("UPDATE bookings SET payment_status='scheduled', payment_consent_version='2026-09-21-fourteen-hours-v1' WHERE id=?").run(ids[0]);
    db.prepare("UPDATE bookings SET payment_status='paid' WHERE id=?").run(ids[1]);
    db.prepare("UPDATE bookings SET payment_consent_version='paid-by-hand' WHERE id=?").run(ids[2]);
    const price = (prices) => call(`/admin/students/${student.id}/prices`, { user: "teacher", body: { prices } });
    assert.equal((await call(`/admin/students/${student.id}/prices`, { user: "alice", body: { prices: { 60: 100 } } })).status, 401);
    assert.equal((await call("/admin/students/nobody/prices", { user: "teacher", body: { prices: { 60: 2400 } } })).status, 404);

    const raised = await price({ 60: 2400 });
    assert.equal(raised.status, 200, await raised.clone().text());
    assert.equal((await raised.json()).updated, count - 3 + 1, "and the 90-minute lesson follows its derived price");
    assert.deepEqual(amounts(), [2000, 2000, 2000, ...rest(2400)], "a higher price never reaches what they agreed at checkout");
    assert.equal(long(), 3600);
    await price({ 60: 1800 });
    assert.deepEqual(amounts(), [1800, 2000, 2000, ...rest(1800)], "a lower one does");
    assert.equal(long(), 2700);
    // A 90-minute price of its own wins over the derived one.
    await price({ 90: 2500 });
    assert.equal(long(), 2500);
    const reset = await price({ 60: null, 90: null });
    assert.deepEqual((await reset.json()).student.prices, {});
    assert.deepEqual(amounts(), [1800, 2000, 2000, ...rest(2500)]);
    assert.equal(long(), 3500);

    // An older reprice must not undo a newer save after reading its source
    // prices. Exercise explicit, derived, free and public-price snapshots in
    // the same real UPDATEs used by code redemption and teacher price saves.
    booking("price-snapshot-sixty", { owner: student.id, payment: "not_required" });
    booking("price-snapshot-ninety", { owner: student.id, payment: "not_required" });
    db.prepare("UPDATE bookings SET lesson_type_id = 'long' WHERE id = 'price-snapshot-ninety'").run();
    for (const [label, captured, newer, target, expected] of [
      ["stored", { 60: 2000, 90: 3000 }, { 60: 1500, 90: 2250 }, 60, [1500, 2250]],
      ["derived", { 60: 2001, 90: null }, { 60: 1801 }, 90, [1801, 2702]],
      ["explicit becomes derived", { 60: 2000, 90: 2500 }, { 60: 2000 }, 90, [2000, 3000]],
      ["free", { 60: 0, 90: null }, { 60: 1800 }, 60, [1800, 2700]],
      ["public becomes personal", { 60: null, 90: null }, { 60: 1800 }, 60, [1800, 2700]],
      ["personal becomes public", { 60: 2000, 90: 3000 }, {}, 60, [2500, 3500]]
    ]) {
      db.prepare("UPDATE bookings SET amount_cents = 2500, payment_status = 'not_required', payment_consent_version = NULL WHERE id IN ('price-snapshot-sixty', 'price-snapshot-ninety')").run();
      let raced = false;
      beforeRun = (sql, values) => {
        if (!sql.startsWith("UPDATE bookings SET amount_cents = COALESCE(") || values[5] !== student.id || values[7] !== target) return;
        beforeRun = null;
        raced = true;
        db.prepare("DELETE FROM student_recurring_rates WHERE student_id = ?").run(student.id);
        for (const [minutes, cents] of Object.entries(newer)) {
          db.prepare("INSERT INTO student_recurring_rates VALUES (?, ?, ?, ?)").run(student.id, Number(minutes), cents, new Date().toISOString());
        }
        db.prepare("UPDATE bookings SET amount_cents = ? WHERE id = 'price-snapshot-sixty'").run(expected[0]);
        db.prepare("UPDATE bookings SET amount_cents = ? WHERE id = 'price-snapshot-ninety'").run(expected[1]);
      };
      const changed = await price(captured);
      assert.equal(changed.status, 200, await changed.clone().text());
      assert.equal(raced, true, label);
      assert.deepEqual(db.prepare("SELECT amount_cents, payment_status FROM bookings WHERE id IN ('price-snapshot-sixty', 'price-snapshot-ninety') ORDER BY lesson_type_id DESC").all().map((row) => [row.amount_cents, row.payment_status]), expected.map((cents) => [cents, "not_required"]), label);
    }

    // A price save which finishes before a new claim cannot miss the row and
    // leave it chargeable at an older quote. Exercise the production INSERTs,
    // including their empty-recipe cleanup and weekly bookmark transaction.
    for (const scenario of [
      { label: "explicit", before: { 60: 2000 }, after: { 60: 1500 }, quote: 2000 },
      { label: "derived", before: { 60: 2001 }, after: { 60: 1801 }, quote: 3002, type: "long" },
      { label: "explicit becomes derived", before: { 60: 2000, 90: 2500 }, after: { 60: 2000 }, quote: 2500, type: "long" },
      { label: "personal becomes public", before: { 60: 2000 }, after: {}, quote: 2000 },
      { label: "free becomes paid", before: { 60: 0 }, after: { 60: 1800 }, quote: 0 },
      { label: "trial keeps its public price", after: { 60: 0 }, quote: 2000, type: "trial" },
      { label: "public becomes free selection", stage: "selection", after: { 60: 0 } },
      { label: "public becomes free selection recipe", stage: "selection-recipe", after: { 60: 0 } },
      { label: "first lesson stays without stale recipe", stage: "recipe", after: { 60: 0 } },
      { label: "unopened setup is released", stage: "recipe", setup: true, after: { 60: 0 } },
      { label: "teacher claim", teacher: true, after: { 60: 0 } },
      { label: "teacher recipe", teacher: true, stage: "recipe", after: { 60: 0 } },
      { label: "later weeks cannot silently rise", stage: "occurrence", after: { 60: 3000 } }
    ]) {
      const user = await selectionFixture({ savedCard: !scenario.setup });
      const replaceRates = rates => {
        db.prepare("DELETE FROM student_recurring_rates WHERE student_id = ?").run(user);
        for (const [minutes, cents] of Object.entries(rates)) {
          db.prepare("INSERT INTO student_recurring_rates VALUES (?, ?, ?, ?)").run(user, Number(minutes), cents, new Date().toISOString());
        }
      };
      replaceRates(scenario.before ?? {});
      const checkoutBefore = checkoutRequests.length;
      let claims = 0;
      let raced = false;
      beforeRun = sql => {
        const prefix = scenario.stage === "recipe" || scenario.stage === "selection-recipe"
          ? scenario.teacher ? "WITH card(authorized)" : "INSERT INTO booking_series"
          : scenario.stage === "selection" ? "WITH candidates" : "INSERT INTO bookings";
        if (!sql.startsWith(prefix)) return;
        if (scenario.stage === "occurrence" && ++claims === 1) return;
        beforeRun = null; raced = true; replaceRates(scenario.after);
      };
      try {
        const repeated = ["recipe", "selection", "selection-recipe", "occurrence"].includes(scenario.stage);
        const body = selectionBody({
          lessonType: scenario.type ?? "single", expectedPriceCents: scenario.quote ?? 2500,
          startAts: scenario.stage?.startsWith("selection") ? selectedStarts : [selectedStarts[0]],
          ...(repeated ? { repeat: 4 } : {})
        });
        const response = scenario.teacher
          ? await call("/admin/bookings", { user: "teacher", body: { ...body, studentId: user, startAt: selectedStarts[0] } })
          : await call("/bookings", { user, body });
        assert.equal(raced, true, scenario.label);
        const accepted = scenario.stage === "occurrence" || scenario.type === "trial";
        assert.equal(response.status, accepted ? 201 : 409, `${scenario.label}: ${await response.clone().text()}`);
        const rows = db.prepare("SELECT * FROM bookings WHERE student_id = ?").all(user);
        const acceptedFirst = (scenario.stage === "recipe" && !scenario.setup) || accepted;
        assert.equal(rows.length, acceptedFirst ? 1 : 0, scenario.label);
        await drain();
        if (scenario.stage === "recipe" && acceptedFirst) {
          assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log WHERE booking_id = ? AND kind = 'student_booked'").get(rows[0].id).n, 1, "the accepted first lesson still has its confirmation");
        }
        const recipe = db.prepare("SELECT filled_to FROM booking_series WHERE student_id = ?").get(user);
        assert.deepEqual(recipe ? { ...recipe } : null, scenario.stage === "occurrence" ? { filled_to: "2026-09-14" } : null, scenario.label);
        if (scenario.stage === "occurrence") assert.equal(rows[0].amount_cents, 2500, "the accepted first lesson retains its lower quote");
        assert.equal(checkoutRequests.length, checkoutBefore, "no stale quote opens card setup");
      } finally {
        beforeRun = null;
        await drain();
        forgetStudent(`${user}@example.invalid`);
        delete sessions[user];
      }
    }
  } finally {
    beforeRun = null;
    forgetStudent("priced@example.invalid");
  }
});
await test("a lesson Inês records after it happened is only a record: no one is told, nothing is charged or owed", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  captureEmail();
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", TEACHER_NOTIFICATIONS_ENABLED: "1" });
  const email = "recorded@example.invalid";
  // Welcomed, with a card that pays for her lessons, so only the past decides.
  db.prepare(`INSERT INTO students (id,email,name,password_hash,created_at,email_verified_at,stripe_customer_id,stripe_payment_method,card_consent_at)
    VALUES ('recorded',?,'Rui Recorded','',?,?,'cus_recorded','pm_recorded',?)`).run(email, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
  const add = (startAt, extra = {}) => call("/admin/bookings", { user: "teacher", body: { studentId: "recorded", lessonType: "single", startAt, ...extra } });
  const row = (startAt) => db.prepare("SELECT * FROM bookings WHERE student_id='recorded' AND starts_at=?").get(startAt);
  try {
    const had = await add("2026-08-03T09:00:00.000Z");
    assert.equal(had.status, 201, await had.clone().text());
    assert.equal((await had.json()).emailed, false);
    // Started ten minutes ago and still running.
    assert.equal((await add("2026-09-05T09:50:00.000Z")).status, 201);
    await drain();
    assert.deepEqual(sentEmails, [], "no email to the student or to her, and so no invitation");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sign_in_links WHERE student_id='recorded'").get().n, 0, "no sign-in link is made");
    const lesson = row("2026-08-03T09:00:00.000Z");
    assert.deepEqual([lesson.payment_status, lesson.amount_cents, lesson.payment_consent_at, lesson.meeting_url], ["recorded", null, null, null], "a record, never on the card");
    assert.equal(row("2026-09-05T09:50:00.000Z").meeting_retry_at, "2026-09-05T10:50:00.000Z", "the Meet sweep leaves a running one alone");

    // Weekly hours don't apply, but the same lesson twice, an overlap or a weekly run are refused.
    assert.deepEqual(await (await add("2026-08-03T09:00:00.000Z")).json(), { error: "They already have this lesson." });
    assert.equal((await add("2026-08-03T09:30:00.000Z")).status, 409, "an overlap");
    assert.equal((await add("2026-08-10T09:00:00.000Z", { repeat: 4 })).status, 400);

    // Nothing charges, chases or receipts it.
    await chargeDueLessons(env, new Date("2026-09-06T12:00:00.000Z"));
    await retryPaymentRecovery(env);
    assert.equal(charges.filter((charge) => charge.key.includes(lesson.id)).length, 0);
    assert.equal(row("2026-08-03T09:00:00.000Z").payment_status, "recorded");
    const receipts = (await (await call("/admin/receipts?month=2026-08", { method: "GET", user: "teacher" })).json()).receipts;
    assert.ok(!receipts.some((line) => line.bookingId === lesson.id), "not put forward as paid or owed");

    // It is theirs: in their past lessons, and homework can be set on it.
    const me = await (await call("/me", { method: "GET", token: await createSession("recorded", env.BOOKING_TOKEN_SECRET) })).json();
    assert.ok(me.bookings.some((entry) => entry.startAt === "2026-08-03T09:00:00.000Z" && entry.isPast));
    assert.equal((await call(`/admin/lessons/${lesson.id}/homework`, { method: "GET", user: "teacher" })).status, 200);

    // Corrected within the past, or cancelled, as quietly; never moved into the future.
    assert.equal((await call(`/admin/bookings/${lesson.id}/reschedule`, { user: "teacher", body: { startAt: "2026-10-27T09:00:00.000Z" } })).status, 409);
    assert.equal((await (await call(`/admin/bookings/${lesson.id}/reschedule`, { user: "teacher", body: { startAt: "2026-08-03T10:00:00.000Z" } })).json()).emailed, false);
    assert.equal((await (await call(`/admin/bookings/${lesson.id}/cancel`, { user: "teacher", body: {} })).json()).emailed, false);
    await drain();
    // The sweeps above charge other tests' lessons; none of it is about Rui.
    assert.ok(!sentEmails.some((sent) => sent.to.includes(email) || sent.text.includes("Rui")));
  } finally {
    releaseEmail();
    Object.assign(env, { TEACHER_NOTIFICATIONS_ENABLED: "0" });
    forgetStudent(email);
  }
});
await test("a student Inês made free books and is booked with no card, no Stripe and no money owed, until the price rises", async () => {
  const user = await selectionFixture({ savedCard: false });
  const price = (prices) => call(`/admin/students/${user}/prices`, { user: "teacher", body: { prices } });
  const mine = () => db.prepare("SELECT * FROM bookings WHERE student_id=? ORDER BY starts_at").all(user);
  const stripeCalls = () => checkoutRequests.length + charges.length;
  try {
    // A lesson she added before making them free is paid by hand; €0 makes it free.
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { studentId: user, lessonType: "single", startAt: "2026-09-16T16:00:00.000Z" } })).status, 201);
    assert.equal(mine()[0].payment_status, "not_required");
    assert.equal((await price({ 60: 50 })).status, 400, "between €0 and €1 is still refused");
    const freed = await price({ 60: 0 });
    assert.equal(freed.status, 200, await freed.clone().text());
    const { student, updated } = await freed.json();
    assert.deepEqual([student.prices, updated], [{ 60: 0, 90: 0 }, 1], "a free 60 makes the 90 free too");
    assert.deepEqual([mine()[0].payment_status, mine()[0].amount_cents], ["free", 0]);
    assert.equal((await (await call(`/admin/students/${user}/welcome`, { user: "teacher", body: {} })).json()).card, false, "their welcome asks for no card");

    // Self-serve, no agreement, no card: a lesson, two dates and a weekly run.
    const before = stripeCalls();
    captureEmail();
    try {
      const single = await call("/bookings", { user, body: { lessonType: "single", startAt: "2026-09-08T09:00:00.000Z", expectedPriceCents: 0 } });
      assert.equal(single.status, 201, await single.clone().text());
      const reply = await single.json();
      assert.ok(!reply.checkoutUrl && !reply.checkoutClientSecret, "no card step");
      await drain();
      const confirmation = sentEmails.find((mail) => mail.to[0] === `${user}@example.invalid`);
      assert.match(confirmation.text, /Free/, "a real lesson, emailed, its price Free");
      assert.doesNotMatch(confirmation.text, /card|€5/);
    } finally {
      releaseEmail();
    }
    assert.equal((await call("/bookings", { user, body: selectionBody({ paymentConsent: undefined, expectedPriceCents: 0 }) })).status, 201);
    assert.equal((await call("/bookings", { user, body: { lessonType: "long", startAt: "2026-09-21T09:00:00.000Z", repeat: 4 } })).status, 201);
    // Hers too, card or not: a weekly run with no end.
    db.prepare("UPDATE students SET email_verified_at=?, card_consent_at=?, stripe_customer_id='cus_free', stripe_payment_method='pm_free' WHERE id=?")
      .run(new Date().toISOString(), new Date().toISOString(), user);
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { studentId: user, lessonType: "single", startAt: "2026-09-17T16:00:00.000Z", repeat: "open" } })).status, 201);
    assert.equal(stripeCalls(), before, "nothing reached Stripe");
    const lessons = mine();
    assert.ok(lessons.length > 15);
    assert.ok(lessons.every((row) => row.status === "confirmed" && row.payment_status === "free" && row.amount_cents === 0 && !row.payment_consent_at),
      JSON.stringify(lessons.map((row) => [row.starts_at, row.payment_status, row.amount_cents])));
    assert.ok(db.prepare("SELECT automatic_payment FROM booking_series WHERE student_id=? AND added_by_teacher=0").all(user).every((run) => !run.automatic_payment));

    // Late changes cost nothing; nothing charges, chases or receipts them.
    const late = linkedBooking("free-late", { owner: user, payment: "free", start: "2026-09-05T20:00:00.000Z", end: "2026-09-05T21:00:00.000Z" });
    db.prepare("UPDATE bookings SET amount_cents=0 WHERE id=?").run(late);
    const cancelled = await call(`/bookings/${await token(late)}/cancel`, { user: null, body: {} });
    assert.equal((await cancelled.json()).sameDayFeeApplied, false);
    assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id=?").get(late).same_day_fee_status, "not_required");
    await chargeDueLessons(env, new Date("2026-10-20T00:00:00.000Z"));
    await retryPaymentRecovery(env);
    assert.equal(stripeCalls(), before);
    assert.ok(mine().every((row) => row.payment_status === "free"));
    const receipts = (await (await call("/admin/receipts?month=2026-09", { method: "GET", user: "teacher" })).json()).receipts;
    assert.ok(!receipts.some((line) => line.studentEmail === `${user}@example.invalid`), "not Paid by hand, not owed");

    // A higher price is for lessons booked from now on; those already free stay free.
    const raised = await price({ 60: 2000 });
    assert.equal((await raised.json()).stayFree, mine().filter((row) => row.status === "confirmed").length);
    assert.ok(mine().every((row) => row.payment_status === "free" && row.amount_cents === 0));
    // Clear of the hourly booking bound, so only the price decides.
    db.prepare("UPDATE bookings SET created_at='2026-09-01T00:00:00.000Z' WHERE student_id=?").run(user);
    db.prepare("UPDATE booking_series SET created_at='2026-09-01T00:00:00.000Z' WHERE student_id=?").run(user);
    assert.equal((await call("/bookings", { user, body: { lessonType: "single", startAt: "2026-09-29T09:00:00.000Z" } })).status, 400, "the card agreement is back");
    const free60 = mine().find((row) => row.lesson_type_id === "single" && row.starts_at > "2026-09-10" && !row.series_id);
    const lengthened = await call(`/bookings/${await token(free60.id)}/reschedule`, { user: null, body: { startAt: free60.starts_at, lessonType: "long", expectedPriceCents: 3000 } });
    assert.equal(lengthened.status, 409, "a free lesson never turns into a priced one");
    // Her open run's next week is born on the new price, on the card she has.
    const run = db.prepare("SELECT series_id FROM bookings WHERE student_id=? AND added_by_teacher=1 AND series_id IS NOT NULL LIMIT 1").get(user).series_id;
    // Its last two weeks taken back; the earlier is inside the twelve-week horizon.
    const [, last] = db.prepare("SELECT id, starts_at FROM bookings WHERE series_id=? ORDER BY starts_at DESC LIMIT 2").all(run);
    db.prepare("DELETE FROM bookings WHERE series_id=? AND starts_at>=?").run(run, last.starts_at);
    const filledTo = db.prepare("SELECT filled_to FROM booking_series WHERE id=?").get(run).filled_to;
    db.prepare("UPDATE booking_series SET filled_to=? WHERE id=?").run(new Date(Date.parse(`${filledTo}T00:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10), run);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.parse("2026-09-06T03:10:00.000Z") }, env, ctx);
    await drain();
    const regrown = db.prepare("SELECT payment_status, amount_cents FROM bookings WHERE series_id=? AND starts_at=?").get(run, last.starts_at);
    assert.deepEqual({ ...regrown }, { payment_status: "scheduled", amount_cents: 2000 });
  } finally {
    db.exec("DELETE FROM bookings; DELETE FROM booking_series;");
    db.prepare("DELETE FROM student_recurring_rates WHERE student_id=?").run(user);
  }
});
await test("Already paid: ticked lessons are never billed or put on a card, show in Receipts by hand, and untick back to normal billing", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const id = "paid-tick";
  db.prepare("INSERT INTO students (id,email,name,password_hash,created_at,email_verified_at) VALUES (?,?,'Paula Paid','',?,?)")
    .run(id, "paid-tick@example.invalid", new Date().toISOString(), new Date().toISOString());
  const add = (startAt, extra = {}) => call("/admin/bookings", { user: "teacher", body: { studentId: id, lessonType: "single", startAt, ...extra } });
  const row = (startAt) => db.prepare("SELECT * FROM bookings WHERE student_id=? AND starts_at=?").get(id, startAt);
  const tick = (startAt, paid) => call(`/admin/bookings/${row(startAt).id}/paid`, { user: "teacher", body: { paid } });
  const terms = (startAt) => { const r = row(startAt); return [r.payment_status, r.amount_cents, r.payment_consent_version]; };
  const [future, unticked, pastPaid, pastPlain] = ["2026-10-06T16:00:00.000Z", "2026-10-07T16:00:00.000Z", "2026-08-04T09:00:00.000Z", "2026-08-05T09:00:00.000Z"];
  try {
    // Ticked as she adds it; a weekly run is ticked lesson by lesson.
    assert.equal((await add(future, { paid: true })).status, 201);
    assert.deepEqual(terms(future), ["not_required", 2500, "paid-by-hand"]);
    assert.equal((await add("2026-10-08T16:00:00.000Z", { paid: true, repeat: 4 })).status, 400);
    assert.equal((await add(unticked)).status, 201);
    // Past lessons keep the place she chose, with no Meet; ticked, they are paid by hand.
    assert.equal((await add(pastPaid, { paid: true, expectedPriceCents: 1 })).status, 409, "a paid past record still needs the price she reviewed");
    assert.equal((await add(pastPaid, { paid: true, location: "porto" })).status, 201);
    assert.equal((await add(pastPlain, { location: "porto", expectedPriceCents: 1 })).status, 201, "an unticked past record has no payment quote to enforce");
    assert.deepEqual([...terms(pastPaid), row(pastPaid).location, row(pastPaid).meeting_url], ["recorded", 2500, "paid-by-hand", "porto", null]);
    assert.deepEqual([...terms(pastPlain), row(pastPlain).location], ["recorded", null, null, "porto"]);

    // Ticked and unticked from her lesson (an /admin/ route, behind her sign-in).
    assert.equal((await tick(unticked, true)).status, 200);
    assert.deepEqual(terms(unticked), ["not_required", 2500, "paid-by-hand"]);
    assert.equal((await tick(pastPlain, true)).status, 200);
    assert.equal((await tick(pastPlain, false)).status, 200);
    assert.deepEqual(terms(pastPlain), ["recorded", null, null], "unticked, a record is only a record");
    booking("paid-tick-card", { owner: id, payment: "paid", start: "2026-10-09T16:00:00.000Z", end: "2026-10-09T17:00:00.000Z" });
    assert.equal((await tick("2026-10-09T16:00:00.000Z", true)).status, 409, "already paid by card");
    booking("paid-tick-free", { owner: id, payment: "free", start: "2026-10-10T16:00:00.000Z", end: "2026-10-10T17:00:00.000Z" });
    assert.equal((await tick("2026-10-10T16:00:00.000Z", true)).status, 409, "nothing to pay");

    // A card saved later never takes over a ticked lesson.
    const plain = "2026-10-13T16:00:00.000Z";
    assert.equal((await add(plain)).status, 201);
    setupIntents.set("seti_paid_tick", { status: "succeeded", customer: "cus_paid_tick", payment_method: "pm_paid_tick" });
    const session = { id: "cs_paid_tick", mode: "setup", status: "complete", client_reference_id: `student:${id}`, created: Math.floor(Date.now() / 1000),
      customer: "cus_paid_tick", setup_intent: "seti_paid_tick", metadata: { purpose: "student_card", student_id: id } };
    assert.equal((await webhook({ id: "evt_paid_tick", type: "checkout.session.completed", livemode: false, data: { object: session } })).status, 200);
    assert.equal(row(plain).payment_status, "scheduled", "the unticked one goes on the card");
    assert.deepEqual(terms(future), ["not_required", 2500, "paid-by-hand"]);
    assert.deepEqual(terms(unticked), ["not_required", 2500, "paid-by-hand"]);

    // Nothing charges, links or chases a ticked lesson.
    const charged = charges.length;
    await chargeDueLessons(env, new Date("2026-10-20T00:00:00.000Z"));
    await retryPaymentRecovery(env);
    assert.ok(!charges.slice(charged).some((charge) => [row(future).id, row(unticked).id].some((lesson) => charge.key.includes(lesson))));
    assert.equal(row(future).payment_status, "not_required");

    // Receipts: ticked lessons are paid by hand, ready; free and plain records have no line.
    const lines = async (month) => (await (await call(`/admin/receipts?month=${month}`, { method: "GET", user: "teacher" })).json()).receipts
      .filter((line) => line.studentEmail === "paid-tick@example.invalid");
    assert.deepEqual((await lines("2026-08")).map((line) => [line.lessonStartsAt, line.method, line.state, line.ready, line.amountCents]),
      [[pastPaid, "by hand", "paid", true, 2500]]);
    const october = await lines("2026-10");
    assert.ok(october.some((line) => line.lessonStartsAt === future && line.method === "by hand" && line.ready), "the money is in before the lesson");
    assert.ok(!october.some((line) => line.bookingId === "paid-tick-free"), "a free lesson is never in Receipts");

    // Unticked before it is charged, it is billed as it would be now: on the card.
    beforeRun = sql => {
      if (!sql.startsWith("UPDATE bookings SET payment_status = ?")) return;
      beforeRun = null;
      db.prepare("INSERT INTO student_recurring_rates VALUES (?,60,0,?)").run(id, new Date().toISOString());
    };
    assert.equal((await tick(future, false)).status, 409, "unticking cannot miss a concurrent free price that skipped the hand payment");
    assert.deepEqual(terms(future), ["not_required", 2500, "paid-by-hand"]);
    db.prepare("DELETE FROM student_recurring_rates WHERE student_id=?").run(id);
    assert.equal((await tick(future, false)).status, 200);
    assert.deepEqual(terms(future), ["scheduled", 2500, "2026-10-12-card-on-file-v1"]);
    assert.ok(!(await lines("2026-10")).some((line) => line.lessonStartsAt === future));

    // A cancellation is not a cash refund. Its payment stays visible until
    // Inês records the money she returned directly, without touching Stripe.
    const manual = row(unticked).id;
    const refundPath = `/admin/bookings/${manual}/refund-by-hand`;
    const countBefore = [charges.length, refunds.length];
    const ip = { "CF-Connecting-IP": "198.51.100.89" };
    assert.equal((await call(refundPath, { user: "alice", body: { refunded: true }, headers: ip })).status, 401);
    assert.equal((await call(refundPath, { user: "teacher", body: { refunded: true } })).status, 409, "cancel it first");
    assert.equal((await call(`/admin/bookings/${manual}/cancel`, { user: "teacher" })).status, 200);
    const retained = (await lines("2026-10")).find(line => line.bookingId === manual);
    assert.deepEqual([retained.method, retained.state, retained.ready, retained.amountCents], ["by hand", "paid", true, 2500]);
    assert.equal((await call(refundPath, { user: "teacher" })).status, 400, "explicit confirmation required");
    assert.equal((await call(refundPath, { user: "teacher", body: { refunded: true } })).status, 200);
    assert.equal((await call(refundPath, { token: env.ADMIN_TOKEN, body: { refunded: true }, headers: ip })).status, 200, "fallback teacher access and retry");
    const refunded = (await lines("2026-10")).find(line => line.bookingId === manual);
    assert.deepEqual([refunded.method, refunded.state, refunded.ready, refunded.amountCents], ["by hand", "refunded", false, 2500]);
    assert.deepEqual([charges.length, refunds.length], countBefore, "only a record, never another payment or refund");
    assert.equal((await call("/admin/bookings/paid-tick-card/refund-by-hand", { user: "teacher", body: { refunded: true } })).status, 409, "card payments use their existing refund path");
  } finally {
    db.prepare("DELETE FROM bookings WHERE student_id=?").run(id);
    db.prepare("DELETE FROM students WHERE id=?").run(id);
  }
});
await test("her receipts list each amount paid or due for a month's lessons, with the NIF to issue to", async () => {
  await enrol("receipts");
  db.prepare("UPDATE students SET nif = '123456789', name = 'Rita Receipts' WHERE id = 'receipts'").run();
  const at = (day, hour) => ({ start: `2026-08-${day}T${hour}:00:00.000Z`, end: `2026-08-${day}T${Number(hour) + 1}:00:00.000Z` });
  booking("r-card", { owner: "receipts", payment: "paid", ...at("03", "09") });
  db.prepare("UPDATE bookings SET charged_cents = 1500, stripe_payment_intent = 'pi_card' WHERE id = 'r-card'").run();
  booking("r-hand", { owner: "receipts", payment: "not_required", ...at("04", "09") });
  booking("r-noshow", { owner: "receipts", payment: "paid", ...at("05", "09") });
  db.prepare("UPDATE bookings SET attendance_status = 'no_show', charged_cents = 500 WHERE id = 'r-noshow'").run();
  booking("r-fee", { owner: "receipts", payment: "not_required", ...at("06", "09") });
  db.prepare("UPDATE bookings SET status = 'cancelled', same_day_fee_status = 'paid', same_day_fee_cents = 500, same_day_fee_payment_intent = 'pi_fee' WHERE id = 'r-fee'").run();
  booking("r-due", { owner: "receipts", payment: "payment_due", ...at("07", "09") });
  booking("r-cancelled", { owner: "receipts", payment: "not_required", ...at("10", "09") });
  // A free lesson that happened, and a record: nothing to issue for either.
  booking("r-free", { owner: "receipts", payment: "free", ...at("11", "09") });
  db.prepare("UPDATE bookings SET amount_cents = 0 WHERE id = 'r-free'").run();
  booking("r-recorded", { owner: "receipts", payment: "recorded", ...at("12", "09") });
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = 'r-cancelled'").run();
  try {
    assert.equal((await call("/admin/receipts?month=2026-08", { method: "GET", user: "alice" })).status, 401);
    assert.equal((await call("/admin/receipts?month=2026-13", { method: "GET", user: "teacher" })).status, 400);
    const reply = await call("/admin/receipts?month=2026-08", { method: "GET", user: "teacher" });
    assert.equal(reply.status, 200, await reply.clone().text());
    const { month, receipts } = await reply.json();
    assert.equal(month, "2026-08");
    const mine = receipts.filter((line) => line.studentEmail === "receipts@example.invalid");
    assert.deepEqual(mine.map((line) => [line.id, line.label, line.amountCents, line.method, line.state, line.ready]), [
      ["r-card:lesson", "60-minute lesson", 1500, "card", "paid", true],
      ["r-hand:lesson", "60-minute lesson", 1500, "by hand", "paid", true],
      ["r-noshow:lesson", "No-show", 500, "card", "paid", true],
      ["r-fee:fee", "Late change fee", 500, "card", "paid", true],
      ["r-due:lesson", "60-minute lesson", 1500, "card", "due", false]
    ], "a cancelled lesson with no money moved, a free lesson and a record have no line");
    assert.ok(mine.every((line) => line.nif === "123456789" && line.studentName === "Test Student"));
    assert.equal(mine.find((line) => line.id === "r-card:lesson").stripePaymentIntent, "pi_card");
    assert.equal(mine.find((line) => line.id === "r-fee:fee").stripePaymentIntent, "pi_fee");
  } finally {
    db.prepare("DELETE FROM bookings WHERE student_id = 'receipts'").run();
  }
});
await test("only a teacher can manage expressions; drafts, exact text, publication and order survive safely", async () => {
  const migration = readFileSync(new URL("./migrations/0026-expressions.sql", import.meta.url), "utf8");
  db.exec(migration);
  const input = {
    expression: "Não é «bicho-de-sete-cabeças»!",
    meaningPt: "É possível — com calma.\nMantém-se a pontuação de Inês.",
    meaningEn: "It is not that difficult.", literalEn: "It is not a seven-headed beast.",
    examples: [], notes: "Uma nota com ‘aspas’ e «guillemets».",
    sourceUrl: "https://example.com/expression", tags: ["Aprendizagem"], imageUrl: "", imageAlt: "",
  };
  const adminCall = (path = "", options = {}) => call(`/admin/expressions${path}`, { user: "teacher", ...options });
  const endedTeacherWrite = async (path, body, prefix) => {
    const before = db.prepare("SELECT * FROM expressions ORDER BY id").all();
    beforeRun = sql => {
      if (!sql.startsWith(prefix)) return;
      beforeRun = null;
      db.prepare("UPDATE students SET session_version=session_version+1 WHERE id='teacher'").run();
    };
    try {
      assert.equal((await adminCall(path, { body })).status, 401);
      assert.deepEqual(db.prepare("SELECT * FROM expressions ORDER BY id").all(), before, "ended teacher sessions cannot mutate expressions");
    } finally {
      beforeRun = null;
      sessions.teacher = await createSession("teacher", env.BOOKING_TOKEN_SECRET, db.prepare("SELECT session_version FROM students WHERE id='teacher'").get().session_version);
    }
  };
  const list = async (options = {}) => {
    const response = await adminCall("", { method: "GET", ...options });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).expressions;
  };
  try {
    const seed = await list();
    assert.equal(seed.length, 52);
    assert.ok(seed.every((row) => row.published === 0 && row.examples.length === 0 && row.tags.length === 0));
    assert.equal(seed[0].expression, "Partir o coco a rir");
    assert.equal((await list({ token: env.ADMIN_TOKEN })).length, 52, "the shared admin fallback remains authorised");
    const ip = { "CF-Connecting-IP": "198.51.100.26" };
    for (const [path, method, body] of [["", "GET", {}], ["", "POST", input], ["/original-1", "POST", input],
      ["/original-1/publish", "POST", { published: 1 }], ["/original-1/delete", "POST", {}], ["/reorder", "POST", { ids: ["original-1"] }]]) {
      assert.equal((await adminCall(path, { user: "outsider", method, body, headers: ip })).status, 401);
    }
    assert.equal((await adminCall("", { user: null, method: "GET", headers: ip })).status, 401);
    for (const invalid of [{ published: 1 }, { meaningPt: null }, { examples: ["one", "two", "three"] },
      { tags: [3] }, { imageUrl: "https://example.com/a.webp", imageAlt: "An image" },
      { imageUrl: "/visuals/expressions/example.webp" }, { sourceUrl: "https://user:password@example.com/reference" }, { sourceUrl: "javascript:alert(1)" }]) {
      assert.equal((await adminCall("", { body: { ...input, ...invalid } })).status, 400);
    }
    await endedTeacherWrite("", input, "INSERT INTO expressions");
    const created = await adminCall("", { body: input });
    assert.equal(created.status, 201, await created.clone().text());
    let item = (await created.json()).expression;
    for (const key of Object.keys(input)) assert.deepEqual(item[key], input[key], `preserves ${key}`);
    assert.equal(item.published, 0);
    assert.equal((await adminCall(`/${item.id}/publish`, { body: { published: 1, updatedAt: item.updatedAt } })).status, 400, "a seed-like draft needs an example before publication");
    const firstVersion = item.updatedAt;
    const editedInput = { ...input, meaningPt: "Não é tão difícil como parece.", examples: ["«Vais ver: não é bicho-de-sete-cabeças!»"], imageUrl: "/visuals/expressions/example.webp", imageAlt: "Uma ilustração" };
    await endedTeacherWrite(`/${item.id}`, { ...editedInput, updatedAt: firstVersion }, "UPDATE expressions SET expression");
    const edited = await adminCall(`/${item.id}`, { body: { ...editedInput, updatedAt: firstVersion } });
    assert.equal(edited.status, 200, await edited.clone().text());
    item = (await edited.json()).expression;
    assert.deepEqual(item.examples, editedInput.examples);
    assert.equal(item.meaningPt, editedInput.meaningPt);
    assert.equal((await adminCall(`/${item.id}`, { body: { ...input, updatedAt: firstVersion } })).status, 409, "a stale editor cannot overwrite her work");
    await endedTeacherWrite(`/${item.id}/publish`, { published: 1, updatedAt: item.updatedAt }, "UPDATE expressions SET published");
    const published = await adminCall(`/${item.id}/publish`, { body: { published: 1, updatedAt: item.updatedAt } });
    assert.equal(published.status, 200);
    item = (await published.json()).expression;
    assert.equal(item.published, 1);
    assert.equal((await adminCall(`/${item.id}`, { body: { ...editedInput, examples: [], updatedAt: item.updatedAt } })).status, 400, "published content remains complete");
    assert.equal((await call("/expressions", { method: "GET", user: "alice" })).status, 404, "no anonymous catalogue endpoint");
    const order = (await list()).map((row) => row.id);
    const largerOrder = Array.from({ length: 500 }, () => crypto.randomUUID());
    const orderBody = { ids: largerOrder, expectedOrder: largerOrder };
    assert.equal((await adminCall("/reorder", { body: orderBody, headers: { "Content-Length": String(JSON.stringify(orderBody).length) } })).status, 409, "a full-sized order reaches validation instead of the generic 32 KiB limit");
    const desired = [item.id, ...order.filter((id) => id !== item.id)];
    await endedTeacherWrite("/reorder", { ids: desired, expectedOrder: order }, "UPDATE expressions SET\n      sort_order");
    const reordered = await adminCall("/reorder", { body: { ids: desired, expectedOrder: order } });
    assert.equal(reordered.status, 200, await reordered.clone().text());
    const afterOrder = (await reordered.json()).expressions;
    assert.deepEqual(afterOrder.map((row) => row.id), desired);
    assert.deepEqual(afterOrder[0].examples, editedInput.examples);
    assert.equal((await adminCall("/reorder", { body: { ids: desired, expectedOrder: order } })).status, 409);
    item = afterOrder[0];
    const unpublished = await adminCall(`/${item.id}/publish`, { body: { published: 0, updatedAt: item.updatedAt } });
    assert.equal(unpublished.status, 200);
    item = (await unpublished.json()).expression;
    assert.equal(item.published, 0);
    await endedTeacherWrite(`/${item.id}/delete`, { updatedAt: item.updatedAt }, "DELETE FROM expressions");
    assert.equal((await adminCall(`/${item.id}/delete`, { body: { updatedAt: item.updatedAt } })).status, 200);
    assert.ok(!(await list()).some((row) => row.id === item.id));
    db.prepare("UPDATE expressions SET meaning_pt = 'Reviewed by teacher' WHERE id = 'original-1'").run();
    db.exec(migration);
    assert.equal(db.prepare("SELECT meaning_pt FROM expressions WHERE id = 'original-1'").get().meaning_pt, "Reviewed by teacher", "repeating the import preserves review edits");
  } finally { db.exec("DELETE FROM expressions"); }
});

await test("expression picks stay closed until EXPRESSIONS_FOR_STUDENTS is \"1\", then are personal, published-only, atomic and safe to retry across visits", async () => {
  db.exec(readFileSync(new URL("./migrations/0026-expressions.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("./migrations/0027-expression-picks.sql", import.meta.url), "utf8"));
  for (const id of ["expression-a", "expression-b"]) { student(id); sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET); }
  const publish = (id, value = 1) => db.prepare("UPDATE expressions SET published = ?, examples = '[\"Exemplo de revisão.\"]' WHERE id = ?").run(value, id);
  const current = async (user) => {
    const response = await call("/me/expressions", { method: "GET", user });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const pick = async (user, requestId = crypto.randomUUID()) => {
    const response = await call("/me/expressions/pick", { user, body: { requestId } });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const openToStudents = async () => (await (await call("/admin/expressions", { method: "GET", user: "teacher" })).json()).openToStudents;
  try {
    // Closed by default (14 October 2026, Dan: "not for students just for
    // ines currently"): even with a published expression, a student reads an
    // empty collection and cannot pick, and nothing is written.
    publish("original-1");
    assert.equal(env.EXPRESSIONS_FOR_STUDENTS, undefined);
    assert.deepEqual(await current("expression-a"), { expression: null, canPick: false, hasPublished: false, shuffleLabels: [] });
    const refused = await call("/me/expressions/pick", { user: "expression-a", body: { requestId: crypto.randomUUID() } });
    assert.equal(refused.status, 404);
    assert.match((await refused.json()).error, /not open yet/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM expression_picks").get().n, 0, "a closed picker writes nothing");
    assert.equal(await openToStudents(), false, "her copy follows the same switch");
    for (const value of ["0", "true"]) {
      env.EXPRESSIONS_FOR_STUDENTS = value;
      assert.equal((await current("expression-a")).hasPublished, false, `${value} keeps them closed: only exactly "1" opens them`);
    }
    publish("original-1", 0);
    env.EXPRESSIONS_FOR_STUDENTS = "1";
    assert.equal(await openToStudents(), true);

    assert.equal((await current("expression-a")).hasPublished, false);
    for (const [path, method] of [["/me/expressions", "GET"], ["/me/expressions/pick", "POST"]]) {
      assert.equal((await call(path, { method, user: null, body: { requestId: crypto.randomUUID() } })).status, 401);
      assert.equal((await call(path, { method, user: "teacher", body: { requestId: crypto.randomUUID() } })).status, 403);
    }
    assert.equal((await call("/me/expressions/pick", { user: "expression-a", body: { requestId: crypto.randomUUID(), studentId: "expression-b", expressionId: "original-3" } })).status, 400);
    publish("original-1");
    for (const method of ["GET", "POST"]) for (const transition of ["epoch", "logout", "role"]) {
      const originalPrepare = DB.prepare;
      const bearerHash = await sessionHash(sessions["expression-a"]);
      const endSession = () => {
        if (transition === "epoch") db.prepare("UPDATE students SET session_version=session_version+1 WHERE id='expression-a'").run();
        else if (transition === "logout") db.prepare("INSERT INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)").run(bearerHash, Number(sessions["expression-a"].split(".")[1]));
        else db.prepare("UPDATE students SET role='teacher' WHERE id='expression-a'").run();
      };
      if (method === "POST") {
        beforeRun = sql => { if (sql.startsWith("INSERT INTO expression_picks")) { beforeRun = null; endSession(); } };
      } else {
        DB.prepare = sql => {
          const statement = originalPrepare(sql);
          if (sql.startsWith("SELECT p.expression_id")) {
            DB.prepare = originalPrepare;
            const first = statement.first.bind(statement);
            statement.first = () => { endSession(); return first(); };
          }
          return statement;
        };
      }
      try {
        const response = await call(method === "POST" ? "/me/expressions/pick" : "/me/expressions", {
          method, user: "expression-a", body: { requestId: crypto.randomUUID() }
        });
        assert.equal(response.status, transition === "role" ? 403 : 401, `${method} must recheck ${transition}`);
        assert.equal((await response.json()).hasPublished, undefined, "ended sessions receive no collection data");
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM expression_picks WHERE student_id='expression-a'").get().n, 0, "ended sessions never consume an expression");
      } finally {
        DB.prepare = originalPrepare; beforeRun = null;
        db.prepare("UPDATE students SET role='student' WHERE id='expression-a'").run();
        db.prepare("DELETE FROM revoked_sessions WHERE token_hash=?").run(bearerHash);
        sessions["expression-a"] = await createSession("expression-a", env.BOOKING_TOKEN_SECRET,
          db.prepare("SELECT session_version FROM students WHERE id='expression-a'").get().session_version);
      }
    }
    const requestId = crypto.randomUUID();
    const [first, retry] = await Promise.all([pick("expression-a", requestId), pick("expression-a", requestId)]);
    assert.equal(first.expression.id, "original-1");
    assert.equal(retry.expression.id, first.expression.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM expression_picks WHERE student_id = 'expression-a'").get().n, 1);
    assert.equal((await current("expression-b")).expression, null, "another student's history is private");
    assert.equal((await pick("expression-b", requestId)).expression.id, first.expression.id, "students have separate pools, including request IDs");
    assert.equal((await pick("expression-a")).expression, null, "an exhausted collection never automatically repeats");

    publish("original-2");
    const secondId = crypto.randomUUID();
    const simultaneous = await Promise.all([pick("expression-a", secondId), pick("expression-a")]);
    assert.deepEqual(simultaneous.flatMap((reply) => reply.expression ? [reply.expression.id] : []), ["original-2"], "two devices cannot reserve the last expression twice");
    const resumed = await current("expression-a");
    assert.equal(resumed.expression.id, "original-2");
    assert.equal(resumed.canPick, false);
    assert.deepEqual(resumed.shuffleLabels, [], "the reel does not leak unpublished drafts");
    assert.equal((await current("expression-b")).canPick, true);
    assert.equal((await pick("expression-a", requestId)).expression.id, "original-1", "a delayed retry still returns its original result");
    publish("original-1", 0);
    assert.equal((await pick("expression-a", requestId)).expression, null, "an old request cannot reopen withdrawn teaching content");
    publish("original-1");
    assert.equal((await current("expression-a")).canPick, false, "unpublishing and republishing does not erase a student's history");
    publish("original-3");
    assert.equal((await pick("expression-a")).expression.id, "original-3", "new published material becomes available");
    assert.equal(db.prepare("SELECT COUNT(DISTINCT expression_id) AS n FROM expression_picks WHERE student_id = 'expression-a'").get().n, 3);
  } finally {
    delete env.EXPRESSIONS_FOR_STUDENTS;
    db.exec("DELETE FROM expression_picks; DELETE FROM expressions; DELETE FROM students WHERE id IN ('expression-a', 'expression-b');");
  }
});

await test("her student list says who is in and who has a card, and she can send anyone a fresh way in", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  db.prepare("INSERT INTO students (id,email,name,password_hash,created_at) VALUES ('launch-check','launch-check-0000@example.invalid','Launch Verification','x','2026-09-05T08:56:55.286Z')").run();
  student("setup-empty"); student("setup-past");
  db.prepare("UPDATE students SET stripe_customer_id=NULL WHERE id='setup-empty'").run();
  booking("setup-past-only", { owner: "setup-past", start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T10:00:00.000Z" });
  db.prepare("UPDATE bookings SET student_id=NULL WHERE id='setup-past-only'").run();
  const listed = await call("/admin/students", { method: "GET", user: "teacher" });
  assert.equal(listed.status, 200);
  const { students, cardsAccepted } = await listed.json();
  db.prepare("DELETE FROM students WHERE id='launch-check'").run();
  db.prepare("DELETE FROM bookings WHERE id='setup-past-only'").run();
  db.prepare("DELETE FROM students WHERE id IN ('setup-empty','setup-past')").run();
  assert.ok(!students.some((row) => row.id === "teacher"), "her own account is not a student");
  assert.ok(!students.some((row) => row.id === "launch-check"), "a live check's throwaway account is not a student");
  const setupEmpty = students.find(row => row.id === "setup-empty");
  const setupPast = students.find(row => row.id === "setup-past");
  assert.deepEqual([setupEmpty.hasCard, setupEmpty.hasLessons], [false, false], "a card needs its Stripe customer too");
  assert.deepEqual([setupPast.hasCard, setupPast.cardForAllLessons, setupPast.hasLessons, setupPast.nextLessonAt], [true, false, true, null], "a legacy confirmed lesson counts without confusing a saved card with payment consent");
  const alice = students.find((row) => row.id === "alice");
  assert.deepEqual([alice.cardForAllLessons, typeof alice.unpaidUpcoming], [false, "number"]);
  assert.equal(cardsAccepted, true);
  assert.equal((await call("/admin/students", { method: "GET", user: "alice" })).status, 401);

  captureEmail();
  try {
    assert.equal((await call("/admin/students/alice/welcome", { user: "bob" })).status, 401);
    assert.equal((await call("/admin/students/teacher/welcome", { user: "teacher" })).status, 404);
    const sent = await call("/admin/students/alice/welcome", { user: "teacher" });
    assert.equal(sent.status, 200, await sent.clone().text());
    assert.equal((await sent.json()).card, true);
    const [mail] = sentEmails.filter((entry) => entry.to[0] === "alice@example.invalid");
    // With no lesson to come, they are asked to book one, card first.
    assert.equal(mail.subject, "Book your next lesson with Inês");
    assert.ok(["Three quick steps", "2. Add your card.", "Choose a time"].every((line) => mail.text.includes(line)), mail.text);
    // A first email that says "password" or puts the card in its button is read as phishing.
    assert.ok(!/password|Sign in and add card/i.test(`${mail.subject}\n${mail.text}`), mail.text);
    assert.ok(signInLinkIn(mail));
    assert.equal((await call("/admin/students/alice/welcome", { user: "teacher" })).status, 200);
    assert.equal((await call("/admin/students/alice/welcome", { user: "teacher" })).status, 200);
    assert.equal((await call("/admin/students/alice/welcome", { user: "teacher" })).status, 429, "three an hour");
  } finally {
    releaseEmail();
    db.prepare("DELETE FROM sign_in_links WHERE student_id='alice'").run();
  }
});
await test("homework: private drafts, teacher review, lesson ownership and saved answers", async () => {
  db.prepare("DELETE FROM request_limits WHERE key LIKE 'admin-fail:%'").run();
  // Earlier auth tests deliberately revoke these accounts' original sessions.
  for (const id of ["alice", "bob"]) {
    db.prepare("UPDATE students SET session_version = session_version + 1 WHERE id = ?").run(id);
    sessions[id] = await createSession(id, env.BOOKING_TOKEN_SECRET, db.prepare("SELECT session_version FROM students WHERE id = ?").get(id).session_version);
  }
  const id = linkedBooking("homework-private");
  const route = `/admin/lessons/${id}/homework`;
  const sheet = {
    title: "No café", objective: "Pedir uma bebida com clareza.", reminder: "Amanhã, recorda o teu pedido sem olhar.",
    sections: [{ title: "Pratica", instruction: "Completa o pedido.", example: "Um chá, por favor.",
      questions: [
        { prompt: "Completa: Queria um ____, por favor.", answer: "café", explanation: "Mantém o acento.", marking: "exact", acceptedAnswers: ["café", "um café"] },
        { prompt: "Faz um pedido.", answer: "Queria um chá.", explanation: "Há outras respostas possíveis.", marking: "written", acceptedAnswers: [] },
      ] }],
  };
  const input = { notes: "Private teacher notes: café, chá, queria, por favor", level: "A1", minutes: 10, sheet, updatedAt: null };
  const endedTeacherWrite = async (path, body, prefix) => {
    const before = db.prepare("SELECT * FROM lesson_homework WHERE booking_id=?").get(id);
    const progress = db.prepare("SELECT * FROM homework_progress WHERE booking_id=?").get(id);
    beforeRun = sql => {
      if (!sql.startsWith(prefix)) return;
      beforeRun = null;
      db.prepare("UPDATE students SET session_version=session_version+1 WHERE id='teacher'").run();
    };
    try {
      assert.equal((await call(path, { user: "teacher", body })).status, 401);
      assert.deepEqual(db.prepare("SELECT * FROM lesson_homework WHERE booking_id=?").get(id), before);
      assert.deepEqual(db.prepare("SELECT * FROM homework_progress WHERE booking_id=?").get(id), progress);
    } finally {
      beforeRun = null;
      sessions.teacher = await createSession("teacher", env.BOOKING_TOKEN_SECRET, db.prepare("SELECT session_version FROM students WHERE id='teacher'").get().session_version);
    }
  };
  assert.equal((await call(route, { user: "bob", body: input })).status, 401);
  await endedTeacherWrite(route, input, "INSERT INTO lesson_homework");
  const created = await call(route, { user: "teacher", body: input });
  assert.equal(created.status, 200, await created.clone().text());
  const draft = await created.json();
  assert.equal(draft.sheet.sections[0].questions[0].id, "q1");
  assert.equal((await call(`/me/homework/${id}`, { method: "GET" })).status, 404);
  assert.ok(!(await (await call("/me/homework", { method: "GET" })).json()).homework.some(item => item.bookingId === id));
  assert.equal((await call(`${route}/publish`, { user: "teacher", body: { ...input, updatedAt: draft.updatedAt } })).status, 400, "review is required");
  assert.equal((await call(route, { user: "teacher", body: input })).status, 409, "a stale draft cannot overwrite newer work");
  await endedTeacherWrite(`${route}/publish`, { ...input, updatedAt: draft.updatedAt, reviewed: true }, "UPDATE lesson_homework");
  const published = await call(`${route}/publish`, { user: "teacher", body: { ...input, updatedAt: draft.updatedAt, reviewed: true } });
  assert.equal(published.status, 200, await published.clone().text());
  const publicVersion = await (await call(`/me/homework/${id}`, { method: "GET" })).json();
  assert.equal(publicVersion.sheet.title, "No café");
  assert.equal(publicVersion.aiMarking, false, "students are not told about AI checks while AI is off");
  assert.ok(!JSON.stringify(publicVersion).includes("Private teacher notes"));
  assert.equal((await call(`/me/homework/${id}`, { user: "bob", method: "GET" })).status, 404);
  assert.equal((await call(`/me/homework/${id}`, { user: "bob", body: { answers: { q1: "Wrong account" }, updatedAt: null, completed: true } })).status, 404);
  assert.equal((await call(`/me/homework/${id}`, { body: { answers: { q99: "Wrong question" }, updatedAt: null } })).status, 400);
  const answer = { answers: { q1: "  CAFÉ.  ", q2: "Queria uma água." }, updatedAt: null };
  const answered = await call(`/me/homework/${id}`, { body: answer });
  assert.equal(answered.status, 200);
  const progress = (await answered.json()).progress;
  assert.equal((await call(`/me/homework/${id}`, { body: { ...answer, answers: { q1: "Stale tab" } } })).status, 409);
  const completed = await call(`/me/homework/${id}/submit`, { body: { ...answer, updatedAt: progress.updatedAt } });
  assert.equal(completed.status, 200);
  const sent = (await completed.json()).progress;
  assert.ok(sent.submission.submittedAt);
  assert.equal(sent.submission.marks, undefined, "marks stay private before approval, including POST replies");
  assert.equal((await (await call(`/me/homework/${id}`, { method: "GET" })).json()).progress.submission.marks, undefined);
  assert.equal((await call(`/me/homework/${id}`, { body: { ...answer, updatedAt: sent.updatedAt, answers: { q1: "Changed while awaiting review" } } })).status, 409);
  const teacher = await (await call(route, { user: "teacher", method: "GET" })).json();
  const attempt = teacher.progress.submission;
  assert.equal(attempt.marks.q1.status, "correct", "case, final punctuation and whitespace are harmless");
  assert.equal(attempt.marks.q2.status, "review", "open answers are never falsely graded when AI is off");
  assert.equal(teacher.progress.answers.q1, answer.answers.q1.trim());
  const returnBody = { submissionId: attempt.id, updatedAt: teacher.progress.updatedAt, marks: attempt.marks, approved: true };
  assert.equal((await call(`${route}/return`, { user: "teacher", body: returnBody })).status, 400, "unresolved answers require teacher judgement");
  const marks = { ...attempt.marks, q2: { status: "correct", feedback: "Muito bem. Fizeste um pedido claro." } };
  assert.equal((await call(`${route}/return`, { body: { ...returnBody, marks } })).status, 401, "students cannot approve their own marks");
  assert.equal((await call(`${route}/return`, { user: "teacher", body: { ...returnBody, marks, approved: false } })).status, 400);
  await endedTeacherWrite(`${route}/return`, { ...returnBody, marks }, "UPDATE homework_progress SET submission_json");
  const returned = await call(`${route}/return`, { user: "teacher", body: { ...returnBody, marks } });
  assert.equal(returned.status, 200, await returned.clone().text());
  const feedback = (await (await call(`/me/homework/${id}`, { method: "GET" })).json()).progress;
  assert.ok(feedback.submission.returnedAt);
  assert.equal(feedback.submission.marks.q2.feedback, marks.q2.feedback);
  assert.equal(feedback.submission.automaticMarks, undefined, "unapproved earlier suggestions never leak beside approved marks");
  assert.equal((await call(`${route}/return`, { user: "teacher", body: { ...returnBody, marks } })).status, 409, "a stale review cannot overwrite a returned one");
  const newAttempt = await call(`/me/homework/${id}/submit`, { body: { answers: { q1: "cafe", q2: "Queria uma água." }, updatedAt: feedback.updatedAt } });
  assert.equal(newAttempt.status, 200);
  const again = await (await call(route, { user: "teacher", method: "GET" })).json();
  assert.equal(again.progress.submission.marks.q1.status, "retry", "meaningful accents are not stripped");
  const returnedStudents = await (await call("/admin/students", { user: "teacher", method: "GET" })).json();
  assert.ok(returnedStudents.students.find(student => student.id === "alice").homeworkToReview.some(item => item.bookingId === id));
  assert.equal((await call(route, { user: "teacher", body: { ...input, updatedAt: teacher.updatedAt } })).status, 409, "published questions cannot invalidate saved answers");

  // An old request must not read the recovered account's feedback, retry a
  // submission into that feedback, or write answers after its session ends.
  const prepare = DB.prepare;
  for (const [operation, transition] of [["insert", "recovery"], ["insert", "logout"], ["update", "recovery"], ["update", "logout"],
    ["read", "recovery"], ["retry", "recovery"], ["list", "logout"]]) {
    const account = `homework-${operation}-${transition}`;
    student(account); sessions[account] = await createSession(account, env.BOOKING_TOKEN_SECRET);
    const hash = await sessionHash(sessions[account]);
    const lessonId = linkedBooking(account, { owner: account });
    const teacherRoute = `/admin/lessons/${lessonId}/homework`;
    let transitioned = false;
    const invalidate = () => {
      transitioned = true;
      if (transition === "recovery") db.prepare("UPDATE students SET session_version = session_version + 1 WHERE id = ?").run(account);
      else db.prepare("INSERT INTO revoked_sessions(token_hash, expires_at) VALUES (?, ?)").run(hash, Date.now() + 3600000);
    };
    try {
      const created = await (await call(teacherRoute, { user: "teacher", body: input })).json();
      assert.equal((await call(`${teacherRoute}/publish`, { user: "teacher", body: { ...input, updatedAt: created.updatedAt, reviewed: true } })).status, 200);
      if (operation !== "insert") db.prepare(`INSERT INTO homework_progress
        (booking_id, student_id, answers_json, submission_json, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(lessonId, account, JSON.stringify(feedback.answers), JSON.stringify(feedback.submission), feedback.completedAt, feedback.updatedAt);
      const before = db.prepare("SELECT * FROM homework_progress WHERE booking_id = ?").get(lessonId);
      if (operation === "insert" || operation === "update") beforeRun = sql => {
        if (!sql.startsWith(operation === "insert" ? "INSERT INTO homework_progress" : "UPDATE homework_progress SET answers_json")) return;
        beforeRun = null; invalidate();
      };
      else DB.prepare = sql => {
        const statement = prepare(sql);
        const method = operation === "list" ? "all" : "first";
        if (operation === "list" ? sql.startsWith("SELECT h.booking_id, b.starts_at") : sql.startsWith("SELECT * FROM homework_progress")) {
          const read = statement[method];
          statement[method] = () => { DB.prepare = prepare; invalidate(); return read(); };
        }
        return statement;
      };
      const response = await call(operation === "list" ? "/me/homework" : `/me/homework/${lessonId}${["insert", "retry"].includes(operation) ? "/submit" : ""}`, {
        user: account, method: ["read", "list"].includes(operation) ? "GET" : "POST",
        body: operation === "retry" ? { answers: feedback.submission.answers, updatedAt: feedback.updatedAt }
          : { answers: { q1: "Must not survive this transition", q2: "Queria uma água." }, updatedAt: before?.updated_at ?? null },
      });
      assert.equal(transitioned, true, `${operation} overlaps ${transition}`);
      assert.equal(response.status, 401, `${operation} refuses the ended session`);
      assert.deepEqual(db.prepare("SELECT * FROM homework_progress WHERE booking_id = ?").get(lessonId), before, "ended sessions neither save answers nor replace the submission");
    } finally {
      beforeRun = null; DB.prepare = prepare;
      db.prepare("DELETE FROM bookings WHERE id = ?").run(lessonId);
      db.prepare("DELETE FROM revoked_sessions WHERE token_hash = ?").run(hash);
      db.prepare("DELETE FROM students WHERE id = ?").run(account);
      delete sessions[account];
    }
  }
  // Old linkage must never expose homework after the booking changes owner.
  db.prepare("UPDATE bookings SET student_id = 'bob' WHERE id = ?").run(id);
  assert.equal((await call(`/me/homework/${id}`, { method: "GET" })).status, 404);
  assert.equal((await call(`/me/homework/${id}`, { user: "bob", method: "GET" })).status, 404);
  assert.equal((await call(route, { user: "teacher", method: "GET" })).status, 409);
});

await test("homework accepts valid large sheets and answers and refuses writes after concurrent cancellation", async () => {
  const id = linkedBooking("homework-large");
  const route = `/admin/lessons/${id}/homework`;
  const sheet = { title: "Ficha grande", objective: "Praticar", reminder: "Recorda amanhã",
    sections: Array.from({ length: 2 }, () => ({ title: "Secção", instruction: "Responde", example: "",
      questions: Array.from({ length: 6 }, () => ({ prompt: "Completa", answer: "á".repeat(1200), explanation: "", marking: "exact",
        acceptedAnswers: Array.from({ length: 8 }, (_, i) => String(i) + "á".repeat(1199)) })) })) };
  const body = { notes: "Notas da aula", level: "A1", minutes: 15, sheet, updatedAt: null };
  const raw = JSON.stringify(body);
  assert.ok(Buffer.byteLength(raw) > 65536);
  const saved = await call(route, { user: "teacher", raw, headers: { "Content-Length": String(Buffer.byteLength(raw)) } });
  assert.equal(saved.status, 200, await saved.clone().text());
  const draft = await saved.json();
  assert.equal((await call(`${route}/publish`, { user: "teacher", body: { ...body, updatedAt: draft.updatedAt, reviewed: true } })).status, 200);
  const answers = { answers: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`q${i + 1}`, "á".repeat(3000)])), updatedAt: null };
  assert.ok(Buffer.byteLength(JSON.stringify(answers)) > 65536);
  assert.equal((await call(`/me/homework/${id}`, { body: answers })).status, 200);
  assert.equal((await call(route, { user: "teacher", headers: { "Content-Length": "1048577" } })).status, 413);
  assert.equal((await call(`/me/homework/${id}`, { body: answers, headers: { "Content-Length": "262145" } })).status, 413);

  const changed = linkedBooking("homework-concurrent-cancel");
  const changedRoute = `/admin/lessons/${changed}/homework`;
  let previous = null;
  for (const existing of [false, true]) {
    db.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(changed);
    if (existing) {
      const response = await call(changedRoute, { user: "teacher", body });
      assert.equal(response.status, 200);
      previous = (await response.json()).updatedAt;
    }
    beforeRun = sql => {
      if (!/^(?:INSERT INTO|UPDATE) lesson_homework/.test(sql)) return;
      beforeRun = null;
      db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(changed);
    };
    try {
      const response = await call(changedRoute, { user: "teacher", body: { ...body, notes: "Must not be saved", updatedAt: previous } });
      assert.equal(response.status, 409, await response.clone().text());
      assert.equal(db.prepare("SELECT notes FROM lesson_homework WHERE booking_id=?").get(changed)?.notes, existing ? body.notes : undefined);
    } finally { beforeRun = null; }
  }
});
await test("homework defaults: a new sheet starts at the student's latest earlier level and 15 minutes", async () => {
  const at = day => ({ start: `2026-${day}T09:00:00.000Z`, end: `2026-${day}T10:00:00.000Z` });
  const earlier = linkedBooking("homework-level-earlier", at("09-20"));
  const current = linkedBooking("homework-level-current", at("09-27"));
  const later = linkedBooking("homework-level-later", at("10-04"));
  const draft = level => ({ notes: "Pretérito perfeito: fui, comi, vi.", level, minutes: 20, sheet: null, updatedAt: null });
  assert.equal((await call(`/admin/lessons/${earlier}/homework`, { user: "teacher", body: draft("B1") })).status, 200);
  assert.equal((await call(`/admin/lessons/${later}/homework`, { user: "teacher", body: draft("B2") })).status, 200);
  const fresh = await (await call(`/admin/lessons/${current}/homework`, { user: "teacher", method: "GET" })).json();
  assert.deepEqual([fresh.level, fresh.minutes, fresh.notes, fresh.updatedAt], ["B1", 15, "", null], "the latest earlier sheet's level; a later lesson's draft does not count");
  const saved = await (await call(`/admin/lessons/${current}/homework`, { user: "teacher", body: { ...draft("A2"), minutes: 10 } })).json();
  assert.deepEqual([saved.level, saved.minutes], ["A2", 10], "Inês's own choice for this lesson outlives the default");
  const firstSheet = linkedBooking("homework-level-first", { ...at("09-27"), owner: "bob" });
  assert.equal((await (await call(`/admin/lessons/${firstSheet}/homework`, { user: "teacher", method: "GET" })).json()).level, "A1", "a student's first sheet starts at A1");
});

await test("homework AI: bounded photo upload, reviewed notes, provider failure and shared usage ceiling", async () => {
  const id = linkedBooking("homework-ai");
  const route = `/admin/lessons/${id}/homework`;
  const beforeFetch = globalThis.fetch;
  let requests = 0, broken = false, refused = false, chatty = false, markingBody, revokeTeacherDuringAi = false;
  const image = `data:image/jpeg;base64,${btoa("\xff\xd8\xff" + "x".repeat(40000))}`;
  env.HOMEWORK_AI_ENABLED = "1"; env.ANTHROPIC_API_KEY = "isolated-ai-key"; env.HOMEWORK_AI_MONTHLY_LIMIT = "4";
  db.prepare("DELETE FROM homework_ai_usage").run();
  const reply = (name, input) => Response.json({ type: "message", role: "assistant", stop_reason: "tool_use",
    content: [{ type: "thinking", thinking: "", signature: "isolated" }, { type: "tool_use", id: "toolu_isolated", name, input }] });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.redirect, "manual", "the API key and lesson material never follow a redirect");
    requests++;
    const input = JSON.parse(options.body);
    assert.equal(options.headers["x-api-key"], "isolated-ai-key");
    assert.equal(options.headers["anthropic-version"], "2023-06-01");
    assert.equal(input.model, "claude-opus-5-5", "the default model");
    assert.ok(input.max_tokens <= 8000, "a bounded response");
    assert.equal(input.thinking, undefined, "no extended thinking is requested");
    assert.equal(input.output_config.effort, "low");
    assert.equal(input.speed, undefined, "homework must not inherit a paid speed upgrade");
    assert.equal(input.tools.length, 1);
    assert.equal(input.tools[0].strict, true);
    assert.equal(input.tool_choice.type, "auto", "current models reject forced tool choice");
    const name = input.tools[0].name;
    if (broken) return Response.json({ error: "private provider diagnostic" }, { status: 500 });
    if (name === "homework_marking") {
      assert.ok(!JSON.stringify(input.messages).includes("private teacher-only note"), "grading uses questions and answers, not private notes");
      const duplicate = await call(`/me/homework/${id}/submit`, { body: markingBody });
      assert.equal(duplicate.status, 200);
      assert.equal((await duplicate.json()).progress.submission.state, "marking", "an in-flight retry reuses the claimed attempt without a second bill");
      const attempt = await (await call(route, { user: "teacher", method: "GET" })).json();
      assert.equal((await call(`${route}/return`, { user: "teacher", body: { submissionId: attempt.progress.submission.id, updatedAt: attempt.progress.updatedAt, approved: true } })).status, 409);
      // Recovery can end the student's request while the already-saved
      // attempt is being marked. Its teacher review must still finish.
      db.prepare("UPDATE students SET session_version = session_version + 1 WHERE id = 'alice'").run();
      return reply(name, { marks: [{ id: "q1", status: "correct", feedback: "O teu pedido está correto." }] });
    }
    if (name === "lesson_transcription") {
      if (revokeTeacherDuringAi) db.prepare("UPDATE students SET session_version=session_version+1 WHERE id='teacher'").run();
      const images = input.messages[0].content.filter(part => part.type === "image");
      assert.equal(images.length, 2, "several photos share one paid request");
      assert.equal(images[0].source.type, "base64");
      assert.equal(images[0].source.media_type, "image/jpeg");
      assert.ok(!images[0].source.data.startsWith("data:"), "the data URL prefix is not sent as image data");
    }
    if (name === "lesson_homework" && refused) return Response.json({ type: "message", stop_reason: "refusal", content: [] });
    if (name === "lesson_homework" && chatty) return Response.json({ type: "message", stop_reason: "end_turn", content: [{ type: "text", text: "Here is a sheet: …" }] });
    return reply(name, name === "lesson_transcription" ? { notes: "No café: queria um café, por favor.", uncertain: ["Last word is unclear."] } : {
      title: "No café", objective: "Pedir no café.", reminder: "Recorda amanhã.",
      sections: [{ title: "Pratica", instruction: "Faz um pedido.", example: "", questions: [{ prompt: "Pede um café.", answer: "Queria um café, por favor.", explanation: "" }] }],
    });
  };
  try {
    const raw = JSON.stringify({ images: [image, image], updatedAt: null });
    assert.equal((await call(`${route}/transcribe`, { user: "bob", raw, headers: { "Content-Length": String(raw.length) } })).status, 401);
    assert.equal(requests, 0, "unauthorised uploads never call a paid provider");
    assert.equal((await call(`${route}/transcribe`, { user: "teacher", body: { image: "https://private.example/photo", updatedAt: null } })).status, 400, "an older tab's single photo is still validated");
    assert.equal((await call(`${route}/transcribe`, { user: "teacher", body: { images: [image, image, image, image], updatedAt: null } })).status, 400, "four photos are too many");
    assert.equal((await call(`${route}/transcribe`, { user: "teacher", body: { images: [image, "https://private.example/photo"], updatedAt: null } })).status, 400, "every photo is checked");
    assert.equal(requests, 0, "rejected photos never reach the provider");
    beforeRun = sql => {
      if (!sql.startsWith("INSERT INTO homework_ai_usage")) return;
      beforeRun = null;
      db.prepare("UPDATE students SET session_version=session_version+1 WHERE id='teacher'").run();
    };
    assert.equal((await call(`${route}/transcribe`, { user: "teacher", raw })).status, 401);
    assert.equal(requests, 0, "ending a teacher session before the usage claim prevents paid AI work");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM homework_ai_usage").get().n, 0);
    sessions.teacher = await createSession("teacher", env.BOOKING_TOKEN_SECRET, db.prepare("SELECT session_version FROM students WHERE id='teacher'").get().session_version);
    const read = await call(`${route}/transcribe`, { user: "teacher", raw, headers: { "Content-Length": String(raw.length) } });
    assert.equal(read.status, 200, await read.clone().text());
    assert.equal((await read.json()).uncertain.length, 1);
    const input = { notes: "Queria um café, por favor. Pedidos no café.", level: "A1", minutes: 10, updatedAt: null };
    const generated = await call(`${route}/generate`, { user: "teacher", body: input });
    assert.equal(generated.status, 200, await generated.clone().text());
    const draft = await generated.json();
    assert.equal(draft.publishedAt, null);
    assert.equal((await call(`/me/homework/${id}`, { method: "GET" })).status, 404);
    broken = true;
    const failed = await call(`${route}/generate`, { user: "teacher", body: { ...input, updatedAt: draft.updatedAt } });
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("private provider diagnostic"));
    assert.equal((await (await call(route, { user: "teacher", method: "GET" })).json()).updatedAt, draft.updatedAt, "a failed generation leaves the draft alone");
    broken = false;
    const published = await call(`${route}/publish`, { user: "teacher", body: { ...input, notes: "private teacher-only note", sheet: draft.sheet, updatedAt: draft.updatedAt, reviewed: true } });
    assert.equal(published.status, 200);
    markingBody = { answers: { q1: "Queria um chá, por favor." }, updatedAt: null };
    assert.equal((await call(`/me/homework/${id}/submit`, { user: "bob", body: markingBody })).status, 404);
    const marked = await call(`/me/homework/${id}/submit`, { body: markingBody });
    assert.equal(marked.status, 401, "account recovery ends the response without discarding the saved marking");
    sessions.alice = await createSession("alice", env.BOOKING_TOKEN_SECRET, db.prepare("SELECT session_version FROM students WHERE id = 'alice'").get().session_version);
    const studentProgress = await (await call(`/me/homework/${id}`, { method: "GET" })).json();
    assert.equal(studentProgress.progress.submission.marks, undefined, "AI suggestions cannot bypass teacher approval");
    const graded = await (await call(route, { user: "teacher", method: "GET" })).json();
    assert.equal(graded.progress.submission.marks.q1.source, "ai");
    assert.equal(graded.progress.submission.marks.q1.status, "correct");
    assert.equal((await call(`/me/homework/${id}/submit`, { body: markingBody })).status, 200, "lost-response retry is idempotent");
    const secondLesson = linkedBooking("homework-ai-limit");
    assert.equal((await call(`/admin/lessons/${secondLesson}/homework/generate`, { user: "teacher", body: input })).status, 429);
    assert.equal(requests, 4, "the monthly ceiling covers transcription, generation, marking and failed requests");
    const manual = await call(`/admin/lessons/${secondLesson}/homework`, { user: "teacher", body: { ...input, sheet: draft.sheet } });
    const manualDraft = await manual.json();
    assert.equal((await call(`/admin/lessons/${secondLesson}/homework/publish`, { user: "teacher", body: { ...input, sheet: draft.sheet, updatedAt: manualDraft.updatedAt, reviewed: true } })).status, 200);
    const limitedSubmission = await call(`/me/homework/${secondLesson}/submit`, { body: markingBody });
    assert.equal(limitedSubmission.status, 200, "exhausted AI allowance must not lose the submitted work");
    const fallback = await (await call(`/admin/lessons/${secondLesson}/homework`, { user: "teacher", method: "GET" })).json();
    assert.equal(fallback.progress.submission.marks.q1.status, "review");
    assert.equal(fallback.progress.submission.state, "submitted");
    assert.equal(requests, 4, "manual review needs no paid retry");
    assert.equal((await call(`${route}/transcribe`, { user: "teacher", raw, headers: { "Content-Length": "8402000" } })).status, 413);
    const afterRecovery = linkedBooking("homework-ai-teacher-recovery");
    db.prepare("DELETE FROM homework_ai_usage").run();
    revokeTeacherDuringAi = true;
    const ended = await call(`/admin/lessons/${afterRecovery}/homework/transcribe`, { user: "teacher", raw });
    assert.equal(ended.status, 401, "a provider response cannot disclose private transcription after teacher recovery");
    assert.ok(!(await ended.text()).includes("No café"));
    sessions.teacher = await createSession("teacher", env.BOOKING_TOKEN_SECRET, db.prepare("SELECT session_version FROM students WHERE id='teacher'").get().session_version);
  } finally {
    beforeRun = null;
    globalThis.fetch = beforeFetch;
    delete env.HOMEWORK_AI_ENABLED; delete env.ANTHROPIC_API_KEY; delete env.HOMEWORK_AI_MONTHLY_LIMIT;
  }
});

await test("homework AI: a refusal, redirect or reply without the tool call never becomes a draft", async () => {
  const id = linkedBooking("homework-ai-refusal");
  const route = `/admin/lessons/${id}/homework`;
  const beforeFetch = globalThis.fetch;
  let refusal = true, redirected = false;
  env.HOMEWORK_AI_ENABLED = "1"; env.ANTHROPIC_API_KEY = "isolated-ai-key";
  db.prepare("DELETE FROM homework_ai_usage").run();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.redirect, "manual");
    if (redirected) return new Response("private redirect diagnostic", { status: 307, headers: { Location: "https://provider-redirect.example/messages" } });
    return Response.json(refusal ? { type: "message", stop_reason: "refusal", content: [] }
      : { type: "message", stop_reason: "end_turn", content: [{ type: "text", text: "{\"title\": \"Not a tool call\"}" }] });
  };
  try {
    const input = { notes: "Queria um café, por favor. Pedidos no café.", level: "A1", minutes: 10, updatedAt: null };
    assert.equal((await call(`${route}/generate`, { user: "teacher", body: input })).status, 422);
    refusal = false;
    assert.equal((await call(`${route}/generate`, { user: "teacher", body: input })).status, 502, "text outside the tool is not parsed as a sheet");
    redirected = true;
    const redirect = await call(`${route}/generate`, { user: "teacher", body: input });
    assert.equal(redirect.status, 503, "a provider redirect fails without forwarding credentials or lesson material");
    assert.ok(!(await redirect.text()).includes("private redirect diagnostic"));
    assert.equal((await (await call(route, { user: "teacher", method: "GET" })).json()).sheet, null);
  } finally {
    globalThis.fetch = beforeFetch;
    delete env.HOMEWORK_AI_ENABLED; delete env.ANTHROPIC_API_KEY;
  }
});

await test("homework notice: Inês is emailed once per submission, with a link and no answers or marks", async () => {
  const sheet = { title: "No café", objective: "Pedir uma bebida.", reminder: "Recorda amanhã.",
    sections: [{ title: "Pratica", instruction: "Faz um pedido.", example: "", questions: [
      { prompt: "Completa: Queria um ____.", answer: "café", explanation: "", marking: "exact", acceptedAnswers: ["café"] },
      { prompt: "Faz um pedido.", answer: "Queria um chá.", explanation: "", marking: "written", acceptedAnswers: [] }] }] };
  async function published(name) {
    const id = linkedBooking(name);
    const body = { notes: "", level: "A1", minutes: 10, sheet, updatedAt: null };
    const draft = await (await call(`/admin/lessons/${id}/homework`, { user: "teacher", body })).json();
    assert.equal((await call(`/admin/lessons/${id}/homework/publish`, { user: "teacher", body: { ...body, updatedAt: draft.updatedAt, reviewed: true } })).status, 200);
    ours.push(id);
    return id;
  }
  // Earlier tests leave unannounced submissions too; count only this test's lessons.
  const ours = [];
  const notices = () => sentEmails.filter(email => email.subject.includes("homework") && ours.some(id => email.text.includes(id)));
  const beforeFetch = globalThis.fetch;
  const accepted = new Map();
  const attempts = [];
  let resendDown = false;
  globalThis.fetch = async (url, options) => {
    if (String(url) !== "https://api.resend.com/emails") return beforeFetch(url, options);
    const key = options.headers["Idempotency-Key"];
    assert.match(key, /^ines-email:[a-f0-9]{64}$/);
    assert.ok(options.signal, "provider calls have a bounded timeout");
    attempts.push({ key, body: options.body });
    if (resendDown) return Response.json({ message: "isolated outage" }, { status: 500 });
    if (accepted.has(key)) {
      assert.equal(options.body, accepted.get(key).body, "a provider retry uses exactly the original bytes");
      return Response.json({ id: accepted.get(key).id });
    }
    const response = await beforeFetch(url, options);
    accepted.set(key, { body: options.body, ...(await response.clone().json()) });
    return response;
  };
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0", TEACHER_NOTIFICATIONS_ENABLED: "1" });
  sentEmails.length = 0;
  try {
    const id = await published("homework-notice");
    const answers = { answers: { q1: "SEGREDO-UM", q2: "SEGREDO-DOIS" }, updatedAt: null };
    assert.equal((await call(`/me/homework/${id}/submit`, { body: answers })).status, 200);
    await drain();
    assert.equal(notices().length, 1);
    const [email] = notices();
    assert.deepEqual(email.to, ["ines@example.invalid"]);
    assert.equal(email.subject, "Test Student sent you their homework");
    assert.ok(email.html.includes(`https://lesson.example/schedule/?student=alice&amp;homework=${id}`) || email.html.includes(`https://lesson.example/schedule/?student=alice&homework=${id}`), "links to this lesson's review");
    for (const secret of ["SEGREDO", "Está certo", "A Inês vai rever", "Queria um chá"]) {
      assert.ok(!email.html.includes(secret) && !email.text.includes(secret), `no answers, answer key or marks: ${secret}`);
    }
    assert.equal((await call(`/me/homework/${id}/submit`, { body: answers })).status, 200, "a retried submit");
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx);
    await drain();
    assert.equal(notices().length, 1, "a retry or the sweep never sends a second notice");

    // A failed send is released, and the next sweep delivers it.
    const failing = await published("homework-notice-retry");
    resendDown = true;
    assert.equal((await call(`/me/homework/${failing}/submit`, { body: answers })).status, 200);
    await drain();
    resendDown = false;
    assert.equal(notices().length, 1);
    assert.equal(db.prepare("SELECT notified_submission_id FROM homework_progress WHERE booking_id = ?").get(failing).notified_submission_id, null);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx);
    await drain();
    assert.equal(notices().length, 2);

    // An accepted provider request can outlive all three local writes: the
    // sent record, failure record and homework claim release. Both leases
    // expire, and the original provider key/body recover without a second mail.
    const interrupted = await published("homework-notice-interrupted");
    let key;
    beforeRun = (sql, values) => {
      if (sql.startsWith("INSERT INTO email_log") && values[3].startsWith("teacher:homework-submitted:")) key = values[3];
      if ((/^UPDATE email_log SET status = '(?:sent|failed)'/.test(sql) && values[1] === key) ||
          (sql.startsWith("UPDATE homework_progress SET notified_submission_id = NULL") && values[0] === interrupted)) {
        throw new Error("Isolated interrupted delivery record");
      }
    };
    try {
      assert.equal((await call(`/me/homework/${interrupted}/submit`, { body: answers })).status, 200);
      await drain();
    } finally { beforeRun = null; }
    const pending = db.prepare("SELECT * FROM email_log WHERE dedupe_key = ?").get(key);
    assert.equal(pending.status, "pending");
    assert.ok(pending.request_json);
    assert.equal(notices().length, 3);
    const calls = attempts.length;
    db.prepare("UPDATE homework_progress SET notified_at = ? WHERE booking_id = ?")
      .run(new Date(Date.now() - 121000).toISOString(), interrupted);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx); await drain();
    assert.equal(attempts.length, calls, "an active provider lease cannot be sent again");
    assert.equal(db.prepare("SELECT notified_submission_id FROM homework_progress WHERE booking_id = ?").get(interrupted).notified_submission_id, null,
      "pending is not mistaken for successful notification");
    db.prepare("UPDATE email_log SET send_claim_until = ? WHERE dedupe_key = ?").run(new Date(Date.now() - 1).toISOString(), key);
    db.prepare("UPDATE bookings SET student_name = 'Changed after first send' WHERE id = ?").run(interrupted);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx); await drain();
    assert.equal(attempts.length, calls + 1);
    assert.equal(notices().length, 3, "Resend replays the original result, never another email");
    const recovered = db.prepare("SELECT * FROM email_log WHERE dedupe_key = ?").get(key);
    assert.equal(recovered.status, "sent");
    assert.equal(recovered.first_attempt_at, pending.first_attempt_at);
    assert.equal(recovered.request_json, null, "delivered messages retain no sensitive body");
    db.prepare("UPDATE homework_progress SET notified_submission_id = NULL, notified_at = NULL WHERE booking_id = ?").run(interrupted);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx); await drain();
    assert.equal(attempts.length, calls + 1, "a lost homework marker reconciles confirmed delivery without contacting the provider");
    assert.ok(db.prepare("SELECT notified_submission_id FROM homework_progress WHERE booking_id = ?").get(interrupted).notified_submission_id);

    // A claim abandoned before any email row exists is also recoverable.
    const unstarted = await published("homework-notice-unstarted");
    const snapshot = db.prepare("SELECT * FROM homework_progress WHERE booking_id = ?").get(interrupted);
    const submission = { ...JSON.parse(snapshot.submission_json), id: crypto.randomUUID() };
    db.prepare(`INSERT INTO homework_progress(booking_id, student_id, answers_json, submission_json, completed_at, updated_at, notified_submission_id, notified_at)
      VALUES (?, 'alice', ?, ?, ?, ?, ?, ?)`)
      .run(unstarted, snapshot.answers_json, JSON.stringify(submission), snapshot.completed_at, snapshot.updated_at, submission.id, new Date(Date.now() - 121000).toISOString());
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx); await drain();
    assert.equal(notices().length, 4, "an interrupted homework claim does not suppress its first send");

    // After the safe replay window, never risk a duplicate. Purge the body
    // and leave an explicit manual reconciliation record instead.
    const expiredKey = `teacher:homework-submitted:${crypto.randomUUID()}`;
    const old = new Date(Date.now() - 24 * 3600000).toISOString();
    db.prepare(`INSERT INTO email_log(kind, recipient, dedupe_key, status, created_at, request_json, first_attempt_at)
      VALUES ('teacher_homework_submitted', 'ines@example.invalid', ?, 'pending', ?, ?, ?)`)
      .run(expiredKey, old, pending.request_json, old);
    // The old Worker can write once more between applying the migration and
    // deploying this version. Such bodyless attempts are unsafe to replay too.
    const legacyKey = `late-legacy:${crypto.randomUUID()}`;
    db.prepare(`INSERT INTO email_log(kind, recipient, dedupe_key, status, created_at)
      VALUES ('student_booked', 'ana@example.invalid', ?, 'pending', ?)`)
      .run(legacyKey, new Date().toISOString());
    const legacyLifecycleKey = `late-lifecycle:${crypto.randomUUID()}`;
    db.prepare(`INSERT INTO email_log(kind, recipient, dedupe_key, status, created_at, request_json)
      VALUES ('student_series_booked', 'ana@example.invalid', ?, 'failed', ?, ?)`)
      .run(legacyLifecycleKey, new Date().toISOString(), pending.request_json);
    const beforeExpiry = attempts.length;
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx); await drain();
    assert.equal(attempts.length, beforeExpiry);
    assert.deepEqual({ ...db.prepare("SELECT status, request_json FROM email_log WHERE dedupe_key = ?").get(expiredKey) },
      { status: "unconfirmed", request_json: null });
    assert.deepEqual({ ...db.prepare("SELECT status, request_json FROM email_log WHERE dedupe_key = ?").get(legacyKey) },
      { status: "unconfirmed", request_json: null });
    assert.deepEqual({ ...db.prepare("SELECT status, request_json FROM email_log WHERE dedupe_key = ?").get(legacyLifecycleKey) },
      { status: "unconfirmed", request_json: null }, "a rollout straggler without lifecycle metadata is quarantined immediately");

    // Interrupted marking waits for the 90-second hand-off, then is announced.
    const stalled = await published("homework-notice-stalled");
    const attempt = state => JSON.stringify({ id: crypto.randomUUID(), answers: answers.answers, marks: {}, submittedAt: new Date(Date.now() - state.ago).toISOString(), returnedAt: null, state: "marking", markingNote: "" });
    db.prepare("INSERT INTO homework_progress(booking_id, student_id, answers_json, submission_json, completed_at, updated_at) VALUES (?, 'alice', ?, ?, ?, ?)")
      .run(stalled, JSON.stringify(answers.answers), attempt({ ago: 30000 }), new Date().toISOString(), new Date().toISOString());
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx);
    await drain();
    assert.equal(notices().length, 4, "not while marking may still finish");
    db.prepare("UPDATE homework_progress SET submission_json = ? WHERE booking_id = ?").run(attempt({ ago: 120000 }), stalled);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx);
    await drain();
    assert.equal(notices().length, 5);
    assert.equal(JSON.parse(db.prepare("SELECT submission_json FROM homework_progress WHERE booking_id = ?").get(stalled).submission_json).state, "submitted");

    // If another review wins while a stale marking attempt is handed off,
    // return that review rather than the original marking snapshot.
    db.prepare("UPDATE homework_progress SET submission_json = ? WHERE booking_id = ?").run(attempt({ ago: 120000 }), stalled);
    beforeRun = sql => {
      if (!sql.startsWith("UPDATE homework_progress SET submission_json = ?, updated_at = ?")) return;
      beforeRun = null;
      const review = JSON.parse(db.prepare("SELECT submission_json FROM homework_progress WHERE booking_id=?").get(stalled).submission_json);
      review.state = "returned";
      review.returnedAt = new Date().toISOString();
      db.prepare("UPDATE homework_progress SET submission_json=?, updated_at=? WHERE booking_id=?")
        .run(JSON.stringify(review), new Date(Date.now() + 1000).toISOString(), stalled);
    };
    try {
      const latest = await (await call(`/admin/lessons/${stalled}/homework`, { user: "teacher", method: "GET" })).json();
      assert.equal(latest.progress.submission.state, "returned");
    } finally { beforeRun = null; }
  } finally {
    globalThis.fetch = beforeFetch;
    Object.assign(env, { EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0" });
    delete env.TEACHER_EMAIL; delete env.RESEND_API_KEY;
  }
});

await test("homework before migration 0029: Inês's students and a student's Homework tab still load", async () => {
  // Before 0030, submissions still save; only the notice waits for the column.
  db.exec("ALTER TABLE homework_progress DROP COLUMN notified_submission_id; ALTER TABLE homework_progress DROP COLUMN notified_at");
  try {
    env.TEACHER_NOTIFICATIONS_ENABLED = "1"; env.TEACHER_EMAIL = "ines@example.invalid";
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env, ctx);
    await drain();
  } finally {
    env.TEACHER_NOTIFICATIONS_ENABLED = "0"; delete env.TEACHER_EMAIL;
    db.exec("ALTER TABLE homework_progress ADD COLUMN notified_submission_id TEXT; ALTER TABLE homework_progress ADD COLUMN notified_at TEXT");
  }
  db.exec("ALTER TABLE homework_progress RENAME TO homework_progress_pending");
  try {
    const students = await call("/admin/students", { user: "teacher", method: "GET" });
    assert.equal(students.status, 200, await students.clone().text());
    assert.deepEqual((await students.json()).students.find(student => student.id === "alice").homeworkToReview, []);
    db.exec("ALTER TABLE lesson_homework RENAME TO lesson_homework_pending");
    try {
      const list = await call("/me/homework", { method: "GET" });
      assert.equal(list.status, 200);
      assert.deepEqual((await list.json()).homework, []);
    } finally { db.exec("ALTER TABLE lesson_homework_pending RENAME TO lesson_homework"); }
  } finally { db.exec("ALTER TABLE homework_progress_pending RENAME TO homework_progress"); }
});

await test("a teacher Inês adds as a student stays a teacher, is sent nothing, and gets the student side too", async () => {
  const email = "dual-teacher@example.invalid";
  db.prepare("INSERT INTO students (id,email,name,password_hash,created_at,role,email_verified_at) VALUES ('dual',?,'Daniel Dual','',?,'teacher',?)")
    .run(email, new Date().toISOString(), new Date().toISOString());
  sessions.dual = await createSession("dual", env.BOOKING_TOKEN_SECRET);
  const ip = { "CF-Connecting-IP": "203.0.113.82" };
  captureEmail();
  try {
    // Plain teachers have no student side until she adds them.
    for (const user of ["teacher", "dual"]) {
      assert.equal((await call("/me/card", { user, body: {} })).status, 403);
      assert.equal((await call("/me/homework", { user, method: "GET" })).status, 403);
      assert.equal((await call("/me/expressions", { user, method: "GET" })).status, 403);
    }
    const added = await call("/admin/students", { user: "teacher", body: { email: "DUAL-teacher@example.invalid", name: "Not His Name", prices: { 60: 1800 } } });
    assert.equal(added.status, 201, await added.clone().text());
    assert.equal((await added.json()).student.id, "dual");
    assert.deepEqual({ ...db.prepare("SELECT name, role, also_student, awaiting_welcome FROM students WHERE email=?").get(email) },
      { name: "Daniel Dual", role: "teacher", also_student: 1, awaiting_welcome: 0 });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM students WHERE email=?").get(email).n, 1, "never a second account");
    assert.equal(db.prepare("SELECT amount_cents FROM student_recurring_rates WHERE student_id='dual'").get().amount_cents, 1800);
    assert.equal((await call("/admin/students", { user: "teacher", body: { email, name: "Again" } })).status, 409, "once is enough");
    assert.equal((await call("/admin/students", { user: "teacher", body: { email: "alice@example.invalid", name: "Again" } })).status, 409);

    // Still an admin, now with Your lessons as well.
    assert.equal((await call("/admin/students", { user: "dual", method: "GET" })).status, 200);
    const me = await (await call("/me", { user: "dual", method: "GET" })).json();
    assert.deepEqual([me.student.role, me.student.alsoStudent], ["teacher", true]);
    assert.equal((await (await call("/me", { user: "teacher", method: "GET" })).json()).student.alsoStudent, false);
    assert.equal((await call("/me/card", { user: "dual", body: {} })).status, 400, "past the gate: only the terms are missing");
    assert.equal((await call("/me/card", { user: "teacher", body: {} })).status, 403);
    assert.equal((await call("/me/homework", { user: "dual", method: "GET" })).status, 200);
    assert.equal((await call("/me/expressions", { user: "dual", method: "GET" })).status, 200);

    // Her Students tools work for them; the welcome is not theirs to receive.
    assert.ok((await (await call("/admin/students", { user: "teacher", method: "GET" })).json()).students.some((row) => row.id === "dual"));
    assert.equal((await call("/admin/students/dual/details", { user: "teacher", body: { name: "Daniel Dual", email, phone: "+351 912 000 000" } })).status, 200);
    assert.equal((await call("/admin/students/dual/prices", { user: "teacher", body: { prices: { 90: 2600 } } })).status, 200);
    assert.equal((await call("/admin/students/dual/welcome", { user: "teacher", body: {} })).status, 409);
    await drain();
    assert.equal(sentEmails.length, 0, "nothing is sent by adding them");
    const lesson = await call("/admin/bookings", { user: "teacher", body: { studentId: "dual", lessonType: "single", startAt: "2026-11-03T10:00:00.000Z" } });
    assert.equal(lesson.status, 201, await lesson.clone().text());
    await drain();

    // An emailed sign-in link is still a student's way in only.
    sentEmails.length = 0;
    assert.equal((await call("/auth/email-link", { user: null, headers: ip, body: { email } })).status, 200);
    await drain();
    assert.equal(sentEmails.length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sign_in_links WHERE student_id='dual'").get().n, 0);
  } finally {
    releaseEmail();
    delete sessions.dual;
    forgetStudent(email);
  }
});

await test("she marks students dormant and sends them her own come-back email, once a day, until a lesson wakes them", async () => {
  captureEmail();
  const to = (email) => sentEmails.filter((sent) => sent.to[0] === email);
  const listed = async (id) => (await (await call("/admin/students", { method: "GET", user: "teacher" })).json()).students.find((entry) => entry.id === id);
  const added = async (email, name) => (await (await call("/admin/students", { user: "teacher", body: { email, name } })).json()).student;
  const startedAt = clock;
  try {
    const old = await added("old-student@example.invalid", "Olga Pires");
    const other = await added("other-old@example.invalid", "Oscar Reis");
    assert.equal(old.dormant, false, "nobody starts dormant");
    const mark = (id, dormant, user = "teacher") => call(`/admin/students/${id}/dormant`, { user, body: { dormant } });
    assert.equal((await mark(old.id, true, "alice")).status, 401, "only a teacher marks a student dormant");
    assert.equal((await mark(old.id, "yes")).status, 400);
    const marked = await mark(old.id, true);
    assert.equal(marked.status, 200, await marked.clone().text());
    assert.deepEqual([(await marked.json()).student.dormant, (await listed(old.id)).dormant], [true, true]);
    assert.equal((await mark(other.id, true)).status, 200);
    assert.deepEqual(sentEmails, [], "marking someone dormant sends nothing");

    // Her words: the standard ones until she saves her own.
    const standard = await (await call("/admin/dormant-email", { method: "GET", user: "teacher" })).json();
    assert.equal(standard.subject, standard.standard.subject);
    assert.ok(standard.message.includes("new website"));
    assert.equal((await call("/admin/dormant-email", { user: "teacher", body: { subject: " ", message: "Hi" } })).status, 400);
    assert.equal((await call("/admin/dormant-email", { user: "alice", body: { subject: "Hi", message: "Hi" } })).status, 401);
    const words = { subject: "Saudades!  Come back for a lesson?", message: "It’s been too long.\r\n\r\n\r\nSee you <b>soon</b>,\nInês" };
    const saved = await call("/admin/dormant-email", { user: "teacher", body: words });
    assert.deepEqual(await saved.json(), { subject: "Saudades! Come back for a lesson?", message: "It’s been too long.\n\nSee you <b>soon</b>,\nInês" });
    assert.equal((await (await call("/admin/dormant-email", { method: "GET", user: "teacher" })).json()).subject, "Saudades! Come back for a lesson?");

    // Sent to one dormant student: the words she wrote for them, and the way in her welcome uses.
    const send = (id, body = words) => call(`/admin/students/${id}/dormant-email`, { user: "teacher", body });
    assert.equal((await call(`/admin/students/${old.id}/dormant-email`, { user: "alice", body: words })).status, 401);
    const sent = await send(old.id, { ...words, message: `Olá Olga,\n\n${words.message}` });
    assert.equal(sent.status, 200, await sent.clone().text());
    const reply = await sent.json();
    assert.ok(reply.student.dormantEmailedAt, "her list shows when it went");
    const [email] = to("old-student@example.invalid");
    assert.equal(email.subject, "Saudades! Come back for a lesson?");
    assert.ok(email.text.includes("Olá Olga,\n\nIt’s been too long.\n\nSee you <b>soon</b>,\nInês"), email.text);
    assert.equal(email.text.split("Olá").length, 2, "her greeting is the only one");
    assert.ok(email.html.includes("&lt;b&gt;soon&lt;/b&gt;") && !email.html.includes("<b>soon"), "her words are text, never markup");
    assert.ok(email.text.includes("Choose a time"));
    const link = signInLinkIn(email);
    assert.ok(link, "a student she never welcomed is given the one-click way in");
    assert.equal(db.prepare("SELECT awaiting_welcome FROM students WHERE id=?").get(old.id).awaiting_welcome, 0, "it counts as their welcome");

    // A second press, or another device, sends nothing more that day.
    assert.equal((await send(old.id)).status, 409);
    assert.equal(to("old-student@example.invalid").length, 1);

    // Not sent is not counted: she can try again at once.
    emailUnavailable = true;
    assert.equal((await send(other.id)).status, 502);
    emailUnavailable = false;
    assert.equal(db.prepare("SELECT dormant_emailed_at FROM students WHERE id=?").get(other.id).dormant_emailed_at, null);
    const firstTry = JSON.parse(db.prepare("SELECT request_json FROM email_log WHERE kind='student_dormant_invite' AND recipient=?").get("other-old@example.invalid").request_json);
    assert.equal((await send(other.id)).status, 200);
    assert.deepEqual(to("other-old@example.invalid").map((sent) => sent.text), [firstTry.text], "a retry sends the first attempt's exact request, once");

    // The link signs them in, and a day later she may send it again.
    assert.equal((await call("/auth/email-link/confirm", { user: null, body: { token: link } })).status, 200);
    clock += 25 * 3600000;
    assert.equal((await send(old.id)).status, 200);
    assert.equal(to("old-student@example.invalid").length, 2);

    // A lesson wakes them; someone with a lesson to come can't be marked dormant.
    const lesson = await call("/admin/bookings", { user: "teacher", body: { studentId: old.id, lessonType: "single", startAt: "2026-10-27T10:00:00.000Z" } });
    assert.equal(lesson.status, 201, await lesson.clone().text());
    await drain();
    assert.equal((await listed(old.id)).dormant, false, "a lesson after the mark makes them active again");
    assert.equal((await send(old.id)).status, 409, "only a dormant student is sent it");
    assert.equal((await mark(old.id, true)).status, 409);
    // Cancelled, it still brought them back; marked again, it is behind them.
    const lessonId = db.prepare("SELECT id FROM bookings WHERE reference=?").get((await lesson.json()).booking.reference).id;
    assert.equal((await call(`/admin/bookings/${lessonId}/cancel`, { user: "teacher" })).status, 200);
    await drain();
    assert.equal((await listed(old.id)).dormant, false, "a lesson booked after the mark and then cancelled keeps them active");
    assert.equal((await (await mark(old.id, true)).json()).student.dormant, true, "one cancelled before the mark never wakes them");
    // She can wake someone herself, and a student she hasn't marked is never sent it.
    assert.equal((await (await mark(other.id, false)).json()).student.dormant, false);
    assert.equal((await send(other.id)).status, 409);
    assert.equal((await send("alice")).status, 409);
  } finally {
    clock = startedAt;
    emailUnavailable = false;
    releaseEmail();
    forgetStudent("old-student@example.invalid");
    forgetStudent("other-old@example.invalid");
  }
});

console.log(`${passed} booking integration tests passed.`);
globalThis.fetch = nativeFetch;
globalThis.Date = NativeDate;
db.close();
