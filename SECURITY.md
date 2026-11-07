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
- Anything saved, attached or tagged on FamilySearch without your click on
  **Create source and attach** or **Create source only** on the linker page.
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
  key built into the extension (`releases.js`, the same as `keys/release.pub`).
- It never reads or keeps your FamilySearch session or password, and doesn't use
  FamilySearch's API. It works in FamilySearch's own pages, in your browser, as you
  would.
- Search results are kept for the browser session only. The last 30 FamilySearch
  persons you searched for (name, events and family) stay in the browser's extension
  storage, so the linker can pair a record with them. Removing the extension removes
  them.

## Supported versions

Fixes go into the latest release only.
