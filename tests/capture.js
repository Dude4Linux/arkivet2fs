#!/usr/bin/env node
// Saves a Digitalarkivet page in tests/private/raw/ (never published: it holds real
// names), from which tests/sanitize.js makes the fixture in tests/fixtures/da/, with
// made-up names, IDs and links. Scripts, styles and comments are removed (the tests
// never run them; the extension reads only the DOM), and the page's address goes in
// the first line, where fixtureUrl() finds it.
//
//   node tests/capture.js <name> <DA address or permanent ID>
//   node tests/capture.js burial-1854 pg00000000000000
//   node tests/capture.js search-census 'https://www.digitalarkivet.no/en/search/persons/advanced?...'
//   node tests/sanitize.js
//
// Only historical records: DA publishes censuses and church books after 100 years, and
// fixtures must not hold data on living people. Take few pages, one at a time: DA
// limits automated traffic.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [name, target] = process.argv.slice(2);
if (!name || !target || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: node tests/capture.js <name: a-z, 0-9, -> <DA address or permanent ID>');
  process.exit(2);
}
const url = /^[a-z]{2}\d{14,}$/.test(target) ? 'https://www.digitalarkivet.no/en/' + target : target;
const host = new URL(url).hostname;
if (!/(^|\.)digitalarkivet\.no$/.test(host)) {
  console.error('Only Digitalarkivet pages: ' + host);
  process.exit(2);
}

(async () => {
  const response = await fetch(url, { headers: { 'User-Agent': 'arkivet2fs-tests (fixture capture)', 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error(response.status + ' for ' + url);
  let html = (await response.text())
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // the search form's lists of every county, municipality and source (most of a
    // search page's size; nothing reads them)
    .replace(/(<select\b[^>]*>)[\s\S]*?(<\/select>)/gi, '$1$2')
    .replace(/\n\s*\n+/g, '\n');
  // A search page: only the results (the form's checkbox lists of every county and
  // source are most of its 500 KB), which is all parseResults() reads
  const results = /\/search\//.test(new URL(response.url).pathname) && html.match(/<div id="resultListContainer"[\s\S]*?(?=<\/form>)/);
  if (results) html = '<!doctype html>\n<html lang="en"><body>\n' + results[0] + '\n</body></html>\n';
  const file = path.join(__dirname, 'private', 'raw', name + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '<!-- ' + response.url + ' (captured ' + new Date().toISOString().slice(0, 10) + ') -->\n' + html);
  console.log(path.relative(process.cwd(), file) + '  ' + Math.round(html.length / 1024) + ' KB  ' + response.url);
})().catch((e) => { console.error(e.message); process.exit(1); });
