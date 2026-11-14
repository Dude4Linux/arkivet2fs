#!/usr/bin/env node
// Builds the release packages from a git ref, never from the working tree, so a
// package holds exactly the committed files and the same ref always gives the same
// bytes: the files are stored (not compressed) in name order, with the commit's time.
// That lets tools/sign.mjs rebuild a tag locally and sign CI's package only when the
// two are identical.
//
//   node tools/build.mjs                  build HEAD into dist/
//   node tools/build.mjs --tag v1.2.0     build a release tag (annotated, = manifest's version)
//   node tools/build.mjs --notes v1.2.0   print that version's section of HEAD's CHANGELOG.md
//
// Every file in the tree must be either shipped or excluded below; a file that is
// neither, a shipped file nothing refers to, or a reference to a file that isn't
// shipped stops the build.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The folder the zip unpacks to. Chrome keeps an unpacked extension's data by its
// folder, so an update replaces this folder's contents in place.
export const TOP = 'arkivet2fs';

const SHIP = [
  /^manifest\.json$/,
  /^_locales\/[a-z_A-Z]+\/messages\.json$/,
  /^[a-z_0-9]+\.(js|html|css)$/,
  /^icons\/icon(\d+\.png|32\.svg)$/,
  /^(LICENSE|README\.md)$/
];
const EXCLUDE = [
  /^(tests|tools|platform|keys|docs|\.github)\//,
  /^\.gitignore$/,
  /^package(-lock)?\.json$/,
  /^icons\/(banner\.|icon\d+\.svg$)/, // the SVGs the PNGs are drawn from
  /^(CLAUDE|plan|release-plan|ai_prompt|citation|SECURITY|CHANGELOG)\.md$/
];
// Shipped without a reference from the code: the browser reads them by convention
const UNREFERENCED_OK = [/^manifest\.json$/, /^_locales\//, /^(LICENSE|README\.md)$/];

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 << 20, ...opts });
}

// [{path, mode, sha}] of every blob in the ref's tree
export function treeFiles(ref) {
  return git(['ls-tree', '-r', '-z', '--full-tree', ref]).toString('utf8').split('\0').filter(Boolean).map((line) => {
    const [meta, file] = line.split('\t');
    const [mode, type, sha] = meta.split(' ');
    return { path: file, mode, type, sha };
  });
}

// Which of the tree's paths ship; throws on a path no rule covers
export function selectFiles(paths) {
  // the shipping rules win, so icon32.svg ships though the other SVGs don't
  const unknown = paths.filter((p) => !SHIP.some((r) => r.test(p)) && !EXCLUDE.some((r) => r.test(p)));
  if (unknown.length) throw new Error('Neither shipped nor excluded (add a rule in tools/build.mjs): ' + unknown.join(', '));
  return paths.filter((p) => SHIP.some((r) => r.test(p))).sort();
}

