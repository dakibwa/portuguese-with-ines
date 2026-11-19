#!/usr/bin/env node
/* ---- a design system as a page that opens anywhere ---- (19 Nov 2026)

   Dan, of design systems kept as pages on two Claude accounts: "can we
   ensure we have a single design system? having this all spread across
   acounts feels wrong", "bring it in unison and not locked in". A design
   system is a folder of plain files in its repository, and this draws that
   folder as one page any browser opens from disk, with no account, no
   server and nothing of its own: the cover, the brand book and its pages,
   every token on each ground, each component as its real markup under the
   product's own stylesheet, and the pictures.

     node design/system/make/site.mjs [OUT]
         here: builds the system with build.mjs, which stands beside this
         file, into OUT (design/system/page/ unless named) and draws it
     node site.mjs --system DIR [--out OUT]
         anywhere: draws the system kept in DIR (OUT is DIR-page/ unless named)

   Open OUT/index.html. The page is a view: change the files, then run this
   again; never edit the page, and never commit it.

   THE SAME FILE SERVES EVERY REPOSITORY. Its home is dakibwa/features; a
   copy elsewhere is changed here first and copied again. It has no
   dependencies and reads nothing but the system's folder:

     README.md                       the brand book; other *.md are its pages
     tokens.json                     {color:{themes,tokens}, type:{fonts,families,groups},
                                      <family>:{tokens}} with {name,value,usage} entries
     tokens.css                      optional; compiled from tokens.json when absent
     components/<Name>/preview.html  line 1 `<!-- @dsCard group="…" height=… width=… subtitle="…" -->`,
                                      then a small document of real markup
     components/<Name>/README.md     its rules
     components/bundle.css, bundle.js, lib/*.js    loaded into every preview when present
     assets/<Group>/                 pictures, and a README.md
     fonts/                          the faces tokens.json names
     page.json                       optional: how this page presents the system (below) */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const named = k => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
