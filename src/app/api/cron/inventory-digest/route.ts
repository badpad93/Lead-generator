import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/cron/inventory-digest
 *
 * Weekly admin digest. Composes one email per active warehouse that
 * has a recent replenishment_runs row, sends it to every profiles.
 * role='admin' address. Content covers:
 *   - current recommended purchases (proposed / approved counts)
 *   - low-stock risks (recommended_qty > 0 lines)
 *   - open inbound aggregate
 *   - recommendations requiring review (proposed with low confidence)
 *   - forecast confidence rollup
 *   - significant changes from previous calculation (rec.qty delta
 *     > 25% for a SKU that had a prior recommendation)
 *
 * Auth: shared CRON_SECRET header pattern used by other crons.
 * Failure of any single email doesn't block the rest — each admin
 * gets tried independently.
 */

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
  }
  const resend = new Resend(apiKey);

  const { data: warehouses } = await supabaseAdmin
    .from("warehouses")
    .select("id, name, code")
    .eq("active", true)
    .order("name");

  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("role", "admin");
  const adminEmails = (admins ?? [])
    .map((a) => a.email)
    .filter((e): e is string => !!e && e.length > 0);

  if (adminEmails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: "no admin recipients" });
  }

  let composed = 0;
  const sections: string[] = [];

  for (const wh of warehouses ?? []) {
    const section = await composeWarehouseSection(wh.id, wh.name, wh.code);
    if (section) {
      sections.push(section);
      composed += 1;
    }
  }

  if (composed === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: "no runs to report" });
  }

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#111827">
      <div style="text-align:center;margin-bottom:20px">
        <h1 style="color:#16a34a;margin:0;font-size:22px">Weekly Inventory Digest</h1>
        <p style="font-size:12px;color:#6b7280;margin:4px 0 0">${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
      ${sections.join("\n")}
      <p style="font-size:11px;color:#9ca3af;margin-top:24px;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px">
        Open the review screen: <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://vendingconnector.com"}/admin/inventory" style="color:#16a34a">/admin/inventory</a>
      </p>
    </div>
  `;

  let sent = 0;
  const failures: string[] = [];
  for (const email of adminEmails) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Inventory digest — ${new Date().toLocaleDateString()}`,
        html,
      });
      sent += 1;
    } catch (err) {
      failures.push(`${email}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    warehouses_covered: composed,
    admins_targeted: adminEmails.length,
    sent,
    failures,
  });
}

// ─── Compose one warehouse section ────────────────────────────────

async function composeWarehouseSection(
  warehouseId: string,
  warehouseName: string,
  warehouseCode: string | null,
): Promise<string | null> {
  // Two most-recent runs so we can diff.
  const { data: runs } = await supabaseAdmin
    .from("replenishment_runs")
    .select("id, as_of_date, created_at")
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false })
    .limit(2);
  const [current, previous] = (runs ?? []) as Array<{
    id: string;
    as_of_date: string;
    created_at: string;
  }>;
  if (!current) return null;

  const { data: recsRaw } = await supabaseAdmin
    .from("replenishment_recommendations")
    .select("*, inventory_skus:sku_id(sku_code, name)")
    .eq("run_id", current.id);
  const recs = (recsRaw ?? []) as Array<{
    sku_id: string;
    recommended_qty: number;
    open_inbound_at_run: number;
    on_hand_at_run: number;
    confidence: string;
    status: string;
    flags: string[];
    inventory_skus: { sku_code: string; name: string } | null;
  }>;

  const proposed = recs.filter((r) => r.status === "proposed").length;
  const approved = recs.filter((r) => r.status === "approved").length;
  const ordered = recs.filter((r) => r.status === "ordered").length;
  const ignored = recs.filter((r) => r.status === "ignored").length;
  const needOrder = recs.filter((r) => Number(r.recommended_qty) > 0);
  const openInboundTotal = recs.reduce((s, r) => s + Number(r.open_inbound_at_run ?? 0), 0);
  const lowConfProposed = recs.filter(
    (r) => r.status === "proposed" && r.confidence === "low",
  ).length;

  // Confidence rollup for the run.
  const confHigh = recs.filter((r) => r.confidence === "high").length;
  const confMed = recs.filter((r) => r.confidence === "medium").length;
  const confLow = recs.filter((r) => r.confidence === "low").length;

  // Significant changes vs previous run.
  let changesHtml = "";
  if (previous) {
    const { data: prevRecs } = await supabaseAdmin
      .from("replenishment_recommendations")
      .select("sku_id, recommended_qty")
      .eq("run_id", previous.id);
    const prevByKey = new Map<string, number>();
    for (const p of (prevRecs ?? []) as Array<{ sku_id: string; recommended_qty: number }>) {
      prevByKey.set(p.sku_id, Number(p.recommended_qty));
    }
    const significant = recs
      .map((r) => {
        const prior = prevByKey.get(r.sku_id);
        if (prior === undefined) return null;
        const current = Number(r.recommended_qty);
        if (prior === 0 && current === 0) return null;
        const denom = Math.max(prior, current, 1);
        const deltaPct = (current - prior) / denom;
        if (Math.abs(deltaPct) < 0.25) return null;
        return { rec: r, prior, current, deltaPct };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
      .slice(0, 10);
    if (significant.length > 0) {
      changesHtml = `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">Significant changes vs previous run</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            ${significant
              .map(
                (s) =>
                  `<tr>
                    <td style="padding:2px 8px 2px 0;color:#4b5563">${escape(s.rec.inventory_skus?.name ?? s.rec.sku_id.slice(0, 8))}</td>
                    <td style="padding:2px 0;color:#111827;text-align:right">${s.prior} → ${s.current}</td>
                    <td style="padding:2px 0 2px 8px;color:${s.deltaPct > 0 ? "#dc2626" : "#059669"};text-align:right">${(s.deltaPct * 100).toFixed(0)}%</td>
                  </tr>`,
              )
              .join("")}
          </table>
        </div>
      `;
    }
  }

  // Top 5 highest recommended orders.
  const topOrders = [...recs]
    .filter((r) => Number(r.recommended_qty) > 0 && r.status !== "ignored" && r.status !== "superseded")
    .sort((a, b) => Number(b.recommended_qty) - Number(a.recommended_qty))
    .slice(0, 5);

  return `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h2 style="font-size:16px;margin:0;color:#111827">${escape(warehouseName)} ${warehouseCode ? `<span style="color:#9ca3af;font-weight:400;font-size:12px">(${escape(warehouseCode)})</span>` : ""}</h2>
        <span style="font-size:11px;color:#6b7280">Run: ${escape(current.as_of_date)}</span>
      </div>
      <div style="display:flex;gap:12px;margin:12px 0;font-size:12px;flex-wrap:wrap">
        <span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:999px">Proposed <strong>${proposed}</strong></span>
        <span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:999px">Approved <strong>${approved}</strong></span>
        <span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:999px">Ordered <strong>${ordered}</strong></span>
        <span style="background:#f3f4f6;color:#4b5563;padding:2px 8px;border-radius:999px">Ignored <strong>${ignored}</strong></span>
      </div>
      <div style="font-size:12px;color:#4b5563;margin-bottom:8px">
        Lines needing order: <strong>${needOrder.length}</strong>
        · Open inbound total: <strong>${openInboundTotal.toFixed(0)}</strong> units
        · Requiring review (low confidence proposed): <strong>${lowConfProposed}</strong>
      </div>
      <div style="font-size:11px;color:#6b7280">
        Confidence — High: ${confHigh} · Medium: ${confMed} · Low: ${confLow}
      </div>
      ${
        topOrders.length > 0
          ? `<div style="margin-top:12px">
              <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">Top recommended orders</div>
              <table style="width:100%;font-size:12px;border-collapse:collapse">
                ${topOrders
                  .map(
                    (r) => `<tr>
                      <td style="padding:2px 8px 2px 0;color:#4b5563">${escape(r.inventory_skus?.name ?? r.inventory_skus?.sku_code ?? r.sku_id.slice(0, 8))}</td>
                      <td style="padding:2px 0;color:#111827;text-align:right">${Number(r.recommended_qty)}</td>
                      <td style="padding:2px 0 2px 8px;color:#6b7280;font-size:11px">${escape(r.confidence)}</td>
                    </tr>`,
                  )
                  .join("")}
              </table>
            </div>`
          : ""
      }
      ${changesHtml}
    </div>
  `;
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no gate configured → dev
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    req.nextUrl.searchParams.get("secret");
  return provided === secret;
}
