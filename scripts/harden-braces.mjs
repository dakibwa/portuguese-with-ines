import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// GHSA-vfj7-8cjw-p6xm has no upstream release yet. Keep the package version
// honest, and refuse changed sources until the replacement has been reviewed.
const root = fileURLToPath(new URL('..', import.meta.url));
const checkOnly = process.argv.includes('--check');
const omitDev = !checkOnly && (process.env.NODE_ENV === 'production' ||
  (process.env.npm_config_omit || '').split(/[\s,]+/).includes('dev'));
const digest = source => createHash('sha256').update(source).digest('hex');
const rules = {
  'parse.js': {
    original: 'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310',
    patched: 'a50ab8be11a4cb6c14ca89f58d1c8463ee836112bf60051e3ab671fafa37cbb6',
    edits: [
      ["const stringify = require('./stringify');", "const stringify = require('./stringify');\nconst { checkDepth } = require('./utils');"],
      ["if (value === CHAR_LEFT_PARENTHESES) {", "if (value === CHAR_LEFT_PARENTHESES) {\n      checkDepth(stack.length);"],
      ["if (value === CHAR_LEFT_CURLY_BRACE) {", "if (value === CHAR_LEFT_CURLY_BRACE) {\n      checkDepth(stack.length);"]
    ]
  },
  'compile.js': {
    original: 'dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f',
    patched: '9d15cd181076e3a9a8bf87a18df5a695b1618898fb73c979f426fa9467ff6a75',
    edits: [
      ['const walk = (node, parent = {}) => {', 'const walk = (node, parent = {}, depth = -1) => {\n    utils.checkDepth(depth);'],
      ['walk(child, node)', 'walk(child, node, depth + 1)']
    ]
  },
  'stringify.js': {
    original: '379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a',
    patched: '3a5285a47bd6ce53579cf4a77b0cb6e95e0f3c9a0244a512104ce01eb58ae7f9',
    edits: [
      ['const stringify = (node, parent = {}) => {', 'const stringify = (node, parent = {}, depth = -1) => {\n    utils.checkDepth(depth);'],
      ['stringify(child)', 'stringify(child, {}, depth + 1)']
    ]
  },
  'expand.js': {
    original: '41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7',
    patched: 'aab00d7f5fa51edd5624448aafb1b29ad79db622bb52fd9d388cc2591c8848cc',
    edits: [
      ["const append = (queue = '', stash = '', enclose = false) => {", "const append = (queue = '', stash = '', enclose = false, depth = 0) => {\n  utils.checkDepth(depth);"],
      ['append(value, stash, enclose)', 'append(value, stash, enclose, depth + 1)'],
      ['append(item, ele, enclose)', 'append(item, ele, enclose, depth + 1)'],
      ['const walk = (node, parent = {}) => {', 'const walk = (node, parent = {}, depth = -1) => {\n    utils.checkDepth(depth);'],
      ['let q = parent.queue;', 'let q = parent.queue;\n    let parentDepth = 0;'],
      ["while (p.type !== 'brace' && p.type !== 'root' && p.parent) {", "while (p.type !== 'brace' && p.type !== 'root' && p.parent) {\n      utils.checkDepth(++parentDepth);"],
      ['let block = node;', 'let block = node;\n    parentDepth = 0;'],
      ["while (block.type !== 'brace' && block.type !== 'root' && block.parent) {", "while (block.type !== 'brace' && block.type !== 'root' && block.parent) {\n      utils.checkDepth(++parentDepth);"],
      ['walk(child, node)', 'walk(child, node, depth + 1)']
    ]
  },
  'utils.js': {
    original: 'b5a7596aa67730412b3c029ef09e84e6b67b8e445cffd35d1d295549c89066c7',
    patched: '68e763ace4cd47c3f6eafcdf4f86ec38f1a2f724244c3bc7f3bdba7e3353a32c',
    edits: [
      ["'use strict';", "'use strict';\n\n// Local hardening: bound parser/walker recursion until an upstream fix ships.\nexports.checkDepth = depth => {\n  if (depth > 128) {\n    throw new RangeError('Braces nesting exceeds the local safety limit (128)');\n  }\n};"],
      ['const flat = arr => {', 'const flat = (arr, depth = 0) => {\n    exports.checkDepth(depth);'],
      ['flat(ele)', 'flat(ele, depth + 1)']
    ]
  }
};

