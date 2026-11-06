// tools/: the release build (which files ship, a reproducible zip), the signatures and
// tools/verify.sh. The build reads git, so these run in a clone.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const tools = Promise.all([import('../tools/build.mjs'), import('../tools/sign.mjs')]);

test('selectFiles(): the extension ships; docs, tests and tools stay out; anything else stops the build', async () => {
  const [b] = await tools;
  const shipped = b.selectFiles(['manifest.json', 'background.js', 'search.html', 'search.css', 'LICENSE', 'README.md',
    '_locales/en/messages.json', 'icons/icon16.png', 'icons/icon32.svg', 'icons/icon16.svg', 'icons/banner.png',
    'icons/banner.html', 'tests/harness.js', 'tools/build.mjs', 'keys/release.pub', '.github/workflows/ci.yml',
    'package.json', 'package-lock.json', 'CLAUDE.md', 'CHANGELOG.md', 'SECURITY.md', '.gitignore']);
  assert.deepEqual(shipped, ['LICENSE', 'README.md', '_locales/en/messages.json', 'background.js', 'icons/icon16.png',
    'icons/icon32.svg', 'manifest.json', 'search.css', 'search.html']);
  assert.throws(() => b.selectFiles(['manifest.json', 'notes.txt', 'docs/x.md']), /Neither shipped nor excluded.*notes\.txt, docs\/x\.md/);
});

