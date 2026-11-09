import { BOOT } from "./runtime";
export function TeacherAccountProfile() {
  return (
    <section className="teacher-profile">
      <h2>Your teaching profile</h2>
      <p>{BOOT.site!.name}</p>
      <p>
        {BOOT.site!.language.variety || BOOT.site!.language.name} ·{" "}
        {BOOT.site!.place.timeZone}
      </p>
      <p>
        Your site, rules and payment choices are kept together in your Vowel
        dashboard.
      </p>
      <a
        className="button button--coral"
        href={`${BOOT.platformOrigin || ""}/dashboard/?site=${BOOT.siteId}`}
      >
        Open my Vowel dashboard
      </a>
    </section>
  );
}
