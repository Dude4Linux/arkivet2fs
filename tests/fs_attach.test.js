// fs_attach.js: the read-only steps (findSource, attachedTo) and editSource on a made-up
// FS page with the data-testids FS uses. No FamilySearch page is saved here: the pages are built in
// the tests, with synthetic TEST-… IDs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./harness.js');

// fs_attach.js on a page at `url`; `step(name, args)` asks it as linker.js does
function attachPage(url, body, { clock = false } = {}) {
  let listener = null;
  const chrome = { runtime: { onMessage: { addListener(fn) { listener = fn; } } } };
  const w = load([], { url, chrome, fast: true });
  // `clock`: the fast timers on a clock that moves on by each timer's whole delay, so a
  // wait timed with Date.now() gives up after as many polls as on FS, not 20 s later
  if (clock) {
    let ahead = 0;
    const fastTimeout = w.setTimeout;
    w.setTimeout = (fn, ms, ...args) => fastTimeout(() => { ahead += Number(ms) || 0; fn(...args); }, ms);
    const now = w.Date.now.bind(w.Date);
    w.Date.now = () => now() + ahead;
  }
  w.document.body.innerHTML = body;
  w.runFile('fs_attach.js');
  const step = (name, args) => new Promise((resolve) => listener({ linker: name, args }, {}, resolve));
  // The listener's own answer: true when it will answer (a step), false when not
  const takes = (request) => listener(request, {}, () => {});
  return { w, step, takes };
}

// A row as FS shows it: a dated source's title with the date's year in front, and the
// date in a box of its own
const row = (id, title, date) => `<div><span data-testid="row-${id}-title">${date ? date.slice(-4) + ', ' : ''}${title}</span>` +
  (date ? `<div data-testid="row-${id}-date"><strong>Source Date</strong><br>${date}</div>` : '') +
  `<button data-testid="row-${id}-attach-button">Attach</button><button data-testid="row-${id}-edit-button">Edit</button></div>`;
const TITLE = 'Lars, son of Halvor Larsen - Vågå parish 1842-1856 (0515P), Ministerialbok A-13 - Birth';

// The SourceBox: Home shows a few rows; Search shows every source whose title has the
// text, after the list has been empty a moment (loading), or "No sources found."
function sourceBox(home, all) {
  const page = attachPage('https://www.familysearch.org/en/tree/sources/sourceBox',
    '<input data-testid="source-box-filter-field"><button data-testid="source-box-search-button">Search</button><div id="list"></div>');
  const { w } = page;
  const list = w.document.getElementById('list');
  list.innerHTML = home.map(([id, title, date]) => row(id, title, date)).join('');
  w.document.querySelector('[data-testid="source-box-search-button"]').addEventListener('click', () => {
    const text = w.document.querySelector('[data-testid="source-box-filter-field"]').value;
    list.innerHTML = '';
    setTimeout(() => {
      const hits = all.filter(([, title]) => title.includes(text));
      list.innerHTML = hits.length ? hits.map(([id, title, date]) => row(id, title, date)).join('') : '<p>No sources found.</p>';
    }, 400);
  });
  return page;
}

test('findSource(): the sources of exactly that title, in any folder', async () => {
  const all = [['TEST-S01', TITLE], ['TEST-S02', TITLE + ' (copy)'], ['TEST-S03', TITLE], ['TEST-S04', 'Ola Nordmann - Vågå - "Norway, Census, 1850"']];
  const { step } = sourceBox([['TEST-S04', all[3][1]]], all);
  const answer = await step('findSource', { title: '  ' + TITLE + ' ' });
  assert.equal(answer.ok, true);
  assert.deepEqual(plain(answer.sources.map((s) => s.id)), ['TEST-S01', 'TEST-S03']);
});

test('findSource(): with none of the title, a source under an older title holding it (one made before 1.6.0); the title first', async () => {
  const older = '1846, ' + TITLE;
  const { step } = sourceBox([], [['TEST-S01', older], ['TEST-S02', older + ' (copy)']]);
  const answer = await step('findSource', { title: TITLE, older: [older] });
  assert.deepEqual(plain(answer.sources.map((s) => s.id)), ['TEST-S01']);
  assert.equal(answer.title, older);
  const both = sourceBox([], [['TEST-S01', older], ['TEST-S03', TITLE]]);
  const first = await both.step('findSource', { title: TITLE, older: [older] });
  assert.deepEqual(plain(first.sources.map((s) => s.id)), ['TEST-S03']);
  assert.equal(first.title, TITLE);
});

test('findSource(): a dated source, which FS lists with the date\'s year in front of the title, is found by its title', async () => {
  const all = [['TEST-S01', TITLE, '27 June 1846'], ['TEST-S02', TITLE, '1846'], ['TEST-S03', TITLE + ' (copy)', '1846']];
  const { step } = sourceBox([], all);
  const answer = await step('findSource', { title: TITLE, older: ['1846, ' + TITLE] });
  assert.deepEqual(plain(answer.sources.map((s) => s.id)), ['TEST-S01', 'TEST-S02']);
  assert.equal(answer.title, TITLE);
  // a source made before 1.6.0 with a date: "1846, 1846, <title>" in the list, its title "1846, <title>"
  const old = sourceBox([], [['TEST-S04', '1846, ' + TITLE, '1846']]);
  const former = await old.step('findSource', { title: TITLE, older: ['1846, ' + TITLE] });
  assert.deepEqual(plain(former.sources.map((s) => s.id)), ['TEST-S04']);
  assert.equal(former.title, '1846, ' + TITLE);
  // a year in front that isn't the date's is the title's own
  const other = sourceBox([], [['TEST-S05', '1846, ' + TITLE, '1850']]);
  assert.equal((await other.step('findSource', { title: TITLE, older: ['1846, ' + TITLE] })).title, '1846, ' + TITLE);
});

