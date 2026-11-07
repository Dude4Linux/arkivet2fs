// The update checker's shared part (release-plan.md, Phase 3): versions, GitHub's
// latest release, and checking a downloaded package against the pinned key. Loaded by
// background.js (importScripts), which checks once a day, and by the extension's
// pages: update.html downloads and checks a package, and search.html and linker.html
// show the version link in their header. Only function declarations at the top level.
//
// What's kept in chrome.storage.local:
//   update       {repo, checked, etag, release, error, notified}: the last check
//                (only background.js writes it)
//   updateChoice {skipped, later}: "Skip this version" and "Remind me later"
//                (update.html writes it)
//   updateCheck  false turns the daily check off (update.html's checkbox)
//   updateDev    a developer setting, set in the service worker's console:
//                {repo: 'owner/name'} reads another repository's releases, and
//                {version: '1.0.0'} acts as that version, so a real release shows as
//                new. The pinned key is still required.

// The repository whose releases are read
function defaultRepo() {
  return 'Dude4Linux/arkivet2fs';
}

// The public key the packages are signed with (keys/release.pub, its base64 SPKI);
// a package that doesn't verify against it is refused. tests/releases.test.js checks
// that it's the one in keys/release.pub.
function releaseKey() {
  return 'MCowBQYDK2VwAyEAgY9ZlV+W8bPEX1rnVDmLb+9SlZ/n/oL16m4I//Uz/Uk=';
}

// The pinned key's SHA-256 fingerprint, as the README gives it
function releaseKeyFingerprint() {
  return '7642e107e134dfb53e43e4932b32a23301b88b8d28a32b10abe367d16d36bc54';
}

// The repository and version to use: updateDev's when they're valid, else ours
function updateRepoOf(dev) {
  const repo = dev && dev.repo;
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : defaultRepo();
}
function currentVersionOf(dev, manifestVersion) {
  return dev && parseVersion(dev.version) ? String(dev.version).replace(/^v/, '') : manifestVersion;
}

// "1.2.0" or "v1.2.0" → [1, 2, 0]; null for anything else (pre-release tags too)
function parseVersion(v) {
  const m = String(v == null ? '' : v).match(/^v?(\d{1,5})\.(\d{1,5})\.(\d{1,6})$/);
  return m ? m.slice(1).map(Number) : null;
}

// < 0, 0 or > 0 as a is older, the same or newer than b; null when one isn't a version
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// The Chromium package of a version, as tools/build.mjs names it
function packageName(version) {
  return 'arkivet2fs-' + version + '-chromium.zip';
}

// GitHub's release JSON → {version, tag, url, notes, published, zip, sig}, or null for
// a draft, a pre-release, a tag that isn't vX.Y.Z, or a release without this browser's
// package and its signature. The assets are downloaded through the API (asset.url).
function readRelease(json, repo) {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
  const tag = String(json.tag_name || '');
  if (!parseVersion(tag) || !tag.startsWith('v')) return null;
  const version = tag.slice(1);
  const api = 'https://api.github.com/repos/' + (repo || defaultRepo()) + '/releases/assets/';
  const asset = (name) => {
    const a = (json.assets || []).find((x) => x && x.name === name);
    if (!a || typeof a.url !== 'string' || !a.url.startsWith(api) || !(a.size > 0)) return null;
    const digest = /^sha256:[0-9a-f]{64}$/.test(a.digest || '') ? a.digest.slice(7) : '';
    return { name, size: a.size, url: a.url, digest };
  };
  const zip = asset(packageName(version));
  const sig = asset(packageName(version) + '.sig');
  if (!zip || !sig) return null;
  const url = typeof json.html_url === 'string' && json.html_url.startsWith('https://github.com/') ? json.html_url
    : 'https://github.com/' + (repo || defaultRepo()) + '/releases/tag/' + tag;
  return { version, tag, url, notes: String(json.body || ''), published: String(json.published_at || ''), zip, sig };
}

// Whether a day has passed since the last check (a little less, so the daily alarm
// always finds it due)
function updateDue(state, now) {
  return !state || !(state.checked > 0) || now - state.checked >= 23 * 3600 * 1000 || now < state.checked;
}

