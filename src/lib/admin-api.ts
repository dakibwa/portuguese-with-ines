import { BOOKING_API_BASE_URL } from "@/lib/config";

export type AdminStudent = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

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
  reference: string;
  lesson_name: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  /** The student's NIF for their receipt; empty when none was given. */
  student_nif?: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled";
  location: "online" | "porto";
  meeting_url?: string | null;
  notes: string;
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
    | "refunded";
  attendance_status: "expected" | "no_show";
};

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
    throw new Error("We couldn't reach the booking system. Please check your connection.");
  }

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function fetchSchedule(token: string) {
  return adminRequest<{
    rules: AvailabilityRule[];
    exceptions: AvailabilityException[];
    settings?: { slotIntervalMinutes: number };
  }>(token, "/admin/availability");
}

export function fetchBookings(token: string, from?: string) {
  return adminRequest<{
    bookings: AdminBooking[];
    manualPaymentReconciliation?: { id: string; reference: string }[];
  }>(
    token,
    `/admin/bookings${from ? `?from=${encodeURIComponent(from)}` : ""}`,
  );
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
  );
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
  );
}

export function fetchStudents(token: string) {
  return adminRequest<{ students: AdminStudent[] }>(token, "/admin/students");
}

/** Creates the student's account too, if this is their first lesson. */
export function createBookingFor(
  token: string,
  input: {
    email: string;
    name: string;
    lessonType: string;
    startAt: string;
    location: "online" | "porto";
    notes: string;
  },
) {
  return adminRequest<{ booking: { reference: string } }>(
    token,
    "/admin/bookings",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function rescheduleBookingAs(
  token: string,
  bookingId: string,
  startAt: string,
) {
  return adminRequest<{ booking: { reference: string } }>(
    token,
    `/admin/bookings/${bookingId}/reschedule`,
    {
      method: "POST",
      body: JSON.stringify({ startAt }),
    },
  );
}

export function cancelBookingAs(token: string, bookingId: string) {
  return adminRequest<{ booking: { reference: string } }>(
    token,
    `/admin/bookings/${bookingId}/cancel`,
    {
      method: "POST",
      body: "{}",
    },
  );
}

export function setNoShow(token: string, bookingId: string, noShow: boolean) {
  return adminRequest<{ booking: AdminBooking }>(
    token,
    `/admin/bookings/${bookingId}/no-show`,
    {
      method: "POST",
      body: JSON.stringify({ noShow }),
    },
  );
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
