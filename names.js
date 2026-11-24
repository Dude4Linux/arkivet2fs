// Norwegian names as the church books, DigitalArkivet and FamilySearch write them: the
// patronymic and its abbreviations, a patronymic joined to the farm by a hyphen, the
// colon as an abbreviation mark, the words DA's transcribers struck out and their two
// readings. The one place for these rules: background.js (importScripts, and injected
// into DA's page before da_record.js), search.html and linker.html load it first.
// It uses no other file and declares only functions, since it's injected again on
// every click (a second top-level const would throw).

// A patronymic's ending: a genitive s and -sen/-søn/-son, -datter/-dotter or the church
// books' abbreviations of it (-daatter, -dattr., -datt., -datr., -dat., -dtr., -dr.,
// -d:r, -d.: Johannesdat. is Johannesdatter); -datter, -dotter and -dtr. also without
// the s, after two letters or more ("Knutdatter"; not the word "Datter"). The match's
// [1] is the s ('' without), [2] the ending; null for a word that isn't one.
function patronymicMatch(word) {
  const w = String(word || '');
  return w.match(/(s)(en|øn|on|datter|dotter|daatter|dattr\.?|datt\.?|datr\.?|dat\.?|dtr\.?|dr\.?|d:r\.?|d\.?)$/i)
    || w.match(/(?<=\p{L}{2})()(datter|dotter|daatter|dtr\.?)$/iu);
}
function isPatronymic(word) { return Boolean(patronymicMatch(word)); }
// The father's name in a patronymic (Halvorsen → Halvor, Olsdr. → Ol, Knutdatter →
// Knut); another word as it is
function patronymicBase(word) {
  const m = patronymicMatch(word);
  return m ? String(word).slice(0, m.index) : String(word || '');
}
// The patronymic with its genitive s, without the ending (Aslaksen → Aslaks,
// Tollefsdatter → Tollefs), the stem a search or a spelling is made from
function patronymicStem(word) {
  const m = patronymicMatch(word);
  return m ? String(word).slice(0, m.index) + m[1] : String(word || '');
}
// The sex a patronymic tells: 'Male' (-sen, -søn, -son), 'Female' (-datter and its
// abbreviations), '' for a word that isn't one
function patronymicSex(word) {
  const m = patronymicMatch(word);
  return !m ? '' : /^[eøo]n$/i.test(m[2]) ? 'Male' : 'Female';
}

// A name's words, a patronymic joined to the farm by a hyphen split there ("Marte
// Olsdtr-Moen" and "Marte Olsdtr- Moen": Marte, Olsdtr, Moen)
function nameWords(name) {
  return String(name || '').split(/\s+/).filter(Boolean)
    .flatMap((w) => { const m = w.match(/^(.+?)-(.*)$/); return m && isPatronymic(m[1]) ? [m[1], m[2]] : [w]; })
    .filter(Boolean);
}

// A name as {given, surname, rest}, by the patronymic convention: the given names run
// up to the patronymic, which is the surname, and the words after it (a farm, an
// address, a family name) are `rest` ("Tollef Johansen Rysstad" → Tollef, Johansen,
// Rysstad). Without a patronymic the last word is the surname ("Maren Kristine
// Lindeman"), and a name of one word is a given name. Of two patronymics or more the
// first is the surname, or the first that `prefer(word)` takes (the record's father's:
// "Astri Pedersdatter Larsdatter", father Lars), the others staying in `rest`.
function splitName(name, prefer) {
  const words = nameWords(name);
  const at = words.map((w, i) => (i > 0 && isPatronymic(w) ? i : -1)).filter((i) => i > 0);
  if (at.length) {
    const k = (prefer && at.find((i) => prefer(words[i]))) || at[0];
    return { given: words.slice(0, at[0]).join(' '), surname: words[k],
      rest: words.slice(at[0]).filter((w, i) => i + at[0] !== k).join(' ') };
  }
  if (words.length > 1) return { given: words.slice(0, -1).join(' '), surname: words[words.length - 1], rest: '' };
  return { given: words.join(' '), surname: '', rest: '' };
}

// A colon closing a word of a name: the church books' abbreviation mark, which DA's
// transcriptions keep ("Larsdat:" for Larsdatter, "Halvorsd:"); written as a point, as
// DA writes the other abbreviations ("Larsdat."), so it reads as one. "d:r" inside a
// word stays.
function abbreviationPoint(name) {
  return String(name || '').replace(/(\p{L}):(?=\s|$)/gu, '$1.');
}

// A name without what the source struck out (DA's "%...%"), two readings DA gives
// ("Even@Sven") as "Even/Sven", as the source's title has them
function stripNameVariants(name) {
  return String(name || '').replace(/%[^%]*%/g, ' ').replace(/(\S)@(?=\S)/g, '$1/').replace(/\s+/g, ' ').trim();
}
