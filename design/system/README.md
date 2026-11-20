# The Português com a Inês design system

The site's look in one place: the brand book, what each page is for, every
token, each component as the site's real markup, Inês's wordmark, the splats,
the painted fields, the email pieces and screens of the running site.

There is one design system, and it is the files in [`project/`](./project/)
(Dan, 19 Nov 2026, of copies kept as pages on Claude accounts: "can we ensure
we have a single design system? having this all spread across acounts feels
wrong", "bring it in unison and not locked in"). It lives on no account and in
no design tool. To look at it, draw it as a page:

```sh
node design/system/make/site.mjs --system design/system/project --out design/system/page
```

and open `design/system/page/index.html` in any browser. Git ignores the page,
because it is drawn from these files and holds nothing of its own. Never edit
it and never commit it.

## Arriving cold (an assistant of any make, or a person)

| You want | Read |
|---|---|
| The look in one read: how pages are built, words, colour, type, shape, motion, states, icons, logo | `project/README.md` (the brand book) |
| What each page is for | `project/1-pages.md` |
| How to lay out every small box | `project/2-compact-cards.md` |
| Every token with its value and what it is for | `project/tokens.json` (named as the CSS variables in `src/app/globals.css`) |
| Each component: its rules and the site's real markup | `project/components/<Name>/README.md` and `preview.html` (styled only by `components/bundle.css`, the site's stylesheets) |
| The wordmark, icons, splats, fields and email pieces | `project/assets/<Group>/`, each with a README |
| What the site looks like, wide and on a phone | `project/assets/Screens/*.png` |
| The fuller, older contract with its history | `design/README.md`, which stays canonical |

The code is the truth. Where a file here and the site disagree, the site wins
and this folder is out of date.

## What is where

- `project/` is the system's own text, in the layout all of Dan's design
  systems share, so the same tools read them all.
- Logos, Splats, Fields and Email are links to the site's own files in
  `public/` and `src/app/icon.png`, so there is one copy of each picture and
  the system always shows what the site ships. Screens are files of their
  own: 25 pictures of the site at `e530e0c` (9 Nov 2026), drawn with the QA
  fixtures, so every name in them is made up.
- `components/bundle.css` is the site's four stylesheets as they stood at
  `0064f55` (9 Nov 2026), and the previews are the markup of `e530e0c`. They
  are a snapshot: rebuild the stylesheet and the cards from the running site
  when a change's point is the look.
- The fonts are Beth Ellen and Montserrat from Google Fonts (`bundle.css`
  imports them), so the drawn page needs the network for its type.
- `project/page.json` says only how the page presents this system: what it
  wears, the colour headings, the samples, how each group of pictures lays out.
- `make/site.mjs` draws the page. It is the same file in every one of Dan's
  repositories; its home is `dakibwa/design-system-page`. Change it there first and copy
  it here unchanged.

## Where it came from

Until 19 Nov 2026 this system was a Claude Design page on Dan's account. Its
files and pictures were exported here unchanged, with three exceptions: the
previews' picture addresses now point at the files in this folder; five of
Dan's quoted words that the repository did not already carry were left out
(the dates and attributions stay); and `tokens.json` lists Montserrat before
Beth Ellen, so the drawn page reads in the body face. The Claude page is left
as it was, a frozen copy. Nothing is synced to it or from it.

## Known gaps in the drawn page

- Opened straight from disk, Chromium will not paint CSS masks from local
  files, so the wordmark (a mask) is blank in the header, footer, menu and
  Wordmark cards. It shows when the browser may read local files (checked
  with Chromium's `--allow-file-access-from-files`), and should when the page
  is served over http.
