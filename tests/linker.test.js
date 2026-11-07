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

// The father's children's baptisms: the record's child (Johan, a boy) is FS's Johan
// Peder, not his elder sister Marte Johanne, whose second name has Johan's consonants
const HALVOR_FAMILY = (children) => ({
  pid: 'TEST-HAL', name: 'Halvor Larsen', gender: 'Male', birth: { date: '1810' }, families: [{
    spouse: { pid: 'TEST-AST', name: 'Astri Larsdatter', lifespan: '1815-1890' }, children
  }]
});
const MARTE = { pid: 'TEST-MAR', name: 'Marte Johanne Halvorsdatter', gender: 'Female', lifespan: '1845-1920' };
const JOHAN = { pid: 'TEST-JOH', name: 'Johan Peder Halvorsen', gender: 'Male', lifespan: '1846-1925' };
function fatherView(children, gender = 'm') {
  const r = record('baptism-1846');
  r.people[0].name = 'Johan Peder';
  r.fields = { ...r.fields, 'given name': 'Johan Peder', gender };
  const people = w.recordPeople(r);
  people.forEach((p) => { p.current = p.name === 'Halvor Larsen'; });
  const fs = HALVOR_FAMILY(children);
  return { people, ...w.suggestPairs(r, people, w.findSelf(people, fs, true), fs) };
}

test("suggestPairs(): a child is the FS child whose first given name it has, not a sibling's second", () => {
  const { people, pairs } = fatherView([MARTE, JOHAN]);
  assert.equal(byName(people, pairs)['Johan Peder'], 'TEST-JOH');
});

test('suggestPairs(): no FS child of the other sex, even with a given name in common', () => {
  const { people, pairs } = fatherView([MARTE]);
  assert.equal(byName(people, pairs)['Johan Peder'], undefined);
  assert.equal(w.givenFit({ name: 'Johan Peder' }, 'Marte Johanne'), 1);
  assert.equal(w.givenFit({ name: 'Johan Peder' }, 'Johan Peder'), 2);
  assert.equal(w.givenFit({ name: 'Johan Peder' }, 'Lars'), 0);
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
  assert.equal(w.patronymicClash('Lars Gudbrandsen', 'Lars Gulbrandsen'), false);
  assert.equal(w.patronymicClash('Lars', 'Lars Halvorsen'), false);
  assert.equal(w.patronymicFrom('Reidar Larsen', 'Lars'), true);
  assert.equal(w.patronymicFrom('Reidar Halvorsen', 'Lars'), false);
});

