// fs_attach.js: the read-only steps (findSource, attachedTo) and editSource on a made-up
// FS page with the data-testids FS uses. No FamilySearch page is saved here: the pages are built in
// the tests, with synthetic TEST-… IDs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness.js');

// fs_attach.js on a page at `url`; `step(name, args)` asks it as linker.js does
function attachPage(url, body) {
  let listener = null;
  const chrome = { runtime: { onMessage: { addListener(fn) { listener = fn; } } } };
  const w = load([], { url, chrome, fast: true });
  w.document.body.innerHTML = body;
  w.runFile('fs_attach.js');
  const step = (name, args) => new Promise((resolve) => listener({ linker: name, args }, {}, resolve));
  return { w, step };
}

const row = (id, title) => `<div><span data-testid="row-${id}-title">${title}</span><button data-testid="row-${id}-attach-button">Attach</button>` +
  `<button data-testid="row-${id}-edit-button">Edit</button></div>`;
const TITLE = '1846, Lars, son of Halvor Larsen - Vågå parish 1842-1856 (0515P), Ministerialbok A-13 - Birth';

// The SourceBox: Home shows a few rows; Search shows every source whose title has the
// text, after the list has been empty a moment (loading), or "No sources found."
function sourceBox(home, all) {
  const page = attachPage('https://www.familysearch.org/en/tree/sources/sourceBox',
    '<input data-testid="source-box-filter-field"><button data-testid="source-box-search-button">Search</button><div id="list"></div>');
  const { w } = page;
  const list = w.document.getElementById('list');
  list.innerHTML = home.map(([id, title]) => row(id, title)).join('');
  w.document.querySelector('[data-testid="source-box-search-button"]').addEventListener('click', () => {
    const text = w.document.querySelector('[data-testid="source-box-filter-field"]').value;
    list.innerHTML = '';
    setTimeout(() => {
      const hits = all.filter(([, title]) => title.includes(text));
      list.innerHTML = hits.length ? hits.map(([id, title]) => row(id, title)).join('') : '<p>No sources found.</p>';
    }, 400);
  });
  return page;
}

test('findSource(): the sources of exactly that title, in any folder', async () => {
  const all = [['TEST-S01', TITLE], ['TEST-S02', TITLE + ' (copy)'], ['TEST-S03', TITLE], ['TEST-S04', '1850, Ola Nordmann - Census']];
  const { step } = sourceBox([['TEST-S04', all[3][1]]], all);
  const answer = await step('findSource', { title: '  ' + TITLE + ' ' });
  assert.equal(answer.ok, true);
  assert.deepEqual(plain(answer.sources.map((s) => s.id)), ['TEST-S01', 'TEST-S03']);
});

test('findSource(): none when the search finds nothing', async () => {
  const { step } = sourceBox([['TEST-S04', '1850, Ola Nordmann - Census']], [['TEST-S04', '1850, Ola Nordmann - Census']]);
  assert.deepEqual(plain((await step('findSource', { title: TITLE })).sources), []);
});

test('findSource(): only on the SourceBox (else sign in)', async () => {
  const { step } = attachPage('https://ident.familysearch.org/en/identity/login', '');
  const answer = await step('findSource', { title: TITLE });
  assert.equal(answer.ok, false);
  assert.match(answer.error, /sign in/);
});

const person = (pid, name) => `<div data-testid="attach-to-${pid}-persons"><div data-testid="attach-to-${pid}-entity-type">Person</div>` +
  `<div data-testid="attach-to-${pid}-person"><a data-testid="nameLink"><span data-testid="fullName">${name}</span></a>` +
  `<span data-testid="lifespan">1810–1880</span><span data-testid="pid">${pid}</span></div>` +
  `<div data-testid="attach-to-${pid}-reason">Baptism</div><button data-testid="attach-to-${pid}-detach-button">Detach</button></div>`;

test('attachedTo(): the persons on the source\'s Attached To page', async () => {
  const { step } = attachPage('https://www.familysearch.org/en/tree/sources/attachedTo/TEST-S01',
    `<h1 data-testid="attach-to-title">${TITLE}</h1>` + person('TEST-LAR', 'Lars Halvorsen') + person('TEST-HAL', 'Halvor Larsen'));
  const answer = await step('attachedTo', { sourceId: 'TEST-S01' });
  assert.equal(answer.title, TITLE);
  assert.deepEqual(plain(answer.persons.map((p) => p.pid + ' ' + p.name)), ['TEST-LAR Lars Halvorsen', 'TEST-HAL Halvor Larsen']);
});

