/**
 * Bulk-import leads from a CSV/TSV spreadsheet into vending_requests.
 *
 * Usage:
 *   1. Export your spreadsheet as CSV and save as "leads.csv" in this folder
 *      Expected columns: #, Title, Price ($), Listing URL, Notes/Status
 *   2. Set your environment variables (or create a .env file):
 *        NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *        ADMIN_USER_ID=<your admin UUID from auth.users>
 *   3. Run:  node scripts/bulk-import-leads.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import "dotenv/config";

// ── Config ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID; // UUID of admin user

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_USER_ID) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_USER_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── CSV Parsing ─────────────────────────────────────────────────────
function parseCSV(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    console.error("CSV must have a header row and at least one data row");
    process.exit(1);
  }

  // Simple CSV parse (handles quoted fields with commas)
  function splitCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const header = splitCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "_"));
  console.log("Detected columns:", header);

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    header.forEach((col, i) => {
      row[col] = values[i] || "";
    });
    return row;
  });
}

// ── Field Extraction ────────────────────────────────────────────────
// Attempt to extract city/state from title string
const US_STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function extractLocation(title) {
  const lower = title.toLowerCase();
  let state = "TBD";
  let city = "TBD";

  // Try to find a state name in the title
  for (const [name, abbrev] of Object.entries(US_STATES)) {
    if (lower.includes(name)) {
      state = abbrev;
      // Try to find city: look for "in CityName, StateName" or "CityName, StateName"
      const patterns = [
        new RegExp(`in\\s+([A-Za-z\\s]+),?\\s+${name}`, "i"),
        new RegExp(`([A-Za-z\\s]+),\\s+${name}`, "i"),
      ];
      for (const p of patterns) {
        const match = title.match(p);
        if (match) {
          city = match[1].trim();
          break;
        }
      }
      break;
    }
  }

  // Also check for 2-letter state abbreviations like "Seattle, WA"
  if (state === "TBD") {
    const abbrMatch = title.match(/([A-Za-z\s]+),\s*([A-Z]{2})\b/);
    if (abbrMatch) {
      const abbr = abbrMatch[2];
      if (Object.values(US_STATES).includes(abbr)) {
        state = abbr;
        city = abbrMatch[1].trim();
      }
    }
  }

  return { city, state };
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function mapStatus(notesStatus) {
  if (!notesStatus) return "open";
  const lower = notesStatus.toLowerCase().trim();
  if (lower === "matched" || lower === "closed") return lower;
  return "open";
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const csvPath = resolve(process.argv[2] || "scripts/leads.csv");
  console.log(`Reading CSV from: ${csvPath}\n`);

  const rows = parseCSV(csvPath);
  console.log(`Found ${rows.length} rows to import\n`);

  let success = 0;
  let failed = 0;
  const errors = [];

  // Process in batches of 20
  const BATCH_SIZE = 20;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const records = batch.map((row) => {
      const title = row.title || row.title_ || "Untitled Lead";
      const { city, state } = extractLocation(title);
      const listingUrl = row.listing_url || row.listing_url_ || "";
      const price = parsePrice(row.price____ || row.price || "");
      const status = mapStatus(row.notes_status || row.notes_status_ || "");

      return {
        created_by: ADMIN_USER_ID,
        title,
        location_name: title,
        city,
        state,
        location_type: "other",
        machine_types_wanted: [],
        price,
        urgency: "flexible",
        status,
        is_public: false,       // Start as pending for admin review
        description: listingUrl ? `Source: ${listingUrl}` : null,
      };
    });

    const { data, error } = await supabase
      .from("vending_requests")
      .insert(records)
      .select("id, title");

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      failed += batch.length;
      errors.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: error.message });
    } else {
      success += data.length;
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${data.length} rows`);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Done! ${success} inserted, ${failed} failed out of ${rows.length} total`);
  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log(`  Batch ${e.batch}: ${e.error}`));
  }
}

main().catch(console.error);
