import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { AssetMark } from "@/components/BrandMarks";
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

        <section className="lesson-programme" aria-labelledby="programme-title">
          <p className="lesson-programme__intro" id="programme-title">
            One to one, online or in person. An hour, or an hour and a half if you want longer.
          </p>
          <div className="lesson-programme__grid">
            {lessonProducts.map((product) => (
              <article className="lesson-product" key={product.id}>
                <p className="eyebrow">{product.title}</p>
                <p className="lesson-product__price">{product.price}</p>
                <p className="lesson-product__duration">{product.duration}</p>
                <span className="lesson-product__rule" aria-hidden="true" />
                <p className="lesson-product__description">{product.description}</p>
                <div className="lesson-product__note">
                  <span>{product.note ?? ""}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="lessons-closing">
          <section className="lesson-location-band">
            <div>
              <AssetMark asset="/visuals/v2-splats/in-porto-or-online-splat-v2.svg" className="lesson-location-band__mark" />
              <p>In Porto or online</p>
            </div>
            <Link className="button button--coral" href="/book/?view=book">Book a lesson</Link>
          </section>

          <section className="lessons-note">
            <p>You’ll see the price and how to pay before you confirm your lesson.</p>
            <Link className="text-action" href="/faq#faq-payment">Payment questions</Link>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
