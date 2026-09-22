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
- **Decorative motion:** adding ambient loops, entrance choreography, click
  delay, or movement that does not explain a state change.

## Contrast and accessibility

Recurring checkout shows the final per-lesson price before confirmation. An
optional “Have a code from Inês?” disclosure keeps private pricing out of the
main booking choices. The signed-in student applies one duration-specific rate,
gets an accessible status message, and sees that saved price on return. Duration
changes show their actual price before submission. No valid-code suggestions,
catalogue, countdown or expiry pressure belong in this flow.

Three visible colour choices are required for accessible contrast:

- the second half of the Approach page heading (`way to learn.`) uses `--blue`
  on the lavender panel. Cream measured 1.95:1 there, while blue on lavender
  holds 3.2:1, the same tonal relationship the home hero uses for lilac on blue;
- body ink uses `#1a3169`, and the eyebrow lilac uses `#665fa6`, so small text
  clears AA on the lavender and cream panels. Both are imperceptible on cream
  and neither changes a fill colour;
- booking reassurance labels use `#dcd8f5` to clear AA on the blue booking
  panel;
- completed booking-choice values and change actions use body ink at no less
  than 14 px, so both remain readable on the lavender mobile surface.

The `--blue`, `--blue-deep`, `--lavender`, `--paper`, and `--coral` fill
colours are unchanged.

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
  buttons rather than plain links or a second strip beneath the hero;
- Approach, Lessons, FAQ, and Booking follow the same hierarchy: the brand
  anchors the shared header and footer, while each page owns a task-specific
  heading and only the actions that meaningfully advance its reading path.
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
  booking choices, notes and agreement state. The old `/terms`,
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
- banners give the page back to the task. The Lessons banner is about 230 px
  on desktop; on phones it becomes a lavender band with the splat on a blue
  blob cropped at its right edge. The FAQ banner is about 200 px, 150 px on
  phones. On phones the Approach splat sits at the banner's top right beside
  the heading rather than trailing beneath it, and the booking banner keeps
  its splat at the right in a band of about 124 px, without an editorial rule;
- the three Lessons cards each have their own squiggle outline and their own
  splat inside the card, beside the lesson name; the trial card is lavender.
  Their rows align across the cards: name and mark, price and length,
  description, then one full-width button, so no card has an empty foot. The
  whole card opens booking with that lesson chosen. Hover and keyboard focus
  add a quiet colour wash and tilt the mark, without lifting the card, and the
  button answers on its own: it lifts slightly and fills. The closing blue card
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
- the FAQ shows one section at a time. The index switches sections in place,
  fading the chosen one in without scrolling the page, and the address keeps
  `#faq-<section>` so links open the right section; on phones, where the index
  sits above, the chosen section is brought into view. Section headings carry
  no number because the index already does, and questions sit close to body
  size;
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
  time. Weekly edits remain a draft until `Save teaching hours`, and booking
  activity must never silently discard that draft.
- Time off prevents new bookings; existing lessons remain visible and need
  their own deliberate move/cancel action.
- Show the full week on desktop. On small screens, keep a seven-day selector
  above a spacious single-day timetable and that day's `Day off` switch, with
  no horizontal page overflow.
  Dates and timed lessons always use Porto time, including at DST boundaries.
