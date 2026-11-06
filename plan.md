# Plan: Phases 1 and 2 — from a FamilySearch person to DigitalArkivet records

Phase 3 (DA record → FS source, now the DA Linker: milestone 10) is done. This plan covers the two phases before it:

1. **Phase 1** — on a FS person details page, add a "Digital Arkivet" entry to the
   *Search Records* panel, below Google, with the extension's icon. Clicking it collects the
   person's details and starts Phase 2.
2. **Phase 2** — search DA with a set of targeted queries built from those details,
   and show a ranked list of possible matches, each linking to the DA record.
   The user checks a record, then clicks the toolbar icon there (Phase 3).

```
FS person page ──(Phase 1: click "Digital Arkivet")──▶ extension search page
     ▲                                                     │ Phase 2: queries DA,
     │                                                     │ ranks, lists matches
     │                                                     ▼
FS SourceBox ◀──(Phase 3: toolbar icon, exists)── DA record page (user verifies)
```

## What we found

Checked on https://www.familysearch.org/en/tree/person/details/XXXX-XXX (Jon Aslaksen,
1764–1822, the father on pd99000000000003, which we've used to test Phase 3).

### FS person page

- *Search Records* is a `ul` of `li`s. Each holds a `div[role=button]` with a
  `data-testid`: `search-familysearch`, `search-ancestry`, `search-myheritage`,
  `search-findmypast`, `search-geneanet`, `search-storied`, `search-filae`, and
  `search-google` (last). The entries aren't plain links, so ours will be our own
  element styled like them.
- Person data has stable `data-testid` hooks:
  - `conclusionDisplay:NAME`, `…:ALTERNATE_NAME` (Peer / Pehr Aslaksen),
    `…:GENDER`, `…:BIRTH`, `…:CHRISTENING`, `…:DEATH`, `…:BURIAL`, `…:RESIDENCE`.
    Each has `conclusion-date` and `conclusion-place`, for example "11 November 1764",
    "Vigmostad, Vest-Agder, Norway".
  - `section-card-family` has one `family-<PID>_<PID>` card per couple, with
    `couple-persons`, `person`, `fullName`, `nameLink` (→ PID) and
    `focusPersonHighlight`.
    - The card where the focus person is in the couple gives the spouse and children.
    - The card where the focus person is among the children gives the parents.
- Names are shown whole ("Jon Aslaksen"). The DOM doesn't split them into given name
  and surname, so we split them ourselves (see the name rules).
- FS is a single-page app: moving between persons doesn't reload the page, and
  React re-renders the panel.

### DA advanced person search

The search is `/en/search/persons/advanced` (GET).

- **Fields:**
  - person: `firstname`, `lastname`, `genders[]` (m/k), `roles[]` (barn, far, mor,
    fadder, brudgom, brud, avdød, konfirmant, …)
  - years and places: `birth_year_from/to`, `birth_place`, `domicile`, `position`,
    `event_year_from/to`, `event_date`
  - a related person: `related_first_name`, `related_last_name`,
    `related_birth_year`, `related_roles[]`
  - options: `no_alias` (turns off name variants)
  - areas: `c[]` county (10 = Vest-Agder), `m[]` pre-1964 municipality
    (1028 Vigmostad, 1034 Hægebostad, …), `r[]` region
  - record kinds: `sc[]` source category, `st[]` source type, `lt[]` list type
    (dp baptism, vi marriage, gr burial, kf confirmation, …), `jt[]` census year
    (13 = 1801, 3 = 1891, …)
- **Results:**
  - 50 per page, `&page=N`; "Your search resulted in N hits", which is missing when
    there's exactly 1.
  - Each hit is a `.unit` with: a name link to the record (`/view/NNN/<permanent ID>`),
    "(b. 1764-11-11, Hægebostad)" when known, gender, domicile, event date, position,
    role, and the source title.
