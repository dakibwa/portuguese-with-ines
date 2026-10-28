"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { readSession } from "@/lib/auth-api";
import {
  connectGoogleMeet,
  fetchGoogleMeetConnection,
  type GoogleMeetConnection,
} from "@/lib/admin-api";
import { GoogleMeetLogo } from "@/components/GoogleMeetLogo";


/** Connection controls live beside sign-in details in Profile. */
export function TeacherMeetConnection({ token, onConnectionChange }: { token: string; onConnectionChange: (connection: GoogleMeetConnection | null) => void }) {
  const [connection, setConnection] = useState<GoogleMeetConnection | null>(null);
  const [error, setError] = useState("");
  const [callbackResult, setCallbackResult] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const connectRequest = useRef(0);
  useEffect(() => () => { connectRequest.current += 1; }, [token]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("meet");
    if (result && ["connected", "cancelled", "error"].includes(result)) {
      setCallbackResult(result);
      url.searchParams.delete("meet");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    fetchGoogleMeetConnection(token)
      .then(result => { if (active) setConnection(result); })
      .catch(caught => {
        if (active) setError(caught instanceof Error ? caught.message : "Google Meet status couldn’t be loaded.");
      });
    return () => { active = false; };
  }, [token, attempt]);

  async function connect() {
    if (busy) return;
    const request = ++connectRequest.current;
    setBusy(true);
    setError("");
    setCallbackResult("");
    try {
      const result = await connectGoogleMeet(token);
      if (request !== connectRequest.current || readSession() !== token) return;
      const url = new URL(result.url);
      if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password) {
        throw new Error("The Google connection couldn’t be opened. Please try again.");
      }
      window.location.assign(url.href);
    } catch (caught) {
      if (request !== connectRequest.current || readSession() !== token) return;
      setError(caught instanceof Error ? caught.message : "The Google connection couldn’t be opened. Please try again.");
      setBusy(false);
    }
  }

  const healthy = Boolean(connection?.connected && !connection.needsReconnect);
  const attention = !connection
    ? ""
    : !connection.configured
      ? "Needs a one-time setup"
      : connection.needsReconnect
        ? "Needs reconnecting"
        : !connection.connected
          ? "Not connected"
          : "";
  const feedback = callbackResult === "connected"
    ? !connection
      ? "Checking the connection…"
      : healthy
        ? "Google Meet connected."
        : "Google Meet is not connected yet. Please try again."
    : callbackResult === "cancelled"
      ? "Connection cancelled. You can try again when you’re ready."
      : callbackResult === "error"
        ? "Google Meet couldn’t be connected. Please try again."
        : "";

  // Needs you, on her timetable, says so when the connection needs her.
  useEffect(() => { onConnectionChange(connection); }, [connection, onConnectionChange]);

  return (
    <section className="teacher-meet" aria-labelledby="teacher-meet-title">
      <div className="teacher-meet-head">
        <GoogleMeetLogo />
        <div>
          <h2 id="teacher-meet-title">Google Meet</h2>
          {attention ? (
            <p className="teacher-meet-attention">{attention}</p>
          ) : healthy ? (
            <p className="teacher-meet-connected"><Check size={15} strokeWidth={2.6} aria-hidden="true" />Connected{connection?.email ? ` as ${connection.email}` : ""}</p>
          ) : null}
        </div>
      </div>
      {!connection && !error ? <p role="status">Checking Google Meet…</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      {error ? <div className="teacher-meet-error" role="alert"><p>{error}</p><button className="button button--outline button--small" onClick={() => setAttempt(value => value + 1)} type="button">Try again</button></div> : null}
      {connection?.configured ? (
        <>
          <ul className="booking-payment-facts">
            {healthy ? (
              <>
                <li>Every lesson goes to your Google Calendar with its Meet link</li>
                <li>Move or cancel lessons here, not in Google</li>
              </>
            ) : (
              <li>{connection.needsReconnect ? "Reconnect" : "Connect once"} so every lesson goes to your Google Calendar with a Meet link</li>
            )}
            {connection.pending > 0 ? (
              <li>{connection.pending} {connection.pending === 1 ? "lesson is" : "lessons are"} waiting to sync</li>
            ) : null}
          </ul>
          <div className="teacher-meet-actions">
            {healthy ? (
              <>
                <a className="button button--lilac" href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer">Open Google Calendar</a>
                <button className="button button--outline button--small" disabled={busy} onClick={() => void connect()} type="button">
                  {busy ? "Opening Google…" : "Reconnect Google Meet"}
                </button>
              </>
            ) : (
              <button className="button button--coral" disabled={busy} onClick={() => void connect()} type="button">
                {busy ? "Opening Google…" : connection.connected || connection.needsReconnect ? "Reconnect Google Meet" : "Connect Google Meet"}
              </button>
            )}
          </div>
          {connection.connected ? (
            <details className="teacher-meet-note"><summary>Share your calendar</summary><p>In Google Calendar, open “Português com a Inês — lessons” → Settings and sharing → Add people.</p></details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
