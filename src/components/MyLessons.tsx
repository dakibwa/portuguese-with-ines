"use client";

import { CancelEdit, EditActions, EditValue } from "@/components/teacher/EditControls";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { AccountAvatar, AccountMenu, type AccountSection } from "@/components/AccountMenu";
import { AuthPanel } from "@/components/AuthPanel";
import { CardPrompt, CardTerms, type CardUpcoming } from "@/components/CardOnFile";
import {
  confirmEmailChange,
  fetchMe,
  readSession,
  removeStudentCard,
  requestEmailChange,
  updateProfile,
  type LessonSeries,
  type MyBooking,
  type Student
} from "@/lib/auth-api";
import {
  fetchRecurringRates,
  formatMoneyCents,
  formatPriceCents,
  formatShortDay,
  formatSlotTime,
  redeemRecurringRate
} from "@/lib/booking-api";
import { STUDENT_MARKS } from "@/lib/student-marks";
import { TUTOR_NAME, TUTOR_OBJECT } from "@/lib/tutor";
import { hasStudentSide } from "@/lib/account-workspace";
import { StudentHomework } from "@/components/homework/StudentHomework";

/** The two lengths a code from Inês can set a weekly price for. */
const RATE_LENGTHS = [60, 90] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function accountDetails(student?: Student | null) {
  return { name: student?.name ?? "", email: student?.email ?? "", nif: student?.nif ?? "" };
}

/**
 * The account's own cards, a lesson's homework and Your details, each headed
 * like the Your lessons calendar card with the name's menu beneath its
 * heading. Which one shows is the booking page's choice (`section`); on Your
 * lessons itself, where their past lessons sit beneath the calendar
 * (PastLessons), this draws nothing but a failure to read the account.
 */
