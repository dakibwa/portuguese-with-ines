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
  which has a `README.md` pointing back here. That folder is backed up by
  Google Drive; this repository is backed up by GitHub. The split exists
  because a `.git` directory inside the Drive-synced `Documents` tree risks
  corruption, not because the work is separate.
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
  charged when the scheduled lesson ends. Existing direct-payment bookings
  keep their original terms. The first genuine live card setup and payment
  remain to be observed. Production
  expects live keys and fails closed if test or incomplete credentials are
  present. `docs-booking-system.md` records the activation boundary.
- The approved product display is trial lesson €20 / 60 minutes, single lessons
  at €25 / 60 minutes or €35 / 1 hour 30 minutes. Bundles are not part of the
  public launch offer. Authenticated students can save a private, reusable
  duration-specific recurring-rate code supplied by Inês. Grants persist for
  future recurring lessons without changing existing bookings or the €5 fees.
  The Worker's `lesson_types` table decides what is actually bookable; the
  lessons page is the copy a visitor reads. Keep the two in step.
- The booking flow can confirm up to eight selected single-lesson dates at
  once, or two weekly times starting within the same Porto Monday–Sunday week.
  The selection shares duration, location and (when recurring) repeat period.
  One card setup and one combined calendar email cover the whole selection;
  each lesson retains its individual payment and management rules. This change
  is implemented locally and awaits preview approval and Worker/site release.
- The rescheduling rule is free before the lesson day, with a €5 fee charged
  automatically for a move or cancellation on the lesson day in Porto time.
  During the lesson window Inês can mark a no-show; that replaces the full
  lesson charge with €5 when the lesson ends. One booking can incur the
  same-day action fee only once.

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
```

`test:booking` needs Node 22 or newer but neither a server nor a network. It
covers timezone/calendar/token logic and real SQLite booking/payment state
transitions: concurrent changes, late fees, recurring prices, recovery,
webhooks, permissions and session revocation. Stripe and email are isolated.

`test:flow` expects a running static or development server. Set
`QA_BASE_URL` when it is not `http://localhost:3000`.

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

Each destination arrives with a short opacity-only dissolve: 190 ms on mobile
and 240 ms on wider screens. Navigation itself starts immediately; there is no
click interception, exit delay, overlay, movement, scale, or staggered hero
animation. Booking decisions use a 220–260 ms same-document surface transition
where supported. The account, lesson choice, calendar, detail, and confirmation
surfaces each keep their place while their own geometry and content change, so
the page no longer dissolves as one oversized snapshot. Older browsers keep the
working flow and use a small content fade instead. Orientation scrolling waits
for the surface change to settle and runs only when less than 160 px of the next
decision is visible; an already visible desktop choice does not move the page.
Interrupted transitions from a quick second choice are treated as normal input,
not as browser errors.

`prefers-reduced-motion: reduce` removes route and booking transitions, smooth
scrolling, and the button and navigation hover transforms, keeping colour
changes so states stay distinguishable.

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
