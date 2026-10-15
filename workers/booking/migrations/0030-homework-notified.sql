-- Which submission Inês has been emailed about, and when (15 October 2026).
-- One notice per submission: the Worker claims this column before sending,
-- so a retried submit or the every-minute sweep never emails her twice. A new
-- attempt has a new submission id, so it is announced in its turn.
--
-- Additive. Apply after 0029, before or after the Worker deploy: until it is
-- applied submissions are saved and reviewable as before and no notice is sent.
ALTER TABLE homework_progress ADD COLUMN notified_submission_id TEXT;
ALTER TABLE homework_progress ADD COLUMN notified_at TEXT;
