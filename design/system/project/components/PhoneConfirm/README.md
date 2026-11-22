# PhoneConfirm

The confirm step on a phone: the choices as three full-width rows, the chosen lessons with Change, Add another lesson, then the confirm card.

**Markup:** as ConfirmBooking, in a `booking` container under 520px.

- One column in the same order as on a wide screen; every control is at least 44px; the final action and the agreement run full width.

## Write

Drawn once, by `BookingCalendar` in `src/components/BookingCalendar.tsx`: change it there, and never write a second copy. The phone layout is the same markup in the narrow `booking` container.

## Source

- `src/components/BookingCalendar.tsx`, find `booking-confirmation-columns`
