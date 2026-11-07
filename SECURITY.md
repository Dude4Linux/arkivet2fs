# Security

## Reporting a problem

Please report security problems privately, not in a public issue. Use GitHub's private
reporting: the repository's **Security** tab, then **Report a vulnerability**. Give the
extension's version (hover over its toolbar icon), the browser, and the steps or page
that show the problem. I aim to answer within a week.

Examples of what to report this way:

- A web page (on Digitalarkivet, FamilySearch or elsewhere) that can make the extension
  run its code, read the extension's storage, or open its pages with chosen content.
- The extension sending data to any host other than those listed below, or sending
  more than it needs to.
- The Updates page saving a package that isn't the maintainer's signed one.
- Anything saved, attached or tagged on FamilySearch without your click on the
  linker page: **Create source and attach** or **Create source only** (**Update
  source…** or **Create or update sources…** when your SourceBox has the source), or
  **Create person** in the new-person panel. **Find on FamilySearch** only fills in
  FamilySearch's Add Person form; it saves nothing.
- A source in your SourceBox written over, or attached, when it is of another record
  than the one on the linker page (two records can share a title).
- Personal data in this repository: a living person, or a real family's names in the
  test fixtures or the history. The fixtures are meant to hold only made-up names.

Wrong search results, a bad score or a misread record are ordinary bugs: open an
issue for those.

## What the extension does with your data

- It talks only to `digitalarkivet.no` and `familysearch.org`, and, to check farm
  names, to `dokpro.uio.no` (Rygh's *Norske Gaardnavne*) and `ws.geonorge.no`
  (Kartverket). These are the manifest's host permissions, with GitHub's
  `api.github.com` and `release-assets.githubusercontent.com` for the update check.
- The update check (only in a copy loaded unpacked) asks GitHub once a day for the
  latest release, unauthenticated: GitHub sees your IP address, nothing else. A
  download from the Updates page is saved only when its signature verifies against the
  key built into the extension (`releases.js`, the same as `keys/release.pub`) and its
  manifest has the release's version.
- It never reads or keeps your FamilySearch session or password, and doesn't use
  FamilySearch's API. It works in FamilySearch's own pages, in your browser, as you
  would.
- To show what FamilySearch already has, the linker reads FamilySearch pages in a
  window of its own, kept behind the linker's: your SourceBox (is the source there,
  and who is it attached to), the tree persons it pairs (their facts), and their
  relatives' pages (to pair the others in the record). It only reads there, and closes
  the window when done.
- Search results, the records read, and the relatives' families the linker read are
  kept for the browser session only. The last 30 FamilySearch persons you searched for
  (name, events and family) stay in the browser's extension storage, so the linker can
  pair a record with them. Removing the extension removes them.

## Supported versions

Fixes go into the latest release only.
