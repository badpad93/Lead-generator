"""
Denver Lead Generator - Google Places API (New) → SQLite + CSV + Supabase
Collects 500+ businesses suitable for vending machine placement.
"""

import os
import json
import time
import sqlite3
import csv
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG ───────────────────────────────────────────────────────────
GOOGLE_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

DENVER_LAT = 39.7392
DENVER_LNG = -104.9903
RADIUS_MILES = 25
RADIUS_METERS = int(RADIUS_MILES * 1609.34)  # ~40,234m

TARGET_LEADS = 500
MAX_SPEND_USD = 15.0

# Google Places API (New) pricing (per 1000 requests):
# Text Search: $32/1000 = $0.032 per request
# Place Details: $17/1000 = $0.017 per request (basic+contact+atmosphere)
# We estimate cost as we go
COST_TEXT_SEARCH = 0.032
COST_PLACE_DETAILS = 0.017

INDUSTRIES = [
    "warehouses",
    "distribution centers",
    "manufacturing",
    "apartments",
    "hotels",
    "hospitals",
    "car dealerships",
    "gyms",
    "office buildings",
    "auto repair",
    "car wash",
]

# Places API (New) endpoints
TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Rate limiting
REQUESTS_PER_SECOND = 5
REQUEST_DELAY = 1.0 / REQUESTS_PER_SECOND

DB_PATH = "leads.db"
CSV_PATH = "leads.csv"

# ─── SQLITE SETUP ────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT,
            industry TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            zip TEXT,
            phone_number TEXT,
            website TEXT,
            google_rating REAL,
            total_reviews INTEGER,
            place_id TEXT UNIQUE NOT NULL,
            latitude REAL,
            longitude REAL,
            created_at TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_place_id ON leads(place_id)")
    conn.commit()
    return conn


def place_id_exists(conn, place_id):
    cur = conn.execute("SELECT 1 FROM leads WHERE place_id = ?", (place_id,))
    return cur.fetchone() is not None


def count_leads(conn):
    cur = conn.execute("SELECT COUNT(*) FROM leads")
    return cur.fetchone()[0]


def count_with_phone(conn):
    cur = conn.execute("SELECT COUNT(*) FROM leads WHERE phone_number IS NOT NULL AND phone_number != ''")
    return cur.fetchone()[0]


