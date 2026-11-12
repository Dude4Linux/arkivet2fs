// report.js: the problem report's heading, sections and "Copy report" button; and
// linker.js linkerReport(), what the linker puts in it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, value, fixtureDoc, fixtureUrl, SHARED } = require('./harness.js');

const w = load(SHARED);

test('browserName(): the browser and system from the user agent', () => {
  const ua = (s) => ({ userAgent: s });
  const linuxChrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
  assert.equal(w.browserName(ua(linuxChrome)), 'Chrome 142 on Linux');
  assert.equal(w.browserName({ userAgent: linuxChrome, brave: {} }), 'Brave 142 on Linux');
  assert.equal(w.browserName(ua(linuxChrome + ' OPR/140.0.0.0')), 'Opera 140 on Linux');
  assert.equal(w.browserName(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0')), 'Edge 142 on Windows');
  assert.equal(w.browserName(ua('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')), 'Firefox 140 on Linux');
  assert.equal(w.browserName(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')), 'Chrome 142 on macOS');
  assert.equal(w.browserName(ua('')), 'an unknown browser');
});

test('reportText(): the heading, a place for the user, the sections that have something, and script errors', () => {
  const page = load(SHARED);
  page.pageErrors().push('TypeError: x is undefined (linker.js:12)');
  const text = page.reportText('linker', [['Empty', []], ['Opened with', ['- rec: https://www.digitalarkivet.no/en/view/1/pd99']], ['Notes', page.reportBlock('a\r\nb ``` c')]], { userAgent: '' });
  assert.match(text, /^### arkivet2fs problem report\n/);
  assert.match(text, /\n- Page: linker\n- Language: en\n/);
  assert.match(text, /#### What happened\n\n\(What did you do/);
  assert.ok(!text.includes('#### Empty'));
  assert.match(text, /#### Opened with\n\n- rec: https:\/\/www\.digitalarkivet\.no\/en\/view\/1\/pd99\n/);
  assert.match(text, /#### Notes\n\n~~~\na\nb ``` c\n~~~\n/);  // a fence the text doesn't hold, its lines kept
  assert.match(text, /#### Script errors\n\n- TypeError: x is undefined \(linker\.js:12\)\n/);
});

test('watchErrors(): uncaught errors and rejected promises go into the report', () => {
  const page = load(SHARED);
  page.watchErrors(page);
  page.dispatchEvent(new page.ErrorEvent('error', { message: 'boom', filename: 'chrome-extension://abc/linker.js', lineno: 7 }));
  const rejected = new page.Event('unhandledrejection');
  rejected.reason = new Error('no answer');
  page.dispatchEvent(rejected);
  assert.deepEqual([...page.pageErrors()], ['boom (linker.js:7)', 'Unhandled: no answer']);
});

test('reportButton(): copies what build() gives, and says so; a failed build still copies the heading and the error', async () => {
  const page = load(SHARED, { html: 'linker.html' });
  let copied = null;
  Object.defineProperty(page.navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } } });
  const topbar = page.document.querySelector('.topbar');
  const button = page.reportButton(topbar, () => 'the report');
  assert.equal(button.textContent, 'Copy report');
  button.click();
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(copied, 'the report');
  assert.equal(button.textContent, 'Copied');
  const broken = page.reportButton(topbar, () => { throw new Error('no record'); });
  broken.click();
  await new Promise((done) => setTimeout(done, 5));
  assert.match(copied, /^### arkivet2fs problem report/);
  assert.match(copied, /#### The report could not be made\n\nError: no record/);
});

test('reportButton(): a clipboard that refuses is said on the button', async () => {
  const page = load(SHARED, { html: 'linker.html' });
  Object.defineProperty(page.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } });
  page.document.execCommand = () => false;  // the older way refused too
  const button = page.reportButton(page.document.querySelector('.topbar'), () => 'text');
  button.click();
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(button.textContent, 'Could not copy the report');
});

test('reportButton(): "Report on GitHub" copies the report, then opens the new issue, with nothing of the report in its address', async () => {
  const opened = [];
  const page = load(SHARED, { html: 'linker.html', chrome: { tabs: { create: (o) => { opened.push(o.url); } } } });
  let copied = null;
  Object.defineProperty(page.navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } } });
  const topbar = page.document.querySelector('.topbar');
  page.reportButton(topbar, () => 'the report, Lars Halvorsen TEST-LAR');
  const link = topbar.querySelector('a.issue-link');
  assert.equal(link.textContent, 'Report on GitHub');
  assert.equal(link.previousElementSibling.className, 'report-button');
  assert.equal(link.href, 'https://github.com/Dude4Linux/arkivet2fs/issues/new?template=problem-report.md');
  link.click();
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(copied, 'the report, Lars Halvorsen TEST-LAR');
  assert.deepEqual(opened, [link.href]);
  assert.equal(link.textContent, 'Copied: paste it into the issue');
});

// Synthetic FS person (TEST-… PIDs), as in linker.test.js
const LARS_1846 = {
  pid: 'TEST-LAR', name: 'Lars Halvorsen', gender: 'Male', birth: { date: '16 July 1846' },
  father: { pid: 'TEST-HAL', name: 'Halvor Larsen', lifespan: '1810-1880' },
  mother: { pid: 'TEST-AST', name: 'Astrid Larsdatter', lifespan: '1815-1890' }, families: []
};

test('linkerReport(): the record as read, the source, each pairing with its facts and changes, the SourceBox check and the log', () => {
  const url = 'https://arkivet2fs.test/linker.html?rec=' + encodeURIComponent('https://www.digitalarkivet.no/en/view/255/pd99000000000001') + '&pid=TEST-LAR';
  const page = load([...SHARED, 'linker.js'], { html: 'linker.html', url, fast: true });
  page.Element.prototype.scrollIntoView = () => {};  // not in jsdom
  const state = value(page, 'state');
  const r = page.extractRecord(fixtureDoc(page, 'da/baptism-1846.html'), fixtureUrl('da/baptism-1846.html'));
  Object.assign(state, { record: r, people: page.recordPeople(r), fs: LARS_1846 });
  page.fillSource(r);
  const pairs = { Lars: 'TEST-LAR', 'Halvor Larsen': 'TEST-HAL' };
  state.rows = state.people.map((p) => page.personRow(p, page.treePool(LARS_1846, {}), pairs[p.name], p.name === 'Lars' ? 'the FS person' : ''));
  page.document.getElementById('people').replaceChildren(...state.rows.map((row) => row.node));
  const title = page.document.getElementById('f-title').value;
  state.fsCheck = { sources: [{ title, book: '', id: 'TEST-S01', ids: ['TEST-S01'], persons: [{ pid: 'TEST-LAR', name: 'Lars Halvorsen' }] }] };
  page.showFsCheck();
  // An addition ticked, and a line in the log
  const lars = state.rows.find((row) => row.person.name === 'Lars');
  const item = [...lars.node.querySelectorAll('.additions li')].find((li) => /Add the christening/.test(li.textContent));
  const tick = item.querySelector('input[type=checkbox]');
  tick.checked = true;
  tick.dispatchEvent(new page.Event('change'));
  page.log('Source created.', 'ok');
  page.document.getElementById('status').hidden = true;  // as main() hides it once the page is shown

  const text = page.linkerReport();
  assert.match(text, /\n- Page: linker\n/);
  assert.match(text, /#### Opened with\n\n- rec: https:\/\/www\.digitalarkivet\.no\/en\/view\/255\/pd99000000000001\n- pid: TEST-LAR\n/);
  assert.match(text, new RegExp('- Permanent ID: ' + r.permanentId + ', birth_baptism, '));
  assert.ok(text.includes('- Title: ' + title + '\n'));
  assert.ok(text.includes('- Citation:\n```\n' + page.document.getElementById('f-citation').value.trim() + '\n```\n'));
  assert.match(text, /- SourceBox: TEST-S01, attached to TEST-LAR\n/);
  assert.match(text, /\n- Lars \(Child\) → TEST-LAR \(Lars Halvorsen \(FamilySearch person\) · TEST-LAR\)\n {2}- Why: the FS person\n/);
  assert.match(text, /\n {2}- FamilySearch: Already has this source on FamilySearch\n/);
  assert.match(text, /\n {2}- Name: Lars \| FS: Lars Halvorsen ✓\n/);
  assert.match(text, /\n {2}- \[x\] Add the christening: /);
  assert.match(text, /\n- Halvor Larsen \(Father\) → TEST-HAL/);
  assert.ok(!text.includes('#### Page status'));
  assert.match(text, /\n {2}- Christening: 23 August 1846, Vågå \| FS: —\n/);
  assert.match(text, /\n {2}- \(the FS person's page was not read\)\n {2}- Tags: Name\n/);  // Halvor's: only the years
  assert.match(text, /\n- Astri Larsdatter \(Mother\) → not attached\n/);
  assert.match(text, /#### On FamilySearch \(the log\)\n\n- \[ok\] Source created\.\n/);
});
