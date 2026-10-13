"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { GoogleMeetLogo } from "@/components/GoogleMeetLogo";

const tabs = [
  { id: "week", label: "Week" },
  { id: "hours", label: "Weekly hours" },
  { id: "time-off", label: "Time off" },
  { id: "students", label: "Students" },
  { id: "receipts", label: "Receipts" },
  { id: "expressions", label: "Expressions" },
  { id: "meet", label: "Google Meet" },
] as const;

export type TeacherTab = (typeof tabs)[number]["id"];

/** One sliding control, with the same keyboard behaviour at every width. */
export function TeacherTabs({ current, hoursDirty, studentsWaiting, meetAttention, onSelect }: {
  current: TeacherTab;
  hoursDirty: boolean;
  /** Students she still needs to bring onto the site. */
  studentsWaiting: number;
  meetAttention: boolean;
  onSelect: (tab: TeacherTab) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
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
  }, [current, hoursDirty, studentsWaiting, meetAttention]);

  return (
    <div className="teacher-tabs-scroll">
      <div
        aria-label="Teacher tools"
        className="teacher-tabs"
        ref={listRef}
        role="tablist"
        style={{ "--tab-left": `${thumb.left}px`, "--tab-width": `${thumb.width}px` } as CSSProperties}
      >
        <span aria-hidden="true" className="teacher-tabs__thumb" />
        {tabs.map((tab, index) => (
          <button
            aria-controls="teacher-tools-panel"
            aria-selected={current === tab.id}
            className={tab.id === "meet" ? "teacher-tab--meet" : undefined}
            id={`teacher-tab-${tab.id}`}
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
            {tab.id === "meet" ? <><GoogleMeetLogo /><span className="visually-hidden">Google Meet</span></> : tab.label}
            {tab.id === "hours" && hoursDirty ? <span className="teacher-tab-dot" aria-label="unsaved changes" /> : null}
            {tab.id === "students" && studentsWaiting ? <span className="teacher-tab-dot" aria-label={`${studentsWaiting} to bring in`} /> : null}
            {tab.id === "meet" && meetAttention ? <span className="teacher-tab-dot" aria-label="needs attention" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
