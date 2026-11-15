// relay/worker.mjs: the report relay's Worker, against a fake GitHub (no network)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const relayModule = import('../relay/worker.mjs');
// GitHub gives an App's key as PKCS#1 ("RSA PRIVATE KEY")
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' });
const ORIGIN = 'chrome-extension://' + 'abcdefghijklmnopabcdefghijklmnop';
const ENV = { APP_CLIENT_ID: 'Iv23TEST', INSTALLATION_ID: '42', REPO_OWNER: 'owner', REPO_NAME: 'reports', PRIVATE_KEY: PEM };

// A fake api.github.com: answers the token and issue requests and keeps them
function fakeGitHub({ issueStatus = 201 } = {}) {
  const calls = [];
  let comments = 0;
  const fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, auth: init.headers.Authorization, body });
    if (url.endsWith('/access_tokens')) return Response.json({ token: 'ghs_TEST', expires_at: new Date(Date.now() + 3600e3).toISOString() }, { status: 201 });
    if (url.endsWith('/issues')) return Response.json({ number: 7 }, { status: issueStatus });
    if (url.endsWith('/comments')) return Response.json({ id: ++comments }, { status: 201 });
    return new Response('', { status: 404 });
  };
  return { fetch, calls };
}

const REPORT = { report: '### arkivet2fs problem report\n\n- Version: 1.7.0\n\n#### What happened\n\nThe census paired the wrong Lars Halvorsen. @someone', contact: 'me@example.com', version: '1.7.0', browser: 'Chrome 142 on Linux', page: 'linker' };
const post = (body, headers = {}) => new Request('https://relay.test/report', {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body)
});

test('relay(): files the report as an issue with an installation token for the reports repository only', async () => {
  const w = await relayModule;
  w.forgetToken();
  const gh = fakeGitHub();
  const res = await w.relay(post(REPORT), ENV, gh.fetch);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, number: 7 });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const [token, issue] = gh.calls;
  assert.equal(token.url, 'https://api.github.com/app/installations/42/access_tokens');
  assert.deepEqual(token.body, { repositories: ['reports'], permissions: { issues: 'write' } });
  assert.equal(issue.url, 'https://api.github.com/repos/owner/reports/issues');
  assert.equal(issue.auth, 'token ghs_TEST');
  assert.equal(issue.body.title, 'Report from the linker page (v1.7.0, Chrome 142 on Linux)');
  assert.match(issue.body.body, /^\*\*Contact:\*\* me@\u200bexample\.com\n\n---\n\n### arkivet2fs problem report/);
  assert.ok(issue.body.body.includes('Lars Halvorsen. @\u200bsomeone'));  // no one is notified
  assert.equal(issue.body.labels, undefined);
  // The token is kept for the next report
  await w.relay(post(REPORT), ENV, gh.fetch);
  assert.equal(gh.calls.filter((c) => c.url.endsWith('/access_tokens')).length, 1);
  // Without a contact the issue is the report alone, with no rule above it
  await w.relay(post({ ...REPORT, contact: '' }), ENV, gh.fetch);
  assert.match(gh.calls.at(-1).body.body, /^### arkivet2fs problem report/);
});

test('appJwt(): RS256 by the App\'s PKCS#1 key, issued a minute back, under ten minutes long', async () => {
  const w = await relayModule;
  const now = Date.UTC(2026, 10, 13, 12, 0, 0);
  const jwt = await w.appJwt(ENV, now);
  const [h, p, s] = jwt.split('.');
  const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());
  assert.deepEqual(json(h), { alg: 'RS256', typ: 'JWT' });
  const claims = json(p);
  assert.equal(claims.iss, 'Iv23TEST');
  assert.equal(claims.iat, now / 1000 - 60);
  assert.ok(claims.exp - claims.iat <= 600);
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + p), publicKey, Buffer.from(s, 'base64url')));
  // A PKCS#8 key works as it is
  const jwt8 = await w.appJwt({ ...ENV, PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, now);
  const [h8, p8, s8] = jwt8.split('.');
  assert.ok(crypto.verify('sha256', Buffer.from(h8 + '.' + p8), publicKey, Buffer.from(s8, 'base64url')));
  assert.throws(() => w.pkcs8('not a key'), /not a PEM key/);
});

