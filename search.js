// DigitalArkivet search page (Phase 2).
// The criteria live in this page's address, like FS's record search
// (q.givenName, q.surname.1, q.birthLikeDate.from, ...; see personToQuery() in
// background.js). The sidebar is filled from the address; Search writes the edited
// criteria back to it, so Back/Forward step through earlier searches.

// Sidebar groups. A field's parameter is 'q.' + name, plus '.1', '.2', ... for the
// second, third, ... instance of a repeated group.
const GROUPS = [
  { id: 'name', title: 'Names', repeat: true, add: 'Add a name',
    fields: [{ name: 'givenName', label: 'Given names' }, { name: 'surname', label: 'Surname' }] },
  { id: 'sex', title: 'Sex',
    fields: [{ name: 'sex', label: 'Sex', type: 'select', options: ['', 'Male', 'Female'] }] },
  // FS's birth date as written (16 July 1846), for scoring by the exact year and day
  { id: 'birth', title: 'Birth or christening', fields: [eventFields('birthLike')[0],
    { name: 'birthLikeDate', label: 'Date', wide: true }, ...eventFields('birthLike').slice(1)] },
  { id: 'marriage', title: 'Marriage', fields: eventFields('marriageLike') },
  { id: 'residence', title: 'Residences', repeat: true, add: 'Add a residence',
    fields: [{ name: 'residencePlace', label: 'Place', wide: true },
             { name: 'residenceDate.from', label: 'From year', type: 'year' },
             { name: 'residenceDate.to', label: 'To year', type: 'year' }] },
  { id: 'emigration', title: 'Emigration or immigration', fields: [...eventFields('emigrationLike'),
    // FS's first event outside Norway (background.js): searches end two years after it
    { name: 'abroadPlace', label: 'First place abroad', wide: true }, { name: 'abroadYear', label: 'Year', type: 'year' }] },
  { id: 'death', title: 'Death or burial', fields: eventFields('deathLike') },
  { id: 'farm', title: 'Farms', repeat: true, add: 'Add a farm',
    fields: [{ name: 'farm', label: 'Farm', wide: true }] },
  // Relatives have a checkbox to use them in the searches or not (`skip`)
  { id: 'father', title: 'Father', skip: 'fatherSkip', fields: relativeFields('father') },
  { id: 'mother', title: 'Mother', skip: 'motherSkip', fields: relativeFields('mother') },
  { id: 'spouse', title: 'Spouses', repeat: true, add: 'Add a spouse', skip: 'spouseSkip', fields: relativeFields('spouse') },
  { id: 'child', title: 'Children', repeat: true, add: 'Add a child', skip: 'childSkip', fields: relativeFields('child') }
];

function eventFields(prefix) {
  return [{ name: prefix + 'Place', label: 'Place', wide: true },
          { name: prefix + 'Date.from', label: 'From year', type: 'year' },
          { name: prefix + 'Date.to', label: 'To year', type: 'year' }];
}

function relativeFields(prefix) {
  return [{ name: prefix + 'GivenName', label: 'Given names' }, { name: prefix + 'Surname', label: 'Surname' },
    { name: prefix + 'BirthYear', label: 'Born', type: 'year' }];
}

const suffix = (k) => (k === 0 ? '' : '.' + k);
const param = (field, k) => 'q.' + field.name + suffix(k);

// --- Criteria <-> address -----------------------------------------------------------

// Record kinds that can be turned off (the `off` parameter); a query's kind is its
// id up to the first '-' (baptism-place is a baptism)
const KINDS = [
  ['baptism', 'Baptism'], ['confirmation', 'Confirmation'], ['marriage', 'Marriage'],
  ['children', "Children's baptisms"], ['childmarriage', "Children's marriages"], ['census', 'Census'], ['emigration', 'Emigration'],
  ['moving', 'Moving away'], ['burial', 'Burial'], ['farm', 'Records at farms'], ['other', 'All records under the name']
];

