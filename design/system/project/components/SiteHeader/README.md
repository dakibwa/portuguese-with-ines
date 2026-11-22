# SiteHeader

The shared header on every page: the wordmark home on the left, Approach, Lessons and FAQ, and the blue Booking pill.

**Markup:** `<header class="site-header"><div class="site-header__inner"><a class="site-header__brand" href="/">…Wordmark…</a><nav class="site-nav"><a class="site-nav__link" href="/approach/">Approach</a>…<a class="site-nav__link site-nav__link--book" href="/book"><span class="site-nav__book">Booking</span></a></nav><button class="nav-toggle">…</button></div></header>`

- `header-height` tall (108px; 96, 88, 84 and 68px as the window narrows or a phone turns sideways), on `paper` with the grain, a 1px ink hairline at 10% below.
- Links in `nav-label` (0.82rem, 700, 0.14em, uppercase) `blue-deep`; the current page and the one under the pointer turn `coral-action`, with no line beneath. When a page turns, the coral moves to the new page's name and the header stays exactly where it is.
- Booking is a 44px `blue-deep` pill (`squiggle-pill`) with `paper-light` text, `coral-action` under the pointer.
- From 820px down the links go behind the menu toggle (see PhoneMenu). Without JavaScript the links stay visible at every width.

## Write

```tsx
<SiteHeader currentPage="approach" />
```

The first thing on every page. `currentPage` is a `SitePage` (`home`, `approach`, `lessons`, `faq`, `book`, `my-lessons`, `terms`, `privacy` or `other`); booking and Your lessons pass a `bar` too.

## Source

- `src/components/SiteHeader.tsx#SiteHeader`
- `src/components/SiteHeader.tsx`, find `export type SitePage`
