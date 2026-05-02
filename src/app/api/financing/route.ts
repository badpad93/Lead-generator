import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";
const NOTIFY_EMAIL = process.env.FINANCING_NOTIFY_EMAIL || "james@apexaivending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "You must be logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (!body.full_name || !body.email || !body.phone) {
    return NextResponse.json({ error: "Full name, email, and phone are required" }, { status: 400 });
  }
  if (!body.agreed_provide_docs || !body.agreed_accurate_info) {
    return NextResponse.json({ error: "You must agree to both attestations" }, { status: 400 });
  }

  const { data: application, error: insertErr } = await supabaseAdmin
    .from("financing_applications")
    .insert({
      user_id: userId,
      full_name: body.full_name,
      email: body.email,
      phone: body.phone,
      date_of_birth: body.date_of_birth || null,
      citizenship_status: body.citizenship_status || null,
      credit_score_range: body.credit_score_range || null,
      net_worth_range: body.net_worth_range || null,
      annual_income: body.annual_income || null,
      has_verifiable_income: !!body.has_verifiable_income,
      has_tax_liens: !!body.has_tax_liens,
      has_bankruptcy: !!body.has_bankruptcy,
      has_judgments: !!body.has_judgments,
      has_felony: !!body.has_felony,
      has_legal_actions: !!body.has_legal_actions,
      has_federal_debt: !!body.has_federal_debt,
      agreed_provide_docs: !!body.agreed_provide_docs,
      agreed_accurate_info: !!body.agreed_accurate_info,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[financing] Failed to save application:", insertErr.message);
    return NextResponse.json({ error: `Failed to save application: ${insertErr.message}` }, { status: 500 });
  }

  // Auto-create CRM account + lead for the financing applicant
  let crmAccountId: string | null = null;
  let crmLeadId: string | null = null;
  try {
    const { data: account } = await supabaseAdmin
      .from("sales_accounts")
      .insert({
        business_name: body.business_name || body.full_name,
        contact_name: body.full_name,
        phone: body.phone,
        email: body.email,
        entity_type: "operator",
      })
      .select("id")
      .single();

    if (account) {
      crmAccountId = account.id;

      const notes = [
        `Source: SBA Financing Application`,
        `Credit Score: ${body.credit_score_range || "Not provided"}`,
        `Net Worth: ${body.net_worth_range || "Not provided"}`,
        `Annual Income: ${body.annual_income || "Not provided"}`,
        `Citizenship: ${body.citizenship_status || "Not provided"}`,
        `Verifiable Income: ${body.has_verifiable_income ? "Yes" : "No"}`,
        `Tax Liens: ${body.has_tax_liens ? "Yes" : "No"}`,
        `Bankruptcy: ${body.has_bankruptcy ? "Yes" : "No"}`,
        `Judgments: ${body.has_judgments ? "Yes" : "No"}`,
      ].join("\n");

      const { data: lead } = await supabaseAdmin
        .from("sales_leads")
        .insert({
          business_name: body.business_name || body.full_name,
          contact_name: body.full_name,
          phone: body.phone,
          email: body.email,
          entity_type: "operator",
          source: "financing_application",
          status: "qualified",
          account_id: account.id,
          notes,
        })
        .select("id")
        .single();

      if (lead) crmLeadId = lead.id;
    }
  } catch (crmErr) {
    console.error("[financing] Failed to create CRM records:", crmErr);
  }

  const yesNo = (v: boolean) => (v ? "Yes" : "No");

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `New SBA Financing Application — ${body.full_name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#16a34a;border-bottom:2px solid #16a34a;padding-bottom:8px">
            New SBA Financing Pre-Qualification
          </h2>

          <h3 style="color:#333;margin-top:20px">Applicant Information</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 12px;font-weight:bold;width:40%">Name</td><td style="padding:6px 12px">${body.full_name}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px 12px;font-weight:bold">Email</td><td style="padding:6px 12px">${body.email}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Phone</td><td style="padding:6px 12px">${body.phone}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px 12px;font-weight:bold">Date of Birth</td><td style="padding:6px 12px">${body.date_of_birth || "—"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Citizenship</td><td style="padding:6px 12px">${body.citizenship_status || "—"}</td></tr>
          </table>

          <h3 style="color:#333;margin-top:20px">Financial &amp; Credit Information</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 12px;font-weight:bold;width:40%">Credit Score Range</td><td style="padding:6px 12px">${body.credit_score_range || "—"}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px 12px;font-weight:bold">Net Worth Range</td><td style="padding:6px 12px">${body.net_worth_range || "—"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Annual Income</td><td style="padding:6px 12px">${body.annual_income || "—"}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px 12px;font-weight:bold">Verifiable Income</td><td style="padding:6px 12px">${yesNo(body.has_verifiable_income)}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Outstanding Tax Liens</td><td style="padding:6px 12px">${yesNo(body.has_tax_liens)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px 12px;font-weight:bold">Bankruptcy (Last 7 Years)</td><td style="padding:6px 12px">${yesNo(body.has_bankruptcy)}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Outstanding Judgments</td><td style="padding:6px 12px">${yesNo(body.has_judgments)}</td></tr>
          </table>

          <h3 style="color:#333;margin-top:20px">Background &amp; Declarations</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 12px;font-weight:bold;width:40%">Felony Conviction</td><td style="padding:6px 12px">${yesNo(body.has_felony)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px 12px;font-weight:bold">Current Legal Actions</td><td style="padding:6px 12px">${yesNo(body.has_legal_actions)}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Delinquent Federal Debt</td><td style="padding:6px 12px">${yesNo(body.has_federal_debt)}</td></tr>
          </table>

          <p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
            Application ID: ${application.id}<br>
            Submitted: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}
          </p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error("[financing] Failed to send notification email:", emailErr);
  }

  return NextResponse.json({ success: true, applicationId: application.id, crmAccountId, crmLeadId });
}

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("financing_applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return NextResponse.json(data || []);
}
