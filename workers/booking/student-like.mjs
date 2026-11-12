import { NO_EMAIL_YET } from "./no-email.mjs";

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

/**
 * SQL true when the lesson `alias` names can be emailed to its student: a
 * real address, not the stand-in for one set up with no email yet, and not a
 * student Inês added who still waits for her welcome with no way in of their
 * own. Nothing reaches them before that welcome.
 */
export function studentEmailableSql(alias) {
  return `(${alias}.student_email NOT LIKE '${NO_EMAIL_YET}%'
    AND NOT EXISTS (SELECT 1 FROM students held WHERE held.email = lower(trim(${alias}.student_email))
      AND held.role = 'student' AND held.awaiting_welcome = 1 AND COALESCE(held.password_hash, '') = ''
      AND COALESCE(held.google_sub, '') = '' AND held.last_login_at IS NULL))`;
}
