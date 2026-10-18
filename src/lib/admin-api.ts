import { BOOKING_API_BASE_URL } from "@/lib/config";
import { forgetSession } from "@/lib/auth-api";
import { BOOKING_REPLY_ERROR, isApiInstant, isApiRecord } from "@/lib/api-response";
import { isExpression, type Expression, type ExpressionInput } from "@/lib/expressions";

export type AdminStudent = {
  id: string;
  name: string;
  /** Empty when she set them up from a name alone and has not given one yet; the Worker never sends its stand-in. */
  email: string;
  phone: string;
  /** Nine digits for their receipts; empty for consumidor final. */
  nif?: string;
  /** The splat they chose for their account; empty for their initial. */
  mark?: string;
  /** Has ever signed in, or set a password or Google sign-in. */
  signedIn?: boolean;
  /** Set up by her and not emailed yet: the site sends them nothing until she sends their welcome. */
  awaitingWelcome?: boolean;
  hasCard?: boolean;
  /** Has at least one confirmed lesson, including lessons already had. */
  hasLessons?: boolean;
  /** A card saved from their account, which pays for the lessons she adds. */
  cardForAllLessons?: boolean;
  nextLessonAt?: string | null;
  upcoming?: number;
  /** Lessons to come that are still paid to her by hand. */
  unpaidUpcoming?: number;
  /** Active weekly slots. */
  weekly?: number;
  /** What they pay per lesson length, in cents, a 90-minute price derived from their 60 included; a missing length is the standard price. */
  prices?: Partial<Record<60 | 90, number>>;
  /** The prices set for them (by her or a code), which is what she edits. */
  ownPrices?: Partial<Record<60 | 90, number>>;
  homeworkToReview?: { bookingId: string; submittedAt: string }[];
  /** Saved-card charges that were declined and are still to pay; the student has a secure payment link. */
  cardDeclined?: { bookingId: string; reference: string; startsAt: string; amountCents: number | null; part: "lesson" | "no-show" | "fee" }[];
  /** A card added in the last week, and the lessons she added that it now pays for. */
  cardAdded?: { at: string; lessons: { bookingId: string; startsAt: string }[] } | null;
};

/** A length mapped to cents, or to null for the standard price again. */
export type StudentPrices = Partial<Record<60 | 90, number | null>>;

export type AvailabilityRule = {
  id: number;
  weekday: number;
  start_minute: number;
  last_start_minute: number;
  active?: number;
};
export type AvailabilityException = {
  id: number;
  /** Null for a block that repeats every week on `weekday`, such as lunch. */
  date: string | null;
  kind: "blocked" | "extra";
  note: string;
  start_minute?: number | null;
  end_minute?: number | null;
  weekday?: number | null;
};
export type AdminBooking = {
  id: string;
  student_id?: string | null;
  reference: string;
  /** The lesson type, so a trial can keep its name where others show their length. */
  lesson_type_id?: string;
  lesson_name: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  /** The student's NIF for their receipt; empty when none was given. */
  student_nif?: string;
  /** The splat the student chose to wear beside their name; empty for none. */
  student_mark?: string;
  /** Their student is set up but not welcomed yet, so no email reaches them. */
  student_awaiting_welcome?: number;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled";
  location: "online" | "porto";
  meeting_url?: string | null;
  notes: string;
  cancelled_by?: string | null;
  cancellation_message?: string | null;
  same_day_change: number;
  same_day_fee_status:
    | "not_required"
    | "scheduled"
    | "processing"
    | "paid"
    | "payment_due";
  reschedule_count: number;
  payment_status:
    | "not_required"
    | "pending"
    | "scheduled"
    | "processing"
    | "paid"
    | "payment_due"
    | "refunded"
    /** A lesson she recorded after it happened: for the record only. */
    | "recorded"
    /** A lesson at a price she set to €0: never charged, chased or receipted. */
    | "free";
  attendance_status: "expected" | "no_show";
  /** 1 when Inês added it herself (migration 0023). */
  added_by_teacher?: number;
  /** The lesson's own price, as booked. */
  amount_cents?: number | null;
  /** "paid-by-hand" once she has ticked it Already paid; otherwise the payment agreement it carries. */
  payment_consent_version?: string | null;
  /** Set once its card charge has begun; it can no longer be ticked paid. */
  charge_started_at?: string | null;
  /** 1 when no confirmed lesson of the student's comes before this one. */
  first_lesson?: number;
  /** When the student last changed the lesson themselves; empty after she moves it (migration 0028). */
  student_changed_at?: string | null;
  /** Where the lesson was before its last move. */
  previous_starts_at?: string | null;
  cancelled_at?: string | null;
  /** The weekly run this lesson belongs to. */
  series_id?: string | null;
};

