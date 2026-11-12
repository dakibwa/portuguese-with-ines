"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cardApprovalChoices, createCardApprovalLink, type AdminBooking, type CardApprovalLesson } from "@/lib/admin-api";
import { formatMoneyCents, formatShortDay, formatSlotTime } from "@/lib/booking-api";
import { readSession } from "@/lib/auth-api";

type Props = {
  token: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
  /** Inline on Students: its routine actions take the one small soft lilac button. */
  quiet?: boolean;
  /** The lesson she opened, which starts ticked. */
  booking: AdminBooking;
};

/**
 * The number WhatsApp's link wants, digits only, or "" to let her pick the
 * chat: only a whole international number (`+` or `00`) or a Portuguese
 * mobile, so a message never goes to a stranger. Anything else in the field,
 * an extension say, leaves it to her.
 */
export function whatsAppNumber(phone: string) {
  const compact = phone.replace(/[\s().-]/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact.slice(1);
  if (/^00\d{8,15}$/.test(compact)) return compact.slice(2);
  return /^9\d{8}$/.test(compact) ? `351${compact}` : "";
}

export const sum = (lessons: CardApprovalLesson[]) => lessons.reduce((total, lesson) => total + lesson.amountCents, 0);

/** The lessons she can tick for a link, one line each: day, time and amount. */
export function OwedLessonChoices({ choices, ticked, busy, onToggle }: { choices: CardApprovalLesson[]; ticked: string[]; busy: boolean; onToggle: (id: string) => void }) {
  return (
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
              onClick={() => onToggle(lesson.id)}
            >
              <span aria-hidden="true" className="paid-tick__dab">{checked ? <Check size={13} strokeWidth={3.4} /> : null}</span>
              <span className="teacher-card-link__when">{formatShortDay(lesson.startAt)}, {formatSlotTime(lesson.startAt)}</span>
              <b>{formatMoneyCents(lesson.amountCents)}</b>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** What she sends, short, in her voice; the page itself lists the lessons and the terms. */
export function cardApprovalMessage(firstName: string, lessons: CardApprovalLesson[], url: string) {
  const total = formatMoneyCents(sum(lessons));
  const what = lessons.length === 1 ? `your lesson on ${formatShortDay(lessons[0].startAt)} (${total})` : `${lessons.length} lessons (${total} in total)`;
  return `Olá ${firstName}! Here’s your link to pay by card for ${what}. It’s just for you:\n${url}`;
}

/**
 * A payment approval link (27 October 2026), for as many of the student's
 * unpaid lessons as she ticks (2 November 2026, Dan: "so they can backpay
 * all the lessons"), from a lesson she opened. Only that lesson starts ticked, since many past
 * lessons were paid to her by hand without being marked. The list is one
 * line a lesson and its total is on the button (Dan: "less spread out").
 * Creating the link sends nothing and charges nothing; she sends it on
 * WhatsApp or copies it, and agreeing on it also puts their future lessons
 * on the card.
 */
export function CardApprovalLink({ booking, token, busy, onBusy, onError, quiet }: Props) {
  const secondary = quiet ? "teacher-quiet" : "button button--outline button--small";
  const firstName = booking.student_name.split(" ")[0];
  const phone = booking.student_phone ?? "";
  const target = { bookingId: booking.id };
  const opened = [booking.id];
  const [choices, setChoices] = useState<CardApprovalLesson[] | null>(null);
  const [ticked, setTicked] = useState<string[]>(opened);
  const [link, setLink] = useState<{ url: string; lessons: CardApprovalLesson[] } | null>(null);
  const [copied, setCopied] = useState(false);
  // Its own press, as distinct from the dialog's other actions, names the wait.
  const [working, setWorking] = useState(false);
  const headingId = useId();
  const box = "teacher-card-link";
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
    if (lessons.length === 1) await create(lessons);
    else setChoices(lessons);
  }

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
        <p className="teacher-card-link__heading" id={headingId}>Tick what {firstName} still owes</p>
        <p className="teacher-card-link__hint">Their future lessons then go on the card too.</p>
        <OwedLessonChoices busy={busy} choices={choices} ticked={ticked}
          onToggle={id => setTicked(current => current.includes(id) ? current.filter(other => other !== id) : [...current, id])} />
        <div className="teacher-card-link__actions">
          <button className="button button--blue button--small" type="button" disabled={busy || !chosen.length} onClick={() => void create(chosen)}>
            {working ? "Creating link…" : chosen.length ? `Create link for ${formatMoneyCents(sum(chosen))}` : "Create link"}
          </button>
          <button className={secondary} type="button" disabled={busy} onClick={() => { setChoices(null); setTicked(opened); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // The button joins the lesson's other actions as their quiet chip, inline
  // and in the timetable's dialog alike; its sentence stays for assistive
  // technology rather than as a footer.
  return (
    <div className={`${box} teacher-card-link--trigger`}>
      <p className="visually-hidden" id={headingId}>Let {firstName} pay by card for this and other unpaid lessons.</p>
      <button aria-describedby={headingId} className="teacher-quiet" type="button" disabled={busy} onClick={() => void start()}>
        {working ? "Checking their lessons…" : "Create payment link"}
      </button>
    </div>
  );
}
