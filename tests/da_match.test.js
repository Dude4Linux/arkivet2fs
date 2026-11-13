// da_match.js: names, years, and the scoring and grouping of DA's hits
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, plain, SHARED } = require('./harness.js');
const { criteria } = require('./criteria.js');

const w = load(SHARED);
const P = w.profile(criteria({
  name: [{ givenName: 'Lars', surname: 'Halvorsen' }], sex: [{ sex: 'Male' }],
  birth: [{ birthLikeDate: '16 July 1846', 'birthLikeDate.from': '1845', 'birthLikeDate.to': '1847', birthLikePlace: 'Vågå, Oppland, Norway' }],
  father: [{ fatherGivenName: 'Halvor', fatherSurname: 'Larsen' }],
  mother: [{ motherGivenName: 'Astri', motherSurname: 'Larsdatter' }]
}));

function scored(name) {
  const merged = new Map();
  w.mergeHits(merged, { reasons: [] }, w.parseResults(fixture(name)).hits);
  return plain(w.groupHits(merged, P));
}
const reason = (hit, re) => hit.reasons.find((r) => re.test(r.text));

test('scoreHit(): another given name is a variant only when the search asked for the given name (bug: a mother found by surname and husband scored as the person)', () => {
  const astri = w.profile(criteria({
    name: [{ givenName: 'Astri', surname: 'Johansdatter' }], sex: [{ sex: 'Female' }],
    spouse: [{ spouseGivenName: 'Halvor', spouseSurname: 'Larsen' }]
  }));
  const hit = { id: 'pd99000000000951', name: 'Marit Johannesdatter', role: 'Mother', date: '1866-05-06', source: '' };
  const score = (fields) => {
    const merged = new Map();
    w.mergeHits(merged, { fields, reasons: ['father Halvor Lars*'] }, [hit]);
    return plain(w.groupHits(merged, astri)).flatMap((g) => g.hits)[0];
  };
  // found by the surname and the husband: Marit isn't Astri
  const bySurname = score({ firstname: '', lastname: 'Johan*', related_first_name: 'Halvor', related_last_name: 'Lars*' });
  assert.equal(reason(bySurname, /^Marit/).ok, false, JSON.stringify(bySurname.reasons));
  assert.ok(reason(bySurname, /^Marit/).points < 0);
  // DA gave it for Astr*: a variant DA matched
  const byGiven = score({ firstname: 'Astr*', lastname: 'Johan*' });
  assert.equal(reason(byGiven, /^Marit/).ok, null);
  assert.ok(byGiven.score > bySurname.score);
});

test('yearPoints(): the same +2, one off +1, then -2, -4, -6', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9, 10, 30].map(w.yearPoints), [2, 1, -2, -2, -4, -4, -6, -6]);
});

test('nameMatch(): spellings and forms of one name', () => {
  for (const [a, b] of [['Anne', 'Anna'], ['Magdalen', 'Magdaline'], ['Peer', 'Per'], ['Ragnihld', 'Ragnild'],
    ['Gurj', 'Guri'], ['Halvard', 'Halvor'], ['Ingbjør', 'Ingeborg'], ['Marit', 'Margit']]) {
    assert.equal(w.nameMatch(a, b), true, a + ' = ' + b);
  }
  assert.equal(w.nameMatch('Lars', 'Hans'), false);
});

test('nameMatch(): an old final j or y for i, in both directions and in the forms', () => {
  for (const [a, b] of [['Sirj', 'Siri'], ['Siri', 'Sirj'], ['Siry', 'Sirj'], ['Sirj', 'Sigrid'], ['Sigrid', 'Siry']]) {
    assert.equal(w.nameMatch(a, b), true, a + ' = ' + b);
  }
});

test("nameMatch(): Åshild, Rønnaug and Ånund in their old spellings", () => {
  for (const [a, b] of [['Aasel', 'Åshild'], ['Aasild', 'Osille'], ['Ronnau', 'Rønnaug'], ['Ronaug', 'Ronu'], ['Aanen', 'Aanon'], ['Ånund', 'Aanen']]) {
    assert.equal(w.nameMatch(a, b), true, a + ' = ' + b);
  }
});

test('nameMatch(): Johan, John, Jon and Joen for Johannes, either way; not Johanne or Jens', () => {
  for (const [a, b] of [['John', 'Johannes'], ['Jon', 'Johannes'], ['Joen', 'Johannes'], ['Johan', 'Johannes'], ['Johannes', 'Jon'], ['Johannes', 'Johan']]) {
    assert.equal(w.nameMatch(a, b), true, a + ' = ' + b);
  }
  for (const [a, b] of [['Johanne', 'Johannes'], ['Jens', 'Johannes']]) assert.equal(w.nameMatch(a, b), false, a + ' ≠ ' + b);
});

