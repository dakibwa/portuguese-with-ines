# Current visual direction

This file is the canonical human-readable contract for the website's visual
direction, responsive composition, motion, and important interaction states.
Git owns the production implementation and browser-ready assets, and the
published site is the acceptance surface. When this contract and the site
diverge, reconcile them in the repository rather than maintaining a second
design system elsewhere.

The current direction is:

- dark blue (`#2c54aa` and `#203e82`), lilac (`#aaa4e6`), warm cream
  (`#f5ecd9`), and a small coral accent (`#ef5d3c`);
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
- **Decorative motion:** adding ambient loops, click delay, entrance
  choreography for a page's text, controls or sections as it loads, or any
  movement that makes a reader wait or does not explain a state change. The
  page turn, the phone menu opening, the little splats' one-time landing, the
  rules drawn under the headings and the wordmark's hats tipping now and then
  (see Motion direction) are deliberate.

## Contrast and accessibility

Recurring checkout shows the final per-lesson price before confirmation and
uses the account's saved rate automatically. Code entry belongs only under
Edit details, behind the small “Have a code from Inês?” disclosure; booking and
lesson-length changes have no code field. The student applies a rate for each
length, so a 60-minute code and a 90-minute code can both be saved.
The disclosure note describes future weekly lessons of the matching length.
Students can continue editing while a save is pending; a reply preserves newer
drafts, and independent name/NIF saves cannot undo one another.
They get an accessible status message and see that saved price on return.
Duration changes show their actual price before submission. No valid-code
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
  phone they share a row beneath it, and below 414 px each takes the full
  width so neither label wraps. The blue
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
  Google sign-in and the account form, with no data-use summary, privacy
  details, Google password note or consent checkbox. The account form ends
  with an optional NIF field whose only note is that it is added to receipts;
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

## Public polish — 22 September 2026

Dan's 22 September review tightened the public pages:

- every secondary action is a button: an outline on cream, a light outline on
  blue, at the compact size beside a coral primary action. Underlined text is
  kept for links inside sentences and the quiet `Terms & privacy` footer link;
- the footer hugs its content. On desktop it is one row, no taller than about
  120 px: the wordmark, the four destinations, a thin divider, then `Terms &
  privacy` at the right. On phones the destinations live behind the footer
  `Menu`, with `Terms & privacy` beneath it;
- banners give the page back to the task, and their art sits halfway down the
  band rather than up in a corner. The Lessons banner is about 230 px on
  desktop; on phones it becomes a lavender band with the splat in a
  square-cornered blue strip at its right edge, like the wider layouts' blue
  column. The FAQ banner is about 200 px, 150 px on phones, with its question
  splat whole inside the page margin. Stacked, the Approach fan comes in from
  the right edge halfway down the heading rather than trailing beneath it, and
  the booking banner keeps
  its splat at the right in a band of about 124 px, without an editorial rule,
  its two-line `Your Lessons` set close as one handwritten block;
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
  moves them beneath the copy only on phones;
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
- the at-your-pace mark uses an asymmetric cluster of rounded navy and lilac
  blobs with a small coral accent. It replaces the stacked-stone silhouette
  Inês also rejected on 13 September 2026, in lesson rows and the calendar corner;
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
- `Weekly hours`, top right, opens the repeating weekly pattern. Clicking or
  dragging marks lesson start times. Preserve exact existing first/last-start
  values and provide an exact-time editor. The last start is not a finishing
  time. Weekly edits remain a draft until `Save weekly hours`, and booking
  activity must never silently discard that draft.
  Half-hour cells include both quarter-hour starts when the booking interval
  is 15 minutes. A partly available cell names its actual start and shows a
  mixed state; clearing it removes its selected starts, and enabling an empty
  cell enables both. Dragging includes the final cell, and the exact-time
  editor retains control of off-grid windows.
- Time off prevents new bookings; existing lessons remain visible and need
  their own deliberate move/cancel action.
- Show the full week on desktop. On small screens, keep a seven-day selector
  above a spacious single-day timetable and that day's `Day off` switch, with
  no horizontal page overflow. On desktop the timetable stands at its full
  height, with no scroll of its own, so an evening lesson is never hidden
  inside it. On a phone the day scrolls within its box and opens at her first
  teaching hour that day or its first lesson, whichever is earlier.
  Dates and timed lessons always use Porto time, including at DST boundaries.
  Entering a time skipped by the spring clock change shows an error and keeps
  the form available to correct. Moving a lesson in autumn's repeated hour
  preserves its original occurrence while its wall time remains unchanged.
  Skipped weekly occurrences are listed by date in previews, confirmations
  and emails; a missing wall time never appears as a different real time.
