"use client";

import { HOME_CLOCK, TUTOR_NAME } from "@/lib/tutor";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, CreditCard, Repeat } from "lucide-react";
import { AssetMark } from "@/components/BrandMarks";
import { CHARGED_EACH, CHARGED_IT, FeeFacts } from "@/components/FeeFacts";
import { openCardPage, previewCardBooking, readSession, type CardBooking } from "@/lib/auth-api";
import { NO_SHOW_WINDOW_HOURS_AFTER, NOTICE_HOURS, SAME_DAY_RESCHEDULE_FEE_CENTS } from "@/lib/config";
import { formatMoneyCents, formatShortDay, formatSlotTime, stripePaymentUrl } from "@/lib/booking-api";

/** Each lesson's tile its own mark, as the booking step's chosen lessons have. */
const LESSON_MARKS = [
  "/visuals/v2-splats/booking-availability-splat-v2.svg",
  "/visuals/v2-splats/in-porto-or-online-splat-v2.svg",
  "/visuals/v2-splats/one-to-one-splat-v2.svg",
  "/visuals/v2-splats/real-life-splat-v2.svg",
];

/** Lessons still to come that the agreement will pay for: one weekly run, or one lesson, with the starts it covers. */
export type CardUpcoming = { key: string; when: string; amountCents: number; weekly: boolean; startAts: string[] };

/**
 * Saving a card from the account (12 October 2026, Dan): how a student Inês
 * brought onto the site pays for the lessons she adds. The terms are the same
 * short list a booking shows, and pressing the button is the agreement; the
 * card itself is entered on Stripe's page.
 */
