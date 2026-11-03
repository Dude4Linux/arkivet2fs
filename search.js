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
  { id: 'father', title: 'Father', fields: relativeFields('father') },
  { id: 'mother', title: 'Mother', fields: relativeFields('mother') },
  { id: 'spouse', title: 'Spouses', repeat: true, add: 'Add a spouse', fields: relativeFields('spouse') },
  { id: 'child', title: 'Children', repeat: true, add: 'Add a child',
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

// The address's criteria as { groupId: [ {fieldName: value}, ... ] }
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
      instances.push(values);
    }
    criteria[group.id] = instances;
  }
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
      k++;
    }
  }
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

function instanceRow(group, values) {
  const row = el('div', { class: 'instance' });
  row.style.setProperty('--cols', String(Math.max(2, group.fields.filter(f => !f.wide).length)));
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
}

// --- Results --------------------------------------------------------------------------

// DA's advanced person search for the primary name, over the person's lifetime.
// (Not a birth-year filter: most church records don't give one.)
function daAdvancedSearchUrl(criteria) {
  const url = new URL('https://www.digitalarkivet.no/en/search/persons/advanced');
  const name = criteria.name[0] || {};
  if (name.givenName) url.searchParams.set('firstname', name.givenName);
  if (name.surname) url.searchParams.set('lastname', name.surname);
  const sex = (criteria.sex[0] || {}).sex;
  if (sex) url.searchParams.append('genders[]', sex === 'Female' ? 'k' : 'm');
  const from = (criteria.birth[0] || {})['birthLikeDate.from'];
  const to = (criteria.death[0] || {})['deathLikeDate.to'];
  if (from) url.searchParams.set('event_year_from', from);
  if (to) url.searchParams.set('event_year_to', to);
  return url.toString();
}

function renderResults(criteria) {
  const name = criteria.name[0] || {};
  const fullName = [name.givenName, name.surname].filter(Boolean).join(' ');
  document.getElementById('results-title').textContent = fullName ? 'Results for ' + fullName : 'Results';
  document.title = (fullName ? fullName + ' – ' : '') + 'Digital Arkivet search';

  const results = document.getElementById('results');
  const link = el('a', { href: daAdvancedSearchUrl(criteria), target: '_blank', rel: 'noopener', text: 'Open this name search on Digital Arkivet' });
  results.replaceChildren(
    el('section', {}, [
      el('h3', { text: 'Searching Digital Arkivet' }),
      el('p', { class: 'muted', text: 'Automatic searches for this person\'s baptism, confirmation, marriage, children, censuses, emigration and burial will be listed here.' }),
      el('p', {}, [link])
    ])
  );
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
