// The DA Linker (Phase 3): a DA record as a FamilySearch source, attached to the tree
// persons it names, the way FS's own Source Linker attaches a record. The page is the
// pause before anything is saved: the source's title, date, web page, citation and
// notes can be edited, and each person in the record is paired with a tree person (the
// FS person and their family, suggested by role and name), with the tags and the
// reason for the attachment. A child baptized by given name only can get a surname
// (the father's patronymic, or the FS name), and the new name goes into the title,
// citation and notes. Nothing goes to FS until "Create source and attach"; then the
// page drives an FS tab step by step (fs_attach.js): create the source in the
// SourceBox, attach it to each paired person by PID, and set their tags.
//
// Opened as linker.html?rec=<DA record page>&pid=<FS PID> (the search page's "Review &
// Attach": the record's open person is the FS person), or linker.html?draft=<key> (the
// toolbar icon on a DA page: background.js keeps gatherData()'s result in
// chrome.storage.session). The FS person and family come from chrome.storage.local
// (`person:<PID>`, kept by background.js when the search page is opened from FS).
// Uses extractRecord() (da_record.js), fetchResultPage(), patronymicOf(),
// isPatronymic() (da_search.js), relativesInRecord(), roleKind(), hasGivenName(),
// birthYearOf() (da_verify.js).

const SOURCEBOX_URL = 'https://www.familysearch.org/en/tree/sources/sourceBox';
const personSourcesUrl = (pid) => 'https://www.familysearch.org/en/tree/person/sources/' + encodeURIComponent(pid);

// FS's vital tags (the tag dialog's chips: source-vital-tag-chip-<Name>), and a
// residence (one of the person's other conclusions)
const TAGS = [['Name', 'Name'], ['Gender', 'Sex'], ['Birth', 'Birth'], ['Christening', 'Christening'],
  ['Death', 'Death'], ['Burial', 'Burial'], ['Residence', 'Residence']];

const PID_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{2,4}$/i;

// --- Names ----------------------------------------------------------------------------

function stripVariants(name) { return (name || '').replace(/%[^%]*%/g, ' ').replace(/\s+/g, ' ').trim(); }
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The given names of an FS name: up to the patronymic, else all but the last word
// ("Halvor Larsen Bakken" → "Knud", "Anna Magdaline Lindeman" → "Anna Magdaline")
function givenOf(name) {
  const words = (name || '').split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.join(' ');
  const i = words.findIndex((w, k) => k > 0 && isPatronymic(w));
  return words.slice(0, i > 0 ? i : -1).join(' ');
}

// A name in a title or citation: "1845, Ole, son of ...", "baptism of Ole, 3 January",
// "Lars Halvorsen and Kari", "Lars Halvorsen household" (whole names only, so "Ole" isn't
// found in "Lars Halvorsen")
function renamePhrase(text, oldName, newName) {
  if (!oldName || oldName === newName) return text;
  const re = new RegExp('(^|, | and | of )' + escapeRe(oldName) + '(?=$|,| -| and | household|;|\\.)');
  return text.replace(re, (all, before) => before + newName);
}

// A person's line in the notes: "Child: Ole *", "Father: Halvor Larsen (b. 1810)"
function renameNoteLine(notes, role, oldName, newName) {
  if (!oldName || oldName === newName) return notes;
  const re = new RegExp('^(' + escapeRe(role) + ': )' + escapeRe(oldName) + '(?= \\*| \\(|$)', 'm');
  return notes.replace(re, (all, before) => before + newName);
}

// A baptized child's title without ", son of Halvor Larsen" (once the child has a surname)
const dropChildOf = (title) => title.replace(/, (son|daughter|child) of [^-]+?(?= - |$)/, '');

// --- The record and its people --------------------------------------------------------

// The record's people for pairing: the record's family (extractRecord's people), and
// the open person when the principal's page left them out (a godparent). Each gets a
// `key`, and `current` marks the anchor (whose relatives relativesInRecord() finds).
// In a census, the residence's other households follow (`household`: 0 the record's
// own, 1, 2, ... the others, as DA lists them).
function recordPeople(record, anchorId, openPerson) {
  const people = (record.people || []).map((p) => ({ ...p, household: 0 }));
  (record.others || []).forEach((h, i) => { for (const p of h) people.push({ ...p, household: i + 1, primary: false }); });
  if (openPerson && openPerson.id && !people.some((p) => p.id === openPerson.id)) people.push({ ...openPerson, primary: false, household: 0 });
  people.forEach((p, i) => {
    p.key = p.id || 'person' + i;
    p.current = anchorId ? p.id === anchorId : !!p.current;
  });
  return people;
}

// The FS person and their family, as options: [{pid, name, relation, year, gender}]
function treeFamily(fs) {
  if (!fs) return [];
  const year = (lifespan) => Number(((lifespan || '').match(/^\d{4}/) || [])[0]) || null;
  const out = [{ pid: fs.pid, name: fs.name, relation: 'person', gender: fs.gender, year: year((fs.birth || fs.christening || {}).date) }];
  const add = (p, relation) => {
    if (p && p.pid && !out.some((o) => o.pid === p.pid)) out.push({ pid: p.pid, name: p.name, relation, gender: p.gender, year: year(p.lifespan) });
  };
  add(fs.father, 'father');
  add(fs.mother, 'mother');
  for (const f of fs.families || []) add(f.spouse, 'spouse');
  for (const f of fs.families || []) for (const c of f.children || []) add(c, 'child');
  return out;
}

// Which record person is the FS person: the anchor (the search hit), or, from the
// toolbar icon, the record person with the FS person's given name (the anchor first)
function findSelf(people, fs, trusted) {
  const anchor = people.find((p) => p.current);
  if (trusted || !fs) return anchor || null;
  const given = givenOf(fs.name);
  if (anchor && hasGivenName(anchor, given)) return anchor;
  return people.find((p) => hasGivenName(p, given)) || null;
}

