/**
 * Lead scraping worker – adapted for Apify actor runtime.
 * Processes one run: searches via Firecrawl, extracts leads,
 * geocodes, computes distance & confidence, dedupes, stores in Supabase.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getFirecrawl } from "./firecrawl.js";
import { extractLeads, findFollowLinks } from "./extract.js";
import { geocode, geocodeCity } from "./geocode.js";
import { haversineDistance } from "./distance.js";
import { computeConfidence } from "./confidence.js";
import { dedupeKey } from "./dedupe.js";

interface RunRow {
  id: string;
  city: string;
  state: string;
  radius_miles: number;
  max_leads: number;
  industries: string[];
  status: string;
}

/** Industry -> Firecrawl search queries */
function buildSearchQueries(
  industry: string,
  city: string,
  state: string
): string[] {
  const loc = `${city}, ${state}`;
  const base = industry.toLowerCase();
  return [
    `${base} in ${loc}`,
    `${base} companies ${loc}`,
    `${base} businesses near ${loc}`,
    `best ${base} ${loc}`,
    `${base} services ${loc} directory`,
    `top ${base} ${loc} list`,
  ];
}

async function updateProgress(
  supabase: SupabaseClient,
  runId: string,
  total: number,
  message: string
): Promise<void> {
  await supabase
    .from("runs")
    .update({ progress: { total, message } })
    .eq("id", runId);
}

async function setRunStatus(
  supabase: SupabaseClient,
  runId: string,
  status: "done" | "failed",
  message: string
): Promise<void> {
  const { count } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("run_id", runId);

  await supabase
    .from("runs")
    .update({
      status,
      progress: { total: count ?? 0, message },
    })
    .eq("id", runId);
}

/** Insert a batch of leads, handling dedupe conflicts gracefully. */
async function insertLeads(
  supabase: SupabaseClient,
  runId: string,
  leads: Array<{
    industry: string;
    business_name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    website: string;
    source_url: string;
    distance_miles: number | null;
    confidence: number;
    notes: string;
  }>
): Promise<number> {
  if (leads.length === 0) return 0;

  let inserted = 0;
  for (const lead of leads) {
    const { error } = await supabase.from("leads").insert({
      run_id: runId,
      ...lead,
    });
    if (!error) {
      inserted++;
    }
    // Silently skip duplicates (unique constraint violation)
  }
  return inserted;
}

