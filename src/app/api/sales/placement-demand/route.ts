import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * Summary payload for the "Placement Demand" section on the Sales
 * executive snapshot page. Answers: how many locations are still
 * needed across all open contracts, which regions are hottest, and
 * how many payouts are queued up. Non-scope-aware — company-wide
 * counts only. Restricted to CRM roles.
 */

const CRM_ROLES = new Set([
  "admin",
  "director_of_sales",
  "market_leader",
  "sales",
  "office_manager",
]);

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!CRM_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: contracts } = await supabaseAdmin
    .from("placement_contracts")
    .select("id, status, market_state, locations_needed, locations_filled, tier, created_at")
    .in("status", ["open", "in_progress", "fulfilled"])
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = contracts ?? [];

  let openCount = 0;
  let inProgressCount = 0;
  let fulfilledCount = 0;
  let openLocationsRemaining = 0;
  const regionDemand = new Map<string, { open: number; in_progress: number; locations: number }>();

  for (const c of rows) {
    if (c.status === "open") {
      openCount += 1;
      openLocationsRemaining += Math.max(0, Number(c.locations_needed ?? 0) - Number(c.locations_filled ?? 0));
    } else if (c.status === "in_progress") {
      inProgressCount += 1;
      openLocationsRemaining += Math.max(0, Number(c.locations_needed ?? 0) - Number(c.locations_filled ?? 0));
    } else if (c.status === "fulfilled") {
      fulfilledCount += 1;
    }
    const region = c.market_state || "Unknown";
    const bucket = regionDemand.get(region) ?? { open: 0, in_progress: 0, locations: 0 };
    if (c.status === "open") bucket.open += 1;
    if (c.status === "in_progress") bucket.in_progress += 1;
    if (c.status !== "fulfilled") {
      bucket.locations += Math.max(0, Number(c.locations_needed ?? 0) - Number(c.locations_filled ?? 0));
    }
    regionDemand.set(region, bucket);
  }

  const regions = Array.from(regionDemand.entries())
    .map(([state, v]) => ({ state, ...v }))
    .sort((a, b) => b.locations - a.locations)
    .slice(0, 6);

  // Payout status snapshot — how much is stuck vs already released.
  const { data: payouts } = await supabaseAdmin
    .from("marketplace_payouts")
    .select("status, amount")
    .in("status", ["awaiting_collection", "queued", "sent_to_qb", "paid"])
    .limit(2000);

  const payoutSummary = {
    awaiting_collection: { count: 0, dollars: 0 },
    queued: { count: 0, dollars: 0 },
    sent_to_qb: { count: 0, dollars: 0 },
    paid: { count: 0, dollars: 0 },
  };
  for (const p of payouts ?? []) {
    const amt = Number(p.amount ?? 0);
    if (p.status === "awaiting_collection") { payoutSummary.awaiting_collection.count++; payoutSummary.awaiting_collection.dollars += amt; }
    else if (p.status === "queued") { payoutSummary.queued.count++; payoutSummary.queued.dollars += amt; }
    else if (p.status === "sent_to_qb") { payoutSummary.sent_to_qb.count++; payoutSummary.sent_to_qb.dollars += amt; }
    else if (p.status === "paid") { payoutSummary.paid.count++; payoutSummary.paid.dollars += amt; }
  }

  return NextResponse.json({
    contracts: {
      open: openCount,
      in_progress: inProgressCount,
      fulfilled: fulfilledCount,
      open_locations_remaining: openLocationsRemaining,
    },
    regions,
    payouts: payoutSummary,
  });
}
