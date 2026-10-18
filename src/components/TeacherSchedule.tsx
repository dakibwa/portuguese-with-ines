"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2 } from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { WeeklyTimetable } from "@/components/teacher/WeeklyTimetable";
import { LessonDetails } from "@/components/teacher/LessonDetails";
import { TeacherMeetConnection } from "@/components/teacher/TeacherMeetConnection";
import { TeacherAccountProfile } from "@/components/teacher/TeacherAccountProfile";
import { StudentPicker, type StudentPickerStart } from "@/components/teacher/StudentPicker";
import { StudentList, type StudentOpenRequest } from "@/components/teacher/StudentList";
import { NextLesson } from "@/components/teacher/NextLesson";
import { NeedsYou } from "@/components/teacher/NeedsYou";
import { TeacherPager } from "@/components/teacher/TeacherPager";
import { TimeOffCalendar } from "@/components/teacher/TimeOffCalendar";
import { BookedLessonCard } from "@/components/teacher/BookedLessonCard";
import { TeacherTabs, type TeacherTab } from "@/components/teacher/TeacherTabs";
import { ReceiptsTab } from "@/components/teacher/ReceiptsTab";
import { ExpressionsTab } from "@/components/teacher/ExpressionsTab";
import {
  fetchBookings,
  fetchSchedule,
  fetchStudents,
  saveDayOff,
  saveRules,
  sendStudentWelcome,
  type AdminBooking,
  type AdminStudent,
  type AvailabilityException,
  type GoogleMeetConnection,
  type PaymentReview,
} from "@/lib/admin-api";
import { clearSession, fetchMe, readSession, subscribeToSession, type Student } from "@/lib/auth-api";
import { portoTimeToUtc } from "@/lib/booking-api";
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
  needsYou,
  studentWorkspace,
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