- The timetable spans 08:00–20:00 and widens to fit any teaching hours or
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
  out`, in the same form as the student account bar.
- A lesson marked as a no-show turns lavender in the calendar and carries a
  small coral `No-show` tag beside its time, so she can see it at a glance.
- Selecting a booked lesson opens its details and the existing move, cancel,
  attendance and payment-status controls. Keep cancellation confirmation,
  permission checks and server error handling intact. The details always
  state the student's NIF, or `NIF not given (consumidor final)`, because her
  receipt automation reads them.
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
fills. Selected agreement uses blue beside the coral booking action. Recurring
lesson management pairs blue `Move recurrence`, an outline `Stop repeating`, and
coral `Cancel all booked lessons`; profile editing pairs coral `Save name` with
blue `Send confirmation link`. Keep the existing labels and state indicators so
colour is never the only way to tell the controls apart.

## Motion direction

Use a short opacity-only transition on completed route changes, with faster
mobile timings and no click delay, overlay, transform, ambient loop, or
decorative hero entrance. Decisions inside the booking flow resize and
dissolve the existing calendar workspace rather than abruptly replacing the
page. Keep the rest of the page fixed. Reduced-motion users navigate
immediately without animation or smooth scrolling.

Pop-ups and their dimmed backgrounds appear with a short, gentle fade. Apply
the same entrance to terms, booking prompts and student/teacher lesson dialogs,
keeping their position stable and their controls responsive throughout. Focus
and dismissal take effect immediately; reduced motion removes the fade.

## Booking workspace

Students can collect several single-lesson dates and confirm them together.
`Single lessons` starts with the shared length and location, then date/time.
Each chosen lesson is its own row, the same shape as the choices above it: its
own splat, the date, the Porto time and one `Change`, with no running total
because the length row already shows the price. `Change` reopens the calendar
for that lesson, where `Remove this lesson` drops it. A coral `Back` button at
the calendar's top right replaces the range label and returns to the unchanged
selection. While choosing a time, show only `Change` beside the selected date;
it returns to the date calendar. Use one `Choose a time` heading above the
slots, without a second title or a generic instruction above the selected date.
`Add another lesson` sits beneath the rows. No
slot is held until the final confirmation. Keep 44px actions on phones. A trial
remains one first lesson. All selected lessons use
the chosen duration and location; changing duration requires choosing times
again because availability depends on length.

Recurring bookings start with one date and time and may add a second weekly
time. Both starting dates must fall in the same Monday–Sunday week in Porto;
after the first choice, the second calendar shows that week only. The chosen
times repeat for the common 4/6/8-week or ongoing period. Show both starting
dates and times together, check later occurrences for both, and name any
unavailable lesson times precisely rather than suggesting the entire week is
lost. One confirmation and one card setup cover the selection. Every lesson
keeps its own charge and change rules; the two weekly times remain independently
manageable from the lessons calendar. A conflict during confirmation retains the
student's whole selection for correction and never silently books only part.

Preserve these desktop and mobile states:

- on desktop the blue introduction is a compact horizontal banner above the
  cream booking workspace, not a full-height side rail. It keeps the page title
  and three reassurances while returning the full viewport width to the task.
  Their small organic marks are large enough to read at a glance, while the
  decorative availability splat is deliberately much larger and crops across
  the banner's top-right corner rather than floating as a small isolated icon;
- between 821px and 1100px, the booking title and reassurance row stack. Give
  each label room for whole words and hide the large corner splat at those
  widths; never squeeze the three labels into narrow columns that collide with
  neighbouring artwork. The phone layout keeps its existing compact title;
- the workspace opens with one decision: `Book a new lesson` or `View your
  lessons`. Booking then asks for single lessons or recurring lessons.
  The selected route puts Online/In Porto and `60 minutes`/`90 minutes` together
  as compact sliding selectors on one setup screen; a recurring booking adds 4,
  6, 8 weeks, or `Ongoing` there as a third selector. The recurring route name
  is not repeated above `Choose your lesson`. Once a starting time is chosen,
  the journey goes to the selection review while later weeks are checked. The
  expected all-clear stays silent; only clashing weeks appear before the student
  can book. Availability is never offered before lesson length because a
  90-minute lesson has fewer valid start times than a 60-minute one. An eligible
  first-time student also sees the separate fixed-length trial route, followed
  by its Online/In Porto choice;
  a returning signed-in student opens directly on their lessons rather than
  the book-or-view fork. Their lessons are one calendar card beneath the
  account bar, sharing its left and right edges at every width; there is no
  separate list to keep in step with it. The card's header reads `Upcoming
  lessons`, with a `?` tooltip, and puts the coral `Book a lesson` at its top
  right (`Book` on phones, keeping the full name for assistive technology).
  Beneath the header, the next lesson, or `Happening now`, shows its date,
  time, length, location, `Weekly` when it repeats and its Meet link, and opens
  that lesson directly. With nothing booked, one line says so above the same
  calendar. Free times do not appear in this lesson overview.
  A signed-out visitor can browse lesson types, dates, and times first; sign-in
  is requested only when they open their lessons or confirm a booking.
  Completed decisions collapse into a compact row, so account tools,
  lesson cards, the calendar, and confirmation never compete at once;
- the signed-in identity appears once, inside a generously padded account bar.
  On wide desktop, `View lessons`, `Past lessons`, `Edit details`, and `Sign
  out` sit directly in that bar, in that order; narrower layouts retain them
  inside a small `Menu`. Booking is not repeated there: its one coral action
  belongs to the calendar. `View lessons` may show the useful
  upcoming count; `Past lessons` deliberately has no count competing for
  attention. It remains present even before the student chooses
  `View your lessons`, while booking, and while an individual lesson is open;
  an empty history says so instead of removing the shortcut. The lessons
  calendar reaches every future commitment. Account destinations open
  consistently: selecting the current view again keeps it open. History uses
  the full width beneath the account
  bar, with two readable columns of records on wide desktop and one on mobile;
  order records by when each lesson ended or was cancelled, newest first,
  so cancelled future dates do not bury recently completed lessons.
  Its `Upcoming lessons` action returns directly to the current schedule.
  Profile editing uses the account bar on its own, with paired fields on wide
  desktop; `Done editing` returns to Upcoming lessons. History and profile
  editing never leave a future calendar floating beside or underneath them.
  Future calendar dates keep their plain date tiles, with a hover/focus highlight
  and no separate `Book` label. A free date opens `Do you want to book?` with
  the chosen date, `Choose a lesson` and `Not now`. A date with one lesson opens
  that lesson directly; a date with several opens `Your lessons`, listing each
  lesson's time, length, location and `Weekly` when it repeats, with `Book
  another lesson` and `Not now`. Continuing carries the date into lesson
  selection and then checks times for that length; an unchecked date does not
  imply availability. A date with no free times offers the normal change-date
  route without losing the chosen lesson. Dismissing the question, or closing
  a lesson, restores focus to the date.
  Weekly lessons are lilac on the calendar and one-off lessons coral; a day
  holding both keeps each time in its own colour, and the key names the two
  kinds only when a weekly lesson exists. A weekly lesson opens with a lavender
  `Recurring lesson` status and `Manage sequence`, which moves, stops or cancels
  the whole run. Stopping a repeat turns every retained date back into an
  ordinary coral lesson; `View lessons` counts an active repeat once and each
  retained date on its own. The `?` tooltip says that a booked lesson opens its
  details, move and cancel choices, and that any other day starts a booking; it
  floats over the card on a dark blue surface without moving anything beneath
  it. In these already-booked summaries, ordinary lesson product names are
  replaced by their useful compact duration (`60 mins` or `90 mins`), while a
  trial stays named. Booked marks vary by 60/90 minutes and Online/In Porto; a
  repeating schedule has its own fifth mark. Do not reuse the stacked-wave
  emblem for booked lessons.
  Past and cancelled lessons are cards with a consistent anatomy: organic lesson mark,
  clear status pill, date, compact duration and location, then a quiet booking
  reference. They have no hover lift or management affordance because they are
  records rather than actions.
  There is no second `My lessons` navigation destination.
  The account bar, workflow choices, and calendar share the same left and right
  edges. Profile fields open directly inside the account
  bar, without a second framed card; their actions sit beside the field whenever
  the available width permits. Profile inputs use the same single blue focus
  boundary as the booking notes field;
- after a successful one-off or recurring booking, the confirmation's primary
  back action opens the lessons calendar so the new booking is immediately
  visible on its day;
- the calendar shows four Monday-to-Sunday weeks at a time, never one long
  scroll. `Earlier weeks` and `Later weeks` arrows sit either side of the range
  label, and `Later weeks` carries a small coral count of the booked lessons
  beyond the page, so nothing booked is out of sight without a sign. A new
  booking pages through the whole twelve-week booking window; the lessons view
  pages from this week through the same window, or to the last booked lesson
  when that is later. The lessons view has no second context strip or
  selected-day panel. Choosing a free day collapses the booking
  calendar into a compact selected-date row with a `Change date` action, while
  the available times stay beside it on desktop and immediately below it on
  mobile. A free day shows the available times without redundant “no lesson
  booked” or lesson-summary copy. Those times form a small timetable without
  morning, afternoon, or evening subheadings: one row per hour, one column per
  start minute the day offers (four for quarter hours), so a gap reads as a gap
  and buttons keep an accessible touch target on a phone. `Change date` returns to the
  four weeks that held the date. Opening any
  lesson keeps the calendar in place and adds a compact overlay asking
  whether to change or cancel it. `Change` keeps the page dimmed and lifts that
  same calendar and time picker into the overlay; it never dismisses the modal
  or scrolls the student down the underlying page. The overlay is one surface,
  without framed cards nested inside it. Eligible ordinary lessons can switch
  between the same compact `60 mins` and `90 mins` choices and Online/In Porto
  there, with the current date and time already selected; a paid lesson is never silently
  repriced. Cancellation stays inside the overlay until explicitly confirmed.
  On desktop the calendar key and the pager share one visual centre; on phones
  the key keeps its own line with the pager across the width beneath it.
  Completed booking
  decisions are the review: lesson kind, location, length, repeat when relevant,
  date, and time each keep the same compact selected-row anatomy with their own
  precise change action. Their leading artwork uses distinct existing V2 splats
  for lesson, location, length, repeat, date, and time, with the same date splat
  beside the time picker. These marks sit directly on the row without an icon
  tile; their organic edges remain legible at desktop and mobile sizes. The
  selected values carry each choice's meaning: `In Porto`, `60 minutes`,
  `Repeat for 4 weeks`, and the chosen date and time. Omit category labels such
  as `Where` and `Date selected`, and repeated weekly-time explanations. Keep
  the price with lesson length and name Porto time once with the selected time;
  only add the visitor's local time when it differs. On narrow phones each
  action reads `Change`, with the precise action retained as its accessible
  name, so the selected value has enough space. Editing one decision opens only
  that choice; changing length returns to time because 60- and 90-minute
  availability differs. The notes and final confirmation action follow this
  unified stack, with no second
  recap page or combined `Change details` route. The optional notes textarea
  uses one clear blue focus boundary rather than stacking coral and blue rings.
  The inclusive 84-day API boundary must not add a thirteenth week: a partial
  row beyond the window is not shown;
- calendar month headings and spillover abbreviations come from the Porto date
  key itself, so a visitor behind UTC sees `31 AUG` rather than `31 JUL`; this
  date-label rule does not alter the separate Porto/visitor slot times;
- days with two bookings show both booked times on separate lines. Do not use a
  small `2x` count badge beside the date;
- primary coral and secondary outline actions share a 52 px height, Montserrat
  0.7 rem labels, 0.12 em tracking, and the same hand-drawn button radius.
  Tertiary text actions use the same type at 40 px minimum height and align to
  the right wherever the label fits, on mobile as well as desktop. The selected
  compact lesson overlay pairs the booking status with `Change` and `Cancel`;
  it must not replace or reorder the underlying lesson workspace;
- transitions belong to the account, choice, calendar, detail, and confirmation
  surfaces individually. Use short local fades and a few pixels of settling
  motion rather than page-wide view snapshots. Guidance begins with the state
  change instead of waiting for decoration to finish, and the page scrolls only
  when the next decision is not already comfortably visible. Loading copy and
  its replacement controls dissolve into one another rather than snapping.
  The account bar stays still while the opened history, calendar page or
  profile fields settle into place. Buttons stay responsive
  during motion. Reduced motion removes both the transitions and smooth scrolling;
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

## Account interaction states

Selecting an occurrence from a recurring sequence identifies it in the compact
management overlay. `Change` and `Cancel` affect only that date; `Manage
sequence` owns the recurring schedule in that same overlay. It can move the
upcoming recurrence with the compact length, location, day, and time controls;
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
lesson price is charged when it ends, while moving or cancelling less than
14 hours before it costs €5. The teacher schedule exposes `Mark no-show` only after
the lesson starts and before it ends; the marked state remains reversible until
charging begins and means only €5 is taken instead of the full price.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.
