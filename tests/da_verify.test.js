// da_verify.js: who's who in a record, and checking a hit against FS's family
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, fixtureDoc, fixtureUrl, plain, SHARED } = require('./harness.js');
const { criteria } = require('./criteria.js');

const w = load(SHARED);
function record(name) {
  const file = 'da/' + name + '.html';
  return w.extractRecord(fixtureDoc(w, file), fixtureUrl(file));
}
const names = (list) => plain(list.map((p) => p.name));
const open = (r, i) => { r.people.forEach((p, k) => { p.current = k === i; }); return r; };
const lars = (more = {}) => w.profile(criteria({
  name: [{ givenName: 'Lars', surname: 'Halvorsen' }], sex: [{ sex: 'Male' }],
  birth: [{ birthLikeDate: '16 July 1846', 'birthLikeDate.from': '1845', 'birthLikeDate.to': '1847', birthLikePlace: 'Vågå, Oppland, Norway' }],
  father: [{ fatherGivenName: 'Halvor', fatherSurname: 'Larsen' }],
  mother: [{ motherGivenName: 'Astri', motherSurname: 'Larsdatter' }],
  ...more
}));

test('roleKind(): DA roles and census positions, in Norwegian or English', () => {
  const kind = (role, roleEnglish = '') => w.roleKind({ role, roleEnglish });
  assert.equal(kind('barn', 'Child'), 'child');
  assert.equal(kind('far'), 'father');
  assert.equal(kind('Hosbonde'), 'head');
  assert.equal(kind('Hans kone'), 'spouse');
  assert.equal(kind('Deres børn'), 'child');
  assert.equal(kind('d, fl'), 'child');
  assert.equal(kind('fl, d'), '');
  assert.equal(kind('fadder', 'Godparent'), '');
  // whole words: \b takes ø for a boundary, which read these as the code "s", a son
  assert.equal(kind('sønnesøn', 'Sønnesøn [grandson]'), 'grandchild');
  assert.equal(kind('sønnedatter'), 'grandchild');
  assert.equal(kind('Søns Søn'), 'grandchild');
  assert.equal(kind('sønnekone'), 'childInLaw');
  assert.equal(kind('svigersøn', 'Svigersøn [son-in-law]'), 'childInLaw');
  assert.equal(kind('søster', 'Søster [sister]'), '');
  assert.equal(kind('søn', 'Søn [son]'), 'child');
  // spelt with ö, as some clerks wrote it; 1891's head
  assert.equal(kind('Sönnesön'), 'grandchild');
  assert.equal(kind('Sönnekone'), 'childInLaw');
  assert.equal(kind('Familiens overhode', 'Familiens overhode [head of household]'), 'head');
  // 1865's town censuses refer to the one written above: the above-named's, these',
  // the preceding one's
  assert.equal(kind('Ovennævntes Kone'), 'spouse');
  assert.equal(kind('Overnevtes Barn'), 'child');
  assert.equal(kind('Ovennevtes Datter'), 'child');
  assert.equal(kind('Ovensts Hustru'), 'spouse');
  assert.equal(kind('Disses Barn'), 'child');
  assert.equal(kind("Ds's Kone"), 'spouse');
  assert.equal(kind("Ds's Søn"), 'child');
  assert.equal(kind('Den Foregaaendes Hustru'), 'spouse');
  assert.equal(kind('Dennes Svigersøn'), 'childInLaw');
  // another one's: a lodger's child isn't the head's
  assert.equal(kind('Logerendes Barn'), '');
  assert.equal(kind('Tjenestepigens Søn'), '');
});

