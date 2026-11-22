# BookingAlert

A problem said plainly in one coral panel, with the ways on beside it.

**Markup:** `<div class="booking-alert" role="status"><svg class="lucide lucide-circle-alert"/><div class="booking-alert__body"><p>…</p><div class="booking-alert__actions"><button class="button button--outline button--compact">Try again</button>…</div></div></div>`

- 1.5px `coral` edge, `squiggle-field`, a 10% coral wash; the message in `ink`. Used on the student pages and in Inês's schedule alike.
- The ways on come after the message as small outline buttons side by side (Try again, Message Inês, Sign in), on the message's own row across a wide booking page.
- One message, no apology paragraph: "The booking system is busy." Failures say `couldn’t`.
- Good news is never this panel: it is the lavender panel with a 20px tick.

## Write

```tsx
<div className="booking-alert booking-alert--error" role="alert">
  <p>…what went wrong, in a line…</p>
  {/* then its ways on: Try again, Message Inês */}
</div>
```

As `AuthPanel`, `BookingCalendar` and `CardOnFile` write it; give it an `id` when a field points at it with `aria-describedby`.

## Source

- `src/components/AuthPanel.tsx`, find `className="booking-alert booking-alert--error"`
- `src/components/BookingCalendar.tsx`, find `booking-alert`