- The timetable spans 08:00–20:00 and widens to fit any weekly hours or
  lessons outside it. There is no 24-hour view; early or late hours are set
  with the exact-time editor.
- Google Meet is one line above the week: its logo, its name and `Configure`.
  Only a problem adds a short status beside the name. Connection details,
  connecting or reconnecting, and the Google Calendar link stay behind
  `Configure`.
- Every booked lesson shows its time, student and explicit `Online` or `In Porto`
  label in both layouts, including 60-minute blocks. Keep the location icons and
  coral marker for Porto lessons.
- The workspace opens with a quiet bar naming who is signed in, with `Sign
  out`.
- A lesson marked as a no-show turns lavender in the calendar and carries a
  small coral `No-show` tag beside its time, so she can see it at a glance.
- Selecting a booked lesson opens its details and the existing move, cancel,
  attendance and payment-status controls. Keep cancellation confirmation,
  permission checks and server error handling intact. The details always
  state the student's NIF, or `NIF not given (consumidor final)`, because her
  receipt automation reads them.
  Closing without a change returns keyboard focus to its opener. Completing
  an action returns focus to the stable week heading while the timetable
  reloads, with a single blue outline; it never steals a later focus choice.
- Put manual lesson entry last, collapsed under `Add a lesson for a student`.
  It is a backup for a lesson arranged elsewhere; the ordinary student booking
  service remains the primary route. Include online/in-Porto location.

## Wording and confirmation — 13 September 2026

Use `Portuguese Lessons` on the home page and `Your Lessons` in booking.
Marketing copy describes Portuguese lessons without repeated European/Portugal
positioning. The one statement of it is on Approach: Inês teaches European
Portuguese, and any variety a student already knows is welcome. Retain actual
location choices, addresses, qualifications and Porto time where they help
someone attend a lesson or understand a deadline.

Keep booking confirmation in one column at every width: a compact optional notes
box, the payment summary underneath, then the agreement and final action. Limit
the notes box's height while the whole column fills the booking workspace,
including on desktop. Let visitors resize the notes box for longer notes. The
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
action, so coral and blue appear only when the action is live. Your details
goes one step further: a field's action, such as `Save name`, stays clear
until there is something to save, then appears in its live colour. It keeps
its place, beside the field or, on a phone, beneath the field's note, so
nothing moves as it appears, and assistive technology still finds it,
unavailable, as before.

Confirmed email changes preserve an open profile editor and newer drafts while
renewing that account's session. Opening the profile editor initially focuses
the name field before interaction; later browser frames never move focus away
from a field the student has selected. If the calendar cannot refresh after booking,
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

Pages turn into one another. The header stays exactly where it is and the
nav's coral line glides along to the new destination. The page being left
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
9 October 2026). Its two circumflexes over ê (the chapéu, the hat) tip now and
then on their own, so the site feels lightly alive: a lift of a few pixels and
a small turn, the two hats turning opposite ways and settling on the soft
spring, Português every nine seconds and Inês every thirteen, so they seldom
coincide. The beat is the wall clock's, not the page's, so the rhythm carries
on unbroken from page to page. It is the one ambient motion on the site.
Reduced motion keeps the hats still.

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
(`Sign in` alone on a phone) to a returning browser. A first-time visitor sees
no sign-in there, since booking asks for an account only at the confirmation;
a quiet `Already booked? Sign in` line beneath the calendar still serves a
student on a new browser. Signing in to view lessons shows the `Your account`
card on its own, with a small `Back` above its corner. On wide screens the
groups carry small `Lesson`, `Where`, `Length` and `Repeat` labels; on a phone
the options name themselves and the labels remain for assistive technology.
Each group starts as wide as its options need and a row shares out what is
left, so a wide screen fills the line and a narrower one moves a group down;
option labels never wrap. Below 361 px the four repeat options sit two by
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
Each chosen lesson is its own row: its own splat, the date and time, its clock
named once (`Porto time`, `Los Angeles time`), and one `Change`. Beneath the rows a dashed card of the same shape,
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
  its header is one row: the student's name with a quiet `Sign out` beneath
  it, the account's places in the middle and the coral `Book a lesson` at the
  right. On a narrower card the student's name leads it as the account's menu, with
  `Book a lesson` at its top right (`Book` on phones, keeping the full name
  for assistive technology); the banner above already says Your lessons, so
  the card's own title is for screen readers, as on a wide card.
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
  own colour, as it does on
  any card when the next lesson lies beyond the first four weeks: its date and
  time in one plain line, then its length, location, `Weekly` when it repeats
  and its Meet link, opening that lesson directly. With nothing booked, one line says so above the same
  calendar. Free times do not appear in this lesson overview.
  A signed-out visitor can browse lesson types, dates, and times first; sign-in
  is requested only when they open their lessons or confirm a booking.
  Completed decisions collapse into a compact row, so account tools, the
  calendar, and confirmation never compete at once;
