/**
 * Every tutor this Worker serves, and which one a request belongs to.
 *
 * Each tutor has their own D1 database, bound to this Worker under the name in
 * their record's `database`. Inês's is `DB`, as it always was, so for her
 * nothing here changes: her requests get the deploy's `env` untouched.
 *
 * A request belongs to a tutor when its `Origin` is one of that tutor's site
 * origins (every call from a tutor's site carries one), or when it arrives on
 * one of their `api.hosts`. Anything else, including Stripe's webhook and the
 * release probe, is Inês's, exactly as before.
 *
 * Another tutor's request never sees Inês's database, secrets or switches.
 * Their env is built from scratch here: their own database, signing secrets
 * derived for them alone, none of her Stripe, calendar, contact or private
 * codes, and a safe set of switches (email held as a dry run, Google Calendar
 * and homework AI off) that their record turns on one by one. Expressions is
 * Inês's own add-on, not part of the platform (9 November 2026, Dan), so no
 * other tutor can have it.
 *
 * Each request and sweep runs as its tutor (asTutor in tutor.mjs), so times are
 * on that tutor's own clock and prices in their own currency.
 *
 * Adding a tutor: a folder under tutors/ with their tutor.json, one line in
 * TUTORS below, a D1 database made from schema.sql and then
 * `node workers/booking/tutor-seed.mjs <id>` (never seed.sql, which is Inês's),
 * and its binding in wrangler.jsonc under the record's `database`.
 */
import ines from "../../tutors/ines/tutor.json" with { type: "json" };
import { DEFAULT_TUTOR } from "./tutor.mjs";

export const TUTORS = [ines];

/** Deploy settings another tutor may switch on in their record's `switches`. */
const SWITCHES = {
  EMAIL_DRY_RUN: "1",
  TEACHER_NOTIFICATIONS_ENABLED: "1",
  GOOGLE_CALENDAR_ENABLED: "0",
  HOMEWORK_AI_ENABLED: "0"
};

/** Shared by every tutor: the app's identity with Google, the mail service, the marker, and the Worker's own limits. */
const SHARED = [
  "RESEND_API_KEY", "ANTHROPIC_API_KEY", "HOMEWORK_AI_MODEL", "HOMEWORK_AI_MONTHLY_LIMIT", "GOOGLE_CLIENT_ID",
  "STRIPE_UI_MODE", "STRIPE_EXPECTED_MODE"
];

/** Signing secrets: each tutor gets their own, derived from the deploy's, so a link or session from one never opens another. */
const DERIVED = ["BOOKING_TOKEN_SECRET", "ADMIN_TOKEN"];

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function realTimeZone(zone) {
  if (typeof zone !== "string" || !zone) return false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: zone }); return true; } catch { return false; }
}

function realCurrency(code) {
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) return false;
  try { new Intl.NumberFormat("en-GB", { style: "currency", currency: code }); return true; } catch { return false; }
}

/** Check the directory once: unique ids, databases, origins and hosts, a real clock and currency, and only switches a tutor may set. */
export function loadDirectory(records) {
  const tutors = records.map((record) => deepFreeze(structuredClone(record)));
  const seen = { id: new Set(), database: new Set(), origin: new Set(), host: new Set() };
  const claim = (kind, value, id) => {
    if (seen[kind].has(value)) throw new Error(`Tutor ${id}: ${kind} ${value} is already another tutor's.`);
    seen[kind].add(value);
  };
  for (const tutor of tutors) {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(tutor.id ?? "")) throw new Error(`Tutor id ${tutor.id} must be lower-case letters, digits and dashes.`);
    claim("id", tutor.id, tutor.id);
    if (!/^[A-Z][A-Z0-9_]*$/.test(tutor.database ?? "")) throw new Error(`Tutor ${tutor.id} needs a database binding name.`);
    claim("database", tutor.database, tutor.id);
    if (tutor.id !== DEFAULT_TUTOR.id) {
      if (!realTimeZone(tutor.place?.timeZone)) throw new Error(`Tutor ${tutor.id}: ${tutor.place?.timeZone} is not a time zone.`);
      if (!realCurrency(tutor.place?.currency)) throw new Error(`Tutor ${tutor.id}: ${tutor.place?.currency} is not a currency code.`);
      for (const origin of tutor.site?.origins ?? []) {
        if (new URL(origin).origin !== origin) throw new Error(`Tutor ${tutor.id}: ${origin} is not a bare origin.`);
        claim("origin", origin, tutor.id);
      }
      for (const host of tutor.api?.hosts ?? []) claim("host", host.toLowerCase(), tutor.id);
      if (tutor.features?.expressions) throw new Error(`Tutor ${tutor.id}: Expressions is Inês's add-on, not part of the platform.`);
      for (const key of Object.keys(tutor.switches ?? {})) {
        if (!(key in SWITCHES)) throw new Error(`Tutor ${tutor.id}: ${key} is not a switch a tutor can set.`);
      }
    }
  }
  if (!tutors.some((tutor) => tutor.id === DEFAULT_TUTOR.id)) throw new Error("The directory must include the default tutor.");
  return tutors;
}

const DIRECTORY = loadDirectory(TUTORS);

/** The tutor a request belongs to: by its Origin, then by its host, else the default tutor. */
export function tutorForRequest(request, directory = DIRECTORY) {
  const origin = request.headers.get("Origin");
  const host = new URL(request.url).host.toLowerCase();
  const others = directory.filter((tutor) => tutor.id !== DEFAULT_TUTOR.id);
  return (origin && others.find((tutor) => tutor.site?.origins?.includes(origin)))
    || others.find((tutor) => tutor.api?.hosts?.some((value) => value.toLowerCase() === host))
    || directory.find((tutor) => tutor.id === DEFAULT_TUTOR.id);
}

async function derive(secret, tutorId, purpose) {
  if (!secret) return secret;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`tutor:${tutorId}:${purpose}`));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const scoped = new WeakMap();

/**
 * The env a tutor's request runs with. The default tutor's is the deploy's own
 * object, unchanged. Another tutor's is built once per Worker instance; a
 * missing database binding leaves DB unset, which every entry point refuses,
 * so it can never fall through to someone else's.
 */
export async function envForTutor(env, tutor) {
  if (!tutor || tutor.id === DEFAULT_TUTOR.id) return env;
  let byTutor = scoped.get(env);
  if (!byTutor) scoped.set(env, byTutor = new Map());
  let built = byTutor.get(tutor.id);
  if (!built) {
    built = (async () => {
      const own = { TUTOR: tutor, DB: env[tutor.database] };
      for (const name of SHARED) if (env[name] !== undefined) own[name] = env[name];
      for (const name of DERIVED) own[name] = await derive(env[name], tutor.id, name);
      Object.assign(own, SWITCHES, tutor.switches ?? {});
      own.ALLOWED_ORIGIN = (tutor.site?.origins ?? []).join(",");
      return Object.freeze(own);
    })();
    byTutor.set(tutor.id, built);
  }
  return built;
}

/** Every tutor with their env, for the scheduled sweeps. A tutor whose database is not bound is skipped and logged. */
export async function everyTutor(env, directory = DIRECTORY) {
  const out = [];
  for (const tutor of directory) {
    const own = await envForTutor(env, tutor);
    if (!own.DB) { console.error("tutor-database-missing", tutor.id, tutor.database); continue; }
    out.push(own);
  }
  return out;
}
