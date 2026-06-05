export interface PlaceBusiness {
  business_name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  google_maps_url: string;
}

interface PlaceResult {
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string;
  address_components?: { long_name: string; short_name: string; types: string[] }[];
}

interface TextSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
}

const BASE = "https://maps.googleapis.com/maps/api/place";

export async function searchBusinesses(opts: {
  city: string;
  state: string;
  industry: string;
  radius?: number;
  maxResults?: number;
}): Promise<PlaceBusiness[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  console.log('[DEBUG] GOOGLE_PLACES_API_KEY value:', JSON.stringify(apiKey), 'length:', apiKey?.length);
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not configured");

  const { city, state, industry, maxResults = 40 } = opts;
  const query = `${industry} in ${city}, ${state}`;

  const places: TextSearchResult[] = [];
  let nextPageToken: string | undefined;

  // Text Search returns 20 per page, up to 60 total (3 pages)
  while (places.length < maxResults) {
    const params = new URLSearchParams({ query, key: apiKey });
    if (nextPageToken) params.set("pagetoken", nextPageToken);

    const url = `${BASE}/textsearch/json?${params}`;
    console.log('[DEBUG] Places API URL:', url);

    const res = await fetch(url);
    const data = await res.json();

    console.log('[DEBUG] Places API full response:', JSON.stringify(data));

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Places API error: ${data.status} — ${data.error_message || ""}`);
    }

    for (const r of data.results || []) {
      places.push({ place_id: r.place_id, name: r.name, formatted_address: r.formatted_address });
      if (places.length >= maxResults) break;
    }

    nextPageToken = data.next_page_token;
    if (!nextPageToken) break;

    // Google requires a short delay before using next_page_token
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Fetch details for each place (phone, website)
  const businesses: PlaceBusiness[] = [];
  for (const place of places) {
    try {
      const detail = await getPlaceDetails(place.place_id, apiKey);
      if (!detail) continue;

      const phone = detail.formatted_phone_number || detail.international_phone_number || "";
      const parsed = parseAddress(detail.address_components, place.formatted_address);

      businesses.push({
        business_name: detail.name || place.name,
        phone,
        address: parsed.street,
        city: parsed.city || city,
        state: parsed.state || state,
        zip: parsed.zip,
        website: detail.website || "",
        google_maps_url: detail.url || "",
      });
    } catch {
      // Skip places that fail detail fetch
    }
  }

  // Prioritize businesses with phone numbers
  businesses.sort((a, b) => {
    if (a.phone && !b.phone) return -1;
    if (!a.phone && b.phone) return 1;
    return 0;
  });

  return businesses;
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<PlaceResult | null> {
  const fields = "name,formatted_address,formatted_phone_number,international_phone_number,website,url,address_components";
  const params = new URLSearchParams({ place_id: placeId, fields, key: apiKey });
  const res = await fetch(`${BASE}/details/json?${params}`);
  const data = await res.json();
  if (data.status !== "OK") return null;
  return data.result;
}

function parseAddress(
  components: { long_name: string; short_name: string; types: string[] }[] | undefined,
  fallback: string
): { street: string; city: string; state: string; zip: string } {
  if (!components) {
    const parts = fallback.split(",").map((s) => s.trim());
    return { street: parts[0] || "", city: parts[1] || "", state: parts[2]?.split(" ")[0] || "", zip: parts[2]?.split(" ")[1] || "" };
  }

  let street = "";
  let city = "";
  let state = "";
  let zip = "";

  for (const c of components) {
    if (c.types.includes("street_number")) street = c.long_name;
    else if (c.types.includes("route")) street = street ? `${street} ${c.long_name}` : c.long_name;
    else if (c.types.includes("locality")) city = c.long_name;
    else if (c.types.includes("administrative_area_level_1")) state = c.short_name;
    else if (c.types.includes("postal_code")) zip = c.long_name;
  }

  return { street, city, state, zip };
}
