"use client";

import { Check } from "lucide-react";

/**
 * "Already paid", as one tick (16 October 2026, Dan): the booking agreement's
 * squiggle capsule with a paint dab for its box. Unticked the dab is a pale
 * lavender; ticked the capsule turns blue and the dab coral, with a cream
 * check, so it reads as done at a glance.
 */
export function PaidTick({ checked, disabled, onChange, plain }: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** On Students: a small soft capsule with a little checkbox, strong blue once checked. */
  plain?: boolean;
}) {
  return (
    <button
      aria-checked={checked}
      className={`paid-tick${plain ? " paid-tick--plain" : ""}${checked ? " is-checked" : ""}`}
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
