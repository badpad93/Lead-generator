export interface GuidanceItem {
  id?: string;
  title: string;
  content: string;
  type: "strategy" | "script" | "risk" | "upsell";
  priority: number;
}

export interface GuidanceInput {
  form: "lead-intake" | "location-intake";
  section: string;
  field?: string;
  values: Record<string, unknown>;
  score?: number;
}

function matchesCondition(
  condition: Record<string, unknown>,
  values: Record<string, unknown>,
  score?: number
): boolean {
  if (!condition || Object.keys(condition).length === 0) return true;

  for (const [key, expected] of Object.entries(condition)) {
    if (key === "services_count_gte") {
      const services = (values.services_needed as string[]) || [];
      if (services.length < (expected as number)) return false;
    } else if (key === "has_service") {
      const services = (values.services_needed as string[]) || [];
      if (!services.includes(expected as string)) return false;
    } else if (key === "budget_range") {
      if (values.budget_range !== expected) return false;
    } else if (key === "timeline") {
      if (values.timeline !== expected) return false;
    } else if (key === "is_decision_maker") {
      if (values.is_decision_maker !== expected) return false;
    } else if (key === "machine_count_gte") {
      if ((values.machine_count as number) < (expected as number)) return false;
    } else if (key === "has_w9") {
      if (values.has_w9 !== expected) return false;
    } else if (key === "has_insurance") {
      if (values.has_insurance !== expected) return false;
    } else if (key === "score_gte") {
      if ((score || 0) < (expected as number)) return false;
    } else if (key === "score_lte") {
      if ((score || 0) > (expected as number)) return false;
    }
  }
  return true;
}

const STATIC_GUIDANCE: GuidanceItem[] = [
  // Lead Intake - Basic Info
  { title: "Build Rapport First", content: "Always use their name. Ask: \"What made you reach out today?\" — let them talk before pitching.", type: "script", priority: 10 },
  { title: "Verify Email Accuracy", content: "Confirm spelling. Business emails signal higher intent than gmail/yahoo.", type: "strategy", priority: 5 },

  // Lead Intake - Services (conditional)
  { title: "Multi-Service Bundle Opportunity", content: "When 3+ services selected, offer the Total Operator Package at a 15% discount.", type: "upsell", priority: 20 },
  { title: "Location Services Deep Dive", content: "Get specific: target zips, preferred location types, foot traffic needs. More detail = faster placement.", type: "strategy", priority: 15 },

  // Lead Intake - Budget
  { title: "Low Budget - Manage Expectations", content: "Under $5k limits options. Focus on 1 machine + location. Mention financing to expand what's possible.", type: "risk", priority: 15 },
  { title: "High Budget - VIP Treatment", content: "This is a whale. Offer dedicated account manager, priority placement, and custom package pricing.", type: "strategy", priority: 20 },
  { title: "Urgent Timeline - Strike Fast", content: "Client wants to move now. Skip lengthy discovery. Get them to order/contract within 48 hours.", type: "strategy", priority: 20 },

  // Location Intake - Placement
  { title: "Volume Placement - Priority Queue", content: "5+ machines qualifies for bulk location pricing and priority scouting.", type: "upsell", priority: 18 },
  { title: "Location Type Matters", content: "Offices/hospitals = highest revenue per machine. Apartments = volume play.", type: "strategy", priority: 10 },

  // Location Intake - Agreement
  { title: "Missing W9 - Potential Blocker", content: "No W9 means we cannot process placement. Guide them to IRS W9 form or offer compliance service ($199).", type: "risk", priority: 20 },
  { title: "No Insurance - Upsell Opportunity", content: "Required for most locations. Offer our vending insurance partner ($49/mo per location).", type: "upsell", priority: 15 },
];

export function getGuidance(input: GuidanceInput): GuidanceItem[] {
  const { form, section, values, score } = input;
  const items: GuidanceItem[] = [];

  // Section-specific static guidance
  if (form === "lead-intake") {
    if (section === "basic_info") {
      items.push(STATIC_GUIDANCE[0], STATIC_GUIDANCE[1]);
    }
    if (section === "services_needed") {
      const services = (values.services_needed as string[]) || [];
      if (services.length >= 3) items.push(STATIC_GUIDANCE[2]);
      if (services.includes("location")) items.push(STATIC_GUIDANCE[3]);
    }
    if (section === "budget_timeline") {
      if (values.budget_range === "under_5k") items.push(STATIC_GUIDANCE[4]);
      if (values.budget_range === "50k_plus") items.push(STATIC_GUIDANCE[5]);
      if (values.timeline === "immediately") items.push(STATIC_GUIDANCE[6]);
    }
  }

  if (form === "location-intake") {
    if (section === "placement_details") {
      if ((values.machine_count as number) >= 5) items.push(STATIC_GUIDANCE[7]);
      items.push(STATIC_GUIDANCE[8]);
    }
    if (section === "agreement_prep") {
      if (!values.has_w9) items.push(STATIC_GUIDANCE[9]);
      if (!values.has_insurance) items.push(STATIC_GUIDANCE[10]);
    }
  }

  // Score-based guidance
  if (score !== undefined) {
    if (score >= 80) {
      items.push({
        title: "High-Value Lead Detected",
        content: "Score 80+. Fast-track this client. Assign senior rep. Schedule call within 2 hours.",
        type: "strategy",
        priority: 25,
      });
    } else if (score <= 30) {
      items.push({
        title: "Low Score - Qualify Further",
        content: "Score under 30. Needs more discovery before investing heavy time. Ask about timeline and budget.",
        type: "risk",
        priority: 12,
      });
    }
  }

  return items.sort((a, b) => b.priority - a.priority);
}

export async function getGuidanceFromDB(
  supabase: { from: (table: string) => unknown },
  input: GuidanceInput
): Promise<GuidanceItem[]> {
  const { form, section, field, values, score } = input;

  const query = (supabase as ReturnType<typeof Object>).from("sop_guidance")
    .select("*")
    .eq("form_name", form)
    .eq("section", section)
    .eq("active", true)
    .order("priority", { ascending: false });

  if (field) {
    query.or(`field_name.eq.${field},field_name.is.null`);
  }

  const { data } = await query;
  if (!data) return getGuidance(input);

  const matched = (data as Array<{
    id: string;
    title: string;
    content: string;
    type: "strategy" | "script" | "risk" | "upsell";
    priority: number;
    trigger_condition: Record<string, unknown>;
  }>).filter((row) =>
    matchesCondition(row.trigger_condition || {}, values, score)
  );

  return matched.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    priority: row.priority,
  }));
}
