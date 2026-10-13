-- A student Inês set up who has not been emailed by the site yet (13 October
-- 2026, Dan). While it is 1 and they have never signed in, she can add their
-- details and lessons without any email reaching them; her Google Calendar,
-- the blocked time and the lesson's NIF work as usual. `Send welcome email`
-- clears it. Everyone else stays 0, so nothing about them changes.
--
-- Additive. Apply to both databases before deploying the Worker that reads it.
ALTER TABLE students ADD COLUMN awaiting_welcome INTEGER NOT NULL DEFAULT 0;
