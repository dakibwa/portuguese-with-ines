# The Português com a Inês design system

The site's design system is the files in [`project/`](./project/). Read
`project/README.md` first: it says what makes a page Inês's, how the site is
written, where everything is, the rules, which file wins and how to check your
work. It lives on no account and in no design tool (Dan, 19 Nov 2026: "can we
ensure we have a single design system? having this all spread across acounts
feels wrong", "bring it in unison and not locked in"), and it is written for
agents to read (Dan, 20 Nov 2026: "the system is for agents remember not me").

```sh
node design/system/make/check.mjs --system design/system/project            # is it true to the site?
node design/system/make/check.mjs --system design/system/project --index    # rewrite components/README.md
node design/system/make/assets.mjs                                          # copy the site's stylesheets for the cards
node design/system/make/site.mjs --system design/system/project             # draw it as design/system/page/index.html
```

The page opens in any browser with no server, sign-in or network. Git ignores
it: it is a view of the files and holds nothing of its own, so never edit it.

- `make/check.mjs` and `make/site.mjs` are the same files in every one of Dan's
  repositories. Their home is `dakibwa/design-system-page`: change them there
  first and copy them here again, unchanged.
- `make/assets.mjs` copies the site's five stylesheets into
  `project/components/site/`; `components/bundle.css` loads them with the two
  fonts (`components/fonts/`, Beth Ellen and Montserrat in Latin, as `next/font`
  serves them) and the cards' frame (`components/frame.css`). With `--check` it
  says whether a copy is behind the site.
- Logos, Splats, Fields and Email under `project/assets/` are links to the
  site's own files in `public/` and `src/app/icon.png`, so there is one copy of
  each picture. Screens are pictures of their own, drawn with the QA fixtures,
  so every name in them is made up.
- `project/page.json` says only how the page presents this system.
- `../README.md` holds the long design notes, with their history: background,
  which the system outranks (Dan, 22 Nov 2026: "yes fix everything please so
  it's unified").

## Before this one

Until 19 Nov 2026 the system was a Claude Design page on Dan's account; its
files were brought here that day, and the Claude page is a frozen copy that
nothing syncs to or from. On 22 Nov 2026 it was rewritten in the format all of
Dan's design systems share, for agents, and became the first design source,
ahead of `design/README.md`.

## Known gap in the drawn page

Opened straight from disk, Chromium will not paint CSS masks from local files,
so the wordmark (a mask) is blank in the header, footer, menu and Wordmark
cards. It shows when the browser may read local files (Chromium's
`--allow-file-access-from-files`) or when the page is served over http.
