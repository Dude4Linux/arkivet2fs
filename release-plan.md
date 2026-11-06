# Release plan: GitHub, signed packages, update checker, more browsers

Status: **draft, for approval**. Decisions 1–3 are made (below); the test harness is
in place (it was asked for on its own). Nothing else is started until the plan is approved.
Each phase ends with a test and a tagged release (or a test tag), so the next
phase starts from something that works.

## Where we are (1.1.2)

- One Chromium MV3 extension at the repo root: Chrome and Brave load the folder
  unpacked. There's no build step. The tests are in the repo now (`tests/`, `npm test`:
  77 tests, jsdom, offline, about 2 s; a dev-only `package.json`), replacing the earlier
  harness that lived in a temporary folder and was lost.
- The repo is on git-server (Forgejo, private): one author, 4 tags (v1.0.0 – v1.1.2),
  3.9 MB of history.
- APIs used: `action`, `scripting`, `storage.local/session`, `tabs`, `notifications`,
  `runtime`, `i18n`. The service worker loads its helpers with `importScripts()`.

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
  itself. That's the one browser where a GitHub release can be a true auto-update.
- **Safari** extensions ship inside a macOS app that Apple signs and notarizes. Updates
  come from the App Store, or are downloaded by hand for a directly distributed app.
- **Stores do the updating for their users.** Our checker should stay quiet in a store
  install and only run in an unpacked or self-hosted install.
  `chrome.management.getSelf()` gives `installType` (`development` for unpacked) without
  the `management` permission.

So the checker's job is to **tell the user that a release is out, show what changed,
download the right package, check its signature, and say how to install it.**

## Repository layout

The code stays where it is. The root remains a loadable Chromium extension, so "Load
unpacked → the repo folder" and the CLAUDE.md workflow don't change. Chrome, Brave,
Edge and Opera all use it as it is. The other browsers get what differs from it:

```
/                         the Chromium extension, as today (manifest.json is the base)
platform/
  firefox/manifest.json   keys merged over the base (gecko id, background.scripts, ...)
  opera/manifest.json     only if Opera needs anything (Phase 5 finds out)
  safari/                 the Xcode project made by safari-web-extension-converter
tools/
  build.mjs               dist/<browser>/ = the shared files + the merged manifest; zips it
  sign.mjs                SHA256SUMS + signatures (see "Signatures")
  verify.sh               lets a user check a download by hand (openssl)
tests/                    the jsdom unit tests, rebuilt and kept in the repo
keys/release.pub          the public signing key (also pinned in the extension)
.github/workflows/
  ci.yml                  on push and pull request: lint, tests, build every target
  release.yml             on a v* tag: build, sign, draft a GitHub release
CHANGELOG.md              one section per version; the release notes come from here
package.json              dev-only tools (jsdom, web-ext); nothing ships from npm
```

- **The version stays in one place.** `manifest.json` is still the only place it's kept.
  build.mjs copies it into the Firefox manifest and into Safari's `MARKETING_VERSION`.
- **`package.json` is new.** It's for development tools only. The shipped extension
  stays free of dependencies and has no build-time code changes, so the source in a
  release is the source that runs.

## Release assets (each version)

| File | For |
|---|---|
| `arkivet2fs-X.Y.Z-chromium.zip` | Chrome, Brave, Edge (unpack and load) and the store uploads |
| `arkivet2fs-X.Y.Z-opera.zip` | Opera, if it ends up differing from chromium |
| `arkivet2fs-X.Y.Z-firefox.xpi` | Firefox, signed by Mozilla |
| `arkivet2fs-X.Y.Z-safari.zip` | the notarized macOS app |
| `*.sig` next to each package | a detached signature of that file |
| `SHA256SUMS`, `SHA256SUMS.sig` | checksums of everything, signed |
| `updates.json` | Firefox's self-hosted update manifest (Phase 4) |

GitHub adds the source archive. A release can only be made from a `vX.Y.Z` tag, and the
workflow checks that the tag matches manifest.json's version.

## Signatures