test('checkReferences(): every shipped file is used, and every file a page or the manifest names is shipped', async () => {
  const [b] = await tools;
  const files = (o) => new Map(Object.entries(o).map(([k, v]) => [k, Buffer.from(v)]));
  const manifest = JSON.stringify({ background: { service_worker: 'background.js' }, icons: { 16: 'icons/icon16.png' } });
  const ok = files({ 'manifest.json': manifest, 'background.js': "importScripts('a.js'); chrome.runtime.getURL('p.html')",
    'a.js': '', 'p.html': '<script src="b.js"></script><link href="p.css">', 'b.js': '', 'p.css': '', 'icons/icon16.png': '' });
  b.checkReferences(ok);
  assert.throws(() => b.checkReferences(files({ 'manifest.json': manifest, 'background.js': '', 'icons/icon16.png': '', 'stray.js': '' })),
    /stray\.js is shipped but nothing refers to it/);
  assert.throws(() => b.checkReferences(files({ 'manifest.json': manifest, 'background.js': "getURL('p.html')", 'icons/icon16.png': '',
    'p.html': '<script src="gone.js"></script>' })), /p\.html refers to gone\.js, which isn't shipped/);
});

test('makeZip(): the same entries give the same bytes, and readZip() gives them back', async () => {
  const [b] = await tools;
  const entries = [{ name: 'arkivet2fs/a.txt', data: Buffer.from('å\n') }, { name: 'arkivet2fs/d/b.bin', data: Buffer.from([0, 255, 7]) }];
  const one = b.makeZip(entries, 1762470000);
  assert.ok(one.equals(b.makeZip(entries, 1762470000)));
  assert.ok(!one.equals(b.makeZip(entries, 1762480000)), 'the time is in the zip');
  assert.deepEqual(b.readZip(one).map((e) => [e.name, [...e.data]]), entries.map((e) => [e.name, [...e.data]]));
});

test('makeZip(): other zip readers read it', async (t) => {
  const [b] = await tools;
  const py = ['python3', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(i.filename+" "+str(i.file_size)+" "+oct(i.external_attr>>16) for i in z.infolist()))'];
  try { execFileSync(py[0], ['--version'], { stdio: 'ignore' }); } catch { return t.skip('no python3'); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkivet2fs-zip-'));
  const file = path.join(dir, 'x.zip');
  fs.writeFileSync(file, b.makeZip([{ name: 'arkivet2fs/manifest.json', data: Buffer.from('{}') }], 1762470000));
  assert.equal(execFileSync(py[0], [py[1], py[2], file]).toString().trim(), 'arkivet2fs/manifest.json 2 0o100644');
  fs.rmSync(dir, { recursive: true });
});

test('buildChromium(): HEAD builds, unpacks to arkivet2fs/, holds the committed files, the same twice', async () => {
  const [b] = await tools;
  const pkg = b.buildChromium('HEAD');
  const version = JSON.parse(execFileSync('git', ['show', 'HEAD:manifest.json'], { cwd: ROOT })).version;
  assert.equal(pkg.name, `arkivet2fs-${version}-chromium.zip`);
  assert.ok(pkg.data.equals(b.buildChromium('HEAD').data));
  const entries = b.readZip(pkg.data);
  assert.ok(entries.every((e) => e.name.startsWith('arkivet2fs/')));
  const names = entries.map((e) => e.name.slice('arkivet2fs/'.length));
  for (const f of ['manifest.json', 'background.js', 'search.html', 'linker.html', 'da_record.js', 'fs_attach.js', 'icons/icon128.png', 'LICENSE']) {
    assert.ok(names.includes(f), f);
  }
  for (const f of names) assert.ok(!/^(tests|tools|\.github)\//.test(f) && !/package|banner/.test(f), f);
  const manifest = entries.find((e) => e.name === 'arkivet2fs/manifest.json').data;
  assert.ok(manifest.equals(execFileSync('git', ['show', 'HEAD:manifest.json'], { cwd: ROOT })));
});

test('changelogSection(): a version\'s notes; CHANGELOG.md has the manifest\'s version', async () => {
  const [b] = await tools;
  const text = '# Changelog\n\n## 1.2.0 - 2026-12-01\n\n- New\n\n## 1.1.9\n\n- Old\n';
  assert.equal(b.changelogSection(text, '1.2.0'), '- New\n');
  assert.equal(b.changelogSection(text, '1.1.9'), '- Old\n');
  assert.throws(() => b.changelogSection(text, '1.2'), /no section for 1\.2/);
  // GitHub shows a line break in release notes as one, so wrapped lines are joined
  assert.equal(b.changelogSection('## 2.0.0\n\n- A long\n  item\n- Next\n  - sub\n\nA para\ngraph.\n', '2.0.0'),
    '- A long item\n- Next\n  - sub\n\nA para graph.\n');
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
  assert.ok(b.changelogSection(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version));
});

test('signatureFiles(): a .sig per package, SHA256SUMS of all, all verifying; a changed byte doesn\'t', async () => {
  const [, s] = await tools;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const pkg = { name: 'arkivet2fs-9.9.9-chromium.zip', data: Buffer.from('a package') };
  const out = Object.fromEntries(s.signatureFiles([pkg], privateKey).map((f) => [f.name, f.data]));
  assert.deepEqual(Object.keys(out), [pkg.name + '.sig', 'SHA256SUMS', 'SHA256SUMS.sig']);
  assert.ok(s.verify(pkg.data, out[pkg.name + '.sig'], publicKey));
  assert.ok(s.verify(out.SHA256SUMS, out['SHA256SUMS.sig'], publicKey));
  assert.ok(!s.verify(Buffer.from('a packagf'), out[pkg.name + '.sig'], publicKey));
  assert.ok(!s.verify(pkg.data, out[pkg.name + '.sig'], crypto.generateKeyPairSync('ed25519').publicKey), 'another key');
  const sums = out.SHA256SUMS.toString().trim().split('\n');
  assert.deepEqual(sums.map((l) => l.split('  ')[1]), [pkg.name, pkg.name + '.sig']);
  assert.equal(sums[0].split('  ')[0], crypto.createHash('sha256').update(pkg.data).digest('hex'));
});

test('tools/verify.sh: accepts a signed package, refuses a changed one', async (t) => {
  const [, s] = await tools;
  let version = '';
  try { version = execFileSync('openssl', ['version']).toString(); } catch { /* none */ }
  if (!/^OpenSSL [3-9]/.test(version)) return t.skip('needs OpenSSL 3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkivet2fs-verify-'));
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(path.join(dir, 'test.pub'), publicKey.export({ type: 'spki', format: 'pem' }));
  const pkg = { name: 'arkivet2fs-9.9.9-chromium.zip', data: crypto.randomBytes(5000) };
  fs.writeFileSync(path.join(dir, pkg.name), pkg.data);
  for (const f of s.signatureFiles([pkg], privateKey)) fs.writeFileSync(path.join(dir, f.name), f.data);
  const run = () => execFileSync('sh', [path.join(ROOT, 'tools', 'verify.sh'), path.join(dir, pkg.name), path.join(dir, 'test.pub')], { stdio: 'pipe' }).toString();
  assert.match(run(), new RegExp(`Key: SHA-256 ${s.fingerprint(publicKey)}[^]*OK: .* is signed[^]*OK: SHA256SUMS is signed`));
  const changed = Buffer.from(pkg.data);
  changed[2500] ^= 1;
  fs.writeFileSync(path.join(dir, pkg.name), changed);
  assert.throws(run, (e) => /BAD: .* does not match its signature/.test(e.stderr.toString()));
  fs.rmSync(dir, { recursive: true });
});
