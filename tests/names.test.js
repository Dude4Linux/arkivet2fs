// names.js: patronymics, their abbreviations, a patronymic joined by a hyphen, the
// colon as an abbreviation mark, DA's struck-out words and two readings
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, plain } = require('./harness.js');

const w = load(['names.js']);  // alone: it uses no other file (injected into DA's page)

test('isPatronymic(): -sen/-søn/-son, -datter/-dotter and the church books\' abbreviations', () => {
  for (const word of ['Halvorsen', 'Larssøn', 'Olson', 'Larsdatter', 'Olsdotter', 'Olsdaatter', 'Larsdattr.', 'Larsdatt.',
    'Larsdatr', 'Larsdat.', 'Larsdtr.', 'Olsdtr', 'Olsdr.', 'Pedersd:r', 'Halvorsd.', 'Halvorsd', 'Knutdatter', 'Knutdtr.']) {
    assert.ok(w.isPatronymic(word), word);
  }
  for (const word of ['Lindeman', 'Moen', 'Even', 'Datter', 'Jon', 'Halvorsrud', '', null]) assert.ok(!w.isPatronymic(word), String(word));
});

test('patronymicBase(), patronymicStem(), patronymicSex(): the father\'s name, the stem with its s, the sex', () => {
  assert.equal(w.patronymicBase('Halvorsen'), 'Halvor');
  assert.equal(w.patronymicBase('Olsdr.'), 'Ol');
  assert.equal(w.patronymicBase('Knutdatter'), 'Knut');
  assert.equal(w.patronymicBase('Lindeman'), 'Lindeman');
  assert.equal(w.patronymicStem('Aslaksen'), 'Aslaks');
  assert.equal(w.patronymicStem('Tollefsdatter'), 'Tollefs');
  assert.equal(w.patronymicStem('Knutdatter'), 'Knut');
  assert.equal(w.patronymicSex('Larsen'), 'Male');
  assert.equal(w.patronymicSex('Olson'), 'Male');
  assert.equal(w.patronymicSex('Larsdat.'), 'Female');
  assert.equal(w.patronymicSex('Halvorsd.'), 'Female');
  assert.equal(w.patronymicSex('Moen'), '');
});

test('nameWords(), splitName(): the patronymic is the surname, a hyphen after it splits the farm off', () => {
  assert.deepEqual(plain(w.nameWords('Marte Olsdtr-Moen')), ['Marte', 'Olsdtr', 'Moen']);
  assert.deepEqual(plain(w.nameWords('Marte Olsdtr- Moen')), ['Marte', 'Olsdtr', 'Moen']);
  assert.deepEqual(plain(w.nameWords('Anne-Marie Lindeman')), ['Anne-Marie', 'Lindeman']);  // not a patronymic
  assert.deepEqual(plain(w.splitName('Tollef Johansen Rysstad')), { given: 'Tollef', surname: 'Johansen', rest: 'Rysstad' });
  assert.deepEqual(plain(w.splitName('Marte Olsdtr-Moen')), { given: 'Marte', surname: 'Olsdtr', rest: 'Moen' });
  assert.deepEqual(plain(w.splitName('Maren Kristine Lindeman')), { given: 'Maren Kristine', surname: 'Lindeman', rest: '' });
  assert.deepEqual(plain(w.splitName('Halvor')), { given: 'Halvor', surname: '', rest: '' });
  assert.deepEqual(plain(w.splitName('Ingeborg Knutdatter')), { given: 'Ingeborg', surname: 'Knutdatter', rest: '' });
  // of two patronymics, the first, or the one `prefer` takes
  assert.deepEqual(plain(w.splitName('Astri Pedersdatter Larsdatter')), { given: 'Astri', surname: 'Pedersdatter', rest: 'Larsdatter' });
  assert.deepEqual(plain(w.splitName('Astri Pedersdatter Larsdatter', (p) => p.startsWith('Lars'))),
    { given: 'Astri', surname: 'Larsdatter', rest: 'Pedersdatter' });
});

test('abbreviationPoint(), stripNameVariants(): the colon as a point; struck-out words and two readings', () => {
  assert.equal(w.abbreviationPoint('Marte Larsdat:'), 'Marte Larsdat.');
  assert.equal(w.abbreviationPoint('Halvorsd: Moen'), 'Halvorsd. Moen');
  assert.equal(w.abbreviationPoint('Pedersd:r'), 'Pedersd:r');
  assert.equal(w.stripNameVariants('Ommund %Ole% Olsen'), 'Ommund Olsen');
  assert.equal(w.stripNameVariants('Even@Sven Olsen'), 'Even/Sven Olsen');
});

test('names.js declares only functions: it is injected into DA\'s page again on every click', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'names.js'), 'utf8');
  assert.deepEqual(src.split('\n').filter((line) => /^(const|let|var|class)\s/.test(line)), []);
  // background.js injects it before da_record.js, which uses it
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), /files: \['names\.js', 'da_record\.js'\]/);
});
