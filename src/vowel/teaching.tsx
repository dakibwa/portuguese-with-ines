import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingCalendar } from "../components/BookingCalendar";
import { TeacherSchedule } from "../components/TeacherSchedule";
import { ResetPassword } from "../components/ResetPassword";
import { storeSession, readSession, subscribeToSession } from "../lib/auth-api";
import { api, BOOT, tutorApi } from "./runtime";
import { SITE_BASE_PATH } from "./paths";
import { ruleSentences } from "../../workers/vowel/site-render.mjs";
import "../app/globals.css";
import "../app/schedule/teacher-schedule.css";
import "../app/homework.css";
import "./templates.css";
import "./teaching.css";

type Proposal = { id: string; name: string; amount_cents: number };
function PriceOffers() {
  const [offers, setOffers] = useState<Proposal[]>([]),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      const token = readSession();
      if (!token) {
        setOffers([]);
        return;
      }
      void tutorApi<{ proposals: Proposal[] }>(
        BOOT.siteId!,
        token,
        "/vowel/rate-proposals",
      )
        .then((value) => {
          if (active) setOffers(value.proposals);
        })
        .catch(() => {});
    };
    load();
    const unsubscribe = subscribeToSession(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return offers.length ? (
    <section className="vo-price-offers" aria-label="New lesson prices">
      <h2>A price for you to review.</h2>
      {offers.map((offer) => (
        <article key={offer.id}>
          <p>
            Your tutor offers {offer.name} at{" "}
            {new Intl.NumberFormat("en-GB", {
              style: "currency",
              currency: BOOT.site!.place.currency,
            }).format(offer.amount_cents / 100)}
            . Accepting applies this price to your future uncharged lessons of
            this type, including your weekly run.
          </p>
          <button
            type="button"
            onClick={() =>
              void tutorApi(
                BOOT.siteId!,
                readSession(),
                "/vowel/rate-proposals",
                { id: offer.id, accept: true },
              )
                .then(() => {
                  setOffers(offers.filter((o) => o.id !== offer.id));
                  setNotice(
                    "Your price is saved. Reload your lessons to see it.",
                  );
                })
                .catch((caught) => setNotice(caught.message))
            }
          >
            Accept this price
          </button>
          <button
            type="button"
            onClick={() =>
              void tutorApi(
                BOOT.siteId!,
                readSession(),
                "/vowel/rate-proposals",
                { id: offer.id, accept: false },
              )
                .then(() => setOffers(offers.filter((o) => o.id !== offer.id)))
                .catch((caught) => setNotice(caught.message))
            }
          >
            Keep my current price
          </button>
        </article>
      ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  ) : notice ? (
    <p role="status" className="vo-price-offers">
      {notice}
    </p>
  ) : null;
}
function App() {
  const teacher = BOOT.page === "schedule",
    [ready, setReady] = useState(!teacher),
    [payment, setPayment] = useState<"manual" | "card">(() =>
      BOOT.site?.rules.paymentMode === "card" ? "card" : "manual",
    );
  useEffect(() => {
    if (!teacher) return;
    let active = true;
    void api<{ token: string }>(`/sites/${BOOT.siteId}/teacher-session`, {})
      .then((value) => {
        if (active) storeSession(value.token);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [teacher]);
  useEffect(() => {
    window.vowelPaymentPreference = payment;
  }, [payment]);
  return (
    <div className={`vo-teaching t-${BOOT.site!.look.layout}`}>
      <header className="vo-teaching-header">
        <a href={`${SITE_BASE_PATH}/`}>{BOOT.tutor!.brand}</a>
        <nav aria-label="Lesson pages">
          <a href={`${SITE_BASE_PATH}/book/`}>Booking</a>
          <a href={`${SITE_BASE_PATH}/book/?view=lessons`}>Your lessons</a>
          {teacher && (
            <a href={`${BOOT.platformOrigin || ""}/dashboard/`}>
              Your Vowel dashboard
            </a>
          )}
        </nav>
      </header>
      <main>
        {teacher ? (
          ready ? (
            <TeacherSchedule />
          ) : (
            <p role="status">Opening your teaching page…</p>
          )
        ) : BOOT.page === "reset-password" ? (
          <ResetPassword />
        ) : (
          <>
            {BOOT.site?.rules.paymentMode === "both" && (
              <fieldset className="vo-payment-choice">
                <legend>How would you like to pay?</legend>
                <label>
                  <input
                    type="radio"
                    name="pay-by"
                    checked={payment === "manual"}
                    onChange={() => setPayment("manual")}
                  />{" "}
                  Pay my tutor directly
                </label>
                <label>
                  <input
                    type="radio"
                    name="pay-by"
                    checked={payment === "card"}
                    onChange={() => setPayment("card")}
                  />{" "}
                  Card after each lesson
                </label>
              </fieldset>
            )}
            <PriceOffers />
            <BookingCalendar
              cardPayments={payment === "card"}
              noShowText={ruleSentences(BOOT.site!)[2]}
              locations={[
                ...(BOOT.site!.rules.online ? ["online" as const] : []),
                ...(BOOT.site!.rules.inPerson ? ["porto" as const] : []),
              ]}
              initialManageToken={
                new URLSearchParams(window.location.search).get("manage") || ""
              }
              initialLessonsView={
                ["my-lessons", "booking"].includes(BOOT.page) ||
                new URLSearchParams(window.location.search).get("view") ===
                  "lessons"
              }
            />
          </>
        )}
      </main>
      <footer className="vo-teaching-footer">
        <a href={`${SITE_BASE_PATH}/terms/`}>Booking terms</a>
        <a href={`${SITE_BASE_PATH}/privacy/`}>Privacy</a>
        <span>
          Site by <a href={BOOT.platformOrigin || "/"}>Vowel</a>
        </span>
      </footer>
    </div>
  );
}
declare global {
  interface Window {
    vowelPaymentPreference?: "manual" | "card";
  }
}
const root = document.getElementById("vowel-teaching");
if (root && BOOT.site && BOOT.tutor) createRoot(root).render(<App />);
