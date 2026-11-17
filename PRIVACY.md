# Privacy policy

**arkivet2fs** ("DigitalArkivet to FamilySearch") is a browser extension that finds a
FamilySearch person's records in Norway's Digitalarkivet and turns a record you choose
into a FamilySearch source, attached to the tree persons it names. It is free software
(GPL-3.0-or-later) by an independent developer, Dude4Linux. It is not affiliated with
or endorsed by FamilySearch International or the National Archives of Norway
(Arkivverket), which runs Digitalarkivet.

This policy covers the extension as published on the Chrome Web Store, Opera add-ons,
Firefox Add-ons and GitHub. Last changed: 17 November 2026.

## In short

- The extension has no account, no analytics, no advertising and no tracking. The
  developer gets nothing from it unless you send a problem report yourself.
- It works in your browser, on the sites it was made for, as you would by hand. What it
  reads there stays in your browser, except what it puts on FamilySearch when you click
  to do so.
- Nothing is sold or shared with anyone, and nothing is used for any other purpose
  than the ones below.

## The sites it talks to

| Site | What is sent | Why |
|---|---|---|
| `www.digitalarkivet.no` | Search requests (the names, years, places and relatives of the FamilySearch person you search for) and requests for record and source pages | To find and read the records, as Digitalarkivet's own search does |
| `www.familysearch.org` | What FamilySearch's own pages send when the extension fills in and clicks them for you | To read your tree person and SourceBox, and, when you click, to create or update the source, attach it, tag it and add facts |
| `www.dokpro.uio.no` (Rygh's *Norske Gaardnavne*) and `ws.geonorge.no` (Kartverket) | A farm name only | To tell whether a last name is a farm |
| `report.arkivet2fs-relay.workers.dev` (the report relay) | A problem report, only when you click **Send** | See "Problem reports" below |
| `api.github.com`, `release-assets.githubusercontent.com` | A request for the latest release, nothing about you | The update check, only in a copy loaded from GitHub (not a store's), and only after you allow it on the Updates page |

Each site sees your IP address, as with any web page you open. The extension never
reads or keeps your FamilySearch password or session, and doesn't use FamilySearch's
API.

## What it reads on FamilySearch

On FamilySearch the extension reads the person page you start from (names, events,
places and family), your SourceBox (whether a source is there and who it is attached
to), and the pages of the tree persons a record names and of their relatives, to pair
the record's people with them. These pages can name living people. Some of the reading
happens in a window of its own, kept behind the extension's page, which it closes when
done.

Nothing is saved, attached, tagged or changed on FamilySearch before you click
**Create source and attach** (or **Update source…**, **Create source only**) on the
linker page, or **Create person** or **Use this person** in its new-person panel.

## What it keeps in your browser

All of this stays in your browser's storage for the extension; none of it is sent
anywhere:

- **For the browser session only:** search results, the record pages read, the
  records you opened in the linker, and the families read from FamilySearch.
- **Until you remove the extension:** the last 30 FamilySearch persons you searched
  for (name, events and family, with their FamilySearch IDs), so the linker can pair a
  record with them; the last 300 records you attached (the record's Digitalarkivet
  IDs, the FamilySearch source's ID and title, the IDs and names of the people who
  have it, and the facts added), so the search page can mark them; your language
  choice; and the update check's state and settings.

Removing the extension removes all of it.

## Problem reports

The search page and the linker have **Send report**. It opens a panel with the report
to read and edit before anything is sent; nothing leaves your browser before you click
**Send**, and only what the panel holds is sent.

A report holds what the page read, showed and did: the Digitalarkivet record or search,
the tree persons you paired (names and FamilySearch IDs), the extension's version, the
browser and system, the page's language, any error messages, what you wrote under
**What happened?**, and an e-mail address if you choose to give one. The panel asks you
to take out living people first. Firefox asks your permission before the first report
is sent.

The report goes to the report relay, a Cloudflare Worker run by the developer, which
files it as an issue in the developer's private repository on GitHub. Only the
developer can read it there. The relay stores nothing; when GitHub refuses a report,
it logs GitHub's error, not the report. Cloudflare and GitHub see the request's IP
address. The developer uses a report only to
fix the problem it describes, and the e-mail address only to answer it. A report is
kept until the problem is dealt with. To have one deleted, send another report giving
its number ("Sent, as report #N").

**Copy report** only copies the report to your clipboard, for you to paste where you
choose, such as a public GitHub issue.

## Changes and contact

This policy is published at https://dude4linux.github.io/arkivet2fs/privacy.html.
Changes to it are made in the file `PRIVACY.md` in the extension's public repository
(https://github.com/Dude4Linux/arkivet2fs), whose history shows every change.

Questions go to the repository's issues
(https://github.com/Dude4Linux/arkivet2fs/issues), or privately through **Send
report**. Security problems go through GitHub's private reporting, as `SECURITY.md`
says.
