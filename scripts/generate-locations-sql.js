// Script to generate SQL INSERT statements for location listings
// Run: node scripts/generate-locations-sql.js > supabase/seed-locations.sql

const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
  'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME',
  'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
  'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE',
  'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Portland': 'OR',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
};

const TYPE_MAP = {
  'Apartment Building': 'apartment',
  'Apartment Complex': 'apartment',
  'Office': 'office',
  'Office Complex': 'office',
  'Manufacturing Facility': 'warehouse',
  'Facility': 'other',
  'Car Wash': 'other',
  'Retail Establishment': 'retail',
  'Community Clubhouse': 'other',
  'Warehouse': 'warehouse',
  'Hotel / Motel': 'hotel',
  'Hotel / motel': 'hotel',
  'Distribution Center': 'warehouse',
  'Assisted Living Facility': 'hospital',
  'Production Facility': 'warehouse',
  'Automotive Location': 'other',
  'Sports Facility': 'gym',
  'Medical Facility': 'hospital',
  'School': 'school',
  'Nursing Home': 'hospital',
  'Transportation Facility': 'other',
  'Car Dealer': 'other',
  'Gym': 'gym',
  'Outdoor Facility': 'other',
  'Seasonal Living Facility': 'other',
};

const rows = `05/01/2026	Apartment Building	Louisville/Kentucky/40272	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$1,100	$1,210
05/01/2026	Apartment Building	Prattville/Alabama/36066	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$900	$990
05/01/2026	Apartment Building	Springfield/Illinois/62704	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$860	$946
05/01/2026	Office	Waterloo/Iowa/50701	OFFICE 50 EMPS!(COFFEE)	$740	$814
05/01/2026	Apartment Building	Independence/Missouri/64057	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$680	$748
05/01/2026	Apartment Building	Madison/Wisconsin/53719	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$780	$858
05/01/2026	Apartment Building	Gurnee/Illinois/60031	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$1,400	$1,540
05/01/2026	Office	Houston/Texas/77021	OFFICE 10 EMPS 12 CUSTOMERS!	$420	$462
05/01/2026	Apartment Building	Port Huron/Michigan/48060	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$820	$902
05/01/2026	Apartment Building	Richmond/Virginia/23231	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$820	$902
05/01/2026	Apartment Building	Battle Creek/Michigan/49014	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$940	$1,034
05/01/2026	Manufacturing Facility	River Falls/Wisconsin/54022	MANUFACTURING 30 EMPS CARD ALLOWANCE!	$620	$682
05/01/2026	Apartment Building	Jackson/Mississippi/39211	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$1,000	$1,100
05/01/2026	Apartment Building	Augusta/Georgia/30906	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$880	$968
05/01/2026	Apartment Building	Macon/Georgia/31220	APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$800	$880
05/01/2026	Apartment Building	Evansville/Indiana/47715	2 APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$900	$990
05/01/2026	Apartment Building	Saint Joseph/Missouri/64506	APARTMENT BUILDING/COMPLEX 4EMPS 385+RES!	$880	$968
05/01/2026	Apartment Building	Lexington/Kentucky/40517	APARTMENT BUILDING/COMPLEX 4EMPS 208+RES!	$880	$968
05/01/2026	Apartment Building	Lincoln/Nebraska/68504	APARTMENT BUILDING/COMPLEX 4EMPS 246+RES!	$680	$748
05/01/2026	Apartment Building	Columbia/Michigan/48187	APARTMENT BUILDING/COMPLEX 4EMPS 192+RES!	$840	$924
05/01/2026	Apartment Building	Auburn/Alabama/36830	APARTMENT BUILDING/COMPLEX 4EMPS 112+RES!	$560	$616
05/01/2026	Apartment Building	Swartz Creek/Michigan/48473	APARTMENT BUILDING/COMPLEX 4EMPS 112+RES!	$840	$924
05/01/2026	Apartment Building	Tallahassee/Florida/32304	2 APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$920	$1,012
05/01/2026	Apartment Building	Mobile/Alabama/36609	3 APARTMENT BUILDING/COMPLEX OPPURTUNITY!	$980	$1,078
05/01/2026	Apartment Building	Prattville/Alabama/36066	APARTMENT BUILDING/COMPLEX 4EMPS 80+RES!	$740	$814
05/01/2026	Apartment Complex	Harker Heights/Texas/76548	APARTMENT COMPLEX 6 EMPS 300 RESIDENTS!	$840	$924
05/01/2026	Office	Fort Walton Beach/Florida/32548	GROWING OFFICE!	$500	$550
05/01/2026	Facility	Palm Desert/California/92211	SEASONAL LIVING FACILITY 14-300+RES!	$800	$880
05/01/2026	Car Wash	Cumming/Georgia/30041	CAR DEALER 35 EMPS!	$480	$528
05/01/2026	Facility	Brooksville/Florida/34604	FACILITY 100+EMPS!	$1,400	$1,540
05/01/2026	Retail Establishment	Braceville/Illinois/60407	RETAIL ESTABLISHMENT 2 EMPS 15 CUSTOMERS!	$480	$528
05/01/2026	Community Clubhouse	Indian Trail/North Carolina/28079	COMMUNITY CLUBHOUSE 800+ RES!	$1,200	$1,320
05/01/2026	Office	Glen Allen/Virginia/23060	OFFICE 30 EMPS!	$580	$638
05/01/2026	Apartment Building	Muskegon/Michigan/49442	APARTMENT BUILDING/COMPLEX 4EMPS 112+RES!	$780	$858
05/01/2026	Office	Waterloo/Iowa/50701	OFFICE 50 EMPS!	$820	$902
04/30/2026	Apartment Building	Knoxville/Tennessee/37920	2 APTS 600 RES! ( COFFEE SERVICE)	$580	$638
04/30/2026	Facility	Easley/South Carolina/29640	FACILITY 8 EMPS 11 CUSTOMERS!	$380	$418
04/30/2026	Warehouse	Laramie/Wyoming/82070	WAREHOUSE 40EMPS!	$580	$638
04/30/2026	Office	Chicago/Illinois/60606	OFFICE 10 EMPS/COFFEE SERVICE!	$380	$418
04/30/2026	Production Facility	Steele/Alabama/35987	PRODUCTION 75 EMPS!	$780	$858
04/30/2026	Assisted Living Facility	Moorhead/Minnesota/56560	ASSISTED LIVING FACILITY 8+EMPS 18+RES!	$380	$418
04/30/2026	Manufacturing Facility	Griffin/Georgia/30224	MANUFACTURING 30EMPS!	$880	$968
04/30/2026	Facility	Miami/Texas/79059	FACILITY 3000 EMPS!	$2,000	$2,200
04/30/2026	Facility	Bay City/Michigan/48706	FACILITY 50EMPS!	$480	$528
04/30/2026	Facility	Bloomington/Indiana/47406	LIVING FACILITY 100 RES!	$480	$528
04/30/2026	Warehouse	Denver/Colorado/80229	WAREHOUSE 70 EMPS!	$980	$1,078
04/30/2026	Office	North Haven/Connecticut/06473	OFFICE 25 HUNGRY EMPS!	$580	$638
04/30/2026	Hotel / Motel	Springhill/Louisiana/71075	HOTEL 50-60 GUESTS!	$540	$594
04/30/2026	Outdoor Facility	South Haven/Michigan/	OUTDOOR FACILITY 72 GUESTS 6 EMPS!	$780	$858
04/30/2026	Office	Washington/District of Columbia/20037	OFFICE COMPLEX 100 EMPS, 40 VIS!	$1,200	$1,320
04/30/2026	Office	Black Hawk/Colorado/80422	3 OFFICE LOCATION OPPURTUNITY! (COFFEE)	$1,800	$1,980
04/30/2026	Facility	Hubbard/Texas/76648	FACILITY 700 EMPS!	$1,200	$1,320
04/30/2026	Office	San Tan Valley/Arizona/85140	OFFICE 50+EMPS!	$880	$968
04/30/2026	Facility	Beverly/Massachusetts/01915	FACILITY 10EMPS 100+STUDENTS!	$1,000	$1,100
04/30/2026	Assisted Living Facility	Venice/Florida/34285	AST.LIVING 75 EMPS, 30 VIS!	$980	$1,078
04/30/2026	Distribution Center	Charlotte/North Carolina/28269	DISTRIBUTION CENTER 45 EMPS, 10 VIS!	$980	$1,078
04/30/2026	Office	Black Hawk/Colorado/80422	3 OFFICE LOCATION OPPURTUNITY!	$1,400	$1,540
04/29/2026	Automotive Location	Libertyville/Illinois/60048	AUTOMOTIVE LOCATION 35 EMPS 40 CUSTOMERS!	$980	$1,078
04/29/2026	Office	Cynthiana/Kentucky/41031	OFFICE 1EMP 10VIS!	$380	$418
04/29/2026	Facility	Chicago/Illinois/60622	FACILITY 50 VIS!	$580	$638
04/29/2026	Manufacturing Facility	Memphis/Tennessee/38106	GROWING MANUFACTURING 15-20 EMPS!	$480	$528
04/29/2026	Office	Shrewsbury/Massachusetts/01545	OFFICE 19EMPS 30VIS!	$660	$726
04/29/2026	Office	Oshkosh/Wisconsin/54904	OFFICE 15 EMPS/ COFFEE SERVICE!	$380	$418
04/29/2026	Office	Baltimore/Maryland/21202	OFFICE 180EMPS!	$1,200	$1,320
04/29/2026	Facility	Lester/Pennsylvania/19029	FACILITY 40 EMPS 10+VIS!	$800	$880
04/29/2026	Manufacturing Facility	Raymond/Wisconsin/53126	MANUFACTURING FACILITY 40 EMPS!	$800	$880
04/29/2026	Warehouse	Tucker/Georgia/30084	WAREHOUSE 10 EMPS, 10-20 VIS!	$620	$682
04/29/2026	Office	Fremont/California/94538	OFFICE 45EMPS 5VIS!	$680	$748
04/29/2026	Office	Brentwood/Tennessee/37027	OFFICE 15-20 EMPS/COFFEE SERVICE!	$480	$528
04/29/2026	Apartment Building	Marathon/Florida/33050	APARTMENT BUILDING 180RES 2EMPS!	$780	$858
04/29/2026	Facility	Sun Prairie/Wisconsin/53590	FACILITY 6-30 EMPS!	$480	$528
04/28/2026	Sports Facility	Boca Raton/Florida/33487	INDOOR SPORTS FACILITY 3EMPS 50+VIS!	$760	$836
04/28/2026	Automotive Location	Fort Pierce/Florida/34945	GROWING AUTOMOTIVE LOCATION !	$800	$880
04/28/2026	Office	Monterey/California/93940	OFFICE 35+EMPS!	$540	$594
04/28/2026	Office Complex	Grand Rapids/Michigan/49505	OFFICE COMPLEX 100 EMPS!	$840	$924
04/28/2026	Facility	Salem/Oregon/97301	FACILITY 2 EMPS 300+ VISITORS!	$980	$1,078
04/28/2026	Facility	Bristol/Connecticut/06010	FACILITY 20+EMPS!	$620	$682
04/28/2026	Hotel / Motel	Orlando/Florida/32819	HOTEL/MOTEL 6 EMPS 300 GUESTS! ( COFFEE VENDING)	$800	$880
04/28/2026	Assisted Living Facility	Pittsburgh/Pennsylvania/15202	SENIOR LIVING FACILITY 6EMPS 101RES!	$840	$924
04/28/2026	Office	Lisle/Illinois/60532	OFFICE 20 EMPS 2 VISITORS!( COFFEE SERVICE)	$900	$990
04/28/2026	Facility	Marshall/Arkansas/72650	FACILITY 100EMPS 3 VIS!	$780	$858
04/28/2026	Facility	Spokane/Washington/99205	FACILITY 12 EMPS 30 VIS (COFFEE SERVICE)	$480	$528
04/28/2026	Facility	Winston-Salem/North Carolina/27101	2 BUILDING PUBLIC FACILITY 200 EMPS, 75 VIS!	$780	$858
04/28/2026	Office Complex	Las Cruces/New Mexico/88005	OFFICE 75 EMPS!	$700	$770
04/28/2026	Manufacturing Facility	Lewes/Delaware/19958	MANUFACTURING 50 EMPS! ( HAS EQUIPMENT!)	$700	$770
04/28/2026	Facility	Toledo/Ohio/43623	PUBLIC FACILITY 25-50 VIS!	$780	$858
04/28/2026	Office	Alexander City/Alabama/35010	OFFICE 20 STUDENTS, 7 EMPS!	$480	$528
04/28/2026	Apartment Building	Grand Rapids/Minnesota/55744	APT 130 RES!	$700	$770
04/28/2026	School	Parachute/Colorado/81635	UPDATE 4/28 SCHOOL 300 STUDENTS 40 EMPS!	$680	$748
04/28/2026	Community Clubhouse	Bonita Springs/Florida/34135	COMMUNITY CLUBHOUSE 463 RES!	$980	$1,078
04/27/2026	Automotive Location	San Jose/California/95122	AUTOMOTIVE LOCATION 14-25+EMPS! (GROWING)	$380	$418
04/27/2026	Facility	Everett/Washington/98201	Facility 2 EMPS 50 CUSTOMERS!	$580	$638
04/27/2026	School	Milwaukee/Wisconsin/53204	SCHOOL 50 STAFF 400+ STUDENTS!	$1,400	$1,540
04/27/2026	Facility	Murfreesboro/Tennessee/37129	FACILITY 25 EMPS!	$580	$638
04/27/2026	School	Philadelphia/Pennsylvania/19146	SCHOOL 100+EMPS!	$1,200	$1,320
04/27/2026	Warehouse	Philadelphia/Pennsylvania/19120	WAREHOUSE 15 EMPS!	$380	$418
04/27/2026	Office	Rochester/New York/14623	OFFICE 75 EMPS!	$680	$748
04/27/2026	Apartment Complex	Pine Ridge/Florida/	APT. COMPLEX 150 RES!	$820	$902
04/27/2026	Retail Establishment	Davidsonville/Maryland/21035	RETAIL 80 EMPS!	$880	$968
04/27/2026	Manufacturing Facility	Montgomeryville/Pennsylvania/18936	MANUFACTURING 70 EMPS !	$980	$1,078
04/27/2026	Manufacturing Facility	Hammond/Louisiana/70401	MANUFACTURING 6 EMPS BUT GROWING!	$380	$418
04/24/2026	Retail Establishment	Richmond Heights/Missouri/63117	RETAIL ESTABLISHMENT 40EMPS!	$580	$638
04/24/2026	Apartment Complex	Washington/Pennsylvania/15301	APARTMENT COMPLEX 4EMPS 180+RES!	$980	$1,078
04/24/2026	Office	Sioux Falls/South Dakota/57108	OFFICE 8EMPS ( COFFEE SERVICE)	$480	$528
04/24/2026	Apartment Building	Bozeman/Montana/59718	APARTMENT BUILDING 400 RES 4 EMPS HAS EQUIPMENT!	$780	$858
04/24/2026	Office	Fremont/California/94538	OFFICE 55 EMPS!	$780	$858
04/24/2026	Production Facility	Loris/South Carolina/29569	PRODUCTION FACILITY 25 EMPS !	$500	$550
04/24/2026	Warehouse	Linden/New Jersey/07036	WAREHOUSE 300 EMPS!	$2,600	$2,860
04/24/2026	Office	Wixom/Michigan/48393	OFFICE 40 EMPS 5VIS!	$880	$968
04/24/2026	Office	Columbia/Missouri/65201	OFFICE 134 EMPS!	$940	$1,034
04/24/2026	Warehouse	Milford/Michigan/48381	WAREHOUSE 12 EMPS GROWING TO 50!	$580	$638
04/24/2026	Office	Chicago/Illinois/60606	OFFICE 60 EMPS!	$980	$1,078
04/24/2026	Office	New York/New York/10011	OFFICE 0-25 EMPS/COFFEE SERVICE!	$480	$528
04/24/2026	Hotel / motel	Guernsey/Wyoming/82214	HOTEL/MOTEL 8 EMPS 50+VIS!	$580	$638
04/24/2026	Transportation Facility	Winter Garden/Florida/34787	TRANSPORTATION FACILITY 40+EMPS 10VIS!	$860	$946
04/24/2026	Nursing Home	Topeka/Kansas/66615	NURSING HOME 80EMPS!	$780	$858
04/24/2026	Office Complex	Denver/Colorado/80204	6 BUILDING OFFICE COMPLEX OPPURTUNITY (600+EMPS)!	$2,200	$2,420
04/24/2026	Facility	Denver/Colorado/80207	FACILITY 200 CUSTOMERS!	$2,000	$2,200
04/24/2026	Office	Bee Cave/Texas/78738	OFFICE 50 EMPS!	$780	$858
04/23/2026	Manufacturing Facility	Tualatin/Oregon/	MANUFACTURING FACILITY 65EMPS!	$880	$968
04/23/2026	Facility	Baltimore/Maryland/21216	PUBLIC FACILITY 200-250 VIS!	$980	$1,078
04/23/2026	Medical Facility	Tulsa/Oklahoma/74116	MEDICAL FACILITY 34+EMPS 10+VIS!	$420	$462
04/23/2026	Facility	Charleston/West Virginia/25314	FACILITY 10 EMPS 40 VIS!	$420	$462
04/23/2026	Facility	Austin/Texas/78704	FACILITY 130+EMPS!	$1,400	$1,540
04/23/2026	Assisted Living Facility	Greendale/Wisconsin/53129	ASSITED LIVING 20 EMPS 80 RES!	$880	$968
04/23/2026	Manufacturing Facility	Clackamas/Portland/97015	MANUFACTURING 50EMPS 2VIS!	$660	$726
04/23/2026	Manufacturing Facility	Marlow/Oklahoma/73055	MANUFACTURING 60 EMPS!	$540	$594
04/23/2026	Hotel / Motel	Montgomery/Alabama/36104	HOTEL/MOTEL 100 EMPS!	$700	$770
04/23/2026	Retail Establishment	Tulsa/Oklahoma/74136	RETAIL ESTABLISHMENT 2 EMPS 100 CUSTOMERS!	$440	$484
04/23/2026	Office	Kenansville/North Carolina/28349	OFFICE 20 EMPS 30 VISITORS!	$500	$550
04/23/2026	Retail Establishment	Greencastle/Indiana/46135	RETAIL 15 EMPS, 20 CUSTOMERS!	$500	$550
04/23/2026	Manufacturing Facility	Rainbow City/Alabama/35906	MANUFACTURING 15-30 EMPS!	$500	$550
04/23/2026	Apartment Complex	Corvallis/Oregon/97330	APT.COMPLEX 230 RES!	$680	$748
04/23/2026	Facility	Harrisonburg/Virginia/22802	UPDATE 5/1 FACILITY 4 EMPS 100 VISITORS!	$280	$308
04/23/2026	Assisted Living Facility	South Bend/Indiana/	UPDATE 4/23 ASSISTED LIVING 220 RES 6 EMPS!	$580	$638
04/22/2026	Office	Cleveland/Ohio/44110	OFFICE 30+EMPS!	$500	$550
04/22/2026	Assisted Living Facility	Sellersburg/Indiana/47172	ASSITED LIVING 50 EMPS 50 RES!	$780	$858
04/22/2026	Manufacturing Facility	Milwaukee/Wisconsin/53223	UPDATE 4/29/26- MANUFACTURING 10 EMPS!	$380	$418
04/22/2026	Manufacturing Facility	Burlington/North Carolina/27215	MANUFATURING 30+EMPS! (GROWING)	$460	$506
04/22/2026	Warehouse	Richmond/Virginia/23230	WAREHOUSE 25 EMPS!	$580	$638
04/22/2026	Facility	Kalispell/Montana/59901	FACILITY 20+ EMPS, 100 VIS!	$520	$572
04/22/2026	Manufacturing Facility	Brighton/Colorado/80603	MANUFACTURING 50EMPS 10VIS!	$580	$638
04/22/2026	Apartment Complex	Lakeland/Florida/33809	APARTMENT COMPLEX 20EMPS 850+RES!	$1,600	$1,760
04/22/2026	Apartment Complex	Charlotte/North Carolina/28262	APARTMENT COMPLEX 3 EMPS 150 RESIDENTS!	$880	$968
04/22/2026	Medical Facility	Abilene/Texas/79602	3 BUILDING MEDICAL 80 EMPS, 80 VIS PER BUILDING!	$1,200	$1,320
04/22/2026	Facility	Evansville/Indiana/47720	FACILITY 12 EMPS 5 DRIVERS!	$480	$528
04/22/2026	Hotel / Motel	Savannah/Georgia/31401	HOTEL/MOTEL 100 EMPS 250 EMPS!	$1,200	$1,320
04/22/2026	School	Danville/Virginia/24541	SCHOOL 40 EMPS!	$580	$638
04/22/2026	Warehouse	Kentwood/Michigan/49512	WAREHOUSE 30 EMPS!	$580	$638
04/22/2026	Manufacturing Facility	Horsham/Pennsylvania/19044	MANUFACTURING 50+ EMPS!	$760	$836
04/22/2026	Office	Bothell/Washington/98011	OFFICE 50EMPS!	$580	$638
04/22/2026	Warehouse	Montgomeryville/Pennsylvania/18936	4/29/26-WAREHOUSE 14 EMPS!	$300	$330
04/21/2026	School	Milford/New Hampshire/03055	SCHOOL 45+EMPS!	$680	$748
04/21/2026	Apartment Building	Wyomissing/Pennsylvania/19610	APT 90+ RES!(COFFEE SERVICE)	$380	$418
04/21/2026	Retail Establishment	Dayton/Ohio/45403	RETAIL 100-200 CUSTOMERS/ COFFEE SERVICE!	$480	$528
04/21/2026	Car Dealer	Charleston/West Virginia/25387	CAR DEALER 96 EMPS 50 CUSTOMERS!	$780	$858
04/21/2026	Manufacturing Facility	Decatur/Illinois/62526	MANUFACTURING 30 EMPS!	$540	$594
04/21/2026	Facility	Moncks Corner/South Carolina/29461	FACILITY 40EMPS!	$640	$704
04/21/2026	Community Clubhouse	Davenport/Florida/33896	COMMUNITY CLUBHOUSE 1000+ RES!	$1,600	$1,760
04/21/2026	Distribution Center	Hebron/Ohio/43025	DISTRIBUTION CENTER 20EMPS 3VIS!	$540	$594
04/21/2026	Facility	Dubuque/Iowa/52003	FACILITY 2 LOCATIONS!	$480	$528
04/21/2026	Production Facility	Bay St. Louis/Mississippi/39520	PRODUCTION 80 EMPS!	$620	$682
04/21/2026	Manufacturing Facility	Goodman/Missouri/64843	MANUFACTURING 300 EMPS!	$1,200	$1,320
04/21/2026	Car Dealer	Charleston/West Virginia/25315	CAR DEALER 54 EMPS 30 CUSTOMERS!	$640	$704
04/21/2026	Apartment Complex	Kingsville/Texas/78363	APT 300 RES!	$480	$528
04/21/2026	Automotive Location	Greensboro/North Carolina/27409	AUTOMOTIVE LOCATION 15 EMPS 50 DRIVERS!	$980	$1,078
04/21/2026	Automotive Location	Brooksville/Florida/34601	AUTOMOTIVE LOCATION 15 EMPS!	$480	$528
04/21/2026	Manufacturing Facility	Birmingham/Alabama/35217	MANUFACTURING FACILITY 50 EMPS!	$700	$770
04/21/2026	Apartment Complex	Sarasota/Florida/34239	APT COMPLEX 500 RES!	$880	$968
04/21/2026	Transportation Facility	Harrisburg/Pennsylvania/17104	TRANSPORTATION 35 EMPS, 125 DRIVERS!	$1,200	$1,320
04/21/2026	Office	Bronx/New York/10469	OFFICE/CHURCH 10EMPS 100VIS!	$780	$858
04/21/2026	Apartment Building	Cedar Rapids/Iowa/52404	APARTMENT BUILDING 200 RESIDENTS 10 VISITORS!	$740	$814
04/21/2026	Gym	Mishawaka/Indiana/46545	GYM 4 EMPS 200 VISITORS!	$600	$660
04/21/2026	Warehouse	Florence/Kentucky/41042	WAREHOUSE 10 EMPS 10 DRIVERS!	$440	$484
04/20/2026	Office	Tucson/Arizona/85741	OFFICE 50 EMPS (COFFEE SERVICE)	$480	$528
04/20/2026	Office	Milwaukee/Wisconsin/53212	OFFICE 60 EMPS!	$900	$990
04/20/2026	Community Clubhouse	Holden Beach/North Carolina/28462	COMMUNITY CLUBHOUSE 900 RES!	$880	$968
04/20/2026	Office Complex	Portland/Oregon/97266	OFFICE OPPORTUNITY 46 EMPS!	$880	$968
04/20/2026	Assisted Living Facility	Moultrie/Georgia/31768	ASSISTED LIVING FACILITY 50EMPS!	$700	$770
04/20/2026	Hotel / Motel	Big Sky/Montana/59716	HOTEL 400 EMPS!	$900	$990
04/20/2026	Hotel / motel	Charlotte/North Carolina/28202	HOTEL 300 EMPS!	$880	$968
04/20/2026	Retail Establishment	Vancouver/Washington/98663	RETAIL 200 CUSTOMERS, 7 EMPS!	$960	$1,056
04/20/2026	Medical Facility	Leesville/Louisiana/71446	MEDICAL FACILITY 10+EMPS!	$500	$550
04/20/2026	Office	Scottsdale/Arizona/85258	OFFICE 40 EMPS AND GROWING! ( COFFEE SERVICE)	$480	$528
04/20/2026	Office	Elizabethtown/Kentucky/42701	UPDATE 4/20 OFFICE 15 EMPS 150 VIS!	$780	$858
04/20/2026	Manufacturing Facility	New York/New York/10001	MANUFACTURING FACILITY 50 EMPS!	$900	$990`.split('\n');

