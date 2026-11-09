# Vowel

Dan chose **Vowel** and asked for the platform build on 9 November 2026.
The implementation lives alongside Inês's site, with its own entry points,
Worker configuration and isolated storage. It has not been activated for real
tutors or live payments.

## Product decisions

- €25/month, no lesson commission; 30 days free from first publication, no card
  to start. Inês's subscription is exempt when her verified email is configured.
- Ten layouts and ten colour sets, independently switchable. Portrait uploads
  are optional and included, following Dan's explicit “Keep teacher portrait
  uploads” answer. No student profile photo uploads.
- Self-serve setup, live draft preview, saved progress, immediate publication,
  editable words, FAQs, teaching hours, locations, lesson types and terms.
- Manual lesson payments first; optional Stripe Connect direct charges to the
  tutor's own account. Vowel billing is separate from lesson money.
- Booking and weekly-run terms are frozen. Public price changes do not reprice
  a weekly agreement. An individual price offer takes effect after the student
  accepts it. Paid lessons remain protected.
- Language-specific starter packs, editable lesson plans and matching homework.
  Packs and answers require tutor review. Approval saves private homework;
  publishing that homework is a separate action. Packs are not accredited or
  claimed to have native-teacher review.

## Implementation

`workers/vowel/worker.mjs` serves the platform, tutor sites, teaching pages and
APIs. `TutorDirectory` owns platform users, hashed sign-in challenges/sessions,
drafts, published snapshots, optional portraits, verified domains, billing
references, support notes and scheduled follow-ups. Each `TutorStore` has its
own SQLite Durable Object with the shared booking schema and Vowel additions.
There is no binding to Inês's D1 database and no production D1 migration.

`src/vowel/` provides the setup and dashboard apps. Tutor pages render on the
Worker using the same renderer as the preview. Published prices read the tutor
store's lesson types. Booking, accounts, homework, Google Meet and the diary
reuse the existing components through a separate esbuild entry. Browser
sessions are scoped by tutor ID. Expressions and Portugal's receipts tools
remain with Inês's original site.

Before a base domain exists, tutor sites use `/t/<site-id>/`. With a configured
wildcard, they use `<slug>.<base-domain>`. A custom hostname serves a tutor only
after Cloudflare verifies both domain ownership and its TLS certificate.

The subscription checkout saves a card. A durable job starts the €25 monthly
subscription at the original trial end. It cannot charge before then or reset
the trial. Signed, mode-checked Stripe webhooks confirm paid access. Without a
subscription, new bookings pause at the trial end; existing records stay
available. Cancellation, retries, duplicate events and stale subscription
events are handled separately from the success-page redirect.

Support reviews run from a durable job five minutes after publication, with
bounded retries and an operator queue for flags or failed jobs. AI is optional;
without it, review and drafting use explicit rule/scaffold fallbacks. Setup
metrics store step number and duration, never the tutor's typed answers.

## Local verification

```sh
npm ci
npm run check:fast
npm run test:vowel
npm run build:vowel
npm run test:vowel:runtime
npm run vowel:dry-run
```

`test:vowel` uses real SQLite and isolated provider responses to protect owner
access, code exhaustion, private portraits/drafts, immutable booking terms,
nightly weekly-run prices, student price acceptance, curriculum review and
billing/webhook behavior. `test:vowel:runtime` runs the actual Worker in
workerd, including real SQLite Durable Objects and RPC request bodies.

For browser checks with fictional records only:

```sh
npm run build:vowel
node scripts/test-vowel-runtime.mjs --serve
```

Open the printed local fixture entry. It is compiled only by the test script;
the deployed Worker contains no fixture sign-in route. Outbound email, AI and
payments are blocked. Stop the test server with Ctrl-C.

`.github/workflows/vowel.yml` runs the relevant shared checks, Vowel tests,
real-runtime test and deployment dry run. It has no provider credentials and
cannot activate the service.

## Activation still requires owner setup

Public sign-up, email, AI, Google Calendar and live Stripe use are off in
`workers/vowel/wrangler.jsonc`. Keep them off until these are complete:

1. Choose and acquire a suitable domain. Authoritative registry checks on
   9 November 2026 found both [vowel.app](https://pubapi.registry.google/rdap/domain/vowel.app)
   and [vowel.ai](https://rdap.identitydigital.services/rdap/domain/vowel.ai)
   already registered. No purchase has been made. An existing education
   business uses [Vowel LMS](https://vowellms.com/); the chosen name has not been
   cleared for launch.
2. Confirm the existing Cloudflare account's plan and the cost of the per-tutor
   alarm/storage model before enabling public use. Billing access was not
   available through the connected read-only API; no plan has been upgraded.
3. Set `VOWEL_ORIGIN`, the optional `VOWEL_BASE_DOMAIN` and wildcard route,
   verified `VOWEL_MAIL_SENDER`, and a new `VOWEL_AUTH_SECRET` via the secret
   store. Configure Resend and deliverability. Never paste credentials into
   docs, Git or chat.
4. Configure Stripe in a separate test environment: Accounts v2 merchant and
   customer configuration, direct charges, embedded account components,
   platform billing, and the signed webhook at `/api/stripe/webhook`. Set
   `VOWEL_STRIPE_SECRET_KEY`, `VOWEL_STRIPE_PUBLISHABLE_KEY`,
   `VOWEL_STRIPE_WEBHOOK_SECRET`, and the expected mode together. Complete real
   test-account onboarding, card setup, charge, failure/refund, cancellation and
   renewal checks before a live-mode decision. Fixture tests are not provider
   certification. Check supported countries/currencies, payment minima and tax.
5. Configure Google's sign-in audience and per-tutor Calendar callback path
   `/api/tutor/<id>/google-calendar/callback`, OAuth review and permissions;
   connect and verify with a real consenting test tutor.
6. If enabling AI, set `ANTHROPIC_API_KEY` and `VOWEL_AI_MODEL`, retain the
   monthly drafting ceiling, and review the selected language packs and data
   processing arrangements. Custom domains additionally need the SaaS zone,
   scoped Cloudflare token and fallback target variables documented in
   `domains.mjs`.
7. Finish the operator's business/contact, privacy, retention, tax and service
   terms before accepting public sign-ups. Add verified support operators via
   `VOWEL_OPERATORS`, and Inês's verified email via `VOWEL_EXEMPT_EMAILS`.
   Exempt sites can receive lesson payments without a Vowel subscription.

No real customer was created, emailed, billed or migrated during this build.
Inês's migration is a separate, explicitly approved data/payment cutover with
backup, rehearsal and calendar continuity checks; it is not part of deploying
this separate Worker.
