# Changelog

One section per version. The release notes on GitHub come from here, so write for
the people who use the extension. The version is in `manifest.json` (MAJOR.MINOR.PATCH:
fixes, new features, changes that break what users have).

## 1.8.3 - not released yet

- **Marriages attached to the couple:** a marriage's source now goes to the couple's
  relationship on FamilySearch too, as FamilySearch attaches its own marriage records,
  besides the groom and the bride. When FamilySearch doesn't have the two as a couple,
  the log says so, and the source is attached to each of them. The linker waits for
  FamilySearch's dialog to show the two people, so a dialog still loading
  ("[UNKNOWN NAME]") is no longer taken for another couple.
- **Facts saved without their place:** a birth or residence whose place the linker
  gives in FamilySearch's own form ("Fredrikshald, Smaalenene, Norway") was saved with
  no place at all, though the log said it was done. FamilySearch has no entry of its
  own for such a text, and a place only typed in is saved as none; the linker now
  chooses FamilySearch's entry of that name. A fact FamilySearch saves without its
  place is now an error in the log, so you can add the place by hand.
- **Towns by their names of the time:** a renamed town gets the name it had in the
  record's year, as FamilySearch's places have it: a record of 1874 from Halden gives
  "Fredrikshald, Smaalenene, Norway", one of 1925 "Fredrikshald, Østfold, Norway"
  (the county renamed in 1919, the town Halden in 1928), Oslo from 1877 to 1924
  "Kristiania, Norway" and otherwise "Oslo, Norway" (a city in no county; FamilySearch
  has no Christiania), and Trondheim before 1919 "Trondheim, Søndre Trondhjem, Norway"
  (FamilySearch keeps the town's present name there, under the county of the time).
  A clerk's abbreviation of a town ("Fhald", "Fr.hald", "Thjem")
  is read as the town and written in full: "Fredrikshald" in the people's facts, "Fhald
  [Fredrikshald]" in the notes. It used to be taken for a farm called Fhald. A
  residence added to the tree keeps the record's name in its description ("Fhald"),
  with the town as its place. A town's parish, which DigitalArkivet names by the
  town's present name ("Church book from Halden parish"), is the town of the
  record's year too: a christening in 1875, and the birth of a baptized child the
  record gives no birthplace for, are in Fredrikshald. Where FamilySearch has the town
  of a birth, christening, death or burial under another of its names ("Halden,
  Østfold, Norway" for 1875), the linker offers to change it to the name of that
  year, and saves the change (it took the two names for the same place and left the
  fact unchanged). That is also so for a place FamilySearch hasn't standardized, the
  town and its county without the country ("Halden, Østfold").
- **A baptism dated before the birth:** when a record gives the child's date of birth
  with its year and is dated before it (born 29 July, baptized 12 March of the same
  year), the year is a slip, the clerk's or the transcriber's. The linker no longer
  offers to change the christening on FamilySearch to the wrong year: it keeps
  FamilySearch's date, or, when FamilySearch has no christening, takes the day in the
  year after the birth. The people's facts show the slip ("12 March 1892 (before the
  birth, 29 July 1892: read as 12 March 1893)"), and the source's notes say it in a
  remark; the title and citation keep the date as DigitalArkivet has it.
- Names are read by one set of rules everywhere (the search, the record pages, the
  linker): a patronymic in any of the church books' abbreviations ("Larsdat.",
  "Pedersd:r", "Olsdaatter"), one written without the genitive s ("Knutdatter"), and one
  joined to the farm by a hyphen ("Olsdtr-Moen"). Before, the search page, the
  FamilySearch entry and the linker each knew a different set, so a patronymic one of
  them read could be taken for a farm or a family name by another, or tell no sex.
- The source's title names a town's parish by the town's name of the record's year
  ("Fredrikshald parish 1869-1884 (0101P)" for a baptism in 1875); the citation still
  names the church book as the National Archives do ("Halden parish"). A source made
  before under the present name is found in your SourceBox and given the new title
  when you open the record in the linker again.
