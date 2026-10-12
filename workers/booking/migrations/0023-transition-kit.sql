-- Bringing Inês's existing students onto the site (12 October 2026, Dan).
--
-- Additive and nullable throughout. Apply to both databases before deploying
-- the Worker that reads it.

-- A lesson Inês added herself, rather than one the student booked. Marked
-- outright instead of inferred from an unpaid row, so it still reads as hers
-- once the student's card starts paying for it. No backfill: every lesson
-- added this way before now has already happened or been cancelled.
ALTER TABLE bookings ADD COLUMN added_by_teacher INTEGER NOT NULL DEFAULT 0;

-- A weekly slot Inês set up. Its weeks are checked against her other lessons
-- and days off only, like a single lesson she adds, not against the hours
-- students may book.
ALTER TABLE booking_series ADD COLUMN added_by_teacher INTEGER NOT NULL DEFAULT 0;

-- When the student saved a card for every lesson, not only one they booked:
-- the standing agreement that lessons Inês adds are charged to it after each
-- one ends. Null until they do. A card saved at a booking's checkout covers
-- that booking only and leaves this null.
ALTER TABLE students ADD COLUMN card_consent_at TEXT;

-- One-click sign-in links. A row is the record that a link is still unspent;
-- it is tied to the address it was sent to, so changing the address on the
-- account retires every link sent to the old one.
CREATE TABLE IF NOT EXISTS sign_in_links (
  nonce TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sign_in_links_student ON sign_in_links (student_id);