test('nameMatch(): å and aa are one letter, also in names too short for skeleton()', () => {
  for (const [a, b] of [['Aase', 'Åse'], ['Åse', 'Aase'], ['Aasa', 'Åsa'], ['Aasne', 'Åsne']]) {
    assert.equal(w.nameMatch(a, b), true, a + ' = ' + b);
  }
  assert.equal(w.nameMatch('Aase', 'Åsne'), false);
});

test('sameFather(): spellings of one father, and John, Jon, Joen for Johannes', () => {
  for (const [a, b] of [['Halvard', 'Halvor'], ['Johan', 'Johanne'], ['John', 'Johanne'], ['Joen', 'Johan'], ['Aanen', 'Aanon']]) {
    assert.equal(w.sameFather(a, b), true, a + ' = ' + b);
  }
  for (const [a, b] of [['Ol', 'Lar'], ['Jon', 'Jakob'], ['Hans', 'Johanne']]) assert.equal(w.sameFather(a, b), false, a + ' ≠ ' + b);
});

test('skeleton(): the consonants, spelled one way', () => {
  assert.equal(w.skeleton('Ragnihld'), 'rgnld');
  assert.equal(w.skeleton('Christine'), w.skeleton('Kristina'));
});

test("skeleton(): Norphone's silent j and h at the start, x and a final dt", () => {
  for (const [a, b] of [['Kjetil', 'Kittil'], ['Kjersti', 'Kirsti'], ['Gjermund', 'Jermund'], ['Hjalmar', 'Jalmar'],
    ['Arndt', 'Arnt'], ['Alexander', 'Aleksander'], ['Kristen', 'Kirsten']]) {
    assert.equal(w.skeleton(a), w.skeleton(b), a + ' = ' + b);
  }
  for (const [a, b] of [['Guri', 'Kari'], ['Gunder', 'Gunnar'], ['Ingrid', 'Inger']]) {
    assert.notEqual(w.skeleton(a), w.skeleton(b), a + ' ≠ ' + b);
  }
});

test('skeleton(): one sound for sj, skj, sch, sk before a front vowel, and the old si', () => {
  for (const [a, b] of [['Sjønne', 'Skjønne'], ['Siønne', 'Sjønne'], ['Sionne', 'Sjønne'], ['Skønne', 'Sjønne'], ['Schjønne', 'Sjønne'], ['Skiold', 'Skjold']]) {
    assert.equal(w.skeleton(a), w.skeleton(b), a + ' = ' + b);
  }
  for (const [a, b] of [['Siri', 'Skiri'], ['Simon', 'Sjmon'], ['Sigrid', 'Skrid']]) {
    assert.notEqual(w.skeleton(a), w.skeleton(b), a + ' ≠ ' + b);
  }
});

test('skeleton(): the old i for j between a consonant and o, ø, å or u; not before a, e', () => {
  for (const [a, b] of [['Biørn', 'Bjørn'], ['Torbiørn', 'Torbjørn'], ['Asbiørn', 'Asbjørn'], ['Torius', 'Torjus'], ['Biørg', 'Bjørg']]) {
    assert.equal(w.skeleton(a), w.skeleton(b), a + ' = ' + b);
  }
  for (const [a, b] of [['Maria', 'Mari'], ['Marie', 'Mari'], ['Christian', 'Kristen'], ['Mathias', 'Matthis']]) {
    assert.equal(w.skeleton(a), w.skeleton(b), a + ' = ' + b + ', as before');
  }
  assert.equal(w.nameMatch('Biørn', 'Bjørn'), true);
});

test('skeleton(): gi and gj before a vowel are j; not gi before a consonant', () => {
  for (const [a, b] of [['Giermund', 'Gjermund'], ['Giermund', 'Jermund'], ['Torgius', 'Torjus'], ['Giertrud', 'Gjertrud'], ['Ingiald', 'Ingjald']]) {
    assert.equal(w.skeleton(a), w.skeleton(b), a + ' = ' + b);
  }
  for (const [a, b] of [['Birgitte', 'Birjtte'], ['Regine', 'Rejne']]) assert.notEqual(w.skeleton(a), w.skeleton(b), a + ' ≠ ' + b);
  assert.equal(w.sameFather(w.patronymicBase('Giermundsdatter'), w.patronymicBase('Jermundsen')), true);
});

test('nameMatch(): f and v: Leif, Leiv and Lev; Rolf and Rolv, Halfdan and Halvdan', () => {
  for (const [a, b] of [['Leiv', 'Leif'], ['Lev', 'Leif'], ['Leif', 'Lev'], ['Rolv', 'Rolf'], ['Halvdan', 'Halfdan'], ['Ulv', 'Ulf']]) {
    assert.equal(w.nameMatch(a, b), true, a + ' = ' + b);
  }
  assert.equal(w.sameFather('Lev', 'Leif'), true);
  assert.equal(w.nameMatch('Frode', 'Vrode'), false, 'not an f at the start');
});

