/**
 * The tutor this Worker serves, read from the one tutor record in
 * `tutors/<id>/tutor.json` rather than spelled out across the code.
 *
 * Inês's requests get her record. Another tutor's request carries theirs as
 * `env.TUTOR` (picked from the web address in directory.mjs), and the whole of
 * that request, or that tutor's sweep, runs inside `asTutor`, so the clock,
 * currency and every helper that defaults to `currentTutor()` are theirs too.
 *
 * The deploy settings still win where they exist: staging and local runs set
 * SITE_URL, MAIL_FROM and MAIL_SENDER_ADDRESS to their own values.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import ines from "../../tutors/ines/tutor.json" with { type: "json" };

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** The record as written, for helpers that run before any request exists. */
export const DEFAULT_TUTOR = deepFreeze(structuredClone(ines));

const fromEnv = new WeakMap();

/** The tutor for this request: env.TUTOR when set, else the default with the deploy's own addresses. */
export function tutorOf(env) {
  if (env?.TUTOR) return env.TUTOR;
  if (!env || typeof env !== "object") return DEFAULT_TUTOR;
  let tutor = fromEnv.get(env);
  if (!tutor) {
    const site = {
      ...DEFAULT_TUTOR.site,
      ...(env.SITE_URL ? { url: String(env.SITE_URL).replace(/\/+$/, "") } : {}),
      ...(env.MAIL_FROM ? { mailFrom: env.MAIL_FROM } : {}),
      ...(env.MAIL_SENDER_ADDRESS ? { mailSender: env.MAIL_SENDER_ADDRESS } : {})
    };
    tutor = deepFreeze({ ...structuredClone(DEFAULT_TUTOR), site });
    fromEnv.set(env, tutor);
  }
  return tutor;
}

const running = new AsyncLocalStorage();

/** Run `work` as `tutor`'s: everything it starts, awaited or not, sees them as the current tutor. */
export function asTutor(tutor, work) {
  return running.run(tutor ?? DEFAULT_TUTOR, work);
}

/** The tutor whose request or sweep is running; the default tutor outside any. */
export function currentTutor() {
  return running.getStore() ?? DEFAULT_TUTOR;
}

/** What the site calls an in-person lesson's place: "In Porto". */
export function inPersonPlace(tutor) {
  return `In ${tutor.place.city}`;
}
