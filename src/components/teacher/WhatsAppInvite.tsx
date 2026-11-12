"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { CHARGED_EACH } from "@/components/CardOnFile";
import { OwedLessonChoices, sum, whatsAppNumber } from "@/components/teacher/CardApprovalLink";
import { firstName } from "@/components/teacher/DormantEmail";
import { priceFor } from "@/components/teacher/StudentPrice";
import { upcomingEntries, upcomingLessons, usualWeek } from "@/components/teacher/StudentLessons";
import { addedByTeacher, cardApprovalChoices, createCardApprovalLink, createInviteLink, fetchBookings, isStudentsBooking, paidByHand, type AdminBooking, type AdminStudent, type CardApprovalLesson } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { formatMoneyCents, formatShortDay, formatSlotTime } from "@/lib/booking-api";
import { dateKey, dateLabel, type StudentProgress } from "@/lib/teacher-calendar";

/** What a link with lessons ticked asks them to agree to besides those lessons: the Worker puts their other lessons she added on the card as well. */
const AGREEMENT = `If you agree, your future lessons are then charged to your card ${CHARGED_EACH}.`;

/**
 * Her words to them, hers to change before it goes, and short (2 November
 * 2026, Dan: "quite wordy"). Someone not yet in hears what changes: from now
 * on they book, move and cancel themselves (Dan: "we want to clear up admin
 * burden"); lessons she ticked are named by their total, and that agreeing
 * puts their future lessons on the card too. Someone already in is asked only
 * for what is missing. The welcome screen the link opens teaches the rest,
 * and the link goes at the end on its own.
 */
export function inviteMessage(student: AdminStudent, progress?: Pick<StudentProgress, "card">, lessons: CardApprovalLesson[] = []) {
  const first = firstName(student);
  const total = formatMoneyCents(sum(lessons));
  const owed = lessons.length === 1 ? `your lesson on ${formatShortDay(lessons[0].startAt)} (${total})` : `the ${lessons.length} lessons still open (${total})`;
  if (student.dormant) return `Olá ${first}! Whenever you’d like another lesson, you can book one here:`;
  if (!student.signedIn) return lessons.length
    ? `Olá ${first}! From now on you can book, move or cancel your lessons with me here, and pay for ${owed}. ${AGREEMENT}`
    : `Olá ${first}! From now on you can book, move or cancel your lessons with me here:`;
  if (lessons.length) return `Olá ${first}! Here’s your link to pay by card for ${owed}. ${AGREEMENT}`;
  return progress?.card === false ? `Olá ${first}! Here’s your link to add a card for your lessons:` : `Olá ${first}! Here’s your link to sign in:`;
}

/** A lesson, or a weekly run once, that agreeing puts on their card. */
type FutureLine = { key: string; when: string; price: string; span: string; moved: string };
type Future = { status: "loading" | "failed" } | { status: "ready"; lines: FutureLine[] };
/** Lines shown before the rest fold into a count. */
const FUTURE_SHOWN = 3;

/**
 * What agreeing puts on their card besides the lessons ticked, as the Worker
 * does when they agree: lessons she added, still to come, with nothing settled
 * on them (not paid, not paid by hand, not charging). Weekly runs read once,
 * by their usual week, saying how many weeks sit at another time and, where
 * the weeks differ in price, the range rather than one price for them all;
 * never a row for every week.
 */
function futureLines(student: AdminStudent, bookings: AdminBooking[], now: number): FutureLine[] {
  const onCard = bookings.filter(booking => isStudentsBooking(booking, student) && booking.status === "confirmed" && addedByTeacher(booking) &&
    booking.payment_status === "not_required" && !paidByHand(booking) && !booking.charge_started_at && Date.parse(booking.starts_at) > now);
  const cents = (booking: AdminBooking) => {
    const minutes = Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000);
    return booking.amount_cents ?? (minutes === 60 || minutes === 90 ? priceFor(student, minutes) : 0);
  };
  const price = (lessons: AdminBooking[]) => {
    const amounts = lessons.map(cents);
    const low = Math.min(...amounts);
    const high = Math.max(...amounts);
    if (!high) return "";
    return low === high ? `${formatMoneyCents(high)} a lesson` : `${formatMoneyCents(low)}–${formatMoneyCents(high)} a lesson, prices differ`;
  };
  return upcomingEntries(upcomingLessons(onCard, now), now).map(entry => {
    if (!("run" in entry)) {
      const { booking } = entry;
      return { key: booking.id, when: `${formatShortDay(booking.starts_at)}, ${formatSlotTime(booking.starts_at)}`, price: price([booking]), span: "", moved: "" };
    }
    const { pattern, moved } = usualWeek(entry.run.lessons);
    const last = entry.run.lessons[entry.run.lessons.length - 1];
    return {
      key: `run-${entry.run.id}`,
      when: `Every ${dateLabel(dateKey(new Date(pattern.starts_at)), { weekday: "long" })}, ${formatSlotTime(pattern.starts_at)}–${formatSlotTime(pattern.ends_at)}`,
      price: price(entry.run.lessons),
      span: `${entry.run.lessons.length} lessons to ${formatShortDay(last.starts_at)}`,
      moved: moved ? `${moved === 1 ? "1 week" : `${moved} weeks`} moved` : "",
    };
  });
}

