/**
 * Denver Lead Generator - Google Apps Script (Yelp Fusion API)
 * Pulls 500+ business leads and writes them directly to this Google Sheet.
 *
 * SETUP:
 *   1. Open a new Google Sheet
 *   2. Go to Extensions > Apps Script
 *   3. Delete any existing code and paste this entire script
 *   4. Replace YOUR_YELP_API_KEY_HERE with your Yelp API key
 *      (Get one free at https://www.yelp.com/developers/v3/manage_app)
 *   5. Click Save, then run "main" from the function dropdown
 *   6. Approve the permissions when prompted
 *   7. Wait 5-10 minutes - leads will populate in the sheet
 */

// --- CONFIG ---
var YELP_API_KEY = "YOUR_YELP_API_KEY_HERE";

var DENVER_LAT = 39.7392;
var DENVER_LNG = -104.9903;
var RADIUS_METERS = 40000;
var TARGET_LEADS = 500;
var PAGE_SIZE = 50;

// Industry search terms mapped to Yelp categories
var INDUSTRY_MAP = [
  { industry: "apartments",           term: "apartments",           categories: "apartments" },
  { industry: "hotels",               term: "hotels",               categories: "hotels" },
  { industry: "hospitals",            term: "hospitals",             categories: "hospitals" },
  { industry: "car dealerships",      term: "car dealerships",      categories: "car_dealers" },
  { industry: "gyms",                 term: "gyms",                 categories: "gyms" },
  { industry: "office buildings",     term: "office buildings",      categories: "" },
  { industry: "auto repair",          term: "auto repair",          categories: "autorepair" },
  { industry: "car wash",             term: "car wash",             categories: "carwash" },
  { industry: "warehouses",           term: "warehouses",           categories: "" },
  { industry: "distribution centers", term: "distribution center",  categories: "" },
  { industry: "manufacturing",        term: "manufacturing",        categories: "" }
];

// Denver metro neighborhoods for expanded Phase 2 searches
var NEIGHBORHOODS = [
  "Denver, CO",
  "Aurora, CO",
  "Lakewood, CO",
  "Thornton, CO",
  "Arvada, CO",
  "Westminster, CO",
  "Centennial, CO",
  "Highlands Ranch, CO",
  "Littleton, CO",
  "Commerce City, CO",
  "Englewood, CO",
  "Broomfield, CO",
  "Northglenn, CO",
  "Wheat Ridge, CO",
  "Federal Heights, CO",
  "Parker, CO",
  "Brighton, CO",
  "Golden, CO"
];

// --- MAIN ENTRY POINT ---

function main() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  // Clear and set up headers
  sheet.clear();
  var headers = [
    "Business Name", "Industry", "Address", "City", "State", "Zip",
    "Phone", "Website", "Yelp Rating", "Review Count",
    "Yelp ID", "Latitude", "Longitude", "Date Collected"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#4285f4")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);

  // Track unique businesses by Yelp ID
  var seenIds = {};
  var allLeads = [];
  var apiCalls = 0;

  Logger.log("=== Phase 1: Core industry searches ===");

  // Phase 1: Search each industry in Denver
  for (var i = 0; i < INDUSTRY_MAP.length; i++) {
    if (allLeads.length >= TARGET_LEADS) { break; }

    var ind = INDUSTRY_MAP[i];
    Logger.log("Searching: " + ind.industry);

    var result = searchYelp_(ind.term, ind.categories, DENVER_LAT, DENVER_LNG, RADIUS_METERS, ind.industry, seenIds);
    apiCalls += result.calls;
    for (var j = 0; j < result.leads.length; j++) {
      allLeads.push(result.leads[j]);
    }

    Logger.log("  Found " + result.leads.length + " new | Total: " + allLeads.length + " | API calls: " + apiCalls);
  }

  Logger.log("=== Phase 2: Neighborhood expansion ===");

  // Phase 2: Expand to neighborhoods for industries that need more leads
  if (allLeads.length < TARGET_LEADS) {
    for (var n = 0; n < NEIGHBORHOODS.length; n++) {
      if (allLeads.length >= TARGET_LEADS) { break; }

      var neighborhood = NEIGHBORHOODS[n];
      for (var i = 0; i < INDUSTRY_MAP.length; i++) {
        if (allLeads.length >= TARGET_LEADS) { break; }

        var ind = INDUSTRY_MAP[i];
        var result = searchYelpByLocation_(ind.term, ind.categories, neighborhood, ind.industry, seenIds);
        apiCalls += result.calls;
        for (var j = 0; j < result.leads.length; j++) {
          allLeads.push(result.leads[j]);
        }
      }
      Logger.log("  " + neighborhood + " done | Total: " + allLeads.length + " | API calls: " + apiCalls);
    }
  }

  // Write all leads to the sheet
  if (allLeads.length > 0) {
    var rows = [];
    for (var k = 0; k < allLeads.length; k++) {
      var lead = allLeads[k];
      rows.push([
        lead.name,
        lead.industry,
        lead.address,
        lead.city,
        lead.state,
        lead.zip,
        lead.phone,
        lead.website,
        lead.rating,
        lead.reviewCount,
        lead.yelpId,
        lead.lat,
        lead.lng,
        lead.dateCollected
      ]);
    }

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // Auto-resize columns
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }

  // Summary
  Logger.log("=== COMPLETE ===");
  Logger.log("Total leads: " + allLeads.length);
  Logger.log("Total API calls: " + apiCalls);

  SpreadsheetApp.getUi().alert(
    "Lead Generation Complete!\n\n" +
    "Total leads collected: " + allLeads.length + "\n" +
    "API calls used: " + apiCalls + "\n\n" +
    "Data is in your sheet."
  );
}

