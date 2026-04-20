import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

interface AISummaryInput {
  deal_id: string;
  form_data?: Record<string, unknown>;
  scores?: {
    deal_quality_score: number;
    intent_score: number;
    budget_score: number;
    readiness_score: number;
    upsell_score: number;
  };
}

function generateSummary(data: Record<string, unknown>, scores: AISummaryInput["scores"]) {
  const services = (data.services_needed as string[]) || [];
  const budget = data.budget_range as string || "unknown";
  const timeline = data.timeline as string || "unknown";
  const businessName = data.business_name as string || data.full_name as string || "Unknown";
  const isDecisionMaker = data.is_decision_maker !== false;
  const hasVending = data.has_vending_currently as boolean;
  const painPoints = data.pain_points as string || "";
  const qualityScore = scores?.deal_quality_score || 0;

  // Summary
  const serviceStr = services.length > 0 ? services.join(", ") : "general inquiry";
  let summary = `${businessName} is interested in ${serviceStr}.`;
  if (hasVending) summary += " They currently have vending operations.";
  if (budget !== "unknown") summary += ` Budget range: ${budget.replace(/_/g, " ")}.`;
  if (timeline !== "unknown") summary += ` Timeline: ${timeline.replace(/_/g, " ")}.`;

  // Risks
  const risks: string[] = [];
  if (!isDecisionMaker) risks.push("Not the decision maker — requires approval from another party.");
  if (budget === "under_5k") risks.push("Low budget may not support requested services.");
  if (timeline === "exploring" || timeline === "no_rush") risks.push("No urgency — risk of going cold.");
  if (services.length === 0) risks.push("No specific services identified — needs discovery.");
  if (painPoints && painPoints.toLowerCase().includes("cost")) risks.push("Price sensitivity detected in pain points.");

  // Next step
  let nextStep = "Schedule discovery call within 24 hours.";
  if (qualityScore >= 80) {
    nextStep = "Priority lead. Assign senior rep and schedule call within 2 hours.";
  } else if (qualityScore >= 60) {
    nextStep = "Warm lead. Send personalized follow-up email, then call within 4 hours.";
  } else if (qualityScore < 30) {
    nextStep = "Low priority. Add to nurture sequence. Follow up in 3-5 days.";
  }
  if (!isDecisionMaker) {
    nextStep += " Get decision maker on next call.";
  }

  // Recommended bundle
  let bundle = "Custom package based on discovery.";
  if (services.includes("location") && services.includes("machine")) {
    bundle = "Total Operator Package — location + machine + setup. Offer 15% bundle discount.";
  } else if (services.includes("location")) {
    bundle = "Location Services + Digital Presence bundle. Upsell web/SEO for location visibility.";
  } else if (services.includes("machine") && services.includes("financing")) {
    bundle = "Machine + Financing bundle. Offer $0-down financing promotion.";
  } else if (services.length >= 3) {
    bundle = "Total Operator Package. Client has broad needs — bundle all services at 15% off.";
  }

  return { summary, risks, nextStep, bundle };
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: AISummaryInput = await req.json();
  const { deal_id, form_data, scores } = body;

  if (!deal_id) {
    return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
  }

  // If no form_data provided, fetch from intake_leads
  let data = form_data;
  if (!data) {
    const { data: intake } = await supabaseAdmin
      .from("intake_leads")
      .select("*")
      .eq("deal_id", deal_id)
      .maybeSingle();
    data = intake || {};
  }

  // If no scores provided, fetch from deal
  let dealScores = scores;
  if (!dealScores) {
    const { data: deal } = await supabaseAdmin
      .from("sales_deals")
      .select("deal_quality_score, intent_score, budget_score, readiness_score, upsell_score")
      .eq("id", deal_id)
      .single();
    if (deal) {
      dealScores = {
        deal_quality_score: deal.deal_quality_score || 0,
        intent_score: deal.intent_score || 0,
        budget_score: deal.budget_score || 0,
        readiness_score: deal.readiness_score || 0,
        upsell_score: deal.upsell_score || 0,
      };
    }
  }

  const { summary, risks, nextStep, bundle } = generateSummary(data || {}, dealScores);

  // Save to deal
  await supabaseAdmin
    .from("sales_deals")
    .update({
      ai_summary: summary,
      ai_next_step: nextStep,
      ai_risk_flags: risks,
    })
    .eq("id", deal_id);

  return NextResponse.json({
    deal_id,
    summary,
    risks,
    next_step: nextStep,
    recommended_bundle: bundle,
    scores: dealScores,
  });
}
