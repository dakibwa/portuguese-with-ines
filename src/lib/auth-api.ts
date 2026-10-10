"use client";

import { BOOKING_API_BASE_URL } from "@/lib/config";
import type { BookingStatus } from "@/lib/booking-api";
import { BOOKING_REPLY_ERROR, isApiLesson, isApiRecord } from "@/lib/api-response";

export type Student = {
  id: string;
  email: string;
  name: string;
  phone: string;
  /** Optional Portuguese tax number for receipts; empty when none was given. */
  nif?: string;
  /**
   * The splat the student wears beside their name (src/lib/student-marks.ts);
   * empty for their initial. Absent until the Worker can save one.
   */
  mark?: string;
  timezone: string;
  /** "teacher" unlocks the schedule page's admin tools. */
  role: "student" | "teacher";
};

export type MyBooking = {
  reference: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  /** When the lesson was cancelled, independent of its scheduled date. */
  cancelledAt?: string | null;
  location: "online" | "porto";
  meetingUrl?: string | null;
  notes: string;
  lessonType: { id: string; name: string; durationMinutes: number; priceCents: number };
  isPast: boolean;
  sameDayFeeApplies: boolean;
  sameDayFeeAutomatic?: boolean;
  /** Only a legacy lesson already paid under the old policy is locked. */
  changeLocked?: boolean;
  paymentStatus?: "not_required" | "pending" | "scheduled" | "processing" | "paid" | "payment_due" | "refunded";
  /** Set when this lesson is one occurrence of a weekly series. */
  seriesId: string | null;
  manageToken: string;
};

/** An active weekly repeat, as /my-lessons needs to describe it. */
export type LessonSeries = {
  id: string;
  weekday: number;
  minuteOfDay: number;
  occurrences: number | null;
  openEnded: boolean;
  upcoming: number;
};

const SESSION_KEY = "ines-student-session";
// Outlives the session: a student with a booked lesson has signed in here.
const RETURNING_KEY = "ines-returning-student";
export const SESSION_CHANGE_EVENT = "ines:student-session-change";

export class SessionStorageError extends Error {
  constructor(message = "Your browser couldn’t save your sign-in. Allow site storage, then try signing in again.") {
    super(message);
    this.name = "SessionStorageError";
  }
}

/**
 * The session lives in localStorage rather than a cookie: the site and the
 * booking API are on different origins, so a cookie would have to be
 * SameSite=None and would be dropped by any browser blocking third-party
 * cookies. A bearer token sent explicitly avoids that entirely.
 */
export function readSession() {
  try {
    return window.localStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeSession(token: string, renewal?: { previousSession: string; studentId: string }) {
  try {
    window.localStorage.setItem(SESSION_KEY, token);
  } catch {
    // Every authenticated request reads this bearer from storage. Continuing
    // after a failed write would claim sign-in without any usable session.
    throw new SessionStorageError();
  }
  // A verified email change renews this account's token. Ordinary sign-ins
  // and storage events still replace the account and clear private views.
  window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: renewal }));
}

export function clearSession() {
  const token = readSession();
  if (token) {
    void post("/auth/logout", {}, token).catch(() => {
      // Local sign-out still works offline. Server revocation needs a connection.
    });
  }
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  } catch {
    // Nothing to clear.
  }
}

/**
 * The server has already refused this session (expired, revoked, or signed out
 * elsewhere), so there is nothing to revoke: just forget it here and let the
 * page show itself signed out. A delayed refusal belongs only to the session
 * that requested it, never to a newer sign-in.
 */
export function forgetSession(expectedSession?: string) {
  try {
    const session = window.localStorage.getItem(SESSION_KEY);
    if (!session || (expectedSession !== undefined && session !== expectedSession)) return;
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  } catch {
    // Nothing stored.
  }
}

/**
 * Whether a student with a booked lesson has been signed in on this browser,
 * or anyone is now. Booking uses it only to choose what to offer first,
 * sign-in rather than a trial; it grants nothing, and a cleared browser simply
 * looks new again. Inês signing in, or an account made and never booked,
 * leaves a newcomer on the same browser their trial.
 */
export function rememberReturningStudent() {
  try {
    window.localStorage.setItem(RETURNING_KEY, "1");
  } catch {
    // Private browsing: the next visit simply looks new.
  }
}

export function isReturningDevice() {
  try {
    return Boolean(window.localStorage.getItem(RETURNING_KEY) || window.localStorage.getItem(SESSION_KEY));
  } catch {
    return false;
  }
}

