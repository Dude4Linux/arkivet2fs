// DigitalArkivet person search (Phase 2): builds DA advanced-search queries from the
// search page's criteria, fetches the result pages and parses the hits.
// Used by search.js; no DOM access except DOMParser.
//
// What DA's advanced search does with names (tested November 2026):
// - It adds its own name variants (Jon → Joen, John), but not for patronymic endings.
// - A trailing * works and keeps the variants on the other name ("Per" + "Aslaks*").
//   A * inside a word or a ? doesn't ("J*n", "Tol*fs*", "Lindem?n" find nothing useful).
// - firstname "Anna" also matches "Anna Kristine", but "Anna Magdaline" doesn't match
//   "Anna Magdalene": search on the first given name only.
// - Most church records give no birth year for parents and godparents: filter on the
//   event year, not birth_year.

const DA_SEARCH_URL = 'https://www.digitalarkivet.no/en/search/persons/advanced';
const RESULTS_PER_PAGE = 50;
const MAX_PAGES = 2;
const REQUEST_GAP_MS = 1000; // DA rate-limits automated traffic

// Patronymic: genitive s + ending (-sen/-søn/-son, -datter/-dotter, -dtr., -dr., -d.)
const PATRONYMIC_ENDING = /(s)(en|øn|on|datter|dotter|dtr\.?|dr\.?|d\.)$/i;

const RECORD_TYPES = {
  pd: 'Baptism', pk: 'Confirmation', pv: 'Marriage', pg: 'Burial', pf: 'Census',
  pe: 'Emigration', pa: 'Probate', pt: 'Tax', pl: 'School', pm: 'Property',
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
  'person': ''
};

// --- Names and years ------------------------------------------------------------------

const firstWord = (s) => ((s || '').trim().split(/\s+/)[0] || '').replace(/[.,]$/, '');

const isPatronymic = (surname) => PATRONYMIC_ENDING.test(surname || '');

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

const year = (v) => (/^\d{4}$/.test((v || '').trim()) ? Number(v) : null);

// The person's lifetime: birth range start to death range end (a century if one is missing)
function lifetime(c) {
  const from = year(c.birth['birthLikeDate.from']);
  const to = year(c.death['deathLikeDate.to']);
  if (from && to) return [from, to];
  if (from) return [from, from + 100];
  if (to) return [to - 100, to];
  return [null, null];
}

// --- Queries ----------------------------------------------------------------------------

// Criteria from search.js (readCriteria) → a list of queries:
// { id, title, summary, params: URLSearchParams, skip? }. A query with `skip` isn't
// run; `skip` says what's missing.
function buildQueries(criteria) {
  const first = (id) => criteria[id][0] || {};
  const c = {
    name: first('name'), sex: first('sex').sex || '', birth: first('birth'), death: first('death'),
    father: first('father'), mother: first('mother')
  };
  const given = firstWord(c.name.givenName);
  const queries = [];
  if (!given && !c.name.surname) return queries;

  // No genders[] filter: DA drops every record without a gender (many censuses),
  // e.g. Anna Lindeman's 1870 census. Sex is left for scoring the hits.
  const base = () => new URLSearchParams();
  const years = (p, from, to) => {
    if (from) p.set('event_year_from', from);
    if (to) p.set('event_year_to', to);
  };
  const span = (from, to) => (from || to ? (from || '…') + '–' + (to || '…') : 'any year');

  // Own baptism: the child is usually given without a surname, so search on the
  // first given name and a parent. The parent's surname is used only when it's a
  // family name; patronymics are spelled too many ways.
  const parent = c.father.fatherGivenName ? { role: 'father', given: c.father.fatherGivenName, surname: c.father.fatherSurname }
    : c.mother.motherGivenName ? { role: 'mother', given: c.mother.motherGivenName, surname: c.mother.motherSurname }
    : null;
  if (given) {
    const p = base();
    p.set('firstname', given);
    p.append('roles[]', 'barn');
    const from = year(c.birth['birthLikeDate.from']);
    const to = year(c.birth['birthLikeDate.to']);
    years(p, from, to ? to + 1 : null); // baptism can fall in the next year
    let relative = '';
    if (parent) {
      p.set('related_first_name', firstWord(parent.given));
      relative = firstWord(parent.given);
      if (parent.surname && !isPatronymic(parent.surname)) {
        p.set('related_last_name', surnameStem(parent.surname));
        relative += ' ' + surnameStem(parent.surname);
      }
    }
    const query = {
      id: 'baptism', title: 'Baptism',
      summary: [given + ' as child', parent ? parent.role + ' ' + relative : '', span(from, to ? to + 1 : null)].filter(Boolean).join(' · '),
      params: p
    };
    // A given name and years alone match thousands of baptisms
    if (!parent) query.skip = 'Add the father or mother to search for the baptism.';
    queries.push(query);
  }

  // All records under the name, over the person's lifetime
  {
    const p = base();
    if (given) p.set('firstname', given);
    const stem = surnameStem(c.name.surname);
    if (stem) p.set('lastname', stem);
    const [from, to] = lifetime(c);
    years(p, from, to);
    queries.push({
      id: 'lifetime', title: 'All records under the name',
      summary: [[given, stem].filter(Boolean).join(' '), span(from, to)].join(' · '),
      params: p
    });
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

// Fetch one result page, spaced out from the last request and cached for the session
async function fetchResultPage(url) {
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
  try { sessionStorage.setItem('da:' + url, html); } catch (e) { /* full or unavailable */ }
  return html;
}

// Run a query: up to MAX_PAGES result pages → { total, hits }
async function runQuery(query) {
  const first = parseResults(await fetchResultPage(daSearchUrl(query.params)));
  const hits = first.hits;
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / RESULTS_PER_PAGE));
  for (let page = 2; page <= pages; page++) {
    hits.push(...parseResults(await fetchResultPage(daSearchUrl(query.params, page))).hits);
  }
  return { total: first.total, hits: hits };
}
