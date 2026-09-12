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
- from 821px upwards, the Lessons page combines its closing booking prompt and
  payment note as one asymmetric blue and soft-lavender composition rather
  than two full-width bars. Between 821px and 1100px, the blue panel arranges
  its own contents vertically so the joined composition fits a narrower
  desktop window; only at 820px and below do the two panels stack;
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
- on Home, the display heading is `European Portuguese lessons.` and the
  supporting line locates them in Porto and online. `Book a lesson` appears
  once. The quieter `How I teach` and `Lessons and prices` routes sit with that
  introduction rather than occupying a second strip beneath the hero;
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
  details, Google password note or consent checkbox. The final booking
  action follows the payment and change conditions for the selected method.
  Compact `Booking terms` and `Your privacy` disclosures beneath the workspace
  hold the details for anyone who wants them. Use the existing
  Montserrat text, cream surface and coral disclosure marks, with copyable text
  and readable wrapping at 320px. A quiet, sentence-case `Privacy` footer link
  sits at the bottom right on desktop and mobile, with a comfortable touch
  target and no button treatment. It opens that disclosure directly, without
  requiring sign-in. The old `/terms`,
  `/booking-terms` and `/privacy` pages redirect into booking; there is no
  separate legal-page hero, index or marketing treatment. Payment wording follows
  the method shown at booking and never implies every booking saves or charges a card.
  When after-lesson charging is active, every booking presents its
  saved-card agreement as a distinct required lavender consent block next to
  the final action; a payment configuration failure replaces action with a
  visible inline error instead of confirming without a usable payment method.

## References retained in this repository

`design/business-cards/` contains the original business-card exports. They are
historical brand references, not competing website specifications. The cleaned
blue business-card splat is retained for the generated social share image, but
the card artwork itself does not appear in the homepage interface.

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
- the wordmark and paper texture support the shared site shell.

Do not keep contact sheets, rejected generations, alternate raster exports,
mockups, or unused candidates under `public/`.

## Teacher schedule — 7 September 2026

Inês needs to see her week, make time for students, and protect her days off.
The timetable is the primary surface, in the existing cream, blue and lilac
palette. Keep expressive type in the page/section headings and clear Montserrat
type in dates, times and lesson details. Use colour to distinguish booked lessons,
usual lesson starts and days off; avoid a wall of administration forms.

- Open on the current Porto week with booked lessons placed at their actual
  times. A second `Teaching hours` view edits the repeating weekly pattern.
  Clicking or dragging marks lesson start times; keyboard and touch input must
  work without dragging. Preserve exact existing first/last-start values and
  provide an exact-time editor. The last start is not a finishing time.
- Availability edits remain a draft until `Save teaching hours`. Days off use a
  month calendar with explicit save/discard actions. Booking activity must never
  silently discard either draft. A blocked date prevents new bookings; existing
  lessons remain visible and need their own deliberate move/cancel action.
- Show the full week on desktop. On small screens, keep a seven-day selector
  above a spacious single-day timetable, with no horizontal page overflow.
  Dates and timed lessons always use Porto time, including at DST boundaries.
- Selecting a booked lesson opens its details and the existing move, cancel,
  attendance and payment-status controls. Keep cancellation confirmation,
  permission checks and server error handling intact.
- Put manual lesson entry last, collapsed under `Add a lesson for a student`.
  It is a backup for a lesson arranged elsewhere; the ordinary student booking
  service remains the primary route. Include online/in-Porto location.

## Motion direction

Use a short opacity-only transition on completed route changes, with faster
mobile timings and no click delay, overlay, transform, ambient loop, or
decorative hero entrance. Decisions inside the booking flow resize and
dissolve the existing calendar workspace rather than abruptly replacing the
page. Keep the rest of the page fixed. Reduced-motion users navigate
immediately without animation or smooth scrolling.

## Booking workspace

