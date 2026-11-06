#!/usr/bin/env node
// Makes the test fixtures (tests/fixtures/da/) from the real DA pages that capture.js
// saved in tests/private/raw/. tests/private/ is never published (.gitignore): it holds
// the real pages, the real names and the map from them to the made-up ones.
//
//   node tests/sanitize.js
//
// Each page gets
// - made-up names: every word of a person's name (DA's people, a census's other
//   households, search hits), of a census's district and residence and a hit's
//   farm, from the pools below; patronymics follow their father's name (Olsen →
//   Larsen when Ole → Lars), so a family still reads as one. names.json fixes the
//   names the tests rely on (spellings of one name that must stay spellings of one
//   name: Joen, Jon, John → Peer, Per, Pehr); map.json keeps every name, ID and
//   number given, so a page made again gets the same ones, and a name or record on
//   two pages is the same on both.
// - made-up IDs: a permanent ID becomes its prefix, 99 and a number (pd99000000000001),
//   numbers in links and the IDs in DA's addresses (UUIDs) other ones, and the names
//   in a search address too (lastname=Tjøstolvs* → the made-up name's stem).
// - none of the page around the record: the header, menus, breadcrumbs, footer,
//   reports panel and the cards of contributors (DA names its volunteers).
//
// Then it checks that the extension reads the made-up page as it reads the real one
// (extractRecord(), parseResults(): the same result with the names and IDs swapped),
// that none of names.json's `mustGo` and no real ID is left, and lists the words left
// in the people's lines that are neither made up nor known, for a look.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { load, SHARED } = require('./harness.js');

const PRIVATE = path.join(__dirname, 'private');
const RAW = path.join(PRIVATE, 'raw');
const OUT = path.join(__dirname, 'fixtures', 'da');
const MAP_FILE = path.join(PRIVATE, 'map.json');