test('attachedTo(): a source attached to no one', async () => {
  const { w, step } = attachPage('https://www.familysearch.org/en/tree/sources/attachedTo/TEST-S01', `<h1 data-testid="attach-to-title">${TITLE}</h1>`);
  // the wait for persons runs out at once
  let now = 0;
  w.Date.now = () => (now += 1000);
  const answer = await step('attachedTo', { sourceId: 'TEST-S01' });
  assert.equal(answer.ok, true);
  assert.deepEqual(plain(answer.persons), []);
});

// FS's Edit Source dialog for a row's Edit button: the fields as FS has them, a reason
// for the change, Cancel and Save; `saved` is what Save sent, `cancelled` counts Cancel
function editDialog(page, onFs) {
  const { w } = page;
  const result = { saved: null, cancelled: 0 };
  w.document.addEventListener('click', (e) => {
    const id = (e.target.dataset.testid || '').match(/^row-(.+)-edit-button$/);
    if (!id) return;
    const form = w.document.createElement('form');
    form.innerHTML = '<input data-testid="source-date-field"><input data-testid="source-title-field">' +
      '<input data-testid="source-web-page-field"><textarea data-testid="source-citation-field"></textarea>' +
      '<textarea data-testid="source-notes-field"></textarea><textarea data-testid="source-change-reason-field"></textarea>' +
      '<button type="button" data-testid="source-cancel-button">Cancel</button><button type="button" data-testid="source-save-button">Save</button>';
    const field = (name) => form.querySelector(`[data-testid="source-${name}-field"]`);
    for (const [name, text] of Object.entries(onFs)) field(name).value = text;
    form.querySelector('[data-testid="source-cancel-button"]').addEventListener('click', () => { result.cancelled++; form.remove(); });
    form.querySelector('[data-testid="source-save-button"]').addEventListener('click', () => {
      result.saved = { id: id[1] };
      for (const name of ['date', 'title', 'web-page', 'citation', 'notes', 'change-reason']) result.saved[name] = field(name).value;
      form.remove();
    });
    w.document.body.append(form);
  });
  return result;
}

const ON_FS = { date: '6 April 1846', title: TITLE, 'web-page': 'https://www.digitalarkivet.no/view/255/pd99000000000001', citation: 'Old citation', notes: 'Old notes' };

test('editSource(): writes the linker\'s fields over the source on FS, with a reason', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, ON_FS);
  const answer = await page.step('editSource', { sourceId: 'TEST-S01', reason: 'Updated from the record on Digitalarkivet.',
    source: { date: '6 April 1846', title: TITLE, url: ON_FS['web-page'], citation: 'New citation', notes: 'New notes\nwith two lines' } });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(answer.changed), ['citation', 'notes']);  // the others were the same
  assert.equal(fs.saved.id, 'TEST-S01');
  assert.equal(fs.saved.citation, 'New citation');
  assert.equal(fs.saved.notes, 'New notes\nwith two lines');
  assert.equal(fs.saved.date, '6 April 1846');
  assert.equal(fs.saved['change-reason'], 'Updated from the record on Digitalarkivet.');
});

test('editSource(): an empty field here leaves FS\'s as it is', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, ON_FS);
  const answer = await page.step('editSource', { sourceId: 'TEST-S01', source: { title: TITLE, date: '', url: '', citation: 'New citation', notes: '' } });
  assert.deepEqual(plain(answer.changed), ['citation']);
  assert.equal(fs.saved.notes, 'Old notes');
  assert.equal(fs.saved['web-page'], ON_FS['web-page']);
});

test('editSource(): nothing different is cancelled, not saved', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, { ...ON_FS, notes: 'Old notes\r\n' });  // FS's line ends don't count
  const answer = await page.step('editSource', { sourceId: 'TEST-S01',
    source: { date: ON_FS.date, title: TITLE, url: ON_FS['web-page'], citation: 'Old citation', notes: 'Old notes' } });
  assert.equal(answer.ok, true);
  assert.deepEqual(plain(answer.changed), []);
  assert.equal(fs.saved, null);
  assert.equal(fs.cancelled, 1);
});

