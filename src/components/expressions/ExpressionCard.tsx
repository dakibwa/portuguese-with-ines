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

/** What the words say, what they mean, and the English for it. */
export function ExpressionMeanings({ item }: { item: ExpressionInput }) {
  const facts = [
    item.literalEn ? { key: "literal", label: "Ao pé da letra", text: item.literalEn, lang: "en" } : null,
    item.meaningPt ? { key: "meaning", label: "Quer dizer", text: item.meaningPt } : null,
    item.meaningEn ? { key: "english", label: "Em inglês", text: item.meaningEn, lang: "en" } : null,
  ].filter((fact) => fact !== null);
  if (!facts.length) return null;
  return (
    <dl className="expression-card__meanings">
      {facts.map((fact) => (
        <div className="expression-card__fact" data-fact={fact.key} key={fact.key}>
          <dt className="expression-card__label">{fact.label}</dt>
          <dd lang={fact.lang}>{fact.text}</dd>
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
      <ul>{item.examples.map((example, index) => <li key={index}><Example phrase={item.expression} text={example} /></li>)}</ul>
    </div>
  );
}

/** Its themes, Inês's notes and source, and an optional picture. */
export function ExpressionExtras({ item, image = false }: { item: ExpressionInput; image?: boolean }) {
  const picture = image && item.imageUrl;
  if (!item.tags.length && !item.notes && !item.sourceUrl && !picture) return null;
  return (
    <div className="expression-card__extras">
      {item.tags.length ? <ul className="expression-card__tags" aria-label="Temas">{item.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null}
      {item.notes || item.sourceUrl ? (
        <details className="expression-card__notes">
          <summary>Notas e origem</summary>
          {item.notes ? <p>{item.notes}</p> : null}
          {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Consultar referência</a> : null}
        </details>
      ) : null}
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
