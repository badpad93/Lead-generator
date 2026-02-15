import Firecrawl from "@mendable/firecrawl-js";

let _client: Firecrawl | null = null;

export function getFirecrawl(): Firecrawl {
  if (!_client) {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
    _client = new Firecrawl({ apiKey: key });
  }
  return _client;
}
