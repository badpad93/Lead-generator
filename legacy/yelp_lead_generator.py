"""
Denver Lead Generator - Yelp Fusion API → SQLite + CSV + Supabase
Collects 500+ businesses suitable for vending machine placement.
Alternative to Google Places API — Free tier: 500 API calls/day.

Setup:
  1. Go to https://www.yelp.com/developers/v3/manage_app
  2. Create an app (free) and copy your API Key
  3. Add YELP_API_KEY=your_key_here to your .env file
  4. Run: python yelp_lead_generator.py
"""

import os
import time
import sqlite3
import csv
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG ───────────────────────────────────────────────────────────
YELP_API_KEY = os.getenv("YELP_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

DENVER_LAT = 39.7392
DENVER_LNG = -104.9903
RADIUS_METERS = 40000  # Yelp max is 40,000 meters (~25 miles)

TARGET_LEADS = 500

# Yelp Fusion API
YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"
YELP_MAX_RESULTS_PER_QUERY = 1000  # Yelp caps offset at 1000
YELP_PAGE_SIZE = 50  # Max per request
DAILY_CALL_LIMIT = 500  # Free tier limit

# Rate limiting — stay well under Yelp's limits
REQUEST_DELAY = 0.3  # seconds between requests

# Industry → Yelp search terms and categories
INDUSTRY_MAP = [
    {"industry": "warehouses",           "term": "warehouses",           "categories": ""},
    {"industry": "distribution centers", "term": "distribution center",  "categories": ""},
    {"industry": "manufacturing",        "term": "manufacturing",        "categories": ""},
    {"industry": "apartments",           "term": "apartments",           "categories": "apartments"},
    {"industry": "hotels",               "term": "hotels",               "categories": "hotels"},
    {"industry": "hospitals",            "term": "hospitals",            "categories": "hospitals"},
    {"industry": "car dealerships",      "term": "car dealerships",      "categories": "car_dealers"},
    {"industry": "gyms",                 "term": "gyms",                 "categories": "gyms"},
    {"industry": "office buildings",     "term": "office buildings",     "categories": ""},
    {"industry": "auto repair",          "term": "auto repair",          "categories": "autorepair"},
    {"industry": "car wash",             "term": "car wash",             "categories": "carwash"},
]

# Denver metro neighborhoods for expanded searches
NEIGHBORHOODS = [
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
    "Golden, CO",
]

DB_PATH = "yelp_leads.db"
CSV_PATH = "yelp_leads.csv"


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


# ─── API CALL TRACKER ────────────────────────────────────────────────
class CallTracker:
    def __init__(self, daily_limit):
        self.daily_limit = daily_limit
        self.calls = 0

    def add_call(self):
        self.calls += 1
        if self.calls >= self.daily_limit:
            raise DailyLimitReachedError(
                f"Daily API call limit ({self.daily_limit}) reached after {self.calls} calls. "
                f"Run again tomorrow for more leads."
            )

    def summary(self):
        return f"  API calls used: {self.calls} / {self.daily_limit}"


class DailyLimitReachedError(Exception):
    pass


# ─── YELP FUSION API ─────────────────────────────────────────────────
def api_request_with_retry(url, params, max_retries=3):
    headers = {"Authorization": f"Bearer {YELP_API_KEY}"}

    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=30)

            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                print(f"    Rate limited. Waiting {wait}s...")
                time.sleep(wait)
                continue

            if resp.status_code == 400:
                # Yelp returns 400 for invalid offset (>1000)
                return None

            if resp.status_code >= 500:
                wait = 2 ** (attempt + 1)
                print(f"    Server error {resp.status_code}. Retrying in {wait}s...")
                time.sleep(wait)
                continue

            if resp.status_code == 401:
                print("    ERROR: Invalid Yelp API key. Check your .env file.")
                return None

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


