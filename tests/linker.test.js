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

// A marriage: the groom's father through the FS person's family, the bride's father
// through the FS wife's, once that is read
const MARRIAGE = () => ({ recordTypeInfo: { type: 'marriage' }, recordDate: '1870-10-20', fields: {}, people: [
  { id: 'pv99000000000001', name: 'Lars Halvorsen', role: 'brudgom', roleEnglish: 'Groom', current: true },
  { id: 'pv99000000000002', name: 'Kjersti Olsdatter', role: 'brur', roleEnglish: 'Bride' },
  { id: 'pv99000000000003', name: 'Halvor Larsen', role: 'brudgommens far', roleEnglish: "Groom's father" },
  { id: 'pv99000000000004', name: 'Ole Olsen', role: 'bruras far', roleEnglish: "Bride's father" }] });
const KJERSTI = { pid: 'TEST-KJE', name: 'Kjersti Olsdatter', lifespan: '1848-1930' };
const LARS_MARRIED = { ...LARS_1844, families: [{ spouse: KJERSTI, children: [] }] };
const KJERSTI_TREE = {
  ...KJERSTI, gender: 'Female', father: { pid: 'TEST-OLE', name: 'Ole Olsen', lifespan: '1815-1890' },
  mother: { pid: 'TEST-GUR', name: 'Guri Halvorsdatter', lifespan: '1820-1895' },
  families: [{ spouse: { pid: 'TEST-LAR', name: 'Lars Halvorsen', lifespan: '1844-1920' }, children: [] }]
};

test("suggestPairs(): a marriage's groom's father; the bride's father once the wife's FS family is read", () => {
  const r = MARRIAGE();
  const people = w.recordPeople(r);
  const self = w.findSelf(people, LARS_MARRIED, true);
  const first = w.suggestPairs(r, people, self, LARS_MARRIED);
  assert.deepEqual(byName(people, first.pairs), { 'Lars Halvorsen': 'TEST-LAR', 'Kjersti Olsdatter': 'TEST-KJE', 'Halvor Larsen': 'TEST-HAL' });
  assert.deepEqual(plain(first.need), ['TEST-KJE']);  // her family reaches Ole Olsen
  const then = w.suggestPairs(r, people, self, LARS_MARRIED, { 'TEST-KJE': KJERSTI_TREE });
  assert.equal(byName(people, then.pairs)['Ole Olsen'], 'TEST-OLE');
  assert.equal(then.why[people[3].key], 'father, same given name (of Kjersti Olsdatter in FamilySearch)');
  assert.deepEqual(plain(then.need), []);
  // and offered: the wife's father is in the list of choices
  assert.ok(w.treePool(LARS_MARRIED, { 'TEST-KJE': KJERSTI_TREE }).some((p) => p.pid === 'TEST-OLE'));
});

test("suggestPairs(): a baptism's new child is the father's; the mother's family isn't read for it", () => {
  const { pairs, need, people } = fatherView([]);
  assert.equal(byName(people, pairs)['Johan Peder'], undefined);
  assert.deepEqual(plain(need), []);
});

test("showPeople(): a marriage reads the FS wife's family and pairs the bride's father", async () => {
  const chrome = { storage: {
    local: { async get() { return {}; } },
    session: { async get(key) { return key === 'tree:TEST-KJE' ? { [key]: KJERSTI_TREE } : {}; } }
  } };
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', chrome, fast: true });
  const state = value(win, 'state');
  const r = MARRIAGE();
  Object.assign(state, { record: r, people: win.recordPeople(r), fs: LARS_MARRIED, trusted: true });
  await win.showPeople();
  await state.residenceRead;
  const pid = (name) => state.rows.find((row) => row.person.name === name).pid();
  assert.equal(pid('Ole Olsen'), 'TEST-OLE');
  assert.equal(pid('Halvor Larsen'), 'TEST-HAL');
  assert.equal(win.document.getElementById('tree-status').textContent, '4 of 4 in the record paired.');
});

// The FS wife under another given name: the bride is only named in the hint until the
// user chooses her, and then paired from like the others
const LARS_KARI = { ...LARS_1844, families: [{ spouse: { ...KJERSTI, name: 'Kari Olsdatter' }, children: [] }] };

test('suggestPairs(): a row paired by hand stands, and is paired from; one left unattached stays so', () => {
  const r = MARRIAGE();
  const people = w.recordPeople(r);
  const self = w.findSelf(people, LARS_KARI, true);
  const [, bride, father] = people;
  const before = w.suggestPairs(r, people, self, LARS_KARI);
  assert.equal(before.pairs[bride.key], undefined);
  assert.match(before.why[bride.key], /^FamilySearch spouse is Kari Olsdatter, another name/);
  const chosen = { [bride.key]: 'TEST-KJE', [father.key]: '' };
  const first = w.suggestPairs(r, people, self, LARS_KARI, {}, chosen);
  assert.equal(first.pairs[bride.key], 'TEST-KJE');
  assert.equal(first.pairs[father.key], undefined);  // not attached, as chosen
  assert.deepEqual(plain(first.need), ['TEST-KJE']);
  const then = w.suggestPairs(r, people, self, LARS_KARI, { 'TEST-KJE': KJERSTI_TREE }, chosen);
  assert.equal(byName(people, then.pairs)['Ole Olsen'], 'TEST-OLE');
});

test("a bride paired by hand: the FS wife's family is read and her father paired", async () => {
  const read = [];
  const chrome = { storage: {
    local: { async get() { return {}; } },
    session: { async get(key) { read.push(key); return key === 'tree:TEST-KJE' ? { [key]: KJERSTI_TREE } : {}; } }
  } };
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', chrome, fast: true });
  const state = value(win, 'state');
  const r = MARRIAGE();
  Object.assign(state, { record: r, people: win.recordPeople(r), fs: LARS_KARI, trusted: true });
  await win.showPeople();
  await state.residenceRead;
  const row = (name) => state.rows.find((x) => x.person.name === name);
  assert.equal(row('Kjersti Olsdatter').pid(), '');
  assert.equal(row('Ole Olsen').pid(), '');
  assert.deepEqual(read, []);  // nothing to read before
  const select = row('Kjersti Olsdatter').node.querySelector('select');
  select.value = 'TEST-KJE';
  select.dispatchEvent(new win.Event('change'));
  await state.residenceRead;
  assert.deepEqual(read, ['tree:TEST-KJE']);
  assert.equal(row('Kjersti Olsdatter').pid(), 'TEST-KJE');
  assert.equal(row('Ole Olsen').pid(), 'TEST-OLE');
  assert.equal(row('Halvor Larsen').pid(), 'TEST-HAL');
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
  assert.equal(w.renamePhrase('Lars, son of Halvor Larsen - Vågå', 'Lars', 'Lars Halvorsen'), 'Lars Halvorsen, son of Halvor Larsen - Vågå');
  assert.equal(w.renamePhrase('baptism of Lars, 23 August 1846', 'Lars', 'Lars Halvorsen'), 'baptism of Lars Halvorsen, 23 August 1846');
  // whole names only
  assert.equal(w.renamePhrase('Lars Halvorsen Solbakken household - Vågå - Census, 1900', 'Lars Halvorsen', 'X'), 'Lars Halvorsen Solbakken household - Vågå - Census, 1900');
  assert.equal(w.renameNoteLine('Child: Lars *\nFather: Halvor Larsen', 'Child', 'Lars', 'Lars Halvorsen'), 'Child: Lars Halvorsen *\nFather: Halvor Larsen');
  assert.equal(value(w, 'dropChildOf')('Lars Halvorsen, son of Halvor Larsen - Vågå parish - Birth'), 'Lars Halvorsen - Vågå parish - Birth');
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
  // One father's name spelled John or Johannes, a farm in the patronymic's place
  assert.equal(w.patronymicClash('Kjersti Jonsdatter', 'Kjersti Johannesdatter'), false);
  assert.equal(w.patronymicClash('Kjersti Johnsdr', 'Kjersti Johansdr'), false);
  assert.equal(w.patronymicClash('Kjersti Olsdatter', 'Kjersti Jonsdatter'), true);
  assert.equal(w.patronymicClash('Lars Nordby', 'Lars Halvorsen'), false);
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
  // the census codes d and s are whole words: "avdød" (deceased) doesn't end in d for daughter
  assert.equal(w.recordSex({ name: 'Lars', role: 'avdød', roleEnglish: 'Deceased' }), '');
  assert.equal(w.recordSex({ name: 'Lars', role: 'd, fl' }), 'Female');
});

test('defaultTags(): by record type and role', () => {
  assert.deepEqual(plain(w.defaultTags('birth_baptism', 'child')), ['Name', 'Gender', 'Birth', 'Christening']);
  assert.deepEqual(plain(w.defaultTags('birth_baptism', 'father')), ['Name']);
  assert.deepEqual(plain(w.defaultTags('death_burial', 'deceased')), ['Name', 'Death', 'Burial']);
  assert.deepEqual(plain(w.defaultTags('census', '')), ['Name', 'Gender', 'Residence']);
});

