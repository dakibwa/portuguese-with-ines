# Website bug sweep — 11 November 2026

Dan asked for every bug to be reviewed and fixed. No issue was open, so this
was a sweep of the code as it stood on `main` at `8938f7d`: six independent
reviews (payments, a student's booking, Inês's `/admin/` routes, accounts and
email, the student's pages, her pages), each asked for concrete defects with a
reproduction. Every finding below was reproduced again before it was changed,
against the real Worker on SQLite with Stripe, Resend and Google isolated, or
in a browser against a built export with every API reply isolated. Nothing
touched a live service.

Passing these scenarios does not establish that unexercised conditions are
bug-free.

## Confirmed defects and fixes

### Money

| Defect | Behaviour after the fix |
| --- | --- |
| Unticking `Already paid` on a lesson of hers that had already happened billed it "as it would be booked now": onto the student's standing card at today's price, charged by the next minute's sweep. One click, no confirmation; re-ticking then answered `already paid by card`. | Unticked after it happened, her lesson is open again as it stood: `not_required`, its own price, off the card. A lesson already had goes on a card only when a link names it. |
| A refund Stripe refused outright (a payment already refunded in its dashboard, a disputed charge) was retried 138 times over 23 hours and then left the lesson `confirmed` and `processing` for good, closed to cancel, tick and change. | A payment already refunded in full cancels the lesson as refunded. Any other plain refusal gives the lesson back booked and paid and tells whoever asked. Ambiguous answers are retried as before. |
| Her cancellation of a paid lesson refunded it and left a declined late change fee owed, its payment page still open to the student. | The fee is waived with the refund, once its payment page can take nothing, as cancelling an unpaid lesson already did. |
| A tick and untick moved a student-booked lesson from the lesson-day terms it was booked on to the 14-hour rule, so a cancellation the student had been promised free cost €5. | It comes back on the wording it had: its run's, or the one in force when they agreed. |

### A student's time and Inês's calendar

| Defect | Behaviour after the fix |
| --- | --- |
| Moving a whole weekly run laid its lessons out one after another from the new time. Weeks the student had cancelled were booked again (on their card), the run's last weeks were dropped for the top-up to add back, and a run booked around her day off could not be changed at all. | Each lesson takes the new day and time in its own week, and the top-up's bookmark keeps its week. Cancelled and skipped weeks stay out. |
| Housekeeping on anyone's look at the calendar deleted any weekly recipe with no lessons, including one written a moment earlier whose first lesson was not yet tied to it. That booking failed with a 500, its first lesson booked and on the card, no run and no email. | A recipe is swept only when more than ten minutes old. An abandoned card setup's recipe still goes with its holds. |
| `Book again` copied the cancelled lesson's name, email and phone. After an email change the new lesson's confirmation and manage link went to the address the student had replaced. | The new lesson is the account's as it is now. |
| `Book again` was offered for a cancelled trial that could no longer be booked, and failed with an unrelated reason. | Not offered once they have another lesson; asked anyway, it says why. |

### Emails that were wrong, or never sent

| Defect | Behaviour after the fix |
| --- | --- |
| A late cancellation or move on a saved card never sent its own emails. The €5 was charged and receipted, but the student got no cancellation or new time and no calendar update, and Inês no late-change notice: the fee's charge, started beside the email, made the email's saved snapshot stale before it was claimed. | The snapshot no longer includes where the fee's payment has got to, which no lesson email says. Both emails go, and a failed first send is retried. |
| The second move of a weekly run was emailed to nobody: its email was named for the run and a sequence alone, which repeat once the top-up has added new weeks. | Named for the lesson the move began from as well. |
| Every week, on the morning of that day's lesson, an online weekly student was emailed `Your online lesson link` for the week the top-up had just added, twelve weeks off. | A week the top-up adds has no email of its own, link included. The day-before reminder and their page carry it. |
| A past lesson put on a card after the student gave or changed their email was receipted to the old address, or to nobody for a student who had just given their first one. | A confirmed address goes onto every lesson still open to pay, and replaces the no-email stand-in everywhere. |
| A weekly slot Inês added was told to a student abroad as one time (`Every Tuesday, 13:30`), wrong by an hour for the weeks after Portugal's clocks change. | One time is stated only when it holds on their clock for every week; otherwise each date is listed with its own time. |
| Her change to a run "from a later week on" silenced the day-before reminder for an earlier week it never touched. Her every-week change of length was followed a minute later by a second reminder. | A whole-run email counts only for the weeks from the lesson it began from, and a change of length counts as one. |
| A lesson of hers the student moved was emailed as `Pay on the day, in person`, an online lesson included. | `Pay Inês as usual`, whoever's change the email is about. |
| A first welcome whose send failed and ran out of retries could never be sent again: every later press met the closed attempt. | First welcomes share one send per day, so a later day's press sends. |

### Inês's pages

| Defect | Behaviour after the fix |
| --- | --- |
| Adding, moving or cancelling a lesson for a student with no email address answered `emailed: true` once they had signed in from her WhatsApp link. Her page said `The student has been emailed` and offered a message to add to the email. | The reply and the page say nothing was sent, and why. |
| Saving one of a student's details sent all four as her list last read them, blanking a NIF or phone the student had saved since. | Only what she changed is sent, and only what is sent is written. |
| A page left open kept the weekly hours and time off it read that morning, and its next save put back hours she had since closed on her phone. | Coming back after five minutes reads them again, unless something of hers is unsaved or saving. |
| A weekly run's notice she had dismissed came back when the run's next lesson passed. | The notice is the run's. |
| `See lessons` and `Open` on a notice opened the empty Add a lesson form. | They open the student's profile, where their lessons are. |
| An open student card went on listing a lesson she had just cancelled or moved on the Timetable. | The card reads its lessons again whenever her list is read. |
| Keyboard focus fell to the page after `Not working` removed a block outside her usual hours. | The nearest time still drawn takes it. |
| Translation dates used the device's clock. | Porto's, like every other date of hers. |
| `POST /admin/bookings` and `/reschedule` accepted a `startAt` that was not text; `null` recorded an unpaid lesson in 1970. | 400, as `/change` already answered. |

### A student's pages

| Defect | Behaviour after the fix |
| --- | --- |
| If the lessons on offer could not be read as the page opened, nothing asked again. The page went on with "Pay Inês on the lesson day", and the booking was then refused for want of an agreement it had no way to give. | The alert offers `Try again`, and a priced lesson cannot be confirmed until how it is paid is known. |
| A signed-in student whose first account read failed pressed `Try again`, it succeeded, and the page stayed empty under `Your Lessons`. | It opens on their lessons, as the first read would have. |
| Back from Stripe after `Pay €… securely` restored the lesson's dialog still "Opening secure payment…", with nothing that could be pressed and no way to close it. | The dialog is usable again. |
| A device whose time zone the browser reports as `Etc/Unknown` crashed the whole booking page. | Such a zone reads as Porto's clock. |
| Changing a lesson's place for a student outside Portugal left the wrong day chosen: Tuesday shown with no time, Wednesday 03:00 saved. | The chosen day follows the lesson onto the clock its place is read on. |
| After `Cancel all booked lessons` the open lesson still read `Booked`, with its Join link. | It reads as it now is. |
| Focus fell to the page after closing a lesson that had been through `Change`, and after `Email me a sign-in link`. A refused change's error followed the student onto the Cancel step. | Focus stays with the calendar or the dialog; the error goes with its step. |

## Fixed on a second pass

Dan, of the four findings first left for a decision: "fix all yeah".

| Defect | Behaviour after the fix |
| --- | --- |
| A student's own weekly run that Inês moved outside her published hours, or next to another lesson, stopped being extended: the nightly top-up still planned it by the student's rules, skipped every new week and told nobody. | Her every-week change of day, time or place records the run as one she placed, and the top-up plans it by her rules, as it does a run she added. Its weeks stay the student's own in how they are paid; the student moving the run themselves makes it theirs again. Kept as a list in settings, so there is no migration. |
| Two devices saving weekly hours, or one date's time off or extra hours, could overwrite one another without either saying so. | Each save says what its page last read and is refused once that has changed. A refused hours save says to reload; after a refused date her page reads her days again and shows them as they are. |
| `Not working` typed at minutes off her start grid shifted the extra hours left either side and added a start later than she had offered. | Taking a stretch out of extra hours takes the lesson starts inside it and leaves the others where they were. |
| Straight after a first welcome, a student with a weekly online slot was sent one `Your online lesson link` email for every week. | A lesson its student was never emailed about leaves its link to the day-before reminder. One too near for a reminder still gets its link by itself. |

## Verification

- `npm run check:fast` passes: types, lint (two existing warnings), 110
  booking unit, 152 booking integration, 20 series-extension, 33 Google
  Calendar, 29 meeting-service, 10 tenancy, 5 redirect, 21 teacher-calendar
  and 9 reply-validation checks.
- New or extended Worker checks cover: the untick after a lesson; a refused
  and an already-made refund, with the fee waived; a late cancellation's own
  email; a whole-run move across cancelled weeks, with its bookmark; a second
  move's email; a recipe mid-creation; the rebooked lesson's address; open
  past lessons following a new address; the reminder for an untouched week;
  `emailed` for a student with no address; a partial details save. Each was
  seen to fail with its fix undone. The teacher-calendar unit test covers the
  dismissed run notice. The second pass added: a run she placed growing to its
  horizon and becoming the student's again; a refused hours save and a
  refused date; whole starts taken out of extra hours; and a never-announced
  lesson's link waiting for its reminder.
- The reviewers' own reproductions, re-run against the fixed Worker and, for
  the pages, in Chromium against a build of the fixed site, no longer
  reproduce.
- With `main` as it then stood merged in (three later changes, one to the
  same lesson dialog), every check above passes and so do all fourteen
  customer journeys the release runs, at the widths they are written for.
  Two journeys changed with the fixes: the teacher's expects only the detail
  she changed and reads a date save by what she changed, and the calendar
  recovery journey expects a date save to name the rows her page last read.
  `qa-student-nif` passes on a build with no Google client ID; built with a
  made-up one, as this machine must, it stops on an error thrown inside
  Google's own sign-in script (`gis is not defined`). Nothing here touches
  Google sign-in.
- Not run: `check:release`'s probe of the live Worker, which the release runs.
  The refund refusal follows Stripe's documented error shape and was exercised
  against an isolated reply, not against Stripe.
