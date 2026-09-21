import { BOOKING_API_BASE_URL, BOOKING_TIME_ZONE, formatMoney } from "@/lib/config";

export type LessonType = {
  id: string;
  slug: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_cents: number;
};

export type Slot = { startAt: string; endAt: string };

export type AvailabilityResponse = {
  slotsByDate: Record<string, Slot[]>;
  timeZone: string;
  minimumNoticeHours: number;
  horizonDays: number;
  lessonType: { id: string; name: string; durationMinutes: number; priceCents: number };
};

export type Booking = {
  reference: string;
  status: "confirmed" | "cancelled";
  lessonType: { id: string; name: string; durationMinutes: number; priceCents: number };
  startAt: string;
  endAt: string;
  location: "online" | "porto";
  meetingUrl?: string | null;
  studentName: string;
  studentEmail: string;
  studentTimezone: string;
  notes: string;
  rescheduleCount: number;
  sameDayFeeCents: number;
  sameDayFeeAutomatic?: boolean;
  /** Automatic-payment states appear once Stripe is on; older bookings say 'not_required'. */
  paymentStatus?: "not_required" | "pending" | "scheduled" | "processing" | "paid" | "payment_due" | "refunded";
  amountCents?: number | null;
};

export type ManagedBooking = {
  paymentsDue?: { lesson: number | null; sameDayFee: number | null };
  recurring?: boolean;
  durationPrices?: Record<number, number>;
  booking: Booking;
  isPast: boolean;
  /** Inside the 14-hour window: moving or cancelling now costs the fee. */
  sameDayFeeApplies: boolean;
  sameDayFeeAutomatic?: boolean;
  /** An older paid lesson inside the 14-hour window: no moves, no cancellation, no refund. */
  changeLocked?: boolean;
  /** Cancelling now returns the money automatically. */
  refundOnCancel?: boolean;
};

export type LessonTypesResponse = {
  lessonTypes: LessonType[];
  paymentMode?: "off" | "prepay" | "postpay";
  /** True when students save a card and the lesson charges after it ends. */
  postpay?: boolean;
  paymentReady?: boolean;
};

export class BookingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BookingApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BOOKING_API_BASE_URL) {
    throw new BookingApiError("Booking is not connected yet.", 503);
  }

  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }
    });
  } catch {
    // A network failure here is indistinguishable from the Worker being down,
    // and both mean the same thing to a student: use another way to reach her.
    throw new BookingApiError("We couldn't reach the booking system. Please check your connection.", 0);
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new BookingApiError(data.error || "Something went wrong. Please try again.", response.status);
  }

  return data;
}

declare global {
  interface Window {
    /** Set by the inline script on /book, before React exists. */
    __inesLessonTypes?: Promise<LessonTypesResponse | null> | null;
  }
}

export function listLessonTypes() {
  // Use the request the document already started, if there was one. Cleared on
  // read so a later call goes to the network rather than replaying a stale list.
  if (typeof window !== "undefined" && window.__inesLessonTypes) {
    const primed = window.__inesLessonTypes;
    window.__inesLessonTypes = null;
    return primed.then(
      (data) => data ?? request<LessonTypesResponse>("/lesson-types")
    );
  }

  return request<LessonTypesResponse>("/lesson-types");
}

export function fetchAvailability(lessonType: string, from: string, to: string, signal?: AbortSignal) {
  return request<AvailabilityResponse>(
    `/availability?${new URLSearchParams({ lessonType, from, to })}`,
    { signal }
  );
}

/** A weekly run. `null` means it keeps going until the student stops it. */
export type RepeatChoice = 4 | 6 | 8 | null;

export type SeriesOutcome = {
  id: string;
  weeks: number | null;
  openEnded: boolean;
  /** Every lesson actually booked, first included. */
  booked: string[];
  /** Weeks that were already taken, and so left out. */
  skipped: string[];
};