// Suggested pairs {key: pid}: the FS person, and the relatives the record names (by
// relativesInRecord() from the FS person's entry) with an FS relative's given name
// (children also by birth year ±2). A single father, mother or spouse in a church
// book with another name isn't paired (a second wife, a namesake), but named in the
// hint, since DA's transcriptions of names can be far off; in a census, where the
// head and spouse could be either parent, only names count.
function suggestPairs(record, people, self, fs) {
  const pairs = {};
  const why = {};
  if (!self || !fs) return { pairs, why };
  pairs[self.key] = fs.pid;
  why[self.key] = 'the FamilySearch person';
  const view = { ...record, people: people.map((p) => ({ ...p, current: p === self })) };
  const found = relativesInRecord(view);
  const back = (p) => people[view.people.indexOf(p)];
  const census = record.recordTypeInfo && record.recordTypeInfo.type === 'census';
  const used = new Set([fs.pid]);
  const pair = (person, tree, reason) => {
    if (!person || !tree || pairs[person.key] || used.has(tree.pid)) return;
    pairs[person.key] = tree.pid;
    why[person.key] = reason;
    used.add(tree.pid);
  };
  const single = (relation, tree) => {
    if (!tree || !tree.pid) return;
    const candidates = found[relation].map(back);
    const byName = candidates.find((p) => hasGivenName(p, givenOf(tree.name)));
    if (byName) pair(byName, tree, relation + ', same given name');
    else if (!census && candidates.length === 1) other(candidates[0], tree, relation);
  };
  // Named in the hint, not paired
  const other = (person, tree, relation) => {
    if (!pairs[person.key] && !why[person.key]) why[person.key] = 'FamilySearch ' + relation + ' is ' + tree.name + ', another name: choose them if it\'s the same person';
  };
  single('father', fs.father);
  single('mother', fs.mother);
  const spouses = (fs.families || []).map((f) => f.spouse).filter((s) => s && s.pid);
  for (const s of spouses) {
    const match = found.spouse.map(back).find((p) => hasGivenName(p, givenOf(s.name)));
    if (match) pair(match, s, 'spouse, same given name');
  }
  if (spouses.length === 1 && !census && found.spouse.length === 1) other(back(found.spouse[0]), spouses[0], 'spouse');
  const children = (fs.families || []).flatMap((f) => f.children || []).filter((c) => c.pid);
  for (const child of found.child) {
    const year = birthYearOf(child, record);
    const tree = children.find((c) => {
      const born = Number(((c.lifespan || '').match(/^\d{4}/) || [])[0]) || null;
      return hasGivenName(child, givenOf(c.name)) && (!born || !year || Math.abs(born - year) <= 2);
    });
    if (tree) pair(back(child), tree, 'child, same given name' + (year ? ' and birth year' : ''));
  }
  return { pairs, why };
}

// --- A census residence ---------------------------------------------------------------
// A residence often holds related households (the old parents on føderaad, a married
// son's family, a lodger who is a brother). Its residents are paired outward from the
// FS person through the tree: the FS person's relatives, then each paired relative's
// own relatives (their tree families, read from FS: `trees`), wherever they live at the
// residence. A relative is paired with a resident of the same given name (one of its
// forms) whose age fits: the FS birth year ±3, and where FS has none, older or younger
// than the relative by 15 years for a parent or child. In the relative's own household
// the roles must fit too (the head's wife isn't paired with an FS daughter); a close
// given name (Mari for Marit) is paired only with a fitting year and household role.

const treeYear = (t) => Number(((t && (t.lifespan || (t.birth || t.christening || {}).date)) || '').match(/\b1[5-9]\d\d\b/)?.[0]) || null;

// The tree person's relatives: [{tree, rel}] (rel: father, mother, spouse, child)
function treeRelatives(tree) {
  const out = [];
  if (tree.father && tree.father.pid) out.push({ tree: tree.father, rel: 'father' });
  if (tree.mother && tree.mother.pid) out.push({ tree: tree.mother, rel: 'mother' });
  for (const f of tree.families || []) if (f.spouse && f.spouse.pid) out.push({ tree: f.spouse, rel: 'spouse' });
  for (const f of tree.families || []) for (const c of f.children || []) if (c.pid) out.push({ tree: c, rel: 'child' });
  return out.filter((r, i) => out.findIndex((o) => o.tree.pid === r.tree.pid) === i);
}

// 2: a record person has the tree person's given name (or a form of it); 1: a close
// one (the record's name is a stem of FS's: Mari for Marit); 0: another name
function givenNameFit(person, tree) {
  const given = givenOf(stripVariants(tree.name));
  if (hasGivenName(person, given)) return 2;
  const first = stripVariants(person.name).split(/\s+/)[0] || '';
  return first && given.split(/\s+/).some((g) => nameMatch(g, first)) ? 1 : 0;
}

// A resident's sex where the record tells it: a patronymic (Olsdatter, Halvorsen) or a
// family position (hans Kone, deres Søn; the census codes d and s) → 'Male', 'Female' or ''
const FEMALE_ROLE = /\b(kone|hustru|hustroe|datter|dotter|daughter|wife|mother|moder|mor|enke|widow|søster|søstre|sister|pige|tjenestepige|husmor|d)\b/i;
const MALE_ROLE = /\b(søn|son|fader|far|father|mand|husband|husbond|hosbonde|enkemand|widower|broder|bror|brother|dreng|tjenestedreng|s)\b/i;
function recordSex(person) {
  const last = stripVariants(person.name).split(/\s+/).slice(1).join(' ');
  if (/(datter|dotter|dtr\.?|sd\.?)(\s|$)/i.test(last)) return 'Female';
  if (/(sen|søn|son)(\s|$)/i.test(last) && !FEMALE_ROLE.test(person.role || '')) return 'Male';
  const role = (person.role || '') + ' ' + (person.roleEnglish || '').replace(/\[.*?\]/g, '');
  if (FEMALE_ROLE.test(role) && !MALE_ROLE.test(role)) return 'Female';
  if (MALE_ROLE.test(role) && !FEMALE_ROLE.test(role)) return 'Male';
  return '';
}

// Two names with patronymics of different fathers (Imbjør Gulbrandsdatter isn't
// Ingrid Larsdr; Ole Jakobsen isn't Lars Halvorsen). Spellings of one father's name
// agree: Halvardsen/Halvorsen, Olsson/Olsen, Torsdatter/Tordsdatter.
function patronymicClash(recordName, treeName) {
  const pats = (name) => stripVariants(name).split(/\s+/).slice(1).filter(isPatronymic)
    .map((w) => patronymicBase(w).toLowerCase()).filter(Boolean);
  const a = pats(recordName), b = pats(treeName);
  if (!a.length || !b.length) return false;
  const agree = (x, y) => x.startsWith(y) || y.startsWith(x) || nameMatch(x, y) || nameMatch(y, x);
  return !a.some((x) => b.some((y) => agree(x, y)));
}

// A record name with the patronymic of a father of this given name (Iver Olsen, Ole)
function patronymicFrom(name, fatherGiven) {
  const base = patronymicBase(patronymicOf(firstWord(stripVariants(fatherGiven)))).toLowerCase();
  if (!base) return false;
  return stripVariants(name).split(/\s+/).slice(1).filter(isPatronymic).map((w) => patronymicBase(w).toLowerCase())
    .some((x) => x.startsWith(base) || base.startsWith(x) || nameMatch(x, base) || nameMatch(base, x));
}

// The household of a record person as relativesInRecord() sees it: the household's
// first resident is its head when no family position says otherwise (1865's "hans
// Fader" heading the old parents' household)
function householdRelatives(record, people, me) {
  const members = people.filter((p) => p.household === me.household);
  const view = { ...record, people: members.map((p, i) => ({ ...p, current: p === me,
    roleEnglish: i === 0 && !['head', 'spouse', 'child'].includes(roleKind(p)) ? 'Head of household' : p.roleEnglish })) };
  const found = relativesInRecord(view);
  const back = (list) => list.map((v) => members[view.people.indexOf(v)]);
  return { father: back(found.father), mother: back(found.mother), spouse: back(found.spouse), child: back(found.child) };
}