test('onFamilySearch(): steps run only on www.familysearch.org (the manifest\'s host)', () => {
  assert.equal(w.onFamilySearch('https://www.familysearch.org/en/tree/sources/sourceBox'), true);
  assert.equal(w.onFamilySearch('https://ident.familysearch.org/en/identity/login'), false);
  assert.equal(w.onFamilySearch(''), false);
  assert.equal(w.onFamilySearch('http://www.familysearch.org/'), false);
  assert.equal(w.onFamilySearch('https://familysearch.org.example.com/'), false);
});

test('step(): a tab the extension can\'t read (FS\'s sign-in page) asks to sign in', async () => {
  const pageOf = (url) => load([...SHARED, 'linker.js'], { html: 'linker.html', chrome: { tabs: { get: async () => ({ id: 1, url }) } } });
  const signIn = await pageOf('').step(1, 'findSource', {});
  assert.equal(signIn.ok, false);
  assert.match(signIn.error, /perhaps the sign-in page\. Please sign in to FamilySearch/);
  const elsewhere = await pageOf('https://www.digitalarkivet.no/').step(1, 'findSource', {});
  assert.equal(elsewhere.error, 'The FamilySearch tab is no longer on FamilySearch.');
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
  assert.equal(named.title, 'Lars, son of Halvor Larsen - Vågå parish, Vågå local parish 1842-1856 (0515P), Ministerialbok A-13 - Birth');
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
  for (const id of ['f-title', 'g-title']) assert.match($(id).value, /^Lars Halvorsen - Vågå/, id);
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
  assert.equal($('fs-check').textContent, 'Checking your SourceBox on FamilySearch… A FamilySearch window may come up meanwhile; leave it, it closes by itself.');

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
  const tabs = { closed: [], active: [] };  // run()'s tab closed, and the tab brought forward
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
      async update(id, { url, active }) {
        if (active && !url) tabs.active.push(id);
        if (url && rejections.has(url)) { rejections.delete(url); throw new Error('Navigation rejected.'); }  // once
        if (url) { urls[id] = url; loaded(id); }
        return { id };
      },
      async get(id) { return { id, url: urls[id] }; },
      async remove(id) { tabs.closed.push(id); },
      async sendMessage(id, { linker, args, action }) {
        // fs_person.js on a details page: the tree person as FS has them now
        if (action === 'readPerson') return answers.readPerson ? answers.readPerson(urls[id]) : { error: 'not read' };
        asked.push([linker, args]);
        return answers[linker](args, urls[id]);
      },
      onUpdated: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) }
    },
    scripting: { async executeScript() { return []; } }
  };
  return { chrome, asked, windows, rejections, tabs };
}

test('checkOnFamilySearch(): reads FS in an unfocused popup window behind the linker\'s, closed after', async () => {
  const { chrome, asked, windows, rejections } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-LAR', name: 'Lars Halvorsen' }] }),
    editSource: ({ read, source }) => (read ? { ok: true, sourceId: 'TEST-S01', fields: { ...source } } : { ok: false, error: 'only read in the check' })
  }, ['https://www.familysearch.org/en/tree/sources/attachedTo/TEST-S01']);
  const { win, state, $ } = checkedPage(chrome);
  await win.checkOnFamilySearch();
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'attachedTo', 'editSource']);  // the refused navigation was tried again
  assert.equal(asked[2][1].read, true);  // its fields only read
  assert.equal($('fs-fields').hidden, true);  // the same fields as here: nothing to choose
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

test('checkOnFamilySearch(): FS\'s security service blocking the page is said, not tried again in a shown window', async () => {
  const blocked = "FamilySearch's security service blocked the page (error 15, incident ID TEST-1). Open FamilySearch in this browser to see why; its page says what to do.";
  const { chrome, asked, windows } = fakeFs({ findSource: () => ({ ok: false, blocked: true, error: blocked }) });
  const { win, state } = checkedPage(chrome);
  await win.checkOnFamilySearch();
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource']);  // once
  assert.equal(state.fsCheck.error, blocked);
  assert.equal(windows[0].open, false);  // closed all the same
  // in Bokmål, the code and incident ID kept
  const nb = load([...SHARED, 'linker.js'], { html: 'linker.html', lang: 'nb', fast: true });
  assert.equal(nb.fsMessage(blocked), 'Sikkerhetstjenesten til FamilySearch blokkerte siden (feil 15, hendelses-ID TEST-1). ' +
    'Åpne FamilySearch i denne nettleseren for å se hvorfor; siden der sier hva du skal gjøre.');
});

test('a load reported complete while the tab still loads (Firefox\'s about:blank) is waited out before a step', async () => {
  const fs = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [] })
  });
  const { chrome } = fs;
  // the first get after each navigation: still loading, with no address (Firefox gives
  // none for about:blank); the real page's load comes a moment later
  const get = chrome.tabs.get;
  const update = chrome.tabs.update;
  const early = new Set();
  const listeners = [];
  const addListener = chrome.tabs.onUpdated.addListener;
  chrome.tabs.onUpdated.addListener = (fn) => { listeners.push(fn); addListener(fn); };
  chrome.tabs.update = async (id, options) => { if (options.url) early.add(id); return update(id, options); };
  chrome.tabs.get = async (id) => {
    if (early.has(id)) {
      early.delete(id);
      setTimeout(() => [...listeners].forEach((fn) => fn(id, { status: 'complete' })), 5);
      return { id, status: 'loading' };
    }
    return { ...(await get(id)), status: 'complete' };
  };
  const { win, state } = checkedPage(chrome);
  await win.checkOnFamilySearch();
  assert.equal(state.fsCheck.error, undefined);
  assert.equal(state.fsCheck.sources[0].id, null);  // searched on FS: not there
  assert.deepEqual(plain(fs.asked.map(([name]) => name)), ['findSource']);
});

test('the SourceBox copy with other fields: each shown with a choice, the record\'s by default, FS\'s notes kept with the new lines; the plan follows', async () => {
  const fsNotes = 'Found by hand in the church book.\nFather: Halvor Larsen';
  const { chrome } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: ({ source }) => ({ ok: true, sourceId: 'TEST-S01', fields: { ...source, citation: 'An older citation', notes: fsNotes, date: '' } })
  });
  const { win, state, $ } = checkedPage(chrome);
  await win.checkOnFamilySearch();
  const box = $('fs-fields');
  assert.equal(box.hidden, false);
  const fields = [...box.querySelectorAll('.fs-field')];
  // the date FS lacks is filled, not asked about; title and web page are the same
  assert.deepEqual(plain(fields.map((f) => f.querySelector('strong').textContent)), ['Citation', 'Notes']);
  assert.equal(fields[0].querySelector('pre').textContent, 'An older citation');
  assert.equal(fields[0].querySelector('select').value, 'record');
  assert.equal(fields[1].querySelector('select').value, 'merge');  // not the extension's older copy
  let source = win.readPlan(false).source;
  assert.equal(source.citation, $('f-citation').value.trim());
  assert.ok(source.notes.startsWith(fsNotes + '\n\n'));  // FS's first, then what's new
  assert.ok(source.notes.includes('Permanent ID: '));
  assert.equal(source.notes.split('\n').filter((l) => l === 'Father: Halvor Larsen').length, 1);  // a line FS has isn't added again
  // the choices changed: FS's citation and notes kept as they are
  for (const select of box.querySelectorAll('select')) { select.value = 'fs'; select.dispatchEvent(new win.Event('change')); }
  source = win.readPlan(false).source;
  assert.equal(source.citation, 'An older citation');
  assert.equal(source.notes, fsNotes);
  assert.equal(source.date, $('f-date').value.trim());
  // the title changed since the check: no choices, the fields as here
  $('f-title').value += ' (2)';
  win.showFsCheck();  // main() calls it on the title's change
  assert.equal(box.hidden, true);
  assert.equal(win.readPlan(false).source.notes, $('f-notes').value.trim());
});

test('the SourceBox copy differing only in the citation\'s access day: nothing to choose, nothing to update', async () => {
  const { chrome } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: ({ source }) => ({ ok: true, sourceId: 'TEST-S01', fields: { ...source, citation: source.citation.replace(/ : accessed [^)]*\)/, ' : accessed 1 January 2020)') } })
  });
  const { win, $ } = checkedPage(chrome);
  assert.match($('f-citation').value, / : accessed [^)]+\)/);
  await win.checkOnFamilySearch();
  assert.equal($('fs-fields').hidden, true);
  assert.equal(win.readPlan(false).source.citation, $('f-citation').value.trim());
});

test('the SourceBox copy is the extension\'s older one: the record\'s notes by default', async () => {
  const { chrome } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: ({ source }) => ({ ok: true, sourceId: 'TEST-S01', fields: { ...source, notes: source.notes.split('\n')[0] + '\nAn older line' } })
  });
  const { win, $ } = checkedPage(chrome);
  await win.checkOnFamilySearch();
  assert.equal($('fs-fields').querySelector('select').value, 'record');
  assert.equal(win.readPlan(false).source.notes, $('f-notes').value.trim());
});

test('the SourceBox source of this title names another record: said under the source', async () => {
  const { chrome } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: () => ({ ok: false, otherRecord: true, sourceId: 'TEST-S01', other: 'pd99000000000001', error: 'another record' })
  });
  const { win, $ } = checkedPage(chrome);
  await win.checkOnFamilySearch();
  assert.equal($('fs-fields').hidden, false);
  assert.match($('fs-fields').textContent, /is of another record/);
});

