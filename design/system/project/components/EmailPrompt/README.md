# EmailPrompt

Add your email: asked first when a student with no email arrives, with their lessons held back until it is sent.

**Markup:** `<section class="card-prompt email-prompt card-prompt--open">`: the mail icon, `Add your email`, `So you can sign in on any phone or computer.`, then one email field and coral `Add email` (compact) on one row.

- The same card as CardPrompt. The button is greyed until an address is typed.
- After sending: `Check your email` / `Open the link we sent to … on this phone.` Details then reads `Not added` with `Add email` until it is confirmed.

## Write

Drawn once, by `MyLessons` in `src/components/MyLessons.tsx`: change it there, and never write a second copy.

## Source

- `src/components/MyLessons.tsx`, find `email-prompt-heading`
