import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/sales-accounts/duplicates
 *
 * Lists candidate duplicate clusters grouped by normalized_email first,
 * then by (normalized_business_name + normalized_phone). For each row
 * in a cluster returns quick counts of what would move if it were
 * absorbed — quotes, orders, deals, workflows — so the admin has
 * enough context to pick a canonical row without opening N tabs.
 *
 * Purely read-only. Nothing writes. Nothing touches customer data.
 */

interface AccountRow {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  normalized_email: string | null;
  normalized_business_name: string | null;
  normalized_phone: string | null;
  created_at: string;
  deleted_at: string | null;
}

interface RowWithCounts extends AccountRow {
  quote_count: number;
  order_count: number;
  paid_order_count: number;
  deal_count: number;
  workflow_count: number;
}

interface Cluster {
  key: string;
  match_type: "email" | "name+phone";
  rows: RowWithCounts[];
}

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Pull every non-deleted sales_accounts row + its normalized fields.
  const { data: accounts, error } = await supabaseAdmin
    .from("sales_accounts")
    .select("id, business_name, contact_name, email, phone, address, normalized_email, normalized_business_name, normalized_phone, created_at, deleted_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (accounts ?? []) as AccountRow[];

  // Group by normalized_email (if present + non-blank) — highest confidence.
  const byEmail = new Map<string, AccountRow[]>();
  const seenInEmailCluster = new Set<string>();
  for (const r of rows) {
    if (!r.normalized_email) continue;
    const list = byEmail.get(r.normalized_email) ?? [];
    list.push(r);
    byEmail.set(r.normalized_email, list);
  }
  const emailClusters: Cluster[] = [];
  for (const [key, list] of byEmail) {
    if (list.length < 2) continue;
    emailClusters.push({ key, match_type: "email", rows: list as RowWithCounts[] });
    for (const r of list) seenInEmailCluster.add(r.id);
  }

  // Group remaining rows by (normalized_business_name, normalized_phone).
  // Rows already appearing in an email cluster are skipped so the same
  // row doesn't show up under two clusters.
  const byNamePhone = new Map<string, AccountRow[]>();
  for (const r of rows) {
    if (seenInEmailCluster.has(r.id)) continue;
    if (!r.normalized_business_name) continue;
    const key = `${r.normalized_business_name}|${r.normalized_phone ?? ""}`;
    const list = byNamePhone.get(key) ?? [];
    list.push(r);
    byNamePhone.set(key, list);
  }
  const namePhoneClusters: Cluster[] = [];
  for (const [key, list] of byNamePhone) {
    if (list.length < 2) continue;
    namePhoneClusters.push({ key, match_type: "name+phone", rows: list as RowWithCounts[] });
  }

  // Enrich every clustered row with FK counts so the admin can eyeball
  // which is the "real" canonical (has the paid orders, has the workflow,
  // etc.).
  const allClusters = [...emailClusters, ...namePhoneClusters];
  const idsInClusters = Array.from(new Set(allClusters.flatMap((c) => c.rows.map((r) => r.id))));
  if (idsInClusters.length > 0) {
    // Batched count queries. Each returns { account_id, count } grouped.
    const [ordersRes, dealsRes, workflowsRes] = await Promise.all([
      supabaseAdmin
        .from("sales_orders")
        .select("account_id, document_type, payment_status, status, order_status")
        .in("account_id", idsInClusters),
      supabaseAdmin
        .from("sales_deals")
        .select("account_id")
        .in("account_id", idsInClusters),
      supabaseAdmin
        .from("workflows")
        .select("company_id")
        .in("company_id", idsInClusters),
    ]);

    const quoteByAcct = new Map<string, number>();
    const orderByAcct = new Map<string, number>();
    const paidByAcct = new Map<string, number>();
    for (const r of (ordersRes.data ?? []) as Array<{ account_id: string; document_type: string | null; payment_status: string | null; status: string | null; order_status: string | null }>) {
      if (r.document_type === "quote") {
        quoteByAcct.set(r.account_id, (quoteByAcct.get(r.account_id) ?? 0) + 1);
      } else {
        orderByAcct.set(r.account_id, (orderByAcct.get(r.account_id) ?? 0) + 1);
        if (r.payment_status === "paid" || r.status === "completed" || r.order_status === "completed") {
          paidByAcct.set(r.account_id, (paidByAcct.get(r.account_id) ?? 0) + 1);
        }
      }
    }
    const dealByAcct = new Map<string, number>();
    for (const r of (dealsRes.data ?? []) as Array<{ account_id: string }>) {
      dealByAcct.set(r.account_id, (dealByAcct.get(r.account_id) ?? 0) + 1);
    }
    const wfByAcct = new Map<string, number>();
    for (const r of (workflowsRes.data ?? []) as Array<{ company_id: string }>) {
      wfByAcct.set(r.company_id, (wfByAcct.get(r.company_id) ?? 0) + 1);
    }

    for (const c of allClusters) {
      for (const r of c.rows) {
        r.quote_count = quoteByAcct.get(r.id) ?? 0;
        r.order_count = orderByAcct.get(r.id) ?? 0;
        r.paid_order_count = paidByAcct.get(r.id) ?? 0;
        r.deal_count = dealByAcct.get(r.id) ?? 0;
        r.workflow_count = wfByAcct.get(r.id) ?? 0;
      }
    }
  }

  return NextResponse.json({
    clusters: allClusters,
    total_clusters: allClusters.length,
    total_accounts_flagged: idsInClusters.length,
  });
}
