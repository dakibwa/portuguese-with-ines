# YourLessons

A student's home on the site: their name and Book a lesson on one row, the next lesson, then the month with every booked and weekly lesson on it.

**Markup:** `.unified-calendar--overview` inside `.booking-provider`: `.lesson-overview` (the account menu, `Book a lesson`, the next lesson) over the calendar (`.unified-calendar__month`, weekday names, week rows starting with their month, the key).

- One `sheet` card. The account menu is a raised cream button with the student's splat and name; on a narrower card it is their initial.
- The next lesson is one plain line on the card's own colour: `Monday, 14 September 2026, 10:00` in `ink` 700, `90 mins · In Porto` beneath, its mark beside it.
- The month title is `month-title` with a `?` beside it; the arrows are solid `blue-deep` with a white arrow, and a coral count shows lessons further on.
- Days are `raised` tiles cut `squiggle-tile`. A one-off booked day is `coral-action` filled (the next lesson) or `booked`; a weekly one `weekly`; each shows its time and a globe (online) or a little person (in Porto). Past days fade.
- Hovering a day shows its lessons in full; pressing one opens the LessonDialog. The key sits under the weeks: One-off lesson, Weekly lesson, Online, In Porto.

## Write

Drawn once, by `BookingCalendar` in `src/components/BookingCalendar.tsx`: change it there, and never write a second copy. The page is `/my-lessons/` (`src/app/my-lessons/page.tsx`), which opens `BookingFlow` on the lessons view.

## Source

- `src/components/BookingCalendar.tsx`, find `unified-calendar--overview`
- `src/app/my-lessons/page.tsx`, find `<BookingFlow initialView="lessons" />`
