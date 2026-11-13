"use client";

import { useState } from "react";
import { restoreBookingAs } from "@/lib/admin-api";

/** What she is told once a lesson is back on. */
export function putBackMessage(emailed: boolean | undefined, firstName: string) {
  return emailed === false ? "Lesson put back." : `Lesson put back. ${firstName} has been emailed that it’s back on.`;
}

/**
 * "Put it back" on a lesson she cancelled (13 November 2026, Dan: "ok yeah do
 * that"): the same lesson, as it was, with one email to the student, instead
 * of adding it again. One press, like the cancellation it undoes; the Worker
 * decides, and a refusal says why.
 */
export function PutBackButton({ token, bookingId, firstName, disabled = false, onDone, onError }: {
  token: string;
  bookingId: string;
  firstName: string;
  disabled?: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="teacher-quiet"
      data-homework-exit
      type="button"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await restoreBookingAs(token, bookingId);
          onDone(putBackMessage(result.emailed, firstName));
        } catch (caught) {
          onError(caught instanceof Error ? caught.message : "That lesson couldn’t be put back.");
        } finally {
          setBusy(false);
        }
      }}
    >
      Put it back
    </button>
  );
}
