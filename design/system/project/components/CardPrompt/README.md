# CardPrompt

Confirm your card payments: the lessons Inês added with their prices, the two fee facts, the authorisation, and Agree & add card.

**Markup:** `<section class="card-prompt card-prompt--open">` with its icon, `Confirm your card payments`, `Paid at the end of each lesson` over the lessons (`Thu 10 Sept, 17:00` · €25), the facts, the authorisation control and the final action.

- A `sheet` card; each lesson a dashed `raised` row with a card icon and its price at the right.
- The fee is stated once, the free part first, then the €5, as two dabs (Dan, 2 Nov 2026).
- `I authorise card payments for my future lessons` is the Agreement's control with its Terms & privacy link; the final action stays the quiet outline until it is ticked.
- The card page shows on its own, with the student's lessons held back until it is agreed.

## Write

Drawn by `MyLessons` (`src/components/MyLessons.tsx`) through `CardPrompt` in `src/components/CardOnFile.tsx`: change it there.

## Source

- `src/components/CardOnFile.tsx#CardPrompt`
- `src/components/MyLessons.tsx`, find `<CardPrompt`
