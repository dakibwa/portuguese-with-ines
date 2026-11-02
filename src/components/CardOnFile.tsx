"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, CreditCard, Repeat } from "lucide-react";
import { AssetMark } from "@/components/BrandMarks";
import { openCardPage, previewCardBooking, readSession, type CardBooking } from "@/lib/auth-api";
import { NOTICE_HOURS, SAME_DAY_RESCHEDULE_FEE_CENTS } from "@/lib/config";
import { formatMoneyCents, formatShortDay, formatSlotTime } from "@/lib/booking-api";

/** Each lesson's tile its own mark, as the booking step's chosen lessons have. */
const LESSON_MARKS = [
  "/visuals/v2-splats/booking-availability-splat-v2.svg",
  "/visuals/v2-splats/in-porto-or-online-splat-v2.svg",
  "/visuals/v2-splats/one-to-one-splat-v2.svg",
  "/visuals/v2-splats/real-life-splat-v2.svg",
];

/**
 * The change and no-show rule as two dabs, what is free first (2 November
 * 2026, Dan: the same words across the site). `noShow` false leaves out the
 * no-show, where nothing charges a card for one.
 */
export function FeeFacts({ feeCents, noticeHours, noShow = true }: { feeCents: number; noticeHours: number; noShow?: boolean }) {
  if (!feeCents) return <li>No fee to change or cancel{noShow ? ", or for a missed lesson" : ""}</li>;
  return <>
    <li><strong className="is-free">Free</strong> to change or cancel a lesson up to {noticeHours} hours before</li>
    <li><strong>{formatMoneyCents(feeCents)}</strong> to move or cancel later{noShow ? ", or if you don’t show up" : ""}</li>
  </>;
}

/** Lessons still to come that the agreement will pay for: one weekly run, or one lesson, with the starts it covers. */
export type CardUpcoming = { key: string; when: string; amountCents: number; weekly: boolean; startAts: string[] };

/**
 * Saving a card from the account (12 October 2026, Dan): how a student Inês
 * brought onto the site pays for the lessons she adds. The terms are the same
 * short list a booking shows, and pressing the button is the agreement; the
 * card itself is entered on Stripe's page.
 */
