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
// ("Halvor Larsen Bakken" → "Halvor", "Maren Kristine Lindeman" → "Maren Kristine")
function givenOf(name) {
  const words = (name || '').split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.join(' ');
  const i = words.findIndex((w, k) => k > 0 && isPatronymic(w));
  return words.slice(0, i > 0 ? i : -1).join(' ');
}

// A name in a title or citation: "1845, Ole, son of ...", "baptism of Ole, 3 January",
// "Lars Halvorsen and Kari", "Lars Halvorsen household" (whole names only, so "Lars" isn't
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
    if (p && p.pid && !out.some((o) => o.pid === p.pid)) out.push({ pid: p.pid, name: p.name, relation, gender: p.gender, year: year(p.lifespan), lifespan: p.lifespan });
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
// (children by the best fitting given name and birth year ±2, and the sex where both
// tell it: givenFit(), childSex()). A single father, mother or spouse in a church
// book with another name isn't paired (a second wife, a namesake), but named in the
// hint, since DA's transcriptions of names can be far off; in a census, where the
// head and spouse could be either parent, only names count. Then the same from each
// paired relative's entry with their own FS family, once read (`trees`): a marriage's
// bride's father through the FS wife. `need`: the paired relatives whose families
// could pair someone still unpaired whom only their entry names as a relative.
// `chosen` {key: pid}: the rows the user paired by hand ('' not attached), which stand
// and are paired from like the others (the bride chosen as the FS wife by hand).
function suggestPairs(record, people, self, fs, trees = {}, chosen = {}) {
  const pairs = {};
  const why = {};
  if (!fs) return { pairs, why, need: [] };
  const census = record.recordTypeInfo && record.recordTypeInfo.type === 'census';
  const used = new Set();
  const blocked = new Set();
  for (const [key, pid] of Object.entries(chosen)) {
    if (pid) { pairs[key] = pid; used.add(pid); } else blocked.add(key);
  }
  if (self && !(self.key in chosen) && !used.has(fs.pid)) {
    pairs[self.key] = fs.pid;
    why[self.key] = t('the FamilySearch person');
    used.add(fs.pid);
  }
  const relativesOf = (person) => {
    const view = { ...record, people: people.map((p) => ({ ...p, current: p === person })) };
    const found = relativesInRecord(view);
    const back = (p) => people[view.people.indexOf(p)];
    return Object.fromEntries(Object.entries(found).map(([k, list]) => [k, list.map(back)]));
  };
  // From one paired person's entry, with their FS family
  const pairFrom = (person, tree) => {
    const own = tree === fs;
    const found = relativesOf(person);
    const reason = (text) => (own ? text : t('{why} (of {name} in FamilySearch)', { why: text, name: tree.name }));
    const pair = (p, relative, text) => {
      if (!p || !relative || pairs[p.key] || blocked.has(p.key) || used.has(relative.pid)) return;
      pairs[p.key] = relative.pid;
      why[p.key] = reason(text);
      used.add(relative.pid);
    };
    // Named in the hint, not paired
    const other = (p, relative, relation) => {
      if (pairs[p.key] || why[p.key] || blocked.has(p.key) || used.has(relative.pid)) return;
      const whose = own ? t(relation) : t('{relation} of {name}', { relation: t(relation), name: tree.name });
      why[p.key] = t('FamilySearch {relation} is {name}, another name: choose them if it\'s the same person', { relation: whose, name: relative.name });
    };
    const single = (relation, relative) => {
      if (!relative || !relative.pid) return;
      const candidates = found[relation];
      const byName = candidates.find((p) => hasGivenName(p, givenOf(relative.name)));
      if (byName) pair(byName, relative, t(relation + ', same given name'));
      else if (!census && candidates.length === 1) other(candidates[0], relative, relation);
    };
    single('father', tree.father);
    single('mother', tree.mother);
    const spouses = (tree.families || []).map((f) => f.spouse).filter((x) => x && x.pid);
    for (const x of spouses) {
      const match = found.spouse.find((p) => hasGivenName(p, givenOf(x.name)));
      if (match) pair(match, x, t('spouse, same given name'));
    }
    if (spouses.length === 1 && !census && found.spouse.length === 1) other(found.spouse[0], spouses[0], 'spouse');
    // Each record child with the FS child that fits best: the first given name before a
    // later one (Johan Peder is FS's Johan Peder, not his sister Marte Johanne), then
    // the year; never one of the other sex
    const children = (tree.families || []).flatMap((f) => f.children || []).filter((c) => c.pid);
    for (const child of found.child) {
      const year = birthYearOf(child, record);
      const sex = childSex(child, record);
      let best = null;
      for (const c of children) {
        if (used.has(c.pid) || (sex && c.gender && c.gender !== sex)) continue;
        const born = Number(((c.lifespan || '').match(/^\d{4}/) || [])[0]) || null;
        const fit = givenFit(child, givenOf(c.name));
        if (!fit || (born && year && Math.abs(born - year) > 2)) continue;
        const off = born && year ? Math.abs(born - year) : 3;
        if (!best || fit > best.fit || (fit === best.fit && off < best.off)) best = { c, fit, off };
      }
      if (best) pair(child, best.c, t(year ? 'child, same given name and birth year' : 'child, same given name'));
    }
  };
  // From the FS person's entry, then outward through the paired relatives whose FS
  // families have been read
  const treeOf = (pid) => (pid === fs.pid ? fs : trees[pid]);
  const done = new Set();
  const from = (p) => {
    const pid = pairs[p.key];
    if (!pid || done.has(pid) || !treeOf(pid)) return false;
    done.add(pid);
    pairFrom(p, treeOf(pid));
    return true;
  };
  const me = people.find((p) => pairs[p.key] === fs.pid);
  if (me) from(me);
  for (let more = true; more;) {
    more = false;
    for (const p of people) if (from(p)) more = true;
  }
  // Someone unpaired whom only their entry reaches (the bride's father: not the
  // groom's), so a baptism's new child doesn't have the mother's family read too
  const reached = new Set(people.filter((p) => done.has(pairs[p.key]))
    .flatMap((p) => Object.values(relativesOf(p)).flat()));
  const need = people.filter((p) => pairs[p.key] && !done.has(pairs[p.key]))
    .filter((p) => Object.values(relativesOf(p)).some((list) => list.some((r) => !pairs[r.key] && !blocked.has(r.key) && !reached.has(r))))
    .map((p) => pairs[p.key]);
  return { pairs, why, need };
}

