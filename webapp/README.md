# Lead Generator Web App

Production-ready lead scraping web app with a Vercel-hosted Next.js frontend, Firecrawl scraping pipeline, Supabase (Postgres) storage, and CSV/Excel export.

## Features

- Configure city, state, radius, max leads, and target industries
- Firecrawl-powered web scraping with search + scrape + follow contact pages
- OpenStreetMap Nominatim geocoding with radius filtering
- Confidence scoring per lead
- Automatic deduplication
- Real-time progress polling
- CSV and Excel (.xlsx) export
- Inline editing of notes and contacted date
- Vercel Cron-based background worker

## Tech Stack

- **Next.js 14+** (App Router, TypeScript)
- **Supabase** (Postgres)
- **Firecrawl** (`@mendable/firecrawl-js`) for web scraping
- **ExcelJS** for .xlsx export
- **Zod** for validation
- **Tailwind CSS** for UI
- **Vercel** for deployment + cron

## Setup

### 1. Clone and install

```bash
cd webapp
npm install
```

### 2. Create Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** in the Supabase dashboard
3. Copy and paste the contents of `supabase/migrations/001_initial.sql`
4. Click **Run** to create all tables, indexes, and triggers

### 3. Get API keys

#### Supabase
- Go to **Settings > API** in your Supabase dashboard
- Copy the **URL**, **anon key**, and **service_role key**

#### Firecrawl
- Sign up at [firecrawl.dev](https://firecrawl.dev)
- Get your API key from the dashboard

### 4. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FIRECRAWL_API_KEY=fc-your-api-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=any-random-string-you-choose
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Run the worker locally

The worker processes queued/running runs. Two options:

**Option A: Call the cron endpoint**
```bash
curl "http://localhost:3000/api/cron/process-runs?secret=YOUR_CRON_SECRET"
```

**Option B: Run the CLI worker**
```bash
npx tsx scripts/run-worker.js
```

## Deploy to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Lead generator web app"
git push
```

### 2. Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your repository
3. Set **Root Directory** to `webapp` (if monorepo)
4. Set **Framework Preset** to Next.js

### 3. Add environment variables

In Vercel project **Settings > Environment Variables**, add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `FIRECRAWL_API_KEY` | Your Firecrawl API key |
| `CRON_SECRET` | A random secret string |
| `NEXT_PUBLIC_SITE_URL` | Your Vercel deployment URL |

### 4. Vercel Cron

The `vercel.json` file configures a cron job that runs every 2 minutes:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-runs?secret=${CRON_SECRET}",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

This automatically processes queued runs. Vercel Pro plan is recommended for the 5-minute function timeout (`maxDuration = 300`).

## How It Works

1. **User creates a run** via the form at `/` - stored as `status=queued` in Supabase
2. **User clicks "Start Run"** - sets `status=running`
3. **Worker picks up the run** (via Vercel Cron or CLI):
   - Geocodes the city center
   - For each industry, builds 6 search queries
   - Uses Firecrawl to search and scrape candidate URLs
   - Extracts business data from scraped markdown
   - Optionally follows contact/about links for more data
   - Geocodes each lead's address via Nominatim
   - Filters by radius using Haversine distance
   - Computes confidence score (0-1)
   - Deduplicates and inserts into Supabase
   - Updates progress every batch
4. **User sees real-time progress** at `/runs/[id]` (polls every 4s)
5. **User exports** CSV or Excel when done

## Confidence Scoring

| Factor | Points |
|---|---|
| Address parsed | +0.4 |
| Phone present | +0.2 |
| Website present | +0.2 |
| Within radius verified | +0.2 |
| Directory-only source | -0.2 |

Score is clamped to 0-1.

## Project Structure

```
webapp/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Create run form
│   │   ├── layout.tsx                        # App layout
│   │   ├── globals.css                       # Global styles
│   │   ├── runs/[id]/page.tsx                # Run detail + leads table
│   │   └── api/
│   │       ├── runs/route.ts                 # POST/GET runs
│   │       ├── runs/[id]/route.ts            # GET run
│   │       ├── runs/[id]/start/route.ts      # POST start run
│   │       ├── runs/[id]/leads/route.ts      # GET leads (paginated)
│   │       ├── runs/[id]/export.csv/route.ts # GET CSV export
│   │       ├── runs/[id]/export.xlsx/route.ts# GET Excel export
│   │       ├── leads/[leadId]/route.ts       # PATCH lead
│   │       └── cron/process-runs/route.ts    # GET cron worker
│   └── lib/
│       ├── supabaseAdmin.ts                  # Supabase clients
│       ├── firecrawl.ts                      # Firecrawl client
│       ├── worker.ts                         # Scraping worker logic
│       ├── extract.ts                        # Content extraction
│       ├── geocode.ts                        # Nominatim geocoding
│       ├── distance.ts                       # Haversine formula
│       ├── dedupe.ts                         # Deduplication utils
│       ├── confidence.ts                     # Confidence scoring
│       └── schemas.ts                        # Zod schemas
├── scripts/
│   └── run-worker.js                         # CLI worker script
├── supabase/
│   └── migrations/
│       └── 001_initial.sql                   # Database schema
├── vercel.json                               # Vercel cron config
├── .env.example                              # Environment template
├── next.config.ts
├── package.json
└── tsconfig.json
```