/** Process a single run end-to-end. */
export async function processRun(
  supabase: SupabaseClient,
  run: RunRow
): Promise<void> {
  const fc = getFirecrawl();
  const seenKeys = new Set<string>();
  let totalInserted = 0;

  console.log(
    `[worker] Processing run ${run.id}: ${run.city}, ${run.state} – ${run.industries.length} industries, max ${run.max_leads}`
  );

  // Geocode city center
  const cityCenter = await geocodeCity(run.city, run.state);
  if (!cityCenter) {
    await setRunStatus(supabase, run.id, "failed", "Could not geocode city center");
    return;
  }

  await updateProgress(supabase, run.id, 0, "Geocoded city center, starting search…");

  for (const industry of run.industries) {
    if (totalInserted >= run.max_leads) break;

    const queries = buildSearchQueries(industry, run.city, run.state);

    for (const query of queries) {
      if (totalInserted >= run.max_leads) break;

      await updateProgress(
        supabase,
        run.id,
        totalInserted,
        `Searching: "${query}"…`
      );

      try {
        const searchResult = await fc.search(query, { limit: 10 });
        const webResults = searchResult.web ?? [];

        if (webResults.length === 0) {
          console.log(`[worker] Search returned no results for: ${query}`);
          continue;
        }

        for (const result of webResults) {
          if (totalInserted >= run.max_leads) break;

          const r = result as unknown as Record<string, unknown>;
          const resultUrl =
            typeof r.url === "string"
              ? r.url
              : ((result as unknown as { metadata?: { sourceURL?: string } }).metadata?.sourceURL ?? "");
          if (!resultUrl) continue;

          try {
            const scrapeResult = await fc.scrape(resultUrl, {
              formats: ["markdown"],
            });

            if (!scrapeResult.markdown) continue;

            const rawLeads = extractLeads(
              scrapeResult.markdown,
              resultUrl,
              run.city,
              run.state
            );

            // Optionally follow contact/about links
            const followUrls = findFollowLinks(
              scrapeResult.markdown,
              resultUrl
            );
            let extraMarkdown = "";
            for (const fUrl of followUrls.slice(0, 2)) {
              try {
                const followResult = await fc.scrape(fUrl, {
                  formats: ["markdown"],
                });
                if (followResult.markdown) {
                  extraMarkdown += "\n" + followResult.markdown;
                }
              } catch {
                // skip follow errors
              }
            }

            if (extraMarkdown) {
              const extraLeads = extractLeads(
                extraMarkdown,
                resultUrl,
                run.city,
                run.state
              );
              rawLeads.push(...extraLeads);
            }

            // Process each extracted lead
            const batch: Array<{
              industry: string;
              business_name: string;
              address: string;
              city: string;
              state: string;
              zip: string;
              phone: string;
              website: string;
              source_url: string;
              distance_miles: number | null;
              confidence: number;
              notes: string;
            }> = [];

            for (const raw of rawLeads) {
              if (totalInserted + batch.length >= run.max_leads) break;

              // In-memory dedupe
              const dk = dedupeKey({
                business_name: raw.business_name,
                website: raw.website,
                phone: raw.phone,
                zip: raw.zip,
              });
              if (seenKeys.has(dk)) continue;
              seenKeys.add(dk);

              if (raw.business_name.length < 3) continue;

              // Geocode
              let distanceMiles: number | null = null;
              let withinRadius = false;
              let notes = "";

              if (raw.address || raw.city) {
                const geo = await geocode(raw.address, raw.city, raw.state);
                if (geo) {
                  distanceMiles = Math.round(
                    haversineDistance(
                      cityCenter.lat,
                      cityCenter.lng,
                      geo.lat,
                      geo.lng
                    ) * 10
                  ) / 10;
                  withinRadius = distanceMiles <= run.radius_miles;
                } else {
                  notes = "geocode_failed";
                  if (
                    raw.city.toLowerCase() !== run.city.toLowerCase() &&
                    raw.state.toUpperCase() !== run.state.toUpperCase()
                  ) {
                    continue;
                  }
                }
              }

              if (distanceMiles !== null && !withinRadius) continue;

              const confidence = computeConfidence({
                addressParsed: !!raw.address,
                phonePresent: !!raw.phone,
                websitePresent: !!raw.website,
                withinRadius,
                directoryOnly: raw.is_directory,
              });

              batch.push({
                industry,
                business_name: raw.business_name,
                address: raw.address,
                city: raw.city,
                state: raw.state,
                zip: raw.zip,
                phone: raw.phone,
                website: raw.website,
                source_url: raw.source_url,
                distance_miles: distanceMiles,
                confidence,
                notes,
              });
            }

            const inserted = await insertLeads(supabase, run.id, batch);
            totalInserted += inserted;

            if (inserted > 0) {
              await updateProgress(
                supabase,
                run.id,
                totalInserted,
                `Inserted ${totalInserted} leads (processing ${industry})…`
              );
            }
          } catch (e) {
            console.log(
              `[worker] Scrape error for ${resultUrl}: ${e instanceof Error ? e.message : e}`
            );
          }
        }
      } catch (e) {
        console.log(
          `[worker] Search error for "${query}": ${e instanceof Error ? e.message : e}`
        );
      }
    }
  }

  await setRunStatus(
    supabase,
    run.id,
    "done",
    `Completed – ${totalInserted} leads collected`
  );
  console.log(`[worker] Run ${run.id} completed with ${totalInserted} leads`);
}
