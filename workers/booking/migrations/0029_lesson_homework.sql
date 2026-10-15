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
  updated_at TEXT NOT NULL
);

-- An atomic, calendar-month ceiling shared by every teacher and lesson.
-- Counts attempts, including failures: retries must never escape the limit.
CREATE TABLE IF NOT EXISTS homework_ai_usage (
  month TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0
);