// Asks GitHub for the latest release (unauthenticated; with the last ETag, so an
// unchanged answer is a 304, which GitHub doesn't count against its limit of 60 an
// hour) and returns the new state. A failed check keeps what was known and says why:
// `error` is English for t(), with {status} from `errorStatus`.
async function fetchLatestRelease(repo, state, fetchFn, now) {
  const old = state && state.repo === repo ? state : { repo };
  const next = { ...old, repo, checked: now, error: '', errorStatus: 0 };
  const headers = { Accept: 'application/vnd.github+json' };
  if (old.etag) headers['If-None-Match'] = old.etag;
  let response;
  try {
    response = await fetchFn('https://api.github.com/repos/' + repo + '/releases/latest', { headers, cache: 'no-store' });
  } catch (e) {
    next.error = 'GitHub could not be reached.';
    return next;
  }
  if (response.status === 304) return next;
  if (response.status === 404) {
    // no published release yet
    return { ...next, release: null, etag: '' };
  }
  if (response.status === 403 || response.status === 429) {
    next.error = 'GitHub refused the check for now; it is tried again tomorrow.';
    return next;
  }
  if (!response.ok) {
    next.error = 'GitHub answered {status}.';
    next.errorStatus = response.status;
    return next;
  }
  let json;
  try { json = await response.json(); } catch (e) { next.error = 'GitHub\'s answer could not be read.'; return next; }
  next.release = readRelease(json, repo);
  next.etag = response.headers.get('ETag') || '';
  if (!next.release && json && json.tag_name) next.error = 'The latest release has no package for this browser.';
  return next;
}

// The release to offer: newer than the version in use, and, with `choice`, not skipped
// and not put off with "Remind me later" (update.html passes none: it shows a newer
// release either way)
function newerRelease(state, current, now, choice) {
  const release = state && state.release;
  if (!release || !(compareVersions(release.version, current) > 0)) return null;
  if (choice && (choice.skipped === release.version || choice.later > now)) return null;
  return release;
}

// How long "Remind me later" waits
function remindLaterMs() {
  return 3 * 24 * 3600 * 1000;
}

// --- Checking a package -------------------------------------------------------------

