# Agreement

Agree to terms & privacy: one raised control that turns blue once pressed, with the terms link kept as its own action.

**Markup:** `<div class="booking-agreement"><div class="booking-agreement__control is-agreed"><button class="booking-agreement__button" aria-pressed="true">…circle-check…Agree to</button><a data-terms-privacy href="#terms-privacy">terms &amp; privacy</a></div></div>`

- Unpressed: `raised` with a 1px `rule` and an empty circle; pressed: `blue-deep` with `paper-light` and a ticked circle, beside the coral final action.
- It fills the same width as the final action, its text centred.
- `aria-pressed` carries the state; colour is never the only sign of it.

## Write

Drawn once, by `BookingCalendar` in `src/components/BookingCalendar.tsx`: change it there, and never write a second copy. The same control agrees to a saved card in `CardOnFile`.

## Source

- `src/components/BookingCalendar.tsx`, find `booking-agreement`
- `src/components/CardOnFile.tsx`, find `booking-agreement`
