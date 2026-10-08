# Português com a Inês

The production website for Inês Dias Baía’s one-to-one Portuguese
lessons, online or in Porto.

The approved dark-blue, lilac, cream, and splatty direction is implemented as
five responsive routes:

- `/` — Home
- `/approach` — teaching approach and confirmed credentials
- `/lessons` — lesson formats and prices
- `/faq` — booking, lesson, location, payment, rescheduling, and level answers
- `/book` — one workspace for booking, seeing every upcoming lesson on a
  calendar, and moving or cancelling without leaving the page
- `/booking` — backwards-compatible entry for older emailed management links;
  it resolves into the `/book` workspace (noindex)
- `/my-lessons` — backwards-compatible account entry; it resolves into the
  `/book` workspace (noindex)
- `/reset-password` — reached from a reset email (noindex)
- `/schedule` — Inês's own view: teaching hours, days off, and what is booked
  (noindex, teacher account or emergency access key required)

Every route carries a booking action within reach of its closing content, not
only in the header: the home page closes on one, and the FAQ ends with a route
to booking alongside the WhatsApp option.

`Booking` is deliberately the only learner-calendar destination in the site
navigation. Once signed in, the same page shows the student's account, booked
lessons, later repeating lessons and past lessons without introducing a second
`My lessons` tab.

The website's canonical visual and interaction contract is
[design/README.md](./design/README.md). It records the current visual rules,
responsive states, retained business-card references, production-asset
boundary, and location of superseded work. The production interface is
code-native and the published site is where that contract is accepted.

## Asset weight

`public/visuals/` assets are sized to the slot they render into, not to their
source resolution. Two worth knowing about:

- The wordmark is only ever a CSS `mask-image` over `currentColor`, so the
  browser discards its RGB channels. It ships as an alpha-only WebP at 760px
  (the header renders 380px) rather than a 900px RGBA PNG — 45KB to 22KB.
- The business-card-derived splat is retained for the generated social share
  image only. It no longer loads in the home-page hero.

## Delivery

The mobile menu mounts when it is first opened, then stays mounted for its
closing transition. Keeping it out of the initial page load avoids downloading
hidden artwork and prefetching destinations the visitor has not asked to see.
The booking calendar reuses its time and date display formatters per time zone,
so loading a window of available slots does not construct one for every label.

Two settings look incidental and are not. Both were wrong at some point and
cost real bytes:

- `public/_headers` marks `/_next/static/*` immutable for a year. Without the
  file Cloudflare Pages falls back to `max-age=14400, must-revalidate`, so the
  fonts, stylesheet and JS chunks revalidate on any visit more than four hours
  after the last one — round trips that can only return 304, since every one of
  those filenames already carries a content hash.
- The wordmark preload in `src/app/layout.tsx` must keep its `crossOrigin`.
  Because the wordmark arrives as a CSS `mask-image`, and CSS fetches images in
  CORS mode, a preload without it is discarded rather than reused and the file
  downloads twice. Chrome reports this as "a preload ... is not used because the
  request credentials mode does not match". Verify with a single `wordmark-cream`
  entry in `performance.getEntriesByType('resource')`, initiated by `link`
  rather than `css`.

The paper grain is deliberately not preloaded: it is 480 bytes, so an early
request only competes with the fonts for no gain.

## Sources of truth

- Git owns the website, route behaviour, release history, and production assets.
- **Her print and business material is not in this repository.** Branding,
  business cards, Square booking tiles, visual concepts and the superseded-work
  archive live in `/Users/danatkinson/Documents/Work/Português com a Inês`,
  which has a `README.md` pointing back here. That folder is outside Git;
  this repository is backed up by GitHub. The split exists because Git
  repositories never live inside `Documents`, not because the work is
  separate.
- [design/README.md](./design/README.md) is the canonical visual and interaction
  contract. Read it before changing anything visual, keep it aligned with the
  code in the same change, and verify the result on the published site.
- **Booking is owned by this repository**, not by a third-party scheduler. The
  `ines-booking` Worker in `workers/booking/` and its D1 database are the source
  of truth for availability, bookings, reschedules and cancellations. See
  [docs-booking-system.md](./docs-booking-system.md).
- Square was removed in August 2026. Square does not onboard sellers in
  Portugal, so the account this site pointed at — Dan's UK account, set up as a
  test — could never have been hers.
