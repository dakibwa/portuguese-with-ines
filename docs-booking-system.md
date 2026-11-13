# Booking system

Booking is owned by this repository. There is no third-party scheduler: the
site renders the calendar, and `workers/booking/` (Cloudflare Worker + D1) is
the source of truth for availability, bookings, and changes.

## Why not Square, Cal.com, or Acuity

**Square cannot be the rail.** Square does not onboard sellers in Portugal, so
it can never take money for a Porto-based business.

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
  → POST /bookings/:token/rebook                     a lesson they cancelled, booked again as a new lesson
  → POST /bookings/:token/card                       → Stripe's page: a lesson Inês added, or its weekly run, goes on a card
  → POST /series/:id/reschedule | /stop (Bearer)     → move or end an owned weekly sequence
Legacy /my-lessons and /booking links resolve into /book without losing state
Inês on /schedule                     (her own account, role=teacher)
  → GET/POST /admin/availability
  → POST /admin/online-only                          online-only date ranges and daily hours
  → GET  /admin/lesson-availability                 teacher lesson picker
  → POST /admin/exceptions/day                       one date's day off, blocked hours and extra hours
  → GET  /admin/bookings, /admin/students            her lessons; her students and how far
                                                     each is onto the site
  → POST /admin/bookings                             add a lesson, or a weekly slot, for someone
                                                     (marked `added_by_teacher`, shown as
                                                     `Added by you` until it is on the
                                                     student's card, or free and they have
                                                     signed in, then as booked; charged to a
                                                     card only once the student saved one
                                                     from their account); one already started is
                                                     recorded (`payment_status = 'recorded'`):
                                                     nobody is told, and it is open at the
                                                     student's price until it is paid
  → POST /admin/students                             set a student up (details, optional prices); nothing emailed
  → POST /admin/students/:id/details                 their name, email, phone, NIF and splat; email only
                                                     until they first sign in
  → POST /admin/students/:id/prices                  her price for a student per length; null is standard, 0 is free
  → GET  /admin/receipts?month=YYYY-MM               every amount paid or due for a Porto month's lessons,
                                                     with the NIF to issue to (her Receipts tab and automation)
  → POST /admin/needs-you/dismiss                    dismiss one Needs you notice that only informs, on all her devices
  → POST /admin/students/:id/welcome                 email a student a fresh sign-in link
  → POST /admin/students/:id/invite-link             make a sign-in link for her to send on WhatsApp;
                                                     nothing emailed (ten an hour per student)
  → GET  /admin/students/:id/notes                   her plan for them and each lesson that has started, newest
                                                     first, with her notes, level and homework state; hers alone
  → POST /admin/students/:id/plan                    save her plan { plan, updatedAt }; 409 over a newer save,
                                                     503 until migration 0038 is applied
  → POST /admin/students/:id/dormant                 mark them dormant, or active again; nothing emailed
  → GET/POST /admin/dormant-email                    the default each come-back email starts from
  → POST /admin/students/:id/dormant-email           send one dormant student theirs, at most once a day
  → POST /admin/bookings/:id/reschedule | /cancel
  → POST /admin/bookings/:id/cancel { following }    this lesson and every later week of its run; the run stops
  → POST /admin/bookings/:id/change                  time, length and place together, for this lesson or
                                                     (`following`) every later week of its run; one email
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

A teacher can also be one of Inês's students. Adding a
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
do. A double booking is never intended, so a clash is refused.

The student's confirmation of a lesson she adds says Inês booked it and
carries the calendar invitation. While they have never been in, or have not yet
saved a card from their account, its button is a one-click sign-in link (good
for 14 days, once) instead of the manage link, and it says how adding a card
works; the invitation still carries the manage link. Her own copy says
`You added a lesson`.