test('relativesInRecord(): an 1891 page, the grandchildren the son\'s and his wife\'s', () => {
  const r = record('census-1891-grandchildren');
  const of = (i) => w.relativesInRecord(open(record('census-1891-grandchildren'), i));
  assert.deepEqual(names(of(0).spouse), ['Astri Larsdatter']);
  assert.deepEqual(names(of(0).child), ['Halvard Halvardsen']);  // the son only
  assert.deepEqual(names(of(2).spouse), ['Eldbjørg Halbrandsdatter']);
  assert.equal(of(2).child.length, 6);
  for (const i of [4, 5, 6, 7, 8, 9]) {
    assert.deepEqual(plain(of(i).father.map((p) => p.id)), [r.people[2].id], r.people[i].name);
    assert.deepEqual(names(of(i).mother), ['Eldbjørg Halbrandsdatter']);
  }
});

// An 1891-like household: the head's married son with his wife and their children,
// and an unmarried son
const HOUSEHOLD_1891 = () => ({ recordTypeInfo: { type: 'census' }, recordDate: '1891', fields: {}, people: [
  { name: 'Halvor Larsen', role: 'husfader', roleEnglish: 'Husfader [head of household]', birthYear: '1820' },
  { name: 'Kjersti Olsdatter', role: 'hustru', roleEnglish: 'Hustru [wife]', birthYear: '1824' },
  { name: 'Lars Halvorsen', role: 'søn', roleEnglish: 'Søn [son]', birthYear: '1850' },
  { name: 'Astri Olsdatter', role: 'sønnekone', roleEnglish: 'Sønnekone', birthYear: '1855' },
  { name: 'Ole Larsen', role: 'sønnesøn', roleEnglish: 'Sønnesøn [grandson]', birthYear: '1880' },
  { name: 'Marte Larsdatter', role: 'sønnedatter', roleEnglish: 'Sønnedatter [granddaughter]', birthYear: '1884' },
  { name: 'Johan Peder Halvorsen', role: 'søn', roleEnglish: 'Søn [son]', birthYear: '1860' }] });

test("relativesInRecord(): a census grandchild's parents are the son named by the patronymic and his wife", () => {
  const head = w.relativesInRecord(open(HOUSEHOLD_1891(), 0));
  assert.deepEqual(names(head.child), ['Lars Halvorsen', 'Johan Peder Halvorsen']);  // not the grandchildren
  const ole = w.relativesInRecord(open(HOUSEHOLD_1891(), 4));
  assert.deepEqual(names(ole.father), ['Lars Halvorsen']);
  assert.deepEqual(names(ole.mother), ['Astri Olsdatter']);
  const son = w.relativesInRecord(open(HOUSEHOLD_1891(), 2));
  assert.deepEqual(names(son.spouse), ['Astri Olsdatter']);
  assert.deepEqual(names(son.child), ['Ole Larsen', 'Marte Larsdatter']);
  assert.deepEqual(names(son.father), ['Halvor Larsen', 'Kjersti Olsdatter']);
  const wife = w.relativesInRecord(open(HOUSEHOLD_1891(), 3));
  assert.deepEqual(names(wife.spouse), ['Lars Halvorsen']);
  assert.deepEqual(names(wife.child), ['Ole Larsen', 'Marte Larsdatter']);
  assert.deepEqual(names(w.relativesInRecord(open(HOUSEHOLD_1891(), 6)).child), []);  // the unmarried son
});

test("relativesInRecord(): a baptized child's parents", () => {
  const found = w.relativesInRecord(record('baptism-1846'));
  assert.deepEqual(names(found.father), ['Halvor Larsen']);
  assert.deepEqual(names(found.mother), ['Astri Larsdatter']);
});

test("relativesInRecord(): the father's page sees his wife and child", () => {
  const found = w.relativesInRecord(open(record('baptism-1846'), 1));
  assert.deepEqual(names(found.spouse), ['Astri Larsdatter']);
  assert.deepEqual(names(found.child), ['Lars']);
});