- **Wildcards:** DA's help says "special search characters will result in 0 hits",
  but a **trailing `*`** works on first and last names, including the related
  person's ("Jon" + "Aslaks*" → 69 hits, and DA still adds Joen/John for the first
  name; "Maren*" + "Lindem*" → 66). A `*` inside a word ("J*n", "Tol*fs*") or a `?`
  finds nothing useful.
- **Given names match word by word:** "Maren" matches "Maren Kristine", but
  "Maren Kristiane" finds nothing when DA spells it "Kristiana". Search on the first
  given name.
- **`genders[]` drops records with no gender,** which many censuses are: with
  `genders[]=k`, Maren's 1870 census (pf99000000000004) is missing. Don't filter on
  gender; use it for scoring.

### Experiments (Jon Aslaksen)

| Query | Hits | Known record kept? |
|---|---|---|
| Jon + Aslaksen | 63 | yes; name variants also matched Joen and John |
| … + `no_alias` | 29 | **no**: the record says "John" |
| … + `birth_year` 1762–66 | 4 | **no**: fathers and godparents rarely have a birth year |
| … + `event_year` 1780–1822 | 42 | yes |
| … + municipalities 1028, 1034 | 53 | yes |
| … + related first name "Guri" | 21 | yes (FS spells her "Gurj") |
| Jon + Aslaksøn | 0 | name variants don't cover patronymic spellings |
| **His baptism:** Jon, role barn, related first name Aslak, 1763–66 | 2 | top hit pd99000000000005, b. 1764-11-11, Hægebostad = FS christening |
| **His burial:** Jon Aslaksen, role avdød, 1821–23 | 1 | pg99000000000006, 1822-08-16 = FS burial |
| **His son's baptism:** John, role barn, related John Aslaksen, 1815–17 | 1 | pd99000000000007 |
| **1801 census:** Jon Aslaksen, `jt[]=13` | 3 | three men named Peer Aslaksen (b. 1764, 1766, 1779); the household check settles it: the b. 1766 one at Nedre Lunde has his wife Gurj Tollefsdatter, the b. 1779 one is a son of Aslak Tjøstolvsen, the third is an unmarried head |

**Conclusion:** one broad name search is noisy. A small set of targeted queries, one
per expected life event, finds the right records with 1–3 hits each.

## Phase 1 — the "Digital Arkivet" entry on FS

### Files

- `manifest.json`
  - Add a `content_scripts` entry for `https://www.familysearch.org/*` that runs
    `fs_person.js`. Match all of FS, because a single-page navigation can reach a
    person page without a reload.
  - Add `web_accessible_resources` for the DA icon.
- `icons/da16.png` and `icons/da32.png` — DA's favicon, downloaded once from
  digitalarkivet.no and bundled (not hot-linked); later replaced by the
  extension's own icon, `icons/icon32.svg`.
- `fs_person.js` (new):
  1. **Watch:** detect `/tree/person/details/<PID>` on load and on URL changes, and
     observe the DOM (`MutationObserver`) until `[data-testid=search-google]` appears.
  2. **Insert:**
     - Copy Google's `li` (to inherit FS styling), swap in the DA icon and the label
       "Digital Arkivet", and set `data-testid=search-digitalarkivet`. Insert it after
       Google.
     - Keep it keyboard-accessible (`role=button`, Enter or Space).
     - Re-insert it if React re-renders the panel, and never insert it twice.
  3. **On click,** gather the person:
     ```js
     { pid, name, altNames[], gender,
       birth: {date, place}, christening, death, burial, residences[],
       father, mother,              // {name, pid, years}
       spouses[], children[] }      // from the family cards
     ```
     Then send `{action: 'searchDA', person}` to `background.js`.
