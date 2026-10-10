"use client";

import { MeetingLink } from "@/components/MeetingLink";

import { type ComponentType, type CSSProperties, FormEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleHelp,
  Clock3,
  Globe,
  CircleX,
  MessageSquareText,
  Plus,
  Repeat,
  UserRound,
  X
} from "lucide-react";
import { AssetMark } from "@/components/BrandMarks";
import { AccountMenu, type AccountSection } from "@/components/AccountMenu";
import { CalendarBookingPrompt } from "@/components/CalendarBookingPrompt";
/*
 * Loaded when it is needed, not before. The sign-in panel — with the Google
 * button, the segmented tabs and the whole account form behind it — is only
 * reached at the last step, and having it in the first chunk meant a student
 * choosing a lesson waited for code they might never see. It is fetched once
 * the calendar is showing and the page is idle, so it is there by the time a
 * time is chosen. The account's own code is fetched with the page whenever a
 * session is stored, since a signed-in student opens on it.
 */
const { Component: AuthPanel, load: loadAuthPanel } = deferred(() => import("@/components/AuthPanel").then((m) => m.AuthPanel), "Loading…");
const { Component: AccountControls, load: loadAccountControls } = deferred(() => import("@/components/MyLessons").then((m) => m.MyLessons));
if (typeof window !== "undefined" && readSession()) void loadAccountControls();
import { LessonMark } from "@/components/LessonMarks";
import { clearSession, fetchMe, isReturningDevice, readSession, rememberReturningStudent, subscribeToSession, type LessonSeries, type MyBooking, type Student } from "@/lib/auth-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { lockPageScroll } from "@/lib/scroll-lock";
import { SITE_BASE_PATH } from "@/lib/paths";
import {
  addDaysToKey,
  browserTimeZone,
  buildBookingWeeks,
  cancelBooking,
  createBooking,
  stripePaymentUrl,
  timeZoneName,
  fetchAvailability,
  fetchBooking,
  peekAvailability,
  fetchRecurringRates,
  recoverBookingPayment,
  formatBookedLessonLabel,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  listLessonTypes,
  clockDiffersFromPorto,
  dateKeyIn,
  formatShortDay,
  formatTimeIn,
  portoDateKey,
  portoTimeToUtc,
  portoWeekKey,
  slotsByDateIn,
  weekKeyOf,
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

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const shortMonthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const shortMonthOnly = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/**
 * The calendar's title: the months its rows start in, as each row's own label
 * names them, so "October 2026", or "October – November 2026" where the four
 * weeks cross into the next ("Oct – Nov 2026" on a phone). It stands where a
 * calendar names its month, beside the arrows, rather than as a caption row in
 * the grid.
 */
function calendarMonths(weeks: BookingWeek[]) {
  const [first, last] = [weeks[0], weeks.at(-1)].map((week) => (week ? new Date(`${week.key}T12:00:00Z`) : null));
  if (!first || !last) return { long: "", short: "" };
  if (first.getUTCMonth() === last.getUTCMonth() && first.getUTCFullYear() === last.getUTCFullYear()) {
    return { long: monthYear.format(first), short: monthYear.format(first) };
  }
  return first.getUTCFullYear() === last.getUTCFullYear()
    ? { long: `${monthOnly.format(first)} – ${monthYear.format(last)}`, short: `${shortMonthOnly.format(first)} – ${shortMonthYear.format(last)}` }
    : { long: `${monthYear.format(first)} – ${monthYear.format(last)}`, short: `${shortMonthYear.format(first)} – ${shortMonthYear.format(last)}` };
}

/**
 * Times read as a small timetable: one row per hour, one column per start
 * minute the day offers (four for quarter hours, two for half hours), so a
 * gap reads as a gap and a long day stays short. Finer grids fall back to
 * wrapping.
 */
/**
 * A day's free times in two fixed halves, divided where Inês's day divides
 * (14:00 in Porto) and named by the same span every day (from her earliest
 * start to the divide, and from it to her latest), so a full day of quarter
 * hours is never one wall of buttons and the choice never shifts under the
 * student. It reads the clock the calendar shows (`zone`). A half with nothing
 * free that day says so. Each half is a small timetable: one row per hour,
 * each start minute in its own column. It opens on the half holding the time
 * already chosen, or the first with free times.
 */
function TimePicker({ halves, renderTime, selected = "", slots, zone }: {
  /** Where the day divides and the span its halves are named by; null keeps one list. */
  halves: { first: string; last: string; split: string } | null;
  renderTime: (slot: Slot, place: CSSProperties | undefined) => ReactNode;
  selected?: string;
  slots: Slot[];
  zone: string;
}) {
  const name = useId();
  const clock = (startAt: string) => formatSlotTime(startAt, zone);
  const divide = halves?.split ?? "";
  const partOf = (startAt: string) => (clock(startAt) < divide ? "early" : "late");
  const parts = useMemo(
    () => (["early", "late"] as const).map((id) => ({
      id,
      label: !halves
        ? ""
        : id === "early" ? `${halves.first}–${halves.split}` : halves.last === halves.split ? halves.split : `${halves.split}–${halves.last}`,
      slots: slots.filter((slot) => partOf(slot.startAt) === id)
    })),
    // partOf reads only the slot times, in this zone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, halves, zone]
  );
  const [chosen, setChosen] = useState(selected ? partOf(selected) : "");
  if (!slots.length) return null;
  const current = halves
    ? parts.find((part) => part.id === chosen) ?? parts.find((part) => part.slots.length) ?? parts[0]
    : { id: "all", label: "", slots };
  const minutes = [...new Set(slots.map((slot) => clock(slot.startAt).slice(3, 5)))].sort();
  const hours = [...new Set(current.slots.map((slot) => clock(slot.startAt).slice(0, 2)))];
  const timetable = minutes.length <= 4;
  return (
    <div className="time-picker">
      {halves ? (
        <div
          aria-label={`Part of the day, ${timeZoneName(zone)}`}
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
        <p className="booking-state-note time-picker__empty">Nothing free {current.id === "early" ? "before" : "from"} {divide} on this day.</p>
      )}
    </div>
  );
}

/** Where Inês's day divides in Porto: the morning's times, and the rest. */
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

/** Whether two saved-rate maps hold the same price for every length. */
function sameRates(a: Record<number, number>, b: Record<number, number>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => a[Number(key)] === b[Number(key)]);
}

