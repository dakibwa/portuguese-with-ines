# EditorialRule

The drawn rule under a display heading, and the short rule under a principle's heading.

**Markup:** `<div class="editorial-rule" aria-hidden="true"></div>` after the `<h1>`; `editorial-rule--green` for the blue rule; `<span class="short-rule" aria-hidden="true"></span>` inside a principle.

- `editorial-rule`: 2px of `lavender`, `min(360px, 75%)` wide, 1.4rem above and 1.2rem below. On blue it stays lilac; on lilac panels use `editorial-rule--green` (the brand blue).
- `short-rule`: 30 × 1px, under each Home principle's heading.
- They are drawn in once, from the left end at a pen's pace (`motion-pen`): the hero's a moment after its heading shows, a principle's as its splat settles, an FAQ section's each time it is chosen. Nothing else on a page makes an entrance.
- Rules are the only lines under headings; never underline a heading or bake a line into artwork.
