"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CircleX } from "lucide-react";
import { AccountAvatar, AccountMenu, AccountSignature, type AccountSection } from "@/components/AccountMenu";
import { AuthPanel } from "@/components/AuthPanel";
import { LessonMark } from "@/components/LessonMarks";
import {
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
  clockDiffersFromPorto,
  fetchRecurringRates,
  formatBookedLessonLabel,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  formatTimeIn,
  redeemRecurringRate
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE } from "@/lib/config";
import { STUDENT_MARKS } from "@/lib/student-marks";

/** The two lengths a code from Inês can set a weekly price for. */
const RATE_LENGTHS = [60, 90] as const;

function accountDetails(student?: Student | null) {
  return { name: student?.name ?? "", email: student?.email ?? "", nif: student?.nif ?? "" };
}

function historyTime(booking: MyBooking) {
  return Date.parse(booking.status === "cancelled" && booking.cancelledAt ? booking.cancelledAt : booking.endAt);
}

function HistoryLessonCard({ booking, named, zone }: { booking: MyBooking; named: boolean; zone: string }) {
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
          {/* Online at the student's own time, in Porto at Porto's, naming the
              clock for a student whose own differs from Porto's. */}
          <strong>
            {formatLongDate(booking.startAt, booking.location === "porto" ? BOOKING_TIME_ZONE : zone)},{" "}
            {(named ? formatTimeIn : formatSlotTime)(booking.startAt, booking.location === "porto" ? BOOKING_TIME_ZONE : zone)}
          </strong>
          <span>
            {formatBookedLessonLabel(booking.lessonType)} · {booking.location === "porto" ? "In Porto" : "Online"}
          </span>
          <small className="history-lesson-card__reference">Reference {booking.reference}</small>
        </span>
      </div>
    </article>
  );
}

/**
 * The account's own cards, Past lessons and Your details, each headed like the
 * Your lessons calendar card with the name's menu beneath its heading. Which
 * one shows is the booking page's choice (`section`); on Your lessons itself
 * this draws nothing but a failure to read the account, if there is one.
 */
