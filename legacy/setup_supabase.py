"""Create the leads table in Supabase via REST API."""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

sql = """
CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    business_name TEXT,
    industry TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone_number TEXT,
    website TEXT,
    google_rating NUMERIC,
    total_reviews INTEGER,
    place_id TEXT UNIQUE NOT NULL,
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_place_id ON leads(place_id);
CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);
"""

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

# Use Supabase REST RPC to run raw SQL
resp = requests.post(
    f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
    headers=headers,
    json={"query": sql}
)

if resp.status_code in (200, 201, 204):
    print("Table 'leads' created successfully.")
else:
    print(f"RPC exec_sql not available ({resp.status_code}). Trying direct table check...")
    # Try to query the table to see if it exists
    resp2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads?select=id&limit=1",
        headers=headers
    )
    if resp2.status_code == 200:
        print("Table 'leads' already exists.")
    else:
        print(f"Table 'leads' does not exist. Status: {resp2.status_code}")
        print("Please create the table manually in Supabase SQL Editor with:")
        print(sql)
        print("\nAttempting to create via SQL endpoint...")
        # Try the query endpoint
        resp3 = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/",
            headers=headers,
            json={"query": sql}
        )
        print(f"Response: {resp3.status_code} - {resp3.text[:200] if resp3.text else 'empty'}")
