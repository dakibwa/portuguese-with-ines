"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { AdminBooking, AvailabilityException } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";
import { bookingSegments, dateBlocks, dateLabel, mergeSpans, minuteLabel, mondayOf, parseMinute, type Span } from "@/lib/teacher-calendar";

/**
 * Some hours off on one day: one or more breaks, in Porto time. A whole day
 * off is the card's own button, so this asks only for the hours. Nothing is
 * saved until she presses Save.
 */
export function TimeOffDayDialog({ date, exceptions, bookings, onSave, onClose }: {
  date: string;
  exceptions: AvailabilityException[];
  bookings: AdminBooking[];
  onSave: (date: string, change: { dayOff: boolean; blocks?: Span[] }) => Promise<void>;
  onClose: () => void;
}) {
  const blocks = dateBlocks(exceptions, date);
  const [times, setTimes] = useState(() => (blocks.length ? blocks : [{ start: 540, end: 600 }]).map(block => ({ from: minuteLabel(block.start), until: block.end === 1440 ? "00:00" : minuteLabel(block.end) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdrop = useDialogBackdrop(() => { if (!busy) onClose(); });
  const spans = times.map(time => ({ start: parseMinute(time.from), end: time.until === "00:00" ? 1440 : parseMinute(time.until) }));
  const valid = spans.length > 0 && spans.every(span => Number.isFinite(span.start) && Number.isFinite(span.end) && span.start < span.end && span.start < 1440 && span.end <= 1440);
  const overlap = valid ? bookingSegments(bookings.filter(booking => booking.status === "confirmed"), mondayOf(date)).filter(segment => segment.date === date &&
    spans.some(span => span.start < segment.end && segment.start < span.end)) : [];

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); releaseScroll(); restoreDialogFocus(previous); };
  }, []);

  async function save(remove = false) {
    if (busy) return;
    if (!remove && !valid) {
      setError("Each break needs a start and a later end.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSave(date, remove ? { dayOff: false, blocks: [] } : { dayOff: false, blocks: mergeSpans(spans) });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Time off couldn’t be saved. Please try again.");
    } finally { setBusy(false); }
  }

  const edit = (index: number, field: "from" | "until", value: string) =>
    setTimes(current => current.map((row, position) => position === index ? { ...row, [field]: value } : row));

  return (
    <dialog className="teacher-lesson-dialog teacher-timeoff-dialog" ref={dialogRef} {...backdrop} aria-labelledby="teacher-dayoff-title" onKeyDown={keepDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
      <button className="teacher-dialog-close" aria-label="Close hours off" type="button" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      <p className="teacher-eyebrow">Hours off · Porto time</p>
      <h2 id="teacher-dayoff-title">{dateLabel(date, { weekday: "short", day: "numeric", month: "long" })}</h2>
      <form className="teacher-form" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="teacher-timeoff-times">
          {times.map((time, index) => <div className="teacher-timeoff-time" key={index}>
            <label><span>From</span><input aria-label={`From ${index + 1}`} disabled={busy} type="time" value={time.from} onChange={event => edit(index, "from", event.target.value)} /></label>
            <label><span>Until</span><input aria-label={`Until ${index + 1}`} disabled={busy} type="time" value={time.until} onChange={event => edit(index, "until", event.target.value)} /></label>
            <button className="teacher-icon-button" type="button" aria-label={`Remove break ${index + 1}`} disabled={busy || times.length === 1} onClick={() => setTimes(current => current.filter((_, position) => position !== index))}><Trash2 size={16} aria-hidden="true" /></button>
          </div>)}
          <button className="teacher-text-button" disabled={busy} onClick={() => setTimes(current => [...current, { from: "14:00", until: "15:00" }])} type="button"><Plus size={15} aria-hidden="true" />Add another break</button>
        </div>
        {overlap.length ? (
          <ul className="booking-payment-facts teacher-timeoff-facts" role="status">
            {overlap.map(({ booking }) => <li className="teacher-timeoff-booked" key={booking.id}><strong>{booking.student_name}</strong>’s lesson at {formatSlotTime(booking.starts_at)} stays booked</li>)}
          </ul>
        ) : null}
        {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
        <div className="teacher-dialog-actions">
          <button className="button button--coral" disabled={busy} type="submit">{busy ? "Saving…" : "Save hours off"}</button>
          {blocks.length ? (
            <button className="button button--outline" disabled={busy} onClick={() => void save(true)} type="button">Remove hours off</button>
          ) : (
            <button className="button button--outline" disabled={busy} onClick={onClose} type="button">Cancel</button>
          )}
        </div>
      </form>
    </dialog>
  );
}
