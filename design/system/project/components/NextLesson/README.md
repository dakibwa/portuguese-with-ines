# NextLesson

The blue band over Inês's tabs: the lesson happening now or next, and Join Meet.

**Markup:** `<section class="teacher-next is-live"><div class="teacher-next__text"><p class="teacher-eyebrow">Happening now<span class="teacher-next__more"> · 1 more today</span></p><button class="teacher-next__lesson"><strong>Alex Moreau</strong><span>Today, 11:00–12:00</span><span class="teacher-next__place">…globe…Online</span></button></div><a class="teacher-next__join">…Meet logo…Join Meet</a></section>`

- `blue-deep`, `squiggle-panel`, `paper-light` text; the eyebrow in small capitals, the name at 1.1rem 700, the rest `next-lesson`.
- `Join Meet` is a cream pill with Google Meet's own mark, the only place the Meet colours appear.
- The eyebrow reads `Happening now` while a lesson runs and `Next lesson` before it. Pressing the lesson opens its dialog.

## Write

```tsx
<NextLesson bookings={bookings} now={now} onOpen={setSelectedBooking} />
```

At the top of Inês’s schedule, in `TeacherSchedule`.

## Source

- `src/components/teacher/NextLesson.tsx#NextLesson`
- `src/components/TeacherSchedule.tsx`, find `<NextLesson`