test('jaroWinkler(): 1 for the same word, less the more they differ', () => {
  assert.equal(w.jaroWinkler('Lars', 'lars'), 1);
  assert.equal(w.jaroWinkler('Lars', ''), 0);
  assert.ok(w.jaroWinkler('Torbjørn', 'Torbiørn') > w.jaroWinkler('Torbjørn', 'Torkel'));
  assert.ok(w.jaroWinkler('Torbjørn', 'Torkel') > w.jaroWinkler('Torbjørn', 'Lars'));
});

test('nameNear(): near spellings, not other names', () => {
  for (const [a, b] of [['Ingebrigt', 'Ingebret'], ['Torbjørn', 'Torbiørn'], ['Gulbrand', 'Gudbrand'],
    ['Tollef', 'Tollev'], ['Sigvard', 'Sigvart'], ['Halvor', 'Halvar']]) {
    assert.equal(w.nameNear(a, b), true, a + ' ≈ ' + b);
  }
  for (const [a, b] of [['Kari', 'Karin'], ['Berte', 'Bertel'], ['Helge', 'Helga'], ['Marit', 'Maria'], ['Maren', 'Marte'],
    ['Elling', 'Erling'], ['Simen', 'Simon'], ['Ola', 'Ole'], ['Lars', 'Hans']]) {
    assert.equal(w.nameNear(a, b), false, a + ' ≉ ' + b);
  }
});

test('nameClose(): Astri or Bodil for Astrid, not Hans', () => {
  assert.equal(w.nameClose('Astri', 'Astrid'), true);
  assert.equal(w.nameClose('Hans', 'Astrid'), false);
});

test('nameClose(): Sigvart for Sigvard, Tollev for Tollef: near spellings', () => {
  assert.equal(w.nameClose('Sigvart', 'Sigvard'), true);
  assert.equal(w.nameClose('Tollev', 'Tollef'), true);
  assert.equal(w.nameClose('Torbjørn', 'Torbjørn'), false, 'the same name is a match');
  assert.equal(w.nameClose('Helga', 'Helge'), false);
});

test('nameNear(): Hans for Johannes, its short form, either way; not Johanne', () => {
  assert.equal(w.nameNear('Hans', 'Johannes'), true);
  assert.equal(w.nameNear('Johannes', 'Hans'), true);
  assert.equal(w.nameClose('Johannes', 'Hans'), true, 'close, not a match');
  assert.equal(w.nameMatch('Johannes', 'Hans'), false);
  assert.equal(w.nameNear('Hans', 'Johanne'), false);
});

test('mergeHits() keeps a record once, with every search that found it', () => {
  const merged = new Map();
  const { hits } = w.parseResults(fixture('da/search-baptism.html'));
  const a = { reasons: [] }, b = { reasons: [] };
  w.mergeHits(merged, a, hits);
  w.mergeHits(merged, b, hits.slice(0, 1));
  assert.equal(merged.size, 4);
  assert.equal(merged.get(hits[0].id).queries.length, 2);
});

test('baptisms: the one in the FS birth year comes first', () => {
  const groups = scored('da/search-baptism.html');
  assert.deepEqual(groups.map((g) => g.title), ['Baptism']);
  const [best, ...rest] = groups[0].hits;
  assert.equal(best.id, 'pd99000000000018');
  assert.ok(reason(best, /^baptised 1846$/).ok);
  assert.ok(rest.every((h) => h.score < best.score));
  assert.equal(reason(rest[0], /baptised 1844/).points, -2);
});

test('baptisms with the same score are in date order', () => {
  const rest = scored('da/search-baptism.html')[0].hits.slice(1);
  assert.deepEqual(rest.map((h) => h.date), ['1844-01-23', '1849-04-05', '1849-11-04']);
});

test('baptisms: of two in the FS birth year, one before the FS birth date is another child', () => {
  // the parents' second son Lars, b. 10 April 1849 (the first, b. 1846, died young)
  const P1849 = w.profile(criteria({
    name: [{ givenName: 'Lars', surname: 'Halvorsen' }], sex: [{ sex: 'Male' }], birth: [{ birthLikeDate: '10 April 1849' }],
    father: [{ fatherGivenName: 'Halvor', fatherSurname: 'Larsen' }], mother: [{ motherGivenName: 'Astri', motherSurname: 'Larsdatter' }]
  }));
  const merged = new Map();
  w.mergeHits(merged, { reasons: [] }, w.parseResults(fixture('da/search-baptism.html')).hits);
  const hits = plain(w.groupHits(merged, P1849))[0].hits;
  assert.equal(hits[0].date, '1849-11-04');
  assert.ok(reason(hits[0], /^baptised 1849$/).ok);
  const before = hits.find((h) => h.date === '1849-04-05');
  assert.equal(reason(before, /before the birth/).points, -2);
  assert.ok(before.score < hits[0].score);
});

