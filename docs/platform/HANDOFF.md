# Tutor platform: handoff

This file is for picking the platform work back up in a new session. It was last
brought up to date on 9 November 2026.

Dan's idea is to turn this repository, the booking site and Worker behind
Português com a Inês, into a platform that language tutors anywhere can run
their own site on. Inês's own site moves onto the platform, free. Read this
file first, then [docs-booking-system.md](../../docs-booking-system.md)
("Site configuration" and "More than one tutor").

## What Dan has decided

All of these were decided on 9 November 2026.

- **Go.** At 13:32 Dan said to build it end to end, in this repository, reusing
  the Inês back end. Inês's live site must keep working at every step.
- **Price.** €25 a month, flat, with no commission on lessons. The target is 100
  tutors.
- **Looks.** There are 10 layouts and 10 colour sets, and switching either is
  free. Dan charges a fee when he reworks a tutor's photos or pages.
- **Rules are settings.** Every rule that is in the teacher's interest is a
  setting: notice, prices, lengths, fees, horizon, buffer, cancellation and
  payment mode.
  - The terms page is written from those settings.
  - A change applies to new bookings only.
  - A price change for a weekly run needs the student to agree.
- **Expressions is Inês's add-on, not part of the platform** (14:04). The
  Worker refuses it for any other tutor, so leave it out of every tutor-facing
  plan.
- **Curriculum.** It generates per-student lesson plans with homework to go
  with them, grounded in the best research on learning the specific language
  being taught.
- **Onboarding is self-serve, with no calls with anyone** (14:07 and 14:10).
  - The site goes live straight away on a free subdomain.
  - Students pay the tutor by hand until the tutor connects Stripe.
  - Billing is a 30-day free trial from going live, with no card to start. The
    dashboard asks for the card before day 30.
  - A support agent reads each new site within the hour, and passes it to Dan
    only if something looks wrong.
- **Merge as you go** (14:24). Dan asked for the work to be merged and for
  notes like this one, so that new sessions can pick it up.

## Where the plans live

