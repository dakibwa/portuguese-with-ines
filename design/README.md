# Current visual direction

This file is the canonical human-readable contract for the website's visual
direction, responsive composition, motion, and important interaction states.
Git owns the production implementation and browser-ready assets, and the
published site is the acceptance surface. When this contract and the site
diverge, reconcile them in the repository rather than maintaining a second
design system elsewhere.

The published [Português com a Inês design system](https://claude.ai/artifact/XrweSPkR5KgKC8mF5xYhcY)
is a mirror of this file, the stylesheets and the running site, for designing
with: colour and squiggle tokens named as the CSS variables, the site's own
stylesheets, and cards cut from the live pages. It is rebuilt from the repository when the look
changes and is never edited into a competing specification; where it and this
file differ, this file wins.

The current direction is:

- the footer's dark blue (`#203e82`) across the interface and logo, lilac
  (`#aaa4e6`), warm cream (`#f5ecd9`), and a small coral accent (`#ef5d3c`);
- organic, irregular, splatty marks rather than geometric emblems;
- Beth Ellen for expressive display text;
- Montserrat for body copy, navigation, labels, and other readable UI text;
- generous spacing and strong contrast, with no horizontal lines baked into
  the artwork.

## How this contract evolves

Keep each accepted correction in the narrowest place that can enforce it:

- this file owns the reader's job, information hierarchy, composition, copy
  tone, responsive behaviour, reachable states, and named failure patterns;
- `src/app/globals.css` (and `src/app/workspace.css` for what only the booking
  page, accounts and her schedule show), components, and `public/visuals/` own exact reusable
  colours, type, spacing, controls, layouts, and production assets;
- focused scripts and tests own failures that can be detected mechanically.

Add or change a rule here only after a deliberate product decision or when the
same accepted correction recurs. For agent-generated visual work, keep the
brief, inputs, model, and viewport stable for a matched before/after comparison,
retain the first result, and check that the correction helps both desktop and
mobile without weakening another important state. A one-off preference stays
with its change until there is evidence that it should govern later work.

FAQ answers should be calm, friendly and easy to scan. Answer the question
directly in a few plain sentences. Keep practical details that help a student
prepare, book or understand a fee; leave out internal payment and attendance
processes. Avoid blunt reassurance, sales language and unnecessary jargon.

Lesson homework stays attached to its lesson: for Inês on that lesson's row
in the student's dashboard and in the lesson's details, for the student at the
end of that lesson's row beneath their calendar on Your lessons. Photo notes and
drafts stay private until Inês reviews and publishes the sheet. Use short,
level-appropriate European Portuguese instructions, recall and useful practice,
with answers separate from questions. Offer Do online and Print worksheet.
Online submission saves a fixed copy for automatic marking; only Inês sees
those suggestions until she checks, edits and approves them. Homework to review
belongs in the relevant student row, as a coral prompt with its count.
Leaving a student's sheet saves their answers first. If saving fails, the site
menu closes and focus goes to the error beside their answers so they can retry.
Reading Terms & privacy opens its dialog without leaving or saving the sheet.
Inês's new sheet is the booking journey's step structure, one decision per
step: **What did you work on?**
with one large lilac `Take a photo` blob (a coral dab carrying the camera, a
splat cropped into its corner; it opens the phone camera) and small cream
`Gallery` and `Type it` blobs; then **Level** and **Length** as booking's time
blobs, the student's last level and 15 minutes already blue. Each tap moves on,
taken decisions fold into booking's summary rows with `Change`, `Back` steps
back, and the last step is one coral `Generate homework`. Each step's question
is Beth Ellen under a small splat on the booking panel, and steps dissolve in
as booking's do. While Claude works, a progress card says what is happening
(`Reading your notes`, then `Writing the homework`) under the turning loading
splat, with a coral line that fills quickly, then ever more slowly. No
explanatory sentences: privacy is a lock icon whose words are on hover and for
screen readers. The draft is a preview first, with `Fine-tune` (a dab that
stays pressed blue) beside the format control. One tick and `Publish for
student` close it. Approved homework reads **Done** for both: a blue Done chip
and a lilac Done band with a blue dab for Inês and on the student's sheet, and
`Done` on the student's card. Inês's "Homework to review" email is a booking
email: heading, student, sheet, lesson date and one coral `Review homework`.
In review, settled answers
fold to the student's words, the mark and the feedback beside `Change`, under a
tally of dabs.
Inês marks each answer with the sliding `Correct` / `Try again` control and
writes the feedback herself; an answer still waiting for her is edged in coral,
and a placeholder is never approved as feedback. The print version uses black text, readable
type and writing lines on white A4 pages, with optional answers on separate pages.
Homework speaks the booking journey's language and uses the room it has.
Every small
button, tab and chip is a filled paint dab cut to the site's squiggle shapes:
the sliding `Do online` / `Print worksheet` control, state (`Feedback from
Inês` in blue), the way back, `Show answers`, Inês's editor links and the coral
`Homework to review` with its count on a cream drop. The student reaches a
sheet from its lesson's row under Past lessons: the row's chip (coral `Start`
or `Continue`, lilac `With Inês`, blue `Done`) opens the sheet in the card's
place, and `Your lessons` is the way back. The sheet's head
is the Lessons hero in small: a lilac band, a large Beth Ellen title and a big
splat cropping across its right edge, slimmed on a phone on its side. Each
section opens with its own splat, a small `01` and its Beth Ellen name; on a
wide card those take a rail on the left and the questions fill the rest, and
sections are separated by space, not rules. Question numbers sit on the
confirm step's paint dab, feedback reads as one of its facts (blue when right,
coral to try again), and helpful lists use the same dabs. Neighbouring splats
and dabs never repeat. On paper it stays ink-light: Beth Ellen headings, the
Bloom splat as a thin outline, grey rules and writing lines, and a single coral
drawn rule; everything else is black or grey on white. The name line is on the
worksheet only; a printout that includes the answer key leaves it off.
See
[the homework contract and teaching sources](../docs/lesson-homework.md).

## Named failure patterns

Use these names in review so recurring problems are easy to recognise:

- **Business-card transplant:** treating historical print artwork as a web
  layout or placing the business card itself in the hero.
- **Panel pile-up:** giving every piece of content its own framed region until
  no single task or reading path is dominant.
- **Booking pile-up:** showing account tools, choices, calendar, lesson detail,
  and confirmation at equal prominence instead of letting completed decisions
  collapse.
- **Intermediate-width squeeze:** preserving a wide desktop composition after
  headings, controls, or the seven-column calendar have started to clip or
  wrap unnaturally.
- **Stranded action:** a button, pager, tag or short label dropping onto a
  line of its own, or leaving a half-empty row, where it would share the row
  with its neighbours; or a phone on its side or a short window keeping an
  upright phone's tall bands, so the task starts below the first screen. Put
  each thing where the space is: pair what fits, let a lone action span what
  it leads, and slim headers and bands on short screens. Check a page
  upright and sideways on a phone, both ways on a tablet, and on desktop.
  Small cards are compact: a status or toggle ends the line it belongs to
  (`Already paid` beside the lesson's date, `Show weeks` beside the run's day;
  on Students these are small soft toggles and lilac buttons), a fact's
  name, value and action share one row, a card is as tall as its content,
  and nothing it says is said by its neighbour or its parent too. On a
  narrow card an action wraps beneath its line at the right, whole, rather
  than squeezing it. Its opposite is the stacked card: date, then facts,
  then a tick, each on a line of its own. On Inês's phone the same holds:
  `Join Meet` sits beside the lesson under the `Happening now` label, a
  receipt's status sits
  beside the student's name, and a Profile detail is a student's detail row:
  its name above its value, its button at the right.
- **Decorative motion:** adding ambient loops, click delay, entrance
  choreography for a page's text, controls or sections as it loads, or any
  movement that makes a reader wait or does not explain a state change. The
  page turn, the phone menu opening, the little splats' one-time landing, the
  rules drawn under the headings and the wordmark's hats dancing on their beat
  (see Motion direction) are deliberate.

## Contrast and accessibility