// The address's criteria as { groupId: [ {fieldName: value}, ... ], where: { m, c },
// off: [kind] }. A relative turned off has q.<prefix>Skip=1 (e.g. q.fatherSkip).
function readCriteria(params) {
  const criteria = {};
  for (const group of GROUPS) {
    const instances = [];
    for (let k = 0; k < (group.repeat ? 100 : 1); k++) {
      const values = {};
      for (const field of group.fields) values[field.name] = params.get(param(field, k)) || '';
      if (!Object.values(values).some(Boolean)) {
        // Repeated groups are numbered without gaps; stop at the first empty one
        if (group.repeat) break;
      }
      if (group.skip) values[group.skip] = params.get('q.' + group.skip + suffix(k)) === '1';
      instances.push(values);
    }
    criteria[group.id] = instances;
  }
  // Where to search: DA municipality (m) and county (c) codes
  criteria.where = {
    m: params.getAll('m').filter((code) => municipalityCodeList().includes(code)),
    c: params.getAll('c').filter((code) => countyCodeList().includes(code))
  };
  criteria.off = (params.get('off') || '').split(',').filter((kind) => KINDS.some(([id]) => id === kind));
  return criteria;
}

// The sidebar's values → address parameters, dropping empty fields and renumbering
// repeated groups so they stay without gaps
function formToParams(form, treeref) {
  const params = new URLSearchParams();
  if (treeref) params.set('treeref', treeref);
  for (const group of GROUPS) {
    let k = 0;
    for (const instance of form.querySelectorAll(`[data-group="${group.id}"] .instance`)) {
      const values = group.fields.map(field => [field, instance.querySelector(`[data-field="${field.name}"]`).value.trim()]);
      if (!values.some(([, v]) => v)) continue;
      for (const [field, v] of values) if (v) params.set(param(field, k), v);
      const use = instance.querySelector('[data-use]');
      if (use && !use.checked) params.set('q.' + group.skip + suffix(k), '1');
      k++;
    }
  }
  for (const chip of form.querySelectorAll('[data-group="where"] .chip')) params.append(chip.dataset.type, chip.dataset.code);
  const off = [...form.querySelectorAll('[data-group="kinds"] input[data-kind]')].filter((box) => !box.checked).map((box) => box.dataset.kind);
  if (off.length) params.set('off', off.join(','));
  return params;
}

// --- Sidebar --------------------------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

// Search again now (for checkboxes and places, which have no Search of their own)
const searchNow = () => document.getElementById('criteria').requestSubmit();

function instanceRow(group, values) {
  const row = el('div', { class: 'instance' + (group.skip ? ' has-use' : '') });
  row.style.setProperty('--cols', String(Math.max(2, group.fields.filter(f => !f.wide).length)));
  if (group.skip) {
    const use = el('input', { type: 'checkbox', 'data-use': '', title: t('Use in the searches'), 'aria-label': t('Use this {what} in the searches', { what: t(group.id) }) });
    use.checked = !values[group.skip];
    row.classList.toggle('off', !use.checked);
    use.addEventListener('change', () => {
      row.classList.toggle('off', !use.checked);
      searchNow();
    });
    row.append(use);
  }
  for (const field of group.fields) {
    let input;
    if (field.type === 'select') {
      input = el('select', {}, field.options.map(o => el('option', { value: o, text: o ? t(o) : t('Any') })));
    } else {
      input = el('input', field.type === 'year'
        ? { type: 'text', inputmode: 'numeric', pattern: '\\d{4}', maxlength: '4' }
        : { type: 'text' });
    }
    input.dataset.field = field.name;
    input.value = values[field.name] || '';
    row.append(el('label', field.wide ? { class: 'wide' } : {}, [t(field.label), input]));
  }
  // Empties the row; on Search an empty row is dropped
  const remove = el('button', { type: 'button', class: 'remove', title: t('Clear'), 'aria-label': t('Clear {what}', { what: t(group.title) }), text: '×' });
  remove.addEventListener('click', () => {
    if (group.repeat && row.parentElement.querySelectorAll('.instance').length > 1) row.remove();
    else row.querySelectorAll('input, select').forEach(i => { i.value = ''; });
  });
  row.append(remove);
  return row;
}

