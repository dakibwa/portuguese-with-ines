"use client";

import { LANGUAGE_CODE } from "@/lib/tutor";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { EditPencil } from "@/components/teacher/EditControls";
import { ExpressionCard } from "@/components/expressions/ExpressionCard";
import { TeacherExpressionTryOut } from "@/components/expressions/TeacherExpressionTryOut";
import { ExpressionEditor } from "@/components/teacher/ExpressionEditor";
import { TranslationsReview } from "@/components/teacher/TranslationsReview";
import { deleteExpression, fetchExpressions, publishExpression, reorderExpressions, saveExpression } from "@/lib/admin-api";
import { readSession } from "@/lib/auth-api";
import { forgetTranslations } from "@/lib/expression-translations-api";
import { searchExpression, type Expression, type ExpressionInput } from "@/lib/expressions";

export function ExpressionsTab({ token, accountId, onEditingChange, onReveal }: { token: string; accountId: string; onEditingChange?: (editing: boolean) => void; onReveal?: () => void }) {
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
  /** The one card open for editing where it stands: an expression's id, or "new" at the head of the list. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Where focus goes once the card closes: its pencil, or Add an expression. */
  const [refocus, setRefocus] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Keep the editor alive if she briefly visits another schedule tab.
  useEffect(() => {
    onEditingChange?.(editing !== null);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);

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

  useLayoutEffect(() => {
    if (!refocus || editing) return;
    const pencil = list.current?.querySelector<HTMLElement>(`[data-expression-id="${CSS.escape(refocus)}"] [data-edit="expression"]`);
    (pencil ?? addButton.current)?.focus();
    setRefocus(null);
  }, [refocus, editing, expressions]);

  const canUpdate = () => active.current && readSession() === token;
  const open = (id: string) => { setNotice(""); setError(""); setEditing(id); };
  const close = (id: string) => { setEditing(null); setRefocus((saved) => saved ?? id); };
  const replace = (saved: Expression) => {
    if (!canUpdate()) return;
    setExpressions((rows) => [...(rows ?? []).filter((row) => row.id !== saved.id), saved]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)));
  };
  async function save(input: ExpressionInput, previous: Expression | null) {
    const saved = await saveExpression(token, input, previous ?? undefined);
    if (canUpdate()) { replace(saved); setRefocus(saved.id); setNotice(saved.published ? "Expression saved." : "Draft saved."); }
  }
  async function remove(expression: Expression) {
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
      forgetTranslations(item.id);
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
  // A filter may hide a reading card, but never unmount a card she is writing.
  const visible = rows.filter((row) => row.id === editing || ((!theme || (theme === "__unthemed" ? !row.tags.length : row.tags.includes(theme))) &&
    (!query || searchExpression([row.expression, row.meaningPt, row.meaningEn, row.literalEn, ...row.examples, row.notes, ...row.tags].join(" ")).includes(query))));
  const filtered = Boolean(query || theme);

  return (
    <section className="teacher-expressions" aria-label="Expressions collection">
      <div className="teacher-expressions__intro">
        <dl lang={LANGUAGE_CODE}>
          <dt>expressão idiomática <span>nome feminino</span></dt>
          <dd>Conjunto de palavras com um significado próprio, diferente do seu sentido literal.</dd>
        </dl>
        <div className="teacher-expressions__intro-actions">
          <Link className="teacher-quiet" href="/idioms/">
            View page
          </Link>
          <button className="button button--coral button--small" ref={addButton} type="button" disabled={!expressions || busy || editing !== null}
            onClick={() => open("new")}>
            <Plus size={17} aria-hidden="true" />
            Add an expression
          </button>
        </div>
      </div>
      {rows.length ? <TeacherExpressionTryOut accountId={accountId} rows={rows} token={token} /> : null}
      <ul className="booking-payment-facts teacher-expressions__help">
        {openToStudents === true ? <li>Your students can pick published expressions from Your lessons.</li> : null}
        {openToStudents === false ? <li>Only you can see expressions for now.</li> : null}
      </ul>
      <div className="teacher-form teacher-expressions__filters">
        <label><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="A word or phrase" /></label>
        <label><span>Theme</span><select value={theme} onChange={(event) => setTheme(event.target.value)}>
          <option value="">All themes</option>
          <option value="__unthemed">Without a theme</option>
          {themes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        {filtered ? <button className="teacher-quiet" type="button" onClick={() => { setSearch(""); setTheme(""); }}>Clear filters</button> : null}
      </div>
      {pendingTranslations !== null ? <TranslationsReview initialPending={pendingTranslations} token={token} /> : null}
      {notice ? <p className="teacher-inline-success" role="status">{notice}</p> : null}
      {error ? <div className="teacher-inline-error" role="alert"><p>{error}</p><button className="button button--outline button--small" disabled={busy} onClick={() => setAttempt((value) => value + 1)} type="button">Reload collection</button></div> : null}
      {!expressions && !error ? <p className="teacher-expressions__hint" role="status">Loading expressions…</p> : null}
      {expressions && !rows.length ? <p className="teacher-expressions__hint">Your collection is empty. Add your first expression.</p> : null}
      {rows.length > 0 && !visible.length ? <p className="teacher-expressions__hint" role="status">No expressions match those filters.</p> : null}
      {filtered && visible.length ? <p className="teacher-expressions__hint">Clear the filters to change the order.</p> : null}
      <div className="teacher-expressions__list" ref={list}>
        {editing === "new" ? (
          <div className="teacher-expression is-editing" data-expression-id="new">
            <ExpressionEditor expression={null} onReveal={onReveal} onSave={(input) => save(input, null)} onDelete={async () => {}} onClose={() => close("new")} />
          </div>
        ) : null}
        {visible.map((item) => {
          const index = rows.findIndex((row) => row.id === item.id);
          if (editing === item.id) return (
            <div className="teacher-expression is-editing" data-expression-id={item.id} key={item.id}>
              <ExpressionEditor expression={item} onReveal={onReveal} onSave={(input) => save(input, item)} onDelete={() => remove(item)} onClose={() => close(item.id)} />
            </div>
          );
          return (
            <div className="teacher-expression" data-expression-id={item.id} key={item.id}>
              <div className="teacher-expression__head">
                <span className={`teacher-receipts__state${item.published ? " is-ready" : ""}`}>{item.published ? "Published" : "Draft"}</span>
                <button className="teacher-quiet" type="button" disabled={busy} onClick={() => void change(() => publish(item))}>{item.published ? "Unpublish" : "Publish"}<span className="visually-hidden"> {item.expression}</span></button>
                <div className="teacher-expression__order">
                  <button className="teacher-icon-button" type="button" disabled={busy || filtered || index === 0} aria-label={`Move ${item.expression} up`} onClick={() => void change(() => move(index, -1))}><ArrowUp size={18} aria-hidden="true" /></button>
                  <button className="teacher-icon-button" type="button" disabled={busy || filtered || index === rows.length - 1} aria-label={`Move ${item.expression} down`} onClick={() => void change(() => move(index, 1))}><ArrowDown size={18} aria-hidden="true" /></button>
                </div>
              </div>
              <ExpressionCard expression={item} edit={<EditPencil field="expression" label="Edit" disabled={busy || editing !== null} onEdit={() => open(item.id)} />} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
