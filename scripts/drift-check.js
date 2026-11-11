#!/usr/bin/env node
// drift-check: reports docs pages whose mapped source code changed since the
// page was last verified. See drift-map.yaml for the map format.
//
// Usage:
//   node scripts/drift-check.js [page-or-dir]            check pages
//   node scripts/drift-check.js <page-or-dir> --verify   stamp verified_at = HEAD
//   node scripts/drift-check.js --coverage [--by-dir]    how many pages are mapped
//   --ref <git-ref>   compare against a commit or branch instead of the working tree
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const YAML = require('yaml');

// ---------- setup ----------

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: __dirname,
  encoding: 'utf8',
}).trim();
const MAP_PATH = path.join(ROOT, 'drift-map.yaml');

const positional = [];
const flags = new Set();
let ref = null; // null = working tree
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--ref') ref = argv[++i];
  else if (argv[i].startsWith('--')) flags.add(argv[i]);
  else positional.push(argv[i]);
}

function die(msg, code = 2) {
  console.error(`drift-check: ${msg}`);
  process.exit(code);
}

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

const toPosix = (p) => p.split(path.sep).join('/');
const lf = (s) => (s == null ? s : s.replace(/\r\n/g, '\n'));

// Read a file at a revision, or from the working tree when rev is null.
function readAt(rev, file) {
  if (rev === null) {
    const abs = path.join(ROOT, file);
    return fs.existsSync(abs) ? lf(fs.readFileSync(abs, 'utf8')) : null;
  }
  return lf(git(['show', `${rev}:${file}`], { allowFail: true }));
}

function commitExists(sha) {
  return git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], { allowFail: true }) !== null;
}

// ---------- load the map ----------

if (!fs.existsSync(MAP_PATH)) die(`no drift-map.yaml at ${MAP_PATH}`);
const mapText = fs.readFileSync(MAP_PATH, 'utf8');
const map = YAML.parse(mapText) || {};
const docsRoot = toPosix(map.docs_root || 'docs');
const pages = (map.pages || []).map((p) => ({
  ...p,
  verified_at: p.verified_at == null ? null : String(p.verified_at),
}));

const seen = new Set();
for (const p of pages) {
  if (!p.doc) die('a page entry is missing `doc`');
  if (seen.has(p.doc)) die(`${p.doc} is mapped more than once`);
  seen.add(p.doc);
}

// ---------- scoped extraction ----------

function parseSource(spec) {
  const i = spec.indexOf('#');
  return i < 0 ? { file: spec, scope: null } : { file: spec.slice(0, i), scope: spec.slice(i + 1) };
}

function extract(text, file, scope) {
  if (text == null) return { found: false, reason: 'file not found' };
  if (!scope) return { found: true, text };
  const ext = path.extname(file).toLowerCase();
  return ['.json', '.yaml', '.yml'].includes(ext)
    ? extractKey(text, scope)
    : extractSymbol(text, scope);
}

// "paths[/lockers/reserve].post" -> ["paths", "/lockers/reserve", "post"]
function keySegments(scope) {
  const segs = [];
  const re = /\[([^\]]+)\]|([^.[\]]+)/g;
  let m;
  while ((m = re.exec(scope))) segs.push(m[1] ?? m[2]);
  return segs;
}

