# Current visual direction

This file is the canonical human-readable contract for the website's visual
direction, responsive composition, motion, and important interaction states.
Git owns the production implementation and browser-ready assets, and the
published site is the acceptance surface. When this contract and the site
diverge, reconcile them in the repository rather than maintaining a second
design system elsewhere.

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
- `app/globals.css`, components, and `public/visuals/` own exact reusable
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

Lesson homework stays attached to its lesson, inside the student's existing
profile/history for Inês and under Homework for the student. Photo notes and
drafts stay private until Inês reviews and publishes the sheet. Use short,
level-appropriate European Portuguese instructions, recall and useful practice,
with answers separate from questions. Offer Do online and Print worksheet.
Online submission saves a fixed copy for automatic marking; only Inês sees
those suggestions until she checks, edits and approves them. Homework to review
belongs in the relevant student row, as a coral prompt with its count.
Inês's new sheet is the booking journey's step structure, one decision per
step (15 October 2026, Dan: "far too much text"): **What did you work on?**
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
Homework speaks the booking journey's language and uses the room it has
(15 October 2026, Dan: the space felt "underused and lifeless"). Every small
button, tab and chip is a filled paint dab cut to the site's squiggle shapes:
the sliding `Do online` / `Print worksheet` control, state (`Feedback from
Inês` in blue), the way back, `Show answers`, Inês's editor links and the coral
`Homework to review` with its count on a cream drop. The student's list is
Lessons-page cards, three across where they fit, each hugging its content with
its splat cropped into the corner and its title in Beth Ellen. The sheet's head
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
  it leads, and slim headers and bands on short screens (13 October 2026,
  Dan: "the places of where stuff sits can be more efficient like the buttons
  and stuff rather than running onto new lines unnecessarily"). Check a page
  upright and sideways on a phone, both ways on a tablet, and on desktop.
- **Decorative motion:** adding ambient loops, click delay, entrance
  choreography for a page's text, controls or sections as it loads, or any
  movement that makes a reader wait or does not explain a state change. The
  page turn, the phone menu opening, the little splats' one-time landing, the
  rules drawn under the headings and the wordmark's hats dancing on their beat
  (see Motion direction) are deliberate.

## Contrast and accessibility

A student's own price (from a code, or set by Inês) prices every lesson of
theirs at that length, one-off or weekly; the trial keeps its own (13 October
2026, Dan). Their 90-minute price is 1.5 times their 60 unless one was set for
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
Free`, and on her Price tab `90 mins · Free · as their 60`), and a free lesson's own line adds
`· Free` beside its length and place (16 October 2026, Dan). No valid-code
suggestions, catalogue, countdown or expiry pressure belong in this flow. Only
some students have a code, so nothing may suggest most should: sign-up carries
no code field, and Edit details keeps the small disclosure, listing saved
rates only once there is one instead of a standard price for everyone.

Text colours must meet these accessible contrast requirements:

- the second half of the Approach page heading (`way to learn.`) uses `--blue`
  on the lavender panel. Cream measured 1.95:1 there, while blue on lavender
  holds 3.2:1, the same tonal relationship the home hero uses for lilac on blue;
- body ink uses `#1a3169`, and the eyebrow lilac uses `#554f91`, so small text
  clears AA on the lavender and cream panels. Both are imperceptible on cream
  and neither changes a fill colour;
- completed booking-choice values and change actions use body ink at no less
  than 14 px, so both remain readable on the lavender mobile surface.
- Google Meet setup warnings and errors use `#a73523` on the soft lavender
  panel, giving small feedback text 4.78:1 contrast. The coral action colour
  measured 4.25:1 on that surface.

- the booking cards' sheet is `--lavender` at 13% over the page, the booking
  panels' wash from before, which Dan chose back over a solid lilac; coral
  action text on it measures 4.63:1. A booked day is `--coral` 15% over
  `--paper-light` and a weekly one `--lavender` 50%, each the lightest that
  keeps its own coral or lilac-ink text above 4.5:1.

The `--blue`, `--blue-deep`, `--lavender`, `--paper`, and `--coral` fill
colours are unchanged.

Every text field, in sign-in, Edit details and Inês's schedule forms as well
as the booking notes, shows focus as one clear blue boundary in place of its
border, never the coral and blue rings drawn around buttons and links.

With JavaScript disabled, public pages retain ordinary navigation links at
every width, all FAQ categories remain readable, and terms/privacy are readable
in the booking document. With JavaScript enabled, the existing mobile menu,
category selection and terms modal enhance those documents.

## Current responsive composition — 2026-08-31

The intended production state reflects Inês's 31 August feedback:

- the home hero does not contain the business-card artwork, and the “Slow is
  fine” and “Talk first” marks use their generated replacements;
- the approved Home, Approach, Lessons, and FAQ copy is in place; the FAQ banner
  pairs its heading with the existing FAQ splat, with a smaller mark beside the
  heading on mobile; user-facing copy uses natural punctuation rather
  than em dashes; and the Approach callout says “Beginners welcome.” rather
  than “Nervous beginners welcome.”;
- above 900px, the three home principles form a stacked soft-lavender rail in
  the right side of the hero, using the space left by the removed card artwork
  without merging into the surrounding cream page. At 900px and below they
  remain stacked after the blue introduction so the mobile reading order stays
  unchanged;
- the browser favicon is a generated cream-and-lavender organic mark with a
  coral accent on dark blue, replacing the flower symbol;
- the Lessons page closes with one compact blue card rather than two bars: the
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

## Public-page hierarchy — 2026-09-01

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
  dangling alone (13 October 2026, Dan). The blue
  hero has no painted field of its own: the heading, its rule and the actions
  have the panel to themselves (the cream wave tried on 8 October 2026 was
  removed at Dan's request on 9 October);
- Approach, Lessons, FAQ, and Booking follow the same hierarchy: the brand
  anchors the shared header and footer, while each page owns a task-specific
  heading and only the actions that meaningfully advance its reading path.
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
  with an optional NIF field labelled `NIF (optional, for your receipts)`, with no
  note beneath it (10 October 2026, at Dan's request);
  students add, change or clear it under Edit details. The final booking
  action follows the payment and change conditions for the selected method.
  A `Terms & privacy` overlay holds the details, without adding a disclosure
  beneath the workspace. Use five short sections: `Booking`, `Payments`,
  `Changes`, `Your rights` and `Privacy`, with everyday wording and labelled
  points. The opening line explains the 14-hour booking notice. Payment timing,
  free changes until 14 hours before, the €5 fee inside that window and
  the €5 recorded no-show replacement charge remain explicit. Consumer rights,
  Inês's sole-trader contact details and the privacy notice follow in the same
  reading column. Use the existing
  Montserrat text and cream surface, with copyable text
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
  `/booking-terms` and `/privacy` pages redirect into booking; there is no
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

## Public polish — 22 September 2026

Dan's 22 September review tightened the public pages:

- every secondary action is a button: an outline on cream, a light outline on
  blue, at the compact size beside a coral primary action. Underlined text is
  kept for links inside sentences and the quiet `Terms & privacy` footer link;
- the footer has a thin lilac top border so it stays distinct beside blue
  sections, and hugs its content. On desktop it is one row, no taller than about
  120 px: the wordmark, the four destinations, a thin divider, then `Terms &
  privacy` at the right. On phones the destinations live behind the footer
  `Menu`, with `Terms & privacy` beside it where both fit and beneath it on
  the narrowest phones (13 October 2026, Dan);
- banners give the page back to the task, and their art sits halfway down the
  band rather than up in a corner. The Lessons banner is about 230 px on
  desktop; on phones it becomes a lavender band with the splat in a
  square-cornered blue strip at its right edge, like the wider layouts' blue
  column. The FAQ banner is about 200 px, 150 px on phones, with its question
  splat whole inside the page margin. Stacked, the Approach fan comes in from
  the right edge halfway down the heading rather than trailing beneath it, and
  the booking banner keeps
  its splat at the right in a band of about 124 px, without an editorial rule,
  its two-line `Book a Lesson` or `Your Lessons` set close as one handwritten
  block; on a phone turned sideways it keeps the wide screens' one line in a
  band of about 60 px, so the booking's choices start on the first screen (13
  October 2026);
- the three Lessons cards each have their own squiggle outline, and their own
  splat comes in large from the card's top-right corner, cropped by its edge;
  once landed it moves only to turn a little while its card is pointed at. The
  trial card is lavender. Their rows align across
  the cards: name, the price with its length as a small tag beside it (`60 mins`),
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
- the FAQ's question splat sits whole in the middle of the banner's height.
  On a stacked FAQ the last question's rule closes the list, with no second
  full-width rule beneath it. Opening a question is one motion: the answer grows and fades in while the
  plus makes a half turn into a minus; where a browser cannot animate to the
  answer's height it simply appears;
- the phone menu gives each of the four destinations its mark and a short note
  of what the page is for, then a small blue card with `Book a lesson` and
  `Message on WhatsApp`; a large splat is cropped into the foot of the screen
  so the menu never reads as an empty page. Links are named by destination,
  with the note as their description;
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
  with navy, two lilacs and a small coral accent. Inês rejected the previous
  hand-like silhouette on 13 September 2026;
- a chosen lesson's row wears a transparent SVG mark: the generated
  at-your-pace WebP, whose white ground needed a multiply blend, showed as a
  white square once the summary column became sticky, so it was retired on
  13 October 2026;
- the wordmark and paper texture support the shared site shell.

Do not keep contact sheets, rejected generations, alternate raster exports,
mockups, or unused candidates under `public/`.

## Teacher schedule — 7 September 2026

For a signed-in teacher, every booking entry point opens `/schedule/`, including
signing in during the student booking flow. Inês has one teacher workspace;
student accounts and signed-out visitors keep the booking experience.

Inês needs to see her week, make time for students, and protect her days off.
The timetable is the primary surface, in the existing cream, blue and lilac
palette. Keep expressive type in the page/section headings and clear Montserrat
type in dates, times and lesson details. Use colour to distinguish booked lessons,
usual lesson starts and days off; avoid a wall of administration forms.

- Open on the current Porto week with booked lessons placed at their actual
  times. One calendar holds everything: clicking or dragging a time on a date
  takes it off for that date only, and a `Day off` switch above each date
  takes the whole day. Time off is hatched, labelled with its times, and saves
  as she clicks; the line under the calendar says what changed or what failed.
  Weekly blocks such as lunch are shown but not toggled per date. Keyboard and
  touch input must work without dragging.
- A sliding tab bar with a thin dark-blue border groups `Students`, `Timetable`, `Time off`,
  `Receipts`, `Expressions` and `Profile`. Open on `Timetable`;
  keep the week pager beside its month-and-year heading. The phone bar holds all six
  tabs in two balanced rows that fill the available width, without scrolling. Dates
  are centred evenly across the timetable header; omit the Porto gutter label.
  Arrow keys, Home and End move between
  tabs. Unsaved hours and selected dates survive tab changes. Timetable
  keeps an unsaved dot while weekly hours have a draft; Students shows a coral count of students and notices needing attention,
  absent at zero. Profile holds her sign-in email, password link, Google Meet
  connection and Sign out, keeping account controls away from daily work.
- One pager turns the Timetable's week and the Time off and Receipts months
  (14 October 2026, Dan: "there feels inconsistencies here"): two solid blue
  arrows that never move, and `This week` / `This month` as a compact lilac
  site button, matching `Edit weekly hours`, to their left only while she is
  away from the current one, because the heading already names where she is.
  Its place is held while it is out of sight, so the arrows, the heading and
  the grid beneath never shift between states, and a narrow screen lays
  heading and pager out the same either way.
  Using it returns to the current period and puts focus on the heading, since
  the button has just gone. It is never shown, or dead, on the current period.
- Keep help short (13 October 2026, Dan: "remove all the redundant text"). The
  active tab supplies the page name; avoid repeating it under an eyebrow, and
  say a thing once. Any helpful list uses the confirm step's splat dabs
  (`booking-payment-facts`). Her tool cards (the Time off month and its
  card, Google Meet, Students, Receipts) are the booking cards' lilac sheet,
  with what she presses raised in cream inside them, as the student side's
  are (13 October 2026, Dan); the week's timetable keeps its own paper. They
  use the site's buttons: coral for the main action, outline for the other, a
  small outline or lilac button for a rare one (27 October 2026). Weekly hours is headed `Your weekly hours` with two dabs:
  tap or drag to mark when a lesson can start, and that it repeats every week.
- `Edit weekly hours` in the Timetable opens the repeating weekly pattern in
  the same calendar. `View lessons` returns to the chosen week and day without
  losing unsaved hours. It does not save them; only `Save weekly hours` does.
  The edit control also marks a waiting draft. Clicking or
  dragging marks lesson start times. Preserve exact existing first/last-start
  values and provide an exact-time editor. The last start is not a finishing
  time. Weekly edits remain a draft until `Save weekly hours`, and booking
  activity must never silently discard that draft.
  If changed hours cross an existing lesson, say once that it is outside the new
  hours and stays booked, then show each as a booked-lesson card. Check booked
  lessons before allowing a save.
  Half-hour cells include both quarter-hour starts when the booking interval
  is 15 minutes. A partly available cell names its actual start and shows a
  mixed state; clearing it removes its selected starts, and enabling an empty
  cell enables both. Dragging includes the final cell, and the exact-time
  editor retains control of off-grid windows.
- `Time off` is a month beside one card, with one way to choose: tap days,
  one or several, across months and tabs (13 October 2026, Dan). The card
  starts `Tap the days you want off`; with days chosen it reads the same for
  one as for many (14 October 2026, Dan: "rather than it be different if its
  one or two days"): `1 day chosen` / `3 days chosen` with `Clear`, over a
  removable chip for every chosen day. Beneath the chips, a single day also
  shows what it already holds (`A day off`, `Off 10:00–11:30`); under
  `Already booked`, each lesson on the chosen days is a booked-lesson card with
  its date. Then `Take the day off` / `Take 3 days off` in coral, counting only
  the days not already off,
  `Take some hours off` (one day, because hours belong to one date) in soft
  lilac, and `Make available` only when a
  chosen day is off. Some hours opens a small dialog of one or more breaks in
  Porto time, saved only with `Save hours off`; a failed save keeps the draft.
  `Remove hours off` clears that date's breaks. Making days available removes
  only the whole-day block and keeps their hours off and weekly rules. On a
  phone held upright the card rides at the foot of the screen once a day is
  chosen, its chips in one row that scrolls sideways (the month behind it is
  mostly hidden, so it still names the days without growing taller); held
  sideways, and on a tablet, it sits beside the month (beneath it on the
  smallest), never over it. The upright sticky card has a half-screen maximum
  height and scrolls inside when several booked lessons fill it.
  The month marks whole days off and booked lessons, without repeating weekly
  unavailability or partial blocks from the timetable.
  Time off prevents new bookings; existing lessons stay until she changes them.
- A booked lesson in her way (outside new weekly hours, or on days she is
  taking off) is one small card: the student, the date and time, and `Change`,
  which opens that lesson's own dialog to move or cancel it, keeping her
  draft (13 October 2026, Dan: "it should show the person's lesson card for
  Inês to move if she needs to").
- `Students` combines student setup and ongoing care in one searchable list
  (14 October 2026, Dan). Show each student once. Payments to check lead,
  then recent lesson changes, setup Inês can do, first lessons, students still
  signing in or adding a card, and completed students. Within setup, nearer
  lessons come first. Count students needing her attention once, not each task.
  Meet and unmatched payment notices remain visible above the list; never match
  a payment to a student by name alone.
  Incomplete students have compact, distinct steps: Price, Lessons, Email,
  Welcome, Sign in and Card. Later unfinished steps stay locked until
  the preceding steps are complete; completed steps remain editable. A lock
  gives the missing prerequisite. Lessons are suggested, never required
  (16 October 2026, Inês: some students have none yet and book their own):
  Lessons never locks Email or Welcome, and once the welcome has gone an
  empty Lessons step holds nothing open. Checks mark completion, the next action has an
  outline, and a clock marks waiting on the student. The steps are the controls;
  do not repeat the next action as a top-right button or status beside the name.
  Explain what is outstanding inside the selected step, without vague ownership
  labels such as Yours or Theirs.
  Completed onboarding becomes a normal card: their splat and name, a
  `Weekly` tag in its top right corner when they have a weekly run, and only
  the dabs that need her eye (27 October 2026, Dan). Its controls become Details, Price, Add a lesson
  and Lesson history, and, with an email, `Sign-in link`, whose panel holds
  `Send the link again`. No duplicate To do list or separate student profile popup.
  Student cards sit side by side according to the list's available width,
  with one column on phones. An opened card spans the whole list so details,
  lesson forms and history have room; closing it restores the compact card.
  Keep their ranked reading order across each row. A closed card puts its
  steps or places beneath the name, on a tablet's single column as well, so
  nothing sits out past the last place; only an opened card on a wide list
  shares one band. The steps wrap without horizontal scrolling. Opening a step keeps the
  student's name visible and places one X close control at the top right.
  The editor spans the row, and the selected step's
  heading and short bullet facts share a band with status actions. Details and
  price fields use the full row width, with their save action alongside when
  space allows; fields stack on phones. Hover gently changes the row's border; a strong outline is reserved
  for keyboard focus. Help states the current status and anything still
  needed, rather than explaining controls or repeating their labels.
  Standard prices count as ready. A confirmed past lesson counts for Lessons;
  no upcoming booking does not restart onboarding. Card is omitted when cards
  are unavailable. Saved cards and permission to charge every lesson differ.
  Every student's name opens lesson history in the same row. Its existing
  controls keep details, prices, lessons and welcome editable there. Adding a
  lesson opens the calendar with available Porto start times. In a wide row,
  compact lesson settings sit beside the calendar and its available times;
  they stack on a phone. The lesson calendar opens on today and pages back a
  year for a lesson already had (15 October 2026, Dan). Past days read quieter
  but stay choosable; a past day's times are every quarter hour, as the same
  time blobs, since weekly hours don't bind what has happened. A past lesson
  is purely a record (15 October 2026, Dan): date, time, length, place, add.
  A past time hides How often but keeps Where, Online or In Porto, for her
  records (16 October 2026, Dan); the place is followed by the `Already paid`
  tick and one coral `Add past lesson` (beneath the times on a phone, under
  the settings beside the calendar on a wide row). Nothing is said about
  email, because nothing is sent or charged; her history reads `Recorded`, or
  `Paid by hand` once ticked.
  `Already paid` (16 October 2026, Dan) is one tick, the booking agreement's
  squiggle capsule with a paint dab for its box: pale lavender dab on the
  lilac wash until ticked, then the blue capsule with a coral dab and a cream
  check, as the agreement turns blue once agreed. It sits just above the
  action it goes with: above `Add lesson` for a single lesson with something
  to pay (not a weekly run, which is ticked lesson by lesson, and never a free
  length), and under the lesson's dabs in its dialog wherever nothing has been
  charged by card; there it saves at once, and the dab beside it reads `paid
  to you by hand`. A lesson paid, due or charging by card shows that in its
  dab instead (`€25 · paid by card`), with no tick; a lesson still to be paid
  to her reads `to pay you directly`. The old `Already paid you by hand? Take
  it off their card` link is gone; the tick covers it. Choose a time; there is no manual date
  or time entry. Location, length and weekly repeat remain available. Welcomes are explicit:
  opening a step never sends email. First welcomes use `onlyIfWaiting: true`;
  `Send the link again` deliberately requests a fresh link without that guard.
  The Timetable keeps up to three operational notices under the next lesson,
  with `See all in Students`. Setup tasks live in Students. Notices clear from
  existing reads; there is nothing new to store or dismiss.
- Each date has one compact header cell: weekday and bold date centred together
  on one line (`Mon 7`), today's number in a filled blue lozenge with cream
  type, and a booked dot that does not shift the date. Its Day off switch sits at the
  right, moving to a second short line inside the cell when the column cannot
  fit both. It has a 44px hit area and keeps its full dated accessible name.
  There is no separate Day off row. On phones, the selected date appears only
  in the compact day selector. Its Day off switch sits between the month and
  the arrows, with the full selected date in its accessible name. The time
  grid starts directly below the selector; no repeated date or Porto label.
- Show the full working week on desktop and in a panel wide enough to read it.
  On phones, keep the displayed days in a compact selector
  above a spacious single-day timetable and that day's `Day off` switch, with
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
- Google Meet lives inside `Profile` (14 October 2026, Dan), in one card: the logo and `Connected as …` (or what
  it needs), two dabs (every lesson goes to her Google Calendar with its Meet
  link; move or cancel lessons here, not in Google), then `Open Google
  Calendar` with a small `Reconnect Google Meet` button, or a coral connect
  when it needs her, and `Share your calendar` folded beneath. When the connection needs her, `Needs you` on her Timetable says so.
  Returning from Google opens Profile with the connection result. The same
  tab lets her request a confirmed sign-in email change or an emailed password
  reset, using the existing account flows. `Sign out` is a small button at the
  top right of Your profile, beside her name (27 October 2026, Dan), and
  preserves the unsaved-hours warning. Account and Meet cards share a row
  where they fit and stack on a phone.
- Every booked lesson shows its time, student and explicit `Online` or `In Porto`
  label in both layouts, including 60-minute blocks. Keep the location icons and
  coral marker for Porto lessons.
- A student's row is their profile throughout setup and ongoing use
  (14 October 2026, Dan). Opening the name shows lesson history in that row.
  Completed students have Details, Price, Add a lesson and Lesson history
  controls in place of the onboarding journey. One editor opens at a time;
  the single X closes it and returns focus to the row control. Opening a row
  changes nothing and sends nothing.
  - Names wrap between words. Give the name enough room before wrapping the
    controls below it; never split an ordinary name such as Bingham midway.
    Students without a chosen mark receive a stable default splat from their
    account ID, shared by the row and lesson chooser. Keep chosen marks.
  - Opening and closing gently changes the sheet's height. Its contents fade
    into place, and scrolling keeps the student's name visible. Reduced-motion
    users get the same result without animation.
  - Details contains full name, email, phone and NIF, with one Save details
    action. A student who has signed in changes their own email. A missing
    lesson never locks the email field (16 October 2026, Inês). Price uses the same editable rate form as onboarding.
  - Add a lesson opens the calendar in the row. Length, location, weekly repeat
    and available times use the full row width as described above. A successful
    addition closes the form and leaves a short confirmation in that row.
    No email is needed to create lessons. Their welcome controls when lesson
    emails begin, with existing quiet-booking copy and safeguards preserved.
  - The Students toolbar stays on one row: Find a student on the left and
    Add a student on the right. A completed student's closed card has a
    stretched name-button hit area; its section controls keep their own actions.
  - Add a student opens a short creation dialog with name, optional email,
    phone, NIF, prices and splat. Nothing is emailed. Next: their lessons closes
    the dialog and opens that student's lesson form in the Students list; the
    outline `No lessons yet` beside it opens their Welcome step instead (their
    Email step when none was given), where she still presses `Send welcome
    email` herself. A dialog opened from a timetable time offers only the lesson.
  - A free timetable time opens a student chooser. A past time offers only
    `Add a lesson here`, never time off. Choosing or creating the
    student closes the chooser, switches to Students and opens their lesson
    form with the same date and time. There is no second student profile dialog.
  - Sent from the profile or from the card, `Send welcome email` is one email
    for everyone, in the site's email design: their lessons and prices, and the
    way in. It shows for someone she still needs to bring in, and only once
    they have an address. After the two `Your price` dabs (for each length she
    has priced), each lesson on its own is one dab: `Lesson · Online` (or
    `Trial lesson`, `In Porto`) over its date and time on the student's own
    clock, each time naming it as every email to them does (`Tuesday 20 October
    2026, 17:00 · Porto time`), and its length and the price it will be charged
    or owed beneath (`60 minutes · €22`, or `· €22 paid` once paid). A weekly
    run is one dab, never a row of dates: `Weekly · Online` over `Every Tuesday,
    17:00 · Porto time`, `From 20 October 2026 until 8 December 2026` (or `…,
    until you stop it` while it is active), any week between with no lesson
    (`No lesson on 3 November`, so a skipped or cancelled week is never read as
    a lesson) and `60 minutes · €22 a lesson`. A lesson moved, lengthened or put
    elsewhere reads as the lesson it now is. Past twelve lines an `And more` dab
    says how many lessons are left to the website. Its subject identifies the
    lessons with Inês; card setup is explained in the body. The introduction
    names her website and the footer explains how to open it directly or reply
    to Inês. With no lesson to come (16 October 2026, Inês) it is an
    invitation instead: `Book your next lesson with Inês`, the price dabs, no
    lesson list, and steps ending `Choose a day and time for your next
    lesson.` behind `Choose a time` (`See your lessons` when they have lessons).
    A student free at every length is told there is no card to add and nothing
    to pay. It is often the first email a student has from the site, so it
    says who sent it and why, and keeps passwords and cards out of its subject,
    preheader and button: students found the earlier `Sign in and add card`
    welcome in spam (27 October 2026). The Welcome and Sign-in panels say in their dabs
    which of these the email will be before she sends it.
  - Dormant (22 October 2026, Dan) is hers to set: `Mark as dormant` is a
    small lilac button beside the contact details in a student's profile,
    offered only with no lesson to come, and `Mark as active` returns them.
    Marking sends nothing. Dormant students rest in a `Dormant · n` section
    beneath the list, by name, as ordinary rows labelled `Dormant` with no
    setup steps, and a `Come-back email sent 22 Oct` dab once she has emailed
    them; a new lesson of theirs brings them back on its own. Each has its
    own email (Dan: "for each individual student but there be the default
    email already written for each"): `Come-back email` takes the place of
    `Sign-in link` among their controls, and its panel, headed `Come-back
    email to Marta` with two dabs (it ends with a button to sign in and book;
    when it was last sent), holds Subject and Message prefilled with `Olá
    Marta,` above her default, an outline `Start again` once she edits, and
    coral `Send to Marta`. The lilac `Default come-back email` beside the
    section's heading opens one sheet for the words every panel starts from,
    with outline `Cancel` and coral `Save default`. The email is the site's
    design with her words as plain text under `Book your next lesson`.
- `Receipts`, a tab of its own beside `Students` (13 October 2026, Dan: "make
  her automation as easy as possible"), shows a month at a time with the
  Time off month's pager (the one pager above): two dabs for what there is to
  issue (`3 receipts to issue · €50`) and what is still to be paid, a lilac
  `Download CSV`, then
  one plain table row per amount (lesson, student, NIF or `Consumidor final`,
  what it is for, amount, and a pill: `Paid by card`, `Paid by hand`,
  `Payment due`, `Being charged`, `Refunded`). On a phone, and up to 720 px,
  each row is a small cream card, two across where they fit, its NIF and what
  it is for sharing a line. Rows carry their id and figures as data attributes, so her
  automation can read the table, the CSV or the Worker's JSON alike. Up to a
  small tablet, held either way, the teacher tools sit in two rows, so no tab
  hides past the edge; wider, they share one row. Sign out is inside Profile.
- A student's inline Lesson history shows
  upcoming lessons first, then past and cancelled, one card each with
  the date and time sharing a line where they fit (the year only when it isn't
  this one), a pill
  only for what breaks the pattern (`Cancelled by you`, `No-show`, `Happening
  now`), quiet facts (place, length, payment, `Added by you`, moves), and her
  cancellation message or the student's note set off with a lilac edge.
  Each section uses a responsive grid of lesson cards: several across where
  there is room, one column on phones. `Homework` sits at the top right beside
  the date, with compact facts beneath, instead of taking another row at the
  bottom. The date and time can wrap within the header; on very narrow cards
  the button can wrap too, retaining a 44px target. Opening homework expands
  that lesson across the full row; closing it returns the card to the grid.
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
  the lesson, not the student (13 October 2026, Dan): who it is with and when,
  `Join Google Meet` with Meet's own mark, then dabs for its place and length
  side by side, its price and how it is paid (`€25 · paid to you by hand`),
  any moves and, until their welcome, `Not emailed yet`. The student's
  address and NIF live in Students, and receipts in their own tab (Dan: her
  automation can be reworked around it). Their note is labelled `Their note`,
  as in history.
  Closing without a change returns keyboard focus to its opener. Completing
  an action returns focus to the stable week heading while the timetable
  reloads, with a single blue outline; it never steals a later focus choice.
- Her buttons are the site's buttons: the same fill, weight, spacing and lift,
  a little denser, and `Join Google Meet` in a lesson is a solid blue button,
  never an outline. Use space and contrast well (13 October 2026, Dan): two
  actions share a row rather than stacking full width (a student card's blue
  `Add lesson` beside its coral `Send welcome email`, a lesson's `Move` beside
  `Cancel`), and coral marks the one thing still to do. A quieter constructive
  choice is filled in the palette's soft lilac (`Take some hours off`, `Make
  available`, `Add a new student`, `Open Google Calendar`, a booked lesson's
  `Change`; 13 October 2026, Dan: "just the subtle lilac"); a way out
  (`Cancel`, `Back`, `Done`) stays an outline. On a phone every tab
  is in view at once, as a grid. Booked is the calendar's navy everywhere. A lesson's details read as dabs (their address, NIF, how
  it is paid, whether they have been emailed) rather than sentences.

### Expressions in her portal — 13 October 2026

The `Expressions` tab immediately follows `Receipts`. Only a teacher can
manage its collection. Expressions are hers alone for now (14 October 2026,
Dan: "publish them but not for students just for ines currently"): students
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
  to students, the help reads `Only you can see expressions for now. Paint one
  above to see what your students will get.`, publishing confirms `Published.
  Your students will see it once expressions open to them.`, and the private
  preview says `Students don’t see expressions yet.` Once they are open, these
  return to `Your students can pick published expressions from Your lessons.`,
  `Published. Your students can now pick this expression.` and `Students can
  only pick published expressions.` `Add both meanings and one or two examples
  before publishing.` stays either way.
- The coral `Add an expression` leads. Search matches accents flexibly across
  expressions, meanings, examples and notes. The theme filter includes entries
  with no theme. Do not display the original collection's count.
- Each list card groups its small `Draft` or `Published` pill with the ↑↓
  arrows in its head. Facts keep their reading order and painted label dabs.
  At 27rem of inner card width the head sits level with the title at the top
  right, and each label sits beside its value; narrower cards and the
  preview keep labels above values: `Tradução à letra` (the literal
  translation, when there is one; restored 30 October 2026 at Inês's request),
  `Quer dizer` (the Portuguese meaning,
  a step larger than the rest) and `Em inglês`; then
  `Exemplo`/`Exemplos`, where the expression's own words are marked with a
  soft wash of the paint, taking in a verb the example has conjugated. Notes/origin and reference links
  open in a quiet disclosure. Optional themes use a lilac pill fill.
- Reuse blue for Edit, soft lilac for Preview and publication changes, coral
  for saving, and outline for Cancel/Done. Up/down buttons reorder the whole
  collection; clear filters first. Every phone action is at least 44px.
- The editor and preview use the shared flat lilac dialog, cream fields,
  the same close button, backdrop dismissal, scroll lock and focus return.
  Failed writes retain the draft. Discarding edits and deleting an expression
  each require an explicit confirmation. Stale versions never overwrite an edit.
- `Preview as students see it` renders the same reading-card component, without
  teacher actions or publication pills. The surrounding private-preview note
  is for Inês only. Previewing a draft does not publish it.
- A 26rem minimum card grid uses at most four columns, with cards aligned at
  their tops and hugging their contents. Phones use one column. Edit, Preview
  and Publish share one row, except at 320px where the last action may fill
  its own row. The shared preview and try-out reading stay unchanged. All eight
  tabs remain reachable without horizontal page overflow, including at 320px.
  Long expressions, notes and examples wrap within the card. Fields and actions
  also fit a 320px dialog.
- All imported entries are drafts. The reference bundle has no usage examples
  or themes; leave those blank instead of inventing them. Publishing needs both
  meanings and at least one example. Preserve Inês's punctuation and accents.
- The original strip photographs are reference material, with text too small
  for a reading card. The packaging photos and business card do not illustrate
  individual meanings. None is copied into `public/visuals/` for this integration.

The student card sits on the same lilac sheet below the lessons calendar,
once expressions are open to students and Inês has published one. Its
centre is `Pinta e descobre` (13 October 2026, at Dan's choice; it replaced a
spinning wheel he rejected): Inês has written the expression in wax on a cream
sheet, and a gouache brush sweeps across it line by line so the phrase shows
through the paint in Beth Ellen, in reading order. The painted phrase is the
reading's title; the facts follow it.

- No visible heading and no helper text (Dan: "do we even need the top
  stuff"). The section keeps `Uma expressão para ti` as a visually hidden
  heading, so it is still named. Every visit starts with a blank cream canvas
  and `Paint it`: no phrase hints, paint marks, meanings or fact labels are
  visible before the press (27 October 2026, Dan). A returning student
  repaints their saved expression on that first press without spending
  another pick; `Paint another` asks for a new one. Once painted, the card is
  the whole section, and it ends in a footer separated by a quiet rule:
  the reading's themes, then `Notas e/ou origem` (when Inês has written notes or
  a source) and the compact `Paint another` at the row's end. The notes'
  toggle reads like the facts' labels, its chevron in the dabs' column when it
  leads the row. On desktop the footer spans both reading columns; notes
  open below the whole row with a comfortable line length, so opening them
  never moves the action row or leaves an empty half beside the notes. On a
  narrow column the row starts at the dabs' column and runs to
  the card's edge, so two short themes, or the notes' toggle, share it with
  the button; the toggle and the button drop beneath the themes together only
  for a longer set of themes, and only on the narrowest phones (320px) does the
  button take a line of its own. The button keeps the width of its longest
  label, so `Painting…` and `Try again` never reflow the row; it stays a 48px
  target and never becomes a full-width slab.
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
- Room around the words (Dan: "give it space so the words fit comfortably
  inside so it's not ambiguous"): every letter sits in solid paint. The band is
  sized round the phrase's own letters, with generous paint above the first
  line's tallest letter and below the last line's deepest, a clear inset from
  the blunt start, and the dry brush beginning only after the longest line ends
  and a margin of paint after it. The strokes of a longer phrase overlap, so no
  paper shows between its lines, and no streak of paper crosses a word. A
  phrase of a few words stays on one line if type up to 15% smaller holds it.
  Nothing is ever cut: a phrase too long for every size takes as many lines as
  it needs at the smallest, and the sheet grows to hold them.
- Composition: on a phone the sheet fills the cream card and the reading opens
  beneath it. From a landscape phone up, the painting with its example
  straight beneath it sits beside the meanings. Both columns begin at the
  top, and the footer follows the taller of them. Notes and the next-paint
  action use that shared footer rather than extending only the right column
  (27 October 2026, Dan: the layout should feel cleaner). Keep two reading
  columns on larger screens as well. At rest the blank
  sheet reserves room for the first strokes, with the button at the card's
  foot. The paint lands where it stays and never slides on the sheet. The
  painted sheet closes round its phrase as the reading opens, only its foot
  rising, so a one-line phrase never sits in a
  tall empty sheet. Nothing above the section moves, and the card grows and
  shrinks smoothly below.
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
  colours, its words dry to wax lines and its themes and notes fade, while
  the button reads `Painting…` and the focus waits on the section. The card
  never shortens while it paints, and grows
  smoothly only when a longer phrase needs the room, so nothing below jumps
  under the student.
- Only the button paints: no swipe or drag on the sheet, and no loose chapéu at
  the card's corner.
- The painting is decorative: the pick is the Worker's and the brush paints only
  what it saved, so nothing done mid-stroke can change or lose a pick. Assistive
  technology hears the result in words and the reading takes the focus.
  Reduced-motion users see the finished painting and reading at once, and the
  card keeps the colours it shows until the new reading replaces it. Where the
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

## Wording and confirmation — 13 September 2026

Use `Portuguese Lessons` on the home page. Booking's banner reads `Book a
Lesson` to a visitor without an account and `Your Lessons` to a student, or to
anyone arriving by a lesson's own link or a link to Your lessons (12 October
2026, at Dan's request). The banner names the page, so the booking card
carries no second `Book a lesson` title of its own (its title is kept for
screen readers): a first-time visitor's card opens on the lesson's choices,
and a returning one's on `Already booked? Sign in`. Signing in or making an
account halfway through a booking keeps `Book a Lesson` until Your lessons
opens, so the banner never changes under the booking being finished (13
October 2026).
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
bar above already says they repeat (9 October 2026, at Dan's request). The
agreement fills the same width as the final action, with centred text and its
terms link retaining a separate action. Keep prices visible
with the chosen lessons. The short payment summary explains payment after each
lesson and €5 rules, with the full terms available by link.

Use different treatments for neighbouring booking controls instead of two coral
fills. Selected agreement uses blue beside the coral booking action. Weekly
lesson management pairs blue `Move weekly time`, an outline `Stop repeating`, and
coral `Cancel all booked lessons`; profile editing pairs coral `Save name` with
blue `Send confirmation link`. Keep the existing labels and state indicators so
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
When a longer lesson makes selected times overlap or removes the required gap,
keep the earliest compatible times and explain which later times came off.
Apply that check when retry completes while adding or changing a lesson, and
when Back restores the original choice. Disable booking edits during submit
and card checkout so the choices beside the card form describe its held times.

## Motion direction

Motion is calm, quick and physical, and never makes anyone wait (7 October
2026, at Dan's request for tasteful animation on the little splats, beautiful
transitions between pages and a premium feel throughout; on 8 October the
buttons' shifting cut, the Lessons cards' turning marks, the drawn rules and
the booking celebration followed, kept in style and tasteful). What lands or
travels moves on a soft spring that gives a few per cent and settles; controls
answer on a firm one; everything else decelerates long.

Pages turn into one another. The header stays exactly where it is, and the
nav's coral moves to the new destination's name; the nav draws no line beneath
it (12 October 2026, at Dan's request). The page being left
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
uncovered as the column opens rather than squeezed (9 October 2026, at Dan's
request for smoother, less jolty selections). Nothing pops in late: a form or times
still on their way ease in when they arrive, and until the calendar first
arrives its room is held, so the footer never shows and then drops away (9
October 2026, at Dan's request for smooth transitions rather than jolty ones).
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
land one after another as it opens (11 October 2026, at Dan's request that
these moments feel smooth rather than abrupt).
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
keeps its own blue (the coral writing on hover was removed at Dan's request on
9 October 2026). Its two circumflexes over ê (the chapéu, the hat) dance (9
October 2026, at Dan's request; before, each tipped once in nine or thirteen
seconds): every four seconds they hop in turn, Português, Inês, Português,
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
pages (the Approach fan, the Lessons hero splat and the booking banner's
corner splat) stay still: they are the paper the marks land on. Text, buttons and the
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

Booking is one page. A visitor lands on the calendar, ready to book, beneath a
choices bar that is already filled in: `Trial`, `Single` or `Weekly` (the trial
only for a first-time visitor, and then the default), Online or In Porto, the
length with its price (`60 mins · €25`, `90 mins · €35`; a trial's fixed
`60 mins · €20` is the same control with its one option chosen), and for weekly
lessons 4, 6 or 8 weeks or `Ongoing`. Each choice changes in place without moving the page, and the free
days follow it; there is no fork, setup screen or `Continue` step. A returning
student starts from a single lesson at their usual location. A student who is
signed in, or on a browser where a student with a booked lesson has signed in
before, is not offered the trial (Inês signing in, or an account made and never
booked, does not count); that is settled as booking opens, so creating an account at the
confirmation never takes away the trial being booked. The bar's head offers
`Your lessons` to a signed-in student and a coral `Already booked? Sign in`
(`Sign in` alone on a phone) to a returning browser, leading the choices' own
row wherever both fit. A first-time visitor sees
no sign-in there, since booking asks for an account only at the confirmation;
a quiet `Already booked? Sign in` line beneath the calendar still serves a
student on a new browser. Signing in to view lessons shows the `Your account`
card on its own, with no `Back` above it: the header's `Booking` starts
afresh (27 October 2026, Dan). On wide screens the
groups carry small `Lesson`, `Where`, `Length` and `Repeat` labels; on a phone,
upright or sideways, the options name themselves and the labels remain for
assistive technology.
Each group starts as wide as its options need and a row shares out what is
left, so a wide screen fills the line and a narrower one moves a group down;
option labels never wrap. Weekly's four groups pair up, the lesson with its
place and the length with its weeks, wherever three would fit a row and leave
the weeks alone beneath them (13 October 2026). Below 361 px the four repeat options sit two by
two.

Choosing a free day keeps the four weeks in view on wide screens, with the day
highlighted and its times beside it under the date, with no eyebrow above it
to say what the times already say. On a phone the times take the calendar's
place, headed by a short date (`Thu 24 Sept 2026`) with an outline `Change`
beside it on the same row, which returns to the calendar (named `Change date`
for assistive technology). Before a day is chosen there are no times to show,
so the times panel stays out of sight at every width and the calendar takes the
whole row, as Your lessons does; a chosen day brings its times in beside it.
`Soonest times` went on 9 October 2026, when Dan found it unnecessary. A window
with nothing free says so beneath the calendar.

Students can collect several single-lesson dates and confirm them together.
Each chosen lesson is its own row: its own splat, the date and time, and one
`Change`; the clock is named once, on the first row (`Porto time`, `Los
Angeles time`). Beneath the rows a dashed card of the same shape,
in the choices' blue with a plus mark (coral is kept for clashes), offers `Add
another lesson`, or `Add a second weekly time` for weekly lessons; it is absent for a trial and once the limit is reached, and it
needs no explanatory sentence. While a lesson is added or changed the lesson
itself is settled, so the choices bar gives way to a selection bar: its heading
(`Add another lesson`, `Add a second weekly time` or `Change a lesson`), the
lessons chosen so far and an outline `Back` that returns to the unchanged
selection; `Remove this lesson` sits there while one is being changed. No slot
is held until the final confirmation. Keep 44px actions on phones. A trial
remains one first lesson. All selected lessons use the chosen duration and
location.

Weekly bookings start with one date and time and may add a second weekly time.
Both starting dates fall in the same Monday–Sunday week in Porto, so the second
calendar shows that week only, under its month and without arrows, and the
rule is never spelled out. The chosen times repeat for the common 4/6/8-week
or ongoing period. Show both starting dates and times together, check later
occurrences for both, and name any unavailable lesson times precisely rather
than suggesting the entire week is lost. One confirmation and one card setup
cover the selection. Every lesson keeps its own charge and change rules; the two
weekly times remain independently manageable from the lessons calendar. A
conflict during confirmation retains the student's whole selection for
correction and never silently books only part.

Preserve these desktop and mobile states:

- on desktop the blue introduction is a compact horizontal banner above the
  cream booking workspace, not a full-height side rail. It holds the page title
  alone, returning the full viewport width to the task, while the decorative
  availability splat is deliberately large and crops across the banner's right
  edge, halfway down, rather than floating as a small isolated icon. It carries
  no reassurances (`View your calendar`, `Change or cancel here` and `Porto
  time` went on 9 October 2026): the page says the first two itself, and times
  are on each student's own clock. The phone layout keeps its existing compact
  title;
- the workspace has no opening fork: anyone signed out lands on the booking
  calendar beneath the choices bar. Availability always follows the chosen
  lesson, because a 90-minute lesson has fewer valid start times than a
  60-minute one. Once a starting time is chosen, the journey goes to the
  confirmation while later weeks are checked. The expected all-clear stays
  silent; only clashing weeks appear before the student can book;
- a returning signed-in student opens directly on their lessons. Their
  lessons are one calendar card, which carries the account as well: there is
  no bar above it and no separate list to keep in step with it. On a wide card
  its header is one row: the account's places at the top left and the coral
  `Book a lesson` at the right; the name and `Sign out` live in Your details
  (10 October 2026, at Dan's request). On a narrower card the student's name leads it as the account's menu, with
  `Book a lesson` at its top right (`Book` on phones, keeping the full name
  for assistive technology); on a phone `Book` always shares the name's row,
  the name cut short first if it must be; the banner above already says Your lessons, so
  the card's own title is for screen readers, as on a wide card.
  On a phone on its side, or any window as short and narrower than 1100px
  (13 October 2026, Dan), the name's menu, the months with their `?`, the
  arrows and `Book` share one header row, so the four weeks start a row
  higher; a tall screen keeps two.
  On a wide card each booked day spells its lessons out (9 October 2026, at
  Dan's request): the time each runs from and until (`09:00–10:00`), after a
  globe for online or a little person for in Porto, both named in the key. The
  next lesson's day is filled in its kind's colour, coral or, for a weekly
  lesson, lilac ink, so no row stretches across the card to say it. Hovering
  or focusing a booked day still shows its lessons in full in a small dark tip
  pointing at the day: `Next lesson` or `Happening now` on the next one, then
  when (the clock named, as a lone time names it), how long, where and
  `Weekly`. Clicking opens the lesson, with its Meet link, `Change` and
  `Cancel`. On a phone a day shows the mark over the start time, and the next
  lesson, or `Happening now`, keeps its row beneath the header, on the card's
  own colour (on a phone its words on the card's left edge with the name and
  the weeks, its mark at the right as its seal, and `Join Google Meet` beneath
  as a cream button, 13 October 2026, at Dan's request), as it does on
  any card when the next lesson lies beyond the first four weeks: its date and
  time in one plain line, then its length, location, `Weekly` when it repeats
  and its Meet link, opening that lesson directly. With nothing booked, `Nothing booked yet.` says so
  above the same calendar; `Book a lesson` says the rest. Free times do not appear in this lesson overview.
  A signed-out visitor can browse lesson types, dates, and times first; sign-in
  is requested only when they open their lessons or confirm a booking.
  Completed decisions collapse into a compact row, so account tools, the
  calendar, and confirmation never compete at once;
- the signed-in identity appears once, with the account's menu (9 October
  2026, at Dan's request to fold the separate account bar into the calendar
  card, then to show the menu in the header's empty middle). Its places are
  `Your lessons`, `Past lessons` and `Edit details` (`Done editing` while
  editing), then, where the menu folds, `Sign out`, in that order. On a wide
  card (1100 px of booking column and up) they sit open at the top left of
  the header as one sliding control of the booking bar's kind, its blue thumb
  on the card that is showing, and the card's title is kept for screen
  readers because the places already name it. The name is not repeated there:
  it, the student's splat and `Sign out` live in Your details (10 October
  2026, at Dan's request). On a narrower card the name is the menu, and
  plainly a button (9 October 2026, at Dan's request): a cream pill holding
  the student's splat, or their initial in a blue circle until they choose
  one, their name and a chevron, never the site menu's three lines, so a
  phone shows one `☰` for the site and one clearly different account menu,
  and it opens over the card. Booking is not repeated there: its
  one coral action belongs to the card. `Your lessons` may show the useful
  upcoming count; `Past lessons` deliberately has no count competing for
  attention. A running lesson stays upcoming, with `Happening now` and its call,
  until its end. History and counts advance with the current clock without a
  reload, on both student and teacher screens. The menu lives in the account
  cards, behind an open lesson too.
  While booking, the account heads the booking bar as the name's menu at
  every width, never the open places: booking is not one of the account's
  places, and a slider with nothing marked read as a place missing (11
  October 2026, at Dan's request). That menu's `Your lessons` is the way
  back. An empty history says so instead of removing the shortcut. The lessons
  calendar reaches every future commitment. Account destinations open
  consistently: selecting the current view again keeps it open. Past lessons
  and Your details each take the lessons card's place, in the same hand and
  headed the same way: on a wide card the same row, with the places exactly
  where they were and the thumb on the card showing; on a narrower one the
  title centred at the top (10 October 2026, at Dan's request) and the name's
  menu beneath it, which holds the way back to Your lessons. History has two
  readable columns of records wherever the longest date and time stay on one
  line (from an 840px card: a tablet on its side, the largest phones on
  theirs, and desktop) and one on mobile; order records
  by when each lesson ended or was cancelled, newest first, so cancelled
  future dates do not bury recently completed lessons.
  Your details reads as a short list of what is saved rather than a form (10
  October 2026, at Dan's request): the student's splat, name, email and NIF,
  each with its value and a quiet outline `Change` beside it, or `Add NIF`
  where there is none. Changing one opens its field in place with its action
  (`Save name`, `Send confirmation link`, `Save NIF`) and `Cancel`, and closes
  once saved; only an open email carries a short note, the NIF's purpose being
  in its label. A `Card` row follows the email where the site takes cards
  (12 October 2026, Dan): `Saved`, `Saved for lessons you book` or `Not
  added`, with `Change` or `Add card`; opening it shows the confirm step's
  dabbed terms in place (the two €5 fees among them) and `Agree & add
  card`, which goes to Stripe's page. While a lesson Inês added is still
  paid to her by hand, Your lessons carries one quiet sheet card above the
  calendar: a card icon in a lilac disc, `Pay by card`, `Add your card once
  and you’re set.` and `Add card`, nothing more; back from Stripe it becomes
  `Card saved. You’re all set.` Its words are as short and
  plain as they can be (12 October 2026, Dan: "the language here can be
  even more simple"), and so are the emails that bring students in.
  That success waits for verified current card permission; a return URL alone
  cannot hide `Add card`, and removing the card clears the success state.
  A sign-in link from an email opens on `Welcome`, `Sign in to see your
  lessons. No password needed.` and one coral `Sign in`, spent only when
  pressed, since mail scanners open links on their own; a spent link says so
  there and offers `Email me a new link`. The card terms add `Your upcoming
  lessons with Inês are charged to it, each after it ends` and `Already paid
  Inês for some? Tell her and she’ll take them off`; an open Card row also
  offers `Remove card`. A payment approval link for one lesson Inês added
  opens the same card as `Confirm your card payments` (27 October 2026,
  Dan: "simple and beautiful", in the site's own styling and words): the
  lesson as the booking step's cream time tile (its splat, day and times,
  `Porto time`, the price on the right), the confirm step's three dabs (when
  that lesson is charged, future lessons charged automatically, the €5 fee),
  then the agreement capsule with `Terms & privacy` inside it and
  `Authorise payments` beside `Not now`. A wide card sets the lesson and dabs
  on the left and the agreement on the right, level in the middle; a phone
  reads them top to bottom. In Inês's lesson dialog a lesson a card now pays for
  offers the `Already paid` tick (below). The sign-in panel's small outline buttons read `Email a link` and
  `Forgot password`, side by side down to a 360 px phone (27 October 2026, Dan); asking for a link is its own
  small form, like a forgotten password, without the tabs or Google.
  Text fields are 44 px tall, the usual touch height. The change dialog is
  the same flat lilac as every dialog, so its sliders' tracks and free days
  are raised cream there exactly as on the booking sheet. The splat
  opens as a row of the site's own marks, all but the FAQ's question, with the
  initial first; choosing one saves it, and it shows wherever the name's menu
  does. Saved names and splats update every account menu immediately.
  `Sign out` waits at the card's top right, the size of every `Change`. `Done
  editing` returns to Your lessons. Its
  last item is the small `Have a code from Inês?` disclosure, one field with a blue `Add code`
  beside it that stays open for the second length's code, with any saved weekly
  rate listed above it. History and profile
  editing never leave a future calendar floating beside or underneath them.
  Future calendar dates keep their plain date tiles, with a hover/focus highlight
  and no separate `Book` label. A free date opens booking on that day at once,
  with its times and no question first. A date with one lesson opens that
  lesson directly; a date with several opens a list titled by that date, listing each
  lesson's time, length, location and `Weekly` when it repeats, with `Book
  another lesson` and `Not now`. Booking checks times for the chosen length; an
  unchecked date does not imply availability, and a date with no free times says
  so with the calendar a tap away. Dismissing the list, or closing a lesson,
  restores focus to the date.
  Weekly lessons are lilac on the calendar and one-off lessons coral; a day
  holding both keeps each time in its own colour, and the key names the two
  kinds only when a weekly lesson exists. A weekly lesson opens with a lavender
  `Weekly lesson` status and `Manage weekly lessons`, which moves, stops or
  cancels the whole run. Stopping a repeat turns every retained date back into an
  ordinary coral lesson; `Your lessons` counts an active repeat once and each
  retained date on its own. The `?` beside the calendar's month says that a
  booked lesson opens its details, change and cancel choices, and that any
  other day starts a booking; its tip floats over the weeks on a dark blue
  surface, pointing at the `?`, without moving anything beneath it. In these already-booked summaries, ordinary lesson product names are
  replaced by their useful compact duration (`60 mins` or `90 mins`), while a
  trial stays named. Booked marks vary by 60/90 minutes and Online/In Porto; a
  repeating schedule has its own fifth mark. Do not reuse the stacked-wave
  emblem for booked lessons.
  Past and cancelled lessons are cards with a consistent anatomy: organic lesson mark,
  clear status pill, date, compact duration and location, then a quiet booking
  reference. They have no hover lift or management affordance because they are
  records rather than actions.
  There is no second `My lessons` navigation destination.
  The workflow choices and calendar share the same left and right edges.
  Profile details sit directly in the Your details card, without a second
  framed card inside it, divided by soft rules. Profile inputs use the same
  single blue focus boundary as the booking notes field;
- after a successful one-off or weekly booking, the confirmation's primary
  `Back to your lessons` opens the lessons calendar so the new booking is immediately
  visible on its day;
- the confirmation itself is one hand-cut card on the booking cards' lilac sheet,
  read top to bottom: `You're booked in.`, the day with its times beneath it,
  where the confirmation went, then the two actions, and a small-print foot
  under a soft rule with the reference and the fee rule as two dabs (`Free to
  change or cancel until 14 hours before`, `€5 after that`). It starts at the
  top of the step like every other, no wider than it needs, centred on a wide
  screen (13 October 2026). The lesson's own mark
  lands in its top corner as its only seal, so there is no separate `Booked`
  badge (8 October 2026). Several lessons are each named once, short
  (`Tue 20 Oct, 10:00`), and a weekly booking reads as its weekly time
  (`Tuesdays at 10:00`, from its first date) with the count beneath; a week or
  time that was already taken is a coral chip under one short line, never a
  box inside a ruled block. With several lessons the second action goes, since
  each opens from the calendar;
- the calendar shows four Monday-to-Sunday weeks at a time, never one long
  scroll. Its header is the one every calendar has: its months on the left
  (`October 2026`, or `October – November 2026` where the weeks cross into the
  next, `Oct – Nov 2026` on a phone), with the clock beside them for a student
  elsewhere, and the `Earlier weeks` and `Later weeks` arrows on the right,
  solid blue with white arrows.
  `Later weeks` carries a small coral count of the booked lessons beyond the
  page, so nothing booked is out of sight without a sign. On a wider card each
  week starts with its month (`OCT`), in ink where a month begins and lilac ink
  where it carries on, and a month that begins part-way through a week marks
  its 1st (`1 NOV`); on a phone, on the lessons card and the booking calendar
  alike, the header names the months and every 1st carries its own, so the
  seven days take the card's whole width (13 October 2026, Dan: "less
  cramped", and the same logic on every screen). There are no caption rows across the
  grid. A booked day's times are sized by the day itself, so they always sit
  inside its splat at any width. The key sits beneath the weeks it explains,
  on a phone in two short columns, the kinds of lesson on the left and the
  places on the right, beside the corner splat. A new
  booking pages through the whole twelve-week booking window; the lessons view
  pages from this week through the same window, or to the last booked lesson
  when that is later. The lessons view has no second context strip or
  selected-day panel. Choosing a free day while booking keeps the four weeks
  beside its times on desktop; on a phone the times replace the calendar, with
  the date's `Change` returning to it. A free day shows the available times
  without redundant “no lesson booked” or lesson-summary copy. A day's times
  come in two fixed halves, chosen with a two-way toggle that reads the same
  every day: from Inês's earliest start to 14:00, and from 14:00 to her latest
  (`09:00–14:00`, `14:00–19:00`), taken from her whole calendar rather than
  that day's gaps, so the labels never shift. On another clock the halves
  divide where 14:00 in Porto falls on the student's clock, in their own
  times, or at noon when Inês's day crosses their midnight. A half with nothing free that day
  says so; the half holding a chosen time, or else the first with times, opens
  first. Never a wall of every quarter hour. When a day mixes start minutes,
  each half is a small timetable without subheadings: one row per hour, one
  column per start minute the day offers (four for quarter hours), so a gap
  reads as a gap and buttons keep an accessible touch target on a phone. When
  every time starts on the same minute (all on the hour), they simply sit side
  by side, three to a row, never one per line (13 October 2026, Dan). The date's
  `Change` returns to the four weeks that held the date. Opening any
  lesson keeps the calendar in place and adds a compact overlay asking
  whether to change or cancel it. `Change` keeps the page dimmed and lifts that
  same calendar and time picker into the overlay; it never dismisses the modal
  or scrolls the student down the underlying page. Where the form sits beside
  the calendar it shows the usual four weeks from the lesson's week; where the
  form stacks beneath it, as on a phone, the lesson's week alone with `Show all`
  on the key's row. The overlay leads with its heading and one short line for
  the lesson as it stands (`Currently Thu 15 Oct, 18:00 · 60 mins`): above the
  calendar on a phone, across the top on a wide screen, with no eyebrow. The
  chosen day reads short above its times (`Fri 16 Oct · Porto time`), and on
  a phone the length and place controls name themselves without legends, as
  in the booking bar. `Keep current time` (`Keep current schedule` for a
  recurrence) is the one way back, with no separate `Back`. The overlay is one surface,
  without framed cards nested inside it. Eligible ordinary lessons can switch
  between the same compact `60 mins` and `90 mins` choices and Online/In Porto
  there, with the current date and time already selected; a paid lesson is never silently
  repriced. Cancellation stays inside the overlay until explicitly confirmed.
  On desktop the calendar key and the pager share one visual centre; on phones
  the key keeps its own line with the pager across the width beneath it.
  The confirmation is the review. The choices bar comes with it, without a
  title of its own, so the kind, place, length and repeat still change in place; a single chosen time is kept
  whenever it is still free for the new lesson, and otherwise the times return
  with a short note saying so. Beneath the bar, each lesson is one row with its
  date, time and `Change` (named `Change date or time` for assistive technology),
  then the add card when another lesson is allowed. For weekly lessons any
  clashing weeks are listed right beneath, as soon as the repeat or length
  changes and whether or not the student has signed in: a coral card shaped
  like the lesson rows, with its own mark, the count as its title, the plain
  consequence that those lessons won't be booked while the rest go ahead, and
  each clashing lesson as a coral chip. Each row's `Change` is a small
  outline button, of a piece with the date's `Change`. On wide screens the bar and
  lessons sit on the left and the account or final details on the right, in the
  calendar step's proportions; phones stack them in that order. Name the lesson's
  clock once with the selected time: the student's own for an online lesson,
  Porto's for one in Porto, and never a second time beside it. The notes and final confirmation action follow, with no second recap
  page or combined `Change details` route. The optional notes textarea uses one
  clear blue focus boundary rather than stacking coral and blue rings.
  The inclusive 84-day API boundary must not add a thirteenth week: a partial
  row beyond the window is not shown;
- calendar month labels come from the date key itself, on the clock the
  calendar shows, so a visitor behind UTC sees the week of 31 August labelled
  `AUG` rather than `JUL`;
- days with two bookings show both booked times on separate lines. Do not use a
  small `2x` count badge beside the date;
- primary coral and secondary outline actions share a 52 px height, Montserrat
  0.7 rem labels, 0.12 em tracking, and the same hand-drawn button radius.
  Tertiary text actions use the same type at 40 px minimum height and align to
  the right wherever the label fits, on mobile as well as desktop. The selected
  compact lesson overlay pairs the booking status with `Change` and `Cancel`;
  it must not replace or reorder the underlying lesson workspace;
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
  choices. The mobile calendar must keep all seven columns and its legend inside
  the card after resize or orientation changes. Opening either the header
  hamburger or footer `Menu` opens the same four main destinations over the
  current viewport. When opened from the header, its handwritten wordmark and
  close control retain the header's exact position and size, including beneath
  the optional portfolio banner. Share the header's layout rules; do not give
  the menu a separately sized or animated logo. Only the destination links drop
  down beneath that stationary row. A footer opener places the same row at the
  viewport top. Do not replace the wordmark with an uppercase text label. Its
  destination links keep the shared Montserrat navigation font.
  It does not scroll the page to the
  header first. Focus stays inside the menu; closing it or pressing Escape
  returns focus to its opener and retains the page position. Navigation and
  resizing to desktop release the scroll lock. Short screens can scroll the
  menu itself to reach every link.

Public `Book a lesson` calls to action explicitly open new booking, including
for returning students. `Book a trial lesson` opens the trial's location choice;
existing students receive their eligible ordinary choices. `Book a 60-minute
lesson` and `Book a 90-minute lesson` open booking with that length already
chosen. Lessons are named by their length everywhere, the Lessons page, emails,
calendar invitations and receipts alike, never "single", which read as "only
one" beside a weekly slot (12 October 2026, Dan); the trial keeps its name. The main `Booking` navigation still opens a returning student's
schedule. In the desktop header it is the one button among the plain links,
in their own dark blue and with no line beneath it, since booking is what the
site is for (11 October 2026, at Dan's request). Pointed at, it answers as
the links do: it turns coral, keeping its shape, rather than reshaping and
lifting like the page's own buttons. The phone menu keeps it a row
like the rest, with its own coral `Book a lesson` below. Old `/my-lessons` and emailed `/booking` links retain their
destination and tokens in `/book/`.

## Booking, simplified — 8 October 2026

At Dan's request to make the places where people read or act simpler and
calmer, without new content:

- one price at the point of payment: each length shows the student's own
  price (`60 mins · €25`), and nothing under `Confirm your lessons` or on the
  card step repeats it; the card step says only `Your time is held while you
  save a card` and `Nothing is charged now`, as dabs (13 October 2026);
- the payment summary is a short list rather than a paragraph: one fact per
  item, read top to bottom in one column at every width (paired, they wrapped
  raggedly in a narrow column; one column since 9 October 2026, at Dan's
  request), each after a little dab of paint cut from the FAQ mark and turned
  and coloured differently from its neighbours. Every fee fact stays, with the
  amount in coral. Paying on the lesson day, `The full rules are in terms &
  privacy` is the last item rather than a link standing alone above the final
  action; with card payment the agreement control is unchanged. The step
  heading leaves room for Beth Ellen's descenders;
- in a narrow booking column a lesson row's date reads short
  (`Fri 16 Oct, 18:00`), as does the next lesson, with the long form kept for
  screen readers. The row's `Change` keeps its 14 px label (see Contrast and
  accessibility);
- the lesson dialog drops the question that repeated its heading and buttons,
  and the rules around the lesson's date. Its pill is `Weekly lesson` only
  while the repeat is running, `Booked` once it stops, and `Cancelled` carries
  the past lessons' ⊗. `Manage weekly lessons` is a compact outline button.
  Cancelling weekly lessons states what happens rather than asking again. A
  decision's pair of actions (`Yes, cancel it` / `Keep lesson` and the like)
  shares a row while both labels fit on one line, and stacks when they don't,
  so no label wraps; every row of buttons in the booking dialogs follows that
  one rule;
- booked times in calendar tiles are big enough to read and to tell the weekly
  colour from the one-off one, and the calendar key shows `Booked lesson` only
  when there is a booked lesson to point to;
- before a day is chosen, `Soonest times` heads the side panel on its own
  (removed 9 October 2026; the panel now waits for a chosen day);
- changing a lesson on a wide screen opens on the usual four weeks beside the
  form, so there is no empty half and no `Show all`; the overlay's heading
  stands alone and `Keep current time` is its one way back, stacked beneath
  the coral action so neither label breaks onto a second line;
- the change overlay says the date once rather than three times: the heading
  and a one-line `Currently …` come first, even on a phone, the day above the
  times reads short, and a phone drops the length and place legends. A day
  filled coral shows every booked time in white.
- cancelling a one-off lesson doesn't say "only this date", which matters only
  where other weeks stay booked; `Manage weekly lessons` keeps its own width on a
  phone; and just past the stacked layout the chosen day's times take close
  to half the row, so a quarter-hour timetable never squeezes;
- `Terms & privacy`, a day's list of lessons, the change overlay and Inês's
  lesson dialogs are one family with the lesson dialog: the same hand-cut
  panel with the same edge, shadow and inset, its round close button in the
  same top-right corner, over the same lightly dimmed page, never a darker
  scrim for one task than another (13 October 2026). Every
  dialog, Inês's included, is a booking card lifted off the page: the same
  lilac sheet over paper, with no gradient or warm corner of its own (13
  October 2026, Dan: "make it consistent with the original site"), and what
  sits in it to press or type in (times, fields, lesson cards) is raised in
  cream, as on the page. The day's list needs no ruled header, and each of
  its rows wears the lesson's own mark, as on the calendar. Terms keeps the
  rule under its title, where a long text scrolls beneath it;
- a lesson that repeats is `weekly` wherever a student reads about it, never
  `recurring` or a `sequence`: `Weekly lesson`, `Manage weekly lessons`,
  `Move weekly time`, `Stop repeating`, the `weekly rate`. The run's own line
  in the lesson dialog is simply its weekly time, such as `Thursdays at 18:00
  Porto time` on the lesson's own clock, or `No longer repeating` once stopped;
- the lessons calendar has one name, `Your lessons`: the account menu's item
  with its count, the way back from booking, Past lessons and Your details, and
  `Back to your lessons` after a booking.

## One voice and one hand — 9 October 2026

A site-wide pass for things said or drawn two ways. The words:

- a student `change`s or cancels a lesson, in that order, as the `Change`
  button and the late change fee say; Inês keeps `Move lesson`, and the weekly
  run keeps `Move weekly time`. The €5 is the `late change fee` wherever it is
  named, and a no-show costs it instead of the `lesson price`. At the confirm
  step each fee is one short line, `€5 to move or cancel less than 14 hours
  before` and `€5 if you don’t show up to a lesson`, with when it is charged
  and the no-show's place of the lesson price left to the linked terms (10
  October 2026, at Dan's request);
- a length is `60 mins` as a label (the choices bar, the Lessons cards, booked
  lessons, Inês's form) and `60-minute` before `lesson`;
- apostrophes are curly, failures say `couldn’t` (the 404 keeps `This page
  could not be found.`), and every retry is `Try again`;
- a weekly clash is a week `already taken`, before booking as after it;
- one label per field (`Your name`, `Email`), one name for a code's price (the
  `saved weekly rate`), one name for the policy (`Terms & privacy`), and Inês's
  pattern is her `weekly hours`, under an `Account` bar like the students';
- a time range closes up (`09:00–14:00`); a date range keeps its spaces
  (`5 Oct – 1 Nov`).

And the drawing:

- anything to read before trying again sits in one coral panel, on the
  student pages and Inês's alike, its ways on (`Try again`, `Message Inês`,
  `Sign in`) after the message as small outline buttons side by side, on the
  message's own row across a wide booking page (13 October 2026); good news is the lavender panel with a 20 px tick, including
  a saved profile field;
- secondary actions share one outline (`Keep lesson` and `Manage weekly
  lessons` match in one dialog), and going back is always the small coral
  arrow link, never an outline button or an underlined word;
- every pop-up's title is set alike, and its way out is the same 44 px
  hand-cut button; focus keeps the site's own ring;
- the date's `Change` carries the same 14 px label as a lesson row's; Inês's
  buttons take the booking workspace's type at her denser 44 px;
- the FAQ's closing actions are compact, and its booking action says `Book a
  lesson`, as every other one does; the past lessons' status pill keeps the
  pill's own size; faint rules are drawn in ink, not the old green.

## One card, one palette — 9 October 2026

At Dan's request, the same day, to show the account's menu in the header's
empty middle, then to make the card feel premium rather than a bundle of
parts, in the site's own colours with a colour of its own, with the month
where a calendar puts it and nothing taking room it doesn't earn:

- every booking card is one sheet in the site's palette (see Contrast and
  accessibility): first a solid lilac, then, at Dan's choice, the warmer wash
  the booking panels had before. What sits on it to be pressed or read is
  raised in
  the paper cream of the lesson cards and dialogs, without an outline of its
  own: a free day, a time, a control's track, a past lesson, the account's
  menu button. The next lesson's row, at Dan's request, sits on the card's
  own colour.
  Blue marks where you are and what you have chosen; coral is booking and the
  lessons booked. The time-zone pill above the card is gone;
- on a wide card the header is one row: the name with `Sign out` beneath, the
  places as one sliding control in the middle, and `Book a lesson` at the
  right (see Booking workspace). The next lesson's date and time are one plain
  line;
- the calendar's header holds its months, the clock (marked with a clock, since
  a globe means online) and the arrows; the `?` sits beside the months, and
  the key beneath the weeks. Each week starts with
  its month, instead of a caption row across the grid. The clock line names
  one clock at a time: while booking, the place chosen's (`Los Angeles time`
  online, `Porto time` in Porto); on Your lessons, the next lesson's, switching
  to the other while a lesson on it is hovered or focused, the two names
  sharing one place so nothing moves;
- on a wide card each booked day shows when it runs from and until and, by a
  globe or a little person, whether it is online or in Porto; the next
  lesson's day is filled in, so the row that stretched across the card stays
  for phones. Hovering a day still shows its lessons in full, and clicking
  opens one to change or cancel;
- `Soonest times` is gone: until a day is chosen the booking calendar takes
  the whole row, and a chosen day brings its times in beside it;
- the student's emails lead with the lesson's own clock, as the site does:
  theirs for an online lesson, Porto's for one in Porto, its clock named once
  after the time (`… 09:00, Los Angeles time`), with no second clock. Inês's
  copies stay on Porto time and add the student's own beneath it when it
  differs;
- later the same day, at Dan's request for something cleaner and smoother:
  the calendar's arrows are solid blue with a white arrow; on a narrower card
  the name's menu is a cream button with the student's initial, and the
  card's `Your lessons` title, which the banner already gives, is for screen
  readers; the next lesson's row sits on the card's colour; Your details shows
  its fields plainly, each action appearing once there is something to save,
  with the code disclosure beside NIF where the fields pair; and choosing a
  day, or a time that completes a lesson, moves the workspace smoothly rather
  than cutting (see Motion direction).

## Your account, plainer — 10 October 2026

At Dan's request, the account cards say less and Your details stops reading
as a form:

- on a wide card the header holds only the places, at the top left, and
  `Book a lesson` at the right; the student's name, their splat and `Sign out`
  live in Your details. On a narrower card Past lessons and Your details
  centre their title above the name's menu, which holds the way back;
- Your details lists the splat, name, email and NIF with a `Change`, or `Add
  NIF`, beside each, opening one field at a time in place; `Sign out`, the
  same size, sits at its top right. A student can wear one of the site's splats beside their
  name instead of their initial (`students.mark`, migration 0022);
- a signed-in student's Your lessons is drawn at once, before the account
  arrives: the places (or the name's place on a phone), Book, this month and
  its four weeks with today marked, set exactly where the real card's are,
  so that when the lessons arrive only they appear. Meanwhile the days
  shimmer and a splat turns in the card's corner, or where the next lesson's
  mark will be on a phone (LessonsLoading). A return visit skips even that:
  the page remembers the account as its session last read it (a week at
  most, forgotten on signing out) and opens on it at once while asking
  again, so Your lessons shows in about a seventh of a second;
- moving between Your lessons, Past lessons and Your details, the places'
  thumb glides from where it stood to the card now showing, and that card's
  contents slide in from the side it was reached from (forward from the
  right, back from the left); with reduced motion both simply appear;
- in the phone menu, `Message on WhatsApp` is a lilac fill beside the coral
  `Book a lesson`, and the close fills with lilac and gives its cross a
  quarter turn when pointed at (never on touch, where the opening tap lands
  on it);
- signed in, booking is headed by the account's own bar, as Your lessons is:
  the name's menu, or the places open on a wide card, holding the way back;
- Inês's schedule reads as the same place: the booking page's blue band,
  one bar for `Students`, `Timetable`, `Time off`,
  `Receipts`, `Expressions` and `Profile`; sliders for a
  lesson's length and place in her lesson form, with the
  timetable's globe and person beside Online and In Porto, her sign-in with no `Create an account`, and each student's chosen
  splat beside their name when she opens a lesson. Her week is set as the
  student's calendar: a hand-cut card, compact weekday/date headings with today
  in a blue date lozenge, the solid blue arrows, blue lessons over a faint coral wash for
  her weekly hours, Monday to Friday only (a weekend day appears when it
  holds a lesson or hours of its own), and each lesson marks its place
  as the student's calendar does, a globe or a person in its top right
  corner, explained in the key, with a small `Meet` pill at the foot of an
  online lesson whose call is ready,
  and the week pager beside the date heading. Her
  arrows turn the week as the student's turn theirs: the days slide in from
  the side the week was reached from while the hours stay put (12 October
  2026, at Dan's request). Her page is made for what she does daily (12
  October 2026, at Dan's request): her next lesson, or the one happening now,
  leads the page in a blue strip with its `Join Meet` one press away (`Meet
  link on its way` until the call exists, and nothing for a lesson in
  Porto); choosing a free time offers `Add a lesson here` (the student
  dialog asking whose lesson, its date and time already in place) or `Take this time
  off`, while a time already off reopens at once and dragging across several
  still takes them off together. The `Time off` month takes taps on one day
  or several, and its card offers the whole day, some hours, or making them
  available. Booked lessons in the way, there or under changed weekly hours,
  are booked-lesson cards whose `Change` opens the lesson without losing her
  draft; more than four under weekly hours fold beneath `more lessons`. A lesson she
  added herself, for a booking arranged elsewhere, reads apart from the
  students' own while lessons move onto the site: lilac with a dashed edge
  and `Added` within its card on the week, `Added by you` in the key, the
  strip and its dialog, which says it isn't charged through the site. The
  booking system records which lessons she added, so they stay hers once a
  student's card pays for them. Her add-a-lesson form asks `How often`:
  `Once` or `Weekly`, and a weekly slot then runs for `4 weeks`, `6 weeks`,
  `8 weeks` or `Until stopped`, as the student's own choice does.
  `Students` holds small sheet cards, two across where there is room: the student's splat (or initial), name and address, one
  plain status line (a coral dot and `Not signed in yet · 1 lesson paid by
  hand`, or a check and `All set: signed in, card saved`), the next
  lesson with a `Weekly` pill, and beneath a rule `Add a lesson` (their
  profile, the same as the card) and, only for someone still to bring
  in, a coral `Send welcome email` (one email for everyone: their lessons and the
  way in). Those come first, their card edged in
  coral (12 October 2026, Dan: "can this be more beautiful"). Her form's
  email field suggests the students she already has, and choosing one fills
  in their name (`Already one of your students`): everything she does here
  should take as few steps as it can. A lesson opens in the student's own dialog: the student
  with its status beside their name, the time in bold with its length and place
  beneath, the `Already paid` and `No-show` ticks as one pair, then `Move lesson`
  in coral beside `Cancel lesson`.
  Confirming a change keeps to who and when (the Meet button, address and
  NIF step aside until `Back to lesson`): the question under a quiet rule,
  what it does as dabs (`Alex is emailed`, `It comes off your calendar`,
  `Refunded in full` for a card payment, or a reminder to refund a payment by
  hand directly). A recorded past lesson explicitly sends no email. For a
  cancellation that sends an email, `Message for Alex
  (optional)` with an example in the box, its count appearing only near
  the 1,000-character limit;
  a cancelled lesson paid by hand stays visible in history and Receipts.
  `Record refund` asks Inês to confirm she already returned it directly;
  it records that fact, sends no money or email, and keeps the receipt labelled
  `Refunded`;
- emails read as the site does: Montserrat (falling back to Arial) rather
  than a serif, the lesson's date on one line and its time and clock beneath
  with no `at`, each fact beside one of the confirm step's dabs with its label
  small above it, Google Meet's mark beside a lesson's call and on its button,
  and a hand-cut button. The dabs and mark are PNGs on the live site
  (`public/email/`, `npm run build:email-icons`). The day-before reminder's
  coral button is `Join Google Meet` when an online lesson's link is ready,
  with `Change or cancel this lesson` as a quiet underlined link beneath it,
  the email form of "a quiet link for a rare one" (14 October 2026);
  otherwise its button is `Change or cancel this lesson`, as in the
  confirmation. It names when free changes end as a date and time on the
  lesson's own clock and uses no relative day words. Short facts at the foot
  are the confirm step's dabs, one sentence per dab with any amount in coral
  (`Move or cancel free until 14 hours before the lesson.` / `After that,
  moving or cancelling costs €5.`); a one-line note (a late fee, a refund,
  Inês's receipt reminder) is one coral dab rather than a second panel, so
  the lesson's date is the only panel besides the numbered steps; a run of
  lessons names each one short and bold (`Tue 3 Nov, 08:00`) over its call,
  as the confirmation does; Inês's copies give the student's own time as a
  labelled fact in the date panel; a date, a time and its clock, and a number
  and its word never break inside, and no heading or fact leaves one word
  alone. The text part says exactly what it said (14 October 2026, Dan:
  "beautification on the emails too to use the bullets etc like in others");
- shorter helper copy: `Nothing booked yet.` alone; no intro sentence on the
  `Your account` sign-in; a clashing week `won't be booked; the rest go ahead`
  without the advice the choices bar already gives; the change overlay asks
  for a day once, and a day with nothing free says so.

## Simpler, quicker booking on the student's own clock — 9 October 2026

At Dan's request to make the booking pages and their menus simpler, quicker to
load and smooth rather than jolty, then to show times in each student's own
time zone and make that obvious:

- one card carries the account. The bar above the calendar is gone; the
  student's name under the card's heading is the account's menu, and Past
  lessons and Your details take the card's place, headed the same way (see
  Booking workspace);
- the booking banner is its title and corner splat, without reassurances;
- times are on the student's own clock. An online lesson shows on the
  browser's clock and a lesson in Porto on Porto's, where it happens. Each
  time is shown once, on one clock, never as a pair, and days follow the same
  clock, so a lesson after the student's midnight sits on their next day. For
  a student elsewhere a time standing alone names its clock (`09:00 Los
  Angeles time`, or `10:00 Porto time` for a lesson in Porto); in Portugal
  times stay plain, and the confirmation and a day's times name the clock
  once, as they always did. A student whose clock differs from Porto's at any time of
  year is told so once, where the times begin (since the follow-up above, in
  the calendar's header beside its months). Someone on Porto's clock sees no
  line. A weekly time is kept in Porto, so for a few weeks around a clock
  change its time elsewhere moves by an hour; its weekly label names the
  student's usual time. The emails followed later the same day (see above);
- the page asks for its lessons and free times as its HTML arrives rather than
  after its code, reuses free times fetched in the last minute, and while idle
  fetches what the next likely step needs, the sign-in form's code included,
  so each step shows what it can at once. Opening a booked lesson shows it
  straight away from what the calendar already knows, while the rest loads;
- every decision eases rather than jolts (see Motion direction).

## Reading and account pages, simplified — 8 October 2026

The same request, carried to the pages with most to read and the account
tools, again without new content:

- in `Terms & privacy` the five section headings are the site's lilac
  eyebrows, set well apart from the section before, so the overlay's title,
  its sections and the bold labels inside the points read as three levels. A
  list never sits tight against the sentence that introduces it;
- stacked, the FAQ index keeps two columns at every width, so on a phone it is
  a short block above the first section rather than the whole first screen.
  Phones drop the `Index` label (the list keeps its name for assistive
  technology), and the index's own last rule is the only line between it and
  the section, whose rule is drawn under its heading;
- the Approach points are headed in sentence-case Montserrat at reading size,
  and each point's line is no larger than its heading, so the three read
  heading first, as the Home principles do. Side by side, the intro line
  narrows with its column so its last word always stops short of the fan.
  `Meet Inês` lists its three credentials one to a line rather than run
  together between separators, and closing paragraphs avoid leaving a word
  alone on their last line;
- the account card's heading stays `Your account` whichever tab is chosen,
  since the tabs alone name the mode; only a `Sign in` heading follows the tab.
  `Forgot password` belongs to `I have an account` alone: someone
  creating an account, including at the booking's `Almost there`, has no
  password to forget.
  Every sign-in card opens on one small full-colour mark centred above its
  heading, clear of the words;
- in Edit details each note sits under its own field when the fields are
  paired;
- past lessons are cut in the tile hand on one surface (since 9 October 2026
  the raised cream of everything on a booking card), and only the
  status pill carries colour, lilac for `Completed` and coral for `Cancelled`,
  so a run of cancellations reads as records rather than a wall of coral. Good
  news (`All sorted`, a changed password, a reset link on its way) is a calm
  lavender panel with a tick, never a coloured stripe, and says the link's
  one-hour life only where the form above it does not already;
- Inês's schedule shares the page's left and right edges with the header
  rather than sitting in a centred box. On a phone the tools occupy one
  scrollable strip, the week has its own row and the pager follows. A wider
  phone or small tablet keeps the dates and pager on one row.

## Account interaction states

Selecting one date of a weekly lesson identifies it in the compact
management overlay. `Change` and `Cancel` affect only that date; `Manage
weekly lessons` owns the weekly schedule in that same overlay. It can move the
weekly time with the compact length, location, day, and time controls;
stop adding new lessons while keeping booked dates; or cancel all cancellable
upcoming dates as well. The action labels stand alone without an explanatory
sentence above them. Confirm either destructive action at desktop and mobile
sizes before changing anything. The bulk-cancel confirmation must state
that paid cancellable lessons are refunded automatically and that a lesson
less than 14 hours away remains booked.

The change workflow has no decorative horizontal dividers. Lesson length uses
the same sliding two-option control as `Online` / `In Porto`, so changing an
existing lesson feels like the booking flow rather than a separate tool. The
policy band follows the Worker's payment mode. Saved-card bookings say that the
lesson price is charged after it, while changing or cancelling less than
14 hours before it costs €5.

Inês's lesson dialog is about the lesson, read top to bottom in one line of
sight (27 October 2026, Dan: "feels awfully disjointed"): the student's splat
and name with the status beside them, the date in bold with the time beneath,
then `Join Google Meet` as a solid blue button carrying Meet's own mark, and the
lesson's dabs (place, length, price and how it is paid). What she records sits
together as one row of ticks, `Already paid` and `No-show` (named `Mark
no-show` / `Undo no-show` for a screen reader), each the same capsule whose dab
fills when ticked. Last, `Move lesson` in coral and `Cancel lesson` in outline
share a row while both labels fit. Moving opens under its own `Move this lesson`
heading, as cancelling does under `Cancel this lesson?`, with what happens as a
dab (`Sam gets an email with the new time`). `No-show` is live from the lesson's start until an hour after
its end, and before that it shows greyed out with `Available 11:00–13:00` beneath, so
she always knows where it is. The marked state stays reversible within the same
window, the lesson is charged once it closes, and a no-show means only €5 is
taken instead of the full price. Confirmations keep a `Back to lesson` button
beside the confirming one.

## Design once-over — 27 October 2026

Dan asked for one consistent, beautiful pass over every student and teacher
page, and for onboarding to feel easy:

- no word on its own is an underlined button. A rare action (`Try again`,
  `Clear`, `Sign out`, `Change email`, `Edit details`, `Mark as dormant`,
  `Reconnect Google Meet`, the sign-in panel's other ways in) is the site's
  small button: 40 px tall (44 px on touch), the compact label type, in
  outline, or soft lilac where it adds something (`Show all`, `Add another
  break`). It keeps its own width on a phone, where other buttons still run
  full width. Disclosures that fold a rare choice away (`Set exact hours`,
  a clash list's rest, Meet's note, `Have a code from Inês?`) are the same
  small button and look pressed while open. Underlines stay for links inside sentences, the
  footer's `Terms & privacy`, and emails; going back keeps the coral arrow;
- a student's `Join Google Meet` in their lesson's dialog is the same raised
  cream pill with Meet's mark as on their next lesson's card, never an
  underlined line;
- cards are filled, not left with a hole: `Set exact hours`, `Discard` and
  `Save weekly hours` sit at the top beside `View lessons`, and the exact-time
  editor opens as its own panel above the week (27 October 2026, Dan); a set-up student's controls carry
  their icons and wrap three and two on a narrow card; lesson history puts its
  heading and the student's contact on one row where there is room; a wide
  `Add a lesson` runs its calendar the full height beside the choices; and
  the footer of Inês's tabs meets the bottom of the window;
- a phone's month pagers say `Sept 2026`, so the month and both arrows
  share one row;
- `Add a student` opens on just a name and an email; their phone, NIF,
  price and splat are folded under one small `Phone, NIF, price and splat`
  button, and the price can still be set from the start. It ends on coral
  `Next: their lessons` over an outline `No lessons yet`.

Dan's second look the same day ("lots of different things going on at the same
time") took each busy place back to one voice:

- signing in to see lessons is the account card alone, with no `Back` above
  it; its other ways in are `Email a link` and `Forgot password`, side by side;
- a set-up student's closed row is their splat and name, with a `Weekly` tag
  in its corner when they have a weekly run. No `Student` label, email, next
  lesson or weekly line: only what needs her eye stays as a dab (their own
  price, lessons paid by hand, a come-back email sent);
- Your details speaks at one size: every `Change`, `Add NIF`, `Sign out` and
  `Have a code from Inês?` is the 14 px `Change` of a lesson row, and a long
  email breaks after its `@`;
- a student's Welcome, Sign-in and Saved card panels name the address as their
  first dab (`Goes to sam@…`), never as a bare line after the dabs;
- an expression's `Edit`, `Preview` and `Publish` are one family of lilac
  buttons;
- `Pay by card` states its fee once: `€5 to move or cancel less than 14 hours
  before, or if you don’t show up`;
- a past lesson's long date breaks before its year, never leaving the time on a
  line of its own.

## Transactional emails — 16 October 2026

The site's forty emails are sixteen templates
(`workers/booking/email-templates.mjs`), all drawn by one layout in
`workers/booking/email.mjs`: the banner, a heading and one-line introduction,
the date panel, a coral-dab note, the dab list of facts, numbered steps, one
coral blob button and, rarely, one quiet underlined link, then dab footer facts
and the site's link. Variants of an event (who made the change, one lesson or a
run, how it is paid) change lines, never the structure. Emails declare
`light dark`: in dark mode they sit on the site's dark blue with cream text,
lilac labels and lighter dabs; under 480px the margins tighten and the button
fills the width. Inês's card-declined and card-added notices are Needs you
cards, not emails. Previews of every variant: `scripts/render-email-previews-v2.mjs`.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.
