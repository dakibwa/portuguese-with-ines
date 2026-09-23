"use client";

import { MeetingLink } from "@/components/MeetingLink";

import { type CSSProperties, Fragment, FormEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleHelp,
  MessageSquareText,
  Plus,
  Repeat,
  X
} from "lucide-react";
import { AssetMark } from "@/components/BrandMarks";
import { CalendarBookingPrompt } from "@/components/CalendarBookingPrompt";
/*
 * Loaded when it is needed, not before. The sign-in panel — with the Google
 * button, the segmented tabs and the whole account form behind it — is only
 * reached at the last step, and having it in the first chunk meant a student
 * choosing a lesson waited for code they might never see. It is fetched while
 * they are picking a date.
 */
const AuthPanel = dynamic(() => import("@/components/AuthPanel").then((m) => m.AuthPanel), {
  loading: () => <p className="booking-state-note">Loading…</p>
});
const AccountControls = dynamic(() => import("@/components/MyLessons").then((m) => m.MyLessons), {
  loading: () => <p className="booking-state-note">Loading your account…</p>
});
import { LessonMark } from "@/components/LessonMarks";
import { fetchMe, isReturningDevice, readSession, subscribeToSession, type LessonSeries, type MyBooking, type Student } from "@/lib/auth-api";
import { keepDialogFocus } from "@/lib/dialog-focus";
import { SITE_BASE_PATH } from "@/lib/paths";
import {
  addDaysToKey,
  browserTimeZone,
  buildBookingWeeks,
  cancelBooking,
  createBooking,
  differingLocalTime,
  formatSlotTimeForStudent,
  stripePaymentUrl,
  fetchAvailability,
  fetchBooking,
  fetchRecurringRates,
  redeemRecurringRate,
  recoverBookingPayment,
  formatBookedLessonLabel,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  listLessonTypes,
  portoDateKey,
  portoWeekKey,
  previewSeries,
  rescheduleBooking,
  rescheduleSeries,
  shortMonth,
  stopSeries,
  type BookingWeek,
  type ManagedBooking,
  type LessonType,
  type RepeatChoice,
  type SeriesOutcome,
  type SelectionOutcome,
  type Slot
} from "@/lib/booking-api";
import {
  BOOKING_HORIZON_DAYS_FALLBACK,
  BOOKING_TIME_ZONE,
  CONTACT_WHATSAPP_URL,
  NOTICE_HOURS,
  SAME_DAY_RESCHEDULE_FEE_CENTS,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_PUBLISHABLE_READY,
  formatLessonDuration
} from "@/lib/config";
import { staticLessonTypes } from "@/lib/lesson-products";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayNames = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type Step = "day" | "time" | "details";
type BookingIntent = "choose" | "book" | "lessons";
type BookingKind = "" | "trial" | "once" | "recurring";
/** One selected week, or the paged view of four weeks at a time. */
type CalendarWeekCount = 1 | 4;
/** Every calendar shows four weeks; arrows reach the rest of the horizon. */
const CALENDAR_PAGE_WEEKS = 4;

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BOOKING_TIME_ZONE });

function formatDayMonth(key: string) {
  return dayMonth.format(new Date(`${key}T12:00:00Z`));
}

/**
 * Times read as a small timetable: one row per hour, one column per start
 * minute the day offers (four for quarter hours, two for half hours), so a
 * gap reads as a gap and a long day stays short. Finer grids fall back to
 * wrapping.
 */
/**
 * A day's free times in two fixed halves, split at 14:00 Porto time and named
 * by the same span every day (from Inês's earliest start to 14:00, and from
 * 14:00 to her latest), so a full day of quarter hours is never one wall of
 * buttons and the choice never shifts under the student. A half with nothing
 * free that day says so. Each half is a small timetable: one row per hour,
 * each start minute in its own column. It opens on the half holding the time
 * already chosen, or the first with free times.
 */
function TimePicker({ day, renderTime, selected = "", slots }: {
  /** The earliest and latest start across every loaded day, Porto time. */
  day: { first: string; last: string };
  renderTime: (slot: Slot, place: CSSProperties | undefined) => ReactNode;
  selected?: string;
  slots: Slot[];
}) {
  const name = useId();
  const clock = (startAt: string) => formatSlotTime(startAt);
  const partOf = (startAt: string) => (clock(startAt) < DAY_SPLIT ? "early" : "late");
  const split = day.first < DAY_SPLIT && day.last >= DAY_SPLIT;
  const parts = useMemo(
    () => (["early", "late"] as const).map((id) => ({
      id,
      label: id === "early" ? `${day.first} – ${DAY_SPLIT}` : `${DAY_SPLIT} – ${day.last}`,
      slots: slots.filter((slot) => partOf(slot.startAt) === id)
    })),
    // partOf reads only the slot times.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, day.first, day.last]
  );
  const [chosen, setChosen] = useState(selected ? partOf(selected) : "");
  if (!slots.length) return null;
  const current = split
    ? parts.find((part) => part.id === chosen) ?? parts.find((part) => part.slots.length) ?? parts[0]
    : { id: "all", label: "", slots };
  const minutes = [...new Set(slots.map((slot) => clock(slot.startAt).slice(3, 5)))].sort();
  const hours = [...new Set(current.slots.map((slot) => clock(slot.startAt).slice(0, 2)))];
  const timetable = minutes.length <= 4;
  return (
    <div className="time-picker">
      {split ? (
        <div
          aria-label="Part of the day, Porto time"
          className={`segmented time-picker__parts segmented--position-${current.id === "late" ? 1 : 0}`}
          role="radiogroup"
        >
          <span aria-hidden="true" className="segmented__thumb" />
          {parts.map((part) => (
            <label className={part.id === current.id ? "is-active" : ""} key={part.id}>
              <input checked={part.id === current.id} name={name} onChange={() => setChosen(part.id)} type="radio" value={part.id} />
              {part.label}
            </label>
          ))}
        </div>
      ) : null}
      {current.slots.length ? (
        <div
          className="slot-grid time-picker__times"
          key={current.id}
          style={timetable ? { gridTemplateColumns: `repeat(${minutes.length}, minmax(0, 1fr))` } : undefined}
        >
          {current.slots.map((slot) => renderTime(slot, timetable ? {
            gridColumn: minutes.indexOf(clock(slot.startAt).slice(3, 5)) + 1,
            gridRow: hours.indexOf(clock(slot.startAt).slice(0, 2)) + 1
          } : undefined))}
        </div>
      ) : (
        <p className="booking-state-note time-picker__empty">Nothing free {current.id === "early" ? "before" : "from"} {DAY_SPLIT} on this day.</p>
      )}
    </div>
  );
}

/** Where a day's times divide: the morning's, and the rest of the day's. */
const DAY_SPLIT = "14:00";

