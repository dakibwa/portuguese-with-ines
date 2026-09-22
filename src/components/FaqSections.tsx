"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

type FaqItem = { question: string; answer: string | string[] };
export type FaqSection = { id: string; title: string; questions: FaqItem[] };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The index shows one section at a time, in place: choosing another fades it
 * in where the last one was instead of scrolling the page to it. The address
 * keeps `#faq-<id>`, so links such as the Lessons page's payment questions
 * still open the right section.
 */
export function FaqSections({ sections, indexMark }: { sections: FaqSection[]; indexMark: ReactNode }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  // Until this is set the index links are ordinary anchors; tests wait for it.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromAddress = (bringIntoView: boolean) => {
      const id = window.location.hash.replace(/^#faq-/, "");
      if (!sections.some((section) => section.id === id)) return;
      setActive(id);
      // Arriving from a link, a phone shows the index first, so bring the
      // chosen section up once it is visible.
      if (bringIntoView) {
        requestAnimationFrame(() => {
          const heading = document.getElementById(`faq-${id}-title`);
          if (heading && heading.getBoundingClientRect().top > window.innerHeight * 0.7) {
            heading.scrollIntoView({ block: "start" });
          }
        });
      }
    };
    fromAddress(true);
    setReady(true);
    const onHashChange = () => fromAddress(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [sections]);

  function choose(id: string, event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setActive(id);
    window.history.replaceState(window.history.state, "", `#faq-${id}`);
    requestAnimationFrame(() => {
      const heading = document.getElementById(`faq-${id}-title`);
      if (!heading) return;
      heading.focus({ preventScroll: true });
      // Beside the index nothing needs to move. Where the index sits above the
      // questions (phones), the section is below it: bring its heading up.
      const { top } = heading.getBoundingClientRect();
      if (top < 0 || top > window.innerHeight * 0.7) {
        heading.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      }
    });
  }

  return (
    <>
      <nav className="faq-index" aria-label="FAQ categories" data-ready={ready ? "true" : undefined}>
        <p className="eyebrow">Index</p>
        <ol>
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                aria-current={active === section.id ? "true" : undefined}
                aria-controls={`faq-${section.id}`}
                href={`#faq-${section.id}`}
                onClick={(event) => choose(section.id, event)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
        {indexMark}
      </nav>

      <div className="faq-groups">
        {sections.map((section, sectionIndex) => (
          <section
            aria-labelledby={`faq-${section.id}-title`}
            className="faq-group"
            hidden={active !== section.id}
            id={`faq-${section.id}`}
            key={section.id}
          >
            <header className="faq-group__header">
              <h2 id={`faq-${section.id}-title`} tabIndex={-1}>{section.title}</h2>
            </header>
            {section.questions.map((item, questionIndex) => (
              <details className="faq-row" key={item.question} open={sectionIndex === 0 && questionIndex === 0}>
                <summary>
                  <span>{item.question}</span>
                  <span className="faq-row__symbol" aria-hidden="true" />
                </summary>
                <div className="faq-row__answer">
                  {(Array.isArray(item.answer) ? item.answer : [item.answer]).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </details>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