export type SelectionOutcome = {
  booked: string[];
  skipped: string[];
  recurring: boolean;
  weeks: number | null;
  weeklyTimes: number;
};

/**
 * What a repeat would book, before anything is booked. The student is shown the
 * weeks that are unavailable while they can still change their mind.
 */
export function previewSeries(
  session: string,
  payload: { lessonType: string; startAt: string; weeks: RepeatChoice }
) {
  return request<{
    weeks: number | null;
    openEnded: boolean;
    bookable: string[];
    skipped: string[];
  }>("/bookings/series/preview", {
    method: "POST",
    ...(session ? { headers: { Authorization: `Bearer ${session}` } } : {}),
    body: JSON.stringify(payload)
  });
}

/** Requires a signed-in student: identity comes from the session, not the form. */
export function createBooking(
  session: string,
  payload: {
    notes: string;
    lessonType: string;
    startAt: string;
    /** Individual dates, or up to two weekly anchors in the same Porto week. */
    startAts?: string[];
    location: "online" | "porto";
    timezone: string;
    /** Omitted entirely for a one-off lesson. */
    repeat?: RepeatChoice;
    /** Required whenever the saved-card, after-lesson payment mode is active. */
    paymentConsent?: boolean;
    expectedPriceCents?: number;
  }
) {
  return request<{
    booking: Booking;
    // Present when a card still needs to be saved: hosted checkout answers with
    // a URL, embedded with a client secret. No money is taken in this step.
    checkoutUrl?: string;
    checkoutClientSecret?: string;
    manageUrl?: string;
    manageToken?: string;
    /** Present only when the lesson was booked as a repeating one. */
    series?: SeriesOutcome;
    selection?: SelectionOutcome;
  }>("/bookings", {
    method: "POST",
    headers: { Authorization: `Bearer ${session}` },
    body: JSON.stringify(payload)
  });
}

export function fetchRecurringRates(session: string) {
  return request<{ rates: Record<number, number> }>("/me/recurring-rates", {
    headers: { Authorization: `Bearer ${session}` }
  });
}

export function redeemRecurringRate(session: string, code: string, durationMinutes: number) {
  return request<{ rates: Record<number, number> }>("/me/recurring-rates", {
    method: "POST",
    headers: { Authorization: `Bearer ${session}` },
    body: JSON.stringify({ code, durationMinutes })
  });
}

export function recoverBookingPayment(token: string, purpose: "lesson" | "same-day-fee") {
  return request<{ url: string }>(`/bookings/${encodeURIComponent(token)}/payment`, {
    method: "POST", body: JSON.stringify({ purpose })
  });
}

/**
 * Stop a repeating booking. By default the lessons already in the calendar are
 * kept. The explicit bulk-cancel route returns how many were cancelled,
 * kept inside the 14-hour window, and refunded.
 */
export function stopSeries(session: string, seriesId: string, cancelRemaining = false) {
  return request<{ ok: true; stopped: true; cancelled: number; kept: number; refunded: number; pendingRefunds?: number }>(
    `/series/${encodeURIComponent(seriesId)}/stop`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session}` },
      body: JSON.stringify({ cancelRemaining })
    }
  );
}

/** Move every upcoming occurrence in an active weekly sequence together. */
export function rescheduleSeries(
  session: string,
  seriesId: string,
  startAt: string,
  lessonType?: string,
  location?: "online" | "porto",
  expectedPriceCents?: number
) {
  return request<{ ok: true; moved: number; bookings: Booking[] }>(
    `/series/${encodeURIComponent(seriesId)}/reschedule`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session}` },
      body: JSON.stringify({
        startAt,
        ...(expectedPriceCents === undefined ? {} : { expectedPriceCents }),
        ...(lessonType ? { lessonType } : {}),
        ...(location ? { location } : {})
      })
    }
  );
}

export function fetchBooking(token: string) {
  return request<ManagedBooking>(`/bookings/${encodeURIComponent(token)}`);
}