def insert_lead(conn, lead):
    conn.execute("""
        INSERT OR IGNORE INTO leads
        (business_name, industry, address, city, state, zip, phone_number,
         website, google_rating, total_reviews, place_id, latitude, longitude, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        lead["business_name"],
        lead["industry"],
        lead["address"],
        lead["city"],
        lead["state"],
        lead["zip"],
        lead["phone_number"],
        lead["website"],
        lead["google_rating"],
        lead["total_reviews"],
        lead["place_id"],
        lead["latitude"],
        lead["longitude"],
        lead["created_at"],
    ))
    conn.commit()


# ─── GOOGLE PLACES API (NEW) ─────────────────────────────────────────
class CostTracker:
    def __init__(self, max_usd):
        self.max_usd = max_usd
        self.total = 0.0
        self.text_search_count = 0
        self.detail_count = 0

    def add_text_search(self):
        self.total += COST_TEXT_SEARCH
        self.text_search_count += 1
        self._check()

    def add_detail(self):
        self.total += COST_PLACE_DETAILS
        self.detail_count += 1
        self._check()

    def _check(self):
        if self.total >= self.max_usd:
            raise BudgetExceededError(
                f"Budget limit ${self.max_usd:.2f} reached. "
                f"Spent ~${self.total:.2f} ({self.text_search_count} searches, {self.detail_count} details)"
            )

    def summary(self):
        return (
            f"  Text searches: {self.text_search_count} (~${self.text_search_count * COST_TEXT_SEARCH:.2f})\n"
            f"  Detail requests: {self.detail_count} (~${self.detail_count * COST_PLACE_DETAILS:.2f})\n"
            f"  Estimated total: ~${self.total:.2f}"
        )


class BudgetExceededError(Exception):
    pass


def api_request_with_retry(method, url, headers, json_body=None, max_retries=3):
    for attempt in range(max_retries):
        try:
            if method == "POST":
                resp = requests.post(url, headers=headers, json=json_body, timeout=30)
            else:
                resp = requests.get(url, headers=headers, timeout=30)

            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                print(f"    Rate limited. Waiting {wait}s...")
                time.sleep(wait)
                continue

            if resp.status_code >= 500:
                wait = 2 ** (attempt + 1)
                print(f"    Server error {resp.status_code}. Retrying in {wait}s...")
                time.sleep(wait)
                continue

            return resp
        except requests.RequestException as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"    Request failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"    Request failed after {max_retries} retries: {e}")
                return None
    return None


def search_places(query, cost_tracker, page_token=None):
    """Search for places using Text Search (New)."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,"
            "places.nationalPhoneNumber,places.internationalPhoneNumber,"
            "places.websiteUri,places.rating,places.userRatingCount,"
            "places.location,places.addressComponents,"
            "nextPageToken"
        ),
    }

    body = {
        "textQuery": query,
        "locationBias": {
            "circle": {
                "center": {"latitude": DENVER_LAT, "longitude": DENVER_LNG},
                "radius": float(RADIUS_METERS),
            }
        },
        "maxResultCount": 20,
    }

    if page_token:
        body["pageToken"] = page_token

    cost_tracker.add_text_search()
    time.sleep(REQUEST_DELAY)

    resp = api_request_with_retry("POST", TEXT_SEARCH_URL, headers, body)
    if resp is None or resp.status_code != 200:
        if resp:
            print(f"    Search API error: {resp.status_code} - {resp.text[:200]}")
        return [], None

    data = resp.json()
    places = data.get("places", [])
    next_token = data.get("nextPageToken")
    return places, next_token


def parse_address_components(components):
    """Extract city, state, zip from address components."""
    city = ""
    state = ""
    zipcode = ""
    for comp in components:
        types = comp.get("types", [])
        if "locality" in types:
            city = comp.get("longText", "")
        elif "administrative_area_level_1" in types:
            state = comp.get("shortText", "")
        elif "postal_code" in types:
            zipcode = comp.get("longText", "")
    return city, state, zipcode