Each package gets our own detached signature, on top of whatever the browser does
itself (Mozilla's signing of the xpi, Apple's code signing).

- **Recommended scheme: Ed25519, as a raw detached signature (`.sig`, base64).** It's
  made with `openssl pkeyutl -sign -rawin`. A user can check it with `openssl` (verify.sh),
  and the extension can check it with WebCrypto, which supports Ed25519 in current Chrome,
  Firefox and Safari. The extension pins the public key, so a download that doesn't
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

### Phase 1: Move to GitHub

- **Rewrite the commit emails** to the GitHub noreply address (decided) with
  `git filter-repo --mailmap`, on a fresh clone, before the first push. Every commit hash
  and the four tags change; the tags are recreated, annotated, on the rewritten commits.
  git-server is then force-updated to the rewritten history, once.
- **Rewrite the real names out of the history,** in the same pass: the older commits
  hold the real family names and the real DA pages they came from (the fixtures before
  sanitizing, and examples in docs and comments). `git filter-repo --replace-text` with
  a list made from `tests/private/names.json` and `map.json` (the real names, IDs and
  farms, each → its made-up one), and `--invert-paths` for any real page that was ever
  committed; then grep the rewritten history (`git log -p --all`) for every `mustGo`
  word and real permanent ID. The list stays private (`tests/private/`).
- **Create the repo** `Dude4Linux/arkivet2fs`, public, GPL-3.0 (decided). Push master and
  all four tags.
- **git-server becomes a read-only mirror of GitHub** (decided): a Forgejo pull mirror,
  so nothing is pushed there by hand any more. GitHub is the main repo.
- **Settings:** protect master and `v*` tags; Actions limited to read-only tokens except
  in release.yml; issues on; a SECURITY.md that says how to report problems.
- **The tests (done ahead of the move):** `tests/`, one file per file of the extension,
  on 15 sanitized DA pages in `tests/fixtures/da/` (historical records, with made-up
  names, IDs and links; `tests/sanitize.js`) and synthetic FS persons; `tests/README.md` says how. They go to GitHub with the code; the audit checks
  the fixtures too. No FamilySearch page is ever saved there.
- **ci.yml:** runs the tests and `node --check` on every file.
- **Docs:** update README and CLAUDE.md with the new home, how to contribute, and the
  layout above.
- **Test:** CI passes on GitHub; the mirror on git-server follows a test push.
- **Version:** none (docs and tooling only).

### Phase 2: Chromium packages and signed releases

- **Tooling:** `tools/build.mjs` (chromium target), `tools/sign.mjs`, `tools/verify.sh`,
  `CHANGELOG.md`, and `release.yml`. A tag builds, signs, attests and drafts the
  release; you publish the draft.
- **Exclude from the zip:** what users don't need (docs for developers, tests, tools,
  platform/, `banner.*`).
- **Test:** a throwaway tag on a fork, or a draft release that's deleted afterwards, to
  check the zip loads in Chrome and Brave, and that `verify.sh` accepts the signature
  and rejects a tampered byte.
- **Version:** the next PATCH (1.1.3, or 1.1.4 if the two scoring fixes found by the tests ship first); the first release from GitHub.

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

### Phase 3b (optional): Chrome Web Store and Edge Add-ons

- **Why:** most Chrome users can't use a zip comfortably. A store listing gives them a
  one-click install and automatic updates.
- **Cost and listing:** the Chrome Web Store needs a $5 developer registration, a
  privacy policy and screenshots. Edge Add-ons is free. Both take the chromium zip.
- **Your accounts:** you'd create these accounts and submit the listings yourself.
- **Later:** API uploads from release.yml.

### Phase 4: Firefox

- **Manifest** (`platform/firefox/manifest.json`):
  - `browser_specific_settings.gecko.id`: a permanent ID, a decision.
  - `strict_min_version`.
  - `background.scripts` listing i18n.js, i18n_strings.js, da_places.js, farms.js,
    background.js. Firefox has no extension service workers; background.js calls
    `importScripts` only when it exists.
  - `data_collection_permissions`: Mozilla now asks new extensions to declare what data
    they collect; I'll check the current rule.