function daysBetween(fromKey: string, toKey: string) {
  return Math.round((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / 86_400_000);
}

/** "once" is a real choice; `null` is the deliberate ongoing weekly run. */
type RepeatOption = "once" | RepeatChoice;
type FormState = { notes: string; location: "online" | "porto"; repeat: RepeatOption };
const emptyForm: FormState = { notes: "", location: "online", repeat: "once" };

function minutesToClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const RECURRING_OPTIONS: { value: Exclude<RepeatOption, "once">; label: string }[] = [
  { value: 4, label: "4 weeks" },
  { value: 6, label: "6 weeks" },
  { value: 8, label: "8 weeks" },
  { value: null, label: "Ongoing" }
];

/** The wire form: `undefined` books once; `null` repeats until stopped. */
function repeatPayload(option: RepeatOption): RepeatChoice | undefined {
  if (option === "once") return undefined;
  return option;
}

function RepeatAvailability({
  chosen,
  error,
  previewing,
  preview,
  setup = false
}: {
  chosen: boolean;
  error: string;
  previewing: boolean;
  preview: { bookable: string[]; skipped: string[] } | null;
  setup?: boolean;
}) {
  // A fully available repeat is the expected state, so it should not consume
  // space. Guidance, loading, a failed check, and clashing weeks are the only
  // states that need to ask for attention.
  if (chosen && !previewing && !error && preview && !preview.skipped.length) return null;

  return (
    <section
      className={`booking-repeat-choice${setup ? " booking-repeat-choice--setup" : ""}`}
      aria-label="Recurring lesson availability"
    >
      {!preview?.skipped.length ? (
        <p className="booking-repeat-note" role="status">
          {!chosen ? (
            "Choose a time and we'll check every week before you book."
          ) : previewing || (!preview && !error) ? (
            "Checking which weeks are free…"
          ) : error ? (
            error
          ) : (
            "We couldn't check the later weeks just now. Nothing is booked until you confirm."
          )}
        </p>
      ) : null}

      {!previewing && preview?.skipped.length ? (
        <div className="booking-alert booking-alert--warn booking-skipped" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <p>
              <strong>
                {preview.skipped.length === 1
                  ? "One lesson time clashes"
                  : `${preview.skipped.length} lesson times clash`}
              </strong>
              . {preview.skipped.length === 1 ? "It won't be booked." : "They won't be booked."}
            </p>
            <ul>
              {preview.skipped.map((startAt) => (
                <li key={startAt}>{formatLongDate(startAt)} at {formatSlotTime(startAt)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Each selected lesson has its own mark, none shared with the choices above it.
// The last is the repeat row's mark: only single lessons reach eight, and they
// have no repeat row.
const LESSON_MARKS = [
  "/visuals/v2-splats/booking-availability-splat-v2.svg",
  "/visuals/v2-splats/relaxed-practical-blob.webp",
  "/visuals/v2-splats/at-your-pace-blob.webp",
  "/visuals/v2-splats/one-to-one-splat-v2.svg",
  "/visuals/v2-splats/real-life-splat-v2.svg",
  "/visuals/v2-splats/european-portuguese-splat-v2.svg",
  "/visuals/v2-splats/faq-answers-splat-v2.svg",
  "/visuals/v2-splats/flexible-rescheduling-splat-v2.svg"
];

function BookingSelectionSummary({
  actionLabel,
  actionText,
  ariaLabel,
  detail,
  disabled = false,
  mark,
  onAction,
  title
}: {
  actionLabel?: string;
  /** Visible text when the accessible label, like "Change lesson 2", would crowd the row. */
  actionText?: string;
  ariaLabel: string;
  detail?: string;
  disabled?: boolean;
  mark: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="booking-selection-summary" aria-label={ariaLabel}>
      <AssetMark asset={mark} className="booking-selection-summary__mark" />
      <span className="booking-choice-summary__copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {actionLabel && onAction ? (
        <button
          aria-label={actionLabel}
          className="booking-choice-summary__change"
          disabled={disabled}
          onClick={onAction}
          type="button"
        >
          {actionText ?? (
            <>
              <span className="booking-choice-summary__change-label">{actionLabel}</span>
              <span className="booking-choice-summary__change-short" aria-hidden="true">Change</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

type Confirmation = {
  meetingUrl?: string | null;
  location: "online" | "porto";
  reference: string;
  startAt: string;
  manageUrl: string;
  manageToken: string;
  email: string;
  series?: SeriesOutcome;
  selection?: SelectionOutcome;
};

/**
 * Stripe's embedded checkout: their payment form, mounted inside this page, so
 * paying never means leaving the site. The script is loaded only at the moment
 * a payment actually starts — the booking page carries no Stripe weight for
 * anyone browsing, and none at all until saved-card charging is switched on.
 */
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => {
      initEmbeddedCheckout: (options: { clientSecret: string }) => Promise<{
        mount: (element: HTMLElement) => void;
        destroy: () => void;
      }>;
    };
  }
}

let stripeJs: Promise<void> | null = null;
function loadStripeJs() {
  if (typeof window !== "undefined" && window.Stripe) return Promise.resolve();
  if (!stripeJs) {
    stripeJs = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = () => resolve();
      script.onerror = () => {
        stripeJs = null;
        reject(new Error("The payment form couldn't load. Please check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return stripeJs;
}

let bookingMotionTimer: number | null = null;

function finishBookingMotion() {
  if (bookingMotionTimer !== null) window.clearTimeout(bookingMotionTimer);
  document.documentElement.classList.remove("booking-transitioning");
  bookingMotionTimer = null;
}

function transitionBooking(update: () => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }

  if (bookingMotionTimer !== null) finishBookingMotion();
  document.documentElement.classList.add("booking-transitioning");
  flushSync(update);
  bookingMotionTimer = window.setTimeout(finishBookingMotion, 200);
}

/**
 * A decision should hand the student to the next decision, especially on a
 * phone where the next panel sits below what they just chose. If that decision
 * is already comfortably visible, however, moving the page only makes the
 * workspace feel unstable. The view change settles first, then two animation
 * frames let the browser measure the final position before deciding whether a
 * scroll is actually needed. Reduced-motion preferences are respected.
 */
function orientTo(id: string, focus = false, forceOnMobile = false) {
  const orient = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById(id);
        if (!target) return;
        if (focus) target.focus({ preventScroll: true });
        const bounds = target.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
        const enoughVisible = bounds.top >= 12 && visibleHeight >= Math.min(bounds.height, 160);
        const shouldGuideMobile = forceOnMobile && window.matchMedia("(max-width: 699px)").matches;
        if (enoughVisible && !shouldGuideMobile) return;
        target.scrollIntoView({
          behavior: shouldGuideMobile || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start"
        });
      });
    });
  };

  // The final DOM exists synchronously. Start guiding immediately rather than
  // waiting for the decorative fade to finish, which previously created a
  // noticeable pause followed by a second, separate movement.
  orient();
}

export function BookingCalendar({ initialManageToken = "", initialLessonsView = false }: { initialManageToken?: string; initialLessonsView?: boolean } = {}) {
  const [step, setStep] = useState<Step>("day");
  const [intent, setIntent] = useState<BookingIntent>("choose");
  const [accountView, setAccountView] = useState<"upcoming" | "history" | "profile">("upcoming");
  /*
   * Seeded from the published lesson copy so the three cards are in the static
   * HTML and on screen at first paint. Before this the first step was an empty
   * panel until the bundle had hydrated and a round trip had returned — four
   * seconds of nothing on a slow phone. The API answer overwrites this as soon
   * as it arrives, so the live table still decides names and prices.
   */
  const [lessonTypes, setLessonTypes] = useState<LessonType[]>(staticLessonTypes);
  // Saved-card charging: set from the API, so the page tells the truth without
  // a rebuild when the switch is flipped.
  const [postpay, setPostpay] = useState(false);
  const [paymentConfigurationError, setPaymentConfigurationError] = useState("");
  const [paymentConsent, setPaymentConsent] = useState(false);
  const [payment, setPayment] = useState<{ clientSecret: string } | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const paymentMountRef = useRef<HTMLDivElement>(null);

  // Mount Stripe's embedded form when a payment starts; tear it down when the
  // student backs out. Completion never reaches this effect — Stripe returns
  // the student back to this workspace itself.
  useEffect(() => {
    if (!payment || !STRIPE_PUBLISHABLE_READY) return;
    let cancelled = false;
    let mounted: { destroy: () => void } | null = null;

    loadStripeJs()
      .then(() => {
        if (cancelled || !window.Stripe || !paymentMountRef.current) return;
        return window.Stripe(STRIPE_PUBLISHABLE_KEY)
          .initEmbeddedCheckout({ clientSecret: payment.clientSecret })
          .then((checkout) => {
            if (cancelled) {
              checkout.destroy();
              return;
            }
            mounted = checkout;
            if (paymentMountRef.current) checkout.mount(paymentMountRef.current);
          });
      })
      .catch((error: Error) => {
        if (!cancelled) setPaymentError(error.message);
      });

    return () => {
      cancelled = true;
      mounted?.destroy();
    };
  }, [payment]);
  const [lessonTypeId, setLessonTypeId] = useState("");
  // A lesson card on /lessons names its length (`?lesson=single|long`). The
  // student still chooses one-off or weekly; that choice then starts there.
  const [preferredLessonTypeId, setPreferredLessonTypeId] = useState("");
  const [bookingKind, setBookingKind] = useState<BookingKind>("");
  const [todayKey, setTodayKey] = useState("");
  const [horizonDays, setHorizonDays] = useState(BOOKING_HORIZON_DAYS_FALLBACK);
  // The free time after each lesson, so two picked lessons keep it between
  // them just as the Worker will insist when they are booked.
  const [lessonGapMinutes, setLessonGapMinutes] = useState(0);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [bookingPromptDate, setBookingPromptDate] = useState("");
  const [calendarWeekCount, setCalendarWeekCount] = useState<CalendarWeekCount>(4);
  // The Monday that starts the four weeks on show; empty means the first page,
  // or the page holding the selected date.
  const [calendarPageStart, setCalendarPageStart] = useState("");
  // Some changes need fresh availability without the lesson type changing
  // (choosing the trial again, or moving a lesson of the same length). Bumping
  // this asks for it; relying on the type alone left "Checking what's free…"
  // on screen for good.
  const [availabilityRequest, setAvailabilityRequest] = useState(0);
  // A lesson stays upcoming until it ends, so its Meet link is still there
  // once it has started. Ticks once a minute.
  const [clock, setClock] = useState(() => Date.now());
  const [accountLoadError, setAccountLoadError] = useState("");
  // Back from saving a card with Stripe: the booking confirms by webhook, so
  // say what is happening until it shows up.
  const [cardReturn, setCardReturn] = useState<{ token: string; state: "confirming" | "confirmed" | "slow" } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [savedChoices, setSavedChoices] = useState<Slot[]>([]);
  // The lesson whose Change is open: kept aside so going back restores it and
  // Remove drops it, while the calendar offers a replacement.
  const [changingChoice, setChangingChoice] = useState<Slot | null>(null);
  // A time kept through a change of lesson on the confirmation is checked
  // against the new lesson's free times once they arrive.
  const slotRecheck = useRef("");
  const [slotNotice, setSlotNotice] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [seriesPreview, setSeriesPreview] = useState<{ bookable: string[]; skipped: string[] } | null>(null);
  const [seriesPreviewError, setSeriesPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [studentZone, setStudentZone] = useState(BOOKING_TIME_ZONE);
  const [student, setStudent] = useState<Student | null>(null);
  const isTeacher = student?.role === "teacher";

  useEffect(() => {
    // The verified account role selects the workspace, including sign-in
    // halfway through booking. Keep one teacher dashboard and one URL for it.
    if (isTeacher) window.location.replace(`${SITE_BASE_PATH}/schedule/`);
  }, [isTeacher]);
  const [recurringRates, setRecurringRates] = useState<Record<number, number>>({});
  const [rateCode, setRateCode] = useState("");
  const [rateMessage, setRateMessage] = useState("");
  const [rateWorking, setRateWorking] = useState(false);
  const [ratesReady, setRatesReady] = useState(false);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [lessonSeries, setLessonSeries] = useState<LessonSeries[]>([]);
  const [checkingSession, setCheckingSession] = useState(true);
  // The Worker treats any non-cancelled booking as the start of the student's
  // relationship with Inês, including an upcoming first lesson. Mirror that
  // exact rule here: a card the server will refuse is a trap, not a choice.
  const [hasPriorBooking, setHasPriorBooking] = useState(false);
  // Someone who has signed in on this browser before is offered sign-in and
  // no trial; a first-time visitor sees neither until the confirmation.
  const returningDevice = useSyncExternalStore(subscribeToSession, isReturningDevice, () => false);
  const [offerTrial, setOfferTrial] = useState(true);
  const [managedToken, setManagedToken] = useState("");
  const [managedSeriesId, setManagedSeriesId] = useState<string | null>(null);
  const [managedLessonTypeId, setManagedLessonTypeId] = useState("");
  const [managedLocation, setManagedLocation] = useState<"online" | "porto">("online");
  const [managed, setManaged] = useState<ManagedBooking | null>(null);
  const [manageMode, setManageMode] = useState<
    | "view"
    | "reschedule"
    | "reschedule-sequence"
    | "confirm-cancel"
    | "sequence"
    | "confirm-stop-sequence"
    | "confirm-cancel-sequence"
  >("view");
  const [manageLoading, setManageLoading] = useState(false);
  const [manageWorking, setManageWorking] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageOutcome, setManageOutcome] = useState("");
  const [managedCalendarPlaceholderHeight, setManagedCalendarPlaceholderHeight] = useState(0);
  const [showAccountSignIn, setShowAccountSignIn] = useState(false);
  const [upcomingRequestKey, setUpcomingRequestKey] = useState(0);
  const manageDialogRef = useRef<HTMLDivElement>(null);
  // Where focus goes back to when a lesson's dialog closes: the calendar day
  // (or the next-lesson row) that opened it.
  const lessonTrigger = useRef<HTMLElement | null>(null);
  const promptTrigger = useRef<HTMLElement | null>(null);
  const manageWasOpen = useRef(false);
  const managedRescheduleRef = useRef<HTMLDivElement>(null);

  const lessonType = useMemo(() => {
    const type = lessonTypes.find((item) => item.id === lessonTypeId);
    if (!type) return null;
    return form.repeat !== "once" && type.id !== "trial"
      ? { ...type, price_cents: recurringRates[type.duration_minutes] ?? type.price_cents }
      : type;
  }, [lessonTypes, lessonTypeId, form.repeat, recurringRates]);

  const rateStudentId = student?.id;
  useEffect(() => {
    let active = true;
    setRatesReady(false);
    setRecurringRates({});
    setRateCode("");
    setRateMessage("");
    if (rateStudentId) {
      fetchRecurringRates(readSession()).then((data) => {
        if (active) { setRecurringRates(data.rates); setRatesReady(true); }
      }).catch(() => {
        if (active) setRateMessage("We couldn't check your agreed rate. Please reload before booking recurring lessons.");
      });
    }
    return () => { active = false; };
  }, [rateStudentId]);

  async function applyRate() {
    const chosenType = managed ? lessonTypes.find((type) => type.id === managedLessonTypeId) : lessonType;
    if (!chosenType || rateWorking) return;
    setRateWorking(true);
    setRateMessage("");
    try {
      const data = await redeemRecurringRate(readSession(), rateCode, chosenType.duration_minutes);
      setRecurringRates(data.rates);
      setRatesReady(true);
      if (managed) setManaged({ ...managed, durationPrices: data.rates });
      setPaymentConsent(false);
      setRateCode("");
      setRateMessage("Your recurring rate is saved for future lessons of this length. Existing bookings keep their agreed price.");
    } catch (error) {
      setRateMessage(error instanceof Error ? error.message : "We couldn't apply that code. Try again.");
    } finally { setRateWorking(false); }
  }
  const managedDurationChoices = managed?.booking.lessonType.id === "trial"
    ? []
    : lessonTypes
        .filter((type) => type.id !== "trial" && [60, 90].includes(type.duration_minutes))
        .filter(
          (type, index, choices) =>
            choices.findIndex((choice) => choice.duration_minutes === type.duration_minutes) === index
        );
  const managedPaymentStatus = managed?.booking.paymentStatus ?? "not_required";
  const selectedManagedType = lessonTypes.find((type) => type.id === managedLessonTypeId);
  const managedPrice = managed && selectedManagedType
    ? selectedManagedType.id === managed.booking.lessonType.id
      ? managed.booking.amountCents ?? managed.booking.lessonType.priceCents
      : managed.durationPrices?.[selectedManagedType.duration_minutes] ?? selectedManagedType.price_cents
    : undefined;
  const isManagedReschedule = manageMode === "reschedule" || manageMode === "reschedule-sequence";
  const canChangeManagedDuration =
    managedDurationChoices.length > 1 && ["not_required", "scheduled"].includes(managedPaymentStatus);

  const refreshStudent = useCallback(async () => {
    const session = readSession();
    if (!session) {
      setStudent(null);
      setMyBookings([]);
      setLessonSeries([]);
      setHasPriorBooking(false);
      return null;
    }

    const data = await fetchMe(session);
    setStudent(data?.student ?? null);
    setMyBookings(data?.bookings ?? []);
    setLessonSeries(data?.series ?? []);
    // An unfinished card-setup hold is released by the next booking, so it is
    // not a lesson yet and must not hide the trial.
    setHasPriorBooking((data?.bookings ?? []).some((booking) => booking.status === "confirmed"));
    return data;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = portoDateKey(new Date());
    setTodayKey(key);
    setStudentZone(browserTimeZone());
    const returningFromCard = params.get("card") === "saved";
    if (returningFromCard) {
      setCardReturn({ token: params.get("manage") ?? "", state: "confirming" });
      params.delete("card");
      params.delete("manage");
      window.history.replaceState({}, "", `/book/${params.toString() ? `?${params}` : ""}`);
    }
    if (initialLessonsView || returningFromCard || params.get("view") === "lessons") {
      setIntent("lessons");
      setUpcomingRequestKey((current) => current + 1);
      if (!readSession()) setShowAccountSignIn(true);
    } else if (params.get("view") === "book" || params.get("lesson")) {
      setIntent("book");
      if (params.get("lesson") === "single" || params.get("lesson") === "long") {
        setPreferredLessonTypeId(params.get("lesson") ?? "");
      }
      if (params.get("lesson") === "trial" && !isReturningDevice()) {
        setBookingKind("trial");
        setSavedChoices([]);
        setLessonTypeId("trial");
      }
    }

    listLessonTypes()
      .then(({ lessonTypes: types, postpay: postpayOn, paymentReady }) => {
        setLessonTypes(types);
        if (paymentReady === false || (postpayOn && !STRIPE_PUBLISHABLE_READY)) {
          setPostpay(false);
          setPaymentConfigurationError(
            "Online payment is temporarily unavailable, so booking is paused. Please message Inês instead."
          );
          return;
        }
        setPaymentConfigurationError("");
        setPostpay(Boolean(postpayOn));
      })
      .catch((error: Error) => setLoadError(error.message));

    // `fetchMe` already clears a genuinely invalid session on a 401. A network
    // interruption (including a quick reload while this request is in flight)
    // must not sign the student out as a side effect.
    refreshStudent()
      .then((data) => {
        // Returning students came here for their next commitment, not for a
        // fork asking whether they want to see it. Explicit lesson, sign-in,
        // and emailed-management URLs retain their own destination.
        if (
          data?.student &&
          !["lessons", "book"].includes(params.get("view") ?? "") &&
          !params.get("lesson") &&
          !params.has("manage") &&
          !params.has("token") &&
          !params.has("emailToken")
        ) {
          setIntent("lessons");
          setCalendarWeekCount(4);
          setStep("day");
          setUpcomingRequestKey((current) => current + 1);
        } else if (!data?.student) {
          // Anyone not signed in came to book, so the calendar opens ready to
          // book, with the account a click away. Explicit destinations keep
          // their own view.
          setIntent((current) => (current === "choose" ? "book" : current));
        }
      })
      .catch(() => {
        // Still holding a session means the account could not be reached, not
        // that nobody is signed in. Say so instead of offering a sign-in form.
        if (readSession()) setAccountLoadError("We couldn’t reach your account just now. Please check your connection and try again.");
        else setIntent((current) => (current === "choose" ? "book" : current));
      })
      .finally(() => setCheckingSession(false));
  }, [initialLessonsView, refreshStudent]);

  // Link creation can finish just after booking confirmation. Refresh the
  // affected lesson a few times without extending the booking request itself.
  const awaitingMeetToken = confirmation?.location === "online" && !confirmation.meetingUrl
    ? confirmation.manageToken
    : managed?.booking.location === "online" && managed.booking.status === "confirmed" && !managed.booking.meetingUrl
      ? managedToken : "";
  useEffect(() => {
    if (!awaitingMeetToken) return;
    let active = true;
    async function refreshMeeting() {
      try {
        const result = await fetchBooking(awaitingMeetToken);
        if (!active) return;
        setConfirmation(current => current?.manageToken === awaitingMeetToken
          ? { ...current, meetingUrl: result.booking.meetingUrl, location: result.booking.location } : current);
        setManaged(current => current?.booking.reference === result.booking.reference ? result : current);
        if (result.booking.meetingUrl) void refreshStudent();
      } catch { /* The existing booking remains usable during a network delay. */ }
    }
    const timers = [3000, 10000, 30000, 65000, 125000].map(delay => window.setTimeout(() => void refreshMeeting(), delay));
    return () => { active = false; timers.forEach(timer => window.clearTimeout(timer)); };
  }, [awaitingMeetToken, refreshStudent]);

  // Signing in mid-flow can reveal a history the lesson step didn't know
  // about. If the trial is the current choice, dissolve it and put the real
  // choices back in the same place. A large warning makes an eligibility rule
  // feel like the student's mistake; the unavailable option simply leaves.
  useEffect(() => {
    if (!hasPriorBooking || lessonTypeId !== "trial") return;
    const regular = lessonTypes.filter((type) => type.id !== "trial");
    const fallback = regular.find((type) => type.id === preferredLessonTypeId)?.id ?? regular[0]?.id ?? "";
    transitionBooking(() => {
      setBookingKind("once");
      setLessonTypeId(fallback);
      setSelectedSlot("");
      setSavedChoices([]);
      setStep((current) => (current === "details" ? "time" : current));
    });
  }, [hasPriorBooking, lessonTypeId, lessonTypes, preferredLessonTypeId]);

  // Booking opens ready to use. A first visit starts from the trial; anyone else gets
  // a single lesson of the length they came for (or the first on offer). Each
  // choice then changes in place, in the bar above the calendar.
  useEffect(() => {
    if (intent !== "book" || managed || bookingKind || !lessonTypes.length || checkingSession) return;
    // Settled as booking opens, so creating an account at the confirmation
    // keeps the trial someone is in the middle of booking.
    const trialOffered = !student && !isReturningDevice();
    const choice = defaultLessonChoice(trialOffered);
    setOfferTrial(trialOffered);
    setBookingKind(choice.kind);
    setLessonTypeId(choice.typeId);
    setForm((current) => ({ ...current, repeat: "once" }));
  // defaultLessonChoice reads the same state listed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, managed, bookingKind, lessonTypes, checkingSession, hasPriorBooking, preferredLessonTypeId, student]);

  const openManaged = useCallback(async (
    token: string,
    seriesId: string | null = null,
    initialMode: "view" | "sequence" = "view"
  ) => {
    if (!token) return;
    setIntent("lessons");
    setManagedToken(token);
    setManagedSeriesId(seriesId);
    setManagedLessonTypeId("");
    setManageLoading(true);
    setManageError("");
    setManageOutcome("");
    setManagedCalendarPlaceholderHeight(0);
    setManageMode(initialMode);
    setSelectedSlot("");
    try {
      const result = await fetchBooking(token);
      transitionBooking(() => {
        setManaged(result);
        setManagedLessonTypeId(result.booking.lessonType.id);
        setManagedLocation(result.booking.location);
        setSelectedDate(portoDateKey(new Date(result.booking.startAt)));
        setManageMode(initialMode);
        setManageLoading(false);
      });
    } catch (caught) {
      transitionBooking(() => {
        setManaged(null);
        setManagedLessonTypeId("");
        setManageError(caught instanceof Error ? caught.message : "That lesson could not be opened.");
        setManageLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    if (initialManageToken) openManaged(initialManageToken);
  }, [initialManageToken, openManaged]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (cardReturn?.state !== "confirming") return;
    const token = cardReturn.token;
    let active = true;
    let attempts = 0;
    let timer = 0;
    const check = async () => {
      attempts += 1;
      try {
        const confirmed = token
          ? (await fetchBooking(token)).booking.status === "confirmed"
          : !((await refreshStudent())?.bookings ?? []).some((booking) => String(booking.status) === "pending_payment");
        if (!active) return;
        if (confirmed) {
          setCardReturn((current) => current && { ...current, state: "confirmed" });
          setUpcomingRequestKey((current) => current + 1);
          void refreshStudent();
          return;
        }
      } catch {
        // A dropped request is retried on the next tick.
      }
      if (!active) return;
      if (attempts >= 16) {
        setCardReturn((current) => current && { ...current, state: "slow" });
        return;
      }
      timer = window.setTimeout(check, 2500);
    };
    timer = window.setTimeout(check, 600);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cardReturn?.state, cardReturn?.token, refreshStudent]);

  const availabilityLessonTypeId =
    isManagedReschedule && managed
      ? managedLessonTypeId || managed.booking.lessonType.id
      : lessonTypeId;

  // The lesson being moved, so availability does not count it against itself.
  const movingToken = manageMode === "reschedule" ? managedToken : "";
  const movingSeriesId = manageMode === "reschedule-sequence"
    ? managedSeriesId ?? myBookings.find((booking) => booking.manageToken === managedToken)?.seriesId ?? ""
    : "";

  const loadAvailability = useCallback(
    (signal?: AbortSignal) => {
      if (!availabilityLessonTypeId || !todayKey) {
        setSlotsByDate({});
        setLoadingSlots(false);
        return;
      }

      setLoadingSlots(true);
      setLoadError("");

      /*
       * Ask for more than the horizon and let the Worker clamp it, rather than
       * hard-coding a window that has to be remembered every time the horizon
       * moves. It was fixed at 62 days while the grid was sized from whatever
       * horizon the API reported — so raising the horizon past 62 would have
       * drawn weeks of empty cells announcing "no times free", which would have
       * been a lie rather than a gap.
       */
      fetchAvailability(availabilityLessonTypeId, todayKey, addDaysToKey(todayKey, 140), signal, {
        manageToken: movingToken,
        seriesId: movingSeriesId,
        session: movingSeriesId ? readSession() : ""
      })
        .then((data) => {
          setSlotsByDate(data.slotsByDate);
          setHorizonDays(data.horizonDays || BOOKING_HORIZON_DAYS_FALLBACK);
          setLessonGapMinutes(Math.max(0, Number(data.bufferMinutes) || 0));
        })
        .catch((error: Error) => {
          if (signal?.aborted) return;
          setSlotsByDate({});
          setLoadError(error.message);
        })
        .finally(() => {
          if (!signal?.aborted) setLoadingSlots(false);
        });
    },
    // availabilityRequest is a deliberate trigger: see where it is declared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availabilityLessonTypeId, todayKey, availabilityRequest, movingToken, movingSeriesId]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadAvailability(controller.signal);
    return () => controller.abort();
  }, [loadAvailability]);

  const calendarBookings = myBookings
    .filter((booking) => booking.status === "confirmed" && Date.parse(booking.endAt) > clock)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  if (
    managed &&
    !managed.isPast &&
    managed.booking.status === "confirmed" &&
    !calendarBookings.some((booking) => booking.reference === managed.booking.reference)
  ) {
    calendarBookings.push({
      reference: managed.booking.reference,
      status: managed.booking.status,
      startAt: managed.booking.startAt,
      endAt: managed.booking.endAt,
      location: managed.booking.location,
      notes: managed.booking.notes,
      lessonType: managed.booking.lessonType,
      isPast: managed.isPast,
      sameDayFeeApplies: managed.sameDayFeeApplies,
      sameDayFeeAutomatic: managed.sameDayFeeAutomatic,
      changeLocked: managed.changeLocked,
      paymentStatus: managed.booking.paymentStatus,
      seriesId: null,
      manageToken: managedToken
    });
  }
  const activeLessonSeriesIds = new Set(lessonSeries.map((entry) => entry.id));
  const isWeeklyLesson = (booking: MyBooking) => Boolean(booking.seriesId && activeLessonSeriesIds.has(booking.seriesId));
  const nextLesson = calendarBookings[0] ?? null;
  // A returning student books where their latest lesson was.
  const lastLocation: "online" | "porto" = [...myBookings]
    .filter((booking) => booking.status === "confirmed")
    .sort((a, b) => b.startAt.localeCompare(a.startAt))[0]?.location === "porto" ? "porto" : "online";

  const allBookingsByDate = calendarBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const isLessonsCalendarOverview = intent === "lessons" && !isManagedReschedule;
  const allCalendarWeeks = todayKey ? buildBookingWeeks(todayKey, horizonDays) : [];
  const firstRelevantWeek = allCalendarWeeks.findIndex((week) =>
    week.cells.some((cell) => Boolean(slotsByDate[cell.key]?.length || allBookingsByDate[cell.key]?.length))
  );
  const currentWeekHasBooking = Boolean(
    allCalendarWeeks[0]?.cells.some((cell) => Boolean(allBookingsByDate[cell.key]?.length))
  );
  const todayWeekday = todayKey ? new Date(`${todayKey}T12:00:00Z`).getUTCDay() : -1;
  const startsOnClosedWeekend = (todayWeekday === 0 || todayWeekday === 6) && !currentWeekHasBooking;
  const uncappedCalendarWeeks =
    availabilityLessonTypeId && firstRelevantWeek > 0
      ? allCalendarWeeks.slice(firstRelevantWeek).map((week, index) =>
          index === 0 && !week.showMonth ? { ...week, showMonth: true } : week
        )
      : !availabilityLessonTypeId && startsOnClosedWeekend
        ? allCalendarWeeks.slice(1).map((week, index) =>
            index === 0 && !week.showMonth ? { ...week, showMonth: true } : week
          )
      : allCalendarWeeks;
  // Booking offers the whole horizon, four weeks at a time. The inclusive
  // range can touch one more Monday–Sunday row than the horizon has weeks;
  // that partial row is not shown.
  const horizonWeekCount = Math.ceil(horizonDays / 7);
  const bookingRangeWeeks = uncappedCalendarWeeks.slice(0, horizonWeekCount);
  // Your lessons pages the same way, from this week through the horizon or to
  // the last booked lesson if that is later (an ongoing run is kept twelve
  // weeks ahead), so every lesson can be reached from the calendar.
  const lastLessonKey = calendarBookings.length
    ? portoDateKey(new Date(calendarBookings[calendarBookings.length - 1].startAt))
    : "";
  const lessonsRangeWeeks = todayKey
    ? buildBookingWeeks(todayKey, Math.max(horizonDays, lastLessonKey ? daysBetween(todayKey, lastLessonKey) : 0))
        .filter((week, index) => index < horizonWeekCount || week.cells[0].key <= lastLessonKey)
    : [];
  const rangeWeeks = isLessonsCalendarOverview ? lessonsRangeWeeks : bookingRangeWeeks;
  const calendarPages: BookingWeek[][] = [];
  for (let index = 0; index < rangeWeeks.length; index += CALENDAR_PAGE_WEEKS) {
    calendarPages.push(
      rangeWeeks
        .slice(index, index + CALENDAR_PAGE_WEEKS)
        .map((week, position) => (position === 0 && !week.showMonth ? { ...week, showMonth: true } : week))
    );
  }
  const pageAnchor = calendarPageStart || (selectedDate ? portoWeekKey(`${selectedDate}T12:00:00Z`) : "");
  const calendarPageIndex = Math.max(
    0,
    pageAnchor ? calendarPages.findIndex((page) => page.some((week) => week.key === pageAnchor)) : 0
  );
  const pagedCalendarWeeks = calendarPages[calendarPageIndex] ?? [];
  const pageFirstKey = pagedCalendarWeeks[0]?.cells[0]?.key ?? "";
  const pageLastKey = pagedCalendarWeeks.at(-1)?.cells.at(-1)?.key ?? "";
  const laterLessonCount = isLessonsCalendarOverview && pageLastKey
    ? calendarBookings.filter((booking) => portoDateKey(new Date(booking.startAt)) > pageLastKey).length
    : 0;
  const selectedCalendarWeek = selectedDate
    ? rangeWeeks.find((week) => week.cells.some((cell) => cell.key === selectedDate))
    : undefined;
  const visibleCalendarWeekCount = calendarWeekCount === 1 && !selectedCalendarWeek ? CALENDAR_PAGE_WEEKS : calendarWeekCount;
  const restrictedWeek = !managed && bookingKind === "recurring" && savedChoices.length
    ? portoWeekKey(savedChoices[0].startAt) : "";
  const displayedCalendarWeeks = restrictedWeek
    ? rangeWeeks.filter((week) => week.key === restrictedWeek).map((week) => ({ ...week, showMonth: true }))
    : visibleCalendarWeekCount === 1 && selectedCalendarWeek
      ? [{ ...selectedCalendarWeek, showMonth: true }]
      : pagedCalendarWeeks;
  const returnCalendarWeekCount = visibleCalendarWeekCount === 1 ? CALENDAR_PAGE_WEEKS : null;
  const shownFirstKey = displayedCalendarWeeks[0]?.cells[0]?.key ?? "";
  const shownLastKey = displayedCalendarWeeks.at(-1)?.cells.at(-1)?.key ?? "";
  const calendarRangeLabel = shownFirstKey ? `${formatDayMonth(shownFirstKey)} – ${formatDayMonth(shownLastKey)}` : "";
  const visibleCalendarDates = new Set(displayedCalendarWeeks.flatMap((week) => week.cells.map((cell) => cell.key)));
  const calendarWindowBookings = calendarBookings.filter((booking) =>
    visibleCalendarDates.has(portoDateKey(new Date(booking.startAt)))
  );
  const bookingsByDate = calendarWindowBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const selectionWeek = !managed && bookingKind === "recurring" && savedChoices.length
    ? portoWeekKey(savedChoices[0].startAt) : "";
  const lessonGapMs = lessonGapMinutes * 60000;
  const selectableSlots = (date: string) => (slotsByDate[date] ?? []).filter((slot) => managed || intent !== "book" || (
    (!selectionWeek || portoWeekKey(slot.startAt) === selectionWeek) &&
    !savedChoices.some((choice) =>
      Date.parse(choice.startAt) < Date.parse(slot.endAt) + lessonGapMs &&
      Date.parse(choice.endAt) + lessonGapMs > Date.parse(slot.startAt))
  ));
  const rawDaySlots = selectedDate ? selectableSlots(selectedDate) : [];
  // The first free time on each of the next few free days, for anyone who
  // simply wants the soonest lesson.
  const soonestSlots: Slot[] = [];
  if (intent === "book" && !managed && !selectedDate && !loadingSlots) {
    for (const cell of (restrictedWeek ? displayedCalendarWeeks : rangeWeeks).flatMap((week) => week.cells)) {
      if (soonestSlots.length === 3) break;
      const first = selectableSlots(cell.key)[0];
      if (first) soonestSlots.push(first);
    }
  }
  const managedDate = managed ? portoDateKey(new Date(managed.booking.startAt)) : "";
  const shouldShowCurrentManagedSlot = Boolean(
    managed &&
    isManagedReschedule &&
    selectedDate === managedDate &&
    (managedLessonTypeId || managed.booking.lessonType.id) === managed.booking.lessonType.id &&
    !rawDaySlots.some((slot) => slot.startAt === managed.booking.startAt)
  );
  const daySlots = shouldShowCurrentManagedSlot && managed
    ? [
        ...rawDaySlots,
        { startAt: managed.booking.startAt, endAt: managed.booking.endAt }
      ].sort((a, b) => a.startAt.localeCompare(b.startAt))
    : rawDaySlots;
  // The halves a day's times split into are named the same every day: from
  // the earliest start anywhere in the loaded weeks to the latest.
  const startSpan = useMemo(() => {
    const clocks = [...Object.values(slotsByDate).flat(), ...daySlots].map((slot) => formatSlotTime(slot.startAt)).sort();
    return { first: clocks[0] ?? "", last: clocks[clocks.length - 1] ?? "" };
  }, [slotsByDate, daySlots]);
  // A refreshed availability response must not erase a date from the review
  // after a failed submission. Keep it visible so the student can change it.
  const reviewedSlot = useMemo(() => step === "details" && selectedSlot && lessonType && !managed
    ? { startAt: selectedSlot, endAt: new Date(Date.parse(selectedSlot) + lessonType.duration_minutes * 60000).toISOString() }
    : null, [step, selectedSlot, lessonType, managed]);
  const chosen = daySlots.find((slot) => slot.startAt === selectedSlot) ?? reviewedSlot;
  const bookingChoices = useMemo(() => [...savedChoices, ...(chosen ? [chosen] : [])].sort((a, b) => a.startAt.localeCompare(b.startAt)), [savedChoices, chosen]);
  // Choosing a replacement time, or any reset of the selection, ends a change.
  const activeChange = changingChoice && !selectedSlot && savedChoices.length ? changingChoice : null;
  const choiceStarts = useMemo(() => bookingChoices.map((choice) => choice.startAt), [bookingChoices]);
  const choiceKey = choiceStarts.join(",");
  const selectedDayBookings = selectedDate ? bookingsByDate[selectedDate] ?? [] : [];
  const isConfirmingBooking = step === "details" && Boolean(lessonType && chosen) && !managed;
  const needsLessonsSignIn = intent === "lessons" && showAccountSignIn && !student;
  const showWorkflowCalendar =
    !isConfirmingBooking &&
    !needsLessonsSignIn &&
    ((intent === "lessons" && accountView === "upcoming") ||
      Boolean(intent === "book" && lessonType) ||
      Boolean(managed));
  // Booking with a day chosen: the times sit beside the calendar, or on a
  // phone take its place.
  const bookingDateChosen = intent === "book" && !managed && Boolean(selectedDate && lessonType);
  const resolvedManagedSeriesId = managedSeriesId ?? myBookings.find((booking) => booking.manageToken === managedToken)?.seriesId ?? null;
  const activeManagedSeries = resolvedManagedSeriesId
    ? lessonSeries.find((entry) => entry.id === resolvedManagedSeriesId) ?? null
    : null;
  const manageDialogOpen = Boolean(manageLoading || manageError || managed);
  const regularLessonTypes = lessonTypes.filter((type) => type.id !== "trial");
  const trialLessonType = lessonTypes.find((type) => type.id === "trial") ?? null;
  const panelMotionKey = showAccountSignIn && !student
    ? "sign-in"
    : managed && isManagedReschedule
      ? `managed-${managed.booking.reference}-reschedule`
      : `calendar-${selectedDate || "none"}-${lessonTypeId || "none"}`;

  /*
   * Which weeks a repeat would actually take, asked for before anything is
   * booked. A student who picks eight weeks and gets seven should learn that
   * while they can still change their mind, not from the confirmation email.
   */
  useEffect(() => {
    const repeat = repeatPayload(form.repeat);
    if (repeat === undefined || !chosen || !lessonType) {
      setSeriesPreview(null);
      setSeriesPreviewError("");
      setPreviewing(false);
      return;
    }

    let cancelled = false;
    setSeriesPreviewError("");
    setPreviewing(true);

    Promise.all(choiceStarts.map((startAt) => previewSeries(readSession(), { lessonType: lessonType.id, startAt, weeks: repeat })))
      .then((results) => {
        if (cancelled) return;
        setSeriesPreview({ bookable: results.flatMap((result) => result.bookable).sort(), skipped: results.flatMap((result) => result.skipped).sort() });
      })
      .catch(() => {
        // The confirm step re-checks every week anyway, so a failed preview
        // costs a reassurance, not correctness.
        if (!cancelled) {
          setSeriesPreview(null);
          setSeriesPreviewError("We couldn't check the later weeks just now. Nothing is booked until you confirm.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.repeat, chosen, lessonType, choiceStarts]);

  useEffect(() => { setPaymentConsent(false); }, [choiceKey, lessonType?.id, lessonType?.price_cents, form.location, form.repeat]);

  const needsPaymentConsent = postpay;
  const canSubmit =
    Boolean(chosen && lessonType && student) &&
    !submitting &&
    !rateWorking &&
    (form.repeat === "once" || ratesReady) &&
    !previewing &&
    !loadingSlots &&
    !paymentConfigurationError &&
    (!needsPaymentConsent || paymentConsent);

  useEffect(() => {
    const kept = slotRecheck.current;
    if (!kept || loadingSlots || step !== "details") return;
    slotRecheck.current = "";
    if ((slotsByDate[selectedDate] ?? []).some((slot) => slot.startAt === kept)) return;
    setSelectedSlot("");
    setSlotNotice(`${formatSlotTime(kept)} is not free for this lesson. Choose another time.`);
    goTo("time");
  }, [loadingSlots, slotsByDate, selectedDate, step]);

  useEffect(() => {
    if (!isConfirmingBooking) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("booking-step-heading")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isConfirmingBooking]);

  /*
   * The confirmation mounts its region and its text in one commit, which is the
   * case a live region is least reliable at announcing. Moving focus to the
   * heading is what the step changes already do, and it works here for the same
   * reason: it says the thing and puts the reader at the top of it.
   */
  useEffect(() => {
    if (!confirmation) return;
    const frame = requestAnimationFrame(() => document.getElementById("booking-success-heading")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirmation]);

  function goTo(next: Step) {
    setStep(next);
    setSubmitError("");
    if (next === "details") {
      // The selected cards are now the review itself, so reveal their top.
      // Focus moves to the confirmation heading separately without dragging
      // the viewport past the choices the student has just made.
      orientTo("booking-confirmation-stage");
    } else if (next === "time") {
      orientTo("booking-next-step", false, true);
    } else if (next === "day") {
      orientTo("lesson-calendar");
    }
  }

  /** The lesson a booking starts from: the trial for a first-time visitor. */
  function defaultLessonChoice(trialOffered: boolean): { kind: Exclude<BookingKind, "">; typeId: string } {
    const trial = lessonTypes.find((type) => type.id === "trial");
    const regular = lessonTypes.filter((type) => type.id !== "trial");
    if (trial && trialOffered && !hasPriorBooking && !preferredLessonTypeId) return { kind: "trial", typeId: trial.id };
    return { kind: "once", typeId: regular.find((type) => type.id === preferredLessonTypeId)?.id ?? regular[0]?.id ?? "" };
  }

  function startBookingJourney(date = "") {
    const trialOffered = !student && !isReturningDevice();
    const choice = lessonTypes.length ? defaultLessonChoice(trialOffered) : null;
    transitionBooking(() => {
      setIntent("book");
      setOfferTrial(trialOffered);
      setShowAccountSignIn(false);
      setManaged(null);
      setManagedToken("");
      setManagedLessonTypeId("");
      setManageMode("view");
      setBookingKind(choice?.kind ?? "");
      setLessonTypeId(choice?.typeId ?? "");
      setSelectedDate(date);
      setSelectedSlot("");
      setSavedChoices([]);
      setChangingChoice(null);
      setSlotNotice("");
      setCalendarWeekCount(CALENDAR_PAGE_WEEKS);
      setCalendarPageStart("");
      setStep(date ? "time" : "day");
      setForm({ ...emptyForm, location: lastLocation });
    });
    orientTo("booking-bar-heading", true);
  }

  /** A booked lesson opens straight into its details, over the calendar. */
  function openBookedLesson(booking: MyBooking, trigger: HTMLElement | null = null) {
    lessonTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const seriesId = booking.seriesId && activeLessonSeriesIds.has(booking.seriesId) ? booking.seriesId : null;
    transitionBooking(() => {
      void openManaged(booking.manageToken, seriesId);
    });
  }

  function turnCalendarPage(step: number) {
    const page = calendarPages[calendarPageIndex + step];
    if (!page) return;
    transitionBooking(() => setCalendarPageStart(page[0].key));
  }

  function openLessonsJourney() {
    transitionBooking(() => {
      setIntent("lessons");
      setAccountView("upcoming");
      closeManagedLesson();
      setBookingKind("");
      setLessonTypeId("");
      setSelectedSlot("");
      setSavedChoices([]);
      setCalendarWeekCount(4);
      setCalendarPageStart("");
      setUpcomingRequestKey((current) => current + 1);
      setStep("day");
      setShowAccountSignIn(!student);
      setSelectedDate("");
    });
    if (!student) orientTo("booking-lessons-sign-in", true);
  }

  function resetJourneyToStart() {
    closeManagedLesson();
    setIntent("book");
    setShowAccountSignIn(false);
    setBookingKind("");
    setLessonTypeId("");
    setSelectedDate("");
    setSelectedSlot("");
    setSavedChoices([]);
    setCalendarWeekCount(4);
    setCalendarPageStart("");
    setStep("day");
    setPayment(null);
    setPaymentError("");
    setPaymentConsent(false);
  }

  function returnToJourneyStart() {
    if (student) {
      openLessonsJourney();
      return;
    }
    transitionBooking(resetJourneyToStart);
    orientTo("lesson-calendar");
  }

  function openAccountShortcut(section: "upcoming" | "history" | "profile") {
    closeManagedLesson();
    setIntent("lessons");
    setAccountView(section);
    setShowAccountSignIn(false);
    setBookingKind("");
    setLessonTypeId("");
    setSelectedSlot("");
    setSavedChoices([]);
    setCalendarWeekCount(4);
    setCalendarPageStart("");
    setStep("day");
    setPayment(null);
    setPaymentError("");
    setSelectedDate("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !chosen || !lessonType) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const repeat = repeatPayload(form.repeat);
      const result = await createBooking(readSession(), {
        notes: form.notes.trim(),
        lessonType: lessonType.id,
        startAt: chosen.startAt,
        ...(choiceStarts.length > 1 ? { startAts: choiceStarts } : {}),
        location: form.location,
        timezone: studentZone,
        paymentConsent,
        expectedPriceCents: lessonType.price_cents,
        // Omitted entirely for a one-off: `null` means "every week" on the wire.
        ...(repeat === undefined ? {} : { repeat })
      });

      // A first booking is held while Stripe saves and authenticates a card.
      // This setup step does not charge it; the webhook then confirms the slot.
      if (result.checkoutClientSecret) {
        if (STRIPE_PUBLISHABLE_READY) {
          setPaymentError("");
          setPayment({ clientSecret: result.checkoutClientSecret });
          return;
        }
        setSubmitError("Payment isn't available just now. Please try again in a few minutes, or message Inês.");
        return;
      }
      if (result.checkoutUrl) {
        window.location.assign(stripePaymentUrl(result.checkoutUrl));
        return;
      }

      transitionBooking(() =>
        setConfirmation({
          meetingUrl: result.booking.meetingUrl,
          location: result.booking.location,
          reference: result.booking.reference,
          startAt: result.booking.startAt,
          manageUrl: result.manageUrl ?? "/book/?view=lessons",
          manageToken: result.manageToken ?? "",
          email: result.booking.studentEmail,
          series: result.series,
          selection: result.selection
        })
      );
      void refreshStudent();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The booking could not be created.";
      setSubmitError(message);
      if (/taken|available/i.test(message)) {
        loadAvailability();
        if (bookingChoices.length === 1) goTo("time");
      }
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * The dialog can sit open while the 14-hour line passes. Look again before
   * acting, so a fee that has just started to apply is shown, not surprised on.
   */
  async function feeStillAsShown() {
    if (!managedToken || !managed || managed.sameDayFeeApplies) return true;
    const fresh = await fetchBooking(managedToken);
    if (!fresh.sameDayFeeApplies) return true;
    setManaged(fresh);
    setManageError(
      `This lesson is now less than ${NOTICE_HOURS} hours away, so this change costs ${formatMoneyCents(fresh.booking.sameDayFeeCents)}. Check the details and confirm again.`
    );
    return false;
  }

  function lateFeeNote(applied: boolean, cents: number) {
    if (!applied) return "";
    return managed?.sameDayFeeAutomatic
      ? ` The ${formatMoneyCents(cents)} late change fee will be charged automatically.`
      : ` A ${formatMoneyCents(cents)} late change fee applies.`;
  }

  async function moveManagedLesson() {
    if (!managedToken || !selectedSlot || !managed) return;
    setManageWorking(true);
    setManageError("");
    try {
      const previousLessonTypeId = managed.booking.lessonType.id;
      const movingSequence = manageMode === "reschedule-sequence";
      if (!movingSequence && !(await feeStillAsShown())) return;
      let sameDayFeeApplied = false;
      let keptStarts: string[] = [];
      if (movingSequence) {
        if (!resolvedManagedSeriesId) throw new Error("That recurring lesson could not be found.");
        const moved = await rescheduleSeries(
          readSession(),
          resolvedManagedSeriesId,
          selectedSlot,
          managedLessonTypeId || previousLessonTypeId,
          managedLocation,
          managedPrice
        );
        keptStarts = moved.kept ?? [];
      } else {
        const result = await rescheduleBooking(
          managedToken,
          selectedSlot,
          managedLessonTypeId || previousLessonTypeId,
          managedLocation,
          managedPrice
        );
        sameDayFeeApplied = result.sameDayFeeApplied;
      }
      const refreshed = await fetchBooking(managedToken);
      transitionBooking(() => {
        setManaged(refreshed);
        setManagedLessonTypeId(refreshed.booking.lessonType.id);
        setManagedLocation(refreshed.booking.location);
        setSelectedDate(portoDateKey(new Date(refreshed.booking.startAt)));
        setSelectedSlot("");
        setManageMode("view");
        setManageOutcome(
          movingSequence
            ? `Your upcoming recurring lessons have moved. We’ve emailed you and updated your calendar.${
                keptStarts.length
                  ? ` ${keptStarts.map((startAt) => `${formatLongDate(startAt)} at ${formatSlotTime(startAt)}`).join(" and ")} stays where it is, as it’s less than ${NOTICE_HOURS} hours away.`
                  : ""
              }`
            : refreshed.booking.lessonType.id === previousLessonTypeId
            ? `Your lesson has been moved. We’ve emailed you and updated your calendar.${lateFeeNote(sameDayFeeApplied, refreshed.booking.sameDayFeeCents)}`
            : `Your lesson is now ${formatBookedLessonLabel(refreshed.booking.lessonType)}. We’ve emailed you and updated your calendar.${lateFeeNote(sameDayFeeApplied, refreshed.booking.sameDayFeeCents)}`
        );
      });
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : "That lesson could not be moved.");
      loadAvailability();
    } finally {
      setManageWorking(false);
    }
  }

  async function cancelManagedLesson() {
    if (!managedToken || !managed) return;
    setManageWorking(true);
    setManageError("");
    try {
      if (!(await feeStillAsShown())) {
        setManageMode("view");
        return;
      }
      const result = await cancelBooking(managedToken);
      transitionBooking(() => {
        setManaged({ ...managed, booking: result.booking });
        setManageMode("view");
        setManageOutcome(
          result.booking.paymentStatus === "refunded"
            ? "Your lesson has been cancelled. Your refund is on its way back to your card."
            : `Your lesson has been cancelled. We’ve emailed you and updated your calendar.${lateFeeNote(result.sameDayFeeApplied, result.booking.sameDayFeeCents)}`
        );
      });
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : "That lesson could not be cancelled.");
    } finally {
      setManageWorking(false);
    }
  }

  async function stopManagedSequence(cancelRemaining = false) {
    if (!resolvedManagedSeriesId) return;
    setManageWorking(true);
    setManageError("");
    try {
      const result = await stopSeries(readSession(), resolvedManagedSeriesId, cancelRemaining);
      transitionBooking(() => {
        setManageMode("view");
        if (!cancelRemaining) {
          setManageOutcome("This sequence has stopped. The lessons already booked stay in your calendar.");
          return;
        }

        const cancelledLessons = `${result.cancelled} ${result.cancelled === 1 ? "lesson" : "lessons"}`;
        setManageOutcome(
          result.pendingRefunds
            ? `This sequence has stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled. ${result.pendingRefunds === 1 ? "1 refund is" : `${result.pendingRefunds} refunds are`} being confirmed; ${result.pendingRefunds === 1 ? "that lesson stays" : "those lessons stay"} reserved and locked until then.`
            : result.kept
            ? `This sequence has stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled. Any lesson less than ${NOTICE_HOURS} hours away, or with a payment still going through, stays booked; check your calendar.`
            : result.cancelled
              ? `This sequence has stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled.`
              : "This sequence has stopped. There were no future booked lessons to cancel."
        );
      });
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : cancelRemaining ? "Those lessons could not be cancelled." : "That sequence could not be stopped.");
    } finally {
      setManageWorking(false);
    }
  }

  const closeManagedLesson = useCallback(() => {
    setManaged(null);
    setManagedToken("");
    setManagedSeriesId(null);
    setManagedLessonTypeId("");
    setManagedLocation("online");
    setManageMode("view");
    setManageError("");
    setManageOutcome("");
    setManagedCalendarPlaceholderHeight(0);
    setSelectedSlot("");
    setSelectedDate("");
    setCalendarWeekCount(4);
    if (new URLSearchParams(window.location.search).has("manage")) {
      window.history.replaceState({}, "", "/book/");
    }
  }, []);

  const returnFromManagedLesson = useCallback(() => {
    transitionBooking(() => {
      closeManagedLesson();
      setUpcomingRequestKey((current) => current + 1);
    });
  }, [closeManagedLesson]);

  useEffect(() => {
    if (manageDialogOpen) {
      manageWasOpen.current = true;
      return;
    }
    if (!manageWasOpen.current) return;
    manageWasOpen.current = false;
    const trigger = lessonTrigger.current;
    lessonTrigger.current = null;
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  }, [manageDialogOpen]);

  const dismissManagedDialog = useCallback(() => {
    if (manageWorking) return;
    if (manageOutcome && student) {
      returnFromManagedLesson();
      return;
    }
    transitionBooking(closeManagedLesson);
  }, [closeManagedLesson, manageOutcome, manageWorking, returnFromManagedLesson, student]);

  useEffect(() => {
    if (!manageDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      if (isManagedReschedule) managedRescheduleRef.current?.focus({ preventScroll: true });
      else manageDialogRef.current?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissManagedDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dismissManagedDialog, isManagedReschedule, manageDialogOpen]);

  function beginManagedReschedule() {
    if (!managed) return;
    const managedDate = portoDateKey(new Date(managed.booking.startAt));
    const isInCalendar = bookingRangeWeeks.some((week) => week.cells.some((cell) => cell.key === managedDate));
    const calendarHeight = managedRescheduleRef.current?.getBoundingClientRect().height ?? 0;
    transitionBooking(() => {
      setManagedCalendarPlaceholderHeight(calendarHeight);
      setCalendarPageStart(isInCalendar ? portoWeekKey(managed.booking.startAt) : "");
      setAvailabilityRequest((current) => current + 1);
      setManageMode("reschedule");
      setManagedLessonTypeId(managed.booking.lessonType.id);
      setManagedLocation(managed.booking.location);
      setSelectedDate(isInCalendar ? managedDate : "");
      setSelectedSlot(isInCalendar ? managed.booking.startAt : "");
      setCalendarWeekCount(isInCalendar ? 1 : 4);
      setManageError("");
      setLoadingSlots(true);
    });
  }

  function beginManagedSeriesReschedule() {
    if (!managed || !activeManagedSeries) return;
    const managedDate = portoDateKey(new Date(managed.booking.startAt));
    const isInCalendar = bookingRangeWeeks.some((week) => week.cells.some((cell) => cell.key === managedDate));
    const calendarHeight = managedRescheduleRef.current?.getBoundingClientRect().height ?? 0;
    transitionBooking(() => {
      setManagedCalendarPlaceholderHeight(calendarHeight);
      setCalendarPageStart(isInCalendar ? portoWeekKey(managed.booking.startAt) : "");
      setAvailabilityRequest((current) => current + 1);
      setManageMode("reschedule-sequence");
      setManagedLessonTypeId(managed.booking.lessonType.id);
      setManagedLocation(managed.booking.location);
      setSelectedDate(isInCalendar ? managedDate : "");
      setSelectedSlot(isInCalendar ? managed.booking.startAt : "");
      setCalendarWeekCount(isInCalendar ? 1 : 4);
      setManageError("");
      setLoadingSlots(true);
    });
  }

  function returnFromConfirmationToUpcoming() {
    if (!confirmation) return;
    transitionBooking(() => {
      setConfirmation(null);
      setIntent("lessons");
      setAccountView("upcoming");
      setBookingKind("");
      setLessonTypeId("");
      setSelectedSlot("");
      setSavedChoices([]);
      setCalendarWeekCount(4);
      setCalendarPageStart("");
      setSelectedDate("");
      setStep("day");
      setForm(emptyForm);
      setSeriesPreview(null);
      setPayment(null);
      setPaymentError("");
      setUpcomingRequestKey((current) => current + 1);
    });
  }

  // What shapes a booking changes in place, in the bar, without moving the
  // page. On the confirmation a single chosen time is kept and checked against
  // the new lesson's free times; otherwise the times are chosen again.
  function chooseBookingKind(kind: Exclude<BookingKind, "">) {
    if (kind === bookingKind) return;
    const trialId = lessonTypes.find((type) => type.id === "trial")?.id ?? "";
    const nextTypeId = kind === "trial" ? trialId : lessonTypeId && lessonTypeId !== trialId ? lessonTypeId : defaultLessonChoice(false).typeId;
    changeLesson(nextTypeId, () => {
      setBookingKind(kind);
      setForm((current) => ({ ...current, repeat: kind === "recurring" ? 4 : "once" }));
    });
  }

  function chooseLessonLength(typeId: string) {
    if (typeId === lessonTypeId) return;
    changeLesson(typeId);
  }

  function changeLesson(typeId: string, alsoUpdate?: () => void) {
    const keepTime = step === "details" && !savedChoices.length && Boolean(selectedSlot);
    transitionBooking(() => {
      alsoUpdate?.();
      setChangingChoice(null);
      setSavedChoices([]);
      setSubmitError("");
      setSlotNotice("");
      if (typeId !== lessonTypeId) {
        setLoadingSlots(true);
        setSlotsByDate({});
        setLessonTypeId(typeId);
      }
      if (keepTime) {
        slotRecheck.current = typeId !== lessonTypeId ? selectedSlot : "";
      } else {
        setSelectedSlot("");
        setStep(selectedDate ? "time" : "day");
      }
    });
  }

  function changeDateChoice() {
    transitionBooking(() => {
      // Back to the four weeks that held the date, not to the first page.
      if (selectedDate) setCalendarPageStart(portoWeekKey(`${selectedDate}T12:00:00Z`));
      setSelectedDate("");
      setSelectedSlot("");
      setSlotNotice("");
      setCalendarWeekCount(4);
      goTo("day");
    });
  }

  function changeTimeChoice() {
    transitionBooking(() => {
      setSelectedSlot("");
      goTo("time");
    });
  }

  /** A time from the day's grid or from the soonest times. */
  function chooseSlot(slot: Slot) {
    transitionBooking(() => {
      setSelectedDate(portoDateKey(new Date(slot.startAt)));
      setChangingChoice(null);
      setSelectedSlot(slot.startAt);
      setSlotNotice("");
      goTo("details");
    });
  }

  function addAnotherLesson() {
    transitionBooking(() => {
      setChangingChoice(null);
      setSavedChoices(bookingChoices);
      setSelectedDate("");
      setSelectedSlot("");
      setCalendarWeekCount(4);
      setSubmitError("");
      setStep("day");
    });
    orientTo("booking-bar-heading", true);
  }

  function reviewSavedLessons() {
    // Backing out of a change puts that lesson back exactly as it was.
    const last = activeChange ?? savedChoices[savedChoices.length - 1];
    if (!last) return;
    transitionBooking(() => {
      if (activeChange) setChangingChoice(null);
      else setSavedChoices(savedChoices.slice(0, -1));
      setSelectedDate(portoDateKey(new Date(last.startAt)));
      setSelectedSlot(last.startAt);
      goTo("details");
    });
  }

  function selectionBackButton() {
    return (
      <button
        aria-label="Back to your selection"
        className="button button--outline button--compact booking-selection-back"
        onClick={reviewSavedLessons}
        type="button"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </button>
    );
  }

  function changeSelectedLesson(index: number) {
    const choice = bookingChoices[index];
    if (!choice) return;
    transitionBooking(() => {
      setChangingChoice(choice);
      setSavedChoices(bookingChoices.filter((_, entry) => entry !== index));
      setSelectedDate("");
      setSelectedSlot("");
      setCalendarWeekCount(4);
      setSubmitError("");
      setStep("day");
    });
    orientTo("booking-bar-heading", true);
  }

  function removeChangingLesson() {
    const last = savedChoices[savedChoices.length - 1];
    transitionBooking(() => {
      setChangingChoice(null);
      setSavedChoices(savedChoices.slice(0, -1));
      setSelectedDate(last ? portoDateKey(new Date(last.startAt)) : "");
      setSelectedSlot(last?.startAt ?? "");
      setSubmitError("");
      goTo(last ? "details" : "day");
    });
  }

  function selectedLessonsList(choices: Slot[], editable: boolean) {
    return (
      <ol className="booking-chosen-lessons" aria-label={bookingKind === "recurring" ? "Starting times" : "Selected lessons"}>
        {choices.map((choice, index) => {
          const local = differingLocalTime(choice.startAt, studentZone);
          return (
            <li key={choice.startAt}>
              <BookingSelectionSummary
                actionLabel={editable && !payment ? `Change lesson ${index + 1}` : undefined}
                actionText="Change"
                ariaLabel={`Lesson ${index + 1}`}
                detail={`Porto time${local ? ` · ${local} your time` : ""}`}
                disabled={submitting}
                mark={LESSON_MARKS[index % LESSON_MARKS.length]}
                onAction={() => changeSelectedLesson(index)}
                title={`${formatLongDate(choice.startAt)}, ${formatSlotTime(choice.startAt)}`}
              />
            </li>
          );
        })}
      </ol>
    );
  }

  /**
   * The lessons being booked, each with its own Change, and a card to add
   * another in the same place a lesson would appear.
   */
  function bookingSelectionSummaries() {
    if (!lessonType || !bookingKind) return null;
    const localTime = chosen ? differingLocalTime(chosen.startAt, studentZone) : "";
    const canAddLesson = !payment && bookingKind !== "trial" && bookingChoices.length < (bookingKind === "recurring" ? 2 : 8);

    return (
      <div className="booking-selection-stack" aria-label="Your booking choices">
        {bookingChoices.length <= 1 && chosen ? (
          <BookingSelectionSummary
            actionLabel="Change date or time"
            actionText="Change"
            ariaLabel="Selected lesson"
            detail={`Porto time${localTime ? ` · ${localTime} your time` : ""}`}
            disabled={submitting}
            mark="/visuals/v2-splats/booking-availability-splat-v2.svg"
            onAction={changeTimeChoice}
            title={`${formatLongDate(chosen.startAt)}, ${formatSlotTime(chosen.startAt)}`}
          />
        ) : null}
        {bookingChoices.length > 1 ? selectedLessonsList(bookingChoices, true) : null}
        {canAddLesson ? (
          <button className="booking-add-lesson" disabled={submitting} onClick={addAnotherLesson} type="button">
            <span className="booking-add-lesson__mark" aria-hidden="true">
              <Plus size={20} strokeWidth={2.2} />
            </span>
            {bookingKind === "recurring" ? "Add a second weekly time" : "Add another lesson"}
          </button>
        ) : null}
      </div>
    );
  }

  /**
   * While another lesson is added or one is changed, the lesson itself is
   * settled, so the bar gives way to what has been chosen so far.
   */
  function bookingProgressBar() {
    return (
      <div className="booking-bar booking-bar--progress">
        <div className="booking-bar__head">
          <h2 className="eyebrow" id="booking-bar-heading" tabIndex={-1}>
            {activeChange ? "Change a lesson" : bookingKind === "recurring" ? "Add a second weekly time" : "Add another lesson"}
          </h2>
          {selectionBackButton()}
        </div>
        {selectedLessonsList(savedChoices, false)}
        {activeChange ? (
          <p className="booking-bar__note">
            Changing {formatLongDate(activeChange.startAt)}, {formatSlotTime(activeChange.startAt)}.{" "}
            <button className="text-action" type="button" onClick={removeChangingLesson}>Remove this lesson</button>
          </p>
        ) : null}
      </div>
    );
  }

  /**
   * What shapes a booking, pre-filled and changed in place: the kind of lesson,
   * where it happens, how long, and for weekly lessons how many weeks. It sits
   * at the top of the calendar while booking, and at the top of the
   * confirmation so a student can adjust without starting again.
   */
  function bookingChoicesBar(inConfirmation = false) {
    if (!lessonType || !bookingKind) return null;
    const kinds: { value: Exclude<BookingKind, "">; label: string }[] = [
      ...(offerTrial && !hasPriorBooking && trialLessonType ? [{ value: "trial" as const, label: "Trial" }] : []),
      { value: "once", label: "Single" },
      { value: "recurring", label: "Weekly" }
    ];
    const kindIndex = Math.max(0, kinds.findIndex((kind) => kind.value === bookingKind));
    const lengthIndex = Math.max(0, regularLessonTypes.findIndex((type) => type.id === lessonTypeId));
    const repeatIndex = Math.max(0, RECURRING_OPTIONS.findIndex((option) => form.repeat === option.value));
    return (
      <div className={`booking-bar${inConfirmation ? " booking-bar--review" : ""}`}>
        {!inConfirmation ? (
          <div className="booking-bar__head">
            <h2 className="eyebrow" id="booking-bar-heading" tabIndex={-1}>Book a lesson</h2>
            {student ? (
              <button className="button button--outline button--compact booking-bar__back" onClick={openLessonsJourney} type="button">
                <ArrowLeft size={15} aria-hidden="true" /> Your lessons
              </button>
            ) : returningDevice ? (
              <p className="booking-bar__sign-in">
                <span className="booking-bar__sign-in-note">Already booked?</span>
                <button className="button button--coral button--compact" onClick={openLessonsJourney} type="button">
                  Sign in
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="booking-bar__choices" role="group" aria-label="Your lesson">
          <fieldset className="booking-bar__group booking-bar__group--kind">
            <legend>Lesson</legend>
            <div className={`segmented${kinds.length === 3 ? " segmented--three" : ""} segmented--position-${kindIndex}`}>
              <span aria-hidden="true" className="segmented__thumb" />
              {kinds.map((kind) => (
                <label className={bookingKind === kind.value ? "is-active" : ""} key={kind.value}>
                  <input
                    checked={bookingKind === kind.value}
                    name="booking-kind"
                    onChange={() => chooseBookingKind(kind.value)}
                    type="radio"
                    value={kind.value}
                  />
                  {kind.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="booking-bar__group">
            <legend>Where</legend>
            <div className={`segmented segmented--position-${form.location === "porto" ? 1 : 0}`}>
              <span aria-hidden="true" className="segmented__thumb" />
              {(["online", "porto"] as const).map((option) => (
                <label className={form.location === option ? "is-active" : ""} key={option}>
                  <input
                    aria-label={option === "online" ? "Online" : "In Porto"}
                    checked={form.location === option}
                    name="booking-location"
                    onChange={() => setForm((current) => ({ ...current, location: option }))}
                    type="radio"
                    value={option}
                  />
                  {option === "online" ? "Online" : "In Porto"}
                </label>
              ))}
            </div>
          </fieldset>
          {bookingKind === "trial" ? (
            <fieldset className="booking-bar__group">
              <legend>Length</legend>
              {/* The trial's length is fixed: the same control, with nothing to switch. */}
              <div className="segmented segmented--single">
                <span aria-hidden="true" className="segmented__thumb" />
                <label className="is-active">
                  <input
                    aria-label={`${formatLessonDuration(lessonType.duration_minutes)} lesson · ${formatMoneyCents(lessonType.price_cents)}`}
                    checked
                    name="booking-duration"
                    readOnly
                    type="radio"
                    value={lessonType.id}
                  />
                  {lessonType.duration_minutes} min · {formatMoneyCents(lessonType.price_cents)}
                </label>
              </div>
            </fieldset>
          ) : (
            <fieldset className="booking-bar__group">
              <legend>Length</legend>
              <div className={`segmented segmented--position-${lengthIndex}`}>
                <span aria-hidden="true" className="segmented__thumb" />
                {regularLessonTypes.map((type) => (
                  <label className={lessonTypeId === type.id ? "is-active" : ""} key={type.id}>
                    <input
                      aria-label={`${formatLessonDuration(type.duration_minutes)} lesson · ${formatMoneyCents(type.price_cents)}`}
                      checked={lessonTypeId === type.id}
                      name="booking-duration"
                      onChange={() => chooseLessonLength(type.id)}
                      type="radio"
                      value={type.id}
                    />
                    {type.duration_minutes} min · {formatMoneyCents(type.price_cents)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {bookingKind === "recurring" ? (
            <fieldset className="booking-bar__group booking-bar__group--repeat">
              <legend>Repeat</legend>
              <div className={`segmented segmented--four segmented--position-${repeatIndex}`}>
                <span aria-hidden="true" className="segmented__thumb" />
                {RECURRING_OPTIONS.map((option) => (
                  <label className={form.repeat === option.value ? "is-active" : ""} key={option.label}>
                    <input
                      checked={form.repeat === option.value}
                      name="booking-repeat"
                      onChange={() => setForm((current) => ({ ...current, repeat: option.value }))}
                      type="radio"
                      value={option.value ?? "ongoing"}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
      </div>
    );
  }

  if (isTeacher) {
    return <p className="booking-state-note" role="status">Opening your schedule…</p>;
  }

  if (confirmation) {
    const localTime = differingLocalTime(confirmation.startAt, studentZone);
    return (
      <section className="booking-success" aria-live="polite">
        {/* The tick and the word sat above the heading and pushed everything
            down a screen that is mostly one sentence of good news. Beside it,
            they confirm the same thing and cost no height. */}
        <div className="booking-success__head">
          <h2 id="booking-success-heading" tabIndex={-1}>
            You&rsquo;re booked in.
          </h2>
          <p className="eyebrow booking-success__badge">
            <CheckCircle2 size={18} aria-hidden="true" />
            Booked
          </p>
        </div>
        <p className="booking-success__when">
          {formatLongDate(confirmation.startAt)} at {formatSlotTime(confirmation.startAt)} Porto time
          {localTime ? ` · ${localTime} your time` : ""}
        </p>
        <p>
          A confirmation and calendar invitation are on their way to <strong>{confirmation.email}</strong>.
        </p>

        <MeetingLink meetingUrl={confirmation.meetingUrl} location={confirmation.location} status="confirmed" />

        {confirmation.selection ? (
          <div className="booking-success__series">
            <p><strong>{confirmation.selection.booked.length === 1 ? "1 lesson" : `${confirmation.selection.booked.length} lessons`} booked.</strong>{" "}
              {confirmation.selection.recurring
                ? confirmation.selection.weeks === null ? "Both weekly times continue until you stop them." : "Both times repeat each week."
                : "Each lesson is in your calendar and can be managed individually."}
            </p>
            {confirmation.selection.skipped.length ? <p>{confirmation.selection.skipped.length === 1 ? "1 unavailable lesson time was" : `${confirmation.selection.skipped.length} unavailable lesson times were`} left out.</p> : null}
          </div>
        ) : confirmation.series ? (
          <div className="booking-success__series">
            <p>
              <strong>
                {confirmation.series.booked.length}{" "}
                {confirmation.series.booked.length === 1 ? "lesson" : "lessons"} booked
              </strong>
              {confirmation.series.openEnded
                ? ". This time stays yours every week until you stop it."
                : " at the same time each week."}
            </p>
            {confirmation.series.skipped.length ? (
              <div className="booking-alert booking-alert--warn booking-skipped">
                <AlertCircle size={18} aria-hidden="true" />
                <div>
                  <p>
                    <strong>
                      {confirmation.series.skipped.length === 1
                        ? "One week wasn't free, so it is not booked"
                        : `${confirmation.series.skipped.length} weeks weren't free, so they are not booked`}
                    </strong>
                  </p>
                  <ul>
                    {confirmation.series.skipped.map((startAt) => (
                      <li key={startAt}>{formatLongDate(startAt)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <dl className="booking-success__reference">
          <dt>Your reference</dt>
          <dd>{confirmation.reference}</dd>
        </dl>
        <div className="booking-success__actions">
          <button
            className="button button--coral"
            onClick={returnFromConfirmationToUpcoming}
            type="button"
          >
            Back to upcoming lessons
          </button>
          <button
            className="text-action"
            onClick={() => {
              if (confirmation.manageToken) {
                transitionBooking(() => {
                  setConfirmation(null);
                  void openManaged(confirmation.manageToken, confirmation.series?.id ?? null);
                });
              } else {
                window.location.assign(confirmation.manageUrl);
              }
            }}
            type="button"
          >
            Change or cancel this one
          </button>
        </div>
        <p className="booking-success__note">
          This lesson is now marked on your calendar. You can open it there to move or cancel it. It&rsquo;s free up to
          {" "}{NOTICE_HOURS} hours before; after that it costs {formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}.
        </p>
      </section>
    );
  }

  return (
    <section className="booking-steps" aria-label="Book a Portuguese lesson">
      {bookingPromptDate ? (
        <CalendarBookingPrompt
          date={bookingPromptDate}
          lessons={(bookingsByDate[bookingPromptDate] ?? []).map((booking) => ({
            key: booking.reference,
            title: formatSlotTimeForStudent(booking.startAt, studentZone),
            detail: `${formatBookedLessonLabel(booking.lessonType)} · ${booking.location === "porto" ? "In Porto" : "Online"}${isWeeklyLesson(booking) ? " · Weekly" : ""}`,
            onOpen: () => {
              const trigger = promptTrigger.current;
              setBookingPromptDate("");
              openBookedLesson(booking, trigger);
            }
          }))}
          onClose={() => setBookingPromptDate("")}
          onBook={() => {
            setBookingPromptDate("");
            startBookingJourney(bookingPromptDate);
          }}
        />
      ) : null}
      {loadError ? (
        <div className="booking-alert" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            {loadError}{" "}
            <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
              Message Inês instead
            </a>
            .
          </p>
        </div>
      ) : null}

      <div className={`booking-stage${intent === "lessons" && student && accountView === "upcoming" ? " booking-stage--lessons" : ""}`}>
        {student ? (
          <section
            className="unified-account-area"
            id="account-controls"
            aria-label="Account, upcoming and past lessons"
          >
            <AccountControls
              bookingActive={intent === "book"}
              onOpenAccountSection={openAccountShortcut}
              onTransition={transitionBooking}
              onSignedOut={() => {
                setStudent(null);
                setMyBookings([]);
                setLessonSeries([]);
                setManaged(null);
                setManagedToken("");
                setManagedSeriesId(null);
                setManagedLessonTypeId("");
                setManagedLocation("online");
                setManageMode("view");
                setHasPriorBooking(false);
                // Signed out, the page is what any visitor sees: ready to book.
                setIntent("book");
                setBookingKind("");
                setLessonTypeId("");
                setSavedChoices([]);
                setChangingChoice(null);
                setSelectedDate("");
                setSelectedSlot("");
                setCalendarWeekCount(4);
                setCalendarPageStart("");
                setStep("day");
                setForm(emptyForm);
              }}
              openUpcomingRequest={upcomingRequestKey}
            />
          </section>
        ) : null}

        {manageDialogOpen ? (
          <div
            className={`lesson-manage-overlay${isManagedReschedule ? " lesson-manage-overlay--reschedule" : ""}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) dismissManagedDialog();
            }}
            role="presentation"
          >
            {!isManagedReschedule ? (
            <div
              aria-labelledby="lesson-manage-heading"
              aria-modal="true"
              className="lesson-manage-dialog"
              onKeyDown={keepDialogFocus}
              ref={manageDialogRef}
              role="dialog"
              tabIndex={-1}
            >
              <button
                aria-label="Close lesson management"
                className="lesson-manage-dialog__close"
                disabled={manageWorking}
                onClick={dismissManagedDialog}
                type="button"
              >
                <X aria-hidden="true" size={22} strokeWidth={2} />
              </button>

              <div
                className="lesson-manage-dialog__content"
                key={manageLoading ? "loading" : !managed ? "error" : manageOutcome ? "outcome" : manageMode}
              >
              {manageLoading ? (
                <div className="lesson-manage-dialog__loading">
                  <p className="eyebrow">One moment</p>
                  <h2 id="lesson-manage-heading">Opening your lesson…</h2>
                </div>
              ) : managed ? (
                <>
                  <p className={`lesson-calendar__status${resolvedManagedSeriesId ? " lesson-calendar__status--recurring" : ""}`}>
                    {resolvedManagedSeriesId ? <Repeat size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
                    {managed.booking.status === "cancelled"
                      ? "Cancelled"
                      : resolvedManagedSeriesId
                        ? "Recurring lesson"
                        : "Booked"}
                  </p>
                  <h2 id="lesson-manage-heading">
                    {manageMode === "confirm-cancel"
                      ? "Cancel this lesson?"
                      : manageMode === "confirm-cancel-sequence"
                        ? "Cancel booked lessons?"
                        : manageMode === "sequence" || manageMode === "confirm-stop-sequence"
                        ? "Manage recurring lesson"
                        : manageOutcome
                          ? "All sorted"
                          : "Manage this lesson"}
                  </h2>

                  {manageOutcome ? (
                    <div className="booking-outcome" role="status">
                      <CheckCircle2 size={20} aria-hidden="true" />
                      <p>{manageOutcome}</p>
                    </div>
                  ) : null}
                  {manageError ? (
                    <div className="booking-alert" role="alert">
                      <AlertCircle size={18} aria-hidden="true" />
                      <p>{manageError}</p>
                    </div>
                  ) : null}

                  <div className="lesson-manage-dialog__lesson">
                    <strong>{formatLongDate(managed.booking.startAt)}, {formatSlotTimeForStudent(managed.booking.startAt, studentZone)}</strong>
                    <span>{formatBookedLessonLabel(managed.booking.lessonType)} · {managed.booking.location === "porto" ? "In Porto" : "Online"}</span>
                    <MeetingLink meetingUrl={managed.booking.meetingUrl} location={managed.booking.location} status={managed.booking.status} />
                  </div>

                  {!manageOutcome && manageMode === "view" ? (
                    <>
                      {([ ["lesson", managed.paymentsDue?.lesson, "lesson payment"], ["same-day-fee", managed.paymentsDue?.sameDayFee, "late change fee"] ] as const).map(([purpose, amount, label]) => amount != null ? (
                        <div className="lesson-calendar__notice" key={purpose}>
                          <p>Your {label} of {formatMoneyCents(amount)} is still to pay.</p>
                          <button className="button button--coral" disabled={manageWorking} type="button" onClick={async () => {
                            if (!managedToken) return;
                            setManageWorking(true); setManageError("");
                            try {
                              const result = await recoverBookingPayment(managedToken, purpose);
                              window.location.assign(stripePaymentUrl(result.url));
                            } catch (error) {
                              setManageError(error instanceof Error ? error.message : "Please try again shortly.");
                              setManageWorking(false);
                            }
                          }}>{manageWorking ? "Opening secure payment…" : `Pay ${formatMoneyCents(amount)} securely`}</button>
                        </div>
                      ) : null)}
                      {managed.changeLocked && managed.booking.status !== "cancelled" ? (
                        <p className="lesson-calendar__notice">
                          This lesson is less than {NOTICE_HOURS} hours away and can&rsquo;t be changed or cancelled.
                        </p>
                      ) : managed.sameDayFeeApplies && managed.booking.status !== "cancelled" ? (
                        <p className="lesson-calendar__notice">
                          This lesson is less than {NOTICE_HOURS} hours away, so moving or cancelling it now costs{" "}
                          {formatMoneyCents(managed.booking.sameDayFeeCents)}.
                          {managed.sameDayFeeAutomatic ? " Your saved card is charged when you confirm." : ""}
                          {" "}This fee applies once per lesson.
                        </p>
                      ) : null}

                      {managed.booking.status === "confirmed" && !managed.isPast && !managed.changeLocked ? (
                        <>
                          <p className="lesson-manage-dialog__question">Would you like to change or cancel it?</p>
                          <div className="lesson-manage-dialog__actions">
                            <button className="button button--coral" onClick={beginManagedReschedule} type="button">
                              Change
                            </button>
                            <button
                              className="button button--quiet"
                              onClick={() => transitionBooking(() => setManageMode("confirm-cancel"))}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : null}

                      {resolvedManagedSeriesId ? (
                        <div className="lesson-manage-dialog__series">
                          <Repeat aria-hidden="true" size={17} />
                          <div>
                            <strong>Part of a recurring sequence</strong>
                            <span>
                              {activeManagedSeries
                                ? `${weekdayNames[activeManagedSeries.weekday]} at ${minutesToClock(activeManagedSeries.minuteOfDay)} Porto time`
                                : "This sequence is no longer adding lessons."}
                            </span>
                          </div>
                          {activeManagedSeries ? (
                            <button className="text-action" onClick={() => transitionBooking(() => setManageMode("sequence"))} type="button">
                              Manage sequence
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {manageMode === "confirm-cancel" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p>
                        This only cancels the lesson on this date.
                        {managed.refundOnCancel && managed.booking.amountCents
                          ? ` Your ${formatMoneyCents(managed.booking.amountCents)} comes back to your card.`
                          : ""}
                        {managed.sameDayFeeApplies
                          ? managed.sameDayFeeAutomatic
                            ? ` Your saved card is charged the ${formatMoneyCents(managed.booking.sameDayFeeCents)} fee when you confirm the cancellation. This fee applies once per lesson. There’s no lesson charge.`
                            : ` The ${formatMoneyCents(managed.booking.sameDayFeeCents)} late change fee applies once per lesson.`
                          : ""}
                      </p>
                      <div className="lesson-manage-dialog__actions">
                        <button className="button button--coral" disabled={manageWorking} onClick={cancelManagedLesson} type="button">
                          {manageWorking ? "Cancelling…" : "Yes, cancel it"}
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={manageWorking}
                          onClick={() => transitionBooking(() => setManageMode("view"))}
                          type="button"
                        >
                          Keep lesson
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeManagedSeries && manageMode === "sequence" ? (
                    <div className="lesson-manage-dialog__decision">
                      <div className="lesson-manage-dialog__actions lesson-manage-dialog__actions--sequence">
                        <button className="button button--blue" onClick={beginManagedSeriesReschedule} type="button">
                          Move recurrence
                        </button>
                        <button className="button button--quiet" onClick={() => transitionBooking(() => setManageMode("confirm-stop-sequence"))} type="button">
                          Stop repeating
                        </button>
                        <button className="button button--coral" onClick={() => transitionBooking(() => setManageMode("confirm-cancel-sequence"))} type="button">
                          Cancel all booked lessons
                        </button>
                        <button className="text-action" onClick={() => transitionBooking(() => setManageMode("view"))} type="button">
                          Back
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeManagedSeries && manageMode === "confirm-stop-sequence" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p><strong>Stop this recurring sequence?</strong> Your booked lessons will stay.</p>
                      <div className="lesson-manage-dialog__actions">
                        <button className="button button--coral" disabled={manageWorking} onClick={() => stopManagedSequence(false)} type="button">
                          {manageWorking ? "Stopping…" : "Yes, stop repeating"}
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={manageWorking}
                          onClick={() => transitionBooking(() => setManageMode("sequence"))}
                          type="button"
                        >
                          Keep repeating
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeManagedSeries && manageMode === "confirm-cancel-sequence" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p>
                        <strong>Cancel every upcoming lesson in this sequence?</strong> This also stops new lessons being added. Any paid lesson that can still be cancelled is refunded automatically. A lesson less than {NOTICE_HOURS} hours away stays booked.
                      </p>
                      <div className="lesson-manage-dialog__actions">
                        <button className="button button--coral" disabled={manageWorking} onClick={() => stopManagedSequence(true)} type="button">
                          {manageWorking ? "Cancelling…" : "Yes, cancel all"}
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={manageWorking}
                          onClick={() => transitionBooking(() => setManageMode("sequence"))}
                          type="button"
                        >
                          Keep booked lessons
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {manageOutcome || managed.booking.status === "cancelled" || managed.isPast || managed.changeLocked ? (
                    <button className="button button--quiet lesson-manage-dialog__done" onClick={dismissManagedDialog} type="button">
                      Done
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="eyebrow">Your lesson</p>
                  <h2 id="lesson-manage-heading">That lesson couldn&rsquo;t be opened</h2>
                  <div className="booking-alert" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <p>{manageError || "Please try again."}</p>
                  </div>
                  <button className="button button--quiet lesson-manage-dialog__done" onClick={dismissManagedDialog} type="button">
                    Close
                  </button>
                </>
              )}
              </div>
            </div>
            ) : null}
          </div>
        ) : null}

        {cardReturn ? (
          <div
            className={`booking-card-return booking-card-return--${cardReturn.state}`}
            role="status"
          >
            {cardReturn.state === "confirmed" ? (
              <CheckCircle2 size={20} aria-hidden="true" />
            ) : (
              <AlertCircle size={20} aria-hidden="true" />
            )}
            <p>
              {cardReturn.state === "confirming"
                ? "Your card is saved. Confirming your booking…"
                : cardReturn.state === "confirmed"
                  ? "You’re booked in. Your confirmation email is on its way."
                  : "Your card is saved and your booking is still being confirmed. It will appear here shortly, and we’ll email you when it does."}
            </p>
            {cardReturn.state !== "confirming" ? (
              <button aria-label="Dismiss" className="booking-card-return__close" onClick={() => setCardReturn(null)} type="button">
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        {accountLoadError && !student ? (
          <div className="booking-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>
              {accountLoadError}{" "}
              <button
                className="text-action"
                onClick={() => {
                  setAccountLoadError("");
                  setCheckingSession(true);
                  refreshStudent()
                    .catch(() => setAccountLoadError("We still couldn’t reach your account. Please try again in a moment."))
                    .finally(() => setCheckingSession(false));
                }}
                type="button"
              >
                Try again
              </button>
            </p>
          </div>
        ) : null}

        {checkingSession && intent === "choose" && !managed ? (
          <p className="booking-state-note booking-state-note--initial">Loading your lessons…</p>
        ) : null}

        {needsLessonsSignIn ? (
          <section className="booking-workflow-sign-in" id="booking-lessons-sign-in" tabIndex={-1}>
            <button className="booking-workflow-sign-in__back" onClick={returnToJourneyStart} type="button">
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <AuthPanel
              heading="Your account"
              headingLevel={2}
              initialMode="signin"
              intro="Your upcoming lessons will appear first, with your calendar beneath them."
              onSignedIn={(signedIn) => {
                transitionBooking(() => {
                  setStudent(signedIn);
                  setShowAccountSignIn(false);
                  setAccountView("upcoming");
                  setUpcomingRequestKey((current) => current + 1);
                });
                void refreshStudent();
              }}
            />
          </section>
        ) : null}

        {intent === "book" && !managed && !lessonType && !isConfirmingBooking && !loadError ? (
          <p className="booking-state-note booking-state-note--initial">Loading lessons…</p>
        ) : null}

        {showWorkflowCalendar ? (
          <div
            className="unified-calendar-shell"
            style={managed && isManagedReschedule && managedCalendarPlaceholderHeight
              ? { height: `${managedCalendarPlaceholderHeight}px` }
              : undefined}
          >
          <div
            aria-labelledby={managed && isManagedReschedule ? "managed-reschedule-heading" : undefined}
            aria-modal={managed && isManagedReschedule ? true : undefined}
            className={`unified-calendar${isLessonsCalendarOverview ? " unified-calendar--overview" : ""}${
              managed && isManagedReschedule ? " unified-calendar--managed-overlay" : ""
            }${intent === "book" && !managed ? " unified-calendar--booking" : ""}`}
            id="lesson-calendar"
            onKeyDown={managed && isManagedReschedule ? keepDialogFocus : undefined}
            ref={managedRescheduleRef}
            role={managed && isManagedReschedule ? "dialog" : undefined}
            tabIndex={managed && isManagedReschedule ? -1 : undefined}
          >
          {managed && isManagedReschedule ? (
            <button
              aria-label="Close lesson management"
              className="lesson-manage-workspace__close"
              disabled={manageWorking}
              onClick={dismissManagedDialog}
              type="button"
            >
              <X aria-hidden="true" size={22} strokeWidth={2} />
            </button>
          ) : null}
          {intent === "book" && !managed ? (savedChoices.length ? bookingProgressBar() : bookingChoicesBar()) : null}
          <div
            className={`calendar-panel unified-calendar__grid${bookingDateChosen ? " unified-calendar__grid--date-chosen" : ""}`}
          >
            {isLessonsCalendarOverview ? (
              <div className="lesson-overview">
                <div className="lesson-overview__header">
                  <div className="upcoming-lessons__title-line">
                    <h2 className="eyebrow" id="upcoming-lessons-heading" tabIndex={-1}>Upcoming lessons</h2>
                    <button
                      aria-describedby="upcoming-lessons-tip"
                      aria-label="How your lesson calendar works"
                      className="upcoming-lessons__hint"
                      type="button"
                    >
                      <CircleHelp size={16} aria-hidden="true" />
                    </button>
                    <span className="upcoming-lessons__tip" id="upcoming-lessons-tip" role="tooltip">
                      Choose a booked lesson to see its details, move it or cancel it. Choose any other day to book a lesson then.
                    </span>
                  </div>
                  <button
                    className="button button--coral button--compact lesson-overview__book"
                    onClick={() => startBookingJourney()}
                    type="button"
                  >
                    Book<span className="lesson-overview__book-more"> a lesson</span> <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
                {nextLesson ? (
                  <div className="lesson-overview__next">
                    <LessonMark
                      className="lesson-overview__next-mark"
                      durationMinutes={nextLesson.lessonType.durationMinutes}
                      lessonTypeId={nextLesson.lessonType.id}
                      location={nextLesson.location}
                      recurring={isWeeklyLesson(nextLesson)}
                    />
                    <button className="lesson-overview__next-open" onClick={(event) => openBookedLesson(nextLesson, event.currentTarget)} type="button">
                      <span className="eyebrow">{Date.parse(nextLesson.startAt) <= clock ? "Happening now" : "Next lesson"}</span>
                      <strong>{formatLongDate(nextLesson.startAt)}, {formatSlotTimeForStudent(nextLesson.startAt, studentZone)}</strong>
                      <span>
                        {formatBookedLessonLabel(nextLesson.lessonType)} · {nextLesson.location === "porto" ? "In Porto" : "Online"}
                        {isWeeklyLesson(nextLesson) ? " · Weekly" : ""}
                      </span>
                    </button>
                    <MeetingLink meetingUrl={nextLesson.meetingUrl} location={nextLesson.location} status={nextLesson.status} />
                  </div>
                ) : (
                  <p className="lesson-overview__empty">Nothing booked yet. Choose a day below, or book a lesson.</p>
                )}
              </div>
            ) : null}
            <div className="unified-calendar__toolbar">
              <div className="unified-calendar__legend" aria-label="Calendar key">
                {!isLessonsCalendarOverview || calendarBookings.length ? (
                  <span>
                    <i className="is-booked" aria-hidden="true" />{" "}
                    {isLessonsCalendarOverview && calendarBookings.some(isWeeklyLesson) ? "One-off lesson" : "Booked lesson"}
                  </span>
                ) : null}
                {isLessonsCalendarOverview && calendarBookings.some(isWeeklyLesson) ? (
                  <span><i className="is-weekly" aria-hidden="true" /> Weekly lesson</span>
                ) : null}
                {intent === "book" || isManagedReschedule ? (
                  <span><i className="is-free" aria-hidden="true" /> Free to book</span>
                ) : null}
              </div>
              <div className="unified-calendar__range-actions">
                {restrictedWeek ? <span className="unified-calendar__range">{calendarRangeLabel}</span> : visibleCalendarWeekCount !== 1 ? (
                  <div className="calendar-pager">
                    {calendarPages.length > 1 ? (
                      <button
                        aria-controls="booking-calendar-weeks"
                        aria-label="Earlier weeks"
                        className="calendar-pager__step"
                        disabled={calendarPageIndex === 0}
                        onClick={() => turnCalendarPage(-1)}
                        type="button"
                      >
                        <ChevronLeft size={18} aria-hidden="true" />
                      </button>
                    ) : null}
                    <span className="unified-calendar__range" aria-live="polite">{calendarRangeLabel}</span>
                    {calendarPages.length > 1 ? (
                      <button
                        aria-controls="booking-calendar-weeks"
                        aria-label={laterLessonCount ? `Later weeks, ${laterLessonCount} more ${laterLessonCount === 1 ? "lesson" : "lessons"}` : "Later weeks"}
                        className="calendar-pager__step"
                        disabled={calendarPageIndex >= calendarPages.length - 1}
                        onClick={() => turnCalendarPage(1)}
                        type="button"
                      >
                        <ChevronRight size={18} aria-hidden="true" />
                        {laterLessonCount ? <span className="calendar-pager__count" aria-hidden="true">{laterLessonCount}</span> : null}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {returnCalendarWeekCount && !restrictedWeek ? (
                  <button
                    aria-controls="booking-calendar-weeks"
                    className="text-action unified-calendar__expand"
                    onClick={() => transitionBooking(() => setCalendarWeekCount(returnCalendarWeekCount))}
                    type="button"
                  >
                    Show all
                  </button>
                ) : null}
              </div>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div
              aria-busy={loadingSlots}
              className="calendar-weeks"
              id="booking-calendar-weeks"
              key={visibleCalendarWeekCount === 1 && selectedCalendarWeek
                ? `compact-${selectedCalendarWeek.key}`
                : `page-${pageFirstKey}`}
            >
              {displayedCalendarWeeks.map((week) => (
                <Fragment key={week.key}>
                  {week.showMonth ? <p className="calendar-month">{week.month}</p> : null}
                  <div className="calendar-week">
                    {week.cells.map((cell) => {
                      const slots = selectableSlots(cell.key);
                      const lessons = bookingsByDate[cell.key] ?? [];
                      const lessonLabel = lessons.length === 1 ? "1 lesson" : `${lessons.length} lessons`;
                      const dateLabel = formatLongDate(`${cell.key}T12:00:00Z`);
                      const canStartBooking = isLessonsCalendarOverview && cell.key >= todayKey;
                      const weeklyDay = lessons.length > 0 && lessons.every(isWeeklyLesson);
                      return (
                        <button
                          aria-label={`${dateLabel}${
                            lessons.length ? `, ${lessonLabel}` : ""
                          }${
                            slots.length
                              ? `, ${slots.length} times free`
                              : lessons.length
                                ? isLessonsCalendarOverview ? (lessons.length === 1 ? ", open lesson" : ", choose a lesson to open") : ""
                                : canStartBooking ? ", book a lesson" : ", unavailable"
                          }`}
                          aria-haspopup={isLessonsCalendarOverview && lessons.length ? "dialog" : undefined}
                          aria-pressed={!isLessonsCalendarOverview && selectedDate === cell.key}
                          className={`${slots.length ? "has-availability" : ""}${canStartBooking ? " can-start-booking" : ""}${
                            lessons.length ? " has-booking" : ""
                          }${weeklyDay ? " has-weekly-booking" : ""}${!isLessonsCalendarOverview && selectedDate === cell.key ? " is-selected" : ""}${cell.isToday ? " is-today" : ""}`}
                          data-date-key={cell.key}
                          disabled={!canStartBooking && !slots.length && !lessons.length}
                          key={cell.key}
                          onClick={(event) => {
                            if (isLessonsCalendarOverview && lessons.length === 1) {
                              openBookedLesson(lessons[0], event.currentTarget);
                              return;
                            }
                            if (isLessonsCalendarOverview && lessons.length) {
                              promptTrigger.current = event.currentTarget;
                              setBookingPromptDate(cell.key);
                              return;
                            }
                            if (isLessonsCalendarOverview && canStartBooking) {
                              startBookingJourney(cell.key);
                              return;
                            }
                            transitionBooking(() => {
                              setSelectedDate(cell.key);
                              setCalendarWeekCount(managed ? 1 : CALENDAR_PAGE_WEEKS);
                              setSlotNotice("");
                              setSelectedSlot(
                                managed &&
                                isManagedReschedule &&
                                cell.key === managedDate &&
                                (managedLessonTypeId || managed.booking.lessonType.id) === managed.booking.lessonType.id
                                  ? managed.booking.startAt
                                  : ""
                              );
                              if (lessonType && !managed) {
                                setStep("time");
                                setSubmitError("");
                              }
                            });
                            orientTo("booking-next-step", false, true);
                          }}
                          type="button"
                        >
                          <span>
                            {cell.day}
                            {cell.month !== week.monthNumber ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                            {lessons.length ? (
                              <small className="calendar-booking-times">
                                {(lessons.length <= 2 ? lessons : lessons.slice(0, 1)).map((booking) => (
                                  <span className={isWeeklyLesson(booking) ? "is-weekly" : undefined} key={booking.reference}>
                                    {formatSlotTime(booking.startAt)}
                                  </span>
                                ))}
                                {lessons.length > 2 ? <span>+{lessons.length - 1} more</span> : null}
                              </small>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Fragment>
              ))}
            </div>
            {loadingSlots ? <p className="booking-state-note">Checking what&rsquo;s free…</p> : null}
          </div>

          {!isLessonsCalendarOverview ? (
          <aside
            aria-live="polite"
            className={`unified-calendar__panel${
              intent === "book" && !managed && !selectedDate && !(showAccountSignIn && !student) ? " unified-calendar__panel--waiting" : ""
            }`}
            id="booking-next-step"
            tabIndex={-1}
          >
            <div className="unified-calendar__panel-content" key={panelMotionKey}>
            {showAccountSignIn && !student ? (
              <AuthPanel
                heading="Sign in"
                headingLevel={3}
                initialMode="signin"
                intro="Your booked lessons will appear on this calendar."
                onSignedIn={(signedIn) => {
                  transitionBooking(() => {
                    setStudent(signedIn);
                    setShowAccountSignIn(false);
                  });
                  void refreshStudent();
                }}
              />
            ) : managed && isManagedReschedule ? (
              <div className="unified-calendar__move">
                <div className="managed-lesson__header">
                  <div>
                    <p className="eyebrow">{manageMode === "reschedule-sequence" ? "Move recurrence" : "Change this lesson"}</p>
                    <h3 id="managed-reschedule-heading">
                      {manageMode === "reschedule-sequence" ? "Choose a new weekly day and time" : "Choose a new date and time"}
                    </h3>
                  </div>
                  <button
                    className="booking-back booking-back--tertiary"
                    onClick={() => transitionBooking(() => setManageMode(manageMode === "reschedule-sequence" ? "sequence" : "view"))}
                    type="button"
                  >
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                </div>
                <p className="booking-state-note managed-lesson__current-time">
                  {manageMode === "reschedule-sequence" ? "Currently repeats from" : `Currently ${formatBookedLessonLabel(managed.booking.lessonType)} on`}{" "}
                  {formatLongDate(managed.booking.startAt)}, {formatSlotTimeForStudent(managed.booking.startAt, studentZone)}
                </p>
                {canChangeManagedDuration ? (
                  <fieldset className="managed-lesson__duration">
                    <legend>Lesson length</legend>
                    <div
                      className={`segmented${managedDurationChoices.findIndex((type) => type.id === managedLessonTypeId) === 1 ? " segmented--second" : ""}`}
                    >
                      <span aria-hidden="true" className="segmented__thumb" />
                      {managedDurationChoices.map((type) => (
                        <label
                          className={managedLessonTypeId === type.id ? "is-active" : ""}
                          key={type.id}
                        >
                          <input
                            aria-label={`${type.duration_minutes} minutes`}
                            checked={managedLessonTypeId === type.id}
                            name="managed-lesson-duration"
                            onChange={() => {
                              if (type.id === managedLessonTypeId) return;
                              setLoadingSlots(true);
                              setSlotsByDate({});
                              setManagedLessonTypeId(type.id);
                              setSelectedSlot(
                                type.id === managed.booking.lessonType.id && selectedDate === managedDate
                                  ? managed.booking.startAt
                                  : ""
                              );
                            }}
                            type="radio"
                            value={type.id}
                          />
                          {type.duration_minutes} mins
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : managed.booking.lessonType.id !== "trial" && managedPaymentStatus === "paid" ? (
                  <p className="booking-state-note managed-lesson__duration-note">
                    Lesson length: {formatBookedLessonLabel(managed.booking.lessonType)}. As this lesson is already paid,
                    cancel and rebook to change its length.
                  </p>
                ) : null}
                {managedPrice !== undefined ? <p className="booking-state-note">{manageMode === "reschedule-sequence"
                  ? managedLessonTypeId === managed.booking.lessonType.id
                    ? "Lessons that keep their length keep their existing agreed prices."
                    : `Changed-length lessons: ${formatMoneyCents(managedPrice)} each. Lessons already this length keep their agreed prices.`
                  : `${formatMoneyCents(managedPrice)} per lesson${managed.recurring ? " · recurring rate" : ""}`}</p> : null}
                {managed.recurring && student && managedLessonTypeId !== managed.booking.lessonType.id ? (
                  <details className="booking-recurring-rate">
                    <summary>Have a code for this lesson length?</summary>
                    <label><span>Your code for {selectedManagedType?.duration_minutes} minute lessons</span>
                      <input value={rateCode} onChange={(event) => setRateCode(event.target.value)} maxLength={40} autoComplete="off" />
                    </label>
                    <button className="text-action" type="button" disabled={!rateCode.trim() || rateWorking} onClick={() => void applyRate()}>Apply and save rate</button>
                    {rateMessage ? <p role="status">{rateMessage}</p> : null}
                  </details>
                ) : null}
                <fieldset className="managed-lesson__duration">
                  <legend>Where</legend>
                  <div className={`segmented segmented--${managedLocation}`}>
                    <span aria-hidden="true" className="segmented__thumb" />
                    {(["online", "porto"] as const).map((option) => (
                      <label className={managedLocation === option ? "is-active" : ""} key={option}>
                        <input
                          checked={managedLocation === option}
                          name="managed-lesson-location"
                          onChange={() => setManagedLocation(option)}
                          type="radio"
                          value={option}
                        />
                        {option === "online" ? "Online" : "In Porto"}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {manageError ? (
                  <div className="booking-alert" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <p>{manageError}</p>
                  </div>
                ) : null}
                <p className="booking-state-note">
                  {selectedDate ? `${formatLongDate(`${selectedDate}T12:00:00Z`)} · Porto time` : "Choose a free day on the calendar."}
                </p>
                {loadingSlots ? (
                  <p className="booking-state-note">Checking what&rsquo;s free…</p>
                ) : daySlots.length ? (
                  <TimePicker
                    day={startSpan}
                    key={selectedDate}
                    renderTime={(slot, place) => (
                      <button
                        aria-pressed={selectedSlot === slot.startAt}
                        className={selectedSlot === slot.startAt ? "is-selected" : ""}
                        key={slot.startAt}
                        onClick={() => setSelectedSlot(slot.startAt)}
                        style={place}
                        type="button"
                      >
                        {formatSlotTime(slot.startAt)}
                      </button>
                    )}
                    selected={selectedSlot}
                    slots={daySlots}
                  />
                ) : (
                  <p className="booking-state-note">Choose a day marked free.</p>
                )}
                {manageMode === "reschedule" && managed.sameDayFeeApplies ? (
                  <p className="lesson-calendar__notice" id="managed-change-fee">
                    Changing this lesson with less than {NOTICE_HOURS} hours&rsquo; notice costs{" "}
                    {formatMoneyCents(managed.booking.sameDayFeeCents)}.
                    {managed.sameDayFeeAutomatic ? " Your saved card is charged when you confirm the change." : ""}
                    {" "}This fee applies once per lesson.
                    {managed.sameDayFeeAutomatic ? " The lesson price is charged after the rescheduled lesson." : ""}
                  </p>
                ) : null}
                <div className="manage-booking__actions">
                  <button
                    aria-describedby={manageMode === "reschedule" && managed.sameDayFeeApplies ? "managed-change-fee" : undefined}
                    className="button button--coral"
                    disabled={!selectedSlot || manageWorking}
                    onClick={moveManagedLesson}
                    type="button"
                  >
                    {manageWorking
                      ? manageMode === "reschedule-sequence" ? "Moving recurrence…" : "Changing…"
                      : manageMode === "reschedule-sequence"
                        ? "Move recurrence"
                        : selectedSlot
                        ? selectedSlot === managed.booking.startAt
                          ? "Save changes"
                          : `Change to ${formatSlotTime(selectedSlot)}`
                        : "Choose a time"}
                  </button>
                  <button
                    className="button button--quiet"
                    onClick={() => transitionBooking(() => setManageMode(manageMode === "reschedule-sequence" ? "sequence" : "view"))}
                    type="button"
                  >
                    {manageMode === "reschedule-sequence" ? "Keep current schedule" : "Keep current time"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* With no day chosen while booking, the heading already says
                    "Choose a day"; an eyebrow saying it again read as a stutter. */}
                {selectedDate || intent === "lessons" ? (
                  <div className="unified-calendar__panel-top">
                    <p className="eyebrow">
                      {selectedDate
                        ? selectedDayBookings.length
                          ? "Selected day"
                          : lessonType
                            ? "Choose a time"
                            : "Selected day"
                        : "Upcoming lessons"}
                    </p>
                    {/* On a phone the times take the calendar's place, so the
                        way back to it sits here and the date keeps the width. */}
                    {bookingDateChosen ? (
                      <button className="button button--outline button--compact unified-calendar__change-date" onClick={changeDateChoice} type="button">
                        Change date
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <h3>
                  {selectedDate
                    ? formatLongDate(`${selectedDate}T12:00:00Z`)
                    : intent === "lessons" && !calendarWindowBookings.length
                      ? "Nothing booked yet"
                      : "Choose a day"}
                </h3>
                {slotNotice ? <p className="booking-state-note booking-state-note--notice">{slotNotice}</p> : null}

                {selectedDayBookings.length ? (
                  <div className="unified-calendar__bookings">
                    {selectedDayBookings.map((booking) => (
                      <button
                        className="lesson-calendar__lesson lesson-calendar__lesson--booked"
                        key={booking.reference}
                        onClick={() =>
                          transitionBooking(() => {
                            void openManaged(booking.manageToken, booking.seriesId);
                          })
                        }
                        type="button"
                      >
                        <LessonMark
                          className="lesson-calendar__mark"
                          durationMinutes={booking.lessonType.durationMinutes}
                          lessonTypeId={booking.lessonType.id}
                          location={booking.location}
                        />
                        <span className="lesson-calendar__lesson-copy">
                          <span className="lesson-calendar__status">
                            <CheckCircle2 size={13} aria-hidden="true" /> Booked
                          </span>
                          <strong>{formatSlotTime(booking.startAt)} Porto time</strong>
                          <span>
                            {formatBookedLessonLabel(booking.lessonType)} · {booking.location === "porto" ? "In Porto" : "Online"}
                          </span>
                        </span>
                        <ChevronRight aria-hidden="true" size={20} />
                      </button>
                    ))}
                  </div>
                ) : null}

                {lessonType ? (
                  <div className="unified-calendar__availability">
                    {!selectedDate ? (
                      soonestSlots.length ? (
                        <div className="booking-soonest">
                          <p className="eyebrow" id="booking-soonest-heading">Soonest times</p>
                          <ul aria-labelledby="booking-soonest-heading">
                            {soonestSlots.map((slot) => {
                              const local = differingLocalTime(slot.startAt, studentZone);
                              return (
                                <li key={slot.startAt}>
                                  <button
                                    aria-label={`${formatLongDate(slot.startAt)}, ${formatSlotTime(slot.startAt)} Porto time${local ? `, ${local} your time` : ""}`}
                                    onClick={() => chooseSlot(slot)}
                                    type="button"
                                  >
                                    <span>{shortDay.format(new Date(slot.startAt))}</span>
                                    <strong>
                                      {formatSlotTime(slot.startAt)}
                                      {local ? <small>{local} your time</small> : null}
                                    </strong>
                                    <ChevronRight size={16} aria-hidden="true" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : loadingSlots ? (
                        <p className="booking-state-note">Checking what&rsquo;s free…</p>
                      ) : (
                        <p className="booking-state-note">No free times in these weeks.</p>
                      )
                    ) : loadingSlots ? (
                      <p className="booking-state-note">Checking what&rsquo;s free…</p>
                    ) : daySlots.length ? (
                      <TimePicker
                        day={startSpan}
                        key={selectedDate}
                        renderTime={(slot, place) => {
                          const local = differingLocalTime(slot.startAt, studentZone);
                          return (
                            <button
                              key={slot.startAt}
                              style={place}
                              onClick={() => chooseSlot(slot)}
                              type="button"
                            >
                              {formatSlotTime(slot.startAt)}
                              {local ? <small>{local} your time</small> : null}
                            </button>
                          );
                        }}
                        selected={selectedSlot}
                        slots={daySlots}
                      />
                    ) : (
                      <p className="booking-state-note">No free times on this day.</p>
                    )}
                  </div>
                ) : intent === "book" ? (
                  <p className="unified-calendar__prompt">Choose a lesson type above to add free times to this calendar.</p>
                ) : null}
              </>
            )}
            </div>
          </aside>
          ) : null}
          </div>
          </div>
        ) : null}

        {/* A first visit books first and makes an account at the end; this is
            the quiet way in for a student booked on another browser. */}
        {showWorkflowCalendar && intent === "book" && !managed && !student && !returningDevice && !isConfirmingBooking ? (
          <p className="booking-returning">
            Already booked?{" "}
            <button onClick={openLessonsJourney} type="button">Sign in</button>
          </p>
        ) : null}

        {isConfirmingBooking ? (
          <div className="booking-confirmation-stage" id="booking-confirmation-stage">
            <div className="booking-confirmation-summary">
              {bookingChoicesBar(true)}
              {bookingSelectionSummaries()}
              {/* Beside the repeat and length that cause them, so a clash shows
                  as soon as either changes, signed in or not. */}
              {form.repeat !== "once" ? (
                <RepeatAvailability
                  chosen={Boolean(chosen)}
                  error={seriesPreviewError}
                  preview={seriesPreview}
                  previewing={previewing}
                />
              ) : null}
            </div>
            <div className="booking-confirmation-main">
              {/* Signed out, the sign-in card's "Almost there" is the visible heading.
                  This one stays for screen readers and as the step's focus target. */}
              <h2 className={student ? "booking-step-heading" : "booking-step-heading visually-hidden"} id="booking-step-heading" tabIndex={-1}>
                {student
                  ? form.repeat === "once"
                    ? bookingChoices.length > 1 ? "Confirm your lessons" : "Confirm your lesson"
                    : "Confirm your recurring lessons"
                  : "Sign in to confirm"}
              </h2>

              <div className="booking-final">
                {payment ? (
                  <div className="booking-payment">
                    <p className="booking-payment__summary">
                      {lessonType ? `${formatLessonDuration(lessonType.duration_minutes)} lesson` : "Your lesson"}
                      {lessonType ? ` · ${formatMoneyCents(lessonType.price_cents)}` : ""}
                      {form.repeat !== "once" || bookingChoices.length > 1 ? " each" : ""}. {bookingChoices.length > 1 ? "Your selected times are" : "Your time is"} held while you save a card. Nothing is charged now.
                    </p>
                    {paymentError ? (
                      <div className="booking-alert" role="alert">
                        <AlertCircle size={18} aria-hidden="true" />
                        <p>{paymentError}</p>
                      </div>
                    ) : null}
                    <div className="booking-payment__mount" ref={paymentMountRef} />
                    <button className="text-action" onClick={() => setPayment(null)} type="button">
                      Back to make a change
                    </button>
                  </div>
                ) : checkingSession ? (
                  <p className="booking-state-note">One moment…</p>
                ) : !student ? (
                  <AuthPanel
                    heading="Almost there"
                    initialMode="register"
                    keepCopy
                    onSignedIn={(signedIn) => {
                      setStudent(signedIn);
                      void refreshStudent();
                    }}
                  />
                ) : (
                  <form className="student-details-form" onSubmit={submit}>
                    {form.repeat !== "once" && lessonType?.id !== "trial" ? (
                      <div className="booking-recurring-rate">
                        <p><strong>{lessonType ? formatMoneyCents(lessonType.price_cents) : ""} per recurring lesson</strong></p>
                        <details>
                          <summary>Have a code from Inês?</summary>
                          <label>
                            <span>Your code for {lessonType?.duration_minutes} minute lessons</span>
                            <input value={rateCode} onChange={(event) => setRateCode(event.target.value)} maxLength={40} autoComplete="off" autoCapitalize="characters" />
                          </label>
                          <button className="text-action" type="button" disabled={!rateCode.trim() || rateWorking} onClick={() => void applyRate()}>
                            {rateWorking ? "Applying…" : "Apply and save rate"}
                          </button>
                        </details>
                        {rateMessage ? <p role="status">{rateMessage}</p> : null}
                      </div>
                    ) : null}

                    <div className="booking-confirmation-columns">
                      <label className="booking-confirmation-notes">
                        <span>
                          <MessageSquareText size={16} aria-hidden="true" />
                          Add a note <em>(optional)</em>
                        </span>
                        <textarea
                          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                          rows={2}
                          value={form.notes}
                        />
                      </label>

                      <div className="booking-confirmation-payment">
                        {submitError ? (
                          <div className="booking-alert" role="alert">
                            <AlertCircle size={18} aria-hidden="true" />
                            <p>{submitError}</p>
                          </div>
                        ) : null}

                        {paymentConfigurationError ? (
                          <div className="booking-alert" role="alert">
                            <AlertCircle size={18} aria-hidden="true" />
                            <p>{paymentConfigurationError}</p>
                          </div>
                        ) : null}

                        <p className="booking-form-note" id="booking-payment-summary">
                          {postpay
                            ? `No payment is taken now. Your card will be charged after each lesson. Moving or cancelling less than ${NOTICE_HOURS} hours before costs ${formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}, charged when you confirm the change or cancellation. A no-show costs ${formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)} instead of the lesson price.`
                            : `Pay Inês on the lesson day. Moving or cancelling less than ${NOTICE_HOURS} hours before costs ${formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}.`}
                          {form.repeat === null ? " Ongoing lessons repeat until you stop them." : ""}
                        </p>

                        <div className="booking-agreement">
                          {needsPaymentConsent ? (
                            <div className={`booking-agreement__control${paymentConsent ? " is-agreed" : ""}`}>
                              <button
                                className="booking-agreement__button"
                                type="button"
                                aria-label="Agree to terms & privacy"
                                aria-pressed={paymentConsent}
                                aria-describedby="booking-payment-summary"
                                onClick={() => setPaymentConsent((current) => !current)}
                              >
                                {paymentConsent ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                                Agree to
                              </button>
                              <a aria-haspopup="dialog" data-terms-privacy href="#terms-privacy">terms &amp; privacy</a>
                            </div>
                          ) : (
                            <a aria-haspopup="dialog" data-terms-privacy href="#terms-privacy">Terms &amp; privacy</a>
                          )}
                        </div>

                        {/* The final action names both the selection and the obligation
                            to pay, even though payment happens after the lesson. */}
                        <button className="button button--coral booking-confirm-button" disabled={!canSubmit} type="submit">
                          {submitting
                            ? "Booking…"
                            : form.repeat === "once"
                              ? bookingChoices.length > 1 ? `Book ${bookingChoices.length} lessons & agree to pay` : "Book lesson & agree to pay"
                              : seriesPreview
                                ? `Book ${seriesPreview.bookable.length === 1 ? "lesson" : `${seriesPreview.bookable.length} lessons`} & agree to pay`
                                : "Book lessons & agree to pay"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </section>
  );
}
