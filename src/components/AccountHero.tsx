import { AssetMark } from "@/components/BrandMarks";

/**
 * The banded heading the student-facing account pages share.
 *
 * Every other page opens on a colour immediately under the wordmark; these
 * three ran straight into cream, so they read as though they belonged to a
 * different site.
 */
export function AccountHero({ title, mark }: { title: string; mark: string }) {
  return (
    <section className="account-hero" aria-labelledby="account-title">
      <div>
        {/* The title alone: the card beneath says what to do. */}
        <h1 id="account-title">{title}</h1>
      </div>
      <AssetMark asset={mark} className="account-hero__mark" priority />
    </section>
  );
}
