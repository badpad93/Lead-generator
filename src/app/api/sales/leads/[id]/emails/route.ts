import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  initial_followup: {
    subject: "Following Up — {{business_name}}",
    body: `Hi {{contact_name}},

I wanted to follow up regarding our conversation about vending services for {{business_name}}. We'd love to help you find the right solution for your location.

Do you have a few minutes this week to chat? I'm happy to answer any questions or walk you through our options.

Best regards,
{{sender_name}}
Vending Connector`,
  },
  check_in: {
    subject: "Checking In — {{business_name}}",
    body: `Hi {{contact_name}},

Just checking in to see if you've had a chance to consider vending services for {{business_name}}. We have operators ready to serve your area and can get started quickly.

Let me know if you'd like to reconnect — happy to help however I can.

Best,
{{sender_name}}
Vending Connector`,
  },
  special_offer: {
    subject: "Limited Time Opportunity — {{business_name}}",
    body: `Hi {{contact_name}},

I wanted to reach out because we have operators actively looking for locations like {{business_name}} in your area. This is a great time to get set up — no cost to you, and machines can be placed within weeks.

Would you like to learn more? I'm available for a quick call at your convenience.

Best regards,
{{sender_name}}
Vending Connector`,
  },
  custom: {
    subject: "",
    body: "",
  },
};

function resolveMergeFields(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: leadId } = await params;

  const { data, error } = await supabaseAdmin
    .from("lead_emails")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: leadId } = await params;
  const body = await req.json();
  const { template, subject, email_body, to_email } = body;

  if (!to_email) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Subject required" }, { status: 400 });
  if (!email_body) return NextResponse.json({ error: "Email body required" }, { status: 400 });

  const { data: lead } = await supabaseAdmin
    .from("sales_leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const mergeVars: Record<string, string> = {
    business_name: lead.business_name || "",
    contact_name: lead.contact_name || lead.business_name || "there",
    email: lead.email || "",
    phone: lead.phone || "",
    sender_name: profile?.full_name || "Your Vending Connector Rep",
  };

  const resolvedSubject = resolveMergeFields(subject, mergeVars);
  const resolvedBody = resolveMergeFields(email_body, mergeVars);

  const htmlBody = resolvedBody
    .split("\n")
    .map((line: string) => (line.trim() === "" ? "<br/>" : `<p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">${line}</p>`))
    .join("");

  const { error: sendError } = await resend.emails.send({
    from: FROM,
    to: to_email,
    subject: resolvedSubject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        ${htmlBody}
      </div>
    `,
  });

  if (sendError) {
    return NextResponse.json({ error: `Failed to send: ${sendError.message}` }, { status: 500 });
  }

  const { error: dbError } = await supabaseAdmin.from("lead_emails").insert({
    lead_id: leadId,
    sent_by: user.id,
    to_email,
    subject: resolvedSubject,
    body: resolvedBody,
    template_name: template || "custom",
    status: "sent",
  });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
