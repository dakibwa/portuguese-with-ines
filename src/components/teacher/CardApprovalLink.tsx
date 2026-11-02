"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cardApprovalChoices, createCardApprovalLink, type AdminBooking, type CardApprovalLesson } from "@/lib/admin-api";
import { formatMoneyCents, formatShortDay, formatSlotTime } from "@/lib/booking-api";
import { readSession } from "@/lib/auth-api";

type Props = {
  booking: AdminBooking;
  token: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
};

/** The number WhatsApp needs, or "" to let her pick the chat: only an international number, or a Portuguese mobile. */
function whatsAppNumber(phone: string) {
  const compact = phone.replace(/[\s().-]/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact.slice(1);
  if (/^00\d{8,15}$/.test(compact)) return compact.slice(2);
  return /^9\d{8}$/.test(compact) ? `351${compact}` : "";
}

/** What she sends, short, in her voice; the page itself lists the lessons and the terms. */
export function cardApprovalMessage(firstName: string, lessons: CardApprovalLesson[], url: string) {
  const total = formatMoneyCents(lessons.reduce((sum, lesson) => sum + lesson.amountCents, 0));
  const what = lessons.length === 1 ? `your lesson on ${formatShortDay(lessons[0].startAt)} (${total})` : `${lessons.length} lessons (${total} in total)`;
  return `Olá ${firstName}! Here’s your link to pay by card for ${what}. It’s just for you:\n${url}`;
}

/**
 * A payment approval link from her lesson dialog (27 October 2026), now for
 * as many of the student's unpaid lessons as she ticks (2 November 2026,
 * Dan: "so they can backpay all the lessons"). The lesson she opened starts
 * ticked; the others only when she ticks them, since many past lessons were
 * paid to her by hand without being marked. Creating the link sends nothing
 * and charges nothing; she sends it on WhatsApp or copies it.
 */
export function CardApprovalLink({ booking, token, busy, onBusy, onError }: Props) {
  const firstName = booking.student_name.split(" ")[0];
  const [choices, setChoices] = useState<CardApprovalLesson[] | null>(null);
  const [ticked, setTicked] = useState<string[]>([booking.id]);
  const [link, setLink] = useState<{ url: string; lessons: CardApprovalLesson[] } | null>(null);
  const [copied, setCopied] = useState(false);
  // Its own press, as distinct from the dialog's other actions, names the wait.
  const [working, setWorking] = useState(false);
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
    const url = await run(() => createCardApprovalLink(token, booking.id, lessons.map(lesson => lesson.id)), "The link couldn’t be created.");
    if (url) setLink({ url, lessons: [...lessons].sort((a, b) => a.startAt.localeCompare(b.startAt)) });
  }

  async function start() {
    const lessons = await run(() => cardApprovalChoices(token, booking.id), "Their unpaid lessons couldn’t be loaded.");
    if (!lessons) return;
    // Nothing else unpaid: no list to tick, straight to the link.
    if (lessons.length === 1) await create(lessons);
    else setChoices(lessons);
  }

  if (link) {
    const total = formatMoneyCents(link.lessons.reduce((sum, lesson) => sum + lesson.amountCents, 0));
    const number = whatsAppNumber(booking.student_phone ?? "");
    const message = cardApprovalMessage(firstName, link.lessons, link.url);
    return (
      <div className="teacher-card-link">
        <p role="status">
          Link ready: {link.lessons.length === 1 ? "1 lesson" : `${link.lessons.length} lessons`}, {total}. {copied ? "Copied. " : ""}Nothing sent or charged yet.
        </p>
        <div className="teacher-card-link__actions">
          <a className="button button--blue button--compact" href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`} rel="noreferrer" target="_blank">
            Send on WhatsApp<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <button className="button button--outline button--compact" type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(link.url); setCopied(true); }
            catch { onError("The link couldn’t be copied. Please try again."); }
          }}>Copy link</button>
        </div>
      </div>
    );
  }

  if (choices) {
    const chosen = choices.filter(lesson => ticked.includes(lesson.id));
    const total = chosen.reduce((sum, lesson) => sum + lesson.amountCents, 0);
    return (
      <div className="teacher-card-link" role="group" aria-labelledby="teacher-card-link-heading">
        <p className="teacher-card-link__heading" id="teacher-card-link-heading">Which lessons should {firstName} pay for?</p>
        <p className="teacher-card-link__hint">Tick only lessons they haven’t paid you for.</p>
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
                  <span className="teacher-card-link__when">{formatShortDay(lesson.startAt)}, {formatSlotTime(lesson.startAt)}–{formatSlotTime(lesson.endAt)}</span>
                  <b>{formatMoneyCents(lesson.amountCents)}</b>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="teacher-card-link__total" aria-live="polite">
          {chosen.length === 1 ? "1 lesson" : `${chosen.length} lessons`}
          <b>{formatMoneyCents(total)}</b>
        </p>
        <div className="teacher-card-link__actions">
          <button className="button button--blue button--compact" type="button" disabled={busy || !chosen.length} onClick={() => void create(chosen)}>
            {working ? "Creating link…" : "Create link"}
          </button>
          <button className="button button--outline button--compact" type="button" disabled={busy} onClick={() => { setChoices(null); setTicked([booking.id]); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="teacher-card-link">
      <p>Let {firstName} pay by card for this lesson and any others you pick.</p>
      <button className="button button--blue button--compact" type="button" disabled={busy} onClick={() => void start()}>
        {working ? "Checking their lessons…" : "Create payment link"}
      </button>
    </div>
  );
}
