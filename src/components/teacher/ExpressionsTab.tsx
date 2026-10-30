"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, Plus } from "lucide-react";
import { ExpressionCard } from "@/components/expressions/ExpressionCard";
import { TeacherExpressionTryOut } from "@/components/expressions/TeacherExpressionTryOut";
import { ExpressionDialog } from "@/components/teacher/ExpressionDialog";
import { TranslationsReview } from "@/components/teacher/TranslationsReview";
import { deleteExpression, fetchExpressions, publishExpression, reorderExpressions, saveExpression } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { searchExpression, type Expression, type ExpressionInput } from "@/lib/expressions";

export function ExpressionsTab({ token, accountId }: { token: string; accountId: string }) {
  const [expressions, setExpressions] = useState<Expression[] | null>(null);
  /** Whether students can see expressions yet (the Worker's switch); unknown until the collection loads. */
  const [openToStudents, setOpenToStudents] = useState<boolean | null>(null);
  /** Students' translations waiting for her, from the collection's own reply. */
  const [pendingTranslations, setPendingTranslations] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState("");
  const [dialog, setDialog] = useState<{ expression: Expression | null; preview: boolean } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    let current = true;
    setExpressions(null); setError("");
    fetchExpressions(token).then((collection) => {
      if (current && readSession() === token) { setExpressions(collection.expressions); setOpenToStudents(collection.openToStudents); setPendingTranslations(collection.pendingTranslations); }
    }).catch((caught) => {
      if (current && readSession() === token) setError(caught instanceof Error ? caught.message : "Expressions couldn’t be loaded.");
    });
    return () => { current = false; };
  }, [token, attempt]);

  const canUpdate = () => active.current && readSession() === token;
  const replace = (saved: Expression) => {
    if (!canUpdate()) return;
    setExpressions((rows) => [...(rows ?? []).filter((row) => row.id !== saved.id), saved]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)));
  };
  async function save(input: ExpressionInput) {
    const saved = await saveExpression(token, input, dialog?.expression ?? undefined);
    if (canUpdate()) { replace(saved); setNotice(saved.published ? "Expression saved." : "Draft saved."); }
  }
  async function remove() {
    if (!dialog?.expression) return;
    const expression = dialog.expression;
    await deleteExpression(token, expression);
    if (canUpdate()) { setExpressions((rows) => rows?.filter((row) => row.id !== expression.id) ?? null); setNotice("Expression deleted."); }
  }
  async function change(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (caught) { if (canUpdate()) setError(caught instanceof Error ? caught.message : "The change couldn’t be saved. Please try again."); }
    finally { pending.current = false; if (canUpdate()) setBusy(false); }
  }
  async function publish(item: Expression) {
    const saved = await publishExpression(token, item, item.published ? 0 : 1);
    if (canUpdate()) {
      replace(saved);
      setNotice(!saved.published ? "Moved back to draft." : openToStudents
        ? "Published. Your students can now pick this expression."
        : "Published. Your students will see it once expressions open to them.");
    }
  }
  async function move(index: number, direction: -1 | 1) {
    if (!expressions) return;
    const expected = expressions.map((row) => row.id);
    const ids = [...expected];
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    const rows = await reorderExpressions(token, ids, expected);
    if (canUpdate()) { setExpressions(rows); setNotice("Order saved."); }
  }
  const query = searchExpression(search.trim());
  const rows = expressions ?? [];
  const themes = [...new Set(rows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b, "pt"));
  const visible = rows.filter((row) => (!theme || (theme === "__unthemed" ? !row.tags.length : row.tags.includes(theme))) &&
    (!query || searchExpression([row.expression, row.meaningPt, row.meaningEn, row.literalEn, ...row.examples, row.notes, ...row.tags].join(" ")).includes(query)));
  const filtered = Boolean(query || theme);

  return (
    <section className="teacher-expressions" aria-label="Expressions collection">
      <div className="teacher-expressions__intro">
        <dl lang="pt-PT">
          <dt>expressão idiomática <span>nome feminino</span></dt>
          <dd>Conjunto de palavras com um significado próprio, diferente do seu sentido literal.</dd>
        </dl>
        <div className="teacher-expressions__intro-actions">
          <Link className="button button--outline" href="/idioms/">
            <Eye size={17} aria-hidden="true" />
            View page
          </Link>
          <button className="button button--coral" ref={addButton} type="button" disabled={!expressions || busy}
            onClick={() => setDialog({ expression: null, preview: false })}>
            <Plus size={17} aria-hidden="true" />
            Add an expression
          </button>
        </div>
      </div>
      {rows.length ? <TeacherExpressionTryOut accountId={accountId} rows={rows} token={token} /> : null}
      <ul className="booking-payment-facts teacher-expressions__help">
        {openToStudents === true ? <li>Your students can pick published expressions from Your lessons.</li> : null}
        {openToStudents === false ? <li>Only you can see expressions for now.{rows.length ? " Paint one above to see what your students will get." : ""}</li> : null}
        <li>Add both meanings and one or two examples before publishing.</li>
      </ul>
      <div className="teacher-form teacher-expressions__filters">
        <label><span>Search expressions</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Expression, meaning or example" /></label>
        <label><span>Theme</span><select value={theme} onChange={(event) => setTheme(event.target.value)}>
          <option value="">All themes</option>
          <option value="__unthemed">Without a theme</option>
          {themes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        {filtered ? <button className="button button--outline button--compact" type="button" onClick={() => { setSearch(""); setTheme(""); }}>Clear filters</button> : null}
      </div>
      {pendingTranslations !== null ? <TranslationsReview initialPending={pendingTranslations} token={token} /> : null}
      {notice ? <p className="teacher-inline-success" role="status">{notice}</p> : null}
      {error ? <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" disabled={busy} onClick={() => setAttempt((value) => value + 1)} type="button">Reload collection</button></div> : null}
      {!expressions && !error ? <p role="status">Loading expressions…</p> : null}
      {expressions && !rows.length ? <p>Your collection is empty. Add your first expression.</p> : null}
      {rows.length > 0 && !visible.length ? <p role="status">No expressions match those filters.</p> : null}
      {filtered && visible.length ? <p className="teacher-expressions__hint">Clear the filters to change the order.</p> : null}
      <div className="teacher-expressions__list">
        {visible.map((item) => {
          const index = rows.findIndex((row) => row.id === item.id);
          return (
            <div className="teacher-expression" data-expression-id={item.id} key={item.id}>
              <div className="teacher-expression__head">
                <span className={`teacher-receipts__state${item.published ? " is-ready" : ""}`}>{item.published ? "Published" : "Draft"}</span>
                <div className="teacher-expression__order">
                  <button className="teacher-icon-button" type="button" disabled={busy || filtered || index === 0} aria-label={`Move ${item.expression} up`} onClick={() => void change(() => move(index, -1))}><ArrowUp size={18} aria-hidden="true" /></button>
                  <button className="teacher-icon-button" type="button" disabled={busy || filtered || index === rows.length - 1} aria-label={`Move ${item.expression} down`} onClick={() => void change(() => move(index, 1))}><ArrowDown size={18} aria-hidden="true" /></button>
                </div>
              </div>
              <ExpressionCard expression={item} />
              <div className="teacher-expression__actions">
                <button className="button button--lilac button--compact" type="button" disabled={busy} onClick={() => setDialog({ expression: item, preview: false })}>Edit</button>
                <button className="button button--lilac button--compact" type="button" disabled={busy} onClick={() => setDialog({ expression: item, preview: true })}>
                  <Eye size={16} aria-hidden="true" />Preview<span className="visually-hidden"> as students see it: {item.expression}</span>
                </button>
                <button className="button button--lilac button--compact" type="button" disabled={busy} onClick={() => void change(() => publish(item))}>{item.published ? "Unpublish" : "Publish"}</button>
              </div>
            </div>
          );
        })}
      </div>
      {dialog ? <ExpressionDialog key={`${dialog.expression?.id ?? "new"}-${dialog.preview}`} expression={dialog.expression} preview={dialog.preview} openToStudents={openToStudents === true} fallbackFocus={addButton} onSave={save} onDelete={remove} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}
