// Norwegian places for the DA search (Phase 2): DA's counties (c[]) and municipalities
// (m[]), FS's and DA's old and new place names, and FS place → municipality codes.
// Loaded by search.html before da_search.js and da_match.js.
//
// The lists are DA's own, read from the advanced-search form
// (/en/search/persons/advanced) in November 2026. A municipality's code starts with
// its county's. DA uses the historical municipalities (Aker, Vigmostad, ...), as the
// church books do; Oslo (03) and Bergen (13) are counties of one municipality.

const DA_COUNTIES = {
  '01': 'Østfold', '02': 'Akershus', '03': 'Oslo', '04': 'Hedmark', '05': 'Oppland', '06': 'Buskerud', '07': 'Vestfold', '08': 'Telemark', '09': 'Aust-Agder', '10': 'Vest-Agder', '11': 'Rogaland', '12': 'Hordaland', '13': 'Bergen', '14': 'Sogn og Fjordane', '15': 'Møre og Romsdal', '16': 'Sør-Trøndelag', '17': 'Nord-Trøndelag', '18': 'Nordland', '19': 'Troms', '20': 'Finnmark'
};

const DA_MUNICIPALITIES = {
  '0101': 'Halden', '0102': 'Sarpsborg', '0103': 'Fredrikstad', '0104': 'Moss', '0111': 'Hvaler',
  '0112': 'Torsnes', '0113': 'Borge', '0114': 'Varteig', '0115': 'Skjeberg', '0116': 'Berg',
  '0117': 'Idd', '0118': 'Aremark', '0119': 'Øymark', '0120': 'Rødenes', '0121': 'Rømskog',
  '0122': 'Trøgstad', '0123': 'Spydeberg', '0124': 'Askim', '0125': 'Eidsberg', '0126': 'Mysen',
  '0127': 'Skiptvet', '0128': 'Rakkestad', '0129': 'Degernes', '0130': 'Tune', '0131': 'Rolvsøy',
  '0132': 'Glemmen', '0133': 'Kråkerøy', '0134': 'Onsøy', '0135': 'Råde', '0136': 'Rygge',
  '0137': 'Våler', '0138': 'Hobøl',
  '0201': 'Son', '0203': 'Drøbak', '0211': 'Vestby', '0212': 'Kråkstad', '0213': 'Ski',
  '0214': 'Ås', '0215': 'Frogn', '0216': 'Nesodden', '0217': 'Oppegård', '0218': 'Aker',
  '0219': 'Bærum', '0220': 'Asker', '0221': 'Søndre Høland', '0222': 'Nordre Høland',
  '0223': 'Setskog', '0224': 'Aurskog', '0225': 'Blaker', '0226': 'Sørum', '0227': 'Fet',
  '0228': 'Rælingen', '0229': 'Enebakk', '0230': 'Lørenskog', '0231': 'Skedsmo',
  '0232': 'Lillestrøm', '0233': 'Nittedal', '0234': 'Gjerdrum', '0235': 'Ullensaker', '0236': 'Nes',
  '0237': 'Eidsvoll', '0238': 'Nannestad', '0239': 'Hurdal', '0240': 'Feiring',
  '0301': 'Oslo',
  '0401': 'Hamar', '0402': 'Kongsvinger', '0411': 'Nes', '0412': 'Ringsaker', '0413': 'Furnes',
  '0414': 'Vang', '0415': 'Løten', '0416': 'Romedal', '0417': 'Stange', '0418': 'Nord-Odal',
  '0419': 'Sør-Odal', '0420': 'Eidskog', '0421': 'Vinger', '0422': 'Brandval', '0423': 'Grue',
  '0424': 'Hof', '0425': 'Åsnes', '0426': 'Våler', '0427': 'Elverum', '0428': 'Trysil',
  '0429': 'Åmot', '0430': 'Stor-Elvdal', '0431': 'Sollia', '0432': 'Ytre Rendal',
  '0433': 'Øvre Rendal', '0434': 'Engerdal', '0435': 'Os', '0436': 'Tolga', '0437': 'Tynset',
  '0438': 'Alvdal', '0439': 'Folldal', '0440': 'Kvikne',
  '0501': 'Lillehammer', '0502': 'Gjøvik', '0511': 'Dovre', '0512': 'Lesja', '0513': 'Skjåk',
  '0514': 'Lom', '0515': 'Vågå', '0516': 'Heidal', '0517': 'Sel', '0518': 'Nord-Fron',
  '0519': 'Sør-Fron', '0520': 'Ringebu', '0521': 'Øyer', '0522': 'Østre Gausdal',
  '0523': 'Vestre Gausdal', '0524': 'Fåberg', '0525': 'Biri', '0526': 'Snertingdal',
  '0527': 'Vardal', '0528': 'Østre Toten', '0529': 'Vestre Toten', '0530': 'Eina', '0531': 'Kolbu',
  '0532': 'Jevnaker', '0533': 'Lunner', '0534': 'Gran', '0535': 'Brandbu', '0536': 'Søndre Land',
  '0537': 'Fluberg', '0538': 'Nordre Land', '0539': 'Torpa', '0540': 'Sør-Aurdal',
  '0541': 'Etnedal', '0542': 'Nord-Aurdal', '0543': 'Vestre Slidre', '0544': 'Øystre Slidre',
  '0545': 'Vang',
  '0601': 'Hønefoss', '0602': 'Drammen', '0604': 'Kongsberg', '0611': 'Tyristrand', '0612': 'Hole',
  '0613': 'Norderhov', '0614': 'Ådal', '0615': 'Flå', '0616': 'Nes', '0617': 'Gol',
  '0618': 'Hemsedal', '0619': 'Ål', '0620': 'Hol', '0621': 'Sigdal', '0622': 'Krødsherad',
  '0623': 'Modum', '0624': 'Øvre Eiker', '0625': 'Nedre Eiker', '0626': 'Lier', '0627': 'Røyken',
  '0628': 'Hurum', '0629': 'Ytre Sandsvær', '0630': 'Øvre Sandsvær', '0631': 'Flesberg',
  '0632': 'Rollag', '0633': 'Nore', '0634': 'Uvdal',
  '0701': 'Svelvik', '0702': 'Holmestrand', '0703': 'Horten', '0704': 'Åsgårdstrand',
  '0705': 'Tønsberg', '0706': 'Sandefjord', '0707': 'Larvik', '0708': 'Stavern', '0711': 'Strømm',
  '0712': 'Skoger', '0713': 'Sande', '0714': 'Hof', '0715': 'Botne', '0716': 'Våle',
  '0717': 'Borre', '0718': 'Ramnes', '0719': 'Andebu', '0720': 'Stokke', '0721': 'Sem',
  '0722': 'Nøtterøy', '0723': 'Tjøme', '0724': 'Sandar', '0725': 'Tjølling', '0726': 'Brunlanes',
  '0727': 'Hedrum', '0728': 'Lardal',
  '0801': 'Kragerø', '0802': 'Langesund', '0803': 'Stathelle', '0804': 'Brevik',
  '0805': 'Porsgrunn', '0806': 'Skien', '0807': 'Notodden', '0811': 'Siljan', '0812': 'Gjerpen',
  '0813': 'Eidanger', '0814': 'Bamble', '0815': 'Skåtøy', '0816': 'Sannidal', '0817': 'Drangedal',
  '0818': 'Solum', '0819': 'Holla', '0820': 'Lunde', '0821': 'Bø', '0822': 'Sauherad',
  '0823': 'Heddal', '0824': 'Gransherad', '0825': 'Hovin', '0826': 'Tinn', '0827': 'Hjartdal',
  '0828': 'Seljord', '0829': 'Kviteseid', '0830': 'Nissedal', '0831': 'Fyresdal', '0832': 'Mo',
  '0833': 'Lårdal', '0834': 'Vinje', '0835': 'Rauland',
  '0901': 'Risør', '0902': 'Tvedestrand', '0903': 'Arendal', '0904': 'Grimstad',
  '0905': 'Lillesand', '0911': 'Gjerstad', '0912': 'Vegårshei', '0913': 'Søndeled', '0914': 'Holt',
  '0915': 'Dypvåg', '0916': 'Flosta', '0917': 'Stokken', '0918': 'Austre Moland', '0919': 'Froland',
  '0920': 'Øyestad', '0921': 'Tromøy', '0922': 'Hisøy', '0923': 'Fjære', '0924': 'Landvik',
  '0925': 'Eide', '0926': 'Vestre Moland', '0927': 'Høvåg', '0928': 'Birkenes', '0929': 'Åmli',
  '0930': 'Gjøvdal', '0931': 'Tovdal', '0932': 'Mykland', '0933': 'Herefoss', '0934': 'Vegusdal',
  '0935': 'Iveland', '0936': 'Hornnes', '0937': 'Evje', '0938': 'Bygland', '0939': 'Hylestad',
  '0940': 'Valle', '0941': 'Bykle',
  '1001': 'Kristiansand', '1002': 'Mandal', '1003': 'Farsund', '1004': 'Flekkefjord',
  '1011': 'Randesund', '1012': 'Oddernes', '1013': 'Tveit', '1014': 'Vennesla', '1015': 'Hægeland',
  '1016': 'Øvrebø', '1017': 'Greipstad', '1018': 'Søgne', '1019': 'Halse og Harkmark',
  '1020': 'Holum', '1021': 'Øyslebø', '1022': 'Laudal', '1023': 'Finsland', '1024': 'Bjelland',
  '1025': 'Grindheim', '1026': 'Åseral', '1027': 'Konsmo', '1028': 'Vigmostad',
  '1029': 'Sør-Audnedal', '1030': 'Spangereid', '1031': 'Austad', '1032': 'Lyngdal', '1033': 'Kvås',
  '1034': 'Hægebostad', '1035': 'Eiken', '1036': 'Fjotland', '1037': 'Kvinesdal', '1038': 'Feda',
  '1039': 'Herad', '1040': 'Spind', '1041': 'Lista', '1042': 'Hidra', '1043': 'Nes',
  '1044': 'Gyland', '1045': 'Bakke', '1046': 'Tonstad', '1047': 'Øvre Sirdal',
  '1101': 'Egersund', '1102': 'Sandnes', '1103': 'Stavanger', '1104': 'Skudeneshavn',
  '1105': 'Kopervik', '1106': 'Haugesund', '1111': 'Sokndal', '1112': 'Lund', '1113': 'Heskestad',
  '1114': 'Bjerkreim', '1115': 'Helleland', '1116': 'Eigersund herred', '1117': 'Ogna',
  '1118': 'Varhaug', '1119': 'Nærbø', '1120': 'Klepp', '1121': 'Time', '1122': 'Gjesdal',
  '1123': 'Høyland', '1124': 'Sola', '1125': 'Madla', '1126': 'Hetland', '1127': 'Randaberg',
  '1128': 'Høle', '1129': 'Forsand', '1130': 'Strand', '1131': 'Årdal', '1132': 'Fister',
  '1133': 'Hjelmeland', '1134': 'Suldal', '1135': 'Sauda', '1136': 'Sand', '1137': 'Erfjord',
  '1138': 'Jelsa', '1139': 'Nedstrand', '1140': 'Sjernarøy', '1141': 'Finnøy', '1142': 'Rennesøy',
  '1143': 'Mosterøy', '1144': 'Kvitsøy', '1145': 'Bokn', '1146': 'Tysvær', '1147': 'Avaldsnes',
  '1148': 'Stangaland', '1149': 'Åkra', '1150': 'Skudenes', '1151': 'Utsira', '1152': 'Torvastad',
  '1153': 'Skåre', '1154': 'Skjold', '1155': 'Vats', '1156': 'Imsland', '1157': 'Vikedal',
  '1158': 'Sandeid',
  '1211': 'Etne', '1212': 'Skånevik', '1213': 'Fjelberg', '1214': 'Ølen', '1215': 'Vikebygd',
  '1216': 'Sveio', '1217': 'Valestrand', '1218': 'Moster', '1219': 'Bømlo', '1220': 'Bremnes',
  '1221': 'Stord', '1222': 'Fitjar', '1223': 'Tysnes', '1224': 'Kvinnherad', '1225': 'Varaldsøy',
  '1226': 'Strandebarm', '1227': 'Jondal', '1228': 'Odda', '1229': 'Røldal', '1230': 'Ullensvang',
  '1231': 'Kinsarvik', '1232': 'Eidfjord', '1233': 'Ulvik', '1234': 'Granvin', '1235': 'Voss',
  '1236': 'Vossestrand', '1237': 'Evanger', '1238': 'Kvam', '1239': 'Hålandsdal',
  '1240': 'Strandvik', '1241': 'Fusa', '1242': 'Samnanger', '1243': 'Os', '1244': 'Austevoll',
  '1245': 'Sund', '1246': 'Fjell', '1247': 'Askøy', '1248': 'Laksevåg', '1249': 'Fana',
  '1250': 'Haus', '1251': 'Bruvik', '1252': 'Modalen', '1253': 'Hosanger', '1254': 'Hamre',
  '1255': 'Åsane', '1256': 'Mæland', '1257': 'Alversund', '1258': 'Herdla', '1259': 'Hjelme',
  '1260': 'Hordabø', '1261': 'Manger', '1262': 'Sæbø', '1263': 'Lindås', '1264': 'Austrheim',
  '1265': 'Fedje', '1266': 'Masfjorden',
  '1301': 'Bergen',
  '1401': 'Florø', '1411': 'Gulen', '1412': 'Solund', '1413': 'Hyllestad', '1414': 'Brekke',
  '1415': 'Lavik', '1416': 'Kyrkjebø', '1417': 'Vik', '1418': 'Balestrand', '1419': 'Leikanger',
  '1420': 'Sogndal', '1421': 'Aurland', '1422': 'Lærdal', '1423': 'Borgund', '1424': 'Årdal',
  '1425': 'Hafslo', '1426': 'Luster', '1427': 'Jostedal', '1428': 'Askvoll', '1429': 'Fjaler',
  '1430': 'Gaular', '1431': 'Jølster', '1432': 'Førde', '1433': 'Naustdal', '1434': 'Vevring',
  '1435': 'Eikefjord', '1436': 'Bru', '1437': 'Kinn', '1438': 'Bremanger', '1439': 'Sør-Vågsøy',
  '1440': 'Nord-Vågsøy', '1441': 'Selje', '1442': 'Davik', '1443': 'Eid', '1444': 'Hornindal',
  '1445': 'Gloppen', '1446': 'Breim', '1447': 'Innvik', '1448': 'Stryn',
  '1501': 'Ålesund', '1502': 'Molde', '1503': 'Kristiansund', '1511': 'Vanylven', '1512': 'Syvde',
  '1513': 'Rovde', '1514': 'Sande', '1515': 'Herøy', '1516': 'Ulstein', '1517': 'Hareid',
  '1518': 'Dalsfjord', '1519': 'Volda', '1520': 'Ørsta', '1521': 'Vartdal', '1522': 'Hjørundfjord',
  '1523': 'Sunnylven', '1524': 'Norddal', '1525': 'Stranda', '1526': 'Stordal', '1527': 'Ørskog',
  '1528': 'Sykkylven', '1529': 'Skodje', '1530': 'Vatne', '1531': 'Borgund', '1532': 'Giske',
  '1533': 'Vigra', '1534': 'Haram', '1535': 'Vestnes', '1536': 'Tresfjord', '1537': 'Voll',
  '1538': 'Eid', '1539': 'Grytten', '1540': 'Hen', '1541': 'Veøy', '1542': 'Eresfjord og Vistdal',
  '1543': 'Nesset', '1544': 'Bolsøy', '1545': 'Sør-Aukra', '1546': 'Sandøy', '1547': 'Nord-Aukra',
  '1548': 'Fræna', '1549': 'Bud', '1550': 'Hustad', '1551': 'Eide', '1552': 'Kornstad',
  '1553': 'Kvernes', '1554': 'Bremsnes', '1555': 'Grip', '1556': 'Frei', '1557': 'Gjemnes',
  '1558': 'Øre', '1559': 'Straumsnes', '1560': 'Tingvoll', '1561': 'Øksendal', '1562': 'Ålvundeid',
  '1563': 'Sunndal', '1564': 'Stangvik', '1565': 'Åsskard', '1566': 'Surnadal', '1567': 'Rindal',
  '1568': 'Stemshaug', '1569': 'Aure', '1570': 'Valsøyfjord', '1571': 'Halsa', '1572': 'Tustna',
  '1573': 'Edøy', '1574': 'Brattvær', '1575': 'Hopen',
  '1601': 'Trondheim', '1611': 'Vinje', '1612': 'Hemne', '1613': 'Snillfjord', '1614': 'Heim',
  '1615': 'Sandstad', '1616': 'Fillan', '1617': 'Hitra', '1618': 'Kvenvær', '1619': 'Sør-Frøya',
  '1620': 'Nord-Frøya', '1621': 'Ørland', '1622': 'Agdenes', '1623': 'Lensvik', '1624': 'Rissa',
  '1625': 'Stadsbygd', '1626': 'Stjørna', '1627': 'Bjugn', '1628': 'Nes', '1629': 'Jøssund',
  '1630': 'Aa', '1631': 'Stoksund', '1632': 'Roan', '1633': 'Osen', '1634': 'Opdal',
  '1635': 'Rennebu', '1636': 'Meldal', '1637': 'Orkland', '1638': 'Orkdal', '1639': 'Orkanger',
  '1640': 'Røros', '1641': 'Røros Landdistrikt', '1642': 'Brekken', '1643': 'Glåmos',
  '1644': 'Ålen', '1645': 'Haltdalen', '1646': 'Singsås', '1647': 'Budal', '1648': 'Støren',
  '1649': 'Soknedal', '1650': 'Horg', '1651': 'Hølonda', '1652': 'Flå', '1653': 'Melhus',
  '1654': 'Leinstrand', '1655': 'Byneset', '1656': 'Buvik', '1657': 'Skaun', '1658': 'Børsa',
  '1659': 'Geitastrand', '1660': 'Strinda', '1661': 'Tiller', '1662': 'Klæbu', '1663': 'Malvik',
  '1664': 'Selbu', '1665': 'Tydal',
  '1701': 'Levanger', '1702': 'Steinkjer', '1703': 'Namsos', '1711': 'Meråker', '1712': 'Hegra',
  '1713': 'Lånke', '1714': 'Stjørdal', '1715': 'Skatval', '1716': 'Åsen', '1717': 'Frosta',
  '1718': 'Leksvik', '1719': 'Skogn', '1720': 'Frol', '1721': 'Verdal', '1722': 'Ytterøy',
  '1723': 'Mosvik', '1724': 'Verran', '1725': 'Namdalseid', '1726': 'Malm', '1727': 'Beitstad',
  '1728': 'Sandvollan', '1729': 'Inderøy', '1730': 'Røra', '1731': 'Sparbu', '1732': 'Ogndal',
  '1733': 'Egge', '1734': 'Stod', '1735': 'Kvam', '1736': 'Snåsa', '1737': 'Sørli',
  '1738': 'Nordli', '1739': 'Røyrvik', '1740': 'Namsskogan', '1741': 'Harran', '1742': 'Grong',
  '1743': 'Høylandet', '1744': 'Overhalla', '1745': 'Vemundvik', '1746': 'Klinga',
  '1747': 'Otterøy', '1748': 'Fosnes', '1749': 'Flatanger', '1750': 'Vikna', '1751': 'Nærøy',
  '1752': 'Kolvereid', '1753': 'Foldereid', '1754': 'Gravvik', '1755': 'Leka',
  '1801': 'Brønnøysund', '1802': 'Mosjøen', '1803': 'Mo', '1804': 'Bodø', '1805': 'Narvik',
  '1806': 'Svolvær', '1811': 'Bindal', '1812': 'Sømna', '1813': 'Velfjord', '1814': 'Brønnøy',
  '1815': 'Vega', '1816': 'Vevelstad', '1817': 'Tjøtta', '1818': 'Herøy', '1819': 'Nordvik',
  '1820': 'Alstahaug', '1821': 'Stamnes', '1822': 'Leirfjord', '1823': 'Drevja', '1824': 'Vefsn',
  '1825': 'Grane', '1826': 'Hattfjelldal', '1827': 'Dønnes', '1828': 'Nesna', '1829': 'Elsfjord',
  '1830': 'Korgen', '1831': 'Sør-Rana', '1832': 'Hemnes', '1833': 'Nord-Rana', '1834': 'Lurøy',
  '1835': 'Træna', '1836': 'Rødøy', '1837': 'Meløy', '1838': 'Gildeskål', '1839': 'Beiarn',
  '1840': 'Saltdal', '1841': 'Fauske', '1842': 'Skjerstad', '1843': 'Bodin', '1844': 'Kjerringøy',
  '1845': 'Sørfold', '1846': 'Nordfold', '1847': 'Leiranger', '1848': 'Steigen', '1849': 'Hamarøy',
  '1850': 'Tysfjord', '1851': 'Lødingen', '1852': 'Tjeldsund', '1853': 'Evenes',
  '1854': 'Ballangen', '1855': 'Ankenes', '1856': 'Røst', '1857': 'Værøy', '1858': 'Moskenes',
  '1859': 'Flakstad', '1860': 'Buksnes', '1861': 'Hol', '1862': 'Borge', '1863': 'Valberg',
  '1864': 'Gimsøy', '1865': 'Vågan', '1866': 'Hadsel', '1867': 'Bø', '1868': 'Øksnes',
  '1869': 'Langenes', '1870': 'Sortland', '1871': 'Bjørnskinn', '1872': 'Dverberg',
  '1873': 'Andenes',
  '1901': 'Harstad', '1902': 'Tromsø', '1911': 'Kvæfjord', '1912': 'Sandtorg', '1913': 'Skånland',
  '1914': 'Trondenes', '1915': 'Bjarkøy', '1916': 'Andørja', '1917': 'Ibestad', '1918': 'Astafjord',
  '1919': 'Gratangen', '1920': 'Lavangen', '1921': 'Salangen', '1922': 'Bardu', '1923': 'Øverbygd',
  '1924': 'Målselv', '1925': 'Sørreisa', '1926': 'Dyrøy', '1927': 'Tranøy', '1928': 'Torsken',
  '1929': 'Berg', '1930': 'Hillesøy', '1931': 'Lenvik', '1932': 'Malangen', '1933': 'Balsfjord',
  '1934': 'Tromsøysund', '1935': 'Helgøy', '1936': 'Karlsøy', '1937': 'Ullsfjord', '1938': 'Lyngen',
  '1939': 'Storfjord', '1940': 'Kåfjord', '1941': 'Skjervøy', '1942': 'Nordreisa',
  '1943': 'Kvænangen',
  '2001': 'Hammerfest', '2002': 'Vardø', '2003': 'Vadsø', '2011': 'Kautokeino', '2012': 'Alta',
  '2013': 'Talvik', '2014': 'Loppa', '2015': 'Hasvik', '2016': 'Sørøysund', '2017': 'Kvalsund',
  '2018': 'Måsøy', '2019': 'Kjelvik', '2020': 'Kistrand', '2021': 'Karasjok', '2022': 'Lebesby',
  '2023': 'Gamvik', '2024': 'Berlevåg', '2025': 'Tana', '2026': 'Polmak', '2027': 'Nesseby',
  '2028': 'Vardø landsogn', '2029': 'Nord-Varanger', '2030': 'Sør-Varanger'
};

