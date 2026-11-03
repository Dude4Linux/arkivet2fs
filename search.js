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
  { id: 'birth', title: 'Birth or christening', fields: eventFields('birthLike') },
  { id: 'marriage', title: 'Marriage', fields: eventFields('marriageLike') },
  { id: 'residence', title: 'Residences', repeat: true, add: 'Add a residence',
    fields: [{ name: 'residencePlace', label: 'Place', wide: true },
             { name: 'residenceDate.from', label: 'From year', type: 'year' },
             { name: 'residenceDate.to', label: 'To year', type: 'year' }] },
  { id: 'death', title: 'Death or burial', fields: eventFields('deathLike') },
  { id: 'farm', title: 'Farms', repeat: true, add: 'Add a farm',
    fields: [{ name: 'farm', label: 'Farm', wide: true }] },
  // Relatives have a checkbox to use them in the searches or not (`skip`)
  { id: 'father', title: 'Father', skip: 'fatherSkip', fields: relativeFields('father') },
  { id: 'mother', title: 'Mother', skip: 'motherSkip', fields: relativeFields('mother') },
  { id: 'spouse', title: 'Spouses', repeat: true, add: 'Add a spouse', skip: 'spouseSkip', fields: relativeFields('spouse') },
  { id: 'child', title: 'Children', repeat: true, add: 'Add a child', skip: 'childSkip',
    fields: [...relativeFields('child'), { name: 'childBirthYear', label: 'Born', type: 'year' }] }
];

function eventFields(prefix) {
  return [{ name: prefix + 'Place', label: 'Place', wide: true },
          { name: prefix + 'Date.from', label: 'From year', type: 'year' },
          { name: prefix + 'Date.to', label: 'To year', type: 'year' }];
}

function relativeFields(prefix) {
  return [{ name: prefix + 'GivenName', label: 'Given names' }, { name: prefix + 'Surname', label: 'Surname' }];
}

const suffix = (k) => (k === 0 ? '' : '.' + k);
const param = (field, k) => 'q.' + field.name + suffix(k);

// --- Criteria <-> address -----------------------------------------------------------

// Record kinds that can be turned off (the `off` parameter); a query's kind is its
// id up to the first '-' (baptism-place is a baptism)
const KINDS = [
  ['baptism', 'Baptism'], ['confirmation', 'Confirmation'], ['marriage', 'Marriage'],
  ['children', "Children's baptisms"], ['census', 'Census'], ['emigration', 'Emigration'],
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
    const use = el('input', { type: 'checkbox', 'data-use': '', title: 'Use in the searches', 'aria-label': 'Use this ' + group.title.toLowerCase().replace(/s$/, '') + ' in the searches' });
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
      input = el('select', {}, field.options.map(o => el('option', { value: o, text: o || 'Any' })));
    } else {
      input = el('input', field.type === 'year'
        ? { type: 'text', inputmode: 'numeric', pattern: '\\d{4}', maxlength: '4' }
        : { type: 'text' });
    }
    input.dataset.field = field.name;
    input.value = values[field.name] || '';
    row.append(el('label', field.wide ? { class: 'wide' } : {}, [field.label, input]));
  }
  // Empties the row; on Search an empty row is dropped
  const remove = el('button', { type: 'button', class: 'remove', title: 'Clear', 'aria-label': 'Clear ' + group.title, text: '×' });
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
    const fieldset = el('fieldset', { class: 'group', 'data-group': group.id }, [el('legend', { text: group.title })]);
    const instances = criteria[group.id].length ? criteria[group.id] : [{}];
    const list = el('div');
    for (const values of instances) list.append(instanceRow(group, values));
    fieldset.append(list);
    if (group.repeat) {
      const add = el('button', { type: 'button', class: 'add', text: '+ ' + group.add });
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
  if (type === 'c') return countyName(code) + ' (county)';
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
  const fieldset = el('fieldset', { class: 'group', 'data-group': 'where' }, [el('legend', { text: 'Where to search' })]);
  const chips = el('div', { class: 'chips' });
  const chosen = [...criteria.where.c.map((code) => ['c', code]), ...criteria.where.m.map((code) => ['m', code])];
  const has = (type, code) => !!chips.querySelector(`.chip[data-type="${type}"][data-code="${code}"]`);
  const addChip = (type, code) => {
    if (has(type, code)) return;
    const remove = el('button', { type: 'button', class: 'remove', title: 'Remove', 'aria-label': 'Remove ' + placeLabel(type, code), text: '×' });
    const chip = el('span', { class: 'chip', 'data-type': type, 'data-code': code }, [placeLabel(type, code), remove]);
    remove.addEventListener('click', () => { chip.remove(); searchNow(); });
    chips.append(chip);
  };
  for (const [type, code] of chosen) addChip(type, code);

  const list = el('datalist', { id: 'da-places' }, [...placesByLabel().keys()].sort((a, b) => a.localeCompare(b, 'nb')).map((label) => el('option', { value: label })));
  const input = el('input', { type: 'text', list: 'da-places', placeholder: 'County or municipality', 'aria-label': 'Add a county or municipality' });
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
    fieldset.append(el('div', { class: 'suggest muted' }, ['From the FS places: ', ...suggested.map((code) => {
      const button = el('button', { type: 'button', class: 'add', text: '+ ' + municipalityName(code) });
      button.addEventListener('click', () => { addChip('m', code); searchNow(); });
      return button;
    })]));
  }
  fieldset.append(el('p', { class: 'help muted', text: chosen.length ? 'Every search is limited to these places.' : 'None chosen: all of Norway.' }));
  return fieldset;
}

