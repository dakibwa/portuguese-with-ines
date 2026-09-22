-- Dan, 22 September 2026: Inês keeps the 15 minutes after every lesson free, so a
-- student cannot book a lesson that starts within 15 minutes of another ending.
-- Lessons may start on any quarter hour (10:00, 10:15, 10:30, 10:45), so the next
-- lesson can begin as soon as that gap is over.
INSERT OR REPLACE INTO settings (key, value) VALUES ('slot_interval_minutes', '15');
INSERT OR REPLACE INTO settings (key, value) VALUES ('lesson_buffer_minutes', '15');