test('run(): a source partly attached before is used, and attached only to those who lack it', async () => {
  const { chrome, asked, tabs } = fakeFs({
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
  // done: the FS tab (2) is closed and the linker's tab (1) shown again
  assert.deepEqual(plain(tabs.closed), [2]);
  assert.deepEqual(plain(tabs.active), [1]);
});

test('run(): a source that could not be updated is not attached', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: () => ({ ok: false, error: 'Timed out waiting for the Edit Source form.' }),
    attach: () => { throw new Error('not attached after a failed update'); }
  });
  const { win, $ } = checkedPage(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'attachedTo', 'editSource']);
  assert.match($('log').textContent, /The source could not be updated: Timed out waiting for the Edit Source form\./);
  // stopped: the FS tab stays open where it stopped
  assert.deepEqual(plain(tabs.closed), []);
  assert.match($('log').textContent, /The FamilySearch tab is left open where it stopped\./);
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

// The record person beside the tree person, fact by fact
const factTexts = (facts) => Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, v.text]));

test('recordFacts(): a baptized child\'s birth, christening and sex; a parent only named', () => {
  const r = record('baptism-1846');
  const [lars, halvor] = w.recordPeople(r);
  assert.deepEqual(plain(factTexts(w.recordFacts(lars, r))), {
    Name: 'Lars', Sex: 'Male', Birth: '16 July 1846',  // the day of birth before the baptism's: the same year
    Christening: '23 August 1846, Vågå'
  });
  assert.deepEqual(plain(factTexts(w.recordFacts(halvor, r))), { Name: 'Halvor Larsen', Sex: 'Male' });
});

test('recordFacts(): a burial\'s death, age and residence; a census age gives a year about', () => {
  const b = record('burial-1854');
  assert.deepEqual(plain(factTexts(w.recordFacts(w.recordPeople(b)[0], b))), {
    Name: 'Lars Larsen Holt-Sletten', Sex: 'Male', Birth: '1797', Burial: '18 April 1854, Vinger', Residence: '1854, Aasen',
    Death: '12 April 1854', Occupation: 'Lægdslem'
  });
  const c = record('census-1865');
  const lars = w.recordPeople(c).find((p) => p.current);
  const facts = plain(factTexts(w.recordFacts(lars, c)));
  assert.equal(facts.Birth, 'about 1848 (age 17), Vaage');
  assert.equal(facts.Residence, '1865, Fjeld nordre, Bryn, Vågå');
  assert.equal(facts.Occupation, 'Tjener');
});

test('factsTable(): FS\'s facts beside the record\'s, the agreements and differences marked', () => {
  const { win, state } = checkedPage();
  state.fs = { ...LARS_1846, christening: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } };
  const [lars, halvor] = state.people;
  const rows = (table) => [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent).join(' | '));
  const tree = win.treePool(state.fs, {});
  assert.deepEqual(plain(rows(win.factsTable(lars, state.record, tree[0], false))), [
    'Name | Lars | ✓ Lars Halvorsen',
    'Sex | Male | ✓ Male',
    'Birth | 16 July 1846 | ✓ 16 July 1846',
    'Christening | 23 August 1846, Vågå | ✓ 23 August 1846, Vågå, Oppland, Norway'
  ]);
  // a relative known only from the family card: the lifespan's years, and a note
  const father = tree.find((p) => p.pid === 'TEST-HAL');
  assert.deepEqual(plain(rows(win.factsTable(halvor, state.record, father, false))), [
    'Name | Halvor Larsen | ✓ Halvor Larsen', 'Sex | Male | ', 'Birth |  | 1810', 'Death |  | 1880',
    ' |  | Only the years are known here; the details could not be read from FamilySearch.'
  ]);
  assert.match(win.factsTable(halvor, state.record, father, true).textContent, /Reading the details from FamilySearch…/);
  // another year of birth: marked as a difference
  state.fs = { ...LARS_1846, birth: { date: '1849' } };
  const table = win.factsTable(lars, state.record, win.treePool(state.fs, {})[0], false);
  assert.match(rows(table)[2], /^Birth \| 16 July 1846 \| ✗ 1849$/);
  assert.equal(table.querySelectorAll('tr.differs').length, 1);
});

// --- A new person on FamilySearch ---------------------------------------------------
// A baptism's page with the given people paired (by name in the record)
function pairedPage(chrome, record, pairs) {
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', chrome, fast: true });
  win.Element.prototype.scrollIntoView = () => {};
  const state = value(win, 'state');
  const r = win.extractRecord(fixtureDoc(win, 'da/' + record + '.html'), fixtureUrl('da/' + record + '.html'));
  Object.assign(state, { record: r, people: win.recordPeople(r) });
  win.fillSource(r);
  state.rows = state.people.map((p) => win.personRow(p, win.treePool(LARS_1846, {}), pairs[p.name]));
  win.document.getElementById('people').replaceChildren(...state.rows.map((row) => row.node));
  const rowOf = (name) => state.rows.find((row) => row.name === name);
  return { win, state, rowOf, $: (id) => win.document.getElementById(id) };
}
const PARENTS = { 'Halvor Larsen': 'TEST-HAL', 'Astri Larsdatter': 'TEST-AST' };

test('newPersonDraft(): a baptized child by given name, with the father\'s patronymic and FS\'s form of the place', () => {
  const { win, rowOf } = pairedPage(undefined, 'baptism-1846', PARENTS);
  const draft = plain(win.newPersonDraft(rowOf('Lars')));
  assert.equal(draft.given, 'Lars');
  assert.equal(draft.surname, 'Halvorsen');
  assert.equal(draft.sex, 'male');
  assert.equal(draft.birthDate, '16 July 1846');
  assert.equal(draft.birthPlace, 'Vågå, Oppland, Norway');
  assert.equal(draft.deathDate, '');
  assert.match(draft.notes.join(' '), /Christening: 23 August 1846, Vågå/);
});

test('newPersonDraft(): the patronymic is the surname, a farm after it left out; a burial\'s death and place', () => {
  const { win, rowOf } = pairedPage(undefined, 'burial-1854', {});
  const draft = plain(win.newPersonDraft(rowOf('Lars Larsen Holt-Sletten')));
  assert.equal(draft.given, 'Lars');
  assert.equal(draft.surname, 'Larsen');
  assert.equal(draft.birthDate, 'about 1797');  // from the age
  assert.equal(draft.deathDate, '12 April 1854');
  assert.equal(draft.deathPlace, 'Vinger, Hedmark, Norway');
  assert.match(draft.notes[0], /Left out of the name: Holt-Sletten/);
});

test('fsDateText() and fsPlace(): dates and places as FS\'s form takes them', () => {
  assert.equal(w.fsDateText({ year: 1846, month: 7, day: 16 }), '16 July 1846');
  assert.equal(w.fsDateText({ year: 1846, month: 7 }), 'July 1846');
  assert.equal(w.fsDateText({ year: 1848 }, true), 'about 1848');
  assert.equal(w.fsDateText(null), '');
  const c = record('census-1865');
  assert.equal(w.fsPlace('Vaage', c), 'Vågå, Oppland, Norway');  // DA's old name, FS's municipality
  assert.equal(w.fsPlace('Nowhere', c), 'Nowhere, Oppland, Norway');
  assert.equal(w.fsPlace('', c), '');
  // Oslo's neighbour Aker, added for searching, doesn't make Christiania two places
  assert.equal(w.fsPlace('Christiania', c), 'Kristiania, Oslo, Norway');  // as the record names it
  assert.equal(w.fsPlace('Kristiania', c), 'Kristiania, Oslo, Norway');
  for (const short of ['Chra.', 'Chria', 'Chrania', 'Kria.']) {  // a clerk's abbreviations
    assert.equal(w.fsPlace(short, c), 'Kristiania, Oslo, Norway', short);
  }
  assert.equal(w.fsPlace('Oslo', c), 'Oslo, Oslo, Norway');
  // a place the record only names (a census's birthplace): found anywhere in Norway,
  // the county first, and never given the census's county when it isn't found there
  assert.equal(w.fsPlace('Christiania', c, true), 'Kristiania, Oslo, Norway');
  assert.equal(w.fsPlace('Vaage', c, true), 'Vågå, Oppland, Norway');
  assert.equal(w.fsPlace('Bergen', c, true), 'Bergen, Hordaland, Norway');  // DA's county of its own, FS's Hordaland
  assert.equal(w.fsPlace('Nowhere', c, true), 'Nowhere, Norway');
});

