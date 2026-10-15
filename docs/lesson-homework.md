# Lesson homework

Inês opens **Homework** on a lesson, either from the timetable or from the
student's inline lesson history. She adds a photo from her phone or types notes,
checks the transcription, chooses a CEFR level and 10, 15 or 20 minutes, then
makes a draft. Every instruction, question, example and answer is editable.
She reviews the European Portuguese and answers before publishing. Students
see only published sheets in **Homework**, grouped by lesson. They can save
answers, resume them, mark a sheet complete, or print it. Completion is the
student's own statement, including work done on paper; it is not an AI grade.

The sheet has recall, focused practice with a worked example, and a small
practical communication task. Answers are separate and can be shown after an
attempt. Personal questions use possible answers, not a single compulsory
response. The A4 print view has writing space, a separate optional answer key,
12-point body text and no navigation or decorative background.

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
or replay older migrations on an existing database. The schema is for new local
databases only. This feature does not change bookings, fees, email or meetings.

- `/admin/lessons/:id/homework`: teacher read/save; `/transcribe`, `/generate`
  and `/publish` are explicit POST actions. Existing teacher-session and admin
  authentication apply before parsing a photo body.
- `/me/homework`: published lesson list. `/me/homework/:id`: owner read/save
  answers. Both the homework owner and current booking owner must match the
  signed-in student. Manage links alone grant no homework access.
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

The prepared model is `gpt-4.1-mini-2025-04-14`, which supports image input and
structured output. Calls use the Responses API with `store:false`, a 60-second
timeout, a bounded response and no tools. Text in photos/notes is untrusted
material, never instructions to perform other actions. The server validates
provider output before saving. Unreadable handwriting is marked for review;
transcription and teaching accuracy still need Inês's review.

The default ceiling is **200 AI requests per calendar month**, shared across
all teachers and lessons, and six per lesson per hour. A photo transcription
and a generated draft use one request each. Attempts, including errors, count;
there are no automatic paid retries. The limit is an atomic database claim,
not a browser control. Each response is capped at 6,500 output tokens. Manual
authoring and saved homework remain usable when AI is off or at its limit.

[OpenAI's published GPT-4.1 mini rates](https://developers.openai.com/api/docs/pricing)
checked on 15 October 2026 are $0.40 per million input tokens and $1.60 per
million output tokens. Image inputs are billed too. Actual cost depends on
photo/notes length, output and retries; the request ceiling is not a dollar
budget for other activity in the OpenAI project.

`store:false` avoids storing Responses application state, but does not promise
zero retention. [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data)
say API content is not used to train models by default and abuse-monitoring
logs can be retained for up to 30 days, with stated exceptions. The teacher's
upload notice and site privacy notice identify this processing.

## Verification

The existing Worker integration suite covers owner isolation, teacher review,
draft invisibility, stale saves, fixed published questions, bounded uploads,
provider failures and shared usage limits. `scripts/qa-homework.mjs` exercises
photo selection through teacher publication, student save/reload/completion and
print at one desktop and one phone width. Its AI replies and accounts are
synthetic fixtures; passing it is not evidence of live OCR or language quality.
Before enabling the provider, test a synthetic lesson photo through the actual
configured model and inspect both its transcription and pt-PT worksheet.
