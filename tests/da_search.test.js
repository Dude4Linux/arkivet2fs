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

test("givenStem(): an old final j for i is cut like a vowel (Sirj searches Sir*, as Siri does)", () => {
  assert.equal(w.givenStem('Sirj'), 'Sir*');
  assert.equal(w.givenStem('Siri'), 'Sir*');
  assert.equal(w.relatedStem('Sirj'), 'Sir*');
});

test('surnameStem() keeps the patronymic or name base', () => {
  assert.equal(w.surnameStem('Aslaksen'), 'Aslaks*');
  assert.equal(w.surnameStem('Tollefsdatter'), 'Tollefs*');
  assert.equal(w.surnameStem('Lindeman'), 'Lindem*');
});

test('searchStem(): spellings of a patronymic by the start they share; surnameStem() stays narrow', () => {
  // FS has Johansdr, DA Johannesdtr. and Johannsdtr: Johans* finds neither, Johan* all
  for (const name of ['Johansdr', 'Johannsdtr', 'Johannesdtr.', 'Johansen', 'Johannessen']) assert.equal(w.searchStem(name), 'Johan*', name);
  assert.equal(w.surnameStem('Johansdr'), 'Johans*');
  // no shared start that names only one father: as surnameStem()
  assert.equal(w.searchStem('Pedersdatter'), 'Peders*');
  assert.equal(w.searchStem('Andersen'), 'Anders*');
  assert.equal(w.searchStem('Aslaksen'), 'Aslaks*');
  assert.equal(w.searchStem('Lindeman'), 'Lindem*');
  assert.equal(w.searchStem(''), '');
});

test('surnameSpellings(): the other spellings to search one by one, none when the shared start finds them', () => {
  assert.deepEqual(plain(w.surnameSpellings('Pedersdatter')), ['Pers*']);
  assert.deepEqual(plain(w.surnameSpellings('Persen')), ['Peders*']);
  assert.deepEqual(plain(w.surnameSpellings('Andresen')), ['Anders*']);
  assert.deepEqual(plain(w.surnameSpellings('Halvorsen')), ['Halvards*']);
  assert.deepEqual(plain(w.surnameSpellings('Gudbrandsdatter')), ['Gulbrands*']);
  assert.deepEqual(plain(w.surnameSpellings('Christiansen')), ['Christens*']);
  assert.deepEqual(plain(w.surnameSpellings('Johansdr')), []);
  assert.deepEqual(plain(w.surnameSpellings('Aslaksen')), []);
  assert.deepEqual(plain(w.surnameSpellings('Lindeman')), []);
});

// Nils Olsen, b. 1825, married to Gunhild Johansdr (FS's spelling; the baptisms of
// their children have her as Johannesdtr. and Johannsdtr), children b. 1852 and 1858
const nils = (wife = 'Johansdr') => criteria({
  name: [{ givenName: 'Nils', surname: 'Olsen' }], sex: [{ sex: 'Male' }],
  birth: [{ 'birthLikeDate.from': '1824', 'birthLikeDate.to': '1826', birthLikePlace: 'Vågå, Oppland, Norway' }],
  spouse: [{ spouseGivenName: 'Gunhild', spouseSurname: wife }],
  child: [{ childGivenName: 'Ole', childBirthYear: '1852' }, { childGivenName: 'Marit', childBirthYear: '1858' }]
});
const children = (c) => w.buildQueries(c).find((q) => q.kind === 'children');

test("buildQueries(): children's baptisms find the mother under every spelling of Johansdr", () => {
  const q = children(nils());
  assert.equal(q.steps[0].text, 'Nils Ols* + mother Gunhild Johan*');
  assert.equal(q.steps[0].fields.related_last_name, 'Johan*');
  assert.deepEqual(plain(q.steps[0].reasons), ['mother Gunhild Johan* for Gunhild Johansdr']);
  // the next step leaves her surname out, as before
  assert.equal(q.steps[1].text, 'Nils Ols* + mother Gunhild');
  // the plan starts with it in the parish
  assert.equal(w.searchPlan(q)[0].step.text + ' @ ' + w.searchPlan(q)[0].level.text, 'Nils Ols* + mother Gunhild Johan* @ Vågå');
});

