import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("coffee_orders")
      .select("*, profiles!operator_id(id, full_name, email), coffee_order_items(*)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }

    const validStatuses = ["awaiting_payment", "pending", "processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Snapshot the prior status so we only fire the shipped email on
    // the actual transition — not every subsequent PATCH that keeps
    // status='shipped' (edits to tracking, retries, etc.).
    const { data: before } = await supabaseAdmin
      .from("coffee_orders")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const wasShipped = before?.status === "shipped";

    const { data, error } = await supabaseAdmin
      .from("coffee_orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, profiles!operator_id(id, full_name, email), coffee_order_items(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fire-and-forget: never let email failure block the admin's
    // status change from persisting.
    if (status === "shipped" && !wasShipped) {
      notifyOperatorShipped(data).catch((err) => {
        console.error("[admin.coffee.orders] shipped notification failed:", err);
      });
    }

    // Inventory ledger effects — Phase 2. Physical stock movement is
    // tied to the shipped state:
    //   entering shipped  → post consumption per line
    //   shipped → cancelled → reverse the consumption
    // Idempotent via reference_type='coffee_order'+reference_id
    // dedup in the helper, so any subsequent PATCH that keeps status
    // the same is a no-op on the ledger. All fire-and-forget with
    // logging — never blocks the admin's status change.
    if (status === "shipped" && !wasShipped) {
      import("@/lib/inventory/coffeeOrderConsumption")
        .then(({ postConsumptionForCoffeeOrder }) => postConsumptionForCoffeeOrder(id, adminId))
        .then((result) => {
          if (result.skippedNoSku.length > 0) {
            console.warn(
              "[admin.coffee.orders] some order lines had no inventory SKU:",
              result.skippedNoSku,
            );
          }
        })
        .catch((err) => {
          console.error("[admin.coffee.orders] consumption dispatch failed:", err);
        });
    } else if (status === "cancelled" && wasShipped) {
      import("@/lib/inventory/coffeeOrderConsumption")
        .then(({ reverseConsumptionForCoffeeOrder }) =>
          reverseConsumptionForCoffeeOrder(id, adminId),
        )
        .catch((err) => {
          console.error("[admin.coffee.orders] reversal dispatch failed:", err);
        });
    }

    return NextResponse.json({ order: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface OrderWithItemsForEmail {
  id: string;
  order_number?: string | null;
  total?: number | string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
  coffee_order_items?: Array<{
    product_name?: string | null;
    quantity?: number | null;
  }> | null;
}

async function notifyOperatorShipped(order: OrderWithItemsForEmail): Promise<void> {
  const email = order?.profiles?.email;
  if (!email) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[admin.coffee.orders] RESEND_API_KEY missing — skipping shipped email");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const orderRef = String(order.order_number ?? order.id.slice(0, 8));
  const totalDollars = Number(order.total ?? 0).toFixed(2);

  const itemRows = (order.coffee_order_items ?? [])
    .map((i) =>
      `<tr>
        <td style="padding:6px 12px 6px 0;color:#374151">${escapeHtml(i.product_name ?? "Item")}</td>
        <td style="padding:6px 0;color:#6b7280;text-align:right">×${Number(i.quantity ?? 1)}</td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111827">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="color:#16a34a;margin:0;font-size:22px">Vending Connector</h1>
      </div>
      <h2 style="font-size:18px;margin:0 0 12px">Your coffee order has shipped</h2>
      <p style="font-size:14px;line-height:1.6;color:#374151">
        Good news, ${escapeHtml(order.profiles?.full_name ?? "there")} — your coffee order
        <strong>#${escapeHtml(orderRef)}</strong> is on its way.
      </p>
      ${itemRows ? `<table style="width:100%;margin-top:16px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;font-size:13px">${itemRows}</table>` : ""}
      <p style="font-size:14px;color:#374151;margin-top:16px">Order total: <strong>$${totalDollars}</strong></p>
      <p style="margin-top:24px">
        <a href="${site}/coffee/orders/${order.id}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
          View order
        </a>
      </p>
      <p style="font-size:12px;color:#9ca3af;margin-top:32px">
        Order reference: ${escapeHtml(String(order.id))}
      </p>
    </div>
  `;

  await resend.emails.send({
    from,
    to: email,
    subject: `Your coffee order #${orderRef} has shipped`,
    html,
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