- The saved-card, after-lesson flow passed sandbox acceptance and was activated
  in production on 11 September 2026 with a live restricted key and webhook
  secret. A new booking saves a card without charging it; the lesson price is
  charged six hours after the scheduled lesson ends, once a no-show can no
  longer be recorded. Existing direct-payment bookings
  keep their original terms. The first genuine live card setup and payment
  remain to be observed. Production
  expects live keys and fails closed if test or incomplete credentials are
  present. `docs-booking-system.md` records the activation boundary.
- The approved product display is trial lesson €20 / 60 minutes, single lessons
  at €25 / 60 minutes or €35 / 1 hour 30 minutes. Bundles are not part of the
  public launch offer. Authenticated students can save private, reusable
  recurring-rate codes supplied by Inês, one for 60-minute and one for
  90-minute lessons, only under Edit details. Booking and lesson changes
  use the saved rates automatically; sign-up never asks for a code. Grants persist
  for future recurring lessons without changing existing bookings or the €5 fees.
  The Worker's `lesson_types` table decides what is actually bookable; the
  lessons page is the copy a visitor reads. Keep the two in step.
- The booking flow can confirm up to eight selected single-lesson dates at
  once, or two weekly times starting within the same Porto Monday–Sunday week.
  The selection shares duration, location and (when recurring) repeat period.
  One card setup and one combined calendar email cover the whole selection;
  each lesson retains its individual payment and management rules.
- One 14-hour rule covers booking, moving and cancelling. Moving or
  cancelling is free while the lesson is at least 14 elapsed hours away;
  inside that window it costs €5, charged automatically to the saved card.
  Bookings made under the earlier "free until the lesson day" wording pay only
  when both rules would charge. From the lesson's start until six hours after
  it ends Inês can mark a no-show; that replaces the full lesson charge with
  €5, charged when that window closes.
  One booking can incur the late change fee only once.

## Run and verify

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Smallest relevant checks:

```bash
npm run test:booking   # focused Worker logic while iterating
npm run check:fast     # typecheck, lint and Worker tests once before push
npm run check:release  # live booking health probe and production build once at release
npm run test:flow
npm run test:request-recovery
npm run test:auth-recovery
npm run test:html-fallbacks
npm run test:state-continuity
npm run test:account-booking-recovery
npm run test:management-recovery
npm run test:selection-calendar-recovery
npm run test:release-recovery
```

`test:booking` needs Node 22 or newer but neither a server nor a network. It
covers timezone/calendar/token logic and real SQLite booking/payment state
transitions: concurrent changes, late fees, recurring prices, recovery,
webhooks, permissions and session revocation. Stripe and email are isolated.

`test:flow` expects a running static or development server. Set
`QA_BASE_URL` when it is not `http://localhost:3000`.

The recovery checks use isolated API replies at 320, 390 and 1280 px. They
cover closing a loading lesson, interrupted account forms and Google exchanges,
late mutations, keyboard focus, password reset, account replacement, and signing
out in another tab. A late response must never restore private lesson data or overwrite a
newer sign-in; the teacher workspace also closes when its session ends.
Payment recovery responses cannot redirect or reopen management after sign-out,
account replacement or leaving the page. Cancellation decisions retain dialog
focus. Unfinished card setups say `Not confirmed`, can return to booking, and
never appear as completed lessons. Teacher Meet feedback is checked for AA text
contrast against its rendered panel.

A card-return flag alone cannot confirm a booking: its returned management token
must identify a confirmed lesson. Checkout returns for weekly runs and selected
dates carry the first lesson's token too. Older bookings on an account cannot
confirm a new checkout; without that token the page asks the student to check
their lessons. Publish the Worker return-link update before the website guard.

Both recovery scripts accept `QA_BROWSER=firefox` or `QA_BROWSER=webkit` after
installing that Playwright browser. CI runs them in Chromium against the same
built export it publishes. Google credential checks use an isolated SDK when
the build has `NEXT_PUBLIC_GOOGLE_CLIENT_ID` configured, and report their count.
Meet and NIF fixtures match API paths, so they stay
isolated when the build points at a localhost Worker as well as the live URL.

`test:html-fallbacks` disables JavaScript at 320, 390, 820 and 1440 px and checks
ordinary navigation, every FAQ category, terms/privacy and the old legal links.
It also checks the enhanced FAQ and terms modal after hydration. It accepts the
same `QA_BASE_URL` and `QA_BROWSER` options and runs in the Pages workflow.