// A record child's sex: the gender field when the record's fields are the child's own
// (the principal's page of a baptism), else the patronymic or family position
function childSex(person, record) {
  const fields = record.fields || {};
  if (person && person.primary && /^(barn|child)$/i.test(fields.role || '')) {
    if (/^m/i.test(fields.gender || '')) return 'Male';
    if (/^(k|f)/i.test(fields.gender || '')) return 'Female';
  }
  return person ? recordSex(person, record) : '';
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
// given name (Astri for Astrid) is paired only with a fitting year and household role.

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
// one (the record's name is a stem of FS's: Astri for Astrid); 0: another name
function givenNameFit(person, tree) {
  const given = givenOf(stripVariants(tree.name));
  if (hasGivenName(person, given)) return 2;
  const first = stripVariants(person.name).split(/\s+/)[0] || '';
  return first && given.split(/\s+/).some((g) => nameMatch(g, first) || nameNear(first, g)) ? 1 : 0;
}

// A resident's sex where the record tells it: a woman's patronymic (Olsdatter), the
// family position (hans Kone, deres Søn; the census codes d, s, hm, hf), a woman's
// occupation (Husholderske, Tjenestepige, Telefonistinde), else a man's patronymic
// (Halvorsen) → 'Male', 'Female' or ''. A -sen says nothing from 1865 on: in the towns'
// censuses a wife has her husband's surname and a daughter her father's (Kjersti
// Halvorsen, hm), and a wrong sex keeps a resident from being paired at all.
// (Whole words between letters, not \b, to which ø, å and æ aren't letters: "avdød"
// would end in the code d)
const FEMALE_ROLE = /(?<!\p{L})(kone|hustru|hustrue|hustroe|hustro|datter|dotter|daughter|wife|woman|mother|moder|mor|enke|widow|søster|søstre|sister|pige|tjenestepige|husmor|husmoder|hm|d)(?!\p{L})/iu;
const MALE_ROLE = /(?<!\p{L})(søn|son|fader|far|father|man|mand|husband|husbond|hosbond|huusbond|husbonde|hosbonde|husfader|hf|enkemand|widower|broder|bror|brother|dreng|tjenestedreng|s)(?!\p{L})/iu;
const FEMALE_WORK = /(pige|inde|inne|erske|kone|enke|jomfru|madame|jordmor|budeie)(?!\p{L})/iu;
const FAMILY_NAMES_FROM = 1865;
function recordSex(person, record) {
  // a bride or groom (not their fathers: "Bride's Father")
  if (/^(brur|brud|bride)$/i.test(person.role || '') || /^bride$/i.test(person.roleEnglish || '')) return 'Female';
  if (/^(brudgom|brudgum|groom)$/i.test(person.role || '') || /^groom$/i.test(person.roleEnglish || '')) return 'Male';
  const last = stripVariants(person.name).split(/\s+/).slice(1).join(' ');
  if (/(datter|dotter|dtr\.?|s(?:dattr|datt|datr|dat|dr|d:r|d)\.?)(\s|$)/i.test(last)) return 'Female';
  const role = foldRole((person.role || '') + ' ' + (person.roleEnglish || '').replace(/\[.*?\]/g, ''));
  if (FEMALE_ROLE.test(role) && !MALE_ROLE.test(role)) return 'Female';
  if (MALE_ROLE.test(role) && !FEMALE_ROLE.test(role)) return 'Male';
  if (FEMALE_WORK.test(foldRole(person.position || ''))) return 'Female';
  const year = Number(((record && record.recordDate) || '').slice(0, 4)) || 0;
  if (/(sen|søn|son)(\s|$)/i.test(last) && !(year >= FAMILY_NAMES_FROM)) return 'Male';
  return '';
}

// Two names with patronymics of different fathers (Ingri Gulbrandsdatter isn't
// Ingrid Larsdr; Lars Jakobsen isn't Lars Halvorsen). Spellings of one father's name
// agree (sameFather()): Halvardsen/Halvorsen, Olsson/Olsen, Torsdatter/Tordsdatter,
// Jonsdatter/Johannesdatter. A farm in the patronymic's place says nothing.
function patronymicClash(recordName, treeName) {
  const pats = (name) => stripVariants(name).split(/\s+/).slice(1).filter(isPatronymic)
    .map((w) => patronymicBase(w).toLowerCase()).filter(Boolean);
  const a = pats(recordName), b = pats(treeName);
  if (!a.length || !b.length) return false;
  return !a.some((x) => b.some((y) => sameFather(x, y)));
}

// A record name with the patronymic of a father of this given name (Iver Olsen, Ole)
function patronymicFrom(name, fatherGiven) {
  const base = patronymicBase(patronymicOf(firstWord(stripVariants(fatherGiven)))).toLowerCase();
  if (!base) return false;
  return stripVariants(name).split(/\s+/).slice(1).filter(isPatronymic).map((w) => patronymicBase(w).toLowerCase())
    .some((x) => sameFather(x, base));
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
  const role = foldRole(person.role).split(',')[0].replace(/\[.*?\]/g, '').trim().toLowerCase();
  const m = role.match(new RegExp('^(?:(' + REFERRING + '|husbondens|husfaderens|husmoderens|konens|hustruens|mandens)\\s+)?(\\S+)$', 'u'));
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

// A -sen surname the resident shares with the paired resident of their household, from
// 1865 on: the family's surname (the husband's on his wife, the father's on his
// children), not the resident's own patronymic, so it doesn't clash with FS's
function familySurname(candidate, from, year) {
  if (!(year >= FAMILY_NAMES_FROM) || candidate.household !== from.household) return false;
  const surnames = (p) => stripVariants(p.name).toLowerCase().split(/\s+/).slice(1);
  const theirs = surnames(from);
  return surnames(candidate).some((w) => isPatronymic(w) && theirs.includes(w));
}

// How well a resident fits as the tree relative of a paired resident → {score, why} or null
function residentFit(record, people, from, fromTree, candidate, rel, tree) {
  const name = givenNameFit(candidate, tree);
  if (!name) return null;
  // The sex, where both tell it; a close given name needs it (Johanne isn't Johannes)
  const sex = recordSex(candidate, record), fsSex = /^(male|female)$/i.test(tree.gender || '') ? tree.gender : '';
  if (sex && fsSex && sex.toLowerCase() !== fsSex.toLowerCase()) return null;
  if (name === 1 && !(sex && fsSex)) return null;
  const recordYear = Number(((record.recordDate || '').match(/^\d{4}/) || [])[0]) || null;
  if (!familySurname(candidate, from, recordYear) && patronymicClash(candidate.name, tree.name)) return null;
  const yc = birthYearOf(candidate, record), yt = treeYear(tree), yf = birthYearOf(from, record);
  let score = name === 2 ? 3 : 1;
  const why = [t('{relation} of {name} in FamilySearch', { relation: t(relWord(rel, tree.gender)), name: stripVariants(fromTree.name) }),
    name === 2 ? t('same given name') : t('close given name (FamilySearch: {name})', { name: tree.name })];
  const yearFits = !!(yc && yt);
  if (yearFits) {
    const d = Math.abs(yc - yt);
    if (d > 3) return null;
    score += [3, 3, 2, 1][d];
    why.push(t('birth year {year}', { year: yt }));
  }
  // What the census says of the two (across households too); else the roles in the
  // paired resident's own household
  let roleFits = false;
  const told = censusRelation(people, candidate, from);
  if (told) {
    const wanted = rel === 'father' || rel === 'mother' ? [rel, 'parent'] : [rel];
    if (wanted.includes(told)) roleFits = true;
    else if (told !== 'kin') return null;  // the census says otherwise
    if (candidate.household !== from.household) why.push(t('household no. {n}', { n: candidate.householdNo || '?' }));
  } else if (candidate.household === from.household) {
    const rels = householdRelatives(record, people, from);
    const kinds = Object.keys(rels).filter((k) => rels[k].includes(candidate));
    const wanted = rel === 'father' || rel === 'mother' ? ['father', 'mother'] : [rel];
    if (kinds.some((k) => wanted.includes(k))) roleFits = true;
    else if (kinds.length) return null;  // another relation in the household
  } else {
    why.push(t('household no. {n}', { n: candidate.householdNo || '?' }));
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
  if (named && !yearFits && !roleFits) why.push(t('patronymic'));
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
    const y = birthYearOf(p, record), sex = recordSex(p, record);
    if (year && y && Math.abs(y - year) > 3) return t('b. {year}, here b. about {here}', { year, here: y });
    if (sex && fsSex && sex.toLowerCase() !== fsSex.toLowerCase()) return t('{fs}, here {here}', { fs: t(fsSex).toLowerCase(), here: t(sex).toLowerCase() });
    if (fsNames.some((n) => patronymicClash(p.name, n))) return t('another patronymic');
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
  take(self, fs, t('the FamilySearch person'));
  // The opened record person, who the search took for the FS person, but isn't
  if (trusted && anchor && self !== anchor) {
    why[anchor.key] = t('the record opened, but FamilySearch {fs} is {what}; paired with {name} instead', {
      fs: stripVariants(fs.name), what: contradicts(anchor),
      name: stripVariants(self.name) + (self.householdNo ? ', ' + t('household no. {n}', { n: self.householdNo }) : '')
    });
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
      const here = rels[rel].filter((p) => !paired.has(p) && !why[p.key] && (!sexWanted || recordSex(p, record) === sexWanted));
      if (here.length !== 1 || fsOf[rel].length !== 1) continue;
      const fsRel = fsOf[rel][0], p = here[0];
      const y = birthYearOf(p, record), fy = treeYear(fsRel);
      const word = t('{relation} of {name}', { relation: t(relWord(rel, fsRel.gender)), name: stripVariants(tree.name) });
      const fsName = fsRel.name + (fy ? ', ' + t('b.') + ' ' + fy : '');
      why[p.key] = !givenNameFit(p, fsRel)
        ? t('FamilySearch {relation} is {name}, another name: choose them if it\'s the same person', { relation: word, name: fsName })
        : patronymicClash(p.name, fsRel.name)
          ? t('FamilySearch {relation} is {name}, another patronymic: choose them if it\'s the same person', { relation: word, name: fsName })
          : t('FamilySearch {relation} is {name}; here b. about {year}: choose them if it\'s the same person', { relation: word, name: fsName, year: y || '?' });
    }
  }
}

// The tree persons to choose from: the FS person's family, then each read relative's
// (labelled by whose they are: "wife of Halvor Larsen")
function treePool(fs, trees) {
  const out = treeFamily(fs);
  for (const tree of Object.values(trees || {})) {
    if (!tree || !tree.pid || (fs && tree.pid === fs.pid)) continue;
    for (const { tree: other, rel } of treeRelatives(tree)) {
      if (!out.some((o) => o.pid === other.pid)) {
        out.push({ pid: other.pid, name: other.name, relation: t('{relation} of {name}', { relation: t(relWord(rel, other.gender)), name: tree.name }),
          gender: other.gender, year: treeYear(other), lifespan: other.lifespan });
      }
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

// (whole phrases, for the translations: "this baptism", "denne dåpen")
const RECORD_WORDS = {
  birth_baptism: 'this baptism', marriage: 'this marriage', death_burial: 'this burial', confirmation: 'this confirmation',
  census: 'this census', emigration: 'this emigration', out_migration: 'this moving record', in_migration: 'this moving record',
  probate: 'this probate'
};

// A DA role in the user's language: the English one, or in Norwegian a translation of
// it, else DA's own Norwegian word ("Barn", "Hosbonde")
function roleText(person) {
  const english = person.roleEnglish || '';
  if (english && (uiLanguage() === 'en' || hasTranslation(english))) return t(english);
  return person.role || english;
}

// The reason for attaching, as FS asks for one: "Father in the baptism of Ole (1845),
// Digitalarkivet pd00000012345678."
function defaultReason(record, person) {
  const role = roleText(person) || t('Named');
  const what = t(RECORD_WORDS[record.recordTypeInfo && record.recordTypeInfo.type] || 'this record');
  const year = ((record.recordDate || '').match(/^\d{4}/) || [])[0];
  // A census: where ("at Bakken nedre, Nordlien"), and which household when not the record's own
  const census = record.census || {};
  const where = [census.residence, census.district].filter(Boolean).join(', ');
  const household = person.household && person.householdNo ? ', ' + t('household no. {n}', { n: person.householdNo }) : '';
  return t('{role} in {record}', { role, record: what }) + (year ? ' (' + year + ')' : '') + (where ? ' ' + t('at {place}', { place: where }) : '') + household +
    ' ' + t('on Digitalarkivet, {id}.', { id: record.permanentId || record.url });
}

// Surnames to offer for a person recorded by given name only: the father's
// patronymic (from the record's father, by the sex the record or the paired FS person
// gives; both when neither does), and the paired FS person's own name
function surnameSuggestions(person, people, record, tree) {
  const name = stripVariants(person.name);
  if (!name || name.split(/\s+/).length > 1) return [];
  const out = [];
  if (tree && tree.name && tree.name.split(/\s+/).length > 1 && hasGivenName(person, givenOf(tree.name))) {
    out.push({ name: tree.name, label: t('FamilySearch name') });
  }
  if (roleKind(person) === 'child' && record.recordTypeInfo && record.recordTypeInfo.type !== 'census') {
    const father = people.find((p) => roleKind(p) === 'father' && p.name);
    if (father) {
      const own = person.primary ? (record.fields || {})['gender'] : '';  // the fields are the primary person's
      const sex = tree && tree.gender ? tree.gender : /^m/i.test(own || '') ? 'Male' : /^(k|f)/i.test(own || '') ? 'Female' : '';
      for (const s of sex ? [sex] : ['Male', 'Female']) {
        const pat = patronymicOf(stripVariants(father.name), s);
        if (pat && !out.some((o) => o.name === name + ' ' + pat)) out.push({ name: name + ' ' + pat, label: t('father\'s patronymic') });
      }
    }
  }
  return out;
}

// --- Loading --------------------------------------------------------------------------

// The record from DA: the page `rec` (a search hit, the FS person's own entry), and
// for the source fields the principal's page of it (the baptized child's, ...)
async function loadFromDA(rec) {
  const read = async (url) => {
    const doc = new DOMParser().parseFromString(await fetchResultPage(url, false), 'text/html');
    await loadMoreResidents(doc, (more) => fetchResultPage(more, false));  // a census's residents past the 50th
    return extractRecord(doc, url);
  };
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
  if (!stored) throw new Error(t('The record is no longer here. Click the extension icon on the DA page again.'));
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

const state = { record: null, parallel: null, people: [], fs: null, trees: {}, rows: [], running: false, trusted: false, fsCheck: null, books: [''] };
const $ = (id) => document.getElementById(id);

function relationLabel(tree) {
  return tree.name + ' (' + (tree.relation === 'person' ? t('FamilySearch person') : t(tree.relation)) +
    (tree.year ? ', ' + t('b.') + ' ' + tree.year : '') + ') · ' + tree.pid;
}

// --- The record person beside the tree person -----------------------------------------
// As FS's Source Linker shows them: what the record says of the person (DA) and what FS
// has of the tree person paired (their own page, read from FS: state.details; until then
// the family card's lifespan), fact by fact, the agreements and differences marked.

const FACTS = ['Name', 'Sex', 'Birth', 'Christening', 'Confirmation', 'Marriage', 'Residence', 'Emigration', 'Death', 'Burial', 'Occupation'];

// "1845-04-06" → { year, month, day }; "1801" → { year }
function daDateParts(text) {
  const m = String(text || '').match(/^(1[5-9]\d\d|20\d\d)(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  return m ? { year: Number(m[1]), month: m[2] ? Number(m[2]) : null, day: m[3] ? Number(m[3]) : null } : null;
}
// A date as FS writes it: "6 April 1845", "April 1845", "1845"
function dateText(d) {
  if (!d || !d.year) return '';
  return d.month ? formatDate(d.year, d.month, d.day) : String(d.year);
}
// The record's place, from the source title: "Church book from Vågå parish, ..." → Vågå
function recordPlace(record) {
  const title = record.sourceTitle || '';
  const m = title.match(/\bfrom (.+?) parish\b/i) || title.match(/\bcensus for (?:\d{3,4} )?(.+?)(?: \(|$)/i);
  return m ? m[1] : '';
}
const joined = (...parts) => parts.filter(Boolean).join(', ');

// The record's parish as FS names it: a parish that is a municipality ("Vågå,
// Oppland, Norway"), else the municipality the parish code in the source title names
// (a parish of Oslo, 0301M…: "Oslo, Oslo, Norway"), else the parish in the county
function parishPlace(record) {
  const name = cleanPlace(recordPlace(record));
  if (!name) return '';
  const own = fsMunicipality(name, record);
  if (own) return own;
  const code = (parishCode(record.sourceTitle).match(/^\d{4}/) || [])[0];
  if (code && DA_MUNICIPALITIES[code]) return joined(municipalityName(code), fsCounty(countyName(code.slice(0, 2))), 'Norway');
  return fsPlace(name, record);
}

// What the record says of a person: { Fact: { text, date, year, approx, value } }
function recordFacts(person, record) {
  const facts = {};
  const type = (record.recordTypeInfo || {}).type;
  const kind = roleKind(person);
  const recorded = daDateParts(record.recordDate);
  const place = recordPlace(record);
  const own = (record.people || []).find((p) => p.current);
  const mine = !!own && own.id === person.id;  // the open person: their own fields too
  const fields = mine ? record.fields || {} : {};
  facts.Name = { text: stripVariants(person.name) };
  const gender = String(fields.gender || '');
  const sex = /^m/i.test(gender) ? 'Male' : /^(k|f)/i.test(gender) ? 'Female' : childSex(person, record);
  if (sex) facts.Sex = { text: t(sex), value: sex };

  // Birth: the person's own date of birth, else a year (an age gives one about)
  const raw = String(person.birthYear || '').trim();
  const born = (mine ? ownBirthDate(record) : null) || fullBirthDate(raw);
  const year = born ? born.year : birthYearOf(person, record);
  const fromAge = !born && /^\d{1,3}\b/.test(raw);
  const birthPlace = person.birthPlace || fields['birth place'] || fields['place of birth'] || '';
  if (born || raw || birthPlace) {
    const when = born ? dateText(born) || formatDate('', born.month, born.day)
      : fromAge && year ? t('about {year}', { year }) + ' (' + t('age {age}', { age: raw.match(/^\d+/)[0] }) + ')'
        : raw.replace(/\s*\(calculated\)/, '');
    facts.Birth = { text: joined(when, birthPlace), date: born, year, approx: fromAge || /calculated|\*/.test(raw), place: birthPlace };
  }

  // The record's event, for the one it is about
  const event = (label, extra) => { facts[label] = { text: joined(dateText(recorded), place, extra), date: recorded, year: recorded && recorded.year }; };
  if (type === 'birth_baptism' && kind === 'child') event('Christening');
  else if (type === 'confirmation' && kind === 'child') event('Confirmation');
  else if (type === 'marriage' && (kind === 'groom' || kind === 'bride')) event('Marriage');
  else if (type === 'death_burial' && kind === 'deceased') {
    event('Burial');
    const died = String(fields['date of death'] || '').match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
    // no year of death: the burial's year, or the year before when the day comes after it
    const before = died && recorded && recorded.month && Number(died[2]) * 100 + Number(died[3]) > recorded.month * 100 + (recorded.day || 0);
    const diedYear = Number((died && died[1]) || String(fields['year of death'] || '').match(/\b1[5-9]\d\d\b/)?.[0]) ||
      (died && recorded && recorded.year ? recorded.year - (before ? 1 : 0) : null);
    if (died || diedYear) {
      const d = { year: diedYear, month: died ? Number(died[2]) : null, day: died ? Number(died[3]) : null };
      facts.Death = { text: dateText(d), date: d, year: diedYear };
    }
  } else if (type === 'emigration' && mine) {
    event('Emigration', emigrationDestination(record));
  }
  // Where they lived: a census's residence, else the record's residence of the person
  const census = record.census || {};
  if (type === 'census') {
    facts.Residence = { text: joined(recorded && recorded.year, census.residence, census.district, place), year: recorded && recorded.year };
  } else if (person.residence) {
    facts.Residence = { text: joined(recorded && recorded.year, person.residence), year: recorded && recorded.year };
  }
  const occupation = occupationOf(person.position);
  if (occupation) facts.Occupation = { text: occupation };
  return facts;
}

// The occupation a position gives: none for a family word or a marital status alone,
// which censuses and church books write in its place (1900's "Søn", "Datter", a
// baptism's "Pige", "Barnet", "Hustru", 1865's "Smedens Kone"), and without a leading
// marital status ("Gift Murerarbeider")
const KIN_WORD = '(?:søn|sønn|datter|dotter|barn|barnet|børn|pige|pigen|pigebarn|dreng|drengen|drengebarn|gut|guten|hustru|hustrue|hustr|kone|konen|ugift|ugifte|gift|enke|enkemand|enkemann)';
function occupationOf(position) {
  const text = String(position || '').replace(/^(?:u?gift)\s+(?=\S)/iu, '').trim();
  const bare = text.replace(/[.,;:]+$/u, '').replace(/\s+/g, ' ').toLowerCase();
  const kin = new RegExp('^(?:hj\\. ?|(?:hjemmev\\.?|hjemmeværende|' + REFERRING + '|\\p{L}+s) )?' + KIN_WORD + '$', 'iu');
  return !bare || kin.test(bare) ? '' : text;
}

// The tree person's whole page when known (the FS person, a relative's family read
// for a census, or details read for the comparison), else null
function fullTree(pid) {
  if (!pid) return null;
  if (state.fs && state.fs.pid === pid) return state.fs;
  return (state.trees && state.trees[pid]) || (state.details && state.details[pid]) || null;
}

// What FS has of a tree person: their page's facts, or the family card's lifespan
// ("1810-1880": the birth and death years)
function treeFacts(tree, record) {
  const facts = {};
  if (!tree) return facts;
  const full = fullTree(tree.pid);
  facts.Name = { text: (full || tree).name };
  const gender = (full || tree).gender;
  if (gender) facts.Sex = { text: t(gender), value: gender };
  if (!full) {
    const years = String(tree.lifespan || '').match(/\b1[5-9]\d\d\b|\b20\d\d\b/g) || [];
    const [from, to] = String(tree.lifespan || '').split(/[-–]/);
    if (years.length && /\d{4}/.test(from || '')) facts.Birth = { text: from.trim(), year: Number(from.match(/\d{4}/)[0]) };
    if (/\d{4}/.test(to || '')) facts.Death = { text: to.trim(), year: Number(to.match(/\d{4}/)[0]) };
    return facts;
  }
  const event = (e) => (e && (e.date || e.place) ? { text: joined(e.date, e.place), date: parseFsDate(e.date) } : null);
  for (const [fact, key] of [['Birth', 'birth'], ['Christening', 'christening'], ['Death', 'death'], ['Burial', 'burial']]) {
    const f = event(full[key]);
    if (f) facts[fact] = { ...f, year: f.date && f.date.year };
  }
  const recordYear = (daDateParts(record.recordDate) || {}).year;
  const nearest = (list) => {  // the one nearest the record's year
    const dated = (list || []).filter(Boolean);
    return dated.sort((a, b) => Math.abs(((parseFsDate(a.date) || {}).year || 9999) - recordYear) - Math.abs(((parseFsDate(b.date) || {}).year || 9999) - recordYear))[0];
  };
  const marriages = (full.families || []).filter((f) => f.marriage && (f.marriage.date || f.marriage.place))
    .map((f) => ({ ...f.marriage, spouse: f.spouse && f.spouse.name }));
  const married = nearest(marriages);
  if (married) {
    facts.Marriage = { ...event(married), year: (parseFsDate(married.date) || {}).year };
    if (married.spouse) facts.Marriage.text += ' (' + t('with {name}', { name: married.spouse }) + ')';
  }
  const lived = nearest(full.residences);
  if (lived) {
    facts.Residence = { ...event(lived), year: (parseFsDate(lived.date) || {}).year };
    if (full.residences.length > 1) facts.Residence.text += ' ' + t('(and {n} more)', { n: full.residences.length - 1 });
  }
  const left = nearest(full.emigration);
  if (left) facts.Emigration = { ...event(left), year: (parseFsDate(left.date) || {}).year };
  return facts;
}

// How a record fact compares with FS's: 'same' ✓, 'near' ≈, 'differs' ✗, or '' (no
// comparison: one side doesn't have it, or it isn't compared, as places and occupations).
// A name is the same when the given names agree and the record's is no other name
// than FS's (otherName(), which offers it as an alternate name; with the page read).
function compareFact(fact, da, fs, person, tree, record) {
  if (!da || !fs) return '';
  if (fact === 'Name') {
    const fit = givenNameFit(person, tree);
    const full = record && tree && fullTree(tree.pid);
    if (fit === 2 && full && otherName(person, record, full)) return 'near';
    return fit === 2 ? 'same' : fit === 1 ? 'near' : 'differs';
  }
  if (fact === 'Sex') return da.value && fs.value ? (da.value === fs.value ? 'same' : 'differs') : '';
  if (!da.year || !fs.year) return '';
  // Both with a day: the same day; else the years, an age's within one
  const a = da.date || {}, b = fs.date || {};
  if (a.day && b.day && a.month && b.month && da.year === fs.year) return a.month === b.month && a.day === b.day ? 'same' : 'near';
  const off = Math.abs(da.year - fs.year);
  if (fact === 'Residence') return off === 0 ? 'same' : '';  // FS's nearest residence may be another year's
  if (off === 0 || (da.approx && off <= 1)) return 'same';
  return off <= 2 || (da.approx && off <= 3) ? 'near' : 'differs';
}

const MARKS = { same: '✓', near: '≈', differs: '✗' };

// The facts table of a row: fact | DigitalArkivet | FamilySearch
function factsTable(person, record, tree, reading) {
  const da = recordFacts(person, record);
  const fs = treeFacts(tree, record);
  const head = el('tr', {}, [el('th', {}), el('th', { text: 'DigitalArkivet' }), el('th', { text: 'FamilySearch' })]);
  const rows = FACTS.filter((f) => da[f] || fs[f]).map((f) => {
    const how = compareFact(f, da[f], fs[f], person, tree, record);
    const fsCell = el('td', {}, how ? [el('span', { class: 'mark ' + how, text: MARKS[how] + ' ' }), document.createTextNode(fs[f].text)]
      : [document.createTextNode(fs[f] ? fs[f].text : '')]);
    return el('tr', { class: how }, [el('th', { text: t(f) }), el('td', { text: da[f] ? da[f].text : '' }), fsCell]);
  });
  const note = !tree ? '' : reading ? t('Reading the details from FamilySearch…')
    : !fullTree(tree.pid) ? t('Only the years are known here; the details could not be read from FamilySearch.') : '';
  if (note) rows.push(el('tr', { class: 'note' }, [el('th', {}), el('td', {}), el('td', { class: 'muted', text: note })]));
  return el('table', { class: 'facts' }, [el('thead', {}, [head]), el('tbody', {}, rows)]);
}

// --- Adding the record's facts to FamilySearch ----------------------------------------
// What a row's record facts could add to the tree person, or change, each with a
// suggested entry the user edits and ticks: [{fact, action, type, title, current,
// value: {date, place, description} or {given, surname}}]. The actions: 'name' (an
// alternate name), 'add' (a fact FS doesn't have) and 'edit' (FS's birth, christening,
// death or burial written over: FS keeps one of each, so the suggestion combines the
// two). Only once the tree person's page is read: the lifespan can't tell what's there.

const VITAL_TYPES = { Birth: 'BIRTH', Christening: 'CHRISTENING', Death: 'DEATH', Burial: 'BURIAL' };
const FS_APPROX = /\b(abt|about|ca|circa|est|estimated|calc|calculated|omkring|omtrent)\b/i;

// A date combining the record's and FS's: the more specific where they agree, the
// record's where they disagree. A year from an age doesn't replace FS's within three.
function mergeDate(da, approx, fsText) {
  const has = String(fsText || '').trim();
  if (!da || !da.year) return has;
  const mine = fsDateText(da, approx);
  if (!has) return mine;
  const fs = parseFsDate(has);
  if (!fs) return approx ? has : mine;  // FS's before, after or between
  if (approx) return Math.abs(fs.year - da.year) <= 3 ? has : mine;
  if (fs.year !== da.year || (da.month && fs.month && da.month !== fs.month) || (da.day && fs.day && da.day !== fs.day)) return mine;
  const detail = (d) => (d.month ? 1 : 0) + (d.day ? 1 : 0);
  return detail(da) > detail(fs) || (detail(da) === detail(fs) && FS_APPROX.test(has)) ? mine : has;
}

// DA's place name without its marks: "Vågå herred*" → "Vågå", "1029P Audnedal" → "Audnedal"
function cleanPlace(place) {
  return String(place || '').replace(/\*/g, '').replace(/^\d{3,4}[A-Z]?\s+/, '')
    .replace(/\s+(prgj\.?|prestegjeld|sogn|herred|s\.)$/i, '').trim();
}
// Whether FS's place names the record's (by any of its names: Vaage, Vågå, Vaga)
function placeIn(name, fsText) {
  const words = placeWords(name);
  if (words) return words.every((w) => placeIn(w, fsText));
  const names = new Set(placeAliases(name).flatMap((n) => [foldPlace(n), asciiPlace(n)]));
  return String(fsText || '').split(',').some((part) => {
    const p = part.replace(/\b(church|kirke|kirkested|prestegjeld|parish|sogn|herred|municipality|kommune)\b/gi, '').trim();
    return names.has(foldPlace(p)) || names.has(asciiPlace(p));
  });
}
// A place DA gives as one name written twice, perhaps with a letter after it
// ("Christiansund Christiansund N", the town Kristiansund N): its words, else null
function placeWords(name) {
  const text = String(name || '').trim();
  if (/,/.test(text)) return null;
  const words = text.split(/\s+/).filter((w) => w.replace(/\./g, '').length > 1);
  return words.length > 1 && new Set(words.map(foldPlace)).size === 1 ? [words[0]] : null;
}
// A place combining the record's and FS's: FS's when it names the record's place,
// else the record's in FS's form. A place the record only implies (`weak`: a death in
// the parish of the burial) fills an empty one only. `elsewhere`: a place the record
// names but isn't in (a census's birthplace), so not given the record's county.
// A farm (a place no municipality is named by) goes before FS's municipality ("Holten"
// and FS's "Vågå, Oppland, Norway"), never over a place of FS's that says more or
// names another country; `within`, when given, is the place FS's must name for that
// (a death: the parish, not the town of a hospital). `suggested` is the place to give
// when FS has none.
function mergePlace(daPlace, fsText, record, weak, elsewhere, within, suggested) {
  const has = String(fsText || '').trim();
  const name = cleanPlace(daPlace);
  if (!name) return has;
  if (!has) return suggested || fsPlace(name, record, elsewhere);
  if (weak || placeIn(name, has)) return has;
  if (!fsMunicipality(name, record, elsewhere)) {
    const parts = has.split(',').map((x) => x.trim());
    const municipal = parts.length <= 3 && parts[parts.length - 1] === 'Norway';
    return municipal && (!within || placeIn(within, has)) ? joined(name, has) : has;
  }
  return fsPlace(name, record, elsewhere);
}

// Whether two farm names are one farm in two spellings: the same consonants, with d
// and t as one (Holden and Holten; clerks wrote a name as it was said)
function sameFarm(a, b) {
  const key = (s) => skeleton(s).replace(/d/g, 't');
  const k = key(a);
  return k.length >= 3 && k === key(b);
}

// Where the deceased died, as the record has it: its place of death, else their
// residence, else the farm in their name (the words after the patronymic are an
// address: "Lars Larsen Holten"), in the birthplace's spelling when that is the same
// farm (DA's "Holten" for the name's "Holden"); '' when none
function deathFarm(person, record) {
  const own = (record.people || []).find((p) => p.current);
  const fields = own && own.id === person.id ? record.fields || {} : {};
  const given = cleanPlace(fields['place of death'] || fields['death place'] || person.residence || '');
  if (given) return given;
  // in a town's church book the word after the patronymic is a family name
  // (Lars Larsen Lindemann), not a farm he died on
  if (townParish(record)) return '';
  const farm = nameParts(stripVariants(person.name)).rest;
  if (!farm) return '';
  const born = cleanPlace(person.birthPlace || fields['birth place'] || '');
  return born && sameFarm(farm, born) ? born : farm;
}

// Whether the record's parish is a town's: DA's municipality numbers give a town
// (a kjøpstad or ladested) a number below 11 in its county (Arendal 0903, Oslo 0301),
// a rural municipality 11 and up (Gjerstad 0911)
function townParish(record) {
  const code = (parishCode(record.sourceTitle).match(/^\d{4}/) || [])[0];
  return !!code && Number(code.slice(2)) < 11;
}

// Where a church-book event took place, as FS names it: the record's church when it
// gives one (a municipality of its own, else in the parish), else the parish
function churchPlace(record) {
  const parish = parishPlace(record);
  const church = cleanPlace(record.church);
  // the parish by the name FS has for it: a town's parish (one of Oslo's) is the town
  if (!church || placeIn(church, parish)) return { name: parish.split(',')[0].trim() || recordPlace(record), place: parish };
  return { name: church, place: fsMunicipality(church, record) || joined(church, parish) };
}

// A name split as FS's form takes it: the given names up to the patronymic, which is
// the surname; a word after it (a farm, an address) left out. No patronymic: the last
// word is the surname. With `fathers` (the record's father's given names), of two
// patronymics the one of that father is the surname ("Astri Pedersdatter Larsdatter",
// father Lars: Larsdatter); with `family` (the tree's surname, not a patronymic), a
// last word that is the family name in another spelling is the surname, the
// patronymic a given name ("Lars Halvorsen Lindeman", FS's Lindemann).
function nameParts(name, { fathers = [], family = '' } = {}) {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  const sameWord = (a, b) => fold(a) === fold(b) || nameNear(a, b);
  if (family && words.length > 2 && !isPatronymic(last) && sameWord(last, family)) {
    return { given: words.slice(0, -1).join(' '), surname: last, rest: '' };
  }
  const pats = words.map((w, i) => (i > 0 && isPatronymic(w) ? i : -1)).filter((i) => i > 0);
  if (pats.length) {
    const first = pats[0];
    // the father's name as a patronymic's base reads it, without its genitive s (Johannes)
    const ofFather = (i) => fathers.some((f) => sameFather(patronymicBase(words[i]), f) || sameFather(patronymicBase(words[i]), f.replace(/s$/i, '')));
    const k = pats.find(ofFather) || first;
    const rest = words.slice(first).filter((w, i) => i + first !== k);
    return { given: words.slice(0, first).join(' '), surname: words[k], rest: rest.join(' ') };
  }
  if (words.length > 1) return { given: words.slice(0, -1).join(' '), surname: last, rest: '' };
  return { given: words.join(' '), surname: '', rest: '' };
}
// The given names of a person's fathers in the record (a baptism's father, a groom's
// or bride's father), for nameParts()
function recordFathers(person, record) {
  const view = { ...record, people: (record.people || []).map((p) => ({ ...p, current: p.id === person.id })) };
  return relativesInRecord(view).father.map((p) => stripVariants(p.name).split(/\s+/)[0]).filter(Boolean);
}
// The tree's family name: the last word of FS's name when it isn't a patronymic
function treeFamilyName(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  return words.length > 1 && !isPatronymic(last) ? last : '';
}
const sameNameKey = (name) => String(name || '').toLowerCase().replace(/[.,'"]/g, '').replace(/\s+/g, ' ').trim();

// The emigrant protocol's place of departure: "Oslo police district, ..." → Oslo; DA
// leaves some titles Norwegian: "Bergen Politidistrikt, ..." → Bergen
function departurePlace(record) {
  const m = String(record.sourceTitle || '').match(/^(.+?)\s+(?:police\s+(?:district|station|chamber)|politi(?:distrikt|kammer|stasjon|mester))/i);
  return m ? m[1].trim() : '';
}
// Where an emigrant went: the record's destination ("Minnesota"), else the protocol's
// own ("Emigrants to America", when the record leaves the destination empty), or ''
function emigrationDestination(record) {
  const fields = record.fields || {};
  const own = fields['destination'] || fields['migrating to'] || '';
  if (own) return own;
  const m = String(record.sourceTitle || '').match(/\bEmigrants to ([^,]+?)(?:,|$)/i);
  return m ? m[1].trim() : '';
}

// The year of an FS date, or null
const fsYear = (text) => (parseFsDate(text) || {}).year || Number((String(text || '').match(/\b1[5-9]\d\d\b|\b20\d\d\b/) || [])[0]) || null;

// The record's name as FS's form takes it ({given, surname}) when FS has it neither as
// the name nor as an alternate one (`full`: the tree person as read), else null. A
// name of FS's given names only (a baptism's "Lars Ole" for FS's Lars Ole Halvorsen)
// has no surname: its last word isn't one, and it's no other name.
function otherName(person, record, full, name) {
  const asWritten = name || stripVariants(person.name);
  const parts = nameParts(asWritten, { fathers: recordFathers(person, record), family: treeFamilyName(full.name) });
  const fsGiven = String(full.name || '').split(/\s+/).filter(Boolean).slice(0, -1);
  const givenOnly = fsGiven.length > 0 && asWritten.split(/\s+/).filter(Boolean).every((w) => fsGiven.some((g) => nameMatch(w, g)));
  if (!parts.surname || givenOnly) return null;
  const known = [full.name, ...(full.altNames || [])].map(sameNameKey);
  return known.includes(sameNameKey(parts.given + ' ' + parts.surname)) ? null : { given: parts.given, surname: parts.surname };
}

function factAdditions(person, record, tree, name) {
  const full = tree && fullTree(tree.pid);
  if (!full) return [];
  const da = recordFacts(person, record);
  const out = [];
  const place = recordPlace(record);
  const year = (daDateParts(record.recordDate) || {}).year;

  // A name FS has neither as the name nor as an alternate one
  const other = otherName(person, record, full, name);
  if (other) out.push({ fact: 'Name', action: 'name', type: 'ALTERNATE_NAME', current: full.name, value: { ...other, nameType: 'AKA' } });

  // Birth, christening, death, burial: added, or FS's combined with the record's.
  // A birthplace can lie anywhere (a census's, a burial's). A death took place at the
  // record's place of death, the residence or the farm in the name, in the parish; a
  // record with none of them only implies the parish (`weak`). Christening and burial
  // were at the church.
  const church = churchPlace(record);
  const parish = parishPlace(record);
  const died = deathFarm(person, record);
  const diedAt = died && !placeIn(died, parish) ? joined(died, parish) : parish;
  const bornAt = da.Birth && cleanPlace(da.Birth.place);
  // a birth farm FS has no place for: in the parish when he died on the same farm
  const bornSuggested = bornAt && !fsMunicipality(bornAt, record, true) && died && sameFarm(bornAt, died) ? diedAt : '';
  const vitalPlace = {
    Birth: [bornAt, false, true, '', bornSuggested],
    Christening: [church.name, false, false, '', church.place],
    Death: [died || place, !died, false, place, died ? diedAt : ''],
    Burial: [church.name, false, false, '', church.place]
  };
  for (const [fact, type] of Object.entries(VITAL_TYPES)) {
    const f = da[fact];
    if (!f) continue;
    const fs = full[fact.toLowerCase()] || null;
    // no year in the record (a marriage's birthplace): only a place FS's dated fact lacks
    const placeOnly = fs && String(fs.date || '').trim() && !String(fs.place || '').trim() && cleanPlace(vitalPlace[fact][0]);
    if (!f.year && !placeOnly) continue;
    const date = !f.year ? null : f.date && f.date.year ? f.date : { year: f.year };
    const value = { date: mergeDate(date, f.approx || !(f.date && f.date.year), fs && fs.date), place: mergePlace(...[vitalPlace[fact][0], fs && fs.place, record].concat(vitalPlace[fact].slice(1))) };
    // FS's fact with neither date nor place ("Deceased", of an old import) is changed:
    // FS keeps one of each and has no Add for it
    if (!fs) out.push({ fact, action: 'add', type, value });
    else if (value.date !== String(fs.date || '').trim() || value.place !== String(fs.place || '').trim()) {
      out.push({ fact, action: 'edit', type, current: joined(fs.date, fs.place), value });
    }
  }

  // A residence of a year FS has none of: the farm in the place ("Bakken nedre, Vågå,
  // Oppland, Norway"; not when it is the parish's own name), and as its description.
  // An emigrant protocol's residence is the emigrant's home, anywhere in Norway, not in
  // the police district; one abroad ("Amerika": an American going back) isn't added,
  // since FS would place it in a village of that name somewhere.
  const kind = (record.recordTypeInfo || {}).type;
  const isCensus = kind === 'census';
  const home = cleanPlace(isCensus ? (record.census || {}).residence : person.residence);
  if (da.Residence && year && !placeAbroad(home) && !(full.residences || []).some((r) => fsYear(r.date) === year)) {
    const census = record.census || {};
    const description = isCensus ? joined(census.residence, census.district) : person.residence || '';
    // a residence that is a town ("Chr": Kristiania) is the town, not a farm in the parish
    const town = home && !isCensus && fsMunicipality(home, record);
    const where = kind === 'emigration' ? fsPlace(home, record, true)
      : town || (home && !placeIn(home, parish) ? joined(home, parish) : parish);
    if (where) out.push({ fact: 'Residence', action: 'add', type: 'RESIDENCE', value: { date: String(year), place: where, description } });
  }
  // An emigration: a custom event (FS has no Emigration to add), unless FS has one that year
  if (da.Emigration && da.Emigration.year && !(full.emigration || []).some((e) => fsYear(e.date) === da.Emigration.year)) {
    const to = emigrationDestination(record);
    out.push({ fact: 'Emigration', action: 'add', type: 'OTHER_EVENT', title: 'Emigration',
      value: { date: fsDateText(da.Emigration.date), place: fsPlace(departurePlace(record), record), description: to ? 'Destination: ' + to : '' } });
  }
  // An occupation FS doesn't have in the same words
  if (da.Occupation && !(full.occupations || []).some((o) => sameNameKey(o.description) === sameNameKey(da.Occupation.text))) {
    out.push({ fact: 'Occupation', action: 'add', type: 'OCCUPATION', value: { date: year ? String(year) : '', place: parishPlace(record), description: da.Occupation.text } });
  }
  return out;
}

// The reason written on FS with an addition (English, as the source is)
function additionReason(record, title) {
  return 'From "' + (title || record.title || record.sourceTitle || '') + '", Digitalarkivet, Permanent ID ' + (record.permanentId || '') + '.';
}

// The additions' fields and ticks as the user left them, by row, tree person and
// fact, so a redrawn row (details read, a name edited) keeps them
const NAME_TYPES = [['AKA', 'Also known as'], ['BIRTH', 'Birth name'], ['MARRIED', 'Married name'], ['NICK', 'Nickname']];
const additionKey = (person, pid, a) => [person.key, pid, a ? a.fact + ':' + a.action : 'reason'].join('|');
const hasDescription = (a) => ['RESIDENCE', 'OCCUPATION', 'OTHER_EVENT'].includes(a.type);

// What an addition says, as the row's tickbox and the summary write it
function additionLabel(a) {
  if (a.action === 'name') return t('Add the alternate name');
  if (a.type === 'OTHER_EVENT') return t('Add the {fact} as a custom event', { fact: t(a.fact).toLowerCase() });
  if (a.action === 'edit') return t('Change the {fact}', { fact: t(a.fact).toLowerCase() });
  return t('Add the {fact}', { fact: t(a.fact).toLowerCase() });
}
function additionText(a) {
  const v = a.value;
  if (a.action === 'name') return [v.given, v.surname].filter(Boolean).join(' ') + ' (' + t((NAME_TYPES.find(([id]) => id === v.nameType) || NAME_TYPES[0])[1]) + ')';
  return [v.description, v.date, v.place].filter(Boolean).join(', ');
}

// The additions of a row paired with a tree person whose page was read: a tickbox
// (unticked) and the suggested entry, editable, each; one reason for them all
function additionsBox(row, person, pid, list) {
  const store = state.additionEdits || (state.additionEdits = {});
  const changed = () => { showChanges(); };
  const items = list.map((a) => {
    const key = additionKey(person, pid, a);
    const kept = store[key] || { checked: false, value: { ...a.value } };
    // Filled in FS's own dialog (prepareAdditions()): its standard date and place
    const checkedNote = el('div', { class: 'muted small checked-note', hidden: !kept.fs, text: kept.fs ? fsCheckedText(kept.fs) : '' });
    const box = el('input', { type: 'checkbox' });
    box.checked = kept.checked;
    const input = (field, label, cls) => {
      const node = el('input', { type: 'text', class: cls || field, placeholder: t(label), 'aria-label': t(label) });
      node.value = kept.value[field] || '';
      node.addEventListener('input', () => { kept.value[field] = node.value; delete kept.fs; store[key] = kept; checkedNote.hidden = true; changed(); });
      return node;
    };
    let fields;
    if (a.action === 'name') {
      const type = el('select', { 'aria-label': t('Name type') }, NAME_TYPES.map(([id, label]) => el('option', { value: id, text: t(label) })));
      type.value = kept.value.nameType || 'AKA';
      type.addEventListener('change', () => { kept.value.nameType = type.value; store[key] = kept; changed(); });
      fields = [input('given', 'Given names'), input('surname', 'Surname'), type];
    } else {
      fields = [...(hasDescription(a) ? [input('description', 'Description')] : []), input('date', 'Date'), input('place', 'Place')];
    }
    const body = el('div', { class: 'add-fields', hidden: !kept.checked }, [...fields, checkedNote]);
    box.addEventListener('change', () => {
      kept.checked = box.checked;
      // The fact's tag ticked with it, and unticked with it when ticked by it
      if (box.checked) kept.tagged = row.tickTag(a.fact, true);
      else if (kept.tagged) { row.tickTag(a.fact, false); kept.tagged = false; }
      store[key] = kept;
      body.hidden = !box.checked;
      changed();
    });
    const current = a.action === 'edit' ? el('span', { class: 'muted', text: ' ' + t('FamilySearch has: {current}', { current: a.current || t(a.fact === 'Death' ? 'Deceased' : 'no date or place') }) }) : null;
    return { a, kept, node: el('li', {}, [el('label', {}, [box, document.createTextNode(additionLabel(a))]), current, body]) };
  });
  const reasonKey = additionKey(person, pid, null);
  const reason = el('textarea', { rows: '2', class: 'reason', 'aria-label': t('Reason for the changes') });
  reason.value = store[reasonKey] != null ? store[reasonKey] : additionReason(state.record, $('f-title') && $('f-title').value.trim());
  reason.addEventListener('input', () => { store[reasonKey] = reason.value; changed(); });
  const reasonWrap = el('div', { class: 'add-reason' }, [el('div', { class: 'label muted', text: t('Reason for the changes') }), reason]);
  const anyTicked = () => items.some((i) => i.kept.checked);
  reasonWrap.hidden = !anyTicked();
  for (const i of items) i.node.querySelector('input[type=checkbox]').addEventListener('change', () => { reasonWrap.hidden = !anyTicked(); });
  row.additions = () => items.filter((i) => i.kept.checked).map((i) => ({ ...i.a, key: additionKey(person, pid, i.a), value: { ...i.kept.value }, reason: reason.value.trim() }));
  return el('div', { class: 'additions' }, [
    el('div', { class: 'label muted', text: t('Add to FamilySearch') }),
    el('ul', {}, items.map((i) => i.node)), reasonWrap]);
}

// What FS's dialog made of an addition's date and place
function fsCheckedText(fs) {
  if (fs.error) return t('Not checked with FamilySearch: {error}', { error: fs.error });
  const standard = (fs.fields || []).filter((f) => (f.name === 'date' || f.name === 'place'));
  if (!standard.length) return t('Checked with FamilySearch.');
  return t('Checked with FamilySearch: {fields}', {
    fields: standard.map((f) => t(f.name === 'date' ? 'Date' : 'Place') + ': ' + (f.picked ? f.value : t('{value} (not standardized)', { value: f.value }))).join('; ')
  });
}

// The ticked additions filled in FS's own dialogs in the hidden window, each cancelled:
// FS's standard date and place (the place of the record's year) go into the boxes, to
// be looked over before anything is saved. run() picks them again the same way.
async function prepareAdditions() {
  if (state.running || state.preparing) return;
  const store = state.additionEdits || {};
  const todo = (state.rows || []).map((row) => ({ row, pid: row.pid(), additions: row.additions ? row.additions() : [] }))
    .map((r) => ({ ...r, additions: r.additions.filter((a) => a.action !== 'name' && (a.value.date || a.value.place)) }))
    .filter((r) => /^[A-Z0-9]{4}-[A-Z0-9]{2,4}$/i.test(r.pid || '') && r.additions.length);
  const status = $('changes-status');
  if (!todo.length) { status.textContent = t('Nothing with a date or place to check.'); return; }
  state.preparing = true;
  $('check-changes').disabled = true;
  status.textContent = t('Filling the changes in FamilySearch\'s forms (nothing is saved)…');
  let tab = null, done = 0, failed = 0;
  const fill = async (pid, a) => {
    const answer = await step(tab.id, 'addFact', { pid, addition: a, reason: a.reason, save: false });
    if (!answer.ok) throw stepError(answer);
    return answer.fields || [];
  };
  try {
    tab = await hiddenTab();
    for (const { row, pid, additions } of todo) {
      await navigate(tab.id, personDetailsUrl(pid));
      for (const a of additions) {
        const kept = store[a.key];
        if (!kept) continue;
        let fields;
        try {
          try { fields = await fill(pid, a); } catch (e) {
            if (e.blocked) throw e;  // FS's block page: shown, it comes again
            // a covered window may not be drawn (Windows, macOS): once more on top
            await tab.show();
            try { await navigate(tab.id, personDetailsUrl(pid)); fields = await fill(pid, a); } finally { await tab.back(); }
          }
        } catch (e) {
          kept.fs = { error: e.message || String(e) };
          failed++;
          continue;
        }
        for (const f of fields) if ((f.name === 'date' || f.name === 'place') && f.picked && f.value) kept.value[f.name] = f.value;
        kept.fs = { fields };
        done++;
      }
      row.showFacts();
    }
    status.textContent = failed ? t('Checked with FamilySearch: {done}; not checked: {failed}.', { done, failed })
      : t('Checked with FamilySearch: look the dates and places over before saving.');
  } catch (e) {
    status.textContent = t('Not checked with FamilySearch: {error}', { error: e.message || String(e) });
  } finally {
    if (tab) tab.close();
    state.preparing = false;
    $('check-changes').disabled = false;
    showChanges();
  }
}

// Above the buttons: every change ticked, by tree person, made after the attach
function showChanges() {
  const box = $('changes');
  if (!box) return;
  const lines = [];
  for (const row of state.rows || []) {
    const pid = row.pid();
    if (!pid || !row.additions) continue;
    for (const a of row.additions()) lines.push(row.label() + ' (' + pid + '): ' + additionLabel(a).toLowerCase() + ': ' + additionText(a));
  }
  box.hidden = !lines.length;
  $('changes-list').replaceChildren(...lines.map((line) => el('li', { text: line })));
}

// One person of the record: name (editable, with surname suggestions), role, the
// tree person to attach to, tags, reason
function personRow(person, family, suggestion, why) {
  const row = { person, name: stripVariants(person.name), noteName: person.name };
  const role = roleText(person);

  const nameInput = el('input', { type: 'text', class: 'name', value: row.name, 'aria-label': t('Name in the source') });
  const suggest = el('div', { class: 'suggest' });
  const select = el('select', { 'aria-label': t('Tree person for {name}', { name: row.name }) });
  const otherPid = el('input', { type: 'text', class: 'pid', placeholder: t('PID, e.g. XXXX-XXX'), hidden: true, 'aria-label': t('FamilySearch ID') });
  const hint = el('div', { class: 'why muted', text: why || '' });
  const fsStatus = el('div', { class: 'fs-status', hidden: true });  // attached on FS already?
  // The tree persons to choose from, and the suggested one
  const fill = (suggested) => {
    select.replaceChildren(el('option', { value: '', text: t('— don\'t attach —') }),
      ...family.map((tree) => el('option', { value: tree.pid, text: relationLabel(tree) })),
      el('option', { value: 'other', text: t('Another person (PID)…') }),
      el('option', { value: 'new', text: t('New person on FamilySearch…') }));
    if (suggested && family.some((tree) => tree.pid === suggested)) select.value = suggested;
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
    return el('label', {}, [box, document.createTextNode(t(label))]);
  }));
  const reason = el('textarea', { rows: '2', class: 'reason', 'aria-label': t('Reason for attaching') });
  reason.value = defaultReason(state.record, person);

  const attachCell = el('div', { class: 'attach' }, [select, otherPid, hint, fsStatus]);
  const facts = el('div', { class: 'facts-wrap' });
  const detail = el('div', { class: 'attach-detail' }, [
    el('div', {}, [el('div', { class: 'label muted', text: t('Tags') }), tags]),
    el('div', {}, [el('div', { class: 'label muted', text: t('Reason') }), reason])]);
  const node = el('li', { class: 'person' + (person.current ? ' anchor' : '') }, [
    el('div', { class: 'who' }, [nameInput, el('div', { class: 'role muted', text: role }), suggest]),
    attachCell, facts, detail
  ]);

  row.pid = () => (select.value === 'other' ? otherPid.value.trim().toUpperCase() : select.value);
  row.touched = () => touched;
  row.tags = () => TAGS.map(([id]) => id).filter((id) => tagBoxes[id].checked);
  // A fact ticked to be added ticks its tag (additionsBox()); true when it changed the box
  row.tickTag = (id, on) => {
    const box = tagBoxes[id];
    if (!box || box.checked === on) return false;
    box.checked = on;
    return true;
  };
  row.reason = () => reason.value.trim();
  row.tree = () => family.find((tree) => tree.pid === select.value) || null;
  row.label = () => nameInput.value.trim() || role;
  row.why = () => hint.textContent;
  row.status = () => (fsStatus.hidden ? '' : fsStatus.textContent);
  // The record's facts beside FS's of the tree person chosen (a PID typed: once read)
  row.showFacts = () => {
    const pid = row.pid();
    const tree = row.tree() || (PID_PATTERN.test(pid) ? { pid, name: '' } : null);
    const reading = !!state.detailsPending && state.detailsPending.has(pid);
    const list = tree && !reading ? factAdditions(person, state.record, tree, nameInput.value.trim()) : [];
    row.offered = list;
    row.additions = () => [];
    facts.replaceChildren(factsTable(person, state.record, tree, reading), ...(list.length ? [additionsBox(row, person, pid, list)] : []));
    showChanges();
  };
  row.showCheck = () => {
    const check = rowCheckText(state.fsCheck, row.pid());
    fsStatus.hidden = !check;
    if (check) { fsStatus.textContent = check.text; fsStatus.className = 'fs-status ' + check.kind; }
    // Highlighted as FS's Source Linker does: attached to every source here, or to some
    node.classList.toggle('linked', !!check && check.linked === 'all');
    node.classList.toggle('partly', !!check && check.linked === 'some');
  };

  const refresh = () => {
    otherPid.hidden = select.value !== 'other';
    node.classList.toggle('off', !row.pid() && select.value !== 'other');
    row.showCheck();
    row.showFacts();
    detail.hidden = !row.pid() && select.value !== 'other';
    suggest.replaceChildren(...surnameSuggestions({ ...person, name: nameInput.value }, state.people, state.record, row.tree()).map((s) =>
      el('button', { type: 'button', class: 'chip', title: t('Use {what}', { what: s.label }) }, [document.createTextNode(s.name), el('span', { class: 'muted', text: ' ' + s.label })])));
    for (const [i, b] of [...suggest.children].entries()) {
      b.addEventListener('click', () => {
        nameInput.value = surnameSuggestions({ ...person, name: nameInput.value }, state.people, state.record, row.tree())[i].name;
        rename(row, nameInput.value);
        refresh();
      });
    }
  };
  let chosen = select.value;
  select.addEventListener('change', () => {
    // A new tree person: the sidebar's form, the row as it was until one is made
    if (select.value === 'new') { select.value = chosen; openNewPerson(row); return; }
    chosen = select.value;
    touched = true; hint.textContent = ''; refresh(); pairedByHand(); showFsCheck(); readDetails();
  });
  // Paired with a person made (or found) on FamilySearch from the sidebar
  row.pairWith = (pid, why) => {
    touched = true;
    select.value = 'other';
    chosen = 'other';
    otherPid.value = pid;
    hint.textContent = why || '';
    refresh(); pairedByHand(); showFsCheck(); readDetails();
  };
  otherPid.addEventListener('input', () => { touched = true; refresh(); showFsCheck(); });
  otherPid.addEventListener('change', () => { pairedByHand(); readDetails(); });
  nameInput.addEventListener('change', () => { rename(row, nameInput.value.trim()); refresh(); showFsCheck(); });
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
    chosen = select.value;
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
  // The other church book's source: the same person there, as that book spells them
  const other = counterpart(row.person);
  if (other) {
    const g = (id) => $('g-' + id);
    const otherOld = row.otherName || stripVariants(other.name);
    g('title').value = renamePhrase(g('title').value, otherOld, newName);
    if (state.record.recordTypeInfo.type === 'birth_baptism' && roleKind(other) === 'child' && newName.split(/\s+/).length > otherOld.split(/\s+/).length) {
      g('title').value = dropChildOf(g('title').value);
    }
    g('citation').value = renamePhrase(g('citation').value, otherOld, newName);
    g('notes').value = renameNoteLine(g('notes').value, other.roleEnglish || other.role || 'Unknown', row.otherNoteName || other.name, newName);
    row.otherName = newName;
    row.otherNoteName = newName;
  }
  row.name = newName;
  row.noteName = newName;
}

const isCensus = () => !!(state.record && state.record.recordTypeInfo && state.record.recordTypeInfo.type === 'census');

// The suggested pairs: in a census across the residence's households, through the
// relatives' families read so far (state.trees); else from the record's family
function suggestions() {
  if (isCensus()) return suggestResidencePairs(state.record, state.people, state.fs, state.trees, state.trusted);
  const self = findSelf(state.people, state.fs, state.trusted);
  const chosen = Object.fromEntries((state.rows || []).filter((r) => r.touched()).map((r) => [r.person.key, r.pid()]));
  return suggestPairs(state.record, state.people, self, state.fs, state.trees, chosen);
}

// A row paired by hand in a church record: the others paired again from it, with that
// relative's FS family read when it may pair someone still unpaired (the bride's father
// once the bride is the FS wife). A census's residence keeps its own pairing.
function pairedByHand() {
  if (isCensus() || !state.rows || !state.fs) return;
  const next = suggestions();
  const pool = treePool(state.fs, state.trees);
  for (const row of state.rows) row.update(pool, next.pairs[row.person.key], next.why[row.person.key]);
  const need = next.need.filter((p) => PID_PATTERN.test(p) && !state.trees[p]);
  if (!need.length) return;
  const generation = state.generation;
  state.residenceRead = Promise.resolve(state.residenceRead).then(() => generation === state.generation && readResidence(need, generation));
}

// A census residence's households: a heading before each other household
function householdHeading(person) {
  const census = state.record.census || {};
  const no = person.householdNo ? t('Household no. {n}', { n: person.householdNo }) : t('Another household');
  const where = census.residence ? ' ' + t('at {place}', { place: census.residence }) : '';
  return el('li', { class: 'household muted', text: (person.household ? no + ', ' + t('also') + where : no + where) });
}

async function showPeople() {
  const list = $('people');
  state.trees = {};
  state.rows = [];  // a new record or FS person: no choices made yet
  let { pairs, why, need } = suggestions();
  if (await switchHousehold(pairs)) ({ pairs, why, need } = suggestions());
  const pool = treePool(state.fs, state.trees);
  // Without a stored FS person, a PID typed above still pairs the anchor
  const pid = $('fs-pid').value.trim().toUpperCase();
  if (!state.fs && pid) {
    const anchor = state.people.find((p) => p.current);
    if (anchor) { pairs[anchor.key] = pid; why[anchor.key] = t('the PID above'); }
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
  showFsCheck();
  const family = treeFamily(state.fs);
  $('fs-name').textContent = state.fs ? state.fs.name + (family.length > 1 ? ' ' + t(family.length === 2 ? 'and {n} relative' : 'and {n} relatives', { n: family.length - 1 }) : '')
    : pid ? t('family not known here (open the search from this person\'s FamilySearch page to have it)') : '';
  $('tree-status').hidden = true;
  state.generation = (state.generation || 0) + 1;
  state.residenceRead = need.length ? readResidence(need, state.generation) : null;  // the rows are there meanwhile
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
  const params = { n, people: others.length };
  button.textContent = state.showAll
    ? t(n > 1 ? 'Hide the {n} other households at the residence ({people} people), not related in the census or FamilySearch'
      : 'Hide the other household at the residence ({people} people), not related in the census or FamilySearch', params)
    : t(n > 1 ? 'Show the {n} other households at the residence ({people} people), not related in the census or FamilySearch'
      : 'Show the other household at the residence ({people} people), not related in the census or FamilySearch', params);
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
  const who = (p) => stripVariants(p.name) + (p.birthYear ? ', ' + p.birthYear : '') +
    (p.householdNo ? ', ' + t('household no. {n}', { n: p.householdNo }) : '');
  note.textContent = t(opened ? 'The record opened was {opened}. FamilySearch {fs} fits {self}, so the source is for that household.'
    : 'The record opened was another person\'s. FamilySearch {fs} fits {self}, so the source is for that household.',
  { opened: opened ? who(opened) : '', fs: stripVariants(state.fs.name), self: who(self) });
  return true;
}

// --- Relatives' families from FS (a census residence, a church book's in-laws) ----------
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
    const names = pids.map((p) => (treePool(state.fs, state.trees).find((tree) => tree.pid === p) || { name: p }).name);
    status.hidden = false;
    status.textContent = t(isCensus() ? 'Reading the FamilySearch families of {names} to pair the others at the residence…'
      : 'Reading the FamilySearch families of {names} to pair the others in the record…', { names: names.join(', ') }) + ' ' + windowNote();
    const read = await readTreePersons(pids);
    for (const p of pids) if (!read[p]) failed.push(p);
    if (generation !== state.generation) return;  // another FS person was chosen meanwhile
    Object.assign(state.trees, read);
    const next = suggestions();
    const pool = treePool(state.fs, state.trees);
    for (const row of state.rows) row.update(pool, next.pairs[row.person.key], next.why[row.person.key]);
    showHouseholds();
    showFsCheck();
    need = next.need.filter((p) => !state.trees[p]);
  }
  const shown = isCensus() ? state.rows.filter((r) => state.related.has(r.person.household)) : state.rows;
  const paired = shown.filter((r) => r.pid()).length;
  const counts = { paired, n: shown.length };
  status.textContent = t(!isCensus() ? '{paired} of {n} in the record paired'
    : state.related.size > 1 ? '{paired} of {n} in the related households paired' : '{paired} of {n} in the household paired', counts) +
    (failed.length ? '; ' + t('could not read {pids} from FamilySearch (are you signed in?)', { pids: failed.join(', ') }) : '') + '.';
  status.classList.toggle('near', failed.length > 0);
  if (!$('linker').hidden) readDetails();  // the newly paired relatives' facts
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
    tab = await hiddenTab();
    for (const pid of toRead) {
      let answer = await readInTab(tab.id, pid);
      // A hidden tab FS hasn't drawn: show it for a moment
      if (!answer.person) {
        await tab.show();
        answer = await readInTab(tab.id, pid);
        await tab.back();
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
    if (tab) tab.close();
  }
  return out;
}

// The paired tree persons' own pages, for the facts beside the record's: read in the
// background once the page is shown (one hidden window at a time, after a census's
// families), at most MAX_DETAIL_READS for a record; the rows are redrawn as they come
const MAX_DETAIL_READS = 12;
let detailsQueue = Promise.resolve();
function readDetails() {
  state.details = state.details || {};
  state.detailsPending = state.detailsPending || new Set();
  state.detailsAsked = state.detailsAsked || new Set();
  const pids = [...new Set(state.rows.map((r) => r.pid()))]
    .filter((pid) => PID_PATTERN.test(pid) && !fullTree(pid) && !state.detailsAsked.has(pid))
    .slice(0, Math.max(0, MAX_DETAIL_READS - state.detailsAsked.size));
  if (!pids.length) return detailsQueue;
  for (const pid of pids) { state.detailsAsked.add(pid); state.detailsPending.add(pid); }
  for (const row of state.rows) row.showFacts();
  detailsQueue = detailsQueue.then(() => state.residenceRead).then(async () => {
    const read = await readTreePersons(pids.filter((pid) => !fullTree(pid))).catch(() => ({}));
    Object.assign(state.details, read);
    for (const pid of pids) state.detailsPending.delete(pid);
    for (const row of state.rows) row.showFacts();
  });
  return detailsQueue;
}

async function sessionTree(pid) {
  try { return (await chrome.storage.session.get('tree:' + pid))['tree:' + pid] || null; } catch (e) { return null; }
}

// Open the person's details page in the tab and ask fs_person.js for the person
async function readInTab(tabId, pid) {
  try {
    await Promise.race([navigate(tabId, personDetailsUrl(pid), false), new Promise((resolve) => setTimeout(resolve, 30000))]);
  } catch (e) {
    return { error: e.message || String(e) };
  }
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
  return { error: t('FamilySearch did not answer.') };
}

// The source's fields (`prefix` f; g for the other church book's)
function fillSource(record, prefix = 'f') {
  $(prefix + '-title').value = record.title || '';
  $(prefix + '-date').value = record.date || '';
  $(prefix + '-url').value = record.url || '';
  $(prefix + '-citation').value = record.citation || '';
  $(prefix + '-notes').value = record.notes || '';
  if (prefix !== 'f') return;
  state.filled = sourceFields();
  const link = $('da-link');
  link.href = daPageUrl(record.url);
  link.hidden = !record.url;
}

// --- An entry in both of a parish's church books ---------------------------------------
// A search hit can come with `also`, the same event in the parish's other church book
// (pairParallel(), da_match.js): the priest's ministerialbok and the parish clerk's
// klokkerbok, transcribed apart, with their own IDs and spellings. Both become
// sources, attached to the same people, the ministerialbok's first and tagged; each
// names its book and in its notes the other's entry and where the two differ.

// The other book's record and both books (their DA source pages, readSourcePage());
// the ministerialbok's record is `main`, the other `parallel`. A book that can't be
// read is null.
async function loadParallel(loaded, also) {
  if (!onDigitalArkivet(also)) throw new Error('Not a Digitalarkivet address: ' + also);
  const other = await loadFromDA(also);
  const book = async (record) => {
    try { return record.sourceUrl ? await fetchSource(record.sourceUrl) : null; } catch (e) {
      console.warn('arkivet2fs: could not read the source page ' + record.sourceUrl, e);
      return null;
    }
  };
  const first = { ...loaded, book: await book(loaded.record) };
  const second = { ...other, book: await book(other.record) };
  const ministerial = (x) => !!(x.book && x.book.series === 'ministerial');
  return ministerial(second) && !ministerial(first) ? { main: second, parallel: first } : { main: first, parallel: second };
}

// A book's name for the source: "Ministerialbok A-13"; without its page, the source title
const bookName = (book, record) => (book && book.book) || record.sourceTitle || '';
// Where it is: "Kristiansand domprosti, AV/SAK-1112-0006/F/Fa/L0013"
const bookPlace = (book) => (book ? [book.archive.replace(/^[^:]*:\s*/, ''), book.reference].filter(Boolean).join(', ') : '');

// The title and citation with the book named: after the source title in both
// ("… (1001P), Ministerialbok A-13 - Birth"; "…(1001P)," Ministerialbok A-13, …"),
// so that the two sources are told apart (FS's SourceBox by title, too)
function withBook(record, book) {
  const name = bookName(book, record);
  if (!name || !book) return record;
  const parts = record.title.split(' - ');
  if (parts.length >= 3) parts[parts.length - 2] += ', ' + name;
  else parts.push(name);
  const place = book.reference ? ', ' + book.reference : '';
  const citation = record.citation.includes('," ') ? record.citation.replace('," ', '," ' + name + place + ', ')
    : name + place + '; ' + record.citation;
  return { ...record, title: parts.join(' - '), citation };
}

// The notes' entries: "Label: value" lines before "--- Persons ---" (the person's own
// fields, the record's details; not the permanent ID), and the persons after it
function noteEntries(notes) {
  const fields = [], persons = [];
  let inPersons = false;
  for (const line of String(notes || '').split('\n')) {
    if (line.trim() === '--- Persons ---') { inPersons = true; continue; }
    if (inPersons && !line.trim()) break;
    const m = line.match(/^([^:]+): (.*)$/);
    if (!m || /^permanent id$/i.test(m[1])) continue;
    (inPersons ? persons : fields).push({ label: m[1], value: m[2].replace(/ \*(?= \(|$)/, '').trim() });
  }
  return { fields, persons };
}

// Two lists' items paired: by role (`role`), then the first given name (`name`), else
// in order; [a, b] with null for one the other list lacks
function matchByRole(as, bs, role, name) {
  const left = [...bs];
  const pairs = as.map((a) => {
    const same = left.filter((b) => role(b) === role(a));
    const b = same.find((x) => sameGiven(firstGiven(name(x)), firstGiven(name(a)))) || same[0] || null;
    if (b) left.splice(left.indexOf(b), 1);
    return [a, b];
  });
  return pairs.concat(left.map((b) => [null, b]));
}

// The two entries side by side, from what their sources say: the date, each field of
// the notes, each person → [{ label, a, b, same }]
function compareRecords(a, b) {
  const rows = [];
  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const add = (label, x, y) => { if (x || y) rows.push({ label, a: x || '', b: y || '', same: norm(x) === norm(y) }); };
  add('Date', a.date, b.date);
  const ea = noteEntries(a.notes), eb = noteEntries(b.notes);
  const value = (list, label) => list.filter((f) => f.label === label).map((f) => f.value).join('; ');
  for (const label of new Set([...ea.fields, ...eb.fields].map((f) => f.label))) add(label, value(ea.fields, label), value(eb.fields, label));
  for (const [p, q] of matchByRole(ea.persons, eb.persons, (x) => x.label, (x) => x.value)) {
    add((p || q).label, p ? p.value : '', q ? q.value : '');
  }
  return rows;
}

// The notes' section on the other book's entry (English, as the source is), with
// where it differs: "Mother: Astri Larsdtr. (here: Astri Larsdatter)"
function parallelNote(other, book, rows, theirs) {
  const ours = theirs === 'a' ? 'b' : 'a';
  const place = bookPlace(book);
  const lines = ['--- Also recorded in ---',
    bookName(book, other) + (place ? ' (' + place + ')' : '') + (other.permanentId ? ', Permanent ID ' + other.permanentId : '') + ', ' + other.url];
  const differs = rows.filter((r) => !r.same);
  if (!differs.length) lines.push('The two entries agree.');
  else {
    lines.push('Differences there:');
    for (const r of differs) {
      lines.push(r.label + ': ' + (r[theirs] || 'not there') + ' (' + (r[ours] ? 'here: ' + r[ours] : 'not here') + ')');
    }
  }
  return lines.join('\n');
}

// The other book's person for a person of the main record (renames carry over)
function counterpart(person) {
  if (!state.parallel) return null;
  const pair = matchByRole(state.record.people, state.parallel.record.people, (p) => p.roleEnglish || p.role, (p) => p.name)
    .find(([p]) => p && p.id === person.id);
  return pair ? pair[1] : null;
}

// The comparison table: what each book says, differences marked
function showComparison(rows, mainName, otherName) {
  const cell = (tag, text) => el(tag, { text });
  $('compare').replaceChildren(
    el('thead', {}, [el('tr', {}, [cell('th', ''), cell('th', mainName), cell('th', otherName)])]),
    el('tbody', {}, rows.map((r) => el('tr', { class: r.same ? '' : 'differs' },
      [cell('th', r.label === 'Date' ? t('Date') : r.label), cell('td', r.a || '—'), cell('td', r.b || '—')])))
  );
}

// --- Running on FS --------------------------------------------------------------------

function log(text, kind = '') {
  const li = el('li', { class: kind, text });
  $('log').append(li);
  li.scrollIntoView({ block: 'nearest' });
  return li;
}

function waitForLoad(tabId) {
  let listener;
  const loaded = new Promise((resolve) => {
    listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  loaded.cancel = () => chrome.tabs.onUpdated.removeListener(listener);
  return loaded;
}

// Until the tab has stopped loading. Firefox reports a new tab's or window's first page,
// about:blank, as complete, at times only after the page asked for has started loading:
// a load is done only when the tab isn't loading still
async function settled(tabId) {
  for (let i = 0; i < 5; i++) {
    const next = waitForLoad(tabId);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || tab.status !== 'loading') {
      next.cancel();
      return;
    }
    await next;
  }
}

async function openTab(url) {
  const here = await chrome.tabs.getCurrent();
  const tab = await chrome.tabs.create({ url, active: true, index: here ? here.index + 1 : undefined });
  await waitForLoad(tab.id);
  await settled(tab.id);
  return tab.id;
}

// The FS tab run() worked in, closed, and the linker's own tab brought forward
async function closeWorkTab(tabId) {
  await chrome.tabs.remove(tabId).catch(() => {});  // the user may have closed it
  await backToLinker();
}

// The linker's own tab and window brought forward
async function backToLinker() {
  const here = await chrome.tabs.getCurrent();
  if (!here) return;
  await chrome.tabs.update(here.id, { active: true }).catch(() => {});
  await chrome.windows.update(here.windowId, { focused: true }).catch(() => {});
}

// A tab to a page, and its load. Chrome sometimes refuses to start the navigation
// ("Navigation rejected.", nothing more said, while FS's page is busy), so it's tried
// again a moment later. `active` brings the tab forward in its window (run()'s tab: a
// tab in the background has its timers throttled); a hidden tab is alone in its window.
async function navigate(tabId, url, active = true) {
  for (let attempt = 1; ; attempt++) {
    const loaded = waitForLoad(tabId);
    try {
      await chrome.tabs.update(tabId, active ? { url, active: true } : { url });
    } catch (e) {
      loaded.cancel();
      if (attempt >= NAVIGATE_TRIES) throw e;
      console.info('arkivet2fs: navigating to ' + url + ' failed (' + (e.message || e) + '); trying again');
      await sleep(attempt * 1000);
      continue;
    }
    await loaded;
    await settled(tabId);
    return;
  }
}

const NAVIGATE_TRIES = 3;

// One step in the FS tab (fs_attach.js), answered within two minutes; only while the
// tab is still on FamilySearch (the user may have taken it elsewhere)
async function step(tabId, name, args) {
  const tab = await chrome.tabs.get(tabId);
  if (!onFamilySearch(tab.url)) {
    // (no url: a site the extension has no access to, as FS's sign-in page)
    console.info('arkivet2fs: the FamilySearch tab is not on FamilySearch for ' + name + ' (' + (tab.url || 'no address') + ', ' + tab.status + ')');
    return { ok: false, error: tab.url ? t('The FamilySearch tab is no longer on FamilySearch.')
      : t('The FamilySearch tab is on a page the extension cannot read, perhaps the sign-in page. Please sign in to FamilySearch and try again.') };
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['fs_attach.js'] });
  const answer = await Promise.race([
    chrome.tabs.sendMessage(tabId, { linker: name, args }),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: t('FamilySearch did not answer in time.') }), 120000))
  ]);
  if (!answer) return { ok: false, error: t('FamilySearch did not answer.') };
  return answer.ok ? answer : { ...answer, error: fsMessage(answer.error) };
}

// Whether an address is on FamilySearch (https, www.familysearch.org: the manifest's
// host). Without the extension's access to a tab's site, its url is empty: not
// FamilySearch (its sign-in page, ident.familysearch.org, is such a site).
function onFamilySearch(address) {
  try {
    const url = new URL(address || '');
    return url.protocol === 'https:' && url.hostname === 'www.familysearch.org';
  } catch (e) {
    return false;
  }
}

// The plan from the page: the source, and each paired person (PIDs checked)
// (with the other church book's entry, `parallel`, its source: no tags, a distinct title)
function readPlan(attach) {
  const sourceOf = (prefix, i) => withFsChoices(reviewedSource(prefix), i);
  const source = sourceOf('f', 0);
  if (!source.title) throw new Error(t('The source needs a title.'));
  const parallel = state.parallel ? sourceOf('g', 1) : null;
  if (parallel && !parallel.title) throw new Error(t('The source of the other church book needs a title.'));
  if (parallel && parallel.title === source.title) throw new Error(t('The two sources need different titles: FamilySearch would take them for one.'));
  const pairs = [];
  if (attach) {
    for (const row of state.rows) {
      const pid = row.pid();
      if (!pid) continue;
      if (!PID_PATTERN.test(pid)) throw new Error(t('"{pid}" (for {name}) is not a FamilySearch ID like XXXX-XXX.', { pid, name: row.label() }));
      if (pairs.some((p) => p.pid === pid)) throw new Error(t('{pid} is chosen for two people in the record.', { pid }));
      const tags = row.tags();
      const additions = row.additions ? row.additions() : [];
      for (const a of additions) {
        const v = a.value;
        const empty = a.action === 'name' ? !(v.given || v.surname) : !(v.date || v.place || v.description);
        if (empty) throw new Error(t('"{what}" for {name} is empty: fill it in or untick it.', { what: additionLabel(a), name: row.label() }));
      }
      // A fact added is tagged once saved (saveAdditions()), not when attaching: the
      // person hasn't it yet, or has another (a residence of another year)
      const later = additions.filter((a) => a.action === 'add').map((a) => a.fact);
      const now = tags.filter((tag) => !later.includes(tag));
      pairs.push({ pid, label: row.label(), reason: row.reason(), tags: now.filter((tag) => tag !== 'Residence'), residence: now.includes('Residence'), additions });
    }
    if (!pairs.length) throw new Error(t('Choose a tree person for someone in the record, or use "Create source only".'));
  }
  return parallel ? { source, parallel, pairs } : { source, pairs };
}

// Both books' sources: each named by its book, with the other's entry in the notes,
// side by side above the other's fields
function fillParallel(main, parallel) {
  const rows = compareRecords(main.record, parallel.record);
  const mainName = bookName(main.book, main.record), otherName = bookName(parallel.book, parallel.record);
  const named = (x) => withBook(x.record, x.book);
  const a = named(main), b = named(parallel);
  fillSource({ ...a, notes: a.notes + '\n\n' + parallelNote(parallel.record, parallel.book, rows, 'b') });
  fillSource({ ...b, notes: b.notes + '\n\n' + parallelNote(main.record, main.book, rows, 'a') }, 'g');
  $('source-heading').textContent = t('Source: {book}', { book: mainName });
  $('parallel-heading').textContent = t('Also in {book}', { book: otherName });
  showComparison(rows, mainName, otherName);
  state.books = [mainName, otherName];
  $('parallel').hidden = false;
}

const logTags = (pair, result) => log(t('Tags for {name}: {tags}', { name: pair.label,
  tags: result.changed.length ? result.changed.map(fsMessage).join(' ') : t('as they were') }) +
  (result.notes.length ? '. ' + t('Not tagged: {tags}', { tags: result.notes.map(fsMessage).join(', ') }) : '') + '.', result.notes.length ? 'near' : 'ok');

// fs_attach.js's messages (it runs in the FS page, without i18n.js) in the user's
// language: its fixed texts, the ones with a name or number in them, and the tags
function fsMessage(text) {
  if (!text || uiLanguage() === 'en') return text;
  const tagLabel = (id) => t((TAGS.find(([tag]) => tag === id) || [id, id])[1]);
  let m;
  if ((m = text.match(/^\+(\w+)$/))) return '+' + tagLabel(m[1]);
  if ((m = text.match(/^(\w+) \(the person has none\)$/))) return t('{tag} (the person has none)', { tag: tagLabel(m[1]) });
  if ((m = text.match(/^Residence \(the person has (\d+); tag the right one by hand\)$/))) {
    return t('Residence (the person has {n}; tag the right one by hand)', { n: m[1] });
  }
  if ((m = text.match(/^FamilySearch showed another person \((.*)\) for (.*)\.$/))) {
    return t('FamilySearch showed another person ({shown}) for {pid}.', { shown: m[1], pid: m[2] });
  }
  if ((m = text.match(/^FamilySearch did not show the person (\S+) \(is the ID right, and is the source not already attached\?\) in time\.$/))) {
    return t('FamilySearch did not show the person {pid} (is the ID right, and is the source not already attached?) in time.', { pid: m[1] });
  }
  if ((m = text.match(/^FamilySearch did not open the tree person (\S*)\. Please sign in to FamilySearch and try again\.$/))) {
    return t('FamilySearch did not open the tree person {pid}. Please sign in to FamilySearch and try again.', { pid: m[1] });
  }
  // The fact steps' messages, with the fact's English name
  const fact = (name) => t(name === 'custom event' ? 'Custom event' : name.charAt(0).toUpperCase() + name.slice(1)).toLowerCase();
  if ((m = text.match(/^FamilySearch already has a (.+) for this person; change it instead\.$/))) {
    return t('FamilySearch already has a {fact} for this person; change it instead.', { fact: fact(m[1]) });
  }
  if ((m = text.match(/^FamilySearch shows no button to (add|change) the (.+)\.$/))) {
    return t(m[1] === 'add' ? 'FamilySearch shows no button to add the {fact}.' : 'FamilySearch shows no button to change the {fact}.', { fact: fact(m[2]) });
  }
  if ((m = text.match(/^FamilySearch has more than one (.+) and none is clearly this one; tag the source to it by hand\.$/))) {
    return t('FamilySearch has more than one {fact} and none is clearly this one; tag the source to it by hand.', { fact: fact(m[1]) });
  }
  if ((m = text.match(/^FamilySearch shows no way to open the (.+)\.$/))) return t('FamilySearch shows no way to open the {fact}.', { fact: fact(m[1]) });
  if ((m = text.match(/^FamilySearch did not save the ([a-z ]+)(?:\.|: (.*))$/s))) {
    return m[2] === undefined ? t('FamilySearch did not save the {fact}.', { fact: fact(m[1]) })
      : t('FamilySearch did not save the {fact}: {detail}', { fact: fact(m[1]), detail: m[2] });
  }
  if ((m = text.match(/^FamilySearch did not take the ([a-z ]+)(?:\.|: (.*))$/s))) {
    return m[2] === undefined ? t('FamilySearch did not take the {fact}.', { fact: fact(m[1]) })
      : t('FamilySearch did not take the {fact}: {detail}', { fact: fact(m[1]), detail: m[2] });
  }
  if ((m = text.match(/^FamilySearch's security service blocked the page(?: \((.*)\))?\. Open FamilySearch in this browser to see why; its page says what to do\.$/))) {
    if (m[1] === undefined) return t("FamilySearch's security service blocked the page. Open FamilySearch in this browser to see why; its page says what to do.");
    const detail = m[1].replace(/^error /, t('error') + ' ').replace(/incident ID /, t('incident ID') + ' ');
    return t("FamilySearch's security service blocked the page ({detail}). Open FamilySearch in this browser to see why; its page says what to do.", { detail });
  }
  if ((m = text.match(/^FamilySearch did not show (.*) in time\.$/))) return t('FamilySearch did not show {what} in time.', { what: t(m[1]) });
  return tMessage(text);
}

// --- What FS already has ------------------------------------------------------------
// As FS's own Source Linker flags a record already attached: the SourceBox is searched
// for the source's title (and the other church book's), in all folders, and each one
// found is read on its Attached To page (fs_attach.js findSource, attachedTo). In
// state.fsCheck: {sources: [{title, book, id, ids, persons: [{pid, name}]}]} (`id` null:
// not in the SourceBox; `ids`: all of that title), {checking: true}, or {error}. The
// source's note says so, each row whether its tree person has the source already, and
// "Create source and attach" uses the source and attaches only those who lack it.

const attachedToUrl = (id) => 'https://www.familysearch.org/en/tree/sources/attachedTo/' + encodeURIComponent(id);

// The paired PIDs (valid ones, once each)
function pairedPids(rows) {
  return [...new Set((rows || []).map((r) => (r.pid() || '').toUpperCase()).filter((p) => PID_PATTERN.test(p)))];
}

// Who a source found in the SourceBox is attached to, against the people paired here
function attachedText(source, paired) {
  const on = new Set(source.persons.map((p) => p.pid.toUpperCase()));
  const n = paired.filter((pid) => on.has(pid)).length, m = paired.length;
  const names = (persons) => persons.map((p) => (p.name ? p.name + ' ' : '') + '(' + p.pid + ')').join(', ');
  const parts = [];
  if (!source.persons.length) parts.push(t('It is not attached to anyone yet.'));
  else if (!m) parts.push(t('It is attached to {names}.', { names: names(source.persons) }));
  else {
    if (n === m) parts.push(t(m === 1 ? 'It is already attached to the person paired here.' : 'It is already attached to all {m} people paired here.', { m }));
    else if (!n) parts.push(t(m === 1 ? 'It is not attached to the person paired here yet.' : 'It is not attached to the {m} people paired here yet.', { m }));
    else parts.push(t('It is attached to {n} of the {m} people paired here; the others will be attached.', { n, m }));
    const others = source.persons.filter((p) => !paired.includes(p.pid.toUpperCase()));
    if (others.length) parts.push(t('Also attached to {names}, not paired here.', { names: names(others) }));
  }
  if (source.ids.length > 1) parts.push(t('The SourceBox has {n} sources with this title; the first is used.', { n: source.ids.length }));
  return parts.join(' ');
}

// A row's tree person and the sources found: {text, kind, linked} or null (nothing to say);
// linked is 'all' (attached to every source here), 'some' (to one of two, or one of two
// not in the SourceBox yet) or 'none'
function rowCheckText(check, pid) {
  pid = (pid || '').toUpperCase();
  if (!check || !check.sources || !PID_PATTERN.test(pid)) return null;
  const found = check.sources.filter((s) => s.id);
  if (!found.length) return null;
  const on = found.map((s) => s.persons.some((p) => p.pid.toUpperCase() === pid));
  if (check.sources.length === 1) {
    return on[0] ? { text: t('Already has this source on FamilySearch'), kind: 'ok', linked: 'all' }
      : { text: t('Not attached to this source yet'), kind: 'muted', linked: 'none' };
  }
  if (found.length === check.sources.length && on.every(Boolean)) return { text: t('Already has both sources on FamilySearch'), kind: 'ok', linked: 'all' };
  return { text: found.map((s, i) => t(on[i] ? '{book}: already attached' : '{book}: not attached yet', { book: s.book })).join('; '),
    kind: on.some(Boolean) ? 'ok' : 'muted', linked: on.some(Boolean) ? 'some' : 'none' };
}

// A translated text with a link in place of one of its values
function withLink(text, params, key, href) {
  const [before, after] = t(text, { ...params, [key]: '\u0000' }).split('\u0000');
  return [document.createTextNode(before), el('a', { href, target: '_blank', rel: 'noopener', text: params[key] }), document.createTextNode(after || '')];
}

// What the check found, on each source's box and on the rows: a box whose source is in
// the SourceBox is tinted (as the rows of people who have it), with a link to the
// source's Attached To page whose tooltip tells who has it; a note only while checking
// again, when the check failed, or when the title has changed since
function showFsCheck() {
  const check = state.fsCheck;
  const paired = pairedPids(state.rows);
  const known = [];  // per source: whether it's in the SourceBox
  [['source', 'fs-check', 'fs-link', 'f-title'], ['parallel', 'fs-check-g', 'fs-link-g', 'g-title']].forEach(([boxId, noteId, linkId, titleId], i) => {
    const box = $(boxId), note = $(noteId), link = $(linkId);
    const source = check && check.sources && check.sources[i];
    const changed = !!source && $(titleId).value.trim() !== source.title;
    const found = !!source && !!source.id && !changed;
    if (i === 0 || state.parallel) known.push(found);
    box.classList.toggle('in-sourcebox', found);
    link.hidden = !found;
    if (found) {
      link.href = fsPageUrl(attachedToUrl(source.id));
      link.title = t('Already in your SourceBox ({id}).', { id: source.id }) + ' ' + attachedText(source, paired);
    }
    let text = null, kind = 'muted';
    if (check && check.checking && !$('linker').hidden) text = t('Checking your SourceBox on FamilySearch…') + ' ' + windowNote();
    else if (check && check.error && i === 0) { text = t('Not checked on FamilySearch: {error}', { error: check.error }); kind = 'bad'; }
    else if (changed) { text = t('The title has changed since the SourceBox was checked.'); kind = 'near'; }
    note.hidden = !text;
    if (!text) return;
    note.className = 'fs-check small ' + kind;
    const again = el('button', { type: 'button', class: 'link small', text: t('Check the SourceBox again') });
    again.addEventListener('click', () => checkOnFamilySearch());
    note.replaceChildren(document.createTextNode(text), ...(check.checking ? [] : [again]));
  });
  const [withAttach, only] = actionLabels(known);
  $('attach').textContent = $('intro-action').textContent = t(withAttach);
  $('create-only').textContent = t(only);
  for (const row of state.rows || []) row.showCheck();
  showSourceDiffs();
}

// --- The SourceBox's copy of the source, field by field ----------------------------
const SOURCE_FIELDS = [['title', 'Title'], ['date', 'Date'], ['url', 'Web page'], ['citation', 'Citation'], ['notes', 'Notes']];

// The source's fields as reviewed here ('f' the main one, 'g' the other church book's)
function reviewedSource(prefix) {
  const v = (id) => $(prefix + '-' + id).value.trim();
  return { title: v('title'), date: v('date'), url: v('url'), citation: v('citation'), notes: v('notes') };
}

const sameText = (a, b) => String(a || '').replace(/\r\n/g, '\n').trim() === String(b || '').replace(/\r\n/g, '\n').trim();

// The SourceBox's copy of source i, when the check read it and the title is still the one checked
function fsSource(i) {
  const check = state.fsCheck;
  const source = check && check.sources && check.sources[i];
  if (!source || !source.id || !source.fields) return null;
  return $(i ? 'g-title' : 'f-title').value.trim() === source.title ? source : null;
}

// A citation without the day it was accessed (" : accessed 2 November 2026)"), which
// changes each run: two differing only in it are the same (fs_attach.js does the same)
const withoutAccess = (text) => String(text || '').replace(/ : accessed [^)]*\)/g, ' : accessed)');

// The fields that differ, both filled (an empty one here keeps FS's; one empty on FS is
// filled from here): [{key, label, fs, ours}]
function sourceDiffs(fs, ours) {
  const same = (key) => (key === 'citation' ? sameText(withoutAccess(fs[key]), withoutAccess(ours[key])) : sameText(fs[key], ours[key]));
  return SOURCE_FIELDS.filter(([key]) => (ours[key] || '').trim() && (fs[key] || '').trim() && !same(key))
    .map(([key, label]) => ({ key, label, fs: fs[key].replace(/\r\n/g, '\n').trim(), ours: ours[key] }));
}

// FS's notes with the record's lines they lack added below
function mergeNotes(fs, ours) {
  const have = new Set(fs.split('\n').map((l) => l.trim()).filter(Boolean));
  const added = ours.split('\n').filter((l) => l.trim() && !have.has(l.trim()));
  return added.length ? fs.trim() + '\n\n' + added.join('\n') : fs.trim();
}

// FS's notes are an older copy of the extension's: they start with the same line
// ("Permanent ID: pd…"), so the record's are written over them
function olderCopy(fs, ours) {
  const first = (text) => (String(text).split('\n').find((l) => l.trim()) || '').trim();
  return /^Permanent ID: /.test(first(ours)) && first(fs) === first(ours);
}

// The choice for a differing field: 'record', 'fs', or for the notes 'merge'
function fieldChoice(i, d) {
  const kept = (state.fieldChoices || {})[i + ':' + d.key];
  if (kept) return kept;
  return d.key === 'notes' && !olderCopy(d.fs, d.ours) ? 'merge' : 'record';
}

// The source as it will be written: the choices applied to the fields here
function withFsChoices(source, i) {
  const fs = fsSource(i);
  if (!fs) return source;
  const out = { ...source };
  for (const d of sourceDiffs(fs.fields, source)) {
    const choice = fieldChoice(i, d);
    if (choice === 'fs') out[d.key] = d.fs;
    else if (choice === 'merge') out[d.key] = mergeNotes(d.fs, d.ours);
  }
  return out;
}

// Under each source found in the SourceBox: its differing fields, FS's beside a choice
function showSourceDiffs() {
  [['fs-fields', 'f'], ['fs-fields-g', 'g']].forEach(([id, prefix], i) => {
    const box = $(id);
    if (!box) return;
    const fs = fsSource(i);
    const other = state.fsCheck && state.fsCheck.sources && state.fsCheck.sources[i];
    if (other && other.otherRecord && $(prefix + '-title').value.trim() === other.title) {
      box.hidden = false;
      box.replaceChildren(el('p', { class: 'small bad', text: t('The source of this title in your SourceBox is of another record; give this source another title (add a name or the date).') }));
      return;
    }
    const diffs = fs ? sourceDiffs(fs.fields, reviewedSource(prefix)) : [];
    box.hidden = !diffs.length;
    if (!diffs.length) { box.replaceChildren(); return; }
    const choices = state.fieldChoices || (state.fieldChoices = {});
    box.replaceChildren(
      el('div', { class: 'label muted', text: t('Your SourceBox has this source with other fields. For each: keep FamilySearch\'s, or use the record\'s as above?') }),
      ...diffs.map((d) => {
        const select = el('select', { 'aria-label': t(d.label) }, [
          el('option', { value: 'record', text: t('Use the record\'s (as above)') }),
          ...(d.key === 'notes' ? [el('option', { value: 'merge', text: t('Keep FamilySearch\'s, with the record\'s new lines added') })] : []),
          el('option', { value: 'fs', text: t('Keep FamilySearch\'s') })]);
        select.value = fieldChoice(i, d);
        select.addEventListener('change', () => { choices[i + ':' + d.key] = select.value; });
        return el('div', { class: 'fs-field' }, [
          el('div', { class: 'fs-field-head' }, [el('strong', { text: t(d.label) }), select]),
          el('pre', { class: 'fs-field-value', text: d.fs })]);
      }));
  });
}

// The buttons' words: a source already in the SourceBox is updated, not created
function actionLabels(known) {
  if (known.length && known.every(Boolean)) return ['Update source and attach', 'Update source only'];
  if (known.some(Boolean)) return ['Create or update sources and attach', 'Create or update sources only'];
  return ['Create source and attach', 'Create source only'];
}

// A tab out of the user's way, for reading FS (a new tab in the tab strip distracts):
// alone in an unfocused popup window with the linker window's own position and size.
// The window manager stacks a window that doesn't take the focus just below the
// focused one (GNOME's does), so the linker covers it. Not minimized, and not moved off
// the screen: Chrome doesn't draw a minimized window, or a tab in the background, so
// FS's SourceBox list never loads there, and GNOME pulls a window back on screen. A
// covered window is still drawn on Linux; where Chrome stops drawing it (Windows and
// macOS track covered windows), show() raises it for the step tried again, back()
// raises the linker again; close() removes it.
// Said while FS is read in that window: it comes up in front of the linker's in Firefox,
// and in Chrome on desktops that don't stack it below
function windowNote() {
  return t('A FamilySearch window may come up meanwhile; leave it, it closes by itself.');
}

async function hiddenTab() {
  const here = await chrome.tabs.getCurrent();
  const options = { url: 'about:blank', type: 'popup', focused: false };
  let win;
  try {
    const own = here && await chrome.windows.get(here.windowId);
    win = await chrome.windows.create(own && own.state === 'normal'
      ? { ...options, left: own.left, top: own.top, width: own.width, height: own.height } : options);
  } catch (e) {
    win = await chrome.windows.create(options);  // bounds refused: where Chrome puts it
  }
  // Firefox ignores `focused: false` and focuses the new window: the linker's back on top
  if (here && win.focused) await chrome.windows.update(here.windowId, { focused: true }).catch(() => {});
  const tab = (win.tabs && win.tabs[0]) || (await chrome.tabs.query({ windowId: win.id }))[0];
  await settled(tab.id);  // its about:blank loaded, so its 'complete' isn't taken for FS's
  return {
    id: tab.id,
    show: () => { console.info('arkivet2fs: FamilySearch is read in a window on top for a moment'); return chrome.windows.update(win.id, { focused: true }).catch(() => {}); },
    back: async () => { if (here) await chrome.windows.update(here.windowId, { focused: true }).catch(() => {}); },
    close: () => chrome.windows.remove(win.id).catch(() => {})
  };
}

// The DA permanent IDs of the people of the record a source is of (`i` 0: the record,
// 1: the other church book's): a source made from another person's entry of it, such
// as the bride's of a marriage, is of the same record
function sameRecordIds(i) {
  const ids = new Set();
  const add = (id) => { if (DA_ID.test(id || '')) ids.add(id); };
  if (i) {
    for (const p of (state.parallel && state.parallel.record && state.parallel.record.people) || []) add(p.id);
  } else {
    add(state.record && state.record.primaryPersonId);
    for (const p of (state.record && state.record.people) || []) add(p.id);
  }
  return [...ids];
}

// A source already in the SourceBox, written over with the fields as reviewed here;
// fs_attach.js leaves it as it is when it names another record (a title shared by two)
async function updateSource(tabId, sourceId, source, title, sameRecord = []) {
  const edited = await step(tabId, 'editSource', { sourceId, source, title, sameRecord, reason: t('Updated from the record on Digitalarkivet.') });
  if (edited.otherRecord) {
    throw new Error(t('The source {id} in your SourceBox has this title but is of another record{other}; nothing was changed. Give this source another title (add a name or the date) and try again.',
      { id: sourceId, other: edited.other ? ' (' + edited.other + ')' : '' }));
  }
  if (!edited.ok) throw new Error(t('The source could not be updated: {error}', { error: edited.error }));
  log(edited.changed.length ? t('Source updated: {fields}.', { fields: edited.changed.map((f) => t(f)).join(', ') })
    : t('The source on FamilySearch already has these fields.'), 'ok');
}

// The sources of these titles in the SourceBox, and who each is attached to (in the
// tab, which goes to each page in turn)
async function lookUpSources(tabId, titles, active = false, sources = []) {
  const out = [];
  for (const [i, title] of titles.entries()) {
    await navigate(tabId, SOURCEBOX_URL, active);
    const found = { ...(await lookUpSource(tabId, title, active)), book: state.books[i] || '' };
    if (found.id && sources[i]) Object.assign(found, await readSourceFields(tabId, found.id, sources[i], active, found.formerTitle, sameRecordIds(i)));
    out.push(found);
  }
  return out;
}

// FS's fields of a source found by its title (the Edit Source dialog, cancelled):
// `fields`, or `otherRecord` when it names another record
async function readSourceFields(tabId, sourceId, source, active = false, title, sameRecord = []) {
  await navigate(tabId, SOURCEBOX_URL, active);
  const read = await step(tabId, 'editSource', { sourceId, source, title, sameRecord, read: true });
  if (read.otherRecord) return { otherRecord: read.other || true };
  if (!read.ok) return { fieldsError: read.error };
  return { fields: read.fields };
}

// A step's failure as an error, `blocked` when FS's security service blocked the page
function stepError(answer) {
  const error = new Error(answer.error);
  if (answer.blocked) error.blocked = true;
  return error;
}

// The titles this extension gave a source before 1.6.0, which a source made then may
// still have: the record's year in front, "1846, Lars, son of Halvor Larsen - Vågå
// parish ... - Birth", a census also ending "- Census" ("1865, Halvor Larsen household,
// Bakken nedre, Nordlien - Vågå - Census"). [] for a title with a year in front.
function formerTitles(title, year) {
  if (!title || /^\d{4}, /.test(title)) return [];
  const census = title.match(/^(.+) - "Norway, Census, (\d{4})"$/);
  if (census) return [census[2] + ', ' + title, census[2] + ', ' + census[1] + ' - Census'];
  return year ? [year + ', ' + title] : [];
}

// The record's year, for formerTitles()
function recordYear() {
  const record = state.record || {};
  return (String(record.recordDate || record.date || '').match(/\d{4}/) || [''])[0];
}

// The source of this title in the SourceBox, or one made before 1.6.0 under its former
// title (`formerTitle`: an update gives it this one), and who it is attached to
async function lookUpSource(tabId, title, active = true) {
  const former = formerTitles(title, recordYear());
  let found = await step(tabId, 'findSource', { title, older: former });
  if (!found.ok) throw stepError(found);
  // A former title the search for this one doesn't show (a census's): searched for itself
  for (const older of former.filter((f) => !f.includes(title))) {
    if (found.sources.length) break;
    await navigate(tabId, SOURCEBOX_URL, active);
    found = await step(tabId, 'findSource', { title: older });
    if (!found.ok) throw stepError(found);
    found.title = older;
  }
  const ids = found.sources.map((s) => s.id);
  if (!ids.length) return { title, id: null, ids, persons: [] };
  const old = found.title && found.title !== title ? { formerTitle: found.title } : {};
  await navigate(tabId, attachedToUrl(ids[0]), active);
  const read = await step(tabId, 'attachedTo', { sourceId: ids[0] });
  if (!read.ok) throw stepError(read);
  return { title, id: ids[0], ids, persons: read.persons, ...old };
}

// The source in the SourceBox for run(), and who has it: searched for, and once more
// on the SourceBox loaded again when FS was slow. Still not searched: the SourceBox
// check made before (`state.fsCheck`, when the page opened, or the last run's), when it
// answered for this title; else null, and run() stops: a source created then could be
// a second copy of one the SourceBox has.
async function sourceForRun(tabId, title, i) {
  for (let tries = 1; ; tries++) {
    try {
      return await lookUpSource(tabId, title);
    } catch (e) {
      log(t('The SourceBox could not be searched for the title: {error}', { error: e.message || String(e) }), 'near');
      if (e.blocked || tries >= 2) break;
      await navigate(tabId, SOURCEBOX_URL);
    }
  }
  const before = ((state.fsCheck && state.fsCheck.sources) || [])[i];
  if (!before || before.title !== title || before.error) return null;
  log(before.id ? t('Going by the SourceBox check made before, which found this source ({id}).', { id: before.id })
    : t('Going by the SourceBox check made before, which found no source with this title.'), 'near');
  return { title, id: before.id || null, ids: before.ids || [], persons: before.persons || [],
    ...(before.formerTitle ? { formerTitle: before.formerTitle } : {}) };
}

// The check before anything is saved: in a hidden tab (shown for a moment if FS didn't
// draw it there), closed after
async function checkOnFamilySearch() {
  if (state.running) return;
  const titles = [$('f-title').value.trim()];
  if (state.parallel) titles.push($('g-title').value.trim());
  if (!titles.every(Boolean)) return;
  const sources = ['f', ...(state.parallel ? ['g'] : [])].map(reviewedSource);
  const generation = state.checkGeneration = (state.checkGeneration || 0) + 1;
  state.fsCheck = { checking: true };
  showFsCheck();
  let result, tab = null;
  try {
    tab = await hiddenTab();
    try {
      result = { sources: await lookUpSources(tab.id, titles, false, sources) };
    } catch (e) {
      // FS's block page comes again when shown: only a window not drawn is tried again
      if (e.blocked) throw e;
      await tab.show();
      try { result = { sources: await lookUpSources(tab.id, titles, false, sources) }; } finally { await tab.back(); }
    }
  } catch (e) {
    result = { error: e.message || String(e) };
  } finally {
    if (tab) tab.close();
  }
  if (generation !== state.checkGeneration) return;
  state.fsCheck = result;
  showFsCheck();
}

// A pair's additions saved on the tree person's page, each then tagged with the source
// from the fact's own view (so a residence is tagged even when the person has several);
// what was changed on FS ("alternate name: Lars Halvorsen"), for rememberDone()
async function saveAdditions(tabId, pair, sourceId, title) {
  // What FS has now: an earlier run (or the user) may have added it since the person's
  // page was read, and the same change made twice changes nothing
  const fresh = await readNow(tabId, pair.pid);
  if (!fresh) await navigate(tabId, personDetailsUrl(pair.pid));
  const changes = [];
  for (const a of pair.additions) {
    const what = additionLabel(a).toLowerCase() + ': ' + additionText(a);
    if (fresh && onTreeAlready(fresh, a)) {
      log(t('{name} has this on FamilySearch already ({what}); not changed.', { name: pair.label, what }), 'ok');
    } else {
      const saved = await factStep(tabId, 'addFact', { pid: pair.pid, addition: a, reason: a.reason, save: true });
      if (!saved.ok) { log(t('Not changed for {name} ({what}): {error}', { name: pair.label, what, error: saved.error }), 'bad'); continue; }
      if (saved.unchanged) log(t('{name} has this on FamilySearch already ({what}); not changed.', { name: pair.label, what }), 'ok');
      else { log(t('{name}: {what}.', { name: pair.label, what }), 'ok'); changes.push(what); }
    }
    const match = a.action === 'name' ? [a.value.given, a.value.surname] : [a.value.description, (String(a.value.date || '').match(/\d{4}/) || [])[0]];
    const tagged = await factStep(tabId, 'tagFact', { pid: pair.pid, type: a.type, match, sourceId, title });
    if (!tagged.ok) log(t('The source is not tagged to it: {error}', { error: tagged.error }), 'near');
    else log(t(tagged.already ? 'The source was tagged to it already.' : 'The source is tagged to it.'), 'ok');
  }
  // The person as FS has them now, for the rows and the next time the record is opened
  if (changes.length) await readNow(tabId, pair.pid);
  for (const row of state.rows || []) if (row.pid() === pair.pid && row.showFacts) row.showFacts();
  return changes;
}

// A fact step tried once more when FS was slow (`timeout`: its tab not drawn, a busy
// page), on the person's page loaded again with the tab in front, so no form of the
// first try is left over; an addition only when it failed before its Save (`unsaved`),
// so it can't be added twice. Tagging is safe to try again: a source tagged already is
// left as it is.
async function factStep(tabId, name, args) {
  const answer = await step(tabId, name, args);
  if (answer.ok || !answer.timeout || (name === 'addFact' && !answer.unsaved)) return answer;
  log(t('{error} Trying once more, with the page loaded again.', { error: answer.error }), 'near');
  await navigate(tabId, personDetailsUrl(args.pid));
  return step(tabId, name, args);
}

// The tree person read again in the work tab (fs_person.js), kept for the page and
// for later linker pages (`tree:<PID>`, `person:<PID>`); null when FS didn't answer
async function readNow(tabId, pid) {
  const answer = await readInTab(tabId, pid);
  if (!answer.person || answer.person.pid !== pid) return null;
  await keepTree(pid, answer.person);
  return answer.person;
}
async function keepTree(pid, person) {
  if (state.fs && state.fs.pid === pid) state.fs = { ...state.fs, ...person };
  if (state.trees && state.trees[pid]) state.trees[pid] = person;
  (state.details || (state.details = {}))[pid] = person;
  try { await chrome.storage.session.set({ ['tree:' + pid]: person }); } catch (e) { /* only a cache */ }
  try {
    const key = 'person:' + pid;
    const kept = (await chrome.storage.local.get(key))[key];
    if (kept) await chrome.storage.local.set({ [key]: { ...kept, ...person } });
  } catch (e) { /* only a cache */ }
}

// Whether the tree person (gatherPerson()'s shape) has an addition already: the name,
// the vital with the same date and place, a residence of the year, the occupation, an
// emigration of the year
function onTreeAlready(tree, a) {
  const v = a.value || {};
  if (a.action === 'name') {
    return [tree.name, ...(tree.altNames || [])].map(sameNameKey).includes(sameNameKey([v.given, v.surname].filter(Boolean).join(' ')));
  }
  const vital = Object.keys(VITAL_TYPES).find((k) => VITAL_TYPES[k] === a.type);
  if (vital) {
    const fs = tree[vital.toLowerCase()];
    return Boolean(fs && (fs.date || fs.place) && sameFsDate(fs.date, v.date) && sameFsPlace(fs.place, v.place));
  }
  const year = fsYear(v.date);
  if (a.type === 'RESIDENCE') return Boolean(year) && (tree.residences || []).some((r) => fsYear(r.date) === year);
  if (a.type === 'OCCUPATION') return (tree.occupations || []).some((o) => sameNameKey(o.description) === sameNameKey(v.description));
  if (a.type === 'OTHER_EVENT') return Boolean(year) && (tree.emigration || []).some((e) => fsYear(e.date) === year);
  return false;
}
// Two FS dates the same (none asked: any); two places the same when each one's first
// part is named in the other ("Oslo, Oslo, Norway" and FS's standard "Oslo, Norway";
// not "Bakken nedre, Vågå, ..." and "Vågå, ...")
function sameFsDate(has, want) {
  if (!String(want || '').trim()) return true;
  const a = parseFsDate(has), b = parseFsDate(want);
  if (!a || !b) return sameNameKey(has) === sameNameKey(want);
  return a.year === b.year && (a.month || 0) === (b.month || 0) && (a.day || 0) === (b.day || 0);
}
function sameFsPlace(has, want) {
  if (!String(want || '').trim()) return true;
  const first = (text) => String(text || '').split(',')[0].trim();
  return Boolean(first(has)) && placeIn(first(want), has) && placeIn(first(has), want);
}

// What a run did, for the search page (search.js doneLine()): chrome.storage.local
// `done`, the latest first, at most MAX_DONE: {key, ids, time, ok, attach, sources:
// [{id, title, book, persons: [{pid, name}]}], changes: [{pid, name, what}]}. `ids` are
// the DA permanent IDs of everyone in the record and the other church book's entry, so
// a hit of any of them is marked, in any search; `key` (the record's principal) is the
// record, whose older entry the new one replaces. Only PIDs, names and source IDs.
const MAX_DONE = 300;
const DA_ID = /^[a-z]{2}\d{14,}$/;
function doneIds() {
  const ids = new Set();
  const add = (id) => { if (DA_ID.test(id || '')) ids.add(id); };
  add(state.record && state.record.primaryPersonId);
  for (const p of state.people || []) add(p.id);
  for (const p of (state.record && state.record.people) || []) add(p.id);
  for (const p of (state.parallel && state.parallel.record && state.parallel.record.people) || []) add(p.id);
  const params = new URLSearchParams(location.search);
  for (const name of ['rec', 'also']) add(((params.get(name) || '').match(/([a-z]{2}\d{14,})(?:[/?#]|$)/) || [])[1]);
  return [...ids];
}
async function rememberDone({ sources, changes, ok, attach }) {
  const ids = doneIds();
  if (!ids.length) return;
  const key = (state.record && state.record.primaryPersonId) || ids[0];
  const entry = {
    key, ids, time: Date.now(), ok, attach,
    sources: sources.map((s) => ({ id: s.id, title: s.title, book: s.book || '', persons: s.persons.map((p) => ({ pid: p.pid, name: p.name || '' })) })),
    changes
  };
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  try {
    const { done = [] } = await chrome.storage.local.get('done');
    await chrome.storage.local.set({ done: [entry, ...done.filter((e) => e && e.key !== key)].slice(0, MAX_DONE) });
  } catch (e) {
    console.warn('arkivet2fs: what was done is not kept for the search page', e);
  }
}

async function run(attach) {
  if (state.running || (state.adding && state.adding.busy)) return;
  let plan;
  try { plan = readPlan(attach); } catch (e) { log(e.message, 'bad'); return; }
  state.running = true;
  document.body.classList.add('running');
  $('log').replaceChildren();
  $('progress').hidden = false;
  let tabId = null;
  const checked = [];  // each source as FS has it now
  const changes = [];  // the facts changed on the tree persons
  try {
    log(t('Opening the SourceBox on FamilySearch…'));
    tabId = await openTab(SOURCEBOX_URL);
    // The source, then the other church book's (attached to the same people, untagged)
    const sources = [{ source: plan.source, pairs: plan.pairs, book: state.parallel ? $('source-heading').textContent : '' }];
    if (plan.parallel) {
      sources.push({ source: plan.parallel, pairs: plan.pairs.map((p) => ({ ...p, tags: [], residence: false })), book: $('parallel-heading').textContent });
    }
    for (const [i, { source, pairs, book }] of sources.entries()) {
      if (i > 0) await navigate(tabId, SOURCEBOX_URL);
      if (book) log(book);
      // The source as the SourceBox has it, in any folder, and who has it already
      const known = await sourceForRun(tabId, source.title, i);
      if (!known) throw new Error(t('Nothing was created: the SourceBox could not be searched, so a new source might be a second copy of one already there. Try again.'));
      await navigate(tabId, SOURCEBOX_URL);
      let sourceId = known.id;
      if (sourceId) {
        log((known.formerTitle
          ? t('The SourceBox has this source under its former title "{title}"; using it ({id}) and giving it the new title.', { id: sourceId, title: known.formerTitle })
          : t('The SourceBox already has a source with this title; using it ({id}).', { id: sourceId })) +
          (known.ids.length > 1 ? ' ' + t('The SourceBox has {n} sources with this title; the first is used.', { n: known.ids.length }) : ''), 'ok');
        // Written over with the fields as reviewed here
        await updateSource(tabId, sourceId, source, known.formerTitle, sameRecordIds(i));
      } else {
        const created = await step(tabId, 'createSource', source);
        if (!created.ok) throw new Error(created.error);
        sourceId = created.sourceId;
        if (created.existing) {
          // Found by its title on Home: written over too, once it's this record's
          log(t('The SourceBox already has a source with this title; using it ({id}).', { id: sourceId }), 'ok');
          await updateSource(tabId, sourceId, source, undefined, sameRecordIds(i));
        } else {
          log(t('Source created ({id}).', { id: sourceId }) +
            (created.missing && created.missing.length ? ' ' + t('Not filled: {fields}.', { fields: created.missing.map((f) => t(f)).join(', ') }) : ''), 'ok');
        }
      }
      const has = new Set(known.persons.map((p) => p.pid.toUpperCase()));
      const persons = [...known.persons];
      checked.push({ title: source.title, book: state.books[i] || '', id: sourceId, ids: known.ids.length ? known.ids : [sourceId], persons });
      const attached = [];
      for (const pair of pairs) {
        // Partly attached before: only those who lack it, and their tags stay as they are
        if (has.has(pair.pid.toUpperCase())) {
          log(t('{name} ({pid}) already has this source on FamilySearch; left as it is.', { name: pair.label, pid: pair.pid }), 'ok');
          continue;
        }
        const result = await step(tabId, 'attach', { sourceId, title: source.title, pid: pair.pid, reason: pair.reason, tags: pair.tags, residence: pair.residence });
        if (!result.ok) { log(t('Not attached to {name} ({pid}): {error}', { name: pair.label, pid: pair.pid, error: result.error }), 'bad'); continue; }
        log(t('Attached to {name} ({pid}).', { name: pair.label, pid: pair.pid }), 'ok');
        persons.push({ pid: pair.pid, name: pair.label });
        // Tagged in FS's own dialog after attaching, or later on the Sources tab
        if (result.tagged) { if (pair.tags.length || pair.residence) logTags(pair, result.tagged); }
        else attached.push(pair);
      }
      for (const pair of attached) {
        if (!pair.tags.length && !pair.residence) continue;
        await navigate(tabId, personSourcesUrl(pair.pid));
        const result = await step(tabId, 'tag', { sourceId, title: source.title, tags: pair.tags, residence: pair.residence });
        if (result.ok) logTags(pair, result);
        else log(t('Tags for {name} not set: {error}', { name: pair.label, error: result.error }), 'bad');
      }
      // The record's facts ticked for the tree persons who have the (main) source now
      if (i === 0) {
        const withSource = new Set(persons.map((p) => p.pid.toUpperCase()));
        for (const pair of pairs) {
          if (!(pair.additions || []).length) continue;
          if (!withSource.has(pair.pid.toUpperCase())) {
            log(t('Nothing added to {name} ({pid}): the source is not attached.', { name: pair.label, pid: pair.pid }), 'bad');
            continue;
          }
          const made = await saveAdditions(tabId, pair, sourceId, source.title);
          for (const what of made || []) changes.push({ pid: pair.pid, name: pair.label, what });
        }
      }
    }
    // What FS has now, for the notes and rows
    state.fsCheck = { sources: checked };
    state.checkGeneration = (state.checkGeneration || 0) + 1;
    showFsCheck();
    if (!attach) log(t(sources.length > 1 ? 'The sources are in your SourceBox; attach them there when you like.' : 'The source is in your SourceBox; attach it there when you like.'));
    log(t('Done.'), 'ok');
  } catch (e) {
    log(e.message || String(e), 'bad');
  } finally {
    const failed = Boolean($('log').querySelector('.bad'));
    // For the search page: the hits of this record say what was done
    if (checked.length) await rememberDone({ sources: checked, changes, ok: !failed, attach });
    // All done: the FS tab is closed and the linker shown again. A step that failed
    // leaves it open where it stopped, for the user to see.
    if (tabId !== null) {
      if (failed) log(t('The FamilySearch tab is left open where it stopped.'), 'near');
      else await closeWorkTab(tabId);
    }
    state.running = false;
    document.body.classList.remove('running');
  }
}

// --- A new person on FamilySearch -------------------------------------------------
// A record person not in the tree yet: the sidebar's form, filled from the record
// (the name split by the patronymic, sex, birth and death as FS's form takes them) and
// the relationship to someone paired here, as the record tells it. Find on FamilySearch
// opens the tree person's page in a tab, where FS's own Add Child / Add Spouse / Add
// Parent form is filled and searched (nothing saved); FS's possible matches come back
// here. Create person makes the new person on FS and pairs the row with them; a match
// chosen instead is only paired (FS's family is left as it is).

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A date as FS's English form takes it: "16 July 1846", "July 1846", "1846", "about 1848"
function fsDateText(d, approx) {
  if (!d || !d.year) return '';
  if (d.month && d.day) return d.day + ' ' + MONTHS_EN[d.month - 1] + ' ' + d.year;
  if (d.month) return MONTHS_EN[d.month - 1] + ' ' + d.year;
  return (approx ? 'about ' : '') + d.year;
}

// A record's place as FS names places, municipality, county, Norway: DA's own name
// when it knows the municipality ("Vaage" → "Vågå, Oppland, Norway"; one in the
// record's county first), else the place with the record's county. `elsewhere`: a place
// the record names but isn't in, such as a census's birthplace, which can lie in any
// county ("Christiania" in a census of Troms is Oslo): the record's county only when
// the place is found there, else "<place>, Norway". Bergen, a county of its own on DA,
// is in Hordaland as FS has it; Oslo is Kristiania when the record names it so
// (Kristiania, Christiania or a clerk's abbreviation: Chra., Kria., ...).
function fsPlace(place, record, elsewhere) {
  const name = (place || '').replace(/\*/g, '').replace(/\s+(prgj\.?|prestegjeld|sogn|herred|s\.)$/i, '').trim();
  if (!name) return '';
  if (/,/.test(name)) return name;
  const county = record.county && !/,/.test(record.county) ? record.county : '';
  return fsMunicipality(name, record, elsewhere) || joined(name, elsewhere ? '' : county, 'Norway');
}
// The municipality a place names, as FS writes it ("Vågå, Oppland, Norway"), or ''
// (a farm, a place DA's tables don't have)
function fsMunicipality(place, record, elsewhere) {
  const name = (place || '').replace(/\*/g, '').replace(/\s+(prgj\.?|prestegjeld|sogn|herred|s\.)$/i, '').trim();
  if (!name || /,/.test(name)) return '';
  const county = record.county && !/,/.test(record.county) ? record.county : '';
  // "Chr", as clerks wrote Christiania, in a record of Oslo or Akershus
  if (/^chr\.?$/i.test(name) && /^(Oslo|Akershus)$/.test(county)) return 'Kristiania, Oslo, Norway';
  const one = (placeWords(name) || [name])[0];
  const names = [...new Set([one, one.replace(/s$/, ''), one.replace(/\.$/, '')])];
  // with the record's county first; one anywhere also alone (the county Bergen is also
  // the town, which makes "Vaage, Bergen" two places). Only the codes the name itself
  // gives: the counties Oslo and Bergen are towns too, and a farm there isn't the town.
  const tries = [...names.map((n) => [n, joined(n, county)]), ...(elsewhere && county ? names.map((n) => [n, n]) : [])];
  for (const [own, tryName] of tries) {
    const mine = municipalityCodes(own);
    const code = oneMunicipality(municipalityCodes(tryName).filter((c) => mine.includes(c)));
    if (!code) continue;
    const municipality = code === '0301' && namesKristiania(name) ? 'Kristiania' : municipalityName(code);
    return joined(municipality, fsCounty(countyName(code.slice(0, 2))), 'Norway');
  }
  return '';
}
// Whether a place is Oslo under its old name: a word of it is one of Oslo's
// PLACE_ALIASES but "oslo" (Christiania, Kristiania, Chra., Chria., Chrania, Kria.)
function namesKristiania(name) {
  const old = PLACE_ALIASES.find((names) => names[0] === 'oslo').slice(1);
  return name.toLowerCase().split(/[^a-zæøå]+/).some((word) => old.includes(word));
}
// A DA county as FS names it: DA's Bergen is FS's Hordaland
const fsCounty = (name) => (name === 'Bergen' ? 'Hordaland' : name);
// The one municipality of a place's codes, leaving out the neighbours
// municipalityCodes() adds for searching (Oslo's Aker), or null
function oneMunicipality(codes) {
  const own = codes.filter((code) => !codes.some((other) => (MUNICIPALITY_NEIGHBOURS[other] || []).includes(code)));
  return own.length === 1 ? own[0] : null;
}

// The form's values for a row: {given, surname, sex, birthDate, birthPlace, deathDate,
// deathPlace, surnames (to choose from), notes}
function newPersonDraft(row) {
  const person = row.person;
  const record = state.record;
  const facts = recordFacts(person, record);
  const words = (row.name || stripVariants(person.name)).split(/\s+/).filter(Boolean);
  const notes = [];
  // The patronymic is the surname; a word after it (a farm, an address) is left out
  let { given, surname, rest } = nameParts(words.join(' '));
  if (rest) notes.push(t('Left out of the name: {rest} (a farm is an address; add it if it is a family name).', { rest }));
  // A child by given name only: the father's patronymic
  const surnames = words.length === 1 ? surnameSuggestions(person, state.people, record, null).map((x) => x.name.split(/\s+/).pop()) : [];
  if (!surname && surnames.length === 1) surname = surnames[0];
  const sex = facts.Sex ? facts.Sex.value.toLowerCase() : 'unknown';
  let birthDate = '';
  if (facts.Birth && facts.Birth.date) birthDate = fsDateText(facts.Birth.date);
  else if (facts.Birth && facts.Birth.year) birthDate = fsDateText({ year: facts.Birth.year }, facts.Birth.approx);
  else if (facts.Christening && facts.Christening.year) birthDate = fsDateText({ year: facts.Christening.year }, true);
  const bornAt = facts.Birth && facts.Birth.place;
  const birthPlace = bornAt ? fsPlace(bornAt, record, true) : facts.Christening ? parishPlace(record) : '';
  const deathDate = facts.Death ? fsDateText(facts.Death.date) : '';
  const deathPlace = facts.Burial || facts.Death ? parishPlace(record) : '';
  // What FS's form doesn't take: add it on the person's page later
  for (const fact of ['Christening', 'Burial', 'Residence']) {
    if (facts[fact]) notes.push(t('{fact}: {text}. FamilySearch\'s form doesn\'t take it: add it on the person\'s page.', { fact: t(fact), text: facts[fact].text }));
  }
  return { given, surname, sex, birthDate, birthPlace, deathDate, deathPlace, surnames, notes };
}

// What the new person is to the people paired here, as the record tells it (from
// each paired person's entry): [{relation, anchor, other, label, record}], the record's
// first (a child of both paired parents, in their family card; of one; a spouse; a
// parent), then each paired person as child, spouse or parent, for the user to choose
function newPersonRelations(row) {
  const people = state.people;
  const me = people.indexOf(row.person);
  const paired = state.rows.filter((r) => r !== row && PID_PATTERN.test(r.pid()));
  const seen = (r) => {
    // A census: within the household (a grandchild's parents are the head's son and
    // his wife, not the head and his)
    if (isCensus()) {
      if (r.person.household !== row.person.household) return { child: false, spouse: false, parent: false };
      const found = householdRelatives(state.record, people, r.person);
      const has = (list) => list.includes(row.person);
      return { child: has(found.child), spouse: has(found.spouse), parent: has(found.father) || has(found.mother) };
    }
    const view = { ...state.record, people: people.map((p) => ({ ...p, current: p === r.person })) };
    const found = relativesInRecord(view);
    const has = (list) => list.some((p) => view.people.indexOf(p) === me);
    return { child: has(found.child), spouse: has(found.spouse), parent: has(found.father) || has(found.mother) };
  };
  const how = new Map(paired.map((r) => [r, seen(r)]));
  const out = [];
  const add = (relation, a, b, fromRecord) => {
    const anchor = a.pid(), other = b ? b.pid() : '';
    if (out.some((o) => o.relation === relation && o.anchor === anchor && o.other === other)) return;
    const label = relation === 'child' ? (b ? t('Child of {a} and {b}', { a: a.label(), b: b.label() }) : t('Child of {name}', { name: a.label() }))
      : relation === 'parent' ? t('Parent of {name}', { name: a.label() }) : t('Spouse of {name}', { name: a.label() });
    out.push({ relation, anchor, other, label, record: fromRecord });
  };
  const parents = paired.filter((r) => how.get(r).child);
  if (parents.length >= 2) add('child', parents[0], parents[1], true);
  for (const p of parents) add('child', p, null, true);
  for (const r of paired.filter((x) => how.get(x).spouse)) add('spouse', r, null, true);
  for (const r of paired.filter((x) => how.get(x).parent)) add('parent', r, null, true);
  for (const r of paired) for (const relation of ['child', 'spouse', 'parent']) add(relation, r, null, false);
  return out;
}

const personPageUrl = (pid) => 'https://www.familysearch.org/en/tree/person/details/' + encodeURIComponent(pid);

// The sidebar for a row: the form, then FS's possible matches
function openNewPerson(row) {
  if (state.running || (state.adding && state.adding.busy)) return;
  closeNewPerson();
  const draft = newPersonDraft(row);
  const relations = newPersonRelations(row);
  state.adding = { row, draft, relations, tabId: null, busy: false };
  const side = $('new-person');
  const field = (id, label, value, attrs = {}) => el('label', { class: 'field' }, [document.createTextNode(t(label) + ' '),
    el('input', { id: 'np-' + id, type: 'text', value: value || '', ...attrs })]);
  const sexes = [['male', 'Male'], ['female', 'Female'], ['unknown', 'Unknown']].map(([v, label]) => {
    const r = el('input', { type: 'radio', name: 'np-sex', value: v });
    r.checked = draft.sex === v;
    return el('label', {}, [r, document.createTextNode(' ' + t(label))]);
  });
  const relation = relationFields(relations);
  const chips = el('div', { class: 'suggest' }, (draft.surnames.length > 1 ? draft.surnames : []).map((name) => {
    const b = el('button', { type: 'button', class: 'chip', text: name });
    b.addEventListener('click', () => { $('np-surname').value = name; });
    return b;
  }));
  const find = el('button', { type: 'button', class: 'primary', id: 'np-find', text: t('Find on FamilySearch') });
  const cancel = el('button', { type: 'button', class: 'secondary', text: t('Cancel') });
  find.disabled = !relations.length;
  find.addEventListener('click', () => findNewPerson());
  cancel.addEventListener('click', () => closeNewPerson());
  side.replaceChildren(
    el('div', { class: 'side-head' }, [el('h2', { text: t('New person on FamilySearch') }),
      el('button', { type: 'button', class: 'link close', text: '×', title: t('Cancel'), 'aria-label': t('Cancel') })]),
    el('p', { class: 'muted small', text: t('From the record: {name}, {role}.', { name: row.label(), role: roleText(row.person) }) }),
    field('given', 'Given names', draft.given),
    field('surname', 'Surname', draft.surname), chips,
    el('div', { class: 'field' }, [el('div', { text: t('Sex') }), el('div', { class: 'radios' }, sexes)]),
    field('birthDate', 'Birth date', draft.birthDate),
    field('birthPlace', 'Birthplace', draft.birthPlace),
    field('deathDate', 'Death date', draft.deathDate),
    field('deathPlace', 'Death place', draft.deathPlace),
    relation,
    relations.length ? el('p', { class: 'muted small', text: t('Deceased. FamilySearch\'s own Add Person form is filled with these in a tab (dates and places as FamilySearch suggests them), and it looks for people who may be the same. Nothing is saved before you choose.') })
      : el('p', { class: 'small bad', text: t('Pair someone in the record first: the new person is added to the tree as their relative.') }),
    ...draft.notes.map((n) => el('p', { class: 'muted small', text: n })),
    el('div', { id: 'np-results' }),
    el('div', { class: 'actions' }, [find, cancel]));
  side.querySelector('.close').addEventListener('click', () => closeNewPerson());
  side.hidden = false;
  document.body.classList.add('with-sidebar');
  $('np-given').focus();
}

// A paired row's sex: FS's, else the record's (a church book's father or mother, a
// patronymic, a census position)
function rowSex(r) {
  const tree = fullTree(r.pid()) || treePool(state.fs, state.trees).find((o) => o.pid === r.pid());
  if (tree && /^(male|female)$/i.test(tree.gender || '')) return tree.gender.charAt(0).toUpperCase() + tree.gender.slice(1).toLowerCase();
  const kind = roleKind(r.person);
  return kind === 'father' ? 'Male' : kind === 'mother' ? 'Female' : recordSex(r.person, state.record);
}

// The relationship: child (a father and a mother, each any paired person or none),
// spouse or parent (of a paired person), set to the record's suggestion; the
// record's suggestions are chips that set it again
function relationFields(relations) {
  const paired = state.rows.filter((r) => r !== state.adding.row && PID_PATTERN.test(r.pid()));
  const person = (id, label) => el('label', { class: 'field' }, [document.createTextNode(t(label) + ' '),
    el('select', { id: 'np-' + id }, [el('option', { value: '', text: t('None') }),
      ...paired.map((r) => el('option', { value: r.pid(), text: r.label() + ' (' + r.pid() + ')' }))])]);
  const kind = el('select', { id: 'np-kind', 'aria-label': t('Relationship') },
    [['child', 'Child'], ['spouse', 'Spouse'], ['parent', 'Parent']].map(([v, label]) => el('option', { value: v, text: t(label) })));
  const childBox = el('div', { id: 'np-parents' }, [person('father', 'Father'), person('mother', 'Mother')]);
  const ofBox = el('div', { id: 'np-of-box' }, [person('of', 'Of')]);
  const note = el('p', { id: 'np-couple', class: 'small near' });
  const show = () => {
    childBox.hidden = kind.value !== 'child';
    ofBox.hidden = kind.value === 'child';
    const { father, mother } = { father: childBox.querySelector('#np-father').value, mother: childBox.querySelector('#np-mother').value };
    const couple = kind.value === 'child' && father && mother && father !== mother ? coupleOnFs(father, mother) : null;
    note.textContent = couple === false ? t('{a} and {b} aren\'t a couple on FamilySearch: add their marriage there first, or choose one parent.',
      { a: labelOf(father), b: labelOf(mother) }) : '';
    note.hidden = !note.textContent;
  };
  const labelOf = (pid) => (paired.find((r) => r.pid() === pid) || { label: () => pid }).label();
  const apply = (o) => {
    kind.value = o.relation;
    if (o.relation === 'child') {
      // which of the two is the father: by sex, else as the record lists them
      const two = [o.anchor, o.other].map((pid) => paired.find((r) => r.pid() === pid)).filter(Boolean);
      let father = two.find((r) => rowSex(r) === 'Male'), mother = two.find((r) => rowSex(r) === 'Female');
      for (const r of two.filter((x) => x !== father && x !== mother)) {
        if (!father) father = r;
        else if (!mother) mother = r;
      }
      childBox.querySelector('#np-father').value = father ? father.pid() : '';
      childBox.querySelector('#np-mother').value = mother ? mother.pid() : '';
    } else ofBox.querySelector('#np-of').value = o.anchor;
    show();
  };
  for (const s of childBox.querySelectorAll('select')) s.addEventListener('change', show);
  kind.addEventListener('change', show);
  const suggested = relations.filter((o) => o.record);
  const chips = el('div', { class: 'suggest' }, suggested.map((o) => {
    const b = el('button', { type: 'button', class: 'chip', text: o.label });
    b.addEventListener('click', () => apply(o));
    return b;
  }));
  const box = el('div', { class: 'field' }, [el('div', { text: t('Relationship') }), kind,
    ...(suggested.length ? [el('div', { class: 'muted small', text: t('The record suggests:') }), chips] : []), childBox, ofBox, note]);
  if (relations.length) apply(relations[0]);
  else show();
  return box;
}

// Whether two tree persons are a couple on FS, as far as their pages read here tell
// (FS adds a child of two only in the couple's family card): null when unknown
function coupleOnFs(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const tree = fullTree(x);
    if (tree && Array.isArray(tree.families)) return tree.families.some((f) => f.spouse && f.spouse.pid === y);
  }
  return null;
}

// The relationship chosen: {relation, anchor, other, label}, or {error}
function readRelation() {
  const kind = $('np-kind').value;
  const label = (pid) => (state.rows.find((r) => r.pid() === pid) || { label: () => pid }).label();
  if (kind === 'child') {
    const father = $('np-father').value, mother = $('np-mother').value;
    if (!father && !mother) return { error: t('Choose the father, the mother or both.') };
    if (father && father === mother) return { error: t('The father and the mother are the same person.') };
    const [a, b] = father ? [father, mother] : [mother, ''];
    return { relation: 'child', anchor: a, other: b,
      label: b ? t('Child of {a} and {b}', { a: label(a), b: label(b) }) : t('Child of {name}', { name: label(a) }) };
  }
  const of = $('np-of').value;
  if (!of) return { error: t('Choose the person the new one is related to.') };
  return { relation: kind, anchor: of, other: '',
    label: kind === 'parent' ? t('Parent of {name}', { name: label(of) }) : t('Spouse of {name}', { name: label(of) }) };
}

// The form's values as fs_attach.js findPerson takes them
function readNewPerson() {
  const v = (id) => $('np-' + id).value.trim();
  const sex = (document.querySelector('input[name="np-sex"]:checked') || {}).value || 'unknown';
  return { person: { given: v('given'), surname: v('surname'), sex, birthDate: v('birthDate'), birthPlace: v('birthPlace'), deathDate: v('deathDate'), deathPlace: v('deathPlace') }, relation: readRelation() };
}

async function findNewPerson() {
  const adding = state.adding;
  if (!adding || adding.busy) return;
  const { person, relation } = readNewPerson();
  const results = $('np-results');
  if (!person.given && !person.surname) { results.replaceChildren(el('p', { class: 'small bad', text: t('A name is needed.') })); return; }
  if (!relation || relation.error) { results.replaceChildren(el('p', { class: 'small bad', text: relation ? relation.error : '' })); return; }
  adding.busy = true;
  adding.relation = relation;
  adding.person = person;
  $('np-find').disabled = true;
  results.replaceChildren(el('p', { class: 'muted small', text: t('Filling FamilySearch\'s form and looking for matches…') }));
  try {
    if (adding.tabId !== null) { await chrome.tabs.remove(adding.tabId).catch(() => {}); adding.tabId = null; }
    adding.tabId = await openTab(personPageUrl(relation.anchor));
    const found = await step(adding.tabId, 'findPerson', { relation: relation.relation, anchor: relation.anchor, other: relation.other, person });
    if (!found.ok) throw new Error(found.error);
    await backToLinker();
    showMatches(found);
    $('np-find').textContent = t('Search again');
    $('np-find').className = 'secondary';
  } catch (e) {
    results.replaceChildren(el('p', { class: 'small bad', text: e.message || String(e) }));
    if (adding.tabId !== null) results.append(el('p', { class: 'muted small', text: t('The FamilySearch tab is left open where it stopped.') }));
  } finally {
    adding.busy = false;
    if ($('np-find')) $('np-find').disabled = false;
  }
}

// FS's possible matches, each to pair with instead, and Create person
function showMatches(found) {
  const results = $('np-results');
  const items = [];
  const unpicked = (found.fields || []).filter((f) => f.value && f.picked === '');
  if (unpicked.length) items.push(el('p', { class: 'small near', text: t('FamilySearch suggested nothing for: {fields}. They stay as typed.', { fields: unpicked.map((f) => f.value).join('; ') }) }));
  const picked = (found.fields || []).filter((f) => f.picked);
  if (picked.length) items.push(el('p', { class: 'muted small', text: t('As FamilySearch has them: {fields}', { fields: picked.map((f) => f.picked).join('; ') }) }));
  const matches = found.matches || [];
  items.push(el('h3', { text: matches.length ? t('FamilySearch found {n} who may be the same', { n: matches.length }) : t('FamilySearch found no one who may be the same.') }));
  const list = el('ul', { class: 'matches' });
  for (const m of matches) {
    const use = el('button', { type: 'button', class: 'secondary', text: t('Use this person') });
    use.addEventListener('click', () => useMatch(m, use));
    list.append(el('li', {}, [
      el('a', { href: fsPageUrl(personPageUrl(m.pid)), target: '_blank', rel: 'noopener', text: m.name || m.pid }),
      el('div', { class: 'muted small', text: joined(m.lifespan, m.pid) }),
      ...(m.events || []).map((e) => el('div', { class: 'small', text: e })),
      ...(m.spouses && m.spouses.length ? [el('div', { class: 'small', text: t('Spouse: {names}', { names: m.spouses.join(', ') }) })] : []),
      use]));
  }
  if (matches.length) {
    const relation = state.adding && state.adding.relation;
    if (relation) items.push(el('p', { class: 'muted small', text: t('Using one adds them on FamilySearch as {relation}, unless they are already.', { relation: lowerFirst(relation.label) }) }));
    items.push(list);
  }
  const create = el('button', { type: 'button', class: 'primary', id: 'np-create', text: t('Create person') });
  create.addEventListener('click', () => createNewPerson());
  items.push(el('p', { class: 'muted small', text: matches.length ? t('None of them? Create the person as a new one.') : t('Create the person on FamilySearch:') }), create);
  results.replaceChildren(...items);
}

async function createNewPerson() {
  const adding = state.adding;
  if (!adding || adding.busy || adding.tabId === null) return;
  adding.busy = true;
  $('np-create').disabled = true;
  const results = $('np-results');
  results.append(el('p', { class: 'muted small', text: t('Creating the person on FamilySearch…') }));
  try {
    await chrome.tabs.update(adding.tabId, { active: true });
    const made = await step(adding.tabId, 'createPerson', {});
    if (!made.ok) throw new Error(made.error);
    await refreshFamily(adding.tabId, [adding.relation.anchor, adding.relation.other]);
    await closeWorkTab(adding.tabId);
    adding.tabId = null;
    const name = (adding.person.given + ' ' + adding.person.surname).trim();
    adding.row.pairWith(made.pid, t('new on FamilySearch: {name}, {relation}', { name, relation: lowerFirst(adding.relation.label) }));
    adding.busy = false;
    closeNewPerson();
  } catch (e) {
    results.append(el('p', { class: 'small bad', text: e.message || String(e) }),
      el('p', { class: 'muted small', text: t('The FamilySearch tab is left open where it stopped.') }));
    adding.busy = false;
  }
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// A match FS found is the person: linked in the relation chosen (FS's Add Match in
// its open dialog: a person made before, whose links were taken off, would otherwise
// stay outside the family), unless FS shows them so already, then paired
async function useMatch(match, button) {
  const adding = state.adding;
  if (!adding || adding.busy || adding.tabId === null) return;
  const relation = adding.relation;
  adding.busy = true;
  if (button) button.disabled = true;
  const results = $('np-results');
  results.append(el('p', { class: 'muted small', text: t('Linking {name} on FamilySearch as {relation}…', { name: match.name || match.pid, relation: lowerFirst(relation.label) }) }));
  try {
    await chrome.tabs.update(adding.tabId, { active: true });
    const done = await step(adding.tabId, 'addMatch', { pid: match.pid, relation: relation.relation, anchor: relation.anchor, other: relation.other });
    if (!done.ok) throw new Error(done.error);
    // The family as FS has it now (the cached pages left out the link)
    if (done.linked) await refreshFamily(adding.tabId, [relation.anchor, relation.other, match.pid]);
    await closeWorkTab(adding.tabId);
    adding.tabId = null;
    const why = done.already ? t('found on FamilySearch: {name}, {relation} there already', { name: match.name || match.pid, relation: lowerFirst(relation.label) })
      : t('found on FamilySearch: {name}, linked as {relation}', { name: match.name || match.pid, relation: lowerFirst(relation.label) });
    adding.row.pairWith(match.pid, why);
    adding.busy = false;
    closeNewPerson();
  } catch (e) {
    results.append(el('p', { class: 'small bad', text: fsMessage(e.message || String(e)) }),
      el('p', { class: 'muted small', text: t('The FamilySearch tab is left open where it stopped.') }));
    adding.busy = false;
    if (button) button.disabled = false;
  }
}

// The tree persons read again after a link was added on FS (the pages kept from
// before don't have it)
async function refreshFamily(tabId, pids) {
  for (const pid of pids.filter(Boolean)) {
    if (!(await readNow(tabId, pid))) {
      if (state.details) delete state.details[pid];
      try { await chrome.storage.session.remove('tree:' + pid); } catch (e) { /* only a cache */ }
    }
  }
}

// The sidebar closed; FS's dialog cancelled and its tab closed (nothing was saved)
function closeNewPerson() {
  const adding = state.adding;
  if (adding && adding.busy) return;
  state.adding = null;
  $('new-person').hidden = true;
  $('new-person').replaceChildren();
  document.body.classList.remove('with-sidebar');
  if (adding && adding.tabId !== null) {
    const tabId = adding.tabId;
    step(tabId, 'cancelAdd', {}).catch(() => {}).then(() => chrome.tabs.remove(tabId).catch(() => {}));
  }
}

// --- The problem report (report.js) ---------------------------------------------------
// What the linker read from DA, what it shows (the source, each person's pairing, facts
// and changes) and what it did on FS (the log), for "Copy report"
function linkerReport() {
  const params = new URLSearchParams(location.search);
  const sections = [];
  const shown = (id) => { const node = $(id); return node && !node.hidden && node.textContent.trim() ? node.textContent.trim() : null; };
  sections.push(['Opened with', ['rec', 'also', 'pid', 'draft'].filter((k) => params.get(k)).map((k) => '- ' + k + ': ' + params.get(k))]);
  sections.push(['Page status', shown('status')]);

  // The record as read: its people with every field the reader gave them
  const r = state.record;
  if (r) {
    const own = (p) => Object.entries(p).filter(([k, v]) => k !== 'key' && v != null && v !== '' && typeof v !== 'object')
      .map(([k, v]) => k + ': ' + v).join('; ');
    const fields = Object.entries(r.fields || {}).map(([k, v]) => k + ': ' + v).join('; ');
    sections.push(['Record as read', [
      '- Permanent ID: ' + (r.permanentId || '?') + ', ' + ((r.recordTypeInfo || {}).type || '?') + ', ' + (r.recordDate || 'no date'),
      ...(r.sourceTitle ? ['- DA source: ' + r.sourceTitle + (r.sourceUrl ? ' (' + r.sourceUrl + ')' : '')] : []),
      ...(r.county || r.church ? ['- County: ' + (r.county || '-') + '; church: ' + (r.church || '-')] : []),
      ...(fields ? ['- Open person\'s fields: ' + fields] : []),
      ...state.people.map((p) => '- ' + own(p))]]);
  }

  // The sources as they stand in the boxes, with what the SourceBox check found
  const check = state.fsCheck || {};
  const sourceLines = (prefix, i) => {
    const v = reviewedSource(prefix);
    const found = check.sources && check.sources[i];
    const fs = fsSource(i);
    const diffs = fs ? sourceDiffs(fs.fields, v) : [];
    return ['- Title: ' + v.title, '- Date: ' + v.date, '- Web page: ' + v.url, '- Citation:', ...reportBlock(v.citation), '- Notes:', ...reportBlock(v.notes),
      '- SourceBox: ' + (check.checking ? 'still checking' : check.error ? 'check failed: ' + check.error
        : !found ? 'not checked' : found.otherRecord ? 'a source of this title is of another record'
          : !found.id ? 'not there' : found.id + ', attached to ' + (found.persons.map((p) => p.pid).join(', ') || 'no one') + (found.ids.length > 1 ? ' (' + found.ids.length + ' sources of the title)' : '')),
      ...diffs.map((d) => '- Differs from the SourceBox: ' + d.key + ' (' + fieldChoice(i, d) + ')'),
      // What the SourceBox has where it isn't the same, also empty there (an update writes those too)
      ...(fs ? SOURCE_FIELDS.filter(([key]) => !sameText(withoutAccess(fs.fields[key]), withoutAccess(v[key]))).flatMap(([key, label]) => {
        const theirs = String(fs.fields[key] || '').trim();
        if (!theirs) return ['- SourceBox\'s ' + label + ': (empty)'];
        return theirs.includes('\n') || theirs.length > 80 ? ['- SourceBox\'s ' + label + ':', ...reportBlock(theirs)] : ['- SourceBox\'s ' + label + ': ' + JSON.stringify(theirs)];
      }) : [])];
  };
  if (r) sections.push(['Source', sourceLines('f', 0)]);
  if (state.parallel) sections.push(['Source of the other church book', sourceLines('g', 1)]);

  // Each person: the pairing, why, the facts side by side, tags and the changes offered
  const people = (state.rows || []).map((row) => {
    const pid = row.pid();
    const tree = row.tree() || (PID_PATTERN.test(pid) ? { pid, name: '' } : null);
    const lines = ['- ' + row.label() + ' (' + (row.person.roleEnglish || row.person.role || '?') + (row.person.household ? ', household ' + row.person.household : '') + ')'
      + (row.node.hidden ? ' [hidden]' : '') + ' → ' + (pid ? pid + (tree && tree.relation ? ' (' + relationLabel(tree) + ')' : '') : 'not attached')
      + (row.touched() ? ' [chosen by hand]' : '')];
    const say = (label, text) => { if (text) lines.push('  - ' + label + ': ' + text); };
    say('Why', row.why());
    say('FamilySearch', row.status());
    if (tree) {
      const da = recordFacts(row.person, state.record), fs = treeFacts(tree, state.record);
      for (const f of FACTS.filter((f) => da[f] || fs[f])) {
        const how = compareFact(f, da[f], fs[f], row.person, tree, state.record);
        lines.push('  - ' + f + ': ' + (da[f] ? da[f].text : '—') + ' | FS: ' + (fs[f] ? fs[f].text : '—') + (how ? ' ' + MARKS[how] : ''));
      }
      if (!fullTree(tree.pid)) lines.push('  - (the FS person\'s page was not read)');
      say('Tags', row.tags().join(', '));
      const ticked = new Map((row.additions ? row.additions() : []).map((a) => [a.key, a]));
      for (const a of row.offered || []) {
        const done = ticked.get(additionKey(row.person, pid, a));
        lines.push('  - [' + (done ? 'x' : ' ') + '] ' + additionLabel(a) + ': ' + additionText(done || a) + (a.current ? ' (FS has: ' + a.current + ')' : ''));
        // what "Check with FamilySearch" made of it, while the boxes hold its picks
        const kept = (state.additionEdits || {})[additionKey(row.person, pid, a)];
        if (kept && kept.fs) lines.push('    - ' + fsCheckedText(kept.fs));
      }
    }
    return lines.join('\n');
  });
  sections.push(['People', people]);
  sections.push(['On FamilySearch (the log)', [...document.querySelectorAll('#log li')].map((li) => '- ' + (li.className ? '[' + li.className + '] ' : '') + li.textContent)]);
  return reportText('linker', sections.filter(([, body]) => body && (!Array.isArray(body) || body.length)), navigator);
}

async function setPerson(pid) {
  state.fs = await storedPerson(pid);
  await showPeople();
}

async function main() {
  const params = new URLSearchParams(location.search);
  const status = $('status');
  try {
    if (params.get('rec')) status.textContent = t('Reading the record on DigitalArkivet…');
    let loaded = params.get('draft') ? await loadDraft(params.get('draft')) : params.get('rec') ? await loadFromDA(params.get('rec')) : null;
    if (!loaded) throw new Error(t('No record given. Open the linker from a search hit, or with the extension icon on a DA record.'));
    // The same entry in the parish's other church book (a search hit's `also`):
    // the ministerialbok's is the main record
    let parallel = null;
    if (params.get('rec') && params.get('also')) {
      try {
        status.textContent = t('Reading the entry in the other church book…');
        const both = await loadParallel(loaded, params.get('also'));
        loaded = both.main;
        parallel = both.parallel;
      } catch (e) {
        const note = $('source-note');
        note.textContent = t('The entry in the other church book could not be read: {error}', { error: tMessage(e.message || String(e)) });
        note.classList.add('bad');
        note.hidden = false;
      }
    }
    state.record = loaded.record;
    state.parallel = parallel;
    state.people = recordPeople(loaded.record, loaded.anchorId, loaded.openPerson);
    if (parallel) fillParallel(loaded, parallel);
    else fillSource(loaded.record);

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
    status.textContent = t('Pairing the people with the FamilySearch family…');
    await setPerson(pid);
    // Shown when the SourceBox has told what FS has already
    status.textContent = t('Checking your SourceBox on FamilySearch…') + ' ' + windowNote();
    await checkOnFamilySearch();
    status.hidden = true;
    $('linker').hidden = false;
    readDetails();  // the paired tree persons' facts, filled in as they're read
  } catch (e) {
    status.textContent = daStopped(e) ? e.message : tMessage(e.message || String(e));
    status.classList.add('bad');
    if (daStopped(e)) {
      // DA down or refusing requests (da_search.js daPause()): read the record again now
      const retry = el('button', { type: 'button', text: t('Try again now') });
      retry.addEventListener('click', () => { clearDaPause(); location.reload(); });
      status.append(' ', retry);
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  watchErrors(window);  // for the problem report
  $('fs-pid').addEventListener('change', async () => {
    state.trusted = true;
    await setPerson($('fs-pid').value.trim().toUpperCase());
    if (!$('linker').hidden) readDetails();
  });
  $('attach').addEventListener('click', () => run(true));
  $('create-only').addEventListener('click', () => run(false));
  $('check-changes').addEventListener('click', () => prepareAdditions());
  for (const id of ['f-title', 'g-title']) $(id).addEventListener('change', () => showFsCheck());
  for (const p of ['f', 'g']) for (const f of ['date', 'url', 'citation', 'notes']) $(p + '-' + f).addEventListener('change', () => showSourceDiffs());
  $('other-households').addEventListener('click', () => { state.showAll = !state.showAll; showHouseholds(); });
  localizePage();
  document.querySelector('.topbar').append(languageMenu());
  addVersionLink(document.querySelector('.topbar'));
  reportButton(document.querySelector('.topbar'), linkerReport);
  whenSiteAccess(document, main);  // access.js: the sites granted first
}
