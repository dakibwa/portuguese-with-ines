"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { firstName } from "@/components/teacher/DormantEmail";
import { createInviteLink, type AdminStudent } from "@/lib/admin-api";

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

/**
 * Her words to them, hers to change before it goes, and short (2 November
 * 2026, Dan: "quite wordy"). It says what changes: from now on they book,
 * move and cancel themselves, which is the point of sending it (Dan: "we want
 * to clear up admin burden"). The welcome screen it opens teaches the rest.
 * The link goes at the end on its own.
 */
export function inviteMessage(student: AdminStudent) {
  const first = firstName(student);
  return student.dormant
    ? `Olá ${first}! Whenever you’d like another lesson, you can book one here:`
    : `Olá ${first}! From now on you can book, move or cancel your lessons with me here:`;
}

/**
 * A sign-in link she sends herself on WhatsApp (2 November 2026, Dan: most of
 * her students never gave an email, so an email was the one way in they could
 * not use). Opening this makes the link, which signs them in once within two
 * weeks; nothing is sent until she presses Send in WhatsApp itself. Copy
 * takes the same words and link for anywhere else.
 */
export function WhatsAppInvite({ student, token, onBusy }: {
  student: AdminStudent;
  token: string;
  onBusy?: (busy: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState(() => inviteMessage(student));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  async function make() {
    setBusy(true);
    onBusy?.(true);
    setProblem("");
    try {
      setUrl(await createInviteLink(token, student.id));
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "The link couldn’t be made. Please try again.");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  // Once per opening, even where React runs effects twice.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void make();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setProblem("It couldn’t be copied. Select the message and copy it instead.");
    }
  }

  if (!url) return problem ? <div className="teacher-inline-error" role="alert">
    <p>{problem}</p>
    <button className="button button--outline button--small" disabled={busy} onClick={() => void make()} type="button">Try again</button>
  </div> : <p className="teacher-invite__making" role="status">Making their link…</p>;

  const number = whatsAppNumber(student.phone ?? "");
  // The link follows her words on its own line, so editing never breaks it.
  const text = `${message.trim()}\n${url}`;
  return <div className="teacher-form teacher-invite">
    <label>
      <span>Message</span>
      <textarea maxLength={1000} onChange={event => { setCopied(false); setMessage(event.target.value); }} rows={2} value={message} />
    </label>
    {problem ? <p className="teacher-inline-error" role="alert">{problem}</p> : null}
    <div className="teacher-dialog-actions">
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
