# LessonDialog

A booked lesson opened from the calendar: what and when, Join Google Meet, Change or Cancel, and, for a weekly one, Manage weekly lessons.

**Markup:** `<div class="lesson-manage-overlay" role="presentation"><div class="lesson-manage-dialog" role="dialog" aria-modal="true">…close…<div class="lesson-manage-dialog__content">…</div></div></div>`

- At most 440px (600px for the weekly run's editor), `squiggle-panel`, `--dialog-surface`, `shadow-dialog`, over a dimmed page; it fades in briefly and nothing moves.
- A status pill heads it (`Weekly lesson` in `lavender-ink`), then `Manage this lesson`, the date and time in `ink` 700 and `60 mins · Online`.
- `Change` (coral) and `Cancel` (outline) are a pair; a student `change`s or cancels, in that order. The weekly line (`Tuesdays at 17:00 Porto time`) sits beside an outline `Manage weekly lessons`.
- The close button is the site's 44px hand-cut button. Inside 14 hours, the dialog names the €5 late change fee before the student confirms.

## Write

Drawn once, by `BookingCalendar` in `src/components/BookingCalendar.tsx`: change it there, and never write a second copy.

## Source

- `src/components/BookingCalendar.tsx`, find `lesson-manage-dialog`
