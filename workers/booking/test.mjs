/**
 * Unit tests for the parts of the booking Worker that are pure logic and
 * genuinely easy to get wrong: timezone arithmetic across DST, iCalendar
 * escaping and folding, and manage-link signing.
 *
 * Run with `npm run test:booking`. No network, no database, no Worker runtime.
 */

import assert from "node:assert/strict";
import { renderEmail } from "./email.mjs";
import { candidateStartMinutes, computeAvailability, DEFAULT_BOOKING_HORIZON_DAYS, isSlotBookable } from "./availability.mjs";
import {
  chargeSavedCard,
  checkoutSessionProblem,
  createCardSetupSession,
  createCheckoutSession,
  expireCheckoutSession,
  isTestMode,
  refundPayment,
  setupSessionProblem,
  stripeMode,
  stripeProblemIsRetryable,
  stripeReady,
  verifyWebhook
} from "./stripe.mjs";
import { verifyGoogleIdToken } from "./google.mjs";
import { hashPassword, verifyPassword, passwordProblem } from "./auth.mjs";
import { nifProblem, normaliseNif } from "./nif.mjs";
import { formatEuros } from "./money.mjs";
import { buildCalendarInvite, buildCalendarSeriesInvite, calendarUid } from "./ics.mjs";
import { normaliseWeeks, occurrenceInstants, outstandingFor, slotOf, SERIES_LENGTHS } from "./series.mjs";
import { createManageToken, readManageToken, safeEqual, bookingReference } from "./tokens.mjs";
import { rateLimitAddress } from "./rates.mjs";
import {
  PAYMENT_CONSENT_VERSION,
  amountAfterLessonTypeChange,
  changePolicy,
  lessonTypeChangeProblem,
  planSeriesCancellation
} from "./policy.mjs";
import { bookingPaymentProblem, lessonChargePlan, noShowProblem, normaliseLocation, notifySeries } from "./index.mjs";
import {
  addDaysToKey,
  dateKey,
  dayBounds,
  eachDateKey,
  differingZonedTime,
  formatInZone,
  formatShort,
  isValidTimeZone,
  offsetMinutes,
  parseDateKey,
  weekdayOf,
  zonedToUtc
} from "./time.mjs";

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}\n    ${error.message.split("\n")[0]}`);
  }
}

// --- Time -------------------------------------------------------------------

await test("Porto is UTC+1 in summer and UTC+0 in winter", () => {
  assert.equal(zonedToUtc(2026, 7, 15, 600).toISOString(), "2026-07-15T09:00:00.000Z");
  assert.equal(zonedToUtc(2026, 12, 15, 600).toISOString(), "2026-12-15T10:00:00.000Z");
});

await test("the spring-forward day is 23 hours long", () => {
  const { start, end } = dayBounds("2026-03-29");
  assert.equal((end - start) / 3600000, 23);
});

await test("the autumn fall-back day is 25 hours long", () => {
  const { start, end } = dayBounds("2026-10-25");
  assert.equal((end - start) / 3600000, 25);
});

await test("10:00 Porto stays 10:00 Porto across the DST boundary", () => {
  // The whole point of storing minutes-from-midnight rather than a fixed
  // offset: her 10:00 lesson must not become 09:00 when the clocks change.
  const before = zonedToUtc(2026, 10, 24, 600);
  const after = zonedToUtc(2026, 10, 26, 600);
  assert.equal(formatInZone(before).slice(-5), "10:00");
  assert.equal(formatInZone(after).slice(-5), "10:00");
  // ...even though they are a different number of UTC hours apart.
  assert.notEqual(before.toISOString().slice(11, 16), after.toISOString().slice(11, 16));
});

await test("offsetMinutes tracks the transition", () => {
  assert.equal(offsetMinutes(new Date("2026-07-15T12:00:00Z")), 60);
  assert.equal(offsetMinutes(new Date("2026-12-15T12:00:00Z")), 0);
});

await test("impossible dates are rejected rather than rolled forward", () => {
  assert.equal(parseDateKey("2026-02-31"), null);
  assert.equal(parseDateKey("2026-13-01"), null);
  assert.equal(parseDateKey("not-a-date"), null);
  assert.deepEqual(parseDateKey("2026-02-28"), { year: 2026, month: 2, day: 28 });
});

await test("weekday convention matches JavaScript (0 = Sunday)", () => {
  assert.equal(weekdayOf("2026-08-30"), 0); // Sunday
  assert.equal(weekdayOf("2026-08-31"), 1); // Monday
  assert.equal(weekdayOf("2026-08-29"), 6); // Saturday
});

await test("date arithmetic crosses month and year boundaries", () => {
  assert.equal(addDaysToKey("2026-08-31", 1), "2026-09-01");
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");
});

await test("the default booking window is twelve weeks and clamps later availability", async () => {
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async all() {
            if (sql.includes("FROM availability_rules")) {
              return { results: [{ weekday: 1, start_minute: 600, last_start_minute: 600 }] };
            }
            return { results: [] };
          }
        };
      }
    }
  };

  const { slotsByDate, settings } = await computeAvailability(env, {
    fromKey: "2026-08-30",
    toKey: "2026-12-31",
    lessonType: { duration_minutes: 60 },
    now: new Date("2026-08-30T08:00:00.000Z")
  });

  assert.equal(DEFAULT_BOOKING_HORIZON_DAYS, 84);
  assert.equal(settings.bookingHorizonDays, 84);
  assert.ok(slotsByDate["2026-11-16"]?.length, "the final Monday inside twelve weeks should be offered");
  assert.equal(slotsByDate["2026-11-23"], undefined, "the first Monday outside twelve weeks must stay closed");
});

await test("moving a recurrence ignores only that sequence's existing lessons", async () => {
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async all() {
            if (sql.includes("FROM availability_rules")) {
              return { results: [{ weekday: 1, start_minute: 600, last_start_minute: 600 }] };
            }
            if (sql.includes("FROM bookings")) {
              return {
                results: [{
                  id: "series-occurrence",
                  series_id: "series-a",
                  starts_at: "2026-09-07T09:00:00.000Z",
                  ends_at: "2026-09-07T10:00:00.000Z"
                }]
              };
            }
            return { results: [] };
          }
        };
      }
    }
  };

  const input = {
    fromKey: "2026-09-07",
    toKey: "2026-09-07",
    lessonType: { duration_minutes: 60 },
    now: new Date("2026-09-06T08:00:00.000Z")
  };
  const blocked = await computeAvailability(env, input);
  const moving = await computeAvailability(env, { ...input, ignoreSeriesId: "series-a" });

  assert.equal(blocked.slotsByDate["2026-09-07"], undefined);
  assert.equal(moving.slotsByDate["2026-09-07"]?.[0]?.startAt, "2026-09-07T09:00:00.000Z");
});

await test("14-hour notice hides early slots, allows the boundary and rejects a stale selection across DST", async () => {
  for (const { day, now, boundary } of [
    { day: "2026-09-07", now: "2026-09-06T19:00:00Z", boundary: "2026-09-07T09:00:00.000Z" },
    { day: "2026-10-25", now: "2026-10-24T20:00:00Z", boundary: "2026-10-25T10:00:00.000Z" }
  ]) {
    const env = {
      DB: {
        prepare(sql) {
          return {
            bind() { return this; },
            async all() {
              // No settings row: this also exercises a freshly provisioned/missing setting.
              return { results: sql.includes("FROM availability_rules")
                ? [{ weekday: weekdayOf(day), start_minute: 570, last_start_minute: 630 }]
                : [] };
            }
          };
        }
      }
    };
    const input = { lessonType: { duration_minutes: 60 }, now: new Date(now) };
    const { slotsByDate, settings } = await computeAvailability(env, { ...input, fromKey: day, toKey: day });
    assert.equal(settings.minimumNoticeHours, 14);
    assert.deepEqual(slotsByDate[day].map((slot) => slot.startAt), [
      boundary, new Date(Date.parse(boundary) + 1800000).toISOString()
    ]);
    assert.equal((await isSlotBookable(env, { ...input, startAt: boundary })).ok, true);
    const stale = await isSlotBookable(env, {
      ...input, startAt: boundary, now: new Date(input.now.getTime() + 1)
    });
    assert.equal(stale.ok, false);
    assert.match(stale.reason, /at least 14 hours' notice/);
  }
});

await test("eachDateKey is inclusive and refuses to run away", () => {
  assert.deepEqual(eachDateKey("2026-08-30", "2026-09-01"), ["2026-08-30", "2026-08-31", "2026-09-01"]);
  assert.equal(eachDateKey("2026-09-01", "2026-08-01").length, 0);
  assert.ok(eachDateKey("2020-01-01", "2030-01-01").length <= 400);
});

await test("dateKey reports the Porto date, not the UTC one", () => {
  // 00:30 Porto in summer is 23:30 UTC the previous day. A booking then belongs
  // to the Porto date, or her whole day boundary is off by one.
  assert.equal(dateKey(new Date("2026-07-14T23:30:00Z")), "2026-07-15");
});

await test("invalid timezones are rejected", () => {
  assert.equal(isValidTimeZone("Europe/Lisbon"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
  assert.equal(isValidTimeZone(""), false);
});

// --- Slot generation --------------------------------------------------------

const asTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

await test("lastStart is a start time, so lesson length does not shorten the day", () => {
  // Her Wed-Fri rule: first start 17:00, last start 19:00.
  const range = [{ start: 1020, lastStart: 1140 }];
  const hour = candidateStartMinutes({ startRanges: range, duration: 60, interval: 30 });
  const longer = candidateStartMinutes({ startRanges: range, duration: 90, interval: 30 });

  // Both formats must still offer 19:00 — the 90-minute one simply runs to 20:30.
  assert.equal(asTime(hour.at(-1)), "19:00");
  assert.equal(asTime(longer.at(-1)), "19:00");
  assert.deepEqual(hour, longer);
});

await test("a 15-minute interval offers every quarter hour, and blocks still remove overlaps", () => {
  const range = [{ start: 600, lastStart: 720 }];
  const starts = candidateStartMinutes({ startRanges: range, duration: 60, interval: 15 }).map(asTime);
  assert.deepEqual(starts, ["10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30", "11:45", "12:00"]);
  // Time off from 11:00 to 11:30 withholds every start whose hour would touch it.
  const blocked = candidateStartMinutes({
    startRanges: range,
    blockedSpans: [{ start: 660, end: 690 }],
    duration: 60,
    interval: 15
  }).map(asTime);
  assert.deepEqual(blocked, ["10:00", "11:30", "11:45", "12:00"]);
});

await test("a blocked span withholds every lesson that would overlap it", () => {
  const range = [{ start: 600, lastStart: 1140 }];
  // She is out 13:00-14:00.
  const blockedSpans = [{ start: 780, end: 840 }];
  const starts = candidateStartMinutes({ startRanges: range, blockedSpans, duration: 60, interval: 30 }).map(asTime);

  // 12:30 would run into 13:00, so it goes too — not just the slots inside it.
  assert.ok(!starts.includes("12:30"), "a lesson overlapping the block was still offered");
  assert.ok(!starts.includes("13:00"));
  assert.ok(!starts.includes("13:30"));
  assert.ok(starts.includes("12:00"), "12:00 finishes exactly as the block starts and is fine");
  assert.ok(starts.includes("14:00"), "14:00 begins exactly as the block ends and is fine");
});

await test("a longer lesson is withheld earlier than a shorter one", () => {
  const range = [{ start: 600, lastStart: 1140 }];
  const blockedSpans = [{ start: 780, end: 840 }];
  const hour = candidateStartMinutes({ startRanges: range, blockedSpans, duration: 60, interval: 30 }).map(asTime);
  const longer = candidateStartMinutes({ startRanges: range, blockedSpans, duration: 90, interval: 30 }).map(asTime);

  assert.ok(hour.includes("12:00"));
  assert.ok(!longer.includes("12:00"), "a 90-minute lesson at 12:00 would run into the block");
  assert.ok(longer.includes("11:30"));
});

await test("a lunch block withholds a long lesson earlier than a short one", () => {
  // Her Mon-Tue rule, with 12:30-13:30 blocked every weekday.
  const startRanges = [{ start: 600, lastStart: 1140 }];
  const blockedSpans = [{ start: 750, end: 810 }];
  const hour = candidateStartMinutes({ startRanges, blockedSpans, duration: 60, interval: 30 }).map(asTime);
  const longer = candidateStartMinutes({ startRanges, blockedSpans, duration: 90, interval: 30 }).map(asTime);

  // An hour ending exactly as lunch begins is fine; the next one is not.
  assert.ok(hour.includes("11:30"));
  assert.ok(!hour.includes("12:00"));
  assert.ok(hour.includes("13:30"));

  // Ninety minutes from 11:30 would run to 13:00, straight through it. This is
  // why lunch is a blocked span rather than a gap between two rules — splitting
  // the rules could not have known the lesson's length.
  assert.ok(!longer.includes("11:30"));
  assert.ok(longer.includes("11:00"));
  assert.ok(longer.includes("13:30"));
});

await test("overlapping rules merge instead of double-offering a time", () => {
  const starts = candidateStartMinutes({
    startRanges: [
      { start: 600, lastStart: 720 },
      { start: 660, lastStart: 780 }
    ],
    duration: 60,
    interval: 30
  });
  assert.equal(new Set(starts).size, starts.length, "a time was offered twice");
  assert.equal(asTime(starts[0]), "10:00");
  assert.equal(asTime(starts.at(-1)), "13:00");
});

await test("a whole-day block leaves nothing bookable", () => {
  const starts = candidateStartMinutes({
    startRanges: [{ start: 600, lastStart: 1140 }],
    blockedSpans: [{ start: 0, end: 1440 }],
    duration: 60,
    interval: 30
  });
  assert.equal(starts.length, 0);
});

await test("a second timezone is only offered when the clock actually differs", () => {
  const summer = new Date("2026-09-25T18:00:00Z");
  const winter = new Date("2026-12-15T10:00:00Z");

  // Lisbon and London share an offset all year, so showing both is pure noise —
  // "19:00 (WEST) / 19:00 (BST)" is what a UK student was being sent.
  assert.equal(differingZonedTime(summer, "Europe/London"), null);
  assert.equal(differingZonedTime(winter, "Europe/London"), null);
  assert.equal(differingZonedTime(summer, "Europe/Lisbon"), null);
  assert.equal(differingZonedTime(summer, ""), null);

  // A genuinely different clock is still shown.
  assert.match(differingZonedTime(summer, "America/New_York") ?? "", /14:00/);
  assert.match(differingZonedTime(summer, "Europe/Berlin") ?? "", /20:00/);
});

await test("the short form used in subject lines stays short and is Porto-based", () => {
  const summer = new Date("2026-09-25T18:00:00Z");
  assert.equal(formatShort(summer), "Fri 25 Sept, 19:00");

  // Winter, when Porto is UTC — the same instant must not shift the label.
  const winter = new Date("2026-12-15T10:00:00Z");
  assert.equal(formatShort(winter), "Tue 15 Dec, 10:00");

  // Short enough that an inbox does not truncate the sender's meaning away.
  assert.ok(formatShort(summer).length <= 20, formatShort(summer));
});

// --- iCalendar --------------------------------------------------------------

await test("TEXT values escape backslash, semicolon, comma and newline", () => {
  const ics = buildCalendarInvite({
    method: "REQUEST",
    uid: "u@x",
    sequence: 0,
    summary: "A; B, C\\D",
    description: "line one\nline two",
    location: "Online",
    startsAt: "2026-09-03T09:00:00.000Z",
    endsAt: "2026-09-03T10:00:00.000Z",
    organiserName: "Inês",
    organiserEmail: "a@b.com"
  });
  assert.ok(ics.includes("SUMMARY:A\\; B\\, C\\\\D"), "escaping is wrong");
  assert.ok(ics.includes("DESCRIPTION:line one\\nline two"));
});

await test("no line exceeds 75 octets, and accents survive folding", () => {
  const ics = buildCalendarInvite({
    method: "REQUEST",
    uid: calendarUid("abc"),
    sequence: 3,
    summary: "Aula de Português com a Inês — um título deliberadamente longo para forçar a dobragem",
    description: "Inês Dias Baía",
    location: "Porto",
    startsAt: "2026-09-03T09:00:00.000Z",
    endsAt: "2026-09-03T10:00:00.000Z",
    organiserName: "Inês Dias Baía",
    organiserEmail: "a@b.com",
    attendees: [{ name: "Inês Dias Baía", email: "i@example.com" }]
  });

  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
  assert.ok(ics.replace(/\r\n /g, "").includes("Português"), "unfolded text lost its accents");
});

await test("a cancellation is CANCEL/CANCELLED and carries no alarm", () => {
  const ics = buildCalendarInvite({
    method: "CANCEL",
    uid: "u@x",
    sequence: 2,
    summary: "s",
    description: "d",
    location: "l",
    startsAt: "2026-09-03T09:00:00.000Z",
    endsAt: "2026-09-03T10:00:00.000Z",
    organiserName: "I",
    organiserEmail: "a@b.com"
  });
  assert.ok(ics.includes("METHOD:CANCEL"));
  assert.ok(ics.includes("STATUS:CANCELLED"));
  assert.ok(!ics.includes("BEGIN:VALARM"), "a cancelled event should not remind anyone");
});

await test("UID is stable so updates land on the original event", () => {
  assert.equal(calendarUid("abc"), calendarUid("abc"));
  assert.notEqual(calendarUid("abc"), calendarUid("def"));
});

// --- Tokens -----------------------------------------------------------------

await test("a manage token round-trips", async () => {
  const token = await createManageToken("booking-1", "secret");
  assert.equal(await readManageToken(token, "secret"), "booking-1");
});

await test("a tampered or re-signed token is rejected", async () => {
  const token = await createManageToken("booking-1", "secret");
  assert.equal(await readManageToken(`${token}x`, "secret"), null);
  assert.equal(await readManageToken(token, "other-secret"), null);
  // The signature belongs to that booking id and cannot be moved to another.
  const [, signature] = token.split(".");
  assert.equal(await readManageToken(`booking-2.${signature}`, "secret"), null);
  assert.equal(await readManageToken("nonsense", "secret"), null);
  assert.equal(await readManageToken("", "secret"), null);
});

await test("safeEqual compares correctly", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "ab"), false);
  assert.equal(safeEqual(undefined, ""), true);
});

await test("booking references avoid ambiguous glyphs", () => {
  for (let index = 0; index < 200; index += 1) {
    const reference = bookingReference();
    assert.match(reference, /^PT-[ACDEFGHJKLMNPQRSTUVWXYZ2345679]{6}$/);
  }
});

// --- Rate-limit keys ----------------------------------------------------------

await test("an IPv6 client is keyed by its /64, however the address is written", () => {
  const key = "2001:db8:0:0::/64";
  assert.equal(rateLimitAddress("2001:0db8:0000:0000:0000:0000:0000:0001"), key, "full form");
  assert.equal(rateLimitAddress("2001:db8::1"), key, "compressed");
  assert.equal(rateLimitAddress("2001:DB8::FFFF:FFFF:FFFF:FFFE"), key, "upper case, far end of the same /64");
  assert.equal(rateLimitAddress("2001:db8:0:1::1"), "2001:db8:0:1::/64", "the next /64 is another client");
  assert.equal(rateLimitAddress("::1"), "0:0:0:0::/64");
});

await test("an IPv4 client keeps its own key, also when mapped into IPv6", () => {
  assert.equal(rateLimitAddress("203.0.113.41"), "203.0.113.41");
  assert.equal(rateLimitAddress("::ffff:203.0.113.41"), "203.0.113.41", "dotted IPv4-mapped");
  assert.equal(rateLimitAddress("::FFFF:CB00:7129"), "203.0.113.41", "hex IPv4-mapped");
  assert.notEqual(rateLimitAddress("::ffff:203.0.113.42"), rateLimitAddress("::ffff:203.0.113.41"), "not pooled as one /64");
  assert.equal(rateLimitAddress(null), "local");
  assert.equal(rateLimitAddress(""), "local");
  assert.equal(rateLimitAddress("not:an:address"), "not:an:address", "anything unreadable is keyed as it came");
});

// --- Stripe webhook signature ------------------------------------------------

const SECRET = "whsec_test_secret";

async function stripeSignature(payload, timestamp, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

await test("a correctly signed webhook is accepted", async () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=${await stripeSignature(payload, timestamp)}`;
  assert.equal(await verifyWebhook(payload, header, SECRET), true);
});

