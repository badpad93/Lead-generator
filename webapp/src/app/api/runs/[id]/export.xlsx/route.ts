import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ExcelJS from "exceljs";

const COLUMNS = [
  { header: "Industry", key: "industry", width: 20 },
  { header: "Business Name", key: "business_name", width: 30 },
  { header: "Address", key: "address", width: 30 },
  { header: "City", key: "city", width: 15 },
  { header: "State", key: "state", width: 8 },
  { header: "Zip", key: "zip", width: 10 },
  { header: "Phone", key: "phone", width: 18 },
  { header: "Website", key: "website", width: 30 },
  { header: "Employee Count", key: "employee_count", width: 15 },
  { header: "Customer Count", key: "customer_count", width: 15 },
  { header: "Decision Maker", key: "decision_maker", width: 20 },
  { header: "Contacted Date", key: "contacted_date", width: 15 },
  { header: "Notes", key: "notes", width: 25 },
  { header: "Source URL", key: "source_url", width: 30 },
  { header: "Distance (mi)", key: "distance_miles", width: 14 },
  { header: "Confidence", key: "confidence", width: 12 },
];

/** GET /api/runs/[id]/export.xlsx */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fetch run for filename
  const { data: run } = await supabaseAdmin
    .from("runs")
    .select("city, state, radius_miles")
    .eq("id", id)
    .single();

  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("run_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.columns = COLUMNS;

  // Style header row
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4285F4" },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const lead of leads ?? []) {
    sheet.addRow(lead);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const city = run?.city ?? "unknown";
  const state = run?.state ?? "XX";
  const radius = run?.radius_miles ?? 0;
  const filename = `leads_${city}_${state}_${radius}_run_${id.substring(0, 8)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