// --- How the census says the residents are related -----------------------------------
// A family position names a relation to the household's head ("hans Moder", "Konens
// Søster"); a household's first resident with one is related to the residence's first
// household's head instead: 1865's "hans Fader" heading household 02 is the father of
// Halvor Larsen, head of household 01, and his wife ("hans Kone") Halvor's mother. Heads
// that are only "Husbond" or "Logerende" (1801's farm) say nothing of the others.
const KIN_TERMS = [
  ['father', /^(fader|far)$/], ['mother', /^(moder|mor)$/],
  ['child', /^(søn|sønn|datter|dotter|barn|børn|born)$/],
  ['sibling', /^(broder|bror|søster|syster|søskende|sødskende)$/],
  ['kin', /^(sviger\S*|svoger|sted\S+|pleie\S+|foster\S*|sønne\S+|datter\S+|barnebarn|bedste\S+|farbro(de)?r|morbro(de)?r|faster|moster|tante|onkel|nevø|niece|broder\S+|søster\S+|fætter|kusine|frænde|sl(e|æ)gt\S*)$/]
];
function censusKin(person) {
  const role = (person.role || '').split(',')[0].replace(/\[.*?\]/g, '').trim().toLowerCase();
  const m = role.match(/^(?:(hans|hendes|husbondens|husfaderens|husmoderens|konens|hustruens|mandens|deres)\s+)?(\S+)$/);
  if (!m) return '';
  for (const [kind, re] of KIN_TERMS) if (re.test(m[2])) return /^(konens|hustruens|mandens)$/.test(m[1] || '') ? 'kin' : kind;
  return '';
}

// The relations the census states: [{a, rel, b}] (a is b's rel). The residence's
// first household is the one with the lowest number (else the record's own).
function residenceKin(people) {
  const households = [...new Set(people.map((p) => p.household))];
  const members = (h) => people.filter((p) => p.household === h && p.name);
  const headOf = (h) => members(h).find((p) => roleKind(p) === 'head') || members(h)[0];
  const no = (h) => Number((members(h)[0] || {}).householdNo) || Infinity;
  const main = households.slice().sort((x, y) => no(x) - no(y) || x - y)[0];
  const edges = [];
  for (const h of households) {
    const list = members(h), head = headOf(h);
    list.forEach((p, i) => {
      const kin = censusKin(p);
      if (!kin) return;
      if (i === 0 && h !== main) {
        const ref = headOf(main);
        if (!ref) return;
        edges.push({ a: p, rel: kin, b: ref });
        // The household's others: the head's wife is the other parent, their children
        // the main head's siblings
        const parent = kin === 'father' || kin === 'mother';
        for (const q of list.slice(1)) {
          const k = roleKind(q);
          if (k === 'spouse') edges.push({ a: q, rel: kin === 'father' ? 'mother' : kin === 'mother' ? 'father' : 'kin', b: ref });
          else if (k === 'child') edges.push({ a: q, rel: parent ? 'sibling' : 'kin', b: ref });
        }
      } else if (p !== head && kin !== 'child') {
        edges.push({ a: p, rel: kin, b: head });  // "deres Søn" is roleKind's
      }
    });
  }
  return edges;
}
const kinCache = new WeakMap();
function residenceKinOf(people) {
  if (!kinCache.has(people)) kinCache.set(people, residenceKin(people));
  return kinCache.get(people);
}

// What the census says x is to y: 'father', 'mother', 'parent', 'child', 'sibling', 'kin' or ''
function censusRelation(people, x, y) {
  for (const e of residenceKinOf(people)) {
    if (e.a === x && e.b === y) return e.rel;
    if (e.a === y && e.b === x) return e.rel === 'father' || e.rel === 'mother' ? 'child' : e.rel === 'child' ? 'parent' : e.rel;
  }
  return '';
}

// The households the census links to household 0 (the record's own), itself included
function linkedHouseholds(people) {
  const linked = new Set([0]);
  const edges = residenceKinOf(people).filter((e) => e.a.household !== e.b.household);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of edges) {
      if (linked.has(e.a.household) !== linked.has(e.b.household)) { linked.add(e.a.household); linked.add(e.b.household); grew = true; }
    }
  }
  return linked;
}

const REL_WORDS = { father: 'father', mother: 'mother', spouse: 'spouse', child: 'child' };
function relWord(rel, gender) {
  if (rel === 'spouse') return /^m/i.test(gender || '') ? 'husband' : /^f/i.test(gender || '') ? 'wife' : 'spouse';
  if (rel === 'child') return /^m/i.test(gender || '') ? 'son' : /^f/i.test(gender || '') ? 'daughter' : 'child';
  return REL_WORDS[rel];
}

// How well a resident fits as the tree relative of a paired resident → {score, why} or null
function residentFit(record, people, from, fromTree, candidate, rel, tree) {
  const name = givenNameFit(candidate, tree);
  if (!name) return null;
  // The sex, where both tell it; a close given name needs it (Johanne isn't Johannes)
  const sex = recordSex(candidate), fsSex = /^(male|female)$/i.test(tree.gender || '') ? tree.gender : '';
  if (sex && fsSex && sex.toLowerCase() !== fsSex.toLowerCase()) return null;
  if (name === 1 && !(sex && fsSex)) return null;
  if (patronymicClash(candidate.name, tree.name)) return null;
  const yc = birthYearOf(candidate, record), yt = treeYear(tree), yf = birthYearOf(from, record);
  const recordYear = Number(((record.recordDate || '').match(/^\d{4}/) || [])[0]) || null;
  let score = name === 2 ? 3 : 1;
  const why = [relWord(rel, tree.gender) + ' of ' + stripVariants(fromTree.name) + ' in FamilySearch', name === 2 ? 'same given name' : 'close given name (FamilySearch: ' + tree.name + ')'];
  const yearFits = !!(yc && yt);
  if (yearFits) {
    const d = Math.abs(yc - yt);
    if (d > 3) return null;
    score += [3, 3, 2, 1][d];
    why.push('birth year ' + yt);
  }
  // What the census says of the two (across households too); else the roles in the
  // paired resident's own household
  let roleFits = false;
  const told = censusRelation(people, candidate, from);
  if (told) {
    const wanted = rel === 'father' || rel === 'mother' ? [rel, 'parent'] : [rel];
    if (wanted.includes(told)) roleFits = true;
    else if (told !== 'kin') return null;  // the census says otherwise
    if (candidate.household !== from.household) why.push('household no. ' + (candidate.householdNo || '?'));
  } else if (candidate.household === from.household) {
    const rels = householdRelatives(record, people, from);
    const kinds = Object.keys(rels).filter((k) => rels[k].includes(candidate));
    const wanted = rel === 'father' || rel === 'mother' ? ['father', 'mother'] : [rel];
    if (kinds.some((k) => wanted.includes(k))) roleFits = true;
    else if (kinds.length) return null;  // another relation in the household
  } else {
    why.push('household no. ' + (candidate.householdNo || '?'));
  }
  if (roleFits) score += 2;
  // Ages: a parent 15 years older, a child 15 younger, a spouse within 25
  if (yc && yf) {
    if ((rel === 'father' || rel === 'mother') && yc > yf - 15) return null;
    if (rel === 'child' && yc < yf + 15) return null;
    if (rel === 'spouse' && Math.abs(yc - yf) > 25) return null;
  }
  // A spouse: both grown up at the census, and in the same household or of FS's year
  // (a five-year-old in another household isn't the wife, whatever her name)
  if (rel === 'spouse') {
    if (recordYear && ((yc && recordYear - yc < 16) || (yf && recordYear - yf < 16))) return null;
    if (!yearFits && !roleFits) return null;
  }
  if (name === 1 && !(yearFits && roleFits)) return null;
  // Only the name and plausible ages: in the paired resident's household; elsewhere at
  // the residence the year, the census or the patronymic must tell (Iver Olsen, a
  // lodger, son of Lars Halvorsen in the next household)
  const named = (rel === 'father' && patronymicFrom(from.name, candidate.name)) ||
    (rel === 'child' && /^m/i.test(fromTree.gender || '') && patronymicFrom(candidate.name, from.name));
  if (named && !yearFits && !roleFits) why.push('patronymic');
  if (!yearFits && !roleFits && !(yc && yf && (candidate.household === from.household || named))) return null;
  return { score, why: why.join(', ') };
}