// Record kinds: which searches to run
function kindsGroup(criteria) {
  const fieldset = el('fieldset', { class: 'group', 'data-group': 'kinds' }, [el('legend', { text: 'Record kinds' })]);
  const boxes = el('div', { class: 'kinds' });
  for (const [kind, label] of KINDS) {
    const box = el('input', { type: 'checkbox', 'data-kind': kind });
    box.checked = !criteria.off.includes(kind);
    box.addEventListener('change', searchNow);
    boxes.append(el('label', {}, [box, ' ' + label]));
  }
  fieldset.append(boxes);
  return fieldset;
}

// --- Results --------------------------------------------------------------------------

// Each search (render) gets a number; a newer search makes older ones stop updating
let generation = 0;

function hitRow(hit) {
  const details = [
    hit.role,
    hit.date,
    hit.born ? 'b. ' + hit.born : '',
    hit.domicile,
    hit.position
  ].filter(Boolean).join(' · ');
  const reasons = el('ul', { class: 'reasons' }, hit.reasons.map((r) => el('li', {
    class: r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'near',
    text: (r.ok === true ? '✓ ' : r.ok === false ? '✗ ' : '≈ ') + r.text
  })));
  // The record page was read (da_verify.js): say so, or why it couldn't be
  if (hit.checks) {
    reasons.append(el('li', { class: 'checked muted', text: hit.checkError ? 'record not read: ' + hit.checkError
      : hit.checks.length ? 'record checked' : 'record checked: no relatives to compare' }));
  }
  return el('li', { class: 'hit' + (hit.score < 0 ? ' unlikely' : '') }, [
    el('span', { class: 'hit-score', title: 'Score', text: String(hit.score) }),
    el('div', { class: 'hit-main' }, [
      el('a', { href: hit.url, target: '_blank', rel: 'noopener', class: 'hit-name', text: hit.name || hit.id }),
      el('div', { class: 'hit-details', text: details }),
      el('div', { class: 'hit-source muted', text: hit.source }),
      reasons
    ])
  ]);
}

// One line per query: what it searched for, how many hits, and the same search on DA
function queryRow(query) {
  const status = el('span', { class: 'query-status muted', text: query.skip || 'Waiting…' });
  const link = query.skip ? null : el('a', { href: daSearchUrl(query.params), target: '_blank', rel: 'noopener', class: 'query-open', text: 'Open on DA' });
  const row = el('li', { class: 'query' + (query.skip ? ' skipped' : ''), 'data-query': query.id }, [
    el('span', { class: 'query-title', text: query.title }),
    el('span', { class: 'query-summary muted', text: query.summary }),
    status,
    link || ''
  ]);
  const hint = el('span', { class: 'query-hint muted', hidden: '' });
  row.append(hint);
  return { row, status, link, hint };
}

// What to change when a search finds too many hits or none, or '' when it's fine
function hintFor(query, params, total, read) {
  const placed = params.has('m[]') || params.has('c[]');
  if (total > read) {
    return placed ? 'Too many to read them all: narrow the years, or add a farm or a relative.'
      : 'Too many to read them all: choose a county or municipality under Where to search, or narrow the years.';
  }
  if (total > 0) return '';
  const tries = [];
  if (params.has('related_first_name')) {
    tries.push(query.id === 'baptism' ? 'untick the parent (DA’s transcriptions of parents can be far off)' : 'untick the spouse');
  }
  if (params.has('m[]') || params.has('c[]')) tries.push('remove places under Where to search');
  if (params.has('domicile')) tries.push('spell the farm as DA does');
  tries.push('widen the years');
  if (params.has('lastname')) tries.push('try another spelling of the surname');
  const text = tries.join('; ');
  return 'Nothing found: ' + text + '.';
}

