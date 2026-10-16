"use client";

import { Check } from "lucide-react";

/**
 * "Already paid", as one tick (16 October 2026, Dan): the booking agreement's
 * squiggle capsule with a paint dab for its box. Unticked the dab is a pale
 * lavender; ticked the capsule turns blue and the dab coral, with a cream
 * check, so it reads as done at a glance.
 */
export function PaidTick({ checked, disabled, onChange, describedBy }: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  describedBy?: string;
}) {
  return (
    <button
      aria-checked={checked}
      aria-describedby={describedBy}
      className={`paid-tick${checked ? " is-checked" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="checkbox"
      type="button"
    >
      <span aria-hidden="true" className="paid-tick__dab">
        {checked ? <Check size={13} strokeWidth={3.4} /> : null}
      </span>
      Already paid
    </button>
  );
}
