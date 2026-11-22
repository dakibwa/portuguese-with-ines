# SelectionBar

A chosen time waiting to be confirmed: its lesson's mark, the date and time in full, and the clock it is on.

**Markup:** `<div class="booking-selection-summary"><span class="asset-mark booking-selection-summary__mark">…</span><span class="booking-choice-summary__copy"><strong><span class="when-long">Wednesday, 16 September 2026, 10:00</span><span class="when-short">Wed 16 Sept, 10:00</span></strong><small>Porto time</small></span></div>` in `.booking-chosen-lessons`.

- `raised` on the card's `sheet`, `squiggle-field`; the date in `ink` at 700, the clock in `lavender-ink`.
- The long date shows where it fits, the short one (`Wed 16 Sept, 10:00`) on a phone.
- The clock is named once, after the time: the place chosen's (`Porto time` in Porto, the student's own online).
- At the confirm step each row gains an outline `Change`; `Add another lesson` follows as a dashed row with a plus.

## Write

Drawn once, by `BookingCalendar` in `src/components/BookingCalendar.tsx`: change it there, and never write a second copy.

## Source

- `src/components/BookingCalendar.tsx`, find `booking-selection-summary`