`test:account-booking-recovery` uses isolated replies at 320, 390 and 1280 px
in Chromium, Firefox or WebKit. It covers email confirmation with session
renewal, newer profile drafts and saved fields, interrupted navigation,
overlapping bookings from replaced accounts, and retrying an account refresh
after a confirmed booking. Refresh retries never submit another booking.
Verified email renewal preserves the current editor; replacing or ending a
session still clears its private views. Profile focus checks defer browser
frames and verify that opening the editor never steals later typing from the
chosen name, email or NIF field. Its 48 cases per browser run against the built
export in CI.

`test:management-recovery` uses isolated replies at the same three widths and
accepts the same browser/server options. It checks accepted individual and
recurring changes when later reads fail, disabled controls while saving,
account reload retries after moves/cancellations, stale availability replies,
payment-form retries using the original checkout, checkout returns after a
session ends, and account counts refreshed without discarding profile drafts.
Its 57 cases per browser never submit real bookings or contact payment providers.
CI runs it against the built export.

`test:selection-calendar-recovery` checks whole selections after length changes,
availability retries while adding/changing lessons, locked choices during
booking and checkout, newer time-off choices after failed saves, abandoned
teacher queues, malformed mutation acknowledgments, invalid nested read rows,
and email replies that must preserve the current session and draft.
Its 141 isolated cases per browser cover 320, 390 and 1280 px, accept the same
browser/server options, and run against the release export in CI.
Weekly skipped-date checks include the spring missing hour and show dates
without inventing a shifted time.

`test:release-recovery` covers booking destinations and browser history, malformed
password-reset and recurring-stop acknowledgments, teacher attendance replies,
booking confirmation fields, payment amounts, late-fee flags and rate-code
receipts. It verifies usable retries with isolated replies across the same
three widths and browser engines, and runs against the release export in CI.

`test:teacher-boundaries` covers mixed quarter-hour cells, click/keyboard/drag
edits, exact off-grid hours, retained form fields after failures, spring's
missing hour and both occurrences of autumn's repeated hour. Its 78 isolated
cases per browser run at 320, 390 and 1280 px, accept the same browser/server
options, and run against the release export in CI. Authentication recovery also
checks session-storage refusal and retry for password, Google and registration,
truthful password-reset/email-change success without a saved session, and
sign-in at an explicit lessons destination after an expired bearer is refused.

`test:state-continuity` uses isolated replies at 320, 390 and 1280 px. It
checks edits made during a save, overlapping name/NIF saves in both reply
orders, stale rates lookups after code saves, native modified FAQ clicks,
stacked terms/lesson dialogs, and recovery
from unreadable or malformed public, account, sign-in and teacher replies. A save only
updates its own field and never discards a newer draft. Rate codes apply to
future weekly lessons of their matching length. This check accepts the same
browser/server options and runs against the release export in CI.

## Accessibility

Every route renders the site header and footer outside `<main>`, so `banner`,
`main`, and `contentinfo` are real landmarks, and each header opens with a
`Skip to content` link targeting `#main-content`.

The focus ring is a cream, deep-blue, and coral stack rather than a single
coral outline. A coral-only ring measures 2.2:1 on the blue hero and 1.5:1 on
the lavender panels; the layered ring keeps at least one band above 3:1 on
every surface colour the site uses.

Text colours are held to WCAG AA at 390, 768, and 1440 px. `--ink` is a shade
deeper than the `--blue-deep` fill because the fill colour measured 4.42:1 as
body text on lavender.

## Motion and loading

Pages turn into one another with view transitions. Next.js remounts
`src/app/template.tsx` on every navigation, and its React `<ViewTransition>`
gives the page being left an exit and the arriving page an enter, which
`globals.css` animates: the old page recedes out of focus in about 220 ms while
the new one focuses in over about 420 ms, drifting into place over 620 ms on
desktop and 520 ms on phones. The header, the portfolio banner and an open phone
menu carry their own `view-transition-name`s, so the header holds still and the
menu recedes with its page; the nav's current line, `.site-nav__current`, is a
named element of its own and glides. `PageTurn` sets `data-page-turn`
(`forward`, `back` or `settle`) on the root while the new page commits, from the
pages' order along the nav. React commits a back or forward navigation
synchronously, so it has no view transition, and `PageTurn` gives those pages
the arrival half through the Web Animations API instead. Full page loads, such
as the nav's Booking link, recede and focus the same way through
`@view-transition { navigation: auto; types: document; }`. Navigation itself
starts immediately and `::view-transition { pointer-events: none; }` keeps the
arriving page clickable; only the named header skips clicks for the moment of
the turn. Browsers without view transitions keep the 190–240 ms dissolve. The
journey test counts the turns, and checks that reduced motion animates none.