function harden(source, rule) {
  const hash = digest(source);
  if (hash === rule.patched) return source;
  assert.equal(hash, rule.original, 'Unrecognized Braces source; review the upstream change before updating this patch');
  for (const [before, after] of rule.edits) {
    assert.equal(source.split(before).length, 2, 'Braces patch must match exactly once');
    source = source.replace(before, after);
  }
  assert.equal(digest(source), rule.patched, 'Braces patch output changed unexpectedly');
  return source;
}

// Check every locked copy, including a future nested installation. A version
// update must not quietly bypass the temporary mitigation.
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const packages = Object.entries(lock.packages).filter(([path]) => /(?:^|\/)node_modules\/braces$/.test(path));
assert.ok(packages.length, 'Review/remove Braces hardening when the dependency disappears');
const writes = [];
const installed = [];
for (const [path, entry] of packages) {
  const location = resolve(root, path);
  if (omitDev && entry.dev === true && !existsSync(location)) continue;
  assert.equal(entry.version, '3.0.3', 'Review the Braces hardening for this upstream version');
  const manifest = JSON.parse(readFileSync(resolve(location, 'package.json'), 'utf8'));
  assert.equal(manifest.version, entry.version, 'Installed Braces does not match the lockfile');
  installed.push(path);
  for (const [file, rule] of Object.entries(rules)) {
    const target = resolve(location, 'lib', file);
    const source = readFileSync(target, 'utf8');
    if (checkOnly) {
      assert.equal(digest(source), rule.patched, 'Unprotected Braces install; run npm run postinstall before check:site');
    }
    const patched = harden(source, rule);
    assert.equal(harden(patched, rule), patched, 'Braces hardening must be idempotent');
    assert.throws(() => harden(patched + '\n', rule), /Unrecognized Braces source/);
    if (source !== patched) writes.push([target, patched]);
  }
}
// Verify the whole installation before changing any file.
for (const [target, source] of writes) writeFileSync(target, source);

const require = createRequire(import.meta.url);
const limited = { name: 'RangeError', message: 'Braces nesting exceeds the local safety limit (128)' };
for (const path of installed) {
  const braces = require(resolve(root, path));
  const shallow = 'file-{a,b{1,2}}-{1..3}';
  assert.equal(braces.compile(shallow), 'file-(a|b(1|2))-([1-3])');
  assert.deepEqual(braces.expand(shallow), ['file-a-1', 'file-a-2', 'file-a-3', 'file-b1-1', 'file-b1-2', 'file-b1-3', 'file-b2-1', 'file-b2-2', 'file-b2-3']);
  assert.equal(braces.stringify(shallow), shallow);
  assert.deepEqual(braces.expand('(foo/{a,b})'), ['(foo/a)', '(foo/b)']);
  assert.deepEqual(braces.expand('\\{literal\\}'), ['{literal}']);
  for (const [open, close] of [['{', '}'], ['(', ')'], ['{(', ')}']]) {
    const deep = open.repeat(1000) + 'x' + close.repeat(1000);
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      assert.throws(() => braces[method](deep), limited);
    }
  }
  // Parsed patterns and directly supplied ASTs use the same bounded walkers.
  for (const method of ['compile', 'expand', 'stringify']) {
    assert.doesNotThrow(() => braces[method]('('.repeat(128) + 'x' + ')'.repeat(128)));
    const ast = { type: 'root', nodes: [] };
    let cursor = ast;
    for (let i = 0; i < 5000; i++) {
      const child = { type: 'paren', nodes: [], parent: cursor };
      cursor.nodes.push(child);
      cursor = child;
    }
    assert.throws(() => braces[method](ast), limited);
    const cyclic = { type: 'root', nodes: [] };
    cyclic.nodes.push(cyclic);
    assert.throws(() => braces[method](cyclic), limited);
  }
  const parentCycle = { type: 'paren', nodes: [] };
  parentCycle.parent = parentCycle;
  assert.throws(() => braces.expand({ type: 'root', nodes: [parentCycle] }), limited);
}
console.log(installed.length
  ? 'Braces 3.0.3 local nesting hardening verified' + (writes.length ? ' and applied.' : '.')
  : 'Braces hardening skipped: development dependencies were explicitly omitted.');