The confirmation checkbox reads `I agree to the terms`, with a separate
`View terms` button beside it. Keep the label in sentence case and the checkbox
at its natural size, with 44px touch targets. Opening terms never checks the
box or clears the selected lessons. One `Terms & privacy` disclosure contains
both the payment/booking terms and privacy information; old booking and privacy
links still reveal it. Keep automatic charges and fees explicit inside the
terms and retain the concise nothing-charged-now note at confirmation.

Students can collect several single-lesson dates and confirm them together.
`Single lessons` starts with the shared length and location, then date/time.
Each chosen lesson is its own row, the same shape as the choices above it: its
own splat, the date, the Porto time and one `Change`, with no running total
because the length row already shows the price. `Change` reopens the calendar
for that lesson, where `Remove this lesson` drops it and `Back to your
selection` keeps it as it was. `Add another lesson` sits beneath the rows. No
slot is held until the final confirmation. Keep 44px actions on phones. A trial
remains one first lesson. All selected lessons use
the chosen duration and location; changing duration requires choosing times
again because availability depends on length.

Recurring bookings start with one date and time and may add more weekly
times without a lesson-count cap. All starting dates must fall in the same Monday–Sunday week in Porto;
after the first choice, the calendar for each additional time shows that week only. The chosen
times repeat for the common 4/6/8-week or ongoing period. Show all starting
dates and times together, check later occurrences for every time, and name any
unavailable lesson times precisely rather than suggesting the entire week is
lost. One confirmation and one card setup cover the selection. Every lesson
keeps its own charge and change rules; the weekly times remain independently
manageable in Upcoming lessons. A conflict during confirmation retains the
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
  a returning signed-in student opens directly on the upcoming-lesson list
  rather than the book-or-view fork. On a wide desktop the account bar spans
  the workspace above a two-column overview: upcoming lessons on the left and
  the same four-week visual calendar on the right. Those two panels share their
  top and bottom edges even when the upcoming list is short or empty. The visible
  calendar border, not only its wrapper, reaches the account bar's right edge
  at wide desktop sizes. At narrower widths they keep
  the accessible stacked order of account, lessons, then calendar. Free times
  do not appear in this lesson overview.
  A signed-out visitor can browse lesson types, dates, and times first; sign-in
  is requested only when they open their lessons or confirm a booking.
  Completed decisions collapse into a compact row, so account tools,
  lesson cards, the calendar, and confirmation never compete at once;
- the signed-in identity appears once, inside a generously padded account bar.
  On wide desktop, `Book a lesson`, `View lessons`, `Past lessons`, `Edit
  details`, and `Sign out` sit directly in that bar, in that order; narrower
  layouts retain them inside a small `Menu`. `Book a lesson` uses the coral
  primary-action treatment rather than blending into the account utilities.
  `View lessons` may show the useful
  upcoming count; `Past lessons` deliberately has no count competing for
  attention. It remains present even before the student chooses
  `View your lessons`, while booking, and while an individual lesson is open;
  an empty history says so instead of removing the shortcut. The Upcoming
  lessons panel contains every future commitment. Account destinations open
  consistently: selecting the current view again keeps it open. Upcoming lessons
  owns the four-week calendar. History uses the full width beneath the account
  bar, with two readable columns of records on wide desktop and one on mobile;
  its `Upcoming lessons` action returns directly to the current schedule.
  Profile editing uses the account bar on its own, with paired fields on wide
  desktop; `Done editing` returns to Upcoming lessons. History and profile
  editing never leave a future calendar floating beside or underneath them.
  Below the wide-desktop account-bar layout,
  the more useful top-right action in Upcoming lessons remains `Book a lesson`,
  uses the same coral emphasis, and opens the booking choices directly.
  A repeating schedule appears once in Upcoming lessons,
  led by its nearest date and distinguished from coral one-off bookings with a
  lilac recurring treatment and a subtle lilac hover/focus wash.
  `Manage recurrence` opens the schedule-level choices directly, including
  moving every upcoming occurrence to a new weekly slot;
  `View next 6 lessons` reveals no more than six separate occurrence cards,
  each with its own `Manage` action. A small accessible
  tooltip explains that individual lessons can be modified up to six weeks in
  advance; it opens over the lesson list on a dark blue floating surface, so it
  never moves the cards beneath it. Stopping a repeat immediately returns every retained date to the
  ordinary individual lesson cards; only an active repeat is grouped. In these
  already-booked summaries, ordinary lesson product names are
  replaced by their useful compact duration (`60 mins` or `90 mins`), while a
  trial stays named. The recurring line states its weekly time without repeating
  the number of booked dates. One-off and stopped-sequence lessons remain
  individual entries. Each card gains a quiet colour wash on hover or keyboard
  focus without lifting, jumping, or shifting the list. One-off `Manage` stays
  in the card's far-right column on a phone instead of becoming a full-width
  row. Booked marks vary by 60/90 minutes and Online/In Porto; a repeating
  schedule has its own fifth mark. Do not reuse the stacked-wave emblem in
  booked lesson cards.
  Past and cancelled lessons reuse this same card anatomy: organic lesson mark,
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
  back action opens `Upcoming lessons` so the new booking is immediately visible;