function renderSidebar(criteria) {
  const container = document.getElementById('groups');
  container.replaceChildren();
  for (const group of GROUPS) {
    const fieldset = el('fieldset', { class: 'group', 'data-group': group.id }, [el('legend', { text: t(group.title) })]);
    const instances = criteria[group.id].length ? criteria[group.id] : [{}];
    const list = el('div');
    for (const values of instances) list.append(instanceRow(group, values));
    fieldset.append(list);
    if (group.repeat) {
      const add = el('button', { type: 'button', class: 'add', text: '+ ' + t(group.add) });
      add.addEventListener('click', () => list.append(instanceRow(group, {})));
      fieldset.append(add);
    }
    container.append(fieldset);
  }
  container.append(whereGroup(criteria), kindsGroup(criteria));
}

// A municipality or county as the type-ahead shows it: "Vigmostad (Vest-Agder)",
// "Vest-Agder (county)"; Oslo and Bergen are counties of one municipality
function placeLabel(type, code) {
  if (type === 'c') return t('{name} (county)', { name: countyName(code) });
  const county = countyName(code.slice(0, 2));
  const name = municipalityName(code);
  return county !== name ? name + ' (' + county + ')' : name;
}

let placeOptions = null; // label → { type, code }, built on first use
function placesByLabel() {
  if (!placeOptions) {
    placeOptions = new Map();
    for (const code of municipalityCodeList()) placeOptions.set(placeLabel('m', code), { type: 'm', code });
    for (const code of countyCodeList()) placeOptions.set(placeLabel('c', code), { type: 'c', code });
  }
  return placeOptions;
}

// Where to search: chosen counties and municipalities as chips, a type-ahead to add
// one, and the municipalities of the FS places as suggestions. None chosen searches
// all of Norway.
function whereGroup(criteria) {
  const fieldset = el('fieldset', { class: 'group', 'data-group': 'where' }, [el('legend', { text: t('Where to search') })]);
  const chips = el('div', { class: 'chips' });
  const chosen = [...criteria.where.c.map((code) => ['c', code]), ...criteria.where.m.map((code) => ['m', code])];
  const has = (type, code) => !!chips.querySelector(`.chip[data-type="${type}"][data-code="${code}"]`);
  const addChip = (type, code) => {
    if (has(type, code)) return;
    const remove = el('button', { type: 'button', class: 'remove', title: t('Remove'), 'aria-label': t('Remove {what}', { what: placeLabel(type, code) }), text: '×' });
    const chip = el('span', { class: 'chip', 'data-type': type, 'data-code': code }, [placeLabel(type, code), remove]);
    remove.addEventListener('click', () => { chip.remove(); searchNow(); });
    chips.append(chip);
  };
  for (const [type, code] of chosen) addChip(type, code);

  const list = el('datalist', { id: 'da-places' }, [...placesByLabel().keys()].sort((a, b) => a.localeCompare(b, 'nb')).map((label) => el('option', { value: label })));
  const input = el('input', { type: 'text', list: 'da-places', placeholder: t('County or municipality'), 'aria-label': t('Add a county or municipality') });
  // A complete label picked from the list (or typed) adds the place
  const pick = () => {
    const place = placesByLabel().get(input.value.trim());
    if (!place) return false;
    input.value = '';
    addChip(place.type, place.code);
    searchNow();
    return true;
  };
  input.addEventListener('change', pick);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); pick(); }
  });

  fieldset.append(chips, el('div', { class: 'place-add' }, [input, list]));
  // Suggestions: the municipalities the FS places name, not yet chosen
  const suggested = [...new Set(profile(criteria).places.flatMap(municipalityCodes))].filter((code) => !criteria.where.m.includes(code));
  if (suggested.length) {
    fieldset.append(el('div', { class: 'suggest muted' }, [t('From the FamilySearch places:') + ' ', ...suggested.map((code) => {
      const button = el('button', { type: 'button', class: 'add', text: '+ ' + municipalityName(code) });
      button.addEventListener('click', () => { addChip('m', code); searchNow(); });
      return button;
    })]));
  }
  fieldset.append(el('p', { class: 'help muted', text: chosen.length ? t('Every search is limited to these places.') : t('None chosen: all of Norway.') }));
  return fieldset;
}

