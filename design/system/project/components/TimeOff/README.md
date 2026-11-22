# TimeOff

Time off: a month to choose days or hours from, beside what is chosen and coming up.

**Markup:** `.teacher-timeoff-layout`: the calendar card (`September 2026`, the pager, `raised` day tiles) and the side card (`2 days chosen`, chips with ×, outline `Clear`, coral `Take 2 days off`), then `Coming up`.

- Chosen days are `blue-deep` tiles; a day off is hatched `lavender` and says `Off`; a dot marks a day with lessons booked; today says `Today`. The key sits under the weeks.
- `Coming up` lists consecutive whole days as one line (`Wed 25 Nov – Fri 27 Nov` / `3 days off`), hours as `Off 09:00–12:00`, the next few and `And 3 more later on`; tapping one chooses it.
- The action names its count: `Take 2 days off`, or `Take some hours off` (lilac) from the timetable.

## Write

Drawn once, by `TeacherSchedule` in `src/components/TeacherSchedule.tsx`: change it there, and never write a second copy. `TimeAhead` (`src/components/teacher/TimeAhead.tsx`) lists what is coming up beside the month.

## Source

- `src/components/TeacherSchedule.tsx`, find `Time off saves as she clicks`
- `src/components/teacher/TimeAhead.tsx#TimeAhead`
