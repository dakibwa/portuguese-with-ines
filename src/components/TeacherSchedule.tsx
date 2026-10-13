"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { WeeklyTimetable } from "@/components/teacher/WeeklyTimetable";
import { LessonDetails } from "@/components/teacher/LessonDetails";
import { TeacherMeetConnection } from "@/components/teacher/TeacherMeetConnection";
import { AddLessonDialog, ManualLessonForm } from "@/components/teacher/ManualLessonForm";
import { StudentList } from "@/components/teacher/StudentList";
import { NextLesson } from "@/components/teacher/NextLesson";
import { TimeOffCalendar } from "@/components/teacher/TimeOffCalendar";
import { TeacherTabs, type TeacherTab } from "@/components/teacher/TeacherTabs";
import {
  fetchBookings,
  fetchSchedule,
  fetchStudents,
  saveDayOff,
  saveRules,
  type AdminBooking,
  type AdminStudent,
  type AvailabilityException,
} from "@/lib/admin-api";
import { clearSession, fetchMe, readSession, subscribeToSession, type Student } from "@/lib/auth-api";
import { formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
import { BOOKING_CONFIGURED } from "@/lib/config";
import { SITE_BASE_PATH } from "@/lib/paths";
import {
  addSpan,
  bookingSegments,
  bookingsAffectedByHours,
  dateBlocks,
  dateKey,
  daysOff,
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
  const [activeTab, setActiveTab] = useState<TeacherTab>("week");
  const editing = activeTab === "hours";
  const [meetAttention, setMeetAttention] = useState(false);
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
  // A free time chosen on the week, for a lesson added there.
  const [addLesson, setAddLesson] = useState<{ date: string; minute: number } | null>(null);
  // Her students, read once with the page and again after each lesson she
  // adds: the form suggests them and Your students lists them.
  const [students, setStudents] = useState<{ list: AdminStudent[]; cardsAccepted: boolean } | null>(null);
  const [studentsError, setStudentsError] = useState("");
  // A student chosen from her list, put straight into the add-a-lesson form.
  const [formStudent, setFormStudent] = useState<{ email: string; name: string; key: number }>();
  const [paymentReview, setPaymentReview] = useState<
    { id: string; reference: string }[]
  >([]);
  const [initialised, setInitialised] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleAttempt, setScheduleAttempt] = useState(0);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  // Once a week has shown, turning to another keeps the timetable in place
  // while that week's lessons arrive, rather than blanking it to a loading
  // note between weeks (12 October 2026: the arrows' slide had nothing to
  // slide).
  const [bookingsShown, setBookingsShown] = useState(false);
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
  const affectedLessons = useMemo(() => bookingsAffectedByHours(bookings, savedHours, draftHours, interval, now), [bookings, savedHours, draftHours, interval, now]);

  const resetAccount = useCallback(() => {
    accountGeneration.current += 1;
    bookingRequest.current += 1;
    setToken("");
    setMe(null);
    setInitialised(false);
    setActiveTab("week");
    setMeetAttention(false);
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
    const result = new URL(window.location.href).searchParams.get("meet");
    if (result && ["connected", "cancelled", "error"].includes(result)) setActiveTab("meet");
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

  const reloadStudents = useCallback(async () => {
    if (!token || readSession() !== token) return;
    try {
      const data = await fetchStudents(token);
      if (readSession() !== token) return;
      setStudents({ list: data.students, cardsAccepted: Boolean(data.cardsAccepted) });
      setStudentsError("");
    } catch (caught) {
      if (readSession() === token) setStudentsError(caught instanceof Error ? caught.message : "Your students couldn’t be loaded.");
    }
  }, [token]);
  useEffect(() => {
    void reloadStudents();
  }, [reloadStudents]);

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
      setBookingsShown(true);
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
    if (savingHours || invalidHours || bookingsLoading || bookingsError) return;
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
      setStatus(`Weekly hours saved. Students can now book these times.${stayBooked(affectedLessons.length)}`);
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

  /** Selected dates use the calendar's existing, one-at-a-time save path. */
  function takeTimeOff(dates: string[], off: boolean) {
    if (savingDays || !dates.length) return;
    const offAlready = daysOff(shownExceptions);
    for (const date of dates) {
      if (offAlready.has(date) !== off) changeDay(date, { dayOff: off }, "");
    }
    const booked = bookings.filter(booking => dates.some(date =>
      dateKey(new Date(booking.starts_at)) <= date && dateKey(new Date(Date.parse(booking.ends_at) - 1)) >= date)).length;
    setDayNote({
      error: false,
      text: off
        ? `${dates.length === 1 ? `${shortDate(dates[0])} is a day off` : `${dates.length} selected days are off`}.${stayBooked(booked)}`
        : `${dates.length === 1 ? `${shortDate(dates[0])} is` : `${dates.length} selected days are`} open again, following your weekly hours.`,
    });
  }

  /** The modal keeps its draft until this explicit save is confirmed. */
  async function saveTimeOffDay(date: string, change: { dayOff: boolean; blocks?: Span[] }) {
    if (sendingDays.current || bookingsLoading || bookingsError) throw new Error("Please wait until your calendar has finished loading or saving.");
    const account = accountGeneration.current;
    sendingDays.current = true;
    setSavingDays(true);
    try {
      const result = await saveDayOff(token, date, change);
      if (account !== accountGeneration.current) return;
      setExceptions(current => [...current.filter(row => row.date !== date), ...result.exceptions]);
      setDayNote({ error: false, text: `Time off updated for ${shortDate(date)}.${stayBooked(lessonsDuring(date))}` });
    } finally {
      if (account === accountGeneration.current) {
        sendingDays.current = false;
        setSavingDays(false);
      }
    }
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
      <div className="teacher-tools-header">
        <TeacherTabs current={activeTab} hoursDirty={hoursDirty} meetAttention={meetAttention} onSelect={setActiveTab} />
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

      <div className="teacher-tools-panel" id="teacher-tools-panel" role="tabpanel" aria-labelledby={`teacher-tab-${activeTab}`} tabIndex={0}>
      {activeTab === "week" || editing ? <>
      {activeTab === "week" && bookingsShown ? (
        <NextLesson bookings={bookings} now={now} onOpen={setSelectedBooking} />
      ) : null}

      <section className={`teacher-week${editing ? " teacher-week--editing" : ""}`} aria-labelledby="teacher-week-title">
        <div className="teacher-week-toolbar">
          <div className="teacher-week-title">
            <div className="teacher-week-heading">
              <h2 id="teacher-week-title" ref={calendarTitleRef} tabIndex={-1}>
                {editing
                  ? "Repeats every week"
                  : `${dateLabel(weekStart, { day: "numeric", month: "short" })} – ${dateLabel(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`}
              </h2>
            </div>
          </div>
          {editing ? (
            <ul className="teacher-help teacher-week-hint"><li>Tap or drag to set lesson start times.</li></ul>
          ) : null}
          {!editing ? (
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
          ) : null}
        </div>
        {editing && hoursDirty ? (
          <div className="teacher-hours-warning" aria-live="polite">
            {bookingsLoading ? <p>Checking booked lessons…</p> : bookingsError ? <div role="alert"><p>Booked lessons could not be checked.</p><button className="teacher-text-button" onClick={() => void reloadBookings()} type="button">Try again</button></div> : affectedLessons.length ? <>
              <p><strong>{affectedLessons.length === 1 ? "1 booked lesson falls" : `${affectedLessons.length} booked lessons fall`} in the hours you’re changing.</strong> {affectedLessons.length === 1 ? "It stays" : "They stay"} booked.</p>
              <ul>{affectedLessons.slice(0, 4).map(booking => <li key={booking.id}>{booking.student_name} · {shortDate(dateKey(new Date(booking.starts_at)))} · {formatSlotTime(booking.starts_at)}</li>)}</ul>
              {affectedLessons.length > 4 ? <p>And {affectedLessons.length - 4} more.</p> : null}
            </> : null}
          </div>
        ) : null}
        {!editing && bookingsLoading && !bookingsShown ? (
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
            onAddLesson={(date, minute) => setAddLesson({ date, minute })}
            onSelectBooking={setSelectedBooking}
          />
        )}
        {editing ? (
          <div className="teacher-hours-save">
            <p className="teacher-secondary-copy">
              Marked times are lesson <strong>starts</strong>, not finishing times.
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
                disabled={savingHours || !hoursDirty || Boolean(invalidHours) || bookingsLoading || Boolean(bookingsError)}
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
            No lessons booked this week.
          </p>
        ) : null}
      </section>
      </> : null}
      <div className="teacher-tab-view" hidden={activeTab !== "time-off"}>
        <TimeOffCalendar
          today={today}
          exceptions={shownExceptions}
          bookings={bookings}
          bookingsLoading={bookingsLoading}
          bookingsError={bookingsError}
          onReloadBookings={() => void reloadBookings()}
          busy={savingDays}
          status={<p className={`teacher-save-state ${dayNote?.error ? "is-error" : ""}`} role={dayNote?.error ? "alert" : "status"}>{savingDays ? "Saving…" : dayNote?.text}</p>}
          onChange={takeTimeOff}
          onSaveDay={saveTimeOffDay}
        />
      </div>
      <div className="teacher-tab-view" hidden={activeTab !== "students"}>
      <StudentList
        token={token}
        students={students?.list ?? null}
        cards={Boolean(students?.cardsAccepted)}
        error={studentsError}
        onAddLesson={(student) => setFormStudent((current) => ({ email: student.email, name: student.name, key: (current?.key ?? 0) + 1 }))}
      />
      </div>
      <div className="teacher-tab-view" hidden={activeTab !== "meet"}>
        <TeacherMeetConnection token={token} onAttentionChange={setMeetAttention} />
      </div>
      <div className="teacher-tab-view" hidden={activeTab !== "week" && activeTab !== "students"}>
        <ManualLessonForm
          token={token}
          known={students?.list ?? []}
          student={formStudent}
          onCreated={() => {
            void reloadStudents();
            void reloadBookings();
          }}
        />
      </div>
      </div>
      {addLesson ? (
        <AddLessonDialog
          key={`${addLesson.date}-${addLesson.minute}`}
          token={token}
          known={students?.list ?? []}
          date={addLesson.date}
          minute={addLesson.minute}
          afterAddFocusRef={calendarTitleRef}
          onClose={() => setAddLesson(null)}
          onCreated={(message) => {
            if (readSession() !== token) return;
            setAddLesson(null);
            setStatus(message);
            void reloadStudents();
            void reloadBookings();
          }}
        />
      ) : null}
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
