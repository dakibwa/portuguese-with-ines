import type { Span, TeachingWindow } from "./teacher-calendar";

/** Trim empty edges while keeping every start, lesson and timed break visible. */
export function timetableBounds({ windows, lessons, blocks, step, editing }: {
  windows: TeachingWindow[];
  lessons: Span[];
  blocks: Span[];
  step: number;
  editing: boolean;
}) {
  const spans = [
    ...windows.filter(window => Number.isFinite(window.start) && Number.isFinite(window.lastStart)).map(window => ({ start: window.start, end: window.lastStart + step })),
    ...lessons,
    ...blocks.filter(block => block.start > 0 || block.end < 1440),
  ].filter(span => Number.isFinite(span.start) && Number.isFinite(span.end) && span.end > span.start);
  // The repeating-hours editor retains its empty paintable cells. A completely
  // empty timetable still offers a useful working day for adding a lesson.
  const fallback = editing ? { start: 480, end: 1200 } : { start: 540, end: 1200 };
  const shown = editing || !spans.length ? [...spans, fallback] : spans;
  return {
    start: Math.max(0, Math.floor(Math.min(...shown.map(span => span.start)) / 60) * 60),
    end: Math.min(1440, Math.ceil(Math.max(...shown.map(span => span.end)) / 60) * 60),
  };
}
