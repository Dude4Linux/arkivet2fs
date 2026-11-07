// linker.js: the record's people paired with the FS family, and the renames. The page
// doesn't start without chrome.storage, so its functions are called on their own.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, value, fixtureDoc, fixtureUrl, plain, SHARED } = require('./harness.js');

const w = load([...SHARED, 'linker.js'], { html: 'linker.html' });
const record = (name) => w.extractRecord(fixtureDoc(w, 'da/' + name + '.html'), fixtureUrl('da/' + name + '.html'));
const byName = (people, pairs) => Object.fromEntries(people.filter((p) => pairs[p.key]).map((p) => [p.name, pairs[p.key]]));

// Synthetic FS persons (TEST-… PIDs), as fs_person.js's gatherPerson() gives them
const LARS_1846 = {
  pid: 'TEST-LAR', name: 'Lars Halvorsen', gender: 'Male', birth: { date: '16 July 1846' },
  father: { pid: 'TEST-HAL', name: 'Halvor Larsen', lifespan: '1810-1880' },
  mother: { pid: 'TEST-AST', name: 'Astrid Larsdatter', lifespan: '1815-1890' }, families: []
};
const LARS_1844 = {
  pid: 'TEST-LAR', name: 'Lars Halvorsen', gender: 'Male', birth: { date: '1844' },
  father: { pid: 'TEST-HAL', name: 'Halvor Larsen', lifespan: '1810-1880' },
  mother: { pid: 'TEST-DAG', name: 'Dagrun Larsdatter', lifespan: '1814-1905' },
  families: [{
    spouse: { pid: 'TEST-KJE', name: 'Kjersti Larsdatter', lifespan: '1854-1930' },
    children: [{ pid: 'TEST-REI', name: 'Reidar Larsen', lifespan: '1885-1960' }, { pid: 'TEST-ASG', name: 'Asgjerd Larsdatter', lifespan: '1888-1970' },
      { pid: 'TEST-ELI', name: 'Eli Larsdatter', lifespan: '1897-1980' }]
  }]
};

test('treeFamily(): the person, parents, spouses and children, each once', () => {
  assert.deepEqual(plain(w.treeFamily(LARS_1844).map((p) => p.relation + ' ' + p.pid)),
    ['person TEST-LAR', 'father TEST-HAL', 'mother TEST-DAG', 'spouse TEST-KJE', 'child TEST-REI', 'child TEST-ASG', 'child TEST-ELI']);
});

test('suggestPairs(): a baptism; a parent with another given name is only named', () => {
  const r = record('baptism-1846');
  const people = w.recordPeople(r);
  const { pairs, why } = w.suggestPairs(r, people, w.findSelf(people, LARS_1846, true), LARS_1846);
  assert.deepEqual(byName(people, pairs), { Lars: 'TEST-LAR', 'Halvor Larsen': 'TEST-HAL' });
  const astri = people.find((p) => p.name === 'Astri Larsdatter');
  assert.match(why[astri.key], /^FamilySearch mother is Astrid Larsdatter, another name/);
});

test('suggestResidencePairs(): the household and the mother in the other one', () => {
  const r = record('census-1900');
  const people = w.recordPeople(r);
  const { pairs, why } = w.suggestResidencePairs(r, people, LARS_1844, {}, true);
  assert.deepEqual(byName(people, pairs), {
    'Lars Halvorsen Solbakken': 'TEST-LAR', 'Kjersti Larsdatter': 'TEST-KJE', 'Reidar Larsen': 'TEST-REI',
    'Asgjerd Larsdatter': 'TEST-ASG', 'Eli Larsdatter': 'TEST-ELI', 'Dagrun Larsdatter Solbakken': 'TEST-DAG'
  });
  const dagrun = people.find((p) => p.name.startsWith('Dagrun'));
  assert.match(why[dagrun.key], /^mother of Lars Halvorsen in FamilySearch, .*household no\. 02$/);
  // Bergljot and Lars Larsen aren't in this FS family; Per Halvorsen could be a brother
  for (const name of ['Bergljot Larsdatter', 'Lars Larsen', 'Per Halvorsen']) assert.ok(!pairs[people.find((p) => p.name === name).key], name);
});

test('suggestResidencePairs(): an FS person the census contradicts is not the anchor', () => {
  const r = record('census-1900');
  const people = w.recordPeople(r);
  const { pairs } = w.suggestResidencePairs(r, people, { ...LARS_1844, birth: { date: '1870' } }, {}, false);
  assert.ok(!pairs[people[0].key]);
});