// --- Adding the record's facts to FamilySearch ---------------------------------------
test('mergeDate(): the more specific where the two agree, the record\'s where they disagree', () => {
  assert.equal(w.mergeDate({ year: 1846, month: 7, day: 16 }, false, '1846'), '16 July 1846');
  assert.equal(w.mergeDate({ year: 1846 }, false, '16 July 1846'), '16 July 1846');
  assert.equal(w.mergeDate({ year: 1846, month: 7, day: 16 }, false, '1849'), '16 July 1846');
  assert.equal(w.mergeDate({ year: 1846, month: 7, day: 16 }, false, '18 July 1846'), '16 July 1846');
  assert.equal(w.mergeDate({ year: 1846 }, false, 'abt 1846'), '1846');  // a year of record over FS's about
  assert.equal(w.mergeDate({ year: 1846, month: 7, day: 16 }, false, 'before 1850'), '16 July 1846');
  // a year from an age: FS's within three years stays, an empty one gets "about"
  assert.equal(w.mergeDate({ year: 1848 }, true, '1847'), '1847');
  assert.equal(w.mergeDate({ year: 1848 }, true, '1840'), 'about 1848');
  assert.equal(w.mergeDate({ year: 1848 }, true, ''), 'about 1848');
  assert.equal(w.mergeDate(null, false, '1847'), '1847');
});

test('mergePlace(): FS\'s when it names the record\'s place, else the record\'s in FS\'s form', () => {
  const c = record('census-1865');
  assert.equal(w.mergePlace('Vågå', 'Vågå, Oppland, Norway', c), 'Vågå, Oppland, Norway');
  assert.equal(w.mergePlace('Vaage', 'Vaga, Oppland, Norway', c), 'Vaga, Oppland, Norway');  // one place by other names
  assert.equal(w.mergePlace('Vågå', 'Vågå kirke, Vågå, Oppland, Norway', c), 'Vågå kirke, Vågå, Oppland, Norway');
  assert.equal(w.mergePlace('Vågå herred*', 'Norway', c), 'Vågå, Oppland, Norway');  // FS's less specific
  assert.equal(w.mergePlace('Vågå', 'Lom, Oppland, Norway', c), 'Vågå, Oppland, Norway');  // they disagree
  assert.equal(w.mergePlace('Vågå', 'Lom, Oppland, Norway', c, true), 'Lom, Oppland, Norway');  // only implied
  assert.equal(w.mergePlace('Vågå', '', c, true), 'Vågå, Oppland, Norway');
  assert.equal(w.mergePlace('', 'Lom, Oppland, Norway', c), 'Lom, Oppland, Norway');
  assert.equal(w.cleanPlace('1029P Audnedal'), 'Audnedal');
});

test('a row offers the additions unticked; ticked and edited they reach the plan and the summary, and outlive a redraw', () => {
  const { win, state, $ } = checkedPage();
  state.fs = LARS_1846;  // no christening on FS
  const lars = state.rows.find((r) => r.person.name === 'Lars');
  lars.showFacts();
  const box = lars.node.querySelector('.additions');
  assert.ok(box);
  const items = [...box.querySelectorAll('li')];
  const christening = items.find((li) => /Add the christening/.test(li.textContent));
  const tick = christening.querySelector('input[type=checkbox]');
  assert.equal(tick.checked, false);
  assert.equal(christening.querySelector('.add-fields').hidden, true);
  assert.equal($('changes').hidden, true);
  assert.deepEqual(plain(win.readPlan(true).pairs.find((p) => p.pid === 'TEST-LAR').additions), []);

  tick.checked = true;
  tick.dispatchEvent(new win.Event('change'));
  const place = christening.querySelector('input.place');
  assert.equal(place.value, 'Vågå, Oppland, Norway');
  place.value = 'Vågå kirke, Vågå, Oppland, Norway';
  place.dispatchEvent(new win.Event('input'));
  assert.equal($('changes').hidden, false);
  assert.match($('changes-list').textContent, /^Lars \(TEST-LAR\): add the christening: 23 August 1846, Vågå kirke, Vågå, Oppland, Norway$/);
  const reason = lars.node.querySelector('.add-reason textarea');
  assert.match(reason.value, /^From ".+", Digitalarkivet, Permanent ID pd99\d+\.$/);

  lars.showFacts();  // redrawn: the tick and the place stay
  const again = [...lars.node.querySelectorAll('.additions li')].find((li) => /Add the christening/.test(li.textContent));
  assert.equal(again.querySelector('input[type=checkbox]').checked, true);
  assert.equal(again.querySelector('input.place').value, 'Vågå kirke, Vågå, Oppland, Norway');
  const added = plain(win.readPlan(true).pairs.find((p) => p.pid === 'TEST-LAR').additions);
  assert.equal(added.length, 1);
  assert.equal(added[0].type, 'CHRISTENING');
  assert.deepEqual(added[0].value, { date: '23 August 1846', place: 'Vågå kirke, Vågå, Oppland, Norway' });
  assert.equal(added[0].reason, reason.value.trim());

  // emptied: the plan says so instead of saving nothing
  const date = again.querySelector('input.date');
  for (const input of [date, again.querySelector('input.place')]) { input.value = ''; input.dispatchEvent(new win.Event('input')); }
  assert.throws(() => win.readPlan(true), /"Add the christening" for Lars is empty/);
});

// The christening FS lacks, ticked on Lars's row
function withChristening(chrome) {
  const page = checkedPage(chrome);
  page.state.fs = LARS_1846;
  const lars = page.state.rows.find((r) => r.person.name === 'Lars');
  lars.showFacts();
  const item = [...lars.node.querySelectorAll('.additions li')].find((li) => /Add the christening/.test(li.textContent));
  const tick = item.querySelector('input[type=checkbox]');
  tick.checked = true;
  tick.dispatchEvent(new page.win.Event('change'));
  return page;
}

test('A fact ticked to be added ticks its tag, unticked with it; it is tagged after saving, not when attaching', () => {
  const page = checkedPage(fakeFs({}).chrome);
  page.state.fs = LARS_1846;
  const lars = page.state.rows.find((r) => r.person.name === 'Lars');
  lars.showFacts();
  const tagBox = [...lars.node.querySelectorAll('.tags label')].find((l) => l.textContent === 'Christening').querySelector('input');
  const tick = (on) => {
    const box = [...lars.node.querySelectorAll('.additions li')].find((li) => /Add the christening/.test(li.textContent)).querySelector('input[type=checkbox]');
    box.checked = on;
    box.dispatchEvent(new page.win.Event('change'));
  };
  const pair = () => page.win.readPlan(true).pairs.find((p) => p.pid === 'TEST-LAR');
  tagBox.checked = false;
  tick(true);
  assert.equal(tagBox.checked, true);
  assert.ok(!pair().tags.includes('Christening'));  // left to the tag step after the christening is saved
  assert.equal(pair().additions[0].type, 'CHRISTENING');
  tick(false);
  assert.equal(tagBox.checked, false);  // ticked by the addition, unticked with it
  assert.ok(!pair().tags.includes('Christening'));
  // Ticked by the user before: it stays, and is set when attaching once the addition is unticked
  tagBox.checked = true;
  tick(true);
  tick(false);
  assert.equal(tagBox.checked, true);
  assert.ok(pair().tags.includes('Christening'));
});

test('prepareAdditions(): the ticked facts are filled in FS\'s forms in the hidden window, not saved, and FS\'s standard place goes into the box', async () => {
  const { chrome, asked, windows } = fakeFs({
    addFact: ({ addition, save }, url) => (url.endsWith('/tree/person/details/TEST-LAR') && !save ? {
      ok: true,
      fields: [{ name: 'date', value: addition.value.date, picked: addition.value.date }, { name: 'place', value: 'Vågå, Oppland, Norway', picked: 'Vågå Oppland, Norway Municipality, 1838 - 2019' }]
    } : { ok: false, error: 'saved or wrong page' })
  });
  const { win, state, $ } = withChristening(chrome);
  const lars = state.rows.find((r) => r.person.name === 'Lars');
  const place = () => [...lars.node.querySelectorAll('.additions li')].find((li) => /Add the christening/.test(li.textContent)).querySelector('input.place');
  place().value = 'Vaagaa';
  place().dispatchEvent(new win.Event('input'));
  await win.prepareAdditions();
  assert.deepEqual(plain(asked.map(([name, args]) => [name, args.pid, args.save, args.addition.value.place])), [['addFact', 'TEST-LAR', false, 'Vaagaa']]);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].open, false);  // the hidden window closed
  assert.equal(place().value, 'Vågå, Oppland, Norway');  // FS's standard form, the row redrawn
  const note = lars.node.querySelector('.checked-note');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /^Checked with FamilySearch: Date: 23 August 1846; Place: Vågå, Oppland, Norway$/);
  assert.match($('changes-status').textContent, /^Checked with FamilySearch: look the dates/);
  assert.equal(plain(win.readPlan(true).pairs.find((p) => p.pid === 'TEST-LAR').additions)[0].value.place, 'Vågå, Oppland, Norway');
  // edited after: the note goes
  place().value = 'Vågå kirke, Vågå, Oppland, Norway';
  place().dispatchEvent(new win.Event('input'));
  assert.equal(lars.node.querySelector('.checked-note').hidden, true);
});

