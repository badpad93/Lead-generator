import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import {
  calculateLocationPrice,
  TIER_PRICES,
  TEN_TEN_TEN_PRICE,
  coerceTier,
  type BusinessHours,
  type MachinesRequested,
  type LocationTier,
} from "@/lib/pricing/locationPricing";

/**
 * Sourced locations for a location_services sales order.
 *
 * GET  → list all rows attached to the order (any status)
 * POST → attach an existing sales_leads row (entity_type='location').
 *        Manual "type it in" attach is intentionally not supported —
 *        pricing is derived from the lead's linked locations row
 *        (employee_count / traffic_count / business_hours /
 *        machines_requested), and a rep-entered location has no
 *        pricing inputs. Reps who need to attach a location that
 *        isn't a lead yet must create the lead in the CRM first —
 *        that puts the placement through the pricing engine end-to-end.
 *
 * Pricing snapshot happens at ATTACH time, not at secure time, so
 * the panel can show tier + expected price the moment a location is
 * added to the order. Secure just flips status.
 */

interface AttachBody {
  lead_id?: string;
}

const VALID_HOURS: BusinessHours[] = ["low", "medium", "high", "24/7"];

function labelForTier(t: LocationTier): string {
  return t === 1 ? "Basic" : t === 2 ? "Premium" : "Elite";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("sales_order_locations")
    .select("*")
    .eq("order_id", id)
    .order("attached_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json()) as AttachBody;

  if (!body.lead_id) {
    return NextResponse.json(
      { error: "lead_id is required — create the location as a lead first so pricing inputs flow through" },
      { status: 400 },
    );
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_type, order_status, is_ten_ten_ten")
    .eq("id", id)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.order_type !== "location_services") {
    return NextResponse.json(
      { error: "Only location_services orders can source locations" },
      { status: 400 },
    );
  }

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("sales_leads")
    .select(
      "id, entity_type, business_name, contact_name, email, phone, address, city, state, zip_code, machine_count, machine_type",
    )
    .eq("id", body.lead_id)
    .maybeSingle();
  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.entity_type && lead.entity_type !== "location") {
    return NextResponse.json(
      { error: `Lead entity_type='${lead.entity_type}' — only location leads can be attached` },
      { status: 400 },
    );
  }

  // Fetch the paired locations row — that's where pricing inputs +
  // (optionally) a pre-computed pricing_score/tier/price live. Lead
  // creation (/api/sales/leads POST) inserts this alongside the
  // sales_leads row via locations.sales_lead_id.
  const { data: location, error: locErr } = await supabaseAdmin
    .from("locations")
    .select(
      "id, employee_count, traffic_count, business_hours, machines_requested, pricing_score, pricing_tier, pricing_price",
    )
    .eq("sales_lead_id", lead.id)
    .maybeSingle();
  if (locErr) {
    return NextResponse.json({ error: locErr.message }, { status: 500 });
  }
  if (!location) {
    return NextResponse.json(
      {
        error:
          "This lead has no location pricing inputs. Open the lead in the CRM and fill in Employee Count, Foot Traffic, Business Hours, and Machines Requested, then try attaching again.",
      },
      { status: 400 },
    );
  }

  const isTenTenTen = order.is_ten_ten_ten === true;

  // Resolve tier + price.
  //   - 10/10/10 order → flat $400, no tier scoring.
  //   - Location has a stored pricing_score → use the pre-computed
  //     tier/price (coerced to the current 3-tier ladder).
  //   - Otherwise compute inline from the inputs. Fail if the inputs
  //     aren't all present — we won't guess for the rep.
  let tier: LocationTier;
  let tierLabel: string;
  let securedPrice: number;

  if (isTenTenTen) {
    tier = 1;
    tierLabel = "10/10/10 Prepaid";
    securedPrice = TEN_TEN_TEN_PRICE;
  } else if (location.pricing_score !== null && location.pricing_score !== undefined) {
    tier = coerceTier(location.pricing_tier ?? null);
    tierLabel = labelForTier(tier);
    securedPrice = Number(location.pricing_price) || TIER_PRICES[tier];
  } else {
    if (
      location.employee_count === null ||
      location.traffic_count === null ||
      !location.business_hours ||
      location.machines_requested === null
    ) {
      return NextResponse.json(
        {
          error:
            "Lead's location is missing pricing inputs (employee_count / traffic_count / business_hours / machines_requested). Fill these on the lead first.",
        },
        { status: 400 },
      );
    }
    const bh = VALID_HOURS.includes(location.business_hours as BusinessHours)
      ? (location.business_hours as BusinessHours)
      : "low";
    const machinesReq = Math.max(1, Math.min(4, Number(location.machines_requested))) as MachinesRequested;
    let result;
    try {
      result = calculateLocationPrice({
        employees: Number(location.employee_count) || 0,
        foot_traffic: Number(location.traffic_count) || 0,
        business_hours: bh,
        machines_requested: machinesReq,
        is_ten_ten_ten: false,
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Pricing calculation failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 },
      );
    }
    tier = result.tier;
    tierLabel = result.tier_label;
    securedPrice = result.price;

    // Persist the freshly computed pricing back onto the locations
    // row so subsequent attaches / views see the same snapshot
    // instead of recomputing (and so admin dashboards read it too).
    await supabaseAdmin
      .from("locations")
      .update({
        pricing_score: result.total_score,
        pricing_tier: result.tier,
        pricing_price: result.price,
        pricing_calculated_at: new Date().toISOString(),
      })
      .eq("id", location.id);
  }

  const nowIso = new Date().toISOString();
  const row = {
    order_id: id,
    lead_id: lead.id,
    business_name: lead.business_name,
    contact_name: lead.contact_name,
    contact_email: lead.email,
    contact_phone: lead.phone,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip_code,
    machine_count: lead.machine_count ?? 1,
    machine_type: lead.machine_type,
    // Pricing snapshot stamped at attach — locks the tier the moment
    // the rep sources this location. Secure just flips status; it
    // doesn't renegotiate.
    tier,
    tier_label: tierLabel,
    secured_price: securedPrice,
    attached_by: user.id,
    attached_at: nowIso,
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("sales_order_locations")
    .insert(row)
    .select("*")
    .single();
  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "That lead is already attached to this order" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "location_attached",
    description: `Sourced location attached: ${inserted.business_name}${inserted.address ? ` (${inserted.address})` : ""} — ${tierLabel} @ $${securedPrice.toFixed(2)}`,
  });

  return NextResponse.json({ location: inserted });
}
