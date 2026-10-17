/**
 * Which side of the site an account opens on. A teacher's is her schedule; a
 * teacher Inês has also added as a student (17 October 2026, Dan) keeps the
 * schedule, and opens Your lessons only when the address asks for it, so
 * `Book a lesson` and a plain `/book/` still take them to the schedule.
 */
type Account = { role?: "student" | "teacher"; alsoStudent?: boolean } | null | undefined;

/** True for an account with lessons of its own: a student, or a teacher who is one too. */
export function hasStudentSide(account: Account): boolean {
  return Boolean(account && (account.role !== "teacher" || account.alsoStudent === true));
}

/** True when the booking page should hand this account on to the schedule. */
export function opensSchedule(account: Account, askedForLessons: boolean): boolean {
  return account?.role === "teacher" && !(account.alsoStudent === true && askedForLessons);
}
