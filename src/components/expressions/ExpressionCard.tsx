import type { ExpressionInput } from "@/lib/expressions";
import { publicAssetPath } from "@/lib/paths";

/** The reading card, shared by her collection and the student preview.
 * No teacher controls or publication state belong in the student content. */
export function ExpressionCard({ expression: item }: { expression: ExpressionInput }) {
  return (
    <article className="expression-card" lang="pt-PT">
      <h3 className="expression-card__title">{item.expression}</h3>
      {item.imageUrl ? (
        // Optional local WebP images are authored outside the editor.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="expression-card__image" src={publicAssetPath(item.imageUrl)} alt={item.imageAlt} loading="lazy" />
      ) : null}
      <ul className="booking-payment-facts expression-card__meanings">
        {item.meaningPt ? <li>{item.meaningPt}</li> : null}
        {item.meaningEn ? <li><span className="expression-card__label">Em inglês</span><span lang="en">{item.meaningEn}</span></li> : null}
        {item.literalEn ? <li><span className="expression-card__label">Tradução literal</span><span lang="en">{item.literalEn}</span></li> : null}
      </ul>
      {item.examples.length ? (
        <div className="expression-card__examples">
          <h4>{item.examples.length === 1 ? "Exemplo" : "Exemplos"}</h4>
          <ul className="booking-payment-facts">{item.examples.map((example, index) => <li key={index}>{example}</li>)}</ul>
        </div>
      ) : null}
      {item.notes || item.sourceUrl ? (
        <details className="expression-card__notes">
          <summary>Notas e origem</summary>
          {item.notes ? <p>{item.notes}</p> : null}
          {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Consultar referência</a> : null}
        </details>
      ) : null}
      {item.tags.length ? <ul className="expression-card__tags" aria-label="Temas">{item.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null}
    </article>
  );
}
