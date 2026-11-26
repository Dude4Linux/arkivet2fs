#!/usr/bin/env node
// Sends a release's package to the Chrome Web Store and to Firefox Add-ons (AMO), on the
// maintainer's machine. tools/release runs it once the release is published, asking for
// each store; it sends the package it has just checked, as a user downloads it.
//
//   node tools/stores.mjs has <chrome|firefox> vX.Y.Z
//       exit 0: the store has this version (in review or live; Chrome: or a newer one),
//       1: it hasn't, 3: the store isn't set up, 2: an error
//   node tools/stores.mjs upload <chrome|firefox> <arkivet2fs-X.Y.Z.zip> vX.Y.Z
//
// Chrome: the package is uploaded and submitted for review, and goes live once approved.
// Firefox: uploaded to the listed channel, and the version made with the release notes
// (HEAD's CHANGELOG.md); it goes live once reviewed.
//
// The keys are in ~/.config/arkivet2fs/stores.json (another file: ARKIVET2FS_STORES),
// which only you may read (chmod 600), as may the service account's key:
//
//   {
//     "chrome": {"publisher": "<publisher ID>", "item": "malggmddihmieaipddkjemajhiembnkm",
//                "serviceAccount": "chrome-service-account.json"},
//     "firefox": {"issuer": "user:...", "secret": "...", "addon": "arkivet2fs@dude4linux"}
//   }
//
// serviceAccount is the service account's JSON key, in the same folder. A store left out
// isn't offered. release-plan.md ("Store uploads") says how to get the keys. Nothing
// secret is printed.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO, changelogSection, readZip } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CWS = 'https://chromewebstore.googleapis.com';
export const AMO = 'https://addons.mozilla.org/api/v5';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
export const STORE_NAMES = { chrome: 'the Chrome Web Store', firefox: 'Firefox Add-ons' };
const POLL_MS = 5000;
const CHROME_POLLS = 60; // 5 minutes
const AMO_POLLS = 120; // 10 minutes: AMO's validation can take a few

export function configPath(env = process.env) {
  return env.ARKIVET2FS_STORES || path.join(os.homedir(), '.config', 'arkivet2fs', 'stores.json');
}

// A key file others can read is refused
export function readSecretFile(file) {
  const mode = fs.statSync(file).mode;
  if (process.platform !== 'win32' && (mode & 0o077)) throw new Error(`${file} can be read by others; chmod 600 it first`);
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  try { return JSON.parse(readSecretFile(file)); } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`${file} isn't JSON`);
    throw e;
  }
}

// One store's settings from stores.json, checked; null when the store isn't set up
export function storeConfig(file, store) {
  if (!fs.existsSync(file)) return null;
  const c = readJson(file)[store];
  if (!c) return null;
  const need = (...keys) => {
    const missing = keys.filter((k) => typeof c[k] !== 'string' || !c[k]);
    if (missing.length) throw new Error(`${file}: "${store}" needs ${missing.join(', ')}`);
  };
  if (store === 'chrome') {
    need('publisher', 'item', 'serviceAccount');
    const account = readJson(path.resolve(path.dirname(file), c.serviceAccount));
    if (!account.client_email || !account.private_key) throw new Error(`${c.serviceAccount} isn't a service account key (no client_email or private_key)`);
    return { publisher: c.publisher, item: c.item, account };
  }
  need('issuer', 'secret', 'addon');
  return { issuer: c.issuer, secret: c.secret, addon: c.addon };
}

const b64url = (data) => Buffer.from(data).toString('base64url');

export function jwt(header, claims, signer) {
  const data = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
  return data + '.' + b64url(signer(data));
}

// Google's service account flow: a JWT signed with the account's key (RS256), for an hour
export function googleAssertion(account, now) {
  const iat = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  if (account.private_key_id) header.kid = account.private_key_id;
  return jwt(header, { iss: account.client_email, scope: CWS_SCOPE, aud: GOOGLE_TOKEN, iat, exp: iat + 3600 },
    (data) => crypto.sign('RSA-SHA256', Buffer.from(data), account.private_key));
}