// Old and new names for the same place. Each list is one place, its present name
// first; any of its names in an FS place matches any of them in a DA hit.
const PLACE_ALIASES = [
  ['oslo', 'christiania', 'kristiania', 'chra', 'chria', 'chrania', 'kria'],
  ['trondheim', 'trondhjem', 'thjem', 'nidaros'],
  // Towns as clerks abbreviated them (emigrant protocols, moving lists)
  ['fredrikstad', 'frederikstad', 'fr.stad', 'frstad', 'fstad'],
  ['halden', 'fredrikshald', 'frederikshald', 'fr.hald', 'frhald'],
  ['kristiansand', 'christianssand', 'christiansand', 'chr.sand', 'kr.sand'],
  ['kristiansund', 'christianssund', 'christiansund', 'chr.sund', 'kr.sund'],
  ['vest-agder', 'lister og mandal'],
  ['aust-agder', 'nedenes'],
  ['buskerud', 'buskeruds'],
  ['akershus', 'aggershus'],
  ['hedmark', 'hedemarken'],
  ['oppland', 'christians', 'kristians'],
  ['telemark', 'bratsberg'],
  ['vestfold', 'jarlsberg og larvik'],
  ['østfold', 'smaalenene', 'smålenene'],
  ['rogaland', 'stavanger amt'],
  ['hordaland', 'søndre bergenhus'],
  ['sogn og fjordane', 'nordre bergenhus'],
  ['møre og romsdal', 'romsdal'],
  ['sør-trøndelag', 'søndre trondhjem'],
  ['nord-trøndelag', 'nordre trondhjem'],
  ['troms', 'tromsø amt'],
  ['finnmark', 'finmarken']
];

