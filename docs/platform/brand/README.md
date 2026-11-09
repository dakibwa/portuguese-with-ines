# Tutor platform: name and brand

Status on 9 November 2026: **the name is not picked.** The brand direction below is a draft made under the working name Chapeau, which Dan has since ruled out. Read this before any naming, logo or visual work on the platform, and update it when Dan decides something.

The platform is the white-label site, booking and payments product for language tutors that this repository is growing into (see the build plan in the project memory: Inês's site becomes its first tutor, free; €25 a month flat, no commission; 10 layouts × 10 colour sets for tutors' own sites).

## Dan's steers

- **A real word that holds on its own** (9 Nov, 13:40): "be original, don't have stupid stuff like Tutafy … a solid word that holds on its own". No coinages, no -ify or -ly, nothing gimmicky.
- **English or Latin** (9 Nov, 14:09): "I think it should be an english word or latin or something". So Chapeau (French) is out, and so are Cedilla and Tilde (Spanish).
- **Name first** (9 Nov, 14:10): "lets come up with words first for the name". Settle the name before more design work.
- **The quality bar is the Portudo design system** (9 Nov, 13:50): <https://claude.ai/artifact/BVyzAQ1Chg3rPzNfxieEgs>. Dan called the first brand page "so low quality compared to other stuff you've done". Whatever is made next must match Portudo's depth: a brand book of imperative rules, real copy, tokens with usage and contrast notes, a card per component, logo files with their own rules, a "Tried and rejected" list.
- **Crafted, not "AI slop"**: Dan sees the competitors (Tuton, Tutafy, TutorFluid, Pensight, Zenamu, Lesson Slot) as AI slop; design quality and done-for-you setup are the edge.

## The name

### Shortlist (round 2, sent to Dan 9 Nov 2026, ~14:30)

No product in teaching, tutoring or booking was found under any of these six (searched 9 Nov 2026).

| Word | Language | What it means for tutors | Namesakes found |
|---|---|---|---|
| **Vowel** (recommended) | English, from Latin *vocalis*, "voiced" | The heart of every word in every language; the ê in the draft logo is a vowel wearing its hat. | A meeting app (vowel.com) that shut in 2023 when Zapier took its team. |
| **Colloquy** | English, from Latin *colloquium*, "talking together" | Roman pupils learned Greek and Latin from *colloquia*, short scripted dialogues: the first language textbooks. | Colloquy, an old Mac IRC app; a loyalty-marketing firm. |
| **Caret** | Latin, "it is missing" | The ^ a teacher writes where a word is left out; the same mark as the hat on the ê, so the draft logo carries over. | CARET Legal (large law-firm software), a property app, a Markdown editor. Trademark risk in software; sounds like "carrot". |
| **Janua** | Latin, "door" | Comenius's *Janua Linguarum* (The Gate of Languages, 1631) taught Europe its languages; your own front door online. | Small firms outside teaching (an app studio in Yerevan, a decision tool in Sydney, construction software in Porto at janua.pt). |
| **Dais** | English | The raised platform the teacher's desk stands on: literally a platform. | Insurance, banking and AI-agent software. Said two ways ("day-is", "dace"). |
| **Rostrum** | Latin and English | The platform Roman speakers addressed the Forum from. | Conference-speaker software; a planner for school fine-arts directors (getrostrum.com), close to education. |

Domains (RDAP, 9 Nov 2026): every one of these as .com, .io and .app is registered, as are getvowel.com, getcaret.com, getcolloquy.com, getjanua.com and getdais.com. **Free:** vowel.school, caret.school, colloquy.school, janua.school, dais.school, rostrum.school, and vowelhq.com, colloquyhq.com, januahq.com, daishq.com (carethq.com is taken). Prices unchecked.

### Ruled out, with the reason