// AMO's JWT (HS256 with the API secret), one per request, good for a minute
export function amoToken(issuer, secret, now, nonce) {
  const iat = Math.floor(now / 1000);
  return jwt({ alg: 'HS256', typ: 'JWT' }, { iss: issuer, jti: nonce, iat, exp: iat + 60 },
    (data) => crypto.createHmac('sha256', secret).update(data).digest());
}

// A response's JSON; an error with the service's own message when it failed
export async function answer(res, what) {
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  if (res.ok && json) return json;
  let detail = '';
  if (json?.error?.message) detail = json.error.message; // Google
  else if (typeof json?.error === 'string') detail = [json.error, json.error_description].filter(Boolean).join(': ');
  else if (json?.detail) detail = json.detail; // AMO
  else if (json && typeof json === 'object') detail = JSON.stringify(json);
  else detail = text.replace(/\s+/g, ' ').trim();
  const error = new Error(`${what}: ${res.ok ? 'not JSON' : 'HTTP ' + res.status}${detail ? ' (' + detail.slice(0, 500) + ')' : ''}`);
  error.status = res.status;
  throw error;
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// The version in the manifest.json at the zip's root
export function zipVersion(buf) {
  const manifest = readZip(buf).find((e) => e.name === 'manifest.json');
  if (!manifest) throw new Error('the package has no manifest.json at its root');
  return JSON.parse(manifest.data.toString('utf8')).version;
}

// AMO takes release notes of at most 3000 characters
export const AMO_NOTES_MAX = 3000;

// Release notes as AMO shows them: plain text, without the Markdown's ** and `. Notes
// longer than AMO takes become one line per item (its bold heading, or a short item
// whole, else its first clause), with a link to the whole notes on GitHub; items that
// still don't fit are left out from the end.
export function storeNotes(markdown, version, max = AMO_NOTES_MAX) {
  const plain = (text) => text.replace(/\*\*/g, '').replace(/`/g, '').trim();
  const full = plain(String(markdown));
  if (full.length <= max) return full;
  const more = `\n\nAll the changes: https://github.com/${REPO}/releases/tag/v${version}`;
  const items = String(markdown).split('\n').filter((l) => /^- /.test(l)).map((line) => {
    const item = line.slice(2).trim();
    const bold = item.match(/^\*\*(.+?)\*\*/);
    let short = plain(item);
    if (short.length <= 140) return '- ' + short;
    if (bold) short = plain(bold[1]).replace(/:$/, '');
    else short = short.split(/: |\. /)[0];
    if (short.length > 140) short = short.slice(0, 139).replace(/\s+\S*$/, '') + '…';
    return '- ' + short;
  });
  const kept = [];
  for (const item of items) {
    if ([...kept, item].join('\n').length + more.length > max) break;
    kept.push(item);
  }
  return kept.join('\n') + more;
}

// ---- Chrome Web Store (API V2)

const cwsItem = (c) => `publishers/${encodeURIComponent(c.publisher)}/items/${encodeURIComponent(c.item)}`;

async function googleToken(c, deps) {
  const res = await deps.fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: googleAssertion(c.account, deps.now()) }).toString(),
  });
  const json = await answer(res, 'Google sign-in for the service account');
  if (!json.access_token) throw new Error('Google sign-in for the service account: no access token');
  return { Authorization: 'Bearer ' + json.access_token };
}

async function chromeStatus(c, auth, deps) {
  return answer(await deps.fetch(`${CWS}/v2/${cwsItem(c)}:fetchStatus`, { headers: auth }), 'Chrome Web Store status');
}

const STATES = {
  PENDING_REVIEW: 'in review', STAGED: 'approved, staged', PUBLISHED: 'live', PUBLISHED_TO_TESTERS: 'live for testers',
  REJECTED: 'rejected', CANCELLED: 'cancelled',
};
const stateText = (state) => STATES[state] || state || 'no state';