// Pairs for a census residence {pairs, why, need}: `people` are all the residents
// (with `household`), `trees` the known tree persons by PID (the FS person's and
// relatives' families). `need` are paired relatives whose families aren't known yet,
// while residents are left unpaired.
function suggestResidencePairs(record, people, fs, trees, trusted) {
  const pairs = {}, why = {}, need = [];
  if (!fs) return { pairs, why, need };
  const known = (pid) => (pid === fs.pid ? fs : trees[pid]) || null;
  const used = new Set();
  const paired = new Set();
  const take = (person, tree, reason) => {
    pairs[person.key] = tree.pid;
    why[person.key] = reason;
    used.add(tree.pid);
    paired.add(person);
  };
  // The relatives of one paired resident, best fits first
  const pairAround = (from, fromTree, dry) => {
    const options = [];
    for (const { tree, rel } of treeRelatives(fromTree)) {
      if (used.has(tree.pid)) continue;
      for (const candidate of people) {
        if (paired.has(candidate) || candidate === from) continue;
        const fit = residentFit(record, people, from, fromTree, candidate, rel, tree);
        if (fit) options.push({ candidate, tree, ...fit });
      }
    }
    options.sort((a, b) => b.score - a.score);
    const got = [];
    const takenHere = new Set(), treesHere = new Set();
    for (const o of options) {
      if (takenHere.has(o.candidate) || treesHere.has(o.tree.pid)) continue;
      takenHere.add(o.candidate);
      treesHere.add(o.tree.pid);
      got.push(o);
    }
    if (!dry) for (const o of got) take(o.candidate, o.tree, o.why);
    return got;
  };

  // The FS person: the anchor when it is theirs (a search hit) and the record doesn't
  // contradict FS, else the resident with their given name, birth year and patronymic
  // (FS's, or the FS father's) around whom their family fits best
  const year = treeYear(fs);
  const fsSex = /^(male|female)$/i.test(fs.gender || '') ? fs.gender : '';
  const fsNames = [fs.name, fs.father ? givenOf(fs.name) + ' ' + patronymicOf(fs.father.name, fsSex) : ''].filter(Boolean);
  const contradicts = (p) => {
    const y = birthYearOf(p, record), sex = recordSex(p);
    if (year && y && Math.abs(y - year) > 3) return 'b. ' + year + ', here b. about ' + y;
    if (sex && fsSex && sex.toLowerCase() !== fsSex.toLowerCase()) return fsSex.toLowerCase() + ', here ' + sex.toLowerCase();
    if (fsNames.some((n) => patronymicClash(p.name, n))) return 'another patronymic';
    return '';
  };
  const anchor = people.find((p) => p.current);
  const fits = people.filter((p) => givenNameFit(p, fs) === 2 && !contradicts(p));
  const candidates = trusted && anchor && (!contradicts(anchor) || !fits.length) ? [anchor] : fits;
  let self = null, best = -Infinity;
  for (const c of candidates) {
    paired.add(c);
    const y = birthYearOf(c, record);
    const n = pairAround(c, fs, true).reduce((s, o) => s + o.score, 0) + (year && y ? 3 - Math.abs(y - year) : 0) + (c.current ? 0.5 : 0);
    paired.delete(c);
    if (n > best) { best = n; self = c; }
  }
  if (!self) return { pairs, why, need };
  take(self, fs, 'the FamilySearch person');
  // The opened record person, who the search took for the FS person, but isn't
  if (trusted && anchor && self !== anchor) {
    why[anchor.key] = 'the record opened, but FamilySearch ' + stripVariants(fs.name) + ' is ' + contradicts(anchor) +
      '; paired with ' + stripVariants(self.name) + (self.householdNo ? ', household no. ' + self.householdNo : '') + ' instead';
  }

  // Outward through the tree: each paired resident's relatives, while their tree
  // families are known
  const queue = [{ person: self, tree: fs }];
  while (queue.length) {
    const { person, tree } = queue.shift();
    for (const o of pairAround(person, tree, false)) {
      const theirs = known(o.tree.pid);
      if (theirs) queue.push({ person: o.candidate, tree: theirs });
      else need.push(o.tree.pid);
    }
  }
  hintOthers(record, people, paired, why, (pid) => (pid === fs.pid ? fs : trees[pid]) || null, pairs);
  const left = people.some((p) => !paired.has(p) && p.name);
  return { pairs, why, need: left ? need : [] };
}

// The parents and spouse of a paired resident in their own household whom FS has
// otherwise (another name, or another age: Halvor Moen, 66, for an FS father born 1762)
// are named in the hint, not paired: the record or the tree may be wrong
function hintOthers(record, people, paired, why, known, pairs) {
  for (const person of people) {
    const tree = paired.has(person) ? known(pairs[person.key]) : null;
    if (!tree) continue;
    const rels = householdRelatives(record, people, person);
    const fsOf = { father: tree.father ? [tree.father] : [], mother: tree.mother ? [tree.mother] : [],
      spouse: (tree.families || []).map((f) => f.spouse).filter(Boolean) };
    for (const rel of ['father', 'mother', 'spouse']) {
      const sexWanted = rel === 'father' ? 'Male' : rel === 'mother' ? 'Female' : '';
      const here = rels[rel].filter((p) => !paired.has(p) && !why[p.key] && (!sexWanted || recordSex(p) === sexWanted));
      if (here.length !== 1 || fsOf[rel].length !== 1) continue;
      const fsRel = fsOf[rel][0], p = here[0];
      const y = birthYearOf(p, record), fy = treeYear(fsRel);
      const word = relWord(rel, fsRel.gender) + ' of ' + stripVariants(tree.name);
      why[p.key] = 'FamilySearch ' + word + ' is ' + fsRel.name + (fy ? ', b. ' + fy : '') +
        (!givenNameFit(p, fsRel) ? ', another name' : patronymicClash(p.name, fsRel.name) ? ', another patronymic'
          : '; here b. about ' + (y || '?')) + ': choose them if it\'s the same person';
    }
  }
}

