# Wordmark

Inês's hand-lettered name, the site's only logo: blue on cream in the header, cream on blue in the footer.

**Markup:** `<span class="brand-wordmark brand-wordmark--green" role="img" aria-label="Português com a Inês" style="--wordmark-image:url(…/wordmark-cream.webp)"><span class="brand-wordmark__letters"></span><span class="brand-wordmark__hat brand-wordmark__hat--portugues"></span><span class="brand-wordmark__hat brand-wordmark__hat--ines"></span></span>`. The container sets its width; the mark keeps 760 × 236.

- One raster, `wordmark-cream.webp`, used as a mask and painted with `currentColor`: `brand-wordmark--green` paints it `blue` (the class keeps its old name), `brand-wordmark--cream` paints it `paper`. Never another colour, never the raster as an `<img>`.
- The two circumflexes are their own layers so they can dance: every four seconds they hop in turn, Português, Inês, on the soft spring, to the wall clock's beat so the dance carries across pages. It is the one ambient motion on the site; reduced motion keeps them still.
- The header's wordmark is the way home. Pointing at it changes nothing (a coral hover was removed, Dan, 9 Oct 2026).
- Never put a second wordmark or the name in Beth Ellen type on the same screen: page headings name the page, not the brand.

## Write

```tsx
<BrandWordmark tone="cream" className="footer-wordmark" />
```

`tone` is the ground it sits on; it is always this component, never the name typed in Beth Ellen (Rules: the-wordmark).

## Source

- `src/components/BrandWordmark.tsx#BrandWordmark`
