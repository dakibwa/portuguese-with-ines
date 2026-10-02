# Website bug sweep — 2 October 2026, round 4

Seven additional bugs were reproduced and fixed locally. The changes are
undeployed. This pass focused on email confirmation, concurrent profile
updates, interrupted navigation and booking recovery.

## Confirmed bugs and fixes

| Bug | Reproduction | Corrected behaviour |
| --- | --- | --- |
| Email confirmation restores older profile values | Delay email confirmation, save a new name and type a NIF or another email draft, then deliver the earlier student snapshot. | Confirmation applies the verified email. Independently saved fields and newer drafts remain intact and saveable. Replies with and without a renewed session are covered. |
| Email session renewal closes the editor | Return the current Worker's renewed session while Edit details is open. | The verified renewal preserves this account's editor, drafts and success notice. A replaced account or sign-out still clears private views. |
| An abandoned email request changes the next page's URL | Start confirmation, navigate through the site's FAQ link, add a query/hash there, then finish the request. | The emailed token is consumed before waiting. The next page keeps its own URL and feedback. Successful confirmation still stores the renewed session when the original page has been left. |
| A delayed account reload makes a saved field appear unsaved | Return to lessons to start a reload, save a name or NIF while its earlier snapshot waits, then deliver that snapshot. | Reloads cannot restore profile values from before a successful save. The saved field remains saved in the reopened editor. Older requests and requests from an unmounted account are ignored. |
| Initial booking creation redirects after navigation | Delay the booking POST, navigate to FAQ, then return a hosted checkout URL. | Creation replies and failures belong to the active booking page and session. An abandoned reply cannot redirect the current page to Stripe. |
| An old booking unlocks a new account's pending submission | Start a booking, replace the session, start the replacement account's booking, then complete the first POST. | The older request cannot reset the replacement request's busy state or expose another submit button. Both success and failure reply orders are covered. |
| A failed account refresh raises an unhandled error after booking | Confirm a booking, then return 503 from the subsequent account GET. | The confirmation remains visible. A recoverable account warning offers Try again, which reloads the calendar without another booking POST. Background account refreshes handle errors throughout the booking workspace. |

## Verification

- `npm run check:fast` passed: types, lint and all 255 booking, SQLite,
  Google Calendar, meeting-service, redirect and teacher-calendar core checks.
- The final static build and whitespace checks passed. Static exports were
  copied into immutable QA directories before browser testing.
- All 117 new account/booking recovery cases passed: 39 each in Chromium,
  Firefox and WebKit, at 320, 390 and 1280 pixels against the final export.
- The full customer journey, request recovery, state continuity,
  authentication recovery, teacher calendar, student NIF and profile-rate
  suites passed in Chromium against the final export.
- Mobile and desktop screenshots of the preserved profile editor and the
  post-booking account warning were inspected. The warning and retry action
  wrap within the confirmation; profile drafts and their save state remain
  visible. Browser checks also reject horizontal page overflow.
- Google sign-in is disabled in this local build. Authentication recovery
  reports zero of its 15 optional configured Google SDK cases; no provider
  authorisation was attempted.

The new `test:account-booking-recovery` suite exercises 39 isolated cases per
browser at 320, 390 and 1280 pixels. It covers the current Worker's renewed
session and older replies without it, newer email drafts, name/NIF reload
races, successful and failed replies after navigation, both outcomes of the
older account's booking, and recovery without duplicate submission. It runs
in the Pages workflow against the export selected for publication.

One initial layout failure came from a test reference longer than the Worker
generates. The fixture now uses valid `PT-` references with six permitted
characters, including wide letters. It required no website layout change.
Mobile navigation uses the site's menu. No browser errors are filtered out.

## Scope and artifacts

Account changes, teacher actions and booking/payment replies use isolated
fixtures. No real accounts, emails, bookings, authorisations or charges were
created. Checkout navigation is intercepted locally. This round changes the
website client; it makes no further Worker changes. Earlier local Worker
fixes still need to be released before the website.

The QA build uses an isolated test Stripe public key and is not a deployment
artifact. Detailed evidence is under the ignored `tmp/qa/pass4-*` logs.
Original failures are recorded in `pass4-before.log` and
`pass4-booking-session-before.log`. Screenshots are under
`tmp/qa/account-booking-recovery/`.

These checks establish the behaviour of their covered states; they do not
prove that every possible website bug is absent.
