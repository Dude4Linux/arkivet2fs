# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**arkivet2fs** is a Chrome/Brave browser extension (Manifest V3) that extracts genealogical record data from Norway's DigitalArkivet (digitalarkivet.no) and auto-fills the FamilySearch.org SourceBox "Create Source" form.

### Workflow

1. User navigates to a person/record detail page on DigitalArkivet
2. Clicks the extension icon in the toolbar
3. `background.js` injects `gatherData()` into the DA page to extract record metadata, all persons with roles, source info, and builds a citation
4. Extension opens a background tab to FamilySearch SourceBox
5. `content.js` is injected into the FS tab, waits for the "Create Source" button, clicks it, then fills the form fields

## Architecture

- **manifest.json** — Manifest V3 config. No popup; the extension icon click triggers `chrome.action.onClicked` directly. Icons in `icons/` directory.
- **background.js** — Service worker with two main parts:
  - **Click handler**: Validates DA URL, injects `gatherData()`, checks for errors, opens FS tab, injects `content.js`, sends data.
  - **`fillFormError` listener**: shows a notification for problems reported by `content.js`.
  - **`gatherData()`**: Self-contained async function injected into DA page context. Contains all helper functions internally (cannot reference background.js scope). All extraction lives in `extractRecord(document)`, whose parameter shadows the global `document`. If the open page belongs to someone other than the record's principal (e.g. the father on a baptism), `gatherData()` fetches the principal's own page (`/en/<permanent ID>`), parses it with `DOMParser`, and extracts from that instead, so citation, notes, title and link all describe the principal. If that fails, it falls back to the open page. Use `textContent`, not `innerText`, because fetched documents aren't rendered. Helpers:
    - `validatePermanentId()` — validates 2-alpha + 14-digit format
    - `parseRecordType()` — maps ID prefix to record type (`pd`→birth, `pv`→marriage, `pk`→confirmation, `pg`→death, `pa`→probate, `pf`→census, etc.)
    - `formatDate()` — handles full, partial, and missing dates
    - `translateRole()` — Norwegian→English role translation (barn→Child, konfirmant→Confirmand, far→Father, etc.)
    - `readFields()` / `fieldMap()` — read DA's `<div>Label:</div><div class="ssp-semibold">Value</div>` pairs from the DOM (all field parsing goes through these)
    - `FIELD_CODES` / `translateCensusPosition()` / `translateFieldValue()` — English for coded values, per field: census family position, marital and residential status (HISTFORM codes from DA's key, https://www.digitalarkivet.no/en/content/abbreviations-census; e.g. hp→Head of Household, tj→Servant, fl→Lodger, b→Visitor), gender, legitimacy (e/u), roles, and ages ("57 a"→"57 years")
    - `expandAbbreviations()` — adds English after abbreviations in positions/occupations, keeping the transcribed text: "Gmd."→"Gmd. [farmer]", "Hj. Søn"→"Hj. Søn [son living at home]"
    - `extractChurchPeople()` — extracts persons from `#collapse-section-0` `.data-item`s (birth/marriage/death/probate records); the open person (`.data-item.current`) is always included and marked primary
    - `extractCensusPeople()` — extracts residents from `#collapse-persons` `.data-item`s (census records); this lists everyone at the residence
    - `censusHousehold()` — narrows the residents to the open person's household. A residence can hold several (a family, lodgers, ...); each starts at a resident with "H.no." set (not always the "hp"), or at each "hp" when none has an H.no.
    - `extractSourceInfo()` — extracts parish, county, source title from page title and detail sections
    - `extractScans()` — scanned-image link(s) from the `#scannedImageLink` toolbar button (`data-scans` holds image permanent IDs: `kb` church book, `ft` census); empty when the record has no scan
    - `buildCitation()` — Evidence Explained–style citation (see `citation.md`): place general→specific (Norway, county, parish/district/municipality from the source title, church), quoted source title, record section, census district/residence/household, protocol/page/entry, entry description (`describeEntry()`), date; then "database, National Archives of Norway, Digitalarkivet, Permanent ID <id> (<permanent link> : accessed <today>)" and "scanned image <id> (<link>)"
    - `recordPrincipal()` — who a record is about, whichever person's page is open: the child (baptism), couple (marriage; the groom's page is used), deceased (burial), confirmand (confirmation), head (first person) of the census household; used by `describeEntry()`, the title, and the switch to the principal's page
    - FS title is "<year>, <principal> - <source title> - <record type>"; a baptized child without a known surname gets ", child of <father/mother>" ("son"/"daughter" when the child's own page gives the gender), since surnames aren't guessed, and a census gets "<head> household" (Birth, Marriage, Burial, ...), FamilySearch's year-first style; "Church book from" / "<year> census for" are dropped from the source title, DA name variants (`%...%`) are stripped from the name, and the type is omitted when the source title already names it (probate)
    - `buildNotes()` — permanent ID, the open person's own fields (split dates like "Date of death: 04-12" + "Year of death: 1854" are merged; full dates like "1812-10-11" become "11 October 1812"), record details not in the citation (banns, remarks, ...), and all persons with their roles
  - **`showErrorMessage()`**: Chrome notification-based error display.
- **content.js** — Content script injected into FamilySearch. Listens for `fillForm` message, checks it landed on the SourceBox (not a sign-in redirect), clicks the "Create Source" button, waits for form elements (with 10s timeout), and fills them using `dispatchEvent` to trigger React's synthetic event handling. Failures are sent back to `background.js` as `fillFormError`.

### Key Constraints

- `gatherData()` executes in the DA page context (injected via `chrome.scripting.executeScript`). **All helper functions must be defined inside it** — they cannot reference anything else in `background.js`.
- Form filling in `content.js` requires dispatching `input`, `change`, and `blur` events for FamilySearch's React-based UI to register the values.
- DA Permanent IDs: two alpha characters + 14+ numeric digits (e.g., `pd00000012345678`). The prefix indicates record type (see `ai_prompt.md` for the full table).

### DA Page Structure Differences

- **Church records** (birth `pd`, confirmation `pk`, marriage `pv`, death `pg`): URL `/view/NNN/pXXX`, persons in `#collapse-section-0`, record details in `#collapse-section-1`, header in `div.parent-post > h4`
- **Census records** (`pf`): URL `/census/person/pfXXX`, persons in `#collapse-persons`, details in `#collapse-more`, no parent-post header

## Development

This is a browser extension with no build step, no package manager, and no test framework. To develop and test:

- Load as unpacked extension in Chrome/Brave via `chrome://extensions` → "Load unpacked" → select repo directory
- After code changes, click the reload button on the extension card in `chrome://extensions`
- Debug with the browser DevTools: service worker console (click "Inspect views: service worker" on the extension card) and page console for content script logs

## Host Permissions

The extension requires access to `https://*.familysearch.org/*` and `https://*.digitalarkivet.no/*`.

## Reference

`ai_prompt.md` contains the original project specification, including DA Permanent ID type prefixes and the planned multi-record-type workflow.
