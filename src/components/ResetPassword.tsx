"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { resetPassword, storeSession } from "@/lib/auth-api";

export function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const found = new URLSearchParams(window.location.search).get("token");
    if (!found) setError("This page needs the link from your reset email.");
    setToken(found);
    // The token is held in state from here; it has no reason to stay in the
    // address bar, the history entry or a screenshot.
    if (found) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await resetPassword(token, password);
      storeSession(result.session);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Please request a new link.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="booking-outcome" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div>
          <strong>Your password has been changed.</strong>
          <p>
            You&rsquo;re signed in. <a href="/book/?view=lessons">Go to your lessons</a>.
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
            autoComplete="new-password"
            disabled={!token}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <small>At least 8 characters.</small>
        </label>

        <label>
          <span>
            <Lock size={16} aria-hidden="true" />
            Again, to be sure
          </span>
          <input
            autoComplete="new-password"
            disabled={!token}
            minLength={8}
            onChange={(event) => setConfirm(event.target.value)}
            required
            type="password"
            value={confirm}
          />
        </label>

        {error ? (
          <div className="booking-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        <button className="button button--coral booking-confirm-button" disabled={!token || busy} type="submit">
          {busy ? "Saving…" : "Save my new password"}
        </button>
      </form>
    </div>
  );
}
