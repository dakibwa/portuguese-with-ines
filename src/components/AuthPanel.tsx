"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, Lock, Mail, ReceiptText, UserRound } from "lucide-react";
import { AssetMark } from "@/components/BrandMarks";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { browserTimeZone } from "@/lib/booking-api";
import { login, register, requestPasswordReset, storeSession, type Student } from "@/lib/auth-api";

type Mode = "signin" | "register" | "forgot";

/**
 * Sign in, create an account, or ask for a reset link.
 *
 * Deliberately placed at the end of the booking flow rather than in front of
 * it: a student can see what is free before being asked to make an account,
 * which is the difference between an account being useful and being a toll.
 */
export function AuthPanel({
  initialMode = "signin",
  keepCopy = false,
  onSignedIn,
  heading,
  headingLevel = 3,
  intro
}: {
  initialMode?: Mode;
  /**
   * Hold the caller's heading and intro across the two tabs. For a caller whose
   * heading names one of them — "Sign in" — the copy has to follow the tab or it
   * contradicts it. For one whose heading names neither, like "Almost there" at
   * the end of a booking, following the tab only throws away the better line.
   */
  keepCopy?: boolean;
  onSignedIn: (student: Student) => void;
  heading?: string;
  headingLevel?: 2 | 3;
  intro?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [form, setForm] = useState({ name: "", email: "", password: "", nif: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // A stale error never follows the student to another form. The "reset link is
  // on its way" notice does stay when they go back to sign in: that is where
  // they wait for it.
  function switchMode(next: Mode) {
    setError("");
    if (next !== "signin") setNotice("");
    setMode(next);
  }
  const [busy, setBusy] = useState(false);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const introText =
    mode === "forgot"
      ? "Give us the email you booked with and we'll send you a link to choose a new password. It works for one hour."
      : mode === "register" && !keepCopy
        ? "Keeps all your lessons in one place, so you can change them yourself."
        : intro;

  function update(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (mode === "forgot") {
        await requestPasswordReset(form.email.trim());
        setNotice("If that email has an account, a reset link is on its way. It works for one hour.");
        return;
      }

      const result =
        mode === "register"
          ? await register({
              name: form.name.trim(),
              email: form.email.trim(),
              password: form.password,
              nif: form.nif.trim(),
              timezone: browserTimeZone()
            })
          : await login({ email: form.email.trim(), password: form.password });

      storeSession(result.session);
      onSignedIn(result.student);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel">
      <AssetMark asset="/visuals/v2-splats/built-around-you-splat-v2.svg" className="auth-panel__mark" />
      {/* The heading follows the mode, or it contradicts the active tab —
          "Sign in" sat above a selected "Create an account". Forgotten password
          is its own task, so it overrides the copy either way. */}
      <Heading>
        {mode === "forgot" ? "Forgotten password" : mode === "register" && !keepCopy ? "Create an account" : heading}
      </Heading>
      {introText ? <p className="auth-panel__intro">{introText}</p> : null}

      {/* Booking terms and privacy share one disclosure on the page,
          so signing up carries no explanatory copy of its own. */}
      {mode !== "forgot" ? <GoogleSignInButton onError={setError} onSignedIn={onSignedIn} /> : null}

      {/* Creating an account leads, because at the end of a booking most people
          have never been here before. Signing in follows it rather than
          fronting it, and the surfaces that are only ever reached by a
          returning student open on it instead. */}
      {mode !== "forgot" ? (
        <div className={`auth-tabs auth-tabs--${mode}`} role="tablist">
          <span aria-hidden="true" className="auth-tabs__thumb" />
          <button
            aria-selected={mode === "register"}
            className={mode === "register" ? "is-active" : ""}
            onClick={() => switchMode("register")}
            role="tab"
            type="button"
          >
            Create an account
          </button>
          <button
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "is-active" : ""}
            onClick={() => switchMode("signin")}
            role="tab"
            type="button"
          >
            I have an account
          </button>
        </div>
      ) : null}

      <form className="auth-panel__form" key={mode} onSubmit={submit}>
        {mode === "register" ? (
          <label>
            <span>
              <UserRound size={16} aria-hidden="true" />
              First name
            </span>
            <input
              autoComplete="given-name"
              onChange={(event) => update({ name: event.target.value })}
              required
              value={form.name}
            />
          </label>
        ) : null}

        <label>
          <span>
            <Mail size={16} aria-hidden="true" />
            Email
          </span>
          <input
            autoComplete="email"
            onChange={(event) => update({ email: event.target.value })}
            required
            type="email"
            value={form.email}
          />
        </label>

        {mode !== "forgot" ? (
          <label>
            <span>
              <Lock size={16} aria-hidden="true" />
              Password
            </span>
            <input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={mode === "register" ? 8 : undefined}
              onChange={(event) => update({ password: event.target.value })}
              required
              type="password"
              value={form.password}
            />
            {mode === "register" ? <small>At least 8 characters.</small> : null}
          </label>
        ) : null}

        {mode === "register" ? (
          <label>
            <span>
              <ReceiptText size={16} aria-hidden="true" />
              NIF <em>(optional)</em>
            </span>
            <input
              autoComplete="off"
              inputMode="numeric"
              maxLength={20}
              onChange={(event) => update({ nif: event.target.value })}
              value={form.nif}
            />
            <small>Added to your receipts.</small>
          </label>
        ) : null}

        {error ? (
          <div className="booking-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        {notice ? (
          <div className="booking-alert booking-alert--warn" role="status">
            <p>{notice}</p>
          </div>
        ) : null}

        <button className="button button--coral booking-confirm-button" disabled={busy} type="submit">
          {busy
            ? "Just a moment…"
            : mode === "register"
              ? "Create my account"
              : mode === "forgot"
                ? "Email me a reset link"
                : "Sign in"}
        </button>
      </form>

      <p className="auth-panel__aside">
        {mode === "forgot" ? (
          <button className="auth-panel__link" onClick={() => switchMode("signin")} type="button">
            Back to signing in
          </button>
        ) : (
          <button className="auth-panel__link" onClick={() => switchMode("forgot")} type="button">
            I&rsquo;ve forgotten my password
          </button>
        )}
      </p>
    </div>
  );
}