// Municipalities searched along with another: Oslo's suburbs and several of its
// parishes belonged to Aker until 1948
const MUNICIPALITY_NEIGHBOURS = { '0301': ['0218'] };

const foldPlace = (s) => (s || '').toLowerCase().trim();

// A place name with its other names (PLACE_ALIASES)
function placeAliases(name) {
  return PLACE_ALIASES.find((list) => list.includes(foldPlace(name))) || [foldPlace(name)];
}

function municipalityName(code) { return DA_MUNICIPALITIES[code] || code; }
function countyName(code) { return DA_COUNTIES[code] || code; }
// Every municipality's or county's code (for the search page's place picker)
function municipalityCodeList() { return Object.keys(DA_MUNICIPALITIES); }
function countyCodeList() { return Object.keys(DA_COUNTIES); }

// Folded name → codes, for municipalities and counties
let placeIndex = null;
function placeCodes(name) {
  if (!placeIndex) {
    placeIndex = { m: new Map(), c: new Map() };
    const add = (map, n, code) => map.set(foldPlace(n), [...(map.get(foldPlace(n)) || []), code]);
    for (const [code, n] of Object.entries(DA_MUNICIPALITIES)) add(placeIndex.m, n, code);
    for (const [code, n] of Object.entries(DA_COUNTIES)) add(placeIndex.c, n, code);
  }
  const lookup = (map) => [...new Set(placeAliases(name).flatMap((n) => map.get(n) || []))];
  return { municipalities: lookup(placeIndex.m), counties: lookup(placeIndex.c) };
}

