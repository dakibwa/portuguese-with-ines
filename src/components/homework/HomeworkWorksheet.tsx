"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, BookOpen, CheckCircle2, RotateCcw, CircleHelp, PencilLine, Eye, EyeOff } from "lucide-react";
import type { HomeworkMark, HomeworkSheet } from "@/lib/homework-api";

/** The site's sliding two-option control, for a choice of view rather than a form value. */
export function HomeworkToggle<T extends string>({ label, value, options, onChange, controls, className = "" }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; controls?: string; className?: string;
}) {
  const second = options.findIndex(([option]) => option === value) === 1;
  return <div className={`segmented homework-toggle${second ? " segmented--second" : ""}${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
    <span aria-hidden="true" className="segmented__thumb" />
    {options.map(([option, text]) => <button type="button" key={option} className={option === value ? "is-active" : ""}
      aria-pressed={option === value} aria-controls={controls} onClick={() => onChange(option)}>{text}</button>)}
  </div>;
}

type Props = {
  sheet: HomeworkSheet;
  lessonAt: string;
  level: string;
  minutes: number;
  answers?: Record<string, string>;
  onAnswer?: (id: string, answer: string) => void;
  disabled?: boolean;
  preview?: boolean;
  marks?: Record<string, HomeworkMark>;
  markedAnswers?: Record<string, string>;
  onViewChange?: (view: "online" | "print") => void;
};

export function HomeworkWorksheet({ sheet, lessonAt, level, minutes, answers = {}, onAnswer, disabled, preview = false, marks = {}, markedAnswers, onViewChange }: Props) {
  const prefix = useId();
  const [view, setView] = useState<"online" | "print">("online");
  const [showAnswers, setShowAnswers] = useState(preview);
  const [printAnswers, setPrintAnswers] = useState(false);
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [mounted, setMounted] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const printed = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const beforePrint = () => {
      if (document.querySelector(".homework-print[data-print-active]")) return;
      const visible = screen.current?.getClientRects().length;
      const modal = document.querySelector("dialog[open]");
      if (visible && (!modal || modal.contains(screen.current))) printed.current?.setAttribute("data-print-active", "");
    };
    const afterPrint = () => printed.current?.removeAttribute("data-print-active");
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => { window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint); };
  }, []);
  const date = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Lisbon" }).format(new Date(lessonAt));
  const hasAnswers = Object.values(answers).some(answer => answer.trim());

  function chooseView(next: "online" | "print") {
    if (view === next) return;
    setView(next);
    onViewChange?.(next);
  }

  function answerKey(paper = false) {
    return <section className="homework-sheet__key">
      {paper ? null : <h4>Respostas e exemplos</h4>}
      <p>Compara as tuas respostas. Nas respostas pessoais, há várias possibilidades.</p>
      {sheet.sections.map((section, si) => <div key={si}>
        <h5>{si + 1}. {section.title}</h5>
        <ol>{section.questions.map(question => <li key={question.id}><p className="homework-sheet__answer">{question.answer}</p>{question.explanation ? <p className="homework-sheet__explanation">{question.explanation}</p> : null}</li>)}</ol>
      </div>)}
    </section>;
  }

  function body(paper: boolean) {
    return <>
      <article className={`homework-sheet${paper ? " homework-sheet--paper" : ""}`} lang="pt-PT">
        <header className="homework-sheet__head">
          <p className="homework-sheet__brand">Português com a Inês</p>
          <div className="homework-sheet__meta"><span>Aula de {date}</span><span>{level} · {minutes} min</span></div>
          <h3>{sheet.title}</h3>
          <p className="homework-sheet__objective">{sheet.objective}</p>
          {paper ? <p className="homework-sheet__name">Nome<span aria-hidden="true" /></p> : null}
        </header>
        {sheet.sections.map((section, si) => <section className="homework-sheet__section" key={si}>
          <h4><span aria-hidden="true">{si + 1}</span>{section.title}</h4>
          <p className="homework-sheet__instruction">{section.instruction}</p>
          {section.example ? <p className="homework-sheet__example"><strong>Exemplo</strong>{section.example}</p> : null}
          <ol className="homework-sheet__questions">
            {section.questions.map(question => {
              const answer = answers[question.id] ?? "";
              const writtenAnswer = paper && !includeAnswers ? "" : answer;
              const mark = marks[question.id];
              const edited = markedAnswers !== undefined && (markedAnswers[question.id] ?? "") !== answer;
              const FeedbackIcon = edited ? PencilLine : mark?.status === "correct" ? CheckCircle2 : mark?.status === "retry" ? RotateCcw : CircleHelp;
              const feedbackId = `${prefix}-${question.id}-feedback`;
              return <li key={question.id}>
                {paper || !onAnswer ? <>
                  <p>{question.prompt}</p>
                  <div className={`homework-sheet__writing${writtenAnswer ? " has-answer" : ""}`}>
                    {writtenAnswer || <>
                      <span className="visually-hidden">Espaço para a resposta</span>
                      {paper ? <span className="homework-sheet__writing-lines" aria-hidden="true"><span /><span /><span /></span> : null}
                    </>}
                  </div>
                </> : <>
                  <label htmlFor={`${prefix}-${question.id}`}>{question.prompt}</label>
                  <textarea id={`${prefix}-${question.id}`} rows={2} maxLength={3000} value={answer} disabled={disabled} aria-describedby={mark ? feedbackId : undefined}
                    onChange={event => onAnswer(question.id, event.target.value)} autoCapitalize="sentences" spellCheck lang="pt-PT" />
                </>}
                {!paper && mark ? <div id={feedbackId} className={`homework-feedback homework-feedback--${edited ? "edited" : mark.status}`}>
                  <FeedbackIcon size={18} aria-hidden="true" />
                  <div>{edited ? <>
                    <strong lang="en">Edited since feedback</strong>
                    <p>A tua nova resposta ainda não foi revista.</p>
                  </> : <>
                    <strong>{mark.status === "correct" ? "Correto" : mark.status === "retry" ? "Tenta de novo" : "A rever"}</strong>
                    {mark.feedback ? <p>{mark.feedback}</p> : null}
                  </>}</div>
                </div> : null}
              </li>;
            })}
          </ol>
        </section>)}
        <p className="homework-sheet__reminder"><BookOpen size={19} aria-hidden="true" /><span>{sheet.reminder}</span></p>
        {/* Answers come after an attempt, so their switch sits at the sheet's foot. */}
        {paper ? null : <button type="button" className="homework-answers-toggle" aria-expanded={showAnswers} aria-controls={`${prefix}-key`} onClick={() => setShowAnswers(value => !value)}>
          {showAnswers ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}<span lang="en">{showAnswers ? "Hide answers" : "Show answers"}</span>
        </button>}
        {!paper && showAnswers ? <div id={`${prefix}-key`}>{answerKey()}</div> : null}
      </article>
      {paper && printAnswers ? <article className="homework-sheet homework-sheet--paper homework-sheet--answer-key" lang="pt-PT">
        <header className="homework-sheet__head">
          <p className="homework-sheet__brand">Português com a Inês</p>
          <div className="homework-sheet__meta"><span>{sheet.title}</span><span>Aula de {date}</span></div>
          <h3>Respostas e exemplos</h3>
        </header>
        {answerKey(true)}
      </article> : null}
    </>;
  }

  return <div className="homework-worksheet" ref={screen}>
    <HomeworkToggle label="Worksheet format" value={view} controls={`${prefix}-view`} onChange={chooseView} className="homework-format-toggle"
      options={[["online", preview ? "On screen" : "Do online"], ["print", "Print worksheet"]]} />
    {view === "print" ? <div className="homework-paper-tools">
      <p className="homework-help">Black-and-white pages with room to write. The answer key is optional and starts on a separate page.</p>
      <div className="homework-print-tools">
        {hasAnswers ? <label><input type="checkbox" checked={includeAnswers} onChange={event => setIncludeAnswers(event.target.checked)} />{preview ? "Include student answers" : "Include my answers"}</label> : null}
        <label><input type="checkbox" checked={printAnswers} onChange={event => setPrintAnswers(event.target.checked)} />Include answer key</label>
        <button type="button" className="button button--outline" disabled={!mounted} onClick={() => {
          document.querySelectorAll(".homework-print[data-print-active]").forEach(element => element.removeAttribute("data-print-active"));
          printed.current?.setAttribute("data-print-active", "");
          window.print();
        }}><Printer size={17} aria-hidden="true" />Print</button>
      </div>
    </div> : null}
    <div id={`${prefix}-view`}>
      {view === "online" ? body(false) : <div className="homework-paper-preview">{body(true)}</div>}
    </div>
    {mounted ? createPortal(<div className="homework-print" ref={printed}>{body(true)}</div>, document.body) : null}
  </div>;
}
