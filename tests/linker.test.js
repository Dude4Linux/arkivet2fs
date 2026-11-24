// linker.js: the record's people paired with the FS family, and the renames. The page
// doesn't start without chrome.storage, so its functions are called on their own.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, value, fixtureDoc, fixtureUrl, plain, unnamedBurial, SHARED } = require('./harness.js');

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

test("suggestResidencePairs(): with FS's full birth date, the anchor's age on census day may be a year off, not two", () => {
  const r = record('census-1865-household');  // Halvor Larsen, the open person, is 44 on 31 December 1865
  const head = (fs) => { const people = w.recordPeople(r); const out = w.suggestResidencePairs(r, people, fs, {}, true); return { pairs: out.pairs, why: out.why, people }; };
  const halvor = (people) => people.find((p) => p.current);
  for (const date of ['2 January 1821', '30 December 1821', '10 April 1820', '1819']) {
    const { pairs, people } = head({ ...HALVOR, birth: { date } });
    assert.equal(pairs[halvor(people).key], 'TEST-HAL', date);
  }
  // 46 on census day: two years off, though the year (1819 against about 1822) is within three
  const { pairs, why, people } = head({ ...HALVOR, birth: { date: '10 April 1819' } });
  assert.ok(!pairs[halvor(people).key]);
  assert.ok(!Object.values(pairs).includes('TEST-HAL'));
  assert.match(why[halvor(people).key] || '', /age 46 on census day, here 44/);
  assert.equal(w.ageOff(halvor(people), r, { birth: { date: '1819' } }), null);
});

test('renames carry into the title, the citation and the notes', () => {
  assert.equal(w.renamePhrase('Lars, son of Halvor Larsen - Vågå', 'Lars', 'Lars Halvorsen'), 'Lars Halvorsen, son of Halvor Larsen - Vågå');
  assert.equal(w.renamePhrase('baptism of Lars, 23 August 1846', 'Lars', 'Lars Halvorsen'), 'baptism of Lars Halvorsen, 23 August 1846');
  // whole names only
  assert.equal(w.renamePhrase('Lars Halvorsen Solbakken household - Vågå - "Norway, Census, 1900"', 'Lars Halvorsen', 'X'), 'Lars Halvorsen Solbakken household - Vågå - "Norway, Census, 1900"');
  assert.equal(w.renameNoteLine('Child: Lars *\nFather: Halvor Larsen', 'Child', 'Lars', 'Lars Halvorsen'), 'Child: Lars Halvorsen *\nFather: Halvor Larsen');
  assert.equal(value(w, 'dropChildOf')('Lars Halvorsen, son of Halvor Larsen - Vågå parish - Birth'), 'Lars Halvorsen - Vågå parish - Birth');
});

test('censusKin(): the kin word of a family position', () => {
  assert.equal(w.censusKin({ role: 'hans Fader' }), 'father');
  assert.equal(w.censusKin({ role: 'deres Søn' }), 'child');
  assert.equal(w.censusKin({ role: 'Konens Søster' }), 'kin');
  assert.equal(w.censusKin({ role: 'Tjener' }), '');
  // 1865's town censuses: the above-named's, these', the preceding one's
  assert.equal(w.censusKin({ role: 'Ovennævntes Datter' }), 'child');
  assert.equal(w.censusKin({ role: 'Disses Søn' }), 'child');
  assert.equal(w.censusKin({ role: "Ds's Moder" }), 'mother');
  assert.equal(w.censusKin({ role: 'Den Foregaaendes Søster' }), 'sibling');
  assert.equal(w.censusKin({ role: 'Logerendes Barn' }), '');
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
  // a bride and groom by their roles, not their fathers (bug: a bride's sex was blank)
  assert.equal(w.recordSex({ name: 'Eli Dalbø', role: 'brur', roleEnglish: 'Bride' }), 'Female');
  assert.equal(w.recordSex({ name: 'Eli Dalbø', role: 'brud', roleEnglish: 'Bride' }), 'Female');
  assert.equal(w.recordSex({ name: 'Kolmund Dalbø', role: 'brudgom', roleEnglish: 'Groom' }), 'Male');
  assert.equal(w.recordSex({ name: 'Kolvald Dalbø', role: 'bruras far', roleEnglish: 'Bride\'s Father' }), 'Male');
  assert.equal(w.recordSex({ name: 'Kolvald Dalbø', role: 'brudgommens far', roleEnglish: 'Groom\'s Father' }), 'Male');
});

// A burial's nameless child, "!! Halvorsd.*" for the book's "Serg. Halvor Larsens D.B."
// (the boy baptised three weeks before): DA's star marks the patronymic as the
// transcriber's, made from a misread "D.B.", so it must tell no sex
test('recordSex(): a patronymic DA starred tells no sex', () => {
  const child = { name: '!! Halvorsd.*', role: 'avdød', roleEnglish: 'Deceased', position: 'Serg. Halvor Larsens D.B.' };
  assert.equal(w.recordSex(child), '');
  assert.equal(w.childSex(child, { fields: { role: 'far', gender: 'm' } }), '');
  assert.equal(w.recordSex({ name: 'Lars Halvorsen*' }), '');
  assert.equal(w.recordSex({ name: 'Eli Larsdatter' }), 'Female');
});

// Bug: a compound kin word gave no sex ("hans Søstersøn": Sex —); its last part tells
test('recordSex(): a compound kin word is the sex of its last part', () => {
  const y1865 = { recordDate: '1865' };
  assert.equal(w.recordSex({ name: 'Lars Halvorsen', role: 'hans Søstersøn', roleEnglish: 'hans Søstersøn' }, y1865), 'Male');
  assert.equal(w.recordSex({ name: 'Lars', role: 'Svigersøn' }), 'Male');
  assert.equal(w.recordSex({ name: 'Lars', role: 'hans Stedfader' }), 'Male');
  assert.equal(w.recordSex({ name: 'Eli', role: 'hans Søsterdatter' }), 'Female');
  assert.equal(w.recordSex({ name: 'Eli', role: 'Sønnekone' }), 'Female');
  assert.equal(w.recordSex({ name: 'Eli', role: 'Bedstemoder' }), 'Female');
  assert.equal(w.recordSex({ name: 'Eli', role: 'Svigerdatter' }), 'Female');
  // a kin word's first part says nothing: Søstersøn isn't a sister, Sønnekone isn't a son
  assert.equal(w.recordSex({ name: 'Lars', role: 'Søsterbarn' }), '');
});

// Bug: from 1865 on, a town census gives a wife her husband's surname and a daughter
// her father's, so "Kjersti Halvorsen" (hm) was read as a man and not paired
test('recordSex(): a -sen from 1865 on says nothing; the position and occupation tell', () => {
  const y1801 = { recordDate: '1801' }, y1900 = { recordDate: '1900' };
  assert.equal(w.recordSex({ name: 'Reidar Larsen' }, y1801), 'Male');
  assert.equal(w.recordSex({ name: 'Reidar Larsen' }, y1900), '');
  assert.equal(w.recordSex({ name: 'Kjersti Halvorsen', role: 'hm', roleEnglish: 'Woman of the House' }, y1900), 'Female');
  assert.equal(w.recordSex({ name: 'Lars Halvorsen', role: 'hf', roleEnglish: 'Man of the House' }, y1900), 'Male');
  assert.equal(w.recordSex({ name: 'Eli Larsen', role: 'Ovennævntes Barn' }, { recordDate: '1865' }), '');
  assert.equal(w.recordSex({ name: 'Asgjerd Olsen', role: '', roleEnglish: 'Resident', position: 'Husholderske' }, y1900), 'Female');
  assert.equal(w.recordSex({ name: 'Dagrun Olsen', role: 'tj', roleEnglish: 'Servant', position: 'Telefonistinde' }, y1900), 'Female');
  assert.equal(w.recordSex({ name: 'Per Olsen', role: 'tj', roleEnglish: 'Servant', position: 'Enkemand' }, y1801), 'Male');
});

test('suggestResidencePairs(): a wife with her husband\'s surname in 1900', () => {
  const r = record('census-1900');
  const kjersti = r.people.find((p) => p.name === 'Kjersti Larsdatter');
  kjersti.name = 'Kjersti Halvorsen';
  const people = w.recordPeople(r);
  const fs = { ...LARS_1844, families: [{ ...LARS_1844.families[0], spouse: { ...LARS_1844.families[0].spouse, gender: 'Female' } }] };
  const { pairs } = w.suggestResidencePairs(r, people, fs, {}, true);
  assert.equal(pairs[people.find((p) => p.name === 'Kjersti Halvorsen').key], 'TEST-KJE');
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
  assert.equal(named.title, 'Lars, son of Halvor Larsen - Vågå parish, Vågå local parish 1842-1856 (0515P), Ministerialbok A-13 - Birth, 23 August 1846');
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
  assert.match($('g-title').value, /\(0515P\), Klokkerbok B-10 - Birth, 23 August 1846$/);

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
  // the record's people's entries: a source made from another of them is this record's
  const ids = state.record.people.map((p) => p.id).filter(Boolean);
  assert.ok(ids.length > 1);
  for (const id of ids) assert.ok(asked[2][1].sameRecord.includes(id), id);
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

// A marriage's page, the groom, the bride and the groom's father paired
function marriagePage(chrome) {
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', chrome, fast: true });
  win.Element.prototype.scrollIntoView = () => {};
  const state = value(win, 'state');
  const r = win.extractRecord(fixtureDoc(win, 'da/marriage-bride.html'), fixtureUrl('da/marriage-bride.html'));
  Object.assign(state, { record: r, people: win.recordPeople(r) });
  win.fillSource(r);
  const pairs = { 'Kolmund Finsteinsen Dalbø': 'TEST-KOL', 'Eli Kolvaldsdatter Daltveit': 'TEST-ELI', 'Hans Finsteinsen': 'TEST-HAN' };
  state.rows = state.people.map((p) => win.personRow(p, [], pairs[p.name]));
  win.document.getElementById('people').replaceChildren(...state.rows.map((r) => r.node));
  return { win, state, $: (id) => win.document.getElementById(id) };
}
const stepNames = (asked) => plain(asked.map(([name, args]) => name + (args.pid ? ' ' + args.pid : '')));

test('run(): a marriage\'s source goes to the groom, the bride and their couple relationship, as FS attaches its own', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S07', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    coupleId: (args, url) => ({ ok: true, coupleId: url.endsWith('/details/TEST-KOL') ? 'TEST-C01' : null, sources: ['TEST-S02'] }),
    attachCouple: (args, url) => (url.endsWith('?entityId=TEST-C01&entityType=couple') ? { ok: true } : { ok: false, error: 'not the couple\'s SourceBox' })
  });
  const { win, state, $ } = marriagePage(chrome);
  assert.deepEqual(plain(win.readPlan(true).couple.pids), ['TEST-KOL', 'TEST-ELI']);
  await win.run(true);
  assert.deepEqual(stepNames(asked), ['findSource', 'createSource', 'attach TEST-KOL', 'attach TEST-ELI', 'attach TEST-HAN', 'coupleId TEST-KOL', 'attachCouple']);
  assert.equal(asked[5][1].spouse, 'TEST-ELI');
  const args = asked[6][1];
  assert.deepEqual([args.sourceId, args.coupleId, ...args.pids], ['TEST-S07', 'TEST-C01', 'TEST-KOL', 'TEST-ELI']);
  assert.equal(args.title, $('f-title').value);
  assert.match(args.reason, /^Marriage of Kolmund Finsteinsen Dalbø and Eli Kolvaldsdatter Daltveit \(1849\) on Digitalarkivet, pv99/);
  assert.match($('log').textContent, /Attached to the couple Kolmund Finsteinsen Dalbø and Eli Kolvaldsdatter Daltveit \(TEST-C01\)\./);
  assert.deepEqual(plain(state.fsCheck.sources[0].couples), [{ id: 'TEST-C01', pids: ['TEST-KOL', 'TEST-ELI'] }]);
  assert.deepEqual(plain(tabs.closed), [2]);  // all done
});

test('run(): a marriage changed in the couple relationship after the couple has the source, and tagged by the same step', async () => {
  const { chrome, asked } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S07', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    coupleId: () => ({ ok: true, coupleId: 'TEST-C01', sources: [] }),
    attachCouple: () => ({ ok: true }),
    readPerson: () => ({ person: { pid: 'TEST-KOL', name: 'Kolmund Finsteinsen Dalbø', families: [] } }),
    coupleFact: (args, url) => (url.endsWith('/details/TEST-KOL') ? { ok: true, shown: 'Marriage 22 April 1849', tagged: 'tagged', others: ['1850, Lom'] } : { ok: false, error: 'not the groom\'s page' })
  });
  const { win, state, $ } = marriagePage(chrome);
  const addition = { fact: 'Marriage', action: 'edit', type: 'MARRIAGE', couple: 'TEST-ELI', match: ['1849'], current: '22 Apr 1849, Vaage', value: { date: '22 April 1849', place: 'Vågå, Oppland, Norway' } };
  const plan = win.readPlan(true);
  plan.pairs.find((p) => p.pid === 'TEST-KOL').additions = [{ ...addition, reason: 'From the record.' }];
  win.readPlan = () => plan;
  await win.run(true);
  const names = stepNames(asked);
  assert.ok(names.indexOf('attachCouple') < names.indexOf('coupleFact TEST-KOL'), names.join(', '));
  const args = asked.find(([name]) => name === 'coupleFact')[1];
  assert.deepEqual([args.spouse, args.sourceId, args.save, args.reason], ['TEST-ELI', 'TEST-S07', true, 'From the record.']);
  assert.equal(args.title, $('f-title').value);
  assert.ok(!names.includes('tagFact TEST-KOL'));  // tagged by coupleFact
  assert.match($('log').textContent, /The source is tagged to it\./);
  assert.match($('log').textContent, /FamilySearch has another marriage for the couple, left as it is: 1850, Lom\./);
  assert.equal(state.rows.length, 4);
});

