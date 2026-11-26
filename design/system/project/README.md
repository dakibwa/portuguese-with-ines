# Português com a Inês

Português com a Inês is Inês's site for one-to-one Portuguese lessons in Porto and online: four public pages that say how she teaches and what it costs, a booking journey where students book, move, cancel and pay for their own lessons, and her schedule, where she runs her week and her students. It should feel like her: warm cream paper, her dark blue, lilac and a little coral, splats of paint instead of icons, and her own hand in the headings and in every corner.

## Signature

- Warm cream `paper` with its grain under everything; full-width blue bands (`blue-deep`, the same grain) for the home hero, the booking banner, the schedule's banner and the footer.
- Inês's own hand: Beth Ellen for titles, headings, prices and Welcome; Montserrat for everything else; labels and buttons in small capitals.
- Splats of paint where another site would put an icon or a picture; Lucide line icons only inside controls and facts.
- A squiggle edge on every drawn surface; only dots are round. Cards lie flat on the paper; only what floats or moves lifts.
- Blue marks where you are and what you chose; coral is booking and money; lilac is quiet.
- Her voice: first person, warm and plain, with Portuguese where it is hers (`Olá Marta!`).
- Never: a box in a box, urgency, emoji, an exclamation mark in the interface, a gradient fade, green.

## How it is written