test('run(): a ticked fact is saved on the tree person once the source is attached, then tagged with it', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    addFact: (args, url) => (url.endsWith('/tree/person/details/TEST-LAR') ? { ok: true, fields: [], shown: 'Christening 23 August 1846 Vågå' } : { ok: false, error: 'wrong page' }),
    tagFact: () => ({ ok: true })
  });
  const { win, $ } = withChristening(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name, args]) => name + (args.pid ? ' ' + args.pid : ''))),
    ['findSource', 'createSource', 'attach TEST-LAR', 'attach TEST-HAL', 'addFact TEST-LAR', 'tagFact TEST-LAR']);
  assert.ok(!asked[2][1].tags.includes('Christening'));  // tagged once saved, below
  const [, add] = asked[4];
  assert.equal(add.save, true);
  assert.equal(add.addition.type, 'CHRISTENING');
  assert.deepEqual(plain(add.addition.value), { date: '23 August 1846', place: 'Vågå, Oppland, Norway' });
  assert.match(add.reason, /^From ".+", Digitalarkivet, Permanent ID pd99\d+\.$/);
  const [, tag] = asked[5];
  assert.deepEqual(plain([tag.type, tag.sourceId, tag.title]), ['CHRISTENING', 'TEST-S05', $('f-title').value]);
  assert.ok(tag.match.includes('1846'));  // the fact of that year, if FS has several
  assert.match($('log').textContent, /Lars: add the christening: 23 August 1846, Vågå, Oppland, Norway\./);
  assert.match($('log').textContent, /The source is tagged to it\./);
  assert.deepEqual(tabs.closed, [2]);  // all done: the work tab closed
});

test('run(): a fact FS has by now (saved by an earlier run) is not saved again, only tagged; the rows learn it', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    readPerson: (url) => (url.endsWith('/TEST-LAR') ? { person: { ...LARS_1846, christening: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } } } : { error: 'not here' }),
    addFact: () => { throw new Error('not saved twice'); },
    tagFact: () => ({ ok: true, already: true })
  });
  const { win, $, state } = withChristening(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'createSource', 'attach', 'attach', 'tagFact']);
  assert.match($('log').textContent, /Lars has this on FamilySearch already \(add the christening: 23 August 1846, Vågå, Oppland, Norway\); not changed\./);
  assert.match($('log').textContent, /The source was tagged to it already\./);
  assert.deepEqual(tabs.closed, [2]);
  // The page now knows FS has it: not offered again
  const lars = state.rows.find((r) => r.person.name === 'Lars');
  assert.ok(![...lars.node.querySelectorAll('.additions li')].some((li) => /Add the christening/.test(li.textContent)));
});

test('run(): a change FS finds it has already (its Save stays off) is logged as such and tagged, not a failure', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    addFact: () => ({ ok: true, fields: [], unchanged: true }),
    tagFact: () => ({ ok: true })
  });
  const { win, $ } = withChristening(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name]) => name)).slice(-2), ['addFact', 'tagFact']);
  assert.match($('log').textContent, /Lars has this on FamilySearch already \(add the christening: .*\); not changed\./);
  assert.doesNotMatch($('log').textContent, /left open/);
  assert.deepEqual(tabs.closed, [2]);
});

// chrome.storage.local in memory, with its onChanged
function memoryStorage(kept = {}) {
  return { local: { async get(key) { return key in kept ? { [key]: kept[key] } : {}; }, async set(items) { Object.assign(kept, items); } }, kept };
}

test('run(): what was done is kept for the search page, by the record\'s permanent IDs; a run again replaces it', async () => {
  const answers = {
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    addFact: () => ({ ok: true, fields: [], shown: 'Christening 23 August 1846 Vågå' }),
    tagFact: () => ({ ok: true })
  };
  const { chrome } = fakeFs(answers);
  const storage = memoryStorage({ done: [{ key: 'pd99000000000777', ids: ['pd99000000000777'], time: 1, ok: true, sources: [], changes: [] }] });
  chrome.storage = storage;
  const { win, state } = withChristening(chrome);
  await win.run(true);
  let done = plain(storage.kept.done);
  assert.equal(done.length, 2);
  const [entry] = done;  // the latest first
  for (const p of state.record.people) assert.ok(entry.ids.includes(p.id), p.name);
  assert.equal(entry.key, state.record.primaryPersonId);
  assert.equal(entry.ok, true);
  assert.equal(entry.attach, true);
  assert.deepEqual(entry.sources.map((s) => [s.id, s.persons.map((p) => p.pid)]), [['TEST-S05', ['TEST-LAR', 'TEST-HAL']]]);
  assert.deepEqual(entry.changes.map((c) => c.pid), ['TEST-LAR']);
  assert.match(entry.changes[0].what, /christening/);
  // the same record again, a step failing: one entry for it, the latest
  const again = fakeFs({ ...answers, findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S05', title }] }),
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-LAR', name: 'Lars' }] }),
    editSource: () => ({ ok: true, sourceId: 'TEST-S05', changed: [], missing: [] }),
    attach: () => ({ ok: false, error: 'refused' }) });
  again.chrome.storage = storage;
  await withChristening(again.chrome).win.run(true);
  done = plain(storage.kept.done);
  assert.deepEqual(done.map((e) => e.key), [entry.key, 'pd99000000000777']);
  assert.equal(done[0].ok, false);
  assert.deepEqual(done[0].sources[0].persons.map((p) => p.pid), ['TEST-LAR']);
});

test('onTreeAlready(): the same vital in FS\'s standard form; a residence of the year; an alternate name', () => {
  const tree = { name: 'Kjersti Halvorsdatter', altNames: ['Kjersti Larsen'], birth: { date: '4 July 1864', place: 'Oslo, Norway' }, residences: [{ date: '1900', place: 'Vågå, Oppland, Norway' }] };
  const edit = (date, place) => ({ action: 'edit', type: 'BIRTH', value: { date, place } });
  assert.equal(w.onTreeAlready(tree, edit('4 July 1864', 'Oslo, Oslo, Norway')), true);
  assert.equal(w.onTreeAlready(tree, edit('4 July 1864', 'Christiania, Norway')), true);
  assert.equal(w.onTreeAlready(tree, edit('5 July 1864', 'Oslo, Oslo, Norway')), false);
  assert.equal(w.onTreeAlready(tree, edit('4 July 1864', 'Bakken nedre, Oslo, Oslo, Norway')), false);
  assert.equal(w.onTreeAlready(tree, { action: 'add', type: 'RESIDENCE', value: { date: '1900', place: 'Bakken nedre, Vågå, Oppland, Norway' } }), true);
  assert.equal(w.onTreeAlready(tree, { action: 'add', type: 'RESIDENCE', value: { date: '1865', place: 'Vågå, Oppland, Norway' } }), false);
  assert.equal(w.onTreeAlready(tree, { action: 'name', type: 'ALTERNATE_NAME', value: { given: 'Kjersti', surname: 'Larsen' } }), true);
  assert.equal(w.onTreeAlready(tree, { action: 'name', type: 'ALTERNATE_NAME', value: { given: 'Kjersti', surname: 'Olsen' } }), false);
});

test('run(): a fact not saved is not tagged, and leaves the FS tab open; nothing is added where the source was not attached', async () => {
  const failing = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    addFact: () => ({ ok: false, error: 'FamilySearch did not save the christening: Invalid date' }),
    tagFact: () => { throw new Error('not tagged without the fact'); }
  });
  let page = withChristening(failing.chrome);
  await page.win.run(true);
  assert.deepEqual(plain(failing.asked.map(([name]) => name)).slice(-1), ['addFact']);
  assert.match(page.$('log').textContent, /Not changed for Lars \(add the christening: .*\): FamilySearch did not save the christening: Invalid date/);
  assert.match(page.$('log').textContent, /The FamilySearch tab is left open where it stopped\./);
  assert.deepEqual(failing.tabs.closed, []);

  const unattached = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: ({ pid }) => (pid === 'TEST-LAR' ? { ok: false, error: 'refused' } : { ok: true, tagged: { changed: [], notes: [] } }),
    addFact: () => { throw new Error('nothing added without the source'); }
  });
  page = withChristening(unattached.chrome);
  await page.win.run(true);
  assert.equal(unattached.asked.some(([name]) => name === 'addFact'), false);
  assert.match(page.$('log').textContent, /Nothing added to Lars \(TEST-LAR\): the source is not attached\./);
});

test('additionText(): an alternate name as written, given names before the surname', () => {
  const name = { fact: 'Name', action: 'name', type: 'ALTERNATE_NAME', value: { given: 'Astri', surname: 'Larsdatter', nameType: 'AKA' } };
  assert.equal(w.additionText(name), 'Astri Larsdatter (Also known as)');
});

test('factAdditions(): a christening FS lacks; a birth date FS has as a year only', () => {
  const { win, state } = checkedPage();
  const lars = state.people.find((p) => p.name === 'Lars');
  const halvor = state.people.find((p) => p.name === 'Halvor Larsen');
  const adds = (person, pid, name) => plain(win.factAdditions(person, state.record, { pid }, name)).map((a) => [a.fact, a.action, a.value]);
  state.fs = LARS_1846;
  assert.deepEqual(adds(lars, 'TEST-LAR'), [['Christening', 'add', { date: '23 August 1846', place: 'Vågå, Oppland, Norway' }]]);
  // only the family card's lifespan known: nothing offered
  assert.deepEqual(adds(halvor, 'TEST-HAL'), []);
  // FS's year and country: the record's day, FS's place kept (the record gives none)
  state.fs = { ...LARS_1846, birth: { date: '1846', place: 'Norway' }, christening: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } };
  const birth = plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' }));
  assert.deepEqual(birth.map((a) => [a.fact, a.action, a.current, a.value]), [['Birth', 'edit', '1846, Norway', { date: '16 July 1846', place: 'Norway' }]]);
  // a name the row gives that FS has neither as the name nor as an alternate one
  assert.deepEqual(adds(lars, 'TEST-LAR', 'Lars Halvorsøn')[0], ['Name', 'name', { given: 'Lars', surname: 'Halvorsøn', nameType: 'AKA' }]);
  state.fs = { ...state.fs, altNames: ['Lars Halvorsøn'] };
  assert.deepEqual(adds(lars, 'TEST-LAR', 'Lars Halvorsøn').filter(([fact]) => fact === 'Name'), []);
});

