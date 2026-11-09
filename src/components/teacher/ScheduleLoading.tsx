"use client";

import { useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TeacherTabs, type TeacherTab } from "@/components/teacher/TeacherTabs";
import { dateLabel } from "@/lib/teacher-calendar";

const noChange = () => () => {};

/**
 * The Timetable before its lessons arrive (9 November 2026, Dan: "make
 * everything feel smoother and less janky"). Her schedule used to open in
 * four steps: "Opening your schedule…", then "Loading your weekly hours…",
 * then the week with an empty box, then her next lesson dropping in on top
 * and pushing the week down. Now one held shape stands where the week will
 * be, the next lesson's band included, from the first moment to the last,
 * and the week replaces it once, whole, as Your lessons' placeholder does
 * for a student (LessonsLoading).
 */
export function WeekLoading({ weekStart }: { weekStart: string }) {
  // The page is drawn ahead of time, on another day, so the month is named
  // only once it is running in her browser; until then its line is held.
  const awake = useSyncExternalStore(noChange, () => true, () => false);
  return (
    <>
      <p className="visually-hidden" role="status">Loading your schedule…</p>
      <div aria-hidden="true" className="teacher-week teacher-week-loading">
        <span className="teacher-week-loading__next" />
        <div className="teacher-week-toolbar">
          <div className="teacher-week-title">
            <div className="teacher-week-heading">
              <h2>{awake ? dateLabel(weekStart, { month: "long", year: "numeric" }) : "\u00a0"}</h2>
            </div>
          </div>
          <span className="button button--lilac button--compact teacher-week-mode">Edit weekly hours</span>
          <div className="teacher-week-day-control" />
          <span className="teacher-pager">
            <span className="button button--lilac button--compact teacher-pager-current is-idle">This week</span>
            <span className="teacher-icon-button"><ChevronLeft size={19} /></span>
            <span className="teacher-icon-button"><ChevronRight size={19} /></span>
          </span>
        </div>
        <div className="teacher-week-loading__grid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="teacher-week-loading__splat" src="/visuals/v2-splats/one-to-one-splat-v2.svg" />
        </div>
      </div>
    </>
  );
}

/**
 * Her whole workspace while it opens: the tabs already in their place (and
 * already answering, so a tab chosen now is the one she lands on), with the
 * held week beneath them, or a held card for any other tab.
 */
export function ScheduleLoading({ current, onSelect, weekStart }: {
  current: TeacherTab;
  onSelect: (tab: TeacherTab) => void;
  weekStart: string;
}) {
  return (
    <div aria-busy="true" className="teacher-workspace">
      <div className="teacher-tools-header">
        <TeacherTabs current={current} held hoursDirty={false} needsCount={0} onSelect={onSelect} />
      </div>
      <div aria-labelledby={`teacher-tab-${current}`} className="teacher-tools-panel" id="teacher-tools-panel" role="tabpanel">
        {current === "week" ? <WeekLoading weekStart={weekStart} /> : (
          <>
            <p className="visually-hidden" role="status">Loading your schedule…</p>
            <div aria-hidden="true" className="teacher-panel-loading">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="teacher-week-loading__splat" src="/visuals/v2-splats/one-to-one-splat-v2.svg" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
