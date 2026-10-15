# Lesson homework

Inês opens **Homework** on a lesson, either from the timetable or from the
student's inline lesson history. She adds a photo from her phone or types notes,
checks the transcription, chooses a CEFR level and 10, 15 or 20 minutes, then
makes a draft. Every instruction, question, example and answer is editable.
She reviews the European Portuguese and answers before publishing. Students
see only published sheets in **Homework**, grouped by lesson. They can save
answers and resume them. **Do online** submits a fixed copy for marking.
**Print worksheet** opens a black-and-white paper preview with writing lines;
it is blank by default, with optional student answers and a separate answer key.
Paper work is not marked automatically: students can enter their answers online.

## Marking and approval

Short-answer questions declare their accepted answers. The server ignores case,
spacing and final punctuation but preserves meaningful accents and internal
punctuation. Written questions use a possible answer and receive an OpenAI
suggestion. Natural, correct alternatives must be accepted; uncertain answers
are flagged for Inês. Every question has a mark and a short pt-PT explanation.
These are practice feedback, not a formal assessment of language ability.

**Submit to Inês** saves the answers before any AI call. Automatic suggestions
stay private to Inês, including in API responses. The student sees **Sent to Inês**
and cannot change that submitted copy while it is awaiting review. Inês sees
**Homework to review** on the student's existing row; opening it goes to the
specific lesson. She checks each answer, edits the mark and feedback, resolves
any uncertain answers, then clicks **Approve & send back**. That explicit action
makes her approved feedback visible in the student's Homework tab. No email is
sent. Earlier, unapproved automatic suggestions are never sent to the student.

Students can practise again after feedback. A new attempt replaces the previous
submission, not the published questions. Changed answers are labelled as not yet
reviewed. Draft saving never changes the submitted answers or approved feedback.
This stores the latest attempt, not a grade history.

A duplicate or retried submission reuses the saved attempt without another paid
call. Provider failure, a missing key, exhausted allowance or invalid output
leaves written answers for Inês to mark herself; it never fabricates a mark.
Interrupted marking is handed to teacher review after 90 seconds. Teacher
approval uses a conditional write so a stale tab cannot overwrite another review.

The sheet has recall, focused practice with a worked example, and a small
practical communication task. Answers are separate and can be shown after an
attempt. Personal questions use possible answers, not a single compulsory
response. The A4 print view has writing space, a separate optional answer key,
12-point body text and no navigation, coloured fills or decorative background.

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
`homework_progress` and `homework_ai_usage`. Apply that file manually, first to
staging, then production, after release authority. Do not apply the full schema
or replay older migrations on an existing database. This migration has not been
applied remotely yet; its new progress table includes the submission JSON column.
The schema is for new local databases only. Until the migration is applied, the
Students list shows no homework to review and a student's Homework tab is empty,
rather than either failing. This feature does not change bookings, fees, email or meetings.

- `/admin/lessons/:id/homework`: teacher read/save; `/transcribe`, `/generate`,
  `/publish` and `/return` are explicit POST actions. Existing teacher-session and admin
  authentication apply before parsing a photo body.
- `/me/homework`: published lesson list. `/me/homework/:id`: owner read/save
  answers; `/submit` saves the attempt and requests marking. Both the homework
  owner and current booking owner must match the signed-in student. Manage links alone grant no homework access.
- Private notes never enter student responses. Images are normalised in the
  browser, bounded to 2 MB after conversion, and sent inline to OpenAI; the site
  does not retain the original photo. No public uploads or file URLs are created.
- Draft and answer saves use `updatedAt` in conditional writes. A stale tab gets
  409 instead of silently replacing newer work. Published sheets are immutable
  so answers remain attached to the questions the student actually saw.
- Notes, sheets and saved answers remain with the account until deletion is
  requested. Foreign keys cascade when the corresponding lesson/account is
  deleted. Account deletion remains the existing assisted process with Inês.

## AI activation

AI is **off by default**. The deployed Worker currently has no OpenAI key.
Before activation, obtain the owner's approval for the provider, paid usage and
the new migration/release; install an approved project key as the Worker secret
`OPENAI_API_KEY`. Never put a key in a frontend variable or commit one. Then set
`HOMEWORK_AI_ENABLED=1` for the approved environment. Staging uses its own
secret and explicit environment variables; it must not accidentally use live
student material during testing.

The prepared model is `gpt-6.1-sol`, which supports image input and structured
output. Calls use the Responses API with standard
processing (`service_tier: "default"`), low reasoning effort, `store:false`, a
60-second timeout, a bounded response and no tools. Text in photos/notes is untrusted
material, never instructions to perform other actions. The server validates
provider output before saving. Unreadable handwriting is marked for review;
transcription and teaching accuracy still need Inês's review.

The default ceiling is **200 AI requests per calendar month**, shared across
all teachers and lessons, and six per lesson per hour. A photo transcription
and a generated draft use one request each. A submission containing written
answers uses one additional request for marking; exact-answer checks and teacher
approval do not use AI. Attempts, including errors, count;
there are no automatic paid retries. The limit is an atomic database claim,
not a browser control. Each response is capped at 6,500 output tokens, including
reasoning. Manual authoring, saved homework and teacher marking remain usable when AI is off or at
its limit. While AI is off, Inês's notes hide the photo and **Make homework** actions
and offer **Write a sheet yourself**; written answers arrive marked for her review,
and students are not told about OpenAI checks they will not get. Marking sends only the relevant questions and student answers, never
the private lesson notes, student name, email or account identifier. Students
are told about this processing beside Submit and in the privacy notice.

[OpenAI's published GPT-6.1 Sol standard rates](https://developers.openai.com/api/docs/pricing)
checked on 15 October 2026 are $2 per million input tokens and $10 per million
output tokens for short contexts. Image inputs and reasoning are billed too.
For illustration, a full photo, worksheet and marking workflow totalling 10,000
input tokens and 10,000 output tokens would cost $0.12 before tax, caching
adjustments or any regional-processing surcharge. This is a token-budget
example, not a measured bill. Actual cost depends on photo/notes length, output
and retries; the request ceiling is not a dollar budget for other activity in
the OpenAI project.

`store:false` avoids storing Responses application state, but does not promise
zero retention. [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data)
say API content is not used to train models by default and abuse-monitoring
logs can be retained for up to 30 days, with stated exceptions. The teacher's
upload notice and site privacy notice identify this processing.

## Verification

The existing Worker integration suite covers owner isolation, teacher review,
draft and automatic-mark invisibility, stale saves/reviews, immutable submitted
answers, fixed published questions, bounded uploads, provider failures and shared
usage limits. It also checks accepted-answer variants, Portuguese accents and
duplicate submissions during an AI call. `scripts/qa-homework.mjs` exercises
photo selection through teacher publication, student save/reload/submission,
teacher correction and approval, returned feedback, and black-and-white print at
one desktop and one phone width. Its AI replies and accounts are
synthetic fixtures; passing it is not evidence of live OCR or language quality.
Before enabling the provider, test a synthetic lesson photo through the actual
configured model and inspect its transcription, pt-PT worksheet and marking of
correct, incorrect and valid alternative answers before allowing real students
to submit. Automatic feedback still requires Inês's approval.
