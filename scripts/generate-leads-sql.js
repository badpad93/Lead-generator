#!/usr/bin/env node
/**
 * Generates a SQL file for importing 123 leads into vending_requests.
 * Output: supabase/seed-leads.sql
 *
 * Usage: node scripts/generate-leads-sql.js
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// State name → 2-letter abbreviation
// ---------------------------------------------------------------------------
const STATE_MAP = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

const ABBREV_SET = new Set(Object.values(STATE_MAP));

const ZIP_TO_STATE = {
  "06062": "CT", "70714": "LA", "11205": "NY", "65616": "MO",
  "90063": "CA", "26062": "WV", "80031": "CO", "20151": "VA",
  "48120": "MI", "46567": "IN", "25304": "WV",
};

const ZIP_TO_CITY = {
  "06062": "Plainville", "70714": "Baker", "11205": "Brooklyn",
  "65616": "Branson", "90063": "Los Angeles", "26062": "Weirton",
  "80031": "Westminster", "20151": "Chantilly", "48120": "Dearborn",
  "46567": "Syracuse", "25304": "Charleston",
};

function inferLocationType(title) {
  const t = title.toLowerCase();
  if (/\bgym\b|fitness|gymnastic/.test(t)) return "gym";
  if (/\bapartment\b|residential|unit/.test(t)) return "apartment";
  if (/\bschool\b|university|martial arts/.test(t)) return "school";
  if (/\bhospital\b|medical/.test(t)) return "hospital";
  if (/\bhotel\b/.test(t)) return "hotel";
  if (/\bwarehouse\b|manufacturing|industrial|factory/.test(t)) return "warehouse";
  if (/\bretail\b|store|shop|salon|barbershop|barber|tattoo|convenience|gas station|plaza|laundromat|laundry|car wash|car\/truck/.test(t)) return "retail";
  if (/\bgovernment\b|public/.test(t)) return "government";
  if (/\boffice\b|co.?working|coworking/.test(t)) return "office";
  return "other";
}

function inferMachineTypes(title) {
  const t = title.toLowerCase();
  const types = [];
  if (/\batm\b/.test(t)) types.push("custom");
  if (/\bsnack\b/.test(t)) types.push("snack");
  if (/\bbeverage\b|\bdrink\b|\bsoda\b/.test(t)) types.push("beverage");
  if (/\bcombo\b|\bcombination\b/.test(t)) types.push("combo");
  if (/\bhealthy\b|\borganic\b/.test(t)) types.push("healthy");
  if (/\bcoffee\b|\bhot drink/.test(t)) types.push("coffee");
  if (/\bfrozen\b|\bice cream\b/.test(t)) types.push("frozen");
  if (/\bfresh\b|\bmeal/.test(t)) types.push("fresh_food");
  if (/\barcade\b/.test(t)) types.push("custom");
  if (/\bppe\b/.test(t)) types.push("personal_care");
  if (types.length === 0) types.push("combo");
  return [...new Set(types)];
}

function parseLocation(title) {
  let city = null, state = null, zip = null;
  const t = title;

  // Pattern 1: "in City, State" (full state name)
  const inCityState = t.match(/\bin\s+([A-Z][a-zA-Z .]+?),?\s+(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i);
  if (inCityState) {
    city = inCityState[1].replace(/,\s*$/, "").trim();
    state = STATE_MAP[inCityState[2].toLowerCase()];
    return { city, state, zip };
  }

  // Pattern 2: "in City, ST" (2-letter abbrev)
  const inCityAbbr = t.match(/\bin\s+([A-Z][a-zA-Z .]+?),?\s+([A-Z]{2})\b/);
  if (inCityAbbr && ABBREV_SET.has(inCityAbbr[2])) {
    city = inCityAbbr[1].replace(/,\s*$/, "").trim();
    state = inCityAbbr[2];
    city = city.replace(/\s+(needs|wants|looking|seeking).*$/i, "").trim();
    return { city, state, zip };
  }

  // Pattern 3: "City, ST, ZIP"
  const cityStateZip = t.match(/([A-Z][a-zA-Z .]+?),\s*([A-Z]{2}),?\s*(\d{5})/);
  if (cityStateZip && ABBREV_SET.has(cityStateZip[2])) {
    city = cityStateZip[1].replace(/,\s*$/, "").trim();
    state = cityStateZip[2];
    zip = cityStateZip[3];
    return { city, state, zip };
  }

  // Pattern 4: "in CityName ST" without comma
  const inCityNoComma = t.match(/\bin\s+([A-Z][a-zA-Z .]+?)\s+([A-Z]{2})\b/);
  if (inCityNoComma && ABBREV_SET.has(inCityNoComma[2])) {
    city = inCityNoComma[1].replace(/,\s*$/, "").trim();
    state = inCityNoComma[2];
    city = city.replace(/\s+(needs|wants|looking|seeking).*$/i, "").trim();
    return { city, state, zip };
  }

  // Pattern 5: ZIP code lookup
  const zipMatch = t.match(/\b(\d{5})\b/);
  if (zipMatch) {
    zip = zipMatch[1];
    if (ZIP_TO_STATE[zip]) {
      state = ZIP_TO_STATE[zip];
      city = ZIP_TO_CITY[zip] || null;
      return { city, state, zip };
    }
  }

  // Pattern 6: State name anywhere
  for (const [stateName, abbr] of Object.entries(STATE_MAP)) {
    const re = new RegExp(`\\b${stateName}\\b`, "i");
    if (re.test(t)) {
      state = abbr;
      const beforeState = t.match(new RegExp(`\\bin\\s+([A-Z][a-zA-Z .]+?)\\s+${stateName}`, "i"));
      if (beforeState) city = beforeState[1].replace(/,\s*$/, "").trim();
      return { city, state, zip };
    }
  }

  return { city, state, zip };
}

// ---------------------------------------------------------------------------
// All 123 leads
// ---------------------------------------------------------------------------
const LEADS = [
  { num: 1, title: "Combo Machine needed in Montgomery, AL", price: 320, seller: "Kristie S" },
  { num: 2, title: "GYM", price: 340, seller: "Connor D" },
  { num: 3, title: "Apartment complex", price: 500, seller: "Alex F" },
  { num: 4, title: "Laundromat in Plainville CT needs ATM 06062", price: 400, seller: "Lance T" },
  { num: 5, title: "New Retail Store & Gamespace Needs Ice Cream Vending Machine", price: 320, seller: "Jose D" },
  { num: 6, title: "Barber shop 70714 needs vending services", price: 360, seller: "Lance T" },
  { num: 7, title: "11205 Auto repair shop - Tired of sending customers to bank", price: 400, seller: "Lance T" },
  { num: 8, title: "HIGH-TRAFFIC RETAIL - 2 ARCADE MACHINE PLACEMENT", price: 450, seller: "Martin Vending Strategy" },
  { num: 9, title: "BRANDED BARBER SHOP - SNACK MACHINE OPPORTUNITY", price: 400, seller: "Martin Vending Strategy" },
  { num: 10, title: "Location in Seattle Washington needs vending", price: 750, seller: "Randolph B" },
  { num: 11, title: "Location needs vending machine combo", price: 660, seller: "Oscar F" },
  { num: 12, title: "Company near 26062 needs to replace current vendor", price: 800, seller: "Damione B" },
  { num: 13, title: "Office building wants a combo vending machine - Great foottraffic", price: 670, seller: "Oscar F" },
  { num: 14, title: "Vending location for sale in 80031", price: 600, seller: "Joe T" },
  { num: 15, title: "Location in Richmond Virginia needs vending", price: 1400, seller: "Casey C" },
  { num: 16, title: "Busy good foot traffic barbershop", price: 360, seller: "Oscar F" },
  { num: 17, title: "2-star hotel in 65616 needs vending services", price: 680, seller: "Lance T" },
  { num: 18, title: "Location in North Little Rock, Arkansas needs vending", price: 900, seller: "Joshua" },
  { num: 19, title: "Hotel 90063 Seeking ATM Services", price: 680, seller: "Lance T" },
  { num: 20, title: "Co working spaces office building looking for combination", price: 850, seller: "Oscar F" },
  { num: 21, title: "Excellent location coworking spaces looking for a combo", price: 540, seller: "Oscar F" },
  { num: 22, title: "Location in Chico, California needs vending", price: 680, seller: "Aracely C" },
  { num: 23, title: "Location in Hinesville, Georgia needs vending", price: 540, seller: "Taylor W" },
  { num: 24, title: "Location in El Paso, Texas needs vending", price: 550, seller: "Jordan H" },
  { num: 25, title: "Location in Monterey Park, California needs vending", price: 680, seller: "Aracely C" },
  { num: 26, title: "Location in Chantilly, Virginia needs vending", price: 1350, seller: "Casey C" },
  { num: 27, title: "ATM Most famous tattoo artist in America", price: 540, seller: "Brad Schweizman" },
  { num: 28, title: "100+ Unit Apartment complex in Athens GA", price: 1000, seller: "Jeremy Krys" },
  { num: 29, title: "Convenience store needs ATM", price: 650, seller: "Michael L" },
  { num: 30, title: "Nail salon in Hyattsville MD", price: 600, seller: "Jeremy Krys" },
  { num: 31, title: "Barber shop in Atlanta Georgia", price: 680, seller: "Jeremy Krys" },
  { num: 32, title: "Location in Columbus, Ohio needs vending", price: 750, seller: "Ashley Y" },
  { num: 33, title: "Laundromat in Hayward CA", price: 500, seller: "Shelly W" },
  { num: 34, title: "Location in Long Beach, California needs vending", price: 1000, seller: "Aracely C" },
  { num: 35, title: "Martial Arts School 24/7", price: 660, seller: "Mia" },
  { num: 36, title: "Apartment Complex Looking for Vending Machine", price: 500, seller: "Mia" },
  { num: 37, title: "High Traffic Barber Shop Needs Vending Machine", price: 700, seller: "Mia" },
  { num: 38, title: "Busy laundromat In Raleigh", price: 700, seller: "Jeremy Krys" },
  { num: 39, title: "Location in Indianapolis, Indiana needs vending", price: 700, seller: "Ashley Y" },
  { num: 40, title: "Location in Charlotte, North Carolina needs vending", price: 650, seller: "Ashley Y" },
  { num: 41, title: "Location in Akron, Ohio needs vending", price: 700, seller: "Ashley Y" },
  { num: 42, title: "Location in Memphis, Tennessee needs vending", price: 700, seller: "Ashley Y" },
  { num: 43, title: "Location in Louisville, Kentucky needs vending", price: 750, seller: "Ashley Y" },
  { num: 44, title: "Location in Kansas City, Missouri needs vending", price: 750, seller: "Ashley Y" },
  { num: 45, title: "Location in Omaha, Nebraska needs vending", price: 700, seller: "Ashley Y" },
  { num: 46, title: "Location in Tulsa, Oklahoma needs vending", price: 650, seller: "Ashley Y" },
  { num: 47, title: "Location in Virginia Beach, Virginia needs vending", price: 700, seller: "Ashley Y" },
  { num: 48, title: "Location in Atlanta, Georgia needs vending", price: 750, seller: "Ashley Y" },
  { num: 49, title: "Location in Colorado Springs, Colorado needs vending", price: 700, seller: "Ashley Y" },
  { num: 50, title: "Location in Raleigh, North Carolina needs vending", price: 700, seller: "Ashley Y" },
  { num: 51, title: "Location in Minneapolis, Minnesota needs vending", price: 750, seller: "Ashley Y" },
  { num: 52, title: "Location in New Orleans, Louisiana needs vending", price: 680, seller: "Ashley Y" },
  { num: 53, title: "Location in Tampa, Florida needs vending", price: 700, seller: "Ashley Y" },
  { num: 54, title: "Location in Pittsburgh, Pennsylvania needs vending", price: 720, seller: "Ashley Y" },
  { num: 55, title: "Warehouse In Chantilly Virginia 20151", price: 540, seller: "Patricia H" },
  { num: 56, title: "This location has lots of foot traffic", price: 360, seller: "Oscar F" },
  { num: 57, title: "Home, Syracuse, IN, 46567", price: 650, seller: "Edwin G" },
  { num: 58, title: "Co-working office building", price: 660, seller: "Oscar F" },
  { num: 59, title: "Small auto shop needs vending service 48120", price: 280, seller: "Lance T" },
  { num: 60, title: "Excellent co-working space", price: 720, seller: "Oscar F" },
  { num: 61, title: "Location in Fayetteville, NC needs vending", price: 680, seller: "Ashley Y" },
  { num: 62, title: "Location in Shreveport, LA needs vending", price: 620, seller: "Ashley Y" },
  { num: 63, title: "Location in Baton Rouge, LA needs vending", price: 650, seller: "Ashley Y" },
  { num: 64, title: "Location in Lexington, KY needs vending", price: 680, seller: "Ashley Y" },
  { num: 65, title: "Location in Anchorage, AK needs vending", price: 750, seller: "Ashley Y" },
  { num: 66, title: "Location in St. Petersburg, FL needs vending", price: 700, seller: "Ashley Y" },
  { num: 67, title: "Location in Newark, NJ needs vending", price: 750, seller: "Ashley Y" },
  { num: 68, title: "Location in Plano, TX needs vending", price: 680, seller: "Ashley Y" },
  { num: 69, title: "Location in Henderson, NV needs vending", price: 650, seller: "Ashley Y" },
  { num: 70, title: "Location in Greensboro, NC needs vending", price: 650, seller: "Ashley Y" },
  { num: 71, title: "Location in Stockton, CA needs vending", price: 680, seller: "Aracely C" },
  { num: 72, title: "Location in Lincoln, NE needs vending", price: 620, seller: "Ashley Y" },
  { num: 73, title: "Location in St. Louis, MO needs vending", price: 700, seller: "Ashley Y" },
  { num: 74, title: "Location in Madison, WI needs vending", price: 680, seller: "Ashley Y" },
  { num: 75, title: "Location in Durham, NC needs vending", price: 650, seller: "Ashley Y" },
  { num: 76, title: "Office space in Columbia SC", price: 600, seller: "Edwin G" },
  { num: 77, title: "Location in Aurora, CO needs vending", price: 680, seller: "Ashley Y" },
  { num: 78, title: "Location in Riverside, CA needs vending", price: 700, seller: "Aracely C" },
  { num: 79, title: "Location in Bakersfield, CA needs vending", price: 650, seller: "Aracely C" },
  { num: 80, title: "Location in Fort Wayne, IN needs vending", price: 640, seller: "Ashley Y" },
  { num: 81, title: "Busy barbershop in Shreveport LA", price: 480, seller: "Lance T" },
  { num: 82, title: "Location in Spokane, WA needs vending", price: 660, seller: "Ashley Y" },
  { num: 83, title: "Location in Chandler, AZ needs vending", price: 650, seller: "Ashley Y" },
  { num: 84, title: "Location in Scottsdale, AZ needs vending", price: 700, seller: "Ashley Y" },
  { num: 85, title: "Location in Glendale, AZ needs vending", price: 650, seller: "Ashley Y" },
  { num: 86, title: "Location in Tacoma, WA needs vending", price: 660, seller: "Ashley Y" },
  { num: 87, title: "Location in Garland, TX needs vending", price: 650, seller: "Ashley Y" },
  { num: 88, title: "Location in Irving, TX needs vending", price: 680, seller: "Ashley Y" },
  { num: 89, title: "Location in Fremont, CA needs vending", price: 700, seller: "Aracely C" },
  { num: 90, title: "Location in San Bernardino, CA needs vending", price: 650, seller: "Aracely C" },
  { num: 91, title: "Location in Boise, ID needs vending", price: 640, seller: "Ashley Y" },
  { num: 92, title: "Location in Birmingham, AL needs vending", price: 650, seller: "Ashley Y" },
  { num: 93, title: "Office park in Bethesda MD", price: 560, seller: "Jeremy Krys" },
  { num: 94, title: "Busy nail salon in Silver Spring MD", price: 580, seller: "Jeremy Krys" },
  { num: 95, title: "Auto dealership in Orlando FL", price: 800, seller: "Mia" },
  { num: 96, title: "Stand Alone Bldg, Charleston, WV, 25304", price: 1500, seller: "Edwin G" },
  { num: 97, title: "Super Busy Hotel in El Monte CA", price: 1328, seller: "Jeremy Krys" },
  { num: 98, title: "Nice Apartment Complex in MD", price: 540, seller: "Jeremy Krys" },
  { num: 99, title: "Laundromat in Inglewood, California", price: 450, seller: "Shelly W" },
  { num: 100, title: "Two busy gymnastic places", price: 800, seller: "Jeremy Krys" },
  { num: 101, title: "Laundromat in Pawtucket RI", price: 450, seller: "Shelly W" },
  { num: 102, title: "Gas station in Phoenix, AZ", price: 700, seller: "Jordan H" },
  { num: 103, title: "Gym in Nashville TN", price: 720, seller: "Jeremy Krys" },
  { num: 104, title: "Car wash in Houston TX", price: 650, seller: "Jordan H" },
  { num: 105, title: "Barbershop in Detroit MI", price: 420, seller: "Lance T" },
  { num: 106, title: "Office building in Denver CO", price: 780, seller: "Oscar F" },
  { num: 107, title: "Manufacturing facility in Indiana", price: 980, seller: "Christopher S" },
  { num: 108, title: "Hotel in San Antonio TX", price: 850, seller: "Mia" },
  { num: 109, title: "Laundromat in Providence RI", price: 480, seller: "Shelly W" },
  { num: 110, title: "Barbershop in Baltimore MD", price: 460, seller: "Lance T" },
  { num: 111, title: "Convenience store in Chicago IL", price: 720, seller: "Michael L" },
  { num: 112, title: "Manufacturing Facility in Indiana (2)", price: 980, seller: "Christopher S" },
  { num: 113, title: "Location in Corpus Christi TX needs vending", price: 620, seller: "Jordan H" },
  { num: 114, title: "Location in Lubbock TX needs vending", price: 580, seller: "Jordan H" },
  { num: 115, title: "Location in Fort Worth TX needs vending", price: 700, seller: "Jordan H" },
  { num: 116, title: "Barbershop in St. Louis MO", price: 420, seller: "Lance T" },
  { num: 117, title: "Office building in Tampa FL", price: 850, seller: "Mia" },
  { num: 118, title: "Laundromat in Riverside CA", price: 500, seller: "Shelly W" },
  { num: 119, title: "Location in Albuquerque NM needs vending", price: 600, seller: "Ashley Y" },
  { num: 120, title: "Location in Tucson AZ needs vending", price: 580, seller: "Ashley Y" },
  { num: 121, title: "Plaza Building", price: 800, seller: "Edwin G" },
  { num: 122, title: "Stand Alone Building", price: 275, seller: "Edwin G" },
  { num: 123, title: "Car/truck Wash Snack and/or Drink or Combo Machine", price: 300, seller: "Mia" },
];

// ---------------------------------------------------------------------------
// SQL escaping
// ---------------------------------------------------------------------------
function esc(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + str.replace(/'/g, "''") + "'";
}

function escArr(arr) {
  return "'{" + arr.join(",") + "}'";
}

// ---------------------------------------------------------------------------
// Generate SQL
// ---------------------------------------------------------------------------
const BYTEBITE_USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let sql = `-- ==========================================================================
-- Vending Connector: Import 123 Leads
-- Attributed to ByteBite Vending (Apex) admin account
-- Run this in Supabase SQL Editor AFTER schema.sql and seed.sql
-- ==========================================================================

-- Step 1: Create ByteBite Vending admin profile (skip if exists)
INSERT INTO public.profiles (id, full_name, email, role, company_name, bio, city, state, verified)
VALUES (
  '${BYTEBITE_USER_ID}',
  'ByteBite Vending',
  'admin@bytebitevending.com',
  'location_manager',
  'ByteBite Vending (Apex)',
  'Platform admin account for imported vending leads.',
  'National',
  'US',
  true
) ON CONFLICT (id) DO NOTHING;

-- Step 2: Insert 123 leads into vending_requests
INSERT INTO public.vending_requests (
  created_by, title, description, location_name,
  city, state, zip, location_type,
  machine_types_wanted, urgency, status,
  contact_preference, is_public, views
) VALUES
`;

const rows = [];
let withCity = 0, withState = 0;

for (const lead of LEADS) {
  const loc = parseLocation(lead.title);
  const locationType = inferLocationType(lead.title);
  const machineTypes = inferMachineTypes(lead.title);
  const city = loc.city || "Unknown";
  const state = loc.state || "US";
  const zipVal = loc.zip;
  const desc = `Imported lead #${lead.num}. Original seller: ${lead.seller}. Listed at $${lead.price.toLocaleString()}.`;

  if (city !== "Unknown") withCity++;
  if (state !== "US") withState++;

  rows.push(
    `  ('${BYTEBITE_USER_ID}', ${esc(lead.title)}, ${esc(desc)}, ${esc(lead.title)},\n` +
    `   ${esc(city)}, ${esc(state)}, ${zipVal ? esc(zipVal) : "NULL"}, ${esc(locationType)},\n` +
    `   ${escArr(machineTypes)}, 'flexible', 'open',\n` +
    `   'platform_message', true, 0)`
  );
}

sql += rows.join(",\n\n") + ";\n";

sql += `
-- Verify: count imported leads
-- SELECT count(*) FROM public.vending_requests WHERE created_by = '${BYTEBITE_USER_ID}';
`;

const outPath = path.resolve(__dirname, "..", "supabase", "seed-leads.sql");
fs.writeFileSync(outPath, sql, "utf8");

console.log(`Generated ${outPath}`);
console.log(`  ${LEADS.length} leads total`);
console.log(`  ${withCity}/${LEADS.length} cities parsed`);
console.log(`  ${withState}/${LEADS.length} states parsed`);

// Print leads with missing location data
const missing = [];
for (const lead of LEADS) {
  const loc = parseLocation(lead.title);
  if (!loc.city && !loc.state) {
    missing.push(lead);
  }
}
if (missing.length > 0) {
  console.log(`\n  Leads with NO location data:`);
  for (const m of missing) {
    console.log(`    #${m.num}: "${m.title}"`);
  }
}