test('factAdditions(): a burial\'s death date into FS\'s year, the burial, residence and occupation added', () => {
  const { win, state } = checkedPage();
  const b = record('burial-1854');
  const lars = w.recordPeople(b)[0];
  state.record = b;
  state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', birth: { date: 'about 1797' }, death: { date: '1854', place: 'Kongsvinger, Hedmark, Norway' }, residences: [], occupations: [] };
  assert.deepEqual(plain(win.factAdditions(lars, b, { pid: 'TEST-LLA' }, 'Lars Larsen Holt-Sletten')).map((a) => [a.fact, a.action, a.value]), [
    // the farm after the patronymic is an address: the name is FS's
    ['Death', 'edit', { date: '12 April 1854', place: 'Kongsvinger, Hedmark, Norway' }],  // the parish of burial doesn't replace FS's place
    ['Burial', 'add', { date: '18 April 1854', place: 'Vinger, Hedmark, Norway' }],
    ['Residence', 'add', { date: '1854', place: 'Aasen, Vinger, Hedmark, Norway', description: 'Aasen' }],
    ['Occupation', 'add', { date: '1854', place: 'Vinger, Hedmark, Norway', description: 'Lægdslem' }]
  ]);
  // FS has the residence of that year and the occupation: not offered again
  state.fs = { ...state.fs, residences: [{ date: '1854', place: 'Vinger' }], occupations: [{ description: 'lægdslem' }] };
  assert.deepEqual(plain(win.factAdditions(lars, b, { pid: 'TEST-LLA' }).map((a) => a.fact)), ['Death', 'Burial']);
});

test('factAdditions(): a death FS has with neither date nor place ("Deceased") is changed, not added', () => {
  const { win, state } = checkedPage();
  const b = record('burial-1854');
  const lars = w.recordPeople(b)[0];
  state.record = b;
  state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', birth: { date: 'about 1797' }, death: { date: '', place: '' }, residences: [], occupations: [] };
  const death = plain(win.factAdditions(lars, b, { pid: 'TEST-LLA' })).find((a) => a.fact === 'Death');
  assert.equal(death.action, 'edit');
  assert.equal(death.value.date, '12 April 1854');
  assert.equal(win.onTreeAlready(state.fs, death), false);
});

test('sameFarm(): one farm in two spellings, d and t as one', () => {
  assert.equal(w.sameFarm('Holden', 'Holten'), true);
  assert.equal(w.sameFarm('Bakken', 'Bakkin'), true);
  assert.equal(w.sameFarm('Holden', 'Hagen'), false);
  assert.equal(w.sameFarm('', ''), false);
});

test('factAdditions(): a deceased died at the farm in the name, in the birthplace\'s spelling; buried at the church', () => {
  const { win, state } = checkedPage();
  const b = record('burial-1854');
  // no residence; the farm after the patronymic, the birthplace the same farm spelled with a t
  const holden = { ...b, fields: { ...b.fields, residence: '', 'last name': 'Larsen Holden' },
    people: b.people.map((p) => ({ ...p, name: 'Lars Larsen Holden', residence: '', birthPlace: 'Holten' })) };
  const lars = w.recordPeople(holden)[0];
  state.record = holden;
  const places = (fs) => {
    state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', residences: [], occupations: [{ description: 'Lægdslem' }], ...fs };
    return Object.fromEntries(plain(win.factAdditions(lars, holden, { pid: 'TEST-LLA' }))
      .filter((a) => a.value.place !== undefined).map((a) => [a.fact, a.value.place]));
  };
  // FS has none: born and died on the farm, in the parish; buried in the parish
  assert.deepEqual(places({}), { Birth: 'Holten, Vinger, Hedmark, Norway', Death: 'Holten, Vinger, Hedmark, Norway', Burial: 'Vinger, Hedmark, Norway' });
  // FS's municipality gets the farm; FS's farm or another town is kept
  const muni = places({ birth: { date: 'about 1797', place: 'Vinger, Hedmark, Norway' }, death: { date: '1854', place: 'Vinger, Hedmark, Norway' } });
  assert.equal(muni.Birth, 'Holten, Vinger, Hedmark, Norway');
  assert.equal(muni.Death, 'Holten, Vinger, Hedmark, Norway');
  const kept = places({ birth: { date: 'about 1797', place: 'Holten, Vinger, Hedmark, Norway' }, death: { date: '1854', place: 'Kongsvinger, Hedmark, Norway' } });
  assert.equal(kept.Birth, undefined);
  assert.equal(kept.Death, 'Kongsvinger, Hedmark, Norway');
  // FS's birth abroad isn't touched
  assert.equal(places({ birth: { date: 'about 1797', place: 'Decorah, Iowa, United States' } }).Birth, undefined);
  // the record's own place of death comes first; a church the record names is the burial's place
  const named = { ...holden, church: 'Austmarka', fields: { ...holden.fields, 'place of death': 'Sletten' } };
  state.record = named;
  state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', residences: [], occupations: [{ description: 'Lægdslem' }] };
  const got = Object.fromEntries(plain(win.factAdditions(lars, named, { pid: 'TEST-LLA' })).map((a) => [a.fact, a.value.place]));
  assert.equal(got.Death, 'Sletten, Vinger, Hedmark, Norway');
  assert.equal(got.Burial, 'Austmarka, Vinger, Hedmark, Norway');
  // a birth farm that isn't the death farm, FS with no place: as before, the farm in Norway
  assert.equal(got.Birth, 'Holten, Norway');
});

test('factAdditions(): a census residence has the farm in its place and the farm and district as its description', () => {
  const { win, state } = checkedPage();
  const c = record('census-1865');
  const lars = w.recordPeople(c).find((p) => p.current);
  state.record = c;
  state.fs = { pid: 'TEST-LAR', name: lars.name, birth: { date: '1848' }, residences: [], occupations: [{ description: 'Tjener' }] };
  const residence = plain(win.factAdditions(lars, c, { pid: 'TEST-LAR' })).find((a) => a.fact === 'Residence');
  assert.deepEqual(residence.value, { date: '1865', place: 'Fjeld nordre, Vågå, Oppland, Norway', description: 'Fjeld nordre, Bryn' });
});

test('factAdditions(): a census birthplace in another county isn\'t given the census\'s county', () => {
  const { win, state } = checkedPage();
  const c = record('census-1865');
  const lars = { ...w.recordPeople(c).find((p) => p.current), birthPlace: 'Christiania' };
  state.record = c;
  state.fs = { pid: 'TEST-LAR', name: lars.name, birth: { date: '4 July 1848' }, residences: [], occupations: [] };
  const birth = plain(win.factAdditions(lars, c, { pid: 'TEST-LAR' })).find((a) => a.fact === 'Birth');
  assert.equal(birth.value.place, 'Kristiania, Oslo, Norway');
  const nowhere = plain(win.factAdditions({ ...lars, birthPlace: 'Nowhere' }, c, { pid: 'TEST-LAR' })).find((a) => a.fact === 'Birth');
  assert.equal(nowhere.value.place, 'Nowhere, Norway');
});

test('factAdditions(): an emigration as a custom event with its destination, unless FS has one that year', () => {
  const { win, state } = checkedPage();
  const e = record('emigration-1902');
  const lars = w.recordPeople(e).find((p) => p.current);
  state.record = e;
  state.fs = { pid: 'TEST-LAR', name: 'Lars Halvorsen', birth: { date: '1843' }, emigration: [], residences: [{ date: '1902' }], occupations: [{ description: 'Farmer' }] };
  assert.deepEqual(plain(win.factAdditions(lars, e, { pid: 'TEST-LAR' })), [
    { fact: 'Emigration', action: 'add', type: 'OTHER_EVENT', title: 'Emigration', value: { date: '5 September 1902', place: 'Oslo, Oslo, Norway', description: 'Destination: Minnesota' } }
  ]);
  state.fs = { ...state.fs, emigration: [{ date: '1902' }] };
  assert.deepEqual(plain(win.factAdditions(lars, e, { pid: 'TEST-LAR' })), []);
  // A protocol DA titles in Norwegian, with no destination in the entry: the place from
  // "Politidistrikt", the destination from the protocol's own title
  const bergen = { ...e, sourceTitle: 'Bergen Politidistrikt, Emigrant protocols, no. 1: Emigrants to America, 1874-1885', county: 'Bergen',
    fields: { ...e.fields, destination: '' } };
  state.record = bergen;
  state.fs = { ...state.fs, emigration: [] };
  const [emigration] = plain(win.factAdditions(lars, bergen, { pid: 'TEST-LAR' }));
  assert.equal(emigration.value.place, 'Bergen, Hordaland, Norway');
  assert.equal(emigration.value.description, 'Destination: America');
  // The protocol's residence: the emigrant's home anywhere in Norway, not in the police
  // district; one abroad (an American going back) isn't added
  const home = (residence) => plain(win.factAdditions({ ...lars, residence }, bergen, { pid: 'TEST-LAR' })).find((a) => a.fact === 'Residence');
  state.fs = { ...state.fs, residences: [] };
  assert.deepEqual(home('Vaage').value, { date: '1902', place: 'Vågå, Oppland, Norway', description: 'Vaage' });
  assert.equal(home('Amerika'), undefined);
  assert.equal(home('Chicago, Illinois'), undefined);
  assert.equal(win.additionReason(e), 'From "' + e.title + '", Digitalarkivet, Permanent ID ' + e.permanentId + '.');
});

