// Checking close hits on their record pages (Phase 2): a search hit gives only one
// person's name, years and residence, so several namesakes can score alike (three
// Peer Aslaksens in the 1801 census). The record page names the others in the record,
// the parents of a baptized child, the couple of a marriage, a census household, and
// they're compared with the person's FS relatives. Emigrant protocols also give the
// destination. Uses extractRecord() from da_record.js, fetchResultPage() from
// da_search.js and nameMatch(), hasWord(), placeNames() from da_match.js.

// How many hits of each group are checked, best first (more of the children's
// baptisms, each a different child), and the lowest score checked
const CHECK_PER_GROUP = { "Children's baptisms": 8, "Children's marriages": 6 };
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
  spouse: /^(wife|husband|wife of head|his wife|hu|((hans|hendes) )?(kone|hustru|ægtefælle|ektefelle|mand|mann|ektemann))\b/i,
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
      // which isn't known), the head's spouse is the head's, and the children theirs
      if (mine === 'child' && (theirs === 'head' || theirs === 'spouse')) { found.father.push(other); found.mother.push(other); }
      else if ((mine === 'head' && theirs === 'spouse') || (mine === 'spouse' && theirs === 'head')) found.spouse.push(other);
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

// The first given name of a record person ("Lars Halvorsen" → "Ole")
const firstName = (person) => (person.name || '').replace(/[%*]/g, '').split(/\s+/)[0] || '';

// The record compared with the person → reasons like scoreHit()'s: each FS parent,
// spouse or child named in the record ✓ +3 (children +2, at most three), a parent or
// spouse in the record with another name ✗ -2 (not a census household's parents),
// unmarried in a census after FS's marriage ✗ -3, an emigrant's destination among the
// FS places ✓ +2. DA's transcriptions of names can be far off, hence the small minus.
function checkRecord(record, P) {
  const reasons = [];
  const add = (points, text, ok) => reasons.push({ points, text, ok, checked: true });
  const inRecord = relativesInRecord(record);

  // A parent: in a census household, the head or the head's spouse, and no ✗ there
  // (foster children, step-parents, and which one is which isn't known)
  const census = record.recordTypeInfo && record.recordTypeInfo.type === 'census';
  // In a census, a parent may head (or be married to the head of) another household
  // at the residence: the old parents on their føderaad, a grown child's family
  const elsewhere = census ? (record.others || []).flatMap((h) => h.filter((p) => ['head', 'spouse'].includes(roleKind(p)))) : [];
  const parent = (relation, relative) => {
    if (!relative || !relative.given) return;
    const candidates = inRecord[relation];
    const match = candidates.find((p) => hasGivenName(p, relative.given));
    const near = !match && elsewhere.find((p) => hasGivenName(p, relative.given));
    if (match) add(3, relation + ' ' + match.name + ' in the record', true);
    else if (near) add(2, relation + ' ' + near.name + ' at the same residence', true);
    else if (candidates.length && !census) {
      add(-2, relation + ' ' + firstName(candidates[0]) + ' in the record, not ' + relative.given.split(/\s+/)[0], false);
    }
  };
  parent('father', P.father);
  parent('mother', P.mother);

  if (P.spouses.length && inRecord.spouse.length) {
    const match = inRecord.spouse.find((p) => P.spouses.some((s) => hasGivenName(p, s.given)));
    if (match) add(3, 'spouse ' + match.name + ' in the record', true);
    else add(-2, 'spouse ' + firstName(inRecord.spouse[0]) + ' in the record, not ' + P.spouses.map((s) => s.given.split(/\s+/)[0]).join(' or '), false);
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
      add(2, 'child ' + match.name + (birthYearOf(match, record) ? ' (b. ' + birthYearOf(match, record) + ')' : '') + ' in the record', true);
      children++;
    }
  }
  // A child's baptism naming another child than the FS child born that year: that
  // year's ✓ in the hit's score (scoreHit) was only the year
  const baptism = record.recordTypeInfo && record.recordTypeInfo.prefix === 'pd';
  if (baptism && recordYear && !children && inRecord.child.length) {
    const sameYear = P.children.find((c) => c.given && c.year && Math.abs(c.year - recordYear) <= 1);
    if (sameYear) add(-2, 'child ' + firstName(inRecord.child[0]) + ' in the record, not ' + sameYear.given.split(/\s+/)[0], false);
  }

  // A census's marital status: unmarried (ugift, ugivt) after FS's marriage
  const fields = record.fields || {};
  if (census && P.marriage && recordYear && recordYear > P.marriage.to && /^(ug|unmarried)/i.test(fields['marital status'] || '')) {
    add(-3, 'unmarried in ' + recordYear + ', married by ' + P.marriage.to + ' in FS', false);
  }

  // Where an emigrant or someone moving was going: an FS place (Denver Col. for Denver)
  const destination = fields['destination'] || fields['migrating to'] || '';
  if (destination) {
    const found = P.places.flatMap(placeNames).find(({ names }) => names.some((n) => hasWord(destination, n)));
    if (found) add(2, 'going to ' + destination, true);
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
  const full = extractRecord(doc, hit.url);
  if (full.error) throw new Error(full.error);
  const record = { people: full.people, others: full.others || [], fields: full.fields, recordTypeInfo: full.recordTypeInfo, recordDate: full.recordDate };
  try { sessionStorage.setItem(key, JSON.stringify(record)); } catch (e) { /* full or unavailable */ }
  return record;
}

// The hits worth checking: in each group, the best few (CHECK_PER_GROUP) scoring at
// least CHECK_MIN_SCORE (groups from groupHits())
function hitsToCheck(groups) {
  return groups.filter((g) => CHECKED_GROUPS.includes(g.title))
    .flatMap((g) => g.hits.filter((h) => h.score >= CHECK_MIN_SCORE && h.url).slice(0, CHECK_PER_GROUP[g.title] || CHECK_DEFAULT));
}
