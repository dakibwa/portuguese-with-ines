import { BOOT } from "./runtime";
import { ruleSentences } from "../../workers/vowel/site-render.mjs";
export function TermsPrivacyInformation() {
  if (!BOOT.site) return null;
  return (
    <div className="policy-information">
      <h2>Booking and payments</h2>
      {ruleSentences(BOOT.site).map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
      <h2>Your teacher</h2>
      <p>
        Your lessons are supplied by {BOOT.site.name}. Contact your teacher
        through your lesson account for changes, questions or exceptional
        circumstances. Statutory rights are unaffected by the booking rules.
      </p>
      <h2>Privacy</h2>
      <p>
        Your tutor uses Vowel to manage your lessons, account and homework.
        Cloudflare hosts the service; Resend sends transactional email. Stripe
        handles card details when you choose card payments. Vowel does not store
        card numbers.
      </p>
      <p>
        Homework and marking may use an AI provider when your tutor enables it.
        Your tutor reviews drafts and suggested marks before sharing them with
        you. Ask your tutor about access, corrections, export or deletion of
        your teaching records.
      </p>
      <p>
        No advertising trackers are used. Browser storage keeps your sign-in and
        lesson workspace available.
      </p>
    </div>
  );
}
