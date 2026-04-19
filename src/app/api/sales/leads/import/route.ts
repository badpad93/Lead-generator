import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const VALID_ENTITY_TYPES = ["operator", "location", "machine_sales", "vending_maintenance"];
const VALID_IMMEDIATE_NEEDS = ["location", "machine", "digital", "llc_compliance", "coffee", "financing", "total_operator_package"];

interface ImportRow {
  business_name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  source?: string;
  notes?: string;
  do_not_call?: boolean;
  entity_type?: string;
  immediate_need?: string;
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { leads } = body as { leads: ImportRow[] };

  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "No leads provided" }, { status: 400 });
  }

  if (leads.length > 1000) {
    return NextResponse.json({ error: "Maximum 1000 leads per import" }, { status: 400 });
  }

  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i];
    const rowNum = i + 1;

    if (!row.business_name?.trim()) {
      results.skipped++;
      results.errors.push(`Row ${rowNum}: Missing business name — skipped`);
      continue;
    }

    const entityType = row.entity_type && VALID_ENTITY_TYPES.includes(row.entity_type)
      ? row.entity_type : null;
    const immediateNeed = row.immediate_need && VALID_IMMEDIATE_NEEDS.includes(row.immediate_need)
      ? row.immediate_need : null;

    const { data: account } = await supabaseAdmin
      .from("sales_accounts")
      .insert({
        business_name: row.business_name.trim(),
        contact_name: row.contact_name?.trim() || null,
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        address: row.address?.trim() || null,
        entity_type: entityType,
        assigned_to: user.id,
        created_by: user.id,
      })
      .select("id")
      .single();

    const { error } = await supabaseAdmin
      .from("sales_leads")
      .insert({
        business_name: row.business_name.trim(),
        contact_name: row.contact_name?.trim() || null,
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        address: row.address?.trim() || null,
        city: row.city?.trim() || null,
        state: row.state?.trim()?.toUpperCase() || null,
        source: row.source?.trim() || "csv_import",
        notes: row.notes?.trim() || null,
        do_not_call: !!row.do_not_call,
        entity_type: entityType,
        immediate_need: immediateNeed,
        created_by: user.id,
        assigned_to: user.id,
        account_id: account?.id || null,
      });

    if (error) {
      results.skipped++;
      results.errors.push(`Row ${rowNum} (${row.business_name}): ${error.message}`);
    } else {
      results.imported++;
    }
  }

  return NextResponse.json(results, { status: 201 });
}
