"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { fetchReceipts, type ReceiptLine } from "@/lib/admin-api";
import { TeacherPager } from "@/components/teacher/TeacherPager";
import { readSession } from "@/lib/auth-api";
import { formatMoneyCents, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";
import { csvCell } from "@/lib/csv";

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

const STATE_LABEL: Record<ReceiptLine["state"], string> = {
  paid: "Paid",
  refunded: "Refunded",
  due: "Payment due",
  charging: "Being charged",
};

function paidLabel(line: ReceiptLine) {
  if (line.state !== "paid") return STATE_LABEL[line.state];
  return line.method === "by hand" ? "Paid by hand" : "Paid by card";
}

/** One row per amount, in the order her automation can issue them. */
function csv(lines: ReceiptLine[]) {
  const rows = [
    ["id", "lesson_date", "lesson_time", "student", "email", "nif", "item", "amount_eur", "paid", "ready", "stripe_payment"],
    ...lines.map((line) => [
      line.id,
      dateKey(new Date(line.lessonStartsAt)),
      formatSlotTime(line.lessonStartsAt),
      line.studentName,
      line.studentEmail,
      line.nif || "consumidor final",
      line.label,
      line.amountCents === null ? "" : (line.amountCents / 100).toFixed(2),
      paidLabel(line),
      line.ready ? "yes" : "no",
      line.stripePaymentIntent,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

/**
 * Her receipts, a month at a time (13 October 2026, Dan: "create something
 * that makes her automation as easy as possible"): every amount paid or still
 * to be paid for that month's lessons, with the NIF to issue to. Her
 * automation can read the same lines from the Worker, or this table, or the
 * CSV; each line carries a stable id.
 */
export function ReceiptsTab({ token, today }: { token: string; today: string }) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<{ month: string; receipts: ReceiptLine[] } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const monthTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    fetchReceipts(token, month)
      .then((result) => { if (active && readSession() === token) setData(result); })
      .catch((caught) => {
        if (active && readSession() === token) setError(caught instanceof Error ? caught.message : "Receipts couldn’t be loaded.");
      });
    return () => { active = false; };
  }, [token, month, attempt]);

  const lines = data?.month === month ? data.receipts : [];
  const ready = lines.filter((line) => line.ready);
  const waiting = lines.filter((line) => !line.ready && line.state !== "refunded");
  const total = ready.reduce((sum, line) => sum + (line.amountCents ?? 0), 0);
  const monthName = dateLabel(`${month}-01`, { month: "long", year: "numeric" });

  function download() {
    // The byte-order mark tells Excel it is UTF-8, so "João" doesn't come out garbled.
    const blob = new Blob(["\uFEFF", csv(lines)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `receipts-${month}.csv`;
    const href = link.href;
    link.click();
    // Revoking in the same tick can cancel the download in Safari and Firefox.
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <section className="teacher-receipts" aria-labelledby="teacher-receipts-month">
      <h2 className="visually-hidden">Receipts</h2>
      <div className="teacher-month-heading">
        <h3 id="teacher-receipts-month" aria-live="polite" ref={monthTitleRef} tabIndex={-1}>{monthName}</h3>
        <TeacherPager
          unit="month"
          away={month !== thisMonth}
          headingRef={monthTitleRef}
          onCurrent={() => setMonth(thisMonth)}
          onNext={() => setMonth(shiftMonth(month, 1))}
          onPrevious={() => setMonth(shiftMonth(month, -1))}
          nextDisabled={month >= thisMonth}
        />
      </div>

      {error ? (
        <div className="teacher-inline-error" role="alert">
          <p>{error}</p>
          <button className="teacher-text-button" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button>
        </div>
      ) : !data ? (
        <p className="teacher-receipts__lead" role="status">Loading receipts…</p>
      ) : !lines.length ? (
        <p className="teacher-receipts__lead">Nothing paid or due for {monthName} yet.</p>
      ) : (
        <>
          <div className="teacher-receipts__summary">
            <ul className="booking-payment-facts">
              <li><strong>{ready.length} {ready.length === 1 ? "receipt" : "receipts"} to issue</strong> · {formatMoneyCents(total)}</li>
              {waiting.length ? <li>{waiting.length} still to be paid</li> : null}
            </ul>
            <button className="button button--lilac button--compact" onClick={download} type="button">
              <Download size={15} aria-hidden="true" />
              Download CSV
            </button>
          </div>
          {/* A plain table, one row per amount, so her automation can read
              it as well as she can; every row carries its id and figures. */}
          <table className="teacher-receipts__table">
            <caption className="visually-hidden">Receipts for {monthName}</caption>
            <thead>
              <tr>
                <th scope="col">Lesson</th>
                <th scope="col">Student</th>
                <th scope="col">NIF</th>
                <th scope="col">For</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  className={line.ready ? "is-ready" : ""}
                  data-amount-cents={line.amountCents ?? ""}
                  data-nif={line.nif}
                  data-ready={line.ready ? "true" : "false"}
                  data-receipt-id={line.id}
                  key={line.id}
                >
                  <td data-label="Lesson">
                    {dateLabel(dateKey(new Date(line.lessonStartsAt)), { weekday: "short", day: "numeric", month: "short" })}
                    <span>, {formatSlotTime(line.lessonStartsAt)}</span>
                  </td>
                  <td data-label="Student">{line.studentName}</td>
                  <td data-label="NIF">{line.nif || "Consumidor final"}</td>
                  <td data-label="For">{line.label}</td>
                  <td data-label="Amount">{line.amountCents === null ? "Not set yet" : formatMoneyCents(line.amountCents)}</td>
                  <td data-label="Status"><span className={`teacher-receipts__state is-${line.ready ? "ready" : line.state}`}>{paidLabel(line)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
