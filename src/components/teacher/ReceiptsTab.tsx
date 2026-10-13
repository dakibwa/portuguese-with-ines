"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { fetchReceipts, type ReceiptLine } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { formatMoneyCents, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel } from "@/lib/teacher-calendar";

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
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
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
  return rows.map((row) => row.map(cell).join(",")).join("\n");
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
    const blob = new Blob([csv(lines)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `receipts-${month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="teacher-receipts" aria-labelledby="teacher-receipts-month">
      <div className="teacher-month-heading">
        <h3 id="teacher-receipts-month" aria-live="polite">{monthName}</h3>
        <div className="teacher-month-navigation">
          <button className="teacher-icon-button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} type="button"><ChevronLeft size={19} aria-hidden="true" /></button>
          {month !== thisMonth ? <button className="teacher-text-button" onClick={() => setMonth(thisMonth)} type="button">This month</button> : null}
          <button className="teacher-icon-button" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))} type="button"><ChevronRight size={19} aria-hidden="true" /></button>
        </div>
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
            <thead>
              <tr>
                <th scope="col">Lesson</th>
                <th scope="col">Student</th>
                <th scope="col">NIF</th>
                <th scope="col">For</th>
                <th scope="col">Amount</th>
                <th scope="col">Paid</th>
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
                  <td data-label="Amount">{line.amountCents === null ? "—" : formatMoneyCents(line.amountCents)}</td>
                  <td data-label="Paid"><span className={`teacher-receipts__state is-${line.ready ? "ready" : line.state}`}>{paidLabel(line)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
