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
