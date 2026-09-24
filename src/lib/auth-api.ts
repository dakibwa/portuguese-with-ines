"use client";

import { BOOKING_API_BASE_URL } from "@/lib/config";

export type Student = {
  id: string;
  email: string;
  name: string;
  phone: string;
  /** Optional Portuguese tax number for receipts; empty when none was given. */
  nif?: string;
  timezone: string;
  /** "teacher" unlocks the schedule page's admin tools. */
  role: "student" | "teacher";
};

export type MyBooking = {
  reference: string;
  status: "confirmed" | "cancelled";
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

export function storeSession(token: string) {
  try {
    window.localStorage.setItem(SESSION_KEY, token);
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  } catch {
    // A student in private browsing simply signs in again next visit.
  }
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
 * page show itself signed out.
 */
export function forgetSession() {
  try {
    if (!window.localStorage.getItem(SESSION_KEY)) return;
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
export function subscribeToSession(onChange: () => void) {
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
    throw new Error("We couldn't reach the booking system. Please check your connection and try again.");
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new AuthApiError(data.error || "Something went wrong. Please try again.", response.status);
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
  return post<{ student: Student; session: string }>("/auth/register", input);
}

export function login(input: { email: string; password: string }) {
  return post<{ student: Student; session: string }>("/auth/login", input);
}

export function signInWithGoogle(credential: string, timezone: string) {
  return post<{ student: Student; session: string }>("/auth/google", { credential, timezone });
}

export function requestPasswordReset(email: string) {
  return post<{ ok: true }>("/auth/forgot", { email });
}

export function resetPassword(token: string, password: string) {
  return post<{ student: Student; session: string }>("/auth/reset", { token, password });
}

export function updateProfile(token: string, input: { name?: string; phone?: string; nif?: string; timezone?: string }) {
  return post<{ student: Student }>("/me", input, token);
}

/**
 * Ask to change the address you sign in with. Nothing changes until the new
 * address confirms, so the answer is the same whether or not it is already in
 * use — otherwise this would be a way to test who has an account.
 */
export function requestEmailChange(token: string, email: string) {
  return post<{ ok: true; pending: string }>("/me/email", { email }, token);
}

/** Apply a change the new address has proved, using the token from its email. */
export async function confirmEmailChange(token: string, changeToken: string) {
  const result = await post<{ student: Student; session?: string }>("/me/email/confirm", { token: changeToken }, token);
  if (result.session) storeSession(result.session);
  return result;
}

export async function fetchMe(token: string) {
  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}/me`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new Error("We couldn't reach the booking system. Please check your connection and try again.");
  }

  const data = (await response.json().catch(() => ({}))) as {
    student: Student;
    bookings: MyBooking[];
    series?: LessonSeries[];
    sameDayFeeCents: number;
    error?: string;
  };

  // An expired or tampered session is not an error to show — it just means
  // signing in again.
  if (response.status === 401) {
    clearSession();
    return null;
  }
  if (!response.ok) throw new Error(data.error || "Could not load your lessons.");
  return data;
}
