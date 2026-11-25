// tools/: the release build (which files ship, a reproducible zip), the signatures,
// tools/verify.sh and the store uploads (stores.mjs, against fake stores). The build
// reads git, so these run in a clone.
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
const stores = import('../tools/stores.mjs');

test('selectFiles(): the extension ships; docs, tests and tools stay out; anything else stops the build', async () => {
  const [b] = await tools;
  const shipped = b.selectFiles(['manifest.json', 'background.js', 'search.html', 'search.css', 'LICENSE', 'README.md',
    '_locales/en/messages.json', 'icons/icon16.png', 'icons/icon32.svg', 'icons/icon16.svg', 'icons/banner.png',
    'icons/banner.html', 'tests/harness.js', 'tools/build.mjs', 'keys/release.pub', '.github/workflows/ci.yml',
    'package.json', 'package-lock.json', 'CLAUDE.md', 'CHANGELOG.md', 'SECURITY.md', '.gitignore', 'docs/guide.md', 'relay/worker.mjs', 'relay/wrangler.toml',
    'PRIVACY.md', 'store/listing.md', 'store/review.md']);
  assert.deepEqual(shipped, ['LICENSE', 'README.md', '_locales/en/messages.json', 'background.js', 'icons/icon16.png',
    'icons/icon32.svg', 'manifest.json', 'search.css', 'search.html']);
  assert.throws(() => b.selectFiles(['manifest.json', 'notes.txt', 'shop/x.md']), /Neither shipped nor excluded.*notes\.txt, shop\/x\.md/);
});