const SYSTEM = named('--system'), OUTARG = named('--out') || args[0];
let OUT, P, SOURCE;
if (!SYSTEM && existsSync(join(HERE, 'build.mjs'))) {
  // this repository builds its system from the product: the build writes OUT/project/ and OUT/tokens.css
  OUT = resolve(OUTARG || join(HERE, '..', 'page')); P = join(OUT, 'project'); SOURCE = join(HERE, '..', 'project');
  execFileSync(process.execPath, [join(HERE, 'build.mjs'), OUT], { stdio: 'inherit' });
} else {
  SOURCE = resolve(SYSTEM || join(HERE, '..', 'project'));
  if (!existsSync(join(SOURCE, 'tokens.json')) && !existsSync(join(SOURCE, 'README.md'))) throw new Error(`no design system in ${SOURCE}: it holds neither README.md nor tokens.json`);
  OUT = resolve(OUTARG || join(dirname(SOURCE), basename(SOURCE) + '-page')); P = join(OUT, 'project');
  if (!relative(SOURCE, OUT).startsWith('..')) throw new Error('the page cannot be drawn inside the system it draws: name another --out');
  rmSync(P, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  cpSync(SOURCE, P, { recursive: true });
}
const has = (...p) => existsSync(join(P, ...p));
const read = (...p) => readFileSync(join(P, ...p), 'utf8');
const tokens = has('tokens.json') ? JSON.parse(read('tokens.json')) : {};
/* page.json, every key optional:
     paint    {ground,surface,ink,soft,rule,shadow}: the tokens this page wears
     rule     [token,…]: the bands of the rule under the name
     colours  [[heading, pattern],…]: colour tokens under headings; "" takes the rest
     samples  {style: words}, sample: words for every other text style
     assets   {Group: "logos"|"tiles"|"screens"|"shots"}, assetNames {Group: name}
     onDark, onLight: patterns for logo files drawn for one ground
     cardWidth: a preview's width where its first line names none
     product  what the system is the look of: "game", "app", "site" */
const page = has('page.json') ? JSON.parse(read('page.json')) : {};

/* ---- words: the little Markdown a system's pages are written in ---- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => String(s).toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// code spans are set aside first, so nothing inside one is read as markup
function inline(text) {
  const codes = [];
  const held = String(text).replace(/`([^`]+)`/g, (_, c) => `\u0001${codes.push(c) - 1}\u0001`);
  return esc(held).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\u0001(\d+)\u0001/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}
const MARK = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
function list(lines, i, indent) {
  const ordered = /^\s*\d+\./.test(lines[i]);
  let html = ordered ? '<ol>' : '<ul>';
  while (i < lines.length) {
    const m = MARK.exec(lines[i]);
    if (!m || m[1].length < indent) break;
    if (m[1].length > indent) { const inner = list(lines, i, m[1].length); html = html.replace(/<\/li>$/, '') + inner.html + '</li>'; i = inner.i; continue; }
    let text = m[3]; i++;
    while (i < lines.length && lines[i].trim() && !MARK.test(lines[i]) && /^\s/.test(lines[i])) text += ' ' + lines[i++].trim();
    html += `<li>${inline(text)}</li>`;
    if (i + 1 < lines.length && !lines[i].trim() && MARK.test(lines[i + 1]) && MARK.exec(lines[i + 1])[1].length >= indent) i++;
  }
  return { html: html + (ordered ? '</ol>' : '</ul>'), i };
}
// a table row's cells: a bar inside a code span is not a cell's edge
function cells(line) {
  const out = []; let cell = '', code = false;
  for (const ch of line.trim().replace(/^\|/, '').replace(/\|$/, '')) {
    if (ch === '`') code = !code;
    if (ch === '|' && !code) { out.push(cell.trim()); cell = ''; } else cell += ch;
  }
  return [...out, cell.trim()];
}
/* a page of Markdown as HTML. `level` is the heading a page's own "# " takes;
   `skipTitle` leaves the first "# " out, where the view already carries it */
function md(src, { level = 2, skipTitle = false, ids = '' } = {}) {
  const lines = src.replace(/\r/g, '').split('\n');
  let i = 0, out = '', titled = !skipTitle;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      i++;
      if (h[1].length === 1 && !titled) { titled = true; continue; }
      const n = Math.min(6, h[1].length + level - 1);
      out += `<h${n} id="${ids}${slug(h[2])}">${inline(h[2])}</h${n}>`; continue;
    }
    if (/^\|/.test(line) && /^\|[\s:|-]+$/.test((lines[i + 1] || '').trim())) {
      const head = cells(line); i += 2;
      let rows = '';
      while (i < lines.length && /^\|/.test(lines[i])) rows += `<tr>${cells(lines[i++]).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`;
      out += `<div class="table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; continue;
    }
    if (MARK.test(line)) { const l = list(lines, i, MARK.exec(line)[1].length); out += l.html; i = l.i; continue; }
    let text = line.trim(); i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\|)/.test(lines[i]) && !MARK.test(lines[i])) text += ' ' + lines[i++].trim();
    out += `<p>${inline(text)}</p>`;
  }
  return out;
}
const title = src => (/^#\s+(.*)$/m.exec(src) || [, ''])[1];
const lead = src => (/^(?![#|>`\s-])(\S.*)$/m.exec(src.replace(/^#.*$/m, '')) || [, ''])[1];

/* ---- tokens ---- */
const colours = tokens.color?.tokens ?? [];
const themeList = tokens.color?.themes?.length ? tokens.color.themes : [{ id: 'light', name: 'light' }];
const themes = themeList.map(t => t.id), first = themes[0];
const themeName = Object.fromEntries(themeList.map(t => [t.id, (t.name || t.id).toLowerCase()]));
const isDark = id => /dark|night|ink/i.test(id + ' ' + themeName[id]);
const byName = Object.fromEntries(colours.map(t => [t.name, t]));
const valueIn = (t, theme) => typeof t.value === 'string' ? t.value : (t.value[theme] ?? t.value[first]);
// a colour as it paints: an alias followed to the token it names
function paint(name, theme, seen = new Set()) {
  if (!byName[name]) return null;
  const v = valueIn(byName[name], theme), alias = /^\{(.+)\}$/.exec(v);
  if (!alias) return v;
  return seen.has(name) ? null : paint(alias[1], theme, seen.add(name));
}
const families = Object.entries(tokens).filter(([k, v]) => k !== 'color' && k !== 'type' && v && Array.isArray(v.tokens) && v.tokens.length);
const asVar = v => /^\{(.+)\}$/.test(v) ? `var(--${v.slice(1, -1)})` : v;
// tokens.json as the stylesheet a preview expects, where the system keeps none of its own
function compile() {
  const themed = [...colours, ...families.flatMap(([, f]) => f.tokens.filter(t => typeof t.value !== 'string'))];
  const plain = families.flatMap(([, f]) => f.tokens.filter(t => typeof t.value === 'string'));
  let css = `/* ${tokens.name || 'design system'} — generated from tokens.json */\n`;
  themes.forEach((id, n) => { css += `${n ? '' : ':root, '}[data-theme="${id}"] {\n${themed.map(t => `  --${t.name}: ${asVar(valueIn(t, id))};`).join('\n')}\n}\n`; });
  css += `:root {\n${plain.map(t => `  --${t.name}: ${asVar(t.value)};`).join('\n')}${Object.entries(tokens.type?.families ?? {}).map(([k, v]) => `\n  --font-${k}: ${v};`).join('')}\n}\n`;
  for (const g of tokens.type?.groups ?? []) for (const s of g.styles ?? [])
    css += `.${s.name} { font-family: ${tokens.type.families?.[s.family ?? g.family] ?? 'inherit'}; font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight};${s.letterSpacing ? ` letter-spacing: ${s.letterSpacing};` : ''} }\n`;
  for (const f of tokens.type?.fonts ?? []) if (f.file) css += `@font-face { font-family: "${f.family}"; src: url("${f.file}"); font-weight: ${f.weight ?? 400}; font-style: ${f.style ?? 'normal'}; font-display: block; }\n`;
  return css;
}
// the tokens a preview loads, its faces found from the page's own folder
const compiled = existsSync(join(OUT, 'tokens.css')) && !SYSTEM ? readFileSync(join(OUT, 'tokens.css'), 'utf8') : has('tokens.css') ? read('tokens.css') : compile();
writeFileSync(join(OUT, 'page-tokens.css'), compiled.replace(/url\((["']?)fonts\//g, 'url($1project/fonts/'));

/* ---- what the page itself wears: the system's own grounds, ink and face ---- */
const pick = (key, ...guesses) => [page.paint?.[key], ...guesses].find(n => n && byName[n]);
const WEAR = { ground: pick('ground', 'paper', 'canvas', 'background', 'bg', 'page'), surface: pick('surface', 'surface', 'card', 'panel', 'tile'),
  ink: pick('ink', 'ink', 'text', 'foreground', 'fg'), soft: pick('soft', 'ink-soft', 'granite', 'muted', 'text-soft', 'secondary'), rule: pick('rule', 'rule', 'line', 'border', 'hairline') };
const PLAIN = { light: { ground: '#f3f1eb', surface: '#ffffff', ink: '#15191c', soft: '#5f666b', rule: '#d9d5cb' }, dark: { ground: '#0e1214', surface: '#161b1f', ink: '#f2f0ea', soft: '#9aa1a6', rule: '#272f35' } };
const shadowToken = families.flatMap(([, f]) => f.tokens).find(t => t.name === (page.paint?.shadow || 'shadow-panel'));
const wear = id => { const plain = PLAIN[isDark(id) ? 'dark' : 'light']; return Object.keys(plain).map(k => `--pg-${k}:${(WEAR[k] && paint(WEAR[k], id)) || plain[k]}`).join(';')
  + `;--pg-shadow:${shadowToken ? valueIn(shadowToken, id) : '0 1px 2px rgba(0,0,0,.12),0 14px 40px rgba(0,0,0,.16)'}`
  + `;--pg-band:${page.rule?.every(n => paint(n, id)) ? `linear-gradient(90deg,${page.rule.map((n, i) => `${paint(n, id)} ${i * 100 / page.rule.length}% ${(i + 1) * 100 / page.rule.length}%`).join(',')})` : 'var(--pg-ink)'}`
  + `;color-scheme:${isDark(id) ? 'dark' : 'light'}`; };
const face = Object.values(tokens.type?.families ?? {})[0] || 'system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
const wearCss = themes.map((id, n) => `${n ? '' : ':root,'}[data-theme="${id}"]{${wear(id)}}`).join('\n')
  + '\n' + (tokens.type?.fonts ?? []).filter(f => f.file).map(f => `@font-face{font-family:"${f.family}";src:url("project/${f.file}");font-weight:${f.weight ?? 400};font-style:${f.style ?? 'normal'};font-display:block}`).join('\n');

/* ---- components: each preview stood where it was written, under the product's stylesheet ---- */
const loads = (has('components', 'lib') ? readdirSync(join(P, 'components', 'lib')).filter(f => /\.js$/.test(f)).sort().map(f => `<script src="../lib/${f}"></script>`).join('') : '')
  + (has('components', 'bundle.js') ? '<script src="../bundle.js"></script>' : '');
const cards = !has('components') ? [] : readdirSync(join(P, 'components')).filter(n => has('components', n, 'preview.html')).sort().map(name => {
  const src = read('components', name, 'preview.html');
  const attr = k => (new RegExp(`${k}=(?:"([^"]*)"|(\\d+))`).exec(src.split('\n')[0]) || []).slice(1).find(Boolean);
  const card = { name, group: attr('group') || '', subtitle: attr('subtitle') || '', height: +(attr('height') || 300), width: +(attr('width') || (name === 'Cover' ? 960 : page.cardWidth || 390)),
    guide: has('components', name, 'README.md') ? read('components', name, 'README.md') : '' };
  /* the card is written beside its preview, so every address the preview holds still leads where it did.
     the ground comes from the card's own address, so one file serves each: card.html#light */
  const doc = src.replace(/^<!--.*?-->\n/, '').replace(/<html\b([^>]*)>/i, (_, a) => `<html${a.replace(/\sdata-theme="[^"]*"/, '')} data-theme="${first}">`)
    .replace(/<\/head>/i, `<script>(function(t){document.documentElement.dataset.theme=${JSON.stringify(themes)}.includes(t)?t:${JSON.stringify(first)}})(location.hash.slice(1));addEventListener('hashchange',function(){location.reload()})</script>`
      + `<link rel="stylesheet" href="../../../page-tokens.css">${has('components', 'bundle.css') ? '<link rel="stylesheet" href="../bundle.css">' : ''}${loads}</head>`);
  writeFileSync(join(P, 'components', name, 'card.html'), doc);
  return card;
});
const frame = (c, theme) => `<figure class="ground"><div class="fit" style="--w:${c.width};--h:${c.height}"><iframe loading="lazy" title="${esc(c.name)}, ${esc(themeName[theme])}" src="project/components/${c.name}/card.html#${theme}" width="${c.width}" height="${c.height}" scrolling="no" tabindex="-1"></iframe></div>${themes.length > 1 ? `<figcaption>${esc(themeName[theme])}</figcaption>` : ''}</figure>`;
const cover = cards.find(c => c.name === 'Cover');
const groups = [...new Set(cards.filter(c => c !== cover).map(c => c.group || 'Other'))];

/* ---- pictures ---- */
const assetGroups = !has('assets') ? [] : readdirSync(join(P, 'assets')).filter(g => !g.startsWith('.') && !/\.[a-z0-9]+$/i.test(g)).map(group => ({
  group,
  about: has('assets', group, 'README.md') ? read('assets', group, 'README.md') : '',
  files: readdirSync(join(P, 'assets', group), { recursive: true }).map(String).filter(f => /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(f)).sort(),
})).filter(a => a.files.length || a.about);
const plain = f => basename(f).replace(/\.[a-z0-9]+$/i, '').replace(new RegExp(`^${slug(tokens.name || '')}-`), '').replace(/[-_]/g, ' ');
const address = (group, f) => `project/assets/${encodeURIComponent(group)}/${f.split('/').map(encodeURIComponent).join('/')}`;
const shot = (group, f, cls = '', name = plain(f)) => `<figure class="${cls}"><a href="${address(group, f)}" target="_blank" rel="noopener"><img loading="lazy" src="${address(group, f)}" alt="${esc(name)}"></a><figcaption>${esc(name)}</figcaption></figure>`;
// a logo drawn for one ground stands on it; the rest stand on the page's own
const logoGround = f => page.onDark && new RegExp(page.onDark).test(f) ? 'on-dark' : page.onLight && new RegExp(page.onLight).test(f) ? 'on-light' : '';
function gallery({ group, files }) {
  const layout = page.assets?.[group] || (/logo|mark|brand/i.test(group) && files.length < 24 ? 'logos' : files.length > 40 && files.every(f => /\.svg$/i.test(f)) ? 'tiles' : 'shots');
  if (layout === 'tiles') return `<div class="tiles">${files.map(f => shot(group, f)).join('')}</div>`;
  if (layout === 'logos') return `<div class="logos">${files.map(f => shot(group, f, logoGround(f))).join('')}</div>`;
  if (layout === 'screens') {
    // screens are named device-ground-what: one row of pictures a device and ground
    const kinds = [...new Set(files.map(f => basename(f).split('-').slice(0, 2).join('-')))];
    return kinds.map(k => `<h3>${esc(k.replace('-', ', '))}</h3><div class="shots ${/^(desk|wide|tablet|tv|lobby)/.test(k) ? 'wide' : 'tall'}">${files.filter(f => basename(f).startsWith(k + '-')).map(f => shot(group, f, '', plain(f).slice(k.length + 1))).join('')}</div>`).join('');
  }
  return `<div class="shots wide">${files.map(f => shot(group, f)).join('')}</div>`;
}

/* ---- the token views ---- */
const swatch = t => `<article class="swatch"><div class="chips">${themes.map(th => `<i style="background:${esc(paint(t.name, th) || 'transparent')}" title="${esc(themeName[th])}: ${esc(valueIn(t, th))}"></i>`).join('')}</div>
  <h4>${esc(t.name)}</h4><p class="values">${themes.map(th => `<span>${themes.length > 1 ? esc(themeName[th]) + ' ' : ''}<code>${esc(valueIn(t, th))}</code></span>`).join('')}</p><p>${inline(t.usage || '')}</p></article>`;
// colours under the headings page.json gives them; a heading with no pattern takes the rest
const sets = (page.colours?.length ? page.colours : [['', '']]).map(([heading, pattern]) => ({ heading, test: pattern ? new RegExp(pattern) : null }));
const taken = t => sets.some(s => s.test?.test(t.name));
const colourView = `${themes.length > 1 ? `<p>every colour on its grounds, in this order: ${themes.map(t => esc(themeName[t])).join(', ')}.</p>` : ''}` + sets.map(s => {
  const set = colours.filter(t => s.test ? s.test.test(t.name) : !taken(t));
  return set.length ? `${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}<div class="swatches">${set.map(swatch).join('')}</div>` : '';
}).join('');
const typeView = (tokens.type?.groups ?? []).map(g => `<h3>${esc(String(g.name).toLowerCase())}</h3>` + (g.styles ?? []).map(s =>
  `<article class="specimen"><div class="say" style="font-family:${esc(tokens.type.families?.[s.family ?? g.family] ?? 'inherit')};font-size:${esc(s.fontSize)};line-height:${esc(s.lineHeight)};font-weight:${esc(s.fontWeight)};letter-spacing:${esc(s.letterSpacing || 'normal')}">${esc(page.samples?.[s.name] || page.sample || 'The quick brown fox jumps over the lazy dog')}</div>
   <p><b>${esc(s.name)}</b> ${esc(s.fontSize)} / ${esc(s.lineHeight)}, weight ${esc(s.fontWeight)}${s.letterSpacing ? ', ' + esc(s.letterSpacing) : ''}</p></article>`).join('')).join('')
  + (Object.keys(tokens.type?.families ?? {}).length ? `<h3>the faces</h3>${Object.entries(tokens.type.families).map(([k, v]) => `<p><b>${esc(k)}</b> <code>${esc(v)}</code></p>`).join('')}` : '');
const px = v => parseFloat(v) || 0;
// a curve drawn on a square a little taller than the motion, so a bounce shows its overshoot
function curve(value) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(value);
  if (!m) return '';
  const [x1, y1, x2, y2] = m[1].split(',').map(Number), X = x => 10 + x * 80, Y = y => 110 - y * 80;
  return `<svg viewBox="0 0 100 130" aria-hidden="true"><path class="box" d="M10 30H90V110H10Z"/><path class="line" d="M${X(0)} ${Y(0)}C${X(x1)} ${Y(y1)} ${X(x2)} ${Y(y2)} ${X(1)} ${Y(1)}"/></svg>`;
}
const row = (t, mark) => `<article class="measure">${mark}<div><h4>${esc(t.name)} <code>${esc(typeof t.value === 'string' ? t.value : valueIn(t, first))}</code></h4><p>${inline(t.usage || '')}</p></div></article>`;
// a family of tokens drawn as what it measures, by its name
function family([key, fam]) {
  const head = `<h3>${esc(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}</h3>${fam.note ? `<p>${inline(fam.note)}</p>` : ''}`;
  if (/shadow|elevation/i.test(key)) return head + `<div class="shadows">${fam.tokens.map(t => themes.map(th => `<figure data-theme="${th}"><div style="box-shadow:${esc(valueIn(t, th))}"></div><figcaption>${esc(t.name)}${themes.length > 1 ? ', ' + esc(themeName[th]) : ''}</figcaption></figure>`).join('')).join('')}</div>${fam.tokens.map(t => `<p><b>${esc(t.name)}</b> ${inline(t.usage || '')}</p>`).join('')}`;
  if (/eas|curve/i.test(key)) return head + `<div class="curves">${fam.tokens.map(t => `<article class="curve" style="--ease:${esc(valueIn(t, first))}">${curve(valueIn(t, first))}<span class="run"><i></i></span><h4>${esc(t.name)}</h4><p><code>${esc(valueIn(t, first))}</code></p><p>${inline(t.usage || '')}</p></article>`).join('')}</div><p class="note">point at a curve to run it.</p>`;
  if (/dur|time|delay/i.test(key)) { const longest = Math.max(1, ...fam.tokens.map(t => px(valueIn(t, first)))); return head + fam.tokens.map(t => row(t, `<i style="width:${px(valueIn(t, first)) / longest * 320}px"></i>`)).join(''); }
  if (/radius|corner/i.test(key)) return head + fam.tokens.map(t => row(t, `<i class="corner" style="border-radius:${esc(valueIn(t, first))}"></i>`)).join('');
  if (/spac|gap|size|inset|pad/i.test(key) && !/font/i.test(key)) return head + fam.tokens.map(t => row(t, `<i style="width:${Math.min(480, px(valueIn(t, first)) * 4)}px"></i>`)).join('') + '<p class="note">each bar is drawn four times its size.</p>';
  if (/font|text/i.test(key)) return head + fam.tokens.map(t => row(t, `<span class="glyph" style="font-size:${esc(valueIn(t, first))}">Aa</span>`)).join('');
  return head + fam.tokens.map(t => row(t, '')).join('');
}
const moving = families.filter(([k]) => /eas|curve|dur|time|delay|motion/i.test(k)), still = families.filter(f => !moving.includes(f));

/* ---- the views, in the order the menu lists them ---- */
const pages = readdirSync(P).filter(f => /\.md$/i.test(f) && !/^readme\.md$/i.test(f)).sort().map(f => ({ id: slug(f.replace(/^\d+-/, '').replace(/\.md$/i, '')), src: read(f) }));
const book = has('README.md') ? read('README.md') : '';
const name = esc(tokens.name || title(book) || basename(SOURCE));
let root = '', commit = '';
try { root = execFileSync('git', ['-C', SOURCE, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  commit = execFileSync('git', ['-C', SOURCE, 'log', '-1', '--format=%h, %cd', '--date=format:%-d %b %Y'], { encoding: 'utf8' }).trim(); } catch {}
const where = root ? relative(root, SOURCE) + '/' : SOURCE + '/', tool = root && !relative(root, HERE).startsWith('..') ? relative(root, fileURLToPath(import.meta.url)) : 'site.mjs';
const thing = esc(page.product || 'product');
const views = [
  { id: 'cover', name: 'cover', part: '', html: `${cover ? `<div class="hero"><div class="fit" style="--w:${cover.width};--h:${cover.height}"><iframe title="cover" src="project/components/Cover/card.html#${first}" width="${cover.width}" height="${cover.height}" scrolling="no" tabindex="-1"></iframe></div></div>` : `<h1>${name}</h1>`}
    ${lead(book) ? `<p class="lede">${inline(lead(book))}</p>` : ''}
    <ul class="facts"><li><b>one design system.</b> it is the files under <code>${esc(where)}</code>${root ? ` in the ${esc(basename(root))} repository` : ''}. this page is drawn from them and holds nothing of its own.</li>
    <li><b>open to anyone.</b> a person opens this file in a browser. an assistant reads the files themselves.</li>
    <li><b>the ${thing} wins.</b> where this page and the ${thing} disagree, the ${thing} is right and the page is out of date: draw it again with <code>${esc(tool)}</code>.</li></ul>` },
  ...(book ? [{ id: 'brand-book', name: 'brand book', part: 'the book', html: md(book, { skipTitle: true, ids: 'book-' }) }] : []),
  ...pages.map(p => ({ id: p.id, name: (title(p.src) || p.id.replace(/-/g, ' ')).toLowerCase(), part: 'the book', html: md(p.src, { skipTitle: true, ids: p.id + '-' }) })),
  ...(colours.length ? [{ id: 'colour', name: 'colour', part: 'tokens', html: colourView }] : []),
  ...(typeView ? [{ id: 'type', name: 'type', part: 'tokens', html: typeView }] : []),
  ...(still.length ? [{ id: 'measures', name: still.map(([k]) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).slice(0, 2).join(' and ') + (still.length > 2 ? ' and more' : ''), part: 'tokens', html: still.map(family).join('') }] : []),
  ...(moving.length ? [{ id: 'motion', name: 'motion', part: 'tokens', html: moving.map(family).join('') }] : []),
  ...groups.map(g => ({ id: 'c-' + slug(g), name: g.toLowerCase(), part: 'components', html: cards.filter(c => c !== cover && (c.group || 'Other') === g).map(c =>
    `<article class="card" id="${slug(c.name)}"><h3>${esc(c.name)}</h3>${c.subtitle ? `<p class="sub">${inline(c.subtitle)}</p>` : ''}<div class="grounds">${themes.map(th => frame(c, th)).join('')}</div>${c.guide ? `<div class="guide">${md(c.guide, { level: 4, skipTitle: true, ids: slug(c.name) + '-' })}</div>` : ''}</article>`).join('') })),
  ...assetGroups.map(a => ({ id: 'a-' + slug(a.group), name: (page.assetNames?.[a.group] || a.group).toLowerCase(), part: 'pictures', html: `${a.about ? md(a.about, { level: 3, skipTitle: true, ids: slug(a.group) + '-' }) : ''}${gallery(a)}` })),
];
const parts = [...new Set(views.map(v => v.part))];
const menu = parts.map(part => `${part ? `<h2>${part}</h2>` : ''}<ul>${views.filter(v => v.part === part).map(v => `<li><a href="#${v.id}">${esc(v.name)}</a></li>`).join('')}</ul>`).join('');

const css = `
${wearCss}
*{box-sizing:border-box}
html{background:var(--pg-ground);color:var(--pg-ink);font:400 15px/1.5 ${face};-webkit-text-size-adjust:100%}
body{margin:0;display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}
a{color:inherit}
code{font:inherit;font-size:.92em;background:color-mix(in srgb,var(--pg-ink) 9%,transparent);padding:1px 4px}
pre{overflow:auto;padding:12px;background:color-mix(in srgb,var(--pg-ink) 7%,transparent);font-size:13px}pre code{background:none;padding:0}
.side{position:sticky;top:0;height:100vh;overflow:auto;padding:26px 22px 28px;border-right:1px solid var(--pg-rule)}
.mark{display:inline-block;text-decoration:none;font-weight:900;font-size:27px;line-height:1;letter-spacing:-.045em}
.mark i{display:block;height:5px;margin-top:8px;background:var(--pg-band)}
.side>p{margin:9px 0 0;color:var(--pg-soft);font-size:13px}
.side h2{margin:22px 0 4px;font-size:12px;font-weight:400;letter-spacing:.06em;color:var(--pg-soft)}
.side ul{list-style:none;margin:0;padding:0}
.side .mark+p+select+ul{margin-top:22px}
.side li a{display:block;padding:5px 0 5px 10px;margin-left:-10px;text-decoration:none;border-left:3px solid transparent}
.side li a:hover{background:color-mix(in srgb,var(--pg-ink) 6%,transparent)}
.side li a[aria-current]{border-left-color:var(--pg-ink);font-weight:700}
.ground-switch{margin-top:24px;display:flex;border:1px solid var(--pg-ink)}
.ground-switch button{flex:1;height:36px;border:0;background:none;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.ground-switch button[aria-pressed=true]{background:var(--pg-ink);color:var(--pg-ground)}
.built{margin-top:16px;font-size:12px;color:var(--pg-soft)}
main{padding:34px clamp(18px,4vw,56px) 80px;min-width:0}
.view{display:none;max-width:1180px}
.view.on{display:block}
.view>h1{margin:0 0 20px;font-size:38px;line-height:1.05;font-weight:900;letter-spacing:-.05em}
.view>h1.quiet{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.view h2{margin:42px 0 12px;font-size:23px;line-height:1.1;font-weight:900;letter-spacing:-.04em}
.view h3{margin:32px 0 12px;font-size:17px;font-weight:700}
.view h4{margin:0 0 3px;font-size:15px;font-weight:700}
.view h5,.view h6{margin:18px 0 6px;font-size:14px;font-weight:700}
.view p,.view li{max-width:76ch}
.view p{margin:0 0 12px}.view ul,.view ol{margin:0 0 14px;padding-left:20px}.view li{margin:0 0 7px}
.lede{font-size:18px;line-height:1.45;margin-top:26px!important}
.facts{list-style:none;padding:0!important;margin-top:22px!important}.facts li{padding:11px 0;border-top:1px solid var(--pg-rule);margin:0}
.note{color:var(--pg-soft);font-size:13px}
.table{overflow:auto;margin:0 0 16px}
table{border-collapse:collapse;font-size:14px;line-height:1.42}
th,td{text-align:left;vertical-align:top;padding:9px 16px 9px 0;border-top:1px solid var(--pg-rule)}
th{font-weight:700;border-top:0;white-space:nowrap}td:first-child{white-space:nowrap}td{min-width:9ch}
.hero{background:var(--pg-surface);box-shadow:var(--pg-shadow)}
.fit{width:calc(var(--w) * 1px);max-width:100%;height:calc(var(--h) * 1px);overflow:hidden}
.fit iframe{display:block;border:0;transform-origin:0 0;background:var(--pg-ground)}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:22px 20px}
.swatch .chips{display:flex;height:76px;border:1px solid var(--pg-rule)}.swatch .chips i{flex:1}
.swatch h4{margin-top:9px}.swatch p{margin:0 0 5px;font-size:13px;line-height:1.42;color:var(--pg-soft)}
.swatch .values{display:flex;flex-wrap:wrap;gap:2px 12px;color:var(--pg-ink)}
.specimen{padding:16px 0 12px;border-top:1px solid var(--pg-rule)}.specimen .say{margin-bottom:10px}.specimen p{margin:0;font-size:13px;color:var(--pg-soft)}
.measure{display:flex;gap:18px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--pg-rule)}
.measure>i{flex:none;display:block;height:22px;background:var(--pg-ink);min-width:2px}.measure>div{min-width:0}.measure p{margin:0;font-size:13px;color:var(--pg-soft)}
.measure>i.corner{width:64px;height:44px;background:none;border:2px solid var(--pg-ink)}.measure .glyph{flex:none;width:96px;line-height:1;overflow:hidden}
.shadows{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:14px}
.shadows figure{margin:0;padding:34px 34px 14px;background:var(--pg-ground);color:var(--pg-ink);border:1px solid var(--pg-rule)}
.shadows figure div{width:150px;height:96px;background:var(--pg-surface)}
.shadows figcaption{margin-top:26px;font-size:12px}
.curves{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:26px 20px}
.curve svg{display:block;width:120px}.curve .box{fill:none;stroke:var(--pg-rule)}.curve .line{fill:none;stroke:var(--pg-ink);stroke-width:3}
.curve .run{display:block;width:120px;height:12px;margin:8px 0 10px;background:color-mix(in srgb,var(--pg-ink) 9%,transparent)}
.curve .run i{display:block;width:12px;height:12px;background:var(--pg-ink)}
.curve:hover .run i{transform:translateX(108px);transition:transform 900ms var(--ease)}
.curve p{margin:0 0 4px;font-size:13px;color:var(--pg-soft)}
.card{padding:26px 0 30px;border-top:1px solid var(--pg-rule)}.card:first-of-type{border-top:0;padding-top:0}
.card>h3{margin:0;font-size:23px;font-weight:900;letter-spacing:-.04em}.card .sub{color:var(--pg-soft);margin:4px 0 0}
.grounds{display:flex;flex-wrap:wrap;gap:20px 24px;align-items:flex-start;margin-top:18px}
.ground{margin:0;max-width:100%}.ground .fit{box-shadow:var(--pg-shadow)}
.ground figcaption,.shots figcaption,.logos figcaption,.tiles figcaption{margin-top:7px;font-size:12px;color:var(--pg-soft)}
.guide{margin-top:22px}.guide h4,.guide h5{margin:16px 0 6px}
figure{margin:0}
.shots{display:grid;gap:22px 18px}.shots.tall{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.shots.wide{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.shots img{display:block;width:100%;height:auto;border:1px solid var(--pg-rule)}
.logos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:22px 18px}
.logos a{display:flex;align-items:center;justify-content:center;height:168px;padding:24px;background:var(--pg-surface);border:1px solid var(--pg-rule)}
.logos img{display:block;width:auto;height:auto;max-width:100%;max-height:118px}
.logos .on-dark a{background:${PLAIN.dark.surface};color-scheme:dark}.logos .on-light a{background:#fbfaf6;color-scheme:light}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:16px 12px}
.tiles img{display:block;width:100%;aspect-ratio:1}
.tiles figcaption{text-align:center;margin-top:5px}
.pick{display:none}
@media (max-width:820px){
  body{display:block}
  .side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--pg-rule);padding:18px 18px 16px}
  .side h2,.side ul,.built{display:none}
  .pick{display:block;width:100%;height:44px;margin-top:14px;font:inherit;color:inherit;background:var(--pg-surface);border:1px solid var(--pg-ink);border-radius:0;padding:0 10px}
  .ground-switch{margin-top:10px}
  .view>h1{font-size:30px}
}
@media (prefers-reduced-motion:reduce){.curve:hover .run i{transition:none}}`;

const js = `
const views=[...document.querySelectorAll('.view')],links=[...document.querySelectorAll('.side a[href^="#"]')],pick=document.querySelector('.pick');
// frames keep their own size and are scaled down to the room they have
function fit(){for(const f of document.querySelectorAll('.view.on .fit')){const w=+f.style.getPropertyValue('--w'),h=+f.style.getPropertyValue('--h'),k=Math.min(1,f.clientWidth/w);f.firstElementChild.style.transform=k<1?'scale('+k+')':'';f.style.height=h*k+'px'}}
// a view's own id is not its address, so the browser has no target of its own to scroll to and a view opens at its top
function show(){const want=decodeURIComponent(location.hash.slice(1)),at=views.find(v=>v.dataset.id===want)||views.find(v=>want&&v.querySelector('[id="'+want.replace(/"/g,'')+'"]'))||views[0];
  for(const v of views)v.classList.toggle('on',v===at);
  for(const a of links)a.getAttribute('href')==='#'+at.dataset.id?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');
  pick.value=at.dataset.id;document.title=(at===views[0]?'':at.dataset.name+' · ')+document.body.dataset.title;
  fit();const inner=want&&want!==at.dataset.id&&document.getElementById(want);inner?inner.scrollIntoView():scrollTo(0,0)}
addEventListener('hashchange',show);addEventListener('resize',fit);pick.addEventListener('change',()=>{location.hash=pick.value});
// the page's ground: the reader's own unless they have chosen one here
const root=document.documentElement,buttons=[...document.querySelectorAll('.ground-switch button')],hero=document.querySelector('.hero iframe');
function ground(t,keep){root.dataset.theme=t;for(const b of buttons)b.setAttribute('aria-pressed',b.value===t);
  if(hero)hero.src=hero.getAttribute('src').replace(/#.*$/,'')+'#'+t; // the cover stands on the page's own ground
  if(keep)try{localStorage.setItem('ds-ground',t)}catch{}}
let chosen=null;try{chosen=localStorage.getItem('ds-ground')}catch{}
const wanted=matchMedia('(prefers-color-scheme: dark)').matches,own=buttons.find(b=>(b.dataset.dark==='1')===wanted);
ground(buttons.some(b=>b.value===chosen)?chosen:(own||buttons[0]||{value:root.dataset.theme}).value);
for(const b of buttons)b.addEventListener('click',()=>ground(b.value,true));
show();`;

const html = `<!doctype html>
<html lang="en" data-theme="${first}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} design system</title>
<meta name="robots" content="noindex">
<style>${css}</style>
</head>
<body data-title="${name} design system">
<nav class="side" aria-label="the design system’s pages">
  <a class="mark" href="#${views[0].id}">${name}<i></i></a>
  <p>design system</p>
  <select class="pick" aria-label="page">${views.map(v => `<option value="${v.id}">${v.part ? esc(v.part) + ': ' : ''}${esc(v.name)}</option>`).join('')}</select>
  ${menu}
  ${themes.length > 1 ? `<div class="ground-switch" role="group" aria-label="this page’s ground">${themes.map(t => `<button type="button" value="${t}" data-dark="${isDark(t) ? 1 : 0}" aria-pressed="false">${esc(themeName[t].replace(/\s*\(.*\)$/, ''))}</button>`).join('')}</div>` : ''}
  <p class="built">drawn from the repository${commit ? ` at ${esc(commit)}` : ''}</p>
</nav>
<main>
${views.map(v => `<section class="view" id="view-${v.id}" data-id="${v.id}" data-name="${esc(v.name)}"><h1${v.id === 'cover' ? ' class="quiet"' : ''}>${v.id === 'cover' ? `${name} design system` : esc(v.name)}</h1>${v.html}</section>`).join('\n')}
</main>
<script>${js}</script>
</body>
</html>
`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`design system page: ${views.length} views, ${cards.length} components, ${assetGroups.reduce((n, a) => n + a.files.length, 0)} pictures -> ${join(OUT, 'index.html')}`);