test('run(): a marriage\'s couple that has the source already is left as it is', async () => {
  // on its Attached To page: no couple step at all
  const attachedFs = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S07', title }] }),
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-ELI' }], couples: [{ id: 'TEST-C01', pids: ['TEST-KOL', 'TEST-ELI'] }] }),
    editSource: () => ({ ok: true, sourceId: 'TEST-S07', changed: [], missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } })
  });
  let page = marriagePage(attachedFs.chrome);
  await page.win.run(true);
  assert.deepEqual(stepNames(attachedFs.asked), ['findSource', 'attachedTo', 'editSource', 'attach TEST-KOL', 'attach TEST-HAN']);
  assert.match(page.$('log').textContent, /The couple Kolmund Finsteinsen Dalbø and Eli Kolvaldsdatter Daltveit already has this source on FamilySearch; left as it is\./);
  // among the couple's own sources: not attached again
  const ownFs = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S07', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    coupleId: () => ({ ok: true, coupleId: 'TEST-C01', sources: ['TEST-S07'] }),
    attachCouple: () => { throw new Error('attached twice'); }
  });
  page = marriagePage(ownFs.chrome);
  await page.win.run(true);
  assert.equal(stepNames(ownFs.asked).at(-1), 'coupleId TEST-KOL');
  assert.match(page.$('log').textContent, /already has this source on FamilySearch; left as it is\./);
});

test('run(): a groom and bride who are no couple on FS are said to be, and the run still ends well', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S07', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    coupleId: () => ({ ok: true, coupleId: null, sources: [] }),
    attachCouple: () => { throw new Error('no couple to attach to'); }
  });
  const { win, $ } = marriagePage(chrome);
  await win.run(true);
  assert.equal(stepNames(asked).at(-1), 'coupleId TEST-KOL');
  assert.match($('log').textContent, /are not a couple on FamilySearch, so the source is attached to each of them but not to their marriage/);
  assert.equal($('log').querySelector('.bad'), null);
  assert.deepEqual(plain(tabs.closed), [2]);
});

test('run(): a marriage with only the groom paired, or "Create source only", has no couple step', async () => {
  const { chrome } = fakeFs({});
  const { win, state } = marriagePage(chrome);
  assert.equal(win.readPlan(false).couple, undefined);
  state.rows.find((r) => r.person.role === 'brur').node.querySelector('select').value = '';
  assert.equal(win.readPlan(true).couple, undefined);
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
  // The 1865 census was counted on 31 December: DA's page gives age 17 as "1849
  // (calculated)", and so does the linker (bug: 1848, a year before the search's)
  assert.equal(facts.Birth, 'about 1849 (age 17), Vaage');
  assert.equal(facts.Residence, '1865, Fjeld nordre, Bryn, Vågå');
  assert.equal(facts.Occupation, 'Tjener');
});

// Bug: a census age 22 (b. about 1844) for FS's 16 July 1846 was ≈: with FS's full
// date, the age on census day is compared, one year off ≈ and more ✗
test('compareFact(): a census age against FS\'s full birth date is compared as an age on census day', () => {
  const c = record('census-1865');
  const lars = w.recordPeople(c).find((p) => p.current);
  const da = w.recordFacts(lars, c).Birth;  // age 17, counted on 31 December 1865
  assert.deepEqual([da.age, plain(da.on)], [17, { year: 1865, month: 12, day: 31 }]);
  const fs = (text) => { const date = w.parseFsDate(text); return { text, date, year: date.year }; };
  const how = (text) => w.compareFact('Birth', da, fs(text), lars, null, c);
  assert.equal(how('16 July 1848'), 'same');     // 17 on census day
  assert.equal(how('2 January 1848'), 'same');
  assert.equal(how('16 July 1847'), 'near');     // 18
  assert.equal(how('16 July 1846'), 'differs');  // 19
  assert.equal(how('1846'), 'near');             // no full date: the years, an age's within three
});

test('recordFacts(), deathFarm(): without permanent IDs, only the open person gets the record\'s own fields (bug: anyone else did too)', () => {
  const b = record('burial-1854');
  const bare = { ...b, people: b.people.map((p) => ({ ...p, id: '' })), fields: { ...b.fields, 'place of death': 'Sletten' } };
  const open = bare.people.find((p) => p.current);
  const other = { name: 'Ole Olsen', role: 'Unknown', id: '' };
  assert.equal(w.deathFarm(open, bare), 'Sletten');
  assert.equal(w.deathFarm(other, bare), '');
  assert.equal(plain(factTexts(w.recordFacts(open, bare))).Death, '12 April 1854');
  assert.equal(plain(factTexts(w.recordFacts(other, bare))).Death, undefined);
});

test('recordFacts(): a census\'s full date of birth is the birth, not about a year', () => {
  const file = 'da/census-1900.html';
  const doc = fixtureDoc(w, file);
  for (const label of doc.querySelectorAll('#collapse-persons .row > div:first-child')) {
    const value = label.nextElementSibling;
    if (label.textContent.trim() === 'Age/born:' && value && value.textContent.trim() === '1854') value.textContent = '1854-11-20@46';
  }
  const r = w.extractRecord(doc, fixtureUrl(file));
  const kjersti = w.recordPeople(r).find((p) => p.name === 'Kjersti Larsdatter');
  const birth = w.recordFacts(kjersti, r).Birth;
  assert.equal(birth.text, '20 November 1854, Vågå herred*');
  assert.deepEqual(plain(birth.date), { year: 1854, month: 11, day: 20 });
  assert.equal(birth.year, 1854);
  assert.equal(birth.approx, false);
});

test('recordFacts(): a family word or marital status in the occupation is no occupation', () => {
  // 1900's children have "Søn" and "Datter" where the census asks for the occupation
  const r = record('census-1900');
  const person = (name) => w.recordPeople(r).find((p) => p.name === name);
  assert.equal(w.recordFacts(person('Reidar Larsen'), r).Occupation, undefined);
  assert.equal(w.recordFacts(person('Asgjerd Larsdatter'), r).Occupation, undefined);
  assert.equal(w.recordFacts(person('Kjersti Larsdatter'), r).Occupation.text, 'Husmandskone');
  const occupation = (position) => w.occupationOf(position);
  for (const kin of ['Hustru', 'Hustrue', 'Hustr.', 'Barnet', 'Pige', 'Ugift', 'Hj. Søn', 'Hjemmeværende Datter', 'Ovennævntes Kone', 'Smedens Søn']) {
    assert.equal(occupation(kin), '', kin);
  }
  // a leading marital status isn't part of it
  assert.equal(occupation('Gift Murerarbeider'), 'Murerarbeider');
  assert.equal(occupation('Ugift Tjenestepige'), 'Tjenestepige');
  for (const work of ['Husmandskone', 'Tjenestepige', 'Skipperenke', 'Husmoder', 'Opholdes af sønnen']) assert.equal(occupation(work), work);
});

// Bug: an unnamed child's "Serg. Halvor Larsens D.B." (the sergeant's boy child) was
// offered as the child's occupation; it is the child's relation to the father, whose
// own row has the occupation
test('recordFacts(): a relation to someone named in the position is no occupation', () => {
  const r = w.extractRecord(unnamedBurial(w), fixtureUrl('da/burial-1854.html'));
  const [child, father] = w.recordPeople(r);
  assert.equal(w.recordFacts(child, r).Occupation, undefined);
  assert.equal(w.recordFacts(father, r).Occupation.text, 'Serg.');
  for (const kin of ['Serg. Halvor Larsens D.B.', 'Husmand Ole Olsens Enke', 'Gmd. Lars Halvorsens P. B.', 'Halvor Larsens Søn', 'Inderst Ole Olsens Dtr.', 'Skomager Lars Olsens S.']) {
    assert.equal(w.occupationOf(kin), '', kin);
  }
  for (const work of ['Serg.', 'Husmand under Ole Olsens Gaard', 'Lars Olsens Tjenestepige']) assert.equal(w.occupationOf(work), work);
  // A mother called the father's betrothed in a baptism: a relation, no occupation
  for (const kin of ['Kiæresten', 'hans Kiæreste', 'Kjæreste', 'Halvor Larsens Kiæreste']) assert.equal(w.occupationOf(kin), '', kin);
});

