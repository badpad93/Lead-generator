import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pickPublicMachineListing } from "@/lib/machineListings/publicShape";

/** GET /api/machine-listings/[id] — fetch a single machine listing by ID */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing listing ID" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("machine_listings")
    .select("*, profiles!created_by(id, full_name, company_name, verified)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Hydrate the manufacturer display name for listings that came from
  // the marketplace-partner flow. Prefer DBA over legal name where
  // supplied; fall back to legal name; skip entirely if the seller
  // isn't a marketplace-partner listing. The join is deliberately
  // narrow — never SELECT * from manufacturer_partners here or
  // wholesale_price_cents on the listing would still be safe (the
  // sanitizer strips it) but the query fan-out would grow.
  const withMfr = data as Record<string, unknown>;
  const manufacturerPartnerId = withMfr.manufacturer_partner_id as string | null;
  if (manufacturerPartnerId) {
    const { data: mfr } = await supabaseAdmin
      .from("manufacturer_partners")
      .select("legal_company_name, dba_or_brand")
      .eq("id", manufacturerPartnerId)
      .maybeSingle();
    if (mfr) {
      withMfr.manufacturer_display_name =
        (mfr.dba_or_brand as string | null)?.trim() ||
        (mfr.legal_company_name as string | null)?.trim() ||
        null;
    }
  }

  // Allowlist sanitizer — see src/lib/machineListings/publicShape.ts.
  // Never exposes wholesale_price_cents, admin_notes, contact_*,
  // created_by, or any future admin field.
  return NextResponse.json(pickPublicMachineListing(withMfr));
}