test('findSource(): Home\'s rows coming in after the search was clicked aren\'t taken for its hits', async () => {
  const page = attachPage('https://www.familysearch.org/en/tree/sources/sourceBox',
    '<input data-testid="source-box-filter-field"><button data-testid="source-box-search-button">Search</button><div id="list"></div>');
  const list = page.w.document.getElementById('list');
  page.w.document.querySelector('[data-testid="source-box-search-button"]').addEventListener('click', () => {
    setTimeout(() => { list.innerHTML = row('TEST-S04', 'Ola Nordmann - Vågå - "Norway, Census, 1850"'); }, 100);
    setTimeout(() => { list.innerHTML = row('TEST-S01', TITLE, '1846'); }, 1500);
  });
  const answer = await page.step('findSource', { title: TITLE });
  assert.deepEqual(plain(answer.sources.map((s) => s.id)), ['TEST-S01']);
});

test('findSource(): none when the search finds nothing', async () => {
  const { step } = sourceBox([['TEST-S04', 'Ola Nordmann - Vågå - "Norway, Census, 1850"']], [['TEST-S04', 'Ola Nordmann - Vågå - "Norway, Census, 1850"']]);
  assert.deepEqual(plain((await step('findSource', { title: TITLE })).sources), []);
});

test('findSource(): only on the SourceBox (else sign in)', async () => {
  const { step } = attachPage('https://ident.familysearch.org/en/identity/login', '');
  const answer = await step('findSource', { title: TITLE });
  assert.equal(answer.ok, false);
  assert.match(answer.error, /sign in/);
});

test('findSource(): FS\'s security service blocking the page is said at once, with its error code and incident ID', async () => {
  // Imperva's block page: at the address asked for, only an iframe of its resource
  const frame = '<iframe id="main-iframe" src="/_Incapsula_Resource?CWUDNSAI=9&amp;incident_id=TEST-0000-0001&amp;edet=15&amp;cinfo=0">Request unsuccessful.</iframe>';
  const { step } = attachPage('https://www.familysearch.org/en/tree/sources/sourceBox', frame, { clock: true });
  const answer = await step('findSource', { title: TITLE });
  assert.equal(answer.ok, false);
  assert.equal(answer.blocked, true);
  assert.equal(answer.error, "FamilySearch's security service blocked the page (error 15, incident ID TEST-0000-0001). " +
    'Open FamilySearch in this browser to see why; its page says what to do.');
  // without the codes, said all the same; a page without FS's search otherwise only times out
  const bare = attachPage('https://www.familysearch.org/en/tree/sources/sourceBox', '<iframe src="/_Incapsula_Resource?x=1"></iframe>', { clock: true });
  assert.match((await bare.step('findSource', { title: TITLE })).error, /^FamilySearch's security service blocked the page\. Open/);
  const empty = attachPage('https://www.familysearch.org/en/tree/sources/sourceBox', '<p></p>', { clock: true });
  const late = await empty.step('findSource', { title: TITLE });
  assert.equal(late.blocked, undefined);
  assert.match(late.error, /did not show .* in time/);
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
// With `combo`, the date is FS's combobox (seen 2026-11-12): typing lists the standard
// form as a suggestion, and only a date picked from it is saved
function editDialog(page, onFs, combo) {
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
    let picked = onFs.date || '';
    if (combo) {
      const date = field('date');
      date.setAttribute('role', 'combobox');
      date.setAttribute('aria-controls', 'date-menu');
      const menu = w.document.createElement('ul');
      menu.id = 'date-menu';
      form.append(menu);
      date.addEventListener('input', () => {
        menu.innerHTML = `<li role="option" data-testid="suggestion-0">${date.value}</li>`;
        menu.firstChild.addEventListener('click', () => { picked = date.value; menu.innerHTML = ''; });
      });
    }
    form.querySelector('[data-testid="source-cancel-button"]').addEventListener('click', () => { result.cancelled++; form.remove(); });
    form.querySelector('[data-testid="source-save-button"]').addEventListener('click', () => {
      result.saved = { id: id[1] };
      for (const name of ['date', 'title', 'web-page', 'citation', 'notes', 'change-reason']) result.saved[name] = field(name).value;
      if (combo) result.saved.date = picked;
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

test('editSource(): the date is picked from FS\'s suggestions, so FS keeps it (bug: a typed date was saved as none)', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, { ...ON_FS, date: '' }, true);
  const answer = await page.step('editSource', { sourceId: 'TEST-S01',
    source: { date: '23 August 1846', title: TITLE, url: ON_FS['web-page'], citation: 'Old citation', notes: 'Old notes' } });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(answer.changed), ['date']);
  assert.equal(fs.saved.date, '23 August 1846');
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

test('editSource(): a citation differing only in the day it was accessed is not written again', async () => {
  const cite = (day) => 'Norway, Oppland, Vågå, "Vågå parish 1842-1856", baptisms; database, National Archives of Norway, Digitalarkivet, ' +
    'Permanent ID pd99000000000001 (https://www.digitalarkivet.no/view/255/pd99000000000001 : accessed ' + day + ').';
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, { ...ON_FS, citation: cite('2 November 2026') });
  const answer = await page.step('editSource', { sourceId: 'TEST-S01',
    source: { date: ON_FS.date, title: TITLE, url: ON_FS['web-page'], citation: cite('11 November 2026'), notes: 'Old notes' } });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(answer.changed), []);
  assert.equal(fs.saved, null);
  // another change in it is written, with today's day
  const page2 = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs2 = editDialog(page2, { ...ON_FS, citation: cite('2 November 2026') });
  const changed = cite('11 November 2026').replace('baptisms', 'Baptisms');
  const answer2 = await page2.step('editSource', { sourceId: 'TEST-S01',
    source: { date: ON_FS.date, title: TITLE, url: ON_FS['web-page'], citation: changed, notes: 'Old notes' } });
  assert.deepEqual(plain(answer2.changed), ['citation']);
  assert.equal(fs2.saved.citation, changed);
});

test('editSource() with read: FS\'s fields, cancelled, nothing written', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, { ...ON_FS, notes: 'Old notes\r\nline two' });
  const answer = await page.step('editSource', { sourceId: 'TEST-S01', read: true,
    source: { title: TITLE, url: ON_FS['web-page'], citation: 'New citation', notes: 'New notes' } });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(answer.fields), { date: ON_FS.date, title: TITLE, url: ON_FS['web-page'], citation: 'Old citation', notes: 'Old notes\nline two' });
  assert.equal(fs.saved, null);
  assert.equal(fs.cancelled, 1);
});

