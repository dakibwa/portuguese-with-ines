# Terms

Terms & privacy: the one policy, in a dialog lifted off the page, its sections in small capitals.

**Markup:** `<dialog class="policy-dialog" open><div class="policy-dialog__heading"><h2>Terms &amp; privacy</h2><button aria-label="Close terms &amp; privacy">…x…</button></div><div class="policy-dialog__content"><div class="policy-information">…</div></div></dialog>`, opened by any link with `data-terms-privacy`.

- `min(760px, 100% − 2rem)`, `squiggle-panel`, 1px `rule`, the `--dialog-surface` (the sheet over the paper), `shadow-dialog`. The content scrolls inside; the heading stays.
- Every pop-up's title is set alike and its way out is the same 44px hand-cut close button.
- Section names (Booking, Payments, Changes, Your rights, Privacy) in `eyebrow-label`; bullets lead with a bold phrase. Links inside sentences are underlined in `coral-action`.
- One name for the policy everywhere: `Terms & privacy`. Without JavaScript it is readable in the booking page itself.
