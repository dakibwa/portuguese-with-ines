# PhoneMenu

The phone menu: the wordmark and a close button, the four destinations with their marks and a line each, and a blue card to book or message.

**Markup:** `<div class="nav-mobile is-open" role="dialog" aria-modal="true">` with `.nav-mobile__inner`: the header row, `.nav-mobile__link` items (splat, `APPROACH` in `nav-label` large, `How the lessons work`), then `.nav-mobile__cta` (`One to one, online or in Porto.`, coral `Book a lesson`, lilac `Message on WhatsApp`).

- Full screen on `paper` with the grain; a splat cropped into its foot. It opens with a short fade; its destinations drop in one after another as their marks land.
- Links part with 1px `rule-soft`; the current page is `coral-action`.
- An open menu recedes with the page it covered when a page turns.

## Write

Drawn once, by `SiteNav` in `src/components/SiteNav.tsx`: change it there, and never write a second copy. `SiteHeader` places it; never write a second menu.

## Source

- `src/components/SiteNav.tsx`, find `nav-mobile`
