# Português com a Inês

Inês's site for one-to-one Portuguese lessons in Porto and online, https://portuguesewithines.com:
public pages that say how she teaches and what it costs, a booking journey where students book,
move, cancel and pay for their own lessons, and her schedule, where she runs her week and her
students. A Next.js site exported as static files to Cloudflare Pages, and the `ines-booking`
Worker with its D1 database for bookings, payments and accounts.

## Rules

- Booking touches money, a student's time and Inês's calendar. Never change the manage-link
  token scheme, the iCalendar `UID`/`SEQUENCE` handling or the same-day fee detection without
  running `npm run test:booking`: each fails invisibly until a real student is affected.
- The admin endpoints answer any account with `role = 'teacher'`, not only the shared token, so
  anything under `/admin/` is something Inês can do from a browser she is signed into. Check the
  permission path, not just the token path, when changing them.
- Git owns the implementation and its history, the published site is the acceptance surface, and
  the Worker's D1 database owns live booking state. Keep the documentation, the code and the live
  site aligned: a clear requirement in the repository's documentation is an implementation
  requirement, so bring the code and the site into line with it, or record the conflict where
  provider truth, accessibility, security or current behaviour makes it unsafe or ambiguous.
- Keep `public/visuals/` production-only: only assets the current site references. The original
  business cards are historical brand reference, never a competing specification.
- Superseded visual work is in Google Drive, at `My Drive/Oh Life! Studios/Clients/Português com
  a Inês/Archive/2026-07-24 - Superseded visual directions`. It is provenance only: never use it
  as design input unless Dan asks to revisit a named item. Other design tools and mock-ups are
  working material, never a source of truth or a required handoff.

## Design

The design system is `design/system/project/`: plain files in this repository,
written for agents and kept on no account or design tool. Read its `README.md`
before you design or build anything: it says what makes a screen this
product's, how it is written, where everything is, the rules, which file wins
and how to check your work. Where another design document here differs from it,
the system wins. When a change alters the look, correct the system in the same
change. Before you finish, run
`node design/system/make/check.mjs --system design/system/project`; it must
report no errors. `design/system/make/check.mjs` and `site.mjs` are shared by
all of Dan's products: change them in `dakibwa/design-system-page`, then copy
them here unchanged.

After changing a stylesheet, run `node design/system/make/assets.mjs` so the cards are drawn with
it. An accepted, recurring design decision becomes a rule in the system's README, with the words
it came from; a mechanically detectable one gets the rule a `check:` line. One screenshot or one
preference is not a rule. [design/README.md](./design/README.md) holds the long design notes, as
background.

## Check and ship

- Run the one or two checks for what changed: `npm run test:booking` for Worker logic (it proves
  the real SQLite booking and payment state), and the focused Playwright journey for an affected
  customer path (`QA_BASE_URL=http://localhost:3000 node scripts/qa-<journey>.mjs` against
  `npm run dev`, or the export served by `python3 scripts/serve-qa.py`). `npm run check:fast`
  combines types, lint, booking and redirect tests for changes that span them.
- Keep tests lean. A test earns its place only by protecting a student, Inês or money in a way no
  other check does. Prove logic once, at the lowest layer; a browser journey covers only the path
  through the UI, at one desktop and one phone width. Extend an existing check before adding one,
  and delete checks that only repeat others.
- When you rename a selector a journey guards, update its script (such as `scripts/qa-flow.mjs`)
  in the same change; CI runs the journeys against the built export. Add a new journey to the
  matrix in `.github/workflows/deploy-pages.yml`; one that depends on the live Worker also joins
  the group that runs on every release.
- Ship through a pull request, squash-merged into `main` once the checks for what changed pass;
  `main`'s release publishes it. Booking changes span two deployables: deploy the `ines-booking`
  Worker first, since the site's release gate checks its health and refuses to publish against a
  broken one. Markdown and `docs/**`-only changes skip the build and deployment.
- On `main`, every release checks the deployed Worker, runs the live booking journey and every
  browser journey on a fresh build; when the same site, fixtures, public configuration and runner
  already passed that UTC day, it reuses the exact released export. `npm run check:release` adds
  the live booking probe and the production build locally. Run `npm run check:booking` directly
  only when booking configuration or routing changes, or to diagnose the release gate; pointed
  at a localhost Worker, it needs that Worker running.

## Where to read more

| When working on | Read |
| --- | --- |
| Running the site, the checks and the release | [README.md](./README.md) |
| Bookings, payments, accounts and the Worker | [docs-booking-system.md](./docs-booking-system.md) |
| The look of any page or piece | [The design system](./design/system/project/README.md) |

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
