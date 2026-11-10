"use client";

import { useId, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";

/**
 * Changing something (9 November 2026, Dan: tiny pencils, not big buttons): a
 * pencil alone beside a name, which opens everything under that name where
 * it reads (a student's Details, Price and Plan, an expression), or a value
 * that is itself the button with the pencil at its end (Your details, her
 * Profile). No button sits inside another. `field` names it for the row,
 * which puts keyboard focus back here once the editor closes.
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
