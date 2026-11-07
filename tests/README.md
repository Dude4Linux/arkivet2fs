# Tests

```sh
npm install   # once: jsdom, for the tests only
npm test      # about 2 seconds, offline
node --test tests/da_match.test.js   # one file
```

Node 22.13 or later. Nothing here ships with the extension.

## How they work

`harness.js` loads the extension's own files into a jsdom window, in the order the
pages load them, and the tests call the real functions:

```js
const { load, SHARED, fixtureDoc, fixtureUrl } = require('./harness.js');
const w = load(SHARED);                       // the scripts search.html and linker.html share
w.givenStem('Anna');                          // 'Ann*'
w.extractRecord(fixtureDoc(w, 'da/baptism-1846.html'), fixtureUrl('da/baptism-1846.html'));
```

- Each file runs as a classic script, as from a `<script>` tag: function declarations
  are the window's properties; a top-level `const` is read with `value(w, 'NAME')`.
- `load(files, { html: 'search.html', url, lang: 'nb', fetch, fast: true })`: a page
  as the document (its `<script>` tags aren't run), the address, the UI language, a
  `fetch` stub (by default every request fails: the tests never touch the network), and
  timers that don't wait (DA's requests are spaced 1 s apart).
- `loadBackground()`: background.js with a `chrome` stub and `importScripts`.
- `criteria.js`: the search page's criteria, built from FS-style fields.
- Objects from the jsdom window compare with Node's only as plain data: `plain(x)`.

| File | Covers |
|---|---|
| `i18n.test.js` | languages, dates in English and Norwegian, translations, links |
| `da_places.test.js` | FS places → DA municipality and county codes; places abroad |
| `da_search.test.js` | name stems, the profile, the queries and their plan, result pages |
| `da_match.test.js` | names, years, scoring and grouping of hits |
| `da_record.test.js` | reading the saved record pages: title, citation, people, notes |
| `da_verify.test.js` | who's who in a record; a record against the FS family |
| `farms.test.js` | Rygh's table, telling farms from family names |
| `background.test.js` | DA addresses, FS names, an FS person as criteria |
| `linker.test.js` | pairing the record's people with the FS family; renames; what the SourceBox already has, and a run that attaches only those who lack the source (a fake FS behind `chrome.tabs`) |
| `fs_attach.test.js` | the linker's read-only steps on made-up FS pages: finding a source by title, who it is attached to |
| `releases.test.js` | the update check: versions, GitHub's release (a fake), the signature check, the badge and notification, the Updates page |
| `tools.test.js` | the release build (which files ship, a zip that's the same every time), signatures, `tools/verify.sh` and `tools/release` |
| `search.test.js` | the search page end to end, against a fake DA |

## Fixtures

`fixtures/da/` holds DA pages of real cases the code must handle (three men of one
name in one 1801 parish, two brothers of one name, a census residence of several
households, ...), with made-up names, IDs and links. They are made in two steps:

```sh
node tests/capture.js <name> <DA address or permanent ID>   # → tests/private/raw/
node tests/sanitize.js                                      # → tests/fixtures/da/
```

`capture.js` strips scripts, styles and the search form (a result page keeps only its
list) and writes the address and day in the first line. Only historical records (none
of living people), saved one at a time: DA limits automated requests.

`sanitize.js` gives every person, farm, residence and census district a made-up name
(patronymics follow the made-up father's name, so a family still reads as one), every
permanent ID, link number and UUID a made-up one (`pd99…`), and drops the page around
the record (header, menus, footer, DA's volunteers). It checks each page: the
extension must read the same record from it as from the real page, with only the names
and IDs swapped; no listed real name and no real ID may be left. It also lists the
capitalized words left (occupations, places), to be looked over.

`tests/private/` is never published (it's in `.gitignore`): `raw/` holds the real
pages, `names.json` the fixture names and the real → made-up names the tests rely on
(spellings of one name must stay spellings of one name, as Peer/Per/Pehr), and
`map.json` every name, ID and number given so far, so a page made again gets the same
ones and the tests' expectations stay right. Don't delete `map.json`; a new page adds
to it. Write tests against the made-up names, never the real ones. Both files are
the maintainer's; in a fresh clone `sanitize.js` runs without them, starting a new
`map.json` and taking every made-up name from its pools.

FamilySearch pages are never saved here: they show living people and other users'
work. FS persons in the tests are made up in the test files, with `TEST-…` PIDs.

## Writing tests

Base the expected values on what the code is meant to do (CLAUDE.md, the comments),
not on what it happens to give; where they disagree, find out which is wrong. A bug
fixed gets a test that fails without the fix.
