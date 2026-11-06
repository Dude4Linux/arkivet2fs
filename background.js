// The languages (the notifications), place tables and the farm check (personToQuery)
importScripts('i18n.js', 'i18n_strings.js', 'da_places.js', 'farms.js');

// Whether an address is a page on DigitalArkivet (https, digitalarkivet.no or a
// subdomain of it)
function isDigitalArkivet(address) {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && /(^|\.)digitalarkivet\.no$/.test(url.hostname);
  } catch (e) {
    return false;
  }
}

// The toolbar icon's tooltip: the extension's name and version (manifest.json's
// "version"), set each time the service worker starts
chrome.action.setTitle({
  title: (chrome.i18n.getMessage('name') || 'DigitalArkivet to FamilySearch') + ' ' + chrome.runtime.getManifest().version
});

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');

  // Ensure the tab is not a chrome:// URL (without the "tabs" permission, a page the
  // extension may not touch has no url at all)
  const url = tab.url || '';
  if (url.startsWith('chrome://')) {
    showErrorMessage('Cannot execute script on a chrome:// URL');
    return;
  }

  // Ensure the tab is a DigitalArkivet page: its host, not just the text anywhere in
  // the address ("https://example.com/?digitalarkivet.no" isn't one)
  if (!isDigitalArkivet(url)) {
    showErrorMessage('Not a DigitalArkivet URL');
    return;
  }

  // Gather data from the current (DigitalArkivet) tab: da_record.js defines
  // gatherData() there (both run in the extension's isolated world of the page)
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['da_record.js']
  }).then(() => chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => gatherData()
  })).catch((error) => {
    console.error('Could not run da_record.js:', error);
    return null;
  }).then((results) => {
    if (!results || results == null) {
      console.error('No data gathered from DigitalArkivet');
      showErrorMessage('Failed to gather data from DigitalArkivet');
      return;
    }
    const data = results[0].result;
    console.log('Data gathered from DigitalArkivet:', data);

    // Check for extraction errors
    if (data && data.error) {
      showErrorMessage(data.error);
      return;
    }

    // The linker (linker.html) shows the record for review before anything goes to
    // FamilySearch; it reads the record from session storage
    const key = 'draft:' + Date.now();
    chrome.storage.session.set({ [key]: data }).then(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL('linker.html') + '?draft=' + encodeURIComponent(key), index: tab.index + 1, openerTabId: tab.id });
    }).catch((error) => showErrorMessage('Could not open the linker: ' + error.message));  // ("Prefix: detail", tMessage())
  });
});

// After the extension is installed, updated or reloaded, the fs_person.js already in
// open FS tabs is cut off from it (it removes its own entry), and Chrome doesn't inject
// the manifest's content scripts into open tabs: inject it again, so the "Digital
// Arkivet" entry comes back without reloading the page.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return;
  chrome.tabs.query({ url: 'https://www.familysearch.org/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['fs_person.js'] })
        .catch((error) => console.log('Could not inject fs_person.js into tab ' + tab.id + ':', error.message));
    }
  });
});

// Phase 1 → 2: the "Digital Arkivet" entry on a FamilySearch person page (fs_person.js)
// sends that person's details. They become search criteria in the address of the
// search page (search.html), the way FS's own record search keeps them in its URL, and
// the page opens next to the FS tab.
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request && request.action === 'searchDA') {
    rememberPerson(request.person);
    personToQuery(request.person).then((q) => {
      const url = chrome.runtime.getURL('search.html') + '?' + q.toString();
      const opener = sender.tab;
      chrome.tabs.create(opener ? { url: url, index: opener.index + 1, openerTabId: opener.id } : { url: url });
    });
  }
});

// The FS person and family the search was opened for, kept for the linker
// (linker.html pairs the record's people with them): `person:<PID>`, and `persons`,
// the most recent first ({pid, name}), at most MAX_PERSONS
const MAX_PERSONS = 30;
async function rememberPerson(person) {
  if (!person || !person.pid) return;
  try {
    const { persons = [] } = await chrome.storage.local.get('persons');
    const list = [{ pid: person.pid, name: person.name }, ...persons.filter((p) => p.pid !== person.pid)];
    await chrome.storage.local.set({ ['person:' + person.pid]: person, persons: list.slice(0, MAX_PERSONS) });
    const old = list.slice(MAX_PERSONS).map((p) => 'person:' + p.pid);
    if (old.length) await chrome.storage.local.remove(old);
  } catch (error) {
    console.warn('Could not keep the FS person:', error);
  }
}

