# ScheduleTabs

The six tabs of Inês's schedule on one cream track, the chosen tab a blue thumb.

**Markup:** `<div class="teacher-tabs" role="tablist" style="--tab-left:198px;--tab-width:197px"><span class="teacher-tabs__thumb"></span><button role="tab" aria-selected="true">Timetable</button>…</div>` inside `.teacher-tools-header`.

- Track: `raised`, 1px `blue-deep` edge, `squiggle-tabs`, 4px inset; the thumb `blue-deep` cut `squiggle-thumb`, sliding 260ms on `motion-ease` to the measured tab.
- Order: Students, Timetable, Time off, Receipts, Expressions, Profile. Tab names are one word or two, in the small capitals of a student's places (Montserrat 700, 0.7rem, 0.12em; 0.08em on a phone so `Expressions` fits its third at 320px), `ink`; chosen, `paper-light`. The thumb is placed only once measured, so it never glides in from the edge as the page wakes, and the panel below slides in from the side of the tab chosen.
- A badge counts only real to-dos (a coral count on Students). On a phone the tabs wrap to two rows of three rather than scroll.

## Write

Drawn by `TeacherTabs` (`src/components/teacher/TeacherTabs.tsx`) at the top of `TeacherSchedule`: change it there; a new tab is a new entry in its list.

## Source

- `src/components/teacher/TeacherTabs.tsx#TeacherTabs`
- `src/components/TeacherSchedule.tsx`, find `<TeacherTabs`