test('editSource(): a source Home doesn\'t show is found with the search', async () => {
  const page = sourceBox([['TEST-S04', 'Ola Nordmann - Vågå - "Norway, Census, 1850"']], [['TEST-S01', TITLE], ['TEST-S04', 'Ola Nordmann - Vågå - "Norway, Census, 1850"']]);
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

// `children`: PIDs the couple's card shows as their children already
function personPage({ matches = [], afterCreate = 'card', lists = null, children = [] } = {}) {
  const page = attachPage('https://www.familysearch.org/en/tree/person/details/TEST-HAL',
    '<section data-testid="section-card-family">' +
    '<div data-testid="family-TEST-HAL_TEST-AST"><div data-testid="couple-persons"><a href="/tree/person/details/TEST-HAL">Halvor Larsen</a>' +
    '<a href="/tree/person/details/TEST-AST">Astri Larsdatter</a></div>' +
    children.map((pid) => `<div data-testid="child-person"><a href="/tree/person/details/${pid}">Lars Halvorsen</a></div>`).join('') +
    '<button data-testid="add-child">Add Child</button></div>' +
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
            option.addEventListener('click', () => { input.value = i ? forms[i - 1][0] : typed; list.innerHTML = ''; dirty(); });
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
          (m.bare ? '</div>' : `<button data-testid="pid">${m.pid}</button><div data-testid="birth-event">Birth ${m.born}</div></div>` +
          `<div data-testid="spouses"><div data-testid="person"><span data-testid="fullName">${m.spouse}</span><button data-testid="pid">TEST-SP1</button></div></div>`) +
          '<button data-testid="add-person-match-button">Add Match</button></div>').join('') : '<h3>No Match Found</h3>') +
        '<button data-testid="cancel-button">Cancel</button><button data-testid="create-new-button">Create Person</button></div>';
      dialog.querySelector('[data-testid="cancel-button"]').addEventListener('click', () => { filled.cancelled = true; dialog.remove(); });
      // Add Match: FS links that person as the couple's child
      for (const [i, button] of [...dialog.querySelectorAll('[data-testid="add-person-match-button"]')].entries()) {
        button.addEventListener('click', () => {
          filled.matched = matches[i].pid;
          setTimeout(() => {
            dialog.remove();
            const child = d.createElement('div');
            child.setAttribute('data-testid', 'child-person');
            child.innerHTML = `<a href="/tree/person/details/${matches[i].pid}">${matches[i].name}</a>`;
            d.querySelector('[data-testid="family-TEST-HAL_TEST-AST"]').append(child);
          }, 5);
        });
      }
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

const MATCHES = [
  { name: 'Ole Halvorsen', lifespan: '1844–1900', pid: 'TEST-OL2', born: '1844', spouse: 'Kari' },
  { name: 'Lars Halvorsen', lifespan: '1846–1920', pid: 'TEST-LA2', born: '16 July 1846', spouse: 'Marte Johanne' }];

test('addMatch(): the match\'s Add Match links them as the couple\'s child; that one, not another', async () => {
  const { step, filled } = personPage({ matches: MATCHES });
  await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  const answer = await step('addMatch', { pid: 'TEST-LA2', relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST' });
  assert.deepEqual(plain(answer), { ok: true, linked: true });
  assert.equal(filled.matched, 'TEST-LA2');
  assert.equal(filled.created, undefined);
});

test('addMatch(): a child the couple\'s card has already: FS\'s dialog cancelled, nothing linked', async () => {
  const { step, filled } = personPage({ matches: MATCHES, children: ['TEST-LA2'] });
  await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  const answer = await step('addMatch', { pid: 'TEST-LA2', relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST' });
  assert.deepEqual(plain(answer), { ok: true, already: true });
  assert.equal(filled.matched, undefined);
  assert.equal(filled.cancelled, true);
});

test('addMatch(): a PID FS doesn\'t list among its matches is not added', async () => {
  const { step, filled } = personPage({ matches: MATCHES });
  await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  const answer = await step('addMatch', { pid: 'TEST-SP1', relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST' });  // a match's spouse
  assert.equal(answer.ok, false);
  assert.match(answer.error, /no longer lists this person/);
  assert.equal(filled.matched, undefined);
});

test('addMatch(): a match box FS shows without a PID is never taken for another match\'s', async () => {
  // Ole's box names no PID: looking up from his button reaches the list that holds
  // Lars's PID too, and his button must not count as Lars's
  const { step, filled } = personPage({ matches: [{ ...MATCHES[0], bare: true }, MATCHES[1]] });
  const found = await step('findPerson', { relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST', person: LARS });
  assert.deepEqual(plain(found.matches.map((m) => m.pid)), ['TEST-LA2']);
  const answer = await step('addMatch', { pid: 'TEST-LA2', relation: 'child', anchor: 'TEST-HAL', other: 'TEST-AST' });
  assert.deepEqual(plain(answer), { ok: true, linked: true });
  assert.equal(filled.matched, 'TEST-LA2');
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

test('editSource(): a source made from another person\'s entry of the record (the bride\'s of a marriage) is this record\'s (bug: taken for another)', async () => {
  const page = sourceBox([['TEST-S01', TITLE]], [['TEST-S01', TITLE]]);
  const fs = editDialog(page, ON_FS);  // FS's source is of pd99000000000001
  const answer = await page.step('editSource', { sourceId: 'TEST-S01', sameRecord: ['pd99000000000002', 'pd99000000000001'],
    source: { title: TITLE, url: 'https://www.digitalarkivet.no/view/255/pd99000000000002', citation: 'New citation', notes: 'New notes' } });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(fs.saved.citation, 'New citation');
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

// --- The record's facts added to the tree person: FS's fact form --------------------
// A made-up person page: a birth (with its pencil), the missing christening's add
// button, Add Alternate Name, Add Event's menu. The form (`conclusion-dialog`): the
// fields by name, date and place comboboxes that list the text as typed first, then
// the standard forms; Save adds the fact to the page, Cancel leaves it as it was. A
// fact's pencil opens its view: Edit, Close, Tag Sources (the person's sources by
// SourceBox ID, each with a preview's Tag To). `birthSources` false: the birth has no
// sources, and its pencil opens the form itself, whose Cancel doesn't close it (its
// Close does), as FS has it. `late`: FS's list for the typed text comes 100 ms after
// the list for the field's old value (with the text as typed first).
const FACT_LISTS = {
  'Vågå, Oppland, Norway': FS_LISTS['Vågå'], '23 August 1846': [['23 August 1846']], '1846': [['1846']],
  // As FS lists a farm it doesn't know: the municipality, and farms of a like name elsewhere
  'Bakken nedre, Vågå, Oppland, Norway': [['Vågå, Oppland, Norway', 'Municipality, 1781 - 2019'], ['Bakken, Oppland, Norway', 'Populated Place,'],
    ['Bakkom, Gausdal, Kristians, Norway', 'Farm, 1781 - 1879</div><div>Alternate Name: Bakken']],
  'Bakken, Vågå, Oppland, Norway': [['Bakkom, Gausdal, Kristians, Norway', 'Farm, 1781 - 1879</div><div>Alternate Name: Bakken'],
    ['Bakken, Vågå, Oppland, Norway', 'Farm, 1781 - 2019']],
  // A residence on a town's land named after another municipality: FS offers that municipality
  'Lom, byens grund, Vågå, Oppland, Norway': [['Lom, Oppland, Norway', 'Municipality, 1781 - 2019'],
    ['Lom, Lom, Oppland, Norway', 'Farm, 1781 - 2019']]
};

// `saveOff`: Save off while the date and place are what the form opened with (FS's
// edit form, 2026-11-09); `stuck`: Save does nothing
function factPage({ sources = ['TEST-S01'], birthSources = true, late = false, saveOff = false, stuck = false } = {}) {
  const page = attachPage('https://www.familysearch.org/en/tree/person/details/TEST-LAR',
    '<div id="vitals"><div data-testid="conclusionDisplay:BIRTH"><div data-testid="conclusion-body"><span data-testid="conclusion-date">1846</span> ' +
    '<span data-testid="conclusion-place">Norway</span></div><button data-testid="pencil-edit-button">Edit</button></div>' +
    '<div data-testid="highlight-CHRISTENING"><button data-testid="conclusion:add:button">Add Christening</button></div></div>' +
    '<button data-testid="add-alternate-name">Add</button><button data-testid="add-new-otherEvent-button">Add Event</button><div id="events"></div>', { clock: true });
  const { w } = page;
  const d = w.document;
  const saved = [], tagged = [], log = [];
  let n = 0;
  // FS wraps each field in a div of the field's name (seen on the Residence form, 2026-11-09)
  const combo = (name, value) => `<div name="${name}"><input name="${name}" data-testid="conclusionDetailOverlay:${name}" role="combobox" aria-controls="list-${++n}" value="${value || ''}"><ul id="list-${n}"></ul></div>`;
  const text = (name, value) => `<div name="${name}"><input name="${name}" data-testid="conclusionDetailOverlay:${name}" value="${value || ''}"></div>`;
  const display = (type, body) => {
    const el = d.createElement('div');
    el.setAttribute('data-testid', 'conclusionDisplay:' + type);
    el.innerHTML = `<div data-testid="conclusion-body">${body}</div><button data-testid="pencil-edit-button">Edit</button>`;
    el.querySelector('[data-testid="pencil-edit-button"]').addEventListener('click', () => openView(type, el));
    return el;
  };
  function dialog(html) {
    const box = d.createElement('div');
    box.setAttribute('role', 'dialog');
    box.innerHTML = `<div data-testid="conclusion-dialog">${html}</div>`;
    d.body.append(box);
    return box;
  }
  // The form; on Save `onSave(values)`
  function openForm(type, fieldsHtml, onSave, onCancel, direct = false) {
    const box = dialog((direct ? '<button aria-label="Close">×</button>' : '') + '<div data-testid="conclusionDetailOverlay:addEditConclusion">' + fieldsHtml +
      '<textarea name="justification" data-testid="conclusionDetailOverlay:reason"></textarea>' +
      '<button data-testid="add-edit:cancel-action">Cancel</button><button data-testid="conclusionDetailOverlay:submit:button">Save</button></div>');
    for (const input of box.querySelectorAll('[role="combobox"]')) {
      let old = input.value;
      const show = (typed, forms) => {
        const list = d.getElementById(input.getAttribute('aria-controls'));
        list.innerHTML = [[typed], ...forms].map(([t, kind]) => `<li role="option"><span>${t}</span>${kind ? `<div>${kind}</div>` : ''}</li>`).join('');
        for (const [i, option] of [...list.querySelectorAll('[role="option"]')].entries()) {
          option.addEventListener('click', () => { input.value = i ? forms[i - 1][0] : typed; list.innerHTML = ''; dirty(); });
        }
      };
      input.addEventListener('input', () => {
        const typed = input.value;
        if (late) {
          // The old value's places (a church in Lom) under the text as typed, at first
          show(typed, old ? (FACT_LISTS[old] || [['Lom stavkirke, Lom, Oppland, Norway', 'Place of Worship, 1158 - Present']]) : []);
          w.setTimeout(() => show(typed, FACT_LISTS[typed] || []), 100);
        } else show(typed, FACT_LISTS[typed] || []);
        old = typed;
        dirty();
      });
    }
    const values = () => Object.fromEntries([...box.querySelectorAll('input[name], textarea[name], select[name]')].map((i) => [i.name, i.value]));
    const submit = box.querySelector('[data-testid="conclusionDetailOverlay:submit:button"]');
    const opened = JSON.stringify([values().date, values().place]);
    function dirty() { if (saveOff) submit.disabled = JSON.stringify([values().date, values().place]) === opened; }
    dirty();
    box.querySelector('[data-testid="add-edit:cancel-action"]').addEventListener('click', () => {
      log.push('cancel ' + type);
      if (direct) return;
      box.remove();
      if (onCancel) onCancel();
    });
    if (direct) box.querySelector('[aria-label="Close"]').addEventListener('click', () => { log.push('close ' + type); box.remove(); });
    submit.addEventListener('click', () => {
      if (stuck || submit.disabled) return;
      const v = values();
      saved.push({ type, ...v });
      box.remove();
      onSave(v);
    });
  }
  function openView(type, el) {
    const box = dialog('<button aria-label="Close">×</button><button data-testid="ConclusionDialog:edit:button">Edit</button><button>Tag Sources</button>');
    box.querySelector('[aria-label="Close"]').addEventListener('click', () => { log.push('close ' + type); box.remove(); });
    box.querySelector('[data-testid="ConclusionDialog:edit:button"]').addEventListener('click', () => {
      box.remove();
      openForm(type, combo('date', el.querySelector('[data-testid="conclusion-date"]').textContent) + combo('place', el.querySelector('[data-testid="conclusion-place"]').textContent),
        (v) => { el.querySelector('[data-testid="conclusion-date"]').textContent = v.date; el.querySelector('[data-testid="conclusion-place"]').textContent = v.place; openView(type, el); },
        () => openView(type, el));
    });
    [...box.querySelectorAll('button')].find((b) => b.textContent === 'Tag Sources').addEventListener('click', () => {
      const list = d.createElement('div');
      list.innerHTML = sources.map((id) => `<div role="button" name="${id}" aria-label="A source">A source</div>`).join('') +
        '<button data-testid="restore-source-cancel-button">Close</button>';
      d.body.append(list);
      list.querySelector('[data-testid="restore-source-cancel-button"]').addEventListener('click', () => list.remove());
      for (const item of list.querySelectorAll('[role="button"]')) {
        item.addEventListener('click', () => {
          list.innerHTML = '<button data-testid="source-view-tag-button">Tag To</button><button data-testid="source-view-close-button">Close</button>';
          list.querySelector('[data-testid="source-view-tag-button"]').addEventListener('click', () => { tagged.push({ type, source: item.getAttribute('name'), fact: el.textContent }); list.remove(); });
        });
      }
    });
  }
  const birth = d.querySelector('[data-testid="conclusionDisplay:BIRTH"]');
  birth.querySelector('[data-testid="pencil-edit-button"]').addEventListener('click', () => {
    if (birthSources) return openView('BIRTH', birth);
    openForm('BIRTH', combo('date', birth.querySelector('[data-testid="conclusion-date"]').textContent) + combo('place', birth.querySelector('[data-testid="conclusion-place"]').textContent),
      (v) => { birth.querySelector('[data-testid="conclusion-date"]').textContent = v.date; birth.querySelector('[data-testid="conclusion-place"]').textContent = v.place; },
      null, true);
  });
  d.querySelector('[data-testid="conclusion:add:button"]').addEventListener('click', () => {
    openForm('CHRISTENING', combo('date') + combo('place'), (v) => {
      const slot = d.querySelector('[data-testid="highlight-CHRISTENING"]');
      slot.replaceWith(display('CHRISTENING', `<span data-testid="conclusion-date">${v.date}</span> <span data-testid="conclusion-place">${v.place}</span>`));
    });
  });
  d.querySelector('[data-testid="add-alternate-name"]').addEventListener('click', () => {
    openForm('ALTERNATE_NAME', '<select name="nameType"><option value="BIRTH">Birth Name</option><option value="AKA">Also Known As</option></select>' +
      '<select name="template"><option value="en">English</option><option value="no">Norwegian</option></select>' +
      '<input name="nameTemplate.no.firstName" data-testid="first-name"><input name="nameTemplate.no.lastName" data-testid="last-name">',
    (v) => d.getElementById('events').append(display('ALTERNATE_NAME', '<span data-testid="conclusion-name-type">Also Known As</span>' +
      `<span data-testid="conclusion-name-template">${v['nameTemplate.no.firstName']} ${v['nameTemplate.no.lastName']}</span>`)));
  });
  d.querySelector('[data-testid="add-new-otherEvent-button"]').addEventListener('click', () => {
    const menu = d.createElement('div');
    menu.setAttribute('role', 'menu');
    const types = { Residence: 'RESIDENCE', Occupation: 'OCCUPATION', Immigration: 'IMMIGRATION', 'Custom Event': 'OTHER_EVENT' };
    menu.innerHTML = Object.keys(types).map((label) => `<div role="menuitem">${label}</div>`).join('');
    d.body.append(menu);
    for (const item of menu.children) {
      item.addEventListener('click', () => {
        menu.remove();
        const type = types[item.textContent];
        openForm(type, (type === 'OTHER_EVENT' ? text('title') : '') + text('description') + combo('date') + combo('place'), (v) =>
          d.getElementById('events').append(display(type, [v.title, v.description, v.date, v.place].filter(Boolean).join(' '))));
      });
    }
  });
  return { ...page, saved, tagged, log };
}

const CHRISTENING = { fact: 'Christening', action: 'add', type: 'CHRISTENING', value: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } };
const REASON = 'From "Lars Halvorsen - Vågå - Birth", Digitalarkivet, Permanent ID pd99000000000001.';

test('addFact(): prepared, a missing christening is filled with FS\'s standard place, then cancelled: nothing saved', async () => {
  const { step, saved, log } = factPage();
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: CHRISTENING, reason: REASON, save: false });
  assert.equal(answer.ok, true, answer.error);
  const place = answer.fields.find((f) => f.name === 'place');
  assert.equal(place.value, 'Vågå, Oppland, Norway');
  assert.match(place.picked, /^Vågå, Oppland, Norway ?Municipality, 1781 - 2019$/);
  assert.deepEqual(saved, []);
  assert.deepEqual(log, ['cancel CHRISTENING']);
});

test('addFact(): saved, the christening with its date, place and reason, and how FS shows it', async () => {
  const { step, saved } = factPage();
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: CHRISTENING, reason: REASON, save: true });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(saved), [{ type: 'CHRISTENING', date: '23 August 1846', place: 'Vågå, Oppland, Norway', justification: REASON }]);
  assert.match(answer.shown, /^23 August 1846 Vågå, Oppland, Norway/);
});

test('addFact(): a birth changed through its view\'s Edit, the view closed after', async () => {
  const { step, saved, log, w } = factPage();
  const birth = { fact: 'Birth', action: 'edit', type: 'BIRTH', value: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } };
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: true });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(saved[0].type, 'BIRTH');
  assert.equal(saved[0].date, '23 August 1846');
  assert.equal(saved[0].place, 'Vågå, Oppland, Norway');
  assert.deepEqual(log, ['close BIRTH']);
  assert.equal(w.document.querySelector('[data-testid="conclusion-dialog"]'), null);
});

test('addFact(): an add of a vital FS has with neither date nor place (an old import\'s "Deceased") fills that one in', async () => {
  const { step, saved, w } = factPage({ birthSources: false });
  const shown = w.document.querySelector('[data-testid="conclusionDisplay:BIRTH"]');
  shown.querySelector('[data-testid="conclusion-date"]').textContent = '';
  shown.querySelector('[data-testid="conclusion-place"]').textContent = '';
  const birth = { fact: 'Birth', action: 'add', type: 'BIRTH', value: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } };
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: true });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual([saved[0].type, saved[0].date], ['BIRTH', '23 August 1846']);
  // one with a date is not written over by an add
  const page = factPage();
  const refused = await page.step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: true });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /already has a birth/);
});