- the signed-in identity appears once, with the account's menu (9 October
  2026, at Dan's request to fold the separate account bar into the calendar
  card, then to show the menu in the header's empty middle). Its places are
  `Your lessons`, `Past lessons` and `Edit details` (`Done editing` while
  editing), then `Sign out`, in that order. On a wide card (1100 px of booking
  column and up) they sit open in the header, centred on the card, as one
  sliding control of the booking bar's kind, its blue thumb on the card that is
  showing; the name stands plain at the left with `Sign out` beneath it, since
  signing out belongs to the person, not among the places, and the card's
  title is kept for screen readers because the places already name it. On a
  narrower card the name is the menu, and plainly a button (9 October 2026,
  at Dan's request): a cream pill holding the student's initial in a blue
  circle, their name and a chevron, never the site menu's three lines, so a
  phone shows one `☰` for the site and one clearly different account menu,
  and it opens over the card. Booking is not repeated there: its
  one coral action belongs to the card. `Your lessons` may show the useful
  upcoming count; `Past lessons` deliberately has no count competing for
  attention. The menu lives in the account cards, behind an open lesson too;
  while booking it waits, and the booking bar's `Your lessons` is the way
  back. An empty history says so instead of removing the shortcut. The lessons
  calendar reaches every future commitment. Account destinations open
  consistently: selecting the current view again keeps it open. Past lessons
  and Your details each take the lessons card's place, in the same hand and
  headed the same way: on a wide card the same row, with the places exactly
  where they were and the thumb on the card showing; on a narrower one the
  title with a `Your lessons` way back to the current schedule at its right,
  and the name's menu beneath them. History has two
  readable columns of records on wide desktop and one on mobile; order records
  by when each lesson ended or was cancelled, newest first, so cancelled
  future dates do not bury recently completed lessons.
  Profile editing has paired fields on wide desktop, name beside email and
  NIF beside the code disclosure; `Done editing` returns to Your lessons. Its
  last item is the small `Have a code from Inês?` disclosure, one field with a blue `Add code`
  beside it that stays open for the second length's code, with any saved weekly
  rate listed above it. History and profile
  editing never leave a future calendar floating beside or underneath them.
  Future calendar dates keep their plain date tiles, with a hover/focus highlight
  and no separate `Book` label. A free date opens booking on that day at once,
  with its times and no question first. A date with one lesson opens that
  lesson directly; a date with several opens `Your lessons`, listing each
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
  Profile fields sit directly in the Your details card, without a second
  framed card inside it; their actions appear once there is something to save,
  beside the field whenever the available width permits. Profile inputs use the same single blue focus
  boundary as the booking notes field;
- after a successful one-off or weekly booking, the confirmation's primary
  `Back to your lessons` opens the lessons calendar so the new booking is immediately
  visible on its day;
- the confirmation itself is one hand-cut card on the booking cards' lilac sheet,
  read top to bottom: `You're booked in.`, the day with its times beneath it,
  where the confirmation went, then the two actions, and a small-print foot
  under a soft rule with the reference and the fee rule. The lesson's own mark
  lands in its top corner as its only seal, so there is no separate `Booked`
  badge (8 October 2026). Several lessons are each named once, short
  (`Tue 20 Oct, 10:00`), and a weekly booking reads as its weekly time
  (`Tuesdays at 10:00`, from its first date) with the count beneath; a week or
  time that was already taken is a coral chip under one short line, never a
  box inside a ruled block. With several lessons the second action goes, since
  each opens from the calendar, and the foot speaks of them all;
- the calendar shows four Monday-to-Sunday weeks at a time, never one long
  scroll. Its header is the one every calendar has: its months on the left
  (`October 2026`, or `October – November 2026` where the weeks cross into the
  next, `Oct – Nov 2026` on a phone), with the clock beside them for a student
  elsewhere, and the `Earlier weeks` and `Later weeks` arrows on the right,
  solid blue with white arrows.
  `Later weeks` carries a small coral count of the booked lessons beyond the
  page, so nothing booked is out of sight without a sign. Each week starts with
  its month (`OCT`), in ink where a month begins and lilac ink where it carries
  on, and a month that begins part-way through a week marks its 1st (`1 NOV`);
  there are no caption rows across the grid. The key sits beneath the weeks it
  explains. A new
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
  first. Never a wall of every quarter hour. Each half is a small timetable without subheadings: one row per hour, one column
  per start minute the day offers (four for quarter hours), so a gap reads as a
  gap and buttons keep an accessible touch target on a phone. The date's
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
existing students receive their eligible ordinary choices. `Book a single
lesson` and `Book a longer lesson` open booking with that length already
chosen. The main `Booking` navigation still opens a returning student's
schedule. Old `/my-lessons` and emailed `/booking` links retain their
destination and tokens in `/book/`.

## Booking, simplified — 8 October 2026

At Dan's request to make the places where people read or act simpler and
calmer, without new content:

- one price at the point of payment: with Weekly chosen, each length shows the
  account's saved weekly rate, the same price as the line under `Confirm your
  weekly lessons`;
- the payment summary is a short list rather than a paragraph: one fact per
  item, two to a row where the column allows and one on a phone, each after a
  little dab of paint cut from the FAQ mark and turned and coloured
  differently from its neighbours. Every fee fact stays, with the amount in
  coral. Paying on the lesson day, `The full rules are in terms & privacy` is
  the last item rather than a link standing alone above the final action; with
  card payment the agreement control is unchanged. The step heading leaves room
  for Beth Ellen's descenders;
- in a narrow booking column a lesson row's date reads short
  (`Fri 16 Oct, 18:00`), as does the next lesson, with the long form kept for
  screen readers. The row's `Change` keeps its 14 px label (see Contrast and
  accessibility);
- the lesson dialog drops the question that repeated its heading and buttons,
  and the rules around the lesson's date. Its pill is `Weekly lesson` only
  while the repeat is running, `Booked` once it stops, and `Cancelled` carries
  the past lessons' ⊗. `Manage weekly lessons` is a compact outline button.
  Cancelling weekly lessons states what happens rather than asking again. On a phone a
  decision's pair of actions (`Yes, cancel it` / `Keep lesson` and the like)
  stacks so no label wraps, while `Change` and `Cancel` stay side by side;
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
- `Terms & privacy` and a day's list of lessons are one family with the lesson
  dialog: the same hand-cut panel on light paper with its warm corner, over the
  same lightly dimmed page. The day's list needs no ruled header, and each of
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
  named, and a no-show costs it instead of the `lesson price`;
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
  student pages and Inês's alike; good news is the lavender panel with a 20 px
  tick, including a saved profile field;
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
  `I've forgotten my password` belongs to `I have an account` alone: someone
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
  rather than sitting in a centred box. On a phone the week has its own row,
  `Weekly hours` and the pager share the next, and the hint follows; a wider
  phone or small tablet that fits all three keeps them on one row.

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

Inês's lesson card is shaped like the student side's lesson rows: its splat, the
length and short date in one small line above the student's name (`60 mins ·
Thu 8 Oct`, while a trial keeps its name), then the
time, place, email and NIF in one soft panel (two columns on wide screens). Its
actions are the site's buttons, never text links: `Join Google Meet` in outline
blue, `Move lesson` in blue, `Cancel lesson` outlined in coral, and `Mark
no-show` outlined, with Move and Cancel side by side except on the narrowest
phones. `Mark no-show` is live from the lesson's start until six hours after
its end, and before that it shows greyed out with `Available 11:00–18:00`, so
she always knows where it is. The marked state stays reversible within the same
window, the lesson is charged once it closes, and a no-show means only €5 is
taken instead of the full price. Confirmations keep a `Back to lesson` button
beside the confirming one.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.
