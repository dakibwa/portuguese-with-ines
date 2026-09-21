import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { CONTACT_WHATSAPP_URL, SAME_DAY_RESCHEDULE_FEE_CENTS, formatMoney } from "@/lib/config";
import { trialLesson } from "@/lib/lesson-products";

export const metadata: Metadata = pageMetadata({
  title: "FAQ | Português com a Inês",
  description: "Answers for anyone nervous about speaking, plus levels, booking, payment and changing a lesson.",
  path: "/faq/"
});

const sameDayFee = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);

const changeBookingInstructions =
  "Use the link in your confirmation email to change or cancel your booking.";

const faqSections = [
  {
    id: "nerves",
    title: "Feeling nervous",
    questions: [
      {
        question: "I’m nervous about speaking. Is that normal?",
        answer:
          "Yes, it’s very common to feel nervous when speaking a new language. We’ll take our time and go at a pace that feels comfortable for you."
      },
      {
        question: "What if I freeze and can’t say anything?",
        answer:
          "That’s okay. I’ll help you find the words, and we’ll take it one step at a time. There’s no rush."
      },
      {
        question: "What if I make a lot of mistakes?",
        answer:
          "Mistakes are a normal part of learning. I’ll help you with corrections while giving you space to speak and build confidence."
      },
      {
        question: "I’ve tried before and gave up. Will this be different?",
        answer:
          "We can talk about what was difficult before and find a way of learning that suits you. You’ll have someone to practise with, ask questions and guide you along the way."
      }
    ]
  },
  {
    id: "lessons",
    title: "In the lesson",
    questions: [
      {
        question: "What happens in a lesson?",
        answer:
          "We practise speaking Portuguese through conversation. You can bring a topic or question, or I’ll have something ready. I’ll help with vocabulary, pronunciation and grammar as we go."
      },
      {
        question: "What if we run out of things to talk about?",
        answer:
          "I’ll have topics and activities ready, so you don’t need to worry about keeping the conversation going."
      },
      {
        question: "Will you speak only Portuguese? I won’t understand.",
        answer:
          "We can use English whenever you need it and gradually use more Portuguese as you feel ready."
      },
      {
        question: "Do I need to prepare anything?",
        answer:
          "No preparation is needed. You’re welcome to bring a question or something you’d like to practise."
      },
      {
        question: "Is there homework?",
        answer:
          "Only if you’d like it. I can suggest something to practise between lessons, but it’s fine if you don’t have time."
      }
    ]
  },
  {
    id: "levels",
    title: "Level and language",
    questions: [
      {
        question: "What level do I need to be?",
        answer:
          "All levels are welcome, including complete beginners. We’ll start with what you know and what you’d like to learn."
      },
      {
        question: "Am I too old to start?",
        answer:
          "No, you’re welcome to start at any age. We’ll work at your pace and focus on what you’d like to use Portuguese for."
      },
      {
        question: "How long until I can hold a conversation?",
        answer:
          "It depends on your starting point and how much you practise. We’ll begin with simple conversations and build from there."
      },
      {
        question: "Can I use the Portuguese I already know?",
        answer:
          "Of course. Whatever variety you’ve learned, we’ll build on it and work on the pronunciation, vocabulary and conversations that help you most."
      },
      {
        question: "Can explanations be in English?",
        answer:
          "Yes. I can explain things in English, Portuguese or a mix of both, whichever helps you most."
      }
    ]
  },
  {
    id: "location",
    title: "Online or in Porto",
    questions: [
      {
        question: "Where do lessons take place?",
        answer:
          "Online or in person in Porto. You choose when you book."
      },
      {
        question: "What do I need for an online lesson?",
        answer:
          "You’ll need an internet connection and a phone, tablet or computer with a camera and microphone. I’ll send you a Google Meet link to join. Headphones can help you hear more clearly."
      },
      {
        question: "Do online lessons work as well as in person?",
        answer:
          "Online lessons offer the same personal attention and speaking practice. Choose whichever feels more comfortable and convenient for you."
      }
    ]
  },
  {
    id: "booking",
    title: "Booking",
    questions: [
      {
        question: "How do I book a lesson?",
        answer:
          "Go to the booking page, choose a lesson and a time, then add your details. You can review everything before confirming."
      },
      {
        question: "What happens after I book?",
        answer:
          "You’ll receive an email with your lesson details, an invitation to add it to your calendar, and a link to change or cancel your booking."
      },
      {
        question: "Do I have to commit to a block of lessons?",
        answer:
          "No. You can book one lesson or keep the same time each week. There’s no block of lessons to pay for in advance."
      }
    ]
  },
  {
    id: "payment",
    title: "Payment",
    questions: [
      {
        question: "How do I pay?",
        answer:
          "You’ll see the payment arrangements when you book. You may be asked to pay me on the day or securely save a card for payment after your lesson. Saving your card doesn’t charge it."
      },
      {
        question: "How much does a lesson cost?",
        answer:
          "You can find prices on the lessons page. You’ll also see the price when you book, before you confirm."
      },
      {
        question: "What happens if I don’t want to continue my lessons?",
        answer: `That’s completely fine. The trial costs ${trialLesson.price}, and there’s no obligation to book another lesson.`
      }
    ]
  },
  {
    id: "rescheduling",
    title: "Changing a lesson",
    questions: [
      {
        question: "Can I change my lesson time?",
        answer: `Yes. ${changeBookingInstructions} Choose another available time. Changes are free until the day before your lesson. On the day, there’s a ${sameDayFee} fee, using Porto time.`
      },
      {
        question: `When does the ${sameDayFee} fee apply?`,
        answer:
          `There’s a ${sameDayFee} fee if you change or cancel on the day of your lesson, using Porto time. You only pay this change fee once per lesson. If you later miss the lesson without cancelling, the ${sameDayFee} missed-lesson fee is separate. Fees are charged automatically if you have a saved card.`
      },
      {
        question: "Can I cancel?",
        answer: `Yes. ${changeBookingInstructions} It’s free until the day before your lesson. On the day, there’s a ${sameDayFee} fee, using Porto time.`
      },
      {
        question: "What if I don’t turn up?",
        answer: `If you miss your lesson without cancelling, there’s a ${sameDayFee} fee.`,
      },
      {
        question: "What if I need to stop for a while?",
        answer:
          "You can stop your regular lessons from your calendar and choose which future bookings to keep or cancel. If you have a lesson today, it stays booked unless you cancel it separately. You’re welcome to book again whenever you’re ready."
      }
    ]
  }
];