- **You write** a Next.js site (App Router, React, TypeScript) exported as static files: a page is `src/app/<route>/page.tsx`, a piece is a component in `src/components/`, and booking, payments and accounts are the `ines-booking` Worker in `workers/booking/`.
- **The look lives in** five stylesheets: `src/app/globals.css` (every page), `src/app/workspace.css` (booking, Your lessons and the schedule), `src/app/homework.css`, `src/app/schedule/teacher-schedule.css` and `src/app/idioms/idioms.css`; each page imports what it needs. The fonts come through `next/font` in `src/app/layout.tsx`.
- **Names** A token is `var(--name)`, the stylesheet's own variable, unless its `write` in `tokens.json` says otherwise (a `value` token is typed where its `in` says). A type style is not a class: `button-label` is how `.button` sets its words, not a class to add.
- **A new page goes** in `src/app/<route>/page.tsx`: `<SiteHeader currentPage="…" />`, then `<main className="<route>-page" id="main-content">` with its sections, then `<SiteFooter />`; a new place in the nav is a `SitePage` in `src/components/SiteHeader.tsx`. Booking, Your lessons and the schedule keep their real wrappers (below, How pages are built).
- **A mock, not a build** Load `components/bundle.css` (the site's five stylesheets and its fonts) and use the markup between a preview's `<!-- product -->` marks, inside the same wrappers. Never copy a `ds-` class: it is the card's frame, not the site.

## Where things are

| You need | Read |
|---|---|
| What each page is for | `1-pages.md` |
| How to lay out a small box | `2-compact-cards.md` |
| A colour, size, gap, edge, shadow or motion value, and how to write it | `tokens.json` |
| A piece, by what it does | `components/README.md`, then the piece's card and preview in `components/<Name>/` |
| The words to use, and the ones not to | Words the site uses, below |
| What was tried and rejected | Tried and rejected, below |
| The wordmark, splats, painted fields and email pieces | `assets/` (Logos, Splats, Fields, Email) |
| What a page looks like, wide and on a phone | `assets/Screens/` |
| The long design notes, with their history | `design/README.md` in the repository: background (Who wins, 4) |
| All of this drawn as one page to look at | `node design/system/make/site.mjs --system design/system/project`, then open `design/system/page/index.html` |

## Rules

- **paper-first** Every page is `paper` with its grain; a full-width blue ground is `blue-deep` with the same grain. Never a flat colour without the grain on a full-width ground.
- **coral-is-booking** Coral is booking and money: booking actions, booked lessons and anything that charges. What is chosen is `blue-deep`; what is quiet is lilac.
- **one-coral-fill** One coral button in a view, and two coral fills never side by side: the neighbour turns blue or outline. (Tried and rejected.)
- **coral-is-paint** `coral` is paint, never words on cream (2.8:1). Words that book or warn are `coral-action`, or `warning-ink` on a pale wash.
- **no-white-no-black** Never pure white or black on screen, and never green (`green` and `green-deep` are old names for the blue). The white of Google's sign-in button and of Meet's mark, and the printed homework sheet, are the exceptions.
- **no-fades** Colours never fade into one another. A gradient only lays a flat wash, draws hatching or a highlighter mark, splits a day or cuts a mask.
- **use-the-space** Space separates things and never fills a gap: a card is as tall as what is in it, what fits on one row is paired, and a button, pager or tag never drops onto a line of its own (the "stranded action"). (Dan, 9 Nov 2026, of the student profile; and 13 Oct 2026.)
- **one-decision-at-a-time** In booking, what is decided folds into a summary row with `Change`; account tools, choices, the calendar and the confirmation are never shown at equal weight (the "booking pile-up"). In Inês's schedule each card has one next button.
- **no-box-in-a-box** A sheet holds raised rows, never more sheets; content never gets a framed region of its own (the "panel pile-up").
- **column-not-window** A layout turns on its column's width (the `booking` and `student-card` containers), not the window's, and holds at every width between a phone and a laptop (the "intermediate-width squeeze"). Check it upright and sideways on a phone, both ways on a tablet, and on a laptop.
- **compact-cards** Every small box follows Compact cards (`2-compact-cards.md`): status beside the date, a toggle at the end of its own line, label, value and action on one row.
- **said-once** Each fact once on a screen: the banner names the page, so the card under it has no second title, and the full rules live only in Terms & privacy.
- **her-voice** Inês speaks: first person, warm and plain, students are "you", short sentences, natural punctuation, no em dashes, curly apostrophes.
- **sentence-case** Sentence case everywhere; labels and buttons are written in sentence case and set in capitals by the stylesheet.
- **calm** No urgency, countdowns, scarcity or blunt reassurance, and no exclamation mark in the interface, except the `Olá …!` that opens her WhatsApp message.
- **no-emoji** No emoji anywhere in the site.
  - check: forbid `/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u` in `src/**/*.tsx`
- **the-words** Use the words in the table below, every time: `Book a lesson` for every booking action, `Try again` for every retry, `Terms & privacy` for the policy, a time named once as `Porto time`.
- **squiggle-edges** Every drawn surface has a squiggle radius from the tokens, the right one for its size; only dots are round, and a count badge is a pill.
- **flat-cards** Cards have no shadow. Only a dialog, a menu, a button under the pointer and the segmented thumb lift, each with its own shadow token.
- **her-hand** Beth Ellen is only for page titles, section headings, prices, a principle's heading, Welcome and an expression on its paint: never what a reader scans or reads twice, never below `display-principle`, never in capitals.
- **splats-not-icons** Where another site puts an icon or an illustration, put a splat. Lucide line icons only inside controls and facts, and a globe always means online.
- **the-wordmark** The wordmark is Inês's lettering: never redraw it, set the name in Beth Ellen in its place, recolour it coral or add a mark beside it.
- **no-decorative-motion** Text, buttons and controls never make an entrance; only the splats land, the heading rules draw and the wordmark's hats hop (the "decorative motion" failure).
- **reduced-motion** With reduced motion, every page arrives at once and every splat and hat is still.
  - check: require `prefers-reduced-motion` in `src/app/globals.css`
- **focus-ring** Everything that takes focus shows the site's ring (a 2px `coral` outline over a `paper-light` and `blue-deep` halo); a text field shows one clear blue boundary instead.
- **empty-is-one-line** An empty state is one short line at the hint size, never a paragraph or an illustration.
- **keep-what-worked** A change that succeeded survives a failed refresh, and every failure offers its way on (`Try again`, `Message Inês`).
- **fonts-from-the-site** The fonts load with the site through `next/font`, never from Google at run time.
  - check: forbid `fonts.googleapis.com` in `src/app/**/*.css`
- **visuals-are-used** `public/visuals/` holds only what the site uses: no contact sheets, rejected generations or alternate exports.
- **remove-replaced** A change that retires a class, colour, asset or component deletes it from the site and from this folder in the same change.
- **rules-are-decisions** A new rule here comes from a deliberate decision by Dan or Inês, or a correction made more than once, with their words and the date; one screenshot or one preference is not a rule.

## Who wins
1. Dan's latest word, said in the conversation or dated on the Decisions page.
2. The code, on what exists: every value, name, class, variable and piece of
   markup. Where this folder differs, this folder is out of date; correct it
   in the same change.
3. This folder, on what is meant: its rules (the lines with an id). Where the
   code breaks one, the code has a fault. Do not copy it. Fix it if it is
   part of your task; report it if it is not.
4. Any other design document in the repository is background. Read the part
   about the piece you are changing; where it differs from this folder, this
   folder wins.

## Before you finish

1. Run `node design/system/make/check.mjs --system design/system/project`. It must report no errors. After changing a stylesheet, run `node design/system/make/assets.mjs` too, so the cards are drawn with it.
2. Look at what you changed at 1280px and 390px wide, upright and sideways, on the paper and on blue: `npm run dev` and open http://localhost:3000, or build, serve with `python3 scripts/serve-qa.py` and run that page's journey (`QA_BASE_URL=http://localhost:3000 node scripts/qa-<journey>.mjs`).
3. Put it beside the piece it should match: draw the page (`node design/system/make/site.mjs --system design/system/project`) and open the component's card.
4. Correct this folder where your change made it untrue: the token, the card, the preview, the screen. Same commit.
5. In your report, name the rules you checked by eye.

## About this reference

Built from the live site (https://portuguesewithines.com, `dakibwa/portuguese-with-ines`): the tokens from the site's stylesheets, which the checker compares them with; the cards and screens from the running pages, the workspace's cards and most screens re-cut on 22 Nov 2026 (`assets/Screens/README.md` lists the older ones). `components/bundle.css` loads exact copies of the site's five stylesheets and its two fonts, so markup written with these class names looks exactly like the site; `make/assets.mjs` makes the copies. The page after this one, Pages, says what each page is for. The same rules at more length, with their history, are in `design/README.md`: background, which this folder outranks (Who wins).

## How pages are built

- **Paper first.** Every page is `paper` with `paper-grain.svg` over it (the site sets `--paper-texture` on `body`). Blue bands (the home hero, the booking banner, the schedule's slim banner, the footer) are `blue-deep` with the same grain. Never white, never a flat colour without the grain on a full-width ground.
- **Bands and cards.** Public pages are full-bleed bands: blue, lilac (`lavender`, `lavender-soft`) and cream, with their content inside `page-pad`. Booking and Inês's schedule are cards on the paper: every card and dialog is one `sheet` (lilac laid thinly over the paper) with a 1px `rule` and a `squiggle-panel` edge; what sits on it to be pressed or read is raised in `raised` cream with no outline of its own.
- **Blue marks where you are and what you chose; coral is booking and money.** A chosen day, time, tab or option is `blue-deep`. Booking actions, booked lessons and anything that charges are coral (`coral-action` for words and fills, `coral` for paint). Lilac is quiet: a second action, a weekly lesson, a hint.
- **Use the space** (Dan, 9 Nov 2026, about the student profile; and 13 Oct 2026). Space separates things; it never fills a gap. A card is as tall as what is in it; pair what fits on one row; let a lone action span what it leads; never leave a half-empty card or a hole under a short one. A button, pager or tag never drops onto a line of its own (the "stranded action"). Every small box follows **Compact cards** (the section after Pages): status beside the date, toggles at the end of their own line, label, value and action on one row, and nothing said twice.
- **One decision at a time.** In booking, what is decided folds into a summary row with `Change`; account tools, choices, calendar and confirmation are never shown at equal weight (the "booking pile-up"). In Inês's schedule each card has one next button.
- **No box in a box.** Never a framed region for every piece of content (the "panel pile-up"); a sheet holds raised rows, not more sheets.
- **Respond to the column, not the window.** The booking column is a `booking` container and a student's card a `student-card` container; their layouts turn on their own width (`booking-container`, `student-card-wide`). Check every page upright and sideways on a phone, both ways on a tablet, and on a laptop. A wide composition that starts to clip or wrap at a middle width is the "intermediate-width squeeze".

To show part of a page outside the site, keep its real wrappers so every rule applies:

```html
<section class="booking-provider">        <!-- the booking container and its control type -->
  <section class="booking-steps"><div class="booking-stage">…</div></section>
</section>

<div class="teacher-page"><main class="teacher-main">
  <div class="teacher-workspace"><div class="teacher-tools-panel">…</div></div>
</main></div>
```

## Content

- **Voice:** Inês speaking, first person, warm and plain: "I teach European Portuguese." "We start from what you can already say." Students are "you". Short sentences, natural punctuation, no em dashes, curly apostrophes.
- **Sentence case** everywhere except labels and buttons, which are set in small capitals by the stylesheet (`text-transform: uppercase`); write them in sentence case in the markup (`Book a lesson`).
- **Calm, never salesy.** No urgency, countdowns, "only 2 left", exclamation marks or blunt reassurance. FAQ answers answer the question in a few plain sentences.
- **Nothing said twice.** The banner names the page, so the card under it has no second title. A screen says each rule once; the full rules live in Terms & privacy.
- **Portuguese where it is hers:** `Olá Marta!`, an expression's `Tradução à letra`, `Quer dizer`. Interface words stay English.
- **No emoji, no exclamation in the interface**, except the `Olá …!` that opens her WhatsApp message.

### Words the site uses

| Say | Not |
| --- | --- |
| Book a lesson (every booking action) | Book now, Reserve, Schedule |
| Change, Cancel (a student, in that order) | Reschedule, Edit booking |
| Move lesson (Inês), Move weekly time (the weekly run) | Change (for Inês) |
| late change fee (the €5) | penalty, cancellation charge |
| 60 mins (as a label), 60-minute lesson | 60 min, 1 hour, 60-min |
| `09:00–14:00` (a time range closes up) | 09:00 - 14:00 |
| `5 Oct – 1 Nov` (a date range keeps its spaces) | 5 Oct-1 Nov |
| Porto time, Los Angeles time (named once, after the time) | WET, UTC+0, GMT |
| Try again (every retry) | Retry, Reload |
| couldn’t | could not (only the 404 keeps "This page could not be found.") |
| Terms & privacy (one name for the policy) | T&Cs, Policies, Legal |
| Free (a €0 price) | €0 |
| weekly hours (Inês's pattern) | availability, working hours |
| Your name, Email (one label per field) | Full name, Email address |
| Free to change or cancel a lesson up to 14 hours before | Free cancellation |
| €5 to move or cancel later, or if you don’t show up | Late fee applies |
| Your card is charged at the end of each lesson | Automatic billing |
| Happening now, Next lesson | Upcoming session |
| Portuguese Lessons (home title) | European Portuguese lessons (said once, on Approach) |

## Colour

- `paper` is the page; `paper-light` (named `raised` inside booking and the schedule) is what is raised on a card; `sheet` is every card and dialog.
- Text is `ink` (10.6:1 on paper, 9.8:1 on a sheet). Quiet text, eyebrows and legends are `lavender-ink` (6.1:1, 5.7:1 on a sheet). Words that book or warn are `coral-action` (5.0:1, 4.6:1 on a sheet); `warning-ink` where coral would miss 4.5:1 on a pale wash.
- On blue, text is `paper` or `paper-light` (8.6 to 9.3:1); second lines `lilac-on-blue` (4.6:1). The home title's lilac word is `lavender` on blue at display size only (4.4:1).
- `coral` is paint, never words on cream (2.8:1): splats, a booked lesson's dot and edge, the booking alert's edge, a dab.
- `lavender` is the splats' lilac and the rules under headings; never body text.
- A booked day is `booked`, a weekly one `weekly`: the lightest washes that keep `ink` above 4.5:1.
- `rule` and `rule-soft` are decorative hairlines (2.1:1 and 1.4:1). A control's edge that must be seen is `outline-edge` (3.1:1).
- Never a gradient, never green (the old direction; `green` and `green-deep` are legacy names for the blue), never pure white or black on screen.

## Type

- **Beth Ellen** (`beth-ellen`) is Inês's hand: page titles, section headings, prices, a principle's heading, Welcome, an expression on its paint. One weight, set tight. Never for anything a reader must scan or read twice, never below `display-principle`, never in capitals.
- **Montserrat** (`montserrat`) is everything else: `body-copy` 18px (17px under 560px) for reading, 600 for a title in a card (`item-title`, `student-name`), 700 for labels.
- Labels are small capitals tracked wide: `button-label`, `nav-label`, `eyebrow-label`, `legend-label`. They name things; they never hold a sentence. Every bar of places speaks in that voice too: a student's places, the sliders and Inês's six tabs (0.7rem, 700, 0.12em).
- A two-line display heading drops its second line 0.4em (`display-second-line`) so Beth Ellen's descenders clear the capitals below.
- Display sizes are clamps; the styles give the size at 1280px wide and their usage notes give the clamp.

## Shape, depth and space

- **Thumbprint:** one hand scaled to each thing it lands on. Every drawn surface uses a squiggle radius, never a plain one: `squiggle-card` for the biggest, `squiggle-panel` for cards and dialogs, `squiggle-button` for filled buttons and `squiggle-button-alt` (mirrored) for outlined ones, `squiggle-tile` for calendar days, `squiggle-field` for fields and rows, `squiggle-thumb` and `squiggle-pill` for thumbs and pills, `squiggle-chip` for the smallest. The smaller the thing, the gentler the hand.
- Only dots are round (`radius-round`); a count badge is a pill (`radius-pill`).
- **Flat on the paper.** Cards have no shadow. Only what floats or moves lifts: a dialog (`shadow-dialog`), a menu (`shadow-menu`), a button under the pointer (its own colour), the segmented thumb (`shadow-raised`).
- Edges are 1px `rule`; the outline button 1.5px; the booking alert 1.5px `coral`.
- Insets are shared so neighbours line up: `pad-card` for every booking card, `pad-dialog` for every dialog, `page-pad` for every page. Gaps come from the twelve steps (`gap-hair` 0.3rem to `gap-section` 2rem), named the same in the stylesheet; a card's parts are `gap-card` apart, and two cards side by side `gap-panel`.

## Motion

Calm, quick and physical, and it never makes anyone wait.

- What lands or travels moves on `motion-spring` (gives about 4% and settles); controls answer on `motion-spring-firm`; everything else decelerates long on `motion-ease` or `motion-ease-out`.
- Pages turn into one another along the nav (a later page from the right): the header stays still, the nav's coral moves, the old page blurs away and the new one settles (`motion-page`). On a phone pages settle in place.
- Inside booking, decisions never turn the page: what a decision brings dissolves in from a few pixels below, what was there stays perfectly still, and the workspace eases to its new height.
- The little splats land once (`motion-land`), in reading order; the rules under headings are drawn once at a pen's pace (`motion-pen`); the wordmark's hats hop every four seconds. Nothing else loops, and text, buttons and controls never make an entrance (the "decorative motion" failure).
- Buttons lift 2px and their cut shifts on the soft spring; a press sinks them to 97%.
- Dialogs fade in briefly and keep their place; focus and dismissal are immediate.
- Reduced motion: every page at once, no movement, every splat at rest, the hats still.

## States

- **Hover:** a button lifts and deepens; a nav link turns `coral-action`; a list row or outline button fills `hover-wash`; the Meet pill fills `coral-action`, for a student as for Inês. Every hover answers at one pace, `motion-surface` (190ms) on `motion-ease`. No underline appears.
- **Focus:** the site's own ring on everything that takes focus: a 2px `coral` outline 5px out, over a 2px `paper-light` and a 5px `blue-deep` halo, so at least one ring clears 3:1 on every surface. The header's Booking pill takes a 2px `ink` ring. A text field instead shows one clear blue boundary in place of its border, never the rings.
- **Chosen:** `blue-deep` with `paper-light` (a day, a time, a tab, a segmented option, the agreement).
- **Disabled:** a filled button becomes the quiet outline at 55% and does not answer. Coral and blue appear only when the action is live.
- **Loading:** the calendar's room is held until it arrives, so nothing jumps; a form or times still on their way ease in. Inês's schedule opens in one step: her tabs in place above a week of the real one's shape (the next lesson's band, the month, the pager, the card with a turning splat), which the week replaces whole. Your lessons' placeholder holds all four places. Homework's progress card says what is happening under a turning splat, with a coral line that fills quickly, then ever more slowly.
- **Empty:** one short line at the hint size (`Nothing booked yet.`, `Nothing to check just now.`), never a paragraph or an illustration.
- **Error:** the coral booking alert with its ways on (`Try again`, `Message Inês`). A successful change survives a failed refresh.
- **Success:** the lavender panel with a 20px tick; a booking is celebrated once by its mark landing in the card's corner.

## Iconography

- **Splats are the pictures.** Where another site would put an icon or an illustration (a principle, a lesson card, a student, a lesson), put a splat (Splats). Painted in the palette, decorative, never emoji.
- **Lucide line icons** (`lucide-react` ^1.14, inline SVG, `currentColor`, stroke 2, or 2.4 at 14px inline with words; 13 to 22px) only inside controls and facts: globe for online, a little person (`user-round`) for in Porto, mail, lock, calendar, card, `circle-alert`, `circle-check`, `x` to close, chevrons for pagers, `repeat` for weekly.
- A globe always means online, so the clock is marked with a clock.
- **Dabs as bullets:** facts and lists use the FAQ dab (`--payment-dab`) as a mask, in turn blue, lilac, coral and lilac ink. Neighbouring dabs never repeat a colour.
- Google Meet's own mark is the one third-party logo, on its cream pill.

## Logo

The wordmark is Inês's own lettering of "Português com a Inês" (Wordmark): one cream raster used as a mask, painted `blue` on cream and `paper` on blue, its two circumflexes their own layers so they can dance. Never redraw it, set the name in Beth Ellen in its place, replace it with an uppercase text label, recolour it coral, or add a mark beside it. The favicon (`icon.png`) is a cream-and-lavender splat with a coral accent on dark blue.

## Assets

- **Logos.** `wordmark-cream.webp` is the 760 × 236 master. `icon.png` is the browser icon. On the share card (`og.png`), Inês's cream wordmark sits on the site's grainy deep blue. The open-centre lavender splat runs off the top and right edges.
- **Splats:** the eight V2 marks students choose from, the FAQ question mark, and three generated marks (`relaxed-practical-blob.webp` for booking, `conversation-` and `build-confidence-splat-generated-v2.webp`).
- **Fields:** the large painted fields that stay still under the page (the Approach fan, the Lessons open-centre splat, each with its phone crop) and `paper-grain.svg`.
- **Email:** the banner, the four dabs and Meet's mark that the transactional emails draw with.
- **Screens:** twenty-four screens of the running site: the public pages, booking, Your lessons and Inês's schedule, at 1280px and 390px wide. `assets/Screens/README.md` says which are from 22 Nov 2026 and which nine are older.
- `public/visuals/` holds only what the site uses. Never keep contact sheets, rejected generations or alternate exports there, and never cut new assets from the business cards or the sticker sheet without a deliberate review.

## Emails

The site's emails are one layout (`workers/booking/email.mjs`): the banner, a heading and one-line introduction, the date panel, a coral-dab note, the dab list of facts, numbered steps, one coral blob button and, rarely, one quiet underlined link, then dab footer facts and the site's link. Variants change lines, never the structure. They declare `light dark`: dark mode is the site's blue with cream text and lighter dabs. A student's email leads with the lesson's own clock; Inês's copies stay on Porto time.

## Tried and rejected

- The old green, editorial direction (archived 24 Jul 2026): `green` survives only as a name for the blue.
- The business card in the home hero (the "business-card transplant").
- A hand-like silhouette for the relaxed and practical booking mark (Inês, 13 Sep 2026): now an abstract cluster of blobs.
- The at-your-pace WebP mark on a chosen lesson's row: its white ground showed as a square once the column was sticky (retired 13 Oct 2026).
- Coral writing on the wordmark under the pointer (removed 9 Oct 2026); each hat tipping once in nine or thirteen seconds (now they dance).
- A line under the current nav link (12 Oct 2026): the coral moves instead.
- A solid lilac card: Dan chose the thinner wash back, with the grain showing.
- The time-zone pill above the booking card, and `Soonest times` (9 Oct 2026).
- Underlined words as buttons (27 Oct 2026): every rare action is the small outline button.
- A plain card heading for Welcome: it read as a regression; the splat and the handwritten Welcome stay.
- The six-step student stepper in Inês's schedule (2 Nov 2026): three checks and one button.
- A long WhatsApp invite: "quite wordy" (Dan, 2 Nov 2026). The site does the teaching.
- "Nervous beginners welcome." Now "Beginners welcome."
- Two coral fills side by side: the neighbour turns blue or outline.

## Upkeep

When a change retires a class, colour, asset or component, delete it from the site and from here in the same change; `public/visuals/` keeps only what the site references. A durable rule changes here, under Rules, with its date; `design/README.md` is background. Re-sync this system from the repository after visual work lands on `main`: tokens from `src/app/globals.css`, cards by capturing the running pages.

## Not synced

The previews are static copies of the site's markup, styled by its own stylesheets; there is no React bundle, so they do not respond to presses. Squiggles, layout, spacing, easing and duration are recorded from the stylesheet; changing them here changes the previews, not the site. Every colour, shadow and gap here is named the same in the stylesheet (since 9 Nov 2026), so a change made here is a proposal for `globals.css`, not a change to the site. The names and lessons in the cards are made-up sample data from the site's test fixtures (Ana Martins, Sam Known, Alex Moreau and the rest), never real students.