- **Namesake in teaching, tutoring or booking already:** Lectern (several study and lecture apps), Docent (docentbase.com, software for coaching centres and teachers), Lyceum (a tutoring marketplace), Copybook (UK 11+ practice by a tutoring company), Ludus (Danish school system, a teachers' vocabulary app, school arts ticketing), Schola (US school enrolment, $10M raised), Studium (student apps), Gloss and Parlance (language-learning apps), Freehold (an online booking app), Tutela (mentoring sessions), Portico (porticoedu.com, career-school software since 2025), Lectio and Aula (Danish school systems), Magister (Dutch school system), Satchel, Primer, Chalk, Quill, Easel, Slate, Tandem.
- **Crowded or big namesake elsewhere:** Syllable (Syllable AI, $103M), Margin (many finance tools), Apex, Accent, Lingua, Folio, Rubric (sounds like Rubrik).
- **Not English or Latin:** Chapeau (round 1's pick; also clashes with Chapeau!, a Toronto software studio, chapeau.ai), Cedilla, Tilde, Parley (English, but from French and taken by Parley for the Oceans).

### Round 1, for the record

Shortlist before the English-or-Latin steer: Chapeau, Cedilla, Circumflex, Parley, Portico; dropped then: Tilde, Tandem, Primer, Satchel, Ligature, Rapport, Shingle. Chapeau's story: the ^ on the ê of Inês and Português is "le chapeau" in French, "chapeuzinho" in Brazil, "dấu mũ" in Vietnamese, "dakje" (little roof) in Dutch, and "Chapeau!" means hats off.

### How to check a name from the cloud sandbox

- Registration: curl to RDAP is blocked by the proxy, but the Exa web fetch tool works: `CRAWL_NOT_FOUND` means unregistered, `CRAWL_UNEXPECTED_CONTENT_TYPE` means registered. Endpoints: `rdap.verisign.com/com/v1/domain/<name>.com`, `rdap.identitydigital.services/rdap/domain/<name>.io` (also .school, .studio), `pubapi.registry.google/rdap/domain/<name>.app` (also .page).
- Namesakes: search for "<word> app or software for teachers, tutors or booking" and for "<word> company"; a namesake in teaching, tutoring, booking or website building rules a word out.
- Still to do for the chosen name: a trademark search in the EU (EUIPO) and US (USPTO), classes 41 (education) and 42 (software), and buying the domain.

## Brand direction (draft, carries over to the chosen name)

Made 9 Nov 2026 after Dan rejected the first, royal-blue brand page (<https://claude.ai/artifact/ByBLoJMseMpy7nX52xZbMu>, kept only as a record). Nothing here is published; the files are in [`draft/`](./draft/).

- **The idea: the exercise book.** Paper with a little green in it, ruled lines, the red margin line, the green pen teachers correct with (corrections that encourage), and a highlighter stroke behind the one word that matters. Not a classroom cliché: no chalkboards, apples, mortarboards or owls.
- **Colour** ([`draft/tokens.json`](./draft/tokens.json), Day and Night): `paper` #F5F7F4 / #0F1513, `sheet` #FFFFFF / #18211D, `ink` #142019 / #EAF0EC, `pencil` #56635B / #A2AFA7 (second text), `rule` #D3DCD5, `edge` #7D8A82 / #66756C (control edges, 3:1), `margin` #E06A5B (hairline only), `pen` #0E6B4C / #6FD3A6 (the one accent), `pen-wash` (chosen only), `tile` #0E6B4C (logo, both themes), `marker` #FFE45C (highlighter, never text), `danger`, `warn` and their washes. Every text pair is 4.5:1 or more in both themes; the token notes give the ratios. Royal blue was dropped because it sat too close to Portudo's cobalt.
- **Type:** Brygada 1918 SemiBold for headings and the name (a book face revived from a 1918 Polish type; Latin, Cyrillic, Greek and Vietnamese), Commissioner for everything you read in a row or click (same scripts). Both on Google Fonts. Scale in tokens.json: display-xl 72/68 (44 on a phone) down to legend 11.5/16 small capitals.
- **Shape and space:** paper is cut, not moulded: corners 3, 6, 10, 16px; the logo tile alone is rounded at 22%. A 4px spacing base; `rule-pitch` 32px between ruled lines. One tight card shadow and one lift shadow, no glow.
- **Motion:** one move with character, the hat tip (the hat on the mark lifts and turns, `ease-tip` cubic-bezier(0.3, 1.6, 0.5, 1), 450ms), only at real milestones: the tutor's site goes live, the first booking, the first payment. Everything else is plain (`ease-plain`, 220ms for steps, 120ms for a shade change). Reduced motion makes all of it instant.
- **Two layers:** students see only the tutor's own brand plus one quiet line in the footer ("Site by <name>"), in the footer's own colours, never the platform's. Tutors see the platform's brand in sign-up, the dashboard and emails.
- **Words:** plain, short, British spelling, sentence case. No hype: never "supercharge", "seamless", "unlock", "AI-powered", "all-in-one", "elevate", "effortless". No gradients, sparkles, robot icons, emoji or stock photos. No invented social proof.
- **The mark:** a lowercase Brygada e with a hand-drawn circumflex tipped back (a thin rising stroke, a thick falling one), white with a highlighter-yellow hat on a pen-green tile. It reads as the ê of Inês and Português, a teacher's insert caret and a hat being tipped. It suits Vowel and Caret as they are; another name keeps the tile, colours and type and needs only a new wordmark (`NAME=<word>`, below).

### Draft files

| Path | What it is |
|---|---|
| `draft/tokens.json` | Colour (two themes), type, spacing, radius, shadow, easing and duration, each with a usage note; laid out for the Design System artifact type (lists, not maps). |
| `draft/platform.css` | The first platform stylesheet: ch- classes for buttons, fields, chips, sign-up steps, cards and setting rows, lesson rows and pills, notices, the milestone message with the hat tip, the paper marks, the price card, an email and the "Site by" line. Written, not yet rendered or checked. |
| `draft/logo/` | `icon.svg` (master tile), `favicon.svg` (heavier, for 16–32px), `mark.svg` and `mark-night.svg` (no tile, for paper), `wordmark.svg` / `-night`, `lockup.svg` / `-night`, `seal.svg` (round printer's mark with ring words), `icon-maskable.svg`, `icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `icon-maskable-512.png`, `shared-link.png` (1200 × 630 ruled page). The wordmark, lockups, seal and shared-link picture say "chapeau" and must be redrawn with the chosen name. |
| `draft/tools/gen-logos.mjs` | Draws every SVG above from the fonts (outlined, so no file depends on a font). `NAME=vowel` sets the wordmark and seal. Instructions at the top of the file. |
| `draft/tools/render-pngs.mjs` | Draws the PNG icons, the maskable SVG and the shared-link picture from the SVGs. |

Both scripts reproduce the committed files exactly. Fonts are not committed: download the static Brygada 1918 SemiBold and Commissioner SemiBold TTFs from Google Fonts into `draft/tools/fonts/`.

### Tried and rejected

- The first brand page (9 Nov): royal blue #2B45D4, too close to Portudo's cobalt; Dan judged its quality too low.
- Logo concepts made of typed glyphs (a bare ^ or ê in a font): no character of their own.
- A level hat, and a geometric (circle) e: the tilted, hand-drawn hat over Brygada's own e is warmer.
- A pattern of scattered hats: it read as a flock of birds.

## What comes next

1. Dan picks a name (or a direction to widen the search).
2. Trademark search for it (EU and US, classes 41 and 42) and buy the domain.
3. Redraw the wordmark, lockups, seal and shared-link picture with `NAME=<word>`, and rename the ch- class prefix.
4. Build and publish a Design System artifact for the platform at the Portudo bar, from `draft/` (type: <https://claude.ai/artifact/5M7UeXXcx16TP3vzVFNDzd>): brand book, Surfaces page (home, looks, pricing, sign-up, dashboard, emails, the tutor's footer line), a Name page, component cards rendered at desktop and phone width in both themes, and a cover.
5. Tell the build work: the platform name, domain, tutor subdomain pattern, sender address and "Site by" line are meant to stay single config values until the name is final.