test('addFact(): an edit FS has already (Save stays off: an earlier run saved it) is cancelled and answered as unchanged', async () => {
  const { step, saved, log, w } = factPage({ saveOff: true });
  const birth = { fact: 'Birth', action: 'edit', type: 'BIRTH', value: { date: '1846', place: 'Norway' } };
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: true });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(answer.unchanged, true);
  assert.deepEqual(saved, []);
  assert.deepEqual(log, ['cancel BIRTH', 'close BIRTH']);
  assert.equal(w.document.querySelector('[data-testid="conclusion-dialog"]'), null);  // no form left open
  // A real change turns Save on and is saved
  const changed = await step('addFact', { pid: 'TEST-LAR', addition: { ...birth, value: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } }, reason: REASON, save: true });
  assert.equal(changed.ok, true, changed.error);
  assert.equal(changed.unchanged, undefined);
  assert.equal(saved[0].date, '23 August 1846');
});

test('addFact(): a form FS doesn\'t close after Save is cancelled, not left open, and the step fails', async () => {
  const { step, saved, log, w } = factPage({ stuck: true });
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: CHRISTENING, reason: REASON, save: true });
  assert.equal(answer.ok, false);
  assert.equal(answer.error, 'FamilySearch did not save the christening.');
  assert.deepEqual(saved, []);
  assert.deepEqual(log, ['cancel CHRISTENING']);
  assert.equal(w.document.querySelector('[data-testid="conclusion-dialog"]'), null);
});

