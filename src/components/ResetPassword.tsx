"use client";

import { FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { SITE_BASE_PATH } from "@/lib/paths";
import { readSession, resetPassword, SessionStorageError, storeSession } from "@/lib/auth-api";

export function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  // The server turned the link down, so the only way on is a new one.
  const [linkRefused, setLinkRefused] = useState(false);
  const [done, setDone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [teacher, setTeacher] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const [busy, setBusy] = useState(false);
  const resetToken = useRef<string | null>(null);
  const resetRequest = useRef(0);
  const fieldId = useId();
  useLayoutEffect(() => () => { resetRequest.current += 1; }, []);

  useEffect(() => {
    const found = new URLSearchParams(window.location.search).get("token") || resetToken.current;
    resetToken.current = found;
    if (!found) setError("This page needs the link from your reset email.");
    setToken(found);
    // Retain it across an effect restart after clearing the address, including
    // Strict Mode's replay. It stays out of history and screenshots.
    if (found) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    if (password !== confirm) {
      setError("Those two passwords don’t match.");
      return;
    }

    const request = ++resetRequest.current;
    const session = readSession();
    setBusy(true);
    setError("");
    setLinkRefused(false);

    try {
      const result = await resetPassword(token, password);
      if (request !== resetRequest.current) return;
      const canSignIn = readSession() === session;
      let saved = false;
      if (canSignIn) {
        try {
          storeSession(result.session);
          saved = true;
        } catch (caught) {
          if (!(caught instanceof SessionStorageError)) throw caught;
          setStorageNote(caught.message);
        }
      }
      setSignedIn(saved);
      setTeacher(result.student.role === "teacher");
      setDone(true);
    } catch (caught) {
      if (request !== resetRequest.current) return;
      setError(caught instanceof Error ? caught.message : "That didn’t work. Please request a new link.");
      setLinkRefused(true);
    } finally {
      if (request === resetRequest.current) setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="booking-outcome" role="status">
        <CheckCircle2 size={20} aria-hidden="true" />
        <div>
          <strong>Your password has been changed.</strong>
          <p>
            {signedIn ? <>You&rsquo;re signed in. <a href={teacher ? "/schedule/?tab=profile" : "/book/?view=lessons"}>{teacher ? "Go to your profile" : "Go to your lessons"}</a>.</>
              : storageNote || <>You can now <a href={`${SITE_BASE_PATH}/book/?view=lessons`}>sign in with your new password</a>.</>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <form onSubmit={submit}>
        <label>
          <span>
            <Lock size={16} aria-hidden="true" />
            New password
          </span>
          <input
            aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ""}`}
            aria-invalid={Boolean(error) || undefined}
            autoComplete="new-password"
            disabled={!token}
            minLength={8}
            onChange={(event) => { setPassword(event.target.value); if (token && !linkRefused) setError(""); }}
            required
            type="password"
            value={password}
          />
          <small id={`${fieldId}-hint`}>At least 8 characters.</small>
        </label>

        <label>
          <span>
            <Lock size={16} aria-hidden="true" />
            New password, again
          </span>
          <input
            aria-describedby={error ? `${fieldId}-error` : undefined}
            aria-invalid={Boolean(error) || undefined}
            autoComplete="new-password"
            disabled={!token}
            minLength={8}
            onChange={(event) => { setConfirm(event.target.value); if (token && !linkRefused) setError(""); }}
            required
            type="password"
            value={confirm}
          />
        </label>

        {error ? (
          <div className="booking-alert booking-alert--error" id={`${fieldId}-error`} role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <div className="booking-alert__body">
              <p>{error}</p>
              {!token || linkRefused ? (
                <div className="booking-alert__actions">
                  <a className="button button--outline button--compact" href={`${SITE_BASE_PATH}/book/?view=lessons`}>Ask for a new link</a>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <button className="button button--coral booking-confirm-button" disabled={!token || busy} type="submit">
          {busy ? "Saving…" : "Save my new password"}
        </button>
      </form>
    </div>
  );
}
