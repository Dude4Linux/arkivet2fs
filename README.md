# arkivet2fs

<img src="icons/banner.png" alt="arkivet2fs: find your Norwegian ancestors in Digitalarkivet and cite them on FamilySearch" width="100%">

A Chrome/Brave extension that connects FamilySearch (FS) with Norway's Digitalarkivet
(DA). It finds a FamilySearch person's records in Digitalarkivet. It also turns a
Digitalarkivet record into a FamilySearch source, with an Evidence Explained–style
citation, and attaches it to the tree persons the record names.

```
FS person page ──(1: "Digital Arkivet" in Search Records)──▶ search page
     ▲                                                          │ 2: searches DA,
     │                                                          │ ranks the hits
     │                                                          ▼
FS source, attached ◀── linker (3: you review) ◀── "Review & Attach" on a hit,
  to the tree persons                                or the toolbar icon on a DA record
```

## Install

There's no build step: the extension is its source files.

1. Download `arkivet2fs-X.Y.Z-chromium.zip` from the latest release:
   https://github.com/Dude4Linux/arkivet2fs/releases/latest (or clone the repository,
   or **Code** → **Download ZIP**, for the newest code).
2. Unzip it where it can stay, for instance in your home folder. It unpacks to a folder
   named `arkivet2fs`.
3. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
4. Click **Load unpacked** and choose the `arkivet2fs` folder.
5. Pin the extension's icon to the toolbar.

You need to be signed in to FamilySearch. Digitalarkivet needs no account.

**To update**, unzip the new release over the same folder, replacing its files, and
click the reload button on the extension's card in `chrome://extensions`. Chrome keeps
an unpacked extension's stored persons and drafts by its folder, so keep the folder
where it is.

**To check a download** (optional): each package is signed with the maintainer's key,
`keys/release.pub` in the repository, whose SHA-256 fingerprint is

    7642e107e134dfb53e43e4932b32a23301b88b8d28a32b10abe367d16d36bc54

You need OpenSSL 3 (`openssl version`), and curl or GitHub's `gh`. In a clone of the
repository, one command downloads a release into a temporary folder, checks it and
removes the folder again:

    cd arkivet2fs        # your clone
    sh tools/release vX.Y.Z --keep ~/Downloads/arkivet2fs-X.Y.Z

Without a version it checks the clone's own (in `manifest.json`). `--keep` (optional)
copies the checked package to that folder, ready to unzip. The script prints the key's
fingerprint, which must be the one above, then lines starting with `OK:` and `All good`.
With `gh` signed in it also checks GitHub's record of where the package was built (its
attestation). A line starting with `BAD:` means the file isn't the one that was signed:
don't install it. (For the maintainer, the same script also signs, tests and publishes a
draft release.)

To check a package you downloaded yourself, put it in one folder with its `.sig`,
`SHA256SUMS` and `SHA256SUMS.sig` (all from the release's **Assets**) and run
`sh ~/path/to/the/clone/tools/verify.sh arkivet2fs-X.Y.Z-chromium.zip` there. Both
scripts take the key from their clone (`keys/release.pub`); a copy elsewhere needs the
key's path (`verify.sh`: after the package; `release`: `--key`).

## Use

### 1. Start from a FamilySearch person

Open a person's details page in the FamilySearch tree. In the **Search Records**
panel, below Google, there's a **Digital Arkivet** entry. Clicking it opens the search
page in a new tab. The page is filled in with the person's names, events, places and
family.

### 2. The search page

The sidebar on the right holds the search criteria, laid out like FamilySearch's
record search. You can edit any of them and click **Search**:

- **Names:** given names and surname, one row per name; FS alternate names are added,
  without nicknames such as "Big" or "Little" (two brothers Lars).
  The names follow the patronymic convention. In "Tollef Johansen Rysstad",
  Johansen is the surname. Rysstad is a farm only when a farm of that name lies
  near the person's places. Otherwise it's a family or place name and is searched as
  the surname.
- **Events:** birth or christening, marriage, residences, emigration or immigration,
  death or burial; years are ±2. A full birth date (a gravestone's "16 July 1846",
  from Find a Grave, say) is searched ±1 and kept in the **Date** field, for
  scoring. With an emigration or immigration year, the searches
  stop two years after it (the latest, when FS has several), and the ones that can
  only find later records, such as a marriage in America, are skipped. The first
  event FS has outside Norway (a residence, marriage or death in America) counts the
  same way, under **First place abroad**: the searches stop two years after it, or
  after the emigration if that's earlier. Clear its year to search later years too.
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

A birth year scores by how far it is from FS's: the same year +2, one year off +1, two
or three years off -2, up to nine -4, and ten or more -6 (another generation). With
FS's full birth date, a baptism before the birth is another child, and a baptism
within half a year after it counts as the same year.

After the searches, the extension opens the records of the best hits. It checks the
people in them against the FS relatives: the parents of a baptized child, the couple of a
marriage, a census household, an emigrant's destination. A relative with a close given
name (Astri for Astrid) is ≈ +2; another given name (Anne for Astrid) is -3. A
baptism's date of birth is checked against FS's full birth date: the same day +3,
another day -2. That separates namesakes:
several men of the same name in one census, for example. Hits scoring below 0 are
dimmed.

### 3. From a DA record to a FamilySearch source

Click **Review & Attach** on a hit, or open a DA record and click the extension's
toolbar icon. The linker page opens with the source, ready to review. Nothing is saved
on FamilySearch until you click **Create source and attach**.

The source's fields can be edited:

- **Title:** "<year>, <principal> - <source title> - <record type>", for example "1865,
  Halvor Larsen household, Bakken nedre, Nordlien - Vågå - Census" (a census names the
  residence and census district when DA gives them; the notes have both lines too)
