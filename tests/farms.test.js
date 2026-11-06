// farms.js: reading Rygh's farm table, and telling a farm from a family name. The
// registers aren't asked: fetch answers with saved-style pages.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackground, plain } = require('./harness.js');

const RYGH_ROW = (farm, parish, municipality, amt) =>
  `<tr><td><input type="checkbox"></td><td>142</td><td>${farm}</td><td>${parish}</td><td>${municipality}</td><td>${amt}</td></tr>`;
const RYGH_PAGE = (rows) => '<table><tr><th>Gnr.</th><th>Gard</th></tr>' + rows.join('') + '</table>';

// Rygh knows Solbakken in Vågå and Lindeman nowhere; Kartverket knows nothing
function registers() {
  const asked = [];
  const fetch = async (url) => {
    asked.push(String(url));
    if (/dokpro/.test(url)) {
      const name = new URL(url).searchParams.get('GNAVN');
      return new Response(RYGH_PAGE(name === 'Solbakken' ? [RYGH_ROW('Solbakken', 'V&aring;g&aring;', 'V&aring;g&aring;', 'Kristians amt')] : []));
    }
    return new Response(JSON.stringify({ navn: [] }));
  };
  return { fetch, asked };
}

test("parseRygh(): a row per farm, entities decoded", () => {
  const farms = plain(loadBackground().parseRygh(RYGH_PAGE([RYGH_ROW('Moen', 'V&aring;g&aring;', 'V&aring;g&aring;', 'Kristians amt'),
    RYGH_ROW('Moen', 'L&oslash;m', 'L&oslash;m', 'Kristians amt')])));
  assert.deepEqual(farms, [
    { farm: 'Moen', parish: 'Vågå', municipality: 'Vågå', county: 'Kristians amt' },
    { farm: 'Moen', parish: 'Løm', municipality: 'Løm', county: 'Kristians amt' }
  ]);
});

test("amtCodes(): Rygh's amt names as DA counties", () => {
  const w = loadBackground();
  assert.deepEqual(plain(w.amtCodes('Kristians amt')), ['05']);
  assert.deepEqual(plain(w.amtCodes('Nowhere amt')), []);
});

test('farmNear(): a farm in the person\'s places', async () => {
  const { fetch } = registers();
  const w = loadBackground({ fetch });
  assert.equal((await w.farmNear('Solbakken', ['Vågå, Oppland, Norway'])).farm, true);
  assert.equal((await w.farmNear('Solbakken', ['Bergen, Hordaland, Norway'])).farm, false);
  assert.equal((await w.farmNear('Lindeman', ['Vågå, Oppland, Norway'])).farm, false);
});

test('farmNear(): without places, only with `anywhere`', async () => {
  const { fetch, asked } = registers();
  const w = loadBackground({ fetch });
  assert.equal((await w.farmNear('Solbakken', [])).farm, false);
  assert.equal(asked.length, 0);
  assert.equal((await w.farmNear('Solbakken', [], true)).farm, true);
});

test('farmNear(): a register that fails is no farm, with the error', async () => {
  const w = loadBackground();
  const result = await w.farmNear('Solbakken', ['Vågå, Oppland, Norway']);
  assert.equal(result.farm, false);
  assert.ok(result.error);
});