// The tree persons to choose from: the FS person's family, then each read relative's
// (labelled by whose they are: "wife of Halvor Larsen")
function treePool(fs, trees) {
  const out = treeFamily(fs);
  for (const tree of Object.values(trees || {})) {
    if (!tree || !tree.pid || (fs && tree.pid === fs.pid)) continue;
    for (const { tree: t, rel } of treeRelatives(tree)) {
      if (!out.some((o) => o.pid === t.pid)) out.push({ pid: t.pid, name: t.name, relation: relWord(rel, t.gender) + ' of ' + tree.name, gender: t.gender, year: treeYear(t) });
    }
  }
  return out;
}

// The tags a record gives a person (they can be changed before attaching)
function defaultTags(type, kind) {
  if (type === 'birth_baptism') return kind === 'child' ? ['Name', 'Gender', 'Birth', 'Christening'] : ['Name'];
  if (type === 'death_burial') return kind === 'deceased' ? ['Name', 'Death', 'Burial'] : ['Name'];
  if (type === 'census') return ['Name', 'Gender', 'Residence'];
  return ['Name'];
}

const RECORD_WORDS = {
  birth_baptism: 'baptism', marriage: 'marriage', death_burial: 'burial', confirmation: 'confirmation',
  census: 'census', emigration: 'emigration', out_migration: 'moving record', in_migration: 'moving record', probate: 'probate'
};

// The reason for attaching, as FS asks for one: "Father in the baptism of Ole (1845),
// Digitalarkivet pd00000012345678."
function defaultReason(record, person) {
  const role = person.roleEnglish || person.role || 'Named';
  const what = RECORD_WORDS[record.recordTypeInfo && record.recordTypeInfo.type] || 'record';
  const year = ((record.recordDate || '').match(/^\d{4}/) || [])[0];
  // A census: where ("at Bakken nedre, Nordlien"), and which household when not the record's own
  const census = record.census || {};
  const where = [census.residence, census.district].filter(Boolean).join(', ');
  const household = person.household && person.householdNo ? ', household no. ' + person.householdNo : '';
  return role + ' in this ' + what + (year ? ' (' + year + ')' : '') + (where ? ' at ' + where : '') + household +
    ' on Digitalarkivet, ' + (record.permanentId || record.url) + '.';
}

// Surnames to offer for a person recorded by given name only: the father's
// patronymic (from the record's father, by the sex the record or the paired FS person
// gives; both when neither does), and the paired FS person's own name
function surnameSuggestions(person, people, record, tree) {
  const name = stripVariants(person.name);
  if (!name || name.split(/\s+/).length > 1) return [];
  const out = [];
  if (tree && tree.name && tree.name.split(/\s+/).length > 1 && hasGivenName(person, givenOf(tree.name))) {
    out.push({ name: tree.name, label: 'FamilySearch name' });
  }
  if (roleKind(person) === 'child' && record.recordTypeInfo && record.recordTypeInfo.type !== 'census') {
    const father = people.find((p) => roleKind(p) === 'father' && p.name);
    if (father) {
      const own = person.primary ? (record.fields || {})['gender'] : '';  // the fields are the primary person's
      const sex = tree && tree.gender ? tree.gender : /^m/i.test(own || '') ? 'Male' : /^(k|f)/i.test(own || '') ? 'Female' : '';
      for (const s of sex ? [sex] : ['Male', 'Female']) {
        const pat = patronymicOf(stripVariants(father.name), s);
        if (pat && !out.some((o) => o.name === name + ' ' + pat)) out.push({ name: name + ' ' + pat, label: 'father\'s patronymic' });
      }
    }
  }
  return out;
}

// --- Loading --------------------------------------------------------------------------

// The record from DA: the page `rec` (a search hit, the FS person's own entry), and
// for the source fields the principal's page of it (the baptized child's, ...)
async function loadFromDA(rec) {
  const read = async (url) => extractRecord(new DOMParser().parseFromString(await fetchResultPage(url, false), 'text/html'), url);
  const open = await read(rec);
  if (open.error) throw new Error(open.error);
  let record = open;
  if (open.principalUrl) {
    try {
      const principal = await read(open.principalUrl);
      if (!principal.error) record = principal;
    } catch (e) { console.warn('arkivet2fs: could not read the principal page ' + open.principalUrl, e); }
  }
  const openPerson = open.people.find((p) => p.current) || null;
  return { record, openPerson, anchorId: openPerson ? openPerson.id : '' };
}

async function loadDraft(key) {
  const stored = (await chrome.storage.session.get(key))[key];
  if (!stored) throw new Error('The record is no longer here. Click the extension icon on the DA page again.');
  const openPerson = stored.openPerson || null;
  return { record: stored, openPerson, anchorId: openPerson ? openPerson.id : stored.primaryPersonId };
}

async function storedPerson(pid) {
  if (!pid) return null;
  try { return (await chrome.storage.local.get('person:' + pid))['person:' + pid] || null; } catch (e) { return null; }
}

async function recentPersons() {
  try {
    const { persons = [] } = await chrome.storage.local.get('persons');
    return persons;
  } catch (e) { return []; }
}

// --- Page -----------------------------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

const state = { record: null, people: [], fs: null, trees: {}, rows: [], running: false, trusted: false };
const $ = (id) => document.getElementById(id);

function relationLabel(t) {
  return t.name + ' (' + (t.relation === 'person' ? 'FamilySearch person' : t.relation) + (t.year ? ', b. ' + t.year : '') + ') · ' + t.pid;
}

