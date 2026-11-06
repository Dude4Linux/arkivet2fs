#!/usr/bin/env node
// Signs a release with the maintainer's Ed25519 key, on the maintainer's machine (the
// key never goes to GitHub). Run it in a terminal, since it asks for the key's passphrase.
//
//   node tools/sign.mjs --new-key        make the key pair: the private key in
//                                        ~/.config/arkivet2fs/release-key.pem (encrypted,
//                                        mode 600), the public key in keys/release.pub
//   node tools/sign.mjs v1.2.0           sign the draft release v1.2.0 on GitHub
//   node tools/sign.mjs v1.2.0 --local   build and sign the tag into dist/, no GitHub
//
// For a draft release it downloads the packages release.yml built, builds the same tag
// here, and signs only when the two are byte for byte the same. It then uploads a .sig
// for each package, SHA256SUMS and SHA256SUMS.sig. Publishing the draft is left to you.
// Another key file: --key <path> or ARKIVET2FS_SIGNING_KEY. Without a terminal the
// passphrase comes from ARKIVET2FS_KEY_PASSPHRASE.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAll, checkTag } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_KEY = path.join(ROOT, 'keys', 'release.pub');
const DEFAULT_KEY = path.join(os.homedir(), '.config', 'arkivet2fs', 'release-key.pem');
const REPO = 'Dude4Linux/arkivet2fs';

export function sign(data, privateKey) {
  return crypto.sign(null, data, privateKey).toString('base64') + '\n';
}

export function verify(data, sig, publicKey) {
  try { return crypto.verify(null, data, publicKey, Buffer.from(String(sig).trim(), 'base64')); } catch { return false; }
}

// "hex  name" lines, as sha256sum writes them
export function sha256sums(files) {
  return files.map(({ name, data }) => crypto.createHash('sha256').update(data).digest('hex') + '  ' + name + '\n').join('');
}

// The signature files of some packages: name.sig each, SHA256SUMS (of the packages and
// their signatures) and SHA256SUMS.sig
export function signatureFiles(packages, privateKey) {
  const sigs = packages.map((p) => ({ name: p.name + '.sig', data: Buffer.from(sign(p.data, privateKey)) }));
  const sums = Buffer.from(sha256sums([...packages, ...sigs]));
  return [...sigs, { name: 'SHA256SUMS', data: sums }, { name: 'SHA256SUMS.sig', data: Buffer.from(sign(sums, privateKey)) }];
}

export function fingerprint(publicKey) {
  return crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
}

// Reads a secret from the terminal without echo
function askSecret(prompt) {
  if (!process.stdin.isTTY) {
    if (process.env.ARKIVET2FS_KEY_PASSPHRASE != null) return Promise.resolve(process.env.ARKIVET2FS_KEY_PASSPHRASE);
    return Promise.reject(new Error('no terminal to ask for the passphrase (run it in a terminal, or set ARKIVET2FS_KEY_PASSPHRASE)'));
  }
  return new Promise((resolve, reject) => {
    process.stderr.write(prompt);
    const input = process.stdin;
    let text = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const done = (err) => { input.setRawMode(false); input.pause(); input.removeListener('data', onData); process.stderr.write('\n'); err ? reject(err) : resolve(text); };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done();
        if (ch === '\u0003') return done(new Error('cancelled'));
        if (ch === '\u007f' || ch === '\b') text = text.slice(0, -1);
        else text += ch;
      }
    };
    input.on('data', onData);
  });
}

async function readPrivateKey(file) {
  if (!fs.existsSync(file)) throw new Error(`no signing key at ${file} (make one with --new-key)`);
  const pem = fs.readFileSync(file, 'utf8');
  if (!pem.includes('ENCRYPTED')) return crypto.createPrivateKey(pem);
  const passphrase = await askSecret(`Passphrase for ${file}: `);
  try { return crypto.createPrivateKey({ key: pem, passphrase }); } catch { throw new Error('wrong passphrase, or not a key file'); }
}

