# BookingPage

Book a Lesson: the site header becomes a blue bar that names the page, and the booking card beneath it opens on the lesson's choices and the calendar.

**Markup:** `<SiteHeader>` with its `bar` (the wordmark, `Book a Lesson` in Beth Ellen, Sign in, the menu), then `<main class="book-page">` with the booking card: the choices bar (Lesson, Where, Length) over the month's calendar, then the footer.

- The bar is `blue-deep` with the grain and a splat in its corner. Its title is `display-booking`: `Book a Lesson` to a visitor, `Your Lessons` to a student, and it does not change under a booking being finished.
- `.booking-provider` is the `booking` container: everything inside answers to the column's width (520, 700, 900, 1100px), never the window's. It also sets the booking control type.
- The card carries no second Book a lesson title (it is kept for screen readers). A first-time visitor's card opens on the choices; a returning one's offers `Already booked? Sign in`.
- One decision at a time: what is decided folds into a summary row with `Change` (no "booking pile-up"). Decisions never turn the page; what they bring dissolves in from a few pixels below while the rest stays still.

## Write

```tsx
<BookingFlow />
```

The whole of `/book/` (`src/app/book/page.tsx`), under `<SiteHeader currentPage="book" />`. Its card is `BookingCalendar`.

## Source

- `src/components/BookingFlow.tsx#BookingFlow`
- `src/app/book/page.tsx`, find `<BookingFlow`
