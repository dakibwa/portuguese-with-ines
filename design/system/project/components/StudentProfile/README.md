# StudentProfile

A student's card opened on their profile: their three checks with Invite and Add a lesson on the same row, then their details, price and plan, each with a pencil to edit, beside their lessons.

**Markup:** the open `li.teacher-student` (the `student-card` container): the checks and actions on its top row and a close button, then Details (email, phone, NIF), Price (each length's price, marked standard or their own) and Plan, each headed in `eyebrow-label` with its pencil, beside their lessons (`No lessons recorded yet.` until there are some).

- From `student-card-wide` (56.75rem of its own width) the profile sits beside the lessons; under it they stack. Keep that threshold (accepted 28 Oct 2026). Under 30rem the actions wrap three and two.
- Use the space: the card is as tall as what is in it, the actions on one row where they fit, the contact and the heading on one row (Dan's complaint of 9 Nov 2026 was wasted space on this profile).
- A lesson row is `raised`, `squiggle-field`: date and time, a status pill (`Happening now` in blue), the dabs (Online, 60 mins, Payment scheduled) and a lilac `Homework`.
- Only what needs her eye is a dab: their own price, lessons paid by hand, a come-back email sent.

## Write

Drawn by `StudentDashboard` (`src/components/teacher/StudentDashboard.tsx`), opened from a student’s row (`StudentSetupRow`): change it there.

## Source

- `src/components/teacher/StudentDashboard.tsx#StudentDashboard`
- `src/components/teacher/StudentSetupRow.tsx`, find `<StudentDashboard`