A student's own price (from a code, or set by Inês) prices every lesson of
theirs at that length, one-off or weekly; the trial keeps its own. Their
90-minute price is 1.5 times their 60 unless one was set for
90 minutes; her price fields show it as the 90-minute placeholder once she
types a 60, and their profile marks it `1.5× their 60`. Each length choice carries its price (`60 mins · €20`), in booking,
in a lesson's change and in Inês's lesson form, rather than on a line of its
own. Recurring checkout shows the final per-lesson price before confirmation.
Code entry belongs only under Edit details, behind the small “Have a code from
Inês?” disclosure; booking and lesson-length changes have no code field. The
student applies a price for each length, so a 60-minute code and a 90-minute
code can both be saved. The disclosure note says the code sets their price for
lessons of that length, including ones already booked.
Students can continue editing while a save is pending; a reply preserves newer
drafts, and independent name/NIF saves cannot undo one another.
They get an accessible status message and see that saved price on return.
Duration changes show their actual price before submission. A price Inês
sets to €0 reads `Free` wherever a price would show, never `€0` (`60 mins ·
Free`, and in a student's `Price` row `90 mins · Free · as their 60`), and a free lesson's own line adds
`· Free` beside its length and place. No valid-code
suggestions, catalogue, countdown or expiry pressure belong in this flow. Only
some students have a code, so nothing may suggest most should: sign-up carries
no code field, and Edit details keeps the small disclosure, listing saved
rates only once there is one instead of a standard price for everyone.

Text colours must meet these accessible contrast requirements:

- the emphasised last line of the Approach page heading (`talking.`) uses
  `--blue` on the lavender panel. Cream measured 1.95:1 there, while blue on
  lavender holds 3.2:1, the same tonal relationship the home hero uses for
  lilac on blue;
- body ink uses `#1a3169`, and the eyebrow lilac uses `#554f91`, so small text
  clears AA on the lavender and cream panels. Both are imperceptible on cream;
- completed booking-choice values and change actions use body ink at no less
  than 14 px, so both remain readable on the lavender mobile surface;
- Google Meet setup warnings and errors use `#a73523` on the soft lavender
  panel, giving small feedback text 4.78:1 contrast. The coral action colour
  measured 4.25:1 on that surface;
- the booking cards' sheet is `--lavender` at 13% over the page; coral
  action text on it measures 4.63:1. A booked day is `--coral` 15% over
  `--paper-light` and a weekly one `--lavender` 50%, each the lightest that
  keeps its own coral or lilac-ink text above 4.5:1.

The `--blue`, `--blue-deep`, `--lavender`, `--paper`, and `--coral` fill
colours stay as they are.

Every text field, in sign-in, Edit details and Inês's schedule forms as well
as the booking notes, shows focus as one clear blue boundary in place of its
border, never the coral and blue rings drawn around buttons and links.

With JavaScript disabled, public pages retain ordinary navigation links at
every width, all FAQ categories remain readable, and terms/privacy are readable
in the booking document. With JavaScript enabled, the existing mobile menu,
category selection and terms modal enhance those documents.

## Current responsive composition

- the home hero does not contain the business-card artwork, and the “Slow is
  fine” and “Talk first” marks use their generated versions;
- the FAQ banner pairs its heading with the FAQ splat, with a smaller mark
  beside the heading on mobile; user-facing copy uses natural punctuation
  rather than em dashes; and the Approach callout says “Beginners welcome.”;
- above 900px, the three home principles form a stacked soft-lavender rail in
  the right side of the hero without merging into the surrounding cream page.
  At 900px and below they stack after the blue introduction, which keeps the
  mobile reading order;
- the browser favicon is a generated cream-and-lavender organic mark with a
  coral accent on dark blue;
- the Lessons page closes with one compact blue card: the
  `In Porto or online` splat and title, the payment sentence, then `Book a
  lesson` and `Payment questions` as a pair of buttons. On narrow screens its
  parts stack inside the same card rather than becoming separate bands;
- above 820px, the same soft-lavender rail treatment separates the Approach
  teaching list and the FAQ index from their cream content columns. At 820px
  and below those sections keep their simpler cream stacked treatment. From
  821px to 999px, the Approach teaching-list headings wrap naturally instead
  of being clipped at the right edge; from 1000px upwards they remain on one
  line;
- a visit launched from Akibwa with `?from=akibwa` carries a compact, neutral,
  pinned version of the portfolio masthead above this site's own header. It
  retains the original “I’m Daniel” / “I’m Akibwa” flick, the exact “Building
  in the age of AI.” line, and the coloured Home, Projects, Career and Taste
  Library links. Its green rule spans the full viewport and is the boundary:
  everything below it remains the real Português com a Inês site. The masthead
  persists through scrolling and internal navigation in that tab; leaving by
  one of its portfolio links clears the visit state. Direct visits never show
  it. Reduced-motion visitors see the Daniel state without animation.

## Public-page hierarchy

Use the available space for orientation and decisions rather than repeating
the same identity or action:

- the shared header is the site's primary `Português com a Inês` wordmark;
  page headings describe the visitor's current subject or task. The footer
  repeats the wordmark at a quieter scale in cream on dark blue as an
  intentional sign-off, rather than introducing another headline;
- each page has one dominant action in its content. A later section must not
  repeat the same call to action simply to fill a closing band;
- on Home, the display heading is `Portuguese Lessons` and the
  supporting line describes one-to-one lessons, online or in person. `Book a lesson` appears
  once. `How I teach` and `Lessons and prices` sit beside it as quieter outline
  buttons rather than plain links or a second strip beneath the hero; on a
  phone they share a row beneath it, a size smaller below 414 px and sized to
  their labels below 360 px, so neither label wraps. Wherever the three do not
  fit on one row, `Book a lesson` spans the pair beneath it rather than
  dangling alone. The blue
  hero has no painted field of its own: the heading, its rule and the actions
  have the panel to themselves;
- Approach, Lessons, FAQ, and Booking follow the same hierarchy: the brand
  anchors the shared header (on Booking, its one bar) and footer, while each
  page owns a task-specific heading and only the actions that meaningfully
  advance its reading path.
- a missing address keeps the shared header and footer around one Beth Ellen
  line on the paper, `This page could not be found.`; the header's navigation
  is the way on, so the page adds no action of its own.
- the closing Lessons and FAQ actions stay compact. In the FAQ, WhatsApp and
  booking sit together on one row when space allows and wrap on phones; do not
  turn each choice into a separate tall band. The Lessons payment note says
  what a visitor will see before confirmation, without promising Stripe when
  the production booking mode offers direct payment.
- booking and privacy information belong to the booking context, with the
  minimum useful text visible. Sign-up itself carries none of it: the booking's
  sign-in card shows `Almost there` as the step's only visible heading, then
  Google sign-in and the account form (its fields two to a row where the card
  has a tablet's or a sideways phone's whole width), with no data-use summary, privacy
  details, Google password note or consent checkbox. The account form ends
  with an optional `NIF` field whose placeholder says `Optional, for your
  receipts` (named `NIF (optional, for your receipts)` for assistive
  technology), with no note beneath it;
  students add, change or clear it under Edit details. The final booking
  action follows the payment and change conditions for the selected method.
  A `Terms & privacy` overlay holds the details, without adding a disclosure
  beneath the workspace. Use five short sections: `Booking`, `Payments`,
  `Changes`, `Your rights` and `Privacy`, with everyday wording and labelled
  points. The opening line explains the 14-hour booking notice. Payment timing,
  free changes until 14 hours before, the €5 fee inside that window and
  the €5 recorded no-show replacement charge remain explicit. Consumer rights,
  Inês's sole-trader contact details and the privacy notice follow in the same
  reading column, in the site's Montserrat text on the lilac sheet every
  dialog shares, with copyable text
  and readable wrapping at 320px. A quiet, sentence-case `Terms & privacy` footer link
  sits at the bottom right on desktop and mobile, with a comfortable touch
  target and no button treatment. It opens the same overlay on the current page,
  without requiring sign-in. The overlay scrolls within the viewport, keeps its
  close button visible, traps keyboard focus, and closes with Escape or a click
  outside. Closing returns focus to the link and preserves the page position,
  booking choices, notes and agreement state. When lesson management is underneath,
  Escape closes only the top overlay and restores focus within the remaining
  dialog, which keeps the page scroll locked. A backdrop dismissal requires the
  gesture to start and finish outside the dialog; dragging from its content or
  fields preserves it. An open account menu leaves Escape to the top modal and
  preserves the modal's original return target. The old `/terms`,
  `/booking-terms` and `/privacy` pages redirect into booking. Old `/terms`
  bookmarks retain their policy section; there is no
  separate legal-page hero, index or marketing treatment. Payment wording follows
  the method shown at booking and never implies every booking saves or charges a card.
  When after-lesson charging is active, every booking presents a short
  `Agree to terms & privacy` control following one visible payment and €5
  summary. The underlined `terms & privacy` text inside it opens the overlay;
  reading it never selects the agreement. The toggle starts unselected, has a
  distinct selected state and supports keyboard toggling. It authorises the
  described charges and acknowledges the privacy notice; there is no repeated
  authorisation sentence or second terms link. The final action names the
  number of lessons and says `agree to pay`, even though no money is taken
  at booking. A payment configuration failure replaces action with a
  visible inline error instead of confirming without a usable payment method.
  A free lesson (a price Inês set to €0) has no agreement control, no card
  step and no €5 line: its summary says it is free with no card needed and
  asks for the usual notice, the action is plain `Book lesson`, and paused
  card payments do not stop it.

## Public polish

- every secondary action is a button: an outline on cream, a light outline on
  blue, at the compact size beside a coral primary action. Underlined text is
  kept for links inside sentences and the quiet `Terms & privacy` footer link;
- the footer has a thin lilac top border so it stays distinct beside blue
  sections, and hugs its content. On desktop it is one row, no taller than about
  120 px: the wordmark, the four destinations, a thin divider, then `Terms &
  privacy` at the right. On phones the destinations live behind the footer
  `Menu`, with `Terms & privacy` beside it where both fit and beneath it on
  the narrowest phones;
- banners give the page back to the task, and their art sits halfway down the
  band rather than up in a corner. The Lessons banner is about 230 px on
  desktop; on phones it becomes a lavender band with the splat in a
  square-cornered blue strip at its right edge, like the wider layouts' blue
  column. The FAQ banner is about 200 px, 150 px on phones, with its question
  splat whole inside the page margin. Stacked, the Approach fan comes in from
  the right edge halfway down the heading rather than trailing beneath it.
  Booking has no banner of its own: its one bar names it,
  so the booking's choices start on the first screen;
- the three Lessons cards each have their own squiggle outline, and their own
  splat comes in large from the card's top-right corner, cropped by its edge;
  once landed it moves only to turn a little while its card is pointed at. The
  trial card is lavender. Their rows align across
  the cards: name, the price with its length as a small tag beside it (`60 mins`)
  where the name does not already say it,
  a one-line description, then one full-width button, so no card has an empty
  foot. The whole card opens booking with that lesson chosen. Hover and
  keyboard focus add a quiet colour wash to the card, the button answers on
  its own (it lifts slightly and fills) and the corner splat turns a few
  degrees. The closing blue card
  keeps its two buttons on the right, stacked when the width tightens, and
  moves them beneath the copy only on phones, side by side where both fit;
- the header logo starts on the page's left edge, like the footer logo and the
  headings beneath it, rather than floating inside a wider box;
- no handwritten descender may cross other text. Beth Ellen sits low in its
  line box, with descenders about 0.4em below the baseline, so a display
  heading leaves that room before the text that follows. The second line of a
  two-line heading drops by the same amount, as `talking.`, `Lessons` and
  `before booking?` do. On phones, `Beginners welcome.` wraps with the same
  clearance;
- on a stacked FAQ the last question's rule closes the list, with no second
  full-width rule beneath it. Opening a question is one motion: the answer grows and fades in while the
  plus makes a half turn into a minus; where a browser cannot animate to the
  answer's height it simply appears;
- the menu gives each of the four destinations its mark and a short note
  of what the page is for, then `Sign in` (`See or change your lessons`, with
  the sign-in card's mark), which closes the list on every page and at every
  width for anyone not signed in. Signed in, the list keeps its four
  places: `Booking` is already their lessons. Then a small blue card with
  `Book a lesson` and `Message on WhatsApp`; a large splat is cropped into
  the foot of the screen so the menu never reads as an empty page. Links are
  named by destination, with the note as their description. On a sideways
  phone the places sit two across, or three across with `Sign in`, so the
  list stays two rows and the card's buttons stay in view;
- the FAQ shows one section at a time. The index switches sections in place,
  fading the chosen one in without scrolling the page, and the address keeps
  `#faq-<section>` so links open the right section; on phones, where the index
  sits above, the chosen section is brought into view. Modified clicks retain
  the browser's ordinary navigation behaviour. Section headings carry no number
  because the index already does, and questions sit close to body size;
- text is not selectable by default, so a tap or drag never paints the page
  blue. Anything a visitor may reasonably copy stays selectable: form fields,
  the terms and privacy text, booking references, alerts and error messages,
  and the lesson facts in Inês's schedule.

## References retained in this repository

`design/business-cards/` contains the original business-card exports. They are
historical brand references, not competing website specifications. The social
share image uses the complete open-centre lavender splat from the lessons page
on the right of one continuous blue background, with clear space around it.
Keep its tips intact and separate from the words.

`design/stickers/` contains the historical sticker sheet. Do not cut new
production assets from it unless a new asset is deliberately reviewed and
approved.

## Production assets

`public/visuals/` is production-only. Every file there must be referenced by
the current site:

- the social share-card splat and the approved page fields live in
  `public/visuals/generated-splats/`;
- the small splatty V2 emblems live in `public/visuals/v2-splats/` as SVGs or
  size-matched generated WebPs;
- the relaxed/practical booking mark is an abstract cluster of rounded blobs,
  with navy, two lilacs and a small coral accent, not the hand-like silhouette
  Inês rejected;
- a chosen lesson's row wears a transparent mark: a generated mark on a white
  ground shows as a white square over the sticky summary column;
- the wordmark and paper texture support the shared site shell.

Do not keep contact sheets, rejected generations, alternate raster exports,
mockups, or unused candidates under `public/`.

## Teacher schedule

For a signed-in teacher, every booking entry point opens `/schedule/`, including
signing in during the student booking flow. A teacher she has also added as a
student keeps the schedule too, and opens Your lessons only when the address
asks for it. Inês has one teacher workspace;
student accounts and signed-out visitors keep the booking experience.

Inês needs to see her week, make time for students, and protect her days off.
The timetable is the primary surface, in the existing cream, blue and lilac
palette. Keep expressive type in the page/section headings and clear Montserrat
type in dates, times and lesson details. Use colour to distinguish booked lessons,
usual lesson starts and days off; avoid a wall of administration forms.

Online only: Inês labels a whole day with its `Online only` switch beside
`Day off`, and some hours from the choice at the times, on the Timetable and
never in a dialog. The details are under "Online only, in one colour" below.
Labelled time affects
new student choices alone: usual hours and time off still apply, and already
booked lessons keep their place and time. The student's Where choice refreshes
free times and removes selected times that cannot be booked in the new place.

- Open on the current Porto week with booked lessons placed at their actual
  times. One calendar holds everything: pressing a time, or dragging
  over several, opens a small choice at them, their `From – Until` times to
  the minute, then `Time off`, `Online only` or `Extra hours` (a single time
  also offers `Add a lesson here`); nothing saves until she chooses. Extra
  hours are exactly her weekly hours for one date: lessons can start every
  booking interval from `From`
  until before `Until`, so `15:00–17:00` at 30 minutes starts 15:00 to 16:30,
  which one dab under the times says (`Lessons can start 15:00–16:30`) while
  `Extra hours` is the kind in view. The chip is offered only where it would
  let a lesson start: never inside her weekly hours, on a day off, a past
  date or a whole day. Hours already set open as their block, their kind
  pressed, to change the times, switch the kind, `Open again` (time off and
  online only), which opens just the times set, or `Not working` (extra
  hours), which takes just the times set away. Time off and extra hours are
  never both. Each date has two switches, `Day off` and `Online only`, and a
  day is one or the other: a day off loses its online-only hours, and online
  only reopens a day off, keeping its hours off. Time off is hatched, online
  only is sky blue and extra hours take the weekly hours' wash, each labelled
  with its times (`Extra hours 15:00–17:00`), and all save as she chooses;
  the line under the calendar says what changed (`Lessons can start
  15:00–16:30 on Tue 1 Dec.`, `Not working 15:00–17:00 on Tue 1 Dec.`) or
  what failed.
  Weekly blocks such as lunch are shown but not toggled per date. Keyboard and
  touch input must work without dragging.
- A sliding tab bar with a thin dark-blue border groups `Students`, `Timetable`,
  `Receipts`, `Expressions` and `Profile`. Open on `Timetable`;
  keep `Edit weekly hours` beside its month-and-year heading and the week
  pager at the row's right edge, as the month pagers are. Up to a small
  tablet, held either way, the bar holds all five tabs in two rows without
  scrolling, three above two, every tab one width, so no tab hides past the
  edge; the two beneath sit centred under the gaps above, never stretched to
  half the bar each. Wider, they share one row. Dates
  are centred evenly across the timetable header; omit the Porto gutter label.
  Arrow keys, Home and End move between
  tabs. Unsaved hours survive tab changes. Timetable
  keeps an unsaved dot while weekly hours have a draft; Students shows a coral count of students and notices needing attention,
  absent at zero. Profile holds her sign-in email, password link, Google Meet
  connection and Sign out, keeping account controls away from daily work.
- One pager turns the Timetable's week and the Receipts month: two solid blue
  arrows that never move, and `This week` / `This month` as the quiet lilac
  chip, matching
  `Edit weekly hours`, to their left only while she is
  away from the current one, because the heading already names where she is.
  Its place is held while it is out of sight, so the arrows, the heading and
  the grid beneath never shift between states, and a narrow screen lays
  heading and pager out the same either way.
  Using it returns to the current period and puts focus on the heading, since
  the button has just gone. It is never shown, or dead, on the current period.
- Keep help short. The
  active tab supplies the page name; avoid repeating it under an eyebrow, and
  say a thing once. Any helpful list uses the confirm step's splat dabs
  (`booking-payment-facts`). Her tool cards (Google Meet, Students,
  Receipts) are the booking cards' lilac sheet,
  with what she presses raised in cream inside them, as the student side's
  are; the week's timetable keeps its own paper. They
  use the site's buttons: coral for the main action, outline for the other, a
  small outline button or the quiet lilac chip for a rare one. Weekly hours is headed `Your weekly hours` with two dabs:
  tap or drag to mark when a lesson can start, and that it repeats every week.
- `Edit weekly hours` in the Timetable opens the repeating weekly pattern in
  the same calendar. `View lessons` returns to the chosen week and day without
  losing unsaved hours; only `Save weekly hours` saves them, and booking
  activity must never silently discard that draft.
  The edit control also marks a waiting draft. Clicking or
  dragging marks lesson start times. Preserve exact existing first/last-start
  values and provide an exact-time editor. The last start is not a finishing
  time.
  If changed hours cross an existing lesson, say once that it is outside the new
  hours and stays booked, then show each as a booked-lesson card. Check booked
  lessons before allowing a save.
  Half-hour cells include both quarter-hour starts when the booking interval
  is 15 minutes. A partly available cell names its actual start and shows a
  mixed state; clearing it removes its selected starts, and enabling an empty
  cell enables both. Dragging includes the final cell, and the exact-time
  editor retains control of off-grid windows.
- Under the week's key, without a card: `Clashes`, then `Coming up`, side
  by side from 900 px and one above the other below that, each left out
  when empty. A clash is a lesson to come that her time off or
  online-only hours left standing: booked on a day off, inside hours off, or
  in person inside online-only hours. Each is a booked-lesson card with its
  date and the reason in two words (`day off`, `hours off`, `online only`),
  and its `Change` opens the lesson. Nothing here moves or cancels a lesson
  on its own. `Coming up` lists what she has set that is not on the week in
  view (consecutive whole days as one line, `Wed 25 Nov – Fri 27 Nov` / `3
  days off`; hours as `Off 09:00–12:00`; extra hours as `Extra 15:00–17:00`,
  not on a day off; an online-only stretch as `3 days
  online only`), the next four and `And 3 more later on`; pressing one turns
  the Timetable to its week and day. Each day is one switch; there is no
  choosing several days at once.
  Time off prevents new bookings; existing lessons stay until she changes them.
- A booked lesson in her way (outside new weekly hours, or on days she is
  taking off) is one small card: the student, the date and time, and `Change`,
  which opens that lesson's own dialog to move or cancel it, keeping her
  draft.
- `Students` combines bringing students in and ongoing care in one searchable
  list. Show each student once, in the first group that fits, each group a
  vertical lane of cards,
  headed in the small eyebrow with its count and one hint: `Needs you`
  (payments to check, recent lesson changes, first lessons, homework), `To do`
  (`Send each their link.`), `Waiting on them` (`Link sent. They haven’t
  finished yet.`) and `All set` (`Fully set up and paying for their own
  lessons.`), then `Dormant`. Lanes sit side by side where 15.5 rem each fit (no wider than
  26 rem a lane), wrap into fewer on a narrower screen and stack on a phone
  with no sideways scroll; cards stack down a lane. A lane reads how far its
  students have got, so nothing is dragged and nothing writes a status. Within
  a group, nearer lessons come first. A notice says what happened in one bold
  line; the facts flow beneath
  at full width and break only between facts. Work still to do has its one
  quiet action at that line's end (`Connect`, `Open in Stripe`, `Open`), at
  every width, never on a row of its own; it has no cross and
  clears when done. Nothing their card's checks already say is a notice: a
  card a student saves is their `Card saved` tick and nothing more (12
  November 2026). A notice that only tells her something says it all, a
  first lesson's note in full too, so it has no action, only a small round
  cross at that line's end: pressed, the notice goes at once, on every device,
  and focus moves to the next notice or the student's name. The action
  and the cross are one height, centred on that line, and stand as far from
  the notice's top edge as from its right, never against it. Inside a
  student's own card it does not say their name again (`Changed their
  lesson`, `Cancelled their lesson`, `First lesson`); outside
  a card, on the Timetable and under `Check first`, the name stays. Above the groups, `6 of 21 students are all set`
  over a thin coral meter counts active students whose checks are all done.
  Count students needing her attention once, not each task; her own next
  steps are on their cards, never in the badge. Meet and unmatched payment
  notices remain visible above the list; never match a payment to a student
  by name alone.
  Each card holds their splat and name, a `Weekly` tag in its top right
  corner when they have a weekly run, three small checks and the one thing to
  press next, and only the dabs that need her eye. The
  checks are `Signed in` (or `Link sent 5 Sept`, or `Not signed in`), `Card
  saved` (or `No card yet`, or `Lessons not on card` when a saved card doesn't
  yet cover lessons she added to come; a saved card with none of those counts
  as done, so nobody already paying is asked for a card; and no agreement
  stands in for the lessons themselves, so one of hers still off the card
  reads `Lessons not on card` whatever they have agreed to)
  and `Paid up` (or `€70 open` in coral, counting
  past lessons she added that were neither charged nor ticked paid, one she
  added after it happened included); a
  blue dab marks each one done. Card and paid are omitted when cards are
  unavailable or the student is free at every length. The next button is
  coral when the move is hers (`Invite`, then `Ask to pay`, then `Ask for
  card`), lilac `Send again` once a link is out and the move is theirs, and
  absent when they are all set. A dormant card shows no checks, only lilac
  `Come-back email` (or `Invite back` with no email). The card she opens is
  taken out of its lane and shown once at full width as the focused student
  view: the board, its toolbar and the progress give way to that one card,
  whose Close goes back; the site's navigation stays as it is, and it is not
  a modal. A paid lesson or newly sent link never moves the open card; on
  return its current lane, saved search and notices appear, with focus on its
  name (or search when a renamed name no longer matches).
  Their name opens their dashboard in the same card. One page, no switch:
  - The top row holds everything she does with the student, so no rail of
    tools sits below it: name, the three checks, her actions
    (the next button, `Add a lesson`, then `Sign-in link` when all set and
    `Mark as dormant` or `Mark as active` where they apply, each once) and X,
    which stays at the top right. All on one line where the card is wide;
    a little narrower the checks drop under the name; on a phone the actions
    wrap compactly in a row of their own.
  - Their facts as rows, each its small-capitals name and its value
    beneath: `Details` (email, phone, NIF), `Price` (each
    length), `Every lesson` (the facts all their lessons share, such as `In
    Porto · Added by you`) and `Plan`, her plan
    for them with their latest level as a chip beside its name. Nothing here
    is changed with a big `Change`, `Edit details` or `Write` button: there
    is one tiny lucide pencil for each thing,
    beside its name: `Details`, `Price` and `Plan`. The values
    beneath are plain lines. Pressed, the pencil opens everything under that
    name as fields where it reads, ending in the tick and cross: Details as
    `Name`, `Email`, `Phone` and `NIF`, each named at its left; Price as both
    lengths; Plan as its text. What is not yet known is left out of the
    lines (a missing email reads `No email yet`), and its field waits under
    the pencil. A signed-in student's email is only read: it is theirs to
    change from their account. Their name carries no pencil in the card's
    header, closed or open, and is one size; it is changed under Details.
    The fields keep their validation and the price its hint; saved or
    cancelled, keyboard focus returns to the pencil that opened it. The
    pencil is small to see and, for a finger, reaches a 44 px target. The
    plan (4,000 characters) is edited the same way, in the row. Where the card
    is wide these rows are a slim column beside the lessons, kept tight;
    narrower, they pair up above them.
  - Their lessons beside, `Upcoming` then `Past & cancelled`, each named in
    the legend's small capitals. Every lesson is one row of two lines at most:
    its day and time, which open the lesson's own details in place inside the
    row (move, length, cancel, no-show, already paid, refund, homework, a
    payment link: the same operations, explicit confirmations and busy guards
    as her timetable's dialog, which stays a dialog there) and whose press area
    is the whole row, with the hover wash and keyboard outline on the row (the
    controls beside it sit above that area, so none is swallowed). Each lesson
    is one soft cream tile with the organic edge and a fine lilac border:
    closed or open it is the same tile, the open one spanning the list with a
    slightly stronger blue border, with no rule above a week, no box in a box,
    no dashed outline and no separator above its toolbar. At the end of the
    row, a small soft `Already paid` toggle (same words and state: organic
    capsule, small checkbox, strong blue once checked) on a past lesson she
    added, and a small pencil named `Change lesson`, which opens that lesson
    in place on its change form, as every pencil on her pages edits the thing
    beside it; a narrow row folds in two, the day and pencil, then the facts
    and `Already paid`. While a lesson's details are open the date
    row is its disclosure and the pencil steps aside, as `Change` is among
    those details.
    Homework and lesson notes are hidden for now, on her pages and
    students': no `Homework`
    button in an opened lesson, no homework chip or `Homework to review`, and
    a student's past lessons neither show nor ask for homework. Nothing is
    deleted; `features.homework` in the tutor's record brings it back, and
    what this file says about homework describes it as it then is: reached
    from an opened lesson's `Homework`, with its chip (`Draft`, `With them`,
    `To review`, `Done`) on the lesson's row. Its own facts follow its day
    and time, one wrapping line after the site's small lilac paint dab, as
    the shared facts are. Every secondary action here (`Show weeks`,
    `Homework`, `Change`, `Cancel`, `Create
    payment link`) is one small soft lilac button, dark blue words in
    sentence case, with the same size, hover and focus. In an open lesson the
    date and the controls (`Join Meet` first for an online lesson, then
    `Homework`, `Change`, `Cancel`, `Already paid` / `No-show` and `Create
    payment link`) flow together as one group with one shared gap, each at its
    own width, wrapping where they do not fit, with the facts below and the
    cross that closes it at the row's end.
    `Change` opens her one change form in place, and `Cancel` the cancel
    step, which still needs its explicit confirmation; coral stays for a save,
    a confirmed cancel and the one next step on a closed student's card. A level shows only where it
    differs from theirs now; a few lines of her notes follow. Open details
    span the list's whole width, one lesson's at a time, as a named region
    (`Sam’s lesson, Tue 22 Sept, 09:30–10:30`) with no scrim, scroll lock or
    focus trap and nothing else closed: focus moves to it, `Esc` or its close
    returns focus to the lesson, a saved change says so in the dashboard's
    live message. Its notes and its details are never open at once. Eight
    past lessons show, the rest behind `12 earlier lessons`. Homework to
    review opens the homework steps in that lesson's row, which then spans
    the list.
  No duplicate To do list or separate student profile popup.
  The checks wrap beside
  the next button and never scroll sideways; on a phone the button keeps its
  own width at the end of the checks. Opening a piece of the profile keeps the
  student's name visible and places one X close control at the top right.
  The editor spans the row, and its heading and short bullet facts share a
  band. Hover gently changes the
  row's border; a strong outline is reserved for keyboard focus. Help states
  the current status and anything still needed, rather than explaining
  controls or repeating their labels.
  Adding a lesson opens the calendar with available Porto start times. In a wide row,
  compact lesson settings sit beside the calendar and its available times;
  they stack on a phone. The lesson calendar opens on today and pages back a
  year for a lesson already had. Past days read quieter
  but stay choosable; a past day's times are every quarter hour, as the same
  time blobs, since weekly hours don't bind what has happened. A past lesson
  is recorded: date, time, length with its price,
  place, add. A past time hides How often but keeps Where, Online or In
  Porto; the place is followed by the `Already paid`
  tick and one coral `Add past lesson` (beneath the times on a phone, under
  the settings beside the calendar on a wide row). Nothing is said about
  email, because nothing is sent.
  A lesson she added after it happened then reads and behaves as any past
  lesson she added: it is open at the student's price until a card pays it or
  she ticks `Already paid`, so it carries the tick in her history, never the
  word `Recorded`, and opened its dab reads `€20 · to pay you directly`.
  The word appears only in the status line straight after she adds one
  (`27 Aug, 09:30 · recorded`).
  `Already paid` is one tick, the booking agreement's
  squiggle capsule with a paint dab for its box: pale lavender dab on the
  lilac wash until ticked, then the blue capsule with a coral dab and a cream
  check, as the agreement turns blue once agreed. It sits just above the
  action it goes with: above `Add lesson` for a single lesson with something
  to pay (not a weekly run, which is ticked lesson by lesson, and never a free
  length), and under the lesson's dabs in its dialog wherever nothing has been
  charged by card; there it saves at once, and the dab beside it reads `paid
  to you by hand`. A lesson paid, due or charging by card shows that in its
  dab instead (`€25 · paid by card`), with no tick; a lesson still to be paid
  to her reads `to pay you directly`. The tick is also how a lesson she was
  paid by hand comes off their card. Choose a time; there is no manual date
  or time entry. Location, length and weekly repeat remain available. Emails are explicit:
  opening a card or its link never sends email. A first welcome uses `onlyIfWaiting: true`;
  `Email instead` for someone already welcomed deliberately requests a fresh link without that guard.
  The Timetable keeps up to three operational notices under the next lesson,
  with `See all in Students`. Setup tasks live in Students.
- Each date has one compact header cell: weekday and bold date centred together
  on one line (`Mon 7`), today's number in a filled blue lozenge with cream
  type. On a phone, where one day shows at a time, the booked hatch marks the
  tabs of days with lessons without shifting the date; the whole week has
  none, since its lessons are in view beneath. Its `Day off` and `Online only`
  switches sit at the right, one above the other, moving beneath the date
  inside the cell when the column cannot fit both. Each keeps its full dated
  accessible name. On phones each has a 44px hit area; on wider screens the two
  stack in the cell at 22 px each, short of the 44px rule: a known gap to close. There is no separate Day off row.
  On phones, the selected date appears only in the compact day selector, and
  the shown day's `Day off` and `Online only` switches share the row beneath
  the month and pager with `Edit weekly hours` (a row of their own below
  380 px), with the full selected date in their accessible names. The time
  grid starts directly below the selector; no repeated date or Porto label.
- Show the full working week on desktop and in a panel wide enough to read it.
  On phones, keep the displayed days in a compact selector
  above a spacious single-day timetable, with
  no horizontal page overflow. On desktop a normal working week fits the
  viewport beneath its tabs and calendar controls. Rows keep a readable
  minimum height; unusually long days extend the page instead of clipping
  lessons or adding an inner scrollbar. On a phone the day scrolls within its box and opens at her first
  teaching hour that day or its first lesson, whichever is earlier.
  Compact rows must retain legible lesson times, names and call controls.
  Dates and timed lessons always use Porto time, including at DST boundaries.
  Entering a time skipped by the spring clock change shows an error and keeps
  the form available to correct. Moving a lesson in autumn's repeated hour
  preserves its original occurrence while its wall time remains unchanged.
  Skipped weekly occurrences are listed by date in previews, confirmations
  and emails; a missing wall time never appears as a different real time.
- The timetable trims empty hours before and after the weekly starts,
  booked lessons and timed breaks, rounding outward to full hours. A normal
  09:00 start does not carry an empty 08:00 row. Early, late and overnight
  lessons always widen the visible range. A completely empty timetable
  offers 09:00–20:00; Weekly hours keeps its 08:00–20:00 paint range and its
  exact-time editor. Weekly starts use a quiet lilac wash, unavailable time
  stays cream, booked lessons are blue, and time off is hatched and labelled.
  Added lessons retain their lilac fill, dashed edge and `Added` label.
- Google Meet lives inside `Profile`, in one card: the logo and `Connected as …` (or what
  it needs), two dabs (every lesson goes to her Google Calendar with its Meet
  link; move or cancel lessons here, not in Google), then `Open Google
  Calendar` with a small `Reconnect Google Meet` button, or a coral connect
  when it needs her, and `Share your calendar` folded beneath. When the connection needs her, `Needs you` on her Timetable says so.
  Returning from Google opens Profile with the connection result. The same
  tab lets her request a confirmed sign-in email change or an emailed password
  reset, using the existing account flows, in a student's Your details rows
  (see "Your lessons" below). `Sign out` is a small button at the
  top right of Your profile, beside her name, and
  preserves the unsaved-hours warning. Account and Meet cards share a row
  where they fit and stack on a phone.
- Every booked lesson shows its time and student in both layouts, including
  60-minute blocks, and marks its place with a globe or a person in its top
  right corner, named in the key and, for screen readers, `Online` or `In
  Porto`. Keep the coral marker for Porto lessons.
- A student's card is their profile throughout, from first invite to ongoing
  use. One editor opens at a time; the single X closes it and returns focus
  to the control that opened it. Opening a card changes nothing and sends
  nothing.
  - Names wrap between words. Give the name enough room before wrapping the
    controls below it; never split an ordinary name such as Bingham midway.
    Students without a chosen mark receive a stable default splat from their
    account ID, shared by the row and lesson chooser. Keep chosen marks.
  - Opening and closing gently changes the sheet's height. Its contents fade
    into place, and scrolling keeps the student's name visible. Reduced-motion
    users get the same result without animation.
  - A missing lesson never locks the email field. Price uses the same
    editable rate form as onboarding.
  - A weekly run's weeks still to come are one tile: the weekly repeat mark,
    `Every Wednesday · 09:30–10:30`, `12 weeks, Wed 18 Nov to Wed 3 Feb` and
    the facts its weeks share together where they fit, with a soft `Show
    weeks` button at the end. Shown, the run adds no box of its own and each
    week is a tile beneath it saying only what the run does not. A
    week moved off the usual slot is counted on the run's row. A lesson on
    now, a run with one week left and past lessons stay single rows.
  - A successful addition of a lesson closes the form and leaves a short
    confirmation in that row. No email is needed to create lessons. Their
    welcome controls when lesson emails begin, with existing quiet-booking copy
    and safeguards preserved.
  - The Students toolbar stays on one row: Find a student on the left and
    Add a student on the right. A completed student's closed card has a
    stretched name-button hit area; its section controls keep their own actions.
  - Add a student opens a short creation dialog with name, optional email,
    phone, NIF, prices and splat. Nothing is emailed. Next: their lessons closes
    the dialog and opens that student's lesson form in the Students list; the
    outline `No lessons yet` beside it opens their link instead, where she
    still presses `Send on WhatsApp` or `Email instead` herself. A dialog opened from a timetable time offers only the lesson.
  - `Add a lesson here` at a free timetable time opens a student chooser. A
    past time offers only `Add a lesson here`, never time off. Choosing or
    creating the student closes the chooser, switches to Students and opens
    their lesson form with the same date and time. There is no second student
    profile dialog.
  - Sent by `Email instead` from their card, the welcome email is one email
    for everyone, in the site's email design: their lessons and prices, and the
    way in. It shows for someone she still needs to bring in, and only once
    they have an address. Their lessons come first, under one small title
    that says their clock once (`Lessons · Porto time`). Each lesson is a dab
    of two short lines: when it is, in bold and without a year, since every
    lesson here is still to
    come (`Tuesday 20 October, 17:00`), then its place, length and the price
    it will be charged or owed (`Online · 60 minutes · €22`, `· €22 paid` once
    paid, `Trial lesson · In Porto · …` for the trial). A weekly run is one
    dab, never a row of dates: `Every Tuesday, 17:00` over `Online · 60
    minutes · €22 a lesson`, then `From 20 October` (`From 20 October to 8
    December` when it ends; `Every` already says it goes on) and any week
    between with no lesson (`No lesson on 3 November`, so a skipped or
    cancelled week is never read as a lesson). A lesson moved, lengthened or
    put elsewhere reads as the lesson it now is. Where their lessons are on
    two clocks (theirs online, Porto's in Porto) the title is `Lessons` and
    each line names its own (`…, 12:00 · New York time`). Their prices follow
    under `Your price`, one short dab for each length she has priced (`60
    minutes: €22`). Past twelve lines one more dab
    says how many lessons are left to the website. Its subject identifies the
    lessons with Inês; card setup is explained in the body. It uses the fewest
    plain words that do the job, since many of its readers are reading a
    second language:
    the introduction is one sentence naming Inês and her website (`Olá Ana,
    your lessons with Inês are now on her website, portuguesewithines.com.`),
    the steps are `Press the button below.` and `Add your card.`, and the
    footer says only `The button works for 14 days.` and `Questions for Inês?
    Just reply to this email.` above the site's link. With no lesson to come
    it is an invitation instead: `Book your next lesson with Inês`, the price dabs, no
    lesson list, and steps ending `Choose a day and time for your next
    lesson.` behind `Choose a time` (`See your lessons` when they have lessons).
    A student free at every length is told there is no card to add and nothing
    to pay. It is often the first email a student has from the site, so it
    says who sent it and why, and keeps passwords and cards out of its subject,
    preheader and button: a `Sign in and add card` welcome went to spam.
  - Dormant is hers to set: `Mark as dormant`, among her actions in a
    student's top row, is offered only with no lesson to come, and `Mark as
    active` returns them. Marking sends nothing. Dormant students rest in the
    last lane, `Dormant · n`, by name, as ordinary cards labelled `Dormant`
    with no checks, and their profile's `Come-back email` row reads `Sent 22
    Oct` once she has emailed them; a new lesson of theirs brings them back on
    its own. Each has its own email: `Come-back email` is their
    card's one button, and its panel, headed `Come-back
    email to Marta` with two dabs (it ends with a button to sign in and book;
    when it was last sent), holds Subject and Message prefilled with `Olá
    Marta,` above her default, an outline `Start again` once she edits, and
    coral `Send to Marta`. The lilac `Default come-back email` beside the
    lane's heading opens one sheet for the words every panel starts from,
    with outline `Cancel` and coral `Save default`. The email is the site's
    design with her words as plain text under `Book your next lesson`.
- `Receipts`, a tab of its own, shows a month at a time with the
  Timetable's pager (the one pager above): two dabs for what there is to
  issue (`3 receipts to issue · €50`) and what is still to be paid, a lilac
  `Download CSV`, then
  one plain table row per amount (lesson, student, NIF or `Consumidor final`,
  what it is for, amount, and a pill: `Paid by card`, `Paid by hand`,
  `Payment due`, `Being charged`, `Refunded`). On a phone, and up to 720 px,
  each row is a small cream card, two across where they fit, its NIF and what
  it is for sharing a line. Rows carry their id and figures as data attributes, so her
  automation can read the table, the CSV or the Worker's JSON alike.
- In a student's inline Lesson history, a row's date and time share a line
  where they fit (the year only beyond six months either way; on a narrow row
  the time drops beneath the date so the tick still fits beside it), with a
  bold word beside the row's pencil, never a pill, only for what breaks the
  pattern (`Cancelled` or `Cancelled by you`, `No-show`, `Happening now`),
  quiet facts (place, length, payment, `Added by you`, moves), and her
  cancellation message or the student's note as one quiet quote with who said
  it (`You: “…”`).
  A fact every one of their lessons shares, such as `In Porto` or `Added by
  you`, is said once on the dashboard's `Every lesson` row, and each lesson
  keeps only what is its own. With a single lesson, its row says it all. How
  long a lesson is always stays on its row, `60 mins` or `90 mins`, even when
  every lesson is the same length: one can be 60 and the next 90,
  and she can correct either.
  The Price control opens the two fields in place and says how many lessons to
  come moved to it, and `· standard` marks a length she hasn't priced.
  History includes older lessons outside the current week and follows the account
  after an email change. Loading, failed reads and an empty history stay distinct.
  Reading history never changes a booking or sends a message.
- A lesson marked as a no-show turns lavender in the calendar and carries a
  small coral `No-show` tag beside its time, so she can see it at a glance.
- Selecting a booked lesson opens its details and the existing move, cancel,
  attendance and payment-status controls. Keep cancellation confirmation,
  permission checks and server error handling intact. The details are about
  the lesson, not the student: who it is with and when,
  `Join Google Meet` with Meet's own mark, then dabs for its place and length
  side by side, its price and how it is paid (`€25 · paid to you by hand`),
  any moves and, until their welcome, `Not emailed yet`. The student's
  address and NIF live in Students, and receipts in their own tab. Their
  note is labelled `Their note`.
  Closing without a change returns keyboard focus to its opener. Completing
  an action returns focus to the stable week heading while the timetable
  reloads, with a single blue outline; it never steals a later focus choice.
- Her buttons are the site's buttons: the same fill, weight, spacing and lift,
  a little denser, and `Join Google Meet` in a lesson's dialog is a solid blue
  button, never an outline. Use space and contrast well: two
  actions share a row rather than stacking full width, and coral marks the
  one thing still to do. A quieter constructive
  choice is the palette's soft lilac, as the quiet chip in sentence case at
  its own width (`Time off`, `Online only`, `Open Google Calendar`, a booked
  lesson's `Change`); a way out
  (`Cancel`, `Back`, `Done`) stays an outline. Booked is the calendar's navy
  everywhere.

### Expressions in her portal

The `Expressions` tab immediately follows `Receipts`. Only a teacher can
manage its collection. Expressions are hers alone for now: students
see no expressions card at all until Dan opens them to students (the Worker's
`EXPRESSIONS_FOR_STUDENTS` switch, in
[the booking-system contract](../docs-booking-system.md#student-expression-picker)).
Once they are open, publishing makes an expression available in the signed-in
student picker below Your lessons. Drafts stay in her interface; there is no
anonymous page or main-menu item.

The painting and learning experience also has its own `/idioms/` page, with
the shared site header and a reading layout capped at 84rem including its
outer padding, so the content stays together on a wide desktop.
Open full page leads there from an available painting card. It keeps the same
account: Inês paints her draft collection locally; students use the existing
published-expression access switch. Signed-out visitors sign in there. The
page links back to her collection or the student's lessons, and does not add
public access or a public navigation item.
Her collection header also has a `View page` link beside `Add an expression`,
opening `/idioms/` with the same signed-in account.

- Use the same lilac sheet as Receipts, cream reading cards, Beth Ellen
  expression titles and Montserrat labels and content. Keep the latest bundle
  introduction exactly: `expressão idiomática`, `nome feminino`, and
  `Conjunto de palavras com um significado próprio, diferente do seu sentido literal.`
- Her try-out comes straight after the introduction and `Add an expression`:
  the students' own card, so she sees every expression painted as a student
  will, drafts included. It is the same component, paint, reading, button and
  accessibility as the student's at every width, sitting on her lilac sheet
  without a second sheet round it, and one compact card at rest above her
  list. It paints from her whole collection in her browser alone: nothing is
  saved to the Worker and no student's pick is spent. It never paints the same
  expression twice in a row, and none again until she has seen them all, then
  starts a new round (remembered on her device); its colours follow her own
  account. A draft shows the facts it has, with no example if it has none.
  With an empty collection there is nothing to paint, and it stays away.
- Her copy says only what students actually see. While expressions are closed
  to students, the help reads `Only you can see expressions for now.` and
  publishing confirms `Published. Your students will see it once expressions
  open to them.` Once they are open, these read `Your students can pick
  published expressions from Your lessons.` and `Published. Your students can
  now pick this expression.` `Add both meanings and one or two examples
  before publishing.` stays either way.
- The coral `Add an expression` leads. Search matches accents flexibly across
  expressions, meanings, examples and notes. The theme filter includes entries
  with no theme. Do not display the original collection's count.
- Each list card's head is one line: its small `Draft` or `Published` pill, a
  quiet `Publish` or `Unpublish` beside it, and the ↑↓ arrows that reorder the
  whole collection (clear filters first). Facts keep their reading order and
  painted label dabs.
  At 27rem of inner card width the head sits level with the title at the top
  right, and each label sits beside its value; narrower cards keep labels
  above values: `Tradução à letra` (the literal
  translation, when there is one), `Quer dizer` (the Portuguese meaning) and
  `Em inglês`; then
  `Exemplo`/`Exemplos`, where the expression's own words are marked with a
  soft wash of the paint, taking in a verb the example has conjugated.
  Notes/origin are one of the facts, `Notas e/ou origem`, never a
  disclosure, and the reference link is not shown (the editor still keeps
  it). Every value shares one type style, the meaning included. Optional
  themes use a lilac pill fill.
- An expression is edited where it stands: the pencil at the end of its title
  turns the card into
  its own editor, the title and each line becoming fields in their own
  places under the labels the card already shows, the reference link, image
  and image description behind a small `Image and link` disclosure, and the
  card ending in a quiet `Delete expression` chip, the tick and the cross.
  `Add an expression` opens the same card, empty, at the head of the list.
- Failed writes keep the card open with what was typed. Discarding typed
  changes and deleting an expression are each asked in the card's foot, in
  place (`Discard your changes?`, `Delete “…”?`, a small coral button and
  the cross); with nothing changed the cross and Escape close at once. Stale
  versions never overwrite an edit.
  Filters and a visit to another schedule tab keep an open editor and its
  draft; another card's pencil and Add an expression wait until she finishes
  or cancels that edit. Reloading with an unfinished draft warns before leaving;
  following a link asks in the card before discarding it.
- Students' own versions: `Noutras línguas` is one of the painted reading's
  facts, after
  its examples, listing each version's language and text. A student's quiet
  `Add yours` opens a small form in place: only `How you say it` and
  `Send to Inês`; the language is
  taken from their device's language setting. Only versions Inês approved are shown, never with a name.
  Her `Translations to check` panel sits in the Expressions tab with a
  waiting count. See
  [the booking-system contract](../docs-booking-system.md#students-translations-of-an-expression).
- There is no separate preview: her card in the list is
  the same reading-card component a student gets, so it already is that view.
- A 26rem minimum card grid uses at most four columns, with cards aligned at
  their tops and hugging their contents. Phones use one column. The try-out
  reading stays unchanged. Every
  tab remains reachable without horizontal page overflow, including at 320px.
  Long expressions, notes and examples wrap within the card, and its fields
  and actions fit a 320px card while it is being edited.
- All imported entries are drafts. The reference bundle has no usage examples
  or themes; leave those blank instead of inventing them. Publishing needs both
  meanings and at least one example. Preserve Inês's punctuation and accents.
- The original strip photographs are reference material, with text too small
  for a reading card. The packaging photos and business card do not illustrate
  individual meanings. None is copied into `public/visuals/` for this integration.

The student card sits on the same lilac sheet below the lessons calendar,
once expressions are open to students and Inês has published one. Its
centre is `Pinta e descobre`: Inês has written the expression in wax on a cream
sheet, and a gouache brush sweeps across it line by line so the phrase shows
through the paint in Beth Ellen, in reading order. The painted phrase is the
reading's title. The first press shows the painting alone; the same button
then reads `Show meaning`, and its second press opens the facts beneath it.

- No visible heading and no helper text. The section keeps `Uma expressão para
  ti` as a visually hidden
  heading, so it is still named. Every visit starts with a blank cream canvas
  and `Paint it`: no phrase hints, paint marks, meanings or fact labels are
  visible before the press. A returning student
  repaints their saved expression on that first press without spending
  another pick; `Paint another` asks for a new one. Painted, the card holds
  the painting and `Show meaning` beneath it (beside it from a landscape
  phone up), exactly where `Paint it` stood. Opened, the card is the whole
  section: its facts (`Notas e/ou origem` among them), then the examples
  and `Noutras línguas`, each version followed
  quietly by its language, all in one rhythm. There is no footer band, rule
  or toggle row:
  `Paint another` ends the card at its foot, in the same place as `Paint it`
  and `Show meaning`. The one button keeps the width of its longest label,
  so `Painting…`, `Show meaning` and `Try again` never reflow it; it stays a
  48px target and never becomes a full-width slab.
- Colour: each painting uses the site's paints, every one with lettering
  clear of AA: dark blue `#203E82`, coral `#B43A26` and
  lavender ink `#554F91` carry cream `#FBF4E5` lettering; lavender `#AAA4E6`
  carries ink `#1A3169` (5.4:1; cream on it would be 2.1:1). A new painting is
  never the colour of the last one painted on this device, nor of its family
  (blue or the two lavenders), so each one reads as a new colour. A
  returning student repaints their saved expression in its original colour,
  remembered on the device for each student as soon as the Worker has saved
  the pick (two students sharing a device keep their own colours), or else in
  a colour that expression always gets.
  The reading's labels, dabs, marked words and the drops thrown off the brush
  all follow the paint and its companion colours; on lavender the labels are
  in lavender ink and the marked words take a stronger lavender wash, so both
  still read.
- Room around the words: every letter sits in solid paint. The band is
  sized round the phrase's own letters, with generous paint above the first
  line's tallest letter and below the last line's deepest, a clear inset from
  the blunt start, and the dry brush beginning only after the longest line ends
  and a margin of paint after it. The strokes of a longer phrase overlap, so no
  paper shows between its lines, and no streak of paper crosses a word. A
  phrase of a few words stays on one line if type up to 15% smaller holds it.
  Nothing is ever cut: a phrase too long for every size takes as many lines as
  it needs at the smallest, and the sheet grows to hold them.
- Composition: on a phone the sheet fills the cream card and the reading opens
  beneath it: facts, example, other languages, then the button at the
  right. A student's card shows no theme pills; they
  stay in Inês's collection, where she filters by them. From a landscape
  phone up, the painting with its example and `Noutras línguas` straight
  beneath it sits beside the facts.
  Both columns begin at the top; the button ends the facts' column at the
  card's foot, level with the end of the taller column. Keep two reading
  columns on larger screens as well. At rest the blank
  sheet reserves room for the first strokes, with the button at the card's
  foot. The paint lands where it stays and never slides on the sheet, and the
  card keeps its size while `Show meaning` waits. The painted sheet closes
  round its phrase as the reading opens, only its foot rising, so a one-line
  phrase never sits in a tall empty sheet beside the facts. Nothing above the section moves, and the card grows and
  shrinks smoothly below. As it opens, each fact rises gently in after the
  last, in reading order (both columns together on a wide card), and
  `Paint another` follows at the foot, so nothing arrives as one block. The
  page scrolls in the
  same motion, only as far as the card's foot needs and never past its top.
  The other languages load while the expression paints, so the reading
  opens whole.
- The idle canvas reveals nothing from the collection. The first paint
  appears only after the press. Gouache is matte: nothing glossy. Finished
  lettering stays cream on dark paint and dark on lavender.
- The press starts the painting at once while the Worker picks and saves the
  expression: a dab lands on the blank sheet and spreads. On about one press
  in three the wait becomes a near-miss: a thin dry brush starts the first word or two
  of an unseen phrase near the top, and a quick stroke of the real paint
  crosses it out, before the real phrase is painted. The near-miss is brushed
  in a wash the real paint stands out against (lavender behind the blues and
  coral, coral behind lavender ink, deep blue behind lavender, which strikes a
  broader stroke), so the strike always reads. It is left crossed out for a
  beat, then dries away as the brush comes back and paints the real phrase in
  its place, at the top where it stays. The whole reveal, press to
  reading, takes about 3.2 seconds when the reply arrives within about 1.5
  seconds; after a slower reply the painting follows it at its quickest pace.
- No paint ever shows a straight edge, in any frame or once it has dried.
  Each stroke touches down as a rounded mark, its blunt start a rounded cap,
  and is led by a rounded wet front with the bead riding it (the near-miss by
  a dry brush's ragged front); its body ends rounded under the bead until the
  dry brush drags out from beneath it, and the bead soaks back into the body
  rather than floating off. The body's edges ease into the dry brush's, so
  where the two meet there is no step, notch or seam. Strokes, drops and the
  pool land whole on the paper, never cut by the sheet's edge.
- The card is never left empty while it paints. On the first press the sheet
  keeps its wax phrases until the first stroke lands (a near-miss dries them
  at once), and the facts still to come stay in wax beside the painting, as
  at rest. `Paint another`
  brings the sheet into view and the last reading waits in wax where it
  stands, out of reach: its labels and dabs stay, taking the new paint's
  colours, its words dry to wax lines and `Add yours` fades, while
  the button reads `Painting…` and the focus waits on the section. The card
  never shortens while it paints, and grows
  smoothly only when a longer phrase needs the room, so nothing below jumps
  under the student. Once the new phrase is painted, the last reading closes
  smoothly beneath it to `Show meaning`.
- Only the button paints: no swipe or drag on the sheet, and no loose chapéu at
  the card's corner.
- The painting is decorative: the pick is the Worker's and the brush paints only
  what it saved, so nothing done mid-stroke can change or lose a pick. Assistive
  technology hears the result in words, the focus waits on `Show meaning`,
  and the opened reading takes it.
  Reduced-motion users see the finished painting at once, and its reading at
  once on the second press; the card keeps the colours it shows until the new
  painting replaces it. Where the
  sheet cannot be painted at all, the reading shows the expression in the hand
  as its title instead.
- The strokes, pool, drops and wax are drawn in code for now.
  [Expressions: paintings to commission](../docs/expressions-paint-assets.md)
  lists the painted assets that would replace them.

Keep the button disabled, reading `Painting…`, during the request and the
painting. A failed reply dries the new paint away, puts the last painting (or
the waiting sheet) back, and `Try again` repeats the same request without
spending another pick; the focus goes back to the button if it was lost. If the
collection cannot be read at all, the section stays away rather than raising an
alarm beside the lessons. Returning students see their last available result,
and every student has an independent history. Once their published pool is
exhausted, a quiet note takes the button's place and the card waits for new
expressions. Do not reset their history or imply another student has taken an
expression.

The full source inventory and later-stage feature map are in
[Expressions: source and scope](../docs/expressions-stage-1.md).

## Wording and confirmation

Use `Portuguese Lessons` on the home page. Booking is headed by the one bar
for everyone: a visitor
without an account books under `Book a Lesson`; a student, or anyone arriving
by a lesson's own link or a link to Your lessons, has `Your Lessons`. The bar
names the page, so
the booking card carries no second `Book a lesson` title of its own (its
title is kept for screen readers) and opens on the lesson's choices; a
signed-out visitor's way in is the bar's `Sign in` (on a phone, the menu's).
Signing in or making an
account halfway through a booking keeps `Book a Lesson` until Your lessons
opens, so the bar never changes under the booking being finished.
Marketing copy describes Portuguese lessons without repeated European/Portugal
positioning. The one statement of it is on Approach: Inês teaches European
Portuguese, and any variety a student already knows is welcome. Retain actual
location choices, addresses, qualifications and Porto time where they help
someone attend a lesson or understand a deadline.

Keep booking confirmation in one column at every width: a compact optional notes
box, the payment summary underneath, then the agreement and final action. The
notes box is one line tall, like the fields beside it, until a note needs
more, growing with what is typed where the browser can, up to a limit; let
visitors resize it for longer notes. Signed in, these final details are one
card on the booking sheet, as the times are beside the calendar, headed simply
`Confirm your lesson` or `Confirm your lessons`, weekly lessons included: the
bar above already says they repeat. The
agreement fills the same width as the final action, with centred text and its
terms link retaining a separate action. Keep prices visible
with the chosen lessons. The short payment summary explains payment after each
lesson and €5 rules, with the full terms available by link.

Use different treatments for neighbouring booking controls instead of two coral
fills. Selected agreement uses blue beside the coral booking action. A weekly
lesson has the same one `Change` and one `Cancel` as any lesson, each starting
on `This lesson | Every week`; Cancel's `Every week` has one
filled `Cancel all booked lessons`, its outline `Keep lessons`, and `Stop
repeating` as a quiet chip beneath, and the step is the question, so neither
asks again; profile editing
ends a name in the coral tick and an email in blue `Send confirmation link`. Keep the existing labels and state indicators so
colour is never the only way to tell the controls apart. A filled button that
cannot act yet is drawn as the same quiet outline as the booking's final
action, so coral and blue appear only when the action is live.

Confirmed email changes preserve an open detail and newer drafts while
renewing that account's session. Opening a detail focuses its field before
interaction; later browser frames never move focus away from a field the
student has selected. If the calendar cannot refresh after booking,
moving, cancelling or stopping a sequence, retain the successful outcome and
show the account warning with `Try again`, including inside lesson management.
That action reloads the account without repeating the change. Disable change
controls while their save is pending. A payment form that fails to load offers
`Try again` using the same held booking and checkout.
Availability failures also offer `Try again` while retaining the selection.
So does a failed read of the lessons on offer: until it succeeds the page does
not know how lessons are paid, so a priced lesson cannot be confirmed and no
payment terms are promised. An account read that succeeds only on `Try again`
opens `Your lessons` as the first read would have, never an empty page.
Coming back from Stripe's payment page with the browser's Back leaves the
lesson's dialog usable. Changing a lesson's place keeps the chosen time's day
on the clock that place is read on.
When a longer lesson makes selected times overlap or removes the required gap,
keep the earliest compatible times and explain which later times came off.
Apply that check when retry completes while adding or changing a lesson, and
when Back restores the original choice. Disable booking edits during submit
and card checkout so the choices beside the card form describe its held times.

## Motion direction

Motion is calm, quick and physical, and never makes anyone wait. What lands or
travels moves on a soft spring that gives a few per cent and settles; controls
answer on a firm one; everything else decelerates long.

Pages turn into one another. The header stays exactly where it is, and the
nav's coral moves to the new destination's name; the nav draws no line beneath
it. The page being left
drops out of focus and away almost at once, and the new one pulls into focus as
it settles, so two pages never print over each other and for a breath the
paper shows between them. On wider screens the pages sit in a row along the
nav: a later page arrives from the right and an earlier one from the left,
whether reached by a link or the back button. On phones every page settles in
place with a lighter blur, and an open menu recedes with the page it covered.
A full page load into Booking turns the same way. Navigation starts at once and
the new page is live throughout, with no click delay or overlay. Headings, copy
and actions arrive with their page, never in an entrance of their own. Only the
rules under the display headings are drawn in: once, from the left end at a
pen's pace, the hero rules a moment after their heading shows, each Home
principle's short rule as its splat settles, and an FAQ section's rule each
time that section is chosen.
Decisions inside the booking flow never turn the page. A decision happens at
once and the workspace moves to it: what the decision brings into view
dissolves in from a few pixels below, what was already there stays perfectly
still, and the workspace eases from its old height to its new one, carrying
the page beneath it rather than snapping it or jolting the scroll position.
The booking's confirmation card belongs to the same workspace, so booking and
the way back from it ease too. Only the part of a resize that shows is eased,
so a short page's footer never lurches, and a resize starts and settles
gently, carrying the page rather than flinging it most of the way at once. A
decision that replaces the workspace's content outright (a time bringing the
confirmation, `Change` or `Back` taking it away, a phone's times taking the
calendar's place) hands over in two beats: what goes fades down in a moment,
then the next step dissolves in from nothing, so one view never cuts straight
to another. Choosing a day on a wider card opens the times' column beside the
calendar, which narrows with it rather than jumping, and the times are
uncovered as the column opens rather than squeezed. Nothing pops in late: a form or times
still on their way ease in when they arrive, and until the calendar first
arrives its room is held, so the footer never shows and then drops away.
The calendar's arrows turn it as the account's places turn its cards: the
weeks showing slide away to one side, then the next ones slide in from the
other, each seen only within the weeks' own frame, and the month's name
follows. Choosing Weekly opens Repeat out among the other choices as they ease
narrower, its options showing once it has room for them (or it rises in on a
row of its own where the bar wraps); choosing Single eases the others wider
over Repeat's place. Nothing stands in for what has gone, so the page never
holds two of a control or a day. A
Your details row eases open and shut to its new height, and a splat chosen
there lands in its row and in the card's corner, after the picker's splats
land one after another as it opens.
Without view transitions a new page dissolves in. Reduced-motion users get
each page at once, without animation or smooth scrolling, and a full page load
is an ordinary load rather than a turn.

Buttons answer like objects. They lift on hover, the filled ones casting a
soft shadow in their own colour, and their hand-cut outline shifts a little and
settles on the soft spring, as wet ink does: the same hand, never a new shape.
A press sinks them a touch before they spring back; a disabled button does not
answer, and the booking journey's own controls keep their cut. Every hover line
draws on the
same firm spring, the FAQ's plus turns into its minus with a little give, and
the phone menu's destinations drop in one after another as their marks land.

The header wordmark is the way home, and pointing at it changes nothing: it
keeps its own blue. Its two circumflexes over ê (the chapéu, the hat) dance:
every four seconds they hop in turn, Português, Inês, Português,
Inês, each hop a lift of a few pixels that tips the other way from the last
and lands on the soft spring, then they rest for the rest of the bar. The beat
is the wall clock's, not the page's, so the dance carries on unbroken from
page to page. It is the one ambient motion on the site. Reduced motion keeps
the hats still.

The little splats land. Each small emblem mark arrives once like a dab of
paint: it blooms from its middle outwards, soft at first and then sharp, a touch
small and turned, and settles flat on the soft spring in under a second. That
covers the Home principles, the Approach points,
the Lessons card corners and closing card, and the FAQ banner and index. A
group lands in reading order,
neighbours turning opposite ways, and a mark twice the usual size travels half
as far. Marks in the first screen land as the page arrives; those further down
wait until the reader reaches them, so none lands unseen. The phone menu's
marks land each time it opens, in step with its links, while the splat cropped
into its foot blooms a little more slowly. The large painted fields on the
pages (the Approach fan, the Lessons hero splat and the account bar's corner
splat) stay still: they are the paper the marks land on. Text, buttons and the
booking workspace never move or wait for a landing, nothing else loops, and a
landed mark stays still, except that a Lessons card turns its mark a few
degrees while it is pointed at. A confirmed booking is celebrated once: the
lesson's own mark, the one it wears on the calendar, lands in the corner of
the confirmation, cropped at its edge and a little larger and slower than the
small marks. Reduced motion, print and a page without JavaScript show every
splat at rest.

Pop-ups and their dimmed backgrounds appear with a short, gentle fade. Apply
the same entrance to terms, booking prompts and student/teacher lesson dialogs,
keeping their position stable and their controls responsive throughout. Focus
and dismissal take effect immediately; reduced motion removes the fade.

## Booking workspace

Booking is one page. It is headed by the account's one bar, which also heads
`New password` and Inês's `Your schedule`, with no site header or band above
it: the cream wordmark leading home, a hairline, the page's name in the display
hand and the availability splat cut off at the right edge, on blue; 76 px,
64 px on a phone. On Booking it reads `Book a Lesson` for a visitor, with their
`Sign in`, and `Your Lessons` for a student. The bar holds the site's menu
button at every width, for a visitor as for a student; Inês's has none. It
opens the site's one menu, whose heading repeats the bar so the button becomes
the close where it stands: the whole screen on a phone, a sheet at the right of
a wide one, closed by a press beside it. On a phone the splat gives way to the
button, and the wordmark shrinks before the name. The bar names the page, so the
page's own title is for screen readers. It carries no reassurances (`View your
calendar`, `Change or cancel here`, `Porto time`): the page says the first two
itself, and times are on each student's own clock.

A visitor signs in from that bar, not from a prompt inside the booking card:
`Sign in` sits beside the bar's menu button as a small cream button in the
site's hand-cut shape, as `Join Meet` is on her blue card, turning coral when
pointed at. A phone's bar has no room for it, and it never takes a row of its
own under the button, so there the way in is the menu's: `Sign in` is the last
row of every menu's list, on every page (see the menu above), drawn as the
menu's places are, with the sign-in card's mark and `See or change your
lessons`. Both open `/book/?view=lessons`, and the open menu's heading carries
what the bar does so nothing moves. A student's page has their own menu
instead. A signed-out visitor can browse lesson types, dates and times first;
an account is asked for only when they open their lessons or confirm a booking.

A visitor lands on the calendar, ready to book, beneath a choices bar that is
already filled in: `Trial`, `Single` or `Weekly` (the trial only for a
first-time visitor, and then the default), Online or In Porto, the length with
its price (`60 mins · €25`, `90 mins · €35`), and for weekly lessons 4, 6 or 8
weeks or `Ongoing`. A trial's fixed length and price (`60 mins · €20`) read as
one quiet fact, not a selected control with nothing to choose; on a phone it
takes one short line, while real lesson and location choices keep their blue
selection. Each choice changes in place without moving the page, and the free
days follow it: availability always follows the chosen lesson, because a
90-minute lesson has fewer valid start times than a 60-minute one. There is no
opening fork, setup screen or `Continue` step. A returning student starts from a
single lesson at their usual location. A student who is signed in, or on a
browser where a student with a booked lesson has signed in before, is not
offered the trial (Inês signing in, or an account made and never booked, does
not count); that is settled as booking opens, so creating an account at the
confirmation never takes away the trial being booked.

Signed in, the choices bar is headed by the account as the name's menu at every
width, never the open places: booking is not one of the account's places, and a
slider with nothing marked reads as a place missing. That menu's `Your lessons`
is the way back; anyone else has nothing there. On wide screens the groups carry
small `Lesson`, `Where`, `Length` and `Repeat` labels; on a phone, upright or
sideways, the options name themselves and the labels remain for assistive
technology. Each group starts as wide as its options need and a row shares out
what is left, so a wide screen fills the line and a narrower one moves a group
down; option labels never wrap. Weekly's four groups pair up, the lesson with
its place and the length with its weeks, wherever three would fit a row and
leave the weeks alone beneath them. Below 361 px the four repeat options sit two
by two. The choices and the calendar share the same left and right edges.

The calendar shows four Monday-to-Sunday weeks at a time, never one long
scroll. Its header is the one every calendar has: its months on the left
(`October 2026`, or `October – November 2026` where the weeks cross into the
next, `Oct – Nov 2026` on a phone) with the `?` beside them, the clock beside
them for a student elsewhere, and the `Earlier weeks` and `Later weeks` arrows
on the right, solid blue with white arrows. `Later weeks` carries a small coral
count of the booked lessons beyond the page, so nothing booked is out of sight
without a sign. Every calendar is the booking calendar's seven full-width days:
on every calendar and at every width (the lessons card, booking, moving a
lesson, and while loading) the header names the months and every 1st carries
its own (`1 OCT`), so the seven days take the card's whole width. No calendar
has a month beside each week, and there are no caption rows across the grid.
Month labels come from the date key itself, on the clock the calendar shows, so
a visitor behind UTC sees the week of 31 August labelled `AUG` rather than
`JUL`. The clock in the header is marked with a clock, since a globe means
online, and names one clock at a time: while booking, the place chosen's (`Los
Angeles time` online, `Porto time` in Porto); on Your lessons, the next
lesson's, switching to the other while a lesson on it is hovered or focused, the
two names sharing one place so nothing moves.

A booked day's times are sized by the day itself, so they always sit inside its
splat at any width, and are big enough to read and to tell the weekly colour
from the one-off one. Days with two bookings show both booked times on separate
lines, never a small `2x` count badge beside the date. The key sits beneath the
weeks it explains, on a phone in two short columns, the kinds of lesson on the
left and the places on the right, beside the corner splat; it shows `Booked
lesson` only when there is a booked lesson to point to. A new booking pages
through the whole twelve-week booking window; the lessons view pages from this
week through the same window, or to the last booked lesson when that is later.
The inclusive 84-day API boundary must not add a thirteenth week: a partial row
beyond the window is not shown. The mobile calendar must keep all seven columns
and its legend inside the card after resize or orientation changes.

Choosing a free day keeps the four weeks in view on wide screens, the day
highlighted and its times beside it under the date, with no eyebrow above it to
say what the times already say; just past the stacked layout the chosen day's
times take close to half the row, so a quarter-hour timetable never squeezes. On
a phone the times take the calendar's place, headed by a short date (`Thu 24
Sept 2026`) with the site's pencil beside it on the same row, which returns to
the four weeks that held the date (named `Change date` for assistive
technology). Before a day is chosen there are no times to show, so the times
panel stays out of sight at every width and the calendar takes the whole row, as
Your lessons does; a chosen day brings its times in beside it. A free day shows
its times without redundant “no lesson booked” or lesson-summary copy. A window
with nothing free says so beneath the calendar.

A day with a dozen free times or fewer shows them all together. A day with more
comes in two fixed halves, chosen with a two-way toggle that reads the same
every day: from Inês's earliest start to 14:00, and from 14:00 to her latest
(`09:00–14:00`, `14:00–19:00`), taken from her whole calendar rather than that
day's gaps, so the labels never shift. On another clock the halves divide where
14:00 in Porto falls on the student's clock, in their own times, or at noon when
Inês's day crosses their midnight. A half with nothing free that day says so;
the half holding a chosen time, or else the first with times, opens first. Never
a wall of every quarter hour. Times sit side by side in order, without
subheadings and with no holes: as many to a row as the day has start minutes
(four for quarter hours), so a full hour is one row, and a time taken leaves no
empty place. When every time starts on the same minute (all on the hour), they
sit three to a row, never one per line. Buttons keep an accessible touch target
on a phone.

Students can collect several single-lesson dates and confirm them together.
Each chosen lesson is its own row: its own splat, the date and time, and the
site's pencil at its end, the whole row answering to it; the clock is named
once, on the first row (`Porto time`, `Los Angeles time`). In a narrow booking
column a row's date reads short (`Fri 16 Oct, 18:00`), as does the next lesson,
with the long form kept for screen readers. Beneath the rows a dashed card of
the same shape, in the choices' blue with a plus mark (coral is kept for
clashes), offers `Add another lesson`, or `Add a second weekly time` for weekly
lessons; it is absent for a trial and once the limit is reached, and it needs no
explanatory sentence. While a lesson is added or changed the lesson itself is
settled, so the choices bar gives way to a selection bar: its heading (`Add
another lesson`, `Add a second weekly time` or `Change a lesson`), the lessons
chosen so far and the coral arrow `Back`, which returns to the unchanged
selection; `Remove this lesson` sits there while one is being changed. No slot
is held until the final confirmation. Keep 44px actions on phones. A trial
remains one first lesson. All selected lessons use the chosen duration and
location.

Weekly bookings start with one date and time and may add a second weekly time.
Both starting dates fall in the same Monday–Sunday week in Porto, so the second
calendar shows that week only, under its month and without arrows, and the rule
is never spelled out. The chosen times repeat for the common 4/6/8-week or
ongoing period. Show both starting dates and times together, check later
occurrences for both, and name any unavailable lesson times precisely rather
than suggesting the entire week is lost. Once a starting time is chosen, the
journey goes to the confirmation while later weeks are checked; the expected
all-clear stays silent, and only clashing weeks appear before the student can
book. One confirmation and one card setup cover the selection. Every lesson
keeps its own charge and change rules; the two weekly times remain
independently manageable from the lessons calendar. A conflict during
confirmation retains the student's whole selection for correction and never
silently books only part.

The confirmation is the review. The choices bar comes with it, without a title
of its own, so the kind, place, length and repeat still change in place; a
single chosen time is kept whenever it is still free for the new lesson, and
otherwise the times return with a short note saying so. Beneath the bar, each
lesson is one row with its date, time and pencil (named `Change date or time`
for assistive technology), then the add card when another lesson is allowed.
For weekly lessons any clashing weeks are listed right beneath, as soon as the
repeat or length changes and whether or not the student has signed in: a coral
card shaped like the lesson rows, with its own mark, the count as its title, the
plain consequence (they `won't be booked; the rest go ahead`, without the advice
the choices bar already gives) and each clashing lesson as a coral chip. On wide
screens the bar and lessons sit on the left and the account or final details on
the right, in the calendar step's proportions; phones stack them in that order.
Name the lesson's clock once with the selected time: the student's own for an
online lesson, Porto's for one in Porto, and never a second time beside it. The
notes and final confirmation action follow, with no second recap page or
combined `Change details` route. The optional notes textarea uses one clear blue
focus boundary rather than stacking coral and blue rings. Completed decisions
collapse into a compact row, so account tools, the calendar and confirmation
never compete at once.

There is one price at the point of payment: each length shows the student's own
price (`60 mins · €25`), and nothing under `Confirm your lessons` or on the card
step repeats it; the card step says only `Your time is held while you save a
card` and `Nothing is charged now`, as dabs. The payment summary is a short list
rather than a paragraph: one fact per item, read top to bottom in one column at
every width (paired, the facts wrap raggedly in a narrow column), each after a
little dab of paint cut from the FAQ mark and turned and coloured differently
from its neighbours. Every fee fact stays, with the amount in coral, in the
site's words (see One voice and one hand); when a fee is charged, and that a
no-show costs it instead of the lesson price, are left to the linked terms.
Paying on the lesson day, `The full rules are in terms & privacy` is the last
item rather than a link standing alone above the final action; with card
payment the agreement control is unchanged. The step heading leaves room for
Beth Ellen's descenders.

After a successful one-off or weekly booking, the confirmation's primary `Back
to your lessons` opens the lessons calendar so the new booking is immediately
visible on its day. The confirmation itself is one hand-cut card on the booking
cards' lilac sheet, read top to bottom: `You're booked in.`, the day with its
times beneath it, where the confirmation went, then the two actions, and a
small-print foot under a soft rule with the reference and the site's two
change-and-fee dabs. It starts at the top of the step like every other, no wider
than it needs, centred on a wide screen. The lesson's own mark lands in its top
corner as its only seal, so there is no separate `Booked` badge. Several lessons
are each named once, short (`Tue 20 Oct, 10:00`), and a weekly booking reads as
its weekly time (`Tuesdays at 10:00`, from its first date) with the count
beneath; a week or time that was already taken is a coral chip under one short
line, never a box inside a ruled block. With several lessons the second action
goes, since each opens from the calendar.

Times are on the student's own clock. An online lesson shows on the browser's
clock and a lesson in Porto on Porto's, where it happens. Each time is shown
once, on one clock, never as a pair, and days follow the same clock, so a lesson
after the student's midnight sits on their next day. For a student elsewhere a
time standing alone names its clock (`09:00 Los Angeles time`, or `10:00 Porto
time` for a lesson in Porto); in Portugal times stay plain, and the confirmation
and a day's times name the clock once. A student whose clock differs from
Porto's at any time of year is told so once, in the calendar's header beside its
months; someone on Porto's clock sees no line. A weekly time is kept in Porto,
so for a few weeks around a clock change its time elsewhere moves by an hour;
its weekly label names the student's usual time.

The page asks for its lessons and free times as its HTML arrives rather than
after its code, reuses free times fetched in the last minute, and while idle
fetches what the next likely step needs, the sign-in form's code included, so
each step shows what it can at once. Opening a booked lesson shows it straight
away from what the calendar already knows, while the rest loads. The booking
page holds the workspace's room while it is empty, so the footer never flashes
up the page on a slow phone.

Public `Book a lesson` calls to action explicitly open new booking, including
for returning students. `Book a trial lesson` opens the trial's location choice;
existing students receive their eligible ordinary choices. `Book a 60-minute
lesson` and `Book a 90-minute lesson` open booking with that length already
chosen. The main `Booking` navigation still opens a returning student's
schedule. In the desktop header it is the one button among the plain links, in
their own dark blue and with no line beneath it, since booking is what the site
is for. Pointed at, it answers as the links do: it turns coral, keeping its
shape, rather than reshaping and lifting like the page's own buttons. The phone
menu keeps it a row like the rest, with its own coral `Book a lesson` below.
There is no second `My lessons` navigation destination. Old `/my-lessons` and
emailed `/booking` links retain their destination and tokens in `/book/`.

Preserve these states:

- primary coral and secondary outline actions share a 52 px height, Montserrat
  0.7 rem labels, 0.12 em tracking, and the same hand-drawn button radius.
  Tertiary text actions use the same type at 40 px minimum height and align to
  the right wherever the label fits, on mobile as well as desktop;
- transitions belong to the account, choice, calendar, detail, and confirmation
  surfaces individually: only what a decision brings into view dissolves in,
  with a few pixels of settling motion, rather than page-wide view snapshots or
  every surface fading again at every click. Guidance begins with the state
  change instead of waiting for decoration to finish, and the page scrolls only
  when the next decision is not already comfortably visible. Loading copy and
  its replacement controls dissolve into one another rather than snapping.
  What stays, stays still while the opened history, calendar page or profile
  fields settle into place. Buttons stay responsive during motion. Reduced
  motion removes both the transitions and smooth scrolling;
- preserve the current mobile reading order and full-width stacked lesson
  choices. Opening either the header hamburger or footer `Menu` opens the same
  four main destinations over the current viewport. When opened from the
  header, its handwritten wordmark and close control retain the header's exact
  position and size, including beneath the optional portfolio banner. Share the
  header's layout rules; do not give the menu a separately sized or animated
  logo. Only the destination links drop down beneath that stationary row. A
  footer opener places the same row at the viewport top. Do not replace the
  wordmark with an uppercase text label. Its destination links keep the shared
  Montserrat navigation font. It does not scroll the page to the header first.
  Focus stays inside the menu; closing it or pressing Escape returns focus to
  its opener and retains the page position. Navigation and resizing to desktop
  release the scroll lock. Short screens can scroll the menu itself to reach
  every link. In the phone menu, `Message on WhatsApp` is a lilac fill beside
  the coral `Book a lesson`, and the close fills with lilac and gives its cross
  a quarter turn when pointed at (never on touch, where the opening tap lands
  on it).

## Your lessons

A returning signed-in student opens directly on their lessons. The account has
two places, `Your lessons` and `Edit details`, and Your lessons is one calendar
card, which carries the account as well: there is no separate account bar above
it and no separate list to keep in step with it. The calendar reaches every
future commitment, and beneath its key on the same card `Past lessons` lists
what has happened, each lesson's homework at the end of its own row: one
schedule. There are no separate Past lessons or Homework cards, no places for
them in the menu and no homework card grid. The lessons calendar has one name,
`Your lessons`: the account menu's item with its count, the way back from
booking, a homework sheet and Your details, and `Back to your lessons` after a
booking.

On a wide card (1100 px of booking column and up) the header is one row: the
account's places open at the top left as one sliding control of the booking
bar's kind, its blue thumb on the card that is showing, and the coral `Book a
lesson` at the right. The name is not repeated there: it, the student's splat
and `Sign out` live in Your details. On a narrower card the student's name leads
it as the account's menu, with `Book a lesson` at its top right (`Book` on
phones, keeping the full name for assistive technology); on a phone `Book`
always shares the name's row, the name cut short first if it must be. The bar
above already says Your lessons, and on a wide card the places name it, so the
card's own title is for screen readers. On a phone on its side, or any window as
short and narrower than 1100px, the name's menu, the months with their `?`, the
arrows and `Book` share one header row, so the four weeks start a row higher; a
tall screen keeps two.

The signed-in identity appears once, with the account's menu. Its places are
`Your lessons` and `Edit details` (`Done editing` while editing), then, where
the menu folds, `Sign out`, in that order: past lessons and their homework are
part of Your lessons. On a narrower card the name is the menu, and plainly a
button: a cream pill holding the student's splat, or their initial in a blue
circle until they choose one, their name and a chevron, never the site menu's
three lines, so a phone shows one `☰` for the site and one clearly different
account menu, and it opens over the card. Pointed at, the name pill alone
brightens to white, because the hover wash sank it into its card. Booking is not
repeated in the menu: its one coral action belongs to the card. `Your lessons`
may show the useful upcoming count; it counts an active repeat once and each
retained date of a stopped one on its own. Account destinations open
consistently: selecting the current view again keeps it open. Saved names and
splats update every account menu immediately. The menu lives in the account
cards, behind an open lesson too.

On a wide card each booked day spells its lessons out: the time each runs from
and until (`09:00–10:00`), after a globe for online or a little person for in
Porto, both named in the key. The next lesson's day is filled in its kind's
colour, coral or, for a weekly lesson, lilac ink, so no row stretches across the
card to say it. Hovering or focusing a booked day shows its lessons in full in a
small dark tip pointing at the day, its date named once above its lessons:
`Next lesson` or `Happening now` on the next one, then when (the clock named, as
a lone time names it), how long, where and `Weekly`. Clicking opens the lesson,
with its Meet link, `Change` and `Cancel`. On a phone a day shows the mark over
the start time, and the next lesson, or `Happening now`, keeps its row beneath
the header, on the card's own colour: its words on the card's left edge with the
name and the weeks, its mark at the right as its seal, and `Join Google Meet`
beneath as a cream button. Any card keeps that row when the next lesson lies
beyond the first four weeks: its date and time in one plain line, then its
length, location, `Weekly` when it repeats and its Meet link, opening that
lesson directly. A running lesson stays upcoming, with `Happening now` and its
call, until its end. History and counts advance with the current clock without a
reload, on both student and teacher screens. With nothing booked, `Nothing
booked yet.` alone says so above the same calendar; `Book a lesson` says the
rest. Free times do not appear in this lesson overview, and it has no second
context strip or selected-day panel.

Future calendar dates keep their plain date tiles, with a hover/focus highlight
and no separate `Book` label. A free date opens booking on that day at once,
with its times and no question first. A date with one lesson opens that lesson
directly; a date with several opens a list titled by that date, listing each
lesson's time, length, location and `Weekly` when it repeats, with `Book another
lesson` and `Not now`. Booking checks times for the chosen length; an unchecked
date does not imply availability, and a date with no free times says so with the
calendar a tap away. Dismissing the list, or closing a lesson, restores focus to
the date. Weekly lessons are lilac on the calendar and one-off lessons coral; a
day holding both keeps each time in its own colour, and the key names the two
kinds only when a weekly lesson exists. The `?` beside the calendar's month says
that a booked lesson opens its details, change and cancel choices, and that any
other day starts a booking; its tip floats over the weeks on a dark blue
surface, pointing at the `?`, without moving anything beneath it. In these
already-booked summaries, ordinary lesson product names are replaced by their
useful compact duration (`60 mins` or `90 mins`), while a trial stays named.
Booked marks vary by 60/90 minutes and Online/In Porto; a repeating schedule has
its own fifth mark. Do not reuse the stacked-wave emblem for booked lessons.
History and profile editing never leave a future calendar floating beside or
underneath them.

Each past lesson is a row of two lines, as many across as fit, cut in the tile
hand on the raised cream: its day and time with its homework chip or a coral
`Cancelled` at the line's end, then its length and place and the homework's
Portuguese title. A lesson that simply happened needs no word, and the booking
reference is left to the emails that carry it. Rows in one line share a height,
and a cancelled lesson's first line is as tall as a homework chip, so the dates
line up across the row. A past lesson's long date breaks before its year, never
leaving the time on a line of its own. Six show, the rest behind `N earlier
lessons`; with none the section is not drawn. Order rows by when each lesson
ended or was cancelled, newest first, so cancelled future dates do not bury
recently completed lessons. Past lessons are records rather than actions, with
no hover lift or management affordance; the one exception is a cancelled lesson
whose time is still free, which has a quiet `Book again` chip at its row's end
that opens it. Homework stays under its own past lesson, and the Meet link on
its lesson.

Your details and a lesson's homework each take the lessons card's place, in the
same hand and headed the same way: on a wide card the same row, with the places
exactly where they were and the thumb on Your lessons for a homework sheet (its
state takes Book's place at that row's end, and the places' `Your lessons` is
the way back); on a narrower one the title centred at the top and the name's
menu beneath it, which holds the way back, with the sheet's own `Your lessons`
back. `Done editing` returns to Your lessons.

Your details reads as a short list of what is saved rather than a form, set
directly in the card with no second framed card inside it and no rules between
its rows: the student's splat, name, email and NIF, each value its own button
with a small pencil at its end, named `Add NIF` where there is none. Changing
one opens its field in the value's place, ending in a tick and a cross (`Send
confirmation link` keeps its words), and closes once saved; only an open email
carries a short note, the NIF's purpose being its field's placeholder. A long
email breaks after its `@`. A student can wear one of the site's splats beside
their name instead of their initial (`students.mark`): the splat opens as a row
of the site's own marks, all but the FAQ's question, with the initial first;
choosing one saves it, and it shows wherever the name's menu does. A `Card` row
follows the email where the site takes cards: `Saved`, `Saved for lessons you
book` or `Not added`, its pencil named `Change card` or `Add card`. Opening it
shows the confirm step's dabbed terms in place (the two €5 fees among them) and
`Agree & add card`, which goes to Stripe's page; an open Card row also offers
`Remove card`. A saved price is a row like every other detail. `Sign out` waits
at the card's top right as the small outline button, with a 14 px label. The
last item is the quiet `Have a code from Inês?` line, which opens one field with
a blue `Add code` beside it that stays open for the second length's code, with
any saved weekly rate listed above it.
Profile inputs use the same single blue focus boundary as the booking notes
field. Text fields are 44 px tall, the usual touch height.

While a lesson Inês added is still paid to her by hand, Your lessons opens on
one sheet card alone, its calendar held back until the card is agreed. It is the
same card a payment link opens: a card icon in a lilac disc, `Confirm your card
payments`, `Porto time` over their weekly run or the lessons she added as dashed
tiles, then the three dabs described below, the agreement capsule `I authorise
card payments for my future lessons`, then `Agree & add card` alone. The card comes first, with no
`Not now`; only a card that can't go ahead (its lessons already settled, cards
switched off) adds `See your lessons` beside the error for that visit. Back from
Stripe it becomes `Card saved. You’re all set. Book, move or cancel your lessons
below.` above their lessons and `Book`. That success waits for verified current
card permission; a return URL alone cannot hide `Add card`, and removing the
card clears the success state. Its words are as short and plain as they can be,
and so are the emails that bring students in.

A payment approval link for lessons Inês added opens the same card, in the
site's own styling and words. One lesson is the booking step's cream time tile;
several stack as the booking step's chosen lessons do, each a smaller tile. Each
tile has its own splat, its day and start on one line, never wrapped, and its
price on the right, under an `Outstanding lessons` label that names `Porto time`
once for every tile. `Charged now €45` follows under the prices as a receipt's
total, with no rule over it, worked out from the lessons whose charge time has
passed (`Total` with `Charged at the end of each lesson` under it while none
has). Their lessons still to come that Inês added follow
with no label of their own, each weekly run once as `Every Tuesday, 17:00` in a
dashed tile with the weekly lilac repeat mark, so it is plain the card covers
their weekly lessons, and the capsule reads `these and future lessons`. The dabs
stay few: three sit over the capsule, `Future lessons are charged at the end of
each lesson` always first, said as a dab and never as a label over the tiles,
then the fee's two. The capsule carries `Terms & privacy` inside it, and the
action is `Authorise payments` with a saved card, otherwise
`Agree & confirm payments`. A wide card sets the lessons on the left and the
dabs and agreement on the right, level in the middle; a phone reads them top to
bottom.

The same step opens by itself at every sign-in for a student with lessons
already had that are still owed, whatever card they have, existing users
included. There nobody ticked the lessons, so each `Outstanding lessons` tile is
a toggle: pressed, it will be paid; pressed again, it is left out, dimmed as a
disabled control is with its price struck through, and one quiet line under them
reads `Already paid Inês for one? Tap it to leave it out.` (`Already paid Inês?
…` for a single lesson). `Charged now`, the caption and the capsule follow the
lessons still in, and pressing a tile clears the capsule's tick, since what is
agreed has changed. With none left in, the step is the plain card ask (`Agree &
add card`) where lessons to come still need a card; where nothing else is asked,
the terms and the capsule go and one quiet `See your lessons` closes it for the
visit. What was left out is not asked about again in that visit; a new visit
asks again. Lessons from Inês's own link stay fixed, with no toggles and no
line, since she ticked only what is still owed.

A sign-in link from an email or WhatsApp opens on the welcome: the splat mark
and a handwritten `Welcome` (never a plain card-style heading), `Your lessons
with Inês, all in one place. No password needed.` (for a payment link, `Sign in
to pay for your lessons.` in place of the first sentence), and, for a student
with no email, `Your email` with `So you can sign in on any phone or computer.`
beneath, then one coral `See my lessons`, greyed until an address is typed. The
link is spent only when that is pressed, since mail scanners open links on their
own; a spent link says so there and offers `Email me a new link`. Arriving is
one step to a screen, with nothing said twice and their lessons last. The
welcome has no dabs: the rules and what they pay for are on the card page that
follows. Nothing asks them to book what Inês has already booked.

A student with no email must give one, on the welcome: it is their only way back
in on another device. If that didn't reach the Worker, Your lessons asks first,
`Add your email` with coral `Add email`, with their lessons held back until it
is sent. Then the card to confirm, then, while the address waits, `Check your
email` / `Open the link we sent to … on this phone.` Their Details email row
reads `Not added` with `Add email`.

Signing in to view lessons shows the `Your account` card on its own, with no
`Back` above it: the header's `Booking` starts afresh. Its heading stays `Your
account` whichever tab is chosen, since the tabs alone name the mode, with no
intro sentence; only a `Sign in` heading follows the tab. `Forgot password`
belongs to `I have an account` alone: someone creating an account, including at
the booking's `Almost there`, has no password to forget. The panel's other ways
in, `Email a link` and `Forgot password`, are quiet chips in sentence case, side
by side down to a 360 px phone; asking for a link is its own small form, like a
forgotten password, without the tabs or Google. Every sign-in card is the one
card, on Inês's page as on a student's: one width, one small full-colour mark
centred above its heading and clear of the words, and the heading in the display
hand.

A signed-in student's Your lessons is drawn at once, before the account arrives:
the places (or the name's place on a phone), Book, this month and its four weeks
with today marked, set exactly where the real card's are, so that when the
lessons arrive only they appear. Meanwhile the days shimmer and a splat turns in
the card's corner, or where the next lesson's mark will be on a phone
(`LessonsLoading`). A return visit skips even that: the page remembers the
account as its session last read it (a week at most, forgotten on signing out)
and opens on it at once while asking again, so Your lessons shows in about a
seventh of a second. Moving between Your lessons and Your details, the places'
thumb glides from where it stood to the card now showing, and that card's
contents slide in from the side it was reached from (forward from the right,
back from the left); with reduced motion both simply appear.

## Account interaction states

Opening any lesson keeps the calendar in place and adds a compact overlay that
pairs the booking status with `Change` and `Cancel`; it must not replace or
reorder the underlying lesson workspace. No question repeats its heading and
buttons, and no rules sit around the lesson's date. Its pill is a lavender
`Weekly lesson` only while the repeat is running, `Booked` once it stops, and
`Cancelled` carries the past lessons' ⊗. A weekly lesson's run line is a quiet
fact, simply its weekly time on the lesson's own clock, such as `Thursdays at
18:00 Porto time`, or `No longer repeating` once stopped. A student's `Join
Google Meet` in their lesson's dialog is the same raised cream pill with Meet's
mark as on their next lesson's card, never an underlined line.

A student's lesson mirrors Inês's: one `Change` and one `Cancel`, which stand
alone without an explanatory sentence above them. For a weekly lesson each
starts on `This lesson | Every week`, at `This lesson`, which affects only that
date; `Every week` moves, resizes, stops or cancels the whole run. `Every week`
starts from the run's first lesson that can still move, so keeping the time
keeps every week where it is; changing only the length or place keeps the time
chosen. Stopping a repeat turns every retained date back into an ordinary coral
lesson.

`Change` keeps the page dimmed and lifts that same calendar and time picker into
the overlay, `Change your lesson`; it never dismisses the modal or scrolls the
student down the underlying page. The overlay is one surface, without framed
cards nested inside it and with no decorative horizontal dividers. It says the
date once: its heading standing alone, a weekly lesson's `This lesson | Every
week` slider and one short line for the lesson as it stands (`Currently Thu 15
Oct, 18:00 · 60 mins`) come first, above the calendar on a phone and across the
top on a wide screen, with no eyebrow. Where the form sits beside the calendar
it shows the usual four weeks from the lesson's week, so there is no empty half
and no `Show all`; where the form stacks beneath it, as on a phone, the lesson's
week alone with `Show all` on the key's row. The overlay asks for a day once;
the chosen day reads short above its times (`Fri 16 Oct · Porto time`), and a
day with nothing free says so. A day filled coral shows every booked time in
white. On a phone the length and place controls name themselves without
legends, as in the booking bar.

Eligible ordinary lessons can switch there between the same compact `60 mins`
and `90 mins` choices and Online/In Porto, with the current date and time
already selected. Length uses the same sliding two-option control as `Online` /
`In Porto`, so changing an existing lesson feels like the booking flow rather
than a separate tool. A paid lesson is never silently repriced. What the change
will do is a dab each above its one filled button (`Moves to Tue 22 Sept at
10:00`, `Becomes 90 mins, €35`). That button saves only once something differs
from what is saved (`Save changes` waits as the tick does), so a press never
sends a move to the lesson's own time. `Keep current time` (`Keep current
schedule` for a recurrence) is the one way back, with no separate `Back`: as
wide as its words and stacked beneath the coral action, so neither label breaks
onto a second line. The policy band follows the Worker's payment mode:
saved-card bookings say that the lesson price is charged after it, while
changing or cancelling less than 14 hours before it costs €5.

Cancellation stays inside the overlay until it is explicitly confirmed, at
desktop and mobile sizes, and nothing changes before then. Cancelling states
what happens rather than asking again. A one-off lesson's cancel doesn't say
"only this date", which matters only where other weeks stay booked. A weekly
lesson's `Every week` has one filled `Cancel all booked lessons`, its outline
`Keep lessons`, and `Stop repeating`, which keeps the booked dates and stops
adding new ones, as a quiet chip beneath; the step is the question, so neither
asks again. That step must state that paid cancellable lessons are refunded
automatically and that a lesson less than 14 hours away remains booked. A
decision's pair of actions (`Yes, cancel it` / `Keep lesson` and the like)
shares a row while both labels fit on one line, and stacks when they don't, so
no label wraps; every row of buttons in the booking dialogs follows that one
rule.

A lesson the student cancelled, whose time is still free, says so in its own
dialog with two dabs under its lines: `Same time, €25`, and how it is paid
(`Paid to Inês directly`; on a card, `Charged to your card at the end of the
lesson` with the site's two change-and-fee lines, because the press is the
agreement; nothing more for a free lesson). `Book again` is the dialog's one
filled action, `Done` its quiet pair. This holds right after cancelling and when
the link is opened later. Booked again, the dialog shows the new lesson under
`All sorted`: `Your lesson is booked again. We’ve emailed you and updated your
calendar.` From an email link, when nobody is signed in and the lesson is one
Inês added and is paid to her directly, one quiet line beneath the actions reads
`See all your lessons and pay by card`, with the chip `Email me a sign-in link`.
Pressed, it is replaced by the sign-in panel's own words. Where a card can pay
for the lesson from the page itself (below), the line reads `See all your
lessons`.

A lesson Inês added that is paid to her directly, and that a card can pay for
from here, says so on one quiet line beneath the dialog's actions: `Paid to Inês
directly`, with the chip `Pay by card` at the line's end. The way into the
account, where it shows, is the line beneath it, and the two sit as a pair.
Pressed, the dialog becomes a step headed `Pay by card`, as cancelling does. For
a weekly lesson the site's slider chooses `This lesson | Every week`, starting on
`This lesson`. Then the dabs say exactly what is agreed: `€25, charged to your
card at the end of the lesson` (or `€25 a lesson, charged at the end of each
lesson`), the site's two change-and-fee lines, `Weekly lessons carry on until
you stop them` for every week, `This card replaces the one saved before` where
the student has a card saved, and the terms link. `Agree & add card` is the
step's one filled action and opens Stripe's page; `Back` is its quiet pair. The
press is the agreement. Back from Stripe, the dialog says `Confirming your card…`
in its outcome place until the lesson reads as on the card, then, under `All
sorted`, `Card saved. This lesson is charged when it ends.` (or `Card saved.
Your weekly lessons are charged at the end of each lesson.`). If the card has
not arrived after a few reads it says `Your card hasn’t been confirmed yet. You
can try again.` and the line with its chip is back.

`Terms & privacy`, a day's list of lessons, the change overlay and Inês's lesson
dialogs are one family with the lesson dialog: the same hand-cut panel with the
same edge, shadow and inset, its round close button in the same top-right
corner, over the same lightly dimmed page, never a darker scrim for one task
than another. Every dialog, Inês's included, is a booking card lifted off the
page: the same lilac sheet over paper, with no gradient or warm corner of its
own, and what sits in it to press or type in (times, fields, lesson cards) is
raised in cream, as on the page, so the change dialog's slider tracks and free
days are raised cream exactly as on the booking sheet. The day's list needs no
ruled header, and each of its rows wears the lesson's own mark, as on the
calendar. Terms keeps the rule under its title, where a long text scrolls
beneath it.

## Reading pages

- In `Terms & privacy` the five section headings are the site's lilac eyebrows,
  set well apart from the section before, so the overlay's title, its sections
  and the bold labels inside the points read as three levels. A list never sits
  tight against the sentence that introduces it.
- Stacked, the FAQ index keeps two columns at every width, so on a phone it is a
  short block above the first section rather than the whole first screen. Phones
  drop the `Index` label (the list keeps its name for assistive technology), and
  the index's own last rule is the only line between it and the section, whose
  rule is drawn under its heading. The FAQ's closing actions are compact, and
  its booking action says `Book a lesson`, as every other one does. FAQ
  directions lead through sign-in to Your lessons.
- The Approach points are headed in sentence-case Montserrat at reading size,
  and each point's line is no larger than its heading, so the three read heading
  first, as the Home principles do. Side by side, the intro line narrows with
  its column so its last word always stops short of the fan. `Meet Inês` lists
  its three credentials one to a line rather than run together between
  separators, and closing paragraphs avoid leaving a word alone on their last
  line.
- On Lessons, the trial's `60 mins` tag is centred on its price and never makes
  that line taller, so the three cards' rules and sentences are level. The
  lesson cards keep a duration tag only where the title does not already name
  it.

## One voice and one hand

Things are said and drawn one way, on a student's side and on Inês's: where two
screens do the same job, they use the same piece.

The words:

- a student `change`s or cancels a lesson, in that order, as the `Change`
  button and the late change fee say, and a weekly run is changed with `Change
  every week`. The €5 is the `late change fee` wherever it is named, and a
  no-show costs it instead of the `lesson price`;
- the rules read the same wherever a student meets them (the card terms, a
  payment approval, the booking confirm step and its success), each fee stated
  once, the free part first, as two dabs: `Free to change or cancel a lesson up
  to 14 hours before` (the first four words bold in ink, since coral is for a
  charge) and `€5 to move or cancel later, or if you don’t show up` (the €5
  bold, the no-show part only where cards are taken); `Your card is charged at
  the end of each lesson`; and with no fee `No fee to change or cancel, or for a
  missed lesson`.
  When lessons are charged follows the charge window: `after each lesson` while
  the hourly charge runs an hour after the end, `at the end of each lesson` once
  that window is nothing;
- a length is `60 mins` as a label (the choices bar, the Lessons cards, booked
  lessons, Inês's form) and `60-minute` before `lesson`. Lessons are named by
  their length everywhere, the Lessons page, emails, calendar invitations and
  receipts alike, never "single", which reads as "only one" beside a weekly
  slot; the trial keeps its name;
- a lesson that repeats is `weekly` wherever a student reads about it, never
  `recurring` or a `sequence`: `Weekly lesson`, `Every week`, `Change every
  week`, `Stop repeating`, `Cancel all booked lessons`, the `weekly rate`;
- apostrophes are curly, failures say `couldn’t` (the 404 keeps `This page
  could not be found.`), and every retry is `Try again`;
- a weekly clash is a week `already taken`, before booking as after it;
- one label per field (`Your name`, `Email`), one name for a code's price (the
  `saved weekly rate`), one name for the policy (`Terms & privacy`), and Inês's
  pattern is her `weekly hours`;
- a time range closes up (`09:00–14:00`); a date range keeps its spaces (`5 Oct
  – 1 Nov`);
- the least text that does the job: a screen says a thing once, and a button's
  own words stand in for the sentence that would explain it. Before adding a
  sentence, look for one to remove. Explanations shrink to what the control
  cannot say: the price editor's three hints are one line, and a NIF field's
  "optional, for your receipts" is its placeholder, at sign-up and in Add a
  student as in Your details;
- a heading is not used to say a fact: what a sentence can say as one of the
  dabs is a dab, and money terms are dabs, never small-capital headings in a box
  (the invite's owed-now and not-owed-yet lines). A tooltip or menu about one
  thing says it once: a day's tooltip names its date once above its lessons,
  and a menu has no rules between places of one kind, only where places meet an
  action (`Sign out`);
- notes and empty states speak at the hint size, never a paragraph's.

The drawing:

- anything to read before trying again sits in one coral panel, on the student
  pages and Inês's alike, its ways on (`Try again`, `Message Inês`, `Sign in`)
  after the message as small outline buttons side by side, each keeping its own
  width at the panel's end, on a phone as across a wide page; across a wide
  page, on booking and the account alike, the message and its ways on share one
  row. Good news (`All sorted`, a changed password, a reset link on its way, a
  saved profile field) is a calm lavender panel with a 20 px tick, never a
  coloured stripe, and says the link's one-hour life only where the form above
  it does not already;
- secondary actions share one outline, and going back is always the small coral
  arrow link, never an outline button or an underlined word;
- every pop-up's title is set alike, and its way out is the same 44 px hand-cut
  button; focus keeps the site's own ring;
- every booking card is one sheet in the site's palette, the lavender wash (see
  Contrast and accessibility). What sits on it to be pressed or read is raised
  in the paper cream of the lesson cards and dialogs, without an outline of its
  own: a free day, a time, a control's track, a past lesson, the account's menu
  button. The next lesson's row sits on the card's own colour. Blue marks where
  you are and what you have chosen; coral is booking and the lessons booked;
- colours and shadows used in more than one place are named tokens (pressed
  coral and lilac, warning ink, the outline edges, the hover wash, the dialog,
  menu, lift and raised shadows); text on blue or coral is the paper colour,
  never pure white. Faint rules are drawn in ink;
- one pace for every hover: the surface motion (190 ms on the soft ease). The
  Meet pill answers one way: pointed at, a student's `Join Google Meet` fills
  coral as Inês's `Join Meet` does;
- disabled is the same everywhere: a filled button becomes the quiet outline at
  55%, on her page and in her dialogs as in booking.

Buttons:

- no word on its own is an underlined button. Underlines stay for links inside
  sentences, the footer's `Terms & privacy`, emails, and a question only some
  people have (below);
- a button is as wide as its words. It shares a line with the thing it acts on,
  at that line's end, and never takes a row to itself; when it must wrap it
  keeps its own width. The exceptions are the one main action of a step
  (booking's Confirm, a card's `Agree & add card`) and a dialog's paired buttons
  on a phone;
- there are three weights and no more: the coral or blue filled button for the
  one thing to do next; the outline for its pair (`Cancel`, `Sign out`, `Not
  now`); and the quiet lilac chip in sentence case for a lesser action beside
  the thing it acts on (`Show weeks`, `Show all`, `Record refund`, `Put it back`, `Remove card`,
  `Send reset link`, an open lesson's `Homework`, `Change` and `Cancel`). The
  chip is the third weight everywhere: on Inês's tabs it replaces the
  capital-letter filled lilac site button for lesser actions (`Edit weekly
  hours`, `This week`, `Set exact hours`, a notice's `Connect`, `Download CSV`,
  the choice's `Time off` and `Online only`). A chip that is a state and not a
  step (`Time off`, `Online only`) is the deep blue of a chosen tab while it
  holds. A disclosure that folds a rare choice away (`Set exact hours`, a clash
  list's rest, Meet's note) is that chip with a chevron that turns, never a fill
  when open. A question only some people have (`Have a code from Inês?`) is a
  quiet underlined line of text, not a button;
- a rare action (`Try again`, `Mark as dormant`) is the site's small button:
  40 px tall (44 px on touch), the compact label type, in outline. It keeps its
  own width on a phone, where other buttons still run full width. Inês's buttons
  take the booking workspace's type at her denser 44 px;
- a set of choices about one thing has one filled button. A destructive choice
  the step itself asks about is that step's one filled action, with its way back
  beside it (`Cancel all booked lessons` / `Keep lessons`), and is never asked
  again in a second step. In her lesson dialog a cancelled lesson has no `Done`: its cross closes it;
- a form that changes something saves only once something differs from what is
  saved;
- a control that repeats another is removed, not moved: there is no `All
  students`, because an open student's Close already returns to the board;
- a link that belongs to a pill sits at the pill's right-hand side, beside the
  words it belongs to (`Terms & privacy` in the authorise pill), so the pill is
  no taller than those words.

Changing a value:

- a value that can be changed is its own button: the value, then a small pencil
  at its end. Pressing either opens it. Where several values sit under one name,
  the name has the one pencil and the values are plain lines; it opens
  everything under that name as fields where it reads, with one tick and one
  cross. So a student's card has three pencils, by `Details`, `Price` and
  `Plan`, and none beside their name;
- pressed, the value becomes its field in the value's own place. Its name in
  small capitals stays where it was. The field ends in a small coral tick (save)
  and a quiet cross (cancel), each the pencil's size, on the field's own line.
  Enter saves, Escape cancels, and focus returns to the value. With nothing to
  save yet the tick waits as the quiet outline, never a faded fill. What the
  field cannot save is said beneath it and it stays open;
- where saving does something a tick cannot say (`Send confirmation link`,
  `Agree & add card`), the open field keeps those words as its button, with the
  same cross beside it. An open detail's buttons sit beside its field only while
  the field keeps 11 rem; otherwise they wrap beneath it, whole (her half-width
  card, an email on a tablet), and the field grows to at most 24 rem;
- nothing opens a second panel or dialog to edit what is already on the screen.
  A student's Your details, Inês's Profile and her students' cards use the same
  pieces (`EditValue`, `EditPencil`, `EditActions`, `CancelEdit` in
  `components/teacher/EditControls.tsx`), and booking's chosen lessons and a
  phone's chosen date use the same pencil.

Lines and space:

- space and the small-capital labels group things; a rule is drawn only where
  two different kinds of thing meet (a card's header and its body). Lists of
  facts carry no rules between their rows, and a total needs none above it: its
  place under the prices and its weight say what it is;
- cards are filled, not left with a hole. Using the available space well is
  part of the spec: related labels, values, facts and controls share the row's
  width before anything adds height (a closed student card's three checks stack
  down its left with the next step beside them; a weekly run's time, span,
  shared facts and Show weeks share one top row), and wrap sensibly on a phone
  rather than squeeze or overflow;
- the system's twelve gap steps are named tokens (`--gap-hair` 0.3 rem to
  `--gap-section` 2 rem); older rules move onto them as they are touched rather
  than in one sweep that would shift every screen by a pixel. Inês's cards and
  dialogs take the same card and dialog insets as the students' do; side-by-side
  headings share their line (Translations and its filter); fields in one row
  stand the same height.

## Calendar marks

A calendar's marks are drawn in the site's own hand, one way on every calendar
(Inês's Timetable and Add a lesson month; a student's booking and lessons
calendars; the loading placeholder), and never an underline, a dot, or a word
under the number:

- Today is its date in the deep blue blob (her Timetable's squiggle pill,
  `.today-pill`). It marks the number alone, so it never reads as a chosen day;
  on a day already filled in a deep colour (chosen, the next lesson, a pressed
  day) the blob is paper. It keeps its strength on a day that cannot be pressed.
  It explains itself, so no key lists it.
- A day off is hatched in lilac, with `Off`.
- A day with a lesson booked, on her side, takes one fine, faint hatch leaning
  the other way (`--hatch-booked`), over whatever else the day is: a day that is
  both shows both hatches. On her phone Timetable the same hatch marks the tabs
  of days with lessons. A student's own booked day keeps its tint with the
  lesson's time.
- Online-only time is the one sky blue (below).
- A cream day has times free; a day without lies flat. In Add a lesson a flat
  day can still be pressed, since she can add a lesson at any time; until the
  month's times are known every day keeps its cream.
- Every calendar key is in the one small capital hand, the Timetable's and a
  student's alike. A key lists the marks on its calendar that need saying, and
  no other. Each swatch is a small copy of the day or cell it explains.

## Online only, in one colour

- One colour, `--online-only`, a soft sky blue, means online-only time on every
  calendar, and the key names it. A day carries no globe for it, since the key
  already says what the colour means: the globe is kept for a lesson that is
  online. The colour is not the only way to learn it: a day's spoken name says
  "online only", pressing an online-only day says so in words, and her chip is
  pressed.
- Inês labels a whole day with its `Online only` switch beside `Day off`, and
  some hours from the choice at the times, as she takes hours off, never in a
  dialog. The choice's `Online only` wears the colour as its swatch (so it is
  its own key) and is pressed while the hours are online only. Time off and
  online only are never both: making hours one takes them out of the other.
  Online only labels time a student can book, so extra hours can be online only
  too: such a block is labelled once (`Extra hours 19:00–20:00, online only`),
  opens on `Extra hours` with `Online only` pressed too, keeps its label when
  `Extra hours` gives it new times, and loses it with `Not working`; `Open
  again` takes only the label off.
- Her Timetable tints online-only time on every cell it covers, labels its
  hours as time off is labelled (`Online only 15:00–17:00`, or `Online only`
  across a whole day), and edits it there; the key names it while the week has
  some.
- What happened shows on the week and in `Coming up`, and is said to a screen
  reader (`Tue 15 Sept is online only.`, `Tue 15 Sept can be booked in Porto
  again.`), never a band across the page. A failed save puts the week back as
  saved and says why beneath it. A lesson already booked in person inside the
  hours is listed under `Clashes`.
- For a student who has chosen In Porto, in booking and in `Change your
  lesson`: a day free only online is tinted and can be pressed, since they may
  still book online. Pressed, it says `Online only on this day` beside a quiet
  `Switch to online` chip and shows its times tinted, as a list that cannot be
  chosen. A day with both kinds keeps its Porto times and adds one line, `More
  times online`, with the same chip.
- `Switch to online` is exactly pressing Online in Where. A student's place
  never changes unless they press something that says so.

## Inês's workspace

Inês's schedule reads as the same place as the site, though it is her workspace
rather than a page of it, made for what she does daily. It is headed by the one
bar (see Booking workspace), named `Your schedule`, with her cream wordmark
still the way home and no menu button, site header, links, booking band or
footer; the bar's splat is let go on the narrowest phones. Her tools reach the
first screen, her page fills the window's height, and it shares the page's left
and right edges with the header rather than sitting in a centred box. Her
sign-in has no `Create an account`.

One bar of tabs holds `Students`, `Timetable`, `Receipts`, `Expressions` and
`Profile`, set as a student's places are, in small capitals tracked wide
(0.7 rem, a little closer on a phone so `Expressions` fits its third at
320 px): every bar of places on the site speaks in one voice. On a phone her tab
labels stay readable rather than shrinking to fit; her tabs keep one 1.25 rem
gutter. Moving between her tabs, the panel slides in from the side of the tab
chosen, at the pace the account's places slide, and with reduced motion simply
appears.

Her schedule opens in one step. Until her week arrives, her tabs stand in their
places (already answering, so a tab chosen now is the one she lands on) above a
held week of the real one's shape: the next lesson's band, the month, `Edit
weekly hours`, the pager and the card with a turning splat. The week then
replaces it once, whole, as Your lessons' placeholder does for a student, and
the page does not move. Any other tab holds a plain card with the splat until it
is ready.

Her next lesson, or the one happening now, leads the page in a blue strip with
its `Join Meet` one press away (`Meet link on its way` until the call exists,
and nothing for a lesson in Porto). On a phone its label runs across the top and
the lesson reads down beneath it, who above when and where, with `Join Meet`
beside it, never squeezed into the label's corner; one happening now gives its
times without `Today`.

Her week is set as the student's calendar: a hand-cut card, compact
weekday/date headings with today in a blue date lozenge, the solid blue arrows,
blue lessons over a faint lilac wash for her weekly hours and a date's extra
hours, Monday to Friday only (a weekend day appears when it holds a lesson,
extra hours or hours of its own), and each lesson marks its place as the
student's calendar does, a globe or a person in its top right corner, explained
in the key, with a small `Meet` pill at the foot of an online lesson whose call
is ready. Her arrows turn the week as the student's turn theirs: the days slide
in from the side the week was reached from while the hours stay put. On the
Timetable, `Edit weekly hours` sits beside the month and the pager keeps the
right edge, as on Receipts and as a phone lays them out; the held place of
`This week` is then part of the space between them, never a gap inside a row of
buttons. On her phone the month and pager share the first row; `Edit weekly
hours` and the shown day's `Day off` and `Online only` share the next (below
380 px the switches take a row of their own). The month uses the same short
phone label as Receipts (`Sept 2026`), including while loading, so the month and
both arrows share one row. In her weekly hours, `Set exact hours`, `Discard` and
`Save weekly hours` sit at the top beside `View lessons`, and the exact-time
editor opens as its own panel above the week; on a phone `Discard` and `Save`
wrap together as a pair.

Choosing a free time offers `Add a lesson here` (the student dialog asking whose
lesson, its date and time already in place) beside the hours' `Time off` and
`Online only`, the choice at the times above. Booked lessons in the way, there
or under changed weekly hours, are booked-lesson cards whose `Change` opens the
lesson without losing her draft; more than four under weekly hours fold beneath
`more lessons`. A lesson she added herself, for a booking arranged elsewhere,
reads apart from the students' own while lessons move onto the site: lilac with
a dashed edge and `Added` within its card on the week, `Added by you` in the
key, the strip and its dialog, which says it isn't charged through the site. It
reads as booked, like the students' own, once the student takes it on: it is on
their card, or it is free and they have signed in. The booking system records
which lessons she added, so they stay hers for how they are paid once a
student's card pays for them. Her lesson form has sliders for a lesson's length
and place, with the timetable's globe and person beside Online and In Porto, and
asks `How often`: `Once` or `Weekly`, and a weekly slot then runs for `4 weeks`,
`6 weeks`, `8 weeks` or `Until stopped`, as the student's own choice does.
Everything she does there should take as few steps as it can. A wide `Add a
lesson` runs its calendar the full height beside the choices.

Her lesson dialog is set as a student's own lesson is and is about the lesson,
read top to bottom in one line of sight: the student's splat and name with the
status beside them, the date in bold with the time beneath, then `Join Google
Meet` as a solid blue button carrying Meet's own mark, and the lesson's dabs
(place, length, price and how it is paid). What she records sits together as one
row of ticks, `Already paid` and `No-show` (named `Mark no-show` / `Undo
no-show` for a screen reader), each the same capsule whose dab fills when
ticked; a lesson a card now pays for still offers the `Already paid` tick. Last,
one wrapping row of quiet chips at their own width, the same at every width and
the same as an open lesson in a student's card: `Homework`, `Change` and
`Cancel`, with `Create payment link` where one applies. `Join Google Meet` is
the dialog's one filled button; a lesson in person has none.

There is one way to change a lesson and one to cancel it, and it lets her change
a single lesson or a whole weekly run between 60 and 90 minutes, its dates, and
Online or In Porto. `Change` opens in place, with no heading of its own: `This
lesson | Every week` on the lesson form's slider where the run has later weeks
(this one and every later week), the date and time in Porto, the length with the
student's price for each (`60 mins · €22`; not for a trial) and `Online | In
Porto`, all starting on the lesson as it stands. Its dabs say what will happen
(`3 lessons move to Thursdays at 16:00`, `They become 90 minutes, €35 each`,
`They move online`, which stay as they are and why, `Tue 1 Dec stays as it is:
it's already paid`, and that one email goes), and `Save changes` waits as the
quiet outline until something differs. Where the form has room, date sits beside
time and length beside place, and the buttons sit at the right of the dabs,
level with the last of them, never on a row of their own beneath; on a phone
they follow the dabs. Every week means every later lesson takes the new day and
time in its own week, so the dab is what happens.

A lesson already had is corrected in the same form: with nothing of it on a card
it offers date, time, length and place with the same dabs (`Becomes 90 minutes,
€30`), no `Every week` choice, a new time that stays in the past, and the dab
`No email is sent`. One a card has paid, free, a trial or on their card keeps
its length and place, offers only the date and time, and says why in a dab
(`Length and place stay: it's on their card`). A lesson ticked `Already paid`,
past or to come, is never held by its tick: it takes the change and a dab says
`Stays marked as paid`.

Both `Change` and `Cancel` start on `This lesson`; cancelling keeps `Cancel this
lesson?`, with what happens as a dab. Cancelling every week reads `Cancel these
lessons?`, lists how many and between which days, and confirms with `Yes, cancel
8 lessons`. Confirming a change keeps to who and when (the Meet button and the
lesson's dabs step aside until `Back to lesson`): the question under a quiet rule,
what it does as dabs (`Alex is emailed`, `It comes off your calendar`, `Refunded
in full` for a card payment, or a reminder to refund a payment by hand
directly). A recorded past lesson explicitly sends no email. For a cancellation
that sends an email, `Add a message to the email (optional)` with an example in the box,
its count appearing only near the 1,000-character limit; a cancelled lesson paid
by hand stays visible in history and Receipts. `Record refund` asks Inês to
confirm she already returned it directly; it records that fact, sends no money
or email, and keeps the receipt labelled `Refunded`. `Put it back` undoes a
lesson she cancelled while it is still to come and no money has moved: one
press, like the cancel it undoes, as the quiet chip at the end of the
`Lesson cancelled…` line right after, in the cancelled lesson's dialog, and at
the end of its row in `Past & cancelled` (beside `Record refund` when both
apply); the line then says the student has been emailed that it's back on.
`No-show` is live from the
lesson's start until its end, and before that it shows greyed out with
`Available 11:00–12:00` beneath, so she always knows where it is. The marked
state stays reversible within the same window, the lesson is charged once it
closes, and a no-show means only €5 is taken instead of the full price.
Confirmations keep a `Back to lesson` button beside the confirming one.

From an unpaid lesson's dialog, `Create payment link` opens a tick list with the
opened lesson ticked: `Tick what Jess still owes` and `Their future lessons then
go on the card too.` over one-line Already-paid-style capsules (day and start on
the left, price on the right), with the total on the button, `Create link for
€30`, beside `Cancel`, and no separate count or total line. Ready, it says `Link
ready: 2 lessons, €30. Nothing sent or charged yet.` with blue `Send on
WhatsApp` and outline `Copy link`; the WhatsApp message is one short line in her
voice and the link.

`Students` is there to clear her admin: students pay what is still open and then
book, move and cancel their own lessons. It is grouped around getting everyone
signed in, paying for previous lessons and booking their own, then an easy
profile for each student. Each card has three checks (signed in, card saved,
paid up, with what is open in coral) and one button for her next move, and the
list reads `Needs you`, `To do`, `Waiting on them`, `All set` under `6 of 21
students are all set`. A student with no email is set up, not unfinished: the
usual card, and the Students badge counts only real to-dos. On a wide list each
card keeps its own height, packed in columns, so a short card never leaves a
hole under it. A set-up student's closed row is their splat and name, with a
`Weekly` tag in its corner when they have a weekly run, and no `Student` label,
email, next lesson or weekly line: only what needs her eye stays as a dab (their
own price, lessons paid by hand, a come-back email sent). A set-up student's
controls carry their icons and wrap three and two on a narrow card. Student
search uses the raised cream of the other fields.

A student's way in is their card's `Invite`, whose panel is headed `Send Marta
their link` with one dab, `Signs them in once, within 14 days.`, a two-line
Message she can edit (`Olá Marta! From now on you can book, move or cancel your
lessons with me here:`, or for a dormant student `Whenever you’d like another
lesson, you can book one here:`), the link on its own line after her words, an
outline `Copy` and coral `Send on WhatsApp`. That opens WhatsApp to their number
when it is certain (written with `+` or `00`, or a nine-digit Portuguese
mobile), otherwise WhatsApp's own chooser, so it never goes to a stranger.
Nothing is emailed, and nothing is sent until she presses Send in WhatsApp. A
student with an email can have the welcome email instead, from outline `Email
instead` beside `Copy`. Keep the message short; the site does the teaching.

Her invite first asks `Tick what Marta still owes. Leave any paid in cash.` over
the past lessons nothing has paid, none ticked, since many were paid in cash and
never marked; then coral `Make link with €45 to pay` (or `Make link, nothing to
pay`), so one WhatsApp both signs them in and asks for what is open. The message
names the total and the panel says `Asks them to pay €45 for 3 lessons. Nothing
is charged until they agree.` A lesson paid in cash is ticked `Already paid` in
their profile instead, and leaves what is open. While she ticks, a short list of
dabs under the list keeps two things apart: what is owed now, the ticked total,
charged once they agree, and the lessons to come, which are not owed yet and, if
they agree, go on their card charged at the end of each lesson (the same words
as the card page), each weekly run once (`Every Tuesday, 09:30–10:30 · €25 a
lesson · 12 lessons to Tue 24 Nov`, never a row a week; weeks moved to another
time are counted (`, 1 week moved`) and weeks at different prices read as a
range, `€25–€30 a lesson, prices differ`, never one price for all), from her
existing lessons for that student by account and never by name; if they can't be
read it says so, offers `Check again` (read-only) and the link still works. It
says `Nothing is charged until Sam agrees. Making or sending the link doesn’t
agree to anything for them.`, the same block follows the link, and her message
adds `If you agree, your future lessons are then charged to your card at the end
of each lesson.` Where the card is wide the ticked lessons and this block sit
side by side, stacked on a phone. Nothing ticked says the link only signs them
in, because then it is no approval. Ticking never adds lessons on its own.

An open student's card has one top bar: their name, their three checks beside
it, her actions, then close. The checks keep the bar while one of her panels is
open, and take a line of their own only on a phone and on a closed card in its
lane. A student's lessons on her page are a ledger, one row each: day and time,
facts, then status, notes pencil and `Already paid` at the row's end, in columns
that line up down the list. A weekly run is a row of the same kind with `Show
weeks` at its end. Where the list is narrow a row folds in two (day and pencil,
then facts and money). An open lesson is that same row: its day and time, what
she does with it as quiet chips at their own width (beside the day where there
is room, beneath it on a phone), `Already paid` at their end and the cross that
closes it at the row's end, where the closed row's pencil was. An online
lesson's call leads those chips as a filled pill their size, `Join Meet`, never
a wide button on a row of its own; the wide `Join Google Meet` button stays for a
dialog, where it is the main action. What was said about a lesson is one quiet
quote with who said it (`You: “…”`), never a labelled block. It follows the
lesson's facts on the row's own line where there is room, and wraps beneath them
where there is not.

`Add a student` opens on just a name and an email; their phone, NIF, price and
splat are folded under one small `Phone, NIF, price and splat` disclosure, and
the price can still be set from the start. It ends on coral `Next: their
lessons` over an outline `No lessons yet`. `Receipts` opens on last month during
the first ten days of a month when last month still has receipts to issue and
this one has none yet.

Her notes and empty states speak at the hint size: `Choose a date and a time
first.` sits small just above the greyed action; `Nothing to check just now.`
and `Your collection is empty.` match the dabs around them. `November 2026`
stays on one line beside its arrows; a wrapped Needs-you title breaks evenly
(`Jessica Riley / changed their lesson`); in Lesson history a date reads `Tue 5 Jan`,
adding its year only beyond six months, and its time shares the line on a wide
card or sits beneath it, without the dot, on a narrow one, so `· 18:00` never
starts a line.

Her sign-in details are a student's Your details, in her Profile card under its
own title and her name: the same rows (name, then the value as its own button
with the pencil, the name above the value on a narrow card), a field that opens
in place holding the current address with blue `Send confirmation link` and the
cross, and the site's good-news and alert panels. `Password` shows no value and
no sentence: its quiet `Send reset link` says what happens, and the panel that
follows says where it went. `Sign out` is the small outline button at the top
right, as on Your details. Her Profile's labels are the small capitals legends
of the student's Your details. Google Meet's unconfigured state is a quiet `Not
set up yet`; coral remains for connection states she can act on.

An expression's pencil, and its `Publish` beside its state, follow the site's
one pencil and one quiet chip. Her Expressions tab already offers `View page`,
so its expressions carry no `Open full page` of their own. Her expression cards'
label column fits `Tradução à letra` on one line.

## Transactional emails

The site's emails are drawn from the templates in
`workers/booking/email-templates.mjs`, all by one layout in
`workers/booking/email.mjs`: the banner, a heading and one-line introduction,
the date panel, a coral-dab note, the dab list of facts, numbered steps, one
coral blob button and, rarely, one quiet underlined link, then dab footer facts
and the site's link. Variants of an event (who made the change, one lesson or a
run, how it is paid) change lines, never the structure. Every email is written
as the welcome is: one short introduction that says what happened and who did
it, then the facts as short bullets, each said once.

Emails read as the site does: Montserrat (falling back to Arial) rather than a
serif, the lesson's date on one line and its time and clock beneath with no
`at`, each fact beside one of the confirm step's dabs, Google Meet's mark beside
a lesson's call and on its button, and a hand-cut button. The dabs and mark are
PNGs on the live site (`public/email/`, `npm run build:email-icons`). The
student's emails lead with the lesson's own clock, as the site does: theirs for
an online lesson, Porto's for one in Porto, its clock named once after the time
(`… 09:00, Los Angeles time`), with no second clock. Inês's copies stay on Porto
time and give the student's own time beneath it, when it differs, as a labelled
fact in the date panel. The date panel names the clock and nothing beneath it
repeats it; a list with no panel names it in its title (`Cancelled · Porto
time`). The lesson's date is the only panel besides the numbered steps: a
one-line note (a late fee, a refund, Inês's receipt reminder) is one coral dab
rather than a second panel.

A lesson is one bullet, `Online · 60 minutes · €25`, with how it is paid as the
next and `Join Google Meet` as its own; a run lists its dates one bullet each,
each named short and bold (`Tue 3 Nov, 08:00`) as the confirmation does, the
link beside the dates that have one and the others' promise said once under the
list. Labels stay only where they are the point, small above their fact:
Reference, NIF, Notes, the student on Inês's copies, a new address, `Before` on
her copy of a move, and the `Lesson` row of her payment-received email, which
her records read. A date, a time and its clock, and a number and its word never
break inside, and no heading or fact leaves one word alone; the text part keeps
its words exactly as given.

The day-before reminder's coral button is `Join Google Meet` when an online
lesson's link is ready, with `Change or cancel this lesson` as a quiet
underlined link beneath it; otherwise its button is `Change or cancel this
lesson`, as in the confirmation. It names when free changes end as a date and
time on the lesson's own clock and uses no relative day words. Footers are at
most three dabs, one sentence per dab with any amount in coral: the change rule
in the site's words (`Free to change or cancel a lesson up to 14 hours before`,
`€5 to move or cancel later`), with `A no-show costs €5 instead of the lesson
price` on a saved card. Money sentences keep their exact words. Emails declare
`light dark`: in dark mode they sit on the site's dark blue with cream text,
lilac labels and lighter dabs; under 480px the margins tighten and the button
fills the width. Inês's card-declined and card-added notices are Needs you
cards, not emails. Previews of every variant:
`scripts/render-email-previews-v2.mjs`.

## Superseded work

Superseded visual work is archived outside the repository, at:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.