// names.json is optional: without it every name comes from the pools below
const NAMES_FILE = path.join(PRIVATE, 'names.json');
const config = { files: {}, names: {}, keep: [], mustGo: [],
  ...(fs.existsSync(NAMES_FILE) ? JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')) : {}) };
const map = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) : {};
for (const k of ['words', 'ids', 'numbers', 'hex']) map[k] = map[k] || {};

const w = load(SHARED);
const PATRONYMIC = /(s)(en|øn|on|datter|dotter|dtr\.?|dr\.?|d\.)$/i;

// Made-up names, in the order they're given out
const MALE = ['Anders', 'Amund', 'Arne', 'Bjørn', 'Embrik', 'Even', 'Gudmund', 'Helge', 'Ivar', 'Jakob', 'Kjetil', 'Mikkel',
  'Mons', 'Nils', 'Sjur', 'Tore', 'Trond', 'Eilif', 'Gunnar', 'Haakon', 'Asbjørn', 'Brynjulv', 'Endre', 'Gisle', 'Herbrand',
  'Ingebrigt', 'Jørund', 'Kolbein', 'Magne', 'Narve', 'Ottar', 'Rolv', 'Sølve', 'Ulrik', 'Vebjørn', 'Ådne', 'Bendik',
  'Dagfinn', 'Eirik', 'Frode', 'Geir', 'Hallvard', 'Iver', 'Jens', 'Kristoffer', 'Leif', 'Morten', 'Odd', 'Paul', 'Reidar',
  'Simen', 'Tarald', 'Torgeir', 'Vemund', 'Alf', 'Bård', 'Erling', 'Finn', 'Gaut', 'Harald', 'Isak', 'Joakim', 'Klemet',
  'Lavrans', 'Mattis', 'Njål', 'Oddvar', 'Petter', 'Ragnvald', 'Steinar', 'Tjerand', 'Vidar', 'Aksel', 'Birger', 'Didrik',
  'Elling', 'Fredrik', 'Gjermund', 'Hogne', 'Jostein', 'Kåre', 'Lodve', 'Mads', 'Nikolai', 'Orm', 'Rasmus', 'Skule',
  'Torvald', 'Viljam', 'Øystein'];
const FEMALE = ['Aslaug', 'Borghild', 'Dagny', 'Gjertrud', 'Gunhild', 'Hallfrid', 'Ingunn', 'Jorunn', 'Kjersti', 'Liv',
  'Magnhild', 'Oddny', 'Ragna', 'Sigrid', 'Solveig', 'Torbjørg', 'Turid', 'Unni', 'Vigdis', 'Åse', 'Brynhild', 'Gudrun',
  'Herborg', 'Jofrid', 'Ranveig', 'Sigrun', 'Tora', 'Valborg', 'Ølvor', 'Agnes', 'Bodil', 'Dordi', 'Embla', 'Frøydis',
  'Gyda', 'Hildur', 'Idun', 'Jartrud', 'Kirsten', 'Lisbet', 'Malene', 'Nanna', 'Olava', 'Petra', 'Rønnaug', 'Synnøve',
  'Tyri', 'Ulla', 'Veslemøy', 'Asgjerd', 'Bergljot', 'Dagrun', 'Eldbjørg', 'Folke', 'Gudveig', 'Halldis', 'Inga',
  'Jensine', 'Klara', 'Laila', 'Mildrid', 'Norunn', 'Otilie', 'Pernille', 'Randi', 'Selma', 'Tone', 'Vilde', 'Aud',
  'Benedikte', 'Cecilie', 'Ellen', 'Gro', 'Hedvig', 'Ida', 'Josefine', 'Karoline', 'Lovise', 'Marte', 'Nora', 'Oline'];
const FARMS = ['Haugen', 'Lia', 'Berg', 'Rud', 'Stuen', 'Tveit', 'Vollen', 'Grande', 'Holt', 'Myren', 'Nes', 'Sletten',
  'Aasen', 'Engen', 'Furuli', 'Kvamme', 'Løkken', 'Sandvik', 'Strand', 'Tangen', 'Vang', 'Yset', 'Bryn', 'Dalen',
  'Fjeld', 'Garden', 'Hovde', 'Kroken', 'Lunden', 'Moen', 'Nordgard', 'Ottestad', 'Prestegard', 'Rønningen', 'Skogen',
  'Toftum', 'Uppstu', 'Viken', 'Ødegard', 'Bjørke', 'Granli', 'Hegge', 'Jordet', 'Kleiva', 'Langlo', 'Midtgard',
  'Nyhus', 'Ramstad', 'Sveen', 'Tjønn', 'Utgard', 'Vesteng', 'Aker', 'Bøen', 'Djupdal', 'Eide', 'Flaten', 'Gjerdet',
  'Hamre', 'Igland', 'Juvet', 'Kolstad', 'Lomen', 'Mæla', 'Nordby', 'Opheim', 'Rykkje', 'Sæter', 'Teigen', 'Uv',
  'Voll', 'Åkre', 'Bratli', 'Dyrstad', 'Elvebakken', 'Fossum', 'Grytting', 'Hovland', 'Kirkeby', 'Lyngstad', 'Myklebust',
  'Nygard', 'Olstad', 'Rognlien', 'Sletta', 'Tufte', 'Ulvestad', 'Vikstrøm', 'Aune', 'Brekke', 'Dokken', 'Eng',
  'Frøyse', 'Gjøvik', 'Hesthagen', 'Kjos', 'Lie', 'Mork', 'Nesheim', 'Øvrebø', 'Rindal', 'Skjerve', 'Tofte',
  'Vatne', 'Bakkelund', 'Grinde', 'Hogstad', 'Kvalvik', 'Leirvik', 'Melby', 'Norheim', 'Ringstad', 'Sunde', 'Tveiten',
  'Ystad', 'Askeland', 'Bergset', 'Fosse', 'Hustad', 'Kvåle', 'Liabø', 'Mjelde', 'Rød', 'Skaret', 'Torp', 'Varden'];

// More, made of parts, when those run out
const parts = (heads, tails) => heads.flatMap((h) => tails.map((t) => h + t));
const HEADS = ['Al', 'Ber', 'Dag', 'Ei', 'Fin', 'Gun', 'Hal', 'Ing', 'Kol', 'Lei', 'Mag', 'Od', 'Rag', 'Sig', 'Tor', 'Ulv', 'Ves', 'Ås'];
MALE.push(...parts(HEADS, ['mund', 'vald', 'stein', 'bjørn', 'ulf', 'grim', 'brand', 'leik']));
FEMALE.push(...parts(HEADS, ['borg', 'hild', 'laug', 'run', 'dis', 'frid', 'veig', 'gunn']));
FARMS.push(...parts(['Ås', 'Bjørk', 'Dal', 'Eng', 'Fur', 'Grø', 'Hol', 'Kirke', 'Lyng', 'Myr', 'Nord', 'Rogn', 'Sol', 'Stein', 'Vest', 'Øster'],
  ['vik', 'li', 'rud', 'heim', 'stad', 'berg', 'haug', 'bakken', 'moen', 'set', 'bø', 'tveit']));

// Words of names that are kept: kin words, farm parts, places (DA's municipalities and
// counties, with their old names)
const STOP = new Set(['hans', 'hendes', 'deres', 'nedre', 'øvre', 'ovre', 'søndre', 'nordre', 'vestre', 'østre', 'mellem',
  'mellom', 'midtre', 'store', 'lille', 'pladsen', 'plads', 'gaard', 'gaarden', 'under', 'ved', 'og', 'af', 'paa', 'i',
  'herred', 'prgj', 'sogn', 'by', 'no', 'en', 'nn', 'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december', 'kone', 'søn', 'datter', 'børn', 'fader', 'moder', 'enke', 'ugift', 'gift',
  ...config.keep.map((s) => s.toLowerCase())]);
for (const name of [...Object.values(w.eval('DA_MUNICIPALITIES')), ...Object.values(w.eval('DA_COUNTIES')), ...w.eval('PLACE_ALIASES').flat()]) {
  for (const part of String(name).toLowerCase().split(/[^\p{L}]+/u)) if (part) STOP.add(part);
}

const fold = (s) => s.toLowerCase();
const clean = (word) => word.replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '').replace(/\.$/, '');
const isFemale = (person) => /female|kvinne/i.test(person.gender || '') ||
  /\b(wife|daughter|mother|bride|woman|widow|kone|datter|pige|enke|moder|mor|hustru|kvinde|brud|brur|husmoder|hm)\b/i.test((person.role || '') + ' ' + (person.roleEnglish || ''));

