// da_record.js: reading DA record pages (saved in fixtures/da, see capture.js). The
// citation ends with the day it's made ("accessed 6 November 2026"), so it's compared
// up to there.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixtureDoc, fixtureUrl, plain, unnamedBurial, SHARED } = require('./harness.js');

const w = load(SHARED);
function record(name) {
  const file = 'da/' + name + '.html';
  return plain(w.extractRecord(fixtureDoc(w, file), fixtureUrl(file)));
}
const people = (r) => r.people.map((p) => p.name + ' (' + (p.roleEnglish || p.role || '') + ')');
const before = (text, marker) => text.slice(0, text.indexOf(marker));

test('a baptism: the child, the parents, the date of birth with the year', () => {
  const r = record('baptism-1846');
  assert.ok(!r.error, r.error);
  assert.equal(r.permanentId, 'pd99000000000018');
  assert.deepEqual(r.recordTypeInfo, { prefix: 'pd', type: 'birth_baptism' });
  assert.equal(r.recordDate, '1846-08-23');
  assert.equal(r.title, 'Lars, son of Halvor Larsen - Vågå parish, Vågå local parish 1842-1856 (0515P) - Birth, 23 August 1846');
  assert.equal(before(r.citation, ' : accessed'),
    'Norway, Oppland, Vågå Parish, "Church book from Vågå parish, Vågå local parish 1842-1856 (0515P)," Births and baptisms, ' +
    'p. 24, entry 66, baptism of Lars, 23 August 1846; database, National Archives of Norway, Digitalarkivet, ' +
    'Permanent ID pd99000000000018 (https://www.digitalarkivet.no/en/pd99000000000018');
  assert.match(r.citation, /; scanned image kb99000000000020 \(https:\/\/goto\.digitalarkivet\.no\/kb99000000000020\)\.$/);
  assert.deepEqual(people(r), ['Lars (Child)', 'Halvor Larsen (Father)', 'Astri Larsdatter (Mother)']);
  assert.equal(r.people[0].current, true);
  assert.equal(r.people[0].primary, true);
  assert.equal(r.fields['date of birth'], '07-16');
  assert.match(r.notes, /^Date of birth: 16 July 1846$/m);
  assert.match(r.notes, /^Gender: Male$/m);
  // the source's own page, which names the book (da_verify.js readSourcePage())
  assert.equal(r.sourceTitle, 'Church book from Vågå parish, Vågå local parish 1842-1856 (0515P)');
  assert.equal(r.sourceUrl, 'https://www.digitalarkivet.no/en/source/9002');
});

test('a page across a spread: "pp. 260–261", not "p. 260, 261" (bug: read as two parts of the citation)', () => {
  const file = 'da/baptism-1846.html';
  const withPage = (page) => {
    const doc = fixtureDoc(w, file);
    const label = [...doc.querySelectorAll('div')].find((d) => d.textContent.trim() === 'Page:');
    label.nextElementSibling.textContent = page;
    return before(w.extractRecord(doc, fixtureUrl(file)).citation, ', entry 66');
  };
  assert.match(withPage('260, 261'), / Births and baptisms, pp\. 260–261$/);
  assert.match(withPage('260-261'), /, pp\. 260–261$/);
  assert.match(withPage('12, 15'), /, pp\. 12 and 15$/);
  assert.match(withPage('24b'), /, p\. 24b$/);
});

test('a header date DA wrote wrong ("1846-2308") is only its year', () => {
  const file = 'da/baptism-1846.html';
  const read = (date) => {
    const doc = fixtureDoc(w, file);
    doc.querySelector('div.parent-post > h4 a').firstChild.textContent = date;
    return w.extractRecord(doc, fixtureUrl(file));
  };
  const r = read('1846-2308');
  assert.equal(r.recordDate, '1846');
  assert.match(r.citation, /, baptism of Lars, 1846; database/);
  // a range of years stays
  assert.equal(read('1846-1848').recordDate, '1846-1848');
  assert.equal(read('1846-48').recordDate, '1846-48');  // bug: cut to 1846
  assert.equal(read('1846-23').recordDate, '1846');  // no month, and not a later year
  assert.equal(read('1846-08').recordDate, '1846-08');
});

