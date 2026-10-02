import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "./index.mjs";
import { createSession } from "./auth.mjs";
import { slotOf } from "./series.mjs";
import { createManageToken } from "./tokens.mjs";

const NativeDate = Date;
let testNow = "2026-10-02T18:25:00.000Z";
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [testNow])); }
  static now() { return new NativeDate(testNow).getTime(); }
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Series extension tests must not access a provider"); };

// Fresh real SQLite for each scenario. Gates pause before a D1 operation;
// batches execute synchronously inside BEGIN/COMMIT, with no interleaving there.
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("./seed.sql", import.meta.url), "utf8"));
  let beforeOperation = null;
  let beforeBatch = null;
  let executionFailure = null;
  const releases = new Set();
  const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        sql,
        get values() { return values; },
        bind(...args) {
          // https://developers.cloudflare.com/d1/platform/limits/
          // Node SQLite permits many more than the production D1 limit.
          if (args.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${args.length} bound parameters; maximum 100)`);
          values = args; return statement;
        },
        async first() { await beforeOperation?.(sql); return db.prepare(sql).get(...values) ?? null; },
        async all() { await beforeOperation?.(sql); return { results: db.prepare(sql).all(...values) }; },
        async run() { await beforeOperation?.(sql); return statement.execute(); },
        execute() {
          executionFailure?.(sql);
          const result = db.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        }
      };
      return statement;
    },
    async batch(statements) {
      await beforeBatch?.(statements);
      db.exec("BEGIN");
      try {
        const results = statements.map(statement => statement.execute());
        db.exec("COMMIT"); return results;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  };
  const env = { DB, BOOKING_TOKEN_SECRET: "isolated-series-secret", ALLOWED_ORIGIN: "https://lesson.example",
    SITE_URL: "https://lesson.example", EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0" };
  const now = new Date().toISOString();
  db.prepare("INSERT INTO students (id,email,name,password_hash,created_at) VALUES ('alice','alice@example.invalid','Test Student','',?)").run(now);
  db.prepare("INSERT INTO students (id,email,name,password_hash,role,created_at) VALUES ('teacher','teacher@example.invalid','Inês','','teacher',?)").run(now);
  db.prepare(`INSERT INTO booking_series (id,student_id,lesson_type_id,weekday,minute_of_day,filled_to,created_at,updated_at)
    VALUES ('series','alice','single',2,600,'2026-10-06',?,?)`).run(now, now);
  addLesson("anchor", "2026-10-06T09:00:00.000Z");
  const tasks = [];
  const ctx = { waitUntil(promise) { tasks.push(promise); } };
  async function drain() { while (tasks.length) await Promise.all(tasks.splice(0)); }
  async function tick() {
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.parse("2026-10-03T03:10:00.000Z") }, env, ctx);
    await drain();
  }
  async function request(path, body, user = "alice") {
    const session = await createSession(user, env.BOOKING_TOKEN_SECRET);
    return worker.fetch(new Request(`https://api.example${path}`, { method: "POST",
      headers: { Origin: "https://lesson.example", "Content-Type": "application/json", Authorization: `Bearer ${session}` },
      body: JSON.stringify(body) }), env, ctx);
  }
  const action = (suffix, body) => request(`/series/series/${suffix}`, body);
  function addLesson(id, start, series = "series") {
    db.prepare(`INSERT INTO bookings (id,reference,lesson_type_id,student_id,student_name,student_email,
      student_timezone,location,starts_at,ends_at,status,created_at,updated_at,payment_status,amount_cents,series_id)
      VALUES (?,?,'single','alice','Test Student','alice@example.invalid','Europe/Lisbon','online',?,?,'confirmed',?,?,'not_required',2500,?)`)
      .run(id, id, start, new Date(Date.parse(start) + 3600000).toISOString(), now, now, series);
  }
  function pause(kind, predicate) {
    let arrived, release, timeout;
    const arrival = new Promise((resolve, reject) => {
      arrived = () => { clearTimeout(timeout); resolve(); };
      timeout = setTimeout(() => reject(new Error("The expected D1 operation was not reached")), 10000);
    });
    const gate = new Promise(resolve => { release = resolve; });
    const resume = () => { clearTimeout(timeout); releases.delete(resume); release(); };
    releases.add(resume);
    const callback = async value => {
      if (!predicate(value)) return;
      if (kind === "batch") beforeBatch = null; else beforeOperation = null;
      arrived(); await gate;
    };
    if (kind === "batch") beforeBatch = callback; else beforeOperation = callback;
    return { arrival, resume };
  }
  return { db, env, tick, action, request, drain, addLesson, pause,
    fail(fn) { executionFailure = fn; },
    series() { return db.prepare("SELECT * FROM booking_series").get(); },
    lessons() { return db.prepare("SELECT * FROM bookings WHERE series_id IS NOT NULL ORDER BY starts_at").all(); },
    async close() { beforeOperation = null; beforeBatch = null; for (const release of releases) release(); await drain(); db.close(); }
  };
}