// One person of the record: name (editable, with surname suggestions), role, the
// tree person to attach to, tags, reason
function personRow(person, family, suggestion, why) {
  const row = { person, name: stripVariants(person.name), noteName: person.name };
  const role = person.roleEnglish || person.role || '';

  const nameInput = el('input', { type: 'text', class: 'name', value: row.name, 'aria-label': 'Name in the source' });
  const suggest = el('div', { class: 'suggest' });
  const select = el('select', { 'aria-label': 'Tree person for ' + row.name });
  const otherPid = el('input', { type: 'text', class: 'pid', placeholder: 'PID, e.g. XXXX-XXX', hidden: true, 'aria-label': 'FamilySearch ID' });
  const hint = el('div', { class: 'why muted', text: why || '' });
  // The tree persons to choose from, and the suggested one
  const fill = (suggested) => {
    select.replaceChildren(el('option', { value: '', text: '— don\'t attach —' }),
      ...family.map((t) => el('option', { value: t.pid, text: relationLabel(t) })),
      el('option', { value: 'other', text: 'Another person (PID)…' }));
    if (suggested && family.some((t) => t.pid === suggested)) select.value = suggested;
    else if (suggested) { select.value = 'other'; otherPid.value = suggested; }
    else select.value = '';
  };
  fill(suggestion);
  let touched = false;  // the user chose: later suggestions leave the row as it is

  const kind = roleKind(person);
  const tagBoxes = {};
  const tags = el('div', { class: 'tags' }, TAGS.map(([id, label]) => {
    const box = el('input', { type: 'checkbox' });
    box.checked = defaultTags(state.record.recordTypeInfo.type, kind).includes(id);
    tagBoxes[id] = box;
    return el('label', {}, [box, document.createTextNode(label)]);
  }));
  const reason = el('textarea', { rows: '2', class: 'reason', 'aria-label': 'Reason for attaching' });
  reason.value = defaultReason(state.record, person);

  const attachCell = el('div', { class: 'attach' }, [select, otherPid, hint]);
  const detail = el('div', { class: 'attach-detail' }, [el('div', { class: 'label muted', text: 'Tags' }), tags,
    el('div', { class: 'label muted', text: 'Reason' }), reason]);
  const node = el('li', { class: 'person' + (person.current ? ' anchor' : '') }, [
    el('div', { class: 'who' }, [nameInput, el('div', { class: 'role muted', text: role + (person.birthYear ? ' · ' + person.birthYear : '') }), suggest]),
    attachCell, detail
  ]);

  row.pid = () => (select.value === 'other' ? otherPid.value.trim().toUpperCase() : select.value);
  row.tags = () => TAGS.map(([id]) => id).filter((id) => tagBoxes[id].checked);
  row.reason = () => reason.value.trim();
  row.tree = () => family.find((t) => t.pid === select.value) || null;
  row.label = () => nameInput.value.trim() || role;

  const refresh = () => {
    otherPid.hidden = select.value !== 'other';
    node.classList.toggle('off', !row.pid() && select.value !== 'other');
    detail.hidden = !row.pid() && select.value !== 'other';
    suggest.replaceChildren(...surnameSuggestions({ ...person, name: nameInput.value }, state.people, state.record, row.tree()).map((s) =>
      el('button', { type: 'button', class: 'chip', title: 'Use ' + s.label }, [document.createTextNode(s.name), el('span', { class: 'muted', text: ' ' + s.label })])));
    for (const [i, b] of [...suggest.children].entries()) {
      b.addEventListener('click', () => {
        nameInput.value = surnameSuggestions({ ...person, name: nameInput.value }, state.people, state.record, row.tree())[i].name;
        rename(row, nameInput.value);
        refresh();
      });
    }
  };
  select.addEventListener('change', () => { touched = true; hint.textContent = ''; refresh(); });
  otherPid.addEventListener('input', () => { touched = true; refresh(); });
  nameInput.addEventListener('change', () => { rename(row, nameInput.value.trim()); refresh(); });
  // New tree persons to choose from (relatives' families read from FS), and a new
  // suggestion unless the user has chosen
  row.update = (newFamily, newSuggestion, newWhy) => {
    const keep = touched ? { value: select.value, other: otherPid.value } : null;
    family = newFamily;
    if (keep) {
      fill(keep.value === 'other' ? keep.other : keep.value);
      if (keep.value === '') select.value = '';
    } else {
      fill(newSuggestion);
      hint.textContent = newWhy || '';
    }
    refresh();
  };
  row.node = node;
  refresh();
  return row;
}

// A person's new name in the title, citation and notes
function rename(row, newName) {
  if (!newName || newName === row.name) return;
  const title = $('f-title'), citation = $('f-citation'), notes = $('f-notes');
  const oldName = row.name;
  title.value = renamePhrase(title.value, oldName, newName);
  // A baptized child with a surname no longer needs ", son of ..."
  if (state.record.recordTypeInfo.type === 'birth_baptism' && roleKind(row.person) === 'child' && newName.split(/\s+/).length > oldName.split(/\s+/).length) {
    title.value = dropChildOf(title.value);
  }
  citation.value = renamePhrase(citation.value, oldName, newName);
  notes.value = renameNoteLine(notes.value, row.person.roleEnglish || row.person.role || 'Unknown', row.noteName, newName);
  row.name = newName;
  row.noteName = newName;
}

const isCensus = () => !!(state.record && state.record.recordTypeInfo && state.record.recordTypeInfo.type === 'census');

// The suggested pairs: in a census across the residence's households, through the
// relatives' families read so far (state.trees); else from the record's family
function suggestions() {
  if (isCensus()) return suggestResidencePairs(state.record, state.people, state.fs, state.trees, state.trusted);
  const self = findSelf(state.people, state.fs, state.trusted);
  return { ...suggestPairs(state.record, state.people, self, state.fs), need: [] };
}

// A census residence's households: a heading before each other household
function householdHeading(person) {
  const census = state.record.census || {};
  const no = person.householdNo ? 'Household no. ' + person.householdNo : 'Another household';
  const where = census.residence ? ' at ' + census.residence : '';
  return el('li', { class: 'household muted', text: (person.household ? no + ', also' + where : no + where) });
}

async function showPeople() {
  const list = $('people');
  state.trees = {};
  let { pairs, why, need } = suggestions();
  if (await switchHousehold(pairs)) ({ pairs, why, need } = suggestions());
  const pool = treePool(state.fs, state.trees);
  // Without a stored FS person, a PID typed above still pairs the anchor
  const pid = $('fs-pid').value.trim().toUpperCase();
  if (!state.fs && pid) {
    const anchor = state.people.find((p) => p.current);
    if (anchor) { pairs[anchor.key] = pid; why[anchor.key] = 'the PID above'; }
  }
  state.rows = state.people.map((p) => personRow(p, pool, pairs[p.key], why[p.key]));
  const items = [];
  const several = state.people.some((p) => p.household);
  state.headings = new Map();
  state.related = linkedHouseholds(state.people);
  state.showAll = false;
  state.rows.forEach((r, i) => {
    if (several && (i === 0 || r.person.household !== state.rows[i - 1].person.household)) {
      const heading = householdHeading(r.person);
      state.headings.set(r.person.household, heading);
      items.push(heading);
    }
    items.push(r.node);
  });
  list.replaceChildren(...items);
  showHouseholds();
  const family = treeFamily(state.fs);
  $('fs-name').textContent = state.fs ? state.fs.name + (family.length > 1 ? ' and ' + (family.length - 1) + ' relatives' : '')
    : pid ? 'family not known here (open the search from this person\'s FamilySearch page to have it)' : '';
  $('tree-status').hidden = true;
  state.generation = (state.generation || 0) + 1;
  if (need.length) readResidence(need, state.generation);  // the rows are there meanwhile
}

// A census residence's other households are shown when someone in them is paired: a
// related family (1865's old parents, a brother's family). The others (the farm's
// unrelated households in 1801) wait behind a button.
function showHouseholds() {
  const related = state.related;
  for (const r of state.rows) if (r.pid()) related.add(r.person.household);
  const others = state.rows.filter((r) => !related.has(r.person.household));
  for (const r of state.rows) r.node.hidden = !state.showAll && !related.has(r.person.household);
  for (const [h, node] of state.headings) node.hidden = !state.showAll && !related.has(h);
  const n = new Set(others.map((r) => r.person.household)).size;
  const button = $('other-households');
  button.hidden = !n;
  const what = n + ' other household' + (n > 1 ? 's' : '') + ' at the residence (' + others.length + ' people), not related in the census or FamilySearch';
  button.textContent = (state.showAll ? 'Hide the ' : 'Show the ') + what;
}

