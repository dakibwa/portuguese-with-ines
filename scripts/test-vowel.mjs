import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { Directory } from "../workers/vowel/directory.mjs";
import { TutorDatabase } from "../workers/vowel/store.mjs";
import { launchProblems, updateSite } from "../workers/vowel/model.mjs";
import { changePolicy } from "../workers/booking/policy.mjs";
import { lessonChargePlan } from "../workers/booking/index.mjs";
import { createSession } from "../workers/booking/auth.mjs";
import { addDaysToKey, dateKey, zonedToUtc } from "../workers/booking/time.mjs";
import { nextReview, draftPlan } from "../workers/vowel/curriculum.mjs";
import { packFor } from "../workers/vowel/language-packs.mjs";
import bookingWorker from "../workers/booking/index.mjs";
import {
  subscriptionCheckout,
  startSubscription,
  handlePlatformWebhook,
} from "../workers/vowel/payments.mjs";
import { signature } from "../workers/vowel/security.mjs";

const [directorySchema, bookingSchema, tutorSchema] = await Promise.all(
  [
    "../workers/vowel/directory-schema.sql",
    "../workers/booking/schema.sql",
    "../workers/vowel/tutor-schema.sql",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")),
);
const contexts = [];
function context() {
  const db = new DatabaseSync(":memory:"),
    tasks = [];
  let alarm = null;
  const storage = {
    sql: {
      exec(query, ...values) {
        if (/CREATE (?:TABLE|TRIGGER|INDEX)/.test(query)) {
          db.exec(query);
          return { toArray: () => [] };
        }
        const rows = db.prepare(query).all(...values);
        return { toArray: () => rows };
      },
    },
    transactionSync(fn) {
      db.exec("SAVEPOINT vowel_test");
      try {
        const result = fn();
        db.exec("RELEASE vowel_test");
        return result;
      } catch (error) {
        db.exec("ROLLBACK TO vowel_test; RELEASE vowel_test");
        throw error;
      }
    },
    async setAlarm(value) {
      alarm = value;
    },
    async getAlarm() {
      return alarm;
    },
  };
  const ctx = {
    storage,
    waitUntil(promise) {
      tasks.push(promise);
    },
    blockConcurrencyWhile: (fn) => fn(),
    async drain() {
      while (tasks.length) await Promise.all(tasks.splice(0));
    },
  };
  contexts.push({ db, ctx });
  return ctx;
}
const env = {
  TUTOR_STORES: { getByName: () => ({ prepareSite: async () => {} }) },
  VOWEL_AUTH_SECRET: "vowel-unit-fixture-signing-secret-not-a-real-key",
  VOWEL_EMAIL_ENABLED: "0",
  VOWEL_AI_ENABLED: "0",
  VOWEL_MAIL_SENDER: "teacher@example.invalid",
  RESEND_API_KEY: "fixture-mail-key",
  VOWEL_STRIPE_EXPECTED_MODE: "test",
  VOWEL_ORIGIN: "https://vowel.example.invalid",
};
const directory = new Directory(context(), env, directorySchema),
  origin = env.VOWEL_ORIGIN;
const request = (
  path,
  input,
  {
    cookie = "",
    token = "",
    method = input === undefined ? "GET" : "POST",
  } = {},
) =>
  new Request(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: `vowel_session=${cookie}` } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(input === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
const mail = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://api.resend.com/emails") {
    mail.push(JSON.parse(init.body));
    return Response.json({ id: "fixture-message" });
  }
  throw new Error("Tests forbid external network calls.");
};
const alice = await directory.provisionUser("alice@example.invalid", "Alice"),
  bob = await directory.provisionUser("bob@example.invalid", "Bob");
const aliceCookie = await directory.createSession(alice.id),
  bobCookie = await directory.createSession(bob.id);
let site = await directory.createSite(alice);