// --- the names

const realWords = new Set();      // every real word given a made-up one, folded
const usedFakes = new Set(Object.values(map.words).map(fold));

let realSkeletons = null;
function poolName(pool) {
  realSkeletons = realSkeletons || new Set([...realWords].map(w.skeleton));
  const forms = (name) => [name, name + 'sen', name + 'en', name + 'sdatter', name + 'datter', name + 'son'].map(fold);
  const taken = (name) => usedFakes.has(fold(name)) || forms(name).some((f) => realWords.has(f)) || realSkeletons.has(w.skeleton(name)) ||
    [...usedFakes].some((u) => w.skeleton(u) === w.skeleton(name));
  const name = pool.find((n) => !taken(n));
  if (!name) throw new Error("A pool of made-up names ran out (" + pool[0] + ", ...): add names to it");
  usedFakes.add(fold(name));
  return name;
}
function assign(word, pool) {
  const key = Object.keys(config.names).find((k) => fold(k) === fold(word));
  if (key) return config.names[key];
  const known = Object.keys(map.words).find((k) => fold(k) === fold(word));
  if (known) return map.words[known];
  return (map.words[word] = poolName(pool));
}
// A given name's sex, by most of the names it's part of (a census row has no gender)
const votes = new Map();
const vote = (word, female) => { const v = votes.get(fold(word)) || 0; votes.set(fold(word), v + (female ? 1 : -1)); };
function fakeGiven(word, female = (votes.get(fold(word)) || 0) > 0) { return assign(word, female ? FEMALE : MALE); }
function fakeFarm(word) { return PATRONYMIC.test(word) ? fakePatronymic(word) : assign(word, FARMS); }
// A patronymic: the father's made-up name with the same ending (Ol, Ole → Lars: Olsen →
// Larsen; Rasmu, Rasmus: Rasmusen; Johannes: Johannessen)
function fakePatronymic(word) {
  const known = Object.keys(map.words).find((k) => fold(k) === fold(word));
  if (known) return map.words[known];
  const m = word.match(PATRONYMIC);
  const base = word.slice(0, m.index);
  const given = (b) => Object.keys(config.names).concat(Object.keys(map.words)).find((k) => fold(k) === fold(b));
  const father = given(base) || given(base + 'e') || given(base + 's') || base;
  const fake = fakeGiven(father, false);
  return (map.words[word] = fake + (/s$/i.test(fake) ? '' : 's') + m[2]);
}

