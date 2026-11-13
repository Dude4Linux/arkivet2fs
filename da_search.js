// DigitalArkivet person search (Phase 2): builds DA advanced-search queries from the
// search page's criteria, fetches the result pages and parses the hits.
// Used by search.js; uses municipalityCodes(), municipalityName(), countyCodes() and
// countyName() from da_places.js; no DOM access except DOMParser.
//
// What DA's advanced search does with names (tested November 2026):
// - It adds its own name variants (Jon → Joen, John), but not for patronymic endings.
// - A trailing * works, and DA still applies its variants to the stem (Christ* finds
//   Kristian). A * inside a word or a ? doesn't ("J*n", "Tol*fs*", "Lindem?n").
// - Its variants cover some spellings of a patronymic's father's name (Olsen =
//   Olssen, Torchels* = Torkels*) but not others: Johans* finds neither Johannsdtr
//   nor Johannesdtr., Johan* finds all three. See PATRONYMIC_SPELLINGS.
// - DA doesn't treat Anna and Anne, or Magdaline and Magdalene, as variants; cutting
//   the final vowel does (Ann*, Magdalin*). See givenStem().
// - firstname matches each of its words against any given name ("Magdalin*" finds
//   "Anna Magdalena"), and every word must match: "Ann* Magdalin*" finds
//   "Anne Magdalen" but not "Anne". Records often leave out a middle name, so only
//   the own baptism also searches by the first two given names.
// - Transcribed parents' names can be far off: a child's parents Johannes
//   Lindeman and Oline Johanne can be "Johanne Olsen" and "Johanne Stigberg" on the
//   baptism, so the baptism is also searched for by her given names alone.
// - Most church records give no birth year for parents and godparents: filter on the
//   event year, not birth_year.
// - genders[] drops every record without a gender (many censuses): never use it.
// - Census rows do give a birth year (from the age), so the census query filters on
//   birth_year; jt[] picks the census years, sc[]=em the emigration sources.
// - Emigrant protocols (sc[]=em, from 1867) give every emigrant's age, children's
//   too, so that query also filters on birth_year. Church books' moving lists
//   (lt[]=uf out-migrated, fl in- and out-migrated; role utflytter) cover moves
//   within Norway as well as emigration, from about 1812, and often give no age.

const DA_SEARCH_URL = 'https://www.digitalarkivet.no/en/search/persons/advanced';
const RESULTS_PER_PAGE = 50;
const MAX_PAGES = 2;
const REQUEST_GAP_MS = 1000; // DA rate-limits automated traffic
// The most hits of one search that are read (a function: search.js uses it)
function readLimit() { return MAX_PAGES * RESULTS_PER_PAGE; }

// Patronymic: genitive s + ending: -sen/-søn/-son, -datter/-dotter and the church
// books' abbreviations of it (-daatter, -dattr., -datt., -datr., -dat., -dtr., -dr.,
// -d:r, -d.; Johannesdat. is Johannesdatter)
const PATRONYMIC_ENDING = /(s)(en|øn|on|datter|dotter|daatter|dattr\.?|datt\.?|datr\.?|dat\.?|dtr\.?|dr\.?|d:r\.?|d\.?)$/i;

const RECORD_TYPES = {
  pd: 'Baptism', pk: 'Confirmation', pv: 'Marriage', pg: 'Burial', pf: 'Census',
  pe: 'Emigration', pu: 'Out-migration', pi: 'In-migration', pa: 'Probate', pt: 'Tax', pl: 'School', pm: 'Property',
  pb: 'Fire insurance', pc: 'Other'
};

const ROLES = {
  'barn': 'Child', 'konfirmant': 'Confirmand', 'far': 'Father', 'fader': 'Father',
  'mor': 'Mother', 'moder': 'Mother', 'fadder': 'Godparent', 'brudgom': 'Groom',
  'brur': 'Bride', 'brud': 'Bride', 'brudgommens far': "Groom's father",
  'bruras far': "Bride's father", 'brudens far': "Bride's father",
  'brudgommens mor': "Groom's mother", 'bruras mor': "Bride's mother", 'brudens mor': "Bride's mother",
  'forlover': 'Witness', 'forlovere': 'Witness', 'forløvere': 'Witness',
  'avdød': 'Deceased', 'avdøde': 'Deceased', 'ektemann': 'Husband', 'kone': 'Wife',
  'ektefelle': 'Spouse', 'dåpsvitne': 'Witness', 'forsørger': 'Provider', 'forsørgjar': 'Provider',
  'pårørende': 'Relative', 'innflytter': 'In-migrant', 'utflytter': 'Out-migrant',
  'innflyttar': 'In-migrant', 'utflyttar': 'Out-migrant',
  'dødfødt': 'Stillborn', 'forelder': 'Parent', 'person': ''
};

// --- Names and years ------------------------------------------------------------------

// Functions used by other scripts are declared with `function`: a const in one
// script isn't visible to the others when they are eval'd separately (tests)
function firstWord(s) { return ((s || '').trim().split(/\s+/)[0] || '').replace(/[.,]$/, ''); }

function isPatronymic(surname) { return PATRONYMIC_ENDING.test(surname || ''); }
// The father's name in a patronymic (Halvorsen → Halvor, Olsdr. → Ol)
function patronymicBase(surname) { return (surname || '').replace(PATRONYMIC_ENDING, ''); }

// A word that may be a patronymic of a father's name `base` in a form isPatronymic()
// doesn't read: the father's name (and a few letters: Johan → Johannes), a genitive s
// and the start of an ending (-sd…, -ss…, -se…, -sø…, -so…). Neither the same father
// nor another, so it mustn't count against a match (Halvorsrud, a farm, isn't one).
function unreadPatronymic(word, base) {
  const w = (word || '').toLowerCase(), b = (base || '').toLowerCase();
  if (b.length < 3 || isPatronymic(word) || !w.startsWith(b)) return false;
  return /^\p{L}{0,3}s[dseøo]/u.test(w.slice(b.length));
}

// Given name for a DA search: without its final vowel(s), with a trailing *, so
// spellings DA doesn't treat as variants match too (Anna → Ann*, finding Anne;
// Magdaline → Magdalin*, finding Magdalene and Magdalena). Names that don't end in a
// vowel, or would be cut below 3 letters, are used as they are, with DA's own
// variants (Jon → Joen, John; Johannes → Johanes; Ole). An old final j for i is a
// vowel too (Sirj → Sir*, finding Siri and Siry, as Siri does).
const OLD_FINAL_I = /(?<=[^aeiouyæøå])j$/i;
function givenStem(name) {
  const s = (name || '').trim().replace(/[.,]$/, '');
  if (!s || /[\s*]/.test(s)) return s;
  const cut = s.replace(OLD_FINAL_I, '').replace(/[aeiouyæøå]+$/i, '');
  return cut !== s && cut.length >= 3 ? cut + '*' : s;
}

