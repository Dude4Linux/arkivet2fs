// The report relay: a Cloudflare Worker that takes a problem report from the
// extension's "Send report" panel (report.js) and files it as an issue in the
// developer's private reports repository on GitHub, through a GitHub App installed on
// that repository only. The extension can't hold a secret, so the App's key lives here
// as a Worker secret; nothing of it reaches the extension. See relay/README.md.
//
//   POST /report  {report, contact?, version, browser, page}  → {ok: true, number}
//
// Environment (REPO_OWNER and REPO_NAME in wrangler.toml, the rest `wrangler secret put`):
//   APP_CLIENT_ID    the GitHub App's client ID (the JWT's issuer)
//   INSTALLATION_ID  the App's installation on the reports repository
//   REPO_OWNER, REPO_NAME  the reports repository
//   PRIVATE_KEY      the App's private key, PEM (GitHub gives PKCS#1; PKCS#8 works too)
//   LIMITER          a rate-limit binding, keyed by the sender's address
//   ALLOWED_ORIGINS  optional: a comma-separated list of extension origins to accept;
//                    by default any chrome-extension:// or moz-extension:// origin

// A report as the extension makes it is a few kB; a census linker's can reach 60 kB
export const MAX_REQUEST = 200_000;
// GitHub takes at most 65,536 characters in an issue's or a comment's body
export const CHUNK = 60_000;
// The issue and at most this many comments after it
export const MAX_PARTS = 4;

const GITHUB = 'https://api.github.com';
const EXTENSION_ORIGIN = /^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[0-9a-f-]{36})$/;

// The installation token, kept while the Worker instance lives (an hour at most)
let cached = null;
export function forgetToken() { cached = null; }

function corsHeaders(origin, env) {
  if (!allowedOrigin(origin, env)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export function allowedOrigin(origin, env) {
  if (!origin) return false;
  if (env.ALLOWED_ORIGINS) return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin);
  return EXTENSION_ORIGIN.test(origin);
}

function reply(status, body, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin, env) }
  });
}

// ---- The report ----

// One line of plain text, at most `max` characters, or '' when there is none
function line(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim().slice(0, max);
}

// No one on GitHub is notified by a report: "@name" gets a zero-width space after the @.
// GitHub's "#12" and "owner/repo#12" links only refer, and don't notify.
export function quiet(text) {
  return String(text).replace(/@(?=[A-Za-z0-9_-])/g, '@\u200b');
}

// The request's fields, checked: {report, contact, version, browser, page} or {error}
export function readReport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'not a report' };
  const report = typeof data.report === 'string' ? data.report.replace(/\r\n?/g, '\n').trim() : '';
  if (!report) return { error: 'the report is empty' };
  const version = line(data.version, 20);
  if (!/^\d{1,4}\.\d{1,4}\.\d{1,6}$/.test(version)) return { error: 'no version' };
  const page = line(data.page, 20);
  if (!/^[a-z]{1,20}$/.test(page)) return { error: 'no page' };
  const browser = line(data.browser, 60).replace(/[^\p{L}\p{N} .()_-]/gu, '') || 'an unknown browser';
  const contact = line(data.contact, 200);
  return { report, contact, version, browser, page };
}

export function issueTitle(r) {
  return `Report from the ${r.page} page (v${r.version}, ${r.browser})`;
}

// The report in parts that each fit an issue body: the first part the issue, the rest
// comments, each with a line saying which part it is. A report too long for MAX_PARTS
// is cut, and says so.
export function issueParts(r) {
  const head = (r.contact ? `**Contact:** ${quiet(r.contact)}\n\n` : '') + '---\n\n';
  const text = quiet(r.report);
  const parts = [];
  let rest = text;
  let room = CHUNK - head.length;
  while (rest.length && parts.length < MAX_PARTS) {
    let piece = rest.slice(0, room);
    if (piece.length < rest.length) {
      // At a line's end where there is one in the last fifth, so a line isn't split
      const cut = piece.lastIndexOf('\n');
      if (cut > room * 0.8) piece = piece.slice(0, cut + 1);
    }
    parts.push(piece);
    rest = rest.slice(piece.length);
    room = CHUNK - 40;
  }
  if (rest.length) parts[parts.length - 1] += `\n\n(The report was cut here: ${rest.length} more characters.)`;
  return parts.map((p, i) => (i === 0 ? head : `(Part ${i + 1} of ${parts.length})\n\n`) + p
    + (parts.length > 1 && i === 0 ? `\n\n(Part 1 of ${parts.length}: the rest is in the comments.)` : ''));
}

// ---- GitHub ----

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const text64 = (s) => base64url(new TextEncoder().encode(s));

// DER length and element
function derLength(n) {
  if (n < 0x80) return [n];
  const out = [];
  while (n) { out.unshift(n & 0xff); n >>= 8; }
  return [0x80 | out.length, ...out];
}
const der = (tag, bytes) => [tag, ...derLength(bytes.length), ...bytes];

