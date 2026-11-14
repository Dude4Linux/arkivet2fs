# arkivet2fs user guide

This guide walks through the extension one task at a time, from a FamilySearch
person to a source attached to the family. The README has the details of each page
and how to install the extension in each browser; this guide is how to use it.

The people in the examples are made up: Lars Halvorsen, born 1846 in Vågå, son of
Halvor Larsen and Astri Larsdatter, who emigrated to America.

**Contents**

1. [Before you start](#1-before-you-start)
2. [Find a person's records](#2-find-a-persons-records)
3. [Review a record](#3-review-a-record)
4. [Attach the source](#4-attach-the-source)
5. [A census household](#5-a-census-household)
6. [One entry in two church books](#6-one-entry-in-two-church-books)
7. [Add the record's facts to the tree](#7-add-the-records-facts-to-the-tree)
8. [Someone not in the tree yet](#8-someone-not-in-the-tree-yet)
9. [Start from a record on Digitalarkivet](#9-start-from-a-record-on-digitalarkivet)
10. [When something goes wrong](#10-when-something-goes-wrong)
11. [Report a problem](#11-report-a-problem)
12. [Good habits](#12-good-habits)

## 1. Before you start

- **Install the extension** as the README says for your browser, and pin its icon to
  the toolbar.
- **Sign in to FamilySearch** in the same browser. The extension works in your
  FamilySearch pages as you would; it never sees your password.
- **Choose a language** if you like: the menu at the top right of the search page and
  the linker has English, Bokmål and Nynorsk. The sources themselves are always in
  English, since the tree is shared worldwide.
- **Nothing is saved without your click.** Searching and reviewing only read
  Digitalarkivet and FamilySearch. Only **Create source and attach** (or **Update source
  and attach**), **Create source only**, and in the new-person panel **Create person**
  and **Use this person**, change anything on FamilySearch.

## 2. Find a person's records

1. Open the person's details page in the FamilySearch tree.
2. In the **Search Records** panel on the right, below Google, click **Digital
   Arkivet**. The search page opens in a new tab.

The page searches Digitalarkivet for each event of the person's life in turn: the
baptism, confirmation, marriages, the children's baptisms, censuses, emigration,
moving away, burial, and everything under the name. Each search starts in the
person's own municipalities and widens to the county and then all of Norway only when
it finds nothing. The hits come in as the searches run.

**Reading the hits.** Each hit is a row with the person's name and role, the record's
events, why it matches, and a score. The reasons are what to look at:

- ✓ agrees with FamilySearch: a name, a year, a place, a farm, a relative
- ≈ close: another spelling (Astri for Astrid), a year one off
- ✗ disagrees: a year far off, another given name for a parent, too young for the role

After the searches, the page opens the best hits' records and checks the people in them
against the family: the parents in a baptism, the couple in a marriage, the household in
a census. "record checked" under a hit means its reasons include what the record itself
says. That's what tells apart three men of the same name in one parish. Hits below 0
are dimmed: usually someone else.

**Adjusting the search.** The sidebar holds the criteria, filled in from FamilySearch.
Change a name or a year and click **Search**. Untick a relative who leads the searches
astray, add a parish under **Where to search** to look somewhere the tree doesn't
mention, or turn off a kind of record under **Record kinds**. **Open on DA** under each
search opens the same search on Digitalarkivet, to look for yourself.

**What you've done already.** A record you've attached says so on its hit, "✓ Attached
… to Lars Halvorsen, Halvor Larsen", in every later search too, with **Review again**
instead of **Review & Attach**.

## 3. Review a record

Click **Review & Attach** on a hit. The linker opens in a new tab. While it loads, the
top of the page says what it's doing: reading the record, pairing the people with the
family, checking your SourceBox. To check the SourceBox and read the family, it opens
FamilySearch in a window of its own, behind the linker, and closes it again; in Firefox
that window comes to the front for a moment. Leave it: it closes by itself.

**The source.** At the top are the fields the source will have on FamilySearch:

- **Title**: "Lars, son of Halvor Larsen - Vågå parish, Vågå local parish 1842-1856
  (0515P) - Birth, 23 August 1846". The date at the end keeps apart two records of one
  name, such as two brothers both named after their grandfather.
- **Date**, **Web page** (the record's permanent link on Digitalarkivet), **Citation**
  and **Notes** (everyone in the record with their roles, in English).

You can edit them all. Read the citation and notes against the record, and look at the
scanned image (the citation links to it) when there is one: transcriptions have errors.

If the source is already in your SourceBox, its box is green, with an **Attached To**
link to who has it on FamilySearch. Where FamilySearch's copy differs from the record's,
both are shown under the source with a choice of which to keep.

**The people.** Each person in the record has a row:

- **Name**: as the record gives it; you can edit it. A baptized child with no surname
  gets suggestions, such as the father's patronymic (Lars Halvorsen).
- **Tree person**: who in the tree the row is. The linker pairs the person you searched
  for, and relatives whose names and years fit. A relative with another name in the
  record (a second wife, perhaps) is mentioned above the rows but not paired: pair them
  yourself if it's them. Choose **— don't attach —** for someone you don't want the source
  on, or **Another person (PID)…** to type a FamilySearch ID.
- **The table**: what the record says of the person beside what the tree has, fact by
  fact: ✓ agrees, ≈ close, ✗ differs (highlighted). A ✗ is a reason to look twice
  before attaching.
- **Tags** (Name, Sex, Birth, Christening, Death, Burial, Residence) and the
  **reason** for attaching, both filled in by the person's role.

A person who already has the source is green, as in FamilySearch's own Source Linker.

## 4. Attach the source

Click **Create source and attach** (it reads **Update source and attach** when the
source is in your SourceBox already). A FamilySearch tab opens and the linker works in
it step by step, listing each step at the bottom of the page:

1. It creates the source in your SourceBox, or updates the one there.
2. It attaches it to each paired person, with your reason. Someone who has it already
   is left as they are.
3. It adds the ticked tags.
4. It makes the changes you ticked under **Add to FamilySearch** (section 7).

When all went through, the tab closes and you're back on the linker. If a step failed,
the tab stays open where it stopped, and the step's line says why: see section 10.

**Create source only** puts the source in your SourceBox without attaching it.

## 5. A census household

A census lists everyone at a residence, often several households: the farmer's
family, his old parents, a married son, a lodger. The linker shows a row for each
resident, under a heading per household.

It pairs from the person you searched for outward through the tree: their wife and
children first, then their parents, wherever they live at the residence, then each
paired relative's own family. For that it reads those relatives' FamilySearch pages
in its background window; a line above the rows says how many it paired. The census's
own words count too: someone the census calls "hans Fader" isn't paired as a son.

Households with no one from the tree, and not linked to the person's own by the census,
are hidden; the **Show the … other households** link under the rows shows them. If you opened a
namesake's household by mistake, the linker moves to the household where the person
fits and says so.

Look over the pairs before you attach: the linker can only pair people the tree has.

## 6. One entry in two church books

Many parishes kept two church books, the priest's (ministerialbok) and the clerk's
(klokkerbok), and Digitalarkivet transcribed both. The search page shows such a pair as
one hit, "Also in the other church book". **Review & Attach** opens both: the two
entries side by side with their differences marked, and a source for each book. You
pair the people once, and both sources go to them; the tags go on the
ministerialbok's source. Each source's notes say where the two books differ.

## 7. Add the record's facts to the tree

Under each person's table, **Add to FamilySearch** lists what the record could add:

- a christening, death, burial, residence or occupation the tree doesn't have
- an emigration (as a custom event titled Emigration)
- a name the tree doesn't have, as an alternate name
- a birth, christening, death or burial that differs from the tree's, combined: the
  record's "23 August 1846" with the tree's "Vågå, Oppland, Norway", say

Everything starts unticked. Tick what you want and look at the boxes: you can edit the
date, the place and the reason. Not every suggestion is right: an alternate name from a
misspelled transcription is better left out. Ticking a fact also ticks its tag.

**Check with FamilySearch** fills each ticked change in FamilySearch's own form in the
background window, takes FamilySearch's standard date and place, and cancels, so the
boxes show what FamilySearch would save. Nothing is saved then.

The ticked changes are made when you attach (step 4), only for people who then have
the source, and each new or changed fact is tagged with the source. A couple's
marriage can't be added yet.

## 8. Someone not in the tree yet

A baptism names a child the tree doesn't have, say. In that row's tree person list,
choose **New person on FamilySearch…**. A panel opens at the side, filled in from the
record: name, sex, birth and death, and the relationship (a child of the paired father
and mother). Check it and click **Find on FamilySearch**: the linker fills in
FamilySearch's Add Child form on the father's page in a tab, and lists the people
FamilySearch thinks may be the same.

- **Use this person** links one of them into the family and pairs the row with them.
- **Create person** creates the person on FamilySearch and pairs the row with them.
- **Cancel** closes the panel and FamilySearch's form; nothing is saved.

FamilySearch's form takes no christening or burial; tick those under **Add to
FamilySearch** once the new person is paired, or add them on their page.

## 9. Start from a record on Digitalarkivet

On any record page on Digitalarkivet (in English, Bokmål or Nynorsk), click the
extension's toolbar icon. The linker opens with that record. It doesn't matter whose
page in the record you have open: on a baptism, the source still describes the child.

The linker pairs the record with the last person you searched for from FamilySearch,
when their name is in the record. Otherwise, type the person's FamilySearch ID in the
box at the top.

## 10. When something goes wrong

| What you see | What to do |
|---|---|
| A bar: "The extension may not read … yet", with **Allow access** | Click it and allow the sites. Firefox, and Chrome with site access "On click", ask once. |
| "Digital Arkivet refused requests …" or "… is not answering" | Digitalarkivet limits how fast it may be asked, and is sometimes down. The extension waits (15 minutes after a refusal, 5 after an outage); **Try again now** asks at once. |
| "… perhaps the sign-in page. Please sign in to FamilySearch and try again." | Sign in to FamilySearch in a tab of this browser, then try again. |
| "FamilySearch's security service blocked the page …" | Open FamilySearch in a tab of this browser; its page says what to do. Then try again. |
| A step failed and "The FamilySearch tab is left open where it stopped." | Look at the tab: a dialog may need you, or FamilySearch was slow. Steps that went through are done; running the linker again skips what's there already (the source, attachments, tags). |
| "The source … in your SourceBox has this title but is of another record" | Two records share a title. Change this one's title (add a name or the date) and try again. Nothing was changed. |
| A FamilySearch window pops up and goes again | That's the linker reading FamilySearch. Leave it; it closes by itself. |
| In Firefox, the extension is gone after a restart | A temporary add-on lasts until Firefox closes. Load it again from `about:debugging`; your data is kept. |
| No **Digital Arkivet** entry on a FamilySearch person page | Reload the page. After updating the extension, open FamilySearch tabs get it back by themselves, but a tab left asleep may not. |

## 11. Report a problem

At the top of the search page and the linker, **Report on GitHub** copies a report of
the page (the version, the browser, the record, what the extension found and did) and
opens a new issue on GitHub to paste it into. Say what you expected and what happened.
**Copy report** only copies it, for an e-mail or a message.

Issues on GitHub are public. Read the report before you submit it: it names the tree
persons you paired, with their FamilySearch IDs. Take out living people. Don't paste
FamilySearch pages.

## 12. Good habits

- **Check the record, not only the score.** The score is a guide. Open the record on
  Digitalarkivet, and the scanned image when there is one, before you attach.
- **Names are spelled many ways.** Jon, Joen and John; Siri, Sirj and Siry; Halvorsen
  and Halvardsen. The extension treats these as close, but a parent's name can be
  transcribed far off. One ✗ on a relative isn't enough to reject a record; several are.
- **Patronymics are surnames; farms are addresses.** In "Lars Halvorsen Bakken",
  Halvorsen is the surname and Bakken the farm he lived on, which changed when he
  moved. The extension searches by the patronymic first.
- **Look over the pairs in a census.** Two men of the same name and age at one farm
  happen. When the linker isn't sure, it leaves the row unpaired and says why.
- **Take the suggestions as suggestions.** Every fact to add, every surname, every pair
  can be changed or left out. You know the family; the extension only reads the record.
