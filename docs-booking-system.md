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
  → POST /auth/register | /auth/login | /auth/google → session token
  → POST /bookings                    (Bearer)       → D1 row, emails, ICS invite
  → GET  /me                          (Bearer)       → their calendar and series
  → GET  /bookings/:token                            one lesson; HMAC-signed token
  → POST /bookings/:token/reschedule | /cancel       → optional lessonType, sequence++, updated ICS
  → POST /series/:id/reschedule | /stop (Bearer)     → move or end an owned weekly sequence
Legacy /my-lessons and /booking links resolve into /book without losing state
Inês on /schedule                     (her own account, role=teacher)
  → GET/POST /admin/availability, /admin/exceptions
  → POST /admin/exceptions/day                       one date's day off and blocked hours
  → GET  /admin/bookings, /admin/students
  → POST /admin/bookings                             add a lesson for someone
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

Her own bookings are checked for clashes only, not against her published hours
or the notice window. Those exist to shape what students may choose; she is the
one deciding, and fitting a lesson in outside them is a normal thing for her to
do. A double booking is never intended, so that is still refused.

Adding a lesson for someone who booked another way creates their account if it
does not exist, with no password — they set one through "forgot password" when
they first want to manage the lesson themselves. They receive the same
confirmation, calendar invitation and manage link as if they had booked it.

## Teacher calendar

`/schedule` opens on the current Monday-to-Sunday week in Porto time. Booked
lessons sit at their actual times and open a details dialog for moving,
cancelling or recording attendance. Week navigation requests the corresponding
booking range, including lessons that cross midnight. A failed range load is
shown as an error, never as an empty calendar. Mobile shows one selected day
under the same seven-day header.

The week itself is where Inês takes time off. Clicking, tapping or dragging
across times on a date blocks them for that date only, and doing so again
reopens them; the `Day off` switch above each date blocks the whole day. Each
change saves as she makes it, one request at a time, so quick clicks coalesce
into the date's latest choice; a failed save puts that date back as saved and
says so. Past dates and weekly blocks such as lunch are shown but not toggled.
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

`Weekly hours`, top right, edits the usual weekly pattern with click/drag,
touch or keyboard input. `Save teaching hours` writes the existing first-start and
last-start rule format; it does not reinterpret the last start as a finishing
time. Precise existing windows remain available through `Set exact hours` and
are not rounded by the grid. Drafts survive week/view changes and booking
actions, and validation prevents the API from silently dropping invalid rows.

Manual lesson entry is a collapsed backup at the bottom, with online/in-Porto
location. All teacher actions still use the authenticated admin endpoints and
their existing booking, payment and email safeguards.

## Accounts

Booking requires an account, so a student's lessons persist together rather than
depending on them having kept the right confirmation email.

- **Email and password.** Hashed with PBKDF2-HMAC-SHA256 at the OWASP iteration
  count — bcrypt and argon2 do not exist in the Workers runtime. The stored
  record carries its own algorithm, cost and salt, so the cost can be raised
  later without invalidating anyone.
- **Google Sign-In**, optional. Only non-sensitive scopes (name, email), so no
  additional Calendar permission. Absent a client id the
  button simply does not render. Matching is by *verified* email, so someone who
  registered with a password and later uses Google lands on the same account.
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
- Reset links are single-use and last an hour. A Google-only account has no
  password; using "forgot password" is how such a student sets one.
- Sessions are signed bearer tokens in `localStorage`, not cookies: the site
  and the API are different origins, so a cookie would need `SameSite=None` and
  would be dropped by any browser blocking third-party cookies. Signing out
  revokes the presented token server-side when connected. Password reset and
  verified email changes increment the account session version, invalidating
  older sessions. Email changes also unlink the old Google identity. Legacy
  sessions remain version zero until revoked; emailed manage links keep their
  existing scheme. Offline sign-out clears this device but cannot reach the
  revocation endpoint.
- The emailed manage link still works on its own, so a forgotten password never
  blocks someone from changing a lesson.
