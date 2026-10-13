-- Personal expression history. Apply only during an approved release, after 0026.
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
