-- Students' own translations of an expression (30 October 2026, Dan, for
-- Inês): a signed-in student adds how they would say it in any language, and
-- everyone reading the expression sees the ones Inês has approved. Each
-- starts `pending`; nothing a student writes is shown until she approves it.
-- A student has at most one translation waiting per expression. Their name is
-- never shown publicly, only to her while she reviews.
--
-- Additive. Apply to both databases before deploying the Worker that reads it.
CREATE TABLE IF NOT EXISTS expression_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expression_id TEXT NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (length(language) BETWEEN 1 AND 40),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS expression_translations_shown ON expression_translations(expression_id, status, id);
CREATE INDEX IF NOT EXISTS expression_translations_review ON expression_translations(status, id);
CREATE UNIQUE INDEX IF NOT EXISTS expression_translations_one_pending
  ON expression_translations(student_id, expression_id) WHERE status = 'pending';
