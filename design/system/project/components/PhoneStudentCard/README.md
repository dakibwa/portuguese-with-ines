# PhoneStudentCard

A student's card opened on a phone: checks, contact and price as dabs, the four actions two by two, then the upcoming lessons.

**Markup:** as StudentProfile, under `student-card-wide`.

- The actions wrap two to a row with their icons; the lesson row's Homework button shares the date's row.

## Write

Drawn by `StudentDashboard` (`src/components/teacher/StudentDashboard.tsx`), opened from a student’s row (`StudentSetupRow`): change it there. The phone layout is the same markup in the narrow `student-card` container.

## Source

- `src/components/teacher/StudentDashboard.tsx#StudentDashboard`
- `src/components/teacher/StudentSetupRow.tsx`, find `<StudentDashboard`