test('editSource(): a source Home doesn\'t show is found with the search', async () => {
  const page = sourceBox([['TEST-S04', '1850, Ola Nordmann - Census']], [['TEST-S01', TITLE], ['TEST-S04', '1850, Ola Nordmann - Census']]);
  // the wait for the row on Home runs out at once; the search then has real time
  const realNow = page.w.Date.now;
  let now = realNow();
  page.w.Date.now = () => (now += 1000);
  page.w.document.querySelector('[data-testid="source-box-search-button"]').addEventListener('click', () => { page.w.Date.now = realNow; });
  const fs = editDialog(page, ON_FS);
  const answer = await page.step('editSource', { sourceId: 'TEST-S01', source: { title: TITLE, citation: 'New citation' } });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(fs.saved.id, 'TEST-S01');
});

// --- A new person: FS's Add Person dialog -----------------------------------------
// A made-up person page: the couple's family card with its Add Child; the dialog's form
// (template, names, sex and status, the date and place comboboxes, which suggest a
// standard form of what's typed), Next, then FS's possible matches and Create Person.
const STANDARD = { 'Vågå, Oppland, Norway': 'Vågå, Oppland, Norway Municipality, 1781 - 2019', '16 July 1846': '16 July 1846' };

// FS's fact dialogs' lists: the text as typed first, then the standard forms, a
// place's with its kind and years on a second line
const FS_LISTS = {
  'Vågå': [['Vågå, Innlandet, Norway', 'Municipality, 2020 - Present'], ['Vågå, Oppland, Norway', 'Municipality, 1781 - 2019'],
    ['Vågå, Oplandenes, Norway', 'Municipality, Unknown - 1780'], ['Vågåmo, Vågå, Oppland, Norway', 'Village,']],
  '16 jul 1846': [['16 July 1846']],
};

function personPage({ matches = [], afterCreate = 'card', lists = null } = {}) {
  const page = attachPage('https://www.familysearch.org/en/tree/person/details/TEST-HAL',
    '<section data-testid="section-card-family">' +
    '<div data-testid="family-TEST-HAL_TEST-AST"><div data-testid="couple-persons"><a href="/tree/person/details/TEST-HAL">Halvor Larsen</a>' +
    '<a href="/tree/person/details/TEST-AST">Astri Larsdatter</a></div><button data-testid="add-child">Add Child</button></div>' +
    '<button data-testid="add-spouse">Add Spouse</button><button data-testid="add-parent">Add Parent</button></section>');
  const { w } = page;
  const d = w.document;
  const filled = {};
  const combo = (name, n) => `<input name="${name}" role="combobox" aria-controls="downshift-${n}-menu"><ul id="downshift-${n}-menu"></ul>`;
  d.querySelector('[data-testid="add-child"]').addEventListener('click', () => {
    const dialog = d.createElement('div');
    dialog.setAttribute('data-testid', 'add-find-flow');
    dialog.innerHTML = '<h2>Add Child</h2><select name="template"><option value="en">English</option><option value="no">Norwegian</option></select>' +
      '<input data-testid="first-name"><input data-testid="last-name">' +
      ['male', 'female', 'unknown'].map((v) => `<input type="radio" name="sex" value="${v}">`).join('') +
      ['deceased', 'living'].map((v) => `<input type="radio" name="status" value="${v}">`).join('') +
      combo('birthDate', 1) + combo('birthPlace', 2) + combo('deathDate', 3) + combo('deathPlace', 4) +
      '<div data-testid="find-footer"><button data-testid="cancel-button">Cancel</button><button data-testid="next-button">Next</button></div>';
    d.body.append(dialog);
    dialog.querySelector('select').addEventListener('change', (e) => { filled.template = e.target.value; });
    for (const input of dialog.querySelectorAll('[role="combobox"]')) {
      input.addEventListener('input', () => {
        const list = d.getElementById(input.getAttribute('aria-controls'));
        if (lists) {
          const typed = input.value;
          const forms = lists[typed] || [];
          list.innerHTML = [[typed], ...forms].map(([text, kind], i) =>
            `<li role="option" data-testid="suggestion-${i}"><span>${text}</span>${kind ? `<div>${kind}</div>` : ''}</li>`).join('');
          for (const [i, option] of [...list.querySelectorAll('[role="option"]')].entries()) {
            option.addEventListener('click', () => { input.value = i ? forms[i - 1][0] : typed; list.innerHTML = ''; });
          }
          return;
        }
        const standard = STANDARD[input.value];
        list.innerHTML = standard ? `<li role="option">${standard}</li>` : '';
        const option = list.querySelector('[role="option"]');
        if (option) option.addEventListener('click', () => { input.value = standard; list.innerHTML = ''; });
      });
    }
    dialog.querySelector('[data-testid="cancel-button"]').addEventListener('click', () => { filled.cancelled = true; dialog.remove(); });
    dialog.querySelector('[data-testid="next-button"]').addEventListener('click', () => {
      for (const name of ['first-name', 'last-name']) filled[name] = dialog.querySelector(`[data-testid="${name}"]`).value;
      filled.sex = (dialog.querySelector('input[name="sex"]:checked') || {}).value;
      filled.status = (dialog.querySelector('input[name="status"]:checked') || {}).value;
      for (const name of ['birthDate', 'birthPlace', 'deathDate', 'deathPlace']) filled[name] = dialog.querySelector(`input[name="${name}"]`).value;
      dialog.innerHTML = '<div data-testid="find-results">' + (matches.length ? `<h3>Possible Matches Found (${matches.length})</h3>` +
        matches.map((m) => `<div><div data-testid="person"><span data-testid="fullName">${m.name}</span><span data-testid="lifespan">${m.lifespan}</span>` +
          `<button data-testid="pid">${m.pid}</button><div data-testid="birth-event">Birth ${m.born}</div></div>` +
          `<div data-testid="spouses"><div data-testid="person"><span data-testid="fullName">${m.spouse}</span><button data-testid="pid">TEST-SP1</button></div></div>` +
          '<button data-testid="add-person-match-button">Add Match</button></div>').join('') : '<h3>No Match Found</h3>') +
        '<button data-testid="cancel-button">Cancel</button><button data-testid="create-new-button">Create Person</button></div>';
      dialog.querySelector('[data-testid="cancel-button"]').addEventListener('click', () => { filled.cancelled = true; dialog.remove(); });
      dialog.querySelector('[data-testid="create-new-button"]').addEventListener('click', () => {
        filled.created = true;
        if (afterCreate === 'more') { dialog.innerHTML = '<h3>Add a relationship type</h3><button data-testid="cancel-button">Cancel</button>'; return; }
        setTimeout(() => {
          dialog.remove();
          const child = d.createElement('div');
          child.setAttribute('data-testid', 'child-person');
          child.innerHTML = '<a href="/tree/person/details/TEST-NEW">Lars Halvorsen</a>';
          d.querySelector('[data-testid="family-TEST-HAL_TEST-AST"]').append(child);
        }, 5);
      });
    });
  });
  return { ...page, filled };
}