// Forms of one given name that DA doesn't treat as variants and whose consonants
// differ too (so skeleton() in da_match.js doesn't match them): FS has Ingeborg
// where the church book writes Ingbjør. Lowercase; each group's shared start is its
// stem for DA's related_first_name (relatedStem()), when at least 3 letters.
const GIVEN_NAME_FORMS = [
  ['ingeborg', 'ingebjørg', 'ingebjør', 'ingbjør', 'ingbjørg', 'ingebor', 'ingbør'],
  ['ingrid', 'ingri', 'ingerid', 'ingerd'],
  ['margit', 'marit', 'margjit', 'margith'],
  ['sigrid', 'siri', 'sigri'],
  ['åshild', 'aashild', 'åsild', 'aasild', 'åsil', 'aasil', 'åsille', 'aasille', 'osille', 'oselle', 'åsel', 'aasel'],
  ['rønnaug', 'ronnaug', 'rønaug', 'ronaug', 'rønnau', 'ronnau', 'ronu', 'rønnog'],
  ['ånund', 'aanund', 'anund', 'ånon', 'aanon', 'ånen', 'aanen'],
  ['kirsti', 'kirsten', 'kjersti', 'kjerstin', 'kristin', 'kerstin'],
  ['kari', 'karen', 'karin'],
  ['guri', 'gudrid', 'gurid'],
  ['gudbrand', 'gulbrand', 'gubrand'],
  ['knud', 'knut'],
  ['johannes', 'johan', 'johann', 'john', 'jon', 'joen'],
  ['ole', 'ola', 'olav', 'olaf', 'oluf'],
  ['iver', 'ivar'],
  ['halvor', 'halvard', 'halvar'],
  ['torkel', 'torkjel', 'thorkel', 'torkild', 'thorkild'],
  ['torstein', 'thorstein', 'tosten', 'torsten', 'thosten'],
  ['gjertrud', 'gjertru', 'gertrud'],
  ['ragnhild', 'ragnild', 'rangdi', 'ragni'],
  ['engebret', 'engebrigt', 'ingebret', 'ingebrigt'],
  ['eli', 'elin'],
  ['leiv', 'leif', 'lev']
];

// Dialect forms that start differently (Imbjør for Ingebjørg, as in Gudbrandsdalen):
// matched as forms of their group's name, but left out of the group's shared stem
// (relatedStem()), which they would cut to one letter
const GIVEN_NAME_DIALECT = { imbjør: 'ingeborg', imbjor: 'ingeborg', imbjørg: 'ingeborg' };

// A given name as GIVEN_NAME_FORMS lists it: lowercase, and an old final j or y for
// i (Sirj, Siry → siri), so a group needn't list those spellings
function nameKey(name) {
  return (name || '').toLowerCase().replace(/[.,*]/g, '').trim().replace(/(?<=[^aeiouyæøå])[jy]$/, 'i');
}

// The forms of a given name (its group and the group's dialect forms, or just the
// name), lowercase
function nameForms(name) {
  const n = nameKey(name);
  const group = GIVEN_NAME_FORMS.find((g) => g.includes(n) || g[0] === GIVEN_NAME_DIALECT[n]);
  if (!group) return n ? [n] : [];
  return group.concat(Object.keys(GIVEN_NAME_DIALECT).filter((d) => GIVEN_NAME_DIALECT[d] === group[0]));
}

// A relative's given name for related_first_name: the shared start of its forms
// (Ingeborg → Ing*, finding Ingbjør), otherwise givenStem()
function relatedStem(name) {
  const n = nameKey(name);
  const forms = GIVEN_NAME_FORMS.find((g) => g.includes(n)) || [];
  if (forms.length > 1) {
    let start = forms[0];
    for (const f of forms) while (!f.startsWith(start)) start = start.slice(0, -1);
    if (start.length >= 3) return name.trim()[0] + start.slice(1) + '*';
  }
  return givenStem(name);
}

// Irregular patronymics: Ole → Olsen
const PATRONYMIC_BASE = { ole: 'Ol', ola: 'Ol' };

// Patronymic stems (the father's name with the genitive s) that are spellings of one
// name but that DA doesn't treat as variants: in one family's baptisms the mother is
// Johannesdtr. and Johannsdtr, and FS has Johansdr, and Johans* finds neither. DA's
// own variants cover ch/k (Torchels* = Torkels*) and some doubled letters (Olsen =
// Olssen), not all (Johansdtr doesn't find Johannsdtr). `shared` is the start the
// spellings share, searched by instead of each spelling where it names no other
// father (Johan* finds all three); the others are searched for one by one, since
// their shared start finds too many other names (Pe*, And*, Christ*: Christophersen,
// Halv*: Halvdansen, Gu*).
const PATRONYMIC_SPELLINGS = [
  { forms: ['johannes', 'johanns', 'johans'], shared: 'johan' },
  { forms: ['peders', 'pers'] }, { forms: ['christens', 'christians'] },
  { forms: ['anders', 'andres'] }, { forms: ['halvors', 'halvards'] }, { forms: ['gulbrands', 'gudbrands'] }
];

// The spelling group of a patronymic: {group, own, rest}, own being the longest
// listed spelling the genitive stem starts with (Johannessen → johannes + s); null
// when it isn't listed
function patronymicGroup(surname) {
  const s = (surname || '').trim();
  if (!isPatronymic(s)) return null;
  const stem = s.replace(PATRONYMIC_ENDING, '$1').toLowerCase();
  let found = null;
  for (const group of PATRONYMIC_SPELLINGS) {
    for (const p of group.forms) if (stem.startsWith(p) && (!found || p.length > found.own.length)) found = { group, own: p, rest: stem.slice(p.length) };
  }
  return found;
}

// The patronymic a child of `father` has (Aslak → Aslaksen, Aslaksdatter; Johannes →
// Johannesdatter). Used when FS has no surname, and as a surname to score with, since
// FS's patronymics are sometimes someone's guess.
function patronymicOf(father, sex) {
  const name = firstWord(father);
  if (!name || isPatronymic(name)) return '';
  const base = PATRONYMIC_BASE[name.toLowerCase()] || name;
  return base + (/s$/i.test(base) ? '' : 's') + (sex === 'Female' ? 'datter' : 'en');
}

// Surname for a DA search: the stem with a trailing *, so spellings DA doesn't treat
// as variants still match. Patronymics keep the genitive s (Aslaksen → Aslaks*,
// Tollefsdatter → Tollefs*); other surnames are cut before the last vowel
// (Lindeman → Lindem*, matching Lindemann). Short ones are used as they are.
function surnameStem(surname) {
  const s = (surname || '').trim();
  if (!s || /\s/.test(s)) return s;
  if (isPatronymic(s)) return s.replace(PATRONYMIC_ENDING, '$1') + '*';
  const m = s.match(/^(.*)[aeiouyæøå][^aeiouyæøå]*$/i);
  return m && m[1].length >= 4 ? m[1] + '*' : s;
}

// Surname to search by: surnameStem(), but a patronymic of a father's name with
// listed spellings by the start they share, where there is one (Johansdr → Johan*,
// finding Johannesdtr. and Johannsdtr), and in the church books' letters
// (churchSpelling(): Jorgensen → Jørgens*, Håkonsen → Haakons*).
// Scoring keeps surnameStem().
function searchStem(surname) {
  const own = churchSpelling(surname);
  if (own) return searchStem(own);
  const spelled = patronymicGroup(surname);
  const shared = spelled && spelled.group.shared;
  return shared ? surname.trim().slice(0, shared.length) + '*' : surnameStem(surname);
}

