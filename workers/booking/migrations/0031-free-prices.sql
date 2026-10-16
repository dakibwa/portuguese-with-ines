-- A student's price for a length can be €0 (16 October 2026, Dan: "can Inês
-- set a student's price to €0 so that student never needs to add a card?").
-- Their lessons at that length are then booked as `payment_status = 'free'`,
-- which nothing charges, chases or receipts; that status needs no migration,
-- since bookings.payment_status has no CHECK constraint.
--
-- The rates table is rebuilt rather than altered: its CHECK said
-- `amount_cents > 0`, and SQLite cannot change a CHECK in place. Nothing
-- references this table, and every row is copied as it is.
--
-- Apply before the Worker that allows €0. Either order is safe: until it is
-- applied, saving €0 is refused with a note that the update is pending, and
-- every other price saves as before.

CREATE TABLE student_recurring_rates_rebuilt (
  student_id TEXT NOT NULL REFERENCES students(id),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (60, 90)),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  redeemed_at TEXT NOT NULL,
  PRIMARY KEY (student_id, duration_minutes)
);

INSERT INTO student_recurring_rates_rebuilt (student_id, duration_minutes, amount_cents, redeemed_at)
SELECT student_id, duration_minutes, amount_cents, redeemed_at FROM student_recurring_rates;

DROP TABLE student_recurring_rates;

ALTER TABLE student_recurring_rates_rebuilt RENAME TO student_recurring_rates;
