# Website bug sweep — 2 October 2026, round 9

Dan asked for another pass. This sweep concentrated on background work
interleaving with ordinary browser actions, production database limits, and
pointer/keyboard ownership in dialogs. Confirmed cases use real local SQLite
and D1 transactions or browser interactions with isolated API/provider replies.

## Confirmed defects and fixes

| Defect | Verified behavior after the fix |
| --- | --- |
| A nightly extension planned before a successful sequence move added lessons at the old weekly time and overwrote the moved recipe's bookmark. | Each occurrence and its considered-week bookmark commit together against the current full recipe and bookmark. Stale jobs stop; the next sweep extends the new schedule. Overlapping jobs cannot reverse the winning bookmark or duplicate lessons. |
| Stop-and-cancel read its cancellation set before ending extension, missing lessons committed by a nightly job in between. | The recipe ends before the cancellation read. A lesson committed first is included, and an already-planned extension cannot add another afterward. Stopping without cancellation retains the existing lessons. |
| An ongoing booking awaiting its first card setup could gain a confirmed, scheduled occurrence during the nightly sweep. | Initial empty recipes and pending card-setup runs wait. A real twelve-held-lesson creation around the nightly window stays entirely held until its ordinary confirmation completes. |
| Moving a long ongoing sequence exceeded D1's 100 bound parameters per query. A thirteen-lesson move used 131; unrestricted local SQLite tests had accepted it. | JSON-backed materialized CTEs keep the atomic move and recipe statements at 15 and 12 bindings. The regression fixture enforces the documented D1 limit, including complete long-run moves and conflict retries. |
| A pending refund could refuse the lesson move with 409 but still change the weekly recipe when the desired dates already matched an individually adjusted occurrence. | The recipe update requires the preceding statement to have moved every planned row. Refund refusal changes neither schedule nor recipe. Each occurrence's sequence also guards an individual move away and back. |
| Completing a teacher move, cancellation or attendance change closed the dialog and removed its opener during reload, dropping keyboard focus to the page body. | Layout cleanup focuses the stable week heading through reload and errors. An ordinary close returns to its lesson. The reload action keeps that context; a later focus choice is preserved when a delayed read finishes. |
| Dragging text or a field from inside a native dialog onto its backdrop dismissed the teacher editor, terms or multi-lesson prompt. The teacher draft was lost. | The shared backdrop handler requires the gesture to begin and finish outside. Inside-origin and outside-to-inside gestures retain the dialog and draft. Ordinary backdrop clicks and Escape retain their dismissal behavior. |
| Escape on a lesson prompt above the mobile account menu also closed the menu and stole focus from the original calendar date. | The account menu leaves Escape to native or simulated modals. The first Escape closes the prompt and restores its date; a second closes the menu and returns to its toggle without a queued focus callback. |

The TypeScript configuration now excludes ignored `tmp` and `out` artifacts,
matching the existing lint ownership. Historical QA source copies cannot create
false production type errors when a component contract changes.

## Verification

- Final `check:fast` passed type checking, lint and **281 core checks**:
  101 booking unit, 92 booking integration, 16 series-extension integration,
  32 Google Calendar, 26 meeting-service, five redirect and nine teacher-calendar.
- The series suite gates competing operations before atomic D1 batches. It
  checks both race orders, partial extension, duplicate sweeps, transaction
  rollback/retry, skipped weeks, real initial card-setup creation, long runs,
  actual individual teacher moves, and a durable pending refund.
- Root's local Miniflare D1/workerd proof checked `changes()` across a batch,
  JSON materialization and actual rejection of 101 parameters. The independent
  reviewer ran the actual extracted move/recipe SQL against local D1 with
  thirteen rows: successful move, refund refusal, stale sequence refusal and
  rollback of every move when the second statement fails all passed.
- The new `test:dialog-interactions` suite passed **35 cases in each of
  Chromium, Firefox and WebKit** at 320/390/1280 px (**105 total**). It covers
  moves to the same/new day, cancellation, marking/undoing attendance,
  ordinary close, failed/held calendar reload, all three native backdrops,
  retained exact drafts, and real Tab traversal through nested account menus.
- Existing teacher-calendar, all 48 account-recovery cases, and state-continuity
  checks passed in Chromium. Independent header/footer keyboard and timetable
  cancellation/retry probes passed seven cases in each engine, plus four
  independent retained-draft checks. Mobile/desktop focus and editor screenshots
  were inspected. Pointer cancellation there is simulated; hardware interruption
  is not claimed.
- Production-configured `check:release` passed its live backend probe and built
  the final client. Worker packaging passed its dry run. Provider and private
  browser replies were isolated; no test creates real accounts, bookings,
  email, card setups, charges or refunds.
- All **nineteen CI browser suites passed** against the same export that the
  publication job deployed. The new database suite runs in `test:booking`.

## Release

The Worker was deployed first, version
`1662fd58-9017-4a25-b675-e35341964a81`. Its health probe returned 200 with no
missing configuration and live email, teacher notifications, Stripe/postpay,
and configured Google sign-in. No schema or credential changes were required.

The website is live at [portuguesewithines.com](https://portuguesewithines.com).
Source commit `3f6fa61726c007cf59c5d4515159c89be7078ccc` passed
[workflow 37050162508](https://github.com/dakibwa/portuguese-with-ines/actions/runs/37050162508):
build job `110981284697` and publication job `110987063924` both succeeded.
The `site` artifact was `11247320535`, with SHA-256 digest
`d025d3008ad8a264d12a4e34ae0f201f32f955adcc21d8b470cdcc05e71a8f1f`.
The publication job downloaded that artifact with the same digest and deployed
it at [23be7687.portuguese-with-ines.pages.dev](https://23be7687.portuguese-with-ines.pages.dev).

Cloudflare's canonical production deployment is
`23be7687-b5a7-4a2f-905f-84efa9b5eb61`, completed
`2026-10-02T19:06:40.14092Z`. Artifact publication leaves Cloudflare's commit
metadata empty; the workflow SHA, artifact digest and published URL establish
the source binding. The Worker remained on the recorded version at 100% of
traffic, with its final healthy probe at `2026-10-02T19:13:31.145Z`.

Live acceptance passed **134 checks**:

- **105 dialog cases:** all 35 cases in Chromium, Firefox and WebKit against
  the published assets, at 320/390/1280 px, using isolated private/provider
  replies.
- **24 public route/navigation cases:** eleven pages and the booking destination
  at mobile and desktop widths, with no page errors, horizontal overflow or
  production mutation requests. Live mobile booking and desktop teacher-focus
  screenshots were inspected.
- **Five backend probes:** healthy configuration, live lesson types/payment
  readiness, refusal of unsigned private-data access, canonical-site preflight,
  and absence of cross-origin access for an unrelated origin.

The three `www`/legacy-domain redirects separately returned 301 and preserved
`/book/?view=lessons`. No test created a real account, lesson, email, card setup,
charge or refund. Firefox's live run used a fresh NSS profile seeded with the
execution environment's existing trusted proxy CAs, with TLS verification
enabled. WebKit used the already-extracted browser dependency libraries. The
initial certificate/library setup failures occurred before site tests and were
retained separately from the completed runs.

The tested local client is preserved in `tmp/qa/pass9-final-export`; reproduction,
native D1, browser and release evidence is stored in the ignored `tmp/qa/pass9-*`
artifacts, including `tmp/qa/pass9-release-proof.json`. Passing the recorded
scenarios does not establish that unexercised conditions are bug-free.