// Record kinds: which searches to run
function kindsGroup(criteria) {
  const fieldset = el('fieldset', { class: 'group', 'data-group': 'kinds' }, [el('legend', { text: t('Record kinds') })]);
  const boxes = el('div', { class: 'kinds' });
  for (const [kind, label] of KINDS) {
    const box = el('input', { type: 'checkbox', 'data-kind': kind });
    box.checked = !criteria.off.includes(kind);
    box.addEventListener('change', searchNow);
    boxes.append(el('label', {}, [box, ' ' + t(label)]));
  }
  fieldset.append(boxes);
  return fieldset;
}

// --- Results --------------------------------------------------------------------------

// Each search (render) gets a number; a newer search makes older ones stop updating
let generation = 0;

// DA's dates as FS writes them: "1845-04-06" → "6 April 1845" ("6. april 1845" in
// Norwegian: formatDate(), i18n.js), "1779-05" → "May 1779", also before a place
// ("1779-05-13, Hægebostad"); anything else ("1801", "20??.09") as it is
function displayDate(date) {
  return String(date || '').replace(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?=$|[,\s])/, (all, y, mo, d) =>
    formatDate(y, mo, d) || all);
}

// A labelled line in the Events column, as FS's "Christening 15 February 1778"
const eventLine = (label, text) => el('div', {}, [el('strong', { text: label }), el('span', { text })]);

// One hit in FS's columns: who (name, role, source), events, how it matches, score
function hitRow(hit) {
  const events = [];
  const date = displayDate(hit.date);
  if (date || hit.domicile) {
    const line = date ? eventLine(t(hit.type), date) : el('div', {}, [el('strong', { text: t(hit.type) })]);
    events.push(line);
    if (hit.domicile) events.push(el('div', { text: hit.domicile }));
  }
  if (hit.born) events.push(eventLine(t('Born'), displayDate(hit.born)));
  if (hit.position) events.push(eventLine(t('Position'), hit.position));
  const reasons = el('ul', { class: 'reasons' }, hit.reasons.map((r) => el('li', {
    class: r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'near',
    text: (r.ok === true ? '✓ ' : r.ok === false ? '✗ ' : '≈ ') + r.text
  })));
  // The record page was read (da_verify.js): say so, or why it couldn't be
  if (hit.checks) {
    reasons.append(el('li', { class: 'checked muted', text: hit.checkError ? t('record not read: {error}', { error: tMessage(hit.checkError) })
      : hit.checks.length ? t('record checked') : t('record checked: no relatives to compare') }));
  }
  // The record in the linker (linker.html), to review it as a source and attach it to
  // the FS person (the hit is their entry) and the relatives it names
  // (with the other church book's record of the event, `also`: both are reviewed together)
  const treeref = new URLSearchParams(location.search).get('treeref');
  const linkParams = { rec: hit.url };
  if (hit.parallel && hit.parallel.url) linkParams.also = hit.parallel.url;
  if (treeref) linkParams.pid = treeref;
  const link = hit.url ? el('a', { href: 'linker.html?' + new URLSearchParams(linkParams),
    target: '_blank', class: 'hit-attach', text: t('Review & Attach') }) : '';
  // The event in the parish's other church book (pairParallel(), da_match.js)
  const also = hit.parallel ? el('span', { class: 'hit-also muted' }, [
    t('Also in the other church book:') + ' ',
    el('a', { href: daPageUrl(hit.parallel.url), target: '_blank', rel: 'noopener', text: hit.parallel.name || hit.parallel.id }),
    hit.parallel.sourceUrl ? ', ' : '',
    hit.parallel.sourceUrl ? el('a', { href: daPageUrl(hit.parallel.sourceUrl), target: '_blank', rel: 'noopener', text: hit.parallel.source }) : ''
  ]) : '';
  const source = hit.sourceUrl
    ? el('a', { href: daPageUrl(hit.sourceUrl), target: '_blank', rel: 'noopener', class: 'hit-source', text: hit.source })
    : el('span', { class: 'hit-source', text: hit.source || '' });
  return el('li', { class: 'hit' + (hit.score < 0 ? ' unlikely' : '') }, [
    el('div', { class: 'hit-person' }, [
      el('a', { href: daPageUrl(hit.url), target: '_blank', rel: 'noopener', class: 'hit-name', text: hit.name || hit.id }),
      hit.role ? el('span', { class: 'hit-role', text: t(hit.role) }) : '',
      source,
      also,
      link
    ]),
    el('div', { class: 'hit-details' }, events),
    reasons,
    el('span', { class: 'hit-score', title: t('Score'), text: String(hit.score) })
  ]);
}