- **Feasibility and pricing**: [Claude Doc](https://claude.ai/artifact/KDWopQzkHBaEJNREXZUri2).
  It still says €39; €25 is the decision.
- **Onboarding plan**, approved by Dan: [onboarding.md](./onboarding.md) in this
  folder, the published [artifact](https://claude.ai/artifact/KyUBnDuD7RrKYe5sZvUdAE)
  and its source [onboarding-plan.html](./onboarding-plan.html). It covers the
  twelve steps from hello to a live site in about twenty minutes, then getting
  paid and inviting students.
- **Systems map**, showing how booking, homework, payments and curriculum
  connect: [systems-map.md](./systems-map.md) in this folder, the published
  [artifact](https://claude.ai/artifact/88kNajRKYQ7Kvm881KCy4F) and its source
  [systems-map.html](./systems-map.html). Its eleven numbered findings are the
  rules the code still fixes. "Known gaps" below is the same list, by build step.
- **Design system**, Inês's site and the bar for the templates:
  [artifact](https://claude.ai/artifact/XrweSPkR5KgKC8mF5xYhcY), and
  [design/README.md](../../design/README.md).
- **The 10 templates** are being drawn in the project thread "Design the 10 tutor
  site templates". Dan picks from its concept previews before any are built.
- **The name** is being chosen in the project thread "Name and brand the tutor
  platform". The onboarding plan uses "Chapeau" as a working name only.

## Build steps

| Step | What | State |
| --- | --- | --- |
| 1 | One tutor record holds everything Inês-specific | Done |
| 2 | The Worker picks the tutor from the calling site; each tutor has their own database, secrets and switches | Done |
| 2b | Each tutor's own time zone and currency | Done |
| 2c | A new tutor goes live without a deploy | Next, design below |
| 3 | The site's words, layout and colours come from the tutor's record and content | Next, with the templates thread |
| 4 | Tutors connect their own Stripe (Connect, Accounts v2, embedded onboarding) | Later |
| 5 | Sign-up and onboarding, as in the onboarding plan | Later |
| 6 | The platform's home page, and €25 monthly billing (Stripe Billing, 30-day trial) | Later |
| 7 | The curriculum | After the core platform |

Steps 1 to 2b changed nothing for Inês: her booking, email and homework tests
are unchanged, and her emails and prompts render byte for byte as before.

## How it works now

- **The tutor record.**
  - [tutors/ines/tutor.json](../../tutors/ines/tutor.json) holds who the tutor
    is: name, pronouns, brand, the language and its phrases, city, time zone,
    currency, domain, sender, reference prefix, calendar UID domain, default
    rules and `features`.
  - The site reads it through `src/lib/tutor.ts`, and the Worker through
    `workers/booking/tutor.mjs`.
- **The directory.** `workers/booking/directory.mjs` lists the tutors.
  - A request belongs to a tutor by its `Origin` (`site.origins`) or its host
    (`api.hosts`). Anything else is Inês's, and keeps the deploy's env untouched.
  - Another tutor's env holds their own D1 binding, signing secrets derived for
    them alone, and the shared mail and marking keys. Its switches start safe:
    email held as a dry run, and Google Calendar and homework AI off.
  - A missing binding fails closed.
  - The scheduled sweeps run once for each tutor (`everyTutor`).
- **The running tutor.** Each request and each sweep runs inside `asTutor`
  (AsyncLocalStorage). So `homeZone()`, prices, the Stripe currency and every
  helper that defaults to `currentTutor()` belong to that tutor. Outside a
  request they are Inês's.
- **A new tutor's database** is made from `schema.sql`, then from `node
  workers/booking/tutor-seed.mjs <id>`. Never use `seed.sql`, which holds Inês's
  name, prices and hours.
- **The proof** is `workers/booking/tenancy-test.mjs`, part of `npm run
  test:booking`. It runs a second tutor in New York who charges dollars, beside
  Inês. Neither ever sees the other's students, lessons, secrets or name.

## Next: tutors without a deploy (step 2c)

Self-serve sign-up can't wait for a deploy, and today a tutor's D1 database has
to be bound in `wrangler.jsonc` and deployed. The free plan also allows only 10
D1 databases.

The plan is to keep Inês on her D1 and give every platform tutor their own
SQLite-backed Durable Object:

- **The store.** A `TutorStore` class holds one tutor's database. It is created
  on first use with `idFromName(tutorId)`. In its constructor
  (`blockConcurrencyWhile`), it applies `schema.sql` and the tutor's seed, and
  records the highest migration number it has.
- **A D1-shaped adapter over `ctx.storage.sql`**, so the existing handlers run
  unchanged.
  - `prepare().bind().first()/all()/run()` and `batch()` go inside
    `transactionSync`.
  - `meta.changes` and `last_row_id` come from `SELECT changes(),
    last_insert_rowid()`.
  - Booleans are bound as 1 or 0.
  - Cursors are read to the end before any `await`.
- **The directory** is a `TutorDirectory` Durable Object listing each tutor's id,
  origins and state (draft, live or taken down). Only requests whose `Origin` is
  not one of Inês's are looked up there, with a short cache, and forwarded to
  that tutor's store. Inês's origins never touch it. If the lookup fails, the
  answer is a 503, never Inês's data.
- **The cron** calls each live tutor's store to run its sweep. At 100 tutors,
  sweeping every minute comes to about 4.3 million Durable Object requests a
  month. That is cheap on Workers Paid, but on the free plan the 100,000-a-day
  cap is reached at about 70 tutors.
- **A new entry module, `worker.mjs`**, re-exports the default handler and the
  two classes, and imports `schema.sql` as text. Node tests keep importing
  `index.mjs`. Declare the classes in `wrangler.jsonc` `exports` with
  `"storage": "sqlite"`.

## Step 3 contract (agreed with the templates thread)

- **The look.** `tutor.json` gains `look: { layout, palette }`. Inês's is
  `atelier` + `porto`. A palette holds role tokens only.
- **The content.** `tutors/<id>/content.json` holds:
  - `hero {title, line}`;
  - three `principles {title, body}`;
  - `about {heading, body}`;
  - an optional `photo {asset, alt}`;
  - `faq [{group, items [{q, a}]}]`;
  - an optional `feature` owned by the layout.
- **Prices** come from the Worker's lesson types, not from the record.
- **The preview has to render a draft record live**, because the onboarding
  plan draws the tutor's site beside each question. So platform tutors' sites
  render from data at runtime. A static export built for each tutor can't go
  live within twenty minutes. Inês's site stays its own static build until it
  moves over.
- **The platform's own identity is a set of single config values**, so the
  naming thread's answer drops in: its name, domain, subdomain pattern, sender
  address and "Site by" footer.

## Known gaps before tutors set their own rules

Numbers in brackets are the systems map's findings.

- **Places (7).** `bookings` and `booking_series` only allow `location IN
  ('online', 'porto')`. Until a migration, `'porto'` is the internal key for
  "in person" (`place.inPersonKey`).
- **No-shows (2).** `lessonChargePlan` charges a no-show the late fee, never the
  full price.
- **Reminders (3).** `sendLessonReminders` sends none when the notice is 24 hours or
  more.
- **Rules on existing bookings (1).** Bookings keep only `payment_consent_version`,
  and `changePolicy` reads the current settings, which is why `/admin/settings`
  caps notice at 0 to 14 hours and the fee at 0 to 500 cents. Snapshot the
  notice, fee and no-show rule onto each booking and series before allowing
  wider ranges.
- **Lesson types (5, 6).**
  - `student_recurring_rates` allows only 60 and 90 minutes.
  - Trial behaviour hangs on the id `trial` in about 11 places. Make these flags
    on the lesson type instead.
- **Students without email (4).** 11 of Inês's 21 students have no email, so they
  get no confirmation, reminder or pay link. Consider a channel per student,
  with a ready WhatsApp link where there is no email.
- **Payment status (10).** `payment_status` has 9 values plus paid-by-hand. Split it
  into how a lesson is paid and where that payment is.
- **Homework (8).** The marking and sheet prompts already take the language and
  its variety from the record (step 1). Levels are still fixed at A1 to C2, and
  lengths at 10, 15 or 20 minutes.
- **Entry points with no address (11).** The clock is done (each tutor's sweep
  runs separately). Still waiting on later steps:
  - Stripe webhooks need the connected account id (step 4).
  - The Google Calendar callback needs the tutor in its OAuth state, which is
    why other tutors start with it off.
- **Portugal only.** The tax number (NIF) and the Portal das Finanças reminders
  apply to Inês alone.
- **The curriculum (9, step 7)** drafts a plan and homework for every lesson
  from a checked language pack, and the tutor approves each one. It needs
  `students.level` (today it is read off the latest homework sheet), a topics
  table and `lesson_topics`.

## Open questions for Dan

- The platform's name and domain, which the naming thread is working on.
- Which of the 10 template concepts to build, from the templates thread.
- Whether Workers Paid is on, which decides the sweep cost above.
- From the systems map: packages paid up front and paying before a first lesson
  (not in the plan yet), and whether WhatsApp messages for students without
  email wait for the tutor to tap them or go through WhatsApp's business API.
