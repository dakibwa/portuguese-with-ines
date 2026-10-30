"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { ExpressionCard } from "@/components/expressions/ExpressionCard";
import { EMPTY_EXPRESSION, expressionInput, type Expression, type ExpressionInput } from "@/lib/expressions";
import { keepDialogFocus, restoreDialogFocus } from "@/lib/dialog-focus";
import { useDialogBackdrop } from "@/lib/dialog-backdrop";
import { lockPageScroll } from "@/lib/scroll-lock";

export function ExpressionDialog({ expression, preview, openToStudents, fallbackFocus, onSave, onDelete, onClose }: {
  expression: Expression | null;
  preview: boolean;
  /** Whether students can see expressions yet, so the preview's note says only what is true. */
  openToStudents: boolean;
  fallbackFocus: RefObject<HTMLButtonElement | null>;
  onSave: (input: ExpressionInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const original = expressionInput(expression ?? EMPTY_EXPRESSION);
  const [draft, setDraft] = useState(original);
  const [themes, setThemes] = useState(original.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original) || themes !== original.tags.join(", ");
  const close = () => { if (!pending.current) { if (!preview && dirty) setConfirm("discard"); else onClose(); } };
  const backdrop = useDialogBackdrop(close);

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallback = fallbackFocus.current;
    const releaseScroll = lockPageScroll();
    const dialog = dialogRef.current;
    dialog?.showModal();
    (preview ? heading.current : firstField.current)?.focus({ preventScroll: true });
    return () => {
      dialog?.close(); releaseScroll();
      restoreDialogFocus(previous?.isConnected ? previous : fallback);
    };
  }, [preview, fallbackFocus]);

  useLayoutEffect(() => { if (confirm) heading.current?.focus(); }, [confirm]);

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
  const title = confirm === "delete" ? "Delete this expression?" : confirm === "discard" ? "Discard your changes?"
    : preview ? "Preview as students see it" : expression ? "Edit expression" : "Add an expression";

  return (
    <dialog className={`teacher-lesson-dialog expression-dialog${preview ? " expression-dialog--preview" : ""}`}
      ref={dialogRef} {...backdrop} aria-labelledby="expression-dialog-title" onKeyDown={keepDialogFocus}
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <button className="teacher-dialog-close" aria-label="Close expression" type="button" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button>
      <h2 id="expression-dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
      {confirm ? (
        <>
          <ul className="booking-payment-facts">
            <li>{confirm === "delete" ? <>“{expression?.expression}” will be removed from the collection.</> : "Your unsaved changes will be lost."}</li>
          </ul>
          {error ? <p className="teacher-inline-error" role="alert">{error}</p> : null}
          <div className="teacher-dialog-actions">
            <button className="button button--coral" type="button" disabled={busy} onClick={() => confirm === "delete" ? void act(true) : onClose()}>{busy ? "Deleting…" : confirm === "delete" ? "Delete expression" : "Discard changes"}</button>
            <button className="button button--outline" type="button" disabled={busy} onClick={() => { setConfirm(null); setError(""); }}>Keep editing</button>
          </div>
        </>
      ) : preview && expression ? (
        <>
          <p className="expression-dialog__hint">This is a private preview. {openToStudents ? "Students can only pick published expressions." : "Students don’t see expressions yet."}</p>
          <ExpressionCard expression={expression} />
          <div className="teacher-dialog-actions"><button className="button button--outline" type="button" onClick={onClose}>Done</button></div>
        </>
      ) : (
        <form className="teacher-form expression-form" onSubmit={(event) => { event.preventDefault(); void act(); }}>
          <label className="expression-form__wide"><span>Expression</span><input ref={firstField} lang="pt-PT" value={draft.expression} required maxLength={240} disabled={busy} onChange={(event) => edit("expression", event.target.value)} /></label>
          <label><span>Meaning in Portuguese</span><textarea lang="pt-PT" value={draft.meaningPt} maxLength={2000} rows={3} disabled={busy} onChange={(event) => edit("meaningPt", event.target.value)} /></label>
          <label><span>Meaning or equivalent in English</span><textarea lang="en" value={draft.meaningEn} maxLength={2000} rows={3} disabled={busy} onChange={(event) => edit("meaningEn", event.target.value)} /></label>
          <label className="expression-form__wide"><span>Example</span><textarea lang="pt-PT" value={draft.examples[0] ?? ""} maxLength={1200} rows={2} disabled={busy} onChange={(event) => example(0, event.target.value)} /></label>
          <label className="expression-form__wide"><span>Another example (optional)</span><textarea lang="pt-PT" value={draft.examples[1] ?? ""} maxLength={1200} rows={2} disabled={busy} onChange={(event) => example(1, event.target.value)} /></label>
          <label className="expression-form__wide"><span>Themes (optional, separated by commas)</span><input value={themes} maxLength={334} disabled={busy} onChange={(event) => setThemes(event.target.value)} /></label>
          <details className="expression-form__more expression-form__wide" open={Boolean(expression?.imageUrl || expression?.notes || expression?.literalEn || expression?.sourceUrl) || undefined}>
            <summary>Translation, notes and image</summary>
            <div>
              <label><span>Literal English translation (optional)</span><textarea lang="en" value={draft.literalEn} maxLength={500} rows={2} disabled={busy} onChange={(event) => edit("literalEn", event.target.value)} /></label>
              <label><span>Notes and/or origin (optional)</span><textarea lang="pt-PT" value={draft.notes} maxLength={2000} rows={3} disabled={busy} onChange={(event) => edit("notes", event.target.value)} /></label>
              <label><span>Reference link (optional)</span><input type="url" value={draft.sourceUrl} maxLength={2048} disabled={busy} onChange={(event) => edit("sourceUrl", event.target.value)} /></label>
              <label><span>Image on this website (optional)</span><input value={draft.imageUrl} placeholder="/visuals/expressions/name.webp" maxLength={2048} disabled={busy} onChange={(event) => edit("imageUrl", event.target.value)} /></label>
              <label><span>Image description (needed with an image)</span><input value={draft.imageAlt} maxLength={240} required={Boolean(draft.imageUrl)} disabled={busy} onChange={(event) => edit("imageAlt", event.target.value)} /></label>
            </div>
          </details>
          {error ? <p className="teacher-inline-error expression-form__wide" role="alert">{error}</p> : null}
          <div className="teacher-dialog-actions expression-form__wide">
            <button className="button button--coral" type="submit" disabled={busy}>{busy ? "Saving…" : expression?.published ? "Save changes" : "Save draft"}</button>
            <button className="button button--outline" type="button" disabled={busy} onClick={close}>Cancel</button>
          </div>
          {expression ? <button className="button button--outline button--small expression-form__delete" type="button" disabled={busy} onClick={() => { setConfirm("delete"); setError(""); }}>Delete expression</button> : null}
        </form>
      )}
    </dialog>
  );
}