// Fathers' names written with æ, ø or å, which FS often has otherwise (Jorgensen,
// Hakonsen, Palsen; Håkonsen in today's spelling): DA doesn't treat o as ø, nor å as
// aa, and its transcriptions keep the church books' letters (Jørgensen, Haakonsen:
// Jorgens* finds few of them, Håkons* none), so searchStem() searches by those first
const NORWEGIAN_LETTER_FATHERS = ['søren', 'jørgen', 'jørn', 'bjørn', 'sæbjørn', 'gjøran', 'tørres', 'tørris',
  'østen', 'øystein', 'bård', 'håkon', 'pål', 'ståle', 'ånund', 'åsmund', 'åsulf', 'tjøstolv', 'tjøstel'];

// A patronymic in the church books' letters (Jorgensen → Jørgensen, Hakonsdatter and
// Håkonsdatter → Haakonsdatter); '' when it is already so or its father's name isn't
// listed
function churchSpelling(surname) {
  const s = (surname || '').trim();
  if (!isPatronymic(s)) return '';
  const lower = s.toLowerCase();
  const plain = (name, ae, aa) => name.replace(/æ/g, ae).replace(/ø/g, 'o').replace(/å/g, aa);
  for (const name of NORWEGIAN_LETTER_FATHERS) {
    const church = name.replace(/å/g, 'aa');
    for (const form of new Set([name, plain(name, 'ae', 'aa'), plain(name, 'a', 'a'), plain(name, 'ae', 'a')])) {
      // the genitive s follows, or ends the name (Torresen)
      if (!lower.startsWith(form) || !(/s$/.test(form) || lower[form.length] === 's')) continue;
      if (form === church) return '';
      return (s[0] === s[0].toLowerCase() ? church[0] : church[0].toUpperCase()) + church.slice(1) + s.slice(form.length);
    }
  }
  return '';
}

// The other spellings of a patronymic to search for one by one (Pedersen → Pers*;
// Johansdr → none, since Johan* finds them; Jorgensen, searched as Jørgens*, →
// Jorgens*, as a few transcriptions have it)
function surnameSpellings(surname) {
  const own = churchSpelling(surname);
  // (not Håkonsen's own: DA's transcriptions have no å)
  if (own) return [...(/å/i.test(surname) ? [] : [surnameStem(surname)]), ...surnameSpellings(own)];
  const spelled = patronymicGroup(surname);
  if (!spelled || spelled.group.shared) return [];
  const s = surname.trim();
  return spelled.group.forms.filter((p) => p !== spelled.own).map((p) => s[0] + p.slice(1) + spelled.rest + '*');
}

const year = (v) => (/^\d{4}$/.test(String(v || '').trim()) ? Number(v) : null);

// A year range from two fields; one year alone gives a one-year range
function range(from, to) {
  const a = year(from), b = year(to);
  if (!a && !b) return null;
  return { from: a || b, to: b || a };
}

const unique = (list) => [...new Set(list)];
const foldName = (s) => (s || '').toLowerCase().trim();

// The search page's criteria (readCriteria in search.js) as one person
function profile(criteria) {
  const first = (id) => criteria[id][0] || {};
  const names = criteria.name.filter((n) => n.givenName || n.surname);
  const b = first('birth'), m = first('marriage'), d = first('death'), e = first('emigration');
  // A relative turned off in the sidebar (q.fatherSkip, ...) isn't used at all
  const relative = (r, prefix) => (r[prefix + 'Skip'] ? { given: '', surname: '', year: null }
    : { given: (r[prefix + 'GivenName'] || '').trim(), surname: (r[prefix + 'Surname'] || '').trim(), year: year(r[prefix + 'BirthYear']) });
  const P = {
    given: firstWord(names[0] && names[0].givenName),
    givenNames: ((names[0] && names[0].givenName) || '').trim().split(/\s+/).filter(Boolean),
    givens: unique(names.map((n) => firstWord(n.givenName)).filter(Boolean)),
    surname: ((names[0] && names[0].surname) || '').trim(),
    surnames: unique(names.map((n) => (n.surname || '').trim()).filter(Boolean)),
    sex: first('sex').sex || '',
    birth: range(b['birthLikeDate.from'], b['birthLikeDate.to']), birthPlace: (b.birthLikePlace || '').trim(),
    // FS's birth date ({year, month, day, exact}: parseFsDate()) and year, when it has one
    birthDate: parseFsDate(b.birthLikeDate),
    marriage: range(m['marriageLikeDate.from'], m['marriageLikeDate.to']), marriagePlace: (m.marriageLikePlace || '').trim(),
    death: range(d['deathLikeDate.from'], d['deathLikeDate.to']), deathPlace: (d.deathLikePlace || '').trim(),
    emigration: range(e['emigrationLikeDate.from'], e['emigrationLikeDate.to']), emigrationPlace: (e.emigrationLikePlace || '').trim(),
    abroad: year(e.abroadYear) ? { year: year(e.abroadYear), place: (e.abroadPlace || '').trim() } : null,
    father: relative(first('father'), 'father'),
    mother: relative(first('mother'), 'mother'),
    spouses: criteria.spouse.map((s) => relative(s, 'spouse')).filter((s) => s.given),
    children: criteria.child.filter((c) => !c.childSkip).map((c) => relative(c, 'child')).filter((c) => c.given || c.year),
    residences: criteria.residence.map((r) => (r.residencePlace || '').trim()).filter(Boolean),
    farms: criteria.farm.map((f) => (f.farm || '').trim()).filter(Boolean)
  };
  // Without a date, a range four years wide is FS's year ±2 (personToQuery(); an
  // older link), so its middle is FS's year
  if (!P.birthDate && P.birth && P.birth.to - P.birth.from === 4) {
    P.birthDate = { year: P.birth.from + 2, month: null, day: null, exact: false };
  }
  P.birthYear = P.birthDate ? P.birthDate.year : null;
  P.places = unique([P.birthPlace, P.marriagePlace, P.deathPlace, ...P.residences].filter(Boolean));
  P.estBirth = estimatedBirth(P);
  // The last year to search Norway's records in: the end of the emigration range
  // (FS's latest emigration or immigration year + 2, for stray records), or FS's
  // first event outside Norway + 2, whichever is earlier; none when FS has the death
  // in Norway (the person came back)
  const cutoffs = [P.emigration && P.emigration.to, P.abroad && P.abroad.year + 2].filter(Boolean);
  P.leftNorway = cutoffs.length && !(P.deathPlace && !outsideNorway(P.deathPlace)) ? Math.min(...cutoffs) : null;
  // FS's other names for the person (alternate names), as given name and surname
  P.alternates = names.slice(1).map((n) => ({ given: firstWord(n.givenName) || firstWord(names[0].givenName), surname: (n.surname || '').trim() }));
  P.patronymic = patronymicOf(P.father.given, P.sex);
  if (P.patronymic) {
    if (!P.surname) P.surname = P.patronymic;
    P.surnames = unique([...P.surnames, P.patronymic]);
  }
  return P;
}