const LARS = { given: 'Lars', surname: 'Halvorsen', sex: 'male', birthDate: '16 July 1846', birthPlace: 'Vågå, Oppland, Norway', deathDate: '', deathPlace: '' };

test('findPerson(): fills FS\'s Add Child form in the couple\'s card, picks FS\'s standard place, and gives back no match', async () => {
  const { step, filled } = personPage();
  const answer = await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(filled.template, 'no');
  assert.equal(filled['first-name'], 'Lars');
  assert.equal(filled['last-name'], 'Halvorsen');
  assert.equal(filled.sex, 'male');
  assert.equal(filled.status, 'deceased');
  assert.equal(filled.birthDate, '16 July 1846');
  assert.equal(filled.birthPlace, 'Vågå, Oppland, Norway Municipality, 1781 - 2019');
  assert.equal(filled.deathDate, '');
  assert.deepEqual(plain(answer.matches), []);
  const place = answer.fields.find((f) => f.name === 'birthPlace');
  assert.equal(place.picked, 'Vågå, Oppland, Norway Municipality, 1781 - 2019');
  assert.equal(filled.created, undefined, 'nothing is created');
});

test('findPerson(): skips the text as typed and takes the standard place of the record\'s years', async () => {
  const { step, filled } = personPage({ lists: FS_LISTS });
  const person = { ...LARS, birthDate: '16 jul 1846', birthPlace: 'Vågå', deathDate: '1921', deathPlace: 'Vågå' };
  const answer = await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(filled.birthDate, '16 July 1846');
  assert.equal(filled.birthPlace, 'Vågå, Oppland, Norway', 'the municipality of 1781–2019, not the text as typed');
  assert.equal(filled.deathPlace, 'Vågå, Oppland, Norway');
  const later = personPage({ lists: FS_LISTS });
  await later.step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: { ...person, birthDate: '2021', deathDate: '' } });
  assert.equal(later.filled.birthPlace, 'Vågå, Innlandet, Norway', 'from 2020 the place is in Innlandet');
  const undated = personPage({ lists: FS_LISTS });
  await undated.step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: { ...person, birthDate: '', deathDate: '' } });
  assert.equal(undated.filled.birthPlace, 'Vågå, Innlandet, Norway', 'no year: the first standard form');
});

