# ExpressionPicker

Uma expressão para ti: a cream sheet waits to be painted; Paint it reveals an expression, a second press its meaning, with the notes and other languages beside it.

**Markup:** `<section class="student-expressions">` (container `expressions`) with `.expression-reading` (`data-state`, `data-paint`): the `.paint-sheet` canvas, the expression painted on it, its facts as dabs, `Add yours`, and coral `Paint it` / `Paint another`.

- The sheet is `raised` in a `sheet` card, `squiggle-panel`. The paint is drawn live on a canvas in one of the palette's paints (blue, lilac, coral); the expression is set in Beth Ellen on the paint.
- Show meaning comes on the second press (7 Nov 2026). The notes (Exemplo, Noutras línguas with the language named small) and the facts (Tradução à letra, Quer dizer, Em inglês, Notas e/ou origem) are the main facts, as dabs in two columns where they fit.
- Students add their own version from `Add yours`; it is shown only once Inês approves it.

## Write

The student’s expression, drawn by `StudentExpressions` (`src/components/expressions/StudentExpressions.tsx`) in Your lessons, on the Idioms page and in Inês’s try-out. Change it there; its painting is `ExpressionPainting` and `painter.ts`.

## Source

- `src/components/expressions/StudentExpressions.tsx#StudentExpressions`
- `src/components/expressions/painter.ts`, find `paint-sheet__layer`
