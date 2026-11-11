// access.js: the pages start once the manifest's sites are granted, else after the
// bar's button got them
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, chromeStub, plain } = require('./harness.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const HOSTS = ['https://www.familysearch.org/*', 'https://www.digitalarkivet.no/*', 'https://www.dokpro.uio.no/*', 'https://ws.geonorge.no/*'];

// search.html with access.js; `granted` the hosts the browser has given, `answer` what
// a request gets
function page({ granted = HOSTS, answer = true, permissions = true } = {}) {
  const chrome = chromeStub();
  chrome.runtime.getManifest = () => ({ version: '1.6.0', host_permissions: HOSTS });
  const requests = [];
  const have = new Set(granted);
  chrome.permissions = permissions ? {
    async contains({ origins }) { return origins.every((o) => have.has(o)); },
    async request(p) { requests.push(p); if (answer) p.origins.forEach((o) => have.add(o)); return answer; }
  } : undefined;
  const w = load(['i18n.js', 'i18n_strings.js', 'access.js'], { html: 'search.html', chrome });
  const started = [];
  w.whenSiteAccess(w.document, () => started.push(true));
  return { w, started, requests, bar: () => w.document.querySelector('.access-warning') };
}

test('whenSiteAccess(): starts at once with the sites granted, or with no permissions API', async () => {
  const all = page();
  await settle();
  assert.equal(all.started.length, 1);
  assert.equal(all.bar(), null);
  const none = page({ permissions: false });
  assert.equal(none.started.length, 1);  // at once, as the tests' pages expect
});

test('whenSiteAccess(): a missing site gets a bar; its button asks for it and then starts', async () => {
  const p = page({ granted: HOSTS.slice(2) });
  await settle();
  assert.equal(p.started.length, 0);
  assert.match(p.bar().textContent, /may not read www\.familysearch\.org, www\.digitalarkivet\.no yet/);
  assert.ok(p.bar().previousElementSibling.classList.contains('topbar'));
  p.bar().querySelector('button').click();
  await settle();
  assert.deepEqual(plain(p.requests), [{ origins: HOSTS.slice(0, 2) }]);
  assert.equal(p.started.length, 1);
  assert.equal(p.bar(), null);
});

test('whenSiteAccess(): refused, the page doesn\'t start and says where to allow it', async () => {
  const p = page({ granted: [], answer: false });
  await settle();
  p.bar().querySelector('button').click();
  await settle();
  assert.equal(p.started.length, 0);
  assert.match(p.bar().textContent, /The browser didn't allow it/);
});
