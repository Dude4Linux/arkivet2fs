// The DA Linker's hands on FamilySearch (linker.js injects this into an FS tab and
// sends one step at a time; each answers {ok, ...} or {ok: false, error}):
//   findSource   — in the SourceBox: search all folders for the title, and give the
//                  sources of exactly that title (reads only)
//   attachedTo   — on a source's Attached To page: the persons it is attached to
//                  (reads only)
//   createSource — in the SourceBox: Create Source, fill the form, Save, and find the
//                  new source's row (its ID, from data-testid="row-<ID>-title")
//   editSource   — in the SourceBox: the source's Edit, write the linker's fields over
//                  those that differ, a change reason, Save (Cancel when none differ);
//                  with `read`, FS's fields only, Cancel
//   attach       — in the SourceBox: the row's Attach, "By ID" with the PID, the
//                  reason, Attach
//   tag          — on the person's Sources tab: open the source's row, Add Tags, add
//                  the vital tags (and a residence) asked for, Save (FS may instead
//                  open its tag dialog right after attaching; attach sets them there)
//   findPerson   — on a tree person's page: Add Child (of the couple), Add Spouse or
//                  Add Parent, fill FS's form with the new person, Next, and give the
//                  possible matches FS lists (nothing is saved; the dialog stays open)
//   createPerson — in that dialog: Create Person, and the new person's PID
//   cancelAdd    — in that dialog: Cancel
//   addFact      — on a tree person's page: an alternate name, a missing fact or event,
//                  or a vital changed, in FS's fact form; `save` false: the fields as
//                  FS took them (standard places) read back, Cancel, nothing saved
//   tagFact      — there: the fact's view, Tag Sources, the source by its ID, Tag To
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
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      element = element && element.querySelector('input, textarea');
      if (!element) throw new Error('No field to fill in');
    }
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

  // The SourceBox's search (all folders; Home shows only its newest sources): search
  // for the text and give the rows it shows. The list empties while it loads, then
  // shows the hits or "No sources found."
  async function searchSourceBox(text) {
    const field = await waitFor(() => {
      const f = byTestId('source-box-filter-field');
      return f && (f.matches('input') ? f : f.querySelector('input'));
    }, 'the SourceBox search');
    const before = sourceRows().map((r) => r.id).join();
    setValue(field, text);
    await sleep(200);
    (await waitFor(() => byTestId('source-box-search-button'), 'the SourceBox search')).click();
    const none = () => /No sources found/i.test(document.body.textContent);
    const done = () => {
      const rows = sourceRows();
      return (rows.length && rows.map((r) => r.id).join() !== before) || (!rows.length && none());
    };
    try {
      await waitFor(done, 'the SourceBox search', 15000);
      // Still so a moment later: the list didn't only empty to load
      await sleep(700);
      if (!done()) await waitFor(done, 'the SourceBox search', 10000);
    } catch (e) {
      if (!sourceRows().length) throw e;  // else the hits are the rows that were there
    }
    return sourceRows();
  }

  // The sources with this title, wherever they are in the SourceBox: [{id, title}]
  async function findSource({ title }) {
    checkSourceBox();
    const wanted = clean(title);
    if (!wanted) throw new Error('The source needs a title.');
    const rows = await searchSourceBox(wanted);
    return { ok: true, sources: rows.filter((r) => r.title === wanted) };
  }

  // Who the source is attached to, from its Attached To page: {title, persons: [{pid,
  // name, lifespan}]}. The persons come after the heading; a source attached to no one
  // shows none.
  async function attachedTo({ sourceId }) {
    if (!/\/sources\/attachedto\//i.test(location.pathname)) {
      throw new Error('FamilySearch did not open the source\'s Attached To page. Please sign in to FamilySearch and try again.');
    }
    const heading = await waitFor(() => byTestId('attach-to-title'), 'the source\'s Attached To page', 30000);
    const persons = () => [...document.querySelectorAll('[data-testid^="attach-to-"][data-testid$="-person"]')];
    try { await waitFor(() => persons().length, 'the attached persons', 5000); } catch (e) { /* attached to no one */ }
    await sleep(500);
    return {
      ok: true,
      sourceId,
      title: clean(heading.textContent),
      persons: persons().map((node) => {
        const pid = clean(byTestId('pid', node)?.textContent) || node.getAttribute('data-testid').replace(/^attach-to-/, '').replace(/-person$/, '');
        return { pid: pid.toUpperCase(), name: clean(byTestId('fullName', node)?.textContent), lifespan: clean(byTestId('lifespan', node)?.textContent) };
      }).filter((p) => /^[A-Z0-9]{4}-[A-Z0-9]{2,4}$/.test(p.pid))
    };
  }

  const FIELDS = {
    date: 'input[data-testid="source-date-field"]',
    title: 'input[data-testid="source-title-field"]',
    url: 'input[data-testid="source-web-page-field"]',
    citation: 'textarea[data-testid="source-citation-field"]',
    notes: 'textarea[data-testid="source-notes-field"]'
  };

  // Create the source, or use the one already in the SourceBox with this title (the
  // linker looks first with findSource; this sees only the rows Home shows)
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

  // The DA permanent IDs a source names: any in its web page (the record's address),
  // and those after "Permanent ID" in the citation and notes (not the scan's IDs,
  // which records of the same page share)
  function recordIds(url, ...texts) {
    const ids = new Set();
    for (const m of (url || '').matchAll(/(?<![a-z0-9])([a-z]{2}\d{14,})(?![0-9])/gi)) ids.add(m[1].toLowerCase());
    for (const text of texts) {
      for (const m of (text || '').matchAll(/Permanent ID:?\s*([a-z]{2}\d{14,})(?![0-9])/gi)) ids.add(m[1].toLowerCase());
    }
    return ids;
  }

  // Edit a source already in the SourceBox: its row's Edit (in the row's menu, clicked
  // as it is; a source Home doesn't show is searched for by its title), then the same
  // form as Create Source with a change reason. Only fields that differ are written; a
  // field the linker has empty keeps what FS has. Nothing differs: Cancel, so the
  // source's history on FS gets no change.
  async function editSource({ sourceId, source, reason, read }) {
    checkSourceBox();
    const findButton = () => byTestId('row-' + sourceId + '-edit-button');
    let button;
    try {
      button = await waitFor(findButton, 'the source in the SourceBox', 6000);
    } catch (e) {
      await searchSourceBox(clean(source.title));
      button = await waitFor(findButton, 'the source in the SourceBox');
    }
    button.click();
    await waitFor(() => byTestId('source-save-button'), 'the Edit Source form');
    await sleep(800);
    // Only the source of this record is written over: titles can repeat (a common
    // name, the same year and parish), and the source may be attached to others
    const fieldText = (key) => { const f = document.querySelector(FIELDS[key]); return f ? f.value : ''; };
    const ours = recordIds(source.url, source.citation);
    const theirs = recordIds(fieldText('url'), fieldText('citation'), fieldText('notes'));
    if (ours.size && ![...theirs].some((id) => ours.has(id))) {
      const cancel = byTestId('source-cancel-button');
      if (cancel) cancel.click();
      return { ok: false, otherRecord: true, sourceId, other: [...theirs][0] || '',
        error: 'The source of this title in the SourceBox is of another record' + (theirs.size ? ' (' + [...theirs][0] + ')' : '') + '; nothing was changed.' };
    }
    // Only read (the linker's check): FS's fields, the dialog cancelled
    if (read) {
      const fields = Object.fromEntries(Object.keys(FIELDS).map((key) => [key, fieldText(key).replace(/\r\n/g, '\n')]));
      const cancel = byTestId('source-cancel-button');
      if (cancel) cancel.click();
      await waitGone(() => byTestId('source-save-button'), 'the Edit Source form to close', 10000).catch(() => {});
      return { ok: true, sourceId, fields };
    }
    const changed = [];
    const missing = [];
    for (const [key, selector] of Object.entries(FIELDS)) {
      const field = document.querySelector(selector);
      const want = (source[key] || '').trim();
      if (!field) { if (want) missing.push(key); continue; }
      if (!want || field.value.replace(/\r\n/g, '\n').trim() === want) continue;
      setValue(field, source[key]);
      changed.push(key);
    }
    if (!changed.length) {
      const cancel = byTestId('source-cancel-button');
      if (cancel) cancel.click();
      return { ok: true, sourceId, changed, missing };
    }
    const why = document.querySelector('textarea[data-testid="source-change-reason-field"]');
    if (why && reason) setValue(why, reason);
    await sleep(300);
    byTestId('source-save-button').click();
    await waitGone(() => byTestId('source-save-button'), 'the saved source (the form stayed open; is a field invalid?)');
    return { ok: true, sourceId, changed, missing };
  }

  // Attach the source to a person by PID, with a reason
  // (a source Home doesn't show, in a folder or older, is found by its title)
  async function attach({ sourceId, title, pid, reason, tags, residence }) {
    checkSourceBox();
    const findButton = () => byTestId('row-' + sourceId + '-attach-button');
    let button;
    try {
      button = await waitFor(findButton, 'the source in the SourceBox', title ? 6000 : 20000);
    } catch (e) {
      if (!title) throw e;
      await searchSourceBox(clean(title));
      button = await waitFor(findButton, 'the source in the SourceBox');
    }
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
    // By the title only when one panel has it (tags on another source are no use)
    const headings = [...document.querySelectorAll(HEADING)].filter((h) => clean(h.textContent).includes(clean(title)));
    if (headings.length !== 1) return null;
    const heading = headings[0];
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

  // --- A new person in the tree ----------------------------------------------------
  // FS's Add Child / Add Spouse / Add Parent dialog (data-testid="add-find-flow"): the
  // name, sex, status and the birth and death fields (comboboxes that take one of FS's
  // standard dates and places), Next, then FS's possible matches ("Possible Matches
  // Found (N)", each with Add Match) or "No Match Found", and Create Person.

  const addDialog = () => byTestId('add-find-flow');

  // The button that opens the dialog: a child in the couple's family card (the card's
  // data-testid names both: family-<PID>_<PID>), else with the other parent unknown
  function addButton(relation, anchor, other) {
    if (relation === 'child') {
      if (other) {
        const card = [...document.querySelectorAll('[data-testid^="family-"]')].find((c) => {
          const ids = c.getAttribute('data-testid').replace(/^family-/, '').toUpperCase().split('_');
          return ids.includes(anchor) && ids.includes(other);
        });
        return card ? byTestId('add-child', card) : null;
      }
      return document.querySelector('[data-testid^="add-child-unknown"]');
    }
    return byTestId(relation === 'spouse' ? 'add-spouse' : 'add-parent');
  }

  // A combobox (date, place): the text typed, then FS's first suggestion picked, which
  // makes it standard ("Vågå, Oppland, Norway", the municipality 1781–2019). Without
  // one the text stays as typed. No blur before picking: it closes the list.
  // FS's suggestion to take for a typed date or place. FS's fact dialogs list the text
  // as typed first ("Vågå, Oppland"), then the standard forms, a place's with a line
  // of its kind and years ("Municipality, 1781 - 2019"): the typed entry is skipped,
  // and of the places named like the typed one (the same first part, or as an
  // "Alternate Name:", å as aa: Vaagaa is Vågå; with a farm, the same municipality
  // too) the first whose years hold `year` (Vågå, Oppland for 1846; Vågå, Innlandet
  // from 2020) is taken, else the first. None named so: the text as typed (null when
  // FS doesn't list it), since FS also lists places around the name ("Bakken nedre,
  // Vågå" brings the municipality, and farms called Bakken elsewhere) and the farm
  // would be lost
  function pickSuggestion(options, typed, year) {
    const lines = (o) => [...o.querySelectorAll('*')].filter((e) => !e.children.length && clean(e.textContent)).map((e) => clean(e.textContent));
    const fold = (text) => clean(text).toLowerCase();
    let rest = options;
    if (options.length > 1 && fold(options[0].textContent) === fold(typed)) rest = options.slice(1);
    const kinds = rest.filter((o) => lines(o).length > 1);
    if (!kinds.length) return rest[0];
    const holds = (o) => {
      const m = lines(o).slice(1).join(' ').match(/(\d{3,4}|Unknown)\s*-\s*(\d{3,4}|Present)/i);
      if (!m) return false;
      const from = /^\d/.test(m[1]) ? Number(m[1]) : -Infinity;
      const to = /^\d/.test(m[2]) ? Number(m[2]) : Infinity;
      return year >= from && year <= to;
    };
    const key = (part) => fold(part).replace(/å/g, 'aa').replace(/[æä]/g, 'ae').replace(/[øö]/g, 'o').replace(/[^a-z0-9]/g, '');
    const parts = (text) => String(text || '').split(',').map(key);
    const want = parts(typed);
    const named = kinds.filter((o) => {
      const [name, ...more] = lines(o);
      const have = parts(name);
      // A farm's place (farm, municipality, county, country): the same municipality
      if (want.length >= 4 && have.length >= 4 && have[1] !== want[1]) return false;
      const alternates = more.filter((l) => /^Alternate Names?:/i.test(l)).flatMap((l) => l.replace(/^Alternate Names?:\s*/i, '').split(',').map(key));
      return have[0] === want[0] || alternates.includes(want[0]);
    });
    if (!named.length) return rest === options ? null : options[0];
    return (year && named.find(holds)) || named[0];
  }

  // Polls of 100 ms, counted (not timed), so the tests' fast timers run them at once
  async function settledOptions(options, first) {
    const texts = (list) => list.map((o) => clean(o.textContent)).join('\n');
    const start = texts(first);
    let last = start, list = first, still = 0;
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      const now = options();
      if (texts(now) !== last) { last = texts(now); list = now; still = 0; continue; }
      still++;
      if (last !== start ? still >= 3 : still >= 15) break;
    }
    return list;
  }

  async function comboField(form, name, value, year) {
    const input = form.querySelector('input[name="' + name + '"]');
    if (!input || !value) return { name, value: input ? input.value : '' };
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const options = () => {
      const list = document.getElementById(input.getAttribute('aria-controls') || '');
      return list ? [...list.querySelectorAll('[role="option"]')] : [];
    };
    let found = [];
    try { found = await waitFor(() => { const o = options(); return o.length ? o : null; }, 'suggestions', 5000); } catch (e) { /* none */ }
    if (!found.length) return { name, value, picked: '' };
    // The list first shown can still be the field's old value's (seen on a birth's
    // place, 2026-11-09: FS's answer for the typed place came 100 ms later): the list
    // once it changes and holds still, or as first shown when it doesn't change
    found = await settledOptions(options, found);
    if (!found.length) return { name, value, picked: '' };
    const option = pickSuggestion(found, value, year);
    if (!option) return { name, value: input.value, picked: '' };
    // The text as typed is not a standard form
    const typed = clean(option.textContent).toLowerCase() === clean(value).toLowerCase();
    const picked = typed ? '' : clean(option.textContent);
    option.click();
    await sleep(300);
    return { name, value: input.value, picked };
  }

  // The possible matches FS lists: [{pid, name, lifespan, events, spouses}]
  function addMatches(dialog) {
    return [...dialog.querySelectorAll('[data-testid="add-person-match-button"]')].map((button) => {
      let box = button.parentElement;
      while (box && box !== dialog && !box.querySelector('[data-testid="pid"]')) box = box.parentElement;
      const persons = [...(box || dialog).querySelectorAll('[data-testid="person"]')];
      const main = persons.find((p) => !p.closest('[data-testid="spouses"]')) || persons[0];
      const text = (id, root) => clean((byTestId(id, root) || {}).textContent);
      const spouses = persons.filter((p) => p !== main && p.closest('[data-testid="spouses"]')).map((p) => text('fullName', p));
      const events = [...(box || dialog).querySelectorAll('[data-testid$="-event"]')]
        .filter((e) => !e.closest('[data-testid="spouses"]')).map((e) => clean(e.textContent));
      return { pid: text('pid', main), name: text('fullName', main), lifespan: text('lifespan', main), events, spouses };
    }).filter((m) => m.pid);
  }

  async function findPerson({ relation, anchor, other, person }) {
    anchor = (anchor || '').toUpperCase();
    other = (other || '').toUpperCase();
    const pid = /^[A-Z0-9]{4}-[A-Z0-9]{2,4}$/;
    if (!pid.test(anchor) || (other && !pid.test(other))) throw new Error('Not a FamilySearch PID: ' + (pid.test(anchor) ? other : anchor));
    if (!new RegExp('/tree/person/details/' + anchor + '(/|$)', 'i').test(location.pathname)) {
      throw new Error('FamilySearch did not open the tree person ' + anchor + '. Please sign in to FamilySearch and try again.');
    }
    const button = await waitFor(() => addButton(relation, anchor, other), 'the family section to add the person in');
    button.click();
    const dialog = await waitFor(() => { const d = addDialog(); return d && byTestId('first-name', d) ? d : null; }, 'the Add Person form');
    // Norway's name template (the same fields), when FS offers it
    const template = dialog.querySelector('select[name="template"]');
    if (template && [...template.options].some((o) => o.value === 'no') && template.value !== 'no') {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(template, 'no');
      template.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(500);
    }
    const form = addDialog();
    setValue(await waitFor(() => byTestId('first-name', form), 'the name fields'), person.given);
    setValue(byTestId('last-name', form), person.surname);
    const radio = (name, value) => {
      const r = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
      if (r && !r.checked) r.click();
      return !!r;
    };
    radio('sex', person.sex || 'unknown');
    radio('status', 'deceased');
    const fields = [];
    const yearOf = (date) => { const m = String(date || '').match(/\b(\d{4})\b/); return m ? Number(m[1]) : null; };
    const years = { birthPlace: yearOf(person.birthDate), deathPlace: yearOf(person.deathDate) };
    for (const name of ['birthDate', 'birthPlace', 'deathDate', 'deathPlace']) fields.push(await comboField(form, name, person[name], years[name]));
    await sleep(300);
    const heading = clean(((form.querySelector('h1, h2, h3, [role="heading"]') || {}).textContent) || '');
    (await waitFor(() => byTestId('next-button', addDialog()), 'the Next button')).click();
    // The results: Create Person comes with them (after the matches have loaded)
    await waitFor(() => byTestId('create-new-button', addDialog() || document), 'the possible matches', 30000);
    await sleep(800);
    return { ok: true, heading, fields, matches: addMatches(addDialog()) };
  }

  // Every PID the page names outside the dialog (links, the PID chips, family cards)
  function pagePids() {
    const pids = new Set();
    const dialog = addDialog();
    for (const a of document.querySelectorAll('a[href*="/tree/person/"]')) {
      if (dialog && dialog.contains(a)) continue;
      const m = (a.getAttribute('href') || '').match(/\/tree\/person\/(?:details\/)?([A-Z0-9]{4}-[A-Z0-9]{2,4})\b/i);
      if (m) pids.add(m[1].toUpperCase());
    }
    for (const el of document.querySelectorAll('[data-testid="pid"], [data-testid^="family-"]')) {
      if (dialog && dialog.contains(el)) continue;
      const text = el.getAttribute('data-testid') === 'pid' ? el.textContent : el.getAttribute('data-testid');
      for (const m of (text || '').matchAll(/[A-Z0-9]{4}-[A-Z0-9]{2,4}/gi)) pids.add(m[0].toUpperCase());
    }
    return pids;
  }

  async function createPerson() {
    const dialog = addDialog();
    const create = dialog && byTestId('create-new-button', dialog);
    if (!create) throw new Error('FamilySearch no longer shows its Add Person form.');
    const before = pagePids();
    const page = location.pathname;
    create.click();
    // The dialog closes and the family card shows the new person (or FS opens their page)
    const start = Date.now();
    while (Date.now() - start < 30000) {
      await sleep(250);
      if (location.pathname !== page) {
        const m = location.pathname.match(/\/tree\/person\/(?:details\/)?([A-Z0-9]{4}-[A-Z0-9]{2,4})\b/i);
        if (m && !before.has(m[1].toUpperCase())) return { ok: true, pid: m[1].toUpperCase() };
      }
      const open = addDialog();
      if (open && !byTestId('create-new-button', open) && Date.now() - start > 8000) {
        // A step this code doesn't know: left to the user, in FS's own dialog
        throw new Error('FamilySearch asks for more in its dialog (finish it there, then type the new PID on the linker page): ' + clean(open.textContent).slice(0, 200));
      }
      if (!open) {
        const added = [...pagePids()].filter((pid) => !before.has(pid));
        if (added.length === 1) return { ok: true, pid: added[0] };
      }
    }
    throw new Error('FamilySearch did not show the new person in time. Look for them on the FamilySearch tab, and type their PID on the linker page.');
  }

  async function cancelAdd() {
    const dialog = addDialog();
    const cancel = dialog && byTestId('cancel-button', dialog);
    if (cancel) cancel.click();
    return { ok: true };
  }

  // --- The record's facts added to the tree person ----------------------------------
  // FS's fact form (`conclusion-dialog`, looked at on 2026-11-09): opened by the add
  // buttons, or for an existing fact by its pencil (a view of the fact with its sources
  // and Tag Sources) and Edit. Its fields carry their testids and names: title,
  // description, date and place (comboboxes), justification (the reason); Save
  // (`conclusionDetailOverlay:submit:button`), Cancel (`add-edit:cancel-action`; from
  // Edit it goes back to the view, which closes with its Close button).

  const conclusionDialog = () => byTestId('conclusion-dialog');
  const VITALS = ['BIRTH', 'CHRISTENING', 'DEATH', 'BURIAL'];
  // The add-event menu's items (no testids; the English page's text)
  const EVENT_ITEMS = { RESIDENCE: /^residence$/i, OCCUPATION: /^occupation$/i, OTHER_EVENT: /^custom event$/i };
  const displays = (type) => [...document.querySelectorAll('[data-testid="conclusionDisplay:' + type + '"]')];
  // The fact's English name in messages (linker.js fsMessage() translates them)
  const factName = (type) => (type === 'OTHER_EVENT' ? 'custom event' : String(type).toLowerCase().replace(/_/g, ' '));
  const yearIn = (text) => { const m = String(text || '').match(/\b(\d{4})\b/); return m ? Number(m[1]) : null; };

  function onPersonPage(pid) {
    pid = String(pid || '').toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{2,4}$/.test(pid)) throw new Error('Not a FamilySearch PID: ' + pid);
    if (!new RegExp('/tree/person/details/' + pid + '(/|$)', 'i').test(location.pathname)) {
      throw new Error('FamilySearch did not open the tree person ' + pid + '. Please sign in to FamilySearch and try again.');
    }
    return pid;
  }

  // The form of a fact, empty for an addition, FS's for an edit
  async function openFactForm(addition) {
    // FS takes its time closing a dialog while its window isn't drawn
    await waitGone(conclusionDialog, 'the last form to close', 20000);
    const { type, action } = addition;
    let opener;
    if (action === 'name') {
      opener = await waitFor(() => byTestId('add-alternate-name'), 'Add Alternate Name');
    } else if (action === 'edit') {
      const display = await waitFor(() => displays(type)[0], 'the ' + factName(type) + ' to change');
      opener = byTestId('pencil-edit-button', display);
    } else if (VITALS.includes(type)) {
      opener = document.querySelector('[data-testid="highlight-' + type + '"] [data-testid="conclusion:add:button"]');
      if (!opener && displays(type).length) throw new Error('FamilySearch already has a ' + factName(type) + ' for this person; change it instead.');
    } else {
      (await waitFor(() => byTestId('add-new-otherEvent-button'), 'Add Event')).click();
      opener = await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')].find((i) => EVENT_ITEMS[type] && EVENT_ITEMS[type].test(clean(i.textContent))), 'the event menu');
    }
    if (!opener) throw new Error('FamilySearch shows no button to ' + (action === 'edit' ? 'change' : 'add') + ' the ' + factName(type) + '.');
    opener.click();
    const form = () => { const d = conclusionDialog(); return d && byTestId('conclusionDetailOverlay:reason', d) ? d : null; };
    try {
      if (action === 'edit') {
        // A fact with sources opens its view (Edit there), one without the form itself
        // (seen on a death with no sources, 2026-11-09)
        const next = await waitFor(() => form() || byTestId('ConclusionDialog:edit:button', conclusionDialog() || document), 'the ' + factName(type) + ' to change');
        if (next.getAttribute('data-testid') === 'ConclusionDialog:edit:button') next.click();
      }
      return await waitFor(form, 'the form');
    } catch (error) {
      // Not left open, which would hold up the next fact
      await closeFactDialog();
      throw error;
    }
  }

  async function fillFactForm(form, addition, reason) {
    const v = addition.value || {};
    const fields = [];
    if (addition.action === 'name') {
      const set = (name, value) => {
        const select = form.querySelector('select[name="' + name + '"]');
        if (!select || ![...select.options].some((o) => o.value === value) || select.value === value) return;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('nameType', v.nameType || 'AKA');
      set('template', 'no');
      await sleep(300);
      const now = conclusionDialog() || form;
      setValue(await waitFor(() => byTestId('first-name', now), 'the name fields'), v.given);
      setValue(byTestId('last-name', now), v.surname);
      fields.push({ name: 'given', value: v.given || '' }, { name: 'surname', value: v.surname || '' });
    } else {
      // FS wraps each field in a div of the same name: the input itself
      const input = (name) => form.querySelector('input[name="' + name + '"], textarea[name="' + name + '"]');
      if (addition.title && input('title')) { setValue(input('title'), addition.title); fields.push({ name: 'title', value: addition.title }); }
      if (v.description && input('description')) { setValue(input('description'), v.description); fields.push({ name: 'description', value: v.description }); }
      const year = yearIn(v.date);
      if (v.date) fields.push(await comboField(form, 'date', v.date, year));
      if (v.place) fields.push(await comboField(form, 'place', v.place, year));
    }
    setValue(byTestId('conclusionDetailOverlay:reason', conclusionDialog() || form), reason || '');
    return fields;
  }

  // Out of the form, and the fact's view (after an edit) closed
  async function closeFactDialog() {
    const d = conclusionDialog();
    const cancel = d && byTestId('add-edit:cancel-action', d);
    if (cancel) {
      cancel.click();
      // A form opened without a view may stay after Cancel: closed with its Close then
      await waitFor(() => !conclusionDialog() || !byTestId('conclusionDetailOverlay:reason', conclusionDialog()), 'the form to close', 3000).catch(() => {});
    }
    const view = conclusionDialog();
    const close = view && view.querySelector('button[aria-label="Close"]');
    if (close) close.click();
    await waitGone(conclusionDialog, 'the form to close', 20000).catch(() => {});
  }

  // addFact: the addition filled into FS's form; `save` false: the fields as FS took
  // them (the places picked) read back and the form cancelled, nothing saved
  async function addFact({ pid, addition, reason, save }) {
    onPersonPage(pid);
    const type = addition.type;
    const before = new Set(displays(type).map((e) => clean(e.textContent)));
    const form = await openFactForm(addition);
    let fields;
    try {
      fields = await fillFactForm(form, addition, reason);
      await sleep(300);
    } catch (error) {
      await closeFactDialog();
      throw error;
    }
    if (!save) {
      await closeFactDialog();
      return { ok: true, fields };
    }
    const submit = await waitFor(() => byTestId('conclusionDetailOverlay:submit:button', conclusionDialog() || document), 'the Save button');
    // FS's message in the form, if it shows one
    const problem = () => {
      const d = conclusionDialog();
      const alert = d && d.querySelector('[role="alert"], [aria-invalid="true"]');
      return alert ? clean(alert.textContent || alert.getAttribute('aria-label')).slice(0, 200) : '';
    };
    // FS keeps an edit's Save off while the form holds what FS has already (saved by
    // an earlier run): nothing to change. The form is never left open.
    const off = () => submit.disabled || submit.getAttribute('aria-disabled') === 'true';
    if (off()) await sleep(1000);
    if (off()) {
      const why = problem();
      await closeFactDialog();
      if (!why && addition.action === 'edit') return { ok: true, fields, unchanged: true };
      throw new Error('FamilySearch did not take the ' + factName(type) + (why ? ': ' + why : '.'));
    }
    submit.click();
    // Saved: the form closes (an edit's back to its view, closed then); still open: FS's message
    try {
      await waitFor(() => !conclusionDialog() || !byTestId('conclusionDetailOverlay:reason', conclusionDialog()), 'the form to close', 20000);
    } catch (error) {
      const why = problem();
      await closeFactDialog();
      throw new Error('FamilySearch did not save the ' + factName(type) + (why ? ': ' + why : '.'));
    }
    await closeFactDialog();
    // The fact as FS shows it now: the one not there before (an edit: the only one)
    let shown = '';
    try {
      const el = await waitFor(() => (addition.action === 'edit' ? displays(type)[0] : displays(type).find((e) => !before.has(clean(e.textContent)))), 'the saved fact', 10000);
      shown = clean(el.textContent);
    } catch (e) { /* saved, not seen yet */ }
    return { ok: true, fields, shown };
  }

  // tagFact: the source tagged to the fact, from the fact's view: Tag Sources, the
  // source (its SourceBox ID), Tag To. The fact is the one whose text has `match`
  // (the date, a description) among the facts of its type, else the last one.
  async function tagFact({ pid, type, match, sourceId, title }) {
    onPersonPage(pid);
    await waitGone(conclusionDialog, 'the last form to close', 20000);
    const all = await waitFor(() => { const d = displays(type); return d.length ? d : null; }, 'the ' + factName(type));
    const words = (match || []).filter(Boolean).map((m) => clean(m).toLowerCase());
    // An alternate name by the name itself: Ola Olsen's words are in Ola Nordmann Olsen too
    const nameOf = (e) => clean((byTestId('conclusion-name-template', e) || {}).textContent).toLowerCase();
    // Else the one with every word, else the one of the year; a guess only when FS has
    // one of the type: a person can have several residences (sorted by date), and a
    // source tagged to another year's would be wrong without a word said
    const has = (e, w) => clean(e.textContent).toLowerCase().includes(w);
    const year = words.find((w) => /^\d{4}$/.test(w));
    const only = (list) => (list.length === 1 ? list[0] : null);
    const fact = (type === 'ALTERNATE_NAME' && all.find((e) => nameOf(e) === words.join(' '))) ||
      all.find((e) => words.length && words.every((w) => has(e, w))) ||
      (year && only(all.filter((e) => has(e, year)))) || only(all);
    if (!fact) throw new Error('FamilySearch has more than one ' + factName(type) + ' and none is clearly this one; tag the source to it by hand.');
    const pencil = byTestId('pencil-edit-button', fact);
    if (!pencil) throw new Error('FamilySearch shows no way to open the ' + factName(type) + '.');
    pencil.click();
    const view = await waitFor(conclusionDialog, 'the fact');
    // Tagged already (FS's tag dialog after attaching may have done it): left as it is
    await sleep(500);
    if (title && [...view.querySelectorAll('[data-testid="source-heading-section"]')].some((h) => clean(h.textContent).includes(clean(title)))) {
      await closeFactDialog();
      return { ok: true, already: true };
    }
    const tagButton = await waitFor(() => [...view.querySelectorAll('button, [role="button"]')].find((b) => /^tag sources?$/i.test(clean(b.textContent))), 'Tag Sources');
    tagButton.click();
    const item = await waitFor(() => document.querySelector('[role="button"][name="' + String(sourceId).replace(/["\\]/g, '\\$&') + '"]'), 'the source in the list to tag', 15000).catch(() => null);
    if (!item) {
      const closeList = byTestId('restore-source-cancel-button');
      if (closeList) closeList.click();
      await closeFactDialog();
      throw new Error('The source is not among the person\'s sources on FamilySearch, so it could not be tagged.');
    }
    item.click();
    (await waitFor(() => byTestId('source-view-tag-button'), 'Tag To')).click();
    // FS may ask for a reason; then saved with it
    await sleep(800);
    const reason = conclusionDialog() && byTestId('conclusionDetailOverlay:reason', conclusionDialog());
    if (reason) {
      const submit = byTestId('conclusionDetailOverlay:submit:button', conclusionDialog());
      if (submit) submit.click();
    }
    await waitGone(() => byTestId('source-view-tag-button'), 'the tag to be saved', 15000).catch(() => {});
    await closeFactDialog();
    return { ok: true };
  }

  const STEPS = { findSource, attachedTo, createSource, editSource, attach, tag, findPerson, createPerson, cancelAdd, addFact, tagFact };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Only the steps themselves, not what every object has (constructor, toString)
    const step = request && typeof request.linker === 'string' && Object.hasOwn(STEPS, request.linker) && STEPS[request.linker];
    if (!step) return false;
    step(request.args || {}).then(sendResponse, (error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;  // answers later
  });
}
