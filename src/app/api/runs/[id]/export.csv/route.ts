import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CSV_COLUMNS = [
  "industry",
  "business_name",
  "address",
  "city",
  "state",
  "zip",
  "phone",
  "website",
  "employee_count",
  "customer_count",
  "decision_maker",
  "contacted_date",
  "notes",
  "source_url",
  "distance_miles",
  "confidence",
] as const;

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** GET /api/runs/[id]/export.csv */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("run_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = CSV_COLUMNS.join(",");
  const rows = (leads ?? []).map((lead) =>
    CSV_COLUMNS.map((col) => escapeCSV(lead[col])).join(",")
  );
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads_${id}.csv"`,
    },
  });
}
