"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmEmailChange, readSession, requestEmailChange, requestPasswordReset, type Student } from "@/lib/auth-api";

/** Her sign-in details use the same verified email and reset links as an account. */
export function TeacherAccountProfile({ token, student, disabled, onBusyChange, onStudentChange, onSignOut }: {
  token: string;
  student: Student;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onStudentChange: (student: Student) => void;
  onSignOut: () => void;
}) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [emailPending, setEmailPending] = useState("");
  const [busy, setBusy] = useState<"email" | "password" | "confirm" | "">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const request = useRef(0);
  const confirmation = useRef<ReturnType<typeof confirmEmailChange> | null>(null);
  useEffect(() => () => {
    request.current += 1;
    onBusyChange(false);
  }, [onBusyChange]);

  useEffect(() => {
    if (!confirmation.current) {
      const url = new URL(window.location.href);
      const changeToken = url.searchParams.get("emailToken");
      if (!changeToken || readSession() !== token) return;
      // Keep the one-use token out of later URLs and screenshots.
      url.searchParams.delete("emailToken");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      confirmation.current = confirmEmailChange(token, changeToken);
    }
    let active = true;
    setBusy("confirm");
    onBusyChange(true);
    setError("");
    confirmation.current
      .then(result => {
        if (!active || readSession() !== (result.session ?? token)) return;
        if (result.student.id !== student.id || result.student.role !== "teacher") throw new Error("Your account changed while confirming this email. Please sign in again.");
        onStudentChange(result.student);
        setEmailPending("");
        setEditingEmail(false);
        setNote("Your sign-in email has been updated.");
      })
      .catch(caught => {
        if (active) setError(caught instanceof Error ? caught.message : "That link couldn’t be used. Please request a new one.");
      })
      .finally(() => {
        if (active) {
          setBusy("");
          onBusyChange(false);
        }
      });
    return () => { active = false; };
    // Only the arrival link starts confirmation. A verified reply renews the
    // token while this same form stays open; that must not consume it twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled) return;
    const current = ++request.current;
    setBusy("email");
    onBusyChange(true);
    setError("");
    setNote("");
    try {
      const result = await requestEmailChange(token, email.trim());
      if (current !== request.current || readSession() !== token) return;
      setEmailPending(result.pending);
      setEditingEmail(false);
      setEmail("");
    } catch (caught) {
      if (current === request.current && readSession() === token) setError(caught instanceof Error ? caught.message : "The confirmation email couldn’t be sent. Please try again.");
    } finally {
      if (current === request.current) {
        setBusy("");
        onBusyChange(false);
      }
    }
  }

  async function changePassword() {
    if (busy || disabled) return;
    const current = ++request.current;
    setBusy("password");
    onBusyChange(true);
    setError("");
    setNote("");
    try {
      await requestPasswordReset(student.email);
      if (current !== request.current || readSession() !== token) return;
      setNote(`Check ${student.email} for a link to choose a new password. It works for one hour.`);
    } catch (caught) {
      if (current === request.current && readSession() === token) setError(caught instanceof Error ? caught.message : "The password reset link couldn’t be sent. Please try again.");
    } finally {
      if (current === request.current) {
        setBusy("");
        onBusyChange(false);
      }
    }
  }

  const locked = disabled || Boolean(busy);
  return (
    <section className="teacher-account" aria-label="Your account">
      {/* One line a detail, each with its own small button at the right, and
          Sign out at the top right as on a student's Your details
          (27 October 2026, Dan: one style, no holes). */}
      <div className="teacher-account__heading">
        <div>
          <h2>Your profile</h2>
          <p>{student.name}</p>
        </div>
        <button className="button button--outline button--small" disabled={locked} onClick={onSignOut} type="button">Sign out</button>
      </div>
      <div className="teacher-account__detail">
        <div className="teacher-account__line">
          <div>
            <h3>Sign-in email</h3>
            <p>{student.email}</p>
          </div>
          {!editingEmail ? <button className="button button--outline button--small" disabled={locked} onClick={() => { setEditingEmail(true); setEmail(""); setError(""); setNote(""); }} type="button">Change email</button> : null}
        </div>
        {editingEmail ? (
          <form className="teacher-form teacher-account__email" onSubmit={changeEmail}>
            <label htmlFor="teacher-account-email">New sign-in email</label>
            <input autoComplete="email" autoFocus disabled={locked} id="teacher-account-email" onChange={event => { setEmail(event.target.value); setError(""); }} required type="email" value={email} />
            <p>Confirm the link sent to the new address to change where you sign in.</p>
            <div className="teacher-account__actions">
              <button className="button button--coral" disabled={locked || !email.trim() || email.trim().toLowerCase() === student.email.toLowerCase()} type="submit">{busy === "email" ? "Sending…" : "Send confirmation email"}</button>
              <button className="button button--outline button--small" disabled={locked} onClick={() => setEditingEmail(false)} type="button">Cancel</button>
            </div>
          </form>
        ) : null}
        {emailPending ? <p className="teacher-account__waiting" role="status">Waiting for you to confirm <strong>{emailPending}</strong> from the link we sent.</p> : null}
      </div>
      <div className="teacher-account__detail">
        <div className="teacher-account__line">
          <div>
            <h3>Password</h3>
            <p>A link to your sign-in email lets you choose a new one.</p>
          </div>
          <button className="button button--outline button--small" disabled={locked} onClick={() => void changePassword()} type="button">{busy === "password" ? "Sending…" : "Send reset link"}</button>
        </div>
      </div>
      {busy === "confirm" ? <p role="status">Confirming your sign-in email…</p> : null}
      {error ? <p className="teacher-account__error" role="alert">{error}</p> : null}
      {note ? <p className="teacher-account__note" role="status"><CheckCircle2 size={17} aria-hidden="true" />{note}</p> : null}
    </section>
  );
}
