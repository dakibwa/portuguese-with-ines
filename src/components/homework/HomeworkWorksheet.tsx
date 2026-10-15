"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, BookOpen } from "lucide-react";
import type { HomeworkSheet } from "@/lib/homework-api";

type Props = {
  sheet: HomeworkSheet;
  lessonAt: string;
  level: string;
  minutes: number;
  answers?: Record<string, string>;
  onAnswer?: (id: string, answer: string) => void;
  disabled?: boolean;
  preview?: boolean;
};

export function HomeworkWorksheet({ sheet, lessonAt, level, minutes, answers = {}, onAnswer, disabled, preview = false }: Props) {
  const prefix = useId();
  const [showAnswers, setShowAnswers] = useState(preview);
  const [printAnswers, setPrintAnswers] = useState(false);
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

  function body(print: boolean) {
    return <article className="homework-sheet" lang="pt-PT">
      <header className="homework-sheet__head">
        <p className="homework-sheet__brand">Português com a Inês</p>
        <div className="homework-sheet__meta"><span>Aula de {date}</span><span>{level} · {minutes} min</span></div>
        <h3>{sheet.title}</h3>
        <p className="homework-sheet__objective">{sheet.objective}</p>
      </header>
      {sheet.sections.map((section, si) => <section className="homework-sheet__section" key={si}>
        <h4><span aria-hidden="true">{si + 1}</span>{section.title}</h4>
        <p>{section.instruction}</p>
        {section.example ? <p className="homework-sheet__example"><strong>Exemplo</strong> {section.example}</p> : null}
        <ol className="homework-sheet__questions">
          {section.questions.map(question => <li key={question.id}>
            {print || !onAnswer ? <>
              <p>{question.prompt}</p>
              <div className={`homework-sheet__writing${answers[question.id] ? " has-answer" : ""}`}>{answers[question.id] || <span className="visually-hidden">Espaço para a resposta</span>}</div>
            </> : <>
              <label htmlFor={`${prefix}-${question.id}`}>{question.prompt}</label>
              <textarea id={`${prefix}-${question.id}`} rows={2} maxLength={3000} value={answers[question.id] ?? ""} disabled={disabled}
                onChange={event => onAnswer(question.id, event.target.value)} autoCapitalize="sentences" spellCheck lang="pt-PT" />
            </>}
          </li>)}
        </ol>
      </section>)}
      <p className="homework-sheet__reminder"><BookOpen size={19} aria-hidden="true" /><span>{sheet.reminder}</span></p>
      {(print ? printAnswers : showAnswers) ? <section className="homework-sheet__key">
        <h4>Respostas e exemplos</h4>
        <p>Compara as tuas respostas. Nas respostas pessoais, há várias possibilidades.</p>
        {sheet.sections.map((section, si) => <div key={si}>
          <h5>{si + 1}. {section.title}</h5>
          <ol>{section.questions.map(question => <li key={question.id}><p>{question.answer}</p>{question.explanation ? <p className="homework-sheet__explanation">{question.explanation}</p> : null}</li>)}</ol>
        </div>)}
      </section> : null}
    </article>;
  }

  return <div className="homework-worksheet" ref={screen}>
    <div className="homework-sheet-tools">
      <button type="button" className="text-action" aria-expanded={showAnswers} onClick={() => setShowAnswers(value => !value)}>{showAnswers ? "Hide answers" : "Show answers"}</button>
      <div className="homework-print-tools">
        <label><input type="checkbox" checked={printAnswers} onChange={event => setPrintAnswers(event.target.checked)} />Print answer key</label>
        <button type="button" className="button button--outline" onClick={() => {
          document.querySelectorAll(".homework-print[data-print-active]").forEach(element => element.removeAttribute("data-print-active"));
          printed.current?.setAttribute("data-print-active", "");
          window.print();
        }}><Printer size={17} aria-hidden="true" />Print</button>
      </div>
    </div>
    {body(false)}
    {mounted ? createPortal(<div className="homework-print" ref={printed}>{body(true)}</div>, document.body) : null}
  </div>;
}