- **Date** and **Web page** (the record's permanent link)
- **Citation:** place (general to specific), source, page or entry, date, permanent ID,
  link and scanned image
- **Notes:** the person's own fields and everyone in the record with their roles,
  with codes and Norwegian roles in English

It doesn't matter whose page in the record is open. If you open the father's page on a
baptism, the source still describes the child.

Below the source, each person in the record has a row:

- **Name.** You can edit it, and the new name goes into the title, citation and
  notes. A child baptized by given name only ("Ole, son of Lars Halvorsen") gets
  suggestions: the father's patronymic (Ole Olsen), or the name of the tree person
  you pair the child with. Click one to use it.
- **Tree person.** Choose who in the tree the record is about: the FS person, or
  their father, mother, spouses or children, or another person by FS ID. The linker
  suggests pairs: the FS person for the hit, and relatives whose given names match,
  with children also matched by birth year. A relative with another name in the
  record is mentioned, not chosen, so a second wife or a namesake isn't attached by
  mistake.
- **Tags** (Name, Sex, Birth, Christening, Death, Burial, Residence) and the
  **reason** for attaching. Both are filled in by role; for example, a baptized child
  gets Name, Sex, Birth and Christening.

In a census, everyone at the residence gets a row, by household: the old parents,
a married son's family, a brother's family lodging there. The linker pairs them
through the tree, starting from the FS person: their relatives first, wherever they
live at the residence, then each paired relative's own family. To do that it opens
those relatives' FamilySearch pages in a background tab, reads their families (it
only reads), and closes the tab; a line above the rows says how many it paired. For
example, from Halvor Larsen in 1865, it pairs his wife and children, his parents in
household 02, and through his father, his brother Iver's family in household 03.

The census's own family positions count too: "hans Kone", "deres Søn", or "hans
Fader" heading the next household. A resident the census places in another relation
than the tree isn't paired. Households the census doesn't link to the record's own,
and with nobody in the tree, are hidden, such as the lodgers' and servants' families
on an 1801 farm. A link under the rows shows them. If you opened a namesake in another
household, the linker switches to the household where the FS person fits, and says
so above the rows.

The family comes from the FS person you started the search from. From the toolbar
icon, the linker uses the last person you searched for when their name is in the
record. Otherwise, type the FS ID at the top.

**Create source and attach** opens a FamilySearch tab and works in it step by step.
The page lists each step as it goes:

1. It creates the source in your SourceBox. If a source with the same title is
   already there, it uses that one instead.
2. It attaches the source to each chosen person by ID, with your reason.
3. It adds the ticked tags. Tags already there are kept. A residence is tagged only
   when the person has exactly one.

**Create source only** puts the source in your SourceBox without attaching it.

Supported records: baptisms, confirmations, marriages, burials, censuses, emigrant
protocols, moving lists (out- and in-migration) and probate.

## Language

The search page, the linker and the notifications are in English, Norwegian Bokmål
or Nynorsk, as DA is. The first time, the extension uses your browser's language
(Nynorsk for nn, Bokmål for nb or no, otherwise English). To change it, use the menu
at the top of the search page or the linker. Both pages, and the notifications, then
use that language.

- **The source stays in English.** The title, citation and notes that go to
  FamilySearch are in English, for every language, because the FS tree is shared
  worldwide. The reason for attaching follows your language.
