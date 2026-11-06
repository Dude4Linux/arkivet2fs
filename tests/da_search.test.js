// da_search.js: name stems, the profile, the queries and their search plan, and
// reading DA's result pages (saved in fixtures/da)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, plain, SHARED } = require('./harness.js');
const { criteria } = require('./criteria.js');

const w = load(SHARED);

// Lars Halvorsen, b. 1846 in Vågå, son of Halvor Larsen and Astri Larsdatter
const lars = (more = {}) => criteria({
  name: [{ givenName: 'Lars', surname: 'Halvorsen' }], sex: [{ sex: 'Male' }],
  birth: [{ birthLikeDate: '16 July 1846', 'birthLikeDate.from': '1845', 'birthLikeDate.to': '1847', birthLikePlace: 'Vågå, Oppland, Norway' }],
  father: [{ fatherGivenName: 'Halvor', fatherSurname: 'Larsen' }],
  mother: [{ motherGivenName: 'Astri', motherSurname: 'Larsdatter' }],
  ...more
});

test('givenStem() cuts a final vowel, but not of short names', () => {
  assert.equal(w.givenStem('Anna'), 'Ann*');
  assert.equal(w.givenStem('Magdaline'), 'Magdalin*');
  assert.equal(w.givenStem('Ole'), 'Ole');
  assert.equal(w.givenStem('Jon'), 'Jon');
  assert.equal(w.givenStem('Johannes'), 'Johannes');
});

test('surnameStem() keeps the patronymic or name base', () => {
  assert.equal(w.surnameStem('Aslaksen'), 'Aslaks*');
  assert.equal(w.surnameStem('Tollefsdatter'), 'Tollefs*');
  assert.equal(w.surnameStem('Lindeman'), 'Lindem*');
});

test("patronymicOf() makes the patronymic from the father's given name", () => {
  assert.equal(w.patronymicOf('Aslak', 'Male'), 'Aslaksen');
  assert.equal(w.patronymicOf('Ole'), 'Olsen');
  assert.equal(w.patronymicOf('Johannes', 'Female'), 'Johannesdatter');
});

test("relatedStem() is the shared start of a name's forms", () => {
  assert.equal(w.relatedStem('Ingeborg'), 'Ing*');
  assert.equal(w.relatedStem('Ingbjør'), 'Ing*');
  const forms = plain(w.nameForms('Ingeborg'));
  for (const form of ['ingeborg', 'ingebjørg', 'ingbjør']) assert.ok(forms.includes(form), form);
});

test('patronymics: recognized, and their base', () => {
  assert.equal(w.isPatronymic('Larsdatter'), true);
  assert.equal(w.isPatronymic('Halvorsen'), true);
  assert.equal(w.isPatronymic('Lindeman'), false);
  assert.equal(w.patronymicBase('Halvardsen'), 'Halvard');
});

test('profile(): the full birth date, the year, the relatives', () => {
  const P = plain(w.profile(lars()));
  assert.equal(P.given, 'Lars');
  assert.equal(P.surname, 'Halvorsen');
  assert.equal(P.birthYear, 1846);
  assert.deepEqual(P.birth, { from: 1845, to: 1847 });
  assert.deepEqual(P.birthDate, { year: 1846, month: 7, day: 16, exact: true });
  assert.equal(P.father.given, 'Halvor');
  assert.equal(P.mother.surname, 'Larsdatter');
  assert.equal(P.leftNorway, null);
});

test('profile(): an emigration caps the searches two years after it', () => {
  const P = w.profile(lars({ emigration: [{ 'emigrationLikeDate.from': '1870', 'emigrationLikeDate.to': '1874' }] }));
  assert.equal(P.leftNorway, 1874);
  assert.equal(w.emigrationYears(P), '1872');
  assert.equal(w.leavingText(P), 'emigrating (FS: 1872)');
});

test('profile(): no birth, so one estimated from the marriage and children', () => {
  const P = plain(w.profile(criteria({
    name: [{ givenName: 'Eli', surname: 'Larsdatter' }], sex: [{ sex: 'Female' }],
    marriage: [{ 'marriageLikeDate.from': '1866', 'marriageLikeDate.to': '1870' }],
    child: [{ childGivenName: 'Halvor', childBirthYear: '1870' }]
  })));
  assert.equal(P.birthYear, null);
  assert.ok(P.estBirth && P.estBirth.from < P.estBirth.to, JSON.stringify(P.estBirth));
});