// The words of one name: given names, then the patronymic, then farms and surnames.
// Each is noted in `tasks` and given its made-up name once all the real ones are known
// (the pools skip them), the given names first (a patronymic follows its father's).
const tasks = [];
function addName(name, female, surname = false) {
  const words = String(name || '').replace(/[%*]/g, ' ').split(/[\s,]+/).map(clean).filter((x) => x.length >= 2 && !/\d/.test(x));
  const p = words.findIndex((x, i) => (i > 0 || surname) && PATRONYMIC.test(x));
  if (p >= 0 && /(datter|dotter|dtr\.?|dr\.?)$/i.test(words[p])) female = true;
  words.forEach((word, i) => {
    if (STOP.has(fold(word))) return;
    for (const part of word.split('-')) {
      if (part.length < 2 || STOP.has(fold(part))) continue;
      realWords.add(fold(part));
      if ((i > 0 || surname) && PATRONYMIC.test(part)) tasks.push([2, () => fakePatronymic(part)]);
      else if (!surname && (p >= 0 ? i < p : i === 0 || i < words.length - 1)) { vote(part, female); tasks.push([0, () => fakeGiven(part)]); }
      else tasks.push([1, () => fakeFarm(part)]);
    }
  });
}
// A place kept as it is: a municipality or county, also in the genitive (Loms Prgj.),
// or abroad (Minnesota)
const isPlace = (word) => STOP.has(fold(word)) || STOP.has(fold(word).replace(/s$/, '')) || w.placeAbroad(word) ||
  /^(state|america|amerika|usa|canada|minn|wis|wisc|ia|ill|mich|dak|neb|kan|mont|wash|ore|cal|tex|pa|ny|mass)$/i.test(word);
function addPlace(text) {
  for (const word of String(text || '').split(/[\s,:/-]+/).map(clean)) {
    if (word.length >= 2 && !/\d/.test(word) && !isPlace(word)) { realWords.add(fold(word)); tasks.push([1, () => fakeFarm(word)]); }
  }
}

// --- reading the pages as the extension does

function readRaw(file) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8');
  const m = text.match(/^<!-- (\S+) \(captured ([\d-]+)\) -->\n/);
  if (!m) throw new Error(file + ': no address in the first line');
  return { url: m[1], day: m[2], html: text.slice(m[0].length) };
}
const isSearch = (url) => /\/search\//.test(new URL(url).pathname);
function extract(html, url) {
  if (isSearch(url)) return w.parseResults(html);
  return w.extractRecord(new w.DOMParser().parseFromString(html, 'text/html'), url);
}
const FEMALE_TEXT = /\b(Female|Kvinne)\b|(Role|Rolle|Family position|Familiestilling):\s*(mor|moder|brud|brur|hustru|kone|datter|enke|hm|k|hans kone|hans hustru|deres datter)\b/i;
function collect(result, url, html) {
  if (isSearch(url)) {
    for (const hit of result.hits) {
      addName(hit.name, /female/i.test(hit.gender || ''));
      const domicile = hit.domicile || '';
      addPlace(domicile.includes(':') ? domicile.split(':').slice(1).join(':') : domicile);
      addPlace((hit.born || '').split(',').slice(1).join(','));
    }
    return;
  }
  for (const person of [...result.people, ...(result.others || []).flat()]) addName(person.name, isFemale(person));
  if (result.census) { addPlace(result.census.district); addPlace(result.census.residence); }
  // Everyone else on the page: godparents, a protocol's other emigrants, residents
  // past those read, and the farms of their fields (DA's "Label:" / value pairs)
  const doc = new w.DOMParser().parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll('body *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ').trim();
    if (/:$/.test(own) && own.length < 60) for (const word of own.toLowerCase().split(/[^\p{L}]+/u)) if (word) STOP.add(word);
  }
  const female = (el) => {
    const box = el.closest('.data-item, tr, .row') || el.parentElement;
    return FEMALE_TEXT.test(box.textContent.replace(/\s+/g, ' '));
  };
  for (const a of doc.querySelectorAll('.data-item h4 a, .data-item td a')) addName(a.textContent, female(a));
  for (const value of doc.querySelectorAll('.ssp-semibold')) {
    const label = (value.previousElementSibling ? value.previousElementSibling.textContent : '').trim().toLowerCase();
    if (/^(last name|surname|etternavn)\b/.test(label)) addName(value.textContent, female(value), true);
    else if (/^(name|first name|given name|fornavn|navn)\b/.test(label)) addName(value.textContent, female(value));
    else if (/^(residence|domicile|address|farm|bosted|bustad|place of residence|birth ?place|place of birth|last residence|residence before)\b/.test(label)) addPlace(value.textContent);
  }
}