function extractKey(text, scope) {
  let node;
  try {
    node = YAML.parse(text); // YAML is a superset of JSON
  } catch (err) {
    return { found: false, reason: `could not parse file: ${err.message}` };
  }
  for (const seg of keySegments(scope)) {
    if (node == null || typeof node !== 'object' || !(seg in node)) {
      return { found: false, reason: `key "${scope}" not found` };
    }
    node = node[seg];
  }
  return { found: true, text: YAML.stringify(node) };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function symbolPatterns(scope) {
  // Express route: "POST /lockers/reserve" -> app.post('/lockers/reserve', ...)
  const route = scope.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+(\S+)$/i);
  if (route) {
    return [new RegExp(`\\b[\\w$]+\\.${route[1].toLowerCase()}\\(\\s*['"\`]${escapeRe(route[2])}['"\`]`)];
  }
  // Call by first argument: "registerTool:check_locker_status"
  const call = scope.match(/^([\w$.]+):(.+)$/);
  if (call) {
    return [new RegExp(`\\b${escapeRe(call[1])}\\(\\s*['"\`]${escapeRe(call[2])}['"\`]`)];
  }
  // Named declaration
  const n = escapeRe(scope);
  return [
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\*?\\s+${n}\\b`, 'm'),
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${n}\\b`, 'm'),
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+${n}\\b`, 'm'),
    new RegExp(`^[ \\t]*(?:export\\s+)?(?:interface|type|enum)\\s+${n}\\b`, 'm'),
    new RegExp(`^[ \\t]*(?:static\\s+)?(?:async\\s+)?${n}\\s*\\([^)]*\\)\\s*\\{`, 'm'),
  ];
}

// From `start`, find the end of the statement: the first ; or line break
// outside any brackets, strings, or comments.
function statementEnd(text, start) {
  let depth = 0;
  let lastSig = '';
  let i = start;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const e = text.indexOf('\n', i);
      i = e < 0 ? text.length : e;
      continue;
    }
    if (c === '/' && next === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? text.length : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      i++;
      lastSig = c;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth <= 0 && c === ';') return i + 1;
    else if (depth <= 0 && c === '\n' && !'=,+-*/&|?:.('.includes(lastSig)) return i;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return text.length;
}

function extractSymbol(text, scope) {
  for (const re of symbolPatterns(scope)) {
    const m = re.exec(text);
    if (!m) continue;
    const lineStart = m.index === 0 ? 0 : text.lastIndexOf('\n', m.index - 1) + 1;
    const end = statementEnd(text, m.index);
    return { found: true, text: text.slice(lineStart, end).trimEnd() + '\n' };
  }
  return { found: false, reason: `symbol "${scope}" not found` };
}

// Whitespace-only changes don't count as drift.
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// ---------- evaluate one page ----------

function evaluate(page) {
  const r = { doc: page.doc, status: null, notes: [], changed: [], missing: [] };
  if (!fs.existsSync(path.join(ROOT, page.doc))) {
    r.status = 'REMAP';
    r.notes.push('the docs page no longer exists');
    return r;
  }
  const sources = page.sources || [];
  if (!sources.length) {
    r.status = 'REMAP';
    r.notes.push('entry has no sources');
    return r;
  }
  const baseline = page.verified_at;
  if (baseline && !commitExists(baseline)) {
    r.status = 'REMAP';
    r.notes.push(`verified_at commit ${baseline} not found`);
    return r;
  }

  const currentTexts = [];
  for (const spec of sources) {
    const { file, scope } = parseSource(spec);
    const cur = extract(readAt(ref, file), file, scope);
    if (!cur.found) {
      r.status = 'REMAP';
      r.notes.push(`${spec}: ${cur.reason}`);
      continue;
    }
    currentTexts.push(cur.text);
    if (!baseline) continue;
    const base = extract(readAt(baseline, file), file, scope);
    if (!base.found) r.changed.push({ spec, baseline, before: '', after: cur.text, isNew: true });
    else if (norm(base.text) !== norm(cur.text)) {
      r.changed.push({ spec, baseline, before: base.text, after: cur.text });
    }
  }
  if (r.status === 'REMAP') return r;
  if (!baseline) {
    r.status = 'UNVERIFIED';
    return r;
  }
  if (!r.changed.length) {
    r.status = 'OK';
    return r;
  }
  const expects = (page.expects || []).map(String);
  const haystack = currentTexts.join('\n');
  r.missing = expects.filter((s) => !haystack.includes(s));
  r.status = expects.length && !r.missing.length ? 'PASSED' : 'REVIEW';
  return r;
}

// ---------- helpers for output ----------

function listDocs(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listDocs(rel));
    else if (/\.mdx?$/i.test(ent.name)) out.push(rel);
  }
  return out.sort();
}

function resolveTarget(t) {
  if (!t) return null;
  for (const abs of [path.resolve(process.cwd(), t), path.resolve(ROOT, t), path.resolve(ROOT, docsRoot, t)]) {
    if (fs.existsSync(abs)) {
      const rel = toPosix(path.relative(ROOT, abs));
      return rel === '' ? null : rel;
    }
  }
  die(`can't find "${t}"`);
}

function scopedDiff(before, after) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
  const a = path.join(dir, 'before');
  const b = path.join(dir, 'after');
  fs.writeFileSync(a, before);
  fs.writeFileSync(b, after);
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-color', '-b', '--', a, b],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (err) {
    out = err.stdout || ''; // git diff exits 1 when files differ
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return out
    .split('\n')
    .filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(l))
    .join('\n')
    .trimEnd();
}

// For an unmapped page, suggest sources used by mapped pages nearby.
function nearbyHints(doc) {
  let dir = path.posix.dirname(doc);
  while (true) {
    const near = pages.filter((p) => path.posix.dirname(p.doc) === dir);
    if (near.length) return [...new Set(near.flatMap((p) => p.sources || []))];
    if (dir === '.' || dir === docsRoot || !dir.includes('/')) return [];
    dir = path.posix.dirname(dir);
  }
}

const pad = (s) => s.padEnd(14);

// ---------- --coverage ----------

