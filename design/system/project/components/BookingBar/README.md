# BookingBar

The lesson's three choices in one bar: Lesson (Trial, Single, Weekly), Where (Online, In Porto) and Length with its price.

**Markup:** `<div class="booking-bar"><div class="booking-bar__choices" role="group" aria-label="Your lesson"><fieldset class="booking-bar__group booking-bar__group--kind"><legend>Lesson</legend><div class="segmented segmented--three">…</div></fieldset>…</div></div>` inside `.booking-provider`.

- A `sheet` card (1px `rule`, `squiggle-panel`, `pad-card`); each choice a `legend-label` legend in `lavender-ink` over a Segmented control.
- Each length carries its price on its own label (`60 mins · €20`); a price Inês set to €0 reads `Free`, never €0.
- Choosing Weekly opens Repeat among the choices as they ease narrower; choosing Single eases them back.
- On a phone each choice takes its own row; at the confirm step the bar stays above the chosen lessons so the choice can still change.

## Write

Drawn once, by `BookingCalendar` in `src/components/BookingCalendar.tsx`: change it there, and never write a second copy.

## Source

- `src/components/BookingCalendar.tsx`, find `booking-bar`
