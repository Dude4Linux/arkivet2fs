// Matching DA hits to the person (Phase 2): merges the hits of all queries by
// permanent ID, scores each against the person and groups them by record kind.
// Uses profile(), firstWord(), givenStem() and surnameStem() from da_search.js and
// placeAliases() from da_places.js.

// The groups, in the order they're shown
const GROUP_ORDER = ['Baptism', 'Confirmation', 'Marriage', "Children's baptisms", "Children's marriages", 'Census', 'Emigration', 'Moving', 'Burial', 'Other'];

// The youngest a person can be in a role; younger means a namesake
const MIN_AGE = { Groom: 16, Bride: 16, Father: 16, Mother: 15, Godparent: 12, Confirmand: 12, Witness: 16, "Groom's father": 34, "Bride's father": 34 };
// Parts of FS places that say nothing about where in Norway
const PLACE_IGNORE = /^(norway|norge|noreg|kingdom of norway)$/i;

// A record's group, from its kind and the person's role in it
function groupOf(hit) {
  switch (hit.type) {
    case 'Baptism': return hit.role === 'Child' ? 'Baptism' : hit.role === 'Father' || hit.role === 'Mother' ? "Children's baptisms" : 'Other';
    case 'Confirmation': return hit.role === 'Confirmand' ? 'Confirmation' : 'Other';
    case 'Marriage': return hit.role === 'Groom' || hit.role === 'Bride' ? 'Marriage'
      : hit.role === "Groom's father" || hit.role === "Bride's father" ? "Children's marriages" : 'Other';
    case 'Burial': return hit.role === 'Deceased' ? 'Burial' : 'Other';
    case 'Census': return 'Census';
    case 'Emigration': return 'Emigration';
    case 'Out-migration': case 'In-migration': return 'Moving';
    default: return 'Other';
  }
}

// Add a search's hits to `merged` (a Map by permanent ID); a record found by several
// searches is kept once, with all of them (`query`: anything with the `reasons`
// its hits matched, a query's step in search.js)
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
// `word` as a whole word (or words) in `text` (a function: da_verify.js uses it)
function hasWord(text, word) {
  return new RegExp('(^|[^\\p{L}])' + escapeRegex(word) + '($|[^\\p{L}])', 'iu').test(text);
}

// A name's consonants, spelled one way (Christine, Kristina → krstn; John, Joen → jn):
// spellings of a name mostly differ in their vowels, doubled letters, a silent h
// (before a consonant or after one: Ragnhild, Ragnild, Ragnihld → rgnld), and ch/k,
// th/t, w/v, x/ks, and an old final j for i (Sirj, Karj for Siri, Kari). From
// Norphone (Lars Marius Garshol's phonetic key for Norwegian): a silent j or h at the
// start (Kjetil = Kittil, Kjersti = Kirsti, Gjermund = Jermund, Hjalmar = Jalmar) and
// a final dt (Arndt = Arnt), and one sound at the start for sj, skj, sch, sk before
// a front vowel, and the old si before a vowel (Sjønne = Skjønne = Siønne = Sionne;
// Schjønnesen = Skjønnesen). Not its g → k, d → t, nd → n, ld → l or the final d
// after a vowel: they make Guri Kari, Gunder Gunnar, Ingrid Inger.
function skeleton(name) {
  return fold(name).replace(/[^\p{L}]/gu, '').replace(/(?<=[^aeiouyæøåäöüé])j$/, 'i')
    .replace(/^(sch|sj|si(?=[aeouæøå])|sk(?=[iyøæ]|ei))/, 'sk').replace(/^(s?k)j/, '$1').replace(/^[gh]j/, 'j').replace(/dt$/, 't')
    .replace(/ch|c|q/g, 'k').replace(/th/g, 't').replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 's').replace(/x/g, 'ks')
    .replace(/(?<=.)h(?![aeiouyæøåäöüé])|(?<=[^aeiouyæøåäöüé])h/g, '').replace(/[aeiouyæøåäöüé]/g, '').replace(/(.)\1+/g, '$1');
}

