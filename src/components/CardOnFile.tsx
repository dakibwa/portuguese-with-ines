"use client";

import { useState } from "react";
import { AlertCircle, CreditCard } from "lucide-react";
import { openCardPage, readSession } from "@/lib/auth-api";
import { NOTICE_HOURS, SAME_DAY_RESCHEDULE_FEE_CENTS } from "@/lib/config";
import { formatMoneyCents } from "@/lib/booking-api";

/**
 * Saving a card from the account (12 October 2026, Dan): how a student Inês
 * brought onto the site pays for the lessons she adds. The terms are the same
 * short list a booking shows, and pressing the button is the agreement; the
 * card itself is entered on Stripe's page.
 */
export function CardTerms({ change = false, onCancel }: { change?: boolean; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setBusy(true);
    setError("");
    try {
      window.location.assign(await openCardPage(readSession()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t open the card form just now. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="card-terms">
      <ul className="booking-payment-facts" id="card-terms-summary">
        <li>Paid after each lesson</li>
        <li>Stripe keeps your card safe</li>
        <li>
          <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong> to move or cancel less than {NOTICE_HOURS} hours before
        </li>
        <li>
          <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong> if you miss a lesson
        </li>
        <li>
          The full rules are in{" "}
          <a aria-haspopup="dialog" data-terms-privacy href="#terms-privacy">terms &amp; privacy</a>
        </li>
      </ul>
      {error ? (
        <div className="booking-alert booking-alert--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}
      <div className="my-lessons__edit-actions">
        <button
          aria-describedby="card-terms-summary"
          className="button button--coral"
          disabled={busy}
          onClick={() => void open()}
          type="button"
        >
          {busy ? "Opening…" : change ? "Agree & change card" : "Agree & add card"}
        </button>
        {onCancel ? (
          <button className="my-lessons__change" disabled={busy} onClick={onCancel} type="button">Cancel</button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * On Your lessons, only while lessons Inês added are still paid to her by
 * hand: one quiet card above the calendar asking once, in her words.
 */
export function CardPrompt() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="card-prompt-heading" className="card-prompt">
      <span aria-hidden="true" className="card-prompt__icon">
        <CreditCard size={20} />
      </span>
      <div className="card-prompt__body">
        <h3 id="card-prompt-heading">Pay by card</h3>
        <p>Add your card once. Each lesson is paid after it ends.</p>
        {open ? (
          <CardTerms onCancel={() => setOpen(false)} />
        ) : (
          <button className="button button--blue button--compact" onClick={() => setOpen(true)} type="button">
            Add card
          </button>
        )}
      </div>
    </section>
  );
}