function publicKeyAt(ref) {
  try {
    return crypto.createPublicKey(execFileSync('git', ['show', `${ref}:keys/release.pub`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { return null; }
}

async function newKey(file) {
  if (fs.existsSync(file)) throw new Error(`${file} already exists; not replacing it`);
  if (fs.existsSync(PUBLIC_KEY)) throw new Error(`${PUBLIC_KEY} already exists; not replacing it`);
  const pass = await askSecret('New passphrase for the signing key: ');
  if (pass.length < 12) throw new Error('use a passphrase of at least 12 characters');
  if (await askSecret('The same passphrase again: ') !== pass) throw new Error('the passphrases differ');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: pass }), { mode: 0o600, flag: 'wx' });
  fs.mkdirSync(path.dirname(PUBLIC_KEY), { recursive: true });
  fs.writeFileSync(PUBLIC_KEY, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
  console.log(`Private key: ${file} (keep a backup somewhere safe and offline; losing it means a new pinned key)`);
  console.log(`Public key:  ${PUBLIC_KEY} (commit it)`);
  console.log(`Fingerprint: SHA-256 ${fingerprint(publicKey)}`);
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { cwd: ROOT, maxBuffer: 64 << 20, ...opts });
}

async function signRelease(tag, keyFile, local) {
  checkTag(tag);
  const packages = buildAll(`${tag}^{commit}`);
  // The key must be the one committed: the tag's, or HEAD's for a tag made before
  // there was a key (v1.1.3)
  const pinned = publicKeyAt(`${tag}^{commit}`) || publicKeyAt('HEAD');
  if (!pinned) throw new Error('keys/release.pub isn\'t committed; commit the public key first');

  let outDir;
  if (local) {
    outDir = path.join(ROOT, 'dist');
    fs.mkdirSync(outDir, { recursive: true });
    for (const p of packages) fs.writeFileSync(path.join(outDir, p.name), p.data);
  } else {
    const info = JSON.parse(gh(['release', 'view', tag, '--repo', REPO, '--json', 'isDraft,assets']).toString());
    if (!info.isDraft) throw new Error(`the release ${tag} is published already; only a draft is signed`);
    const names = info.assets.map((a) => a.name);
    const expected = packages.map((p) => p.name);
    const extra = names.filter((n) => !expected.includes(n));
    if (extra.length) throw new Error(`the draft has assets this build doesn't make: ${extra.join(', ')} (signed already? delete them first)`);
    const missing = expected.filter((n) => !names.includes(n));
    if (missing.length) throw new Error(`the draft lacks ${missing.join(', ')}`);
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkivet2fs-sign-'));
    gh(['release', 'download', tag, '--repo', REPO, '--dir', outDir]);
    for (const p of packages) {
      const theirs = fs.readFileSync(path.join(outDir, p.name));
      if (!theirs.equals(p.data)) throw new Error(`${p.name} on GitHub differs from the local build of ${tag}; not signing`);
      console.log(`${p.name}: the same as the local build (${p.data.length} bytes)`);
    }
  }

  const key = await readPrivateKey(keyFile);
  const pub = crypto.createPublicKey(key);
  if (fingerprint(pub) !== fingerprint(pinned)) throw new Error(`the key ${keyFile} isn't the one in ${tag}'s keys/release.pub`);
  const sigs = signatureFiles(packages, key);
  const all = [...packages, ...sigs];
  for (const p of packages) {
    if (!verify(p.data, all.find((f) => f.name === p.name + '.sig').data, pinned)) throw new Error('a fresh signature does not verify');
  }
  const written = sigs.map((f) => { const file = path.join(outDir, f.name); fs.writeFileSync(file, f.data); return file; });
  if (local) {
    console.log('Signed into ' + outDir + ': ' + sigs.map((f) => f.name).join(', '));
    return;
  }
  gh(['release', 'upload', tag, '--repo', REPO, ...written]);
  console.log(`Uploaded ${sigs.map((f) => f.name).join(', ')} to the draft ${tag}.`);
  console.log(`Check the draft, then publish it: gh release edit ${tag} --repo ${REPO} --draft=false`);
}

async function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; };
  const keyFile = path.resolve(opt('--key') || process.env.ARKIVET2FS_SIGNING_KEY || DEFAULT_KEY);
  if (argv.includes('--new-key')) return newKey(keyFile);
  const tag = argv.find((a) => /^v\d/.test(a));
  if (!tag) throw new Error('usage: node tools/sign.mjs vX.Y.Z [--local] [--key file] | --new-key');
  return signRelease(tag, keyFile, argv.includes('--local'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => { console.error('sign: ' + e.message); process.exit(1); });
}