test('placeholders(): a release tag waits for the relay\'s address', async () => {
  const [b] = await tools;
  assert.deepEqual(b.placeholders("return 'https://arkivet2fs-relay.REPLACE-SUBDOMAIN.workers.dev/report';"), ['REPLACE-SUBDOMAIN']);
  assert.deepEqual(b.placeholders("return 'https://arkivet2fs-relay.someone.workers.dev/report';"), []);
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

test('buildPackage(): the one package, manifest.json at the zip\'s root, the committed files, the same twice', async () => {
  const [b] = await tools;
  const pkg = b.buildPackage('HEAD');
  const version = JSON.parse(execFileSync('git', ['show', 'HEAD:manifest.json'], { cwd: ROOT })).version;
  assert.equal(pkg.name, `arkivet2fs-${version}.zip`);
  assert.ok(pkg.data.equals(b.buildPackage('HEAD').data));
  const entries = b.readZip(pkg.data);
  // the stores' upload (AMO refuses a manifest.json inside a folder) and the unpacked install
  assert.ok(entries.every((e) => !e.name.startsWith('arkivet2fs/')));
  const names = entries.map((e) => e.name);
  for (const f of ['manifest.json', 'background.js', 'search.html', 'linker.html', 'da_record.js', 'fs_attach.js', 'icons/icon128.png', 'LICENSE']) {
    assert.ok(names.includes(f), f);
  }
  for (const f of names) assert.ok(!/^(tests|tools|\.github)\//.test(f) && !/package|banner/.test(f), f);
  const manifest = entries.find((e) => e.name === 'manifest.json').data;
  assert.ok(manifest.equals(execFileSync('git', ['show', 'HEAD:manifest.json'], { cwd: ROOT })));
});

test('buildAll(): one package for the stores and the unpacked install', async () => {
  const [b] = await tools;
  const version = JSON.parse(execFileSync('git', ['show', 'HEAD:manifest.json'], { cwd: ROOT })).version;
  const all = b.buildAll('HEAD');
  assert.deepEqual(all.map((p) => p.name), [`arkivet2fs-${version}.zip`]);
  assert.ok(all[0].data.equals(b.buildPackage('HEAD').data));
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
  const pkg = { name: 'arkivet2fs-9.9.9.zip', data: Buffer.from('a package') };
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
  const pkg = { name: 'arkivet2fs-9.9.9.zip', data: crypto.randomBytes(5000) };
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

test('tools/release: a published release is downloaded to a temporary folder, checked, and the folder removed', async (t) => {
  const [, s] = await tools;
  let version = '';
  try { version = execFileSync('openssl', ['version']).toString(); execFileSync('curl', ['--version'], { stdio: 'ignore' }); } catch { /* none */ }
  if (!/^OpenSSL [3-9]/.test(version)) return t.skip('needs OpenSSL 3 and curl');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkivet2fs-release-'));
  const releases = path.join(dir, 'releases');
  const files = path.join(releases, 'download', 'v9.9.9');
  const tmp = path.join(dir, 'tmp');
  fs.mkdirSync(files, { recursive: true });
  fs.mkdirSync(tmp);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(path.join(dir, 'test.pub'), publicKey.export({ type: 'spki', format: 'pem' }));
  const pkg = { name: 'arkivet2fs-9.9.9.zip', data: crypto.randomBytes(5000) };
  fs.writeFileSync(path.join(files, pkg.name), pkg.data);
  for (const f of s.signatureFiles([pkg], privateKey)) fs.writeFileSync(path.join(files, f.name), f.data);
  // without gh (ARKIVET2FS_RELEASES), only a published release is seen: the check alone
  const run = (...args) => execFileSync('sh', [path.join(ROOT, 'tools', 'release'), 'v9.9.9', '--key', path.join(dir, 'test.pub'), ...args],
    { stdio: 'pipe', env: { ...process.env, ARKIVET2FS_RELEASES: 'file://' + releases, TMPDIR: tmp } }).toString();

  const out = run('--keep', path.join(dir, 'kept'));
  assert.match(out, new RegExp(`Key: SHA-256 ${s.fingerprint(publicKey)}[^]*OK: ${pkg.name} is signed[^]*OK: SHA256SUMS is signed[^]*All good: v9.9.9`));
  assert.doesNotMatch(out, /Sign|Publish/);
  assert.deepEqual(fs.readdirSync(tmp), [], 'the temporary folder is removed');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'kept')).sort(), [pkg.name, pkg.name + '.sig']);
  assert.ok(fs.readFileSync(path.join(dir, 'kept', pkg.name)).equals(pkg.data));

  const changed = Buffer.from(pkg.data);
  changed[2500] ^= 1;
  fs.writeFileSync(path.join(files, pkg.name), changed);
  assert.throws(() => run(), (e) => /BAD: .* does not match its signature/.test(e.stderr.toString()));
  assert.deepEqual(fs.readdirSync(tmp), [], 'removed after a failure too');
  fs.rmSync(path.join(files, 'SHA256SUMS.sig'));
  assert.throws(() => run(), (e) => /can't download SHA256SUMS\.sig/.test(e.stderr.toString()));
  assert.throws(() => run('v1'), (e) => /unknown argument v1/.test(e.stderr.toString()));
  fs.rmSync(dir, { recursive: true });
});

// A fake store: answers fetch() from handlers by "METHOD path" and records each request
function fakeStore(handlers) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const key = (opts.method || 'GET') + ' ' + u.origin + u.pathname;
    calls.push({ key, url, opts });
    const handler = handlers[key];
    if (!handler) return new Response(JSON.stringify({ error: { message: 'no such fake: ' + key } }), { status: 404 });
    const [status, body] = await handler(opts, calls.filter((c) => c.key === key).length);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

const storeDeps = (fetch, more = {}) => ({ fetch, now: () => 1_800_000_000_000, nonce: () => 'nonce-' + Math.random(), sleep: async () => {}, log: () => {}, ...more });

function jwtParts(token) {
  const [h, c, sig] = token.split('.');
  return { header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(c, 'base64url')), data: h + '.' + c, sig: Buffer.from(sig, 'base64url') };
}

test('stores.mjs: Google\'s service account JWT (RS256, the store\'s scope, an hour) and AMO\'s (HS256, a minute)', async () => {
  const st = await stores;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { client_email: 'release@test.iam.gserviceaccount.com', private_key_id: 'k1', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const g = jwtParts(st.googleAssertion(account, 1_800_000_000_500));
  assert.deepEqual(g.header, { alg: 'RS256', typ: 'JWT', kid: 'k1' });
  assert.deepEqual(g.claims, { iss: account.client_email, scope: 'https://www.googleapis.com/auth/chromewebstore', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600 });
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(g.data), publicKey, g.sig));

  const a = jwtParts(st.amoToken('user:1:2', 'the-secret', 1_800_000_000_000, 'n1'));
  assert.deepEqual(a.header, { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(a.claims, { iss: 'user:1:2', jti: 'n1', iat: 1_800_000_000, exp: 1_800_000_060 });
  assert.ok(a.sig.equals(crypto.createHmac('sha256', 'the-secret').update(a.data).digest()));
});

test('stores.mjs: stores.json and the service account key must be the owner\'s alone; a store left out isn\'t set up', async (t) => {
  if (process.platform === 'win32') return t.skip('no file modes');
  const st = await stores;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkivet2fs-stores-'));
  const file = path.join(dir, 'stores.json');
  const key = path.join(dir, 'sa.json');
  fs.writeFileSync(file, JSON.stringify({ chrome: { publisher: 'pub', item: 'item', serviceAccount: 'sa.json' } }), { mode: 0o600 });
  fs.writeFileSync(key, JSON.stringify({ client_email: 'a@b', private_key: 'PEM' }), { mode: 0o644 });
  assert.equal(st.storeConfig(path.join(dir, 'none.json'), 'chrome'), null);
  assert.equal(st.storeConfig(file, 'firefox'), null);
  assert.throws(() => st.storeConfig(file, 'chrome'), /sa\.json can be read by others; chmod 600/);
  fs.chmodSync(key, 0o600);
  assert.deepEqual(st.storeConfig(file, 'chrome'), { publisher: 'pub', item: 'item', account: { client_email: 'a@b', private_key: 'PEM' } });
  fs.chmodSync(file, 0o640);
  assert.throws(() => st.storeConfig(file, 'chrome'), /stores\.json can be read by others/);
  fs.writeFileSync(file, JSON.stringify({ firefox: { issuer: 'user:1' } }), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  assert.throws(() => st.storeConfig(file, 'firefox'), /"firefox" needs secret, addon/);
  fs.rmSync(dir, { recursive: true });
});

test('stores.mjs: Chrome: signs in, uploads the zip, waits while it\'s processed, submits it to go live once approved', async () => {
  const st = await stores;
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const c = { publisher: 'pub-1', item: 'item-1', account: { client_email: 'release@test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) } };
  const item = 'https://chromewebstore.googleapis.com/v2/publishers/pub-1/items/item-1';
  const zip = Buffer.from('the zip');
  const store = fakeStore({
    'POST https://oauth2.googleapis.com/token': (opts) => {
      const body = new URLSearchParams(opts.body);
      assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      assert.equal(jwtParts(body.get('assertion')).claims.iss, 'release@test');
      return [200, { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 }];
    },
    'POST https://chromewebstore.googleapis.com/upload/v2/publishers/pub-1/items/item-1:upload': (opts) => {
      assert.ok(opts.body.equals(zip));
      return [200, { itemId: 'item-1', uploadState: 'IN_PROGRESS' }];
    },
    [`GET ${item}:fetchStatus`]: (opts, n) => [200, { lastAsyncUploadState: n < 2 ? 'IN_PROGRESS' : 'SUCCEEDED' }],
    [`POST ${item}:publish`]: (opts) => {
      assert.deepEqual(JSON.parse(opts.body), { publishType: 'DEFAULT_PUBLISH' });
      return [200, { state: 'PENDING_REVIEW', warningInfo: { warnings: [{ reason: 'R', description: 'a warning' }] } }];
    },
  });
  const log = [];
  assert.equal(await st.chromeUpload(c, zip, '1.8.2', storeDeps(store.fetch, { log: (l) => log.push(l) })), 'PENDING_REVIEW');
  assert.deepEqual(store.calls.map((x) => x.key.replace(/^(\w+) https:\/\/[^/]+/, '$1 ')), [
    'POST /token', 'POST /upload/v2/publishers/pub-1/items/item-1:upload',
    'GET /v2/publishers/pub-1/items/item-1:fetchStatus', 'GET /v2/publishers/pub-1/items/item-1:fetchStatus', 'POST /v2/publishers/pub-1/items/item-1:publish']);
  assert.ok(store.calls.slice(1).every((x) => x.opts.headers.Authorization === 'Bearer tok'));
  assert.match(log.join('\n'), /Warning: R: a warning/);
  assert.doesNotMatch(log.join('\n'), /tok\b|BEGIN/, 'no secret is printed');

  const failed = fakeStore({
    'POST https://oauth2.googleapis.com/token': () => [200, { access_token: 'tok' }],
    'POST https://chromewebstore.googleapis.com/upload/v2/publishers/pub-1/items/item-1:upload': () => [200, { uploadState: 'FAILED' }],
  });
  await assert.rejects(st.chromeUpload(c, zip, '1.8.2', storeDeps(failed.fetch)), /did not take the package \(upload FAILED\)/);
  assert.ok(!failed.calls.some((x) => /:publish/.test(x.key)), 'nothing submitted');
  const refused = fakeStore({ 'POST https://oauth2.googleapis.com/token': () => [400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }] });
  await assert.rejects(st.chromeUpload(c, zip, '1.8.2', storeDeps(refused.fetch)), /Google sign-in for the service account: HTTP 400 \(invalid_grant: Invalid JWT Signature\.\)/);

  // has: a version submitted or published, this one or newer; a rejected one doesn't count
  const status = (body) => fakeStore({ 'POST https://oauth2.googleapis.com/token': () => [200, { access_token: 'tok' }], [`GET ${item}:fetchStatus`]: () => [200, body] });
  const has = async (body, v) => st.chromeHas(c, v, storeDeps(status(body).fetch));
  const live = { publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ deployPercentage: 100, crxVersion: '1.8.1' }] } };
  assert.deepEqual(await has(live, '1.8.2'), { has: false, text: 'the Chrome Web Store has 1.8.1 (live)' });
  assert.equal((await has(live, '1.8.1')).has, true);
  assert.equal((await has(live, '1.7.0')).has, true);
  assert.equal((await has({ ...live, submittedItemRevisionStatus: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '1.8.2' }] } }, '1.8.2')).has, true);
  assert.equal((await has({ ...live, submittedItemRevisionStatus: { state: 'REJECTED', distributionChannels: [{ crxVersion: '1.8.2' }] } }, '1.8.2')).has, false);
});