// --- swapping

function fakeNumber(n) {
  if (!map.numbers[n]) {
    const count = Object.keys(map.numbers).filter((k) => k.length === n.length).length + 1;
    map.numbers[n] = '9' + String(count).padStart(n.length - 1, '0');
  }
  return map.numbers[n];
}
function fakeId(id, prefix, digits) {
  if (!map.ids[id]) {
    const count = Object.keys(map.ids).length + 1;
    map.ids[id] = prefix + '99' + String(count).padStart(digits.length - 2, '0');
  }
  return map.ids[id];
}
function fakeHex(hex) {
  if (!map.hex[hex]) {
    const count = (Object.keys(map.hex).length + 1).toString(16);
    map.hex[hex] = hex.replace(/[0-9a-f]/g, '0').slice(0, hex.length - count.length) + count;
  }
  return map.hex[hex];
}
// A name in a search address, which may be a stem (Aslaks*, Halv*)
function fakeParam(value) {
  return value.split(/(\s+|%20|\+)/).map((word) => {
    const star = word.endsWith('*') || word.endsWith('%2A');
    const stem = fold(word.replace(/(\*|%2A)$/, ''));
    if (!stem || /^\s+|%20|\+$/.test(word)) return word;
    const real = Object.keys(map.words).concat(Object.keys(config.names)).sort()
      .find((k) => (star ? fold(k).startsWith(stem) : fold(k) === stem));
    if (!real) return word;
    const fake = assign(real, MALE);
    if (!star) return fake;
    const cut = PATRONYMIC.test(fake) ? w.surnameStem(fake) : w.givenStem(fake);
    return cut.endsWith('*') ? cut : cut + '*';
  }).join('');
}
function fakeUrl(url) {
  return url.replace(/\/(\d{2,})(?=[/?#]|$)/g, (m, n) => '/' + fakeNumber(n))
    .replace(/([?&](?:firstname|lastname|related_first_name|related_last_name)=)([^&#]*)/g, (m, k, v) => k + fakeParam(v))
    .replace(/^((?:https?:\/\/[^/]*)?)([^?#]*)/, (m, host, rest) => host + swapWords(rest, true));
}
let wordPattern = null;
function swapWords(text, anyCase) {
  if (!wordPattern) {
    const words = [...new Set([...Object.keys(map.words), ...Object.keys(config.names)])].sort((a, b) => b.length - a.length);
    wordPattern = new RegExp('(?<![\\p{L}])(' + words.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}])', 'giu');
  }
  return text.replace(wordPattern, (real) => {
    const fake = assign(real, MALE);
    if (real === real.toUpperCase() && real.length > 1) return fake.toUpperCase();
    if (real === real.toLowerCase()) return anyCase ? fake.toLowerCase() : real;
    return fake;
  });
}
function swap(text) {
  return swapWords(String(text)
    // an address inside another's query (a login link's back_to=https%3A%2F%2F...),
    // swapped decoded, then encoded again
    .replace(/https?%3A%2F%2F[^\s"'<>&]*/gi, (m) => encodeURIComponent(swap(decoded(m))))
    .replace(/https?:\/\/[^\s"'<>)\]]+/g, fakeUrl)
    // IDs and hex also run into other characters (%2Fpd..., ...6e9https)
    .replace(/(?<![0-9])([a-z]{2})(\d{14,})(?![0-9])/g, (id, prefix, digits) => fakeId(id, prefix, digits))
    .replace(/(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/g, fakeHex)
    .replace(/(?<![0-9a-f])[0-9a-f]{32,}(?![0-9a-f])/g, fakeHex));
}
function decoded(text) {
  try { return decodeURIComponent(text); } catch { return text; }
}
const URL_ATTRS = new Set(['href', 'src', 'action', 'data-url', 'data-current', 'content', 'data-path']);
function swapAttr(name, value) {
  return URL_ATTRS.has(name) && /^\//.test(value) ? swap(fakeUrl(value)) : swap(value);
}

// The page around the record, which nothing reads
const CHROME = ['header', 'body > nav', '.breadcrumb-container', 'footer', '#reportpanel', 'noscript', 'iframe',
  'meta:not([charset])', '.right-view-column .card', '#helpbox', 'a[href*="/actors/"]',
  'a[href*="login.digitalarkivet.no"]'];

function sanitize(html) {
  const doc = new w.DOMParser().parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll(CHROME.join(','))) el.remove();
  const walker = doc.createTreeWalker(doc.documentElement, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) node.nodeValue = swap(node.nodeValue);
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) el.setAttribute(attr.name, swapAttr(attr.name, attr.value));
  }
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML.replace(/\n\s*\n+/g, '\n') + '\n';
}

// Strings of a result swapped as the page's are, for the comparison
function swapAll(value) {
  if (typeof value === 'string') return swap(value);
  if (Array.isArray(value)) return value.map(swapAll);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapAll(v)]));
  return value;
}
function firstDifference(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDifference(a[k], b[k], at + '.' + k);
      if (d) return d;
    }
  }
  return at + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
}

// --- the run

const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.html')).sort();
const pages = files.map((file) => ({ file, ...readRaw(file) }));
for (const page of pages) {
  page.result = JSON.parse(JSON.stringify(extract(page.html, page.url)));
  if (page.result.error) throw new Error(page.file + ': ' + page.result.error);
  collect(page.result, page.url, page.html);
}
for (const kind of [0, 1, 2]) for (const [k, task] of tasks) if (k === kind) task();
// A name given out before (map.json) that's now also a real one on a page
for (const [real, fake] of Object.entries(map.words)) {
  if (realWords.has(fold(fake)) && !Object.values(config.names).some((n) => fake.startsWith(n))) {
    console.warn('made-up ' + fake + ' (for ' + real + ') is also a real name on a page: delete it from map.json and run again');
  }
}

const mustGo = config.mustGo.map(fold);
const known = new Set([...usedFakes, ...STOP, ...Object.values(map.words).map(fold), ...Object.values(config.names).map(fold)]);
const dictionary = fs.existsSync('/usr/share/dict/words') ? new Set(fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').map(fold)) : new Set();
let failed = false;
fs.mkdirSync(OUT, { recursive: true });
for (const page of pages) {
  const name = config.files[page.file.replace(/\.html$/, '')] || page.file.replace(/\.html$/, '');
  const url = swap(page.url);
  const html = sanitize(page.html);
  const out = '<!-- ' + url + ' (captured ' + page.day + ') -->\n' + html;

  const problems = [];
  const diff = firstDifference(swapAll(page.result), JSON.parse(JSON.stringify(extract(html, url))));
  if (diff) problems.push('read differently: ' + diff.slice(0, 400));
  for (const word of mustGo) if (fold(out).includes(word)) problems.push('"' + word + '" is left');
  // also in encoded addresses, and next to other letters (%2Fpd...)
  const ids = (out + '\n' + out.replace(/%([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))).match(/(?<![0-9])[a-z]{2}(?!99)\d{14,}(?![0-9])/g);
  if (ids) problems.push('real IDs are left: ' + [...new Set(ids)].slice(0, 5).join(', '));

  // Words in the people's lines that are neither made up nor known: names missed?
  const doc = new w.DOMParser().parseFromString(html, 'text/html');
  const lines = [...doc.querySelectorAll('title, h1, h4, .data-item, .ssp-semibold, .unit')].map((el) => el.textContent).join(' ');
  const odd = [...new Set(lines.match(/\p{Lu}\p{Ll}+/gu) || [])]
    .filter((x) => !known.has(fold(x)) && !dictionary.has(fold(x)) && !/^(Digitalarkivet|Norway|Census|Church|Gmd|Hosbonde|Husfader|Husmoder|Tienestedræng|Tienestepige)$/.test(x));

  fs.writeFileSync(path.join(OUT, name + '.html'), out);
  console.log((problems.length ? 'FAIL ' : 'ok   ') + page.file + ' → ' + name + '.html' + (odd.length ? '\n     left: ' + odd.join(' ') : ''));
  for (const p of problems) console.log('     ' + p);
  if (problems.length) failed = true;
}
fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 1) + '\n');
process.exit(failed ? 1 : 0);