- **Booking, the learner's calendar, and lesson changes share one workspace.**
  Anyone signed out lands on the booking calendar at `/book`, ready to book,
  beneath one pre-filled choices bar: `Trial` (for an eligible first lesson, and
  then the default), `Single` or `Weekly`; Online or In Porto; the 60/90-minute
  length with its price (the trial's fixed length instead); and for weekly
  lessons 4, 6, 8 weeks or `Ongoing`. Each choice changes in place and the free
  days follow it, so duration is always settled before times are offered.
  A returning signed-in student opens directly on their lessons calendar, whose
  top-right `Book a lesson` opens the same bar and calendar. After the starting
  time is chosen, the journey goes straight to confirmation while later weeks
  are checked. A fully available repeat stays quiet; only clashing weeks or a
  failed availability check take space before booking.
  Viewing lessons is one calendar card beneath the account bar: `Upcoming
  lessons` with a `?` tooltip and `Book a lesson`, the next lesson with its
  Meet link, then the calendar four weeks at a time, without free-time
  choices. There is no separate list to keep in step with it.
  Signed-out visitors can browse lesson types, dates, and times before they are
  asked to sign in; `Already booked? Sign in` asks immediately because the
  data is private, while booking asks only at confirmation.
  Every booked lesson is marked there, weekly lessons in lilac and one-off
  lessons in coral. Choosing a date with one lesson opens that lesson; a date
  with several lists them in `Your lessons`; a free future date opens booking
  on that day with its times. It never creates a second selected-day panel.
  While booking, a chosen free day's times sit beside the calendar on wide
  screens and take its place on a phone, headed by the date and a `Change`
  back to it. Before a day is chosen, wide screens offer the soonest free time
  on each of the next three free days.
  Available times use one compact grid, without part-of-day headings, and fit
  three accessible time buttons across on a phone. The confirmation keeps the
  choices bar beside the chosen lessons, so kind, place, length and repeat still
  change there; a chosen time is kept when it is still free for the new lesson
  and otherwise the times return with a note. `Add another lesson` or `Add a
  second weekly time` is a dashed card beneath the lessons, and while one is
  added the bar gives way to the lessons chosen so far and `Back`. Both calendars page four weeks at a time; `Later weeks`
  counts the booked lessons beyond the page, and the lessons view pages as far
  as the last booked lesson. Choosing an
  individual booking opens move and cancel in place. The emailed token still
  opens that same interface without requiring sign-in, so a forgotten password
  never blocks a change. The old `/my-lessons` and `/booking` paths remain valid
  for links already in the world, then normalise to `/book`.
- **Signed-in account controls stay in the shared workspace.** They sit above
  the active workflow rather than behind an Account/Close disclosure. The account
  bar names the student once and keeps `View lessons`, past lessons, profile
  editing and sign out directly in the bar on wide desktop and inside one
  compact menu at narrower widths. Booking lives on the calendar, not in the
  bar. The upcoming count may
  sit beside `View lessons`; Past lessons has no badge. Choosing view or past lessons opens a
  complete view and switches away from any active booking or lesson-management
  detail. Clicking the current destination keeps it open. History occupies the
  full workspace without the future calendar. Profile editing also hides the
  calendar; `Done editing` returns to Upcoming lessons.
  `Past lessons` stays in the menu throughout every signed-in
  booking state, including while booking and while a
  recurring occurrence is open; an empty history gets an empty state rather
  than losing the menu item. History returns through `Upcoming lessons`.
  There is only one `Booking`
  destination in the site navigation — no separate `My lessons` tab — because
  booking and managing lessons are the same workspace.
- **Upcoming lessons is the calendar.** It opens first for a signed-in student
  and remains available as `View lessons`.
  After a successful booking, `Back to upcoming lessons` opens this same
  calendar, with the new lesson on its day. The next lesson leads the card. Weekly lessons are
  lilac and one-off lessons coral; a weekly lesson's dialog offers `Manage
  sequence` for the whole run, and `View lessons` counts an active repeat once.
  The `?` tooltip explains that booked lessons open and other days start a
  booking. Once booked, ordinary lessons use the compact duration label (`60
  mins` or `90 mins`) instead of repeating the product name; trial lessons keep
  their name. There is no other context strip or selected-day detail card.
  Opening a lesson leaves the calendar where it is and shows a compact
  `Change` or `Cancel` overlay. `Change` reuses the existing calendar date and
  time picker and, when payment state permits, offers the ordinary `60 mins`
  and `90 mins` lengths plus Online/In Porto in matching sliding controls.
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
  recurring occurrence exposes `Manage sequence`, keeps both outcomes visibly
  distinct, and asks for confirmation before calling the stop endpoint.
- **Moving a recurrence moves every future confirmed occurrence together.**
  The student chooses the new weekly anchor, length, and location through the
  same compact change-booking controls. Every proposed week is checked before
  one guarded database update moves the run and its series recipe; a newly
  claimed slot or concurrent individual change moves none of it. Past lessons
  are left alone, and a lesson inside the 14-hour window stays where it is while
  the rest of the run moves; the new weekly time may not overlap it, and the
  response lists its start under `kept`. Each booking keeps its
  calendar UID, increments its sequence, and the student receives one combined
  updated calendar email. Inês's copy follows the existing development pause.
- **A run saves a card once and charges each lesson after it.** Stripe Checkout
  runs in setup mode, so no money is taken while the run is booked. The whole
  run is held until its webhook proves a reusable card exists, then every
  occurrence becomes `scheduled`. The minute cron charges an occurrence
  only once `ends_at` has passed. Open-ended top-ups inherit the same consent
  and scheduled state. A declined charge marks the row `payment_due`, emails
  the student a hosted pay-now link, and tells Inês.

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
- On a confirmed change, outstanding password resets are deleted — a live reset
  link sitting in the old mailbox would otherwise stay valid for its hour — and
  future lessons are re-addressed. Past and cancelled lessons keep the address
  they were taken under, which is the record of what happened.

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
- **Where it appears.** Inês's fatura-recibo automation reads her booking
  emails and schedule, so every email she gets about a student's lessons
  (bookings, weekly runs, moves, cancellations, declined cards and payments)
  carries a `NIF` row beside the student, with the number or
  `Not given (consumidor final)`, read when the email is sent. Her lesson
  details state it the same way. The student's own payment email shows it,
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
  warning banner or a failed booking.
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

- Customer emails use short introductions and one action button. HTML keeps
  the complete action link in that button; the plain-text alternative includes
  the URL. The price row carries payment timing and the footer keeps the
  applicable cancellation/no-show rules without repeating payment timing.
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

### When email fails

Email is best-effort, but "best effort" used to mean "one attempt, and silence".

- **A failed send is retryable.** The log row was written before the send and left
  behind on failure, so the unique key made every later attempt return "already
  sent" without sending. A message Resend rate-limited was lost for good, and the
  caller was told it succeeded.
- **There is now a sweep.** The scheduled cron re-sends failed rows older than five
  minutes. Only a booking's own confirmation can be rebuilt — the body is not
  stored — so anything else stays in the log for a person to look at.
- **A cancelled run is one email, not one per lesson.** Stopping a twelve-week
  series fired twenty-four requests at the provider in the same instant; behind a
  2/second limit, twenty-two were dropped and never retried.
- **A database error is not a duplicate.** Any write failure used to be reported
  as "already sent"; only a unique-constraint violation means that now.

### The no-show policy

During a confirmed saved-card lesson, the teacher schedule offers `Mark
no-show` from the scheduled start until the scheduled end. The same control can
undo the mark during that window. The endpoint accepts the change only while
`payment_status = 'scheduled'`; the charge sweep first claims the row as
`processing`, then reads attendance, so the teacher decision cannot race the
PaymentIntent.

- **Expected attendance** charges the booked lesson price after `ends_at`.
- **No-show** charges €5 after `ends_at`, instead of the booked lesson price.
- Bookings without explicit automatic-payment consent remain
  `not_required`; the teacher control is not offered for them.
- Moving or cancelling less than 14 hours before the lesson is a separate €5
  action fee, stored independently so a retry or second edit cannot duplicate
  it. Its columns keep their original `same_day_*` names.
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

Instants are stored as ISO-8601 UTC. Weekly teaching hours are stored as
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
*Late changes*), so changing it changes the agreed fee terms as well as the
booking notice.

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

A lesson being changed may reuse the time it already holds. `GET /availability`
takes `manage=<manage token>`, which ignores that one booking once the token
verifies, and `series=<series id>`, which ignores an active weekly sequence only
for a request carrying its owner's session. Anything invalid quietly gets the
public answer, in the same response shape. Without this a student could not
move a lesson half an hour later or change its length at the same start, though
the reschedule endpoints accept both.

Once availability has loaded, the date picker omits complete leading weeks with
no free slots. That means a weekend with nothing left to book opens directly on
the next usable week; closed weeks later in the booking window remain visible.
Selecting a free day while booking keeps the four weeks beside its times on
wide screens; on a phone the times replace the calendar and the date's `Change`
returns to the four weeks that held it. In the lesson view a booked date opens
its lesson, or lists several in `Your lessons` with `Book another lesson`; other
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
outside dismisses the dialog and returns focus to its opener.

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

**The after-lesson policy** (Dan, 1 September 2026, `policy.mjs` is the single
home): booking saves a card but takes no money. A scheduled row charges its
booked amount only after `ends_at`. Moving or cancelling at least 14 hours
before the lesson is free; doing either later schedules one €5 action fee and
prevents the full price from charging if the lesson was cancelled (the 14-hour
rule, Dan, 21 September 2026). A no-show
recorded during the lesson changes the end charge from the booked price to €5.
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
  to the saved card. A move keeps the later full lesson charge at the new end
  time; a cancellation removes the full lesson charge. Once the fee is paid,
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

### Private recurring rates and security

`PRIVATE_RECURRING_CODES` is a private Worker binding containing the exact
approved code, duration and cents triples. The canonical owner list is outside
this public repository. `scripts/private-recurring-catalogue.mjs` reads that
private Markdown list and pipes JSON directly to `wrangler secret put
PRIVATE_RECURRING_CODES`; do not print the catalogue or add it to public Git.
Authenticated `GET/POST /me/recurring-rates` exposes only the current student's
saved prices. Eight redemption attempts per account per 15 minute window are
reserved atomically, including parallel guesses. Case and outer whitespace are
normalised; prefixes/suffixes are never pricing authority.

An account's first grant for each duration wins; codes remain reusable by other
accounts and removing a code does not revoke prior grants. Recurring creation
and top-ups snapshot the saved rate in `bookings.amount_cents`, including when
payment is off. Existing rows keep their price when moved at the same duration;
a new duration uses its own saved rate or public price. Single/trial bookings
and €5 fees never use these rates. No booked row is repriced merely by redeeming.

The charge claim rechecks current status and end time atomically. A successful
cancel or move wins against a previously selected charge, while already
processing payments reject concurrent changes. Student and teacher moves use
conditional conflict/sequence checks. No-op moves do not schedule fees. Payment
and fee retries stop automatically after 23 hours of ambiguity, before Stripe's
minimum idempotency retention can lapse; an owner must reconcile that payment
in Stripe before any further attempt. Such rows are excluded from the 50-item
sweeps so newer payments are not starved; the owner-only bookings response has
`manualPaymentReconciliation`, and Worker warnings signal outstanding counts.
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

On a first Google link to a password-created email, verified Google ownership
retains the same account and lessons but clears the unverified password and
invalidates all earlier sessions and pending account-change/reset requests.
Subsequent logins match the stable Google id without repeating that transition.
The sign-in page explains that an email password reset can restore a password.

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

Writes reject unapproved browser origins and non-JSON content; request bodies
are bounded while streaming. Authentication has an edge-IP rate limit and
account failure limits. Mail an unproven party can trigger is bounded per
recipient: three password resets an hour per account (the reply is unchanged
past the limit), and three email-change requests an hour per account and per
target address. One connection can register five accounts and open eight
unpaid card-setup holds an hour. A signed-in teacher is authorised without ever
touching the admin-token throttle; every other admin request spends the
per-connection budget before the token is compared, so a locked-out connection
is refused even when it finally presents the right token. That budget is 20
admin requests per 15 minutes per connection, which makes the shared token an
emergency route into `/schedule`: a long session on it can reach the cap, while
Inês's own teacher sign-in never does. `/admin/settings` range-checks its numbers — a zero slot
interval would hang `/availability` — and validates its addresses. The live
origin allow-list is the two live domains plus `http://localhost:3000`, which
CI's journey tests serve the built export from. API responses are not cacheable. Password derivation
uses six supported 100,000-iteration rounds for new passwords, retaining older
hash verification. Webhooks check signature, environment, session, customer,
amount and currency; expired card-setup holds cannot reclaim a slot.

## Deploying the Worker

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
change and failed-payment copies. Setting it to `0` pauses these copies;
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
- **Reminders** before a lesson.
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
  ready; delayed links get a short follow-up email. The minute sweep also fills
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
5. Inês signs into `/schedule/`, selects **Configure → Connect Google Meet**,
   chooses her matching Google account and grants permission. The callback
   checks signed identity, teacher role, session version/revocation, expiring
   single-use state and PKCE. The shared admin token cannot start OAuth.
6. Verify Porto and online test lessons both sync, and an online test lesson
   produces a joinable link in booking/email,
   preserves it when moved, hides it when cancelled, and a Porto lesson has
   no Meet link. Verify changing online ↔ Porto preserves the event identity.
   Only then enable production and connect Inês’s production account.

Expired or revoked Google permission shows **Needs reconnecting** beside Google
Meet in her schedule; **Configure → Reconnect Google Meet** restores it.
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
