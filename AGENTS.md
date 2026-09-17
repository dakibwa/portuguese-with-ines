# Portuguese with Inês repository instructions

## Verification and release

- During implementation, run the smallest relevant check. Use `npm run test:booking` for Worker logic and the focused Playwright smoke test for affected customer journeys.
- `npm run check:fast` combines types, lint, booking and redirect tests. Use the aggregate when changes span those areas or focused checks leave unresolved risk. Isolated copy, styling and documentation use the shared narrow tier; reserve live probes and the production build for the relevant release gate.
- `npm run check:release` adds the live booking probe and production build. CI runs it once on `main`, then exercises the customer journey against that same built export before automatically publishing it.
- Run `npm run check:booking` directly only when booking configuration or routing changes, or to diagnose the release gate. If a local environment points it at a localhost Worker, start that Worker first; otherwise let CI exercise the configured live endpoint.
- Booking changes span two deployables: the static site and the `ines-booking` Worker. Deploy the Worker first — the site's release gate checks its health and will refuse to publish against a broken one.
- The Playwright journey test now runs in CI against the built export, not only locally. It rotted silently once — the booking container was renamed and nothing noticed for several commits — so if you rename a selector it guards, update `scripts/qa-flow.mjs` in the same change.
- Markdown and `docs/**`-only changes do not require a build or deployment; the Pages workflow intentionally ignores them.

## Design and documentation

- [design/README.md](./design/README.md) is the canonical human-readable contract for the website's visual direction, responsive composition, motion, and important interaction states. Git owns the editable production implementation and delivery; the published site is the acceptance surface; the `ines-booking` Worker and its D1 database own live booking truth.
- Treat a clear requirement added to the repository documentation as an implementation requirement. Bring the code and live site into line with it, or record the conflict explicitly when provider truth, accessibility, security, or current product behaviour makes the documented requirement unsafe or ambiguous.
- Consult the relevant design guidance for visual work and inspect the affected desktop/mobile states. Update `design/README.md` when an accepted, recurring decision changes the durable product contract; keep exact mechanics in components, tokens and styles.
- Route accepted design corrections to the narrowest owner: product and visual judgement in `design/README.md`, reusable mechanics in tokens/components/styles, and mechanically detectable regressions in focused checks. Add a general rule only after a deliberate product decision or a repeated accepted correction; do not turn one screenshot or one preference into a universal standard.
- External design tools and mock-ups are optional working material only. They are never a source of truth, a required handoff, or a completion dependency for this website.
- Keep documentation, implementation and the published site aligned during product work. There is no separate daily alignment automation.
- The current production direction is dark blue, lilac, cream, and coral, with organic splatty marks, Beth Ellen display text, and Montserrat body/UI text. Keep `public/visuals/` production-only and retain only assets referenced by the current site.
- Keep the original business-card material as historical brand reference, not as a competing website specification.
- Superseded visual work is stored outside the repository in `/Users/danatkinson/Documents/Work/Português com a Inês/Archive/2026-07-24 - Superseded visual directions`. It is provenance only: do not inspect or reuse it as design input unless Dan explicitly asks to revisit a named archived item.

## Documentation

- Git owns website implementation and deployment history; repository documentation owns intended website behaviour and design; the booking Worker's D1 database owns live booking state. Update `README.md`, `design/README.md`, or `docs-booking-system.md` in the same commit whenever a material change alters their contract.
- The admin endpoints are reachable by any account with `role = 'teacher'`, not only by the shared token. Anything added under `/admin/` is therefore something Inês can do from a browser she is signed into — check the permission path, not just the token path, when changing them.
- Booking touches money, a student's time and Inês's calendar. Never change the manage-link token scheme, the iCalendar `UID`/`SEQUENCE` handling, or the same-day fee detection without running `npm run test:booking` — each has a failure mode that is invisible until a real student is affected.
