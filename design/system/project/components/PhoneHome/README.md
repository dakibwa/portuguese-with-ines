# PhoneHome

The home hero on a phone: the blue panel first, Book a lesson full width with the two ways in side by side beneath it, then the three principles.

**Markup:** as HomeHero; under 560px the hero stacks and `.home-hero__links` becomes two equal halves.

- Book a lesson in view above the fold, upright and sideways: a phone on its side slims the header (68px) and starts the hero at the top.
- Under 414px the pair goes a size smaller (0.64rem at 0.08em) rather than adding a row; under 360px each takes the width its label needs.

## Write

Drawn once, by `the home page` in `src/app/page.tsx`: change it there, and never write a second copy. The phone layout is the same markup at 390px.

## Source

- `src/app/page.tsx`, find `home-hero__links`
