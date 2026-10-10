"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Repeat2,
} from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { WeeklyTimetable } from "@/components/teacher/WeeklyTimetable";
import { LessonDetails } from "@/components/teacher/LessonDetails";
import { TeacherMeetConnection } from "@/components/teacher/TeacherMeetConnection";
import { ManualLessonForm } from "@/components/teacher/ManualLessonForm";
import {
  fetchBookings,
  fetchSchedule,
  saveDayOff,
  saveRules,
  type AdminBooking,
  type AvailabilityException,
} from "@/lib/admin-api";
import { clearSession, fetchMe, readSession, subscribeToSession, type Student } from "@/lib/auth-api";
import { portoTimeToUtc } from "@/lib/booking-api";
import { BOOKING_CONFIGURED } from "@/lib/config";
import { SITE_BASE_PATH } from "@/lib/paths";
import {
  addSpan,
  bookingSegments,
  dateBlocks,
  dateKey,
  dateLabel,
  hoursFromRules,
  hoursProblem,
  mondayOf,
  removeSpan,
  serialiseHours,
  shiftDate,
  spanLabel,
  withDayChanges,
  type Span,
  type WeekHours,
} from "@/lib/teacher-calendar";

const emptyWeek = hoursFromRules([]);

/** A date's time off as last chosen, until the Worker confirms it. */
type DayChange = { dayOff?: boolean; blocks?: Span[]; version: number };

function shortDate(date: string) {
  return dateLabel(date, { weekday: "short", day: "numeric", month: "short" });
}

