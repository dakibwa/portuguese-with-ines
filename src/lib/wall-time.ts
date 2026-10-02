/** Convert a real wall-clock minute to UTC, rejecting dates/times it cannot name. */
export function wallTimeToUtc(dateKey: string, time: string, timeZone: string, originalInstant?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Choose a valid date and time.");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(naive);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error("Choose a valid date and time.");
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const wallAt = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  };
  const offsetAt = (instant: number) => wallAt(instant) - instant;
  const original = Date.parse(originalInstant ?? "");
  if (Number.isFinite(original)) {
    // Keep the existing occurrence of autumn's repeated hour. An unchanged
    // minute also preserves any seconds present on the original appointment.
    if (wallAt(Math.floor(original / 60000) * 60000) === naive) {
      return new Date(original).toISOString();
    }
    const sameOffset = naive - offsetAt(original);
    if (wallAt(sameOffset) === naive) return new Date(sameOffset).toISOString();
  }
  const firstPass = naive - offsetAt(naive);
  const instant = naive - offsetAt(firstPass);
  // Spring's missing hour is not a different appointment to silently book.
  if (wallAt(instant) !== naive) {
    throw new Error("That time does not exist in Porto because the clocks change. Choose another time.");
  }
  return new Date(instant).toISOString();
}
