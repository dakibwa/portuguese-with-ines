"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, CreditCard } from "lucide-react";
import { AssetMark } from "@/components/BrandMarks";
import { openCardPage, previewCardBooking, readSession, type CardBooking } from "@/lib/auth-api";
import { NOTICE_HOURS, SAME_DAY_RESCHEDULE_FEE_CENTS } from "@/lib/config";
import { formatMoneyCents, formatShortDay, formatSlotTime } from "@/lib/booking-api";

/**
 * Saving a card from the account (12 October 2026, Dan): how a student Inês
 * brought onto the site pays for the lessons she adds. The terms are the same
 * short list a booking shows, and pressing the button is the agreement; the
 * card itself is entered on Stripe's page.
 */
export function CardTerms({ change = false, onCancel, bookingId = "", feeCents = SAME_DAY_RESCHEDULE_FEE_CENTS, noticeHours = NOTICE_HOURS }: {
  change?: boolean; onCancel?: () => void; bookingId?: string;
  /** The live late change fee and notice; the published terms until the account says. */
  feeCents?: number; noticeHours?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ booking: CardBooking; savedCardKey: string; sameDayFeeCents: number; minimumNoticeHours: number } | null>(null);
  const [bookingConsent, setBookingConsent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Whether the lesson's usual hour after it ends has passed, so agreeing
  // is what lets it be charged.
  const [chargedOnAgreement, setChargedOnAgreement] = useState(false);
  useEffect(() => {
    if (!bookingId) return;
    let active = true;
    const session = readSession();
    void previewCardBooking(session, bookingId).then(data => {
      if (!active || readSession() !== session) return;
      setReview(data);
      setChargedOnAgreement(Date.parse(data.booking.endAt) + 60 * 60 * 1000 <= Date.now());
    }).catch(caught => {
      if (active && readSession() === session) setError(caught instanceof Error ? caught.message : "We couldn’t check this lesson. Please try again.");
    });
    return () => { active = false; };
  }, [bookingId, attempt]);
  const selected = review?.booking;
  const fee = review?.sameDayFeeCents ?? feeCents;
  const notice = review?.minimumNoticeHours ?? noticeHours;
  const cardRequest = useRef(0);
  useLayoutEffect(() => () => { cardRequest.current += 1; }, []);

  async function open() {
    if (busy || (bookingId && (!selected || !bookingConsent))) return;
    const request = ++cardRequest.current;
    const session = readSession();
    const page = window.location.pathname;
    const current = () => request === cardRequest.current && readSession() === session && window.location.pathname === page;
    setBusy(true);
    setError("");
    try {
      const result = await openCardPage(session, selected, review?.savedCardKey);
      if (!current()) return;
      window.location.assign("authorised" in result ? "/book/?view=lessons&card=authorised" : result.checkoutUrl);
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
  const actions = (
    <div className="my-lessons__edit-actions">
      <button
        aria-describedby="card-terms-summary"
        className="button button--coral"
        disabled={busy || Boolean(bookingId && (!selected || !bookingConsent))}
        onClick={() => void open()}
        type="button"
      >
        {busy ? (review?.savedCardKey ? "Authorising…" : "Opening…") : review?.savedCardKey ? "Authorise payments" : bookingId ? "Agree & confirm payments" : change ? "Agree & change card" : "Agree & add card"}
      </button>
      {bookingId && error ? <button className="my-lessons__change" onClick={() => { setError(""); setReview(null); setBookingConsent(false); setAttempt(value => value + 1); }} type="button">Review again</button> : null}
      {onCancel ? (
        <button className="my-lessons__change" disabled={busy} onClick={onCancel} type="button">Cancel</button>
      ) : null}
    </div>
  );

  /*
   * A payment approval link (27 October 2026, Dan: "simple and beautiful"),
   * in the booking confirm step's own words and marks: the lesson as its
   * time tile, then its dabs, then the agreement. On a wide card what is
   * agreed sits on the left and agreeing on the right.
   */
  if (bookingId) return (
    <div className="card-terms card-terms--approval">
      {!selected && !error ? <p role="status">Checking your lesson…</p> : null}
      {selected ? (
        <div className="card-terms__summary" id="card-terms-summary">
          <div aria-label="This lesson" className="booking-selection-summary card-terms__lesson" role="group">
            <AssetMark asset="/visuals/v2-splats/booking-availability-splat-v2.svg" className="booking-selection-summary__mark" />
            <span className="booking-choice-summary__copy">
              <strong>
                <span>{formatShortDay(selected.startAt)},</span> <span>{formatSlotTime(selected.startAt)}–{formatSlotTime(selected.endAt)}</span>
              </strong>
              <small>Porto time</small>
            </span>
            <b className="card-terms__price">{formatMoneyCents(selected.amountCents)}</b>
          </div>
          <ul className="booking-payment-facts">
            <li>
              This lesson is charged{review?.savedCardKey ? " to your saved card" : ""}{" "}
              {!chargedOnAgreement ? "an hour after it ends" : review?.savedCardKey ? "once you agree" : "once you add your card"}
            </li>
            <li>Future lessons are charged automatically, an hour after each one</li>
            {fee ? (
              <li>
                <strong>{formatMoneyCents(fee)}</strong> to move or cancel less than {notice} hours before, or if you don’t show up
              </li>
            ) : <li>No fee to move or cancel, or for a missed lesson</li>}
          </ul>
        </div>
      ) : null}
      <div className="card-terms__consent">
        {selected ? (
          <div className="booking-agreement card-terms__agreement">
            <div className={`booking-agreement__control${bookingConsent ? " is-agreed" : ""}`}>
              <button
                className="booking-agreement__button"
                type="button"
                aria-pressed={bookingConsent}
                aria-describedby="card-terms-summary"
                disabled={busy}
                onClick={() => setBookingConsent(value => !value)}
              >
                {bookingConsent ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                I authorise card payments for this and future lessons
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
        <li>Your upcoming lessons with Inês are charged to it, each one hour after it ends, at the price in your bookings</li>
        <li>Already paid Inês for some? Tell her before agreeing</li>
        <li>Stripe keeps your card safe</li>
        {fee ? <>
          <li>
            <strong>{formatMoneyCents(fee)}</strong> to move or cancel less than {notice} hours before
          </li>
          <li>
            <strong>{formatMoneyCents(fee)}</strong> if you don’t show up to a lesson
          </li>
        </> : <li>No fee to move or cancel, or for a missed lesson</li>}
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
 * hand: one quiet card above the calendar asking once, in her words.
 */
export function CardPrompt({ bookingId = "" }: { bookingId?: string }) {
  const [open, setOpen] = useState(Boolean(bookingId));
  return (
    <section aria-labelledby="card-prompt-heading" className={`card-prompt${bookingId && open ? " card-prompt--review" : ""}`}>
      <span aria-hidden="true" className="card-prompt__icon">
        <CreditCard size={20} />
      </span>
      <div className="card-prompt__body">
        <h3 id="card-prompt-heading">{bookingId ? "Confirm your card payments" : "Pay by card"}</h3>
        {bookingId ? null : <p>Add your card once and you&rsquo;re set.</p>}
        {open ? (
          <CardTerms key={bookingId} bookingId={bookingId} onCancel={() => setOpen(false)} />
        ) : (
          <button className="button button--blue button--compact" onClick={() => setOpen(true)} type="button">
            {bookingId ? "Review payments" : "Add card"}
          </button>
        )}
      </div>
    </section>
  );
}
