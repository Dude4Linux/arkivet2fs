// fs_person.js: the tree person as the linker reads them ({action: 'readPerson'}), on a
// made-up FS details page built with FS's data-testids (never a saved FS page)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness.js');

const REASON = 'From "Lars Halvorsen - Vågå - Birth, 23 August 1846", Digitalarkivet, Permanent ID pd99000000000001.';

// A details page of the facts given as [type, body]; the person read through the message
async function readPerson(facts) {
  let listener = null;
  const chrome = { runtime: { id: 'test', getURL: (p) => 'chrome-extension://test/' + p, onMessage: { addListener: (f) => { listener = f; } }, sendMessage: () => {} } };
  const html = '<div data-testid="conclusionDisplay:NAME"><div data-testid="conclusion-body">Lars Halvorsen</div></div>' +
    facts.map(([type, body]) => `<div data-testid="conclusionDisplay:${type}"><div data-testid="conclusion-body">${body}</div></div>`).join('') +
    '<div data-testid="section-card-family"><div data-testid="family-TEST-HAL_TEST-ING"></div></div>';
  const w = load([], { url: 'https://www.familysearch.org/en/tree/person/details/TEST-LAR', chrome, fast: true });
  w.document.body.innerHTML = html;
  w.runFile('fs_person.js');
  const answer = await new Promise((resolve) => listener({ action: 'readPerson' }, {}, resolve));
  return plain(answer.person);
}

test('gatherPerson(): the facts a record gave carry its permanent ID and the reason, as FS shows it (with "More" after it)', async () => {
  const date = (d) => `<span data-testid="conclusion-date">${d}</span>`;
  const place = (p) => `<span data-testid="conclusion-place">${p}</span>`;
  const person = await readPerson([
    ['BIRTH', date('23 August 1846') + place('Vågå, Oppland, Norway') + ' Reason:' + REASON.replace(/\.$/, '') + 'More'],
    ['CHRISTENING', date('30 August 1846') + place('Vågå, Oppland, Norway') + ' Reason:Found in the parish register'],
    ['RESIDENCE', date('1865') + place('Vågå, Oppland, Norway')],
    ['RESIDENCE', date('1865') + place('Vågå, Oppland, Norway') + ' Reason:' + REASON],
    ['OCCUPATION', 'Husmand ' + date('1865') + ' Reason:' + REASON],
    ['ALTERNATE_NAME', '<span data-testid="conclusion-name-template">Lars Bakken</span> Reason:' + REASON],
    ['ALTERNATE_NAME', '<span data-testid="conclusion-name-template">Lars Halvorsøn</span>']
  ]);
  const from = { id: 'pd99000000000001', reason: REASON.replace(/\.$/, '') };
  assert.deepEqual(person.birth.from, from);
  assert.equal(person.christening.from, undefined);
  // a duplicate residence FS shows twice: the one kept has the record's reason
  assert.deepEqual(person.residences, [{ date: '1865', place: 'Vågå, Oppland, Norway', from: { ...from, reason: REASON } }]);
  assert.deepEqual(person.occupations[0].from.id, 'pd99000000000001');
  assert.deepEqual(person.altNames, ['Lars Bakken', 'Lars Halvorsøn']);
  assert.deepEqual(person.altNamesFrom, [{ name: 'Lars Bakken', from: { ...from, reason: REASON } }]);
});
