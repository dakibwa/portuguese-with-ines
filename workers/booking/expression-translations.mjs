import { ExpressionProblem } from "./expressions.mjs";

/*
 * Students' own translations of an expression (30 October 2026, Dan, for
 * Inês). A student sends one; it waits for Inês, and only the ones she
 * approves are shown, to anyone reading the expression. The public list never
 * carries a student's name or id: only she sees who wrote what, while she
 * reviews.
 */
const problem = (message, status = 400) => { throw new ExpressionProblem(message, status); };
const LIMITS = { language: 40, text: 500 };
/** Submissions per student in any 24 hours, counted from the table itself. */
export const DAILY_TRANSLATIONS = 10;
const EXPRESSION_ID = /^[a-zA-Z0-9-]{1,100}$/;
const STATUSES = ["pending", "approved", "rejected"];
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export const translationsMissing = (error) => String(error).includes("no such table: expression_translations");

function field(body, key, label) {
  const value = body[key];
  if (typeof value !== "string" || (key === "language" ? /[\r\n\t]/.test(value) : false) || CONTROL.test(value)) problem(`Please write the ${label} as plain text.`);
  const trimmed = value.trim();
  if (!trimmed) problem(`Please add the ${label}.`);
  if (trimmed.length > LIMITS[key]) problem(`Please keep the ${label} to ${LIMITS[key]} characters.`);
  return trimmed;
}

/** Approved translations of a published expression, oldest first, with no word of who wrote them. */
export async function approvedTranslations(db, expressionId) {
  if (!EXPRESSION_ID.test(expressionId)) problem("That expression was not found.", 404);
  const expression = await db.prepare("SELECT id FROM expressions WHERE id = ? AND published = 1").bind(expressionId).first();
  if (!expression) problem("That expression was not found.", 404);
  const { results } = await db.prepare(`SELECT id, language, text, created_at AS createdAt FROM expression_translations
    WHERE expression_id = ? AND status = 'approved' ORDER BY id LIMIT 200`).bind(expressionId).all();
  return { translations: results };
}

/**
 * One write: the expression is published, the student is under their daily
 * limit and their session still stands, or nothing is saved. The unique index
 * keeps one translation waiting per student per expression.
 */
export async function submitTranslation(db, studentId, expressionId, body, authorization = null) {
  if (!EXPRESSION_ID.test(expressionId)) problem("That expression was not found.", 404);
  if (Object.keys(body).some((key) => !["language", "text"].includes(key))) problem("Please send just the language and your translation.");
  const language = field(body, "language", "language");
  const text = field(body, "text", "translation");
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  let result;
  try {
    result = await db.prepare(`INSERT INTO expression_translations (expression_id, student_id, language, text, status, created_at)
      SELECT e.id, ?, ?, ?, 'pending', ? FROM expressions e
      WHERE e.id = ? AND e.published = 1
        AND (SELECT COUNT(*) FROM expression_translations WHERE student_id = ? AND created_at > ?) < ?
        AND (${authorization?.sql ?? "1"})`)
      .bind(studentId, language, text, now.toISOString(), expressionId, studentId, since, DAILY_TRANSLATIONS, ...(authorization?.values ?? [])).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) problem("You’ve already sent a translation for this one. Inês will check it soon.", 409);
    throw error;
  }
  if (result.meta.changes) return { status: "pending" };
  // Nothing was written: say which condition stopped it.
  if (!await db.prepare("SELECT 1 AS found FROM expressions WHERE id = ? AND published = 1").bind(expressionId).first()) {
    problem("That expression was not found.", 404);
  }
  const { sent } = await db.prepare("SELECT COUNT(*) AS sent FROM expression_translations WHERE student_id = ? AND created_at > ?").bind(studentId, since).first();
  if (sent >= DAILY_TRANSLATIONS) problem("That’s plenty of translations for today. Thank you! Please send more tomorrow.", 429);
  problem("Please sign in again.", 401);
}

export async function pendingTranslationCount(db) {
  try {
    return (await db.prepare("SELECT COUNT(*) AS n FROM expression_translations WHERE status = 'pending'").first()).n;
  } catch (error) {
    // Before 0037 is applied, her collection still loads; there is nothing to check.
    if (translationsMissing(error)) return 0;
    throw error;
  }
}

/** Inês's review. The caller must pass through handleAdmin first. */
export async function translationsReview(db, method, path, url, authorization = null) {
  await authorization?.assert();
  if (path === "/admin/expression-translations" && method === "GET") {
    const status = url.searchParams.get("status") || "pending";
    if (!STATUSES.includes(status)) problem("Choose pending, approved or rejected.");
    const [{ results }, pendingCount] = await Promise.all([
      db.prepare(`SELECT t.id, t.expression_id AS expressionId, e.expression, t.language, t.text, t.status,
          t.created_at AS createdAt, t.reviewed_at AS reviewedAt, s.name AS studentName
        FROM expression_translations t
        JOIN expressions e ON e.id = t.expression_id
        JOIN students s ON s.id = t.student_id
        WHERE t.status = ? ORDER BY t.id ${status === "pending" ? "ASC" : "DESC"} LIMIT 200`).bind(status).all(),
      pendingTranslationCount(db),
    ]);
    return {
      translations: results.map(({ studentName, ...row }) => ({ ...row, studentFirstName: String(studentName ?? "").trim().split(/\s+/)[0] || "A student" })),
      pendingCount,
    };
  }
  const match = path.match(/^\/admin\/expression-translations\/(\d{1,12})(?:\/(approve|reject))?$/);
  if (!match) problem("Not found.", 404);
  const [, id, action] = match;
  let result;
  if (method === "POST" && action) {
    result = await db.prepare(`UPDATE expression_translations SET status = ?, reviewed_at = ? WHERE id = ? AND (${authorization?.sql ?? "1"})`)
      .bind(action === "approve" ? "approved" : "rejected", new Date().toISOString(), Number(id), ...(authorization?.values ?? [])).run();
  } else if (method === "DELETE" && !action) {
    result = await db.prepare(`DELETE FROM expression_translations WHERE id = ? AND (${authorization?.sql ?? "1"})`)
      .bind(Number(id), ...(authorization?.values ?? [])).run();
  } else problem("Not found.", 404);
  await authorization?.assert();
  if (!result.meta.changes) problem("That translation was not found. Reload the list.", 404);
  return { ok: true, pendingCount: await pendingTranslationCount(db) };
}