def parse_place(place, industry):
    """Parse a place from Text Search (New) response into a lead dict."""
    place_id = place.get("id", "")
    name = place.get("displayName", {}).get("text", "")
    address = place.get("formattedAddress", "")
    phone = place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber") or None
    website = place.get("websiteUri") or None
    rating = place.get("rating")
    reviews = place.get("userRatingCount")
    location = place.get("location", {})
    lat = location.get("latitude")
    lng = location.get("longitude")

    components = place.get("addressComponents", [])
    city, state, zipcode = parse_address_components(components)

    # Default city/state if not parsed
    if not city:
        city = "Denver"
    if not state:
        state = "CO"

    return {
        "business_name": name,
        "industry": industry,
        "address": address,
        "city": city,
        "state": state,
        "zip": zipcode,
        "phone_number": phone,
        "website": website,
        "google_rating": rating,
        "total_reviews": reviews,
        "place_id": place_id,
        "latitude": lat,
        "longitude": lng,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def collect_industry(conn, industry, cost_tracker, seen_ids):
    """Collect all places for a given industry query."""
    query = f"{industry} in Denver Colorado"
    print(f"\n  Searching: \"{query}\"")

    page = 0
    collected = 0

    places, next_token = search_places(query, cost_tracker)
    while places:
        page += 1
        for place in places:
            pid = place.get("id", "")
            if not pid or pid in seen_ids:
                continue
            seen_ids.add(pid)

            lead = parse_place(place, industry)
            if not place_id_exists(conn, pid):
                insert_lead(conn, lead)
                collected += 1

        total = count_leads(conn)
        if total >= TARGET_LEADS:
            print(f"    Target reached! {total} leads collected.")
            return collected

        if next_token:
            time.sleep(1.5)  # Google requires delay between pagination
            places, next_token = search_places(query, cost_tracker, page_token=next_token)
        else:
            break

    print(f"    Collected {collected} new leads from \"{industry}\"")
    return collected


def expand_queries(industry):
    """Generate multiple query variations to maximize results."""
    base_queries = [
        f"{industry} in Denver Colorado",
        f"{industry} near Denver CO",
        f"{industry} Denver metro area",
    ]
    # Add neighborhood-specific queries for broader coverage
    neighborhoods = [
        "Aurora", "Lakewood", "Thornton", "Arvada", "Westminster",
        "Centennial", "Highlands Ranch", "Littleton", "Commerce City",
        "Englewood", "Broomfield", "Northglenn", "Wheat Ridge",
        "Federal Heights", "Sheridan",
    ]
    for n in neighborhoods:
        base_queries.append(f"{industry} in {n} Colorado")
    return base_queries


def collect_industry_expanded(conn, industry, cost_tracker, seen_ids):
    """Collect places using multiple query variations."""
    queries = expand_queries(industry)
    total_collected = 0

    for query in queries:
        if count_leads(conn) >= TARGET_LEADS:
            break

        try:
            cost_tracker._check()
        except BudgetExceededError:
            raise

        print(f"    Query: \"{query}\"")

        places, next_token = search_places(query, cost_tracker)
        page_count = 0

        while places:
            page_count += 1
            new_in_page = 0

            for place in places:
                pid = place.get("id", "")
                if not pid or pid in seen_ids:
                    continue
                seen_ids.add(pid)

                lead = parse_place(place, industry)
                if not place_id_exists(conn, pid):
                    insert_lead(conn, lead)
                    total_collected += 1
                    new_in_page += 1

            if new_in_page == 0 and page_count > 1:
                break

            total = count_leads(conn)
            if total >= TARGET_LEADS:
                return total_collected

            if total % 50 < 20 and total > 0:
                phones = count_with_phone(conn)
                print(f"    ── Progress: {total} leads | {phones} with phone | ~${cost_tracker.total:.2f} spent")

            if next_token:
                time.sleep(1.5)
                places, next_token = search_places(query, cost_tracker, page_token=next_token)
            else:
                break

    print(f"    {industry}: +{total_collected} new leads")
    return total_collected


def export_csv(conn):
    """Export all leads to CSV."""
    cur = conn.execute("""
        SELECT business_name, industry, address, city, state, zip,
               phone_number, website, google_rating, total_reviews,
               place_id, latitude, longitude, created_at
        FROM leads ORDER BY industry, business_name
    """)
    rows = cur.fetchall()

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "business_name", "industry", "address", "city", "state", "zip",
            "phone_number", "website", "google_rating", "total_reviews",
            "place_id", "latitude", "longitude", "created_at"
        ])
        writer.writerows(rows)

    print(f"\nExported {len(rows)} leads to {CSV_PATH}")
    return len(rows)


