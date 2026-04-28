import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { createDocumentFromTemplate, sendDocument, waitForDocumentStatus } from "@/lib/pandadoc";
import {
  calculateLocationPrice,
  BusinessHours,
  MachinesRequested,
  PricingResult,
} from "@/lib/pricing/locationPricing";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 403 });
  }
  const { id: itemId } = await params;

  const { data: item } = await supabaseAdmin
    .from("pipeline_items")
    .select("*, sales_accounts(id, business_name, contact_name, email, phone, address), pipelines(id, name)")
    .eq("id", itemId)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }
  if (!item.location_id) {
    return NextResponse.json({ error: "No location linked to this pipeline item" }, { status: 422 });
  }
  if (!item.current_step_id) {
    return NextResponse.json({ error: "No current step" }, { status: 422 });
  }

  const { data: step } = await supabaseAdmin
    .from("pipeline_steps")
    .select("*")
    .eq("id", item.current_step_id)
    .single();

  if (!step?.pandadoc_preliminary_template_id) {
    return NextResponse.json(
      { error: "Step has no preliminary PandaDoc template configured" },
      { status: 422 }
    );
  }

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", item.location_id)
    .single();

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  // Auto-calculate pricing if missing or stale
  let pricing: PricingResult | null = null;
  const pricingStale =
    !location.pricing_calculated_at ||
    !location.pricing_score ||
    (location.updated_at && new Date(location.pricing_calculated_at) < new Date(location.updated_at));

  if (pricingStale && location.business_hours && location.machines_requested) {
    try {
      pricing = calculateLocationPrice({
        employees: location.employee_count ?? 0,
        foot_traffic: location.traffic_count ?? 0,
        business_hours: location.business_hours as BusinessHours,
        machines_requested: location.machines_requested as MachinesRequested,
      });
      await supabaseAdmin
        .from("locations")
        .update({
          pricing_score: pricing.total_score,
          pricing_tier: pricing.tier,
          pricing_price: pricing.price,
          pricing_calculated_at: new Date().toISOString(),
        })
        .eq("id", location.id);
    } catch {
      // Pricing calculation failed — continue without it
    }
  } else if (location.pricing_score != null) {
    pricing = {
      total_score: location.pricing_score,
      traffic_score: Math.min(((location.employee_count ?? 0) + (location.traffic_count ?? 0)) / 500 * 70, 70),
      hours_score: ({ low: 5, medium: 10, high: 15, "24/7": 20 } as Record<string, number>)[location.business_hours ?? "low"] ?? 5,
      machine_score: ({ 1: 3, 2: 6, 3: 8, 4: 10 } as Record<number, number>)[location.machines_requested ?? 1] ?? 3,
      tier: location.pricing_tier as 1 | 2 | 3 | 4 | 5,
      tier_label: `Tier ${location.pricing_tier}`,
      price: Number(location.pricing_price),
    };
  }

  const recipientEmail = item.sales_accounts?.email;
  const recipientName = item.sales_accounts?.contact_name || item.sales_accounts?.business_name || item.name;

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Linked account has no email — cannot send proposal" },
      { status: 422 }
    );
  }

  // Use pricing_price when available, otherwise fall back to step.payment_amount
  const effectivePrice = pricing?.price ?? step.payment_amount;

  try {
    const fields: Record<string, string> = {
      industry: location.industry || "",
      zip: location.zip || "",
      employee_count: String(location.employee_count || ""),
      traffic_count: String(location.traffic_count || ""),
      machine_type: location.machine_type || "",
      machines_requested: String(location.machines_requested || ""),
      business_hours: location.business_hours || "",
      customer_name: recipientName,
      customer_email: recipientEmail,
      customer_phone: item.sales_accounts?.phone || "",
      customer_address: item.sales_accounts?.address || "",
      business_name: item.sales_accounts?.business_name || "",
      location_name: location.location_name || "",
      location_address: location.address || "",
      location_phone: location.phone || "",
      decision_maker_name: location.decision_maker_name || "",
      decision_maker_email: location.decision_maker_email || "",
    };

    if (pricing) {
      fields.ProposalPrice = String(pricing.price);
      fields.ProposalTier = pricing.tier_label;
      fields.ProposalScore = String(pricing.total_score);
      fields.TrafficScore = String(pricing.traffic_score);
      fields.HoursScore = String(pricing.hours_score);
      fields.MachineScore = String(pricing.machine_score);
    }

    if (effectivePrice) {
      fields.payment_amount = String(effectivePrice);
    }

    const pricingTables = effectivePrice
      ? [
          {
            name: "Quote 1",
            options: { currency: "USD" },
            sections: [
              {
                title: "Location Placement",
                default: true,
                rows: [
                  {
                    options: { optional: false, optional_selected: true, qty_editable: false },
                    data: {
                      name: "Location Placement",
                      description: location.machine_type
                        ? `${location.machine_type} — ${location.machines_requested || 1} machine(s)`
                        : `${location.machines_requested || 1} machine(s)`,
                      price: Number(effectivePrice),
                      qty: 1,
                    },
                  },
                ],
              },
            ],
          },
        ]
      : undefined;

    const doc = await createDocumentFromTemplate({
      templateId: step.pandadoc_preliminary_template_id,
      documentName: `Location Proposal — ${item.name}`,
      recipientEmail,
      recipientName,
      fields,
      pricing_tables: pricingTables,
    });

    // Wait for PandaDoc to finish processing before sending
    await waitForDocumentStatus(doc.id, "document.draft");
    const nameParts = recipientName.split(" ");
    await sendDocument(doc.id, "Please review this location placement proposal.", {
      email: recipientEmail,
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(" ") || "",
    });

    // Create esign_documents record
    await supabaseAdmin.from("esign_documents").insert({
      pipeline_item_id: itemId,
      step_id: item.current_step_id,
      provider: "pandadoc",
      external_document_id: doc.id,
      template_id: step.pandadoc_preliminary_template_id,
      document_name: `Location Proposal — ${item.name}`,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      status: "sent",
      sent_at: new Date().toISOString(),
      metadata: { type: "preliminary_proposal", location_id: item.location_id },
    });

    // Create pending payment record if payment is required via PandaDoc+Stripe
    if (step.requires_payment && step.payment_provider === "pandadoc_stripe" && effectivePrice) {
      await supabaseAdmin.from("pipeline_payments").insert({
        pipeline_item_id: itemId,
        step_id: item.current_step_id,
        provider: "stripe",
        amount: effectivePrice,
        currency: "USD",
        description: step.payment_description || `Proposal payment — ${item.name}`,
        status: "pending",
        metadata: { via: "pandadoc_stripe", pandadoc_document_id: doc.id },
      });
    }

    // Update proposal status
    await supabaseAdmin
      .from("pipeline_items")
      .update({ proposal_status: "proposal_sent", updated_at: new Date().toISOString() })
      .eq("id", itemId);

    return NextResponse.json({
      ok: true,
      pandadoc_document_id: doc.id,
      proposal_status: "proposal_sent",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