test('recordSex(): from a patronymic or a family position', () => {
  assert.equal(w.recordSex({ name: 'Eli Larsdatter' }), 'Female');
  assert.equal(w.recordSex({ name: 'Eli Larsdat.' }), 'Female');
  assert.equal(w.recordSex({ name: 'Eli Larsd:r' }), 'Female');
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

// --- What FS already has (the SourceBox check) -------------------------------------

const SOURCE = (persons, ids = ['TEST-S01']) => ({ title: 'T', book: '', id: ids[0] || null, ids, persons });
const pid = (p) => ({ pid: p, name: '' });

test('attachedText(): a source found in the SourceBox, against the people paired here', () => {
  const paired = ['TEST-LAR', 'TEST-HAL'];
  assert.equal(w.attachedText(SOURCE([]), paired), 'It is not attached to anyone yet.');
  assert.equal(w.attachedText(SOURCE([pid('TEST-LAR'), pid('TEST-HAL')]), paired), 'It is already attached to all 2 people paired here.');
  assert.equal(w.attachedText(SOURCE([pid('TEST-LAR')]), ['TEST-LAR']), 'It is already attached to the person paired here.');
  // partly attached: the others will be
  assert.equal(w.attachedText(SOURCE([pid('TEST-LAR')]), paired), 'It is attached to 1 of the 2 people paired here; the others will be attached.');
  assert.equal(w.attachedText(SOURCE([{ pid: 'TEST-OLA', name: 'Ola Nordmann' }]), paired),
    'It is not attached to the 2 people paired here yet. Also attached to Ola Nordmann (TEST-OLA), not paired here.');
  assert.equal(w.attachedText(SOURCE([{ pid: 'TEST-OLA', name: 'Ola Nordmann' }]), []), 'It is attached to Ola Nordmann (TEST-OLA).');
  assert.match(w.attachedText(SOURCE([], ['TEST-S01', 'TEST-S09']), paired), /The SourceBox has 2 sources with this title; the first is used\.$/);
});

test('rowCheckText(): whether a row\'s tree person has the source, or each of two', () => {
  const one = { sources: [SOURCE([pid('TEST-LAR')])] };
  assert.equal(w.rowCheckText(one, 'test-lar').text, 'Already has this source on FamilySearch');
  assert.equal(w.rowCheckText(one, 'TEST-HAL').text, 'Not attached to this source yet');
  assert.equal(w.rowCheckText(one, 'TEST-LAR').linked, 'all');
  assert.equal(w.rowCheckText(one, 'TEST-HAL').linked, 'none');
  assert.equal(w.rowCheckText(one, ''), null);
  assert.equal(w.rowCheckText({ sources: [SOURCE([], [])] }, 'TEST-LAR'), null);  // not in the SourceBox
  assert.equal(w.rowCheckText({ checking: true }, 'TEST-LAR'), null);
  const two = { sources: [{ ...SOURCE([pid('TEST-LAR')]), book: 'Ministerialbok A-13' }, { ...SOURCE([], ['TEST-S02']), book: 'Klokkerbok B-10' }] };
  assert.equal(w.rowCheckText(two, 'TEST-LAR').text, 'Ministerialbok A-13: already attached; Klokkerbok B-10: not attached yet');
  assert.equal(w.rowCheckText(two, 'TEST-LAR').linked, 'some');
  assert.equal(w.rowCheckText(two, 'TEST-HAL').linked, 'none');
  const halfNew = { sources: [two.sources[0], { title: 'T2', book: 'Klokkerbok B-10', id: null, ids: [], persons: [] }] };
  assert.equal(w.rowCheckText(halfNew, 'TEST-LAR').linked, 'some');  // the second source is still to be made
  two.sources[1].persons.push(pid('TEST-LAR'));
  assert.equal(w.rowCheckText(two, 'TEST-LAR').text, 'Already has both sources on FamilySearch');
  assert.equal(w.rowCheckText(two, 'TEST-LAR').linked, 'all');
});

// A linker page with the baptism's child and father paired
function checkedPage(chrome) {
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', chrome, fast: true });
  win.Element.prototype.scrollIntoView = () => {};  // not in jsdom
  const state = value(win, 'state');
  const r = win.extractRecord(fixtureDoc(win, 'da/baptism-1846.html'), fixtureUrl('da/baptism-1846.html'));
  Object.assign(state, { record: r, people: win.recordPeople(r) });
  win.fillSource(r);
  const pairs = { Lars: 'TEST-LAR', 'Halvor Larsen': 'TEST-HAL' };
  state.rows = state.people.map((p) => win.personRow(p, win.treePool(LARS_1846, {}), pairs[p.name]));
  win.document.getElementById('people').replaceChildren(...state.rows.map((r) => r.node));
  return { win, state, $: (id) => win.document.getElementById(id) };
}

test('showFsCheck(): a source in the SourceBox tints its box, and the rows of people who have it', () => {
  const { win, state, $ } = checkedPage();
  const title = $('f-title').value;
  // checking while the page is held back: no note (the status line tells)
  state.fsCheck = { checking: true };
  win.showFsCheck();
  assert.equal($('fs-check').hidden, true);

  state.fsCheck = { sources: [{ title, book: '', id: 'TEST-S01', ids: ['TEST-S01'], persons: [{ pid: 'TEST-LAR', name: 'Lars Halvorsen' }] }] };
  win.showFsCheck();
  $('linker').hidden = false;  // as main() shows it after the check
  assert.equal($('attach').textContent, 'Update source and attach');  // the source is there: written over, not created
  assert.equal($('create-only').textContent, 'Update source only');
  assert.equal($('intro-action').textContent, 'Update source and attach');
  assert.equal($('parallel').hidden, true);  // one church book
  assert.equal($('source').classList.contains('in-sourcebox'), true);
  assert.equal($('fs-check').hidden, true);  // no note: the tint tells
  assert.equal($('fs-link').hidden, false);
  assert.equal($('fs-link').href, 'https://www.familysearch.org/en/tree/sources/attachedTo/TEST-S01');
  assert.equal($('fs-link').title, 'Already in your SourceBox (TEST-S01). It is attached to 1 of the 2 people paired here; the others will be attached.');
  const status = (name) => state.rows.find((r) => r.person.name === name).node.querySelector('.fs-status');
  assert.equal(status('Lars').textContent, 'Already has this source on FamilySearch');
  assert.equal(status('Halvor Larsen').textContent, 'Not attached to this source yet');
  assert.equal(status('Astri Larsdatter').hidden, true);  // not paired
  const node = (name) => state.rows.find((r) => r.person.name === name).node;
  assert.equal(node('Lars').classList.contains('linked'), true);  // highlighted, as FS's Source Linker does
  assert.equal(node('Halvor Larsen').classList.contains('linked'), false);
  assert.equal(node('Astri Larsdatter').classList.contains('linked'), false);

  state.fsCheck = { checking: true };  // checking again: a note
  win.showFsCheck();
  assert.equal($('fs-check').textContent, 'Checking your SourceBox on FamilySearch…');

  state.fsCheck = { sources: [{ title, book: '', id: 'TEST-S01', ids: ['TEST-S01'], persons: [] }] };
  $('f-title').value = title + ' (edited)';
  win.showFsCheck();
  assert.equal($('source').classList.contains('in-sourcebox'), false);  // not known for this title
  assert.equal($('fs-link').hidden, true);
  assert.equal($('fs-check').textContent, 'The title has changed since the SourceBox was checked.Check the SourceBox again');
  assert.equal($('fs-check').querySelector('button').textContent, 'Check the SourceBox again');

  state.fsCheck = { sources: [{ title: $('f-title').value, book: '', id: null, ids: [], persons: [] }] };
  win.showFsCheck();
  assert.equal($('source').classList.contains('in-sourcebox'), false);
  assert.equal($('fs-check').hidden, true);
  assert.equal(status('Lars').hidden, true);
  assert.equal(node('Lars').classList.contains('linked'), false);
  assert.equal($('attach').textContent, 'Create source and attach');

  state.fsCheck = { error: 'Please sign in to FamilySearch and try again.' };
  win.showFsCheck();
  assert.equal($('fs-check').className, 'fs-check small bad');
  assert.match($('fs-check').textContent, /^Not checked on FamilySearch: Please sign in/);
});

test('showFsCheck(): each of two church books\' sources is tinted on its own', () => {
  const { win, state, $ } = checkedPage();
  state.parallel = { record: state.record };
  $('g-title').value = 'Another title';
  $('parallel').hidden = false;  // as fillParallel() shows it
  state.fsCheck = { sources: [{ title: $('f-title').value, book: 'A', id: null, ids: [], persons: [] },
    { title: 'Another title', book: 'B', id: 'TEST-S02', ids: ['TEST-S02'], persons: [] }] };
  win.showFsCheck();
  assert.equal($('parallel').hidden, false);
  assert.equal($('source').classList.contains('in-sourcebox'), false);
  assert.equal($('parallel').classList.contains('in-sourcebox'), true);
  assert.equal($('fs-link').hidden, true);
  assert.equal($('fs-link-g').href, 'https://www.familysearch.org/en/tree/sources/attachedTo/TEST-S02');
  assert.equal($('attach').textContent, 'Create or update sources and attach');  // one of each
});

// A fake FS behind chrome.tabs: the steps fs_attach.js would answer, logged in `asked`
function fakeFs(answers, rejected = []) {
  const asked = [];
  const rejections = new Set(rejected);  // addresses Chrome refuses to go to, the first time
  const listeners = new Set();
  const urls = {};
  const loaded = (id) => setTimeout(() => listeners.forEach((fn) => fn(id, { status: 'complete' })), 0);
  const windows = [];
  const chrome = {
    windows: {
      async get(id) { return { id, state: 'normal', left: 100, top: 50, width: 1200, height: 900 }; },
      async create(options) { windows.push({ ...options, open: true }); urls[3] = options.url; loaded(3); return { id: 9, tabs: [{ id: 3 }] }; },
      async update() {},
      async remove() { windows.forEach((w) => { w.open = false; }); }
    },
    tabs: {
      async getCurrent() { return { id: 1, index: 0, windowId: 8 }; },
      async create({ url }) { urls[2] = url; loaded(2); return { id: 2 }; },
      async update(id, { url }) {
        if (url && rejections.has(url)) { rejections.delete(url); throw new Error('Navigation rejected.'); }  // once
        if (url) { urls[id] = url; loaded(id); }
        return { id };
      },
      async get(id) { return { id, url: urls[id] }; },
      async remove() {},
      async sendMessage(id, { linker, args }) { asked.push([linker, args]); return answers[linker](args, urls[id]); },
      onUpdated: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) }
    },
    scripting: { async executeScript() { return []; } }
  };
  return { chrome, asked, windows, rejections };
}

