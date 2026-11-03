// Matching DA hits to the person (Phase 2): merges the hits of all queries by
// permanent ID, scores each against the person and groups them by record kind.
// Uses profile(), firstWord(), givenStem() and surnameStem() from da_search.js and
// placeAliases() from da_places.js.

// The groups, in the order they're shown
const GROUP_ORDER = ['Baptism', 'Confirmation', 'Marriage', "Children's baptisms", 'Census', 'Emigration', 'Burial', 'Other'];

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

// A name's consonants, spelled one way (Christine, Kristina → krstn; John, Joen → jn):
// spellings of a name mostly differ in their vowels, doubled letters, a silent h,
// and ch/k, th/t, w/v
function skeleton(name) {
  return fold(name).replace(/ch|c|q/g, 'k').replace(/th/g, 't').replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 's')
    .replace(/[^\p{L}]/gu, '')
    .replace(/(?<=.)h(?![aeiouyæøåäöüé])/g, '').replace(/[aeiouyæøåäöüé]/g, '').replace(/(.)\1+/g, '$1');
}

// A word of a hit's name is the FS name, starts with its stem (Anne for Anna), or has
// its consonants (Magdalen for Magdaline; not for names with fewer than two, like Ole)
function nameMatch(word, name) {
  if (fold(word) === fold(name)) return true;
  const stem = givenStem(name);
  if (stem.endsWith('*') && fold(word).startsWith(fold(stem.slice(0, -1)))) return true;
  const sk = skeleton(name);
  return sk.length >= 2 && skeleton(word) === sk;
}

// An FS place's parts, each with its other names
function placeNames(place) {
  return place.split(',').map((part) => part.trim()).filter((part) => part.length >= 3 && !PLACE_IGNORE.test(part))
    .map((part) => ({ part, names: placeAliases(part) }));
}

// A hit → { score, reasons: [{ text, ok, points }] }. ok is true (matches), false
// (contradicts) or null (close, or a name variant).
function scoreHit(hit, P) {
  const reasons = [];
  const add = (points, text, ok) => {
    if (!reasons.some((r) => r.text === text)) reasons.push({ points, text, ok });
  };

  // Names: the first word is a given name; any later word can be a further given
  // name or the surname
  const words = hit.name.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const stems = P.surnames.map((s) => fold(surnameStem(s)).replace(/\*$/, '')).filter(Boolean);
  const isSurname = (w) => stems.some((stem) => fold(w).startsWith(stem));
  const surname = words.slice(1).find(isSurname);
  if (surname) add(2, surname, true);
  const names = words.filter((w) => w !== surname);

  // The first given name (of any FS name): the same 2, a spelling of it 2, otherwise
  // a variant DA matched 1
  const first = names.find((w) => P.givens.some((g) => fold(g) === fold(w)));
  const close = !first && names.find((w) => P.givens.some((g) => nameMatch(w, g)));
  if (first) add(2, first, true);
  else if (close) add(2, close + ' for ' + P.givens.find((g) => nameMatch(close, g)), null);
  else if (names.length && P.givens.length) add(1, names[0] + ' (variant of ' + P.given + ')', null);
  // Further given names (Magdalen for Magdaline)
  const used = new Set([first || close]);
  for (const name of P.givenNames.slice(1)) {
    const word = names.find((w) => !used.has(w) && nameMatch(w, name));
    if (word) { add(1, word, true); used.add(word); }
  }
  // A baptism names the child by given names only, and all of them: one FS doesn't
  // have speaks against it, a little (Kristina Caspara for Maren Kristine)
  if (hit.role === 'Child' && P.givenNames.length) {
    for (const w of names) {
      if (!used.has(w) && !isPatronymic(w) && ![...P.givenNames, ...P.givens].some((name) => nameMatch(w, name))) add(-1, w + ' not in FS', false);
    }
  }

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