/**
 * Before the link is made and in its summary: what is owed now apart from what
 * they would agree to for the lessons still to come. The ticked lessons are
 * charged once they agree; the future ones are not owed yet; and making or
 * sending the link agrees to and charges nothing. Said as dabs, never under
 * headings of their own (10 November 2026, Dan: a heading never says a fact).
 */
function ApprovalTerms({ first, owed, future, showOwed, onRetry }: { first: string; owed: CardApprovalLesson[]; future: Future; showOwed: boolean; onRetry: () => void }) {
  const later = future.status === "ready" && future.lines.length
    ? <>
      Not owed yet. If {first} agrees, these go on their card, charged {CHARGED_EACH}:
      <ul>{future.lines.slice(0, FUTURE_SHOWN).map(line => <li key={line.key}>
        <strong>{line.when}</strong>{line.price ? ` · ${line.price}` : ""}{line.span || line.moved ? <span> · {[line.span, line.moved].filter(Boolean).join(", ")}</span> : null}
      </li>)}</ul>
      {future.lines.length > FUTURE_SHOWN ? <>and {future.lines.length - FUTURE_SHOWN} more.</> : null}
    </>
    : future.status === "loading" ? "Checking their upcoming lessons…"
    : future.status === "failed" ? <>
      Their upcoming lessons couldn’t be checked, so what goes on their card besides the lessons ticked isn’t shown. If {first} agrees, lessons you add go on their card, charged {CHARGED_EACH}.
      {" "}<button className="teacher-quiet" onClick={onRetry} type="button">Check again</button>
    </>
    : <>None booked yet. If {first} agrees, lessons you add go on their card, charged {CHARGED_EACH}.</>;
  return <ul className="booking-payment-facts teacher-invite__terms">
    {showOwed ? <li>{owed.length
      ? `${formatMoneyCents(sum(owed))} for the ${owed.length === 1 ? "1 lesson" : `${owed.length} lessons`} ticked, charged once ${first} agrees.`
      : `Nothing ticked: this link only signs ${first} in.`}</li> : null}
    {owed.length ? <li>{later}</li> : null}
    {showOwed && owed.length ? <li>Making or sending the link doesn’t agree to anything for them.</li> : null}
  </ul>;
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
  const [future, setFuture] = useState<Future>({ status: "loading" });
  const started = useRef(false);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

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

  // Read only, and apart from the tick list: if it can't be read the list and
  // the link still work, and the words say so.
  async function loadFuture() {
    setFuture({ status: "loading" });
    const now = Date.now();
    try {
      const { bookings } = await fetchBookings(token, new Date(now).toISOString());
      if (alive.current && readSession() === token) setFuture({ status: "ready", lines: futureLines(student, bookings, now) });
    } catch {
      if (alive.current && readSession() === token) setFuture({ status: "failed" });
    }
  }

  async function load() {
    void loadFuture();
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
      <div className="teacher-invite__owed-pick">
      <p className="teacher-card-link__hint"><span id={`invite-owed-${student.id}`}>Tick what {first} still owes</span>. Leave any paid in cash.</p>
      <OwedLessonChoices busy={busy} choices={choices} ticked={ticked}
        onToggle={id => setTicked(current => current.includes(id) ? current.filter(other => other !== id) : [...current, id])} />
      </div>
      <ApprovalTerms first={first} future={future} owed={chosen} showOwed onRetry={() => void loadFuture()} />
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
    {link.lessons.length ? <ApprovalTerms first={first} future={future} owed={link.lessons} showOwed={false} onRetry={() => void loadFuture()} /> : null}
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