// An FS place ("Hægebostad, Vest-Agder, Norway") → the DA municipality codes it
// names, with their neighbours. A name several counties have (Nes, Våler, ...) is
// narrowed to the FS place's county when it names one. A part can be a farm with a
// municipality's name (Hægebostad); a query on it then finds nothing, which is why
// the parent queries don't use places.
function municipalityCodes(place) {
  const parts = (place || '').split(',').map((p) => p.trim()).filter(Boolean);
  const found = parts.map(placeCodes);
  const counties = found.flatMap((f) => f.counties);
  const codes = [];
  for (const { municipalities } of found) {
    const inCounty = municipalities.filter((code) => counties.includes(code.slice(0, 2)));
    codes.push(...(municipalities.length > 1 && inCounty.length ? inCounty : municipalities));
  }
  return [...new Set(codes.flatMap((code) => [code, ...(MUNICIPALITY_NEIGHBOURS[code] || [])]))];
}

// An FS place → the DA county codes it lies in: the counties it names and those of
// the municipalities it names (a municipality's code starts with its county's)
function countyCodes(place) {
  const parts = (place || '').split(',').map((p) => p.trim()).filter(Boolean);
  const named = parts.flatMap((part) => placeCodes(part).counties);
  return [...new Set([...named, ...municipalityCodes(place).map((code) => code.slice(0, 2))])].filter((code) => code in DA_COUNTIES);
}
