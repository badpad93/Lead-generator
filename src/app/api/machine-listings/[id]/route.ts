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

  // Allowlist sanitizer — see src/lib/machineListings/publicShape.ts.
  // Never exposes wholesale_price_cents, admin_notes, contact_*,
  // created_by, or any future admin field.
  return NextResponse.json(pickPublicMachineListing(data));
}
