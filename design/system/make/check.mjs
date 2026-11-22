#!/usr/bin/env node
/* ---- is a design system true to its product? ---- (20 Nov 2026)

   Dan: "the system is for agents remember not me". A design system is read by
   agents about to design or build a screen, and an agent copies what it reads.
   This says whether what it would copy is true: every name in the system is the
   name in the product's code or says what to type instead, every card points at
   real files, and the rules that carry a check line hold.

     node check.mjs --system DIR                    is the system true to the code?
     node check.mjs --system DIR --changed FILE…    and are these files true to the system?
     node check.mjs --system DIR --index            write DIR/components/README.md

   One line per problem; exit 1 on any error. A system whose tokens.json does not
   say "format": 2 gets only warnings, so this runs on a system before it is
   converted. Warnings of one kind stop after five; --all lists every one.

   THE SAME FILE SERVES EVERY REPOSITORY, beside site.mjs. Its home is
   dakibwa/design-system-page: change it there first, then copy it into each
   repository again, unchanged. It has no dependencies.

   WHERE IT LIVES, the same in every repository:
     AGENTS.md                 names design/system/project/README.md, the first read
     design/system/project/    the design system
     design/system/make/       this file and site.mjs, and the repository's own tools
     design/system/README.md   what the folder is and how to run them
     design/README.md          other design notes, if any: background

   THE FORMAT, IN SHORT (full text: dakibwa/design-system-page, design/README.md)
     tokens.json   "format": 2 once the system follows this.
                   "source": {"styles": [...]}  the product's own stylesheets:
                   a variable or class exists only if one of them defines it.
                   each token, or its family: "write":
                     "var"    type var(--name); the stylesheet defines --name
                     "value"  no variable: type the value ("in": where it is typed)
                     "never"  code or data makes it ("from": path#symbol;
                              "via": the component to use to show it)
                   a token whose value is {other} is written as that token is.
                   a type style is not a class unless "selector" says so.
     README.md     opens with: Signature, How it is written, Where things are,
                   Rules, Who wins, Before you finish. Then the brand book.
     components/<Name>/README.md   Write, Parts, States, Tokens, Rules, Source.
     components/<Name>/preview.html   the product's markup lies between
                   <!-- product --> and <!-- /product -->; ds- classes are the frame.
                   a preview made only of pictures of the product needs no marks.
     a rule        "- **id** sentence."  then, optionally,
                   "  - check: forbid|require `pattern` in `glob`"
     who wins      Dan's latest word; then the code on what exists; then this
                   folder on what is meant; other documents are background. */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const named = k => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
const ALL = flag('--all'), INDEX = flag('--index');
// every path as it really is, so a folder reached through a link (macOS's /var, say) still matches
const real = p => { try { return realpathSync(p); } catch { return p; } };
const SYSTEM = real(resolve(named('--system') || join(HERE, '..', 'project')));
let CHANGED = null;
{ const i = args.indexOf('--changed'); if (i >= 0) { CHANGED = []; args.splice(i, 1); while (i < args.length && !args[i].startsWith('--')) CHANGED.push(args.splice(i, 1)[0]); } }
if (!existsSync(SYSTEM)) { console.error(`no design system at ${SYSTEM}`); process.exit(2); }

