import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import {
  calculateLocationPrice,
  BusinessHours,
  MachinesRequested,
  PricingResult,
} from "@/lib/pricing/locationPricing";
import { generateAgreementPdf } from "@/lib/pdf/agreementPdf";
import { sendAgreementEmail } from "@/lib/agreementEmail";

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
}

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

  if (!step) {
    return NextResponse.json({ error: "Step not found" }, { status: 422 });
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

  if (!pricing) {
    return NextResponse.json(
      { error: "Pricing not available — ensure location has business hours and machines requested" },
      { status: 422 }
    );
  }

  const recipientEmail = item.sales_accounts?.email;
  const recipientName = item.sales_accounts?.contact_name || item.sales_accounts?.business_name || item.name;

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Linked account has no email — cannot send agreement" },
      { status: 422 }
    );
  }

  try {
    // Create agreement token record
    const { data: agreement, error: agreeErr } = await supabaseAdmin
      .from("agreement_tokens")
      .insert({
        pipeline_item_id: itemId,
        step_id: item.current_step_id,
        location_id: item.location_id,
        account_id: item.account_id,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        industry: location.industry || null,
        zip: location.zip || null,
        pricing_score: pricing.total_score,
        pricing_tier: pricing.tier,
        pricing_price: pricing.price,
        status: "pending",
      })
      .select("id, token")
      .single();

    if (agreeErr || !agreement) {
      return NextResponse.json({ error: `Failed to create agreement: ${agreeErr?.message}` }, { status: 500 });
    }

    const agreementUrl = `${getSiteUrl()}/agreements/${agreement.token}`;

    // Generate agreement PDF
    const pdfBytes = await generateAgreementPdf({
      businessName: item.sales_accounts?.business_name || item.name,
      contactName: recipientName,
      industry: location.industry || "",
      zip: location.zip || "",
      pricing,
      agreementUrl,
      generatedAt: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    });

    // Upload PDF to storage
    const pdfPath = `agreements/${agreement.id}.pdf`;
    await supabaseAdmin.storage
      .from("sales-documents")
      .upload(pdfPath, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });

    const { data: urlData } = supabaseAdmin.storage.from("sales-documents").getPublicUrl(pdfPath);

    await supabaseAdmin
      .from("agreement_tokens")
      .update({ pdf_url: urlData.publicUrl })
      .eq("id", agreement.id);

    // Send agreement email
    await sendAgreementEmail({
      to: recipientEmail,
      recipientName,
      businessName: item.sales_accounts?.business_name || item.name,
      price: pricing.price,
      agreementUrl,
      pdfBuffer: pdfBytes,
    });

    // Create esign_documents record for gating compatibility
    await supabaseAdmin.from("esign_documents").insert({
      pipeline_item_id: itemId,
      step_id: item.current_step_id,
      provider: "inhouse",
      external_document_id: agreement.id,
      template_id: null,
      document_name: `Location Placement Agreement — ${item.name}`,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      status: "sent",
      sent_at: new Date().toISOString(),
      metadata: { type: "preliminary_proposal", location_id: item.location_id, agreement_token: agreement.token },
    });

    // Create pending payment record
    if (step.requires_payment) {
      await supabaseAdmin.from("pipeline_payments").insert({
        pipeline_item_id: itemId,
        step_id: item.current_step_id,
        provider: "stripe",
        amount: pricing.price,
        currency: "USD",
        description: step.payment_description || `Location placement — ${item.name}`,
        status: "pending",
        metadata: { agreement_token_id: agreement.id },
      });
    }

    // Update proposal status
    await supabaseAdmin
      .from("pipeline_items")
      .update({ proposal_status: "proposal_sent", updated_at: new Date().toISOString() })
      .eq("id", itemId);

    return NextResponse.json({
      ok: true,
      agreement_id: agreement.id,
      agreement_url: agreementUrl,
      proposal_status: "proposal_sent",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
