"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const tabs = [
  { id: "students", label: "Students" },
  { id: "week", label: "Timetable" },
  { id: "receipts", label: "Receipts" },
  { id: "expressions", label: "Expressions" },
  { id: "profile", label: "Profile" },
] as const;

export type TeacherTab = (typeof tabs)[number]["id"];

/**
 * One sliding control, with the same keyboard behaviour at every width.
 * `held` is the control while her schedule opens (ScheduleLoading): the same
 * tabs in the same places, already answering, with the chosen one painted
 * blue in place of the thumb, so the server's first paint never slides a
 * thumb in from nothing once the page wakes.
 */
export function TeacherTabs({ current, held = false, hoursDirty, needsCount, onSelect }: {
  current: TeacherTab;
  held?: boolean;
  hoursDirty: boolean;
  needsCount: number;
  onSelect: (tab: TeacherTab) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 0 });
  const shown = useRef(current);

  // A tab's contents slide in from the side it was reached from while the
  // thumb glides above them, as a student's places do (AccountMenu): one
  // movement for one kind of change (9 November 2026, Dan: "smoother").
  useLayoutEffect(() => {
    const from = tabs.findIndex((tab) => tab.id === shown.current);
    const to = tabs.findIndex((tab) => tab.id === current);
    shown.current = current;
    const panel = document.getElementById("teacher-tools-panel");
    if (held || from === to || !panel) return;
    panel.dataset.tabSlide = to > from ? "forward" : "back";
    const timer = window.setTimeout(() => { delete panel.dataset.tabSlide; }, 480);
    return () => window.clearTimeout(timer);
  }, [current, held]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || held) return;
    const selected = list.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!selected) return;
    const scroller = list.parentElement;
    const measure = () => {
      setThumb({ left: selected.offsetLeft, width: selected.offsetWidth });
      // Keep the active tab in view after a resize as well as a tab change.
      // Scroll only the strip, never the page or a form she is editing.
      if (scroller) {
        const tab = selected.getBoundingClientRect();
        const strip = scroller.getBoundingClientRect();
        if (tab.left < strip.left + 3) scroller.scrollLeft += tab.left - strip.left - 3;
        else if (tab.right > strip.right - 3) scroller.scrollLeft += tab.right - strip.right + 3;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    observer.observe(selected);
    if (scroller) observer.observe(scroller);
    return () => observer.disconnect();
  }, [current, held, hoursDirty, needsCount]);

  return (
    <div className="teacher-tabs-scroll">
      <div
        aria-label="Teacher tools"
        className={`teacher-tabs${held ? " teacher-tabs--held" : ""}`}
        ref={listRef}
        role="tablist"
        style={{ "--tab-left": `${thumb.left}px`, "--tab-width": `${thumb.width}px` } as CSSProperties}
      >
        {/* Placed only once measured, so it starts under her tab rather than
            gliding in from the bar's left edge as the page wakes. */}
        {held || !thumb.width ? null : <span aria-hidden="true" className="teacher-tabs__thumb" />}
        {tabs.map((tab, index) => (
          <button
            aria-controls="teacher-tools-panel"
            aria-selected={current === tab.id}
            id={`teacher-tab-${tab.id}`}
            data-homework-exit
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                  : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              onSelect(tabs[next].id);
              listRef.current?.querySelector<HTMLButtonElement>(`#teacher-tab-${tabs[next].id}`)?.focus({ preventScroll: true });
            }}
            role="tab"
            tabIndex={current === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
            {tab.id === "week" && hoursDirty ? <span className="teacher-tab-dot" aria-label="unsaved changes" /> : null}
            {tab.id === "students" && needsCount > 0 ? <span className="teacher-tab-count" aria-label={`${needsCount} need attention`}>{needsCount}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
