import { BRAND } from "@/lib/tutor";
import type { Metadata } from "next";

export const SITE_URL = "https://portuguesewithines.com";

export const shareImage = {
  url: "/og.png?v=20261126b",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${BRAND} in cream script, centred on deep blue. Lavender splats with coral strokes come in from the top right and bottom left corners.`
};

/**
 * Next replaces the layout's openGraph wholesale rather than merging it, so a
 * page that only set a title still shared as the home page. Each public page
 * states its own canonical, share title and URL, and carries the shared image.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title: `${title} · ${BRAND}`,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: BRAND,
      locale: "en_GB",
      type: "website",
      images: [shareImage]
    },
    twitter: { card: "summary_large_image", title, description, images: [shareImage] }
  };
}
