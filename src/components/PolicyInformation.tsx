import { CONTACT_WHATSAPP_NUMBER, CONTACT_WHATSAPP_URL, NOTICE_HOURS, SAME_DAY_FEE_LABEL } from "@/lib/config";

export function TermsPrivacyInformation() {
  return (
    <div className="policy-information">
      <h2>Booking</h2>
      <p>Book at least {NOTICE_HOURS} hours ahead. Choose your lessons and check the price before confirming.</p>

      <h2>Payments</h2>
      <ul>
        <li>No payment is taken when you book.</li>
        <li><strong>Automatic payment.</strong> Securely save a card to confirm your booking. Stripe charges it after each lesson and collects any fees automatically.</li>
        <li>Each recurring lesson is paid separately. Prepaid bookings follow the rules shown in your calendar.</li>
      </ul>

      <h2>Changes</h2>
      <p>Move or cancel in your calendar before the lesson starts.</p>
      <ul>
        <li><strong>{NOTICE_HOURS} hours or more before:</strong> free.</li>
        <li><strong>Less than {NOTICE_HOURS} hours before:</strong> {SAME_DAY_FEE_LABEL} once per lesson.</li>
        <li>You still pay for a moved lesson. Cancelling removes the lesson charge.</li>
        <li><strong>No-show:</strong> {SAME_DAY_FEE_LABEL} instead of the lesson price if recorded by Inês. Any earlier {SAME_DAY_FEE_LABEL} change fee still applies.</li>
        <li>If Inês moves or cancels, there is no change fee.</li>
      </ul>
      <p>
        Ongoing lessons repeat until you stop them in your calendar. Any lesson less than {NOTICE_HOURS} hours away stays booked.
      </p>

      <h2>Your rights</h2>
      <p>
        After booking online, you have 14 days to cancel the contract, or longer where the law requires.
        Email Inês your name and booking reference; she handles these requests personally.
      </p>
      <p>
        Where this legal right applies, there is no {SAME_DAY_FEE_LABEL} cancellation fee. Any refund you are legally owed
        is due within 14 days of your notice.
      </p>
      <p>
        Your legal rights still apply. <a href="https://cicap.pt/">CICAP, Porto’s consumer arbitration centre</a>, can help with eligible consumer disputes.
      </p>
      <p>
        <strong>Your teacher.</strong> Inês Dias Baía, sole trader trading as Português com a Inês. NIF 248899945.
        Contact address: Época, Rua do Rosário, 22, Porto, Portugal.
      </p>
      <p>
        <strong>Contact.</strong> <a href="mailto:aprenderportugues.ines@gmail.com">aprenderportugues.ines@gmail.com</a> or
        {" "}<a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">{CONTACT_WHATSAPP_NUMBER} (WhatsApp)</a> for
        bookings, payments, refunds, complaints or privacy requests.
      </p>

      <h2>Privacy</h2>
      <p>
        Inês is responsible for your personal information. Agreeing to this notice does not give permission
        for marketing or optional data use.
      </p>
      <ul>
        <li><strong>What we need.</strong> Online booking needs your name, email, sign-in details, time zone and booking history for your account, lessons and booking messages. Your phone number, notes and NIF are optional. If you give a NIF, it goes on the receipts Inês issues through Portal das Finanças.</li>
        <li><strong>Why.</strong> To provide lessons under our contract, meet financial record-keeping laws and prevent misuse or handle disputes (our legitimate interests).</li>
        <li><strong>How long.</strong> Account and booking records stay until you ask Inês to close your account or delete them. Financial records normally stay for 10 years under Portuguese tax law. Records needed for unpaid fees or disputes may stay until resolved. These duties can limit deletion.</li>
        <li><strong>Who helps us.</strong> Cloudflare hosts the site and records; Resend sends emails; Google handles optional sign-in, email and online lesson meetings; Stripe handles payments. We never store full card details.</li>
        <li><strong>Browser storage.</strong> Used for sign-in, security and checkout. No advertising analytics.</li>
        <li>
          <strong>Data abroad.</strong> Providers may handle data outside the European Economic Area (EEA), including the US.
          Their terms explain EU adequacy decisions (including the EU–US Data Privacy Framework) and EU standard
          contractual clauses where applicable. Read the safeguards: <a href="https://www.cloudflare.com/cloudflare-customer-dpa/">Cloudflare</a>,
          {" "}<a href="https://resend.com/legal/dpa">Resend</a>, <a href="https://policies.google.com/privacy/frameworks?hl=en">Google</a> and
          {" "}<a href="https://stripe.com/privacy">Stripe</a>. Ask Inês for copies.
        </li>
        <li><strong>Your data rights.</strong> Contact Inês to access, correct, delete or transfer your data, limit its use or object to it. You can also complain to <a href="https://www.cnpd.pt/">CNPD</a>, Portugal’s data protection authority.</li>
      </ul>
    </div>
  );
}