The motion tokens are deliberately few. `--motion-spring` and
`--motion-spring-firm` are damped-spring curves sampled into CSS `linear()`,
with `cubic-bezier` fallbacks: the soft one gives about 4% for what lands or
travels, the firm one barely 0.5% for controls. `--motion-ease-out` is a long
deceleration for everything else, and `--motion-pen`, a sine ease-out, paces
whatever is written or drawn. Buttons lift on hover, shift their cut to
`--squiggle-button-shift` (`--squiggle-button-alt-shift` for outlined ones) on
the soft spring, and sink to 97% while pressed, except when disabled; the
booking journey's control grammar keeps its own radius.

The wordmark is three CSS masks over one artwork, so its colour is whatever is
painted behind it. `BrandWordmark` renders the lettering with two small windows
subtracted (`mask-composite: subtract`) and each circumflex over ê in its own
window (`intersect`); at rest the three print as one. Hovering over the header
wordmark, or focusing it from the keyboard, writes it in coral: a registered,
inheriting `--wordmark-ink` percentage carries the edge of a 105° gradient
across all three layers in 720 ms on `--motion-pen`, mixed in OKLCH so that the
wet edge runs through pink and violet, and draws it back in 400 ms. As the
edge reaches each ê, a registered `--wordmark-hat` number runs from 0 to 1 on
the soft spring and its `sin()` lifts and turns that hat; leaving resets it at
once, so leaving never tips a hat again, and a browser without `@property`, or
reduced motion, jumps straight to 1, where the arc is back at rest. The ink's
value is declared on the element, never as a `var()` fallback, which Chromium
does not repaint until the transition has ended. The header wordmark's box is
sized to the artwork's 760 × 236 ratio, so the ink crosses letters rather than
empty header and the windows sit where they were measured. `(hover: hover) and
(pointer: fine)` leaves touch screens out. A browser does not check hover
again until a view transition has finished, so a click on a written wordmark
would bring the new page's wordmark in bare and then write it a second time.
Instead, `PageTurn` holds it written, hats included, with
`data-wordmark="inked"` until a few frames after the turn. Without `@property`
it simply turns coral.

The rules under the display headings (`.editorial-rule`, the Home principles'
`.short-rule`, and the FAQ section header's `::after`, which replaced its
border at the same height) are drawn once with a `scaleX` animation from the
left on `--motion-pen`, starting when they are inserted. A page turn or a newly
chosen FAQ section therefore draws its rules again, and the principles' short
rules borrow their splats' `--land-order` so each draws as its mark settles.

Booking decisions use a 220–260 ms same-document surface transition
where supported. The account, lesson choice, calendar, detail, and confirmation
surfaces each keep their place while their own geometry and content change, so
the page no longer dissolves as one oversized snapshot. Older browsers keep the
working flow and use a small content fade instead. Orientation scrolling waits
for the surface change to settle and runs only when less than 160 px of the next
decision is visible; an already visible desktop choice does not move the page.
Interrupted transitions from a quick second choice are treated as normal input,
not as browser errors.

The little splats are the one decorative motion: each lands once, like a dab
of paint, in under a second, blooming out from its middle as a widening radial
mask while a blur sharpens and the soft spring settles its scale and turn.
`AssetMark`'s `lands` prop opts a mark in. Marks
in the first screen land from CSS alone as the page arrives; `SplatArrivals`,
in the route template, holds those further down until the reader reaches them,
and a first-screen mark only until its picture has downloaded. The landing
moves the `<picture>` inside the mark, never the mark's own box, so measured
sizes (the booking banner check) and positioning transforms are untouched. A
hold is only ever placed before a mark has been seen, and anything that fails
leaves the mark showing. A Lessons card turns its mark's box, not the picture,
a few degrees on hover or focus, so the two motions never meet. A confirmed
booking's `.booking-success` lands the lesson's own `LessonMark` in its
corner, larger and slower than the small marks; the mark crops itself with
`clip-path` and sits beneath the card's text inside an isolated stacking
context, so nothing in the card is ever clipped.

