// DigitalArkivet person search (Phase 2): builds DA advanced-search queries from the
// search page's criteria, fetches the result pages and parses the hits.
// Used by search.js; uses municipalityCodes() and municipalityName() from da_places.js; no DOM access
// except DOMParser.
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
//   the baptism by place uses more than the first given name.
// - Transcribed parents' names can be far off: Anna Lindeman's parents Johannes
//   Lindeman and Gjertrud Johanne are "Johanne Olsen" and "Johanne Stubbe" on her
//   baptism, so the baptism is also searched for by name and birthplace (m[]).
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

// A place outside Norway: FS places end with the country
const outsideNorway = (place) => !!place && !/\b(norway|norge|noreg)\s*$/i.test(place);

// --- Queries ----------------------------------------------------------------------------

// Criteria from search.js (readCriteria) → a list of queries, one per life event:
// { id, title, summary, params: URLSearchParams, reasons: [text], skip? }.
// `reasons` are what every hit of the query matched (e.g. "father Aslak"). A query with
// `skip` isn't run; `skip` says why or what's missing.
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
  // FS's birth, or the one estimated from the marriage and children (shown as "about")
  const birth = P.birth || P.estBirth;
  const bornText = (from, to) => (P.birth ? 'born ' : 'born about ') + span(from, to);

  // A query from its DA fields; arrays are repeated fields, empty values are left out
  const query = (id, title, fields, summary, extra = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      for (const v of [].concat(value)) if (v !== null && v !== undefined && v !== '') params.append(key, v);
    }
    const q = { id, title, params, summary: summary.filter(Boolean).join(' · '), reasons: [], ...extra };
    queries.push(q);
    return q;
  };
  const named = { firstname: given, lastname: stem };

  // Other names to try when a query on the name finds nothing, in order: the
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
  // Where to narrow a query that finds more hits than are read: the municipalities
  // of all the FS places
  const placeCodes = unique(P.places.flatMap(municipalityCodes));
  const narrow = placeCodes.length
    ? { fields: { 'm[]': placeCodes }, text: placeCodes.map(municipalityName).join(', ') }
    : null;
  const years = (from, to) => ({ event_year_from: from, event_year_to: to });
  // Places chosen under Where to search: every query is limited to them (DA finds
  // records in any of the chosen counties and municipalities)
  const picked = criteria.where || { m: [], c: [] };
  const chosen = picked.m.length || picked.c.length ? {
    fields: { 'm[]': picked.m, 'c[]': picked.c },
    text: [...picked.c.map(countyName), ...picked.m.map(municipalityName)].join(', ')
  } : null;

  // Own baptism: the child is usually given without a surname, so search on the first
  // given name and a parent. The parent's surname is used only when it's a family
  // name; patronymics are spelled too many ways.
  if (P.given) {
    const parent = P.father.given ? { role: 'father', ...P.father } : P.mother.given ? { role: 'mother', ...P.mother } : null;
    const from = P.birth && P.birth.from, to = P.birth && P.birth.to + 1; // baptism can fall in the next year
    const fields = { firstname: given, 'roles[]': 'barn', ...years(from, to) };
    let relative = '';
    if (parent) {
      fields.related_first_name = relative = relatedStem(firstWord(parent.given));
      if (parent.surname && !isPatronymic(parent.surname)) {
        fields.related_last_name = surnameStem(parent.surname);
        relative += ' ' + fields.related_last_name;
      }
    }
    const q = query('baptism', 'Baptism', fields,
      [given + ' as child', parent && parent.role + ' ' + relative, span(from, to)]);
    if (parent) q.reasons.push(parent.role + ' ' + relative);
    // A given name and years alone match thousands of baptisms
    else q.skip = 'Add the father or mother to search for the baptism by parent.';
  }

  // Own baptism by name and birthplace, for when the parents are unknown or were
  // transcribed differently: up to two given names (all must match), the
  // municipalities the FS birthplace names, and the birth years
  // (or the places chosen under Where to search)
  if (P.given) {
    const from = P.birth && P.birth.from, to = P.birth && P.birth.to + 1;
    const codes = chosen ? [] : municipalityCodes(P.birthPlace);
    const givens = P.givenNames.slice(0, 2).map(givenStem).join(' ');
    const where = chosen ? chosen.text : codes.map(municipalityName).join(', ');
    const q = query('baptism-place', chosen ? 'Baptism in the chosen places' : 'Baptism by birthplace',
      { firstname: givens, 'roles[]': 'barn', ...years(from, to), 'm[]': codes },
      [givens + ' as child', !chosen && where, span(from, to)]);
    if (where) q.reasons.push('baptised in ' + where.replace(/, ([^,]*)$/, ' or $1'));
    if (!P.birth) q.skip = 'Add a birth year to search for the baptism by birthplace.';
    else if (!where) q.skip = P.birthPlace ? 'No DA municipality in the birthplace (' + P.birthPlace + ').' : 'Add a birthplace to search for the baptism by birthplace.';
  }

  // Confirmation, usually at 14–16
  {
    const from = birth && birth.from + 13, to = birth && birth.to + 20;
    const q = query('confirmation', 'Confirmation', { ...named, 'roles[]': 'konfirmant', ...years(from, to) },
      [nameText + ' as confirmand', span(from, to)]);
    if (!birth) q.skip = 'Add a birth year to search for the confirmation.';
  }

  // Marriage: one query per spouse, with the spouse's first name (the stem of its
  // forms: Ing* for Ingeborg) as related person, and one in the FS marriage place
  // without the spouse, for a spouse's name transcribed beyond that
  {
    const [from, to] = P.marriage ? [P.marriage.from - 1, P.marriage.to + 1]
      : birth ? [birth.from + 16, Math.min(birth.to + 60, lifeTo)] : [lifeFrom, lifeTo];
    const roles = byRole('brudgom', 'brud');
    const spouses = P.spouses.length ? P.spouses : [null];
    spouses.forEach((spouse, k) => {
      const related = spouse ? relatedStem(firstWord(spouse.given)) : '';
      const q = query('marriage' + (k ? '-' + k : ''), spouse ? 'Marriage to ' + spouse.given : 'Marriage',
        { ...named, 'roles[]': roles, related_first_name: related, ...years(from, to) },
        [nameText + ' as ' + roles.map((r) => roleText[r]).join(' or '), related && 'spouse ' + related, span(from, to)]);
      // The reason names FS's spouse, with the stem when it's wider (Ing* for Ingeborg)
      const spouseName = spouse && firstWord(spouse.given);
      if (related) q.reasons.push('spouse ' + (foldName(related) === foldName(spouseName) ? spouseName : related + ' for ' + spouseName));
    });
    const codes = chosen ? [] : municipalityCodes(P.marriagePlace);
    if (P.spouses.length && P.marriage && codes.length) {
      const where = codes.map(municipalityName).join(', ');
      query('marriage-place', 'Marriage in ' + where, { ...named, 'roles[]': roles, ...years(from, to), 'm[]': codes },
        [nameText + ' as ' + roles.map((r) => roleText[r]).join(' or '), 'any spouse', span(from, to)]);
    }
  }

  // Children's baptisms: the person as father or mother. Finds children FS doesn't
  // know of too; the known ones are matched by birth year when scoring.
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
    query('children', "Children's baptisms", { ...named, 'roles[]': roles, ...years(from, to) },
      [nameText + ' as ' + roles.map((r) => roleText[r]).join(' or '), span(from, to)]);
  }

  // Children's marriages: church books name the couple's fathers (not mothers), so FS
  // often has a man's sources as groom's or bride's father. From the eldest known
  // child's 16th year (or the person's 36th) to 45 years after the youngest's birth.
  {
    const roles = ['brudgommensfar', 'brudensfar'];
    const childYears = P.children.map((c) => c.year).filter(Boolean);
    const from = childYears.length ? Math.min(...childYears) + 16 : birth ? birth.from + 36 : lifeFrom;
    const to = childYears.length ? Math.max(...childYears) + 45 : lifeTo;
    const q = query('childmarriage', "Children's marriages", { ...named, 'roles[]': roles, ...years(from, to) },
      [nameText + ' as ' + roles.map((r) => roleText[r]).join(' or '), span(from, to)]);
    if (P.sex === 'Female') q.skip = 'Church books name only the fathers of a couple.';
  }

  // Censuses taken in the person's lifetime. Census rows give a birth year (worked
  // out from the age), so filter on it: a census lists everyone.
  {
    const censuses = lifeFrom ? Object.keys(CENSUS_YEARS).map(Number).filter((y) => y >= lifeFrom && y <= lifeTo) : [];
    const born = birth ? { birth_year_from: birth.from - 3, birth_year_to: birth.to + 3 } : {};
    const q = query('census', 'Census',
      { ...named, ...(lifeFrom ? { 'jt[]': censuses.map((y) => CENSUS_YEARS[y]) } : { 'sc[]': 'ft' }), ...born },
      [nameText, censuses.length ? censuses.join(', ') : 'all censuses', birth && bornText(born.birth_year_from, born.birth_year_to)]);
    if (lifeFrom && !censuses.length) q.skip = 'No Norwegian census was taken in the person’s lifetime.';
  }

  // Emigration: emigrant protocols and other emigration sources, from birth (children
  // emigrated with their parents, each with an entry), by birth year
  {
    const from = lifeFrom, to = lifeTo;
    const born = birth ? { birth_year_from: birth.from - 3, birth_year_to: birth.to + 3 } : {};
    query('emigration', 'Emigration', { ...named, 'sc[]': 'em', ...years(from, to), ...born },
      [nameText, 'emigration sources', span(from, to), birth && bornText(born.birth_year_from, born.birth_year_to)]);
  }

  // Moving away: church books' lists of people moving out of the parish (within
  // Norway too), from birth (children moved with their parents)
  {
    const from = lifeFrom, to = lifeTo;
    query('moving', 'Moving away (church books)', { ...named, 'lt[]': ['uf', 'fl'], ...years(from, to) },
      [nameText, 'moving out of a parish', span(from, to)]);
  }

  // Burial
  {
    const [from, to] = P.death ? [P.death.from, P.death.to + 1] : [lifeFrom, lifeTo];
    const q = query('burial', 'Burial', { ...named, 'roles[]': 'avdød', ...years(from, to) },
      [nameText + ' as deceased', span(from, to)]);
    if (outsideNorway(P.deathPlace)) q.skip = 'Died outside Norway (' + P.deathPlace + ').';
  }

  // Records at each farm (DA's domicile), under the given name: they find the person
  // whatever the patronymic's spelling
  P.farms.slice(0, 2).forEach((farm, k) => {
    const q = query('farm' + (k ? '-' + k : ''), 'Records at ' + farm, { firstname: given, domicile: farm, ...years(lifeFrom, lifeTo) },
      [given + ' at ' + farm, span(lifeFrom, lifeTo)]);
    q.reasons.push('farm ' + farm);
  });

  // Everything else under the name, over the person's lifetime
  query('other', 'All records under the name', { ...named, ...years(lifeFrom, lifeTo) },
    [nameText, span(lifeFrom, lifeTo)]);

  // Queries on the name get the other names to fall back on; queries without a
  // place filter get the FS places to narrow to, or the chosen places instead.
  // Record kinds turned off in the sidebar (criteria.off) aren't run.
  const off = criteria.off || [];
  for (const q of queries) {
    q.kind = q.id.replace(/-.*$/, '');
    if (q.params.has('lastname')) q.variants = variants;
    if (chosen) {
      q.params = withFields(q.params, chosen.fields);
      q.summary += ' · in ' + chosen.text;
    } else if (narrow && !q.params.has('m[]')) q.narrow = narrow;
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

// Run a query → { total, hits, params, notes }: up to MAX_PAGES result pages of the
// search actually used. Finding more hits than it reads, it narrows to the FS
// places, unless that leaves none. Finding nothing, it tries the query's variants
// (other names) in turn, but only uses one that finds no more hits than are read
// (after narrowing): more are mostly other people. `params` is the search used;
// `notes` say what changed.
async function runQuery(query) {
  const limit = MAX_PAGES * RESULTS_PER_PAGE;
  // A search, narrowed when it finds too many → { params, first, narrowed }
  const search = async (params) => {
    const first = await firstPage(params);
    if (first.total > limit && query.narrow) {
      const p = withFields(params, query.narrow.fields);
      const result = await firstPage(p);
      if (result.total) return { params: p, first: result, narrowed: first.total };
    }
    return { params, first, narrowed: 0 };
  };
  let used = await search(query.params);
  const notes = [];
  if (used.first.total === 0 && query.variants && query.variants.length) {
    const tried = [query.params.get('firstname') + ' ' + query.params.get('lastname')];
    const tooMany = [];
    let found = null;
    for (const variant of query.variants) {
      const result = await search(withFields(query.params, variant.fields));
      if (result.first.total > limit) tooMany.push(variant.text + ' (' + result.first.total + ')');
      else if (result.first.total) { found = { ...result, text: variant.text }; break; }
      else tried.push(variant.text);
    }
    if (found) {
      notes.push('none as ' + tried.join(', ') + '; searched as ' + found.text);
      used = found;
    } else {
      notes.push('none as ' + tried.join(', '));
    }
    if (tooMany.length) notes.push('too many to use as ' + tooMany.join(', '));
  }
  if (used.narrowed) notes.push(used.narrowed + ' hits, so only in ' + query.narrow.text);
  const { params, first } = used;
  const hits = first.hits;
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / RESULTS_PER_PAGE));
  for (let page = 2; page <= pages; page++) {
    hits.push(...parseResults(await fetchResultPage(daSearchUrl(params, page))).hits);
  }
  return { total: first.total, hits, params, notes };
}
