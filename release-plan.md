# Release plan: GitHub, signed packages, update checker, more browsers

Status: **Phases 0–3 done**; v1.4.0 is the latest signed release. The next four
steps (Phases 4–8, decided 7–9 November 2026) take the extension from one Chromium
folder loaded unpacked to store listings in four browsers, and then to testers:

1. **1.4.1**: clean up and refine the Chrome version (name matching, the host
   permissions).
2. **1.5.0**: adding the record's facts to FamilySearch from the linker (alternate
   names, events, a differing date or place), with the user's approval of each.
3. **1.6.0**: one package for Chromium and Firefox; tested in Firefox, LibreWolf and
   Opera.
4. **Store listings**: Chrome Web Store, Edge Add-ons, Opera add-ons, Firefox AMO, all
   from the same zip.
5. **A call for testers** on a Norwegian genealogy Facebook group, with the store
   links; perhaps a RootsTech 2027 presentation later.

No outreach before step 5. Safari is dropped (decision 8). Each phase ends with a
test and a tagged release (or a test tag), so the next phase starts from something
that works.

## Where we are (1.4.0)

- One Chromium MV3 extension at the repo root: Chrome and Brave load the folder
  unpacked, from a signed zip on GitHub's releases or a clone. There's no build step
  for the extension; `tools/build.mjs` zips a git ref. The tests are in the repo
  (`tests/`, `npm test`: 187 tests, jsdom, offline, about 2 s; a dev-only
  `package.json`).
- The repo is public on GitHub, `Dude4Linux/arkivet2fs`; git-server is a read-only
  pull mirror of it.
- Unpacked copies check GitHub once a day and offer a signed download (update.html).
- APIs used: `action`, `alarms`, `scripting`, `storage.local/session`, `tabs`,
  `windows`, `notifications`, `management.getSelf`, `runtime`, `i18n`. The service
  worker loads its helpers with `importScripts()`.

## To do

The open items are the phases below, starting with Phase 4 (1.4.1).

## What an extension can and can't do about updates

This shapes the whole plan:

- **An extension can't replace its own files.** No browser lets an installed extension
  rewrite itself. Either the browser updates it (from a store, or from a self-hosted
  update URL where the browser allows that), or the user replaces the files.
- **Chrome and Brave on Windows and macOS block installing a `.crx` from outside the
  Chrome Web Store** unless an enterprise policy allows it. Off-store users therefore
  load the extension unpacked from a zip. Chrome never updates an unpacked install by
  itself, and that's the gap our update checker fills.
- **Firefox** requires every extension to be signed by Mozilla (AMO). A self-distributed
  ("unlisted") extension can name its own `update_url`, and Firefox then updates it by
  itself; we use AMO's listed channel instead (Phase 7), which updates it the same way.
- **Stores do the updating for their users.** Our checker should stay quiet in a store
  install and only run in an unpacked or self-hosted install.
  `chrome.management.getSelf()` gives `installType` (`development` for unpacked) without
  the `management` permission.

So the checker's job is to **tell the user that a release is out, show what changed,
download the right package, check its signature, and say how to install it.**

## Repository layout

