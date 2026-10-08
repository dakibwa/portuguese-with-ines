import type { CSSProperties } from "react";
import { publicAssetUrl } from "@/lib/paths";

type BrandWordmarkProps = {
  className?: string;
  priority?: boolean;
  tone?: "green" | "cream";
};

type WordmarkStyle = CSSProperties & {
  "--wordmark-image": string;
};

/**
 * The hand-lettered business-card wordmark is used as an alpha mask so the
 * original lettering stays crisp while it can switch between green and cream.
 * The priority prop is retained for call-site compatibility; a CSS mask does
 * not participate in image loading priority.
 *
 * The lettering and the two circumflexes over its ê (the chapéu, the "hat")
 * are separate masks over the one artwork. At rest they print as one; the
 * header's wordmark tips each hat as its ink passes (globals.css).
 */
export function BrandWordmark({
  className,
  tone = "green"
}: BrandWordmarkProps) {
  const classes = [
    "brand-wordmark",
    `brand-wordmark--${tone}`,
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      aria-label="Português com a Inês"
      className={classes}
      role="img"
      style={{ "--wordmark-image": publicAssetUrl("/visuals/wordmark-cream.webp") } as WordmarkStyle}
    >
      <span className="brand-wordmark__letters" />
      <span className="brand-wordmark__hat brand-wordmark__hat--portugues" />
      <span className="brand-wordmark__hat brand-wordmark__hat--ines" />
    </span>
  );
}