// The source describes the FS person's household. When they live in another household
// at the residence than the one opened (a namesake's hit: three Lars Halvorsens at one
// farm), the record is read again from their own page, while the source is as filled.
const sourceFields = () => ['f-title', 'f-date', 'f-url', 'f-citation', 'f-notes'].map((id) => $(id).value).join('\n');
async function switchHousehold(pairs) {
  if (!isCensus() || !state.fs || sourceFields() !== state.filled) return false;
  const self = state.people.find((p) => pairs[p.key] === state.fs.pid);
  if (!self || !self.household || !/^pf\d+$/.test(self.id || '')) return false;
  const opened = state.people.find((p) => p.current);
  let loaded;
  try {
    loaded = await loadFromDA('https://www.digitalarkivet.no/en/census/person/' + self.id);
  } catch (e) {
    console.warn('arkivet2fs: could not read ' + self.id, e);
    return false;
  }
  if (!loaded.record || loaded.record.error) return false;
  state.record = loaded.record;
  state.people = recordPeople(loaded.record, self.id, loaded.openPerson);
  if (!state.people.some((p) => p.current && !p.household)) return false;
  state.trusted = true;
  fillSource(loaded.record);
  const note = $('record-note');
  note.hidden = false;
  note.textContent = 'The record opened was ' + (opened ? stripVariants(opened.name) + (opened.birthYear ? ', ' + opened.birthYear : '') +
    (opened.householdNo ? ', household no. ' + opened.householdNo : '') : 'another person\'s') + '. FamilySearch ' + stripVariants(state.fs.name) +
    ' fits ' + stripVariants(self.name) + (self.birthYear ? ', ' + self.birthYear : '') + (self.householdNo ? ', household no. ' + self.householdNo : '') +
    ', so the source is for that household.';
  return true;
}

// --- Relatives' families from FS (a census residence) ---------------------------------
// The residents the FS person's family doesn't reach (Lars Halvorsen's other son's family
// as lodgers) are paired through the paired relatives' own families: read from their FS
// details pages in a background tab (fs_person.js answers {action: 'readPerson'}),
// kept in chrome.storage.session (`tree:<PID>`), at most MAX_TREE_READS for a record.

const MAX_TREE_READS = 8;
const MAX_TREE_ROUNDS = 3;

async function readResidence(need, generation) {
  const status = $('tree-status');
  status.classList.remove('near');
  const asked = new Set();
  const failed = [];
  for (let round = 0; round < MAX_TREE_ROUNDS && need.length && asked.size < MAX_TREE_READS; round++) {
    const pids = treesToRead(need, asked).slice(0, MAX_TREE_READS - asked.size);
    if (!pids.length) break;
    for (const p of pids) asked.add(p);
    const names = pids.map((p) => (treePool(state.fs, state.trees).find((t) => t.pid === p) || { name: p }).name);
    status.hidden = false;
    status.textContent = 'Reading the FamilySearch families of ' + names.join(', ') + ' to pair the others at the residence…';
    const read = await readTreePersons(pids);
    for (const p of pids) if (!read[p]) failed.push(p);
    if (generation !== state.generation) return;  // another FS person was chosen meanwhile
    Object.assign(state.trees, read);
    const next = suggestions();
    const pool = treePool(state.fs, state.trees);
    for (const row of state.rows) row.update(pool, next.pairs[row.person.key], next.why[row.person.key]);
    showHouseholds();
    need = next.need.filter((p) => !state.trees[p]);
  }
  const shown = state.rows.filter((r) => state.related.has(r.person.household));
  const paired = shown.filter((r) => r.pid()).length;
  status.textContent = paired + ' of ' + shown.length + (state.related.size > 1 ? ' in the related households' : ' in the household') + ' paired' +
    (failed.length ? '; could not read ' + failed.join(', ') + ' from FamilySearch (are you signed in?)' : '') + '.';
  status.classList.toggle('near', failed.length > 0);
}

// Whose families to read: paired relatives in a household with residents still
// unpaired; when there are none, the two eldest (a parent's family reaches furthest)
function treesToRead(need, asked) {
  const rows = state.rows;
  const open = new Set(rows.filter((r) => !r.pid() && r.person.name).map((r) => r.person.household));
  const who = need.filter((p) => !asked.has(p) && !state.trees[p]).map((pid) => {
    const row = rows.find((r) => r.pid() === pid);
    return { pid, near: row && open.has(row.person.household), year: row ? birthYearOf(row.person, state.record) || 9999 : 9999 };
  });
  // A child at the census heads no household there: their FS family pairs no one new
  const recordYear = Number(((state.record.recordDate || '').match(/^\d{4}/) || [])[0]) || 0;
  const grown = who.filter((w) => !recordYear || w.year === 9999 || recordYear - w.year >= 16);
  const near = grown.filter((w) => w.near);
  return (near.length ? near : grown.sort((a, b) => a.year - b.year).slice(0, 2)).map((w) => w.pid);
}

const personDetailsUrl = (pid) => 'https://www.familysearch.org/en/tree/person/details/' + encodeURIComponent(pid);

// The FS persons (gatherPerson()'s shape) by PID: stored, or read in one background tab
async function readTreePersons(pids) {
  const out = {};
  const toRead = [];
  for (const pid of pids) {
    const kept = await storedPerson(pid) || await sessionTree(pid);
    if (kept) out[pid] = kept;
    else toRead.push(pid);
  }
  if (!toRead.length) return out;
  let tab = null;
  try {
    const here = await chrome.tabs.getCurrent();
    tab = await chrome.tabs.create({ url: 'about:blank', active: false, index: here ? here.index + 1 : undefined });
    for (const pid of toRead) {
      let answer = await readInTab(tab.id, pid);
      // A background tab FS hasn't drawn: show it for a moment
      if (!answer.person) {
        await chrome.tabs.update(tab.id, { active: true });
        answer = await readInTab(tab.id, pid);
        if (here) await chrome.tabs.update(here.id, { active: true });
      }
      if (answer.person && answer.person.pid === pid) {
        out[pid] = answer.person;
        try { await chrome.storage.session.set({ ['tree:' + pid]: answer.person }); } catch (e) { /* only a cache */ }
      } else {
        console.warn('arkivet2fs: could not read ' + pid, answer.error);
      }
    }
  } catch (e) {
    console.warn('arkivet2fs: reading FS persons', e);
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
  }
  return out;
}

async function sessionTree(pid) {
  try { return (await chrome.storage.session.get('tree:' + pid))['tree:' + pid] || null; } catch (e) { return null; }
}

