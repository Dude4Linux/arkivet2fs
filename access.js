// Site access (release-plan.md, Phase 6). Firefox, and Chromium when the user sets the
// extension's site access to "On click", can withhold the manifest's host permissions.
// search.html and linker.html check them before they start and, when one is missing,
// show a bar with a button that asks for them (permissions.request() needs a click)
// instead of failing on the first fetch. Only function declarations at the top level.

// The sites the extension needs: the manifest's host_permissions (FamilySearch,
// DigitalArkivet, and the farm check's Rygh and Kartverket); the update check's GitHub
// hosts are optional and asked for on the Updates page
function siteOrigins() {
  try {
    return chrome.runtime.getManifest().host_permissions || [];
  } catch (e) {
    return [];
  }
}

// The origins not granted. A browser that can't tell counts as granted: the fetches
// then say what's wrong
async function missingSiteAccess(permissions, origins) {
  const missing = [];
  for (const origin of origins) {
    try {
      if (!await permissions.contains({ origins: [origin] })) missing.push(origin);
    } catch (e) { /* not known */ }
  }
  return missing;
}

// "www.familysearch.org, www.digitalarkivet.no" from the origins
function siteNames(origins) {
  return origins.map((o) => o.replace(/^https:\/\//, '').replace(/\/\*$/, '')).join(', ');
}

// Runs start() once the sites are granted: at once when they are (or the browser has no
// permissions API, as in the tests), else after the bar's button got them
function whenSiteAccess(doc, start) {
  const permissions = typeof chrome !== 'undefined' && chrome.permissions;
  if (!permissions || !permissions.contains) {
    start();
    return;
  }
  missingSiteAccess(permissions, siteOrigins()).then((missing) => {
    if (!missing.length) {
      start();
      return;
    }
    const bar = doc.createElement('section');
    bar.className = 'da-warning access-warning';
    bar.setAttribute('role', 'alert');
    const text = doc.createElement('p');
    text.textContent = t('The extension may not read {sites} yet. It needs them to search DigitalArkivet and to read and update FamilySearch; your browser asks you once.', { sites: siteNames(missing) });
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.textContent = t('Allow access');
    button.addEventListener('click', () => {
      // asked straight from the click: Firefox takes a request only so
      permissions.request({ origins: missing }).then((granted) => {
        if (granted) {
          bar.remove();
          start();
        } else {
          text.textContent = t('The browser didn\'t allow it. Allow the extension these sites in the browser\'s extension settings, then reload this page.');
        }
      }, (error) => {
        text.textContent = t('The browser didn\'t allow it. Allow the extension these sites in the browser\'s extension settings, then reload this page.') + ' (' + error.message + ')';
      });
    });
    bar.append(text, button);
    const topbar = doc.querySelector('.topbar');
    if (topbar) topbar.after(bar);
    else doc.body.prepend(bar);
  });
}
