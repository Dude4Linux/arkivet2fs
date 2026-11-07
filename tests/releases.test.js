// The update checker (release-plan.md, Phase 3): releases.js, its part in
// background.js, and update.html. GitHub is a fake (no network); the packages are
// signed with a key made here, standing in for the release key.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load, loadBackground, chromeStub, plain, ROOT } = require('./harness.js');

const REPO = 'Dude4Linux/arkivet2fs';
const API = 'https://api.github.com/repos/' + REPO;

// jsdom has no WebCrypto: Node's, as the browser's
function withCrypto(w) {
  Object.defineProperty(w, 'crypto', { value: crypto.webcrypto, configurable: true });
  return w;
}
function releasesWindow(options) {
  return withCrypto(load(['i18n.js', 'i18n_strings.js', 'releases.js'], options));
}

// A key standing in for the release key, and a package signed with it
const testKey = crypto.generateKeyPairSync('ed25519');
const testPub = testKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const zip = Buffer.from('PK\u0003\u0004 a package of arkivet2fs 1.2.0, made up for the tests');
const zipSig = crypto.sign(null, zip, testKey.privateKey).toString('base64') + '\n';
const zipSha = crypto.createHash('sha256').update(zip).digest('hex');

function releaseJson(version = '1.2.0', more = {}) {
  const name = 'arkivet2fs-' + version + '-chromium.zip';
  return {
    tag_name: 'v' + version,
    html_url: 'https://github.com/' + REPO + '/releases/tag/v' + version,
    draft: false,
    prerelease: false,
    published_at: '2026-11-20T10:00:00Z',
    body: '- Checks for updates once a day.\n  - Only for an unpacked copy.\n- `update.html` <img src=x onerror="alert(1)">',
    assets: [
      { name, size: zip.length, url: API + '/releases/assets/1', digest: 'sha256:' + zipSha },
      { name: name + '.sig', size: zipSig.length, url: API + '/releases/assets/2', digest: '' },
      { name: 'SHA256SUMS', size: 196, url: API + '/releases/assets/3' }
    ],
    ...more
  };
}

function response(status, body, headers = {}) {
  const bytes = typeof body === 'string' || Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(JSON.stringify(body || {}));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name] || headers[name.toLowerCase()] || null },
    json: async () => JSON.parse(bytes.toString()),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
  };
}

// A fake GitHub: the latest release (with its ETag), the two assets, and every request
function fakeGitHub(json = releaseJson(), { sig = zipSig, data = zip } = {}) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const headers = init.headers || {};
    requests.push({ url, headers });
    if (url === API + '/releases/latest') {
      if (!json) return response(404, { message: 'Not Found' });
      if (headers['If-None-Match'] === '"etag-1"') return response(304, '');
      return response(200, json, { ETag: '"etag-1"' });
    }
    if (url === API + '/releases/assets/1' && headers.Accept === 'application/octet-stream') return response(200, data);
    if (url === API + '/releases/assets/2' && headers.Accept === 'application/octet-stream') return response(200, sig);
    return response(404, 'no such thing');
  };
  return { fetch, requests };
}

