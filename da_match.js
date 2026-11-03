// Matching DA hits to the person (Phase 2): merges the hits of all queries by
// permanent ID, scores each against the person and groups them by record kind.
// Uses profile(), lifetime(), firstWord() and surnameStem() from da_search.js.

// The groups, in the order they're shown
const GROUP_ORDER = ['Baptism', 'Confirmation', 'Marriage', "Children's baptisms", 'Census', 'Emigration', 'Burial', 'Other'];

// Old and new names for the same place. Each list is one place; any of its names
// in an FS place matches any of them in a DA hit.
const PLACE_ALIASES = [
  ['oslo', 'christiania', 'kristiania', 'chra', 'chria', 'chrania', 'kria'],
  ['trondheim', 'trondhjem', 'thjem', 'nidaros'],
  ['vest-agder', 'lister og mandal'],
  ['aust-agder', 'nedenes'],
  ['buskerud', 'buskeruds'],
  ['akershus', 'aggershus'],
  ['hedmark', 'hedemarken'],
  ['oppland', 'christians', 'kristians'],
  ['telemark', 'bratsberg'],
  ['vestfold', 'jarlsberg og larvik'],
  ['østfold', 'smaalenene', 'smålenene'],
  ['rogaland', 'stavanger amt'],
  ['hordaland', 'søndre bergenhus'],
  ['sogn og fjordane', 'nordre bergenhus'],
  ['møre og romsdal', 'romsdal']
];
// The youngest a person can be in a role; younger means a namesake
const MIN_AGE = { Groom: 16, Bride: 16, Father: 16, Mother: 15, Godparent: 12, Confirmand: 12, Witness: 16 };
// Parts of FS places that say nothing about where in Norway
const PLACE_IGNORE = /^(norway|norge|noreg|kingdom of norway)$/i;

// A record's group, from its kind and the person's role in it
function groupOf(hit) {
  switch (hit.type) {
    case 'Baptism': return hit.role === 'Child' ? 'Baptism' : hit.role === 'Father' || hit.role === 'Mother' ? "Children's baptisms" : 'Other';
    case 'Confirmation': return hit.role === 'Confirmand' ? 'Confirmation' : 'Other';
    case 'Marriage': return hit.role === 'Groom' || hit.role === 'Bride' ? 'Marriage' : 'Other';
    case 'Burial': return hit.role === 'Deceased' ? 'Burial' : 'Other';
    case 'Census': return 'Census';
    case 'Emigration': return 'Emigration';
    default: return 'Other';
  }
}

// Add a query's hits to `merged` (a Map by permanent ID); a record found by several
// queries is kept once, with all of them
function mergeHits(merged, query, hits) {
  for (const hit of hits) {
    const key = hit.id || hit.url;
    const entry = merged.get(key) || { ...hit, queries: [] };
    if (!entry.queries.includes(query)) entry.queries.push(query);
    merged.set(key, entry);
  }
}

const fold = (s) => (s || '').toLowerCase().trim();
const yearIn = (s) => { const m = (s || '').match(/\b(\d{4})\b/); return m ? Number(m[1]) : null; };
// How far a year is outside [from, to]; 0 inside it
const distance = (y, from, to) => (y < from ? from - y : y > to ? y - to : 0);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `word` as a whole word (or words) in `text`
const hasWord = (text, word) => new RegExp('(^|[^\\p{L}])' + escapeRegex(word) + '($|[^\\p{L}])', 'iu').test(text);

// An FS place's parts, each with its other names
function placeNames(place) {
  return place.split(',').map((part) => part.trim()).filter((part) => part.length >= 3 && !PLACE_IGNORE.test(part))
    .map((part) => ({ part, names: PLACE_ALIASES.find((list) => list.includes(fold(part))) || [fold(part)] }));
}

