# What the stores ask for

## Single purpose (Chrome Web Store)

```
Make FamilySearch sources from records in Norway's Digitalarkivet: find a FamilySearch person's records in Digitalarkivet, and turn a record the user chooses into a cited source attached to the tree persons it names.
```

## Permissions

One line each, for the Chrome Web Store's "Permission justification" fields; Opera's
and AMO's reviewers can be given the same.

| Permission | Reason |
|---|---|
| `activeTab` | When the user clicks the toolbar icon on a Digitalarkivet record page, the extension reads that record from the open tab. |
| `scripting` | Runs the extension's own packaged scripts in a Digitalarkivet tab (to read the record the user opened) and in FamilySearch tabs (the search entry on person pages after an install or update; reading the tree and SourceBox; and, when the user clicks "Create source and attach", filling in and clicking FamilySearch's own forms). |
| `storage` | Keeps the record the user opened for review (for the session), the last 30 FamilySearch persons searched for and the last 300 records attached (so the pages can pair and mark them), the language choice and the update-check settings. All of it stays in the browser. |
| `alarms` | Schedules the daily update check of a copy installed from GitHub (loaded unpacked). A store install never creates the alarm. |
| `notifications` | Tells the user why the toolbar icon did nothing (not a Digitalarkivet record page, the record could not be read), and in a copy installed from GitHub, that a new release is out. |

**Host permissions** (Chrome asks for one justification for all of them):

```
www.digitalarkivet.no: to search the archive and read the record pages the user opens. www.familysearch.org: to show the search entry on tree person pages, read the person, the family and the SourceBox, and, only when the user clicks, create the source and attach it. www.dokpro.uio.no (Rygh's Norske Gaardnavne) and ws.geonorge.no (Kartverket's place names): to look up whether a last name is a farm; only the name is sent.
```

**Optional host permissions** (`api.github.com`, `release-assets.githubusercontent.com`,
if a reviewer asks): asked for only on the Updates page of a copy installed from GitHub
(loaded unpacked), when the user clicks "Allow the check". In a store install the
Updates page says the store updates the extension and never asks for them.

## Remote code (Chrome Web Store)

**No, I am not using remote code.** If the form asks for detail:

```
All of the extension's code is in the package; it loads no script from anywhere else and evaluates no strings as code. It fetches data only: Digitalarkivet's search and record pages (parsed with DOMParser), and the farm-name services' answers. In a copy installed from GitHub, the Updates page can download a newer signed release zip for the user to install by hand; the extension never runs it, and a store install never offers it.
```

## Data use (Chrome Web Store's Privacy practices tab)

What the extension handles (tick these):

- **Personally identifiable information:** yes. Names and FamilySearch IDs of the tree
  persons the user works on (read from the user's own FamilySearch pages), and in a
  problem report the user sends, an e-mail address if they choose to give one.
- **Website content:** yes. The text of Digitalarkivet records and of the FamilySearch
  pages it reads.
- Health, financial and payment, authentication, personal communications, location,
  web history, user activity: **no**.

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use
  cases.
- I do not use or transfer user data for purposes that are unrelated to my item's
  single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending
  purposes.

## Data collection (Firefox AMO)

Declared in the manifest (`browser_specific_settings.gecko.data_collection_permissions`),
so AMO reads it from the package:

- Required, **website content** (`websiteContent`): the Digitalarkivet records and
  FamilySearch pages it reads; what goes to FamilySearch goes there at the user's click.
- Optional, **technical and interaction data** (`technicalAndInteraction`) and
  **personally identifying information** (`personallyIdentifyingInfo`): a problem
  report, asked for when the user clicks Send (the second only with an e-mail address).

AMO's other questions:

- **Does the add-on use minified, concatenated or machine-generated code?** No. The
  package is the source files as they are in the repository (`tools/build.mjs` only
  zips them), so no source code upload is needed.
- **Firefox for Android:** not supported; leave it unticked.

## Notes for the reviewers

Paste into the Chrome Web Store's and Opera's "notes for the reviewer" and AMO's
"Notes to Reviewer":

```
The extension works with two sites: Digitalarkivet (www.digitalarkivet.no, free, no account) and FamilySearch (www.familysearch.org, needs a free account).

Without a FamilySearch account: on Digitalarkivet, search for a person (Search > Persons, any name such as "Ole Olsen"), open a hit's record page, and click the extension's toolbar icon. The review page (linker.html) opens with the record's source: title, citation and notes. Pairing and attaching need FamilySearch; "Create source and attach" then asks you to sign in.

With a FamilySearch account: open any person's details page in the Family Tree (www.familysearch.org/en/tree/person/details/<ID>). In the Search Records panel, below Google, is a "Digital Arkivet" entry; it opens the search page (search.html), which searches Digitalarkivet for the person's records. A hit's "Review & Attach" opens the review page. Nothing is saved on FamilySearch until you click "Create source and attach" (or "Create source only"); the Family Tree is shared by all its users, so please don't attach test sources to real persons.

The extension doesn't use FamilySearch's API or session: it fills in and clicks FamilySearch's own pages in a tab, as the user would. "Send report" posts a problem report the user has read and edited to the developer's relay (report.arkivet2fs-relay.workers.dev), only when the user clicks Send. The update check (alarms, optional GitHub hosts) runs only in a copy loaded unpacked from GitHub, never in a store install.

Source code and docs: https://github.com/Dude4Linux/arkivet2fs
```

## Screenshots

`screenshots/`, 1280×800, in the order to upload them:

1. `1-search.png`: the search page, the baptism hits ranked with their reasons.
2. `2-source.png`: the linker's source, ready to edit (title, citation, notes).
3. `3-people.png`: the child paired with the tree person, the facts side by side, the
   christening ticked to add.
4. `4-changes.png`: the mother (≈ a close name), the changes to the tree, the buttons.

Made-up persons only: the test fixtures' sanitized Digitalarkivet pages and `TEST-`
persons, never a real tree or a real FamilySearch page (so no shot of the "Digital
Arkivet" entry on FamilySearch's person page). `sh store/screenshots/make.sh` makes them
again (after `npm install`; Node and Chrome) when the pages change; `render.js` sets up
each page in the tests' harness.
