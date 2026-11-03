# Plan: Phases 1 and 2 — from a FamilySearch person to DigitalArkivet records

Phase 3 (DA record → FS SourceBox) is done. This plan covers the two phases before it:

1. **Phase 1** — on a FS person details page, add a "Digital Arkivet" entry to the
   *Search Records* panel, below Google, with DA's favicon. Clicking it collects the
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

Checked on https://www.familysearch.org/en/tree/person/details/XXXX-XXX (Per Aslaksen,
1764–1822, the father on pd99000000000009, which we've used to test Phase 3).

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
- Names are shown whole ("Per Aslaksen"). The DOM doesn't split them into given name
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
- Wildcards aren't allowed: "special search characters will result in 0 hits".

### Experiments (Per Aslaksen)

| Query | Hits | Known record kept? |
|---|---|---|
| Jon + Aslaksen | 63 | yes; name variants also matched Joen and John |
| … + `no_alias` | 29 | **no**: the record says "John" |
| … + `birth_year` 1762–66 | 4 | **no**: fathers and godparents rarely have a birth year |
| … + `event_year` 1780–1822 | 42 | yes |
| … + municipalities 1028, 1034 | 53 | yes |
| … + related first name "Siri" | 21 | yes (FS spells her "Sirj") |
| Per + Aslaksøn | 0 | name variants don't cover patronymic spellings |
| **His baptism:** Jon, role barn, related first name Aslak, 1763–66 | 2 | top hit pd99000000000001, b. 1764-11-11, Hægebostad = FS christening |
| **His burial:** Per Aslaksen, role avdød, 1821–23 | 1 | pg99000000000907, 1822-08-16 = FS burial |
| **His son's baptism:** John, role barn, related Pehr Aslaksen, 1815–17 | 1 | pd99000000000011 |
| **1801 census:** Per Aslaksen, `jt[]=13` | 3 | three men named Peer Aslaksen (b. 1764, 1766, 1779); needs a household check |

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
  digitalarkivet.no and bundled (not hot-linked).
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
| Children's baptisms | given + last name, role `far`/`mor`, related = spouse's first name; plus one query per child (child's name, role `barn`, related = this person) | each child's birth ±1 |
| Census | given + last name, `jt[]` = census years within the lifespan, `birth_year` ±3 (census rows do record it) | census year |
| Emigration | given + last name, emigration sources (`sc[]=em`, plus church-book departure lists), `birth_year` ±3 | from about age 15 to the first FS place outside Norway or death |
| Burial | given + last name, role `avdød` | death/burial year ±1 |
| Fallback | given + last name only | lifespan, county filter |

### Name rules

Your tree uses **patronymic names, with the farm treated as an address**: people
moved from farm to farm, and their names didn't change. The rules follow that, and
cope with FS entries others made with a farm in the name.

- Keep DA's name variants on. They handle Jon/Joen/John, but not patronymic suffixes.
- **Split FS names:**
  - The first word(s) up to the patronymic are the given name(s).
  - The patronymic (*-sen/-søn/-son, -datter/-dotter/-dtr./-sd.*) is the surname
    used in queries.
  - Anything after the patronymic ("Ole Olsen **Forkerud**") is a farm. It goes to
    the sidebar as a place (DA `domicile` and scoring), not into `lastname`.
  - A name with no patronymic (a fixed family name like Lindeman) is used whole as
    the surname.
- **Generate patronymic spellings** when a query finds nothing, e.g. Tollefsdatter →
  Tollefsd., Tollefsdr.; Olsen → Olssen, Olsøn. Since there are no wildcards, each
  spelling is a separate query, tried in order of likelihood.
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
  hits. The municipality filter cut 63 hits to 53 without losing the record;
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

### Later

- **"Create source" button:** a button on each match could run Phase 3 directly
  (fetch + `extractRecord(doc)`, which already works on fetched pages), skipping the
  visit to the DA page.
- **Attaching to the FS tree:** attaching records to persons directly needs
  investigation (FS API or UI automation).

## Milestones

Each milestone is testable on its own.

1. **Phase 1 link:** content script and icon; the link appears and survives page
   navigation. Clicking logs the gathered person.
2. **Person scraper:** full person object, unit-tested on a saved FS page; message
   → `search.html` opens with the person.
3. **Single query end to end:** query builder plus DA fetch and parse for the own-baptism
   query; the results list with links.
4. **Full query plan:** the remaining queries, merging, scoring and grouping.
5. **Criteria panel:** editable criteria, reruns, "Open on DA" links.
6. **Name and place rules:** patronymic spellings, farm names, municipality matching
   with the cached code list.
7. **Emigration:** find how DA's emigration sources are searched (emigrant
   protocols, church-book departure lists: their `sc[]`/`lt[]` codes and roles), add
   the query, and make sure Phase 3 extracts those records.
8. **Verification:** census household check; tune scoring against the test tree.
9. **Docs:** update CLAUDE.md and the README.

## Decisions

1. **Results** appear on an extension search page, with an FS-style sidebar.
2. **Test tree:** Anna Lindeman (the user's great-grandmother) and her Norwegian
   ancestors on FS. All of them are known in both FS and DA, so each person's DA
   records are the expected results. The aim is to attach DA records to the tree
   conveniently. Many duplicate FS records, but DA's often add useful details.
3. **Names:** patronymic naming, farms as addresses (see the name rules).
4. **Record kinds:** probate is left out of the default searches (it stays available
   as "Other"); **emigration** is added and is important for several family members.
5. **Places:** no default region limit. The sidebar lets the user add a county or
   parish to narrow a search, or remove details when there are no matches.