// The tree paths a file names: the manifest's strings, HTML src/href, and quoted
// paths in scripts (importScripts, executeScript files, getURL)
export function references(file, text, known) {
  const found = new Set();
  const add = (s) => { const p = s.replace(/^\.?\//, ''); if (known.has(p)) found.add(p); };
  if (file === 'manifest.json') {
    const walk = (v) => { if (typeof v === 'string') add(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(JSON.parse(text));
  } else if (file.endsWith('.html')) {
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) add(m[1]);
  } else if (file.endsWith('.js')) {
    for (const m of text.matchAll(/['"`]([\w./-]+\.(?:js|html|css|png|svg|json))['"`]/g)) add(m[1]);
  } else if (file.endsWith('.css')) {
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(m[1]);
  }
  return found;
}

export function checkReferences(files) {
  const shipped = new Set(files.keys());
  const referenced = new Set();
  const problems = [];
  for (const [file, data] of files) {
    if (!/\.(json|html|js|css)$/.test(file) || file.startsWith('_locales/')) continue;
    const text = data.toString('utf8');
    for (const p of references(file, text, shipped)) referenced.add(p);
    // a reference to a path that isn't shipped (only the obvious kinds, to avoid noise)
    if (file === 'manifest.json' || file.endsWith('.html')) {
      const all = file === 'manifest.json'
        ? [...JSON.stringify(JSON.parse(text)).matchAll(/"([\w./-]+\.(?:js|html|css|png|svg))"/g)].map((m) => m[1])
        : [...text.matchAll(/\s(?:src|href)="([^":#?]+)"/g)].map((m) => m[1]);
      for (const p of all) if (!shipped.has(p.replace(/^\.?\//, ''))) problems.push(`${file} refers to ${p}, which isn't shipped`);
    }
  }
  for (const p of shipped) {
    if (!referenced.has(p) && !UNREFERENCED_OK.some((r) => r.test(p))) problems.push(`${p} is shipped but nothing refers to it`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
}

// ---- zip (stored entries, no compression: the same input always gives the same bytes)

function dosTime(seconds) {
  const d = new Date(seconds * 1000);
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate()
  };
}

// entries: [{name, data}] in the order given; mtime in Unix seconds
export function makeZip(entries, mtime) {
  const { time, date } = dosTime(mtime);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(10, 4); // version needed: 1.0 (stored)
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, 2.0
    central.writeUInt16LE(10, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // a regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// [{name, data}] of a zip makeZip() wrote (stored entries only)
export function readZip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(endAt + 10);
  let at = buf.readUInt32LE(endAt + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
    if (buf.readUInt16LE(at + 10) !== 0) throw new Error('compressed entry');
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out.push({ name, data: buf.subarray(start, start + size) });
    at += 46 + nameLen + extra;
  }
  return out;
}

// ---- the build

export function version(ref) {
  return JSON.parse(git(['show', `${ref}:manifest.json`]).toString('utf8')).version;
}

// A release tag must be annotated, vX.Y.Z, and name the manifest's version
export function checkTag(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`${tag} isn't a vX.Y.Z tag`);
  const type = git(['cat-file', '-t', `refs/tags/${tag}`]).toString().trim();
  if (type !== 'tag') throw new Error(`${tag} isn't an annotated tag`);
  const v = version(`${tag}^{commit}`);
  if ('v' + v !== tag) throw new Error(`${tag} doesn't match manifest.json's version ${v}`);
}

// {name, data, version, files} of the chromium package of a ref
export function buildChromium(ref) {
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const tree = treeFiles(commit);
  const odd = tree.filter((f) => f.type !== 'blob' || !/^100(644|755)$/.test(f.mode));
  if (odd.length) throw new Error('Not plain files: ' + odd.map((f) => f.path).join(', '));
  const shipped = selectFiles(tree.map((f) => f.path));
  const sha = Object.fromEntries(tree.map((f) => [f.path, f.sha]));
  const files = new Map(shipped.map((p) => [p, git(['cat-file', 'blob', sha[p]])]));
  checkReferences(files);
  const v = version(commit);
  const mtime = Number(git(['show', '-s', '--format=%ct', commit]).toString().trim());
  const data = makeZip(shipped.map((p) => ({ name: `${TOP}/${p}`, data: files.get(p) })), mtime);
  return { name: `arkivet2fs-${v}-chromium.zip`, data, version: v, commit, files: shipped };
}

// Every package of a ref (one for now; Firefox and others come later)
export function buildAll(ref) {
  return [buildChromium(ref)];
}

// The "## X.Y.Z" section of CHANGELOG.md at a ref, without its heading
export function changelogSection(text, v) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^## \\[?${v.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(l));
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${v}`);
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = unwrap(lines.slice(start + 1, end)).join('\n').trim();
  if (!body) throw new Error(`CHANGELOG.md's section for ${v} is empty`);
  return body + '\n';
}

// Joins the wrapped lines of a paragraph or list item: GitHub shows each line break
// in release notes as one
export function unwrap(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out.length ? out[out.length - 1] : '';
    const starts = /^\s*([-*+] |\d+\. |#|```|>)/.test(line);
    if (line.trim() && prev.trim() && !starts && !/^```/.test(prev)) out[out.length - 1] = prev.replace(/\s+$/, '') + ' ' + line.trim();
    else out.push(line);
  }
  return out;
}

function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; };
  const notes = opt('--notes');
  if (notes) {
    checkTag(notes);
    // from HEAD's CHANGELOG.md, so a release drafted later for an older tag gets notes too
    process.stdout.write(changelogSection(git(['show', 'HEAD:CHANGELOG.md']).toString('utf8'), notes.slice(1)));
    return;
  }
  const tag = opt('--tag');
  if (tag) checkTag(tag);
  const ref = tag ? `${tag}^{commit}` : opt('--ref') || 'HEAD';
  const out = path.resolve(opt('--out') || path.join(ROOT, 'dist'));
  fs.mkdirSync(out, { recursive: true });
  for (const pkg of buildAll(ref)) {
    fs.writeFileSync(path.join(out, pkg.name), pkg.data);
    console.log(`${path.join(out, pkg.name)}: ${pkg.files.length} files, ${pkg.data.length} bytes, ${pkg.commit.slice(0, 7)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('build: ' + e.message); process.exit(1); }
}
