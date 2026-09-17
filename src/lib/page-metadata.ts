import type { Metadata } from "next";

export const shareImage = {
  url: "/og.png?v=20260914",
  width: 1200,
  height: 630,
  alt: "Português com a Inês: one-to-one Portuguese lessons"
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
      siteName: "Português com a Inês",
      locale: "en_GB",
      type: "website",
      images: [shareImage]
    },
    twitter: { card: "summary_large_image", title, description, images: [shareImage] }
  };
}
