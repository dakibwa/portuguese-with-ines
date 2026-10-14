import { ExpressionProblem, publishedExpression } from "./expressions.mjs";

/**
 * Expressions are Inês's alone until Dan opens them to students (14 October
 * 2026, Dan: "publish them but not for students just for ines currently").
 * Only EXPRESSIONS_FOR_STUDENTS = "1" opens them; anything else, or nothing,
 * keeps them closed.
 */
export const expressionsOpenToStudents = (env) => env.EXPRESSIONS_FOR_STUDENTS === "1";

/** What a student reads while expressions are closed: nothing to show, so Your lessons shows no card. */
export const closedExpressions = () => ({ expression: null, canPick: false, hasPublished: false, shuffleLabels: [] });

// The handler resolves studentId from the session. Clients never choose an
// expression ID, reset their history, or supply another student's identity.
export async function studentExpressions(db, studentId, requestId) {
  const [picked, { results: unseen }, available] = await Promise.all([
    db.prepare(`SELECT p.expression_id FROM expression_picks p
      JOIN expressions e ON e.id = p.expression_id AND e.published = 1
      WHERE p.student_id = ? ${requestId ? "AND p.request_id = ?" : ""}
      ORDER BY p.id DESC LIMIT 1`).bind(studentId, ...(requestId ? [requestId] : [])).first(),
    db.prepare(`SELECT e.expression FROM expressions e WHERE e.published = 1
      AND NOT EXISTS (SELECT 1 FROM expression_picks p WHERE p.student_id = ? AND p.expression_id = e.id)
      ORDER BY random() LIMIT 8`).bind(studentId).all(),
    db.prepare("SELECT EXISTS(SELECT 1 FROM expressions WHERE published = 1) AS available").first(),
  ]);
  return {
    expression: picked ? await publishedExpression(db, picked.expression_id) : null,
    canPick: unseen.length > 0,
    hasPublished: Boolean(available.available),
    shuffleLabels: unseen.map((row) => row.expression),
  };
}

export async function pickExpression(db, studentId, body) {
  if (Object.keys(body).some((key) => key !== "requestId") || typeof body.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) {
    throw new ExpressionProblem("Please try picking the expression again.");
  }
  // Selection and reservation are ONE SQLite write. Each student has a unique
  // expression constraint; a retried request returns its original reservation.
  // Concurrent requests cannot both consume the same expression.
  await db.prepare(`INSERT INTO expression_picks (student_id, expression_id, request_id, created_at)
    SELECT ?, e.id, ?, ? FROM expressions e WHERE e.published = 1
      AND NOT EXISTS (SELECT 1 FROM expression_picks p WHERE p.student_id = ? AND p.expression_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM expression_picks p WHERE p.student_id = ? AND p.request_id = ?)
    ORDER BY random() LIMIT 1`)
    .bind(studentId, body.requestId, new Date().toISOString(), studentId, studentId, body.requestId).run();
  return studentExpressions(db, studentId, body.requestId);
}
