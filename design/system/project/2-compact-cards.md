# Compact cards

How to lay out every little box on the site: a lesson, a weekly run, a receipt, a fact in a profile, a student's card, a time off, a booking summary row. The goal is that a small card is only as big as what it says, so more of what Inês and her students need fits on one screen without feeling crowded.

The same idea is behind the Profile on a phone in #198 (Dan, 9 Nov 2026) and behind the "stranded action" (13 Oct 2026).

## The thought process

Work through these in order for each card, before touching any styling.

1. **List what the card says.** Write down every fact and every control on it.
2. **Cut what repeats.** Say each thing once. Drop any fact that the section heading, the card above or another line on the same card already says. For example, under `Upcoming · 11` a card doesn't need to say it is upcoming, and a weekly run that says `Every Friday` doesn't also need a `Weekly` tag.
3. **Rank what is left.** Most cards have three ranks:
   - **Identity:** the line that says which one this is, such as the date and time, or a name.
   - **State:** the one status or action that belongs to it, such as `Already paid`, `Show weeks`, `Change email` or `No-show`.
   - **Quiet facts:** length, place, payment, moves and who added it.
4. **Lay the ranks out as rows, not a stack.**
   - The identity line carries the state at its end, on the right. Status sits beside the date, never on a row below it.
   - The quiet facts share one line after it, each with its small mark or a `·` between them.
   - That makes two rows for most cards, and one when there are no quiet facts.
5. **Fold toggles into the item's own line.** `Show weeks`, `Already paid`, `Change` and other small toggles sit at the end of the line they act on. A button never gets a row of its own.
6. **Pair a label, its value and its action on one row** wherever they fit:

   ```
   SIGN-IN EMAIL   ana@example.com   Change email
   ```

   The label uses the small capitals legend style (`legend-label`, `lavender-ink`). The action is the small outline button or a lilac pill, never a full-width button.
7. **Make the card as tall as its content.**
   - Use one shared inset (`pad-card`).
   - No minimum height, and no room held back for a button that isn't there.
   - Cards sit close together: `gap-list` between cards, `gap-row` or `gap-pair` inside a row.
   - A list packs with no hole under a short card.
8. **Check it at 390px and on a laptop.**
   - **On a phone:** if the identity line and its state don't fit together, the state wraps as a whole, starting under the identity line. It is never squeezed into a sliver, and no single word is left on a line of its own.
   - **On a laptop:** a lone pill doesn't stretch across the card, and a card that has room to share its row with the next one does.

## Worked examples

These are the two boxes Dan pointed at, from a student's profile in Inês's Students tab.

**A past lesson marked as paid**

Before: four rows, with the tick as a big button underneath.

```
Fri 4 Sept
09:00–10:30
90 mins
[ Already paid ]
```

After: two rows, with the tick beside the date.

```
Fri 4 Sept · 09:00–10:30            ✓ Already paid
90 mins
```

**A weekly run**

Before: the toggle stranded on a row of its own, and the facts spread over three lines.

```
↻ Every Friday 09:00–10:30
                                   [ Show weeks ]
5 weeks, Fri 11 Sept to Fri 9 Oct
90 mins · Payment arranged directly
```

After: the toggle at the end of the run's own line, and the facts on one line.

```
↻ Every Friday 09:00–10:30          Show weeks ⌄
5 weeks, Fri 11 Sept to Fri 9 Oct · 90 mins · Payment arranged directly
```

**A profile fact (#198, live).** `SIGN-IN EMAIL` with the address and `Change email` on one row replaces a label, a value and a button stacked on top of each other.

## Where it applies

It applies to every small box in Inês's schedule: lessons, weekly runs, students' cards and their profiles and Notes & homework pages, receipts, time off and expression rows. It also covers the student's side: Your lessons, Past lessons, Your details and the booking summary rows.

It does not apply to the public pages' editorial bands (home, How I teach, Lessons, FAQ). There, generous space is part of the voice.

## In review

Name the failure **stacked card**: one fact per line, with a lone button underneath, in a box taller than what it says. Before calling a card done, ask:

- Does any line hold one short thing that could sit beside its neighbour?
- Is any button or toggle on a line of its own?
- Is anything said twice, on the card or by the heading above it?
- Is the card taller than its content, or is there empty paper inside it or under it?
- At 390px, does the state wrap as a whole?

Keep this in step with the "Stranded action" entry in `design/README.md`, which stays canonical.
