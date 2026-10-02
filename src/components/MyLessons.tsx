"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, CircleX, Menu as MenuIcon } from "lucide-react";
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
  fetchRecurringRates,
  formatBookedLessonLabel,
  formatLongDate,
  formatMoneyCents,
  formatSlotTimeForStudent,
  redeemRecurringRate
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE } from "@/lib/config";

/** The two lengths a code from Inês can set a weekly price for. */
const RATE_LENGTHS = [60, 90] as const;

function accountDetails(student?: Student | null) {
  return { name: student?.name ?? "", email: student?.email ?? "", nif: student?.nif ?? "" };
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

/**
 * The account bar above the booking workspace: who is signed in, and the
 * account's own views. Upcoming lessons live on the calendar beneath it, which
 * opens each lesson directly; this component owns Past lessons and the
 * profile fields.
 */
export function MyLessons({
  bookingActive = false,
  initialAccount = null,
  onOpenAccountSection,
  onRatesChange,
  onSignedOut,
  onTransition,
  openUpcomingRequest = 0
}: {
  bookingActive?: boolean;
  /** The account the booking page has just loaded, so arriving doesn't ask for it twice. */
  initialAccount?: { student: Student; bookings: MyBooking[]; series?: LessonSeries[] } | null;
  onOpenAccountSection?: (section: "history" | "upcoming" | "profile") => void;
  /** The account's saved weekly rates, as last read or changed here, so booking prices with them. */
  onRatesChange?: (rates: Record<number, number>) => void;
  onSignedOut?: () => void;
  onTransition?: (update: () => void) => void;
  openUpcomingRequest?: number;
} = {}) {
  const [student, setStudent] = useState<Student | null>(initialAccount?.student ?? null);
  const [bookings, setBookings] = useState<MyBooking[]>(initialAccount?.bookings ?? []);
  const [series, setSeries] = useState<LessonSeries[]>(initialAccount?.series ?? []);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountSection, setAccountSection] = useState<"history" | "upcoming" | "">("");
  const [details, setDetails] = useState(() => accountDetails(initialAccount?.student));
  const [savingName, setSavingName] = useState(false);
  const [savingNif, setSavingNif] = useState(false);
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
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!bookingActive) return;
    setMenuOpen(false);
    setEditing(false);
    setAccountSection("");
  }, [bookingActive]);

  useEffect(() => {
    if (!openUpcomingRequest) return;
    setMenuOpen(false);
    setEditing(false);
    setAccountSection("upcoming");
  }, [openUpcomingRequest]);

  const applyTransition = useCallback(
    (update: () => void) => {
      if (onTransition) onTransition(update);
      else update();
    },
    [onTransition]
  );

  // A reload that lands while the details form is open must not replace what
  // the student is typing with the values it had before.
  const editingRef = useRef(false);
  useEffect(() => { editingRef.current = editing; }, [editing]);

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
      setLoadError(caught instanceof Error ? caught.message : "Could not load your lessons.");
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
  // cancellation) refreshes the history and the count beside View lessons.
  // Only a later request reloads: arriving already loads once, above.
  const seenUpcomingRequest = useRef(openUpcomingRequest);
  useEffect(() => {
    if (!openUpcomingRequest || openUpcomingRequest === seenUpcomingRequest.current) return;
    seenUpcomingRequest.current = openUpcomingRequest;
    void load();
  }, [load, openUpcomingRequest]);

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
        setDetailsNote("That's your email address updated.");
        setEmailPending("");
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "That link could not be used.");
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
      setDetailsNote("Saved.");
    } catch (caught) {
      if (readSession() !== session) return;
      setError(caught instanceof Error ? caught.message : "That could not be saved.");
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
      setDetailsNote(result.student.nif ? "Saved. Your receipts will show this NIF." : "Saved. Your receipts won't show a NIF.");
    } catch (caught) {
      if (readSession() !== session) return;
      setError(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setSavingNif(false);
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
      setError(caught instanceof Error ? caught.message : "That code could not be saved.");
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be sent.");
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

  function openAccountSection(section: "history" | "upcoming") {
    applyTransition(() => {
      setMenuOpen(false);
      setEditing(false);
      setAccountSection(section);
      onOpenAccountSection?.(section);
    });
    window.requestAnimationFrame(() =>
      document.getElementById(section === "history" ? "account-past-lessons" : "upcoming-lessons-heading")?.focus({ preventScroll: true })
    );
  }

  function editDetails() {
    if (editing) {
      openAccountSection("upcoming");
      return;
    }
    applyTransition(() => {
      setMenuOpen(false);
      setEditing(true);
      setAccountSection("");
      onOpenAccountSection?.("profile");
    });
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".my-lessons__details input")?.focus({ preventScroll: true }));
  }

  if (loading) return <p className="booking-state-note">Loading your lessons…</p>;

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
        intro="Your lessons, and any changes you want to make to them, all live here."
        onSignedIn={(signedIn) => {
          setStudent(signedIn);
          setLoading(true);
          load();
        }}
      />
    );
  }

  return (
    <div className="my-lessons my-lessons--embedded">
      <div className="unified-account-controls">
        <div className="my-lessons__header my-lessons__header--embedded">
          <div className="my-lessons__account-name">
            <span>Account</span>
            <strong>{student.name}</strong>
          </div>
          <div className="my-lessons__header-actions">
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
                <button
                  aria-current={accountSection === "upcoming" && !editing ? "true" : undefined}
                  onClick={() => openAccountSection("upcoming")}
                  type="button"
                >
                  View lessons {upcomingCount ? <span>{upcomingCount}</span> : null}
                </button>
                <button
                  aria-controls="account-past-lessons"
                  aria-expanded={accountSection === "history"}
                  aria-current={accountSection === "history" ? "true" : undefined}
                  onClick={() => openAccountSection("history")}
                  type="button"
                >
                  Past lessons
                </button>
                <button aria-current={editing ? "true" : undefined} onClick={editDetails} type="button">
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
                      onSignedOut?.();
                    })
                  }
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
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
                <p className="my-lessons__details-note">We couldn&rsquo;t check your saved rates just now.</p>
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
                  Your code sets the price for future weekly lessons of the matching length.
                </p>
              </details>
            </div>

            {detailsNote ? (
              <p className="my-lessons__details-note my-lessons__details-note--ok" role="status">{detailsNote}</p>
            ) : null}
          </section>
        ) : null}

        {error || loadError ? (
          <div className="booking-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{error || loadError}</p>
          </div>
        ) : null}
      </div>

      {accountSection === "history" ? (
        <section className="my-lessons__account-section my-lessons__account-section--detached" id="account-past-lessons" aria-labelledby="past-lessons-heading" tabIndex={-1}>
          <div className="my-lessons__account-section-heading">
            <h3 className="eyebrow" id="past-lessons-heading">Past lessons</h3>
            <button className="booking-back booking-back--tertiary" onClick={() => openAccountSection("upcoming")} type="button">
              <ArrowLeft size={16} aria-hidden="true" /> Upcoming lessons
            </button>
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
    </div>
  );
}
