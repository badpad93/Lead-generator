/** Geocode an address using OpenStreetMap Nominatim. Rate-limit: 1 req/sec. */

let lastCall = 0;

interface GeoResult {
  lat: number;
  lng: number;
}

const memoryCache = new Map<string, GeoResult | null>();

function normalizeKey(address: string, city: string, state: string): string {
  return `${address}|${city}|${state}`.toLowerCase().trim();
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastCall = Date.now();
}

export async function geocode(
  address: string,
  city: string,
  state: string
): Promise<GeoResult | null> {
  const key = normalizeKey(address, city, state);
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;

  const query = [address, city, state].filter(Boolean).join(", ");
  if (!query) return null;

  await throttle();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "LeadGeneratorApp/1.0" },
    });

    if (!res.ok) {
      memoryCache.set(key, null);
      return null;
    }

    const data = await res.json();
    if (!data || data.length === 0) {
      memoryCache.set(key, null);
      return null;
    }

    const result: GeoResult = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
    memoryCache.set(key, result);
    return result;
  } catch {
    memoryCache.set(key, null);
    return null;
  }
}

/** Geocode just a city/state to get center coordinates. */
export async function geocodeCity(
  city: string,
  state: string
): Promise<GeoResult | null> {
  return geocode("", city, state);
}