// chrome.* with a working storage.local, as the service worker and update.html use it
function chromeWith({ installType = 'development', local = {}, version = '1.1.3' } = {}) {
  const chrome = chromeStub(version);
  const store = { ...local };
  const listeners = { message: [], changed: [], clicked: [], alarm: [], notification: [] };
  const calls = { badge: [], notifications: [], tabs: [], alarms: [], reload: 0 };
  chrome.storage.local = {
    async get(keys) {
      const out = {};
      for (const k of [].concat(keys)) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
      return out;
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = JSON.parse(JSON.stringify(v)); }
      for (const fn of listeners.changed) fn(changes, 'local');
    },
    async remove() {}
  };
  chrome.storage.onChanged = { addListener: (fn) => listeners.changed.push(fn) };
  chrome.runtime.onMessage = { addListener: (fn) => listeners.message.push(fn) };
  chrome.runtime.sendMessage = (message) => new Promise((resolve) => {
    let answered = false;
    for (const fn of listeners.message) {
      if (fn(message, { id: 'test' }, (answer) => { answered = true; resolve(answer); }) === true) return;
    }
    if (!answered) resolve(undefined);
  });
  chrome.runtime.reload = () => { calls.reload++; };
  chrome.action.onClicked = { addListener: (fn) => listeners.clicked.push(fn) };
  chrome.action.setBadgeText = async ({ text }) => { calls.badge.push(text); };
  chrome.alarms = {
    async get() { return calls.alarms.length ? calls.alarms[0] : undefined; },
    create(name, info) { calls.alarms.push({ name, ...info }); },
    onAlarm: { addListener: (fn) => listeners.alarm.push(fn) }
  };
  chrome.notifications.create = (id, options) => { calls.notifications.push({ id, ...options }); };
  chrome.notifications.onClicked = { addListener: (fn) => listeners.notification.push(fn) };
  chrome.management = { async getSelf() { return { installType }; } };
  chrome.tabs.create = async (options) => { calls.tabs.push(options); return {}; };
  return { chrome, store, listeners, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test('releaseKey() is keys/release.pub, with the README\'s fingerprint', () => {
  const w = releasesWindow();
  const pem = fs.readFileSync(path.join(ROOT, 'keys', 'release.pub'), 'utf8');
  assert.equal(w.releaseKey(), pem.replace(/-----[A-Z ]+-----|\s/g, ''));
  const der = Buffer.from(w.releaseKey(), 'base64');
  assert.equal(crypto.createHash('sha256').update(der).digest('hex'), w.releaseKeyFingerprint());
  assert.ok(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').includes(w.releaseKeyFingerprint()));
});

test('versions: MAJOR.MINOR.PATCH, compared by number; anything else is no version', () => {
  const w = releasesWindow();
  assert.deepEqual(plain(w.parseVersion('v1.2.0')), [1, 2, 0]);
  assert.equal(w.parseVersion('1.2.0-rc1'), null);
  assert.equal(w.parseVersion('1.2'), null);
  assert.ok(w.compareVersions('1.10.0', '1.9.9') > 0);
  assert.ok(w.compareVersions('v1.1.3', '1.2.0') < 0);
  assert.equal(w.compareVersions('1.2.0', 'v1.2.0'), 0);
  assert.equal(w.compareVersions('1.2.0', 'latest'), null);
  // the developer setting: another repository and version, only when valid
  assert.equal(w.updateRepoOf({ repo: 'someone/arkivet2fs' }), 'someone/arkivet2fs');
  assert.equal(w.updateRepoOf({ repo: 'https://evil.example/x' }), REPO);
  assert.equal(w.currentVersionOf({ version: 'v1.0.0' }, '1.2.0'), '1.0.0');
  assert.equal(w.currentVersionOf({ version: 'old' }, '1.2.0'), '1.2.0');
});

test('readRelease(): the chromium package and its signature; drafts, pre-releases and odd assets are none', () => {
  const w = releasesWindow();
  const r = plain(w.readRelease(releaseJson(), REPO));
  assert.equal(r.version, '1.2.0');
  assert.equal(r.zip.name, 'arkivet2fs-1.2.0-chromium.zip');
  assert.equal(r.zip.size, zip.length);
  assert.equal(r.zip.digest, zipSha);
  assert.equal(r.sig.url, API + '/releases/assets/2');
  assert.equal(r.sig.digest, '');
  assert.equal(r.published, '2026-11-20T10:00:00Z');
  assert.equal(w.readRelease(releaseJson('1.2.0', { draft: true }), REPO), null);
  assert.equal(w.readRelease(releaseJson('1.2.0', { prerelease: true }), REPO), null);
  assert.equal(w.readRelease({ ...releaseJson(), tag_name: 'v1.2.0-rc1' }, REPO), null);
  const noSig = releaseJson();
  noSig.assets = noSig.assets.filter((a) => !a.name.endsWith('.sig'));
  assert.equal(w.readRelease(noSig, REPO), null);
  // an asset somewhere else than this repository's API isn't downloaded
  const elsewhere = releaseJson();
  elsewhere.assets[0].url = 'https://evil.example/arkivet2fs.zip';
  assert.equal(w.readRelease(elsewhere, REPO), null);
  assert.equal(w.readRelease(releaseJson(), 'someone/fork'), null);
});

test('fetchLatestRelease(): the release with its ETag; an unchanged one is a 304; failures keep what was known', async () => {
  const w = releasesWindow();
  const gh = fakeGitHub();
  const first = plain(await w.fetchLatestRelease(REPO, null, gh.fetch, 1000));
  assert.equal(first.release.version, '1.2.0');
  assert.equal(first.etag, '"etag-1"');
  assert.equal(first.checked, 1000);
  assert.equal(first.error, '');
  assert.equal(gh.requests[0].headers['If-None-Match'], undefined);

  const again = plain(await w.fetchLatestRelease(REPO, { ...first, notified: '1.2.0' }, gh.fetch, 2000));
  assert.equal(gh.requests[1].headers['If-None-Match'], '"etag-1"');
  assert.equal(again.release.version, '1.2.0');
  assert.equal(again.notified, '1.2.0');
  assert.equal(again.checked, 2000);

  const refused = plain(await w.fetchLatestRelease(REPO, first, async () => response(403, {}), 3000));
  assert.equal(refused.release.version, '1.2.0');
  assert.match(refused.error, /refused/);
  const down = plain(await w.fetchLatestRelease(REPO, first, async () => { throw new TypeError('Failed to fetch'); }, 3000));
  assert.equal(down.release.version, '1.2.0');
  assert.equal(down.error, 'GitHub could not be reached.');
  const broken = plain(await w.fetchLatestRelease(REPO, first, async () => response(502, ''), 3000));
  assert.equal(broken.error, 'GitHub answered {status}.');
  assert.equal(broken.errorStatus, 502);
  assert.equal(w.t(broken.error, { status: broken.errorStatus }), 'GitHub answered 502.');

  const none = plain(await w.fetchLatestRelease(REPO, null, fakeGitHub(null).fetch, 3000));
  assert.equal(none.release, null);
  assert.equal(none.error, '');
  // another repository (the developer setting) starts afresh, without the old ETag
  const fork = fakeGitHub();
  await w.fetchLatestRelease('someone/fork', first, fork.fetch, 4000);
  assert.equal(fork.requests[0].url, 'https://api.github.com/repos/someone/fork/releases/latest');
  assert.equal(fork.requests[0].headers['If-None-Match'], undefined);
});

test('newerRelease(): only newer than the version in use, not skipped, not put off', () => {
  const w = releasesWindow();
  const state = { release: w.readRelease(releaseJson(), REPO) };
  assert.equal(w.newerRelease(state, '1.1.3', 0, {}).version, '1.2.0');
  assert.equal(w.newerRelease(state, '1.2.0', 0, {}), null);
  assert.equal(w.newerRelease(state, '1.3.0', 0, {}), null);
  assert.equal(w.newerRelease(state, '1.1.3', 0, { skipped: '1.2.0' }), null);
  assert.equal(w.newerRelease(state, '1.1.3', 0, { skipped: '1.1.9' }).version, '1.2.0');
  assert.equal(w.newerRelease(state, '1.1.3', 5, { later: 10 }), null);
  assert.equal(w.newerRelease(state, '1.1.3', 10, { later: 10 }).version, '1.2.0');
  // update.html shows it either way
  assert.equal(w.newerRelease(state, '1.1.3', 0).version, '1.2.0');
  assert.ok(w.updateDue(null, 5));
  assert.ok(!w.updateDue({ checked: 1000 }, 1000 + 3600e3));
  assert.ok(w.updateDue({ checked: 1000 }, 1000 + 23 * 3600e3));
});

test('checkPackage(): saved only with the right size, SHA-256 and signature', async () => {
  const w = releasesWindow();
  const asset = w.readRelease(releaseJson(), REPO).zip;
  const good = await w.checkPackage(zip, zipSig, asset, testPub);
  assert.equal(good.ok, true);
  assert.equal(good.sha256, zipSha);

  const changed = Buffer.from(zip);
  changed[10] ^= 1;
  const noDigest = { ...asset, digest: '' };
  const bad = await w.checkPackage(changed, zipSig, noDigest, testPub);
  assert.equal(bad.ok, false);
  assert.match(bad.problem, /signature does not match/);
  assert.match((await w.checkPackage(changed, zipSig, asset, testPub)).problem, /SHA-256 differs/);
  assert.match((await w.checkPackage(zip.subarray(1), zipSig, asset, testPub)).problem, /size/);
  assert.equal((await w.checkPackage(zip, 'not base64 at all!', asset, testPub)).ok, false);
  assert.equal((await w.checkPackage(zip, Buffer.alloc(64).toString('base64'), asset, testPub)).ok, false);
  // signed with another key than the pinned one
  assert.equal((await w.checkPackage(zip, zipSig, asset)).ok, false);
  // a browser without Ed25519 in WebCrypto says so
  const old = releasesWindow();
  Object.defineProperty(old, 'crypto', { value: { subtle: { ...crypto.webcrypto.subtle, digest: crypto.webcrypto.subtle.digest.bind(crypto.webcrypto.subtle), importKey: async () => { throw new Error('Unrecognized name.'); } } }, configurable: true });
  await assert.rejects(old.checkPackage(zip, zipSig, asset, testPub), (e) => e.unsupported === true);
});

test('notesElement(): lists, sub-items and code, as text only', () => {
  const w = releasesWindow();
  const box = w.notesElement(w.document, releaseJson().body);
  assert.equal(box.querySelectorAll(':scope > ul > li').length, 2);
  assert.equal(box.querySelector('ul ul li').textContent, 'Only for an unpacked copy.');
  assert.equal(box.querySelector('code').textContent, 'update.html');
  assert.equal(box.querySelector('img'), null);
  assert.ok(box.textContent.includes('<img src=x'));
});

test('the service worker: a store install is never checked', async () => {
  const { chrome, calls } = chromeWith({ installType: 'normal' });
  const gh = fakeGitHub();
  loadBackground({ chrome, fetch: gh.fetch });
  await settle();
  assert.equal(gh.requests.length, 0);
  assert.equal(calls.alarms.length, 0);
  assert.equal(calls.notifications.length, 0);
});

test('the service worker: a daily check, a badge and one notification per version', async () => {
  const { chrome, store, listeners, calls } = chromeWith();
  const gh = fakeGitHub();
  const w = loadBackground({ chrome, fetch: gh.fetch });
  await settle();
  assert.equal(gh.requests.length, 1);
  assert.equal(calls.alarms[0].name, 'update-check');
  assert.equal(calls.alarms[0].periodInMinutes, 24 * 60);
  assert.equal(store.update.release.version, '1.2.0');
  assert.equal(calls.badge.at(-1), '↑');
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].id, 'update:1.2.0');
  assert.equal(calls.notifications[0].title, 'arkivet2fs 1.2.0 is out');

  // the alarm within the day asks nothing; the worker starting again doesn't notify again
  listeners.alarm.forEach((fn) => fn({ name: 'update-check' }));
  await settle();
  assert.equal(gh.requests.length, 1);
  const again = chromeWith({ local: store });
  loadBackground({ chrome: again.chrome, fetch: gh.fetch });
  await settle();
  assert.equal(again.calls.notifications.length, 0);
  assert.equal(again.calls.badge.at(-1), '↑');

  // the notification and the icon on a page other than DA open update.html
  listeners.notification.forEach((fn) => fn('update:1.2.0'));
  listeners.clicked.forEach((fn) => fn({ id: 3, index: 0, url: 'https://example.com/' }));
  await settle();
  assert.deepEqual(calls.tabs.map((t) => t.url), ['chrome-extension://test/update.html', 'chrome-extension://test/update.html']);

  // "Skip this version" takes the badge away; "Check now" asks GitHub at once
  await chrome.storage.local.set({ updateChoice: { skipped: '1.2.0' } });
  await settle();
  assert.equal(calls.badge.at(-1), '');
  const answer = await chrome.runtime.sendMessage({ action: 'checkUpdate' });
  assert.equal(answer.state.release.version, '1.2.0');
  assert.equal(gh.requests.length, 2);
  assert.equal(gh.requests[1].headers['If-None-Match'], '"etag-1"');
  assert.ok(w.UPDATE_ALARM === undefined);  // a const, not the window's
});

