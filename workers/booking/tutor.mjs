/**
 * The tutor this Worker serves, read from the one tutor record in
 * `tutors/<id>/tutor.json` rather than spelled out across the code.
 *
 * Inês is the only tutor for now, so every request gets her record. When the
 * Worker serves several tutors, the request's tutor arrives as `env.TUTOR`
 * (picked from the web address) and everything below already reads it from
 * there, so nothing that names a tutor has to change again.
 *
 * The deploy settings still win where they exist: staging and local runs set
 * SITE_URL, MAIL_FROM and MAIL_SENDER_ADDRESS to their own values.
 */
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

/** What the site calls an in-person lesson's place: "In Porto". */
export function inPersonPlace(tutor) {
  return `In ${tutor.place.city}`;
}
