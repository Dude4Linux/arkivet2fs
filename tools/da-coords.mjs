#!/usr/bin/env node
// Writes DA_COORDS in da_places.js: where each of DA's historical municipalities
// lies, [latitude, longitude] to two decimals (about a kilometre), for the search
// page's distances (da_match.js scoreHit()).
//
//   node tools/da-coords.mjs [--from wikidata.json]
//
// The coordinates are Wikidata's for the item whose municipality number (P2504, of
// any rank: the old numbers are kept as non-preferred values) is DA's code and whose
// name is DA's (or one of SUCCESSORS', a later or other name of the same place);
// the rest are in PLACES, read from Kartverket's place names (the town, or the
// church of the parish), since Wikidata has no item of that number, or one of
// another place. A municipality that lies far from the others of its county is
// named on stderr: check it.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const FILE = new URL('../da_places.js', import.meta.url);
const QUERY = 'SELECT ?item ?itemLabel ?num ?coord WHERE { ?item p:P2504/ps:P2504 ?num . ?item wdt:P625 ?coord . '
  + 'SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en". } }';

// Wikidata's label for a code whose item has another name than DA's, where that
// item lies right (Egersund's number is Eigersund's)
export const SUCCESSORS = {
  '0421': 'Kongsvinger', '0435': 'Tolga-Os', '0616': 'Nesbyen', '1101': 'Eigersund', '1148': 'Stangeland',
  '1256': 'Meland', '1401': 'Flora', '1547': 'Aukra', '1630': 'Åfjord', '1634': 'Oppdal',
  '1641': 'Røros landsogn', '1821': 'Sandnessjøen', '2019': 'Nordkapp', '2020': 'Porsanger'
};

// From Kartverket (ws.geonorge.no/stedsnavn): the town, else the parish church
export const PLACES = {
  '0114': [59.35, 11.19], '0115': [59.23, 11.19], '0126': [59.56, 11.33], '0129': [59.35, 11.42],
  '0133': [59.18, 10.93], '0134': [59.26, 10.85], '0201': [59.52, 10.69], '0203': [59.66, 10.63],
  '0212': [59.68, 10.88], '0222': [59.80, 11.47], '0225': [60.00, 11.30], '0232': [59.96, 11.05],
  '0240': [60.48, 11.15], '0440': [62.58, 10.29], '0516': [61.75, 9.33], '0518': [61.60, 9.75],
  '0526': [60.88, 10.46], '0537': [60.78, 10.25], '0601': [60.17, 10.26], '0611': [60.09, 10.10],
  '0634': [60.27, 8.75], '0703': [59.42, 10.48], '0704': [59.35, 10.47], '0708': [59.00, 10.04],
  '0802': [59.00, 9.75], '0803': [59.05, 9.70], '0804': [59.06, 9.70], '0813': [59.12, 9.70],
  '0815': [58.86, 9.48], '0818': [59.17, 9.56], '0825': [59.85, 9.01], '1104': [59.15, 5.26],
  '1105': [59.28, 5.31], '1729': [63.87, 11.28], '1802': [65.84, 13.19], '1803': [66.31, 14.14],
  '1806': [68.24, 14.56], '2028': [70.37, 31.11], '0112': [59.19, 11.07], '0527': [60.82, 10.52]
};

// km between two [lat, lon]
export function km([a, b], [c, d]) {
  const rad = Math.PI / 180;
  const h = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const fold = (s) => s.toLowerCase().replace(/ (kommune|herred|herad)$/, '');

// Wikidata's answer → { code: [lat, lon] } for DA's municipalities, and the codes left
export function coordinates(municipalities, bindings) {
  const byCode = new Map();
  for (const b of bindings) {
    const m = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(b.coord && b.coord.value);
    if (!m) continue;
    const code = b.num.value;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push({ label: b.itemLabel.value, at: [Number(m[2]), Number(m[1])] });
  }
  const out = {};
  const missing = [];
  for (const [code, name] of Object.entries(municipalities)) {
    const want = fold(SUCCESSORS[code] || name);
    const item = PLACES[code] ? null : (byCode.get(code) || []).find((i) => fold(i.label) === want);
    const at = PLACES[code] || (item && item.at);
    if (at) out[code] = at.map((x) => Math.round(x * 100) / 100);
    else missing.push(code + ' ' + name);
  }
  return { coords: out, missing };
}

// Municipalities more than `limit` km from their county's middle (the median)
export function strays(coords, limit = 250) {
  const counties = new Map();
  for (const [code, at] of Object.entries(coords)) {
    const c = code.slice(0, 2);
    if (!counties.has(c)) counties.set(c, []);
    counties.get(c).push(at);
  }
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const out = [];
  for (const [code, at] of Object.entries(coords)) {
    const all = counties.get(code.slice(0, 2));
    const mid = [median(all.map((x) => x[0])), median(all.map((x) => x[1]))];
    const d = km(at, mid);
    if (d > limit) out.push(code + ' ' + Math.round(d) + ' km');
  }
  return out;
}

// The table as da_places.js holds it, six to a line
export function table(coords) {
  const items = Object.keys(coords).sort().map((code) => `'${code}': [${coords[code].map((x) => x.toFixed(2)).join(', ')}]`);
  const lines = [];
  for (let i = 0; i < items.length; i += 6) lines.push('  ' + items.slice(i, i + 6).join(', ') + (i + 6 < items.length ? ',' : ''));
  return 'const DA_COORDS = {\n' + lines.join('\n') + '\n};';
}

async function main(argv) {
  const source = readFileSync(FILE, 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source + '\n;this.M = DA_MUNICIPALITIES;', context);
  const from = argv.indexOf('--from');
  let json;
  if (from >= 0) json = JSON.parse(readFileSync(argv[from + 1], 'utf8'));
  else {
    const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(QUERY);
    const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'arkivet2fs-dev-tool/1.0 (https://github.com/Dude4Linux/arkivet2fs)' } });
    if (!response.ok) throw new Error('Wikidata: ' + response.status);
    json = await response.json();
  }
  const { coords, missing } = coordinates(context.M, json.results.bindings);
  if (missing.length) console.error('No coordinate (add it to PLACES): ' + missing.join(', '));
  for (const s of strays(coords)) console.error('Far from its county: ' + s);
  const start = source.indexOf('const DA_COORDS = {');
  if (start < 0) throw new Error('da_places.js has no DA_COORDS');
  const end = source.indexOf('\n};', start) + 3;
  writeFileSync(FILE, source.slice(0, start) + table(coords) + source.slice(end));
  console.log(Object.keys(coords).length + ' of ' + Object.keys(context.M).length + ' municipalities');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