// A PEM key as PKCS#8 DER: GitHub's "RSA PRIVATE KEY" (PKCS#1) wrapped in a
// PrivateKeyInfo with the rsaEncryption algorithm; a "PRIVATE KEY" as it is
export function pkcs8(pem) {
  const kind = /-----BEGIN ([A-Z ]+)-----/.exec(pem);
  if (!kind) throw new Error('PRIVATE_KEY is not a PEM key');
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (kind[1] === 'PRIVATE KEY') return bytes;
  if (kind[1] !== 'RSA PRIVATE KEY') throw new Error('PRIVATE_KEY is a ' + kind[1].toLowerCase());
  const rsaEncryption = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  return Uint8Array.from(der(0x30, [0x02, 0x01, 0x00, ...der(0x30, rsaEncryption), ...der(0x04, [...bytes])]));
}

// The App's JWT: RS256, issued a minute ago (GitHub's clock may be behind), ten minutes long
export async function appJwt(env, now = Date.now()) {
  const key = await crypto.subtle.importKey('pkcs8', pkcs8(env.PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(now / 1000) - 60;
  const unsigned = text64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.'
    + text64(JSON.stringify({ iat, exp: iat + 9 * 60, iss: env.APP_CLIENT_ID }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return unsigned + '.' + base64url(new Uint8Array(sig));
}

const githubHeaders = (auth) => ({
  Accept: 'application/vnd.github+json',
  Authorization: auth,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'arkivet2fs-relay',
  'Content-Type': 'application/json'
});

// An installation token for the reports repository only, with Issues write only;
// kept until five minutes before it runs out
export async function installationToken(env, fetchFn, now = Date.now()) {
  if (cached && cached.until - 5 * 60_000 > now) return cached.token;
  const res = await fetchFn(`${GITHUB}/app/installations/${encodeURIComponent(env.INSTALLATION_ID)}/access_tokens`, {
    method: 'POST',
    headers: githubHeaders('Bearer ' + await appJwt(env, now)),
    body: JSON.stringify({ repositories: [env.REPO_NAME], permissions: { issues: 'write' } })
  });
  if (!res.ok) throw new Error(`GitHub gave no token (${res.status})`);
  const data = await res.json();
  const until = Date.parse(data.expires_at) || now + 50 * 60_000;
  cached = { token: data.token, until };
  return data.token;
}

async function github(env, fetchFn, path, body) {
  const send = async () => fetchFn(GITHUB + path, {
    method: 'POST', headers: githubHeaders('token ' + await installationToken(env, fetchFn)), body: JSON.stringify(body)
  });
  let res = await send();
  if (res.status === 401) { forgetToken(); res = await send(); }  // a token revoked early
  if (!res.ok) throw new Error(`GitHub refused ${path.replace(/^.*\//, '')} (${res.status})`);
  return res.json();
}

// The issue, and the report's further parts as its comments; labels aren't set (an
// App without push access has them dropped)
export async function fileReport(r, env, fetchFn) {
  const repo = `/repos/${encodeURIComponent(env.REPO_OWNER)}/${encodeURIComponent(env.REPO_NAME)}`;
  const [first, ...more] = issueParts(r);
  const issue = await github(env, fetchFn, repo + '/issues', { title: issueTitle(r), body: first });
  for (const body of more) await github(env, fetchFn, `${repo}/issues/${issue.number}/comments`, { body });
  return issue.number;
}

// ---- The Worker ----

export async function relay(request, env, fetchFn = fetch) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  if (url.pathname !== '/report') return reply(404, { ok: false, error: 'not found' }, origin, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'POST only' }, origin, env);
  // From the extension's pages only (a browser sends the Origin; anyone else could
  // leave it out, which the rate limit is for)
  if (!allowedOrigin(origin, env)) return reply(403, { ok: false, error: 'not from the extension' }, origin, env);
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!success) return reply(429, { ok: false, error: 'too many reports; try again in a minute' }, origin, env);
  }
  if (Number(request.headers.get('Content-Length') || 0) > MAX_REQUEST) return reply(413, { ok: false, error: 'the report is too long' }, origin, env);
  const raw = await request.text();
  if (raw.length > MAX_REQUEST) return reply(413, { ok: false, error: 'the report is too long' }, origin, env);
  let data;
  try { data = JSON.parse(raw); } catch (e) { return reply(400, { ok: false, error: 'not JSON' }, origin, env); }
  const r = readReport(data);
  if (r.error) return reply(400, { ok: false, error: r.error }, origin, env);
  try {
    const number = await fileReport(r, env, fetchFn);
    return reply(200, { ok: true, number }, origin, env);
  } catch (e) {
    console.error('relay:', e.message);
    return reply(502, { ok: false, error: 'the report could not be filed' }, origin, env);
  }
}

export default {
  fetch: (request, env) => relay(request, env)
};
