# Booking system

Booking is owned by this repository. There is no third-party scheduler: the
site renders the calendar, and `workers/booking/` (Cloudflare Worker + D1) is
the source of truth for availability, bookings, and changes.

## Why not Square, Cal.com, or Acuity

**Square cannot be the rail.** Square does not onboard sellers in Portugal —
its seller countries are Australia, Canada, France, Ireland, Japan, Spain, the
United Kingdom and the United States. The account this site pointed at until
August 2026 was Dan's UK account, set up as a test. It could never have taken
money for a Porto-based business, and its booking URL is now removed.

**The website owns bookings.** Optional lesson sync and Google Meet use a
separate Google calendar created for this app. Student calendar invitations
remain available by email. The integration
does not read Inês’s existing appointments or change website availability.
See [Google Calendar and Meet setup](#google-calendar-and-meet-setup) for activation and recovery.

## Shape

```
Student on /book                                     (browse without an account)
  → GET  /lesson-types, GET /availability            public
  → GET  /availability?manage=:token | ?series=:id   a lesson being changed may reuse its own time
  → GET  /availability (optional Bearer)             a student's own card-setup holds are not busy
  → POST /auth/register | /auth/login | /auth/google → session token
  → POST /bookings                    (Bearer)       → D1 row, emails, ICS invite
  → GET  /me                          (Bearer)       → their calendar and series
  → GET/POST /me/recurring-rates      (Bearer)       → their own prices; POST saves a code
  → GET  /bookings/:token                            one lesson; HMAC-signed token
  → POST /bookings/:token/reschedule | /cancel       → optional lessonType, sequence++, updated ICS
  → POST /series/:id/reschedule | /stop (Bearer)     → move or end an owned weekly sequence
Legacy /my-lessons and /booking links resolve into /book without losing state
Inês on /schedule                     (her own account, role=teacher)
  → GET/POST /admin/availability, /admin/exceptions
  → POST /admin/exceptions/day                       one date's day off and blocked hours
  → GET  /admin/bookings, /admin/students            her lessons; her students and how far
                                                     each is onto the site
  → POST /admin/bookings                             add a lesson, or a weekly slot, for someone
                                                     (marked `added_by_teacher`, shown as
                                                     `Added by you`; charged to a card only
                                                     once the student saved one from their
                                                     account); one already started is only
                                                     recorded (`payment_status = 'recorded'`)
  → POST /admin/students                             set a student up (details, optional prices); nothing emailed
  → POST /admin/students/:id/details                 their name, email, phone, NIF and splat; email only
                                                     until they first sign in
  → POST /admin/students/:id/prices                  her price for a student per length; null is standard, 0 is free
  → GET  /admin/receipts?month=YYYY-MM               every amount paid or due for a Porto month's lessons,
                                                     with the NIF to issue to (her Receipts tab and automation)
  → POST /admin/students/:id/welcome                 email a student a fresh sign-in link
  → POST /admin/students/:id/dormant                 mark them dormant, or active again; nothing emailed
  → GET/POST /admin/dormant-email                    the default each come-back email starts from
  → POST /admin/students/:id/dormant-email           send one dormant student theirs, at most once a day
  → POST /admin/bookings/:id/reschedule | /cancel
Stripe → POST /stripe/webhook                        signature-verified
```

## Who can do what

Booking, and managing your own lessons, needs an ordinary account. The admin
endpoints additionally need either `role = 'teacher'` on that account or the
shared `ADMIN_TOKEN`.

Inês signs in as herself — there is no second password to remember, and what she
does is attributable rather than anonymous. The token stays as the way back in
if she is ever locked out. Granting the role is a deliberate manual step:

```sql
UPDATE students SET role = 'teacher' WHERE email = '...';
```

When that teacher account opens `/book/` or signs in there, it goes straight to
the same `/schedule/` dashboard. This is a navigation choice based on the verified
account role; admin endpoints still check teacher permissions on every request.

A teacher can also be one of Inês's students (17 October 2026, Dan). Adding a
teacher's email from Add student sets `also_student = 1` on their account
(migration `0032-also-student.sql`) instead of refusing it; `role` stays
`'teacher'`, so they remain an admin everywhere. Their name, password and
Google sign-in are untouched, any prices given are saved, the reply is the
usual 201, and nothing is emailed. From then on they appear in her Students
list, her details, prices and lesson forms accept them, and their own account
can save a card, open homework and pick expressions
(`workers/booking/student-like.mjs` is the one definition). Emailed sign-in
links and the welcome stay for `role = 'student'`: a welcome for them is
refused with 409, since its link is a way in they are never given. `GET /me`
returns `alsoStudent`; `/book/?view=lessons` then opens their lessons, with
`Your schedule` to go back, and the schedule shows them `My lessons`. Plain
`/book/` and booking still go to the schedule. Adding them again is 409.

Her own bookings are checked for clashes only, not against her published hours
or the notice window. Those exist to shape what students may choose; she is the
one deciding, and fitting a lesson in outside them is a normal thing for her to
do. A double booking is never intended, so that is still refused.

Adding a lesson for someone who booked another way creates their account if it
does not exist, with no password. Their confirmation says Inês booked it and
carries the calendar invitation. While they have never been in, or have not yet
saved a card from their account, its button is a one-click sign-in link (good
for 14 days, once) instead of the manage link, and it says how adding a card
works; the invitation still carries the manage link. Her own copy says
`You added a lesson`.

**Recording a lesson already had** (15 October 2026, Dan: purely for the
record). A `startAt` at or before now is a lesson she is recording, not
booking. It is checked for clashes only, like any lesson she adds (weekly
hours, time off and the notice window don't apply), and the same student at
the same start answers 409 `They already have this lesson.` Nothing else a
booking does happens: no email to the student or to her, so no calendar
invitation; no sign-in link; no card, charge or payment link; no reminder
(those look only ahead); and no Google Calendar event or Meet. One still
running when she records it carries `meeting_retry_at = ends_at`, so the Meet
sweep never reaches it. It cannot repeat weekly (400). The reply is
`emailed: false`. Its place, `online` or `porto`, is hers to give (16 October
2026, Dan) and is stored for the record only: a past lesson never has a Meet,
a calendar event or an email, whichever it is.

It is stored as `payment_status = 'recorded'` with no `amount_cents` (no
migration: the column has no CHECK constraint). No existing combination was
neutral: `not_required` on an ended lesson is Receipts' `Paid by hand`, ready
to issue, and saving a card turns a `not_required` lesson Inês added into a
charge; `payment_due` sends a Stripe payment link. Every charge, recovery,
repricing, card-transition and receipt query names the statuses it acts on,
and none names `recorded`, so it is never charged, chased or put forward as
paid or owed. It is **not in Receipts**: a record says nothing about money, so
there is nothing to issue a fatura-recibo for; if she was paid for it, that is
hers to note outside the site. Her history shows `Recorded`, as does the
lesson's dialog; the student sees it in Past lessons as `Completed`, with no
price, like any other past lesson. Homework is set on it as usual.

Moving it to another past time, or cancelling it, is as quiet, since the
student was never told of it. It cannot be moved into the future (409 `A
recorded lesson stays in the past. Add a new lesson instead.`), so a record
never becomes an unannounced lesson to come.
An unproven account with a password is still reclaimed first (below), because
the lesson and its homework must not reach whoever registered the address;
with no confirmation sent, the mailbox's owner gets back in with Google or a
password reset.

`How often` adds a weekly slot instead (4, 6 or 8 weeks, or until stopped),
one email for the run. The first date is the one she chose, so it is booked
like a single lesson she adds (clashes refused, nothing else). The weeks after
it are checked only against her days off and her other lessons, not her
published hours or the notice window, and the run is marked `booking_series.added_by_teacher` so
the nightly top-up keeps doing so. A week that cannot be booked is left out and
named in both emails.

**Paying for the lessons she adds** (migration 0023, 12 October 2026, Dan).
A lesson Inês adds records its price and `added_by_teacher = 1`. One she
records after it has happened is only a record (`recorded`, above) and is never
charged. A lesson to come is paid to
her as before (`payment_status = 'not_required'`) until the student saves a card
from their own account (`POST /me/card`, Stripe's hosted setup page,
`client_reference_id = student:<id>`, `metadata.purpose = student_card`). That
agreement is stored as `students.card_consent_at` (when the session was
created, which is when she pressed the button) with
`STUDENT_CARD_CONSENT_VERSION`; it also orders card changes, so an older
setup Stripe delivers late never replaces a newer card. When Stripe's signed webhook confirms the
SetupIntent, the card is saved, every lesson she added that has not yet started
becomes `scheduled` (charged after it ends, on the same change and no-show terms
as a lesson the student books), her weekly slots for them turn on
`automatic_payment`, and anything she adds afterwards is `scheduled` from the
start. A lesson already had, or one the student booked themselves, is never
changed. A card saved at one booking's checkout agreed to that booking only and
does not count, and only a proven address (see *Accounts*) can save one: a card
someone registered first never pays for the owner's lessons, and taking an
unproven account back clears its agreement. `Your lessons` asks once, above
the calendar, while a lesson she added is still unpaid; `Your details` has a
`Card` row with `Remove card` (`POST /me/card/remove`), which puts her lessons
still to come back to being paid by hand and stops her weekly slots charging.
Removal also increments `students.card_setup_version` (migration 0033), so a
setup already open at Stripe cannot restore the agreement, even if no card had
yet been confirmed. Each setup records that generation and the account's
`session_version`; confirmation checks both again in the transaction, together
with verified student access. Identity changes also retire older setups.
Teacher lesson/series creation and unticking a direct payment check the same
current agreement inside their writes. Charge initiation checks it again;
withdrawn agreements cannot leave stale scheduled charges. Charges already
processing retain their original idempotent retry, since money may have moved.

Inês sees which lessons a newly saved card now pays for in Needs you. One the
student already paid her for by hand is ticked `Already paid` (below) before it
is charged, and no later card takes it back. A lesson she records after it has
happened is never put on a card.

**Already paid** (16 October 2026, Dan). Any lesson, past or to come, can be
ticked as paid to her by hand: as she adds it (`paid: true` on `POST
/admin/bookings`) or later from its dialog (`POST /admin/bookings/:id/paid`,
`{ paid: true | false }`, teacher only like every `/admin/` route; nothing is
emailed). It reuses the existing paid-by-hand mark, `payment_consent_version =
'paid-by-hand'` (`PAID_BY_HAND_MARK` in `policy.mjs`), rather than a new
status:

- A lesson to come is `not_required` with the mark. Card saving, card removal,
  charging, recovery, chasers and repricing all skip the mark, so it is never
  charged, linked, chased or moved onto a card (the `not_required` pitfall
  does not reach it), and a student cannot change its length (409). The
  agreement it carried stays on it, so unticking can restore it.
- A lesson she records after it happened stays `recorded`, with the mark and
  its price in `amount_cents`, so it keeps every record rule (no email, no
  Meet, no move into the future). Unticked, it is a plain record again: no
  price, not in Receipts.
- Ticked lessons are in **Receipts as paid by hand, ready**, from the moment
  they are ticked (the money is in), including after cancellation. Untick a lesson to come
  before it is charged and it is billed as it would be booked now: her lesson
  goes on the card if the student's standing agreement covers it, otherwise
  it is to be paid to her directly (`not_required`, unmarked); a lesson the
  student booked goes back on their card only if it was on one when ticked
  (under `PAYMENT_CONSENT_VERSION`). Its price is the student's current one,
  never above what they agreed at checkout, and €0 makes it free.
- Offered only where nothing is settled by card: `scheduled` or
  `not_required` with no charge started, or `recorded`. A free lesson has
  nothing to pay (409, and no tick); `paid`, `payment_due` and `processing`
  are refused (409) and show their card state instead.
- Per lesson: a weekly run can't be added ticked (400); each lesson of it is
  ticked from its own dialog, and new weeks are born unticked.
- The tick covers the lesson price only, not a late change fee.
- The older `POST /admin/bookings/:id/paid-by-hand` (her lesson on a card,
  ticked) still answers for any open page, but the site no longer calls it.
- Her student list's `paid by hand` count and the student's `Pay by card`
  prompt leave ticked lessons out; emails show their price as `paid`.

Cancelling a lesson never records a refund of money paid by hand. In Student
history, `Record refund` opens an explicit confirmation that Inês already
returned the money directly. `POST /admin/bookings/:id/refund-by-hand` requires
`{ refunded: true }`, teacher access, a cancelled paid-by-hand lesson and no
Stripe payment or charge in progress. It records `payment_status = 'refunded'`
and retains the receipt as `by hand / refunded`, no longer ready to issue.
Repeated acknowledgments are harmless. It sends no email and makes no payment
provider call. This is Dan's confirmed receipt rule (18 October 2026).

`GET /admin/students` lists each student with whether they have signed in, a
card and the standing agreement, their next lesson, how many lessons to come are
still paid by hand, and any weekly slot. `Students` on `/schedule` puts
those who still need to sign in or add a card first, each with
`Send welcome email` (`POST /admin/students/:id/welcome`, three an hour per
student). It is only ever sent by her press: nothing sends it on its own.
Concurrent first-welcome requests share one durable delivery key and original
sign-in link. Retries preserve that exact request; explicit `Send the link again`
still creates a fresh link. The recipient's captured address and account version
must match at link creation, email dispatch and the final welcome-state update.
A student needs no lesson to be welcomed (16 October 2026, Inês); with no
lesson to come the email invites them to sign in and book their next one,
with no lesson list, and a student free at every length is asked for no card. Accounts the opt-in live check registers
(`launch-check-…@example.invalid`, from `scripts/qa-recurring-rates.mjs`) are
left out of the list; the four made on 5 September 2026 were deleted from
production on 13 October 2026 at Dan's request.

Selecting a student opens their lesson history. The teacher UI reads
`GET /admin/bookings?from=1970-01-01T00:00:00.000Z` through the existing teacher
permission path and matches the account ID (email only for older unlinked rows).
It shows confirmed and cancelled lessons, including old dates, with upcoming
lessons first and past/cancelled lessons newest first. Unfinished checkout holds
are excluded. Payment and cancellation status are read-only; viewing history
does not send emails or alter lessons. Failed reads offer a retry, and closing
or changing accounts discards late responses.

Registering proves nothing about an address, so an existing account may belong
to whoever registered the address first rather than to the student Inês means.
When the account's address has never been proven (see *Accounts*) and it has a
password, adding the lesson first applies the transition a first Google link
makes: the password, every session and any pending reset or address change are
cleared, before the lesson exists, so no earlier session can read it or its
manage link. The mailbox's owner gets back in with the one-click sign-in link
that booking's confirmation always carries, with Google, or by choosing a new
password. A proven address, a teacher account and the password-less accounts
created here are never touched.

## Expressions collection — Stage 1

The teacher portal's `Expressions` tab follows Receipts. Its collection reads
and writes pass through `handleAdmin`, so either any account with `role = 'teacher'` or the
existing shared `ADMIN_TOKEN` can use them. Students and anonymous callers are
refused before any collection data is read or changed. Existing origin, JSON
content-type, bounded request-body and no-cache rules apply. The student picker
has separate authenticated endpoints below. There is no anonymous expression
endpoint, and this feature sends no email.

| Method and path | Request and result |
| --- | --- |
| `GET /admin/expressions` | `{ expressions, openToStudents }`: the collection ordered by `sort_order`, then `id`, and whether students can see expressions (the switch below), so her copy follows it. |
| `POST /admin/expressions` | Creates the supplied content as an unpublished draft; `{ expression }`, HTTP 201. |
| `POST /admin/expressions/:id` | Replaces content, with `updatedAt` from the last read; `{ expression }`. |
| `POST /admin/expressions/:id/publish` | `{ published: 0 or 1, updatedAt }`; `{ expression }`. Publishing requires both meanings and one or two examples. |
| `POST /admin/expressions/:id/delete` | `{ updatedAt }`; `{ ok: true }`. The portal confirms deletion first. |
| `POST /admin/expressions/reorder` | `{ ids, expectedOrder }`, each the entire ordered collection of IDs. Returns `{ expressions }`. |

Migration `0026-expressions.sql` creates `expressions`; the same DDL is in
`schema.sql`. Its fields are `id`, `expression`, a separate unique `normalized`
duplicate key, `meaning_pt`, `meaning_en`, `literal_en`, `examples` (JSON array),
`notes`, `source_url`, `tags` (JSON array), `image_url`, `image_alt`, `published`
(0/1, default 0), `sort_order`, `created_at` and `updated_at` (UTC ISO strings).
The order index is `(sort_order, id)`. No Sites project ID, Sites sign-in headers,
student identity or student-equivalent table is imported.

The JSON content fields use `expression`, `meaningPt`, `meaningEn`, `literalEn`,
`examples`, `notes`, `sourceUrl`, `tags`, `imageUrl` and `imageAlt`. Replies add
`id`, `published`, `sortOrder`, `createdAt` and `updatedAt`. Text is stored as
written; normalization affects only the duplicate key. Limits are 240 characters
for the expression and image description, 2,000 for each meaning and notes, 500
for the literal translation, two examples of up to 1,200 characters, and eight
themes of up to 40 characters. Links are at most 2,048 characters; references
accept only HTTPS without credentials. Images accept only local
`/visuals/expressions/<name>.webp` paths, matching the site's security policy,
and need a description. Expressions do not accept uploads. Expression requests are
bounded to 128 KiB, including both ID lists when reordering up to 500 entries.
Unknown fields, wrong types, empty list items and invalid publication values
are rejected. Drafts may be incomplete; published entries must stay complete.

Lesson homework has a private photo-to-notes flow and reviewed
publication. Its student access, AI setup, limits and print format are described
in [Lesson homework](docs/lesson-homework.md). Online submissions get automatic
marking for Inês to check, edit and approve before returning feedback, and
email Inês once per submission (no answers or marks) with a link to its review.
A separate black-and-white worksheet can be printed. Migration 0029 adds its
tables and 0030 the notification record; neither changes expression storage or
booking/payment state.

Updates, publication and deletion compare `updatedAt` in the write itself.
Stale requests receive HTTP 409. Reordering is one conditional SQLite statement
using JSON IDs, so it cannot leave a partially reordered collection and rejects
a changed order or membership. The browser retains failed drafts; a load failure
is distinct from an empty collection. Nothing of the collection is cached in
browser storage; her try-out (the students' paint reveal just under her Add an expression button,
painting her whole collection, drafts included) keeps only the IDs she has
painted this round on her device, and it never calls the student endpoints or
writes to the Worker. `Open full page` opens the same painting and reading at
`/idioms/`, under the shared site header. It checks the signed-in account before
loading her collection and links back to the Expressions tab.

The migration includes 52 drafts, preserving the original expression IDs,
Portuguese meaning, literal English, idiomatic English equivalent (in
`meaning_en`), notes and references. The bundle supplies no usage examples or
themes, so those start empty. `scripts/import-expressions.mjs` parses only
literal arrays from the bundle with the installed TypeScript parser; it never
executes bundle code. Regenerate the seed as plain SQL with:

```sh
node scripts/import-expressions.mjs /path/to/ines-idioms-app/current-app/lib/expressions.ts
```

The output is the seed section of `0026-expressions.sql`. Repeating it preserves
existing IDs and teacher edits (`ON CONFLICT(id) DO NOTHING`); it does not refresh
or overwrite an existing collection. Reorder is bounded to 500 entries.

## Student expression picker

**Closed to students until Dan opens it** (14 October 2026, Dan: "publish them
but not for students just for ines currently"). The Worker var
`EXPRESSIONS_FOR_STUDENTS` is the one switch, and only exactly `"1"` opens it;
`workers/booking/wrangler.jsonc` sets `"0"`. Sign-in and the student-role check
come first, as below. Then, while closed, `GET /me/expressions` answers
`{ expression: null, canPick: false, hasPublished: false, shuffleLabels: [] }`
without reading the database, so Your lessons shows no card, and
`POST /me/expressions/pick` is refused with HTTP 404 (`Expressions are not open
yet.`) before anything is written. `GET /admin/expressions` reports the same
switch as `openToStudents`. Inês can still draft, publish and reorder, and paint
any expression in her own tab. To open expressions to students, set
`"EXPRESSIONS_FOR_STUDENTS": "1"` in `workers/booking/wrangler.jsonc` and
release: the Worker deploys first (the release's `worker` job, or
`npm run worker:deploy` by hand). Setting it back to `"0"` closes them again
without touching anyone's history.

Once open, a signed-in student can pick a published expression below Your lessons
or at `/idioms/`, reached from that card's `Open full page` link. The
server chooses randomly from that student's unseen published entries. Different
students can receive the same expression. Teachers use the private preview in
Expressions; neither anonymous callers nor teacher sessions can draw.

| Method and path | Request and result |
| --- | --- |
| `GET /me/expressions` | The student's latest still-published pick, whether another is available, whether any published content exists, and up to eight unseen titles for the animation. |
| `POST /me/expressions/pick` | Only `{ requestId }`, a UUID v4. Reserves one unseen published expression and returns the same state shape with that request's result. |

Both return `{ expression, canPick, hasPublished, shuffleLabels }`. No client
student ID or chosen expression ID is accepted. The session supplies the
student identity. A single SQLite INSERT selects with `ORDER BY random()` and
reserves the pick atomically. Migration `0027-expression-picks.sql` adds
`expression_picks`: student and expression foreign keys, a request UUID, UTC
creation time and an ordered ID. Unique constraints cover student + expression
and student + request. Retrying one request returns the original result without
consuming another. History belongs to the account, across browsers and devices;
unpublishing and republishing an expression does not reset it.

The UI restores the last available result on return. The painting only
presents the server's already-saved result. Reduced motion skips it, and
navigation cancels it without undoing the pick. No published entries means no
student card. An exhausted pool waits for newly published entries; there is no
student reset or repeat action. Failed or lost replies retain the request UUID
for retry. All replies use the existing no-cache and origin rules; POST bodies
are bounded to 1 KiB.

**Released on 14 October 2026** (PR #133). Migrations 0026 and 0027 were
applied by hand to staging and production D1 that day, before the Worker and
site release. Expressions stay closed to students until
`EXPRESSIONS_FOR_STUDENTS` is `"1"`. Missing tables would still produce a
controlled 503 on the affected endpoint while the rest of the portal works.

The content inventory, original schema and feature map are in
[Expressions: source and scope](docs/expressions-stage-1.md). A public Expressões
page and optional home-page expression remain plan only. `/idioms/` is an
authenticated painting page: teachers use their local try-out, students use the
same feature-gated endpoints, and signed-out visitors sign in first. It adds no
anonymous collection access or main-menu item. Multilingual student
contributions and a weekly selection policy are also outside this change.

## Teacher calendar

`/schedule` opens on the current Monday-to-Sunday week in Porto time. Booked
lessons sit at their actual times and open a details dialog for moving,
cancelling or recording attendance. Week navigation requests the corresponding
booking range, including lessons that cross midnight. A failed range load is
shown as an error, never as an empty calendar. Mobile shows one selected day
under the same seven-day header.
Closing lesson details without a change returns focus to its lesson. A completed
move, cancellation or attendance change returns focus to the stable week
heading while the timetable reloads; a failed read retains that position and
offers its existing reload action. Reloading never moves focus from a control
Inês selects while it is pending.

When Inês cancels a lesson she can include an optional **Message for {first
name}**,
up to 1,000 characters. It appears as **Message from Inês** in the student's
cancellation email and in her own copy, with line breaks preserved and markup
treated as text. An empty message leaves the existing email unchanged. The
message is stored separately from lesson notes, atomically with cancellation
or the refund claim, so refund reconciliation and email retries retain it.
Migration `0024-cancellation-message.sql` adds that nullable booking field and
must be applied to each database before deploying this Worker. Her existing
no-fee cancellation and automatic refund rules remain the same.

The week itself is where Inês takes time off. Choosing a free time offers
`Add a lesson here` or `Take this time off`; dragging across times on a date
blocks them all for that date only, and choosing a blocked time reopens it.
The `Day off` switch above each date blocks the whole day. The `Time off`
tab shows a month calendar beside one card. Tapping dates chooses them, one or
several, across months; chosen dates survive tab changes. The card offers
`Take the day off` / `Take N days off`, `Take some hours off` for a single
date, and `Make available` when a chosen date is off. Some hours opens a draft
of one or more timed breaks; in the time picker, `00:00` means the end of that
day (stored as minute 1440). That draft saves explicitly through the same
`/admin/exceptions/day` endpoint; saving breaks removes that date's whole-day
block, and `Remove hours off` clears its breaks. Weekly blocks and extra hours
stay. The month marks whole days off and booked lessons, without displaying
weekly unavailability or partial blocks from the week.
Booked lessons on the chosen dates are listed as cards whose `Change` opens
that lesson's own move/cancel dialog, and unavailable booking data must be
retried before applying changes. Each bulk-selected date uses the same queue;
already-matching days require no write. Reopening a day removes only its
whole-day block, retaining partial time off and weekly hours. Each change
saves one request at a time, so quick clicks coalesce
into the date's latest choice. A failed older save keeps a newer choice queued;
failure of the latest choice puts that date back as saved and says so.

Weekly-hours drafts warn when changed lesson start times overlap an existing
confirmed lesson in Porto time, including ongoing and future lessons. Saving
waits for booked lessons to load; the warning and save confirmation both state
that existing lessons stay booked. Each clash is the same lesson card, its
`Change` button opening the existing move/cancel dialog. Opening or
changing a lesson preserves the weekly-hours draft; a completed change refreshes
the clash cards. More than four affected lessons expand from `more lessons`.
Hours edits never move or cancel lessons themselves.
Leaving the teacher page releases its queue: an already submitted write may
finish, but no later queued write starts. Unreadable time-off or weekly-hours
acknowledgments show an error instead of claiming success. Past dates and
weekly blocks such as lunch are shown but not toggled.
Existing lessons are never cancelled by time off — they stay on the calendar
and need their own move or cancel.

`POST /admin/exceptions/day` takes `{ date, dayOff?, blocks? }`. The two parts
are independent and each replaces only its own one-off rows in one batch:
switching the day off never discards the hours blocked within it, reopening it
brings them back, and an existing day off keeps its note. Weekly blocks and
extra hours are never touched there. Malformed or whole-day `blocks`, and past
dates, are refused rather than partly saved. `GET /admin/availability` returns
weekly blocks alongside the upcoming one-off rows so the calendar shows every
time students cannot book.
`POST /admin/availability` validates every weekly range before replacing any
hours. Invalid ranges or more than 100 ranges return 400 without changing the
timetable; an explicitly empty array closes the usual weekly hours.

The Timetable's `Edit weekly hours` control edits the usual weekly pattern in
the same calendar with click/drag, touch or keyboard input. `View lessons`
returns to the chosen week and day. Neither switching mode nor leaving the
tab saves or discards a draft; Timetable and its edit control mark unsaved hours.
`Save weekly hours` writes the existing first-start and
last-start rule format; it does not reinterpret the last start as a finishing
time. Precise existing windows remain available through `Set exact hours` and
are not rounded by the grid. Drafts survive week/view changes and booking
actions, and validation prevents the API from silently dropping invalid rows.

The tools bar groups `Students`, `Timetable`, `Time off`,
`Receipts`, `Expressions` and `Profile`, opening on `Timetable`.
Profile holds her sign-in email change, password reset link, Google Meet
connection and Sign out. Email changes use the existing new-address confirmation
flow; password changes use the existing reset email. Google callbacks open Profile
directly. Students combines setup and ongoing care; the Timetable retains a
three-card strip for operational notices under her next lesson.

Lessons only belong to students (13 October 2026, Dan: no loose lessons).
`POST /admin/bookings` names the student by `studentId` (their account, which
works for a student with no email yet) or, for older callers, by `email`; one
who isn't on the site is refused ("Add them as a student first.", 404), and
students come from `POST /admin/students`. Each student's row is their profile
through onboarding and regular use (14 October 2026, Dan). Its name opens
all-time lesson history in place; details, price and lesson creation use the
same row. Completed setup becomes normal profile controls. A new student or a
free timetable time can start in the creation/student-choice dialog, then opens
the chosen row's lesson calendar with the selected date and time preserved.
History matches the linked student ID first and only falls back to an exact
email for older unlinked lessons; stale requests and session changes cannot
show another student's history. Default teacher-list splats derive from the
student ID without replacing a chosen mark or writing account data.
All teacher actions still use the authenticated admin endpoints and their
existing booking, payment and email safeguards.

Onboarding (13 October 2026, Dan) lets Inês set a student up before they hear
anything. `POST /admin/students` takes `email`, `name` and optional `phone`,
`nif` (checked as `/me` checks it) and `mark`, creates the account with no
password and `awaiting_welcome = 1` (migration `0025-awaiting-welcome.sql`,
applied to staging and production on 13 October 2026), and sends nothing; an
address already on the site is refused. A student she creates from the lesson
form is set up the same way. While a student is awaiting their welcome and has
never signed in, every `student_*` email about them is held at the one sending
point (lessons added, moved or cancelled, the Meet link, charges); her Google
Calendar, the blocked time and the lesson's NIF are unaffected, and her own
copy says they weren't emailed. Lesson, move and cancel replies carry
`emailed: false` so her page says so. `POST /admin/students/:id/welcome` sends
their upcoming lessons and prices (below) and the one-click way in, then clears
the flag, after which emails reach them as usual. Signing in themselves also
ends the hold. Students made before this keep `awaiting_welcome = 0`, so
nothing about them changes.

The welcome's lessons (14 October 2026, Dan: "all their lessons and prices
already done properly") are read from the lessons themselves, so they are right
whenever she added them and whatever she has since changed. Each of a student's
upcoming confirmed lessons becomes a line, in the site's email design with its
subject and preheader unchanged: a weekly run is **one** line (`Weekly ·
Online`, `Every Tuesday, 17:00 · Porto time`, `From 20 October 2026 until 8
December 2026`, or `…, until you stop it` for a run with no end, and `60
minutes · €22 a lesson`), a lesson on its own is one line (`Lesson · Online`,
its date and time, `60 minutes · €22`, or `…· €22 paid` once it is paid), and the
trial is named. A lesson belongs to its run while it still sits on the run's own
Porto slot, length (lesson type) and place, and keeps its time on the student's
own clock; one that was moved, lengthened or put elsewhere reads as the lesson it
now is, never as a second run. A run never hides a week it has no lesson: for a
student she set up, the welcome is the only email they will have, because the
emails about a skipped week (her day off) or a cancelled one were held. So a run
line names the weeks between its first and last lesson that have none
(`No lesson on 22 September or 6 October`), unless the run has a lesson on that
day that now reads as its own line. A run with no end says `until you stop it`
only while it is active and only for its latest stretch; a stopped one says
`until` its last remaining lesson. The price is the lesson's own `amount_cents`,
which `repriceStudent` keeps on the student's own rate for lessons still to come
(a run's line uses the next lesson whose price is still open, never one she
marked paid by hand), and the length is the lesson type's. Times are on the
student's own clock, their timezone (Porto by default) for an online lesson and
Porto's for one in Porto, each time naming its clock as every email to them
does (`17:00 · Porto time`). Their own `Your price · 60 / 90 minutes` rows still
lead when she has set a price. Past twelve lines an `And more` line says how
many lessons are left to the website.
How they pay is as before: a link that adds their card where the site takes
cards, or the plain sign-in link.

A name alone is enough to set a student up (13 October 2026, Dan: she builds
on it later), and a student with no email yet has lessons like anyone else
(14 October 2026, Dan). `students.email` and `bookings.student_email` stay
`NOT NULL`, so a student without an address stores `no-email:<id>` in both,
as the key that stands in for it. No address can equal that, and every
sign-in, registration, reset and email-change path checks for a real address
first. The stand-in never leaves the database (`workers/booking/no-email.mjs`):
- nothing is sent to it. `deliver` in `email.mjs` returns without logging,
  rendering or sending for it, and drops it as a reply-to; every `student_*`
  message to them is also held, as for any student awaiting their welcome;
- no calendar file names it: `ics.mjs` leaves it out of `ATTENDEE`, and a
  lesson's description omits the `Email:` line;
- Stripe is never given it as `customer_email`;
- her copies of a lesson's emails read `No email yet` where the student's
  address would be, and are sent with no reply-to;
- `GET /admin/students`, `GET /admin/bookings`, the booking and student JSON,
  the no-show and paid-by-hand replies and `GET /admin/receipts` (so the CSV)
  show `""` for it.

`POST /admin/students/:id/welcome` is refused (400) until she gives an email.
`POST /admin/students/:id/details` sets name, phone, NIF and splat at any time.
It sets or corrects the email only while the student has never signed in (no
password, Google link or sign-in); after that it answers 409 and the student
changes it from their account. A changed address clears `email_verified_at`
and, in the same write as the account, moves **every** booking of theirs (past
ones too, so a receipt reads right) to it; a series has no address of its own,
and later weeks take the account's. Her corrections to a student's name and
phone reach every booking of theirs the same way, whether or not the address
moves (she adds `Adam` first and completes him later, and a receipt prints the
name on the booking). The welcome also gives any lesson still holding the
stand-in (one added from a stale read as the address was saved) the real
address before it sends. Nothing is sent by the change: they stay
awaiting their welcome until she sends it. An address another student has is
refused (409) and moves nothing. The student's own change of address
(`/me/email/confirm`) still moves only lessons still to come, and cannot apply
to an account that has never signed in.

### Students and attention

`Students` (14 October 2026) combines setup and ongoing care. Each student
appears once, with inline setup while incomplete and a regular student row
when ready. The Timetable keeps up to three operational notices, with
`See all in Students` when there are more. It does not repeat onboarding tasks.
The strip stays absent when empty.
It is built in the browser by the pure `needsYou()` in
`src/lib/teacher-calendar.ts` from reads the page already makes:

- `GET /admin/bookings` rows, with the computed `first_lesson` and the
  `student_changed_at` stamp; the cancelled rows the timetable drops are kept
  client-side, so a student's cancellation (`cancelled_by = 'student'`) can be
  listed;
- `manualPaymentReconciliation`, which now carries `student_name`, `starts_at`
  and the Stripe payment intent ids, for `Open in Stripe` (a link to the
  payment when the id looks like `pi_…`, otherwise to Stripe's payments list);
- `GET /admin/students` (`awaitingWelcome`, `nextLessonAt`, `email`, `signedIn`,
  `hasCard`, `hasLessons` and existing prices);
- `GET /admin/google-calendar`, for Meet needing to be connected or
  reconnected.

Meet first, then payments in the Worker's order, then
student changes newest first, then undated tasks by next lesson and name:
Google Meet; a payment Stripe never confirmed; a student
she set up and has not emailed, at any time once they have an email; a
student with no email, whose Add email opens their inline details editor; a
student with no confirmed lessons, whose Add a lesson opens the inline lesson
form; a lesson a
student changed in the last 72 hours (one card per weekly run and stamp); a
lesson a student cancelled in the last 72 hours (one card per weekly run,
View opens it read-only; the time is already open to students); and a new
student's first lesson
in the next 7 days (a student's own booking with no earlier confirmed lesson of
theirs, matching older rows without a `student_id` by email; a lesson Inês added
never reads as a first lesson, even after the student moves it). The
older-by-email check in `first_lesson` is written `+legacy.status` so SQLite
stays on `idx_bookings_student`; without the plus it scans every earlier
booking for each row returned. A lesson appears
once. The internal `no-email:` placeholder never appears; their email reads
as empty and the action opens their details, never sends. Two notices that
used to be emails to her (16 October 2026, Dan) come from `GET /admin/students`:
`cardDeclined` (each saved-card lesson payment, no-show fee or late change fee
still `payment_due`, listed with the payments until it is paid, `Open` going to
the student) and `cardAdded` (for `CARD_ADDED_NOTICE_DAYS`, 7, after a card is
saved: the lessons she added that it now pays for, so one already paid by hand
can be ticked `Already paid`). Declined cards also stay in Receipts. Nothing is dismissed: items clear
when done, after 72 hours, or once the lesson begins; the windows are
`NEEDS_YOU_RECENT_HOURS` and `NEEDS_YOU_AHEAD_DAYS`. `studentWorkspace()` groups operational notices by student ID, or an
unambiguous real email for legacy bookings. Payments match through their
booking ID; unmatched notices and Meet remain above the list. It ranks payments,
recent changes, Inês's setup work, first lessons, waiting students, then ready
students. The Students badge counts each actionable student once, plus general
notices; it excludes waiting on student sign-in or cards. Returning after five minutes away reloads lessons and
students, quietly: if the read fails, the lessons on screen stay and no error
replaces them. Nothing polls.

The views add no endpoint or stored setup flags. A first welcome uses
`{ "onlyIfWaiting": true }`: the Worker answers 409 `Their welcome has already
been sent.` before spending the rate limit once the student has been welcomed
or signed in. The Students card can still re-send deliberately.

Inline setup uses the pure `gettingStarted()` selector over the same read:
Email, Price, Lessons, Welcome, Signed in and Card. Checks mark completed
steps, an outline marks the next action, and a clock marks waiting on a student. Standard prices count as ready; setting a custom price is optional.
`hasLessons` includes confirmed past lessons and legacy lessons matched by email,
so returning students do not appear to need a first lesson. `hasCard` is returned
from the saved Stripe customer and payment method, consistent with `/me`.
The card step does not block setup when cards are unavailable.

Her steps expand in the row, reusing the details, prices and lesson forms.
Lesson creation includes a calendar and available start times from the existing
availability read, refreshed for the chosen lesson length. Choosing a slot
fills the date and Porto time. The calendar pages back twelve months: a past
day (or today's earlier times) offers every quarter hour from 07:00 to 21:45;
for a past time, Where and How often step aside and only the length and a
coral `Add past lesson` follow. A past time in the timetable offers
only `Add a lesson here`. There is no manual date or time entry in this form. The existing creation
endpoint still checks clashes and validates a weekly run. A saved change
refreshes the student list and timetable.
Each step opens its editor in the row. The student's name opens their full
profile and lesson history, during and after setup. Welcomes remain a separate explicit action. Each row says
what is needed; help uses short bullets. Sign-in and card belong to the student. `Send the link again` deliberately omits `onlyIfWaiting`, never sends
without an email, and surfaces the existing 3-per-hour endpoint's 429 message.
Waiting on students adds no badge count. All writes use the existing teacher
permission path and validation.

### Dormant students and the come-back email

Dormant (22 October 2026, Dan: "an option for Ines to add students to dormant
and also create a custom email to say you haven't had a lesson in a while but
here is the new website") is hers alone. Migration `0036-dormant-students.sql`
adds `students.dormant_at` and `students.dormant_emailed_at`; nothing a student
sees, books or is charged reads either.

- **Marking.** A student's profile (their name, then the lesson history panel)
  offers a lilac `Mark as dormant` button while they have no lesson to come,
  and `Mark as active` once dormant. `POST /admin/students/:id/dormant` with
  `{ dormant: true | false }` sets or clears `dormant_at`, teacher only; a
  lesson to come answers 409. Nothing is emailed.
- **Waking.** `GET /admin/students` returns `dormant` only while no confirmed
  lesson of theirs ends after `dormant_at` (`dormantSql()` in the Worker): a
  lesson they book, one she adds, or one she records as had after the mark
  makes them active again with nobody unmarking them. A lesson recorded from
  before the mark does not.
- **Her list.** Dormant students leave the main list for a `Dormant · n`
  section beneath it, by name, labelled `Dormant`, with no setup steps and no
  setup count on the Students badge. One with something new for her (a
  payment, a change, homework) stays up top until it clears.
- **Each student's email** (22 October 2026, Dan: "can the email be for each
  individual student but there be the default email already written for
  each"). A dormant student with an email has `Come-back email` in place of
  `Sign-in link` among their row's controls, since it carries one. Its panel
  is written for them: the subject, and `Olá <first name>,` above the default
  message, both hers to change for that student (150 and 3,000 characters),
  with `Start again` once she has, then coral `Send to Marta`.
- **The default** is what each panel starts from: the standard words in
  `DORMANT_EMAIL` until she saves her own (`settings.dormant_email_subject`
  and `dormant_email_message`) from `Default come-back email` above the
  dormant rows. Changing one student's email never changes the default; an
  email open and untouched when she saves a new default takes it up.
- **Sending** is `POST /admin/students/:id/dormant-email` with the subject and
  message exactly as she left them, greeting included. The Worker refuses
  anyone no longer dormant (409) or without an email (400), and claims
  `dormant_emailed_at` before sending: one email per student a day, so a
  second press or device sends nothing (409), and the panel says so: any 409
  reloads her list, so Send is not offered again. Settings are read before
  the claim, and a send that fails puts the claim back, so she can retry at once; the same words to
  the same address that day resend the first attempt's exact request under
  the same provider key, so a reply lost on the way never sends two.
- **The email** (`dormantInvite`, 41) has her subject, `Book your next
  lesson`, and her message as plain text (the Worker adds no greeting of its
  own), then `Sign in and book`, the one-click sign-in link (14 days, once) her welcome uses, and
  the welcome's footer. Replies go to her. A teacher who is also a student is
  never sent a sign-in link, so theirs is `Book a lesson`, to `/book/`. It is
  never held for a welcome: for someone she set up and never welcomed, it is
  their welcome, and `awaiting_welcome` clears once it is sent, so their
  lesson emails may follow.

Migration `0028-student-changed-at.sql` adds `bookings.student_changed_at`.
A student's own move (`handleReschedule`, `handleRescheduleSeries`) stamps it in
a separate guarded statement after the move succeeds, only on the rows and
sequence it wrote; Inês's move (`adminReschedule`) clears it the same way. Both
tolerate the column being absent (a warning, `student-changed-at`, in the
Worker's log), so the move itself never depends on the migration; changes made
before it is applied simply never show. The fee-detection SQL is not touched.

## Accounts

Booking requires an account, so a student's lessons persist together rather than
depending on them having kept the right confirmation email.

Sign-in links, Google first links, reset issuance/completion and email changes
bind the address and session version they verified. Pending-access cleanup is
part of the identity write's D1 transaction and runs only when that write wins;
a losing request cannot delete newer recovery links. The ephemeral
`auth-cleanup:` request-limit marker is removed in the same transaction.
Email-change confirmation also checks the presented session's revocation in
its identity write, so signing out while a confirmation is running cannot
produce a replacement session. Card removal checks the original account
version and session revocation in its write; dependent lesson and series
changes run only when that write wins, and its reply rechecks the session.
Homework answer writes bind that same version and revocation; every homework
reply rechecks access before returning private sheets or feedback. Stopping a
weekly series and claiming each cancellation or refund also bind the original
session. Recovery blocks later claims while a refund already claimed, or
marking already started for a saved submission, can finish safely.
Booking creation, weekly filling and weekly moves requested by a student bind
the original account version and session revocation inside their writes;
private booking and price replies recheck the session. A weekly move checks
each lesson's payment snapshot as well as its schedule, so a concurrent direct
payment cannot turn into a receipt for a different amount.
Replacing unfinished card setups targets the original checkout snapshots,
preserving a newer checkout created after recovery. A refused weekly recipe
removes its unopened card-setup hold while retaining confirmed lessons.

- **Opening quickly.** `/book/` asks for `/me` from its HTML, before its code
  loads. `/me` reads the session's student and its revocation together, then
  the settings, lessons and weekly runs together, then rechecks revocation
  before returning private data. Lesson reads and profile writes also bind
  the original account version, so a request that overlaps recovery cannot
  expose newly added lessons or overwrite the recovered account. The browser keeps the account as its session last read it
  (`ines-account-snapshot` in localStorage, a week at most, removed on signing
  out or when the session is refused) and opens Your lessons on it at once on a
  return visit while it asks again; booking and emailed links still wait for
  the reply.

- **Email and password.** Hashed with PBKDF2-HMAC-SHA256 at the OWASP iteration
  count — bcrypt and argon2 do not exist in the Workers runtime. The stored
  record carries its own algorithm, cost and salt, so the cost can be raised
  later without invalidating anyone.
- **Google Sign-In**, optional. Only non-sensitive scopes (name, email), so no
  additional Calendar permission. Absent a client id the
  button simply does not render. Returning accounts match Google's stable id.
  First email matching requires Gmail/Workspace authority or a matching,
  already mail-verified site session, as described below.
  Google renders that button itself and will not be styled, so the coral button
  a student sees is ours and Google's own is stretched over it at zero opacity.
  The click, the ID token and the Worker's verification are all still Google's;
  only the paint is hers. It means the button's hit area has to be checked
  whenever its size changes — Google sizes its own to 40px and its own width,
  and anything it does not cover is coral that looks like a button and is not.
- **Only one JavaScript origin is registered**: `https://portuguesewithines.com`.
  Google's ID-token flow consults that list and ignores the redirect URIs, so the
  button renders anywhere but can only complete there. Local development ships
  the client id and fails on click until its origin is added to the OAuth
  client. (The `dakibwa.github.io` preview behaved the same way until it was
  retired on 17 September 2026.)
- **Which tab leads follows who is likely to be there.** At the end of a booking
  the panel opens on *Create an account*, because almost nobody reaching that
  step has booked before; `/my-lessons` and `/schedule` open on *I have an
  account*, because nothing but a returning student arrives there. The two tabs
  sit in the same order everywhere — creating first — so only the selection
  moves, never the layout.
- Sign-in answers identically for a wrong password and an unknown address, so
  the endpoint cannot be used to discover who has an account. Each attempt is
  reserved atomically before the password is checked, so eight tries per address
  per 15 minutes hold whether they arrive one at a time or all at once, and a
  correct password inside a burst does not reopen the window — which does also
  hold off the real student, the accepted trade against guessing.
- **Sign-up does say when an address already has an account** ("Try signing in
  instead"). That lets someone test whether an address is registered, which
  sign-in, forgotten-password and email change avoid. It is deliberate (Dan,
  24 September 2026): hiding it would mean mailing every new student a
  confirmation link before they can book, and telling a returning student to
  sign in is the more useful answer. Five new-account attempts per connection
  an hour (IPv6 counted per /64), taken before the address is looked up, limit
  how fast addresses can be tested.
- Reset links are single-use and last an hour. A Google-only account has no
  password; using "forgot password" is how such a student sets one.
- **Sign-in links** (migration 0023). `Email me a sign-in link` on the sign-in
  panel (`POST /auth/email-link`) emails an existing student account a link
  that signs it in once, within 30 minutes; the answer is the same whether or
  not the address has an account, and each account gets three an hour. The
  links in emails Inês causes last 14 days. A link is signed like a reset under
  its own prefix, and its `sign_in_links` row is the record that it is unspent:
  `POST /auth/email-link/confirm` deletes the row first, so of two clicks one
  signs in (the page calls it only when the student presses `Sign in`, so a
  mail scanner opening the link spends nothing), and only while the account still has the address the link was sent
  to. A link proves the address. On an account that was registered with a
  password and never proven, it makes a Google first link's transition: the
  password, other sessions and any pending reset or address change go. Teacher
  accounts are never sent one. `/book/?signin=` takes the link out of the
  address bar at once and shows `Sign in`; pressing it opens `Your lessons`,
  and a spent or expired link opens the panel on asking for a new one.
- **An address counts as proven once it has received mail.**
  `students.email_verified_at` (migration 0020) is set by any Google sign-in,
  a completed password reset or a confirmed email change; registering with a
  password leaves it empty. Migration 0020 marks every Google-linked account as
  proven, and 0021 marks existing password accounts that already have a
  confirmed lesson as proven too, so Inês's regular students are never signed
  out by it; accounts with no confirmed lesson start unproven. It decides
  whether a lesson Inês adds for that address clears a password first (see
  *Who can do what*): for an unproven password account it signs them out once,
  and that confirmation tells them how to get back in. Apply
  `workers/booking/migrations/0020-verified-email.sql` and then `0021` to both
  databases before deploying the Worker that writes the column: sign-in,
  password reset and email confirmation fail without it, and `/health` reports
  `schema` until it exists.
- Sessions are signed bearer tokens in `localStorage`, not cookies: the site
  and the API are different origins, so a cookie would need `SameSite=None` and
  would be dropped by any browser blocking third-party cookies. Signing out
  revokes the presented token server-side when connected. Password reset and
  verified email changes increment the account session version, invalidating
  older sessions. Email changes also unlink the old Google identity. Legacy
  sessions remain version zero until revoked; emailed manage links keep their
  existing scheme. Sessions and manage links share one signing key, so a
  session token also verifies as a manage token; a manage link is looked up
  only when it names a UUID, as every booking id is, so no session can ever
  open a booking. Offline sign-out clears this device but cannot reach the
  revocation endpoint.
  A failed session-storage write never claims successful sign-in. The form
  explains how to allow site storage and retry; a completed registration offers
  sign-in instead of another registration. Password reset still reports the
  completed password change when its new session cannot be saved.
  Email confirmation reports its completed address change if saving the renewed
  session fails, then permits sign-in with the new address. Opening the lessons
  destination with an expired/revoked session asks for sign-in after the account
  read refuses that session; network failures retain the existing read retry.
  The profile editor focuses its initial field when it opens, before the student
  can choose another; delayed frame callbacks cannot steal later typing.
- The emailed manage link still works on its own, so a forgotten password never
  blocks someone from changing a lesson.
- **Booking, the learner's calendar, and lesson changes share one workspace.**
  Anyone signed out lands on the booking calendar at `/book`, ready to book,
  beneath one pre-filled choices bar: `Trial` (for a first-time visitor, and
  then the default), `Single` or `Weekly`; Online or In Porto; the 60/90-minute
  length with its price (the trial's fixed length instead); and for weekly
  lessons 4, 6, 8 weeks or `Ongoing`. Each choice changes in place and the free
  days follow it, so duration is always settled before times are offered.
  A returning signed-in student opens directly on their lessons calendar, whose
  top-right `Book a lesson` opens the same bar and calendar. After the starting
  time is chosen, the journey goes straight to confirmation while later weeks
  are checked. A fully available repeat stays quiet; only clashing weeks or a
  failed availability check take space before booking.
  Viewing lessons is one calendar card that carries the account too: `Your
  lessons` with a `?` tooltip, the student's name beneath it as the account's
  menu, and `Book a lesson`; then the next lesson with its Meet link, then the
  calendar four weeks at a time, without free-time choices. There is no
  separate list to keep in step with it.
  Signed-out visitors can browse lesson types, dates, and times before they are
  asked to sign in; `Already booked? Sign in` asks immediately because the
  data is private, while booking asks only at confirmation. It is a coral
  button in the bar's head on a browser where a student with a booked lesson
  has signed in before (a local flag that outlives the session and grants
  nothing; Inês or an unused account does not set it), and a quiet
  line beneath the calendar for anyone else. It opens the `Your account` card
  on its own, with `Back` above it.
  Every booked lesson is marked there, weekly lessons in lilac and one-off
  lessons in coral. Choosing a date with one lesson opens that lesson; a date
  with several lists them in a dialog titled by that date; a free future date opens booking
  on that day with its times. It never creates a second selected-day panel.
  While booking, a chosen free day's times sit beside the calendar on wide
  screens and take its place on a phone, headed by a short date with `Change`
  beside it on one row. The times come in two fixed
  halves, from Inês's earliest start across the loaded weeks to 14:00 and from
  14:00 to her latest, so the toggle's labels are the same every day. On
  another clock they divide where 14:00 in Porto falls on the student's, or at
  noon when her day crosses the student's midnight. Before a day is chosen the
  times panel stays out of sight and the calendar takes the whole row; a
  window with nothing free says so beneath the calendar.
  Available times use one compact grid without headings, one half of the day
  at a time, and fit accessible time buttons across a phone. The confirmation keeps the
  choices bar beside the chosen lessons, so kind, place, length and repeat still
  change there; a chosen time is kept when it is still free for the new lesson
  and otherwise the times return with a note. Clashing weeks of a weekly run
  are listed beneath the chosen lessons, where the repeat and length change,
  so a signed-out student sees them before making an account. `Add another lesson` or `Add a
  second weekly time` is a dashed card beneath the lessons, and while one is
  added the bar gives way to the lessons chosen so far and `Back`. Both calendars page four weeks at a time; `Later weeks`
  counts the booked lessons beyond the page, and the lessons view pages as far
  as the last booked lesson. A calendar's header names the months its weeks
  start in beside the arrows, each week starts with its own month, a month that
  begins part-way through a week marks its 1st, and the key sits beneath the
  weeks. Choosing an
  individual booking opens move and cancel in place. The emailed token still
  opens that same interface without requiring sign-in, so a forgotten password
  never blocks a change. The old `/my-lessons` and `/booking` paths remain valid
  for links already in the world, then normalise to `/book`.
- **The signed-in account lives in the lessons card.** The account has one
  menu: `Your lessons` with the upcoming count, `Past lessons` with no badge,
  `Edit details` and `Sign out`. On a wide card its places sit open in the
  header as one sliding control, with the name and `Sign out` beneath it at
  the left; on a narrower one the student's name, under the heading of
  whichever account card is showing, opens it. Booking lives on the card, not
  in the menu. Choosing your or past lessons opens a complete view and switches
  away from any active booking or lesson-management detail. Clicking the
  current destination keeps it open. Past lessons and Your details take the
  calendar card's place, headed the same way, with a `Your lessons` way back
  where the menu is folded;
  neither keeps the future calendar, and `Done editing` returns to Your
  lessons. An empty history gets an empty state rather than losing the menu
  item. While booking the menu waits, and the booking bar's `Your lessons` is
  the way back.
  There is only one `Booking`
  destination in the site navigation — no separate `My lessons` tab — because
  booking and managing lessons are the same workspace.
- **Your lessons is the calendar.** It opens first for a signed-in student
  and remains available as `Your lessons` in the account menu.
  After a successful booking, `Back to your lessons` opens this same
  calendar, with the new lesson on its day. On a wide card each booked day
  shows the time its lessons run from and until with a globe (online) or a
  little person (in Porto), the next lesson's day is filled in, and hovering or
  focusing a day shows its lessons in full; on phones and narrow cards, or when
  the next lesson is beyond the first four weeks, the next lesson also leads
  the card as a row with its Meet link. Weekly lessons are
  lilac and one-off lessons coral; a weekly lesson's dialog offers `Manage
  weekly lessons` for the whole run, and `Your lessons` counts an active repeat once.
  The `?` beside the calendar's month explains that booked lessons open and
  other days start a booking. Once booked, ordinary lessons use the compact duration label (`60
  mins` or `90 mins`) instead of repeating the product name; trial lessons keep
  their name. There is no other context strip or selected-day detail card.
  Opening a lesson leaves the calendar where it is and shows a compact
  `Change` or `Cancel` overlay. `Change` reuses the existing calendar date and
  time picker and, when payment state permits, offers the ordinary `60 mins`
  and `90 mins` lengths plus Online/In Porto in matching sliding controls.
  Each cancellation or recurring decision keeps focus inside the changed dialog.
  Terms/privacy can open above lesson management. Escape dismisses only the
  top dialog, preserving the underlying lesson, management token and scroll lock.
  The account menu also leaves Escape to an open modal and retains that modal's
  original return target. A dialog's backdrop only dismisses a gesture that
  starts and finishes there; selecting or dragging text/fields out of the
  dialog preserves its draft.
  Payment recovery replies are ignored after its account changes or the page
  closes, so an abandoned request cannot redirect to Stripe or reopen an error.
- **Past and cancelled lessons keep the same readable card hierarchy.** Their
  status, mark, date, compact duration, location and booking reference sit on
  one readable card, without an action treatment that suggests they can still
  be managed.
  The current date and time are selected when it opens, and the calendar and
  choices sit on one modal surface without nested framed panels. `Cancel` stays in the overlay for
  explicit confirmation. Recurring
  occurrences are identified there as part of a sequence: either action affects
  only that lesson. Stopping prevents future top-ups
  without cancelling dates that are already booked, and those retained dates
  then show as ordinary one-off lessons on the calendar.

### Repeating bookings

**Selecting several lessons together** (released 11 September 2026; Worker
version `09d37a19`): one request can select up to eight
single-lesson dates, or two weekly starting times within the same Porto
Monday–Sunday week. Duration, location and repeat period are shared. Trials
remain single. `POST /bookings` accepts `startAts`; the existing `startAt` route
still books one lesson. The server normalises instants, rejects overlap and
enforces the same-week rule independently of the browser.
The second weekly time can span two weeks on the student's displayed clock;
the calendar exposes every local date in that Porto week rather than hiding
valid starts behind the first time's local week.

The two recurring times use separate existing `booking_series` recipes. One
D1 transaction inserts all planned lesson rows after an atomic overlap check,
or leaves no selection or empty recipes behind if another booking wins the
race. Later unavailable occurrences are previewed and skipped individually;
both initial times must still be free. No database migration is needed.
Availability excludes occupied single-lesson times as well as recurring ones;
rescheduling ignores only the specific lesson or series being moved.

New payers save a card once for the whole selection. All its rows share the
created Checkout Session, and its signed metadata records the expected row
count. Confirmation verifies the saved card and atomically transitions every
held row, refusing a partial or expired selection. Replay/concurrent delivery
cannot send duplicate confirmations. One email each way carries the combined
calendar events. Returning payers schedule each lesson's own end charge;
single lessons and each weekly recipe keep their existing manage controls.
An abandoned setup releases every held lesson and empty series.

A student can hold the same slot every week for 4, 6, or 8 weeks, or choose
`Ongoing` so it continues until they stop it. An open-ended schedule is kept
twelve weeks ahead by the nightly top-up rather than creating an unlimited
number of booking rows at once.
Each extended occurrence and the considered-week bookmark commit together
against the current recipe and bookmark. A job planned before a move, stop or
another extension cannot add old times or overwrite the newer bookmark. A
competing booking still skips only that week. Initial card-setup holds are not
extended until confirmed. Stopping ends extension before reading the remaining
lessons, so its cancellation set includes every occurrence committed first.
Teaching hours, exceptions and notice settings advance an internal availability
revision in their write transaction. Student claims and moves, and weekly
occurrences with their bookmarks, require the preview's revision at commit.
A concurrent hours or time-off change therefore requires a fresh preview.
Student creation and moves also refresh the target notice cutoff just before
claiming; a weekly move refuses a plan that crosses a source or target boundary
while validation runs. Inês's explicit calendar additions retain their override.

- **The occurrences are ordinary rows in `bookings`.** A series is only the
  recipe that made them. That is what puts the time in Ines's calendar for real,
  and it means every per-lesson behaviour already built keeps working without
  knowing series exist — the manage link, the iCalendar `UID` and `SEQUENCE`,
  the late change fee, moving one week for a dentist appointment.
- **The slot is stored as a Porto weekday and minute-of-day, not a UTC time.**
  A run booked in October crosses the change to winter time; holding the UTC
  instant would move every later lesson an hour earlier than the student agreed
  to. Occurrences are stepped by date, so 18:00 stays 18:00.
- **A week that is not free is skipped, not fatal**, and the student is shown
  which weeks before they confirm rather than after. One holiday in week six
  must not stop someone booking the other eleven.
- **Series occurrences ignore `booking_horizon_days`.** That horizon stops a
  stranger reaching in and taking a slot months out; a student keeping their own
  standing time is the case it is meant to allow. Even at the current 84 days,
  a run starting a few weeks out would otherwise quietly lose its last weeks.
- **One initial email each way, carrying every current lesson in one calendar
  file**, each event under its own booking's UID so a later change to one week
  still matches the entry already in her calendar. Twelve lessons must not mean
  twelve emails. When an open-ended run is topped up, the new lesson appears in
  the student's booking calendar without another confirmation email. When
  teacher notifications are enabled, Inês gets one calendar update so the added
  time reaches her external calendar; that copy is currently paused during development.
- **Existing open-ended series are topped up by the nightly scheduled sweep**, not on a page view: her
  calendar has to be right whether or not anyone has opened the site, and a read
  path that quietly writes bookings is impossible to reason about later.
- **Stopping a repeat keeps the lessons already booked.** Someone who stops
  repeating almost always still means to attend the ones in their calendar;
  cancelling those silently would be the worse of the two mistakes. Passing
  `cancelRemaining` cancels them too. It applies the same payment policy as an
  individual cancellation: a future paid lesson is refunded, an uncharged one
  is never charged, and a lesson inside the 14-hour window remains booked. A selected
  weekly lesson exposes `Manage weekly lessons`, keeps both outcomes visibly
  distinct, and asks for confirmation before calling the stop endpoint.
- **Moving a recurrence moves every future confirmed occurrence together.**
  The student chooses the new weekly anchor, length, and location through the
  same compact change-booking controls. Every proposed week is checked before
  one guarded database update moves the run and its series recipe; a newly
  claimed slot or concurrent individual change moves none of it. Each planned
  occurrence is guarded by its sequence as well as its prior slot.
  The recipe changes only after the guarded move updates every planned row,
  including when a pending refund refuses a move to an individually adjusted
  time. Planned rows use JSON-backed SQL CTEs so long ongoing runs fit
  [D1's 100-bound-parameter limit](https://developers.cloudflare.com/d1/platform/limits/).
  Past lessons
  are left alone, and a lesson inside the 14-hour window stays where it is while
  the rest of the run moves; the new weekly time may not overlap it, and the
  response lists its start under `kept`. Each booking keeps its
  calendar UID, increments its sequence, and the student receives one combined
  updated calendar email. Inês's copy follows the existing development pause.
- **A run saves a card once and charges each lesson after it.** Stripe Checkout
  runs in setup mode, so no money is taken while the run is booked. The whole
  run is held until its webhook proves a reusable card exists, then every
  occurrence becomes `scheduled`. The minute cron charges an occurrence
  only once its no-show window has closed, six hours after `ends_at` (see
  *The no-show policy*). Open-ended top-ups inherit the same consent
  and scheduled state. A declined charge marks the row `payment_due` and emails
  the student a hosted pay-now link; Inês sees it as a Needs you card until it
  is paid (16 October 2026: no longer emailed to her).

### Changing your name or email

- **Name changes straight away; the address you sign in with does not.** A new
  address is mailed a single-use, one-hour link and nothing moves until that link
  comes back — an address change that takes effect on assertion alone is a way to
  point your account at someone else's inbox. The address on file is told a
  change was requested, because it is the one that would notice a request nobody
  made.
- **The answer is the same whether or not the new address is already in use.**
  Saying "that one exists" would make this a way to test who has an account,
  which sign-in and forgotten-password already go out of their way not to reveal.
  Nothing is written and nothing is sent when it is taken.
- **Google sign-in matches on the Google account id, not the address.** Matching
  on email alone and overwriting `google_sub` was an account takeover: point your
  own row at an address someone else uses with Google, and their next sign-in
  hands you their account with your password still on it. Email is kept only as a
  fallback for someone who registered with a password first, and never claims a
  row already linked to a different Google account.
  First email matching requires Google to be authoritative for that address:
  Gmail, or a verified Workspace token carrying its hosted domain. A verified
  third-party address alone cannot claim or create a site account. Its owner
  first signs in with email (or creates an email account), then can link Google
  while signed into that same already mail-verified account. That explicit own
  link preserves their password and sessions. Existing linked Google ids keep
  working independently of email-domain authority.
- On a confirmed change, outstanding password resets are deleted — a live reset
  link sitting in the old mailbox would otherwise stay valid for its hour — and
  future lessons are re-addressed. Past and cancelled lessons keep the address
  they were taken under, which is the record of what happened.
- The confirming browser saves the renewed session without closing this
  account's profile editor. Confirmation updates the verified email while
  preserving newer drafts and independently saved name/NIF fields. The link's
  token is removed before the request waits; a late reply cannot rewrite a
  page the student has since opened. Replacing the account or signing out
  still clears its private views.
- An account reload started before a successful profile save cannot restore
  the older saved values. Booking replies also belong to their original
  page and session: they cannot redirect an abandoned page or unlock a
  replacement account's pending booking. A failed account refresh after a
  successful booking, move, cancellation or sequence change keeps the
  confirmation and offers a reload retry, including inside lesson management,
  without repeating the mutation. A move renders the saved booking returned
  by its POST, so an unavailable detail reread cannot undo the displayed success.
  Change controls stay disabled while the save is pending.
  Delayed Meet polling cannot overwrite a completed move or cancellation.
  Name and splat saves update the calendar's account identity immediately.
- Background account refreshes update both the calendar and the account menu's
  lesson count/history. Incoming lesson data preserves the student's profile
  drafts and independently saved fields; a successful refresh clears an older
  account-read warning without clearing profile-save errors.
- Availability replies belong to their original length, location and session.
  An older retry cannot replace a newer lookup's times or error state. Changing
  session reloads availability with the current account's hold exclusions.
  Free times asked for in the last minute are reused for the same lesson,
  window, managed lesson and session, so going back to a lesson just seen
  shows its times at once; anything sent to change a booking forgets them all,
  and booking still checks the time itself. The page asks for its lesson types,
  its first lesson's times and a stored session's account from its HTML,
  before its code has loaded; each answer is taken once, and only by the exact
  request the page would have made.
- **Times are on the student's own clock.** The Worker keeps every time in UTC
  and groups free times by Porto's dates; the page shows an online lesson on
  the browser's clock and a lesson in Porto on Porto's, regrouping free times
  by the dates of the clock shown. For a student whose clock differs from
  Porto's at any time of year, a time standing alone names its clock (`09:00
  Los Angeles time`) and the calendar's header says which clock the times are
  on, one at a time: the place chosen's while booking, and on Your lessons the
  next lesson's, switching while a lesson on the other clock is hovered or
  focused; in Portugal times stay plain. Weekly
  runs stay anchored to their Porto wall time, so around a clock change their
  time elsewhere moves by an hour for a few weeks. A student's emails follow
  the same rule: the lesson's own clock (theirs online, Porto's in Porto),
  named once after the time, from the timezone saved with the booking; Inês's
  copies lead with Porto time and add the student's own beneath it when it
  differs.
  A failed length lookup retains the selected dates and offers an in-place
  retry. The pending recheck remains until fresh availability arrives. Rechecks
  compare the whole selection, including the lesson gap, and remove later
  conflicting starts with a clear notice rather than submit overlapping lessons.
  They also run while a lesson is being added or changed, before offering more
  times. Back restores a changed lesson only after checking it against the
  current availability and the other selected lessons.
- Account, schedule and lesson reads also validate their nested rows before
  rendering. Invalid dates, missing lesson objects, malformed series/exceptions
  and unreadable recurring previews produce recoverable feedback, preserving
  the session. An invalid skipped-date reply cannot invent a clash in 1970.
- Booking creation, cancellation and move replies validate the returned
  lesson before showing success. Invalid selection/series dates and teacher
  booking acknowledgments are rejected too, retaining the form without
  automatically repeating the mutation. Email-change acknowledgments must
  contain a usable address; an invalid renewed session is never stored.
- Booking choices, notes and consent stay disabled while submitting. During
  embedded checkout, length, location, kind and repeat stay disabled, and
  changing/adding dates is unavailable. The summary continues to describe the
  held booking whose card form is open.
- A payment library that downloads without exposing Stripe is a recoverable
  load failure. `Try again` retries the library or checkout initialization using
  the same held booking and client secret, without booking again. Signing out
  or replacing the account also dismisses its pending checkout-return check;
  a late verification cannot restore that account's success banner.
  The `card=added` return flag starts verification; it does not prove a saved
  card or charging agreement. Success reflects the current account state and
  clears after card removal.
  Move and cancel requests may include `expectedLateFeeCents`. If the current
  fee differs, the Worker answers 409 before changing the lesson and the page
  shows the new fee for explicit confirmation.

### NIF for receipts

- **Optional, and only for the fiscal document.** A student can give a NIF when
  creating an account or later under *Edit details*, where it can also be
  changed or cleared. Google sign-in creates accounts without one. A private
  customer's NIF goes on the fatura-recibo only when they ask (CIVA art. 36.º
  n.º 16); without one, Inês issues to consumidor final.
- **Stored tidy and checked.** `students.nif` (migration 0017) holds nine digits
  or an empty string. Spaces, dots, hyphens and a `PT` prefix are removed, and
  anything that fails the mod-11 check digit or starts with 0 is refused with a
  plain message, so a mistyped number never reaches a tax document.
- **Independent profile saves.** Saving a name or NIF sends and applies only
  that field, so overlapping replies cannot undo another saved field. A NIF
  reply normalises the submitted draft only if the student has not edited it
  again while waiting.
  The Worker updates only submitted columns too, so concurrent saves cannot
  restore stale values in D1. Account creation handles an email claimed after
  its lookup: password registration offers sign-in; Google resolves the winning
  row through the existing verified identity and first-link rules.
- **Receipts (13 October 2026, Dan).** `GET /admin/receipts?month=YYYY-MM`
  (teacher session or `ADMIN_TOKEN`) answers every amount for lessons starting
  in that Porto month: one line per lesson price (or the no-show amount that
  replaced it) and one per late change fee, each with a stable `id`
  (`<booking id>:lesson` / `:fee`), the student's name, email and current NIF
  (empty for consumidor final), `amountCents`, `method` (`card` / `by hand`),
  `state` (`paid`, `refunded`, `due`, `charging`), the Stripe PaymentIntent
  for card payments, and `ready`, true once the money is in. A lesson with
  nothing on a card counts as paid by hand once it has happened; a cancelled
  lesson appears only if money moved; a lesson still to come only once paid.
  One ticked `Already paid` is paid by hand, ready, past or to come. A free
  lesson (`free`, €0) and an unticked record (`recorded`) never have a line:
  there is nothing to issue for either (16 October 2026, Dan).
  Her Receipts tab shows the same lines and downloads them as CSV, so her
  automation can work from the JSON, the CSV or the table and remember each
  `id` it has issued. The rules live in `workers/booking/receipts.mjs`.
- **Where it appears.** Inês's fatura-recibo automation reads her booking
  emails and schedule, so every email she gets about a student's lessons
  (bookings, weekly runs, moves, cancellations and payments)
  carries a `NIF` row beside the student, with the number or
  `Not given (consumidor final)`, read when the email is sent. Her Receipts
  tab and her student profiles state it the same way; her lesson details are
  about the lesson and no longer carry it. The student's own payment email shows it,
  when given, so they can check it before the receipt is issued; their other
  booking emails do not. It is never sent to Stripe or written to logs, and it
  stays out of the shareable Google Calendar events.
- **Release order.** Apply `workers/booking/migrations/0017-student-nif.sql` to
  both databases before deploying the Worker that writes it. `/health` reports
  `schema` until the column exists, so the site's release gate refuses to
  publish against an unmigrated database. Released 15 September 2026: 0017 on
  staging and production (existing accounts start without a NIF), Worker on
  both, site `592b622`.

### How far ahead you can book

`booking_horizon_days` is **84** (Dan, 22 September 2026, migration 0018):
students can choose a lesson up to twelve weeks ahead, and the calendar shows
that window four weeks at a time rather than as one long scroll. It was 56
(eight weeks) from 30 August 2026.

- The front end asks for a window wider than the horizon and lets the Worker
  clamp it. It used to ask for a fixed 62 days while sizing the grid from whatever
  horizon the API reported, so raising the horizon past 62 would have drawn weeks
  of empty cells saying "no times free" — a lie rather than a gap.
- The calendar pages through the window four Monday-to-Sunday weeks at a time.
  A repeating series may already own lessons beyond the window. The lessons
  view keeps paging until its last booked lesson, `Later weeks` counts what
  lies beyond the page on show, and those lessons open the same in-place
  move/cancel interface.
- A signed-in student with any non-cancelled booking is never offered the trial,
  matching the Worker's booking rule. An unfinished card setup of their own
  (`status: "pending_payment"` in `/me`) is the exception: their next booking
  replaces it before the trial check (see *Payment*). If that eligibility becomes known
  after the trial was selected (for example after signing in at confirmation),
  the trial choice dissolves and the valid lesson choices return without a
  warning banner or a failed booking. The site also leaves the trial out for a
  student already signed in, or on a browser where a student with a booked
  lesson has signed in before; that is decided as booking opens, so an account created at the
  confirmation keeps the trial being booked. The Worker's rule is unchanged.
- The confirmation carries the same choices bar as the calendar, so location,
  length, kind and repeat change in place there; there is no separate
  `Change details` route or setup screen to return to.
- **When she moves a lesson, the emails say so.** They used to go out in the
  student's own voice — "that's done" — and tell her the student had moved it.

### What stops two people booking one lesson

The availability check and the insert used to be two statements with nothing
between them, which is a race, and not a theoretical one — under load, four
different students were confirmed into the same lesson in testing.

- **The decision and the write are one statement.** A booking row is inserted
  only if nothing overlapping exists, and zero rows affected is the 409. The
  same guard is on rescheduling and on every occurrence of a series.
- **Overlap, not equality.** Lessons are 60 and 90 minutes and can start on
  any quarter hour, so a 90-minute lesson at 17:00 and a 60-minute one at 17:30
  collide while starting at different times. A unique index on the start time
  would miss that. For a student's lesson the guard widens each lesson by the
  free gap on both sides, which keeps that gap between any two lessons.
- A series occurrence that loses the race becomes a skipped week rather than a
  failed booking: the rest of the run is still worth having.

### Notes on the email and calendar output

- **Sixteen templates.** `workers/booking/email-templates.mjs` owns every
  email's words and structure; callers pass formatted facts. Student booked
  (one lesson or a run, by them or by Inês, with or without her welcome
  steps), Inês's booked copy (including a run carried forward), reminder and
  Meet link, student and teacher moved, student and teacher cancelled, the
  student's receipt (lesson, no-show or late change fee), Inês's payment
  received, the student's declined card, welcome, sign-in link, password
  reset, email-change confirmation and notice, and homework to review.
  Subjects, and the subject, heading and preheader of her payment emails, are
  unchanged because her filters and receipt automation read them.
  `node scripts/render-email-previews-v2.mjs [dir]` writes every variant as
  HTML and text with a manifest of the old emails each covers.
- **Dark mode and phones.** The layout declares `color-scheme: light dark`
  and carries one `<style>` block: `prefers-color-scheme: dark` (and
  Outlook.com's `[data-ogsc]`) recolours the page, card, panels, text and
  amounts; under 480px margins tighten and the button fills the width. Inline
  styles alone still give the full light design, and every text has an
  explicit colour so a client that inverts backgrounds cannot leave it unreadable.
- Customer emails use short introductions and one action button. HTML keeps
  the complete action link in that button; the plain-text alternative includes
  the URL. The price row carries payment timing and the footer keeps the
  applicable cancellation/no-show rules without repeating payment timing, or
  a fee or refund the note above it already states (a late move on a saved
  card ends `This fee applies once per lesson.`). A cancellation names its
  place rather than linking its call, and an automatic notice ends `Sent
  automatically by the booking system.` above the site's link.
  Amounts are written as the site writes them: whole euros bare (€25), anything
  else with its cents (€22.50), never rounded.
- `email/receipt-kit/README.md` and `scripts/build-receipt-email-kit.mjs` provide
  the matching Gmail/Codex receipt-email kit. It attaches the original fiscal
  PDF issued by Inês's separate automation; it does not issue documents or send
  customer receipts from the booking Worker.

- **Everything a student typed is escaped.** Four fields reached the HTML raw so
  that callers could pass `<br>` — meaning a name, an address or a lesson note
  arrived in Inês's inbox as markup, and she is the one person who reads every
  one of these. Callers now send `\n` and the template turns it into a break.
- **`CN=` is a parameter, not a text value.** iCalendar text escaping is wrong
  there — a semicolon starts the next parameter and a colon ends the list — so a
  student's own name could forge calendar properties or cut the address off the
  ATTENDEE line. Parameter values are quoted per RFC 5545 §3.1 instead.

### The day-before reminder

- About 24 hours before each confirmed lesson, the student gets one email,
  `Your lesson is coming up — <date, time>`, on the lesson's own clock: theirs
  online, Porto's in Porto.
  - An online lesson whose Google Meet link is ready has `Join Google Meet` as
    its button, with `Change or cancel this lesson` as a quiet link beneath.
  - Otherwise the button is `Change or cancel this lesson`.
  - The footer names the exact time free changes end: the start less the
    minimum notice, on the same clock. There is no price, no calendar file and
    nothing to Inês.
- The minute cron (`sendLessonReminders`) sends it, at most six a minute, only
  while the lesson is between 24 hours and the minimum notice (14 hours) away.
  That way the free change it mentions is always still open.
  - Times are elapsed hours in UTC, so clock changes don't move it.
  - After an outage of more than ten hours, a lesson already inside 14 hours
    gets none.
- A lesson booked, added or moved less than 36 hours before it starts gets no
  reminder: the confirmation or change email has just told the student. (Read
  from `bookings.created_at` and the `student:rescheduled:` and
  `student:series-moved:` keys in `email_log`, so a card saved or an address
  changed does not suppress it.)
- One reminder per version of a lesson (`student:reminder:<id>:<sequence>` in
  `email_log`). A lesson moved earlier is reminded at its new time; a cancelled
  one never is, and the row is read again just before sending.
- A student Inês set up gets nothing before their welcome. Once it has gone,
  the reminder follows if the lesson is still more than 14 hours away,
  carrying their Meet link. A student she set up with no email yet
  (`no-email:` placeholder) is never listed or sent anything.
- If the Meet link isn't ready, the reminder says it will follow (only when
  Google Meet is configured at all), and the existing `Your online lesson link`
  email sends it once it exists. A reminder that carried the link marks it
  delivered, so no second link email follows.
- Weekly lessons get one each week, including automatic top-ups. A lesson on a
  day Inês has taken off is still reminded, because time off never cancels a
  lesson.

### When email fails

Each delivery saves its exact provider request before sending and uses a stable
hashed Resend idempotency key. A two-minute conditional lease permits recovery
after an interrupted send; provider calls time out after 30 seconds. Pending
attempts are never reported as delivered, and retries reuse the original bytes
and first-attempt time rather than rendering a different message.

Retries stop after 23 hours, within Resend's 24-hour idempotency retention.
Legacy attempts without a saved body/key, recipient changes and expired attempts
become `unconfirmed` for manual reconciliation. No automatic resend can turn an
ambiguous old attempt into a duplicate. Saved bodies, including private links,
are purged after success, dry-run or expiry.

The booking sweep retries only current confirmation/change/cancellation keys,
status, sequence and recipient, filtering before its batch limit so superseded
failures cannot starve current messages. Reminders, Meet links, payment notices
and homework notifications revalidate eligibility in their own sweeps. Homework claims expire
after an interruption and reconcile proven delivery before claiming again.
Messages held until a welcome, or skipped for a missing address, never count as
delivered Meet links. A proven earlier send can repair a lost delivery marker.
A cancelled run remains one combined email rather than one send per lesson.
Per-lesson and combined lifecycle messages store every included lesson's
identity, version, owner, dates and rendered financial facts. The sweep filters
that complete snapshot before its batch limit and the send claim checks it
again. A changed member cannot replay a stale combined confirmation. Snapshot
metadata is purged with the private body after delivery or expiry.
Mixed-price runs name each occurrence's own amount and payment terms rather
than presenting the first lesson's price as the price of every lesson.

### The no-show policy

For a confirmed saved-card lesson, the teacher schedule offers `Mark no-show`
from the scheduled start until **six hours after the scheduled end** (Dan,
23 September 2026; `NO_SHOW_WINDOW_HOURS` in `policy.mjs`), so Inês can record
it after the lesson rather than during it. The same control can undo the mark
during that window. `POST /admin/bookings/:id/no-show` (`{ "noShow": false }`
undoes) accepts the change only inside that window and only while
`payment_status = 'scheduled'`; from six hours after the end it answers 409.
Because a no-show changes the amount, the lesson's own charge waits for the
window to close: nothing about the lesson's payment — the charge attempt, the
move off `scheduled`, the receipt, a declined card's pay-now email — happens
before `ends_at` plus six hours. The charge sweep then claims the row as
`processing` before reading attendance, so the teacher decision cannot race the
PaymentIntent. Until the charge, a lesson inside the window is still an
ordinary `scheduled` one, so Inês's own move and cancel still reach it.
Attendance writes also require the original lesson version and times. Moving an
uncharged scheduled lesson to a genuinely different time clears its old no-show;
a same-time edit and already committed payment retain attendance evidence.

- **Expected attendance** charges the booked lesson price six hours after
  `ends_at`, on the first minute sweep once the window has closed.
- **No-show** charges €5 at the same point, instead of the booked lesson price.
- If Inês configures that fee to zero, the Worker settles the zero obligation
  without a Stripe request, receipt or payment-recovery link. A positive charge
  already captured under its immutable request keeps that original amount.
- Bookings without explicit automatic-payment consent remain
  `not_required`; the teacher control is not offered for them.
- Moving or cancelling less than 14 hours before the lesson is a separate €5
  action fee, stored independently so a retry or second edit cannot duplicate
  it, and still charged when the change is made. Its columns keep their
  original `same_day_*` names.
- **It is said before booking, not only after.** A charge someone first learns
  about by being charged is the kind that costs a relationship. It appears on the
  booking page's policy band, directly above the confirm button, on the
  confirmation screen, in the confirmation email, and in the FAQ.

### How her calendar stays current

Students receive iCalendar attachments. Before Google connection, Inês also
receives these attachments; their automatic addition depends on her calendar
client settings. Once connected, the Worker syncs events directly to her dedicated
lessons calendar and omits her new attachments to prevent duplicates. Three things make an update
land on the existing event rather than duplicating it, and all three are easy to
get wrong:

- `UID` is stable for the life of the booking.
- `SEQUENCE` increments on every change. Clients ignore an update that does not.
- `METHOD` is `REQUEST` for a booking or change, `CANCEL` for a cancellation.

### Time and availability

Instants are stored as ISO-8601 UTC. Inês's weekly hours are stored as
minutes-from-midnight in Porto time and resolved against `Europe/Lisbon` at query
time, so the rules survive DST instead of drifting an hour twice a year. The
25-hour and 23-hour transition days are covered by tests.

Student bookings and moves require at least **14 elapsed hours** of notice,
including across Porto clock changes. Slots inside that window are omitted from
availability and rejected again when a booking or move is submitted; exactly
14 hours is allowed. Switching only between online and Porto, at the same start
and length, is not a new time and is not refused by this rule; inside the window
it is a late change like any other (see *Late changes*).
`settings.minimum_notice_hours` controls the live rule;
the seed and missing-setting fallback are both 14. Dan requested this change
from the previous live setting of 24 hours on 13 September 2026. Since
21 September 2026 the same setting is also the free-change window (see
*Late changes*), so it affects both booking notice and fee terms. Admin changes
may relax it to a whole number from 0 through 14 hours. A stricter window
requires updated published terms and student consent before implementation.

`availability_rules.last_start_minute` is the latest a lesson may **begin**, not
when she finishes. That distinction matters: treating it as a finishing time
silently shortened the 90-minute format to an 18:30 last start while the
60-minute one kept 19:00.

`settings.lesson_buffer_minutes` is **15** (Dan, 22 September 2026, migration
0019): the 15 minutes after every lesson stay free. A student cannot book a
lesson that starts within 15 minutes of another ending, or that would end
within 15 minutes of the next one starting. Availability, every write guard for
a student's lesson (single, several at once, weekly runs and moves) and the
booking page's check between a student's own picks all apply it; `/availability`
reports it as `bufferMinutes`. Inês's own bookings and moves are exempt, so she
can still place a lesson straight after another. A lesson keeping its time, such
as a switch between online and Porto, is not held to a gap its neighbours were
booked without. A missing setting means no gap.

`settings.slot_interval_minutes` is **15** (same migration): within her hours a
lesson can start on any quarter hour, so the next lesson can begin as soon as
the free 15 minutes end, where starts used to fall only on the hour and half
hour. Inês's schedule keeps half-hour rows; a lesson at :15 or :45 sits at its
exact time there, and the exact-time editor sets quarter-hour first and last
starts.

Blocked exceptions are real spans of time, so a lesson is withheld when it would
**overlap** one rather than only when it starts inside it — which correctly
withholds a 90-minute lesson earlier than a 60-minute one.
This includes the next Porto date when a late lesson crosses midnight and
both occurrences of repeated autumn minutes; nonexistent spring minutes do
not create artificial time off. Overlapping weekly and extra-hour windows
keep each window's own start grid rather than dropping an extra precise start.

A lesson being changed may reuse the time it already holds. `GET /availability`
takes `manage=<manage token>`, which ignores that one booking once the token
verifies, and `series=<series id>`, which ignores an active weekly sequence only
for a request carrying its owner's session. Anything invalid quietly gets the
public answer, in the same response shape. Without this a student could not
move a lesson half an hour later or change its length at the same start, though
the reschedule endpoints accept both.

A request carrying a valid student session (`Authorization: Bearer`) also stops
that student's own unfinished card setups (`pending_payment` holds) counting as
busy, since their next booking replaces them (see *Payment*); everyone else,
anonymous or signed in, still sees them held. `POST /bookings/series/preview`
does the same. A missing, malformed, expired, revoked or out-of-date bearer is
exactly an anonymous request — the same 200 and the same answer, never a 401 —
so an old session on the device can never blank the calendar.

The spring clock change's missing hour never becomes shifted or duplicate
availability. A weekly run skips an occurrence whose Porto wall time does not
exist, and moving a whole run across such an occurrence refuses the move before
writing any dates. Skipped-week previews, confirmations and emails name the
dates, without converting a missing time into a later real appointment. This
also applies to skipped values recovered from older card-setup metadata.
Existing lessons in autumn's repeated hour keep their
original UTC instant when the teacher saves an unchanged date/time.

Once availability has loaded, the date picker omits complete leading weeks with
no free slots. That means a weekend with nothing left to book opens directly on
the next usable week; closed weeks later in the booking window remain visible.
Selecting a free day while booking keeps the four weeks beside its times on
wide screens; on a phone the times replace the calendar and the date's `Change`
returns to the four weeks that held it. In the lesson view a booked date opens
its lesson, or lists several in a dialog titled by that date, with `Book another lesson`; other
future dates highlight on hover/focus and open booking on that day directly,
with no separate Book labels on the tiles and no question first. Availability
is always checked for the chosen length.

### Payment

The combined notice opens at `/book/#terms-privacy` without requiring sign-in.
It is a native modal dialog over the current screen, beginning with `How booking
works`; consumer rights, sole-trader contact details and privacy follow. Sign-up does not
repeat it. The footer links to `Terms & privacy`; old policy URLs and the
`#booking`, `#privacy` and `#change-booking` fragments open the same dialog.
The visible payment and €5 summary precedes a required `Agree to terms & privacy`
toggle in postpay mode. It explicitly authorises the existing card charges and
acknowledges the privacy notice. The final button states both the lesson count
and the obligation to pay. The toggle still sends the existing `paymentConsent`
boolean; payment amounts, timing, enforcement and the monetary agreement version
are unchanged. Reading the combined notice preserves the selection and agreement.
The underlined terms text inside the agreement opens the dialog independently
of the toggle. The page shows one payment summary, without a separate reading
link or repeated authorisation sentence. Escape, the close button or clicking
outside dismisses the dialog and returns focus to its opener. With JavaScript
disabled, the same terms and privacy text is ordinary document content; the
footer and old legal links still reach it. Public navigation and all FAQ
categories also remain usable without JavaScript.

Unreadable booking API replies and invalid lesson-type or availability data
show a booking error and the contact link while keeping the document usable.
Lesson-type failures persist independently of later availability requests.
A reload can recover when the API returns valid data again.
Account and teacher API clients also reject unreadable or missing required data:
they show a retryable error instead of treating it as an empty lesson list or
schedule. Sign-in validates the returned student and a nonempty string session
before storing it.
These response failures retain an existing session; a matching 401 still ends it.
Password-reset, recurring-stop and teacher no-show actions require a valid
acknowledgment before reporting success. Rate-code receipts, optional rendered
booking fields, payment amounts and late-fee flags are also validated; malformed
replies preserve a usable retry instead of inventing a fee or displaying an
invalid price. Main-menu and footer booking links use ordinary document
navigation so explicit destinations and browser history initialize the matching
booking or lessons view, including navigation from an already open booking page.

Dan confirmed the public contact email `aprenderportugues.ines@gmail.com`,
Época as the contact address, Inês's own NIF and her status as a sole trader
(trabalhadora independente) on 13 September 2026. The
identifier is maintained only in the public notice; do not duplicate it here.
[Época's own site](https://epocaporto.net/) verifies Rua do Rosário, 22, Porto.
The existing published WhatsApp number is retained. The 11 September review found that
`bookings@portuguesewithines.com` is a verified sending address, but the domain
has no incoming-mail MX records and Resend receiving is disabled. Do not offer
that address as an inbox until incoming delivery has been configured and verified.

The 13 September notice review used [DL 24/2014](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2014-73222992)
for paid-order wording and statutory withdrawal, [DL 7/2004, article 10](https://diariodarepublica.pt/dr/detalhe/decreto-lei/7-2004-240775)
for trader identification, [GDPR article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
for privacy information and [AT's record-retention guidance](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Oficio_Circulado_30213_2019.pdf)
for the normal ten-year fiscal archive. Provider transfer details link to the
providers' own published terms; this is not an account-specific transfer audit.
Account/booking deletion and closure remain requests handled by Inês, not an
automatic inactivity purge; legal financial and unresolved-dispute records
can limit deletion.

**Legal limits still requiring operational resolution:** the notice offers
statutory withdrawal via Inês's confirmed email and says the ordinary €5 fee
does not override those rights. The current automatic fee logic does not
distinguish statutory withdrawal, so Inês must handle valid requests and any
refunds within the legal deadline. This UI change does not introduce an
early-performance request/acknowledgement, a durable copy of the full contract
and withdrawal form in confirmation emails, or the online withdrawal function
introduced by [Directive 2023/2673](https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX%3A32023L2673).
The applicable Portuguese requirements and their implementation need review.
Inês's own electronic complaints-book registration also remains unverified;
Época's registration must not be assumed to cover her teaching business.
See [DL 156/2005, articles 2 and 5-B](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2005-34431675).
Do not represent this presentation update as certification of legal compliance.

Production uses `payment_mode=postpay` as of 11 September 2026. A new database
defaults to `off`, where every booking confirms on creation without a card.
With `postpay` and Stripe configured:

- booking fails closed with a temporary payment error if the Worker does not
  have a complete key/webhook pair in its declared `test` or `live` mode;
- the slot is held as `pending_payment` while Checkout saves a reusable card in
  setup mode; no money is taken and nothing is emailed until the webhook proves
  the card setup succeeded;
- a direct management link to a held lesson says `Not confirmed`, explains
  that checkout must complete, and offers `Book a lesson` to start again.
  It has no confirmed-lesson change or recurrence controls. Held lessons never
  appear in completed history, even if the scheduled date has passed;
- all card-setup returns carry the first held lesson's existing signed manage
  token, including weekly runs and multiple-date selections. The page confirms
  only when that lesson becomes `confirmed`; `card=saved` alone and older
  account bookings do not prove this checkout succeeded. A missing token or
  delayed webhook leaves the page asking the student to check their lessons.
  Publish the Worker return-link change before the website confirmation guard;
- a student's next `POST /bookings` replaces their own unfinished card setup,
  so backing out of the form, reloading or closing the tab never leaves them
  refused by their own hold or treated as having had a trial. The replaced
  hold is deleted only once Stripe's expire call (or a read after it) reports
  the Checkout Session `expired`, which Stripe does only to a session that can
  no longer complete; a lapsed hold goes regardless. A completed setup, or one
  Stripe cannot answer for, keeps its hold for the webhook. Should a released
  session's completion still arrive, it finds no booking and confirms nothing.
  Availability and the weekly preview, asked with the student's session,
  already show their own held times as free;
- the webhook signature is verified before the payload is trusted for anything,
  and events are recorded so each is handled exactly once;
- Checkout creation, saved-card charges and refunds use a stable booking-based
  Stripe idempotency key, so an infrastructure retry cannot duplicate money;
- every student must explicitly accept the lesson-end and €5 charge terms, and
  each booking and series records when and under which wording consent was given;
- an abandoned checkout releases its slot when the hold expires, and a series
  whose checkout was abandoned loses its orphaned `booking_series` row in the
  same sweep.

**The after-lesson policy** (Dan, 1 September 2026, `policy.mjs` is the single
home): booking saves a card but takes no money. A scheduled row charges its
booked amount only once its no-show window has closed, six hours after
`ends_at` (Dan, 23 September 2026). Moving or cancelling at least 14 hours
before the lesson is free; doing either later schedules one €5 action fee and
prevents the full price from charging if the lesson was cancelled (the 14-hour
rule, Dan, 21 September 2026). A no-show recorded between the lesson's start
and six hours after its end changes the end charge from the booked price to €5.
Inês is never charged a fee for a move or cancellation she makes. Older `paid`
rows retain their earlier lock/refund promise inside the window; `not_required` rows keep
their original pay-in-person terms. The card itself never touches the database
— Stripe keeps it; `students` holds only opaque customer and payment-method ids.

Changing an ordinary lesson from 60 to 90 minutes (or back) uses that same
reschedule endpoint. Legacy `not_required` bookings can change length directly;
a future recurring lesson with `scheduled` payment follows the new lesson
price. A `paid` or `payment_due` lesson is never silently repriced: the student
must cancel/refund and book the other length, or settle the outstanding payment.
Trials cannot be converted into ordinary lessons through rescheduling.

Every successful payment (lesson, no-show fee or €5 late change fee) also sends
Inês a private "Payment received" reminder to issue the appropriate fiscal
document in Portal das Finanças, with the student's NIF if they gave one (see
*NIF for receipts*). Stripe's receipt
does not replace that Portuguese tax document, and Stripe Tax is not enabled
while her IVA basis remains an owner/accountant decision.

**Trial lessons are first lessons.** Anyone with a booking that wasn't
cancelled is refused the trial at creation, kindly, and pointed at a single
lesson. Their own unfinished card setup is released before that check, so it
still counts only if Stripe has completed it or cannot confirm it expired. This
is live now, independent of payment mode.

Stripe is used because Square does not serve Portugal and Stripe supports
reusable cards with explicit off-session setup. A least-privilege `rk_test_`
key is used for the sandbox journey; the account's general secret key never
belongs in the Worker.

**The account structure** (chosen 28 August, provisioned 31 August 2026):
**Inês's own Stripe account, with Dan as Administrator** — cheapest
fees (no Connect platform surcharges), EUR settlement on a Portuguese account,
her name on statements natively, and Dan runs everything day-to-day through
the Administrator role and a restricted API key. Payments are created directly
in her account; there is no platform, connected account, destination charge, or
second settlement hop.

**Payment methods**: enable **cards only** for card setup and automatic
off-session charges. Leave MB WAY and Multibanco off for this flow: neither is
a substitute for the reusable card the later lesson and €5 policy charges use.

**Sandbox proving ground**: `wrangler --env staging` deploys the separate
`ines-booking-staging` Worker and D1 database. It has `payment_mode=postpay`,
uses Stripe sandbox credentials, and has `EMAIL_DRY_RUN=1`, so no message is
actually delivered. The public site never points to it; local QA opts in with
`NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking-staging.dakibwa.workers.dev`.
Deploy it with:

```bash
npx wrangler deploy --config workers/booking/wrangler.jsonc --env staging
```

The source-level `STRIPE_UI_MODE=embedded` setting maps to Stripe API
2026-08-26.dahlia's `ui_mode=embedded_page`. Stripe.js still mounts the returned
client secret with `initEmbeddedCheckout`.

The 5 September 2026 sandbox acceptance used a labelled `example.invalid`
student and published Stripe test cards only: declined setup remained
unconfirmed; successful setup saved the card without payment; signed Checkout
delivery confirmed the booking; a same-day move charged €5 separately, then
the minute cron charged €25 after the moved lesson's end; hosted €25 recovery
completed and a later cancellation completed an actual sandbox refund. Emails
were dry-run. Synthetic dates were moved in the isolated D1 database to exercise
the time boundaries; concurrency, DST, no-show and ambiguous provider outcomes
are covered by the real-SQLite integration suite.

This run corrected the sandbox webhook destination to the staging Worker (it
had pointed at production), verified a recovered signed delivery answered 200,
and found that off-session PaymentIntents must explicitly select `card` when
using `error_on_requires_action`. Checkout also disables Adaptive Pricing per
session, keeping the agreed EUR amount instead of inheriting an optional
Dashboard currency conversion with an additional FX fee. These sandbox results
do not establish live-key configuration or evidence of a genuine customer
payment in production.

**Go-live checklist**:

1. Apply migrations 0012–0015 to both databases while production payment remains
   off. It adds lesson-end charge state, attendance, no-show and independent
   same-day-fee fields.
2. ~~Open Inês's Stripe account and invite Dan as **Administrator**~~ — done,
   31 August 2026. On 5 September 2026 the live merchant's account status showed
   Payments and Payouts active with no outstanding tasks. Its representative is
   Inês Dias Baía and its business is Português com a Inês. Fiscal treatment
   remains the owner's responsibility; do not infer tax registration from
   payments activation.
3. Checkout explicitly allows cards only for setup and payment recovery. In live
   mode, leave other payment methods off. Confirm the
   business name, support contact, statement descriptor and payout schedule.
4. Create a least-privilege live restricted key and install it with the live
   webhook signing secret in the production Worker. Production's
   `STRIPE_EXPECTED_MODE=live` rejects a sandbox key even if one is present.
5. Set the repository variable `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the live
   publishable key. The Pages build's `NEXT_PUBLIC_STRIPE_EXPECTED_MODE=live`
   refuses to mount Stripe.js with a test key.
6. The live `/stripe/webhook` destination was created and verified Active on
   5 September for `checkout.session.completed` only. Its signing secret was
   installed in the production Worker's encrypted secret store on 11 September.
   A first signed live delivery remains to be observed in Stripe's event log.
7. Run the redesigned full test-mode journey: setup mode takes no money;
   signed webhook confirmation; full lesson-end charge; no-show €5 replacement;
   same-day move/cancel €5; decline to `payment_due`; and dry-run notices.
8. Deploy the customer terms, privacy notice and required saved-card
   checkbox while production still has `payment_mode=off`.
9. After the sandbox journey passes and the authorised live credentials are
   installed, verify the key mode and permissions, live webhook destination,
   public publishable key and production health. Then activate
   `payment_mode=postpay` and re-run the production health/release gate.
   [Stripe's testing guidance](https://docs.stripe.com/testing), checked on
   6 September 2026, prohibits testing in live mode with real payment details:
   do not create an artificial €25 lesson or €5 fee just to prove the rails.
   Verify the first genuine authorised customer booking and any applicable
   charge against Stripe, the Worker, email and the public return journey;
   describe production payment observation as outstanding until that happens.

### Late changes

One 14-hour rule (Dan, 21 September 2026) covers booking, moving and
cancelling. The window is `settings.minimum_notice_hours` elapsed hours before
the lesson being moved or cancelled; exactly 14 hours is still free. Elapsed
hours need no time zone, so the rule reads the same for every student. The
columns, API fields and Stripe purpose keys keep their original `same_day_*`
names; they now mean "inside the window".

`same_day_change_fee_cents` may be 0 (waived) or a whole number from 50 through
500 cents. Positive fees meet Stripe's €0.50 EUR minimum, and configuration
cannot exceed the published €5 agreement. Raising that ceiling requires new
published terms and student consent. Invalid settings leave all saved values
and the availability revision unchanged. Existing captured payment requests
keep their original parameters.

- **Terms version**: bookings made under this rule record
  `payment_consent_version = 2026-09-21-fourteen-hours-v1`. Bookings (and their
  series top-ups) made under `2026-09-01-after-lesson-v1` agreed to "free until
  the lesson's Porto day"; they are charged only when both rules would charge,
  so no student pays a fee they didn't agree to.
- **Paid**: an older prepaid lesson has no late changes. `changePolicy` locks it
  inside the window — the unified calendar says so instead of offering the
  buttons, and the endpoints refuse with the same words for anyone who kept an
  old tab open. `same_day_change` is never set on a paid row.
- **Scheduled saved-card booking**: students may move or cancel right up to the
  lesson start. A change inside the window atomically schedules one €5 charge
  to the saved card. A move keeps the later full lesson charge, due six hours
  after the new end; a cancellation removes the full lesson charge. Once the fee is paid,
  the student and Inês are each emailed once; hers is the fiscal reminder.
- **Stripe**: the off-session PaymentIntent is described as `Late lesson change
  fee · <reference>` and a recovery Checkout names the product `Late lesson
  change fee`. Metadata keeps `charge_reason = same_day_change` and the
  idempotency key keeps its `same-day-fee` purpose, so a retry across the
  change cannot create a second charge.
- **Inês's fiscal reminder** still says "same-day fee" in its subject, heading
  and preheader, because her receipt automation classifies payments by those
  words. Rename them only together with that automation.
- **Series**: stopping or moving a whole run keeps any occurrence inside the
  window where it is; the student can still change that one individually.
- **Online ⇄ In Porto**: switching only where a lesson happens, at the same
  start and length, is a change like any other. It is never refused for
  notice, since the time is not new, and inside the window it applies the same
  once-per-lesson €5 fee as a move.
- **Booked without automatic payment**: the original pay-in-person promise is
  retained and no new card charge is invented. Emails say the fee applies (to
  Inês, that it is due) rather than that a card is charged.

### A student's own price, private codes and security

**One price per student per length (13 October 2026, Dan).** A student's own
price for a length, whether from a code they added or set by Inês, prices every
lesson of theirs at that length, one-off or weekly. By definition their
90-minute price is 1.5 times their own 60-minute price unless a 90-minute
price of its own was set or redeemed, which always wins (`withDerived` in
`rates.mjs`; the derived price is never stored, so a later 90-minute price
simply takes over). The trial keeps its own
price and €5 fees never change. Inês sets it when she adds a student or later
from their profile (`POST /admin/students/:id/prices`, `{ prices: { 60: cents
| null, 90: cents | null } }`, €1–€100 or 0 for free, null for the standard price again), and
can change it at any time: her price replaces a code's. Their welcome email
lists their price, so they are on it with no code to type.

When a price is set or a code is added, their lessons still to come at that
length follow it, provided nothing is settled on them: status `confirmed`,
`payment_status` `scheduled` or `not_required`, no charge started, and not
marked paid by hand. Paid, processing, due, refunded and pending-checkout
lessons keep their amount. A lesson the student agreed to at checkout
(`PAYMENT_CONSENT_VERSION`) follows only a lower price, since that agreement
was to the amount it showed; a card saved from their account
(`STUDENT_CARD_CONSENT_VERSION`) agreed to every lesson's price, so those
follow either way. The reply says how many lessons moved.

**Free lessons: a price of €0 (16 October 2026, Dan: "can Inês set a
student's price to €0 so that student never needs to add a card?").** Before
this, €0 was refused three times over (her form, `teacherRate`, and the rates
table's `CHECK (amount_cents > 0)`), and nothing in booking asked whether a
lesson cost anything: a €0 lesson would still have asked for the card
agreement and a card, been charged €0 after it (Stripe refuses that, so it
fell into `payment_due` and a recovery link retried every minute), shown in
Receipts as `Paid by hand` once it happened, and been moved onto a card the
day one was saved. Now:

- Inês may type `0` for either length, here or when she adds a student.
  Migration 0031 rebuilds `student_recurring_rates` with `CHECK (amount_cents
  >= 0)`; until it is applied, saving €0 answers 503 (`Free lessons need a
  database update first`) and changes nothing. A free 60 makes the 90 free
  too, as 1.5 × 0, unless she gives the 90 a price of its own. Codes are never
  free (`findRecurringCode` still requires €1 or more). The trial is never
  per-student, so it keeps its standard price and its card step; it is only
  for someone with no lesson yet, so a student she has added a lesson for
  cannot book it.
- A lesson born at €0 is stored as **`payment_status = 'free'`,
  `amount_cents = 0`**, with no consent: a student's own booking (one lesson,
  several dates or a weekly run), a lesson or weekly run Inês adds (card on
  file or not), and every week a run adds while the price is €0. No existing
  status was neutral: `not_required` is Receipts' `Paid by hand` and a card
  saved later charges it; `recorded` is a past-only record nobody is told of.
  `bookings.payment_status` has no CHECK constraint, so `free` needs no
  migration.
- Booking at €0 asks for no agreement and opens no card setup; the Worker
  takes it even while Stripe is not ready or card payments are paused, and the
  page does not block it either. Nothing reaches Stripe.
- Nothing that charges, recovers, chases, reprices, issues receipts or moves
  lessons onto or off a card names `free`, so it is never charged, sent a
  payment link, marked paid by hand, listed in Receipts or counted among her
  `paid by hand` lessons. It carries no late change or no-show fee
  (`changePolicy` reports `feeApplies: false`; there is no card to take it
  from), so emails and the reminder ask for the usual 14 hours' notice instead
  of naming €5. It is a real lesson: the booking, calendar, Meet and day-before
  reminder emails go as for any other, their price row reading `Free`.
- Her welcome to a student free at both lengths asks for no card (`card:
  false`, one step), lists `Your price · 60 minutes: Free`, and her setup
  checklist drops its Card step. Their account hides the Card row unless a card
  is already saved, and lists their prices as `Free`.
- Setting a length to €0 makes their lessons still to come at that length free,
  under the same rule as any lower price (nothing settled, no charge started,
  not marked paid by hand); their agreement to pay is cleared from them.
- **When the price rises again**, it is for lessons booked from then on.
  Lessons already free stay free: they were booked, or agreed, with nothing to
  pay, and a student with no card has nothing to charge. The reply says how
  many stay free (`stayFree`), and her form says so. New bookings ask for the
  card agreement again, and a weekly run's later weeks are born on the new
  price under the run's own terms: on the card for a run whose student saved
  one from their account, otherwise paid to her by hand (`not_required`), the
  same as any lesson she adds for someone without a card.
- A free lesson changes length only onto another free length; a priced length
  is refused (409, cancel it and book that length instead). A priced lesson
  moved onto a free length becomes free.



`PRIVATE_RECURRING_CODES` is a private Worker binding containing the exact
approved code, duration and cents triples. The canonical owner list is outside
this public repository. `scripts/private-recurring-catalogue.mjs` reads that
private Markdown list and pipes JSON directly to `wrangler secret put
PRIVATE_RECURRING_CODES`; do not print the catalogue or add it to public Git.
Authenticated `GET/POST /me/recurring-rates` exposes only the current student's
saved prices. Eight redemption attempts per account per 15 minute window are
reserved atomically, including parallel guesses. Case and outer whitespace are
normalised; prefixes/suffixes are never pricing authority.

`POST` takes `{ code, durationMinutes? }`. The length is optional because a code
is listed for exactly one: the profile passes none and the code names its own.
A supplied length must still match for compatibility with older clients. A
code the catalogue lists for two lengths is refused without a length rather than
guessed at. The answer carries every saved rate as `rates` and the one just
saved as `saved: { durationMinutes, cents }`. Nothing about the catalogue is
ever returned: an unknown code and a code for the wrong length say only that it
isn't recognised or isn't available for that length.

An account's first grant for each duration wins; codes remain reusable by other
accounts and removing a code does not revoke prior grants. Each length has its
own grant, so one account can hold a 60 minute rate and a 90 minute rate at
once, from two codes. A second code for a length that already has a different
rate is refused (409) naming the length and pointing to Inês; the same rate
again changes nothing. Booking, weekly top-ups and Inês's own lessons snapshot
the student's price in `bookings.amount_cents`, including when payment is off.
Existing rows keep their price when moved at the same duration; a new duration
uses the student's price for it or the public price. Trials and €5 fees never
use these prices. Booked rows follow a new price as described above.
Each repricing write also verifies the current saved or derived personal
price. An older request cannot overwrite a newer teacher price, including a
derived 90-minute rate, a free price or a return to the public price.
New booking, selection, weekly recipe and top-up claims atomically check that
their quoted effective price is still current. A changed price returns a
conflict for review rather than silently charging an older or higher quote.
A losing weekly claim cannot advance its bookmark or leave an empty recipe.
If a first confirmed lesson already committed, it remains booked and gets its
single confirmation; the response explains that the remaining run was not added.

**Where a student adds a code.** Only under *Edit details*, behind a small `Have a
code from Inês?` disclosure. Booking and lesson-length changes use the
account's prices automatically and offer no code field; each length choice
carries its price (`60 mins · €20`). The profile lists the student's prices
only once there is one, so a student without a code sees
one quiet link and no "standard price" rows. It is
one field for every code: after a 60 minute code is added the disclosure stays
open for the 90 minute one. A reply clears only its submitted code; a newer
code typed while waiting stays ready to add. The note says the code sets their
price for lessons of that length, including ones already booked.
Old rates lookups cannot overwrite a saved code's prices or show a stale
lookup error, in either the editor or the booking workspace.
Saving there tells the booking workspace at once,
so the next booking is priced from it without a reload or the code being
typed again. **Sign-up deliberately has no code field** (decided 28 September
2026): only some students have a code, and a field there would suggest most new
students should have one.

If Stripe's idempotent charge response still says processing, the Worker reads
that same PaymentIntent to observe its current state. A later success settles
the original charge; an ambiguous result keeps the existing processing claim
and cannot open a second payment.

The charge claim rechecks current status and end time atomically. A successful
cancel or move wins against a previously selected charge, while already
processing payments reject concurrent changes. Student and teacher moves use
conditional conflict/sequence checks. No-op moves do not schedule fees. Payment
and fee retries stop automatically after 23 hours of ambiguity, before Stripe's
minimum idempotency retention can lapse; an owner must reconcile that payment
in Stripe before any further attempt. Such rows are excluded from the 50-item
sweeps so newer payments are not starved; the owner-only bookings response has
`manualPaymentReconciliation` (with the student's name, lesson time and
payment ids), which her Timetable lists under Needs you with `Open in Stripe`,
and Worker warnings signal outstanding counts.
The first claim freezes every Stripe charge parameter in the booking, including
the saved card, amount and purpose. An idempotency-parameter error remains
ambiguous and never opens a second hosted payment path.

Failed recovery-link creation retries on the scheduled sweep. Recovery emails
open the durable booking-management page; its separate lesson/fee buttons reuse
an open Checkout session and only replace one after Stripe confirms it expired.
A completed, unknown or unreachable session never permits a replacement. Each
replacement uses its expired predecessor as a stable idempotency generation and
an atomic session-pointer update. Setup and payment requests use Stripe's default
expiry rather than recomputing a timestamp under an existing idempotency key;
the database still rejects setup confirmation after its 35-minute booking hold.

On an authoritative first Google link to a password-created email, Google ownership
retains the same account and lessons but clears the unverified password and
invalidates all earlier sessions and pending account-change/reset requests.
Subsequent logins match the stable Google id without repeating that transition.
The sign-in page explains that an email password reset can restore a password.
A lesson Inês adds for an unproven address with a password applies the same
transition first (see *Who can do what*).

Paid cancellations first create a durable `booking_refunds` operation and lock
the booking atomically. Only then is the frozen refund request sent to Stripe.
A move winning first prevents the refund entirely; a refund claim winning first
blocks student, series and teacher moves. Pending/ambiguous refunds keep the
slot reserved and surface in the teacher diary. A scheduled reconciliation
retrieves a known refund id, or retries the same request for at most 23 hours
when the response/id was lost. Only a succeeded refund marks the booking
cancelled/refunded; never manually retry money without first checking Stripe.
Teacher creation uses the same atomic slot claim as student creation, and all
move paths ignore expired setup holds. Whole-series duration changes require
the displayed new price; unchanged-duration rows retain each agreed snapshot.
Single moves and cancellations also recheck their payment snapshot at the
write, so a concurrent paid-by-hand mark, charge or repricing requires a reload.
A teacher cancellation selected as unpaid cannot cancel a newly settled card
payment without passing through the refund path.
Changing a lesson's length and unticking a payment by hand also atomically
verify the effective target price. Teacher creation accepts the displayed
`expectedPriceCents`; a changed quote requires review, except for an unticked
past lesson that records no price or payment.

An existing Checkout can still settle after a later card changes the account's
Stripe customer. If its customer differs from today's profile, the Worker
retrieves that exact stored Checkout and verifies its original customer,
booking, mode, purpose, intent and amount; an unavailable provider returns 503
for retry. It never accepts an arbitrary customer mismatch.
The payment sweep also recovers a receipt, fiscal reminder or payment-due notice
whose first log row was never inserted. It verifies current positive payment
truth and renders only a wholly absent key. Existing failed or unconfirmed
attempts always retain their original immutable delivery history.

Writes reject unapproved browser origins and non-JSON content; request bodies
are bounded while streaming. Authentication has an edge-IP rate limit and
account failure limits. Mail an unproven party can trigger is bounded per
recipient: three password resets an hour per account (the reply is unchanged
past the limit), and three email-change requests an hour per account and per
target address. One connection can register five accounts and open eight
unpaid card-setup holds an hour. Every per-connection budget keys an IPv4
address as it is and an IPv6 one by its /64, which one client can rotate
through freely; an IPv4-mapped IPv6 address counts as its IPv4. A signed-in teacher is authorised without ever
touching the admin-token throttle; every other admin request spends the
per-connection budget before the token is compared, so a locked-out connection
is refused even when it finally presents the right token. That budget is 20
admin requests per 15 minutes per connection, which makes the shared token an
emergency route into `/schedule`: a long session on it can reach the cap, while
Inês's own teacher sign-in never does. `/admin/settings` range-checks its numbers — a zero slot
interval would hang `/availability` — and validates its addresses. Numeric
settings require actual finite numbers; null, booleans, arrays and objects are
refused before storage. Admin requests authenticate before reading a bounded
body, then recheck the captured teacher role, account version and revocation.
Mutations bind that authority in SQL, sensitive provider work rechecks before
starting, and private replies recheck before returning. Work already committed,
such as applying an accepted price grant or notifying an accepted lesson, can
finish its consequences without starting a new teacher action after revocation.
The live origin allow-list is the two live domains plus `http://localhost:3000`, which
CI's journey tests serve the built export from. API responses are not cacheable. Password derivation
uses six supported 100,000-iteration rounds for new passwords, retaining older
hash verification. Webhooks check signature, environment, session, customer,
amount and currency; expired card-setup holds cannot reclaim a slot.

## Deploying the Worker

Migration `0033-card-setup-version.sql` adds the card-setup revocation generation.
It was applied and its type, NOT NULL constraint and default verified in staging and
production on 18 October 2026, using the connected Cloudflare app. The local
runtime's Cloudflare token did not grant D1 query access.

Migration `0034-email-recovery.sql` adds four nullable delivery-payload/lease
fields and quarantines ambiguous legacy attempts as `unconfirmed`. It was
applied to staging, then production, and all four TEXT columns and nullable
constraints verified on 18 October 2026 through the connected Cloudflare app.
Both databases had zero pending, failed or unconfirmed messages afterward.
Do not replay the full schema or older migrations against an existing database.

Migration `0035-email-lifecycle.sql` was applied to staging, then production on
18 October 2026 through the connected Cloudflare app. The new nullable TEXT
column `email_log.lifecycle_json` was verified in both databases; both had zero
pending, failed or unconfirmed messages afterward. It quarantines legacy
lifecycle attempts whose included booking snapshots are unknown.

```bash
npx wrangler d1 create ines-booking          # put the id in wrangler.jsonc
npx wrangler d1 execute ines-booking --remote --config workers/booking/wrangler.jsonc --file workers/booking/schema.sql
npx wrangler d1 execute ines-booking --remote --config workers/booking/wrangler.jsonc --file workers/booking/seed.sql
npx wrangler deploy --config workers/booking/wrangler.jsonc
```

Secrets, each via `npx wrangler secret put <NAME> --config workers/booking/wrangler.jsonc`:

| Secret | What it is |
|---|---|
| `BOOKING_TOKEN_SECRET` | Signs manage links. Any long random string. **Changing it invalidates every link already emailed.** |
| `ADMIN_TOKEN` | Fallback way into `/schedule` if she is locked out of her account; capped at 20 admin requests per 15 minutes per connection. |
| `RESEND_API_KEY` | Transactional email. |
| `TEACHER_EMAIL` | Where her booking notifications go. |
| `STRIPE_SECRET_KEY` | Optional. A least-privilege restricted key; only required when `payment_mode` is `postpay`. |
| `STRIPE_WEBHOOK_SECRET` | Optional, and required alongside the key. |

Non-secret vars in `wrangler.jsonc`: `GOOGLE_CLIENT_ID` enables Google Sign-In
(it is public by design — the Worker verifies every token against it).
Production uses `TEACHER_NOTIFICATIONS_ENABLED=1` to send Inês's booking,
change and failed-payment copies, and her "Homework to review" notices. Setting it to `0` pauses these copies;
student mail and successful-payment fiscal reminders remain enabled, and
`TEACHER_EMAIL` remains the student messages' reply-to. Staging keeps teacher
booking copies paused and all email in dry-run mode.

Then set `EMAIL_DRY_RUN=0` in `wrangler.jsonc` and redeploy. Until that happens
the Worker records every message in `email_log` and sends nothing — and
`npm run check:booking` refuses to pass, because a site that confirms bookings
while silently sending no confirmations is worse than one that is visibly down.

`.dev.vars` overrides **secrets only**, not `vars`. For local development against
a different origin, pass `--var ALLOWED_ORIGIN:… --var SITE_URL:…` to
`wrangler dev`.

## Site configuration

```bash
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking.<subdomain>.workers.dev
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_EXPECTED_MODE=live
LESSON_PRICE_CENTS=2500
LESSON_CURRENCY=eur
NEXT_PUBLIC_LESSON_DURATION_MINUTES=60
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
```

With no API URL the booking page degrades to its setup placeholder and points
students at WhatsApp, rather than rendering a calendar that cannot work.

## Not yet built

Readiness check, 11 September 2026: production `47b86a7` passed CI's build,
student journeys, payment-recovery fixtures and teacher-calendar browser checks.
Fresh local checks passed 89 booking tests, 33 SQLite integration tests and five
teacher-calendar tests. Live mobile and desktop checks reached trial, single and
recurring confirmation, with private-rate controls, correct prices and no browser
errors. Inês has the teacher role; the live teacher page rejects a student account.
Resend verified delivery of earlier student and teacher messages; the booking log
has no pending or failed emails. No new live booking or email was created, and no
fresh sign-in as Inês or real payment was performed. At that point payments
remained off; activation followed below. The
secondary www redirect is deployed. Dan approved the policy contact-link repairs
and quieter bottom-right footer privacy link for publication in the same release.
Release `ee812d2` passed all CI gates and published to Cloudflare Pages on
11 September; the public footer, contact links and HTTPS redirects were verified.

- **Live payment activation.** The live merchant was rechecked on 11 September:
  its business URL matches this site, charges and payouts are enabled, and no
  requirements are currently due. Dan approved activation and completed
  Stripe's email verification on 11 September. The live webhook signing secret
  and `ines-booking-production` restricted key are installed in Cloudflare's
  encrypted production secret store. The saved key grants write access only
  to Charges and Refunds, Customers, Payment Intents, Payment Methods, Products,
  Setup Intents, Prices and Checkout Sessions. The public publishable key
  belongs to the same live merchant. Production now has `payment_mode=postpay`;
  `npm run check:booking` passes with live keys, `stripeReady:true`, live email
  and no missing configuration. The every-minute cron is configured. The live
  confirmation screen shows the after-lesson and €5 terms, blocks submission
  until consent, and enables it when checked, without console errors. No
  booking was submitted during this check. All 24 pre-existing bookings retain
  `not_required` payment and same-day-fee status. The sandbox journey is
  complete; the first genuine customer card setup, signed live webhook and
  resulting charge remain to be observed. No artificial live payment was made.
- **Fiscal documents.** She must issue a fatura-recibo per lesson, and CIVA art.
  36.º gives 5 working days from the lesson. See
  `Documents/Work/Português com a Inês/Billing and Booking - Operating Context
  and Options.md` for the full position, including the unresolved IVA exemption
  code.
- **Migration 0023** (`workers/booking/migrations/0023-transition-kit.sql`) was
  applied by hand to staging and production D1 on 12 October 2026, before the
  Worker that reads it: adding a lesson writes `added_by_teacher` and sign-in
  links need their table. Existing rows were unchanged.
- **Migration 0028** (`workers/booking/migrations/0028-student-changed-at.sql`)
  was applied by hand to staging, then production D1 on 14 October 2026,
  before the Worker release. The column was absent before each application;
  `pragma_table_info('bookings')` confirmed `student_changed_at TEXT` in both
  afterwards. Existing rows stay NULL; changes after release can appear in
  Needs you. The migration file was executed directly, without replaying the
  empty migration ledger.
- **Migration 0031** (`workers/booking/migrations/0031-free-prices.sql`) is
  applied in staging and production. Both live table definitions were verified
  on 18 October 2026 to allow `amount_cents >= 0`; do not replay the rebuild.
- **Migration 0032** (`workers/booking/migrations/0032-also-student.sql`) is
  applied by hand to staging, then production D1, on 17 October 2026, before
  the Worker that reads it. It adds `students.also_student`, default 0.
- **Migration 0036** (`workers/booking/migrations/0036-dormant-students.sql`)
  was applied by hand to staging, then production D1, on 22 October 2026,
  before the Worker that reads it (`GET /admin/students` selects both new
  columns, so without them her Students tab cannot load). It adds nullable
  `students.dormant_at` and `students.dormant_emailed_at`. Both columns were
  absent before each application, and `pragma_table_info('students')`
  confirmed them afterwards. Existing rows stay NULL, so nobody starts
  dormant. The file was executed directly, without replaying the empty
  migration ledger.
- **Two-way Google Calendar sync**, once OAuth verification is worth doing.

## Google Calendar and Meet setup

The Google app is configured in the dedicated `portugues-com-a-ines` project
and published to Production. Calendar API, migration 0016, Worker secrets and
the feature flag are configured in production and staging (14 September 2026).
Sync starts only after Inês connects her account; Google sign-in alone does not
grant calendar permission. Live event creation still needs verification after
that connection. The existing Google sign-in client remains separate.

### Behaviour

- All confirmed future lessons sync to the visible **Português com a Inês —
  lessons** Google calendar owned by the connected teacher. Each online lesson
  gets its own Meet link; Porto lessons have a Porto location and no Meet link.
  Bookings awaiting payment confirmation do not create calendar events.
- The student’s booking/manage views and Inês’s lesson details show **Join Google
  Meet** for online lessons. Confirmation and change emails include the link when
  ready; delayed links get a short follow-up email, and the day-before reminder
  carries the link again when it is ready. The minute sweep also fills
  existing future lessons after connection.
- Moving a lesson updates the same event. Changing to Porto removes the event’s
  conference; changing to online requests one. Cancelling cancels that event.
  Cancellation does not promise to revoke a Meet URL previously delivered.
- The calendar is private by default, but events inherit calendar visibility so
  explicitly shared read-only viewers can see lesson names, times, location and
  Meet links. No student email, phone, notes or payment details are copied into
  these Google events. No attendees or extra Google invitations are created.
- Students keep their emailed calendar invitations with existing UID/sequence
  handling. Once the teacher calendar is connected, new teacher emails omit ICS
  attachments. Old invitations previously imported into her primary calendar may
  need one-time manual cleanup after checking the new calendar; never remove
  personal appointments or silently delete old records.
- Inês can share this specific calendar with `dakibwa@gmail.com` using **Settings
  and sharing → Add people → See event details**. Dan accepts Google’s sharing
  invitation to add it to his calendar. This is read-only access; her personal
  calendars remain separate. Calendar sharing is configured once in Google by
  its owner, not via a broad ACL permission granted to the website.
- Booking edits remain on the website. This is one-way website-to-Google sync;
  personal Google appointments do not block website availability, and edits made
  directly in Google are not imported into bookings. Inês should use her schedule
  page for changes and join online lessons to admit students.
- Provider failures never roll back a confirmed lesson or payment. Per-booking
  claims prevent concurrent creation; event ownership markers and existing
  iCalendar UID lookups recover lost event-create responses. Tokens are encrypted
  in D1 with AES-GCM and never returned to the browser.

### Activation (not performed by adding this code)

1. Configure an OAuth web client for Português com a Inês in a suitable Google
   Cloud project, enable Calendar API, complete consent branding and publish the
   external app to Production. Do not silently repurpose a shared app. Testing
   mode extra-scope refresh tokens normally expire after seven days.
2. Request only `openid`, `email`, and
   `https://www.googleapis.com/auth/calendar.app.created`. This calendar scope
   permits app-created calendars/events; no primary-calendar read permission is
   needed. Register the exact callback:
   `https://ines-booking.dakibwa.workers.dev/google-calendar/callback`.
3. Apply `workers/booking/migrations/0016-google-meet.sql` once to the target D1.
   Set Worker secrets `GOOGLE_CALENDAR_CLIENT_ID`,
   `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_TOKEN_KEY` (random 32-byte
   key encoded as 64 hex characters), and `GOOGLE_CALENDAR_REDIRECT_URI` (above).
   Never use frontend/public environment variables for these values. Keep the
   encryption key: replacing it invalidates stored grants.
4. Set `GOOGLE_CALENDAR_ENABLED` to `1` only after setup, and release Worker
   before frontend. Use the isolated staging Worker/database for live proof,
   with its own callback/client grant and dry-run emails.
5. Inês signs into `/schedule/`, selects **Profile → Google Meet → Connect Google Meet**,
   chooses her matching Google account and grants permission. The callback
   checks signed identity, teacher role, session version/revocation, expiring
   single-use state and PKCE. The shared admin token cannot start OAuth.
6. Verify Porto and online test lessons both sync, and an online test lesson
   produces a joinable link in booking/email,
   preserves it when moved, hides it when cancelled, and a Porto lesson has
   no Meet link. Verify changing online ↔ Porto preserves the event identity.
   Only then enable production and connect Inês’s production account.

Until 10 October 2026 no online lesson had received a Meet link: every event
existed but each retry asked Google for its room under the same `requestId`,
which Google treats as the request it already has, and a request Google held
as pending was never asked for again at all. Each request now carries its own
`requestId` and the time it was made; one still pending after ten minutes
(`STALE_CONFERENCE_MS`), or made before requests were dated, is replaced with
a fresh request on the same event. A link still pending logs `meeting_pending` with what
Google reports (`none`, `no-request`, `pending`), visible with `npx wrangler
tail`. If links still do not arrive after the Worker is deployed, that log line
names the cause.

A lesson booked before then gets its link, on the booking page and in a `Your
online lesson link` email, within a couple of minutes of the Worker carrying
the fix being deployed. Anything booked since gets its link straight away, in
the confirmation or, when Google is slower, in its own email a couple of
minutes later. Google itself emails no one: events carry no attendees and are
written with `sendUpdates=none`.

Expired or revoked Google permission shows **Needs reconnecting** on her Google
Profile tab and `Google Meet needs reconnecting` in Needs you; **Profile → Google Meet →
Reconnect Google Meet** restores it.
Reconnection reuses the stored calendar and event identities. If the first
calendar-create response is lost, the persisted creation-attempt flag prevents
creating duplicates. An operator must locate the app calendar in Inês’s Google
Calendar and restore its ID after verifying ownership; reset the flag only after
confirming no calendar was created. Never reset it as a blind retry. After a
confirmed recovery clears the creation-attempt flag, the minute sweep resumes
setup with the saved grant, without another OAuth login. Calendar creation has
a 30-second timeout; failed attempts log only fixed error codes and HTTP status,
never provider payloads or credentials. Failures before sending calendar creation
remain retryable. Provider requests use Workers-compatible manual redirects and
reject 3xx responses; credentials are never forwarded to another destination.

Disable `GOOGLE_CALENDAR_ENABLED` to stop provider work while retaining existing
booking links and records. Revoking the app in Google stops access. Stored
refresh grants and OAuth state are operational credentials, not exportable
student data. Future deletion/retention tooling must include these tables.

Provider references: [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth),
[calendar creation](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert),
[event conferences](https://developers.google.com/workspace/calendar/api/guides/create-events),
[OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