await test("any valid v1 signature is accepted during a webhook-secret rotation", async () => {
  const payload = JSON.stringify({ id: "evt_rotating", type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const valid = await stripeSignature(payload, timestamp);
  const header = `t=${timestamp},v1=${valid},v1=${"0".repeat(64)}`;
  assert.equal(await verifyWebhook(payload, header, SECRET), true);
});

await test("a webhook signed with the wrong secret is rejected", async () => {
  const payload = JSON.stringify({ id: "evt_1" });
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=${await stripeSignature(payload, timestamp, "whsec_wrong")}`;
  assert.equal(await verifyWebhook(payload, header, SECRET), false);
});

await test("a tampered payload is rejected even with a valid signature", async () => {
  // The exact attack this guards: marking someone else's booking paid.
  const original = JSON.stringify({ id: "evt_1", amount: 100 });
  const timestamp = Math.floor(Date.now() / 1000);
  const header = `t=${timestamp},v1=${await stripeSignature(original, timestamp)}`;
  const tampered = JSON.stringify({ id: "evt_1", amount: 999999 });
  assert.equal(await verifyWebhook(tampered, header, SECRET), false);
});

await test("an old signature is rejected, so a captured request cannot be replayed", async () => {
  const payload = JSON.stringify({ id: "evt_1" });
  const stale = Math.floor(Date.now() / 1000) - 3600;
  const header = `t=${stale},v1=${await stripeSignature(payload, stale)}`;
  assert.equal(await verifyWebhook(payload, header, SECRET), false);
});

await test("malformed signature headers are rejected", async () => {
  const payload = "{}";
  for (const header of ["", "nonsense", "t=123", "v1=abc", "t=abc,v1=abc", null, undefined]) {
    assert.equal(await verifyWebhook(payload, header, SECRET), false, `accepted: ${header}`);
  }
});

await test("restricted and standard sandbox keys are both recognised as test mode", () => {
  assert.equal(isTestMode({ STRIPE_SECRET_KEY: "rk_test_example" }), true);
  assert.equal(isTestMode({ STRIPE_SECRET_KEY: "sk_test_example" }), true);
  assert.equal(isTestMode({ STRIPE_SECRET_KEY: "rk_live_example" }), false);
  assert.equal(isTestMode({ STRIPE_SECRET_KEY: "sk_live_example" }), false);
});

await test("Stripe readiness refuses a test key in the live Worker", () => {
  const shared = { STRIPE_WEBHOOK_SECRET: "whsec_example" };
  assert.equal(
    stripeReady({ ...shared, STRIPE_SECRET_KEY: "rk_test_example", STRIPE_EXPECTED_MODE: "live" }),
    false
  );
  assert.equal(
    stripeReady({ ...shared, STRIPE_SECRET_KEY: "rk_live_example", STRIPE_EXPECTED_MODE: "live" }),
    true
  );
  assert.equal(stripeMode({ ...shared, STRIPE_SECRET_KEY: "rk_live_example" }), "live");
  assert.equal(stripeMode({ ...shared, STRIPE_SECRET_KEY: "something_else" }), "unknown");
});

await test("saved-card charging fails closed and every booking requires explicit consent", () => {
  assert.deepEqual(
    bookingPaymentProblem({ paymentRequired: true, stripeIsReady: false, paymentConsent: true }),
    {
      status: 503,
      message: "Payment isn't available just now. Please try again in a few minutes, or message Inês."
    }
  );
  assert.equal(
    bookingPaymentProblem({
      paymentRequired: true,
      stripeIsReady: true,
      paymentConsent: false
    })?.status,
    400
  );
  assert.equal(
    bookingPaymentProblem({
      paymentRequired: true,
      stripeIsReady: true,
      paymentConsent: true
    }),
    null
  );
  assert.equal(
    bookingPaymentProblem({ paymentRequired: false, stripeIsReady: false, paymentConsent: false }),
    null
  );
});

await test("a completed setup session must match the held booking", () => {
  const booking = { stripe_session_id: "cs_test_setup" };
  const session = {
    id: "cs_test_setup",
    mode: "setup",
    status: "complete",
    setup_intent: "seti_test_saved",
    customer: "cus_test"
  };
  assert.equal(setupSessionProblem(session, booking), "");
  assert.equal(setupSessionProblem({ ...session, status: "open" }, booking), "card setup is not complete");
  assert.equal(setupSessionProblem({ ...session, id: "cs_other" }, booking), "session does not match");
  assert.equal(setupSessionProblem({ ...session, setup_intent: null }, booking), "setup intent is missing");
});

await test("card setup saves for off-session use and never creates a charge", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "cs_test_setup", client_secret: "cs_test_secret_setup" }), {
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    await createCardSetupSession(
      { STRIPE_SECRET_KEY: "rk_test_example", STRIPE_UI_MODE: "embedded" },
      {
        booking: { id: "booking_setup", reference: "PT-SET123" },
        customerEmail: "student@example.com",
        successUrl: "https://portuguesewithines.com/book/?card=saved",
        cancelUrl: "https://portuguesewithines.com/book/?cancelled=1"
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get("mode"), "setup");
  assert.equal(body.get("customer_creation"), "always");
  assert.equal(body.get("customer_email"), "student@example.com");
  assert.equal(body.has("customer"), false);
  // SetupIntents default to off_session; Checkout's setup_intent_data subset
  // does not accept a usage override.
  assert.equal(body.has("setup_intent_data[usage]"), false);
  assert.equal(body.has("line_items[0][price_data][unit_amount]"), false);
  assert.equal(request.options.headers["Idempotency-Key"], "ines:setup:booking_setup");
});

await test("an abandoned card setup is expired through Stripe's own endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return Response.json({ id: "cs_test_abandoned", status: "expired" });
  };
  try {
    assert.equal((await expireCheckoutSession({ STRIPE_SECRET_KEY: "rk_test_example" }, "cs_test_abandoned")).status, "expired");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(request.url, "https://api.stripe.com/v1/checkout/sessions/cs_test_abandoned/expire");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Stripe-Version"], "2026-08-26.dahlia");
});

await test("a paid Checkout Session must match the booking exactly", () => {
  const booking = { amount_cents: 2500, stripe_session_id: "cs_test_expected" };
  const session = {
    id: "cs_test_expected",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_test_paid",
    currency: "eur",
    amount_total: 2500
  };

  assert.equal(checkoutSessionProblem(session, booking), "");
  assert.equal(checkoutSessionProblem({ ...session, payment_status: "unpaid" }, booking), "payment is not paid");
  assert.equal(checkoutSessionProblem({ ...session, mode: "subscription" }, booking), "session is not a one-time payment");
  assert.equal(checkoutSessionProblem({ ...session, currency: "gbp" }, booking), "currency does not match");
  assert.equal(checkoutSessionProblem({ ...session, amount_total: 2000 }, booking), "amount does not match");
  assert.equal(checkoutSessionProblem({ ...session, id: "cs_test_other" }, booking), "session does not match");
  assert.equal(checkoutSessionProblem({ ...session, payment_intent: null }, booking), "payment intent is missing");
});

await test("Stripe requests pin the API version and identify this checkout integration", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "cs_test_example", client_secret: "cs_test_secret_example" }), {
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    await createCheckoutSession(
      { STRIPE_SECRET_KEY: "rk_test_example", STRIPE_UI_MODE: "embedded" },
      {
        booking: { id: "booking_1", reference: "PT-ABC234" },
        lessonType: { id: "single", name: "Single lesson", duration_minutes: 60, price_cents: 2500 },
        successUrl: "https://portuguesewithines.com/book/?payment=return",
        cancelUrl: "https://portuguesewithines.com/book/?payment=cancelled",
        customerEmail: "student@example.com"
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(request.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(request.options.headers["Stripe-Version"], "2026-08-26.dahlia");
  assert.equal(request.options.headers["Idempotency-Key"], "ines:checkout:booking_1:initial");
  const body = new URLSearchParams(request.options.body);
  assert.match(body.get("integration_identifier"), /^portugues-com-a-ines-[a-z]{8}$/);
  assert.equal(body.get("ui_mode"), "embedded_page");
  assert.equal(body.get("return_url"), "https://portuguesewithines.com/book/?payment=return");
  assert.equal(body.has("success_url"), false);
  assert.equal(body.has("cancel_url"), false);
  assert.equal(body.get("payment_method_types[0]"), "card");
  assert.equal(body.get("adaptive_pricing[enabled]"), "false");
  assert.equal(body.has("transfer_data[destination]"), false);
  assert.equal(body.has("on_behalf_of"), false);
});

await test("an automatic charge is idempotent and only returns a succeeded PaymentIntent", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "pi_test_paid", status: "succeeded" }), {
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const intent = await chargeSavedCard(
      { STRIPE_SECRET_KEY: "rk_test_example" },
      {
        bookingId: "booking_2",
        customer: "cus_test",
        paymentMethod: "pm_test",
        amountCents: 2500,
        description: "Single lesson · PT-ABC234"
      }
    );
    assert.equal(intent.status, "succeeded");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(request.url, "https://api.stripe.com/v1/payment_intents");
  assert.equal(request.options.headers["Idempotency-Key"], "ines:charge:booking_2:lesson");
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get("confirm"), "true");
  assert.equal(body.get("off_session"), "true");
  assert.equal(body.get("error_on_requires_action"), "true");
  assert.equal(body.get("payment_method_types[0]"), "card");
});

await test("an automatic charge that still requires customer action is not treated as paid", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "pi_test_action", status: "requires_action" }), {
      headers: { "Content-Type": "application/json" }
    });

  try {
    await assert.rejects(
      chargeSavedCard(
        { STRIPE_SECRET_KEY: "rk_test_example" },
        {
          bookingId: "booking_3",
          customer: "cus_test",
          paymentMethod: "pm_test",
          amountCents: 2500,
          description: "Single lesson · PT-ABC234"
        }
      ),
      /did not succeed \(requires_action\)/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test("ambiguous Stripe failures retry the same idempotency key instead of opening a second payment", () => {
  assert.equal(stripeProblemIsRetryable(new TypeError("network failed")), true);
  assert.equal(stripeProblemIsRetryable(Object.assign(new Error("Stripe busy"), { stripeStatus: 503 })), true);
  assert.equal(stripeProblemIsRetryable(Object.assign(new Error("rate limited"), { stripeStatus: 429 })), true);
  assert.equal(stripeProblemIsRetryable(Object.assign(new Error("card declined"), { stripeStatus: 402 })), false);
});

await test("a refund is idempotent for one booking", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "re_test_refund" }), {
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    await refundPayment(
      { STRIPE_SECRET_KEY: "rk_test_example" },
      { bookingId: "booking_4", paymentIntent: "pi_test_paid", amountCents: 2500 }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(request.url, "https://api.stripe.com/v1/refunds");
  assert.equal(request.options.headers["Idempotency-Key"], "ines:refund:booking_4");
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get("payment_intent"), "pi_test_paid");
  assert.equal(body.get("amount"), "2500");
});

// --- Password hashing --------------------------------------------------------

await test("a password round-trips, and a wrong one does not", async () => {
  const stored = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", stored), true);
  assert.equal(await verifyPassword("Correct horse battery", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

await test("every hash is salted, so identical passwords do not collide", async () => {
  const a = await hashPassword("same password");
  const b = await hashPassword("same password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same password", a), true);
  assert.equal(await verifyPassword("same password", b), true);
});

await test("no single PBKDF2 call exceeds the Workers cap of 100,000", async () => {
  // The runtime refuses more than this per call, and Miniflare does not
  // enforce it — which is why the deployed Worker was the first thing to fail.
  const [, cost] = (await hashPassword("x")).split("$");
  const [rounds, iterations] = cost.split("x").map(Number);
  assert.ok(iterations <= 100000, `single-call iterations too high: ${iterations}`);
  assert.ok(rounds * iterations >= 200000, `work factor too low: ${rounds * iterations}`);
});

await test("a stored hash carries its own cost, so it survives a change of cost", async () => {
  // A single-round record from before chaining must still verify.
  const legacy = await hashPassword("legacy");
  const asSingleRound = legacy.replace(/\$\d+x(\d+)\$/, "$$$1$$");
  assert.notEqual(asSingleRound, legacy);
  // The rewritten record has a different work factor, so it must NOT verify —
  // proving the cost is read from the record rather than assumed.
  assert.equal(await verifyPassword("legacy", asSingleRound), false);
  assert.equal(await verifyPassword("legacy", legacy), true);
});

await test("malformed hash records are rejected rather than throwing", async () => {
  for (const stored of ["", "nonsense", "pbkdf2$$$", "bcrypt$10$abc$def", "pbkdf2$0x0$YQ$YQ", null, undefined]) {
    assert.equal(await verifyPassword("anything", stored), false, `accepted: ${stored}`);
  }
});

await test("password length is enforced", () => {
  assert.ok(passwordProblem("short"));
  assert.equal(passwordProblem("eight888"), null);
  assert.ok(passwordProblem("x".repeat(500)));
});

await test("a NIF is optional, pasted formats are tidied and the check digit catches typos", () => {
  for (const pasted of [" PT 123 456 789 ", "123.456.789", "123-456-789", "pt123456789", 123456789]) {
    assert.equal(normaliseNif(pasted), "123456789", `pasted: ${pasted}`);
  }
  assert.equal(normaliseNif(undefined), "");
  assert.equal(nifProblem(""), null, "none given is allowed");
  // Remainders 0 and 1 both give a check digit of 0.
  for (const valid of ["123456789", "130000000", "220000000"]) assert.equal(nifProblem(valid), null, `refused: ${valid}`);
  for (const typo of ["123456788", "132456789", "130000001", "012345678", "000000000"]) {
    assert.match(nifProblem(typo), /isn't valid/, `accepted: ${typo}`);
  }
  for (const shape of ["12345678", "1234567890", "12345678a"]) assert.match(nifProblem(shape), /9 digits/, `accepted: ${shape}`);
});

// --- Google ID tokens --------------------------------------------------------

const CLIENT_ID = "1234.apps.googleusercontent.com";

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodePart = (object) => b64url(new TextEncoder().encode(JSON.stringify(object)));

const googleKeyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const publicJwk = await crypto.subtle.exportKey("jwk", googleKeyPair.publicKey);

// Stand in for Google's published keys, so no network is touched.
globalThis.fetch = async () =>
  new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }] }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" }
  });

async function makeIdToken(overrides = {}, { signingKey = googleKeyPair.privateKey, kid = "test-key" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodePart({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodePart({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "10769150350006150715",
    email: "joana@example.com",
    email_verified: true,
    name: "Joana Ferreira",
    iat: now,
    exp: now + 3600,
    ...overrides
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${b64url(signature)}`;
}

await test("a genuine Google ID token is accepted", async () => {
  const profile = await verifyGoogleIdToken(await makeIdToken(), CLIENT_ID);
  assert.equal(profile?.email, "joana@example.com");
  assert.equal(profile?.name, "Joana Ferreira");
});

await test("a token minted for another app is rejected", async () => {
  // Without the audience check, any Google app's token would sign a person in.
  assert.equal(await verifyGoogleIdToken(await makeIdToken(), "9999.apps.googleusercontent.com"), null);
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ aud: "someone-else" }), CLIENT_ID), null);
});