test('newPersonRelations(): what the record says comes first, then each paired person as child, spouse or parent', () => {
  const { win, rowOf } = pairedPage(undefined, 'baptism-1846', PARENTS);
  const child = plain(win.newPersonRelations(rowOf('Lars')));
  assert.deepEqual(child[0], { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', label: 'Child of Halvor Larsen and Astri Larsdatter', record: true });
  assert.ok(child.slice(1, 3).every((o) => o.relation === 'child' && o.record && !o.other));
  assert.ok(child.slice(3).every((o) => !o.record));
});

test('newPersonRelations(): the mother of a paired child is the paired father\'s spouse, then the child\'s parent', () => {
  const { win, rowOf } = pairedPage(undefined, 'baptism-1846', { Lars: 'TEST-LAR', 'Halvor Larsen': 'TEST-HAL' });
  const found = plain(win.newPersonRelations(rowOf('Astri Larsdatter'))).filter((o) => o.record);
  assert.deepEqual(found.map((o) => o.label), ['Spouse of Halvor Larsen', 'Parent of Lars']);
});

// An 1891-like census household: the head's married son, his wife and their children
function householdPage(pairs) {
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', fast: true });
  win.Element.prototype.scrollIntoView = () => {};
  const state = value(win, 'state');
  const person = (name, role, roleEnglish, birthYear, more = {}) => ({ id: '', name, role, roleEnglish, birthYear, position: '', birthPlace: '', residence: '', current: false, primary: false, ...more });
  const r = { recordTypeInfo: { type: 'census', prefix: 'pf' }, recordDate: '1891', fields: {}, census: { district: 'Nordlien', residence: 'Bakken nedre' },
    sourceTitle: '1891 census for 0515 Vågå', county: 'Oppland', title: 'Halvor Larsen household - 0515 Vågå - Census, 1891', citation: '', notes: '', others: [], people: [
      person('Halvor Larsen', 'husfader', 'Husfader [head of household]', '1820', { current: true, primary: true }),
      person('Kjersti Olsdatter', 'hustru', 'Hustru [wife]', '1824'),
      person('Lars Halvorsen', 'søn', 'Søn [son]', '1850'),
      person('Astri Olsdatter', 'sønnekone', 'Sønnekone', '1855'),
      person('Ole Larsen', 'sønnesøn', 'Sønnesøn [grandson]', '1880'),
      person('Marte Larsdatter', 'sønnedatter', 'Sønnedatter [granddaughter]', '1884')] };
  Object.assign(state, { record: r, people: win.recordPeople(r) });
  state.rows = state.people.map((p) => win.personRow(p, [], pairs[p.name]));
  win.document.getElementById('people').replaceChildren(...state.rows.map((row) => row.node));
  const rowOf = (name) => state.rows.find((row) => row.name === name);
  return { win, state, rowOf, $: (id) => win.document.getElementById(id) };
}
const HOUSEHOLD = { 'Halvor Larsen': 'TEST-HAL', 'Kjersti Olsdatter': 'TEST-KJE', 'Lars Halvorsen': 'TEST-LAR', 'Astri Olsdatter': 'TEST-AST' };

test('newPersonRelations(): a census grandchild is the child of the head\'s son and his wife, not of the head', () => {
  const { win, rowOf } = householdPage(HOUSEHOLD);
  const found = plain(win.newPersonRelations(rowOf('Ole Larsen'))).filter((o) => o.record);
  assert.deepEqual(found[0], { relation: 'child', anchor: 'TEST-LAR', other: 'TEST-AST', label: 'Child of Lars Halvorsen and Astri Olsdatter', record: true });
  assert.ok(!found.some((o) => o.anchor === 'TEST-HAL' || o.other === 'TEST-KJE'));
});

test('a new person: the father and the mother are chosen from the paired people, the record\'s suggestion first', () => {
  const { win, state, rowOf, $ } = householdPage(HOUSEHOLD);
  win.openNewPerson(rowOf('Ole Larsen'));
  assert.equal($('np-kind').value, 'child');
  assert.equal($('np-father').value, 'TEST-LAR');
  assert.equal($('np-mother').value, 'TEST-AST');
  assert.deepEqual(plain(win.readRelation()), { relation: 'child', anchor: 'TEST-LAR', other: 'TEST-AST', label: 'Child of Lars Halvorsen and Astri Olsdatter' });
  // any paired person as either parent, or one of them
  $('np-father').value = 'TEST-HAL';
  $('np-mother').value = '';
  assert.deepEqual(plain(win.readRelation()), { relation: 'child', anchor: 'TEST-HAL', other: '', label: 'Child of Halvor Larsen' });
  $('np-father').value = '';
  $('np-mother').value = 'TEST-KJE';
  assert.equal(win.readRelation().anchor, 'TEST-KJE');
  $('np-father').value = 'TEST-KJE';
  assert.match(win.readRelation().error, /same person/);
  $('np-father').value = $('np-mother').value = '';
  assert.match(win.readRelation().error, /Choose the father/);
  // a spouse or parent of one paired person
  $('np-kind').value = 'spouse';
  $('np-of').value = 'TEST-LAR';
  assert.deepEqual(plain(win.readRelation()), { relation: 'spouse', anchor: 'TEST-LAR', other: '', label: 'Spouse of Lars Halvorsen' });
  // two who aren't a couple on FS (FS adds a child of two in the couple's family card)
  state.details = { 'TEST-LAR': { pid: 'TEST-LAR', name: 'Lars Halvorsen', gender: 'Male', families: [{ spouse: { pid: 'TEST-OTH' }, children: [] }] } };
  $('np-kind').value = 'child';
  $('np-father').value = 'TEST-LAR';
  $('np-mother').value = 'TEST-AST';
  $('np-mother').dispatchEvent(new win.Event('change'));
  assert.equal($('np-couple').hidden, false);
  assert.match($('np-couple').textContent, /Lars Halvorsen and Astri Olsdatter aren't a couple on FamilySearch/);
  // the record's suggestions set the fields again
  const chip = [...$('new-person').querySelectorAll('.chip')].find((b) => b.textContent === 'Child of Lars Halvorsen and Astri Olsdatter');
  $('np-father').value = '';
  chip.click();
  assert.equal($('np-father').value, 'TEST-LAR');
});

test('a new person on an 1891 page: a grandchild\'s father and mother are the son and his wife', () => {
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', fast: true });
  win.Element.prototype.scrollIntoView = () => {};
  const state = value(win, 'state');
  const r = win.extractRecord(fixtureDoc(win, 'da/census-1891-grandchildren.html'), fixtureUrl('da/census-1891-grandchildren.html'));
  // the head, his wife, the son and his wife on FS (the grandson of the son's name unpaired)
  const pids = ['TEST-HAL', 'TEST-AST', 'TEST-SON', 'TEST-ELD'];
  Object.assign(state, { record: r, people: win.recordPeople(r) });
  state.rows = state.people.map((p, i) => win.personRow(p, [], pids[i] || ''));
  win.document.getElementById('people').replaceChildren(...state.rows.map((row) => row.node));
  const $ = (id) => win.document.getElementById(id);
  const veslemoy = state.rows.find((row) => row.name === 'Veslemøy Halvardsdatter');
  const found = plain(win.newPersonRelations(veslemoy)).filter((o) => o.record);
  assert.deepEqual(found[0], { relation: 'child', anchor: 'TEST-SON', other: 'TEST-ELD', label: 'Child of Halvard Halvardsen and Eldbjørg Halbrandsdatter', record: true });
  assert.ok(!found.some((o) => o.anchor === 'TEST-HAL'));
  win.openNewPerson(veslemoy);
  assert.equal($('np-father').value, 'TEST-SON');
  assert.equal($('np-mother').value, 'TEST-ELD');
});

test('a new person: FS\'s form filled in a tab, the matches shown, Create person pairs the row; the tab closed', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findPerson: () => ({ ok: true, heading: 'Add Child', fields: [{ name: 'birthPlace', value: 'Vågå, Oppland, Norway Municipality, 1781 - 2019', picked: 'Vågå, Oppland, Norway Municipality, 1781 - 2019' }],
      matches: [{ pid: 'TEST-LA2', name: 'Lars Halvorsen', lifespan: '1846–1920', events: ['Birth 16 July 1846'], spouses: [] }] }),
    createPerson: () => ({ ok: true, pid: 'TEST-NEW' }),
    cancelAdd: () => ({ ok: true })
  });
  const { win, state, rowOf, $ } = pairedPage(chrome, 'baptism-1846', PARENTS);
  const lars = rowOf('Lars');
  win.openNewPerson(lars);
  assert.equal($('new-person').hidden, false);
  assert.equal($('np-father').value, 'TEST-HAL');  // by sex: the church book's father and mother
  assert.equal($('np-mother').value, 'TEST-AST');
  assert.equal($('np-given').value, 'Lars');
  assert.equal($('np-surname').value, 'Halvorsen');
  $('np-surname').value = 'Halvorsen';
  await win.findNewPerson();
  assert.deepEqual(plain(asked[0]), ['findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST',
    person: { given: 'Lars', surname: 'Halvorsen', sex: 'male', birthDate: '16 July 1846', birthPlace: 'Vågå, Oppland, Norway', deathDate: '', deathPlace: '' } }]);
  assert.match($('np-results').textContent, /FamilySearch found 1 who may be the same/);
  assert.match($('np-results').textContent, /TEST-LA2/);
  assert.equal(lars.pid(), '', 'nothing paired before the user chooses');
  await win.createNewPerson();
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findPerson', 'createPerson']);
  assert.equal(lars.pid(), 'TEST-NEW');
  assert.equal($('new-person').hidden, true);
  assert.equal(state.adding, null);
  assert.ok(tabs.closed.includes(2));
});

