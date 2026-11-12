// background.js: DA addresses, FS names, and an FS person as search criteria
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, loadBackground, chromeStub, plain, ROOT } = require('./harness.js');

test('isDigitalArkivet(): https, www.digitalarkivet.no only (the manifest\'s host)', () => {
  const w = loadBackground();
  assert.equal(w.isDigitalArkivet('https://www.digitalarkivet.no/en/view/255/pd99000000000018'), true);
  assert.equal(w.isDigitalArkivet('https://digitalarkivet.no/'), false);  // redirects to www.
  assert.equal(w.isDigitalArkivet('https://media.digitalarkivet.no/ft99000000000029'), false);
  assert.equal(w.isDigitalArkivet('http://www.digitalarkivet.no/'), false);
  assert.equal(w.isDigitalArkivet('https://digitalarkivet.no.example.com/'), false);
  assert.equal(w.isDigitalArkivet('https://notdigitalarkivet.no/'), false);
  assert.equal(w.isDigitalArkivet(undefined), false);
});

test('splitName(): given names up to the patronymic, the rest after it', () => {
  const w = loadBackground();
  assert.deepEqual(plain(w.splitName('Tollef Ormsen Skofteland')), { given: 'Tollef', surname: 'Ormsen', rest: 'Skofteland' });
  assert.deepEqual(plain(w.splitName('Magnhild Magdaline Lindeman')), { given: 'Magnhild Magdaline', surname: 'Lindeman', rest: '' });
  assert.deepEqual(plain(w.splitName('Ingrid Larsdatter')), { given: 'Ingrid', surname: 'Larsdatter', rest: '' });
  assert.deepEqual(plain(w.splitName('Lars')), { given: 'Lars', surname: '', rest: '' });
});

test('withoutNickname(): a quoted word, a leading Big or Little', () => {
  const w = loadBackground();
  assert.equal(w.withoutNickname("Big 'Stor' Lars Halvorsen"), 'Lars Halvorsen');
  assert.equal(w.withoutNickname('Little Lars Halvorson'), 'Lars Halvorson');
  assert.equal(w.withoutNickname('Lille Lars'), 'Lille Lars');
});

test('personToQuery(): names, a full birth date ±1, the first event abroad, a farm', async () => {
  const rygh = '<table><tr><td><input type="checkbox"></td><td>1</td><td>Solbakken</td><td>V&aring;g&aring;</td><td>V&aring;g&aring;</td><td>Kristians amt</td></tr></table>';
  const fetch = async (url) => new Response(/dokpro/.test(url) && /Solbakken/.test(url) ? rygh : /dokpro/.test(url) ? '<table></table>' : '{"navn":[]}');
  const w = loadBackground({ fetch });
  const q = await w.personToQuery({
    pid: 'TEST-001', name: 'Lars Halvorsen Solbakken', gender: 'Male',
    birth: { date: '16 July 1846', place: 'Vågå, Oppland, Norway' },
    residences: [{ date: '1880', place: 'La Crosse, La Crosse, Wisconsin, United States' }],
    families: [], father: { name: 'Halvor Larsen', lifespan: '1810-1880' }
  });
  const get = (k) => q.get(k);
  assert.equal(get('treeref'), 'TEST-001');
  assert.equal(get('q.givenName'), 'Lars');
  assert.equal(get('q.surname'), 'Halvorsen');
  assert.equal(get('q.farm'), 'Solbakken');
  assert.equal(get('q.birthLikeDate'), '16 July 1846');
  assert.equal(get('q.birthLikeDate.from'), '1845');
  assert.equal(get('q.birthLikeDate.to'), '1847');
  assert.equal(get('q.abroadYear'), '1880');
  assert.equal(get('q.fatherGivenName'), 'Halvor');
  assert.equal(get('q.fatherBirthYear'), '1810');
});

test('personToQuery(): not a farm here, so the rest is another name, after the patronymic', async () => {
  const fetch = async (url) => new Response(/dokpro/.test(url) ? '<table></table>' : '{"navn":[]}');
  const w = loadBackground({ fetch });
  const q = await w.personToQuery({ pid: 'TEST-002', name: 'Magnhild Hansdatter Lindeman', gender: 'Female',
    birth: { date: '1850', place: 'Vågå, Oppland, Norway' }, families: [] });
  assert.equal(q.get('q.farm'), null);
  assert.equal(q.get('q.surname'), 'Hansdatter');
  assert.equal(q.get('q.surname.1'), 'Lindeman');
  assert.equal(q.get('q.birthLikeDate.from'), '1848');
});

test('Firefox: the manifest\'s background scripts, in order, without importScripts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.background.service_worker, 'background.js');
  const scripts = manifest.background.scripts;
  assert.equal(scripts.at(-1), 'background.js');
  // the same files the service worker imports
  const src = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
  const imported = src.match(/importScripts\(([^)]*)\)/)[1].match(/'[^']+'/g).map((f) => f.slice(1, -1));
  assert.deepEqual([...scripts.slice(0, -1)].sort(), [...imported].sort());
  // an event page has no importScripts: the files run first, then background.js
  const w = load(scripts, { chrome: chromeStub() });
  assert.equal(typeof w.importScripts, 'undefined');
  assert.equal(w.isDigitalArkivet('https://www.digitalarkivet.no/'), true);
  assert.equal(typeof w.farmNear, 'function');
});

test('showErrorMessage(): a notification without buttons (Firefox has none)', async () => {
  const chrome = chromeStub();
  const made = [];
  chrome.notifications.create = (options, done) => { made.push(options); };
  const w = loadBackground({ chrome });
  await w.showErrorMessage('Not a DigitalArkivet URL');
  assert.equal(made.length, 1);
  assert.equal(made[0].message, 'Not a DigitalArkivet URL');
  assert.equal(made[0].buttons, undefined);
});
