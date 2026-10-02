# Website bug sweep — 2 October 2026, round 8

Dan requested another pass after questioning why earlier broad sweeps had still
missed defects. This pass added coverage for browser storage, real concurrent
database writes, grouped calendar controls, and both daylight-saving boundaries.
Previous success applied to exercised scenarios; it did not establish that all
possible bugs had been found.

## Confirmed defects and fixes

| Defect | Verified behavior after the fix |
| --- | --- |
| Concurrent name and NIF saves both returned success, but the Worker wrote a stale full profile and undid one save in D1. | Only submitted columns are updated. Independent name/NIF and phone/timezone saves survive either request order and a subsequent account read. |
| Refused browser-storage writes were swallowed, allowing password/Google sign-in, registration and reset to claim sign-in without a usable bearer. | Sign-in explains the storage problem and permits retry. Completed registration offers sign-in; reset reports the completed password change without claiming sign-in. A completed email change explains how to sign in with the new address if renewal storage fails. |
| An account claimed after the initial lookup caused password registration or first Google sign-in to return a server error. | Registration returns the existing-account/sign-in response. Google resolves the winning account through the verified first-link rules, invalidating an unverified password's sessions and refusing another Google identity. |
| A half-hour teacher cell containing a quarter-hour start claimed the wrong start; click/keyboard/drag edited only part of the displayed cell. | Partial cells name their actual start and expose a mixed state. Cell edits include every configured start within it and the last dragged cell; untouched and off-grid windows retain their precision. |
| Teacher forms silently shifted nonexistent spring times by an hour. The Worker also offered duplicate UTC starts and shifted a weekly occurrence into a real later hour. Its skipped-week presentation then named that later time. | Forms reject missing wall times before POST and retain fields. Availability omits missing starts, weekly creation skips the nonexistent occurrence, and a whole-series move fails before writing any dates. Valid retries succeed. Skipped-week previews, confirmations and emails list dates without inventing a shifted time, including older card-setup metadata. |
| Saving an unchanged teacher appointment in autumn's repeated hour selected its second occurrence, moving it by an hour. | The original instant is preserved. Nearby edits retain that occurrence's offset when it still names the entered wall time. |
| Opening the lessons destination with a revoked/expired stored session cleared its bearer but displayed an empty calendar without sign-in. | After the account read refuses that bearer, the explicit lessons destination asks for sign-in. A retained bearer during a network interruption keeps its existing read error and retry. |

## Coverage changes

- SQLite integration tests check final stored account values after real
  overlapping requests, rather than relying only on fixture replies to the UI.
  Creation-race tests interleave a competing row at the write boundary and
  check both legitimate ownership and conflicting Google identities.
- Worker clock tests exercise actual availability and weekly planning over the
  missing hour, plus an atomic series-move refusal followed by a valid retry.
  Captured student/teacher email bodies and rendered weekly previews also
  guard the skipped-date display.
- Authentication recovery covers refused session writes for password, Google,
  registration, reset and email renewal, with recovery after the restriction
  is lifted and no second submission of a consumed confirmation/reset link.
- The new `test:teacher-boundaries` suite covers 78 cases per browser at
  320/390/1280 px: mixed/full/empty cells, keyboard/mouse/drag edits, untouched
  precision, off-grid exact editors, both forms' rejection/retry, valid winter
  and summer times, and both autumn occurrences unchanged and edited.
- The new suite runs in CI against the built export before publication.
  Documentation now describes the grouped-cell and clock-change behavior.

One calendar candidate was ruled out: the normal availability caller passes an
empty explicit session, but its shared API helper already supplies the current
session. Its existing own-hold ownership behavior remains correct.

## Verification and release

Website publication is pending. The final `check:fast` passed all 265 tests:
101 booking unit, 92 SQLite integration, 32 Google Calendar, 26 meeting service,
five redirect and nine teacher-calendar checks, plus type checking and lint.
Worker packaging passed its dry run. The final `check:release` passed the live
backend probe and production build. Production browser checks use the existing
public live configuration with provider and mutation replies isolated.
No test creates real accounts, lessons, email, card setups or charges.

Completed browser verification includes 234 teacher-boundary cases across
Chromium, Firefox and WebKit and 15 additional visual states; storage recovery
passed 15 cases per browser (45 total), with six expired-session destination
cases per browser (18 total). Full authentication recovery passed in Chromium
and WebKit; Firefox's full pass was followed by the added storage/destination
checks. Request recovery and the existing teacher/state/selection suites passed
in Chromium. The added skipped-date checks passed six cases per browser (18
total), with mobile/desktop screenshots inspected. The full selection suite
now runs 141 cases per browser in CI.

The Worker was deployed first; active version
`2455770d-8a81-446a-9b23-9bcd45e9b099` reports healthy live email, teacher
notifications, Stripe/postpay and configured Google sign-in. No schema,
credentials or production account/booking data were changed by the sweep.

The final release records and live acceptance results will be added after
publication. Passing these checks establishes the documented scenarios; real
identity/payment provider transactions and unexercised conditions remain outside
this sweep's evidence.
