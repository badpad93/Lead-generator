import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/smart-coolers/orders — machine purchases for the admin
 * "Machine Orders" tab: contact, delivery address + options + itemized fees,
 * status, QB invoice id, and any attached coffee-service lead. Read-only.
 */

interface CoffeeLead {
  purchase_id: string | null;
  business_name: string | null;
  num_locations: string | null;
  estimated_volume: string | null;
  notes: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  items: unknown;
  total_cents: number | null;
}

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: purchases, error } = await supabaseAdmin
    .from("smart_cooler_purchases")
    .select("*, smart_cooler_machines(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (purchases || []).map((p) => String(p.id));
  const leadByPurchase = await loadCoffeeLeads(ids);

  const orders = (purchases || []).map((p) => {
    const machine = p.smart_cooler_machines as { name?: string } | null;
    return {
      ...p,
      machine_name: machine?.name ?? null,
      coffee_lead: leadByPurchase[String(p.id)] ?? null,
    };
  });

  return NextResponse.json({ orders });
}

/** Map purchase id → its coffee lead (if any). */
async function loadCoffeeLeads(purchaseIds: string[]): Promise<Record<string, CoffeeLead>> {
  if (purchaseIds.length === 0) return {};
  const { data } = await supabaseAdmin
    .from("smart_cooler_coffee_leads")
    .select("*")
    .in("purchase_id", purchaseIds);
  const map: Record<string, CoffeeLead> = {};
  for (const row of data || []) {
    const key = String((row as CoffeeLead).purchase_id);
    map[key] = row as CoffeeLead;
  }
  return map;
}