// Column headings above the rows, as FS's table head
const colHead = (labels) => el('div', { class: 'col-head', 'aria-hidden': 'true' },
  labels.map(([text, cls]) => el('span', cls ? { class: cls, text: t(text) } : { text: text && t(text) })));

// One line per query: what it searched for, how many hits, the search on DA, and
// (filled in when it has run) the list of its searches
function queryRow(query) {
  const status = el('span', { class: 'query-status muted', text: query.skip || t('Waiting…') });
  const link = query.skip ? null : el('a', { href: daPageUrl(daSearchUrl(query.params)), target: '_blank', rel: 'noopener', class: 'query-open', text: t('Open on DA') });
  const row = el('li', { class: 'query' + (query.skip ? ' skipped' : ''), 'data-query': query.id }, [
    el('span', { class: 'query-title', text: query.title }),
    el('span', { class: 'query-summary muted', text: query.summary }),
    status,
    link || ''
  ]);
  const hint = el('span', { class: 'query-hint muted', hidden: '' });
  const steps = el('details', { class: 'query-steps', hidden: '' });
  row.append(hint, steps);
  return { row, status, link, hint, steps };
}

// A query's searches, one line each: names, place, hits (or too many), on DA
function stepList(details, searches) {
  const count = (s) => (s.total === 0 ? t('none') : s.read ? t(s.total === 1 ? '{n} hit' : '{n} hits', { n: s.total })
    : t('{n} hits, too many to read', { n: s.total }));
  details.replaceChildren(
    el('summary', { text: t(searches.length === 1 ? '{n} search' : '{n} searches', { n: searches.length }) }),
    el('ol', {}, searches.map((s) => el('li', { class: s.read ? 'used' : '' }, [
      el('a', { href: daPageUrl(daSearchUrl(s.params)), target: '_blank', rel: 'noopener', text: s.step + ' · ' + s.place }),
      el('span', { class: 'muted', text: ': ' + count(s) })
    ])))
  );
  details.hidden = !searches.length;
}

// What to change when a query finds nothing, finds only too many, or misses some of
// what it looks for (known children, census years); '' when it's fine
function hintFor(query, result, hits) {
  const tooMany = result.searches.some((s) => s.total && !s.read);
  if (hits && result.missing.length) return t('Not found: {what}.', { what: result.missing.join(', ') });
  if (hits) return '';
  if (tooMany) {
    return t('Too many hits to read (over {n} in each search): add a birth year, a relative or a farm, or choose a municipality under Where to search.', { n: readLimit() });
  }
  const tries = [];
  if (result.searches.some((s) => s.params.has('related_first_name'))) tries.push(t('check the relatives’ names, or untick them'));
  if (result.searches.some((s) => s.params.has('m[]') || s.params.has('c[]'))) tries.push(t('check the places (or those under Where to search)'));
  if (query.base.has('domicile') || result.searches.some((s) => s.params.has('domicile'))) tries.push(t('spell the farm as DA does'));
  tries.push(t('widen the years'));
  if (result.searches.some((s) => s.params.has('lastname'))) tries.push(t('try another spelling of the surname'));
  return t('Nothing found: {what}.', { what: tries.join('; ') });
}

