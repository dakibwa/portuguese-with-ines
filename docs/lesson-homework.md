# Lesson homework

Inês opens **Homework** on a lesson, either from the timetable or from the
student's inline lesson history. A new sheet is one decision per step, as in
the booking journey (15 October 2026, Dan: far too much text). **What did you
work on?** offers one big **Take a photo** blob, which opens the phone's rear
camera (`capture="environment"`), with **Gallery** and **Type it** beneath.
A photo moves straight on; typed notes take **Next**. **Level** offers A1–C2
as blobs, starting at the student's latest earlier sheet (by lesson date),
else A1. **Length** offers 10, 15 or 20 minutes, starting at 15. Each tap moves
on; decisions already taken fold into summary rows with **Change**, and
**Back** steps back one. The last step is **Generate homework** (with AI off,
**Write the sheet**). While Claude works a progress card names the step in hand
(**Reading your notes**, then **Writing the homework**) with a gently filling
line. Up to three pages are read in one request and the draft is made straight
away. If the reader was unsure of anything it stops at **Check the notes**; if
it found no lesson text it returns to the first step to type them. The draft
opens as a preview. **Fine-tune** opens the field-by-field editor, where every
instruction, question, example, answer and marking rule is editable. She ticks
**I checked the Portuguese and the answers** and presses **Publish for
student**. The lesson notes, level and length stay folded above the draft,
with **Make a new draft**. Privacy is one lock icon in the heading, its words
("Private draft: only you can see it. Anthropic reads any photos; this site
doesn't keep them.") on hover and for screen readers; the site privacy notice
carries the full explanation. Students
see only published sheets in **Homework**, grouped by lesson. They can save
answers and resume them. **Do online** submits a fixed copy for marking.
**Print worksheet** opens a black-and-white paper preview with writing lines;
it is blank by default, with optional student answers and a separate answer key.
Paper work is not marked automatically: students can enter their answers online.

## Marking and approval

Short-answer questions declare their accepted answers. The server ignores case,
spacing and final punctuation but preserves meaningful accents and internal
punctuation. Written questions use a possible answer and receive a suggestion
from Anthropic's Claude. Natural, correct alternatives must be accepted; uncertain answers
are flagged for Inês. Every question has a mark and a short pt-PT explanation.
These are practice feedback, not a formal assessment of language ability.

**Submit to Inês** saves the answers before any AI call. Automatic suggestions
stay private to Inês, including in API responses. The student sees **Sent to Inês**
and cannot change that submitted copy while it is awaiting review. Inês sees
**Homework to review** on the student's existing row; opening it goes to the
specific lesson. A tally shows how many answers are correct, to try again and
waiting for her. Answers that already have a mark and real feedback are folded
to the student's words, the mark and the feedback, with **Change** to open one.
Uncertain or unmarked answers stay open, edged in coral, until she resolves
them. Then she clicks **Approve & send back**. That explicit action
makes her approved feedback visible in the student's Homework tab, and the
sheet then reads **Done** for both of them: a Done chip and band for Inês, and
for the student a Done band on the sheet and **Done** on its card. Earlier,
unapproved automatic suggestions are never sent to the student.

## Telling Inês

Each submission emails Inês once, through the Worker's booking email
(`deliver`, Resend, `email_log`), styled like the other booking emails:
**Homework to review**, the student's name, the sheet's title, the lesson's
date and a **Review homework** button to
`/schedule/?student=…&homework=…`, which opens that lesson's review once she is
signed in. It never contains answers, the answer key or any automatic mark.
It is sent after marking finishes, or, if marking was interrupted, by the
every-minute cron after the 90-second hand-off. Before sending, the Worker
claims `homework_progress.notified_submission_id` for that submission (migration
0030) and the email log dedupes on `teacher:homework-submitted:<submission id>`,
so retried submits and the sweep never send twice. An interrupted claim expires
after two minutes. Saved provider requests retry with the same idempotency key
and exact body for at most 23 hours, within the provider's 24-hour retention;
expired or ambiguous legacy attempts require manual reconciliation. The sweep
considers recent submissions for three days, but never extends that send window.
The email has no booking id
so the failed-email sweep can never rebuild it as a lesson confirmation. A new
attempt has a new submission id and is announced in its turn.
`TEACHER_NOTIFICATIONS_ENABLED=0` pauses it with her other copies. Until
migration 0030 is applied, submissions work as before and no notice is sent.

Students can practise again after feedback. A new attempt replaces the previous
submission, not the published questions. Changed answers are labelled as not yet
reviewed. Draft saving never changes the submitted answers or approved feedback.
This stores the latest attempt, not a grade history.

A duplicate or retried submission reuses the saved attempt without another paid
call. Provider failure, a missing key, exhausted allowance or invalid output
leaves written answers for Inês to mark herself; it never fabricates a mark.
Interrupted marking is handed to teacher review after 90 seconds. Teacher
approval uses a conditional write so a stale tab cannot overwrite another review.
Teacher marking reads do not overlap, and a late read cannot replace a review
already being edited. Reopening approved feedback updates the student's list
card to Done immediately. Draft writes check the lesson's current owner and
confirmed status when saving, including after an AI request has been waiting.

The sheet has recall, focused practice with a worked example, and a small
practical communication task. Answers are separate and can be shown after an
attempt. Personal questions use possible answers, not a single compulsory
response. The A4 print view has writing space, a separate optional answer key,
12-point body text and no navigation, coloured fills or decorative background.
Its print copy and native-print handlers are prepared before the worksheet's
first paint, so printing immediately from an open lesson selects that one
worksheet rather than a blank page or a hidden editor behind it.

## Teaching and presentation sources

These are design choices informed by the sources below, not a claim that one
worksheet template or a fixed 15-minute duration has been scientifically
validated for every adult learner. Inês sets the level and checks suitability.

- [British Council: The role of homework](https://www.teachingenglish.org.uk/professional-development/teachers/managing-resources/articles/role-homework)
  recommends relevant, manageable tasks connected to classwork, variety, clear
  purpose and useful feedback. This is professional teaching guidance.
- [IES: Organizing Instruction and Study to Improve Student Learning](https://ies.ed.gov/ncee/wwc/PracticeGuide/1)
  supports spaced study, retrieval and combining worked examples with practice.
  Its evidence covers several learning contexts; it is not specific to this app
  or adult European Portuguese. The later recall reminder applies that principle.
- [Council of Europe: Action-orientation in the classroom](https://www.coe.int/en/web/common-european-framework-reference-languages/action-orientation-in-the-classroom)
  supports purposeful language use. The final task asks the learner to use the
  lesson language in a realistic personal situation.
- [Referencial Camões PLE](https://www.instituto-camoes.pt/images/REFERENCIAL_ebook.pdf)
  describes Portuguese learning content and communicative abilities by CEFR
  level. The generator is instructed to use pt-PT and match the selected level;
  it does not claim formal Camões approval or curriculum coverage.
- [GOV.UK: Publishing accessible documents](https://www.gov.uk/guidance/publishing-accessible-documents)
  informs the readable print type, meaningful headings and HTML-first access.
  The browser's print-to-PDF output is not represented as a tagged accessible PDF.

## Storage and access

Migration `0029_lesson_homework.sql` adds only `lesson_homework`,
`homework_progress` and `homework_ai_usage`. Migrations 0029 and 0030 are already
applied in production; homework AI has been live since 15 October 2026.
Apply future additive migrations manually to staging, then production. Do not
apply the full schema or replay older migrations on an existing database.
The schema is for new local databases only. Where these tables are absent, the
Students list shows no homework to review and a student's Homework tab is empty,
rather than either failing. Migration `0030-homework-notified.sql` adds the two
notification columns; apply it after 0029. This feature does not change bookings, fees or meetings.

- `/admin/lessons/:id/homework`: teacher read/save; `/transcribe`, `/generate`,
  `/publish` and `/return` are explicit POST actions. Existing teacher-session and admin
  authentication apply before parsing a photo body.
- `/me/homework`: published lesson list. `/me/homework/:id`: owner read/save
  answers; `/submit` saves the attempt and requests marking. Both the homework
  owner and current booking owner must match the signed-in student. Manage links alone grant no homework access.
- Private notes never enter student responses. Images are normalised in the
  browser, each bounded to 2 MB after conversion, and sent inline (base64) to
Anthropic's Messages API.
  Up to three photos (`images`) go in one transcription request, so the body
  limit is three photos' worth. A single `image` from an older open tab is
  still accepted. The site does not retain the original photos. No public uploads or file URLs are created.
- Draft and answer saves use `updatedAt` in conditional writes. A stale tab gets
  409 instead of silently replacing newer work. Published sheets are immutable
  so answers remain attached to the questions the student actually saw.
  Non-photo teacher requests allow 1 MiB and student answers 256 KiB, enough
  for twelve maximum-length questions and their accepted answers, including
  UTF-8 and JSON escaping; the field and question limits still apply.
- Notes, sheets and saved answers remain with the account until deletion is
  requested. Foreign keys cascade when the corresponding lesson/account is
  deleted. Account deletion remains the existing assisted process with Inês.

## AI activation

AI fails closed without an explicit enabled flag and provider key. Production
has `HOMEWORK_AI_ENABLED=1` and the approved `ANTHROPIC_API_KEY` Worker secret;
staging keeps AI disabled. Never put a key in a frontend variable or commit one.
Staging uses its own secret and explicit environment
variables; it must not accidentally use live student material during testing.

The default model is `claude-opus-5-5`; `HOMEWORK_AI_MODEL` overrides it. Calls
use the Anthropic Messages API directly (`fetch`, no SDK dependency in the
Worker) with `anthropic-version: 2023-06-01`, image input (up to three photos
as base64 image blocks in one request), low effort (`output_config.effort:
"low"`) and no extended thinking requested. Current Opus models cannot switch
thinking off entirely, so low effort keeps it brief. The result comes back as
the input to one strict tool (`strict: true`, `tool_choice: auto`, since
current models reject forced tool choice) and the server validates it again
before saving; text outside the tool, a refusal or a truncated reply is an
error, never a sheet or a mark. Each call has a 60-second timeout,
`max_tokens: 8000` (thinking included) and a 256 KB response bound. For the
models that support it (Opus 5.5, Opus 5, Fable 5.1, Sonnet 5.5) the request
opts into Anthropic's server-side refusal fallback (`fallbacks: "default"`,
beta `server-side-fallback-2026-07-01`), which may re-run a declined request on
another Claude model; remove it if the owner prefers a plain refusal. Text in
photos/notes is untrusted material, never instructions to perform other actions.
Unreadable handwriting is marked for review; transcription and teaching
accuracy still need Inês's review.

The default ceiling is **200 AI requests per calendar month**, shared across
all teachers and lessons, and six per lesson per hour. A photo transcription
(of one to three photos) and a generated draft use one request each, so
**Generate homework** from photos uses two. A submission containing written
answers uses one additional request for marking; exact-answer checks and teacher
approval do not use AI. Attempts, including errors, count;
there are no automatic paid retries. The limit is an atomic database claim,
not a browser control. Manual authoring, saved homework and teacher marking
remain usable when AI is off or at its limit. While AI is off, the first step
offers only typed notes and the last **Write the sheet**; written answers arrive
marked for her review, and students are not told about AI checks they will not
get. Marking sends only the relevant questions and student answers, never the
private lesson notes, student name, email or account identifier. Students are
told about this processing beside Submit and in the privacy notice.

Cost: the Claude API reference bundled with Claude Code (model table cached on
6 October 2026) lists Claude Opus 5.5 at $4 per million input tokens and $20 per
million output tokens. That is not a repository source, so **check
[Anthropic's pricing page](https://www.anthropic.com/pricing#api) before
activation**. Image inputs count as input tokens and thinking counts as output.
For illustration only, at those rates a full photo, worksheet and marking
workflow totalling 10,000 input and 10,000 output tokens would cost about
$0.24 before tax. This is a token-budget example, not a measured bill. The
request ceiling is not a dollar budget for other activity in the Anthropic
workspace; set a spend limit there too.

Anthropic's commercial terms say API content is not used to train its models by
default; it is retained for a limited period, longer where safety review or the
law requires. Confirm the current retention period in
[Anthropic's Privacy Center](https://privacy.anthropic.com/) before activation.
The site privacy notice identifies this processing.

## Verification

The existing Worker integration suite covers owner isolation, teacher review,
draft and automatic-mark invisibility, stale saves/reviews, immutable submitted
answers, fixed published questions, bounded uploads, provider failures and shared
usage limits. It also checks accepted-answer variants, Portuguese accents and
duplicate submissions during an AI call, the Messages API request shape
(model, effort, strict tool, image blocks), refusals and replies without the
tool call, and the submission notice: one email per submission, no answers or
marks, a review link, a failed send retried by the sweep, and the 90-second
hand-off. The defaults test checks the starting level and length.
`scripts/qa-homework.mjs` exercises the AI-on steps: camera capture, auto-advance
through the default level and length, Back, the progress card, two pages read and
drafted in one press, the preview, Fine-tune and publication, student
save/reload/submission, folded teacher review, correction and approval, Done for
both, returned feedback, and black-and-white print at one desktop and one phone
width. Its AI replies and accounts are
synthetic fixtures; passing it is not evidence of live OCR or language quality.
Before enabling the provider, test a synthetic lesson photo through the actual
configured model and inspect its transcription, pt-PT worksheet and marking of
correct, incorrect and valid alternative answers before allowing real students
to submit. Automatic feedback still requires Inês's approval.