// the repository the system belongs to: paths in the system are from its root
let ROOT = '';
try { ROOT = execFileSync('git', ['-C', SYSTEM, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
ROOT = ROOT && real(ROOT);
if (!ROOT) { let d = SYSTEM; while (d !== dirname(d) && !existsSync(join(d, '.git'))) d = dirname(d); ROOT = existsSync(join(d, '.git')) ? d : dirname(SYSTEM); }
const sys = (...p) => join(SYSTEM, ...p), root = p => isAbsolute(p) ? p : join(ROOT, p);
const readIf = f => { try { return readFileSync(f, 'utf8'); } catch { return null; } };
const isDir = f => { try { return statSync(f).isDirectory(); } catch { return false; } };
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ticks = s => [...String(s ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]);
const squash = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const lineAt = (text, index) => text.slice(0, index).split('\n').length;
// a value as the stylesheets would match it: case, spaces, #abc and 0.5 written one way
const norm = v => String(v).toLowerCase().replace(/\s+/g, '').replace(/#([0-9a-f])([0-9a-f])([0-9a-f])(?![0-9a-f])/g, '#$1$1$2$2$3$3').replace(/(^|[^0-9.])0\.(\d)/g, '$1.$2');
const normed = new Map(), normOf = f => { if (!normed.has(f)) { const t = readIf(root(f)); normed.set(f, t == null ? null : norm(t)); } return normed.get(f); };

/* ---- what is reported ---- */
const problems = [];
let FORMAT = 1;
const error = (check, where, message) => problems.push({ level: FORMAT === 2 ? 'error' : 'warn', check, where, message });
const warn = (check, where, message) => problems.push({ level: 'warn', check, where, message });

/* ---- the system's tokens, and the product's stylesheets they are checked against ---- */
let tokens = {};
const tokensText = readIf(sys('tokens.json'));
if (tokensText == null) warn('tokens', 'tokens.json', 'there is no tokens.json');
else try { tokens = JSON.parse(tokensText); } catch (e) { problems.push({ level: 'error', check: 'tokens', where: 'tokens.json', message: `not valid JSON: ${e.message}` }); }
FORMAT = tokens.format === 2 ? 2 : 1;
const styleFiles = [].concat(tokens.source?.styles ?? []);
if (tokensText != null && !styleFiles.length) error('source-styles', 'tokens.json', 'no "source": {"styles": [...]}, so no name can be checked against the product');
const styleText = f => { const t = readIf(root(f)); if (t == null) { error('source-styles', 'tokens.json', `${f} does not exist`); return ''; } return /\.html?$/i.test(f) ? [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n') : t; };
const css = styleFiles.map(styleText).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const haveStyles = css.trim().length > 0;
// custom properties a stylesheet defines, with every value it gives each; and the names alone, for
// markup and code, where a property is set in a style attribute or a style object
const define = (text, into = new Map()) => {
  for (const m of text.matchAll(/(?<![\w(-])--([\w-]+)\s*:\s*((?:[^;}"']|"[^"]*"|'[^']*')+)/g)) { if (!into.has(m[1])) into.set(m[1], new Set()); into.get(m[1]).add(norm(m[2].trim())); }
  return into;
};
const setsVars = text => new Set([...text.matchAll(/(?<![\w(-])--([\w-]+)["']?\s*:/g)].map(m => m[1]));
const defs = define(css);
const hasClass = c => new RegExp('\\.' + escRe(c) + '(?![\\w-])').test(css);
const usesVars = text => [...new Set([...text.matchAll(/var\(\s*--([\w-]+)/g)].map(m => m[1]))];

const themes = (tokens.color?.themes ?? []).map(t => t.id);
const valuesOf = t => t.value && typeof t.value === 'object' ? (themes.length ? themes.map(id => t.value[id]).filter(v => v != null) : Object.values(t.value)) : [t.value];
const families = Object.entries(tokens).filter(([, f]) => f && typeof f === 'object' && Array.isArray(f.tokens));
const all = families.flatMap(([fam, f]) => f.tokens.map(t => ({ fam, t, write: t.write || f.write })));
const tokenNames = new Set(all.map(x => x.t.name));
const styles = (tokens.type?.groups ?? []).flatMap(g => g.styles ?? []);
const styleNames = new Set(styles.map(s => s.name));
const fontKeys = Object.keys(tokens.type?.families ?? {});
const fontVar = v => v.startsWith('font-') && fontKeys.includes(v.slice(5));
const components = isDir(sys('components')) ? readdirSync(sys('components')).filter(n => n !== 'Cover' && (existsSync(sys('components', n, 'preview.html')) || existsSync(sys('components', n, 'README.md')))).sort() : [];

/* ---- A. is the system true to the code? ---- */
const seen = new Set();
let unwritten = 0;
for (const { fam, t, write } of all) {
  const at = `tokens.json ${fam}/${t.name}`;
  if (seen.has(t.name)) warn('token-write', at, `a second token called ${t.name}`);
  seen.add(t.name);
  if (t.retired && !tokenNames.has(t.retired)) error('retired', at, `"retired" names ${t.retired}, which is not a token`);
  // an alias ({other}) is written as the token it names, and needs no "write" of its own
  const aliases = valuesOf(t).filter(v => typeof v === 'string').map(v => /^\{(.+)\}$/.exec(v)?.[1]);
  if (!write && aliases.length && aliases.every(Boolean)) { for (const n of aliases) if (!tokenNames.has(n)) error('token-write', at, `is {${n}}, which is not a token`); continue; }
  if (!write) { unwritten++; continue; }
  if (write === 'var') {
    if (!haveStyles) continue;
    if (!defs.has(t.name)) { error('var-defined', at, `--${t.name} is not defined in ${styleFiles.join(', ')}: use the product's own name, or mark it "value" or "never"`); continue; }
    const want = valuesOf(t).filter(v => typeof v === 'string' && !/^\{.+\}$/.test(v)).map(norm);
    const missing = want.filter(v => !defs.get(t.name).has(v));
    if (missing.length) error('var-value', at, `the stylesheets give --${t.name} ${[...defs.get(t.name)].join(' or ')}, not ${missing.join(' or ')}`);
  } else if (write === 'value') {
    const ins = [].concat(t.in ?? []);
    if (!ins.length) { error('value-present', at, '"write": "value" needs "in": the files where the value is typed'); continue; }
    for (const f of ins) if (normOf(f) == null) error('value-present', at, `"in" names ${f}, which does not exist`);
    const lost = valuesOf(t).filter(v => typeof v === 'string').map(norm).filter(v => !ins.some(f => normOf(f)?.includes(v)));
    if (lost.length) error('value-present', at, `${lost.join(' or ')} is not typed in ${ins.join(', ')}`);
  } else if (write === 'never') {
    if (!t.from) error('never-source', at, '"write": "never" needs "from": the path#symbol or data file that makes it');
    else { const [file, symbol] = String(t.from).split('#'), text = readIf(root(file)); if (text == null && !isDir(root(file))) error('never-source', at, `"from" names ${file}, which does not exist`); else if (symbol && text != null && !text.includes(symbol)) error('never-source', at, `${file} holds no ${symbol}`); }
    for (const v of [].concat(t.via ?? [])) if (!components.includes(v)) error('never-source', at, `"via" names ${v}, which is not a component`);
  } else error('token-write', at, `"write" is "${write}"; it is "var", "value" or "never"`);
}
if (unwritten) error('token-write', 'tokens.json', `${unwritten} of ${all.length} tokens do not say how they are written ("write", on the token or its family)`);
for (const s of styles) {
  const at = `tokens.json type/${s.name}`, sels = [].concat(s.selector ?? []);
  if (haveStyles) for (const sel of sels) if (!css.includes(sel)) error('type-selector', at, `"selector" ${sel} is in none of the stylesheets`);
  if (haveStyles && hasClass(s.name) && !sels.includes('.' + s.name)) error('type-selector', at, `the product has a class .${s.name} that is not this style: give the style "selector": ".${s.name}" if it is that class, or rename the style`);
  for (const v of [].concat(s.via ?? [])) if (!components.includes(v)) error('type-selector', at, `"via" names ${v}, which is not a component`);
}

/* ---- the file an agent reads first ---- */
const FIRST = ['Signature', 'How it is written', 'Where things are', 'Rules', 'Who wins', 'Before you finish'];
const WHO_WINS = `1. Dan's latest word, said in the conversation or dated on the Decisions page.
2. The code, on what exists: every value, name, class, variable and piece of markup. Where this folder differs, this folder is out of date; correct it in the same change.
3. This folder, on what is meant: its rules (the lines with an id). Where the code breaks one, the code has a fault. Do not copy it. Fix it if it is part of your task; report it if it is not.
4. Any other design document in the repository is background. Read the part about the piece you are changing; where it differs from this folder, this folder wins.`;
const section = (text, name) => { const m = new RegExp(`^## ${escRe(name)}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## )`, 'm').exec(text + '\n## \n'); return m ? m[1] : null; };
const heads = text => [...text.matchAll(/^## (.+?)\s*$/gm)].map(m => m[1]);
const readme = readIf(sys('README.md')) ?? '';
if (!readme) error('first-screen', 'README.md', 'there is no README.md');
else {
  const open = heads(readme).slice(0, FIRST.length);
  if (open.join('|') !== FIRST.join('|')) error('first-screen', 'README.md', `opens with ${open.map(h => `"${h}"`).join(', ') || 'no headings'}; it opens with ${FIRST.join(', ')}`);
  const who = section(readme, 'Who wins');
  if (who != null && squash(who) !== squash(WHO_WINS)) error('first-screen', 'README.md', '"Who wins" is not the fixed text, word for word');
}

/* ---- where it lives: the same folders in every repository ---- */
const PLACE = 'design/system/project', TOOLS = 'design/system/make';
const fromRoot = p => relative(ROOT, real(p)).split(sep).join('/');
if (fromRoot(SYSTEM) !== PLACE) error('structure', fromRoot(SYSTEM) || '.', `the design system belongs in ${PLACE}, where every repository keeps it`);
{ // a copy kept in the repository (the home copy, run from outside it, can be anywhere)
  const here = fromRoot(HERE);
  if (here !== '..' && !here.startsWith('../') && !isAbsolute(here)) {
    if (here !== TOOLS) error('structure', here || '.', `the copies of check.mjs and site.mjs belong in ${TOOLS}`);
    else if (!existsSync(join(HERE, 'site.mjs'))) error('structure', TOOLS, 'site.mjs is not beside check.mjs');
  }
}
const agents = readIf(root('AGENTS.md'));
if (agents == null) error('structure', 'AGENTS.md', `there is none, so nothing sends an agent to ${PLACE}/README.md`);
else if (!agents.includes(PLACE)) error('structure', 'AGENTS.md', `names no ${PLACE}, so an agent arriving cold does not find the system`);

/* ---- each piece's card ---- */
const CARD = ['Write', 'Parts', 'States', 'Tokens', 'Rules', 'Source'];
const leadOf = text => { const after = text.replace(/^[\s\S]*?^# .*$/m, '').replace(/^\s+/, ''); const m = /^(?!#)([\s\S]*?)(?:\n\s*\n|\n#|$)/.exec(after); return m ? squash(m[1]) : ''; };
const cards = [];
for (const name of components) {
  const file = `components/${name}/README.md`, text = readIf(sys(file));
  if (text == null) { error('card-shape', file, 'there is no card'); continue; }
  cards.push({ name, file, text });
  if (!/^# .+$/m.test(text)) error('card-shape', file, 'no title');
  if (!leadOf(text)) error('card-shape', file, 'no first paragraph saying what it is');
  const h = heads(text), odd = h.filter(x => !CARD.includes(x)), known = h.filter(x => CARD.includes(x));
  if (odd.length) error('card-shape', file, `headings ${odd.map(x => `"${x}"`).join(', ')} are not among ${CARD.join(', ')}`);
  else if (known.join() !== CARD.filter(x => known.includes(x)).join()) error('card-shape', file, `headings are out of order: ${known.join(', ')}`);
  if (haveStyles) {
    const parts = ticks(section(text, 'Parts'));
    const lostClasses = parts.filter(p => /^\.[a-zA-Z_][\w-]*$/.test(p) && !/[A-Z]{3}/.test(p) && !hasClass(p.slice(1)));
    const lostProps = parts.filter(p => /^--[\w-]+$/.test(p) && !/[A-Z]{3}/.test(p) && !new RegExp(escRe(p) + '(?![\\w-])').test(css));
    if (lostClasses.length) error('card-parts', file, `${lostClasses.join(' ')} ${lostClasses.length > 1 ? 'are' : 'is'} in none of the stylesheets`);
    if (lostProps.length) error('card-parts', file, `${lostProps.join(' ')} ${lostProps.length > 1 ? 'are' : 'is'} in none of the stylesheets`);
  }
  const named = (section(text, 'Tokens') ?? '').split('\n').filter(l => /^- `/.test(l)).flatMap(l => ticks(l.split(':')[0]));
  const unknown = named.filter(n => !tokenNames.has(n) && !styleNames.has(n));
  if (unknown.length) error('card-tokens', file, `${unknown.join(' ')}: no such token or type style`);
  for (const line of (section(text, 'Source') ?? '').split('\n').filter(l => /^- `/.test(l))) {
    const t = ticks(line), [path, symbol] = t[0].split('#'), find = /^- `[^`]+`, find /.test(line) ? t[1] : symbol;
    const body = readIf(root(path));
    if (body == null && !isDir(root(path))) error('card-source', file, `${path} does not exist`);
    else if (find && body != null && !body.includes(find)) error('card-source', file, `${path} holds no "${find}"`);
  }
}
for (const name of components) {
  const file = `components/${name}/preview.html`, text = readIf(sys(file));
  if (text == null) continue;
  const opens = (text.match(/<!--\s*product\s*-->/g) || []).length, closes = (text.match(/<!--\s*\/product\s*-->/g) || []).length;
  const frames = /<iframe\b[^>]*\bsrc=["'][^"']*preview\.html/i.test(text);
  // a preview made only of pictures of the product (its screens) has no markup to copy, so no marks
  const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(text)?.[1] ?? '').replace(/<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const pictures = [...body.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].every(([, tag, attrs]) => /^(img|picture|source|video|br)$/i.test(tag) || /\bclass=["'](?:[^"']*\s)?ds-/.test(attrs));
  if (opens !== closes) error('preview-marks', file, `${opens} <!-- product --> and ${closes} <!-- /product -->`);
  else if (!opens && !frames && !pictures) error('preview-marks', file, 'no <!-- product --> marks, so nothing says which markup is the product\'s');
  const inside = [...text.matchAll(/<!--\s*product\s*-->([\s\S]*?)<!--\s*\/product\s*-->/g)].map(m => m[1]).join('\n');
  const classes = [...new Set([...inside.matchAll(/\bclass=["']([^"']*)["']/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean))];
  const frame = classes.filter(c => c.startsWith('ds-'));
  if (frame.length) error('preview-marks', file, `frame classes inside the product marks: ${frame.join(' ')}`);
  if (haveStyles) {
    const own = setsVars(text), lost = usesVars(text).filter(v => !defs.has(v) && !own.has(v) && !fontVar(v));
    if (lost.length) error('preview-vars', file, `${lost.map(v => `var(--${v})`).join(' ')}: the product's stylesheets define none of these, so this markup would break in the product`);
    const bare = classes.filter(c => !c.startsWith('ds-') && !hasClass(c));
    if (bare.length) warn('preview-classes', file, `${bare.length} class${bare.length > 1 ? 'es have' : ' has'} no rule in the stylesheets (fine for a hook): ${bare.slice(0, 8).join(' ')}${bare.length > 8 ? ' …' : ''}`);
  }
}

/* ---- the index of pieces, written from the cards ---- */
const groupOf = name => /group="([^"]*)"/.exec((readIf(sys('components', name, 'preview.html')) ?? '').split('\n')[0])?.[1] || 'Other';
function indexText() {
  const groups = new Map();
  for (const c of cards) { const g = groupOf(c.name); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  let out = '# Components\n\nEach piece in one line: what it is, then the first line of what you write. Written by `check.mjs --index` from the cards; never edit it by hand.\n';
  for (const [g, list] of groups) {
    out += `\n## ${g}\n\n`;
    for (const c of list) {
      const lead = leadOf(c.text), sentence = (/^(.+?[.!?])(\s|$)/.exec(lead) || [, lead])[1];
      const code = /```[^\n]*\n([\s\S]*?)```/.exec(section(c.text, 'Write') ?? '')?.[1].split('\n').map(l => l.trim()).find(l => l && !/^(import|\/\/|<!--)/.test(l));
      out += `- **${c.name}** ${sentence}${code ? ` \`${code.replace(/`/g, "'")}\`` : ''}\n`;
    }
  }
  return out;
}
if (cards.length) {
  const index = sys('components', 'README.md'), want = indexText();
  if (INDEX) writeFileSync(index, want);
  else if (readIf(index) !== want) error('index-fresh', 'components/README.md', `${existsSync(index) ? 'is out of date' : 'is missing'}: run check.mjs --index`);
}

// every path "Where things are" names exists (after the index is written); a path git ignores, like
// the drawn page, is made rather than kept, so it need not exist yet
const ignored = p => { try { execFileSync('git', ['-C', ROOT, 'check-ignore', '-q', p], { stdio: 'ignore' }); return true; } catch { return false; } };
for (const p of ticks(section(readme, 'Where things are'))) if (/^[\w.@-]+(\/[\w.@-]*)+$|^[\w.@-]+\.(md|json|html|css|png|svg|webp|mjs|js)$/.test(p) && !existsSync(sys(p)) && !existsSync(root(p)) && !ignored(p) && !ignored(relative(ROOT, sys(p)))) error('links', 'README.md', `"Where things are" names ${p}, which does not exist`);

/* ---- rules: the lines with an id, and their check lines ---- */
let FILES = null;
const walk = (base, out) => {
  for (const e of readdirSync(join(ROOT, base), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || (e.name.startsWith('.') && e.isDirectory())) continue;
    const p = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const globRe = g => { let re = ''; for (let i = 0; i < g.length; i++) { const c = g[i]; if (c === '*') { if (g[i + 1] === '*') { i++; if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; } else re += '[^/]*'; } else if (c === '?') re += '[^/]'; else re += escRe(c); } return new RegExp(`^${re}$`); };
// a glob's files, walking only from the folder its fixed part names
const expand = g => { const fixed = []; for (const s of g.split('/').slice(0, -1)) { if (/[*?]/.test(s)) break; fixed.push(s); } const base = fixed.join('/'), re = globRe(g); return isDir(join(ROOT, base)) ? walk(base, []).filter(f => re.test(f)) : []; };
const matcher = p => { const m = /^\/(.+)\/([a-z]*)$/.exec(p); if (m) { const re = new RegExp(m[1], m[2].replace('g', '')); return t => { const r = re.exec(t); return r ? r.index : -1; }; } return t => t.indexOf(p); };
const rules = [];
for (const { file, text } of [{ file: 'README.md', text: readme }, ...cards]) {
  const body = section(text, 'Rules');
  if (body == null) continue;
  let current = null;
  for (const line of body.split('\n')) {
    const id = /^- \*\*([^*]+)\*\* /.exec(line);
    if (id) { current = { id: id[1], file, checks: [] }; rules.push(current); if (!/^[a-z0-9][a-z0-9-]*$/.test(id[1])) error('rule-ids', file, `"${id[1]}" is not a short lowercase id`); continue; }
    const check = /^\s+- check:\s*(.*)$/.exec(line);
    if (!check) continue;
    const m = /^(forbid|require) `(.+?)` in `(.+?)`(?: except `(.+?)`)?\s*$/.exec(check[1]);
    if (!current) error('rule-ids', file, `a check line with no rule above it: ${check[1]}`);
    else if (!m) error('rule-ids', file, `${current.id}: cannot read the check line "${check[1]}"`);
    else { try { current.checks.push({ verb: m[1], pattern: m[2], glob: m[3], except: m[4], find: matcher(m[2]) }); } catch (e) { error('rule-ids', file, `${current.id}: the pattern is not a regular expression: ${e.message}`); } }
  }
}
const ids = rules.map(r => r.id), twice = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
if (twice.length) error('rule-ids', 'README.md', `ids used twice: ${twice.join(' ')}`);
const exceptOf = c => c.except ? globRe(c.except) : null;
for (const r of rules) for (const c of r.checks) {
  const skip = exceptOf(c), files = expand(c.glob).filter(f => !skip?.test(f));
  if (!files.length) { error('rules', r.file, `${r.id}: \`${c.glob}\` matches no file`); continue; }
  const results = files.map(f => { const t = readIf(join(ROOT, f)) ?? ''; const at = c.find(t); return { f, at, line: at < 0 ? 0 : lineAt(t, at) }; });
  if (c.verb === 'forbid') { const hits = results.filter(x => x.at >= 0); if (hits.length) error('rules', r.file, `${r.id}: \`${c.pattern}\` is in ${hits.slice(0, 3).map(x => `${x.f}:${x.line}`).join(', ')}${hits.length > 3 ? ` and ${hits.length - 3} more` : ''}`); }
  else { const misses = results.filter(x => x.at < 0); if (misses.length) error('rules', r.file, `${r.id}: \`${c.pattern}\` is missing from ${misses.slice(0, 3).map(x => x.f).join(', ')}${misses.length > 3 ? ` and ${misses.length - 3} more` : ''}`); }
}

/* ---- B. are these files true to the system? ---- */
if (CHANGED) {
  const shared = new Set(all.filter(x => x.write !== 'never').flatMap(x => valuesOf(x.t)).filter(v => typeof v === 'string').map(norm));
  const known = new Set(all.flatMap(x => valuesOf(x.t)).filter(v => typeof v === 'string').map(norm));
  const colourish = v => /^#[0-9a-f]{3,8}$|^(rgb|hsl|oklch|lab|lch)a?\(/i.test(v);
  for (const f of CHANGED) {
    const abs = real(resolve(f)), rel = relative(ROOT, abs).split(sep).join('/'), text = readIf(abs);
    if (text == null) { warn('changed', f, 'cannot read it'); continue; }
    // the system's own files carry its values and are checked above; here only the product's
    const inSystem = !relative(SYSTEM, abs).startsWith('..');
    if (haveStyles && !inSystem) {
      const own = setsVars(text), lost = usesVars(text).filter(v => !defs.has(v) && !own.has(v) && !fontVar(v));
      if (lost.length) error('unknown-var', rel, `${lost.map(v => `var(--${v})`).join(' ')}: no stylesheet of the product defines ${lost.length > 1 ? 'these' : 'it'}`);
    }
    const lower = inSystem ? '' : text.toLowerCase();
    for (const { fam, t, write } of inSystem ? [] : all) {
      if (write === 'never' && rel !== String(t.from || '').split('#')[0]) for (const v of valuesOf(t)) {
        if (typeof v !== 'string' || !colourish(v) || shared.has(norm(v))) continue;
        const at = lower.indexOf(v.toLowerCase());
        if (at >= 0) error('typed-never', `${rel}:${lineAt(text, at)}`, `${v} is ${fam}/${t.name}, which ${t.from || 'code'} works out: ${t.via ? `use ${[].concat(t.via).join(' or ')}` : 'do not type it'}`);
      }
      if (t.retired && new RegExp(`--${escRe(t.name)}(?![\\w-])`).test(text)) error('retired', rel, `--${t.name} is retired: write ${t.retired}`);
    }
    for (const m of text.matchAll(/\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/g)) for (const c of (m[1] ?? m[2] ?? m[3] ?? '').split(/\s+/)) {
      const s = styles.find(x => x.name === c);
      if (s && ![].concat(s.selector ?? []).includes('.' + c)) error('style-as-class', `${rel}:${lineAt(text, m.index)}`, `${c} is a type style, not a class${s.selector ? `: write ${[].concat(s.selector).join(' or ')}` : ''}`);
    }
    if (!inSystem) for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (!known.has(norm(m[0]))) warn('new-colour', `${rel}:${lineAt(text, m.index)}`, `${m[0]} is no token's value`);
    for (const r of rules) for (const c of r.checks) {
      if (!globRe(c.glob).test(rel) || exceptOf(c)?.test(rel)) continue;
      const at = c.find(text);
      if (c.verb === 'forbid' && at >= 0) error('rules', `${rel}:${lineAt(text, at)}`, `${r.id}: \`${c.pattern}\` is forbidden here`);
      if (c.verb === 'require' && at < 0) error('rules', rel, `${r.id}: \`${c.pattern}\` must be here`);
    }
  }
}

/* ---- the report ---- */
const errors = problems.filter(p => p.level === 'error'), warnings = problems.filter(p => p.level === 'warn');
const shown = [...errors], count = new Map();
for (const p of warnings) { const n = (count.get(p.check) ?? 0) + 1; count.set(p.check, n); if (ALL || n <= 5) shown.push(p); }
for (const p of shown) console.log(`${p.level.padEnd(5)}  ${p.check.padEnd(15)} ${p.where}: ${p.message}`);
if (!ALL) for (const [check, n] of count) if (n > 5) console.log(`warn   ${check.padEnd(15)} … and ${n - 5} more like this (--all lists them)`);
const name = tokens.name || relative(ROOT, SYSTEM) || SYSTEM;
console.log(`${name}: ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}${FORMAT === 2 ? '' : ' (format 1: every finding is a warning until tokens.json says "format": 2)'}${INDEX && cards.length ? '; components/README.md written' : ''}`);
process.exitCode = errors.length ? 1 : 0;
