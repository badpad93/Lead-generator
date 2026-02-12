"""
Upload leads from SQLite/CSV to Supabase.
Run this from a machine with direct Supabase access.

Usage:
    python upload_to_supabase.py

Requires .env with SUPABASE_URL and SUPABASE_KEY.

Before running, create the leads table in Supabase SQL Editor:

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

import os
import csv
import json
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
CSV_PATH = "leads.csv"


def upload():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_KEY in .env")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    # Read CSV
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Loaded {len(rows)} leads from {CSV_PATH}")

    # Clean data types
    for row in rows:
        if row.get("google_rating"):
            try:
                row["google_rating"] = float(row["google_rating"])
            except (ValueError, TypeError):
                row["google_rating"] = None
        else:
            row["google_rating"] = None

        if row.get("total_reviews"):
            try:
                row["total_reviews"] = int(row["total_reviews"])
            except (ValueError, TypeError):
                row["total_reviews"] = None
        else:
            row["total_reviews"] = None

        if row.get("latitude"):
            try:
                row["latitude"] = float(row["latitude"])
            except (ValueError, TypeError):
                row["latitude"] = None
        else:
            row["latitude"] = None

        if row.get("longitude"):
            try:
                row["longitude"] = float(row["longitude"])
            except (ValueError, TypeError):
                row["longitude"] = None
        else:
            row["longitude"] = None

        # Null empty strings
        for key in row:
            if row[key] == "":
                row[key] = None

    # Upload in batches
    batch_size = 50
    uploaded = 0
    failed = 0
    errors = []

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/leads",
                headers=headers,
                json=batch,
                timeout=30,
            )
            if resp.status_code in (200, 201, 204):
                uploaded += len(batch)
                if uploaded % 100 == 0:
                    print(f"  Uploaded {uploaded}/{len(rows)}...")
            else:
                failed += len(batch)
                if len(errors) < 3:
                    errors.append(f"Batch {i}: {resp.status_code} - {resp.text[:200]}")
        except requests.RequestException as e:
            failed += len(batch)
            if len(errors) < 3:
                errors.append(f"Batch {i}: {e}")

    print(f"\nDone: {uploaded} uploaded, {failed} failed")
    if errors:
        print("\nErrors:")
        for e in errors:
            print(f"  {e}")


if __name__ == "__main__":
    upload()
