import { useId, useState, type ReactNode } from "react";
import { ExpressionTranslations, type TranslationsViewer } from "@/components/expressions/ExpressionTranslations";
import type { ExpressionInput } from "@/lib/expressions";
import { publicAssetPath } from "@/lib/paths";

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Two forms of one word, as "partimos" is of "partir". */
function sameStem(a: string, b: string) {
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  return shared >= Math.max(3, Math.min(a.length, b.length) - 3);
}

/**
 * Where the expression's own words recur in an example, so they can be
 * marked: the longest run of its words, taking in a verb the example has
 * conjugated. Nothing is marked for a match of a lone short word.
 */
export function findPhrase(example: string, phrase: string): [number, number] | null {
  const said = [...example.matchAll(WORD)].map((match) => ({ word: match[0].toLocaleLowerCase("pt-PT"), start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
  const words = [...phrase.matchAll(WORD)].map((match) => match[0].toLocaleLowerCase("pt-PT"));
  let best = { i: 0, j: 0, k: 0 };
  for (let i = 0; i < said.length; i++) {
    for (let j = 0; j < words.length; j++) {
      let k = 0;
      while (i + k < said.length && j + k < words.length && said[i + k].word === words[j + k]) k++;
      if (k > best.k) best = { i, j, k };
    }
  }
  let { i, j, k } = best;
  if (!k) return null;
  while (i > 0 && j > 0 && sameStem(said[i - 1].word, words[j - 1])) { i--; j--; k++; }
  while (i + k < said.length && j + k < words.length && sameStem(said[i + k].word, words[j + k])) k++;
  const run = said.slice(i, i + k);
  if (k < Math.min(2, words.length) || !run.some((item) => item.word.length >= 4)) return null;
  return [run[0].start, run[run.length - 1].end];
}

function Example({ text, phrase }: { text: string; phrase: string }) {
  const found = findPhrase(text, phrase);
  if (!found) return <>{text}</>;
  return <>{text.slice(0, found[0])}<mark className="expression-card__phrase">{text.slice(found[0], found[1])}</mark>{text.slice(found[1])}</>;
}

/** What the words say, what they mean, and the English for it. Each value is a span, which a student's card turns to wax while it paints another. */
export function ExpressionMeanings({ item }: { item: ExpressionInput }) {
  const facts = [
    item.literalEn ? { key: "literal", label: "Tradução à letra", text: item.literalEn, lang: "en" } : null,
    item.meaningPt ? { key: "meaning", label: "Quer dizer", text: item.meaningPt } : null,
    item.meaningEn ? { key: "english", label: "Em inglês", text: item.meaningEn, lang: "en" } : null,
  ].filter((fact) => fact !== null);
  if (!facts.length) return null;
  return (
    <dl className="expression-card__meanings">
      {facts.map((fact) => (
        <div className="expression-card__fact" data-fact={fact.key} key={fact.key}>
          <dt className="expression-card__label">{fact.label}</dt>
          <dd lang={fact.lang}><span className="expression-card__value">{fact.text}</span></dd>
        </div>
      ))}
    </dl>
  );
}

/** The expression in use, its own words marked in the paint. */
export function ExpressionExamples({ item }: { item: ExpressionInput }) {
  if (!item.examples.length) return null;
  return (
    <div className="expression-card__examples">
      <h4 className="expression-card__label">{item.examples.length === 1 ? "Exemplo" : "Exemplos"}</h4>
      <ul>{item.examples.map((example, index) => <li key={index}><span className="expression-card__value"><Example phrase={item.expression} text={example} /></span></li>)}</ul>
    </div>
  );
}

function Tags({ item }: { item: ExpressionInput }) {
  return item.tags.length ? <ul className="expression-card__tags" aria-label="Temas">{item.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null;
}

function Notes({ item }: { item: ExpressionInput }) {
  return (
    <>
      {item.notes ? <p>{item.notes}</p> : null}
      {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Consultar referência</a> : null}
    </>
  );
}

/**
 * Its themes, Inês's notes and source, and an optional picture. A student's
 * card ends in one row instead: its themes, the notes' toggle and `action`
 * at the row's end (see ReadingFoot).
 */
export function ExpressionExtras({ item, image = false, action, translations }: { item: ExpressionInput & { id?: string }; image?: boolean; action?: ReactNode; translations?: TranslationsViewer }) {
  const picture = image && item.imageUrl;
  if (action) return <ReadingFoot action={action} item={item} picture={Boolean(picture)} translations={item.id ? translations : undefined} />;
  if (!item.tags.length && !item.notes && !item.sourceUrl && !picture) return null;
  return (
    <div className="expression-card__extras">
      <Tags item={item} />
      {item.notes || item.sourceUrl ? (
        <details className="expression-card__notes">
          <summary>Notas e/ou origem</summary>
          <Notes item={item} />
        </details>
      ) : null}
      {picture ? <ExpressionImage item={item} /> : null}
    </div>
  );
}

/**
 * A student's reading ends in one row: its themes, then the notes' toggle and
 * the action, which keep together at the row's end and drop beneath the
 * themes only when the row has no room for them. The notes open below the
 * whole row, so opening them never moves the row. Students' translations
 * open the same way, in their own panel beneath the notes.
 */
function ReadingFoot({ item, picture, action, translations }: { item: ExpressionInput & { id?: string }; picture: boolean; action: ReactNode; translations?: TranslationsViewer }) {
  const [open, setOpen] = useState(false);
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const panel = useId();
  const translationsPanel = useId();
  const notes = Boolean(item.notes || item.sourceUrl);
  return (
    <div className="expression-card__extras">
      {picture ? <ExpressionImage item={item} /> : null}
      <div className="expression-card__foot" data-lead={item.tags.length ? "tags" : notes || translations ? "notes" : undefined}>
        <Tags item={item} />
        <div className="expression-card__foot-end">
          {notes ? (
            <button aria-controls={panel} aria-expanded={open} className="expression-card__notes-toggle" type="button" onClick={() => setOpen((value) => !value)}>
              Notas e/ou origem
            </button>
          ) : null}
          {translations ? (
            <button aria-controls={translationsPanel} aria-expanded={translationsOpen} className="expression-card__notes-toggle" lang="en" type="button" onClick={() => setTranslationsOpen((value) => !value)}>
              Translations
            </button>
          ) : null}
          {action}
        </div>
      </div>
      {notes ? <div className="expression-card__notes" hidden={!open} id={panel}><Notes item={item} /></div> : null}
      {translations && item.id ? <ExpressionTranslations expressionId={item.id} id={translationsPanel} open={translationsOpen} viewer={translations} /> : null}
    </div>
  );
}

function ExpressionImage({ item }: { item: ExpressionInput }) {
  // Optional local WebP images are authored outside the editor.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="expression-card__image" src={publicAssetPath(item.imageUrl)} alt={item.imageAlt} loading="lazy" />;
}

/**
 * The reading card in her collection and its preview. The student's own card
 * paints the title instead and lays the same parts out round the painting.
 * No teacher controls or publication state belong in the student content.
 */
export function ExpressionCard({ expression: item }: { expression: ExpressionInput }) {
  return (
    <article className="expression-card" lang="pt-PT">
      <h3 className="expression-card__title">{item.expression}</h3>
      {item.imageUrl ? <ExpressionImage item={item} /> : null}
      <ExpressionMeanings item={item} />
      <ExpressionExamples item={item} />
      <ExpressionExtras item={item} />
    </article>
  );
}