// A hit → { score, reasons: [{ text, ok, points }] }. ok is true (matches), false
// (contradicts) or null (close, or a name variant).
function scoreHit(hit, P) {
  const reasons = [];
  const add = (points, text, ok) => {
    if (!reasons.some((r) => r.text === text)) reasons.push({ points, text, ok });
  };

  // Names: the hit's first word is the given name; any later word can be the surname
  const words = hit.name.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const given = words[0] || '';
  if (P.givens.length && given) {
    if (P.givens.some((g) => fold(g) === fold(given))) add(2, given, true);
    else add(1, given + ' (variant of ' + P.given + ')', null);
  }
  const stems = P.surnames.map((s) => fold(surnameStem(s)).replace(/\*$/, '')).filter(Boolean);
  const surname = words.slice(1).find((w) => stems.some((stem) => fold(w).startsWith(stem)));
  if (surname) add(2, surname, true);

  // Sex: only a contradiction counts
  if (hit.gender && P.sex && hit.gender !== P.sex) add(-4, hit.gender.toLowerCase(), false);

  // Years against a range: inside it 3 points (4 for its middle, which is FS's own
  // year, since personToQuery widens it by 2), close 1, otherwise -4
  const inRange = (y, from, to, text, near) => {
    const off = distance(y, from, to);
    const middle = (from + to) / 2;
    if (off === 0) add(y === middle ? 4 : 3, text + ' ' + y, true);
    else if (off <= near) add(1, text + ' ' + y, null);
    else add(-4, text + ' ' + y, false);
  };

  // Birth year, when the record gives one
  const born = yearIn(hit.born);
  if (born && P.birth) inRange(born, P.birth.from, P.birth.to, 'b.', 3);

  // The event's year, by the person's role in it
  const event = yearIn(hit.date);
  if (event) {
    const check = (from, to, text, near) => inRange(event, from, to, text, near);
    if (hit.role === 'Child' && P.birth && !born) check(P.birth.from, P.birth.to + 1, 'baptised', 2);
    else if ((hit.role === 'Groom' || hit.role === 'Bride') && P.marriage) check(P.marriage.from - 1, P.marriage.to + 1, 'married', 3);
    else if (hit.role === 'Deceased' && P.death) check(P.death.from - 1, P.death.to + 1, 'buried', 2);
    else if (P.birth && event < P.birth.from - 1) add(-4, event + ' is before birth', false);
    else if (P.death && event > P.death.to + 1) add(-4, event + ' is after death', false);
    else if (P.birth && !born && MIN_AGE[hit.role] && event - P.birth.from < MIN_AGE[hit.role]) {
      add(-4, hit.role.toLowerCase() + ' at about ' + Math.max(0, event - Math.round((P.birth.from + P.birth.to) / 2)), false);
    }

    if (hit.role === 'Father' || hit.role === 'Mother') {
      const child = P.children.find((c) => c.year && Math.abs(c.year - event) <= 1);
      if (child) add(2, 'child ' + [child.given, 'b. ' + child.year].filter(Boolean).join(' '), true);
    }
  }

  // Places: any part of an FS place (or its old name) in the hit's birthplace,
  // residence or source title; at most two count
  const text = [hit.born, hit.domicile, hit.source].join(' ');
  let placeMatches = 0;
  for (const { part, names } of P.places.flatMap(placeNames)) {
    if (placeMatches >= 2) break;
    const found = names.find((n) => hasWord(text, n));
    if (found && !reasons.some((r) => r.text.startsWith(part))) {
      add(2, fold(part) === found ? part : part + ' = ' + found, true);
      placeMatches++;
    }
  }
  // Farms: in the residence, the birthplace, or the name itself
  for (const farm of P.farms) {
    if (hasWord([hit.name, hit.born, hit.domicile].join(' '), farm)) add(2, 'farm ' + farm, true);
  }

  // What the queries themselves matched (a parent, a spouse)
  for (const query of hit.queries) for (const r of query.reasons || []) add(2, r, true);

  return { score: reasons.reduce((sum, r) => sum + r.points, 0), reasons };
}

// The merged hits, scored, as [{ title, hits }] in GROUP_ORDER, best first
function groupHits(merged, P) {
  const groups = new Map(GROUP_ORDER.map((title) => [title, []]));
  for (const hit of merged.values()) {
    groups.get(groupOf(hit)).push({ ...hit, ...scoreHit(hit, P) });
  }
  return [...groups].filter(([, hits]) => hits.length)
    .map(([title, hits]) => ({ title, hits: hits.sort((a, b) => b.score - a.score) }));
}
