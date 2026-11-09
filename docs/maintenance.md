# Maintenance checkpoint

## Continuing the loop

The **Inês app maintenance loop** automation is enabled on an hourly schedule
in Europe/London. Its first scheduled pass is 9 November 2026 at 10:43; this
checkpoint records the setup pass performed beforehand. Scheduling lives in
the automation, rather than in a shell process that depends on this workspace
remaining alive.

At the start of each iteration:

1. Read `AGENTS.md`, the relevant product/design documentation, current main,
   open pull requests and this checkpoint on the maintenance branch. If another
   maintenance iteration is running, leave it to finish.
2. Resume the loop's `codex/maintenance` branch and pull request when it is still
   open. Check for upstream changes and overlapping work before editing.
3. Reproduce a meaningful issue, fix its cause, run the smallest relevant
   checks, and record evidence and the next area to cover. Do not manufacture
   changes when no justified improvement is found.
4. Push verified fixes to the maintenance review branch. Main automatically
   deploys the Worker and website, so the loop does not merge, deploy or apply
   production database migrations. Browser checks isolate private/provider
   replies and must not create real bookings, email, card setups or charges.

Rotate coverage through public navigation, booking/account recovery, teacher
tools, expressions/homework, authorization/input validation, dependencies,
loading/caching, animation/reduced motion, accessibility and failed requests.
For performance changes, keep the route, viewport, cache state, network/CPU
conditions and fixture data comparable before and after. Record measured
results rather than claiming a speedup from a source change alone.

**Latest checkpoint:** the fifth pass below keeps a student's unsaved homework
in place while reading terms/privacy. Continue measuring remaining booking work
and rotate into a different failure/authorization path next.

## 9 November 2026 — setup and Next.js security update

