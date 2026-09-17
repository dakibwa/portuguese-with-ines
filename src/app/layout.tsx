import type { Metadata } from "next";
import { Beth_Ellen, Montserrat } from "next/font/google";
import { preload } from "react-dom";
import { BookingInformation } from "@/components/BookingInformation";
import {
  AKIBWA_PROJECT_VIEW_BOOTSTRAP,
  AkibwaProjectBanner
} from "@/components/AkibwaProjectBanner";
import { shareImage } from "@/lib/page-metadata";
import { publicAssetPath, publicAssetUrl } from "@/lib/paths";
import "./globals.css";

/*
 * Preloaded, reversing the earlier call to keep it lazy. Every page's largest
 * text is a Beth Ellen headline, and with the fetch starting only after style
 * resolution the headline repainted ~1.5s later on a throttled phone — the
 * dominant term in those pages' LCP. Preloading costs ~100ms of first paint
 * (its 40 kB shares the pipe with the stylesheet) and moves the settled
 * headline more than a second earlier; measured on /lessons/, 2.6s → ~1.7s.
 */
const bethEllen = Beth_Ellen({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-beth-ellen"
});

const montserrat = Montserrat({
  weight: ["400", "600", "700"],
  style: "normal",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat"
});

// Absolute base for share-card URLs. Social scrapers (WhatsApp, Instagram,
// Facebook, iMessage) need an absolute image URL; without this Next resolves
// og:image against localhost and the preview comes back blank. This is the
// canonical production domain — the Portuguese-spelling domain redirects to it.
const SITE_URL = "https://portuguesewithines.com";
const shareDescription = "One-to-one Portuguese lessons, online or in person. Any level.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Português com a Inês | Portuguese Lessons",
  description:
    "One-to-one Portuguese lessons with Inês, online or in person. Any level, no fixed syllabus.",
  openGraph: {
    title: "Português com a Inês | Portuguese Lessons",
    description: shareDescription,
    url: "/",
    siteName: "Português com a Inês",
    locale: "en_GB",
    type: "website",
    images: [shareImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "Português com a Inês | Portuguese Lessons",
    description: shareDescription,
    images: [shareImage]
  }
};

/**
 * The header wordmark is the logo on every route, but it reaches the browser as
 * a mask-image behind a CSS custom property, so the preload scanner cannot see
 * it and nothing requests it until the stylesheet has downloaded and style
 * resolution has run. BrandWordmark already noted that its priority prop cannot
 * help, since a CSS mask does not participate in image loading priority.
 *
 * crossOrigin is required and not incidental: CSS fetches its images in CORS
 * mode, and a preload whose credentials mode does not match is discarded rather
 * than reused — which downloads the file twice instead of once. The paper grain
 * is deliberately not preloaded; at 480 bytes it arrives in a single packet and
 * is not worth an extra early request competing with the fonts.
 */
const wordmarkAsset = "/visuals/wordmark-cream.webp";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload(publicAssetPath(wordmarkAsset), { as: "image", crossOrigin: "anonymous" });

  return (
    <html
      className={`${bethEllen.variable} ${montserrat.variable}`}
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: AKIBWA_PROJECT_VIEW_BOOTSTRAP }} />
      </head>
      <body
        style={{
          ["--paper-texture" as string]: publicAssetUrl("/visuals/paper-grain.svg")
        }}
      >
        <AkibwaProjectBanner />
        {children}
        <BookingInformation />
      </body>
    </html>
  );
}
