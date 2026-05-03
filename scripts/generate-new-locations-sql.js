// Script to generate SQL INSERT statements for 222 new location listings
// Run: node scripts/generate-new-locations-sql.js > supabase/seed-new-locations.sql

const TYPE_MAP = {
  'shop': 'retail',
  'auto': 'other',
  'restaurant': 'retail',
  'gym': 'gym',
  'warehouse': 'warehouse',
  'apartment': 'apartment',
  'church': 'other',
  'office': 'office',
  'hotel': 'hotel',
  'laundromat': 'other',
  'barbershop': 'retail',
  'community': 'other',
  'manufacturing': 'warehouse',
  'hospital': 'hospital',
  'mining': 'other',
  'transportation': 'other',
  'production': 'warehouse',
  'publicservice': 'government',
  'government': 'government',
};

const MACHINE_MAP = {
  'atm': 'custom',
  'snack': 'snack',
  'coffee': 'coffee',
  'claw': 'custom',
  'vape': 'custom',
  'other': 'custom',
};

// Tab-delimited: title, price, city, state, buildingType, machineType, createdAt, description
const rows = `Busy Smoke/Vape Shop in Hephzibah 30815 needs ATM\t420\tHephzibah\tGA\tshop\tatm\t2026-05-02T21:40:03.985Z\t50+ customers daily, owner says probably even more. In busy shopping strip.
Auto Shop in Chaska 55318 needs vending\t400\tChaska\tMN\tauto\tsnack\t2026-04-29T20:14:33.232Z\tAuto shop in Chaska, open to any vending options, varied amount of customers 25-100 daily.
New Restaurant in Mpls 55407 needs ATM\t360\tMinneapolis\tMN\trestaurant\tatm\t2026-04-29T14:52:51.447Z\tBrand new restaurant opens in very popular neighborhood, so far 20-30/day visitors
Gym in Virginia Beach, Virginia 23454 needs vending\t500\tVirginia Beach\tVA\tgym\tsnack\t2026-04-29T12:34:09.310Z\tGym in Virginia Beach, Virginia is looking for a vending operator.
Location in Houston, Texas needs vending\t630\tHouston\tTX\tauto\tsnack\t2026-04-28T14:59:33.876Z\tLocation in Houston, Texas is looking for a vending operator.
High Traffic Restaurant Needs ATM\t500\tNewark\tNJ\trestaurant\tatm\t2026-04-27T21:52:56.223Z\tPopular restaurant needs an ATM, Average 200+ foot traffic per day!
BOXING GYM\t910\tPlymouth\tMI\tgym\tsnack\t2026-04-27T20:58:09.849Z\tBoxing Gym Needs a Smart Cooler
Commercial Warehouse 24/7 Combo\t600\tBrampton\tON\twarehouse\tsnack\t2026-04-27T16:46:02.249Z\tCommercial Warehouse open 24/7 Combo Machine
Cash Only Smoke Shop - Signed Agreement\t420\tChicago\tIL\tshop\tatm\t2026-04-27T15:29:54.345Z\tSmoke shop ready for ATM install, 50-60 foot traffic per day
INSTALL THIS WEEK - AUTO SHOP LOCATION\t400\tBurbank\tCA\tauto\tsnack\t2026-04-27T01:35:39.567Z\tAuto shop location, negotiation done, install immediately
Combo Machine\t610\tChesapeake\tVA\tgym\tsnack\t2026-04-24T17:18:01.699Z\tGym interested in combo machine
AUTO BODY SHOP NEED VENDING MACHINE\t300\tChicago\tIL\tauto\tsnack\t2026-04-24T16:12:22.716Z\tPopular Auto Body Shop, 50-60+ customers per day
Location in Atlantic City, New Jersey needs vending\t600\tAtlantic City\tNJ\tshop\tsnack\t2026-04-24T13:07:31.777Z\tLocation in Atlantic City, New Jersey is looking for a vending operator.
Auto Repair Needs Vending Machine\t300\tLake Worth Beach\tFL\tauto\tatm\t2026-04-23T21:02:16.888Z\tAuto repair shop with steady traffic of 40-50 a day
Church in Hephzibah 30815 needs vending in busy lobby\t650\tHephzibah\tGA\tchurch\tsnack\t2026-04-23T20:00:57.222Z\t250-300 attendees every Sunday - needs vending in busy lobby
Location in Cleveland, Ohio needs Coffee Machine\t570\tCleveland\tOH\toffice\tcoffee\t2026-04-23T18:22:42.203Z\tLocation in Cleveland, Ohio is looking for a coffee vending operator.
Location in Cleveland, Ohio needs Combo Vending Machine\t570\tCleveland\tOH\toffice\tsnack\t2026-04-23T18:01:42.291Z\tLocation in Cleveland, Ohio is looking for a combo vending operator.
440+ UNITS APARTMENT COMPLEX NEED VENDING MACHINE\t1000\tOrlando\tFL\tapartment\tsnack\t2026-04-23T16:05:58.981Z\t440+ units apartment complex needs vending machine
Food Mart, Waterloo Iowa\t470\tWaterloo\tIA\tshop\tatm\t2026-04-23T03:00:16.718Z\tMerchant needs an ATM and is interested in lottery games
Plaza, Nashville, TN, 37203\t600\tNashville\tTN\tgym\tsnack\t2026-04-22T18:36:23.083Z\t10 Employees and 50+ minimum Traffic, 7 days a week
Location in Jonesboro, AR 72401 needs Vending\t800\tJonesboro\tAR\twarehouse\tsnack\t2026-04-22T16:04:44.199Z\tLocation in Jonesboro, AR is looking for a vending operator.
Location in Richmond, VA 23224 needs vending\t900\tRichmond\tVA\tmanufacturing\tsnack\t2026-04-22T14:00:39.621Z\tLocation in Richmond, VA is looking for a vending operator.
Office/warehouse\t800\tCincinnati\tOH\twarehouse\tsnack\t2026-04-22T05:59:26.117Z\t45-50 employees, currently no machine on site
Dry Cleaner Need ATM\t310\tDetroit\tMI\tlaundromat\tatm\t2026-04-21T20:50:37.936Z\tDry cleaner in busy downtown Detroit area, 40-50+ in-store
PHARMACY NEEDS A COFFEE MACHINE\t300\tWashington\tDC\tshop\tcoffee\t2026-04-20T23:27:47.982Z\tPharmacy inside a medical center with steady traffic
EVENT VENUE NEEDS ATM\t350\tBrooklyn\tNY\tchurch\tatm\t2026-04-20T22:41:44.892Z\tEvent venue for weddings, corporate events, birthdays
BUSY LAUNDROMAT NEEDS A COFFEE MACHINE\t350\tSt. Louis\tMO\tlaundromat\tcoffee\t2026-04-20T21:45:35.016Z\tBusy laundromat, weekend well over 200+ people
KID FRIENDLY LAUNDROMAT NEEDS A CLAW MACHINE\t300\tSt. Louis\tMO\tlaundromat\tclaw\t2026-04-20T20:30:56.663Z\tBusy laundromat needs a claw machine, lots of kids and traffic
Stand Alone, San Antonio, TX, 78217\t650\tSan Antonio\tTX\tgym\tsnack\t2026-04-20T18:46:54.081Z\t6 Employees and daily foot traffic of 50 minimum
Location in San Angelo, Texas needs vending\t900\tSan Angelo\tTX\toffice\tsnack\t2026-04-20T15:21:04.452Z\tLocation in San Angelo, Texas is looking for a vending operator.
Busy Barber shop, Logan Utah wants Smart Cooler\t470\tLogan\tUT\tbarbershop\tsnack\t2026-04-18T21:15:45.392Z\tHighly rated busy barbershop seeking a smart cooler
Busy Laundromat Needs ATM\t350\tLakeside\tCA\tlaundromat\tatm\t2026-04-17T22:32:48.518Z\tBusy Laundromat needs an ATM, 100% interested
Location in Sacramento, CA 95828 needs ATM\t400\tSacramento\tCA\tbarbershop\tatm\t2026-04-17T18:25:41.674Z\t8 chair barbershop looking for ATM operator
Location in Ocala, Florida needs vending\t400\tOcala\tFL\tbarbershop\tsnack\t2026-04-17T16:53:56.137Z\tLocation in Ocala, Florida is looking for a combo vending machine operator.
Location in Doral, Florida needs vending\t360\tDoral\tFL\tbarbershop\tcoffee\t2026-04-17T13:09:46.271Z\tLocation in Doral, Florida is looking for a coffee vending operator.
Grocery store NEED Claw Machine\t300\tDenver\tCO\trestaurant\tclaw\t2026-04-16T20:58:32.517Z\tGrocery store needs a claw machine
Ludington MI Lead\t810\tLudington\tMI\tcommunity\tsnack\t2026-04-16T19:06:56.740Z\tSnack Machine needed for a Ludington Park
Tattoo shop with high flow, Twin city\t420\tTwin Falls\tID\tbarbershop\tatm\t2026-04-16T18:53:03.922Z\tTattoo shop that needs an ATM and a vending machine
Location in San Diego, CA 92154\t540\tSan Diego\tCA\ttransportation\tsnack\t2026-04-16T15:39:42.308Z\tLocation in San Diego, CA is looking for a vending operator.
Fitness center combo machine\t390\tClarksville\tTN\tgym\tsnack\t2026-04-16T15:11:17.012Z\tFitness center looking for combo machine
Smart Cooler Needed For Tattoo Shop\t300\tFort Lauderdale\tFL\tshop\tsnack\t2026-04-15T18:30:39.538Z\tTattoo shop looking for a smart cooler
Caribbean Authentic Restaurant in GTA\t420\tMississauga\tON\trestaurant\tatm\t2026-04-14T20:34:50.156Z\tRestaurant foot traffic approximately 0-75
Hotel Seeks Vending Service\t650\tStockton\tIL\thotel\tsnack\t2026-04-14T04:24:36.217Z\tName brand hotel with 40 rooms and steady occupancy
USED AUTO DEALER/SERVICE CENTER\t360\tKnoxville\tTN\tshop\tsnack\t2026-04-13T20:50:02.570Z\tUsed Auto Dealer with 8 employees
MEET & GREET ASAP\t680\tLaguna Niguel\tCA\tgym\tcoffee\t2026-04-13T20:23:45.975Z\tFitness center wants touch coffee bar, 150+ day traffic
Industrial Machine Rental & Service Center\t400\tCleveland\tTX\tauto\tsnack\t2026-04-13T15:23:39.259Z\tIndustrial Machine Rental requesting smart cooler or combo machine
Laundromat Claw Machine Location\t260\tElizabethtown\tKY\tlaundromat\tclaw\t2026-04-11T17:55:19.370Z\tEstablished laundromat, 500+ customers per week
High-Traffic Laundromat Snack Machine Location\t260\tElizabethtown\tKY\tlaundromat\tsnack\t2026-04-11T15:56:36.321Z\tEstablished laundromat, 500+ customers weekly
Location in Montrose, Colorado needs vending\t1100\tMontrose\tCO\thotel\tsnack\t2026-04-11T14:32:56.747Z\tLocation in Montrose, Colorado is looking for a vending operator.
Gym Needs Drink Only Vending Machine\t300\tWheatland\tCA\tgym\tsnack\t2026-04-10T22:11:50.576Z\tGym needs drink only vending machine, 30+ daily foot traffic
Location in Crystal 55429 needs Vending\t710\tCrystal\tMN\tcommunity\tsnack\t2026-04-10T20:12:18.962Z\t100-150 visitors per day, wants healthy options
Location in Auburn, Alabama needs vending\t320\tAuburn\tAL\tauto\tsnack\t2026-04-10T16:18:47.255Z\tLocation in Auburn, Alabama is looking for a vending operator.
Retail Store Needs Combo Machine in Cornelia\t270\tCornelia\tGA\tshop\tsnack\t2026-04-08T19:00:36.275Z\tGuatemalan store requesting combo machine, 65-100+ foot traffic
Motel/Hotel\t540\tHebron\tOH\thotel\tsnack\t2026-04-08T18:54:33.580Z\tLooking to start vending services, requesting drink and snack machine
GYM NEEDS A DRINK ONLY VENDING MACHINE\t300\tChicago\tIL\tgym\tsnack\t2026-04-07T20:50:17.868Z\tDrink-only vending machine at a gym, health-based drinks
Townhome Complex in Republic 65738\t790\tRepublic\tMO\tapartment\tsnack\t2026-04-07T20:18:28.891Z\tNew Townhome Complex, 135 Townhomes, 70 people a day
New apartments in Augusta 30909 needs ATM\t600\tAugusta\tGA\tapartment\tatm\t2026-04-06T19:28:00.516Z\tNew apartment complex, 150 apartments filling up
Location in West View, Pennsylvania needs vending\t320\tWest View\tPA\tbarbershop\tatm\t2026-04-03T16:33:51.234Z\tLocation in West View, Pennsylvania is looking for a vending operator.
Location in Fresno, California needs vending\t270\tFresno\tCA\tauto\tsnack\t2026-04-02T00:28:07.080Z\tLocation in Fresno, California is looking for a vending operator.
Location in Montgomery, Alabama needs Claw Machine\t440\tMontgomery\tAL\tlaundromat\tclaw\t2026-03-31T18:28:35.452Z\tLocation in Montgomery, Alabama, claw operator for adult gaming
Premier Laundromat - 2 MACHINES\t420\tNorth York\tON\tlaundromat\tsnack\t2026-03-28T19:13:57.339Z\tLaundromat vending, 50+ foot traffic daily
Office in Cowessess\t600\tKenosee Lake\tSK\tgovernment\tsnack\t2026-03-28T13:10:49.841Z\tEstimated 45 employees
Office in Valleyview\t700\tValleyview\tAB\thospital\tsnack\t2026-03-28T13:08:36.464Z\tEstimated 45-75 daily foot traffic
Location in San Marcos, Texas needs Claw Machine\t350\tSan Marcos\tTX\trestaurant\tclaw\t2026-03-25T18:16:33.494Z\tLocation in San Marcos, Texas is looking for a Claw vending operator.
Gym in Church Hill, Tennessee needs vending\t550\tChurch Hill\tTN\tgym\tsnack\t2026-03-25T17:08:13.266Z\tGym needs vending services, about 50 visitors per day
Large Gym in Lake City Florida needs vending\t740\tLake City\tFL\tgym\tsnack\t2026-03-24T20:10:14.273Z\tLarge gym, over 300 daily visitors, no competition nearby
Location in Baton Rouge, Louisiana needs vending\t800\tBaton Rouge\tLA\tcommunity\tsnack\t2026-03-23T20:57:25.371Z\tLocation in Baton Rouge, Louisiana is looking for a vending operator.
Location in Santa Rosa, California needs ATM\t400\tSanta Rosa\tCA\tbarbershop\tatm\t2026-03-23T19:57:29.699Z\t6 chair barbershop looking for ATM operator
Looking for vending machine in missouri\t450\tGrandview\tMO\tchurch\tsnack\t2026-03-23T19:36:04.129Z\tChurch looking for snacks and beverages
Popular Hotel Chain\t540\tLaGrange\tGA\thotel\tsnack\t2026-03-23T17:57:35.538Z\tBrand new Hotel with 124 units, popular chain
Pet store\t420\tLos Angeles\tCA\tshop\tsnack\t2026-03-23T14:04:20.887Z\tPet store wants a smart cooler machine
Private Vehicle Registration Office Oakland\t270\tOakland\tCA\tauto\tsnack\t2026-03-19T22:52:35.501Z\tBusy Private Vehicle Registration Office, 50+ daily foot traffic
Private Vehicle Registration Office San Leandro\t270\tSan Leandro\tCA\tauto\tsnack\t2026-03-19T22:40:02.247Z\tPrivate Vehicle Registration Office, 30-40 daily foot traffic
GYM 24/7 COMBO\t750\tKey West\tFL\tgym\tsnack\t2026-03-19T20:38:19.819Z\tGym open 24/7, limited space in front entrance
Location in West Palm Beach, Florida needs vending\t300\tWest Palm Beach\tFL\tbarbershop\tcoffee\t2026-03-18T18:46:38.007Z\tLocation in West Palm Beach, Florida is looking for a vending operator.
Auto body shop in Michigan\t600\tMount Clemens\tMI\tauto\tsnack\t2026-03-18T13:15:17.866Z\tBusy auto shop that sees 50+ daily
Busy Brake shop in Michigan\t630\tSterling Heights\tMI\tauto\tsnack\t2026-03-18T13:00:13.743Z\tBusy brake shop wanting a combo machine
Smoke shop needs an ATM\t400\tHouston\tTX\tshop\tatm\t2026-03-17T17:46:16.127Z\tSmoke shop actively looking for an ATM
Hotel in Garner, NC needs ATM\t680\tGarner\tNC\thotel\tatm\t2026-03-17T15:27:34.811Z\tLocation in Garner, North Carolina looking for an ATM operator.
Hotel in Raleigh, NC needs ATM\t750\tRaleigh\tNC\thotel\tatm\t2026-03-17T14:31:32.211Z\tLocation in Raleigh, North Carolina looking for an ATM operator.
Location in Mena, Arkansas needs vending\t550\tMena\tAR\tmining\tsnack\t2026-03-16T21:35:53.009Z\tLocation in Mena, Arkansas is looking for a vending operator.
Company near 22903 looking for vending machines\t800\tCharlottesville\tVA\thospital\tsnack\t2026-03-16T18:39:26.993Z\tCompany with 75 employees, no vending machines on site
Company near 44087 needs Advanced Technology\t320\tTwinsburg\tOH\tauto\tsnack\t2026-03-16T18:04:46.379Z\tLocal company evaluating options to replace current vending
Location in Panama City Beach, Florida needs vending\t530\tPanama City Beach\tFL\thotel\tsnack\t2026-03-16T15:21:59.297Z\tLocation in Panama City Beach, Florida is looking for a vending operator.
Arcade machine needed for Entertainment venue\t420\tBurbank\tCA\tshop\tother\t2026-03-15T07:05:35.822Z\tBusy venue, 200+ daily on weekends, looking for arcade machines
Plaza, Mishawaka, IN, 46545\t1100\tMishawaka\tIN\tgym\tsnack\t2026-03-13T17:13:54.862Z\tGym with 300 to 400 daily traffic, 7 Employees
Auto Repair Shop need ATM 10469\t320\tThe Bronx\tNY\tauto\tatm\t2026-03-13T16:47:43.466Z\tAuto Repair Shop needs ATM service
High rise residential - ATM broken\t1010\tJacksonville\tFL\tapartment\tatm\t2026-03-13T16:06:40.994Z\tHigh rise residential tower, broken ATM, 300+ units
Hotel needs ATM 43068\t830\tReynoldsburg\tOH\thotel\tatm\t2026-03-13T14:46:38.365Z\t$50 Cash deposit policy, 98 guest capacity
RETRO 1980S THEMED MACHINE\t700\tGlendale\tCA\tgym\tother\t2026-03-12T23:46:34.247Z\tFitness gym with store front, 3000+ members
Gym needs vending services 13205\t610\tSyracuse\tNY\tgym\tsnack\t2026-03-12T07:45:51.231Z\tGym needs vending services, limited space
Micro Mart for a Hotel 100Rooms+\t900\tSpringfield\tIL\thotel\tsnack\t2026-03-11T15:31:05.988Z\t109 rooms hotel, needs an operator
Combo Machine needed in Montgomery, AL\t250\tMontgomery\tAL\tauto\tsnack\t2026-03-11T07:57:36.274Z\tAutomotive shop urgently wanting a combo machine
GYM\t340\tDetroit\tMI\tgym\tsnack\t2026-03-10T20:00:28.445Z\tGYM
Motel in Augusta needs vending services\t750\tAugusta\tGA\thotel\tsnack\t2026-03-10T15:17:19.871Z\tLocation in Augusta, Georgia is looking for a vending operator.
Apartment complex\t500\tCincinnati\tOH\tapartment\tsnack\t2026-03-09T18:58:47.599Z\t5 block apartment complex with 100 units
Laundromat in Plainville, Connecticut needs ATM\t400\tPlainville\tCT\tlaundromat\tatm\t2026-03-09T18:31:05.638Z\tLocation in Plainville, Connecticut looking for ATM operator.
Barber shop 70714 needs vending services\t360\tBaker\tLA\tbarbershop\tsnack\t2026-03-08T18:09:43.148Z\tLocation in Baker, Louisiana is looking for a vending operator.
HIGH-TRAFFIC RETAIL - 2 ARCADE MACHINE PLACEMENT\t400\tClovis\tNM\tshop\tother\t2026-03-07T21:34:15.577Z\tBusy retail store, 100+ customers daily, looking for arcade machines
1000+ customers daily very successful store\t600\tRavenna\tOH\tshop\tsnack\t2026-03-07T17:20:10.635Z\tFamily/convenience store in middle of downtown
Immediate need near 26062 to replace current vendor\t800\tWeirton\tWV\tmanufacturing\tsnack\t2026-03-06T18:37:08.916Z\t35 employees, ready to replace current vendor
2-star hotel in 65616 needs vending services\t680\tBranson\tMO\thotel\tsnack\t2026-03-05T21:38:51.627Z\tLocation in Branson, Missouri is looking for a vending operator.
Location in North Little Rock, Arkansas needs vending\t810\tNorth Little Rock\tAR\toffice\tsnack\t2026-03-05T20:16:15.880Z\tLocation in North Little Rock, Arkansas, wants someone to bring a machine
Hotel 90063 Seeking ATM services\t680\tLos Angeles\tCA\thotel\tatm\t2026-03-05T18:20:51.454Z\tLocation in Los Angeles, California is looking for ATM operator.
Location in Lakewood Ranch, Florida needs vending\t420\tBradenton\tFL\tbarbershop\tsnack\t2026-03-05T15:42:27.320Z\tLocation in Lakewood Ranch, Florida is looking for a vending operator.
Location in Chico, California needs vending\t750\tChico\tCA\thotel\tsnack\t2026-03-04T21:16:21.781Z\tLocation in Chico, California is looking for a vending operator.
Location in El Paso, Texas needs vending\t550\tEl Paso\tTX\tgym\tsnack\t2026-03-04T19:51:12.821Z\tLocation in El Paso, Texas is looking for a vending operator.
Location in Monterey Park, California needs vending\t750\tMonterey Park\tCA\thotel\tcoffee\t2026-03-04T19:11:50.329Z\tLocation in Monterey Park, California is looking for a vending operator.
ATM Famous Tattoo Artist\t540\tChicago\tIL\tshop\tatm\t2026-03-03T19:12:32.634Z\tFamous tattoo artist needs ATM near door
100+ Unit Apartment complex in Athens GA\t1000\tAthens\tGA\tapartment\tsnack\t2026-03-03T17:41:47.763Z\tBig Apartment Complex with over 100 units, fully rented
Convenience store needs ATM\t650\tPhiladelphia\tPA\tshop\tatm\t2026-03-02T17:28:48.055Z\t5 year signed contract for a convenience store, 24/7
Big Apartment Complex in Amarillo TX\t1000\tAmarillo\tTX\tapartment\tsnack\t2026-03-02T00:44:55.045Z\tBig apartment complex, 240 units
Busy Automotive place\t600\tHenderson\tTX\tauto\tsnack\t2026-03-02T00:40:43.885Z\tBusy Automotive place, wants a snack machine only
Large Condominium on the Beach\t980\tDestin\tFL\tapartment\tother\t2026-02-27T23:53:19.332Z\tCondominium with 168 units, wants Sunblock Vending machine
Location in McDonough, Georgia needs vending\t450\tMcDonough\tGA\tgym\tsnack\t2026-02-27T18:17:39.851Z\tLocation in McDonough, Georgia is looking for a vending operator.
MINUTES FROM GAINESVILLE\t810\tGainesville\tFL\tcommunity\tsnack\t2026-02-27T04:34:41.761Z\tNeed smart cooler, huge outdoor events every weekend
Location in Miami, Florida needs vending\t650\tMiami\tFL\thotel\tsnack\t2026-02-26T21:58:22.092Z\tHotel looking for snack/drink combo and travel items
3 star hotel in Lansing needs vending services\t750\tLansing\tMI\thotel\tsnack\t2026-02-26T15:49:08.706Z\t3 star hotel needs vending services
2 star hotel 31901 needs vending\t750\tColumbus\tGA\thotel\tsnack\t2026-02-26T14:28:11.669Z\t2 star hotel in Columbus, Georgia
Busy Transmission Shop in Wichita Falls TX\t600\tWichita Falls\tTX\tauto\tsnack\t2026-02-26T04:13:56.888Z\tBusy transmission shop, 30-40 customers daily
Busy Motel in Payson AZ\t990\tPayson\tAZ\thotel\tsnack\t2026-02-26T04:09:42.537Z\tBusy Motel with 46 rooms
Busy Inn in Arizona\t990\tLake Havasu City\tAZ\thotel\tsnack\t2026-02-26T04:05:27.913Z\tBusy Inn in Lake Havasu City
3 star hotel needs vending services 94103\t430\tSan Francisco\tCA\thotel\tsnack\t2026-02-26T01:01:43.144Z\tHotel in San Francisco needs vending services
2 star hotel with 40 rooms\t1180\tParker\tAZ\thotel\tsnack\t2026-02-25T00:02:47.015Z\tBusy 2 star hotel with 40 rooms
Vending Opportunity at Club House Pool\t600\tKill Devil Hills\tNC\tcommunity\tsnack\t2026-02-24T16:59:45.658Z\tHigh-Traffic Club House Pool, 30-50 visitors per day
Stand Alone, San Angelo, TX, 76903\t780\tSan Angelo\tTX\tgym\tsnack\t2026-02-24T16:41:03.978Z\tFitness Center with 100+ daily traffic, 24/7
Auto repair shop needs vending services 48340\t320\tPontiac\tMI\tauto\tsnack\t2026-02-23T23:45:47.663Z\tSmall auto repair shop needs vending services
Auto repair shop needs vending services 15203\t250\tPittsburgh\tPA\tauto\tsnack\t2026-02-23T23:26:44.799Z\tSmall auto repair shop needs combo machine
Gym Needs vending services 48207\t440\tDetroit\tMI\tgym\tsnack\t2026-02-23T23:05:13.840Z\tMid sized gym needs vending services
Auto Repair Shop needs combo machine 46723\t320\tChurubusc\tIN\tauto\tsnack\t2026-02-23T22:31:08.104Z\tSmall auto shop seeking food and drink vending
Auto Repair Shop needs ATM 10451\t320\tThe Bronx\tNY\tauto\tatm\t2026-02-23T22:08:20.933Z\tSmall auto shop needs ATM
Company near zip 16161 poor customer service\t800\tWheatland\tPA\tmanufacturing\tsnack\t2026-02-23T20:31:17.905Z\tManufacturing facility evaluating alternative vendors
Facility near 29485 looking to replace current vendor\t900\tSummerville\tSC\thospital\tsnack\t2026-02-23T19:25:05.534Z\t110 employees 24/7 operation
Location in Santa Rosa Beach, Florida needs vending\t580\tSanta Rosa Beach\tFL\tgym\tsnack\t2026-02-23T15:29:40.039Z\tLocation in Santa Rosa Beach, Florida is looking for a vending operator.
Events center in Georgia\t1000\tThomaston\tGA\twarehouse\tsnack\t2026-02-18T17:17:20.876Z\tBusy children fun center, open to 1-2 machines
Manufacturing Plant near columbus\t920\tLondon\tOH\tproduction\tsnack\t2026-02-17T21:57:46.445Z\tManufacturing plant, 65-70 employees, replacing current vendor
Salon needs ATM services 89052\t400\tHenderson\tNV\tbarbershop\tatm\t2026-02-17T19:26:15.702Z\tLocation in Henderson, Nevada
Home, Syracuse, IN, 46567\t650\tSyracuse\tIN\tpublicservice\tsnack\t2026-02-12T22:45:37.655Z\tRecovery center with 6 Employees and 20+ daily Traffic
Detroit auto shop needs vending service 48120\t360\tDetroit\tMI\tauto\tsnack\t2026-02-12T14:46:38.953Z\tAuto repair shop, 21-40 customers per day
Health services center\t1000\tNorth East\tMD\thospital\tsnack\t2026-02-09T23:00:26.169Z\tHealth service center, patients live there
Refuge Temple Revival Center\t360\tIndianapolis\tIN\tchurch\tsnack\t2026-02-09T21:27:01.695Z\tChurch/ministry
Location in Foley, Alabama needs vending\t400\tFoley\tAL\tbarbershop\tsnack\t2026-02-09T21:21:40.648Z\tLocation in Foley, Alabama is looking for a vending operator.
Busy I-10 Hotel in Crestview, FL needs Vape Machine\t450\tCrestview\tFL\thotel\tsnack\t2026-02-09T07:59:03.523Z\tHotel in Crestview FL right next to I-10
Hotel in Crestview, FL needs Claw machine\t450\tCrestview\tFL\thotel\tclaw\t2026-02-09T07:55:36.400Z\tHotel in Crestview FL needs a claw machine
Owner APPROVED! Hotel in Crestview needs ATM\t450\tCrestview\tFL\thotel\tatm\t2026-02-09T07:49:21.173Z\tPlacement approved, ATM in lobby with cameras
Owner APPROVED! Location in Crestview needs vending\t450\tCrestview\tFL\thotel\tsnack\t2026-02-09T07:45:47.634Z\tOwner approved, ready for at least 2 machines
Company near 68801 does not have vending machines\t800\tGrand Island\tNE\ttransportation\tsnack\t2026-02-08T20:19:58.675Z\t29 employees, no vending on site
Coin Car Wash in Tallahassee\t270\tTallahassee\tFL\tauto\tsnack\t2026-02-07T17:57:18.873Z\t24hrs Car Wash open to drink or snack vending
Busy Clothing Store in Fort Worth Texas\t600\tFort Worth\tTX\tshop\tsnack\t2026-02-05T21:43:59.499Z\tBusy clothing store in Fort Worth
Barber Shop 25401 needs ATM\t320\tMartinsburg\tWV\tbarbershop\tatm\t2026-02-05T15:52:12.851Z\tBarber Shop in Martinsburg needs ATM
Barber shop needs vending services 25401\t320\tMartinsburg\tWV\tbarbershop\tsnack\t2026-02-04T17:19:21.694Z\tLocation in Martinsburg, West Virginia
Barbershop needs vending services 48221\t320\tDetroit\tMI\tbarbershop\tsnack\t2026-02-03T21:29:28.414Z\tLocation in Detroit, Michigan
Busy Tint shop in MD\t660\tBaltimore\tMD\tauto\tsnack\t2026-02-03T19:24:14.266Z\tVery busy tint shop in Maryland
Senior Living Facility 24/7\t600\tCollege Station\tTX\thospital\tsnack\t2026-02-02T15:49:32.591Z\tCombo or drink/snack machine for assisted living
Location in Greenville, Texas needs vending\t410\tGreenville\tTX\thotel\tsnack\t2026-01-31T02:17:19.836Z\tLocation in Greenville, Texas is looking for a vending operator.
Busy Auto place in Miami FL\t240\tMiami\tFL\tauto\tsnack\t2026-01-29T15:55:43.137Z\tBusy Auto Tech in Miami FL, replacement, move in ready
300 unit apartment building\t1520\tBaytown\tTX\tapartment\tsnack\t2026-01-28T18:33:26.149Z\t300 units apartment building with pool and gym
Busy Tattoo Shop in Phoenix AZ\t540\tPhoenix\tAZ\tshop\tsnack\t2026-01-26T23:45:07.183Z\tBusy tattoo place, 30+ customers a day
Location in Bakersfield, California needs vending\t650\tBakersfield\tCA\tgym\tsnack\t2026-01-21T20:44:49.112Z\tLocation in Bakersfield, California
Warehouse, Granbury, TX, 76049\t780\tGranbury\tTX\tgym\tsnack\t2026-01-21T16:09:18.898Z\tFitness Gym, 60+ daily foot traffic, 7 days a week
Warehouse 50+ employees - Great location!\t600\tPortland\tOR\twarehouse\tsnack\t2026-01-21T07:23:34.428Z\tWarehouse location, 51 employees, smart cooler setup
BARBERSHOP NEEDS VENDING MACHINE\t300\tMount Olive\tNC\tbarbershop\tsnack\t2026-01-21T06:07:45.775Z\tModern barbershop with 20+ loyal customers daily
Location in Newark, Ohio needs vending\t500\tNewark\tOH\tshop\tsnack\t2026-01-17T23:12:37.411Z\tLocation in Newark, Ohio is looking for a vending operator.
REPLACE COFFEE VENDOR ASAP\t700\tLa Habra\tCA\tgym\tcoffee\t2026-01-14T22:10:38.249Z\tFitness center wants coffee machine, 100+ day avg traffic
Location in Montgomery, Alabama needs vending\t500\tMontgomery\tAL\tgym\tsnack\t2026-01-13T17:56:05.175Z\tLocation in Montgomery, Alabama
Busy Salon in Cali\t400\tGlendora\tCA\tbarbershop\tsnack\t2026-01-12T20:33:29.468Z\tNice modern salon, 10 chairs, steady flow of customers
Poor Customer Service! Replace 4 machines in Zip 43701\t500\tZanesville\tOH\tapartment\tsnack\t2026-01-08T20:28:59.207Z\tSecured building, 2 beverage and 2 snack machines currently
Location in Belleville, Kansas needs vending\t375\tBelleville\tKS\tlaundromat\tsnack\t2026-01-06T23:04:46.318Z\tLocation in Belleville, Kansas
Location in Beech Creek, Pennsylvania needs vending\t300\tBeech Creek\tPA\tlaundromat\tatm\t2026-01-06T22:35:32.500Z\tLocation in Beech Creek, Pennsylvania
Exclusive Mixed Martial Arts Gym\t500\tStruthers\tOH\tgym\tsnack\t2026-01-03T13:37:10.666Z\tFast growing mixed martial arts gym
AUTO SHOP NEEDS DRINKS/SNACKS MACHINE\t300\tMiami\tFL\tauto\tsnack\t2026-01-02T17:41:06.136Z\tMom and pop auto shop in Miami
Location in Winston-Salem, NC needs ATM Machine\t300\tWinston-Salem\tNC\tbarbershop\tatm\t2026-01-02T17:25:18.752Z\tBarber shop, 20+ heads daily, steady traffic
Gamers for Restaurant & Bar\t350\tChicago\tIL\tshop\tother\t2025-12-31T22:22:35.294Z\tVideo games needed for restaurant and bar
Gamers II for Restaurant & Bar\t360\tChicago\tIL\tshop\tother\t2025-12-31T22:15:45.440Z\tA video game for restaurant and bar
Coffee Vending Location - BUSY GAS STATION\t250\tAddison\tIL\tshop\tcoffee\t2025-12-31T00:12:56.767Z\tBusy gas station seeking coffee vending operator
PRIME OUTDOOR VENDING LOCATION\t300\tShelburne\tON\tapartment\tsnack\t2025-12-24T13:31:01.548Z\tOutdoor vending opportunity on privately owned property
Location in Columbus, Ohio needs vending\t300\tColumbus\tOH\tlaundromat\tatm\t2025-12-21T19:15:02.200Z\tLocation in Columbus, Ohio
ATM\t400\tChicago\tIL\tshop\tatm\t2025-12-18T18:13:49.445Z\tFar from any ATM, needs a small percentage
Location in Toronto, Ontario needs vending\t200\tYork\tON\tlaundromat\tsnack\t2025-12-17T21:13:25.554Z\tLocation in Toronto, Ontario
ATM, Diversey Busy Area\t420\tChicago\tIL\tbarbershop\tatm\t2025-12-16T23:36:15.993Z\tHair dresser needs an ATM
Near Zip 57702! 4 machines!\t1000\tRapid City\tSD\tcommunity\tsnack\t2025-12-16T22:26:57.559Z\tVery high volume location, 3 buildings, 100-300 employees
Coffee Machine for a Busy Grocery Store\t370\tChicago\tIL\tshop\tother\t2025-12-16T19:20:20.201Z\tMachine needed for wholesale food store
ATM Male Hair Salon\t340\tChicago\tIL\tbarbershop\tatm\t2025-12-15T19:25:39.873Z\tATM needed hair salon
The mall shopping Center in Santa Maria, California\t1350\tSanta Maria\tCA\tcommunity\tsnack\t2025-12-11T19:44:16.391Z\tThe mall, looking for key making and drink machines
Music Box for a Bar and Restaurant\t300\tChicago\tIL\tshop\tother\t2025-12-09T21:33:58.750Z\t1 Karaoke Machine Wanted
Company looking for snack and coffee machines in zip 53188\t350\tWaukesha\tWI\tmanufacturing\tsnack\t2025-12-04T21:25:53.818Z\tCompany interested in coffee and snacks
Stand Alone Bldg, Charleston, WV, 25304\t1500\tCharleston\tWV\tgym\tsnack\t2025-12-04T16:18:56.649Z\tFitness Center, 300 to 500 daily traffic
Nice Apartment Complex in MD\t540\tBrentwood\tMD\tapartment\tsnack\t2025-12-04T01:24:13.266Z\tContract signed, 2 spots available for machines
Two busy gymnastic places\t800\tBoerne\tTX\tgym\tsnack\t2025-12-01T15:30:25.904Z\tTwo gymnastic places, 500+ students per week each
CAR DEALERSHIP PALM BAY FL\t500\tPalm Bay\tFL\tauto\tsnack\t2025-11-28T21:26:33.642Z\tConstant traffic 30-70 a day, 7 days a week
Commercial Warehouse in Orlando, Florida 32811\t450\tOrlando\tFL\twarehouse\tsnack\t2025-11-26T18:22:09.630Z\tCommercial Warehouse, 100+ people walking in daily
Hotel in Ridgecrest\t1300\tRidgecrest\tCA\thotel\tsnack\t2025-11-19T17:55:32.637Z\tHotel/motel, 1 year agreement signed and finalized
New account for sale\t150000\tBaltimore\tMD\twarehouse\tsnack\t2025-11-16T09:59:26.587Z\t5 HAHA coolers and 1 combo machine, two year contract
Staten Island NY Luxury Apartments\t2200\tStaten Island\tNY\tapartment\tsnack\t2025-11-14T12:47:11.697Z\tLuxury Apartments, 120+ units, 180-200+ people
Warehouse, Huntington, WV, 25701\t650\tHuntington\tWV\tgym\tsnack\t2025-11-13T22:18:10.756Z\tBoxing Gym, 50+ daily foot traffic
Gym/Fitness Center in Jackson, Wyoming\t300\tJackson\tWY\tgym\tsnack\t2025-11-13T00:30:33.323Z\tActive gym in Jackson Wyoming
Auto Repair Shop Lansdowne 19050\t450\tEast Lansdowne\tPA\tauto\tsnack\t2025-11-12T22:38:08.157Z\t1 Employee Auto Shop runs 6 days a week
Gym/Fitness Center in Saratoga, Wyoming\t400\tSaratoga\tWY\tgym\tsnack\t2025-11-12T21:12:53.775Z\t24/7 gym with no vending machines
Tattoo shop in Laramie Wyoming\t200\tLaramie\tWY\tbarbershop\tsnack\t2025-11-12T02:34:03.790Z\tVery popular tattoo shop with great reviews
Auto Services Facility in Charles Town, WV\t500\tCharles Town\tWV\tauto\tsnack\t2025-11-11T20:10:38.115Z\tAuto Center, 13 Employees, 20+ daily foot traffic
Auto Business in Venice FL 34285\t540\tVenice\tFL\toffice\tsnack\t2025-10-30T18:03:25.837Z\t4 employees, interested in combo drink/snack machine
Auto service facility in tx 78644\t490\tLockhart\tTX\tauto\tsnack\t2025-10-29T15:50:00.219Z\t6 employees, requesting snack and coke machine
Carlot\t1200\tUnion City\tTN\tauto\tsnack\t2025-10-20T18:12:45.377Z\tCarlot in the center of the cities main attraction area
Storefront in Lockhart, 78644\t250\tLockhart\tTX\tgym\tsnack\t2025-10-16T21:02:33.293Z\tCombo, 3 employees
Plaza, Saginaw, TX, 76179\t800\tSaginaw\tTX\tpublicservice\tsnack\t2025-10-16T17:02:09.070Z\tEstablished Pet Store, 150+ daily foot traffic
Drink for employees\t500\tCedar Park\tTX\tauto\tsnack\t2025-10-14T19:43:15.796Z\tWill be placed in shop for employees
Stand Alone, Fort Worth, TX, 76244\t900\tFort Worth\tTX\tshop\tsnack\t2025-10-09T16:24:36.218Z\tPet Store, 14 Employees, 130+ daily foot traffic
Strip Mall, Rockledge, FL, 32955\t700\tRockledge\tFL\tgym\tsnack\t2025-09-22T15:46:02.771Z\tPopular Gym, 70+ minimum foot traffic, 7 days
Coin/bill changer needed at laundromat Lauderhill\t300\tLauderhill\tFL\tlaundromat\tsnack\t2025-09-20T19:27:43.954Z\tLaundromat needs coin and bill changer, 60+ traffic
Transportation Company Huntsville, ON CANADA\t300\tHuntsville\tON\toffice\tsnack\t2025-09-19T04:48:35.219Z\tTransportation Company, 16 Employees
Plaza, Pensacola, FL, 32504\t500\tPensacola\tFL\tpublicservice\tsnack\t2025-09-17T16:55:08.843Z\tYoga studio growing quick, 35+ daily traffic
New Vending Location - West Lafayette, IN\t700\tWest Lafayette\tIN\thospital\tsnack\t2025-09-10T18:48:59.888Z\tReady-to-go location for 2 machines, 70-80 employees
Plaza, Houston, TX, 77084\t350\tHouston\tTX\tbarbershop\tsnack\t2025-07-29T16:14:12.580Z\t4 Employees ATM Machine, 7 days a week
Warehouse requesting a combo machine\t350\tKyle\tTX\twarehouse\tsnack\t2025-07-28T20:57:35.549Z\tWarehouse requesting combo machine, 7-9 employees
Warehouse, Lockport, NY, 14094 ATM\t350\tLockport\tNY\tproduction\tatm\t2025-07-24T16:37:07.016Z\t3 to 5 Employees ATM machine, warehouse
Warehouse, Lockport, NY, 14094 Combo\t400\tLockport\tNY\tproduction\tsnack\t2025-07-24T16:20:53.542Z\t3 to 5 Employees, combo snack and drink
Stand Alone Bld, AL, 36535\t375\tFoley\tAL\tshop\tatm\t2025-07-17T16:11:16.921Z\t6 Employees ATM machine request
Warehouse, Antioch, CA-94509 combo\t300\tAntioch\tCA\twarehouse\tsnack\t2025-07-15T15:28:43.156Z\t3 Employees, combo snack and drink, limited space
Warehouse, Antioch, CA, 94509 transport\t320\tAntioch\tCA\ttransportation\tsnack\t2025-07-12T21:15:03.114Z\t5 employees, combo machine in lobby
Plaza Building\t800\tBrooksville\tFL\tshop\tsnack\t2025-07-11T18:23:22.587Z\t6 Employees, drink and snack combo
Stand Alone Building\t275\tBurleson\tTX\tshop\tsnack\t2025-07-09T20:00:35.820Z\t5 Employees wants snack and drink
Car/truck Wash Snack and/or Drink or Combo Machine\t300\tAirdrie\tAB\tauto\tsnack\t2025-04-23T17:10:13.568Z\tCar and truck wash interested in snack/drink machine`.split('\n');