- **Church books with DigitalArkivet's newer titles** ("Parish register (official) for
  Halden parish 1845-1856", with no parish code after it) are now read as the parish's:
  a town's parish gets the name of the record's year in the source's title and in the
  places of its facts, the citation names the parish ("Norway, Østfold, Halden Parish,
  …"), and the search page weighs these hits by their parish's distance and pairs an
  entry found in both of the parish's church books. Before, the parish in such a
  title was missed, so rerunning the linker on a baptism in Halden kept "Halden
  parish" in the title.
- **The citation in three lines:** the record's description and the archive, then the
  Permanent ID with its link and the day you accessed it, then the scanned image with
  its link ("Scanned image: kb…"), so the IDs are easy to find. A source made before
  is given the new form when you open its record in the linker again and update it.
- In the linker's list of fields that differ from the source in your SourceBox, the
  choice now says "Use the record's (as below)": the record's fields are below it.
- **A colon closing a name:** the church books' abbreviation mark, kept in DA's
  transcriptions ("Larsdat:" for Larsdatter), is written as a point ("Larsdat.") in the
  title, the citation, the notes and the names offered for FamilySearch, and the
  abbreviated patronymic is read as one.
- **A new source mixed up with the one made just before it:** after "Create source",
  the linker could take the source created a moment earlier for the new one, and
  attach that one instead (report #13). It now takes only the new source with this
  record's title, and stops before attaching anything when FamilySearch doesn't list
  it.
- **Royal resolutions (Danske kanselli):** a letter's title and source date no longer
  hold the letter's permanent ID ("Type of letter, oc…"). They now name it a letter and
  give the record's year, and "Hele Norge" (all of Norway) is not used as a county.
- **Boje written Boj:** a search for Boje (or Boye, Boie), or with him as a parent or
  spouse, now finds the records that write him "Boj".
- **Children's baptisms in birth order:** the baptisms that name a child you have in
  FamilySearch come first, eldest first, even when one scores lower (a first child's
  baptism that names no mother).
- **Children's burials:** a new search, and a group of its own, for the burials of
  the person's children, which church books often record under the father's name
  alone. Before, they turned up only under "All records under the name", if at all.
- **A namesake brother or sister:** when FamilySearch has the person you came from
  dead before the record, or christened years from it (a child named after a brother
  who died), the linker no longer pairs them with the record's person. It reads the
  parents' families on FamilySearch and pairs the brother or sister of that name who
  fits instead, and the row says why; you can still choose the first one by hand.
- **A child the record gives no name:** in a burial or baptism of an unnamed child
  ("!! Halvorsd.*"), the linker no longer pairs the child with the FamilySearch child
  whose name looks like the patronymic DA added. Which child it is, the record can't
  tell, so the row names the children it could be (born by the burial, not dead in
  another year) for you to choose from, and the search page no longer counts it as
  one of your children.
- **Alternate names searched in the person's places first:** when a record wasn't
  found under the person's name in their parish or county, the search tried that name
  in all of Norway before the alternate names you have in FamilySearch, and a
  namesake elsewhere could end the search (an 1801 census entry under a family name
  was never looked for). The alternate names and other spellings are now searched in
  the person's places first.
- **Hits weighed by distance:** a hit that names none of the person's places is now
  scored by how far its parish lies from the nearest place known to be theirs: the
  places in FamilySearch, the records you have attached to them with the linker, and
  the records whose page names their parents or spouse. A neighbouring parish counts a
  little in its favour ("Heidal, 19 km from Vågå"), one 100 km away a little against,
  and the other end of the country more, so the person's own records rise above a
  namesake's far away when the search had to look in all of Norway.
- **"ektemann"** (the husband, in a church book's churching list) is "Husband" in the
  notes.
- **"Kiæresten" (the betrothed)** in a position is no longer offered as an occupation,
  and the notes give "[betrothed]" after it.
- **A relative's patronymic and farm:** a parent or spouse whose name in FamilySearch
  has both ("Marte Olsdtr-Moen", or the patronymic among the given names) now has both
  as the surname, so records naming her either way count for her, and one with another
  patronymic counts against. A mother or wife of another given name that only starts
  the same (Maria, Mari or Marie for Marte) no longer counts as close to her, so other
  men's children's baptisms aren't listed among the person's.
- **A changed birth date saved as the old one:** when the linker changed a date
  FamilySearch has (a birth year that is wrong there), FamilySearch's list of dates
  could still show the old date, and the linker picked it, saved the fact unchanged,
  and logged it as done. It now picks only the date the record gives, and if
  FamilySearch shows another year after saving, the log says so instead.
- **"Continue without explaining your changes?":** FamilySearch asks this when a fact
  is changed with the reason it has already (one an earlier run saved), and the
  linker stopped there until you clicked Yes. It now answers Yes itself.

## 1.8.2 - 2026-11-21

- **Places as the record writes them:** a changed or added fact, and a new person,
  keep the record's place names (FamilySearch recognizes most of them and
  standardizes them itself). "Check with FamilySearch" shows FamilySearch's standard
  place beside it. Dates are still FamilySearch's standard ones.
- **A changed christening** no longer puts FamilySearch's "Østre Moss" inside the
  record's "Moss". A place with a direction word (Østre, Nordre, Søndre, Vestre, Øvre,
  Nedre, ...) before the record's place already names it, and is kept with its
  Norwegian letters. The same date in another form ("23 AUG 1846") is no change.
- **Update source only** (and Create source only) now saves the ticked changes for
  the people who have the source, and says why for those who don't.
- **A birth without a place:** FamilySearch won't save a birth added without one. A
  baptized child's birth that the record gives no place for is now put in the parish,
  and the linker says so when a ticked birth has no place.
- **Names the transcribers couldn't read:** DigitalArkivet writes "!!" for a missing
  name and "??" for illegible letters. These are no longer taken for names: they
  never count against a match, a parent "!! Larsdatter" with the right surname counts
  as close and is paired, and they are never offered as an alternate name. The own
  baptism search also tries a parent's surname alone, in each spelling.
- **DigitalArkivet's other signs:** two readings ("Even@Sven", shown "Even/Sven") match
  a name by either; struck-out words and the transcriber's notes ("E:") are left out
  of places and occupations. The source notes end with what each sign used in them
  means.
- **A child without a name in the source** is titled "son of <father>" ("daughter of",
  "child of"); paired with a tree person, the title takes their FamilySearch name.
- A relation written in the position ("Serg. Halvor Larsens D.B.", the sergeant's
  boy) is no longer offered as an occupation.
- Old spellings with y or i between vowels match (Eyolf, Eiolf, Ejolf; Tøiesen,
  Tojesen for Toyesdr), so a spouse written either way is recognized.

## 1.8.1 - 2026-11-17

- **Send report:** choosing one of your browser's saved e-mail addresses now fills in
  the address box. In Brave (and other Chromium browsers) the suggestion was shown but
  picking it left the box empty.
- **Create source and attach** no longer says "The SourceBox could not be searched for
  the title" when the source isn't in your SourceBox yet. On a SourceBox just opened,
  FamilySearch could ignore the first search; the extension now searches again.
- The extension's description (in the browser's extensions page and the Chrome Web
  Store) now says it is for genealogy.