- `background.js`:
  - On `searchDA`, turn the person into search criteria and open
    `search.html?<criteria>` in a new tab next to the FS tab.
  - Like FS's own record search
    (`/search/record/results?treeref=…&q.givenName=…&q.surname.1=…&q.birthLikeDate.from=…`),
    the criteria live in the address, using FS's parameter names where they exist,
    with years ±2. Editing the sidebar updates the address, so Back/Forward and
    bookmarks work, and nothing needs storing.

### Testing

- Save the FS person page's HTML (from the browser) and unit-test the scraper with
  the jsdom harness.
- In the live FS tab, check that the link appears, survives navigating to another
  person and back, and sends the right data.

## Phase 2 — searching DA

### Search page (`search.html` / `search.js`, an extension page)

- **Left sidebar — criteria, modelled on FS's own search sidebar.** It opens filled
  in with the person's details. The user adds missing details to narrow a search
  that finds too many matches, or removes details when it finds none.
  - **Person:** given name, patronymic, gender, alternate names.
  - **Events:** birth/christening, confirmation, marriage, residence, emigration,
    death/burial, each with year (and range) and place.
  - **Family:** father, mother, spouse(s), children, each with a checkbox to use or
    skip them.
  - **Where to search (DA-specific):** county and municipality/parish, picked from
    DA's own lists (with type-ahead), pre-selected from the FS places when they match.
    Several can be chosen, or none to search all of Norway.
  - **Record kinds:** baptism, confirmation, marriage, children's baptisms, census,
    emigration, burial.
  - Each query shows its hit count. When one returns many hits, the sidebar suggests
    narrowing (add a parish or a year); when it returns none, it suggests what to
    drop (the related person, the place, the year range).

  Changing a field reruns the affected queries. This is the spec's "select or
  deselect search details until one or more matching records is found".
- **Right panel — matches:**
  - Grouped by record kind: Baptism, Confirmation, Marriage, Children's baptisms,
    Census, Burial, Other.
  - Each match shows: name, translated role, date, domicile, source title, a score,
    and *why* it matched (e.g. "father Aslak ✓", "year 1764 ✓", "Vigmostad ✓").
  - Its link opens the DA record in a new tab, where the toolbar icon runs Phase 3.
- **Each query** also gets an "Open on DA" link to the same search on DA's own site,
  for manual refinement.
- The extension page can fetch DA directly (host permission already granted). We
  reuse the DOMParser approach from Phase 3.

### Query plan

Built from the FS person. Each query targets one life event.

| Target | Query | Year range |
|---|---|---|
| Own baptism | given name, role `barn`, related = father (first name; surname if not a patronymic), else mother | birth/christening year ±1 |
| Confirmation | given name, role `konfirmant`, (lastname) | birth + 13…19 |
| Marriage | given + last name, role `brudgom`/`brud`, related = spouse's first name | marriage year ±1, else birth + 18…50 |
| Children's baptisms | given + last name, role `far`/`mor` (one query; it also finds children FS doesn't have, and known children are matched by birth year when scoring) | birth + 16 … birth + 50 (mother) or 70 (father), up to death |
| Census | given + last name, `jt[]` = census years within the lifespan, `birth_year` ±3 (census rows do record it) | census year |
| Emigration | given + last name, emigration sources (`sc[]=em`: emigrant protocols, passenger lists, passports), `birth_year` ±3 (protocols give the age) | birth to death |
| Moving away | given + last name, church books' moving lists (`lt[]=uf`, `fl`: out-migrated, in- and out-migrated); no `birth_year`, since many give no age | birth to death |
| Burial | given + last name, role `avdød`; skipped when FS has the death outside Norway | death/burial year … +1 |
| Fallback | given + last name only | lifespan |

### Name rules

Your tree uses **patronymic names, with the farm treated as an address**: people
moved from farm to farm, and their names didn't change. The rules follow that, and
cope with FS entries others made with a farm in the name.