// Read the record pages of the best hits in each group and score what they say
// (da_verify.js), one at a time, re-rendering after each. A checked hit can drop
// out of the top, so the best unchecked ones are picked again each time.
async function checkHits(run, merged, person, container, status) {
  const MAX_CHECKS = 30;
  let checked = 0;
  while (run === generation && checked < MAX_CHECKS) {
    const hit = hitsToCheck(groupHits(merged, person)).find((h) => !merged.get(h.id || h.url).checks);
    if (!hit) break;
    status.textContent = 'Checking the records of the best hits (' + (checked + 1) + ')…';
    const entry = merged.get(hit.id || hit.url);
    try {
      entry.checks = checkRecord(await fetchRecord(hit), person);
    } catch (error) {
      entry.checks = [];
      entry.checkError = error.message;
      if (/refusing/.test(error.message)) {
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
    status.textContent = checked ? 'Checked the records of the best ' + checked + ' hits against the FS relatives.' : '';
  }
}

function renderGroups(container, merged, person) {
  const groups = groupHits(merged, person);
  container.replaceChildren(...groups.map((group) => el('section', { class: 'group-hits' }, [
    el('h3', {}, [group.title, el('span', { class: 'count muted', text: ' ' + group.hits.length })]),
    el('ol', { class: 'hits' }, group.hits.map(hitRow))
  ])));
}

async function renderResults(criteria) {
  const run = ++generation;
  const name = criteria.name[0] || {};
  const fullName = [name.givenName, name.surname].filter(Boolean).join(' ');
  document.getElementById('results-title').textContent = fullName ? 'Results for ' + fullName : 'Results';
  document.title = (fullName ? fullName + ' – ' : '') + 'Digital Arkivet search';

  const results = document.getElementById('results');
  const queries = buildQueries(criteria);
  if (queries.length === 0) {
    results.replaceChildren(el('section', {}, [el('p', { class: 'muted', text: 'Enter a given name or surname to search.' })]));
    return;
  }
  const person = profile(criteria);
  const views = queries.map((query) => ({ query, ...queryRow(query) }));
  const groups = el('div', { class: 'groups' });
  const checkStatus = el('p', { class: 'check-status muted' });
  results.replaceChildren(
    el('section', { class: 'searches' }, [el('h3', { text: 'Searches' }), el('ul', { class: 'queries' }, views.map((v) => v.row)), checkStatus]),
    groups
  );

  // One query at a time: DA rate-limits automated traffic
  const merged = new Map();
  let refused = false;
  for (const [i, view] of views.entries()) {
    if (run !== generation) return;
    if (view.query.skip) continue;
    view.status.textContent = 'Searching…';
    try {
      const { total, hits, params, notes } = await runQuery(view.query);
      if (run !== generation) return;
      // The link opens the search that was used (another name, or narrowed to places)
      view.link.href = daSearchUrl(params);
      const count = total === 0 ? 'no hits'
        : total > hits.length ? `${total} hits, the first ${hits.length} used`
        : `${total} hit${total === 1 ? '' : 's'}`;
      const text = [...notes, count].join('; ');
      view.status.textContent = text[0].toUpperCase() + text.slice(1);
      const hint = hintFor(view.query, params, total, hits.length);
      view.hint.textContent = hint;
      view.hint.hidden = !hint;
      mergeHits(merged, view.query, hits);
      renderGroups(groups, merged, person);
    } catch (error) {
      if (run !== generation) return;
      view.status.textContent = error.message;
      view.status.classList.add('error');
      if (/refusing/.test(error.message)) {
        refused = true;
        for (const rest of views.slice(i + 1)) if (!rest.query.skip) rest.status.textContent = 'Not run';
        break;
      }
    }
  }
  if (run === generation && merged.size === 0) {
    groups.replaceChildren(el('section', {}, [el('p', { class: 'muted', text: 'No records found. Try removing details in the criteria, or a shorter surname.' })]));
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
    fsLink.href = 'https://www.familysearch.org/en/tree/person/details/' + encodeURIComponent(treeref);
    fsLink.textContent = 'Open ' + treeref + ' on FamilySearch';
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
render();
