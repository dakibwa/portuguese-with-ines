import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { chargeDueLessons, chargeDueSameDayFees, notifySeries, retryPaymentRecovery, retryRefunds } from "./index.mjs";
import { createSession, createResetToken, hashPassword, sessionVersion } from "./auth.mjs";
import { createManageToken, readManageToken } from "./tokens.mjs";
import { findRecurringCode, recurringLessonType, priceForMove } from "./rates.mjs";
import { bookingSelection, portoWeekOf } from "./selection.mjs";
import { computeAvailability } from "./availability.mjs";

const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ["2026-09-05T10:00:00.000Z"])); }
  static now() { return new NativeDate("2026-09-05T10:00:00.000Z").getTime(); }
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
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://api.resend.com/emails") {
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
  const payload = `${encode({ alg: "RS256", kid: googleJwk.kid })}.${encode({ email_verified: true, iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, exp: Date.now() / 1000 + 3600, ...claims })}`;
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

await test("lesson history exposes each student's cancellation time independently of lesson and update dates", async () => {
  booking("history-completed", { start: "2026-09-04T09:00:00.000Z", end: "2026-09-04T10:00:00.000Z" });
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
    assert.ok(!bookings.some(row => row.reference === "history-other"));
    assert.equal((await call("/me", { method: "GET", user: null })).status, 401);
  } finally {
    db.prepare("DELETE FROM bookings WHERE id IN ('history-completed','history-cancelled','history-other')").run();
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
await test("saved rate survives catalogue removal, trial and other duration keep public price", async () => {
  const local = { ...env, PRIVATE_RECURRING_CODES: "[]" };
  assert.equal((await recurringLessonType(local, "alice", { id: "single", duration_minutes: 60, price_cents: 2500 })).price_cents, 1500);
  assert.equal((await recurringLessonType(local, "alice", { id: "trial", duration_minutes: 60, price_cents: 2000 })).price_cents, 2000);
  assert.equal((await recurringLessonType(local, "bob", { id: "long", duration_minutes: 90, price_cents: 3500 })).price_cents, 3500);
  assert.equal(await priceForMove(local, { lesson_type_id: "single", amount_cents: 1800, series_id: "series", student_id: "alice" }, { id: "single", duration_minutes: 60, price_cents: 2500 }), 1800);
  assert.equal(await priceForMove(local, { lesson_type_id: "single", amount_cents: 1800, series_id: "series", student_id: "alice" }, { id: "long", duration_minutes: 90, price_cents: 3500 }), 2700);
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
await test("recurring booking creation snapshots rate for every occurrence; one-off and tampering cannot use it", async () => {
  const payload = { lessonType: "single", startAt: "2026-09-08T09:00:00.000Z", repeat: 4, expectedPriceCents: 1500 };
  const result = await call("/bookings", { body: payload });
  assert.equal(result.status, 201, await result.clone().text());
  const rows = db.prepare("SELECT amount_cents FROM bookings WHERE series_id IS NOT NULL").all();
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.amount_cents === 1500));
  assert.equal((await call("/bookings", { body: { ...payload, startAt: "2026-09-08T12:00:00.000Z", expectedPriceCents: 100 } })).status, 409);
  const one = await call("/bookings", { body: { lessonType: "single", startAt: "2026-09-08T12:00:00.000Z", expectedPriceCents: 2500 } });
  assert.equal(one.status, 201);
  assert.equal((await one.json()).booking.amountCents, 2500);
});
await test("a cancellation inside 14 hours records and charges just one separate fee under concurrent retries", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  const id = linkedBooking("same-day-cancel", { start: "2026-09-05T12:00:00.000Z", end: "2026-09-05T13:00:00.000Z" });
  const path = `/bookings/${await token(id)}/cancel`;
  const responses = await Promise.all([call(path), call(path)]);
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
  await drain();
  await chargeDueSameDayFees(env);
  await chargeDueLessons(env, new Date("2026-09-06T10:00:00Z"));
  const row = db.prepare("SELECT * FROM bookings WHERE reference='same-day-cancel'").get();
  assert.equal(row.status, "cancelled");
  assert.equal(row.same_day_fee_status, "paid");
  assert.equal(charges.filter((charge) => charge.key.includes(id)).length, 1);
  assert.equal(charges.find((charge) => charge.key.includes(id)).amount, 500);
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
  const result = await call(`/bookings/${await token(id)}/reschedule`, { body: { startAt: "2026-09-08T14:00:00.000Z" } });
  assert.equal(result.status, 200, await result.clone().text());
  await drain();
  await chargeDueLessons(env, new Date("2026-09-05T18:00:00Z"));
  assert.equal(charges.filter((charge) => charge.key.includes(id)).length, 1);
  await chargeDueLessons(env, new Date("2026-09-08T21:00:00Z"));
  assert.deepEqual(charges.filter((charge) => charge.key.includes(id)).map((charge) => charge.amount), [500, 1500]);
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
  const result = await call("/admin/bookings/teacher-action/reschedule", { user: "teacher", body: { startAt: "2026-09-09T12:00:00.000Z" } });
  assert.equal(result.status, 200);
  assert.equal((await call("/admin/bookings/teacher-action/cancel", { user: "teacher" })).status, 200);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='teacher-action'").get().same_day_fee_status, "not_required");
  booking("processing", { payment: "processing" });
  assert.equal((await call("/admin/bookings/processing/cancel", { user: "teacher" })).status, 409);
  assert.equal((await call("/admin/bookings/processing/reschedule", { user: "teacher", body: { startAt: "2026-09-09T15:00:00.000Z" } })).status, 409);
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
  await retryPaymentRecovery(env);
  assert.equal(db.prepare("SELECT stripe_session_id FROM bookings WHERE id='declined'").get().stripe_session_id, "cs_recovery");
  assert.equal(charges.length, attempts);
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
  chargeError = { status: 400, type: "idempotency_error" };
  await chargeDueLessons(env);
  db.prepare("UPDATE bookings SET updated_at='2026-09-05T09:00:00.000Z' WHERE id='ambiguous-snapshot'").run();
  await chargeDueSameDayFees(env);
  assert.equal(charges[before].body, charges[before + 2].body);
  assert.equal(charges[before + 1].body, charges[before + 3].body);
  assert.equal(checkoutRequests.length, checkouts);
  assert.deepEqual({ ...db.prepare("SELECT payment_status,same_day_fee_status FROM bookings WHERE id='ambiguous-snapshot'").get() }, { payment_status: "processing", same_day_fee_status: "processing" });
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
});
await test("logout revokes only the presented session and reset invalidates previous sessions", async () => {
  assert.equal((await call("/auth/logout", { user: "bob" })).status, 200);
  assert.equal((await call("/me/recurring-rates", { user: "bob", method: "GET" })).status, 401);
  const reset = await createResetToken("alice", env.BOOKING_TOKEN_SECRET);
  db.prepare("INSERT INTO password_resets (nonce,student_id,created_at) VALUES (?,'alice',?)").run(reset.split(".")[2], new Date().toISOString());
  const response = await call("/auth/reset", { user: null, body: { token: reset, password: "isolated-password-only" } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(sessionVersion(result.session), 1);
  assert.equal((await call("/me/recurring-rates", { method: "GET" })).status, 401);
  assert.equal((await call("/me/recurring-rates", { method: "GET", token: result.session })).status, 200);
  sessions.alice = result.session;
  assert.equal((await call("/auth/reset", { user: null, body: { token: reset, password: "second-isolated-password" } })).status, 400);
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
  const newLength = await call("/series/mixed-series/reschedule", { body: { ...payload, expectedPriceCents: 2700 } });
  assert.equal(newLength.status, 200, await newLength.clone().text());
  assert.deepEqual(db.prepare("SELECT amount_cents FROM bookings WHERE series_id='mixed-series' ORDER BY id").all().map((row) => row.amount_cents), [2700, 2700]);
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
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='pending_payment'").get().n, 8);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, 0);
  const event = selectionEvent(user, { count: 8 });
  const result = await webhook(event);
  assert.equal(result.status, 200, await result.clone().text());
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
  assert.equal((await call("/bookings", { user, body: selectionBody() })).status, 201);
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
  const save = (settings) => call("/admin/settings", { user: null, headers: { Authorization: "Bearer isolated-admin" }, body: { settings } });
  assert.equal((await save({ slot_interval_minutes: 0 })).status, 400);
  assert.equal((await save({ slot_interval_minutes: -30 })).status, 400);
  assert.equal((await save({ teacher_email: "not-an-address" })).status, 400);
  assert.equal((await save({ slot_interval_minutes: 30 })).status, 200);
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
  assert.equal((await call("/bookings", { user, body: weekly })).status, 201);
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
  const moved = await call("/series/keep-late/reschedule", { body: { startAt: "2026-11-17T12:00:00.000Z" } });
  assert.equal(moved.status, 200, await moved.clone().text());
  const result = await moved.json();
  assert.equal(result.moved, 2);
  assert.deepEqual(result.kept, ["2026-09-05T18:00:00.000Z"]);
  assert.deepEqual(db.prepare("SELECT id, starts_at, sequence FROM bookings WHERE series_id='keep-late' ORDER BY id").all().map((row) => ({ ...row })), [
    { id: "keep-late-1", starts_at: "2026-09-05T18:00:00.000Z", sequence: 0 },
    { id: "keep-late-2", starts_at: "2026-11-17T12:00:00.000Z", sequence: 1 },
    { id: "keep-late-3", starts_at: "2026-11-24T12:00:00.000Z", sequence: 1 }
  ]);
  assert.deepEqual({ ...db.prepare("SELECT weekday, minute_of_day FROM booking_series WHERE id='keep-late'").get() }, { weekday: 2, minute_of_day: 720 });
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
const reclaimNotice = /To see this lesson in your account, sign in with Google or choose a new password with “I’ve forgotten my password” on the sign-in page\./;
function captureEmail() {
  Object.assign(env, { RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  sentEmails.length = 0;
}
function releaseEmail() {
  Object.assign(env, { EMAIL_DRY_RUN: "1" });
  delete env.RESEND_API_KEY;
}
const bookedEmailFor = (reference) => sentEmails.find((sent) => sent.subject.startsWith("Your Portuguese lesson is booked") && sent.text.includes(`Reference: ${reference}`));
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
    assert.match(bookedEmailFor(lesson.reference).text, reclaimNotice, "the confirmation says how to get in");

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
    assert.ok(!reclaimNotice.test(bookedEmailFor(next.reference).text), "only a booking that cleared a password says so");
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
    assert.ok(!reclaimNotice.test(bookedEmailFor(lesson.reference).text));
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
  captureEmail();
  try {
    assert.equal((await call("/me/email", { token: session, body: { email: "moving-to@example.invalid" } })).status, 200);
    await drain();
    const link = sentEmails.find((sent) => sent.to[0] === "moving-to@example.invalid");
    const confirmed = await call("/me/email/confirm", { token: session, body: { token: decodeURIComponent(/emailToken=(\S+)/.exec(link.text)[1]) } });
    assert.equal(confirmed.status, 200, await confirmed.clone().text());
    const moved = await confirmed.json();
    assert.ok(db.prepare("SELECT email_verified_at FROM students WHERE id=?").get(account.id).email_verified_at, "the new address proved itself");
    const booked = await call("/admin/bookings", { user: "teacher", body: { email: "moving-to@example.invalid", lessonType: "single", startAt: "2026-12-15T10:00:00.000Z" } });
    assert.equal(booked.status, 201, await booked.clone().text());
    await drain();
    assert.ok(!reclaimNotice.test(bookedEmailFor((await booked.json()).booking.reference).text));
    assert.equal((await call("/me", { method: "GET", token: moved.session })).status, 200);
  } finally {
    releaseEmail();
  }
});
await test("Inês's bookings never alter a password-less account she created, or a teacher's account", async () => {
  const email = "no-password@example.invalid";
  captureEmail();
  try {
    assert.equal((await call("/admin/bookings", { user: "teacher", body: { email, name: "Nadia Nopass", lessonType: "single", startAt: "2026-12-09T10:00:00.000Z" } })).status, 201);
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
    assert.equal(sentEmails.filter((sent) => sent.subject.startsWith("Your Portuguese lesson is booked")).length, 3);
    assert.ok(!sentEmails.some((sent) => reclaimNotice.test(sent.text)), "no confirmation asks anyone to sign in again");
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
    assert.ok(!reclaimNotice.test(bookedEmailFor((await booked.json()).booking.reference).text));
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
await test("Inês can record a no-show until six hours after the lesson ends, and no lesson is charged before then", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  // It is 10:00: one lesson ended 5h59m ago, one 6h01m ago, one an hour ago.
  booking("absent-in-time", { start: "2026-09-05T03:01:00.000Z", end: "2026-09-05T04:01:00.000Z" });
  booking("absent-too-late", { start: "2026-09-05T02:59:00.000Z", end: "2026-09-05T03:59:00.000Z" });
  booking("attended-recently", { start: "2026-09-05T08:00:00.000Z", end: "2026-09-05T09:00:00.000Z" });
  const mark = (id, noShow = true) => call(`/admin/bookings/${id}/no-show`, { user: "teacher", body: { noShow } });
  const charged = (id) => charges.filter((charge) => charge.key.includes(`:${id}:`)).map((charge) => charge.amount);
  const status = (id) => db.prepare("SELECT payment_status FROM bookings WHERE id=?").get(id).payment_status;

  const inTime = await mark("absent-in-time");
  assert.equal(inTime.status, 200, await inTime.clone().text());
  assert.equal((await mark("absent-in-time", false)).status, 200, "and it can be undone");
  assert.equal((await mark("absent-in-time")).status, 200);
  const tooLate = await mark("absent-too-late");
  assert.equal(tooLate.status, 409);
  assert.match(await tooLate.text(), /until 6 hours after the lesson ends/);
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
  await chargeDueLessons(env, new Date("2026-09-05T14:59:59.999Z"));
  assert.deepEqual(charged("attended-recently"), []);
  await chargeDueLessons(env, new Date("2026-09-05T15:00:00.000Z"));
  assert.deepEqual(charged("attended-recently"), [1500]);
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
console.log(`${passed} booking integration tests passed.`);
globalThis.fetch = nativeFetch;
globalThis.Date = NativeDate;
db.close();