def search_yelp(term, location, call_tracker, categories="", offset=0):
    """Search Yelp for businesses."""
    params = {
        "term": term,
        "location": location,
        "radius": RADIUS_METERS,
        "limit": YELP_PAGE_SIZE,
        "offset": offset,
        "sort_by": "best_match",
    }
    if categories:
        params["categories"] = categories

    call_tracker.add_call()
    time.sleep(REQUEST_DELAY)

    resp = api_request_with_retry(YELP_SEARCH_URL, params)
    if resp is None or resp.status_code != 200:
        if resp:
            print(f"    Yelp API error: {resp.status_code} - {resp.text[:200]}")
        return [], 0

    data = resp.json()
    businesses = data.get("businesses", [])
    total = data.get("total", 0)
    return businesses, total


def parse_business(biz, industry):
    """Parse a Yelp business into a lead dict matching existing schema."""
    yelp_id = f"yelp_{biz.get('id', '')}"
    name = biz.get("name", "")
    location = biz.get("location", {})
    address_parts = [location.get("address1", "")]
    if location.get("address2"):
        address_parts.append(location["address2"])
    if location.get("address3"):
        address_parts.append(location["address3"])
    city = location.get("city", "Denver")
    state = location.get("state", "CO")
    zipcode = location.get("zip_code", "")
    full_address = ", ".join(filter(None, address_parts + [city, f"{state} {zipcode}"]))

    phone = biz.get("display_phone") or biz.get("phone") or None
    # Clean empty phone strings
    if phone and phone.strip() in ("", "+"):
        phone = None

    website = biz.get("url")  # Yelp page URL (business website not available via search)
    rating = biz.get("rating")
    review_count = biz.get("review_count")
    coords = biz.get("coordinates", {})
    lat = coords.get("latitude")
    lng = coords.get("longitude")

    return {
        "business_name": name,
        "industry": industry,
        "address": full_address,
        "city": city or "Denver",
        "state": state or "CO",
        "zip": zipcode,
        "phone_number": phone,
        "website": website,
        "google_rating": rating,  # Storing Yelp rating in same column
        "total_reviews": review_count,
        "place_id": yelp_id,  # Prefixed with "yelp_" to avoid collision
        "latitude": lat,
        "longitude": lng,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def collect_industry(conn, industry_config, call_tracker, seen_ids, location="Denver, CO"):
    """Collect leads for one industry in one location, paginating through results."""
    industry = industry_config["industry"]
    term = industry_config["term"]
    categories = industry_config["categories"]

    collected = 0
    offset = 0

    while offset < YELP_MAX_RESULTS_PER_QUERY:
        businesses, total = search_yelp(term, location, call_tracker, categories, offset)

        if not businesses:
            break

        new_in_page = 0
        for biz in businesses:
            yelp_id = f"yelp_{biz.get('id', '')}"
            if yelp_id in seen_ids:
                continue
            seen_ids.add(yelp_id)

            lead = parse_business(biz, industry)
            if not place_id_exists(conn, yelp_id):
                insert_lead(conn, lead)
                collected += 1
                new_in_page += 1

        # If no new results in this page, skip further pagination
        if new_in_page == 0:
            break

        total_in_db = count_leads(conn)
        if total_in_db >= TARGET_LEADS:
            return collected

        offset += YELP_PAGE_SIZE

        # Yelp caps at 1000 total results
        if offset >= min(total, YELP_MAX_RESULTS_PER_QUERY):
            break

    return collected


# ─── EXPORT & UPLOAD ──────────────────────────────────────────────────
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
            "phone_number", "website", "rating", "total_reviews",
            "source_id", "latitude", "longitude", "created_at"
        ])
        writer.writerows(rows)

    print(f"\nExported {len(rows)} leads to {CSV_PATH}")
    return len(rows)