test('a burial: split date of death merged, age in years, the position translated', () => {
  const r = record('burial-1854');
  assert.deepEqual(r.recordTypeInfo, { prefix: 'pg', type: 'death_burial' });
  assert.equal(r.title, 'Lars Larsen Holt-Sletten - Vinger parish 1847-1855 (0421Q) - Burial, 18 April 1854');
  assert.match(r.citation, /^Norway, Hedmark, Vinger Parish, "Church book from Vinger parish 1847-1855 \(0421Q\)," Burials, p\. 434, entry 37, burial of Lars Larsen Holt-Sletten, 18 April 1854;/);
  assert.deepEqual(people(r), ['Lars Larsen Holt-Sletten (Deceased)']);
  assert.match(r.notes, /^Date of death: 12 April 1854$/m);
  assert.match(r.notes, /^Age: 57 years$/m);
  assert.match(r.notes, /^Position: Lægdslem \[pauper\]$/m);
  // noteNames(): the last name's last word is the surname, the rest the given name
  assert.match(r.notes, /^Given name: Lars Larsen$/m);
  assert.match(r.notes, /^Last name: Holt-Sletten$/m);
});

// A child DA couldn't read the name of is titled "son of <father>" (by the gender field),
// not by DA's "!!" and the transcriber's starred patronymic
test('a burial of a child whose name DA couldn\'t read: "son of" the father in the title and citation', () => {
  const r = plain(w.extractRecord(unnamedBurial(w), fixtureUrl('da/burial-1854.html')));
  assert.deepEqual(people(r), ['!! Halvorsd.* (Deceased)', 'Halvor Larsen (Father)']);
  assert.equal(r.title, 'son of Halvor Larsen - Vinger parish 1847-1855 (0421Q) - Burial, 18 April 1854');
  assert.match(r.citation, /, burial of a son of Halvor Larsen, 18 April 1854;/);
});

test("a census of 1865: the open person's household, its head in the title", () => {
  const r = record('census-1865');
  assert.deepEqual(r.recordTypeInfo, { prefix: 'pf', type: 'census' });
  assert.equal(r.title, 'Reidar Finleiksen household, Fjeld nordre, Bryn - Vågå - "Norway, Census, 1865"');
  assert.deepEqual(r.census, { district: 'Bryn', residence: 'Fjeld nordre' });
  assert.match(r.citation, /^Norway, Oppland, Vågå, "1865 census for Vågå," census district 004 Bryn, rural residence 0053 Fjeld nordre, Reidar Finleiksen household; /);
  assert.match(r.citation, /scanned image ft99000000000141 /);
  assert.equal(r.people.length, 14);
  assert.equal(r.people[0].name, 'Reidar Finleiksen');
  const lars = r.people.find((p) => p.current);
  assert.equal(lars.name, 'Lars Halvorsen');
  assert.equal(r.fields['marital status'], 'ug');
  assert.match(r.notes, /^Marital status: Unmarried$/m);
  assert.match(r.notes, /^Occupation: Tjener \[servant\]$/m);
  assert.match(r.notes, /^hans Kone \[wife\]: Malene Alleiksdatter \(age 34, Loms Prgj\.\)$/m);
  assert.deepEqual(r.others, []);
});

test('a census of 1900: coded positions, and the other household at the residence', () => {
  const r = record('census-1900');
  assert.equal(r.title, 'Lars Halvorsen Solbakken household, Pladsen Solbakken - Vågå - "Norway, Census, 1900"');
  // the district is only a number ("006"), so it has no name
  assert.deepEqual(r.census, { district: '', residence: 'Pladsen Solbakken' });
  assert.deepEqual(people(r), ['Lars Halvorsen Solbakken (Man of the House)', 'Kjersti Larsdatter (Woman of the House)',
    'Reidar Larsen (Son)', 'Asgjerd Larsdatter (Daughter)', 'Bergljot Larsdatter (Daughter)', 'Lars Larsen (Son)', 'Eli Larsdatter (Daughter)']);
  assert.deepEqual(r.others.map((h) => h.map((p) => p.name)), [['Dagrun Larsdatter Solbakken', 'Per Halvorsen']]);
  assert.equal(r.others[0][0].householdNo, '02');
  assert.match(r.notes, /^Family position: Man of the House$/m);
  assert.match(r.notes, /^Residential status: Resident$/m);
  assert.match(r.notes, /^--- Also at the residence, household no\. 02 ---$/m);
  assert.match(r.notes, /Skogvogter, Dagarbeider \[day labourer\] ved Gaardsbr\./);
});

test('a census position\'s "Barn" is a child, "Børn" children', () => {
  const file = 'da/census-1801-son.html';
  const doc = fixtureDoc(w, file);
  const cell = [...doc.querySelectorAll('#collapse-persons div')].find((d) => d.textContent.trim() === 'Deres børn' && !d.children.length);
  cell.textContent = 'Deres Barn';
  const r = w.extractRecord(doc, fixtureUrl(file));
  assert.deepEqual(plain(r.people.map((p) => p.roleEnglish).slice(2)), ['Deres Barn [child]', 'Deres børn [children]', 'Deres børn [children]']);
});