function parsePrice(s) {
  return parseFloat(s.replace(/[$,]/g, ''));
}

function esc(s) {
  return s.replace(/'/g, "''");
}

function parseDate(s) {
  const [m, d, y] = s.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`;
}

const lines = [];
lines.push("-- Generated location listings data");
lines.push("-- Run migration 059_lead_type.sql FIRST, then run this script");
lines.push("");
lines.push("-- Delete all existing vending_requests except York PA");
lines.push("DELETE FROM vending_requests WHERE NOT (city = 'York' AND state = 'PA');");
lines.push("");
lines.push("-- Insert new contracted location listings");
lines.push("-- Uses the first admin user as the creator");
lines.push("DO $$");
lines.push("DECLARE admin_id uuid;");
lines.push("BEGIN");
lines.push("  SELECT id INTO admin_id FROM auth.users WHERE email = 'james@apexaivending.com' LIMIT 1;");
lines.push("  IF admin_id IS NULL THEN");
lines.push("    SELECT id INTO admin_id FROM profiles LIMIT 1;");
lines.push("  END IF;");
lines.push("");

for (const row of rows) {
  const parts = row.split('\t');
  if (parts.length < 6) continue;

  const [dateStr, locType, location, desc, , finalPrice] = parts;
  const locParts = location.split('/');
  const city = locParts[0] || '';
  const stateFull = locParts[1] || '';
  const zip = locParts[2] || '';
  const stateAbbr = STATE_ABBR[stateFull] || stateFull;
  const dbLocType = TYPE_MAP[locType] || 'other';
  const price = parsePrice(finalPrice);
  const createdAt = parseDate(dateStr);

  lines.push(`  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)`);
  lines.push(`  VALUES (admin_id, '${esc(desc)}', '${esc(locType)} in ${esc(city)}, ${stateAbbr}', '${esc(locType)}', '${esc(city)}', '${stateAbbr}', ${zip ? `'${zip}'` : 'NULL'}, '${dbLocType}', '{}', ${price}, 'open', 'email', true, 'contracted', 'flexible', false, '${createdAt}', now(), 'Vending Connector');`);
  lines.push("");
}

lines.push("END $$;");

console.log(lines.join('\n'));