test('checkOnFamilySearch(): reads FS in an unfocused popup window behind the linker\'s, closed after', async () => {
  const { chrome, asked, windows, rejections } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-LAR', name: 'Lars Halvorsen' }] })
  }, ['https://www.familysearch.org/en/tree/sources/attachedTo/TEST-S01']);
  const { win, state, $ } = checkedPage(chrome);
  await win.checkOnFamilySearch();
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'attachedTo']);  // the refused navigation was tried again
  assert.equal(rejections.size, 0);  // it was refused once
  assert.equal(windows.length, 1);
  assert.equal(windows[0].type, 'popup');  // no new tab in the user's tab strip
  assert.equal(windows[0].focused, false);  // so it goes below the linker's window
  assert.equal(windows[0].state, undefined);  // not minimized: Chrome wouldn't draw FS's list there
  // the linker window's own place and size, so that window covers it
  assert.deepEqual([windows[0].left, windows[0].top, windows[0].width, windows[0].height], [100, 50, 1200, 900]);
  assert.equal(windows[0].open, false);  // closed
  assert.equal(state.fsCheck.sources[0].id, 'TEST-S01');
  assert.equal($('source').classList.contains('in-sourcebox'), true);
});

test('run(): a source partly attached before is used, and attached only to those who lack it', async () => {
  const { chrome, asked } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-LAR', name: 'Lars Halvorsen' }] }),
    createSource: () => { throw new Error('no new source when one has the title'); },
    editSource: () => ({ ok: true, sourceId: 'TEST-S01', changed: ['citation', 'notes'], missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } })
  });
  const { win, state, $ } = checkedPage(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name, args]) => name + (args.pid ? ' ' + args.pid : ''))), ['findSource', 'attachedTo', 'editSource', 'attach TEST-HAL']);
  // written over with the fields reviewed here, with a reason for FS's change log
  assert.equal(asked[2][1].sourceId, 'TEST-S01');
  assert.equal(asked[2][1].source.title, $('f-title').value);
  assert.equal(asked[2][1].source.citation, $('f-citation').value);
  assert.equal(asked[2][1].reason, 'Updated from the record on Digitalarkivet.');
  assert.equal(asked[3][1].sourceId, 'TEST-S01');
  assert.equal(asked[3][1].title, $('f-title').value);  // found by title when Home doesn't show it
  const log = $('log').textContent;
  assert.match(log, /already has a source with this title; using it \(TEST-S01\)/);
  assert.match(log, /Source updated: citation, notes\./);
  assert.match(log, /Lars \(TEST-LAR\) already has this source on FamilySearch; left as it is\./);
  assert.match(log, /Attached to Halvor Larsen \(TEST-HAL\)\./);
  // what FS has now
  assert.deepEqual(plain(state.fsCheck.sources[0].persons.map((p) => p.pid)), ['TEST-LAR', 'TEST-HAL']);
  assert.match($('fs-link').title, /already attached to all 2 people paired here/);
  assert.equal($('source').classList.contains('in-sourcebox'), true);
});

test('run(): a source that could not be updated is not attached', async () => {
  const { chrome, asked } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: () => ({ ok: false, error: 'Timed out waiting for the Edit Source form.' }),
    attach: () => { throw new Error('not attached after a failed update'); }
  });
  const { win, $ } = checkedPage(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'attachedTo', 'editSource']);
  assert.match($('log').textContent, /The source could not be updated: Timed out waiting for the Edit Source form\./);
});

test('run(): a title not in the SourceBox is created there', async () => {
  const { chrome, asked } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } })
  });
  const { win, $ } = checkedPage(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name, args]) => name + (args.pid ? ' ' + args.pid : ''))), ['findSource', 'createSource', 'attach TEST-LAR', 'attach TEST-HAL']);
  assert.match($('log').textContent, /Source created \(TEST-S05\)/);
});
