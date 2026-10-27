"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import { AccountAvatar } from "@/components/AccountMenu";
import { AuthPanel } from "@/components/AuthPanel";
import { StudentExpressions } from "@/components/expressions/StudentExpressions";
import { TeacherExpressionTryOut } from "@/components/expressions/TeacherExpressionTryOut";
import { fetchExpressions } from "@/lib/admin-api";
import { fetchMe, readSession, subscribeToSession, type Student } from "@/lib/auth-api";
import { BOOKING_CONFIGURED } from "@/lib/config";
import type { Expression } from "@/lib/expressions";
import { publicAssetPath } from "@/lib/paths";

function TeacherPainting({ account, token }: { account: Student; token: string }) {
  const [rows, setRows] = useState<Expression[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setRows(null);
    setError("");
    fetchExpressions(token).then((collection) => {
      if (current && readSession() === token) setRows(collection.expressions);
    }).catch((caught) => {
      if (current && readSession() === token) setError(caught instanceof Error ? caught.message : "Expressions couldn’t be loaded.");
    });
    return () => { current = false; };
  }, [token, attempt]);
  if (error) return <div className="idioms-state" role="alert"><p>{error}</p><button className="button button--outline button--compact" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button></div>;
  if (!rows) return <p className="idioms-state" role="status">Loading expressions…</p>;
  if (!rows.length) return <p className="idioms-state" role="status">Add an expression in your collection to start painting.</p>;
  return <TeacherExpressionTryOut accountId={account.id} fullPage rows={rows} token={token} />;
}

/** The same painting, with the same account and Worker access rules, at its own address. */
export function IdiomsExperience() {
  const token = useSyncExternalStore(subscribeToSession, readSession, () => "");
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<{ token: string; student: Student } | null>(null);
  const [checked, setChecked] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    // A native return or reload can follow the painting page's React turn.
    // As with the teacher account handoff, chaining those turns can hold
    // Chromium's destination frame. The destination stays free to render.
    const leave = (event: PageSwapEvent) => event.viewTransition?.skipTransition();
    window.addEventListener("pageswap", leave);
    return () => window.removeEventListener("pageswap", leave);
  }, []);
  useEffect(() => {
    let current = true;
    setAccount(null);
    setChecked("");
    setError("");
    if (!token) return;
    fetchMe(token).then((data) => {
      if (current && readSession() === token && data) setAccount({ token, student: data.student });
    }).catch(() => {
      if (current && readSession() === token) setError("We couldn’t check your account. Please try again.");
    }).finally(() => {
      if (current && readSession() === token) setChecked(token);
    });
    return () => { current = false; };
  }, [token, attempt]);

  if (!BOOKING_CONFIGURED) return <p className="idioms-state">The booking service is not connected yet.</p>;
  if (!ready) return <p className="idioms-state" role="status">Opening expressions…</p>;
  if (!token) return <AuthPanel heading="Sign in" headingLevel={2} intro="Sign in to paint and discover expressions." signInOnly onSignedIn={() => {}} />;
  if (error && checked === token) return <div className="idioms-state" role="alert"><p>{error}</p><button className="button button--outline button--compact" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button></div>;
  // A different account or a late response can never retain this account's draft collection.
  if (!account || account.token !== token) return <p className="idioms-state" role="status">Opening expressions…</p>;
  const me = account.student;
  const teacher = me.role === "teacher";
  return (
    <div className="idioms-workspace" key={`${token}:${me.id}`}>
      <div className="idioms-toolbar">
        <a className="button button--outline button--small" href={publicAssetPath(teacher ? "/schedule/?tab=expressions" : "/book/?view=lessons")}><ArrowLeft aria-hidden="true" size={16} />{teacher ? "Expressions collection" : "Your lessons"}</a>
        <span className="idioms-account"><AccountAvatar mark={me.mark} name={me.name} /><span>{me.name}</span></span>
      </div>
      {teacher ? <TeacherPainting account={me} token={token} /> : <StudentExpressions fullPage studentId={me.id} token={token} />}
    </div>
  );
}