export function TeacherSchedule() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<Student | null>(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const today = dateKey(now);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [mobileDay, setMobileDay] = useState(
    () => (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7,
  );
  const [editing, setEditing] = useState(false);
  const [savedHours, setSavedHours] = useState<WeekHours>(emptyWeek);
  const [draftHours, setDraftHours] = useState<WeekHours>(emptyWeek);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [dayChanges, setDayChanges] = useState<Map<string, DayChange>>(
    () => new Map(),
  );
  const [savingDays, setSavingDays] = useState(false);
  const [dayNote, setDayNote] = useState<{ error: boolean; text: string }>();
  const [interval, setIntervalMinutes] = useState(30);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(
    null,
  );
  const [paymentReview, setPaymentReview] = useState<
    { id: string; reference: string }[]
  >([]);
  const [initialised, setInitialised] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleAttempt, setScheduleAttempt] = useState(0);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState("");
  const [savingHours, setSavingHours] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const bookingRequest = useRef(0);
  const calendarTitleRef = useRef<HTMLHeadingElement>(null);
  const accountGeneration = useRef(0);
  const dayChangesRef = useRef(dayChanges);
  const dayVersion = useRef(0);
  const sendingDays = useRef(false);
  useEffect(() => () => {
    accountGeneration.current += 1;
    bookingRequest.current += 1;
  }, []);
  const shownExceptions = useMemo(
    () => withDayChanges(exceptions, dayChanges),
    [exceptions, dayChanges],
  );
  const hoursDirty = serialiseHours(savedHours) !== serialiseHours(draftHours);
  const invalidHours = hoursProblem(draftHours);

  const resetAccount = useCallback(() => {
    accountGeneration.current += 1;
    bookingRequest.current += 1;
    setToken("");
    setMe(null);
    setInitialised(false);
    setEditing(false);
    setSelectedBooking(null);
    setBookings([]);
    setPaymentReview([]);
    setSavedHours(emptyWeek);
    setDraftHours(emptyWeek);
    setExceptions([]);
    dayChangesRef.current = new Map();
    setDayChanges(new Map());
    sendingDays.current = false;
    setSavingDays(false);
    setSavingHours(false);
    setDayNote(undefined);
    setAuthError("");
    setStatus("");
    setError("");
  }, []);

  useEffect(() => {
    let session = readSession();
    return subscribeToSession(() => {
      const current = readSession();
      if (current === session) return;
      session = current;
      resetAccount();
      setAuthAttempt(value => value + 1);
    });
  }, [resetAccount]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const session = readSession();
    if (!session) {
      setChecking(false);
      return;
    }
    setChecking(true);
    setAuthError("");
    fetchMe(session)
      .then((data) => {
        if (!active || readSession() !== session) return;
        setMe(data?.student ?? null);
        if (data?.student.role === "teacher") setToken(session);
      })
      .catch(() => {
        if (active)
          setAuthError("We couldn’t check your account. Please try again.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [authAttempt]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setScheduleError("");
    fetchSchedule(token)
      .then((schedule) => {
        if (!active || readSession() !== token) return;
        const hours = hoursFromRules(schedule.rules);
        setSavedHours(hours);
        setDraftHours(hours);
        setExceptions(schedule.exceptions);
        setIntervalMinutes(schedule.settings?.slotIntervalMinutes ?? 30);
        setInitialised(true);
      })
      .catch((caught) => {
        if (active)
          setScheduleError(
            caught instanceof Error
              ? caught.message
              : "Your weekly hours couldn’t be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, scheduleAttempt]);

  const reloadBookings = useCallback(async () => {
    if (!token || readSession() !== token) return;
    const request = ++bookingRequest.current;
    setBookingsLoading(true);
    setBookingsError("");
    try {
      // Include an overnight lesson that began before the displayed week.
      const fromDate = [
        shiftDate(weekStart, -1),
        shiftDate(today, -1),
      ].sort()[0];
      const result = await fetchBookings(
        token,
        portoTimeToUtc(fromDate, "00:00"),
      );
      if (request !== bookingRequest.current) return;
      setBookings(
        result.bookings.filter((booking) => booking.status === "confirmed"),
      );
      setPaymentReview(result.manualPaymentReconciliation ?? []);
    } catch (caught) {
      if (request === bookingRequest.current)
        setBookingsError(
          caught instanceof Error
            ? caught.message
            : "The lessons for this week couldn’t be loaded.",
        );
    } finally {
      if (request === bookingRequest.current) setBookingsLoading(false);
    }
  }, [token, weekStart, today]);

  useEffect(() => {
    void reloadBookings();
  }, [reloadBookings]);

  useEffect(() => {
    const dirty = hoursDirty || dayChanges.size > 0;
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hoursDirty, dayChanges]);

  async function saveHours() {
    if (savingHours || invalidHours) return;
    const account = accountGeneration.current;
    setSavingHours(true);
    setError("");
    setStatus("");
    const submitted = draftHours;
    try {
      await saveRules(
        token,
        Object.entries(submitted).flatMap(([day, windows]) =>
          windows.map((window) => ({
            weekday: Number(day),
            startMinute: window.start,
            lastStartMinute: window.lastStart,
          })),
        ),
      );
      if (account !== accountGeneration.current) return;
      setSavedHours(submitted);
      setStatus("Weekly hours saved. Students can now book these times.");
    } catch (caught) {
      if (account !== accountGeneration.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Your hours couldn’t be saved. Your changes are still here.",
      );
    } finally {
      if (account === accountGeneration.current) setSavingHours(false);
    }
  }

  function updateDayChanges(update: (changes: Map<string, DayChange>) => void) {
    const next = new Map(dayChangesRef.current);
    update(next);
    dayChangesRef.current = next;
    setDayChanges(next);
  }

  /**
   * Time off saves as she clicks. Changes go one at a time and each sends the
   * date's latest choice, so quick clicks coalesce and never race each other.
   * A failure puts that date back as saved rather than leaving it looking done.
   */
  async function sendDayChanges() {
    if (sendingDays.current) return;
    const account = accountGeneration.current;
    sendingDays.current = true;
    setSavingDays(true);
    try {
      while (dayChangesRef.current.size) {
        if (account !== accountGeneration.current) return;
        const [date, change] = dayChangesRef.current.entries().next().value!;
        try {
          const result = await saveDayOff(token, date, change);
          if (account !== accountGeneration.current) return;
          setExceptions((current) => [
            ...current.filter((row) => row.date !== date),
            ...result.exceptions,
          ]);
          updateDayChanges((changes) => {
            if (changes.get(date)?.version === change.version)
              changes.delete(date);
          });
        } catch (caught) {
          if (account !== accountGeneration.current) return;
          // A failed earlier save does not own a newer choice for this date.
          // Keep that choice queued so the next request can save it in full.
          if (dayChangesRef.current.get(date)?.version === change.version) {
            updateDayChanges((changes) => changes.delete(date));
            setDayNote({
              error: true,
              text: `${shortDate(date)} was not changed. ${caught instanceof Error ? caught.message : "Please try again."}`,
            });
          }
        }
      }
    } finally {
      if (account === accountGeneration.current) {
        sendingDays.current = false;
        setSavingDays(false);
      }
    }
  }

  function changeDay(
    date: string,
    change: Omit<DayChange, "version">,
    text: string,
  ) {
    updateDayChanges((changes) =>
      changes.set(date, {
        ...changes.get(date),
        ...change,
        version: ++dayVersion.current,
      }),
    );
    setDayNote({ error: false, text });
    void sendDayChanges();
  }

  function lessonsDuring(date: string, span: Span = { start: 0, end: 1440 }) {
    return bookingSegments(bookings, mondayOf(date)).filter(
      (segment) =>
        segment.date === date &&
        segment.start < span.end &&
        span.start < segment.end,
    ).length;
  }

  function stayBooked(count: number) {
    if (!count) return "";
    return count === 1
      ? " The lesson already booked stays in place."
      : ` The ${count} lessons already booked stay in place.`;
  }

  function takeDayOff(date: string, off: boolean) {
    changeDay(
      date,
      { dayOff: off },
      off
        ? `${shortDate(date)} is a day off.${stayBooked(lessonsDuring(date))}`
        : `${shortDate(date)} is open again.`,
    );
  }

  function blockTime(date: string, span: Span, blocked: boolean) {
    const current = dateBlocks(shownExceptions, date);
    changeDay(
      date,
      { blocks: blocked ? addSpan(current, span) : removeSpan(current, span) },
      blocked
        ? `${spanLabel(span)} on ${shortDate(date)} is off.${stayBooked(lessonsDuring(date, span))}`
        : `${spanLabel(span)} on ${shortDate(date)} is open again.`,
    );
  }

  const weekEnd = shiftDate(weekStart, 6);
  const weekCount = bookings.filter(
    (booking) =>
      dateKey(new Date(booking.starts_at)) <= weekEnd &&
      dateKey(new Date(Date.parse(booking.ends_at) - 1)) >= weekStart,
  ).length;

  if (!BOOKING_CONFIGURED)
    return (
      <p className="booking-state-note">
        The booking service is not connected yet.
      </p>
    );
  if (checking)
    return (
      <p className="teacher-loading" role="status">
        Opening your schedule…
      </p>
    );
  if (authError)
    return (
      <div className="teacher-inline-error" role="alert">
        <p>{authError}</p>
        <button
          className="teacher-text-button"
          type="button"
          onClick={() => setAuthAttempt((value) => value + 1)}
        >
          Try again
        </button>
      </div>
    );
  if (!token) {
    if (me)
      return (
        <div className="booking-alert" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            You&rsquo;re signed in as {me.name}, and this page is Inês&rsquo;s.
            If it should be yours,{" "}
            <a href={`${SITE_BASE_PATH}/book/?view=lessons`}>switch account</a>.
          </p>
        </div>
      );
    return (
      <AuthPanel
        heading="Sign in"
        headingLevel={2}
        signInOnly
        onSignedIn={(student) => {
          setMe(student);
          if (student.role === "teacher") setToken(readSession());
        }}
      />
    );
  }
  if (scheduleError)
    return (
      <div className="teacher-inline-error" role="alert">
        <p>{scheduleError}</p>
        <button
          className="teacher-text-button"
          type="button"
          onClick={() => setScheduleAttempt((value) => value + 1)}
        >
          Try again
        </button>
      </div>
    );
  if (!initialised)
    return (
      <p className="teacher-loading" role="status">
        Loading your weekly hours…
      </p>
    );

  function signOut() {
    if (hoursDirty && !window.confirm("Sign out and lose the weekly hours you haven’t saved?")) return;
    clearSession();
    resetAccount();
  }

  return (
    <div className="teacher-workspace">
      {/* Meet's status and a small Sign out share one line at the top, so the
          page opens onto the week rather than an account card (10 October
          2026, at Dan's request). */}
      <div className="teacher-topline">
        <TeacherMeetConnection token={token} />
        <button
          className="teacher-sign-out"
          disabled={savingDays || savingHours}
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
      </div>
      {paymentReview.length ? (
        <div className="teacher-inline-notice" role="status">
          <AlertCircle size={19} aria-hidden="true" />
          <p>
            {paymentReview.length}{" "}
            {paymentReview.length === 1
              ? "payment or refund needs"
              : "payments or refunds need"}{" "}
            review: {paymentReview.map((item) => item.reference).join(", ")}.
            Review these in Stripe before retrying. Their lessons remain locked
            until the result is confirmed.
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="teacher-inline-error" role="alert">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="teacher-inline-success" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          {status}
        </div>
      ) : null}

      <section className="teacher-week" aria-labelledby="teacher-week-title">
        {/* One bar holds the week, Weekly hours, the hint and the pager, in
            that reading order. Wide, the week and Weekly hours share the top
            row with the hint and pager beneath. Narrower, the week, Weekly
            hours and the pager share a row where they fit (on a phone the week
            has its own, with the other two beneath it), and the hint follows. */}
        <div className="teacher-week-toolbar">
          <div className="teacher-week-title">
            <span className="teacher-eyebrow">
              {editing ? "Set your rhythm" : "Your week at a glance"}
            </span>
            <div className="teacher-week-heading">
              <h2 id="teacher-week-title" ref={calendarTitleRef} tabIndex={-1}>
                {editing
                  ? "Your weekly hours"
                  : `${dateLabel(weekStart, { day: "numeric", month: "short" })} – ${dateLabel(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`}
              </h2>
              {/* How to take time off waits behind a question mark beside the
                  week, as on a student's calendar (10 October 2026, at Dan's
                  request). */}
              {editing ? null : (
                <span className="teacher-week-help">
                  <button
                    aria-describedby="teacher-week-tip"
                    aria-label="How to take time off"
                    className="teacher-week-help__button"
                    type="button"
                  >
                    <CircleHelp size={17} aria-hidden="true" />
                  </button>
                  <span className="teacher-week-help__tip" id="teacher-week-tip" role="tooltip">
                    <span className="teacher-hint-mouse">
                      Click a time to take it off, or drag across several. Click it
                      again to reopen it.
                    </span>
                    <span className="teacher-hint-touch">
                      Tap a time to take it off, and tap it again to reopen it.
                    </span>
                  </span>
                </span>
              )}
            </div>
          </div>
          {editing ? (
            <button
              className="button button--outline teacher-mode-button"
              type="button"
              onClick={() => setEditing(false)}
            >
              <CalendarDays size={16} aria-hidden="true" />
              Back to calendar
            </button>
          ) : (
            <button
              className="button button--coral teacher-mode-button"
              type="button"
              onClick={() => setEditing(true)}
            >
              <Repeat2 size={16} aria-hidden="true" />
              Weekly hours
              {hoursDirty ? (
                <span
                  className="teacher-unsaved-dot"
                  aria-label="unsaved changes"
                />
              ) : null}
            </button>
          )}
          {editing ? (
            <p className="teacher-week-hint">Click or drag down a day to mark lesson start times.</p>
          ) : null}
          {editing ? (
            <span className="teacher-repeat-note">
              <Repeat2 size={15} aria-hidden="true" />
              Repeats every week
            </span>
          ) : (
            <div className="teacher-week-navigation">
              <button
                className="teacher-icon-button"
                type="button"
                aria-label="Previous week"
                onClick={() => setWeekStart(shiftDate(weekStart, -7))}
              >
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <button
                className="teacher-text-button"
                type="button"
                onClick={() => setWeekStart(mondayOf(today))}
              >
                This week
              </button>
              <button
                className="teacher-icon-button"
                type="button"
                aria-label="Next week"
                onClick={() => setWeekStart(shiftDate(weekStart, 7))}
              >
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        {!editing && bookingsLoading ? (
          <p className="teacher-calendar-loading" role="status">
            Loading this week&rsquo;s lessons…
          </p>
        ) : !editing && bookingsError ? (
          <div className="teacher-calendar-loading" role="alert">
            <p>{bookingsError}</p>
            <button
              className="teacher-text-button"
              type="button"
              onClick={() => {
                calendarTitleRef.current?.focus({ preventScroll: true });
                void reloadBookings();
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <WeeklyTimetable
            weekStart={weekStart}
            hours={editing ? draftHours : savedHours}
            bookings={bookings}
            exceptions={shownExceptions}
            editing={editing}
            interval={interval}
            disabled={savingHours}
            mobileDay={mobileDay}
            status={
              editing ? null : (
                <p
                  className={`teacher-save-state ${dayNote?.error ? "is-error" : ""}`}
                  role={dayNote?.error ? "alert" : "status"}
                >
                  {savingDays ? (
                    "Saving…"
                  ) : dayNote ? (
                    <>
                      {dayNote.error ? null : (
                        <Check size={15} aria-hidden="true" />
                      )}
                      {dayNote.text}
                    </>
                  ) : null}
                </p>
              )
            }
            onSelectDay={setMobileDay}
            onChange={(day, windows) => {
              setDraftHours((current) => ({ ...current, [day]: windows }));
              setStatus("");
            }}
            onDayOff={takeDayOff}
            onBlockTime={blockTime}
            onSelectBooking={setSelectedBooking}
          />
        )}
        {editing ? (
          <div className="teacher-hours-save">
            <p className="teacher-secondary-copy">
              The last marked time is the last a lesson can{" "}
              <strong>start</strong>. A lesson can finish later.
            </p>
            <div className="teacher-save-row">
              <span className="teacher-save-note" aria-live="polite">
                {hoursDirty
                  ? "You have unsaved hours."
                  : "Your saved weekly hours."}
              </span>
              {hoursDirty ? (
                <button
                  className="teacher-text-button"
                  type="button"
                  disabled={savingHours}
                  onClick={() => setDraftHours(savedHours)}
                >
                  Discard
                </button>
              ) : null}
              <button
                className="button button--coral"
                type="button"
                disabled={savingHours || !hoursDirty || Boolean(invalidHours)}
                onClick={() => void saveHours()}
              >
                {savingHours ? "Saving…" : "Save weekly hours"}
              </button>
            </div>
            {invalidHours ? (
              <p className="teacher-inline-error" role="alert">
                {invalidHours}
              </p>
            ) : null}
          </div>
        ) : !bookingsLoading && !bookingsError && !weekCount ? (
          <p className="teacher-empty-week">
            No lessons booked this week. Your weekly hours are shown above.
          </p>
        ) : null}
      </section>

      <ManualLessonForm token={token} onCreated={() => void reloadBookings()} />
      {selectedBooking ? (
        <LessonDetails
          key={selectedBooking.id}
          booking={selectedBooking}
          token={token}
          now={now}
          afterChangeFocusRef={calendarTitleRef}
          onClose={() => setSelectedBooking(null)}
          onChanged={(message) => {
            if (readSession() !== token) return;
            setSelectedBooking(null);
            setStatus(message);
            void reloadBookings();
          }}
        />
      ) : null}
    </div>
  );
}