`prefers-reduced-motion: reduce` removes page turns, booking transitions,
smooth scrolling, the splat landings, the phone menu's entrance, the button
and navigation hover and press transforms, the buttons' shifting cut, the
cards' turning marks, the drawn rules, and the wordmark's writing and tipping
hats, keeping colour changes so states stay distinguishable. Splats are also
shown at rest in print and without JavaScript, and the rules in print.

Approach and lessons hero artwork is served as AVIF with a WebP fallback — the
painterly splats cost less than half as much in AVIF as they did in WebP — and
fetched eagerly, with dedicated 800 px sources for screens up to 720 px;
non-critical marks load lazily. The display font is
preloaded because every page's largest text is a Beth Ellen headline. The
booking calendar renders from this site's own JavaScript against the booking
Worker, so there is no third-party iframe to wait on.

## Booking configuration

Copy `.env.example` to `.env.local` and point the site at the deployed Worker:

```bash
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking.<subdomain>.workers.dev
NEXT_PUBLIC_GOOGLE_CLIENT_ID=          # optional; absent hides the Google button
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=    # optional; needed for the embedded card form once postpay is on
NEXT_PUBLIC_STRIPE_EXPECTED_MODE=live  # use test only with the isolated staging Worker
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=60
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
```

With no API URL the booking page degrades to its setup placeholder and sends
students to WhatsApp, rather than rendering a calendar that cannot work.

`npm run check:booking` is the release gate. It fails the build when the API is
unreachable, has no lesson types, or is still in dry-run email mode — because a
site that confirms bookings while silently sending no confirmations is worse
than one that is visibly down. No secret belongs in this static site or in any
`NEXT_PUBLIC_` variable: the Worker holds them all.

Full architecture, automatic lesson-calendar sync and Google Meet setup, and
the deployment steps are in [docs-booking-system.md](./docs-booking-system.md).

## Publication

The canonical production site is deployed to Cloudflare Pages at
`https://portuguesewithines.com/`. A minimal Custom Domain Worker redirects
`www.portuguesewithines.com` to that apex while preserving the path and query;
Cloudflare owns the generated DNS record and certificate. The
Portuguese-spelling domain `https://portuguescomaines.com/` redirects to the
canonical domain while preserving the requested path and query string.

The redirect Worker also owns `www.portuguescomaines.com`, added on
11 September 2026. Both www addresses preserve the path and query when sending
visitors to the canonical domain. DNS and certificates are managed by the
Worker's Custom Domains configuration, separately from the main website build.

**Merging to `main` publishes the site.** `.github/workflows/deploy-pages.yml`
builds once and deploys that build to Cloudflare Pages, which is what the live
domains serve. There is no GitHub Pages preview any more: it needed the root of
`dakibwa.github.io`, which went when the repository was renamed from
`dakibwa/dakibwa.github.io` to `dakibwa/portuguese-with-ines` on
17 September 2026.

This needs two repository secrets, under Settings → Secrets and variables →
Actions. Without them the publish job fails loudly rather than skipping, because
a silent skip is indistinguishable from a completed release:

- `CLOUDFLARE_API_TOKEN` — a token with the **Cloudflare Pages: Edit**
  permission on this account.
- `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard URL, or
  `npx wrangler whoami`.

To publish by hand — a local check, or CI being unavailable:

```bash
npm run deploy:cloudflare
```

Until August 2026 that manual command was the *only* way to publish, and it is
worth knowing the failure it caused. Pushing to `main` updated only the preview,
so a release could look complete from every angle that is normally checked —
commit on `main`, Actions green, the old `dakibwa.github.io` preview showing the
change — while visitors were still served the previous build. If you are ever
verifying a release here, check `https://portuguesewithines.com/` itself, not
the workflow result.

The alias is a separate Pages redirect project so it cannot accidentally serve
a duplicate copy of the site. It is not part of the workflow, since its
configuration changes only rarely; deploy it with
`npm run deploy:cloudflare:redirect`.

The `www` redirect is similarly small and changes only when the canonical host
changes. Its source and Custom Domain configuration live in
`workers/www-redirect`; validate it with `npm run worker:www:dry-run` and deploy
it with `npm run worker:www:deploy`.

The Akibwa website does not contain a copy of this build. Its Portuguese with
Inês project card and former `/portugal/` route point to the canonical site.
