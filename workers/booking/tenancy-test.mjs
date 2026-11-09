import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "./index.mjs";
import { envForTutor, everyTutor, loadDirectory, tutorForRequest } from "./directory.mjs";
import { DEFAULT_TUTOR } from "./tutor.mjs";
import { createManageToken, readManageToken } from "./tokens.mjs";
import { createSession } from "./auth.mjs";
import { tutorSeed } from "./tutor-seed.mjs";

/*
 * Two tutors on one Worker: Inês, and a second tutor with their own database.
 * What must hold is that neither ever reaches the other's students, lessons,
 * secrets or name, and that Inês's requests run exactly as they did alone.
 */

const NativeDate = Date;
const clock = NativeDate.parse("2026-09-05T10:00:00.000Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
// No network, except a stand-in for the mail service that keeps what it was asked to send.
const sent = [];
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://api.resend.com/emails") {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: `re_${sent.length}` }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`No network in tenancy tests: ${url}`);
};

function database(seed = readFileSync(new URL("./seed.sql", import.meta.url), "utf8")) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  db.exec(seed);
  const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        first() { return db.prepare(sql).get(...values) ?? null; },
        all() { return { results: db.prepare(sql).all(...values) }; },
        run() {
          const result = db.prepare(sql).run(...values);
          const outcome = { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
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
  return { db, DB };
}

const ines = database();
const ANA = {
  ...structuredClone(DEFAULT_TUTOR),
  id: "ana",
  database: "DB_ANA",
  name: "Ana Example",
  shortName: "Ana",
  brand: "Português com a Ana",
  place: { city: "New York", timeZone: "America/New_York", country: "US", currency: "USD", inPersonKey: "porto" },
  bookings: { referencePrefix: "AN", calendarUidDomain: "ana.example" },
  site: { url: "https://ana.example", domain: "ana.example", mailFrom: "Português com a Ana <bookings@ana.example>", mailSender: "bookings@ana.example",
    origins: ["https://ana.example"] },
  api: { hosts: ["api.ana.example"] },
  features: {},
  switches: { TEACHER_NOTIFICATIONS_ENABLED: "0" }
};
const directory = loadDirectory([DEFAULT_TUTOR, ANA]);
const ana = database(tutorSeed(ANA));
// What onboarding will do: Ana sets her prices and her hours.
ana.db.exec(`UPDATE lesson_types SET active = 1, price_cents = 3000;
  INSERT INTO availability_rules (weekday, start_minute, last_start_minute, active) VALUES (1, 540, 1080, 1);`);
const anaTutor = directory.find((tutor) => tutor.id === "ana");

const env = {
  DB: ines.DB, DB_ANA: ana.DB,
  BOOKING_TOKEN_SECRET: "isolated-test-signing-secret", ADMIN_TOKEN: "isolated-admin",
  ALLOWED_ORIGIN: "https://lesson.example", SITE_URL: "https://lesson.example",
  EMAIL_DRY_RUN: "1", TEACHER_NOTIFICATIONS_ENABLED: "0", TEACHER_EMAIL: "ines@example.invalid",
  STRIPE_SECRET_KEY: "rk_test_mock", STRIPE_WEBHOOK_SECRET: "mock-webhook", STRIPE_EXPECTED_MODE: "test",
  GOOGLE_CALENDAR_ENABLED: "1", GOOGLE_CALENDAR_TOKEN_KEY: "ines-calendar-key",
  PRIVATE_RECURRING_CODES: JSON.stringify([{ code: "TEST15", duration: 60, cents: 1500 }]),
  RESEND_API_KEY: "re_shared"
};
const tasks = [];
const ctx = { waitUntil(promise) { tasks.push(promise); } };
let passed = 0;
async function test(name, fn) {
  try { await fn(); await Promise.all(tasks.splice(0)); passed++; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
const request = (path, { origin, host = "api.example", method = "GET", body, session } = {}) => new Request(`https://${host}${path}`, {
  method,
  headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
    ...(session ? { Authorization: `Bearer ${session}` } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

await test("a directory refuses a clash, an unreal clock or currency, an unknown switch, and a missing default", () => {
  assert.throws(() => loadDirectory([DEFAULT_TUTOR, ANA, { ...ANA, id: "anna", database: "DB_ANNA" }]), /origin https:\/\/ana.example/);
  assert.throws(() => loadDirectory([DEFAULT_TUTOR, { ...ANA, place: { ...ANA.place, timeZone: "Mars/Olympus" } }]), /not a time zone/);
  assert.throws(() => loadDirectory([DEFAULT_TUTOR, { ...ANA, place: { ...ANA.place, currency: "usd" } }]), /not a currency/);
  assert.throws(() => loadDirectory([DEFAULT_TUTOR, { ...ANA, switches: { STRIPE_SECRET_KEY: "x" } }]), /not a switch/);
  assert.throws(() => loadDirectory([DEFAULT_TUTOR, { ...ANA, database: "DB" }]), /database DB/);
  assert.throws(() => loadDirectory([ANA]), /default tutor/);
  assert.throws(() => loadDirectory([DEFAULT_TUTOR, { ...ANA, features: { expressions: true } }]), /Inês's add-on/);
});

await test("a new tutor's database starts from their own record, with nothing of Inês's and nothing to book", () => {
  const seed = tutorSeed(ANA);
  assert.doesNotMatch(seed, /Inês|Porto|Português com a Inês/);
  const fresh = database(seed).db;
  assert.equal(fresh.prepare("SELECT value FROM settings WHERE key = 'teacher_name'").get().value, "Ana Example");
  assert.equal(fresh.prepare("SELECT COUNT(*) AS count FROM lesson_types WHERE active = 1").get().count, 0);
  assert.equal(fresh.prepare("SELECT COUNT(*) AS count FROM availability_rules").get().count, 0);
});

await test("Expressions is Inês's add-on: for another tutor every expressions route does not exist", async () => {
  const own = await envForTutor(env, anaTutor);
  for (const path of ["/me/expressions", "/expressions/1/translations", "/admin/expressions", "/admin/expression-translations"]) {
    assert.equal((await worker.fetch(request(path, { origin: "https://ana.example" }), own, ctx)).status, 404, path);
  }
  assert.notEqual((await worker.fetch(request("/admin/expressions", { origin: "https://lesson.example" }), env, ctx)).status, 404, "hers still answer");
});

await test("a request is the tutor's by its origin or host, and Inês's otherwise", () => {
  assert.equal(tutorForRequest(request("/health", { origin: "https://ana.example" }), directory).id, "ana");
  assert.equal(tutorForRequest(request("/health", { host: "api.ana.example" }), directory).id, "ana");
  assert.equal(tutorForRequest(request("/health", { origin: "https://lesson.example" }), directory).id, "ines");
  assert.equal(tutorForRequest(request("/health", { origin: "https://elsewhere.example" }), directory).id, "ines");
  assert.equal(tutorForRequest(request("/stripe/webhook", { method: "POST" }), directory).id, "ines");
});

await test("Inês keeps the deploy's env itself; another tutor gets only their own", async () => {
  assert.equal(await envForTutor(env, DEFAULT_TUTOR), env);
  const own = await envForTutor(env, anaTutor);
  assert.equal(own, await envForTutor(env, anaTutor), "built once per instance");
  assert.ok(Object.isFrozen(own));
  assert.equal(own.DB, ana.DB);
  assert.equal(own.TUTOR.id, "ana");
  assert.equal(own.ALLOWED_ORIGIN, "https://ana.example");
  for (const name of ["TEACHER_EMAIL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PRIVATE_RECURRING_CODES", "GOOGLE_CALENDAR_TOKEN_KEY", "SITE_URL", "MAIL_FROM"]) {
    assert.equal(own[name], undefined, `${name} is Inês's alone`);
  }
  assert.equal(own.RESEND_API_KEY, "re_shared");
  assert.equal(own.EMAIL_DRY_RUN, "1");
  assert.equal(own.GOOGLE_CALENDAR_ENABLED, "0");
  assert.equal(own.HOMEWORK_AI_ENABLED, "0");
  assert.equal(own.TEACHER_NOTIFICATIONS_ENABLED, "0", "the record's own switch");
  assert.match(own.BOOKING_TOKEN_SECRET, /^[0-9a-f]{64}$/);
  assert.notEqual(own.BOOKING_TOKEN_SECRET, env.BOOKING_TOKEN_SECRET);
  assert.notEqual(own.ADMIN_TOKEN, env.ADMIN_TOKEN);
});

await test("a manage link made for one tutor opens nothing for the other", async () => {
  const own = await envForTutor(env, anaTutor);
  const id = "6f1c2a7e-1111-4222-8333-944455556666";
  assert.equal(await readManageToken(await createManageToken(id, own.BOOKING_TOKEN_SECRET), env.BOOKING_TOKEN_SECRET), null);
  assert.equal(await readManageToken(await createManageToken(id, env.BOOKING_TOKEN_SECRET), own.BOOKING_TOKEN_SECRET), null);
});

await test("a booking on the second tutor's site lands in their database, in their name, and never in Inês's", async () => {
  const own = await envForTutor(env, anaTutor);
  const availability = await worker.fetch(request("/availability?lessonType=single&from=2026-09-07&to=2026-09-07", { origin: "https://ana.example" }), own, ctx);
  assert.equal(availability.status, 200);
  assert.equal((await availability.json()).slotsByDate["2026-09-07"][0].startAt, "2026-09-07T13:00:00.000Z", "her 09:00 is New York's");
  assert.equal(availability.headers.get("Access-Control-Allow-Origin"), "https://ana.example");
  ana.db.prepare("INSERT INTO students (id,email,name,password_hash,created_at) VALUES ('sam','sam@example.invalid','Sam Student','',?)").run(new Date().toISOString());
  const session = await createSession("sam", own.BOOKING_TOKEN_SECRET);
  // The same session is no one on Inês's side: her secret did not sign it, and her database has no Sam.
  const elsewhere = await worker.fetch(request("/me", { origin: "https://lesson.example", session }), env, ctx);
  assert.equal(elsewhere.status, 401);
  // Her mail switched on for this one booking, to read what her student is sent.
  const live = { ...own, EMAIL_DRY_RUN: "0" };
  const created = await worker.fetch(request("/bookings", { origin: "https://ana.example", method: "POST", session, body: {
    lessonType: "trial", startAt: "2026-09-07T14:00:00.000Z", timezone: "America/New_York", location: "online"
  } }), live, ctx);
  assert.equal(created.status, 201, await created.clone().text());

  await Promise.all(tasks.splice(0));
  const row = ana.db.prepare("SELECT reference FROM bookings").get();
  assert.match(row.reference, /^AN-/);
  assert.equal(ines.db.prepare("SELECT COUNT(*) AS count FROM bookings").get().count, 0);
  assert.equal(ines.db.prepare("SELECT COUNT(*) AS count FROM students").get().count, 0);
  assert.equal(ines.db.prepare("SELECT COUNT(*) AS count FROM email_log").get().count, 0);
  assert.ok(ana.db.prepare("SELECT 1 FROM email_log WHERE recipient = 'sam@example.invalid'").get(), "logged in the tutor's own database");
  const mail = sent.find((message) => message.to?.includes?.("sam@example.invalid") || message.to === "sam@example.invalid");
  assert.ok(mail, "the student's confirmation was sent");
  assert.equal(mail.from, "Português com a Ana <bookings@ana.example>");
  assert.match(mail.text, /\$30/, "priced in her own currency");
  assert.match(mail.text, /10:00/, "at 10:00 on her clock and her student's");
  assert.doesNotMatch(JSON.stringify(mail), /€|Porto|Inês|portuguesewithines/);
});

await test("at the same moment, Inês's request runs on her clock and the other tutor's on theirs", async () => {
  const own = await envForTutor(env, anaTutor);
  const ask = (origin, on) => worker.fetch(request("/availability?lessonType=single&from=2026-09-14&to=2026-09-14", { origin }), on, ctx)
    .then((reply) => reply.json()).then((body) => body.slotsByDate["2026-09-14"][0].startAt);
  const [hers, theirs] = await Promise.all([ask("https://lesson.example", env), ask("https://ana.example", own)]);
  assert.equal(hers, "2026-09-14T09:00:00.000Z", "10:00 in Porto");
  assert.equal(theirs, "2026-09-14T13:00:00.000Z", "09:00 in New York");
});

await test("Inês's own requests are untouched by a second tutor existing, and refused from the other's origin", async () => {
  const health = await worker.fetch(request("/health", { origin: "https://lesson.example" }), env, ctx);
  assert.equal(health.headers.get("Access-Control-Allow-Origin"), "https://lesson.example");
  const refused = await worker.fetch(request("/bookings", { origin: "https://ana.example", method: "POST", body: { lessonType: "single" } }), env, ctx);
  assert.equal(refused.status, 403, "the default directory does not know the other tutor, so their origin is not allowed on hers");
});

await test("a tutor whose database is not bound is refused, never served from another's", async () => {
  const unbound = await envForTutor({ ...env, DB_ANA: undefined }, anaTutor);
  assert.equal(unbound.DB, undefined);
  const reply = await worker.fetch(request("/availability?lessonType=single&from=2026-09-07&to=2026-09-07", { origin: "https://ana.example" }), unbound, ctx);
  assert.equal(reply.status, 500);
  const sweeps = await everyTutor({ ...env, DB_ANA: undefined }, directory);
  assert.deepEqual(sweeps.map((own) => own.TUTOR?.id ?? "ines"), ["ines"]);
  assert.deepEqual((await everyTutor(env, directory)).map((own) => own.TUTOR?.id ?? "ines"), ["ines", "ana"]);
});

console.log(`${passed} tenancy tests passed.`);