// Open the person's details page in the tab and ask fs_person.js for the person
async function readInTab(tabId, pid) {
  const loaded = waitForLoad(tabId);
  await chrome.tabs.update(tabId, { url: personDetailsUrl(pid) });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 30000))]);
  for (let tries = 0; tries < 10; tries++) {
    try {
      const answer = await Promise.race([
        chrome.tabs.sendMessage(tabId, { action: 'readPerson' }),
        new Promise((resolve) => setTimeout(() => resolve({ error: 'no answer' }), 30000))
      ]);
      if (answer) return answer;
    } catch (e) { /* the content script isn't there yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { error: 'FamilySearch did not answer.' };
}

function fillSource(record) {
  $('f-title').value = record.title || '';
  $('f-date').value = record.date || '';
  $('f-url').value = record.url || '';
  $('f-citation').value = record.citation || '';
  $('f-notes').value = record.notes || '';
  state.filled = sourceFields();
  const link = $('da-link');
  link.href = record.url;
  link.hidden = !record.url;
}

// --- Running on FS --------------------------------------------------------------------

function log(text, kind = '') {
  const li = el('li', { class: kind, text });
  $('log').append(li);
  li.scrollIntoView({ block: 'nearest' });
  return li;
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openTab(url) {
  const here = await chrome.tabs.getCurrent();
  const tab = await chrome.tabs.create({ url, active: true, index: here ? here.index + 1 : undefined });
  await waitForLoad(tab.id);
  return tab.id;
}

async function navigate(tabId, url) {
  const loaded = waitForLoad(tabId);
  await chrome.tabs.update(tabId, { url, active: true });
  await loaded;
}

// One step in the FS tab (fs_attach.js), answered within two minutes
async function step(tabId, name, args) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['fs_attach.js'] });
  const answer = await Promise.race([
    chrome.tabs.sendMessage(tabId, { linker: name, args }),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'FamilySearch did not answer in time.' }), 120000))
  ]);
  if (!answer) return { ok: false, error: 'FamilySearch did not answer.' };
  return answer;
}

// The plan from the page: the source, and each paired person (PIDs checked)
function readPlan(attach) {
  const source = { title: $('f-title').value.trim(), date: $('f-date').value.trim(), url: $('f-url').value.trim(),
    citation: $('f-citation').value.trim(), notes: $('f-notes').value.trim() };
  if (!source.title) throw new Error('The source needs a title.');
  const pairs = [];
  if (attach) {
    for (const row of state.rows) {
      const pid = row.pid();
      if (!pid) continue;
      if (!PID_PATTERN.test(pid)) throw new Error('"' + pid + '" (for ' + row.label() + ') is not a FamilySearch ID like XXXX-XXX.');
      if (pairs.some((p) => p.pid === pid)) throw new Error(pid + ' is chosen for two people in the record.');
      const tags = row.tags();
      pairs.push({ pid, label: row.label(), reason: row.reason(), tags: tags.filter((t) => t !== 'Residence'), residence: tags.includes('Residence') });
    }
    if (!pairs.length) throw new Error('Choose a tree person for someone in the record, or use "Create source only".');
  }
  return { source, pairs };
}

const logTags = (pair, result) => log('Tags for ' + pair.label + ': ' + (result.changed.length ? result.changed.join(' ') : 'as they were') +
  (result.notes.length ? '. Not tagged: ' + result.notes.join(', ') : '') + '.', result.notes.length ? 'near' : 'ok');

async function run(attach) {
  if (state.running) return;
  let plan;
  try { plan = readPlan(attach); } catch (e) { log(e.message, 'bad'); return; }
  state.running = true;
  document.body.classList.add('running');
  $('log').replaceChildren();
  $('progress').hidden = false;
  try {
    log('Opening the SourceBox on FamilySearch…');
    const tabId = await openTab(SOURCEBOX_URL);
    const created = await step(tabId, 'createSource', plan.source);
    if (!created.ok) throw new Error(created.error);
    log(created.existing ? 'The SourceBox already has a source with this title; using it (' + created.sourceId + ').'
      : 'Source created (' + created.sourceId + ').' + (created.missing && created.missing.length ? ' Not filled: ' + created.missing.join(', ') + '.' : ''), 'ok');
    const attached = [];
    for (const pair of plan.pairs) {
      const result = await step(tabId, 'attach', { sourceId: created.sourceId, pid: pair.pid, reason: pair.reason, tags: pair.tags, residence: pair.residence });
      if (!result.ok) { log('Not attached to ' + pair.label + ' (' + pair.pid + '): ' + result.error, 'bad'); continue; }
      log('Attached to ' + pair.label + ' (' + pair.pid + ').', 'ok');
      // Tagged in FS's own dialog after attaching, or later on the Sources tab
      if (result.tagged) logTags(pair, result.tagged);
      else attached.push(pair);
    }
    for (const pair of attached) {
      if (!pair.tags.length && !pair.residence) continue;
      await navigate(tabId, personSourcesUrl(pair.pid));
      const result = await step(tabId, 'tag', { sourceId: created.sourceId, title: plan.source.title, tags: pair.tags, residence: pair.residence });
      if (result.ok) logTags(pair, result);
      else log('Tags for ' + pair.label + ' not set: ' + result.error, 'bad');
    }
    if (!attach) log('The source is in your SourceBox; attach it there when you like.');
    log('Done.', 'ok');
  } catch (e) {
    log(e.message || String(e), 'bad');
  } finally {
    state.running = false;
    document.body.classList.remove('running');
  }
}

async function setPerson(pid) {
  state.fs = await storedPerson(pid);
  await showPeople();
}

async function main() {
  const params = new URLSearchParams(location.search);
  const status = $('status');
  try {
    const loaded = params.get('draft') ? await loadDraft(params.get('draft')) : params.get('rec') ? await loadFromDA(params.get('rec')) : null;
    if (!loaded) throw new Error('No record given. Open the linker from a search hit, or with the extension icon on a DA record.');
    state.record = loaded.record;
    state.people = recordPeople(loaded.record, loaded.anchorId, loaded.openPerson);
    fillSource(loaded.record);

    // The FS person: the search's (the hit is theirs), or the last one searched
    const recent = await recentPersons();
    $('fs-recent').replaceChildren(...recent.map((p) => el('option', { value: p.pid, text: p.name })));
    let pid = (params.get('pid') || '').toUpperCase();
    state.trusted = !!pid;
    if (!pid && recent.length) {
      const last = await storedPerson(recent[0].pid);
      if (last && findSelf(state.people, last, false)) pid = last.pid;
    }
    $('fs-pid').value = pid;
    await setPerson(pid);
    status.hidden = true;
    $('linker').hidden = false;
  } catch (e) {
    status.textContent = e.message || String(e);
    status.classList.add('bad');
  }
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  $('fs-pid').addEventListener('change', () => {
    state.trusted = true;
    setPerson($('fs-pid').value.trim().toUpperCase());
  });
  $('attach').addEventListener('click', () => run(true));
  $('create-only').addEventListener('click', () => run(false));
  $('other-households').addEventListener('click', () => { state.showAll = !state.showAll; showHouseholds(); });
  main();
}