test('addFact(): an alternate name (Also Known As, Norway\'s template) and an emigration as a custom event', async () => {
  const { step, saved } = factPage();
  const name = { fact: 'Name', action: 'name', type: 'ALTERNATE_NAME', value: { given: 'Lars', surname: 'Halvorsøn', nameType: 'AKA' } };
  assert.equal((await step('addFact', { pid: 'TEST-LAR', addition: name, reason: REASON, save: true })).ok, true);
  assert.deepEqual(plain(saved[0]), { type: 'ALTERNATE_NAME', nameType: 'AKA', template: 'no', 'nameTemplate.no.firstName': 'Lars', 'nameTemplate.no.lastName': 'Halvorsøn', justification: REASON });
  const emigration = { fact: 'Emigration', action: 'add', type: 'OTHER_EVENT', title: 'Emigration', value: { date: '1846', place: 'Vågå, Oppland, Norway', description: 'Destination: Minnesota' } };
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: emigration, reason: REASON, save: true });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(saved[1]), { type: 'OTHER_EVENT', title: 'Emigration', description: 'Destination: Minnesota', date: '1846', place: 'Vågå, Oppland, Norway', justification: REASON });
});

test('addFact(): a farm\'s place stays as typed unless FS has that farm in that municipality', async () => {
  const { step, saved } = factPage();
  const residence = (place) => ({ fact: 'Residence', action: 'add', type: 'RESIDENCE', value: { date: '1846', place, description: 'Bakken' } });
  const unknown = await step('addFact', { pid: 'TEST-LAR', addition: residence('Bakken nedre, Vågå, Oppland, Norway'), reason: REASON, save: false });
  assert.deepEqual(plain(unknown.fields.find((f) => f.name === 'place')), { name: 'place', value: 'Bakken nedre, Vågå, Oppland, Norway', picked: '' });
  const known = await step('addFact', { pid: 'TEST-LAR', addition: residence('Bakken, Vågå, Oppland, Norway'), reason: REASON, save: true });
  assert.equal(known.ok, true, known.error);
  assert.equal(saved[0].place, 'Bakken, Vågå, Oppland, Norway');
  assert.match(known.fields.find((f) => f.name === 'place').picked, /Farm, 1781 - 2019/, 'the farm in Vågå, not Bakkom in Gausdal');
});

