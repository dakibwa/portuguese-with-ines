# Website bug sweep — 2 October 2026

Seven additional issues were reproduced and fixed locally. The verification
below passed, with no remaining failures in the covered flows. These fixes and
the preceding sweep's changes have not been deployed. The earlier Worker
return-link change still needs to be published before the website.

## Fixes

| Issue | Reproduction | Result after the fix |
| --- | --- | --- |
| Unconfirmed lessons look booked | Open a direct management link whose booking is `pending_payment`. Include a held recurring lesson and an old hold whose date has passed. | The dialog says `Not confirmed`, explains checkout, and offers booking again. It has no confirmed-lesson change or recurrence controls. Held lessons are excluded from completed history and booked calendar markers. API types now include the pending state. |
| Cancellation loses focus | Open a lesson, choose `Cancel`, or return with `Keep lesson`. The clicked control is removed as the decision changes. | Focus moves to the current dialog. Tab and Shift+Tab remain inside its controls. The same focus reset applies to recurring decisions. |
| Abandoned payment request redirects or reopens management | Start payment recovery, then sign out in another tab, replace the account, or use browser Back to leave. Deliver the old successful or failed response. | Old responses cannot redirect to Stripe or reopen an error dialog. Current lesson and late-fee recovery still follow valid, isolated Stripe destinations. Management requests are invalidated on unmount as well as account changes. |
| Meet warnings have insufficient contrast | Open the teacher workspace with Google Meet unconfigured, disconnected, or failing. | Warning and error text has 4.78:1 contrast on its rendered lavender panel, up from 4.25:1. A regression checks the computed foreground and background colours. |
| FAQ categories are inaccessible without JavaScript | Disable JavaScript and follow a payment or rescheduling FAQ link. Most categories were permanently hidden. | All seven categories are present and native disclosures work by keyboard. Hydration enhances the document to show the selected category. |
| Mobile navigation is inaccessible without JavaScript | Disable JavaScript at mobile/tablet widths. The ordinary navigation was hidden and the menu button could not open. | Ordinary navigation links remain visible at every tested width. Inactive script-dependent menu controls are hidden. |
| Terms and privacy are inaccessible without JavaScript | Disable JavaScript and follow the footer or an old legal-page link. The only policy text was inside a closed dialog. | The shared policy content is readable in the booking document. Footer and legacy links reach the correct HTML anchors. With JavaScript enabled it becomes the existing modal, without duplicate IDs or visible fallback content. |

## Verification

- Type checking, lint and a static production build passed. The build uses an
  isolated test Stripe key and is a QA artifact, not a release artifact.
- 255 automated booking, real-SQLite integration, Google Calendar,
  meeting-service, redirect and teacher-calendar checks passed.
- Expanded `test:request-recovery` passed in Chromium, Firefox and WebKit at
  320, 390 and 1280 pixels. New cases cover decision focus, pending lessons and
  history, delayed payment successes/failures after account changes, browser
  Back during payment recovery, and normal lesson/fee payment redirects.
- New `test:html-fallbacks` passed in all three browsers at 320, 390, 820 and
  1440 pixels. It checks five public pages, all FAQ categories and native
  keyboard disclosures, footer terms, three legacy legal routes, overflow,
  and the enhanced FAQ/modal behaviour after hydration. It runs in the Pages
  release workflow.
- The full customer journey, teacher Meet setup and payment recovery browser
  suites passed. The journey used `localhost:3000`, which matches the local
  Worker's CORS allow-list.
- An axe-core scan found no automated WCAG violations across 33 hydrated
  public, account, teacher and dialog states at 390 and 1440 pixels after the
  fixes. JavaScript-disabled states were covered by the native browser checks,
  rather than that scanner.
- The published site passed read-only checks across 20 page/viewport
  combinations. Live Worker health reported ready, and both legacy domain
  aliases preserved the tested path and query in their 301 redirects.
- Desktop/mobile Meet feedback and HTML fallback screenshots were inspected.
  Website builds were copied into separate static directories so rebuilding
  could not change a browser test's assets midway through a run.

## Scope and artifacts

Account and payment regression cases use isolated fixtures. No production
accounts, emails, bookings, Google authorization or card charges were created.
The published-site check made no mutating requests. Real provider delivery and
authenticated production account actions were not exercised.

The automated accessibility scan covers its selected rules and states; passing
it does not establish full accessibility conformance or prove every possible
bug is absent. No additional issue remained reproduced in this sweep's covered
flows.

Detailed logs are in the ignored `tmp/qa/oct2-*` files. Browser screenshots are
under `tmp/qa/html-fallbacks/`, `tmp/qa/meet/` and `tmp/qa/production/`.
