import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = pageMetadata({
  title: "Approach | Português com a Inês",
  description: "How the lessons work: one to one, no fixed syllabus, built around what you need Portuguese for.",
  path: "/approach/"
});

const approachItems = [
  {
    title: "Any Portuguese is welcome",
    body: "I teach European Portuguese. Whatever variety you already know, we start from there.",
    asset: "/visuals/v2-splats/european-portuguese-splat-v2.svg"
  },
  {
    title: "Whatever you’re here for",
    body: "Work, travel, an exam, or just talking to your neighbours. You set the target.",
    asset: "/visuals/v2-splats/built-around-you-splat-v2.svg"
  },
  {
    title: "Talk first",
    body: "We talk. I correct you as we go, and explain the grammar when it’s the thing tripping you up.",
    asset: "/visuals/v2-splats/conversation-splat-generated-v2.webp"
  }
];

export default function ApproachPage() {
  return (
    <>
      <SiteHeader currentPage="approach" />

      <main className="approach-page" id="main-content">
        <section className="approach-composition" aria-labelledby="approach-title">
          <div className="approach-intro">
            {/* Stacked, the fan centres on the heading, so it shares its box. */}
            <div className="approach-intro__head">
              <h1 id="approach-title">
                No class.<br />
                No rush.<br />
                Just you<br />
                <em>talking.</em>
              </h1>
              <AssetMark
                asset="/visuals/generated-splats/cream-blue-fan-splat.webp"
                avifAsset="/visuals/generated-splats/cream-blue-fan-splat.avif"
                className="approach-intro__splat"
                height={1254}
                mobileAsset="/visuals/generated-splats/cream-blue-fan-splat-mobile.webp"
                mobileAvifAsset="/visuals/generated-splats/cream-blue-fan-splat-mobile.avif"
                priority
                width={1254}
              />
            </div>
            <div className="editorial-rule editorial-rule--green" aria-hidden="true" />
            <p>We start from what you can already say. Where it goes after that is up to you.</p>
          </div>

          <div className="approach-list">
            {approachItems.map((item) => (
              <article className="approach-item" key={item.title}>
                <AssetMark asset={item.asset} />
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="teacher-band" aria-labelledby="teacher-title">
          <h2 id="teacher-title">Meet Inês</h2>
          <p>
            Native speaker from Porto <span aria-hidden="true">·</span> BA in Languages, Literatures &amp; Cultures{" "}
            <span aria-hidden="true">·</span> Portuguese and English
          </p>
        </section>

        <section className="editorial-callout">
          <h2>Beginners welcome.</h2>
          <p>
            If you’ve never said a word of Portuguese, we can start there. If you’ve been stuck at the same level for
            years, we can start there too.
          </p>
          <Link className="button button--coral" href="/book/?lesson=trial">Book a trial lesson</Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
