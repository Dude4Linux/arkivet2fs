// Is a name a farm near the person's places? (used by background.js personToQuery)
// A word after a patronymic is usually the farm the person lived on, but it can be a
// family or place-derived name (Lindeman), so it only counts as a farm when one of
// that name lies in the person's municipality or county. Two registers:
// - Oluf Rygh's Norske Gaardnavne (University of Oslo): the farms of the 1886
//   matrikkel, with their historical municipality and amt, which fit DA's
// - Kartverket's place-name register: today's farms and holdings (Gard, Bruk), with
//   today's municipality and county, for names Rygh lacks (Nedre Lunde)
// Uses placeCodes(), placeAliases() and municipalityCodes() from da_places.js.

const RYGH_URL = 'https://www.dokpro.uio.no/perl/navnegransking/rygh_ng/rygh_soek.prl';
const STEDSNAVN_URL = 'https://ws.geonorge.no/stedsnavn/v1/navn';
const FARM_TIMEOUT = 5000;
// Words that tell parts of a farm apart (Nedre Lunde, Søndre Berg)
const FARM_PREFIX = /^(nedre|øvre|övre|ovre|søndre|sønd|nordre|vestre|østre|store|lille|indre|ytre|mellom|mellem)\s+/i;
// Today's county numbers (Kartverket) → DA's counties: 2020–2023 and 2024 numbers
const MODERN_COUNTIES = {
  '03': ['03'], '11': ['11'], '15': ['15'], '18': ['18'],
  '30': ['01', '02', '06'], '31': ['01'], '32': ['02'], '33': ['06'], '34': ['04', '05'],
  '38': ['07', '08'], '39': ['07'], '40': ['08'], '42': ['09', '10'], '46': ['12', '13', '14'],
  '50': ['16', '17'], '54': ['19', '20'], '55': ['19'], '56': ['20']
};
// Counties searched along with another: Bergen lay in Søndre Bergenhus, Oslo in Akershus
const COUNTY_NEIGHBOURS = { '13': ['12'], '03': ['02'] };

const farmCache = new Map();
function foldFarm(s) { return (s || '').toLowerCase().trim(); }

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FARM_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(url + ': ' + response.status);
    return new TextDecoder('utf-8').decode(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

const decodeEntities = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&([aeo])(slash|elig|ring|uml|acute);/gi, (m, c, k) => ({ oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ', aring: 'å', Aring: 'Å' })[c + k] || m);
const cellText = (s) => decodeEntities(s.replace(/<[^>]*>/g, '')).trim();

// Rygh's farms of that name: [{ farm, parish, municipality, county }]. Its result
// table has a row per farm: a checkbox, the farm number, farm, parish, municipality
// (herred) and amt.
function parseRygh(html) {
  const farms = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (!/<input/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (cells.length >= 6) farms.push({ farm: cells[2], parish: cells[3], municipality: cells[4], county: cells[5] });
  }
  return farms;
}

async function ryghFarms(name) {
  const url = RYGH_URL + '?s=e&GNAVN=' + encodeURIComponent(name) +
    '&med_amt=on&med_herred=on&med_sogn=on&konkordanse_streng=hurtigliste&start=Search';
  return parseRygh(await fetchText(url));
}

// Kartverket's farms and holdings of that name: [{ farm, municipality, counties }]
async function kartverketFarms(name) {
  const data = JSON.parse(await fetchText(STEDSNAVN_URL + '?sok=' + encodeURIComponent(name) + '&treffPerSide=100'));
  return (data.navn || []).filter((n) => /^(gard|bruk)$/i.test(n.navneobjekttype) && foldFarm(n.skrivemåte) === foldFarm(name))
    .map((n) => ({
      farm: n.skrivemåte,
      municipality: ((n.kommuner || [])[0] || {}).kommunenavn || '',
      counties: (n.fylker || []).flatMap((f) => MODERN_COUNTIES[f.fylkesnummer] || [])
    }));
}

// An amt as Rygh names it ("Lister og Mandals amt", "Buskeruds amt") → DA county codes
function amtCodes(amt) {
  const name = foldFarm(amt);
  for (const form of [name, name.replace(/ amt$/, ''), name.replace(/s amt$/, '')]) {
    const codes = placeCodes(form).counties;
    if (codes.length) return codes;
  }
  return [];
}

// The municipalities and counties of the person's FS places
function placeArea(places) {
  const municipalities = new Set(places.flatMap(municipalityCodes));
  const counties = new Set([...municipalities].map((code) => code.slice(0, 2)));
  for (const place of places) {
    for (const part of place.split(',')) for (const code of placeCodes(part).counties) counties.add(code);
  }
  for (const code of [...counties]) for (const near of COUNTY_NEIGHBOURS[code] || []) counties.add(near);
  return { municipalities, counties };
}

// A farm lies in the area when its municipality or county is one of the person's
function farmInArea(farm, area) {
  const municipalities = placeCodes(farm.municipality).municipalities;
  const counties = farm.counties || amtCodes(farm.county);
  return municipalities.some((code) => area.municipalities.has(code)) || counties.some((code) => area.counties.has(code));
}

// The farms of that name, from Rygh and then Kartverket when Rygh has none in the
// area (cached by name)
async function farmsNamed(name, area) {
  if (!farmCache.has(name)) farmCache.set(name, {});
  const cached = farmCache.get(name);
  // A register that doesn't answer is left out (and asked again next time); an error
  // only when neither answers
  const ask = async (key, lookup) => {
    if (!cached[key]) { try { cached[key] = await lookup(name); } catch (error) { return { error }; } }
    return { farms: cached[key] };
  };
  const rygh = await ask('rygh', ryghFarms);
  if (rygh.farms && rygh.farms.some((f) => !area || farmInArea(f, area))) return rygh.farms;
  const kartverket = await ask('kartverket', kartverketFarms);
  if (rygh.error && kartverket.error) throw kartverket.error;
  return [...(rygh.farms || []), ...(kartverket.farms || [])];
}

// Is `name` a farm in the person's places? With no places, any farm of that name
// counts (anywhere: true). Returns { farm: true|false, where, error }: where is the
// farm found ("Hægebostad, Lister og Mandals amt"); error is set when neither register
// answered, and then farm is false.
async function farmNear(name, places, anywhere = false) {
  places = places.filter(Boolean);
  const area = places.length ? placeArea(places) : null;
  if (!area && !anywhere) return { farm: false };
  const names = [name, name.replace(FARM_PREFIX, '')].filter((n, i, all) => n && all.indexOf(n) === i);
  try {
    for (const n of names) {
      const farms = await farmsNamed(n, area);
      const found = area ? farms.find((f) => farmInArea(f, area)) : farms[0];
      if (found) return { farm: true, where: [found.municipality, found.county].filter(Boolean).join(', ') };
    }
    return { farm: false };
  } catch (error) {
    return { farm: false, error: String(error) };
  }
}
