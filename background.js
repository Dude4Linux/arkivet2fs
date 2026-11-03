// Place tables and the farm check (personToQuery)
importScripts('da_places.js', 'farms.js');

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');

  // Ensure the tab is not a chrome:// URL
  if (tab.url.startsWith('chrome://')) {
    showErrorMessage('Cannot execute script on a chrome:// URL');
    return;
  }

  // Ensure the tab is a DigitalArkivet URL
  if (!tab.url.includes('digitalarkivet.no')) {
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

    // Open a new FamilySearch tab without stealing focus
    chrome.tabs.create({
      url: 'https://www.familysearch.org/en/tree/sources/sourceBox',
      active: false
    }, (newTab) => {
      console.log('FamilySearch tab opened:', newTab);

      // Wait for the new tab to load completely
      chrome.tabs.onUpdated.addListener(function tabUpdateListener(tabId, changeInfo) {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);

          // Inject content.js into the new tab
          chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            files: ['content.js']
          }, () => {
            console.log('content.js injected');

            // Ensure content script is ready to receive the message
            setTimeout(() => {
              // Send the data to the content script
              chrome.tabs.sendMessage(newTab.id, { action: 'fillForm', data }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('Error sending message to content script:', chrome.runtime.lastError);
                  showErrorMessage(chrome.runtime.lastError.message || 'Failed to send message to content script');
                } else {
                  console.log('Message sent to content script');
                  // Activate the new tab
                  chrome.tabs.update(newTab.id, { active: true, highlighted: true });
                }
              });
            }, 500); // Wait for 1 second to ensure content script is ready
          });
        }
      });
    });
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

// Errors reported by content.js while filling the FamilySearch form
chrome.runtime.onMessage.addListener((request) => {
  if (request && request.action === 'fillFormError') {
    showErrorMessage(request.message);
  }
});

// Phase 1 → 2: the "Digital Arkivet" entry on a FamilySearch person page (fs_person.js)
// sends that person's details. They become search criteria in the address of the
// search page (search.html), the way FS's own record search keeps them in its URL, and
// the page opens next to the FS tab.
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request && request.action === 'searchDA') {
    personToQuery(request.person).then((q) => {
      const url = chrome.runtime.getURL('search.html') + '?' + q.toString();
      const opener = sender.tab;
      chrome.tabs.create(opener ? { url: url, index: opener.index + 1, openerTabId: opener.id } : { url: url });
    });
  }
});

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
  for (const full of [person.name, ...(person.altNames || [])]) {
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
  set('q.birthLikePlace', birth.place || christening.place);
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
  };
  relative('father', person.father);
  relative('mother', person.mother);
  const families = person.families || [];
  families.filter(f => f.spouse).forEach((f, i) => relative('spouse', f.spouse, i));
  families.flatMap(f => f.children || []).forEach((child, i) => {
    relative('child', child, i);
    // Lifespan "1796–Deceased"; "–1822" has no birth year
    set('q.childBirthYear' + suffix(i), ((child.lifespan || '').match(/^\d{4}/) || [])[0]);
  });

  return q;
}

// Function to show error messages in a notification
function showErrorMessage(errorMessage) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.png"),
    title: "Error",
    message: errorMessage,
    buttons: [
      { title: "OK" }
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

