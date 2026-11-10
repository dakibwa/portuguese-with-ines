"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";

/**
 * Changing something in a student's profile (9 November 2026, Dan: tiny
 * pencils, not big buttons): a pencil alone beside a name, or a value that is
 * itself the button with the pencil at its end, so pressing either opens the
 * one existing editor and no button sits inside another. `field` names it for
 * the row, which puts keyboard focus back here once the editor closes.
 */
export function EditPencil({ label, field, controls, disabled, onEdit }: {
  label: string;
  field?: string;
  controls?: string;
  disabled?: boolean;
  onEdit: () => void;
}) {
  return <button aria-controls={controls} aria-label={label} className="teacher-pencil" data-edit={field} disabled={disabled} onClick={onEdit} title={label} type="button">
    <Pencil size={13} strokeWidth={2.4} aria-hidden="true" />
  </button>;
}

/** What it says is its description, so its name can say what pressing it does. */
export function EditValue({ label, field, controls, disabled, empty, onEdit, children }: {
  label: string;
  field?: string;
  controls?: string;
  disabled?: boolean;
  /** A placeholder, in the quieter ink. */
  empty?: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  const valueId = useId();
  return <button aria-controls={controls} aria-describedby={valueId} aria-label={label} className={`teacher-edit${empty ? " is-empty" : ""}`} data-edit={field} disabled={disabled} onClick={onEdit} type="button">
    <span className="teacher-edit__value" id={valueId}>{children}</span>
    <Pencil size={12} strokeWidth={2.4} aria-hidden="true" />
  </button>;
}

/**
 * How every in-place editor ends: a small coral tick to save and a quiet
 * cross to cancel, the pencil's size, so they share the field's line even in
 * a narrow column and never take a row of their own (10 November 2026, Dan).
 * The tick submits the form it is in.
 */
export function EditActions({ busy, saveLabel = "Save", saveDisabled, onCancel }: {
  busy?: boolean;
  saveLabel?: string;
  /** Nothing to save yet: the tick waits as a quiet outline. */
  saveDisabled?: boolean;
  onCancel: () => void;
}) {
  return <span className="teacher-edit-actions">
    <button aria-label={busy ? "Saving…" : saveLabel} className="teacher-edit-save" disabled={busy || saveDisabled} title={saveLabel} type="submit"><Check size={15} strokeWidth={3} aria-hidden="true" /></button>
    <CancelEdit disabled={busy} onCancel={onCancel} />
  </span>;
}

/** The quiet cross that closes whatever is open in place, changing nothing. */
export function CancelEdit({ disabled, onCancel }: { disabled?: boolean; onCancel: () => void }) {
  return <button aria-label="Cancel" className="teacher-pencil" disabled={disabled} onClick={onCancel} title="Cancel" type="button"><X size={15} strokeWidth={2.4} aria-hidden="true" /></button>;
}

/**
 * A value edited where it stands (10 November 2026, Dan: "the edit button
 * should let you edit it from that interface and not bring up a new one"):
 * its pencil turns the value into its own field, with Save and Cancel beside
 * it. Enter saves, Escape cancels, and focus goes back to the value after.
 * What the field cannot save is said beneath it, and it stays open.
 */
export function InlineEdit({ label, field, value, placeholder, empty, disabled, inputLabel, type = "text", inputMode, autoCapitalize, required, onSave, onBusy, children }: {
  /** The value's own button name, such as `Change phone for Nora`. */
  label: string;
  field: string;
  /** What the field opens holding. */
  value: string;
  placeholder?: string;
  empty?: boolean;
  disabled?: boolean;
  inputLabel: string;
  type?: "text" | "email" | "tel";
  inputMode?: "numeric" | "decimal" | "tel" | "email" | "text";
  autoCapitalize?: string;
  required?: boolean;
  /** Rejects with what went wrong, which the field shows. */
  onSave: (value: string) => Promise<void>;
  onBusy?: (busy: boolean) => void;
  /** The value as it reads, closed. */
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrapper = useRef<HTMLSpanElement>(null);
  const back = useRef(false);
  const errorId = useId();
  const editing = draft !== null;
  useEffect(() => {
    if (editing) wrapper.current?.querySelector<HTMLInputElement>("input")?.select();
    else if (back.current) { back.current = false; wrapper.current?.querySelector<HTMLElement>(`[data-edit="${field}"]`)?.focus(); }
  }, [editing, field]);
  const close = () => { back.current = true; setDraft(null); setError(""); };

  async function save() {
    if (draft === null || busy) return;
    if (draft.trim() === value.trim()) { close(); return; }
    setBusy(true); onBusy?.(true); setError("");
    try { await onSave(draft.trim()); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "That couldn’t be saved."); }
    finally { setBusy(false); onBusy?.(false); }
  }

  return <span className="teacher-inline" ref={wrapper}>
    {editing ? <form className="teacher-inline-edit" onSubmit={event => { event.preventDefault(); void save(); }}
      onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <input aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined} aria-label={inputLabel} autoCapitalize={autoCapitalize} autoComplete="off"
        disabled={busy} inputMode={inputMode} name={field} onChange={event => setDraft(event.target.value)} placeholder={placeholder} required={required} spellCheck={false} type={type} value={draft} />
      <EditActions busy={busy} onCancel={close} />
      {error ? <span className="teacher-inline-error teacher-inline-edit__error" id={errorId} role="alert">{error}</span> : null}
    </form> : <EditValue disabled={disabled} empty={empty} field={field} label={label} onEdit={() => { setError(""); setDraft(value); }}>{children}</EditValue>}
  </span>;
}