await test("only the owner reads or changes a draft; the request cannot replace ownership", async () => {
  assert.equal(
    (
      await directory.fetch(
        request(`/api/platform/sites/${site.id}`, undefined, {
          cookie: bobCookie,
        }),
      )
    ).status,
    404,
  );
  assert.equal(await directory.accessibleSite(site.id, request("/")), null);
  const next = await directory.changeSite(
    site.id,
    { version: site.version, ownerId: bob.id, name: "Alice" },
    alice,
  );
  assert.equal(next.ownerId, alice.id);
  site = next;
});
await test("auth requires a same-origin form and codes are bounded, single-use and never returned", async () => {
  env.VOWEL_EMAIL_ENABLED = "1";
  const denied = await directory.fetch(
    new Request(origin + "/api/platform/auth/code", {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "learner@example.invalid" }),
    }),
  );
  assert.equal(denied.status, 403);
  const sent = await directory.fetch(
    request("/api/platform/auth/code", { email: "learner@example.invalid" }),
  );
  assert.equal(sent.status, 200);
  const challenge = await sent.json();
  assert.deepEqual(Object.keys(challenge), ["challengeId"]);
  const code = /code is (\d{6})/.exec(mail.at(-1).text)[1],
    wrong = code === "000000" ? "111111" : "000000";
  for (let index = 0; index < 5; index++)
    assert.equal(
      (
        await directory.fetch(
          request("/api/platform/auth/confirm", {
            challengeId: challenge.challengeId,
            code: wrong,
          }),
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await directory.fetch(
        request("/api/platform/auth/confirm", {
          challengeId: challenge.challengeId,
          code,
        }),
      )
    ).status,
    400,
  );
  const second = await directory.fetch(
      request("/api/platform/auth/code", { email: "second@example.invalid" }),
    ),
    other = await second.json(),
    valid = /code is (\d{6})/.exec(mail.at(-1).text)[1];
  const confirmed = await directory.fetch(
    request("/api/platform/auth/confirm", {
      challengeId: other.challengeId,
      code: valid,
    }),
  );
  assert.equal(confirmed.status, 200);
  assert.match(confirmed.headers.get("Set-Cookie"), /HttpOnly/);
  assert.equal(
    (
      await directory.fetch(
        request("/api/platform/auth/confirm", {
          challengeId: other.challengeId,
          code: valid,
        }),
      )
    ).status,
    400,
  );
});
env.VOWEL_EMAIL_ENABLED = "0";
await test("launch validates the teaching offer and wording; there is no card requirement", async () => {
  assert.ok(launchProblems(site).length);
  site = await directory.changeSite(
    site.id,
    {
      version: site.version,
      language: { name: "English", variety: "English", code: "en" },
      place: {
        city: "New York",
        timeZone: "America/New_York",
        country: "US",
        currency: "USD",
      },
      content: {
        hero: {
          title: "English with Alice",
          line: "A lesson for your next step.",
        },
        about: {
          heading: "Hello",
          body: "I teach English in a way that fits the goals my students bring. These are my own words, checked before publication.",
        },
        reviewed: true,
      },
      hours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 540,
        endMinute: 1020,
      })),
    },
    alice,
  );
  site = await directory.publishSite(site.id, site.version, alice);
  assert.equal(site.billing, "trialing");
  assert.equal(site.trialEndsAt - site.publishedAt, 30 * 86400000);
  assert.equal(site.stripeAccount, null);
});
await test("saved drafts stay private; publication never restarts the free trial", async () => {
  const oldEnd = site.trialEndsAt,
    oldTitle = site.content.hero.title;
  site = await directory.changeSite(
    site.id,
    {
      version: site.version,
      content: { hero: { title: "A draft heading", line: "Draft only" } },
    },
    alice,
  );
  assert.equal(
    (await directory.accessibleSite(site.id, request("/"))).content.hero.title,
    oldTitle,
  );
  site = await directory.publishSite(site.id, site.version, alice);
  assert.equal(site.trialEndsAt, oldEnd);
  assert.equal(
    directory.publicSite(site.id).content.hero.title,
    "A draft heading",
  );
  await assert.rejects(
    () =>
      directory.changeSite(
        site.id,
        { version: site.version - 1, name: "Stale" },
        alice,
      ),
    /another window/,
  );
});
await test("teacher portraits stay private in draft and replacing a draft keeps the published portrait", async () => {
  const a =
      "data:image/jpeg;base64," +
      Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]).toString("base64"),
    b =
      "data:image/jpeg;base64," +
      Buffer.from([255, 216, 255, 224, 5, 6, 7, 8]).toString("base64");
  let response = await directory.uploadPhoto(site, {
    version: site.version,
    data: a,
  });
  site = (await response.json()).site;
  const hash = site.photo.asset.split("/").at(-1);
  await assert.rejects(
    () => directory.photo(site.id, hash, request("/")),
    /not found/,
  );
  assert.equal(
    (
      await directory.photo(
        site.id,
        hash,
        request("/", undefined, { cookie: aliceCookie }),
      )
    ).status,
    200,
  );
  site = await directory.publishSite(site.id, site.version, alice);
  response = await directory.uploadPhoto(site, {
    version: site.version,
    data: b,
  });
  site = (await response.json()).site;
  assert.equal(
    (await directory.photo(site.id, hash, request("/"))).status,
    200,
  );
  const newHash = site.photo.asset.split("/").at(-1);
  await assert.rejects(
    () =>
      directory.photo(
        site.id,
        newHash,
        request("/", undefined, { cookie: bobCookie }),
      ),
    /not found/,
  );
  site = await directory.publishSite(site.id, site.version, alice);
  assert.equal(
    (
      await directory.photo(
        site.id,
        hash,
        request("/", undefined, { cookie: aliceCookie }),
      )
    ).status,
    404,
  );
});
const tutorA = new TutorDatabase(context(), env, bookingSchema, tutorSchema),
  siteB = {
    ...structuredClone(site),
    id: crypto.randomUUID(),
    ownerId: bob.id,
    name: "Bob",
    shortName: "Bob",
    version: 1,
    place: { ...site.place, timeZone: "Europe/London", currency: "GBP" },
  };
