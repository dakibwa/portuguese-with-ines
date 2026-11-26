import { BRAND } from "@/lib/tutor";
import type { Metadata } from "next";

export const SITE_URL = "https://portuguesewithines.com";

export const shareImage = {
  url: "/og.png?v=20261126",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${BRAND} in cream script on deep blue. A lavender splat with a coral stroke runs off the top right corner.`
};

/**
 * Next replaces the layout's openGraph wholesale rather than merging it, so a
 * page that only set a title still shared as the home page. Each public page
 * states its own canonical, share title and URL, and carries the shared image.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
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
