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
function recordPeople(record, anchorId, openPerson) {
  const people = (record.people || []).map((p) => ({ ...p }));
  if (openPerson && openPerson.id && !people.some((p) => p.id === openPerson.id)) people.push({ ...openPerson, primary: false });
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
  why[self.key] = 'the FS person';
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
    if (!pairs[person.key] && !why[person.key]) why[person.key] = 'FS ' + relation + ' is ' + tree.name + ', another name: choose them if it\'s the same person';
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
  return role + ' in this ' + what + (year ? ' (' + year + ')' : '') + ' on Digitalarkivet, ' + (record.permanentId || record.url) + '.';
}

// Surnames to offer for a person recorded by given name only: the father's
// patronymic (from the record's father, by the sex the record or the paired FS person
// gives; both when neither does), and the paired FS person's own name
function surnameSuggestions(person, people, record, tree) {
  const name = stripVariants(person.name);
  if (!name || name.split(/\s+/).length > 1) return [];
  const out = [];
  if (tree && tree.name && tree.name.split(/\s+/).length > 1 && hasGivenName(person, givenOf(tree.name))) {
    out.push({ name: tree.name, label: 'FS name' });
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

const state = { record: null, people: [], fs: null, rows: [], running: false, trusted: false };
const $ = (id) => document.getElementById(id);

function relationLabel(t) {
  return t.name + ' (' + (t.relation === 'person' ? 'FS person' : t.relation) + (t.year ? ', b. ' + t.year : '') + ') · ' + t.pid;
}

// One person of the record: name (editable, with surname suggestions), role, the
// tree person to attach to, tags, reason
function personRow(person, family, suggestion, why) {
  const row = { person, name: stripVariants(person.name), noteName: person.name };
  const role = person.roleEnglish || person.role || '';

  const nameInput = el('input', { type: 'text', class: 'name', value: row.name, 'aria-label': 'Name in the source' });
  const suggest = el('div', { class: 'suggest' });
  const select = el('select', { 'aria-label': 'Tree person for ' + row.name });
  select.append(el('option', { value: '', text: '— don\'t attach —' }));
  for (const t of family) select.append(el('option', { value: t.pid, text: relationLabel(t) }));
  select.append(el('option', { value: 'other', text: 'Another person (PID)…' }));
  const otherPid = el('input', { type: 'text', class: 'pid', placeholder: 'PID, e.g. XXXX-XXX', hidden: true, 'aria-label': 'FamilySearch ID' });
  if (suggestion && family.some((t) => t.pid === suggestion)) select.value = suggestion;
  else if (suggestion) { select.value = 'other'; otherPid.value = suggestion; otherPid.hidden = false; }
  const hint = el('div', { class: 'why muted', text: why || '' });

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
  select.addEventListener('change', () => { hint.textContent = ''; refresh(); });
  otherPid.addEventListener('input', refresh);
  nameInput.addEventListener('change', () => { rename(row, nameInput.value.trim()); refresh(); });
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

async function showPeople() {
  const list = $('people');
  const family = treeFamily(state.fs);
  const self = findSelf(state.people, state.fs, state.trusted);
  const { pairs, why } = suggestPairs(state.record, state.people, self, state.fs);
  // Without a stored FS person, a PID typed above still pairs the anchor
  const pid = $('fs-pid').value.trim().toUpperCase();
  if (!state.fs && pid) {
    const anchor = state.people.find((p) => p.current);
    if (anchor) { pairs[anchor.key] = pid; why[anchor.key] = 'the PID above'; }
  }
  state.rows = state.people.map((p) => personRow(p, family, pairs[p.key], why[p.key]));
  list.replaceChildren(...state.rows.map((r) => r.node));
  $('fs-name').textContent = state.fs ? state.fs.name + (family.length > 1 ? ' and ' + (family.length - 1) + ' relatives' : '')
    : pid ? 'family not known here (open the search from this person\'s FS page to have it)' : '';
}

function fillSource(record) {
  $('f-title').value = record.title || '';
  $('f-date').value = record.date || '';
  $('f-url').value = record.url || '';
  $('f-citation').value = record.citation || '';
  $('f-notes').value = record.notes || '';
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
  main();
}
