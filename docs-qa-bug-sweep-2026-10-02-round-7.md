# Website bug sweep and release — 2 October 2026, round 7

Dan requested one final comprehensive sweep, fixes and publication of all
accumulated changes. This release includes the fixes recorded in rounds 1–6
and eight additional defect groups found in this round.

## Additional confirmed defects and fixes

| Defect | Result after the fix |
| --- | --- |
| Same-page Booking or Book a lesson links changed the URL while retaining the old lessons, profile or booking view; history could disagree with a reload. | Main, mobile-menu and footer booking destinations use document navigation. The requested view and Back/Forward history agree with the address. |
| An empty or false password-reset acknowledgment claimed a reset email was sent. | Only `ok: true` produces success; an unreadable reply retains the email and usable retry. |
| An empty recurring-stop acknowledgment claimed the sequence stopped or its lessons were cancelled. | Stop and bulk cancellation require successful flags and valid nonnegative counts before changing the calendar or reporting success. |
| An empty teacher no-show acknowledgment closed the lesson and claimed a €5 charge. | The reply must identify the requested booking and the intended attendance state. A refusal preserves the confirmation and retry; undo remains supported. |
| An object-valued confirmation email passed the lesson guard and crashed React. | Optional rendered strings and lesson amounts are validated before the booking, account or management view receives them. Malformed creation replies retain the booking form and retry. |
| An invalid rate-code receipt reported an object-valued lesson length and `€NaN`. | The saved receipt requires a positive integer duration and valid amount before announcing or applying the result. |
| Invalid managed fees, payment amounts or duration prices produced `€NaN` prices and payment buttons. | Management validates these amounts and flags, displays a recoverable read error and permits reopening/reloading with a valid reply. |
| A string-valued `sameDayFeeApplied: "false"` was truthy and claimed a late fee after cancellation. | Cancellation and rescheduling require an actual boolean fee acknowledgment. Financial messages follow the acknowledged value. |

The independent audit also checked delayed creation, cancellation, profile
saves, email changes, rate replies and sign-in after account replacement or
navigation. Their existing stale-response protections held up.

## Verification

- A clean `npm ci` installed the locked dependencies, including Wrangler
  4.145.0. The dependency audit reported zero known vulnerabilities.
- `check:fast` passed type checking, lint and all 255 core tests. Worker
  packaging passed its deployment dry run. The final added/updated scripts
  also passed focused lint.
- A fresh production export used the existing live public Stripe key and
  Google client ID, with the live booking API and expected Stripe mode.
  The artifact contains neither the isolated QA key nor the localhost API.
- `check:release` passed after the Worker deployment, including healthy live
  email, teacher notifications, payments and configured Google sign-in.
  Local Node fetch used its supported environment proxy setting; no network
  policy or release check was bypassed.
- All 17 customer-journey commands and the portfolio-banner check passed
  locally against the production configuration. These include the 135-case
  selection/calendar suite, 57-case management suite and 39-case account suite.
- The new release recovery suite passed 55 cases per engine at 320, 390 and
  1280 px: **165 cases across Chromium, Firefox and WebKit**. Every rejected
  mutation in the suite is followed by a valid recovery.
- Authentication recovery passed in all three engines, including **45/45
  configured Google cases** covering credential callbacks and SDK recovery.
- The independent auditor passed **72 checks** across the three engines at
  390/1280 px, including navigation/history, all eight fixes, valid retries,
  attendance undo and financial messages.
- Browser checks assert no uncaught page errors and no horizontal overflow.
  Mobile navigation and profile-rate screenshots were inspected. WebKit used
  the existing compatibility libraries; browser errors were never filtered.
- The release workflow passed every check and both build/publication jobs.
  Its final artifact identifies the release commit and SHA-256 digest
  `c1a7e281e38f8bfaca024ebc9c47224efd4a6c987ea36e3c3fd7409a0199fc71`.
- After publication, **24 live public route/navigation cases** passed at
  390/1280 px, including legacy entry points, real public availability and
  explicit booking destinations. The actual deployed client also passed all
  **55 focused recovery cases** at 320/390/1280 px, with mutation replies
  intercepted. Both live runs had zero uncaught page errors and no overflow.
  No public-acceptance check attempted a production write.
- The new canonical HTML is served with HTTP 200, the production API and the
  expected security headers. Mobile home and desktop booking screenshots were
  inspected. All three alternate domains returned a 301 to the canonical
  domain with the requested path and query preserved.

Production mutation and provider responses in browser tests were intercepted.
No test created a real account, lesson, email, card setup or charge. These
checks establish the exercised behavior, not the absence of every possible
bug or successful transactions with a real identity or card.

## Release records

- Source release: `2932632a7a14abc6af1285c78dd983251bc3f7fb`, pushed to `main`.
- Worker deployed first: `ines-booking`, version
  `64c7208d-fa8d-4a42-b6a1-f01e376a0e82`. Its health reply is healthy, uses live
  email and payments, and retains three lesson types. No schema change or
  production secret change was needed.
- Previous Worker version: `cc4209ed-d224-4b74-8aca-4ffff7951e95`.
- Website release workflow:
  [Build and publish site](https://github.com/dakibwa/portuguese-with-ines/actions/runs/37033889743).
  It tests the built export and publishes that same artifact to Cloudflare Pages.
- Previous website deployment: `61d7b61c-b09a-4b31-9673-44d1ea02ec87`.
- Website published successfully on 2 October 2026 at 16:41 UTC:
  deployment `58f5cc0b-8ec5-4221-9c19-bc154d86f4b8`, production branch `main`.
  Acceptance site: [portuguesewithines.com](https://portuguesewithines.com/).
  Public pages, booking navigation, layout, headers, API access and the focused
  regression suite passed against the live site.

The reports from earlier rounds describe their historical local verification
state. This release record tracks publication of their cumulative fixes.
No remaining defect was reproduced in the completed sweep and live checks.
