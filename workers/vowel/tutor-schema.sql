CREATE TABLE IF NOT EXISTS vowel_config (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, record TEXT NOT NULL, origin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vowel_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS student_lesson_rates (student_id TEXT NOT NULL REFERENCES students(id), lesson_type_id TEXT NOT NULL REFERENCES lesson_types(id), amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), PRIMARY KEY(student_id,lesson_type_id));
CREATE TABLE IF NOT EXISTS rate_proposals (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, lesson_type_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS learner_profiles (student_id TEXT PRIMARY KEY REFERENCES students(id), level TEXT NOT NULL DEFAULT 'A1', goals TEXT NOT NULL DEFAULT '', first_language TEXT NOT NULL DEFAULT '', pack_approved_at TEXT);
CREATE TABLE IF NOT EXISTS lesson_plans (booking_id TEXT PRIMARY KEY REFERENCES bookings(id), student_id TEXT NOT NULL, draft TEXT NOT NULL, approved_at TEXT, taught_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS review_topics (student_id TEXT NOT NULL, topic_id TEXT NOT NULL, due_at TEXT NOT NULL, interval_days INTEGER NOT NULL DEFAULT 1, successes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(student_id,topic_id));
CREATE TABLE IF NOT EXISTS lesson_topics (booking_id TEXT NOT NULL, topic_id TEXT NOT NULL, PRIMARY KEY(booking_id,topic_id));

CREATE TRIGGER IF NOT EXISTS vowel_booking_terms AFTER INSERT ON bookings BEGIN
 UPDATE bookings SET
  policy_notice_hours=COALESCE((SELECT policy_notice_hours FROM booking_series WHERE id=NEW.series_id),(SELECT CAST(value AS INTEGER) FROM settings WHERE key='minimum_notice_hours'),24),
  policy_fee_cents=COALESCE((SELECT policy_fee_cents FROM booking_series WHERE id=NEW.series_id),(SELECT CAST(value AS INTEGER) FROM settings WHERE key='same_day_change_fee_cents'),0),
  policy_no_show=COALESCE((SELECT policy_no_show FROM booking_series WHERE id=NEW.series_id),(SELECT value FROM settings WHERE key='no_show_mode'),'none'),
  policy_no_show_cents=COALESCE((SELECT policy_no_show_cents FROM booking_series WHERE id=NEW.series_id),(SELECT CAST(value AS INTEGER) FROM settings WHERE key='no_show_cents'),0),
  amount_cents=CASE WHEN NEW.series_id IS NOT NULL THEN COALESCE((SELECT policy_price_cents FROM booking_series WHERE id=NEW.series_id),NEW.amount_cents) ELSE NEW.amount_cents END
 WHERE id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS vowel_series_terms AFTER INSERT ON booking_series BEGIN
 UPDATE booking_series SET
  policy_notice_hours=COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='minimum_notice_hours'),24),
  policy_fee_cents=COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='same_day_change_fee_cents'),0),
  policy_no_show=COALESCE((SELECT value FROM settings WHERE key='no_show_mode'),'none'),
  policy_no_show_cents=COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='no_show_cents'),0),
  policy_price_cents=COALESCE((SELECT amount_cents FROM student_lesson_rates WHERE student_id=NEW.student_id AND lesson_type_id=NEW.lesson_type_id),(SELECT amount_cents FROM student_recurring_rates WHERE student_id=NEW.student_id AND duration_minutes=(SELECT duration_minutes FROM lesson_types WHERE id=NEW.lesson_type_id)),(SELECT ROUND(amount_cents*1.5) FROM student_recurring_rates WHERE student_id=NEW.student_id AND duration_minutes=60 AND 90=(SELECT duration_minutes FROM lesson_types WHERE id=NEW.lesson_type_id)),(SELECT price_cents FROM lesson_types WHERE id=NEW.lesson_type_id))
 WHERE id=NEW.id;
END;
-- A student changing their weekly lesson type has explicitly reviewed its
-- quote. The moved occurrences are written before the new recipe.
CREATE TRIGGER IF NOT EXISTS vowel_series_type_price AFTER UPDATE OF lesson_type_id ON booking_series
WHEN OLD.lesson_type_id<>NEW.lesson_type_id BEGIN
 UPDATE booking_series SET policy_price_cents=COALESCE(
  (SELECT amount_cents FROM bookings WHERE series_id=NEW.id AND lesson_type_id=NEW.lesson_type_id AND status='confirmed' ORDER BY starts_at DESC LIMIT 1),
  OLD.policy_price_cents) WHERE id=NEW.id;
END;