// Patronymic surnames: -sen/-søn/-son, -datter/-dotter and their abbreviations
const PATRONYMIC = /(s[eøo]n|datter|dotter|dtr\.?|sdr?\.?)$/i;

// Split an FS full name into given name(s), surname, and what follows the surname.
// Names in this tree are patronymic, often with the farm as an address: "Tollef
// Johansen Skofteland" → given "Tollef", surname "Johansen", rest "Skofteland". The
// rest can also be a family or place-derived name (Lindeman), so personToQuery checks
// it against the farm registers (farms.js). Without a patronymic, the last word is the
// surname ("Anna Magdaline Lindeman").
function splitName(full) {
  const words = (full || '').split(/\s+/).filter(Boolean);
  if (words.length < 2) return { given: words.join(' '), surname: '', rest: '' };
  const i = words.findIndex((w, k) => k > 0 && PATRONYMIC.test(w));
  if (i > 0) {
    return { given: words.slice(0, i).join(' '), surname: words[i], rest: words.slice(i + 1).join(' ') };
  }
  return { given: words.slice(0, -1).join(' '), surname: words[words.length - 1], rest: '' };
}

// The years in an FS date ("11 November 1764", "1764", "1726–Deceased")
// A name without its nickname: a quoted word ('Stor'), or a leading Big, Little,
// Old, Young (Stor, Lille, Gamle, Unge, ...) that tells two brothers Ole apart:
// "Big 'Stor' Lars Halvorsen" → "Lars Halvorsen", "Little Lars Halvorson" → "Lars Halvorson"
function withoutNickname(name) {
  return (name || '').replace(/(^|\s)(['"‘’“”])[^'"‘’“”]*\2(?=\s|$)/gu, ' ')
    .replace(/^\s*(big|little|old|young|stor|store|lille|litle|vesle|gamle|gamla|unge|junior|senior)\s+(?=\S+\s)/i, '')
    .replace(/\s+/g, ' ').trim();
}

function yearsOf(date) {
  return ((date || '').match(/\b\d{4}\b/g) || []).map(Number);
}

// FS person (from fs_person.js) → search criteria, named like FS's record search
// (q.givenName, q.surname.1, q.birthLikeDate.from, ...; repeats get .1, .2, ...).
// Year ranges are ±2, as on FS.
async function personToQuery(person) {
  const q = new URLSearchParams();
  const suffix = (k) => (k === 0 ? '' : '.' + k);
  const set = (name, value) => { if (value !== '' && value != null) q.set(name, String(value)); };
  const range = (name, years, k = 0) => {
    if (years.length === 0) return;
    set('q.' + name + 'Date.from' + suffix(k), Math.min(...years) - 2);
    set('q.' + name + 'Date.to' + suffix(k), Math.max(...years) + 2);
  };

  set('treeref', person.pid);

  // The person's places, for telling farms from family names
  const places = [person.birth, person.christening, person.death, person.burial, ...(person.residences || []),
    ...(person.families || []).map((f) => f.marriage)].map((e) => e && e.place).filter(Boolean);

  // Names: the primary name, then alternates (without repeats). A word after the
  // patronymic is a farm only when a farm of that name lies in the person's
  // municipality or county (any farm, when FS has no places); otherwise it's a family
  // or place-derived name (Lindeman), searched as the surname, with the patronymic as
  // another name. A last name without a patronymic stays the surname, and is a farm
  // too when one lies in the person's places.
  const names = [];
  const farms = [];
  const seen = new Set();
  for (const full of [person.name, ...(person.altNames || [])].map(withoutNickname)) {
    const key = (full || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(splitName(full));
  }
  const checks = await Promise.all(names.map((n) => {
    if (n.rest) return farmNear(n.rest, places, true);
    if (n.surname && !PATRONYMIC.test(n.surname)) return farmNear(n.surname, places);
    return { farm: false };
  }));
  const entries = [];
  names.forEach((n, i) => {
    const farm = checks[i].farm && (n.rest || n.surname);
    if (farm && !farms.includes(farm)) farms.push(farm);
    if (n.rest && !checks[i].farm) entries.push({ given: n.given, surname: n.rest }, { given: n.given, surname: n.surname });
    else entries.push({ given: n.given, surname: n.surname });
  });
  const named = new Set();
  let k = 0;
  for (const e of entries) {
    const key = (e.given + ' ' + e.surname).toLowerCase();
    if (named.has(key)) continue;
    named.add(key);
    set('q.givenName' + suffix(k), e.given);
    set('q.surname' + suffix(k), e.surname);
    k++;
  }
  set('q.sex', person.gender);

  // Events: birth or christening, marriage, residence, death or burial
  const birth = person.birth || {};
  const christening = person.christening || {};
  // The more specific of the two ("Vågå, Oppland, Norway", not just "Norway")
  const parts = (place) => (place || '').split(',').filter((p) => p.trim()).length;
  set('q.birthLikePlace', parts(christening.place) > parts(birth.place) ? christening.place : birth.place || christening.place);
  range('birthLike', [...yearsOf(birth.date), ...yearsOf(christening.date)]);

  const marriage = (person.families || []).map(f => f.marriage).find(m => m && (m.date || m.place));
  if (marriage) {
    set('q.marriageLikePlace', marriage.place);
    range('marriageLike', yearsOf(marriage.date));
  }

  (person.residences || []).forEach((r, i) => {
    set('q.residencePlace' + suffix(i), r.place);
    range('residence', yearsOf(r.date), i);
  });

  // Leaving Norway: the years of the emigrations and of the immigrations elsewhere
  // (an immigration to a Norwegian place is a return)
  const inNorway = (place) => /\b(norway|norge|noreg)\s*$/i.test(place || '');
  const moves = [...(person.emigration || []), ...(person.immigration || []).filter((m) => !inNorway(m.place))];
  const departure = moves.find((m) => m.place && inNorway(m.place)) || moves.find((m) => m.place);
  set('q.emigrationLikePlace', departure && departure.place);
  range('emigrationLike', moves.flatMap((m) => yearsOf(m.date)));

  // The first dated event outside Norway (a residence, marriage, death or burial in
  // America) after the last one in Norway: by then the person had left, emigration or
  // not. Searches stop two years after it too (da_search.js profile()). A birth
  // abroad doesn't count (born in Sweden, then moved to Norway).
  const dated = (events) => events.filter((e) => e && e.place && yearsOf(e.date).length)
    .map((e) => ({ place: e.place, date: e.date, year: Math.min(...yearsOf(e.date)) }));
  const later = dated([...(person.residences || []), ...(person.families || []).map((f) => f.marriage), person.death, person.burial]);
  const lastHome = Math.max(0, ...dated([person.birth, person.christening, ...later])
    .filter((e) => !placeAbroad(e.place)).map((e) => e.year));
  const firstAbroad = later.filter((e) => placeAbroad(e.place) && e.year >= lastHome).sort((a, b) => a.year - b.year)[0];
  if (firstAbroad) {
    set('q.abroadPlace', firstAbroad.place);
    set('q.abroadYear', firstAbroad.year);
  }

  const death = person.death || {};
  const burial = person.burial || {};
  set('q.deathLikePlace', death.place || burial.place);
  range('deathLike', [...yearsOf(death.date), ...yearsOf(burial.date)]);

  farms.forEach((farm, i) => set('q.farm' + suffix(i), farm));

  // Family
  const relative = (prefix, p, i = 0) => {
    if (!p || !p.name) return;
    const n = splitName(p.name);
    set('q.' + prefix + 'GivenName' + suffix(i), n.given);
    set('q.' + prefix + 'Surname' + suffix(i), n.surname);
    // Lifespan "1796–Deceased"; "–1822" has no birth year
    set('q.' + prefix + 'BirthYear' + suffix(i), ((p.lifespan || '').match(/^\d{4}/) || [])[0]);
  };
  relative('father', person.father);
  relative('mother', person.mother);
  const families = person.families || [];
  families.filter(f => f.spouse).forEach((f, i) => relative('spouse', f.spouse, i));
  families.flatMap(f => f.children || []).forEach((child, i) => {
    relative('child', child, i);
  });

  return q;
}

// Function to show error messages in a notification, in the user's language (the
// one chosen on the extension's pages, else the browser's)
async function showErrorMessage(errorMessage) {
  await loadUiLanguage();
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: t("Error"),
    message: tMessage(errorMessage),
    buttons: [
      { title: t("OK") }
    ]
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to create notification:', chrome.runtime.lastError);
    } else {
      console.log('Notification ID:', notificationId);

      // Clear the notification after a short period
      setTimeout(() => {
        chrome.notifications.clear(notificationId, () => {});
      }, 5000);
    }
  });
}

