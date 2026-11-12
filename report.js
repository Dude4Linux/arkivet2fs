// Problem reports: a page's "Copy report" button puts what the page read, shows and
// did on the clipboard as text (Markdown, for a GitHub issue), with a heading naming
// the version, browser and language and a place for the user to say what went wrong.
// Nothing is sent from here: the user reads it and pastes it where they choose. The
// report is in English but for what the page shows in the user's language (log lines,
// hints). Function declarations only, as the other shared files.

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
    '(What did you do, what did you expect, and what did you see instead?)', ''];
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

// The new issue a report goes in: the template asks for the paste (.github/ISSUE_TEMPLATE).
// Nothing of the report goes in the address.
function issueUrl() {
  return 'https://github.com/' + defaultRepo() + '/issues/new?template=problem-report.md';
}

// A control's text for 3 s, then its own again
function flash(node, text, bad, label) {
  node.textContent = text;
  node.classList.toggle('bad', !!bad);
  clearTimeout(node.flashTimer);
  node.flashTimer = setTimeout(() => { node.textContent = label; node.classList.remove('bad'); }, 3000);
}

// The header's "Copy report" button and "Report on GitHub" link, before the version:
// build() gives the report's text. The link copies the report too, then opens the new
// issue in a tab of its own, for the user to paste it in.
function reportButton(topbar, build) {
  const doc = topbar.ownerDocument;
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
  const link = doc.createElement('a');
  link.className = 'issue-link';
  link.href = issueUrl();
  link.target = '_blank';
  link.rel = 'noopener';
  const linkLabel = t('Report on GitHub');
  link.textContent = linkLabel;
  link.title = t('Copy a problem report and open a new issue on GitHub to paste it into');
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    const ok = await copyReport(build, doc);
    flash(link, ok ? t('Copied: paste it into the issue') : t('Could not copy the report'), !ok, linkLabel);
    // Opened also when the copy failed: the user can still say what happened
    try {
      chrome.tabs.create({ url: link.href });
    } catch (err) {
      doc.defaultView.open(link.href, '_blank', 'noopener');
    }
  });
  const before = topbar.querySelector('.version-link, select.language');
  topbar.insertBefore(button, before);
  topbar.insertBefore(link, before);
  return button;
}