// When FS has no birth: the birth years the marriage and children leave (married
// at 16–50; a mother 18–50 and a father 18–65 at the children's births; at most 100
// at death), or null. Used for the years of the searches, never for scoring.
function estimatedBirth(P) {
  if (P.birth) return null;
  const bounds = [];
  if (P.marriage) bounds.push([P.marriage.from - 50, P.marriage.to - 16]);
  const childYears = P.children.map((c) => c.year).filter(Boolean);
  if (childYears.length) bounds.push([Math.max(...childYears) - (P.sex === 'Female' ? 50 : 65), Math.min(...childYears) - 18]);
  if (!bounds.length) return null;
  if (P.death) bounds.push([P.death.from - 100, P.death.to]);
  const from = Math.max(...bounds.map((b) => b[0])), to = Math.min(...bounds.map((b) => b[1]));
  return from <= to ? { from, to } : { from: to, to: from };
}

// FS's emigration or immigration years, without the search range's ±2 ("1866–1868")
function emigrationYears(P) {
  const e = P.emigration;
  if (!e) return '';
  const [a, b] = e.to - e.from >= 4 ? [e.from + 2, e.to - 2] : [e.from, e.to];
  return a === b ? String(a) : a + '–' + b;
}

// Why the searches end at P.leftNorway, for the skip and score texts: "emigrating
// (FS: 1866–1868)", or "leaving Norway (FS: Eau Claire, Wisconsin, United States, 1875)"
// when FS's first event abroad is the earlier cutoff
function leavingText(P) {
  if (P.emigration && !(P.abroad && P.abroad.year + 2 < P.emigration.to)) return t('emigrating (FS: {years})', { years: emigrationYears(P) });
  if (P.abroad) return t('leaving Norway (FS: {what})', { what: (P.abroad.place ? P.abroad.place + ', ' : '') + P.abroad.year });
  return t('leaving Norway');
}

// The person's lifetime: birth range start to death range end (a century if one is
// missing), from the estimated birth when FS has none
function lifetime(P) {
  const birth = P.birth || P.estBirth;
  const from = birth && birth.from;
  const to = P.death && P.death.to;
  if (from && to) return [from, to];
  if (from) return [from, from + 100];
  if (to) return [to - 100, to];
  return [null, null];
}

// DA's census years (jt[] codes)
const CENSUS_YEARS = {
  1769: 14, 1801: 13, 1815: 12, 1825: 11, 1835: 10, 1845: 9, 1855: 8, 1865: 7, 1870: 6,
  1875: 5, 1885: 4, 1891: 3, 1900: 2, 1910: 19, 1920: 18, 1960: 436
};

// The censuses that cover all of Norway
const FULL_CENSUSES = [1801, 1865, 1875, 1900, 1910, 1920];

// A place outside Norway: FS places end with the country
const outsideNorway = (place) => !!place && !/\b(norway|norge|noreg)\s*$/i.test(place);

// --- Queries ----------------------------------------------------------------------------