- the calendar is the stable visual surface beneath the lesson-management
  content. Viewing lessons owns a fixed four-week overview; it never expands to
  absorb later booked dates because the complete list lives above it. It has no
  second context strip or selected-day panel: selecting a booked date expands
  its recurring group when needed, scrolls the exact occurrence into Upcoming
  lessons, and briefly highlights it. The new-booking journey still uses its
  full eight-week availability horizon. Choosing a free day collapses that
  calendar into a compact selected-date row with a `Change date` action, while
  the available times stay beside it on desktop and immediately below it on
  mobile. A free day shows the available times without redundant “no lesson
  booked” or lesson-summary copy. Those times form one compact grid without
  morning, afternoon, or evening subheadings; buttons keep an accessible touch
  target while fitting three across on a phone. The four-week lesson overview stops before later repeating dates;
  those future lessons remain in the list instead of stretching the calendar. Opening any
  lesson keeps the list and calendar in place and adds a compact overlay asking
  whether to change or cancel it. `Change` keeps the page dimmed and lifts that
  same calendar and time picker into the overlay; it never dismisses the modal
  or scrolls the student down the underlying page. The overlay is one surface,
  without framed cards nested inside it. Eligible ordinary lessons can switch
  between the same compact `60 mins` and `90 mins` choices and Online/In Porto
  there, with the current date and time already selected; a paid lesson is never silently
  repriced. Cancellation stays inside the overlay until explicitly confirmed.
  The booking overview says `Next 8
  weeks`
  explicitly and contains no more than eight Monday-to-Sunday rows; the
  calendar key and range label share one visual centre. Completed booking
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
  uses one clear blue focus boundary rather than stacking coral and blue rings. The inclusive 56-day API boundary must
  not create a ninth visible row;
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
  The account bar stays still while the opened history, lesson list, profile
  fields or recurring occurrences settle into place. Buttons stay responsive
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
existing students receive their eligible ordinary choices. The main `Booking`
navigation still opens a returning student's schedule. Old `/my-lessons` and
emailed `/booking` links retain their destination and tokens in `/book/`.

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
happening today remains booked under the existing same-day policy.

The change workflow has no decorative horizontal dividers. Lesson length uses
the same sliding two-option control as `Online` / `In Porto`, so changing an
existing lesson feels like the booking flow rather than a separate tool. The
policy band follows the Worker's payment mode. Saved-card bookings say that the
lesson price is charged when it ends, while moving or cancelling on its Porto
calendar day costs €5. The teacher schedule exposes `Mark no-show` only after
the lesson starts and before it ends; the marked state remains reversible until
charging begins and means only €5 is taken instead of the full price.

## Superseded work

Old green/editorial website directions, generated concept boards, mockup
renders, superseded briefs, duplicate exports, and rejected splat experiments
were moved on 2026-07-24 to:

`/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`

That folder is an archive for provenance only. Do not use anything in it as a
design source unless Dan explicitly asks to revisit a named archived item.