// Read the record pages of the best hits in each group and score what they say
// (da_verify.js), one at a time, re-rendering after each. A checked hit can drop
// out of the top, so the best unchecked ones are picked again each time.
async function checkHits(run, merged, person, container, status) {
  const MAX_CHECKS = 40;
  let checked = 0;
  while (run === generation && checked < MAX_CHECKS) {
    const hit = hitsToCheck(groupHits(merged, person), person).find((h) => !merged.get(h.id || h.url).checks);
    if (!hit) break;
    status.textContent = t('Checking the records of the best hits ({n})…', { n: checked + 1 });
    const entry = merged.get(hit.id || hit.url);
    try {
      // (the record is kept for pairParallel(): which of twins' baptisms go together)
      entry.record = await fetchRecord(hit);
      entry.checks = checkRecord(entry.record, person);
    } catch (error) {
      entry.checks = [];
      entry.checkError = error.message;
      if (error.refused) {
        status.textContent = error.message;
        status.classList.add('error');
        return;
      }
    }
    checked++;
    if (run !== generation) return;
    renderGroups(container, merged, person);
  }
  if (run === generation) {
    status.textContent = checked ? t('Checked the records of the best {n} hits against the FamilySearch relatives.', { n: checked }) : '';
  }
}

// Hits shown per group; a pager below steps through the rest
const PAGE_SIZE = 10;
// The page shown in each group (by title), kept while hits come in and are
// re-ranked, and cleared by a new search
const groupPages = new Map();

// One group's section: the page of hits it's on and, with more than PAGE_SIZE, a pager
function groupSection(group) {
  const pages = Math.ceil(group.hits.length / PAGE_SIZE);
  const page = Math.min(groupPages.get(group.title) || 0, pages - 1);
  const first = page * PAGE_SIZE;
  const shown = group.hits.slice(first, first + PAGE_SIZE);
  const section = el('section', { class: 'group-hits' }, [
    el('h3', {}, [t(group.title), el('span', { class: 'count', text: ' (' + group.hits.length + ')' })]),
    colHead([['Name'], ['Events'], ['How it matches'], ['Score', 'score']]),
    el('ol', { class: 'hits' }, shown.map(hitRow))
  ]);
  if (pages > 1) {
    const go = (to) => {
      groupPages.set(group.title, to);
      const next = groupSection(group);
      section.replaceWith(next);
      // Back to the group's top when it was scrolled past (a shorter last page)
      if (next.getBoundingClientRect().top < 0) next.scrollIntoView({ block: 'start' });
    };
    const button = (text, label, to, enabled) => {
      const b = el('button', { type: 'button', class: 'add', 'aria-label': label, text });
      b.disabled = !enabled;
      b.addEventListener('click', () => go(to));
      return b;
    };
    const title = t(group.title);
    section.append(el('nav', { class: 'pager', 'aria-label': t('{group} pages', { group: title }) }, [
      button('‹ ' + t('Previous {n}', { n: PAGE_SIZE }), t('Previous {n}', { n: PAGE_SIZE }) + ' · ' + title, page - 1, page > 0),
      el('span', { class: 'muted', text: t('{from}–{to} of {n}', { from: first + 1, to: first + shown.length, n: group.hits.length }) }),
      button(t('Next {n}', { n: PAGE_SIZE }) + ' ›', t('Next {n}', { n: PAGE_SIZE }) + ' · ' + title, page + 1, page < pages - 1)
    ]));
  }
  return section;
}

// The groups, an event in both of a parish's church books shown once (pairParallel())
function renderGroups(container, merged, person) {
  container.replaceChildren(...groupHits(merged, person).map((g) => ({ ...g, hits: pairParallel(g.hits) })).map(groupSection));
}