test("buildQueries(): a relative's other patronymic spelling right after the full names", () => {
  const q = children(nils('Pedersdatter'));
  assert.deepEqual(plain(q.steps.slice(0, 3).map((s) => s.text)), [
    'Nils Ols* + mother Gunhild Peders*',
    'Nils Ols* + mother Gunhild Pers*',
    'Nils Ols* + mother Gunhild'
  ]);
  assert.deepEqual(plain(q.steps[1].reasons), ['mother Gunhild Pers* for Gunhild Pedersdatter']);
  assert.equal(q.steps.filter((s) => s.fields.related_last_name === 'Pers*').length, 1);
  // the own baptism: the father's spelling after his full name, before his given name only
  const baptism = w.buildQueries(criteria({
    name: [{ givenName: 'Ole', surname: 'Pedersen' }], sex: [{ sex: 'Male' }],
    birth: [{ 'birthLikeDate.from': '1850', 'birthLikeDate.to': '1852' }],
    father: [{ fatherGivenName: 'Peder', fatherSurname: 'Andersen' }]
  }))[0];
  assert.deepEqual(plain(baptism.steps.map((s) => s.text)), [
    'Ole + father Peder Anders*', 'Ole + father Peder Andres*', 'Ole + father Peder', 'Ole'
  ]);
});

test("buildQueries(): the person's own patronymic spelling as a fallback step", () => {
  const q = w.buildQueries(criteria({
    name: [{ givenName: 'Ole', surname: 'Pedersen' }], sex: [{ sex: 'Male' }],
    birth: [{ 'birthLikeDate.from': '1850', 'birthLikeDate.to': '1852' }]
  })).find((x) => x.kind === 'census');
  assert.ok(q.steps.some((s) => s.fallback && s.fields.lastname === 'Pers*'), JSON.stringify(plain(q.steps.map((s) => s.text))));
  // Johansen: Johan* already finds every spelling, so no fallback for them
  const j = w.buildQueries(criteria({
    name: [{ givenName: 'Ole', surname: 'Johansen' }], sex: [{ sex: 'Male' }],
    birth: [{ 'birthLikeDate.from': '1850', 'birthLikeDate.to': '1852' }]
  })).find((x) => x.kind === 'census');
  assert.equal(j.steps[0].fields.lastname, 'Johan*');
  assert.ok(!j.steps.some((s) => s.fallback), JSON.stringify(plain(j.steps.map((s) => s.text))));
});

test("churchSpelling(): a patronymic in the church books' letters, searched first", () => {
  // FS without ø: DA doesn't treat o as ø
  assert.equal(w.churchSpelling('Jorgensen'), 'Jørgensen');
  assert.equal(w.searchStem('Jorgensen'), 'Jørgens*');
  assert.deepEqual(plain(w.surnameSpellings('Jorgensen')), ['Jorgens*']);
  assert.equal(w.searchStem('Bjornsdtr'), 'Bjørns*');
  // a father's name ending in s (Torresen)
  assert.equal(w.churchSpelling('Torresen'), 'Tørresen');
  // å as the church books wrote it, aa: DA has no Håkons*
  assert.equal(w.churchSpelling('Hakonsen'), 'Haakonsen');
  assert.equal(w.searchStem('Håkonsdatter'), 'Haakons*');
  assert.deepEqual(plain(w.surnameSpellings('Håkonsdatter')), []);
  assert.equal(w.searchStem('Palsen'), 'Paals*');
  // already so, or a father's name without these letters
  for (const name of ['Jørgensen', 'Haakonsen', 'Olsen', 'Jonsen', 'Lindeman']) assert.equal(w.churchSpelling(name), '', name);
  assert.equal(w.searchStem('Olsen'), 'Ols*');
});

