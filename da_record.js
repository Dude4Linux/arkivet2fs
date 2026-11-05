// Reads a DigitalArkivet record page: extractRecord(document, pageUrl) returns the
// record's title, citation, notes and people (see CLAUDE.md). Used in two places:
// - background.js injects this file into the open DA page (Phase 3), then runs
//   gatherData() there
// - search.html loads it to check the record pages of close search hits
//   (da_verify.js)
// It must not use anything from other files, and declares only functions at the top
// level (it's injected again on each click, and a second `const` would throw). `document` is a parameter, the open page
// or one fetched and parsed with DOMParser, so use textContent, not innerText.

function extractRecord(document, pageUrl) {

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
      'pk': 'confirmation',
      'pe': 'emigration',
      'pu': 'out_migration',
      'pi': 'in_migration',
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
      'konfirmant': 'Confirmand',
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
      'utflytter': 'Out-migrant', 'utflyttar': 'Out-migrant',
      'innflytter': 'In-migrant', 'innflyttar': 'In-migrant',
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

  // --- Helper: Drop DA's name variants, marked %...% ("Ommund %Ole% Olsen %Olsen%") ---
  function stripNameVariants(name) {
    return (name || '').replace(/%[^%]*%/g, ' ').replace(/\s+/g, ' ').trim();
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
    'avdøde', 'avdød', 'konfirmant'
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
  // Emigrant protocols keep their page and line under "More information"
  // (#collapse-more-info), read with `more`.
  function extractRecordDetails(more) {
    const map = fieldMap(readFields(document.querySelector("#collapse-section-1")));
    if (more) Object.assign(map, fieldMap(readFields(document.querySelector("#collapse-more-info"))));
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

  // --- Census codes (HISTFORM standard), by field ---
  // From DA's key, https://www.digitalarkivet.no/en/content/abbreviations-census.
  // The same letter means different things in different fields ("b" is a visitor
  // as family position but resident as residential status), so codes are per field.
  const FIELD_CODES = {
    'family position': {
      'hf': 'Man of the House', 'hm': 'Woman of the House', 'hp': 'Head of Household',
      'hu': 'Wife', 's': 'Son', 'd': 'Daughter', 'tj': 'Servant',
      'fl': 'Lodger', 'el': 'Single Lodger', 'l': 'Lodger', 'b': 'Visitor'
    },
    'residential status': { 'b': 'Resident', 'mt': 'Temporarily Resident', 'f': 'Absent' },
    // Codes, and the words some censuses write out (1870: "Ugift", "Enke")
    'marital status': {
      'ug': 'Unmarried', 'g': 'Married', 'e': 'Widowed', 's': 'Separated', 'f': 'Divorced',
      'ugift': 'Unmarried', 'ugivt': 'Unmarried', 'gift': 'Married', 'givt': 'Married',
      'enke': 'Widow', 'enkemand': 'Widower', 'enkemann': 'Widower', 'skilt': 'Divorced', 'separert': 'Separated'
    },
    'gender': { 'm': 'Male', 'k': 'Female', '!!': 'Unspecified' },
    // Church books: ekte / uekte
    'legitimate/illegitimate born': { 'e': 'Legitimate', 'u': 'Illegitimate' }
  };

  // --- Helper: Translate census family-position codes (e.g. "hp", "d, fl") ---
  // Codes are matched exactly (they're too short for substring matching);
  // free text such as "Husmoderens Tante" is kept as-is.
  function translateCensusPosition(position) {
    if (!position) return 'Resident';
    const codes = FIELD_CODES['family position'];
    return position.split(',').map(function(c) {
      const code = c.trim();
      // A code, or the position written out (1801: "Hans Kone", "Deres Søn")
      return codes[code.toLowerCase()] || expandAbbreviations(code, RELATIVES);
    }).join(', ');
  }

  // Family words in census positions written out ("Hans Kone" → "Hans Kone [wife]",
  // "Husmoderens Tante" → "... Tante [aunt]"); only there, since occupations use them
  // in passing ("Gaar sin Moder tilhaande")
  const RELATIVES = [
    [['Hosbonde', 'Husbonde', 'Huusbonde', 'Husfader', 'Husfar'], 'head of household'],
    [['Husmoder', 'Husmor', 'Huusmoder'], 'woman of the house'],
    [['Søn', 'Sønn', 'Sön'], 'son'], [['Datter', 'Dotter', 'Dattér'], 'daughter'],
    [['Børn', 'Born', 'Barn'], 'children'],
    [['Fader', 'Far'], 'father'], [['Moder', 'Mor'], 'mother'],
    [['Broder', 'Bror'], 'brother'], [['Søster', 'Syster'], 'sister'],
    [['Svigersøn', 'Svigersønn'], 'son-in-law'], [['Svigerdatter'], 'daughter-in-law'],
    [['Svigerfader', 'Svigerfar'], 'father-in-law'], [['Svigermoder', 'Svigermor'], 'mother-in-law'],
    [['Sønnesøn', 'Sønnesønn', 'Dattersøn', 'Dattersønn'], 'grandson'],
    [['Sønnedatter', 'Datterdatter'], 'granddaughter'],
    [['Pleiesøn', 'Fostersøn', 'Fostersønn'], 'foster son'],
    [['Pleiedatter', 'Fosterdatter'], 'foster daughter'],
    [['Pleiebarn', 'Fosterbarn', 'Plejebarn'], 'foster child'],
    [['Stedsøn', 'Stesønn'], 'stepson'], [['Steddatter', 'Stedatter'], 'stepdaughter'],
    [['Tante', 'Faster', 'Moster'], 'aunt'], [['Onkel', 'Farbroder', 'Morbroder', 'Farbror', 'Morbror'], 'uncle'],
    [['Huslægd', 'Lægd', 'Legd', 'Lægdslem'], 'pauper boarded by the parish']
  ];

  // --- Abbreviations in church-book positions and census occupations ---
  // These are transcribed from the original, so they're kept and the English is
  // added after them: "Gmd." → "Gmd. [farmer]", "... Hj. Søn" → "... Hj. Søn [son living at home]"
  const ABBREVIATIONS = [
    ['Gmd.', 'farmer'], ['Gaardm.', 'farmer'], ['Gdm.', 'farmer'],
    ['Hmd.', 'cottager'],
    ['Ugk.', 'bachelor'], ['Ungk.', 'bachelor'],
    ['Enkem.', 'widower'],
    ['Hj. Søn', 'son living at home'], ['Hj. Dtr.', 'daughter living at home'],
    ['Hj. Datter', 'daughter living at home']
  ];
  // Whole occupations and positions (any case, old and new spellings): "Murer" →
  // "Murer [mason]", "Hustru" → "Hustru [wife]", "Pladsfolk under X" → "Pladsfolk
  // [crofters] under X"
  const OCCUPATIONS = [
    [['Gaardmand', 'Gaardmann', 'Gårdmand', 'Gårdmann', 'Gaardbruger', 'Gaardbruker', 'Gårdbruker', 'Bonde', 'Gaardbeboer'], 'farmer'],
    [['Selveier', 'Selveiende', 'Selvejer', 'Selveiergaardmand'], 'freeholder'],
    [['Leilænding', 'Leilending', 'Bygselmand', 'Bygselmann'], 'tenant farmer'],
    [['Husmand', 'Husmann', 'Huusmand', 'Pladsmand', 'Plasmand', 'Plassmann'], 'cottager'],
    [['Husmandsfolk', 'Pladsfolk', 'Plasfolk', 'Plassfolk'], 'crofters'],
    [['Husmandskone', 'Pladskone'], "cottager's wife"],
    [['Strandsidder', 'Strandsitter'], 'shore cottager'],
    [['Inderst', 'Inderste', 'Innerst', 'Innerste', 'Losjerende', 'Logerende'], 'lodger'],
    [['Føderaadsmand', 'Føderaadsmann', 'Kaarmand', 'Kårmand', 'Kårmann', 'Kaarmann'], 'retired farmer'],
    [['Føderaadskone', 'Kaarkone', 'Kårkone'], "retired farmer's wife"],
    [['Tjenestekarl', 'Tjenestedreng', 'Tjenestegut', 'Dreng', 'Gaardsgut'], 'farmhand'],
    [['Tjenestepige', 'Tjenestepike', 'Tjenestetøs', 'Tjenestejente', 'Tjenestekvinde', 'Tjenestekone'], 'maidservant'],
    [['Tjener', 'Tjenestefolk'], 'servant'],
    [['Arbeider', 'Arbeidsmand', 'Arbeidsmann', 'Arbeiderske'], 'labourer'],
    [['Dagarbeider', 'Daglønner', 'Dagløner', 'Dagleier'], 'day labourer'],
    [['Fabrikarbeider', 'Fabrikarbeiderske'], 'factory worker'],
    [['Sagarbeider'], 'sawmill worker'],
    [['Bergmand', 'Bergmann', 'Grubearbeider', 'Gruvearbeider'], 'miner'],
    [['Fisker', 'Fiskar'], 'fisherman'],
    [['Sømand', 'Sjømand', 'Sjømann', 'Matros', 'Baadsmand', 'Båtsmann'], 'sailor'],
    [['Styrmand', 'Styrmann'], 'mate'],
    [['Skibsfører', 'Skibscaptein', 'Skibskaptein', 'Skipsfører'], "ship's master"],
    [['Murer', 'Muurmester', 'Murmester'], 'mason'],
    [['Tømmermand', 'Tømmermann', 'Tømmerman'], 'carpenter'],
    [['Snedker', 'Snekker', 'Snedkermester'], 'joiner'],
    [['Smed', 'Smid', 'Grovsmed', 'Smedmester'], 'smith'],
    [['Skomager', 'Skomaker', 'Skomagermester'], 'shoemaker'],
    [['Skrædder', 'Skræder', 'Skredder', 'Skræddermester'], 'tailor'],
    [['Møller'], 'miller'],
    [['Bager', 'Baker', 'Bagermester'], 'baker'],
    [['Slagter', 'Slakter'], 'butcher'],
    [['Væver', 'Vever', 'Væverske'], 'weaver'],
    [['Sadelmager', 'Salmaker'], 'saddler'],
    [['Garver'], 'tanner'],
    [['Rørlegger', 'Blikkenslager'], 'plumber'],
    [['Budeie', 'Budeje', 'Fjøskone'], 'dairymaid'],
    [['Staldkarl', 'Stallkar'], 'stableman'],
    [['Kjører', 'Kjørekarl', 'Kjørekar'], 'carter'],
    [['Artillerist'], 'artilleryman'],
    [['Kjøbmand', 'Kjøpmand', 'Kjøpmann', 'Kiøbmand'], 'merchant'],
    [['Handelsmand', 'Handelsmann', 'Handlende'], 'trader'],
    [['Skolelærer', 'Skoleholder', 'Lærer', 'Lærerinde', 'Lærerinne', 'Omgangsskolelærer'], 'teacher'],
    [['Klokker', 'Kirkesanger'], 'parish clerk'],
    [['Sogneprest', 'Sognepræst', 'Prest', 'Præst'], 'priest'],
    [['Lensmand', 'Lensmann'], 'sheriff'],
    [['Soldat', 'Dragon', 'Musketeer'], 'soldier'],
    [['Hustru', 'Hustrue', 'Kone'], 'wife'],
    [['Enke', 'Enkekone'], 'widow'],
    [['Enkemand', 'Enkemann'], 'widower'],
    [['Ungkarl', 'Ungkar'], 'bachelor'],
    [['Pige', 'Pike', 'Jomfru', 'Jomfrue'], 'unmarried woman'],
    [['Fattiglem', 'Almisselem', 'Lægdslem', 'Legdslem'], 'pauper'],
    [['Hjemmeværende', 'Hjemmehørende'], 'living at home']
  ];
  // `more`: further [words, English] pairs (RELATIVES for census positions)
  function expandAbbreviations(text, more = []) {
    let out = text || '';
    const annotate = (word, english, flags) => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Whole words only (\b is ASCII-only, so use Unicode letter classes), and not
      // again where the English already follows
      const re = new RegExp('(^|[^\\p{L}])(' + escaped + ')(?![\\p{L}])(?! \\[)', flags);
      out = out.replace(re, '$1$2 [' + english + ']');
    };
    for (const [abbr, english] of ABBREVIATIONS) annotate(abbr, english, 'gu');
    for (const [words, english] of [...more, ...OCCUPATIONS]) for (const word of words) annotate(word, english, 'giu');
    return out;
  }

  // --- Helper: English for a field's coded value, e.g. Gender "m" → "Male" ---
  function translateFieldValue(label, value) {
    const key = label.toLowerCase();
    if (!value) return value;
    if (key === 'role') return translateRole(value);
    if (key === 'family position') return translateCensusPosition(value);
    if (key === 'position' || key === 'occupation') return expandAbbreviations(value);
    // Ages in years/months/weeks/days (år, måneder, uker, dager): "57 a", "3 m 2 u", "27 A."
    if (key === 'age' && /^(\d+\s*[amud]\b\.?\s*)+$/i.test(value)) {
      const units = { 'a': 'year', 'm': 'month', 'u': 'week', 'd': 'day' };
      return value.replace(/(\d+)\s*([amud])\b\.?\s*/gi, function(_, n, u) {
        return n + ' ' + units[u.toLowerCase()] + (n === '1' ? '' : 's') + ' ';
      }).trim();
    }
    const codes = FIELD_CODES[key];
    return (codes && codes[value.toLowerCase()]) || value;
  }

  // --- Helper: Extract all people from census record pages ---
  // Census records use #collapse-persons with one .data-item per resident:
  //   <h4><a href=".../pfXXX"><span class="de-emphasized">001</span> Name</a></h4>
  // followed by labeled fields (Age/born, Place of birth, Family position, Occupation).
  function extractCensusPeople(permanentId) {
    const people = [];
    const section = document.querySelector("#collapse-persons");
    if (!section) return people;

    // DA shows the residents as cards (an h4 link, then label/value fields) or, as
    // its table view, as rows under column headings (H.no., Age/born, ...)
    for (const item of section.querySelectorAll(".data-item")) {
      const isRow = item.tagName === 'TR';
      const link = item.querySelector(isRow ? "td a[href]" : "h4 a[href]");
      const personId = idFromLink(link);
      if (!personId || !personId.startsWith('p')) continue;

      // Name without the leading person number
      const nameEl = link.cloneNode(true);
      nameEl.querySelectorAll(".de-emphasized").forEach(function(el) { el.remove(); });

      const f = isRow ? rowFields(item) : fieldMap(readFields(item));
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
        householdNo: f['h.no.'] || '',
        current: item.classList.contains('current') || personId === permanentId,
        primary: false
      });
    }
    return people;
  }

  // --- Helper: A table row's cells as a lowercase-heading → value map ---
  // (fieldMap()'s shape), the headings from the th cells. On the open page DA's
  // floatThead script moves the heading texts into a copy of the table (for the
  // sticky header) and leaves the table's own th cells empty, so then the copy's
  // are used; a fetched page has them in place.
  function rowFields(row) {
    function headings(table) {
      return Array.from(table.querySelectorAll('th')).map(function(th) {
        return cleanText(th.textContent).replace(/:$/, '').toLowerCase();
      });
    }
    const table = row.closest('table');
    let heads = table ? headings(table) : [];
    if (!heads.some(Boolean)) {
      const section = row.closest('#collapse-persons') || document;
      for (const other of section.querySelectorAll('table')) {
        const h = headings(other);
        if (h.some(Boolean)) { heads = h; break; }
      }
    }
    const map = {};
    Array.from(row.cells).forEach(function(cell, i) {
      if (heads[i] && !(heads[i] in map)) map[heads[i]] = cleanValue(cell.textContent);
    });
    return map;
  }

  // --- Helper: A census residence's residents as households ---
  // DA lists everyone at the residence, which may hold several households (a family,
  // lodgers, the old parents, ...). In most censuses each household starts at a
  // resident with "H.no." set (usually, but not always, the "hp"; lodger households
  // have "1" too). In 1801 and 1865 every resident has one (01, 01, 02, ...), and a
  // household starts where it changes. When no resident has an H.no., each "hp"
  // starts one. A household's first resident with no family position (1865 leaves
  // the head's empty) is its head.
  function censusHouseholds(people) {
    const hasHouseholdNo = people.some(function(p) { return p.householdNo; });
    const allHaveNo = people.every(function(p) { return p.householdNo; });
    let lastNo = '';
    const startsHousehold = function(p) {
      if (!hasHouseholdNo) return /^hp\b/i.test(p.role);
      const starts = allHaveNo ? p.householdNo !== lastNo : !!p.householdNo;
      lastNo = p.householdNo;
      return starts;
    };
    const households = [];
    for (const p of people) {
      if (startsHousehold(p) || !households.length) households.push([]);
      households[households.length - 1].push(p);
    }
    for (const household of households) {
      const head = household[0];
      if (hasHouseholdNo && !head.role) head.roleEnglish = 'Head of Household';
    }
    return households;
  }

  // The open person's household, or all residents if the open person isn't among them
  function censusHousehold(households) {
    const own = households.find(function(h) { return h.some(function(p) { return p.current; }); });
    return own || [].concat.apply([], households);
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

    // Jurisdiction named in the source title:
    //   "Church book from Folda parish 1836-1856 (1845P)"            → "Folda Parish"
    //   "Probate register for Ytre Sogn judicial district 1698-1853" → "Ytre Sogn Judicial District"
    //   "1891 census for 0529 Vestre Toten"                          → "Vestre Toten"
    const t = info.sourceTitle;
    let m;
    if ((m = t.match(/\bfrom (.+?) parish\b/i))) info.jurisdiction = m[1] + ' Parish';
    else if ((m = t.match(/\bfor (.+?) judicial district\b/i))) info.jurisdiction = m[1] + ' Judicial District';
    else if ((m = t.match(/\bcensus for (?:\d{3,4} )?(.+)$/i))) info.jurisdiction = m[1];
    else info.jurisdiction = '';

    return info;
  }

  // --- Helper: Extract links to the scanned original image(s) ---
  // DA's "Scanned" toolbar button: <a id="scannedImageLink" href="https://goto.digitalarkivet.no/kb..."
  // data-scans='["kb..."]'>. Image IDs are permanent (kb = church book, ft = census).
  // The button is disabled (href="#", data-scans="[]") when the record has no scan.
  function extractScans() {
    const link = document.querySelector("#scannedImageLink");
    const href = link ? link.getAttribute("href") || '' : '';
    if (!/^https?:\/\//.test(href)) return [];
    let ids = [];
    try { ids = JSON.parse(link.getAttribute("data-scans") || '[]'); } catch (e) { ids = []; }
    if (!Array.isArray(ids) || ids.length === 0) ids = [href.split('/').pop()];
    const base = href.substring(0, href.lastIndexOf('/') + 1);
    return ids.map(function(id) { return { id: id, url: base + id }; });
  }

  // --- Helper: The person(s) a record is about, whichever person's page is open ---
  // Returns { event, persons } — the child of a baptism, the couple of a marriage, the
  // deceased of a burial, the confirmand of a confirmation, the head of a census
  // household (people is already that household, see censusHousehold()) — or null
  // for other records (probate, ...), whose entry is the open person's own.
  function recordPrincipal(type, people) {
    const withRole = function(roles) {
      return people.find(function(p) { return roles.includes(p.role) && p.name; });
    };
    let event = '', persons = [];
    if (type === 'birth_baptism') {
      event = 'baptism'; persons = [withRole(['barn'])];
    } else if (type === 'marriage') {
      event = 'marriage'; persons = [withRole(['brudgom']), withRole(['brur', 'brud'])];
    } else if (type === 'death_burial') {
      event = 'burial'; persons = [withRole(['avdøde', 'avdød'])];
    } else if (type === 'confirmation') {
      event = 'confirmation'; persons = [withRole(['konfirmant'])];
    } else if (type === 'census') {
      event = 'household'; persons = [people.find(function(p) { return p.name; })];
    } else if (type === 'emigration' || type === 'out_migration' || type === 'in_migration') {
      // Each emigrant and each person moving has an entry of their own
      event = { emigration: 'emigration', out_migration: 'out-migration', in_migration: 'in-migration' }[type];
      persons = [people.find(function(p) { return p.current && p.name; })];
    }
    persons = persons.filter(Boolean);
    return persons.length ? { event: event, persons: persons } : null;
  }

  // --- Helper: Name(s) of the record's principal, e.g. "Peder Andersen and Johanne Andreasd." ---
  function principalNames(principal) {
    return principal.persons.map(function(p) { return stripNameVariants(p.name); }).join(' and ');
  }

  // --- Helper: Describe the record entry by its principal person(s) ---
  // e.g. "baptism of Hans Peder", "marriage of Peder Andersen and Johanne Andreasd.",
  // "Andreas Olsen household". Falls back to "entry for <open person>" for other record types.
  function describeEntry(type, people, pageName) {
    const principal = recordPrincipal(type, people);
    if (principal && principal.event === 'household') return principalNames(principal) + ' household';
    if (principal) return principal.event + ' of ' + principalNames(principal);
    pageName = stripNameVariants(pageName);
    return pageName ? 'entry for ' + pageName : '';
  }

  // --- Helper: Build a citation in Evidence Explained style (see citation.md) ---
  // Layers: original record (place, source, locator, entry) → repository
  // (National Archives of Norway, Digitalarkivet) + Permanent ID link + access date
  // → scanned original image(s). Place runs from most general to most specific.
  // FamilySearch citations are plain text, so titles are quoted rather than italicized.
  //   Church: Norway, Oslo, Garnisonsmenigheten Parish, Garnisonskirken, "Church book from
  //           Garnisonsmenigheten parish 1828-1841 (0301M4)," Births and baptisms, p. 55, entry 6,
  //           baptism of Hans Peder, 3 January 1836; database, National Archives of Norway,
  //           Digitalarkivet, Permanent ID pd99000000000901 (https://www.digitalarkivet.no/en/pd99000000000901
  //           : accessed 2 November 2026); scanned image kb99000000000902 (https://goto.digitalarkivet.no/kb99000000000902).
  //   Census: Norway, Oppland, Vestre Toten, "1891 census for 0529 Vestre Toten," census district
  //           01 Fjellsmarkas skolekrets, rural residence 009 Hager af Drager,
  //           Andreas Olsen household; database, ...
  function buildCitation(c) {
    const parts = [];
    const details = c.recordDetails || {};
    const isCensus = c.recordTypeInfo.type === 'census';

    // Place, general → specific (skipping repeats, e.g. county "Oslo" and church "Oslo")
    const place = [];
    for (const p of ['Norway', c.sourceInfo.county, c.sourceInfo.jurisdiction,
                     details['parish/church'] || c.sourceInfo.parish]) {
      if (p && !place.includes(p)) place.push(p);
    }
    parts.push(place.join(', '));

    if (c.sourceInfo.sourceTitle) parts.push('"' + c.sourceInfo.sourceTitle + '"');
    // Record section (e.g. "Births and baptisms"), unless the source title already says it
    if (c.recordType && !c.sourceInfo.sourceTitle.toLowerCase().includes(c.recordType.toLowerCase())) {
      parts.push(c.recordType);
    }
    parts.push.apply(parts, c.censusLocation);
    if (details['protocol reference']) parts.push('protocol ' + details['protocol reference']);
    if (details['page'] || details['page number']) parts.push('p. ' + (details['page'] || details['page number']));
    if (details['line number']) parts.push('line ' + details['line number']);
    if (details['serial no.']) parts.push('entry ' + details['serial no.']);
    parts.push(describeEntry(c.recordTypeInfo.type, c.people, c.pageName));
    if (c.date && !isCensus) parts.push(c.date);  // census year is already in the title

    // Evidence Explained puts the comma inside the closing quote: "Title," next
    let citation = parts.filter(Boolean).join(', ').replace('", ', '," ');
    citation += '; database, National Archives of Norway, Digitalarkivet' +
                (c.permanentId ? ', Permanent ID ' + c.permanentId : '') +
                ' (' + c.permalink + ' : accessed ' + c.accessDate + ')';
    for (const scan of c.scans) {
      citation += '; scanned image ' + scan.id + ' (' + scan.url + ')';
    }
    return citation + '.';
  }

  // Record detail fields already used in the citation (left out of the notes).
  // Partial event dates like "Baptism date: 01-03" are covered by the full date in the citation.
  const citedDetailKeys = new Set(['page', 'page number', 'line number', 'serial no.', 'year', 'parish/church', 'protocol reference']);

  // --- Helper: Build enriched notes with people and details not in the citation ---
  // Notes contain: permanent ID, the open person's own fields, remaining record
  // details (introduction, banns, remarks, ...), and the persons section.
  // DA puts everything after the first given name in "Last name" ("Hans" +
  // "Sørensen Lindemann"); the tradition is that only the last word is the
  // surname ("Hans Sørensen" + "Lindemann"). A word telling parts of a farm
  // apart stays with it ("Nedre Lunde"). Returns {index: value} for the
  // two fields, or null when nothing moves.
  function noteNames(fields) {
    const find = function(re) { return fields.findIndex(function(f) { return re.test(f.label); }); };
    const gi = find(/^given names?$/i), li = find(/^(last name|surname)$/i);
    if (gi < 0 || li < 0) return null;
    const words = fields[li].value.trim().split(/\s+/);
    let keep = 1;
    if (words.length > 2 && /^(nedre|øvre|ovre|søndre|nordre|vestre|østre|store|lille|indre|ytre|mellom|mellem)$/i.test(words[words.length - 2])) keep = 2;
    if (words.length <= keep) return null;
    const out = {};
    out[gi] = [fields[gi].value.trim()].concat(words.slice(0, -keep)).filter(Boolean).join(' ');
    out[li] = words.slice(-keep).join(' ');
    return out;
  }

  function buildNotes(permanentId, people, recordDetails, primaryDetails, others, recordDate) {
    // Full dates like "1812-10-11" read as "11 October 1812"; codes and
    // abbreviations get their English (see translateFieldValue)
    const noteValue = function(label, v) {
      return /^\d{4}-\d{1,2}-\d{1,2}$/.test(v) ? formatDate(v) : translateFieldValue(label, v);
    };
    const lines = [];
    if (permanentId) lines.push('Permanent ID: ' + permanentId);

    // Primary person details from always-visible section — all non-empty fields.
    // DA splits some dates into "Date of death: 04-12" + "Year of death: 1854";
    // those are combined into one line, "Date of death: 12 April 1854".
    // Without a year field (a baptism's "Date of birth: 04-02", "Birth year: -")
    // the year is the record's, or the year before when the day comes after the
    // record's own (born in December, baptised or buried in January).
    const recDate = (recordDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const fromRecord = function(md) {
      if (!recDate) return null;
      const p = md.split('-').map(Number);
      const after = p[0] * 100 + p[1] > Number(recDate[2]) * 100 + Number(recDate[3]);
      return formatDate((Number(recDate[1]) - (after ? 1 : 0)) + '-' + md);
    };
    if (primaryDetails && primaryDetails.fields) {
      const fields = primaryDetails.fields;
      const yearFor = {};  // event ("death", "birth") -> index of its year field
      fields.forEach(function(field, i) {
        const m = field.label.match(/^year of (.+)$/i) || field.label.match(/^(.+?) year$/i);
        if (m) yearFor[m[1].toLowerCase()] = i;
      });
      const merged = new Set();
      const names = noteNames(fields);
      const values = fields.map(function(field, i) {
        if (names && i in names) return names[i];
        const m = field.label.match(/^date of (.+)$/i);
        const yearIdx = m ? yearFor[m[1].toLowerCase()] : undefined;
        const year = yearIdx !== undefined && fields[yearIdx].value.match(/^\d{4}$/);
        if (year && /^\d{1,2}-\d{1,2}$/.test(field.value)) {
          merged.add(yearIdx);
          return formatDate(year[0] + '-' + field.value);
        }
        // Only the event the record is about: a burial's date of birth is decades earlier
        const near = { pd: /^birth$/i, pg: /^death$/i }[(permanentId || '').slice(0, 2)];
        if (m && near && near.test(m[1]) && /^\d{1,2}-\d{1,2}$/.test(field.value)) {
          const full = fromRecord(field.value);
          if (full) return full;
        }
        return noteValue(field.label, field.value);
      });
      fields.forEach(function(field, i) {
        if (!merged.has(i)) lines.push(field.label + ': ' + values[i]);
      });
    }

    // Remaining record details, in page order
    for (const [key, value] of Object.entries(recordDetails || {})) {
      if (citedDetailKeys.has(key) || / date$/.test(key) || /^date\b/.test(key)) continue;
      lines.push(key.charAt(0).toUpperCase() + key.slice(1) + ': ' + noteValue(key, value));
    }

    // People section — family members with full details
    if (people.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('--- Persons ---');
      people.forEach(function(person) { lines.push(personLine(person)); });
    }
    // A census residence's other households, each under its number
    (others || []).forEach(function(household) {
      if (!household.length) return;
      const no = household[0].householdNo;
      lines.push('');
      lines.push('--- Also at the residence' + (no ? ', household no. ' + no : '') + ' ---');
      household.forEach(function(person) { lines.push(personLine(person)); });
    });

    return lines.join('\n');

    // "Role: Name (position, b. 1841 or age 35, birthplace, res. ...)"
    function personLine(person) {
      const role = person.roleEnglish || person.role || 'Unknown';
      let line = role + ': ' + person.name + (person.primary ? ' *' : '');
      const details = [];
      if (person.position) details.push(expandAbbreviations(person.position));
      // Censuses give a birth year or an age ("35", "3 m"), church books a year
      if (person.birthYear) {
        details.push(/^\d{4}/.test(person.birthYear) ? 'b. ' + person.birthYear
          : 'age ' + translateFieldValue('Age', person.birthYear));
      }
      if (person.birthPlace) details.push(person.birthPlace);
      if (person.residence) details.push('res. ' + person.residence);
      if (details.length > 0) line += ' (' + details.join(', ') + ')';
      return line;
    }
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
    const parentPost = isCensus ? null : cleanText(document.querySelector("div.parent-post > h4")?.textContent) || null;
    if (parentPost && parentPost.includes(':')) {
      const colonIdx = parentPost.indexOf(':');
      recordType = parentPost.substring(0, colonIdx).trim();
      recordDate = parentPost.substring(colonIdx + 1).trim();
    } else if (parentPost) {
      recordType = parentPost.trim();
    }
    // Emigrant protocols' header holds group, date and ship: "00115/1882-09-16/Kong Ring"
    if (recordDate && !/^\d{4}(?!\d)/.test(recordDate)) {
      const dated = recordDate.match(/(?:^|[^\d])(\d{4}(?:-\d{2}){0,2})(?![\d])/);
      if (dated) recordDate = dated[1];
    }

    // Census: date is the census year ("1891 census for ..." / Start year), and the
    // parent-post headings give the location, e.g. ["census district 01 Fjellsmarkas
    // skolekrets", "rural residence 009 Hager af Drager"]
    const censusLocation = [];
    if (isCensus) {
      const yearMatch = sourceInfo.sourceTitle.match(/\b(\d{4})\b/);
      recordDate = sourceInfo.startYear || (yearMatch ? yearMatch[1] : '');
      for (const h4 of document.querySelectorAll("div.parent-post > h4")) {
        const text = cleanText(h4.textContent);
        const colonIdx = text.indexOf(':');
        if (colonIdx > 0) {
          censusLocation.push(text.substring(0, colonIdx).toLowerCase() + ' ' + text.substring(colonIdx + 1).trim());
        }
      }
    }

    // For records without a parent-post header, derive type from recordTypeInfo
    if (!recordType && recordTypeInfo.type !== 'unknown') {
      const typeLabels = {
        'birth_baptism': 'Births and baptisms',
        'census': 'Census',
        'death_burial': 'Deaths and burials',
        'marriage': 'Marriages',
        'confirmation': 'Confirmations',
        'emigration': 'Emigration',
        'out_migration': 'Out-migration',
        'in_migration': 'In-migration',
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
    // Permanent link (as shown in DA's Share box) — stable, unlike the browser URL
    const url = idValidation.valid ? 'https://www.digitalarkivet.no/en/' + permanentId : pageUrl;
    const now = new Date();
    const accessDate = formatDate(now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate());

    // Extract people from collapsible section (census: the open person's household;
    // the residence's other households, often the old parents or a married child,
    // are kept apart in `others`)
    const households = isCensus ? censusHouseholds(extractCensusPeople(permanentId)) : [];
    const people = isCensus ? censusHousehold(households) : extractChurchPeople(permanentId);
    const others = households.filter(function(h) { return h.indexOf(people[0]) < 0; });

    // Extract record details from #collapse-section-1 (church records)
    const recordDetails = extractRecordDetails(recordTypeInfo.type === 'emigration');

    // Extract primary person details from always-visible section
    const primaryDetails = extractPrimaryPersonDetails();

    // Mark the person whose page is open as primary (falls back to the first person)
    const primaryPerson = people.find(function(p) { return p.current; }) || people[0];
    const primaryPersonId = primaryPerson ? primaryPerson.id : null;
    if (primaryPerson) primaryPerson.primary = true;

    // Name of the open person: from the persons list, else Given name + Last name fields
    const scans = extractScans();

    const ownFields = {};
    for (const field of primaryDetails.fields) ownFields[field.label.toLowerCase()] = field.value;
    const pageName = (primaryPerson && primaryPerson.current && primaryPerson.name) ||
                     [ownFields['given name'], ownFields['last name']].filter(Boolean).join(' ');
    // Migration lists give the open person's role only in their own fields, and
    // emigrant protocols give none
    if (primaryPerson && primaryPerson.current && !primaryPerson.role) {
      if (ownFields['role']) {
        primaryPerson.role = ownFields['role'].toLowerCase();
        primaryPerson.roleEnglish = translateRole(primaryPerson.role);
      } else if (recordTypeInfo.type === 'emigration') {
        primaryPerson.roleEnglish = 'Emigrant';
      }
    }

    const citation = buildCitation({
      recordTypeInfo: recordTypeInfo, recordType: recordType, date: date,
      sourceInfo: sourceInfo, recordDetails: recordDetails, people: people,
      pageName: pageName, censusLocation: censusLocation,
      permanentId: idValidation.valid ? permanentId : '',
      permalink: url, accessDate: accessDate, scans: scans
    });

    // FS title: "<year>, <principal> - <source title> - <record type>", following
    // FamilySearch's usual year-first style, e.g.
    //   "1816, John, child of Pehr Aslaksen - Nord-Audnedal parish, ... (1028P) - Birth"
    //   "1891, Andreas Olsen household - 0529 Vestre Toten - Census"
    // "Church book from" / "1891 census for" are dropped to keep titles short (the
    // citation keeps the full source title), and the type is left off when the
    // source title already names it (probate).
    const titleTypes = {
      'birth_baptism': 'Birth', 'marriage': 'Marriage', 'death_burial': 'Burial',
      'confirmation': 'Confirmation',
      'census': 'Census', 'probate': 'Probate', 'emigration': 'Emigration',
      'out_migration': 'Out-migration', 'in_migration': 'In-migration',
      'tax': 'Tax', 'school': 'School', 'landed_property': 'Property',
      'fire_insurance': 'Fire Insurance'
    };
    // Unmapped types (e.g. migration records): singular of DA's section header
    const titleType = titleTypes[recordTypeInfo.type] || recordType.replace(/s$/, '');
    const titleSource = sourceInfo.sourceTitle
      .replace(/^church book from\s+/i, '')
      .replace(/^\d{4} census for\s+/i, '');  // year is already at the front
    const titleYear = (recordDate.match(/\d{4}/) || [''])[0];
    // Name the record's principal (the child of a baptism, not the father whose page
    // may be open). A child is often recorded by given name only ("John"); then the
    // parent is added — "John, child of Pehr Aslaksen" — rather than guessing a surname.
    const principal = recordPrincipal(recordTypeInfo.type, people);
    // When the open page isn't one of the principal's, point to the principal's page
    // so gatherData() can extract the record from that person's perspective
    const principalUrl = principal && !principal.persons.some(function(p) { return p.current; }) &&
                         principal.persons[0].id ? new URL(pageUrl).origin + '/en/' + principal.persons[0].id : '';
    let titleName = principal ? principalNames(principal) : stripNameVariants(pageName);
    if (principal && principal.event === 'household') titleName += ' household';
    if (principal && principal.event === 'baptism') {
      const child = principal.persons[0];
      // A surname is known only from the child's own page (its "Last name" field)
      const knownSurname = child.current && ownFields['last name'];
      const parent = people.find(function(p) { return ['far', 'fader'].includes(p.role) && p.name; }) ||
                     people.find(function(p) { return ['mor', 'moder'].includes(p.role) && p.name; });
      if (!knownSurname && parent) {
        const gender = child.current ? (ownFields['gender'] || '').toLowerCase() : '';
        const relation = gender === 'm' ? 'son' : (gender === 'k' || gender === 'f') ? 'daughter' : 'child';
        titleName += ', ' + relation + ' of ' + stripNameVariants(parent.name);
      }
    }
    const titleParts = [[titleYear, titleName].filter(Boolean).join(', '), titleSource];
    if (titleType && titleSource && !titleSource.toLowerCase().includes(titleType.toLowerCase())) {
      titleParts.push(titleType);
    }
    const title = titleParts.filter(Boolean).join(' - ') ||
                  document.title.replace(/\s*-\s*The Digital Archive\s*$/i, '').trim();

    // Build enriched notes with all people and details
    const notes = buildNotes(permanentId, people, recordDetails, primaryDetails, others, recordDate);

    return {
      date: date,
      title: title,
      url: url,
      citation: citation,
      notes: notes,
      permanentId: permanentId,
      scans: scans,
      recordTypeInfo: recordTypeInfo,
      recordType: recordType,
      recordDate: recordDate,
      primaryPersonId: primaryPersonId,
      people: people,
      others: others,
      fields: ownFields,
      principalUrl: principalUrl,
      error: idValidation.valid ? null : idValidation.error
    };
  } catch (err) {
    return {
      error: 'Failed to extract data: ' + err.message,
      url: pageUrl,
      date: '', title: '', citation: '', notes: '',
      permanentId: null, recordTypeInfo: { prefix: null, type: 'unknown' },
      recordType: '', recordDate: '', primaryPersonId: null, people: [], scans: []
    };
  }
}

// Phase 3, in the open DA page: the record as extractRecord() reads it. The open
// page may be a parent's or godparent's entry in the record. Citation,
// notes and title should describe the record's principal (e.g. the baptized
// child), so fetch the principal's own page of the same record and extract
// from that instead. On any failure, keep the open page's result.
async function gatherData() {
  const result = extractRecord(document, location.href);
  // The person whose page is open (the linker pairs the record's people from them)
  result.openPerson = result.people.find(function(p) { return p.current; }) || null;
  if (!result.error && result.principalUrl) {
    try {
      const response = await fetch(result.principalUrl, { credentials: 'same-origin' });
      if (response.ok) {
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const principalResult = extractRecord(doc, result.principalUrl);
        if (!principalResult.error) {
          principalResult.openPerson = result.openPerson;
          return principalResult;
        }
      }
      console.warn('arkivet2fs: could not use principal page ' + result.principalUrl);
    } catch (err) {
      console.warn('arkivet2fs: could not load principal page ' + result.principalUrl, err);
    }
  }
  return result;
}