// --- YELP API SEARCH (by coordinates) ---

function searchYelp_(term, categories, lat, lng, radius, industry, seenIds) {
  var leads = [];
  var calls = 0;
  var offset = 0;
  var maxOffset = 1000;

  while (offset < maxOffset) {
    var url = "https://api.yelp.com/v3/businesses/search"
      + "?term=" + encodeURIComponent(term)
      + "&latitude=" + lat
      + "&longitude=" + lng
      + "&radius=" + radius
      + "&limit=" + PAGE_SIZE
      + "&offset=" + offset
      + "&sort_by=best_match";

    if (categories) {
      url += "&categories=" + encodeURIComponent(categories);
    }

    var data = yelpFetch_(url);
    calls++;

    if (!data || !data.businesses || data.businesses.length === 0) { break; }

    for (var i = 0; i < data.businesses.length; i++) {
      var biz = data.businesses[i];
      if (!seenIds[biz.id]) {
        seenIds[biz.id] = true;
        leads.push(parseBusiness_(biz, industry));
      }
    }

    if (data.businesses.length < PAGE_SIZE) { break; }

    offset += PAGE_SIZE;
    Utilities.sleep(350);
  }

  return { leads: leads, calls: calls };
}

// --- YELP API SEARCH (by location string) ---

function searchYelpByLocation_(term, categories, location, industry, seenIds) {
  var leads = [];
  var calls = 0;
  var offset = 0;
  var maxOffset = 200;

  while (offset < maxOffset) {
    var url = "https://api.yelp.com/v3/businesses/search"
      + "?term=" + encodeURIComponent(term)
      + "&location=" + encodeURIComponent(location)
      + "&limit=" + PAGE_SIZE
      + "&offset=" + offset
      + "&sort_by=best_match";

    if (categories) {
      url += "&categories=" + encodeURIComponent(categories);
    }

    var data = yelpFetch_(url);
    calls++;

    if (!data || !data.businesses || data.businesses.length === 0) { break; }

    for (var i = 0; i < data.businesses.length; i++) {
      var biz = data.businesses[i];
      if (!seenIds[biz.id]) {
        seenIds[biz.id] = true;
        leads.push(parseBusiness_(biz, industry));
      }
    }

    if (data.businesses.length < PAGE_SIZE) { break; }

    offset += PAGE_SIZE;
    Utilities.sleep(350);
  }

  return { leads: leads, calls: calls };
}

// --- PARSE A YELP BUSINESS INTO A LEAD ROW ---

function parseBusiness_(biz, industry) {
  var loc = biz.location || {};
  var addr = loc.address1 || "";
  if (loc.address2) {
    addr = addr + " " + loc.address2;
  }
  var lat = "";
  var lng = "";
  if (biz.coordinates) {
    lat = biz.coordinates.latitude;
    lng = biz.coordinates.longitude;
  }
  return {
    name: biz.name || "",
    industry: industry,
    address: addr,
    city: loc.city || "",
    state: loc.state || "",
    zip: loc.zip_code || "",
    phone: biz.display_phone || biz.phone || "",
    website: biz.url || "",
    rating: biz.rating || "",
    reviewCount: biz.review_count || 0,
    yelpId: biz.id || "",
    lat: lat,
    lng: lng,
    dateCollected: new Date().toISOString().split("T")[0]
  };
}

// --- YELP API FETCH WITH RETRY ---

function yelpFetch_(url) {
  var options = {
    method: "get",
    headers: {
      "Authorization": "Bearer " + YELP_API_KEY
    },
    muteHttpExceptions: true
  };

  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();

      if (code === 200) {
        return JSON.parse(response.getContentText());
      }

      if (code === 429) {
        Logger.log("Rate limited, waiting 5s...");
        Utilities.sleep(5000);
        continue;
      }

      if (code === 400) {
        return null;
      }

      Logger.log("HTTP " + code + ": " + response.getContentText().substring(0, 200));
      return null;

    } catch (e) {
      Logger.log("Fetch error (attempt " + (attempt + 1) + "): " + e.message);
      Utilities.sleep(2000 * (attempt + 1));
    }
  }

  return null;
}

// --- MENU ITEM (optional convenience) ---

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Lead Generator")
    .addItem("Run Lead Generator", "main")
    .addToUi();
}
