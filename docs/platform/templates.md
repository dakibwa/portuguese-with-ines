# Tutor platform: the ten site templates

Status note for whoever picks this up next. Last updated 9 November 2026.

## Where it stands

- **Done: concepts.** Ten layouts and ten colour sets are drawn as working previews. Each one is filled with a made-up tutor in a different language and shown at desktop (1280) and phone (390) width.
  - Source: [templates/ten-layouts.html](./templates/ten-layouts.html). It is one self-contained page; open it in a browser.
  - Published preview: https://claude.ai/artifact/HbyncsUc7WFBsorVgj5LEA. It is private to Dan's account.
- **Implemented:** Dan chose all ten for Vowel. The Worker renderer in
  `workers/vowel/site-render.mjs` and styles in `src/vowel/` read a tutor record,
  render live setup previews and use the shared booking UI. Ten palettes work
  independently of layout. Teacher portraits are optional and included.
- **Activation pending:** provider configuration and a domain; see
  [VOWEL.md](./VOWEL.md). The concept page below remains reference material.

Dan's brief (9 Nov 2026): the templates "should all be quite distinct but have character in their own regard", and "we should cover most peoples tastes". They are the visible answer to competitors that "look like AI slop", so quality comes before quantity.

## The ten layouts

| Layout | Character | Type | Sample tutor | Its own colour set |
|---|---|---|---|---|
| Atelier | Painted splats and a handwritten name. This is Inês's site as it stands, and her site becomes this layout. | Beth Ellen, Montserrat | Spanish, Lucía, Valencia | Porto |
| Lexicon | The home page is a dictionary entry for "lesson" in the tutor's language, with thumb-index tabs. | Literata | French, Claire, Lyon | Plum |
| Grid | Swiss: huge type on a visible grid, with a real teaching table (der/die/das) in the hero. | Hanken Grotesk | German, Jonas, Berlin | Newsprint |
| Postcard | Airmail stripes, a postmark, a handwritten note, and the price on a stamp. | Alfa Slab One, Zilla Slab, Kalam | Italian, Giulia, Bologna | Riviera |
| Playground | For children and teens: stickers, flashcards, chunky outlines. | Fredoka, Lexend | Mandarin, Mei, London | Sherbet |
| Still | Quiet and spacious: manuscript squares and one seal as the logo. | Shippori Mincho, Zen Kaku Gothic New | Japanese, Haruka, Kyoto | Matcha |
| Scholar | A university press title page, with the syllabus as a table of contents. | EB Garamond | Greek, Eleni, Athens | Oxford |
| Poster | Street poster: wood-type words stretched to fill the width. | Archivo (condensed to wide) | Brazilian Portuguese, Rafa, São Paulo | Signal |
| Portrait | Led by the tutor's photo and a student's quote. The safe, professional choice, and dark by default. | Instrument Serif, Instrument Sans | Arabic, Layla, Amman | Midnight |
| Garden | Soft and organic: arches, leaves, and a marigold garland. | Young Serif, Onest | Hindi, Priya, Leicester | Eucalyptus |

All tutors, prices and quotes in the previews are invented. The sample URLs use `<name>.chapeau.school` only because "Chapeau" is the brand thread's leading name; it is not decided.

## The ten colour sets

