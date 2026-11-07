# Changelog

One section per version. The release notes on GitHub come from here, so write for
the people who use the extension. The version is in `manifest.json` (MAJOR.MINOR.PATCH:
fixes, new features, changes that break what users have).

## 1.4.0 - 2026-11-07

- The linker checks your SourceBox when it opens, the way FamilySearch's Source
  Linker flags a record you've used before. Until it's done the page says what it's
  doing (reading the record on Digitalarkivet, pairing the people, checking the
  SourceBox) and shows the source and the people when it knows. A
  source already there, in any folder, is shown in green, with a link to its Attached
  To page that tells how many of the people paired here have it; each person's row
  says whether they have it, and those who have it are highlighted in green, as in the
  Source Linker. The check reads FamilySearch in a window of its own behind the
  linker's, not a new tab among yours.
- Reading relatives' families from FamilySearch for a census uses that window too.
- When the source is already in your SourceBox, the button says **Update source and
  attach**: it writes the title, date, web page, citation and notes as reviewed here
  over the source on FamilySearch (fields left empty here are kept), then attaches it.
- A source attached to some of the people before is now finished properly:
  **Update source and attach** uses it and attaches it only to those who don't have
  it yet, leaving the others and their tags as they are. Before, each attach to
  someone who already had the source failed after a long wait.
- A source with the same title is found in any SourceBox folder, not only among the
  newest sources on Home, so a second run makes no copy.

## 1.3.2 - 2026-11-07

- On the linker page, a child's baptism is paired with the right child of the family.
  A boy baptized Johan Peder was paired with his elder sister Marte Johanne, because
  Johan and Johanne count as spellings of one name and she came first. Now the child
  whose first given name the record has comes first, and a child FamilySearch has as
  the other sex isn't paired at all. The search page's record check counts each
  baptized child once, for that same child.

## 1.3.1 - 2026-11-07

- A patronymic the church book abbreviates, such as Johannesdat., Larsdatt. or
  Olsd:r, is read as one. Before, a mother written Astri Johannesdat. counted as
  another woman than FamilySearch's Astri Johansdr, and her child's baptism was marked
  down.
- A name the extension can't read as a patronymic no longer counts against a record:
  it's unknown, not a contradiction.
- Names are compared more like the old spellings go: Kjetil and Kittil, Hjalmar and
  Jalmar, Gjermund and Jermund, Arndt and Arnt are one name, and near spellings such
  as Torbiørn for Torbjørn or Tollev for Tollef are close (≈). A near spelling only
  ever helps a record; it is never a reason against one.

## 1.3.0 - 2026-11-06

- A baptism (or other church-book entry) found in both of a parish's church books, the
  ministerialbok and the klokkerbok, is one hit on the search page, with a link to the
  entry in the other book. Before, each child of such a parish showed twice.
- **Review & Attach** on such a hit reviews both entries together: the linker shows
  them side by side with the differences marked, and makes a source for each book,
  named in the title and citation. Each source's notes give the other book's entry
  and the differences between the two transcriptions. The people are paired once and
  both sources are attached to them; only the ministerialbok's source gets the tags.

## 1.2.1 - 2026-11-06

- A patronymic from a father's name that Digitalarkivet spells in several ways is
  searched under all of them. A mother FamilySearch has as Johansdr is searched as
  Johan*, which finds the Johannesdtr. and Johannsdtr of the church books; before, the
  search found none of her children's baptisms with her surname, and fell back to one
  without it that found other couples' children too. Johansen and Johannessen are
  searched the same way.
- A parent's or spouse's patronymic with other spellings (Pedersdatter and
  Persdatter, Andersen and Andresen, Halvorsen and Halvardsen, ...) is also searched
  in the other spelling, right after the search under FamilySearch's spelling.

## 1.2.0 - 2026-11-06

- The extension checks once a day whether a newer release is out (only a copy loaded
  unpacked, as from a release's zip). A new release shows as an arrow on the toolbar
  icon, a notification, and "v. X.Y.Z is out" in the search and linker pages' headers.
- A new Updates page (click the version in a page's header, or the icon with the arrow):
  the release's notes, and a Download button that saves the package only after checking
  that it's the release's file, signed with the maintainer's key. Then unzip it over
  the extension's folder and click **Reload the extension**; your drafts and persons
  are kept. "Remind me later", "Skip this version", and a setting to turn the check off.
- The check asks GitHub for the latest release and sends nothing about you or your
  records. Chrome asks for two new permissions: GitHub's API and its file host, for
  the check and the download, and alarms, for the daily check.

## 1.1.3 - 2026-11-06

- A census couple who are both heads of the household (1900's husfar and husmor,
  1865's Husfader and Husmoder) are taken as husband and wife, and so as their
  children's parents.
- A birth year that Digitalarkivet worked out from an age (marked with a star) counts
  as one year closer to FamilySearch's year. A star on a place no longer counts as one.
- For developers: tests on saved Digitalarkivet pages, with the names, IDs and links
  changed to made-up ones. The documentation uses made-up names too.

## 1.1.2 - 2026-11-06

- Birth years are scored by how far they are from FamilySearch's: the same year counts
  most, one year off a little, and two or more years off count against the record,
  the more the further. A full birth date on FamilySearch narrows the searches to a
  year either side, and is checked against the record's own date of birth.
- A baptism before FamilySearch's birth date is taken as another child's.
- A relative with a close given name (Astri for Astrid) counts, a little less
  than the same name.
- The toolbar icon only works on Digitalarkivet pages (https, digitalarkivet.no), and
  the extension no longer asks for the "tabs" permission.
- The linker only runs its steps while the tab is still on FamilySearch.
- Lighter, sky-blue icons that show on light and dark toolbars. The tooltip shows the
  version as "v. X.Y.Z".
- Licensed under the GNU GPL, version 3 or later.

## 1.1.1 - 2026-11-06

- Places abroad are no longer matched to Norwegian places without æ, ø and å (Orland,
  California is not Ørland).
- The relatives' checkboxes say "Use this spouse in the searches" again (and "this
  child").
- When Digitalarkivet's English copy of a Bokmål or Nynorsk record can't be read, the
  icon says so.
- Fixes in reading FamilySearch's alternate names and the sex on family cards, and
  translations that were missing.

## 1.1.0 - 2026-11-06

- The search page, the linker and the notifications in Bokmål and Nynorsk, following
  the browser's language, with a menu to change it. The source itself (title,
  citation, notes) stays in English.
- The toolbar icon reads Bokmål and Nynorsk record pages, and FamilySearch's Norwegian
  person pages are read too.
- Place names written without æ, ø and å ("Vaga") find their municipality.
- The version is shown in the toolbar icon's tooltip.

## 1.0.0 - 2026-11-05

The first version: from a FamilySearch person, search Digitalarkivet for their
records, review a record's source and its people, and attach the source to the
people in the tree.