/**
 * A payment or refund Stripe never confirmed, for Inês to check in Stripe.
 * Only the id and reference are required; an older Worker sends nothing else.
 */
export type PaymentReview = {
  id: string;
  reference: string;
  student_name?: string;
  starts_at?: string;
  payment_status?: string;
  same_day_fee_status?: string;
  stripe_payment_intent?: string | null;
  same_day_fee_payment_intent?: string | null;
};

/**
 * A lesson Inês added herself, for a booking arranged elsewhere, rather than
 * one a student booked on the site. The booking system records it outright
 * (migration 0023), so it stays hers once the student's card pays for it.
 */
export function addedByTeacher(booking: Pick<AdminBooking, "added_by_teacher">) {
  return Boolean(booking.added_by_teacher);
}

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function adminRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    // The browser's own "Failed to fetch" says nothing useful to Inês.
    throw new Error("We couldn’t reach the booking system. Please check your connection and try again.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (response.status === 401) forgetSession(token);
  if (!response.ok) {
    const error = isApiRecord(data) && typeof data.error === "string" ? data.error : "";
    throw new AdminApiError(error || `Request failed (${response.status})`, response.status);
  }
  if (!isApiRecord(data)) throw new Error(BOOKING_REPLY_ERROR);
  return data as T;
}

