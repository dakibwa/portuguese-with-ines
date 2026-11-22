# ScheduleExpressions

Inês's Expressions tab: write and paint an expression, search her collection, and check the translations students add.

**Markup:** `.teacher-expressions`: the definition header (`expressão idiomática`), outline `View page` and coral `Add an expression`, the painted preview sheet, search and theme fields, `Translations to check`, then `.teacher-expression` cards.

- An expression card is `raised`, `squiggle-field`: its title in Beth Ellen, a `Draft` tag, then the facts as dabs (Tradução à letra, Quer dizer, Em inglês, Exemplo), a theme chip, and `Edit`, `Preview`, `Publish` as one family of lilac small buttons.
- Students' own versions (`Noutras línguas`) wait in `Translations to check`; only those she approves are shown, never with the student's name. Empty: `Nothing to check just now.` at the hint size.

## Write

Inês’s Expressions tab: `ExpressionsTab` (`src/components/teacher/ExpressionsTab.tsx`), with `ExpressionEditor` for one expression, in `TeacherSchedule`. Change it there.

## Source

- `src/components/teacher/ExpressionsTab.tsx#ExpressionsTab`
- `src/components/teacher/ExpressionEditor.tsx#ExpressionEditor`
