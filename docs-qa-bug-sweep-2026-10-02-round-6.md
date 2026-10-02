# Website bug sweep — 2 October 2026, round 6

Thirteen additional failure groups were reproduced and corrected locally. The
changes are undeployed. This pass covers teacher write queues, whole booking
selections after length changes, active checkout, and nested API replies. An
independent source and browser audit expanded the original six groups with
further state and acknowledgment failures.

## Confirmed bugs and fixes

| Bug | Reproduction | Corrected behaviour |
| --- | --- | --- |
| A failed older teacher save discards newer clicks | Hold the first time-off POST, click another slot on the same date, then fail the first request. Both blocks disappear and the queued choice is never sent. | The newer complete choice remains queued and is saved after the older failure, including day-off toggles. |
| Invalid teacher-save acknowledgments crash or report false success | Return `{}` or malformed exception rows from the date endpoint, or an invalid count from weekly-hours saving. | Replies must acknowledge a valid save. The known calendar remains usable; a rejected weekly-hours save retains the draft and enabled Save button. |
| A longer lesson leaves overlapping choices bookable | Choose adjacent 60-minute times, then change to 90 minutes while both starts are independently free. | Recheck the entire selection, including the teacher's gap, retain the earliest compatible times and explain removed conflicts. |
| A failed length lookup loses its pending recheck | Fail the 90-minute availability request, then refresh availability through a retry or verified session renewal. Unavailable old choices remain confirmable. | Keep the pending check and selection through failures. An in-place Try again reloads availability; a successful reply rechecks every chosen time. |
| Add/Change while retrying bypasses the selection check | After a failed length lookup, add a lesson or change one, then retry. Old saved durations can allow another overlapping start; Back can restore an unavailable backup. | Recheck the current selection on every step, update saved durations before offering more times, and validate restored choices on Back. A changed lesson remains recoverable when all other choices were removed. |
| An abandoned teacher queue writes with the old account | Hold a date save, queue another click, leave for FAQ, sign out or replace the session, then release the first write. | Unmount releases the queue and invalidates its generation. An already submitted write can finish, but no queued write starts afterward. |
| Invalid nested reads crash pages or invent skipped dates | Supply null lesson/series/exception/reconciliation rows, invalid dates, a numeric NIF, an object teacher name/lunch note, or invalid preview dates inside otherwise valid containers. | Validate the rows before rendering. Account, schedule and management reads show recoverable feedback, preserving the session; malformed preview dates cannot render an invented 1970 clash. |
| An invalid email renewal overwrites the session | Return a valid student with an object-valued renewed session. The browser stores `[object Object]` and later account requests fail. | Validate a supplied renewal token before storage. An unreadable reply leaves the existing token untouched. |
| An invalid pending address crashes the profile editor | Return `{ok:true,pending:{invalid:true}}` after Send confirmation link. | Validate the acknowledged address, show an error, and retain the entered email and active session. |
| Invalid public mutation replies break confirmation or management | Return an invalid created lesson date, null cancelled/moved lesson type, invalid series/selection dates, or a null moved sequence lesson. | Validate creation, cancellation and individual/sequence move results before replacing state or reporting success. Preserve the form/current lesson without automatically repeating the write. |
| An empty teacher-create reply discards details and claims success | Return `{}` from adding an arranged lesson. The form clears and says the student was emailed. | Require a nonempty booking reference in teacher create/move/cancel acknowledgments. Rejected creation retains the entered details and shows an error. |
| Checkout controls describe a different lesson from its hold | While submitting or while the embedded card form is open, change duration, location, booking kind, repeat or date/time. The summary changes but the original checkout still holds the previous choices. | Disable booking-affecting controls while submitting. During checkout, keep kind/location/length/repeat fixed and remove date/time Change and Add controls, so the summary describes the submitted hold. |
| The final time-picker tab shows an empty range | Have free starts before 14:00 and a last free start exactly at 14:00. The afternoon tab says “14:00 – 14:00.” | Label that single boundary start “14:00”; ordinary ranges keep their existing labels and times. |

## Verification

The complete source passed the static build, typecheck, repository lint and all
255 core checks. All 405 new selection/calendar recovery cases passed against
the complete immutable export: 135 each in Chromium, Firefox and WebKit, at
320, 390 and 1280 pixels. The requested light Firefox rerun supplied the final
Firefox result; its core repeat also passed. All final processes exited 0.

Existing suites also passed against the complete export: the full customer journey,
request recovery, authentication recovery, state continuity, teacher calendar,
booking selection, payment recovery, Meet links, teacher Meet connection,
workspace navigation, HTML fallbacks, student NIF and profile rates.
Google sign-in is disabled in this local build,
so the 15 optional configured Google SDK cases are not counted as passing.
The existing 57 management and 39 account/booking recovery cases passed against
the audited export; the subsequent source change only corrects the time-picker
boundary label. All nine focused boundary-label/retained-selection checks
passed against the complete export in Chromium, Firefox and WebKit.

Phone and desktop screenshots of rejected teacher saves, overlapping-length
feedback, the corrected boundary label and locked checkout choices were
inspected. Text and controls fit their columns without horizontal overflow.
WebKit uses installed user-space libraries and skips only the distribution
compatibility check; TLS and browser security remain enabled.

The independent max-reasoning audit passed 37 behavioral checks at all three
widths against the audited export, including pending/in-flight length lookups,
both restoration orders, every other choice removed, single/multiple/weekly
checkout controls, Back and resubmission, and explicit recovery from malformed
email/booking acknowledgments.

The new `test:selection-calendar-recovery` command runs in the Pages workflow
against its built export. Tests assert behavior and request payloads, reject
browser errors and horizontal page overflow, and count mutations to detect
unintended duplicate writes. Native segmented radios are selected through their
visible labels. On phones, another time on a selected date is chosen through
the visible time picker; the hidden date grid is never forced into use. Desktop
profile actions use their already visible account menu. Harness failures from
developing these interactions were preserved and corrected, without forced
clicks, longer timeouts, or suppressing browser errors.

## Scope and artifacts

The user requested GPT-6.1 Sol with max reasoning and Fast/priority for agents,
plus an explicit low-effort rerun. The independent max-reasoning audit and the
low-effort core/Firefox rerun use those settings. Shared defaults and GLOBAL.md
are maintained by the coordinating chat and were not edited here.

All mutation, account and payment cases use isolated replies. No real accounts,
emails, lessons, payment authorizations or charges are created. Stripe's SDK is
represented by a local fixture. This round changes website clients, with no
further Worker changes; the earlier local Worker fixes still need to precede
the eventual website release.

The immutable `tmp/qa/pass6-complete-export` includes the boundary-label fix;
`pass6-audited-export` contains the same functional fixes before that small
label correction. Both use an isolated test Stripe public key and must not be
deployed. The earlier `pass6-final-export` was retained as
the independent audit's immutable reproduction baseline. Original evidence is
in `tmp/qa/pass6-before.log` and `pass6-audit-*` probes/screenshots; final browser
results are in `pass6-final-*` and `pass6-complete-*` logs. Screenshots for the
expanded suite are under `tmp/qa/selection-calendar-recovery/`, with corrected
boundary labels under `tmp/qa/pass6-complete-visual/`.

These checks establish the covered behavior and cannot prove that every
possible website bug is absent.
