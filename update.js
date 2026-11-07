// The update page (update.html, release-plan.md Phase 3): the version in use, the
// latest release on GitHub with its notes, and a Download button that saves the
// package only after checking it (releases.js checkPackage(): the size and SHA-256 the
// release gives, and the signature against the pinned key). How to install it, "Remind
// me later", "Skip this version", and the daily check's setting. background.js does
// the checks; "Check now" asks it to.

function byId(id) {
  return document.getElementById(id);
}

// A time as "7 November 2026, 14:05" in the UI language
function shownTime(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate()) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

async function readUpdateState() {
  const s = await chrome.storage.local.get(['update', 'updateChoice', 'updateCheck', 'updateDev']);
  let development = false;
  try {
    development = (await chrome.management.getSelf()).installType === 'development';
  } catch (e) { /* not known: as a store install */ }
  return { ...s, development };
}

function say(id, text, kind) {
  const node = byId(id);
  node.textContent = text;
  node.className = kind || '';
}

let shownRelease = null;

function renderUpdate(s) {
  const manifest = chrome.runtime.getManifest().version;
  const current = currentVersionOf(s.updateDev, manifest);
  const repo = updateRepoOf(s.updateDev);
  byId('current').textContent = t('You have arkivet2fs v. {version}.', { version: manifest }) +
    (current !== manifest ? ' ' + t('The developer setting makes it act as v. {version}.', { version: current }) : '');
  byId('all-releases').href = 'https://github.com/' + repo + '/releases';
  if (!s.development) {
    byId('store-note').hidden = false;
    return;
  }
  byId('checker').hidden = false;
  byId('settings').hidden = false;
  byId('update-check').checked = s.updateCheck !== false;
  byId('key-note').textContent = t('A download is saved only when it is signed with the release key, fingerprint {fingerprint}.', { fingerprint: releaseKeyFingerprint() }) +
    (repo !== defaultRepo() ? ' ' + t('Releases are read from {repo} (the developer setting).', { repo }) : '');

  const u = s.update && s.update.repo === repo ? s.update : null;
  const release = newerRelease(u, current, Date.now());
  let status;
  if (!u || !u.checked) status = t('Not checked yet.');
  else {
    const checked = t('Last checked {when}.', { when: shownTime(u.checked) });
    if (u.error) status = t(u.error, { status: u.errorStatus }) + ' ' + checked;
    else if (release) status = t('v. {version} is out.', { version: release.version }) + ' ' + checked;
    else if (u.release) status = t('You have the latest version (v. {version} is the latest release).', { version: u.release.version }) + ' ' + checked;
    else status = t('There is no release yet.') + ' ' + checked;
  }
  if (s.updateCheck === false) status += ' ' + t('The daily check is off.');
  say('check-status', status, u && u.error ? 'bad' : 'muted');

  byId('release').hidden = !release;
  if (!release) return;
  if (!shownRelease || shownRelease.version !== release.version) {
    shownRelease = release;
    const published = release.published ? new Date(release.published) : null;
    byId('release-title').textContent = published && !isNaN(published)
      ? t('v. {version}, published {date}', { version: release.version, date: formatDate(published.getFullYear(), published.getMonth() + 1, published.getDate()) })
      : 'v. ' + release.version;
    byId('notes').replaceChildren(notesElement(document, release.notes));
    byId('download').textContent = t('Download {name}', { name: release.zip.name });
    say('download-status', '');
    byId('install').hidden = true;
  }
  const choice = s.updateChoice || {};
  byId('skip').disabled = choice.skipped === release.version;
  if (choice.skipped === release.version) say('download-status', t('You skipped this version: the icon doesn\'t show it, and the next version is shown again.'), 'muted');
  else if (choice.later > Date.now()) say('download-status', t('Put off: the icon shows it again from {when}.', { when: shownTime(choice.later) }), 'muted');
}

async function downloadRelease() {
  const release = shownRelease;
  if (!release) return;
  const button = byId('download');
  button.disabled = true;
  say('download-status', t('Downloading…'), 'muted');
  try {
    const [data, sig] = await Promise.all([downloadAsset(release.zip, fetch), downloadAsset(release.sig, fetch)]);
    say('download-status', t('Checking the signature…'), 'muted');
    const result = await checkPackage(data, new TextDecoder().decode(sig), release.zip, undefined, release.version);
    if (!result.ok) {
      say('download-status', t('Not saved: {problem}', { problem: t(result.problem) }), 'bad');
      return;
    }
    const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = release.zip.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    say('download-status', t('Checked and saved as {name}: it is the release\'s file, signed with the release key.', { name: release.zip.name }), 'ok');
    byId('install').hidden = false;
  } catch (error) {
    if (error.unsupported) say('download-status', t('This browser cannot check the signature, so nothing was saved. Download the package from GitHub and check it with verify.sh (see the README).'), 'bad');
    else if (error.status) say('download-status', t('The download failed: GitHub answered {status}.', { status: error.status }), 'bad');
    else say('download-status', t('The download failed: {detail}', { detail: error.message }), 'bad');
  } finally {
    button.disabled = false;
  }
}

async function setChoice(change) {
  const { updateChoice } = await chrome.storage.local.get('updateChoice');
  await chrome.storage.local.set({ updateChoice: { ...(updateChoice || {}), ...change } });
}

async function startUpdatePage() {
  localizePage();
  document.querySelector('.topbar').append(languageMenu());
  const refresh = async () => renderUpdate(await readUpdateState());
  byId('check-now').addEventListener('click', async () => {
    byId('check-now').disabled = true;
    say('check-status', t('Checking…'), 'muted');
    try {
      const answer = await chrome.runtime.sendMessage({ action: 'checkUpdate' });
      if (answer && answer.error) say('check-status', t('The check failed: {detail}', { detail: answer.error }), 'bad');
      else await refresh();
    } catch (error) {
      say('check-status', t('The check failed: {detail}', { detail: error.message }), 'bad');
    } finally {
      byId('check-now').disabled = false;
    }
  });
  byId('download').addEventListener('click', downloadRelease);
  byId('later').addEventListener('click', () => setChoice({ later: Date.now() + remindLaterMs() }));
  byId('skip').addEventListener('click', () => shownRelease && setChoice({ skipped: shownRelease.version }));
  byId('update-check').addEventListener('change', () => chrome.storage.local.set({ updateCheck: byId('update-check').checked }));
  byId('reload').addEventListener('click', () => chrome.runtime.reload());
  byId('extensions').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.update || changes.updateChoice || changes.updateCheck || changes.updateDev)) refresh();
  });
  await refresh();
}

if (typeof chrome !== 'undefined' && chrome.storage) startUpdatePage();