const extension = statements => statements.some(statement => statement.sql.startsWith("INSERT INTO bookings"));
const moveBatch = statements => statements.some(statement => statement.sql.startsWith("WITH proposed"));
async function expectOk(response) { assert.equal(response.status, 200, await response.clone().text()); return response.json(); }
function assertThursday(rows) {
  assert.ok(rows.length);
  for (const row of rows) {
    const slot = slotOf(row.starts_at);
    assert.equal(slot.weekday, 4); assert.equal(slot.minuteOfDay, 1020);
    assert.equal(row.status, "confirmed");
  }
}
let passed = 0;
async function test(name, fn, now = "2026-10-02T18:25:00.000Z") {
  if (process.env.QA_SERIES_CASE && !name.includes(process.env.QA_SERIES_CASE)) return;
  testNow = now;
  const f = fixture();
  try { await fn(f); passed++; console.log(`PASS: ${name}`); }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
  finally { await f.close(); }
}

try {
  await test("a move winning before extension cannot be undone by the old job", async f => {
    const gate = f.pause("batch", extension);
    const tick = f.tick(); await gate.arrival;
    await expectOk(await f.action("reschedule", { startAt: "2026-10-08T16:00:00.000Z" }));
    const moved = { ...f.series() };
    gate.resume(); await tick;
    assert.deepEqual({ ...f.series() }, moved);
    assert.equal(f.lessons().length, 1); assertThursday(f.lessons());
    await f.tick(); assert.ok(f.lessons().length > 1); assertThursday(f.lessons());
  });

  await test("a concurrent extension refuses a stale move atomically and its retry moves every lesson", async f => {
    const gate = f.pause("batch", moveBatch);
    const move = f.action("reschedule", { startAt: "2026-10-08T16:00:00.000Z" }); await gate.arrival;
    await f.tick(); const before = f.lessons(); const recipe = { ...f.series() };
    gate.resume(); const response = await move;
    assert.equal(response.status, 409, await response.clone().text());
    assert.deepEqual(f.lessons(), before); assert.deepEqual({ ...f.series() }, recipe);
    await expectOk(await f.action("reschedule", { startAt: "2026-10-08T16:00:00.000Z" }));
    assert.equal(f.lessons().length, before.length); assertThursday(f.lessons());
  });

  await test("a move during a partial extension stops the remaining stale writes", async f => {
    let commits = 0;
    const gate = f.pause("batch", statements => extension(statements) && ++commits === 2);
    const tick = f.tick(); await gate.arrival;
    assert.equal(f.lessons().length, 2);
    await expectOk(await f.action("reschedule", { startAt: "2026-10-08T16:00:00.000Z" }));
    const recipe = { ...f.series() };
    gate.resume(); await tick;
    assert.equal(f.lessons().length, 2); assertThursday(f.lessons());
    assert.deepEqual({ ...f.series() }, recipe);
  });

  await test("a long ongoing series moves within D1's 100-parameter limit", async f => {
    await f.tick(); const count = f.lessons().length; assert.ok(count >= 12);
    const result = await expectOk(await f.action("reschedule", { startAt: "2026-10-08T16:00:00.000Z" }));
    assert.equal(result.moved, count); assertThursday(f.lessons());
  });

  await test("a concurrent individual move away and back changes neither occurrence nor recipe on refusal", async f => {
    // This week's occurrence was individually moved off its usual Thursday.
    f.db.prepare("UPDATE booking_series SET weekday=4,minute_of_day=1020,filled_to='2026-10-08'").run();
    const recipe = { ...f.series() };
    const gate = f.pause("batch", moveBatch);
    const move = f.action("reschedule", { startAt: "2026-10-06T09:00:00.000Z" }); await gate.arrival;
    await expectOk(await f.request("/admin/bookings/anchor/reschedule", { startAt: "2026-10-06T13:00:00.000Z" }, "teacher"));
    await expectOk(await f.request("/admin/bookings/anchor/reschedule", { startAt: "2026-10-06T09:00:00.000Z" }, "teacher"));
    const lessons = f.lessons(); assert.equal(lessons[0].sequence, 2);
    gate.resume(); const response = await move;
    assert.equal(response.status, 409, await response.clone().text());
    assert.deepEqual(f.lessons(), lessons); assert.deepEqual({ ...f.series() }, recipe);
  });

  await test("a pending refund refuses a series move without rewriting its recipe", async f => {
    const id = crypto.randomUUID();
    f.db.prepare("UPDATE bookings SET id=?,payment_status='paid',stripe_payment_intent='pi_isolated' WHERE id='anchor'").run(id);
    f.db.prepare("UPDATE booking_series SET weekday=4,minute_of_day=1020,filled_to='2026-10-08'").run();
    Object.assign(f.env, { STRIPE_SECRET_KEY: "rk_test_mock", STRIPE_WEBHOOK_SECRET: "isolated-webhook", STRIPE_EXPECTED_MODE: "test" });
    const recipe = { ...f.series() };
    const gate = f.pause("batch", moveBatch);
    const move = f.action("reschedule", { startAt: "2026-10-06T09:00:00.000Z" }); await gate.arrival;
    const forbiddenFetch = globalThis.fetch;
    globalThis.fetch = async url => {
      assert.equal(String(url), "https://api.stripe.com/v1/refunds");
      return Response.json({ id: "re_isolated", status: "pending" });
    };
    try {
      const token = await createManageToken(id, f.env.BOOKING_TOKEN_SECRET);
      const response = await f.request(`/bookings/${token}/cancel`, {});
      assert.equal(response.status, 503, await response.clone().text());
    } finally { globalThis.fetch = forbiddenFetch; }
    const lessons = f.lessons(); assert.equal(lessons[0].payment_status, "processing");
    gate.resume(); const response = await move;
    assert.equal(response.status, 409, await response.clone().text());
    assert.deepEqual(f.lessons(), lessons); assert.deepEqual({ ...f.series() }, recipe);
  });

  await test("a stopped recipe prevents an already-planned extension and bookmark write", async f => {
    const gate = f.pause("batch", extension);
    const tick = f.tick(); await gate.arrival;
    const stopped = await expectOk(await f.action("stop", { cancelRemaining: true }));
    assert.equal(stopped.cancelled, 1); const recipe = { ...f.series() };
    gate.resume(); await tick;
    assert.equal(f.lessons().length, 1); assert.equal(f.lessons()[0].status, "cancelled");
    assert.deepEqual({ ...f.series() }, recipe);
  });

  await test("stop-and-cancel includes every extension committed before stopping", async f => {
    const gate = f.pause("operation", sql => sql.startsWith("UPDATE booking_series SET status = 'ended'"));
    const stop = f.action("stop", { cancelRemaining: true }); await gate.arrival;
    await f.tick(); const count = f.lessons().length; assert.ok(count > 1);
    gate.resume(); const stopped = await expectOk(await stop);
    assert.equal(stopped.cancelled, count); assert.equal(stopped.kept, 0);
    assert.ok(f.lessons().every(row => row.status === "cancelled"));
    await f.tick(); assert.equal(f.lessons().length, count);
  });

  await test("stopping without cancellation retains already-committed lessons and adds no later ones", async f => {
    await f.tick(); const before = f.lessons();
    const stopped = await expectOk(await f.action("stop", {}));
    assert.equal(stopped.cancelled, 0); await f.tick();
    assert.deepEqual(f.lessons(), before); assert.equal(f.series().status, "ended");
  });

  await test("an overlapping nightly job cannot duplicate lessons or overwrite the winning bookmark", async f => {
    const gate = f.pause("batch", extension);
    const oldTick = f.tick(); await gate.arrival;
    // Drain the new job separately: the old job is deliberately still held.
    const tasks = [];
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.parse("2026-10-03T03:10:00Z") }, f.env,
      { waitUntil(promise) { tasks.push(promise); } });
    await Promise.all(tasks);
    const before = f.lessons(); const recipe = { ...f.series() };
    gate.resume(); await oldTick;
    assert.deepEqual(f.lessons(), before); assert.deepEqual({ ...f.series() }, recipe);
    assert.equal(new Set(before.map(row => row.starts_at)).size, before.length);
  });

  await test("a failed bookmark rolls back its occurrence and the next sweep recovers", async f => {
    let failed = false;
    f.fail(sql => {
      if (!failed && sql.startsWith("UPDATE booking_series SET filled_to")) { failed = true; throw new Error("Isolated transaction interruption"); }
    });
    await f.tick(); assert.ok(failed);
    assert.equal(f.lessons().length, 1); assert.equal(f.series().filled_to, "2026-10-06");
    await f.tick(); assert.ok(f.lessons().length > 1);
    assert.equal(new Set(f.lessons().map(row => row.starts_at)).size, f.lessons().length);
  });

  await test("a newly claimed lesson skips only that week and keeps the extension bookmark", async f => {
    const gate = f.pause("batch", extension);
    const tick = f.tick(); await gate.arrival;
    f.addLesson("rival", "2026-10-13T09:00:00.000Z", null);
    gate.resume(); await tick;
    assert.ok(f.lessons().length > 1);
    assert.ok(!f.lessons().some(row => row.starts_at === "2026-10-13T09:00:00.000Z"));
    const before = f.lessons(); await f.tick(); assert.deepEqual(f.lessons(), before);
  });

  await test("a stale skipped-week job cannot overwrite a moved recipe's bookmark", async f => {
    f.db.prepare("INSERT INTO availability_exceptions (date,kind,created_at) VALUES ('2026-10-13','blocked',?)").run(new Date().toISOString());
    const gate = f.pause("operation", sql => sql.startsWith("UPDATE booking_series SET filled_to"));
    const tick = f.tick(); await gate.arrival;
    await expectOk(await f.action("reschedule", { startAt: "2026-10-08T16:00:00.000Z" }));
    const recipe = { ...f.series() };
    gate.resume(); await tick;
    assert.equal(f.lessons().length, 1); assertThursday(f.lessons());
    assert.deepEqual({ ...f.series() }, recipe);
  });

  await test("an unfinished card setup never gets a confirmed extension", async f => {
    f.db.prepare("DELETE FROM bookings").run(); f.db.prepare("DELETE FROM booking_series").run();
    f.db.prepare("INSERT OR REPLACE INTO settings VALUES ('payment_mode','postpay')").run();
    Object.assign(f.env, { STRIPE_SECRET_KEY: "rk_test_mock", STRIPE_WEBHOOK_SECRET: "isolated-webhook", STRIPE_EXPECTED_MODE: "test" });
    const forbiddenFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "https://api.stripe.com/v1/checkout/sessions");
      assert.equal(new URLSearchParams(options.body).get("mode"), "setup");
      return Response.json({ id: "cs_setup_isolated", url: "https://checkout.stripe.com/c/pay/mock" });
    };
    try {
      const response = await f.request("/bookings", { lessonType: "single", repeat: null,
        startAt: "2026-10-01T17:00:00.000Z", expectedPriceCents: 2500, paymentConsent: true });
      assert.equal(response.status, 201, await response.clone().text());
    } finally { globalThis.fetch = forbiddenFetch; }
    assert.equal(f.lessons().length, 12); assert.ok(f.lessons().every(row => row.status === "pending_payment"));
    const recipe = { ...f.series() }; const before = f.lessons();
    await f.tick(); assert.deepEqual(f.lessons(), before); assert.deepEqual({ ...f.series() }, recipe);
    // Once its ordinary setup confirmation has completed, it extends normally.
    f.db.prepare("UPDATE bookings SET status='confirmed',payment_status='scheduled',hold_expires_at=NULL").run();
    await f.tick(); assert.equal(f.lessons().length, 13);
    assert.ok(f.lessons().every(row => row.status === "confirmed" && row.payment_status === "scheduled"));
  }, "2026-10-01T03:00:00.000Z");

  await test("a recipe awaiting its first attached booking is not filled", async f => {
    f.db.prepare("DELETE FROM bookings").run();
    const before = { ...f.series() }; await f.tick();
    assert.equal(f.lessons().length, 0); assert.deepEqual({ ...f.series() }, before);
  });

  await test("individual cancellations do not end a still-active standing time", async f => {
    f.db.prepare("UPDATE bookings SET status='cancelled'").run();
    await f.tick(); assert.ok(f.lessons().some(row => row.status === "confirmed"));
    assert.equal(f.series().status, "active");
  });

  assert.ok(passed, "Choose an existing QA_SERIES_CASE or run the full suite");
  console.log(`${passed} series extension integration tests passed (SQLite, isolated providers).`);
} finally { globalThis.fetch = nativeFetch; globalThis.Date = NativeDate; }
