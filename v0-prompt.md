# Lead Generator — Vercel v0 Frontend Prompt

Copy and paste the entire prompt below into [v0.dev](https://v0.dev) to generate a production-ready frontend for the Lead Generator application.

---

## v0 Prompt

Build a complete, modern **Lead Generator** web application using **Next.js 14+ App Router**, **React 19**, **Tailwind CSS**, **shadcn/ui**, and **@supabase/supabase-js**. This app allows users to create lead generation "runs" targeting businesses by city, state, industry, and radius — then view, search, edit, and export collected leads in real time.

---

### Tech Stack

- **Framework**: Next.js 14+ (App Router, server components where possible)
- **UI**: Tailwind CSS + shadcn/ui components (Button, Input, Select, Card, Badge, Table, Dialog, Progress, Tabs, Tooltip, Skeleton, Toast)
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`
- **Validation**: Zod
- **Icons**: Lucide React
- **Excel Export**: ExcelJS
- **Charts**: Recharts (for dashboard analytics)

---

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=<supabase project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase service role key>
FIRECRAWL_API_KEY=<firecrawl api key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=<random secret for cron auth>
```

---

### Database Schema (Supabase PostgreSQL)

#### Table: `runs`
```sql
CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  state text NOT NULL,
  radius_miles int NOT NULL DEFAULT 50,
  max_leads int NOT NULL DEFAULT 500,
  industries text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  progress jsonb NOT NULL DEFAULT '{"total":0,"message":"Queued"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### Table: `leads`
```sql
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  industry text,
  business_name text,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  website text,
  employee_count int,
  customer_count int,
  decision_maker text,
  contacted_date date,
  notes text,
  source_url text,
  distance_miles numeric,
  confidence numeric,
  normalized_domain text GENERATED ALWAYS AS (
    lower(regexp_replace(regexp_replace(coalesce(website,''), '^https?://', ''), '^www\.', ''))
  ) STORED,
  normalized_phone text GENERATED ALWAYS AS (
    regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g')
  ) STORED,
  normalized_name text GENERATED ALWAYS AS (
    lower(regexp_replace(coalesce(business_name,''), '[^a-zA-Z0-9]', '', 'g'))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_run_id ON leads(run_id);
CREATE INDEX idx_leads_industry ON leads(industry);
CREATE UNIQUE INDEX idx_leads_dedupe ON leads(
  run_id,
  nullif(normalized_name, ''),
  nullif(normalized_domain, ''),
  nullif(normalized_phone, ''),
  nullif(zip, '')
);
```

#### Table: `geocode_cache`
```sql
CREATE TABLE geocode_cache (
  address_key text PRIMARY KEY,
  lat numeric,
  lng numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### Pages & Routes

#### 1. `/` — Dashboard (Home Page)

A clean dashboard with:

- **Header**: "Lead Generator" brand with navigation links (Dashboard, New Run, Runs History)
- **Stats Cards Row** (4 cards):
  - Total Runs (count of all runs)
  - Active Runs (status = 'running')
  - Total Leads (count of all leads across all runs)
  - Avg Confidence (average confidence score, displayed as percentage)
- **Recent Runs Table**: Show the last 10 runs with columns:
  - City/State, Industries (as badges, max 3 shown + "+N more"), Status badge (color-coded: queued=gray, running=blue with pulse animation, done=green, failed=red), Leads Count, Created date (relative time like "2 hours ago"), Action button to view
- **Quick Action**: Prominent "New Run" button (links to /new)

#### 2. `/new` — Create New Run

A beautiful form with:

- **Card Layout** with clear sections
- **Location Section**:
  - City: text input with placeholder "e.g. Denver"
  - State: dropdown select with all 50 US states (2-letter codes)
- **Search Parameters Section**:
  - Radius: slider (1–200 miles, default 50) with displayed value and mile markers
  - Max Leads: number input (1–5000, default 500) with helper text
- **Industry Selection Section**:
  - Grid of 14 industry checkboxes (3 columns on desktop, 2 on tablet, 1 on mobile):
    - Apartments, Hotels, Hospitals, Assisted Living, Nursing Homes
    - Gyms, Office Space, School Campuses
    - Warehouses, Distribution Centers, Manufacturing Plants
    - Car Dealerships, Car Service Stations, Car Washes
  - "Select All" / "Clear All" toggle button
  - Selected count badge: "X of 14 selected"
- **Form Actions**:
  - "Create Run" primary button (disabled until valid)
  - Shows validation errors inline with red text
  - Loading spinner on submit
  - On success: redirect to `/runs/[id]`
- **Zod Validation**:
  - city: required, max 100 chars
  - state: 2-letter code required
  - radius_miles: 1–200
  - max_leads: 1–5000
  - industries: at least 1 selected

API Call: `POST /api/runs` with `{ city, state, radius_miles, max_leads, industries }`

#### 3. `/runs` — Runs History

- **Page Title**: "All Runs" with count badge
- **Filters Row**:
  - Status filter: All / Queued / Running / Done / Failed (tab-style buttons)
  - Search by city name
  - Sort: Newest First / Oldest First
- **Runs Grid/List**: Each run as a Card showing:
  - City, State (large)
  - Status badge (color-coded with icon)
  - Industries as small badges
  - Radius, Max Leads info
  - Lead count progress bar (leads collected / max leads)
  - Progress message
  - Created date
  - "View Details" button
- **Empty State**: Illustration + "No runs yet. Create your first run!" with CTA button
- **Pagination**: Load more or page numbers

#### 4. `/runs/[id]` — Run Detail Page

**Header Section**:
- Back button (← Back to Runs)
- Title: "{City}, {State}" in large text
- Status badge (animated pulse for running)
- Run metadata: Radius, Max Leads, Created date, Run ID (truncated)

**Progress Section** (shown while queued/running):
- Large progress bar with percentage
- "{X} of {maxLeads} leads collected"
- Current status message (e.g., "Searching hotels in Denver, CO...")
- Estimated time remaining (optional)
- **Start Run** button (if status = queued) — calls `POST /api/runs/[id]/start`
- Auto-polls every 4 seconds while status is queued or running

**Action Bar**:
- "Export CSV" button with download icon
- "Export Excel" button with spreadsheet icon
- Both disabled until leads exist
- CSV: `GET /api/runs/[id]/export.csv`
- Excel: `GET /api/runs/[id]/export.xlsx`

**Industries Section**:
- Display all selected industries as colored badges in a flex-wrap row

**Leads Table Section**:
- **Search Bar**: Real-time search across business name, industry, city, phone
- **Lead Count**: "Showing X of Y leads"
- **Table Columns**:
  | Column | Type | Notes |
  |--------|------|-------|
  | Industry | text | Badge style |
  | Business Name | text | Bold, primary |
  | Address | text | Full address |
  | City | text | |
  | State | text | |
  | Zip | text | |
  | Phone | text | Clickable tel: link |
  | Website | text | Clickable external link with icon |
  | Distance | number | "{X} mi" format |
  | Confidence | number | Color-coded badge: green ≥0.7, yellow 0.4–0.69, red <0.4 |
  | Employee Count | number | Editable |
  | Customer Count | number | Editable |
  | Decision Maker | text | Editable |
  | Contacted Date | date | Editable date picker |
  | Notes | text | Editable textarea, expandable |
  | Source | url | External link icon |

- **Inline Editing**: Click any editable cell to edit. Show Save/Cancel buttons. Call `PATCH /api/leads/[leadId]` with updated fields.
- **Pagination**: 50 leads per page with page controls
- **Empty State**: "No leads found" with context message
- **Responsive**: Horizontal scroll on mobile, sticky first column

**Polling Logic**:
```typescript
// Poll run status every 4 seconds while queued/running
useEffect(() => {
  if (run.status === 'done' || run.status === 'failed') return;
  const interval = setInterval(() => {
    fetchRun();      // GET /api/runs/[id]
    fetchLeads();    // GET /api/runs/[id]/leads?limit=50&offset=0
  }, 4000);
  return () => clearInterval(interval);
}, [run.status]);
```

---

### API Routes to Implement

#### `POST /api/runs` — Create a new run
- Validate body with Zod
- Insert into `runs` table with status="queued"
- Return `{ id: uuid }`

#### `GET /api/runs` — List all runs
- Return last 50 runs ordered by created_at DESC
- Include lead count for each run (subquery or join)

#### `GET /api/runs/[id]` — Get single run
- Return full run object

#### `POST /api/runs/[id]/start` — Start a queued run
- Check status is "queued", update to "running"
- Return `{ ok: true }`

#### `GET /api/runs/[id]/leads` — Paginated leads
- Query params: `limit` (default 50, max 200), `offset`, `search`
- Search uses ilike on business_name, industry, city, phone
- Return `{ leads: Lead[], total: number }`

#### `GET /api/runs/[id]/export.csv` — CSV export
- Return all leads as CSV download
- Columns: industry, business_name, address, city, state, zip, phone, website, employee_count, customer_count, decision_maker, contacted_date, notes, source_url, distance_miles, confidence
- Proper CSV escaping

#### `GET /api/runs/[id]/export.xlsx` — Excel export
- Use ExcelJS to create workbook
- Blue header row with white bold text
- Auto-sized columns
- Filename: `leads_{city}_{state}.xlsx`

#### `PATCH /api/leads/[leadId]` — Update lead
- Accepts: `notes` (string, max 2000), `contacted_date` (date), `employee_count` (int), `customer_count` (int), `decision_maker` (string)
- Validate with Zod
- Return updated lead

#### `GET /api/cron/process-runs` — Cron worker
- Verify `x-cron-secret` header or `?secret=` query param matches CRON_SECRET env var
- Find next run with status "queued" or "running"
- Execute the scraping pipeline (described below)
- Return `{ ok: true, processed: boolean }`

---

### Backend Scraping Pipeline (worker logic for `/api/cron/process-runs`)

This is the core backend logic. Implement in `src/lib/worker.ts`:

```
processRun(runId):
  1. Fetch run config from Supabase
  2. Geocode city center using OpenStreetMap Nominatim:
     GET https://nominatim.openstreetmap.org/search?q={city},{state}&format=json&limit=1
     Extract lat/lng. Cache results.
  3. For each industry in run.industries:
     - Build 6 search queries:
       "{industry} in {city}, {state}"
       "{industry} companies {city}, {state}"
       "{industry} businesses near {city}, {state}"
       "best {industry} {city}, {state}"
       "{industry} services {city}, {state} directory"
       "top {industry} {city}, {state} list"
     - For each query:
       a. firecrawl.search(query, {limit: 10}) → results[]
       b. For each result URL:
          - firecrawl.scrapeUrl(url, {formats: ["markdown"]}) → markdown
          - Extract leads from markdown (parse business_name, phone, address, website)
          - Find contact/about page links in markdown (same domain only)
          - Scrape up to 2 follow links for additional data
          - For each extracted lead:
            * Check dedupe (normalize name+domain+phone+zip)
            * Validate business_name length ≥ 3
            * Geocode address → lat/lng
            * Calculate Haversine distance from city center
            * Filter: only include if within radius_miles
            * Compute confidence score:
              address_parsed: +0.4, phone: +0.2, website: +0.2, within_radius: +0.2, directory_source: -0.2
            * Insert into leads table (skip on dedupe constraint violation)
            * Update run progress: { total: leadCount, message: "Searching {industry}..." }
  4. Set run status to "done" (or "failed" on error)
```

Use the Firecrawl JS SDK (`@mendable/firecrawl-js`):
```typescript
import FirecrawlApp from '@mendable/firecrawl-js';
const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

// Search
const searchResult = await firecrawl.search(query, { limit: 10 });

// Scrape
const scrapeResult = await firecrawl.scrapeUrl(url, { formats: ['markdown'] });
```

---

### Supabase Client Setup

```typescript
// src/lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

### Design Requirements

- **Color Scheme**: Professional dark sidebar + light content area, or full light mode with blue accent colors
- **Typography**: Clean sans-serif (Inter or system font stack)
- **Spacing**: Generous padding, clear visual hierarchy
- **Cards**: Rounded corners, subtle shadows, hover effects
- **Status Colors**:
  - Queued: gray/slate
  - Running: blue with pulse/shimmer animation
  - Done: green
  - Failed: red
- **Confidence Colors**:
  - High (≥0.7): green badge
  - Medium (0.4–0.69): yellow/amber badge
  - Low (<0.4): red badge
- **Responsive**: Mobile-first, works on all screen sizes
- **Loading States**: Skeleton loaders for tables/cards, spinners for buttons
- **Empty States**: Friendly illustrations or icons with helpful messages
- **Toast Notifications**: Success/error toasts for actions (create run, save edits, export)
- **Dark Mode**: Support system preference and manual toggle via next-themes

---

### Vercel Config

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/process-runs?secret=${CRON_SECRET}",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

```typescript
// next.config.ts
export default {
  serverExternalPackages: ["exceljs"]
};
```

---

### Key Implementation Notes

1. All API routes use the `supabaseAdmin` client (service role key) for full database access
2. The frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` only for real-time subscriptions (optional)
3. The cron worker runs every 2 minutes and processes one run at a time
4. Geocoding uses free OpenStreetMap Nominatim with 1 request/second rate limit
5. Firecrawl handles the actual web scraping (converts pages to markdown)
6. The leads table has a unique composite index for automatic deduplication
7. Phone extraction regex: `(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}`
8. Address extraction regex: `(\d{1,5}\s[\w\s.]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle|Pkwy|Parkway)[\w\s.,]*?,\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)`
9. All user-facing text inputs are sanitized and validated with Zod
10. Excel export includes styled headers (blue background, white text, bold)