test('stores.mjs: Firefox: uploads to the listed channel, waits for the validation, makes the version with the notes', async () => {
  const st = await stores;
  const f = { issuer: 'user:1:2', secret: 's3cret', addon: 'arkivet2fs@dude4linux' };
  const zip = Buffer.from('the zip');
  const addon = 'https://addons.mozilla.org/api/v5/addons/addon/arkivet2fs%40dude4linux';
  const store = fakeStore({
    'POST https://addons.mozilla.org/api/v5/addons/upload/': async (opts) => {
      assert.equal(opts.body.get('channel'), 'listed');
      assert.equal(opts.body.get('upload').name, 'arkivet2fs-1.8.2.zip');
      assert.ok(Buffer.from(await opts.body.get('upload').arrayBuffer()).equals(zip));
      return [201, { uuid: 'u-1', processed: false }];
    },
    'GET https://addons.mozilla.org/api/v5/addons/upload/u-1/': (opts, n) => [200, n < 2 ? { uuid: 'u-1', processed: false } : { uuid: 'u-1', processed: true, valid: true, version: '1.8.2' }],
    [`POST ${addon}/versions/`]: (opts) => {
      assert.deepEqual(JSON.parse(opts.body), { upload: 'u-1', release_notes: { 'en-US': 'Fixes' } });
      return [201, { id: 7, version: '1.8.2', file: { status: 'unreviewed' } }];
    },
  });
  assert.equal(await st.firefoxUpload(f, zip, '1.8.2', 'Fixes', storeDeps(store.fetch)), 'unreviewed');
  assert.equal(store.calls.length, 4);
  for (const call of store.calls) {
    const { claims, data, sig } = jwtParts(call.opts.headers.Authorization.replace(/^JWT /, ''));
    assert.equal(claims.iss, 'user:1:2');
    assert.ok(sig.equals(crypto.createHmac('sha256', 's3cret').update(data).digest()));
  }
  assert.equal(new Set(store.calls.map((c) => jwtParts(c.opts.headers.Authorization.slice(4)).claims.jti)).size, 4, 'a new token for each request');

  const invalid = fakeStore({
    'POST https://addons.mozilla.org/api/v5/addons/upload/': () => [201, { uuid: 'u-2', processed: true, valid: false, validation: { messages: [{ type: 'warning', message: 'meh' }, { type: 'error', message: 'Bad manifest', file: 'manifest.json' }] } }],
  });
  await assert.rejects(st.firefoxUpload(f, zip, '1.8.2', '', storeDeps(invalid.fetch)), /refused the package:\n- Bad manifest manifest\.json$/);
  assert.equal(invalid.calls.length, 1, 'no version made');

  const has = (status, body) => st.firefoxHas(f, '1.8.2', storeDeps(fakeStore({ [`GET ${addon}/versions/1.8.2/`]: () => [status, body] }).fetch));
  assert.deepEqual(await has(404, { detail: 'Not found.' }), { has: false, text: 'Firefox Add-ons hasn\'t 1.8.2' });
  assert.deepEqual(await has(200, { version: '1.8.2', file: { status: 'unreviewed' } }), { has: true, text: 'Firefox Add-ons has 1.8.2 (in review)' });
  await assert.rejects(has(401, { detail: 'Incorrect authentication credentials.' }), /HTTP 401 \(Incorrect authentication credentials\.\)/);
});