// A marriage names the couple's fathers: each is the groom's or the bride's father
const MARRIAGE = () => ({ recordTypeInfo: { type: 'marriage' }, recordDate: '1870-10-20', fields: {}, people: [
  { id: 'pv99000000000001', name: 'Lars Halvorsen', role: 'brudgom', roleEnglish: 'Groom', current: true },
  { id: 'pv99000000000002', name: 'Kjersti Olsdatter', role: 'brur', roleEnglish: 'Bride' },
  { id: 'pv99000000000003', name: 'Halvor Larsen', role: 'brudgommens far', roleEnglish: "Groom's father" },
  { id: 'pv99000000000004', name: 'Ole Olsen', role: 'bruras far', roleEnglish: "Bride's father" }] });

test("relativesInRecord(): a marriage's groom and bride each have their own father", () => {
  const groom = w.relativesInRecord(MARRIAGE());
  assert.deepEqual(names(groom.father), ['Halvor Larsen']);
  assert.deepEqual(names(groom.spouse), ['Kjersti Olsdatter']);
  const bride = w.relativesInRecord(open(MARRIAGE(), 1));
  assert.deepEqual(names(bride.father), ['Ole Olsen']);
  assert.deepEqual(names(w.relativesInRecord(open(MARRIAGE(), 3)).child), ['Kjersti Olsdatter']);
});

test('relativesInRecord(): in 1900 the man and the woman of the house are a couple', () => {
  const r = record('census-1900');
  let found = w.relativesInRecord(r);
  assert.deepEqual(names(found.spouse), ['Kjersti Larsdatter']);
  assert.equal(found.child.length, 5);
  found = w.relativesInRecord(open(r, 1));
  assert.deepEqual(names(found.spouse), ['Lars Halvorsen Solbakken']);
  found = w.relativesInRecord(open(r, 2));
  assert.deepEqual(names(found.father), ['Lars Halvorsen Solbakken', 'Kjersti Larsdatter']);
});

test("relativesInRecord(): a servant in 1865 has no family in the household", () => {
  const found = plain(w.relativesInRecord(record('census-1865')));
  assert.deepEqual(found, { father: [], mother: [], spouse: [], child: [] });
});

test("ownBirthDate(): a baptism's day of birth gets the baptism's year", () => {
  assert.deepEqual(plain(w.ownBirthDate(record('baptism-1846'))), { year: 1846, month: 7, day: 16 });
  // the year before when the day comes after the baptism's
  const r = record('baptism-1846');
  r.fields['date of birth'] = '12-30';
  assert.deepEqual(plain(w.ownBirthDate(r)), { year: 1845, month: 12, day: 30 });
  // not a parent's
  assert.equal(w.ownBirthDate(open(record('baptism-1846'), 1)), null);
});

test('checkRecord(): the FS parents and birth date in the baptism', () => {
  const reasons = plain(w.checkRecord(record('baptism-1846'), lars()));
  assert.deepEqual(reasons.map((r) => [r.points, r.text]), [
    [3, 'father Halvor Larsen in the record'],
    [3, 'mother Astri Larsdatter in the record'],
    [3, 'born 16 July 1846, as in FamilySearch']
  ]);
});

test("checkRecord(): a mother's patronymic abbreviated or spelled otherwise is still FS's", () => {
  const mother = (name) => {
    const r = record('baptism-1846');
    r.people.find((p) => p.role === 'mor').name = name;
    return plain(w.checkRecord(r, lars())).find((r) => /mother/.test(r.text));
  };
  for (const name of ['Astri Larsdat.', 'Astri Larsdatt.', 'Astri Larsd:r', 'Astri Larsdtter']) {
    const reason = mother(name);
    assert.ok(reason && reason.points > 0, name + ': ' + JSON.stringify(reason));
  }
  assert.ok(mother('Astri Olsdat.').points < 0, 'another father');
});