def upload_to_supabase(conn):
    """Attempt to upload leads to Supabase REST API."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("\nSupabase credentials not set. Skipping upload.")
        return False

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    cur = conn.execute("""
        SELECT business_name, industry, address, city, state, zip,
               phone_number, website, google_rating, total_reviews,
               place_id, latitude, longitude, created_at
        FROM leads
    """)
    rows = cur.fetchall()
    columns = [
        "business_name", "industry", "address", "city", "state", "zip",
        "phone_number", "website", "google_rating", "total_reviews",
        "place_id", "latitude", "longitude", "created_at"
    ]

    # Upload in batches of 50
    batch_size = 50
    uploaded = 0
    failed = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        records = []
        for row in batch:
            record = dict(zip(columns, row))
            records.append(record)

        try:
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/leads",
                headers=headers,
                json=records,
                timeout=30,
            )
            if resp.status_code in (200, 201, 204):
                uploaded += len(batch)
            else:
                failed += len(batch)
                if i == 0:
                    print(f"  Supabase upload error: {resp.status_code} - {resp.text[:200]}")
                    print("  Continuing with local storage only...")
                    return False
        except requests.RequestException as e:
            print(f"  Supabase connection failed: {e}")
            print("  Data saved locally. Run upload_to_supabase.py separately.")
            return False

    print(f"\nSupabase: uploaded {uploaded}, failed {failed}")
    return uploaded > 0


# ─── MAIN ─────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  DENVER LEAD GENERATOR")
    print("  Target: 500+ businesses for vending machine placement")
    print("=" * 60)

    if not GOOGLE_API_KEY:
        print("ERROR: GOOGLE_PLACES_API_KEY not set in .env")
        return

    conn = init_db()
    existing = count_leads(conn)
    print(f"\nExisting leads in database: {existing}")

    if existing >= TARGET_LEADS:
        print(f"Already have {existing} leads. Exporting and uploading...")
        export_csv(conn)
        upload_to_supabase(conn)
        print_summary(conn)
        conn.close()
        return

    cost_tracker = CostTracker(MAX_SPEND_USD)
    seen_ids = set()

    # Load existing place_ids to skip
    cur = conn.execute("SELECT place_id FROM leads")
    for row in cur:
        seen_ids.add(row[0])

    print(f"\nStarting collection (budget: ${MAX_SPEND_USD:.2f})...")
    print(f"Industries: {len(INDUSTRIES)}")
    print(f"Location: Denver, CO ({RADIUS_MILES} mile radius)\n")

    try:
        # Phase 1: Basic queries for each industry
        print("── Phase 1: Industry searches ──")
        for industry in INDUSTRIES:
            if count_leads(conn) >= TARGET_LEADS:
                break
            collect_industry(conn, industry, cost_tracker, seen_ids)

        total = count_leads(conn)
        print(f"\n── Phase 1 complete: {total} leads ──")

        # Phase 2: Expanded queries if we need more
        if total < TARGET_LEADS:
            print(f"\n── Phase 2: Expanded neighborhood searches ──")
            for industry in INDUSTRIES:
                if count_leads(conn) >= TARGET_LEADS:
                    break
                collect_industry_expanded(conn, industry, cost_tracker, seen_ids)

    except BudgetExceededError as e:
        print(f"\n⚠ {e}")

    # Export and upload
    export_csv(conn)
    upload_to_supabase(conn)
    print_summary(conn, cost_tracker)
    conn.close()


def print_summary(conn, cost_tracker=None):
    total = count_leads(conn)
    with_phone = count_with_phone(conn)
    without_phone = total - with_phone

    print("\n" + "=" * 60)
    print("  FINAL RESULTS")
    print("=" * 60)
    print(f"  Total leads collected:     {total}")
    print(f"  With phone numbers:        {with_phone}")
    print(f"  Missing phone numbers:     {without_phone}")
    if total > 0:
        print(f"  Phone coverage:            {with_phone/total*100:.1f}%")
    if cost_tracker:
        print(f"\n  API Cost Breakdown:")
        print(cost_tracker.summary())
    print("=" * 60)

    # Industry breakdown
    cur = conn.execute("""
        SELECT industry, COUNT(*) as cnt,
               SUM(CASE WHEN phone_number IS NOT NULL AND phone_number != '' THEN 1 ELSE 0 END) as phones
        FROM leads GROUP BY industry ORDER BY cnt DESC
    """)
    print("\n  Industry Breakdown:")
    print(f"  {'Industry':<25} {'Total':>6} {'Phones':>7}")
    print(f"  {'-'*25} {'-'*6} {'-'*7}")
    for row in cur:
        print(f"  {row[0]:<25} {row[1]:>6} {row[2]:>7}")


if __name__ == "__main__":
    main()
