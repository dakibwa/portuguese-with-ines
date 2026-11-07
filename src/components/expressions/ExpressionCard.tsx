import type { ReactNode } from "react";
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

/**
 * What the words say, what they mean, the English for it, and Inês's notes on
 * it or its origin. Each value is a span, which a student's card turns to wax
 * while it paints another.
 */
export function ExpressionMeanings({ item }: { item: ExpressionInput }) {
  const facts = [
    item.literalEn ? { key: "literal", label: "Tradução à letra", text: item.literalEn, lang: "en" } : null,
    item.meaningPt ? { key: "meaning", label: "Quer dizer", text: item.meaningPt } : null,
    item.meaningEn ? { key: "english", label: "Em inglês", text: item.meaningEn, lang: "en" } : null,
    item.notes || item.sourceUrl ? { key: "notes", label: "Notas e/ou origem", text: item.notes, link: item.sourceUrl } : null,
  ].filter((fact) => fact !== null);
  if (!facts.length) return null;
  return (
    <dl className="expression-card__meanings">
      {facts.map((fact) => (
        <div className="expression-card__fact" data-fact={fact.key} key={fact.key}>
          <dt className="expression-card__label">{fact.label}</dt>
          <dd lang={"lang" in fact ? fact.lang : undefined}>
            {fact.text ? <span className="expression-card__value">{fact.text}</span> : null}
            {"link" in fact && fact.link ? <a className="expression-card__source" href={fact.link} target="_blank" rel="noreferrer">Consultar referência</a> : null}
          </dd>
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

/**
 * A student's reading beside the painting: the expression in use, then its
 * versions in other languages, where a student can add their own.
 */
export function ExpressionUsage({ item, translations }: { item: ExpressionInput & { id?: string }; translations?: TranslationsViewer }) {
  return (
    <div className="expression-reading__usage">
      <ExpressionExamples item={item} />
      {translations && item.id ? <ExpressionTranslations expressionId={item.id} viewer={translations} /> : null}
    </div>
  );
}

function Tags({ item }: { item: ExpressionInput }) {
  return item.tags.length ? <ul className="expression-card__tags" aria-label="Temas">{item.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null;
}

/**
 * Its themes and an optional picture. A student's card ends in one row
 * instead: its themes, and `action` at the row's end, which drops beneath
 * them only when the row has no room for it.
 */
export function ExpressionExtras({ item, image = false, action }: { item: ExpressionInput; image?: boolean; action?: ReactNode }) {
  const picture = image && item.imageUrl;
  if (action) {
    return (
      <div className="expression-card__extras">
        {picture ? <ExpressionImage item={item} /> : null}
        <div className="expression-card__foot">
          <Tags item={item} />
          <div className="expression-card__foot-end">{action}</div>
        </div>
      </div>
    );
  }
  if (!item.tags.length && !picture) return null;
  return (
    <div className="expression-card__extras">
      <Tags item={item} />
      {picture ? <ExpressionImage item={item} /> : null}
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
