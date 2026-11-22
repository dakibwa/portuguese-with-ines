# SiteFooter

The blue band that closes every page: the cream wordmark, the four links, Terms & privacy and the menu.

**Markup:** `<footer class="site-footer"><div class="site-footer__brand">…Wordmark cream…</div><div class="site-footer__actions"><nav class="site-footer__nav">…</nav><nav class="site-footer__legal"><a href="/book/#terms-privacy">Terms &amp; privacy</a></nav><div class="site-footer__contact"><button class="site-footer__menu">Menu</button></div></div></footer>`

- `blue-deep` with the grain and a 2px `lavender` top edge; 0.85rem × `page-pad`.
- Links in `footer-label` (0.72rem, 700, uppercase) in `paper`; Terms & privacy is the footer's one underlined link and opens the Terms dialog.
- On Inês's schedule the footer meets the bottom of the window.

## Write

```tsx
<SiteFooter />
```

The last thing on every public page, after `</main>`.

## Source

- `src/components/SiteFooter.tsx#SiteFooter`
