// Loads the extension's scripts into a jsdom window, the way the pages load them, so the
// tests call the real code. Each file runs as a classic script in the window's context
// (node:vm), as a <script> tag would: function declarations become the window's
// properties (w.givenStem), and a top-level const or let is shared with the files
// after it, as in the browser, read with value(w, 'NAME'). A name declared twice
// across files throws here, as the browser would refuse the second script.
//
//   const w = load(['i18n.js', 'i18n_strings.js', 'da_search.js']);
//   w.givenStem('Anna')
//
// Options:
//   html     a page of the extension to load as the document ('search.html'); its
//            <script> tags are not run, only `files` are
//   url      the window's address (default https://arkivet2fs.test/)
//   lang     the UI language, set as soon as i18n.js is loaded (default 'en')
//   chrome   a stub of the chrome.* APIs (default none: pages then don't start)
//   fetch    a stub for fetch() (default: every request fails, the tests are offline)
//   fast     timers wait at most 1 ms (DA's requests are spaced 1 s apart)
// AbortSignal.timeout() starts no timer: the fetch stub decides what's late, and
// jsdom's 30 s timers would keep the test process alive.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

// The scripts of search.html and linker.html, in their order (CLAUDE.md)
const SHARED = ['i18n.js', 'i18n_strings.js', 'releases.js', 'da_places.js', 'da_search.js', 'da_match.js', 'da_record.js', 'da_verify.js'];

function offlineFetch(url) {
  return Promise.reject(new Error('The tests are offline; no fetch of ' + url));
}

function load(files, options = {}) {
  const html = options.html ? fs.readFileSync(path.join(ROOT, options.html), 'utf8') : '<!doctype html><html><head></head><body></body></html>';
  const dom = new JSDOM(html, { url: options.url || 'https://arkivet2fs.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = options.fetch || offlineFetch;
  if (options.chrome) w.chrome = options.chrome;
  w.AbortSignal.timeout = () => new w.AbortController().signal;
  if (options.fast) {
    const setTimeout = w.setTimeout.bind(w);
    w.setTimeout = (fn, ms, ...args) => setTimeout(fn, Math.min(Number(ms) || 0, 1), ...args);
  }
  const context = dom.getInternalVMContext();
  w.runFile = (file) => {
    new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: path.join(ROOT, file) }).runInContext(context);
    if (file === 'i18n.js') w.uiLanguage.chosen = options.lang || 'en';
  };
  for (const file of files) w.runFile(file);
  return w;
}

// A do-nothing stub of the chrome.* APIs background.js uses at its top level. The
// install is a store's ("normal"), so the update check doesn't run; releases.test.js
// gives it more.
function chromeStub(version = '0.0.0') {
  const event = () => ({ addListener() {} });
  const area = () => ({ async get() { return {}; }, async set() {}, async remove() {} });
  return {
    action: { setTitle() {}, async setBadgeText() {}, async setBadgeBackgroundColor() {}, onClicked: event() },
    runtime: { id: 'test', onInstalled: event(), onMessage: event(), getManifest: () => ({ version }), getURL: (p) => 'chrome-extension://test/' + p },
    i18n: { getMessage: () => '' },
    storage: { local: area(), session: area(), onChanged: event() },
    tabs: { async query() { return []; }, async create() { return {}; } },
    scripting: { async executeScript() { return []; } },
    notifications: { create() {}, clear() {}, onClicked: event() },
    alarms: { async get() { return undefined; }, create() {}, onAlarm: event() },
    management: { async getSelf() { return { installType: 'normal' }; } }
  };
}

// The service worker (background.js) with what it imports (importScripts), offline
// unless options.fetch answers
function loadBackground(options = {}) {
  const w = load([], { chrome: chromeStub(), ...options });
  w.importScripts = (...files) => files.forEach(w.runFile);
  w.runFile('background.js');
  return w;
}

// A top-level const or let of the loaded files (they aren't the window's properties)
function value(w, name) {
  return w.eval(name);
}

// A saved page from tests/fixtures as a document of window `w`, as DOMParser gives it
function fixtureDoc(w, name) {
  return new w.DOMParser().parseFromString(fixture(name), 'text/html');
}

// The address a fixture was saved from (tests/capture.js writes it in the first line)
function fixtureUrl(name) {
  const m = fixture(name).match(/^<!-- (\S+)/);
  return m ? m[1] : '';
}

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

// Objects made in the jsdom window have that window's prototypes, which
// assert.deepStrictEqual tells apart from Node's; compare them as plain data
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { load, loadBackground, chromeStub, value, fixture, fixtureDoc, fixtureUrl, plain, SHARED, ROOT, FIXTURES };