## 1.8.0 - 2026-11-16

- **One package for every browser and store:** the release's download is now
  `arkivet2fs-X.Y.Z.zip` (no more "chromium" in the name), with the extension's files
  right inside it. Unzip it into a folder named just `arkivet2fs`, replacing its files,
  for instance `unzip -o ~/Downloads/arkivet2fs-1.8.0.zip -d ~/arkivet2fs`; keep using
  the same folder, since the browser keeps your stored persons and records by its
  place. The Updates page's steps say so.
- A copy of 1.7.0 or older doesn't offer this update (it looks for the old file name):
  download 1.8.0 from the release page and unzip it into the folder that copy was loaded
  from.

## 1.7.0 - 2026-11-16

- **Send report**, at the top of the search page and the linker, sends a problem
  report straight to the developer, in place of the "Report on GitHub" link. It opens
  a panel with the report to read and edit first: take out anything about living
  people, write what went wrong in the "What happened?" box below it (it goes into the
  report when you send it), and add an e-mail address if you'd like an answer. Nothing is sent until you click **Send**. The report goes to a
  private queue that only the developer reads, not to a public GitHub issue. If it
  can't be sent, the panel offers to copy it and open a GitHub issue instead. **Copy
  report** is still there.
- Firefox asks before a report is sent, since the extension now declares the data it
  sends: the records' and the tree's content always (that is what a source is made
  of), and with a report, technical data and, if you give it, your e-mail address.
- A privacy policy, [PRIVACY.md](PRIVACY.md): what the extension reads, keeps and
  sends. The extension's description in the browser now says what it does: find a
  FamilySearch person's records in Digitalarkivet and attach them as cited sources.
- In the 1865 census, the linker gives an age's birth year as DA does: that census was
  counted on 31 December, so age 22 is about 1844, as on DA's page and the search
  page, not 1843.
- The linker reads a person's sex from a compound kin word such as "hans Søstersøn"
  (sister's son) or "Svigerdatter" (daughter-in-law).
- When FamilySearch has the full birth date, a census age is compared as an age on
  census day, and only one year off is close: an age three years off no longer counts
  as close because the census's year less the age is two years off. The search page
  scores it so, and the linker's facts table marks it ✗. Without a full date, nothing
  changes.
- A census's sister's or brother's son ("hans Søstersøn", "Brodersøn") counts against
  the hit when the head of the household has another patronymic than the FamilySearch
  mother (or father), whose brother the head would be.
- In a census, the linker uses the same one-year rule for the person you opened: when
  FamilySearch has the full birth date and the age on census day is more than a year
  off, the linker doesn't pair that person with your tree person, even when nobody else
  at the residence fits. The row says why, and you can still choose the person by hand.
- More family words in census positions get English after them in the English UI:
  "hans Søstersøn [sister's son]", "Brodersøn [brother's son]", "Svoger
  [brother-in-law]", "Barnebarn [grandchild]", "Stedmoder [stepmother]",
  "Søskendebarn [cousin]", "Mand [husband]" and others. The search page's Position
  line gets them too.

## 1.6.0 - 2026-11-13

- Runs in Firefox (140 or later) and LibreWolf as well as Chrome, Brave and Opera:
  one package for all. Until it's on Mozilla's add-ons site, load it in Firefox from
  `about:debugging`. The README has the install steps for each browser, and a new
  user guide (`docs/guide.md`) walks through the extension task by task. Microsoft
  Edge isn't supported.
- When the browser hasn't given the extension Digitalarkivet or FamilySearch (Firefox
  can hold them back, and so can Chrome when the extension's site access is "On
  click"), the search page and the linker say so, with an **Allow access** button,
  instead of failing on the first search. The farm check's sites (Rygh's Norske
  Gaardnavne and Kartverket) aren't needed for them to start.
