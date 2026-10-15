-- Booking system schema for Português com a Inês.
--
-- All instants are stored as ISO-8601 UTC strings ("2026-09-03T09:00:00.000Z").
-- Wall-clock availability is stored as minutes-from-midnight in Porto time and
-- resolved against Europe/Lisbon at query time, so the stored rules survive DST
-- rather than drifting an hour twice a year.

CREATE TABLE IF NOT EXISTS lesson_types (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL,
  price_cents      INTEGER NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1
);

-- Recurring weekly teaching hours. weekday: 0=Sunday .. 6=Saturday, matching
-- JavaScript's getUTCDay() so there is one convention end to end.
--
-- last_start_minute is the latest time a lesson may *begin*, not the time she
-- finishes. That distinction is the whole point: "last lesson at 19:00" then
-- holds for a 90-minute lesson exactly as it does for a 60-minute one, instead
-- of silently becoming 18:30 for the longer format.
CREATE TABLE IF NOT EXISTS availability_rules (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday           INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute      INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  last_start_minute INTEGER NOT NULL CHECK (last_start_minute BETWEEN 0 AND 1440),
  active            INTEGER NOT NULL DEFAULT 1,
  CHECK (last_start_minute >= start_minute)
);

-- One-off overrides on a specific Porto calendar date.
--   kind='blocked' with NULL minutes  -> whole day off
--   kind='blocked' with minutes       -> that window only
--   kind='extra'                      -> bookable outside the weekly rules
-- One-off overrides on a specific Porto date, or — when `weekday` is set and
-- `date` is null — a block that recurs every week, such as lunch.
--   kind='blocked' with NULL minutes  -> whole day off
--   kind='blocked' with minutes       -> that window only
--   kind='extra'                      -> bookable outside the weekly rules
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT,
  weekday      INTEGER CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  kind         TEXT NOT NULL CHECK (kind IN ('blocked', 'extra')),
  start_minute INTEGER,
  end_minute   INTEGER,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  CHECK (date IS NOT NULL OR weekday IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_exceptions_date ON availability_exceptions (date);
CREATE INDEX IF NOT EXISTS idx_exceptions_weekday ON availability_exceptions (weekday);

-- Student accounts. Booking requires one, so a student's lessons persist and
-- they can see and change all of them in one place rather than depending on
-- having kept the right confirmation email.
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  -- Optional Portuguese tax number, 9 digits, for the fatura-recibo Inês
  -- issues (migration 0017). Empty means consumidor final.
  nif           TEXT NOT NULL DEFAULT '',
  -- The splat the student chose to wear beside their name in their account
  -- (migration 0022); empty shows their initial instead.
  mark          TEXT NOT NULL DEFAULT '',
  timezone      TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  password_hash TEXT NOT NULL,
  -- Google's stable account id, and what a Google sign-in matches on. Migration
  -- 0004 added it to the live database but never here, so a database built
  -- fresh from this file had no column for it and Google sign-in failed on its
  -- first query.
  google_sub    TEXT,
  -- 'teacher' grants the admin endpoints. Inês signs in as herself rather than
  -- pasting a shared token, though ADMIN_TOKEN remains as a way back in.
  role          TEXT NOT NULL DEFAULT 'student',
  session_version INTEGER NOT NULL DEFAULT 0,
  -- When the current address was proven to receive mail: a Google sign-in, a
  -- completed password reset or a confirmed email change (migration 0020).
  -- Registration leaves it empty, and a lesson Inês books for an unproven
  -- address with a password first clears that password and its sessions.
  email_verified_at TEXT,
  -- Stripe's opaque identifiers for charging a saved card again (migration
  -- 0009). The card itself lives at Stripe; these are references, not secrets.
  stripe_customer_id    TEXT,
  stripe_payment_method TEXT,
  -- When the student saved a card for every lesson from their account, which
  -- lets lessons Inês adds be charged to it after each one (migration 0023).
  -- A card saved at one booking's checkout leaves this empty.
  card_consent_at TEXT,
  created_at    TEXT NOT NULL,
  last_login_at TEXT,
  -- 1 for a student Inês set up who hasn't been emailed by the site yet
  -- (migration 0025). Until she sends their welcome, and while they have
  -- never signed in, emails about their lessons are held.
  awaiting_welcome INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_students_role ON students (role);

-- Emails are matched case-insensitively; the column already stores them
-- lower-cased, and this makes the lookup an index hit rather than a scan.
CREATE INDEX IF NOT EXISTS idx_students_email ON students (email);

