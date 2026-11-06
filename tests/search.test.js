// search.html / search.js: the page as a whole, with DA answered by the saved pages
// (fixtures/da) instead of the network
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, SHARED } = require('./harness.js');

// Lars Halvorsen, b. 16 July 1846 in Vågå; only the baptism and census queries
const QUERY = new URLSearchParams({
  'q.givenName': 'Lars', 'q.surname': 'Halvorsen', 'q.sex': 'Male', 'q.birthLikeDate': '16 July 1846',
  'q.birthLikeDate.from': '1845', 'q.birthLikeDate.to': '1847', 'q.birthLikePlace': 'Vågå, Oppland, Norway',
  'q.fatherGivenName': 'Halvor', 'q.fatherSurname': 'Larsen', 'q.motherGivenName': 'Astri', 'q.motherSurname': 'Larsdatter',
  treeref: 'TEST-001', off: 'confirmation,marriage,children,childmarriage,emigration,moving,burial,farm,other'
});
const NO_HITS = '<html><body><div id="resultListContainer">Your search resulted in 0 hits<div id="searchResultList"></div></div></body></html>';

// DA, as far as the fixtures go: the baptism search by first name, a census search,
// and the 1846 baptism's record page; any other search finds nothing, any other
// record isn't there
function fakeDA() {
  const asked = [];
  const fetch = async (address) => {
    const url = new URL(String(address));
    asked.push(url);
    if (url.pathname === '/en/search/persons/advanced') {
      if (url.searchParams.getAll('roles[]').includes('barn') && !url.searchParams.has('related_first_name')) return new Response(fixture('da/search-baptism.html'));
      if (url.searchParams.getAll('jt[]').length) return new Response(fixture('da/search-census.html'));
      return new Response(NO_HITS);
    }
    if (url.pathname.endsWith('/pd99000000000018')) return new Response(fixture('da/baptism-1846.html'));
    return new Response('Not found', { status: 404 });
  };
  return { fetch, asked };
}

async function until(done, ms = 10000) {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function searched() {
  const da = fakeDA();
  const w = load([...SHARED, 'search.js'], { html: 'search.html', url: 'https://arkivet2fs.test/search.html?' + QUERY, fetch: da.fetch, fast: true });
  const status = () => (w.document.querySelector('.check-status') || {}).textContent || '';
  await until(() => /^Checked/.test(status()));
  return { w, asked: da.asked, status: status() };
}

test('the sidebar is filled from the address, and gives the same address back', () => {
  const w = load([...SHARED, 'search.js'], { html: 'search.html', url: 'https://arkivet2fs.test/search.html?' + QUERY, fast: true });
  const params = w.formToParams(w.document.getElementById('criteria'), 'TEST-001');
  const sorted = (p) => [...p].map(([k, v]) => k + '=' + v).sort();
  assert.deepEqual(sorted(params), sorted(QUERY));
  assert.equal(w.document.getElementById('fs-person').textContent, 'Open TEST-001 on FamilySearch');
});

test('displayDate(): DA dates as FS writes them', () => {
  const w = load([...SHARED, 'search.js'], { html: 'search.html', fast: true });
  assert.equal(w.displayDate('1845-04-06'), '6 April 1845');
  assert.equal(w.displayDate('1845-04'), 'April 1845');
  assert.equal(w.displayDate('1845'), '1845');
});

test('a search: the plan runs strict to wide, and the record checks find the baptism', async () => {
  const { w, asked, status } = await searched();
  const searches = asked.filter((u) => u.pathname.includes('/search/'));
  // the baptism with the father, in the parish first
  const first = searches[0].searchParams;
  assert.equal(first.get('related_first_name'), 'Halv*');
  assert.deepEqual(first.getAll('m[]'), ['0515']);
  // the record pages read after the searches
  const records = asked.filter((u) => !u.pathname.includes('/search/'));
  assert.ok(records.length > 0 && records.length <= 40);
  assert.ok(asked.indexOf(records[0]) > asked.indexOf(searches[searches.length - 1]));
  assert.match(status, /^Checked the records of the best \d+ hits/);

  const groups = [...w.document.querySelectorAll('section')].filter((s) => /^(Baptism|Census) \(\d+\)/.test(s.textContent.trim()));
  assert.deepEqual(groups.map((s) => s.textContent.trim().match(/^\w+ \(\d+\)/)[0]), ['Baptism (4)', 'Census (26)']);
  const bestText = groups[0].textContent;
  const checked = bestText.indexOf('father Halvor Larsen in the record'), other = bestText.indexOf('23 January 1844');
  assert.ok(checked >= 0 && other > checked, 'the checked baptism comes first');
  assert.match(bestText, /record checked/);
  assert.match(groups[1].textContent, /record not read: Digital Arkivet answered 404\./);
});

test('"Review & Attach" opens the linker on the record, for the FS person', async () => {
  const { w } = await searched();
  const link = w.document.querySelector('a.hit-attach');
  const params = new URL(link.href).searchParams;
  assert.match(params.get('rec'), /^https:\/\/www\.digitalarkivet\.no\/.*pd99000000000018$/);
  assert.equal(params.get('pid'), 'TEST-001');
});
