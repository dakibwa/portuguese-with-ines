"use client";

import type { RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The one pager on Inês's pages (14 October 2026, Dan: "there feels
 * inconsistencies here"): the Timetable's week, the Time off month and the
 * Receipts month all turn the same way. The arrows never move. `This week` /
 * `This month` shows to their left only once she has turned away from the
 * current one, because the heading already says where she is. Its place is
 * held while it is out of sight (hidden, not removed), so on a narrow screen
 * the heading and pager lay out the same either way and nothing shifts.
 */
export function TeacherPager({ unit, away, headingRef, onCurrent, onNext, onPrevious, nextDisabled, previousDisabled }: {
  unit: "week" | "month";
  /** Away from the current week or month: only then is there a way back. */
  away: boolean;
  /** The heading that names the period. The way back disappears when used, so focus moves here. */
  headingRef: RefObject<HTMLElement | null>;
  onCurrent: () => void;
  onNext: () => void;
  onPrevious: () => void;
  nextDisabled?: boolean;
  previousDisabled?: boolean;
}) {
  return (
    <div className="teacher-pager">
      <button
        className={`button button--lilac button--compact teacher-pager-current${away ? "" : " is-idle"}`}
        disabled={!away}
        onClick={() => {
          headingRef.current?.focus({ preventScroll: true });
          onCurrent();
        }}
        type="button"
      >
        This {unit}
      </button>
      <button className="teacher-icon-button" aria-label={`Previous ${unit}`} disabled={previousDisabled} onClick={onPrevious} type="button"><ChevronLeft size={19} aria-hidden="true" /></button>
      <button className="teacher-icon-button" aria-label={`Next ${unit}`} disabled={nextDisabled} onClick={onNext} type="button"><ChevronRight size={19} aria-hidden="true" /></button>
    </div>
  );
}