await test("a token from the wrong issuer is rejected", async () => {
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ iss: "https://evil.example" }), CLIENT_ID), null);
});

await test("an expired token is rejected", async () => {
  const past = Math.floor(Date.now() / 1000) - 7200;
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ iat: past, exp: past + 3600 }), CLIENT_ID), null);
});

await test("a token signed by someone else is rejected", async () => {
  const impostor = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const forged = await makeIdToken({}, { signingKey: impostor.privateKey });
  assert.equal(await verifyGoogleIdToken(forged, CLIENT_ID), null);
});

await test("an unverified Google email is rejected", async () => {
  // Otherwise someone could claim an account belonging to an address they do
  // not control, simply by putting it on a Google profile.
  assert.equal(await verifyGoogleIdToken(await makeIdToken({ email_verified: false }), CLIENT_ID), null);
});

await test("an unsigned token is rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const header = encodePart({ alg: "none", kid: "test-key" });
  const payload = encodePart({ iss: "https://accounts.google.com", aud: CLIENT_ID, email: "a@b.com", exp: now + 60 });
  assert.equal(await verifyGoogleIdToken(`${header}.${payload}.`, CLIENT_ID), null);
});

await test("a token referencing an unknown key is rejected", async () => {
  assert.equal(await verifyGoogleIdToken(await makeIdToken({}, { kid: "not-a-real-key" }), CLIENT_ID), null);
});