// {has, text}: whether the item has this version, submitted or published, or a newer one
export async function chromeHas(c, version, deps) {
  const status = await chromeStatus(c, await googleToken(c, deps), deps);
  const revisions = [['submitted', status.submittedItemRevisionStatus], ['published', status.publishedItemRevisionStatus]];
  const found = [];
  for (const [, rev] of revisions) {
    for (const ch of rev?.distributionChannels || []) if (ch.crxVersion) found.push(`${ch.crxVersion} (${stateText(rev.state)})`);
  }
  const has = revisions.some(([, rev]) => rev?.state !== 'REJECTED' && rev?.state !== 'CANCELLED' &&
    (rev?.distributionChannels || []).some((ch) => ch.crxVersion && compareVersions(ch.crxVersion, version) >= 0));
  return { has, text: found.length ? `${STORE_NAMES.chrome} has ${[...new Set(found)].join(', ')}` : `${STORE_NAMES.chrome} has no version yet` };
}

// Uploads the package and submits it for review, live once approved; gives the item's state
export async function chromeUpload(c, zip, version, deps) {
  const auth = await googleToken(c, deps);
  deps.log(`Uploading ${version} to ${STORE_NAMES.chrome}…`);
  const up = await answer(await deps.fetch(`${CWS}/upload/v2/${cwsItem(c)}:upload`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/zip' }, body: zip,
  }), 'Chrome Web Store upload');
  let state = up.uploadState;
  for (let i = 0; /IN_PROGRESS/.test(state || '') && i < CHROME_POLLS; i++) {
    await deps.sleep(POLL_MS);
    state = (await chromeStatus(c, auth, deps)).lastAsyncUploadState;
  }
  if (/IN_PROGRESS/.test(state || '')) throw new Error(`${STORE_NAMES.chrome} is still processing the upload; look at the item in the developer dashboard, and submit it there`);
  if (state !== 'SUCCEEDED') throw new Error(`${STORE_NAMES.chrome} did not take the package (upload ${state || 'without a state'}); the developer dashboard may say why`);
  if (up.crxVersion && up.crxVersion !== version) throw new Error(`${STORE_NAMES.chrome} read version ${up.crxVersion} in the package, not ${version}`);
  deps.log('Uploaded. Submitting it for review…');
  const pub = await answer(await deps.fetch(`${CWS}/v2/${cwsItem(c)}:publish`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  }), 'Chrome Web Store submission');
  for (const w of pub.warningInfo?.warnings || []) deps.log(`Warning: ${[w.reason, w.description].filter(Boolean).join(': ')}`);
  return pub.state;
}

// ---- Firefox Add-ons (AMO API v5)

const amoAddon = (f) => `${AMO}/addons/addon/${encodeURIComponent(f.addon)}`;
const amoAuth = (f, deps) => ({ Authorization: 'JWT ' + amoToken(f.issuer, f.secret, deps.now(), deps.nonce()) });

// {has, text}: whether AMO has this version (in review or live)
export async function firefoxHas(f, version, deps) {
  const res = await deps.fetch(`${amoAddon(f)}/versions/${encodeURIComponent(version)}/`, { headers: amoAuth(f, deps) });
  if (res.status === 404) return { has: false, text: `${STORE_NAMES.firefox} hasn't ${version}` };
  const v = await answer(res, 'Firefox Add-ons version');
  const status = v.file?.status;
  return { has: true, text: `${STORE_NAMES.firefox} has ${version}${status ? ` (${{ public: 'live', unreviewed: 'in review', disabled: 'disabled' }[status] || status})` : ''}` };
}

// The errors of AMO's validation, one line each
export function validationErrors(validation) {
  const errors = (validation?.messages || []).filter((m) => m.type === 'error');
  if (!errors.length) return '(no errors listed; see the upload on addons.mozilla.org)';
  return errors.slice(0, 10).map((m) => '- ' + [m.message, ...(m.file ? [m.file] : [])].join(' ')).join('\n');
}

