-- Dormant students (22 October 2026, Dan): Inês marks a student who hasn't
-- had a lesson in a while, keeps them apart in her list, and can send them her
-- own come-back email. `dormant_at` is when she marked them; a lesson of
-- theirs ending after it makes them active again without anyone unmarking
-- them. `dormant_emailed_at` is when her come-back email last went to them.
-- Nothing a student sees, books or is charged depends on either.
--
-- Additive. Apply to both databases before deploying the Worker that reads it.
ALTER TABLE students ADD COLUMN dormant_at TEXT;
ALTER TABLE students ADD COLUMN dormant_emailed_at TEXT;
