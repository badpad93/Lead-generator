import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendOperatorDigestEmail } from "@/lib/digestEmail";

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";
const MAX_LEADS_PER_EMAIL = 10;

async function runDigest(frequency: string) {
  // 1. Get all operators who opted in to digests at this frequency
  const { data: operators, error: opErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, city, state")
    .eq("role", "operator")
    .eq("digest_opt_in", true)
    .eq("digest_frequency", frequency);

  if (opErr) {
    return { error: opErr.message, status: 500 };
  }

  if (!operators || operators.length === 0) {
    return { sent: 0, message: "No eligible operators" };
  }

  // 2. Also pull operator_listings for states_served (broader coverage)
  const operatorIds = operators.map((o) => o.id);
  const { data: listings } = await supabaseAdmin
    .from("operator_listings")
    .select("operator_id, states_served")
    .in("operator_id", operatorIds);

  // Build a map: operator_id -> set of states they serve
  const statesMap = new Map<string, Set<string>>();
  for (const op of operators) {
    const states = new Set<string>();
    if (op.state) states.add(op.state);
    statesMap.set(op.id, states);
  }
  for (const listing of listings || []) {
    const existing = statesMap.get(listing.operator_id);
    if (existing && listing.states_served) {
      for (const s of listing.states_served) existing.add(s);
    }
  }

  // 3. Get all open, public vending requests
  const { data: openLeads, error: leadErr } = await supabaseAdmin
    .from("vending_requests")
    .select("id, title, city, state, location_type, machine_types_wanted, price, urgency, estimated_daily_traffic")
    .eq("status", "open")
    .eq("is_public", true)
    .neq("city", "")
    .neq("state", "")
    .not("city", "is", null)
    .not("state", "is", null)
    .order("created_at", { ascending: false });

  if (leadErr) {
    return { error: leadErr.message, status: 500 };
  }

  if (!openLeads || openLeads.length === 0) {
    return { sent: 0, message: "No open leads" };
  }

  // 4. Get operator emails from auth
  const emailMap = new Map<string, string>();
  for (const op of operators) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(op.id);
    if (authUser?.user?.email) {
      emailMap.set(op.id, authUser.user.email);
    }
  }

  // 5. For each operator, find leads in their states that haven't been sent before
  let totalSent = 0;
  const errors: string[] = [];

  for (const op of operators) {
    const email = emailMap.get(op.id);
    if (!email) continue;

    const servedStates = statesMap.get(op.id);
    if (!servedStates || servedStates.size === 0) continue;

    const stateLeads = openLeads.filter((l) => servedStates.has(l.state));
    if (stateLeads.length === 0) continue;

    // Exclude leads already sent to this operator
    const { data: alreadySent } = await supabaseAdmin
      .from("operator_digest_log")
      .select("request_id")
      .eq("operator_id", op.id);

    const sentIds = new Set((alreadySent || []).map((r) => r.request_id));
    const newLeads = stateLeads.filter((l) => !sentIds.has(l.id));
    if (newLeads.length === 0) continue;

    const leadsToSend = newLeads.slice(0, MAX_LEADS_PER_EMAIL);

    try {
      await sendOperatorDigestEmail({
        to: email,
        operatorName: op.full_name || "Operator",
        leads: leadsToSend,
        unsubscribeUrl: `${APP_URL}/dashboard/profile?digest=off`,
      });

      // Log sent leads so they aren't repeated
      const logRows = leadsToSend.map((l) => ({
        operator_id: op.id,
        request_id: l.id,
      }));
      await supabaseAdmin.from("operator_digest_log").upsert(logRows, {
        onConflict: "operator_id,request_id",
      });

      await supabaseAdmin
        .from("profiles")
        .update({ digest_last_sent_at: new Date().toISOString() })
        .eq("id", op.id);

      totalSent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${op.id}: ${msg}`);
    }
  }

  return {
    sent: totalSent,
    operatorsChecked: operators.length,
    openLeads: openLeads.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/** GET — triggered by Vercel Cron */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const frequency = req.nextUrl.searchParams.get("frequency") || "weekly";
  const result = await runDigest(frequency);
  const status = "error" in result && result.status ? (result.status as number) : 200;
  return NextResponse.json(result, { status });
}

/** POST — triggered manually by admin */
export async function POST(req: NextRequest) {
  const { getAdminUserId } = await import("@/lib/adminAuth");
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const frequency = body.frequency || "weekly";
  const result = await runDigest(frequency);
  const status = "error" in result && result.status ? (result.status as number) : 200;
  return NextResponse.json(result, { status });
}
