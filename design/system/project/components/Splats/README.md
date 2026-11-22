# Splats

The organic paint marks that stand in for icons and pictures: eight a student can choose as their own, and the lessons' marks.

**Markup:** `<span class="asset-mark" aria-hidden="true"><picture class="asset-mark__picture"><img alt="" class="asset-mark__image" src="…/real-life-splat-v2.svg"></picture></span>`; `asset-mark--lands` makes it land once.

- A student's mark (`src/lib/student-marks.ts`): burst, bloom, pool, dance, drift, four, duo and scatter, each one of the V2 splats. It is their avatar on every card and in Inês's lists. The FAQ question mark is never offered.
- A lesson wears a mark by its kind (`LessonMarks.tsx`): a trial bloom, a weekly lesson dance, 60 min online burst, 60 min in Porto duo, 90 min online scatter, 90 min in Porto pool.
- Painted only in the palette: `blue-deep`, `lavender`, `lavender-soft` and a small `coral` accent. Always decorative (`alt=""`, `aria-hidden`).
- Neighbouring marks never repeat. A mark lands once, blooming from its middle on `motion-spring` in under a second; landed, it stays still (a Lessons card turns its mark a few degrees under the pointer).
- Never draw a new mark, crop one from the business cards or stickers, or use an emoji or a line icon where a mark belongs.

## Write

```tsx
<AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-hero__mark" lands priority />
```

A splat is always an `AssetMark` of a file in `public/visuals/`; `lands` lets it land once, `priority` for one above the fold.

## Source

- `src/components/BrandMarks.tsx#AssetMark`
- `src/app/faq/page.tsx`, find `className="faq-hero__mark" lands priority`