for (const [what, answer, why] of [
  ['linked as the chosen parents\' child, then paired', { ok: true, linked: true }, /linked as child of Halvor Larsen and Astri Larsdatter/],
  ['paired when FS has them as that child already', { ok: true, already: true }, /child of Halvor Larsen and Astri Larsdatter there already/]]) {
  test('a new person: a match FS found is ' + what + '; nothing created', async () => {
    const read = [];
    const { chrome, asked, tabs } = fakeFs({
      findPerson: () => ({ ok: true, fields: [], matches: [{ pid: 'TEST-LA2', name: 'Lars Halvorsen', lifespan: '1846–1920', events: [], spouses: ['Marte Johanne'] }] }),
      addMatch: () => answer,
      createPerson: () => { throw new Error('not to be created'); },
      cancelAdd: () => ({ ok: true }),
      readPerson: (url) => { read.push(url); return { error: 'not read' }; }
    });
    const { win, rowOf, $ } = pairedPage(chrome, 'baptism-1846', PARENTS);
    const lars = rowOf('Lars');
    win.openNewPerson(lars);
    await win.findNewPerson();
    assert.match($('np-results').textContent, /Using one adds them on FamilySearch as child of Halvor Larsen and Astri Larsdatter, unless they are already/);
    [...$('np-results').querySelectorAll('button')].find((b) => b.textContent === 'Use this person').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(lars.pid(), 'TEST-LA2');
    const steps = asked.map(([name]) => name).filter(Boolean);
    assert.deepEqual(plain(steps.slice(0, 2)), ['findPerson', 'addMatch']);
    assert.ok(!steps.includes('createPerson'));
    assert.deepEqual(plain(asked[1][1]), { pid: 'TEST-LA2', relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST' });
    assert.match(lars.node.textContent, why);
    // a link made: the family read again from FS in the work tab (the kept pages lack it)
    if (answer.linked) assert.ok(read.some((url) => /details\/TEST-HAL/.test(url)));
    assert.ok(tabs.closed.includes(2));
    assert.equal($('new-person').hidden, true);
  });
}

test('a new person: an error on FS leaves its tab open and the row as it was', async () => {
  const { chrome, tabs } = fakeFs({
    findPerson: () => ({ ok: true, fields: [], matches: [] }),
    createPerson: () => ({ ok: false, error: 'FamilySearch did not show the new person in time. Look for them on the FamilySearch tab, and type their PID on the linker page.' }),
    cancelAdd: () => ({ ok: true })
  });
  const { win, rowOf, $ } = pairedPage(chrome, 'baptism-1846', PARENTS);
  const lars = rowOf('Lars');
  win.openNewPerson(lars);
  await win.findNewPerson();
  assert.match($('np-results').textContent, /FamilySearch found no one who may be the same/);
  await win.createNewPerson();
  assert.equal(lars.pid(), '');
  assert.match($('np-results').textContent, /did not show the new person in time.*left open/s);
  assert.deepEqual(plain(tabs.closed), []);
  assert.equal($('new-person').hidden, false);
});

test('a new person: the row\'s select offers it, and choosing it opens the sidebar without changing the row', () => {
  const { win, rowOf, $ } = pairedPage(undefined, 'baptism-1846', PARENTS);
  const lars = rowOf('Lars');
  const select = lars.node.querySelector('select');
  assert.ok([...select.options].some((o) => o.value === 'new'));
  select.value = 'new';
  select.dispatchEvent(new win.Event('change'));
  assert.equal(select.value, '');
  assert.equal($('new-person').hidden, false);
  assert.match($('new-person').textContent, /From the record: Lars, /);
});

test('run(): a source of this title for another record is not written over or attached', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S01', title }] }),
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-OLE', name: 'Ole Olsen' }] }),
    editSource: () => ({ ok: false, otherRecord: true, sourceId: 'TEST-S01', other: 'pd99000000000077', error: 'another record' }),
    attach: () => { throw new Error('not attached to another record\'s source'); }
  });
  const { win, $ } = checkedPage(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'attachedTo', 'editSource']);
  assert.match($('log').textContent, /The source TEST-S01 in your SourceBox has this title but is of another record \(pd99000000000077\); nothing was changed\. Give this source another title/);
  assert.deepEqual(plain(tabs.closed), []);
});

test('formerTitle(): the title a source got before 1.6.0, the year in front', () => {
  assert.equal(w.formerTitle('Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth', '1846'), '1846, Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth');
  assert.equal(w.formerTitle('Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census, 1865', '1865'),
    '1865, Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census');
  assert.equal(w.formerTitle('1846, Lars Halvorsen - Vågå - Birth', '1846'), '');  // a year in front already
  assert.equal(w.formerTitle('Lars Halvorsen - Vågå - Birth', ''), '');
});

test('run(): a source under its former, year-first title is used, given the new title, not made again', async () => {
  const { chrome, asked } = fakeFs({
    findSource: ({ title, older }) => ({ ok: true, sources: [{ id: 'TEST-S07', title: older[0] }], title: older[0] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: () => ({ ok: true, sourceId: 'TEST-S07', changed: ['title'], missing: [] }),
    attach: () => ({ ok: true })
  });
  const { win, $ } = checkedPage(chrome);
  const title = $('f-title').value;
  await win.run(false);
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'attachedTo', 'editSource']);
  assert.match(asked[0][1].older[0], /^1846, /);
  assert.equal(asked[2][1].title, asked[0][1].older[0]);  // found in the SourceBox by its former title
  assert.equal(asked[2][1].source.title, title);  // and given the new one
  assert.match($('log').textContent, /under its former title "1846, /);
});

test('lookUpSource(): a census source under its former title is searched for by that title', async () => {
  const titles = [];
  const { chrome } = fakeFs({
    findSource: ({ title }) => { titles.push(title); return { ok: true, sources: /^1865, /.test(title) ? [{ id: 'TEST-S08', title }] : [] }; },
    attachedTo: () => ({ ok: true, persons: [] })
  });
  const { win, state } = checkedPage(chrome);
  state.record = { ...state.record, recordDate: '1865-12-31' };
  const tab = await win.openTab(value(win, 'SOURCEBOX_URL'));
  const found = await win.lookUpSource(tab, 'Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census, 1865');
  assert.deepEqual(titles, ['Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census, 1865', '1865, Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census']);
  assert.equal(found.id, 'TEST-S08');
  assert.equal(found.formerTitle, '1865, Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census');
});

test('run(): a source Home shows by its title is checked and written over like one found', async () => {
  const { chrome, asked } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S06', existing: true }),
    editSource: () => ({ ok: false, otherRecord: true, sourceId: 'TEST-S06', other: '', error: 'another record' }),
    attach: () => { throw new Error('not attached to another record\'s source'); }
  });
  const { win, $ } = checkedPage(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'createSource', 'editSource']);
  assert.equal(asked[2][1].sourceId, 'TEST-S06');
  assert.match($('log').textContent, /is of another record; nothing was changed/);
});

test('fsMessage(): the fact steps\' messages in Bokmål, the fact named in it', () => {
  const nb = load([...SHARED, 'linker.js'], { html: 'linker.html', lang: 'nb', fast: true });
  assert.equal(nb.fsMessage('FamilySearch already has a christening for this person; change it instead.'),
    'FamilySearch har allerede ' + nb.t('Christening').toLowerCase() + ' for denne personen; endre den i stedet.');
  assert.equal(nb.fsMessage('FamilySearch did not save the custom event: Invalid date'), 'FamilySearch lagret ikke egendefinert hendelse: Invalid date');
  assert.equal(nb.fsMessage('FamilySearch shows no button to add the burial.'), 'FamilySearch viser ingen knapp for å legge til ' + nb.t('Burial').toLowerCase() + '.');
  // English as it came
  assert.equal(w.fsMessage('FamilySearch did not save the birth.'), 'FamilySearch did not save the birth.');
});