function base64Bytes(text) {
  const bin = atob(String(text).replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(data) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Whether `sigText` (base64, as tools/sign.mjs writes it) is the key's Ed25519
// signature of `data`. Throws {unsupported: true} when the browser's WebCrypto has no
// Ed25519 (Chrome before 137).
async function verifySignature(data, sigText, key = releaseKey()) {
  let pub;
  try {
    pub = await crypto.subtle.importKey('spki', base64Bytes(key), { name: 'Ed25519' }, false, ['verify']);
  } catch (e) {
    const error = new Error('This browser cannot check Ed25519 signatures.');
    error.unsupported = true;
    throw error;
  }
  let sig;
  try { sig = base64Bytes(sigText); } catch (e) { return false; }
  if (sig.length !== 64) return false;
  try { return await crypto.subtle.verify({ name: 'Ed25519' }, pub, sig, data); } catch (e) { return false; }
}

// Checks a downloaded package against the release: its size, GitHub's SHA-256 digest
// (when the release gives one) and the signature. → {ok, problem, sha256}: problem is
// the English reason it's refused (t() translates it)
async function checkPackage(data, sigText, asset, key, version) {
  const bytes = new Uint8Array(data);
  if (bytes.length !== asset.size) return { ok: false, problem: 'The download is not the size the release gives.' };
  const sha256 = await sha256Hex(bytes);
  if (asset.digest && sha256 !== asset.digest) return { ok: false, problem: 'The download is not the file the release lists (its SHA-256 differs).', sha256 };
  if (!await verifySignature(bytes, sigText, key)) return { ok: false, problem: 'The signature does not match: the file is not the one the maintainer signed.', sha256 };
  // The signature doesn't name the version: an older signed package offered as a newer
  // release is told by the version in its own manifest
  if (version !== undefined && packageVersion(bytes) !== version) {
    return { ok: false, problem: 'The package is not the version the release gives (an older signed package?).', sha256 };
  }
  return { ok: true, problem: '', sha256 };
}

// The version in a package's arkivet2fs/manifest.json, '' when it can't be read. The
// packages store their files uncompressed (tools/build.mjs makeZip()), so the local
// file headers are read in turn; anything else (compressed, sizes after the data) is ''.
function packageVersion(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  for (let at = 0; at + 30 <= bytes.length && view.getUint32(at, true) === 0x04034b50;) {
    const flags = view.getUint16(at + 6, true);
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameEnd = at + 30 + view.getUint16(at + 26, true);
    const start = nameEnd + view.getUint16(at + 28, true);
    if ((flags & 8) || start + size > bytes.length) return '';
    if (decoder.decode(bytes.subarray(at + 30, nameEnd)) === 'arkivet2fs/manifest.json') {
      if (method !== 0) return '';
      try {
        const v = JSON.parse(decoder.decode(bytes.subarray(start, start + size))).version;
        return typeof v === 'string' ? v : '';
      } catch (e) { return ''; }
    }
    at = start + size;
  }
  return '';
}

// Downloads a release asset through GitHub's API (it redirects to its file host)
async function downloadAsset(asset, fetchFn) {
  const response = await fetchFn(asset.url, { headers: { Accept: 'application/octet-stream' }, cache: 'no-store' });
  if (!response.ok) {
    const error = new Error('The download failed: GitHub answered ' + response.status + '.');
    error.status = response.status;
    throw error;
  }
  return response.arrayBuffer();
}

// --- On the pages -----------------------------------------------------------------

// The release notes (Markdown from CHANGELOG.md) as elements: "- " items, one level of
// "  - " under them, paragraphs, `code`. Only text nodes, never HTML from the notes.
function notesElement(doc, text) {
  const box = doc.createElement('div');
  box.className = 'release-notes';
  const inline = (parent, line) => {
    String(line).split('`').forEach((part, i) => {
      if (!part) return;
      if (i % 2) { const code = doc.createElement('code'); code.textContent = part; parent.append(code); } else parent.append(doc.createTextNode(part));
    });
    return parent;
  };
  let list = null;
  let sub = null;
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const item = raw.match(/^(\s*)[-*] (.*)$/);
    if (item) {
      if (item[1].length >= 2 && list && list.lastChild) {
        if (!sub) { sub = doc.createElement('ul'); list.lastChild.append(sub); }
        sub.append(inline(doc.createElement('li'), item[2]));
      } else {
        if (!list) { list = doc.createElement('ul'); box.append(list); }
        sub = null;
        list.append(inline(doc.createElement('li'), item[2]));
      }
    } else if (raw.trim()) {
      list = sub = null;
      const heading = raw.match(/^#+\s+(.*)$/);
      box.append(inline(doc.createElement(heading ? 'h3' : 'p'), heading ? heading[1] : raw.trim()));
    } else {
      list = sub = null;
    }
  }
  return box;
}

// A link in a page's header to update.html: "v. 1.2.0", or "v. 1.3.0 is out" with a
// newer release (the daily check on, not skipped or put off)
async function addVersionLink(topbar) {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.storage) return null;
  const doc = topbar.ownerDocument;
  const link = doc.createElement('a');
  link.className = 'version-link';
  link.href = 'update.html';
  link.target = '_blank';
  link.rel = 'noopener';
  const manifest = chrome.runtime.getManifest().version;
  link.textContent = 'v. ' + manifest;
  link.title = t('Version and updates');
  topbar.insertBefore(link, topbar.querySelector('select.language'));
  try {
    const { update, updateChoice, updateCheck, updateDev } = await chrome.storage.local.get(['update', 'updateChoice', 'updateCheck', 'updateDev']);
    const release = updateCheck !== false && newerRelease(update, currentVersionOf(updateDev, manifest), Date.now(), updateChoice || {});
    if (release) {
      link.textContent = t('v. {version} is out', { version: release.version });
      link.classList.add('new');
    }
  } catch (e) { /* the plain version */ }
  return link;
}
