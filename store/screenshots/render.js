// Renders the search page or the linker on the tests' sanitized DA pages and
// made-up TEST- persons, and writes it as a static page for a screenshot:
//   node store/screenshots/render.js search|linker OUT.html [SCROLL] [LANG]
// SCROLL moves the page up by that many pixels; LANG is the UI language (en, nb, nn).
// make.sh runs it for each shot.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const { load, value, fixture, fixtureDoc, fixtureUrl, SHARED } = require(path.join(ROOT, 'tests/harness.js'));

const [page, out, scroll = '0', lang = 'en'] = process.argv.slice(2);
// The start of a text as the page shows it, before any {placeholder}
const shown = (w, text) => w.t(text).split('{')[0];
const area = { get: async () => ({}), set: async () => {}, remove: async () => {} };
const runtime = { getManifest: () => JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')), getURL: (p) => p, id: 'x' };

// The form's values as attributes, scripts out, the files found from the repository
function write(doc) {
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('input').forEach((i) => {
    if (i.type === 'checkbox' || i.type === 'radio') i.toggleAttribute('checked', i.checked);
    else i.setAttribute('value', i.value);
  });
  doc.querySelectorAll('select').forEach((s) => [...s.options].forEach((o) => o.toggleAttribute('selected', o.selected)));
  doc.querySelectorAll('textarea').forEach((t) => { t.textContent = t.value; });
  const base = doc.createElement('base');
  base.href = 'file://' + ROOT + '/';
  doc.head.prepend(base);
  const style = doc.createElement('style');
  style.textContent = `body { margin-top: -${Number(scroll)}px; }`;
  doc.head.append(style);
  fs.writeFileSync(out, '<!doctype html>' + doc.documentElement.outerHTML);
}

// Lars Halvorsen, b. 1846 in Vågå, with his parents: baptism and census searches
async function search() {
  const query = new URLSearchParams({
    'q.givenName': 'Lars', 'q.surname': 'Halvorsen', 'q.sex': 'Male', 'q.birthLikeDate': '16 July 1846',
    'q.birthLikeDate.from': '1845', 'q.birthLikeDate.to': '1847', 'q.birthLikePlace': 'Vågå, Oppland, Norway',
    'q.fatherGivenName': 'Halvor', 'q.fatherSurname': 'Larsen', 'q.motherGivenName': 'Astri', 'q.motherSurname': 'Larsdatter',
    treeref: 'TEST-001', off: 'confirmation,marriage,children,childmarriage,emigration,moving,burial,farm,other'
  });
  const noHits = '<html><body><div id="resultListContainer">Your search resulted in 0 hits<div id="searchResultList"></div></div></body></html>';
  const fetch = async (address) => {
    const url = new URL(String(address));
    if (url.pathname === '/en/search/persons/advanced') {
      if (url.searchParams.getAll('roles[]').includes('barn') && !url.searchParams.has('related_first_name')) return new Response(fixture('da/search-baptism.html'));
      if (url.searchParams.getAll('jt[]').length) return new Response(fixture('da/search-census.html'));
      return new Response(noHits);
    }
    if (url.pathname.endsWith('/pd99000000000018')) return new Response(fixture('da/baptism-1846.html'));
    return new Response('Not found', { status: 404 });
  };
  const chrome = { runtime, storage: { local: area, session: area, onChanged: { addListener() {} } }, permissions: { contains: async () => true } };
  const w = load([...SHARED, 'search.js'], { html: 'search.html', url: 'https://arkivet2fs.test/search.html?' + query, fetch, fast: true, chrome, lang });
  const doc = w.document;
  const status = () => (doc.querySelector('.check-status') || {}).textContent || '';
  const start = Date.now();
  const checked = shown(w, 'Checked the records of the best {n} hits against the FamilySearch relatives.');
  while (!status().startsWith(checked)) {
    if (Date.now() - start > 20000) throw new Error('timed out: ' + status());
    await new Promise((r) => setTimeout(r, 20));
  }
  // The fake DA has only one record page: leave out the others' "record not read",
  // and the record kinds turned off
  const notRead = shown(w, 'record not read: {error}');
  const off = shown(w, 'Turned off under Record kinds.');
  [...doc.querySelectorAll('*')].filter((e) => !e.children.length && e.textContent.trim().startsWith(notRead)).forEach((e) => e.remove());
  [...doc.querySelectorAll('tr, li, .query')].filter((r) => r.textContent.includes(off) && !r.querySelector('tr, li, .query')).forEach((r) => r.remove());
  write(doc);
}

// The 1846 baptism with Lars and his parents paired, the christening ticked to add
async function linker() {
  const lars = {
    pid: 'TEST-LAR', name: 'Lars Halvorsen', gender: 'Male', birth: { date: '16 July 1846', place: 'Vågå, Oppland, Norway' },
    father: { pid: 'TEST-HAL', name: 'Halvor Larsen', lifespan: '1810-1880' },
    mother: { pid: 'TEST-AST', name: 'Astrid Larsdatter', lifespan: '1815-1890' }, families: []
  };
  const details = {
    'TEST-HAL': { pid: 'TEST-HAL', name: 'Halvor Larsen', gender: 'Male', birth: { date: '3 March 1810', place: 'Vågå, Oppland, Norway' }, death: { date: '1880', place: 'Vågå, Oppland, Norway' }, families: [] },
    'TEST-AST': { pid: 'TEST-AST', name: 'Astrid Larsdatter', gender: 'Female', birth: { date: '1815', place: 'Vågå, Oppland, Norway' }, families: [] }
  };
  // No storage while loading, so main() doesn't start
  const chrome = { runtime };
  const w = load([...SHARED, 'linker.js'], { html: 'linker.html', chrome, fast: true, lang });
  w.Element.prototype.scrollIntoView = () => {};
  chrome.storage = { local: area, session: area, onChanged: { addListener() {} } };
  const doc = w.document;
  const $ = (id) => doc.getElementById(id);
  const topbar = doc.querySelector('.topbar');
  w.localizePage();
  topbar.append(w.languageMenu());
  w.addVersionLink(topbar);
  w.reportButton(topbar, () => '');
  const state = value(w, 'state');
  const record = w.extractRecord(fixtureDoc(w, 'da/baptism-1846.html'), fixtureUrl('da/baptism-1846.html'));
  Object.assign(state, { record, people: w.recordPeople(record), fs: lars, details });
  $('fs-pid').value = 'TEST-LAR';
  w.fillSource(record);
  const pairs = { Lars: 'TEST-LAR', 'Halvor Larsen': 'TEST-HAL', 'Astri Larsdatter': 'TEST-AST' };
  state.rows = state.people.map((p) => w.personRow(p, w.treePool(lars, {}), pairs[p.name]));
  $('people').replaceChildren(...state.rows.map((row) => row.node));
  state.fsCheck = { sources: [{ title: $('f-title').value, book: '', id: null, ids: [], persons: [] }] };
  w.showFsCheck();
  const child = state.rows.find((row) => row.person.name === 'Lars');
  child.showFacts();
  const item = [...child.node.querySelectorAll('.additions li')].find((li) => li.textContent.includes(w.t('Add the {fact}', { fact: w.t('Christening').toLowerCase() })));
  const tick = item.querySelector('input[type=checkbox]');
  tick.checked = true;
  tick.dispatchEvent(new w.Event('change'));
  w.showChanges();
  $('status').hidden = true;
  $('linker').hidden = false;
  await new Promise((r) => setTimeout(r, 200));
  write(doc);
}

({ search, linker })[page]().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