await test("malformed tokens are rejected", async () => {
  for (const token of ["", "a.b", "a.b.c", "not-a-token", null, undefined]) {
    assert.equal(await verifyGoogleIdToken(token, CLIENT_ID), null, `accepted: ${token}`);
  }
});


// --- Recurring bookings -----------------------------------------------------

await test("a weekly slot keeps its Porto wall-clock time across the autumn change", () => {
  // Portugal goes back to UTC+0 on 25 October 2026, in the middle of this run.
  // Adding 7x24 hours instead of stepping the date would hold the UTC instant
  // and so move every later lesson to 16:30 Porto — an hour earlier than the
  // student agreed to, for the rest of the term.
  const weeks = occurrenceInstants({ fromKey: "2026-10-22", minuteOfDay: 17 * 60 + 30, count: 3 });
  assert.deepEqual(
    weeks.map((week) => week.key),
    ["2026-10-22", "2026-10-29", "2026-11-05"]
  );
  // Before the change: 17:30 Porto is 16:30 UTC.
  assert.equal(weeks[0].startAt.toISOString(), "2026-10-22T16:30:00.000Z");
  // After it: still 17:30 Porto, now 17:30 UTC.
  assert.equal(weeks[1].startAt.toISOString(), "2026-10-29T17:30:00.000Z");
  assert.equal(weeks[2].startAt.toISOString(), "2026-11-05T17:30:00.000Z");
});

