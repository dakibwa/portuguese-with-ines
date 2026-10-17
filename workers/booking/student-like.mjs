/*
 * Who has lessons with Inês (17 October 2026, Dan): every student, and a
 * teacher she has also added as one (`also_student`, migration 0032). That
 * teacher keeps `role = 'teacher'` and stays an admin everywhere; this only
 * opens the student side to them. Emailed sign-in links, welcomes and the
 * held-email logic still ask for `role = 'student'`, since a teacher's way in
 * is their own.
 *
 * One definition, as SQL for a query and as a test for a row already read, so
 * the places that ask never drift apart. `alias` names the students table.
 */
export function studentLikeSql(alias = "") {
  const column = alias ? `${alias}.` : "";
  return `(${column}role = 'student' OR ${column}also_student = 1)`;
}

/** True for a student, or a teacher who is also one. */
export function isStudentLike(row) {
  return Boolean(row && (row.role === "student" || Number(row.also_student) === 1));
}
