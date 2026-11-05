// The DA Linker's hands on FamilySearch (linker.js injects this into an FS tab and
// sends one step at a time; each answers {ok, ...} or {ok: false, error}):
//   createSource — in the SourceBox: Create Source, fill the form, Save, and find the
//                  new source's row (its ID, from data-testid="row-<ID>-title")
//   attach       — in the SourceBox: the row's Attach, "By ID" with the PID, the
//                  reason, Attach
//   tag          — on the person's Sources tab: open the source's row, Add Tags, add
//                  the vital tags (and a residence) asked for, Save (FS may instead
//                  open its tag dialog right after attaching; attach sets them there)
// Nothing here runs by itself: the user starts it on the linker page, after reviewing.
// Injected again for each step and page, so it installs its listener only once.

if (!window.__arkivet2fsAttach) {
  window.__arkivet2fsAttach = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const byTestId = (id, root = document) => root.querySelector('[data-testid="' + id + '"]');

  // Wait until `find()` returns something (polling; FS is a React app that renders late)
  async function waitFor(find, what, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = find();
      if (found) return found;
      await sleep(150);
    }
    throw new Error('FamilySearch did not show ' + what + ' in time.');
  }
  const waitGone = (find, what, timeoutMs = 20000) => waitFor(() => !find(), what, timeoutMs);

  // Set an input's value so React sees it: the native setter (React tracks the value
  // set through it), then the events FS's fields listen for (input, change, blur)
  function setValue(element, value) {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value || '');
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // The SourceBox's rows: [{id, title}]
  function sourceRows() {
    return [...document.querySelectorAll('[data-testid^="row-"][data-testid$="-title"]')].map((el) => ({
      id: el.getAttribute('data-testid').replace(/^row-/, '').replace(/-title$/, ''),
      title: clean(el.textContent)
    }));
  }

  function checkSourceBox() {
    if (!/\/sources\/sourcebox/i.test(location.pathname)) {
      throw new Error('FamilySearch did not open the SourceBox. Please sign in to FamilySearch and try again.');
    }
  }

  const FIELDS = {
    date: 'input[data-testid="source-date-field"]',
    title: 'input[data-testid="source-title-field"]',
    url: 'input[data-testid="source-web-page-field"]',
    citation: 'textarea[data-testid="source-citation-field"]',
    notes: 'textarea[data-testid="source-notes-field"]'
  };

  // Create the source, or use the one already in the SourceBox with this title (a
  // second run after a failed attach shouldn't make a copy)
  async function createSource(source) {
    checkSourceBox();
    const create = await waitFor(() => byTestId('source-box-create-source-button'), 'the Create Source button');
    // The list loads after the toolbar
    await sleep(1500);
    const title = clean(source.title);
    const existing = sourceRows().find((r) => r.title === title);
    if (existing) return { ok: true, sourceId: existing.id, existing: true };
    const before = new Set(sourceRows().map((r) => r.id));

    create.click();
    await waitFor(() => byTestId('source-save-button'), 'the Create Source form');
    await sleep(800);
    const missing = [];
    for (const [key, selector] of Object.entries(FIELDS)) {
      const field = document.querySelector(selector);
      if (field) setValue(field, source[key]);
      else missing.push(key);
    }
    if (missing.includes('title')) throw new Error('The Create Source form has no title field.');
    await sleep(300);
    byTestId('source-save-button').click();
    await waitGone(() => byTestId('source-save-button'), 'the saved source (the form stayed open; is a field invalid?)');

    // The new row: a new ID with this title (the list shows newest first)
    const row = await waitFor(() => sourceRows().find((r) => !before.has(r.id) && r.title === title)
      || sourceRows().find((r) => !before.has(r.id)), 'the new source in the SourceBox');
    return { ok: true, sourceId: row.id, missing };
  }

  // Attach the source to a person by PID, with a reason
  async function attach({ sourceId, pid, reason, tags, residence }) {
    checkSourceBox();
    const button = await waitFor(() => byTestId('row-' + sourceId + '-attach-button'), 'the source in the SourceBox');
    button.click();
    const tab = await waitFor(() => byTestId('find-options-by-id-tab'), 'the Attach dialog');
    tab.click();
    const field = await waitFor(() => byTestId('find-options-id-field'), 'the ID field');
    setValue(field.matches('input') ? field : field.querySelector('input') || field, pid);
    const next = await waitFor(() => {
      const b = byTestId('find-options-by-id-next-button');
      return b && !b.disabled ? b : null;
    }, 'the Find button');
    next.click();

    // The person's reason dialog, or an error under the ID field
    const reasonField = await waitFor(() => document.querySelector('textarea[data-testid="reason-to-attach-reason-field"]'),
      'the person ' + pid + ' (is the ID right, and is the source not already attached?)');
    const person = byTestId('reason-to-attach-person');
    const shown = person ? clean(person.textContent) : '';
    const pids = shown.toUpperCase().match(/\b[A-Z0-9]{4}-[A-Z0-9]{2,4}\b/g) || [];
    if (pids.length && !pids.includes(pid.toUpperCase())) {
      byTestId('reason-to-attach-cancel-button')?.click();
      throw new Error('FamilySearch showed another person (' + shown + ') for ' + pid + '.');
    }
    setValue(reasonField, reason);
    await sleep(300);
    byTestId('reason-to-attach-attach-button').click();
    await waitGone(() => byTestId('reason-to-attach-attach-button'), 'the attached source (the dialog stayed open)');
    // FS may offer the tags right away: set them there
    await sleep(1500);
    const tagSave = byTestId('add-tagging-save-button');
    if (tagSave && tags) {
      const result = await setTags(tagSave, tags, residence);
      return { ok: true, person: shown, tagged: result };
    }
    return { ok: true, person: shown };
  }

  // The source's panel on the person's Sources tab: the nearest ancestor of its
  // View button (in a menu that is there, hidden, also while the panel is closed)
  // that holds a source heading; else the panel whose heading has the title
  const HEADING = '[data-testid="source-heading-section"]';
  function sourceRow(sourceId, title) {
    const view = byTestId('source-button_view-' + sourceId);
    for (let n = view; n; n = n.parentElement) {
      if (n.querySelector(HEADING)) return n;
    }
    const heading = [...document.querySelectorAll(HEADING)].find((h) => clean(h.textContent).includes(clean(title)));
    if (!heading) return null;
    let n = heading;
    while (n.parentElement && n.parentElement.querySelectorAll(HEADING).length === 1) n = n.parentElement;
    return n;
  }

  // Add the source's tags on the person: `tags` are the vital tags to have (Name,
  // Gender, Birth, Christening, Death, Burial), `residence` whether to tag the
  // person's residence (only when the person has exactly one)
  async function tag({ sourceId, title, tags, residence }) {
    if (!/\/tree\/person\/sources\//.test(location.pathname)) throw new Error('FamilySearch did not open the person\'s Sources.');
    // The list loads after the page; a just-attached source can take a while
    const row = await waitFor(() => sourceRow(sourceId, title), 'the source among the person\'s sources', 30000);
    const findAddTags = () => byTestId('source-add-tags-button-' + sourceId) ||
      row.querySelector('[data-testid^="source-add-tags-button-"]');
    // Tag buttons show only on an open panel: its heading is the toggle
    let addTags = findAddTags();
    if (!addTags) {
      const heading = row.querySelector(HEADING);
      const toggle = (heading && heading.closest('[aria-expanded]')) || row.querySelector('[aria-expanded="false"]');
      if (!toggle) throw new Error('Could not open the source on the person\'s Sources.');
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      addTags = await waitFor(findAddTags, 'the source\'s Add Tags button');
    }
    addTags.scrollIntoView?.({ block: 'center' });
    addTags.click();
    const save = await waitFor(() => byTestId('add-tagging-save-button'), 'the tag dialog');
    return { ok: true, ...(await setTags(save, tags, residence)) };
  }

  // In the open tag dialog: the vital tags asked for (chips without data-selected are
  // clicked), a residence, then Save → {changed, notes}
  async function setTags(save, tags, residence) {
    await sleep(500);
    const notes = [];
    const changed = [];
    for (const name of ['Name', 'Gender', 'Birth', 'Christening', 'Death', 'Burial']) {
      const chip = byTestId('source-vital-tag-chip-' + name);
      const want = tags.includes(name);
      if (!chip) {
        if (want) notes.push(name + ' (the person has none)');
        continue;
      }
      // Only adds: tags already there (set by FS or by hand) stay
      if (want && !chip.hasAttribute('data-selected')) {
        chip.click();
        changed.push('+' + name);
        await sleep(150);
      }
    }
    if (residence) {
      const add = byTestId('add-tag-button');
      if (add) {
        add.click();
        await sleep(600);
      }
      const chips = [...document.querySelectorAll('[data-testid="source-conclusion-tag-chip-RESIDENCE"]')];
      if (chips.length === 1) {
        if (!chips[0].hasAttribute('data-selected')) {
          chips[0].click();
          changed.push('+Residence');
        }
      } else {
        notes.push(chips.length ? 'Residence (the person has ' + chips.length + '; tag the right one by hand)' : 'Residence (the person has none)');
      }
    }
    await sleep(300);
    save.click();
    await waitGone(() => byTestId('add-tagging-save-button'), 'the saved tags (the dialog stayed open)');
    return { changed, notes };
  }

  const STEPS = { createSource, attach, tag };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const step = request && request.linker && STEPS[request.linker];
    if (!step) return false;
    step(request.args || {}).then(sendResponse, (error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;  // answers later
  });
}
