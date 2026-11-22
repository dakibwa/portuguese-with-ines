# SignIn

Almost there: the chosen lesson stays on the left while the card on the right creates an account or signs in.

**Markup:** `.auth-panel` beside the booking bar and the chosen lessons, inside `.booking-stage`: a splat, `Almost there` in Beth Ellen, `.auth-tabs` (Create an account, I have an account), then `.auth-panel__form` labels with a Lucide icon and an input.

- The panel is a `sheet` card cut `squiggle-card`, at most 460px wide, its content centred.
- Fields: 44px, 1px `rule`, `squiggle-field`, `raised`; a label is `legend-label` with its 16px icon. Focus shows one clear blue boundary in place of the border, never the button's rings.
- One label per field (`Your name`, `Email`, `Password`); the password hint sits small under its field (`At least 8 characters.`). NIF is optional and says what it is for.
- The final action is coral and full width: `Create my account`. Other ways in (`Email a link`, `Forgot password`) are small outline buttons side by side, never underlined words.

## Write

```tsx
<AuthPanel heading="Your account" headingLevel={2} initialError={signInLinkError} initialMode={signInLinkError ? "link" : "signin"} onSignedIn={enterLessons} />
```

Account creation and sign-in, as `BookingCalendar` places it beside the chosen lesson.

## Source

- `src/components/AuthPanel.tsx#AuthPanel`
- `src/components/BookingCalendar.tsx`, find `<AuthPanel`
