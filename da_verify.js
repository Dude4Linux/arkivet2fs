// Checking close hits on their record pages (Phase 2): a search hit gives only one
// person's name, years and residence, so several namesakes can score alike (three
// Peer Aslaksens in the 1801 census). The record page names the others in the record,
// the parents of a baptized child, the couple of a marriage, a census household, and
// they're compared with the person's FS relatives. Emigrant protocols also give the
// destination. Uses extractRecord() from da_record.js, fetchResultPage() from
// da_search.js and nameMatch(), hasWord(), placeNames() from da_match.js.

// How many hits of each group are checked, best first (more of the children's
// baptisms, each a different child), and the lowest score checked
const CHECK_PER_GROUP = { "Children's baptisms": 12, "Children's marriages": 6 };
const CHECK_DEFAULT = 3;
const CHECK_MIN_SCORE = 0;
// Groups whose records name the person's relatives (or, emigration, the destination)
const CHECKED_GROUPS = ['Baptism', 'Confirmation', 'Marriage', "Children's baptisms", "Children's marriages", 'Census', 'Emigration', 'Moving', 'Burial'];

// Kinds of role, from DA's role or census family position, in Norwegian or English
const ROLE_KINDS = {
  child: /^(child|confirmand|son|daughter|barn|konfirmant|s|d|((hans|hendes|deres) )?(søn|sønn|datter|dotter|barn|børn|born))\b/i,
  father: /^(father|far|fader)$/i,
  mother: /^(mother|mor|moder)$/i,
  head: /^(head of household|man of the house|woman of the house|hp|hf|hm|(hus|huus|hos)(bonde|bond|fader|far|moder|mor|mand)|bonde|gaardmand|gårdmann)\b/i,
  spouse: /^(wife|husband|wife of head|his wife|hu|((hans|hendes) )?(kone|hustru|hustrue|hustroe|hustro|ægtefælle|ektefelle|mand|mann|ektemann))\b/i,
  groom: /^(groom|brudgom)$/i,
  bride: /^(bride|brud|brur)$/i,
  deceased: /^(deceased|avdød|avdøde)$/i,
  groomFather: /^(groom's father|brudgommens far)$/i,
  brideFather: /^(bride's father|bruras far|brudens far)$/i
};

// The kind of a record person's role ('' for godparents, servants, lodgers, ...).
// Census positions can be several ("d, fl": daughter, lodger); the first counts.
function roleKind(person) {
  for (const role of [person.roleEnglish, person.role]) {
    const first = (role || '').split(',')[0].trim();
    for (const [kind, pattern] of Object.entries(ROLE_KINDS)) if (pattern.test(first)) return kind;
  }
  return '';
}

// The others in the record who'd be the person's father, mother, spouse or children,
// by the person's role and theirs: { father: [], mother: [], spouse: [], child: [] }
function relativesInRecord(record) {
  const people = record.people || [];
  const me = people.find((p) => p.current);
  const found = { father: [], mother: [], spouse: [], child: [] };
  if (!me) return found;
  const census = record.recordTypeInfo && record.recordTypeInfo.type === 'census';
  const mine = roleKind(me);
  for (const other of people) {
    if (other === me || !other.name) continue;
    const theirs = roleKind(other);
    if (census) {
      // In a household: the head and the head's spouse are a child's parents (which is
      // which isn't known), the head's spouse is the head's, and the children theirs.
      // A couple can both be heads: 1900's hf and hm, 1865's Husfader and Husmoder.
      if (mine === 'child' && (theirs === 'head' || theirs === 'spouse')) { found.father.push(other); found.mother.push(other); }
      else if ((mine === 'head' && (theirs === 'spouse' || theirs === 'head')) || (mine === 'spouse' && theirs === 'head')) found.spouse.push(other);
      else if ((mine === 'head' || mine === 'spouse') && theirs === 'child') found.child.push(other);
    } else if (mine === 'child') {
      if (theirs === 'father') found.father.push(other);
      if (theirs === 'mother') found.mother.push(other);
    } else if (mine === 'father' || mine === 'mother') {
      if (theirs === 'father' || theirs === 'mother') found.spouse.push(other);
      if (theirs === 'child') found.child.push(other);
    } else if (mine === 'groom' || mine === 'bride') {
      if (theirs === 'groom' || theirs === 'bride') found.spouse.push(other);
    } else if (mine === 'groomFather' || mine === 'brideFather') {
      // A child's marriage: the groom or bride is the person's child
      if (theirs === (mine === 'groomFather' ? 'groom' : 'bride')) found.child.push(other);
    } else if (mine === 'deceased') {
      if (theirs === 'spouse') found.spouse.push(other);
    }
  }
  return found;
}

// A record person's birth year: "1866", an age in the record's year ("57", "57
// years"), or for the child of a baptism the baptism's year (seldom a year later)
function birthYearOf(person, record) {
  const text = person.birthYear || '';
  const year = text.match(/\b(1[5-9]\d\d)\b/);
  if (year) return Number(year[1]);
  const age = text.match(/^(\d{1,3})\b/);
  const recordYear = ((record.recordDate || '').match(/^\d{4}/) || [])[0];
  if (age && recordYear) return Number(recordYear) - Number(age[1]);
  const baptism = record.recordTypeInfo && record.recordTypeInfo.prefix === 'pd';
  return baptism && recordYear && /^(child|barn)$/i.test(person.roleEnglish || person.role || '') ? Number(recordYear) : null;
}

// Does a record person have an FS relative's given name (any of the FS given names
// against any word of the record name)?
function hasGivenName(person, given) {
  const words = (person.name || '').replace(/[%*,]/g, ' ').split(/\s+/).filter(Boolean);
  const names = (given || '').split(/\s+/).filter(Boolean);
  return names.length > 0 && words.some((w) => names.some((n) => nameMatch(w, n)));
}

// Does a record person's first given name come close to one of the FS relative's
// (Astri for Astrid: nameClose() in da_match.js)?
function hasCloseName(person, given) {
  const first = (person.name || '').replace(/[%*,]/g, ' ').trim().split(/\s+/)[0] || '';
  return !!first && (given || '').split(/\s+/).some((g) => nameClose(first, g));
}

// The birth date the record gives for its open person, the hit's own row (not a
// parent's, nor a godparent's): "Date of birth: 07-16" or "1846-07-16", with the
// year from "Birth year", else for a baptism the record's year (the year before when
// the day comes after the baptism's) → { year, month, day } (year may be null)
function ownBirthDate(record) {
  const me = (record.people || []).find((p) => p.current);
  const kind = me ? roleKind(me) : '';
  const census = record.recordTypeInfo && record.recordTypeInfo.type === 'census';
  if (!me || ['father', 'mother', 'groomFather', 'brideFather'].includes(kind) || (!census && !kind)) return null;
  const fields = record.fields || {};
  const m = String(fields['date of birth'] || '').trim().match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const month = Number(m[2]), day = Number(m[3]);
  let year = Number(m[1] || (String(fields['birth year'] || '').match(/\b1[5-9]\d\d\b/) || [])[0]) || null;
  const recorded = String(record.recordDate || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!year && recorded && record.recordTypeInfo && record.recordTypeInfo.prefix === 'pd') {
    year = Number(recorded[1]) - (month * 100 + day > Number(recorded[2]) * 100 + Number(recorded[3]) ? 1 : 0);
  }
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { year, month, day } : null;
}

// A record person whose patronymic isn't the FS relative's (Halvor Moen for FS Halvor
// Larsen; Halvor Larsen Moen, Halvor Larssen or Halvor Gudbrandsen for Gulbrandsen
// (nameNear()) agree, Halvor alone says nothing, nor does an ending not read as one:
// Johannesdat., unreadPatronymic())
function patronymicDiffers(person, surname) {
  if (!isPatronymic(surname)) return false;
  const words = (person.name || '').replace(/%[^%]*%|[*,]/g, ' ').split(/\s+/).filter(Boolean).slice(1);
  if (!words.length) return false;
  const base = patronymicBase(surname).toLowerCase();
  return !words.some((w) => {
    if (unreadPatronymic(w, base)) return true;
    const b = patronymicBase(w).toLowerCase();
    return isPatronymic(w) && (b.startsWith(base) || base.startsWith(b) || nameMatch(b, base) || nameMatch(base, b) || nameNear(b, base));
  });
}

// Could a record person be this FS relative: the given name, no other patronymic, and
// a birth year within 5 of FS's (census ages are often a few years off)
function isRelative(person, relative, record, close = false) {
  const named = close ? !hasGivenName(person, relative.given) && hasCloseName(person, relative.given) : hasGivenName(person, relative.given);
  if (!named || patronymicDiffers(person, relative.surname)) return false;
  const year = birthYearOf(person, record);
  return !relative.year || !year || Math.abs(year - relative.year) <= 5;
}

// The first given name of a record person ("Lars Halvorsen" → "Ole")
const firstName = (person) => (person.name || '').replace(/[%*]/g, '').split(/\s+/)[0] || '';

// "Halvor in the record, not Lars", or with the same given name "Halvor Moen (b. 1735) in
// the record, not Halvor Larsen (b. 1762)"
function notRelative(person, relatives, record) {
  if (!relatives.some((r) => hasGivenName(person, r.given) || hasCloseName(person, r.given))) {
    return t('{name} in the record, not {fs}', { name: firstName(person), fs: relatives.map((r) => r.given.split(/\s+/)[0]).join(t(' or ')) });
  }
  const year = birthYearOf(person, record);
  const born = (y) => (y ? ' (' + t('b.') + ' ' + y + ')' : '');
  return t('{name} in the record, not {fs}', { name: person.name.replace(/[%*]/g, '') + born(year),
    fs: relatives.map((r) => (r.given + ' ' + r.surname).trim() + born(r.year)).join(t(' or ')) });
}

// The record compared with the person → reasons like scoreHit()'s: each FS parent,
// spouse or child named in the record ✓ +3 (children +2, at most three; a parent or
// spouse also by patronymic and birth year, isRelative()), with a close given name
// ≈ +2 (Astri for Astrid), a parent or spouse in the record with another given name
// ✗ -3, another patronymic or year ✗ -2 (not a census household's parents), the
// person's own date of birth against FS's full date (+3, +1 or -2),
// unmarried in a census after FS's marriage ✗ -3, an emigrant's destination among the
// FS places ✓ +2. DA's transcriptions of names can be far off, hence the small minus.
function checkRecord(record, P) {
  const reasons = [];
  // (kind 'child': a reason about a child, for childYearHits())
  const add = (points, text, ok, kind) => reasons.push({ points, text, ok, checked: true, ...(kind ? { kind } : {}) });
  const inRecord = relativesInRecord(record);

  // A parent: in a census household, the head or the head's spouse, and no ✗ there
  // (foster children, step-parents, and which one is which isn't known)
  const census = record.recordTypeInfo && record.recordTypeInfo.type === 'census';
  // In a census, a parent may head (or be married to the head of) another household
  // at the residence: the old parents on their føderaad, a grown child's family
  const elsewhere = census ? (record.others || []).flatMap((h) => h.filter((p) => ['head', 'spouse'].includes(roleKind(p)))) : [];
  const parent = (key, relative) => {
    if (!relative || !relative.given) return;
    const relation = t(key);
    const candidates = inRecord[key];
    const match = candidates.find((p) => isRelative(p, relative, record));
    const near = !match && elsewhere.find((p) => isRelative(p, relative, record));
    const close = !match && !near && !census && candidates.find((p) => isRelative(p, relative, record, true));
    if (match) add(3, t('{relation} {name} in the record', { relation, name: match.name }), true);
    else if (near) add(2, t('{relation} {name} at the same residence', { relation, name: near.name }), true);
    else if (close) add(2, t('{relation} {name} in the record, for {fs}', { relation, name: close.name, fs: relative.given.split(/\s+/)[0] }), null);
    else if (candidates.length && !census) differs(relation, candidates[0], [relative]);
  };
  // Another person where FS has a relative: -3 with another given name (Anne for
  // Astrid), -2 with the same or a close one (another patronymic or birth year)
  const differs = (relation, person, relatives) => {
    const named = relatives.some((r) => hasGivenName(person, r.given) || hasCloseName(person, r.given));
    add(named ? -2 : -3, relation + ' ' + notRelative(person, relatives, record), false);
  };
  parent('father', P.father);
  parent('mother', P.mother);

  if (P.spouses.length && inRecord.spouse.length) {
    const match = inRecord.spouse.find((p) => P.spouses.some((s) => isRelative(p, s, record)));
    const close = !match && !census && inRecord.spouse.find((p) => P.spouses.some((s) => isRelative(p, s, record, true)));
    if (match) add(3, t('{relation} {name} in the record', { relation: t('spouse'), name: match.name }), true);
    else if (close) {
      const spouse = P.spouses.find((s) => isRelative(close, s, record, true));
      add(2, t('{relation} {name} in the record, for {fs}', { relation: t('spouse'), name: close.name, fs: spouse.given.split(/\s+/)[0] }), null);
    } else differs(t('spouse'), inRecord.spouse[0], P.spouses);
  }

  // The person's own birth date in the record (a baptism's "Date of birth: 07-16")
  // against FS's full date: the same day ✓ +3; the same day a year off, or within
  // ten days ≈ +1; another day ✗ -2 (another child of the same name). Only when the
  // years are at most one apart: scoreHit() already counts a year further off.
  const birthDay = ownBirthDate(record);
  const fsBirth = P.birthDate;
  if (birthDay && fsBirth && fsBirth.exact) {
    const fs = formatDate(fsBirth.year, fsBirth.month, fsBirth.day);
    const here = formatDate(birthDay.year || '', birthDay.month, birthDay.day);
    const yearOff = birthDay.year ? Math.abs(birthDay.year - fsBirth.year) : 0;
    const sameDay = birthDay.month === fsBirth.month && birthDay.day === fsBirth.day;
    const days = birthDay.year ? Math.abs(Date.UTC(birthDay.year, birthDay.month - 1, birthDay.day) - Date.UTC(fsBirth.year, fsBirth.month - 1, fsBirth.day)) / 864e5 : null;
    if (sameDay && !yearOff) add(3, t('born {date}, as in FamilySearch', { date: here }), true);
    else if ((sameDay && yearOff === 1) || (days !== null && days <= 10)) add(1, t('born {date} (FamilySearch: {fs})', { date: here, fs }), null);
    else if (yearOff <= 1) add(-2, t('born {date}, not {fs} as in FamilySearch', { date: here, fs }), false);
  }

  const recordYear = Number(((record.recordDate || '').match(/^\d{4}/) || [])[0]) || null;
  let children = 0;
  for (const child of P.children) {
    if (children >= 3) break;
    const match = inRecord.child.find((p) => {
      if (child.given && !hasGivenName(p, child.given)) return false;
      const year = birthYearOf(p, record);
      return !child.year || !year || Math.abs(year - child.year) <= 2;
    });
    if (match && (child.given || child.year)) {
      add(2, t('{relation} {name} in the record', { relation: t('child'),
        name: match.name + (birthYearOf(match, record) ? ' (' + t('b.') + ' ' + birthYearOf(match, record) + ')' : '') }), true, 'child');
      children++;
    }
  }
  // A child's baptism naming another child than the FS child born that year: that
  // year's ✓ in the hit's score (scoreHit) was only the year
  const baptism = record.recordTypeInfo && record.recordTypeInfo.prefix === 'pd';
  if (baptism && recordYear && !children && inRecord.child.length) {
    const sameYear = P.children.find((c) => c.given && c.year && Math.abs(c.year - recordYear) <= 1);
    if (sameYear) add(-2, t('child') + ' ' + t('{name} in the record, not {fs}', { name: firstName(inRecord.child[0]), fs: sameYear.given.split(/\s+/)[0] }), false, 'child');
  }

  // A census's marital status: unmarried (ugift, ugivt) after FS's marriage
  const fields = record.fields || {};
  if (census && P.marriage && recordYear && recordYear > P.marriage.to && /^(ug|unmarried)/i.test(fields['marital status'] || '')) {
    add(-3, t('unmarried in {year}, married by {married} in FamilySearch', { year: recordYear, married: P.marriage.to }), false);
  }

  // Where an emigrant or someone moving was going: an FS place (Denver Col. for Denver)
  const destination = fields['destination'] || fields['migrating to'] || '';
  if (destination) {
    const found = P.places.flatMap(placeNames).find(({ names }) => names.some((n) => hasWord(destination, n)));
    if (found) add(2, t('going to {place}', { place: destination }), true);
  }
  return reasons;
}

// The record a hit links to, read with extractRecord() and kept for the session
async function fetchRecord(hit) {
  const key = 'rec:' + hit.url;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* storage unavailable */ }
  const html = await fetchResultPage(hit.url, false);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  await loadMoreResidents(doc, (url) => fetchResultPage(url, false));
  const full = extractRecord(doc, hit.url);
  if (full.error) throw new Error(full.error);
  const record = { people: full.people, others: full.others || [], fields: full.fields, recordTypeInfo: full.recordTypeInfo, recordDate: full.recordDate };
  try { sessionStorage.setItem(key, JSON.stringify(record)); } catch (e) { /* full or unavailable */ }
  return record;
}

// The hits worth checking: in each group, the best few (CHECK_PER_GROUP) scoring at
// least CHECK_MIN_SCORE (groups from groupHits()). In children's baptisms, first the
// best few of each known child's years (`P`, the profile) until a checked record
// names that child: a namesake's records can outscore the one baptism that has the
// child's father under another name.
function hitsToCheck(groups, P) {
  return groups.filter((g) => CHECKED_GROUPS.includes(g.title)).flatMap((g) => {
    const hits = g.hits.filter((h) => h.score >= CHECK_MIN_SCORE && h.url);
    const first = g.title === "Children's baptisms" && P ? childYearHits(hits, P) : [];
    const rest = hits.filter((h) => !first.includes(h));
    return [...first, ...rest].slice(0, Math.max(first.length, CHECK_PER_GROUP[g.title] || CHECK_DEFAULT));
  });
}

// For each known child no checked record names (a ✓ "child ..." of checkRecord()),
// the best three hits of the child's years (baptism in the birth year or the next)
function childYearHits(hits, P) {
  const yearOf = (h) => Number(((h.date || '').match(/\b(1[5-9]\d\d)\b/) || [])[1]);
  const named = (h) => (h.checks || []).some((r) => r.ok && r.kind === 'child');
  const first = [];
  for (const child of P.children.filter((c) => c.year)) {
    const mine = hits.filter((h) => yearOf(h) >= child.year && yearOf(h) <= child.year + 1);
    if (!mine.some(named)) first.push(...mine.slice(0, 3).filter((h) => !first.includes(h)));
  }
  return first.sort((a, b) => b.score - a.score);
}

// A DA source page (/en/source/NNN, the record's "Go to complete source
// information") → { archive, book, reference, series }: the archive's heading
// ("AV/SAK-1112-0006: Kristiansand domprosti"), the book, the last of its headings
// without the number ("L0013: Ministerialbok A-13" → "Ministerialbok A-13"), the
// archive reference ("AV/SAK-1112-0006/F/Fa/L0013"), and which of a parish's two
// church books it is: 'ministerial' (the priest's, series Fa) or 'clerk' (the parish
// clerk's klokkerbok, Fb), '' for anything else
function readSourcePage(doc) {
  const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
  const archive = text(doc.querySelector('.data-view h1'));
  const headings = [...doc.querySelectorAll('.additional-title h3')].map(text);
  const book = (headings[headings.length - 1] || '').replace(/^L\d+:\s*/, '');
  const label = [...doc.querySelectorAll('span')].find((s) => /^archive reference:?$/i.test(text(s)));
  const reference = label && label.nextElementSibling ? text(label.nextElementSibling) : '';
  const series = /\/F\/Fa\//.test(reference + '/') || /^ministerialbok\b/i.test(book) ? 'ministerial'
    : /\/F\/Fb\//.test(reference + '/') || /^klokkerbok\b/i.test(book) ? 'clerk' : '';
  return { archive, book, reference, series };
}

// A source page read (readSourcePage()), kept in sessionStorage (src:<url>); only DA's
async function fetchSource(url) {
  if (!onDigitalArkivet(url)) throw new Error('Not a Digitalarkivet address: ' + url);
  const key = 'src:' + url;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* storage unavailable */ }
  const source = readSourcePage(new DOMParser().parseFromString(await fetchResultPage(url, false), 'text/html'));
  try { sessionStorage.setItem(key, JSON.stringify(source)); } catch (e) { /* full or unavailable */ }
  return source;
}