**Source baseline:** initial review at
`7deae0d6b97630d24df81b90863587d62573b60b`; integrated with current main at
`5d159bd200a4d0140ada5fc91ba4482f9f5e2933` before completing the pass. PR 189
merged the separate payment/student/expression work from PRs 185–188 while
the maintenance PR was being opened. Their changes were preserved; the
production build and isolated authentication journey were repeated against
the integrated source. The maintenance pull request is
[PR 190](https://github.com/dakibwa/portuguese-with-ines/pull/190).

### Confirmed finding and change

The production dependency audit flagged Next.js 16.3.8 with:

- [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw):
  image-optimization remote code execution on affected Linux servers.
- [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r):
  Server Actions denial of service.
- [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr):
  remote code execution in affected typed-array `use cache` functions.

Updated `next` and `eslint-config-next` together from 16.3.8 to exact version
16.4.5 and refreshed their lockfile entries. The project uses `output: "export"`
and `images.unoptimized: true`; no `use server` or `use cache` directives were
found under `src`. These advisory findings are dependency evidence, not proof
of a live-site exploit. No product, Worker, payment or database logic changed.

### Validation

- Environment: Node 24.22.1, npm 11.9.0, Playwright Chromium 149.0.7827.55.
- `npm audit --omit=dev`: **0 known vulnerabilities**, down from one vulnerable
  production package with three advisories.
- Full `npm audit`: **12 findings remain** (2 high, 10 moderate), all in
  development dependencies. Before the change it reported 13 including the
  critical Next.js package. The remaining report is not a passing audit.
- `npm run check:site`: passed before and after the dependency update on the
  initial baseline, including types,
  lint, Braces hardening, five redirect tests and 17 teacher-calendar tests.
  Both runs have the same existing `react-hooks/exhaustive-deps` warning at
  `src/components/teacher/LessonDetails.tsx:125`; no lint errors.
- `npm run build`: passed with Next.js 16.4.5 on both the initial and integrated
  source, producing all 16 static pages.
  The build used a localhost API URL and isolated QA Google/Stripe public
  placeholders; it is a test artifact, not a production-ready release.
- `node scripts/qa-auth-recovery.mjs`: passed against the initial static export
  (`QA_BASE_URL=http://localhost:3000`) and the integrated export
  (`QA_BASE_URL=http://localhost:3001`), in Chromium at 320/390/1280px. On the
  integrated build the existing script reports 6/15 configured Google cases
  (7/15 on the initial build), 5/15 storage cases and 2/6 expired-session
  destinations, along with its reset/form-switch/retry checks. These runs do
  not establish coverage of every optional configured case. Its fixtures
  isolate authentication and API replies; no real accounts or emails are made.
- `git diff --check`: passed. No Worker tests, live release probe, deployment,
  production mutations or production performance comparison were run. This
  iteration makes no loading-speed or frame-rate improvement claim.

### Next priorities

1. Review compatible fixes for high development-only Undici and Zod findings,
   then the moderate Minimatch/TypeScript-ESLint chain. The audit proposes a
   major downgrade of `eslint-config-next` for part of that chain; assess the
   actual dependency constraints rather than applying `npm audit fix --force`.
   Keep the existing Braces mitigation verified.
2. Capture reproducible cold/warm loading and interaction baselines on public
   pages and the booking workspace, then target the largest measured delay.
   Use isolated booking replies, fixed data and matched desktop/phone settings;
   account for the deliberately retained page-turn, splat and wordmark motion.
3. Continue authorization and failed-request review in one focused area. Check
   the newly merged student/payment/expression changes and any open PRs to
   avoid duplicate fixes.

## 9 November 2026 — development dependency security

**Source baseline:** maintenance head
`1beeb75801646dd8b58058319f4ab7b51531f25b`, integrated with main at
`e530e0cc328684936dc0aea97a05c2b549344f06`. Main's weekly-run and card-page
changes were retained. PRs 193 and 194 contain separate student-card and
weekly-run UI work; this pass does not edit those areas. Continue in
[PR 190](https://github.com/dakibwa/portuguese-with-ines/pull/190).

### Confirmed findings and changes

The full audit reproduced the checkpoint's 12 findings: two high and ten
moderate, all in development dependencies. The existing production audit
remained clear. Updated only the affected tools and their dependency chains:

| Package | Before | After | Reason |
| --- | --- | --- | --- |
| Wrangler | 4.151.1 | 4.158.0 | Selects the patched Miniflare/Undici chain within the existing major. |
| Miniflare | 5.20261012.1-beta | 5.20261104.0-beta | Wrangler's selected dependency. |
| Undici | 7.29.1 | 7.30.1 | Fixes the reported HTTP/TLS, redirect, parser and buffering advisories. |
| Zod | 4.4.3 | 4.6.7 | Fixes oversized constrained-collection memory exhaustion, GHSA-mrhx-c7xc-m3w5. |
| TypeScript-ESLint's Minimatch | 10.2.5 | 11.0.5 | Fixes glob-parts amplification, GHSA-g3hv-75wg-m249. |

The Minimatch advisory covers all published 10.x versions. Instead of the
audit's suggested downgrade to Next's 15.x ESLint configuration, a scoped
override replaces only `@typescript-eslint/typescript-estree`'s Minimatch.
Its consumer calls the exported `minimatch` function with `{ dot: true }`;
the actual parser path was checked before and after. Other ESLint consumers
keep unaffected Minimatch 3.1.5. Revisit the override when the parent supports
a patched version in its declared range.

Raised the manifest's Wrangler minimum to `^4.158.0` and changed the preview
workflow's explicit CLI pin from 4.145.0 to 4.158.0. Leaving that pin untouched
would still install an older tool outside the reviewed project lockfile.
Next and its ESLint configuration remain at 16.4.5, and the source-checked
Braces mitigation remains in place.

### Validation

- Full `npm audit`: **0 known vulnerabilities**, down from 12. The full report
  includes the production dependency tree, which remains clear.
- A fresh `npm ci --no-audit --no-fund`: passed with the scoped override and
  existing postinstall Braces hardening, confirming the lockfile installs.
- `npm run lint`: passed with zero errors and the existing ref-cleanup warning
  in `LessonDetails.tsx`, now at line 209 following upstream changes.
- `node scripts/harden-braces.mjs --check`: passed.
- A temporary comparison probe exercised six dot-aware glob cases and the
  actual TypeScript-ESLint `projectService.allowDefaultProject` path using both
  the old 10.2.5 and replacement 11.0.5 packages. Both produced the expected
  matches and a parser AST backed by a TypeScript program. The probe is scratch
  validation, not an additional permanent suite.
- `WRANGLER_SEND_METRICS=false npm run worker:dry-run`: passed with Wrangler
  4.158.0, bundling the current booking Worker (535.28 KiB, 119.27 KiB gzip).
  Wrangler confirmed `--dry-run: exiting now`; no Worker was uploaded or
  resource mutated. This establishes packaging compatibility, not live runtime
  behavior.
- No product or Worker logic was authored in this pass, and no UI or browser
  journey changed. Local release builds, live probes and the full journey
  suite were not rerun for development-tool updates. No loading-speed or
  frame-rate improvement is claimed.
- `git diff --check`: passed.

### Next priorities

1. Capture matched cold/warm loading and interaction measurements on public
   routes and the booking workspace. Choose the highest-impact observed
   bottleneck; preserve the deliberate motion and use isolated API replies.
2. Review one failed-request or authorization path, accounting for PRs 193/194
   and any newer work before choosing files.
3. Remove the scoped Minimatch override when upstream TypeScript-ESLint can
   select a patched dependency itself; keep audits and Braces hardening checked.

## 9 November 2026 — defer the optional painter during booking

**Source baseline:** maintenance head
`673c49b22a5ba661dfdf783b11cf26068b6fadbd`, integrated with main at
`2e1712a7657a020f3778e501ad96e172fb7c17ba`. Main's student notes and weekly-run
work was retained. The final source also preserves main's later documentation
update at `1d3a24330aa4dcf00179643344c9c210b356a366` from PR 196; only
`AGENTS.md` and `design/README.md` changed there, after the timed samples.
Continue in [PR 190](https://github.com/dakibwa/portuguese-with-ines/pull/190).

### Confirmed finding and change

A fresh signed-out `/book/` load downloaded the optional student-expression
painter even though the gift only mounts beside a signed-in student's lesson
overview. The initial network record included its 43,047-byte compiled chunk.
Changed the import to use the calendar's existing deferred-component loader.
The gift and painter now load when the lesson overview needs them, with the
same quiet failure behavior as the gift's existing failed API reads. Booking,
the expression painting, and the accepted motion remain intact.

Extended the existing expression-translations journey so its first student
visit starts from the embedded gift in `/book/?view=lessons`, then checks the
full `/idioms/` page on return. Its approval assertion exposed a timing-dependent
strict-selector failure: the success announcement and a concurrent loading
announcement both have `role="status"`. The assertion now selects the approval
announcement by its text; the subsequent count/content checks still verify
that review completes.

### Matched measurements

Three fresh-browser-context cold loads per viewport, before and after, in
Chromium 149.0.7827.55. Both static exports used the same isolated API replies,
Porto timezone, 9 November 2026 at 09:00 business date, 900px viewport height,
4× CPU slowdown, 1.6 Mbit/s download and 80ms simulated request latency. The
date shim preserves real browser performance APIs. No build or other browser
test ran concurrently with the timed samples.

| Metric | Phone, 390px: before → after | Desktop, 1280px: before → after |
| --- | --- | --- |
| Requested JavaScript body bytes | 692,716 → 647,516 | 710,977 → 665,777 |
| Gzip size of those JS files, level 6 | 211,110 → 194,155 | 217,767 → 200,812 |
| Median time to first enabled calendar date | 5,863ms → 5,629ms | 5,864ms → 5,625ms |
| Median observed LCP | 2,348ms → 2,344ms | 2,356ms → 2,340ms |
| Observed CLS | 0.0331 → 0.0331 | 0.0127 → 0.0127 |

The repeatable payload reduction is **45,200 bytes**, about 6.4–6.5% of the
requested JavaScript, or **16,955 bytes (16.6 KiB) at gzip level 6**. The
expression chunk is absent from the signed-out network record after the fix.
The calendar became ready about 235–240ms sooner in this local throttled
profile. LCP and layout shift are effectively unchanged. The long-task
indicator varied (phone median 117 → 136ms; desktop 117 → 102ms), so this pass
does not establish smoother animation or reduced main-thread blocking.

Limits: the local static server serves uncompressed bodies; the gzip totals
are computed file sizes, not observed Cloudflare transfer sizes. Real-world
latency and cache behavior are not established by this profile. API interception
also forces HTTP asset transfers during the same-context repeat navigations,
so those repeat samples are excluded from cache-performance claims. Initial
samples using Playwright's test clock were discarded because it replaced the
performance APIs; only the corrected samples above are used.

### Validation

- Baseline and changed production export builds passed with the same isolated
  localhost API and QA public configuration. These builds are profiling
  artifacts, not production releases.
- Focused ESLint of `BookingCalendar.tsx` and `qa-expression-translations.mjs`
  passed; `git diff --check` passed.
- The updated existing expression-translations journey passed at 390/1280px:
  the student paints the embedded gift and sends a translation, Inês approves
  it, and the approved text appears without a name on the full expression
  page. Student form screenshots at both widths were inspected.
- A scratch failure probe blocks the actual optional expression JS chunk at
  390/1280px. The lesson overview remains visible with no nonempty alert or
  page error. Private/provider replies are fixtures and mutations are refused.
- Timed visitor loads report no page errors or horizontal overflow. All API
  calls in the profile are isolated GETs. No production mutations, Worker
  changes, database migrations or deployments were performed.

Profiling code and raw samples are scratch artifacts under
`/workspace/scratch/ines-pass3-*`; the durable method and results are recorded
above. The focused journey remains the permanent regression coverage.

### Next priorities

1. Profile the remaining booking JavaScript and main-thread work, including a
   real date/time selection, with comparable fixtures. Measure the dominant
   delay before splitting or changing another component.
2. Measure warm-cache behavior without browser request interception; the
   current repeat-navigation samples do not establish it.
3. Rotate into one failed-request or authorization path, checking current main
   and open PRs first. Revisit the scoped dependency override when supported
   upstream.

## 9 November 2026 — early request failures and account retry

**Source baseline:** maintenance head
`5963c3be1de5c2774b1f66506ff079de8d0f1585`, integrated with main at
`b7209cffd5c47858678c6daf86a2928bc9eef144`. Main's motion, loading-placeholder
and teacher-banner work was retained. PR 197 is a separate student-dashboard
redesign; its files were left alone. Continue in
[PR 190](https://github.com/dakibwa/portuguese-with-ines/pull/190).

### Confirmed findings and fixes

1. **Early network failures escaped before hydration.** `/book/` starts
   availability or saved-session account requests from its HTML. If the
   connection failed before app scripts loaded, the parked promise had no
   rejection handler. Holding the scripts and aborting that isolated request
   reproduced an unhandled `Failed to fetch` error in all four combinations of
   signed-out/signed-in and 390/1280px.
   The bootstrap now attaches an immediate rejection handler but returns the
   original promise. The app therefore still sees the failure and shows its
   ordinary retry UI; it is not turned into a successful or empty response.
   The same four-case probe now reports zero unhandled rejections/page errors.
2. **A successful account retry could leave an empty workspace.** With a saved
   session but no reusable account snapshot, a failed initial `/me` left the
   default destination unresolved. `Try again` recovered the student but never
   selected the lesson overview. The regression reached a blank account region
   after the warning disappeared. The first successful retry now settles only
   the unresolved `choose` state to `lessons`. Explicit booking destinations
   and a view chosen while waiting retain their state.

Both fixes stay in the frontend; API authorization, booking/payment writes and
session storage semantics are unchanged. The helper starts the same early
request and keeps its original promise; the regression confirms one failed
target request before scripts are released.

### Validation

- The existing `qa-selection-calendar-recovery.mjs` journey now has six focused
  bootstrap cases: signed-out availability failure, default saved-session
  account failure, and explicit-booking saved-session failure at 390/1280px.
  Each holds app scripts, lets the early request fail, checks for no premature
  page error, releases hydration, verifies the normal warning/session, then
  recovers through `Try again` into the intended calendar.
- `QA_BASE_URL=http://localhost:3000 node scripts/qa-selection-calendar-recovery.mjs`:
  **53 isolated Chromium cases passed**, including those six and the existing
  phone selection/teacher recovery cases. All private/provider replies and
  mutation responses were fixtures; no real account, lesson, email or payment
  was created.
- `npm run typecheck` and focused ESLint of the booking page, calendar and
  affected journey passed. `git diff --check` passed.
- Tests used `next dev` with localhost API/QA public configuration. No release
  build, live probe, Worker test, database migration or deployment was run.
  Next regenerated its managed AGENTS heading; that formatting update is kept
  as its existing instruction requests. The development-only `next-env.d.ts`
  path rewrite was restored after stopping the server.

The formatter investigation did not establish a significant interaction
bottleneck, so no formatter refactor was made. This is a failure-recovery pass;
it makes no additional loading-speed or animation-smoothness claim. Scratch
before/after evidence is under `/workspace/scratch/ines-pass4-*`.

### Next priorities

1. Measure a real date/time selection and remaining main-thread work before
   changing another rendering or formatting path. Obtain warm-cache evidence
   without browser request interception if investigating repeat visits.
2. Rotate into one separate authorization or failed-request path, preserving
   the current student-dashboard work and checking for newer PRs first.
3. Keep the scoped dependency override under review until upstream supports
   the patched range directly; audit when dependency state changes.

## 9 November 2026 — read terms without leaving unsaved homework

**Source baseline:** maintenance head
`20c8fa7175b119baeabb2f108d7a2f93752bde0f`; main remains at
`b7209cffd5c47858678c6daf86a2928bc9eef144`, already incorporated. Continue in
[PR 190](https://github.com/dakibwa/portuguese-with-ines/pull/190).

### Confirmed finding and fix

Opening homework from `/book/?view=lessons`, typing an unsaved answer and
following the footer's **Terms & privacy** link caused a document navigation
to `/book/#terms-privacy`, leaving the worksheet. The policy handler had
already prevented navigation and opened its modal, but the homework's
capture-phase save-before-navigation handler ignored `event.defaultPrevented`
and followed the link anyway.

The homework handler now respects an already-handled click. Reading the notice
keeps the worksheet, URL and draft unchanged, without an answer-save request.
An ordinary site link still saves before leaving, and a failed save still
retains the draft.

PR 197 is actively restructuring the same student view. Its current patch
retains this navigation handler unchanged. This fix is limited to that handler
and additive journey assertions; a detached three-way apply check against PR
197 head `159075a3a28581a5aba74cb911b84a158bb13cc6` applied both files cleanly.
That check establishes patch compatibility, not runtime validation of the
unmerged redesign.

### Validation and coverage

- Extended the existing `qa-homework.mjs` journey at 1280/390px. After typing
  an unsaved answer it opens the actual policy dialog, verifies the same URL
  and zero additional answer writes, closes the dialog, checks focus returns
  to its opener and verifies the draft remains editable/unsaved.
- Before the fix the new assertion failed: the actual URL became
  `/book/#terms-privacy` instead of `/book/?view=lessons`.
- `QA_BASE_URL=http://localhost:3000 node scripts/qa-homework.mjs`: passed
  after the fix on desktop and phone. The same journey still covers explicit
  saves, reload recovery, student submission, private automatic marks, teacher
  review/approval, returned feedback, printing, a refused save that keeps the
  draft, and ordinary site navigation that saves before leaving. API/provider
  responses are isolated fixtures; no real student work or paid AI calls were
  used.
- `npm run typecheck`, focused ESLint of the student homework component and
  its journey, and `git diff --check`: passed.
- Source review of the homework Worker path checked current-session gating,
  published-only responses, matching homework/booking ownership and guarded
  progress writes. No Worker change was justified, so its integration suite
  was not rerun; this source review is not a complete security assessment.
- Validation used `next dev` with localhost API/QA public configuration.
  The development-only type-path rewrite was restored after stopping it. No
  release build, live probe, database migration or production deployment was
  performed. This pass makes no new speed or animation-smoothness claim.

Before/after logs are in `/workspace/scratch/ines-pass5-homework-*.log`.

### Next priorities

1. Profile an actual booking date/time selection before changing more rendering
   work; measure repeat visits without interception if investigating caching.
2. Recheck current main and PR 197 before another account/homework change.
   Rotate to a separate failure or authorization path rather than overlapping
   the student redesign.
3. Revisit the scoped dependency override when its upstream range changes;
   rerun audits when dependency state changes.

## 9 November 2026 — reject malformed calendar horizons

**Source baseline:** maintenance head
`7982b604d03de973a56176d5f6374e34c191936b`, integrated with main
`28b45765d27a76730522ee9626ee473d11f5439a`. Main has no maintenance log yet;
the preceding checkpoints remain in [PR 190](https://github.com/dakibwa/portuguese-with-ines/pull/190).
Only that maintenance PR was open and no competing maintenance process was
observed. The accepted student-management and tutor-platform changes are
preserved.

### Confirmed finding and fix

The availability reader checked its slots but trusted `horizonDays` before
caching it. An otherwise valid HTTP 200 reply with `horizonDays: "broken"`
silently produced an empty calendar saying **No free times in these weeks**,
without a retry, despite containing a free slot. A value of 100,000 caused
thousands of calendar weeks to be built on the browser's main thread.

The reader now rejects a provided horizon unless it is a whole number from
1 through 365, matching the existing Worker settings limit. The normal
unreadable-reply notice and retry appear, and the rejected entry is removed
from the availability cache. A reply without a horizon keeps the existing
display fallback. Booking rules, payment authorization and visual styling
are unchanged.

### Comparable measurements

Local Chromium 149, warmed Next development server, 4× CPU slowdown,
390/1280×900 viewports, reduced motion and the same gated localhost responses.
Only `Date` was frozen; performance clocks remained real. The browser journey
had finished before these matched runs. Each numeric case used three fresh
contexts per viewport before and after, with identical slot data and response
release timing; the sole source difference was this validation guard.

| Viewport | 100,000-day reply: median longest browser task, before → after | Response release to visible result, before → after |
| --- | --- | --- |
| 390px | 1,789 → 182ms | 1,848 → 241ms |
| 1280px | 1,621 → 197ms | 1,672 → 251ms |

Before, the oversized reply rendered an available calendar after doing the
unnecessary work; after, it produces a recoverable error. The nonnumeric reply
had no usable date or retry within the three-second observation window before;
after, the notice/retry appeared in 275ms on phone and 246ms on desktop.
The healthy 84-day control's median visible-result timings were 242 → 227ms
on phone and 252 → 263ms on desktop. Those mixed control results do not
establish a normal-load improvement. These measurements describe local error
handling; no production load-speed or animation-smoothness claim is made.

### Validation and coverage

- Extended `qa-selection-calendar-recovery.mjs` with four cases: nonnumeric
  and excessive horizons at 390/1280px, each retrying successfully and reaching
  booking confirmation. Recovery also checks the supported 365-day horizon
  and the older reply with no horizon.
- Before the fix, the first new case failed waiting for the unreadable-reply
  notice; the page instead said there were no free times.
- `QA_BASE_URL=http://localhost:3000 node scripts/qa-selection-calendar-recovery.mjs`:
  passed, **57 isolated cases** in Chromium. The four new cases and six early
  request cases use phone and desktop widths; the other existing recovery
  cases run at 390px. All account/booking/provider replies are fixtures.
- `npm run typecheck && npx eslint src/lib/booking-api.ts scripts/qa-selection-calendar-recovery.mjs`:
  passed. `git diff --check`: passed.
- The matched probe recorded no page errors or horizontal overflow in its
  28 before/after contexts. Source restored byte-for-byte to the tested fix
  after the temporary baseline measurement.
- No Worker logic changed, so `test:booking` was not repeated this pass.
  No release build, live probe, full journey suite or production mutation was
  performed. No actionable blocker was found.

Matched data and logs: `/workspace/scratch/ines-pass7-calendar-matched-*`;
journey logs: `/workspace/scratch/ines-pass7-recovery-{before,after}.log`.

### Next priorities

1. Profile healthy date/time selection and its animation before further
   rendering changes; investigate repeat-visit caching without interception.
2. Rotate to public-route navigation or account recovery after rechecking
   current main and active work; avoid repeating this malformed-horizon case.
3. Revisit tutor-origin collision validation when the platform directory and
   onboarding work settle, and the dependency override when upstream changes.
