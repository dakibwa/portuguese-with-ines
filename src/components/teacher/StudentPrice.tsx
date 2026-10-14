"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { setStudentPrices, type AdminStudent, type StudentPrices } from "@/lib/admin-api";
import { formatMoneyCents } from "@/lib/booking-api";
import { lessonProducts } from "@/lib/lesson-products";

const LENGTHS = [60, 90] as const;
type Length = (typeof LENGTHS)[number];
export type PriceDraft = Record<Length, string>;

/** The price anyone pays for a length unless Inês has set them their own. */
export function standardPrice(minutes: Length) {
  return lessonProducts.find((product) => product.id !== "trial" && product.durationMinutes === minutes)?.priceCents ?? 0;
}

/** A student's price for a length, theirs or the standard one. */
export function priceFor(student: Pick<AdminStudent, "prices"> | null | undefined, minutes: Length) {
  return student?.prices?.[minutes] ?? standardPrice(minutes);
}

export function priceDraft(student?: Pick<AdminStudent, "prices" | "ownPrices"> | null): PriceDraft {
  const euros = (minutes: Length) => {
    const cents = (student?.ownPrices ?? student?.prices)?.[minutes];
    return cents === undefined ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0);
  };
  return { 60: euros(60), 90: euros(90) };
}

/**
 * Euros as typed ("20", "22,50") to cents per length; an empty field is the
 * standard price. `null` when a field cannot be read.
 */
export function pricesFromDraft(draft: PriceDraft, { keepEmpty }: { keepEmpty: boolean }): StudentPrices | null {
  const prices: StudentPrices = {};
  for (const minutes of LENGTHS) {
    const text = draft[minutes].trim().replace(",", ".").replace(/^€\s*/, "");
    if (!text) {
      if (keepEmpty) prices[minutes] = null;
      continue;
    }
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
    const cents = Math.round(Number(text) * 100);
    if (cents < 100 || cents > 10000) return null;
    prices[minutes] = cents;
  }
  return prices;
}

/** What a typed price reads as in cents, or null. */
function typedCents(text: string) {
  const value = text.trim().replace(",", ".").replace(/^€\s*/, "");
  return /^\d{1,3}(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : null;
}

const euroText = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);

/**
 * Two fields side by side, the standard price showing until she types her
 * own; once she types a 60-minute price the 90-minute field shows 1.5 times
 * it, which is what an empty 90 means (13 October 2026, Dan).
 */
export function PriceFields({ draft, disabled, idPrefix, onChange }: {
  draft: PriceDraft;
  disabled?: boolean;
  idPrefix: string;
  onChange: (draft: PriceDraft) => void;
}) {
  return (
    <div className="teacher-price-fields">
      {LENGTHS.map((minutes) => (
        <label key={minutes}>
          <span>{minutes} mins</span>
          <span className="teacher-price-input">
            <span aria-hidden="true">€</span>
            <input
              aria-label={`Price for ${minutes} minutes, in euros`}
              autoComplete="off"
              disabled={disabled}
              id={`${idPrefix}-${minutes}`}
              inputMode="decimal"
              onChange={(event) => onChange({ ...draft, [minutes]: event.target.value })}
              placeholder={minutes === 90 && typedCents(draft[60]) ? euroText(Math.round(typedCents(draft[60])! * 1.5)) : euroText(standardPrice(minutes))}
              type="text"
              value={draft[minutes]}
            />
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Her price for one student, in their profile (13 October 2026, Dan): it
 * prices every lesson of theirs at that length, and lessons to come that
 * nothing is settled on follow it.
 */
export function StudentPrice({ token, student, onChanged, startEditing = false, idPrefix = "teacher-price", labelledBy, onBusy, onCancel }: {
  token: string;
  student: AdminStudent;
  onChanged: (student: AdminStudent) => void;
  startEditing?: boolean;
  idPrefix?: string;
  labelledBy?: string;
  onBusy?: (busy: boolean) => void;
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState<PriceDraft>(() => priceDraft(student));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function save() {
    if (busy) return;
    const prices = pricesFromDraft(draft, { keepEmpty: true });
    if (!prices) {
      setError("Each price needs to be between €1 and €100.");
      return;
    }
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const result = await setStudentPrices(token, student.id, prices);
      onChanged(result.student);
      setEditing(false);
      setSaved(result.updated
        ? `Saved. ${result.updated} ${result.updated === 1 ? "lesson" : "lessons"} to come ${result.updated === 1 ? "is" : "are"} on the new price.`
        : "Saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The price couldn’t be saved.");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  return (
    <section className="teacher-price" aria-labelledby={labelledBy ?? `${idPrefix}-title`}>
      {!labelledBy ? <h3 id={`${idPrefix}-title`}>Their price</h3> : null}
      {editing ? (
        <form className="teacher-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <PriceFields draft={draft} disabled={busy} idPrefix={idPrefix} onChange={setDraft} />
          <p className="teacher-price__hint">Leave 90 mins empty for 1.5× their 60, or both for the standard price.</p>
          <div className="teacher-dialog-actions">
            <button className="button button--coral button--compact" disabled={busy} type="submit">{busy ? "Saving…" : "Save price"}</button>
            <button className="button button--outline button--compact" disabled={busy} onClick={() => { setEditing(false); setDraft(priceDraft(student)); setError(""); onCancel?.(); }} type="button">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="teacher-price__view">
          <ul className="booking-payment-facts teacher-price__facts">
            {LENGTHS.map((minutes) => (
              <li key={minutes}>
                {minutes} mins · <strong>{formatMoneyCents(priceFor(student, minutes))}</strong>
                {student.prices?.[minutes] === undefined
                  ? " · standard"
                  : minutes === 90 && student.ownPrices && student.ownPrices[90] === undefined ? " · 1.5× their 60" : ""}
              </li>
            ))}
          </ul>
          <button className="button button--lilac button--compact" onClick={() => { setEditing(true); setSaved(""); }} type="button">Change price</button>
        </div>
      )}
      {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
      {saved ? <p className="teacher-inline-success" role="status"><CheckCircle2 size={18} aria-hidden="true" />{saved}</p> : null}
    </section>
  );
}
