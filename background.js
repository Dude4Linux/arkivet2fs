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
    // Year only or unrecognized format — return as-is
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

  // --- Helper: Get readable text from an element ---
  // textContent works even when sections are collapsed (hidden via CSS),
  // but it doesn't add line breaks between elements. We normalize by
  // inserting newlines before known DA field labels.
  function getReadableText(element) {
    if (!element) return '';
    const raw = element.textContent || '';
    // Insert a newline before each known field label so line-based parsing works
    return raw.replace(/(Role:|Given name:|Last name:|Name:|Gender:|Position:|Birth year:|Birth place:|Residence:|Date of birth:|Year of birth:|Birth date:|Date of death:|Date of marriage:|Legitimate\/Illegitimate born:|Age:|Married:|Page:|Serial no\.:|Year:|Introduction:|Baptism date:|Baptism place:|Parish\/Church:|Marriage date:|Death date:|Burial date:|Reported:|Confirmed:|Remarks:)/gi, '\n$1');
  }

  // --- Helper: Find all values for a labeled field in a text block ---
  function findAllFieldValues(text, label) {
    const pattern = new RegExp(label + ':\\s*([^\\n\\r]+)', 'gi');
    const values = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const val = match[1].trim();
      values.push(val === '-' ? '' : val);
    }
    return values;
  }

  // --- Helper: Find a single field value in a text block ---
  function findFieldValue(text, label) {
    const pattern = new RegExp(label + ':\\s*([^\\n\\r]+)', 'i');
    const match = text.match(pattern);
    if (!match) return '';
    const val = match[1].trim();
    return val === '-' ? '' : val;
  }

  // Roles to include in output (family members only, not witnesses/godparents)
  const familyRoles = new Set([
    'barn', 'far', 'fader', 'mor', 'moder',
    'brudgom', 'brur', 'brud',
    'brudgommens far', 'bruras far', 'brudgommens mor', 'bruras mor',
    'avdøde', 'avdød'
  ]);

  // --- Helper: Extract all people from church record pages ---
  // The persons section (#collapse-section-0) can be displayed as either
  // a TABLE or a LIST (user toggles via button). Detect which and parse accordingly.
  function extractChurchPeople() {
    const people = [];
    const section = document.querySelector("#collapse-section-0");
    if (!section) return people;

    const clean = function(val) {
      const v = (val || '').trim();
      return (v === '-' || v === '') ? '' : v;
    };

    // Detect format: table has <td> cells, list uses "Label: Value" text
    const rows = section.querySelectorAll("tr");
    const hasTdCells = section.querySelector("td") !== null;

    if (hasTdCells && rows.length > 0) {
      // --- TABLE FORMAT ---
      // Columns: Serial no(0), Role(1), Name(2), Position(3), Birth year(4), Birth place(5), Residence(6)
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 3) continue;

        const role = clean(cells[1]?.textContent).toLowerCase();
        const name = clean(cells[2]?.textContent);

        const link = row.querySelector("a[href]");
        let personId = '';
        if (link) {
          const href = link.getAttribute("href");
          if (href) personId = href.split('/').pop();
        }

        if (!familyRoles.has(role)) continue;

        people.push({
          id: personId, name: name, role: role,
          roleEnglish: translateRole(role),
          position: clean(cells[3]?.textContent),
          birthYear: clean(cells[4]?.textContent),
          birthPlace: clean(cells[5]?.textContent),
          residence: clean(cells[6]?.textContent),
          primary: false
        });
      }
    } else {
      // --- LIST FORMAT ---
      // Labeled pairs: "Role: barn", "Name: Hans", etc.
      // Use getReadableText to normalize, then find all field instances.
      const fullText = getReadableText(section);
      const roles = findAllFieldValues(fullText, 'Role');
      const names = findAllFieldValues(fullText, 'Name');
      const positions = findAllFieldValues(fullText, 'Position');
      const birthYears = findAllFieldValues(fullText, 'Birth year');
      const birthPlaces = findAllFieldValues(fullText, 'Birth place');
      const residences = findAllFieldValues(fullText, 'Residence');

      const links = section.querySelectorAll("a[href]");
      const personIds = [];
      for (const link of links) {
        const href = link.getAttribute("href");
        if (!href) continue;
        const id = href.split('/').pop();
        if (id && id.startsWith('p')) personIds.push(id);
      }

      const count = Math.max(roles.length, names.length, personIds.length);
      for (let i = 0; i < count; i++) {
        const role = (roles[i] || '').toLowerCase();
        const name = names[i] || '';
        const personId = personIds[i] || '';

        if (!familyRoles.has(role)) continue;

        people.push({
          id: personId, name: clean(name), role: role,
          roleEnglish: translateRole(role),
          position: clean(positions[i]),
          birthYear: clean(birthYears[i]),
          birthPlace: clean(birthPlaces[i]),
          residence: clean(residences[i]),
          primary: false
        });
      }
    }
    return people;
  }

  // --- Helper: Extract record details from #collapse-section-1 ---
  // Church records have event-specific details (dates, page, parish, etc.)
  function extractRecordDetails() {
    const section = document.querySelector("#collapse-section-1");
    if (!section) return {};
    const text = getReadableText(section);
    const details = {};

    const fields = [
      ['page', 'Page'],
      ['year', 'Year'],
      ['introduction', 'Introduction'],
      ['baptism date', 'Baptism date'],
      ['parish/church', 'Parish\\/Church'],
      ['baptism place', 'Baptism place'],
      ['marriage date', 'Marriage date'],
      ['death date', 'Death date'],
      ['burial date', 'Burial date'],
      ['remarks', 'Remarks']
    ];

    for (const [key, pattern] of fields) {
      const value = findFieldValue(text, pattern);
      if (value) details[key] = value;
    }
    return details;
  }

  // --- Helper: Extract primary person details from always-visible section ---
  // The primary person fields live in div.left-view-column but NOT inside
  // the collapsible sections. We clone the element, strip out sections we
  // already process elsewhere, and parse the remaining labeled fields.
  // Returns { isPrimary: bool, fields: [{label, value}, ...] } with all non-empty fields.
  function extractPrimaryPersonDetails() {
    const result = { isPrimary: false, fields: [] };
    const leftCol = document.querySelector("div.left-view-column");
    if (!leftCol) return result;

    // Clone and remove sections we already process elsewhere
    const clone = leftCol.cloneNode(true);
    clone.querySelectorAll("[id^='collapse']").forEach(function(el) { el.remove(); });
    clone.querySelectorAll("div.parent-post").forEach(function(el) { el.remove(); });
    const permId = clone.querySelector("#permanentId");
    if (permId) permId.remove();

    const text = getReadableText(clone);
    const lines = text.split('\n');

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 1) continue;
      const label = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();

      // Skip empty or dash-only values
      if (!value || value === '-' || value === '') continue;
      if (!label) continue;

      // Check Serial no. for primary verification but don't include in output
      if (/^serial no\.?$/i.test(label)) {
        result.isPrimary = (value === '1');
        continue;
      }

      result.fields.push({ label: label, value: value });
    }
    return result;
  }

  // --- Helper: Extract all people from census record pages ---
  // Census records use #collapse-persons with linked resident entries.
  function extractCensusPeople() {
    const people = [];
    const section = document.querySelector("#collapse-persons");
    if (!section) return people;

    const links = section.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href");
      if (!href) continue;
      const personId = href.split('/').pop();
      if (!personId || !personId.startsWith('p')) continue;

      const name = link.textContent.trim();

      people.push({
        id: personId,
        name: name,
        role: '',
        roleEnglish: 'Resident',
        position: '',
        birthYear: '',
        birthPlace: '',
        residence: '',
        primary: false
      });
    }
    return people;
  }

  // --- Helper: Extract source information from page title and record sections ---
  function extractSourceInfo() {
    const info = {
      sourceTitle: '',
      county: '',
      municipality: '',
      parish: ''
    };

    // Page title format: "PersonName - SourceTitle (Code) - The Digital Archive"
    // or for census: "NNN PersonName - YYYY Census for Municipality"
    const titleParts = document.title.split(' - ');
    if (titleParts.length >= 3) {
      // Church records: middle part is the source title
      info.sourceTitle = titleParts[1].trim();
    } else if (titleParts.length === 2) {
      info.sourceTitle = titleParts[1].trim();
    }

    // Remove " - The Digital Archive" suffix if present
    if (info.sourceTitle.endsWith('The Digital Archive')) {
      info.sourceTitle = info.sourceTitle.replace(/\s*-?\s*The Digital Archive$/, '').trim();
    }

    // Try to extract location from record details sections
    // Church records: #collapse-section-1 or later sections
    // Census records: #collapse-more
    const detailSections = [
      document.querySelector("#collapse-section-1"),
      document.querySelector("#collapse-section-2"),
      document.querySelector("#collapse-more")
    ];
    for (const section of detailSections) {
      if (!section) continue;
      const text = section.textContent;

      // Look for county/municipality/parish in labeled fields
      const countyMatch = text.match(/County:\s*([^\n]+)/i);
      if (countyMatch) info.county = countyMatch[1].trim();

      const municipalityMatch = text.match(/Municipality:\s*([^\n]+)/i);
      if (municipalityMatch) info.municipality = municipalityMatch[1].trim();

      const parishMatch = text.match(/(?:Parish|Church):\s*([^\n]+)/i);
      if (parishMatch) info.parish = parishMatch[1].trim();
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

    // Extract record type and date from parent-post header (church records)
    // Census and other record types may not have this element
    const parentPost = document.querySelector("div.parent-post > h4")?.innerText;
    let recordType = '';
    let recordDate = '';
    if (parentPost && parentPost.includes(':')) {
      const colonIdx = parentPost.indexOf(':');
      recordType = parentPost.substring(0, colonIdx).trim();
      recordDate = parentPost.substring(colonIdx + 1).trim();
    } else if (parentPost) {
      recordType = parentPost.trim();
    }

    // For census records without parent-post, derive type from recordTypeInfo
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
    const title = document.title;
    const url = window.location.href;

    // Extract source information for citation
    const sourceInfo = extractSourceInfo();

    // Extract people from collapsible section
    let people = [];
    if (recordTypeInfo.type === 'census') {
      people = extractCensusPeople();
    } else {
      people = extractChurchPeople();
    }

    // Extract record details from #collapse-section-1 (church records)
    const recordDetails = extractRecordDetails();

    // Extract primary person details from always-visible section
    const primaryDetails = extractPrimaryPersonDetails();

    // Mark the first person as primary
    const primaryPersonId = people.length > 0 ? people[0].id : null;
    if (people.length > 0) {
      people[0].primary = true;
    }

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