export function fetchSchedule(token: string) {
  return adminRequest<{
    rules: AvailabilityRule[];
    exceptions: AvailabilityException[];
    settings?: { slotIntervalMinutes: number };
  }>(token, "/admin/availability").then((data) => {
    if (!Array.isArray(data.rules) || !data.rules.every((row) =>
      isApiRecord(row) && Number.isInteger(row.weekday) && Number(row.weekday) >= 0 && Number(row.weekday) <= 6 &&
      Number.isInteger(row.start_minute) && Number.isInteger(row.last_start_minute) &&
      Number(row.start_minute) >= 0 && Number(row.last_start_minute) <= 1440 && Number(row.start_minute) <= Number(row.last_start_minute)
    ) || !Array.isArray(data.exceptions) || !data.exceptions.every(validException)) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

export function fetchBookings(token: string, from?: string) {
  return adminRequest<{
    bookings: AdminBooking[];
    manualPaymentReconciliation?: PaymentReview[];
  }>(
    token,
    `/admin/bookings${from ? `?from=${encodeURIComponent(from)}` : ""}`,
  ).then((data) => {
    if (!Array.isArray(data.bookings) || !data.bookings.every((row) =>
      isApiRecord(row) && typeof row.id === "string" && typeof row.reference === "string" &&
      typeof row.student_name === "string" && typeof row.student_email === "string" && typeof row.lesson_name === "string" &&
      ["confirmed", "cancelled", "pending_payment"].includes(row.status as string) && ["online", "porto"].includes(row.location as string) &&
      ["not_required", "pending", "scheduled", "processing", "paid", "payment_due", "refunded", "recorded", "free"].includes(row.payment_status as string) &&
      (row.notes === undefined || typeof row.notes === "string") &&
      isApiInstant(row.starts_at) && isApiInstant(row.ends_at) && Date.parse(row.ends_at) > Date.parse(row.starts_at)
    ) || (data.manualPaymentReconciliation !== undefined && (!Array.isArray(data.manualPaymentReconciliation) || !data.manualPaymentReconciliation.every((row) =>
      isApiRecord(row) && typeof row.id === "string" && typeof row.reference === "string"
    )))) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

export function saveRules(
  token: string,
  rules: { weekday: number; startMinute: number; lastStartMinute: number }[],
) {
  return adminRequest<{ ok: true; count: number }>(
    token,
    "/admin/availability",
    {
      method: "POST",
      body: JSON.stringify({ rules }),
    },
  ).then((data) => {
    if (data.ok !== true || !Number.isInteger(data.count) || data.count < 0) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

/**
 * Replaces one date's time off. `dayOff` and `blocks` are independent: each
 * replaces only its own rows, and weekly blocks are never touched.
 */
export function saveDayOff(
  token: string,
  date: string,
  change: { dayOff?: boolean; blocks?: { start: number; end: number }[] },
) {
  return adminRequest<{ ok: true; exceptions: AvailabilityException[] }>(
    token,
    "/admin/exceptions/day",
    {
      method: "POST",
      body: JSON.stringify({
        date,
        dayOff: change.dayOff,
        blocks: change.blocks?.map((block) => ({
          startMinute: block.start,
          endMinute: block.end,
        })),
      }),
    },
  ).then((data) => {
    if (data.ok !== true || !Array.isArray(data.exceptions) || !data.exceptions.every((row) => validException(row) && row.date === date)) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

function validException(value: unknown): value is AvailabilityException {
  return isApiRecord(value) && (value.date === null || (typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date))) &&
    (value.note == null || typeof value.note === "string") &&
    (value.kind === "blocked" || value.kind === "extra");
}

function validateBookingAcknowledgment<T extends { booking: { reference: string } }>(data: T) {
  if (!isApiRecord(data.booking) || typeof data.booking.reference !== "string" || !data.booking.reference) throw new Error(BOOKING_REPLY_ERROR);
  return data;
}

function validStudent(value: unknown): value is AdminStudent {
  if (!isApiRecord(value) || !["id", "name", "email", "phone"].every(key => typeof value[key] === "string") || !value.id) return false;
  if (!["nif", "mark"].every(key => value[key] === undefined || typeof value[key] === "string") ||
    !["signedIn", "awaitingWelcome", "hasCard", "hasLessons", "cardForAllLessons"].every(key => value[key] === undefined || typeof value[key] === "boolean") ||
    !["upcoming", "unpaidUpcoming", "weekly"].every(key => value[key] === undefined || (Number.isInteger(value[key]) && Number(value[key]) >= 0)) ||
    !(value.nextLessonAt == null || isApiInstant(value.nextLessonAt))) return false;
  for (const key of ["prices", "ownPrices"]) {
    const prices = value[key];
    if (prices !== undefined && (!isApiRecord(prices) || !Object.values(prices).every(amount => Number.isInteger(amount) && Number(amount) >= 0))) return false;
  }
  const lesson = (row: unknown) => isApiRecord(row) && typeof row.bookingId === "string" && isApiInstant(row.startsAt);
  return (value.homeworkToReview === undefined || (Array.isArray(value.homeworkToReview) && value.homeworkToReview.every(row =>
    isApiRecord(row) && typeof row.bookingId === "string" && isApiInstant(row.submittedAt)))) &&
    (value.cardDeclined === undefined || (Array.isArray(value.cardDeclined) && value.cardDeclined.every(row =>
      lesson(row) && isApiRecord(row) && typeof row.reference === "string" && ["lesson", "no-show", "fee"].includes(row.part as string) &&
      (row.amountCents === null || (Number.isInteger(row.amountCents) && Number(row.amountCents) >= 0))))) &&
    (value.cardAdded == null || (isApiRecord(value.cardAdded) && isApiInstant(value.cardAdded.at) &&
      Array.isArray(value.cardAdded.lessons) && value.cardAdded.lessons.every(lesson)));
}

function studentReply<T extends { student: AdminStudent }>(data: T, studentId?: string) {
  if (!validStudent(data.student) || (studentId !== undefined && data.student.id !== studentId)) throw new Error(BOOKING_REPLY_ERROR);
  return data;
}

export function fetchStudents(token: string) {
  return adminRequest<{ students: AdminStudent[]; cardsAccepted?: boolean }>(token, "/admin/students").then(data => {
    if (!Array.isArray(data.students) || !data.students.every(validStudent) ||
      new Set(data.students.map(student => student.id)).size !== data.students.length ||
      (data.cardsAccepted !== undefined && typeof data.cardsAccepted !== "boolean")) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

/**
 * One amount Inês owes a fatura-recibo for: a lesson's price (or the no-show
 * amount) or a late change fee. `id` is stable, so her automation can remember
 * what it has issued; `ready` is true once the money is in.
 */
export type ReceiptLine = {
  id: string;
  bookingId: string;
  reference: string;
  kind: "lesson" | "no-show" | "late-change-fee";
  label: string;
  lessonStartsAt: string;
  studentName: string;
  studentEmail: string;
  /** Nine digits, or empty for consumidor final. */
  nif: string;
  amountCents: number | null;
  method: "card" | "by hand";
  state: "paid" | "refunded" | "due" | "charging";
  ready: boolean;
  stripePaymentIntent: string;
};

/** A Porto month's receipts ("2026-10"), as her automation reads them too. */
export function fetchReceipts(token: string, month: string) {
  return adminRequest<{ month: string; receipts: ReceiptLine[]; totals: { ready: number; readyCents: number } }>(
    token,
    `/admin/receipts?month=${encodeURIComponent(month)}`,
  ).then(data => {
    if (data.month !== month || !Array.isArray(data.receipts) || !data.receipts.every(line =>
      isApiRecord(line) && (["id", "bookingId", "reference", "studentName", "studentEmail", "nif", "label", "stripePaymentIntent"] as const).every(key => typeof line[key] === "string") &&
      isApiInstant(line.lessonStartsAt) && ["lesson", "no-show", "late-change-fee"].includes(line.kind as string) &&
      ["card", "by hand"].includes(line.method as string) && ["paid", "refunded", "due", "charging"].includes(line.state as string) &&
      typeof line.ready === "boolean" && (line.amountCents === null || (Number.isInteger(line.amountCents) && Number(line.amountCents) >= 0))
    )) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

function expressionReply(data: { expression: Expression }) {
  if (!isExpression(data.expression)) throw new Error(BOOKING_REPLY_ERROR);
  return data.expression;
}
function expressionListReply(data: { expressions: Expression[] }) {
  if (!Array.isArray(data.expressions) || !data.expressions.every(isExpression) ||
      new Set(data.expressions.map((row) => row.id)).size !== data.expressions.length) throw new Error(BOOKING_REPLY_ERROR);
  return data.expressions;
}
/**
 * Her collection, and whether students can see it yet (the Worker's
 * EXPRESSIONS_FOR_STUDENTS switch), so her copy never promises what they see.
 */
export async function fetchExpressions(token: string): Promise<{ expressions: Expression[]; openToStudents: boolean }> {
  const data = await adminRequest<{ expressions: Expression[]; openToStudents?: unknown }>(token, "/admin/expressions");
  // A Worker from before the switch has no field: it let students pick, so the copy says they can.
  return { expressions: expressionListReply(data), openToStudents: typeof data.openToStudents === "boolean" ? data.openToStudents : true };
}
export function saveExpression(token: string, input: ExpressionInput, previous?: Expression) {
  return adminRequest<{ expression: Expression }>(token, `/admin/expressions${previous ? `/${encodeURIComponent(previous.id)}` : ""}`, {
    method: "POST", body: JSON.stringify({ ...input, ...(previous ? { updatedAt: previous.updatedAt } : {}) }),
  }).then(expressionReply);
}
export function publishExpression(token: string, expression: Expression, published: 0 | 1) {
  return adminRequest<{ expression: Expression }>(token, `/admin/expressions/${encodeURIComponent(expression.id)}/publish`, {
    method: "POST", body: JSON.stringify({ published, updatedAt: expression.updatedAt }),
  }).then(expressionReply);
}
export async function deleteExpression(token: string, expression: Expression) {
  const reply = await adminRequest<{ ok: boolean }>(token, `/admin/expressions/${encodeURIComponent(expression.id)}/delete`, {
    method: "POST", body: JSON.stringify({ updatedAt: expression.updatedAt }),
  });
  if (reply.ok !== true) throw new Error(BOOKING_REPLY_ERROR);
}
export function reorderExpressions(token: string, ids: string[], expectedOrder: string[]) {
  return adminRequest<{ expressions: Expression[] }>(token, "/admin/expressions/reorder", {
    method: "POST", body: JSON.stringify({ ids, expectedOrder }),
  }).then(expressionListReply);
}

export type StudentDetailsInput = { email: string; name: string; phone: string; nif: string; mark: string };

/**
 * Sets a student up with their details; nothing is emailed (13 October 2026,
 * Dan). Only the name is needed: an empty email shows as "" until she gives one.
 */
export function addStudent(token: string, input: StudentDetailsInput & { prices?: StudentPrices }) {
  return adminRequest<{ student: AdminStudent }>(token, "/admin/students", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(data => studentReply(data));
}

/** Their details, all at once. Their email can change only until they first sign in. */
export function updateStudentDetails(token: string, studentId: string, input: StudentDetailsInput) {
  return adminRequest<{ student: AdminStudent }>(token, `/admin/students/${encodeURIComponent(studentId)}/details`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then(data => studentReply(data, studentId));
}

/**
 * Her price for a student. It prices every lesson of theirs at that length, and
 * their lessons to come that nothing is settled on follow it; `updated` counts them.
 * `stayFree` counts lessons to come booked free at a length that no longer is.
 */
export function setStudentPrices(token: string, studentId: string, prices: StudentPrices) {
  return adminRequest<{ student: AdminStudent; updated: number; stayFree?: number }>(token, `/admin/students/${encodeURIComponent(studentId)}/prices`, {
    method: "POST",
    body: JSON.stringify({ prices }),
  }).then(data => studentReply(data, studentId));
}

/**
 * Emails a student their lessons so far and a one-click way into their account.
 * `onlyIfWaiting` sends it only while the welcome is still owed, so a second
 * device pressing later is told it has gone rather than sending another.
 */
export function sendStudentWelcome(token: string, studentId: string, options?: { onlyIfWaiting?: boolean }) {
  return adminRequest<{ ok: true; card?: boolean }>(token, `/admin/students/${encodeURIComponent(studentId)}/welcome`, {
    method: "POST",
    body: JSON.stringify(options?.onlyIfWaiting ? { onlyIfWaiting: true } : {}),
  }).then(data => {
    if (data.ok !== true) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

/**
 * A lesson for one of her students, named by their account so one with no
 * email yet has lessons too (14 October 2026, Dan).
 */
export function createBookingFor(
  token: string,
  input: {
    studentId: string;
    lessonType: string;
    startAt: string;
    location: "online" | "porto";
    notes: string;
    /** Weekly: 4, 6 or 8 weeks, or "open" until stopped. Left out, one lesson. */
    repeat?: 4 | 6 | 8 | "open";
    /** Ticked "Already paid": never billed, in Receipts as paid by hand. One lesson only. */
    paid?: boolean;
  },
) {
  return adminRequest<{
    booking: { reference: string };
    /** False while the student awaits their welcome: nothing was sent to them. */
    emailed?: boolean;
    series?: { booked: number; skipped: { key: string; startAt: string; reason: string }[] };
  }>(
    token,
    "/admin/bookings",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ).then(validateBookingAcknowledgment);
}

export function rescheduleBookingAs(
  token: string,
  bookingId: string,
  startAt: string,
) {
  return adminRequest<{ booking: { reference: string }; emailed?: boolean }>(
    token,
    `/admin/bookings/${bookingId}/reschedule`,
    {
      method: "POST",
      body: JSON.stringify({ startAt }),
    },
  ).then(validateBookingAcknowledgment);
}

export function cancelBookingAs(token: string, bookingId: string, message?: string) {
  return adminRequest<{ booking: { reference: string }; emailed?: boolean }>(
    token,
    `/admin/bookings/${bookingId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
  ).then(validateBookingAcknowledgment);
}

/**
 * A lesson she added that the student already paid her for by hand comes off
 * their card before it is charged.
 */
/** True once she has ticked a lesson "Already paid" (paid to her by hand). */
export function paidByHand(booking: Pick<AdminBooking, "payment_consent_version">) {
  return booking.payment_consent_version === "paid-by-hand";
}

/**
 * Ticks or unticks "Already paid" on one lesson. Ticked, it is never billed
 * and is in Receipts as paid by hand; unticked, it is billed as it would be now.
 */
export function setLessonPaid(token: string, bookingId: string, paid: boolean) {
  return adminRequest<{ booking: AdminBooking }>(token, `/admin/bookings/${bookingId}/paid`, {
    method: "POST",
    body: JSON.stringify({ paid }),
  }).then((data) => {
    if (!isApiRecord(data.booking) || data.booking.id !== bookingId || paidByHand(data.booking) !== paid) {
      throw new Error(BOOKING_REPLY_ERROR);
    }
    return data;
  });
}

export function setNoShow(token: string, bookingId: string, noShow: boolean) {
  return adminRequest<{ booking: AdminBooking }>(
    token,
    `/admin/bookings/${bookingId}/no-show`,
    {
      method: "POST",
      body: JSON.stringify({ noShow }),
    },
  ).then((data) => {
    if (!isApiRecord(data.booking) || data.booking.id !== bookingId ||
      data.booking.attendance_status !== (noShow ? "no_show" : "expected")) throw new Error(BOOKING_REPLY_ERROR);
    return data;
  });
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export type GoogleMeetConnection = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
  pending: number;
};

export function fetchGoogleMeetConnection(token: string) {
  return adminRequest<GoogleMeetConnection>(token, "/admin/google-calendar");
}

export function connectGoogleMeet(token: string) {
  return adminRequest<{ url: string }>(token, "/admin/google-calendar/connect", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