function profileRequested() {
  const params = new URL(window.location.href).searchParams;
  return params.has("emailToken") || params.get("tab") === "profile" || ["connected", "cancelled", "error"].includes(params.get("meet") ?? "");
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
  const [dayControlHost, setDayControlHost] = useState<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<TeacherTab>("week");
  const [editingHours, setEditingHours] = useState(false);
  const editing = activeTab === "week" && editingHours;
  // Her Google Meet connection, read in Profile and listed in Needs you when it needs her.
  const [meet, setMeet] = useState<GoogleMeetConnection | null>(null);
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
  // Lessons students cancelled: the timetable drops them, Needs you says so for three days.
  const [studentCancellations, setStudentCancellations] = useState<AdminBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(
    null,
  );
  // A new student or a free timetable slot starts with a chooser. Their
  // details, lessons and history then stay in the Students row.
  const [studentPicker, setStudentPicker] = useState<(StudentPickerStart & { key: number }) | null>(null);
  const [studentRequest, setStudentRequest] = useState<StudentOpenRequest | null>(null);
  const openStudentPicker = (start: StudentPickerStart) => setStudentPicker({ ...start, key: Date.now() });
  const openStudent = (student: AdminStudent, panel: StudentOpenRequest["panel"], slot?: { date: string; time: string }) => {
    setStudentRequest({ studentId: student.id, panel, ...slot, key: Date.now() });
    setActiveTab("students");
  };
  // Her students, read once with the page and again after each lesson she
  // adds: the form suggests them and Your students lists them.
  const [students, setStudents] = useState<{ list: AdminStudent[]; cardsAccepted: boolean } | null>(null);
  const [studentsError, setStudentsError] = useState("");
  // A student chosen from her list, put straight into the add-a-lesson form.
  const [paymentReview, setPaymentReview] = useState<PaymentReview[]>([]);
  // The student whose welcome she has just pressed, while it is sending.
  const [welcoming, setWelcoming] = useState("");
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
  const [accountBusy, setAccountBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const bookingRequest = useRef(0);
  const studentRequestGeneration = useRef(0);
  const calendarTitleRef = useRef<HTMLHeadingElement>(null);
  const accountGeneration = useRef(0);
  // Verified email changes renew this same account without discarding its drafts.
  const renewedSession = useRef("");
  const dayChangesRef = useRef(dayChanges);
  const dayVersion = useRef(0);
  const sendingDays = useRef(false);
  useEffect(() => () => {
    accountGeneration.current += 1;
    bookingRequest.current += 1;
    studentRequestGeneration.current += 1;
  }, []);
  const shownExceptions = useMemo(
    () => withDayChanges(exceptions, dayChanges),
    [exceptions, dayChanges],
  );
  const hoursDirty = serialiseHours(savedHours) !== serialiseHours(draftHours);
  const invalidHours = hoursProblem(draftHours);
  const affectedLessons = useMemo(() => bookingsAffectedByHours(bookings, savedHours, draftHours, interval, now), [bookings, savedHours, draftHours, interval, now]);
  const needs = useMemo(
    () => needsYou({ now, meet, payments: paymentReview, students: students?.list ?? [], lessons: bookings, cancellations: studentCancellations }),
    [now, meet, paymentReview, students, bookings, studentCancellations],
  );

  const studentWork = useMemo(
    () => studentWorkspace(students?.list ?? [], needs, Boolean(students?.cardsAccepted), [...bookings, ...studentCancellations]),
    [students, needs, bookings, studentCancellations],
  );

  const resetAccount = useCallback(() => {
    accountGeneration.current += 1;
    bookingRequest.current += 1;
    studentRequestGeneration.current += 1;
    setToken("");
    setMe(null);
    setInitialised(false);
    setActiveTab("week");
    setEditingHours(false);
    setMeet(null);
    setSelectedBooking(null);
    setStudentPicker(null);
    setStudentRequest(null);
    setStudents(null);
    setStudentsError("");
    setBookings([]);
    setStudentCancellations([]);
    setWelcoming("");
    setPaymentReview([]);
    setSavedHours(emptyWeek);
    setDraftHours(emptyWeek);
    setExceptions([]);
    dayChangesRef.current = new Map();
    setDayChanges(new Map());
    sendingDays.current = false;
    setSavingDays(false);
    setSavingHours(false);
    setAccountBusy(false);
    renewedSession.current = "";
    setDayNote(undefined);
    setAuthError("");
    setStatus("");
    setError("");
  }, []);

  useEffect(() => {
    let session = readSession();
    return subscribeToSession((event) => {
      const current = readSession();
      if (current === session) return;
      const previous = session;
      session = current;
      if (current && event instanceof CustomEvent && event.detail?.previousSession === previous && event.detail?.studentId === me?.id) {
        renewedSession.current = current;
        setToken(current);
        return;
      }
      resetAccount();
      setAuthAttempt(value => value + 1);
    });
  }, [resetAccount, me?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profileRequested()) setActiveTab("profile");
    else if (new URL(window.location.href).searchParams.get("tab") === "expressions") setActiveTab("expressions");
  }, []);

  // Her "Homework to review" email links to /schedule/?student=…&homework=…:
  // once she is signed in, open that student's lesson at its homework.
  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    const studentId = url.searchParams.get("student");
    const homeworkId = url.searchParams.get("homework");
    if (!studentId || !homeworkId) return;
    setStudentRequest({ studentId, panel: "history", homeworkId, homeworkRequestKey: 1, key: Date.now() });
    setActiveTab("students");
    url.searchParams.delete("student");
    url.searchParams.delete("homework");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [token]);

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
        if (data?.student.role === "teacher") {
          setToken(session);
          if (profileRequested()) setActiveTab("profile");
        }
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
    if (!token || renewedSession.current === token) return;
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
    const request = ++studentRequestGeneration.current;
    try {
      const data = await fetchStudents(token);
      if (readSession() !== token || request !== studentRequestGeneration.current) return;
      setStudents({ list: data.students, cardsAccepted: Boolean(data.cardsAccepted) });
      setStudentsError("");
    } catch (caught) {
      if (readSession() === token && request === studentRequestGeneration.current) setStudentsError(caught instanceof Error ? caught.message : "Your students couldn’t be loaded.");
    }
  }, [token]);
  useEffect(() => {
    void reloadStudents();
    const returned = () => { void reloadStudents(); };
    window.addEventListener("homework-returned", returned);
    return () => window.removeEventListener("homework-returned", returned);
  }, [reloadStudents]);

  // A quiet read is a background refresh: if it fails, the lessons already on
  // screen stay, rather than giving way to an error she did not ask for.
  const reloadBookings = useCallback(async (quiet = false) => {
    if (!token || readSession() !== token) return;
    const request = ++bookingRequest.current;
    if (!quiet) {
      setBookingsLoading(true);
      setBookingsError("");
    }
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
      setStudentCancellations(
        result.bookings.filter((booking) => booking.status === "cancelled" && booking.cancelled_by === "student"),
      );
      setBookingsShown(true);
      setBookingsError("");
      setPaymentReview(result.manualPaymentReconciliation ?? []);
    } catch (caught) {
      if (request === bookingRequest.current && !quiet)
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

  // Nothing polls, so a laptop left open all afternoon would never hear of a
  // change or cancellation. Coming back after five minutes or more reads again.
  const hiddenAt = useRef(0);
  useEffect(() => {
    const returned = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = 0;
      if (away < 5 * 60_000) return;
      setNow(new Date());
      void reloadBookings(true);
      void reloadStudents();
    };
    document.addEventListener("visibilitychange", returned);
    return () => document.removeEventListener("visibilitychange", returned);
  }, [reloadBookings, reloadStudents]);

  /** Initial welcomes are guarded; a requested reminder sends a fresh link. */
  async function sendWelcome(student: AdminStudent, again = false) {
    if (welcoming || !student.email || student.email.startsWith("no-email:")) return;
    const account = accountGeneration.current;
    setWelcoming(student.id);
    setError("");
    setStatus("");
    try {
      await sendStudentWelcome(token, student.id, again ? undefined : { onlyIfWaiting: true });
      if (account !== accountGeneration.current) return;
      setStatus(`${again ? "Link" : "Welcome"} sent to ${student.name.trim().split(/\s+/)[0]}.`);
    } catch (caught) {
      if (account !== accountGeneration.current) return;
      setError(caught instanceof Error ? caught.message : "The welcome couldn’t be sent.");
    } finally {
      if (account === accountGeneration.current) setWelcoming("");
    }
    // Either way the list reads afresh, so a welcome another device sent leaves too.
    void reloadStudents();
    if (activeTab === "week") calendarTitleRef.current?.focus({ preventScroll: true });
  }

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
    // The card above already shows any lessons on them as Already booked.
    setDayNote({
      error: false,
      text: off
        ? `${dates.length === 1 ? `${shortDate(dates[0])} is a day off` : `${dates.length} selected days are off`}.`
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
          if (student.role === "teacher") {
            setToken(readSession());
            if (profileRequested()) setActiveTab("profile");
          }
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
    if (savingDays || savingHours || accountBusy) return;
    if (hoursDirty && !window.confirm("Sign out and lose the weekly hours you haven’t saved?")) return;
    clearSession();
    resetAccount();
  }

  return (
    <div className="teacher-workspace">
      <div className="teacher-tools-header">
        <TeacherTabs current={activeTab} hoursDirty={hoursDirty} needsCount={studentWork.attentionCount} onSelect={setActiveTab} />
        {/* Only for a teacher Inês has also added as a student (17 October 2026, Dan). */}
        {me?.alsoStudent ? (
          <a className="button button--outline button--compact teacher-my-lessons" href={`${SITE_BASE_PATH}/book/?view=lessons`}>My lessons</a>
        ) : null}
      </div>
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
      {activeTab === "week" ? <>
      {!editing && bookingsShown ? (
        <NextLesson bookings={bookings} now={now} onOpen={setSelectedBooking} />
      ) : null}
      {!editing && bookingsShown ? (
        <NeedsYou
          items={needs.filter(item => !["email", "lessons", "welcome"].includes(item.kind))}
          sending={welcoming}
          onMeet={() => {
            document.getElementById("teacher-tab-profile")?.focus({ preventScroll: true });
            setActiveTab("profile");
          }}
          onView={setSelectedBooking}
          onWelcome={(student) => void sendWelcome(student)}
          onStudent={(student, editDetails) => openStudent(student, editDetails ? "details" : "lessons")}
          onSeeAll={() => { setActiveTab("students"); document.getElementById("teacher-tab-students")?.focus({ preventScroll: true }); }}
        />
      ) : null}

      <section className={`teacher-week${editing ? " teacher-week--editing" : ""}`} aria-labelledby="teacher-week-title">
        <div className="teacher-week-toolbar">
          <div className="teacher-week-title">
            <div className="teacher-week-heading">
              <h2 id="teacher-week-title" ref={calendarTitleRef} tabIndex={-1}>
                {editing
                  ? "Your weekly hours"
                  : dateLabel(weekStart, { month: "long", year: "numeric" })}
              </h2>
            </div>
          </div>
          {editing ? (
            <ul className="booking-payment-facts teacher-week-hint">
              <li>Tap or drag to mark when a lesson can <strong>start</strong></li>
              <li>Repeats every week</li>
            </ul>
          ) : null}
          <button
            className={`button ${editing ? "button--blue" : "button--lilac"} button--compact teacher-week-mode`}
            type="button"
            onClick={() => setEditingHours(value => !value)}
          >
            {editing ? "View lessons" : "Edit weekly hours"}
            {!editing && hoursDirty ? <span className="teacher-tab-dot" aria-label="unsaved changes" /> : null}
          </button>
          {!editing ? <div className="teacher-week-day-control" ref={setDayControlHost} /> : null}
          {!editing ? (
            <TeacherPager
              unit="week"
              away={weekStart !== mondayOf(today)}
              headingRef={calendarTitleRef}
              onCurrent={() => setWeekStart(mondayOf(today))}
              onNext={() => setWeekStart(shiftDate(weekStart, 7))}
              onPrevious={() => setWeekStart(shiftDate(weekStart, -7))}
            />
          ) : null}
        </div>
        {editing && hoursDirty ? (
          <div className="teacher-hours-warning" aria-live="polite">
            {bookingsLoading ? <p>Checking booked lessons…</p> : bookingsError ? <div role="alert"><p>Booked lessons could not be checked.</p><button className="teacher-text-button" onClick={() => void reloadBookings()} type="button">Try again</button></div> : affectedLessons.length ? <>
              <p className="teacher-hours-warning__lead">
                <AlertCircle size={16} aria-hidden="true" />
                {affectedLessons.length === 1 ? "This lesson is" : `These ${affectedLessons.length} lessons are`} outside your new hours. {affectedLessons.length === 1 ? "It stays" : "They stay"} booked.
              </p>
              <ul className="teacher-lesson-cards" aria-label="Lessons that clash with your hours">
                {affectedLessons.slice(0, 4).map(booking => <BookedLessonCard key={booking.id} booking={booking} disabled={savingHours} onOpen={setSelectedBooking} />)}
              </ul>
              {affectedLessons.length > 4 ? (
                <details className="teacher-hours-clashes-more">
                  <summary>{affectedLessons.length - 4} more {affectedLessons.length === 5 ? "lesson" : "lessons"}</summary>
                  <ul className="teacher-lesson-cards" aria-label="More lessons that clash with your hours">
                    {affectedLessons.slice(4).map(booking => <BookedLessonCard key={booking.id} booking={booking} disabled={savingHours} onOpen={setSelectedBooking} />)}
                  </ul>
                </details>
              ) : null}
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
            dayControlHost={dayControlHost}
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
            onAddLesson={(date, minute) => openStudentPicker({ step: "pick", date, minute })}
            onSelectBooking={setSelectedBooking}
          />
        )}
        {editing ? (
          <div className="teacher-hours-save">
            <div className="teacher-save-row">
              {/* Said to a screen reader; the coral Save already shows it. */}
              <span className="teacher-save-note visually-hidden" aria-live="polite">
                {hoursDirty ? "Not saved yet" : ""}
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
          status={
            <p className={`teacher-save-state ${dayNote?.error ? "is-error" : ""}`} role={dayNote?.error ? "alert" : "status"}>
              {savingDays ? "Saving…" : dayNote ? <>{dayNote.error ? null : <Check size={15} aria-hidden="true" />}{dayNote.text}</> : null}
            </p>
          }
          onChange={takeTimeOff}
          onSaveDay={saveTimeOffDay}
          onOpenBooking={setSelectedBooking}
        />
      </div>
      <div className="teacher-tab-view" hidden={activeTab !== "students"}>
      <StudentList
        token={token}
        students={students?.list ?? null}
        workspace={studentWork}
        error={studentsError || bookingsError}
        sending={welcoming}
        onMeet={() => { setActiveTab("profile"); document.getElementById("teacher-tab-profile")?.focus({ preventScroll: true }); }}
        onView={setSelectedBooking}
        onRetry={() => { void reloadStudents(); void reloadBookings(); }}
        onWelcome={(student, again) => void sendWelcome(student, again)}
        request={studentRequest}
        onAddStudent={() => openStudentPicker({ step: "new" })}
        onStudentsChanged={student => {
          if (readSession() !== token) return;
          if (student) setStudents(current => current ? { ...current, list: current.list.map(entry => entry.id === student.id ? student : entry) } : current);
          void reloadStudents();
          void reloadBookings(true);
        }}
      />
      </div>
      <div className="teacher-tab-view" hidden={activeTab !== "receipts"}>
        {activeTab === "receipts" ? <ReceiptsTab token={token} today={today} /> : null}
      </div>
      <div className="teacher-tab-view" hidden={activeTab !== "profile"}>
        <div className="teacher-account-layout">
          {me ? <TeacherAccountProfile token={token} student={me} disabled={savingDays || savingHours} onBusyChange={setAccountBusy} onStudentChange={setMe} onSignOut={signOut} /> : null}
          <TeacherMeetConnection token={token} onConnectionChange={setMeet} />
        </div>
      </div>
      <div className="teacher-tab-view" hidden={activeTab !== "expressions"}>
        {activeTab === "expressions" ? <ExpressionsTab accountId={me?.id ?? "teacher"} token={token} /> : null}
      </div>
      </div>
      {studentPicker ? <StudentPicker
        key={studentPicker.key}
        token={token}
        known={students?.list ?? []}
        start={studentPicker}
        onSelect={(student, slot, next) => {
          if (readSession() !== token) return;
          setStudents(current => current ? { ...current, list: [...current.list.filter(entry => entry.id !== student.id), student] } : { list: [student], cardsAccepted: false });
          setStudentPicker(null);
          // With no lessons yet she goes to their welcome, which needs an email first.
          openStudent(student, next === "welcome" ? student.email ? "welcome" : "email" : "lessons", slot);
          void reloadStudents();
        }}
        onClose={() => setStudentPicker(null)}
      /> : null}
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
