"use client";

import { useId, type ReactNode } from "react";
import { Pencil } from "lucide-react";

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
  return <button aria-controls={controls} aria-label={label} className="teacher-pencil" data-edit={field} disabled={disabled} onClick={onEdit} type="button">
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