test('findPerson(): FS\'s possible matches, each with PID, lifespan, events and spouses', async () => {
  const { step } = personPage({ matches: [{ name: 'Lars Halvorsen', lifespan: '1846–1920', pid: 'TEST-LA2', born: '16 July 1846', spouse: 'Marte Johanne' }] });
  const answer = await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  assert.deepEqual(plain(answer.matches), [{ pid: 'TEST-LA2', name: 'Lars Halvorsen', lifespan: '1846–1920', events: ['Birth 16 July 1846'], spouses: ['Marte Johanne'] }]);
});

test('findPerson(): only on the tree person\'s page (else sign in)', async () => {
  const { step } = attachPage('https://ident.familysearch.org/en/identity/login', '');
  const answer = await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', person: LARS });
  assert.equal(answer.ok, false);
  assert.match(answer.error, /sign in/);
});

test('createPerson(): the new person\'s PID once FS shows them in the family', async () => {
  const { step, filled } = personPage();
  await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  const answer = await step('createPerson', {});
  assert.equal(filled.created, true);
  assert.deepEqual(plain(answer), { ok: true, pid: 'TEST-NEW' });
});

test('createPerson(): a dialog step it doesn\'t know is left to the user', async () => {
  const { w, step } = personPage({ afterCreate: 'more' });
  await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  let now = 0;
  w.Date.now = () => (now += 1000);  // FS's dialog stays open past the wait
  const answer = await step('createPerson', {});
  assert.equal(answer.ok, false);
  assert.match(answer.error, /asks for more in its dialog .*: Add a relationship type/);
});

test('cancelAdd(): FS\'s dialog cancelled, nothing created', async () => {
  const { step, filled } = personPage();
  await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  assert.equal((await step('cancelAdd', {})).ok, true);
  assert.equal(filled.cancelled, true);
  assert.equal(filled.created, undefined);
});

// A title can belong to two records (a common name, the same year and parish): the
// source on FS is only written over when it names this record's permanent ID
test('editSource(): a source of this title for another record is left as it is', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, ON_FS);  // FS's source is of pd99000000000001
  const answer = await page.step('editSource', { sourceId: 'TEST-S01',
    source: { title: TITLE, url: 'https://www.digitalarkivet.no/view/255/pd99000000000002', citation: 'New citation', notes: 'New notes' } });
  assert.equal(answer.ok, false);
  assert.equal(answer.otherRecord, true);
  assert.equal(answer.other, 'pd99000000000001');
  assert.equal(fs.saved, null);
  assert.equal(fs.cancelled, 1);
});

test('editSource(): without a web page on FS, the permanent ID in its citation counts', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, { ...ON_FS, 'web-page': '',
    citation: 'Digitalarkivet, Permanent ID pd99000000000001 (https://www.digitalarkivet.no/en/pd99000000000001 : accessed 7 November 2026); scanned image kb99000000000009' });
  const answer = await page.step('editSource', { sourceId: 'TEST-S01',
    source: { title: TITLE, url: ON_FS['web-page'], citation: 'New citation' } });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(fs.saved.citation, 'New citation');
});

test('editSource(): a scanned image both records share doesn\'t make them one', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, { ...ON_FS, 'web-page': '',
    citation: 'Digitalarkivet, Permanent ID pd99000000000003; scanned image kb99000000000009 (https://www.digitalarkivet.no/kb99000000000009)' });
  const answer = await page.step('editSource', { sourceId: 'TEST-S01',
    source: { title: TITLE, url: ON_FS['web-page'], citation: 'Digitalarkivet, Permanent ID pd99000000000001; scanned image kb99000000000009' } });
  assert.equal(answer.otherRecord, true);
  assert.equal(fs.saved, null);
});

test('findPerson(): only a PID goes into the page check', async () => {
  const { step } = attachPage('https://www.familysearch.org/en/tree/person/details/TEST-HAL', '');
  const answer = await step('findPerson', { relation: 'child', anchor: '.*', person: LARS });
  assert.equal(answer.ok, false);
  assert.match(answer.error, /Not a FamilySearch PID/);
});
