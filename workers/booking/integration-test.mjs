import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { chargeDueLessons, chargeDueSameDayFees, notifySeries, retryPaymentRecovery, retryRefunds } from "./index.mjs";
import { createSession, createResetToken, sessionVersion } from "./auth.mjs";
import { createManageToken } from "./tokens.mjs";
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
  if (String(url).startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
    if (checkoutUnavailable) throw new Error("Isolated lookup outage");
    return Response.json({ id: String(url).split("/").at(-1), status: checkoutStatus, url: "https://checkout.stripe.com/c/pay/mock" });
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
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
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
function booking(id, { start = "2026-09-07T09:00:00.000Z", end = "2026-09-07T10:00:00.000Z", payment = "scheduled", owner = "alice", series = null } = {}) {
  db.prepare(`INSERT INTO bookings (id,reference,lesson_type_id,student_id,student_name,student_email,student_phone,
    student_timezone,location,notes,starts_at,ends_at,status,sequence,created_at,updated_at,payment_status,amount_cents,series_id)
    VALUES (?,?,'single',?,'Test Student',?,'','Europe/Lisbon','online','',?,?,'confirmed',0,?,?,?,1500,?)`)
    .run(id, id, owner, `${owner}@example.invalid`, start, end, new Date().toISOString(), new Date().toISOString(), payment, series);
}
async function token(id) { return createManageToken(id, env.BOOKING_TOKEN_SECRET); }
async function webhook(event) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`)))].map((value) => value.toString(16).padStart(2, "0")).join("");
  return call("/stripe/webhook", { user: null, raw, headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` } });
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
  booking("same-day-cancel", { start: "2026-09-05T12:00:00.000Z", end: "2026-09-05T13:00:00.000Z" });
  const path = `/bookings/${await token("same-day-cancel")}/cancel`;
  const responses = await Promise.all([call(path), call(path)]);
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
  await drain();
  await chargeDueSameDayFees(env);
  await chargeDueLessons(env, new Date("2026-09-06T10:00:00Z"));
  const row = db.prepare("SELECT * FROM bookings WHERE id='same-day-cancel'").get();
  assert.equal(row.status, "cancelled");
  assert.equal(row.same_day_fee_status, "paid");
  assert.equal(charges.filter((charge) => charge.key.includes("same-day-cancel")).length, 1);
  assert.equal(charges.find((charge) => charge.key.includes("same-day-cancel")).amount, 500);
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
  booking("no-action", { start: "2026-09-05T14:00:00.000Z", end: "2026-09-05T15:00:00.000Z" });
  const path = `/bookings/${await token("no-action")}`;
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
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='no-action'").get().same_day_fee_status, "not_required");
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id='no-action'").run();
});
await test("a move inside 14 hours preserves agreed price, charges once, then lesson only at new end", async () => {
  booking("same-day-move", { start: "2026-09-05T16:00:00.000Z", end: "2026-09-05T17:00:00.000Z" });
  const result = await call(`/bookings/${await token("same-day-move")}/reschedule`, { body: { startAt: "2026-09-08T14:00:00.000Z" } });
  assert.equal(result.status, 200, await result.clone().text());
  await drain();
  await chargeDueLessons(env, new Date("2026-09-05T18:00:00Z"));
  assert.equal(charges.filter((charge) => charge.key.includes("same-day-move")).length, 1);
  await chargeDueLessons(env, new Date("2026-09-08T15:00:00Z"));
  assert.deepEqual(charges.filter((charge) => charge.key.includes("same-day-move")).map((charge) => charge.amount), [500, 1500]);
});
await test("13.5 hours ahead on the next Porto day is late; lesson-day wording keeps its promise", async () => {
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
  // 00:30 Porto on Sunday, from 11:00 Porto on Saturday: another calendar day.
  booking("next-day-late", { start: "2026-09-05T23:30:00.000Z", end: "2026-09-06T00:30:00.000Z" });
  booking("next-day-legacy", { start: "2026-09-06T01:00:00.000Z", end: "2026-09-06T02:00:00.000Z" });
  db.prepare("UPDATE bookings SET payment_consent_version='2026-09-01-after-lesson-v1' WHERE id='next-day-legacy'").run();
  const opened = await (await call(`/bookings/${await token("next-day-late")}`, { method: "GET" })).json();
  assert.equal(opened.sameDayFeeApplies, true);
  const late = await call(`/bookings/${await token("next-day-late")}/cancel`);
  assert.equal(late.status, 200, await late.clone().text());
  assert.equal((await late.json()).sameDayFeeApplied, true);
  const legacy = await call(`/bookings/${await token("next-day-legacy")}/cancel`);
  assert.equal(legacy.status, 200, await legacy.clone().text());
  assert.equal((await legacy.json()).sameDayFeeApplied, false);
  await drain();
  await chargeDueSameDayFees(env);
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='next-day-late'").get().same_day_fee_status, "paid");
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='next-day-legacy'").get().same_day_fee_status, "not_required");
  assert.deepEqual(charges.filter((charge) => charge.key.includes("next-day")).map((charge) => charge.amount), [500]);
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
  booking("fresh-charge", { start: "2026-09-05T08:00:00.000Z", end: "2026-09-05T09:00:00.000Z" });
  db.prepare("UPDATE bookings SET same_day_fee_status='scheduled',same_day_fee_cents=500 WHERE id='fresh-charge'").run();
  const count = charges.length;
  await chargeDueLessons(env); await chargeDueSameDayFees(env);
  assert.equal(charges.length, count + 2);
  assert.deepEqual(charges.slice(count).map((charge) => charge.amount), [1500, 500]);
  const admin = await (await call("/admin/bookings", { method: "GET", user: "teacher" })).json();
  assert.equal(admin.manualPaymentReconciliation.length, 51);
});
await test("ambiguous retry freezes card and money; idempotency errors never open a second payment path", async () => {
  booking("ambiguous-snapshot", { start: "2026-09-05T08:00:00.000Z", end: "2026-09-05T09:00:00.000Z" });
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
  booking("expired-recovery", { payment: "payment_due" });
  db.prepare("UPDATE bookings SET stripe_session_id='cs_old' WHERE id='expired-recovery'").run();
  const path = `/bookings/${await token("expired-recovery")}/payment`;
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
  assert.equal(db.prepare("SELECT stripe_session_id FROM bookings WHERE id='expired-recovery'").get().stripe_session_id, "cs_new");
  assert.equal(new Set(checkoutRequests.slice(start).map((request) => request.key)).size, 1);
  assert.equal(new Set(checkoutRequests.slice(start).map((request) => request.body)).size, 1);
  assert.equal(new URLSearchParams(checkoutRequests.at(-1).body).has("expires_at"), false);
  db.prepare("UPDATE bookings SET payment_status='paid' WHERE id='expired-recovery'").run();
  assert.equal((await call(path, { body: { purpose: "lesson" } })).status, 409);
  checkoutStatus = "open";
});
await test("verified Google first-link removes preregistration password and sessions while preserving account data", async () => {
  const registered = await call("/auth/register", { user: null, body: { email: "victim@example.invalid", name: "Victim", password: "attacker-known-password" } });
  assert.equal(registered.status, 201);
  const attacker = await registered.json();
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  googleJwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "isolated-google" };
  env.GOOGLE_CLIENT_ID = "isolated-client";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "RS256", kid: googleJwk.kid })}.${encode({ sub: "verified-victim", email: "victim@example.invalid", email_verified: true, iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, exp: Date.now() / 1000 + 3600 })}`;
  const signature = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(payload))).toString("base64url");
  const linked = await call("/auth/google", { user: null, body: { credential: `${payload}.${signature}` } });
  assert.equal(linked.status, 200);
  const victim = await linked.json();
  assert.equal(victim.student.id, attacker.student.id);
  assert.equal(sessionVersion(victim.session), 1);
  assert.equal((await call("/me", { method: "GET", token: attacker.session })).status, 401);
  assert.equal((await call("/auth/login", { user: null, body: { email: "victim@example.invalid", password: "attacker-known-password" } })).status, 401);
  assert.equal((await call("/me", { method: "GET", token: victim.session })).status, 200);
  const again = await (await call("/auth/google", { user: null, body: { credential: `${payload}.${signature}` } })).json();
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
  booking("move-past-hold", { start: "2026-09-17T12:00:00.000Z", end: "2026-09-17T13:00:00.000Z" });
  const response = await call(`/bookings/${await token("move-past-hold")}/reschedule`, { body: { startAt: "2026-09-17T16:00:00.000Z" } });
  assert.equal(response.status, 200, await response.clone().text());
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id='move-past-hold'").run();
  booking("teacher-past-hold", { start: "2026-09-17T12:00:00.000Z", end: "2026-09-17T13:00:00.000Z" });
  assert.equal((await call("/admin/bookings/teacher-past-hold/reschedule", { user: "teacher", body: { startAt: "2026-09-17T16:00:00.000Z" } })).status, 200);
});
await test("paid student and teacher cancellation claim before refund; concurrent move cannot escape", async () => {
  for (const actor of ["student", "teacher"]) {
    const id = `refund-${actor}`;
    booking(id, { payment: "paid", start: "2026-09-25T12:00:00.000Z", end: "2026-09-25T13:00:00.000Z" });
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
  booking("refund-lost", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_lost' WHERE id='refund-lost'").run();
  beforeRun = (sql) => {
    if (sql.startsWith("INSERT OR IGNORE INTO booking_refunds")) {
      beforeRun = null;
      db.prepare("UPDATE bookings SET sequence=sequence+1,starts_at='2026-09-09T08:00:00.000Z',ends_at='2026-09-09T09:00:00.000Z' WHERE id='refund-lost'").run();
    }
  };
  const count = refunds.length;
  assert.equal((await call(`/bookings/${await token("refund-lost")}/cancel`)).status, 409);
  assert.equal(refunds.length, count);
});
await test("ambiguous refund stays reserved and reconciles same immutable request before cancelling", async () => {
  booking("refund-ambiguous", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_ambiguous' WHERE id='refund-ambiguous'").run();
  refundUnavailable = true;
  const count = refunds.length;
  const response = await call(`/bookings/${await token("refund-ambiguous")}/cancel`);
  assert.equal(response.status, 503);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='refund-ambiguous'").get().status, "confirmed");
  // A paid postpay lesson retains its original charge timestamp. The refund
  // lock must never be mistaken for an abandoned lesson-charge claim.
  db.prepare("UPDATE bookings SET charge_started_at='2026-09-05T09:00:00.000Z',updated_at='2026-09-05T09:00:00.000Z' WHERE id='refund-ambiguous'").run();
  const chargeCount = charges.length;
  await chargeDueLessons(env);
  assert.equal(charges.length, chargeCount);
  assert.equal((await call("/admin/bookings/refund-ambiguous/reschedule", { user: "teacher", body: { startAt: "2026-09-24T11:00:00.000Z" } })).status, 409);
  db.prepare("UPDATE bookings SET amount_cents=9900 WHERE id='refund-ambiguous'").run();
  db.prepare("UPDATE booking_refunds SET attempted_at='2026-09-05T09:00:00.000Z' WHERE booking_id='refund-ambiguous'").run();
  refundUnavailable = false;
  await retryRefunds(env);
  assert.deepEqual(refunds[count], refunds[count + 1]);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id='refund-ambiguous'").get().payment_status, "refunded");
});
await test("pending provider refunds reconcile by id, never create another refund", async () => {
  booking("refund-pending", { payment: "paid" });
  db.prepare("UPDATE bookings SET stripe_payment_intent='pi_refund_pending' WHERE id='refund-pending'").run();
  refundStatus = "pending";
  assert.equal((await call(`/bookings/${await token("refund-pending")}/cancel`)).status, 503);
  const count = refunds.length;
  const lookups = refundLookups;
  db.prepare("UPDATE booking_refunds SET attempted_at='2026-09-05T09:00:00.000Z' WHERE booking_id='refund-pending'").run();
  refundStatus = "succeeded";
  await retryRefunds(env);
  assert.equal(refunds.length, count);
  assert.equal(refundLookups, lookups + 1);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id='refund-pending'").get().status, "cancelled");
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
  booking("meet-owned", { owner: "meet-owner", start: "2026-10-05T09:00:00.000Z", end: "2026-10-05T10:00:00.000Z" });
  db.prepare("UPDATE bookings SET meeting_url='https://meet.google.com/abc-defg-hij' WHERE id='meet-owned'").run();
  let mine = await call("/me", { method: "GET", user: "meet-owner" });
  assert.equal((await mine.json()).bookings[0].meetingUrl, "https://meet.google.com/abc-defg-hij");
  const other = await call("/me", { method: "GET", user: "outsider" });
  assert.ok(!(await other.json()).bookings.some(row => row.reference === "meet-owned"));
  const managed = await call(`/bookings/${await token("meet-owned")}`, { method: "GET", user: "meet-owner" });
  assert.equal((await managed.json()).booking.meetingUrl, "https://meet.google.com/abc-defg-hij");
  db.prepare("UPDATE bookings SET location='porto' WHERE id='meet-owned'").run();
  mine = await call("/me", { method: "GET", user: "meet-owner" });
  assert.equal((await mine.json()).bookings[0].meetingUrl, null);
  db.prepare("UPDATE bookings SET location='online',status='cancelled' WHERE id='meet-owned'").run();
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
    await chargeDueLessons(env, new Date("2026-09-04T13:00:00Z"));
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
  booking("fee-receipt", { start: "2026-09-05T15:00:00.000Z", end: "2026-09-05T16:00:00.000Z" });
  Object.assign(env, { TEACHER_EMAIL: "ines@example.invalid", RESEND_API_KEY: "re_isolated", EMAIL_DRY_RUN: "0" });
  sentEmails.length = 0;
  try {
    const cancelled = await call(`/bookings/${await token("fee-receipt")}/cancel`);
    assert.equal(cancelled.status, 200, await cancelled.clone().text());
    await drain();
    await chargeDueSameDayFees(env);
  } finally {
    Object.assign(env, { EMAIL_DRY_RUN: "1" });
    delete env.TEACHER_EMAIL;
    delete env.RESEND_API_KEY;
    db.prepare("UPDATE students SET nif='' WHERE id='alice'").run();
  }
  assert.equal(db.prepare("SELECT same_day_fee_status FROM bookings WHERE id='fee-receipt'").get().same_day_fee_status, "paid");
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
console.log(`${passed} booking integration tests passed.`);
globalThis.fetch = nativeFetch;
globalThis.Date = NativeDate;
db.close();
