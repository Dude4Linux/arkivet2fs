# arkivet2fs

<img src="icons/banner.png" alt="arkivet2fs: find your Norwegian ancestors in Digitalarkivet and cite them on FamilySearch" width="100%">

A Chrome/Brave extension that connects FamilySearch (FS) with Norway's Digitalarkivet
(DA). It finds a FamilySearch person's records in Digitalarkivet. It also turns a
Digitalarkivet record into a FamilySearch source, with an Evidence Explained–style
citation.

```
FS person page ──(1: "Digital Arkivet" in Search Records)──▶ search page
     ▲                                                          │ 2: searches DA,
     │                                                          │ ranks the hits
     │                                                          ▼
FS SourceBox ◀──(3: toolbar icon)── DA record page (you check the record)
```

## Install

There's no build step.

1. Download or clone this repository.
2. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repository folder.
4. Pin the extension's icon to the toolbar.

You need to be signed in to FamilySearch. Digitalarkivet needs no account.

## Use

### 1. Start from a FamilySearch person

Open a person's details page in the FamilySearch tree. In the **Search Records**
panel, below Google, there's a **Digital Arkivet** entry. Clicking it opens the search
page in a new tab. The page is filled in with the person's names, events, places and
family.

### 2. The search page

The sidebar on the right holds the search criteria, laid out like FamilySearch's
record search. You can edit any of them and click **Search**:

- **Names:** given names and surname, one row per name; FS alternate names are added.
  The names follow the patronymic convention. In "Tollef Johansen Skofteland",
  Johansen is the surname. Skofteland is a farm only when a farm of that name lies
  near the person's places. Otherwise it's a family or place name and is searched as
  the surname.
- **Events:** birth or christening, marriage, residences, death or burial; years are ±2.
- **Farms:** each farm gets its own "Records at <farm>" search.
- **Relatives:** father, mother, spouses and children. Untick a relative to leave them
  out of the searches.
- **Where to search:** add DA counties or municipalities. The municipalities of the
  person's FS places are suggested.
- **Record kinds:** turn a kind of search on or off.

The extension doesn't run one broad search. It runs one search for each life event:

- own baptism (by parent, and by birthplace)
- confirmation
- marriage (one per spouse)
- the children's baptisms
- censuses
- emigration
- moving away
- burial
- all records under the name

Some searches find no hits. Those are tried again with other spellings, such as
the father's patronymic or the FS alternate names. Searches that find more than 100
hits are narrowed to the person's municipalities. Each search is listed with its hit
count and an **Open on DA** link to the same search on Digitalarkivet.

The hits are merged, so each record appears once. They're grouped (Baptism,
Confirmation, Marriage, Children's baptisms, Census, Emigration, Moving, Burial,
Other) and ranked by a score. Each hit shows the reasons for its score:

- ✓ matches the FS person: a name, a year, a place, a farm, a relative
- ≈ close: another spelling, or one of DA's name variants
- ✗ contradicts FS: wrong sex, a year far off, too young for the role

After the searches, the extension opens the records of the best hits. It checks the
people in them against the FS relatives: the parents of a baptized child, the couple of a
marriage, a census household, an emigrant's destination. That separates namesakes:
several men of the same name in one census, for example. Hits scoring below 0 are
dimmed.

### 3. From a DA record to a FamilySearch source

Open a hit, check the record, and click the extension's toolbar icon. The extension
reads the record and opens the FamilySearch SourceBox. It clicks **Create Source** and
fills in:

- **Title:** "<year>, <principal> - <source title> - <record type>", for example "1870,
  Johanne Lindemann household - 0903 Arendal - Census"
- **Citation:** place (general to specific), source, page or entry, date, permanent ID,
  link and scanned image
- **Notes:** the person's own fields and everyone in the record with their roles,
  with codes and Norwegian roles in English

It doesn't matter whose page in the record is open. If you open the father's page on a
baptism, the source still describes the child.

Supported records: baptisms, confirmations, marriages, burials, censuses, emigrant
protocols, moving lists (out- and in-migration) and probate.

## Good to know

- **Digitalarkivet limits requests.** The searches are spaced a second apart and
  cached for the session. If DA starts refusing requests, the page says so and stops.
  Wait a while before searching again.
- **Transcriptions vary.** Names are spelled many ways (Jon, Joen, John; Siri, Sirj,
  Siry), and parents are sometimes transcribed wrongly. So a ✗ on one relative lowers
  a score only a little. Always check the record, and the scanned image when there is
  one, before you attach it.
- **Data stays between the sites.** The extension sends requests only to
  digitalarkivet.no and familysearch.org. To check farm names, it also queries Rygh's
  *Norske Gaardnavne* (dokpro.uio.no) and Kartverket's place names (ws.geonorge.no).
  Nothing is stored beyond the browser session.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration (Manifest V3) |
| `fs_person.js` | The "Digital Arkivet" entry on FS person pages |
| `background.js` | Toolbar icon, opening the search page and the SourceBox |
| `farms.js` | Farm or family name? (Rygh, Kartverket) |
| `search.html`, `search.js`, `search.css` | The search page |
| `da_places.js` | DA's counties and municipalities, old place names |
| `da_search.js` | The DA searches |
| `da_match.js` | Merging, scoring and grouping the hits |
| `da_record.js` | Reading a DA record: citation, title, notes, people |
| `da_verify.js` | Checking hits' records against the FS relatives |
| `content.js` | Filling in the FamilySearch Create Source form |
| `icons/` | The extension's icons (`icon*.svg` are the sources of the PNGs) and the README banner (`banner.html` → `banner.png`) |
| `citation.md` | The citation format |
| `plan.md` | Design notes and milestones for the FS → DA search |

Developer notes are in `CLAUDE.md`. After changing the code, reload the extension on
`chrome://extensions`.