function RepeatAvailability({
  chosen,
  error,
  previewing,
  preview,
  setup = false,
  zone
}: {
  chosen: boolean;
  error: string;
  previewing: boolean;
  preview: { bookable: string[]; skipped: string[] } | null;
  setup?: boolean;
  zone: string;
}) {
  // A fully available repeat is the expected state, so it should not consume
  // space. Guidance, loading, a failed check, and clashing weeks are the only
  // states that need to ask for attention.
  if (chosen && !previewing && !error && preview && !preview.skipped.length) return null;

  return (
    <section
      className={`booking-repeat-choice${setup ? " booking-repeat-choice--setup" : ""}`}
      aria-label="Weekly lesson availability"
    >
      {!preview?.skipped.length ? (
        <p className="booking-repeat-note" role="status">
          {!chosen ? (
            "Choose a time and we’ll check every week before you book."
          ) : previewing || (!preview && !error) ? (
            "Checking which weeks are free…"
          ) : error ? (
            error
          ) : (
            "We couldn’t check the later weeks just now. Nothing is booked until you confirm."
          )}
        </p>
      ) : null}

      {!previewing && preview?.skipped.length ? (
        <div className="booking-skipped" role="status">
          <span aria-hidden="true" className="booking-skipped__mark">
            <AlertCircle size={22} strokeWidth={2.2} />
          </span>
          <div className="booking-skipped__copy">
            <p className="booking-skipped__title">
              {preview.skipped.length === 1
                ? "One week is already taken"
                : `${preview.skipped.length} weeks are already taken`}
            </p>
            <p>
              {preview.skipped.length === 1 ? "It won’t be booked" : "They won’t be booked"}; the rest go ahead.
              Change the time or length to book every week.
            </p>
            <ul>
              {preview.skipped.map((startAt) => (
                <li key={startAt}>
                  {/* A missing clock-change time has no instant. The legacy
                      skipped value identifies its date, never its wall time. */}
                  <span className="visually-hidden">{formatLongDate(startAt, zone)}</span>
                  <span aria-hidden="true">{formatShortDay(startAt, zone)}</span>
                </li>
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

/**
 * A date that a narrow booking column would wrap onto three or four lines is
 * shown short there, while the long form stays for screen readers.
 */
function WhenText({ long, short }: { long: string; short?: string }) {
  if (!short || short === long) return <>{long}</>;
  return (
    <>
      <span className="when-long">{long}</span>
      <span aria-hidden="true" className="when-short">{short}</span>
    </>
  );
}

function shortWhen(startAt: string, zone: string) {
  return `${formatShortDay(startAt, zone)}, ${formatSlotTime(startAt, zone)}`;
}

function BookingSelectionSummary({
  actionLabel,
  actionText,
  ariaLabel,
  detail,
  disabled = false,
  mark,
  onAction,
  shortTitle,
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
  /** The same moment in a few words, for a narrow column: "Fri 16 Oct, 18:00". */
  shortTitle?: string;
  title: string;
}) {
  return (
    <div className="booking-selection-summary" aria-label={ariaLabel}>
      <AssetMark asset={mark} className="booking-selection-summary__mark" />
      <span className="booking-choice-summary__copy">
        <strong>
          <WhenText long={title} short={shortTitle} />
        </strong>
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
  if (typeof window !== "undefined" && typeof window.Stripe === "function") return Promise.resolve();
  if (!stripeJs) {
    stripeJs = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      const failed = () => {
        script.remove();
        stripeJs = null;
        reject(new Error("The payment form couldn’t load. Please check your connection and try again."));
      };
      script.onload = () => {
        if (typeof window.Stripe !== "function") failed();
        else resolve();
      };
      script.onerror = failed;
      document.head.appendChild(script);
    });
  }
  return stripeJs;
}

let bookingMotionTimer: number | null = null;
let stageResize: Animation | null = null;
// A handover's first beat, while what it replaces fades down: its update
// waits here, with whatever should follow it, such as guiding the page to the
// next decision.
let handover: { land: () => void; after: (() => void)[] } | null = null;

// `booking-transitioning` on the root marks a decision's motion while it runs.
// Nothing is styled by it; the journey checks wait for it to clear.
function finishBookingMotion() {
  if (bookingMotionTimer !== null) window.clearTimeout(bookingMotionTimer);
  document.documentElement.classList.remove("booking-transitioning");
  bookingMotionTimer = null;
}

/*
 * What a decision can bring into view. Each one that is new after the
 * decision dissolves in; whatever was already there stays perfectly still,
 * rather than every surface on the page fading again at every click.
 */
const BOOKING_SURFACES = [
  ".unified-calendar",
  ".account-card",
  ".auth-panel",
  ".booking-success",
  ".booking-alert",
  ".booking-bar",
  ".booking-confirmation-stage",
  ".booking-outcome",
  ".booking-selection-stack",
  ".booking-workflow-sign-in",
  ".calendar-weeks",
  ".lesson-overview",
  ".managed-lesson__head",
  ".unified-calendar__panel-content",
  ".unified-calendar__toolbar"
].join(",");

// What a decision that replaces the workspace's content leaves behind.
const BOOKING_CALENDAR = ".unified-calendar-shell";
const CALENDAR_GRID = "#lesson-calendar .unified-calendar__grid";
const CONFIRMATION_STAGE = "#booking-confirmation-stage";
const TIMES_PANEL = "#booking-next-step";

const MOTION_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
// A resize starts gently, so a long one carries the page rather than flinging
// it most of the way in the first few frames.
const RESIZE_EASE = "cubic-bezier(0.45, 0, 0.2, 1)";
const HANDOVER_MS = 140;

/** On screen now: laid out and not hidden. A surface that only groups its children counts. */
function showing(element: Element) {
  const style = getComputedStyle(element);
  if (style.display === "contents") return true;
  return element.getClientRects().length > 0 && style.visibility !== "hidden";
}

/**
 * Whether a chosen day's times stand in for the calendar, as on a phone, or
 * sit beside it: the booking column's own width, as its container queries
 * read it.
 */
function timesTakeCalendarsPlace() {
  const column = document.querySelector<HTMLElement>(".booking-provider");
  if (!column) return false;
  const style = getComputedStyle(column);
  return column.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) < 700;
}

/**
 * A booking decision happens at once; the workspace then moves to it. The
 * surfaces it brought dissolve in from a few pixels below, and the workspace
 * eases from its old height to its new one, carrying the page beneath with
 * it, instead of snapping. Controls are live throughout; reduced motion gets
 * the new state as it is.
 *
 * A decision that replaces the workspace's content outright (a time bringing
 * the confirmation, Change or Back taking it away, a phone's times taking the
 * calendar's place) names what it replaces in `leaving`, and hands over in two
 * beats: that fades down first, briefly, then the next step dissolves in from
 * nothing, so one view never cuts straight to another (9 October 2026, at
 * Dan's request for smoother booking). A decision taken in the meantime lands
 * the first one before its own.
 */
function transitionBooking(update: () => void, leaving?: string) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }

  handover?.land();
  const stage = document.querySelector<HTMLElement>(".booking-steps");
  const going = leaving && stage ? [...stage.querySelectorAll<HTMLElement>(leaving)].filter(showing) : [];
  if (!going.length) {
    moveBooking(update, false);
    return;
  }

  if (bookingMotionTimer !== null) finishBookingMotion();
  document.documentElement.classList.add("booking-transitioning");
  const fades = going.map((element) =>
    element.animate([{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 -4px" }], {
      duration: HANDOVER_MS,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
      fill: "forwards"
    })
  );
  const step = {
    after: [] as (() => void)[],
    timer: 0,
    land() {
      if (handover !== step) return;
      handover = null;
      window.clearTimeout(step.timer);
      moveBooking(update, true);
      // Whatever the update kept, it keeps as it was.
      for (const fade of fades) fade.cancel();
      for (const follow of step.after) follow();
    }
  };
  step.timer = window.setTimeout(() => step.land(), HANDOVER_MS);
  handover = step;
}

function moveBooking(update: () => void, fromBlank: boolean) {
  if (bookingMotionTimer !== null) finishBookingMotion();
  // The steps section stays put while its content changes, the booking's
  // confirmation card included.
  const stage = document.querySelector<HTMLElement>(".booking-steps");
  // What shows now stays still; what was hidden, like a phone's calendar
  // behind its times, arrives like anything new when it shows again.
  const present = new Set(stage ? [...stage.querySelectorAll(BOOKING_SURFACES)].filter(showing) : []);
  // Mid-resize this is the height on screen, so a quick second decision
  // carries on from where the first one had got to.
  const fromHeight = stage?.getBoundingClientRect().height ?? 0;
  const floor = stage ? fillingHeight(stage, fromHeight) : 0;
  // Held through the update: measuring a shorter page would otherwise snap the
  // scroll position up before anything could ease.
  if (stage && fromHeight) stage.style.minHeight = `${fromHeight}px`;
  document.documentElement.classList.add("booking-transitioning");
  try {
    flushSync(update);
  } finally {
    bookingMotionTimer = window.setTimeout(finishBookingMotion, fromBlank ? 320 : 260);
    if (stage?.isConnected) settleStage(stage, fromHeight, floor, present, fromBlank);
    else if (stage) stage.style.minHeight = "";
  }
}

/**
 * A component whose code is fetched when it is needed. Once the code is here
 * it renders in the same commit as the decision that shows it, so that
 * decision's transition eases to its real height. (next/dynamic suspended on
 * every first render, even with the code already fetched, and React then held
 * its fallback for 300ms before the form popped in.) Code still on its way
 * eases in when it arrives.
 */
function deferred<Props extends object>(fetchComponent: () => Promise<ComponentType<Props>>, waiting = "") {
  let ready: ComponentType<Props> | null = null;
  let loading: Promise<ComponentType<Props>> | null = null;
  const load = () =>
    (loading ??= fetchComponent().then(
      (component) => (ready = component),
      (error: unknown) => {
        loading = null;
        throw error;
      }
    ));
  function Deferred(props: Props) {
    const [Loaded, setLoaded] = useState(() => ready);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (Loaded || failed) return;
      let live = true;
      load().then(
        (component) => {
          if (live) transitionBooking(() => setLoaded(() => component));
        },
        () => {
          if (live) setFailed(true);
        }
      );
      return () => {
        live = false;
      };
    }, [Loaded, failed]);
    if (Loaded) return <Loaded {...props} />;
    if (failed) {
      return (
        <p className="booking-state-note" role="alert">
          This part of the page couldn&rsquo;t load.{" "}
          <button className="text-action" onClick={() => setFailed(false)} type="button">
            Try again
          </button>
        </p>
      );
    }
    return waiting ? <p className="booking-state-note">{waiting}</p> : null;
  }
  return { Component: Deferred, load };
}

function settleStage(stage: HTMLElement, fromHeight: number, floor: number, present: Set<Element>, fromBlank = false) {
  stageResize?.cancel();
  stageResize = null;
  const toHeight = contentHeight(stage);
  stage.style.minHeight = "";
  // Only the part of the change that shows is eased.
  const start = Math.max(fromHeight, floor);
  const end = Math.max(toHeight, floor);
  if (fromHeight && Math.abs(end - start) > 4) {
    stageResize = stage.animate(
      [{ height: `${start}px`, overflow: "clip" }, { height: `${end}px`, overflow: "clip" }],
      { duration: Math.round(Math.min(520, 260 + Math.abs(end - start) * 0.3)), easing: RESIZE_EASE }
    );
  }

  // Already visible as they start, so a decision never leaves a blank moment;
  // after a handover, whose first beat already cleared the way, from nothing.
  // The rise is a `translate`, which leaves a surface's own transform alone.
  const arrived: Element[] = [];
  for (const surface of stage.querySelectorAll(BOOKING_SURFACES)) {
    if (present.has(surface) || arrived.some((outer) => outer.contains(surface)) || !showing(surface)) continue;
    arrived.push(surface);
    // An overlay, like Change's, arrives with the dialogs' own fade.
    if (getComputedStyle(surface).position === "fixed") continue;
    surface.animate(
      fromBlank
        ? [{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }]
        : [{ opacity: 0.4, translate: "0 6px" }, { opacity: 1, translate: "0 0" }],
      { duration: fromBlank ? 320 : 260, easing: MOTION_EASE }
    );
  }
}

/**
 * The workspace's height at which the page exactly fills the window. A short
 * page is held at the window's height with the footer at its foot, so below
 * this nothing on screen moves. Easing through that part spent the ease's
 * quick start where it couldn't be seen, and the part that showed snapped.
 */
function fillingHeight(stage: HTMLElement, height: number) {
  const column = stage.parentElement;
  if (!column) return 0;
  const columnStyle = getComputedStyle(column);
  const roomBelow =
    column.getBoundingClientRect().bottom - parseFloat(columnStyle.borderBottomWidth) - parseFloat(columnStyle.paddingBottom) -
    stage.getBoundingClientRect().bottom - parseFloat(getComputedStyle(stage).marginBottom);
  const pastWindow = document.documentElement.scrollHeight - window.innerHeight;
  return height + Math.max(0, roomBelow) - Math.max(0, pastWindow);
}

/** The workspace's height as its content lays out, whatever it is held at. */
function contentHeight(stage: HTMLElement) {
  const box = stage.getBoundingClientRect();
  const style = getComputedStyle(stage);
  let bottom = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
  for (const child of stage.children) {
    const childStyle = getComputedStyle(child);
    if (childStyle.display === "none" || childStyle.position === "fixed" || childStyle.position === "absolute") continue;
    bottom = Math.max(bottom, child.getBoundingClientRect().bottom + parseFloat(childStyle.marginBottom));
  }
  return bottom - box.top + parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
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
  // noticeable pause followed by a second, separate movement. A handover's
  // final DOM comes with its second beat, so the guiding waits for that.
  if (handover) handover.after.push(orient);
  else orient();
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
  const [paymentAttempt, setPaymentAttempt] = useState(0);
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
        if (cancelled || !paymentMountRef.current) return;
        if (typeof window.Stripe !== "function") throw new Error("The payment form couldn’t load. Please check your connection and try again.");
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
  }, [payment, paymentAttempt]);
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
  const slotRecheck = useRef<string[]>([]);
  const [slotNotice, setSlotNotice] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [lessonTypesError, setLessonTypesError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const loadError = lessonTypesError || availabilityError;
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
  const recurringRatesVersion = useRef(0);
  const [ratesError, setRatesError] = useState("");
  const [ratesReady, setRatesReady] = useState(false);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [lessonSeries, setLessonSeries] = useState<LessonSeries[]>([]);
  // The account as last loaded here. The account panel opens with it, rather
  // than asking for the same account again the moment it appears.
  const [loadedAccount, setLoadedAccount] = useState<Awaited<ReturnType<typeof fetchMe>>>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  // The Worker treats any non-cancelled booking as the start of the student's
  // relationship with Inês, including an upcoming first lesson. Mirror that
  // exact rule here: a card the server will refuse is a trap, not a choice.
  const [hasPriorBooking, setHasPriorBooking] = useState(false);
  // Someone who has signed in on this browser before is offered sign-in and
  // no trial; a first-time visitor sees neither until the confirmation.
  const returningDevice = useSyncExternalStore(subscribeToSession, isReturningDevice, () => false);

  // A tab left open overnight moves on to the new day when it is next looked at.
  useEffect(() => {
    const refresh = () => {
      const key = portoDateKey(new Date());
      setTodayKey((current) => (current && current !== key ? key : current));
    };
    const timer = window.setInterval(refresh, 5 * 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
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
  // The lesson as the calendar already knows it, shown while its full details
  // load, so opening it is immediate and the dialog never changes size.
  const [managePreview, setManagePreview] = useState<MyBooking | null>(null);
  const managedRequest = useRef(0);
  const accountRequest = useRef(0);
  const bookingRequest = useRef(0);
  const availabilityVersion = useRef(0);
  useEffect(() => () => {
    managedRequest.current += 1;
    accountRequest.current += 1;
    bookingRequest.current += 1;
    availabilityVersion.current += 1;
  }, []);
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
    const version = ++recurringRatesVersion.current;
    setRatesReady(false);
    setRecurringRates({});
    setRatesError("");
    if (rateStudentId) {
      fetchRecurringRates(readSession()).then((data) => {
        if (active && version === recurringRatesVersion.current) { setRecurringRates(data.rates); setRatesReady(true); }
      }).catch(() => {
        if (active && version === recurringRatesVersion.current) setRatesError("We couldn’t check your saved weekly rate. Please reload before booking weekly lessons.");
      });
    }
    return () => { active = false; };
  }, [rateStudentId]);

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

  /*
   * The clock each view reads. Online, a lesson is at the student's own time,
   * wherever they are; a lesson in Porto happens there, so it stays on Porto's
   * clock. Booking and changing a lesson follow the place chosen, and Your
   * lessons shows each lesson by its own. Dates follow the same clock, so a
   * lesson falls on the student's own day.
   */
  const zoneOf = (lesson: { location: "online" | "porto" }) => (lesson.location === "porto" ? BOOKING_TIME_ZONE : studentZone);
  const viewZone = managed && isManagedReschedule
    ? zoneOf({ location: managedLocation })
    : intent === "book" && !managed
      ? zoneOf(form)
      : studentZone;
  const viewZoneName = timeZoneName(viewZone);
  const viewTodayKey = todayKey ? dateKeyIn(new Date(clock), viewZone) : "";
  // Free times on the shown clock's days (the Worker groups them by Porto's).
  const viewSlotsByDate = useMemo(() => slotsByDateIn(slotsByDate, viewZone), [slotsByDate, viewZone]);
  const studentClockDiffers = useMemo(() => clockDiffersFromPorto(studentZone), [studentZone]);
  // A time standing on its own names its clock only for a student whose clock
  // differs from Porto's. In Portugal a plain time is unambiguous, as it was;
  // the confirmation and the day's times still name the clock once.
  const lessonTime = useCallback(
    (startAt: string, zone: string) => (studentClockDiffers ? formatTimeIn(startAt, zone) : formatSlotTime(startAt, zone)),
    [studentClockDiffers]
  );
  const canChangeManagedDuration =
    managedDurationChoices.length > 1 && ["not_required", "scheduled"].includes(managedPaymentStatus);

  const refreshStudent = useCallback(async () => {
    const request = ++accountRequest.current;
    const session = readSession();
    if (!session) {
      setStudent(null);
      setMyBookings([]);
      setLessonSeries([]);
      setHasPriorBooking(false);
      setLoadedAccount(null);
      return null;
    }

    let data: Awaited<ReturnType<typeof fetchMe>>;
    try {
      data = await fetchMe(session);
    } catch (caught) {
      if (request !== accountRequest.current || readSession() !== session) return null;
      throw caught;
    }
    if (request !== accountRequest.current || readSession() !== session) return null;
    setAccountLoadError("");
    setLoadedAccount(data);
    setStudent(data?.student ?? null);
    setMyBookings(data?.bookings ?? []);
    setLessonSeries(data?.series ?? []);
    // An unfinished card-setup hold is released by the next booking, so it is
    // not a lesson yet and must not hide the trial.
    const booked = (data?.bookings ?? []).some((booking) => booking.status === "confirmed");
    setHasPriorBooking(booked);
    if (booked && data?.student?.role !== "teacher") rememberReturningStudent();
    return data;
  }, []);

  const refreshStudentInBackground = useCallback(() => {
    const session = readSession();
    void refreshStudent().catch(() => {
      if (readSession() === session) {
        setAccountLoadError("We couldn’t refresh your account just now. Please check your connection and try again.");
      }
    });
  }, [refreshStudent]);

  // A session can change in another tab. Remove its private calendar and
  // management links immediately, and load a replacement account separately.
  // Keep the visitor's unsubmitted booking choices through their own sign-in.
  useEffect(() => {
    let session = readSession();
    return subscribeToSession((event) => {
      const current = readSession();
      if (current === session) return;
      const previous = session;
      session = current;
      managedRequest.current += 1;
      accountRequest.current += 1;
      bookingRequest.current += 1;
      availabilityVersion.current += 1;
      setAvailabilityRequest((value) => value + 1);
      setManageLoading(false);
      setManageWorking(false);
      setSubmitting(false);
      if (
        current && event instanceof CustomEvent &&
        event.detail?.previousSession === previous &&
        event.detail?.studentId === student?.id
      ) {
        // The API verified this account's email change. Keep its open editor
        // and drafts while loading the account with the renewed token.
        refreshStudentInBackground();
        return;
      }
      setManaged(null);
      setManagedToken("");
      setManagedSeriesId(null);
      setManageError("");
      setManageOutcome("");
      setBookingPromptDate("");
      setStudent(null);
      setLoadedAccount(null);
      setMyBookings([]);
      setLessonSeries([]);
      setHasPriorBooking(false);
      setConfirmation(null);
      setPayment(null);
      setPaymentError("");
      setCardReturn(null);
      setAccountLoadError("");
      if (current) {
        void refreshStudent().catch(() => {
          if (readSession() === current) setAccountLoadError("We couldn’t reach your account just now. Please check your connection and try again.");
        });
      }
    });
  }, [refreshStudent, refreshStudentInBackground, student?.id]);

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
      .catch((error: Error) => setLessonTypesError(error.message));

    // `fetchMe` already clears a genuinely invalid session on a 401. A network
    // interruption (including a quick reload while this request is in flight)
    // must not sign the student out as a side effect.
    // A read overtaken by a newer one, as when another tab signs in again,
    // says nothing about who is signed in now: its refusal of the old session
    // is not a sign-out. Ask again for the session the page holds, and open on
    // that answer instead of on booking.
    const loadAccount = (): ReturnType<typeof refreshStudent> =>
      refreshStudent().then((data) => (data || !readSession() ? data : loadAccount()));
    loadAccount()
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
        if (result.booking.meetingUrl) refreshStudentInBackground();
      } catch { /* The existing booking remains usable during a network delay. */ }
    }
    const timers = [3000, 10000, 30000, 65000, 125000].map(delay => window.setTimeout(() => void refreshMeeting(), delay));
    return () => { active = false; timers.forEach(timer => window.clearTimeout(timer)); };
  }, [awaitingMeetToken, refreshStudentInBackground]);

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
    const request = ++managedRequest.current;
    setIntent("lessons");
    setManaged(null);
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
      if (request !== managedRequest.current) return;
      transitionBooking(() => {
        setManaged(result);
        setManagedLessonTypeId(result.booking.lessonType.id);
        setManagedLocation(result.booking.location);
        // Read here rather than from render state: this callback outlives renders.
        setSelectedDate(dateKeyIn(new Date(result.booking.startAt), result.booking.location === "porto" ? BOOKING_TIME_ZONE : browserTimeZone()));
        setManageMode(initialMode);
        setManageLoading(false);
      });
    } catch (caught) {
      if (request !== managedRequest.current) return;
      transitionBooking(() => {
        setManaged(null);
        setManagedLessonTypeId("");
        setManageError(caught instanceof Error ? caught.message : "That lesson couldn’t be opened.");
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
        // Only the returned lesson's token identifies this checkout. An
        // account with older confirmed lessons does not prove a new booking.
        if (!token) await refreshStudent();
        const confirmed = Boolean(token && (await fetchBooking(token)).booking.status === "confirmed");
        if (!active) return;
        if (confirmed) {
          setCardReturn((current) => current && { ...current, state: "confirmed" });
          setUpcomingRequestKey((current) => current + 1);
          refreshStudentInBackground();
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
  }, [cardReturn?.state, cardReturn?.token, refreshStudent, refreshStudentInBackground]);

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
      const request = ++availabilityVersion.current;
      const session = readSession();
      if (!availabilityLessonTypeId || !todayKey) {
        setSlotsByDate({});
        setLoadingSlots(false);
        return;
      }

      /*
       * Ask for more than the horizon and let the Worker clamp it, rather than
       * hard-coding a window that has to be remembered every time the horizon
       * moves. It was fixed at 62 days while the grid was sized from whatever
       * horizon the API reported — so raising the horizon past 62 would have
       * drawn weeks of empty cells announcing "no times free", which would have
       * been a lie rather than a gap.
       */
      const until = addDaysToKey(todayKey, 140);
      const moving = { manageToken: movingToken, seriesId: movingSeriesId, session: movingSeriesId ? readSession() : "" };
      // Times fetched a moment ago (or ahead of time, while the page was idle)
      // show at once, with no "Checking what's free…" in between.
      const ready = peekAvailability(availabilityLessonTypeId, todayKey, until, moving);
      if (ready) {
        setSlotsByDate(ready.slotsByDate);
        setHorizonDays(ready.horizonDays || BOOKING_HORIZON_DAYS_FALLBACK);
        setLessonGapMinutes(Math.max(0, Number(ready.bufferMinutes) || 0));
        setAvailabilityError("");
        setLoadingSlots(false);
        return;
      }

      setLoadingSlots(true);
      setAvailabilityError("");

      fetchAvailability(availabilityLessonTypeId, todayKey, until, signal, moving)
        .then((data) => {
          if (request !== availabilityVersion.current || signal?.aborted || readSession() !== session) return;
          setSlotsByDate(data.slotsByDate);
          setHorizonDays(data.horizonDays || BOOKING_HORIZON_DAYS_FALLBACK);
          setLessonGapMinutes(Math.max(0, Number(data.bufferMinutes) || 0));
        })
        .catch((error: Error) => {
          if (request !== availabilityVersion.current || signal?.aborted || readSession() !== session) return;
          setSlotsByDate({});
          setAvailabilityError(error.message);
        })
        .finally(() => {
          if (request === availabilityVersion.current && !signal?.aborted && readSession() === session) setLoadingSlots(false);
        });
    },
    // availabilityRequest is a deliberate trigger: see where it is declared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availabilityLessonTypeId, todayKey, availabilityRequest, movingToken, movingSeriesId]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadAvailability(controller.signal);
    return () => {
      availabilityVersion.current += 1;
      controller.abort();
    };
  }, [loadAvailability]);

  /*
   * While the page is idle, fetch what the next likely step needs, so it shows
   * at once rather than after a round trip: the other lessons on offer while
   * booking, the lesson a signed-in student would book next from their
   * lessons, and an open lesson's own free times for Change. Signed out, the
   * account form's code comes too, ready for the confirmation.
   */
  useEffect(() => {
    if (!todayKey || checkingSession || loadingSlots) return;
    const until = addDaysToKey(todayKey, 140);
    const wanted: { typeId: string; manageToken?: string }[] = [];
    if (managed) {
      if (!isManagedReschedule && managed.booking.status === "confirmed" && !managed.isPast && !managed.changeLocked && managedToken) {
        wanted.push({ typeId: managed.booking.lessonType.id, manageToken: managedToken });
      }
    } else if (intent === "book") {
      for (const type of lessonTypes) {
        if (type.id !== lessonTypeId && (type.id !== "trial" || (offerTrial && !hasPriorBooking))) wanted.push({ typeId: type.id });
      }
    } else if (intent === "lessons" && student) {
      wanted.push({ typeId: defaultLessonChoice(false).typeId });
    }
    const signedOut = !student && intent === "book";
    if (!wanted.length && !signedOut) return;
    const run = () => {
      for (const { typeId, manageToken } of wanted) {
        if (typeId) void fetchAvailability(typeId, todayKey, until, undefined, { manageToken }).catch(() => {});
      }
      if (signedOut) void loadAuthPanel();
    };
    const idle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 400);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  // defaultLessonChoice reads the lesson types and preferences listed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, checkingSession, loadingSlots, managed, isManagedReschedule, managedToken, intent, lessonTypes, lessonTypeId, offerTrial, hasPriorBooking, student, preferredLessonTypeId]);

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

  // Each lesson on its own clock's day.
  const lessonDateKey = (booking: MyBooking) => dateKeyIn(new Date(booking.startAt), zoneOf(booking));
  const allBookingsByDate = calendarBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = lessonDateKey(booking);
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const isLessonsCalendarOverview = intent === "lessons" && !isManagedReschedule;
  const allCalendarWeeks = viewTodayKey ? buildBookingWeeks(viewTodayKey, horizonDays) : [];
  const firstRelevantWeek = allCalendarWeeks.findIndex((week) =>
    week.cells.some((cell) => Boolean(viewSlotsByDate[cell.key]?.length || allBookingsByDate[cell.key]?.length))
  );
  const currentWeekHasBooking = Boolean(
    allCalendarWeeks[0]?.cells.some((cell) => Boolean(allBookingsByDate[cell.key]?.length))
  );
  const todayWeekday = viewTodayKey ? new Date(`${viewTodayKey}T12:00:00Z`).getUTCDay() : -1;
  const startsOnClosedWeekend = (todayWeekday === 0 || todayWeekday === 6) && !currentWeekHasBooking;
  const uncappedCalendarWeeks =
    availabilityLessonTypeId && firstRelevantWeek > 0
      ? allCalendarWeeks.slice(firstRelevantWeek)
      : !availabilityLessonTypeId && startsOnClosedWeekend
        ? allCalendarWeeks.slice(1)
        : allCalendarWeeks;
  // Booking offers the whole horizon, four weeks at a time. The inclusive
  // range can touch one more Monday–Sunday row than the horizon has weeks;
  // that partial row is not shown.
  const horizonWeekCount = Math.ceil(horizonDays / 7);
  const bookingRangeWeeks = uncappedCalendarWeeks.slice(0, horizonWeekCount);
  // Your lessons pages the same way, from this week through the horizon or to
  // the last booked lesson if that is later (an ongoing run is kept twelve
  // weeks ahead), so every lesson can be reached from the calendar.
  const lastLessonKey = calendarBookings.map(lessonDateKey).sort().at(-1) ?? "";
  const lessonsRangeWeeks = viewTodayKey
    ? buildBookingWeeks(viewTodayKey, Math.max(horizonDays, lastLessonKey ? daysBetween(viewTodayKey, lastLessonKey) : 0))
        .filter((week, index) => index < horizonWeekCount || week.cells[0].key <= lastLessonKey)
    : [];
  const rangeWeeks = isLessonsCalendarOverview ? lessonsRangeWeeks : bookingRangeWeeks;
  const calendarPages: BookingWeek[][] = [];
  for (let index = 0; index < rangeWeeks.length; index += CALENDAR_PAGE_WEEKS) {
    calendarPages.push(rangeWeeks.slice(index, index + CALENDAR_PAGE_WEEKS));
  }
  const pageAnchor = calendarPageStart || (selectedDate ? weekKeyOf(selectedDate) : "");
  const calendarPageIndex = Math.max(
    0,
    pageAnchor ? calendarPages.findIndex((page) => page.some((week) => week.key === pageAnchor)) : 0
  );
  const pagedCalendarWeeks = calendarPages[calendarPageIndex] ?? [];
  const pageFirstKey = pagedCalendarWeeks[0]?.cells[0]?.key ?? "";
  const pageLastKey = pagedCalendarWeeks.at(-1)?.cells.at(-1)?.key ?? "";
  const laterLessonCount = isLessonsCalendarOverview && pageLastKey
    ? calendarBookings.filter((booking) => lessonDateKey(booking) > pageLastKey).length
    : 0;
  const selectedCalendarWeek = selectedDate
    ? rangeWeeks.find((week) => week.cells.some((cell) => cell.key === selectedDate))
    : undefined;
  const visibleCalendarWeekCount = calendarWeekCount === 1 && !selectedCalendarWeek ? CALENDAR_PAGE_WEEKS : calendarWeekCount;
  // A second weekly time is chosen in the first one's week, shown on the
  // calendar's clock. (Which times qualify is Porto's week: see selectionWeek.)
  const restrictedWeek = !managed && bookingKind === "recurring" && savedChoices.length
    ? weekKeyOf(dateKeyIn(new Date(savedChoices[0].startAt), viewZone)) : "";
  const displayedCalendarWeeks = restrictedWeek
    ? rangeWeeks.filter((week) => week.key === restrictedWeek)
    : visibleCalendarWeekCount === 1 && selectedCalendarWeek
      ? [selectedCalendarWeek]
      : pagedCalendarWeeks;
  const returnCalendarWeekCount = visibleCalendarWeekCount === 1 ? CALENDAR_PAGE_WEEKS : null;
  const calendarMonthsLabel = calendarMonths(displayedCalendarWeeks);
  const visibleCalendarDates = new Set(displayedCalendarWeeks.flatMap((week) => week.cells.map((cell) => cell.key)));
  // Where a pointer can hover, the next lesson is read off the calendar: its
  // day stands out and hovering shows the details. The row above the calendar
  // is for touch screens, narrow cards and a next lesson beyond the first four
  // weeks, where the calendar can't show it.
  const nextLessonKey = nextLesson ? lessonDateKey(nextLesson) : "";
  const nextLessonOnFirstPage = Boolean(
    nextLessonKey && calendarPages[0]?.some((week) => week.cells.some((cell) => cell.key === nextLessonKey))
  );
  const calendarWindowBookings = calendarBookings.filter((booking) =>
    visibleCalendarDates.has(lessonDateKey(booking))
  );
  const bookingsByDate = calendarWindowBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = lessonDateKey(booking);
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const selectionWeek = !managed && bookingKind === "recurring" && savedChoices.length
    ? portoWeekKey(savedChoices[0].startAt) : "";
  const lessonGapMs = lessonGapMinutes * 60000;
  const selectableSlots = (date: string) => (viewSlotsByDate[date] ?? []).filter((slot) => managed || intent !== "book" || (
    (!selectionWeek || portoWeekKey(slot.startAt) === selectionWeek) &&
    !savedChoices.some((choice) =>
      Date.parse(choice.startAt) < Date.parse(slot.endAt) + lessonGapMs &&
      Date.parse(choice.endAt) + lessonGapMs > Date.parse(slot.startAt))
  ));
  const rawDaySlots = selectedDate ? selectableSlots(selectedDate) : [];
  // Until a day is chosen the times panel waits out of sight, so a window with
  // nothing free says so on the calendar itself.
  const noFreeTimes = intent === "book" && !managed && !selectedDate && !loadingSlots && Boolean(lessonType) &&
    !(restrictedWeek ? displayedCalendarWeeks : rangeWeeks).some((week) => week.cells.some((cell) => selectableSlots(cell.key).length));
  const managedDate = managed ? dateKeyIn(new Date(managed.booking.startAt), viewZone) : "";
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
  const managedStartAt = shouldShowCurrentManagedSlot && managed ? managed.booking.startAt : "";
  /*
   * Inês's day divides at 14:00 in Porto. On another clock it divides at that
   * same moment, unless her day runs across the student's midnight, when it
   * divides at their noon instead. Named in the shown clock, from the earliest
   * start in the loaded weeks to the latest, in whole hours so a 90-minute
   * lesson's earlier last start does not move them.
   */
  const timeHalves = useMemo(() => {
    const starts = Object.values(slotsByDate).flat().map((slot) => slot.startAt);
    if (managedStartAt) starts.push(managedStartAt);
    if (!starts.length) return null;
    const clocks = starts.map((startAt) => formatSlotTime(startAt, viewZone)).sort();
    let split = DAY_SPLIT;
    if (viewZone !== BOOKING_TIME_ZONE) {
      const portoClocks = starts.map((startAt) => formatSlotTime(startAt)).sort();
      const reference = todayKey || portoDateKey(new Date());
      const shown = (portoClock: string) => {
        try {
          return formatSlotTime(portoTimeToUtc(reference, portoClock), viewZone);
        } catch {
          return "";
        }
      };
      const wraps = shown(portoClocks[0]) > shown(portoClocks[portoClocks.length - 1]);
      split = wraps ? "12:00" : shown(DAY_SPLIT) || "12:00";
    }
    const early = clocks.filter((clock) => clock < split);
    const late = clocks.filter((clock) => clock >= split);
    if (!early.length || !late.length) return null;
    const upToHour = (clock: string) =>
      clock.endsWith(":00") ? clock : `${String(Number(clock.slice(0, 2)) + 1).padStart(2, "0")}:00`;
    return { first: `${early[0].slice(0, 2)}:00`, last: upToHour(late[late.length - 1]), split };
  }, [slotsByDate, managedStartAt, viewZone, todayKey]);
  // A refreshed availability response must not erase a date from the review
  // after a failed submission. Keep it visible so the student can change it.
  const reviewedSlot = useMemo(() => step === "details" && selectedSlot && lessonType && !managed
    ? { startAt: selectedSlot, endAt: new Date(Date.parse(selectedSlot) + lessonType.duration_minutes * 60000).toISOString() }
    : null, [step, selectedSlot, lessonType, managed]);
  const chosen = daySlots.find((slot) => slot.startAt === selectedSlot) ?? reviewedSlot;
  const bookingChoices = useMemo(() => [...savedChoices, ...(chosen ? [chosen] : [])].sort((a, b) => a.startAt.localeCompare(b.startAt)), [savedChoices, chosen]);
  // Choosing a replacement time, or any reset of the selection, ends a change.
  const activeChange = changingChoice && !selectedSlot ? changingChoice : null;
  const choiceStarts = useMemo(() => bookingChoices.map((choice) => choice.startAt), [bookingChoices]);
  const choiceKey = choiceStarts.join(",");
  const selectedDayBookings = selectedDate ? bookingsByDate[selectedDate] ?? [] : [];
  const isConfirmingBooking = step === "details" && Boolean(lessonType && chosen) && !managed;
  // An expired bearer is only discovered after the account read. An explicit
  // lessons destination still needs sign-in when that read clears the token;
  // an interrupted read with a retained bearer keeps its retry/error state.
  const needsLessonsSignIn = intent === "lessons" && !student && (
    showAccountSignIn || !checkingSession && !readSession()
  );
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
  const lessonPreview = manageLoading && managePreview?.manageToken === managedToken ? managePreview : null;
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
          setSeriesPreviewError("We couldn’t check the later weeks just now. Nothing is booked until you confirm.");
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
    (form.repeat === "once" || ratesReady) &&
    !previewing &&
    !loadingSlots &&
    !paymentConfigurationError &&
    (!needsPaymentConsent || paymentConsent);

  useEffect(() => {
    if (!slotRecheck.current.length || loadingSlots) return;
    // A failed reload says nothing about the times; its own error shows, and
    // booking re-checks every time anyway.
    if (loadError) return;
    slotRecheck.current = [];
    // The student may have opened Add/Change while the lookup failed. Validate
    // today's selection on every step, rather than the starts captured before
    // those edits, and update saved durations before offering another time.
    const kept = [...new Set([...savedChoices.map((choice) => choice.startAt), ...(selectedSlot ? [selectedSlot] : [])])];
    const fresh = (startAt: string) =>
      (slotsByDate[portoDateKey(new Date(startAt))] ?? []).find((slot) => slot.startAt === startAt);
    const taken = kept.filter((startAt) => !fresh(startAt));
    // Check the whole selection too: individually free starts can overlap
    // one another after a longer lesson or a changed gap is applied.
    const accepted: Slot[] = [];
    const overlapping: string[] = [];
    for (const slot of kept.flatMap((startAt) => {
      const found = fresh(startAt);
      return found ? [found] : [];
    }).sort((a, b) => a.startAt.localeCompare(b.startAt))) {
      if (accepted.some((other) =>
        Date.parse(other.startAt) < Date.parse(slot.endAt) + lessonGapMs &&
        Date.parse(other.endAt) + lessonGapMs > Date.parse(slot.startAt)
      )) overlapping.push(slot.startAt);
      else accepted.push(slot);
    }
    const rejected = [...taken, ...overlapping];
    const allowed = new Set(accepted.map((slot) => slot.startAt));
    // Saved lessons take the new length's end times and lose invalid starts.
    setSavedChoices((current) => current.flatMap((choice) => {
      const slot = fresh(choice.startAt);
      return slot && allowed.has(choice.startAt) ? [slot] : [];
    }));
    if (!rejected.length) return;
    const describe = (starts: string[], reason: string) => starts.length
      ? `${starts.map((startAt) => `${formatLongDate(startAt, viewZone)}, ${lessonTime(startAt, viewZone)}`).join("; ")} ${starts.length === 1 ? "is" : "are"} ${reason}.`
      : "";
    setSlotNotice([
      describe(taken, "not free at this length"),
      describe(overlapping, "too close to another chosen lesson at this length"),
      rejected.includes(selectedSlot) ? "Choose another time." : `${rejected.length === 1 ? "It came" : "They came"} off your selection.`
    ].filter(Boolean).join(" "));
    if (rejected.includes(selectedSlot)) {
      setSelectedSlot("");
      goTo("time");
    }
  }, [loadingSlots, slotsByDate, selectedSlot, step, loadError, lessonGapMs, savedChoices, viewZone, lessonTime]);

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
    const frame = requestAnimationFrame(() => document.getElementById("booking-success-heading")?.focus({ preventScroll: true }));
    orientTo("booking-success");
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
      setManagePreview(booking);
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
    // Leaving booking for Your lessons refreshes the list, as the booking
    // bar's own way back does. From the profile or past lessons nothing has
    // changed, and a reload there could only bring back an older copy of a
    // field just saved.
    if (section === "upcoming" && intent === "book") setUpcomingRequestKey((current) => current + 1);
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
    const request = ++bookingRequest.current;
    const session = readSession();
    // A page turn changes the address a moment before this page unmounts, and
    // the unmount is what retires the request. A student who has already left
    // for another page is never sent on to payment or shown this page's error.
    const page = window.location.pathname;
    const current = () => request === bookingRequest.current && readSession() === session && window.location.pathname === page;

    try {
      const repeat = repeatPayload(form.repeat);
      const result = await createBooking(session, {
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
      if (!current()) return;

      // A first booking is held while Stripe saves and authenticates a card.
      // This setup step does not charge it; the webhook then confirms the slot.
      if (result.checkoutClientSecret) {
        if (STRIPE_PUBLISHABLE_READY) {
          setPaymentError("");
          setPayment({ clientSecret: result.checkoutClientSecret });
          return;
        }
        setSubmitError("Payment isn’t available just now. Please try again in a few minutes, or message Inês.");
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
      refreshStudentInBackground();
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : "The booking couldn’t be created.";
      setSubmitError(message);
      if (/taken|available/i.test(message)) {
        loadAvailability();
        if (bookingChoices.length === 1) goTo("time");
      }
    } finally {
      if (request === bookingRequest.current) setSubmitting(false);
    }
  }

  /**
   * The dialog can sit open while the 14-hour line passes. Look again before
   * acting, so a fee that has just started to apply is shown, not surprised on.
   */
  async function feeStillAsShown() {
    if (!managedToken || !managed || managed.sameDayFeeApplies) return true;
    const request = managedRequest.current;
    const fresh = await fetchBooking(managedToken);
    if (request !== managedRequest.current) return false;
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
    const request = managedRequest.current;
    setManageWorking(true);
    setManageError("");
    try {
      const previousLessonTypeId = managed.booking.lessonType.id;
      const movingSequence = manageMode === "reschedule-sequence";
      if (!movingSequence && !(await feeStillAsShown())) return;
      let sameDayFeeApplied = false;
      let keptStarts: string[] = [];
      let updatedBooking = managed.booking;
      if (movingSequence) {
        if (!resolvedManagedSeriesId) throw new Error("That weekly lesson couldn’t be found.");
        const moved = await rescheduleSeries(
          readSession(),
          resolvedManagedSeriesId,
          selectedSlot,
          managedLessonTypeId || previousLessonTypeId,
          managedLocation,
          managedPrice
        );
        keptStarts = moved.kept ?? [];
        // A lesson inside the notice window may stay put while the rest of
        // its sequence moves. Use its own returned booking when it moved.
        updatedBooking = moved.bookings.find((booking) => booking.reference === managed.booking.reference) ?? managed.booking;
      } else {
        const result = await rescheduleBooking(
          managedToken,
          selectedSlot,
          managedLessonTypeId || previousLessonTypeId,
          managedLocation,
          managedPrice
        );
        sameDayFeeApplied = result.sameDayFeeApplied;
        updatedBooking = result.booking;
      }
      if (request !== managedRequest.current) return;
      // The mutation reply already proves the saved time. A failed reread
      // must not leave an accepted change looking like an unsaved form.
      const saved = { ...managed, booking: updatedBooking };
      transitionBooking(() => {
        setManaged(saved);
        setManagedLessonTypeId(saved.booking.lessonType.id);
        setManagedLocation(saved.booking.location);
        setSelectedDate(dateKeyIn(new Date(saved.booking.startAt), zoneOf(saved.booking)));
        setSelectedSlot("");
        setManageMode("view");
        setManageOutcome(
          movingSequence
            ? `Your upcoming weekly lessons have moved. We’ve emailed you and updated your calendar.${
                keptStarts.length
                  ? ` ${keptStarts.map((startAt) => `${formatLongDate(startAt, viewZone)} at ${lessonTime(startAt, viewZone)}`).join(" and ")} stays where it is, as it’s less than ${NOTICE_HOURS} hours away.`
                  : ""
              }`
            : saved.booking.lessonType.id === previousLessonTypeId
            ? `Your lesson has been changed. We’ve emailed you and updated your calendar.${lateFeeNote(sameDayFeeApplied, saved.booking.sameDayFeeCents)}`
            : `Your lesson is now ${formatBookedLessonLabel(saved.booking.lessonType)}. We’ve emailed you and updated your calendar.${lateFeeNote(sameDayFeeApplied, saved.booking.sameDayFeeCents)}`
        );
      });
      refreshStudentInBackground();
    } catch (caught) {
      if (request !== managedRequest.current) return;
      setManageError(caught instanceof Error ? caught.message : "That lesson couldn’t be changed.");
      loadAvailability();
    } finally {
      if (request === managedRequest.current) setManageWorking(false);
    }
  }

  async function cancelManagedLesson() {
    if (!managedToken || !managed) return;
    const request = managedRequest.current;
    setManageWorking(true);
    setManageError("");
    try {
      if (!(await feeStillAsShown())) {
        setManageMode("view");
        return;
      }
      const result = await cancelBooking(managedToken);
      if (request !== managedRequest.current) return;
      transitionBooking(() => {
        setManaged({ ...managed, booking: result.booking });
        setManageMode("view");
        setManageOutcome(
          result.booking.paymentStatus === "refunded"
            ? "Your lesson has been cancelled. Your refund is on its way back to your card."
            : `Your lesson has been cancelled. We’ve emailed you and updated your calendar.${lateFeeNote(result.sameDayFeeApplied, result.booking.sameDayFeeCents)}`
        );
      });
      refreshStudentInBackground();
    } catch (caught) {
      if (request !== managedRequest.current) return;
      setManageError(caught instanceof Error ? caught.message : "That lesson couldn’t be cancelled.");
    } finally {
      if (request === managedRequest.current) setManageWorking(false);
    }
  }

  async function stopManagedSequence(cancelRemaining = false) {
    if (!resolvedManagedSeriesId) return;
    const request = managedRequest.current;
    setManageWorking(true);
    setManageError("");
    try {
      const result = await stopSeries(readSession(), resolvedManagedSeriesId, cancelRemaining);
      if (request !== managedRequest.current) return;
      transitionBooking(() => {
        setManageMode("view");
        setLessonSeries((current) => current.filter((entry) => entry.id !== resolvedManagedSeriesId));
        if (!cancelRemaining) {
          setManageOutcome("Your weekly lessons have stopped repeating. The lessons already booked stay in your calendar.");
          return;
        }

        const cancelledLessons = `${result.cancelled} ${result.cancelled === 1 ? "lesson" : "lessons"}`;
        setManageOutcome(
          result.pendingRefunds
            ? `Your weekly lessons have stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled. ${result.pendingRefunds === 1 ? "1 refund is" : `${result.pendingRefunds} refunds are`} being confirmed; ${result.pendingRefunds === 1 ? "that lesson stays" : "those lessons stay"} reserved and locked until then.`
            : result.kept
            ? `Your weekly lessons have stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled. Any lesson less than ${NOTICE_HOURS} hours away, or with a payment still going through, stays booked; check your calendar.`
            : result.cancelled
              ? `Your weekly lessons have stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled.`
              : "Your weekly lessons have stopped. There were no future booked lessons to cancel."
        );
      });
      refreshStudentInBackground();
    } catch (caught) {
      if (request !== managedRequest.current) return;
      setManageError(caught instanceof Error ? caught.message : cancelRemaining ? "Those lessons couldn’t be cancelled." : "Those weekly lessons couldn’t be stopped.");
    } finally {
      if (request === managedRequest.current) setManageWorking(false);
    }
  }

  const closeManagedLesson = useCallback(() => {
    managedRequest.current += 1;
    setManageLoading(false);
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
    requestAnimationFrame(() => restoreDialogFocus(trigger));
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
    const releaseScroll = lockPageScroll();
    const frame = requestAnimationFrame(() => {
      if (isManagedReschedule) managedRescheduleRef.current?.focus({ preventScroll: true });
      else manageDialogRef.current?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      // A native dialog above this overlay owns Escape until it closes.
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) dismissManagedDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      releaseScroll();
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dismissManagedDialog, isManagedReschedule, manageDialogOpen, manageMode]);

  // Where the change form sits beside the calendar (the booking column's
  // two-column layout, `@container booking (min-width: 700px)`), there is room
  // for the usual four weeks. Where it stacks beneath, the lesson's own week
  // keeps the overlay short, with Show all for the rest.
  function changeFormBesideCalendar() {
    const column = managedRescheduleRef.current?.closest<HTMLElement>(".booking-provider");
    if (!column) return false;
    const style = getComputedStyle(column);
    return column.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) >= 700;
  }

  function beginManagedReschedule() {
    if (!managed) return;
    const managedDate = dateKeyIn(new Date(managed.booking.startAt), zoneOf(managed.booking));
    const isInCalendar = bookingRangeWeeks.some((week) => week.cells.some((cell) => cell.key === managedDate));
    const calendarHeight = managedRescheduleRef.current?.getBoundingClientRect().height ?? 0;
    transitionBooking(() => {
      setManagedCalendarPlaceholderHeight(calendarHeight);
      setCalendarPageStart(isInCalendar ? weekKeyOf(managedDate) : "");
      setAvailabilityRequest((current) => current + 1);
      setManageMode("reschedule");
      setManagedLessonTypeId(managed.booking.lessonType.id);
      setManagedLocation(managed.booking.location);
      setSelectedDate(isInCalendar ? managedDate : "");
      setSelectedSlot(isInCalendar ? managed.booking.startAt : "");
      setCalendarWeekCount(isInCalendar && !changeFormBesideCalendar() ? 1 : 4);
      setManageError("");
      setLoadingSlots(true);
    });
  }

  function beginManagedSeriesReschedule() {
    if (!managed || !activeManagedSeries) return;
    const managedDate = dateKeyIn(new Date(managed.booking.startAt), zoneOf(managed.booking));
    const isInCalendar = bookingRangeWeeks.some((week) => week.cells.some((cell) => cell.key === managedDate));
    const calendarHeight = managedRescheduleRef.current?.getBoundingClientRect().height ?? 0;
    transitionBooking(() => {
      setManagedCalendarPlaceholderHeight(calendarHeight);
      setCalendarPageStart(isInCalendar ? weekKeyOf(managedDate) : "");
      setAvailabilityRequest((current) => current + 1);
      setManageMode("reschedule-sequence");
      setManagedLessonTypeId(managed.booking.lessonType.id);
      setManagedLocation(managed.booking.location);
      setSelectedDate(isInCalendar ? managedDate : "");
      setSelectedSlot(isInCalendar ? managed.booking.startAt : "");
      setCalendarWeekCount(isInCalendar && !changeFormBesideCalendar() ? 1 : 4);
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
    orientTo("account-controls");
    window.requestAnimationFrame(() => document.getElementById("upcoming-lessons-heading")?.focus({ preventScroll: true }));
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
    }, true);
  }

  function chooseLessonLength(typeId: string) {
    if (typeId === lessonTypeId) return;
    changeLesson(typeId);
  }

  // On the confirmation a length change keeps every chosen lesson and checks
  // each against the new length. A different kind books one first time (a
  // trial is one lesson; weekly repeats from one start), so the others come
  // off, and the student is told.
  function changeLesson(typeId: string, alsoUpdate?: () => void, kindChanged = false) {
    const keepTime = step === "details" && Boolean(selectedSlot);
    const dropped = keepTime && kindChanged ? savedChoices : [];
    transitionBooking(() => {
      alsoUpdate?.();
      setChangingChoice(null);
      setSubmitError("");
      setSlotNotice(dropped.length
        ? `${dropped.length === 1 ? "Your other chosen lesson" : `Your other ${dropped.length} chosen lessons`} came off with the change of lesson. Add ${dropped.length === 1 ? "it" : "them"} again if you need to.`
        : "");
      if (typeId !== lessonTypeId) {
        const ready = todayKey ? peekAvailability(typeId, todayKey, addDaysToKey(todayKey, 140)) : null;
        if (ready) {
          // Usually fetched while the page was idle: the days simply change,
          // with the new lesson's gap in the same commit, so the times kept
          // below are checked against it.
          setSlotsByDate(ready.slotsByDate);
          setHorizonDays(ready.horizonDays || BOOKING_HORIZON_DAYS_FALLBACK);
          setLessonGapMinutes(Math.max(0, Number(ready.bufferMinutes) || 0));
        } else {
          // The four weeks on show stay where they are while the new lesson's
          // times arrive, rather than snapping back to this week and out again.
          if (!calendarPageStart && pagedCalendarWeeks[0]) setCalendarPageStart(pagedCalendarWeeks[0].key);
          setLoadingSlots(true);
          setSlotsByDate({});
        }
        setLessonTypeId(typeId);
      }
      if (keepTime) {
        if (kindChanged) setSavedChoices([]);
        slotRecheck.current = typeId !== lessonTypeId
          ? [selectedSlot, ...(kindChanged ? [] : savedChoices.map((choice) => choice.startAt))]
          : [];
      } else {
        setSavedChoices([]);
        setSelectedSlot("");
        setStep(selectedDate ? "time" : "day");
      }
    });
  }

  function changeDateChoice() {
    transitionBooking(() => {
      // Back to the four weeks that held the date, not to the first page.
      if (selectedDate) setCalendarPageStart(weekKeyOf(selectedDate));
      setSelectedDate("");
      setSelectedSlot("");
      setSlotNotice("");
      setCalendarWeekCount(4);
      goTo("day");
    }, step === "details" ? CONFIRMATION_STAGE : timesTakeCalendarsPlace() ? TIMES_PANEL : undefined);
  }

  function changeTimeChoice() {
    transitionBooking(() => {
      setSelectedSlot("");
      goTo("time");
    }, CONFIRMATION_STAGE);
  }

  /** A time from the chosen day's grid. */
  function chooseSlot(slot: Slot) {
    transitionBooking(() => {
      setSelectedDate(dateKeyIn(new Date(slot.startAt), viewZone));
      setChangingChoice(null);
      setSelectedSlot(slot.startAt);
      setSlotNotice("");
      goTo("details");
    }, BOOKING_CALENDAR);
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
    }, CONFIRMATION_STAGE);
    orientTo("booking-bar-heading", true);
  }

  function reviewSavedLessons() {
    // A length lookup can finish while changing a lesson. Recheck the restored
    // time too, so Back cannot revive an unavailable or overlapping choice.
    const last = activeChange ?? savedChoices[savedChoices.length - 1];
    if (!last) return;
    if (activeChange) slotRecheck.current = [last.startAt];
    transitionBooking(() => {
      if (activeChange) setChangingChoice(null);
      else setSavedChoices(savedChoices.slice(0, -1));
      setSelectedDate(dateKeyIn(new Date(last.startAt), viewZone));
      setSelectedSlot(last.startAt);
      goTo("details");
    }, BOOKING_CALENDAR);
  }

  function selectionBackButton() {
    return (
      <button
        aria-label="Back to your selection"
        className="booking-back booking-back--tertiary booking-selection-back"
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
    }, CONFIRMATION_STAGE);
    orientTo("booking-bar-heading", true);
  }

  function removeChangingLesson() {
    const last = savedChoices[savedChoices.length - 1];
    transitionBooking(() => {
      setChangingChoice(null);
      setSavedChoices(savedChoices.slice(0, -1));
      setSelectedDate(last ? dateKeyIn(new Date(last.startAt), viewZone) : "");
      setSelectedSlot(last?.startAt ?? "");
      setSubmitError("");
      goTo(last ? "details" : "day");
    }, last ? BOOKING_CALENDAR : undefined);
  }

  function selectedLessonsList(choices: Slot[], editable: boolean) {
    return (
      <ol className="booking-chosen-lessons" aria-label={bookingKind === "recurring" ? "Starting times" : "Selected lessons"}>
        {choices.map((choice, index) => (
          <li key={choice.startAt}>
            <BookingSelectionSummary
              actionLabel={editable && !payment ? `Change lesson ${index + 1}` : undefined}
              actionText="Change"
              ariaLabel={`Lesson ${index + 1}`}
              detail={viewZoneName}
              disabled={submitting}
              mark={LESSON_MARKS[index % LESSON_MARKS.length]}
              onAction={() => changeSelectedLesson(index)}
              shortTitle={shortWhen(choice.startAt, viewZone)}
              title={`${formatLongDate(choice.startAt, viewZone)}, ${formatSlotTime(choice.startAt, viewZone)}`}
            />
          </li>
        ))}
      </ol>
    );
  }

  /**
   * The lessons being booked, each with its own Change, and a card to add
   * another in the same place a lesson would appear.
   */
  function bookingSelectionSummaries() {
    if (!lessonType || !bookingKind) return null;
    const canAddLesson = !payment && bookingKind !== "trial" && bookingChoices.length < (bookingKind === "recurring" ? 2 : 8);

    return (
      <div className="booking-selection-stack" aria-label="Your booking choices">
        {bookingChoices.length <= 1 && chosen ? (
          <BookingSelectionSummary
            actionLabel={!payment ? "Change date or time" : undefined}
            actionText="Change"
            ariaLabel="Selected lesson"
            detail={viewZoneName}
            disabled={submitting}
            mark="/visuals/v2-splats/booking-availability-splat-v2.svg"
            onAction={changeTimeChoice}
            shortTitle={shortWhen(chosen.startAt, viewZone)}
            title={`${formatLongDate(chosen.startAt, viewZone)}, ${formatSlotTime(chosen.startAt, viewZone)}`}
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
  /*
   * The lesson's dialog as it will look, drawn from what the calendar already
   * holds while the full details load. Its actions are held still (inert, not
   * greyed) for that moment, so nothing can be decided before the details —
   * the fee rules, any payment due — are in. It mirrors the view below.
   */
  /*
   * A weekly run's time. It is kept in Porto, so on Porto's clock it is simply
   * that; on another clock it is the time most of its lessons fall at there,
   * since a few weeks a year around a clock change differ by an hour (each
   * lesson's own time is on the calendar).
   */
  function weeklyTimeLabel(series: LessonSeries, lesson: { startAt: string; location: "online" | "porto" }) {
    const zone = zoneOf(lesson);
    if (zone === BOOKING_TIME_ZONE) return `${weekdayNames[series.weekday]} at ${minutesToClock(series.minuteOfDay)} Porto time`;
    const weekdayAt = (startAt: string) =>
      `${weekdayNames[new Date(`${dateKeyIn(new Date(startAt), zone)}T12:00:00Z`).getUTCDay()]} at ${formatSlotTime(startAt, zone)}`;
    const counts = new Map<string, number>();
    for (const booking of myBookings) {
      if (booking.seriesId !== series.id || booking.status !== "confirmed") continue;
      const label = weekdayAt(booking.startAt);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const usual = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? weekdayAt(lesson.startAt);
    return `${usual} ${timeZoneName(zone)}`;
  }

  function renderLessonPreview(preview: MyBooking) {
    const changeable = preview.status === "confirmed" && !preview.isPast && !preview.changeLocked;
    const feeCents = loadedAccount?.sameDayFeeCents ?? SAME_DAY_RESCHEDULE_FEE_CENTS;
    return (
      <>
        <p className={`lesson-calendar__status${preview.status !== "cancelled" && activeManagedSeries ? " lesson-calendar__status--recurring" : ""}`}>
          {preview.status === "cancelled"
            ? <CircleX size={13} aria-hidden="true" />
            : preview.status === "pending_payment"
              ? <AlertCircle size={13} aria-hidden="true" />
              : activeManagedSeries ? <Repeat size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
          {preview.status === "cancelled"
            ? "Cancelled"
            : preview.status === "pending_payment"
              ? "Not confirmed"
              : activeManagedSeries
                ? "Weekly lesson"
                : "Booked"}
        </p>
        <h2 id="lesson-manage-heading">Manage this lesson</h2>
        <div className="lesson-manage-dialog__lesson">
          <strong>{formatLongDate(preview.startAt, zoneOf(preview))}, {lessonTime(preview.startAt, zoneOf(preview))}</strong>
          <span>{formatBookedLessonLabel(preview.lessonType)} · {preview.location === "porto" ? "In Porto" : "Online"}</span>
          <MeetingLink meetingUrl={preview.meetingUrl} location={preview.location} status={preview.status} />
        </div>
        {preview.changeLocked && preview.status === "confirmed" ? (
          <p className="lesson-calendar__notice">
            This lesson is less than {NOTICE_HOURS} hours away and can&rsquo;t be changed or cancelled.
          </p>
        ) : preview.sameDayFeeApplies && preview.status === "confirmed" ? (
          <p className="lesson-calendar__notice">
            This lesson is less than {NOTICE_HOURS} hours away, so changing or cancelling it now costs{" "}
            {formatMoneyCents(feeCents)}.
            {preview.sameDayFeeAutomatic ? " Your saved card is charged when you confirm." : ""}
            {" "}This fee applies once per lesson.
          </p>
        ) : null}
        {changeable ? (
          <div className="lesson-manage-dialog__actions" inert>
            <button className="button button--coral" type="button">Change</button>
            <button className="button button--quiet" type="button">Cancel</button>
          </div>
        ) : null}
        {resolvedManagedSeriesId && preview.status === "confirmed" ? (
          <div className="lesson-manage-dialog__series" inert>
            <Repeat aria-hidden="true" size={17} />
            <div>
              <strong>
                {activeManagedSeries
                  ? weeklyTimeLabel(activeManagedSeries, preview)
                  : "No longer repeating"}
              </strong>
              {activeManagedSeries ? null : <span>The lessons already booked stay in your calendar.</span>}
            </div>
            {activeManagedSeries ? (
              <button className="button button--outline button--compact" type="button">Manage weekly lessons</button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

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
            Changing {formatLongDate(activeChange.startAt, viewZone)}, {lessonTime(activeChange.startAt, viewZone)}.{" "}
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
    const choicesLocked = submitting || Boolean(payment);
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
              <button className="booking-back booking-back--tertiary booking-bar__back" onClick={openLessonsJourney} type="button">
                <ArrowLeft size={16} aria-hidden="true" /> Your lessons
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
          <fieldset className="booking-bar__group booking-bar__group--kind" disabled={choicesLocked}>
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
          <fieldset className="booking-bar__group" disabled={choicesLocked}>
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
            <fieldset className="booking-bar__group" disabled={choicesLocked}>
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
                  {lessonType.duration_minutes} mins · {formatMoneyCents(lessonType.price_cents)}
                </label>
              </div>
            </fieldset>
          ) : (
            <fieldset className="booking-bar__group" disabled={choicesLocked}>
              <legend>Length</legend>
              <div className={`segmented segmented--position-${lengthIndex}`}>
                <span aria-hidden="true" className="segmented__thumb" />
                {regularLessonTypes.map((type) => {
                  // Weekly lessons cost the account's saved rate for that
                  // length, so each choice shows the price the student agrees to.
                  const price = form.repeat !== "once" ? recurringRates[type.duration_minutes] ?? type.price_cents : type.price_cents;
                  return (
                    <label className={lessonTypeId === type.id ? "is-active" : ""} key={type.id}>
                      <input
                        aria-label={`${formatLessonDuration(type.duration_minutes)} lesson · ${formatMoneyCents(price)}`}
                        checked={lessonTypeId === type.id}
                        name="booking-duration"
                        onChange={() => chooseLessonLength(type.id)}
                        type="radio"
                        value={type.id}
                      />
                      {type.duration_minutes} mins · {formatMoneyCents(price)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          {bookingKind === "recurring" ? (
            <fieldset className="booking-bar__group booking-bar__group--repeat" disabled={choicesLocked}>
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

  const accountRefreshNotice = accountLoadError ? (
    <div className="booking-alert booking-alert--account" role="alert">
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
  ) : null;

  if (confirmation) {
    // On the clock of the place it happens: the student's own online, Porto's in Porto.
    const zone = zoneOf(confirmation);
    const zoneName = timeZoneName(zone);
    // Every lesson this booking made, the first included, and any time that
    // was already taken. Several lessons are named, each once; a weekly run
    // reads as its weekly time rather than as a list of dates.
    const bookedStarts = confirmation.selection?.booked ?? confirmation.series?.booked ?? [confirmation.startAt];
    const skippedStarts = confirmation.selection?.skipped ?? confirmation.series?.skipped ?? [];
    const weekly = Boolean(confirmation.series || confirmation.selection?.recurring);
    const several = bookedStarts.length > 1;
    const openEnded = confirmation.series ? confirmation.series.openEnded : confirmation.selection?.weeks === null;
    // A weekly time is kept in Porto, so each is read from its first lesson:
    // on another clock, a few weeks a year around a clock change differ by an
    // hour, and those must not read as a second weekly time.
    const firstOfEachWeeklyTime = [...new Map(bookedStarts.map((startAt) => [
      `${new Date(`${portoDateKey(new Date(startAt))}T12:00:00Z`).getUTCDay()} ${formatSlotTime(startAt)}`,
      startAt
    ] as const).reverse()).values()].sort();
    const weeklyTimes = firstOfEachWeeklyTime.map((startAt) =>
      `${weekdayNames[new Date(`${dateKeyIn(new Date(startAt), zone)}T12:00:00Z`).getUTCDay()]} at ${formatSlotTime(startAt, zone)}`
    );
    return (
      // The same section as every other step, so the workspace eases between
      // this card and the next view instead of being swapped for it.
      <section className="booking-steps" aria-label="Book a Portuguese lesson">
        <section className="booking-success" aria-live="polite" id="booking-success">
          {/* Good news gets one small celebration: the lesson's own mark, the
              one it wears on the calendar from now on, lands in the card's top
              corner, as each Lessons card carries its own. It is also the card's
              only seal: the heading says the rest. Decorative; it lands once. */}
          {lessonType ? (
            <LessonMark
              className="booking-success__mark"
              durationMinutes={lessonType.duration_minutes}
              lands
              lessonTypeId={lessonType.id}
              location={confirmation.location}
              recurring={Boolean(confirmation.series || confirmation.selection?.recurring)}
            />
          ) : null}
          {/* One good-news card, read top to bottom: what happened, when,
              where the details went, what next, then the small print. */}
          <div className="booking-success__head">
            <h2 id="booking-success-heading" tabIndex={-1}>
              You&rsquo;re booked in.
            </h2>
          </div>
          <div className="booking-success__when">
            {weekly ? (
              <>
                <strong>{weeklyTimes.join(" and ")}</strong>{" "}
                <span>
                  {zoneName} · from {formatShortDay(bookedStarts[0], zone)}
                </span>
              </>
            ) : several ? (
              <>
                <ul>
                  {bookedStarts.map((startAt) => (
                    <li key={startAt}>
                      <strong>{formatShortDay(startAt, zone)}, {formatSlotTime(startAt, zone)}</strong>
                    </li>
                  ))}
                </ul>
                <span>{zoneName}</span>
              </>
            ) : (
              <>
                <strong>{formatLongDate(confirmation.startAt, zone)}</strong>{" "}
                <span>at {formatTimeIn(confirmation.startAt, zone)}</span>
              </>
            )}
          </div>
          {weekly ? (
            <p className="booking-success__count">
              <strong>{bookedStarts.length === 1 ? "1 lesson" : `${bookedStarts.length} lessons`} booked</strong>
              {openEnded
                ? weeklyTimes.length > 1
                  ? " so far. These times stay yours every week until you stop them."
                  : " so far. This time stays yours every week until you stop it."
                : "."}
            </p>
          ) : null}
          {skippedStarts.length ? (
            <div className="booking-success__skipped">
              <p>
                {skippedStarts.length === 1
                  ? `One ${weekly ? "week" : "time"} was already taken, so it isn’t booked:`
                  : `${skippedStarts.length} ${weekly ? "weeks" : "times"} were already taken, so they aren’t booked:`}
              </p>
              <ul>
                {skippedStarts.map((startAt) => (
                  <li key={startAt}>
                    {formatShortDay(startAt, zone)}
                    {weekly ? "" : `, ${formatSlotTime(startAt, zone)}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="booking-success__sent">
            {several ? "A confirmation with calendar invitations is on its" : "A confirmation and calendar invitation are on their"}{" "}
            way to <strong>{confirmation.email}</strong>.
          </p>

          <MeetingLink meetingUrl={confirmation.meetingUrl} location={confirmation.location} status="confirmed" />

          <div className="booking-success__actions">
            <button
              className="button button--coral"
              onClick={returnFromConfirmationToUpcoming}
              type="button"
            >
              Back to your lessons
            </button>
            {/* One lesson can be changed straight from here. Several are each
                on the calendar, where every one opens on its own. */}
            {several ? null : (
              <button
                className="button button--outline"
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
            )}
          </div>
          {accountRefreshNotice}
          <div className="booking-success__foot">
            <dl className="booking-success__reference">
              <dt>Your reference</dt>
              <dd>{confirmation.reference}</dd>
            </dl>
            <p className="booking-success__note">
              {several ? "These lessons are" : "This lesson is"} now on your calendar. Changing or cancelling{" "}
              {several ? "one" : "it"} is free up to {NOTICE_HOURS} hours before; after that it costs{" "}
              {formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}.
            </p>
          </div>
        </section>
      </section>
    );
  }

  // Signed in, the workspace is the student's account: one section holding the
  // lessons calendar card, or Past lessons or Your details in its place.
  const StageElement = student ? "section" : "div";
  // A repeating schedule counts once, however many of its dates are booked.
  const upcomingCount = new Set(
    myBookings
      .filter((booking) => !booking.isPast && booking.status === "confirmed")
      .map((booking) => (isWeeklyLesson(booking) ? `series:${booking.seriesId}` : `booking:${booking.reference}`))
  ).size;

  /** The account's places, from the name's menu or a card's way back. */
  function openAccountView(section: AccountSection) {
    // Choosing the card already open keeps it open.
    if (!(intent === "lessons" && accountView === section)) transitionBooking(() => openAccountShortcut(section));
    orientTo("account-controls");
    if (section !== "profile") {
      window.requestAnimationFrame(() =>
        document.getElementById(section === "history" ? "account-past-lessons" : "upcoming-lessons-heading")?.focus({ preventScroll: true })
      );
    }
  }

  function signOut() {
    transitionBooking(() => {
      clearSession();
      managedRequest.current += 1;
      setManageLoading(false);
      setStudent(null);
      setMyBookings([]);
      setLessonSeries([]);
      setLoadedAccount(null);
      setManaged(null);
      setManagedToken("");
      setManagedSeriesId(null);
      setManagedLessonTypeId("");
      setManagedLocation("online");
      setManageMode("view");
      setHasPriorBooking(false);
      // Signed out, the page is what any visitor sees: ready to book.
      setIntent("book");
      setAccountView("upcoming");
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
    });
  }

  return (
    <section className="booking-steps" aria-label="Book a Portuguese lesson">
      {bookingPromptDate ? (
        <CalendarBookingPrompt
          date={bookingPromptDate}
          lessons={(bookingsByDate[bookingPromptDate] ?? []).map((booking) => ({
            key: booking.reference,
            title: lessonTime(booking.startAt, zoneOf(booking)),
            detail: `${formatBookedLessonLabel(booking.lessonType)} · ${booking.location === "porto" ? "In Porto" : "Online"}${isWeeklyLesson(booking) ? " · Weekly" : ""}`,
            mark: (
              <LessonMark
                className="lesson-calendar__mark"
                durationMinutes={booking.lessonType.durationMinutes}
                lessonTypeId={booking.lessonType.id}
                location={booking.location}
                recurring={isWeeklyLesson(booking)}
              />
            ),
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
            {availabilityError && !lessonTypesError ? (
              <>
                <button className="text-action" disabled={loadingSlots} onClick={() => loadAvailability()} type="button">
                  Try again
                </button>{" "}
              </>
            ) : null}
            <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
              Message Inês instead
            </a>
            .
          </p>
        </div>
      ) : null}

      <StageElement
        aria-label={student ? "Account, upcoming and past lessons" : undefined}
        className={`booking-stage${intent === "lessons" && student && accountView === "upcoming" ? " booking-stage--lessons" : ""}`}
        id={student ? "account-controls" : undefined}
      >
        {student ? (
          <div className="unified-account-area">
            <AccountControls
              key={student.id}
              initialAccount={loadedAccount?.student.id === student.id ? loadedAccount : null}
              onRatesChange={(rates) => {
                // A code saved under Edit details prices the next weekly booking.
                // An unchanged answer keeps the same object, so nothing re-prices.
                recurringRatesVersion.current += 1;
                setRecurringRates((current) => (sameRates(current, rates) ? current : rates));
                setRatesReady(true);
                setRatesError("");
              }}
              onSelectSection={openAccountView}
              onSignOut={signOut}
              openUpcomingRequest={upcomingRequestKey}
              section={intent === "lessons" ? accountView : "upcoming"}
            />
          </div>
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
                key={manageLoading && !lessonPreview ? "loading" : !managed && !lessonPreview ? "error" : manageOutcome ? "outcome" : manageMode}
              >
              {manageLoading && lessonPreview ? (
                renderLessonPreview(lessonPreview)
              ) : manageLoading ? (
                <div className="lesson-manage-dialog__loading">
                  <p className="eyebrow">One moment</p>
                  <h2 id="lesson-manage-heading">Opening your lesson…</h2>
                </div>
              ) : managed ? (
                <>
                  {/* Weekly only while the repeat is running: a stopped repeat's
                      dates are ordinary lessons again, and a cancelled one says
                      so with the past lessons' own mark. */}
                  <p className={`lesson-calendar__status${managed.booking.status !== "cancelled" && activeManagedSeries ? " lesson-calendar__status--recurring" : ""}`}>
                    {managed.booking.status === "cancelled"
                      ? <CircleX size={13} aria-hidden="true" />
                      : managed.booking.status === "pending_payment"
                        ? <AlertCircle size={13} aria-hidden="true" />
                        : activeManagedSeries ? <Repeat size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
                    {managed.booking.status === "cancelled"
                      ? "Cancelled"
                      : managed.booking.status === "pending_payment"
                        ? "Not confirmed"
                      : activeManagedSeries
                        ? "Weekly lesson"
                        : "Booked"}
                  </p>
                  <h2 id="lesson-manage-heading">
                    {manageMode === "confirm-cancel"
                      ? "Cancel this lesson?"
                      : manageMode === "confirm-cancel-sequence"
                        ? "Cancel booked lessons?"
                        : manageMode === "sequence" || manageMode === "confirm-stop-sequence"
                        ? "Manage weekly lessons"
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
                    <strong>{formatLongDate(managed.booking.startAt, zoneOf(managed.booking))}, {lessonTime(managed.booking.startAt, zoneOf(managed.booking))}</strong>
                    <span>{formatBookedLessonLabel(managed.booking.lessonType)} · {managed.booking.location === "porto" ? "In Porto" : "Online"}</span>
                    <MeetingLink meetingUrl={managed.booking.meetingUrl} location={managed.booking.location} status={managed.booking.status} />
                  </div>

                  {accountRefreshNotice}

                  {!manageOutcome && manageMode === "view" ? (
                    <>
                      {managed.booking.status === "pending_payment" ? (
                        <div className="lesson-calendar__notice">
                          <p>Checkout has not confirmed this lesson. Complete checkout, or choose your lessons again.</p>
                          <button className="button button--coral" onClick={() => {
                            closeManagedLesson();
                            startBookingJourney();
                          }} type="button">Book a lesson</button>
                        </div>
                      ) : null}
                      {([ ["lesson", managed.paymentsDue?.lesson, "lesson payment"], ["same-day-fee", managed.paymentsDue?.sameDayFee, "late change fee"] ] as const).map(([purpose, amount, label]) => amount != null ? (
                        <div className="lesson-calendar__notice" key={purpose}>
                          <p>Your {label} of {formatMoneyCents(amount)} is still to pay.</p>
                          <button className="button button--coral" disabled={manageWorking} type="button" onClick={async () => {
                            if (!managedToken) return;
                            const request = managedRequest.current;
                            // As with a new booking: leaving the page retires the payment.
                            const page = window.location.pathname;
                            const current = () => request === managedRequest.current && window.location.pathname === page;
                            setManageWorking(true); setManageError("");
                            try {
                              const result = await recoverBookingPayment(managedToken, purpose);
                              if (!current()) return;
                              window.location.assign(stripePaymentUrl(result.url));
                            } catch (error) {
                              if (!current()) return;
                              setManageError(error instanceof Error ? error.message : "Please try again shortly.");
                              setManageWorking(false);
                            }
                          }}>{manageWorking ? "Opening secure payment…" : `Pay ${formatMoneyCents(amount)} securely`}</button>
                        </div>
                      ) : null)}
                      {managed.changeLocked && managed.booking.status === "confirmed" ? (
                        <p className="lesson-calendar__notice">
                          This lesson is less than {NOTICE_HOURS} hours away and can&rsquo;t be changed or cancelled.
                        </p>
                      ) : managed.sameDayFeeApplies && managed.booking.status === "confirmed" ? (
                        <p className="lesson-calendar__notice">
                          This lesson is less than {NOTICE_HOURS} hours away, so changing or cancelling it now costs{" "}
                          {formatMoneyCents(managed.booking.sameDayFeeCents)}.
                          {managed.sameDayFeeAutomatic ? " Your saved card is charged when you confirm." : ""}
                          {" "}This fee applies once per lesson.
                        </p>
                      ) : null}

                      {managed.booking.status === "confirmed" && !managed.isPast && !managed.changeLocked ? (
                        <>
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

                      {resolvedManagedSeriesId && managed.booking.status === "confirmed" ? (
                        <div className="lesson-manage-dialog__series">
                          <Repeat aria-hidden="true" size={17} />
                          {/* The weekly time says what the run is; nothing needs to
                              name it a sequence as well. */}
                          <div>
                            <strong>
                              {activeManagedSeries
                                ? weeklyTimeLabel(activeManagedSeries, managed.booking)
                                : "No longer repeating"}
                            </strong>
                            {activeManagedSeries ? null : <span>The lessons already booked stay in your calendar.</span>}
                          </div>
                          {activeManagedSeries ? (
                            <button className="button button--outline button--compact" onClick={() => transitionBooking(() => setManageMode("sequence"))} type="button">
                              Manage weekly lessons
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {manageMode === "confirm-cancel" ? (
                    <div className="lesson-manage-dialog__decision">
                      {/* "Only this date" matters where other weeks stay booked;
                          a one-off lesson needs no such reassurance. */}
                      {resolvedManagedSeriesId || (managed.refundOnCancel && managed.booking.amountCents) || managed.sameDayFeeApplies ? (
                        <p>
                          {resolvedManagedSeriesId ? "This only cancels the lesson on this date." : ""}
                          {managed.refundOnCancel && managed.booking.amountCents
                            ? ` Your ${formatMoneyCents(managed.booking.amountCents)} comes back to your card.`
                            : ""}
                          {managed.sameDayFeeApplies
                            ? managed.sameDayFeeAutomatic
                              ? ` Your saved card is charged the ${formatMoneyCents(managed.booking.sameDayFeeCents)} late change fee when you confirm the cancellation. This fee applies once per lesson. There’s no lesson charge.`
                              : ` The ${formatMoneyCents(managed.booking.sameDayFeeCents)} late change fee applies once per lesson.`
                            : ""}
                        </p>
                      ) : null}
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
                          Move weekly time
                        </button>
                        <button className="button button--quiet" onClick={() => transitionBooking(() => setManageMode("confirm-stop-sequence"))} type="button">
                          Stop repeating
                        </button>
                        <button className="button button--coral" onClick={() => transitionBooking(() => setManageMode("confirm-cancel-sequence"))} type="button">
                          Cancel all booked lessons
                        </button>
                        <button className="booking-back booking-back--tertiary" onClick={() => transitionBooking(() => setManageMode("view"))} type="button">
                          <ArrowLeft size={16} aria-hidden="true" /> Back
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeManagedSeries && manageMode === "confirm-stop-sequence" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p><strong>Stop repeating?</strong> Your booked lessons will stay.</p>
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
                        Every upcoming weekly lesson is cancelled, and no new ones are added. Any paid lesson that can still be cancelled is refunded automatically. A lesson less than {NOTICE_HOURS} hours away stays booked.
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
                ? "Confirming your booking…"
                : cardReturn.state === "confirmed"
                  ? "You’re booked in. Your confirmation email is on its way."
                  : "We couldn’t confirm your booking yet. Please check your lessons, or message Inês."}
            </p>
            {cardReturn.state !== "confirming" ? (
              <button aria-label="Dismiss" className="booking-card-return__close" onClick={() => setCardReturn(null)} type="button">
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        {!manageDialogOpen && accountRefreshNotice}

        {checkingSession && intent === "choose" && !managed ? (
          <p className="booking-state-note booking-state-note--initial">Loading your lessons…</p>
        ) : null}

        {needsLessonsSignIn ? (
          <section className="booking-workflow-sign-in" id="booking-lessons-sign-in" tabIndex={-1}>
            <button className="booking-back booking-back--tertiary" onClick={returnToJourneyStart} type="button">
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
                refreshStudentInBackground();
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
            // Your lessons, booking and changing a lesson are different views of
            // the calendar: moving between them brings a new one, which dissolves
            // in, rather than one card's edges jumping to the next one's.
            key={isLessonsCalendarOverview ? "lessons" : managed && isManagedReschedule ? "change" : "booking"}
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
          {managed && isManagedReschedule ? (
            // The task and the lesson as it stands come first: above the
            // calendar on a phone, across the top on a wide screen. Keep
            // current time at the foot of the form is the one way back.
            <div className="managed-lesson__head">
              <h3 id="managed-reschedule-heading">
                {manageMode === "reschedule-sequence" ? "Choose a new weekly day and time" : "Choose a new date and time"}
              </h3>
              <p className="managed-lesson__current-time">
                {manageMode === "reschedule-sequence" ? "Currently repeats from " : "Currently "}
                {formatShortDay(managed.booking.startAt, zoneOf(managed.booking))}, {lessonTime(managed.booking.startAt, zoneOf(managed.booking))}
                {manageMode === "reschedule-sequence" ? null : ` · ${formatBookedLessonLabel(managed.booking.lessonType)}`}
              </p>
            </div>
          ) : null}
          {intent === "book" && !managed ? (savedChoices.length || activeChange ? bookingProgressBar() : bookingChoicesBar()) : null}
          <div
            className={`calendar-panel unified-calendar__grid${bookingDateChosen ? " unified-calendar__grid--date-chosen" : ""}`}
          >
            {isLessonsCalendarOverview ? (
              <div className="lesson-overview">
                <div className="lesson-overview__header">
                  <div className="lesson-overview__heading">
                    <div className="upcoming-lessons__title-line">
                      <h2 className="eyebrow" id="upcoming-lessons-heading" tabIndex={-1}>Your lessons</h2>
                    </div>
                    {student ? (
                      <AccountMenu
                        current="upcoming"
                        name={student.name}
                        onSelect={openAccountView}
                        onSignOut={signOut}
                        upcomingCount={upcomingCount}
                      />
                    ) : null}
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
                  <div className={`lesson-overview__next${nextLessonOnFirstPage ? " lesson-overview__next--on-calendar" : ""}`}>
                    <LessonMark
                      className="lesson-overview__next-mark"
                      durationMinutes={nextLesson.lessonType.durationMinutes}
                      lessonTypeId={nextLesson.lessonType.id}
                      location={nextLesson.location}
                      recurring={isWeeklyLesson(nextLesson)}
                    />
                    <button className="lesson-overview__next-open" onClick={(event) => openBookedLesson(nextLesson, event.currentTarget)} type="button">
                      <span className="eyebrow">{Date.parse(nextLesson.startAt) <= clock ? "Happening now" : "Next lesson"}</span>
                      {/* One plain line: the calendar's header says which
                          clock the times are on. */}
                      <strong>
                        <WhenText
                          long={`${formatLongDate(nextLesson.startAt, zoneOf(nextLesson))}, ${formatSlotTime(nextLesson.startAt, zoneOf(nextLesson))}`}
                          short={`${formatShortDay(nextLesson.startAt, zoneOf(nextLesson))}, ${formatSlotTime(nextLesson.startAt, zoneOf(nextLesson))}`}
                        />
                      </strong>
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
            {/* The calendar's own header, as any calendar has one: its month,
                which clock its times are on and the arrows. The key sits under
                the grid, with the days it explains. */}
            <div className="unified-calendar__toolbar">
              <div className="unified-calendar__heading">
                <div className="unified-calendar__title">
                  <p aria-live="polite" className="unified-calendar__month">
                    <WhenText long={calendarMonthsLabel.long} short={calendarMonthsLabel.short} />
                  </p>
                  {isLessonsCalendarOverview ? (
                    <>
                      <button
                        aria-describedby="upcoming-lessons-tip"
                        aria-label="How your lesson calendar works"
                        className="upcoming-lessons__hint"
                        type="button"
                      >
                        <CircleHelp size={16} aria-hidden="true" />
                      </button>
                      <span className="upcoming-lessons__tip" id="upcoming-lessons-tip" role="tooltip">
                        Choose a booked lesson to see its details, change it or cancel it. Choose any other day to book a lesson then.
                      </span>
                    </>
                  ) : null}
                </div>
                {/* A student whose clock differs from Porto's is told which clock
                    the times are on, one at a time: their own, or Porto's for
                    a lesson there. Booking follows the place chosen. Your
                    lessons, holding both, names the next lesson's clock and
                    switches while another lesson is hovered or focused. */}
                {studentClockDiffers && !(managed && isManagedReschedule) ? (
                  isLessonsCalendarOverview && calendarBookings.some((booking) => booking.location === "porto") ? (
                    <p className={`calendar-zone calendar-zone--switching${nextLesson?.location === "porto" ? " calendar-zone--porto" : ""}`}>
                      <Clock3 size={15} aria-hidden="true" />
                      <span className="visually-hidden">Times are in {viewZoneName}; lessons in Porto are in Porto time</span>
                      <strong aria-hidden="true">
                        <span className="calendar-zone__own">{viewZoneName}</span>
                        <span className="calendar-zone__porto">Porto time</span>
                      </strong>
                    </p>
                  ) : (
                    <p className="calendar-zone">
                      <Clock3 size={15} aria-hidden="true" />
                      <span>
                        <span className="visually-hidden">Times are in </span>
                        <strong>{viewZone === BOOKING_TIME_ZONE ? "Porto time" : viewZoneName}</strong>
                      </span>
                    </p>
                  )
                ) : null}
              </div>
              <div className="unified-calendar__range-actions">
                {!restrictedWeek && visibleCalendarWeekCount !== 1 && calendarPages.length > 1 ? (
                  <div className="calendar-pager">
                    <button
                      aria-controls="booking-calendar-weeks"
                      aria-label="Earlier weeks"
                      className="calendar-pager__step"
                      disabled={manageWorking || calendarPageIndex === 0}
                      onClick={() => turnCalendarPage(-1)}
                      type="button"
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <button
                      aria-controls="booking-calendar-weeks"
                      aria-label={laterLessonCount ? `Later weeks, ${laterLessonCount} more ${laterLessonCount === 1 ? "lesson" : "lessons"}` : "Later weeks"}
                      className="calendar-pager__step"
                      disabled={manageWorking || calendarPageIndex >= calendarPages.length - 1}
                      onClick={() => turnCalendarPage(1)}
                      type="button"
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                      {laterLessonCount ? <span className="calendar-pager__count" aria-hidden="true">{laterLessonCount}</span> : null}
                    </button>
                  </div>
                ) : null}
                {returnCalendarWeekCount && !restrictedWeek ? (
                  <button
                    aria-controls="booking-calendar-weeks"
                    className="text-action unified-calendar__expand"
                    disabled={manageWorking}
                    onClick={() => transitionBooking(() => setCalendarWeekCount(returnCalendarWeekCount))}
                    type="button"
                  >
                    Show all
                  </button>
                ) : null}
              </div>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              <span className="calendar-weekdays__corner" />
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div
              aria-busy={loadingSlots}
              className="calendar-weeks"
              id="booking-calendar-weeks"
              // A new page, a different lesson or another view is a new set of
              // weeks, and so dissolves in (see transitionBooking).
              key={`${isLessonsCalendarOverview ? "lessons" : managed ? "managed" : "book"}-${availabilityLessonTypeId}-${
                visibleCalendarWeekCount === 1 && selectedCalendarWeek ? `compact-${selectedCalendarWeek.key}` : `page-${pageFirstKey}`
              }`}
            >
              {displayedCalendarWeeks.map((week, row) => (
                <div className="calendar-week" key={week.key}>
                  {/* Each week starts with its month, so a date is never far
                      from it; a month that begins mid-week marks its 1st. The
                      days' own labels carry the full date. */}
                  <span
                    aria-hidden="true"
                    className={`calendar-week__month${
                      row > 0 && displayedCalendarWeeks[row - 1].cells[0].month === week.cells[0].month ? " is-repeat" : ""
                    }`}
                  >
                    {shortMonth(week.cells[0].month, week.cells[0].key)}
                  </span>
                  {week.cells.map((cell, column) => {
                    const slots = selectableSlots(cell.key);
                    const lessons = bookingsByDate[cell.key] ?? [];
                    const lessonLabel = lessons.length === 1 ? "1 lesson" : `${lessons.length} lessons`;
                    const dateLabel = formatLongDate(`${cell.key}T12:00:00Z`);
                    const canStartBooking = isLessonsCalendarOverview && cell.key >= viewTodayKey;
                    const weeklyDay = lessons.length > 0 && lessons.every(isWeeklyLesson);
                    // Your lessons spells each booked day out: when it starts and
                    // ends, online or in person, and in full on hover or focus.
                    const lessonTip = isLessonsCalendarOverview && lessons.length ? `lesson-tip-${cell.key}` : undefined;
                    const nextDay = Boolean(lessonTip && lessons.some((booking) => booking.reference === nextLesson?.reference));
                    const dayClock = !lessonTip
                      ? ""
                      : lessons.every((booking) => booking.location === "porto")
                        ? " is-porto-day"
                        : lessons.every((booking) => booking.location !== "porto") ? " is-own-day" : "";
                    return (
                      <button
                        aria-describedby={lessonTip}
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
                        }${weeklyDay ? " has-weekly-booking" : ""}${!isLessonsCalendarOverview && selectedDate === cell.key ? " is-selected" : ""}${cell.isToday ? " is-today" : ""}${
                          nextDay ? " is-next" : ""
                        }${dayClock}${lessonTip && row === 0 ? " has-tip-below" : ""}`}
                        data-date-key={cell.key}
                        disabled={manageWorking || (!canStartBooking && !slots.length && !lessons.length)}
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
                          // On a phone the day's times take the calendar's place.
                          const handsOver = Boolean(lessonType && !managed && !selectedDate && timesTakeCalendarsPlace());
                          transitionBooking(() => {
                            setSelectedDate(cell.key);
                            setCalendarWeekCount(managed && !changeFormBesideCalendar() ? 1 : CALENDAR_PAGE_WEEKS);
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
                          }, handsOver ? CALENDAR_GRID : undefined);
                          orientTo("booking-next-step", false, true);
                        }}
                        type="button"
                      >
                        <span>
                          {cell.day}
                          {cell.day === 1 && column > 0 ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                          {lessons.length ? (
                            <small className="calendar-booking-times">
                              {(lessons.length <= 2 ? lessons : lessons.slice(0, 1)).map((booking) => (
                                <span className={isWeeklyLesson(booking) ? "is-weekly" : undefined} key={booking.reference}>
                                  {lessonTip ? (
                                    booking.location === "porto"
                                      ? <UserRound aria-hidden="true" className="calendar-booking-times__place" size={12} strokeWidth={2.4} />
                                      : <Globe aria-hidden="true" className="calendar-booking-times__place" size={12} strokeWidth={2.4} />
                                  ) : null}
                                  <span className="calendar-booking-times__when">
                                    <time dateTime={booking.startAt}>{formatSlotTime(booking.startAt, zoneOf(booking))}</time>
                                    {lessonTip ? <span className="calendar-booking-times__until">–{formatSlotTime(booking.endAt, zoneOf(booking))}</span> : null}
                                  </span>
                                </span>
                              ))}
                              {lessons.length > 2 ? <span>+{lessons.length - 1} more</span> : null}
                            </small>
                          ) : null}
                        </span>
                        {lessonTip ? (
                          // Hovering a booked day, or reaching it by keyboard, shows its
                          // lessons in full: when, with the clock named as a time on its
                          // own names it, how long, where and whether weekly.
                          <span
                            className={`calendar-lesson-tip${column === 0 ? " calendar-lesson-tip--start" : column === 6 ? " calendar-lesson-tip--end" : ""}`}
                            id={lessonTip}
                            role="tooltip"
                          >
                            {lessons.map((booking) => (
                              <span className="calendar-lesson-tip__lesson" key={booking.reference}>
                                {booking.reference === nextLesson?.reference ? (
                                  <span className="calendar-lesson-tip__next">
                                    {Date.parse(booking.startAt) <= clock ? "Happening now" : "Next lesson"}
                                  </span>
                                ) : null}
                                <strong>{formatLongDate(booking.startAt, zoneOf(booking))}, {lessonTime(booking.startAt, zoneOf(booking))}</strong>
                                <span>
                                  {formatBookedLessonLabel(booking.lessonType)} · {booking.location === "porto" ? "In Porto" : "Online"}
                                  {isWeeklyLesson(booking) ? " · Weekly" : ""}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="unified-calendar__legend" aria-label="Calendar key">
              {/* Only once there is a booked lesson to point to: a first visit
                  has nothing booked, so the key would explain nothing. */}
              {calendarBookings.length ? (
                <span>
                  <i className="is-booked" aria-hidden="true" />{" "}
                  {isLessonsCalendarOverview && calendarBookings.some(isWeeklyLesson) ? "One-off lesson" : "Booked lesson"}
                </span>
              ) : null}
              {isLessonsCalendarOverview && calendarBookings.some(isWeeklyLesson) ? (
                <span><i className="is-weekly" aria-hidden="true" /> Weekly lesson</span>
              ) : null}
              {/* What the marks on each booked day mean, for the kinds booked. */}
              {isLessonsCalendarOverview && calendarBookings.some((booking) => booking.location !== "porto") ? (
                <span><Globe aria-hidden="true" size={12} strokeWidth={2.4} /> Online</span>
              ) : null}
              {isLessonsCalendarOverview && calendarBookings.some((booking) => booking.location === "porto") ? (
                <span><UserRound aria-hidden="true" size={12} strokeWidth={2.4} /> In Porto</span>
              ) : null}
              {intent === "book" || isManagedReschedule ? (
                <span><i className="is-free" aria-hidden="true" /> Free to book</span>
              ) : null}
            </div>
            {loadingSlots ? <p className="booking-state-note">Checking what&rsquo;s free…</p> : null}
            {noFreeTimes ? <p className="booking-state-note">No free times in these weeks.</p> : null}
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
                  refreshStudentInBackground();
                }}
              />
            ) : managed && isManagedReschedule ? (
              <div className="unified-calendar__move">
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
                            disabled={manageWorking}
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
                    ? "Lessons that keep their length keep their current prices."
                    : `Changed-length lessons: ${formatMoneyCents(managedPrice)} each. Lessons already this length keep their current prices.`
                  : `${formatMoneyCents(managedPrice)} per lesson${managed.recurring ? " · weekly rate" : ""}`}</p> : null}
                <fieldset className="managed-lesson__duration">
                  <legend>Where</legend>
                  <div className={`segmented segmented--${managedLocation}`}>
                    <span aria-hidden="true" className="segmented__thumb" />
                    {(["online", "porto"] as const).map((option) => (
                      <label className={managedLocation === option ? "is-active" : ""} key={option}>
                        <input
                          checked={managedLocation === option}
                          disabled={manageWorking}
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
                  {selectedDate ? `${formatShortDay(`${selectedDate}T12:00:00Z`)} · ${viewZoneName}` : "Choose a free day on the calendar."}
                </p>
                {accountRefreshNotice}
                {loadingSlots ? (
                  <p className="booking-state-note">Checking what&rsquo;s free…</p>
                ) : daySlots.length ? (
                  <TimePicker
                    halves={timeHalves}
                    key={selectedDate}
                    zone={viewZone}
                    renderTime={(slot, place) => (
                      <button
                        aria-pressed={selectedSlot === slot.startAt}
                        className={selectedSlot === slot.startAt ? "is-selected" : ""}
                        disabled={manageWorking}
                        key={slot.startAt}
                        onClick={() => setSelectedSlot(slot.startAt)}
                        style={place}
                        type="button"
                      >
                        {formatSlotTime(slot.startAt, viewZone)}
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
                    {managed.sameDayFeeAutomatic ? " The lesson price is charged after the lesson." : ""}
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
                      ? manageMode === "reschedule-sequence" ? "Moving weekly time…" : "Changing…"
                      : manageMode === "reschedule-sequence"
                        ? "Move weekly time"
                        : selectedSlot
                        ? selectedSlot === managed.booking.startAt
                          ? "Save changes"
                          : `Change to ${formatSlotTime(selectedSlot, viewZone)}`
                        : "Choose a time"}
                  </button>
                  <button
                    className="button button--quiet"
                    disabled={manageWorking}
                    onClick={() => transitionBooking(() => setManageMode(manageMode === "reschedule-sequence" ? "sequence" : "view"))}
                    type="button"
                  >
                    {manageMode === "reschedule-sequence" ? "Keep current schedule" : "Keep current time"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* With no day chosen while booking, the heading already names
                    what the panel holds; an eyebrow above it would only stutter. */}
                {intent === "lessons" || (selectedDate && !bookingDateChosen) ? (
                  <p className="eyebrow">{selectedDate ? "Selected day" : "Your lessons"}</p>
                ) : null}
                <div className="unified-calendar__panel-head">
                  <h3 id="unified-calendar-panel-heading">
                    {selectedDate && bookingDateChosen ? (
                      <>
                        <span className="unified-calendar__date-long">{formatLongDate(`${selectedDate}T12:00:00Z`)}</span>
                        <span aria-hidden="true" className="unified-calendar__date-short">
                          {formatShortDay(`${selectedDate}T12:00:00Z`)} {selectedDate.slice(0, 4)}
                        </span>
                      </>
                    ) : selectedDate
                      ? formatLongDate(`${selectedDate}T12:00:00Z`)
                      : intent === "lessons" && !calendarWindowBookings.length
                        ? "Nothing booked yet"
                        : "Choose a day"}
                  </h3>
                  {/* On a phone the times take the calendar's place, so the way
                      back to it sits beside the date, which is short enough to
                      share the row. */}
                  {bookingDateChosen ? (
                    <button aria-label="Change date" className="button button--outline button--compact unified-calendar__change-date" onClick={changeDateChoice} type="button">
                      Change
                    </button>
                  ) : null}
                </div>
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
                          <strong>{formatTimeIn(booking.startAt, zoneOf(booking))}</strong>
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
                    {!selectedDate ? null : loadingSlots ? (
                      <p className="booking-state-note">Checking what&rsquo;s free…</p>
                    ) : daySlots.length ? (
                      <TimePicker
                        halves={timeHalves}
                        key={selectedDate}
                        renderTime={(slot, place) => (
                          <button
                            key={slot.startAt}
                            style={place}
                            onClick={() => chooseSlot(slot)}
                            type="button"
                          >
                            {formatSlotTime(slot.startAt, viewZone)}
                          </button>
                        )}
                        zone={viewZone}
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
              {slotNotice ? <p className="booking-state-note booking-state-note--notice" role="status">{slotNotice}</p> : null}
              {/* Beside the repeat and length that cause them, so a clash shows
                  as soon as either changes, signed in or not. */}
              {form.repeat !== "once" ? (
                <RepeatAvailability
                  chosen={Boolean(chosen)}
                  error={seriesPreviewError}
                  preview={seriesPreview}
                  previewing={previewing}
                  zone={viewZone}
                />
              ) : null}
            </div>
            <div className="booking-confirmation-main">
              {/* Signed out, the sign-in card's "Almost there" is the visible heading.
                  This one stays for screen readers and as the step's focus target.
                  Weekly lessons are simply "lessons" here: the bar above already
                  says they repeat (9 October 2026, at Dan's request). */}
              <h2 className={student ? "booking-step-heading" : "booking-step-heading visually-hidden"} id="booking-step-heading" tabIndex={-1}>
                {student
                  ? form.repeat === "once" && bookingChoices.length < 2 ? "Confirm your lesson" : "Confirm your lessons"
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
                        <p>
                          {paymentError}{" "}
                          <button className="text-action" type="button" onClick={() => {
                            setPaymentError("");
                            setPaymentAttempt((attempt) => attempt + 1);
                          }}>
                            Try again
                          </button>
                        </p>
                      </div>
                    ) : null}
                    <div className="booking-payment__mount" ref={paymentMountRef} />
                    <button className="booking-back booking-back--tertiary" onClick={() => setPayment(null)} type="button">
                      <ArrowLeft size={16} aria-hidden="true" /> Back to make a change
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
                      refreshStudentInBackground();
                    }}
                  />
                ) : (
                  <form className="student-details-form" onSubmit={submit}>
                    {form.repeat !== "once" && lessonType?.id !== "trial" ? (
                      <div className="booking-recurring-rate">
                        <p><strong>{lessonType ? formatMoneyCents(lessonType.price_cents) : ""} per lesson</strong></p>
                        {ratesError ? <p role="status">{ratesError}</p> : null}
                      </div>
                    ) : null}

                    <div className="booking-confirmation-columns">
                      <label className="booking-confirmation-notes">
                        <span>
                          <MessageSquareText size={16} aria-hidden="true" />
                          Add a note <em>(optional)</em>
                        </span>
                        <textarea
                          disabled={submitting}
                          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                          rows={1}
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

                        {/* The payment facts as a short list, each after a little
                            splat, so each fee reads at a glance. It also describes
                            the agreement control. */}
                        <ul className="booking-payment-facts" id="booking-payment-summary">
                          {postpay ? (
                            <>
                              <li>No payment is taken now</li>
                              <li>Your card is charged after each lesson</li>
                              <li>
                                <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong> to move or cancel less than {NOTICE_HOURS} hours before
                              </li>
                              <li>
                                <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong> for a no-show
                              </li>
                            </>
                          ) : (
                            <>
                              <li>Pay Inês on the lesson day</li>
                              <li>
                                <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong> to move or cancel less than {NOTICE_HOURS} hours before
                              </li>
                            </>
                          )}
                          {form.repeat === null ? <li>Ongoing lessons repeat until you stop them</li> : null}
                          {needsPaymentConsent ? null : (
                            <li>
                              The full rules are in{" "}
                              <a aria-haspopup="dialog" data-terms-privacy href="#terms-privacy">terms &amp; privacy</a>
                            </li>
                          )}
                        </ul>

                        {needsPaymentConsent ? (
                          <div className="booking-agreement">
                            <div className={`booking-agreement__control${paymentConsent ? " is-agreed" : ""}`}>
                              <button
                                className="booking-agreement__button"
                                disabled={submitting}
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
                          </div>
                        ) : null}

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
      </StageElement>

    </section>
  );
}
