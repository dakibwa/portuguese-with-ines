import { CONTACT_WHATSAPP_URL } from "@/lib/config";

export function PrivacyInformation() {
  return (
    <div className="policy-information">
      <p>
        Inês Dias Baía (Português com a Inês) is responsible for your information.
        {" "}<a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Message Inês on WhatsApp</a> with any privacy request.
      </p>
      <p>
        <strong>What we use.</strong> Your name, email, sign-in details, time zone and booking history are
        needed for your account, lessons and booking messages. Without these details, online booking cannot
        work. Your phone number and lesson notes are optional.
      </p>
      <p>
        <strong>Why and how long.</strong> We use this information to fulfil our agreement with you, meet
        financial record-keeping duties and protect the service from misuse or disputes (our legitimate
        interests). We keep it only as long as needed for those purposes.
      </p>
      <p>
        <strong>Service providers.</strong> Cloudflare hosts the site and records; Resend sends emails;
        Google handles optional sign-in; Stripe handles card payments. We never store full card details.
        Providers may process data outside the EEA, where safeguards are required. Ask Inês which safeguards
        apply. Browser storage supports sign-in, security and checkout; there is no advertising analytics.
      </p>
      <p>
        <strong>Your rights.</strong> You can request access, correction, deletion or transfer of your data,
        restrict its use or object. Some records must be kept by law. You can complain to Portugal’s data
        protection authority, the <a href="https://www.cnpd.pt/">CNPD</a>.
      </p>
    </div>
  );
}

export function BookingTermsInformation() {
  return (
    <div className="policy-information">
      <p>
        Lessons are with Inês Dias Baía. Your lesson, euro price and payment method are shown before
        confirmation. Times and deadlines use Porto time.
      </p>
      <p>
        <strong>Payment.</strong> When booking with a saved card, agreeing to these terms authorises Stripe
        to save your card and charge the displayed lesson price automatically when each booked lesson ends.
        Nothing is charged at booking. Complete any card setup to receive your confirmation. If your booking
        specifies payment directly to Inês, pay her on the lesson day.
      </p>
      <p>
        <strong>Changes.</strong> Move or cancel before the lesson starts: free until the day before,
        then €5 once per lesson. Moving keeps the lesson price due; cancelling removes it. No fee applies
        if Inês changes it. Saved-card fees are automatic; a recorded no-show costs €5 instead of the lesson
        price, plus any change fee. Prepaid bookings keep the rules in your calendar.
      </p>
      <p>
        <strong>Repeats.</strong> Each lesson is paid separately. Ongoing lessons repeat until you stop them
        in your calendar; stopping keeps any lesson booked for today.
      </p>
      <p>
        <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Message Inês on WhatsApp</a> about payments, refunds or other
        questions. Your legal rights are unaffected.
      </p>
    </div>
  );
}
