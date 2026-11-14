// report.js: the problem report's heading, sections and "Copy report" button; and
// linker.js linkerReport(), what the linker puts in it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, value, plain, fixtureDoc, fixtureUrl, SHARED, ROOT } = require('./harness.js');

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

// The linker with a fake relay; `answer` what the relay gives a POST
function reportPage({ answer = { ok: true, number: 12 }, status = 200, url = 'https://arkivet2fs.test/linker.html', chrome } = {}) {
  const sent = [];
  const opened = [];
  const fetch = async (address, init) => {
    sent.push({ address, init, body: JSON.parse(init.body) });
    if (answer instanceof Error) throw answer;
    return { ok: status < 300, status, json: async () => answer };
  };
  const page = load(SHARED, { html: 'linker.html', url, fetch, chrome: chrome || { tabs: { create: (o) => { opened.push(o.url); } } } });
  const topbar = page.document.querySelector('.topbar');
  page.reportButton(topbar, () => page.reportText('linker', [['Opened with', ['- pid: TEST-LAR']]], { userAgent: '' }));
  const panel = () => page.document.querySelector('.report-panel');
  const open = () => { topbar.querySelector('.send-report').click(); return panel(); };
  const settle = () => new Promise((done) => setTimeout(done, 5));
  return { page, topbar, sent, opened, panel, open, settle };
}
// The report with "What happened" filled in
const told = (area) => { area.value = area.value.replace(/\(What did you do[^)]*\)/, 'The census paired the wrong Lars Halvorsen.'); };

test('reportButton(): "Send report" before "Copy report"; the panel shows the report to edit and sends nothing yet', () => {
  const p = reportPage();
  const send = p.topbar.querySelector('.send-report');
  assert.equal(send.textContent, 'Send report');
  assert.equal(send.nextElementSibling.textContent, 'Copy report');
  assert.equal(p.topbar.querySelector('a.issue-link'), null);
  const panel = p.open();
  assert.ok(panel.previousElementSibling.classList.contains('topbar'));
  assert.match(panel.querySelector('.report-about').textContent, /private queue on GitHub; no one else sees it/);
  assert.match(panel.querySelector('textarea').value, /^### arkivet2fs problem report\n[\s\S]*- pid: TEST-LAR/);
  assert.equal(p.open(), panel);  // one panel
  assert.equal(p.sent.length, 0);
  [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
  assert.equal(p.panel(), null);
});

test('openReportPanel(): Send asks for "What happened" first, then posts the report as edited, with the contact', async () => {
  const p = reportPage();
  const panel = p.open();
  const area = panel.querySelector('textarea');
  const sendButton = panel.querySelector('button.primary');
  sendButton.click();
  await p.settle();
  assert.equal(p.sent.length, 0);
  assert.match(panel.querySelector('.report-status').textContent, /under "What happened" first/);
  told(area);
  panel.querySelector('input[type=email]').value = 'me@example.com';
  sendButton.click();
  await p.settle();
  assert.equal(p.sent.length, 1);
  const { address, init, body } = p.sent[0];
  assert.equal(address, p.page.relayUrl());
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(body.page, 'linker');
  assert.equal(body.contact, 'me@example.com');
  assert.match(body.report, /The census paired the wrong Lars Halvorsen\./);
  assert.ok(!body.report.includes(p.page.reportPrompt()));
  assert.equal(panel.querySelector('.report-status').textContent, 'Sent, as report #12. Thank you!');
  assert.ok(area.readOnly);
  assert.ok(sendButton.disabled);
});

test('openReportPanel(): a relay that fails offers the GitHub issue, which copies the report as edited', async () => {
  const p = reportPage({ answer: { ok: false, error: 'too many reports; try again in a minute' }, status: 429 });
  let copied = null;
  Object.defineProperty(p.page.navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } } });
  const panel = p.open();
  told(panel.querySelector('textarea'));
  panel.querySelector('button.primary').click();
  await p.settle();
  const status = panel.querySelector('.report-status');
  assert.match(status.textContent, /^Could not send the report: too many reports; try again in a minute\. Copy it and open an issue/);
  assert.ok(!panel.querySelector('button.primary').disabled);  // can be tried again
  const link = status.querySelector('a.issue-link');
  assert.equal(link.href, 'https://github.com/Dude4Linux/arkivet2fs/issues/new?template=problem-report.md');
  link.click();
  await p.settle();
  assert.match(copied, /The census paired the wrong Lars Halvorsen/);
  assert.deepEqual(p.opened, [link.href]);
  // No connection at all
  const off = reportPage({ answer: new Error('Failed to fetch') });
  const offPanel = off.open();
  told(offPanel.querySelector('textarea'));
  offPanel.querySelector('button.primary').click();
  await off.settle();
  assert.match(offPanel.querySelector('.report-status').textContent, /Could not send the report: no connection\./);
});

test('openReportPanel(): in Firefox, Send asks for the data kinds first; refused, nothing is sent', async () => {
  const requests = [];
  let allow = false;
  const chrome = { permissions: { request: (p) => { requests.push(p); return Promise.resolve(allow); } }, tabs: { create() {} } };
  const p = reportPage({ url: 'moz-extension://0d1e2f3a-4b5c-6d7e-8f90-a1b2c3d4e5f6/linker.html', chrome });
  const panel = p.open();
  told(panel.querySelector('textarea'));
  panel.querySelector('button.primary').click();
  await p.settle();
  assert.deepEqual(plain(requests), [{ data_collection: ['technicalAndInteraction'] }]);
  assert.equal(p.sent.length, 0);
  assert.match(panel.querySelector('.report-status').textContent, /didn't allow sending/);
  allow = true;
  panel.querySelector('input[type=email]').value = 'me@example.com';
  panel.querySelector('button.primary').click();
  await p.settle();
  assert.deepEqual(plain(requests[1]), { data_collection: ['technicalAndInteraction', 'personallyIdentifyingInfo'] });
  assert.equal(p.sent.length, 1);
});

test('the manifest declares what Firefox asks about: website content always, a report\'s kinds when sent', () => {
  const manifest = JSON.parse(require('node:fs').readFileSync(require('node:path').join(ROOT, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions,
    { required: ['websiteContent'], optional: ['technicalAndInteraction', 'personallyIdentifyingInfo'] });
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
  const citation = page.document.getElementById('f-citation').value;
  const fields = { title, date: '23 Aug 1846', url: page.document.getElementById('f-url').value, citation: citation.replace(/ : accessed [^)]*\)/, ' : accessed 1 November 2026)'), notes: '' };
  state.fsCheck = { sources: [{ title, book: '', id: 'TEST-S01', ids: ['TEST-S01'], persons: [{ pid: 'TEST-LAR', name: 'Lars Halvorsen' }], fields }] };
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
  // FS's own value where it isn't the same, also an empty one; not the citation, whose access day only differs
  assert.match(text, /\n- Differs from the SourceBox: date \(record\)\n- SourceBox's Date: "23 Aug 1846"\n- SourceBox's Notes: \(empty\)\n/);
  assert.ok(!text.includes("SourceBox's Citation"));
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