test('stores.mjs: the command sends only the package of the tag\'s version; notes without Markdown', async (t) => {
  if (process.platform === 'win32') return t.skip('no file modes');
  const [b, , st] = await Promise.all([...(await tools), stores]);
  assert.equal(st.storeNotes('- **Places** as `written`\n'), '- Places as written');
  // Longer than AMO takes (3000): one line per item, the link to the whole notes
  const long = [
    '- **Marriages attached to the couple:** ' + 'a marriage\'s source goes to the couple. '.repeat(10),
    '- Names are read by one set of rules everywhere: ' + 'a patronymic in any form. '.repeat(10),
    '- **"ektemann"** is "Husband" in the notes.',
  ].join('\n');
  const link = 'All the changes: https://github.com/Dude4Linux/arkivet2fs/releases/tag/v1.8.3';
  assert.equal(st.storeNotes(long, '1.8.3', 500), [
    '- Marriages attached to the couple',
    '- Names are read by one set of rules everywhere',
    '- "ektemann" is "Husband" in the notes.',
    '', link].join('\n'));
  assert.equal(st.storeNotes(long, '1.8.3', 100 + link.length), '- Marriages attached to the couple\n- Names are read by one set of rules everywhere\n\n' + link, 'items that don\'t fit left out from the end');
  assert.equal(st.storeNotes(long, '1.8.3').length <= 3000, true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkivet2fs-stores-'));
  const zipFile = path.join(dir, 'arkivet2fs-1.8.2.zip');
  fs.writeFileSync(zipFile, b.makeZip([{ name: 'manifest.json', data: Buffer.from('{"version": "1.8.2"}') }], 1_800_000_000));
  assert.equal(st.zipVersion(fs.readFileSync(zipFile)), '1.8.2');
  const env = { ARKIVET2FS_STORES: path.join(dir, 'stores.json') };
  const log = [];
  const deps = storeDeps(async () => { throw new Error('no network in this test'); }, { env, log: (l) => log.push(l), notes: () => '' });
  assert.equal(await st.main(['has', 'chrome', 'v1.8.2'], deps), 3, 'not set up');
  assert.match(log[0], /the Chrome Web Store isn't set up in .*stores\.json/);
  fs.writeFileSync(env.ARKIVET2FS_STORES, JSON.stringify({ firefox: { issuer: 'i', secret: 's', addon: 'a@b' } }), { mode: 0o600 });
  await assert.rejects(st.main(['upload', 'firefox', zipFile, 'v1.8.3'], deps), /is version 1\.8\.2, not 1\.8\.3/);
  await assert.rejects(st.main(['upload', 'opera', zipFile, 'v1.8.2'], deps), /usage/);
  await assert.rejects(st.main(['has', 'firefox', '1.8.2'], deps), /usage/);
  fs.rmSync(dir, { recursive: true });
});

test('site-pages.mjs: docs/privacy.html and docs/guide.html are their Markdown as made by the tool; the Markdown it reads', async () => {
  const { privacyPage, guidePage, policyHtml, inline, anchor } = await import('../tools/site-pages.mjs');
  const markdown = fs.readFileSync(path.join(ROOT, 'PRIVACY.md'), 'utf8');
  // after a change to PRIVACY.md or docs/guide.md: node tools/site-pages.mjs
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs/privacy.html'), 'utf8'), privacyPage(markdown));
  const guide = fs.readFileSync(path.join(ROOT, 'docs/guide.md'), 'utf8');
  const guideHtml = fs.readFileSync(path.join(ROOT, 'docs/guide.html'), 'utf8');
  assert.equal(guideHtml, guidePage(guide));
  // the contents' links lead to the headings, as on GitHub
  const targets = [...guideHtml.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 10);
  for (const id of targets) assert.ok(guideHtml.includes(`id="${id}"`), id);
  assert.equal(anchor("7. Add the record's facts to the tree"), '7-add-the-records-facts-to-the-tree');
  assert.equal(anchor('Søk på «Vågå»'), 'søk-på-vågå');
  assert.equal(inline('See [the **README**](https://example.org/#install?a=1&b), https://example.org/x and [b](#2-two).'),
    'See <a href="https://example.org/#install?a=1&amp;b">the <strong>README</strong></a>, <a href="https://example.org/x">https://example.org/x</a> and <a href="#2-two">b</a>.');
  assert.equal(policyHtml('1. one\n   more\n2. two'), '<ol>\n<li>one more</li>\n<li>two</li>\n</ol>');
  assert.equal(inline('**Send** a `<b>` *Norske* (https://example.org/a?b=1&c)'),
    '<strong>Send</strong> a <code>&lt;b&gt;</code> <em>Norske</em> (<a href="https://example.org/a?b=1&amp;c">https://example.org/a?b=1&amp;c</a>)');
  assert.equal(policyHtml('## In short\n\n- one\n  two\n- three\n\nA\nparagraph.'),
    '<h2 id="in-short">In short</h2>\n\n<ul>\n<li>one two</li>\n<li>three</li>\n</ul>\n\n<p>A paragraph.</p>');
  // every word of the policy is on the page
  const words = (text) => text.replace(/<\/?(a|strong|em|code)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/^\s*- |-{3,}/gm, ' ').replace(/[*`]/g, '').replace(/[|#]/g, ' ').split(/\s+/).filter(Boolean);
  const page = fs.readFileSync(path.join(ROOT, 'docs/privacy.html'), 'utf8');
  const body = page.slice(page.indexOf('<h1>'), page.indexOf('</main>'));
  assert.deepEqual(words(body), words(markdown));
});

test("da-coords.mjs: Wikidata's item of DA's number and name, a successor's name, Kartverket's place over Wikidata's", async () => {
  const { coordinates, table } = await import('../tools/da-coords.mjs');
  const row = (num, label, lon, lat) => ({ num: { value: num }, itemLabel: { value: label }, coord: { value: `Point(${lon} ${lat})` } });
  const { coords, missing } = coordinates(
    { '0515': 'Vågå', '1101': 'Egersund', '1806': 'Svolvær', '0999': 'Nowhere' },
    [row('0515', 'Lom', 8.57, 61.84), row('0515', 'Vågå kommune', 9.1012, 61.8751), row('1101', 'Eigersund', 6.0, 58.45),
      row('1806', 'Narvik', 17.4, 68.4), row('0999', 'Elsewhere', 10, 60)]);
  assert.deepEqual(coords, { '0515': [61.88, 9.1], '1101': [58.45, 6], '1806': [68.24, 14.56] });
  assert.deepEqual(missing, ['0999 Nowhere']);
  assert.equal(table({ '0515': [61.88, 9.1] }), "const DA_COORDS = {\n  '0515': [61.88, 9.10]\n};");
});
