// DigitalArkivet person search (Phase 2): builds DA advanced-search queries from the
// search page's criteria, fetches the result pages and parses the hits.
// Used by search.js; uses municipalityCodes(), municipalityName(), countyCodes() and
// countyName() from da_places.js; no DOM access except DOMParser.
//
// What DA's advanced search does with names (tested November 2026):
// - It adds its own name variants (Jon → Joen, John), but not for patronymic endings.
// - A trailing * works, and DA still applies its variants to the stem (Christ* finds
//   Kristian). A * inside a word or a ? doesn't ("J*n", "Tol*fs*", "Lindem?n").
// - DA doesn't treat Anna and Anne, or Magdaline and Magdalene, as variants; cutting
//   the final vowel does (Ann*, Magdalin*). See givenStem().
// - firstname matches each of its words against any given name ("Magdalin*" finds
//   "Anna Magdalena"), and every word must match: "Ann* Magdalin*" finds
//   "Anne Magdalen" but not "Anne". Records often leave out a middle name, so only
//   the own baptism also searches by the first two given names.
// - Transcribed parents' names can be far off: Anna Lindeman's parents Johannes
//   Lindeman and Gjertrud Johanne are "Johanne Olsen" and "Johanne Stubbe" on her
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

// Patronymic: genitive s + ending (-sen/-søn/-son, -datter/-dotter, -dtr., -dr., -d.)
const PATRONYMIC_ENDING = /(s)(en|øn|on|datter|dotter|dtr\.?|dr\.?|d\.)$/i;

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
// The father's name in a patronymic (Halvorsen → Knud, Olsdr. → Ol)
function patronymicBase(surname) { return (surname || '').replace(PATRONYMIC_ENDING, ''); }

// Given name for a DA search: without its final vowel(s), with a trailing *, so
// spellings DA doesn't treat as variants match too (Anna → Ann*, finding Anne;
// Magdaline → Magdalin*, finding Magdalene and Magdalena). Names that don't end in a
// vowel, or would be cut below 3 letters, are used as they are, with DA's own
// variants (Jon → Joen, John; Johannes → Johanes; Ole).
function givenStem(name) {
  const s = (name || '').trim().replace(/[.,]$/, '');
  if (!s || /[\s*]/.test(s)) return s;
  const cut = s.replace(/[aeiouyæøå]+$/i, '');
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
  ['kirsti', 'kirsten', 'kjersti', 'kjerstin', 'kristin', 'kerstin'],
  ['kari', 'karen', 'karin'],
  ['guri', 'gudrid', 'gurid'],
  ['gudbrand', 'gulbrand', 'gubrand'],
  ['knud', 'knut'],
  ['ole', 'ola', 'olav', 'olaf', 'oluf'],
  ['iver', 'ivar'],
  ['halvor', 'halvard', 'halvar'],
  ['torkel', 'torkjel', 'thorkel', 'torkild', 'thorkild'],
  ['torstein', 'thorstein', 'tosten', 'torsten', 'thosten'],
  ['gjertrud', 'gjertru', 'gertrud'],
  ['ragnhild', 'ragnild', 'rangdi', 'ragni'],
  ['engebret', 'engebrigt', 'ingebret', 'ingebrigt'],
  ['eli', 'elin']
];

// The forms of a given name (its group, or just the name), lowercase
function nameForms(name) {
  const n = (name || '').toLowerCase().replace(/[.,*]/g, '').trim();
  return GIVEN_NAME_FORMS.find((group) => group.includes(n)) || (n ? [n] : []);
}

// A relative's given name for related_first_name: the shared start of its forms
// (Ingeborg → Ing*, finding Ingbjør), otherwise givenStem()
function relatedStem(name) {
  const forms = nameForms(name);
  if (forms.length > 1) {
    let start = forms[0];
    for (const f of forms) while (!f.startsWith(start)) start = start.slice(0, -1);
    if (start.length >= 3) return name.trim()[0] + start.slice(1) + '*';
  }
  return givenStem(name);
}

// Irregular patronymics: Ole → Olsen
const PATRONYMIC_BASE = { ole: 'Ol', ola: 'Ol' };

