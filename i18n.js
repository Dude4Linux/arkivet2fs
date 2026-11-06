// The extension's languages: English, Norwegian Bokmål and Nynorsk, as on DA.
// Loaded first by search.html and linker.html, and by background.js (importScripts).
// Only function declarations at the top level (the jsdom tests eval each file on its
// own and see no other file's consts); the strings are in i18n_strings.js.
//
// t('English text', {name: ...}) gives the text in the user's language: the English
// text is the key, {name} a placeholder, and English the fallback for a text without a
// translation. The source itself (title, citation, notes) stays in English; see
// plan.md, Phase 4.

// The languages, as the menu shows them
function uiLanguages() {
  return [['en', 'English'], ['nb', 'Norsk (bokmål)'], ['nn', 'Norsk (nynorsk)']];
}

// A browser's language list → 'en', 'nb' or 'nn': the first of them the extension has
// (nn Nynorsk; nb or no Bokmål; en English), else English
function languageFromList(list) {
  for (const tag of list || []) {
    const code = String(tag || '').toLowerCase();
    if (/^nn\b/.test(code)) return 'nn';
    if (/^(nb|no)\b/.test(code)) return 'nb';
    if (/^en\b/.test(code)) return 'en';
  }
  return 'en';
}

// The user's language: the one chosen in the menu (localStorage, shared by the
// extension's pages; the service worker reads chrome.storage.local with
// loadUiLanguage()), else the browser's. Kept in uiLanguage.chosen (tests set it).
function uiLanguage() {
  if (uiLanguage.chosen) return uiLanguage.chosen;
  let saved = null;
  try { saved = localStorage.getItem('arkivet2fs.lang'); } catch (e) { /* no localStorage (service worker) */ }
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  uiLanguage.chosen = ['en', 'nb', 'nn'].includes(saved) ? saved
    : languageFromList(nav.languages && nav.languages.length ? nav.languages : [nav.language]);
  return uiLanguage.chosen;
}

// The language chosen in the menu, kept for the pages and the service worker
function setUiLanguage(lang) {
  if (!['en', 'nb', 'nn'].includes(lang)) return;
  try { localStorage.setItem('arkivet2fs.lang', lang); } catch (e) { /* unavailable */ }
  try { if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ lang }); } catch (e) { /* unavailable */ }
  uiLanguage.chosen = lang;
}

// For the service worker (no localStorage): the chosen language, else the browser's
async function loadUiLanguage() {
  uiLanguage.chosen = null;
  try {
    const { lang } = await chrome.storage.local.get('lang');
    if (['en', 'nb', 'nn'].includes(lang)) uiLanguage.chosen = lang;
  } catch (e) { /* the browser's */ }
  return uiLanguage();
}

// The text in the user's language, with {name} placeholders filled from `params`
function t(text, params) {
  const lang = uiLanguage();
  let out = text;
  if (lang !== 'en') {
    const entry = i18nStrings()[text];
    if (entry && entry[lang === 'nn' ? 1 : 0]) out = entry[lang === 'nn' ? 1 : 0];
  }
  if (params) out = out.replace(/\{(\w+)\}/g, (all, key) => (key in params ? String(params[key]) : all));
  return out;
}

// A message made elsewhere in English (da_record.js and fs_attach.js run in DA's and
// FS's pages, without this file): the whole text, or "Prefix: detail" with a
// translation of "Prefix: {detail}" ("Invalid permanent ID format: pdX")
function tMessage(text) {
  if (!text || uiLanguage() === 'en' || hasTranslation(text)) return t(text);
  const m = String(text).match(/^(.*?): (.*)$/s);
  if (m && hasTranslation(m[1] + ': {detail}')) return t(m[1] + ': {detail}', { detail: m[2] });
  return text;
}

// Whether the text has a translation in the user's language (English: always)
function hasTranslation(text) {
  const lang = uiLanguage();
  if (lang === 'en') return true;
  const entry = i18nStrings()[text];
  return !!(entry && entry[lang === 'nn' ? 1 : 0]);
}

// The strings: i18n_strings.js's table, or none (English) without it
function i18nStrings() {
  return typeof i18nTable === 'function' ? (i18nStrings.table || (i18nStrings.table = i18nTable())) : {};
}

// A date as the language writes it: "6 April 1845" / "6. april 1845", "May 1779" /
// "mai 1779" (`day` may be empty)
function formatDate(year, month, day) {
  const en = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const no = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const m = Number(month) - 1;
  if (!(m >= 0 && m < 12)) return '';
  const d = day ? String(Number(day)) : '';
  if (uiLanguage() === 'en') return [d, en[m], year].filter(Boolean).join(' ');
  return [d ? d + '.' : '', no[m], year].filter(Boolean).join(' ');
}

// A DA page in the user's language: Bokmål has no prefix, Nynorsk /nn/, English /en/.
// Only for links the user opens: the extension reads DA's English pages.
function daPageUrl(url) {
  const lang = uiLanguage();
  if (!url || lang === 'en') return url;
  return String(url).replace(/^(https?:\/\/(?:www\.)?digitalarkivet\.no)\/(?:en|nn)(?=\/|$)/,
    (all, host) => host + (lang === 'nn' ? '/nn' : ''));
}

// An FS page in the user's language (FS has one Norwegian, /no/), for links the user
// opens; the linker's steps on FS use the English pages
function fsPageUrl(url) {
  if (!url || uiLanguage() === 'en') return url;
  return String(url).replace(/^(https:\/\/www\.familysearch\.org)\/en(?=\/)/, '$1/no');
}

// Translate the page: the text of each element marked data-i18n (its own text nodes,
// so a label keeps its input), the attributes listed in data-i18n-attr, and <html lang>
function localizePage(root) {
  const doc = root ? root.ownerDocument || root : document;
  const lang = uiLanguage();
  doc.documentElement.lang = lang;
  for (const node of (root || doc).querySelectorAll('[data-i18n]')) {
    for (const child of node.childNodes) {
      if (child.nodeType !== 3 || !child.textContent.trim()) continue;
      const text = child.textContent;
      const key = text.replace(/\s+/g, ' ').trim();
      child.textContent = text.match(/^\s*/)[0] + t(key) + text.match(/\s*$/)[0];
    }
  }
  for (const node of (root || doc).querySelectorAll('[data-i18n-attr]')) {
    for (const name of node.getAttribute('data-i18n-attr').split(',')) {
      const value = node.getAttribute(name.trim());
      if (value) node.setAttribute(name.trim(), t(value));
    }
  }
}

// The language menu for a page's header: choosing another language keeps it and
// reloads the page (the search page's criteria are in its address; the linker reads
// its record again)
function languageMenu() {
  const doc = document;
  const select = doc.createElement('select');
  select.className = 'language';
  select.setAttribute('aria-label', t('Language'));
  for (const [code, name] of uiLanguages()) {
    const option = doc.createElement('option');
    option.value = code;
    option.textContent = name;
    select.append(option);
  }
  select.value = uiLanguage();
  select.addEventListener('change', () => {
    setUiLanguage(select.value);
    location.reload();
  });
  return select;
}
