"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cardApprovalChoices, createCardApprovalLink, type AdminBooking, type AdminStudent, type CardApprovalLesson } from "@/lib/admin-api";
import { formatMoneyCents, formatShortDay, formatSlotTime } from "@/lib/booking-api";
import { readSession } from "@/lib/auth-api";

type Props = {
  token: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
  /** Inline on Students: its routine actions take the one quiet text style. */
  quiet?: boolean;
} & (
  /** From a lesson she opened, which starts ticked. */
  | { booking: AdminBooking; student?: never; onCancel?: never }
  /** From the student's card on Students: the list opens at once, nothing ticked, and Cancel closes it. */
  | { student: AdminStudent; onCancel: () => void; booking?: never }
);

/** The number WhatsApp needs, or "" to let her pick the chat: only an international number, or a Portuguese mobile. */
function whatsAppNumber(phone: string) {
  const compact = phone.replace(/[\s().-]/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact.slice(1);
  if (/^00\d{8,15}$/.test(compact)) return compact.slice(2);
  return /^9\d{8}$/.test(compact) ? `351${compact}` : "";
}

const sum = (lessons: CardApprovalLesson[]) => lessons.reduce((total, lesson) => total + lesson.amountCents, 0);

/** What she sends, short, in her voice; the page itself lists the lessons and the terms. */
export function cardApprovalMessage(firstName: string, lessons: CardApprovalLesson[], url: string) {
  const total = formatMoneyCents(sum(lessons));
  const what = lessons.length === 1 ? `your lesson on ${formatShortDay(lessons[0].startAt)} (${total})` : `${lessons.length} lessons (${total} in total)`;
  return `Olá ${firstName}! Here’s your link to pay by card for ${what}. It’s just for you:\n${url}`;
}

/**
 * A payment approval link (27 October 2026), for as many of the student's
 * unpaid lessons as she ticks (2 November 2026, Dan: "so they can backpay
 * all the lessons"), from a lesson she opened or from their card on
 * Students. Only the lesson she opened starts ticked, since many past
 * lessons were paid to her by hand without being marked. The list is one
 * line a lesson and its total is on the button (Dan: "less spread out").
 * Creating the link sends nothing and charges nothing; she sends it on
 * WhatsApp or copies it, and agreeing on it also puts their future lessons
 * on the card.
 */
export function CardApprovalLink({ booking, student, token, busy, onBusy, onError, onCancel, quiet }: Props) {
  const secondary = quiet ? "teacher-quiet" : "button button--outline button--small";
  const name = booking ? booking.student_name : student.name;
  const firstName = name.split(" ")[0];
  const phone = (booking ? booking.student_phone : student.phone) ?? "";
  const target = booking ? { bookingId: booking.id } : { studentId: student.id };
  const opened = booking ? [booking.id] : [];
  const [choices, setChoices] = useState<CardApprovalLesson[] | null>(null);
  const [ticked, setTicked] = useState<string[]>(opened);
  const [link, setLink] = useState<{ url: string; lessons: CardApprovalLesson[] } | null>(null);
  const [copied, setCopied] = useState(false);
  // Its own press, as distinct from the dialog's other actions, names the wait.
  const [working, setWorking] = useState(false);
  const headingId = useId();
  // On Students it fills its own panel, under that panel's heading.
  const box = `teacher-card-link${student ? " teacher-card-link--panel" : ""}`;
  const request = useRef(0);
  useLayoutEffect(() => () => { request.current += 1; }, []);

  async function run<T>(work: () => Promise<T>, fallback: string) {
    const current = ++request.current;
    onBusy(true);
    setWorking(true);
    onError("");
    try {
      const result = await work();
      return current === request.current && readSession() === token ? result : null;
    } catch (caught) {
      if (current === request.current && readSession() === token) onError(caught instanceof Error ? caught.message : fallback);
      return null;
    } finally {
      if (current === request.current) { onBusy(false); setWorking(false); }
    }
  }

  async function create(lessons: CardApprovalLesson[]) {
    const url = await run(() => createCardApprovalLink(token, target, lessons.map(lesson => lesson.id)), "The link couldn’t be created.");
    if (url) setLink({ url, lessons: [...lessons].sort((a, b) => a.startAt.localeCompare(b.startAt)) });
  }

  async function start() {
    const lessons = await run(() => cardApprovalChoices(token, target), "Their unpaid lessons couldn’t be loaded.");
    if (!lessons) return;
    // From a lesson with nothing else unpaid: no list to tick, straight to the link.
    if (booking && lessons.length === 1) await create(lessons);
    else setChoices(lessons);
  }

  // From Students she opened it to tick, so the list comes straight away.
  const studentId = student?.id;
  useEffect(() => {
    if (studentId) void start();
    // Once a student; start reads only what this render holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (link) {
    const total = formatMoneyCents(sum(link.lessons));
    const message = cardApprovalMessage(firstName, link.lessons, link.url);
    return (
      <div className={box}>
        <p role="status">
          Link ready: {link.lessons.length === 1 ? "1 lesson" : `${link.lessons.length} lessons`}, {total}. {copied ? "Copied. " : ""}Nothing sent or charged yet.
        </p>
        <div className="teacher-card-link__actions">
          <a className="button button--blue button--small" href={`https://wa.me/${whatsAppNumber(phone)}?text=${encodeURIComponent(message)}`} rel="noreferrer" target="_blank">
            Send on WhatsApp<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <button className={secondary} type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(link.url); setCopied(true); }
            catch { onError("The link couldn’t be copied. Please try again."); }
          }}>Copy link</button>
        </div>
      </div>
    );
  }

  if (choices && !choices.length) {
    return (
      <div className={box}>
        <p role="status">Nothing unpaid to add: {firstName}&rsquo;s past lessons are all paid or marked as paid.</p>
      </div>
    );
  }

  if (choices) {
    const chosen = choices.filter(lesson => ticked.includes(lesson.id));
    return (
      <div className={box} role="group" aria-labelledby={headingId}>
        {/* On Students the panel's own heading names it, so one line here. */}
        {student ? (
          <p className="teacher-card-link__hint"><span id={headingId}>Tick what {firstName} still owes</span>. Their future lessons then go on the card too.</p>
        ) : <>
          <p className="teacher-card-link__heading" id={headingId}>Tick what {firstName} still owes</p>
          <p className="teacher-card-link__hint">Their future lessons then go on the card too.</p>
        </>}
        <ul className="teacher-card-link__choices">
          {choices.map(lesson => {
            const checked = ticked.includes(lesson.id);
            return (
              <li key={lesson.id}>
                <button
                  aria-checked={checked}
                  className={`paid-tick teacher-card-link__choice${checked ? " is-checked" : ""}`}
                  disabled={busy}
                  role="checkbox"
                  type="button"
                  onClick={() => setTicked(current => checked ? current.filter(id => id !== lesson.id) : [...current, lesson.id])}
                >
                  <span aria-hidden="true" className="paid-tick__dab">{checked ? <Check size={13} strokeWidth={3.4} /> : null}</span>
                  <span className="teacher-card-link__when">{formatShortDay(lesson.startAt)}, {formatSlotTime(lesson.startAt)}</span>
                  <b>{formatMoneyCents(lesson.amountCents)}</b>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="teacher-card-link__actions">
          <button className="button button--blue button--small" type="button" disabled={busy || !chosen.length} onClick={() => void create(chosen)}>
            {working ? "Creating link…" : chosen.length ? `Create link for ${formatMoneyCents(sum(chosen))}` : "Create link"}
          </button>
          <button className={secondary} type="button" disabled={busy} onClick={() => {
            if (onCancel) onCancel();
            else { setChoices(null); setTicked(opened); }
          }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (student) return (
    <div className={box}>
      {working ? <p role="status">Checking their lessons…</p> : (
        <button className="button button--outline button--small" type="button" disabled={busy} onClick={() => void start()}>Try again</button>
      )}
    </div>
  );

  return (
    <div className={box}>
      <p>Let {firstName} pay by card for this and other unpaid lessons.</p>
      <button className={secondary} type="button" disabled={busy} onClick={() => void start()}>
        {working ? "Checking their lessons…" : "Create payment link"}
      </button>
    </div>
  );
}
