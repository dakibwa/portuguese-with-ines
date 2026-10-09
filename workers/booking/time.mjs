/**
 * Timezone helpers built on Intl, because Workers ship no tz database of their
 * own and a booking system that is an hour out twice a year is worse than none.
 *
 * The rule throughout: instants are UTC Date objects, wall-clock availability is
 * minutes-from-midnight in `zone`. Nothing stores a fixed offset.
 */

export const PORTO = "Europe/Lisbon";

const partsCache = new Map();

function formatterFor(zone) {
  let formatter = partsCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    partsCache.set(zone, formatter);
  }
  return formatter;
}

/** Wall-clock fields for `date` as seen in `zone`. */
export function zonedParts(date, zone = PORTO) {
  const parts = {};
  for (const part of formatterFor(zone).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // hour12:false renders midnight as "24" in some ICU builds; normalise it.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

/** Offset of `zone` from UTC, in minutes, at the instant `date`. */
export function offsetMinutes(date, zone = PORTO) {
  const { year, month, day, hour, minute, second } = zonedParts(date, zone);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asIfUtc - date.getTime()) / 60000;
}

/**
 * Wall-clock time in `zone` to the UTC instant it names.
 *
 * Two passes: the first guesses using the offset at the naive timestamp, the
 * second corrects it using the offset actually in force at that guess. One
 * correction is enough for every real transition, since offsets move by at most
 * an hour and the guess is never more than an hour out.
 */
export function zonedToUtc(year, month, day, minutesFromMidnight, zone = PORTO) {
  const naive = Date.UTC(year, month - 1, day, 0, minutesFromMidnight);
  const firstPass = naive - offsetMinutes(new Date(naive), zone) * 60000;
  const corrected = naive - offsetMinutes(new Date(firstPass), zone) * 60000;
  return new Date(corrected);
}

/** "2026-09-03" as seen in `zone`. */
export function dateKey(date, zone = PORTO) {
  const { year, month, day } = zonedParts(date, zone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? "").trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = { year: Number(year), month: Number(month), day: Number(day) };
  // Reject 2026-02-31 and friends rather than letting Date roll them forward.
  const roundTrip = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  if (roundTrip.getUTCMonth() + 1 !== parsed.month || roundTrip.getUTCDate() !== parsed.day) return null;

  return parsed;
}

/** Midnight-to-midnight in `zone` for the Porto date `key`, as UTC instants. */
export function dayBounds(key, zone = PORTO) {
  const parsed = parseDateKey(key);
  if (!parsed) return null;

  const { year, month, day } = parsed;
  return {
    start: zonedToUtc(year, month, day, 0, zone),
    // Expressed as minute 1440 of the same day rather than midnight of the
    // next: on a DST day the two differ, and this is the one that is right.
    end: zonedToUtc(year, month, day, 1440, zone)
  };
}

/** Weekday of the Porto date `key`: 0=Sunday .. 6=Saturday. */
export function weekdayOf(key) {
  const parsed = parseDateKey(key);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

export function addDaysToKey(key, days) {
  const parsed = parseDateKey(key);
  if (!parsed) return null;

  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate()
  ).padStart(2, "0")}`;
}

export function eachDateKey(fromKey, toKey) {
  const keys = [];
  let cursor = fromKey;
  // Guard rather than trust: an inverted or malformed range must not spin.
  for (let index = 0; cursor && cursor <= toKey && index < 400; index += 1) {
    keys.push(cursor);
    cursor = addDaysToKey(cursor, 1);
  }
  return keys;
}

export function isValidTimeZone(zone) {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Human date and time in a given zone, for emails and confirmations. */
export function formatInZone(date, zone = PORTO, locale = "en-GB") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

/**
 * The same instant in another zone, or null when it reads identically to Porto.
 *
 * Compared per instant rather than per zone name: Lisbon and London share an
 * offset for most of the year, so a "zones differ" check prints
 * "19:00 (WEST) / 19:00 (BST)" to every UK student, which is just noise.
 */
export function differingZonedTime(date, zone, locale = "en-GB") {
  if (!zone || zone === PORTO) return null;

  const here = formatInZone(date, PORTO, locale);
  const there = formatInZone(date, zone, locale);
  return here === there ? null : `${there} (${timeZoneAbbreviation(date, zone, locale)})`;
}

const RENAMED_PLACES = {
  Calcutta: "Kolkata",
  Katmandu: "Kathmandu",
  Kiev: "Kyiv",
  Rangoon: "Yangon",
  Saigon: "Ho Chi Minh City"
};

/**
 * A clock named the way the site names it: by its place ("Porto time",
 * "Los Angeles time"), taken from the zone's own name. A zone without a
 * place, such as UTC, is named by its offset at that moment instead.
 */
export function zoneName(zone, date = new Date()) {
  if (!zone || zone === PORTO) return "Porto time";
  const place = zone.includes("/") && !zone.startsWith("Etc/") ? zone.slice(zone.lastIndexOf("/") + 1).replace(/_/g, " ") : "";
  if (place) return `${RENAMED_PLACES[place] ?? place} time`;
  try {
    const offset = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
    if (offset) return offset === "GMT" ? "UTC" : offset;
  } catch {
    // An unknown zone keeps its name.
  }
  return zone;
}

/**
 * "Fri 25 Sep, 19:00" — for subject lines, where a full date runs past what an
 * inbox shows and a reference code says nothing to the person reading it.
 */
export function formatShort(date, zone = PORTO, locale = "en-GB") {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")}`;
}

export function timeZoneAbbreviation(date, zone = PORTO, locale = "en-GB") {
  const parts = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? zone;
}