await test("the slot is read from the first lesson in Porto terms", () => {
  // 2026-09-09 is a Wednesday. 16:30 UTC is 17:30 Porto in summer time.
  const slot = slotOf("2026-09-09T16:30:00.000Z");
  assert.equal(slot.weekday, 3);
  assert.equal(slot.minuteOfDay, 17 * 60 + 30);
  assert.equal(slot.dateKey, "2026-09-09");
});

await test("a late-evening lesson is not pushed onto the next Porto day", () => {
  // 23:30 Porto on a Friday in summer is 22:30 UTC the same day.
  const slot = slotOf("2026-07-03T22:30:00.000Z");
  assert.equal(slot.dateKey, "2026-07-03");
  assert.equal(slot.weekday, 5);
  assert.equal(slot.minuteOfDay, 23 * 60 + 30);
});

await test("only the offered run lengths are accepted, and open-ended is distinct from invalid", () => {
  for (const weeks of SERIES_LENGTHS) assert.equal(normaliseWeeks(weeks), weeks);
  assert.equal(normaliseWeeks(null), null, "null is the open-ended choice");
  assert.equal(normaliseWeeks("open"), null);
  for (const bad of [1, 3, 5, 52, 0, -4, "many", {}]) {
    assert.equal(normaliseWeeks(bad), undefined, `accepted ${JSON.stringify(bad)}`);
  }
});

