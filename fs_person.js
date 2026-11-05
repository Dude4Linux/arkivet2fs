// Content script on FamilySearch (Phase 1).
// On a person details page, adds a "Digital Arkivet" entry to the Search Records panel,
// below Google. Clicking it gathers the person's details from the page and sends them to
// background.js ('searchDA'), which starts the DigitalArkivet search (Phase 2).
//
// FS is a single-page React app: moving to another person doesn't reload the page, and
// React re-renders the panel. A MutationObserver re-inserts the entry whenever it's missing.

(() => {
  const PERSON_PATH = /\/tree\/person\/details\/([A-Z0-9]{4}-[A-Z0-9]{3,4})/i;
  const ENTRY_TESTID = 'search-digitalarkivet';
  const LABEL = 'Digital Arkivet';

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  // --- Person details ---------------------------------------------------------

  // { date, place } of a conclusion (vital) or a marriage list item
  function conclusionValue(el) {
    return {
      date: text(el.querySelector('[data-testid="conclusion-date"]')),
      place: text(el.querySelector('[data-testid="conclusion-place"]'))
    };
  }

  // Name shown in a NAME / ALTERNATE_NAME conclusion. The alternate name's body is
  // prefixed with its type ("Also Known As"), so prefer the name template when present.
  function conclusionName(el) {
    const template = el.querySelector('[data-testid="conclusion-name-template"]');
    if (template) return text(template);
    return text(el.querySelector('[data-testid="conclusion-body"]'))
      .replace(/^(Also Known As|Birth Name|Married Name|Nickname|Other)\s*/i, '');
  }

  // A person row on a family card: { name, pid, lifespan, gender }
  function familyMember(row) {
    if (!row) return null;
    // The sex is its own (visually hidden) text node; the row's text runs it into the
    // name ("Per AslaksenMale1764–1822"), so look for the element that holds just that.
    const genderEl = [...row.querySelectorAll('*')]
      .find(el => el.children.length === 0 && /^(Male|Female|Unknown)$/.test(text(el)));
    const gender = genderEl ? text(genderEl) : '';
    return {
      name: text(row.querySelector('[data-testid="fullName"]')),
      pid: text(row.querySelector('[data-testid="pid"]')),
      lifespan: text(row.querySelector('[data-testid="lifespan"]')),
      gender: gender
    };
  }

  function gatherPerson(doc = document) {
    const all = (type) => [...doc.querySelectorAll(`[data-testid="conclusionDisplay:${type}"]`)];
    const first = (type) => {
      const el = all(type)[0];
      return el ? conclusionValue(el) : null;
    };

    const pid = (location.pathname.match(PERSON_PATH) || [])[1] || '';
    const nameEl = all('NAME')[0];
    const genderEl = all('GENDER')[0];

    // Residences, without the duplicates FS often shows (same date and place)
    const residences = [];
    for (const el of all('RESIDENCE')) {
      const r = conclusionValue(el);
      const key = (r.date + '|' + r.place).toLowerCase().replace(/norge$/, 'norway');
      if (!residences.some(x => (x.date + '|' + x.place).toLowerCase().replace(/norge$/, 'norway') === key)) {
        residences.push(r);
      }
    }

    // Family cards: the person is in the couple on their own families (spouse +
    // children), and among the children on their parents' family.
    let father = null;
    let mother = null;
    const families = [];
    for (const card of doc.querySelectorAll('[data-testid="section-card-family"] [data-testid^="family-"]')) {
      const couple = [...card.querySelectorAll('[data-testid="couple-persons"] [data-testid="person"]')].map(familyMember);
      const children = [...card.querySelectorAll('[data-testid="child-person"]')]
        .map(c => familyMember(c.querySelector('[data-testid="person"]') || c));
      const ownFamily = couple.some(p => p.pid === pid);
      if (ownFamily) {
        const marriageEl = card.querySelector('[data-testid="marriage-list-item"]');
        families.push({
          spouse: couple.find(p => p.pid !== pid) || null,
          marriage: marriageEl ? conclusionValue(marriageEl) : null,
          children: children
        });
      } else if (!father && !mother) {
        // First parents' card (a later one may be step- or adoptive parents)
        father = couple.find(p => p.gender === 'Male') || null;
        mother = couple.find(p => p.gender === 'Female') || null;
      }
    }

    return {
      pid: pid,
      url: location.origin + '/en/tree/person/details/' + pid,
      name: nameEl ? conclusionName(nameEl) : '',
      altNames: all('ALTERNATE_NAME').map(conclusionName).filter(Boolean),
      gender: genderEl ? text(genderEl.querySelector('[data-testid="conclusion-body"]')) : '',
      birth: first('BIRTH'),
      christening: first('CHRISTENING'),
      death: first('DEATH'),
      burial: first('BURIAL'),
      residences: residences,
      father: father,
      mother: mother,
      families: families
    };
  }

  // The linker asks for a tree person's family ({action: 'readPerson'}, in a tab it
  // opened on the person's details page): answered once FS shows the name and the
  // family cards (a person without family: a few seconds after the name)
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function readWhenShown() {
    const start = Date.now();
    let named = 0;
    while (Date.now() - start < 20000) {
      if (PERSON_PATH.test(location.pathname) && document.querySelector('[data-testid="conclusionDisplay:NAME"]')) {
        named = named || Date.now();
        if (document.querySelector('[data-testid="section-card-family"] [data-testid^="family-"]') || Date.now() - named > 5000) {
          await sleep(600);  // the cards fill in
          return { person: gatherPerson() };
        }
      }
      await sleep(250);
    }
    return { error: PERSON_PATH.test(location.pathname) ? 'FamilySearch did not show the person in time.'
      : 'FamilySearch did not open the person (are you signed in?).' };
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || request.action !== 'readPerson') return false;
    readWhenShown().then(sendResponse);
    return true;
  });

  // --- The "Digital Arkivet" entry ----------------------------------------------

  // Reloading or updating the extension cuts this script off from it: chrome.runtime
  // loses its id and getURL()/sendMessage() throw "Extension context invalidated"
  const extensionAlive = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  };

  function activate(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!extensionAlive()) { shutDown(); return; }
    const person = gatherPerson();
    console.log('arkivet2fs: FS person', person);
    chrome.runtime.sendMessage({ action: 'searchDA', person: person });
  }

  // The entry this copy of the script added (a fresh copy after a reload adds its own)
  let ownItem = null;

  function insertEntry() {
    if (!PERSON_PATH.test(location.pathname)) return;
    if (!extensionAlive()) { shutDown(); return; }
    if (document.querySelector(`[data-testid="${ENTRY_TESTID}"]`)) return;
    const google = document.querySelector('[data-testid="search-google"]');
    const googleItem = google && google.closest('li');
    if (!googleItem) return;

    // A copy of Google's entry inherits FS's styling; it doesn't inherit React's
    // event handlers, so clicking it only runs ours.
    const item = googleItem.cloneNode(true);
    const googleTestid = '[data-testid="search-google"]';
    const button = item.matches(googleTestid) ? item : item.querySelector(googleTestid);
    if (!button) return;
    button.setAttribute('data-testid', ENTRY_TESTID);
    button.setAttribute('aria-label', 'Search ' + LABEL);
    button.title = 'Search DigitalArkivet for this person';

    const iconBox = button.querySelector('span[class^="shapeCss"]') || button.querySelector('svg')?.parentElement;
    if (iconBox) {
      const img = document.createElement('img');
      img.src = chrome.runtime.getURL('icons/icon32.svg');
      img.alt = '';
      img.width = 24;
      img.height = 24;
      img.style.display = 'block';
      iconBox.replaceChildren(img);
    }

    const label = [...button.querySelectorAll('span, div')]
      .find(el => el.children.length === 0 && text(el) === 'Google');
    if (label) label.textContent = LABEL;

    button.addEventListener('click', activate);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });

    googleItem.after(item);
    ownItem = item;
  }

  // Coalesce bursts of DOM changes into one check per frame
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      insertEntry();
    });
  });

  // Cut off from the extension: stop watching and take the entry away, since clicking
  // it can't reach the extension any more (reloading the page brings it back)
  function shutDown() {
    observer.disconnect();
    if (ownItem) ownItem.remove();
    ownItem = null;
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // An entry already there was added by a copy that a reload cut off (background.js
  // injects this script again into open FS tabs then): replace it with this copy's,
  // which can reach the extension. The old copy only removes its own entry.
  for (const old of document.querySelectorAll(`[data-testid="${ENTRY_TESTID}"]`)) old.closest('li')?.remove();
  insertEntry();
})();