// Criteria from search.js (readCriteria) → a list of queries, one per life event:
// { id, kind, title, summary, base, steps, levels, goal, params, skip? }. A query is
// a series of searches, strict to relaxed, run by runQuery() in searchPlan()'s order
// (each step × level) until its goal is met:
// - `steps`, the names searched for, [{ fields, text, reasons, fallback? }]: first
//   the person and a relative with both full names, then leaving out one name at a
//   time (a mother's surname first: records often leave it out), the person alone
//   last. `reasons` are what every hit of the step matched ("mother Ing* for
//   Ingeborg"). Fallback steps (other names for the person) run only while nothing
//   is found.
// - `levels`, where, [{ fields, text, fallback? }]: the municipalities of the
//   event's FS places, then their counties, then all of Norway (a fallback: only
//   while nothing is found); or the places chosen under Where to search.
// - `goal(hits)`: what's still missing, [] when done. By default a record; for
//   children's baptisms each known child's, for the census each census year.
// `base` holds the fields every search has (role, years, sources); `params` is the
// first search (the "Open on DA" link before the query runs). A query with `skip`
// isn't run; `skip` says why or what's missing.
//
// No genders[] filter: DA drops every record without a gender (many censuses), e.g.
// Maren Lindeman's 1870 census. Sex is used for scoring instead.
function buildQueries(criteria) {
  const P = profile(criteria);
  const queries = [];
  if (!P.given && !P.surname) return queries;

  const stem = searchStem(P.surname);
  // Every search ends when the person left Norway (P.leftNorway)
  const [lifeFrom, lifeEnd] = lifetime(P);
  const left = P.leftNorway;
  const lifeTo = left ? Math.min(lifeEnd || left, left) : lifeEnd;
  const capped = (to) => (left && to ? Math.min(to, left) : to);
  const emigrated = leavingText(P);
  const gone = (from, to) => (left && from && to && from > to ? t('After {what}.', { what: emigrated }) : '');
  const span = (from, to) => (from || to ? (from || '…') + '–' + (to || '…') : t('any year'));
  const given = givenStem(P.given);
  const nameText = [given, stem].filter(Boolean).join(' ');
  const byRole = (male, female) => (P.sex === 'Male' ? [male] : P.sex === 'Female' ? [female] : [male, female]);
  const roleText = { brudgom: 'groom', brud: 'bride', far: 'father', mor: 'mother', barn: 'child', konfirmant: 'confirmand', 'avdød': 'deceased',
    brudgommensfar: "groom's father", brudensfar: "bride's father" };
  const as = (roles) => t('as {roles}', { roles: roles.map((r) => t(roleText[r])).join(t(' or ')) });
  // FS's birth, or the one estimated from the marriage and children (shown as "about")
  const birth = P.birth || P.estBirth;
  const bornText = (from, to) => t(P.birth ? 'born {years}' : 'born about {years}', { years: span(from, to) });
  const years = (from, to) => ({ event_year_from: from, event_year_to: to });
  const bornFields = birth ? { birth_year_from: birth.from - 3, birth_year_to: birth.to + 3 } : {};
  const hitYear = (hit) => Number(((hit.date || '') + ' ' + (hit.source || '')).match(/\b(1[5-9]\d\d)\b/)?.[1]) || null;
  const listText = (names) => names.join(', ').replace(/, ([^,]*)$/, (all, last) => t(' or ') + last);

  // Where: the places chosen under Where to search (DA finds records in any of the
  // chosen counties and municipalities), or the municipalities of the event's FS
  // places, then their counties, then all of Norway while nothing is found
  const picked = criteria.where || { m: [], c: [] };
  const chosen = picked.m.length || picked.c.length ? [{
    fields: { 'm[]': picked.m, 'c[]': picked.c },
    text: listText([...picked.c.map(countyName), ...picked.m.map(municipalityName)])
  }] : null;
  const norway = { fields: {}, text: t('Norway') };
  // (the event's places, or all the FS places when FS has none of them)
  const levelsFor = (places) => {
    if (chosen) return chosen;
    const list = places.some(Boolean) ? places.filter(Boolean) : P.places;
    const m = unique(list.flatMap(municipalityCodes));
    const c = unique(list.flatMap(countyCodes));
    const levels = [];
    if (m.length) levels.push({ fields: { 'm[]': m }, text: listText(m.map(municipalityName)) });
    if (c.length) levels.push({ fields: { 'c[]': c }, text: listText(c.map(countyName)) });
    levels.push(levels.length ? { ...norway, fallback: true } : norway);
    return levels;
  };
  const allPlaces = P.places;

  // The person's and a relative's names as search fields: the person's in firstname
  // and lastname, a relative's (the stem of the given name's forms and of the
  // surname: Ing* Lars* for Ingrid Larsdr, Ann* Johan* for Anne Johansdr) as related
  // person, with the other spellings of the relative's patronymic (Pers* for
  // Pedersdatter)
  const me = { first: given, last: stem };
  const relative = (r, relation, roles) => r && r.given ? {
    relation, roles, first: relatedStem(firstWord(r.given)), last: r.surname ? searchStem(r.surname) : '',
    spellings: r.surname ? surnameSpellings(r.surname) : [],
    fsFirst: firstWord(r.given), fsLast: r.surname || ''
  } : null;
  // One party's names in a step (first and/or last), or null when the step wants a
  // name the party hasn't got
  const part = (who, first, last) => {
    if ((first && !who.first) || (last && !who.last) || (!first && !last)) return null;
    const names = [first && who.first, last && who.last].filter(Boolean).join(' ');
    if (!who.relation) return { fields: { firstname: first ? who.first : '', lastname: last ? who.last : '' }, text: names, reasons: [] };
    const fs = [first && who.fsFirst, last && who.fsLast].filter(Boolean).join(' ');
    return {
      fields: { related_first_name: first ? who.first : '', related_last_name: last ? who.last : '', 'related_roles[]': who.roles || [] },
      text: who.relation + ' ' + names,
      reasons: [who.relation + ' ' + (foldName(names) === foldName(fs) ? fs : t('{name} for {fs}', { name: names, fs }))]
    };
  };
  const step = (parts, extra = {}) => ({
    fields: Object.assign({}, ...parts.map((p) => p.fields)),
    text: parts.map((p) => p.text).join(' + '),
    reasons: parts.flatMap((p) => p.reasons),
    ...extra
  });
  // The person and a relative in one record, strict to relaxed: both full names;
  // `a` without the surname, then by surname only; `b` the same; both by given name
  // only. `a` is the one whose surname records leave out most (a mother, a bride).
  // The first step with the relative's surname has the surname's other spellings in
  // `then`, steps that query() puts right after it, before the surname is left out
  // (a mother Pedersdatter written Persdatter).
  const pairSteps = (a, b) => {
    const steps = [];
    const rel = a.relation ? a : b;
    let spelled = !(rel.spellings || []).length;
    for (const [af, al, bf, bl] of [[1, 1, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 0], [1, 1, 0, 1], [1, 0, 1, 0]]) {
      const pa = part(a, af, al), pb = part(b, bf, bl);
      if (!pa || !pb) continue;
      const pair = (x, y) => step(a === me ? [x, y] : [y, x]);
      const s = pair(pa, pb);
      if (!spelled && (rel === a ? al : bl)) {
        spelled = true;
        s.then = rel.spellings.map((last) => rel === a
          ? pair(part({ ...rel, last }, af, al), pb) : pair(pa, part({ ...rel, last }, bf, bl)));
      }
      steps.push(s);
    }
    return steps;
  };
  const alone = (who, first = 1, last = 1) => { const p = part(who, first, last); return p ? [step([p])] : []; };

  // A query; arrays in fields are repeated fields, empty values are left out. A
  // step's `then` steps follow it (pairSteps()).
  const query = (id, title, base, steps, levels, summary, extra = {}) => {
    const seen = new Set();
    const q = {
      id, title, base: withFields(new URLSearchParams(), base), levels, reasons: [],
      steps: steps.flatMap(({ then = [], ...s }) => [s, ...then]).filter((s) => { const key = withFields(new URLSearchParams(), s.fields).toString(); return !seen.has(key) && seen.add(key); }),
      summary: summary.filter(Boolean).join(' · '),
      goal: (hits) => (hits.length ? [] : [t('a record')]),
      ...extra
    };
    queries.push(q);
    return q;
  };

  // Own baptism: the child usually has no surname in the record, so by the first
  // given name and a parent's full name, then by two given names alone (all must
  // match), then with a parent's given name only (DA's transcriptions of parents can
  // be far off) and by the first given name alone, in the FS birthplace
  if (P.given) {
    const from = P.birth && P.birth.from, to = P.birth && P.birth.to + 1; // baptism can fall in the next year
    const parents = [relative(P.father, t('father'), ['far']), relative(P.mother, t('mother'), ['mor'])].filter(Boolean);
    const pairs = parents.map((r) => pairSteps(r, { first: given }));
    // (two given names find fewer children than one and a parent's given name)
    const two = P.givenNames.length > 1 ? P.givenNames.slice(0, 2).map(givenStem).join(' ') : '';
    const steps = [...pairs.map((p) => p[0]), ...(P.birth && two ? alone({ first: two }, 1, 0) : []),
      ...pairs.map((p) => p[1]), ...(P.birth ? alone(me, 1, 0) : [])].filter(Boolean);
    const q = query('baptism', t('Baptism'), { 'roles[]': 'barn', ...years(from, to) }, steps,
      levelsFor(P.birthPlace ? [P.birthPlace] : allPlaces), [as(['barn']), span(from, to)]);
    if (!steps.length) q.skip = t('Add the father or mother, or a birth year, to search for the baptism.');
  }

  // Confirmation, usually at 14–16: by name, with the father (some confirmations
  // name him), and by the given name alone, in the birthplace and residences
  {
    const from = birth && birth.from + 13, to = capped(birth && birth.to + 20);
    const father = relative(P.father, t('father'), []);
    const steps = [...alone(me), ...(father ? pairSteps(father, { first: given }).slice(0, 2) : []), ...alone(me, 1, 0)];
    const q = query('confirmation', t('Confirmation'), { 'roles[]': 'konfirmant', ...years(from, to) }, steps,
      levelsFor([P.birthPlace, ...P.residences]), [as(['konfirmant']), span(from, to)]);
    if (!birth) q.skip = t('Add a birth year to search for the confirmation.');
    else if (gone(from, to)) q.skip = gone(from, to);
  }

  // Marriage: one query per spouse, the spouse as related person (bride's surname
  // relaxed first), then the person alone (any spouse), in the FS marriage place
  {
    const [from, to] = P.marriage ? [P.marriage.from - 1, P.marriage.to + 1]
      : birth ? [birth.from + 16, Math.min(birth.to + 60, lifeTo)] : [lifeFrom, lifeTo];
    // FS's marriage abroad, or after the person left Norway, isn't in DA
    const abroad = P.marriage && (outsideNorway(P.marriagePlace) || (left && P.marriage.from > left))
      ? (() => {
        const year = Math.round((P.marriage.from + P.marriage.to) / 2);
        if (outsideNorway(P.marriagePlace)) return t('Married in {place}, {year}.', { place: P.marriagePlace, year });
        return P.marriagePlace ? t('Married in {place}, {year}, after {what}.', { place: P.marriagePlace, year, what: emigrated })
          : t('Married {year}, after {what}.', { year, what: emigrated });
      })()
      : !P.marriage ? gone(from, to) : '';
    const roles = byRole('brudgom', 'brud');
    const spouses = P.spouses.length ? P.spouses : [null];
    const levels = levelsFor(P.marriagePlace ? [P.marriagePlace] : allPlaces);
    spouses.forEach((spouse, k) => {
      const s = relative(spouse, t('spouse'), []);
      const q = query('marriage' + (k ? '-' + k : ''), spouse ? t('Marriage to {name}', { name: spouse.given }) : t('Marriage'), { 'roles[]': roles, ...years(from, to) },
        [...(s ? pairSteps(s, me) : []), ...alone(me)], levels, [as(roles), span(from, to)]);
      if (abroad) q.skip = abroad;
    });
  }

  // Children's baptisms: the person as father or mother, with each FS spouse as the
  // other parent, strict to relaxed (the mother's surname is left out first), then
  // the person alone. The person's name alone finds thousands of fathers in Norway;
  // the couple in the parish, a few. Done when every known child's year has a hit.
  {
    const roles = byRole('far', 'mor');
    const childYears = P.children.map((c) => c.year).filter(Boolean);
    let from = lifeFrom, to = lifeTo;
    if (P.birth) {
      from = P.birth.from + 16;
      to = P.birth.to + (P.sex === 'Female' ? 50 : 70);
      if (P.death) to = Math.min(to, P.death.to + 1);
    } else if (childYears.length) {
      from = Math.min(...childYears) - 1;
      to = Math.max(...childYears) + 1;
    }
    to = capped(to);
    // Children born after the person left Norway aren't looked for; when FS has
    // children and all of them were, there's nothing to look for
    const abroad = left && childYears.length && childYears.every((y) => y > left)
      ? t('All {n} FS children were born after {what}.', { n: childYears.length, what: emigrated }) : gone(from, to);
    // The spouse's role is the other parent's: mother for a man, father for a woman
    const other = P.sex === 'Male' ? ['mor'] : P.sex === 'Female' ? ['far'] : ['far', 'mor'];
    const relation = other.map((r) => t(roleText[r])).join(t(' or '));
    const known = P.children.filter((c) => c.year && !(left && c.year > left));
    const goal = known.length ? (hits) => known.filter((c) => !hits.some((h) => {
      const y = hitYear(h);
      return (h.role === 'Father' || h.role === 'Mother') && y >= c.year && y <= c.year + 1;
    })).map((c) => t('a baptism for {child}', { child: [c.given, '(' + t('b.') + ' ' + c.year + ')'].filter(Boolean).join(' ') })) : undefined;
    // where the children were born: the marriage, the residences, the birth, and the
    // death when it came while they still could be (a father dead at 31 in another
    // town had his last children baptized there)
    const diedThen = P.death && P.deathPlace && P.death.from <= to;
    const levels = levelsFor([P.marriagePlace, ...P.residences, P.birthPlace, diedThen ? P.deathPlace : '']);
    // With a spouse, only the couple's records count for the goal: the person's name
    // alone finds other men's children of those years
    const namesRelative = (st) => Boolean(st.fields.related_first_name || st.fields.related_last_name);
    const spouses = P.spouses.length ? P.spouses : [null];
    spouses.forEach((spouse, k) => {
      const s = relative(spouse, relation, other);
      const steps = s ? (P.sex === 'Female' ? pairSteps(me, s) : pairSteps(s, me)) : [];
      const q = query('children' + (k ? '-' + k : ''), spouse ? t("Children's baptisms with {name}", { name: spouse.given }) : t("Children's baptisms"),
        { 'roles[]': roles, ...years(from, to) }, [...steps, ...alone(me)], levels,
        [as(roles), span(from, to)], { ...(goal ? { goal } : {}), ...(s ? { counts: namesRelative } : {}) });
      if (abroad) q.skip = abroad;
    });
  }

  // Children's marriages: church books name the couple's fathers (not mothers), so FS
  // often has a man's sources as groom's or bride's father. From the eldest known
  // child's 16th year (or the person's 36th) to 45 years after the youngest's birth.
  {
    const roles = ['brudgommensfar', 'brudensfar'];
    const childYears = P.children.map((c) => c.year).filter((y) => y && !(left && y > left));
    const from = childYears.length ? Math.min(...childYears) + 16 : birth ? birth.from + 36 : lifeFrom;
    const to = capped(childYears.length ? Math.max(...childYears) + 45 : lifeTo);
    const q = query('childmarriage', t("Children's marriages"), { 'roles[]': roles, ...years(from, to) }, alone(me),
      levelsFor(allPlaces), [as(roles), span(from, to)]);
    const allLater = left && P.children.some((c) => c.year) && P.children.every((c) => !c.year || c.year > left);
    if (P.sex === 'Female') q.skip = t('Church books name only the fathers of a couple.');
    else if (allLater) q.skip = t('All FS children were born after {what}.', { what: emigrated });
    else if (gone(from, to)) q.skip = gone(from, to);
  }

  // Censuses taken in the person's lifetime. Census rows give a birth year (worked
  // out from the age), so filter on it: a census lists everyone. By name, then by
  // the given name alone (a farm name or another patronymic), in every FS place;
  // done when each census year has a hit.
  {
    const censuses = lifeFrom ? Object.keys(CENSUS_YEARS).map(Number).filter((y) => y >= lifeFrom && y <= lifeTo) : [];
    const base = { ...(lifeFrom ? { 'jt[]': censuses.map((y) => CENSUS_YEARS[y]) } : { 'sc[]': 'ft' }), ...bornFields };
    // Done when each of the censuses DA has for all of Norway has a hit (the others
    // are fragments or towns only)
    const full = censuses.filter((y) => FULL_CENSUSES.includes(y));
    const goal = full.length ? (hits) => full.filter((y) => !hits.some((h) => hitYear(h) === y)).map((y) => t('the {year} census', { year: y })) : undefined;
    const q = query('census', t('Census'), base, [...alone(me), ...(P.birth ? alone(me, 1, 0) : [])], levelsFor(allPlaces),
      [censuses.length ? censuses.join(', ') : t('all censuses'), birth && bornText(bornFields.birth_year_from, bornFields.birth_year_to)], goal ? { goal } : {});
    if (lifeFrom && !censuses.length) q.skip = t('No Norwegian census was taken in the person’s lifetime.');
  }

  // Emigration: emigrant protocols and other emigration sources, from birth (children
  // emigrated with their parents, each with an entry), by birth year. In all of
  // Norway: a protocol belongs to the port's police, not the emigrant's parish.
  {
    // (FS's emigration or immigration years, ±2, when it has them)
    const [from, to] = P.emigration ? [P.emigration.from, P.emigration.to] : [lifeFrom, lifeTo];
    query('emigration', t('Emigration'), { 'sc[]': 'em', ...years(from, to), ...bornFields },
      [...alone(me), ...(P.birth ? alone(me, 1, 0) : [])], chosen || [norway],
      [t('emigration sources'), span(from, to), birth && bornText(bornFields.birth_year_from, bornFields.birth_year_to)]);
  }

  // Moving away: church books' lists of people moving out of the parish (within
  // Norway too), from birth (children moved with their parents)
  query('moving', t('Moving away (church books)'), { 'lt[]': ['uf', 'fl'], ...years(lifeFrom, lifeTo) }, alone(me), levelsFor(allPlaces),
    [t('moving out of a parish'), span(lifeFrom, lifeTo)]);

  // Burial: by name, then by the given name alone when FS has the death, in the
  // death place
  {
    const [from, to] = P.death ? [P.death.from, P.death.to + 1] : [lifeFrom, lifeTo];
    const q = query('burial', t('Burial'), { 'roles[]': 'avdød', ...years(from, to) }, [...alone(me), ...(P.death ? alone(me, 1, 0) : [])],
      levelsFor(P.deathPlace ? [P.deathPlace] : allPlaces), [as(['avdød']), span(from, to)]);
    if (outsideNorway(P.deathPlace)) q.skip = t('Died outside Norway ({place}).', { place: P.deathPlace });
    else if (left) q.skip = t('After {what}, and FS has no death in Norway.', { what: emigrated });
  }

  // Records at each farm (DA's domicile), under the given name: they find the person
  // whatever the patronymic's spelling
  P.farms.slice(0, 2).forEach((farm, k) => {
    query('farm' + (k ? '-' + k : ''), t('Records at {farm}', { farm }), years(lifeFrom, lifeTo),
      [{ fields: { firstname: given, domicile: farm }, text: t('{name} at {farm}', { name: given, farm }), reasons: [t('farm {farm}', { farm })] }],
      levelsFor(allPlaces), [span(lifeFrom, lifeTo)]);
  });

  // Everything else under the name, over the person's lifetime
  query('other', t('All records under the name'), years(lifeFrom, lifeTo), alone(me), levelsFor(allPlaces), [span(lifeFrom, lifeTo)]);

  // Other names to fall back on while a query's goal isn't met, in order: the
  // patronymic from the father (FS's patronymics are sometimes guesses), FS's
  // alternate names, and other spellings of the patronymic stem; at most three
  const variants = [];
  {
    const candidates = [
      P.patronymic && { firstname: given, lastname: searchStem(P.patronymic) },
      ...P.alternates.map((a) => ({ firstname: givenStem(a.given), lastname: searchStem(a.surname) || stem })),
      ...[P.surname, ...P.alternates.map((a) => a.surname)].flatMap(surnameSpellings).map((lastname) => ({ firstname: given, lastname }))
    ];
    const seen = new Set([given + ' ' + stem]);
    for (const c of candidates) {
      if (!c || !c.lastname) continue;
      const text = c.firstname + ' ' + c.lastname;
      if (seen.has(text) || variants.length >= 3) continue;
      seen.add(text);
      variants.push({ fields: c, text });
    }
  }

  // Queries searching on the person's full name get the other names as fallback
  // steps (instead of the person's name in the first step that has it, then in the
  // step of the person alone: a record can name the person by another name and the
  // relative by another given name). Record kinds turned off in the sidebar
  // (criteria.off) aren't run.
  const off = criteria.off || [];
  for (const q of queries) {
    q.kind = q.id.replace(/-.*$/, '');
    const mine = (s) => s.fields.lastname === stem && s.fields.firstname === given;
    const named = stem && q.steps.find(mine);
    const lone = named && q.steps.find((s) => s !== named && mine(s) && Object.keys(s.fields).every((k) => k === 'firstname' || k === 'lastname'));
    for (const base of [named, lone].filter(Boolean)) {
      for (const v of variants) {
        q.steps.push({ ...base, fields: { ...base.fields, ...v.fields }, text: base.text.replace(nameText, v.text), fallback: true });
      }
    }
    q.params = q.steps.length ? withFields(withFields(q.base, q.steps[0].fields), q.levels[0].fields) : q.base;
    if (chosen) q.summary += (q.summary ? ' · ' : '') + t('in {places}', { places: chosen[0].text });
    if (off.includes(q.kind) && !q.skip) q.skip = t('Turned off under Record kinds.');
  }
  return queries;
}