- **DA pages in any language work.** The toolbar icon also works on Bokmål and
  Nynorsk record pages. The extension reads DA's English version of the same page.
  Links to DA open in your language.
- **FS in Norwegian works too.** The "Digital Arkivet" entry also reads FS person
  pages shown in Norwegian.

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
  Search results are kept only for the browser session. The extension also keeps the
  last 30 FS persons you searched for (name, events and family), so the linker can
  pair a record with them. They stay in the browser's extension storage.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration (Manifest V3) |
| `_locales/` | The extension's name and description in English and Norwegian |
| `i18n.js`, `i18n_strings.js` | The languages: choosing one, and the Bokmål and Nynorsk texts |
| `fs_person.js` | The "Digital Arkivet" entry on FS person pages |
| `background.js` | Toolbar icon, opening the search page and the linker, keeping the FS persons |
| `farms.js` | Farm or family name? (Rygh, Kartverket) |
| `search.html`, `search.js`, `search.css` | The search page |
| `da_places.js` | DA's counties and municipalities, old place names |
| `da_search.js` | The DA searches |
| `da_match.js` | Merging, scoring and grouping the hits |
| `da_record.js` | Reading a DA record: citation, title, notes, people |
| `da_verify.js` | Checking hits' records against the FS relatives |
| `linker.html`, `linker.js`, `linker.css` | The linker: reviewing the source and pairing the record's people with tree persons |
| `fs_attach.js` | The linker's steps on FamilySearch: create the source, attach it, add tags |
| `icons/` | The extension's icons (`icon*.svg` are the sources of the PNGs) and the README banner (`banner.html` → `banner.png`) |
| `citation.md` | The citation format |
| `plan.md` | Design notes and milestones for the FS → DA search |
| `release-plan.md` | The plan for packages, signed releases and other browsers |
| `tests/` | The tests (`npm test`), on sanitized Digitalarkivet pages; see `tests/README.md` |
| `.github/workflows/ci.yml` | Runs the tests and a build on GitHub for every push and pull request |
| `.github/workflows/release.yml` | Drafts a release, with the package, for each version tag |
| `tools/` | Building the package (`build.mjs`), signing a release (`sign.mjs`), checking a download (`verify.sh`); `release` signs, tests and publishes a draft release, or checks a published one |
| `keys/release.pub` | The public key the releases are signed with |
| `CHANGELOG.md` | What changed in each version |
| `SECURITY.md` | How to report a security problem, and what the extension does with your data |
| `LICENSE` | The GNU General Public License, version 3 |

The version is shown when you hover over the extension's toolbar icon, and on its
card in `chrome://extensions`. It counts up as MAJOR.MINOR.PATCH: fixes raise the
last number, new features the middle one.

Developer notes are in `CLAUDE.md`. After changing the code, reload the extension on
`chrome://extensions`.

## Problems and contributing

Report bugs and ideas in the [issues](https://github.com/Dude4Linux/arkivet2fs/issues):
the DA record or search (its address or permanent ID), what you expected, and what
the extension did. A record's address is enough; please don't paste FamilySearch pages
or living people's details. Security problems go privately, as `SECURITY.md` says.

Pull requests are welcome. Before you open one:

- **Run the tests:** `npm install` once, then `npm test` (Node 22.13 or later; about
  2 seconds, offline). GitHub runs them again on the pull request.
- **Add a test** for each bug you fix, in the `tests/` file of the extension file you
  changed. Write the expectation from how it should behave, not from what the code
  gives.
- **Real cases, made-up names.** A new Digitalarkivet page for the tests is saved with
  `tests/capture.js` and sanitized with `tests/sanitize.js` (historical records only).
  The sanitized page in `tests/fixtures/da/` has made-up names, IDs and links, and only
  that goes in the pull request; `tests/private/`, with the real page, stays with you.
  Or just give the record's address in the pull request, and the page is added for
  you. Never add FamilySearch pages: they hold living people and other users' work.
  `tests/README.md` says how.
- **Keep the extension dependency-free.** It has no build step (the release package
  is the source files, zipped by `tools/build.mjs`); `package.json` is for the tests
  only. A new file of the extension needs a line in `tools/build.mjs`'s lists, or the
  build stops.
- **Say what changed for users** in a line under a new version's heading in
  `CHANGELOG.md`; the version number is the maintainer's to set.

## License

Copyright © 2025–2026 Dude4Linux

arkivet2fs is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
PURPOSE. See the GNU General Public License in [`LICENSE`](LICENSE) for details.

In short: you may use, study, share and change it, also commercially, but a changed
version you distribute must be under the GPL too, with its source and this notice.
