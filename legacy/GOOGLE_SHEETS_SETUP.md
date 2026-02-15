# Google Sheets Lead Generator — Setup Guide

Pull 500+ Denver business leads directly into a Google Sheet using the Yelp API.
No Python, no local setup — runs entirely inside Google Sheets.

## Step 1: Get a Free Yelp API Key

1. Go to [Yelp Developers](https://www.yelp.com/developers/v3/manage_app)
2. Sign in or create a Yelp account
3. Create a new app (fill in any name/description)
4. Copy your **API Key**

## Step 2: Set Up the Google Sheet

1. Open [Google Sheets](https://sheets.new) (creates a new sheet)
2. Go to **Extensions → Apps Script**
3. Delete any existing code in the editor
4. Copy the entire contents of `google_apps_script.gs` and paste it in
5. Replace `YOUR_YELP_API_KEY_HERE` on line 18 with your actual API key
6. Click **Save** (Ctrl+S)

## Step 3: Run It

1. In the Apps Script editor, select **`main`** from the function dropdown (top bar)
2. Click the **Run** button (▶)
3. First run will ask for permissions — click **Review Permissions → Allow**
4. Wait ~5-10 minutes while it collects leads
5. Switch back to your Google Sheet tab — leads will appear when complete

## What You Get

Each lead includes:
| Column | Description |
|--------|-------------|
| Business Name | Company name |
| Industry | Category (apartments, hotels, gyms, etc.) |
| Address | Street address |
| City / State / Zip | Location details |
| Phone | Business phone number |
| Website | Yelp listing URL |
| Yelp Rating | Star rating (1-5) |
| Review Count | Number of Yelp reviews |
| Yelp ID | Unique identifier |
| Lat / Long | GPS coordinates |
| Date Collected | When the lead was pulled |

## Industries Searched

- Apartments
- Hotels
- Hospitals
- Car Dealerships
- Gyms / Fitness Centers
- Office Buildings
- Auto Repair Shops
- Car Washes
- Warehouses
- Distribution Centers
- Manufacturing Facilities

## Tips

- **Re-run anytime** by going to Extensions → Apps Script → Run `main`
- After the first run, a **Lead Generator** menu appears in your sheet for quick access
- Check **View → Execution log** in Apps Script to see progress
- Yelp free tier allows 500 API calls/day — the script typically uses 100-200 calls
- To search a different city, edit the `DENVER_LAT`, `DENVER_LNG`, and `NEIGHBORHOODS` variables