test('the service worker: the daily check off, the version already in use', async () => {
  const off = chromeWith({ local: { updateCheck: false } });
  const gh = fakeGitHub();
  loadBackground({ chrome: off.chrome, fetch: gh.fetch });
  await settle();
  assert.equal(gh.requests.length, 0);
  assert.equal(off.calls.badge.at(-1), '');

  const current = chromeWith({ version: '1.2.0' });
  loadBackground({ chrome: current.chrome, fetch: gh.fetch });
  await settle();
  assert.equal(gh.requests.length, 1);
  assert.equal(current.calls.badge.at(-1), '');
  assert.equal(current.calls.notifications.length, 0);
  // a non-DA page then gets the error, as before
  current.listeners.clicked.forEach((fn) => fn({ id: 3, index: 0, url: 'https://example.com/' }));
  await settle();
  assert.equal(current.calls.tabs.length, 0);
});

// update.html with its scripts, a chrome stub and the fake GitHub; saving a file is
// caught (jsdom has no blob URLs and doesn't download)
async function updatePage({ installType = 'development', local, gh = fakeGitHub(), lang } = {}) {
  const { chrome, store, calls } = chromeWith({ installType, local });
  const w = load(['i18n.js', 'i18n_strings.js', 'releases.js'], { html: 'update.html', url: 'chrome-extension://test/update.html', chrome, fetch: gh.fetch, lang, fast: true });
  withCrypto(w);
  w.releaseKey = () => testPub;
  const saved = [];
  w.URL.createObjectURL = (blob) => { saved.push({ blob }); return 'blob:test/' + saved.length; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { if (this.download) saved.at(-1).name = this.download; };
  // the service worker answers "Check now"
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'checkUpdate') return false;
    w.fetchLatestRelease(REPO, store.update, gh.fetch, Date.now()).then(async (state) => {
      await chrome.storage.local.set({ update: state });
      sendResponse({ state });
    });
    return true;
  });
  w.runFile('update.js');
  await settle();
  return { w, store, calls, saved, gh, $: (id) => w.document.getElementById(id) };
}

