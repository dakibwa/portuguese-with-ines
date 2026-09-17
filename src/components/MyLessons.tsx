"use client";

import { MeetingLink } from "@/components/MeetingLink";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleHelp, CircleX, Globe2, Menu as MenuIcon, Repeat } from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { LessonMark } from "@/components/LessonMarks";
import {
  clearSession,
  confirmEmailChange,
  fetchMe,
  readSession,
  requestEmailChange,
  updateProfile,
  type LessonSeries,
  type MyBooking,
  type Student
} from "@/lib/auth-api";
import {
  browserTimeZone,
  buildBookingWeeks,
  differingLocalTime,
  formatSlotTimeForStudent,
  formatBookedLessonLabel,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  portoDateKey,
  shortMonth,
  stopSeries
} from "@/lib/booking-api";
import { BOOKING_HORIZON_DAYS_FALLBACK, BOOKING_TIME_ZONE } from "@/lib/config";

/** Index matches the Worker's weekday, which is 0 = Sunday. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type UpcomingLessonGroup = {
  id: string;
  seriesId: string | null;
  bookings: MyBooking[];
};

export type UpcomingBookingFocusRequest = {
  bookingReference: string;
  requestKey: number;
  seriesId: string | null;
};

function upcomingBookingId(reference: string) {
  return `upcoming-booking-${encodeURIComponent(reference)}`;
}

function minutesToClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function historyTime(booking: MyBooking) {
  return Date.parse(booking.status === "cancelled" && booking.cancelledAt ? booking.cancelledAt : booking.endAt);
}

function HistoryLessonCard({ booking, zone }: { booking: MyBooking; zone: string }) {
  const cancelled = booking.status === "cancelled";

  return (
    <article className={`upcoming-lesson-group history-lesson-card history-lesson-card--${cancelled ? "cancelled" : "completed"}`}>
      <div className="upcoming-lesson-group__summary history-lesson-card__summary">
        <LessonMark
          className="lesson-calendar__mark"
          durationMinutes={booking.lessonType.durationMinutes}
          lessonTypeId={booking.lessonType.id}
          location={booking.location}
        />
        <span className="lesson-calendar__lesson-copy">
          <span className={`lesson-calendar__status history-lesson-card__status--${cancelled ? "cancelled" : "completed"}`}>
            {cancelled ? <CircleX size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
            {cancelled ? "Cancelled" : "Completed"}
          </span>
          <strong>{formatLongDate(booking.startAt)}, {formatSlotTimeForStudent(booking.startAt, zone)}</strong>
          <span>
            {formatBookedLessonLabel(booking.lessonType)} · {booking.location === "porto" ? "In Porto" : "Online"}
          </span>
          <small className="history-lesson-card__reference">Reference {booking.reference}</small>
        </span>
      </div>
    </article>
  );
}

export function MyLessons({
  calendarHorizonDays = BOOKING_HORIZON_DAYS_FALLBACK,
  embedded = false,
  bookingActive = false,
  onBook,
  onManage,
  onOpenAccountSection,
  onSignedOut,
  onTransition,
  focusUpcomingBooking,
  focusUpcomingOnOpen = true,
  openUpcomingRequest = 0,
  showCalendar = true,
  showHistory = true,
  showUpcomingLessons = true,
  showSeries = true
}: {
  calendarHorizonDays?: number;
  embedded?: boolean;
  bookingActive?: boolean;
  onBook?: () => void;
  onManage?: (token: string, seriesId: string | null, openSeries?: boolean) => void;
  onOpenAccountSection?: (section: "history" | "upcoming" | "profile") => void;
  onSignedOut?: () => void;
  onTransition?: (update: () => void) => void;
  focusUpcomingBooking?: UpcomingBookingFocusRequest | null;
  focusUpcomingOnOpen?: boolean;
  openUpcomingRequest?: number;
  showCalendar?: boolean;
  showHistory?: boolean;
  showUpcomingLessons?: boolean;
  showSeries?: boolean;
} = {}) {
  const [student, setStudent] = useState<Student | null>(null);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [series, setSeries] = useState<LessonSeries[]>([]);
  const [confirmingStop, setConfirmingStop] = useState("");
  const [stopping, setStopping] = useState("");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountSection, setAccountSection] = useState<"history" | "upcoming" | "">("");
  const [expandedUpcomingGroup, setExpandedUpcomingGroup] = useState("");
  const [highlightedBookingReference, setHighlightedBookingReference] = useState("");
  const [details, setDetails] = useState({ name: "", email: "", nif: "" });
  const [savingName, setSavingName] = useState(false);
  const [savingNif, setSavingNif] = useState(false);
  const [emailPending, setEmailPending] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [detailsNote, setDetailsNote] = useState("");
  const [feeCents, setFeeCents] = useState(500);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zone, setZone] = useState(BOOKING_TIME_ZONE);
  const [todayKey, setTodayKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingActive) return;
    setMenuOpen(false);
    setEditing(false);
    setExpandedUpcomingGroup("");
    setAccountSection("");
  }, [bookingActive]);

  useEffect(() => {
    if (!embedded || !openUpcomingRequest) return;
    setMenuOpen(false);
    setEditing(false);
    setExpandedUpcomingGroup("");
    setAccountSection("upcoming");
    if (!focusUpcomingOnOpen) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("account-upcoming-lessons")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [embedded, focusUpcomingOnOpen, openUpcomingRequest]);

  const applyTransition = useCallback(
    (update: () => void) => {
      if (onTransition) onTransition(update);
      else update();
    },
    [onTransition]
  );

  useEffect(() => {
    if (!embedded || !focusUpcomingBooking) return;

    const { bookingReference, seriesId } = focusUpcomingBooking;
    setMenuOpen(false);
    setEditing(false);
    setAccountSection("upcoming");
    setExpandedUpcomingGroup(seriesId ? `series:${seriesId}` : "");
    setHighlightedBookingReference(bookingReference);

    const highlightTimeout = window.setTimeout(() => setHighlightedBookingReference(""), 1800);

    return () => {
      window.clearTimeout(highlightTimeout);
    };
  }, [embedded, focusUpcomingBooking]);

  // This effect runs after the group expansion has committed, so the exact
  // occurrence is guaranteed to exist before focus and scrolling are applied.
  useEffect(() => {
    if (accountSection !== "upcoming" || !highlightedBookingReference) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(upcomingBookingId(highlightedBookingReference));
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountSection, expandedUpcomingGroup, highlightedBookingReference]);

  const load = useCallback(async (animate = false, after?: () => void) => {
    const session = readSession();
    if (!session) {
      setStudent(null);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchMe(session);
      if (!data) {
        setStudent(null);
        return;
      }
      const update = () => {
        setStudent(data.student);
        setDetails({ name: data.student.name, email: data.student.email, nif: data.student.nif ?? "" });
        setBookings(data.bookings);
        setSeries(data.series ?? []);
        setFeeCents(data.sameDayFeeCents);
        after?.();
      };
      if (animate) applyTransition(update);
      else update();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your lessons.");
    } finally {
      setLoading(false);
    }
  }, [applyTransition]);

  useEffect(() => {
    setZone(browserTimeZone());
    setTodayKey(portoDateKey(new Date()));
    load();
  }, [load]);

  useEffect(() => {
    if (!embedded || !openUpcomingRequest) return;
    void load();
  }, [embedded, load, openUpcomingRequest]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      window.requestAnimationFrame(() => document.getElementById("account-menu-button")?.focus());
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (selectedDate) return;
    const next = bookings
      .filter((booking) => !booking.isPast && booking.status === "confirmed")
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    if (next) setSelectedDate(portoDateKey(new Date(next.startAt)));
  }, [bookings, selectedDate]);

  /*
   * The link mailed to the new address lands back here. It is applied only for
   * a signed-in student, so possession of the link alone is not enough — the
   * person confirming has to be the person who asked.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const changeToken = params.get("emailToken");
    if (!changeToken || !readSession()) return;

    confirmEmailChange(readSession(), changeToken)
      .then((result) => {
        setStudent(result.student);
        setDetails({ name: result.student.name, email: result.student.email, nif: result.student.nif ?? "" });
        setDetailsNote("That's your email address updated.");
        setEmailPending("");
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "That link could not be used.");
      })
      .finally(() => {
        // Take the token out of the address bar either way, so a refresh does
        // not try to spend a link that has already been used.
        params.delete("emailToken");
        const query = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
      });
  }, []);

  /**
   * Stops the repeat without touching the lessons already booked. Someone who
   * stops repeating almost always still intends to come to the ones in their
   * calendar, and cancelling those silently would be the worse mistake — each
   * can still be cancelled on its own.
   */
  async function saveName() {
    setSavingName(true);
    setError("");
    setDetailsNote("");
    try {
      // Phone and timezone go back untouched: the endpoint keeps a field it is
      // not sent, but sending what we hold is one less thing to rely on.
      const result = await updateProfile(readSession(), {
        name: details.name.trim(),
        phone: student?.phone,
        timezone: student?.timezone
      });
      setStudent(result.student);
      setDetailsNote("Saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setSavingName(false);
    }
  }

  async function saveNif() {
    setSavingNif(true);
    setError("");
    setDetailsNote("");
    try {
      // Only the NIF is sent; the endpoint keeps every field it is not sent.
      const result = await updateProfile(readSession(), { nif: details.nif.trim() });
      setStudent(result.student);
      setDetails((current) => ({ ...current, nif: result.student.nif ?? "" }));
      setDetailsNote(result.student.nif ? "Saved. Your receipts will show this NIF." : "Saved. Your receipts won't show a NIF.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setSavingNif(false);
    }
  }

  async function changeEmail() {
    // Each request sends two emails, so a double-click must not send four.
    if (emailBusy) return;
    setEmailBusy(true);
    setError("");
    setDetailsNote("");
    try {
      const result = await requestEmailChange(readSession(), details.email.trim());
      setEmailPending(result.pending);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be sent.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function stopRepeating(seriesId: string) {
    setStopping(seriesId);
    setError("");
    try {
      await stopSeries(readSession(), seriesId);
      // Reload rather than patching state: the lessons keep their series_id in
      // the database, and it is the *active* series list that decides whether
      // "one of your weekly lessons" is still true of them.
      await load(true, () => {
        setSeries((current) => current.filter((entry) => entry.id !== seriesId));
        setConfirmingStop("");
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That repeat could not be stopped.");
    } finally {
      setStopping("");
    }
  }

  function keepRepeating(seriesId: string) {
    applyTransition(() => {
      setConfirmingStop("");
      // The choice that opened the confirmation reappears in the next render.
      // Put keyboard focus back there instead of dropping it on the document.
      window.requestAnimationFrame(() => document.getElementById(`stop-repeat-${seriesId}`)?.focus());
    });
  }

  const upcoming = bookings
    .filter((booking) => !booking.isPast && booking.status === "confirmed")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const activeSeriesIds = new Set(series.map((entry) => entry.id));
  const upcomingGroups = Array.from(
    upcoming
      .reduce<Map<string, UpcomingLessonGroup>>((groups, booking) => {
        // A series id records where a booking came from; the active series list
        // says whether it is still repeating. Once a student stops the repeat,
        // the dates they kept become ordinary individual commitments again.
        const seriesId = booking.seriesId && activeSeriesIds.has(booking.seriesId) ? booking.seriesId : null;
        const id = seriesId ? `series:${seriesId}` : `booking:${booking.reference}`;
        const group = groups.get(id) ?? { id, seriesId, bookings: [] };
        group.bookings.push(booking);
        groups.set(id, group);
        return groups;
      }, new Map())
      .values()
  );
  const past = bookings
    .filter((booking) => booking.isPast || booking.status === "cancelled")
    .sort((a, b) => historyTime(b) - historyTime(a) || b.startAt.localeCompare(a.startAt));

  const bookingsByDate = upcoming.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const latestDate = upcoming.length ? portoDateKey(new Date(upcoming[upcoming.length - 1].startAt)) : todayKey;
  const toDayNumber = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  const calendarHorizon =
    todayKey && latestDate
      ? Math.max(calendarHorizonDays, toDayNumber(latestDate) - toDayNumber(todayKey) + 1)
      : calendarHorizonDays;
  const calendarWeeks = todayKey ? buildBookingWeeks(todayKey, calendarHorizon) : [];
  const selectedBookings = selectedDate ? bookingsByDate[selectedDate] ?? [] : [];

  function manage(booking: MyBooking, openSeries = false) {
    // Management now opens as a small decision over this same workspace. Keep
    // the lesson list in place so closing it returns the student to exactly the
    // recurring sequence or one-off lesson they were looking at.
    setMenuOpen(false);
    if (onManage) onManage(booking.manageToken, booking.seriesId, openSeries);
    else window.location.assign(`/book/?manage=${encodeURIComponent(booking.manageToken)}`);
  }

  function openAccountSection(section: "history" | "upcoming") {
    applyTransition(() => {
      setMenuOpen(false);
      setEditing(false);
      if (accountSection !== section) setExpandedUpcomingGroup("");
      setAccountSection(section);
      onOpenAccountSection?.(section);
    });
    window.requestAnimationFrame(() => document.getElementById(`account-${section === "history" ? "past" : "upcoming"}-lessons`)?.focus({ preventScroll: true }));
  }

  function editDetails() {
    if (editing) {
      openAccountSection("upcoming");
      return;
    }
    applyTransition(() => {
      setMenuOpen(false);
      setEditing(true);
      setExpandedUpcomingGroup("");
      setAccountSection("");
      onOpenAccountSection?.("profile");
    });
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".my-lessons__details input")?.focus({ preventScroll: true }));
  }

  function bookLesson() {
    setMenuOpen(false);
    setEditing(false);
    setExpandedUpcomingGroup("");
    setAccountSection("");
    onBook?.();
  }

  if (loading) return <p className="booking-state-note">Loading your lessons…</p>;

  /*
   * An unreachable API leaves `student` null, which used to fall straight
   * through to the sign-in panel — telling someone who is signed in that they
   * are not, and burying the real message. The session is still in hand, so
   * say what actually happened and offer the way back.
   */
  if (!student && error && readSession()) {
    return (
      <div className="my-lessons">
        <div className="booking-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
        <p className="booking-state-note">
          <button
            className="text-action"
            onClick={() => {
              setError("");
              setLoading(true);
              load();
            }}
            type="button"
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  if (!student) {
    return (
      <AuthPanel
        heading="Sign in"
        headingLevel={2}
        intro="Your lessons, and any changes you want to make to them, all live here."
        onSignedIn={(signedIn) => {
          setStudent(signedIn);
          setLoading(true);
          load();
        }}
      />
    );
  }

  const seriesControls = showSeries && series.length ? (
    <section className="my-lessons__series">
      <h2>Repeating</h2>
      {series.map((entry) => (
        <div className="my-lessons__series-row" key={entry.id}>
          <p>
            <Repeat size={16} aria-hidden="true" />
            <strong>{WEEKDAYS[entry.weekday]}s at {minutesToClock(entry.minuteOfDay)}</strong> Porto time
            {entry.openEnded ? ", every week" : ""}. {entry.upcoming}{" "}
            {entry.upcoming === 1 ? "lesson" : "lessons"} still to come.
          </p>
          {confirmingStop === entry.id ? (
            <div
              aria-labelledby={`stop-series-${entry.id}`}
              className="my-lessons__series-confirmation"
              role="group"
            >
              <div>
                <h3 id={`stop-series-${entry.id}`}>Stop repeating lessons?</h3>
                <p>Your booked lessons will stay. You can cancel them individually below.</p>
              </div>
              <div className="my-lessons__series-confirmation-actions">
                <button
                  autoFocus
                  className="button button--coral"
                  disabled={stopping === entry.id}
                  onClick={() => stopRepeating(entry.id)}
                  type="button"
                >
                  {stopping === entry.id ? "Stopping…" : "Yes, stop repeating"}
                </button>
                <button
                  className="text-action"
                  disabled={stopping === entry.id}
                  onClick={() => keepRepeating(entry.id)}
                  type="button"
                >
                  No, keep repeating
                </button>
              </div>
            </div>
          ) : (
            <button
              className="text-action"
              id={`stop-repeat-${entry.id}`}
              onClick={() => applyTransition(() => setConfirmingStop(entry.id))}
              type="button"
            >
              Stop repeating
            </button>
          )}
        </div>
      ))}
    </section>
  ) : null;

  return (
    <div className={`my-lessons${embedded ? " my-lessons--embedded" : ""}`}>
      <div className={embedded ? "unified-account-controls" : undefined}>
      <div className={`my-lessons__header${embedded ? " my-lessons__header--embedded" : ""}`}>
        {embedded ? (
          <div className="my-lessons__account-name">
            <span>Account</span>
            <strong>{student.name}</strong>
          </div>
        ) : (
          <p>
            <strong>{student.name}</strong> · {student.email}
          </p>
        )}
        <div className="my-lessons__header-actions">
          {embedded ? (
            <div className="my-lessons__menu" ref={menuRef}>
              <button
                aria-controls="account-menu"
                aria-expanded={menuOpen}
                className="my-lessons__menu-toggle"
                id="account-menu-button"
                onClick={() => setMenuOpen((open) => !open)}
                type="button"
              >
                <MenuIcon size={16} aria-hidden="true" /> Menu
              </button>
              <div className={`my-lessons__menu-panel${menuOpen ? " is-open" : ""}`} id="account-menu">
                {onBook ? (
                  <button
                    className="my-lessons__menu-book"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditing(false);
                      setAccountSection("");
                      setExpandedUpcomingGroup("");
                      onBook();
                    }}
                    type="button"
                  >
                    Book a lesson
                  </button>
                ) : null}
                {showUpcomingLessons ? (
                  <button
                    aria-controls="account-upcoming-lessons"
                    aria-expanded={accountSection === "upcoming"}
                    aria-current={accountSection === "upcoming" ? "true" : undefined}
                    onClick={() => openAccountSection("upcoming")}
                    type="button"
                  >
                    View lessons {upcomingGroups.length ? <span>{upcomingGroups.length}</span> : null}
                  </button>
                ) : null}
                {showHistory ? (
                  <button
                    aria-controls="account-past-lessons"
                    aria-expanded={accountSection === "history"}
                    aria-current={accountSection === "history" ? "true" : undefined}
                    onClick={() => openAccountSection("history")}
                    type="button"
                  >
                    Past lessons
                  </button>
                ) : null}
                <button
                  aria-current={editing ? "true" : undefined}
                  onClick={editDetails}
                  type="button"
                >
                  {editing ? "Done editing" : "Edit details"}
                </button>
                <button
                  onClick={() =>
                    applyTransition(() => {
                      setMenuOpen(false);
                      clearSession();
                      setStudent(null);
                      setBookings([]);
                      setAccountSection("");
                      setExpandedUpcomingGroup("");
                      onSignedOut?.();
                    })
                  }
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="button button--coral"
                onClick={() => setEditing((open) => !open)}
                type="button"
              >
                {editing ? "Done" : "Edit details"}
              </button>
              <button
                className="button button--quiet"
                onClick={() => {
                  clearSession();
                  setStudent(null);
                  setBookings([]);
                  onSignedOut?.();
                }}
                type="button"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <section className="my-lessons__details">
          <div className="my-lessons__details-row">
            <label>
              <span>Your name</span>
              <input
                autoComplete="name"
                onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))}
                value={details.name}
              />
            </label>
            <button
              className="button button--coral"
              disabled={savingName || !details.name.trim() || details.name.trim() === student.name}
              onClick={saveName}
              type="button"
            >
              {savingName ? "Saving…" : "Save name"}
            </button>
          </div>

          <div className="my-lessons__details-row">
            <label>
              <span>Email address</span>
              <input
                autoComplete="email"
                onChange={(event) => setDetails((current) => ({ ...current, email: event.target.value }))}
                type="email"
                value={details.email}
              />
            </label>
            {/* Changing the address you sign in with is deliberately the slower
                of the two: nothing moves until the new address answers. */}
            <button
              className="button button--blue"
              disabled={emailBusy || !details.email.trim() || details.email.trim() === student.email}
              onClick={changeEmail}
              type="button"
            >
              Send confirmation link
            </button>
          </div>

          {emailPending ? (
            <p className="my-lessons__details-note">
              Check <strong>{emailPending}</strong>. It only becomes your address once that link is used. Until then
              you sign in with {student.email}.
            </p>
          ) : (
            <p className="my-lessons__details-note">
              A new email address only takes effect once you confirm it from the link we send.
            </p>
          )}

          <div className="my-lessons__details-row">
            <label>
              <span>
                NIF <em>(optional)</em>
              </span>
              <input
                autoComplete="off"
                inputMode="numeric"
                maxLength={20}
                onChange={(event) => setDetails((current) => ({ ...current, nif: event.target.value }))}
                value={details.nif}
              />
            </label>
            <button
              className="button button--coral"
              disabled={savingNif || details.nif.trim() === (student.nif ?? "")}
              onClick={saveNif}
              type="button"
            >
              {savingNif ? "Saving…" : "Save NIF"}
            </button>
          </div>
          <p className="my-lessons__details-note">Added to your receipts. Leave it blank if you don&rsquo;t need one.</p>

          {detailsNote ? (
            <p className="my-lessons__details-note my-lessons__details-note--ok">{detailsNote}</p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="booking-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      {seriesControls}
      </div>

      {embedded && accountSection === "upcoming" ? (
        <section className="my-lessons__account-section my-lessons__account-section--detached" id="account-upcoming-lessons" aria-labelledby="upcoming-lessons-heading" tabIndex={-1}>
          <div className="my-lessons__account-section-heading my-lessons__account-section-heading--upcoming">
            <div className="upcoming-lessons__title-line">
              <h3 className="eyebrow" id="upcoming-lessons-heading">Upcoming lessons</h3>
              <button
                aria-describedby="upcoming-lessons-modification-tip"
                aria-label="When individual lessons can be modified"
                className="upcoming-lessons__hint"
                type="button"
              >
                <CircleHelp size={16} aria-hidden="true" />
              </button>
              <span className="upcoming-lessons__tip" id="upcoming-lessons-modification-tip" role="tooltip">
                You can modify individual lessons up to six weeks in advance.
              </span>
            </div>
            {onBook ? (
              <button className="booking-back upcoming-lessons__book-action" onClick={bookLesson} type="button">
                Book a lesson <ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="my-lessons__account-bookings">
            {upcomingGroups.map((group) => {
              const [nextBooking] = group.bookings;
              const isSeries = Boolean(group.seriesId);
              const isExpanded = isSeries && expandedUpcomingGroup === group.id;
              const datesId = group.seriesId ? `upcoming-series-dates-${group.seriesId}` : "";
              const activeSeries = group.seriesId ? series.find((entry) => entry.id === group.seriesId) ?? null : null;
              const visibleOccurrences = isSeries ? group.bookings.slice(0, 6) : group.bookings;
              return (
                <Fragment key={group.id}>
                <article
                  className={`upcoming-lesson-group ${isSeries ? "upcoming-lesson-group--series" : "upcoming-lesson-group--single"}${
                    !isSeries && highlightedBookingReference === nextBooking.reference ? " is-calendar-target" : ""
                  }`}
                  id={!isSeries ? upcomingBookingId(nextBooking.reference) : undefined}
                  tabIndex={!isSeries ? -1 : undefined}
                >
                  <div className="upcoming-lesson-group__summary">
                    <LessonMark
                      className="lesson-calendar__mark"
                      durationMinutes={nextBooking.lessonType.durationMinutes}
                      lessonTypeId={nextBooking.lessonType.id}
                      location={nextBooking.location}
                      recurring={isSeries}
                    />
                    <span className="lesson-calendar__lesson-copy">
                      <span className={`lesson-calendar__status${isSeries ? " lesson-calendar__status--recurring" : ""}`}>
                        {isSeries ? <Repeat size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
                        {isSeries ? "Recurring lesson" : "Booked"}
                      </span>
                      <strong>{isSeries ? "Next: " : ""}{formatLongDate(nextBooking.startAt)}, {formatSlotTimeForStudent(nextBooking.startAt, zone)}</strong>
                      <span>
                        {formatBookedLessonLabel(nextBooking.lessonType)} · {nextBooking.location === "porto" ? "In Porto" : "Online"}
                      </span>
                      <MeetingLink meetingUrl={nextBooking.meetingUrl} location={nextBooking.location} status={nextBooking.status} />
                      {isSeries && activeSeries ? (
                        <small>
                          <Repeat size={13} aria-hidden="true" />
                          <span>Every {WEEKDAYS[activeSeries.weekday]} at {minutesToClock(activeSeries.minuteOfDay)} Porto time</span>
                        </small>
                      ) : null}
                    </span>
                    <div className="upcoming-lesson-group__actions">
                      {isSeries ? (
                        <>
                          <button
                            className="text-action upcoming-lesson-group__recurrence-action"
                            onClick={() => manage(nextBooking, true)}
                            type="button"
                          >
                            Manage recurrence <ChevronRight aria-hidden="true" size={17} />
                          </button>
                          <button
                            aria-controls={datesId}
                            aria-expanded={isExpanded}
                            className="text-action upcoming-lesson-group__dates-toggle"
                            onClick={() =>
                              applyTransition(() => setExpandedUpcomingGroup((current) => current === group.id ? "" : group.id))
                            }
                            type="button"
                          >
                            {isExpanded ? "Hide lessons" : "View next 6 lessons"}
                            {isExpanded
                              ? <ChevronUp aria-hidden="true" size={17} />
                              : <ChevronDown aria-hidden="true" size={17} />}
                          </button>
                        </>
                      ) : (
                        <button className="text-action upcoming-lesson-group__action" onClick={() => manage(nextBooking)} type="button">
                          Manage <ChevronRight aria-hidden="true" size={17} />
                        </button>
                      )}
                    </div>
                  </div>

                </article>

                  {isExpanded ? (
                    <div aria-label="Next recurring lessons" className="upcoming-lesson-occurrences" id={datesId}>
                      {visibleOccurrences.map((booking) => (
                        <button
                          className={`upcoming-lesson-occurrence${
                            highlightedBookingReference === booking.reference ? " is-calendar-target" : ""
                          }`}
                          id={upcomingBookingId(booking.reference)}
                          key={booking.reference}
                          onClick={() => manage(booking)}
                          type="button"
                        >
                          <span>
                            <strong>{formatLongDate(booking.startAt)}, {formatSlotTimeForStudent(booking.startAt, zone)}</strong>
                            <small>{formatBookedLessonLabel(booking.lessonType)} · {booking.location === "porto" ? "In Porto" : "Online"}</small>
                          </span>
                          <span className="upcoming-lesson-group__action">
                            Manage <ChevronRight aria-hidden="true" size={17} />
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
            {!upcomingGroups.length ? <p className="booking-state-note">No upcoming lessons yet.</p> : null}
          </div>
        </section>
      ) : null}

      {embedded && accountSection === "history" ? (
        <section className="my-lessons__account-section my-lessons__account-section--detached" id="account-past-lessons" aria-labelledby="past-lessons-heading" tabIndex={-1}>
          <div className="my-lessons__account-section-heading">
            <h3 className="eyebrow" id="past-lessons-heading">Past lessons</h3>
            {showUpcomingLessons ? (
              <button className="booking-back booking-back--tertiary" onClick={() => openAccountSection("upcoming")} type="button">
                <ArrowLeft size={16} aria-hidden="true" /> Upcoming lessons
              </button>
            ) : null}
          </div>
          {past.length ? (
            <div className="my-lessons__history-bookings">
              {past.map((booking) => <HistoryLessonCard booking={booking} key={booking.reference} zone={zone} />)}
            </div>
          ) : (
            <p className="booking-state-note">No past lessons yet.</p>
          )}
        </section>
      ) : null}

      {showCalendar ? (
      <section className="my-lessons__group">
        <div className="lesson-calendar__heading">
          <div>
            <h2>Your calendar</h2>
            <p>Choose a marked day to see or change the lesson.</p>
          </div>
          {onBook ? (
            <button className="button button--coral" onClick={onBook} type="button">
              Book another lesson
            </button>
          ) : (
            <a className="button button--coral" href="/book/?view=book">
              Book another lesson
            </a>
          )}
        </div>

        {upcoming.length ? (
          <div className="lesson-calendar">
            <div className="calendar-panel lesson-calendar__grid">
              <div className="calendar-weekdays" aria-hidden="true">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div>
                {calendarWeeks.map((week) => (
                  <div className="lesson-calendar__week" key={week.key}>
                    {week.showMonth ? <p className="calendar-month">{week.month}</p> : null}
                    <div className="calendar-week">
                      {week.cells.map((cell) => {
                        const dayBookings = bookingsByDate[cell.key] ?? [];
                        const lessonLabel = dayBookings.length === 1 ? "1 lesson" : `${dayBookings.length} lessons`;
                        const timeLabel =
                          dayBookings.length === 1 ? formatSlotTime(dayBookings[0].startAt) : lessonLabel;
                        return (
                          <button
                            aria-label={`${formatLongDate(`${cell.key}T12:00:00Z`)}${
                              dayBookings.length ? `, ${lessonLabel}` : ", no lessons"
                            }`}
                            aria-pressed={selectedDate === cell.key}
                            className={`${dayBookings.length ? "has-booking" : ""}${
                              selectedDate === cell.key ? " is-selected" : ""
                            }${cell.isToday ? " is-today" : ""}`}
                            disabled={!dayBookings.length}
                            key={cell.key}
                            onClick={() => setSelectedDate(cell.key)}
                            type="button"
                          >
                            <span>
                              {cell.day}
                              {cell.month !== week.monthNumber ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                              {dayBookings.length ? <small>{timeLabel}</small> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="lesson-calendar__agenda" aria-live="polite">
              <p className="eyebrow">Your {selectedBookings.length === 1 ? "lesson" : "lessons"}</p>
              <h3>{selectedDate ? formatLongDate(`${selectedDate}T12:00:00Z`) : "Choose a day"}</h3>
              {selectedBookings.map((booking) => (
                <button
                  className="lesson-calendar__lesson"
                  key={booking.reference}
                  onClick={() => manage(booking)}
                  type="button"
                >
                  <LessonMark
                    className="lesson-calendar__mark"
                    durationMinutes={booking.lessonType.durationMinutes}
                    lessonTypeId={booking.lessonType.id}
                    location={booking.location}
                  />
                  <span className="lesson-calendar__lesson-copy">
                    <strong>{formatSlotTime(booking.startAt)} Porto time</strong>
                    <span>
                      {formatBookedLessonLabel(booking.lessonType)} · {booking.location === "porto" ? "In Porto" : "Online"}
                    </span>
                    {differingLocalTime(booking.startAt, zone) ? (
                      <small>
                        <Globe2 size={14} aria-hidden="true" />
                        {differingLocalTime(booking.startAt, zone)} your time
                      </small>
                    ) : null}
                    {booking.changeLocked ? (
                      <small className="lesson-calendar__notice">
                        This lesson is today and can&rsquo;t be changed.
                      </small>
                    ) : booking.sameDayFeeApplies ? (
                      <small className="lesson-calendar__notice">
                        Changing it today costs {formatMoneyCents(feeCents)}
                        {booking.sameDayFeeAutomatic ? ", charged automatically" : ""}.
                      </small>
                    ) : null}
                  </span>
                  <ChevronRight aria-hidden="true" size={20} />
                </button>
              ))}
            </aside>
          </div>
        ) : (
          <p className="booking-state-note">Nothing booked yet.</p>
        )}
      </section>
      ) : null}

      {!embedded && showHistory && past.length ? (
        <section className="my-lessons__group">
          <h2>History</h2>
          <div className="my-lessons__history-bookings">
            {past.map((booking) => <HistoryLessonCard booking={booking} key={booking.reference} zone={zone} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