def upload_to_supabase(conn):
    """Upload leads to Supabase REST API."""
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

    batch_size = 50
    uploaded = 0
    failed = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        records = [dict(zip(columns, row)) for row in batch]

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
    print("  DENVER LEAD GENERATOR (Yelp Fusion API)")
    print("  Target: 500+ businesses for vending machine placement")
    print("  Free tier: 500 API calls/day — no billing required")
    print("=" * 60)

    if not YELP_API_KEY:
        print("\nERROR: YELP_API_KEY not set in .env")
        print("\nTo get a free Yelp API key:")
        print("  1. Go to https://www.yelp.com/developers/v3/manage_app")
        print("  2. Sign in / create a Yelp account")
        print("  3. Create an app (any name, e.g. 'Lead Generator')")
        print("  4. Copy the API Key")
        print("  5. Add to .env: YELP_API_KEY=your_key_here")
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

    call_tracker = CallTracker(DAILY_CALL_LIMIT)
    seen_ids = set()

    # Load existing IDs to skip duplicates
    cur = conn.execute("SELECT place_id FROM leads")
    for row in cur:
        seen_ids.add(row[0])

    print(f"\nStarting collection (max {DAILY_CALL_LIMIT} API calls/day)...")
    print(f"Industries: {len(INDUSTRY_MAP)}")
    print(f"Location: Denver, CO metro area ({len(NEIGHBORHOODS)} areas)")
    print()

    try:
        # Phase 1: Search each industry in Denver
        print("-- Phase 1: Core Denver searches --")
        for config in INDUSTRY_MAP:
            if count_leads(conn) >= TARGET_LEADS:
                break
            print(f'\n  [{config["industry"]}] Searching Denver...')
            n = collect_industry(conn, config, call_tracker, seen_ids, "Denver, CO")
            total = count_leads(conn)
            phones = count_with_phone(conn)
            print(f'    +{n} leads | Total: {total} | Phones: {phones} | API calls: {call_tracker.calls}')

        total = count_leads(conn)
        print(f"\n-- Phase 1 complete: {total} leads --")

        # Phase 2: Expand to surrounding neighborhoods
        if total < TARGET_LEADS:
            print(f"\n-- Phase 2: Neighborhood expansion --")
            for config in INDUSTRY_MAP:
                if count_leads(conn) >= TARGET_LEADS:
                    break
                for neighborhood in NEIGHBORHOODS[1:]:  # Skip "Denver, CO" (already done)
                    if count_leads(conn) >= TARGET_LEADS:
                        break
                    n = collect_industry(conn, config, call_tracker, seen_ids, neighborhood)
                    if n > 0:
                        total = count_leads(conn)
                        print(f'    [{config["industry"]}] {neighborhood}: +{n} | Total: {total}')

    except DailyLimitReachedError as e:
        print(f"\n{e}")
        print("Your leads so far have been saved. Run again tomorrow for more.")

    # Export and upload
    export_csv(conn)
    upload_to_supabase(conn)
    print_summary(conn, call_tracker)
    conn.close()


def print_summary(conn, call_tracker=None):
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
    if call_tracker:
        print(f"\n  {call_tracker.summary()}")
    print("=" * 60)

    # Industry breakdown
    cur = conn.execute("""
        SELECT industry, COUNT(*) as cnt,
               SUM(CASE WHEN phone_number IS NOT NULL AND phone_number != '' THEN 1 ELSE 0 END) as phones
        FROM leads GROUP BY industry ORDER BY cnt DESC
    """)
    print(f"\n  Industry Breakdown:")
    print(f"  {'Industry':<25} {'Total':>6} {'Phones':>7}")
    print(f"  {'-'*25} {'-'*6} {'-'*7}")
    for row in cur:
        print(f"  {row[0]:<25} {row[1]:>6} {row[2]:>7}")

    print(f"\n  Data files:")
    print(f"    SQLite: {DB_PATH}")
    print(f"    CSV:    {CSV_PATH}")


if __name__ == "__main__":
    main()
