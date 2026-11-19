# Timetable

Inês's week in hours: a column per day with its date and Day off switch, lessons as blue blocks, lunch hatched, and hours off shaded.

**Markup:** `<section class="teacher-week">` with `.teacher-week-title`, the pager, `Edit weekly hours`, and `.teacher-week-grid` of `.teacher-day-cell` columns holding `.teacher-calendar-lesson` blocks.

- The grid sits on `raised` with `rule-soft` hours and day lines, inside a `squiggle-panel` edge. Today's date is a `blue-deep` tile; a day with lessons carries a coral dot.
- A lesson is a `blue-deep` block (`squiggle-field`) with its time range and the student's name in `paper-light`, a globe or a little person for where, and a Meet button. A lesson she added herself (`teacher-calendar-lesson--added`) is `lavender-soft` with a dashed edge and an `Added` tag (`tag-label`); a lesson in Porto (`--porto`) carries a 3px `coral` left edge; a no-show is marked as such.
- Lunch and breaks are hatched in `lavender` with their name; hours outside her weekly hours are shaded.
- The week title is `week-title` (`7 – 13 September`; a date range keeps its spaces, a time range closes up). Edit weekly hours is a lilac button.
- On a phone the days run as a row of tabs over one day's column.