await test("rescheduling accepts either lesson location and otherwise keeps the current one", () => {
  assert.equal(normaliseLocation("online", "porto"), "online");
  assert.equal(normaliseLocation("porto", "online"), "porto");
  assert.equal(normaliseLocation(undefined, "porto"), "porto");
  assert.equal(normaliseLocation("elsewhere", "online"), "online");
});

await test("a bounded series stops asking for weeks once it has them all", () => {
  const series = { occurrences: 8, filled_to: "2026-10-28" };
  const now = new Date("2026-09-09T12:00:00.000Z");
  assert.equal(outstandingFor(series, { bookedCount: 8, now }), null);
  const partial = outstandingFor(series, { bookedCount: 5, now });
  assert.equal(partial.count, 3);
  // Resumes the week after the last one considered, never repeating it.
  assert.equal(partial.fromKey, "2026-11-04");
});

await test("an open-ended series is pulled forward to the horizon and no further", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const fresh = outstandingFor({ occurrences: null, filled_to: null }, { bookedCount: 0, now });
  assert.equal(fresh.fromKey, "2026-09-09");
  assert.ok(fresh.count > 0 && fresh.count <= 16);

  // Already filled beyond the horizon: nothing to do.
  const ahead = outstandingFor({ occurrences: null, filled_to: "2027-06-01" }, { bookedCount: 40, now });
  assert.equal(ahead, null);
});

await test("one calendar file carries every lesson, each under its own booking's UID", () => {
  const event = (id, day) => ({
    uid: calendarUid(id),
    sequence: 0,
    summary: "Lesson",
    description: "d",
    location: "Online",
    startsAt: `2026-09-${day}T16:30:00.000Z`,
    endsAt: `2026-09-${day}T17:30:00.000Z`,
    organiserName: "Inês",
    organiserEmail: "bookings@portuguesewithines.com",
    attendees: [{ name: "A", email: "a@example.com" }]
  });

  const ics = buildCalendarSeriesInvite({ method: "REQUEST", events: [event("a", "09"), event("b", "16")] });
  assert.equal(ics.split("BEGIN:VCALENDAR").length - 1, 1, "one calendar");
  assert.equal(ics.split("BEGIN:VEVENT").length - 1, 2, "two events");
  // Distinct UIDs are what let one week be moved later without duplicating it.
  assert.ok(ics.includes(`UID:${calendarUid("a")}`));
  assert.ok(ics.includes(`UID:${calendarUid("b")}`));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
});

function seriesEmailFixture() {
  const emailLog = [];
  const env = {
    EMAIL_DRY_RUN: "1",
    TEACHER_EMAIL: "ines@example.com",
    MAIL_SENDER_ADDRESS: "bookings@portuguesewithines.com",
    SITE_URL: "https://portuguesewithines.com",
    DB: {
      prepare(sql) {
        let values = [];
        return {
          bind(...next) {
            values = next;
            return this;
          },
          async run() {
            if (sql.startsWith("INSERT INTO email_log")) {
              emailLog.push({ bookingId: values[0], kind: values[1], recipient: values[2], dedupeKey: values[3] });
            }
            return { success: true };
          }
        };
      }
    }
  };

  const row = (id, startsAt, endsAt) => ({
    id,
    reference: `PT-${id.toUpperCase()}`,
    sequence: 0,
    student_name: "Ana Silva",
    student_email: "ana@example.com",
    student_phone: "",
    student_timezone: "Europe/Lisbon",
    location: "online",
    notes: "",
    starts_at: startsAt,
    ends_at: endsAt,
    payment_status: "not_required"
  });

  return {
    env,
    emailLog,
    rows: [
      row("one", "2026-09-03T16:30:00.000Z", "2026-09-03T17:30:00.000Z"),
      row("two", "2026-09-10T16:30:00.000Z", "2026-09-10T17:30:00.000Z"),
      row("three", "2026-09-17T16:30:00.000Z", "2026-09-17T17:30:00.000Z")
    ],
    lessonType: { name: "Single lesson", duration_minutes: 60, price_cents: 3000 },
    settings: {
      teacherName: "Inês Dias Baía",
      teacherEmail: "ines@example.com",
      replyToEmail: "ines@example.com",
      sameDayChangeFeeCents: 500,
      minimumNoticeHours: 14
    },
    manageUrls: {
      one: "https://portuguesewithines.com/book/?manage=one",
      two: "https://portuguesewithines.com/book/?manage=two",
      three: "https://portuguesewithines.com/book/?manage=three"
    }
  };
}

await test("direct calendar sync omits teacher attachments but preserves student invitations", async () => {
  const fixture = seriesEmailFixture();
  Object.assign(fixture.env, { GOOGLE_CALENDAR_ENABLED: "1", GOOGLE_CALENDAR_CLIENT_ID: "fixture", GOOGLE_CALENDAR_CLIENT_SECRET: "fixture", GOOGLE_CALENDAR_TOKEN_KEY: "aa".repeat(32) });
  for (const row of fixture.rows) Object.assign(row, { status: "confirmed", meeting_event_id: `event-${row.id}`, meeting_sequence: 0, meeting_url: "https://meet.google.com/abc-defg-hij" });
  const prepare = fixture.env.DB.prepare;
  fixture.env.DB.prepare = sql => {
    const statement = prepare(sql);
    let args = [];
    const bind = statement.bind.bind(statement);
    statement.bind = (...values) => { args = values; return bind(...values); };
    statement.first = async () => sql.includes("google_calendar_connections")
      ? { calendar_id: "fixture@group.calendar.google.com", status: "active" }
      : fixture.rows.find(row => row.id === args[0]);
    return statement;
  };
  const logs = [];
  const originalLog = console.log;
  console.log = message => { try { logs.push(JSON.parse(message)); } catch { /* unrelated logs */ } };
  try {
    await notifySeries(fixture.env, { rows: fixture.rows, lessonType: fixture.lessonType,
      settings: fixture.settings, series: { id: "series-synced", occurrences: 3 }, manageUrls: fixture.manageUrls, skipped: [] });
  } finally { console.log = originalLog; }
  assert.equal(logs.find(row => row.kind === "teacher_series_booked").calendar, null);
  assert.equal(logs.find(row => row.kind === "student_series_booked").calendar, "REQUEST");
});

