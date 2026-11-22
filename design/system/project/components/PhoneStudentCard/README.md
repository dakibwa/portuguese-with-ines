# PhoneStudentCard

A student's card opened on a phone: the checks, Invite and Add a lesson, then details, price and plan stacked over the lessons.

**Markup:** as StudentProfile, under `student-card-wide`.

- What sits beside the lessons on a wide card stacks above them; the actions keep their own row.

## Write

Drawn by `StudentDashboard` (`src/components/teacher/StudentDashboard.tsx`), opened from a student’s row (`StudentSetupRow`): change it there. The phone layout is the same markup in the narrow `student-card` container.

## Source

- `src/components/teacher/StudentDashboard.tsx#StudentDashboard`
- `src/components/teacher/StudentSetupRow.tsx`, find `<StudentDashboard`