test('relay(): only POST /report from an extension page, within the rate limit and size', async () => {
  const w = await relayModule;
  const gh = fakeGitHub();
  const status = async (req, env = ENV) => (await w.relay(req, env, gh.fetch)).status;
  assert.equal(await status(new Request('https://relay.test/other', { method: 'POST' })), 404);
  assert.equal(await status(new Request('https://relay.test/report')), 405);
  const pre = await w.relay(new Request('https://relay.test/report', { method: 'OPTIONS', headers: { Origin: 'moz-extension://0d1e2f3a-4b5c-6d7e-8f90-a1b2c3d4e5f6' } }), ENV, gh.fetch);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(await status(post(REPORT, { Origin: 'https://evil.test' })), 403);
  assert.equal(await status(post(REPORT, { Origin: ORIGIN }), { ...ENV, ALLOWED_ORIGINS: 'chrome-extension://other' }), 403);
  assert.equal(await status(post(REPORT), { ...ENV, LIMITER: { limit: async () => ({ success: false }) } }), 429);
  assert.equal(await status(post('x'.repeat(w.MAX_REQUEST + 1))), 413);
  assert.equal(await status(post('{not json')), 400);
  assert.equal(await status(post({ ...REPORT, report: '  ' })), 400);
  assert.equal(await status(post({ ...REPORT, version: '1.7' })), 400);
  assert.equal(await status(post({ ...REPORT, page: '../x' })), 400);
  assert.equal(gh.calls.length, 0);  // none of them reached GitHub
});

test('relay(): GitHub refusing the issue is a 502 that names no detail', async () => {
  const w = await relayModule;
  w.forgetToken();
  const gh = fakeGitHub({ issueStatus: 422 });
  const errors = console.error;
  console.error = () => {};
  try {
    const res = await w.relay(post(REPORT), ENV, gh.fetch);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { ok: false, error: 'the report could not be filed' });
  } finally { console.error = errors; }
});

test('readReport(): the fields checked and made one line each', async () => {
  const w = await relayModule;
  const r = w.readReport({ ...REPORT, contact: 'a\nb', browser: 'Chrome <b>142</b>', report: 'x\r\ny' });
  assert.equal(r.contact, 'a b');
  assert.equal(r.browser, 'Chrome b142b');
  assert.equal(r.report, 'x\ny');
  assert.equal(w.readReport([]).error, 'not a report');
  assert.equal(w.readReport({ ...REPORT, contact: undefined }).contact, '');
});

test('issueParts(): a long report goes in the issue and comments, at line ends, cut after the last part', async () => {
  const w = await relayModule;
  const lineText = 'x'.repeat(99) + '\n';
  const long = { ...REPORT, contact: '', report: lineText.repeat(Math.ceil(w.CHUNK * 2.5 / 100)) };
  const parts = w.issueParts(long);
  assert.equal(parts.length, 3);
  for (const p of parts) assert.ok(p.length < 65536);
  assert.match(parts[0], /\(Part 1 of 3: the rest is in the comments\.\)$/);
  assert.match(parts[1], /^\(Part 2 of 3\)\n\nx{99}\n/);  // a whole line first
  const huge = { ...REPORT, report: lineText.repeat(Math.ceil(w.CHUNK * (w.MAX_PARTS + 1) / 100)) };
  const cut = w.issueParts(huge);
  assert.equal(cut.length, w.MAX_PARTS);
  assert.match(cut[cut.length - 1], /\(The report was cut here: \d+ more characters\.\)$/);
  assert.deepEqual(w.issueParts({ ...REPORT, contact: '' }).length, 1);
});

test('fileReport(): the further parts are comments on the issue', async () => {
  const w = await relayModule;
  w.forgetToken();
  const gh = fakeGitHub();
  const number = await w.fileReport(w.readReport({ ...REPORT, report: ('y'.repeat(99) + '\n').repeat(1300) }), ENV, gh.fetch);
  assert.equal(number, 7);
  assert.deepEqual(gh.calls.map((c) => c.url.replace('https://api.github.com', '')),
    ['/app/installations/42/access_tokens', '/repos/owner/reports/issues', '/repos/owner/reports/issues/7/comments', '/repos/owner/reports/issues/7/comments']);
});
