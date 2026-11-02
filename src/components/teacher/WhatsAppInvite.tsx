"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { firstName } from "@/components/teacher/DormantEmail";
import { cardApprovalChoices, createCardApprovalLink, createInviteLink, type AdminStudent, type CardApprovalLesson } from "@/lib/admin-api";
import { formatMoneyCents, formatShortDay, formatSlotTime } from "@/lib/booking-api";
import type { StudentProgress } from "@/lib/teacher-calendar";

/**
 * The number WhatsApp's link wants: international, digits only. A number she
 * wrote with `+` or `00`, or a Portuguese mobile, is certain; anything else
 * opens WhatsApp on its own chooser, so a message never goes to a stranger.
 */
export function whatsAppNumber(phone: string) {
  const written = phone.trim();
  const digits = written.replace(/\D/g, "");
  if (written.startsWith("+")) return digits.length >= 8 ? digits : "";
  if (digits.startsWith("00")) return digits.length >= 10 ? digits.slice(2) : "";
  if (/^9\d{8}$/.test(digits)) return `351${digits}`;
  return "";
}

const sum = (lessons: CardApprovalLesson[]) => lessons.reduce((total, lesson) => total + lesson.amountCents, 0);

/**
 * Her words to them, hers to change before it goes, and short (2 November
 * 2026, Dan: "quite wordy"). Someone not yet in hears what changes: from now
 * on they book, move and cancel themselves (Dan: "we want to clear up admin
 * burden"); lessons she ticked are named by their total. Someone already in
 * is asked only for what is missing. The welcome screen the link opens
 * teaches the rest, and the link goes at the end on its own.
 */
export function inviteMessage(student: AdminStudent, progress?: Pick<StudentProgress, "card">, lessons: CardApprovalLesson[] = []) {
  const first = firstName(student);
  const total = formatMoneyCents(sum(lessons));
  const owed = lessons.length === 1 ? `your lesson on ${formatShortDay(lessons[0].startAt)} (${total})` : `the ${lessons.length} lessons still open (${total})`;
  if (student.dormant) return `Olá ${first}! Whenever you’d like another lesson, you can book one here:`;
  if (!student.signedIn) return lessons.length
    ? `Olá ${first}! From now on you can book, move or cancel your lessons with me here, and pay for ${owed}:`
    : `Olá ${first}! From now on you can book, move or cancel your lessons with me here:`;
  if (lessons.length) return `Olá ${first}! Here’s your link to pay by card for ${owed}:`;
  return progress?.card === false ? `Olá ${first}! Here’s your link to add a card for your lessons:` : `Olá ${first}! Here’s your link to sign in:`;
}

/**
 * The one way in she sends herself (2 November 2026, Dan: most of her
 * students never gave an email, and one WhatsApp per student should clear
 * what they owe and move them onto booking themselves). With lessons still
 * open she first ticks what they owe, nothing ticked to start, since many
 * past lessons were paid in cash and never marked; the link then signs them
 * in straight to paying those, and their card covers what comes after.
 * Nothing is sent until she presses Send in WhatsApp itself, and nothing is
 * charged until they agree. Copy takes the same words and link for anywhere
 * else; a student with an address can have their welcome email instead.
 */
