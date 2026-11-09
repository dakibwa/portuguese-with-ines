import { useEffect, useState } from "react";
import { BOOT, tutorApi } from "./runtime";
import { readSession } from "../lib/auth-api";
type Payment = {
  id: string;
  reference: string;
  student: string;
  startsAt: string;
  amountCents: number;
  method: string;
  status: string;
};
export function ReceiptsTab() {
  const [lessons, setLessons] = useState<Payment[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void tutorApi<{ lessons: Payment[] }>(
      BOOT.siteId!,
      readSession(),
      "/vowel/payment-summary",
    )
      .then((value) => {
        if (active) setLessons(value.lessons);
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="teacher-receipts">
      <h2>Lesson payments</h2>
      <p>
        What was paid, how, and what still needs attention. Your Stripe
        dashboard holds card receipts and payouts.
      </p>
      {error && <p role="alert">{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="vo-payment-summary">
          <thead>
            <tr>
              <th>Student and lesson</th>
              <th>Amount</th>
              <th>How</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => (
              <tr key={lesson.id}>
                <td>
                  {lesson.student}
                  <small>
                    {new Date(lesson.startsAt).toLocaleDateString("en-GB", {
                      timeZone: BOOT.site!.place.timeZone,
                    })}{" "}
                    · {lesson.reference}
                  </small>
                </td>
                <td>
                  {lesson.amountCents === null
                    ? "—"
                    : new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: BOOT.site!.place.currency,
                      }).format(lesson.amountCents / 100)}
                </td>
                <td>{lesson.method === "card" ? "Card" : "Direct payment"}</td>
                <td>{lesson.status.replaceAll("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
