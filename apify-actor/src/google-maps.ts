/**
 * Google Maps Places scraper integration via Apify.
 * Calls the compass/crawler-google-places actor to get structured business data,
 * replacing the old Firecrawl search + scrape + regex pipeline.
 */

import { ApifyClient } from "apify-client";

/** Shape of a single place result from the Google Maps scraper. */
export interface PlaceResult {
  title: string;
  address: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  phone: string;
  phoneUnformatted: string;
  website: string;
  url: string;
  location: { lat: number; lng: number } | null;
  totalScore: number | null;
  reviewsCount: number | null;
  categoryName: string;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
}

const GOOGLE_MAPS_ACTOR_ID = "compass/crawler-google-places";

/**
 * Search Google Maps for businesses matching the given queries.
 * Runs the Google Maps scraper actor and waits for results.
 */
export async function searchGoogleMaps(
  searchQueries: string[],
  maxResultsPerQuery: number
): Promise<PlaceResult[]> {
  // Inside Apify runtime APIFY_TOKEN is set automatically;
  // fall back to APIFY_API_TOKEN for local dev.
  const token = process.env.APIFY_TOKEN ?? process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN / APIFY_API_TOKEN is not set");

  const client = new ApifyClient({ token });

  console.log(
    `[google-maps] Starting scraper: ${searchQueries.length} queries, max ${maxResultsPerQuery} results each`
  );

  const run = await client.actor(GOOGLE_MAPS_ACTOR_ID).call(
    {
      searchStringsArray: searchQueries,
      maxCrawledPlacesPerSearch: maxResultsPerQuery,
      language: "en",
      countryCode: "us",
    },
    { waitSecs: 900 } // wait up to 15 min
  );

  console.log(
    `[google-maps] Actor run ${run.id} finished – status: ${run.status}`
  );

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Google Maps scraper ended with status: ${run.status}`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  console.log(`[google-maps] Retrieved ${items.length} places`);

  // Filter out permanently closed businesses and entries without a title
  return (items as unknown as PlaceResult[]).filter(
    (p) => p.title && !p.permanentlyClosed
  );
}

/* ------------------------------------------------------------------ */
/*  State-name → 2-letter abbreviation mapping                        */
/* ------------------------------------------------------------------ */

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

/** Convert a full state name or abbreviation to a 2-letter code. */
export function toStateAbbreviation(state: string): string {
  if (!state) return "";
  const trimmed = state.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  return STATE_ABBREVIATIONS[trimmed.toLowerCase()] ?? trimmed.toUpperCase().slice(0, 2);
}
