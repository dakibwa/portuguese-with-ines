import { BOOT } from "./runtime";
import type { Tutor } from "./types";
if (!BOOT.tutor) throw new Error("The teaching site record is missing.");
export const TUTOR: Tutor = BOOT.tutor;
export const IS_PLATFORM_TUTOR = true;
export const TUTOR_HAS_EXPRESSIONS = false;
export const TUTOR_NAME = TUTOR.shortName;
export const BRAND = TUTOR.brand;
export const TUTOR_CITY = TUTOR.place.city;
export const IN_PERSON = `In ${TUTOR_CITY}`;
export const HOME_CLOCK = `${TUTOR_CITY || TUTOR.place.timeZone} time`;
export const TUTOR_TIME_ZONE = TUTOR.place.timeZone;
export const LANGUAGE = TUTOR.language.name;
export const LANGUAGE_VARIETY = TUTOR.language.variety;
export const LANGUAGE_CODE = TUTOR.language.code;
export const TUTOR_SUBJECT = TUTOR.pronouns.subject;
export const TUTOR_OBJECT = TUTOR.pronouns.object;
export const TUTOR_POSSESSIVE = TUTOR.pronouns.possessive;

export const TUTOR_LOCATION_OPTIONS: ("online" | "porto")[] = [
  ...(BOOT.site?.rules.online ? ["online" as const] : []),
  ...(BOOT.site?.rules.inPerson ? ["porto" as const] : []),
];

export const PLATFORM_DASHBOARD_URL = `${BOOT.platformOrigin || ""}/dashboard/`;