test('update.html: the newer release, a checked download, then how to install it', async () => {
  const p = await updatePage();
  assert.ok(p.$('release').hidden);
  assert.match(p.$('check-status').textContent, /Not checked yet/);
  p.$('check-now').click();
  await settle();
  assert.match(p.$('check-status').textContent, /v\. 1\.2\.0 is out\. Last checked/);
  assert.ok(!p.$('release').hidden);
  assert.equal(p.$('release-title').textContent, 'v. 1.2.0, published 20 November 2026');
  assert.equal(p.$('notes').querySelectorAll('li').length, 3);
  assert.equal(p.$('download').textContent, 'Download arkivet2fs-1.2.0-chromium.zip');
  assert.match(p.$('key-note').textContent, /fingerprint 7642e107/);

  p.$('download').click();
  await settle();
  assert.equal(p.saved.length, 1);
  assert.equal(p.saved[0].name, 'arkivet2fs-1.2.0-chromium.zip');
  assert.equal(p.saved[0].blob.size, zip.length);
  assert.match(p.$('download-status').textContent, /Checked and saved/);
  assert.ok(!p.$('install').hidden);
  p.$('reload').click();
  assert.equal(p.calls.reload, 1);

  p.$('skip').click();
  await settle();
  assert.equal(p.store.updateChoice.skipped, '1.2.0');
  assert.match(p.$('download-status').textContent, /You skipped this version/);
  p.$('later').click();
  await settle();
  assert.ok(p.store.updateChoice.later > Date.now());
  p.$('update-check').click();
  await settle();
  assert.equal(p.store.updateCheck, false);
  assert.match(p.$('check-status').textContent, /The daily check is off/);
});

