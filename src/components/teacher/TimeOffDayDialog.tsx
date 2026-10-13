"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { AdminBooking, AvailabilityException } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";
import { bookingSegments, dateBlocks, dateLabel, daysOff, mergeSpans, minuteLabel, mondayOf, parseMinute, type Span } from "@/lib/teacher-calendar";

export function TimeOffDayDialog({ date, exceptions, bookings, bookingsLoading, bookingsError, onReloadBookings, onSave, onClose }: {
  date: string;
  exceptions: AvailabilityException[];
  bookings: AdminBooking[];
  bookingsLoading: boolean;
  bookingsError: string;
  onReloadBookings: () => void;
  onSave: (date: string, change: { dayOff: boolean; blocks?: Span[] }) => Promise<void>;
  onClose: () => void;
}) {
  const blocks = dateBlocks(exceptions, date);
  const hasDayOff = daysOff(exceptions).has(date);
  const [mode, setMode] = useState<"day" | "times">(hasDayOff || !blocks.length ? "day" : "times");
  const [times, setTimes] = useState(() => (blocks.length ? blocks : [{ start: 540, end: 600 }]).map(block => ({ from: minuteLabel(block.start), until: block.end === 1440 ? "00:00" : minuteLabel(block.end) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdrop = useDialogBackdrop(() => { if (!busy) onClose(); });
  const spans = times.map(time => ({ start: parseMinute(time.from), end: time.until === "00:00" ? 1440 : parseMinute(time.until) }));
  const valid = spans.length > 0 && spans.every(span => Number.isFinite(span.start) && Number.isFinite(span.end) && span.start < span.end && span.start < 1440 && span.end <= 1440);
  const overlap = bookingSegments(bookings.filter(booking => booking.status === "confirmed"), mondayOf(date)).filter(segment => segment.date === date &&
    (mode === "day" || (valid && spans.some(span => span.start < segment.end && segment.start < span.end))));

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); releaseScroll(); restoreDialogFocus(previous); };
  }, []);

  async function save(remove = false) {
    if (busy || bookingsLoading || bookingsError) return;
    if (!remove && mode === "times" && !valid) {
      setError("Enter a start and a later end time for each break.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSave(date, remove ? { dayOff: false, blocks: [] } : mode === "day" ? { dayOff: true } : { dayOff: false, blocks: mergeSpans(spans) });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Time off couldn’t be saved. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <dialog className="teacher-lesson-dialog teacher-timeoff-dialog" ref={dialogRef} {...backdrop} aria-labelledby="teacher-dayoff-title" onKeyDown={keepDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
      <button className="teacher-dialog-close" aria-label="Close time off" type="button" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      <h2 id="teacher-dayoff-title">{dateLabel(date, { weekday: "short", day: "numeric", month: "long" })}</h2>
      <form className="teacher-form" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset className="teacher-timeoff-options" disabled={busy}>
          <legend className="visually-hidden">Time off</legend>
          <label><input checked={mode === "day"} name="time-off-mode" onChange={() => setMode("day")} type="radio" />Full day off</label>
          <label><input checked={mode === "times"} name="time-off-mode" onChange={() => setMode("times")} type="radio" />Specific times</label>
        </fieldset>
        {mode === "times" ? <div className="teacher-timeoff-times">
          <p className="teacher-secondary-copy">Porto time · 00:00 ends the day</p>
          {times.map((time, index) => <div className="teacher-timeoff-time" key={index}>
            <label><span>From</span><input aria-label={`From ${index + 1}`} disabled={busy} type="time" value={time.from} onChange={event => setTimes(current => current.map((row, position) => position === index ? { ...row, from: event.target.value } : row))} /></label>
            <label><span>Until</span><input aria-label={`Until ${index + 1}`} disabled={busy} type="time" value={time.until} onChange={event => setTimes(current => current.map((row, position) => position === index ? { ...row, until: event.target.value } : row))} /></label>
            <button className="teacher-icon-button" type="button" aria-label={`Remove break ${index + 1}`} disabled={busy || times.length === 1} onClick={() => setTimes(current => current.filter((_, position) => position !== index))}><Trash2 size={16} aria-hidden="true" /></button>
          </div>)}
          <button className="teacher-text-button" disabled={busy} onClick={() => setTimes(current => [...current, { from: "14:00", until: "15:00" }])} type="button"><Plus size={15} aria-hidden="true" />Add another break</button>
        </div> : null}
        {bookingsLoading ? <p role="status">Checking booked lessons…</p> : bookingsError ? <div className="teacher-inline-error" role="alert"><p>Booked lessons could not be checked.</p><button className="teacher-text-button" onClick={onReloadBookings} type="button">Try again</button></div> : overlap.length ? <div className="teacher-timeoff-booked" role="status"><p>{overlap.length === 1 ? "1 lesson overlaps. It stays" : `${overlap.length} lessons overlap. They stay`} booked.</p><ul>{overlap.map(({ booking }) => <li key={booking.id}>{booking.student_name} · {formatSlotTime(booking.starts_at)}–{formatSlotTime(booking.ends_at)}</li>)}</ul></div> : null}
        {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
        <div className="teacher-dialog-actions"><button className="button button--coral" disabled={busy || bookingsLoading || Boolean(bookingsError)} type="submit">{busy ? "Saving…" : "Save time off"}</button><button className="button button--outline" disabled={busy} onClick={onClose} type="button">Cancel</button></div>
        {hasDayOff || blocks.length ? <button className="teacher-text-button" disabled={busy || bookingsLoading || Boolean(bookingsError)} onClick={() => void save(true)} type="button">Remove time off</button> : null}
      </form>
    </dialog>
  );
}