export default function FAQPage() {
  return (
    <>
      <SiteHeader currentPage="faq" />

      <main className="faq-page" id="main-content">
        <section className="faq-hero" aria-labelledby="faq-title">
          <h1 id="faq-title">Questions<br />before booking?</h1>
          <AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-hero__mark" priority />
        </section>

        <section className="faq-reference" aria-label="Frequently asked questions">
          <nav className="faq-index" aria-label="FAQ categories">
            <p className="eyebrow">Index</p>
            <ol>
              {faqSections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#faq-${section.id}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
            <AssetMark asset="/visuals/v2-splats/faq-answers-splat-v2.svg" className="faq-index__answer-index" />
          </nav>

          <div className="faq-groups">
            {faqSections.map((section, sectionIndex) => (
              <section className="faq-group" id={`faq-${section.id}`} key={section.id}>
                <header className="faq-group__header">
                  <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                  <h2>{section.title}</h2>
                </header>
                {section.questions.map((item, questionIndex) => (
                  <details
                    className="faq-row"
                    key={item.question}
                    open={sectionIndex === 0 && questionIndex === 0}
                  >
                    <summary>
                      <span>{item.question}</span>
                      <span className="faq-row__symbol" aria-hidden="true" />
                    </summary>
                    <div className="faq-row__answer">
                      <p>{item.answer}</p>
                    </div>
                  </details>
                ))}
              </section>
            ))}
          </div>
        </section>

        <section className="faq-contact">
          <p className="eyebrow">Not sure yet?</p>
          <h2>Ask me before you book.</h2>
          <div className="faq-contact__actions">
            <a className="button button--coral" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
              Message on WhatsApp
            </a>
            <Link className="text-action faq-contact__book" href="/book/?view=book">
              Go to booking
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