test('addFact(): a place below a municipality is never taken for the municipality (or a farm elsewhere) of its first word', async () => {
  const { step } = factPage();
  const residence = { fact: 'Residence', action: 'add', type: 'RESIDENCE', value: { date: '1840', place: 'Lom, byens grund, Vågå, Oppland, Norway', description: 'Lom, byens grund' } };
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: residence, reason: REASON, save: false });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(answer.fields.find((f) => f.name === 'place')), { name: 'place', value: 'Lom, byens grund, Vågå, Oppland, Norway', picked: '' });
});

test('addFact(): a residence, its fields inside divs of the same name, as FS has them', async () => {
  const { step, saved } = factPage();
  const residence = { fact: 'Residence', action: 'add', type: 'RESIDENCE', value: { date: '1846', place: 'Vågå, Oppland, Norway', description: 'Nordgard' } };
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: residence, reason: REASON, save: true });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(saved[0]), { type: 'RESIDENCE', description: 'Nordgard', date: '1846', place: 'Vågå, Oppland, Norway', justification: REASON });
});

test('addFact(): a vital FS has already is not added a second time; only on the person\'s page', async () => {
  const { step, saved } = factPage();
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: { ...CHRISTENING, type: 'BIRTH' }, reason: REASON, save: true });
  assert.equal(answer.ok, false);
  assert.match(answer.error, /already has a birth/);
  assert.deepEqual(saved, []);
  const other = await step('addFact', { pid: 'TEST-HAL', addition: CHRISTENING, reason: REASON, save: true });
  assert.match(other.error, /sign in/);
});

