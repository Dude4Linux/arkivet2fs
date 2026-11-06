// i18n.js: languages, dates in either language, translations, links
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness.js');

const en = load(['i18n.js', 'i18n_strings.js']);
const nb = load(['i18n.js', 'i18n_strings.js'], { lang: 'nb' });

test('the browser language picks English, Bokmål or Nynorsk', () => {
  assert.equal(en.languageFromList(['nn-NO']), 'nn');
  assert.equal(en.languageFromList(['nb-NO']), 'nb');
  assert.equal(en.languageFromList(['no']), 'nb');
  assert.equal(en.languageFromList(['de', 'en-US']), 'en');
  assert.equal(en.languageFromList([]), 'en');
});

test('dates are written as FS writes them, in the UI language', () => {
  assert.equal(en.formatDate(1845, 4, 6), '6 April 1845');
  assert.equal(nb.formatDate(1845, 4, 6), '6. april 1845');
});

test("FS's dates are read in either language", () => {
  const exact = { year: 1846, month: 7, day: 16, exact: true };
  assert.deepEqual(plain(en.parseFsDate('16 July 1846')), exact);
  assert.deepEqual(plain(en.parseFsDate('16. juli 1846')), exact);
  assert.deepEqual(plain(en.parseFsDate('Abt 1846')), { year: 1846, month: null, day: null, exact: false });
  assert.equal(en.parseFsDate('Before 1846'), null);
});

test('t() translates, keeps English as it is, and fills placeholders', () => {
  assert.equal(en.t('Search'), 'Search');
  assert.equal(nb.t('Search'), 'Søk');
  assert.equal(en.t('Open {pid} on FamilySearch', { pid: 'ABCD-123' }), 'Open ABCD-123 on FamilySearch');
  assert.equal(nb.t('No such text in the table'), 'No such text in the table');
});

test('every translation has Bokmål and Nynorsk, and the same placeholders', () => {
  const table = en.i18nTable();
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const [english, forms] of Object.entries(table)) {
    assert.equal(forms.length, 2, english);
    for (const form of forms) {
      assert.ok(form, english);
      assert.equal(holes(form), holes(english), english);
    }
  }
});

test('links the user opens are in the UI language; English keeps /en/', () => {
  const record = 'https://www.digitalarkivet.no/en/view/255/pd99000000000018';
  assert.equal(en.daPageUrl(record), record);
  assert.ok(!/\/en\//.test(nb.daPageUrl(record)), nb.daPageUrl(record));
  assert.ok(/\/nn\//.test(load(['i18n.js', 'i18n_strings.js'], { lang: 'nn' }).daPageUrl(record)));
});
