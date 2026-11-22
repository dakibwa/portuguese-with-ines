# Button

Every call to action: coral to book or commit, blue for Inês's main action, soft lilac for a quiet constructive one, outlined for the way out.

**Markup:** `<a class="button button--coral" href="/book/">Book a lesson</a>`, or a `<button>` with the same classes. Add `button--compact` for the pair beside a main action.

- `button` is 60px tall, `squiggle-button`, 0.9rem × 2.7rem padding, set in `button-label` (0.78rem, 600, 0.19em, uppercase). `button--compact` is 50px, 0.7rem at 0.14em.
- `button--coral`: `coral-action` with `paper-light` text (5.4:1). Booking and anything that books, pays or sends. One per view.
- `button--blue`: `blue-deep` with `paper-light`. A main action that is not booking (Save hours), or the selected agreement beside a coral action, so two coral fills never sit side by side.
- `button--lilac`: `lavender-soft` with `ink` (9:1). Something to do rather than a way out: Take some hours off, Add a new student, Send again.
- `button--outline`: 1.5px `outline-edge`, `squiggle-button-alt` (the mirrored cut, so a pair never shares one drawing), `ink` text. Cancel, Back, Done, Try again, Payment questions. `button--outline-light` is the same on blue, edged in `outline-light-edge`, text `paper`.
- Under the pointer a button lifts 2px, a filled one casts a soft shadow in its own colour (`shadow-lift-coral`, `-blue`, `-lilac`), its fill deepens (`coral-pressed`, `ink`, `lilac-pressed`) and its cut shifts to `squiggle-button-shift` on `motion-spring`. A press sinks it to 97%.
- Disabled, a filled button becomes the quiet outline (1px `rule`, transparent, 55% opacity) and does not answer, so coral and blue appear only when the action is live.
- Labels say what happens in a few words: Book a lesson, Change, Move lesson, Send on WhatsApp. Every booking action says `Book a lesson`; every retry says `Try again`. No underlined word stands in for a button.

## Write

```tsx
<Link className="button button--coral" href="/book/?lesson=trial">Book a trial lesson</Link>
<button className="button button--outline button--compact" onClick={signInInstead} type="button">Sign in</button>
```

A link that goes somewhere is `Link`; an action is a `<button type="button">`. The colour is a modifier: `button--coral`, `--blue`, `--lilac`, `--outline`, `--outline-light`; `button--compact` for the pair beside a main action.

## Source

- `src/app/approach/page.tsx`, find `className="button button--coral"`
- `src/components/AuthPanel.tsx`, find `className="button button--outline button--compact"`
- `src/app/globals.css`, find `.button--coral`