export function MyLessons({
  initialAccount = null,
  onRatesChange,
  onSelectSection,
  onSignOut,
  openUpcomingRequest = 0,
  section = "upcoming"
}: {
  /** The account the booking page has just loaded, so arriving doesn't ask for it twice. */
  initialAccount?: { student: Student; bookings: MyBooking[]; series?: LessonSeries[] } | null;
  /** The account's saved weekly rates, as last read or changed here, so booking prices with them. */
  onRatesChange?: (rates: Record<number, number>) => void;
  onSelectSection?: (section: AccountSection) => void;
  onSignOut?: () => void;
  openUpcomingRequest?: number;
  section?: AccountSection;
}) {
  const [student, setStudent] = useState<Student | null>(initialAccount?.student ?? null);
  const [bookings, setBookings] = useState<MyBooking[]>(initialAccount?.bookings ?? []);
  const [series, setSeries] = useState<LessonSeries[]>(initialAccount?.series ?? []);
  const editing = section === "profile";
  const [details, setDetails] = useState(() => accountDetails(initialAccount?.student));
  const [savingName, setSavingName] = useState(false);
  const [savingNif, setSavingNif] = useState(false);
  // Your details shows each value with its own Change; one opens at a time.
  const [openField, setOpenField] = useState<"name" | "email" | "nif" | "mark" | null>(null);
  const [savingMark, setSavingMark] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [detailsNote, setDetailsNote] = useState("");
  // The weekly rates saved on the account, read each time the details open.
  // `null` until they arrive, so a slow answer never reads as "none saved".
  const [rates, setRates] = useState<Record<number, number> | null>(null);
  const [ratesFailed, setRatesFailed] = useState(false);
  const [rateCode, setRateCode] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [loading, setLoading] = useState(!initialAccount);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [zone, setZone] = useState(BOOKING_TIME_ZONE);
  const clockNamed = useMemo(() => clockDiffersFromPorto(zone), [zone]);
  const rateCodeRef = useRef<HTMLInputElement>(null);
  const onRatesChangeRef = useRef(onRatesChange);
  const ratesVersion = useRef(0);
  const profileVersion = useRef(0);
  const accountRequest = useRef(0);
  const emailDraftVersion = useRef(0);
  const emailConfirmation = useRef<ReturnType<typeof confirmEmailChange> | null>(null);
  const confirmationDraftVersion = useRef(0);
  const receivedAccount = useRef(initialAccount);
  useEffect(() => () => { accountRequest.current += 1; }, []);
  useEffect(() => { onRatesChangeRef.current = onRatesChange; }, [onRatesChange]);

  // Booking also reloads the account after changes and meeting-link polling.
  // Keep lesson counts/history in step with that verified snapshot, without
  // replacing profile drafts or values saved independently in this editor.
  useEffect(() => {
    if (!initialAccount || initialAccount === receivedAccount.current || initialAccount.student.id !== student?.id) return;
    receivedAccount.current = initialAccount;
    accountRequest.current += 1;
    setBookings(initialAccount.bookings);
    setSeries(initialAccount.series ?? []);
    setLoading(false);
    setLoadError("");
  }, [initialAccount, student?.id]);

  // A reload that lands while the details form is open must not replace what
  // the student is typing with the values it had before.
  const editingRef = useRef(false);
  const detailsRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    editingRef.current = editing;
    // Leaving Your details closes whatever was open in it.
    if (!editing) setOpenField(null);
  }, [editing]);

  // Focus a field as it opens, before a student can select anything else: a
  // queued frame could otherwise steal their focus or subsequent typing.
  useLayoutEffect(() => {
    if (openField && openField !== "mark") {
      detailsRef.current?.querySelector<HTMLInputElement>(`[data-field="${openField}"] input`)?.focus({ preventScroll: true });
    }
  }, [openField]);

  // Read when the details open, so a rate Inês set by hand shows without a
  // reload, and tell booking what came back: it prices weekly lessons from it.
  useEffect(() => {
    if (!editing) return;
    let active = true;
    const version = ratesVersion.current;
    setRatesFailed(false);
    fetchRecurringRates(readSession())
      .then((data) => {
        if (!active || version !== ratesVersion.current) return;
        setRates(data.rates);
        onRatesChangeRef.current?.(data.rates);
      })
      .catch(() => {
        if (active && version === ratesVersion.current) setRatesFailed(true);
      });
    return () => {
      active = false;
    };
  }, [editing]);

  const detailsLoaded = useRef(Boolean(initialAccount));
  const load = useCallback(async () => {
    const request = ++accountRequest.current;
    const version = profileVersion.current;
    const session = readSession();
    if (!session) {
      setStudent(null);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchMe(session);
      if (request !== accountRequest.current || readSession() !== session) return;
      if (!data) {
        setStudent(null);
        return;
      }
      setLoadError("");
      if (version === profileVersion.current) {
        setStudent(data.student);
        if (!editingRef.current || !detailsLoaded.current) {
          setDetails(accountDetails(data.student));
          detailsLoaded.current = true;
        }
      }
      setBookings(data.bookings);
      setSeries(data.series ?? []);
    } catch (caught) {
      if (request !== accountRequest.current || readSession() !== session) return;
      setLoadError(caught instanceof Error ? caught.message : "We couldn’t load your lessons.");
    } finally {
      if (request === accountRequest.current && readSession() === session) setLoading(false);
    }
  }, []);

  // Arriving with the account the page has just loaded needs no second
  // request; every later reload still asks.
  const arrivedWithAccount = useRef(Boolean(initialAccount));
  useEffect(() => {
    setZone(browserTimeZone());
    if (!arrivedWithAccount.current) load();
  }, [load]);

  // Coming back to the lessons view (after a booking, a move or a
  // cancellation) refreshes the history and the count beside Your lessons.
  // Only a later request reloads: arriving already loads once, above.
  const seenUpcomingRequest = useRef(openUpcomingRequest);
  useEffect(() => {
    if (!openUpcomingRequest || openUpcomingRequest === seenUpcomingRequest.current) return;
    seenUpcomingRequest.current = openUpcomingRequest;
    void load();
  }, [load, openUpcomingRequest]);

  /*
   * The link mailed to the new address lands back here. It is applied only for
   * a signed-in student, so possession of the link alone is not enough — the
   * person confirming has to be the person who asked.
   */
  useEffect(() => {
    if (!emailConfirmation.current) {
      const url = new URL(window.location.href);
      const changeToken = url.searchParams.get("emailToken");
      const session = readSession();
      if (!changeToken || !session) return;

      // Consume the address-bar token before waiting. A late reply cannot
      // rewrite another page, and renewing the session cannot spend it twice.
      url.searchParams.delete("emailToken");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      confirmationDraftVersion.current = emailDraftVersion.current;
      emailConfirmation.current = confirmEmailChange(session, changeToken);
    }
    let active = true;
    emailConfirmation.current
      .then((result) => {
        if (!active) return;
        profileVersion.current += 1;
        setStudent((current) => current ? { ...current, email: result.student.email } : result.student);
        if (emailDraftVersion.current === confirmationDraftVersion.current) {
          setDetails((current) => ({ ...current, email: result.student.email }));
        }
        setDetailsNote("That’s your email address updated.");
        setEmailPending("");
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "That link couldn’t be used.");
      });
    return () => { active = false; };
  }, []);

  async function saveName() {
    const session = readSession();
    setSavingName(true);
    setError("");
    setDetailsNote("");
    try {
      const result = await updateProfile(session, { name: details.name.trim() });
      if (readSession() !== session) return;
      profileVersion.current += 1;
      // Other fields may have been saved since this response was prepared.
      setStudent((current) => current && { ...current, name: result.student.name });
      setOpenField((field) => field === "name" ? null : field);
      setDetailsNote("Saved.");
    } catch (caught) {
      if (readSession() !== session) return;
      setError(caught instanceof Error ? caught.message : "That couldn’t be saved.");
    } finally {
      setSavingName(false);
    }
  }

  async function saveNif() {
    const session = readSession();
    const submittedNif = details.nif;
    setSavingNif(true);
    setError("");
    setDetailsNote("");
    try {
      // Only the NIF is sent; the endpoint keeps every field it is not sent.
      const result = await updateProfile(session, { nif: submittedNif.trim() });
      if (readSession() !== session) return;
      profileVersion.current += 1;
      const savedNif = result.student.nif ?? "";
      setStudent((current) => current && { ...current, nif: savedNif });
      setDetails((current) => current.nif === submittedNif ? { ...current, nif: savedNif } : current);
      setOpenField((field) => field === "nif" ? null : field);
      setDetailsNote(result.student.nif ? "Saved. Your receipts will show this NIF." : "Saved. Your receipts won’t show a NIF.");
    } catch (caught) {
      if (readSession() !== session) return;
      setError(caught instanceof Error ? caught.message : "That couldn’t be saved.");
    } finally {
      setSavingNif(false);
    }
  }

  async function saveMark(mark: string) {
    if (savingMark !== null) return;
    const session = readSession();
    setSavingMark(mark);
    setError("");
    setDetailsNote("");
    try {
      const result = await updateProfile(session, { mark });
      if (readSession() !== session) return;
      profileVersion.current += 1;
      setStudent((current) => current && { ...current, mark: result.student.mark ?? "" });
      setOpenField((field) => field === "mark" ? null : field);
    } catch (caught) {
      if (readSession() !== session) return;
      setError(caught instanceof Error ? caught.message : "That couldn’t be saved.");
    } finally {
      setSavingMark(null);
    }
  }

  async function addRateCode() {
    if (savingRate || !rateCode.trim()) return;
    const session = readSession();
    const submittedCode = rateCode;
    setSavingRate(true);
    setError("");
    setDetailsNote("");
    try {
      // No length is sent: the code says which one it is for. Each length keeps
      // its own rate, so a 60 and a 90 minute code sit side by side.
      const result = await redeemRecurringRate(session, submittedCode.trim());
      if (readSession() !== session) return;
      ratesVersion.current += 1;
      setRates(result.rates);
      setRatesFailed(false);
      onRatesChangeRef.current?.(result.rates);
      setRateCode((current) => current === submittedCode ? "" : current);
      setDetailsNote(
        result.saved
          ? `Saved. Your ${result.saved.durationMinutes}-minute weekly lessons are now ${formatMoneyCents(result.saved.cents)} each.`
          : "Saved."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code couldn’t be saved.");
    } finally {
      setSavingRate(false);
      // The button is disabled once the field is empty, so focus goes back to
      // the field, ready for the other length's code.
      rateCodeRef.current?.focus();
    }
  }

  async function changeEmail() {
    // Each request sends two emails, so a double-click must not send four.
    if (emailBusy) return;
    const session = readSession();
    setEmailBusy(true);
    setError("");
    setDetailsNote("");
    try {
      const result = await requestEmailChange(session, details.email.trim());
      if (readSession() !== session) return;
      setEmailPending(result.pending);
      setOpenField((field) => field === "email" ? null : field);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That couldn’t be sent.");
    } finally {
      setEmailBusy(false);
    }
  }

  // A repeating schedule counts once, however many of its dates are booked.
  const activeSeriesIds = new Set(series.map((entry) => entry.id));
  const upcomingCount = new Set(
    bookings
      .filter((booking) => !booking.isPast && booking.status === "confirmed")
      .map((booking) =>
        booking.seriesId && activeSeriesIds.has(booking.seriesId) ? `series:${booking.seriesId}` : `booking:${booking.reference}`
      )
  ).size;
  const past = bookings
    .filter((booking) => booking.status === "cancelled" || (booking.status === "confirmed" && booking.isPast))
    .sort((a, b) => historyTime(b) - historyTime(a) || b.startAt.localeCompare(a.startAt));

  if (loading) return section === "upcoming" ? null : <p className="booking-state-note">Loading your lessons…</p>;

  /*
   * An unreachable API leaves `student` null, which used to fall straight
   * through to the sign-in panel — telling someone who is signed in that they
   * are not, and burying the real message. The session is still in hand, so
   * say what actually happened and offer the way back.
   */
  if (!student && (loadError || error) && readSession()) {
    return (
      <div className="my-lessons">
        <div className="booking-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{loadError || error}</p>
        </div>
        <p className="booking-state-note">
          <button
            className="text-action"
            onClick={() => {
              setError("");
              setLoadError("");
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
        onSignedIn={(signedIn) => {
          setStudent(signedIn);
          setLoading(true);
          load();
        }}
      />
    );
  }

  // Opening a detail starts from what is saved, so a draft abandoned with
  // Cancel never comes back.
  const openDetail = (field: "name" | "email" | "nif" | "mark") => {
    setError("");
    setDetailsNote("");
    if (field === "name") setDetails((current) => ({ ...current, name: student.name }));
    if (field === "email") {
      emailDraftVersion.current += 1;
      setDetails((current) => ({ ...current, email: student.email }));
    }
    if (field === "nif") setDetails((current) => ({ ...current, nif: student.nif ?? "" }));
    setOpenField(field);
  };

  const menu = (current: AccountSection) => (
    <AccountMenu
      current={current}
      mark={student.mark}
      name={student.name}
      onSelect={(next) => onSelectSection?.(next)}
      onSignOut={() => onSignOut?.()}
      upcomingCount={upcomingCount}
    />
  );
  const heading = (id: string, title: string, current: AccountSection, aside?: React.ReactNode) => (
    <div className="account-card__head">
      <div className="account-card__title">
        <h2 className="eyebrow" id={id}>{title}</h2>
        {menu(current)}
      </div>
      {aside}
    </div>
  );
  const alert = error || loadError ? (
    <div className="booking-alert booking-alert--account" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <p>{error || loadError}</p>
    </div>
  ) : null;

  if (section === "history") {
    return (
      <section className="account-card my-lessons__history" id="account-past-lessons" aria-labelledby="past-lessons-heading" tabIndex={-1}>
        <AccountSignature mark={student.mark} />
        {heading("past-lessons-heading", "Past lessons", "history")}
        {alert}
        {past.length ? (
          <div className="my-lessons__history-bookings">
            {past.map((booking) => <HistoryLessonCard booking={booking} key={booking.reference} named={clockNamed} zone={zone} />)}
          </div>
        ) : (
          <p className="booking-state-note">No past lessons yet.</p>
        )}
      </section>
    );
  }

  if (section === "profile") {
    return (
      <section className="account-card my-lessons__details" aria-labelledby="account-details-heading" ref={detailsRef}>
        {heading(
          "account-details-heading",
          "Your details",
          "profile",
          // Signing out ends the visit, so it waits at the top right, small,
          // where Book stands on Your lessons (10 October 2026, at Dan's request).
          <button className="my-lessons__sign-out" onClick={() => onSignOut?.()} type="button">
            Sign out
          </button>
        )}
        {/* Each detail reads as itself with its own Change, or Add where it
            is empty; changing one opens it in place (10 October 2026, at
            Dan's request). */}
        <div className="my-lessons__facts">
          {student.mark !== undefined ? (
            <div className="my-lessons__fact" data-field="mark">
              <span className="my-lessons__fact-label">Your splat</span>
              {openField === "mark" ? (
                <div aria-label="Choose your splat" className="my-lessons__marks" role="group">
                  {[{ id: "", label: "Your initial" }, ...STUDENT_MARKS].map((choice) => (
                    <button
                      aria-label={choice.label}
                      aria-pressed={(student.mark ?? "") === choice.id}
                      className="my-lessons__mark"
                      disabled={savingMark !== null}
                      key={choice.id || "initial"}
                      onClick={() => void saveMark(choice.id)}
                      type="button"
                    >
                      <AccountAvatar mark={choice.id} name={student.name} />
                    </button>
                  ))}
                </div>
              ) : (
                <span className="my-lessons__fact-value">
                  <AccountAvatar className="my-lessons__avatar" mark={student.mark} name={student.name} />
                </span>
              )}
              {openField === "mark" ? (
                <button className="my-lessons__change" onClick={() => setOpenField(null)} type="button">Cancel</button>
              ) : (
                <button className="my-lessons__change" onClick={() => openDetail("mark")} type="button">
                  Change<span className="visually-hidden"> splat</span>
                </button>
              )}
            </div>
          ) : null}

          <div className="my-lessons__fact" data-field="name">
            {openField === "name" ? (
              <form
                className="my-lessons__edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!savingName && details.name.trim() && details.name.trim() !== student.name) void saveName();
                }}
              >
                <label>
                  <span>Your name</span>
                  <input
                    autoComplete="name"
                    onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))}
                    value={details.name}
                  />
                </label>
                <div className="my-lessons__edit-actions">
                  <button
                    className="button button--coral"
                    disabled={savingName || !details.name.trim() || details.name.trim() === student.name}
                    type="submit"
                  >
                    {savingName ? "Saving…" : "Save name"}
                  </button>
                  <button className="my-lessons__change" onClick={() => setOpenField(null)} type="button">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <span className="my-lessons__fact-label">Your name</span>
                <span className="my-lessons__fact-value">{student.name}</span>
                <button className="my-lessons__change" onClick={() => openDetail("name")} type="button">
                  Change<span className="visually-hidden"> name</span>
                </button>
              </>
            )}
          </div>

          <div className="my-lessons__fact" data-field="email">
            {openField === "email" ? (
              <form
                className="my-lessons__edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!emailBusy && details.email.trim() && details.email.trim() !== student.email) void changeEmail();
                }}
              >
                <label>
                  <span>Email</span>
                  <input
                    autoComplete="email"
                    onChange={(event) => {
                      emailDraftVersion.current += 1;
                      setDetails((current) => ({ ...current, email: event.target.value }));
                    }}
                    type="email"
                    value={details.email}
                  />
                </label>
                {/* Changing the address you sign in with is deliberately the slower
                    of the two: nothing moves until the new address answers. */}
                <div className="my-lessons__edit-actions">
                  <button
                    className="button button--blue"
                    disabled={emailBusy || !details.email.trim() || details.email.trim() === student.email}
                    type="submit"
                  >
                    Send confirmation link
                  </button>
                  <button className="my-lessons__change" onClick={() => setOpenField(null)} type="button">Cancel</button>
                </div>
                <p className="my-lessons__details-note">It changes once you open the link we send to the new address.</p>
              </form>
            ) : (
              <>
                <span className="my-lessons__fact-label">Email</span>
                <span className="my-lessons__fact-value">
                  {student.email}
                  {emailPending ? (
                    <small className="my-lessons__details-note">
                      Waiting for you to confirm <strong>{emailPending}</strong> from the link we sent.
                    </small>
                  ) : null}
                </span>
                <button className="my-lessons__change" onClick={() => openDetail("email")} type="button">
                  Change<span className="visually-hidden"> email</span>
                </button>
              </>
            )}
          </div>

          <div className="my-lessons__fact" data-field="nif">
            {openField === "nif" ? (
              <form
                className="my-lessons__edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!savingNif && details.nif.trim() !== (student.nif ?? "")) void saveNif();
                }}
              >
                <label>
                  <span>
                    NIF <em>(optional, for your receipts)</em>
                  </span>
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={20}
                    onChange={(event) => setDetails((current) => ({ ...current, nif: event.target.value }))}
                    value={details.nif}
                  />
                </label>
                <div className="my-lessons__edit-actions">
                  <button
                    className="button button--coral"
                    disabled={savingNif || details.nif.trim() === (student.nif ?? "")}
                    type="submit"
                  >
                    {savingNif ? "Saving…" : "Save NIF"}
                  </button>
                  <button className="my-lessons__change" onClick={() => setOpenField(null)} type="button">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <span className="my-lessons__fact-label">NIF</span>
                <span className={`my-lessons__fact-value${student.nif ? "" : " my-lessons__fact-value--empty"}`}>
                  {student.nif || "Not added"}
                </span>
                <button className="my-lessons__change" onClick={() => openDetail("nif")} type="button">
                  {student.nif ? <>Change<span className="visually-hidden"> NIF</span></> : "Add NIF"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Only some students have a code, so nothing here suggests they should:
            saved rates appear once there is one, and the field stays behind a
            small disclosure, as it does when booking. */}
        <div className="my-lessons__rates">
          {rates && RATE_LENGTHS.some((minutes) => rates[minutes] !== undefined) ? (
            <ul aria-label="Your saved weekly rates" className="my-lessons__rates-list">
              {RATE_LENGTHS.filter((minutes) => rates[minutes] !== undefined).map((minutes) => (
                <li key={minutes}>
                  <span>{minutes}-minute weekly lessons</span>
                  <strong>{formatMoneyCents(rates[minutes])} each</strong>
                </li>
              ))}
            </ul>
          ) : null}
          {ratesFailed ? (
            <p className="my-lessons__details-note">We couldn&rsquo;t check your saved weekly rates just now.</p>
          ) : null}
          <details className="my-lessons__code">
            <summary>Have a code from Inês?</summary>
            <form
              className="my-lessons__details-row"
              onSubmit={(event) => {
                event.preventDefault();
                void addRateCode();
              }}
            >
              <label>
                <span>Your code</span>
                <input
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  maxLength={40}
                  onChange={(event) => setRateCode(event.target.value)}
                  ref={rateCodeRef}
                  spellCheck={false}
                  value={rateCode}
                />
              </label>
              <button className="button button--blue" disabled={savingRate || !rateCode.trim()} type="submit">
                {savingRate ? "Adding\u2026" : "Add code"}
              </button>
            </form>
            <p className="my-lessons__details-note">
              Your code sets the rate for future weekly lessons of the matching length.
            </p>
          </details>
        </div>

        {detailsNote ? (
          <div className="booking-outcome my-lessons__details-outcome" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            <p>{detailsNote}</p>
          </div>
        ) : null}
        {alert}
      </section>
    );
  }

  // On Your lessons the calendar card carries the account; only a failure to
  // read it needs saying here.
  return alert;
}
