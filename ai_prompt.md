**Goal**
Write browser extensions for Chrome, Firefox, and Safari using python to parse data from web pages using BeautifulSoup. The purpose of the extension, arkivet2fs, is to gather data about a person or family from Norway's Digital Archive, and format it into a form suitable for creating a source record on FamilySearch.org, the LDS genealogy website. For convenience, I will henceforth refer to the Digital Archive and its url digitalarkivet.no as DA, and FamilySearch and its url familysearch.org as FS.
The information in DA comes from scanned images of original church and other public records. Those images have then been transcribed and indexed to create a searchable database of records. DA assigns Permanent IDs to persons, locations, images, and other types of objects.
Permanent IDs consist of two alpha characters followed by fourteen (14) numeric digits.
We will assume that in the future the number of digits may increase as the archive grows in size.
Once assigned by the DigitalArkivet, Permanent IDs are guaranteed to never change.

**Recognized types of IDs.**
IDs beginning with:
	'p'	are thought to represent persons
	'pd'	persons from birth/baptism record
	'pf'	persons from census records (Folketellinger)
	'pg'	persons from death/burial record
	'pv'	persons from marriage record
	'pe'	persons from emmigration records
	'pt'	persons from accounts and tax records
	'pl'	persons from school records
	'pm'	persons from landed property records
	'pa'	persons from probate records and misc. sources
	'pb'	persons from fire insurance records
	'pc'	persons from other misc. records
	'om'	administrative area (Skipreide)
	'bf'	residence or farm (gårder/bruk/hus)
	'tf'	census district
	'gm'	information from farm records
	'kb'	images from church books (Kirke Bøker)
	'ft'	images from census records (Folketellinger)

Additional types will be added as they are discovered.

Given any Permanent ID, the corresponding url for index or image can be obtained
by pre-pending 'https://digitalarkivet.no/en/'. Due to redirection, a url pointing to DA may not contain the Permanent ID, but the ID will be found in the contents of the retrieved page.

Beginning at a Person Details page on FS (eg https://www.familysearch.org/en/tree/person/details/XXXX-XXX) the extension would add a search option for DigitalArkivet with the DA's standard icon. Clicking on that selection would gather name and other details available on that page and then open a new tab for a person search on DA. Search details need to be selectable or deselected until one or more matching records is found. (eg https://www.digitalarkivet.no/en/search/persons/advanced?from=&to=&firstname=Jenny&lastname=Lindeman&genders%5B%5D=k&birth_year_from=&birth_year_to=&birth_date=&birth_place=&domicile=&position=&event_year_from=&event_year_to=&event_date=&related_first_name=&related_last_name=&related_birth_year=).
The user would then select an individual from this list opening the detailed page. Once they have verfied it matches the desired individual, the user will click on the Arkivet2FS extension logo in the upper toolbar. This will launch the process of gathering information about the person or persons on the record and in some cases from linked records. The extension will then open another tab with a FS sourceBox (https://www.familysearch.org/en/tree/sources/sourceBox) filling in the collected infomation in a standard format. I would like to be able to add tags for each person mentioned in the record and their role (husband, wife, mother, father, child, etc.) just as the FamilySearch option does, but I haven't yet figured out how to do that without an API key.
The user is presented with a filled out sourceBox and given the opportunity to modify it if necessary. When satisfied, the user saves and closes the sourceBox. They can then go back to the search results and repeat the process for additional matches.
The types of records we need to process include birth & baptism, marriage, death, and census. Other types or records like property, tax, emmigration, etc may be added in the future.
If you have any questions about the record formats, please ask.