test('buildQueries(): one query per life event, in order', () => {
  assert.deepEqual(plain(w.buildQueries(lars()).map((q) => q.kind)),
    ['baptism', 'confirmation', 'marriage', 'children', 'childmarriage', 'census', 'emigration', 'moving', 'burial', 'other']);
});

test('buildQueries(): what can only be found after emigrating is skipped, with the reason', () => {
  const queries = w.buildQueries(lars({ emigration: [{ 'emigrationLikeDate.from': '1870', 'emigrationLikeDate.to': '1874' }] }));
  const skip = Object.fromEntries(queries.map((q) => [q.kind, q.skip || '']));
  assert.match(skip.burial, /emigrating/);
  assert.match(skip.childmarriage, /emigrating/);
  assert.equal(skip.baptism, '');
  assert.equal(skip.emigration, '');
});

test('buildQueries(): no baptism search without a parent or birth year; no children\'s marriages for women', () => {
  const queries = w.buildQueries(criteria({ name: [{ givenName: 'Eli', surname: 'Larsdatter' }], sex: [{ sex: 'Female' }] }));
  const skip = Object.fromEntries(queries.map((q) => [q.kind, q.skip || '']));
  assert.ok(skip.baptism, 'baptism skipped');
  assert.ok(skip.childmarriage, 'children\'s marriages skipped');
});

test('searchPlan(): the baptism with each parent, parish before county before Norway', () => {
  const q = w.buildQueries(lars())[0];
  const plan = w.searchPlan(q);
  assert.deepEqual(plain(plan.slice(0, 6).map((p) => p.step.text + ' @ ' + p.level.text)), [
    'Lars + father Halv* Lars* @ Vågå',
    'Lars + mother Astr* Lars* @ Vågå',
    'Lars + father Halv* Lars* @ Oppland',
    'Lars + mother Astr* Lars* @ Oppland',
    'Lars + father Halv* Lars* @ Norway',
    'Lars + mother Astr* Lars* @ Norway'
  ]);
  const url = new URL(w.daSearchUrl(w.withFields(w.withFields(q.base, plan[0].step.fields), plan[0].level.fields)));
  assert.equal(url.pathname, '/en/search/persons/advanced');
  const p = url.searchParams;
  assert.deepEqual(p.getAll('roles[]'), ['barn']);
  assert.equal(p.get('firstname'), 'Lars');
  assert.equal(p.get('related_first_name'), 'Halv*');
  assert.equal(p.get('related_last_name'), 'Lars*');
  assert.deepEqual(p.getAll('related_roles[]'), ['far']);
  assert.deepEqual(p.getAll('m[]'), ['0515']);
  assert.equal(p.get('event_year_from'), '1845');
  assert.ok(!p.has('genders[]'), 'never filter on gender: DA drops records without one');
});

test('parseResults(): a baptism search (4 hits)', () => {
  const { total, hits } = plain(w.parseResults(fixture('da/search-baptism.html')));
  assert.equal(total, 4);
  assert.deepEqual(hits.map((h) => h.id), ['pd99000000000223', 'pd99000000000018', 'pd99000000000224', 'pd99000000000225']);
  const hit = hits[1];
  assert.equal(hit.name, 'Lars');
  assert.equal(hit.date, '1846-08-23');
  assert.match(hit.url, /^https:\/\/www\.digitalarkivet\.no\/.*pd99000000000018/);
  for (const key of ['type', 'role', 'source', 'sourceUrl']) assert.ok(key in hit, key);
});

test('parseResults(): a census search (26 hits)', () => {
  const { total, hits } = plain(w.parseResults(fixture('da/search-census.html')));
  assert.equal(total, 26);
  assert.equal(hits.length, 26);
  assert.equal(hits[0].id, 'pf99000000000138');
  assert.equal(hits[0].name, 'Lars Halvorsen');
  assert.match(hits[0].born, /1849/);
});

test('parseResults(): a page of a larger search (81 hits, 50 on the page)', () => {
  const { total, hits } = plain(w.parseResults(fixture('da/search-emigration.html')));
  assert.equal(total, 81);
  assert.equal(hits.length, 50);
  assert.ok(hits.every((h) => /^[a-z]{2}\d{14,}$/.test(h.id)));
});