// Lars Jorgensen (FS without ø) Lindemann, b. 1835, married in Oslo to Astri
// Larsdatter, children b. 1862 and 1866, died in Arendal in 1868
const jorgensen = (death = { 'deathLikeDate.from': '1868', 'deathLikeDate.to': '1868', deathLikePlace: 'Arendal, Aust-Agder, Norway' }) => criteria({
  name: [{ givenName: 'Lars', surname: 'Jorgensen' }, { givenName: 'Lars', surname: 'Lindemann' }], sex: [{ sex: 'Male' }],
  birth: [{ 'birthLikeDate.from': '1834', 'birthLikeDate.to': '1836' }],
  marriage: [{ 'marriageLikeDate.from': '1861', 'marriageLikeDate.to': '1861', marriageLikePlace: 'Oslo, Oslo, Norway' }],
  death: [death],
  spouse: [{ spouseGivenName: 'Astri', spouseSurname: 'Larsdatter' }],
  child: [{ childGivenName: 'Ole', childBirthYear: '1862' }, { childGivenName: 'Marit', childBirthYear: '1866' }]
});

test("buildQueries(): children's baptisms also where the person died while they could still be born", () => {
  const q = children(jorgensen());
  assert.deepEqual(plain(q.levels[0].fields['m[]']).sort(), ['0218', '0301', '0903']);
  assert.equal(q.steps[0].text, 'Lars Jørgens* + mother Astr* Lars*');
  // dead at 85: the death place isn't where the children were born
  const old = children(jorgensen({ 'deathLikeDate.from': '1920', 'deathLikeDate.to': '1920', deathLikePlace: 'Arendal, Aust-Agder, Norway' }));
  assert.ok(!old.levels[0].fields['m[]'].includes('0903'), JSON.stringify(plain(old.levels[0].fields)));
});

test("runQuery(): the other names are searched while a child's baptism is still missing", async () => {
  // DA has the 1862 baptism under Jørgensen, the 1866 one under Lindemann
  const page = (id, date) => `<div id="searchResultList"><div class="unit"><div class="name"><a href="/en/view/1/${id}">Lars</a></div>`
    + `<div class="role"><span>Role:</span> far</div><div class="action"><span>Date:</span> ${date}</div></div></div><p>Your search resulted in 1 hits</p>`;
  const asked = [];
  const fetch = async (url) => {
    const p = new URL(String(url)).searchParams;
    asked.push(p.get('lastname') || '');
    const html = p.get('lastname') === 'Jørgens*' ? page('pd99000000000901', '1862-05-04')
      : p.get('lastname') === 'Lindem*' ? page('pd99000000000902', '1866-02-11') : '<div id="searchResultList"></div>';
    return new Response(html);
  };
  const wq = load(SHARED, { fetch, fast: true });
  const q = wq.buildQueries(jorgensen()).find((x) => x.kind === 'children');
  const result = await wq.runQuery(q);
  assert.deepEqual(plain(result.missing), []);
  assert.ok(asked.includes('Lindem*'), JSON.stringify(asked));
  assert.deepEqual([...new Set(result.found.flatMap((f) => f.hits.map((h) => h.id)))], ['pd99000000000901', 'pd99000000000902']);
});

// A DA result page of baptisms with the person as father: [[id, date], ...]
const fatherPage = (rows) => `<div id="searchResultList">${rows.map(([id, date]) => `<div class="unit"><div class="name"><a href="/en/view/1/${id}">Lars</a></div>`
  + `<div class="role"><span>Role:</span> far</div><div class="action"><span>Date:</span> ${date}</div></div>`).join('')}</div><p>Your search resulted in ${rows.length} hits</p>`;

