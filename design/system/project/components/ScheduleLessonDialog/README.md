# ScheduleLessonDialog

A lesson opened from Inês's timetable: who, when, Join Google Meet, how it is paid, the marks she can set, and her three actions.

**Markup:** `<dialog class="teacher-lesson-dialog" open>`: the close button, `.teacher-dialog-top` (the student's splat, name and a `Booked` pill), the date and time, the blue Meet button, the facts as dabs, `Already paid` and `No-show` toggles, then `Homework` (lilac), `Move lesson` (coral) and `Cancel lesson` (outline).

- `min(460px, 100vw − 2rem)`, `squiggle-panel`, `--dialog-surface`, `shadow-dialog`; it fades in and keeps its place.
- Inês keeps `Move lesson`; a student `change`s. Her buttons take the booking workspace's type at her denser 44px.
- The facts are dabs: where, how long, and how it is paid (`Charged to their card after the lesson`).

## Write

Drawn by `LessonDetails` (`src/components/teacher/LessonDetails.tsx`) when Inês opens a lesson in `TeacherSchedule`: change it there.

## Source

- `src/components/teacher/LessonDetails.tsx#LessonDetails`
- `src/components/TeacherSchedule.tsx`, find `<LessonDetails`
