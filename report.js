// Problem reports: a page's report is what it read, shows and did, as text (Markdown,
// for a GitHub issue), with a heading naming the version, browser and language and a
// place for the user to say what went wrong. The header's "Send report" opens a panel
// with the report to read and edit, which sends it to the report relay (relay/, a
// Cloudflare Worker filing it in the developer's private queue on GitHub) only when the
// user clicks Send; "Copy report" puts it on the clipboard. The report is in English
// but for what the page shows in the user's language (log lines, hints). Function
// declarations only, as the other shared files.

// "Chrome 142 on Linux" from the user agent. LibreWolf gives Firefox's; Brave gives
// Chrome's and has navigator.brave.
function browserName(nav) {
  const ua = String((nav && nav.userAgent) || '');
  const pick = (re) => (ua.match(re) || [])[1];
  const name = pick(/\bEdg\/(\d+)/) ? 'Edge ' + pick(/\bEdg\/(\d+)/)
    : pick(/\bOPR\/(\d+)/) ? 'Opera ' + pick(/\bOPR\/(\d+)/)
      : pick(/\bFirefox\/(\d+)/) ? 'Firefox ' + pick(/\bFirefox\/(\d+)/)
        : pick(/\bChrome\/(\d+)/) ? ((nav && nav.brave) ? 'Brave ' : 'Chrome ') + pick(/\bChrome\/(\d+)/)
          : 'an unknown browser';
  const os = /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : '';
  return name + (os ? ' on ' + os : '');
}

// The page's script errors since it opened, for the report (watchErrors() collects them)
function pageErrors() {
  return pageErrors.list || (pageErrors.list = []);
}
function watchErrors(win) {
  const keep = (text) => { const list = pageErrors(); if (list.length < 20) list.push(String(text).slice(0, 500)); };
  win.addEventListener('error', (e) => keep((e.message || 'Error') + (e.filename ? ' (' + String(e.filename).replace(/^.*\//, '') + ':' + e.lineno + ')' : '')));
  win.addEventListener('unhandledrejection', (e) => keep('Unhandled: ' + ((e.reason && e.reason.message) || e.reason)));
}

// The report's heading and the user's part
function reportHeader(page, nav) {
  let version = '';
  try { version = chrome.runtime.getManifest().version; } catch (e) { /* not in the extension */ }
  return ['### arkivet2fs problem report', '',
    '- Version: ' + (version || 'unknown'),
    '- Browser: ' + browserName(nav),
    '- Page: ' + page,
    '- Language: ' + uiLanguage(),
    '- Date: ' + new Date().toISOString().slice(0, 10), '',
    '#### What happened', '',
    reportPrompt(), ''];
}

// A multi-line text as a fenced block, so Markdown keeps its lines
function reportBlock(text) {
  const body = String(text || '').replace(/\r\n/g, '\n').trim();
  const fence = body.includes('```') ? '~~~' : '```';
  return [fence, body, fence];
}

// The rest of a report, after the heading: the page's sections, then its script errors
function reportText(page, sections, nav) {
  const lines = reportHeader(page, nav);
  for (const [title, body] of sections) {
    const list = (Array.isArray(body) ? body : [body]).filter((l) => l != null);
    if (!list.length) continue;
    lines.push('#### ' + title, '', ...list, '');
  }
  const errors = pageErrors();
  if (errors.length) lines.push('#### Script errors', '', ...errors.map((e) => '- ' + e), '');
  return lines.join('\n');
}

// Onto the clipboard; true when copied
async function copyText(text, doc) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // An older way, for a browser that refuses the clipboard API here
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    doc.body.append(area);
    area.select();
    let done = false;
    try { done = doc.execCommand('copy'); } catch (e2) { done = false; }
    area.remove();
    return done;
  }
}

// The report from build(), or one saying why it could not be made, onto the clipboard
function copyReport(build, doc) {
  let text;
  try { text = build(); } catch (e) {
    text = reportText('report', [['The report could not be made', String((e && e.stack) || e)]], navigator);
  }
  return copyText(text, doc);
}

// The new issue a report goes in, when the relay can't take it: the template asks for
// the paste (.github/ISSUE_TEMPLATE). Nothing of the report goes in the address.
function issueUrl() {
  return 'https://github.com/' + defaultRepo() + '/issues/new?template=problem-report.md';
}

// The report relay (relay/README.md), the Worker `report` on the maintainer's
// workers.dev subdomain. tools/build.mjs won't build a release tag with a placeholder
// (REPLACE-…) here.
function relayUrl() {
  return 'https://report.arkivet2fs-relay.workers.dev/report';
}
// How long a send may take
function relayTimeoutMs() {
  return 30000;
}

// A control's text for 3 s, then its own again
function flash(node, text, bad, label) {
  node.textContent = text;
  node.classList.toggle('bad', !!bad);
  clearTimeout(node.flashTimer);
  node.flashTimer = setTimeout(() => { node.textContent = label; node.classList.remove('bad'); }, 3000);
}

// The line the user is to replace with what happened (reportHeader()), in a report
// copied for a GitHub issue
function reportPrompt() {
  return '(What did you do, what did you expect, and what did you see instead?)';
}

// The panel asks "What happened?" in a box of its own; until Send, the report shows
// this line where the answer goes
function reportAnswerMark() {
  return '(Your answer to "What happened?" below goes here.)';
}

// The report with the panel's answer under "What happened": in place of the mark (or
// the prompt), else first under the heading, else at the top
function withWhatHappened(report, answer) {
  answer = String(answer || '').replace(/\r\n?/g, '\n').trim();
  if (!answer) return report;
  for (const mark of [reportAnswerMark(), reportPrompt()]) {
    if (report.includes(mark)) return report.replace(mark, () => answer);
  }
  const heading = /^#### What happened[ \t]*\n+/m;
  if (heading.test(report)) return report.replace(heading, () => '#### What happened\n\n' + answer + '\n\n');
  return '#### What happened\n\n' + answer + '\n\n' + report;
}

// The page's name for the relay: linker.html is "linker"
function reportPage(doc) {
  return String(doc.defaultView.location.pathname).replace(/^.*\//, '').replace(/\.html$/, '') || 'page';
}

// Firefox asks the user for the kinds of data an extension sends (the manifest's
// data_collection_permissions): a report is technical data, and with a contact address
// also identifying information. Asked straight from the click, as Firefox wants; other
// browsers have no such permission. Resolves to true when allowed.
function askToSendReport(doc, contact) {
  if (doc.defaultView.location.protocol !== 'moz-extension:') return Promise.resolve(true);
  const kinds = ['technicalAndInteraction'].concat(contact ? ['personallyIdentifyingInfo'] : []);
  try {
    return Promise.resolve(chrome.permissions.request({ data_collection: kinds })).catch(() => false);
  } catch (e) {
    return Promise.resolve(false);
  }
}

// The report to the relay: the issue's number, or an error with the relay's reason
async function sendReport(fields, fetchFn) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), relayTimeoutMs());
  try {
    let res;
    try {
      res = await fetchFn(relayUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
        signal: control.signal,
        credentials: 'omit'
      });
    } catch (e) {
      throw new Error(control.signal.aborted ? 'no answer' : 'no connection');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'status ' + res.status);
    return data.number;
  } finally {
    clearTimeout(timer);
  }
}

