import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
import { LessonMark } from "@/components/LessonMarks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { lessonProducts } from "@/lib/lesson-products";

export const metadata: Metadata = pageMetadata({
  title: "Lessons | Português com a Inês",
  description: "Prices for one-to-one Portuguese lessons, online or in person.",
  path: "/lessons/"
});

export default function LessonsPage() {
  return (
    <>
      <SiteHeader currentPage="lessons" />

      <main className="lessons-page" id="main-content">
        <section className="lessons-hero" aria-labelledby="lessons-title">
          <div className="lessons-hero__title">
            <h1 id="lessons-title">
              Lessons, and<br />
              what they <em>cost.</em>
            </h1>
          </div>
          <div className="lessons-hero__art">
            <AssetMark
              asset="/visuals/generated-splats/open-centre-lavender-splat.webp"
              avifAsset="/visuals/generated-splats/open-centre-lavender-splat.avif"
              className="lessons-hero__field"
              height={1254}
              mobileAsset="/visuals/generated-splats/open-centre-lavender-splat-mobile.webp"
              mobileAvifAsset="/visuals/generated-splats/open-centre-lavender-splat-mobile.avif"
              priority
              width={1254}
            />
          </div>
        </section>

        <section className="lesson-programme" aria-label="Lessons and prices">
          <div className="lesson-programme__grid">
            {lessonProducts.map((product) => (
              <article className={`lesson-product lesson-product--${product.id}`} key={product.id}>
                <div className="lesson-product__head">
                  <p className="eyebrow">{product.title}</p>
                  <LessonMark
                    className="lesson-product__mark"
                    durationMinutes={product.durationMinutes}
                    lessonTypeId={product.id}
                  />
                </div>
                <div className="lesson-product__pricing">
                  <p className="lesson-product__price">{product.price}</p>
                  <p className="lesson-product__duration">{product.duration}</p>
                </div>
                <p className="lesson-product__description">{product.description}</p>
                <div className="lesson-product__action">
                  {/* The link stretches over the whole card, so the card itself is the target. */}
                  <Link
                    className={`button button--compact lesson-product__link ${product.id === "trial" ? "button--coral" : "button--outline"}`}
                    href={`/book/?lesson=${product.id}`}
                  >
                    {product.bookingLabel}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lessons-closing" aria-label="Where lessons happen and paying">
          <AssetMark asset="/visuals/v2-splats/in-porto-or-online-splat-v2.svg" className="lessons-closing__mark" />
          <div className="lessons-closing__copy">
            <p className="lessons-closing__title">In Porto or online</p>
            <p>You’ll see the price and how to pay before you confirm your lesson.</p>
          </div>
          <div className="lessons-closing__actions">
            <Link className="button button--coral button--compact" href="/book/?view=book">Book a lesson</Link>
            <Link className="button button--outline-light button--compact" href="/faq#faq-payment">
              Payment questions
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