export function WhatsAppInvite({ student, token, progress, sending, onBusy, onEmail, onLink }: {
  student: AdminStudent;
  token: string;
  progress: StudentProgress;
  /** The student whose welcome email is on its way. */
  sending?: string;
  onBusy?: (busy: boolean) => void;
  /** Their welcome email, in place of WhatsApp, for someone with an address. */
  onEmail?: () => void;
  /** A link was made, so their card can say it went once this closes. */
  onLink?: () => void;
}) {
  const first = firstName(student);
  const asksOwed = progress.openLessons > 0;
  const [choices, setChoices] = useState<CardApprovalLesson[] | null>(asksOwed ? null : []);
  const [ticked, setTicked] = useState<string[]>([]);
  const [link, setLink] = useState<{ url: string; lessons: CardApprovalLesson[] } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  async function run<T>(work: () => Promise<T>, fallback: string) {
    setBusy(true);
    onBusy?.(true);
    setProblem("");
    try {
      return await work();
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : fallback);
      return null;
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  async function make(lessons: CardApprovalLesson[]) {
    const url = await run(() => lessons.length
      ? createCardApprovalLink(token, { studentId: student.id }, lessons.map(lesson => lesson.id))
      : createInviteLink(token, student.id), "The link couldn’t be made. Please try again.");
    if (!url) return;
    const ordered = [...lessons].sort((a, b) => a.startAt.localeCompare(b.startAt));
    setLink({ url, lessons: ordered });
    setMessage(inviteMessage(student, progress, ordered));
    onLink?.();
  }

  async function load() {
    const lessons = await run(() => cardApprovalChoices(token, { studentId: student.id }), "Their unpaid lessons couldn’t be loaded.");
    if (!lessons) return;
    setChoices(lessons);
    if (!lessons.length) await make([]);
  }

  // Once per opening, even where React runs effects twice: with nothing open
  // the link is made at once, otherwise the lessons to tick come first.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (asksOwed ? load() : make([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = link ? `${message.trim()}\n${link.url}` : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setProblem("It couldn’t be copied. Select the message and copy it instead.");
    }
  }

  const error = problem ? <p className="teacher-inline-error" role="alert">{problem}</p> : null;

  if (!link && choices?.length) {
    const chosen = choices.filter(lesson => ticked.includes(lesson.id));
    return <div className="teacher-card-link teacher-card-link--panel teacher-invite__owed" role="group" aria-labelledby={`invite-owed-${student.id}`}>
      <p className="teacher-card-link__hint"><span id={`invite-owed-${student.id}`}>Tick what {first} still owes</span>. Leave any paid in cash.</p>
      <ul className="teacher-card-link__choices">
        {choices.map(lesson => {
          const checked = ticked.includes(lesson.id);
          return <li key={lesson.id}>
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
          </li>;
        })}
      </ul>
      {error}
      <div className="teacher-card-link__actions">
        <button className="button button--coral button--small" disabled={busy} onClick={() => void make(chosen)} type="button">
          {busy ? "Making their link…" : chosen.length ? `Make link with ${formatMoneyCents(sum(chosen))} to pay` : "Make link, nothing to pay"}
        </button>
      </div>
    </div>;
  }

  if (!link) return problem ? <div className="teacher-inline-error" role="alert">
    <p>{problem}</p>
    <button className="button button--outline button--small" disabled={busy} onClick={() => void (choices === null ? load() : make([]))} type="button">Try again</button>
  </div> : <p className="teacher-invite__making" role="status">{choices === null ? "Checking their lessons…" : "Making their link…"}</p>;

  const number = whatsAppNumber(student.phone ?? "");
  return <div className="teacher-form teacher-invite">
    {link.lessons.length ? <p className="teacher-invite__owes" role="status">
      <Check size={15} aria-hidden="true" />Asks them to pay {formatMoneyCents(sum(link.lessons))} for {link.lessons.length === 1 ? "1 lesson" : `${link.lessons.length} lessons`}. Nothing is charged until they agree.
    </p> : null}
    <label>
      <span>Message</span>
      <textarea maxLength={1000} onChange={event => { setCopied(false); setMessage(event.target.value); }} rows={2} value={message} />
    </label>
    {error}
    <div className="teacher-dialog-actions">
      {onEmail && !link.lessons.length ? <button className="button button--outline button--compact" disabled={Boolean(sending)} onClick={onEmail} type="button">
        <Mail size={15} aria-hidden="true" />{sending === student.id ? "Sending…" : "Email instead"}
      </button> : null}
      <button className="button button--outline button--compact" onClick={() => void copy()} type="button">
        <Copy size={15} aria-hidden="true" />{copied ? "Copied" : "Copy"}
      </button>
      <a
        className="button button--coral button--compact"
        href={`https://wa.me/${number}?text=${encodeURIComponent(text)}`}
        rel="noopener noreferrer"
        target="_blank"
      ><MessageCircle size={15} aria-hidden="true" />Send on WhatsApp<span className="visually-hidden"> to {student.name}</span></a>
    </div>
  </div>;
}