export function rescheduleBooking(
  token: string,
  startAt: string,
  lessonType?: string,
  location?: "online" | "porto",
  expectedPriceCents?: number
) {
  return request<{ booking: Booking; sameDayFeeApplied: boolean }>(
    `/bookings/${encodeURIComponent(token)}/reschedule`,
    {
      method: "POST",
      body: JSON.stringify({
        startAt,
        ...(expectedPriceCents === undefined ? {} : { expectedPriceCents }),
        ...(lessonType ? { lessonType } : {}),
        ...(location ? { location } : {})
      })
    }
  );
}

export function cancelBooking(token: string) {
  return request<{ booking: Booking; sameDayFeeApplied: boolean }>(
    `/bookings/${encodeURIComponent(token)}/cancel`,
    { method: "POST", body: "{}" }
  );
}

/** The student's own zone, so times can be shown in it alongside Porto time. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || BOOKING_TIME_ZONE;
  } catch {
    return BOOKING_TIME_ZONE;
  }
}

/**
 * Once a lesson is booked, its duration is more useful than repeating the
 * product name on every compact calendar row. Trials stay named because that
 * distinction matters; ordinary and longer lessons become “60 mins” or
 * “90 mins”.
 */
export function formatBookedLessonLabel(lessonType: {
  id: string;
  name: string;
  durationMinutes: number;
}) {
  return lessonType.id === "trial" ? lessonType.name : `${lessonType.durationMinutes} mins`;
}

export function portoDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return parts;
}