/** For useSyncExternalStore: the session changed here or in another tab. */
export function subscribeToSession(onChange: (event: Event) => void) {
  window.addEventListener(SESSION_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** A refusal from the account endpoints, keeping its status so a form can offer the next step. */
export class AuthApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error("We couldn’t reach the booking system. Please check your connection and try again.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (response.status === 401 && token) forgetSession(token);
  if (!response.ok) {
    const error = isApiRecord(data) && typeof data.error === "string" ? data.error : "";
    throw new AuthApiError(error || "Something went wrong. Please try again.", response.status);
  }
  if (!isApiRecord(data)) throw new AuthApiError(BOOKING_REPLY_ERROR, response.status);
  return data as T;
}

function validStudent(value: unknown): value is Student {
  return isApiRecord(value) && typeof value.id === "string" && Boolean(value.id) &&
    typeof value.name === "string" && typeof value.email === "string" &&
    ["nif", "mark", "phone", "timezone"].every((field) => value[field] == null || typeof value[field] === "string") &&
    (value.role === undefined || value.role === "student" || value.role === "teacher");
}

function validateStudentReply<T extends { student: Student }>(data: T) {
  if (!validStudent(data.student)) throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
  return data;
}

function validateSignInReply(data: { student: Student; session: string }) {
  validateStudentReply(data);
  if (typeof data.session !== "string" || !data.session) throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
  return data;
}

export function register(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  nif?: string;
  timezone?: string;
}) {
  return post<{ student: Student; session: string }>("/auth/register", input).then(validateSignInReply);
}

export function login(input: { email: string; password: string }) {
  return post<{ student: Student; session: string }>("/auth/login", input).then(validateSignInReply);
}

export function signInWithGoogle(credential: string, timezone: string) {
  return post<{ student: Student; session: string }>("/auth/google", { credential, timezone }).then(validateSignInReply);
}

export function requestPasswordReset(email: string) {
  return post<{ ok: true }>("/auth/forgot", { email }).then((data) => {
    if (data.ok !== true) throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
    return data;
  });
}

export function resetPassword(token: string, password: string) {
  return post<{ student: Student; session: string }>("/auth/reset", { token, password }).then(validateSignInReply);
}

export function updateProfile(token: string, input: { name?: string; phone?: string; nif?: string; mark?: string; timezone?: string }) {
  return post<{ student: Student }>("/me", input, token).then(validateStudentReply);
}

/**
 * Ask to change the address you sign in with. Nothing changes until the new
 * address confirms, so the answer is the same whether or not it is already in
 * use — otherwise this would be a way to test who has an account.
 */
export function requestEmailChange(token: string, email: string) {
  return post<{ ok: true; pending: string }>("/me/email", { email }, token).then((data) => {
    if (data.ok !== true || typeof data.pending !== "string" || !data.pending) throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
    return data;
  });
}

/** Apply a change the new address has proved, using the token from its email. */
export async function confirmEmailChange(token: string, changeToken: string) {
  const result = await post<{ student: Student; session?: string }>("/me/email/confirm", { token: changeToken }, token).then(validateStudentReply);
  if (result.session !== undefined && (typeof result.session !== "string" || !result.session)) throw new AuthApiError(BOOKING_REPLY_ERROR, 502);
  if (readSession() !== token) throw new AuthApiError("Your account changed while confirming this email. Please check your account.", 409);
  if (result.session) {
    try {
      storeSession(result.session, { previousSession: token, studentId: result.student.id });
    } catch (caught) {
      if (!(caught instanceof SessionStorageError)) throw caught;
      throw new SessionStorageError("Your email was changed, but your browser couldn’t save your sign-in. Allow site storage, then sign in with your new email.");
    }
  }
  return result;
}

declare global {
  interface Window {
    /** The account, asked for by /book's inline script for the stored session. */
    __inesMe?: { token: string; response: Promise<Response> } | null;
  }
}

export async function fetchMe(token: string) {
  // The document's request is used once, and only for the session it was
  // sent with; any later read asks again.
  const primed = typeof window !== "undefined" ? window.__inesMe : null;
  if (primed) window.__inesMe = null;
  let response: Response;
  try {
    response = await (primed?.token === token ? primed.response : fetch(`${BOOKING_API_BASE_URL}/me`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    }));
  } catch {
    throw new Error("We couldn’t reach the booking system. Please check your connection and try again.");
  }

  const data: unknown = await response.json().catch(() => null);

  // An expired or tampered session is not an error to show — it just means
  // signing in again.
  if (response.status === 401) {
    forgetSession(token);
    return null;
  }
  if (!response.ok) {
    const error = isApiRecord(data) && typeof data.error === "string" ? data.error : "";
    throw new AuthApiError(error || "We couldn’t load your lessons.", response.status);
  }
  if (!isApiRecord(data) || !validStudent(data.student) || !Array.isArray(data.bookings) || !data.bookings.every(isApiLesson) ||
    (data.series !== undefined && (!Array.isArray(data.series) || !data.series.every((series) =>
      isApiRecord(series) && typeof series.id === "string" && Boolean(series.id)
    )))) throw new AuthApiError(BOOKING_REPLY_ERROR, response.status);
  return data as { student: Student; bookings: MyBooking[]; series?: LessonSeries[]; sameDayFeeCents: number };
}