The code stays where it is. The root remains a loadable Chromium extension, so "Load
unpacked → the repo folder" and the CLAUDE.md workflow don't change. Chrome, Brave,
Edge and Opera use it as it is, and from 1.6.0 Firefox and LibreWolf do too: one
manifest carries the keys each browser needs and the others ignore (Phase 6), so there
is no per-browser folder (the `platform/` planned at first isn't needed):

```
/                         the Chromium extension, as today (manifest.json is the base)
tools/
  build.mjs               zips the shipped files of a git ref, the same bytes each time
  sign.mjs                SHA256SUMS + signatures (see "Signatures")
  verify.sh               lets a user check a download by hand (openssl)
  release                 the maintainer's steps: sign, test, publish (or check a release)
tests/                    the jsdom unit tests, rebuilt and kept in the repo
keys/release.pub          the public signing key (also pinned in the extension)
.github/workflows/
  ci.yml                  on push and pull request: syntax, fixture IDs, tests, build
  release.yml             on a v* tag: build, sign, draft a GitHub release
CHANGELOG.md              one section per version; the release notes come from here
package.json              dev-only tools (jsdom, web-ext); nothing ships from npm
```

- **The version stays in one place.** `manifest.json` is still the only place it's kept.
- **`package.json` is new.** It's for development tools only. The shipped extension
  stays free of dependencies and has no build-time code changes, so the source in a
  release is the source that runs.

## Release assets (each version)

| File | For |
|---|---|
| `arkivet2fs-X.Y.Z-chromium.zip` | every browser: unpacked in Chromium browsers, and the upload to all four stores (the name stays, since copies from 1.2.0 on look for it) |
| `*.sig` next to each package | a detached signature of that file |
| `SHA256SUMS`, `SHA256SUMS.sig` | checksums of everything, signed |

GitHub adds the source archive. A release can only be made from a `vX.Y.Z` tag, and the
workflow checks that the tag matches manifest.json's version.

## Signatures

Each package gets our own detached signature, on top of whatever the browser does
itself (the stores sign their own copies).

- **Recommended scheme: Ed25519, as a raw detached signature (`.sig`, base64).** It's
  made with `openssl pkeyutl -sign -rawin`. A user can check it with `openssl` (verify.sh),
  and the extension can check it with WebCrypto, which supports Ed25519 in current Chrome
  and Firefox. The extension pins the public key, so a download that doesn't
  verify is refused.
- **Alternative: GPG `.asc` signatures.** Linux users know them, but the extension can't
  check them without bundling an OpenPGP library. They could be added next to the `.sig`
  files.
- **Where the private key lives (a decision).** One option is a GitHub Actions secret in
  a protected `release` environment that waits for your approval before each release.
  The other is to sign locally with `tools/sign.mjs` and upload the signatures, which
  keeps the key off GitHub.
- **GitHub's extras.** Build-provenance attestations (`actions/attest-build-provenance`)
  and immutable releases are free on a public repo and make published assets
  tamper-evident. I'll confirm the details when setting up the repo.

## Phases

### Phase 0: Get ready to go public

GitHub releases can only be read without a login if the repo is public, and the update
checker reads them without one. Before publishing:

- **Audit the history:** gitleaks for secrets. Check docs, test fixtures and saved pages
  for living people's personal data; the examples are
  historical, and the family names in docs, comments and fixtures are made up; the older
  commits still hold the real ones (see the history rewrite below). Note that the commit emails (the personal address)
  will be public; they can be rewritten to the GitHub noreply address before the first
  push, which is the only time that's easy.
- **Decide the open questions below.**
- **Done when:** the audit is clean and the decisions are made.
- **Done** (November 2026): gitleaks found no secrets; the audit found the real names,
  real DA IDs, 4 FS PIDs and other details in the older commits, all rewritten out
  in Phase 1; the decisions are below.

### Phase 1: Move to GitHub

Done.

- **Done: rewrite the commit emails** to the GitHub noreply address (decided) with
  `git filter-repo --mailmap`, on a fresh clone, before the first push. Every commit hash
  and the five tags change; the tags are recreated, annotated, on the rewritten commits.
  git-server is then force-updated to the rewritten history, once.
- **Done: rewrite the real names out of the history,** in the same pass: the older commits
  hold the real family names and the real DA pages they came from (the fixtures before
  sanitizing, and examples in docs and comments). `git filter-repo --replace-text` with
  a list made from `tests/private/names.json` and `map.json` (the real names, IDs and
  farms, each → its made-up one), and `--invert-paths` for any real page that was ever
  committed; then grep the rewritten history (`git log -p --all`) for every `mustGo`
  word and real permanent ID. The list stays private (`tests/private/`).
- **Done: create the repo** `Dude4Linux/arkivet2fs`, public, GPL-3.0 (decided). Push master and
  all five tags.
- **Done: git-server is a read-only mirror of GitHub** (decided): a Forgejo pull mirror,
  `Personal/arkivet2fs` (the organization Personal keeps it apart from rvwifi), so nothing
  is pushed there by hand any more. GitHub is the main repo, the remote `origin`; the
  mirror is `forgejo`. The old copy, `rvwifi/arkivet2fs`, was deleted (November 2026).
- **Done: settings:** protect master and `v*` tags; Actions limited to read-only tokens except
  in release.yml; issues on; private vulnerability reporting on (SECURITY.md points to it).
- **Done: SECURITY.md** says how to report problems privately and what the extension
  does with the user's data.
- **Done: the tests (ahead of the move):** `tests/`, one file per file of the extension,
  on 15 sanitized DA pages in `tests/fixtures/da/` (historical records, with made-up
  names, IDs and links; `tests/sanitize.js`) and synthetic FS persons; `tests/README.md` says how. They go to GitHub with the code; the audit checks
  the fixtures too. No FamilySearch page is ever saved there.
- **Done: ci.yml:** on each push to master and pull request, `npm ci`, `node --check` on
  every script, a check that the fixtures hold no real DA permanent ID, and the tests;
  actions pinned to commit SHAs, a read-only token.
- **Done: docs:** README and CLAUDE.md give the new home and how to contribute; the
  layout above comes with Phase 2's tools.
- **Test:** CI passes on GitHub; the mirror on git-server follows a test push.
- **Version:** none (docs and tooling only).

### Phase 2: Chromium packages and signed releases

- **Done: tooling:** `tools/build.mjs` (chromium target), `tools/sign.mjs`, `tools/verify.sh`,
  `tools/release` (the maintainer's three steps: sign, test, publish), `CHANGELOG.md`, and `release.yml` (tests in `tests/tools.test.js`; CI builds the
  package on every push). A tag builds, attests and drafts the release; `sign.mjs`
  signs it locally (decision 5), and you publish the draft.
- **How it turned out:**
  - The zip is reproducible: the committed files of the tag (never the working tree),
    stored uncompressed in name order with the commit's time. `sign.mjs` rebuilds the
    tag locally and signs CI's zip only when the two are byte for byte the same, so a
    signature vouches for both the source and the build.
  - The zip unpacks to a folder `arkivet2fs/`. Chrome keeps an unpacked extension's
    data by its folder, so an update is unzipped over the same folder. A store upload
    (3b) wants the manifest at the zip's root and gets its own zip then.
  - Every file in the tree is either shipped or excluded by a rule; a new file with
    neither stops the build, as does a shipped file nothing refers to (the SVG sources
    of the icons are left out that way) or a reference to one that isn't shipped.
  - The private key is encrypted, in `~/.config/arkivet2fs/release-key.pem`, made by
    `node tools/sign.mjs --new-key`; the public key is `keys/release.pub`, its
    fingerprint in the README.
  - release.yml can also be run by hand for an existing tag, e.g. v1.1.3, made before
    the workflow.
- **Done: the key pair, and the first release drafted:** v1.1.3, signed with
  `sign.mjs`, and `tools/release v1.1.3` accepts it (signature, SHA256SUMS,
  attestation).
- **Done: v1.1.3 published** (7 November 2026) with `cd ~/DevOps/arkivet2fs` and
  `sh tools/release v1.1.3` (or with no version: the manifest's): loaded in Chrome and
  Brave, then published; the public files check out with curl alone too. Immutable
  releases are on, so its files can't change.
- **Done: exclude from the zip:** what users don't need (docs for developers, tests, tools,
  platform/, keys/, `banner.*`, the icons' SVG sources but `icon32.svg`).
- **Test:** a throwaway tag on a fork, or a draft release that's deleted afterwards, to
  check the zip loads in Chrome and Brave, and that `verify.sh` accepts the signature
  and rejects a tampered byte.
- **Version:** none for the tooling (the shipped files don't change). The first release
  from GitHub is v1.1.3, drafted by hand from its tag (1.1.3 shipped the two scoring
  fixes the tests found), or the next version if there's a change to ship first.

### Phase 3: The update checker (Chromium)

- **When it checks:** once a day (`chrome.alarms`, a new permission), and whenever the
  service worker starts after a day or more without a check. It only runs when
  `installType` is `development` (unpacked); in a store install it does nothing.
- **What it reads:** `https://api.github.com/repos/Dude4Linux/arkivet2fs/releases/latest`,
  unauthenticated, ignoring pre-releases and drafts. It compares the release with
  manifest.json's version as MAJOR.MINOR.PATCH.
- **When there's a newer release:** a badge on the toolbar icon, and a line on the
  search and linker pages. One notification per version, not every day.
- **The new Updates page (`update.html`):** the release notes; the package for this
  browser; a Download button that fetches the zip and its `.sig`, checks the signature
  against the pinned key and the size against the release, and only then saves the file;
  and how to install it (unzip over the old folder, then reload the extension, with the
  stored drafts and persons kept). A "Remind me later" or "Skip this version" choice. It
  shows the extension's version as "v. X.Y.Z", with a link to all releases.
- **Settings:** "Check for updates" on/off. The README says what the check sends:
  a request to GitHub, which sees the user's IP address and nothing else.
- **New host permissions:** `api.github.com` and GitHub's release-asset host (the
  download redirects there). Adding host permissions makes Chrome ask the user again on
  update.
- **Languages:** every new text in Bokmål and Nynorsk.
- **Test:** install 1.2.0 unpacked; publish a test pre-release 1.2.1 to a fork, pointing
  the checker at it with a developer setting; check the badge, the page, a good
  download, a download with a broken signature (refused), and that nothing happens in a
  store-type install.
- **Version:** 1.2.0 (a new feature).
- **Done (written, offline tests):** releases.js (the pinned key, GitHub's latest
  release with its ETag, the size, SHA-256 and Ed25519 checks), the daily check in
  background.js (badge, one notification per version), update.html, the version link
  in the pages' headers, the nb/nn texts, and `tests/releases.test.js` (15 tests: a
  fake GitHub, a key made in the test, a good download saved, a broken signature and
  a changed file refused, nothing in a store install).
- **Done: tested in Chrome** with `updateDev = {version: '1.1.0'}` against the real
  repository instead of a fork (`/releases/latest` never gives a pre-release, and
  `sign.mjs` signs this repository's drafts only): the published v1.1.3 showed as new
  (badge, notification, the page), and its real, signed package was downloaded,
  checked and saved. Chrome 157's Ed25519 accepted v1.1.3's `SHA256SUMS.sig` and
  refused a copy with one bit changed.
- **Done: v1.2.0 published** (7 November 2026) with `sh tools/release v1.2.0`. Copies
  from 1.2.0 on show the next release by themselves; 1.1.3 and older don't check.

### Phase 4: 1.4.1, the Chrome version cleaned up

Fixes only (PATCH), in Chrome and Brave as they are now; nothing for other browsers
yet.

- **Done: names in their old spellings**, found in a real family's
  index records (the patterns only; no names from them in the repo):
  - an old final j or y for i (Sirj, Siry = Siri, and so a form of Sigrid): the
    search stem (`givenStem()`), the name groups (`nameKey()`) and scoring;
  - the forms of Åshild (Aasel, Aasild, Osille, Oselle), Rønnaug (Ronnau, Ronu, Ronaug)
    and Ånund (Aanen, Aanon) in `GIVEN_NAME_FORMS`;
  - an initial sj, skj, sch, sk before a front vowel, and the old si before a vowel, as
    one sound in `skeleton()` (Sjønne = Skjønne = Siønne = Sionne);
  - a farm name in place of the patronymic says nothing against a relative
    (`patronymicDiffers()`: Halvor Nordby may be Halvor Larsen); another patronymic
    still does;
  - patronymics of one father in other spellings agree (`sameFather()`: Jonsdatter,
    Johnsdatter, Johannesdatter; Aanensdatter, Aanonsdatter; a woman's -sen for
    -datter), in scoring, `patronymicDiffers()`, and the linker's `patronymicClash()`
    and `patronymicFrom()`;
  - -sd without a full stop (Olsd) read as a patronymic.
- **Checked, no change: a woman under -sen.** `recordSex()` (linker.js) reads -sen as
  a man's unless the role or position says otherwise; a woman recorded as Aanensen in a
  census could then fail a pairing by sex. Every -sen person in the fixtures is a man
  (fathers, husbands, sons, emigrants), so nothing shows it yet; change it when a
  record does.
- **Done: a linker test** of `patronymicClash()` with one father's
  spellings (Kjersti Jonsdatter / Kjersti Johannesdatter: no clash).
- **Done (in code): the host permissions narrowed** to `https://www.familysearch.org/*`
  and `https://www.digitalarkivet.no/*`, so Chrome's default Site access matches what's
  used (an update asking for fewer sites gives no prompt) and the store reviews (Phase
  6) have no wildcard to justify. `isDigitalArkivet()`, `onDigitalArkivet()`,
  `fetchResultPage()` and `onFamilySearch()` accept the same hosts (bare
  `digitalarkivet.no` redirects to www.); a work tab on FS's sign-in page
  (ident.familysearch.org, no `url` now) asks the user to sign in. SECURITY.md and
  CLAUDE.md name the exact hosts.
  - **To do:** load it unpacked and run a search, the linker and the toolbar icon on a
    DA record once, since a missed host fails only in the browser, not in the tests.
- **Done: DA down or refusing.** A 5xx, a timeout (30 s) or a network error has
  `fetchResultPage()` ask DA's front page once; when that fails too, DA is down. A
  refusal (403/429) or an outage sets a pause shared by the pages (`daPause()`, 15 and
  5 min) in which nothing is sent and cached pages are still given; the search page and
  the linker show the warning with "Try again now". One page's failure while DA answers
  doesn't pause.
- **Done (in code): standard places in Create person.** `comboField()` (fs_attach.js)
  clicked FS's first suggestion, which in FS's fact dialogs is the text as typed, not
  the standard place. `pickSuggestion()` skips the text as typed and takes the first
  suggestion with a kind-and-years line whose years hold the record's year (Vågå,
  Oppland for 1846, Vågå, Innlandet for 2021), else the first standard one.
  - **To check:** the next person created from the linker (the 7 November one was
    deleted): are the birth and death places standard?
- **Test:** `npm test`; the workflow once in Chrome and once in Brave on the test tree
  (search, the linker's pairing, the SourceBox check; attach only with your OK).
- **Release:** `sh tools/release v1.4.1`. Copies from 1.2.0 on are told by the update
  checker.

### Phase 5: 1.5.0, adding the record's facts to FamilySearch

MINOR: a new feature (decided 9 November 2026; Firefox moved to 1.6.0). The linker's
facts table already sets the record's facts beside the tree's (✓ ≈ ✗, or nothing in
the tree); each row can now be added to the tree person, or written over, with the
user's approval.

- **What can be added:**
  - **A name** that differs (≈ or ✗): an alternate name, Also Known As by default (FS's
    types: Also Known As, Birth Name, Married Name, Nickname).
  - **A fact the tree lacks:** a christening, death, burial, residence or occupation;
    an emigration as a Custom Event titled Emigration (FS's add-event menu has no
    Emigration; fs_person.js already reads such events).
  - **A vital that differs** (birth, christening, death, burial): FS keeps one of each,
    so the change is an edit of FS's, often a combination of the two.
  - **Not yet:** the couple's marriage (a dialog of the relationship).
- **How it's shown:** a tickbox on each fact row that has something to add, unticked by
  default, with an editable box pre-filled with a suggestion: the more specific value of
  each part (the record's "16 July 1846" over FS's "1846", FS's "Vågå, Oppland, Norway"
  over the record's "Vågå"), the record's where the two disagree, and FS's value shown
  beside it. The reason is editable too: "From <source title>, Digitalarkivet,
  Permanent ID <id>." A summary above the buttons lists what will be added.
- **Places in FS's standard form:** FS standardizes a place only in its own dialog.
  Its suggestions (`suggestion-N`) start with the text as typed; the standard forms have
  a second line with the kind and the years ("Municipality, 1781 - 2019"), so the one
  whose years hold the record's year is picked (Vågå, Oppland for 1846; Vågå, Innlandet
  from 2020). A ticked addition is prepared first (filled in FS's dialog in the hidden
  window, the picked forms read back, cancelled), shown for approval, then saved, as
  Find and Create person do.
- **In `run()`:** after the source is attached, each approved addition, logged; then the
  source is tagged to that fact from the fact's own Tag Sources (which lists the
  person's sources; to check what follows Select Source), so a census's residence is
  tagged even when the person has several.
- **FS's dialogs** (looked at on 2026-11-09 on the test tree, each cancelled):
  - a fact's pencil (`pencil-edit-button`, "Edit Birth") opens `conclusion-dialog`
    with `ConclusionDialog:edit:button` (Edit) and Tag Sources;
  - the add buttons: `add-alternate-name`, `add-new-otherEvent-button` (a menu,
    `add-new-conclusion-overlay`: Residence, Occupation, Immigration, Custom Event, ...),
    `add-new-otherFact-button` (nothing we'd use);
  - the form: `conclusionDetailOverlay:date`, `:place` (comboboxes, `aria-controls`),
    `:description` (a residence's), `:reason` (`justification`),
    `conclusionDetailOverlay:submit:button` (Save), `add-edit:cancel-action` (Cancel),
    `conclusionDetailOverlay:delete:button` (never clicked);
  - an alternate name: the `nameType` select (AKA, BIRTH, MARRIED, NICK), `template`
    (`no`), `first-name`, `last-name`, as in Add Person;
  - a fact's Tag Sources: "Tag Source For Residence", the person's sources,
    `restore-source-select-button`, `restore-source-cancel-button`.
  - a missing vital: the highlight's own add button,
    `[data-testid=highlight-CHRISTENING] [data-testid="conclusion:add:button"]` ("Add
    Christening"), opens the form at once (no Edit step), with a Tag Sources panel
    (`conclusionDetailOverlay:sources-wrapper`); its list has each source as a
    `div[role=button]` whose `name` is the SourceBox ID and `aria-label` the title;
    clicking one shows a preview with `source-view-tag-button` ("Tag To Christening")
    and `source-view-close-button`. **To check:** whether Tag To saves at once or only
    adds to the unsaved form.
  - Custom Event: `conclusionDetailOverlay:title`, `:description`, `:date`, `:place`,
    `:reason`; Occupation: `:description`, `:date`, `:place`, `:reason`; neither add
    form has Tag Sources (tagged after saving, from the fact's edit form).
  - the menu items have no testids (`role=menuitem`, found by their English text).
  - **To check:** how an occupation shows on the person page (fs_person.js reads
    `conclusionDisplay:OCCUPATION`'s body besides its date and place as the
    description; none on the test tree had one).
- **Done (in code and tests, not tried on FS):** `factAdditions()` (linker.js) gives
  the suggestions; each row's facts table lists them, unticked, with the editable entry
  shown once ticked and one reason for the row; `#changes` above the buttons lists the
  ticked ones; `readPlan()` gives them as `additions` on each pair, and an emptied one
  stops the plan. **Check with FamilySearch** (`prepareAdditions()`) fills each in FS's
  form in the hidden window (`addFact`, `save: false`) and puts FS's standard date and
  place in the boxes. `run()` saves them after the main source's attach and tags
  (`addFact` with `save`), then `tagFact`. The SourceBox copy's fields are read in the
  check (`editSource` with `read`) and shown with a choice per field.
- **To try on the test tree, with your OK** (it saves): one addition of each kind (an
  alternate name, a christening added, a birth changed, a residence, an occupation, a
  custom event), each tagged; whether Tag To saves at once; how an occupation shows;
  the field choices on a source already in the SourceBox.
- **An existing SourceBox source:** the check reads its fields too (the Edit Source
  dialog, cancelled) and shows each field that differs side by side: keep FS's or use
  the record's. The record's by default for the fields the extension writes (title,
  citation, web page, date); for the notes, FS's with what's new from the record
  appended, unless FS's are an older copy of the extension's. Nothing differs: nothing
  written, as now.
- **Test:** fs_attach.test.js on made-up dialogs with these testids; linker tests of the
  suggestions; on the test tree, one addition of each kind, only with your OK.
- **Release:** `sh tools/release v1.5.0`.

### Phase 6: 1.6.0, one package for Chromium and Firefox

One zip for every browser and store (decision 10), not a build per browser. MINOR: a
new browser.

- **Manifest**, the same file for all:
  - `background` with both `service_worker: "background.js"` (Chromium) and `scripts`
    (Firefox, which has no extension service workers): i18n.js, i18n_strings.js,
    releases.js, da_places.js, farms.js, background.js. Chrome ignores `scripts` when
    `service_worker` is there (a warning on the extension's card, not an error);
    background.js calls `importScripts` only when it exists.
  - `browser_specific_settings.gecko`: `id` `arkivet2fs@dude4linux` (permanent once
    published), `strict_min_version` (the first Firefox with everything below; check
    `storage.session` and Ed25519 in WebCrypto), and `data_collection_permissions`
    (Mozilla's rule for new extensions: I'll check what to declare for an extension that
    sends nothing to its developer). Chrome ignores the key.
  - `tools/build.mjs` stays as it is; `web-ext lint` on the zip in ci.yml.
- **Notifications:** register `chrome.notifications.onClicked` at the top level of
  background.js (an event page that has unloaded misses a listener added later), and
  drop `buttons`, which Firefox doesn't support (the click itself opens the page).
- **Site access:** Firefox (and Chrome when the user picks "On click") can withhold the
  host permissions. search.html and linker.html check `permissions.contains()` for DA
  and FS and, when one is missing, show a button that asks with
  `permissions.request()` (it needs a click), instead of failing on the first fetch.
- **The update-check hosts:** `api.github.com` and `release-assets.githubusercontent.com`
  serve only unpacked copies, but every install asks for them, and the store reviews
  ask why. Move them to `optional_host_permissions`, asked for on the Updates page with
  one click in an unpacked copy ("Check for updates" off until then). Decided
  (decision 11).
- **The hidden window in Firefox:** the linker reads FS in a `popup` window behind its
  own (`hiddenTab()`). Check that Firefox draws it (FS's SourceBox list loads), keeps it
  below the linker, and that `windows.create({focused: false})` is honoured; else find
  what does work there before release.
- **Also to check in Firefox:** `scripting.executeScript` with `files` then `func` in
  the same isolated world (background.js's click handler), `tabs.sendMessage` to
  fs_attach.js, `chrome.management.getSelf()` (`installType` there: the update check
  must stay quiet in an AMO install), `<a download>` of a `Blob` on update.html,
  `storage.session`.
- **Test, in each browser:**
  - **Firefox:** `web-ext run` with the package; the whole workflow on the test tree
    (search, the linker, the SourceBox check; attach to a test person only with your
    OK).
  - **LibreWolf:** the same with the package installed from a file (it runs unsigned
    add-ons only with `xpinstall.signatures.required` off; after Phase 7 from AMO). Its
    defaults clear cookies on closing and resist fingerprinting: note what testers
    need (staying signed in to FamilySearch: an exception for familysearch.org).
  - **Opera:** the Chromium package loaded unpacked. Opera's `chrome.notifications` is
    uncertain; if it's missing, errors show on the badge and in the page instead.
  - **Chrome, Brave, Edge:** the same package once more, since the manifest changed.
- **Release:** `sh tools/release v1.6.0`.

### Phase 7: Store listings

Same zip, four stores; each store signs and updates its own copy, and the update
checker stays quiet there (it runs only in an unpacked copy). The self-hosted Firefox
route (`web-ext sign --channel=unlisted`, `update_url`, `updates.json`) is dropped:
AMO's listed channel updates Firefox and LibreWolf users by itself.

- **Your accounts:** you create them and submit the listings yourself:
  - Chrome Web Store: $5 once (decided). Brave and Opera users can install from it too.
  - Microsoft Edge Add-ons: free.
  - Opera add-ons (addons.opera.com): free; the review can take weeks.
  - Firefox AMO, listed: free.
- **What every listing needs** (prepared in the repo, `store/`, excluded from the
  package):
  - **A privacy policy:** `PRIVACY.md` from SECURITY.md's "What the extension does with
    your data" (the hosts, nothing sent to the developer, what is kept and for how
    long), linked by its GitHub address.
  - **Permission justifications**, one line each: `activeTab` and `scripting` (read the
    open DA record; the FS steps), `storage` (drafts, the persons searched), `alarms`
    and `notifications` (errors; the update check of an unpacked copy), each host (DA,
    FS, Rygh, Kartverket).
  - **The single purpose**, Chrome's rule: "make a FamilySearch source from a
    Digitalarkivet record and attach it to the persons it names".
  - **Screenshots** (1280×800): the search page, the linker and the FS entry, with
    made-up persons only. search.html and linker.html can be run on the test fixtures
    (sanitized DA pages, `TEST-` persons) and captured with headless Chrome, as the
    icons are; no real tree, no real FS page with other users' work.
  - **Descriptions** in English and Norwegian (`_locales` has the short ones); the
    store icon (icon128.png).
- **Later:** uploads from release.yml through the stores' APIs (Chrome's, Edge's and
  AMO's take a zip and keys as secrets); until then by hand, after `tools/release`.
- **Test:** install from each store once its listing is public; the update from one
  store version to the next.

### Phase 8: A call for testers

- **Where:** a Norwegian genealogy Facebook group you're a member of, asking for
  Norwegian-speaking volunteers to try it and send feedback. You post it; I can draft
  the text (Norwegian and English) for you to edit.
- **What it gives:** the store links (one per browser), the README as the guide, and
  where to report problems (GitHub issues, or a contact for those without a GitHub
  account). Ask testers for the browser, the version (the toolbar icon's tooltip) and
  the DA record's address.
- **Later:** a RootsTech 2027 presentation, once testers' feedback is in.

## Decisions needed

1. ~~Public repo on GitHub~~ **Decided:** public, `Dude4Linux/arkivet2fs`.
2. ~~Commit emails~~ **Decided:** rewritten to the GitHub noreply address before the
   first push.
3. ~~git-server's role~~ **Decided:** a read-only mirror of GitHub.
4. ~~Signature scheme~~ **Decided:** Ed25519 `.sig` only, checked by the extension (no
   GPG).
5. ~~Where the signing key lives~~ **Decided:** local signing for now; a GitHub secret
   behind an approval step can come later, when releases are frequent.
6. ~~Chrome Web Store and Edge listing~~ **Decided:** listed after 1.6.0 (Phase 7), with
   Opera and AMO; the Chrome Web Store's $5 is accepted.
7. ~~Firefox ID and channel~~ **Decided:** `arkivet2fs@dude4linux`; listed on AMO only
   (the unlisted, self-hosted channel is dropped).
8. ~~Safari~~ **Dropped:** the extension isn't sold, so an Apple Developer membership
   ($99 a year) isn't justified.
9. ~~Dev-only `package.json`~~ **Decided:** keep it (jsdom, for the tests); add web-ext to
   it in Phase 6.
10. ~~Packages~~ **Decided:** one zip for all browsers and stores, one manifest.
11. ~~The update-check hosts~~ **Decided:** optional permissions
    (`optional_host_permissions`), asked for on the Updates page with a click; store
    installs ask only for the four sites they use.