export function addDaysToKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate()
  ).padStart(2, "0")}`;
}

export function portoWeekKey(startAt: string) {
  const key = portoDateKey(new Date(startAt));
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return addDaysToKey(key, -((weekday + 6) % 7));
}

export function formatSlotTime(startAt: string, timeZone = BOOKING_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(startAt));
}

export function formatLongDate(value: string | Date, timeZone = BOOKING_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(typeof value === "string" ? new Date(value) : value);
}

/**
 * Short month name for a cell that falls outside its week's month.
 *
 * The week of 31 August to 6 September is captioned September, so without this
 * the 31 reads as though September had one.
 */
export function shortMonth(monthNumber: number, yearHint: string) {
  const [year] = yearHint.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1))
  );
}

/**
 * A Porto wall-clock date and time to the UTC instant it names.
 *
 * Two passes, as the Worker does it: the first guesses using the offset at the
 * naive timestamp, the second corrects using the offset actually in force at
 * that guess. One correction covers every real transition, since offsets move
 * by at most an hour.
 */
export function portoTimeToUtc(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hours, minutes);

  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BOOKING_TIME_ZONE,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return (
      Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - instant
    );
  };

  const firstPass = naive - offsetAt(naive);
  return new Date(naive - offsetAt(firstPass)).toISOString();
}

export function formatMoneyCents(cents: number) {
  return formatMoney(cents, "EUR");
}

/**
 * Payment links come from the API, so they are checked before the browser is
 * sent to one: only an https page on Stripe's own domain is followed.
 */
export function stripePaymentUrl(value: string) {
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  const onStripe = url !== null && (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"));
  if (!url || url.protocol !== "https:" || !onStripe || url.username || url.password) {
    throw new Error("The secure payment page could not be opened. Please try again shortly.");
  }
  return url.href;
}

/**
 * A booked lesson's time as its student should read it. On Porto's clock that
 * is the bare time; anywhere else it names both clocks, because "15:00" alone
 * reads as the student's own 15:00.
 */
export function formatSlotTimeForStudent(startAt: string, studentZone: string) {
  const local = differingLocalTime(startAt, studentZone);
  return local ? `${formatSlotTime(startAt)} Porto time · ${local} your time` : formatSlotTime(startAt);
}

/**
 * The same instant in the student's own zone, or null when it reads the same as
 * Porto time. Lisbon and London share an offset, so a naive "zones differ"
 * check prints "10:00 your time" under "10:00" for every UK student.
 *
 * Compared per instant rather than per zone: two zones can agree for part of
 * the year and diverge for the rest, around each side's DST change.
 */
export function differingLocalTime(startAt: string, studentZone: string) {
  if (studentZone === BOOKING_TIME_ZONE) return null;

  const local = formatSlotTime(startAt, studentZone);
  if (local === formatSlotTime(startAt)) return null;

  /*
   * The date comes too when the student's calendar day is not Porto's. A
   * lesson at 10:00 Porto is 21:00 the day before in Auckland, and printing
   * "21:00 your time" beside a Porto date told them the wrong day entirely —
   * the further from Portugal a student is, the more wrong it got.
   */
  const date = new Date(startAt);
  const localKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: studentZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

  if (localKey === portoDateKey(date)) return local;

  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: studentZone,
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);

  return `${day}, ${local}`;
}

export type DayCell = { key: string; day: number; month: number; isToday: boolean };
export type BookingWeek = { key: string; month: string; monthNumber: number; showMonth: boolean; cells: DayCell[] };

/**
 * Drop only the dead weeks at the front of the calendar. On a weekend — or
 * whenever the rest of this week has no free time — the first thing a student
 * sees is the next week they can actually use. Closed weeks later in the
 * window stay visible so the calendar does not disguise real gaps.
 */
export function startWithFirstBookableWeek(
  weeks: BookingWeek[],
  slotsByDate: Record<string, Slot[]>
): BookingWeek[] {
  const firstBookableWeek = weeks.findIndex((week) =>
    week.cells.some((cell) => Boolean(slotsByDate[cell.key]?.length))
  );

  if (firstBookableWeek <= 0) return weeks;

  return weeks.slice(firstBookableWeek).map((week, index) =>
    index === 0 && !week.showMonth ? { ...week, showMonth: true } : week
  );
}

/**
 * The bookable window as whole Monday-first weeks, each tagged with the month
 * it belongs to.
 *
 * Deliberately not a calendar month. Late in a month a month grid is mostly
 * dates already gone — on the 28th, four fifths of the grid — and it hides the
 * start of the next month, which is exactly where the free time is.
 *
 * A week is attributed to the month containing its Thursday, the ISO
 * convention: the week of 31 August to 6 September reads as September, which is
 * where four of its days and all of its bookable ones sit. Labelling by the
 * first day would have called it August and put the heading a week late.
 */
export function buildBookingWeeks(fromKey: string, horizonDays: number): BookingWeek[] {
  const [year, month, day] = fromKey.split("-").map(Number);
  const from = Date.UTC(year, month - 1, day);
  const leading = (new Date(from).getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = from - leading * 86400000;
  const weekCount = Math.ceil((leading + Math.max(horizonDays, 7) + 1) / 7);

  // No year: the window is 30 days, so it can only ever be this year or the
  // turn of one, and the month alone is what tells you where you are.
  // These are calendar date keys, not instants in the visitor's time zone. A
  // behind-UTC browser would otherwise render midnight UTC as the previous
  // month (for example 1 October as 30 September).
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
  const weeks: BookingWeek[] = [];
  let previousMonth = "";

  for (let week = 0; week < weekCount; week += 1) {
    const cells: DayCell[] = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(gridStart + (week * 7 + index) * 86400000);
      const key = date.toISOString().slice(0, 10);
      return { key, day: date.getUTCDate(), month: date.getUTCMonth() + 1, isToday: key === fromKey };
    });

    const thursday = new Date(gridStart + (week * 7 + 3) * 86400000);
    const label = monthName.format(thursday);

    weeks.push({
      key: cells[0].key,
      month: label,
      monthNumber: thursday.getUTCMonth() + 1,
      showMonth: label !== previousMonth,
      cells
    });
    previousMonth = label;
  }

  return weeks;
}