test('tagFact(): the source tagged to the fact from its view, by the source\'s ID', async () => {
  const { step, tagged, w } = factPage();
  await step('addFact', { pid: 'TEST-LAR', addition: CHRISTENING, reason: REASON, save: true });
  const answer = await step('tagFact', { pid: 'TEST-LAR', type: 'CHRISTENING', match: ['23 August 1846'], sourceId: 'TEST-S01' });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(tagged.map((t) => [t.type, t.source])), [['CHRISTENING', 'TEST-S01']]);
  assert.equal(w.document.querySelector('[data-testid="conclusion-dialog"]'), null);
  const missing = await step('tagFact', { pid: 'TEST-LAR', type: 'CHRISTENING', sourceId: 'TEST-S09' });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not among the person's sources/);
});

test('tagFact(): of several residences, the one of the year; none told apart: not tagged, an error, nothing left open', async () => {
  const { step, tagged, w } = factPage();
  // FS's display without the description (the farm): only the year tells them apart
  const residence = (date, place) => ({ fact: 'Residence', action: 'add', type: 'RESIDENCE', value: { date, place } });
  await step('addFact', { pid: 'TEST-LAR', addition: residence('1846', 'Vågå, Oppland, Norway'), reason: REASON, save: true });
  await step('addFact', { pid: 'TEST-LAR', addition: residence('1865', 'Lom, Oppland, Norway'), reason: REASON, save: true });
  const answer = await step('tagFact', { pid: 'TEST-LAR', type: 'RESIDENCE', match: ['Bakken nedre', '1846'], sourceId: 'TEST-S01' });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(tagged.map((t) => t.fact)), ['1846 Vågå, Oppland, NorwayEdit']);  // not the last, 1865's
  await step('addFact', { pid: 'TEST-LAR', addition: residence('1846', 'Lom, Oppland, Norway'), reason: REASON, save: true });
  const unclear = await step('tagFact', { pid: 'TEST-LAR', type: 'RESIDENCE', match: ['Bakken nedre', '1846'], sourceId: 'TEST-S01' });
  assert.equal(unclear.ok, false);
  assert.equal(unclear.error, 'FamilySearch has more than one residence and none is clearly this one; tag the source to it by hand.');
  assert.equal(tagged.length, 1);
  assert.equal(w.document.querySelector('[data-testid="conclusion-dialog"]'), null);
  // The only one of its type is the one, whatever its text
  await step('addFact', { pid: 'TEST-LAR', addition: CHRISTENING, reason: REASON, save: true });
  assert.equal((await step('tagFact', { pid: 'TEST-LAR', type: 'CHRISTENING', match: ['Bakken nedre', '1846'], sourceId: 'TEST-S01' })).ok, true);
  assert.equal(tagged[1].type, 'CHRISTENING');
});