// 1865: Halvor Larsen's household, with two sons Lars (the first died young, the
// second has his name) and, in household 02, his old parents: "hans Fader" refers
// to the head of household 01
const HALVOR = {
  pid: 'TEST-HAL', name: 'Halvor Larsen', gender: 'Male', birth: { date: '1821' },
  father: { pid: 'TEST-LAF', name: 'Lars Halvorsen', lifespan: '1790-1870' },
  mother: { pid: 'TEST-INM', name: 'Ingerid Larsdatter', lifespan: '1798-1872' },
  families: [{
    spouse: { pid: 'TEST-AST', name: 'Astri Larsdatter', lifespan: '1820-1890' },
    children: [{ pid: 'TEST-LA1', name: 'Lars Halvorsen', lifespan: '1846-1848' }, { pid: 'TEST-LA2', name: 'Lars Halvorsen', lifespan: '1849-1920' },
      { pid: 'TEST-HA2', name: 'Halvor Halvorsen', lifespan: '1853-1930' }, { pid: 'TEST-ING', name: 'Ingerid Halvorsdatter', lifespan: '1856-1940' },
      { pid: 'TEST-HAN', name: 'Hans Halvorsen', lifespan: '1859-1940' }, { pid: 'TEST-ELI', name: 'Eli Halvorsdatter', lifespan: '1864-1950' }]
  }]
};
const LARS_1849 = {
  pid: 'TEST-LA2', name: 'Lars Halvorsen', gender: 'Male', birth: { date: '10 April 1849' },
  father: { pid: 'TEST-HAL', name: 'Halvor Larsen', lifespan: '1821-1890' },
  mother: { pid: 'TEST-AST', name: 'Astri Larsdatter', lifespan: '1820-1890' }, families: []
};
const byHousehold = (people, pairs) => Object.fromEntries(people.filter((p) => pairs[p.key]).map((p) => [p.name + ' ' + (p.household || 0), pairs[p.key]]));

test("suggestResidencePairs(): two sons Lars; the census's is the younger, and household 02 holds the grandparents", () => {
  const r = record('census-1865-household');
  const people = w.recordPeople(r);
  const { pairs, why } = w.suggestResidencePairs(r, people, HALVOR, {}, true);
  assert.deepEqual(byHousehold(people, pairs), {
    'Halvor Larsen 0': 'TEST-HAL', 'Astri Larsdatter 0': 'TEST-AST', 'Lars Halvorsen 0': 'TEST-LA2',
    'Halvor Halvorsen 0': 'TEST-HA2', 'Hans Halvorsen 0': 'TEST-HAN', 'Ingerid Halvorsdatter 0': 'TEST-ING',
    'Eli Halvorsdatter 0': 'TEST-ELI', 'Lars Halvorsen 1': 'TEST-LAF', 'Ingerid Larsdatter 1': 'TEST-INM'
  });
  assert.ok(!Object.values(pairs).includes('TEST-LA1'), 'the elder Lars, b. 1846, is not the boy of 15');
  const grandfather = people.find((p) => p.household === 1 && p.name === 'Lars Halvorsen');
  assert.match(why[grandfather.key], /^father of Halvor Larsen in FamilySearch, .*household no\. 02$/);
});

test('suggestResidencePairs(): opened from either son Lars, only the younger fits the boy of 15', () => {
  const r = record('census-1865-household');
  let people = w.recordPeople(r);
  let { pairs } = w.suggestResidencePairs(r, people, LARS_1849, {}, false);
  assert.deepEqual(byHousehold(people, pairs), { 'Halvor Larsen 0': 'TEST-HAL', 'Astri Larsdatter 0': 'TEST-AST', 'Lars Halvorsen 0': 'TEST-LA2' });
  // the elder, b. 1846, is four years off: not paired, and neither through him are his parents
  people = w.recordPeople(r);
  ({ pairs } = w.suggestResidencePairs(r, people, { ...LARS_1849, pid: 'TEST-LA1', birth: { date: '16 July 1846' } }, {}, false));
  assert.deepEqual(byHousehold(people, pairs), {});
});

test('renames carry into the title, the citation and the notes', () => {
  assert.equal(w.renamePhrase('1846, Lars, son of Halvor Larsen - Vågå', 'Lars', 'Lars Halvorsen'), '1846, Lars Halvorsen, son of Halvor Larsen - Vågå');
  assert.equal(w.renamePhrase('baptism of Lars, 23 August 1846', 'Lars', 'Lars Halvorsen'), 'baptism of Lars Halvorsen, 23 August 1846');
  // whole names only
  assert.equal(w.renamePhrase('1900, Lars Halvorsen Solbakken household', 'Lars Halvorsen', 'X'), '1900, Lars Halvorsen Solbakken household');
  assert.equal(w.renameNoteLine('Child: Lars *\nFather: Halvor Larsen', 'Child', 'Lars', 'Lars Halvorsen'), 'Child: Lars Halvorsen *\nFather: Halvor Larsen');
  assert.equal(value(w, 'dropChildOf')('1846, Lars Halvorsen, son of Halvor Larsen - Vågå parish - Birth'), '1846, Lars Halvorsen - Vågå parish - Birth');
});

