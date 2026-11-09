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