test('update.html: a broken signature or a changed file is not saved', async () => {
  const badSig = await updatePage({ gh: fakeGitHub(releaseJson(), { sig: Buffer.alloc(64, 1).toString('base64') }) });
  badSig.$('check-now').click();
  await settle();
  badSig.$('download').click();
  await settle();
  assert.equal(badSig.saved.length, 0);
  assert.match(badSig.$('download-status').textContent, /^Not saved: The signature does not match/);
  assert.ok(badSig.$('install').hidden);

  const changed = Buffer.from(zip);
  changed[0] ^= 1;
  const badZip = await updatePage({ gh: fakeGitHub(releaseJson(), { data: changed }) });
  badZip.$('check-now').click();
  await settle();
  badZip.$('download').click();
  await settle();
  assert.equal(badZip.saved.length, 0);
  assert.match(badZip.$('download-status').textContent, /SHA-256 differs/);
});

test('update.html: a store install only shows the version', async () => {
  const p = await updatePage({ installType: 'normal' });
  assert.ok(!p.$('store-note').hidden);
  assert.ok(p.$('checker').hidden);
  assert.ok(p.$('settings').hidden);
  assert.equal(p.gh.requests.length, 0);
  assert.equal(p.$('current').textContent, 'You have arkivet2fs v. 1.1.3.');
});