test("runQuery(): other fathers of the name don't meet the children's goal; the couple is searched in all of Norway", async () => {
  // In the FS places DA has only other Lars Jørgensens' children of those years;
  // the couple's are in a town FS has no place in
  const asked = [];
  const fetch = async (url) => {
    const p = new URL(String(url)).searchParams;
    const local = p.getAll('m[]').length || p.getAll('c[]').length;
    asked.push([p.get('lastname'), p.get('related_first_name'), local ? 'local' : 'Norway'].join(' '));
    const html = p.get('lastname') === 'Jørgens*' && !p.get('related_first_name') && !p.get('related_last_name') && local
      ? fatherPage([['pd99000000000911', '1862-03-01'], ['pd99000000000912', '1866-07-08']])
      : p.get('lastname') === 'Jørgens*' && p.get('related_first_name') === 'Astr*' && !local
        ? fatherPage([['pd99000000000903', '1862-05-04'], ['pd99000000000904', '1866-02-11']])
        : '<div id="searchResultList"></div>';
    return new Response(html);
  };
  const wq = load(SHARED, { fetch, fast: true });
  const q = wq.buildQueries(jorgensen()).find((x) => x.kind === 'children');
  const result = await wq.runQuery(q);
  const ids = new Set(result.found.flatMap((f) => f.hits.map((h) => h.id)));
  assert.ok(ids.has('pd99000000000903') && ids.has('pd99000000000904'), JSON.stringify(asked));
  assert.deepEqual(plain(result.missing), []);
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

test("patronymics: the church books' abbreviations of -datter", () => {
  for (const name of ['Larsdatter', 'Larsdaatter', 'Larsdattr.', 'Larsdatt.', 'Larsdatr', 'Larsdat.', 'Larsdtr.', 'Larsdr', 'Larsd:r', 'Larsd.', 'Larsd']) {
    assert.equal(w.isPatronymic(name), true, name);
    assert.equal(w.patronymicBase(name), 'Lar', name);
  }
  assert.equal(w.patronymicBase('Johannesdat.'), 'Johanne');
  assert.equal(w.isPatronymic('Halvorsrud'), false);
});

test('unreadPatronymic(): an ending not read as a patronymic says nothing either way', () => {
  assert.equal(w.unreadPatronymic('Larsdtter', 'Lar'), true);
  assert.equal(w.unreadPatronymic('Johannesdottr', 'Johan'), true);
  assert.equal(w.unreadPatronymic('Larsdatter', 'Lar'), false, 'read as one');
  assert.equal(w.unreadPatronymic('Halvorsrud', 'Halvor'), false, 'a farm');
  assert.equal(w.unreadPatronymic('Moen', 'Halvor'), false);
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

test('fetchResultPage(): only Digital Arkivet\'s pages are fetched', async () => {
  const asked = [];
  const w = load(['i18n.js', 'i18n_strings.js', 'da_search.js'], { fetch: (url) => { asked.push(url); return Promise.reject(new Error('offline')); } });
  for (const url of ['https://example.com/en/view/255/pd99000000000001', 'http://www.digitalarkivet.no/en/view/255/pd99000000000001',
    'https://digitalarkivet.no.example.com/x', 'https://media.digitalarkivet.no/ft99000000000029', 'https://digitalarkivet.no/en/view/255/pd99000000000001',
    'javascript:alert(1)', '/en/view/255/pd99000000000001']) {
    await assert.rejects(w.fetchResultPage(url, false), /Not a Digital Arkivet address/, url);
  }
  assert.deepEqual(asked, []);
  await assert.rejects(w.fetchResultPage('https://www.digitalarkivet.no/en/view/255/pd99000000000001', false), /offline/);
  // the page, then DA's front page (is DA down, or only this page?)
  assert.deepEqual(asked, ['https://www.digitalarkivet.no/en/view/255/pd99000000000001', 'https://www.digitalarkivet.no/en/']);
});

// --- DA down or refusing requests: a pause shared by the pages ---------------------
const RECORD = 'https://www.digitalarkivet.no/en/view/255/pd99000000000018';
const HOME = 'https://www.digitalarkivet.no/en/';

// DA answering `answer(url)` (a status, or 'timeout' / 'network'); 200 is a page
function daAnswering(answer) {
  const asked = [];
  const fetch = async (url) => {
    asked.push(String(url));
    const a = answer(String(url));
    if (a === 'network') throw new TypeError('Failed to fetch');
    if (a === 'timeout') throw Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
    return new Response(a === 200 ? '<html><body>page</body></html>' : 'error', { status: a });
  };
  const w = load(['i18n.js', 'i18n_strings.js', 'da_search.js'], { fetch, fast: true });
  return { w, asked };
}

test('fetchResultPage(): DA down (the page and the front page fail) pauses every request', async () => {
  let up = false;
  const { w, asked } = daAnswering(() => (up ? 200 : 503));
  const down = await w.fetchResultPage(RECORD).catch((e) => e);
  assert.equal(down.unavailable, true);
  assert.equal(down.paused, false);
  assert.equal(w.daStopped(down), true);
  assert.match(down.message, /not answering \(503\), and its front page fails too: it seems to be down\. No more requests are sent to it until \d\d:\d\d\./);
  assert.deepEqual(asked, [RECORD, HOME]);
  assert.equal(w.daPause().kind, 'down');

  // while paused, nothing is sent, even when DA would answer
  up = true;
  const paused = await w.fetchResultPage(RECORD).catch((e) => e);
  assert.equal(paused.paused, true);
  assert.equal(paused.unavailable, true);
  assert.match(paused.message, /was not answering at \d\d:\d\d \(503\)\. No requests are sent to it until/);
  assert.equal(asked.length, 2);

  // after the pause, the next request is sent, and its success ends the pause
  const pause = w.daPause();
  w.localStorage.setItem('arkivet2fs.daPause', JSON.stringify({ ...pause, until: Date.now() - 1 }));
  assert.equal(w.daPause(), null);
  assert.match(await w.fetchResultPage(RECORD), /page/);
  assert.equal(w.localStorage.getItem('arkivet2fs.daPause'), null);
});

test('fetchResultPage(): a page cached before the outage is still given while paused', async () => {
  let up = true;
  const { w, asked } = daAnswering(() => (up ? 200 : 'network'));
  await w.fetchResultPage(RECORD);
  up = false;
  await assert.rejects(w.fetchResultPage(RECORD.replace('018', '019')), (e) => e.unavailable && /Failed to fetch/.test(e.message));
  assert.match(await w.fetchResultPage(RECORD), /page/);
  assert.equal(asked.length, 3);
});

test('fetchResultPage(): one page failing while DA answers is that page\'s error, no pause', async () => {
  const { w, asked } = daAnswering((url) => (url === HOME ? 200 : 500));
  const error = await w.fetchResultPage(RECORD).catch((e) => e);
  assert.equal(error.message, 'Digital Arkivet answered 500.');
  assert.equal(w.daStopped(error), false);
  assert.equal(w.daPause(), null);
  assert.deepEqual(asked, [RECORD, HOME]);
  const late = daAnswering((url) => (url === HOME ? 200 : 'timeout'));
  assert.equal((await late.w.fetchResultPage(RECORD).catch((e) => e)).message, 'Digital Arkivet did not answer (no answer in 30 s).');
});

test('fetchResultPage(): a refusal (403, 429) pauses without asking the front page', async () => {
  const { w, asked } = daAnswering(() => 429);
  const error = await w.fetchResultPage(RECORD).catch((e) => e);
  assert.equal(error.refused, true);
  assert.equal(error.unavailable, false);
  assert.match(error.message, /refusing requests \(429\)\. No more requests are sent to it until/);
  assert.deepEqual(asked, [RECORD]);
  assert.equal(w.daPause().kind, 'refused');
  assert.ok(w.daPause().until - w.daPause().since >= 15 * 60 * 1000);
  w.clearDaPause();
  assert.equal(w.daPause(), null);
  // a 404 is the page's own answer: no front page asked, no pause
  const missing = daAnswering(() => 404);
  assert.equal((await missing.w.fetchResultPage(RECORD).catch((e) => e)).message, 'Digital Arkivet answered 404.');
  assert.equal(missing.asked.length, 1);
});
