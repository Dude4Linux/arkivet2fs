// da_places.js: FS places → DA's municipality and county codes; places abroad
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness.js');

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