test("checkRecord(): a baptism's child counts once, for the FS child whose first given name it has", () => {
  const r = open(record('baptism-1846'), 1);
  r.people[0].name = 'Johan Peder';
  const P = w.profile(criteria({
    name: [{ givenName: 'Halvor', surname: 'Larsen' }], sex: [{ sex: 'Male' }],
    birth: [{ 'birthLikeDate.from': '1808', 'birthLikeDate.to': '1812' }],
    child: [{ childGivenName: 'Marte Johanne', childSurname: 'Halvorsdatter', childBirthYear: '1845' },
      { childGivenName: 'Johan Peder', childSurname: 'Halvorsen', childBirthYear: '1846' }]
  }));
  const kids = plain(w.checkRecord(r, P)).filter((x) => /^child /.test(x.text));
  assert.deepEqual(kids.map((x) => x.text), ['child Johan Peder (b. 1846) in the record']);
});

test("patronymicDiffers(): Johannesdat. for Johansdr, Gudbrandsen for Gulbrandsen; Olsen for Larsen", () => {
  assert.equal(w.patronymicDiffers({ name: 'Astri Johannesdat.' }, 'Johansdr'), false);
  assert.equal(w.patronymicDiffers({ name: 'Astri Johannesdottr' }, 'Johansdr'), false);
  assert.equal(w.patronymicDiffers({ name: 'Halvor Gudbrandsen' }, 'Gulbrandsen'), false);
  assert.equal(w.patronymicDiffers({ name: 'Halvor Olsen' }, 'Larsen'), true);
  assert.equal(w.patronymicDiffers({ name: 'Halvor Olsen Moen' }, 'Larsen'), true);
});

test('patronymicDiffers(): a farm in the patronymic\'s place says nothing', () => {
  assert.equal(w.patronymicDiffers({ name: 'Halvor Moen' }, 'Larsen'), false);
  assert.equal(w.patronymicDiffers({ name: 'Halvor Halvorsrud' }, 'Halvorsen'), false);
});

test('patronymicDiffers(): spellings of one father, and a woman under -sen', () => {
  for (const [name, fs] of [['Kjersti Aanensdr', 'Aanonsdatter'], ['Kjersti Olsd', 'Olsdatter'], ['Kjersti Aanensen', 'Aanensdatter'],
    ['Kjersti Jonsdatter', 'Johannesdatter'], ['Kjersti Johnsdr', 'Johansdr'], ['Ole Schjønnesen', 'Skjønnesen'], ['Ole Sionesen', 'Sjønnesen']]) {
    assert.equal(w.patronymicDiffers({ name }, fs), false, name + ' for ' + fs);
  }
  assert.equal(w.patronymicDiffers({ name: 'Kjersti Jonsdatter' }, 'Olsdatter'), true);
});

test("checkRecord(): the father under his farm's name is FS's father", () => {
  const r = record('baptism-1846');
  r.people.find((p) => p.role === 'far').name = 'Halvor Nordby';
  const father = plain(w.checkRecord(r, lars())).find((x) => /father/.test(x.text));
  assert.ok(father && father.points > 0, JSON.stringify(father));
});

test("checkRecord(): another father's name, another day of birth", () => {
  const P = lars({ father: [{ fatherGivenName: 'Hans', fatherSurname: 'Larsen' }], birth: [{ birthLikeDate: '2 March 1846', 'birthLikeDate.from': '1845', 'birthLikeDate.to': '1847' }] });
  const reasons = plain(w.checkRecord(record('baptism-1846'), P));
  const father = reasons.find((r) => /father/.test(r.text));
  assert.ok(father && father.points < 0, JSON.stringify(reasons));
  const born = reasons.find((r) => /born|birth/.test(r.text));
  assert.ok(born && born.points < 0, JSON.stringify(reasons));
});

test("checkRecord(): an emigrant's destination among the FS places", () => {
  const P = lars({ residence: [{ residencePlace: 'Fergus Falls, Otter Tail, Minnesota, United States' }] });
  const reasons = plain(w.checkRecord(record('emigration-1902'), P));
  assert.ok(reasons.some((r) => r.points > 0 && /Minnesota/.test(r.text)), JSON.stringify(reasons));
});

