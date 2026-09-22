import type { Metadata } from "next";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const principles = [
  {
    title: "Just you",
    body: "No class to keep up with. We spend the hour on whatever you need most.",
    asset: "/visuals/v2-splats/one-to-one-splat-v2.svg"
  },
  {
    title: "Slow is fine",
    body: "Repeat things. Ask the obvious question. Build up confidence.",
    asset: "/visuals/v2-splats/build-confidence-splat-generated-v2.webp"
  },
  {
    title: "Portuguese you’ll use",
    body: "Expand your vocabulary and learn the grammar through practice.",
    asset: "/visuals/v2-splats/real-life-splat-v2.svg"
  }
];

export default function Home() {
  return (
    <>
      <SiteHeader currentPage="home" />

      <main className="home-page" id="main-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero__copy">
            <h1 id="home-title">
              <span>Portuguese</span>
              <span className="home-title__script">Lessons</span>
            </h1>
            <div className="editorial-rule" aria-hidden="true" />
            <p>One to one, at your pace.<br />Online or in person.</p>
            <div className="home-hero__actions">
              <Link className="button button--coral" href="/book/?view=book">
                Book a lesson
              </Link>
              <nav className="home-hero__links" aria-label="Learn more about lessons">
                <Link className="button button--outline-light button--compact" href="/approach">How I teach</Link>
                <Link className="button button--outline-light button--compact" href="/lessons">Lessons and prices</Link>
              </nav>
            </div>
          </div>

          <section className="principles-strip" aria-label="How lessons work">
            {principles.map((principle) => {
              return (
                <article className="principle" key={principle.title}>
                  <AssetMark asset={principle.asset} />
                  <div>
                    <h2>{principle.title}</h2>
                    <span className="short-rule" aria-hidden="true" />
                    <p>{principle.body}</p>
                  </div>
                </article>
              );
            })}
          </section>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
