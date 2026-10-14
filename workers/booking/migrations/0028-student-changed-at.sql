-- When the student last changed this lesson themselves (its time, length or
-- place), so Inês's Needs you can say so for three days (Phase 2, 14 October
-- 2026). Her own move clears it, because her own change is not news to her.
-- Every existing row stays NULL, so nothing changed before this release shows.
--
-- Additive. The Worker writes it in a separate statement that never blocks a
-- change and tolerates the column being absent, so either order is safe.
-- Apply it to staging and production before the Worker deploy, so the first
-- changes after release are recorded.
ALTER TABLE bookings ADD COLUMN student_changed_at TEXT;