// An element with a class and text
function reportElement(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// The "Send report" panel, after the header: what the report is and where it goes, the
// report to read and edit, "What happened?" in a box of its own (withWhatHappened()
// puts it in the report), an optional address for an answer, Send and Cancel. Nothing
// is sent before Send. Opened again, the panel there is shown.
function openReportPanel(topbar, build) {
  const doc = topbar.ownerDocument;
  const open = doc.querySelector('.report-panel');
  if (open) { open.querySelector('.report-what').focus(); return open; }
  let text;
  try { text = build(); } catch (e) {
    text = reportText('report', [['The report could not be made', String((e && e.stack) || e)]], navigator);
  }
  const panel = reportElement(doc, 'section', 'report-panel');
  panel.setAttribute('aria-labelledby', 'report-panel-title');
  const title = reportElement(doc, 'h2', '', t('Send a problem report'));
  title.id = 'report-panel-title';
  const about = reportElement(doc, 'p', 'report-about', t('The report goes to the developer\'s private queue on GitHub; no one else sees it. It holds what this page read, shows and did: the record, and the tree persons you paired with their FamilySearch IDs. Read it and take out anything about living people, then write in the box below what happened.'));
  const area = reportElement(doc, 'textarea', 'report-text');
  area.value = text.replace(reportPrompt(), () => reportAnswerMark());
  area.rows = 14;
  area.spellcheck = false;
  area.setAttribute('aria-label', t('The report'));
  const whatLabel = reportElement(doc, 'label', 'report-what-label', t('What happened? What did you do, what did you expect, and what did you see instead?'));
  const what = reportElement(doc, 'textarea', 'report-what');
  what.rows = 3;
  whatLabel.append(what);
  const contactLabel = reportElement(doc, 'label', 'report-contact', t('Your e-mail address, if you would like an answer (optional)'));
  const contact = reportElement(doc, 'input');
  contact.type = 'email';
  contact.maxLength = 200;
  contact.autocomplete = 'email';
  contactLabel.append(contact);
  const send = reportElement(doc, 'button', 'primary', t('Send'));
  send.type = 'button';
  const cancel = reportElement(doc, 'button', '', t('Cancel'));
  cancel.type = 'button';
  const status = reportElement(doc, 'p', 'report-status');
  status.setAttribute('role', 'status');
  const buttons = reportElement(doc, 'div', 'report-actions');
  buttons.append(send, cancel);
  panel.append(title, about, area, whatLabel, contactLabel, buttons, status);
  // The report as it is sent (and copied for an issue): the answer in its place
  const finalReport = () => withWhatHappened(area.value.trim(), what.value);

  const say = (message, bad) => {
    status.replaceChildren(message);
    status.classList.toggle('bad', !!bad);
  };
  // When the relay can't take it: copy the report (as edited) and open a GitHub issue
  const fallback = (message) => {
    const linkLabel = t('Copy it and open an issue on GitHub instead');
    const link = reportElement(doc, 'a', 'issue-link', linkLabel);
    link.href = issueUrl();
    link.target = '_blank';
    link.rel = 'noopener';
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const ok = await copyText(finalReport(), doc);
      flash(link, ok ? t('Copied: paste it into the issue') : t('Could not copy the report'), !ok, linkLabel);
      try { chrome.tabs.create({ url: link.href }); } catch (err) { doc.defaultView.open(link.href, '_blank', 'noopener'); }
    });
    status.replaceChildren(message + ' ', link);
    status.classList.add('bad');
  };
  send.addEventListener('click', async () => {
    const address = contact.value.trim();
    if (!area.value.trim()) { say(t('The report is empty.'), true); return; }
    const report = finalReport();
    if (report.includes(reportAnswerMark()) || report.includes(reportPrompt())) {
      say(t('Write what happened first.'), true);
      what.focus();
      return;
    }
    if (address && !contact.checkValidity()) { say(t('That is not an e-mail address.'), true); contact.focus(); return; }
    // First, while the click still counts as the user's (Firefox)
    const allowed = askToSendReport(doc, address);
    send.disabled = true;
    say(t('Sending…'));
    if (!await allowed) {
      send.disabled = false;
      say(t('The browser didn\'t allow sending the report.'), true);
      return;
    }
    let version = '';
    try { version = chrome.runtime.getManifest().version; } catch (e) { /* not in the extension */ }
    try {
      const number = await sendReport({ report, contact: address, version, browser: browserName(navigator), page: reportPage(doc) }, doc.defaultView.fetch.bind(doc.defaultView));
      say(t('Sent, as report {number}. Thank you!', { number: '#' + number }));
      status.classList.add('ok');
      area.value = report;
      area.readOnly = true;
      what.readOnly = true;
      contact.readOnly = true;
      cancel.textContent = t('Close');
    } catch (e) {
      send.disabled = false;
      fallback(t('Could not send the report: {detail}.', { detail: e.message }));
    }
  });
  cancel.addEventListener('click', () => panel.remove());
  topbar.after(panel);
  what.focus();
  return panel;
}

// The header's "Send report" and "Copy report" buttons, before the version: build()
// gives the report's text
function reportButton(topbar, build) {
  const doc = topbar.ownerDocument;
  const sendButton = doc.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'report-button send-report';
  sendButton.textContent = t('Send report');
  sendButton.title = t('Send a problem report to the developer: you read it first, and nothing is sent until you click Send');
  sendButton.addEventListener('click', () => openReportPanel(topbar, build));
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'report-button';
  const label = t('Copy report');
  button.textContent = label;
  button.title = t('Copy a problem report (what this page read, shows and did) to paste into a GitHub issue');
  button.addEventListener('click', async () => {
    const ok = await copyReport(build, doc);
    flash(button, ok ? t('Copied') : t('Could not copy the report'), !ok, label);
  });
  const before = topbar.querySelector('.version-link, select.language');
  topbar.insertBefore(sendButton, before);
  topbar.insertBefore(button, before);
  return button;
}
