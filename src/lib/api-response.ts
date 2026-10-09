export const BOOKING_REPLY_ERROR = "We couldn’t read the booking system’s reply. Please try again.";

export function isApiRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isApiInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isApiAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** The lesson fields that booking and account views render directly. */
export function isApiLesson(value: unknown): boolean {
  if (!isApiRecord(value) || !isApiRecord(value.lessonType)) return false;
  const type = value.lessonType;
  return typeof value.reference === "string" && Boolean(value.reference) &&
    ["confirmed", "cancelled", "pending_payment"].includes(value.status as string) &&
    ["online", "porto"].includes(value.location as string) &&
    isApiInstant(value.startAt) && isApiInstant(value.endAt) && Date.parse(value.endAt) > Date.parse(value.startAt) &&
    typeof type.id === "string" && typeof type.name === "string" &&
    typeof type.durationMinutes === "number" && Number.isFinite(type.durationMinutes) && type.durationMinutes > 0 &&
    typeof type.priceCents === "number" && Number.isFinite(type.priceCents) && type.priceCents >= 0 &&
    ["studentName", "studentEmail", "studentTimezone", "notes", "meetingUrl"].every((field) =>
      value[field] == null || typeof value[field] === "string"
    ) &&
    ["sameDayFeeCents", "amountCents"].every((field) => value[field] == null || isApiAmount(value[field])) &&
    (value.sameDayFeeAutomatic === undefined || typeof value.sameDayFeeAutomatic === "boolean");
}