test('recordFacts(): a marriage\'s "Cop." or "Corp." (copulerede, married) is no occupation', () => {
  const r = record('marriage-bride');
  const [groom] = w.recordPeople(r);
  for (const position of ['Cop.', 'Corp.', 'Copul.', 'Copulerede']) {
    assert.equal(w.recordFacts({ ...groom, position }, r).Occupation, undefined, position);
  }
  assert.equal(w.recordFacts({ ...groom, position: 'Gaardmand' }, r).Occupation.text, 'Gaardmand');
  // elsewhere "Corp." is a corporal
  assert.equal(w.occupationOf('Corp.'), 'Corp.');
  assert.equal(w.occupationOf('Corp.', true), '');
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
// A baptism's page with the given people paired (by name in the record); `record` a
// fixture's name, or a function giving the page's document; `fs` the FS person
function pairedPage(chrome, record, pairs, fs = LARS_1846) {
  const win = load([...SHARED, 'linker.js'], { html: 'linker.html', chrome, fast: true });
  win.Element.prototype.scrollIntoView = () => {};
  const state = value(win, 'state');
  const name = typeof record === 'string' ? record : 'burial-1854';
  const doc = typeof record === 'string' ? fixtureDoc(win, 'da/' + record + '.html') : record(win);
  const r = win.extractRecord(doc, fixtureUrl('da/' + name + '.html'));
  Object.assign(state, { record: r, people: win.recordPeople(r) });
  win.fillSource(r);
  state.rows = state.people.map((p) => win.personRow(p, win.treePool(fs, {}), pairs[p.name]));
  win.document.getElementById('people').replaceChildren(...state.rows.map((row) => row.node));
  const rowOf = (name) => state.rows.find((row) => row.name === name);
  return { win, state, rowOf, $: (id) => win.document.getElementById(id) };
}
const PARENTS = { 'Halvor Larsen': 'TEST-HAL', 'Astri Larsdatter': 'TEST-AST' };

// A buried child DA couldn't read the name of is "son of Halvor Larsen" in the title
// (da_record.js); paired with the FS son, the title takes his FS name, and the "son of"
// again when unpaired; a name typed in the row goes there too, a title edited stays
test('unnamedChildTitle(): an unnamed child\'s title follows the tree person paired', () => {
  const SON = { pid: 'TEST-LAR', name: 'Lars Halvorsen', gender: 'Male', father: { pid: 'TEST-HAL', name: 'Halvor Larsen', lifespan: '1820-1890' }, families: [] };
  const { win, state, rowOf, $ } = pairedPage(undefined, unnamedBurial, { '!! Halvorsd.*': 'TEST-LAR', 'Halvor Larsen': 'TEST-HAL' }, SON);
  state.fs = SON;
  const tail = ' - Vinger parish 1847-1855 (0421Q) - Burial, 18 April 1854';
  assert.equal($('f-title').value, 'Lars Halvorsen' + tail);
  const row = rowOf('!! Halvorsd.*');
  const select = row.node.querySelector('select');
  const choose = (pid) => { select.value = pid; select.dispatchEvent(new win.Event('change')); };
  choose('');
  assert.equal($('f-title').value, 'son of Halvor Larsen' + tail);
  choose('TEST-LAR');
  assert.equal($('f-title').value, 'Lars Halvorsen' + tail);
  const name = row.node.querySelector('input.name');
  name.value = 'Lars Halvorsen d.y.';
  name.dispatchEvent(new win.Event('change'));
  assert.equal($('f-title').value, 'Lars Halvorsen d.y.' + tail);
  // edited by hand: left as it is
  $('f-title').value = 'Little Lars' + tail;
  choose('');
  assert.equal($('f-title').value, 'Little Lars' + tail);
});

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

test('givenNamesOnly(), nameParts(): a baptized child\'s given names kept together, not the last as a surname (bug: "Ana" + "Margrethe")', () => {
  const r = w.extractRecord(fixtureDoc(w, 'da/baptism-1846.html'), fixtureUrl('da/baptism-1846.html'));
  const record = { ...r, fields: { ...r.fields, 'given name': 'Marte Kristine', gender: 'k' },
    people: r.people.map((p) => (p.primary ? { ...p, name: 'Marte Kristine' } : p)) };
  const child = record.people.find((p) => p.primary);
  const father = record.people.find((p) => p.role === 'far');
  assert.equal(w.givenNamesOnly(child, record), true);
  assert.equal(w.givenNamesOnly(father, record), false);
  // the principal's own Last name field says otherwise: a surname
  assert.equal(w.givenNamesOnly(child, { ...record, fields: { ...record.fields, 'last name': 'Lindeman' } }), false);
  assert.deepEqual(plain(w.nameParts('Marte Kristine', { givenOnly: true })), { given: 'Marte Kristine', surname: '', rest: '' });
  // a patronymic is still the surname
  assert.deepEqual(plain(w.nameParts('Marte Kristine Halvorsdatter', { givenOnly: true })), { given: 'Marte Kristine', surname: 'Halvorsdatter', rest: '' });
  assert.deepEqual(plain(w.nameParts('Marte Kristine')), { given: 'Marte', surname: 'Kristine', rest: '' });
  // the alternate name: the given names alone; none when FS has them (in its spellings too)
  assert.deepEqual(plain(w.otherName(child, record, { pid: 'TEST-MAR', name: 'Marte Halvorsdatter', altNames: [] })), { given: 'Marte Kristine', surname: '' });
  assert.equal(w.otherName(child, record, { pid: 'TEST-MAR', name: 'Marta Christine Halvorsdatter', altNames: [] }), null);
  assert.equal(w.otherName(child, record, { pid: 'TEST-MAR', name: 'Marte Halvorsdatter', altNames: ['Marte Kristine'] }), null);
  // the father's patronymic offered for the two given names, as for one
  assert.deepEqual(plain(w.surnameSuggestions(child, record.people, record, null)).map((x) => x.name), ['Marte Kristine Halvorsdatter']);
  assert.deepEqual(plain(w.surnameSuggestions({ ...child, name: 'Marte Kristine Halvorsdatter' }, record.people, record, null)), []);
});

test('newPersonDraft(): a baptized child of two given names, the father\'s patronymic as the surname', () => {
  const { win, state } = pairedPage(undefined, 'baptism-1846', PARENTS);
  state.record = { ...state.record, fields: { ...state.record.fields, 'given name': 'Lars Ole' } };
  state.people = state.people.map((p) => (p.primary ? { ...p, name: 'Lars Ole' } : p));
  state.rows = state.people.map((p) => win.personRow(p, win.treePool(LARS_1846, {}), PARENTS[p.name]));
  const draft = plain(win.newPersonDraft(state.rows.find((row) => row.name === 'Lars Ole')));
  assert.equal(draft.given, 'Lars Ole');
  assert.equal(draft.surname, 'Halvorsen');
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

// DA's signs in a name: "!!" and "??" (missing, wrong or illegible) are left out, of two
// readings ("Even@Sven", shown "Even/Sven") the first is taken, each said in a note
test('newPersonDraft(): of two readings the first; no other name offered for one', () => {
  const { win, state, rowOf } = pairedPage(undefined, 'burial-1854', {});
  const row = rowOf('Lars Larsen Holt-Sletten');
  row.name = 'Lars@Ole Larsen';
  const draft = plain(win.newPersonDraft(row));
  assert.equal(draft.given, 'Lars');
  assert.equal(draft.surname, 'Larsen');
  assert.ok(draft.notes.some((n) => /Two readings on DigitalArkivet, the first taken: Lars@Ole/.test(n)), draft.notes.join(' | '));
  const r = state.record;
  assert.equal(win.otherName(row.person, r, { pid: 'TEST-LARS', name: 'Lars Halvorsen', altNames: [] }, 'Lars/Ole Larsen'), null);
});

// The places and occupations taken as data are the source's: without struck-out words
// ("%...%"), the transcriber's note ("E: ...") and the second of two readings ("@")
test('occupationOf(), cleanPlace(), fsPlace(): the value as the source has it', () => {
  assert.equal(w.occupationOf('Husmand %Inderst%'), 'Husmand');
  assert.equal(w.occupationOf('Skomager@Skolemester'), 'Skomager');
  assert.equal(w.occupationOf('E: not in the book'), '');
  assert.equal(w.cleanPlace('Vågå herred* %Lom%'), 'Vågå');
  const c = record('census-1865');
  assert.equal(w.fsPlace('Vaage@Lom', c), 'Vågå, Oppland, Norway');
  assert.equal(w.fsPlace('Vaage E: the parish written in the margin', c), 'Vågå, Oppland, Norway');
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
  // Oslo as FS has it, in no county: "Oslo, Norway" in 1865 (FS has no Christiania)
  assert.equal(w.fsPlace('Christiania', c), 'Oslo, Norway');
  assert.equal(w.fsPlace('Kristiania', c), 'Oslo, Norway');
  for (const short of ['Chra.', 'Chria', 'Chrania', 'Kria.']) {  // a clerk's abbreviations
    assert.equal(w.fsPlace(short, c), 'Oslo, Norway', short);
  }
  // "Kristiania, Norway" from 1877 until 1925, then Oslo again
  assert.equal(w.fsPlace('Oslo', { ...c, recordDate: '1900-05-04' }), 'Kristiania, Norway');
  assert.equal(w.fsPlace('Christiania', { ...c, recordDate: '1877-05-04' }), 'Kristiania, Norway');
  assert.equal(w.fsPlace('Oslo', { ...c, recordDate: '1930-05-04' }), 'Oslo, Norway');
  // a place the record only names (a census's birthplace): found anywhere in Norway,
  // the county first, and never given the census's county when it isn't found there
  assert.equal(w.fsPlace('Christiania', c, true), 'Oslo, Norway');
  assert.equal(w.fsPlace('Vaage', c, true), 'Vågå, Oppland, Norway');
  assert.equal(w.fsPlace('Bergen', c, true), 'Bergen, Hordaland, Norway');  // DA's county of its own, FS's Hordaland
  assert.equal(w.fsPlace('Nowhere', c, true), 'Nowhere, Norway');
});

test('fsMunicipality(): in a record of Oslo or Bergen, a farm isn\'t the town the county is named after (bug: "Oslo, Oslo, Norway")', () => {
  const oslo = { county: 'Oslo' };
  assert.equal(w.fsMunicipality('Bakken', oslo), '');
  assert.equal(w.fsPlace('Bakken', oslo), 'Bakken, Oslo, Norway');  // in the city Oslo
  assert.equal(w.fsMunicipality('Bakken', { county: 'Bergen' }), '');
  assert.equal(w.fsMunicipality('Bergen', { county: 'Bergen' }), 'Bergen, Hordaland, Norway');
  assert.equal(w.fsMunicipality('Oslo', oslo), 'Oslo, Norway');
  assert.equal(w.fsMunicipality('Christiania', oslo), 'Oslo, Norway');
  assert.equal(w.fsMunicipality('Christiania', { ...oslo, recordDate: '1880' }), 'Kristiania, Norway');
  // a town of another county is that town, not one in the record's county
  assert.equal(w.fsMunicipality('Fredrikstad', oslo), 'Fredrikstad, Østfold, Norway');
  // "Chr", Christiania as the clerks of Oslo and Akershus wrote it; elsewhere it isn't known
  assert.equal(w.fsMunicipality('Chr', oslo), 'Oslo, Norway');
  assert.equal(w.fsMunicipality('Chr.', { county: 'Akershus', recordDate: '1890-01-01' }), 'Kristiania, Norway');
  assert.equal(w.fsMunicipality('Chr', { county: 'Vest-Agder' }), '');
});

test('parishPlace(): a town\'s parish is the town its code names, not a place in the county (bug: "<parish>, Oslo, Norway")', () => {
  const oslo = { county: 'Oslo', sourceTitle: 'Church book from Kirkebakken parish 1858-1874 (0301M99)' };
  assert.equal(w.parishPlace(oslo), 'Oslo, Norway');
  // a parish that is a municipality stays as it is
  assert.equal(w.parishPlace({ county: 'Oppland', sourceTitle: 'Church book from Vågå parish 1838-1850 (0515P)' }), 'Vågå, Oppland, Norway');
  // no code: the parish in the county, as before
  assert.equal(w.parishPlace({ county: 'Oslo', sourceTitle: 'Church book from Kirkebakken parish 1858-1874' }), 'Kirkebakken, Oslo, Norway');
  assert.equal(w.parishPlace({ county: 'Oslo', sourceTitle: '' }), '');
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
  assert.equal(w.mergePlace('Vaage', 'Vaga, Oppland, Norway', c), 'Vågå, Oppland, Norway');  // one place by other names, FS's with its letters
  assert.equal(w.mergePlace('Vågå', 'Vågå kirke, Vågå, Oppland, Norway', c), 'Vågå kirke, Vågå, Oppland, Norway');
  assert.equal(w.mergePlace('Vågå herred*', 'Norway', c), 'Vågå, Oppland, Norway');  // FS's less specific
  assert.equal(w.mergePlace('Vågå', 'Lom, Oppland, Norway', c), 'Vågå, Oppland, Norway');  // they disagree
  assert.equal(w.mergePlace('Vågå', 'Lom, Oppland, Norway', c, true), 'Lom, Oppland, Norway');  // only implied
  assert.equal(w.mergePlace('Vågå', '', c, true), 'Vågå, Oppland, Norway');
  assert.equal(w.mergePlace('', 'Lom, Oppland, Norway', c), 'Lom, Oppland, Norway');
  assert.equal(w.cleanPlace('1029P Audnedal'), 'Audnedal');
});

test('a direction word before the record\'s place names it more closely; FS\'s spelling without Norwegian letters is given them (report #11)', () => {
  const c = record('census-1865');
  // FS's "Ostre Moss" (the east part of the town) is in the record's Moss
  assert.equal(w.placeIn('Moss', 'Ostre Moss,Ostfold,Norway'), true);
  assert.equal(w.placeIn('Aurdal', 'Nord-Aurdal, Oppland, Norway'), true);
  assert.equal(w.placeIn('Fron', 'Söndre Fron, Oppland, Norway'), true);
  // never the other way round, nor another direction: Østre and Vestre Toten are two places
  assert.equal(w.placeIn('Vestre Toten', 'Toten, Oppland, Norway'), false);
  assert.equal(w.placeIn('Østre Toten', 'Vestre Toten, Oppland, Norway'), false);
  assert.equal(w.placeIn('Østre Toten', 'Ostre Toten, Oppland, Norway'), true);
  // a word that only starts like one isn't a direction (Nordby isn't north of By)
  assert.equal(w.placeIn('By', 'Nordby, Akershus, Norway'), false);
  // FS's place kept, with its Norwegian letters and spaces after the commas
  assert.equal(w.mergePlace('Moss', 'Ostre Moss,Ostfold,Norway', c), 'Østre Moss, Østfold, Norway');
  assert.equal(w.norwegianSpelling('Sor-Fron,Oppland,Norway'), 'Sør-Fron, Oppland, Norway');
  assert.equal(w.norwegianSpelling('As, Akershus, Norway'), 'Ås, Akershus, Norway');
  assert.equal(w.norwegianSpelling('Os, Hedmark, Norway'), 'Os, Hedmark, Norway');  // a name as it is
  assert.equal(w.norwegianSpelling('Bakken nedre, Vaga, Oppland, Norway'), 'Bakken nedre, Vågå, Oppland, Norway');  // a farm as FS has it
  assert.equal(w.norwegianSpelling('Orland, Glenn, California, United States'), 'Orland, Glenn, California, United States');  // not Ørland
});

test('a town DA writes twice ("Christiansund Christiansund N") is the town, not a farm before FS\'s place', () => {
  const c = record('census-1865');
  const town = 'Christiansund Christiansund N';
  assert.equal(w.mergePlace(town, 'Kristiansund, Møre og Romsdal, Norway', c, false, true), 'Kristiansund, Møre og Romsdal, Norway');
  assert.equal(w.placeIn(town, 'Kristiansund, Møre og Romsdal, Norway'), true);
  assert.equal(w.placeIn(town, 'Molde, Møre og Romsdal, Norway'), false);
  assert.match(w.fsMunicipality(town, c, true), /^Kristiansund, Møre og Romsdal, Norway$/);
  // two names are a farm and a place, not one place written twice
  assert.equal(w.placeWords('Bakken Vågå'), null);
  assert.equal(w.placeWords('Vågå'), null);
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

test('prepareAdditions(): the ticked facts are filled in FS\'s forms in the hidden window, not saved; FS\'s standard date goes into the box, the place stays as written with FS\'s standard one in the note (report #11)', async () => {
  const { chrome, asked, windows } = fakeFs({
    addFact: ({ addition, save }, url) => (url.endsWith('/tree/person/details/TEST-LAR') && !save ? {
      ok: true,
      fields: [{ name: 'date', value: '23 August 1846', picked: '23 August 1846' }, { name: 'place', value: addition.value.place, picked: '', standard: 'Vågå, Oppland, Norway Municipality, 1838 - 2019' }]
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
  assert.equal(place().value, 'Vaagaa');  // the record's place kept, the row redrawn
  const note = lars.node.querySelector('.checked-note');
  assert.equal(note.hidden, false);
  const checked = 'Checked with FamilySearch: Date: 23 August 1846; Place: Vaagaa (kept as written; FamilySearch\'s standard place: Vågå, Oppland, Norway Municipality, 1838 - 2019)';
  assert.equal(note.textContent, checked);
  // the report says so under the addition
  assert.ok(win.linkerReport().includes('\n    - ' + checked + '\n'));
  assert.match($('changes-status').textContent, /^Checked with FamilySearch: look the dates/);
  assert.equal(plain(win.readPlan(true).pairs.find((p) => p.pid === 'TEST-LAR').additions)[0].value.place, 'Vaagaa');
  // a place FS has none of: kept, and said so
  assert.equal(win.fsCheckedText({ fields: [{ name: 'place', value: 'Bakken nedre, Vågå, Oppland, Norway', picked: '', standard: '' }] }),
    'Checked with FamilySearch: Place: Bakken nedre, Vågå, Oppland, Norway (kept as written; not one of FamilySearch\'s standard places)');
  // edited after: the note goes
  place().value = 'Vågå kirke, Vågå, Oppland, Norway';
  place().dispatchEvent(new win.Event('input'));
  assert.equal(lars.node.querySelector('.checked-note').hidden, true);
  assert.doesNotMatch(win.linkerReport(), /Checked with FamilySearch: Date/);
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

test('run(false): "Update source only" saves the ticked facts of those who have the source, attaches no one (report #11: dropped without a word)', async () => {
  const { chrome, asked, tabs } = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S05', title }], title }),
    editSource: ({ read }) => read ? { ok: true, sourceId: 'TEST-S05', fields: {} } : { ok: true, sourceId: 'TEST-S05', changed: [], missing: [] },
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-LAR', name: 'Lars' }] }),
    attach: () => { throw new Error('not attached'); },
    addFact: () => ({ ok: true, fields: [], shown: 'Christening 23 August 1846 Vågå' }),
    tagFact: () => ({ ok: true })
  });
  const { win, $ } = withChristening(chrome);
  await win.run(false);
  const names = plain(asked.map(([name, args]) => name + (args.pid ? ' ' + args.pid : '')));
  assert.ok(!names.some((n) => /^attach /.test(n)));
  assert.deepEqual(names.filter((n) => /Fact/.test(n)), ['addFact TEST-LAR', 'tagFact TEST-LAR']);
  assert.match($('log').textContent, /Lars: add the christening: 23 August 1846, Vågå, Oppland, Norway\./);
  assert.deepEqual(tabs.closed, [2]);
  // not attached to the person yet: nothing added, and the log says how
  const other = fakeFs({
    findSource: ({ title }) => ({ ok: true, sources: [{ id: 'TEST-S05', title }], title }),
    editSource: ({ read }) => read ? { ok: true, sourceId: 'TEST-S05', fields: {} } : { ok: true, sourceId: 'TEST-S05', changed: [], missing: [] },
    attachedTo: () => ({ ok: true, persons: [] }),
    attach: () => { throw new Error('not attached'); },
    addFact: () => { throw new Error('not added'); }
  });
  const page = withChristening(other.chrome);
  await page.win.run(false);
  assert.ok(!other.asked.some(([name]) => /^(attach|addFact|tagFact)$/.test(name)));
  assert.match(page.$('log').textContent, /Nothing added to Lars \(TEST-LAR\): the source is not attached to them yet\. ".+ and attach" attaches it/);
  // without ticked facts, no tree person is needed
  assert.deepEqual(plain(checkedPage(fakeFs({}).chrome).win.readPlan(false).pairs), []);
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

test('run(): a fact step FS was slow with is tried once more on the page loaded again; a save only when it never reached Save', async () => {
  const slow = { ok: false, timeout: true, error: 'FamilySearch did not show Tag Sources in time.' };
  let tries = 0;
  const { chrome, asked, tabs } = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    addFact: () => (tries++ ? { ok: true, fields: [], shown: 'Christening 23 August 1846 Vågå' }
      : { ok: false, timeout: true, unsaved: true, error: 'FamilySearch did not show the last form to close in time.' }),
    tagFact: () => (tries++ < 3 ? slow : { ok: true })
  });
  const urls = [];
  const update = chrome.tabs.update;
  chrome.tabs.update = (id, options) => { if (options.url) urls.push([options.url, options.active]); return update(id, options); };
  const { win, $ } = withChristening(chrome);
  await win.run(true);
  assert.deepEqual(plain(asked.map(([name]) => name)).slice(-4), ['addFact', 'addFact', 'tagFact', 'tagFact']);
  // the person's page loaded with the tab in front: at first (not read in the tab), and for each try again
  assert.equal(urls.filter(([url, active]) => /details\/TEST-LAR$/.test(url) && active).length, 3);
  assert.match($('log').textContent, /did not show the last form to close in time\. Trying once more, with the page loaded again\./);
  assert.match($('log').textContent, /The source is tagged to it\./);
  assert.deepEqual(tabs.closed, [2]);  // all done in the end

  // Failed after its Save was clicked (not `unsaved`): not tried again, since FS may have it
  const saved = fakeFs({
    findSource: () => ({ ok: true, sources: [] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S05', missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    addFact: () => ({ ok: false, timeout: true, error: 'FamilySearch did not show the saved fact in time.' }),
    tagFact: () => ({ ok: true })
  });
  await withChristening(saved.chrome).win.run(true);
  assert.equal(saved.asked.filter(([name]) => name === 'addFact').length, 1);
});

test('run(): a SourceBox FS doesn\'t search is searched once more, then the check made before goes; with none, nothing is created', async () => {
  const slow = { ok: false, timeout: true, error: 'FamilySearch did not show the SourceBox search in time.' };
  const answers = (findSource) => ({
    findSource,
    attachedTo: () => ({ ok: true, persons: [{ pid: 'TEST-HAL', name: 'Halvor' }] }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S06', missing: [] }),
    editSource: () => ({ ok: true, sourceId: 'TEST-S05', changed: [], missing: [] }),
    attach: () => ({ ok: true, tagged: { changed: [], notes: [] } }),
    addFact: () => ({ ok: true, fields: [], shown: 'Christening 23 August 1846 Vågå' }),
    tagFact: () => ({ ok: true })
  });
  // The second search answers: the source found, written over, not created again
  let n = 0;
  const second = fakeFs(answers(({ title }) => (n++ ? { ok: true, sources: [{ id: 'TEST-S05', title }] } : slow)));
  await withChristening(second.chrome).win.run(true);
  assert.deepEqual(plain(second.asked.map(([name]) => name)).slice(0, 4), ['findSource', 'findSource', 'attachedTo', 'editSource']);
  assert.ok(!second.asked.some(([name]) => name === 'createSource'));

  // Never searched: the check made before found the source, which is used
  const never = fakeFs(answers(() => slow));
  let page = withChristening(never.chrome);
  page.state.fsCheck = { sources: [{ title: page.$('f-title').value, id: 'TEST-S05', ids: ['TEST-S05'], persons: [{ pid: 'TEST-HAL', name: 'Halvor' }] }] };
  await page.win.run(true);
  let names = plain(never.asked.map(([name]) => name));
  assert.ok(!names.includes('createSource'));
  assert.ok(names.includes('editSource'));
  assert.deepEqual(plain(never.asked.filter(([name]) => name === 'attach').map(([, args]) => args.pid)), ['TEST-LAR']);  // Halvor has it
  assert.match(page.$('log').textContent, /Going by the SourceBox check made before, which found this source \(TEST-S05\)\./);

  // The check made before found none: created, as before
  const none = fakeFs(answers(() => slow));
  page = withChristening(none.chrome);
  page.state.fsCheck = { sources: [{ title: page.$('f-title').value, id: null, ids: [], persons: [] }] };
  await page.win.run(true);
  assert.ok(none.asked.some(([name]) => name === 'createSource'));

  // No check to go by (it failed, or was of another title): nothing created or attached
  for (const fsCheck of [{ error: 'FamilySearch did not answer.' }, { sources: [{ title: 'Another title', id: null, ids: [], persons: [] }] }]) {
    const unknown = fakeFs(answers(() => slow));
    page = withChristening(unknown.chrome);
    page.state.fsCheck = fsCheck;
    await page.win.run(true);
    names = plain(unknown.asked.map(([name]) => name));
    assert.deepEqual(names, ['findSource', 'findSource']);
    assert.match(page.$('log').textContent, /Nothing was created: the SourceBox could not be searched/);
    assert.deepEqual(unknown.tabs.closed, []);  // left open where it stopped
  }
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
  assert.equal(entry.place, '0515');  // Vågå, from the source title's (0515P), for the search page's distances
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
  // FS's place without its Norwegian letters: the spelling to be saved isn't there yet (report #11)
  const ascii = { ...tree, christening: { date: '23 AUG 1846', place: 'Ostre Moss,Ostfold,Norway' } };
  const christening = (place) => ({ action: 'edit', type: 'CHRISTENING', value: { date: '23 August 1846', place } });
  assert.equal(w.onTreeAlready(ascii, christening('Østre Moss, Østfold, Norway')), false);
  assert.equal(w.onTreeAlready({ ...ascii, christening: { date: '23 August 1846', place: 'Østre Moss, Østfold, Norway' } }, christening('Østre Moss, Østfold, Norway')), true);
  // FS's town under its present name: the name of the year isn't there yet (bug: "has this already; not changed")
  const halden = { ...tree, christening: { date: '23 August 1846', place: 'Halden, Østfold, Norway' } };
  assert.equal(w.onTreeAlready(halden, christening('Fredrikshald, Smaalenene, Norway')), false);
  assert.equal(w.onTreeAlready({ ...tree, christening: { date: '23 August 1846', place: 'Halden,Ostfold,Norway' } }, christening('Fredrikshald, Smaalenene, Norway')), false);
  assert.equal(w.onTreeAlready({ ...tree, christening: { date: '23 August 1846', place: 'Fredrikshald, Smaalenene, Norway' } }, christening('Fredrikshald, Smaalenene, Norway')), true);
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

test('factAdditions(): a residence that is a town is the town, not a farm in the parish (bug: "Chr, Oslo, Oslo, Norway")', () => {
  const { win, state } = checkedPage();
  const b = { ...record('burial-1854'), county: 'Oslo', church: '', sourceTitle: 'Church book from Kirkebakken parish 1850-1860 (0301M99)' };
  const lars = { ...w.recordPeople(b)[0], residence: 'Chr' };
  state.record = b;
  state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', birth: { date: 'about 1797' }, death: { date: '12 April 1854', place: 'Oslo, Oslo, Norway' }, burial: { date: '18 April 1854', place: 'Oslo, Oslo, Norway' }, residences: [], occupations: [{ description: 'Lægdslem' }] };
  const adds = plain(win.factAdditions(lars, b, { pid: 'TEST-LLA' }));
  assert.deepEqual(adds.filter((a) => a.fact === 'Residence').map((a) => a.value), [{ date: '1854', place: 'Oslo, Norway', description: 'Chr' }]);
  // the burial at the parish: the town its code names, as FS has the town in 1854
  // (FS's "Oslo, Oslo, Norway" is the present town in its county)
  assert.deepEqual(adds.filter((a) => a.fact === 'Burial').map((a) => a.value), [{ date: '18 April 1854', place: 'Oslo, Norway' }]);
});

test('nameParts(): of two patronymics the record father\'s; the tree\'s family name in another spelling', () => {
  const parts = (name, opts) => plain(w.nameParts(name, opts));
  assert.deepEqual(parts('Lars Halvorsen Bakken'), { given: 'Lars', surname: 'Halvorsen', rest: 'Bakken' });
  assert.deepEqual(parts('Astri Pedersdatter Larsdatter'), { given: 'Astri', surname: 'Pedersdatter', rest: 'Larsdatter' });
  assert.deepEqual(parts('Astri Pedersdatter Larsdatter', { fathers: ['Lars'] }), { given: 'Astri', surname: 'Larsdatter', rest: 'Pedersdatter' });
  // a father's name in another spelling: Johannes for a Jonsdatter
  assert.deepEqual(parts('Astri Pedersdatter Jonsdatter Bakken', { fathers: ['Johannes'] }), { given: 'Astri', surname: 'Jonsdatter', rest: 'Pedersdatter Bakken' });
  assert.deepEqual(parts('Lars Halvorsen Lindeman', { family: 'Lindemann' }), { given: 'Lars Halvorsen', surname: 'Lindeman', rest: '' });
  // a farm that isn't the tree's family name is still an address
  assert.deepEqual(parts('Lars Halvorsen Bakken', { family: 'Lindemann' }), { given: 'Lars', surname: 'Halvorsen', rest: 'Bakken' });
  assert.equal(w.treeFamilyName('Lars Halvorsen Lindemann'), 'Lindemann');
  assert.equal(w.treeFamilyName('Lars Halvorsen'), '');
});

test('factAdditions(): an alternate name with the patronymic of the record\'s father, and with the tree\'s family name (bug: the first patronymic, the family name dropped)', () => {
  const { win, state } = checkedPage();
  const m = record('marriage-bride');
  const [groom, bride] = w.recordPeople(m);
  state.record = m;
  const names = (person, fs, name) => {
    state.fs = { pid: fs.pid, gender: 'Male', residences: [], occupations: [], altNames: [], ...fs };
    return plain(win.factAdditions(person, m, { pid: fs.pid }, name)).filter((a) => a.fact === 'Name').map((a) => a.value);
  };
  // the bride's father in the record is Kolvald: her patronymic is his, not the first one written
  assert.deepEqual(names(bride, { pid: 'TEST-ELI', name: 'Eli Kolvaldsdatter', gender: 'Female' }, 'Eli Halvorsdatter Kolvaldsdatter'), []);
  assert.deepEqual(names(bride, { pid: 'TEST-ELI', name: 'Eli Kolvaldsdtr', gender: 'Female' }, 'Eli Halvorsdatter Kolvaldsdatter'),
    [{ given: 'Eli', surname: 'Kolvaldsdatter', nameType: 'AKA' }]);
  // the tree has the farm as the family name: the record's spelling of it is the surname
  assert.deepEqual(names(groom, { pid: 'TEST-KOL', name: 'Kolmund Finsteinsen Dahlbø' }),
    [{ given: 'Kolmund Finsteinsen', surname: 'Dalbø', nameType: 'AKA' }]);
  assert.deepEqual(names(groom, { pid: 'TEST-KOL', name: 'Kolmund Finsteinsen Dalbø' }), []);
});

test('factAdditions(): FS\'s residence of the record\'s year changed where it is wanting (bug: a residence saved without its place left so on a run again)', () => {
  const { win, state } = checkedPage();
  const m = { ...record('marriage-bride'), county: 'Østfold', church: '', recordDate: '1874-05-10', sourceTitle: 'Church book from Halden parish 1869-1884 (0101P)' };
  const groom = { ...w.recordPeople(m)[0], birthYear: '', residence: 'Fhald' };
  state.record = m;
  const residences = (list) => {
    state.fs = { pid: 'TEST-KOL', name: 'Kolmund Finsteinsen Dalbø', gender: 'Male', occupations: [], altNames: [], birth: { date: '15 October 1850', place: 'Fredrikshald, Smaalenene, Norway' }, residences: list };
    return plain(win.factAdditions(groom, m, { pid: 'TEST-KOL' })).filter((a) => a.fact === 'Residence').map(({ action, match, current, value }) => ({ action, match, current, value }));
  };
  const town = 'Fredrikshald, Smaalenene, Norway';
  // no place (an earlier run's, saved without it): the town, FS's description kept
  assert.deepEqual(residences([{ date: '1874', place: '', description: 'Fhald' }, { date: '1891', place: town }]),
    [{ action: 'edit', match: ['1874'], current: '1874', value: { date: '1874', place: town, description: 'Fhald' } }]);
  // the record's abbreviation as FS's place, not standardized; the town by its present name
  assert.deepEqual(residences([{ date: '1874', place: 'Fhald' }]).map((a) => a.value.place), [town]);
  assert.deepEqual(residences([{ date: '1874', place: 'Halden, Østfold, Norway' }]).map((a) => a.value.place), [town]);
  assert.deepEqual(residences([{ date: '1874', place: 'Halden,Ostfold,Norway' }]).map((a) => a.value.place), [town]);
  // FS's place as the year's, or another place FS has: left as it is
  assert.deepEqual(residences([{ date: '1874', place: town }]), []);
  assert.deepEqual(residences([{ date: '1874', place: 'Idd, Østfold, Norway' }]), []);
  // two of the year: which one isn't for the linker to say
  assert.deepEqual(residences([{ date: '1874', place: '' }, { date: '1874', place: 'Fhald' }]), []);
  // none of the year: added
  assert.deepEqual(residences([{ date: '1891', place: town }]).map((a) => a.action), ['add']);
  // the edit done once FS has the place
  const edit = { action: 'edit', type: 'RESIDENCE', value: { date: '1874', place: town } };
  assert.equal(w.onTreeAlready({ residences: [{ date: '1874', place: '' }] }, edit), false);
  assert.equal(w.onTreeAlready({ residences: [{ date: '1874', place: town }] }, edit), true);
});

test('factAdditions(): a marriage in the couple relationship, its town by the name of the year (bug: "Halden, Ostfold" for 1849 not offered a change)', () => {
  const { win, state } = checkedPage();
  const m = { ...record('marriage-bride'), county: 'Østfold', church: '', recordDate: '1849-11-11', sourceTitle: 'Church book from Halden parish 1845-1856 (0101P)' };
  const groom = w.recordPeople(m)[0];
  state.record = m;
  const marriages = (marriage, spouse = 'TEST-ELI') => {
    state.fs = { pid: 'TEST-KOL', name: 'Kolmund Finsteinsen Dalbø', gender: 'Male', occupations: [], altNames: [], residences: [],
      families: [{ spouse: { pid: 'TEST-ELI', name: 'Eli Kolvaldsdatter Daltveit' }, marriage, children: [] }] };
    return plain(win.factAdditions(groom, m, { pid: 'TEST-KOL' }, '', { spouse })).filter((a) => a.fact === 'Marriage')
      .map(({ action, type, couple, match, current, value }) => ({ action, type, couple, match, current, value }));
  };
  const town = 'Fredrikshald, Smaalenene, Norway';
  // FS's present name of the town, without its letters: the town of the year, the date kept
  assert.deepEqual(marriages({ date: '11 Nov 1849', place: 'Halden, Ostfold, Norway' }),
    [{ action: 'edit', type: 'MARRIAGE', couple: 'TEST-ELI', match: ['1849'], current: '11 Nov 1849, Halden, Ostfold, Norway', value: { date: '11 November 1849', place: town } }]);
  // FS's as the record has it: nothing; none on FS: added
  assert.deepEqual(marriages({ date: '11 November 1849', place: town }), []);
  assert.deepEqual(marriages(null).map((a) => [a.action, a.value.place]), [['add', town]]);
  // not the groom of a bride paired with no couple on FS, nor without a bride paired
  assert.deepEqual(marriages(null, 'TEST-XYZ'), []);
  assert.deepEqual(marriages(null, ''), []);
  // only the groom's row has it, with the one bride paired
  state.rows = w.recordPeople(m).map((p, i) => win.personRow(p, [], ['TEST-KOL', 'TEST-ELI', '', ''][i]));
  assert.deepEqual(plain(state.rows.map((r) => win.pairedBride(r))), ['TEST-ELI', '', '', '']);
});

test('factAdditions(): a birthplace the record gives without a year, where FS\'s birth has a date and no place (bug: not offered)', () => {
  const { win, state } = checkedPage();
  const m = record('marriage-bride');
  const groom = { ...w.recordPeople(m)[0], birthYear: '' };
  state.record = m;
  const births = (birth) => {
    state.fs = { pid: 'TEST-KOL', name: 'Kolmund Finsteinsen Dalbø', gender: 'Male', residences: [], occupations: [], altNames: [], birth };
    return plain(win.factAdditions(groom, m, { pid: 'TEST-KOL' })).filter((a) => a.fact === 'Birth').map((a) => [a.action, a.value]);
  };
  assert.deepEqual(births({ date: '19 August 1807' }), [['edit', { date: '19 August 1807', place: 'Vågå, Oppland, Norway' }]]);
  // FS has a place, or no birth: nothing from a place alone
  assert.deepEqual(births({ date: '19 August 1807', place: 'Lom, Oppland, Norway' }), []);
  assert.deepEqual(births(null), []);
});

test('a marriage\'s birthplace without a year: no year compared, and a town\'s abbreviation is the town by its name then (bug: "Fhald" a farm in Halden)', () => {
  const { win, state } = checkedPage();
  const m = { ...record('marriage-bride'), county: 'Østfold', church: '', recordDate: '1874-05-10', sourceTitle: 'Church book from Halden parish 1869-1884 (0101P)' };
  const groom = { ...w.recordPeople(m)[0], birthYear: '', birthPlace: 'Fhald', residence: 'Fhald' };
  state.record = m;
  state.fs = { pid: 'TEST-KOL', name: 'Kolmund Finsteinsen Dalbø', gender: 'Male', residences: [], occupations: [], altNames: [], birth: { date: '15 October 1850' } };
  const da = w.recordFacts(groom, m);
  // the clerk's abbreviation in full, the town's name then
  assert.equal(da.Birth.text, 'Fredrikshald');
  assert.equal(w.recordFacts(groom, m).Residence.text, '1874, Fredrikshald');
  assert.ok(!da.Birth.year);
  // a place alone is neither the same as FS's date nor against it
  assert.equal(w.compareFact('Birth', da.Birth, w.treeFacts(state.fs, m).Birth, groom, { pid: 'TEST-KOL' }, m), '');
  const adds = plain(win.factAdditions(groom, m, { pid: 'TEST-KOL' }));
  assert.deepEqual(adds.filter((a) => a.fact === 'Birth').map((a) => a.value), [{ date: '15 October 1850', place: 'Fredrikshald, Smaalenene, Norway' }]);
  // the town, with the record's name of it as the description
  assert.deepEqual(adds.find((a) => a.fact === 'Residence').value, { date: '1874', place: 'Fredrikshald, Smaalenene, Norway', description: 'Fhald' });
  // FS's place of the town names the record's: kept, nothing to change
  state.fs = { ...state.fs, birth: { date: '15 October 1850', place: 'Fredrikshald, Smaalenene, Norway' } };
  assert.deepEqual(plain(win.factAdditions(groom, m, { pid: 'TEST-KOL' })).filter((a) => a.fact === 'Birth'), []);
  state.fs = { ...state.fs, birth: { date: '15 October 1850', place: 'Fredrikshald, Østfold, Norway' } };
  assert.deepEqual(plain(win.factAdditions(groom, m, { pid: 'TEST-KOL' })).filter((a) => a.fact === 'Birth'), []);
  // as FS has the town: under Østfold from 1919, Halden from the renaming in 1928
  assert.equal(w.fsPlace('Fhald', { ...m, recordDate: '1925-05-10' }), 'Fredrikshald, Østfold, Norway');
  assert.equal(w.fsPlace('Fhald', { ...m, recordDate: '1930-05-10' }), 'Halden, Østfold, Norway');
  const thjem = { ...m, county: 'Sør-Trøndelag', sourceTitle: 'Church book from Domkirken parish 1850-1860 (1601P)' };
  assert.equal(w.fsPlace('Thjem', { ...thjem, recordDate: '1855-05-10' }), 'Trondheim, Søndre Trondhjem, Norway');
  assert.equal(w.fsPlace('Thjem', { ...thjem, recordDate: '1930-05-10' }), 'Trondheim, Sør-Trøndelag, Norway');
});

test('townIn(): a renamed town by its name and county in the year, as FS has it, else as the record writes it', () => {
  const town = (...args) => plain(w.townIn(...args));
  assert.deepEqual(town('0101', 1874), { name: 'Fredrikshald', county: 'Smaalenene' });
  assert.deepEqual(town('0101', 1919), { name: 'Fredrikshald', county: '' });
  assert.equal(w.townIn('0101', 1928), null);  // Halden
  // Oslo in no county: Oslo, Kristiania from 1877, Oslo again from 1925
  assert.deepEqual(town('0301', 1850), { name: 'Oslo', county: null });
  assert.deepEqual(town('0301', 1924), { name: 'Kristiania', county: null });
  assert.deepEqual(town('0301', 1925), { name: 'Oslo', county: null });
  // FS has Trondheim, not Trondhjem or Nidaros, under the county of the time
  assert.deepEqual(town('1601', 1790), { name: 'Trondheim', county: 'Trondhjem' });
  assert.deepEqual(town('1601', 1850), { name: 'Trondheim', county: 'Søndre Trondhjem' });
  assert.equal(w.townIn('1601', 1919), null);  // Trondheim, Sør-Trøndelag
  assert.equal(w.townIn('0515', 1850), null);  // not renamed
  // no year: the earliest name when the record writes an old one
  assert.deepEqual(town('0101', null, 'Fr.hald'), { name: 'Fredrikshald', county: 'Smaalenene' });
  assert.deepEqual(town('0301', null, 'Chra.'), { name: 'Oslo', county: null });
  assert.deepEqual(town('0301', null, 'Oslo'), { name: 'Oslo', county: null });
});

test('additionText(): an alternate name as written, given names before the surname', () => {
  const name = { fact: 'Name', action: 'name', type: 'ALTERNATE_NAME', value: { given: 'Astri', surname: 'Larsdatter', nameType: 'AKA' } };
  assert.equal(w.additionText(name), 'Astri Larsdatter (Also known as)');
});

test('factAdditions(): a record name of FS\'s given names only is no alternate name (bug: the second given name offered as a surname)', () => {
  const { win, state } = checkedPage();
  const lars = state.people.find((p) => p.name === 'Lars');
  const names = (fsName, name) => {
    state.fs = { ...LARS_1846, name: fsName, altNames: [] };
    return plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' }, name)).filter((a) => a.fact === 'Name').map((a) => a.value);
  };
  // a baptism names the child by the given names: Ole isn't a surname
  assert.deepEqual(names('Lars Ole Halvorsen', 'Lars Ole'), []);
  // a surname FS doesn't have still is one
  assert.deepEqual(names('Lars Ole Halvorsen', 'Lars Ole Halvorsøn'), [{ given: 'Lars Ole', surname: 'Halvorsøn', nameType: 'AKA' }]);
});

test('compareFact(): a name is ≈ when the linker offers it as an alternate name, ✓ only when it doesn\'t (bug: ✓ beside an offered name)', () => {
  const { win, state } = checkedPage();
  const lars = state.people.find((p) => p.name === 'Lars');
  const halvor = state.people.find((p) => p.name === 'Halvor Larsen');
  const mark = (person, pid, fsName) => {
    state.fs = { pid, name: fsName, gender: 'Male', altNames: [], residences: [], occupations: [] };
    return win.compareFact('Name', { text: person.name }, { text: fsName }, person, { pid, name: fsName }, state.record);
  };
  assert.equal(mark(halvor, 'TEST-HAL', 'Halvor Larsen'), 'same');
  // the patronymic in another spelling: offered, so not the same
  assert.equal(mark(halvor, 'TEST-HAL', 'Halvor Lauritsen'), 'near');
  assert.equal(plain(win.factAdditions(halvor, state.record, { pid: 'TEST-HAL' })).filter((a) => a.fact === 'Name').length, 1);
  // a child by the given name only
  assert.equal(mark(lars, 'TEST-LAR', 'Lars Halvorsen'), 'same');
  // another given name
  assert.equal(mark(halvor, 'TEST-HAL', 'Ole Larsen'), 'differs');
});

test('factsTable(): the name as the user edited it, judged as the additions judge it (bug: the record\'s name ≈ beside no alternate name offered)', () => {
  const { win, state } = checkedPage();
  const halvor = state.people.find((p) => p.name === 'Halvor Larsen');
  state.fs = { pid: 'TEST-HAL', name: 'Halvor Lauritsen', gender: 'Male', altNames: [], residences: [], occupations: [] };
  const tree = { pid: 'TEST-HAL', name: 'Halvor Lauritsen' };
  const nameRow = (name) => [...win.factsTable(halvor, state.record, tree, false, name).querySelectorAll('tbody tr')]
    .map((tr) => [...tr.children].map((c) => c.textContent.trim())).find((r) => r[0] === 'Name');
  const offered = (name) => plain(win.factAdditions(halvor, state.record, tree, name)).filter((a) => a.fact === 'Name').length;
  // the record's name: offered as an alternate name, so ≈
  assert.deepEqual(plain(nameRow()), ['Name', 'Halvor Larsen', '≈ Halvor Lauritsen']);
  assert.equal(offered(), 1);
  // edited to FS's name: nothing offered, so ✓, and the table shows the edited name
  assert.deepEqual(plain(nameRow('Halvor Lauritsen')), ['Name', 'Halvor Lauritsen', '✓ Halvor Lauritsen']);
  assert.equal(offered('Halvor Lauritsen'), 0);
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

test('factAdditions(): FS\'s christening in a part of the parish, without Norwegian letters, is changed to its spelling only; another form alone is no change (report #11)', () => {
  const { win, state } = checkedPage();
  const lars = state.people.find((p) => p.name === 'Lars');
  const christening = (fs) => {
    state.fs = { ...LARS_1846, christening: fs };
    return plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' })).filter((a) => a.fact === 'Christening').map((a) => [a.action, a.value]);
  };
  // the place below the parish kept, its letters back; the date in the record's form
  assert.deepEqual(christening({ date: '23 AUG 1846', place: 'Nordre Vaga,Oppland,Norway' }), [['edit', { date: '23 August 1846', place: 'Nordre Vågå, Oppland, Norway' }]]);
  // the same date and place, written differently: nothing to change
  assert.deepEqual(christening({ date: '23 AUG 1846', place: 'Vågå,Oppland,Norway' }), []);
  // FS's "about" is no date of the record's: changed
  assert.deepEqual(christening({ date: 'Abt 1846', place: 'Vågå, Oppland, Norway' }), [['edit', { date: '23 August 1846', place: 'Vågå, Oppland, Norway' }]]);
});

test('a town\'s parish by its name of the record\'s year, also where FS has the present one (bug: Halden for a christening in 1875)', () => {
  const { win, state } = checkedPage();
  const lars = state.people.find((p) => p.name === 'Lars');
  const b = { ...state.record, county: 'Østfold', church: '', recordDate: '1846-08-23', sourceTitle: 'Church book from Halden parish 1838-1850 (0101P)' };
  state.record = b;
  // DA's present name of the parish, the town's name of the time in the facts
  assert.equal(w.recordPlace(b), 'Halden');
  assert.equal(w.parishName(b), 'Fredrikshald');
  assert.equal(win.recordFacts(lars, b).Christening.text, '23 August 1846, Fredrikshald');
  const changes = (fs) => {
    state.fs = { ...LARS_1846, ...fs };
    return plain(win.factAdditions(lars, b, { pid: 'TEST-LAR' })).filter((a) => a.fact === 'Birth' || a.fact === 'Christening').map((a) => [a.fact, a.action, a.value.place]);
  };
  // a birth FS lacks: in the town of the time
  assert.deepEqual(changes({ birth: undefined, christening: { date: '23 August 1846', place: 'Fredrikshald, Smaalenene, Norway' } }), [['Birth', 'add', 'Fredrikshald, Smaalenene, Norway']]);
  // FS's present name of the town (also without its Norwegian letters), changed to the name of the time
  assert.deepEqual(changes({ birth: { date: '16 July 1846', place: 'Halden, Østfold, Norway' }, christening: { date: '23 August 1846', place: 'Halden,Ostfold,Norway' } }),
    [['Birth', 'edit', 'Fredrikshald, Smaalenene, Norway'], ['Christening', 'edit', 'Fredrikshald, Smaalenene, Norway']]);
  // FS's place not standardized, without Norway: the town of the time too
  assert.deepEqual(changes({ birth: { date: '16 July 1846', place: 'Fredrikshald, Smaalenene, Norway' }, christening: { date: '23 August 1846', place: 'Halden, Østfold' } }),
    [['Christening', 'edit', 'Fredrikshald, Smaalenene, Norway']]);
  // the name of the time already: left as it is
  assert.deepEqual(changes({ birth: { date: '16 July 1846', place: 'Fredrikshald, Smaalenene, Norway' }, christening: { date: '23 August 1846', place: 'Fredrikshald, Smaalenene, Norway' } }), []);
  // a place in the town: the town's part by its name of the time (bug: "Aasen, Halden,
  // Østfold, Norway" for 1858 kept)
  assert.deepEqual(changes({ birth: { date: '16 July 1846', place: 'Fredrikshald, Smaalenene, Norway' }, christening: { date: '23 August 1846', place: 'Immanuels kirke, Halden, Østfold, Norway' } }),
    [['Christening', 'edit', 'Immanuels kirke, Fredrikshald, Smaalenene, Norway']]);
  assert.equal(w.townOfYear('Aasen, Halden, Østfold, Norway', 1858), 'Aasen, Fredrikshald, Smaalenene, Norway');
  assert.equal(w.townOfYear('Aasen, Oslo, Norway', 1880), 'Aasen, Kristiania, Norway');
  assert.equal(w.townOfYear('Aasen, Halden, Østfold, Norway', 1950), 'Aasen, Halden, Østfold, Norway');
  assert.equal(w.townOfYear('Bakken nedre, Vågå, Oppland, Norway', 1850), 'Bakken nedre, Vågå, Oppland, Norway');
  // the facts table: FS's place under another name than the year's is near, not the same
  state.fs = { ...LARS_1846, christening: { date: '23 August 1846', place: 'Fredrikshald, Smaalenene, Norway' } };
  const facts = win.treeFacts({ pid: 'TEST-LAR' }, b);
  assert.equal(facts.Christening.place, 'Fredrikshald, Smaalenene, Norway');
  assert.equal(win.compareFact('Christening', win.recordFacts(lars, b).Christening, facts.Christening, lars, { pid: 'TEST-LAR' }, b), 'same');
  state.fs = { ...LARS_1846, christening: { date: '23 August 1846', place: 'Halden,Ostfold,Norway' } };
  assert.equal(win.compareFact('Christening', win.recordFacts(lars, b).Christening, win.treeFacts({ pid: 'TEST-LAR' }, b).Christening, lars, { pid: 'TEST-LAR' }, b), 'near');
  // the birth's own year decides: a groom of 1850 born in Halden is in Fredrikshald, one of 1930 in Halden
  assert.equal(w.townOfYear('Halden, Østfold, Norway', 1850), 'Fredrikshald, Smaalenene, Norway');
  assert.equal(w.townOfYear('Fredrikshald, Smaalenene, Norway', 1930), 'Halden, Østfold, Norway');
  assert.equal(w.townOfYear('Oslo, Oslo, Norway', 1880), 'Kristiania, Norway');
  assert.equal(w.townOfYear('Halden, Østfold, Norway', null), 'Halden, Østfold, Norway');
  assert.equal(w.townOfYear('Vågå, Oppland, Norway', 1850), 'Vågå, Oppland, Norway');
});

test('dateSlip(), factAdditions(), slipBox(): a baptism dated before the birth, either year the slip: the user chooses, neither offered until then (bugs: baptism 1892 for a birth 1893; birth 1851 for a baptism 1851)', () => {
  assert.deepEqual(plain(w.baptismAfterBirth({ year: 1846, month: 3, day: 12 }, { year: 1846, month: 7, day: 16 })), { year: 1847, month: 3, day: 12 });
  assert.equal(w.baptismAfterBirth({ year: 1846, month: 8, day: 23 }, { year: 1846, month: 7, day: 16 }), null);
  assert.equal(w.baptismAfterBirth({ year: 1846, month: 8, day: 23 }, { year: 1846 }), null);
  // the year of the day after the birth: born in September, a baptism dated 1 August of that year
  assert.deepEqual(plain(w.baptismAfterBirth({ year: 1846, month: 8, day: 1 }, { year: 1846, month: 9, day: 16 })), { year: 1847, month: 8, day: 1 });
  // the same year when the slip is a year back: born 16 July 1846, baptized "23 August 1845"
  assert.deepEqual(plain(w.baptismAfterBirth({ year: 1845, month: 8, day: 23 }, { year: 1846, month: 7, day: 16 })), { year: 1846, month: 8, day: 23 });
  // the other reading: the birth's day in the year before the baptism (or in its year)
  assert.deepEqual(plain(w.birthBeforeBaptism({ year: 1846, month: 10, day: 16 }, { year: 1846, month: 5, day: 18 })), { year: 1845, month: 10, day: 16 });
  assert.deepEqual(plain(w.birthBeforeBaptism({ year: 1847, month: 3, day: 2 }, { year: 1846, month: 5, day: 18 })), { year: 1846, month: 3, day: 2 });

  const { win, state, $ } = checkedPage();
  const lars = state.people.find((p) => p.name === 'Lars');
  const row = state.rows.find((r) => r.name === 'Lars');
  // the record: born 16 October 1846 (its birth year), baptized "18 May 1846"
  const b = { ...state.record, recordDate: '1846-05-18', fields: { ...state.record.fields, 'date of birth': '10-16', 'birth year': '1846' } };
  state.record = b;
  const facts = win.recordFacts(lars, b);
  assert.match(facts.Christening.text, /^18 May 1846, .*\(before the birth, 16 October 1846\)$/);
  const slip = plain(win.dateSlip(lars, b, null));
  assert.deepEqual(slip.baptism, { year: 1847, month: 5, day: 18 });
  assert.deepEqual(slip.birth, { year: 1845, month: 10, day: 16 });
  assert.equal(slip.fromFs, false);
  const vitals = () => plain(win.factAdditions(lars, b, { pid: 'TEST-LAR' })).filter((a) => a.fact === 'Birth' || a.fact === 'Christening').map((a) => [a.fact, a.action, a.value.date]);
  // FS: born 15 October 1845, christened 18 May 1846 (the birth's year is the slip)
  state.fs = { ...LARS_1846, birth: { date: '15 October 1845', place: 'Vågå, Oppland, Norway' }, christening: { date: '18 May 1846', place: 'Vågå, Oppland, Norway' } };
  // not sure (the default): neither date offered
  assert.deepEqual(vitals(), []);
  // either reading may fit: the birth near FS's (a day off), the christening the same
  const tree = { pid: 'TEST-LAR' };
  const readings = win.factReadings(facts, lars, b, tree);
  assert.equal(readings.length, 3);
  const fsFacts = win.treeFacts(tree, b);
  assert.equal(win.bestMark('Christening', readings, fsFacts, lars, tree, b), 'same');
  assert.equal(win.bestMark('Birth', readings, fsFacts, lars, tree, b), 'near');
  // the box: three choices, the birth's reading marked as FS's
  row.showFacts();
  const box = row.node.querySelector('.slip');
  assert.ok(box, 'the slip box');
  assert.match(box.textContent, /The baptism, 18 May 1846, is dated before the birth, 16 October 1846/);
  const radios = [...box.querySelectorAll('input[type=radio]')];
  assert.deepEqual(radios.map((r) => [r.value, r.checked]), [['baptism', false], ['birth', false], ['', true]]);
  assert.match(radios[1].parentNode.textContent, /born 16 October 1845, baptized 18 May 1846 \(as FamilySearch has it\)/);
  assert.doesNotMatch(radios[0].parentNode.textContent, /as FamilySearch has it/);
  // the birth's year chosen: the birth by that reading (the record's day), the christening as written
  radios[1].checked = true;
  radios[1].dispatchEvent(new win.Event('change'));
  assert.equal(win.slipChoice(lars), 'birth');
  assert.deepEqual(vitals(), [['Birth', 'edit', '16 October 1845']]);
  assert.match(row.node.querySelector('table.facts').textContent, /16 October 1846 \(read as 16 October 1845\)/);
  assert.equal(win.bestMark('Christening', win.factReadings(facts, lars, b, tree), fsFacts, lars, tree, b), 'same');
  // the baptism's year chosen: the christening a year later, the birth as written
  state.slipChoices[lars.key] = 'baptism';
  assert.deepEqual(vitals(), [['Birth', 'edit', '16 October 1846'], ['Christening', 'edit', '18 May 1847']]);
  assert.match(win.linkerReport(), /Baptism before the birth; the year that is wrong: the baptism's/);
  state.slipChoices = {};

  // the record without a birth date of its own: FS's full birth date clashes with it
  state.record = { ...b, fields: { ...b.fields, 'date of birth': '', 'birth year': '' } };
  state.fs = { ...LARS_1846, birth: { date: '16 October 1846', place: 'Vågå, Oppland, Norway' }, christening: undefined };
  const fsSlip = plain(win.dateSlip(lars, state.record, win.fullTree('TEST-LAR')));
  assert.equal(fsSlip.fromFs, true);
  const fsVitals = () => plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' })).filter((a) => a.fact === 'Birth' || a.fact === 'Christening').map((a) => [a.fact, a.action, a.value.date]);
  assert.deepEqual(fsVitals(), []);
  state.slipChoices = { [lars.key]: 'baptism' };
  assert.deepEqual(fsVitals(), [['Christening', 'add', '18 May 1847']]);
  // FS's birth the slip: its year changed, its place kept; the christening as written
  state.slipChoices = { [lars.key]: 'birth' };
  const fixedBirth = plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' })).filter((a) => a.fact === 'Birth' || a.fact === 'Christening');
  assert.deepEqual(fixedBirth.map((a) => [a.fact, a.action, a.value.date]), [['Birth', 'edit', '16 October 1845'], ['Christening', 'add', '18 May 1846']]);
  assert.equal(fixedBirth[0].value.place, 'Vågå, Oppland, Norway');
});

test('townOfYear(): FS\'s place not standardized, the town and county without Norway (bug: "Halden, Østfold" kept for 1893)', () => {
  assert.equal(w.townOfYear('Halden, Østfold', 1893), 'Fredrikshald, Smaalenene, Norway');
  assert.equal(w.townOfYear('Halden, Østfold.', 1893), 'Fredrikshald, Smaalenene, Norway');
  // a town's name alone, or with another county, may be a farm elsewhere: as it is
  assert.equal(w.townOfYear('Halden', 1893), 'Halden');
  assert.equal(w.townOfYear('Halden, Oppland', 1893), 'Halden, Oppland');
  assert.equal(w.townOfYear('Halden, Østfold', 1930), 'Halden, Østfold, Norway');
});

test('factAdditions(): a baptized child\'s birth FS lacks is in the parish of the baptism (reports #8, #9: no place, FS refused it)', () => {
  const { win, state } = checkedPage();
  const lars = state.people.find((p) => p.name === 'Lars');
  state.fs = { ...LARS_1846, birth: undefined };
  const birth = plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' })).find((a) => a.fact === 'Birth');
  assert.equal(birth.action, 'add');
  assert.equal(birth.value.place, 'Vågå, Oppland, Norway');
  // FS's own birth keeps its place, also none
  state.fs = { ...LARS_1846, birth: { date: '1846', place: 'Sel, Oppland, Norway' } };
  const edit = plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' })).find((a) => a.fact === 'Birth');
  assert.equal(edit.value.place, 'Sel, Oppland, Norway');
  state.fs = { ...LARS_1846, birth: { date: '1846' } };
  assert.equal(plain(win.factAdditions(lars, state.record, { pid: 'TEST-LAR' })).find((a) => a.fact === 'Birth').value.place, '');
});

test('readPlan(): a birth added without a place stops the plan (reports #8, #9: FS keeps Save off)', () => {
  const { win, state } = checkedPage();
  state.fs = { ...LARS_1846, birth: undefined };
  const lars = state.rows.find((r) => r.person.name === 'Lars');
  lars.showFacts();
  const item = [...lars.node.querySelectorAll('.additions li')].find((li) => /Add the birth/.test(li.textContent));
  const tick = item.querySelector('input[type=checkbox]');
  tick.checked = true;
  tick.dispatchEvent(new win.Event('change'));
  const place = item.querySelector('input.place');
  assert.equal(place.value, 'Vågå, Oppland, Norway');
  assert.equal(plain(win.readPlan(true).pairs.find((p) => p.pid === 'TEST-LAR').additions)[0].type, 'BIRTH');
  place.value = '';
  place.dispatchEvent(new win.Event('input'));
  assert.throws(() => win.readPlan(true), /FamilySearch takes no birth without a place: fill in the place of "Add the birth" for Lars/);
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

test('factAdditions(): on a run again, every fact this record gave is updated, its reason too (bug: facts FS had were skipped, their reasons left naming the old title)', () => {
  const { win, state } = checkedPage();
  const b = record('burial-1854');
  const lars = w.recordPeople(b)[0];
  state.record = b;
  const id = b.permanentId;
  const from = (title) => ({ id, reason: win.additionReason(b, title) });
  const old = from('Old title');
  // FS as the first run left it: each fact with the reason naming the old title
  const fs = (more = {}) => ({ pid: 'TEST-LLA', name: 'Lars Larsen', birth: { date: 'about 1797' },
    death: { date: '12 April 1854', place: 'Aasen, Vinger, Hedmark, Norway', from: old },
    burial: { date: '18 April 1854', place: 'Vinger, Hedmark, Norway', from: old },
    residences: [{ date: '1854', place: 'Aasen, Vinger, Hedmark, Norway', description: 'Aasen', from: old }],
    occupations: [{ date: '1854', place: 'Vinger, Hedmark, Norway', description: 'Lægdslem', from: old }],
    altNames: ['Lars Larsen Holt'], altNamesFrom: [{ name: 'Lars Larsen Holt', from: old }], ...more });
  const opts = { ids: [id], reason: win.additionReason(b, 'New title') };
  const run = (tree, o = opts) => { state.fs = tree; return plain(win.factAdditions(lars, b, { pid: 'TEST-LLA' }, 'Lars Larsen Holt', o)); };
  // the same values, another title: every one updated, the reason only, found by the record's ID
  assert.deepEqual(run(fs()).map((a) => [a.fact, a.action, a.refresh, a.reasonOnly, a.match]), [
    ['Name', 'edit', true, true, ['Lars Larsen Holt', id]],
    ['Death', 'edit', true, true, ['1854', id]],
    ['Burial', 'edit', true, true, ['1854', id]],
    ['Residence', 'edit', true, true, ['1854', id]],
    ['Occupation', 'edit', true, true, ['1854', id]]
  ]);
  assert.equal(w.additionLabel(run(fs())[1]), 'Update the death from this record');
  // the reason as it is now: nothing; nor for facts another record gave, or FS's own
  assert.deepEqual(run(fs(), { ...opts, reason: old.reason }), []);
  assert.deepEqual(run(fs(), { ...opts, ids: ['pg99000000000099'] }), []);
  // FS's display adds "More" after the reason: the same reason
  const more = { id, reason: old.reason.replace(/\.$/, '') + 'More' };
  assert.deepEqual(run(fs({ death: { ...fs().death, from: more } }), { ...opts, reason: old.reason }), []);
  // a value changed since: the record's (a residence of the year besides another one,
  // and an occupation in other words: this record's changed, not a second added)
  const changed = run(fs({
    residences: [{ date: '1854', place: 'Kongsvinger, Hedmark, Norway' }, { date: '1854', place: 'Halden, Østfold, Norway', description: 'Aasen', from: old }],
    occupations: [{ date: '1854', place: 'Vinger, Hedmark, Norway', description: 'Inderst', from: old }, { description: 'Husmand' }] }));
  assert.deepEqual(changed.filter((a) => !a.reasonOnly).map((a) => [a.fact, a.action, a.value]), [
    ['Residence', 'edit', { date: '1854', place: 'Aasen, Vinger, Hedmark, Norway', description: 'Aasen' }],
    ['Occupation', 'edit', { date: '1854', place: 'Vinger, Hedmark, Norway', description: 'Lægdslem' }]
  ]);
  // done once FS's fact has the reason written (and, but for the reason alone, the values)
  const death = run(fs())[1];
  const reason = opts.reason;
  assert.equal(win.onTreeAlready(fs(), { ...death, reason }), false);
  assert.equal(win.onTreeAlready(fs({ death: { ...fs().death, from: { id, reason } } }), { ...death, reason }), true);
  const home = changed.find((a) => a.fact === 'Residence');
  assert.equal(win.onTreeAlready(fs({ residences: [{ date: '1854', place: 'Halden, Østfold, Norway', from: { id, reason } }] }), { ...home, reason }), false);
  assert.equal(win.onTreeAlready(fs({ residences: [{ date: '1854', place: 'Aasen, Vinger, Hedmark, Norway', from: { id, reason } }] }), { ...home, reason }), true);
});

test('factAdditions(): a residence this record gave, in a renamed town under its present name, is updated to the town of the year (bug: "Aasen, Halden, Østfold, Norway" for 1858 kept)', () => {
  const { win, state } = checkedPage();
  const base = record('burial-1854');
  const b = { ...base, county: 'Østfold', church: '', sourceTitle: 'Church book from Halden parish 1850-1860 (0101P)' };
  const lars = w.recordPeople(b)[0];
  state.record = b;
  const id = b.permanentId;
  const old = { id, reason: win.additionReason(b, 'Old title') };
  const reason = win.additionReason(b, 'New title');
  state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', birth: { date: 'about 1797' }, occupations: [],
    residences: [{ date: '1854', place: 'Aasen, Halden, Østfold, Norway', description: 'Aasen', from: old }] };
  const home = plain(win.factAdditions(lars, b, { pid: 'TEST-LLA' }, 'Lars Larsen', { ids: [id], reason })).find((a) => a.fact === 'Residence');
  assert.deepEqual([home.action, home.refresh, home.reasonOnly, home.value.place], ['edit', true, undefined, 'Aasen, Fredrikshald, Smaalenene, Norway']);
  // the facts table marks FS's residence near, not the same
  const facts = win.treeFacts({ pid: 'TEST-LLA' }, b);
  assert.equal(win.compareFact('Residence', win.recordFacts(lars, b).Residence, facts.Residence, lars, { pid: 'TEST-LLA' }, b), 'near');
  // not done until FS has the town of the year
  assert.equal(win.onTreeAlready({ ...state.fs, residences: [{ ...state.fs.residences[0], from: { id, reason } }] }, { ...home, reason }), false);
});

test('recordFacts(): a date of death without a year field takes the burial\'s year, or the year before', () => {
  const { win, state } = checkedPage();
  const base = record('burial-1854');
  const b = { ...base, fields: { ...base.fields } };
  delete b.fields['year of death'];
  const lars = w.recordPeople(b)[0];
  assert.equal(w.recordFacts(lars, b).Death.text, '12 April 1854');
  // FS has the burial's date as the death's: the record's date of death is offered
  state.record = b;
  state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', birth: { date: 'about 1797' }, death: { date: '18 April 1854', place: 'Vinger, Hedmark, Norway' }, residences: [], occupations: [] };
  const death = plain(win.factAdditions(lars, b, { pid: 'TEST-LLA' })).find((a) => a.fact === 'Death');
  assert.equal(death.action, 'edit');
  assert.equal(death.value.date, '12 April 1854');
  // died in December, buried in January
  const jan = { ...b, recordDate: '1854-01-05', fields: { ...b.fields, 'date of death': '12-28' } };
  assert.equal(w.recordFacts(w.recordPeople(jan)[0], jan).Death.text, '28 December 1853');
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

test('factAdditions(): in a town\'s church book the word after the patronymic is a family name, not a death farm', () => {
  const { win, state } = checkedPage();
  const b = record('burial-1854');
  const town = { ...b, county: 'Aust-Agder', church: '', sourceTitle: 'Church book from Grimstad parish 1850-1860 (0904P)',
    fields: { ...b.fields, residence: '', 'last name': 'Larsen Lindemann' },
    people: b.people.map((p) => ({ ...p, name: 'Lars Larsen Lindemann', residence: '', birthPlace: '' })) };
  assert.equal(w.townParish(town), true);
  assert.equal(w.townParish(b), false);  // Vinger: rural
  const lars = w.recordPeople(town)[0];
  state.record = town;
  state.fs = { pid: 'TEST-LLA', name: 'Lars Larsen', birth: { date: 'about 1797' }, death: { date: '12 April 1854', place: 'Grimstad, Aust-Agder, Norway' }, residences: [], occupations: [{ description: 'Lægdslem' }] };
  // the tree's death agrees: nothing to change (bug: "Lindemann, Grimstad, ..." offered)
  assert.equal(plain(win.factAdditions(lars, town, { pid: 'TEST-LLA' })).find((a) => a.fact === 'Death'), undefined);
  // a place of death the record gives is still used
  const named = { ...town, fields: { ...town.fields, 'place of death': 'Biodden' } };
  state.record = named;
  assert.equal(plain(win.factAdditions(lars, named, { pid: 'TEST-LLA' })).find((a) => a.fact === 'Death').value.place, 'Biodden, Grimstad, Aust-Agder, Norway');
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
  assert.equal(birth.value.place, 'Oslo, Norway');  // Christiania in 1865: FS's Oslo
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
    { fact: 'Emigration', action: 'add', type: 'OTHER_EVENT', title: 'Emigration', value: { date: '5 September 1902', place: 'Kristiania, Norway', description: 'Destination: Minnesota' } }
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
  assert.deepEqual(home('Vaage').value, { date: '1902', place: 'Vågå, Oppland, Norway', description: 'Vaage' });  // a municipality, the record's name of it the description
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
    sourceTitle: '1891 census for 0515 Vågå', county: 'Oppland', title: 'Halvor Larsen household - 0515 Vågå - "Norway, Census, 1891"', citation: '', notes: '', others: [], people: [
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
    findPerson: () => ({ ok: true, heading: 'Add Child', fields: [{ name: 'birthPlace', value: 'Vågå, Oppland, Norway', picked: '', standard: 'Vågå, Oppland, Norway Municipality, 1781 - 2019' }],
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
  assert.match($('np-results').textContent, /Place: Vågå, Oppland, Norway \(kept as written; FamilySearch's standard place: Vågå, Oppland, Norway Municipality, 1781 - 2019\)/);
  assert.doesNotMatch($('np-results').textContent, /suggested nothing/);
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

test('formerTitles(): the titles a source got before, the year in front or no date at the end', () => {
  assert.deepEqual(plain(w.formerTitles('Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth', '1846')), ['1846, Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth']);
  // the record's date at the end: without it (1.6.0's first builds), and that with the year in front
  assert.deepEqual(plain(w.formerTitles('Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth, 23 August 1846', '1846')), [
    'Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth', '1846, Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth']);
  assert.deepEqual(plain(w.formerTitles('Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth, 1846', '1846')), [
    'Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth', '1846, Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth']);
  assert.deepEqual(plain(w.formerTitles('Halvor Larsen household, Bakken nedre, Nordlien - Vågå - "Norway, Census, 1865"', '1865')), [
    '1865, Halvor Larsen household, Bakken nedre, Nordlien - Vågå - "Norway, Census, 1865"',  // edited by hand on FS
    '1865, Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census']);
  // a month without a day, and a range of years, as DA dates some records
  assert.deepEqual(plain(w.formerTitles('Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth, November 1846', '1846')), [
    'Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth', '1846, Lars, son of Halvor Larsen - Vågå parish (0515P) - Birth']);
  assert.deepEqual(plain(w.formerTitles('Halvor Larsen - Skifteprotokoll 1740-1743, 1740-1743', '1740')), [
    'Halvor Larsen - Skifteprotokoll 1740-1743', '1740, Halvor Larsen - Skifteprotokoll 1740-1743']);
  assert.deepEqual(plain(w.formerTitles('1846, Lars Halvorsen - Vågå - Birth', '1846')), []);  // a year in front already
  assert.deepEqual(plain(w.formerTitles('Lars Halvorsen - Vågå - Birth', '')), []);
});

test('run(): a source under its former, year-first title is used, given the new title, not made again', async () => {
  const { chrome, asked } = fakeFs({
    findSource: ({ older }) => ({ ok: true, sources: [{ id: 'TEST-S07', title: older[1] }], title: older[1] }),
    attachedTo: () => ({ ok: true, persons: [] }),
    editSource: ({ read }) => read ? { ok: true, sourceId: 'TEST-S07', fields: {} } : { ok: true, sourceId: 'TEST-S07', changed: ['title'], missing: [] },
    attach: () => ({ ok: true })
  });
  const { win, $ } = checkedPage(chrome);
  const title = $('f-title').value;
  await win.run(false);
  assert.deepEqual(plain(asked.map(([name]) => name)), ['findSource', 'editSource', 'attachedTo', 'editSource']);
  assert.match(asked[0][1].older[1], /^1846, /);
  assert.equal(asked[1][1].read, true);  // read first: a former title could be another record's
  assert.equal(asked[3][1].title, asked[0][1].older[1]);  // found in the SourceBox by its former title
  assert.equal(asked[3][1].source.title, title);  // and given the new one
  assert.match($('log').textContent, /under its former title "1846, /);
});

test('lookUpSource(): sources under the title without the date are searched with it, and only this record\'s used (bug: two children of one name had one title)', async () => {
  // a son named after a brother who died: the brother's source has the title without a date
  const searched = [];
  const { chrome, asked } = fakeFs({
    findSource: ({ title, older, search }) => {
      searched.push(search);
      return { ok: true, sources: [{ id: 'TEST-S11', title: older[0] }, { id: 'TEST-S12', title: older[0] }], title: older[0] };
    },
    editSource: ({ sourceId }) => sourceId === 'TEST-S11' ? { ok: false, otherRecord: true, other: 'pd99000000000077' }
      : { ok: true, sourceId, fields: { title: 'x' } },
    attachedTo: () => ({ ok: true, persons: [] })
  });
  const { win, $ } = checkedPage(chrome);
  const title = $('f-title').value;
  assert.match(title, / - Birth, 23 August 1846$/);
  const base = title.replace(/, 23 August 1846$/, '');
  const tab = await win.openTab(value(win, 'SOURCEBOX_URL'));
  const source = win.reviewedSource('f');
  const found = await win.lookUpSource(tab, title, true, source, win.sameRecordIds(0));
  assert.deepEqual(searched, [base]);  // one search finds the title and its former ones
  assert.equal(found.id, 'TEST-S12');
  assert.deepEqual(plain(found.ids), ['TEST-S12']);
  assert.equal(found.formerTitle, base);
  assert.deepEqual(plain(found.fields), { title: 'x' });
  // the brother's only: none of this record, so a new source is made
  asked.length = 0;
  const { chrome: chrome2, asked: asked2 } = fakeFs({
    findSource: ({ older }) => ({ ok: true, sources: [{ id: 'TEST-S11', title: older[0] }], title: older[0] }),
    editSource: () => ({ ok: false, otherRecord: true, other: 'pd99000000000077' }),
    createSource: () => ({ ok: true, sourceId: 'TEST-S13' }),
    attachedTo: () => ({ ok: true, persons: [] }),
    attach: () => ({ ok: true })
  });
  const page = checkedPage(chrome2);
  await page.win.run(false);
  assert.deepEqual(plain(asked2.map(([name]) => name)).slice(0, 3), ['findSource', 'editSource', 'createSource']);
  assert.equal(asked2[2][1].title, title);
  assert.match(page.$('log').textContent, /Source created \(TEST-S13\)/);
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
  const found = await win.lookUpSource(tab, 'Halvor Larsen household, Bakken nedre, Nordlien - Vågå - "Norway, Census, 1865"');
  assert.deepEqual(titles, ['Halvor Larsen household, Bakken nedre, Nordlien - Vågå - "Norway, Census, 1865"', '1865, Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census']);
  assert.equal(found.id, 'TEST-S08');
  assert.equal(found.formerTitle, '1865, Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census');
});

test('titleOfYear(): a town\'s parish in the title by its name of the record\'s year; a source under the present name is found by it', async () => {
  const record = (date, source) => ({ recordDate: date, sourceTitle: source });
  const halden = 'Church book from Halden parish 1869-1884 (0101P)';
  const title = 'Ole, son of Hans Olsen - Halden parish 1869-1884 (0101P) - Birth, 17 May 1875';
  const old = 'Ole, son of Hans Olsen - Fredrikshald parish 1869-1884 (0101P) - Birth, 17 May 1875';
  assert.equal(w.titleOfYear(title, record('1875-05-17', halden)), old);
  assert.equal(w.titleOfYear(title, record('1930-05-17', halden)), title);  // Halden by then
  assert.equal(w.titleOfYear('Lars - Vågå parish (0515P) - Birth', record('1846-08-23', 'Church book from Vågå parish (0515P)')), 'Lars - Vågå parish (0515P) - Birth');
  assert.equal(w.presentParishTitle(old), title);
  assert.equal(w.presentParishTitle('Lars - Vågå parish (0515P) - Birth'), 'Lars - Vågå parish (0515P) - Birth');
  // the SourceBox's source of the present name: one search by the name, given the new title
  const searched = [];
  const { chrome } = fakeFs({
    findSource: ({ older, search }) => {
      searched.push(search);
      return { ok: true, sources: [{ id: 'TEST-S14', title }], title: older.includes(title) ? title : null };
    },
    editSource: () => ({ ok: true, sourceId: 'TEST-S14', fields: { title } }),
    attachedTo: () => ({ ok: true, persons: [] })
  });
  const { win, state, $ } = checkedPage(chrome);
  state.record = { ...state.record, recordDate: '1875-05-17', sourceTitle: halden };
  win.fillSource({ ...state.record, title, citation: 'Norway, Østfold, Halden Parish, "' + halden + '," …' });
  assert.equal($('f-title').value, old);  // the source box's title
  assert.match($('f-citation').value, /^Norway, Østfold, Halden Parish, "Church book from Halden parish/);  // as DA names the book
  const tab = await win.openTab(value(win, 'SOURCEBOX_URL'));
  const found = await win.lookUpSource(tab, old, true, win.reviewedSource('f'), win.sameRecordIds(0));
  assert.deepEqual(searched, ['Ole, son of Hans Olsen']);
  assert.equal(found.id, 'TEST-S14');
  assert.equal(found.formerTitle, title);
});

test('titleOfYear(), parishPlace(): DA\'s newer source titles, without a parish code ("Parish register (official) for Halden parish")', () => {
  const register = 'Parish register (official) for Halden parish 1845-1856';
  const record = { recordDate: '1851-05-18', sourceTitle: register, county: 'Østfold' };
  const title = 'Ole, son of Hans Olsen - ' + register + ' - Birth, 18 May 1851';
  const old = 'Ole, son of Hans Olsen - Parish register (official) for Fredrikshald parish 1845-1856 - Birth, 18 May 1851';
  assert.equal(w.sourceParish(register), 'Halden');
  assert.equal(w.parishMunicipality(register), '0101');
  assert.equal(w.titleOfYear(title, record), old);
  assert.equal(w.presentParishTitle(old), title);
  assert.equal(w.parishName(record), 'Fredrikshald');
  assert.equal(w.parishPlace(record), 'Fredrikshald, Smaalenene, Norway');
  assert.ok(w.townParish(record));
  // a rural parish's name is no town's
  assert.ok(!w.townParish({ recordDate: '1851-05-18', sourceTitle: 'Parish register (official) for Vågå parish 1845-1856' }));
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

// Report #10: the mother "!! <patronymic>" on DA, her given name not read
test("suggestPairs(), otherName(), compareFact(), renameNoteLine(): a parent whose given name DA couldn't read", () => {
  const r = record('baptism-1846');
  r.people.find((p) => p.role === 'mor').name = '!! Larsdatter';
  const people = w.recordPeople(r);
  const { pairs, why } = w.suggestPairs(r, people, w.findSelf(people, LARS_1846, true), LARS_1846);
  const mother = people.find((p) => p.name === '!! Larsdatter');
  assert.equal(pairs[mother.key], 'TEST-AST');
  assert.match(why[mother.key], /no legible given name on DA/);
  // another patronymic: only named, as before
  const r2 = record('baptism-1846');
  r2.people.find((p) => p.role === 'mor').name = '!! Pedersdatter';
  const people2 = w.recordPeople(r2);
  const other = w.suggestPairs(r2, people2, w.findSelf(people2, LARS_1846, true), LARS_1846);
  assert.equal(other.pairs[people2.find((p) => p.name === '!! Pedersdatter').key], undefined);
  // never offered as a name, and neither the same nor another
  assert.equal(w.otherName(mother, r, { pid: 'TEST-AST', name: 'Astrid Larsdatter', altNames: [] }), null);
  assert.equal(w.compareFact('Name', { text: mother.name }, { text: 'Astrid Larsdatter' }, mother, { pid: 'TEST-AST', name: 'Astrid Larsdatter' }, r), '');
  // the notes' line, as da_record.js marks it, follows a name filled in
  assert.equal(w.renameNoteLine('Mother: !! [no name in the source] Larsdatter\nFather: Halvor Larsen', 'Mother', '!! Larsdatter', 'Astrid Larsdatter'),
    'Mother: Astrid Larsdatter\nFather: Halvor Larsen');
});

// Bug: a child's burial that gives the child no name ("!! Halvorsd.*", the patronymic
// the transcriber's) was paired with the FS child named Halvor, since "Halvorsd." has
// Halvor's letters; the record can't tell which child it is, so the hint names the FS
// children it could be: born by the burial, not dead in another year
test('suggestPairs(): an unnamed child in a burial is not paired; the FS children it could be are named', () => {
  const r = w.extractRecord(unnamedBurial(w), fixtureUrl('da/burial-1854.html'));
  const people = w.recordPeople(r);
  people.forEach((p) => { p.current = p.name === 'Halvor Larsen'; });
  const fs = HALVOR_FAMILY([
    { pid: 'TEST-HJR', name: 'Halvor Halvorsen', gender: 'Male', lifespan: '1853-1854' },
    { pid: 'TEST-OLE', name: 'Ole Halvorsen', gender: 'Male', lifespan: '1852-1900' },
    { pid: 'TEST-PER', name: 'Peder Halvorsen', gender: 'Male', lifespan: '1851' },
    { pid: 'TEST-NIL', name: 'Nils Halvorsen', gender: 'Male', lifespan: '1856-1930' },
    MARTE
  ]);
  const { pairs, why } = w.suggestPairs(r, people, w.findSelf(people, fs, true), fs);
  const child = people.find((p) => p.name === '!! Halvorsd.*');
  assert.equal(pairs[child.key], undefined);
  assert.equal(byName(people, pairs)['Halvor Larsen'], 'TEST-HAL');
  assert.match(why[child.key], /^no name in the source; FamilySearch children it could be: Halvor Halvorsen \(1853-1854\) or Peder Halvorsen \(1851\)\./);
  assert.equal(w.hasGivenName(child, 'Halvor'), false);
  assert.equal(w.givenFit(child, 'Halvor'), 0);
});

// Bug: a baptism opened from FS's Lars, christened and buried two years before it,
// paired him with the record's child, when the parents' FS family has the brother of
// the same name born that year (a child named after one who died)
test('suggestPairs(): the FS person buried before the baptism is not paired; the namesake brother is', () => {
  const r = record('baptism-1846');
  const people = w.recordPeople(r);
  const dead = { ...LARS_1846, pid: 'TEST-LA1', christening: { date: '10 February 1844' }, birth: undefined, burial: { date: '6 March 1844' },
    mother: { pid: 'TEST-AST', name: 'Astri Larsdatter', lifespan: '1815-1890' } };
  const self = w.findSelf(people, dead, true);
  const first = w.suggestPairs(r, people, self, dead);
  assert.equal(first.pairs[self.key], undefined);
  assert.match(first.why[self.key], /^FamilySearch Lars Halvorsen was buried 6 March 1844: not paired/);
  assert.equal(byName(people, first.pairs)['Halvor Larsen'], 'TEST-HAL');
  assert.ok(first.need.includes('TEST-HAL'), 'the father\'s family is read');
  const trees = { 'TEST-HAL': HALVOR_FAMILY([
    { pid: 'TEST-LA1', name: 'Lars Halvorsen', gender: 'Male', lifespan: '1844-1844' },
    { pid: 'TEST-LA2', name: 'Lars Halvorsen', gender: 'Male', lifespan: '1846-1920' }
  ]) };
  const next = w.suggestPairs(r, people, self, dead, trees);
  assert.equal(next.pairs[self.key], 'TEST-LA2');
  assert.match(next.why[self.key], /not FamilySearch Lars Halvorsen, who was buried 6 March 1844$/);
  // Chosen by hand, the FS person stands
  assert.equal(w.suggestPairs(r, people, self, dead, trees, { [self.key]: 'TEST-LA1' }).pairs[self.key], 'TEST-LA1');
  // Nothing against them: paired as before
  assert.equal(w.selfContradicted(r, self, LARS_1846), '');
  assert.equal(w.selfContradicted(r, self, { christening: { date: '3 May 1843' } }), 'was christened 3 May 1843');
  assert.equal(w.selfContradicted(r, self, { birth: { date: 'about 1846' }, death: { date: '1846' } }), '');
});