test('censusKin(): the kin word of a family position', () => {
  assert.equal(w.censusKin({ role: 'hans Fader' }), 'father');
  assert.equal(w.censusKin({ role: 'deres Søn' }), 'child');
  assert.equal(w.censusKin({ role: 'Konens Søster' }), 'kin');
  assert.equal(w.censusKin({ role: 'Tjener' }), '');
});

test('patronymics: a clash of fathers, spellings of one, a father of this name', () => {
  assert.equal(w.patronymicClash('Lars Gunsteinsen', 'Lars Halvorsen'), true);
  assert.equal(w.patronymicClash('Lars Halvardsen', 'Lars Halvorsen'), false);
  assert.equal(w.patronymicClash('Lars', 'Lars Halvorsen'), false);
  assert.equal(w.patronymicFrom('Reidar Larsen', 'Lars'), true);
  assert.equal(w.patronymicFrom('Reidar Halvorsen', 'Lars'), false);
});

test('recordSex(): from a patronymic or a family position', () => {
  assert.equal(w.recordSex({ name: 'Eli Larsdatter' }), 'Female');
  assert.equal(w.recordSex({ name: 'Reidar Larsen' }), 'Male');
  assert.equal(w.recordSex({ name: 'Lars', role: 'deres Søn' }), 'Male');
  assert.equal(w.recordSex({ name: 'Lars' }), '');
});

test('defaultTags(): by record type and role', () => {
  assert.deepEqual(plain(w.defaultTags('birth_baptism', 'child')), ['Name', 'Gender', 'Birth', 'Christening']);
  assert.deepEqual(plain(w.defaultTags('birth_baptism', 'father')), ['Name']);
  assert.deepEqual(plain(w.defaultTags('death_burial', 'deceased')), ['Name', 'Death', 'Burial']);
  assert.deepEqual(plain(w.defaultTags('census', '')), ['Name', 'Gender', 'Residence']);
});

test('onFamilySearch(): steps run only on familysearch.org', () => {
  assert.equal(w.onFamilySearch('https://www.familysearch.org/en/tree/sources/sourceBox'), true);
  assert.equal(w.onFamilySearch('http://www.familysearch.org/'), false);
  assert.equal(w.onFamilySearch('https://familysearch.org.example.com/'), false);
});

// --- An entry in both church books: the 1846 baptism, and the same entry as the
// clerk's book might have it (the mother's surname abbreviated, its own ID and source)
const MINISTERIAL = { archive: 'AV/SAK-0000-0001: Vågå prestekontor', book: 'Ministerialbok A-13', reference: 'AV/SAK-0000-0001/F/Fa/L0013', series: 'ministerial' };
const CLERK = { archive: 'AV/SAK-0000-0001: Vågå prestekontor', book: 'Klokkerbok B-10', reference: 'AV/SAK-0000-0001/F/Fb/L0010', series: 'clerk' };
const CLERK_URL = fixtureUrl('da/baptism-1846.html').replace('pd99000000000018', 'pd99000000000918');
function clerkPage(win = w) {
  const doc = fixtureDoc(win, 'da/baptism-1846.html');
  doc.body.innerHTML = doc.body.innerHTML.replace(/Astri Larsdatter/g, 'Astri Larsdtr.').replace(/pd99000000000018/g, 'pd99000000000918')
    .replace('/en/source/9002', '/en/source/9098');
  return doc;
}
const clerkRecord = () => w.extractRecord(clerkPage(), CLERK_URL);

test('compareRecords() and parallelNote(): the two entries side by side, the differences in the notes', () => {
  const a = record('baptism-1846'), b = clerkRecord();
  const rows = w.compareRecords(a, b);
  assert.deepEqual(plain(rows.filter((r) => !r.same)), [{ label: 'Mother', a: 'Astri Larsdatter', b: 'Astri Larsdtr.', same: false }]);
  assert.ok(rows.some((r) => r.label === 'Date of birth' && r.same && r.a === '16 July 1846'));
  assert.equal(w.parallelNote(b, CLERK, rows, 'b'), '--- Also recorded in ---\n' +
    'Klokkerbok B-10 (Vågå prestekontor, AV/SAK-0000-0001/F/Fb/L0010), Permanent ID pd99000000000918, ' + b.url + '\n' +
    'Differences there:\nMother: Astri Larsdtr. (here: Astri Larsdatter)');
  assert.match(w.parallelNote(a, MINISTERIAL, rows, 'a'), /\nMother: Astri Larsdatter \(here: Astri Larsdtr\.\)$/);
  assert.match(w.parallelNote(a, MINISTERIAL, w.compareRecords(a, a), 'a'), /\nThe two entries agree\.$/);
});

