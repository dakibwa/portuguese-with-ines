import { publicAssetPath } from "@/lib/paths";

type AssetMarkProps = {
  asset: string;
  avifAsset?: string;
  className?: string;
  height?: number;
  /** A little splat that lands as it arrives; see SplatArrivals. */
  lands?: boolean;
  mobileAsset?: string;
  mobileAvifAsset?: string;
  priority?: boolean;
  width?: number;
};

/*
 * The AVIF variants exist because the hero splats carry painterly grain that
 * WebP prices at 85–95 kB; AVIF encodes the same art at less than half that,
 * and on a throttled phone the hero's download time was the whole LCP story.
 * The WebP stays as the fallback for the few browsers without AVIF.
 *
 * A priority mark also preloads its AVIF variants. The <picture> is in the
 * static HTML, but on a slow connection the request still queued ~400ms behind
 * the stylesheet and font; a preload link at the top of <head> (React hoists
 * these) starts it with the first wave. type="image/avif" makes non-AVIF
 * browsers skip the preload instead of downloading an image they cannot show.
 */
export function AssetMark({
  asset,
  avifAsset,
  className,
  height,
  lands = false,
  mobileAsset,
  mobileAvifAsset,
  priority = false,
  width
}: AssetMarkProps) {
  const avifPath = avifAsset ? publicAssetPath(avifAsset) : undefined;
  const mobileAvifPath = mobileAvifAsset ? publicAssetPath(mobileAvifAsset) : undefined;

  return (
    <span
      className={["asset-mark", lands ? "asset-mark--lands" : "", className ?? ""].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {priority && mobileAvifPath ? (
        <link
          rel="preload"
          as="image"
          href={mobileAvifPath}
          media="(max-width: 720px)"
          type="image/avif"
          fetchPriority="high"
        />
      ) : null}
      {priority && avifPath ? (
        <link
          rel="preload"
          as="image"
          href={avifPath}
          media={mobileAvifPath ? "(min-width: 721px)" : undefined}
          type="image/avif"
          fetchPriority="high"
        />
      ) : null}
      <picture className="asset-mark__picture">
        {mobileAvifPath ? (
          <source
            media="(max-width: 720px)"
            srcSet={mobileAvifPath}
            type="image/avif"
          />
        ) : null}
        {mobileAsset ? (
          <source
            media="(max-width: 720px)"
            srcSet={publicAssetPath(mobileAsset)}
          />
        ) : null}
        {avifPath ? <source srcSet={avifPath} type="image/avif" /> : null}
        <img
          alt=""
          className="asset-mark__image"
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          height={height}
          loading={priority ? "eager" : "lazy"}
          src={publicAssetPath(asset)}
          width={width}
        />
      </picture>
    </span>
  );
}