function esc(s) {
  return s.replace(/'/g, "''");
}

const lines = [];
lines.push("-- Generated SQL for 222 new location listings (inquiry only)");
lines.push("-- All listings are lead_type = 'contracted' (inquiry only, no buy button)");
lines.push("-- Run AFTER migration 059_lead_type.sql and seed-locations.sql");
lines.push("");
lines.push("DO $$");
lines.push("DECLARE admin_id uuid;");
lines.push("BEGIN");
lines.push("  SELECT id INTO admin_id FROM auth.users WHERE email = 'james@apexaivending.com' LIMIT 1;");
lines.push("  IF admin_id IS NULL THEN");
lines.push("    SELECT id INTO admin_id FROM profiles LIMIT 1;");
lines.push("  END IF;");
lines.push("");

let count = 0;
for (const row of rows) {
  const parts = row.split('\t');
  if (parts.length < 8) continue;

  const [title, priceStr, city, state, buildingType, machineType, createdAt, description] = parts;
  const price = parseFloat(priceStr);
  const dbLocType = TYPE_MAP[buildingType] || 'other';
  const dbMachineType = MACHINE_MAP[machineType] || 'custom';

  lines.push(`  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)`);
  lines.push(`  VALUES (admin_id, '${esc(title)}', '${esc(description)}', '${esc(buildingType)}', '${esc(city)}', '${esc(state)}', NULL, '${dbLocType}', '{${dbMachineType}}', ${price}, 'open', 'email', true, 'contracted', 'flexible', false, '${createdAt}', now(), 'Vending Connector');`);
  lines.push("");
  count++;
}

lines.push("END $$;");
lines.push("");
lines.push(`-- Total: ${count} listings inserted`);

console.log(lines.join('\n'));