test('the header link: the version, or the newer release', async () => {
  const release = load(['i18n.js', 'i18n_strings.js', 'releases.js']).readRelease(releaseJson(), REPO);
  const show = async (local, version = '1.1.3') => {
    const { chrome } = chromeWith({ local, version });
    const w = load(['i18n.js', 'i18n_strings.js', 'releases.js'], { html: 'search.html', chrome });
    const link = await w.addVersionLink(w.document.querySelector('.topbar'));
    return link.textContent;
  };
  assert.equal(await show({}), 'v. 1.1.3');
  assert.equal(await show({ update: { release } }), 'v. 1.2.0 is out');
  assert.equal(await show({ update: { release }, updateChoice: { skipped: '1.2.0' } }), 'v. 1.1.3');
  assert.equal(await show({ update: { release }, updateCheck: false }), 'v. 1.1.3');
  assert.equal(await show({ update: { release } }, '1.2.0'), 'v. 1.2.0');
});

test('every text of the update checker is in Bokmål and Nynorsk', async () => {
  const texts = new Set();
  for (const file of ['releases.js', 'update.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/\bt\((['"])((?:\\.|(?!\1).)*)\1/g)) texts.add(m[2].replace(/\\(.)/g, '$1'));
    // the English problems and errors, translated with t() where shown
    for (const m of src.matchAll(/(?:problem|error) = (['"])((?:\\.|(?!\1).)*)\1/g)) texts.add(m[2].replace(/\\(.)/g, '$1'));
    for (const m of src.matchAll(/problem: (['"])((?!\1).+?)\1/g)) texts.add(m[2].replace(/\\(.)/g, '$1'));
  }
  const bg = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  for (const m of bg.slice(bg.indexOf('// --- Updates')).matchAll(/\bt\((['"])((?:\\.|(?!\1).)*)\1/g)) texts.add(m[2]);
  const page = load(['i18n.js'], { html: 'update.html' }).document;
  for (const node of page.querySelectorAll('[data-i18n]')) {
    for (const child of node.childNodes) if (child.nodeType === 3 && child.textContent.trim()) texts.add(child.textContent.replace(/\s+/g, ' ').trim());
  }
  assert.ok(texts.size > 50, String(texts.size));
  for (const lang of ['nb', 'nn']) {
    const w = load(['i18n.js', 'i18n_strings.js'], { lang });
    assert.deepEqual([...texts].filter((text) => !w.hasTranslation(text)), [], lang);
    assert.ok(!w.hasTranslation('A text no table has'));
  }
});
