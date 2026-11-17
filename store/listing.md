# Store listing texts

Everything you paste into a store's form is in a grey box below. On GitHub each box
has a **copy button** at its top right: click it and paste the box as is. Each box is
one paste, and a paragraph is one line (no line breaks to remove). The text outside
the boxes says where each one goes.

The stores show the descriptions as plain text; the dashes at the start of lines make
the lists.

Contents: [Name](#name) · [Summary](#summary) · [Description](#description) ·
[Screenshot captions](#screenshot-captions) · [Category, tags and links](#category-tags-and-links)
· [Store by store](#store-by-store)

## Name

Chrome Web Store: from the package (`_locales/*/messages.json`), nothing to paste.
AMO and Opera: the **Name** field, in each language.

English:

```text
DigitalArkivet to FamilySearch
```

Norwegian (Bokmål):

```text
Digitalarkivet til FamilySearch
```

## Summary

### Chrome Web Store and Opera: the short summary

At most 132 characters. The Chrome Web Store takes it from the package (since 1.8.1,
naming genealogy), so there is nothing to paste there. Opera: its **Summary** field.

English:

```text
Genealogy: find a FamilySearch person's records in Norway's Digitalarkivet and attach them to the tree as cited sources.
```

Norwegian (Bokmål):

```text
Slektsforskning: finn en FamilySearch-persons poster i Digitalarkivet og legg dem til i slektstreet som kilder med kildehenvisning.
```

### AMO: the longer summary

AMO's **Summary** field allows 250 characters. AMO's search reads the name, summary and
description, and its tags have no genealogy, so this one names it.

English:

```text
Genealogy tool for Norwegian family history: find a FamilySearch person's records in Digitalarkivet (church books, censuses, emigrant protocols) and attach them as cited sources.
```

Norwegian (Bokmål):

```text
Verktøy for slektsforskning: finn postene til en person i FamilySearch i Digitalarkivet (kirkebøker, folketellinger, emigrantprotokoller) og legg dem til i slektstreet som kilder med kildehenvisning.
```

## Description

All three stores: the **Description** field (Chrome Web Store: Store listing →
Description; AMO: Describe Add-on → Description; Opera: Description), in each
language. Each box is the whole description.

English:

```text
Find your Norwegian ancestors in Digitalarkivet and cite them on FamilySearch. A genealogy and family-history tool for Norwegian research.

This extension connects FamilySearch's Family Tree with Digitalarkivet, the National Archives of Norway's online archive of church books, censuses and emigrant protocols. It is an independent, free project, not affiliated with or endorsed by FamilySearch or the National Archives of Norway.

- Search from the tree: on a person's page in FamilySearch, a "Digital Arkivet" entry in Search Records searches Digitalarkivet for their baptism, confirmation, marriages, children's baptisms, censuses, emigration, moves and burial, using their names, years, places, farms and relatives.
- Ranked hits with reasons: names in their old spellings and patronymics (Pedersdatter, Pedersdtr., Persdatter), farms, years and relatives are scored, with a ✓, ≈ or ✗ for each, and the best hits are checked on their record pages. Records you have attached already are marked.
- Review before anything is saved: "Review & Attach" opens the record with a source ready to edit: the title, an Evidence Explained-style citation, and notes with the record's details. The record's people are paired with your tree persons, and each person's facts are shown beside the record's, as FamilySearch's Source Linker does.
- See what FamilySearch has: whether the source is already in your SourceBox, who it is attached to, and which of its fields differ.
- One click to cite: creates or updates the source in your SourceBox, attaches it to each person, tags it, and adds the facts you ticked (a christening, a residence, an alternate name). A person missing from the tree can be added from the record.
- From any record: the toolbar icon on a Digitalarkivet record page opens the same review.
- Two church books: an entry found in both of a parish's church books (ministerialbok and klokkerbok) is reviewed once, with a source for each and their differences noted.
- In English, Norwegian Bokmål and Nynorsk.

You need a FamilySearch account (free). The extension works in FamilySearch's own pages in your browser, as you would; it never reads your password and saves nothing on FamilySearch before you click. Always check the record, and the scanned image when there is one, before you attach it: transcriptions vary.

Privacy: no account, no tracking, no analytics. Searches and records stay in your browser. A problem report is sent only when you click Send, after you've read it. The privacy policy: https://github.com/Dude4Linux/arkivet2fs/blob/master/PRIVACY.md

User guide: https://github.com/Dude4Linux/arkivet2fs/blob/master/docs/guide.md
Source code (GPL-3.0-or-later): https://github.com/Dude4Linux/arkivet2fs
```

Norwegian (Bokmål):

```text
Finn dine norske aner i Digitalarkivet og bruk dem som kilder i FamilySearch. Et verktøy for slektsforskning i norske kilder.

Utvidelsen kobler slektstreet i FamilySearch sammen med Digitalarkivet, Arkivverkets nettarkiv med kirkebøker, folketellinger og emigrantprotokoller. Den er et uavhengig og gratis prosjekt, uten tilknytning til FamilySearch eller Arkivverket.

- Søk fra slektstreet: på en persons side i FamilySearch finner du «Digital Arkivet» under Search Records. Den søker i Digitalarkivet etter dåp, konfirmasjon, ekteskap, barnas dåp, folketellinger, utvandring, flytting og begravelse, ut fra navn, årstall, steder, gårder og slektninger.
- Treff rangert med begrunnelse: navn i gamle skrivemåter og farsnavn (Pedersdatter, Pedersdtr., Persdatter), gårder, årstall og slektninger får hver sin ✓, ≈ eller ✗, og de beste treffene kontrolleres mot selve posten. Poster du allerede har lagt til, er merket.
- Se over før noe lagres: «Review & Attach» åpner posten med en kilde klar til å redigeres: tittel, kildehenvisning etter Evidence Explained, og merknader med postens detaljer. Personene i posten pares med personene i treet ditt, og opplysningene deres vises side om side med postens, slik FamilySearchs Source Linker gjør.
- Se hva FamilySearch har: om kilden allerede ligger i kildeboksen din (SourceBox), hvem den er knyttet til, og hvilke felt som er forskjellige.
- Ett klikk: lager eller oppdaterer kilden i kildeboksen, knytter den til hver person, merker den, og legger til opplysningene du har krysset av for (en dåp, et bosted, et alternativt navn). En person som mangler i treet, kan legges til fra posten.
- Fra enhver post: ikonet i verktøylinjen på en post i Digitalarkivet åpner den samme gjennomgangen.
- To kirkebøker: en post som finnes i både ministerialboken og klokkerboken, gjennomgås én gang, med en kilde for hver og forskjellene notert.
- På bokmål, nynorsk og engelsk.

Du trenger en konto i FamilySearch (gratis). Utvidelsen arbeider i FamilySearchs egne sider i nettleseren din, slik du selv ville gjort; den leser aldri passordet ditt og lagrer ingenting i FamilySearch før du klikker. Kontroller alltid posten, og det skannede bildet når det finnes, før du legger den til: transkripsjonene varierer.

Personvern: ingen konto, ingen sporing, ingen analyse. Søk og poster blir i nettleseren din. En feilrapport sendes bare når du klikker Send, etter at du har lest den. Personvernerklæringen (engelsk): https://github.com/Dude4Linux/arkivet2fs/blob/master/PRIVACY.md

Brukerveiledning (engelsk): https://github.com/Dude4Linux/arkivet2fs/blob/master/docs/guide.md
Kildekode (GPL-3.0-or-later): https://github.com/Dude4Linux/arkivet2fs
```

## Screenshot captions

The four screenshots are in `screenshots/` (1280×800). Upload them in this order. AMO
asks for a **caption** under each one, in each language; the Chrome Web Store and
Opera have no captions.

**1. `1-search.png`**, English:

```text
The search page: a FamilySearch person's records found in Digitalarkivet, ranked by how well they match, with the reasons shown for each hit.
```

Norwegian:

```text
Søkesiden: en FamilySearch-persons kilder funnet i Digitalarkivet, rangert etter hvor godt de passer, med begrunnelsen for hvert treff.
```

**2. `2-source.png`**, English:

```text
Review the source before anything is saved: the title, an Evidence Explained–style citation and the record's notes, all editable.
```

Norwegian:

```text
Se over kilden før noe lagres: tittel, kildehenvisning og notater fra kilden, alt kan redigeres.
```

**3. `3-people.png`**, English:

```text
Pair the people in the record with tree persons and compare the record's facts with FamilySearch's side by side. Facts the tree lacks, such as a christening, can be added.
```

Norwegian:

```text
Koble personene i kilden til personer i slektstreet, og sammenlign kildens opplysninger med FamilySearch side om side. Opplysninger treet mangler, som en dåp, kan legges til.
```

**4. `4-changes.png`**, English:

```text
Close names are flagged (≈), the changes to the tree are listed, and nothing is saved on FamilySearch until you click "Create source and attach".
```

Norwegian:

```text
Navn som ligner flagges (≈), endringene i slektstreet listes opp, og ingenting lagres på FamilySearch før du klikker «Opprett kilde og knytt til».
```

## Category, tags and links

**Category** (chosen from each store's list, nothing to paste):

- Chrome Web Store: **Tools** (else Education)
- Opera: **Productivity**
- AMO: **Search Tools** and **Other**

**Tags** (AMO only, chosen from its fixed list): **search**. It has no genealogy tag.

**Homepage** (all three stores; AMO: Homepage):

```text
https://github.com/Dude4Linux/arkivet2fs
```

**Support site** (all three; AMO: Support website; leave AMO's Support email empty):

```text
https://github.com/Dude4Linux/arkivet2fs/issues
```

**Privacy policy address** (Chrome Web Store: Privacy practices → Privacy policy; Opera:
Privacy policy):

```text
https://github.com/Dude4Linux/arkivet2fs/blob/master/PRIVACY.md
```

AMO wants the policy's text instead: open `PRIVACY.md` on GitHub, click **Raw**, select
all, copy, and paste it in AMO's **Privacy Policy** field.

**License** (AMO only, chosen from its list): **GNU General Public License v3.0**
(GPL-3.0-or-later).

**Icon**: upload `icons/icon128.png` in each store's icon field (AMO too; the Chrome Web
Store also reads it from the package).

**Languages**: English and Norwegian (AMO: Norwegian Bokmål).

**Official URL** (Chrome Web Store): leave as **None**. Only a site verified in Google
Search Console can go there, and github.com can't be.

The Chrome Web Store shows the account's contact e-mail on every listing, so use an
address you don't mind being public.

## Store by store

A checklist of the fields, in the order the forms ask for them. The answers to the
privacy, permission and review questions are in `review.md`.

**Chrome Web Store** (developer dashboard):

1. Package: upload `arkivet2fs-X.Y.Z.zip` from the GitHub release.
2. Store listing: [Description](#description) (English, then add Norwegian), Category
   Tools, Language, icon, the four screenshots, Homepage, Support site, Official URL
   None.
3. Privacy practices: the [privacy policy address](#category-tags-and-links), and
   `review.md`'s single purpose, permission reasons and data use.
4. Test instructions: `review.md`'s notes for the reviewers.

**Firefox AMO** (Developer Hub → Edit Product Page):

1. Describe Add-on: [Name](#name), [AMO summary](#amo-the-longer-summary),
   [Description](#description), Categories, Tags, Homepage, Support website.
2. Media: icon, the four screenshots with their [captions](#screenshot-captions).
3. Technical details / license: GPL v3.0; [Privacy Policy](#category-tags-and-links)
   as text.
4. For the Norwegian texts, switch the page's locale to Norwegian Bokmål and paste them.
5. Version notes for the reviewers: `review.md`'s notes.

**Opera add-ons**: [Name](#name), [Summary](#chrome-web-store-and-opera-the-short-summary),
[Description](#description), Category Productivity, icon, screenshots, Homepage,
Support site, privacy policy address, and `review.md`'s notes.
