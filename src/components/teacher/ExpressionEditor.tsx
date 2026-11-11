"use client";

import { LANGUAGE_CODE } from "@/lib/tutor";
import { useEffect, useId, useRef, useState } from "react";
import { CancelEdit, EditActions } from "@/components/teacher/EditControls";
import { EMPTY_EXPRESSION, expressionInput, type Expression, type ExpressionInput } from "@/lib/expressions";

/**
 * An expression edited where it stands (10 November 2026, Dan: "the edit
 * button should let you edit it from that interface and not bring up a new
 * one"): the card itself, each line its field in the line's own place under
 * the label it already shows, ending in the tick and cross. A new expression
 * is the same card, empty. Escape cancels; what cannot be saved is said at
 * its foot and the card stays open.
 */
export function ExpressionEditor({ expression, onSave, onDelete, onClose, onReveal }: {
  expression: Expression | null;
  onSave: (input: ExpressionInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  onReveal?: () => void;
}) {
  const original = expressionInput(expression ?? EMPTY_EXPRESSION);
  const [draft, setDraft] = useState(original);
  const [themes, setThemes] = useState(original.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  /** A question asked at the card's foot before something is lost. */
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  /** The field she was in, for focus once she goes back to editing. */
  const lastField = useRef<HTMLElement | null>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  const backToEditing = useRef(false);
  const destination = useRef<string | null>(null);
  const discarded = useRef(false);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  // The tick is disabled while it saves; a refusal hands focus back to it, so Escape still reaches the card.
  useEffect(() => { if (error && !busy) form.current?.querySelector<HTMLElement>(".teacher-edit-save, .button--coral")?.focus(); }, [error, busy]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original) || themes !== original.tags.join(", ");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (discarded.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    // Next's links can leave without unloading the document. Use the card's
    // existing discard choice, including when the draft is on another tab.
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || link.hasAttribute("data-terms-privacy") || (link.target && link.target !== "_self")) return;
      const next = new URL(link.href);
      if (!/^https?:$/.test(next.protocol) || (next.origin === location.origin && next.pathname === location.pathname && next.search === location.search && next.hash)) return;
      event.preventDefault();
      destination.current = next.href;
      setConfirm("discard"); setError("");
      onReveal?.();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty, onReveal]);
  useEffect(() => {
    if (confirm === "discard") discardButton.current?.focus();
    else if (!confirm && backToEditing.current) {
      backToEditing.current = false;
      (lastField.current?.isConnected ? lastField.current : form.current?.querySelector<HTMLElement>(".teacher-edit-save:not(:disabled)"))?.focus();
    }
  }, [confirm]);
  // Typed text is never thrown away by one stray key: with changes, cancelling asks first.
  const cancel = () => { destination.current = null; if (dirty) { setConfirm("discard"); setError(""); } else onClose(); };
  const back = () => { destination.current = null; backToEditing.current = true; setConfirm(null); setError(""); };
  const discard = () => {
    discarded.current = true;
    const next = destination.current;
    destination.current = null;
    onClose();
    if (next) window.location.assign(next);
  };

  async function act(remove = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (remove) await onDelete();
      else await onSave({ ...draft, examples: draft.examples.filter((value) => value.trim()), tags: themes.split(",").map((tag) => tag.trim()).filter(Boolean) });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The expression couldn’t be saved. Please try again.");
    } finally { pending.current = false; setBusy(false); }
  }
  const edit = (field: keyof ExpressionInput, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const example = (index: number, value: string) => setDraft((current) => {
    const examples = [...current.examples];
    while (examples.length <= index) examples.push("");
    examples[index] = value;
    return { ...current, examples };
  });
  // The card's own lines, in its order, each with the label it shows.
  const facts = [
    { key: "literal", field: "literalEn", label: "Tradução à letra", lang: "en", max: 500 },
    { key: "meaning", field: "meaningPt", label: "Quer dizer", lang: LANGUAGE_CODE, max: 2000 },
    { key: "english", field: "meaningEn", label: "Em inglês", lang: "en", max: 2000 },
    { key: "notes", field: "notes", label: "Notas e/ou origem", lang: LANGUAGE_CODE, max: 2000 },
  ] as const;

  return (
    <form ref={form} className="expression-card teacher-form teacher-expression__editor" lang={LANGUAGE_CODE} aria-label={expression ? `Edit ${expression.expression}` : "New expression"}
      onSubmit={(event) => { event.preventDefault(); void act(); }}
      onFocus={(event) => { if (event.target.matches("input, textarea")) lastField.current = event.target; }}
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); if (confirm) back(); else cancel(); } }}>
      <input className="expression-card__title teacher-expression__title-field" aria-label="Expression" autoFocus value={draft.expression} required maxLength={240}
        disabled={busy} placeholder="Expressão" onChange={(event) => edit("expression", event.target.value)} />
      <dl className="expression-card__meanings">
        {facts.map((fact) => (
          <div className="expression-card__fact" data-fact={fact.key} key={fact.key}>
            <dt className="expression-card__label"><label htmlFor={`${id}-${fact.key}`}>{fact.label}</label></dt>
            <dd><textarea id={`${id}-${fact.key}`} lang={fact.lang} value={draft[fact.field]} maxLength={fact.max} rows={1} disabled={busy}
              onChange={(event) => edit(fact.field, event.target.value)} /></dd>
          </div>
        ))}
      </dl>
      <div className="expression-card__examples">
        <h4 className="expression-card__label" id={`${id}-examples`}>Exemplos</h4>
        <ul>
          {[0, 1].map((index) => <li key={index}><textarea aria-label={index ? "Another example" : "Example"} aria-describedby={`${id}-examples`} value={draft.examples[index] ?? ""} maxLength={1200} rows={1} disabled={busy}
            placeholder={index ? "Outro exemplo (opcional)" : undefined} onChange={(event) => example(index, event.target.value)} /></li>)}
        </ul>
      </div>
      <div className="expression-card__extras">
        <input aria-label="Themes" lang="en" value={themes} maxLength={334} disabled={busy} placeholder="Themes, separated by commas" onChange={(event) => setThemes(event.target.value)} />
      </div>
      <details className="expression-form__more" lang="en" open={Boolean(expression?.imageUrl || expression?.sourceUrl) || undefined}>
        <summary>Image and link</summary>
        <div>
          <label><span>Reference link</span><input type="url" value={draft.sourceUrl} maxLength={2048} disabled={busy} onChange={(event) => edit("sourceUrl", event.target.value)} /></label>
          <label><span>Image on this website</span><input value={draft.imageUrl} placeholder="/visuals/expressions/name.webp" maxLength={2048} disabled={busy} onChange={(event) => edit("imageUrl", event.target.value)} /></label>
          <label><span>Image description</span><input value={draft.imageAlt} maxLength={240} required={Boolean(draft.imageUrl)} disabled={busy} onChange={(event) => edit("imageAlt", event.target.value)} /></label>
        </div>
      </details>
      {error ? <p className="teacher-inline-error" role="alert" lang="en">{error}</p> : null}
      <div className="teacher-expression__foot" lang="en">
        {confirm === "delete" ? <>
          <span className="teacher-expression__confirm">Delete “{expression?.expression}”?</span>
          <button className="button button--coral button--small" type="button" disabled={busy} onClick={() => void act(true)}>{busy ? "Deleting…" : "Delete"}</button>
          <CancelEdit disabled={busy} onCancel={back} />
        </> : confirm === "discard" ? <>
          <span className="teacher-expression__confirm">Discard your changes?</span>
          <button className="button button--coral button--small" ref={discardButton} type="button" onClick={discard}>Discard</button>
          <CancelEdit onCancel={back} />
        </> : <>
          {expression ? <button className="teacher-quiet" type="button" disabled={busy} onClick={() => { setConfirm("delete"); setError(""); }}>Delete expression</button> : null}
          <EditActions busy={busy} saveDisabled={!dirty} saveLabel={expression?.published ? "Save changes" : "Save draft"} onCancel={cancel} />
        </>}
      </div>
    </form>
  );
}