// Jaro-Winkler similarity of two words, 0 to 1: the share of letters they have in
// common near the same place, less the transposed ones, and more for a common start
function jaroWinkler(x, y) {
  const a = fold(x), b = fold(y);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const inA = [], inB = [];
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (!inB[j] && a[i] === b[j]) { inA[i] = inB[j] = true; m++; break; }
    }
  }
  if (!m) return 0;
  let transposed = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!inA[i]) continue;
    while (!inB[k]) k++;
    if (a[i] !== b[k]) transposed++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - transposed / 2) / m) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

// Two spellings close enough to be one name, where nameMatch() can't tell (Ingebrigt,
// Ingebret; Torbjørn, Torbiørn; Gulbrand, Gudbrand; Tollef, Tollev): Jaro-Winkler
// 0.92 or more, both of at least 4 letters, ending in the same letter or both in a
// consonant (Kari and Karin, Helge and Helga, Berte and Bertel are other names). Only
// ever a close name (≈), never a match, and never a reason against a record.
function nameNear(x, y) {
  const a = fold(x).replace(/[^\p{L}]/gu, ''), b = fold(y).replace(/[^\p{L}]/gu, '');
  if (a.length < 4 || b.length < 4) return false;
  const vowel = (c) => 'aeiouyæøåäöüé'.includes(c);
  const endA = a[a.length - 1], endB = b[b.length - 1];
  if (endA !== endB && (vowel(endA) || vowel(endB))) return false;
  return jaroWinkler(a, b) >= 0.92;
}

// Two patronymics' father names (patronymicBase()) that may be one man's: spellings
// of one name (Halvard, Halvor; Gudbrand, Gulbrand), one the start of the other
// (Johan, Johannes), or forms of Johannes, which church books wrote as John, Jon or
// Joen for the same man (Johnsdatter, Johansdatter, Johannesdatter for one woman)
const JOHANNES_FORMS = /^(jo(h?n|en)|johan+[ae]?)$/;
function sameFather(x, y) {
  const a = fold(x), b = fold(y);
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a) || nameMatch(a, b) || nameMatch(b, a) || nameNear(a, b)
    || (JOHANNES_FORMS.test(a) && JOHANNES_FORMS.test(b));
}

// A word of a hit's name is the FS name, one of its forms (Ingbjør for Ingeborg:
// nameForms() in da_search.js), starts with its stem (Anne for Anna), or has its
// consonants (Magdalen for Magdaline; not for names with fewer than two, like Ole)
function nameMatch(word, name) {
  if (fold(word) === fold(name)) return true;
  const forms = nameForms(name);
  if (forms.length > 1 && forms.includes(nameKey(word))) return true;
  const stem = givenStem(name);
  if (stem.endsWith('*') && fold(word).startsWith(fold(stem.slice(0, -1)))) return true;
  const sk = skeleton(name);
  return sk.length >= 2 && skeleton(word) === sk;
}

// Points for a year this far from FS's (scoreHit()): 0 → 2, 1 → 1, 2–3 → -2,
// 4–9 → -4, 10 or more → -6
function yearPoints(off) {
  return off === 0 ? 2 : off === 1 ? 1 : off <= 3 ? -2 : off <= 9 ? -4 : -6;
}