async function renderResults(criteria) {
  const run = ++generation;
  groupPages.clear();
  const name = criteria.name[0] || {};
  const fullName = [name.givenName, name.surname].filter(Boolean).join(' ');
  document.getElementById('results-title').textContent = fullName ? t('Results for {name}', { name: fullName }) : t('Results');
  document.title = (fullName ? fullName + ' – ' : '') + t('Digital Arkivet search');

  const results = document.getElementById('results');
  const queries = buildQueries(criteria);
  if (queries.length === 0) {
    results.replaceChildren(el('section', {}, [el('p', { class: 'muted', text: t('Enter a given name or surname to search.') })]));
    return;
  }
  const person = profile(criteria);
  const views = queries.map((query) => ({ query, ...queryRow(query) }));
  const groups = el('div', { class: 'groups' });
  const checkStatus = el('p', { class: 'check-status muted' });
  results.replaceChildren(
    el('section', { class: 'searches' }, [el('h3', { text: t('Searches') }),
      colHead([['Record kind'], ['Searched for'], ['Found'], ['']]), el('ul', { class: 'queries' }, views.map((v) => v.row)), checkStatus]),
    groups
  );

  // One query at a time: DA rate-limits automated traffic
  const merged = new Map();
  let refused = false;
  for (const [i, view] of views.entries()) {
    if (run !== generation) return;
    if (view.query.skip) continue;
    view.status.textContent = t('Searching…');
    try {
      const result = await runQuery(view.query);
      if (run !== generation) return;
      // The link opens the first search that found hits (or the first one)
      const used = result.searches.find((x) => x.read) || result.searches[0];
      if (used) view.link.href = daPageUrl(daSearchUrl(used.params));
      const ids = new Set(result.found.flatMap((f) => f.hits.map((h) => h.id || h.url)));
      const withHits = result.searches.filter((x) => x.read).length;
      const of = result.searches.length;
      const tooMany = result.searches.some((x) => x.total);
      view.status.textContent = ids.size
        ? (of > 1 ? t(ids.size === 1 ? '{n} hit from {k} of {m} searches' : '{n} hits from {k} of {m} searches', { n: ids.size, k: withHits, m: of })
          : t(ids.size === 1 ? '{n} hit' : '{n} hits', { n: ids.size }))
        : of > 1 ? t(tooMany ? 'Too many hits in {m} searches' : 'No hits in {m} searches', { m: of }) : t(tooMany ? 'Too many hits' : 'No hits');
      stepList(view.steps, result.searches);
      const hint = hintFor(view.query, result, ids.size);
      view.hint.textContent = hint;
      view.hint.hidden = !hint;
      // Each search's hits, with what that search matched (its step's reasons)
      for (const { step, hits } of result.found) mergeHits(merged, step, hits);
      renderGroups(groups, merged, person);
    } catch (error) {
      if (run !== generation) return;
      view.status.textContent = error.message;
      view.status.classList.add('error');
      if (error.refused) {
        refused = true;
        for (const rest of views.slice(i + 1)) if (!rest.query.skip) rest.status.textContent = t('Not run');
        break;
      }
    }
  }
  if (run === generation && merged.size === 0) {
    groups.replaceChildren(el('section', {}, [el('p', { class: 'muted', text: t('No records found. Try removing details in the criteria, or a shorter surname.') })]));
  }
  if (run === generation && merged.size && !refused) await checkHits(run, merged, person, groups, checkStatus);
}

// --- Page -----------------------------------------------------------------------------

function render() {
  const params = new URLSearchParams(location.search);
  const criteria = readCriteria(params);
  const treeref = params.get('treeref');
  const fsLink = document.getElementById('fs-person');
  if (treeref) {
    fsLink.href = fsPageUrl('https://www.familysearch.org/en/tree/person/details/' + encodeURIComponent(treeref));
    fsLink.textContent = t('Open {pid} on FamilySearch', { pid: treeref });
    fsLink.hidden = false;
  } else {
    fsLink.hidden = true;
  }
  renderSidebar(criteria);
  renderResults(criteria);
}

document.getElementById('criteria').addEventListener('submit', (event) => {
  event.preventDefault();
  const treeref = new URLSearchParams(location.search).get('treeref');
  const params = formToParams(event.target, treeref);
  history.pushState(null, '', '?' + params.toString());
  render();
});
window.addEventListener('popstate', render);
localizePage();
document.querySelector('.topbar').append(languageMenu());
addVersionLink(document.querySelector('.topbar'));
render();
