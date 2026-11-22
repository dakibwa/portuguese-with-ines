# FAQ

Questions before booking: a lilac banner with the FAQ splat, an index of seven groups on a lilac rail, questions that open in place, and Ask me before you book.

**Markup:** `.faq-hero`, `.faq-layout` with `.faq-index` (numbered links) and `.faq-group` sections of `.faq-row` (`details` with a `summary`), then the `.faq-closing` band.

- Index items in `eyebrow-label`, `coral-action` when chosen, each with its two-digit number; the chosen group's heading in `display-section` with its rule drawn each time it is chosen.
- A question is `faq-question` in `ink` beside a coral plus that turns into a minus with a little give; the answer is `copy-small`. Rows part with 1px `rule`.
- Answers are calm, friendly and easy to scan: the question answered directly in a few plain sentences, practical detail kept, internal processes left out, no sales language.
- Without JavaScript every group stays readable.
- The closing actions are compact: coral Message on WhatsApp and outline Book a lesson.

## Write

```tsx
<FaqSections indexMark={<AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-index__answer-index" lands />} sections={faqSections} />
```

In `src/app/faq/page.tsx`, inside `<main className="faq-page">`; the questions are the `faqSections` list on that page.

## Source

- `src/components/FaqSections.tsx#FaqSections`
- `src/app/faq/page.tsx`, find `const faqSections`
