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

**Latest checkpoint:** the second pass below clears the remaining development
dependency findings. The next priority is a measured loading/interaction
baseline, followed by one confirmed bottleneck or failure case.

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