**Recording a lesson already had.** A `startAt` at or before now is a
lesson she is recording, not booking. It is checked for clashes only, like any lesson she adds (weekly
hours, time off and the notice window don't apply), and the same student at
the same start answers 409 `They already have this lesson.` Nothing else a
booking does happens: no email to the student or to her, so no calendar
invitation; no sign-in link; nothing put on a card or charged by adding it,
whatever the student has agreed to; no reminder (those look only ahead); and
no Google Calendar event or Meet. One still
running when she records it carries `meeting_retry_at = ends_at`, so the Meet
sweep never reaches it. It cannot repeat weekly (400). The reply is
`emailed: false`. Its place, `online` or `porto`, is hers to give and is
stored for the record only: a past lesson never has a Meet, a calendar event
or an email, whichever it is.

It is stored as `payment_status = 'recorded'` (the column has no CHECK
constraint), the mark that it was added afterwards. For money, a record is
any past lesson she added:

- It carries the student's price for its length in `amount_cents`, quoted
  and guarded as any lesson she adds is (`expectedPriceCents`, the price
  snapshot), ticked `Already paid` or not.
- It is **open** until a card pays it or she ticks `Already paid`: it counts
  in `unpaidPast` and `unpaidPastCents`, and her tick lists (the invite's and
  the payment link's) offer it. One at €0 is never open.
- It goes on a card only by being named in an approval the student reviews
  (below), from her link or from the step that opens when they sign in: it
  becomes `scheduled` at the amount they agreed to and is charged as any
  ended lesson on a card is. From then it is an ordinary lesson on a card.
  Saving a card, the standing agreement and the charge sweep never take a
  record the student has not approved by name.
- A record kept before records carried a price has no `amount_cents`. Its
  price is the student's price for that length now (their own rate, a 90
  derived from their 60, else the standard price). One expression, `lessonCentsSql`, reads
  what a lesson she added costs wherever the open rule reads an amount, so
  the count, the tick lists, the review and the approval never disagree. An
  old record's amount is written onto its row only when a tick, an approval
  or a correction touches it.
- It is **not in Receipts** while it is open: an unticked record has no
  line. Ticked, it is paid by hand; paid by card, it is a card payment.

Her pages never label it `Recorded`: in a student's card it has the
`Already paid` tick like any open past lesson, and opened it reads
`€20 · to pay you directly`. The
student sees it under Past lessons on Your lessons as a plain row, like any
other past lesson. Homework is set on it as usual.

Moving it to another past time, or cancelling it, is as quiet, since the
student was never told of it. It cannot be moved into the future (409 `A
lesson already had stays in the past. Add a new lesson instead.`, through
`/reschedule` or her one change), so a record never becomes an unannounced
lesson to come. Its
length and place are corrected as any lesson already had is (see her one
change, below).
An unproven account with a password is reclaimed first (below), because
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

**Paying for the lessons she adds** (migration 0023).
A lesson Inês adds records its price and `added_by_teacher = 1`. One she
records after it has happened is a record (`recorded`, above): it goes on a
card only when an approval names it. A lesson to come is paid to
her directly (`payment_status = 'not_required'`) until the student saves a card
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
start. A lesson already had is changed only if an approval named it (see the
approval link, below), and one the student booked themselves never is. A card
saved at one booking's checkout agreed to that booking only and
does not count, and only a proven address (see *Accounts*) can save one: a card
someone registered first never pays for the owner's lessons, and taking an
unproven account back clears its agreement. `Your lessons` asks once, above
the calendar, while a lesson she added is still unpaid; `Your details` has a
`Card` row with `Remove card` (`POST /me/card/remove`), which puts her lessons
still to come back to being paid by hand and stops her weekly slots charging
(those a student put on a card from a lesson's own link too, see *Paying by
card from a lesson's link*).
Removal also increments `students.card_setup_version` (migration 0033), so a
setup already open at Stripe cannot restore the agreement, even if no card had
yet been confirmed. Each setup records that generation and the account's
`session_version`; confirmation checks both again in the transaction, together
with verified student access. Identity changes also retire older setups.
Teacher lesson/series creation and unticking a direct payment check the same
current agreement inside their writes. Charge initiation checks it again;
withdrawn agreements cannot leave stale scheduled charges. Charges already
processing retain their original idempotent retry, since money may have moved.

A lesson the student already paid her for by hand is ticked `Already paid`
(below) before it is charged, and no later card takes it back. A newly saved
card is not a Needs you notice: the student's row says `Card saved`.

**Already paid.** Any lesson, past or to come, can be
ticked as paid to her by hand: as she adds it (`paid: true` on `POST
/admin/bookings`) or later from its dialog (`POST /admin/bookings/:id/paid`,
`{ paid: true | false }`, teacher only like every `/admin/` route; nothing is
emailed). It reuses the existing paid-by-hand mark, `payment_consent_version =
'paid-by-hand'` (`PAID_BY_HAND_MARK` in `policy.mjs`), rather than a new
status:

- A lesson to come is `not_required` with the mark. Card saving, card removal,
  charging, recovery, chasers and repricing all skip the mark, so it is never
  charged, linked, chased or moved onto a card (the `not_required` pitfall
  does not reach it), and a student cannot change its length (409). Inês can:
  her change of time, place or length goes through, past or to come, and the
  lesson stays ticked at the price of what it now is. The agreement it carried
  stays on it, so unticking can restore it.
- A lesson she records after it happened stays `recorded`, with the mark and
  its price in `amount_cents`, so it keeps every record rule (no email, no
  Meet, no move into the future). Ticking one kept before records carried a
  price writes the student's price for its length now. Unticked, it stays a
  record with that price still on it and is open again; it has no line in
  Receipts until it is ticked or paid.
- Ticked lessons are in **Receipts as paid by hand, ready**, from the moment
  they are ticked (the money is in), including after cancellation. Untick a lesson to come
  before it is charged and it is billed as it would be booked now: her lesson
  goes on the card if the student's standing agreement covers it, otherwise
  it is to be paid to her directly (`not_required`, unmarked); a lesson the
  student booked goes back on their card only if it was on one when ticked,
  on the wording it had: its run's, or the one in force when they agreed, so a
  lesson booked on the earlier lesson-day terms never comes back on stricter
  ones. Unticked after it happened, a lesson of hers is open again as it
  stood, `not_required` at its own price and off the card, as a record is: one
  already had goes on a card only when an approval names it. Its price is the student's current one,
  never above what they agreed at checkout, and €0 makes it free.
- Offered only where nothing is settled by card: `scheduled` or
  `not_required` with no charge started, or `recorded`. A free lesson has
  nothing to pay (409, and no tick); `paid`, `payment_due` and `processing`
  are refused (409) and show their card state instead.
- Per lesson: a weekly run can't be added ticked (400); each lesson of it is
  ticked from its own dialog, and new weeks are born unticked.
- The tick covers the lesson price only, not a late change fee.
- Her student list's count of lessons to come still paid by hand
  (`unpaidUpcoming`) and the student's `Pay by card` prompt leave ticked
  lessons out; emails show their price as `paid`.

Cancelling a lesson never records a refund of money paid by hand. In Student
history, `Record refund` opens an explicit confirmation that Inês already
returned the money directly. `POST /admin/bookings/:id/refund-by-hand` requires
`{ refunded: true }`, teacher access, a cancelled paid-by-hand lesson and no
Stripe payment or charge in progress. It records `payment_status = 'refunded'`
and retains the receipt as `by hand / refunded`, not ready to issue.
Repeated acknowledgments are harmless. It sends no email and makes no payment
provider call.

`GET /admin/students` lists each student with whether they have signed in, a
card and the standing agreement, their next lesson, how many lessons to come are
still paid by hand, and any weekly slot. It also gives `unpaidPast` and
`unpaidPastCents`, the past lessons she added that a payment link can still
ask for (the same rule `GET …/card-link` lists them by: confirmed, expected,
nothing charged, not ticked paid, a price above €0; a lesson she recorded
after it happened is one of them), and `invitedAt`, when the
newest of their sign-in links still unspent and unexpired was made (`null`
once each is used or expired), so her list can say `Link sent 5 Sept`.
`Students` on `/schedule` groups them by whose move it is:
`To do` (her link to send), `Waiting on them` (a link out, not yet used) and
`All set`, after `Needs you`. All set is a student fully set up and paying for
their own lessons: signed in, nothing open from the
past, and a card saved with no lesson she added to come still paid by hand.
The standing agreement does not stand in for that last part: while
`unpaidUpcoming` is above zero they are not all set, whatever they have agreed
to. Someone who books and pays for their own lessons, with none of hers
waiting, is all set without it. Her link is
a WhatsApp message, or for someone with an email `Email instead`, which is the
welcome email (`POST /admin/students/:id/welcome`, three an hour per
student). It is only ever sent by her press: nothing sends it on its own.
`Email instead` for someone already welcomed creates a fresh link. The
recipient's captured address and account version must match at link creation,
email dispatch and the final welcome-state update.
A student needs no lesson to be welcomed; with no
lesson to come the email invites them to sign in and book their next one,
with no lesson list, and a student free at every length is asked for no card. Accounts an old launch check
registered (`launch-check-…@example.invalid`) are left out of the list.

Selecting a student opens their lesson history. The teacher UI reads
`GET /admin/bookings?from=1970-01-01T00:00:00.000Z&student=<id>` through the
existing teacher permission path: only that student's lessons, by account ID
(email only for older unlinked rows), and no `manualPaymentReconciliation`. It
reads them again whenever her schedule reads her lessons afresh.
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
password. A proven address, a teacher account and an account with no password
are never touched.

## Expressions collection — Stage 1

The teacher portal's `Expressions` tab follows Receipts. Its collection reads
and writes pass through `handleAdmin`, so either any account with `role = 'teacher'` or the
existing shared `ADMIN_TOKEN` can use them. Students and anonymous callers are
refused before any collection data is read or changed. Existing origin, JSON
content-type, bounded request-body and no-cache rules apply. The student picker
has separate authenticated endpoints below. There is no anonymous collection
endpoint (only approved translations are public, below), and this feature
sends no email.

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

The migration seeds 52 drafts from her earlier idioms app, with their original
expression IDs, Portuguese meaning, literal English, idiomatic English
equivalent (in `meaning_en`), notes and references. Its inserts use
`ON CONFLICT(id) DO NOTHING`, so applying `0026-expressions.sql` again never
overwrites her edits.

## Student expression picker

**Closed to students until Dan opens it.** The Worker var
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

Missing tables produce a controlled 503 on the affected endpoint while the
rest of the portal works.

The content inventory, original schema and feature map are in
[Expressions: source and scope](docs/expressions-stage-1.md). A public Expressões
page, an optional home-page expression and a weekly selection policy are plan
only. `/idioms/` is an authenticated painting page: teachers use their local
try-out, students use the same feature-gated endpoints, and signed-out visitors
sign in first. It adds no anonymous collection access or main-menu item.
Students' own translations are below.

## Students' translations of an expression

Students' translations are one of the painted reading's facts,
`Noutras línguas`, after its examples. It loads when the reading opens. Everyone reading
sees the versions Inês has approved, as a language label and the text. A
signed-in student's `Add yours` opens a small form in place that asks only
how they say it; its `language` is their device's language setting, named in
English (`Other` when the browser can't name it). It waits for Inês and is
shown only once she approves it.
The painting page needs an account, so a visitor who is signed out sees its
sign-in panel, which says they can add translations once signed in. If a
student's session has lapsed when they send one, the 401 forgets it and the
page returns to that panel.
Inês, trying an expression out, sees the approved list and a link to review
them in her collection. Her `Expressions` tab has a `Translations to check`
panel with the waiting count, each translation's expression, language, text,
student first name and date, and Approve or Reject (Delete for approved or
rejected ones). `GET /admin/expressions` also returns `pendingTranslations`.

| Method and path | Who | Request and result |
| --- | --- | --- |
| `GET /expressions/:id/translations` | Anyone | `{ translations: [{ id, language, text, createdAt }] }`, approved only, oldest first, for a published expression; 404 for a draft or unknown id. Never a student's name or id. Not behind `EXPRESSIONS_FOR_STUDENTS`. |
| `POST /me/expressions/:id/translations` | Signed-in `role = 'student'` | Only `{ language, text }`, each trimmed: language 1 to 40 characters, text 1 to 500. `{ status: "pending" }`, HTTP 201. |
| `GET /admin/expression-translations?status=pending` | Admin | `pending` (default), `approved` or `rejected`, up to 200: `{ translations: [{ id, expressionId, expression, language, text, status, createdAt, reviewedAt, studentFirstName }], pendingCount }`. |
| `POST /admin/expression-translations/:id/approve` and `/reject` | Admin | Sets `status` and `reviewed_at`; `{ ok: true, pendingCount }`. |
| `DELETE /admin/expression-translations/:id` | Admin | Removes it; `{ ok: true, pendingCount }`. CORS allows `DELETE`. |

Admin means the usual `handleAdmin` path: `ADMIN_TOKEN`, or any signed-in
account with `role = 'teacher'`, rechecked at each write. Adding is refused for
a teacher with 403 (`Only students can add translations.`), including a
teacher who is also a student, and with 404 while `EXPRESSIONS_FOR_STUDENTS`
is not `"1"`, as the picker is. The insert is one conditional write: the
expression is published, the student's session still stands and they have sent
fewer than 10 in the last 24 hours (counted from the table, any status; 429
otherwise). A student has at most one translation waiting per expression (409,
`You’ve already sent a translation for this one. Inês will check it soon.`);
once she approves or rejects it they can send another. Unknown body keys are
refused. A missing table gives a controlled 503 on these endpoints only, and
`pendingTranslations` reads 0, so her collection still loads. Nothing here
sends email.

Migration `0037-expression-translations.sql` adds `expression_translations`
(mirrored in `schema.sql`): integer `id`, `expression_id` and `student_id`
foreign keys that cascade on delete, `language` (1 to 40) and `text` (1 to 500)
checked by length, `status` in `pending`, `approved`, `rejected` (default
`pending`), `created_at` and `reviewed_at`. Indexes cover
`(expression_id, status, id)` for the public list, `(status, id)` for her
review, and a partial unique index on `(student_id, expression_id)` where
`status = 'pending'`.

**Ship order:** apply 0037 to staging and production D1, deploy the Worker,
then merge the site. The Worker tolerates a missing table, but the site's
panel needs the endpoints. The UI journey is `node scripts/qa-expression-translations.mjs`
with `QA_BASE_URL` pointing at a served build; its Worker replies are fixtures.

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

When Inês cancels a lesson, `Add a message to the email` takes an optional
message of up to 1,000 characters. It appears as **Message from Inês** in the
student's cancellation email and in her own copy, with line
breaks preserved and markup treated as text. An empty message leaves the email
unchanged. The message is stored separately from lesson notes, atomically with
cancellation or the refund claim, so refund reconciliation and email retries
retain it. Migration `0024-cancellation-message.sql` adds that nullable booking
field. The message does not change her no-fee cancellation or automatic refund
rules.

The week itself is where Inês takes time off, labels online-only time and
adds extra hours; there is no separate Time off tab.
Pressing a free time, or dragging over several on one date, opens a small
choice at them: `Add a lesson here` (for a single time), `From` and `Until`
to the minute, then `Time off`, `Online only` or `Extra hours`. Nothing is
written until she chooses. Extra hours are lesson starts for that one date,
read exactly as weekly hours are: every booking interval from `From` while
before `Until` (16:00–18:00 at 30 minutes starts 16:00 to 17:30). They are
offered only where they add a start (`offersExtraHours`: outside her weekly
and extra hours' ranges, never a whole day, a day off or a past date), drawn
with the weekly hours' wash and labelled `Extra hours 16:00–18:00`. Pressing
hours already off, online only or extra opens that whole block with its kind
pressed: another kind switches it, changed times save, `Open again` opens
only the times in the fields from time off and online only, and `Not
working` takes only those times out of the extra hours. Time off is never
online only or extra hours: setting one takes the span out of the others.
Online only labels bookable time, so extra hours can be online only too; a
block that is both, at the same times, opens on `Extra hours`, keeps its
label as its times change and loses it with `Not working` (`chooseHours` in
`src/lib/teacher-calendar.ts`). In the time fields `00:00` as Until means the
end of that day (stored as minute 1440). Each date has a `Day off` switch,
which blocks the whole day and takes away its online-only hours, and an
`Online only` switch, which labels the whole day and reopens a day off,
keeping its hours off. Hours off and extra hours save through
`/admin/exceptions/day`, in one request when both change; weekly blocks and
weekly extra rows stay. Under the week, `Clashes` lists
each lesson to come that time off or online-only hours left standing: booked
on a day off, inside hours off, or in person inside online-only hours
(`timeOffClashes`, proved in `scripts/test-teacher-calendar.mjs`). It is a
read of what the page already holds; no lesson is moved or cancelled by
taking time off: it stays on the calendar and needs its own move or cancel.
Each is a card whose `Change` opens that lesson's own
move/cancel dialog. `Coming up` beside it lists what is set beyond the week
in view (`timeAhead`; extra hours as `Extra 16:00–18:00`, not on a day off),
and pressing one turns to that week. Reopening a day
removes only its whole-day block, retaining partial time off and weekly
hours. Each date's change saves one request at a time, so quick clicks
coalesce into the date's latest choice. A failed older save keeps a newer
choice queued; failure of the latest choice puts that date back as saved and
says so.

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

`POST /admin/exceptions/day` takes `{ date, dayOff?, blocks?, extra? }`. The
three parts are independent and each replaces only its own one-off rows in one
batch, each write guarded by the teacher check and the availability revision
bumped once: switching the day off never discards the hours blocked within it,
reopening it brings them back, and an existing day off keeps its note. `extra`
is the date's extra hours as spans of times in the same `{ startMinute,
endMinute }` terms as `blocks` (end exclusive); each is stored as a `kind =
'extra'` row whose `start_minute` is its first start and whose `end_minute` is
its last start, the last step of `slot_interval_minutes` before the span ends,
as availability reads an extra window. Weekly blocks and weekly extra rows are
never touched there. Malformed or whole-day `blocks` or `extra`, and past
dates, are refused rather than partly saved. `GET /admin/availability` returns
weekly blocks alongside the upcoming one-off rows so the calendar shows every
time students cannot book.
`POST /admin/availability` validates every weekly range before replacing any
hours. Invalid ranges or more than 100 ranges return 400 without changing the
timetable; an explicitly empty array closes the usual weekly hours.

Both saves replace a whole set with what one page holds, so each page says
what it last read and is refused (409) once that is no longer so: a save made
over a change from another device would undo it. `POST /admin/availability`
takes `expected`, the week's ranges as the page last read or saved them, and
`POST /admin/exceptions/day` takes `expectedIds`, the ids of that date's
one-off rows; a refused hours save says to reload, and after a refused date
her page reads her days again and shows them as they are. Both fields are
optional; a save without one is not checked.
On her Timetable, taking a stretch out of a date's extra hours (`Not working`,
or time off over them) takes the lesson starts inside it and leaves every
other start where it was, so times typed off her start grid never shift the
hours left or add a later start.

The Timetable's `Edit weekly hours` control edits the usual weekly pattern in
the same calendar with click/drag, touch or keyboard input. `View lessons`
returns to the chosen week and day. Neither switching mode nor leaving the
tab saves or discards a draft; Timetable and its edit control mark unsaved hours.
`Save weekly hours` writes the existing first-start and
last-start rule format; it does not reinterpret the last start as a finishing
time. Precise existing windows remain available through `Set exact hours` and
are not rounded by the grid. Drafts survive week/view changes and booking
actions, and validation prevents the API from silently dropping invalid rows.

The tools bar groups `Students`, `Timetable`,
`Receipts`, `Expressions` and `Profile`, opening on `Timetable`. An old
`?tab=time-off` link opens Timetable.
Profile holds her sign-in email change, password reset link, Google Meet
connection and Sign out. Email changes use the new-address confirmation flow;
password changes use the reset email. Google callbacks open Profile directly.

Lessons only belong to students: there are no loose lessons.
`POST /admin/bookings` names the student by `studentId` (their account, which
works for a student with no email yet); one
who isn't on the site is refused ("Add them as a student first.", 404), and
students come from `POST /admin/students`. Each student's card is their profile
from their first invite to regular use.
Its name opens their details, prices and all-time lesson history in place;
the student fills the Students view, and the card's Close returns to the lanes.
Each detail and price is edited where it stands; lesson creation uses the same card. A past lesson she
added and nothing charged can be ticked paid there (`POST
/admin/bookings/:id/paid`), which takes it out of `unpaidPast`. A new student or a
free timetable time can start in the creation/student-choice dialog, then opens
the chosen row's lesson calendar with the selected date and time preserved.
Default teacher-list splats derive from the
student ID without replacing a chosen mark or writing account data.
All teacher actions still use the authenticated admin endpoints and their
existing booking, payment and email safeguards.

Onboarding lets Inês set a student up before they hear anything.
`POST /admin/students` takes `name` and optional `email`, `phone`, `nif`
(checked as `/me` checks it) and `mark`, creates the account with no password
and `awaiting_welcome = 1` (migration `0025-awaiting-welcome.sql`), and sends
nothing; an address already on the site is refused. A student she creates from the lesson
form is set up the same way. While a student is awaiting their welcome and has
never signed in, every `student_*` email about them is held at the one sending
point (lessons added, moved or cancelled, the Meet link, charges); her Google
Calendar, the blocked time and the lesson's NIF are unaffected, and her own
copy says they weren't emailed. Lesson, move and cancel replies carry
`emailed: false` so her page says so, and they carry it too for a student with
no address at all: one who has signed in from her WhatsApp link is no longer
held for a welcome, and still has nowhere to be emailed. `POST /admin/students/:id/welcome` sends
their upcoming lessons and prices (below) and the one-click way in, then clears
the flag, after which emails reach them as usual. Signing in themselves also
ends the hold.

The welcome's lessons are read from the lessons themselves, so they are right
whenever she added them and whatever she has since changed. Each of a student's
upcoming confirmed lessons becomes a bullet of two short lines, in the site's
email design: when it is, then its place, length and price. A weekly run is
**one** bullet (`Every Tuesday, 17:00` over `Online · 60 minutes · €22 a
lesson`, then `From 20 October`, or `From 20 October to 8 December` for one
that ends), a lesson on its own is one bullet (`Tuesday 20 October, 17:00` over
`Online · 60 minutes · €22`, or `… · €22 paid` once it is paid), and the trial
is named (`Trial lesson · In Porto · …`). Dates leave the year out: every
lesson here is still to come. A lesson belongs to its run while it still sits
on the run's own Porto slot, length (lesson type) and place, and keeps its time
on the student's own clock; one that was moved, lengthened or put elsewhere
reads as the lesson it now is, never as a second run. A run never hides a week
it has no lesson: for a student she set up, the welcome is the only email they
will have, because the emails about a skipped week (her day off) or a cancelled
one were held. So a run names the weeks between its first and last lesson that
have none (`No lesson on 22 September or 6 October`), unless the run has a
lesson on that day that now reads as its own bullet. A run with no end names
only its start, and only while it is active and for its latest stretch; a
stopped one says `to` its last remaining lesson. The price is the lesson's own
`amount_cents`, which `repriceStudent` keeps on the student's own rate for
lessons still to come (a run uses the next lesson whose price is still open,
never one she marked paid by hand), and the length is the lesson type's. Times
are on the student's own clock, their timezone (Porto by default) for an online
lesson and Porto's for one in Porto. The clock is said once, in the title over
the list (`Lessons · Porto time`), when every line shares it, and on each line
(`17:00 · New York time`, under a plain `Lessons`) when they differ. Their own
prices follow under `Your price`, one bullet for each length she has priced
(`60 minutes: €22`). Past twelve lines one more bullet says how many lessons
are left to the website. The layout's rows carry this as `title` rows (a small
label with no dab) and `fact` rows (one line beside a dab), beside the labelled
rows every other email uses.
For paying, it carries a link that adds their card where the site takes
cards, or the plain sign-in link.

A name alone is enough to set a student up, since she completes the rest
later, and a student with no email yet has lessons like anyone else.
`students.email` and `bookings.student_email` stay `NOT NULL`, so a student
without an address stores `no-email:<id>` in both,
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
Her way to them instead is the WhatsApp invite:
`POST /admin/students/:id/invite-link` makes the same one-click sign-in link a
welcome carries (14 days, single use, issued under the welcome's authorization
so a teacher session can make it), returns `{ url }` and sends nothing; her page
puts it after her own words in a `wa.me` link she sends from WhatsApp herself.
It is refused for a teacher account (409) and limited to ten an hour per
student (429). Pressing `See my lessons` on it signs them in and, as any
sign-in link does, sets `email_verified_at` and `last_login_at` even on the
`no-email:` stand-in, so a student with no email can save a card (Stripe is
given no address for them). For a student with no email, every sign-in link
ends `&addEmail=1` (not a credential, only which welcome to show), so the
welcome asks for their address beside its button; the same press signs them
in and requests the usual `/me/email` confirmation link, and Your lessons asks
again, before anything else and with nothing beneath it, if that request
failed or the link had no hint. A link made before an address change stops
working, as a welcome's does.
`POST /admin/students/:id/details` sets name, phone, NIF and splat at any time,
and writes only the fields it is sent, as a student's own save does: her page
sends the ones she changed, so a NIF or phone the student has saved since her
list was read is never put back to what it was.
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

`Students` combines setup and ongoing care. Each student
appears once, with inline setup while incomplete and a regular student row
when ready. The Timetable keeps up to three operational notices under her next
lesson, with `See all in Students` when there are more. It does not repeat
onboarding tasks. The strip stays absent when empty.
It is built in the browser by the pure `needsYou()` in
`src/lib/teacher-calendar.ts` from reads the page already makes:

- `GET /admin/bookings` rows, with the computed `first_lesson` and the
  `student_changed_at` stamp; the cancelled rows the timetable drops are kept
  client-side, so a student's cancellation (`cancelled_by = 'student'`) can be
  listed;
- `manualPaymentReconciliation`, which carries `student_name`, `starts_at`
  and the Stripe payment intent ids, for `Open in Stripe` (a link to the
  payment when the id looks like `pi_…`, otherwise to Stripe's payments list);
- `GET /admin/students` (`awaitingWelcome`, `nextLessonAt`, `email`, `signedIn`,
  `hasCard`, `hasLessons`, `unpaidPast`, `invitedAt` and existing prices);
- `GET /admin/google-calendar`, for Meet needing to be connected or
  reconnected.

Meet first, then payments in the Worker's order, then
student changes newest first, then undated tasks by next lesson and name:
Google Meet; a payment Stripe never confirmed; a student
she set up and has not emailed, at any time once they have an email; a
student with no confirmed lessons, whose Add a lesson opens the inline lesson
form; a lesson a
student changed in the last 72 hours (one card per weekly run and stamp); a
lesson a student cancelled in the last 72 hours (one card per weekly run;
the time is already open to students); and a new
student's first lesson, with their booking note in full,
in the next 7 days (a student's own booking with no earlier confirmed lesson of
theirs, matching older rows without a `student_id` by email; a lesson Inês added
never reads as a first lesson, even after the student moves it). The
older-by-email check in `first_lesson` is written `+legacy.status` so SQLite
stays on `idx_bookings_student`; without the plus it scans every earlier
booking for each row returned. A lesson appears
once. The internal `no-email:` placeholder never appears; a student with no
email is not a task, and their email reads as empty. One notice that is not
emailed to her comes from `GET /admin/students`:
`cardDeclined` (each saved-card lesson payment, no-show fee or late change fee
still `payment_due`, listed with the payments until it is paid, `Open` going to
the student). Declined cards also stay in Receipts. A card a student saves is
not a notice (12 November 2026, Dan: "doesn't feel like it's needed as a
notification unless Ines needs to act"; until then `cardAdded` listed the
lessons it paid for, for a week): their row's `Card saved` says it. Items clear
when done, after 72 hours, or once the lesson begins; the windows are
`NEEDS_YOU_RECENT_HOURS` and `NEEDS_YOU_AHEAD_DAYS`. The three that only tell
Inês something (a student changed or cancelled a lesson, a student's first
lesson) can also be dismissed with a small cross;
work still to do (Google Meet, a payment to check, a declined
card, no lessons, a welcome not sent) cannot. `POST /admin/needs-you/dismiss`
with `{ key }` (teacher only, the authorisation checked inside the write)
keeps the key in one `settings` row, `needs_you_dismissed`, a JSON object of
key to time, added and pruned in a single statement so two quick presses
cannot lose one (entries older than 30 days go; at most the newest 100 stay);
`loadSettings` does not read that row. `GET /admin/students` returns the keys
as `dismissed`, so her phone and her laptop agree. A key names what happened
and when (`changed:<booking>:<changed at>`, `cancelled:<booking>:<cancelled
at>`, `first:<booking>:<starts at>`, `card:<student>:<added at>`), so a second
change to the same lesson is a new notice. A dismissed notice does not count
on the Students badge. `studentWorkspace()` groups operational notices by
student ID, or an unambiguous real email for legacy bookings. Payments match
through their booking ID; unmatched notices and Meet remain above the list. It
ranks payments, then recent changes, then homework to review, then other
notices, above `To do`, `Waiting on them` and `All set`. The Students badge
counts each student with something that needs her once, plus general notices;
a link still to send, or waiting on a student's sign-in or card, adds nothing. Returning after five minutes away reloads lessons and
students, quietly: if the read fails, the lessons on screen stay and no error
replaces them. It reloads her weekly hours, time off and online-only periods
too, unless she has hours unsaved or a save under way: each save sends the
whole week, or a date's whole set, as the page holds it, so a page that read
them hours ago would put back what she has since changed on another device. An
open student card reads its lessons again whenever her list is read. Nothing polls.

The views add no endpoint or stored setup flags. A first welcome uses
`{ "onlyIfWaiting": true }`: the Worker answers 409 `Their welcome has already
been sent.` before spending the rate limit once the student has been welcomed
or signed in. First welcomes share one durable send, and its original sign-in
link, per student, address and Porto day: a retry or a racing press reuses
that exact request, so nothing is sent twice, and a send that failed and ran
out of retries does not stop a later day's press. `Email instead` for someone
already welcomed re-sends deliberately: it omits `onlyIfWaiting`, never sends
without an email, and surfaces the endpoint's three-an-hour 429 message.

Inline setup uses the pure `studentProgress()` over the same read: three
checks (signed in; a card saved with her lessons to come on it; nothing open
from the past), then the one next step. A card and what is open count only
where the site takes cards and the student pays something.
`hasLessons` includes confirmed past lessons and legacy lessons matched by email,
so returning students do not appear to need a first lesson. `hasCard` is returned
from the saved Stripe customer and payment method, consistent with `/me`.

Her steps expand in the row, reusing the details, prices and lesson forms.
Lesson creation includes a calendar and available start times from the existing
availability read, refreshed for the chosen lesson length. Choosing a slot
fills the date and Porto time. The calendar pages back twelve months: a past
day (or today's earlier times) offers every quarter hour from 07:00 to 21:45;
for a past time, How often steps aside and only the length, Where, the
`Already paid` tick and a coral `Add past lesson` follow. A past time in the
timetable offers only `Add a lesson here`. There is no manual date or time
entry in this form. The existing creation
endpoint still checks clashes and validates a weekly run. A saved change
refreshes the student list and timetable.
Each row says what is needed; help uses short bullets. Sign-in and card belong
to the student.

Migration `0028-student-changed-at.sql` adds `bookings.student_changed_at`.
A student's own move (`handleReschedule`, `handleRescheduleSeries`) stamps it in
a separate guarded statement after the move succeeds, only on the rows and
sequence it wrote; Inês's move (`adminReschedule`) clears it the same way. Both
tolerate the column being absent (a warning, `student-changed-at`, in the
Worker's log), so the move itself never depends on the migration. It plays no
part in fee detection.

### Notes & homework and her plan

Each student's dashboard (their open card in Students) carries her notes and
their homework on each past lesson's row, and her plan for them beside their
details. It is hers alone. The dashboard reads the lessons and the notes side
by side and
matches them by booking id. `GET /admin/students/:id/notes` returns her plan and every confirmed
lesson of theirs that has started (no-shows left out), newest first, with the
private notes from `lesson_homework`, its level and one homework state:
`none`, `draft`, `published` (with them), `review` (submitted, not yet
returned) or `done` (returned). Notes are still written through the lesson's
homework editor; the dashboard only reads them.

Migration `0038-student-plans.sql` adds `students.lesson_plan` and
`students.lesson_plan_updated_at`. `POST /admin/students/:id/plan` with
`{ plan, updatedAt }` saves at most 4,000 characters, teacher only, and
answers 409 when `updatedAt` isn't the saved one, so a stale window never
overwrites a newer plan. **Ship order:** apply 0038 to staging and production
D1, then deploy the Worker. Before it is applied the page reads an empty plan
and saving one answers 503; nothing else depends on it.

### Dormant students and the come-back email

Dormant marks a student who hasn't had a lesson in a while, so Inês can send
them a come-back email. It is hers alone. Migration `0036-dormant-students.sql`
adds `students.dormant_at` and `students.dormant_emailed_at`; nothing a student
sees, books or is charged reads either.

- **Marking.** A student's profile (their name, then the lesson history panel)
  offers a `Mark as dormant` button while they have no lesson to come,
  and `Mark as active` once dormant. `POST /admin/students/:id/dormant` with
  `{ dormant: true | false }` sets or clears `dormant_at`, teacher only; a
  lesson to come answers 409. Nothing is emailed.
- **Waking.** `GET /admin/students` returns `dormant` only while no lesson
  has brought them back since `dormant_at` (`dormantSql()` in the Worker): a
  confirmed lesson ending after the mark (one they book, one she adds, or one
  she records as had) makes them active again with nobody unmarking them, and
  so does one booked after the mark and then cancelled. A lesson recorded
  from before the mark, or cancelled before it, does not.
- **Her list.** Dormant students leave the main list for a `Dormant · n`
  section beneath it, by name, labelled `Dormant`, with no setup steps and no
  setup count on the Students badge. One with something new for her (a
  payment, a change, homework) stays up top until it clears.
- **Each student's email.** A dormant student with an email has
  `Come-back email` in place of `Sign-in link` among their row's controls,
  since it carries one. Its panel
  is written for them: the subject, and `Olá <first name>,` above the default
  message, both hers to change for that student (150 and 3,000 characters),
  with `Start again` once she has, then coral `Send to Marta`.
- **The default** is what each panel starts from: the standard words in
  `dormantEmail()` until she saves her own (`settings.dormant_email_subject`
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
  own), then `Choose a time`, the one-click sign-in link (14 days, once) her welcome uses, and
  the welcome's footer. Replies go to her. A teacher who is also a student is
  never sent a sign-in link, so theirs is `Book a lesson`, to `/book/`. It is
  never held for a welcome: for someone she set up and never welcomed, it is
  their welcome, and `awaiting_welcome` clears once it is sent, so their
  lesson emails may follow.

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
  Google renders that button itself and will not be styled, so a student sees
  Google's own button, visible and untouched, inside a coral frame of ours.
  Nothing of ours is drawn over or under it: Google replaces its first button
  with a cross-origin iframe of a different size, so anything pinned to the
  first is wrong once the second arrives. The ID token and the Worker's
  verification are Google's.
- **Only one JavaScript origin is registered**: `https://portuguesewithines.com`.
  Google's ID-token flow consults that list and ignores the redirect URIs, so the
  button renders anywhere but can only complete there. Local development ships
  the client id and fails on click until its origin is added to the OAuth
  client.
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
  sign-in, forgotten-password and email change avoid. It is deliberate:
  hiding it would mean mailing every new student a
  confirmation link before they can book, and telling a returning student to
  sign in is the more useful answer. Five new-account attempts per connection
  an hour (IPv6 counted per /64), taken before the address is looked up, limit
  how fast addresses can be tested.
- Reset links are single-use and last an hour. A Google-only account has no
  password; using "forgot password" is how such a student sets one.
- **Sign-in links** (migration 0023). `Email a link` on the sign-in
  panel (`POST /auth/email-link`) emails an existing student account a link
  that signs it in once, within 30 minutes; the answer is the same whether or
  not the address has an account, and each account gets three an hour. The
  links in emails Inês causes last 14 days. A link is signed like a reset under
  its own prefix, and its `sign_in_links` row is the record that it is unspent:
  `POST /auth/email-link/confirm` deletes the row first, so of two clicks one
  signs in (the page calls it only when the student presses `See my lessons`, so a
  mail scanner opening the link spends nothing), and only while the account still has the address the link was sent
  to. A link proves the address. On an account that was registered with a
  password and never proven, it makes a Google first link's transition: the
  password, other sessions and any pending reset or address change go. Teacher
  accounts are never sent one. `/book/?signin=` takes the link out of the
  address bar at once and shows `See my lessons`; pressing it opens `Your lessons`,
  and a spent or expired link opens the panel on asking for a new one.
- **An address counts as proven once it has received mail.**
  `students.email_verified_at` (migration 0020) is set by any Google sign-in,
  a completed password reset or a confirmed email change; registering with a
  password leaves it empty. It decides
  whether a lesson Inês adds for that address clears a password first (see
  *Who can do what*): for an unproven password account it signs them out once,
  and that confirmation tells them how to get back in. Sign-in, password reset
  and email confirmation fail without the column
  (`workers/booking/migrations/0020-verified-email.sql`), and `/health` reports
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
  asked to sign in; booking asks only at confirmation. Their way to lessons
  already booked is the site header's `Sign in`, beside the bar's menu button
  where there is room and as the last row of every menu. It opens
  `/book/?view=lessons`, which asks at once because the data is private and
  shows the `Your account` card on its own; the header's `Booking` is the way
  back to booking. A browser where a student with a booked lesson has signed in
  keeps a local flag that outlives the session and grants nothing (Inês or an
  unused account does not set it); it decides only whether the trial is
  offered.
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
  menu: `Your lessons` with the upcoming count, `Edit details` and `Sign out`.
  Your lessons is one schedule: the calendar of lessons to
  come, then `Past lessons` beneath it on the same card, each a two-line row
  with its homework (`/me/homework`, matched by the lesson's start) at the
  row's end. On a wide card the places sit open in the header as one sliding
  control; on a narrower one the student's name, under the heading of
  whichever account card is showing, opens it. Booking lives on the card, not
  in the menu. Choosing Your lessons switches away from any active booking or
  lesson-management detail, and clicking the current destination keeps it
  open. Your details and a lesson's homework sheet take the calendar card's
  place, headed the same way; `Done editing`, the sheet's `Your lessons` and
  the places return to Your lessons, a sheet saving its answers first. A
  homework list that cannot be read leaves the past lessons showing with a
  quiet `Try again`. While booking the menu waits, and the booking bar's
  `Your lessons` is the way back.
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
  the card as a row with its Meet link. A weekly lesson's `Change` and
  `Cancel` each choose `This lesson` or `Every week`, and `Your lessons` counts
  an active repeat once.
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
  occurrences are identified there as part of a sequence: with `This lesson`
  chosen, as it is at first, either action affects only that lesson.

### Repeating bookings

**Selecting several lessons together.** One request can select up to eight
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
both initial times must still be free.
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
  recipe that made them. That is what puts the time in Inês's calendar for real,
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
  standing time is the case it is meant to allow. Even at 84 days,
  a run starting a few weeks out would otherwise quietly lose its last weeks.
- **A recipe is never swept while it is being written.** The minute sweep's
  housekeeping removes a recipe with no lessons (an abandoned card
  setup's, once its 35-minute holds lapse) only when it is more than ten
  minutes old: a recipe is written a moment before its first lesson is tied
  to it, and taking it then would fail that booking part way.
- **One initial email each way, carrying every current lesson in one calendar
  file**, each event under its own booking's UID so a later change to one week
  still matches the entry already in her calendar. Twelve lessons must not mean
  twelve emails. When an open-ended run is topped up, the new lesson appears in
  the student's booking calendar without another confirmation email. When
  teacher notifications are enabled, Inês gets one calendar update so the added
  time reaches her external calendar.
- **Existing open-ended series are topped up by the nightly scheduled sweep**, not on a page view: her
  calendar has to be right whether or not anyone has opened the site, and a read
  path that quietly writes bookings is impossible to reason about later.
- **Stopping a repeat keeps the lessons already booked.** Someone who stops
  repeating almost always still means to attend the ones in their calendar;
  cancelling those silently would be the worse of the two mistakes. The
  lessons kept then show as ordinary one-off lessons on the calendar. Passing
  `cancelRemaining` cancels them too. It applies the same payment policy as an
  individual cancellation: a future paid lesson is refunded, an uncharged one
  is never charged, and a lesson inside the 14-hour window remains booked. A selected
  weekly lesson's `Cancel`, set to `Every week`, offers `Cancel all booked
  lessons` (`cancelRemaining: true`) and a quiet `Stop repeating` (`false`);
  the step states what each does and is itself the confirmation.
- **Moving a recurrence moves every future confirmed occurrence together.**
  The student chooses the new weekly anchor, length, and location through the
  same compact change-booking controls, under `Change` set to `Every week`. It
  starts on the run's first lesson outside the notice window, the anchor the
  Worker lays the run out from, so keeping that time keeps every week in
  place; a later lesson opened never shifts the earlier ones. Each lesson
  takes the new day and time in its own week of the run (the week it sits
  nearest, counted from that anchor as her every-week change counts them, and
  never two in one week), so a week the student cancelled, or one skipped when
  the run was booked, stays out, and `filled_to` keeps its week too, so the
  top-up never adds again a week it had already considered. Every proposed week is checked before
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
  updated calendar email, for every move: its `email_log` key names the run,
  the lesson the move began from and that lesson's sequence, since a run's
  sequences begin again at 0 with each week the top-up adds. Inês gets her
  copy when teacher notifications are enabled.
- **Inês can change the length of, or cancel, a weekly lesson and every later
  week of its run in one go.** Both start from the lesson she opened, which
  must still be to come to take the
  weeks after it too; lessons before it are never touched, and a lesson
  already had changes only on its own (see correcting one, below).
  A change of length alone, `POST /admin/bookings/:id/change` with only
  `lessonType` (`single` or `long`), the displayed `expectedPriceCents` (the
  student's own price for that length, a 90 derived as 1.5× their 60) and
  `following`, is handled as follows. A lesson a card has paid,
  with a payment due or going through, a free one going to a priced length,
  or one the longer lesson would run into another lesson, keeps its length
  and comes back under `kept` with a short reason; her own lessons keep no
  gap, as when she adds one. One ticked `Already paid` is not held: it changes
  like any other and stays ticked, at the price of the new length. A student
  cannot change the length of one. The rest change in one JSON-backed write that
  checks each row's sequence, length, payment state and price snapshot, that
  the run has gained or lost no lesson since the read, and that nothing
  overlaps: all of them or none. Each keeps its calendar UID with a higher
  sequence and its time, takes the new end and price, and with `following` the
  run's recipe takes the new length so later top-ups use it. One email tells
  the student (`Inês has changed your lessons to 90 minutes`), or the single
  lesson's own when only one changed.
- **Inês can change when, how long and where in one go.** `POST
  /admin/bookings/:id/change` takes any of `startAt`, `lessonType` with
  `expectedPriceCents`, and `location`, plus `following`. For a lesson still
  to come a new time must be to come too (a lesson already had is corrected
  within the past, below). A length alone is the length change above. Otherwise the lesson she opened takes
  the new instant, and with `following` every later lesson takes the new day
  and Porto time in its own week: the week of the run it sits nearest,
  counted from the lesson she opened and stepped by date keys, so clock
  changes never shift it and a week the student had moved on its own comes
  back to the new day with the rest. What her page says before she saves
  (`3 lessons move to Thursdays at 16:00`) is therefore what happens. A
  lesson whose payment is going through, that cannot take the new length (as
  the length change decides), whose new time does not exist on a clock-change day, or
  that would run into another lesson takes none of the change and comes back
  under `kept` with a short reason; of two of the run's lessons that would
  meet, the later stays. The rest change in one JSON-backed write guarded
  like the length change's (each row exactly as read, the run's count, no overlap,
  the price snapshot when the length changes, her authority). Each keeps its
  UID with a higher sequence, counts as a move and never takes a fee. With
  `following` the recipe takes the new weekday, time, length and place, and
  `filled_to` moves to the new day in its own week inside the same guarded
  batch, so later top-ups follow. They follow by her rules: an every-week
  change of day, time or place records the run in the `teacher_placed_runs`
  setting (a list of run ids, pruned to runs still going each time one is
  added, so no migration), and the nightly top-up plans a run in it as it
  plans one she added: held only by her days off and her other lessons, with
  no gap and no notice. Without that, a student's own run she moved outside
  her published hours would have every new week skipped and run out with
  nobody told. Its weeks stay the student's own in how they are paid
  (`added_by_teacher` is unchanged), and the student moving the whole run
  themselves takes it off the list. A place change is handled as a student's:
  the new sequence makes the Meet sync patch the one Google event, adding or
  removing its room. She is held only by overlap, never by her hours, time
  off or online-only periods. One email tells the student (`Inês has changed
  your lesson` / `Inês has changed your weekly lessons`), naming any week
  that stayed; a time-only move of one lesson keeps the words it always had.
- **Inês can correct a lesson already had.**
  `/change` takes a lesson that has started, a record included,
  while nothing of it is on a card: `not_required` or `recorded`, no charge
  started, ticked `Already paid` or not (a ticked one stays ticked, at the
  price of what it now is). It takes 60 or 90 minutes at the
  student's price for the new length now (`expectedPriceCents` checked as for
  a lesson to come), online or in person, and a new day and time that is
  still in the past. It changes on its own: `following: true` answers 400 `A
  lesson already had changes on its own.`, and a time to come answers 409 `A
  lesson already had stays in the past. Add a new lesson instead.` Another
  lesson in the way refuses it. The write is the same guarded one, with the
  row required to be still past and still off any card. Nobody is emailed
  and nothing goes to Google Calendar or Meet (`emailed: false`); one still
  running is held out of the Meet sweep until its new end. A past lesson
  that cannot take the change says why in the same words as one to come
  (`it's already paid`, `it has a payment due`, `its payment is going
  through`, `it's free`, `it's a trial lesson`, `it would run into another
  lesson`), plus `it's on their card` for one scheduled on a card and not
  yet charged: what a card is about to be charged for is never changed
  behind the student's back. Her page uses `/reschedule` only for a past lesson that keeps
  its length and place for one of those reasons, to move its time. That time
  stays in the past too (409 `A lesson already had stays in the past. Add a
  new lesson instead.`): moved on, a lesson a card had paid could be
  cancelled from its link for a refund. Only one still waiting for its card
  charge, with nothing taken, moves on to a time to come (a no-show to another
  day, see *The no-show policy*), and the write checks it is still waiting.
  `POST /admin/bookings/:id/cancel` with `following: true` ends the run first,
  so the nightly top-up cannot add a week, then cancels each confirmed lesson
  from this one on exactly as her single cancellation does: a card payment is
  refunded, money owed is waived, nothing is charged, and her optional message
  travels in one email listing them. A lesson whose payment is part way
  through stays and is listed under `kept`.
- **A run saves a card once and charges each lesson after it.** Stripe Checkout
  runs in setup mode, so no money is taken while the run is booked. The whole
  run is held until its webhook proves a reusable card exists, then every
  occurrence becomes `scheduled`. The minute cron charges an occurrence
  when it ends, on the first sweep at or after `ends_at` (see
  *The no-show policy*). Open-ended top-ups inherit the same consent
  and scheduled state. A declined charge marks the row `payment_due` and emails
  the student a hosted pay-now link; Inês sees it as a Needs you card until it
  is paid, and it is not emailed to her.

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
  on email alone and overwriting `google_sub` would be an account takeover: point
  your own row at an address someone else uses with Google, and their next
  sign-in would hand you their account with your password still on it. Email
  is kept only as a
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
  future lessons are re-addressed, as are past ones whose lesson payment or late
  change fee is still to settle: a card is charged after the lesson, so its
  receipt or pay-now email goes to the new address. Still to settle includes a
  lesson already had and open to pay Inês (`not_required` or `recorded`, not
  ticked `Already paid`), since an approval can put it on a card. A lesson
  still holding the no-email stand-in always takes the address. Other past and
  cancelled lessons keep the address they were taken under, which is the record
  of what happened.
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
- **Receipts.** `GET /admin/receipts?month=YYYY-MM`
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
  lesson (`free`, €0) never has a line, and an unticked record (`recorded`)
  has none while it is open: it gets its line when it is ticked or a card
  pays it.
  Her Receipts tab shows the same lines and downloads them as CSV, so her
  automation can work from the JSON, the CSV or the table and remember each
  `id` it has issued. The rules live in `workers/booking/receipts.mjs`.
- **Where it appears.** Inês's fatura-recibo automation reads her booking
  emails and schedule, so every email she gets about a student's lessons
  (bookings, weekly runs, moves, cancellations and payments)
  carries a `NIF` row beside the student, with the number or
  `Not given (consumidor final)`, read when the email is sent. Her Receipts
  tab and her student profiles state it the same way; her lesson details are
  about the lesson and do not carry it. The student's own payment email shows it,
  when given, so they can check it before the receipt is issued; their other
  booking emails do not. It is never sent to Stripe or written to logs, and it
  stays out of the shareable Google Calendar events.
- **Release order.** The Worker that writes `students.nif` needs
  `workers/booking/migrations/0017-student-nif.sql` applied first. `/health`
  reports `schema` until the column exists, so the site's release gate refuses
  to publish against an unmigrated database.

### How far ahead you can book

`booking_horizon_days` is **84**: students can choose a lesson up to twelve
weeks ahead, and the calendar shows that window four weeks at a time rather
than as one long scroll.

- The front end asks for a window wider than the horizon and lets the Worker
  clamp it: a fixed window shorter than the horizon would draw weeks of empty
  cells saying "no times free" — a lie rather than a gap.
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
  confirmation keeps the trial being booked. The Worker does not apply this.
- The confirmation carries the same choices bar as the calendar, so location,
  length, kind and repeat change in place there; there is no separate
  `Change details` route or setup screen to return to.
- **When she moves a lesson, the emails say so**, never in the student's own
  voice, and her copy does not say the student moved it.

### What stops two people booking one lesson

- **The decision and the write are one statement.** A booking row is inserted
  only if nothing overlapping exists, and zero rows affected is the 409. The
  same guard is on rescheduling and on every occurrence of a series. A check
  and a separate insert are a race, and not a theoretical one.
- **Overlap, not equality.** Lessons are 60 and 90 minutes and can start on
  any quarter hour, so a 90-minute lesson at 17:00 and a 60-minute one at 17:30
  collide while starting at different times. A unique index on the start time
  would miss that. For a student's lesson the guard widens each lesson by the
  free gap on both sides, which keeps that gap between any two lessons.
- A series occurrence that loses the race becomes a skipped week rather than a
  failed booking: the rest of the run is still worth having.

### Notes on the email and calendar output

- **Seventeen templates.** `workers/booking/email-templates.mjs` owns every
  email's words and structure; callers pass formatted facts. Student booked
  (one lesson or a run, by them or by Inês, with or without her welcome
  steps), Inês's booked copy (including a run carried forward), reminder and
  Meet link, student and teacher moved, student and teacher cancelled, the
  student's receipt (lesson, no-show or late change fee), Inês's payment
  received, the student's declined card, welcome, sign-in link, password
  reset, email-change confirmation and notice, homework to review, and a
  dormant student's come-back email.
  Her notification subjects stay stable because her filters and receipt
  automation read them; her payment-received emails keep their subject,
  heading, preheader, Portal das Finanças note and `Lesson`, `Reference` and
  `NIF` rows exactly, because her records read them.
  Student welcome subjects identify the lessons or the invitation to book;
  any card setup is explained in the body.
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
  the URL. A lesson's facts are bullets: its place, length and amount on one
  line (`Online · 60 minutes · €25`), how it is paid
  on the next (the `priceValue` terms), the Meet link as its own. The footer
  keeps the applicable change rule in the site's words (FeeFacts) without
  repeating payment timing, or a fee or refund the note above it already
  states (a late move on a saved card ends `This fee applies once per
  lesson.`). Receipts and declined-card emails state the amount once, in the
  introduction and on the button; Inês's copies of a move show what changed
  under `Before`. A cancellation names its place rather than linking its call,
  and an automatic notice ends `Sent automatically by the booking system.`
  above the site's link.
  Amounts are written as the site writes them: whole euros bare (€25), anything
  else with its cents (€22.50), never rounded.
- Email fonts use the existing local font stack with Arial/Helvetica fallbacks;
  no external font stylesheet is loaded. Welcome emails explain that Inês sent
  the invitation, name `portuguesewithines.com`, and explain how to open the
  website directly or reply to her. Prices, card requirements and the signed
  one-click link are in both HTML and plain text.
- `email/receipt-kit/README.md` and `scripts/build-receipt-email-kit.mjs` provide
  the matching Gmail/Codex receipt-email kit. It attaches the original fiscal
  PDF issued by Inês's separate automation; it does not issue documents or send
  customer receipts from the booking Worker.
- **Everything a student typed is escaped.** Callers send `\n`, never `<br>`,
  and the template turns it into a break, so a name, an address or a lesson
  note never reaches Inês's inbox as markup; she is the one person who reads
  every one of these.
- **`CN=` is a parameter, not a text value.** iCalendar text escaping is wrong
  there — a semicolon starts the next parameter and a colon ends the list — so a
  student's own name could forge calendar properties or cut the address off the
  ATTENDEE line. Parameter values are quoted per RFC 5545 §3.1.

### Email authentication and inbox placement

Students have reported invitations arriving in spam; the cause is unconfirmed.

The sending domain is `portuguesewithines.com`, through Resend in `eu-west-1`.
Its public DNS and Resend configuration:

| Purpose | DNS name | Configuration |
| --- | --- | --- |
| SPF | `send.portuguesewithines.com` | TXT `v=spf1 include:amazonses.com ~all` |
| Return-path feedback | `send.portuguesewithines.com` | MX priority 10, `feedback-smtp.eu-west-1.amazonses.com` |
| DKIM | `resend._domainkey.portuguesewithines.com` | Published public key matching the verified Resend domain |
| DMARC | `_dmarc.portuguesewithines.com` | TXT `v=DMARC1; p=none;` |

SPF belongs on Resend's `send` return-path subdomain; an empty apex TXT lookup
does not mean it is missing. DMARC's `p=none` is a valid monitoring policy,
not an instruction to put legitimate messages in spam. Open and click tracking
are disabled. Invitation action links and image assets use the sending domain.
The sender address is sending-only; replies use the configured `Reply-To`
inbox, not the sender address (see the contact section below).

A provider `delivered` event means the receiving server accepted the email;
it does not reveal inbox versus spam placement. A spam report alone cannot
establish an AI-content flag or an authentication failure. To diagnose an
affected message, obtain its original headers and the recipient's displayed
spam reason, then compare SPF, DKIM and DMARC results, sending IP, dates and
Resend's Deliverability Insights. Redact recipient addresses and private sign-in
links before sharing diagnostic material outside the account.

Optional DMARC aggregate reporting needs an agreed reporting mailbox or service
before adding a `rua` address; do not tighten the policy as a speculative spam
fix. Students who expected the invitation can mark it as not spam and add the
sender to their contacts. Confirm the effect of any changes on a newly received
message; template changes do not prove improved inbox placement or justify
resending every invitation.

Sources: [Resend's spam troubleshooting](https://resend.com/docs/knowledge-base/why-are-my-emails-going-to-spam),
[Google's sender guidelines](https://support.google.com/a/answer/81126?hl=en),
and [Resend's delivered-message guidance](https://resend.com/docs/knowledge-base/what-if-an-email-says-delivered-but-the-recipient-has-not-received-it).

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
  from `bookings.created_at` and the `student:rescheduled:`,
  `student:series-moved:` and `student:series-length:` keys in `email_log`, so
  a card saved or an address changed does not suppress it.) A whole-run email
  counts only for the weeks it told of: those from the lesson it began from
  (its `booking_id`) on. An earlier week her change from a later week never
  touched keeps its reminder.
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
Legacy attempts without a saved body/key (or, for a lesson email, a saved
snapshot), recipient changes and expired attempts become `unconfirmed` for
manual reconciliation. No automatic resend can turn an
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
identity, version, owner, dates and rendered financial facts in
`email_log.lifecycle_json`. The sweep filters
that complete snapshot before its batch limit and the send claim checks it
again. A changed member cannot replay a stale combined confirmation. Snapshot
metadata is purged with the private body after delivery or expiry.
Mixed-price runs name each occurrence's own amount and payment terms rather
than presenting the first lesson's price as the price of every lesson.

### The no-show policy

For a confirmed saved-card lesson, the teacher schedule's lesson dialog offers
a `No-show` tick beside `Already paid` (its accessible name `Mark no-show`)
from the scheduled start until **the scheduled end** (`NO_SHOW_WINDOW_HOURS = 0`
in `policy.mjs`). So Inês marks a no-show while the lesson is on, typically a few
minutes in, and ticks `Already paid` for a cash lesson before it ends. The same
control can undo the mark during that window. `POST /admin/bookings/:id/no-show`
(`{ "noShow": false }` undoes) accepts the change only inside that window and
only while `payment_status = 'scheduled'`; from the end it answers 409.
Because a no-show changes the amount, the lesson's own charge waits for the
window to close: nothing about the lesson's payment — the charge attempt, the
move off `scheduled`, the receipt, a declined card's pay-now email — happens
before `ends_at`. The charge sweep then claims the row as
`processing` before reading attendance, so the teacher decision cannot race the
PaymentIntent. Until the charge, a lesson inside the window is still an
ordinary `scheduled` one, so Inês's own move and cancel still reach it.
Attendance writes also require the original lesson version and times. Moving an
uncharged scheduled lesson to a genuinely different time clears its old no-show;
a same-time edit and already committed payment retain attendance evidence.

- **Expected attendance** charges the booked lesson price at `ends_at`, on
  the first minute sweep at or after it.
- **No-show** charges €5 at the same point, instead of the booked lesson price.
- If Inês configures that fee to zero, the Worker settles the zero obligation
  without a Stripe request, receipt or payment-recovery link. The lesson keeps
  its booked `amount_cents` on record, with `charged_cents` 0. A positive charge
  already captured under its immutable request keeps that original amount.
- Bookings without explicit automatic-payment consent remain
  `not_required`; the teacher control is not offered for them.
- Moving or cancelling less than 14 hours before the lesson is a separate €5
  action fee, stored independently so a retry or second edit cannot duplicate
  it, and still charged when the change is made.
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

**Online-only periods.** Inês labels a whole day with its `Online only` switch,
and some hours from the choice at the times, on the teaching clock. A date may
hold several online-only spans. The service stores periods, not days: each
includes both dates and is either all day or one daily window, with `00:00`
as Until meaning the end of that day. The website converts between the two
(`labelOnlineOnly`, `setOnlineOnlyHours`, `onlineOnlyHours` in
`src/lib/teacher-calendar.ts`, proved in `scripts/test-teacher-calendar.mjs`):
neighbouring days with the same hours are one period, a period splits around
days taken out of it, a date's further spans are periods of their own, and
each save sends the whole list against the revision it was read at, with
periods wholly in the past left out. Online only saves as she chooses it,
one save at a time, quick changes coalescing into the latest list; a failure
puts the list back as saved and says so under the week.

A student who has chosen In Porto is shown which days could still be had
online. The calendar reads the online availability beside the Porto one (the
same `GET /availability` request the Online choice makes, from the same
cache), and a time free online but absent from the Porto reply is drawn as
online only. It is a read alone: such a time cannot be chosen or sent while
In Porto is chosen, a failed read leaves the calendar as it was, and no
booking, move or preview request changes. `Switch to online` is the Where
control's own change of place.

These periods restrict the place of new student bookings, without adding
teaching hours or overriding time off, notice, gaps or clashes. A lesson whose
elapsed duration overlaps any part of a period must be online, including a
90-minute lesson starting before it, an overnight lesson and repeated hours
on a clock-change day. Touching the start or end without overlapping is allowed.
`GET /availability?location=porto` omits those starts; the default is online.
The booking calendar caches each place separately, checks retained selections
when the place changes, and weekly previews use the selected place too.
Booking writes, selections, moves (including online-to-Porto at the same time),
weekly moves and future student-series extensions enforce the same rule.
Unavailable later weeks are skipped under the existing series rules.

Existing lessons keep their place and time. Inês can still deliberately add or
move a lesson herself using her normal teacher override; an existing series
she created keeps that override too. No period changes a lesson, sends mail,
changes a meeting link or charges anyone.

The bounded list (at most 100) lives as JSON in `settings.online_only_periods`.
`POST /admin/online-only` takes `{ periods, expectedRevision }`, with period
fields `{ id, fromDate, toDate, startMinute, endMinute }`, and returns the saved
list and its new `revision`.
`GET /admin/availability` supplies `settings.onlineOnlyPeriods` and
`settings.onlineOnlyRevision`. Saves check the teacher's live session and
`online_only_revision` in the transaction, returning 409 for a stale editor,
and bump `availability_revision` so already-planned booking writes cannot
ignore a newly saved restriction.

Instants are stored as ISO-8601 UTC. Inês's weekly hours are stored as
minutes-from-midnight in Porto time and resolved against `Europe/Lisbon` at query
time, so the rules survive DST instead of drifting an hour twice a year.

Student bookings and moves require at least **14 elapsed hours** of notice,
including across Porto clock changes. Slots inside that window are omitted from
availability and rejected again when a booking or move is submitted; exactly
14 hours is allowed. Switching only between online and Porto, at the same start
and length, is not a new time and is not refused by this rule; inside the window
it is a late change like any other (see *Late changes*).
`settings.minimum_notice_hours` controls the live rule; the seed and
missing-setting fallback are both 14. The same setting is also the free-change
window (see *Late changes*), so it affects both booking notice and fee terms.
Admin changes may relax it to a whole number from 0 through 14 hours. A
stricter window requires updated published terms and student consent before
implementation.

`availability_rules.last_start_minute` is the latest a lesson may **begin**, not
when she finishes: read as a finishing time, it would give the 90-minute lesson
an earlier last start (18:30) than the 60-minute one (19:00).

`settings.lesson_buffer_minutes` is **15**: the 15 minutes after every lesson
stay free. A student cannot book a lesson that starts within 15 minutes of
another ending, or that would end within 15 minutes of the next one starting.
Availability, every write guard for
a student's lesson (single, several at once, weekly runs and moves) and the
booking page's check between a student's own picks all apply it; `/availability`
reports it as `bufferMinutes`. Inês's own bookings and moves are exempt, so she
can still place a lesson straight after another. A lesson keeping its time, such
as a switch between online and Porto, is not held to a gap its neighbours were
booked without. A missing setting means no gap.

Her lesson picker uses authenticated `/admin/lesson-availability`, which offers
future starts within her hours without the student notice window or buffer.
Confirmed lessons, active checkout holds and time off still block overlapping
choices. Teacher accounts and the emergency access key can use this endpoint;
the public `/availability` keeps student rules even for a teacher's own booking.

`settings.slot_interval_minutes` is **15**: within her hours a lesson can start
on any quarter hour, so the next lesson can begin as soon as the free 15 minutes
end. Inês's schedule keeps half-hour rows; a lesson at :15 or :45 sits at its
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
and the obligation to pay. The toggle sends the `paymentConsent` boolean.
Reading the combined notice preserves the selection and agreement.
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

The public notice gives the contact email `aprenderportugues.ines@gmail.com`,
Época as the contact address, Inês's own NIF and her status as a sole trader
(trabalhadora independente). The identifier is maintained only in the public
notice; do not duplicate it here.
[Época's own site](https://epocaporto.net/) verifies Rua do Rosário, 22, Porto.
The published WhatsApp number stays. `bookings@portuguesewithines.com` is a
verified sending address, but the domain has no incoming-mail MX records and
Resend receiving is disabled. Do not offer that address as an inbox until
incoming delivery has been configured and verified.

The notice draws on [DL 24/2014](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2014-73222992)
for paid-order wording and statutory withdrawal, [DL 7/2004, article 10](https://diariodarepublica.pt/dr/detalhe/decreto-lei/7-2004-240775)
for trader identification, [GDPR article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
for privacy information and [AT's record-retention guidance](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Oficio_Circulado_30213_2019.pdf)
for the normal ten-year fiscal archive. Provider transfer details link to the
providers' own published terms; this is not an account-specific transfer audit.
Account/booking deletion and closure are requests handled by Inês, not an
automatic inactivity purge; legal financial and unresolved-dispute records
can limit deletion.

**Legal limits still requiring operational resolution:** the notice offers
statutory withdrawal via Inês's confirmed email and says the ordinary €5 fee
does not override those rights. The automatic fee logic does not
distinguish statutory withdrawal, so Inês must handle valid requests and any
refunds within the legal deadline. Booking does not provide an
early-performance request/acknowledgement, a durable copy of the full contract
and withdrawal form in confirmation emails, or the online withdrawal function
introduced by [Directive 2023/2673](https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX%3A32023L2673).
The applicable Portuguese requirements and their implementation need review.
Inês's own electronic complaints-book registration also remains unverified;
Época's registration must not be assumed to cover her teaching business.
See [DL 156/2005, articles 2 and 5-B](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2005-34431675).
Do not represent the notice as certification of legal compliance.

Production uses `payment_mode=postpay`. A new database defaults to `off`,
where every booking confirms on creation without a card. With `postpay` and
Stripe configured:

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
  delayed webhook leaves the page asking the student to check their lessons;
- a student's next `POST /bookings` replaces their own unfinished card setup,
  so backing out of the form, reloading or closing the tab never leaves them
  refused by their own hold or treated as having had a trial. The replaced
  hold is deleted only once Stripe's expire call (or a read after it) reports
  the Checkout Session `expired`, which Stripe does only to a session that can
  no longer complete; a lapsed hold goes regardless. A completed setup, or one
  Stripe cannot answer for, keeps its hold for the webhook. Should a released
  session's completion still arrive, it finds no booking and confirms nothing;
- the webhook signature is verified before the payload is trusted for anything,
  and events are recorded so each is handled exactly once;
- Checkout creation, saved-card charges and refunds use a stable booking-based
  Stripe idempotency key, so an infrastructure retry cannot duplicate money;
- every student must explicitly accept the lesson-end and €5 charge terms, and
  each booking and series records when and under which wording consent was given;
- an abandoned checkout releases its slot when the hold expires, and a series
  whose checkout was abandoned loses its orphaned `booking_series` row in the
  same sweep.

**The after-lesson policy** (`policy.mjs` is the single home): booking saves a
card but takes no money. A scheduled row charges its booked amount when the
lesson ends, at `ends_at`. Moving or cancelling at least 14 hours before the
lesson is free; doing either later schedules one €5 action fee and prevents the
full price from charging if the lesson was cancelled. A no-show recorded
between the lesson's start and its end changes the end charge from the booked
price to €5. Inês is never charged a fee for a move or cancellation she makes.
Older `paid` rows keep their lock/refund promise inside the window;
`not_required` rows keep their original pay-in-person terms. The card itself
never touches the database — Stripe keeps it; `students` holds only opaque
customer and payment-method ids.

Changing an ordinary lesson from 60 to 90 minutes (or back) uses the same
reschedule endpoint as a move. Legacy `not_required` bookings can change length directly;
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
holds in every payment mode.

Stripe is used because Square does not serve Portugal and Stripe supports
reusable cards with explicit off-session setup. A least-privilege `rk_test_`
key is used for the test journey; the account's general secret key never
belongs in the Worker.

**The account structure**: **Inês's own Stripe account, with Dan as
Administrator** — cheapest fees (no Connect platform surcharges), EUR
settlement on a Portuguese account, her name on statements natively, and Dan
runs everything day-to-day through the Administrator role and a restricted API
key. Payments are created directly in her account; there is no platform,
connected account, destination charge, or second settlement hop. Its
representative is Inês Dias Baía and its business is Português com a Inês.
Fiscal treatment remains the owner's responsibility; do not infer tax
registration from payments activation.

**Payment methods**: enable **cards only** for card setup and automatic
off-session charges. Leave MB WAY and Multibanco off for this flow: neither is
a substitute for the reusable card the later lesson and €5 policy charges use.

**Test proving ground**: `wrangler --env staging` deploys the separate
`ines-booking-staging` Worker and D1 database. It has `payment_mode=postpay`,
uses the main Stripe account's built-in **Test mode**, and has
`EMAIL_DRY_RUN=1`, so no message is actually delivered. The public site never
points to it; local QA opts in with
`NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking-staging.dakibwa.workers.dev`.
Its frontend also needs that account's test publishable key and
`NEXT_PUBLIC_STRIPE_EXPECTED_MODE=test`. Keep one live account and its built-in
test mode for this business; do not create an additional Stripe sandbox for
ordinary staging checks.
Deploy it with:

```bash
npx wrangler deploy --config workers/booking/wrangler.jsonc --env staging
```

Staging's restricted key grants Checkout Sessions, Payment Intents, and Charges
and Refunds write access, plus Setup Intents read access. Its test-mode
`checkout.session.completed` webhook targets the staging Worker on API version
`2026-08-26.dahlia`. Stripe objects do not cross environments: a student's
saved-card references from another Stripe environment must be cleared. The
staging database, dry-run emails and paused teacher notifications are separate
from production.

The source-level `STRIPE_UI_MODE=embedded` setting maps to Stripe API
2026-08-26.dahlia's `ui_mode=embedded_page`. Stripe.js mounts the returned
client secret with `initEmbeddedCheckout`.

Off-session PaymentIntents must explicitly select `card` when using
`error_on_requires_action`. Checkout disables Adaptive Pricing per session,
keeping the agreed EUR amount instead of inheriting an optional Dashboard
currency conversion with an additional FX fee.

**Go-live checklist**:

1. Checkout explicitly allows cards only for setup and payment recovery. In live
   mode, leave other payment methods off. Confirm the business name, support
   contact, statement descriptor and payout schedule.
2. Create a least-privilege live restricted key and install it with the live
   webhook signing secret in the production Worker's encrypted secret store.
   The production key, `ines-booking-production`, grants write access only to
   Charges and Refunds, Customers, Payment Intents, Payment Methods, Products,
   Setup Intents, Prices and Checkout Sessions. Production's
   `STRIPE_EXPECTED_MODE=live` rejects a sandbox key even if one is present.
3. Set the repository variable `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the same
   live merchant's publishable key. The Pages build's
   `NEXT_PUBLIC_STRIPE_EXPECTED_MODE=live` refuses to mount Stripe.js with a
   test key.
4. The live `/stripe/webhook` destination is for `checkout.session.completed`
   only.
5. Run the full test-mode journey: setup mode takes no money;
   signed webhook confirmation; full lesson-end charge; no-show €5 replacement;
   same-day move/cancel €5; decline to `payment_due`; and dry-run notices.
6. After the test-mode journey passes and the authorised live credentials are
   installed, verify the key mode and permissions, live webhook destination,
   public publishable key and production health. Then activate
   `payment_mode=postpay` and re-run the production health/release gate.
   [Stripe's testing guidance](https://docs.stripe.com/testing) prohibits
   testing in live mode with real payment details: do not create an artificial
   €25 lesson or €5 fee just to prove the rails. Verify the first genuine
   authorised customer booking (its card setup, signed live webhook delivery in
   Stripe's event log and any resulting charge) against Stripe, the Worker,
   email and the public return journey. That is still to be observed, so
   describe production payment observation as outstanding until it happens.

### Late changes

One 14-hour rule covers booking, moving and cancelling. The window is
`settings.minimum_notice_hours` elapsed hours before the lesson being moved or
cancelled; exactly 14 hours is still free. Elapsed hours need no time zone, so
the rule reads the same for every student. The columns, API fields and Stripe
purpose keys keep their original `same_day_*` names; they mean "inside the
window".

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
  to the saved card. A move keeps the later full lesson charge, due at the
  new end; a cancellation removes the full lesson charge. Once the fee is paid,
  the student and Inês are each emailed once; hers is the fiscal reminder.
- **Stripe**: the off-session PaymentIntent is described as `Late lesson change
  fee · <reference>` and a recovery Checkout names the product `Late lesson
  change fee`. Metadata keeps `charge_reason = same_day_change` and the
  idempotency key keeps its `same-day-fee` purpose, so a retry across the
  change cannot create a second charge.
- **Inês's fiscal reminder** says "same-day fee" in its subject, heading
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

### Booking a cancelled lesson again

A student who cancelled a lesson can take the time back from the same link.
`POST /bookings/:token/rebook` with `{ expectedPriceCents }` needs no session:
the link is the authority, as for cancelling.

- **Only their own free cancellation.** The lesson must be cancelled by the
  student, not late (`same_day_change = 0`, no late fee on it), and with
  nothing taken, owed, refunded or paid by hand on it. One Inês cancelled, a
  late cancellation, or a lesson with money to sort out is refused with a
  sentence saying to message her.
- **The same notice as any booking.** It must start at least
  `minimum_notice_hours` from now; inside that only Inês can add it back.
- **A new lesson, never the old row revived.** New id, reference, manage link
  and calendar UID at SEQUENCE 0, so the invitation and the Google event are
  clean; the cancelled row is not changed. It keeps the same time, place,
  notes and student, and stays in its weekly run while that run is still
  going (a stopped run's lesson stands on its own). Its name, email, phone and
  clock are the account's as they are now, not the cancelled row's, which
  keeps the address it was taken under: the new lesson's emails and manage
  link go where the student now reads them. A cancelled trial is offered only
  while it would still be their first lesson, as booking one is.
- **Claimed like any booking.** The atomic slot claim decides: nothing
  overlapping, with no gap for a lesson Inês added and the usual gap for one
  the student booked, the availability revision, the notice window and the
  price snapshot. It is refused inside time off she has taken since (a whole
  day, or blocked hours) and, in person, inside online-only hours. Her
  published hours are not required, so a lesson she placed outside them can
  be booked again.
- **Priced and paid as a new lesson of its kind would be today.** The
  student's current price, which must match what the page showed. A lesson
  Inês added follows her rule for adding one (`teacherLessonPayment`, shared
  with `POST /admin/bookings`): on their standing card if they have one,
  otherwise paid to her directly. A lesson the student booked on their card
  goes on their saved card, agreed afresh at `PAYMENT_CONSENT_VERSION`, and
  is refused without one. At €0 it is free. Nothing is charged, refunded or
  linked by it, and no fee can come of it.
- **What the page is told.** `GET /bookings/:token` and `GET /me` say
  `canRebook`, and with it `rebookPriceCents` and `rebookPayment` (`card`,
  `free` or `direct`), so the page states the terms before the press; the
  write decides for real. `/me` asks only of the three soonest cancelled
  lessons to come, with the student it already holds and one price look-up
  per lesson type, so it stays cheap. The lesson's own reply also says
  whether Inês added it and whether it is paid by hand.
- **Emails.** The student gets the ordinary confirmation and invitation.
  Inês's copy is headed `Booked again` (`Booked again after cancelling — …`),
  and the cancellation leaves her Needs you once the student has a confirmed
  lesson at that start.

The rate limit is 8 a quarter-hour per student. From an email link, a student
who is not signed in and whose lesson Inês added and is paid to her directly
is offered `Email me a sign-in link` (the existing `/auth/email-link`, to the
booking's own address): the way into the account, where the card step puts
every lesson she booked on their card. Nothing signs anyone in from a manage
link.

### Paying by card from a lesson's link

A student Inês set up by hand can start paying by card from a lesson's own
page, with no sign-in, and is charged at the end of the lesson as for every
card lesson.

- **Who is offered it.** `GET /bookings/:token` adds `cardOffer { priceCents,
  everyWeek, replacesCard }` only for a lesson Inês added that is confirmed,
  still to come, `not_required` without the paid-by-hand mark, priced above
  €0, with no charge started or payment on it and attendance as expected,
  whose student account exists and has no standing agreement, while cards are
  taken (`postpay` and Stripe ready). `everyWeek` says its weekly run is
  hers, active and not yet `automatic_payment`. `replacesCard` says the
  student already has a card saved.
- **Never beside a standing agreement.** A card saved from the account was
  saved signed in and pays for every lesson Inês adds. A link proves less, so
  it is neither offered to such a student nor allowed to replace that card if
  one is saved while Stripe's page is open. Any other saved card (from a
  booking's own checkout, or an earlier link) is replaced by the new one, as
  a booking's checkout replaces it. A student has one card, so lessons
  already on a card are then charged to the new one, which is why the page
  says `This card replaces the one saved before` before the press.
- **Starting.** `POST /bookings/:token/card` with `{ scope: "lesson" | "run",
  expectedPriceCents }`. The link is the authority, as for cancelling and
  booking again; 8 presses a quarter-hour per student. It checks the offer
  again (and `everyWeek` for `run`) and the price, then opens Stripe's hosted
  page in setup mode: `metadata.purpose = lesson_card`,
  `client_reference_id = lesson-card:<booking id>` (never a bare booking id
  or `student:`), the student's existing Stripe customer or a new one with
  their real address, and metadata naming the lesson, scope, run, student,
  start, end, amount and `card_setup_version`. Nothing is written and nothing
  is charged. Stripe returns the browser to the lesson's page with
  `card=lesson` or `card=weekly`, which only tells the page what to say.
- **Confirming.** The signed webhook verifies the session (setup mode,
  complete, its reference matching its metadata, a succeeded SetupIntent with
  a payment method for the same customer, the booking still that student's)
  and then writes one all-or-nothing batch. The card is kept on the student.
  The lesson, or for `run` every week of the run still to come at the agreed
  amount, becomes `scheduled` with `payment_consent_at` set to when the
  session was created (the press) and `PAYMENT_CONSENT_VERSION`. For `run`
  the series turns `automatic_payment` on with the same consent, so weeks the
  nightly top-up adds are on the card. It writes only while the opened lesson
  is still exactly what was agreed (same start, end and amount, still to
  come, untouched by any payment), the run still qualifies, the student has
  no standing agreement, cards are still taken and no `Remove card` has
  retired the setup (`card_setup_version`). Otherwise nothing goes on a card
  and the card is not kept. A week at another amount, or one already paid by
  hand, stays paid to her directly. `card_consent_at`, `card_setup_version`
  and `email_verified_at` are never written. A replayed or repeated event
  changes nothing.
- **Charged like any card lesson.** Nothing new charges. The existing sweep
  takes each lesson's `amount_cents` when it ends, or the no-show fee
  instead, and a late move or cancellation takes the late fee, exactly as for
  a lesson the student booked. A price Inês raises later never raises a
  lesson already agreed (`repriceLessons` follows only a lower price under
  this agreement); a week added to an automatic run later takes the student's
  price on that day, as every automatic run does.
- **Stopping.** `Remove card` (signed in) returns these lessons, while not
  yet charging, to being paid to her directly and stops the run charging,
  with her standing-card lessons. Inês ticking `Already paid` takes one
  lesson off the card; unticked, it is paid to her directly again. Cancelled
  with notice and booked again, the new lesson is paid to her directly until
  it is put on a card again.
- **Who is told.** Inês sees `Card saved` on the student's row; it is not a
  Needs you notice, since it asks nothing of her (12 November 2026, Dan). One
  already paid by hand is ticked `Already paid`. The student gets no separate
  email (there is none for a saved card); the page says the card is saved, and
  each charge is emailed as usual.

### A student's own price, private codes and security

**One price per student per length.** A student's own
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

**Free lessons: a price of €0**, so that the student never needs to add a
card. Stripe refuses a €0 charge, so none is ever attempted:

- Inês may type `0` for either length, here or when she adds a student.
  Migration 0031 rebuilds `student_recurring_rates` with `CHECK (amount_cents
  >= 0)`; until it is applied, saving €0 answers 503 (`Free lessons need a
  database update first`) and changes nothing. A free 60 makes the 90 free
  too, as 1.5 × 0, unless she gives the 90 a price of its own. Codes are never
  free (`findRecurringCode` requires €1 or more). The trial is never
  per-student, so it keeps its standard price and its card step; it is only
  for someone with no lesson yet, so a student she has added a lesson for
  cannot book it.
- A lesson born at €0 is stored as **`payment_status = 'free'`,
  `amount_cents = 0`**, with no consent: a student's own booking (one lesson,
  several dates or a weekly run), a lesson or weekly run Inês adds (card on
  file or not), and every week a run adds while the price is €0. No other
  status is neutral: `not_required` is Receipts' `Paid by hand` and a card
  saved later charges it; `recorded` is a past lesson nobody was told of,
  open until paid.
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
  false`, one step), lists `60 minutes: Free` under `Your price`, and her setup
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
typed again. **Sign-up deliberately has no code field**: only some students
have a code, and a field there would suggest most new students should have one.

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
Stripe's plain refusal of a new refund (400, 402 or 404) is its last word, so
the claim is not left waiting on it: a payment already refunded in full
(`charge_already_refunded`, as after a refund made in Stripe's dashboard)
cancels the lesson as refunded, and any other refusal gives the lesson back
booked and paid and tells whoever asked. A key Stripe rejects (401, 403) is
still retried. Her cancellation of a paid lesson also waives a late change fee
still owed on it, once its payment page can take nothing, as her cancellation
of an unpaid one does.
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

Apply a new migration by hand, to staging and then production, before the
Worker that reads it deploys (so before merging): execute its file directly, as
`schema.sql` is below. The `d1_migrations` ledger is empty, so
`wrangler d1 migrations apply` would re-run every migration. Do not replay the
full schema or older migrations against an existing database.

```bash
npx wrangler d1 create ines-booking          # put the id in wrangler.jsonc
npx wrangler d1 execute ines-booking --remote --config workers/booking/wrangler.jsonc --file workers/booking/schema.sql
# New database only: seed.sql replaces her weekly hours, prices and settings.
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
change and cancellation copies, and her "Homework to review" notices. Setting
it to `0` pauses these copies; student mail and successful-payment fiscal
reminders remain enabled, and `TEACHER_EMAIL` remains the student messages'
reply-to. Staging keeps teacher booking copies paused and all email in dry-run
mode.

Production has `EMAIL_DRY_RUN=0`. With `1` the Worker records every message in
`email_log` and sends nothing — and `npm run check:booking` refuses to pass,
because a site that confirms bookings while silently sending no confirmations
is worse than one that is visibly down.

`.dev.vars` overrides **secrets only**, not `vars`. For local development against
a different origin, pass `--var ALLOWED_ORIGIN:… --var SITE_URL:…` to
`wrangler dev`.

## Site configuration

```bash
NEXT_PUBLIC_BOOKING_API_BASE_URL=https://ines-booking.<subdomain>.workers.dev
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_EXPECTED_MODE=live
NEXT_PUBLIC_SAME_DAY_RESCHEDULE_FEE_CENTS=500
```

With no API URL the booking page degrades to its setup placeholder and points
students at WhatsApp, rather than rendering a calendar that cannot work.

The tutor's identity is not configuration here: name, brand, language, city,
time zone, currency, domain, sender, booking reference prefix and calendar UID
domain come from [tutors/ines/tutor.json](./tutors/ines/tutor.json), read by
`workers/booking/tutor.mjs` (`tutorOf(env)`) and `src/lib/tutor.ts`. The
Worker's `SITE_URL`, `MAIL_FROM` and `MAIL_SENDER_ADDRESS` override the
record's site URL and sender, which is how staging and local runs point
elsewhere. Never change `bookings.referencePrefix` or
`bookings.calendarUidDomain` for a tutor who has lessons: calendars match
updates by the UID, and students and receipts quote the reference.

### More than one tutor

One Worker can serve several tutors. `workers/booking/directory.mjs` lists them
(`TUTORS`), and each has their own D1 database, bound under the name in their
record's `database`. Inês's is `DB`.

- **Whose request.** A request is a tutor's when its `Origin` is one of their
  `site.origins`, or when it arrives on one of their `api.hosts`. Everything
  else, including the Stripe webhook, the Google Calendar callback and the
  release probe, is Inês's.
- **Inês's env is the deploy's own object, untouched.** Another tutor's env is
  built from nothing: their database, the shared mail, marking and Google
  sign-in keys, signing secrets (`BOOKING_TOKEN_SECRET`, `ADMIN_TOKEN`) derived
  for that tutor alone so a manage link or session from one never opens
  another, and safe switches: email held as a dry run, Google Calendar and
  homework marking off, until their record's `switches` turn them on. None of
  Inês's Stripe keys, calendar key, teacher email or private rate codes reach
  them.
- **Fail closed.** A tutor whose database binding is missing gets a 500 on every
  call, never someone else's data; the scheduled sweeps skip and log them
  (`tutor-database-missing`) and run once for every other tutor.
- **Expressions is Inês's add-on**, not part of the platform. Only a record
  with `features.expressions` serves its routes; for any
  other tutor they answer 404, and the directory refuses a second tutor who
  claims it.

Adding a tutor: a folder under `tutors/` with their `tutor.json`, one line in
`TUTORS`, a D1 database made from `schema.sql` and then the output of `node
workers/booking/tutor-seed.mjs <id>`, and its binding in `wrangler.jsonc` under
the record's `database`. Never `seed.sql`: it is Inês's prices, hours and name.
A new tutor starts with their record's rules, their name, and the three lesson
types switched off and unpriced, with no teaching hours, so nothing can be
booked until they set their prices and hours. `node
workers/booking/tenancy-test.mjs` (part of `npm run test:booking`) proves two
tutors never see each other's students, lessons, secrets or name.

- **Their own clock and currency.** Each request, and each tutor's share of the
  scheduled sweeps, runs inside `asTutor` (`tutor.mjs`), so `homeZone()` in
  `time.mjs`, prices in `money.mjs` and `stripe.mjs`, the calendar file's PRODID
  and UID domain, the email images, and every helper whose `tutor` defaults to
  `currentTutor()` are that tutor's. Outside a request, as in the unit tests,
  they are Inês's. A tutor in New York charging dollars gets slots, emails and
  fees on New York time and in US$, while Inês's request at the same moment
  stays on Porto time in euros (`tenancy-test.mjs`).

Still Inês's alone until later steps: Stripe payments (each tutor's own
connected account), Google Calendar (its callback has to carry the tutor), the
site itself (built for her), the Portuguese tax number and Portal das Finanças
reminders, and `'porto'` as the stored key for an in-person lesson.

## Not yet built

- **Fiscal documents.** She must issue a fatura-recibo per lesson, and CIVA art.
  36.º gives 5 working days from the lesson. See
  `Documents/Work/Português com a Inês/Billing and Booking - Operating Context
  and Options.md` for the full position, including the unresolved IVA exemption
  code.
- **Two-way Google Calendar sync**, once OAuth verification is worth doing.

## Google Calendar and Meet setup

The Google app is configured in the dedicated `portugues-com-a-ines` project
and published to Production. Calendar API, migration 0016, Worker secrets and
the feature flag are configured in production and staging. Sync starts only
after Inês connects her account; Google sign-in alone does not grant calendar
permission. The Google sign-in client is separate.

### Behaviour

- All confirmed future lessons sync to the visible **Português com a Inês —
  lessons** Google calendar owned by the connected teacher. Each online lesson
  gets its own Meet link; Porto lessons have a Porto location and no Meet link.
  Bookings awaiting payment confirmation do not create calendar events.
- The student’s booking/manage views and Inês’s lesson details show **Join Google
  Meet** for online lessons. Confirmation and change emails include the link when
  ready; delayed links get a short follow-up email, and the day-before reminder
  carries the link again when it is ready. A week the nightly top-up adds is
  told to nobody, so its link has no follow-up email either: the reminder and
  the student's page carry it. The same goes for a lesson its student was
  never emailed about, added while they awaited their welcome or had no
  address: once they can be emailed, its link waits for its day-before
  reminder (no `student_booked`, `student_rescheduled` or run email is on
  record for it, it starts more than the reminder's 24 hours away, and it was
  made at least 36 hours before it starts). One too near for a reminder gets
  its link by itself. A student just welcomed to a weekly slot is therefore
  not sent a link email for every week at once. The minute sweep also fills
  existing future lessons after connection.
- Moving a lesson updates the same event. Changing to Porto removes the event’s
  conference; changing to online requests one. Cancelling cancels that event.
  Cancellation does not promise to revoke a Meet URL previously delivered.
- The calendar is private by default, but events inherit calendar visibility so
  explicitly shared read-only viewers can see lesson names, times, location and
  Meet links. No student email, phone, notes or payment details are copied into
  these Google events. No attendees or extra Google invitations are created.
- Students keep their emailed calendar invitations with the usual UID/sequence
  handling; her copies stop carrying them (see *How her calendar stays
  current*). Old invitations previously imported into her primary calendar may
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

Each conference request carries its own `requestId` and the time it was made,
because Google treats a repeated `requestId` as the request it already has.
One still pending after ten minutes (`STALE_CONFERENCE_MS`), or made before
requests were dated, is replaced with a fresh request on the same event. A
link still pending logs `meeting_pending` with what Google reports (`none`,
`no-request`, `pending`), visible with `npx wrangler tail`; if links do not
arrive, that log line names the cause. Google itself emails no one: events
carry no attendees and are written with `sendUpdates=none`.

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

### Approval for unpaid lessons and future lessons

From an unpaid lesson's details, Inês can create a payment approval link
(**Create payment link**). `GET /admin/bookings/:id/card-link` lists what she
can tick into it: the lesson she opened and that student's other unpaid
lessons she added that have already started, records included, newest first,
at most 20. The lesson she opened starts ticked; every other one only when she
ticks it,
because many past lessons were paid to her by hand without being marked
**Already paid**. When nothing else is unpaid there is no list and the link
is made at once. `POST /admin/bookings/:id/card-link` with `{ bookingIds }`
(1 to 20 of that student's eligible lessons; without it, the lesson opened)
issues the existing 14-day, one-use sign-in link. It sends no email, opens no
Stripe session, and changes no booking or payment consent. It does not mark a
first welcome as sent. The link names the ticked bookings, in time order,
with `cardBooking=<id>,<id>…`. The same two routes by student
(`/admin/students/:id/card-link`, where `bookingIds` is required) serve the
invite on a student's card in Students (`Invite`, `Ask to pay`), which clears
what a student owes in one link; there the list is only their unpaid lessons
already had, and nothing starts ticked. With nothing ticked, or nothing open,
the invite is a plain sign-in link (`POST /admin/students/:id/invite-link`). A student without an email can have one too:
she sends it on WhatsApp, and confirming its sign-in is what verifies the
account before a card is saved.

While she ticks, the invite panel on Students says what is owed now apart from
what agreeing would also do, so she does not send a link whose reach she cannot
see: `Owed now` is the ticked total, charged once they
agree; `Future lessons` are not owed yet, and are the lessons she added, still
to come, with nothing settled on them (confirmed, `not_required`, not paid by
hand, not already charging), which agreeing puts on their card, charged at the
end of each lesson (each weekly run once, as its usual day and time, its price
per lesson, or the range where its weeks differ, how many lessons run to when
and how many weeks were moved; never a row a week). They are read
from the existing `GET /admin/bookings?from=<now>`, matched to the student by
`student_id` and, only for an older lesson with no account, by exact email;
never by name. If that read fails the panel says so, offers a read-only `Check
again`, and still makes the link.
Nothing ticked says the link only signs them in, with nothing to agree to,
because that path is `invite-link`, not an approval. Making or sending the
link charges and agrees to nothing, and the ticked ids it names are unchanged.

After signing in, the student reviews each lesson's date, time and price and
their total, and sees the lessons still to come that Inês added (each weekly
run once) that the same agreement then pays for, then actively agrees to those lessons and standing automatic
payment for future lessons. Previewing is read-only (`POST /me/card/preview`
with `bookingIds`); a lesson Inês has since marked paid, cancelled or taken
off is left out, so the student agrees only to what is shown. `POST /me/card`
checks every reviewed snapshot (`bookings`, or `booking` for one) and explicit
lesson consent; one changed lesson refuses the whole approval. A previously
saved card is authorised in place: the student does not add it again or
visit Stripe. Its opaque review key binds the approval to that saved card;
the transaction rechecks the card, session, revocation and every lesson
snapshot before recording consent. A card removed or replaced, a revoked
session, or a paid/edited lesson refuses the approval.

Without a saved card, Stripe setup collects one and only its verified
completion schedules the selected lessons, including ones that have started
or ended. Each is pinned in the session's metadata as `approved_booking_<n>`
(`id start end amount`); the older single-lesson keys
`approved_booking_id/amount/start/end` are honoured too. The
webhook checks ownership, confirmed/unpaid status, attendance, card
generations and each snapshot at the write. A changed, cancelled or
already-paid lesson is skipped; no other past lesson is included. Future
teacher-added lessons and active repeats use the existing standing consent.
The charge sweep collects each lesson on its own, with its own receipt email,
once due, or on its next tick after later card confirmation. Creating or
viewing the link cannot take payment. The lessons and card consent stay
unchanged until the student completes their own approval (and Stripe setup if
a card is needed).

**Asked at every sign-in.** The same step opens by itself, with no link from
Inês: `GET /me` returns `outstandingLessons`, the ids of the student's lessons
she added that have started (`starts_at <= now`) and that a card can still
pay for (`CARD_LESSON_SQL`: confirmed, `not_required` or one she added after
it happened, no charge started, attendance as expected, not ticked **Already
paid**, priced above €0), oldest first, at most `MAX_CARD_LESSONS` (20). It is `[]` while cards are not taken
or for an account with no student side, and is read under the same
`session_version` guard as the bookings. `Your lessons` (and the booking page,
which holds the same account card) shows the step for any student account
with such a lesson, whatever card they have: no card, a saved card, or a
standing agreement. The ids go to the existing `POST /me/card/preview` and
`POST /me/card`, which check each lesson's time and amount again when they
write, so the list itself grants nothing and changes nothing in the Worker's
approval, webhook or charging. A link from Inês wins and shows exactly the
lessons she ticked.

Because nobody ticked these (many past lessons were paid to her by hand and
never marked), the student can leave any of them out by pressing it, and only
the lessons still in are sent for approval; never charge twice. Leaving one
out changes nothing on the Worker: the lesson stays open
on Inês's page until it is paid or she ticks it. What was left out is kept
only in that browser tab's `sessionStorage` (`ines-card-left-out:<studentId>`),
so the same visit does not ask again and a new visit does. With every lesson
left out, the step is the plain card ask if lessons to come still need a card
(the card comes first, with no `Not now`), and otherwise closes for the visit.

Reuse this workflow whenever a student needs to authorise teacher-added
lessons that have already happened, including a student who already saved a
card. Inês opens an unpaid lesson in her timetable, chooses **Create payment
link**, ticks the lessons they owe, then **Create link**, and sends it with
**Send on WhatsApp** (a `wa.me` link to their phone when it is written in
international form or as a Portuguese mobile, otherwise WhatsApp's own chat
picker) or **Copy link**. The WhatsApp message is one short line in her voice
with the lesson count and total, then the link; she can edit it before
sending. From the invite on Students it adds `If you agree, your future
lessons are then charged to your card at the end of each lesson.` Confirm any direct payment with Inês first and record it as
**Already paid** instead of requesting another payment.

The student signs in (`Sign in to pay for your lessons. No password
needed.`), reviews the lessons (one time tile each, then their total) and
three short lines (when they are charged, future payments, and fees), ticks
**I authorise card payments for these and future lessons**, then presses
**Authorise payments**. **Terms & privacy** sits inside that agreement area
and opens without ticking it. A saved card needs permission only; a missing
card opens Stripe setup. Approval includes only the lessons named, never an
unseen backlog; future teacher-added lessons and recurring lessons then use
the standing consent.

For an assistant preparing this on Dan's behalf, create the link and a
preview first, then ask Inês to approve the proposed student message. Keep
the private sign-in link out of screenshots and review drafts. Hold the
student message until Inês approves, and never authorise payment on the
student's behalf.