// Patronymic stems that are spellings of one name but that DA doesn't treat as
// variants (Johans* and Johannes* find different records). DA itself handles ch/k
// (Torchels* = Torkels*) and doubled letters (Ols* = Olss*).
const PATRONYMIC_SPELLINGS = [
  ['johannes', 'johans'], ['peders', 'pers'], ['christens', 'christians'],
  ['anders', 'andres'], ['halvors', 'halvards'], ['gulbrands', 'gudbrands']
];

// A patronymic stem's other spellings (Johans* → Johannes*)
function patronymicSpellings(stem) {
  const s = stem.replace(/\*$/, '');
  const group = PATRONYMIC_SPELLINGS.find((list) => list.some((p) => s.toLowerCase().startsWith(p)));
  if (!group) return [];
  const own = group.find((p) => s.toLowerCase().startsWith(p));
  const rest = s.slice(own.length);
  return group.filter((p) => p !== own).map((p) => s[0] + p.slice(1) + rest + '*');
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
  const b = first('birth'), m = first('marriage'), d = first('death');
  // A relative turned off in the sidebar (q.fatherSkip, ...) isn't used at all
  const relative = (r, prefix) => (r[prefix + 'Skip'] ? { given: '', surname: '' }
    : { given: (r[prefix + 'GivenName'] || '').trim(), surname: (r[prefix + 'Surname'] || '').trim() });
  const P = {
    given: firstWord(names[0] && names[0].givenName),
    givenNames: ((names[0] && names[0].givenName) || '').trim().split(/\s+/).filter(Boolean),
    givens: unique(names.map((n) => firstWord(n.givenName)).filter(Boolean)),
    surname: ((names[0] && names[0].surname) || '').trim(),
    surnames: unique(names.map((n) => (n.surname || '').trim()).filter(Boolean)),
    sex: first('sex').sex || '',
    birth: range(b['birthLikeDate.from'], b['birthLikeDate.to']), birthPlace: (b.birthLikePlace || '').trim(),
    marriage: range(m['marriageLikeDate.from'], m['marriageLikeDate.to']), marriagePlace: (m.marriageLikePlace || '').trim(),
    death: range(d['deathLikeDate.from'], d['deathLikeDate.to']), deathPlace: (d.deathLikePlace || '').trim(),
    father: relative(first('father'), 'father'),
    mother: relative(first('mother'), 'mother'),
    spouses: criteria.spouse.map((s) => relative(s, 'spouse')).filter((s) => s.given),
    children: criteria.child.filter((c) => !c.childSkip).map((c) => ({ ...relative(c, 'child'), year: year(c.childBirthYear) })).filter((c) => c.given || c.year),
    residences: criteria.residence.map((r) => (r.residencePlace || '').trim()).filter(Boolean),
    farms: criteria.farm.map((f) => (f.farm || '').trim()).filter(Boolean)
  };
  P.places = unique([P.birthPlace, P.marriagePlace, P.deathPlace, ...P.residences].filter(Boolean));
  P.estBirth = estimatedBirth(P);
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
// Anna Lindeman's 1870 census. Sex is used for scoring instead.
function buildQueries(criteria) {
  const P = profile(criteria);
  const queries = [];
  if (!P.given && !P.surname) return queries;

  const stem = surnameStem(P.surname);
  const [lifeFrom, lifeTo] = lifetime(P);
  const span = (from, to) => (from || to ? (from || '…') + '–' + (to || '…') : 'any year');
  const given = givenStem(P.given);
  const nameText = [given, stem].filter(Boolean).join(' ');
  const byRole = (male, female) => (P.sex === 'Male' ? [male] : P.sex === 'Female' ? [female] : [male, female]);
  const roleText = { brudgom: 'groom', brud: 'bride', far: 'father', mor: 'mother', barn: 'child', konfirmant: 'confirmand', 'avdød': 'deceased',
    brudgommensfar: "groom's father", brudensfar: "bride's father" };
  const as = (roles) => 'as ' + roles.map((r) => roleText[r]).join(' or ');
  // FS's birth, or the one estimated from the marriage and children (shown as "about")
  const birth = P.birth || P.estBirth;
  const bornText = (from, to) => (P.birth ? 'born ' : 'born about ') + span(from, to);
  const years = (from, to) => ({ event_year_from: from, event_year_to: to });
  const bornFields = birth ? { birth_year_from: birth.from - 3, birth_year_to: birth.to + 3 } : {};
  const hitYear = (hit) => Number(((hit.date || '') + ' ' + (hit.source || '')).match(/\b(1[5-9]\d\d)\b/)?.[1]) || null;
  const listText = (names) => names.join(', ').replace(/, ([^,]*)$/, ' or $1');

  // Where: the places chosen under Where to search (DA finds records in any of the
  // chosen counties and municipalities), or the municipalities of the event's FS
  // places, then their counties, then all of Norway while nothing is found
  const picked = criteria.where || { m: [], c: [] };
  const chosen = picked.m.length || picked.c.length ? [{
    fields: { 'm[]': picked.m, 'c[]': picked.c },
    text: listText([...picked.c.map(countyName), ...picked.m.map(municipalityName)])
  }] : null;
  const norway = { fields: {}, text: 'Norway' };
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
  // surname: Ing* Lars* for Ingrid Larsdr) as related person
  const me = { first: given, last: stem };
  const relative = (r, relation, roles) => r && r.given ? {
    relation, roles, first: relatedStem(firstWord(r.given)), last: r.surname ? surnameStem(r.surname) : '',
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
      reasons: [who.relation + ' ' + (foldName(names) === foldName(fs) ? fs : names + ' for ' + fs)]
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
  const pairSteps = (a, b) => {
    const steps = [];
    for (const [af, al, bf, bl] of [[1, 1, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 0], [1, 1, 0, 1], [1, 0, 1, 0]]) {
      const pa = part(a, af, al), pb = part(b, bf, bl);
      if (!pa || !pb) continue;
      steps.push(step(a === me ? [pa, pb] : [pb, pa]));
    }
    return steps;
  };
  const alone = (who, first = 1, last = 1) => { const p = part(who, first, last); return p ? [step([p])] : []; };

  // A query; arrays in fields are repeated fields, empty values are left out
  const query = (id, title, base, steps, levels, summary, extra = {}) => {
    const seen = new Set();
    const q = {
      id, title, base: withFields(new URLSearchParams(), base), levels, reasons: [],
      steps: steps.filter((s) => { const key = withFields(new URLSearchParams(), s.fields).toString(); return !seen.has(key) && seen.add(key); }),
      summary: summary.filter(Boolean).join(' · '),
      goal: (hits) => (hits.length ? [] : ['a record']),
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
    const parents = [relative(P.father, 'father', ['far']), relative(P.mother, 'mother', ['mor'])].filter(Boolean);
    const pairs = parents.map((r) => pairSteps(r, { first: given }));
    // (two given names find fewer children than one and a parent's given name)
    const two = P.givenNames.length > 1 ? P.givenNames.slice(0, 2).map(givenStem).join(' ') : '';
    const steps = [...pairs.map((p) => p[0]), ...(P.birth && two ? alone({ first: two }, 1, 0) : []),
      ...pairs.map((p) => p[1]), ...(P.birth ? alone(me, 1, 0) : [])].filter(Boolean);
    const q = query('baptism', 'Baptism', { 'roles[]': 'barn', ...years(from, to) }, steps,
      levelsFor(P.birthPlace ? [P.birthPlace] : allPlaces), [as(['barn']), span(from, to)]);
    if (!steps.length) q.skip = 'Add the father or mother, or a birth year, to search for the baptism.';
  }

  // Confirmation, usually at 14–16: by name, with the father (some confirmations
  // name him), and by the given name alone, in the birthplace and residences
  {
    const from = birth && birth.from + 13, to = birth && birth.to + 20;
    const father = relative(P.father, 'father', []);
    const steps = [...alone(me), ...(father ? pairSteps(father, { first: given }).slice(0, 2) : []), ...alone(me, 1, 0)];
    const q = query('confirmation', 'Confirmation', { 'roles[]': 'konfirmant', ...years(from, to) }, steps,
      levelsFor([P.birthPlace, ...P.residences]), [as(['konfirmant']), span(from, to)]);
    if (!birth) q.skip = 'Add a birth year to search for the confirmation.';
  }

  // Marriage: one query per spouse, the spouse as related person (bride's surname
  // relaxed first), then the person alone (any spouse), in the FS marriage place
  {
    const [from, to] = P.marriage ? [P.marriage.from - 1, P.marriage.to + 1]
      : birth ? [birth.from + 16, Math.min(birth.to + 60, lifeTo)] : [lifeFrom, lifeTo];
    const roles = byRole('brudgom', 'brud');
    const spouses = P.spouses.length ? P.spouses : [null];
    const levels = levelsFor(P.marriagePlace ? [P.marriagePlace] : allPlaces);
    spouses.forEach((spouse, k) => {
      const s = relative(spouse, 'spouse', []);
      query('marriage' + (k ? '-' + k : ''), spouse ? 'Marriage to ' + spouse.given : 'Marriage', { 'roles[]': roles, ...years(from, to) },
        [...(s ? pairSteps(s, me) : []), ...alone(me)], levels, [as(roles), span(from, to)]);
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
    // The spouse's role is the other parent's: mother for a man, father for a woman
    const other = P.sex === 'Male' ? ['mor'] : P.sex === 'Female' ? ['far'] : ['far', 'mor'];
    const relation = other.map((r) => roleText[r]).join(' or ');
    const known = P.children.filter((c) => c.year);
    const goal = known.length ? (hits) => known.filter((c) => !hits.some((h) => {
      const y = hitYear(h);
      return (h.role === 'Father' || h.role === 'Mother') && y >= c.year && y <= c.year + 1;
    })).map((c) => 'a baptism for ' + [c.given, '(b. ' + c.year + ')'].filter(Boolean).join(' ')) : undefined;
    const levels = levelsFor([P.marriagePlace, ...P.residences, P.birthPlace]);
    const spouses = P.spouses.length ? P.spouses : [null];
    spouses.forEach((spouse, k) => {
      const s = relative(spouse, relation, other);
      const steps = s ? (P.sex === 'Female' ? pairSteps(me, s) : pairSteps(s, me)) : [];
      query('children' + (k ? '-' + k : ''), spouse ? "Children's baptisms with " + spouse.given : "Children's baptisms",
        { 'roles[]': roles, ...years(from, to) }, [...steps, ...alone(me)], levels,
        [as(roles), span(from, to)], goal ? { goal } : {});
    });
  }

  // Children's marriages: church books name the couple's fathers (not mothers), so FS
  // often has a man's sources as groom's or bride's father. From the eldest known
  // child's 16th year (or the person's 36th) to 45 years after the youngest's birth.
  {
    const roles = ['brudgommensfar', 'brudensfar'];
    const childYears = P.children.map((c) => c.year).filter(Boolean);
    const from = childYears.length ? Math.min(...childYears) + 16 : birth ? birth.from + 36 : lifeFrom;
    const to = childYears.length ? Math.max(...childYears) + 45 : lifeTo;
    const q = query('childmarriage', "Children's marriages", { 'roles[]': roles, ...years(from, to) }, alone(me),
      levelsFor(allPlaces), [as(roles), span(from, to)]);
    if (P.sex === 'Female') q.skip = 'Church books name only the fathers of a couple.';
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
    const goal = full.length ? (hits) => full.filter((y) => !hits.some((h) => hitYear(h) === y)).map((y) => 'the ' + y + ' census') : undefined;
    const q = query('census', 'Census', base, [...alone(me), ...(P.birth ? alone(me, 1, 0) : [])], levelsFor(allPlaces),
      [censuses.length ? censuses.join(', ') : 'all censuses', birth && bornText(bornFields.birth_year_from, bornFields.birth_year_to)], goal ? { goal } : {});
    if (lifeFrom && !censuses.length) q.skip = 'No Norwegian census was taken in the person’s lifetime.';
  }

  // Emigration: emigrant protocols and other emigration sources, from birth (children
  // emigrated with their parents, each with an entry), by birth year. In all of
  // Norway: a protocol belongs to the port's police, not the emigrant's parish.
  {
    const from = lifeFrom, to = lifeTo;
    query('emigration', 'Emigration', { 'sc[]': 'em', ...years(from, to), ...bornFields },
      [...alone(me), ...(P.birth ? alone(me, 1, 0) : [])], chosen || [norway],
      ['emigration sources', span(from, to), birth && bornText(bornFields.birth_year_from, bornFields.birth_year_to)]);
  }

  // Moving away: church books' lists of people moving out of the parish (within
  // Norway too), from birth (children moved with their parents)
  query('moving', 'Moving away (church books)', { 'lt[]': ['uf', 'fl'], ...years(lifeFrom, lifeTo) }, alone(me), levelsFor(allPlaces),
    ['moving out of a parish', span(lifeFrom, lifeTo)]);

  // Burial: by name, then by the given name alone when FS has the death, in the
  // death place
  {
    const [from, to] = P.death ? [P.death.from, P.death.to + 1] : [lifeFrom, lifeTo];
    const q = query('burial', 'Burial', { 'roles[]': 'avdød', ...years(from, to) }, [...alone(me), ...(P.death ? alone(me, 1, 0) : [])],
      levelsFor(P.deathPlace ? [P.deathPlace] : allPlaces), [as(['avdød']), span(from, to)]);
    if (outsideNorway(P.deathPlace)) q.skip = 'Died outside Norway (' + P.deathPlace + ').';
  }

  // Records at each farm (DA's domicile), under the given name: they find the person
  // whatever the patronymic's spelling
  P.farms.slice(0, 2).forEach((farm, k) => {
    query('farm' + (k ? '-' + k : ''), 'Records at ' + farm, years(lifeFrom, lifeTo),
      [{ fields: { firstname: given, domicile: farm }, text: given + ' at ' + farm, reasons: ['farm ' + farm] }],
      levelsFor(allPlaces), [span(lifeFrom, lifeTo)]);
  });

  // Everything else under the name, over the person's lifetime
  query('other', 'All records under the name', years(lifeFrom, lifeTo), alone(me), levelsFor(allPlaces), [span(lifeFrom, lifeTo)]);

  // Other names to fall back on while a query finds nothing, in order: the
  // patronymic from the father (FS's patronymics are sometimes guesses), FS's
  // alternate names, and other spellings of the patronymic stem; at most three
  const variants = [];
  {
    const candidates = [
      P.patronymic && { firstname: given, lastname: surnameStem(P.patronymic) },
      ...P.alternates.map((a) => ({ firstname: givenStem(a.given), lastname: surnameStem(a.surname) || stem })),
      ...[stem, ...P.alternates.map((a) => surnameStem(a.surname))].flatMap(patronymicSpellings).map((lastname) => ({ firstname: given, lastname }))
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
  // steps (instead of the person's name in the first step that has it). Record kinds
  // turned off in the sidebar (criteria.off) aren't run.
  const off = criteria.off || [];
  for (const q of queries) {
    q.kind = q.id.replace(/-.*$/, '');
    const named = stem && q.steps.find((s) => s.fields.lastname === stem && s.fields.firstname === given);
    if (named) {
      for (const v of variants) {
        q.steps.push({ ...named, fields: { ...named.fields, ...v.fields }, text: named.text.replace(nameText, v.text), fallback: true });
      }
    }
    q.params = q.steps.length ? withFields(withFields(q.base, q.steps[0].fields), q.levels[0].fields) : q.base;
    if (chosen) q.summary += (q.summary ? ' · ' : '') + 'in ' + chosen[0].text;
    if (off.includes(q.kind) && !q.skip) q.skip = 'Turned off under Record kinds.';
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

let lastRequest = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch one result page (or record page), spaced out from the last request and
// cached for the session (unless `store` is false: da_verify.js keeps a record's
// extract instead of its page)
async function fetchResultPage(url, store = true) {
  try {
    const cached = sessionStorage.getItem('da:' + url);
    if (cached) return cached;
  } catch (e) { /* storage unavailable */ }
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(response.status === 403 || response.status === 429
      ? 'Digital Arkivet is refusing requests (' + response.status + '). Wait a while and search again.'
      : 'Digital Arkivet answered ' + response.status + '.');
  }
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
// named steps in all of Norway (a rare surname is found anywhere) and the other
// names (fallback steps) in the widest of those places; last, the steps by given names only, in the narrowest place: they find
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
  for (const level of wide) for (const step of strict) plan.push({ step, level, ifNone: true });
  for (const step of query.steps.filter((s) => s.fallback)) plan.push({ step, level: widest, ifNone: true });
  for (const step of loose) plan.push({ step, level: local[0] || wide[0] });
  return plan;
}

// Run a query's searches in searchPlan()'s order until the goal is met. A search
// finding more hits than are read (MAX_PAGES pages) isn't read: most would be other
// people, the stricter steps find the person's, and it isn't run at the wider
// levels either.
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
    all.push(...hits);
    missing = query.goal(all);
  }
  return { found, searches, missing };
}