test('withBook(): the book named after the source title, in the title and the citation', () => {
  const named = w.withBook(record('baptism-1846'), MINISTERIAL);
  assert.equal(named.title, '1846, Lars, son of Halvor Larsen - Vågå parish, Vågå local parish 1842-1856 (0515P), Ministerialbok A-13 - Birth');
  assert.match(named.citation, /\(0515P\)," Ministerialbok A-13, AV\/SAK-0000-0001\/F\/Fa\/L0013, Births and baptisms, p\. 24/);
});

test('two sources: both filled, renames carry into both, readPlan() gives both with distinct titles', () => {
  const state = value(w, 'state');
  const a = record('baptism-1846'), b = clerkRecord();
  Object.assign(state, { record: a, parallel: { record: b, book: CLERK }, people: w.recordPeople(a) });
  w.fillParallel({ record: a, book: MINISTERIAL }, { record: b, book: CLERK });
  const $ = (id) => w.document.getElementById(id);
  assert.equal($('parallel').hidden, false);
  assert.equal($('source-heading').textContent, 'Source: Ministerialbok A-13');
  assert.equal($('compare').querySelectorAll('tr.differs').length, 1);
  assert.match($('f-notes').value, /\n\n--- Also recorded in ---\nKlokkerbok B-10 .*pd99000000000918/);
  assert.match($('g-notes').value, /\n\n--- Also recorded in ---\nMinisterialbok A-13 .*pd99000000000018/);
  assert.match($('g-title').value, /\(0515P\), Klokkerbok B-10 - Birth$/);

  // the child gains a surname: in both sources
  const child = state.people.find((p) => p.roleEnglish === 'Child');
  w.rename({ person: child, name: 'Lars', noteName: 'Lars' }, 'Lars Halvorsen');
  for (const id of ['f-title', 'g-title']) assert.match($(id).value, /^1846, Lars Halvorsen - Vågå/, id);
  assert.match($('g-notes').value, /^Child: Lars Halvorsen \*$/m);
  assert.match($('g-citation').value, /baptism of Lars Halvorsen, 23 August 1846/);

  const plan = w.readPlan(false);
  assert.notEqual(plan.parallel.title, plan.source.title);
  assert.equal(plan.parallel.url, b.url);
  $('g-title').value = $('f-title').value;
  assert.throws(() => w.readPlan(false), /different titles/);
  Object.assign(state, { parallel: null });
});

test('loadParallel(): the ministerialbok\'s entry is the main record, whichever was opened', async () => {
  const pages = {
    [fixtureUrl('da/baptism-1846.html')]: () => fixtureDoc(w, 'da/baptism-1846.html').documentElement.outerHTML,
    [CLERK_URL]: () => clerkPage().documentElement.outerHTML,
    'https://www.digitalarkivet.no/en/source/9002': () => '<html><body><div class="additional-title"><h3>L0013: Ministerialbok A-13</h3></div>' +
      '<span>Archive reference:</span> <a>AV/SAK-0000-0001/F/Fa/L0013</a></body></html>',
    'https://www.digitalarkivet.no/en/source/9098': () => '<html><body><div class="additional-title"><h3>L0010: Klokkerbok B-10</h3></div>' +
      '<span>Archive reference:</span> <a>AV/SAK-0000-0001/F/Fb/L0010</a></body></html>'
  };
  const fetch = async (address) => (pages[String(address)] ? new Response(pages[String(address)]()) : new Response('Not found', { status: 404 }));
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', fetch, fast: true });
  const opened = await win.loadFromDA(CLERK_URL);
  const both = await win.loadParallel(opened, fixtureUrl('da/baptism-1846.html'));
  assert.equal(both.main.record.permanentId, 'pd99000000000018');
  assert.equal(both.main.book.series, 'ministerial');
  assert.equal(both.parallel.record.permanentId, 'pd99000000000918');
  assert.equal(both.parallel.book.book, 'Klokkerbok B-10');
  await assert.rejects(win.loadParallel(opened, 'https://example.org/pd1'), /Not a Digitalarkivet address/);
});