export function MyLessons({
  initialAccount = null,
  clock,
  onRatesChange,
  onStudentChange,
  onSelectSection,
  onSignOut,
  onStepChange,
  openUpcomingRequest = 0,
  cardBookingId = "",
  initialEmailPending = "",
  homeworkId = "",
  section = "upcoming"
}: {
  /** The account the booking page has just loaded, so arriving doesn't ask for it twice. */
  initialAccount?: { student: Student; bookings: MyBooking[]; series?: LessonSeries[]; cardsAccepted?: boolean; sameDayFeeCents?: number; minimumNoticeHours?: number } | null;
  /** The calendar's minute clock keeps history current without another account read. */
  clock: number;
  /** The account's own prices, as last read or changed here, so booking prices with them. */
  onRatesChange?: (rates: Record<number, number>) => void;
  /** Saved fields update the account name and splat on the surrounding calendar too. */
  onStudentChange?: (fields: Partial<Student>) => void;
  onSelectSection?: (section: AccountSection) => void;
  onSignOut?: () => void;
  /** True while a first-visit step (their email) has the page to itself, so
   * the booking page holds their lessons back until it is done. */
  onStepChange?: (step: boolean) => void;
  openUpcomingRequest?: number;
  cardBookingId?: string;
  /** An address they gave on the welcome, waiting for its link. */
  initialEmailPending?: string;
  /** The lesson whose homework is open, chosen from its row on Your lessons. */
  homeworkId?: string;
  section?: AccountSection;
}) {
  const [student, setStudent] = useState<Student | null>(initialAccount?.student ?? null);
  const homeworkLeave = useRef<(() => Promise<boolean>) | null>(null);
  const [bookings, setBookings] = useState<MyBooking[]>(initialAccount?.bookings ?? []);
  const [series, setSeries] = useState<LessonSeries[]>(initialAccount?.series ?? []);
  const [cardsAccepted, setCardsAccepted] = useState(Boolean(initialAccount?.cardsAccepted));
  // The live fee and notice the card is agreed under.
  const [cardRules, setCardRules] = useState({ feeCents: initialAccount?.sameDayFeeCents, noticeHours: initialAccount?.minimumNoticeHours });
  // Back from Stripe with a card saved; the account may take a moment to say so.
  const [cardAdded, setCardAdded] = useState(false);
  const [cardAuthorised, setCardAuthorised] = useState(false);
  const [cardChecking, setCardChecking] = useState(false);
  const returningCard = useRef(false);
  const [removingCard, setRemovingCard] = useState(false);
  const editing = section === "profile";
  const [details, setDetails] = useState(() => accountDetails(initialAccount?.student));
  // What each open row holds now, read when a save returns: a row closes only
  // if nothing newer was typed into it while it saved.
  const latestDetails = useRef(details);
  useEffect(() => { latestDetails.current = details; }, [details]);
  const [savingName, setSavingName] = useState(false);
  const [savingNif, setSavingNif] = useState(false);
  // Your details shows each value with its own Change; one opens at a time.
  const [openField, setOpenField] = useState<"name" | "email" | "nif" | "mark" | "card" | null>(null);
  const [savingMark, setSavingMark] = useState<string | null>(null);
  // Just chosen: the new splat lands in its row (11 October 2026, at Dan's
  // request: choosing one felt abrupt).
  const [markLanding, setMarkLanding] = useState(false);
  const [emailPending, setEmailPending] = useState(initialEmailPending);
  const [emailBusy, setEmailBusy] = useState(false);
  const [detailsNote, setDetailsNote] = useState("");
  // The prices saved on the account, read each time the details open.
  // `null` until they arrive, so a slow answer never reads as "none saved".
  const [rates, setRates] = useState<Record<number, number> | null>(null);
  const [ratesFailed, setRatesFailed] = useState(false);
  const [rateCode, setRateCode] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [loading, setLoading] = useState(!initialAccount);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
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
    setCardsAccepted(Boolean(initialAccount.cardsAccepted));
    setCardRules({ feeCents: initialAccount.sameDayFeeCents, noticeHours: initialAccount.minimumNoticeHours });
    setStudent((current) => current && {
      ...current,
      hasCard: initialAccount.student.hasCard,
      cardForAllLessons: initialAccount.student.cardForAllLessons
    });
    setLoading(false);
    setLoadError("");
  }, [initialAccount, student?.id]);

  // One step to a screen on a first visit, their lessons last (2 November
  // 2026, Dan: "surely they should type in email then go to the next page
  // where they pay … then see the next lesson bit"). Told before paint, so the
  // lessons never flash up under the step. The card is a step too, and can't
  // be skipped (Dan, 2 Nov: card first); CardPrompt says while it is open.
  const emailStep = Boolean(student && !student.email && hasStudentSide(student) && !emailPending);
  const [cardOpen, setCardOpen] = useState(false);
  useLayoutEffect(() => {
    onStepChange?.(emailStep || cardOpen);
  }, [emailStep, cardOpen, onStepChange]);
  useLayoutEffect(() => () => onStepChange?.(false), [onStepChange]);

  // A reload that lands while the details form is open must not replace what
  // the student is typing with the values it had before.
  const editingRef = useRef(false);
  const detailsRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    editingRef.current = editing;
    // Leaving Your details closes whatever was open in it.
    if (!editing) setOpenField(null);
  }, [editing]);

  useEffect(() => {
    if (!markLanding) return;
    const timer = window.setTimeout(() => setMarkLanding(false), 1200);
    return () => window.clearTimeout(timer);
  }, [markLanding]);

  // A detail opening or closing eases its row to the new height, carrying the
  // rows below with it, instead of the card jumping (11 October 2026, at Dan's
  // request). Heights are read after every commit so the next change starts
  // from what is on screen.
  const factHeights = useRef<{ field: typeof openField; width: number; heights: Map<string, number> } | null>(null);
  useLayoutEffect(() => {
    const facts = detailsRef.current?.querySelector<HTMLElement>(".my-lessons__facts");
    if (!facts) {
      factHeights.current = null;
      return;
    }
    const rows = [...facts.querySelectorAll<HTMLElement>(":scope > .my-lessons__fact")];
    const heights = new Map(rows.map((row) => [row.dataset.field ?? "", row.getBoundingClientRect().height]));
    const before = factHeights.current;
    factHeights.current = { field: openField, width: facts.clientWidth, heights };
    if (!before || before.field === openField || before.width !== facts.clientWidth ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const row of rows) {
      const from = before.heights.get(row.dataset.field ?? "");
      const to = heights.get(row.dataset.field ?? "");
      if (from === undefined || to === undefined || Math.abs(from - to) < 2) continue;
      row.animate([{ height: `${from}px`, overflow: "clip" }, { height: `${to}px`, overflow: "clip" }], {
        duration: Math.round(Math.min(440, 260 + Math.abs(to - from) * 0.5)),
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      });
    }
  });

  // Focus a field as it opens, before a student can select anything else: a
  // queued frame could otherwise steal their focus or subsequent typing.
  // Closed again, saved or not, focus goes back to the value that opened it
  // (10 November 2026), unless they have already moved on to something else.
  const lastOpenField = useRef<typeof openField>(null);
  useLayoutEffect(() => {
    const closed = lastOpenField.current;
    lastOpenField.current = openField;
    if (openField && openField !== "mark" && openField !== "card") {
      detailsRef.current?.querySelector<HTMLInputElement>(`[data-field="${openField}"] input`)?.focus({ preventScroll: true });
    } else if (!openField && closed && (document.activeElement === document.body || !document.activeElement)) {
      detailsRef.current?.querySelector<HTMLElement>(`[data-field="${closed}"] [data-edit]`)?.focus({ preventScroll: true });
    }
  }, [openField]);
  // Escape puts an open detail back as it was.
  const cancelOnEscape = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpenField(null);
  };

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
      setCardsAccepted(Boolean(data.cardsAccepted));
      setCardRules({ feeCents: data.sameDayFeeCents, noticeHours: data.minimumNoticeHours });
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

  /*
   * Back from Stripe with a card saved from the account. Stripe tells the
   * booking system a moment later, so the account is read again shortly
   * rather than at once.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (["added", "authorised"].includes(url.searchParams.get("card") ?? "")) {
      setCardAuthorised(url.searchParams.get("card") === "authorised");
      returningCard.current = true;
      url.searchParams.delete("card");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    if (!returningCard.current) return;
    setCardAdded(true);
    setCardChecking(true);
    const timers = [2500, 8000].map((delay) => window.setTimeout(() => {
      void load().finally(() => { if (delay === 8000) setCardChecking(false); });
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [load]);

  async function saveName() {
    const session = readSession();
    const submittedName = details.name;
    setSavingName(true);
    setError("");
    setDetailsNote("");
    try {
      const result = await updateProfile(session, { name: submittedName.trim() });
      if (readSession() !== session) return;
      profileVersion.current += 1;
      // Other fields may have been saved since this response was prepared.
      setStudent((current) => current && { ...current, name: result.student.name });
      onStudentChange?.({ name: result.student.name });
      if (latestDetails.current.name === submittedName) setOpenField((field) => field === "name" ? null : field);
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
      onStudentChange?.({ nif: savedNif });
      setDetails((current) => current.nif === submittedNif ? { ...current, nif: savedNif } : current);
      if (latestDetails.current.nif === submittedNif) setOpenField((field) => field === "nif" ? null : field);
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
      onStudentChange?.({ mark: result.student.mark ?? "" });
      setMarkLanding(true);
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
          ? `Saved. Your ${result.saved.durationMinutes}-minute lessons are now ${formatMoneyCents(result.saved.cents)} each.`
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

  // One way to type an address, from Your details or the prompt beside the card.
  function draftEmail(value: string) {
    emailDraftVersion.current += 1;
    setDetails((current) => ({ ...current, email: value }));
  }

  async function changeEmail() {
    // Each request sends two emails, so a double-click must not send four.
    if (emailBusy) return;
    const session = readSession();
    const submittedEmail = details.email;
    setEmailBusy(true);
    setError("");
    setDetailsNote("");
    try {
      const result = await requestEmailChange(session, submittedEmail.trim());
      if (readSession() !== session) return;
      setEmailPending(result.pending);
      if (latestDetails.current.email === submittedEmail) setOpenField((field) => field === "email" ? null : field);
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
      .filter((booking) => Date.parse(booking.endAt) > clock && booking.status === "confirmed")
      .map((booking) =>
        booking.seriesId && activeSeriesIds.has(booking.seriesId) ? `series:${booking.seriesId}` : `booking:${booking.reference}`
      )
  ).size;
  if (loading) return section === "upcoming" ? null : <p className="booking-state-note" role="status">Loading your lessons…</p>;

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
          <div className="booking-alert__body">
            <p>{loadError || error}</p>
            <div className="booking-alert__actions">
              <button
                className="button button--outline button--compact"
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
            </div>
          </div>
        </div>
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
  const openDetail = (field: "name" | "email" | "nif" | "mark" | "card") => {
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
      onSelect={async (next) => { if (!homeworkLeave.current || await homeworkLeave.current()) onSelectSection?.(next); }}
      onSignOut={async () => { if (!homeworkLeave.current || await homeworkLeave.current()) onSignOut?.(); }}
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

  if (section === "homework" && homeworkId) {
    return <section className="account-card my-lessons__homework" id="account-homework" aria-labelledby="homework-heading" tabIndex={-1}>
      {heading("homework-heading", "Homework", "homework")}
      {alert}
      <StudentHomework
        bookingId={homeworkId}
        key={`${student.id}-${homeworkId}-${readSession()}`}
        leaveGuard={homeworkLeave}
        onBack={() => onSelectSection?.("upcoming")}
      />
    </section>;
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
          <button className="my-lessons__change my-lessons__sign-out" onClick={() => onSignOut?.()} type="button">
            Sign out
          </button>
        )}
        {/* Each detail reads as itself and is its own button, a small pencil
            at its end; pressed, its field opens in the value's place with a
            tick and a cross, its name staying where it was (10 October and
            10 November 2026, at Dan's request). */}
        <div className="my-lessons__facts">
          {student.mark !== undefined ? (
            <div className="my-lessons__fact" data-field="mark">
              <span className="my-lessons__fact-label">Your splat</span>
              {openField === "mark" ? (
                <div aria-label="Choose your splat" className="my-lessons__marks" role="group">
                  {[{ id: "", label: "Your initial" }, ...STUDENT_MARKS].map((choice, order) => (
                    <button
                      aria-label={choice.label}
                      aria-busy={savingMark === choice.id || undefined}
                      aria-pressed={(student.mark ?? "") === choice.id}
                      className="my-lessons__mark"
                      disabled={savingMark !== null}
                      key={choice.id || "initial"}
                      onClick={() => void saveMark(choice.id)}
                      style={{ "--mark-order": order } as React.CSSProperties}
                      type="button"
                    >
                      <AccountAvatar mark={choice.id} name={student.name} />
                    </button>
                  ))}
                </div>
              ) : (
                <span className="my-lessons__fact-value">
                  <EditValue field="mark" label="Change splat" onEdit={() => openDetail("mark")}>
                    <AccountAvatar className={`my-lessons__avatar${markLanding ? " is-landing" : ""}`} mark={student.mark} name={student.name} />
                  </EditValue>
                </span>
              )}
              {openField === "mark" ? <CancelEdit onCancel={() => setOpenField(null)} /> : null}
            </div>
          ) : null}

          <div className="my-lessons__fact" data-field="name">
            <span className="my-lessons__fact-label">Your name</span>
            {openField === "name" ? (
              <form
                className="my-lessons__edit"
                onKeyDown={cancelOnEscape}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!savingName && details.name.trim() && details.name.trim() !== student.name) void saveName();
                }}
              >
                <input
                  aria-label="Your name"
                  autoComplete="name"
                  maxLength={120}
                  onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))}
                  spellCheck={false}
                  value={details.name}
                />
                <EditActions
                  busy={savingName}
                  onCancel={() => setOpenField(null)}
                  saveDisabled={!details.name.trim() || details.name.trim() === student.name}
                  saveLabel="Save name"
                />
              </form>
            ) : (
              <span className="my-lessons__fact-value">
                <EditValue field="name" label="Change name" onEdit={() => openDetail("name")}>{student.name}</EditValue>
              </span>
            )}
          </div>

          <div className="my-lessons__fact" data-field="email">
            <span className="my-lessons__fact-label">Email</span>
            {openField === "email" ? (
              <form
                className="my-lessons__edit"
                onKeyDown={cancelOnEscape}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!emailBusy && details.email.trim() && details.email.trim() !== student.email) void changeEmail();
                }}
              >
                <input
                  aria-label="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  onChange={(event) => draftEmail(event.target.value)}
                  spellCheck={false}
                  type="email"
                  value={details.email}
                />
                {/* Changing the address you sign in with is deliberately the slower
                    of the two: nothing moves until the new address answers. A
                    tick could not say that, so this one keeps its words. */}
                <span className="teacher-edit-actions">
                  <button
                    className="button button--blue button--small"
                    disabled={emailBusy || !details.email.trim() || details.email.trim() === student.email}
                    type="submit"
                  >
                    {emailBusy ? "Sending…" : "Send confirmation link"}
                  </button>
                  <CancelEdit onCancel={() => setOpenField(null)} />
                </span>
                <p className="my-lessons__details-note">{student.email ? "It changes once you open the link we send to the new address." : "It’s added once you open the link we send to it, on this phone or computer."}</p>
              </form>
            ) : (
              <span className={`my-lessons__fact-value${student.email || emailPending ? "" : " my-lessons__fact-value--empty"}`}>
                {/* A long address breaks after its @, never mid-word. A
                    student Inês invited on WhatsApp may have none yet. */}
                <EditValue empty={!student.email} field="email" label={student.email ? "Change email" : "Add email"} onEdit={() => openDetail("email")}>
                  {student.email ? <span>{student.email.split("@")[0]}{student.email.includes("@") ? <>@<wbr />{student.email.slice(student.email.indexOf("@") + 1)}</> : null}</span> : emailPending ? "Not confirmed yet" : "Not added"}
                </EditValue>
                {emailPending ? (
                  <small className="my-lessons__details-note">
                    Waiting for you to confirm <strong>{emailPending}</strong> from the link we sent.
                  </small>
                ) : null}
              </span>
            )}
          </div>

          {/* Only where the booking system can take a card, and only once it
              says which kind is saved (12 October 2026, Dan). A student Inês
              made free at every length has nothing to add one for, unless one
              is already saved (16 October 2026). */}
          {cardsAccepted && hasStudentSide(student) && !(rates?.[60] === 0 && rates?.[90] === 0 && !student.hasCard) ? (
            <div className="my-lessons__fact" data-field="card">
              <span className="my-lessons__fact-label">Card</span>
              {openField === "card" ? (
                <>
                  <div className="card-row-open">
                    <CardTerms change={student.cardForAllLessons} onCancel={() => setOpenField(null)} {...cardRules} />
                  </div>
                  {student.cardForAllLessons ? (
                    <button
                      className="teacher-quiet"
                      disabled={removingCard}
                      onClick={async () => {
                        const session = readSession();
                        setRemovingCard(true);
                        setError("");
                        try {
                          const result = await removeStudentCard(session);
                          if (readSession() !== session) return;
                          profileVersion.current += 1;
                          setStudent((current) => current && { ...current, hasCard: result.student.hasCard, cardForAllLessons: result.student.cardForAllLessons });
                          onStudentChange?.({ hasCard: result.student.hasCard, cardForAllLessons: result.student.cardForAllLessons });
                          setCardAdded(false);
                          setCardChecking(false);
                          returningCard.current = false;
                          setOpenField((field) => field === "card" ? null : field);
                          setDetailsNote(`Card removed. Lessons ${TUTOR_NAME} adds are paid to ${TUTOR_OBJECT} by hand again.`);
                          void load();
                        } catch (caught) {
                          if (readSession() !== session) return;
                          setError(caught instanceof Error ? caught.message : "Your card couldn’t be removed.");
                        } finally {
                          setRemovingCard(false);
                        }
                      }}
                      type="button"
                    >
                      Remove card
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="my-lessons__fact-value">
                  <EditValue empty={!student.cardForAllLessons} field="card" label={student.cardForAllLessons ? "Change card" : "Add card"} onEdit={() => openDetail("card")}>
                    {student.cardForAllLessons ? "Saved" : student.hasCard ? "Saved for lessons you book" : "Not added"}
                  </EditValue>
                </span>
              )}
            </div>
          ) : null}

          <div className="my-lessons__fact" data-field="nif">
            <span className="my-lessons__fact-label">NIF</span>
            {openField === "nif" ? (
              <form
                className="my-lessons__edit"
                onKeyDown={cancelOnEscape}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!savingNif && details.nif.trim() !== (student.nif ?? "")) void saveNif();
                }}
              >
                <input
                  aria-label="NIF (optional, for your receipts)"
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={20}
                  onChange={(event) => setDetails((current) => ({ ...current, nif: event.target.value }))}
                  placeholder="Optional, for your receipts"
                  value={details.nif}
                />
                <EditActions
                  busy={savingNif}
                  onCancel={() => setOpenField(null)}
                  saveDisabled={details.nif.trim() === (student.nif ?? "")}
                  saveLabel="Save NIF"
                />
              </form>
            ) : (
              <span className="my-lessons__fact-value">
                <EditValue empty={!student.nif} field="nif" label={student.nif ? "Change NIF" : "Add NIF"} onEdit={() => openDetail("nif")}>
                  {student.nif || "Not added"}
                </EditValue>
              </span>
            )}
          </div>
        </div>

        {/* Only some students have a code, so nothing here suggests they should:
            saved rates appear once there is one, and the field stays behind a
            small disclosure, as it does when booking. */}
        <div className="my-lessons__rates">
          {rates && RATE_LENGTHS.some((minutes) => rates[minutes] !== undefined) ? (
            <ul aria-label="Your prices" className="my-lessons__rates-list">
              {RATE_LENGTHS.filter((minutes) => rates[minutes] !== undefined).map((minutes) => (
                <li key={minutes}>
                  <span>{minutes}-minute lessons</span>
                  <strong>{rates[minutes] === 0 ? formatPriceCents(0) : `${formatMoneyCents(rates[minutes])} each`}</strong>
                </li>
              ))}
            </ul>
          ) : null}
          {ratesFailed ? (
            <p className="my-lessons__details-note">We couldn&rsquo;t check your prices just now.</p>
          ) : null}
          <details className="my-lessons__code">
            <summary>Have a code from {TUTOR_NAME}?</summary>
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
              Your code sets your price for lessons of that length, including ones already booked.
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
  // read it, or lessons Inês added that no card covers yet, need saying here.
  const unpaidAdded = bookings.filter((booking) =>
    Date.parse(booking.endAt) > clock && booking.status === "confirmed" && booking.addedByTeacher && booking.paymentStatus === "not_required" && !booking.paidByHand
  ).length;
  const cardSaved = cardAdded && student.hasCard === true && student.cardForAllLessons === true;
  const cardNote = cardAdded ? (
    <div className="booking-outcome card-added" role="status">
      {cardSaved ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertCircle size={20} aria-hidden="true" />}
      <p>{cardSaved ? <>{cardAuthorised ? "Payments authorised." : "Card saved."} You&rsquo;re all set. Book, move or cancel your lessons below.</> : cardChecking ? "We’re confirming your saved card…" : "Your card hasn’t been confirmed yet. You can try adding it again."}</p>
    </div>
  ) : null;
  const askForCard = !cardSaved && !cardChecking && cardsAccepted && hasStudentSide(student) &&
    student.cardForAllLessons === false && unpaidAdded > 0;
  // Someone Inês let in from a WhatsApp link may have no email yet. It is
  // their only way back in on another phone, so it is the first thing asked,
  // before the card, with no skip (2 November 2026, Dan: "they need to add an
  // email then yeah that's fine"). Never a second card beside another.
  const needsEmail = !student.email && hasStudentSide(student);
  const emailPrompt = needsEmail ? (
    <section aria-labelledby="email-prompt-heading" className={`card-prompt email-prompt${emailPending ? "" : " card-prompt--open"}`}>
      <span aria-hidden="true" className="card-prompt__icon">
        <Mail size={20} />
      </span>
      <div className="card-prompt__body">
        <h3 id="email-prompt-heading">{emailPending ? "Check your email" : "Add your email"}</h3>
        {emailPending ? (
          <p>Open the link we sent to <strong>{emailPending}</strong> on this phone.</p>
        ) : (
          <>
            <p>So you can sign in on any phone or computer.</p>
            <form
              className="email-prompt__form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!emailBusy && details.email.trim()) void changeEmail();
              }}
            >
              <label>
                <span className="visually-hidden">Your email</span>
                <input
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  onChange={(event) => draftEmail(event.target.value)}
                  placeholder="you@example.com"
                  spellCheck={false}
                  type="email"
                  value={details.email}
                />
              </label>
              <button className="button button--coral button--compact" disabled={emailBusy || !details.email.trim()} type="submit">
                {emailBusy ? "Sending…" : "Add email"}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  ) : null;
  // What agreeing goes on to pay for (2 November 2026, Dan: make it obvious
  // it covers their weekly lessons too): each weekly run once, as its day and
  // Porto time, and any single lesson Inês added still to come.
  const upcomingAdded: CardUpcoming[] = [];
  if (cardBookingId || askForCard) {
    for (const booking of bookings
      .filter((entry) => Date.parse(entry.startAt) > clock && entry.status === "confirmed" && entry.addedByTeacher && entry.paymentStatus === "not_required" && !entry.paidByHand)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))) {
      const run = booking.seriesId ? series.find((entry) => entry.id === booking.seriesId) : undefined;
      const key = run ? `series:${run.id}` : `booking:${booking.reference}`;
      const known = upcomingAdded.find((entry) => entry.key === key);
      if (known) { known.startAts.push(booking.startAt); continue; }
      upcomingAdded.push({
        key, weekly: Boolean(run), startAts: [booking.startAt], amountCents: booking.lessonType.priceCents,
        when: run ? `Every ${WEEKDAYS[run.weekday]}, ${formatSlotTime(booking.startAt)}` : `${formatShortDay(booking.startAt)}, ${formatSlotTime(booking.startAt)}`
      });
    }
  }
  const cardPrompt = cardBookingId || askForCard ? <CardPrompt key={cardBookingId} bookingId={cardBookingId} onOpenChange={setCardOpen} upcoming={upcomingAdded} /> : null;
  return (
    <>
      {cardNote}
      {/* One card at a time above their lessons (2 November 2026, Dan: "super
          smooth"): their email first, then the card to confirm, then a
          reminder to open the email's link if it is still waiting. */}
      {emailStep ? emailPrompt : cardPrompt ?? emailPrompt}
      {alert}
    </>
  );
}