Porto (Inês's navy, lilac, cream and coral), Newsprint, Plum, Riviera, Sherbet, Matcha, Oxford, Signal, Midnight (the dark one) and Eucalyptus. Each layout has its own set, and any set works on any layout: that gives 10 × 10 = 100 looks. The preview's colour chips show every combination.

A colour set holds **role tokens only**. The roles are:

```
ground surface wash ink muted line
brand onBrand onBrand2 brandInk
accent onAccent accentInk
pop onPop pop2
```

- In CSS they are kebab-case variables, for example `--on-brand-2` and `--pop-2`.
- `pop2` is decoration only and never carries text.
- Every set passes WCAG AA on these pairs: ink, muted and brandInk on ground/surface/wash; onBrand on brand; onAccent on accent; accentInk on ground/surface; onPop on pop. The preview page computes and prints each set's lowest ratio. Keep that true when adding or changing a set.

## The contract (agreed with the build thread)

- The tutor record gets `look: { layout, palette }`. Inês is `{ layout: "atelier", palette: "porto" }`.
  - The record is `tutors/<id>/tutor.json`, read by `workers/booking/tutor.mjs` (`tutorOf(env)`) and `src/lib/tutor.ts`.
  - Step 1 of the record was on branch `claude/project-thread-hqd06v` at the time of writing.
- A **layout** owns composition, type, shape, ornament and motion. A **colour set** owns colour only. Changing the set is free; switching layout is free; Dan reworking photos or pages is the paid change.
- **One booking system for every layout.** The booking journey and schedule are a single shared component set, skinned by layout tokens. Layouts never fork booking logic. In the preview this is the `.bk` card, and its look comes only from these tokens:
  - booking card: `--bk-bg --bk-border --bk-cell --bk-cell-border --bk-title --bk-rule --bk-pad --bk-shadow`
  - corners: `--r-card --r-ctl`
  - buttons: `--btn-font --btn-track --btn-case --btn-pad --r-btn --btn-border --btn-shadow`
- Prices come from the Worker's `lesson_types` table through the API. A zero price shows "Free".
- Words live in `tutors/<id>/content.json` (proposed, not yet built):
  - `hero{title,line}` and `principles[3×{title,body}]`
  - `about{heading,body}` and an optional `photo`
  - `faq[{group,items[{q,a}]}]`
  - an optional layout-specific `feature`, such as Grid's table, Lexicon's word or Postcard's city. Every layout must render well without it.
- Every layout must look right with short or long names and words, with or without a photo, and with 2 to 6 lesson types. The onboarding thread (https://claude.ai/artifact/KyUBnDuD7RrKYe5sZvUdAE) has tutors swipe through all ten filled with their own record, so each layout also needs a small live render that is quick on a phone.
- Tutor sites carry only a small "Site by <platform>" colophon. The colour sets deliberately avoid the platform's own look, which is the brand thread's exercise-book style.

## How the preview page works

These mechanics are specific to the preview, not to the real build.

- Each mini site sits in a `.site` element with `container: site / inline-size`. The phone layout is a container query at 700px, so the same markup renders both frames.
- The 1280 and 390 viewports are scaled into their frames with CSS `zoom`, which a ResizeObserver keeps up to date (`fitFrame`).
- `.fit` lines (Poster, Grid) are sized to their parent's width by `fitText`.
- Colour sets are applied with a `data-pal` attribute. The palette object `P` in the script generates their CSS and checks contrast (`minRatio`).
- Each template's CSS is scoped by a short prefix:

  | Prefix | Layout |
  |---|---|
  | `a-` | Atelier |
  | `l-` | Lexicon |
  | `g-` | Grid |
  | `p-` | Postcard |
  | `k-` | Playground |
  | `z-` | Still |
  | `o-` | Scholar |
  | `x-` | Poster |
  | `r-` | Portrait |
  | `w-` | Garden |

  Each template's markup comes from a function in `R`, and its sample tutor from the `T` array.
- The mini-site reset uses `:where()`, so it has zero specificity and every template's own margins win.
- To check a change by eye, run `node docs/platform/templates/shot.mjs`, adding a list such as `grid,still` for chosen concepts.
  - It uses the repo's Playwright after `npm install`, or the cloud sandbox's global copy.
  - It writes PNGs next to the page. They are ignored by git.
- To republish the preview to the same link, publish `docs/platform/templates/ten-layouts.html` to https://claude.ai/artifact/HbyncsUc7WFBsorVgj5LEA (pass that URL; read it first from a new session).

## Known rough edges in the concepts

- The lower halves of the pages (prices, booking card, footer) were built but only lightly checked at phone width. Look at them before treating any layout as final.
- Portrait and Garden use drawn placeholders where a tutor's photo or illustration would go.
- The Lexicon headword needs room below it for descenders (`padding-bottom:.24em`). Keep that when changing its size.

## Next steps

1. Dan picks which layouts to keep, swap or drop. If any are swapped, draw the replacement in the same page first.
2. With the build thread, add `look` to `tutors/ines/tutor.json` and a `content.json` for Inês, with no visible change to her site.
3. Build the shared booking and schedule components with the `--bk-*`, `--btn-*` and `--r-*` tokens, so that Inês's current look is exactly Atelier + Porto.
4. Build the other layouts one at a time as real pages that read the record. Check each at 1280 and 390 against its concept.
5. Give each layout a small live render for the onboarding swipe.
6. When the real components land, mirror them into the design system (https://claude.ai/artifact/XrweSPkR5KgKC8mF5xYhcY), or say in the PR that it is behind (see AGENTS.md).