- The update check no longer asks for GitHub when the extension is installed. It is
  off until you click **Allow the check** on the Updates page, which asks the browser
  for GitHub's two hosts once. A copy updated from 1.5.0 may need that click too.
- Error notifications no longer have an OK button (Firefox has none); they close by
  themselves as before.
- In Firefox, the window the linker reads FamilySearch in comes up in front while it
  reads; the linker now says so ("leave it, it closes by itself"). It also waits until
  each FamilySearch page has really loaded, where Firefox could report the window's
  empty first page as loaded and the check then failed ("…perhaps the sign-in page").
- A burial's suggested death place is where the person died: the record's place of
  death, else the residence, else the farm in the name (in the birthplace's spelling
  when it's the same farm), in the parish, no longer the parish alone. A farm the
  record gives as a birthplace goes before the tree's municipality ("Bakken, Vågå,
  Oppland, Norway") instead of replacing it; a tree place that says more, or names
  another town or country, is kept. The burial (and a christening) is in the church
  the record names, else the parish.
- A death (or other vital) the tree has with neither date nor place, such as
  "Deceased" from an old import, is now changed with the record's date and place.
  Before, the linker offered to add a second one, which FamilySearch refused.
- When FamilySearch's security service blocks a page the linker reads or works in,
  the linker says so, with the error code and incident ID from FamilySearch's page,
  instead of "FamilySearch did not show the SourceBox search in time". Opening
  FamilySearch in the same browser shows that page and what to do.
- A residence below a municipality whose first word is another municipality's name
  ("Lom, byens grund", in Vågå) is no longer saved in that municipality:
  of FamilySearch's place suggestions, only a place in the same municipality is taken,
  otherwise the place stays as written.
- A source already in the SourceBox whose citation differs only in the day it was
  accessed is no longer updated for that, on every run.
- Sources get their date on FamilySearch. FamilySearch kept a source's date only
  when it was picked from its list of suggestions, so sources the linker made were
  saved without one. Opening such a record in the linker again and updating the
  source fills it in.
- Source titles begin with the name, as FamilySearch titles its own records'
  sources, and end with the record's date ("Lars, son of Halvor Larsen - Vågå
  parish ... - Birth, 23 August 1846"), so two records of one name, parents and
  parish, such as a child named after a brother who died, don't share a title. The
  SourceBox shows the source date's year in front of the title and sorts by it. A
  census ends as FamilySearch's census sources do ("Halvor Larsen household, Bakken
  nedre, Nordlien - Vågå - "Norway, Census, 1865""), so one household's censuses
  stay apart. A source made before under the year-first title, or without the date
  at the end, is still found, also for a record dated only by month or by a range
  of years: updating it gives it the new title instead of making another. Of those, only a source of this record is used (each is read first);
  a brother's of the same name gets a source of his own.
- A source already in the SourceBox with a date is found again. FamilySearch lists
  a dated source with the date's year in front of its title, which the linker took
  for part of the title, so it made a second source for the same record. The search
  of the SourceBox also waits for its own results, where it could take the SourceBox's
  newest sources, still loading or one of them of the same title, for them.
- A marriage opened from the bride's entry is read from the groom's, as from anyone
  else's, so the two entries give one source, no longer one each. A source made
  before from another person's entry of the record is taken for this record's and
  updated, no longer refused as "of another record".
- In a record of Oslo or Bergen, a farm is no longer taken for the town (Oslo and
  Bergen are counties as well as towns), which put a residence or birthplace on the
  farm in "Oslo, Oslo, Norway". "Chr", as clerks there wrote Christiania, is
  Kristiania, and a town of another county named in the record is that town.
  A town's parish (one of Oslo's) is the town in FamilySearch's places ("Oslo,
  Oslo, Norway"), no longer the parish's name in the county, and a residence the
  record gives as a town is the town, not a farm in the parish.
