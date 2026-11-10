"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { EditActions, EditValue } from "@/components/teacher/EditControls";
import { setStudentPrices, type AdminStudent, type StudentPrices } from "@/lib/admin-api";
import { formatPriceCents } from "@/lib/booking-api";
import { lessonProducts } from "@/lib/lesson-products";

const LENGTHS = [60, 90] as const;
type Length = (typeof LENGTHS)[number];
export type PriceDraft = Record<Length, string>;

/** What a price that can't be read is told, wherever she types one. */
export const PRICE_RANGE_ERROR = "Each price needs to be €0 (free) or between €1 and €100.";

/** The price anyone pays for a length unless Inês has set them their own. */
export function standardPrice(minutes: Length) {
  return lessonProducts.find((product) => product.id !== "trial" && product.durationMinutes === minutes)?.priceCents ?? 0;
}

/** A student's price for a length, theirs or the standard one. */
export function priceFor(student: Pick<AdminStudent, "prices"> | null | undefined, minutes: Length) {
  return student?.prices?.[minutes] ?? standardPrice(minutes);
}

/** One length as it reads in their profile, with how it came about where it isn't a price she typed. */
export function priceLabel(student: Pick<AdminStudent, "prices" | "ownPrices">, minutes: Length) {
  const price = formatPriceCents(priceFor(student, minutes));
  if (student.prices?.[minutes] === undefined) return `${minutes} mins · ${price} · standard`;
  if (minutes === 90 && student.ownPrices && student.ownPrices[90] === undefined) {
    return `${minutes} mins · ${price} · ${student.prices[90] === 0 ? "as their 60" : "1.5× their 60"}`;
  }
  return `${minutes} mins · ${price}`;
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
 * standard price and 0 is free (16 October 2026). `null` when a field cannot
 * be read.
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
    if (cents !== 0 && (cents < 100 || cents > 10000)) return null;
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
export function PriceFields({ draft, disabled, idPrefix, invalid, onChange }: {
  draft: PriceDraft;
  disabled?: boolean;
  idPrefix: string;
  /** The price couldn't be read; its message carries `${idPrefix}-error`. */
  invalid?: boolean;
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
              aria-describedby={invalid ? `${idPrefix}-error` : undefined}
              aria-invalid={invalid || undefined}
              aria-label={`Price for ${minutes} minutes, in euros`}
              autoComplete="off"
              disabled={disabled}
              id={`${idPrefix}-${minutes}`}
              inputMode="decimal"
              name={`price-${minutes}`}
              onChange={(event) => onChange({ ...draft, [minutes]: event.target.value })}
              placeholder={minutes === 90 && typedCents(draft[60]) !== null ? euroText(Math.round(typedCents(draft[60])! * 1.5)) : euroText(standardPrice(minutes))}
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
 * Her price for one student, in their profile's Price row (13 October 2026,
 * Dan): it prices every lesson of theirs at that length, and lessons to come
 * that nothing is settled on follow it. Each length's pencil opens both
 * fields right there, on its own (10 November 2026).
 */
export function StudentPrice({ token, student, onChanged, idPrefix = "teacher-price", labelledBy, disabled, onBusy }: {
  token: string;
  student: AdminStudent;
  onChanged: (student: AdminStudent) => void;
  idPrefix?: string;
  /** The row's label. */
  labelledBy: string;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [editing, setEditing] = useState<Length | null>(null);
  const [draft, setDraft] = useState<PriceDraft>(() => priceDraft(student));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const section = useRef<HTMLElement>(null);
  // Opened from its pencil, the price field takes focus; saved or cancelled,
  // focus goes back to that pencil rather than to the page.
  const back = useRef<Length | null>(null);
  useEffect(() => {
    if (editing) document.getElementById(`${idPrefix}-${editing}`)?.focus();
    else if (back.current) section.current?.querySelector<HTMLElement>(`[data-edit="price-${back.current}"]`)?.focus();
    if (!editing) back.current = null;
  }, [editing, idPrefix]);
  const close = () => { back.current = editing; setEditing(null); setDraft(priceDraft(student)); setError(""); };

  async function save() {
    if (busy) return;
    const prices = pricesFromDraft(draft, { keepEmpty: true });
    if (!prices) {
      setError(PRICE_RANGE_ERROR);
      return;
    }
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const result = await setStudentPrices(token, student.id, prices);
      onChanged(result.student);
      back.current = editing;
      setEditing(null);
      const lessons = (count: number) => `${count} ${count === 1 ? "lesson" : "lessons"}`;
      setSaved([
        "Saved.",
        result.updated ? `${lessons(result.updated)} to come ${result.updated === 1 ? "is" : "are"} on the new price.` : "",
        // A price raised from free reaches lessons booked from now on only.
        result.stayFree ? `${lessons(result.stayFree)} already booked free ${result.stayFree === 1 ? "stays" : "stay"} free.` : "",
      ].filter(Boolean).join(" "));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The price couldn’t be saved.");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  return (
    <section className="teacher-price" ref={section} aria-labelledby={labelledBy}>
      {editing ? (
        <form className="teacher-form" noValidate onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); close(); } }} onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="teacher-price__row">
            <PriceFields draft={draft} disabled={busy} idPrefix={idPrefix} invalid={error === PRICE_RANGE_ERROR} onChange={setDraft} />
            <EditActions busy={busy} onCancel={close} saveLabel="Save price" />
          </div>
          <p className="teacher-price__hint">Empty is the standard price, and an empty 90 follows their 60. 0 is free, with no card needed.</p>
        </form>
      ) : (
        LENGTHS.map((minutes) => <EditValue disabled={disabled} field={`price-${minutes}`} key={minutes} label={`Change ${minutes}-minute price for ${student.name}`}
          onEdit={() => { setDraft(priceDraft(student)); setEditing(minutes); setSaved(""); }}>{priceLabel(student, minutes)}</EditValue>)
      )}
      {error ? <p className="teacher-inline-error" id={`${idPrefix}-error`} role="alert">{error}</p> : null}
      {saved ? <p className="teacher-inline-success" role="status"><CheckCircle2 size={18} aria-hidden="true" />{saved}</p> : null}
    </section>
  );
}
