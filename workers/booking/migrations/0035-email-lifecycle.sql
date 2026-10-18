-- Apply this additive migration to staging, then production, before deploying
-- the Worker. Never replay schema.sql against an existing database.
ALTER TABLE email_log ADD COLUMN lifecycle_json TEXT;

-- A saved body alone cannot prove that every lesson in a consolidated email
-- still has the same owner, dates and payment terms. Never replay old lifecycle
-- attempts without their immutable membership snapshot.
UPDATE email_log SET status = 'unconfirmed',
  error = 'Legacy lesson email requires manual reconciliation.', request_json = NULL,
  send_claim_id = NULL, send_claim_until = NULL
WHERE status IN ('pending', 'failed') AND kind IN (
  'student_booked', 'student_rescheduled', 'student_cancelled',
  'teacher_booked', 'teacher_rescheduled', 'teacher_cancelled',
  'student_series_booked', 'student_series_moved', 'student_series_cancelled',
  'teacher_series_booked', 'teacher_series_moved', 'teacher_series_cancelled', 'teacher_series_extended'
);
