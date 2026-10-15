"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Sparkles, CheckCircle2, ChevronDown, Image as ImageIcon, Lock, PenLine, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { HOMEWORK_PHOTO_LIMIT, prepareHomeworkPhoto, teacherHomeworkRequest, transcribeHomeworkPhotos, type HomeworkSheet, type TeacherHomeworkData, type HomeworkMark } from "@/lib/homework-api";
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
  // Photos waiting to be read, and those already read (kept only in this tab, to compare).
  const [photos, setPhotos] = useState<string[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [showPhoto, setShowPhoto] = useState(-1);
  const [writing, setWriting] = useState(false);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [reviewed, setReviewed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reviewMarks, setReviewMarks] = useState<Record<string, HomeworkMark> | null>(null);
  const active = useRef(true);
  const editor = useRef<HTMLElement>(null);
  const controller = useRef<AbortController | null>(null);
  const dirty = Boolean(draft && saved && (JSON.stringify(draft) !== JSON.stringify(saved) ||
    (reviewMarks && JSON.stringify(reviewMarks) !== JSON.stringify(saved.progress.submission?.marks))));
  // Unread photos are work too: leaving would lose them.
  const unsaved = dirty || photos.length > 0;

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
    const interval = window.setInterval(() => {
      void teacherHomeworkRequest(token, bookingId, "", undefined, controller.current?.signal).then(result => {
        if (active.current && readSession() === token) { setDraft(result); setSaved(result); }
      }).catch(() => {});
    }, 5000);
    return () => window.clearInterval(interval);
  }, [bookingId, token, draft?.progress.submission?.state]);
  useEffect(() => { onBusy?.(Boolean(busy)); }, [busy, onBusy]);
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
  async function addPhotos(files: FileList | null) {
    const chosen = [...(files ?? [])].slice(0, HOMEWORK_PHOTO_LIMIT - photos.length);
    if (!chosen.length) { if (files?.length) setError(`Add up to ${HOMEWORK_PHOTO_LIMIT} photos at a time.`); return; }
    setBusy("photo"); setError(""); setUncertain([]);
    try {
      const images = await Promise.all(chosen.map(prepareHomeworkPhoto));
      if (active.current) setPhotos(current => [...current, ...images].slice(0, HOMEWORK_PHOTO_LIMIT));
    } catch (error) { if (active.current) setError((error as Error).message); }
    finally { if (active.current) setBusy(""); }
  }
  // Saves, generates, publishes or returns `source`, the draft as it stands
  // unless a step has just changed it (a transcription feeding a draft).
  async function send(action: "save" | "generate" | "publish" | "return", source: TeacherHomeworkData) {
    const result = await teacherHomeworkRequest(token, bookingId, action === "save" ? "" : action,
      action === "return" ? { submissionId: source.progress.submission?.id, updatedAt: source.progress.updatedAt,
        marks: reviewMarks ?? source.progress.submission?.marks, approved: true }
        : { notes: source.notes, level: source.level, minutes: source.minutes, sheet: source.sheet, updatedAt: source.updatedAt, reviewed }, controller.current?.signal);
    if (!active.current || readSession() !== token) return;
    setDraft(result); setSaved(result); setReviewMarks(null); setReviewed(false);
    if (action !== "save") setMode("preview");
    setNotice(action === "return" ? "Approved and sent back. The student can now see your feedback." : action === "publish" ? "Published. It is now in the student’s Homework tab." : action === "generate" ? "Draft ready. Check the Portuguese and answers." : "Draft saved.");
    if (action === "return") window.dispatchEvent(new Event("homework-returned"));
  }
  async function run(action: "save" | "generate" | "publish" | "return") {
    if (!draft || busy) return;
    setBusy(action); setError(""); setNotice("");
    try { await send(action, draft); }
    catch (error) { if (active.current) setError((error as Error).message); }
    finally { if (active.current) setBusy(""); }
  }
  /** Photos are read, then the draft is made from what they say, in one press.
   *  Anything the reader was unsure of stops it there so Inês can check first. */
  async function make() {
    if (!draft || busy) return;
    if (draft.sheet && !window.confirm("Replace this draft with a new sheet? Your lesson notes will stay.")) return;
    setError(""); setNotice("");
    let source = draft;
    try {
      if (photos.length) {
        setBusy("transcribe");
        const result = await transcribeHomeworkPhotos(token, bookingId, photos, draft.updatedAt, controller.current?.signal);
        if (!active.current || readSession() !== token) return;
        const notes = [draft.notes, result.notes].filter(Boolean).join("\n\n");
        if (notes.length > 10000) throw new Error("These notes are too long to add another photo. Shorten the notes, then read the photo again.");
        source = { ...draft, notes };
        setDraft(source); setRead(photos); setPhotos([]); setShowPhoto(-1); setUncertain(result.uncertain); setWriting(true);
        if (!result.notes) { setNotice("No lesson text was found. Try a clearer photo."); return; }
        if (result.uncertain.length) { setNotice("Photo read. Check the readings below, then make the homework."); return; }
      }
      if (source.notes.trim().length < 10) throw new Error("Add a few notes about what you worked on.");
      setBusy("generate");
      await send("generate", source);
    } catch (error) { if (active.current) setError((error as Error).message); }
    finally { if (active.current) setBusy(""); }
  }

  const photoInput = (camera: boolean) => <input type="file" accept="image/*" multiple className="visually-hidden" disabled={Boolean(busy) || photos.length >= HOMEWORK_PHOTO_LIMIT}
    {...(camera ? { capture: "environment" as const } : {})} onChange={event => { const files = event.target.files; void addPhotos(files).finally(() => { event.target.value = ""; }); }} />;
  const canMake = Boolean(photos.length) || (draft?.notes.trim().length ?? 0) >= 10;
  const makeLabel = busy === "transcribe" ? "Reading photos…" : busy === "generate" ? "Making sheet…" : photos.length ? (draft?.sheet ? "Read & make a new draft" : "Read & make homework") : draft?.sheet ? "Make a new draft" : "Make homework";
  const thumbs = (list: string[], pending: boolean) => list.length ? <ul className="homework-photos" aria-label={pending ? "Photos to read" : "Photos read"}>
    {list.map((image, index) => <li key={index}>
      <button type="button" className="homework-photo-thumb" aria-label={`${showPhoto === index && !pending ? "Hide" : "View"} photo ${index + 1}`} aria-expanded={pending ? undefined : showPhoto === index}
        onClick={() => pending ? undefined : setShowPhoto(value => value === index ? -1 : index)} disabled={pending}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={`Lesson notes, photo ${index + 1}`} />
      </button>
      {pending ? <button type="button" className="homework-photo-remove" aria-label={`Remove photo ${index + 1}`} disabled={Boolean(busy)} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X size={15} aria-hidden="true" /></button> : null}
    </li>)}
  </ul> : null;
  const settings = draft ? <>
    <label htmlFor={`${inputId}-level`}>Level<select id={`${inputId}-level`} value={draft.level} onChange={event => edit({ level: event.target.value })}>{["A1", "A2", "B1", "B2", "C1", "C2"].map(level => <option key={level}>{level}</option>)}</select></label>
    <label htmlFor={`${inputId}-minutes`}>Length<select id={`${inputId}-minutes`} value={draft.minutes} onChange={event => edit({ minutes: Number(event.target.value) })}>{[10, 15, 20].map(minutes => <option key={minutes} value={minutes}>{minutes} mins</option>)}</select></label>
  </> : null;
  const notesField = draft ? <label htmlFor={`${inputId}-notes`} className="homework-notes">What did you work on?
    <textarea id={`${inputId}-notes`} value={draft.notes} rows={5} maxLength={10000} onChange={event => edit({ notes: event.target.value })} placeholder="Type the words, grammar and examples from this lesson." /></label> : null;
  const uncertainList = uncertain.length ? <div className="homework-error"><strong>Check these readings</strong><ul>{uncertain.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null;
  // eslint-disable-next-line @next/next/no-img-element
  const fullPhoto = read[showPhoto] ? <img className="homework-photo-full" src={read[showPhoto]} alt="Lesson notes to compare with the transcription" /> : null;
  const privacy = <ul className="homework-help booking-payment-facts"><li>OpenAI reads the photos. This site doesn’t store them.</li><li>Keep names and personal details out.</li></ul>;
  // Fine-tune and Save draft: beside the format control under a preview, on their own row above the editor.
  const draftTools = draft ? <>
    {draft.sheet ? <button type="button" className="homework-link homework-finetune" aria-pressed={mode === "edit"} disabled={Boolean(busy)} onClick={() => setMode(value => value === "edit" ? "preview" : "edit")}>
      <SlidersHorizontal size={15} aria-hidden="true" />Fine-tune</button>
      : <button type="button" className="button button--lilac" disabled={Boolean(busy)} onClick={() => { edit({ sheet: emptySheet() }); setMode("edit"); }}><PenLine size={16} aria-hidden="true" />Write a sheet yourself</button>}
    {/* As in Your details, saving appears once there is something to save. */}
    {dirty || busy === "save" ? <button className="button button--outline" type="button" disabled={Boolean(busy)} onClick={() => void run("save")}>{busy === "save" ? "Saving…" : "Save draft"}</button> : null}
  </> : null;
  const start = Boolean(draft && draft.aiAvailable && !draft.sheet && !draft.publishedAt);

  return <section className="teacher-homework" ref={editor} aria-labelledby={`${inputId}-title`}>
    <div className="homework-toolbar homework-toolbar--head"><h3 id={`${inputId}-title`}><HomeworkSplat seed={bookingId} className="homework-heading-mark" />Homework</h3>
      {draft ? <span className={`homework-status homework-status--${draft.publishedAt ? "returned" : "draft"}`}>{draft.publishedAt
        ? <><CheckCircle2 size={15} aria-hidden="true" />Published</> : <><Lock size={14} aria-hidden="true" />Private draft</>}</span> : null}
    </div>
    {error ? <div className="homework-error" role="alert"><p>{error}</p>{!draft ? <button type="button" className="button button--outline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button> : null}</div> : null}
    {!draft && !error ? <p className="homework-loading" role="status">Loading homework…</p> : null}
    {draft && start ? <fieldset className="homework-start" disabled={Boolean(busy)}>
      <legend className="visually-hidden">Make homework from this lesson</legend>
      {/* The one big thing to press: a photo straight from the phone's camera. */}
      {photos.length < HOMEWORK_PHOTO_LIMIT ? <label className={`homework-capture${photos.length ? " homework-capture--again" : ""}`}>
        <HomeworkSplat seed={`${bookingId}-photo`} className="homework-capture__mark" />
        <span className="homework-capture__icon" aria-hidden="true"><Camera size={26} /></span>
        <span className="homework-capture__text"><strong>{photos.length ? "Add another page" : "Add a photo of your notes"}</strong>
          <small>{photos.length ? `Up to ${HOMEWORK_PHOTO_LIMIT} photos, read together` : "Take a picture of the board or your notebook"}</small></span>
        {photoInput(true)}
      </label> : null}
      <div className="homework-start__more">
        {thumbs(photos, true)}
        {photos.length < HOMEWORK_PHOTO_LIMIT ? <label className="homework-link homework-link--file"><ImageIcon size={15} aria-hidden="true" />From gallery{photoInput(false)}</label> : null}
        <button type="button" className="homework-link" aria-expanded={writing} onClick={() => setWriting(value => !value)}><PenLine size={15} aria-hidden="true" />{writing ? "Hide notes" : "Type notes"}</button>
      </div>
      {writing ? <>{notesField}{thumbs(read, false)}{fullPhoto}{uncertainList}</> : null}
      <div className="homework-settings">
        {settings}
        <button className="button button--coral homework-make" type="button" disabled={!canMake} onClick={() => void make()}><Sparkles size={17} aria-hidden="true" />{makeLabel}</button>
      </div>
      {privacy}
    </fieldset> : null}
    {draft && !start && !draft.publishedAt ? <>
      <details className="homework-source" open={!draft.sheet || undefined}>
        <summary><ChevronDown size={18} aria-hidden="true" /><strong>Lesson notes</strong><span>{draft.level} · {draft.minutes} mins</span><span><Lock size={13} aria-hidden="true" />Only you can see these</span></summary>
        <fieldset disabled={Boolean(busy)}>
          {notesField}
          {draft.aiAvailable ? <><div className="homework-photo-tools">
            {photos.length < HOMEWORK_PHOTO_LIMIT ? <label className="button button--outline"><Camera size={17} aria-hidden="true" />Add a photo{photoInput(true)}</label> : null}
            {thumbs(photos, true)}{thumbs(read, false)}
          </div>
          {fullPhoto}
          {privacy}{uncertainList}</> : null}
          <div className="homework-settings">
            {settings}
            {draft.aiAvailable ? <button className="button button--coral" type="button" disabled={!canMake} onClick={() => void make()}><Sparkles size={17} aria-hidden="true" />{makeLabel}</button> : null}
          </div>
          {!draft.aiAvailable ? <p className="homework-help">Photo reading and automatic drafts aren’t switched on yet. Keep your notes here and write the sheet yourself.</p> : null}
        </fieldset>
      </details>
      {draft.sheet && mode === "preview" ? null : <div className="homework-toolbar homework-toolbar--actions">{draftTools}</div>}
    </> : null}
    {draft?.sheet && draft.progress.submission && !draft.progress.submission.returnedAt ? <HomeworkReview
      sheet={draft.sheet} answers={draft.progress.submission.answers}
      marks={reviewMarks ?? draft.progress.submission.marks ?? {}}
      marking={draft.progress.submission.state === "marking"} note={draft.progress.submission.markingNote}
      busy={Boolean(busy)} onChange={setReviewMarks} onApprove={() => void run("return")} /> : draft?.sheet ? <>
      {!draft.publishedAt && mode === "edit" ? <SheetEditor sheet={draft.sheet} disabled={Boolean(busy)} ai={draft.aiAvailable} onChange={sheet => edit({ sheet })} />
        : <HomeworkWorksheet sheet={draft.sheet} level={draft.level} minutes={draft.minutes} lessonAt={draft.lessonAt}
          answers={draft.progress.submission?.answers ?? (draft.publishedAt ? draft.progress.answers : undefined)}
          marks={draft.progress.submission?.marks} markedAnswers={draft.progress.submission?.answers} preview tools={draft.publishedAt ? undefined : draftTools} />}
      {draft.publishedAt ? <p className="homework-help homework-help--state">{draft.progress.submission?.returnedAt ? "Approved feedback sent back to the student." : draft.progress.updatedAt ? "The student has started but has not submitted yet." : "The student has not submitted any answers yet."} Published questions stay fixed.</p> : <div className="homework-publish">
        <label><input type="checkbox" checked={reviewed} disabled={Boolean(busy)} onChange={event => setReviewed(event.target.checked)} />I checked the European Portuguese and the answers.</label>
        <button type="button" className="button button--coral" disabled={Boolean(busy) || !reviewed} onClick={() => void run("publish")}>{busy === "publish" ? "Publishing…" : "Publish for student"}</button>
      </div>}
    </> : null}
    <p className="homework-notice" role="status">{busy === "photo" ? "Preparing photo…" : busy === "transcribe" ? "Reading your notes…" : busy === "generate" ? "Making a draft from this lesson’s notes…" : notice || (dirty ? "Unsaved changes" : "")}</p>
  </section>;
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
      <p>{marking ? "Checking answers…" : "Settled answers are folded. Open any to change it. The student sees your marks only after you approve."}</p>
      {marking ? null : <ul className="homework-review__tally" aria-label="Marks so far">
        <li className="homework-review__count homework-review__count--correct">{right} correct</li>
        <li className="homework-review__count homework-review__count--retry">{retry} to try again</li>
        {open ? <li className="homework-review__count homework-review__count--open">{open} {open === 1 ? "needs" : "need"} you</li> : null}
      </ul>}
      {note ? <p className="homework-review__note">{note}</p> : null}
    </div>
    <fieldset className="homework-review__sheet" disabled={busy || marking}>
      {sheet.sections.map((section, index) => <section key={index}>
        <h5 lang="pt-PT"><HomeworkSplat seed={sheet.title} offset={index + 1} className="homework-section-mark" /><span className="homework-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="homework-section-title">{section.title}</span></h5>
        <p className="homework-review__instruction" lang="pt-PT">{section.instruction}</p>
        {section.questions.map((question, qi) => {
          const mark = marks[question.id] ?? { status: "review", feedback: "", source: "pending" };
          const feedback = feedbackOf(mark);
          const edit = (value: Partial<HomeworkMark>) => { setOpened(list => list.includes(question.id) ? list : [...list, question.id]); onChange({ ...marks, [question.id]: { ...mark, feedback, source: "teacher", ...value } }); };
          const name = `${id}-${question.id}`;
          const unresolved = unresolvedMark(mark);
          const prompt = <p className="homework-review__prompt" lang="pt-PT"><span className="homework-dab" aria-hidden="true">{qi + 1}</span><span className="visually-hidden">{qi + 1}. </span>{question.prompt}</p>;
          const answer = <p className="homework-review__answer" lang="pt-PT">{answers[question.id] || <em lang="en">No answer</em>}</p>;
          if (!unresolved && !opened.includes(question.id)) return <div className={`homework-review__question homework-review__question--folded homework-review__question--${mark.status}`} key={question.id}>
            <div className="homework-review__work">{prompt}{answer}</div>
            <div className="homework-review__verdict">
              <span className="homework-review__status">{mark.status === "correct" ? <><CheckCircle2 size={15} aria-hidden="true" />Correct</> : <><RotateCcw size={15} aria-hidden="true" />Try again</>}</span>
              <p lang="pt-PT">{feedback}</p>
              <button type="button" className="homework-link" aria-label={`Change mark for ${section.title}, question ${qi + 1}`} onClick={() => setOpened(list => [...list, question.id])}>Change</button>
            </div>
          </div>;
          return <div className={`homework-review__question${unresolved ? " is-open" : ""}`} key={question.id}>
            <div className="homework-review__work">
              {prompt}{answer}
              <details><summary>Answer guide</summary><p lang="pt-PT">{question.answer}</p>{question.explanation ? <p lang="pt-PT">{question.explanation}</p> : null}</details>
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
              <label className="homework-review__feedback">Feedback <small>In European Portuguese</small>
                <textarea lang="pt-PT" rows={2} maxLength={800} value={feedback} placeholder="Ex.: Muito bem! O teu pedido está claro." onChange={event => edit({ feedback: event.target.value })} /></label>
            </div>
          </div>;
        })}
      </section>)}
    </fieldset>
    <div className="homework-publish homework-publish--review">
      <p className="homework-help">{marking ? "Automatic marking is still running." : open ? `${open === 1 ? "1 answer needs" : `${open} answers need`} a mark and feedback.` : "Ready to send back to the student."}</p>
      <button type="button" className="button button--coral" disabled={busy || marking || Boolean(open)} onClick={onApprove}>{busy ? "Sending…" : "Approve & send back"}</button>
    </div>
  </div>;
}
