-- Optional message from Inês, kept separately from the student's lesson notes.
-- Persisted with the cancellation/refund claim so delayed emails keep it.
-- Apply this additive migration to staging and production before the Worker.
ALTER TABLE bookings ADD COLUMN cancellation_message TEXT;