-- Failed sign-in attempts, so an account can be slowed down under guessing
-- without locking the real student out permanently.
CREATE TABLE IF NOT EXISTS login_attempts (
  email      TEXT NOT NULL,
  at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts (email, at);

-- Reset tokens are single-use: the row is deleted when spent, so a link in an
-- old email cannot be replayed.
CREATE TABLE IF NOT EXISTS password_resets (
  nonce      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- One-click sign-in links (migration 0023). A row is the record that a link
-- is unspent; the address it was sent to must still be the account's.
CREATE TABLE IF NOT EXISTS sign_in_links (
  nonce      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sign_in_links_student ON sign_in_links (student_id);

-- A requested address change, held here until the new address proves itself.
-- Deliberately not on `students`: an unconfirmed address must never sit in the
-- row that sign-in matches against. See migrations/0008-email-changes.sql.
CREATE TABLE IF NOT EXISTS email_changes (
  nonce      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students (id),
  new_email  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_changes_student ON email_changes (student_id);

CREATE TABLE IF NOT EXISTS bookings (
  meeting_url TEXT,
  meeting_event_id TEXT,
  meeting_sequence INTEGER,
  meeting_claim_id TEXT,
  meeting_retry_at TEXT,
  meeting_attempts INTEGER NOT NULL DEFAULT 0,
  meeting_notified_at TEXT,
  meeting_notification_claim_until TEXT,
  charge_started_at TEXT,
  same_day_fee_started_at TEXT,
  charge_request TEXT,
  same_day_fee_request TEXT,
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,
  lesson_type_id    TEXT NOT NULL REFERENCES lesson_types (id),
  student_id        TEXT REFERENCES students (id),
  -- Name and email are copied onto the booking rather than only joined, so a
  -- past lesson still reads correctly if the student later changes either.
  -- Inês's own corrections from Students (the name, phone and, for someone who
  -- never signed in, the email) are the exception: they reach every booking.
  student_name      TEXT NOT NULL,
  student_email     TEXT NOT NULL,
  student_phone     TEXT NOT NULL DEFAULT '',
  student_timezone  TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  location          TEXT NOT NULL DEFAULT 'online' CHECK (location IN ('online', 'porto')),
  notes             TEXT NOT NULL DEFAULT '',
  starts_at         TEXT NOT NULL,
  ends_at           TEXT NOT NULL,
  -- pending_payment is a slot held while Stripe checkout is open. It becomes
  -- confirmed on the webhook, or lapses when hold_expires_at passes.
  status            TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed', 'cancelled', 'pending_payment')),
  -- ICS SEQUENCE. Every change increments it or calendar clients ignore the update.
  sequence          INTEGER NOT NULL DEFAULT 0,
  reschedule_count  INTEGER NOT NULL DEFAULT 0,
  -- Set when a change landed on the lesson's own Porto date: this is what the
  -- EUR 5 same-day fee is charged against, and why Inês is emailed about it.
  same_day_change   INTEGER NOT NULL DEFAULT 0,
  previous_starts_at TEXT,
  -- When the student last changed this lesson (time, length or place), for Inês's
  -- Needs you; cleared when she moves it (migration 0028).
  student_changed_at TEXT,
  cancelled_at      TEXT,
  cancelled_by      TEXT,
  cancellation_message TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  -- 'owed' is a lesson Inês recorded after it happened, still owed to her by
  -- hand: never charged, chased or put on a card (15 October 2026).
  payment_status    TEXT NOT NULL DEFAULT 'not_required',
  amount_cents      INTEGER,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  hold_expires_at   TEXT,
  -- Explicit agreement to an amount decided by the chosen lesson, charged
  -- automatically when that lesson ends. Stripe stores the card itself.
  payment_consent_at TEXT,
  payment_consent_version TEXT,
  attendance_status TEXT NOT NULL DEFAULT 'expected'
                    CHECK (attendance_status IN ('expected', 'no_show')),
  no_show_marked_at TEXT,
  -- The amount actually taken can be the normal lesson price or the EUR 5
  -- no-show amount. Keep it separate from amount_cents, which is the booked
  -- lesson price and must remain available for audit.
  charged_cents INTEGER,
  -- A same-day move/cancellation is a separate charge from the later lesson.
  -- One booking can incur it at most once, even if the action is retried.
  same_day_fee_status TEXT NOT NULL DEFAULT 'not_required',
  same_day_fee_cents INTEGER,
  same_day_fee_payment_intent TEXT,
  same_day_fee_session_id TEXT,
  -- Set when this lesson is one occurrence of a weekly series. Nullable: a
  -- one-off booking has no series, and everything else about the row behaves
  -- identically either way.
  series_id         TEXT REFERENCES booking_series (id),
  -- A lesson Inês added herself rather than one the student booked
  -- (migration 0023).
  added_by_teacher  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS booking_refunds (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  request TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_refund_id TEXT,
  created_at TEXT NOT NULL,
  attempted_at TEXT
);

-- Availability is computed by subtracting confirmed bookings from the rules,
-- so this index carries every read on the hot path.
CREATE INDEX IF NOT EXISTS idx_bookings_window ON bookings (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (student_email);
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings (student_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_bookings_due_charge ON bookings (payment_status, ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_due_same_day_fee ON bookings (same_day_fee_status, updated_at);

-- Stripe delivers webhooks at least once; this makes handling them exactly once.
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

-- Delivery record and idempotency guard: a retried request must not send a
-- second confirmation. dedupe_key is what makes that true.
CREATE TABLE IF NOT EXISTS email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  TEXT,
  kind        TEXT NOT NULL,
  recipient   TEXT NOT NULL,
  dedupe_key  TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL,
  provider_id TEXT,
  error       TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Recurring student bookings. See migrations/0007-booking-series.sql for why
-- the occurrences are real booking rows rather than something derived.
CREATE TABLE IF NOT EXISTS booking_series (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students (id),
  lesson_type_id TEXT NOT NULL REFERENCES lesson_types (id),
  location       TEXT NOT NULL DEFAULT 'online' CHECK (location IN ('online', 'porto')),
  notes          TEXT NOT NULL DEFAULT '',
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  minute_of_day  INTEGER NOT NULL CHECK (minute_of_day BETWEEN 0 AND 1439),
  occurrences    INTEGER CHECK (occurrences IS NULL OR occurrences > 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  filled_to      TEXT,
  -- Legacy flag from the earlier prepay experiment (migration 0009).
  prepaid        INTEGER NOT NULL DEFAULT 0,
  -- New series use automatic_payment. `prepaid` remains only so old rows keep
  -- the promise they were created under.
  automatic_payment INTEGER NOT NULL DEFAULT 0,
  payment_consent_at TEXT,
  payment_consent_version TEXT,
  -- A weekly slot Inês set up; its weeks are checked against her lessons and
  -- days off only (migration 0023).
  added_by_teacher INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  ended_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_students_google ON students (google_sub);
CREATE INDEX IF NOT EXISTS idx_bookings_series ON bookings (series_id);
CREATE INDEX IF NOT EXISTS idx_series_student ON booking_series (student_id);
CREATE INDEX IF NOT EXISTS idx_series_active ON booking_series (status, filled_to);

CREATE TABLE IF NOT EXISTS student_recurring_rates (
  student_id TEXT NOT NULL REFERENCES students(id),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (60, 90)),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  redeemed_at TEXT NOT NULL,
  PRIMARY KEY (student_id, duration_minutes)
);
CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS revoked_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  teacher_id TEXT NOT NULL REFERENCES students(id),
  google_sub TEXT NOT NULL,
  email TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  calendar_id TEXT,
  calendar_creation_attempted_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reconnect')),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES students(id),
  session_version INTEGER NOT NULL,
  session_hash TEXT NOT NULL,
  verifier_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Stage 1: teacher-only expressions. Apply only as part of Dan's approved release.
CREATE TABLE IF NOT EXISTS expressions (
  id TEXT PRIMARY KEY,
  expression TEXT NOT NULL,
  normalized TEXT NOT NULL UNIQUE,
  meaning_pt TEXT NOT NULL DEFAULT '',
  meaning_en TEXT NOT NULL DEFAULT '',
  literal_en TEXT NOT NULL DEFAULT '',
  examples TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(examples) AND json_type(examples) = 'array' AND json_array_length(examples) <= 2),
  notes TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array' AND json_array_length(tags) <= 8),
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (published = 0 OR (length(trim(meaning_pt)) > 0 AND length(trim(meaning_en)) > 0 AND json_array_length(examples) BETWEEN 1 AND 2))
);
CREATE INDEX IF NOT EXISTS expressions_order ON expressions(sort_order, id);

-- A student's own draws; another student has an independent collection.
CREATE TABLE IF NOT EXISTS expression_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expression_id TEXT NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(student_id, expression_id),
  UNIQUE(student_id, request_id)
);
CREATE INDEX IF NOT EXISTS expression_picks_latest ON expression_picks(student_id, id DESC);
-- Lesson notes stay private. Only the reviewed, published sheet is shared.
CREATE TABLE IF NOT EXISTS lesson_homework (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'A1',
  minutes INTEGER NOT NULL DEFAULT 15,
  draft_json TEXT CHECK (draft_json IS NULL OR json_valid(draft_json)),
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  published_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS homework_student ON lesson_homework(student_id, published_at);

CREATE TABLE IF NOT EXISTS homework_progress (
  booking_id TEXT PRIMARY KEY REFERENCES lesson_homework(booking_id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json)),
  submission_json TEXT CHECK (submission_json IS NULL OR json_valid(submission_json)),
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  -- The submission Inês was emailed about (migration 0030).
  notified_submission_id TEXT,
  notified_at TEXT
);

-- An atomic, calendar-month ceiling shared by every teacher and lesson.
-- Counts attempts, including failures: retries must never escape the limit.
CREATE TABLE IF NOT EXISTS homework_ai_usage (
  month TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0
);
