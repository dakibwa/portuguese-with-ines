/*
 * A student Inês sets up from a name alone (13 October 2026, Dan) has no
 * address yet, and an account's email is its unique key and cannot be empty.
 * Theirs holds a placeholder no address can equal, and so do the lessons
 * she adds for them until she gives their real one (14 October 2026, Dan:
 * "ines should be able to add peoples lessons even if they don't have an
 * email").
 *
 * The placeholder is an internal key and nothing else. Anything that sends,
 * calendars, charges, exports or displays an address passes it through here,
 * so it can never leave the database: `isNoEmailYet` to decide whether there
 * is somewhere to send to, `realEmail` for what a reader or provider may see.
 */
export const NO_EMAIL_YET = "no-email:";

/** True for the placeholder (and only the placeholder). */
export function isNoEmailYet(address) {
  return String(address ?? "").trim().toLowerCase().startsWith(NO_EMAIL_YET);
}

/** The address itself, or "" while there is none yet. */
export function realEmail(address) {
  return isNoEmailYet(address) ? "" : String(address ?? "");
}

/** A booking as the browser or her automation may see it: no placeholder address. */
export function withRealEmail(row) {
  return row && "student_email" in row ? { ...row, student_email: realEmail(row.student_email) } : row;
}
