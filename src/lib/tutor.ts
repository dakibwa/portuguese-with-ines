/**
 * The tutor this site belongs to, from the one tutor record in
 * `tutors/<id>/tutor.json` that the booking Worker reads too. Shared pages and
 * tools name the tutor, their city, clock and language from here, never by
 * spelling them out. Inês is the only tutor for now.
 */
import record from "../../tutors/ines/tutor.json";

export const TUTOR = record;
export const IS_PLATFORM_TUTOR = false;
export const TUTOR_HAS_EXPRESSIONS = record.features.expressions;

/** "Inês": how the site and its tools name the tutor. */
export const TUTOR_NAME = record.shortName;
/** "Português com a Inês". */
export const BRAND = record.brand;
/** "Porto": where in-person lessons happen. */
export const TUTOR_CITY = record.place.city;
/** "In Porto": an in-person lesson's place, as the site writes it. */
export const IN_PERSON = `In ${record.place.city}`;
/** "Porto time": the tutor's own clock, named by its place. */
export const HOME_CLOCK = `${record.place.city} time`;
/** "Europe/Lisbon". */
export const TUTOR_TIME_ZONE = record.place.timeZone;
/** "Portuguese", "European Portuguese", "pt-PT". */
export const LANGUAGE = record.language.name;
export const LANGUAGE_VARIETY = record.language.variety;
export const LANGUAGE_CODE = record.language.code;
/** "she", "her", "her": the tutor's pronouns, as the tutor gives them. */
export const TUTOR_SUBJECT = record.pronouns.subject;
export const TUTOR_OBJECT = record.pronouns.object;
export const TUTOR_POSSESSIVE = record.pronouns.possessive;

export const TUTOR_LOCATION_OPTIONS: ("online" | "porto")[] = ["online", "porto"];

export const PLATFORM_DASHBOARD_URL = "/dashboard/";