// 1801: three men named Peer Aslaksen in one parish (b. 1766*, 1779* and 1764*: the
// years come from their ages). FS's Peer, b. 1764, married Guri Tollofsdatter (as the
// 1816 baptism of their son spells her); his younger brother of the same name is the
// soldier of 22 at home, and the third is an unmarried head of household
const PEER = w.profile(criteria({
  name: [{ givenName: 'Peer', surname: 'Aslaksen' }], sex: [{ sex: 'Male' }],
  birth: [{ birthLikeDate: '1764', 'birthLikeDate.from': '1762', 'birthLikeDate.to': '1766', birthLikePlace: 'Hægebostad, Vest-Agder, Norway' }],
  father: [{ fatherGivenName: 'Aslak', fatherSurname: 'Tjøstolvsen' }],
  mother: [{ motherGivenName: 'Aslaug', motherSurname: 'Gautsdatter' }],
  spouse: [{ spouseGivenName: 'Guri', spouseSurname: 'Tollofsdatter' }],
  marriage: [{ 'marriageLikeDate.from': '1795', 'marriageLikeDate.to': '1799' }],
  child: [{ childGivenName: 'Pehr', childBirthYear: '1816' }]
}));

test('checkRecord(): the three Peer Aslaksens of 1801, told apart by their households', () => {
  const reasons = (name) => plain(w.checkRecord(record(name), PEER)).map((r) => [r.points, r.text]);
  assert.deepEqual(reasons('census-1801-married'), [[3, 'spouse Gurj Tollefsdatter in the record']]);
  assert.deepEqual(reasons('census-1801-son'), [[3, 'father Aslak Tjøstolvsen in the record']]);
  assert.deepEqual(reasons('census-1801-unmarried'), [[-3, 'unmarried in 1801, married by 1799 in FamilySearch']]);
});

test('the three Peer Aslaksens of 1801: the one with the FS wife leads once the records are checked', () => {
  const merged = new Map();
  w.mergeHits(merged, { reasons: [] }, w.parseResults(fixture('da/search-census-1801.html')).hits);
  const order = () => plain(w.groupHits(merged, PEER))[0].hits.map((h) => h.born);
  // by the hits alone, the unmarried one of the FS birth year comes first
  assert.deepEqual(order(), ['1764*', '1766*', '1779*']);
  const records = ['census-1801-married', 'census-1801-son', 'census-1801-unmarried'].map(record);
  for (const hit of merged.values()) hit.checks = w.checkRecord(records.find((r) => r.permanentId === hit.id), PEER);
  assert.deepEqual(order(), ['1766*', '1764*', '1779*']);
});

// DA's source page, as /en/source/NNN has it (the parts readSourcePage() reads)
const sourcePage = (book, reference) => new w.DOMParser().parseFromString(`<html><body>
  <div class="data-view"><div class="container-fluid limit info"><h1> AV/SAK-0000-0001: Vågå prestekontor </h1>
  <div class="additional-title"><h3>F: Ministerialia</h3><h3>Fa: Kirkebøker</h3><h3>${book}</h3></div></div></div>
  <div class="col-xs-9 shared"><span class="uppercase">Archive reference: </span> <a href="http://arkivportalen.no/x">${reference}</a>
  <br><span class="uppercase">Source ID: </span> <span>9001</span></div></body></html>`, 'text/html');

test('readSourcePage(): which of the parish\'s two church books', () => {
  assert.deepEqual(plain(w.readSourcePage(sourcePage('L0013: Ministerialbok A-13', 'AV/SAK-0000-0001/F/Fa/L0013'))),
    { archive: 'AV/SAK-0000-0001: Vågå prestekontor', book: 'Ministerialbok A-13', reference: 'AV/SAK-0000-0001/F/Fa/L0013', series: 'ministerial' });
  assert.equal(w.readSourcePage(sourcePage('L0010: Klokkerbok B-10', 'AV/SAK-0000-0001/F/Fb/L0010')).series, 'clerk');
  assert.equal(w.readSourcePage(sourcePage('L0002: Dødsfallsprotokoll', 'AV/SAK-0000-0001/F/Fc/L0002')).series, '');
});