test("a census position's compound kin words get English: \"hans Søstersøn [sister's son]\"", () => {
  const file = 'da/census-1801-son.html';
  const doc = fixtureDoc(w, file);
  const cell = [...doc.querySelectorAll('#collapse-persons div')].find((d) => d.textContent.trim() === 'Deres børn' && !d.children.length);
  cell.textContent = 'hans Søstersøn';
  const r = w.extractRecord(doc, fixtureUrl(file));
  assert.ok(r.people.some((p) => p.roleEnglish === "hans Søstersøn [sister's son]"));
  const relatives = w.positionWords().relatives;
  const english = (text) => w.expandAbbreviations(text, relatives);
  assert.equal(english('Brodersøn'), "Brodersøn [brother's son]");
  assert.equal(english('hans Syster datter'), 'hans Syster [sister] datter [daughter]');
  assert.equal(english('Husbondens Svoger'), 'Husbondens Svoger [brother-in-law]');
  assert.equal(english('deres Barnebarn'), 'deres Barnebarn [grandchild]');
  assert.equal(english('Hendes Mand'), 'Hendes Mand [husband]');
  assert.equal(english('Stedmoder'), 'Stedmoder [stepmother]');
  assert.equal(english('Søskendebarn'), 'Søskendebarn [cousin]');
  // the simple words as before, and an occupation's family word in passing is left
  assert.equal(english('hans Søster'), 'hans Søster [sister]');
  assert.equal(w.expandAbbreviations('Husmand'), 'Husmand [cottager]');
});

// 1910 gives each resident's full date of birth, once with the age after it ("@17")
function withBirthDates(doc) {
  for (const label of doc.querySelectorAll('#collapse-persons .row > div:first-child')) {
    const value = label.nextElementSibling;
    if (label.textContent.trim() !== 'Age/born:' || !value) continue;
    if (value.textContent.trim() === '1844') value.textContent = '1844-03-05';
    if (value.textContent.trim() === '1854') value.textContent = '1854-11-20@46';
  }
  return doc;
}

test('a census\'s full dates of birth read as dates in the notes', () => {
  const file = 'da/census-1900.html';
  const r = w.extractRecord(withBirthDates(fixtureDoc(w, file)), fixtureUrl(file));
  assert.match(r.notes, /^Man of the House: Lars Halvorsen Solbakken \* \(.*, b\. 5 March 1844, Vågå herred\*\)$/m);
  assert.match(r.notes, /^Woman of the House: Kjersti Larsdatter \(.*, b\. 20 November 1854, Vågå herred\*\)$/m);
  assert.equal(w.fullBirthDate('1854-11-20@46').day, 20);
  assert.equal(w.fullBirthDate('1854'), null);
  assert.equal(w.fullBirthDate('1846-20??.09'), null);
});

test('a census of 1891: one household, though only its head has a household number ("000" is none)', () => {
  const r = record('census-1891-grandchildren');
  assert.equal(r.others.length, 0);
  assert.equal(r.people.length, 10);
  assert.equal(r.people[0].roleEnglish, 'Familiens overhode [head of household]');
  assert.deepEqual(r.people.slice(1).map((p) => p.householdNo), Array(9).fill(''));
  // the clerk's ö kept, the English added
  assert.equal(r.people[3].roleEnglish, 'Sönnekone [daughter-in-law]');
  assert.equal(r.people[4].roleEnglish, 'Sönnesön [grandson]');
  assert.equal(r.people[5].roleEnglish, 'Sönnedatter [granddaughter]');
});

test("an emigrant protocol: the open person only, the protocol's page and line", () => {
  const r = record('emigration-1902');
  assert.deepEqual(r.recordTypeInfo, { prefix: 'pe', type: 'emigration' });
  assert.equal(r.title, 'Lars Halvorsen - Oslo police district, Mobility control, Emigrant protocols, no. 20: 1901-1903 - Emigration, 5 September 1902');
  assert.match(r.citation, /"Oslo police district, Mobility control, Emigrant protocols, no\. 20: 1901-1903," Group of travellers, p\. 340, line 30, emigration of Lars Halvorsen, 5 September 1902;/);
  assert.deepEqual(people(r), ['Lars Halvorsen (Emigrant)']);
  assert.equal(r.fields.destination, 'Minnesota');
  assert.match(r.notes, /^Departure date: 5 September 1902$/m);
});

