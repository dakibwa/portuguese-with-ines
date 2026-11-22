# Segmented

A choice of two or three options on one raised track, the blue thumb sliding to the one chosen; shown here as the time picker's part of the day over its times.

**Markup:** `<div class="segmented segmented--position-0" role="radiogroup"><span class="segmented__thumb" aria-hidden="true"></span><label class="is-active"><input type="radio" checked>08:00–14:00</label><label><input type="radio">14:00–18:00</label></div>`; `segmented--three` for three, `segmented--position-N` moves the thumb.

- The track is `raised` (`paper-light`) on the card's `sheet`, with no outline of its own; the thumb is `blue-deep` with `paper-light` text, cut `squiggle-thumb`, sliding on `motion-spring-firm`.
- Labels use the booking control type (`--booking-control-font-size`, 0.7rem at 0.12em, uppercase, 700) inside `.booking-provider`; a time range closes up (`09:00–14:00`).
- Times below are `.slot-grid` buttons: 48px tall, `squiggle-chip`, `raised`, `blue-deep` text at 0.94rem 700; chosen, they turn blue.
- Use it for a small closed choice (Trial, Single, Weekly; Online, In Porto; a length with its price). Never a dropdown for three options, and never two segmented controls with the same options on one screen.

## Write

```tsx
<div className={`segmented${everyWeek ? " segmented--second" : ""}`}>
  <span className="segmented__thumb" aria-hidden="true" />
  {/* the options, each a <button type="button" aria-pressed> */}
</div>
```

As the time picker writes it in `BookingCalendar`: the thumb moves with a modifier (`segmented--second`, `segmented--three`, `segmented--four`, `segmented--position-N`), never a style.

## Source

- `src/components/BookingCalendar.tsx`, find `className={`segmented${everyWeek ? " segmented--second" : ""}`}`
- `src/components/BookingCalendar.tsx`, find `segmented__thumb`
