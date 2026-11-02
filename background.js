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

  // Gather data from the current (DigitalArkivet) tab
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: gatherData
  }, (results) => {
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

// Errors reported by content.js while filling the FamilySearch form
chrome.runtime.onMessage.addListener((request) => {
  if (request && request.action === 'fillFormError') {
    showErrorMessage(request.message);
  }
});

// Function to gather data from the current page
// NOTE: This function is injected into the DA page context via chrome.scripting.executeScript.
// All helper functions MUST be defined inside gatherData() — they cannot reference
// anything else in background.js.
function gatherData() {

  // --- Helper: Validate permanent ID format (2 alpha + 14+ digits) ---
  function validatePermanentId(id) {
    if (!id) return { valid: false, id: null, error: 'No permanent ID found on page' };
    const trimmed = id.trim();
    const pattern = /^[a-z]{2}\d{14,}$/;
    if (!pattern.test(trimmed)) {
      return { valid: false, id: trimmed, error: 'Invalid permanent ID format: ' + trimmed };
    }
    return { valid: true, id: trimmed, error: null };
  }

  // --- Helper: Determine record type from permanent ID prefix ---
  function parseRecordType(permanentId) {
    if (!permanentId || permanentId.length < 2) return { prefix: null, type: 'unknown' };
    const prefix = permanentId.substring(0, 2);
    const typeMap = {
      'pd': 'birth_baptism',
      'pf': 'census',
      'pg': 'death_burial',
      'pv': 'marriage',
      'pe': 'emigration',
      'pt': 'tax',
      'pl': 'school',
      'pm': 'landed_property',
      'pa': 'probate',
      'pb': 'fire_insurance',
      'pc': 'other',
      'om': 'administrative_area',
      'bf': 'residence_farm',
      'tf': 'census_district',
      'gm': 'farm_records',
      'kb': 'church_book_image',
      'ft': 'census_image'
    };
    return { prefix: prefix, type: typeMap[prefix] || 'unknown' };
  }

  // --- Helper: Format date, handling partial/missing dates ---
  function formatDate(dateStr) {
    if (!dateStr || !dateStr.trim()) return '';
    const trimmed = dateStr.trim();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const parts = trimmed.split('-');
    if (parts.length === 3 && parts[1] && parts[2]) {
      const monthIdx = parseInt(parts[1]) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${parseInt(parts[2])} ${months[monthIdx]} ${parts[0]}`;
      }
    }
    if (parts.length === 2 && parts[1]) {
      const monthIdx = parseInt(parts[1]) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${months[monthIdx]} ${parts[0]}`;
      }
    }
    // Uncertain dates like "1846-20??.09" can't be parsed by FamilySearch — keep the year
    const yearMatch = trimmed.match(/^(\d{4})\b/);
    if (yearMatch && trimmed.includes('?')) return yearMatch[1];
    // Year only, year range (e.g. "1740-1743"), or unrecognized format — return as-is
    return trimmed;
  }

  // --- Helper: Translate Norwegian role terms to English ---
  function translateRole(role) {
    if (!role) return 'Unknown';
    const translations = {
      'barn': 'Child',
      'far': 'Father', 'fader': 'Father',
      'mor': 'Mother', 'moder': 'Mother',
      'fadder': 'Godparent',
      'brudgom': 'Groom',
      'brur': 'Bride', 'brud': 'Bride',
      'brudgommens far': "Groom's Father",
      'bruras far': "Bride's Father",
      'brudgommens mor': "Groom's Mother",
      'bruras mor': "Bride's Mother",
      'forlovere': 'Witness/Sponsor', 'forløvere': 'Witness/Sponsor',
      'avdøde': 'Deceased', 'avdød': 'Deceased',
      'husfader': 'Head of Household',
      'husmoder': 'Wife of Head', 'hans kone': 'His Wife',
      'tjenestekarl': 'Male Servant', 'tjenestepige': 'Female Servant',
      'logerende': 'Lodger',
      'inderst': 'Lodger/Crofter',
      'medhjelper': 'Assistant'
    };
    const lower = role.toLowerCase();
    if (translations[lower]) return translations[lower];
    // Check for partial matches (e.g., "brudgommens far" in longer text)
    for (const [key, value] of Object.entries(translations)) {
      if (lower.includes(key)) return value;
    }
    return role; // Return original if no translation found
  }

  // --- Helper: Collapse whitespace and trim ---
  function cleanText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  // --- Helper: Clean a field value; DA shows '-' for empty fields ---
  function cleanValue(s) {
    const v = cleanText(s);
    return v === '-' ? '' : v;
  }

  // --- Helper: Read labeled fields from a DA page region ---
  // DA renders every field as a pair of sibling elements:
  //   <div>Label:</div><div class="ssp-semibold">Value</div>
  // This reads the DOM structure directly, so it works when sections are
  // collapsed and isn't confused by labels that contain other labels
  // (e.g. "Given name" vs "Name", "Birth year" vs "Year").
  // `skip` is an optional selector; values inside matching elements are ignored.
  function readFields(root, skip) {
    const fields = [];
    if (!root) return fields;
    for (const valueEl of root.querySelectorAll('.ssp-semibold')) {
      if (skip && valueEl.closest(skip)) continue;
      const labelEl = valueEl.previousElementSibling;
      if (!labelEl) continue;
      const label = cleanText(labelEl.textContent);
      if (!label.endsWith(':')) continue;
      fields.push({ label: label.slice(0, -1).trim(), value: cleanValue(valueEl.textContent) });
    }
    return fields;
  }

  // --- Helper: Turn a field list into a lowercase-label → value map (first wins) ---
  function fieldMap(fields) {
    const map = {};
    for (const f of fields) {
      const key = f.label.toLowerCase();
      if (!(key in map)) map[key] = f.value;
    }
    return map;
  }

  // --- Helper: Get the permanent ID from a person link's href ---
  function idFromLink(link) {
    const href = link ? link.getAttribute('href') : '';
    return href ? href.split('/').pop() : '';
  }

  // Roles to include in output (family members only, not witnesses/godparents).
  // The person whose page is being viewed is always included, whatever their role.
  const familyRoles = new Set([
    'barn', 'far', 'fader', 'mor', 'moder',
    'brudgom', 'brur', 'brud',
    'brudgommens far', 'bruras far', 'brudgommens mor', 'bruras mor',
    'avdøde', 'avdød'
  ]);

  // --- Helper: Extract all people from church record pages ---
  // The persons section (#collapse-section-0) can be displayed as either
  // a TABLE or a LIST (user toggles via button). Detect which and parse accordingly.
  // Each person is flagged `current` when it is the person whose page is open.
  function extractChurchPeople(permanentId) {
    const people = [];
    const section = document.querySelector("#collapse-section-0");
    if (!section) return people;

    const hasTdCells = section.querySelector("td") !== null;

    if (hasTdCells) {
      // --- TABLE FORMAT ---
      // Columns: Serial no(0), Role(1), Name(2), Position(3), Birth year(4), Birth place(5), Residence(6)
      for (const row of section.querySelectorAll("tr")) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 3) continue;

        const role = cleanValue(cells[1]?.textContent).toLowerCase();
        const personId = idFromLink(row.querySelector("a[href]"));
        const current = personId !== '' && personId === permanentId;
        if (!familyRoles.has(role) && !current) continue;

        people.push({
          id: personId, name: cleanValue(cells[2]?.textContent), role: role,
          roleEnglish: translateRole(role),
          position: cleanValue(cells[3]?.textContent),
          birthYear: cleanValue(cells[4]?.textContent),
          birthPlace: cleanValue(cells[5]?.textContent),
          residence: cleanValue(cells[6]?.textContent),
          current: current, primary: false
        });
      }
    } else {
      // --- LIST FORMAT ---
      // One .data-item per person: <h4><a href=".../pdXXX">Serial no. N</a></h4>
      // followed by labeled fields. The open person's item has class "current".
      // Probate items instead put the name in the heading: <h4><a><span>Name</span> Lars Halvorsen</a></h4>
      for (const item of section.querySelectorAll(".data-item")) {
        const link = item.querySelector("h4 a[href]");
        const personId = idFromLink(link);
        const f = fieldMap(readFields(item));
        if (!f['name'] && link) {
          const label = link.querySelector(".de-emphasized");
          if (label && /^name$/i.test(cleanText(label.textContent))) {
            const nameEl = link.cloneNode(true);
            nameEl.querySelector(".de-emphasized").remove();
            f['name'] = cleanValue(nameEl.textContent);
          }
        }
        const role = (f['role'] || '').toLowerCase();
        const current = item.classList.contains('current') ||
                        (personId !== '' && personId === permanentId);
        if (!familyRoles.has(role) && !current) continue;

        people.push({
          id: personId, name: f['name'] || '', role: role,
          roleEnglish: translateRole(role),
          position: f['position'] || '',
          birthYear: f['birth year'] || f['year of birth'] || '',
          birthPlace: f['birth place'] || '',
          residence: f['residence'] || '',
          current: current, primary: false
        });
      }
    }
    return people;
  }

  // --- Helper: Extract record details from #collapse-section-1 ---
  // Church records have event-specific details. Returns a lowercase-label map
  // of non-empty fields, e.g. 'page', 'year', 'baptism date', 'parish/church',
  // 'marriage date', 'death date', 'burial date', 'introduction', 'remarks'.
  function extractRecordDetails() {
    const map = fieldMap(readFields(document.querySelector("#collapse-section-1")));
    const details = {};
    for (const [key, value] of Object.entries(map)) {
      if (value) details[key] = value;
    }
    return details;
  }

  // --- Helper: Extract primary person details from always-visible section ---
  // The open person's own fields live in div.left-view-column but NOT inside
  // the collapsible sections, the header, or the persons list.
  // Returns { isPrimary: bool, fields: [{label, value}, ...] } with all non-empty fields.
  // isPrimary is true when the open person is Serial no. 1 of the record.
  function extractPrimaryPersonDetails() {
    const result = { isPrimary: false, fields: [] };
    const leftCol = document.querySelector("div.left-view-column");
    if (!leftCol) return result;

    const skip = "[id^='collapse'], div.parent-post, .data-item";
    for (const field of readFields(leftCol, skip)) {
      if (!field.value) continue;
      // Check Serial no. for primary verification but don't include in output
      if (/^serial no\.?$/i.test(field.label)) {
        result.isPrimary = (field.value === '1');
        continue;
      }
      result.fields.push(field);
    }
    return result;
  }

  // --- Helper: Translate census family-position codes (e.g. "hp", "d, fl") ---
  // Codes are matched exactly (they're too short for substring matching);
  // unknown codes are kept as-is.
  function translateCensusPosition(position) {
    if (!position) return 'Resident';
    const codes = { 'hp': 'Head of Household', 'hu': 'Wife', 's': 'Son', 'd': 'Daughter' };
    return position.split(',').map(function(c) {
      const code = c.trim();
      return codes[code.toLowerCase()] || code;
    }).join(', ');
  }

  // --- Helper: Extract all people from census record pages ---
  // Census records use #collapse-persons with one .data-item per resident:
  //   <h4><a href=".../pfXXX"><span class="de-emphasized">001</span> Name</a></h4>
  // followed by labeled fields (Age/born, Place of birth, Family position, Occupation).
  function extractCensusPeople(permanentId) {
    const people = [];
    const section = document.querySelector("#collapse-persons");
    if (!section) return people;

    for (const item of section.querySelectorAll(".data-item")) {
      const link = item.querySelector("h4 a[href]");
      const personId = idFromLink(link);
      if (!personId || !personId.startsWith('p')) continue;

      // Name without the leading person number
      const nameEl = link.cloneNode(true);
      nameEl.querySelectorAll(".de-emphasized").forEach(function(el) { el.remove(); });

      const f = fieldMap(readFields(item));
      const familyPosition = f['family position'] || '';
      people.push({
        id: personId,
        name: cleanText(nameEl.textContent),
        role: familyPosition,
        roleEnglish: translateCensusPosition(familyPosition),
        position: f['occupation'] || '',
        birthYear: f['age/born'] || '',
        birthPlace: f['place of birth'] || '',
        residence: '',
        current: item.classList.contains('current') || personId === permanentId,
        primary: false
      });
    }
    return people;
  }

  // --- Helper: Extract source information ---
  // Primary source is the right-hand ".infobox" ("Source information:"), which has
  // the source title plus County / Municipality (1947) / Parish/Church fields.
  // Falls back to the page title, whose last segment before
  // " - The Digital Archive" is the source title for both church and census pages:
  //   "Name - Church book from X parish 1828-1841 (0301M4) - The Digital Archive"
  //   "001 Name - farm - district - ... - 1891 census for 0529 Vestre Toten - The Digital Archive"
  function extractSourceInfo() {
    const info = { sourceTitle: '', county: '', municipality: '', parish: '', startYear: '' };

    const infobox = document.querySelector(".right-view-column .infobox");
    if (infobox) {
      info.sourceTitle = cleanValue(infobox.querySelector(":scope > p.ssp-semibold")?.textContent);
      const f = fieldMap(readFields(infobox));
      info.county = f['county'] || '';
      const muniKey = Object.keys(f).find(function(k) { return k.startsWith('municipality'); });
      info.municipality = muniKey ? f[muniKey] : '';
      info.parish = f['parish/church'] || f['parish'] || '';
      info.startYear = f['start year'] || '';
    }

    if (!info.sourceTitle) {
      const parts = document.title.split(' - ').map(cleanText);
      if (parts.length && /^the digital archive$/i.test(parts[parts.length - 1])) parts.pop();
      if (parts.length >= 2) info.sourceTitle = parts[parts.length - 1];
    }

    return info;
  }

  // --- Helper: Build a formatted genealogical citation ---
  // Includes source title, page, record type, event date, parish, permanent ID, URL.
  function buildCitation(recordTypeInfo, sourceInfo, permanentId, recordDate, url, recordDetails) {
    const parts = [];

    // Source title with page number
    let source = sourceInfo.sourceTitle || '';
    if (recordDetails && recordDetails['page']) {
      source += ', p. ' + recordDetails['page'];
    }
    if (source) parts.push(source);

    // Record type in English
    const typeNames = {
      'birth_baptism': 'Births and baptisms',
      'marriage': 'Marriages',
      'death_burial': 'Deaths and burials',
      'census': 'Census',
      'emigration': 'Emigration',
      'probate': 'Probate',
      'tax': 'Tax records',
      'school': 'School records',
      'landed_property': 'Landed property',
      'fire_insurance': 'Fire insurance'
    };
    const typeName = typeNames[recordTypeInfo.type];
    if (typeName) parts.push(typeName);

    if (recordDate) parts.push(recordDate.trim());

    // Event-specific dates from record details
    if (recordDetails) {
      if (recordDetails['baptism date']) parts.push('baptism ' + recordDetails['baptism date']);
      if (recordDetails['introduction']) parts.push('introduction ' + recordDetails['introduction']);
      if (recordDetails['marriage date']) parts.push('marriage ' + recordDetails['marriage date']);
      if (recordDetails['death date']) parts.push('death ' + recordDetails['death date']);
      if (recordDetails['burial date']) parts.push('burial ' + recordDetails['burial date']);
    }

    // Parish/Church from record details
    const parish = (recordDetails && (recordDetails['parish/church'] || recordDetails['parish'])) ||
                   sourceInfo.parish || '';
    if (parish) parts.push(parish);

    let citation = parts.join('; ');
    if (permanentId) citation += '. Permanent ID: ' + permanentId;
    citation += '. ' + url;

    return citation;
  }

  // --- Helper: Build enriched notes with people and unique details ---
  // Source title, event dates, page, parish, permanent ID are now in the citation.
  // Notes contain: primary person birth info, remarks, and persons section.
  function buildNotes(recordType, recordDate, permanentId, people, sourceInfo, recordTypeInfo, recordDetails, primaryDetails) {
    const lines = [];

    // Primary person details from always-visible section — all non-empty fields
    if (primaryDetails && primaryDetails.fields && primaryDetails.fields.length > 0) {
      for (const field of primaryDetails.fields) {
        lines.push(field.label + ': ' + field.value);
      }
    }

    // Only include details NOT already in citation (introduction, remarks)
    if (recordDetails) {
      if (recordDetails['introduction']) lines.push('Introduction: ' + recordDetails['introduction']);
      if (recordDetails['remarks']) lines.push('Remarks: ' + recordDetails['remarks']);
    }

    // People section — family members with full details
    if (people.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('--- Persons ---');
      for (const person of people) {
        const role = person.roleEnglish || person.role || 'Unknown';
        const primary = person.primary ? ' *' : '';
        let line = role + ': ' + person.name + primary;
        // Add detail fields on same line in parentheses
        const details = [];
        if (person.position) details.push(person.position);
        if (person.birthYear) details.push('b. ' + person.birthYear);
        if (person.birthPlace) details.push(person.birthPlace);
        if (person.residence) details.push('res. ' + person.residence);
        if (details.length > 0) {
          line += ' (' + details.join(', ') + ')';
        }
        lines.push(line);
      }
    }

    return lines.join('\n');
  }

  // --- Main extraction logic (wrapped in try/catch) ---
  try {
    // Extract and validate permanent ID
    const rawPermanentId = document.querySelector("#permanentId")?.textContent;
    const idValidation = validatePermanentId(rawPermanentId);
    const permanentId = idValidation.id;
    const recordTypeInfo = parseRecordType(permanentId);

    const isCensus = recordTypeInfo.type === 'census';

    // Extract source information for citation
    const sourceInfo = extractSourceInfo();

    // Extract record type and date from parent-post header (church records),
    // e.g. "Births and baptisms: 1836-01-03".
    // Census pages also have a parent-post, but it holds the census district and
    // residence ("Census district: 01 ..."), not a date — so skip it for census.
    let recordType = '';
    let recordDate = '';
    const parentPost = isCensus ? null : document.querySelector("div.parent-post > h4")?.innerText;
    if (parentPost && parentPost.includes(':')) {
      const colonIdx = parentPost.indexOf(':');
      recordType = parentPost.substring(0, colonIdx).trim();
      recordDate = parentPost.substring(colonIdx + 1).trim();
    } else if (parentPost) {
      recordType = parentPost.trim();
    }

    // Census date is the census year ("1891 census for ..." / Start year)
    if (isCensus) {
      const yearMatch = sourceInfo.sourceTitle.match(/\b(\d{4})\b/);
      recordDate = sourceInfo.startYear || (yearMatch ? yearMatch[1] : '');
    }

    // For records without a parent-post header, derive type from recordTypeInfo
    if (!recordType && recordTypeInfo.type !== 'unknown') {
      const typeLabels = {
        'birth_baptism': 'Births and baptisms',
        'census': 'Census',
        'death_burial': 'Deaths and burials',
        'marriage': 'Marriages',
        'emigration': 'Emigration',
        'probate': 'Probate',
        'tax': 'Tax records',
        'school': 'School records',
        'landed_property': 'Landed property',
        'fire_insurance': 'Fire insurance',
        'other': 'Other records'
      };
      recordType = typeLabels[recordTypeInfo.type] || recordTypeInfo.type;
    }

    const date = formatDate(recordDate);
    const title = document.title.replace(/\s*-\s*The Digital Archive\s*$/i, '').trim();
    const url = window.location.href;

    // Extract people from collapsible section
    const people = isCensus ? extractCensusPeople(permanentId) : extractChurchPeople(permanentId);

    // Extract record details from #collapse-section-1 (church records)
    const recordDetails = extractRecordDetails();

    // Extract primary person details from always-visible section
    const primaryDetails = extractPrimaryPersonDetails();

    // Mark the person whose page is open as primary (falls back to the first person)
    const primaryPerson = people.find(function(p) { return p.current; }) || people[0];
    const primaryPersonId = primaryPerson ? primaryPerson.id : null;
    if (primaryPerson) primaryPerson.primary = true;

    // Build enriched notes with all people and details
    const notes = buildNotes(recordType, recordDate, permanentId, people, sourceInfo, recordTypeInfo, recordDetails, primaryDetails);

    return {
      date: date,
      title: title,
      url: url,
      citation: buildCitation(recordTypeInfo, sourceInfo, permanentId, recordDate, url, recordDetails),
      notes: notes,
      permanentId: permanentId,
      recordTypeInfo: recordTypeInfo,
      recordType: recordType,
      recordDate: recordDate,
      primaryPersonId: primaryPersonId,
      people: people,
      error: idValidation.valid ? null : idValidation.error
    };
  } catch (err) {
    return {
      error: 'Failed to extract data: ' + err.message,
      url: window.location.href,
      date: '', title: '', citation: '', notes: '',
      permanentId: null, recordTypeInfo: { prefix: null, type: 'unknown' },
      recordType: '', recordDate: '', primaryPersonId: null, people: []
    };
  }
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

