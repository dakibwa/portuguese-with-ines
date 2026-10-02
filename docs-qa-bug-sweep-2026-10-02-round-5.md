# Website bug sweep — 2 October 2026, round 5

Seven additional bugs were reproduced and fixed locally. The changes are
undeployed. This pass focused on individual and recurring lesson changes,
payment-form recovery, availability races and background account refreshes.

## Confirmed bugs and fixes

| Bug | Reproduction | Corrected behaviour |
| --- | --- | --- |
| An accepted move appears unsaved when a detail reread fails | Accept an individual or recurring reschedule POST, then fail the booking-details GET. The old time and enabled save form remain visible. | The mutation's returned booking supplies the saved time and success state. A sequence occurrence kept inside the notice window retains its original time while the moved occurrences are acknowledged. |
| Management success leaves an unusable calendar-refresh error | Accept a move, cancellation, stop or bulk cancellation, then fail the account GET. Success appears alongside a raw error, with stale calendar data and no usable retry in the modal. | The successful outcome remains. A separate account warning offers Try again inside management and after Done. Retrying only reloads the account. Stopped sequences disappear from the active-series list immediately. |
| A pending move leaves its choices editable | Hold the reschedule POST, then change location/date or use Back while the submitted move is still saving. | Length, location, dates, times, week navigation and return controls are disabled until the save finishes, for both single lessons and sequences. |
| A downloaded payment library without Stripe leaves an empty checkout | Return HTTP 200 JavaScript without a Stripe global. The checkout is blank and the cached successful load prevents recovery. | Missing SDK globals and network failures show an actionable error. Try again reloads the SDK; initialization errors retry initialization. Every retry uses the existing held booking and client secret, without another booking POST. |
| A late checkout return restores the previous account's message | Gate the returned lesson's verification, sign out or replace the account, then deliver the old confirmed booking. | The session change dismisses the previous account's return state. Late successes and failures cannot restore its banner or schedule more verification attempts. |
| Older manual availability retries overwrite a newer length's times | Trigger a booking conflict, hold its 60-minute availability reload, switch to 90 minutes, then deliver the older reply. | Request versions and session checks prevent stale successes, failures and loading-state updates from replacing the current availability. Session changes reload the appropriate account context. |
| Background calendar refreshes leave the account's lesson count stale | Have meeting-link polling discover an additional booking. The parent calendar updates while View lessons still reports the earlier count. | Incoming verified lesson snapshots update counts and history without replacing profile drafts or saved profile fields. A recovered account read clears its old read error while preserving unrelated save errors. |

## Verification

- All 255 core checks passed: booking logic, real SQLite transitions,
  Google Calendar, meeting service, redirects and teacher calendar. Typecheck
  and repository lint also passed against the final source.
- The final static build and whitespace checks passed. The build was copied
  into the immutable `pass5-complete-export` before serving it for QA.
- All 171 new management/payment recovery cases passed: 57 each in Chromium,
  Firefox and WebKit, at 320, 390 and 1280 pixels against that export.
- The full customer journey, the earlier 39 account/booking recovery cases,
  request recovery, state continuity, student NIF and profile-rate suites
  passed in Chromium against the final export.
- Mobile and desktop screenshots of cancellation-refresh recovery and the
  payment-library retry were inspected. Warnings and retry controls fit within
  the modal or checkout column. The new suite rejects browser errors and
  horizontal page overflow; no browser errors are filtered out.

The new `test:management-recovery` suite runs in the Pages workflow against
the export selected for publication. It covers individual and sequence moves,
kept occurrences, pending controls, four management actions with retries both
inside the modal and after Done, both stale availability outcomes, missing
and failed SDK loads, checkout initialization failures, sign-out/account
replacement with late checkout lookup successes and failures, and background
lesson-count refreshes with profile drafts preserved. Mutation counters prove
that successful retries do not repeat bookings or management changes.

## Scope and artifacts

All mutation, account and payment recovery cases use isolated replies. No
real accounts, emails, lessons, payment authorizations or charges are created.
The Stripe SDK used by the recovery tests is a local fixture. This round
changes the website client and makes no further Worker changes; earlier local
Worker fixes still need to be released before the website.

The QA export uses an isolated test Stripe public key and is not a deployment
artifact. Original reproductions are recorded in the ignored
`tmp/qa/pass5-before.log`, `pass5-availability-before.log` and
`pass5-account-count-before.log`. Browser results are in `pass5-*` logs and
screenshots are under `tmp/qa/management-recovery/`.

These checks establish the behaviour of their covered states; they do not
prove that every possible website bug is absent.
