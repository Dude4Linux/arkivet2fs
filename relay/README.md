# The report relay

The extension's **Send report** panel (report.js) posts a problem report here. The
relay is a Cloudflare Worker (`worker.mjs`) that files each report as an issue in a
private GitHub repository, through a GitHub App installed on that repository only.
The extension can't keep a secret, so the App's key lives in the Worker. Anyone who
reads the extension's code can post to the relay; the Worker accepts only extension
origins, checks each field, limits each address to three reports a minute, and
mentions no one on GitHub (an `@` gets a zero-width space after it).

The relay keeps nothing itself. A report's issue has the report as written in the
panel, after the contact address when one was given; a report longer than an issue
can hold continues in comments.

The relay isn't part of the package (`tools/build.mjs` excludes `relay/`). Its tests
are `tests/relay.test.js`, against a fake GitHub.

## Setting it up

You need a GitHub account (the maintainer's) and a free Cloudflare account.

1. **The reports repository.** A private repository, e.g.

   ```sh
   gh repo create Dude4Linux/arkivet2fs-reports --private \
     --description "Problem reports from the arkivet2fs extension"
   ```

   If you choose another name, change `REPO_NAME` in `wrangler.toml`.

2. **The GitHub App.** On GitHub: Settings → Developer settings → GitHub Apps → **New
   GitHub App**.
   - Name: any free name, e.g. `arkivet2fs-reports`. Homepage URL: the extension's
     repository.
   - Webhook: untick **Active**.
   - Repository permissions: **Issues: Read and write**. Nothing else (Metadata
     read-only comes with it).
   - Where can this GitHub App be installed: **Only on this account**.
   - Create it. On its page, note the **Client ID** (`Iv23…`), then under **Private
     keys** click **Generate a private key**: a `.pem` file downloads. Keep it out of
     every repository (e.g. in `~/.config/arkivet2fs/`).
   - **Install App** → your account → **Only select repositories** →
     `arkivet2fs-reports`. The installation's address ends in its ID:
     `https://github.com/settings/installations/NNNNNNNN`.

3. **The Worker.** From this folder, with Node 22:

   ```sh
   cd relay
   npx wrangler@4 login
   npx wrangler@4 deploy
   npx wrangler@4 secret put APP_CLIENT_ID       # paste the Client ID
   npx wrangler@4 secret put INSTALLATION_ID     # paste the installation ID
   npx wrangler@4 secret put PRIVATE_KEY < ~/.config/arkivet2fs/arkivet2fs-reports.private-key.pem
   ```

   `deploy` prints the Worker's address, `https://arkivet2fs-relay.<subdomain>.workers.dev`.

4. **Try it** (a made-up report; the `Origin` is any 32 letters a–p):

   ```sh
   curl -s https://arkivet2fs-relay.<subdomain>.workers.dev/report \
     -H 'Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop' \
     -H 'Content-Type: application/json' \
     -d '{"report":"A test report.","version":"1.7.0","browser":"curl","page":"linker"}'
   ```

   It answers `{"ok":true,"number":1}`, and the issue is in the reports repository.
   `npx wrangler@4 tail` shows the Worker's errors as they happen.

5. **The extension.** Put the address in `relayUrl()` in `report.js`, in place of the
   placeholder (`tools/build.mjs` won't build a release tag while it's there).

## Reading the reports

```sh
gh issue list -R Dude4Linux/arkivet2fs-reports
gh issue view N -R Dude4Linux/arkivet2fs-reports --comments
```

Close an issue when it's dealt with; reports name tree persons, so don't move them to
the public repository as they are.

## Changing the key

Generate a new private key on the App's page, `secret put PRIVATE_KEY` again, then
delete the old key there. The Worker picks up the new secret at once.
