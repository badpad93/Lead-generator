import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { validateListingPricing } from "@/lib/manufacturerOnboarding/equipmentValidation";

/**
 * GET  /api/manufacturer/me/equipment
 *   Returns machine_listings scoped to the caller's manufacturer_partner_id.
 *
 * POST /api/manufacturer/me/equipment
 *   Creates a new machine_listings row owned by the caller.
 *   Starts in status='draft'. Enforces final_vc_price >= wholesale_price
 *   and rejects margin > $300 without an approved pricing exception.
 */

const ALLOWED_TEMP_ZONES = new Set(["ambient", "refrigerated", "frozen", "combo"]);

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("machine_listings")
    .select("*")
    .eq("manufacturer_partner_id", userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipment: (data ?? []).map(scrubForPartner) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Prove the caller actually has a manufacturer_partners row before
  // letting them add equipment. Belt + suspenders — the FK on
  // manufacturer_partner_id would ultimately reject it, but returning
  // a clean error is friendlier.
  const { data: partner } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();
  if (!partner) {
    return NextResponse.json({ error: "Complete your manufacturer application first." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeEquipmentPayload(body);

  const pricingCheck = await validateListingPricing({
    listing_id: null,
    wholesale_price_cents: normalized.wholesale_price_cents,
    final_price_cents: normalized.final_price_cents,
  });
  if (!pricingCheck.ok) {
    return NextResponse.json(
      { error: pricingCheck.reason, code: pricingCheck.code },
      { status: 400 },
    );
  }

  const finalPriceDollars =
    normalized.final_price_cents != null ? normalized.final_price_cents / 100 : null;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("machine_listings")
    .insert({
      created_by: userId,
      manufacturer_partner_id: userId,
      title: normalized.title,
      description: normalized.description,
      machine_make: normalized.machine_make,
      machine_model: normalized.machine_model,
      machine_year: normalized.machine_year,
      machine_type: normalized.machine_type,
      condition: normalized.condition ?? "new",
      quantity: normalized.quantity ?? 1,
      sku: normalized.sku,
      wholesale_price_cents: normalized.wholesale_price_cents,
      buy_now_enabled: finalPriceDollars != null,
      buy_now_price: finalPriceDollars,
      asking_price: finalPriceDollars,
      msrp_cents: normalized.msrp_cents,
      lead_time_days: normalized.lead_time_days,
      manufacturer_shipping_notes: normalized.manufacturer_shipping_notes,
      listing_warranty_summary: normalized.listing_warranty_summary,
      spec_sheet_url: normalized.spec_sheet_url,
      brochure_url: normalized.brochure_url,
      video_url: normalized.video_url,
      dimensions_text: normalized.dimensions_text,
      weight_lbs: normalized.weight_lbs,
      electrical_requirements: normalized.electrical_requirements,
      temperature_zone: normalized.temperature_zone,
      payment_system_compatibility: normalized.payment_system_compatibility,
      software_compatibility: normalized.software_compatibility,
      certifications: normalized.certifications,
      status: "draft",
      // city/state on the listing — pull from the partner's shipping origin
      // so the record has SOMETHING to satisfy the public list's
      // "exclude blank city/state" filter after admin approves.
      city: normalized.city,
      state: normalized.state,
    })
    .select("*")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ equipment: scrubForPartner(inserted) });
}

// Manufacturer-visible fields. The partner sees everything on the
// row (they own it) EXCEPT admin_notes and any legacy contact fields
// left over from user-posted listings.
function scrubForPartner(row: Record<string, unknown>) {
  const { admin_notes: _adminNotes, contact_email: _e, contact_phone: _p, ...rest } = row;
  void _adminNotes; void _e; void _p;
  return rest;
}

interface NormalizedEquipment {
  title: string;
  description: string | null;
  machine_make: string | null;
  machine_model: string | null;
  machine_year: number | null;
  machine_type: string | null;
  condition: string | null;
  quantity: number;
  sku: string | null;
  wholesale_price_cents: number | null;
  final_price_cents: number | null;
  msrp_cents: number | null;
  lead_time_days: number | null;
  manufacturer_shipping_notes: string | null;
  listing_warranty_summary: string | null;
  spec_sheet_url: string | null;
  brochure_url: string | null;
  video_url: string | null;
  dimensions_text: string | null;
  weight_lbs: number | null;
  electrical_requirements: string | null;
  temperature_zone: string | null;
  payment_system_compatibility: string | null;
  software_compatibility: string | null;
  certifications: string | null;
  city: string | null;
  state: string | null;
}

export function normalizeEquipmentPayload(body: Record<string, unknown>): NormalizedEquipment {
  const str = (k: string): string | null => {
    const v = body[k];
    return typeof v === "string" ? (v.trim() || null) : null;
  };
  const num = (k: string, min = 0): number | null => {
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < min) return null;
    return v;
  };
  const int = (k: string, min = 0): number | null => {
    const v = num(k, min);
    return v != null ? Math.floor(v) : null;
  };
  const dollarsToCents = (k: string): number | null => {
    const v = num(k, 0);
    return v != null ? Math.round(v * 100) : null;
  };

  const rawTemp = str("temperature_zone");
  const tempZone = rawTemp && ALLOWED_TEMP_ZONES.has(rawTemp) ? rawTemp : null;

  return {
    title: str("title") ?? "",
    description: str("description"),
    machine_make: str("machine_make"),
    machine_model: str("machine_model"),
    machine_year: int("machine_year", 1900),
    machine_type: str("machine_type"),
    condition: str("condition"),
    quantity: int("quantity", 1) ?? 1,
    sku: str("sku"),
    wholesale_price_cents: dollarsToCents("wholesale_price_dollars"),
    final_price_cents: dollarsToCents("final_price_dollars"),
    msrp_cents: dollarsToCents("msrp_dollars"),
    lead_time_days: int("lead_time_days"),
    manufacturer_shipping_notes: str("manufacturer_shipping_notes"),
    listing_warranty_summary: str("listing_warranty_summary"),
    spec_sheet_url: str("spec_sheet_url"),
    brochure_url: str("brochure_url"),
    video_url: str("video_url"),
    dimensions_text: str("dimensions_text"),
    weight_lbs: num("weight_lbs"),
    electrical_requirements: str("electrical_requirements"),
    temperature_zone: tempZone,
    payment_system_compatibility: str("payment_system_compatibility"),
    software_compatibility: str("software_compatibility"),
    certifications: str("certifications"),
    city: str("city"),
    state: str("state"),
  };
}
