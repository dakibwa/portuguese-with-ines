# Portuguese with Inês repository instructions

## Verification and release

- Push every change live by default (12 November 2026, Dan: "by default can we push stuff live too please"): once the checks for what changed pass, open its pull request and squash-merge it into `main`, whose release publishes it.
- During implementation, run the smallest relevant check. Use `npm run test:booking` for Worker logic and the focused Playwright smoke test for affected customer journeys.
- Keep tests lean (13 October 2026, Dan: "always be as lean as possible"). A test earns its place only by protecting a student, Inês or money in a way no other check already does. Prove logic once, at the lowest layer (Worker or unit tests); a browser journey covers only the path through the UI, at one desktop and one phone width, not a sweep. Prefer extending an existing check to adding a new one, and delete checks that only repeat others.
- Locally, run the one or two checks for what changed. The release runs every browser journey on a fresh build, across four machines. Add new journeys to the matrix in `.github/workflows/deploy-pages.yml`. Any journey that depends on the live Worker also belongs in the group that runs on every release.
- `npm run check:fast` combines types, lint, booking and redirect tests. Use the aggregate when changes span those areas or focused checks leave unresolved risk. Isolated copy, styling and documentation use the shared narrow tier; reserve live probes and the production build for the relevant release gate.
- `npm run check:release` adds the live booking probe and production build. On `main`, every release checks the deployed Worker and runs the live booking journey. If the same site, fixtures, public configuration and runner already passed that UTC day, CI can reuse the exact released export. A manual release runs every journey afresh.
- Run `npm run check:booking` directly only when booking configuration or routing changes, or to diagnose the release gate. If a local environment points it at a localhost Worker, start that Worker first; otherwise let CI exercise the configured live endpoint.
- Booking changes span two deployables: the static site and the `ines-booking` Worker. Deploy the Worker first — the site's release gate checks its health and will refuse to publish against a broken one.
- The Playwright journey test now runs in CI against the built export, not only locally. It rotted silently once — the booking container was renamed and nothing noticed for several commits — so if you rename a selector it guards, update `scripts/qa-flow.mjs` in the same change.
- Markdown and `docs/**`-only changes do not require a build or deployment; the Pages workflow intentionally ignores them.

## Design and documentation

- [design/README.md](./design/README.md) is the canonical human-readable contract for the website's visual direction, responsive composition, motion, and important interaction states. Git owns the editable production implementation and delivery; the published site is the acceptance surface; the `ines-booking` Worker and its D1 database own live booking truth.
- The site has one design system: the plain files in [`design/system/project/`](./design/system/project/) (19 Nov 2026, Dan: "can we ensure we have a single design system? having this all spread across acounts feels wrong"). It lives on no account and in no design tool. Before any visual work, read its `README.md` (the brand book: pages, colour, type, shape, space, states, words) and `1-pages.md` (what each page is for). Its colour and squiggle tokens in `tokens.json` are the site's own CSS variables, and its `components/<Name>/preview.html` cards are the site's real markup and classes (`components/bundle.css` is the site's stylesheets), so reuse those names and compare new work against the matching card at desktop and phone width. To look at it, draw it as a page with `node design/system/make/site.mjs --system design/system/project --out design/system/page` and open `design/system/page/index.html` (git ignores the page; see [`design/system/README.md`](./design/system/README.md)). It records the site, not a second source of truth: `design/README.md`, the code and the published site win where they disagree. When a change alters a colour, type style, squiggle, spacing step, motion value or a component's look, update the affected files under `design/system/project/` in the same change, or say in the PR that the system is now behind. Never send it to, sync it from or publish it as a Claude Design page; the old Claude page is a frozen copy from 9 Nov 2026.
- Treat a clear requirement added to the repository documentation as an implementation requirement. Bring the code and live site into line with it, or record the conflict explicitly when provider truth, accessibility, security, or current product behaviour makes the documented requirement unsafe or ambiguous.
- Consult the relevant design guidance for visual work and inspect the affected desktop/mobile states. Update `design/README.md` when an accepted, recurring decision changes the durable product contract; keep exact mechanics in components, tokens and styles.
- Route accepted design corrections to the narrowest owner: product and visual judgement in `design/README.md`, reusable mechanics in tokens/components/styles, and mechanically detectable regressions in focused checks. Add a general rule only after a deliberate product decision or a repeated accepted correction; do not turn one screenshot or one preference into a universal standard.
- Other external design tools and mock-ups are optional working material only. They are never a source of truth, a required handoff, or a completion dependency for this website.
- Keep documentation, implementation and the published site aligned during product work. There is no separate daily alignment automation.
- The current production direction is dark blue, lilac, cream, and coral, with organic splatty marks, Beth Ellen display text, and Montserrat body/UI text. Keep `public/visuals/` production-only and retain only assets referenced by the current site.
- Keep the original business-card material as historical brand reference, not as a competing website specification.
- Superseded visual work is stored outside the repository in Google Drive, at `My Drive/Oh Life! Studios/Clients/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`. It is provenance only: do not inspect or reuse it as design input unless Dan explicitly asks to revisit a named archived item.

## Documentation

- Git owns website implementation and deployment history; repository documentation owns intended website behaviour and design; the booking Worker's D1 database owns live booking state. Update `README.md`, `design/README.md`, or `docs-booking-system.md` in the same commit whenever a material change alters their contract.
- The admin endpoints are reachable by any account with `role = 'teacher'`, not only by the shared token. Anything added under `/admin/` is therefore something Inês can do from a browser she is signed into — check the permission path, not just the token path, when changing them.
- Booking touches money, a student's time and Inês's calendar. Never change the manage-link token scheme, the iCalendar `UID`/`SEQUENCE` handling, or the same-day fee detection without running `npm run test:booking` — each has a failure mode that is invisible until a real student is affected.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