export function CardTerms({ change = false, setup = false, onCancel, onSkip, bookingId = "", choosable = false, needsCard = false, onLeaveOut, upcoming = [], feeCents = SAME_DAY_RESCHEDULE_FEE_CENTS, noticeHours = NOTICE_HOURS }: {
  change?: boolean; onCancel?: () => void;
  /** Offered only once something has gone wrong, so a card that can't go ahead never keeps them from their lessons. */
  onSkip?: () => void;
  /** Asking for a card on Your lessons: the approval card's layout, without lessons to pay now. */
  setup?: boolean;
  /** The lessons a payment approval link names, comma-separated, or their account's outstanding ones. */
  bookingId?: string;
  /**
   * The lessons came from their account, not from Inês's link, so each can be
   * left out by pressing it (11 November 2026: some were paid to her in cash).
   */
  choosable?: boolean;
  /** With every lesson left out, whether a card is still needed for lessons to come. */
  needsCard?: boolean;
  /** The lessons left out, as the step's button or `See your lessons` is pressed; `done` closes the step. */
  onLeaveOut?: (ids: string[], done: boolean) => void;
  /** Their lessons still to come that Inês added, which the agreement then pays for. */
  upcoming?: CardUpcoming[];
  /** The live late change fee and notice; the published terms until the account says. */
  feeCents?: number; noticeHours?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ bookings: CardBooking[]; savedCardKey: string; sameDayFeeCents: number; minimumNoticeHours: number } | null>(null);
  const [bookingConsent, setBookingConsent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // When the lessons were read: each one's charge time is judged against it.
  const [checkedAt, setCheckedAt] = useState(0);
  // The account's lessons they pressed to leave out.
  const [leftOut, setLeftOut] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!bookingId) return;
    let active = true;
    const session = readSession();
    void previewCardBooking(session, bookingId.split(",")).then(data => {
      if (!active || readSession() !== session) return;
      setReview(data);
      setCheckedAt(Date.now());
    }).catch(caught => {
      if (active && readSession() === session) setError(caught instanceof Error ? caught.message : "We couldn’t check this lesson. Please try again.");
    });
    return () => { active = false; };
  }, [bookingId, attempt]);
  const selected = review?.bookings[0];
  const lessons = review?.bookings ?? [];
  const several = lessons.length > 1;
  // What agreeing pays for: every lesson but those left out.
  const kept = choosable ? lessons.filter(lesson => !leftOut.has(lesson.id)) : lessons;
  const keptSeveral = kept.length > 1;
  const chargeable = (lesson: CardBooking) => Date.parse(lesson.endAt) + NO_SHOW_WINDOW_HOURS_AFTER * 60 * 60 * 1000 <= checkedAt;
  // Whether each lesson's charge time (the end of its no-show window) has
  // passed, so agreeing is what lets it be charged: all of them, some or none.
  const ended = kept.filter(chargeable);
  const chargedOnAgreement = !kept.length ? "none" : ended.length === kept.length ? "all" : ended.length ? "some" : "none";
  // What agreeing charges straight away: the lessons whose hour has passed.
  const dueNowCents = ended.reduce((sum, lesson) => sum + lesson.amountCents, 0);
  // A future lesson the link names is paid now, so it is not listed again.
  const paidNow = new Set(lessons.map(lesson => lesson.startAt));
  const then = upcoming.filter(entry => entry.startAts.some(start => !paidNow.has(start))).slice(0, 3);
  // One card whether or not Inês ticked lessons (2 November 2026, Dan: "just
  // have it as one single thing"): only changing a saved card keeps the list.
  const approval = Boolean(bookingId) || setup;
  const ready = bookingId ? Boolean(selected) : true;
  // Every one of the account's lessons left out: the card is then only about
  // lessons to come, or about nothing.
  const noneIn = choosable && ready && !kept.length;
  const paying = Boolean(bookingId) && !noneIn;
  const savedCard = paying ? review?.savedCardKey : undefined;
  const fee = review?.sameDayFeeCents ?? feeCents;
  const notice = review?.minimumNoticeHours ?? noticeHours;
  const cardRequest = useRef(0);
  useLayoutEffect(() => () => { cardRequest.current += 1; }, []);

  async function open() {
    if (busy || (approval && (!ready || !bookingConsent))) return;
    const request = ++cardRequest.current;
    const session = readSession();
    const page = window.location.pathname;
    const current = () => request === cardRequest.current && readSession() === session && window.location.pathname === page;
    setBusy(true);
    setError("");
    if (choosable) onLeaveOut?.(lessons.filter(lesson => leftOut.has(lesson.id)).map(lesson => lesson.id), false);
    try {
      const result = await openCardPage(session, paying ? kept : [], savedCard);
      if (!current()) return;
      window.location.assign("authorised" in result ? "/book/?view=lessons&card=authorised" : stripePaymentUrl(result.checkoutUrl));
    } catch (caught) {
      if (!current()) return;
      setError(caught instanceof Error ? caught.message : "We couldn’t open the card form just now. Please try again.");
    } finally {
      if (request === cardRequest.current) setBusy(false);
    }
  }

  const alert = error ? (
    <div className="booking-alert booking-alert--error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <p>{error}</p>
    </div>
  ) : null;
  // Nothing to pay and no card needed: their lessons, for this visit.
  const nothingAsked = noneIn && !needsCard;
  const actions = nothingAsked ? (
    <div className="my-lessons__edit-actions">
      <button className="my-lessons__change" onClick={() => onLeaveOut?.(bookingId.split(","), true)} type="button">See your lessons</button>
    </div>
  ) : (
    <div className="my-lessons__edit-actions">
      <button
        aria-describedby={approval ? "card-terms-summary card-terms-rules" : "card-terms-summary"}
        className="button button--coral"
        disabled={busy || (approval && (!ready || !bookingConsent))}
        onClick={() => void open()}
        type="button"
      >
        {busy ? (savedCard ? "Authorising…" : "Opening…") : savedCard ? "Authorise payments" : paying ? "Agree & confirm payments" : change ? "Agree & change card" : "Agree & add card"}
      </button>
      {bookingId && error ? <button className="my-lessons__change" onClick={() => { setError(""); setReview(null); setBookingConsent(false); setAttempt(value => value + 1); }} type="button">Try again</button> : null}
      {onCancel ? (
        <button className="my-lessons__change" disabled={busy} onClick={onCancel} type="button">{approval ? "Not now" : "Cancel"}</button>
      ) : null}
      {onSkip && error ? <button className="my-lessons__change" disabled={busy} onClick={onSkip} type="button">See your lessons</button> : null}
    </div>
  );

  // One line each, the day and start (2 November 2026, Dan: "always fits on
  // the same line"); Porto time is named once, over the list.
  const tileBody = (lesson: CardBooking, index: number) => <>
    <AssetMark asset={LESSON_MARKS[index % LESSON_MARKS.length]} className="booking-selection-summary__mark" />
    <strong className="card-terms__when">{formatShortDay(lesson.startAt)}, {formatSlotTime(lesson.startAt)}</strong>
    <b className="card-terms__price">{formatMoneyCents(lesson.amountCents)}</b>
  </>;
  // The account's lessons are each a toggle, pressed while it will be paid;
  // the lessons Inês's link names stay fixed.
  const tile = (lesson: CardBooking, index: number) => choosable ? (
    <button
      aria-pressed={!leftOut.has(lesson.id)}
      className={`booking-selection-summary card-terms__lesson card-terms__lesson--choice${leftOut.has(lesson.id) ? " is-left-out" : ""}`}
      disabled={busy}
      onClick={() => {
        // What they agreed to has changed, so they agree again.
        setBookingConsent(false);
        setLeftOut(current => {
          const next = new Set(current);
          if (!next.delete(lesson.id)) next.add(lesson.id);
          return next;
        });
      }}
      type="button"
    >
      {tileBody(lesson, index)}
    </button>
  ) : (
    <div aria-label={several ? `Lesson ${index + 1}` : "This lesson"} className="booking-selection-summary card-terms__lesson" role="group">
      {tileBody(lesson, index)}
    </div>
  );

  /*
   * A payment approval link (27 October 2026, Dan: "simple and beautiful"),
   * in the booking confirm step's own words and marks: what is outstanding
   * as the booking step's time tiles, with what is charged now as their
   * total, then what is paid from then on as dashed tiles (2 November 2026,
   * Dan: make it obvious it covers their weekly lessons too). Over the
   * agreement, the rules as the confirm step's dabs: when future lessons are
   * charged, then the fee's two (2 November 2026, Dan: "I liked the bullets
   * they are cute"; 10 November: when they are charged is a dab too, not a
   * heading). On a wide card what is agreed sits on the left and agreeing on
   * the right.
   */
  const dueNow = chargedOnAgreement !== "none";
  // The label says what the lessons are, whichever are left out.
  const listedDue = lessons.some(chargeable);
  // "Now" is the hourly charge, so within the hour; a lesson whose hour has
  // not passed yet waits for it.
  const caption = !kept.length ? "" : chargedOnAgreement === "some" ? `The rest is charged ${CHARGED_EACH}`
    : dueNow ? "" : `Charged ${keptSeveral ? CHARGED_EACH : CHARGED_IT}`;
  if (approval) return (
    <div className="card-terms card-terms--approval">
      {!ready && !error ? <p role="status">Checking your lessons…</p> : null}
      {ready ? (
        <div className="card-terms__summary" id="card-terms-summary">
          {lessons.length ? <section aria-labelledby="card-terms-now" className="card-terms__lessons">
            <p className="card-terms__label">
              <span id="card-terms-now">{listedDue ? several ? "Outstanding lessons" : "Outstanding lesson" : "To pay"}</span>
              <small>{HOME_CLOCK}</small>
            </p>
            <ol className="booking-chosen-lessons">
              {lessons.map((lesson, index) => <li key={lesson.id}>{tile(lesson, index)}</li>)}
            </ol>
            {kept.length > 0 && (keptSeveral || dueNow) ? (
              <p className="card-terms__total">
                <span>{dueNow ? "Charged now" : "Total"}</span>
                <b className="card-terms__price">{formatMoneyCents(dueNow ? dueNowCents : kept.reduce((sum, lesson) => sum + lesson.amountCents, 0))}</b>
              </p>
            ) : null}
            {caption ? <p className="card-terms__note">{caption}</p> : null}
            {choosable ? <p className="card-terms__note">Already paid {TUTOR_NAME}{several ? " for one" : ""}? Tap it to leave it out.</p> : null}
          </section> : null}
          {then.length ? (
            <section aria-label="Lessons to come" className="card-terms__lessons card-terms__lessons--then">
              {/* When they are charged is the first dab below, never a heading
                  over them (10 November 2026, Dan: "just be a bullet point").
                  Their clock is named once, here if nothing above names it. */}
              {lessons.length ? null : <p className="card-terms__label"><small>{HOME_CLOCK}</small></p>}
              <ul className="booking-chosen-lessons">
                {then.map(lesson => (
                  <li key={lesson.key}>
                    <div className="booking-selection-summary card-terms__lesson card-terms__lesson--then">
                      <span aria-hidden="true" className="card-terms__then-mark">{lesson.weekly ? <Repeat size={16} strokeWidth={2.4} /> : <CreditCard size={16} />}</span>
                      <strong className="card-terms__when">{lesson.when}</strong>
                      <b className="card-terms__price">{formatMoneyCents(lesson.amountCents)}</b>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
      <div className="card-terms__consent">
        {/* With nothing left to agree to, the terms have nothing to say. */}
        {ready && !nothingAsked ? (
          <ul className="booking-payment-facts" id="card-terms-rules">
            <li>Future lessons are charged {CHARGED_EACH}</li>
            <FeeFacts feeCents={fee} noticeHours={notice} />
          </ul>
        ) : null}
        {ready && !nothingAsked ? (
          <div className="booking-agreement card-terms__agreement">
            <div className={`booking-agreement__control${bookingConsent ? " is-agreed" : ""}`}>
              <button
                className="booking-agreement__button"
                type="button"
                aria-pressed={bookingConsent}
                aria-describedby="card-terms-summary card-terms-rules"
                disabled={busy}
                onClick={() => setBookingConsent(value => !value)}
              >
                {bookingConsent ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                {paying ? `I authorise card payments for ${keptSeveral ? "these" : "this"} and future lessons` : "I authorise card payments for my future lessons"}
              </button>
              <a aria-haspopup="dialog" data-terms-privacy href="#terms-privacy">Terms &amp; privacy</a>
            </div>
          </div>
        ) : null}
        {alert}
        {actions}
      </div>
    </div>
  );

  return (
    <div className="card-terms">
      <ul className="booking-payment-facts" id="card-terms-summary">
        <li>Future lessons are charged {CHARGED_EACH}</li>
        <li>Stripe keeps your card safe</li>
        <FeeFacts feeCents={fee} noticeHours={notice} />
        <li>
          The full rules are in{" "}
          <a aria-haspopup="dialog" data-terms-privacy href="#terms-privacy">terms &amp; privacy</a>
        </li>
      </ul>
      {alert}
      {actions}
    </div>
  );
}

/**
 * On Your lessons, only while lessons Inês added are still paid to her by
 * hand, while lessons they have had are outstanding (11 November 2026), or
 * when her payment link names lessons: one card, a step of its own
 * before their lessons (2 November 2026, Dan: "card first"). There is no Not
 * now; only a card that can't go ahead (the lessons already settled, cards
 * switched off) offers their lessons instead, for that visit.
 */
export function CardPrompt({ bookingId = "", choosable = false, needsCard = false, onLeaveOut, upcoming = [], onOpenChange }: {
  bookingId?: string; upcoming?: CardUpcoming[];
  /** As CardTerms: the account's outstanding lessons, each of which can be left out. */
  choosable?: boolean; needsCard?: boolean; onLeaveOut?: (ids: string[], done: boolean) => void;
  /** Whether the card is showing: true on arrival, false once skipped after a failure or when it goes, so their lessons can wait for it. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const report = useRef(onOpenChange);
  useLayoutEffect(() => { report.current = onOpenChange; });
  useLayoutEffect(() => { report.current?.(open); }, [open]);
  useLayoutEffect(() => () => report.current?.(false), []);
  if (!open) return null;
  return (
    <section aria-labelledby="card-prompt-heading" className="card-prompt card-prompt--open card-prompt--review">
      <span aria-hidden="true" className="card-prompt__icon">
        <CreditCard size={20} />
      </span>
      <div className="card-prompt__body">
        <h3 id="card-prompt-heading">Confirm your card payments</h3>
        <CardTerms key={bookingId} bookingId={bookingId} choosable={choosable} needsCard={needsCard} onLeaveOut={onLeaveOut} setup={!bookingId} upcoming={upcoming} onSkip={() => setOpen(false)} />
      </div>
    </section>
  );
}
