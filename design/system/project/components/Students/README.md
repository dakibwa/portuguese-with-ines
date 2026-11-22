# Students

Inês's Students tab: find a student, add one, see how many are all set, and the students in four groups, each card with three checks and one next button.

**Markup:** `<section class="teacher-students">`: the search field and coral `Add a student`, the progress line (`1 of 3 students are all set` over a coral bar), then the students in groups (`To do`, `All set`, and the others when anyone is in them), each headed in `eyebrow-label` with its count and one plain hint, over its students' cards (`li.teacher-student`).

- Groups are headed in `eyebrow-label` with their count and one plain hint (`Send each their link.`). An empty group is left out.
- A closed card is the student's splat and name in `student-name`, a `Weekly` tag in its corner when they have a weekly run, three checks (signed in, card saved, paid up; what is open in coral, `€50 open`), and one button for her next move: coral `Invite`, lilac `Send again`, or nothing when all set.
- Cards are `sheet` with 1px `rule`, `squiggle-panel`. On a wide list each keeps its own height, packed in columns, so a short card never leaves a hole (the masonry grid; a card is never narrower than `student-grid-min`).
- The Students badge counts only real to-dos; a student with no email is set up, not unfinished.

## Write

Inês’s Students tab: `StudentList` (`src/components/teacher/StudentList.tsx`), a `StudentSetupRow` for each student, in `TeacherSchedule`. Change it there.

## Source

- `src/components/teacher/StudentList.tsx#StudentList`
- `src/components/teacher/StudentList.tsx`, find `<StudentSetupRow`