if (flags.has('--coverage')) {
  const all = listDocs(docsRoot);
  const mapped = new Set(pages.map((p) => p.doc));
  const count = all.filter((d) => mapped.has(d)).length;
  const pct = all.length ? ((count / all.length) * 100).toFixed(1) : '0.0';
  console.log(`Mapped ${count} of ${all.length} pages (${pct}%) under ${docsRoot}`);
  if (flags.has('--by-dir')) {
    const byDir = new Map();
    for (const d of all) {
      const key = path.posix.dirname(path.posix.relative(docsRoot, d));
      const row = byDir.get(key) || { total: 0, mapped: 0 };
      row.total++;
      if (mapped.has(d)) row.mapped++;
      byDir.set(key, row);
    }
    console.log('');
    console.log('Directory'.padEnd(24) + 'Mapped');
    for (const [dir, row] of [...byDir].sort()) {
      console.log((dir === '.' ? '(root)' : dir).padEnd(24) + `${row.mapped}/${row.total}`);
    }
  }
  const unmapped = all.filter((d) => !mapped.has(d));
  if (unmapped.length) {
    console.log('\nUnmapped:');
    unmapped.forEach((d) => console.log(`  ${d}`));
  }
  process.exit(0);
}

// ---------- check / verify ----------

const target = resolveTarget(positional[0]);
const inScope = (doc) => !target || doc === target || doc.startsWith(target + '/');
const scoped = pages.map((p, index) => ({ p, index })).filter(({ p }) => inScope(p.doc));

if (flags.has('--verify')) {
  if (!target) die('--verify needs a page or directory, so you only verify what you checked');
  if (ref) die("--verify checks the working tree; don't combine it with --ref");
  if (!scoped.length) die(`no mapped pages under ${target}`);

  const head = git(['rev-parse', '--short', 'HEAD']).trim();
  const doc = YAML.parseDocument(mapText);
  let failed = false;

  for (const { p, index } of scoped) {
    const r = evaluate(p);
    const problems = [];
    if (r.status === 'REMAP') problems.push(...r.notes);
    if (r.missing.length) problems.push(`expected strings missing from sources: ${r.missing.map((s) => JSON.stringify(s)).join(', ')}`);
    for (const spec of p.sources || []) {
      const { file, scope } = parseSource(spec);
      const work = extract(readAt(null, file), file, scope);
      const committed = extract(readAt('HEAD', file), file, scope);
      if (work.found && (!committed.found || norm(work.text) !== norm(committed.text))) {
        problems.push(`${spec} has uncommitted changes; commit them first so verified_at points at the code you checked`);
      }
    }
    if (problems.length) {
      failed = true;
      console.log(`${pad('NOT VERIFIED')}${p.doc}`);
      problems.forEach((m) => console.log(`${pad('')}${m}`));
      continue;
    }
    const sha = doc.createNode(head);
    sha.type = 'QUOTE_DOUBLE';
    doc.setIn(['pages', index, 'verified_at'], sha);
    console.log(`${pad('VERIFIED')}${p.doc}  (verified_at: ${p.verified_at || 'none'} -> ${head})`);
  }
  fs.writeFileSync(MAP_PATH, doc.toString());
  process.exit(failed ? 1 : 0);
}

const results = scoped.map(({ p }) => evaluate(p));
const unmapped = listDocs(docsRoot).filter((d) => inScope(d) && !seen.has(d));

console.log(`drift-check: ${results.length} mapped page(s), comparing against ${ref || 'the working tree'}\n`);

for (const r of results) {
  console.log(`${pad(r.status)}${r.doc}`);
  r.notes.forEach((n) => console.log(`${pad('')}${n}`));
  for (const c of r.changed) console.log(`${pad('')}changed: ${c.spec}${c.isNew ? ' (new since verified_at)' : ''}`);
  if (r.status === 'PASSED') console.log(`${pad('')}all expected strings still present`);
  if (r.missing.length) {
    console.log(`${pad('')}missing expected: ${r.missing.map((s) => JSON.stringify(s)).join(', ')}`);
  }
}
for (const d of unmapped) {
  console.log(`${pad('UNMAPPED')}${d}`);
  const hints = nearbyHints(d);
  if (hints.length) console.log(`${pad('')}nearby pages map: ${hints.join(', ')}`);
}

// Print each changed source's diff once, even if several pages share it.
const diffs = new Map();
for (const r of results) {
  if (r.status !== 'REVIEW') continue;
  for (const c of r.changed) {
    const key = `${c.spec}@${c.baseline}`;
    if (!diffs.has(key)) diffs.set(key, { ...c, docs: [] });
    diffs.get(key).docs.push(r.doc);
  }
}
if (diffs.size) {
  console.log('\n--- Changes to review ---');
  for (const d of diffs.values()) {
    console.log(`\n${d.spec}  (since ${d.baseline})`);
    console.log(`affects: ${d.docs.join(', ')}`);
    console.log(scopedDiff(d.before, d.after));
  }
}

const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
if (unmapped.length) counts.UNMAPPED = unmapped.length;
console.log('\n' + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('  '));

process.exit(results.some((r) => r.status === 'REVIEW' || r.status === 'REMAP') ? 1 : 0);
