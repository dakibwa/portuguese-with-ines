# Website bug sweep — 2 October 2026, third pass

Nine additional issues were reproduced and fixed locally. This pass focused on
edits made during requests, overlapping profile saves, saved prices, native
navigation, stacked dialogs and malformed service responses. The changes have
not been deployed. The previous sweep's Worker return-link update still needs
to be published before the website.

## Fixes

| Issue | Reproduction | Result after the fix |
| --- | --- | --- |
| Saving a NIF erases a newer draft | Save `123456789`, type `248899945` before the delayed reply arrives, then deliver the first reply. | The submitted NIF becomes the saved value while the newer draft remains visible and saveable. Normalisation only changes the submitted draft. |
| Adding a rate code erases the next code | Add a 60-minute code, type a 90-minute code while waiting, then deliver the first reply. | Only the submitted code clears. The next code remains ready to add; both saved rates appear after its own success. |
| Overlapping profile saves restore stale fields | Save a name and NIF independently, preparing the first response before the second save. Deliver the responses in reverse order. | Each request sends and applies only its own field. Both reply orders preserve the saved name, NIF, account bar and reopened editor. |
| An old rates lookup removes a newly saved price | Delay either the booking workspace's or editor's rates GET, redeem a code, then return the earlier empty rates snapshot or lookup failure. | Older lookup successes and failures cannot replace the saved rates or restore a stale warning. The next weekly confirmation keeps the newly agreed price. |
| Ctrl-click changes the current FAQ instead of opening a tab | Ctrl-click the Payment category after hydration. | Modified clicks retain native navigation; a new tab opens the payment category and the original page stays unchanged. Ordinary clicks still select and focus the category in place. |
| Escape closes both terms and lesson management | Open `/book/?manage=fixture#privacy` and press Escape in terms. | Only the native terms dialog closes. Lesson management and its token remain until separately dismissed. |
| Stacked dialogs lose scroll and keyboard ownership | With terms above lesson management, close terms. Previously the remaining dialog unlocked the body, Tab reached the page header, and closing the last dialog left scrolling locked. | Overlays hold independent shared scroll locks. Focus returns within the remaining dialog. Closing the underlying private dialog on cross-tab sign-out also preserves the public terms dialog and releases scrolling after the final close. |
| Malformed API replies crash screens or look like empty data | Return HTTP 200 HTML, `null`, missing fields or invalid lesson/slot data. Public booking crashed; account loading looked empty; teacher hours produced `e is not iterable`, while malformed bookings appeared empty. | Public, account and teacher clients reject unreadable replies and required invalid shapes. Booking retains its contact route; learner and teacher screens support retry while preserving the session. Sign-in rejects missing student/session data. Lesson-type errors persist independently of availability requests. |
| Rate-code copy promises the wrong prices | Open the profile code disclosure, which said it sets the price of all future lessons. | The note specifies future weekly lessons of the matching length. Single/trial lessons and fees retain their existing prices. |

## Verification

- Type checking, lint, whitespace checks and the final static build passed.
- All 255 booking, real-SQLite integration, Google Calendar, meeting-service,
  redirect and teacher-calendar core checks passed.
- New `test:state-continuity` passed in Chromium, Firefox and WebKit at 320,
  390 and 1280 pixels, including invalid public/account/sign-in/teacher replies
  and recovery through each screen's own retry action or a reload.
- `test:request-recovery` passed in all three browsers at those widths against
  the final build. Stale replies, session replacement, cross-tab sign-out,
  pending lesson status, dialog focus and payment redirects remain covered.
- The full customer journey, profile rates, student NIF, teacher calendar and
  authentication recovery suites passed against the final build. This build
  has Google sign-in disabled, so its optional Google credential/SDK cases
  were not exercised. No live provider authorisation was attempted.
- Workspace navigation and HTML fallback checks passed after the navigation,
  FAQ and dialog changes. Desktop and 320-pixel profile screenshots were
  inspected; the new price note wraps without clipping or overflow.
- Builds were copied into immutable static directories before browser testing.
  The browser harness settles Next's background link prefetch before hard
  reloads, avoiding interrupted prefetch errors in WebKit. No browser errors
  are filtered out by the new regression suite.

No reproduced failure remains in the covered flows. These checks cover their
specified states and do not establish that every possible website bug is absent.

## Scope and artifacts

Account changes, teacher actions and payments use isolated fixtures. No real
accounts, emails, bookings, Google authorisations or charges were created.
The static builds use an isolated test Stripe key and are QA artifacts.

New `test:state-continuity` runs in the Pages release workflow against the
export that will be published. It supports `QA_BASE_URL` and `QA_BROWSER`, with
Chromium, Firefox and WebKit at 320, 390 and 1280 pixels. It checks both profile
save orders, newer drafts, both stale-rates lookup paths, native FAQ tab opening,
three stacked-dialog dismissal paths, invalid responses and subsequent recovery.

Detailed logs are under the ignored `tmp/qa/pass3-*` files. The original probes
are `pass3-before.log`, `pass3-rate-read-before.log`,
`pass3-rate-parent-before.log` and `pass3-private-api-before.log`.
Screenshots are under `tmp/qa/state-continuity/` and `tmp/qa/profile-rates/`.