// Uploads the package to the listed channel, waits for AMO's validation and makes the
// version with the release notes; gives the file's status
export async function firefoxUpload(f, zip, version, notes, deps) {
  deps.log(`Uploading ${version} to ${STORE_NAMES.firefox}…`);
  const form = new FormData();
  form.append('upload', new Blob([zip], { type: 'application/zip' }), `arkivet2fs-${version}.zip`);
  form.append('channel', 'listed');
  let up = await answer(await deps.fetch(`${AMO}/addons/upload/`, { method: 'POST', headers: amoAuth(f, deps), body: form }), 'Firefox Add-ons upload');
  const uuid = up.uuid;
  if (!uuid) throw new Error('Firefox Add-ons upload: no upload ID in the answer');
  deps.log('Uploaded. Waiting for the validation…');
  for (let i = 0; !up.processed && i < AMO_POLLS; i++) {
    await deps.sleep(POLL_MS);
    up = await answer(await deps.fetch(`${AMO}/addons/upload/${encodeURIComponent(uuid)}/`, { headers: amoAuth(f, deps) }), 'Firefox Add-ons validation');
  }
  if (!up.processed) throw new Error(`${STORE_NAMES.firefox} is still validating the package; finish the submission on addons.mozilla.org`);
  if (!up.valid) throw new Error(`${STORE_NAMES.firefox} refused the package:\n${validationErrors(up.validation)}`);
  if (up.version && up.version !== version) throw new Error(`${STORE_NAMES.firefox} read version ${up.version} in the package, not ${version}`);
  deps.log('Validated. Making the version…');
  const body = { upload: uuid };
  if (notes) body.release_notes = { 'en-US': notes };
  const v = await answer(await deps.fetch(`${amoAddon(f)}/versions/`, {
    method: 'POST', headers: { ...amoAuth(f, deps), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), 'Firefox Add-ons version');
  return v.file?.status || 'unreviewed';
}

// ---- the command

const USAGE = 'usage: node tools/stores.mjs has <chrome|firefox> vX.Y.Z | upload <chrome|firefox> <zip> vX.Y.Z';

export async function main(argv, deps) {
  const [command, store, ...rest] = argv;
  if (!['has', 'upload'].includes(command) || !Object.hasOwn(STORE_NAMES, store)) throw new Error(USAGE);
  const tag = rest[rest.length - 1];
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '') || rest.length !== (command === 'has' ? 1 : 2)) throw new Error(USAGE);
  const version = tag.slice(1);
  const file = configPath(deps.env);
  const c = storeConfig(file, store);
  if (!c) {
    deps.log(`${STORE_NAMES[store]} isn't set up in ${file}.`);
    return 3;
  }
  if (command === 'has') {
    const { has, text } = await (store === 'chrome' ? chromeHas : firefoxHas)(c, version, deps);
    deps.log(text + '.');
    return has ? 0 : 1;
  }
  const zip = fs.readFileSync(rest[0]);
  const inZip = zipVersion(zip);
  if (inZip !== version) throw new Error(`${rest[0]} is version ${inZip}, not ${version}`);
  if (store === 'chrome') {
    const state = await chromeUpload(c, zip, version, deps);
    deps.log(state === 'PENDING_REVIEW' ? `Submitted ${version} to ${STORE_NAMES.chrome}: in review; it goes live once approved.`
      : `Sent ${version} to ${STORE_NAMES.chrome}: ${stateText(state)}.`);
  } else {
    const status = await firefoxUpload(c, zip, version, storeNotes(deps.notes(version), version), deps);
    deps.log(status === 'public' ? `${version} is live on ${STORE_NAMES.firefox}.`
      : `Submitted ${version} to ${STORE_NAMES.firefox}: in review; it goes live once approved.`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const deps = {
    env: process.env,
    fetch: globalThis.fetch,
    now: Date.now,
    nonce: () => crypto.randomUUID(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (text) => console.log(text),
    notes: (version) => changelogSection(execFileSync('git', ['show', 'HEAD:CHANGELOG.md'], { cwd: ROOT }).toString('utf8'), version),
  };
  main(process.argv.slice(2), deps).then((code) => { process.exitCode = code; },
    (e) => { console.error('stores: ' + e.message); process.exitCode = 2; });
}
