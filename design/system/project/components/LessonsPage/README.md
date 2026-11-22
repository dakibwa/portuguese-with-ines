# LessonsPage

Lessons and prices: a lilac hero beside a blue panel with the open-centre splat, three lesson cards with their prices, and one blue closing card.

**Markup:** `.lessons-hero` (title in `display-page`, the open-centre lavender field), `.lesson-programme__grid` of `.lesson-product` cards, `.lessons-closing`.

- A `lesson-product` is `paper-light` (the trial `lavender-soft`), 1.5px `rule-soft`, cut in its own card hand (58px 24px 52px 30px / 27px 56px 25px 50px), with its splat cropped into the top corner, an `eyebrow-label` (Trial lesson), the price in `display-price` beside a small `60 mins` chip, one line and one button: coral for the trial, outline for the others.
- Prices are €20 trial, €25 for 60 minutes, €35 for 90. A length is `60 mins` as a label, `60-minute` before `lesson`.
- The closing card is one compact blue card: the In Porto or online splat, the title in `closing-label`, one payment sentence, then Book a lesson and Payment questions as a pair. On a phone its parts stack inside the same card.

## Write

Drawn once, by `the Lessons page` in `src/app/lessons/page.tsx`: change it there, and never write a second copy.

## Source

- `src/app/lessons/page.tsx`, find `lessons-hero`