- Keep DA's name variants on. They handle Jon/Joen/John, but not patronymic suffixes.
- **Split FS names:**
  - The first word(s) up to the patronymic are the given name(s).
  - The patronymic (*-sen/-søn/-son, -datter/-dotter/-dtr./-sd.*) is the surname
    used in queries.
  - Anything after the patronymic ("Ole Olsen **Forkerud**") is usually a farm, but
    it can be a family or place-derived name (Lindeman). So it's
    checked against the farm registers (farms.js): Rygh's *Norske Gaardnavne*
    (University of Oslo, the 1886 matrikkel's farms with their historical
    municipality and amt) and, when Rygh has none nearby, Kartverket's place-name
    register (today's farms and holdings, Gard/Bruk; "Nedre Lunde" is also tried
    as "Lunde"). It's a farm only when a farm of that name lies in a municipality
    or county of the person's FS places (any farm, when FS has no places): then it
    goes to the sidebar as a farm (DA `domicile` and scoring), not into `lastname`.
    Otherwise it's the surname, and the patronymic becomes another name, tried when
    the surname finds nothing. Lindeman is a farm only in Bremsnes (Romsdal), so for
    Maren's family near Oslo and Fredrikstad it's a surname. When neither register
    answers (5 s each), it's taken as a surname.
  - A name with no patronymic (a fixed family name like Lindeman) is used whole as
    the surname; when a farm of that name lies in the person's places, it's also a
    farm ("Tollef Rysstad" in Bygland).
- **Generate patronymic spellings** when a query finds nothing, e.g. Tollefsdatter →
  Tollefsd., Tollefsdr.; Olsen → Olssen, Olsøn. A trailing `*` on the stem
  (Tollefs*, Ols*) covers the endings; spellings of the stem itself are separate
  queries, tried in order of likelihood.
- **Farms in DA records:** DA's transcriptions usually give the farm as the
  residence, but sometimes as part of the name. Match the FS farms (from names and
  residence places) against both when scoring.
- **Children of patronymic families** usually have no surname on their baptism
  (e.g. "John"), so baptism queries leave `lastname` empty and rely on the related
  parent.
- Use FS alternate names as extra given-name or surname candidates.

### Place rules

- Split the FS place ("Hægebostad, Vigmostad, Nord-Audnedal, Vest-Agder, Norway")
  into its parts.
- Match each part against DA's municipality list (`m[]` labels, read from the
  advanced-search form and cached) and county names (`c[]`).
- Keep a small table of historical county names, e.g. Lister og Mandal amt =
  Vest-Agder (10).
- Use places to **score** first, and to filter only when a query returns too many
  hits. The exception is the baptism by birthplace, which has no other filter: an
  FS place part can be a farm with a municipality's name (Jon's "Hægebostad" is a
  farm in Vigmostad, 1028, not the municipality 1034), so it may find nothing,
  and the baptism by parent still runs. The municipality filter cut 63 hits to 53 without losing the record;
  county alone changed nothing.
- The user can always add or remove counties and parishes in the sidebar (see
  above); a filter set there applies to every query.

### Running the queries

- Run them one at a time, about 1 s apart. DA rate-limits automated traffic.
- Follow `page=` up to a cap (e.g. 3 pages).
- Cache results for the session.
- On 403 or 429, stop and say so.
- Merge hits by permanent ID: one record can match several queries, and those
  matches add up.

### Scoring and checking

- **Score:** name match (exact > variant), year closeness, place-part match,
  related-person match, and whether the role is the expected one.
- **Check the close calls:** for census candidates, fetch the person's page and look
  for the spouse or children in the household (reusing `extractCensusPeople` /
  `censusHousehold`). This settles cases like the three 1801 Peer Aslaksens.
  Done in `da_verify.js` for every kind of record, not only censuses: the record
  page's parents, spouse and children are compared with FS's (see milestone 8).

### Later

- **"Create source" button:** a button on each match could run Phase 3 directly
  (fetch + `extractRecord(doc)`, which already works on fetched pages), skipping the
  visit to the DA page.
