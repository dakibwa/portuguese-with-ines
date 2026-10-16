"use client";

import { useState } from "react";
import { AccountAvatar } from "@/components/AccountMenu";
import { addStudent, type AdminStudent } from "@/lib/admin-api";
import { STUDENT_MARKS } from "@/lib/student-marks";
import { PRICE_RANGE_ERROR, PriceFields, pricesFromDraft, type PriceDraft } from "@/components/teacher/StudentPrice";

/**
 * A new student's details, in the profile's own form: a name is enough to
 * start, the rest can follow (13 October 2026, Dan). Nothing is emailed by
 * this; their price is set from the start so their welcome finds them on it
 * with no code to type. Saving lands on their profile, ready for lessons.
 */
export function NewStudentForm({ token, onBusy, onAdded, onCancel, cancelLabel }: {
  token: string;
  onBusy: (busy: boolean) => void;
  onAdded: (student: AdminStudent) => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const [details, setDetails] = useState({ email: "", name: "", phone: "", nif: "", mark: "" });
  const [prices, setPrices] = useState<PriceDraft>({ 60: "", 90: "" });
  const [busy, setBusyState] = useState(false);
  const [error, setError] = useState("");
  const setBusy = (value: boolean) => {
    setBusyState(value);
    onBusy(value);
  };
  const set = (field: keyof typeof details) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDetails((current) => ({ ...current, [field]: event.target.value }));

  return (
    <>
      <ul className="booking-payment-facts teacher-profile__facts">
        <li>Their details now, their lessons next</li>
        <li>Nothing is emailed until you send their welcome</li>
      </ul>
      <form
        className="teacher-form teacher-profile__form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const agreed = pricesFromDraft(prices, { keepEmpty: false });
          if (!agreed) {
            setError(PRICE_RANGE_ERROR);
            return;
          }
          setBusy(true);
          setError("");
          try {
            const result = await addStudent(token, {
              email: details.email.trim(),
              name: details.name.trim(),
              phone: details.phone.trim(),
              nif: details.nif.trim(),
              mark: details.mark,
              prices: agreed,
            });
            onAdded(result.student);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The student couldn’t be added.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          <span>Full name</span>
          <input autoComplete="off" disabled={busy} onChange={set("name")} required type="text" value={details.name} />
        </label>
        {/* A name is enough to start; she can add the rest later (13 October 2026, Dan). */}
        <label>
          <span>Email <span className="teacher-field-optional">(optional, their welcome needs one)</span></span>
          <input autoComplete="off" disabled={busy} onChange={set("email")} type="email" value={details.email} />
        </label>
        <label>
          <span>Phone <span className="teacher-field-optional">(optional)</span></span>
          <input autoComplete="off" disabled={busy} onChange={set("phone")} type="tel" value={details.phone} />
        </label>
        <label>
          <span>NIF <span className="teacher-field-optional">(optional, for receipts)</span></span>
          <input autoComplete="off" disabled={busy} inputMode="numeric" onChange={set("nif")} type="text" value={details.nif} />
        </label>
        <fieldset className="teacher-profile__price">
          <legend>Their price <span className="teacher-field-optional">(optional, per lesson)</span></legend>
          <PriceFields draft={prices} disabled={busy} idPrefix="teacher-student-price" onChange={setPrices} />
        </fieldset>
        <div className="teacher-profile__splat">
          <span id="teacher-student-splat">Their splat <span className="teacher-field-optional">(optional)</span></span>
          <div aria-labelledby="teacher-student-splat" className="my-lessons__marks" role="group">
            {[{ id: "", label: "Their initial" }, ...STUDENT_MARKS].map((choice) => (
              <button
                aria-label={choice.label}
                aria-pressed={details.mark === choice.id}
                className="my-lessons__mark"
                disabled={busy}
                key={choice.id || "initial"}
                onClick={() => setDetails((current) => ({ ...current, mark: choice.id }))}
                type="button"
              >
                <AccountAvatar mark={choice.id} name={details.name.trim() || "?"} />
              </button>
            ))}
          </div>
        </div>
        <div className="teacher-dialog-actions">
          <button className="button button--coral" disabled={busy} type="submit">{busy ? "Adding…" : "Next: their lessons"}</button>
          <button className="button button--outline" disabled={busy} onClick={onCancel} type="button">{cancelLabel}</button>
        </div>
        {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
      </form>
    </>
  );
}
