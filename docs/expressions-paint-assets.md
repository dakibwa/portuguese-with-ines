# Expressions: paintings to commission

"Pinta e descobre" (design/README.md, Expressions) paints a student's
expression with gouache strokes that are drawn in code for now, in
`src/components/expressions/paint-art.ts`. Each stand-in below can be replaced
by a painting without changing how the reveal works: the code already paints
every piece once and then only moves, wipes and fades it. The lettering stays
live type (Beth Ellen, in the paper's cream or, on lavender, in ink), because
it must be the real phrase. The code sizes each stroke round the phrase's own
letters and keeps the stretch under them solid, so a painted stroke must be
solid across its body: streaks of bare paper belong only in its dry-brush end.
The code also shapes how each piece is uncovered (a rounded wet front, a dry
brush's ragged one for the near-miss, and a rounded end to the body under the
bead), so no painting needs a hard edge of its own anywhere.

## For every painting

- Gouache, matte: no gloss, highlights or wet sheen. Darker pigment settles at
  the dried edges; bristle streaks run along the stroke.
- Transparent background, WebP with alpha, sRGB, painted for 2x screens: the
  sizes below are in image pixels, twice the size each piece appears on the page.
- One set per paint, in these exact colours (the body colour, before texture):

  | Name | Colour | Lettering | Contrast |
  | --- | --- | --- | --- |
  | `deep` | `#203E82` | cream `#FBF4E5` | 9.3:1 |
  | `blue` | `#2C54AA` | cream `#FBF4E5` | 6.5:1 |
  | `coral` | `#B43A26` | cream `#FBF4E5` | 5.4:1 |
  | `lavender-ink` | `#554F91` | cream `#FBF4E5` | 6.6:1 |
  | `lavender` | `#AAA4E6` | ink `#1A3169` | 5.4:1 |

  Keep the texture light enough that the lettering still clears 4.5:1 on every
  streak: cream on the darkest streaks of the four dark paints, ink on the
  darkest streaks of lavender (its streaks darken towards lavender ink, not
  black, and only faintly).
- Put the files in `public/visuals/expression-paint/` only when the site uses
  them (the design contract keeps `public/visuals/` to assets in use).

## The pieces

| File | Size (px, 2x) | Replaces | What it is |
| --- | --- | --- | --- |
| `stroke-{paint}-{1..3}.webp` | 2400 × 300 | `paintStroke` | One horizontal stroke, painted left to right. Left 12%: the loaded, blunt touchdown. 12–80%: an even body about 220 px tall, uniform enough to be cropped to any line length. Last 20%: the brush running dry, breaking into separate bristles that thin out. Three variants per paint, so the lines of one phrase differ. |
| `bead-{paint}.webp` | 200 × 330 | `paintBead` | The wet front of the stroke as it moves: a rounded end of paint, its left half fading to transparent so it melts into the stroke behind it, with only a faint darker rim (fainter still on lavender). The code carries it on the wipe that uncovers the letters, its front at the wipe's rounded front, so the two can never part; when the brush lifts it soaks back into the stroke's body. |
| `pool-{paint}-{1,2}.webp` | 300 × 300 | `blob` (resting pool) | The flat pool waiting by the margin, seen from above, with one small satellite drop. Two variants per paint. |
| `dab-{paint}.webp` | 330 × 330 | `blob` (the press) | The dab that lands in the pool on the press, a little larger and looser than the pool. |
| `drop-{1..6}.webp` | 24 to 64 square | `blob` (spatter) | Six small drops of different sizes and shapes, painted in white on transparent: the code tints them in the paint and its companion colours. |
| `dry-{lavender,coral,deep}.webp` | 1200 × 120 | `paintStroke(…, { dry: true })` | The near-miss: a thin, half-empty wash, its middle mostly whole (wax letters show through it), with a long, broken bristle tail. Lavender `#908ACC` behind the blues and coral, coral `#E2735A` behind lavender ink, deep blue `#203E82` behind lavender, so the strike in the real paint always stands out. |
| `strike-{paint}.webp` | 900 × 64 | the strike in `nearMiss` | A quick, thin crossing-out stroke, rising slightly to the right, ending in a small flick. Lavender's is broader than the others (about a quarter of the near-miss's band, against a sixth), so the light stroke reads as boldly across the deep blue wash. |

## Not to commission

- The wax: the phrases at rest are live text in the font, a shade brighter than
  the paper with the faintest raised edge, so they are always real phrases.
- The paper grain: the site's `paper-grain.svg` already lies over the card.
- A chapéu or any other mark at the card's corner: the reveal has none.
