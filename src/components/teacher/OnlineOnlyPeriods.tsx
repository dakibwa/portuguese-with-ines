"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Globe, Plus, Trash2, X } from "lucide-react";
import type { OnlineOnlyPeriod } from "@/lib/admin-api";
import { HOME_CLOCK } from "@/lib/tutor";
import { dateLabel, minuteLabel, parseMinute } from "@/lib/teacher-calendar";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";

type Props = {
  today: string;
  periods: OnlineOnlyPeriod[];
  onSave: (periods: OnlineOnlyPeriod[]) => Promise<void>;
};

export function OnlineOnlyPeriods({ today, periods, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const current = periods.filter(period => period.toDate >= today);
  return <div className="teacher-online-only-control">
    <button className="button button--outline button--small" type="button" onClick={() => setOpen(true)}>
      <Globe size={15} aria-hidden="true" />Online only{current.length ? ` · ${current.length}` : ""}
    </button>
    {current.length ? <span>{current.length === 1
      ? `${dateLabel(current[0].fromDate, { day: "numeric", month: "short" })}${current[0].toDate === current[0].fromDate ? "" : ` – ${dateLabel(current[0].toDate, { day: "numeric", month: "short" })}`} · ${current[0].startMinute === 0 && current[0].endMinute === 1440 ? "All day" : `${minuteLabel(current[0].startMinute)}–${current[0].endMinute === 1440 ? "00:00" : minuteLabel(current[0].endMinute)}`}`
      : "Online-only periods set"}</span> : null}
    {open ? <PeriodsDialog today={today} periods={current} onSave={onSave} onClose={() => setOpen(false)} /> : null}
  </div>;
}

function PeriodsDialog({ today, periods, onSave, onClose }: Props & { onClose: () => void }) {
  const makePeriod = (): OnlineOnlyPeriod => ({ id: crypto.randomUUID(), fromDate: today, toDate: today, startMinute: 0, endMinute: 1440 });
  const [draft, setDraft] = useState(() => periods.length ? periods : [makePeriod()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Save against the revision that supplied this draft, even if the page refreshes behind it.
  const saveDraft = useRef(onSave);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdrop = useDialogBackdrop(() => { if (!busy) onClose(); });
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); releaseScroll(); restoreDialogFocus(previous); };
  }, []);
  const edit = (id: string, change: Partial<OnlineOnlyPeriod>) => setDraft(current => current.map(period => period.id === id ? { ...period, ...change } : period));
  async function save() {
    if (busy) return;
    if (draft.some(period => !period.fromDate || !period.toDate || period.toDate < period.fromDate ||
      !Number.isInteger(period.startMinute) || !Number.isInteger(period.endMinute) || period.startMinute >= period.endMinute)) {
      setError("Check each period’s dates and choose an end time after its start.");
      return;
    }
    setBusy(true);
    setError("");
    try { await saveDraft.current(draft); onClose(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Online-only periods couldn’t be saved. Please try again."); }
    finally { setBusy(false); }
  }
  return <dialog className="teacher-lesson-dialog teacher-online-only-dialog" ref={dialogRef} {...backdrop}
    aria-labelledby="teacher-online-only-title" onKeyDown={keepDialogFocus}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button className="teacher-dialog-close" type="button" aria-label="Close online-only periods" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
    <p className="teacher-eyebrow">{HOME_CLOCK}</p>
    <h2 id="teacher-online-only-title">Online only</h2>
    <p className="teacher-lesson-note">Students can book online during these hours. Your usual hours and time off still apply. Lessons already booked stay as they are.</p>
    <form className="teacher-form teacher-online-only-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      {draft.map((period, index) => {
        const allDay = period.startMinute === 0 && period.endMinute === 1440;
        return <fieldset className="teacher-online-only-period" key={period.id} disabled={busy}>
          <legend>Period {index + 1}</legend>
          <div className="teacher-timeoff-time">
            <label><span>From date</span><input aria-label={`From date ${index + 1}`} type="date" required value={period.fromDate} onChange={event => edit(period.id, { fromDate: event.target.value, ...(event.target.value > period.toDate ? { toDate: event.target.value } : {}) })} /></label>
            <label><span>Through date</span><input aria-label={`Through date ${index + 1}`} type="date" required min={period.fromDate} value={period.toDate} onChange={event => edit(period.id, { toDate: event.target.value })} /></label>
            <button className="teacher-icon-button" type="button" aria-label={`Remove period ${index + 1}`} onClick={() => setDraft(current => current.filter(row => row.id !== period.id))}><Trash2 size={16} aria-hidden="true" /></button>
          </div>
          <label className="teacher-online-only-allday"><input type="checkbox" checked={allDay} onChange={event => edit(period.id, event.target.checked ? { startMinute: 0, endMinute: 1440 } : { startMinute: 540, endMinute: 1020 })} /><span>All day</span></label>
          {!allDay ? <>
            <div className="teacher-timeoff-time">
              <label><span>From time</span><input aria-label={`From time ${index + 1}`} type="time" required value={Number.isFinite(period.startMinute) ? minuteLabel(period.startMinute) : ""} onChange={event => edit(period.id, { startMinute: parseMinute(event.target.value) })} /></label>
              <label><span>Until time</span><input aria-label={`Until time ${index + 1}`} type="time" required value={Number.isFinite(period.endMinute) ? period.endMinute === 1440 ? "00:00" : minuteLabel(period.endMinute) : ""} onChange={event => edit(period.id, { endMinute: event.target.value === "00:00" ? 1440 : parseMinute(event.target.value) })} /></label>
            </div>
            <p className="teacher-lesson-note">These hours each day; 00:00 ends the day.</p>
          </> : null}
        </fieldset>;
      })}
      {!draft.length ? <p>No online-only periods. Students can choose either place.</p> : null}
      <button className="button button--lilac button--small" type="button" disabled={busy || draft.length >= 100} onClick={() => setDraft(current => [...current, makePeriod()])}><Plus size={15} aria-hidden="true" />Add period</button>
      {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
      <div className="teacher-dialog-actions">
        <button className="button button--coral" type="submit" disabled={busy}>{busy ? "Saving…" : "Save online-only periods"}</button>
        <button className="button button--outline" type="button" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </dialog>;
}
