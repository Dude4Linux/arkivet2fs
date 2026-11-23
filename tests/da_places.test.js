// da_places.js: FS places → DA's municipality and county codes; places abroad
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, value } = require('./harness.js');

const w = load(['i18n.js', 'i18n_strings.js', 'da_places.js']);

test('an FS place gives the municipality its parts name', () => {
  assert.deepEqual(plain(w.municipalityCodes('Vågå, Oppland, Norway')), ['0515']);
});

test("a name without æ/ø/å is tried too (FS's Norwegian pages: Vaga)", () => {
  assert.deepEqual(plain(w.municipalityCodes('Vaga, Oppland, Norway')), ['0515']);
});

test('old names are aliases: Vaage, Christiania', () => {
  assert.deepEqual(plain(w.municipalityCodes('Vaage, Christians amt, Norway')), ['0515']);
  assert.ok(w.municipalityCodes('Christiania, Norway').includes('0301'));
});

test('Oslo is searched with Aker, its neighbour', () => {
  assert.deepEqual(plain(w.municipalityCodes('Oslo, Norway')), ['0301', '0218']);
});

test('county codes: the county named and the counties of its municipalities', () => {
  assert.deepEqual(plain(w.countyCodes('Vågå, Oppland, Norway')), ['05']);
  assert.equal(w.countyName('05'), 'Oppland');
});

test('a place is abroad by its last part: a country, US state or Canadian province', () => {
  assert.equal(w.placeAbroad('Spencer, Clay, Iowa, United States'), true);
  assert.equal(w.placeAbroad('Spencer, Iowa'), true);
  assert.equal(w.placeAbroad('La Crosse, La Crosse, Wisconsin, Amerikas forente stater'), true);
  assert.equal(w.placeAbroad('Vågå, Oppland, Norway'), false);
  assert.equal(w.placeAbroad('Spencer'), false);
});

test('DA_COORDS: every municipality has a place in Norway', () => {
  const coords = value(w, 'DA_COORDS');
  for (const code of w.municipalityCodeList()) {
    const at = coords[code];
    assert.ok(at, code + ' has no place');
    assert.ok(at[0] > 57.9 && at[0] < 71.2 && at[1] > 4.5 && at[1] < 31.2, code + ' lies outside Norway');
  }
});

test('municipalityDistance(): km between two municipalities', () => {
  assert.equal(w.municipalityDistance('0515', '0515'), 0);
  const lom = w.municipalityDistance('0515', '0514');  // Vågå–Lom, neighbours
  assert.ok(lom > 15 && lom < 40, String(lom));
  const far = w.municipalityDistance('0101', '2028');  // Halden–Vardø
  assert.ok(far > 1400 && far < 1600, String(far));
  assert.equal(w.municipalityDistance('0515', '9999'), null);
});

test("municipalityOf(): the one municipality a name names, old names too; Oslo without Aker", () => {
  assert.equal(w.municipalityOf('Vaage'), '0515');
  assert.equal(w.municipalityOf('Vågå herred'), '0515');
  assert.equal(w.municipalityOf('Bykle'), '0941');
  assert.equal(w.municipalityOf('Oslo'), '0301');
  assert.equal(w.municipalityOf('Amerika'), '');
  assert.equal(w.municipalityOf(''), '');
});

test("placeAnchors(): the FS places' municipalities in Norway, once each", () => {
  assert.deepEqual(plain(w.placeAnchors(['Vågå, Oppland, Norway', 'Vaage', 'Eau Claire, Wisconsin, United States'])),
    [{ code: '0515', label: 'Vågå' }]);
});