test('The listener answers only its own steps, not what every object has', () => {
  const { takes } = factPage();
  assert.equal(takes({ linker: 'addFact', args: {} }), true);
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(takes({ linker: name, args: {} }), false, name);
  assert.equal(takes({ linker: ['addFact'] }), false);
  assert.equal(takes(null), false);
});

test('tagFact(): an alternate name is found by the name itself, not by words another name has too', async () => {
  const { step, tagged } = factPage();
  const name = (given, surname) => ({ fact: 'Name', action: 'name', type: 'ALTERNATE_NAME', value: { given, surname, nameType: 'AKA' } });
  await step('addFact', { pid: 'TEST-LAR', addition: name('Lars Halvorsen', 'Bakken'), reason: REASON, save: true });
  await step('addFact', { pid: 'TEST-LAR', addition: name('Lars', 'Halvorsen'), reason: REASON, save: true });
  const answer = await step('tagFact', { pid: 'TEST-LAR', type: 'ALTERNATE_NAME', match: ['Lars', 'Halvorsen'], sourceId: 'TEST-S01' });
  assert.equal(answer.ok, true, answer.error);
  assert.deepEqual(plain(tagged.map((t) => t.fact)), ['Also Known AsLars HalvorsenEdit']);
});

test('addFact(): a fact without sources, whose pencil opens the form itself, is changed and cancelled', async () => {
  const { step, saved, log, w } = factPage({ birthSources: false });
  const birth = { fact: 'Birth', action: 'edit', type: 'BIRTH', value: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } };
  const checked = await step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: false });
  assert.equal(checked.ok, true, checked.error);
  assert.deepEqual(saved, []);
  assert.deepEqual(log, ['cancel BIRTH', 'close BIRTH'], 'Cancel leaves this form open: closed with its Close');
  assert.equal(w.document.querySelector('[data-testid="conclusion-dialog"]'), null);
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: true });
  assert.equal(answer.ok, true, answer.error);
  assert.equal(saved[0].date, '23 August 1846');
  assert.equal(w.document.querySelector('[data-testid="conclusion-dialog"]'), null);
});

test('addFact(): a form that doesn\'t open is closed again, so the next fact can open its own', async () => {
  const { step, log, w } = factPage();
  const d = w.document;
  // A view whose Edit button never comes (FS changed it, or it is slow)
  const pencil = d.querySelector('[data-testid="conclusionDisplay:BIRTH"] [data-testid="pencil-edit-button"]');
  const bare = pencil.cloneNode(true);
  pencil.replaceWith(bare);
  bare.addEventListener('click', () => {
    const box = d.createElement('div');
    box.innerHTML = '<div data-testid="conclusion-dialog"><button aria-label="Close">×</button></div>';
    d.body.append(box);
    box.querySelector('[aria-label="Close"]').addEventListener('click', () => { log.push('close BIRTH'); box.remove(); });
  });
  const birth = { fact: 'Birth', action: 'edit', type: 'BIRTH', value: { date: '23 August 1846' } };
  const answer = await step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: true });
  assert.equal(answer.ok, false);
  assert.deepEqual(log, ['close BIRTH']);
  const next = await step('addFact', { pid: 'TEST-LAR', addition: CHRISTENING, reason: REASON, save: false });
  assert.equal(next.ok, true, next.error);
});

test('addFact(): the place is picked from FS\'s list for the typed text, not the list still shown for the old value', async () => {
  const changed = factPage({ late: true });
  const birth = { fact: 'Birth', action: 'edit', type: 'BIRTH', value: { date: '23 August 1846', place: 'Vågå, Oppland, Norway' } };
  const edit = await changed.step('addFact', { pid: 'TEST-LAR', addition: birth, reason: REASON, save: false });
  assert.equal(edit.ok, true, edit.error);
  assert.match(edit.fields.find((f) => f.name === 'place').picked, /Municipality, 1781 - 2019/);
  // An empty field: at first only the text as typed
  const added = await factPage({ late: true }).step('addFact', { pid: 'TEST-LAR', addition: CHRISTENING, reason: REASON, save: false });
  assert.match(added.fields.find((f) => f.name === 'place').picked, /Municipality, 1781 - 2019/);
});