// DA's own page for a query (to open in a tab)
function daSearchUrl(params, page = 1) {
  const p = new URLSearchParams(params);
  if (page > 1) p.set('page', page);
  return DA_SEARCH_URL + '?' + p.toString();
}

// --- Fetching and parsing -----------------------------------------------------------------

const clean = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
// A result field without its label ("H: 1867" → "1867")
const field = (unit, selector) => {
  const el = unit.querySelector(selector);
  if (!el) return '';
  const label = el.querySelector('span');
  return clean(el).slice(label && !label.classList.contains('gender') ? clean(label).length : 0).trim();
};

// A DA result page → { total, hits: [...] }
function parseResults(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const hits = [...doc.querySelectorAll('#searchResultList .unit')].map((unit) => {
    const link = unit.querySelector('.name a');
    const href = link ? link.getAttribute('href') : '';
    const id = (href.match(/\/([a-z]{2}\d{14,})(?:[/?#]|$)/) || [])[1] || '';
    const born = clean(unit.querySelector('.name .born'));
    const sourceLink = unit.querySelector('.source a');
    const role = field(unit, '.role');
    return {
      id: id,
      url: href ? new URL(href, DA_SEARCH_URL).toString() : '',
      type: RECORD_TYPES[id.slice(0, 2)] || 'Other',
      name: clean(link).replace(born, '').trim(),
      born: born.replace(/^\(b\.\s*|\)$/g, ''),
      gender: /female/i.test(clean(unit.querySelector('.gender'))) ? 'Female' : /male/i.test(clean(unit.querySelector('.gender'))) ? 'Male' : '',
      domicile: field(unit, '.place'),
      date: field(unit, '.action'),
      position: field(unit, '.stilling-stand'),
      role: role in ROLES ? ROLES[role] : role,
      source: clean(sourceLink),
      sourceUrl: sourceLink ? new URL(sourceLink.getAttribute('href'), DA_SEARCH_URL).toString() : ''
    };
  });
  // "Your search resulted in N hits" is missing when there's only one
  const count = clean(doc.body).match(/resulted in ([\d\s,.]+) hits?/i);
  const total = count ? Number(count[1].replace(/\D/g, '')) : hits.length;
  return { total: total, hits: hits };
}

// --- Whether DA answers ----------------------------------------------------------
// When DA is down (a request fails with 5xx, no answer or a network error, and its
// front page fails too) or refuses requests (403, 429), no page of the extension asks
// it again before a pause is over: search.html and linker.html share it through
// localStorage (one origin). The first request after the pause tries again, and one
// that succeeds ends it. "Try again now" (clearDaPause()) ends it at once.
const DA_PAUSE_KEY = 'arkivet2fs.daPause';
const DA_DOWN_PAUSE_MS = 5 * 60 * 1000;
const DA_REFUSED_PAUSE_MS = 15 * 60 * 1000;
const DA_TIMEOUT_MS = 30000;  // a page DA hasn't sent by then isn't coming
const DA_HOME_URL = 'https://www.digitalarkivet.no/en/';

// The pause in force: {kind: 'down' | 'refused', status, since, until}, or null
function daPause() {
  try {
    const pause = JSON.parse(localStorage.getItem(DA_PAUSE_KEY) || 'null');
    return pause && pause.until > Date.now() ? pause : null;
  } catch (e) {
    return null;  // storage unavailable: no pause
  }
}

function setDaPause(kind, status) {
  const since = Date.now();
  const pause = { kind, status: String(status), since, until: since + (kind === 'refused' ? DA_REFUSED_PAUSE_MS : DA_DOWN_PAUSE_MS) };
  try { localStorage.setItem(DA_PAUSE_KEY, JSON.stringify(pause)); } catch (e) { /* unavailable */ }
  return pause;
}

function clearDaPause() {
  try { localStorage.removeItem(DA_PAUSE_KEY); } catch (e) { /* unavailable */ }
}

// A time of day as "14:05"
function daClock(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// The error for a pause: error.unavailable (down) or error.refused; error.paused when
// this request wasn't sent. Pages stop asking DA on either (daStopped()).
function daPauseError(pause, paused) {
  const params = { status: pause.status, since: daClock(pause.since), until: daClock(pause.until) };
  const down = pause.kind !== 'refused';
  const error = new Error(paused
    ? (down ? t('Digital Arkivet was not answering at {since} ({status}). No requests are sent to it until {until}.', params)
      : t('Digital Arkivet refused requests at {since} ({status}). No requests are sent to it until {until}.', params))
    : (down ? t('Digital Arkivet is not answering ({status}), and its front page fails too: it seems to be down. No more requests are sent to it until {until}.', params)
      : t('Digital Arkivet is refusing requests ({status}). No more requests are sent to it until {until}.', params)));
  error.unavailable = down;
  error.refused = !down;
  error.paused = !!paused;
  error.until = pause.until;
  return error;
}

// Whether an error means DA isn't to be asked again for now
function daStopped(error) {
  return !!(error && (error.unavailable || error.refused));
}

function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

let lastRequest = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One request to DA, spaced out from the last: the response, or {failure} (no
// answer in time, or a network error) as text
async function daRequest(url, options = {}) {
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  try {
    return await fetch(url, { credentials: 'omit', signal: timeoutSignal(options.timeout || DA_TIMEOUT_MS), ...(options.init || {}) });
  } catch (e) {
    return { failure: e && e.name === 'TimeoutError' ? t('no answer in {n} s', { n: Math.round((options.timeout || DA_TIMEOUT_MS) / 1000) }) : (e && e.message) || String(e) };
  }
}

// Whether DA's front page loads: asked once after a request failed, to tell DA down
// from one page failing
async function daAnswers() {
  const response = await daRequest(DA_HOME_URL, { timeout: 15000, init: { cache: 'no-store' } });
  return !response.failure && response.ok;
}

// Fetch one result page (or record page), spaced out from the last request and
// cached for the session (unless `store` is false: da_verify.js keeps a record's
// extract instead of its page). While DA is paused (daPause()), only cached pages.
async function fetchResultPage(url, store = true) {
  // Only DA's pages (record addresses come from the page's address and from DA's own links)
  let host = '';
  try { const u = new URL(url); if (u.protocol === 'https:') host = u.hostname; } catch (e) { /* not an address */ }
  if (host !== 'www.digitalarkivet.no') throw new Error(t('Not a Digital Arkivet address: {url}', { url: String(url).slice(0, 200) }));
  try {
    const cached = sessionStorage.getItem('da:' + url);
    if (cached) return cached;
  } catch (e) { /* storage unavailable */ }
  const pause = daPause();
  if (pause) throw daPauseError(pause, true);
  const response = await daRequest(url);
  if (!response.failure && (response.status === 403 || response.status === 429)) {
    throw daPauseError(setDaPause('refused', response.status), false);
  }
  if (response.failure || response.status >= 500) {
    const status = response.failure || String(response.status);
    if (!(await daAnswers())) throw daPauseError(setDaPause('down', status), false);
    // DA answers: only this page failed
    throw new Error(response.failure ? t('Digital Arkivet did not answer ({status}).', { status }) : t('Digital Arkivet answered {status}.', { status }));
  }
  if (!response.ok) throw new Error(t('Digital Arkivet answered {status}.', { status: response.status }));
  clearDaPause();
  const html = await response.text();
  if (store) try { sessionStorage.setItem('da:' + url, html); } catch (e) { /* full or unavailable */ }
  return html;
}

// `params` with `fields` set (replacing what they had)
function withFields(params, fields) {
  const p = new URLSearchParams(params);
  for (const [key, value] of Object.entries(fields)) {
    p.delete(key);
    for (const v of [].concat(value)) if (v) p.append(key, v);
  }
  return p;
}

const firstPage = async (params) => parseResults(await fetchResultPage(daSearchUrl(params)));

// The order of a query's searches: a step with a surname (the person's or a
// relative's, or a farm) is "named". First the named steps at each place level,
// narrowest first (the parish, then its county); then, while nothing is found, the
// named steps in all of Norway (a rare surname is found anywhere; a step that
// counts for the goal, the couple, while the goal isn't met); then, while the
// goal isn't met (a child's baptism or a census still missing), the other names
// (fallback steps) in the widest of those places; last, the steps by given names only, in the narrowest place: they find
// everyone of that name, so in the county they'd bury the person's records (and
// meet the goal with other people's) before the named steps had widened.
// → [{ step, level, ifNone }]
function searchPlan(query) {
  const local = query.levels.filter((l) => !l.fallback);
  const wide = query.levels.filter((l) => l.fallback);
  const named = (s) => Boolean(s.fields.lastname || s.fields.related_last_name || s.fields.domicile);
  const main = query.steps.filter((s) => !s.fallback);
  // (with no surname anywhere, every step widens)
  const strict = main.some(named) ? main.filter(named) : main;
  const loose = main.filter((s) => !strict.includes(s));
  const plan = [];
  for (const level of local) for (const step of strict) plan.push({ step, level });
  const widest = local[local.length - 1] || wide[0];
  for (const level of wide) for (const step of strict) plan.push({ step, level, ifNone: !(query.counts && query.counts(step)) });
  for (const step of query.steps.filter((s) => s.fallback)) plan.push({ step, level: widest });
  for (const step of loose) plan.push({ step, level: local[0] || wide[0] });
  return plan;
}

// Run a query's searches in searchPlan()'s order until the goal is met. A search
// finding more hits than are read (MAX_PAGES pages) isn't read: most would be other
// people, the stricter steps find the person's, and it isn't run at the wider
// levels either. With `counts(step)`, only the hits of the steps it accepts count
// for the goal and as found (`ifNone`); the others are still listed.
// → { found: [{ step, hits }], searches: [{ step, place, total, read, params }], missing }
async function runQuery(query) {
  const limit = readLimit();
  const found = [], searches = [], all = [];
  const tooMany = new Set();
  let missing = query.goal([]);
  for (const { step, level, ifNone } of searchPlan(query)) {
    if (!missing.length) break;
    if ((ifNone && all.length) || tooMany.has(step)) continue;
    const params = withFields(withFields(query.base, step.fields), level.fields);
    const first = await firstPage(params);
    const search = { step: step.text, place: level.text, total: first.total, read: 0, params };
    searches.push(search);
    if (first.total > limit) { tooMany.add(step); continue; }
    if (!first.total) continue;
    const hits = first.hits.slice();
    for (let page = 2; page <= Math.ceil(first.total / RESULTS_PER_PAGE); page++) {
      hits.push(...parseResults(await fetchResultPage(daSearchUrl(params, page))).hits);
    }
    search.read = hits.length;
    found.push({ step, hits });
    if (!query.counts || query.counts(step)) all.push(...hits);
    missing = query.goal(all);
  }
  return { found, searches, missing };
}
