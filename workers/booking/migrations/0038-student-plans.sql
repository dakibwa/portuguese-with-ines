-- Her plan for each student (9 November 2026, Dan: "a homework page for each
-- student and lesson structure"): a few lines she keeps on their Notes &
-- homework page, what they're working towards and what comes next. Hers
-- alone; nothing a student sees, books or is charged reads it.
-- `lesson_plan_updated_at` stops a stale window overwriting a newer plan.
--
-- Additive. Apply to both databases before deploying the Worker that writes it;
-- until then the page reads an empty plan and saving one is refused.
ALTER TABLE students ADD COLUMN lesson_plan TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN lesson_plan_updated_at TEXT;
