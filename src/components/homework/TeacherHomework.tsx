"use client";

import { LANGUAGE, LANGUAGE_CODE, LANGUAGE_VARIETY } from "@/lib/tutor";
import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Camera, Sparkles, CheckCircle2, ChevronDown, Lock, PenLine, Plus, RotateCcw, Send, SlidersHorizontal, Trash2, X } from "lucide-react";
import { HOMEWORK_PHOTO_LIMIT, prepareHomeworkPhoto, teacherHomeworkRequest, type HomeworkSheet, type TeacherHomeworkData, type HomeworkMark } from "@/lib/homework-api";
import { readSession } from "@/lib/auth-api";
import { HomeworkSplat } from "./HomeworkArt";
import { HomeworkWorksheet } from "./HomeworkWorksheet";

const emptySheet = (): HomeworkSheet => ({
  title: "Vamos praticar", objective: "", reminder: "Amanhã, tenta recordar três coisas que praticaste, sem olhar para a ficha.",
  sections: [{ title: "Recorda", instruction: "", example: "", questions: [{ id: "q1", prompt: "", answer: "", explanation: "" }] }],
});

export function TeacherHomework({ bookingId, token, onBusy }: { bookingId: string; token: string; onBusy?: (busy: boolean) => void }) {
  const inputId = useId();
  const [saved, setSaved] = useState<TeacherHomeworkData | null>(null);
  const [draft, setDraft] = useState<TeacherHomeworkData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Pictures pasted or added beside the notes, read when the sheet is written.
  const [photos, setPhotos] = useState<string[]>([]);
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [reviewed, setReviewed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reviewMarks, setReviewMarks] = useState<Record<string, HomeworkMark> | null>(null);
  const active = useRef(true);
  const editor = useRef<HTMLElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const dirty = Boolean(draft && saved && (JSON.stringify(draft) !== JSON.stringify(saved) ||
    (reviewMarks && JSON.stringify(reviewMarks) !== JSON.stringify(saved.progress.submission?.marks))));
  // Unread pictures are work too: leaving would lose them.
  const unsaved = dirty || photos.length > 0;
  // A new sheet is one box and one button (11 November 2026, Dan: "very
  // simple, Inês should be able to paste in text or pictures and then it
  // generates"): no steps, and nothing to choose first.
  const start = Boolean(draft && !draft.sheet && !draft.publishedAt);

  useEffect(() => {
    active.current = true;
    const abort = new AbortController(); controller.current = abort;
    void teacherHomeworkRequest(token, bookingId, "", undefined, abort.signal).then(result => {
      if (!active.current || readSession() !== token) return;
      setDraft(result); setSaved(result);
    }).catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => { active.current = false; abort.abort(); };
  }, [bookingId, token, attempt]);
  useEffect(() => {
    if (draft?.progress.submission?.state !== "marking") return;
    const abort = new AbortController();
    let pending = false;
    const interval = window.setInterval(() => {
      if (pending) return;
      pending = true;
      void teacherHomeworkRequest(token, bookingId, "", undefined, abort.signal).then(result => {
        if (!abort.signal.aborted && active.current && readSession() === token) { setDraft(result); setSaved(result); }
      }).catch(() => {}).finally(() => { pending = false; });
    }, 5000);
    // A late marking read must not replace the review Inês has begun editing.
    return () => { window.clearInterval(interval); abort.abort(); };
  }, [bookingId, token, draft?.progress.submission?.state]);
  useEffect(() => { onBusy?.(Boolean(busy)); }, [busy, onBusy]);
  // With a keyboard, the box is ready for Ctrl+V as it opens, and comes into
  // view if its row was low on the page. A phone keeps its keyboard down
  // until she taps the box.
  useEffect(() => {
    if (start && window.matchMedia("(hover: hover) and (pointer: fine)").matches) box.current?.focus();
  }, [start]);
  useEffect(() => {
    if (!unsaved && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { if (unsaved) event.preventDefault(); };
    // Rows, tabs, the dialog backdrop and site links can all remove this editor
    // without a document unload. Guard those exits before their handlers run.
    const leave = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || editor.current?.contains(target)) return;
      if (event.type === "click") {
        const click = event as MouseEvent;
        if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
        const link = target.closest<HTMLAnchorElement>("a[href]");
        const button = target.closest("button");
        const dialog = target instanceof HTMLDialogElement ? target : null;
        const bounds = dialog?.getBoundingClientRect();
        const backdrop = bounds && (click.clientX < bounds.left || click.clientX > bounds.right || click.clientY < bounds.top || click.clientY > bounds.bottom);
        if (link) {
          if (link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
          const url = new URL(link.href);
          if (!/^https?:$/.test(url.protocol) || (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
        } else if (!button?.closest("[data-homework-exit]") && !backdrop) return;
      }
      if (event.type === "beforeinput" && !target.matches("input[data-homework-exit]")) return;
      if (busy || !window.confirm("Leave without saving this homework draft?")) {
        event.preventDefault(); event.stopImmediatePropagation();
      } else {
        setDraft(saved); setReviewMarks(null); setReviewed(false); setPhotos([]);
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    document.addEventListener("cancel", leave, true);
    document.addEventListener("beforeinput", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
      document.removeEventListener("cancel", leave, true);
      document.removeEventListener("beforeinput", leave, true);
    };
  }, [unsaved, busy, saved]);

  function edit(values: Partial<TeacherHomeworkData>) {
    if (!draft) return;
    setDraft({ ...draft, ...values }); setReviewed(false); setNotice("");
  }
  async function addPhotos(files: File[]) {
    const images = files.filter(file => file.type.startsWith("image/"));
    const chosen = images.slice(0, HOMEWORK_PHOTO_LIMIT - photos.length);
    if (!chosen.length) { if (images.length) setError(`Add up to ${HOMEWORK_PHOTO_LIMIT} pictures at a time.`); return; }
    setBusy("photo"); setError("");
    try {
      const prepared = await Promise.all(chosen.map(prepareHomeworkPhoto));
      if (active.current) setPhotos(current => [...current, ...prepared].slice(0, HOMEWORK_PHOTO_LIMIT));
    } catch (error) { if (active.current) setError((error as Error).message); }
    finally { if (active.current) setBusy(""); }
  }
  // Pictures arrive as the notes do: pasted, dropped or picked. Text pasted
  // anywhere in the box joins the notes, wherever the cursor was left.
  const intake = draft && !busy ? {
    onPaste: (event: ClipboardEvent) => {
      const pasted = event.clipboardData.getData("text/plain");
      // A document or spreadsheet copies as its text and a picture of it: the text is what she means.
      if (pasted.trim()) {
        if (event.target instanceof HTMLTextAreaElement) return;
        event.preventDefault(); edit({ notes: [draft.notes, pasted.trim()].filter(Boolean).join("\n").slice(0, 10000) });
      } else if (draft.aiAvailable && event.clipboardData.files.length) {
        event.preventDefault(); void addPhotos([...event.clipboardData.files]);
      }
    },
    ...(draft.aiAvailable ? {
      onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); },
      onDrop: (event: DragEvent) => { if (event.dataTransfer.files.length) { event.preventDefault(); void addPhotos([...event.dataTransfer.files]); } },
    } : {}),
  } : {};
  // Saves, generates, publishes or returns the draft as it stands. Generating
  // sends her notes and pictures together: one request reads and writes.
  async function run(action: "save" | "generate" | "publish" | "return") {
    if (!draft || busy) return;
    setBusy(action); setError(""); setNotice("");
    try {
      const result = await teacherHomeworkRequest(token, bookingId, action === "save" ? "" : action,
        action === "return" ? { submissionId: draft.progress.submission?.id, updatedAt: draft.progress.updatedAt,
          marks: reviewMarks ?? draft.progress.submission?.marks, approved: true }
          : action === "generate" ? { notes: draft.notes, level: draft.level, minutes: draft.minutes, images: photos, updatedAt: draft.updatedAt }
          : { notes: draft.notes, level: draft.level, minutes: draft.minutes, sheet: draft.sheet, updatedAt: draft.updatedAt, reviewed }, controller.current?.signal);
      if (!active.current || readSession() !== token) return;
      setDraft(result); setSaved(result); setReviewMarks(null); setReviewed(false);
      if (action === "generate") setPhotos([]);
      if (action !== "save") setMode("preview");
      setNotice(action === "return" ? "Done. Your feedback is with the student." : action === "publish" ? "Published to the student’s Homework." : action === "generate" ? "Draft ready." : "Draft saved.");
      if (action === "return") window.dispatchEvent(new Event("homework-returned"));
    } catch (error) { if (active.current) setError((error as Error).message); }
    finally { if (active.current) setBusy(""); }
  }
  function make() {
    if (draft?.sheet && !window.confirm("Replace this draft with a new sheet? Your lesson notes will stay.")) return;
    void run("generate");
  }

  const canMake = Boolean(photos.length) || (draft?.notes.trim().length ?? 0) >= 10;
  // The pictures waiting beside the notes, then the way to add one. A phone
  // offers its camera or its library; a computer opens its files.
  const pictures = draft?.aiAvailable ? <div className="homework-pictures">
    {photos.length ? <ul className="homework-photos" aria-label="Pictures to read">
      {photos.map((image, index) => <li key={index}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={`Picture ${index + 1}`} />
        <button type="button" className="homework-photo-remove" aria-label={`Remove picture ${index + 1}`} disabled={Boolean(busy)} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X size={15} aria-hidden="true" /></button>
      </li>)}
    </ul> : null}
    {photos.length < HOMEWORK_PHOTO_LIMIT ? <label className="homework-option"><Camera size={17} aria-hidden="true" />Add a picture
      <input type="file" accept="image/*" multiple className="visually-hidden" disabled={Boolean(busy)}
        onChange={event => { const input = event.target; void addPhotos([...(input.files ?? [])]).finally(() => { input.value = ""; }); }} /></label> : null}
  </div> : null;
  const notesField = (labelledBy?: string) => draft ? <textarea id={`${inputId}-notes`} ref={labelledBy ? box : undefined} className="homework-notes__field" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "Lesson notes"} value={draft.notes} rows={5} maxLength={10000}
    onChange={event => edit({ notes: event.target.value })} placeholder={draft.aiAvailable ? "Paste the chat, your notes or a picture" : "Words, grammar and examples from the lesson"} /> : null;
  // Fine-tune and Save draft: beside the format control under a preview, on their own row above the editor.
  const draftTools = draft ? <>
    {draft.sheet ? <button type="button" className="homework-link homework-finetune" aria-pressed={mode === "edit"} disabled={Boolean(busy)} onClick={() => setMode(value => value === "edit" ? "preview" : "edit")}>
      <SlidersHorizontal size={15} aria-hidden="true" />Fine-tune</button> : null}
    {/* As in Your details, saving appears once there is something to save. */}
    {dirty || busy === "save" ? <button className="button button--outline" type="button" disabled={Boolean(busy)} onClick={() => void run("save")}>{busy === "save" ? "Saving…" : "Save draft"}</button> : null}
  </> : null;
  const returned = Boolean(draft?.progress.submission?.returnedAt);
  // The one place the draft's privacy is told: a lock, its words on hover and for screen readers.
  const privateNote = `Private draft: only you can see it.${draft?.aiAvailable ? " Anthropic reads your notes and pictures to write the sheet; this site doesn’t keep the pictures." : ""}`;
  const firstName = draft?.studentName.split(" ")[0] ?? "";

  return <section className="teacher-homework" ref={editor} aria-labelledby={`${inputId}-title`}>
    <div className="homework-toolbar homework-toolbar--head"><h3 id={`${inputId}-title`}><HomeworkSplat seed={bookingId} className="homework-heading-mark" />Homework</h3>
      {draft ? returned ? <span className="homework-status homework-status--returned homework-status--done"><CheckCircle2 size={15} aria-hidden="true" />Done</span>
        : draft.publishedAt ? <span className="homework-status homework-status--published"><Send size={14} aria-hidden="true" />Published</span>
        : <span className="homework-private" title={privateNote}><Lock size={15} aria-hidden="true" /><span className="visually-hidden">{privateNote}</span></span> : null}
    </div>
    {error && !draft ? <div className="homework-error" role="alert"><p>{error}</p><button type="button" className="button button--outline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button></div> : null}
    {!draft && !error ? <p className="homework-loading" role="status">Loading homework…</p> : null}
    {draft && start ? busy === "generate" ? <HomeworkWorking seed={bookingId} />
      : <div className="homework-step" {...intake}>
        <h4 id={`${inputId}-step`}><HomeworkSplat seed={`${bookingId}-what`} className="homework-step__mark" />What did you work on?</h4>
        {notesField(`${inputId}-step`)}
        {pictures}
        {draft.aiAvailable
          ? <button className="button button--coral homework-make" type="button" disabled={!canMake || Boolean(busy)} onClick={make}><Sparkles size={17} aria-hidden="true" />Generate homework</button>
          : <button className="button button--coral homework-make" type="button" onClick={() => { edit({ sheet: emptySheet() }); setMode("edit"); }}><PenLine size={17} aria-hidden="true" />Write the sheet</button>}
        {error ? <div className="homework-error" role="alert"><p>{error}</p></div> : null}
      </div> : null}
    {draft && !start && !draft.publishedAt ? <>
      <details className="homework-source">
        <summary><ChevronDown size={18} aria-hidden="true" /><strong>Lesson notes</strong><span>{draft.level} · {draft.minutes} mins</span><Lock size={13} aria-hidden="true" className="homework-source__lock" /></summary>
        <fieldset disabled={Boolean(busy)} {...intake}>
          {notesField()}
          {pictures}
          <div className="homework-settings">
            <Choices label="Level" options={levels.map(level => [level, level])} value={draft.level} onPick={level => edit({ level })} />
            <Choices label="Length" options={lengths.map(minutes => [String(minutes), `${minutes} mins`])} value={String(draft.minutes)} onPick={minutes => edit({ minutes: Number(minutes) })} />
          </div>
          {draft.aiAvailable ? <button className="button button--outline homework-remake" type="button" disabled={!canMake} onClick={make}><Sparkles size={17} aria-hidden="true" />Make a new draft</button> : null}
        </fieldset>
      </details>
      {busy === "generate" ? <HomeworkWorking seed={bookingId} /> : null}
      {error ? <div className="homework-error" role="alert"><p>{error}</p></div> : null}
      {draft.sheet && mode === "preview" ? null : <div className="homework-toolbar homework-toolbar--actions">{draftTools}</div>}
    </> : null}
    {draft?.publishedAt && error ? <div className="homework-error" role="alert"><p>{error}</p></div> : null}
    {draft?.sheet && draft.progress.submission && !draft.progress.submission.returnedAt ? <HomeworkReview
      sheet={draft.sheet} answers={draft.progress.submission.answers}
      marks={reviewMarks ?? draft.progress.submission.marks ?? {}}
      marking={draft.progress.submission.state === "marking"} note={draft.progress.submission.markingNote}
      busy={Boolean(busy)} onChange={setReviewMarks} onApprove={() => void run("return")} /> : draft?.sheet ? <>
      {returned ? <div className="homework-done" role="status">
        <span className="homework-done__dab" aria-hidden="true"><CheckCircle2 size={26} /></span>
        <span className="homework-done__text"><strong>Done</strong><small>{firstName} has your feedback</small></span>
        <HomeworkSplat seed={`${bookingId}-done`} className="homework-done__mark" />
      </div> : null}
      {!draft.publishedAt && mode === "edit" ? <SheetEditor sheet={draft.sheet} disabled={Boolean(busy)} ai={draft.aiAvailable} onChange={sheet => edit({ sheet })} />
        : <HomeworkWorksheet sheet={draft.sheet} level={draft.level} minutes={draft.minutes} lessonAt={draft.lessonAt}
          answers={draft.progress.submission?.answers ?? (draft.publishedAt ? draft.progress.answers : undefined)}
          marks={draft.progress.submission?.marks} markedAnswers={draft.progress.submission?.answers} preview tools={draft.publishedAt ? undefined : draftTools} />}
      {draft.publishedAt ? returned ? null : <p className="homework-help homework-help--state">{draft.progress.updatedAt ? `${firstName} has started.` : `Waiting for ${firstName}.`}</p> : <div className="homework-publish">
        <label><input type="checkbox" checked={reviewed} disabled={Boolean(busy)} onChange={event => setReviewed(event.target.checked)} />I checked the {LANGUAGE} and the answers</label>
        <button type="button" className="button button--coral" disabled={Boolean(busy) || !reviewed} onClick={() => void run("publish")}>{busy === "publish" ? "Publishing…" : "Publish for student"}</button>
      </div>}
    </> : null}
    <p className="homework-notice" role="status">{busy === "photo" ? "Preparing picture…" : notice || (dirty && !start ? "Unsaved changes" : "")}</p>
  </section>;
}

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
const lengths = [10, 15, 20];

/** The two things she may change before a new draft, folded with her notes: small blobs, the current one blue. */
function Choices({ label, options, value, onPick }: { label: string; options: (readonly [string, string])[]; value: string; onPick: (value: string) => void }) {
  return <div role="group" aria-label={label} className="homework-choices">
    <span className="homework-choices__label" aria-hidden="true">{label}</span>
    {options.map(([id, text]) => <button key={id} type="button" aria-pressed={id === value} className={id === value ? "is-selected" : ""} onClick={() => onPick(id)}>{text}</button>)}
  </div>;
}

/** While Claude reads and writes: what is happening, and a line that fills gently towards the end without pretending to know when. */
function HomeworkWorking({ seed }: { seed: string }) {
  return <div className="homework-working" role="status" aria-live="polite">
    <HomeworkSplat seed={`${seed}-working`} className="homework-working__mark" />
    <h4>Writing the homework</h4>
    <span className="homework-working__bar" aria-hidden="true"><span /></span>
  </div>;
}

function SheetEditor({ sheet, disabled, ai, onChange }: { sheet: HomeworkSheet; disabled: boolean; ai: boolean; onChange: (sheet: HomeworkSheet) => void }) {
  function sectionChange(index: number, values: Partial<HomeworkSheet["sections"][number]>) {
    onChange({ ...sheet, sections: sheet.sections.map((section, si) => si === index ? { ...section, ...values } : section) });
  }
  return <fieldset className="homework-editor" disabled={disabled}>
    <div className="homework-editor__intro"><label>Title<input maxLength={160} value={sheet.title} onChange={e => onChange({ ...sheet, title: e.target.value })} /></label>
      <label>Learning goal<textarea maxLength={400} value={sheet.objective} onChange={e => onChange({ ...sheet, objective: e.target.value })} rows={2} /></label></div>
    {sheet.sections.map((section, si) => <section key={si}>
      <div className="homework-toolbar"><h4>Section {si + 1}</h4>{sheet.sections.length > 1 ? <button className="homework-link" type="button" onClick={() => onChange({ ...sheet, sections: sheet.sections.filter((_, i) => si !== i) })}>Remove section</button> : null}</div>
      <label>Heading<input maxLength={120} value={section.title} onChange={e => sectionChange(si, { title: e.target.value })} /></label>
      <div className="homework-editor__pair"><label>Instruction<textarea maxLength={600} rows={2} value={section.instruction} onChange={e => sectionChange(si, { instruction: e.target.value })} /></label>
        <label>Worked example <small>Optional</small><textarea maxLength={800} rows={2} value={section.example} onChange={e => sectionChange(si, { example: e.target.value })} /></label></div>
      {section.questions.map((q, qi) => <div className="homework-editor__question" key={qi}>
        <div className="homework-editor__pair"><label>Question {qi + 1}<textarea rows={2} maxLength={800} value={q.prompt} onChange={e => sectionChange(si, { questions: section.questions.map((item, i) => i === qi ? { ...item, prompt: e.target.value } : item) })} /></label>
          <label>Answer or example answer<textarea rows={2} maxLength={1200} value={q.answer} onChange={e => sectionChange(si, { questions: section.questions.map((item, i) => i === qi ? { ...item, answer: e.target.value } : item) })} /></label></div>
        <label>Explanation <small>Optional</small><textarea rows={2} maxLength={800} value={q.explanation} onChange={e => sectionChange(si, { questions: section.questions.map((item, i) => i === qi ? { ...item, explanation: e.target.value } : item) })} /></label>
        <label>Marking<select value={q.marking ?? "written"} onChange={e => sectionChange(si, { questions: section.questions.map((item, i) => i === qi ? { ...item, marking: e.target.value as "exact" | "written", acceptedAnswers: item.acceptedAnswers ?? [] } : item) })}>
          <option value="written">{ai ? "Written answer · AI suggestion, then your approval" : "Written answer · you mark it"}</option><option value="exact">Short answer · checked against accepted answers</option>
        </select></label>
        {q.marking === "exact" ? <label>Accepted answers <small>One per line. Include every valid alternative.</small><textarea rows={3} maxLength={9600} value={(q.acceptedAnswers ?? []).join("\n")} onChange={e => sectionChange(si, { questions: section.questions.map((item, i) => i === qi ? { ...item, acceptedAnswers: e.target.value.split("\n") } : item) })} /></label> : null}
        {section.questions.length > 1 ? <button className="homework-link" type="button" onClick={() => sectionChange(si, { questions: section.questions.filter((_, i) => i !== qi) })}><Trash2 size={15} aria-hidden="true" />Remove question {qi + 1}</button> : null}
      </div>)}
      {section.questions.length < 6 && sheet.sections.flatMap(s => s.questions).length < 12 ? <button className="homework-link" type="button" onClick={() => sectionChange(si, { questions: [...section.questions, { id: `new-${Date.now()}`, prompt: "", answer: "", explanation: "" }] })}><Plus size={16} aria-hidden="true" />Add question</button> : null}
    </section>)}
    {sheet.sections.length < 4 && sheet.sections.flatMap(s => s.questions).length < 12 ? <button type="button" className="button button--outline homework-editor__add" onClick={() => onChange({ ...sheet, sections: [...sheet.sections, { title: "", instruction: "", example: "", questions: [{ id: `new-${Date.now()}`, prompt: "", answer: "", explanation: "" }] }] })}>Add section</button> : null}
    <label>Review reminder<textarea maxLength={400} rows={2} value={sheet.reminder} onChange={e => onChange({ ...sheet, reminder: e.target.value })} /></label>
  </fieldset>;
}

function HomeworkReview({ sheet, answers, marks, marking, note, busy, onChange, onApprove }: {
  sheet: HomeworkSheet; answers: Record<string, string>; marks: Record<string, HomeworkMark>; marking: boolean;
  note?: string; busy: boolean; onChange: (marks: Record<string, HomeworkMark>) => void; onApprove: () => void;
}) {
  const id = useId();
  // Answers she has opened to change stay open until she sends the review back.
  const [opened, setOpened] = useState<string[]>([]);
  const questions = sheet.sections.flatMap(section => section.questions);
  // A pending placeholder ("A Inês vai rever…") is not feedback; it must never be approved as hers.
  const feedbackOf = (mark?: HomeworkMark) => !mark || mark.source === "pending" ? "" : mark.feedback;
  const unresolvedMark = (mark?: HomeworkMark) => !mark || mark.status === "review" || !feedbackOf(mark).trim();
  const open = questions.filter(question => unresolvedMark(marks[question.id])).length;
  const right = questions.filter(question => !unresolvedMark(marks[question.id]) && marks[question.id].status === "correct").length;
  const retry = questions.length - open - right;
  return <div className="homework-review">
    <div className="homework-review__intro">
      <h4>Homework to review</h4>
      {marking ? <div className="homework-review__marking" role="status"><span>Checking answers…</span><span className="homework-working__bar" aria-hidden="true"><span /></span></div> : <ul className="homework-review__tally" aria-label="Marks so far">
        <li className="homework-review__count homework-review__count--correct">{right} correct</li>
        <li className="homework-review__count homework-review__count--retry">{retry} to try again</li>
        {open ? <li className="homework-review__count homework-review__count--open">{open} {open === 1 ? "needs" : "need"} you</li> : null}
      </ul>}
      {note ? <p className="homework-review__note">{note}</p> : null}
    </div>
    <fieldset className="homework-review__sheet" disabled={busy || marking}>
      {sheet.sections.map((section, index) => <section key={index}>
        <h5 lang={LANGUAGE_CODE}><HomeworkSplat seed={sheet.title} offset={index + 1} className="homework-section-mark" /><span className="homework-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="homework-section-title">{section.title}</span></h5>
        <p className="homework-review__instruction" lang={LANGUAGE_CODE}>{section.instruction}</p>
        {section.questions.map((question, qi) => {
          const mark = marks[question.id] ?? { status: "review", feedback: "", source: "pending" };
          const feedback = feedbackOf(mark);
          const edit = (value: Partial<HomeworkMark>) => { setOpened(list => list.includes(question.id) ? list : [...list, question.id]); onChange({ ...marks, [question.id]: { ...mark, feedback, source: "teacher", ...value } }); };
          const name = `${id}-${question.id}`;
          const unresolved = unresolvedMark(mark);
          const prompt = <p className="homework-review__prompt" lang={LANGUAGE_CODE}><span className="homework-dab" aria-hidden="true">{qi + 1}</span><span className="visually-hidden">{qi + 1}. </span>{question.prompt}</p>;
          const answer = <p className="homework-review__answer" lang={LANGUAGE_CODE}>{answers[question.id] || <em lang="en">No answer</em>}</p>;
          if (!unresolved && !opened.includes(question.id)) return <div className={`homework-review__question homework-review__question--folded homework-review__question--${mark.status}`} key={question.id}>
            <div className="homework-review__work">{prompt}{answer}</div>
            <div className="homework-review__verdict">
              <span className="homework-review__status">{mark.status === "correct" ? <><CheckCircle2 size={15} aria-hidden="true" />Correct</> : <><RotateCcw size={15} aria-hidden="true" />Try again</>}</span>
              <p lang={LANGUAGE_CODE}>{feedback}</p>
              <button type="button" className="homework-link" aria-label={`Change mark for ${section.title}, question ${qi + 1}`} onClick={() => setOpened(list => [...list, question.id])}>Change</button>
            </div>
          </div>;
          return <div className={`homework-review__question${unresolved ? " is-open" : ""}`} key={question.id}>
            <div className="homework-review__work">
              {prompt}{answer}
              <details><summary>Answer guide</summary><p lang={LANGUAGE_CODE}>{question.answer}</p>{question.explanation ? <p lang={LANGUAGE_CODE}>{question.explanation}</p> : null}</details>
            </div>
            <div className="homework-review__mark">
              <fieldset className="homework-review__choice">
                <legend>Mark {unresolved ? <span className="homework-tag">Needs you</span> : null}</legend>
                <div className={`segmented homework-mark${mark.status === "retry" ? " segmented--second" : ""}${mark.status === "review" ? " homework-mark--unset" : ""}`}>
                  <span aria-hidden="true" className="segmented__thumb" />
                  {([["correct", "Correct"], ["retry", "Try again"]] as const).map(([value, label]) => <label key={value} className={mark.status === value ? "is-active" : ""}>
                    <input type="radio" name={name} value={value} checked={mark.status === value} onChange={() => edit({ status: value })} />{label}
                  </label>)}
                </div>
              </fieldset>
              <label className="homework-review__feedback">Feedback <small>In {LANGUAGE_VARIETY}</small>
                <textarea lang={LANGUAGE_CODE} rows={2} maxLength={800} value={feedback} placeholder="Ex.: Muito bem! O teu pedido está claro." onChange={event => edit({ feedback: event.target.value })} /></label>
            </div>
          </div>;
        })}
      </section>)}
    </fieldset>
    <div className="homework-publish homework-publish--review">
      <p className="homework-help">{marking ? "" : open ? `${open} left to mark` : "All marked"}</p>
      <button type="button" className="button button--coral" disabled={busy || marking || Boolean(open)} onClick={onApprove}>{busy ? "Sending…" : "Approve & send back"}</button>
    </div>
  </div>;
}
