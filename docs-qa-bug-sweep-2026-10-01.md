# Website bug sweep — 1 October 2026

Eleven reproducible issues were fixed locally. The final checks below passed,
and no further issues reproduced in the covered flows. These changes have not
been deployed. Publish the booking Worker before the static website: weekly
and multiple-date card returns need its updated lesson reference.

## Fixes and reproduction cases

| Issue | Reproduction | Result after the fix |
| --- | --- | --- |
| Loading lesson cannot close safely | Open a management link, close it before its request finishes, then deliver success or failure. | The dialog closes, scrolling unlocks, and the late reply cannot reopen it. Opening another lesson also keeps the correct lesson selected. |
| Expired request signs out a newer account | Start an account or protected booking request, sign in again, then return an old 401. | Only the rejected session is forgotten. The replacement session remains, and no redundant logout request revokes it. |
| Late account response restores signed-out data | Sign out while account details are loading. | The old student and lesson data stay cleared. Email confirmation and profile responses also cannot replace a newer account. |
| Learner calendar retains another tab's signed-out data | Load booked lessons, then sign out in another tab. | Private calendar markers, account data and open management actions disappear. Late cancellations and moves cannot restore them. |
| Teacher workspace stays open after another tab signs out | Load the schedule, then change or clear the session in another tab. | The workspace closes and clears its identity, lessons, drafts and pending save state. Old callbacks cannot affect a replacement account. |
| Account forms retain an abandoned request | Submit sign-in or password recovery, then switch forms or leave the page. | The new form is usable immediately. Old errors and success replies cannot alter it or overwrite a newer sign-in. |
| First Shift+Tab escapes lesson management | Focus the dialog itself, then press Shift+Tab. | Focus stays inside the dialog and cycles through its controls in both directions. |
| Card-return flag falsely confirms a booking | Open `?card=saved` without a lesson token, with an empty account, or with older confirmed lessons. | Confirmation requires the returned lesson's token and its confirmed status. Weekly and multiple-date Checkout returns now supply that token. Pending-to-confirmed transitions still succeed. |
| Abandoned Google exchange signs the visitor in | Start Google sign-in, then open password recovery or sign into another account before its reply. | Late credentials and errors are ignored. Normal Google sign-in still succeeds. |
| Late password reset overwrites a newer sign-in | Submit a reset, then navigate away or sign in elsewhere before its reply. | The reset does not replace the current session. A visitor still on the page sees truthful password-change confirmation. |
| Google sign-in cannot recover from a script outage | Fail the Google SDK download, then open the next account form after recovery. | The failed script is removed and a new download can render the button. Password sign-in remains usable during the outage. |

## Verification

- `npm run check:fast`: types, lint and 255 booking, SQLite integration,
  calendar, meeting-service, redirect and teacher-calendar checks passed.
- Static production builds passed with Google sign-in enabled and disabled.
  The QA builds use an isolated test Stripe key; they are not release artifacts.
- `npm run worker:dry-run` passed.
- `test:request-recovery` and `test:auth-recovery` passed in Chromium, Firefox
  and WebKit at 320, 390 and 1280 pixels. The configured Google build exercised
  all 15 Google cases in each engine, using an isolated SDK and API replies.
- All nine existing browser suites passed against the final export: full
  customer journey, workspace navigation, booking selection, payment recovery,
  teacher calendar, student Meet links, teacher Meet setup, student NIF and
  profile/rates. The portfolio entry check also passed.
- Published-site checks passed across 20 combinations of public pages and
  viewport widths: home, approach, lessons, FAQ and booking at 320, 390, 820
  and 1440 pixels. They checked assets, overflow, landmarks, terms disclosure,
  FAQ selection and live availability. Production health and domain redirects
  were checked through read-only requests. Desktop and mobile screenshots
  were inspected.

Both new recovery suites run in the Pages release workflow. Existing Meet and
NIF fixtures now match API paths for local and deployed builds. Payment recovery
isolates its Google-calendar request; the teacher save test explicitly controls
the in-flight response; the full journey waits for a closing FAQ animation
before measuring the next section switch.

## Scope

Authentication, email delivery, payment mutations and Google authorization use
isolated providers in the regression checks. Production browser checks made no
mutating requests. Real card charges, email delivery and authenticated production
account actions were not exercised. Passing these checks establishes the stated
coverage; it does not prove the absence of every possible defect.

Detailed local logs and screenshots are in the ignored `tmp/qa/` directory.
