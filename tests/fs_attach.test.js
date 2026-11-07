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
