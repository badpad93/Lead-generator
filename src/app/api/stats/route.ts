import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/stats — public platform stats for the homepage */
export async function GET() {
  try {
    const [requestsResult, operatorsResult, matchesResult] = await Promise.all([
      supabaseAdmin
        .from("vending_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "operator"),
      supabaseAdmin
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("status", "installed"),
    ]);

    const activeRequests = requestsResult.count || 0;
    const operators = operatorsResult.count || 0;
    const placements = matchesResult.count || 0;

    return NextResponse.json({
      activeRequests,
      operators,
      placements,
    });
  } catch {
    return NextResponse.json({
      activeRequests: 0,
      operators: 0,
      placements: 0,
    });
  }
}