test("a marriage from the bride's entry: read from the groom's, so both entries give one source (bug: a second source)", () => {
  const r = record('marriage-bride');
  assert.ok(!r.error, r.error);
  assert.equal(r.recordTypeInfo.type, 'marriage');
  assert.deepEqual(people(r).slice(0, 2), ['Kolmund Finsteinsen Dalbø (Groom)', 'Eli Kolvaldsdatter Daltveit (Bride)']);
  assert.equal(r.title, 'Kolmund Finsteinsen Dalbø and Eli Kolvaldsdatter Daltveit - Vågå parish, Vågå local parish 1842-1856 (0515P) - Marriage, 22 April 1849');
  assert.equal(r.principalUrl, 'https://www.digitalarkivet.no/en/pv99000000000371');
  // from the groom's entry, his page is the one
  const file = 'da/marriage-bride.html';
  const doc = fixtureDoc(w, file);
  const items = doc.querySelectorAll('#collapse-section-0 .data-item');
  items.forEach((item) => item.classList.remove('current'));
  items[0].classList.add('current');
  assert.equal(w.extractRecord(doc, fixtureUrl(file)).principalUrl, '');
});

test("englishPageUrl(): DA's English page of a Bokmål or Nynorsk address", () => {
  assert.equal(w.englishPageUrl('https://www.digitalarkivet.no/view/255/pd99000000000018'),
    'https://www.digitalarkivet.no/en/view/255/pd99000000000018');
  assert.equal(w.englishPageUrl('https://www.digitalarkivet.no/nn/census/person/pf99000000000155'),
    'https://www.digitalarkivet.no/en/census/person/pf99000000000155');
});

// Report #10: DA's "!!" (alone: not in the source) and "??" (illegible) say so in the notes
test("the notes say what DA's \"!!\" and \"??\" in a name mean", () => {
  const file = 'da/baptism-1846.html';
  const doc = fixtureDoc(w, file);
  const swap = (from, to) => {
    for (const a of doc.querySelectorAll('#collapse-section-0 .data-item .ssp-semibold')) {
      if (a.textContent.includes(from)) a.textContent = a.textContent.replace(from, to);
    }
  };
  swap('Astri Larsdatter', '!! Larsdatter');
  swap('Halvor Larsen', 'Hal?? Larsen');
  const notes = w.extractRecord(doc, fixtureUrl(file)).notes;
  assert.match(notes, /: !! \[no name in the source\] Larsdatter/);
  assert.match(notes, /: Hal\?\? \[illegible\] Larsen/);
});

// DA's key of special signs: "??" illegible, "!!" wrong (alone: missing), "*" added by the
// transcriber, "%...%" struck out, "@" two readings, "E:" the transcriber's note. The notes
// keep DA's text and end with what the signs used in it mean
test('the notes end with what the special signs used in them mean', () => {
  const file = 'da/baptism-1846.html';
  const plain = w.extractRecord(fixtureDoc(w, file), fixtureUrl(file));
  // the open person's own " *" is the notes' mark, not DA's
  assert.match(plain.notes, / \*$/m);
  assert.doesNotMatch(plain.notes, /Signs in DigitalArkivet/);
  const doc = fixtureDoc(w, file);
  const swap = (from, to) => {
    for (const a of doc.querySelectorAll('#collapse-section-0 .data-item .ssp-semibold')) {
      if (a.textContent.includes(from)) a.textContent = a.textContent.replace(from, to);
    }
  };
  swap('Astri Larsdatter', 'Astri@Anne Larsdatter');
  swap('Halvor Larsen', 'Halvor %Lars% Larsen*');
  const r = w.extractRecord(doc, fixtureUrl(file));
  assert.match(r.notes, /Astri@Anne Larsdatter/);          // DA's text as it is
  const legend = r.notes.split('--- Signs in DigitalArkivet\'s transcription ---')[1];
  assert.ok(legend, r.notes);
  assert.match(legend, /"@" between two readings/);
  assert.match(legend, /"%\.\.\.%" struck out in the source/);
  assert.match(legend, /"\*" after a value: not in the source, added by the transcriber/);
  assert.doesNotMatch(legend, /"\?\?"|"!!"|"E:"/);           // only the signs used
});

test('a name: what the source struck out is left out, two readings are "Even/Sven"', () => {
  const file = 'da/baptism-1846.html';
  const doc = fixtureDoc(w, file);
  const child = [...doc.querySelectorAll('#collapse-section-0 .data-item.current .ssp-semibold')]
    .find((a) => a.textContent.trim() === 'Lars');
  child.textContent = 'Lars@Ole %Hans%';
  const r = w.extractRecord(doc, fixtureUrl(file));
  assert.ok(r.title.startsWith('Lars/Ole'), r.title);
  assert.doesNotMatch(r.title, /Hans|%|@/);
});
