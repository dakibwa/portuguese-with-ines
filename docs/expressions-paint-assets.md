# Expressions: paintings to commission

"Pinta e descobre" (design/README.md, Expressions) paints a student's
expression with gouache strokes that are drawn in code for now, in
`src/components/expressions/paint-art.ts`. Each stand-in below can be replaced
by a painting without changing how the reveal works: the code already paints
every piece once and then only moves, wipes and fades it. The lettering stays
live type (Beth Ellen, in the paper's cream), because it must be the real
phrase.

## For every painting

- Gouache, matte: no gloss, highlights or wet sheen. Darker pigment settles at
  the dried edges; bristle streaks run along the stroke.
- Transparent background, WebP with alpha, sRGB, painted for 2x screens: the
  sizes below are in image pixels, twice the size each piece appears on the page.
- One set per paint, in these exact colours (the body colour, before texture):

  | Name | Colour | Cream lettering contrast |
  | --- | --- | --- |
  | `deep` | `#203E82` | 9.3:1 |
  | `blue` | `#2C54AA` | 6.5:1 |
  | `coral` | `#B43A26` | 5.4:1 |
  | `lavender` | `#554F91` | 6.6:1 |

  Keep the texture light enough that `#FBF4E5` lettering on the darkest
  streaks still clears 4.5:1.
- Put the files in `public/visuals/expression-paint/` only when the site uses
  them (the design contract keeps `public/visuals/` to assets in use).

## The pieces

| File | Size (px, 2x) | Replaces | What it is |
| --- | --- | --- | --- |
| `stroke-{paint}-{1..3}.webp` | 2400 × 300 | `paintStroke` | One horizontal stroke, painted left to right. Left 12%: the loaded, blunt touchdown. 12–80%: an even body about 220 px tall, uniform enough to be cropped to any line length. Last 20%: the brush running dry, breaking into separate bristles that thin out. Three variants per paint, so the lines of one phrase differ. |
| `bead-{paint}.webp` | 200 × 330 | `paintBead` | The wet front of the stroke as it moves: a rounded end of paint, its left half fading to transparent so it melts into the stroke behind it. |
| `pool-{paint}-{1,2}.webp` | 300 × 300 | `blob` (resting pool) | The flat pool waiting by the margin, seen from above, with one small satellite drop. Two variants per paint. |
| `dab-{paint}.webp` | 330 × 330 | `blob` (the press) | The dab that lands in the pool on the press, a little larger and looser than the pool. |
| `drop-{1..6}.webp` | 24 to 64 square | `blob` (spatter) | Six small drops of different sizes and shapes, painted in white on transparent: the code tints them in the paint and its companion colours. |
| `dry-lavender.webp` | 1200 × 120 | `paintStroke(…, { dry: true })` | The near-miss: a thin, half-empty lavender wash in `#908ACC`, its middle mostly whole (wax letters show through it), with a long, broken bristle tail. |
| `strike-{paint}.webp` | 900 × 64 | the strike in `nearMiss` | A quick, thin crossing-out stroke, rising slightly to the right, ending in a small flick. |

## Not to commission

- The wax: the phrases at rest are live text in the font, a shade brighter than
  the paper with the faintest raised edge, so they are always real phrases.
- The paper grain: the site's `paper-grain.svg` already lies over the card.
- A chapéu or any other mark at the card's corner: the reveal has none.
