-- A teacher who is also one of Inês's students (17 October 2026, Dan): she
-- adds their email from Add student, and rather than refusing it as taken the
-- site marks their existing account. `role` stays 'teacher', so they remain an
-- admin everywhere; this lets them have lessons, a card and homework too.
-- Emailed sign-in links stay for `role = 'student'` only. Everyone else stays
-- 0, so nothing about them changes.
--
-- Additive. Apply to both databases before deploying the Worker that reads it.
ALTER TABLE students ADD COLUMN also_student INTEGER NOT NULL DEFAULT 0;