test('census: a year from an age ("1847*") counts one year closer', () => {
  const hits = scored('da/search-census.html')[0].hits;
  const fromAge = hits.find((h) => h.id === 'pf99000000000235'); // 1847*
  assert.equal(reason(fromAge, /^b\. 1847/).points, 2);
  const threeOff = hits.find((h) => h.id === 'pf99000000000138'); // 1849*
  assert.equal(reason(threeOff, /^b\. 1849/).points, -2);
});

test("census: a star on the place isn't the year's (\"1844, Vågå herred*\")", () => {
  const hits = scored('da/search-census.html')[0].hits;
  const hit = hits.find((h) => h.id === 'pf99000000000155');
  assert.match(hit.born, /^1844, .*\*$/);
  assert.equal(reason(hit, /^b\. 1844/).points, -2);
});

test('census: Halvardsen is a spelling of Halvorsen, the same father', () => {
  const hits = scored('da/search-census.html')[0].hits;
  const hit = hits.find((h) => h.id === 'pf99000000000246');
  assert.equal(hit.name, 'Lars Halvardsen');
  assert.ok(reason(hit, /Halvardsen for Halvorsen/).points > 0);
});

test('census: an FS place in the hit counts', () => {
  const hits = scored('da/search-census.html')[0].hits;
  assert.ok(hits.every((h) => reason(h, /^Vågå$/)), 'Vaage is an old name of Vågå');
});

// An event in both of a parish's church books (the priest's ministerialbok, the
// clerk's klokkerbok): two hits, one row
const BOOK_A = 'https://www.digitalarkivet.no/en/source/9001', BOOK_B = 'https://www.digitalarkivet.no/en/source/9002';
const hitIn = (id, sourceUrl, more = {}) => ({
  id, url: 'https://www.digitalarkivet.no/en/view/1/' + id, name: 'Halvor Larsen', role: 'Father', type: 'Baptism', date: '1848-03-12',
  sourceUrl, source: sourceUrl === BOOK_A ? 'Church book from Vågå parish 1842-1851 (0515P)' : 'Church book from Vågå parish 1843-1850 (0515P)', ...more
});
const baptism = (child) => ({ people: [{ name: child, roleEnglish: 'Child' }, { name: 'Halvor Larsen', roleEnglish: 'Father' }] });

test('pairParallel(): one event in both church books is one row, the first with the other as parallel', () => {
  const a = hitIn('pd99000000000901', BOOK_A), b = hitIn('pd99000000000902', BOOK_B, { name: 'Halvor Larsen' });
  const other = hitIn('pd99000000000903', BOOK_A, { date: '1850-05-01' });
  const out = w.pairParallel([a, other, b]);
  assert.deepEqual(out.map((h) => h.id), ['pd99000000000901', 'pd99000000000903']);
  assert.equal(out[0].parallel, b);
  assert.equal(out[1].parallel, undefined);
  // the clerk's spelling of the name still matches; another father, parish or day doesn't
  assert.equal(w.pairParallel([a, hitIn('x2', BOOK_B, { name: 'Halvard Larssen' })]).length, 1);
  for (const more of [{ name: 'Lars Halvorsen' }, { source: 'Church book from Lom parish 1843-1850 (0514P)' }, { date: '1848-03-13' }, { date: '1848' }]) {
    assert.equal(w.pairParallel([a, hitIn('x3', BOOK_B, more)]).length, 2, JSON.stringify(more));
  }
  // two hits from one book are two events
  assert.equal(w.pairParallel([a, hitIn('x4', BOOK_A)]).length, 2);
});

test('pairParallel(): twins are paired only by their checked records', () => {
  const twins = () => [hitIn('a1', BOOK_A), hitIn('a2', BOOK_A), hitIn('b1', BOOK_B), hitIn('b2', BOOK_B)];
  assert.equal(w.pairParallel(twins()).length, 4, 'not read: they stay apart');
  const [a1, a2, b1, b2] = twins();
  a1.record = baptism('Lars'); a2.record = baptism('Astri');
  b1.record = baptism('Astrid'); b2.record = baptism('Lars');
  const out = w.pairParallel([a1, a2, b1, b2]);
  assert.deepEqual(out.map((h) => h.id + '+' + h.parallel.id), ['a1+b2', 'a2+b1']);
  // the only hit in each book, but the records name other children: two events
  const c = hitIn('c1', BOOK_A, { record: baptism('Lars') }), d = hitIn('d1', BOOK_B, { record: baptism('Ingrid') });
  assert.equal(w.pairParallel([c, d]).length, 2);
});