- **Attaching to the FS tree:** done as the DA Linker (milestone 10). A census pairs everyone at the residence (all households) through the relatives' FS families, read in a background tab.

## Milestones

Each milestone is testable on its own.

1. **Phase 1 link:** content script and icon; the link appears and survives page
   navigation. Clicking logs the gathered person.
2. **Person scraper:** full person object, unit-tested on a saved FS page; message
   → `search.html` opens with the person.
3. **Single query end to end:** query builder plus DA fetch and parse for the own-baptism
   query; the results list with links.
4. **Full query plan:** the remaining queries, merging, scoring and grouping.
   Done: `da_match.js` merges by permanent ID and scores with visible reasons;
   tested on Jon Aslaksen and Maren Lindeman, where the right record leads each
   group. Per-child baptism queries were left out (one parent query finds them
   all, with fewer requests); a "too young for the role" check separates namesakes.
5. **Criteria panel:** editable criteria, reruns, "Open on DA" links.
   Done: each relative has a checkbox to use them or not (`q.fatherSkip=1`, ...);
   "Where to search" picks DA counties and municipalities by type-ahead (`m=`,
   `c=`; DA finds records in any of them), suggesting the FS places'
   municipalities without choosing them, and limits every search to them;
   "Record kinds" turns searches off (`off=census,other`). Checkboxes and places
   search again at once, other fields on Search; result pages are cached, so only
   the changed searches go to DA. A search that finds too many hits or none says
   what to change, next to its count. Confirmation and emigration events aren't in
   the sidebar: FS rarely has them, and their searches use the birth year.
6. **Name and place rules:** patronymic spellings, farm names, municipality matching
   with the cached code list.
   Done: given-name stems (`givenStem`, Anna → Ann*), consonant matching when
   scoring (names and farms: Hægbostad = Hægebostad), patronymics from the father,
   the municipality list (`da_places.js`, generated from DA's form rather than
   fetched) and the baptism by birthplace. A search with no hits is retried with
   other names (the father's patronymic, FS alternate names, patronymic spellings
   like Johans*/Johannes*), and one with over 100 hits is narrowed to the FS places'
   municipalities; the status says which, and "Open on DA" opens the search used.
   A retry that still finds over 100 hits after narrowing isn't used.
   Farms (words after the patronymic in an FS name, or `q.farm`) get a "Records at
   <farm>" query (DA's `domicile`). It found Maren's baptism (pd99000000000008,
   parents mistranscribed) and her 1875 census (pf99000000000009); her confirmation
   isn't among the 48 Maren Johannes* confirmed in Oslo and Aker, perhaps because she
   was a foster daughter in Fredrikstad by 1875.
