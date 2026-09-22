-- Her approved public product set (README "Sources of truth"): trial EUR 20/60,
-- single EUR 25/60, long EUR 35/90. Legacy students keep individually agreed
-- pricing, which is deliberately not advertised and so is not modelled here.
INSERT OR REPLACE INTO lesson_types (id, slug, name, description, duration_minutes, price_cents, sort_order, active) VALUES
  ('trial',  'trial-lesson',  'Trial lesson',   'A full hour, not a sales call. We find out where your Portuguese is and what you want to do with it.', 60, 2000, 1, 1),
  ('single', 'single-lesson', 'Single lesson',  'One to one, in Porto or online.',                                                                        60, 2500, 2, 1),
  ('long',   'long-lesson',   'Longer lesson',  'An hour and a half, if you want more time to talk.',                                                    90, 3500, 3, 1);

-- Her teaching hours, Porto time (confirmed by Dan, 26 August 2026).
--   Mon-Tue  first 10:00, last lesson starts 19:00
--   Wed-Fri  first 17:00, last lesson starts 19:00
-- These are start times. A 90-minute lesson beginning at 19:00 runs to 20:30,
-- which is intended.
DELETE FROM availability_rules;
INSERT INTO availability_rules (weekday, start_minute, last_start_minute, active) VALUES
  (1, 600, 1140, 1),
  (2, 600, 1140, 1),
  (3, 1020, 1140, 1),
  (4, 1020, 1140, 1),
  (5, 1020, 1140, 1);

INSERT OR REPLACE INTO settings (key, value) VALUES
  ('minimum_notice_hours', '14'),
  -- Twelve weeks ahead, which the calendar shows four weeks at a time.
  ('booking_horizon_days', '84'),
  ('slot_interval_minutes', '30'),
  ('same_day_change_fee_cents', '500'),
  ('teacher_name', 'Inês Dias Baía'),
  ('teacher_email', ''),
  ('reply_to_email', '');
