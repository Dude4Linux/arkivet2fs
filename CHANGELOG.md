# Changelog

One section per version. The release notes on GitHub come from here, so write for
the people who use the extension. The version is in `manifest.json` (MAJOR.MINOR.PATCH:
fixes, new features, changes that break what users have).

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