// A record's given name close to FS's, but not one of its forms: the record's is a
// stem of FS's (Astri for Astrid; nameMatch() the other way round), as
// church books often write it, or a near spelling (Ingebret for Ingebrigt: nameNear())
function nameClose(word, name) {
  return !nameMatch(word, name) && (nameMatch(name, word) || nameNear(word, name));
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
  // A patronymic from a spelling of the same father's name (Halvardsen for Halvorsen)
  const fsPatronymics = P.surnames.filter(isPatronymic);
  const spelled = (w) => isPatronymic(w) && fsPatronymics.find((s) => sameFather(patronymicBase(w), patronymicBase(s)));
  const surname = words.slice(1).find(isSurname) || words.slice(1).find(spelled);
  if (surname && isSurname(surname)) add(2, surname, true);
  else if (surname) add(2, t('{name} for {fs}', { name: surname, fs: spelled(surname) }), null);
  const names = words.filter((w) => w !== surname);

  // Baptisms and confirmations give all the given names
  const allGiven = hit.role === 'Child' || hit.role === 'Confirmand';
  // The first given name (of any FS name): the same 2, a spelling of it 2, otherwise
  // a variant DA matched 1 (0 where all given names are given: it isn't one of them)
  const first = names.find((w) => P.givens.some((g) => fold(g) === fold(w)));
  const close = !first && names.find((w) => P.givens.some((g) => nameMatch(w, g) || nameNear(w, g)));
  const variant = !first && !close && P.givens.length && names[0];
  // A variant only when a search asked for the given name: a search by the surname
  // and a relative (the mother Johans* of a father) finds other given names, other
  // people (Marit Johansdatter for Astri Johansdatter)
  const byGiven = (hit.queries || []).some((q) => !q.fields || q.fields.firstname);
  if (first) add(2, first, true);
  else if (close) add(2, t('{name} for {fs}', { name: close, fs: P.givens.find((g) => nameMatch(close, g) || nameNear(close, g)) }), null);
  else if (variant && byGiven) add(allGiven ? 0 : 1, t('{name} (variant of {fs})', { name: variant, fs: P.given }), null);
  else if (variant) add(-3, t('{name} in the record, not {fs}', { name: variant, fs: P.given }), false);
  // Further given names (Magdalen for Magdaline)
  const used = new Set([first || close || variant]);
  for (const name of P.givenNames.slice(1)) {
    const word = names.find((w) => !used.has(w) && nameMatch(w, name));
    if (word) { add(1, word, true); used.add(word); }
  }
  // A given name FS doesn't have speaks against such a record, a little (Maren
  // Kristina Caspara for Maren Kristine)
  if (allGiven && P.givenNames.length) {
    for (const w of names) {
      if (!used.has(w) && !isPatronymic(w) && ![...P.givenNames, ...P.givens].some((name) => nameMatch(w, name) || nameNear(w, name))) add(-1, t('{name} not in FamilySearch', { name: w }), false);
    }
  }

  // Sex: only a contradiction counts
  if (hit.gender && P.sex && hit.gender !== P.sex) add(-4, t(hit.gender).toLowerCase(), false);

  // Other events' years (marriage, emigration, burial) against the sidebar's range:
  // inside it 3 points (4 for its middle, FS's own year: personToQuery() widens it by
  // 2), within `near` 1, otherwise -4
  const inRange = (y, from, to, text, near) => {
    const off = distance(y, from, to);
    const middle = (from + to) / 2;
    if (off === 0) add(y === middle ? 4 : 3, text + ' ' + y, true);
    else if (off <= near) add(1, text + ' ' + y, null);
    else add(-4, text + ' ' + y, false);
  };

  // Birth years by how far they are from FS's (yearPoints()): the same year +2, one
  // off +1 (≈), and ✗ -2 two or three years off, -4 up to nine, -6 from ten (another
  // generation: a namesake grandfather or grandson). Census ages are often a year or
  // two off; a gravestone's year seldom.
  const fsText = (text, year) => t('{what} {year} (FamilySearch: b. {fs})', { what: text, year, fs: P.birthYear });
  const byYear = (off, year, text) => {
    const a = Math.abs(off);
    add(yearPoints(a), a === 0 ? text + ' ' + year : fsText(text, year), a === 0 ? true : a === 1 ? null : false);
  };
  // Without FS's year, the sidebar's range: inside it +1, one off 0, then as above
  const byRange = (year, from, to, text) => {
    const off = distance(year, from, to);
    add(off === 0 ? 1 : off === 1 ? 0 : yearPoints(off), text + ' ' + year, off === 0 ? true : off === 1 ? null : false);
  };
  // A baptism against FS's birth: the same year, or the next for a birth from
  // October; with both full dates, within half a year after the birth counts as the
  // same year, and before the birth is ✗ (another child: two Larses of one Halvor Larsen)
  const baptised = (date, year) => {
    const b = P.birthDate;
    const d = String(date || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (b.exact && d) {
      const days = (Date.UTC(+d[1], d[2] - 1, +d[3]) - Date.UTC(b.year, b.month - 1, b.day)) / 864e5;
      if (days < 0 && days > -730) {
        add(-2, t('baptised {date}, before the birth ({fs})', { date: formatDate(d[1], d[2], d[3]), fs: formatDate(b.year, b.month, b.day) }), false);
        return;
      }
      if (days >= 0 && days <= 183) { byYear(0, year, t('baptised')); return; }
    }
    const off = year - b.year;
    byYear(off === 1 && b.month >= 10 ? 0 : off, year, t('baptised'));
  };

  // Birth year, when the record gives one: against FS's year, or the sidebar's range.
  // DA's "1766*" is the year less an age (a census), itself a year uncertain (35 on
  // census day: born 1765 or 1766), so it counts one year closer. The star must be
  // the year's: DA also marks places it couldn't identify ("1844, Vågå herred*").
  const born = yearIn(hit.born);
  const fromAge = /\b\d{4}\*/.test(hit.born || '');
  const bornOff = born && P.birthYear ? born - P.birthYear : 0;
  if (born && P.birthYear) byYear(fromAge && bornOff ? bornOff - Math.sign(bornOff) : bornOff, born, t('b.'));
  else if (born && P.birth) byRange(born, P.birth.from, P.birth.to, t('b.'));

  // The event's year, by the person's role in it
  const event = yearIn(hit.date);
  if (event) {
    const check = (from, to, text, near) => inRange(event, from, to, text, near);
    if (hit.role === 'Child' && P.birthYear && !born) baptised(hit.date, event);
    else if (hit.role === 'Child' && P.birth && !born) byRange(event, P.birth.from, P.birth.to + 1, t('baptised'));
    else if ((hit.role === 'Groom' || hit.role === 'Bride') && P.marriage) check(P.marriage.from - 1, P.marriage.to + 1, t('married'), 3);
    else if (hit.type === 'Emigration' && P.emigration) check(P.emigration.from, P.emigration.to, t('emigrated'), 2);
    else if (hit.role === 'Deceased' && P.death) check(P.death.from - 1, P.death.to + 1, t('buried'), 2);
    else if (P.birth && event < P.birth.from - 1) add(-4, t('{year} is before birth', { year: event }), false);
    else if (P.death && event > P.death.to + 1) add(-4, t('{year} is after death', { year: event }), false);
    else if (P.leftNorway && event > P.leftNorway) add(-4, t('{year} is after {what}', { year: event, what: leavingText(P) }), false);
    else if (P.birth && !born && MIN_AGE[hit.role] && event - P.birth.from < MIN_AGE[hit.role]) {
      add(-4, t('{role} at about {age}', { role: t(hit.role).toLowerCase(), age: Math.max(0, event - Math.round((P.birth.from + P.birth.to) / 2)) }), false);
    }

    if (hit.role === 'Father' || hit.role === 'Mother') {
      const child = P.children.find((c) => c.year && Math.abs(c.year - event) <= 1);
      if (child) add(2, t('child') + ' ' + [child.given, t('b.') + ' ' + child.year].filter(Boolean).join(' '), true);
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
  // Farms: in the residence, the birthplace, or the name itself, also spelled with the
  // same consonants (Hægbostad, Hæggebostad for Hægebostad)
  const farmText = [hit.name, hit.born, hit.domicile].join(' ');
  const farmWords = farmText.split(/[^\p{L}]+/u).filter(Boolean);
  for (const farm of P.farms) {
    const sk = skeleton(farm);
    const spelling = !hasWord(farmText, farm) && sk.length >= 3 && farmWords.find((w) => skeleton(w) === sk);
    if (spelling) add(2, t('farm {farm}', { farm }) + ' = ' + spelling, true);
    else if (hasWord(farmText, farm)) add(2, t('farm {farm}', { farm }), true);
  }

  // What the searches themselves matched (a parent, a spouse, a farm): once per
  // relative, from the strictest search that found the hit ("mother Ing* Lars*", not
  // also "mother Ing*")
  const matched = new Set();
  for (const query of hit.queries) {
    for (const r of query.reasons || []) {
      const relation = r.replace(/ (?=[^ ]*\p{Lu}|[^ ]*\*).*$/u, '');
      if (!matched.has(relation)) { matched.add(relation); add(2, r, true); }
    }
  }
  // What the record page says (da_verify.js checkRecord)
  for (const r of hit.checks || []) add(r.points, r.text, r.ok);

  return { score: reasons.reduce((sum, r) => sum + r.points, 0), reasons };
}

// A hit's event date as a number to sort by (1821-04-08 → 18210408; a year alone, or
// a year from the source title, sorts before that year's dates); undated hits last
function dateKey(hit) {
  const m = (hit.date || '').match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (m) return Number(m[1]) * 10000 + (Number(m[2]) <= 12 ? Number(m[2]) * 100 : 0) + (m[2] && Number(m[2]) <= 12 && m[3] ? Number(m[3]) : 0);
  const year = yearIn(hit.date) || yearIn(hit.source);
  return year ? year * 10000 : Infinity;
}

// The merged hits, scored, as [{ title, hits }] in GROUP_ORDER, best first, and
// those with the same score by date, earliest first (a couple's children in order)
function groupHits(merged, P) {
  const groups = new Map(GROUP_ORDER.map((title) => [title, []]));
  for (const hit of merged.values()) {
    groups.get(groupOf(hit)).push({ ...hit, ...scoreHit(hit, P) });
  }
  const order = (a, b) => b.score - a.score || (dateKey(a) - dateKey(b) || 0);
  return [...groups].filter(([, hits]) => hits.length)
    .map(([title, hits]) => ({ title, hits: hits.sort(order) }));
}

// --- One event in two church books ---------------------------------------------------
// A parish kept two church books side by side, the priest's ministerialbok and the
// parish clerk's klokkerbok, and DA transcribed both: one baptism can be two records,
// each with its own ID, source and spellings. Two hits are one event when the record
// kind, role, full date and parish code (the source title's "(1001P)") agree, the
// sources differ, and the first given names match. With more than one hit of the
// event in a source (twins: the father's row in two baptisms of one day), only the
// checked records' principals (`hit.record`, the baptized child's name) tell which go
// together; until then they stay apart.

// The parish code a church book's source title ends with: "… 1842-1851 (1001P)"
function parishCode(source) {
  const m = String(source || '').match(/\((\d{4}[A-Z]\w*)\)\s*$/);
  return m ? m[1] : '';
}

function parallelKey(hit) {
  const date = String(hit.date || '').match(/^\d{4}-\d{1,2}-\d{1,2}/);
  const code = parishCode(hit.source);
  return date && code && hit.sourceUrl ? [hit.type, hit.role, date[0], code].join('|') : '';
}

const firstGiven = (name) => String(name || '').replace(/%[^%]*%/g, ' ').replace(/[*,]/g, ' ').trim().split(/\s+/)[0] || '';
const sameGiven = (a, b) => !!a && !!b && (nameMatch(a, b) || nameMatch(b, a));

// The given name of a record's principal (the baptized child, the confirmand, the
// deceased, the groom), '' when the record wasn't read
function principalGiven(record) {
  for (const role of ['Child', 'Confirmand', 'Deceased', 'Groom']) {
    const p = record && (record.people || []).find((x) => x.roleEnglish === role);
    if (p) return firstGiven(p.name);
  }
  return '';
}

// A group's hits (in their order) with each event found in two books once: the first
// of the two gets the other as `parallel`, and the other leaves the list
function pairParallel(hits) {
  const clusters = new Map();
  for (const hit of hits) {
    const key = parallelKey(hit);
    if (!key) continue;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(hit);
  }
  const partner = new Map();
  for (const cluster of clusters.values()) {
    const inSource = (url) => cluster.filter((h) => h.sourceUrl === url).length;
    for (const a of cluster) {
      if (partner.has(a)) continue;
      const others = cluster.filter((b) => !partner.has(b) && b.sourceUrl !== a.sourceUrl && sameGiven(firstGiven(a.name), firstGiven(b.name)));
      const given = principalGiven(a.record);
      // Records read: the principals must agree; else the only one in each source
      const fits = others.filter((b) => {
        const other = principalGiven(b.record);
        return given && other ? sameGiven(given, other) : inSource(a.sourceUrl) === 1 && inSource(b.sourceUrl) === 1;
      });
      if (fits.length === 1) {
        partner.set(a, fits[0]);
        partner.set(fits[0], a);
      }
    }
  }
  return hits.filter((h) => !partner.has(h) || hits.indexOf(h) < hits.indexOf(partner.get(h)))
    .map((h) => (partner.has(h) ? { ...h, parallel: partner.get(h) } : h));
}
