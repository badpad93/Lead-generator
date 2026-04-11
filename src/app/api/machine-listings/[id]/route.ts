import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  // Strip sensitive seller information — never expose contact_email/phone
  // or the created_by user ID to the public
  const {
    contact_email: _email,
    contact_phone: _phone,
    created_by: _createdBy,
    admin_notes: _notes,
    ...publicData
  } = data;
  void _email;
  void _phone;
  void _createdBy;
  void _notes;

  return NextResponse.json(publicData);
}