await tutorA.configure(site, origin, alice);
const tutorB = new TutorDatabase(context(), env, bookingSchema, tutorSchema);
await tutorB.configure(siteB, origin, bob);
const ownA = await tutorA.ownEnv(site, origin, false),
  ownB = await tutorB.ownEnv(siteB, origin, false),
  studentId = crypto.randomUUID();
tutorA.rows(
  "INSERT INTO students(id,email,name,password_hash,email_verified_at,created_at) VALUES(?,?,?,'',?,?)",
  studentId,
  "student@example.invalid",
  "Student",
  new Date().toISOString(),
  new Date().toISOString(),
);
const studentToken = await createSession(studentId, ownA.BOOKING_TOKEN_SECRET);
const teacherToken = await tutorA.teacherSession(site, alice, origin);
await test("tutor databases and sessions stay separate, including teacher permissions", async () => {
  assert.notEqual(ownA.BOOKING_TOKEN_SECRET, ownB.BOOKING_TOKEN_SECRET);
  assert.equal(
    tutorB.one("SELECT id FROM students WHERE id=?", studentId),
    null,
  );
  assert.equal(
    (
      await tutorB.dispatch(
        request("/vowel/students", undefined, { token: teacherToken }),
        siteB,
        origin,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await tutorA.dispatch(
        request("/vowel/students", undefined, { token: studentToken }),
        site,
        origin,
      )
    ).status,
    401,
  );
});
let booked;
await test("a real booking through the shared engine gets immutable rule snapshots", async () => {
  const key = addDaysToKey(dateKey(new Date(), site.place.timeZone), 3),
    parts = key.split("-").map(Number),
    start = zonedToUtc(...parts, 720, site.place.timeZone).toISOString();
  const response = await tutorA.dispatch(
    request(
      "/bookings",
      {
        lessonType: "single",
        startAt: start,
        timezone: site.place.timeZone,
        location: "online",
        expectedPriceCents: 2500,
      },
      { token: studentToken },
    ),
    site,
    origin,
  );
  const result = await response.json();
  assert.equal(response.status, 201, result.error);
  await tutorA.ctx.drain();
  booked = tutorA.one(
    "SELECT * FROM bookings WHERE reference=?",
    result.booking.reference,
  );
  assert.equal(booked.policy_notice_hours, 24);
  assert.equal(booked.policy_fee_cents, 0);
  assert.equal(booked.amount_cents, 2500);
  const changed = {
    ...structuredClone(site),
    version: site.version + 1,
    rules: {
      ...site.rules,
      noticeHours: 48,
      lateFeeCents: 500,
      noShow: "full",
    },
  };
  await tutorA.configure(changed, origin);
  site = changed;
  const now = new Date(Date.parse(booked.starts_at) - 30 * 3600000);
  assert.equal(changePolicy(booked, now, 48).late, false);
  assert.equal(
    lessonChargePlan(
      { ...booked, attendance_status: "no_show" },
      { price_cents: 2500 },
      { sameDayChangeFeeCents: 500 },
    ).amountCents,
    0,
  );
});
await test("a weekly run retains its agreed price after a tutor edits public prices", async () => {
  const id = crypto.randomUUID(),
    stamp = new Date().toISOString();
  tutorA.rows(
    "INSERT INTO booking_series(id,student_id,lesson_type_id,weekday,minute_of_day,status,filled_to,created_at,updated_at) VALUES(?,?,'single',1,720,'active',?,?,?)",
    id,
    studentId,
    "2026-12-01",
    stamp,
    stamp,
  );
  assert.equal(
    tutorA.one("SELECT policy_price_cents FROM booking_series WHERE id=?", id)
      .policy_price_cents,
    2500,
  );
  const next = {
    ...structuredClone(site),
    version: site.version + 1,
    lessons: site.lessons.map((l) =>
      l.id === "single" ? { ...l, priceCents: 4000 } : l,
    ),
  };
  await tutorA.configure(next, origin);
  site = next;
  tutorA.rows(
    "INSERT INTO bookings(id,reference,lesson_type_id,student_id,student_name,student_email,starts_at,ends_at,created_at,updated_at,amount_cents,series_id) VALUES(?,?,'single',?,'Student','student@example.invalid',?,?,?,?,4000,?)",
    crypto.randomUUID(),
    "VL-SERIES",
    studentId,
    "2026-12-07T17:00:00.000Z",
    "2026-12-07T18:00:00.000Z",
    stamp,
    stamp,
    id,
  );
  assert.equal(
    tutorA.one("SELECT amount_cents FROM bookings WHERE reference='VL-SERIES'")
      .amount_cents,
    2500,
  );
  // The nightly path must use the agreement for its payment state too: a
  // later free public offer cannot make an existing paid weekly run free.
  const freePublic = {
    ...structuredClone(site),
    version: site.version + 1,
    lessons: site.lessons.map((l) =>
      l.id === "single" ? { ...l, priceCents: 0 } : l,
    ),
  };
  await tutorA.configure(freePublic, origin);
  site = freePublic;
  await bookingWorker.scheduled(
    {},
    await tutorA.ownEnv(site, origin, false),
    tutorA.ctx,
  );
  await tutorA.ctx.drain();
  const extended = tutorA.rows(
    "SELECT * FROM bookings WHERE series_id=? AND reference<>'VL-SERIES'",
    id,
  );
  assert.ok(
    extended.length > 0,
    "nightly extension should add real occurrences",
  );
  assert.ok(
    extended.every(
      (row) => row.amount_cents === 2500 && row.payment_status !== "free",
    ),
  );
});
await test("a student's price offer changes nothing until that student accepts", async () => {
  let response = await tutorA.dispatch(
    request(
      "/vowel/rates",
      { studentId, lessonTypeId: "single", amountCents: 2000 },
      { token: teacherToken },
    ),
    site,
    origin,
  );
  assert.equal(response.status, 200);
  assert.equal(
    tutorA.one(
      "SELECT amount_cents FROM student_lesson_rates WHERE student_id=?",
      studentId,
    ),
    null,
  );
  const proposal = tutorA.one(
    "SELECT * FROM rate_proposals WHERE student_id=?",
    studentId,
  );
  response = await tutorB.dispatch(
    request(
      "/vowel/rate-proposals",
      { id: proposal.id, accept: true },
      { token: studentToken },
    ),
    siteB,
    origin,
  );
  assert.equal(response.status, 401);
  response = await tutorA.dispatch(
    request(
      "/vowel/rate-proposals",
      { id: proposal.id, accept: true },
      { token: studentToken },
    ),
    site,
    origin,
  );
  assert.equal(response.status, 200);
  assert.equal(
    tutorA.one(
      "SELECT amount_cents FROM student_lesson_rates WHERE student_id=?",
      studentId,
    ).amount_cents,
    2000,
  );
});
await test("manual payment stays available without Stripe; trial expiry preserves existing records", async () => {
  const parts = addDaysToKey(dateKey(new Date(), site.place.timeZone), 4)
      .split("-")
      .map(Number),
    start = zonedToUtc(...parts, 810, site.place.timeZone).toISOString();
  const both = {
    ...structuredClone(site),
    version: site.version + 1,
    stripeAccount: "acct_fixture_unconfigured",
    rules: { ...site.rules, paymentMode: "both" },
  };
  let response = await tutorA.dispatch(
    request(
      "/bookings",
      {
        lessonType: "single",
        startAt: start,
        timezone: site.place.timeZone,
        location: "online",
        expectedPriceCents: 2000,
        paymentPreference: "manual",
      },
      { token: studentToken },
    ),
    both,
    origin,
  );
  const result = await response.json();
  assert.equal(response.status, 201, result.error);
  await tutorA.ctx.drain();
  const expired = {
    ...structuredClone(site),
    version: both.version + 1,
    trialEndsAt: Date.now() - 1000,
  };
  response = await tutorA.dispatch(
    request(
      "/bookings",
      {
        lessonType: "single",
        startAt: start,
        location: "online",
        expectedPriceCents: 2000,
      },
      { token: studentToken },
    ),
    expired,
    origin,
  );
  assert.equal(response.status, 403);
  response = await tutorA.dispatch(
    request("/me", undefined, { token: studentToken }),
    expired,
    origin,
  );
  assert.equal(response.status, 200);
  site = expired;
});
await test("curriculum drafts are language-specific and review gaps shorten after difficulty", async () => {
  const pt = packFor({ code: "pt-PT" }),
    ja = packFor({ code: "ja" }),
    profile = { level: "A1", goals: "", first_language: "English" },
    plan = draftPlan({ pack: pt, profile, lesson: { duration_minutes: 45 } });
  assert.equal(plan.language, "European Portuguese");
  assert.notDeepEqual(pt.words, ja.words);
  assert.deepEqual(ja.levels, ["N5", "N4", "N3", "N2", "N1"]);
  assert.equal(
    plan.stages.reduce((n, s) => n + s.minutes, 0),
    45,
  );
  assert.equal(plan.needsTeacherReview, true);
  assert.ok(
    plan.homework.sections.some((s) =>
      s.questions.some((q) => q.answer.startsWith("Tutor:")),
    ),
  );
  assert.equal(nextReview({ successes: 3 }, false, 0).days, 1);
  assert.equal(nextReview({ successes: 3 }, true, 0).days, 30);
});
await test("curriculum approval requires checked answers and keeps homework private", async () => {
  const path = "/vowel/curriculum";
  let response = await tutorA.dispatch(
    request(
      `${path}/profile`,
      { studentId, level: "A1", goals: "Explain my work", approvePack: true },
      { token: teacherToken },
    ),
    site,
    origin,
  );
  assert.equal(response.status, 200);
  response = await tutorA.dispatch(
    request(`${path}/draft`, { bookingId: booked.id }, { token: studentToken }),
    site,
    origin,
  );
  assert.equal(response.status, 401);
  response = await tutorA.dispatch(
    request(`${path}/draft`, { bookingId: booked.id }, { token: teacherToken }),
    site,
    origin,
  );
  assert.equal(response.status, 200);
  const { plan } = await response.json();
  response = await tutorA.dispatch(
    request(
      `${path}/approve`,
      { bookingId: booked.id, plan, confirm: true },
      { token: teacherToken },
    ),
    site,
    origin,
  );
  assert.equal(response.status, 400);
  for (const section of plan.homework.sections)
    for (const question of section.questions)
      question.answer =
        "A checked model answer supplied by this fixture's tutor.";
  response = await tutorA.dispatch(
    request(
      `${path}/approve`,
      { bookingId: booked.id, plan, confirm: true },
      { token: teacherToken },
    ),
    site,
    origin,
  );
  assert.equal(response.status, 200);
  const homework = tutorA.one(
    "SELECT * FROM lesson_homework WHERE booking_id=?",
    booked.id,
  );
  assert.ok(homework.draft_json);
  assert.equal(homework.published_json, null);
  response = await tutorA.dispatch(
    request(
      `${path}/taught`,
      { bookingId: booked.id },
      { token: teacherToken },
    ),
    site,
    origin,
  );
  assert.equal(response.status, 409);
});
await test("unsafe currencies and client-controlled storage or feature flags cannot cross the model boundary", () => {
  assert.throws(
    () => updateSite(site, { place: { currency: "JPY" } }),
    /two decimal/,
  );
  const next = updateSite(site, {
    database: "DB_INES",
    features: { expressions: true },
    stripeAccount: "acct_attacker",
  });
  assert.equal(next.features.expressions, false);
  assert.equal(next.stripeAccount, site.stripeAccount);
  assert.equal(next.database, undefined);
});
await test("billing saves a card without charging early and grants access only after a verified webhook", async () => {
  const billingEnv = {
    ...env,
    VOWEL_STRIPE_SECRET_KEY: "sk_test_vowel_fixture_only",
    VOWEL_STRIPE_WEBHOOK_SECRET:
      "vowel-fixture-webhook-signature-only-not-real",
    VOWEL_STRIPE_PRODUCT_ID: "prod_fixture",
  };
  const billing = new Directory(context(), billingEnv, directorySchema),
    user = await billing.provisionUser("billing@example.invalid", "Billing");
  const draft = await billing.createSite(user),
    id = draft.id,
    account = "acct_fixture";
  billing.rows(
    "UPDATE sites SET stripe_account=?,trial_ends_at=?,published_at=?,billing='scheduled' WHERE id=?",
    account,
    Date.now() + 86400000,
    Date.now() - 29 * 86400000,
    id,
  );
  billing.rows(
    "INSERT INTO billing_methods VALUES(?,?,?)",
    id,
    "pm_fixture",
    Date.now(),
  );
  const calls = [];
  let cancelDuringList = false;
  const subscription = {
    id: "sub_fixture",
    status: "active",
    customer_account: account,
    metadata: { vowel_site: id },
  };
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url)),
      params = new URLSearchParams(init?.body || "");
    calls.push({ path: target.pathname, method: init?.method, params });
    if (target.pathname === "/v1/checkout/sessions")
      return Response.json({
        id: "cs_fixture",
        url: "https://checkout.stripe.com/c/pay/fixture",
      });
    if (target.pathname === "/v1/subscriptions" && init?.method === "POST")
      return Response.json(subscription);
    if (target.pathname === "/v1/subscriptions") {
      if (cancelDuringList)
        billing.rows("UPDATE sites SET billing='cancelled' WHERE id=?", id);
      return Response.json({ data: [] });
    }
    if (target.pathname === "/v1/subscriptions/sub_fixture")
      return Response.json(subscription);
    throw new Error(`Unexpected payment request: ${target.pathname}`);
  };
  await subscriptionCheckout(billingEnv, billing.getSite(id), user, origin);
  assert.equal(calls[0].params.get("mode"), "setup");
  assert.equal(calls[0].params.get("customer_account"), account);
  await assert.rejects(
    () => startSubscription(billing, billing.getSite(id)),
    /hasn't ended/,
  );
  assert.equal(calls.length, 1);
  billing.rows(
    "UPDATE sites SET trial_ends_at=? WHERE id=?",
    Date.now() - 1000,
    id,
  );
  cancelDuringList = true;
  await startSubscription(billing, billing.getSite(id));
  assert.equal(
    calls.filter((c) => c.method === "POST" && c.path === "/v1/subscriptions")
      .length,
    0,
  );
  cancelDuringList = false;
  billing.rows("UPDATE sites SET billing='scheduled' WHERE id=?", id);
  await startSubscription(billing, billing.getSite(id));
  const create = calls.find(
    (c) => c.method === "POST" && c.path === "/v1/subscriptions",
  );
  assert.equal(create.params.get("items[0][price_data][unit_amount]"), "2500");
  assert.equal(create.params.get("items[0][price_data][currency]"), "eur");
  assert.equal(billing.getSite(id).billing, "pending_confirmation");
  const event = {
      id: "evt_fixture",
      type: "customer.subscription.updated",
      livemode: false,
      data: { object: { id: subscription.id } },
    },
    raw = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000),
    hash = await signature(
      `${timestamp}.${raw}`,
      billingEnv.VOWEL_STRIPE_WEBHOOK_SECRET,
    );
  assert.equal(
    (
      await handlePlatformWebhook(
        billing,
        new Request(origin + "/webhook", {
          method: "POST",
          body: raw,
          headers: { "Stripe-Signature": "invalid" },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handlePlatformWebhook(
        billing,
        new Request(origin + "/webhook", {
          method: "POST",
          body: raw,
          headers: { "Stripe-Signature": `t=${timestamp},v1=${hash}` },
        }),
      )
    ).status,
    200,
  );
  assert.equal(billing.getSite(id).billing, "active");
  const before = calls.length;
  await handlePlatformWebhook(
    billing,
    new Request(origin + "/webhook", {
      method: "POST",
      body: raw,
      headers: { "Stripe-Signature": `t=${timestamp},v1=${hash}` },
    }),
  );
  assert.equal(calls.length, before);
});
globalThis.fetch = nativeFetch;
for (const { ctx, db } of contexts) {
  await ctx.drain();
  db.close();
}
console.log(`${passed} Vowel safety and teaching-flow tests passed.`);