7. **Emigration:** find how DA's emigration sources are searched (emigrant
   protocols, church-book departure lists: their `sc[]`/`lt[]` codes and roles), add
   the query, and make sure Phase 3 extracts those records.
   Done: emigration sources are `sc[]=em` (records `pe`); church books' moving lists
   are `lt[]=uf`/`if`/`fl` (records `pu` out-migration, `pi` in-migration, roles
   utflytter/innflytter). The Emigration query now runs from birth with
   `birth_year` ±3, and a "Moving away" query (`lt[]=uf`, `fl`) adds a Moving group
   and a "Moving away" record kind. Phase 3 extracts both: an emigrant protocol's
   group of travellers (date from the group header), page and line go into the
   citation, its travel group (unrelated people) isn't listed as a family, and the
   emigrant is the principal ("1882, Maren Lindemann - Oslo police district, …
   Emigrant protocols, no. 9: 1882-1883 - Emigration"); a moving record takes its
   role from the person's own fields. Ages like "27 A." become "27 years", and town
   abbreviations (Fr.stad, Fr.hald, Chr.sand, Chr.sund) are place aliases.
8. **Verification:** census household check; tune scoring against the test tree.
   Done: Phase 3's extraction moved from background.js into `da_record.js`
   (`extractRecord(document, pageUrl)`, which also returns the open person's
   `fields`), so the search page can read record pages too. After the searches,
   `da_verify.js` reads the record pages of the best few hits of each group (8
   children's baptisms, 3 otherwise; at most 30) and compares the people in them
   with the FS relatives: a parent, spouse or child named there ✓ (+3, +2 for each
   child), another parent or spouse ✗ (-2; not for census parents), unmarried in a
   census after FS's marriage ✗ -3, an emigrant's destination among the FS places ✓ +2.
   Results for the test tree: the 1801 Peer Aslaksen at Nedre Lunde (✓ spouse Gurj
   Tollefsdatter) now leads the Census group, and his marriage to Gury Tollefsd. and
   the children's baptisms with Guri rank above namesakes with wives Else or Aase.
   Maren's 1870 Arendal census has her mother Johanne and sister Selma (✓ mother),
   and her emigration "✓ going to Denver Col.". Found on the way: in the 1801
   census every resident has an H.no., so `censusHousehold()` took one person as a
   household (now a household starts where the number changes, when all have one);
   1801 family positions are free text ("Hosbonde", "Hans kone", "Deres børn"); an
   old final j is i in names (Gurj = Guri). DA transcribed Maren's father as
   "Johanne", so her baptism gets "✗ father Johanne, not Johannes" but still ranks first.
9. **Docs:** update CLAUDE.md and the README.
   Done: `README.md` covers installing, the three steps (the FS entry, the search
   page and its scores, the SourceBox), DA's request limits, transcription caveats,
   which sites are contacted, and the files. CLAUDE.md describes every file.

10. **DA Linker:** review a record as a source and attach it to the tree, as FS's
   Source Linker does for its own records. FS's `/platform/` API answers 401 without
   a session token, so the linker automates FS's own UI instead: the SourceBox's
   Create Source and Attach (Find by ID, then the reason), and the person's Sources
   tab for tags (the chips' `data-selected`). `linker.html` is the pause: the user
   edits the source (a child baptized as "Ole" can become "Ole Olsen" from the
   father's patronymic, and the title, citation and notes follow), pairs the
   record's people with the FS person and family (suggested by role, given name and
   birth year), and chooses tags and reasons. Only then does `fs_attach.js` run the
   steps in an FS tab. The FS family is the one `fs_person.js` read for the search,
   kept in extension storage. Tags are only added, never removed, and a source with
   the same title already in the SourceBox is reused.

## Phase 4 — languages: Bokmål, Nynorsk and English

DA is in Bokmål (no prefix: `/view/...`), Nynorsk (`/nn/...`) and English (`/en/...`).
The extension's own pages should be in the user's language as well.

### What we found

- **DA's Norwegian pages translate everything**, even the source title ("Klokkerbok
  for Vågå prestegjeld", not "Church book from Vågå parish") and the field labels
  ("Fødselsår:", "Namn:", "Bustad:"). `da_record.js` reads DA's English labels and
  titles, so it must keep reading the `/en/` pages. Searches and record checks
  already fetch `/en/`. The toolbar icon reads the open page, which breaks on a
  Norwegian page.
- **FS in Norwegian (`/no/`)** mixes languages and spellings. Family cards give the
  sex as "Mann"/"Kvinne" or "Man"/"Woman", not "Male"/"Female", so `fs_person.js`
  loses the parents. Places can lose their letters ("Vaga, Oppland, Norway" for
  Vågå), and alternate names get Norwegian type words.
- **DA's search form in all three languages** gives the words for record kinds,
  roles and events (Fødte og døpte / Fødde og døypte, Folketellingen /
  Folketeljinga 1865, Døde og begravde / Døde og gravlagde, Utflyttede / Utflytta,
  Fadder, Brud / Brur, ...). The translations use DA's words, plus FS's Norwegian
  words for what mirrors FS's record search (Fornavn, Etternavn, Fødsel, Dåp).

### What is translated

- The **search page**: the sidebar, record kinds, groups and column headings, hints,
  status lines, the steps' descriptions ("mother Ing* Lars* for Ingrid Larsdr"),
  skip reasons, "Not found", the score reasons (✓/≈/✗), the record checks, and
  dates ("6. april 1845").
- The **linker**: the labels, hints, pairing reasons, status lines and the log. Also
  the **reason for attaching**, which goes to FS as the user's own words.
- The background's **notifications**, and the extension's name and description
  (`_locales`, Chrome's `no` locale).

### What isn't (a decision to review)

- **The source itself** (title, citation, notes) stays in English. FS's tree is
  shared worldwide, the citation follows Evidence Explained, and the notes put
  DA's Norwegian codes into English. A "source language" setting could come later.
  It would need Norwegian citation phrasing and the notes' code tables in both
  written languages.
- DA's own text (names, roles and positions as written) and the "Digital Arkivet"
  entry on FS.

### How

- **`i18n.js`**, loaded first by both pages, and by background.js (`importScripts`).
  It uses only function declarations, so the jsdom tests see them.
  - `uiLanguage()`: the saved choice, else the browser's (`navigator.languages`: nn →
    Nynorsk; nb or no → Bokmål; anything else → English).
  - `t(text, params)`: the English text is the key, `{name}` placeholders, English as
    the fallback.
  - `localizePage()` fills elements marked `data-i18n`, and `languageMenu()` is the
    picker in the page header.
  - `daPageUrl(url)` gives a DA link in the user's language (record links, "Open on
    DA"). Fetching stays on `/en/`.
  - The choice is kept in `localStorage` (shared by the extension's pages) and in
    `chrome.storage.local` (for the service worker). Changing it reloads the page:
    the search page's state is in its address, and the linker reads its record again.
- **Toolbar icon on a Norwegian DA page:** `gatherData()` fetches the `/en/` version
  of the open page and reads that, with the open person as on the page.
- **FS in Norwegian:** `fs_person.js` reads the sex in either language and
  normalizes it to Male/Female/Unknown. It also reads Norwegian alternate-name types
  and the titles of emigration/immigration events (Utvandring, Emigrasjon,
  Innvandring, Immigrasjon). Place lookups also try names without Norwegian letters
  ("Vaga" → Vågå, "Hagebostad" → Hægebostad) when the name as written finds nothing;
  a spelling several municipalities share is narrowed by the FS county, as for names.
- **Checks:** a script lists every `t()` text in the code and confirms it has a
  Bokmål and a Nynorsk translation with the same placeholders. The existing tests
  run in English unchanged, and once more in nb and nn to read the output.

### Status (6 November 2026)

Done as described above, not yet committed. The English output of every test is
unchanged; the tests were also run in Bokmål and Nynorsk and read through. Not yet
tried in the browser on DA's and FS's Norwegian pages.

### Open for review

- The Nynorsk texts (written by the assistant, using DA's Nynorsk words) need a
  native reader.
- Whether the source should follow the language, at least the reason for attaching
  (done) and later the notes.

## Decisions

1. **Results** appear on an extension search page, with an FS-style sidebar.
2. **Test tree:** a family on FS and its Norwegian ancestors. All of them are known in both FS and DA, so each person's DA
   records are the expected results. The aim is to attach DA records to the tree
   conveniently. Many duplicate FS records, but DA's often add useful details.
3. **Names:** patronymic naming, farms as addresses (see the name rules).
4. **Record kinds:** probate is left out of the default searches (it stays available
   as "Other"); **emigration** is added and is important for several family members.
5. **Places:** no default region limit. The sidebar lets the user add a county or
   parish to narrow a search, or remove details when there are no matches.