- An alternate name offered from the record takes, of two patronymics, the one of
  the father the record names, no longer the first written, and keeps a family name
  the tree has (in the record's spelling) as the surname instead of dropping it as
  a farm.
- A birthplace the record gives without a year (a marriage's) is offered for the
  tree's birth when that has a date but no place.
- A burial whose date of death has no year (DA gives "05-03" and the burial's date)
  shows the death in the linker and offers it for the tree, in the burial's year
  (the year before when the day comes after the burial's). Before, the death row was
  empty, and a tree with the burial's date as the death's wasn't offered the right one.
- A marriage's bride is shown as female and the groom as male in the linker's facts,
  where the bride's sex was blank.
- A birthplace DA writes as the town twice ("Christiansund Christiansund N") is read
  as that town: the tree's "Kristiansund, Møre og Romsdal, Norway" is kept, where
  the linker put the whole text before it as if it were a farm.
- In a town's church book (Arendal, Risør, Kristiansand, ...), a burial's name after
  the patronymic is taken for a family name, not for a farm the person died on, so
  the linker no longer offers to put the death on a "farm" of that name.
- A name such as "Lars Halvorsen Lindemann", whose last name isn't a farm near the
  person's places, is searched by the patronymic first (church books name people by
  it) and by the family name after it, no longer the other way round.
- A patronymic FamilySearch writes without ø or å (Jorgensen, Hakonsen, or today's
  Håkonsen) is searched as the church books wrote it, Jørgensen and Haakonsen:
  Digitalarkivet doesn't take o for ø or å for aa, and found almost none of the
  person's records under FamilySearch's spelling. That spelling is still tried after.
- Children's baptisms are also searched where the person died, when that was while
  they could still have children: a father who died young in another town had his
  last children baptized there.
- The person's other names (FamilySearch's alternate names, other spellings of the
  patronymic) are searched while children's baptisms or censuses are still missing,
  no longer only when nothing at all was found under the main name.
- A child's baptism counts as found only when the record names the couple (the
  person with the spouse): other men of the person's name had children in those
  years too, and their baptisms no longer stop the search. While one is missing,
  the couple is also searched in all of Norway, so a baptism in a town FamilySearch
  has no place for is found.
- The person's other names are also searched for the person alone, not only with
  the spouse: a baptism can name the father by his family name and the mother by
  another of her given names.
- A name the record gives only as given names, as a baptism names the child, is no
  longer offered as an alternate name with the last given name as the surname
  ("Lars Ole" for FamilySearch's Lars Ole Halvorsen).
- In a person's facts, a name is marked ✓ only when it is the name FamilySearch has;
  one the linker offers as an alternate name (a patronymic in another spelling) is
  marked ≈. The ✓ used to compare only the given names. A name you edit in the row
  is the one shown and marked, as the offer of an alternate name takes it.
- A hit found by the surname and a relative alone (a mother Johansdatter with the
  husband's name) whose given name isn't the person's now counts against the hit.
  It was taken for a spelling DigitalArkivet had matched, and another woman with the
  husband's name scored as the person.
- Johannes in a record is now close to Hans in the tree, and the other way round:
  church books could write the full name for a Hans.
- Johan, John, Jon and Joen in a record are now the same given name as Johannes in
  the tree, and the other way round, as they already were in patronymics.
- Aase in a record is now the same name as Åse in the tree (and the other way
  round): short names with å or aa didn't match.
- An old i for j after a consonant is now the same name: Biørn and Torbiørn in a
  record match Bjørn and Torbjørn (before, Torbiørn was only close and Biørn not
  even that).
- Gi and gj before a vowel are now read as j, as old spellings have them: Giermund
  and Ingiald in a record match Gjermund and Ingjald, and a patronymic
  Giermundsdatter has the same father as Jermundsen.
- F and v are now one letter where old spellings mix them: Leiv and Lev in a record
  match Leif, Rolv matches Rolf and Halvdan Halfdan.
- In the censuses from 1865 on, a wife often has her husband's surname (Kjersti
  Halvorsen): the linker took her for a man by the -sen and didn't pair her with
  the wife in the tree, and a daughter-in-law under the family's -sen was left out
  the same way. A -sen now tells a man only in older records; the position
  (Husmoder, Kone, Tjenestepige, ...) tells a woman.
- The town censuses of 1865 write a wife or child as the one above's: "Ovennævntes
  Kone", "Disses Barn", "Ds's Søn", "Den Foregaaendes Hustru". These are now read
  as the head's wife and children, for the search's record check and for pairing
  the household in the linker.
- The linker no longer offers "Søn", "Datter", "Hustru", "Barnet" or "Pige" as an
  occupation to add: censuses and church books write the family word or a marital
  status where the occupation goes. "Gift Murerarbeider" is offered as
  "Murerarbeider".
- The 1910 census's full dates of birth are written as dates ("b. 6 April 1845", no
  longer "b. 1845-04-06") in the source's notes, and the linker compares and adds
  them as the birth date, not only its year.
- A census position "Barn" is translated "[child]" in the source's notes, no longer
  "[children]" ("Børn" stays "[children]").
- A record date DA wrote wrong ("1803-2702", with the day and month run together)
  is now only its year in the source's date and citation, which FamilySearch can
  read; before, it went in as written, and the christening had no date. A range of
  years stays as written ("1740-1743", "1740-43").
- When FamilySearch was slow to show a fact's Tag Sources, the fact's window stayed
  open, and every fact after it failed ("did not show the last form to close in
  time"). That window is now closed when tagging fails, and a fact's form or window
  still open before the next fact is closed too.
- A fact FamilySearch was slow to save or tag is tried once more, with the person's
  page loaded again and its tab in front. A save is tried again only when it
  failed before its Save was clicked, so a fact is never added twice.
- When FamilySearch didn't show the SourceBox search in time, the linker created
  the source all the same, which could make a second copy of one already in the
  SourceBox. It now searches once more, then goes by the SourceBox check made when
  the page opened; with no check to go by, it stops without creating anything.
- In a marriage, "Cop." or "Corp." (copulerede, married), which the church book
  writes and DA transcribes where the position would be, is no longer offered as
  the groom's or bride's occupation.
- A record whose permanent IDs couldn't be read no longer gives the open person's
  own details (place of death, date of birth, sex) to the other people in it.
- A record on two pages of the church book is cited "pp. 260–261", no longer
  "p. 260, 261" (which read as if 261 were another part of the citation). A source
  made before has the old text; the linker offers to update it.
- The release notes on the Updates page show bold text as bold, no longer with the
  `**` around it.
- **Copy report** in the header of the search page and the linker puts a problem
  report on the clipboard, to paste into a GitHub issue: the version, browser and
  language, a place to say what went wrong, and what the page read and did (the
  search's criteria, searches and hits; in the linker, the record as read, the
  source, each person's pairing, facts and changes, and the log of what was done on
  FamilySearch). **Report on GitHub** beside it copies the report too and opens a
  new issue on GitHub to paste it into (you need a GitHub account). Nothing is sent
  by the extension: read the report before you paste it.

## 1.5.0 - 2026-11-10

- The linker can add the record's facts to the tree persons. Under each person's
  facts, **Add to FamilySearch** lists what the record could add: a christening,
  death, burial, residence or occupation the tree lacks, an emigration (as a custom
  event titled Emigration, from the protocol's police district, with the destination,
  or the protocol's own when the entry has none: "Emigrants to America"), a name as
  an alternate name, and a birth, christening, death or burial that differs.
  FamilySearch keeps one of each, so the suggestion combines the two, the more
  precise part of each. Everything is unticked; tick and
  edit what you want, and edit the reason if you like. Ticking a birth, christening,
  death, burial or residence ticks its tag too. The ticked changes are listed above
  the buttons.
- **Check with FamilySearch** fills the ticked changes in FamilySearch's own forms in
  the background and puts FamilySearch's standard date and place for the record's year
  in the boxes, to look over. Nothing is saved. A residence's place starts with the
  farm, and stays as written when FamilySearch doesn't know the farm. An emigrant's
  residence is their home anywhere in Norway, not a place in the police district they
  left from, and a residence abroad ("Amerika", an American going back) isn't offered,
  since FamilySearch would take it for a village of that name. A birthplace a
  census gives is looked for in all of Norway, not only in the census's county: a
  person counted in Troms but born in Christiania is born in "Kristiania, Oslo,
  Norway", not in a "Christiania, Troms". A place in Oslo is written "Kristiania"
  when the record says Kristiania or Christiania, or abbreviates them (Chra., Kria.),
  and Digitalarkivet's county Bergen is FamilySearch's Hordaland ("Bergen, Hordaland,
  Norway").
- After the source is attached, the ticked changes are saved on each person's page,
  and the source is tagged to each fact added or changed. The person is read again
  first: a change FamilySearch has by now (saved in an earlier run, from a record
  opened again) isn't made twice, only tagged, and the change is no longer offered.
  A form FamilySearch doesn't save is cancelled, not left open.
- When the source is already in your SourceBox with other fields, the linker shows
  FamilySearch's beside a choice: use the record's, or keep FamilySearch's. The notes
  keep FamilySearch's with the record's new lines added, unless they are an older copy
  from the extension.
- The search page marks the records you've attached in the linker, in every search:
  "✓ Attached 10 November 2026 to Lars Halvorsen, Halvor Larsen", linked to who has
  the source on FamilySearch, with **Review again**. The page you came from is marked
  as soon as the linker is done; "⚠ Not all done" when a step failed.
- A person FamilySearch finds for a new person is linked to the family you chose
  when you use them (**Use this person**, which was **Pair with this person**), with
  FamilySearch's Add Match, unless the family has them already. A person made before
  whose relationships were taken off came back unlinked.
- A new person's relationship is yours to choose: for a child, the father and the
  mother, each any person paired on the page (or none), set to what the record
  suggests, whose suggestions stay as buttons; for a spouse or parent, the person.
  When the two parents aren't a couple on FamilySearch, the form says so, since
  FamilySearch adds a child of two only to a couple.
- A census's grandchildren are read as such: "Sønnesøn" and "Sønnedatter" are the
  children of the head's son (the one their patronymic names) and his wife, the
  "Sønnekone", not of the head. They, a "Søster" and a "Sønnekone" were read as the
  head's sons before. Positions spelt with ö ("Sönnesön", "Sönnekone") are read too.
- An 1891 household whose head has household number 1 and the rest "000" is one
  household again, not one per resident; its "Familiens overhode" is its head.
- This release also brings the changes of 1.4.1, which wasn't released on its own
  (listed below): old spellings of names and patronymics match better, a farm name in
  place of the patronymic no longer counts against a record, the pages wait while
  Digitalarkivet is down or refuses requests, the extension asks for fewer sites, and
  a new person gets FamilySearch's standard places.

## 1.4.1 - not released on its own (in 1.5.0)

- Old spellings of a name match better. A final j for i is read as i everywhere: a
  search for Sirj also finds Siri and Siry, and Sirj counts as a form of Sigrid, as
  Siri does. Åshild, Rønnaug and Ånund are matched in their old spellings (Aasel,
  Aasild, Osille; Ronnau, Ronu; Aanen, Aanon), and an initial sj, skj, sch or the old
  si before a vowel are one sound (Sjønne, Skjønne, Siønne, Sionne).
- A farm name in place of the patronymic no longer counts against a record: Halvor
  Nordby may be FamilySearch's Halvor Larsen, since records name a man by his farm or
  by his father. Another patronymic (Halvor Olsen) still does.
- Patronymics of one father agree in more spellings: Jonsdatter, Johnsdatter and
  Johannesdatter (church books wrote one man's name as John or Johannes), Aanensdatter
  and Aanonsdatter, a woman's Olsen for Olsdatter, and the abbreviation -sd without a
  full stop (Olsd).
- The linker's retry when the browser refuses a move to a FamilySearch page ("Navigation
  rejected.") no longer shows on the extension's Errors page: it was a note, not an
  error, since the retry goes through.
- When Digitalarkivet is down or refuses requests, the search page and the linker say
  so at the top, with the time it happened, and send it nothing more for a while: 5
  minutes when it's down, 15 when it refuses. Pages already read are still shown.
  **Try again now** asks again at once. A single page that fails while the rest of
  Digitalarkivet answers no longer stops anything.
- The extension asks for fewer sites: only www.digitalarkivet.no and
  www.familysearch.org, not every address under them. Nothing changes in use. If
  FamilySearch's sign-in page comes up while sources are attached, the linker asks you
  to sign in and try again.
- A new person created from the linker gets FamilySearch's standard places for the
  record's years (Vågå, Oppland, Norway for a birth in 1846), not the place as typed.

## 1.4.0 - 2026-11-07

- The linker checks your SourceBox when it opens, the way FamilySearch's Source
  Linker flags a record you've used before. Until it's done the page says what it's
  doing (reading the record on Digitalarkivet, pairing the people, checking the
  SourceBox) and shows the source and the people when it knows. A
  source already there, in any folder, is shown in green, with a link to its Attached
  To page that tells how many of the people paired here have it; each person's row
  says whether they have it, and those who have it are highlighted in green, as in the
  Source Linker. The check reads FamilySearch in a window of its own behind the
  linker's, not a new tab among yours.
- Reading relatives' families from FamilySearch for a census uses that window too.
- When the source is already in your SourceBox, the button says **Update source and
  attach**: it writes the title, date, web page, citation and notes as reviewed here
  over the source on FamilySearch (fields left empty here are kept), then attaches it.
- A source attached to some of the people before is now finished properly:
  **Update source and attach** uses it and attaches it only to those who don't have
  it yet, leaving the others and their tags as they are. Before, each attach to
  someone who already had the source failed after a long wait.
- A source with the same title is found in any SourceBox folder, not only among the
  newest sources on Home, so a second run makes no copy.
- Each person's row shows what the record says of them beside what FamilySearch has of
  the tree person, fact by fact (name, sex, birth, the record's event, residence,
  occupation), with ✓, ≈ and ✗ for what agrees, is close or differs, as FamilySearch's
  Source Linker does. The tree person's facts are read from FamilySearch in the
  background once the page is shown.
- When the work on FamilySearch is done, its tab is closed and you're back on the
  linker. If a step failed, the tab stays open where it stopped.
- Someone in the record who isn't in the tree yet can be created on FamilySearch from
  the linker: **New person on FamilySearch…** in the row's list opens a form at the
  side, filled in from the record (given names, the patronymic as the surname, sex,
  birth and death with FamilySearch's place names, and the relationship to someone
  paired here, as the record tells it). **Find on FamilySearch** fills in
  FamilySearch's own Add Child, Add Spouse or Add Parent form in a tab and lists the
  people FamilySearch thinks may be the same; pair the row with one of them, or
  **Create person**, which creates the person and pairs the row with them. Nothing is
  saved on FamilySearch before you choose.
- A deceased person's role ("avdød") no longer reads as a woman's.
- On a marriage, the groom's and the bride's fathers are paired with the tree's fathers
  (before, they weren't suggested at all), and the bride's father, who is in the wife's
  family rather than yours, is now among the choices: the linker reads the FamilySearch
  family of a paired spouse (or another paired relative) when the record names
  relatives of theirs, as it does for a census. That also happens when you pair the
  bride (or another relative) yourself, and the others are then paired from her.
- Safer updates and sources:
  - A source in your SourceBox with the same title but of another record (a common
    name, the same year and parish) is no longer written over or attached: the linker
    stops and asks you to give this source another title.
  - The Updates page also checks that the package is the version the release says, so
    an older signed package can't be offered as a newer one.
  - The linker reads records only from Digitalarkivet, and tags a source found by its
    title only when one source on the person has that title.

## 1.3.2 - 2026-11-07

- On the linker page, a child's baptism is paired with the right child of the family.
  A boy baptized Johan Peder was paired with his elder sister Marte Johanne, because
  Johan and Johanne count as spellings of one name and she came first. Now the child
  whose first given name the record has comes first, and a child FamilySearch has as
  the other sex isn't paired at all. The search page's record check counts each
  baptized child once, for that same child.

## 1.3.1 - 2026-11-07

- A patronymic the church book abbreviates, such as Johannesdat., Larsdatt. or
  Olsd:r, is read as one. Before, a mother written Astri Johannesdat. counted as
  another woman than FamilySearch's Astri Johansdr, and her child's baptism was marked
  down.
- A name the extension can't read as a patronymic no longer counts against a record:
  it's unknown, not a contradiction.
- Names are compared more like the old spellings go: Kjetil and Kittil, Hjalmar and
  Jalmar, Gjermund and Jermund, Arndt and Arnt are one name, and near spellings such
  as Torbiørn for Torbjørn or Tollev for Tollef are close (≈). A near spelling only
  ever helps a record; it is never a reason against one.

## 1.3.0 - 2026-11-06

- A baptism (or other church-book entry) found in both of a parish's church books, the
  ministerialbok and the klokkerbok, is one hit on the search page, with a link to the
  entry in the other book. Before, each child of such a parish showed twice.
- **Review & Attach** on such a hit reviews both entries together: the linker shows
  them side by side with the differences marked, and makes a source for each book,
  named in the title and citation. Each source's notes give the other book's entry
  and the differences between the two transcriptions. The people are paired once and
  both sources are attached to them; only the ministerialbok's source gets the tags.

## 1.2.1 - 2026-11-06

- A patronymic from a father's name that Digitalarkivet spells in several ways is
  searched under all of them. A mother FamilySearch has as Johansdr is searched as
  Johan*, which finds the Johannesdtr. and Johannsdtr of the church books; before, the
  search found none of her children's baptisms with her surname, and fell back to one
  without it that found other couples' children too. Johansen and Johannessen are
  searched the same way.
- A parent's or spouse's patronymic with other spellings (Pedersdatter and
  Persdatter, Andersen and Andresen, Halvorsen and Halvardsen, ...) is also searched
  in the other spelling, right after the search under FamilySearch's spelling.

## 1.2.0 - 2026-11-06

- The extension checks once a day whether a newer release is out (only a copy loaded
  unpacked, as from a release's zip). A new release shows as an arrow on the toolbar
  icon, a notification, and "v. X.Y.Z is out" in the search and linker pages' headers.
- A new Updates page (click the version in a page's header, or the icon with the arrow):
  the release's notes, and a Download button that saves the package only after checking
  that it's the release's file, signed with the maintainer's key. Then unzip it over
  the extension's folder and click **Reload the extension**; your drafts and persons
  are kept. "Remind me later", "Skip this version", and a setting to turn the check off.
- The check asks GitHub for the latest release and sends nothing about you or your
  records. Chrome asks for two new permissions: GitHub's API and its file host, for
  the check and the download, and alarms, for the daily check.

## 1.1.3 - 2026-11-06

- A census couple who are both heads of the household (1900's husfar and husmor,
  1865's Husfader and Husmoder) are taken as husband and wife, and so as their
  children's parents.
- A birth year that Digitalarkivet worked out from an age (marked with a star) counts
  as one year closer to FamilySearch's year. A star on a place no longer counts as one.
- For developers: tests on saved Digitalarkivet pages, with the names, IDs and links
  changed to made-up ones. The documentation uses made-up names too.

## 1.1.2 - 2026-11-06

- Birth years are scored by how far they are from FamilySearch's: the same year counts
  most, one year off a little, and two or more years off count against the record,
  the more the further. A full birth date on FamilySearch narrows the searches to a
  year either side, and is checked against the record's own date of birth.
- A baptism before FamilySearch's birth date is taken as another child's.
- A relative with a close given name (Astri for Astrid) counts, a little less
  than the same name.
- The toolbar icon only works on Digitalarkivet pages (https, digitalarkivet.no), and
  the extension no longer asks for the "tabs" permission.
- The linker only runs its steps while the tab is still on FamilySearch.
- Lighter, sky-blue icons that show on light and dark toolbars. The tooltip shows the
  version as "v. X.Y.Z".
- Licensed under the GNU GPL, version 3 or later.

## 1.1.1 - 2026-11-06

- Places abroad are no longer matched to Norwegian places without æ, ø and å (Orland,
  California is not Ørland).
- The relatives' checkboxes say "Use this spouse in the searches" again (and "this
  child").
- When Digitalarkivet's English copy of a Bokmål or Nynorsk record can't be read, the
  icon says so.
- Fixes in reading FamilySearch's alternate names and the sex on family cards, and
  translations that were missing.

## 1.1.0 - 2026-11-06

- The search page, the linker and the notifications in Bokmål and Nynorsk, following
  the browser's language, with a menu to change it. The source itself (title,
  citation, notes) stays in English.
- The toolbar icon reads Bokmål and Nynorsk record pages, and FamilySearch's Norwegian
  person pages are read too.
- Place names written without æ, ø and å ("Vaga") find their municipality.
- The version is shown in the toolbar icon's tooltip.

## 1.0.0 - 2026-11-05

The first version: from a FamilySearch person, search Digitalarkivet for their
records, review a record's source and its people, and attach the source to the
people in the tree.
