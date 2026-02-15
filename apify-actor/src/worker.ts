/**
 * Lead scraping worker – uses Google Maps Places via Apify.
 *
 * Processes one run: searches Google Maps for each industry,
 * maps structured place data to leads, computes distance & confidence,
 * dedupes, and stores results in Supabase.
 *
 * This replaces the old Firecrawl search → scrape → regex extraction pipeline.
 * Google Maps returns structured fields (name, address, phone, website, coords)
 * so there's no markdown parsing or geocoding per lead.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  searchGoogleMaps,
  toStateAbbreviation,
  PlaceResult,
} from "./google-maps.js";
import { geocodeCity } from "./geocode.js";
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

/* ------------------------------------------------------------------ */
/*  Supabase helpers                                                   */
/* ------------------------------------------------------------------ */

async function updateProgress(
  supabase: SupabaseClient,
  runId: string,
  total: number,
  message: string
): Promise<void> {
  // Preserve existing fields in progress (like apify_run_id) so stop can abort
  const { data } = await supabase
    .from("runs")
    .select("progress")
    .eq("id", runId)
    .single();

  const existing = (data?.progress as Record<string, unknown>) ?? {};
  await supabase
    .from("runs")
    .update({ progress: { ...existing, total, message } })
    .eq("id", runId);
}

/** Check if the run has been stopped by the user. */
async function isRunStopped(
  supabase: SupabaseClient,
  runId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("runs")
    .select("status")
    .eq("id", runId)
    .single();
  return data?.status === "failed" || data?.status === "done";
}

async function setRunStatus(
  supabase: SupabaseClient,
  runId: string,
  status: "done" | "failed",
  message: string
): Promise<void> {
  // Don't overwrite if user already stopped the run
  if (await isRunStopped(supabase, runId)) {
    console.log(`[worker] Run ${runId} already stopped, skipping status update`);
    return;
  }

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
  leads: LeadRow[]
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

/* ------------------------------------------------------------------ */
/*  Place → Lead mapping                                               */
/* ------------------------------------------------------------------ */

interface LeadRow {
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
}

/** Convert a Google Maps place result to our lead format. */
function placeToLead(
  place: PlaceResult,
  industry: string,
  cityCenter: { lat: number; lng: number },
  radiusMiles: number,
  targetCity: string,
  targetState: string
): LeadRow | null {
  const name = (place.title ?? "").trim();
  if (name.length < 3) return null;

  // Address components
  const street = place.street ?? place.address ?? "";
  const city = place.city ?? targetCity;
  const state = toStateAbbreviation(place.state ?? targetState);
  const zip = place.postalCode ?? "";

  // Distance from city center using Google Maps coordinates (no geocoding needed)
  let distanceMiles: number | null = null;
  let withinRadius = false;

  if (place.location?.lat && place.location?.lng) {
    distanceMiles =
      Math.round(
        haversineDistance(
          cityCenter.lat,
          cityCenter.lng,
          place.location.lat,
          place.location.lng
        ) * 10
      ) / 10;
    withinRadius = distanceMiles <= radiusMiles;
  }

  // Skip if known to be outside the search radius
  if (distanceMiles !== null && !withinRadius) return null;

  const phone = place.phone ?? "";
  const website = place.website ?? "";
  const sourceUrl = place.url ?? "";

  const confidence = computeConfidence({
    addressParsed: !!street,
    phonePresent: !!phone,
    websitePresent: !!website,
    withinRadius,
    directoryOnly: false, // Google Maps data is always direct
  });

  return {
    industry,
    business_name: name.substring(0, 255),
    address: street,
    city,
    state,
    zip,
    phone,
    website,
    source_url: sourceUrl,
    distance_miles: distanceMiles,
    confidence,
    notes: "",
  };
}

/* ------------------------------------------------------------------ */
/*  Main processing loop                                               */
/* ------------------------------------------------------------------ */

/** Process a single run end-to-end. */
export async function processRun(
  supabase: SupabaseClient,
  run: RunRow
): Promise<void> {
  const seenKeys = new Set<string>();
  let totalInserted = 0;

  console.log(
    `[worker] Processing run ${run.id}: ${run.city}, ${run.state} – ` +
      `${run.industries.length} industries, max ${run.max_leads}`
  );

  // Geocode city center for distance calculation
  const cityCenter = await geocodeCity(run.city, run.state);
  if (!cityCenter) {
    await setRunStatus(
      supabase,
      run.id,
      "failed",
      "Could not geocode city center"
    );
    return;
  }

  await updateProgress(
    supabase,
    run.id,
    0,
    "Geocoded city center, starting Google Maps search…"
  );

  for (const industry of run.industries) {
    if (totalInserted >= run.max_leads) break;

    // Check if user stopped the run
    if (await isRunStopped(supabase, run.id)) {
      console.log(`[worker] Run ${run.id} was stopped by user, exiting`);
      return;
    }

    // Divide remaining quota roughly among remaining industries
    const industryIdx = run.industries.indexOf(industry);
    const remaining = run.max_leads - totalInserted;
    const industriesLeft = run.industries.length - industryIdx;
    const maxPerIndustry = Math.min(
      Math.ceil(remaining / industriesLeft),
      200
    );

    const searchQuery = `${industry} in ${run.city}, ${run.state}`;

    await updateProgress(
      supabase,
      run.id,
      totalInserted,
      `Searching Google Maps: "${searchQuery}"…`
    );

    try {
      const places = await searchGoogleMaps([searchQuery], maxPerIndustry);

      console.log(
        `[worker] Google Maps returned ${places.length} results for "${searchQuery}"`
      );

      await updateProgress(
        supabase,
        run.id,
        totalInserted,
        `Processing ${places.length} results for ${industry}…`
      );

      // Convert places to leads
      const batch: LeadRow[] = [];

      for (const place of places) {
        if (totalInserted + batch.length >= run.max_leads) break;

        const lead = placeToLead(
          place,
          industry,
          cityCenter,
          run.radius_miles,
          run.city,
          run.state
        );
        if (!lead) continue;

        // In-memory dedupe
        const dk = dedupeKey({
          business_name: lead.business_name,
          website: lead.website,
          phone: lead.phone,
          zip: lead.zip,
        });
        if (seenKeys.has(dk)) continue;
        seenKeys.add(dk);

        batch.push(lead);
      }

      const inserted = await insertLeads(supabase, run.id, batch);
      totalInserted += inserted;

      console.log(
        `[worker] Inserted ${inserted} leads for ${industry} (${totalInserted} total)`
      );

      await updateProgress(
        supabase,
        run.id,
        totalInserted,
        `${industry}: ${inserted} leads added (${totalInserted} total)…`
      );
    } catch (e) {
      console.log(
        `[worker] Error searching ${industry}: ${
          e instanceof Error ? e.message : e
        }`
      );
      await updateProgress(
        supabase,
        run.id,
        totalInserted,
        `Error searching ${industry}, continuing…`
      );
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