- **Host permissions:** in Firefox MV3 the user can withhold or revoke them. Search and
  the linker check `permissions.contains()` and ask with `permissions.request()` when
  access is missing.
- **Notifications:** check `notifications`, `storage.session`, `scripting.executeScript`
  with `func` and the reading of FS in a background tab (`readPerson`); fix what differs.
- **Distribution:** self-distributed. `web-ext sign --channel=unlisted` in release.yml
  (AMO API keys as secrets) gives a Mozilla-signed xpi. `gecko.update_url` points at
  `updates.json` on the latest release, so Firefox updates by itself. Our checker stays
  quiet on Firefox. A listing on addons.mozilla.org can come later; a listed version
  can't carry `update_url`, so it would be a second channel.
- **Test:** `web-ext lint` and `web-ext run` locally; the full workflow on a real
  person (search, review, attach to a test person only with your OK); then an update
  from X.Y.Z to a test release through `updates.json`.
- **Version:** the next MINOR (a new browser).

### Phase 5: Opera

- **Expected to need little:** Opera runs Chromium MV3 extensions, so it probably needs
  no changes. Its users can also install from the Chrome Web Store if 3b is done.
- **Check:** load the chromium zip in Opera; go through the workflow. Opera's support for
  `chrome.notifications` is unclear; if it's missing, errors show on the badge and in
  the page instead.
- **Distribution:** submit to addons.opera.com (free; the review can take weeks), or
  point Opera users to the chromium zip with the update checker.
- **Package:** a separate `-opera.zip` only if Opera turns out to need its own manifest.
- **Version:** PATCH if only fixes, MINOR if Opera gets its own package.

### Phase 6: Safari (macOS) — deferred

A placeholder: not planned until there's a Mac and an Apple Developer membership
(decision 8). The notes below are kept for then.


- **What you'll need:** a Mac with Xcode, and an Apple Developer Program membership
  ($99 a year) for anything beyond local testing. Without the membership, Safari can
  only run it with "Allow unsigned extensions", which resets every launch.
- **The wrapper:** `xcrun safari-web-extension-converter` makes `platform/safari/`, a
  macOS app that contains the extension. build.mjs copies in the shared files, so
  there's still only one copy of the code.
- **Likely gaps:**
  - Safari has no `notifications` API (the Opera fallback covers it).
  - Host access is granted per site by the user.
  - Check `storage.session`, `scripting` and background tabs.
- **Distribution (a decision):** the Mac App Store (Apple's review; App Store updates),
  or a Developer ID–signed, notarized app in the release zip (the update checker tells
  users when a new one is out).
- **Builds:** they need macOS, so release.yml gets a macOS job, with the signing
  certificate as a secret.
- **iOS and iPadOS Safari** could follow from the same project, but they're out of scope
  here.
- **Version:** the next MINOR.

## Decisions needed

1. ~~Public repo on GitHub~~ **Decided:** public, `Dude4Linux/arkivet2fs`.
2. ~~Commit emails~~ **Decided:** rewritten to the GitHub noreply address before the
   first push.
3. ~~git-server's role~~ **Decided:** a read-only mirror of GitHub.
4. ~~Signature scheme~~ **Decided:** Ed25519 `.sig` only, checked by the extension (no
   GPG).
5. ~~Where the signing key lives~~ **Decided:** local signing for now; a GitHub secret
   behind an approval step can come later, when releases are frequent.
6. ~~Chrome Web Store and Edge listing~~ **Decided:** later. Self-distributed releases
   first; a listing once the update checker has proven itself.
7. ~~Firefox ID and channel~~ **Decided:** `arkivet2fs@dude4linux` (permanent once
   published); self-distributed first, an AMO listing later.
8. ~~Safari~~ **Deferred:** Phase 6 is a placeholder until there's a Mac and an Apple
   Developer membership.
9. ~~Dev-only `package.json`~~ **Decided:** keep it (jsdom, for the tests); add web-ext to
   it in Phase 4.