await test("a repeating booking sends one consolidated email to the client", async () => {
  const fixture = seriesEmailFixture();
  const originalLog = console.log;
  console.log = () => {};
  try {
    await notifySeries(fixture.env, {
      rows: fixture.rows,
      lessonType: fixture.lessonType,
      settings: fixture.settings,
      series: { id: "series-fixed", occurrences: 4 },
      manageUrls: fixture.manageUrls,
      skipped: []
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(
    fixture.emailLog.map(({ kind, recipient }) => ({ kind, recipient })),
    [
      { kind: "student_series_booked", recipient: "ana@example.com" },
      { kind: "teacher_series_booked", recipient: "ines@example.com" }
    ]
  );
});

await test("teacher notifications can pause without silencing the student", async () => {
  const fixture = seriesEmailFixture();
  fixture.env.TEACHER_NOTIFICATIONS_ENABLED = "0";
  const originalLog = console.log;
  console.log = () => {};
  try {
    await notifySeries(fixture.env, {
      rows: fixture.rows,
      lessonType: fixture.lessonType,
      settings: fixture.settings,
      series: { id: "series-paused-teacher", occurrences: 6 },
      manageUrls: fixture.manageUrls,
      skipped: []
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(
    fixture.emailLog.map(({ kind, recipient }) => ({ kind, recipient })),
    [{ kind: "student_series_booked", recipient: "ana@example.com" }]
  );
});

await test("moving a recurring sequence sends one updated calendar to each enabled recipient", async () => {
  const fixture = seriesEmailFixture();
  fixture.rows.forEach((row) => { row.sequence = 2; });
  const originalLog = console.log;
  console.log = () => {};
  try {
    await notifySeries(fixture.env, {
      rows: fixture.rows,
      lessonType: fixture.lessonType,
      settings: fixture.settings,
      series: { id: "series-moved", occurrences: 4 },
      manageUrls: fixture.manageUrls,
      skipped: [],
      reason: "moved"
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(
    fixture.emailLog.map(({ kind, recipient }) => ({ kind, recipient })),
    [
      { kind: "student_series_moved", recipient: "ana@example.com" },
      { kind: "teacher_series_moved", recipient: "ines@example.com" }
    ]
  );
  assert.ok(fixture.emailLog.every(({ dedupeKey }) => dedupeKey.endsWith(":2")));
});

await test("automatic open-ended top-ups do not send another client email", async () => {
  const fixture = seriesEmailFixture();
  const originalLog = console.log;
  console.log = () => {};
  try {
    await notifySeries(fixture.env, {
      rows: [fixture.rows[0]],
      lessonType: fixture.lessonType,
      settings: fixture.settings,
      series: { id: "series-open", occurrences: null },
      manageUrls: fixture.manageUrls,
      skipped: [],
      reason: "extended"
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(
    fixture.emailLog.map(({ kind, recipient }) => ({ kind, recipient })),
    [{ kind: "teacher_series_extended", recipient: "ines@example.com" }]
  );
});

await test("a single invitation is unchanged by the series refactor", () => {
  const ics = buildCalendarInvite({
    method: "REQUEST",
    uid: calendarUid("solo"),
    sequence: 2,
    summary: "Lesson",
    description: "d",
    location: "Online",
    startsAt: "2026-09-09T16:30:00.000Z",
    endsAt: "2026-09-09T17:30:00.000Z",
    organiserName: "Inês",
    organiserEmail: "bookings@portuguesewithines.com",
    attendees: [{ name: "A", email: "a@example.com" }]
  });
  assert.equal(ics.split("BEGIN:VEVENT").length - 1, 1);
  assert.ok(ics.includes("SEQUENCE:2"));
  assert.ok(ics.includes("BEGIN:VALARM"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
});

// --- Change policy ----------------------------------------------------------
//
// One 14-hour rule: inside the window a saved-card change costs EUR 5 and an
// older paid lesson locks. These pin the matrix down because every branch is
// customer-visible — a wrong `locked` either strands a student or lets a paid
// slot leak, and a wrong `feeApplies` or `refundOnCancel` is money.

await test("a paid lesson inside the 14-hour window is locked, with no refund path", () => {
  const row = { payment_status: "paid", starts_at: "2026-09-09T16:30:00.000Z" };
  const policy = changePolicy(row, new Date("2026-09-09T08:00:00.000Z"));
  assert.equal(policy.locked, true);
  assert.equal(policy.refundOnCancel, false);
});

await test("a paid lesson cancelled 14 hours or more ahead refunds and is not locked", () => {
  const row = { payment_status: "paid", starts_at: "2026-09-09T16:30:00.000Z" };
  // Midday Porto time on the 8th — 29.5 hours ahead.
  const policy = changePolicy(row, new Date("2026-09-08T11:00:00.000Z"));
  assert.equal(policy.locked, false);
  assert.equal(policy.refundOnCancel, true);
});

await test("exactly 14 hours ahead is free; any later is a EUR 5 change", () => {
  const row = { payment_status: "scheduled", starts_at: "2026-09-10T08:00:00.000Z" };
  const boundary = changePolicy(row, new Date("2026-09-09T18:00:00.000Z"));
  assert.equal(boundary.late, false);
  assert.equal(boundary.feeApplies, false);
  const justInside = changePolicy(row, new Date("2026-09-09T18:00:01.000Z"));
  assert.equal(justInside.late, true);
  assert.equal(justInside.feeApplies, true);
  assert.equal(justInside.locked, false);
  // The window follows the live notice setting rather than a second number.
  assert.equal(changePolicy(row, new Date("2026-09-09T08:00:00.000Z"), 24).feeApplies, false);
  assert.equal(changePolicy(row, new Date("2026-09-09T08:00:01.000Z"), 24).feeApplies, true);
});

await test("the evening before is inside the window, whatever the calendar day", () => {
  // 09:00 Porto lesson; 22:00 Porto the night before is 11 hours ahead.
  const row = { payment_status: "scheduled", payment_consent_version: PAYMENT_CONSENT_VERSION, starts_at: "2026-09-10T08:00:00.000Z" };
  assert.equal(changePolicy(row, new Date("2026-09-09T21:00:00.000Z")).feeApplies, true);
  // 22:30 Porto lesson; 08:00 Porto the same day is 14.5 hours ahead.
  const evening = { ...row, starts_at: "2026-09-10T21:30:00.000Z" };
  assert.equal(changePolicy(evening, new Date("2026-09-10T07:00:00.000Z")).feeApplies, false);
});

await test("a booking made under the lesson-day wording is never charged more than it agreed", () => {
  const legacy = { payment_status: "scheduled", payment_consent_version: "2026-09-01-after-lesson-v1", starts_at: "2026-09-10T08:00:00.000Z" };
  // 11 hours ahead but the day before: free under the wording they accepted.
  assert.equal(changePolicy(legacy, new Date("2026-09-09T21:00:00.000Z")).feeApplies, false);
  // On the day and inside 14 hours: both rules charge.
  assert.equal(changePolicy(legacy, new Date("2026-09-10T06:00:00.000Z")).feeApplies, true);
  // On the day but more than 14 hours ahead: the new rule is kinder.
  const evening = { ...legacy, starts_at: "2026-09-10T21:30:00.000Z" };
  assert.equal(changePolicy(evening, new Date("2026-09-10T06:00:00.000Z")).feeApplies, false);
});

await test("an unpaid booking is never locked and never refunded", () => {
  const row = { payment_status: "not_required", starts_at: "2026-09-09T16:30:00.000Z" };
  const sameDay = changePolicy(row, new Date("2026-09-09T08:00:00.000Z"));
  assert.equal(sameDay.locked, false);
  assert.equal(sameDay.refundOnCancel, false);
  const ahead = changePolicy(row, new Date("2026-09-01T08:00:00.000Z"));
  assert.equal(ahead.locked, false);
  assert.equal(ahead.refundOnCancel, false);
});

await test("a pending payment is not treated as paid", () => {
  const row = { payment_status: "pending", starts_at: "2026-09-09T16:30:00.000Z" };
  const policy = changePolicy(row, new Date("2026-09-09T08:00:00.000Z"));
  assert.equal(policy.paid, false);
  assert.equal(policy.locked, false);
});

await test("a scheduled saved-card lesson stays changeable inside the window", () => {
  const row = { payment_status: "scheduled", starts_at: "2026-09-09T16:30:00.000Z" };
  const onDay = changePolicy(row, new Date("2026-09-09T08:00:00.000Z"));
  assert.equal(onDay.locked, false);
  assert.equal(onDay.late, true);
  assert.equal(onDay.feeApplies, true);
  const ahead = changePolicy(row, new Date("2026-09-08T11:00:00.000Z"));
  assert.equal(ahead.locked, false);
  assert.equal(ahead.refundOnCancel, false);
});

await test("a lesson with payment due is not mistaken for an already-paid legacy lesson", () => {
  const row = { payment_status: "payment_due", starts_at: "2026-09-09T16:30:00.000Z" };
  assert.equal(changePolicy(row, new Date("2026-09-09T08:00:00.000Z")).locked, false);
});

await test("a no-show replaces the lesson price with exactly the configured fee", () => {
  const lessonType = { price_cents: 3500 };
  const settings = { sameDayChangeFeeCents: 500 };
  assert.deepEqual(
    lessonChargePlan({ attendance_status: "no_show", amount_cents: 3500 }, lessonType, settings),
    { noShow: true, amountCents: 500, purpose: "no-show" }
  );
  assert.deepEqual(
    lessonChargePlan({ attendance_status: "expected", amount_cents: 3500 }, lessonType, settings),
    { noShow: false, amountCents: 3500, purpose: "lesson" }
  );
});

await test("a no-show can only be changed after the lesson starts and before its charge begins", () => {
  const row = {
    status: "confirmed",
    payment_status: "scheduled",
    starts_at: "2026-09-09T16:00:00.000Z",
    ends_at: "2026-09-09T17:00:00.000Z"
  };
  assert.match(noShowProblem(row, new Date("2026-09-09T15:59:59.000Z")), /starts/i);
  assert.equal(noShowProblem(row, new Date("2026-09-09T16:00:00.000Z")), "");
  assert.equal(noShowProblem(row, new Date("2026-09-09T16:59:59.000Z")), "");
  assert.equal(noShowProblem(row, new Date("2026-09-09T17:00:00.000Z")), "", "the scheduled end is inside the window");
  assert.equal(noShowProblem(row, new Date("2026-09-09T22:59:59.000Z")), "", "which lasts six hours after it");
  assert.match(noShowProblem(row, new Date("2026-09-09T23:00:00.000Z")), /6 hours after the lesson ends/);
  assert.match(noShowProblem({ ...row, payment_status: "processing" }, new Date("2026-09-09T16:30:00.000Z")), /already started/i);
});

await test("bulk sequence cancellation keeps a lesson inside the window and refunds only paid future lessons", () => {
  const today = { id: "today", payment_status: "scheduled", starts_at: "2026-09-09T16:30:00.000Z" };
  const paid = { id: "paid", payment_status: "paid", starts_at: "2026-09-16T16:30:00.000Z" };
  const scheduled = { id: "scheduled", payment_status: "scheduled", starts_at: "2026-09-23T16:30:00.000Z" };
  const plan = planSeriesCancellation([today, paid, scheduled], new Date("2026-09-09T08:00:00.000Z"));

  assert.deepEqual(plan.kept.map((row) => row.id), ["today"]);
  assert.deepEqual(
    plan.cancellable.map(({ row, refund }) => [row.id, refund]),
    [["paid", true], ["scheduled", false]]
  );
});

await test("an unpaid lesson can change between ordinary lesson lengths", () => {
  const row = { payment_status: "not_required", amount_cents: null };
  const single = { id: "single", price_cents: 2500 };
  const long = { id: "long", price_cents: 3500 };
  assert.equal(lessonTypeChangeProblem(row, single, long), "");
  assert.equal(amountAfterLessonTypeChange(row, long), null);
});

await test("a future saved-card lesson changes to the new lesson price", () => {
  const row = { payment_status: "scheduled", amount_cents: 2500 };
  const single = { id: "single", price_cents: 2500 };
  const long = { id: "long", price_cents: 3500 };
  assert.equal(lessonTypeChangeProblem(row, single, long), "");
  assert.equal(amountAfterLessonTypeChange(row, long), 3500);
});

await test("a paid lesson cannot silently change price", () => {
  const row = { payment_status: "paid", amount_cents: 2500 };
  const single = { id: "single", price_cents: 2500 };
  const long = { id: "long", price_cents: 3500 };
  assert.match(lessonTypeChangeProblem(row, single, long), /already paid/i);
  // Moving the same lesson type remains valid.
  assert.equal(lessonTypeChangeProblem(row, single, single), "");
});

await test("a lesson with payment due keeps the length used by its checkout", () => {
  const row = { payment_status: "payment_due", amount_cents: 2500 };
  const single = { id: "single", price_cents: 2500 };
  const long = { id: "long", price_cents: 3500 };
  assert.match(lessonTypeChangeProblem(row, single, long), /payment due/i);
});

await test("a trial cannot be converted into a standard lesson", () => {
  const row = { payment_status: "not_required", amount_cents: null };
  const trial = { id: "trial", price_cents: 2000 };
  const single = { id: "single", price_cents: 2500 };
  assert.match(lessonTypeChangeProblem(row, trial, single), /trial lesson/i);
});

await test("email amounts keep their cents and print whole euros bare, as the site does", () => {
  assert.equal(formatEuros(2500), "€25");
  assert.equal(formatEuros(500), "€5");
  assert.equal(formatEuros(2250), "€22.50");
  assert.equal(formatEuros(1999), "€19.99");
  assert.equal(formatEuros(3505), "€35.05");
});

await test("Meet email links are clickable, present in plain text, and reject other hosts", () => {
  const content = { heading: "Lesson", intro: "Hi", rows: [{ label: "Where", value: "Join Google Meet", url: "https://meet.google.com/abc-defg-hij" }], footer: "See you soon" };
  const valid = renderEmail(content);
  assert.match(valid.html, /href="https:\/\/meet.google.com\/abc-defg-hij"/);
  assert.match(valid.text, /https:\/\/meet.google.com\/abc-defg-hij/);
  const invalid = renderEmail({ ...content, rows: [{ ...content.rows[0], url: "https://meet.google.com.evil.invalid/abc-defg-hij", value: "<script>alert(1)</script>" }] });
  assert.ok(!invalid.html.includes('href="https://meet.google.com.evil'));
  assert.ok(!invalid.html.includes("<script>"));
  assert.ok(!invalid.text.includes("evil.invalid"));
});

// --- Report -----------------------------------------------------------------

if (failures.length) {
  console.error(`\n${failures.length} failing:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`${passed} booking tests passed.`);