export function CardTerms({ change = false, onCancel, bookingId = "", upcoming = [], feeCents = SAME_DAY_RESCHEDULE_FEE_CENTS, noticeHours = NOTICE_HOURS }: {
  change?: boolean; onCancel?: () => void;
  /** The lessons a payment approval link names, comma-separated. */
  bookingId?: string;
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
  // Whether each lesson's usual hour after it ends has passed, so agreeing
  // is what lets it be charged: all of them, some or none.
  const [chargedOnAgreement, setChargedOnAgreement] = useState<"all" | "some" | "none">("none");
  // What agreeing charges straight away: the lessons whose hour has passed.
  const [dueNowCents, setDueNowCents] = useState(0);
  useEffect(() => {
    if (!bookingId) return;
    let active = true;
    const session = readSession();
    void previewCardBooking(session, bookingId.split(",")).then(data => {
      if (!active || readSession() !== session) return;
      setReview(data);
      const ended = data.bookings.filter(booking => Date.parse(booking.endAt) + 60 * 60 * 1000 <= Date.now());
      setChargedOnAgreement(ended.length === data.bookings.length ? "all" : ended.length ? "some" : "none");
      setDueNowCents(ended.reduce((sum, booking) => sum + booking.amountCents, 0));
    }).catch(caught => {
      if (active && readSession() === session) setError(caught instanceof Error ? caught.message : "We couldn’t check this lesson. Please try again.");
    });
    return () => { active = false; };
  }, [bookingId, attempt]);
  const selected = review?.bookings[0];
  const lessons = review?.bookings ?? [];
  const several = lessons.length > 1;
  // A future lesson the link names is paid now, so it is not listed again.
  const paidNow = new Set(lessons.map(lesson => lesson.startAt));
  const then = upcoming.filter(entry => entry.startAts.some(start => !paidNow.has(start))).slice(0, 3);
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
      const result = await openCardPage(session, lessons, review?.savedCardKey);
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
      {bookingId && error ? <button className="my-lessons__change" onClick={() => { setError(""); setReview(null); setBookingConsent(false); setAttempt(value => value + 1); }} type="button">Try again</button> : null}
      {onCancel ? (
        <button className="my-lessons__change" disabled={busy} onClick={onCancel} type="button">{bookingId ? "Not now" : "Cancel"}</button>
      ) : null}
    </div>
  );

  // One line each, the day and start (2 November 2026, Dan: "always fits on
  // the same line"); Porto time is named once, over the list.
  const tile = (lesson: CardBooking, index: number) => (
    <div aria-label={several ? `Lesson ${index + 1}` : "This lesson"} className="booking-selection-summary card-terms__lesson" role="group">
      <AssetMark asset={LESSON_MARKS[index % LESSON_MARKS.length]} className="booking-selection-summary__mark" />
      <strong className="card-terms__when">{formatShortDay(lesson.startAt)}, {formatSlotTime(lesson.startAt)}</strong>
      <b className="card-terms__price">{formatMoneyCents(lesson.amountCents)}</b>
    </div>
  );

  /*
   * A payment approval link (27 October 2026, Dan: "simple and beautiful"),
   * in the booking confirm step's own words and marks: what is paid now as
   * the booking step's time tiles with their total, then what is paid
   * automatically from then on (2 November 2026, Dan: make it obvious it
   * covers their weekly lessons too), then the dabs and the agreement. On a
   * wide card what is agreed sits on the left and agreeing on the right.
   */
  if (bookingId) return (
    <div className="card-terms card-terms--approval">
      {!selected && !error ? <p role="status">Checking your lessons…</p> : null}
      {selected ? (
        <div className="card-terms__summary" id="card-terms-summary">
          <section aria-labelledby="card-terms-now" className="card-terms__lessons">
            <p className="card-terms__label"><span id="card-terms-now">{chargedOnAgreement === "none" ? "To pay" : "To pay now"}</span><small>Porto time</small></p>
            <ol className="booking-chosen-lessons">
              {lessons.map((lesson, index) => <li key={lesson.id}>{tile(lesson, index)}</li>)}
            </ol>
            {several ? (
              <p className="card-terms__total">
                <span>Total</span>
                <b className="card-terms__price">{formatMoneyCents(lessons.reduce((sum, lesson) => sum + lesson.amountCents, 0))}</b>
              </p>
            ) : null}
          </section>
          {then.length ? (
            <section aria-labelledby="card-terms-then" className="card-terms__lessons card-terms__lessons--then">
              <p className="card-terms__label"><span id="card-terms-then">Then automatically</span></p>
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
          {/* In Dan's words (2 November 2026): what is charged now, worked
              out from the lessons shown; then later lessons; then what is
              free and what costs the fee. "Now" is the hourly charge, so
              within the hour; a lesson whose hour has not passed yet waits
              for it. */}
          <ul className="booking-payment-facts">
            <li>
              {chargedOnAgreement === "none"
                ? several ? "These lessons are charged after each one" : "This lesson is charged after it ends"
                : <>You&rsquo;ll be charged <strong>{formatMoneyCents(dueNowCents)}</strong> now{chargedOnAgreement === "some"
                  ? ", and the rest after each lesson" : several ? " for your outstanding lessons" : " for this lesson"}</>}
            </li>
            <li>Future lessons are charged after each lesson</li>
            <FeeFacts feeCents={fee} noticeHours={notice} />
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
                I authorise card payments for {several ? "these" : "this"} and future lessons
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
        <li>Future lessons are charged after each lesson</li>
        <li>Already paid Inês for some? Tell her before agreeing</li>
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
 * hand: one quiet card above the calendar asking once, in her words.
 */
export function CardPrompt({ bookingId = "", upcoming = [] }: { bookingId?: string; upcoming?: CardUpcoming[] }) {
  const [open, setOpen] = useState(Boolean(bookingId));
  return (
    <section aria-labelledby="card-prompt-heading" className={`card-prompt${open ? " card-prompt--open" : ""}${bookingId && open ? " card-prompt--review" : ""}`}>
      <span aria-hidden="true" className="card-prompt__icon">
        <CreditCard size={20} />
      </span>
      <div className="card-prompt__body">
        <h3 id="card-prompt-heading">{bookingId ? "Confirm your card payments" : "Pay by card"}</h3>
        {bookingId ? null : <p>Add your card once and you&rsquo;re set.</p>}
        {open ? (
          <CardTerms key={bookingId} bookingId={bookingId} upcoming={upcoming} onCancel={() => setOpen(false)} />
        ) : (
          <button className="button button--blue button--compact" onClick={() => setOpen(true)} type="button">
            {bookingId ? "Review payments" : "Add card"}
          </button>
        )}
      </div>
    </section>
  );
}
